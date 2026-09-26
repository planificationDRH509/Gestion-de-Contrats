begin;
do $$
declare admin_id uuid := gen_random_uuid(); reader_id uuid := gen_random_uuid();
  admin_token text := gen_random_uuid()::text; reader_token text := gen_random_uuid()::text;
begin
  insert into public.app_users(id,username,full_name,password,role,workspaces) values
    (admin_id,'salary-test-'||admin_id,'Salary test','unused','admin',array['workspace_default']),
    (reader_id,'salary-test-'||reader_id,'Salary test','unused','reader',array['workspace_default']);
  insert into public.app_task_sessions(user_id,token_hash,expires_at) values
    (admin_id,extensions.digest(admin_token,'sha256'),now()+interval '5 minutes'),
    (reader_id,extensions.digest(reader_token,'sha256'),now()+interval '5 minutes');
  perform set_config('test.salary_admin',admin_token,true);
  perform set_config('test.salary_reader',reader_token,true);
end $$;
set local role anon;
do $$
declare payload jsonb; result jsonb; rejected boolean := false;
begin
  begin perform public.read_salary_grid('bad'); exception when others then rejected := sqlerrm='TASK_SESSION_INVALID'; end;
  if not rejected then raise exception 'Invalid session accepted'; end if;
  result := public.read_salary_grid(current_setting('test.salary_reader'));
  if jsonb_array_length(result) <> 141 then raise exception 'Unexpected seed count'; end if;
  if exists(select 1 from jsonb_array_elements(result) e where e->>'category' in ('Personnel policier','Personnel enseignant')) then raise exception 'Excluded category imported'; end if;
  payload := jsonb_build_object('id','salary-grid-test','masculine','Test infirmier','feminine','Test infirmière','category','Personnel médical','salaries',jsonb_build_array(37200),'aliases','[]'::jsonb,'effectiveDate','2022-04-01','source','test','sourceRows','[]'::jsonb,'notes','','active',true,'version',0);
  rejected := false;
  begin perform public.save_salary_grid_entry(current_setting('test.salary_reader'),payload); exception when others then rejected := sqlerrm like 'Modification réservée%'; end;
  if not rejected then raise exception 'Reader write accepted'; end if;
  result := public.save_salary_grid_entry(current_setting('test.salary_admin'),payload);
  if not exists(select 1 from jsonb_array_elements(result) e where e->>'id'='salary-grid-test' and e->>'version'='1') then raise exception 'Admin insert failed'; end if;
  payload := payload || '{"version":1,"salaries":[40000]}'::jsonb;
  result := public.save_salary_grid_entry(current_setting('test.salary_admin'),payload);
  if not exists(select 1 from jsonb_array_elements(result) e where e->>'id'='salary-grid-test' and e->>'version'='2' and e->'salaries'='[40000]'::jsonb) then raise exception 'Admin update failed'; end if;
  rejected := false;
  begin perform public.save_salary_grid_entry(current_setting('test.salary_admin'),payload); exception when others then rejected := sqlerrm like 'Cette ligne a changé%'; end;
  if not rejected then raise exception 'Concurrent update accepted'; end if;
  rejected := false;
  begin perform public.save_salary_grid_entry(current_setting('test.salary_admin'),payload || '{"version":2,"salaries":[-1]}'::jsonb); exception when others then rejected := sqlerrm='Salaires invalides.'; end;
  if not rejected then raise exception 'Negative salary accepted'; end if;
  rejected := false;
  begin perform * from public.salary_grid; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Direct anon access accepted'; end if;
end $$;
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin perform * from public.salary_grid; exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Direct authenticated access accepted'; end if;
  perform public.read_salary_grid(current_setting('test.salary_reader'));
end $$;
rollback;
