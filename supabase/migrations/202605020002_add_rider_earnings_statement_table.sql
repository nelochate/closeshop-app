create table if not exists public.rider_earnings (
  id bigserial primary key,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  rider_id bigint not null references public."Rider_Registration"(rider_id) on delete cascade,
  amount numeric(10, 2) not null,
  base_pay numeric(10, 2) not null,
  additional_distance_km integer not null default 0,
  additional_pay numeric(10, 2) not null default 0,
  delivery_distance_km numeric(10, 2) not null,
  pay_rule text not null default 'distance_tier_v1',
  status text not null default 'pending' check (status in ('pending', 'paid')),
  earned_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_rider_earnings_rider_id_earned_at
  on public.rider_earnings (rider_id, earned_at desc);

create index if not exists idx_rider_earnings_status
  on public.rider_earnings (status);

alter table public.rider_earnings enable row level security;

drop policy if exists "Riders can view their own earnings" on public.rider_earnings;
create policy "Riders can view their own earnings"
on public.rider_earnings
for select
to authenticated
using (
  exists (
    select 1
      from public."Rider_Registration" rr
     where rr.profile_id = auth.uid()
       and rr.rider_id = rider_earnings.rider_id
  )
);

create or replace function public.sync_rider_earnings_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := case when new.paid_at is null then 'pending' else 'paid' end;
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_rider_earnings_row on public.rider_earnings;

create trigger trg_sync_rider_earnings_row
before insert or update on public.rider_earnings
for each row
execute function public.sync_rider_earnings_row();

create or replace function public.sync_rider_earnings_statement_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  earnings_quote jsonb;
  earned_timestamp timestamptz;
begin
  if new.rider_id is null
    or new.rider_earnings is null
    or new.delivery_distance_km is null
    or (new.delivered_at is null and new.completed_at is null) then
    delete from public.rider_earnings
     where order_id = new.id;

    return new;
  end if;

  earnings_quote := public.get_rider_earnings_quote(new.delivery_distance_km);
  earned_timestamp := coalesce(
    new.completed_at,
    new.delivered_at,
    new.rider_earnings_computed_at,
    new.updated_at,
    timezone('utc', now())
  );

  insert into public.rider_earnings (
    order_id,
    rider_id,
    amount,
    base_pay,
    additional_distance_km,
    additional_pay,
    delivery_distance_km,
    pay_rule,
    earned_at
  )
  values (
    new.id,
    new.rider_id,
    new.rider_earnings,
    coalesce((earnings_quote ->> 'base_pay')::numeric, new.rider_earnings),
    coalesce((earnings_quote ->> 'additional_distance_km')::integer, 0),
    coalesce((earnings_quote ->> 'additional_pay')::numeric, 0),
    new.delivery_distance_km,
    coalesce(new.rider_pay_rule, earnings_quote ->> 'pay_rule', 'distance_tier_v1'),
    earned_timestamp
  )
  on conflict (order_id) do update
    set rider_id = excluded.rider_id,
        amount = excluded.amount,
        base_pay = excluded.base_pay,
        additional_distance_km = excluded.additional_distance_km,
        additional_pay = excluded.additional_pay,
        delivery_distance_km = excluded.delivery_distance_km,
        pay_rule = excluded.pay_rule,
        earned_at = excluded.earned_at,
        paid_at = coalesce(public.rider_earnings.paid_at, excluded.paid_at);

  return new;
end;
$$;

drop trigger if exists trg_sync_rider_earnings_statement_from_order on public.orders;

create trigger trg_sync_rider_earnings_statement_from_order
after insert or update on public.orders
for each row
execute function public.sync_rider_earnings_statement_from_order();

insert into public.rider_earnings (
  order_id,
  rider_id,
  amount,
  base_pay,
  additional_distance_km,
  additional_pay,
  delivery_distance_km,
  pay_rule,
  earned_at
)
select
  o.id,
  o.rider_id,
  o.rider_earnings,
  coalesce((earnings_quote.data ->> 'base_pay')::numeric, o.rider_earnings) as base_pay,
  coalesce((earnings_quote.data ->> 'additional_distance_km')::integer, 0) as additional_distance_km,
  coalesce((earnings_quote.data ->> 'additional_pay')::numeric, 0) as additional_pay,
  o.delivery_distance_km,
  coalesce(o.rider_pay_rule, earnings_quote.data ->> 'pay_rule', 'distance_tier_v1') as pay_rule,
  coalesce(o.completed_at, o.delivered_at, o.rider_earnings_computed_at, o.updated_at, timezone('utc', now())) as earned_at
from public.orders o
cross join lateral (
  select public.get_rider_earnings_quote(o.delivery_distance_km) as data
) as earnings_quote
where o.rider_id is not null
  and o.rider_earnings is not null
  and o.delivery_distance_km is not null
  and (o.delivered_at is not null or o.completed_at is not null)
on conflict (order_id) do update
  set rider_id = excluded.rider_id,
      amount = excluded.amount,
      base_pay = excluded.base_pay,
      additional_distance_km = excluded.additional_distance_km,
      additional_pay = excluded.additional_pay,
      delivery_distance_km = excluded.delivery_distance_km,
      pay_rule = excluded.pay_rule,
      earned_at = excluded.earned_at;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
