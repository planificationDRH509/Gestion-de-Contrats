-- Run after derive_contract_salary_text. All fixtures are rolled back.
begin;
do $$
declare
  w text := 'salary-test-' || gen_random_uuid()::text;
  lot uuid := gen_random_uuid();
  history jsonb;
  rejected boolean := false;
begin
  assert not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contrat' and column_name='salaire'
  ), 'Salary words must not be stored on contracts';
  insert into public.workspaces(id,name,created_at,updated_at) values(w,'Salary migration test',now(),now());
  insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id)
    values(w||'-n','TEST','Salaire','Homme','Test',w);
  insert into public.contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id)
    values(w||'-c',w||'-n',6,'2025-2026',45000.25,'Test','Test',w);
  update public.contrat set salaire_en_chiffre=50000.75 where id_contrat=w||'-c';
  select historique_saisie::jsonb into history from public.contrat where id_contrat=w||'-c';
  assert exists (
    select 1 from jsonb_array_elements(history->'entries') e,
      jsonb_array_elements(e->'changes') c where c->>'field'='salaryNumber'
  ), 'Numeric salary changes remain audited';
  insert into public.contract_lists(id,workspace_id,duration_months) values(lot,w,6);
  insert into public.contract_list_members(contract_id,list_id) values(w||'-c',lot);
  update public.contract_lists set sealed_at=now() where id=lot;
  begin
    update public.contrat set salaire_en_chiffre=1 where id_contrat=w||'-c';
  exception when others then
    if sqlerrm like '%scellée%' then rejected := true; else raise; end if;
  end;
  assert rejected, 'Sealed lists still protect the numeric salary';
  update public.contrat set status='imprime' where id_contrat=w||'-c';
  assert (select salaire_en_chiffre=50000.75 from public.contrat where id_contrat=w||'-c'), 'Amount and cents are preserved';
end;
$$;
rollback;
