begin;
do $$
declare a uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); g uuid:=gen_random_uuid();
  at text:=gen_random_uuid()::text; rt text:=gen_random_uuid()::text; gt text:=gen_random_uuid()::text;
begin
  insert into public.app_users(id,username,full_name,password,role,workspaces) values
    (a,'ref-admin-'||a,'Test','unused','admin',array['workspace_default']),
    (r,'ref-reader-'||r,'Test','unused','reader',array['workspace_default']),
    (g,'ref-agent-'||g,'Test','unused','agent',array['workspace_default']);
  insert into public.app_task_sessions(user_id,token_hash,expires_at) values
    (a,extensions.digest(at,'sha256'),now()+interval '5 minutes'),
    (r,extensions.digest(rt,'sha256'),now()+interval '5 minutes'),
    (g,extensions.digest(gt,'sha256'),now()+interval '5 minutes');
  perform set_config('test.ref_admin',at,true); perform set_config('test.ref_reader',rt,true); perform set_config('test.ref_agent',gt,true);
end $$;
set local role anon;
do $$
declare token text:=current_setting('test.ref_admin'); old jsonb; next jsonb; change jsonb; result jsonb; replay jsonb;
  rejected boolean; op text:=gen_random_uuid()::text; iid text; initial text;
begin
  change := '{"scope":"addresses","patches":[{"id":"ref-address-test","before":null,"after":{"id":"ref-address-test","label":"Adresse test","order":0}}]}'::jsonb;
  rejected:=false;
  begin perform public.sync_reference_change('bad',op,'workspace_default',change); exception when others then rejected:=true; end;
  assert rejected,'Invalid session accepted';
  rejected:=false;
  begin perform public.sync_reference_change(current_setting('test.ref_reader'),op,'workspace_default',change); exception when others then rejected:=true; end;
  assert rejected,'Reader mutation accepted';
  rejected:=false;
  begin perform public.sync_reference_change(token,op,'workspace_avantages',change); exception when others then rejected:=true; end;
  assert rejected,'Foreign workspace accepted';
  result:=public.sync_reference_change(token,op,'workspace_default',change);
  replay:=public.sync_reference_change(token,op,'workspace_default',change);
  assert result=replay,'Replay result changed';
  rejected:=false;
  begin perform public.sync_reference_change(token,op,'workspace_default',change || '{"learn":true}'); exception when others then rejected:=true; end;
  assert rejected,'Reused operation accepted different payload';
  old:=result; next:=old || '{"label":"Adresse modifiée"}';
  change:=jsonb_build_object('scope','addresses','patches',jsonb_build_array(jsonb_build_object('id',old->>'id','before',old,'after',next)));
  result:=public.sync_reference_change(token,gen_random_uuid()::text,'workspace_default',change);
  assert result->>'label'='Adresse modifiée','Address update failed';
  rejected:=false;
  begin perform public.sync_reference_change(token,gen_random_uuid()::text,'workspace_default',change); exception when others then rejected:=true; end;
  assert rejected,'Stale address update accepted';
  change:=jsonb_build_object('scope','addresses','patches',jsonb_build_array(jsonb_build_object('id',result->>'id','before',result,'after',null)));
  perform public.sync_reference_change(token,gen_random_uuid()::text,'workspace_default',change);
  assert not exists(select 1 from public.autocompletion where id='ref-address-test'),'Delete failed';
  rejected:=false;
  begin perform public.sync_reference_change(current_setting('test.ref_agent'),gen_random_uuid()::text,'workspace_default',change || '{"learn":true}'); exception when others then rejected:=true; end;
  assert rejected,'Agent forged deletion as learning';

  old:=public.read_salary_grid(token)->0; next:=old || jsonb_build_object('notes','Local edit','version',(old->>'version')::integer+1);
  change:=jsonb_build_object('scope','salary','patches',jsonb_build_array(jsonb_build_object('id',old->>'id','before',old,'after',next)));
  op:=gen_random_uuid()::text;
  result:=public.sync_reference_change(token,op,'workspace_default',change);
  replay:=public.sync_reference_change(token,op,'workspace_default',change);
  assert result=replay,'Salary replay incremented version';
  assert exists(select 1 from jsonb_array_elements(result) e where e->>'id'=old->>'id' and e->>'notes'='Local edit' and (e->>'version')::integer=(old->>'version')::integer+1),'Salary update failed';
  rejected:=false;
  begin perform public.sync_reference_change(token,gen_random_uuid()::text,'workspace_default',change); exception when others then rejected:=true; end;
  assert rejected,'Stale salary update accepted';

  old:=public.read_institution_prepositions(token)->0; next:=old || jsonb_build_object('prefix','auprès de','version',(old->>'version')::integer+1);
  change:=jsonb_build_object('scope','prepositions','patches',jsonb_build_array(jsonb_build_object('id',old->>'family','before',old,'after',next)));
  op:=gen_random_uuid()::text; result:=public.sync_reference_change(token,op,'workspace_default',change);
  assert public.sync_reference_change(token,op,'workspace_default',change)=result,'Preposition replay changed';

  change:='{"scope":"institutions","learn":true,"patches":[{"id":"temporary-id","before":null,"after":{"id":"temporary-id","label":"Institution apprise pour test local","institutionType":"Autre","addressKeywords":[],"version":1}}]}'::jsonb;
  result:=public.sync_reference_change(current_setting('test.ref_agent'),gen_random_uuid()::text,'workspace_default',change);
  iid:=result->>'id'; assert iid is not null,'Institution learning failed';
  old:=result; next:=old || jsonb_build_object('label','Institution renommée pour test local','version',2);
  change:=jsonb_build_object('scope','institutions','patches',jsonb_build_array(jsonb_build_object('id',iid,'before',old,'after',next)));
  result:=public.sync_reference_change(token,gen_random_uuid()::text,'workspace_default',change);
  assert result->>'version'='2','Institution version not incremented';
  change:=jsonb_build_object('scope','institutions','patches',jsonb_build_array(jsonb_build_object('id',iid,'before',result,'after',null)));
  perform public.sync_reference_change(token,gen_random_uuid()::text,'workspace_default',change);
  assert not exists(select 1 from public.autocompletion where id=iid),'Institution delete failed';

  initial:=public.read_ministers(token)->>'currentMinisterId';
  next:='{"id":"local-minister-test","fullName":"Ministre Test","gender":"Homme","nif":"987-654-321-0","ninu":"9876543210","mandateStartDate":"2026-01-01","mandateEndDate":null}'::jsonb;
  change:=jsonb_build_object('scope','ministers','patches',jsonb_build_array(jsonb_build_object('id',next->>'id','before',null,'after',next)),
    'input',jsonb_build_object('action','add','minister',next));
  result:=public.sync_reference_change(token,gen_random_uuid()::text,'workspace_default',change);
  assert exists(select 1 from jsonb_array_elements(result->'ministers') m where m->>'id'='local-minister-test'),'Minister add failed';
  change:=jsonb_build_object('scope','ministers','patches','[]'::jsonb,'input',jsonb_build_object('action','select','ministerId','local-minister-test','expectedMinisterId',initial));
  op:=gen_random_uuid()::text; result:=public.sync_reference_change(token,op,'workspace_default',change);
  assert result->>'currentMinisterId'='local-minister-test','Minister selection failed';
  assert public.sync_reference_change(token,op,'workspace_default',change)=result,'Minister replay failed';
  rejected:=false;
  begin perform public.sync_reference_change(token,gen_random_uuid()::text,'workspace_default',change); exception when others then rejected:=true; end;
  assert rejected,'Concurrent minister selection overwritten';
  rejected:=false;
  begin perform 1 from reference_private.receipts; exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Receipts exposed';
end $$;
rollback;
