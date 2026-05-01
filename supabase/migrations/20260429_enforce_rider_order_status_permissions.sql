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

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status in ('accepted_by_rider', 'picked_up', 'delivered') then
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

  if new.status = 'accepted_by_rider' then
    if old.status <> 'waiting_for_rider' or old.rider_id is not null then
      raise exception 'This order is no longer available for rider acceptance.'
        using errcode = '42501';
    end if;

    if new.rider_id is distinct from authenticated_rider_id then
      raise exception 'Only the authenticated rider can accept this order.'
        using errcode = '42501';
    end if;
  elsif new.status = 'picked_up' then
    if old.status <> 'accepted_by_rider' then
      raise exception 'Only accepted orders can be marked as picked up.'
        using errcode = '42501';
    end if;

    if old.rider_id is distinct from authenticated_rider_id
      or new.rider_id is distinct from old.rider_id then
      raise exception 'Only the assigned rider can mark this order as picked up.'
        using errcode = '42501';
    end if;
  elsif new.status = 'delivered' then
    if old.status <> 'picked_up' then
      raise exception 'Only picked-up orders can be marked as delivered.'
        using errcode = '42501';
    end if;

    if old.rider_id is distinct from authenticated_rider_id
      or new.rider_id is distinct from old.rider_id then
      raise exception 'Only the assigned rider can mark this order as delivered.'
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
