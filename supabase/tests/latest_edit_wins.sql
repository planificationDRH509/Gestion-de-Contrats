-- Run with psql ON_ERROR_STOP=1. Fixtures are rolled back.
begin;
do $$
declare
  w text := 'latest-edit-' || gen_random_uuid();
  other_w text := 'other-' || w;
  actor uuid := gen_random_uuid();
  token text; saved jsonb; version timestamptz; rejected boolean := false;
begin
  insert into public.workspaces(id,name,created_at,updated_at) values(w,w,now(),now()),(other_w,other_w,now(),now());
  insert into public.app_users(id,username,password,full_name,role,workspaces)
    values(actor,w,'test-password','Test Agent','agent',array[w]);
  token := public.login_app_user(w,'test-password')->>'taskSessionToken';
  assert token is not null;
  insert into public.identification(nif,workspace_id,prenom,nom,sexe,adresse,ninu,modified_at)
    values(w||'-a',w,'Original','Name','Homme','Original','ninu-'||w,'2026-01-01T10:00:00Z'),
      (w||'-b',w,'Second','Name','Femme','Original',null,'2026-01-01T10:00:00Z'),
      (w||'-other',other_w,'Other','Name','Homme','Original',null,'2026-01-01T10:00:00Z');
  insert into public.dossiers(id,workspace_id,name,modified_at) values(w||'-d',w,'Original','2026-01-01T10:00:00Z');
  insert into public.contrat(id_contrat,nif,workspace_id,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,modified_at)
    values(w||'-c',w||'-a',w,6,'2025-2026',100,'Original','Original','2026-01-01T10:00:00Z');
  perform set_config('request.headers',jsonb_build_object('x-app-session',token)::text,true);
  set local role anon;

  -- Later arrival must not beat a later edit. Commit time is separate.
  update public.identification set prenom='Newest',modified_at='2026-01-01T12:00:00Z' where nif=w||'-a';
  select updated_at into version from public.identification where nif=w||'-a';
  update public.identification set prenom='Old offline',modified_at='2026-01-01T11:00:00Z' where nif=w||'-a';
  assert (select prenom='Newest' and modified_at='2026-01-01T12:00:00Z' and updated_at=version from public.identification where nif=w||'-a');
  update public.identification set prenom='New offline',modified_at='2026-01-01T13:00:00Z' where nif=w||'-a';
  assert (select prenom='New offline' and modified_at='2026-01-01T13:00:00Z' from public.identification where nif=w||'-a');
  update public.contrat set titre='Newest',modified_at='2026-01-01T12:00:00Z' where id_contrat=w||'-c';
  update public.contrat set titre='Old offline',modified_at='2026-01-01T11:00:00Z' where id_contrat=w||'-c';
  assert (select titre='Newest' from public.contrat where id_contrat=w||'-c');
  update public.dossiers set name='Newest',modified_at='2026-01-01T12:00:00Z' where id=w||'-d';
  update public.dossiers set name='Old offline',modified_at='2026-01-01T11:00:00Z' where id=w||'-d';
  assert (select name='Newest' from public.dossiers where id=w||'-d');

  -- The latest NINU assignment wins without merging NIFs or their contracts.
  saved := public.sync_identification_latest(jsonb_build_object('nif',w||'-b','workspace_id',w,'prenom','Second','nom','Name','sexe','Femme','adresse','New','ninu','ninu-'||w),'2026-01-01T14:00:00Z');
  assert saved->>'ninu'='ninu-'||w;
  assert (select ninu is null from public.identification where nif=w||'-a');
  assert (select nif=w||'-a' from public.contrat where id_contrat=w||'-c');
  saved := public.sync_identification_latest(jsonb_build_object('nif',w||'-a','workspace_id',w,'prenom','Stale','nom','Name','sexe','Homme','adresse','Old','ninu','ninu-'||w),'2026-01-01T13:30:00Z');
  assert saved->>'ninu' is null;
  assert (select ninu='ninu-'||w from public.identification where nif=w||'-b');

  -- Newer deletion wins over old edits; a genuinely newer edit can restore it.
  update public.identification set deleted_at='2026-01-01T15:00:00Z',modified_at='2026-01-01T15:00:00Z' where nif=w||'-b';
  update public.identification set deleted_at=null,modified_at='2026-01-01T14:30:00Z' where nif=w||'-b';
  assert (select deleted_at is not null from public.identification where nif=w||'-b');
  update public.identification set deleted_at=null,modified_at='2026-01-01T16:00:00Z' where nif=w||'-b';
  assert (select deleted_at is null from public.identification where nif=w||'-b');

  -- A stale dossier deletion must not detach anything; a newer one is atomic.
  update public.contrat set dossier_id=w||'-d',modified_at='2026-01-01T13:00:00Z' where id_contrat=w||'-c';
  perform public.delete_dossier_latest(w||'-d',w,'2026-01-01T11:00:00Z');
  assert (select deleted_at is null from public.dossiers where id=w||'-d');
  assert (select dossier_id=w||'-d' from public.contrat where id_contrat=w||'-c');
  perform public.delete_dossier_latest(w||'-d',w,'2026-01-01T14:00:00Z');
  assert (select deleted_at is not null from public.dossiers where id=w||'-d');
  assert (select dossier_id is null and modified_at='2026-01-01T14:00:00Z' from public.contrat where id_contrat=w||'-c');
  update public.contrat set titre='Later offline',modified_at='2026-01-01T15:00:00Z' where id_contrat=w||'-c';
  assert (select titre='Later offline' from public.contrat where id_contrat=w||'-c');

  -- The new invoker RPC cannot cross workspace boundaries.
  begin
    perform public.sync_identification_latest(jsonb_build_object('nif',w||'-other','workspace_id',other_w,'prenom','Intruder','nom','Name','sexe','Homme','adresse','Bad'),now());
  exception when insufficient_privilege then rejected:=true;
  end;
  assert rejected, 'RPC must enforce RLS';
  reset role;
  assert (select prenom='Other' from public.identification where nif=w||'-other');
end;
$$;
rollback;
