create table if not exists public.shop_visits (
  id bigserial primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  visit_type text not null default 'shop_page' check (visit_type in ('shop_page', 'profile_page')),
  visitor_user_id uuid references auth.users(id) on delete set null,
  visitor_key text not null,
  session_id text,
  visit_bucket timestamptz not null,
  visited_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_shop_visits_dedupe
  on public.shop_visits (shop_id, visit_type, visitor_key, visit_bucket);

create index if not exists idx_shop_visits_shop_id_visited_at
  on public.shop_visits (shop_id, visited_at desc);

create index if not exists idx_shop_visits_shop_id_visit_type
  on public.shop_visits (shop_id, visit_type);

create index if not exists idx_shop_visits_visitor_user_id
  on public.shop_visits (visitor_user_id);

alter table public.shop_visits enable row level security;

drop policy if exists "Shop owners can view their own visit analytics" on public.shop_visits;
create policy "Shop owners can view their own visit analytics"
on public.shop_visits
for select
to authenticated
using (
  exists (
    select 1
      from public.shops
     where shops.id = shop_visits.shop_id
       and shops.owner_id = auth.uid()
  )
);

create or replace function public.touch_shop_visit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());

  if tg_op = 'INSERT' and new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  if new.visited_at is null then
    new.visited_at := timezone('utc', now());
  end if;

  if new.visit_bucket is null then
    new.visit_bucket := date_trunc('hour', new.visited_at);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_touch_shop_visit_row on public.shop_visits;

create trigger trg_touch_shop_visit_row
before insert or update on public.shop_visits
for each row
execute function public.touch_shop_visit_row();

create or replace function public.record_shop_visit(
  p_shop_id uuid,
  p_visit_type text default 'shop_page',
  p_visitor_key text default null,
  p_session_id text default null,
  p_visited_at timestamptz default timezone('utc', now())
)
returns public.shop_visits
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_visit_type text;
  normalized_visited_at timestamptz;
  normalized_visitor_key text;
  resolved_visitor_key text;
  resolved_bucket timestamptz;
  result_row public.shop_visits;
begin
  if p_shop_id is null then
    raise exception 'shop_id is required';
  end if;

  if not exists (
    select 1
      from public.shops
     where id = p_shop_id
  ) then
    raise exception 'shop_id does not exist';
  end if;

  normalized_visit_type := case
    when lower(coalesce(p_visit_type, 'shop_page')) = 'profile_page' then 'profile_page'
    else 'shop_page'
  end;

  normalized_visited_at := coalesce(p_visited_at, timezone('utc', now()));
  normalized_visitor_key := nullif(trim(coalesce(p_visitor_key, '')), '');
  resolved_visitor_key := coalesce(auth.uid()::text, normalized_visitor_key, md5(coalesce(p_session_id, 'guest')));

  if length(resolved_visitor_key) < 8 then
    resolved_visitor_key := md5(resolved_visitor_key || coalesce(p_session_id, 'guest'));
  end if;

  resolved_bucket := date_trunc('hour', normalized_visited_at);

  insert into public.shop_visits (
    shop_id,
    visit_type,
    visitor_user_id,
    visitor_key,
    session_id,
    visit_bucket,
    visited_at
  )
  values (
    p_shop_id,
    normalized_visit_type,
    auth.uid(),
    resolved_visitor_key,
    nullif(trim(coalesce(p_session_id, '')), ''),
    resolved_bucket,
    normalized_visited_at
  )
  on conflict (shop_id, visit_type, visitor_key, visit_bucket) do update
    set visitor_user_id = coalesce(excluded.visitor_user_id, public.shop_visits.visitor_user_id),
        session_id = coalesce(excluded.session_id, public.shop_visits.session_id),
        visited_at = excluded.visited_at,
        updated_at = timezone('utc', now())
  returning * into result_row;

  return result_row;
end;
$$;

grant execute on function public.record_shop_visit(uuid, text, text, text, timestamptz) to anon, authenticated;

create or replace function public.get_shop_visit_summary(p_shop_id uuid)
returns table (
  total_visits bigint,
  shop_page_visits bigint,
  profile_page_visits bigint,
  unique_visitors bigint,
  last_7_days_visits bigint,
  last_30_days_visits bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(*)::bigint as total_visits,
    count(*) filter (where sv.visit_type = 'shop_page')::bigint as shop_page_visits,
    count(*) filter (where sv.visit_type = 'profile_page')::bigint as profile_page_visits,
    count(distinct sv.visitor_key)::bigint as unique_visitors,
    count(*) filter (
      where sv.visited_at >= timezone('utc', now()) - interval '7 days'
    )::bigint as last_7_days_visits,
    count(*) filter (
      where sv.visited_at >= timezone('utc', now()) - interval '30 days'
    )::bigint as last_30_days_visits
  from public.shop_visits sv
  where sv.shop_id = p_shop_id
    and exists (
      select 1
        from public.shops
       where shops.id = p_shop_id
         and shops.owner_id = auth.uid()
    );
$$;

grant execute on function public.get_shop_visit_summary(uuid) to authenticated;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
