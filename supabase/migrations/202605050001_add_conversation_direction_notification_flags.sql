alter table public.conversations
  add column if not exists has_customer_messaged boolean not null default false,
  add column if not exists has_seller_replied boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'has_customer_notified'
  ) then
    update public.conversations
    set has_customer_messaged = true
    where coalesce(has_customer_notified, false) = true;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'has_seller_notified'
  ) then
    update public.conversations
    set has_seller_replied = true
    where coalesce(has_seller_notified, false) = true;
  end if;
end
$$;

comment on column public.conversations.has_customer_messaged is
  'True after the customer has sent the first non-system message in the conversation.';

comment on column public.conversations.has_seller_replied is
  'True after the seller has sent the first non-system reply after a customer message.';
