begin;
do $$
declare
  actor uuid := gen_random_uuid(); w text := 'revision-test-'||gen_random_uuid();
  token text := encode(extensions.gen_random_bytes(32),'hex');
  first_revision text; next_revision text; failed boolean;
begin
  insert into public.workspaces(id,name,created_at,updated_at) values(w,'Revision test',now(),now());
  insert into public.app_users(id,username,password,full_name,role,workspaces)
    values(actor,w,'test-only','Revision test','admin',array[w]);
  insert into public.app_task_sessions(user_id,token_hash) values(actor,extensions.digest(token,'sha256'));
  set local role anon;
  first_revision := public.get_offline_workspace_revision(token,w);
  assert first_revision=public.get_offline_workspace_revision(token,w), 'unchanged workspace has stable revision';
  failed:=false;
  begin perform public.get_offline_workspace_revision('invalid',w);
    exception when others then failed:=true; assert sqlerrm='TASK_SESSION_INVALID'; end;
  assert failed, 'requires valid session';
  failed:=false;
  begin perform public.get_offline_workspace_revision(token,'another-workspace');
    exception when others then failed:=true; end;
  assert failed, 'workspace access enforced';
  reset role;
  insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id) values(w||'-n','TEST','Offline','Homme','Test',w);
  next_revision:=public.get_offline_workspace_revision(token,w);
  assert first_revision<>next_revision, 'creation changes revision';
  update public.identification set adresse='Changed' where nif=w||'-n';
  assert next_revision<>public.get_offline_workspace_revision(token,w), 'edit changes revision';
  delete from public.identification where nif=w||'-n';
  assert first_revision=public.get_offline_workspace_revision(token,w), 'hard deletion reconciles content';
end;
$$;
rollback;
