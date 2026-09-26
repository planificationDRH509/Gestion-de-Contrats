-- Apply together with the application release that derives salaryText.
-- Older clients must reload: they still refer to the removed column.
-- Preserve every original spelling in a private archive before dropping the column.
-- No CASCADE: unexpected database dependencies must block the migration.
begin;

lock table public.contrat in access exclusive mode;
create schema salary_archive;
revoke all on schema salary_archive from public, anon, authenticated;
create table salary_archive.contrat_words as
  select id_contrat, salaire, salaire_en_chiffre, now() as archived_at
  from public.contrat;
alter table salary_archive.contrat_words add primary key (id_contrat);
revoke all on salary_archive.contrat_words from public, anon, authenticated;

create or replace function public.ensure_contrat_audit_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  base_history jsonb;
  current_entries jsonb;
  changed_fields jsonb := '[]'::jsonb;
  audit_event jsonb;
begin
  if new.historique_saisie is distinct from old.historique_saisie then
    return new;
  end if;

  begin
    base_history := coalesce(old.historique_saisie, '')::jsonb;
  exception when others then
    base_history := '{}'::jsonb;
  end;

  if jsonb_typeof(base_history) <> 'object'
     or coalesce(base_history->>'version', '') <> '2' then
    base_history := jsonb_build_object(
      'version', 2,
      'createdAt', coalesce(old.created_at::text, now()::text),
      'createdBy', jsonb_build_object(
        'id', old.created_by,
        'name', coalesce(old.created_by, 'Système')
      ),
      'entries', '[]'::jsonb
    );
  end if;

  if new.nif is distinct from old.nif then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'nif',
      'previousValue', old.nif,
      'newValue', new.nif
    );
  end if;
  if new.status is distinct from old.status then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'status',
      'previousValue', old.status,
      'newValue', new.status
    );
  end if;
  if new.duree_contrat is distinct from old.duree_contrat then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'durationMonths',
      'previousValue', old.duree_contrat,
      'newValue', new.duree_contrat
    );
  end if;
  if new.salaire_en_chiffre is distinct from old.salaire_en_chiffre then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'salaryNumber',
      'previousValue', old.salaire_en_chiffre,
      'newValue', new.salaire_en_chiffre
    );
  end if;
  if new.titre is distinct from old.titre then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'position',
      'previousValue', old.titre,
      'newValue', new.titre
    );
  end if;
  if new.lieu_affectation is distinct from old.lieu_affectation then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'assignment',
      'previousValue', old.lieu_affectation,
      'newValue', new.lieu_affectation
    );
  end if;
  if new.dossier_id is distinct from old.dossier_id then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'dossierId',
      'previousValue', old.dossier_id,
      'newValue', new.dossier_id
    );
  end if;
  if new.commentaire is distinct from old.commentaire then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'commentaire',
      'previousValue', old.commentaire,
      'newValue', new.commentaire
    );
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'deletedAt',
      'previousValue', old.deleted_at,
      'newValue', new.deleted_at
    );
  end if;

  if jsonb_array_length(changed_fields) = 0 then
    return new;
  end if;

  current_entries := coalesce(base_history->'entries', '[]'::jsonb);
  audit_event := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'action', case
      when new.deleted_at is not null and old.deleted_at is null then 'deletion'
      when new.status is distinct from old.status then 'status'
      when new.dossier_id is distinct from old.dossier_id then 'dossier'
      when new.duree_contrat is distinct from old.duree_contrat then 'duration'
      when new.commentaire is distinct from old.commentaire then 'comment'
      else 'modification'
    end,
    'at', now()::text,
    'actor', jsonb_build_object('name', 'Système / modification externe'),
    'changes', changed_fields
  );
  new.historique_saisie := jsonb_set(
    base_history,
    '{entries}',
    current_entries || audit_event
  )::text;
  return new;
end;
$$;


create or replace function list_private.guard_contract() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lot public.contract_lists;
begin
  select l.* into lot from public.contract_lists l join public.contract_list_members m on m.list_id=l.id
    where m.contract_id=old.id_contrat;
  if lot.id is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='DELETE' then
    raise exception 'Retirez le contrat de sa liste avant de le supprimer.';
  end if;
  if new.workspace_id is distinct from old.workspace_id or new.id_contrat is distinct from old.id_contrat
    or new.duree_contrat is distinct from lot.duration_months then
    raise exception 'Retirez le contrat de sa liste avant de modifier sa durée.';
  end if;
  if lot.sealed_at is not null and (
    new.deleted_at is distinct from old.deleted_at or new.nif is distinct from old.nif or
    new.salaire_en_chiffre is distinct from old.salaire_en_chiffre or
    new.titre is distinct from old.titre or new.lieu_affectation is distinct from old.lieu_affectation or
    new.annee_fiscale is distinct from old.annee_fiscale
  ) then raise exception 'Faites rouvrir la liste scellée avant de modifier ce contrat.'; end if;
  if new.deleted_at is not null then
    delete from public.contract_list_members where contract_id=old.id_contrat;
  end if;
  update public.contract_lists set version=version+1 where id=lot.id;
  return new;
end;
$$;

-- Some installations did not receive the original audit migration.
drop trigger if exists ensure_contrat_audit_history_trigger on public.contrat;
create trigger ensure_contrat_audit_history_trigger
before update on public.contrat
for each row execute function public.ensure_contrat_audit_history();

alter table public.contrat drop column if exists salaire;

commit;
