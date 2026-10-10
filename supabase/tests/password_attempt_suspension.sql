begin;
do $$
declare
  prefix text := 'attempt-'||gen_random_uuid();
  admin_id uuid := gen_random_uuid(); target_id uuid := gen_random_uuid();
  admin_token text; token text; token2 text; result jsonb; rejected boolean;
begin
  insert into public.app_users(id,username,password,full_name,role) values
    (admin_id,prefix||'-admin','test-password','Admin fixture','admin'),
    (target_id,prefix||'-target','test-password','Target fixture','agent');
  admin_token := public.create_task_session(admin_id,'test-password');
  token := public.create_task_session(target_id,'test-password');
  set local role anon;
  for i in 1..7 loop
    result := public.login_app_user(prefix||'-target','wrong');
    assert result->>'error'='TASK_SESSION_INVALID_CREDENTIALS';
  end loop;
  -- Success resets the counter; transport failures cannot increment it.
  assert (public.authenticate_app_user(target_id,'test-password')->>'taskSessionToken') is not null;
  for i in 1..7 loop
    assert public.create_task_session(target_id,'wrong') is null;
  end loop;
  result := public.authenticate_app_user(target_id,'wrong');
  assert result->>'error'='APP_ACCOUNT_SUSPENDED', '8th error suspends';
  assert (public.login_app_user(prefix||'-target','test-password')->>'error')='APP_ACCOUNT_SUSPENDED';
  perform set_config('request.headers',jsonb_build_object('x-app-session',token)::text,true);
  assert app_security.request_user_id() is null;
  assert public.set_app_user_suspended(admin_token,target_id,false);
  result := public.login_app_user(prefix||'-target','test-password');
  token := result->>'taskSessionToken';
  assert token is not null;
  token2 := public.create_task_session(target_id,'test-password');
  reset role;
  assert (select failed_password_attempts=0 from public.app_users where id=target_id);
  -- Reporting remains possible after ordinary session expiry/revocation.
  delete from public.app_task_sessions where user_id=target_id;
  set local role anon;
  rejected := false;
  begin perform public.report_offline_suspension('forged-token');
    exception when others then rejected:=true; end;
  assert rejected;
  assert public.report_offline_suspension(token);
  assert public.report_offline_suspension(token), 'report retry is idempotent';
  assert (public.login_app_user(prefix||'-target','test-password')->>'error')='APP_ACCOUNT_SUSPENDED';
  assert public.set_app_user_suspended(admin_token,target_id,false);
  assert public.report_offline_suspension(token2), 'old device report acknowledged';
  assert (public.login_app_user(prefix||'-target','test-password')->>'taskSessionToken') is not null,
    'old reports cannot undo administrator reactivation';
  reset role;
end;
$$;
rollback;
