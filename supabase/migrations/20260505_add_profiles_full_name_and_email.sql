alter table public.profiles
add column if not exists full_name text,
add column if not exists email text;

update public.profiles
set full_name = nullif(trim(concat_ws(' ', first_name, last_name)), '')
where coalesce(nullif(trim(full_name), ''), '') = '';

update public.profiles as profiles
set email = users.email
from auth.users as users
where profiles.id = users.id
  and coalesce(nullif(trim(profiles.email), ''), '') = ''
  and coalesce(nullif(trim(users.email), ''), '') <> '';

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;
