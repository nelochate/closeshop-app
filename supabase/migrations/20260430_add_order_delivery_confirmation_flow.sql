alter table public.orders
add column if not exists delivery_proof_url text;

alter table public.orders
add column if not exists completed_at timestamptz;

alter table public.orders
disable trigger trg_enforce_rider_order_status_permissions;

update public.orders
set completed_at = coalesce(completed_at, delivered_at, updated_at, created_at)
where status = 'completed'
  and completed_at is null;

update public.orders
set delivered_at = coalesce(delivered_at, completed_at, updated_at, created_at)
where status in ('delivered', 'completed')
  and delivered_at is null;

update public.orders
set status = 'picked_up'
where status in ('delivered', 'completed');

alter table public.orders
enable trigger trg_enforce_rider_order_status_permissions;

insert into storage.buckets (id, name, public)
values ('order-proofs', 'order-proofs', true)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;

drop policy if exists "Authenticated users can upload order proofs" on storage.objects;
create policy "Authenticated users can upload order proofs"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'order-proofs');

drop policy if exists "Authenticated users can update order proofs" on storage.objects;
create policy "Authenticated users can update order proofs"
on storage.objects
for update
to authenticated
using (bucket_id = 'order-proofs')
with check (bucket_id = 'order-proofs');

drop policy if exists "Authenticated users can delete order proofs" on storage.objects;
create policy "Authenticated users can delete order proofs"
on storage.objects
for delete
to authenticated
using (bucket_id = 'order-proofs');

create or replace function public.enforce_customer_order_confirmation_permissions()
returns trigger
language plpgsql
security invoker
as $$
declare
  authenticated_profile_id uuid := auth.uid();
  authenticated_role text := auth.role();
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if authenticated_role = 'service_role' then
    return new;
  end if;

  if new.completed_at is distinct from old.completed_at
    and new.completed_at is not null then
    if authenticated_profile_id is null then
      raise exception 'Authentication is required to confirm delivered orders.'
        using errcode = '42501';
    end if;

    if old.user_id is distinct from authenticated_profile_id then
      raise exception 'Only the customer who placed this order can confirm delivery.'
        using errcode = '42501';
    end if;

    if old.status not in ('picked_up', 'delivered')
      or old.delivered_at is null
      or old.completed_at is not null then
      raise exception 'Only delivered orders can be confirmed by the customer.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status then
      raise exception 'Confirming delivery must not change the order status.'
        using errcode = '42501';
    end if;

    if new.rider_id is distinct from old.rider_id then
      raise exception 'Confirming delivery must not reassign the rider.'
        using errcode = '42501';
    end if;

    if new.delivered_at is distinct from old.delivered_at then
      raise exception 'Confirming delivery must preserve the recorded delivery timestamp.'
        using errcode = '42501';
    end if;

    if new.delivery_proof_url is distinct from old.delivery_proof_url then
      raise exception 'Confirming delivery must preserve the recorded proof of delivery.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if old.status in ('picked_up', 'delivered')
    and old.user_id = authenticated_profile_id
    and old.completed_at is null
    and old.delivered_at is not null
    and new.delivered_at is null then
    if authenticated_profile_id is null then
      raise exception 'Authentication is required to report delivery issues.'
        using errcode = '42501';
    end if;

    if old.rider_id is null then
      raise exception 'Only rider-delivered orders can be reported for re-delivery.'
        using errcode = '42501';
    end if;

    if new.status not in (old.status, 'picked_up') then
      raise exception 'Reporting a delivery issue must keep the order in the rider workflow.'
        using errcode = '42501';
    end if;

    if new.rider_id is distinct from old.rider_id then
      raise exception 'Reporting a delivery issue must not change the assigned rider.'
        using errcode = '42501';
    end if;

    if new.delivery_proof_url is distinct from old.delivery_proof_url then
      raise exception 'Reporting a delivery issue must preserve the original proof of delivery.'
        using errcode = '42501';
    end if;

    if new.completed_at is distinct from old.completed_at then
      raise exception 'Reporting a delivery issue must not confirm the order.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_customer_order_confirmation_permissions on public.orders;

create trigger trg_enforce_customer_order_confirmation_permissions
before update on public.orders
for each row
execute function public.enforce_customer_order_confirmation_permissions();

create or replace function public.enforce_rider_order_status_permissions()
returns trigger
language plpgsql
security invoker
as $$
declare
  authenticated_profile_id uuid := auth.uid();
  authenticated_role text := auth.role();
  authenticated_rider_id bigint;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if authenticated_role = 'service_role' then
    return new;
  end if;

  if authenticated_profile_id is not null
    and old.user_id = authenticated_profile_id
    and old.status in ('picked_up', 'delivered')
    and old.completed_at is null
    and old.delivered_at is not null
    and new.delivered_at is null
    and new.rider_id is not distinct from old.rider_id then
    return new;
  end if;

  if (
    new.status is distinct from old.status
    and new.status in ('accepted_by_rider', 'picked_up')
  ) or new.delivered_at is distinct from old.delivered_at
    or new.delivery_proof_url is distinct from old.delivery_proof_url then
    if authenticated_profile_id is null then
      raise exception 'Authentication is required to update rider delivery statuses.'
        using errcode = '42501';
    end if;

    select rr.rider_id
      into authenticated_rider_id
      from public."Rider_Registration" rr
     where rr.profile_id = authenticated_profile_id
       and rr.status = 'approved'
     limit 1;

    if authenticated_rider_id is null then
      raise exception 'Only approved riders can update rider delivery statuses.'
        using errcode = '42501';
    end if;
  end if;

  if new.status = 'accepted_by_rider' and new.status is distinct from old.status then
    if old.status <> 'waiting_for_rider' or old.rider_id is not null then
      raise exception 'This order is no longer available for rider acceptance.'
        using errcode = '42501';
    end if;

    if new.rider_id is distinct from authenticated_rider_id then
      raise exception 'Only the authenticated rider can accept this order.'
        using errcode = '42501';
    end if;
  elsif new.status = 'picked_up' and new.status is distinct from old.status then
    if old.status <> 'accepted_by_rider' then
      raise exception 'Only accepted orders can be marked as picked up.'
        using errcode = '42501';
    end if;

    if old.rider_id is distinct from authenticated_rider_id
      or new.rider_id is distinct from old.rider_id then
      raise exception 'Only the assigned rider can mark this order as picked up.'
        using errcode = '42501';
    end if;
  elsif new.delivered_at is distinct from old.delivered_at
    or new.delivery_proof_url is distinct from old.delivery_proof_url then
    if old.status <> 'picked_up' then
      raise exception 'Only picked-up orders can be marked as delivered.'
        using errcode = '42501';
    end if;

    if old.rider_id is distinct from authenticated_rider_id
      or new.rider_id is distinct from old.rider_id then
      raise exception 'Only the assigned rider can attach delivery proof.'
        using errcode = '42501';
    end if;

    if old.completed_at is not null then
      raise exception 'Completed orders cannot receive a new delivery proof.'
        using errcode = '42501';
    end if;

    if new.completed_at is distinct from old.completed_at then
      raise exception 'Riders cannot confirm orders on behalf of the customer.'
        using errcode = '42501';
    end if;

    if new.delivered_at is null then
      raise exception 'Marking an order as delivered must set delivered_at.'
        using errcode = '42501';
    end if;

    if coalesce(new.delivery_proof_url, '') = '' then
      raise exception 'Marking an order as delivered requires a proof of delivery image.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_rider_order_status_permissions on public.orders;

create trigger trg_enforce_rider_order_status_permissions
before update on public.orders
for each row
execute function public.enforce_rider_order_status_permissions();

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
