alter table public.orders
add column if not exists contact_number varchar(20);

update public.orders as orders
set contact_number = addresses.phone
from public.addresses as addresses
where orders.address_id = addresses.id
  and coalesce(nullif(trim(orders.contact_number), ''), '') = ''
  and coalesce(nullif(trim(addresses.phone), ''), '') <> '';

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
