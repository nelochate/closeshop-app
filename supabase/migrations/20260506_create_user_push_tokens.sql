create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null,
  notifications_enabled boolean not null default true,
  chat_enabled boolean not null default true,
  order_enabled boolean not null default true,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_push_tokens_user_id
  on public.user_push_tokens(user_id);

create index if not exists idx_user_push_tokens_user_id_active
  on public.user_push_tokens(user_id, is_active);

alter table public.user_push_tokens enable row level security;

drop policy if exists "Users can view their own push tokens" on public.user_push_tokens;
create policy "Users can view their own push tokens"
on public.user_push_tokens
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own push tokens" on public.user_push_tokens;
create policy "Users can insert their own push tokens"
on public.user_push_tokens
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own push tokens" on public.user_push_tokens;
create policy "Users can update their own push tokens"
on public.user_push_tokens
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own push tokens" on public.user_push_tokens;
create policy "Users can delete their own push tokens"
on public.user_push_tokens
for delete
to authenticated
using (auth.uid() = user_id);
