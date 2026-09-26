-- Run inside a transaction; fixtures are always rolled back.
begin;
do $$
declare
  w text := 'offline-lists-test-' || gen_random_uuid();
  actor uuid := gen_random_uuid(); reader_id uuid := gen_random_uuid();
  token text := encode(extensions.gen_random_bytes(32),'hex');
  reader_token text := encode(extensions.gen_random_bytes(32),'hex');
  lot uuid := gen_random_uuid(); request_id uuid := gen_random_uuid();
  op jsonb; expected jsonb; memberships jsonb; current_list jsonb; result_id uuid; failed boolean;
begin
  insert into public.workspaces(id,name,created_at,updated_at) values(w,'Offline list tests',now(),now());
  insert into public.app_users(id,username,password,full_name,role,workspaces) values
    (actor,w||'-admin','test-only','Offline Admin','admin',array[w]),
    (reader_id,w||'-reader','test-only','Offline Reader','reader',array[w]);
  insert into public.app_task_sessions(user_id,token_hash) values
    (actor,extensions.digest(token,'sha256')),(reader_id,extensions.digest(reader_token,'sha256'));
  insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id) values(w||'-n','LOUIS','Ana','Femme','Test',w);
  insert into public.contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id)
    values(w||'-c',w||'-n',6,'2025-2026',100,'Test','Test',w);
  op := jsonb_build_object('action','create','createId',lot,'durationMonths',6,'contractIds',jsonb_build_array(w||'-c'));
  expected := jsonb_build_object(lot::text,null);
  memberships := jsonb_build_object(w||'-c',null);
  set local role anon;
  result_id := public.sync_contract_list(token,w,request_id,op,expected,memberships);
  assert result_id=lot, 'stable offline ID';
  assert public.sync_contract_list(token,w,request_id,op,expected,memberships)=lot, 'lost ACK retry';
  assert jsonb_array_length(public.read_contract_lists(token,w))=1, 'no duplicate create';
  failed:=false;
  begin perform public.sync_contract_list(token,w,request_id,op||'{"visaNumber":"other"}',expected,memberships);
  exception when others then failed:=true; assert sqlerrm like '%déjà utilisé%'; end;
  assert failed, 'idempotency key cannot be reused with different contents';
  failed:=false;
  begin perform public.sync_contract_list(reader_token,w,gen_random_uuid(),op,expected,memberships);
  exception when others then failed:=true; assert sqlerrm like '%droit%'; end;
  assert failed, 'read-only role rejected';
  failed:=false;
  begin perform public.sync_contract_list('invalid',w,gen_random_uuid(),op,expected,memberships);
  exception when others then failed:=true; assert sqlerrm like '%TASK_SESSION%'; end;
  assert failed, 'expired sessions rejected';
  reset role;
  select l into current_list from jsonb_array_elements(public.read_contract_lists(token,w)) l where l->>'id'=lot::text;
  expected := jsonb_build_object(lot::text,list_private.offline_snapshot(current_list));
  set local role anon;
  -- The queued local version can differ from the server's trigger increments.
  perform public.sync_contract_list(token,w,gen_random_uuid(),jsonb_build_object('action','seal','listId',lot,'version',999),expected,'{}');
  assert (public.read_contract_lists(token,w)->0->>'sealedAt') is not null, 'offline seal applied';
  failed:=false;
  begin perform public.sync_contract_list(token,w,gen_random_uuid(),jsonb_build_object('action','visa','listId',lot,'visaNumber','stale'),expected,'{}');
  exception when others then failed:=true; assert sqlerrm like '%Conflit de liste%'; end;
  assert failed, 'concurrent server changes preserved';
  reset role;
  select l into current_list from jsonb_array_elements(public.read_contract_lists(token,w)) l where l->>'id'=lot::text;
  expected := jsonb_build_object(lot::text,list_private.offline_snapshot(current_list));
  set local role anon;
  perform public.sync_contract_list(token,w,gen_random_uuid(),jsonb_build_object('action','reopen','listId',lot,'reason','Correction'),expected,'{}');
  reset role;
  select l into current_list from jsonb_array_elements(public.read_contract_lists(token,w)) l where l->>'id'=lot::text;
  expected := jsonb_build_object(lot::text,list_private.offline_snapshot(current_list));
  set local role anon;
  perform public.sync_contract_list(token,w,gen_random_uuid(),jsonb_build_object('action','assign','listId',null,'contractIds',jsonb_build_array(w||'-c')),expected,jsonb_build_object(w||'-c',lot));
  reset role;
  select l into current_list from jsonb_array_elements(public.read_contract_lists(token,w)) l where l->>'id'=lot::text;
  expected := jsonb_build_object(lot::text,list_private.offline_snapshot(current_list));
  request_id := gen_random_uuid(); op := jsonb_build_object('action','delete','listId',lot);
  set local role anon;
  perform public.sync_contract_list(token,w,request_id,op,expected,'{}');
  perform public.sync_contract_list(token,w,request_id,op,expected,'{}');
  assert jsonb_array_length(public.read_contract_lists(token,w))=0, 'delete and retry';
  reset role;
end;
$$;
rollback;
