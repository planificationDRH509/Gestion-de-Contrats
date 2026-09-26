-- Integration checks against the application schema; every fixture is rolled back.
begin;
do $$
declare
  w text := 'lists-test-' || gen_random_uuid();
  actor uuid := gen_random_uuid(); agent uuid := gen_random_uuid(); reader_id uuid := gen_random_uuid();
  admin_token text := encode(extensions.gen_random_bytes(32),'hex');
  agent_token text := encode(extensions.gen_random_bytes(32),'hex');
  reader_token text := encode(extensions.gen_random_bytes(32),'hex');
  a uuid; b uuid; c uuid; snapshot jsonb; v integer; failed boolean;
begin
  insert into public.workspaces(id,name,created_at,updated_at) values(w,'Temporary list tests',now(),now());
  insert into public.app_users(id,username,password,full_name,role,workspaces) values
    (actor,w||'-admin','test-only','Test Admin','admin',array[w]),
    (agent,w||'-agent','test-only','Test Agent','agent',array[w]),
    (reader_id,w||'-reader','test-only','Test Reader','reader',array[w]);
  insert into public.app_task_sessions(user_id,token_hash) values
    (actor,extensions.digest(admin_token,'sha256')),
    (agent,extensions.digest(agent_token,'sha256')),
    (reader_id,extensions.digest(reader_token,'sha256'));
  insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id) values
    (w||'-n1','LOUIS','Louvens','Homme','Test',w),
    (w||'-n2','ÉTIENNE','Ana','Femme','Test',w);
  insert into public.contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id) values
    (w||'-c1',w||'-n1',6,'2025-2026',100,'Test','Test',w),
    (w||'-c2',w||'-n2',6,'2025-2026',200,'Test','Test',w),
    (w||'-c3',w||'-n1',12,'2026-2027',300,'Test','Test',w);

  -- Use the actual API role: the RPC validates the opaque application session.
  set local role anon;
  a := public.mutate_contract_list(admin_token,w,'{"action":"create","durationMonths":6}');
  b := public.mutate_contract_list(agent_token,w,'{"action":"create","durationMonths":6,"visaNumber":"V-TEST"}');
  perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','assign','listId',a,'contractIds',jsonb_build_array(w||'-c1',w||'-c2')));
  snapshot := public.read_contract_lists(reader_token,w);
  assert jsonb_array_length(snapshot)=2, 'readers can read both lots';
  assert (select jsonb_array_length(l->'members') from jsonb_array_elements(snapshot) l where l->>'id'=a::text)=2, 'members returned';

  failed := false;
  begin perform public.read_contract_lists('invalid',w); exception when others then failed:=true; assert sqlerrm like '%TASK_SESSION%'; end;
  assert failed, 'invalid sessions rejected';
  failed := false;
  begin perform public.read_contract_lists(admin_token,'workspace_mouvement'); exception when others then failed:=true; assert sqlerrm like '%autorisé%'; end;
  assert failed, 'other workspace rejected';
  failed := false;
  begin perform public.mutate_contract_list(reader_token,w,'{"action":"create","durationMonths":6}'); exception when others then failed:=true; assert sqlerrm like '%droit%'; end;
  assert failed, 'reader writes rejected';
  failed := false;
  begin perform 1 from public.contract_lists; exception when insufficient_privilege then failed:=true; end;
  assert failed, 'direct table reads denied';
  failed := false;
  begin insert into public.contract_lists(workspace_id,duration_months) values(w,6); exception when insufficient_privilege then failed:=true; end;
  assert failed, 'direct table writes denied';

  failed := false;
  begin perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','assign','listId',b,'contractIds',jsonb_build_array(w||'-c1',w||'-c3')));
  exception when others then failed:=true; assert sqlerrm like '%même durée%'; end;
  assert failed, 'mixed durations rejected';
  snapshot := public.read_contract_lists(admin_token,w);
  assert (select jsonb_array_length(l->'members') from jsonb_array_elements(snapshot) l where l->>'id'=a::text)=2, 'batch rollback preserved source';

  perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','assign','listId',b,'contractIds',jsonb_build_array(w||'-c2')));
  snapshot := public.read_contract_lists(admin_token,w);
  assert (select jsonb_array_length(l->'members') from jsonb_array_elements(snapshot) l where l->>'id'=a::text)=1, 'exclusive move';
  select (l->>'version')::integer into v from jsonb_array_elements(snapshot) l where l->>'id'=b::text;
  failed := false;
  begin perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','seal','listId',b,'version',v-1));
  exception when others then failed:=true; assert sqlerrm like '%changé%'; end;
  assert failed, 'stale confirmation rejected';
  perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','seal','listId',b,'version',v));
  failed := false;
  begin perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','assign','listId',a,'contractIds',jsonb_build_array(w||'-c2')));
  exception when others then failed:=true; assert sqlerrm like '%scellée%'; end;
  assert failed, 'sealed source rejected';
  failed := false;
  begin perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','assign','listId',b,'contractIds',jsonb_build_array(w||'-c1')));
  exception when others then failed:=true; assert sqlerrm like '%scellée%'; end;
  assert failed, 'sealed destination rejected';

  -- Creation and assignment share a transaction, including all source moves.
  failed := false;
  begin perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','create','durationMonths',6,'contractIds',jsonb_build_array(w||'-c1',w||'-c3')));
  exception when others then failed:=true; assert sqlerrm like '%même durée%'; end;
  assert failed, 'mixed creation rejected';
  assert jsonb_array_length(public.read_contract_lists(admin_token,w))=2, 'failed creation leaves no empty lot';
  failed := false;
  begin perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','create','durationMonths',6,'contractIds',jsonb_build_array(w||'-c1',w||'-c2')));
  exception when others then failed:=true; assert sqlerrm like '%scellée%'; end;
  assert failed, 'creation from sealed source rejected';
  snapshot := public.read_contract_lists(admin_token,w);
  assert jsonb_array_length(snapshot)=2, 'sealed creation leaves no empty lot';
  assert (select jsonb_array_length(l->'members') from jsonb_array_elements(snapshot) l where l->>'id'=a::text)=1, 'creation rollback preserved source';
  c := public.mutate_contract_list(admin_token,w,jsonb_build_object('action','create','durationMonths',6,'contractIds',jsonb_build_array(w||'-c1')));
  snapshot := public.read_contract_lists(admin_token,w);
  assert (select jsonb_array_length(l->'members') from jsonb_array_elements(snapshot) l where l->>'id'=c::text)=1, 'new list populated';
  perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','assign','listId',a,'contractIds',jsonb_build_array(w||'-c1')));
  snapshot := public.read_contract_lists(admin_token,w);
  select (l->>'version')::integer into v from jsonb_array_elements(snapshot) l where l->>'id'=c::text;
  perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','delete','listId',c,'version',v));

  -- Existing contract API writes also go through the database guards.
  failed := false;
  begin update public.contrat set salaire_en_chiffre=999 where id_contrat=w||'-c2'; exception when others then failed:=true; assert sqlerrm like '%scellée%'; end;
  assert failed, 'sealed amount protected';
  failed := false;
  begin update public.identification set nom='CHANGED' where nif=w||'-n2'; exception when others then failed:=true; assert sqlerrm like '%scellée%'; end;
  assert failed, 'sealed identity protected';
  failed := false;
  begin update public.contrat set deleted_at=now() where id_contrat=w||'-c2'; exception when others then failed:=true; assert sqlerrm like '%scellée%'; end;
  assert failed, 'sealed soft deletion protected';
  failed := false;
  begin update public.contrat set duree_contrat=12 where id_contrat=w||'-c1'; exception when others then failed:=true; assert sqlerrm like '%durée%'; end;
  assert failed, 'open lot duration protected';
  update public.contrat set status='transfere' where id_contrat=w||'-c2';
  snapshot := public.read_contract_lists(admin_token,w);
  select (l->>'version')::integer into v from jsonb_array_elements(snapshot) l where l->>'id'=b::text;
  failed := false;
  begin perform public.mutate_contract_list(agent_token,w,jsonb_build_object('action','reopen','listId',b,'version',v,'reason','Test'));
  exception when others then failed:=true; assert sqlerrm like '%administrateur%'; end;
  assert failed, 'only admin reopens';
  failed := false;
  begin perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','reopen','listId',b,'version',v,'reason',' '));
  exception when others then failed:=true; assert sqlerrm like '%motif%'; end;
  assert failed, 'reason required';
  perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','reopen','listId',b,'version',v,'reason','Correction test'));
  perform public.mutate_contract_list(admin_token,w,jsonb_build_object('action','assign','listId',null,'contractIds',jsonb_build_array(w||'-c2')));
  update public.contrat set deleted_at=now() where id_contrat=w||'-c1';
  snapshot := public.read_contract_lists(admin_token,w);
  assert (select sum(jsonb_array_length(l->'members')) from jsonb_array_elements(snapshot) l)=0, 'removed and deleted contracts absent';
  reset role;
end;
$$;
rollback;
select 'Contract list integration checks passed; fixtures rolled back.' as result;
