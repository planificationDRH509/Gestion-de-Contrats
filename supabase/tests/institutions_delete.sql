begin;
do $$
declare admin_id uuid := gen_random_uuid(); reader_id uuid := gen_random_uuid();
  admin_token text := gen_random_uuid()::text; reader_token text := gen_random_uuid()::text;
begin
  insert into public.app_users(id,username,full_name,password,role,workspaces) values
    (admin_id,'salary-test-'||admin_id,'Salary test',gen_random_uuid()::text,'admin',array['workspace_default']),
    (reader_id,'salary-test-'||reader_id,'Salary test',gen_random_uuid()::text,'reader',array['workspace_default']);
  insert into public.app_task_sessions(user_id,token_hash,expires_at) values
    (admin_id,extensions.digest(admin_token,'sha256'),now()+interval '5 minutes'),
    (reader_id,extensions.digest(reader_token,'sha256'),now()+interval '5 minutes');
  perform set_config('test.salary_admin',admin_token,true);
  perform set_config('test.salary_reader',reader_token,true);
end $$;
set local role anon;
do $$
declare token text:=current_setting('test.salary_admin'); entry jsonb; change jsonb; result jsonb;
  op text:=gen_random_uuid()::text; entry_id text:=gen_random_uuid()::text; rejected boolean;
begin
  entry:=jsonb_build_object('id',entry_id,'label','Institution test '||entry_id,'institutionType','Autre','addressKeywords','[]'::jsonb,'version',0);
  entry:=public.save_institution(token,'workspace_default',entry);
  change:=jsonb_build_object('scope','institutions','patches',jsonb_build_array(jsonb_build_object('id',entry->>'id','before',entry,'after',null)));
  rejected:=false;
  begin perform public.sync_reference_change(current_setting('test.salary_reader'),op,'workspace_default',change);
    exception when others then rejected:=sqlerrm='Modification non autorisée.'; end;
  assert rejected, 'Reader deletion accepted';
  perform public.save_institution(token,'workspace_default',entry || '{"institutionType":"Hôpital"}');
  rejected:=false;
  begin perform public.sync_reference_change(token,op,'workspace_default',change);
    exception when others then rejected:=sqlerrm='Cette institution a changé.'; end;
  assert rejected, 'Stale deletion accepted';
  change:=jsonb_set(change,'{patches,0,before,version}','2');
  result:=public.sync_reference_change(token,op,'workspace_default',change);
  assert result='null'::jsonb, 'Deletion failed';
  assert not exists(select 1 from public.autocompletion where id=entry->>'id'), 'Deleted institution still present';
  assert result=public.sync_reference_change(token,op,'workspace_default',change), 'Replay failed';
end $$;
rollback;
