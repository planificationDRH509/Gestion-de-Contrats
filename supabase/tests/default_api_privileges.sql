begin;
create table public.security_test_future_table (id serial primary key);
alter table public.security_test_future_table enable row level security;
create function public.security_test_future_function() returns integer
language sql set search_path = '' as 'select 1';
do $$
begin
  assert not has_table_privilege('anon','public.security_test_future_table','SELECT');
  assert not has_table_privilege('authenticated','public.security_test_future_table','INSERT');
  assert not has_sequence_privilege('anon','public.security_test_future_table_id_seq','USAGE');
  assert not has_function_privilege('anon','public.security_test_future_function()','EXECUTE');
  assert not has_function_privilege('authenticated','public.security_test_future_function()','EXECUTE');
end;
$$;
rollback;
