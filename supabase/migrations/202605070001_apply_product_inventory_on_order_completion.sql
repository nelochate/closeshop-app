alter table public.orders
add column if not exists inventory_applied_at timestamptz;

create or replace function public.apply_product_inventory_for_completed_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inventory_applied_at timestamptz;
  order_item record;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.inventory_applied_at is not null then
    new.inventory_applied_at := old.inventory_applied_at;
    return new;
  end if;

  if new.completed_at is null and coalesce(new.status, '') <> 'completed' then
    new.inventory_applied_at := null;
    return new;
  end if;

  inventory_applied_at := coalesce(new.completed_at, new.updated_at, timezone('utc', now()));

  for order_item in
    select
      oi.product_id,
      greatest(coalesce(oi.quantity, 0), 0)::integer as quantity
    from public.order_items oi
    where oi.order_id = new.id
      and oi.product_id is not null
      and coalesce(oi.quantity, 0) > 0
  loop
    update public.products p
       set
         stock = greatest(coalesce(p.stock, 0) - order_item.quantity, 0),
         sold = coalesce(p.sold, 0) + order_item.quantity
       where p.id = order_item.product_id;
  end loop;

  new.inventory_applied_at := inventory_applied_at;
  return new;
end;
$$;

drop trigger if exists trg_apply_product_inventory_for_completed_order on public.orders;

create trigger trg_apply_product_inventory_for_completed_order
before update of status, completed_at, inventory_applied_at on public.orders
for each row
execute function public.apply_product_inventory_for_completed_order();

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
