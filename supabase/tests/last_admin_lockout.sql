-- All role changes and fixtures are inside one rolled-back transaction.
begin;
do $$
declare
  admin_id uuid := gen_random_uuid(); login_name text := 'last-admin-test-'||gen_random_uuid();
  token text; result jsonb;
begin
  insert into public.app_users(id,username,password,full_name,role)
    values(admin_id,login_name,'test-password','Last admin fixture','admin');
  -- Other sessions see their original roles throughout this transaction.
  update public.app_users set role='reader' where role='admin' and id<>admin_id;
  assert (select count(*) from public.app_users where role='admin' and not is_suspended)=1;
  set local role anon;
  for i in 1..8 loop result := public.login_app_user(login_name,'wrong'); end loop;
  assert result->>'error'='APP_ACCOUNT_SUSPENDED';
  assert (public.login_app_user(login_name,'test-password')->>'error')='APP_ACCOUNT_SUSPENDED';
  reset role;
  -- Dashboard/SQL recovery resets the counter and invalidates old capabilities.
  update public.app_users set is_suspended=false where id=admin_id;
  assert (select failed_password_attempts=0 from public.app_users where id=admin_id);
  set local role anon;
  token := public.login_app_user(login_name,'test-password')->>'taskSessionToken';
  assert token is not null;
  assert public.report_offline_suspension(token);
  assert (public.login_app_user(login_name,'test-password')->>'error')='APP_ACCOUNT_SUSPENDED';
  reset role;
end;
$$;
rollback;
