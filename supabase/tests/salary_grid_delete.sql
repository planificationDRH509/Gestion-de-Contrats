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
declare token text:=current_setting('test.salary_admin'); entry jsonb; result jsonb; change jsonb;
  op text:=gen_random_uuid()::text; entry_id text:=gen_random_uuid()::text; rejected boolean;
begin
  entry:=jsonb_build_object('id',entry_id,'masculine','Test suppression '||entry_id,'feminine','Test suppression '||entry_id,
    'category','Test','jobType','Technique','salaries','[1000]'::jsonb,'aliases','[]'::jsonb,'sourceRows','[]'::jsonb,'active',true,'version',0);
  perform public.save_salary_grid_entry(token,entry);
  entry:=entry || '{"version":1}'::jsonb;
  change:=jsonb_build_object('scope','salary','patches',jsonb_build_array(jsonb_build_object('id',entry_id,'before',entry,'after',null)));
  rejected:=false;
  begin perform public.sync_reference_change(current_setting('test.salary_reader'),op,'workspace_default',change);
    exception when others then rejected:=sqlerrm='Modification non autorisée.'; end;
  assert rejected, 'Reader delete accepted';
  rejected:=false;
  begin perform public.sync_reference_change('invalid',op,'workspace_default',change);
    exception when others then rejected:=sqlerrm='TASK_SESSION_INVALID'; end;
  assert rejected, 'Invalid session delete accepted';
  perform public.save_salary_grid_entry(token,entry || '{"notes":"Modification concurrente"}');
  rejected:=false;
  begin perform public.sync_reference_change(token,op,'workspace_default',change);
    exception when others then rejected:=sqlerrm='Cette ligne a changé. Rechargez la grille.'; end;
  assert rejected, 'Stale deletion accepted';
  assert exists(select 1 from jsonb_array_elements(public.read_salary_grid(token)) e where e->>'id'=entry_id), 'Conflict removed entry';
  change:=jsonb_set(change,'{patches,0,before,version}','2');
  result:=public.sync_reference_change(token,op,'workspace_default',change);
  assert not exists(select 1 from jsonb_array_elements(result) e where e->>'id'=entry_id), 'Deleted entry still returned';
  assert not exists(select 1 from jsonb_array_elements(public.read_salary_grid(token)) e where e->>'id'=entry_id), 'Delete not persisted';
  assert result=public.sync_reference_change(token,op,'workspace_default',change), 'Delete replay failed';
end $$;
rollback;
