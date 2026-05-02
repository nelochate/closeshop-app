alter table public.orders
add column if not exists delivery_fee numeric(10, 2) not null default 0;

create or replace function public.calculate_order_delivery_distance_km(
  shop_latitude numeric,
  shop_longitude numeric,
  customer_latitude numeric,
  customer_longitude numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  earth_radius_km constant numeric := 6371;
  delta_latitude_radians numeric;
  delta_longitude_radians numeric;
  haversine_a numeric;
  haversine_c numeric;
begin
  if shop_latitude is null
    or shop_longitude is null
    or customer_latitude is null
    or customer_longitude is null then
    return null;
  end if;

  delta_latitude_radians := radians(customer_latitude - shop_latitude);
  delta_longitude_radians := radians(customer_longitude - shop_longitude);

  haversine_a := power(sin(delta_latitude_radians / 2), 2)
    + cos(radians(shop_latitude))
    * cos(radians(customer_latitude))
    * power(sin(delta_longitude_radians / 2), 2);

  haversine_c := 2 * atan2(sqrt(haversine_a), sqrt(1 - haversine_a));

  return round((earth_radius_km * haversine_c)::numeric, 2);
end;
$$;

create or replace function public.calculate_order_delivery_fee(distance_km numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  normalized_distance_km numeric;
  billable_additional_km integer;
begin
  if distance_km is null then
    return 30;
  end if;

  normalized_distance_km := round(greatest(distance_km, 0)::numeric, 2);

  if normalized_distance_km <= 3 then
    return 30;
  end if;

  if normalized_distance_km <= 6 then
    return 45;
  end if;

  if normalized_distance_km <= 10 then
    return 65;
  end if;

  billable_additional_km := greatest(0, ceil(normalized_distance_km - 10)::integer);

  return 80 + (billable_additional_km * 5);
end;
$$;

grant execute on function public.calculate_order_delivery_distance_km(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.calculate_order_delivery_fee(numeric) to authenticated;

create or replace function public.sync_order_delivery_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shop_latitude numeric;
  shop_longitude numeric;
  customer_latitude numeric;
  customer_longitude numeric;
  computed_distance_km numeric;
begin
  if new.shop_id is null or new.address_id is null then
    new.delivery_fee := public.calculate_order_delivery_fee(null);
    return new;
  end if;

  select s.latitude, s.longitude
    into shop_latitude, shop_longitude
    from public.shops s
   where s.id = new.shop_id
   limit 1;

  select a.latitude, a.longitude
    into customer_latitude, customer_longitude
    from public.addresses a
   where a.id = new.address_id
   limit 1;

  computed_distance_km := public.calculate_order_delivery_distance_km(
    shop_latitude,
    shop_longitude,
    customer_latitude,
    customer_longitude
  );

  new.delivery_fee := public.calculate_order_delivery_fee(computed_distance_km);

  return new;
end;
$$;

drop trigger if exists trg_sync_order_delivery_fee on public.orders;

create trigger trg_sync_order_delivery_fee
before insert or update of shop_id, address_id on public.orders
for each row
execute function public.sync_order_delivery_fee();

create or replace function public.recalculate_order_total(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_subtotal numeric;
begin
  select coalesce(sum(coalesce(oi.price, 0) * coalesce(oi.quantity, 0)), 0)::numeric
    into order_subtotal
    from public.order_items oi
   where oi.order_id = target_order_id;

  update public.orders o
     set total_amount = round((order_subtotal + coalesce(o.delivery_fee, 0))::numeric, 2)
   where o.id = target_order_id;
end;
$$;

create or replace function public.sync_parent_order_total_from_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.order_id is not null then
      perform public.recalculate_order_total(old.order_id);
    end if;

    return null;
  end if;

  if tg_op = 'UPDATE'
    and old.order_id is distinct from new.order_id
    and old.order_id is not null then
    perform public.recalculate_order_total(old.order_id);
  end if;

  if new.order_id is not null then
    perform public.recalculate_order_total(new.order_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_parent_order_total_from_items on public.order_items;

create trigger trg_sync_parent_order_total_from_items
after insert or update or delete on public.order_items
for each row
execute function public.sync_parent_order_total_from_items();

create or replace function public.sync_existing_order_total_from_delivery_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_order_total(new.id);
  return null;
end;
$$;

drop trigger if exists trg_sync_existing_order_total_from_delivery_fee on public.orders;

create trigger trg_sync_existing_order_total_from_delivery_fee
after update of delivery_fee, shop_id, address_id on public.orders
for each row
execute function public.sync_existing_order_total_from_delivery_fee();

with order_subtotals as (
  select
    o.id,
    coalesce(sum(coalesce(oi.price, 0) * coalesce(oi.quantity, 0)), 0)::numeric as subtotal
  from public.orders o
  left join public.order_items oi
    on oi.order_id = o.id
  group by o.id
),
order_delivery_fees as (
  select
    o.id,
    subtotal_data.subtotal,
    public.calculate_order_delivery_fee(
      public.calculate_order_delivery_distance_km(
        s.latitude,
        s.longitude,
        a.latitude,
        a.longitude
      )
    ) as delivery_fee
  from public.orders o
  join order_subtotals subtotal_data
    on subtotal_data.id = o.id
  left join public.shops s
    on s.id = o.shop_id
  left join public.addresses a
    on a.id = o.address_id
)
update public.orders o
set
  delivery_fee = fee_data.delivery_fee,
  total_amount = round((fee_data.subtotal + fee_data.delivery_fee)::numeric, 2)
from order_delivery_fees fee_data
where o.id = fee_data.id;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
