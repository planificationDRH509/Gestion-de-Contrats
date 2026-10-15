begin;

-- Keep the user-edit clock separate from the server commit/version clock.
-- A delayed offline upload must not become newer just because it arrived last.
alter table public.identification add column if not exists modified_at timestamptz;
alter table public.contrat add column if not exists modified_at timestamptz;
alter table public.dossiers add column if not exists modified_at timestamptz;

create or replace function public.keep_latest_user_edit()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare previous_time timestamptz;
begin
  if tg_op = 'INSERT' then
    new.modified_at := coalesce(new.modified_at, new.updated_at, new.created_at, clock_timestamp());
    return new;
  end if;
  previous_time := coalesce(old.modified_at, old.updated_at, old.created_at, '-infinity'::timestamptz);
  -- Legacy/online writers that do not supply an edit clock still get one.
  if new.modified_at is not distinct from old.modified_at then
    new.modified_at := greatest(clock_timestamp(), previous_time + interval '1 microsecond');
  elsif new.modified_at is null or new.modified_at <= previous_time then
    return old;
  end if;
  new.updated_at := greatest(clock_timestamp(), coalesce(old.updated_at, '-infinity'::timestamptz) + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function public.keep_latest_user_edit() from public, anon, authenticated;

-- Run before audit/business guards; their authorization and sealed-list rules
-- still apply to every accepted write.
create trigger aaa_latest_user_edit before insert or update on public.identification
for each row execute function public.keep_latest_user_edit();
create trigger aaa_latest_user_edit before insert or update on public.contrat
for each row execute function public.keep_latest_user_edit();
create trigger aaa_latest_user_edit before insert or update on public.dossiers
for each row execute function public.keep_latest_user_edit();

-- Resolve NINU ownership and the identity edit in one transaction. Never merge
-- two people's contracts: NIF remains their stable key. RLS still scopes rows.
create function public.sync_identification_latest(p_record jsonb, p_modified_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.identification; other public.identification; saved public.identification;
  requested_nif text := btrim(p_record->>'nif');
  workspace text := p_record->>'workspace_id';
  requested_ninu text := nullif(btrim(p_record->>'ninu'),'');
begin
  if nullif(requested_nif,'') is null or workspace is null or p_modified_at is null then
    raise exception 'Identification invalide.';
  end if;
  -- Same lock order as the existing identity/list guards.
  perform pg_catalog.pg_advisory_xact_lock(739214801);
  select * into target from public.identification where nif=requested_nif for update;
  if found then
    if target.workspace_id<>workspace then raise exception 'Identification inaccessible.'; end if;
    if p_modified_at <= coalesce(target.modified_at,target.updated_at,target.created_at,'-infinity'::timestamptz) then
      return to_jsonb(target);
    end if;
  end if;
  if requested_ninu is not null then
    for other in select * from public.identification where ninu=requested_ninu and nif<>requested_nif for update loop
      if other.workspace_id<>workspace then raise exception 'Identification inaccessible.'; end if;
      if p_modified_at <= coalesce(other.modified_at,other.updated_at,other.created_at,'-infinity'::timestamptz) then
        requested_ninu := null;
      else
        update public.identification set ninu=null,modified_at=p_modified_at where nif=other.nif;
      end if;
    end loop;
  end if;
  insert into public.identification(nif,workspace_id,nom,prenom,sexe,ninu,telephone,adresse,created_by,modified_at)
    values(requested_nif,workspace,p_record->>'nom',p_record->>'prenom',p_record->>'sexe',requested_ninu,
      case when p_record ? 'telephone' then p_record->>'telephone' else target.telephone end,
      p_record->>'adresse',(p_record->>'created_by')::uuid,p_modified_at)
  on conflict(nif) do update set nom=excluded.nom,prenom=excluded.prenom,sexe=excluded.sexe,ninu=excluded.ninu,
    telephone=excluded.telephone,adresse=excluded.adresse,deleted_at=null,modified_at=excluded.modified_at
  returning * into saved;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.sync_identification_latest(jsonb,timestamptz) from public;
grant execute on function public.sync_identification_latest(jsonb,timestamptz) to anon,authenticated;

-- Deletion and detachment must be atomic; an obsolete offline deletion must
-- not detach contracts before discovering the newer dossier edit.
create function public.delete_dossier_latest(p_id text,p_workspace_id text,p_modified_at timestamptz)
returns integer language plpgsql security invoker set search_path = '' as $$
declare target public.dossiers; affected integer;
begin
  if p_modified_at is null then raise exception 'Date de modification requise.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(739214801);
  select * into target from public.dossiers where id=p_id and workspace_id=p_workspace_id for update;
  if not found or target.deleted_at is not null then return 0; end if;
  if p_modified_at <= coalesce(target.modified_at,target.updated_at,target.created_at,'-infinity'::timestamptz) then return 0; end if;
  update public.dossiers set deleted_at=p_modified_at,modified_at=p_modified_at where id=p_id and workspace_id=p_workspace_id;
  if not found then return 0; end if;
  update public.contrat set dossier_id=null,modified_at=greatest(p_modified_at,coalesce(modified_at,updated_at,created_at,'-infinity'::timestamptz)+interval '1 microsecond') where dossier_id=p_id and workspace_id=p_workspace_id and deleted_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.delete_dossier_latest(text,text,timestamptz) from public;
grant execute on function public.delete_dossier_latest(text,text,timestamptz) to anon,authenticated;

commit;
