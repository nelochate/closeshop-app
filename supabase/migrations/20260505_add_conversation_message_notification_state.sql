alter table public.conversations
  add column if not exists last_sender text,
  add column if not exists has_customer_notified boolean not null default false,
  add column if not exists has_seller_notified boolean not null default false;

comment on column public.conversations.last_sender is
  'Tracks the last chat sender role for conversation-phase notification suppression.';

comment on column public.conversations.has_customer_notified is
  'True after the seller has already been notified for the current customer-sender phase.';

comment on column public.conversations.has_seller_notified is
  'True after the customer has already been notified for the current seller-sender phase.';
