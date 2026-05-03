alter table public.orders
add column if not exists delivery_distance_km numeric(10, 2);

alter table public.orders
add column if not exists rider_earnings numeric(10, 2);

alter table public.orders
add column if not exists rider_earnings_computed_at timestamptz;

alter table public.orders
add column if not exists rider_pay_rule text;

create or replace function public.calculate_rider_delivery_distance_km(
  origin_lat numeric,
  origin_lng numeric,
  destination_lat numeric,
  destination_lng numeric
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  earth_radius_km double precision := 6371;
  delta_lat double precision;
  delta_lng double precision;
  haversine_a double precision;
  haversine_c double precision;
  computed_distance_km double precision;
begin
  if origin_lat is null
    or origin_lng is null
    or destination_lat is null
    or destination_lng is null then
    return null;
  end if;

  delta_lat := radians((destination_lat - origin_lat)::double precision);
  delta_lng := radians((destination_lng - origin_lng)::double precision);

  haversine_a :=
    power(sin(delta_lat / 2), 2) +
    cos(radians(origin_lat::double precision)) *
    cos(radians(destination_lat::double precision)) *
    power(sin(delta_lng / 2), 2);

  haversine_c := 2 * atan2(sqrt(haversine_a), sqrt(1 - haversine_a));
  computed_distance_km := earth_radius_km * haversine_c;

  return round(computed_distance_km::numeric, 2);
end;
$$;

create or replace function public.calculate_rider_base_pay(distance_km numeric)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized_distance_km numeric(10, 2);
begin
  if distance_km is null or distance_km < 0 then
    return null;
  end if;

  normalized_distance_km := round(distance_km, 2);

  if normalized_distance_km <= 3 then
    return 30;
  elsif normalized_distance_km <= 6 then
    return 45;
  elsif normalized_distance_km <= 10 then
    return 65;
  end if;

  return 80 + (ceil(normalized_distance_km - 10) * 5);
end;
$$;

create or replace function public.get_rider_earnings_quote(distance_km numeric)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  normalized_distance_km numeric(10, 2);
  base_pay numeric(10, 2);
  billable_additional_km integer := 0;
  additional_pay numeric(10, 2) := 0;
  tier_label text;
begin
  if distance_km is null or distance_km < 0 then
    return null;
  end if;

  normalized_distance_km := round(distance_km, 2);

  if normalized_distance_km <= 3 then
    base_pay := 30;
    tier_label := '0-3 km';
  elsif normalized_distance_km <= 6 then
    base_pay := 45;
    tier_label := '3-6 km';
  elsif normalized_distance_km <= 10 then
    base_pay := 65;
    tier_label := '6-10 km';
  else
    base_pay := 80;
    tier_label := '10+ km';
    billable_additional_km := ceil(normalized_distance_km - 10);
    additional_pay := billable_additional_km * 5;
  end if;

  return jsonb_build_object(
    'distance_km', normalized_distance_km,
    'tier_label', tier_label,
    'base_pay', base_pay,
    'additional_distance_km', billable_additional_km,
    'additional_pay', additional_pay,
    'total_pay', base_pay + additional_pay,
    'pay_rule', 'distance_tier_v1'
  );
end;
$$;

grant execute on function public.calculate_rider_base_pay(numeric) to authenticated;
grant execute on function public.get_rider_earnings_quote(numeric) to authenticated;

create or replace function public.sync_order_rider_earnings()
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
  computed_distance_km numeric(10, 2);
  computed_earnings numeric(10, 2);
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.rider_id is null then
    return new;
  end if;

  if new.delivered_at is null and new.completed_at is null then
    if old.delivered_at is not null or old.completed_at is not null then
      new.delivery_distance_km := null;
      new.rider_earnings := null;
      new.rider_earnings_computed_at := null;
      new.rider_pay_rule := null;
    end if;

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

  computed_distance_km := public.calculate_rider_delivery_distance_km(
    shop_latitude,
    shop_longitude,
    customer_latitude,
    customer_longitude
  );

  if computed_distance_km is null then
    return new;
  end if;

  computed_earnings := public.calculate_rider_base_pay(computed_distance_km);

  if computed_earnings is null then
    return new;
  end if;

  new.delivery_distance_km := computed_distance_km;
  new.rider_earnings := computed_earnings;
  new.rider_earnings_computed_at := timezone('utc', now());
  new.rider_pay_rule := 'distance_tier_v1';

  return new;
end;
$$;

drop trigger if exists trg_sync_order_rider_earnings on public.orders;

create trigger trg_sync_order_rider_earnings
before update on public.orders
for each row
execute function public.sync_order_rider_earnings();

with computed_order_payouts as (
  select
    o.id,
    public.calculate_rider_delivery_distance_km(
      s.latitude,
      s.longitude,
      a.latitude,
      a.longitude
    ) as delivery_distance_km
  from public.orders o
  left join public.shops s
    on s.id = o.shop_id
  left join public.addresses a
    on a.id = o.address_id
  where o.rider_id is not null
    and (o.delivered_at is not null or o.completed_at is not null)
)
update public.orders o
set
  delivery_distance_km = computed.delivery_distance_km,
  rider_earnings = public.calculate_rider_base_pay(computed.delivery_distance_km),
  rider_earnings_computed_at = timezone('utc', now()),
  rider_pay_rule = 'distance_tier_v1'
from computed_order_payouts computed
where o.id = computed.id
  and computed.delivery_distance_km is not null;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
