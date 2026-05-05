do $$
declare
  current_constraint_def text;
  allowed_statuses text[];
  status_list_sql text;
begin
  select pg_get_constraintdef(oid)
    into current_constraint_def
    from pg_constraint
   where conrelid = 'public.orders'::regclass
     and conname = 'orders_status_check';

  if current_constraint_def is null then
    raise exception 'Constraint public.orders.orders_status_check not found.';
  end if;

  select array_agg(distinct match[1] order by match[1])
    into allowed_statuses
    from regexp_matches(current_constraint_def, '''([^'']+)''', 'g') as match;

  if allowed_statuses is null or array_length(allowed_statuses, 1) is null then
    raise exception 'Could not parse allowed statuses from constraint definition: %', current_constraint_def;
  end if;

  if not ('cancel_requested' = any(allowed_statuses)) then
    allowed_statuses := array_append(allowed_statuses, 'cancel_requested');
  end if;

  select string_agg(quote_literal(status_value), ', ' order by status_value)
    into status_list_sql
    from unnest(allowed_statuses) as status_value;

  execute 'alter table public.orders drop constraint orders_status_check';

  execute format(
    'alter table public.orders add constraint orders_status_check check ((status)::text = any ((array[%s])::text[]))',
    status_list_sql
  );

  perform pg_notify('pgrst', 'reload schema');
end;
$$;
