-- Run with psql ON_ERROR_STOP=1. All fixtures are rolled back.
begin;
do $$
declare
  w text := 'security-' || gen_random_uuid();
  other_w text := 'security-other-' || gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  agent_id uuid := gen_random_uuid();
  reader_id uuid := gen_random_uuid();
  controller_id uuid := gen_random_uuid();
  admin_token text; agent_token text; reader_token text; controller_token text;
  login_result jsonb; rejected boolean; affected integer; n bigint; t record;
begin
  insert into public.workspaces(id,name,created_at,updated_at)
    values(w,'Security test',now(),now()),(other_w,'Other partition',now(),now());
  insert into public.app_users(id,username,password,full_name,role,workspaces) values
    (admin_id,w||'-admin','test-password','Test Admin','admin',array[w]),
    (agent_id,w||'-agent','test-password','Test Agent','agent',array[w]),
    (reader_id,w||'-reader','test-password','Test Reader','reader',array[w]),
    (controller_id,w||'-controller','test-password','Test Controller','controller',array[w]);
  assert (select bool_and(password = '' and password_hash <> 'test-password') from public.app_users
    where id in (admin_id,agent_id,reader_id,controller_id)), 'passwords must only be stored as hashes';
  insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id)
    values(w||'-person','Test','Person','Homme','Test',w),
      (other_w||'-person','Other','Person','Femme','Test',other_w);
  insert into public.contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id)
    values(w||'-contract',w||'-person',6,'2025-2026',100,'Test','Test',w),
      (other_w||'-contract',other_w||'-person',6,'2025-2026',100,'Test','Test',other_w);

  -- A publishable key alone must not reveal any application rows.
  perform set_config('request.headers','{}',true);
  set local role anon;
  for t in select table_name from information_schema.tables where table_schema='public' loop
    begin
      execute format('select count(*) from public.%I',t.table_name) into n;
      assert n = 0, format('anonymous read leaked data in %s',t.table_name);
    exception when insufficient_privilege then null;
    end;
  end loop;
  rejected := false;
  begin perform password from public.app_users;
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'password column must not be readable';
  rejected := false;
  begin insert into public.app_users(username,password,full_name,role,workspaces)
    values(w||'-intruder','test-password','Intruder','admin',array[w]);
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'anonymous account creation must fail';

  -- The authenticated JWT role alone is also insufficient for this custom auth app.
  set local role authenticated;
  assert (select count(*) from public.contrat) = 0, 'JWT without app session must not read contracts';
  set local role anon;
  perform set_config('request.headers','{"x-app-session":"forged-token","role":"admin"}',true);
  assert (select count(*) from public.contrat) = 0, 'forged session must not read contracts';
  assert (public.login_app_user(w||'-admin','wrong-password')->>'error')='TASK_SESSION_INVALID_CREDENTIALS', 'wrong password must fail';
  login_result := public.login_app_user(w||'-admin','test-password');
  assert not (login_result ? 'password' or login_result ? 'password_hash'), 'login must not return credentials';
  admin_token := login_result->>'taskSessionToken';
  agent_token := public.create_task_session(agent_id,'test-password');
  reader_token := public.create_task_session(reader_id,'test-password');
  controller_token := public.create_task_session(controller_id,'test-password');

  -- Reader: permitted reads/printing, denied writes and privilege escalation.
  perform set_config('request.headers',jsonb_build_object('x-app-session',reader_token)::text,true);
  assert (select count(*) from public.contrat where workspace_id=w) = 1, 'reader sees own partition';
  assert (select count(*) from public.contrat where workspace_id=other_w) = 0, 'other partition hidden';
  assert (select count(*) from public.identification where workspace_id=other_w) = 0, 'other identities hidden';
  update public.contrat set titre='forbidden' where id_contrat=w||'-contract';
  get diagnostics affected = row_count;
  assert affected = 0, 'reader cannot edit';
  update public.app_users set role='admin' where id=reader_id;
  get diagnostics affected = row_count;
  assert affected = 0, 'reader cannot promote themselves';
  rejected := false;
  begin insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id)
    values(w||'-forbidden','Test','Test','Homme','Test',w);
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'reader cannot create identities';
  insert into public.contract_print_jobs(id,workspace_id,contract_ids_json,created_at)
    values(w||'-print',w,'[]',now());
  rejected := false;
  begin perform password_hash from public.app_users;
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'signed-in reader cannot read password hashes';
  assert not has_table_privilege('anon','public.contrat','TRUNCATE'), 'RLS must not be bypassed through TRUNCATE';

  -- Agent: allowed creation/editing, denied status/deletion and foreign partitions.
  perform set_config('request.headers',jsonb_build_object('x-app-session',agent_token)::text,true);
  update public.contrat set titre='Allowed edit' where id_contrat=w||'-contract';
  get diagnostics affected = row_count;
  assert affected = 1, 'agent can edit';
  insert into public.contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id)
    values(w||'-new-contract',w||'-person',6,'2026-2027',100,'Test','Test',w);
  assert (select created_by=agent_id from public.contrat where id_contrat=w||'-new-contract'), 'creator comes from server session';
  rejected := false;
  begin update public.contrat set status='signe' where id_contrat=w||'-contract';
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'agent cannot change status';
  rejected := false;
  begin update public.contrat set deleted_at=now() where id_contrat=w||'-contract';
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'agent cannot soft-delete contracts';
  rejected := false;
  begin update public.contrat set workspace_id=other_w where id_contrat=w||'-contract';
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'agent cannot move a row to another partition';
  rejected := false;
  begin update public.contrat set nif=other_w||'-person' where id_contrat=w||'-contract';
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'foreign identity references must fail';

  perform set_config('request.headers',jsonb_build_object('x-app-session',controller_token)::text,true);
  update public.contrat set status='signe' where id_contrat=w||'-contract';
  get diagnostics affected = row_count;
  assert affected = 1, 'controller may change status';

  -- Administrator: account creation/role management works, no secret reads.
  perform set_config('request.headers',jsonb_build_object('x-app-session',admin_token)::text,true);
  insert into public.app_users(username,password,full_name,role,workspaces)
    values(w||'-new-user','new-password','Created User','reader',array[w]);
  update public.app_users set role='agent' where id=reader_id;
  get diagnostics affected = row_count;
  assert affected = 1, 'administrator can change another role';
  rejected := false;
  begin perform password from public.app_users;
    exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'even administrators cannot retrieve passwords';
  update public.app_users set role='reader' where id=admin_id;
  get diagnostics affected = row_count;
  assert affected = 0, 'administrator cannot change their own role';
  assert public.resolve_task_session(admin_token)=admin_id, 'RPC wrappers preserve token resolution';
  perform public.read_contract_lists(admin_token,w);
  perform public.list_private_tasks(admin_token);
  perform public.read_pinned_contracts(admin_token);

  -- Expired/revoked sessions no longer grant REST access.
  perform public.revoke_task_session(reader_token);
  perform set_config('request.headers',jsonb_build_object('x-app-session',reader_token)::text,true);
  assert (select count(*) from public.contrat)=0, 'revoked token denied';
  reset role;
  update public.app_task_sessions set expires_at=now()-interval '1 second'
    where token_hash=extensions.digest(controller_token,'sha256');
  set local role anon;
  perform set_config('request.headers',jsonb_build_object('x-app-session',controller_token)::text,true);
  assert (select count(*) from public.contrat)=0, 'expired token denied';

  assert public.change_app_user_password(admin_token,'test-password','new-admin-password'), 'password change works';
  perform set_config('request.headers',jsonb_build_object('x-app-session',admin_token)::text,true);
  assert (select count(*) from public.contrat)=0, 'password change revokes prior sessions';
  login_result := public.login_app_user(w||'-admin','new-admin-password');
  assert length(login_result->>'taskSessionToken')=64, 'new password authenticates';
  reset role;
  assert not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), 'all public tables have RLS';
  assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef), 'no privileged functions exposed in public';
end;
$$;
rollback;
