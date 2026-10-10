-- Minister history, authorization and offline replay. All fixtures are rolled back.
begin;
do $$
declare
  w text := 'minister-test-'||gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  reader_id uuid := gen_random_uuid();
  admin_token text := encode(extensions.gen_random_bytes(32),'hex');
  reader_token text := encode(extensions.gen_random_bytes(32),'hex');
  successor text := gen_random_uuid()::text;
  payload jsonb;
  original_id text;
  failed boolean;
  before_contracts jsonb;
begin
  select ministre_id into original_id from public.ministre_actuel;
  select jsonb_agg(to_jsonb(c) order by c.id_contrat) into before_contracts from public.contrat c;
  insert into public.workspaces(id,name,created_at,updated_at) values(w,'Temporary minister tests',now(),now());
  insert into public.app_users(id,username,password,full_name,role,workspaces) values
    (admin_id,w||'-admin','test-only','Test Admin','admin',array[w]),
    (reader_id,w||'-reader','test-only','Test Reader','reader',array[w]);
  insert into public.app_task_sessions(user_id,token_hash) values
    (admin_id,extensions.digest(admin_token,'sha256')),
    (reader_id,extensions.digest(reader_token,'sha256'));
  payload := jsonb_build_object('action','add','minister',jsonb_build_object('id',successor,'fullName','Marie TEST MINISTRE','gender','Femme','nif','999-888-777-6','ninu','9998887776','mandateStartDate','2026-10-01','mandateEndDate',null));
  set local role anon;
  failed := false;
  begin perform 1 from public.ministres; exception when insufficient_privilege then failed := true; end;
  assert failed, 'No direct API access to minister identity data';
  failed := false;
  begin perform public.read_ministers('invalid'); exception when others then failed := true; end;
  assert failed, 'No invalid session access';
  assert public.read_ministers(reader_token)->>'currentMinisterId'=original_id, 'Readers can resolve contract ministers';
  failed := false;
  begin perform public.manage_ministers(reader_token,payload); exception when others then failed := true; end;
  assert failed, 'Readers cannot add';
  perform public.manage_ministers(admin_token,payload);
  perform public.manage_ministers(admin_token,payload);
  assert public.read_ministers(admin_token)->>'currentMinisterId'=original_id, 'Adding does not silently change current minister';
  failed := false;
  begin perform public.manage_ministers(reader_token,jsonb_build_object('action','select','ministerId',successor)); exception when others then failed := true; end;
  assert failed, 'Readers cannot select';
  perform public.manage_ministers(admin_token,jsonb_build_object('action','select','ministerId',successor));
  assert public.read_ministers(admin_token)->>'currentMinisterId'=successor, 'Selection is shared';
  payload := jsonb_build_object('action','mandate','ministerId',successor,'mandateStartDate','2026-10-01','mandateEndDate','2027-09-30','expectedStartDate','2026-10-01','expectedEndDate',null);
  failed := false;
  begin perform public.manage_ministers(reader_token,payload); exception when others then failed := true; end;
  assert failed, 'Readers cannot edit a mandate';
  failed := false;
  begin perform public.manage_ministers(admin_token,payload||jsonb_build_object('mandateEndDate','2026-09-30')); exception when others then failed := true; end;
  assert failed, 'Reversed mandates rejected';
  failed := false;
  begin perform public.manage_ministers(admin_token,payload||jsonb_build_object('mandateStartDate','2026-02-30')); exception when others then failed := true; end;
  assert failed, 'Invalid calendar dates rejected';
  perform public.manage_ministers(admin_token,payload);
  assert (select m->>'mandateEndDate' from jsonb_array_elements(public.read_ministers(reader_token)->'ministers') m where m->>'id'=successor)='2027-09-30', 'Dates visible to readers';
  failed := false;
  begin perform public.manage_ministers(admin_token,payload); exception when others then failed := true; end;
  assert failed, 'Concurrent changes cannot be silently overwritten';
  perform public.manage_ministers(admin_token,payload||jsonb_build_object('mandateEndDate',null,'expectedEndDate','2027-09-30'));
  reset role;
  assert (select jsonb_agg(to_jsonb(c) order by c.id_contrat) from public.contrat c) is not distinct from before_contracts, 'All existing contract information is unchanged';
  insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id) values(w,'TEST','Minister','Homme','Test',w);
  set local role anon;
  insert into public.contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id)
    values(w||'-new',w,6,'2026-2027',100,'Test','Test',w);
  insert into public.contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id,ministre_id)
    values(w||'-offline',w,6,'2025-2026',100,'Test','Test',w,original_id);
  assert (select ministre_id from public.contrat where id_contrat=w||'-new')=successor, 'New contracts get the current minister';
  assert (select ministre_id from public.contrat where id_contrat=w||'-offline')=original_id, 'Offline replay retains captured minister';
  failed := false;
  begin update public.contrat set ministre_id=successor where id_contrat=w||'-offline'; exception when others then failed := true; end;
  assert failed, 'Existing contract cannot change minister';
  failed := false;
  reset role;
  begin delete from public.ministres where id=original_id; exception when foreign_key_violation then failed := true; end;
  assert failed, 'Referenced minister cannot be deleted';
  set local role authenticated;
  failed := false;
  begin update public.ministre_actuel set ministre_id=original_id; exception when insufficient_privilege then failed := true; end;
  assert failed, 'Authenticated role cannot bypass session/role checks';
  assert public.read_ministers(reader_token)->>'currentMinisterId'=successor;
end;
$$;
rollback;
