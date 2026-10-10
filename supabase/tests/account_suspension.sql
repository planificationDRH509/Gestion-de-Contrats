-- Synthetic accounts only; no persistent changes.
begin;
do $$
declare
  prefix text := 'suspension-' || gen_random_uuid();
  admin_id uuid := gen_random_uuid(); target_id uuid := gen_random_uuid();
  admin_token text; target_token text; rejected boolean;
begin
  insert into public.app_users(id,username,password,full_name,role) values
    (admin_id,prefix||'-admin','test-password','Test admin','admin'),
    (target_id,prefix||'-target','test-password','Test target','agent');
  admin_token := public.create_task_session(admin_id,'test-password');
  target_token := public.create_task_session(target_id,'test-password');
  set local role anon;
  rejected := false;
  begin perform public.set_app_user_suspended(target_token,admin_id,true);
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'non-administrator must be denied';
  rejected := false;
  begin perform public.set_app_user_suspended('invalid',target_id,true);
    exception when others then rejected := true; end;
  assert rejected, 'invalid session must be denied';
  assert public.set_app_user_suspended(admin_token,target_id,true);
  assert (public.login_app_user(prefix||'-target','test-password')->>'error')='APP_ACCOUNT_SUSPENDED', 'suspended login must fail';
  assert public.create_task_session(target_id,'test-password') is null, 'suspended unlock must fail';
  rejected := false;
  begin perform public.resolve_task_session(target_token);
    exception when others then rejected := true; end;
  assert rejected, 'previous token must be revoked';
  perform set_config('request.headers',jsonb_build_object('x-app-session',target_token)::text,true);
  assert app_security.request_user_id() is null, 'revoked session must fail RLS';
  rejected := false;
  begin update public.app_users set is_suspended=false where id=target_id;
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'direct status updates must be denied';
  assert public.set_app_user_suspended(admin_token,target_id,false);
  assert (public.login_app_user(prefix||'-target','test-password')->>'taskSessionToken') is not null;
  rejected := false;
  begin perform public.resolve_task_session(target_token);
    exception when others then rejected := true; end;
  assert rejected, 'reactivation must not restore old sessions';
  reset role;
  -- A second administrator can also be suspended and reactivated.
  update public.app_users set role='admin' where id=target_id;
  set local role anon;
  assert public.set_app_user_suspended(admin_token,target_id,true);
  assert public.set_app_user_suspended(admin_token,target_id,false);
  reset role;
end;
$$;
rollback;
