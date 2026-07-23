-- Columns already used by the application and required by the audit journal.
alter table public.contrat
  add column if not exists commentaire text,
  add column if not exists created_by text;

alter table public.contrat
  alter column historique_saisie set default
    '{"version":2,"createdAt":"","createdBy":{"name":"Système"},"entries":[]}'::text;

-- Safety net: changes made outside the application are still traceable.
-- Application writes already provide their own detailed historique_saisie and
-- therefore do not receive a duplicate event from this trigger.
create or replace function public.ensure_contrat_audit_history()
returns trigger
language plpgsql
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
  if new.salaire is distinct from old.salaire then
    changed_fields := changed_fields || jsonb_build_object(
      'field', 'salaryText',
      'previousValue', old.salaire,
      'newValue', new.salaire
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

drop trigger if exists ensure_contrat_audit_history_trigger on public.contrat;
create trigger ensure_contrat_audit_history_trigger
before update on public.contrat
for each row execute function public.ensure_contrat_audit_history();
