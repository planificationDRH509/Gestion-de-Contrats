-- Personal pins, ten-item limit and direct table isolation.
begin;
do $$
declare
  w text := 'pins-test-' || gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  owner_token text := encode(extensions.gen_random_bytes(32), 'hex');
  other_token text := encode(extensions.gen_random_bytes(32), 'hex');
  contract_id text;
  failed boolean := false;
  i integer;
begin
  insert into public.workspaces(id,name,created_at,updated_at)
    values(w,'Temporary pin tests',now(),now());
  insert into public.app_users(id,username,password,full_name,role,workspaces) values
    (owner_id,w||'-owner','test-only','Pin Owner','agent',array[w]),
    (other_id,w||'-other','test-only','Other User','agent',array[w]);
  insert into public.app_task_sessions(user_id,token_hash) values
    (owner_id,extensions.digest(owner_token,'sha256')),
    (other_id,extensions.digest(other_token,'sha256'));
  for i in 1..11 loop
    contract_id := w || '-c' || i;
    insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id)
      values(w||'-n'||i,'TEST','Pin','Homme','Test',w);
    insert into public.contrat(id_contrat,nif,duree_contrat,salaire,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id)
      values(contract_id,w||'-n'||i,6,'Cent','2025-2026',100,'Test','Test',w);
  end loop;

  set local role anon;
  begin perform 1 from public.pinned_contracts;
    exception when insufficient_privilege then failed := true; end;
  assert failed, 'the Data API role cannot read pins directly';
  for i in 1..10 loop
    perform public.set_pinned_contract(owner_token,w||'-c'||i,true);
  end loop;
  assert cardinality(public.read_pinned_contracts(owner_token))=10, 'owner reads ten pins';
  assert cardinality(public.read_pinned_contracts(other_token))=0, 'other user sees no pins';
  failed := false;
  begin perform public.set_pinned_contract(owner_token,w||'-c11',true);
    exception when others then failed := true; assert sqlerrm like '%10 contrats%'; end;
  assert failed, 'eleventh pin rejected';
  perform public.set_pinned_contract(owner_token,w||'-c1',false);
  assert cardinality(public.read_pinned_contracts(owner_token))=9, 'unpin succeeds at limit';
  perform public.set_pinned_contract(owner_token,w||'-c11',true);
  assert cardinality(public.read_pinned_contracts(owner_token))=10, 'a freed slot can be reused';
  perform public.set_pinned_contract(other_token,w||'-c1',true);
  assert cardinality(public.read_pinned_contracts(other_token))=1, 'other user has independent pins';
  reset role;
  update public.contrat set deleted_at=now() where id_contrat=w||'-c1';
  set local role anon;
  assert cardinality(public.read_pinned_contracts(other_token))=0, 'deleted pins are removed';
end;
$$;
rollback;
