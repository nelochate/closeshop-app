alter table public.profiles
add column if not exists notification_push_enabled boolean not null default true,
add column if not exists notification_chat_enabled boolean not null default true,
add column if not exists notification_order_enabled boolean not null default true;

update public.profiles
set
  notification_push_enabled = coalesce(notification_push_enabled, true),
  notification_chat_enabled = coalesce(notification_chat_enabled, true),
  notification_order_enabled = coalesce(notification_order_enabled, true);

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
