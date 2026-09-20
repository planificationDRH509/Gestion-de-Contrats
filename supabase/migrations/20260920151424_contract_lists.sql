-- Shared contract batches. Access uses the application's existing opaque sessions.
-- Direct table writes are denied; all batch mutations are atomic RPC operations.
create schema if not exists list_private;
revoke all on schema list_private from public, anon, authenticated;

create table public.contract_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id),
  duration_months integer not null check (duration_months between 1 and 12),
  visa_number text check (char_length(visa_number) <= 120),
  sealed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  history jsonb not null default '[]'::jsonb
);
create index contract_lists_workspace_idx on public.contract_lists(workspace_id);
create table public.contract_list_members (
  contract_id text primary key references public.contrat(id_contrat),
  list_id uuid not null references public.contract_lists(id)
);
create index contract_list_members_list_idx on public.contract_list_members(list_id);
alter table public.contract_lists enable row level security;
alter table public.contract_list_members enable row level security;
revoke all on public.contract_lists, public.contract_list_members from anon, authenticated;

-- Serialize membership changes, sealing and edits before any row locks are taken.
-- This also prevents a concurrent identity edit from changing a just-sealed lot.
create function list_private.lock_lists() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(739214801);
  return null;
end;
$$;
create trigger contract_lists_write_lock before update or delete on public.contrat
for each statement execute function list_private.lock_lists();
create trigger contract_lists_identity_lock before update or delete on public.identification
for each statement execute function list_private.lock_lists();

create function list_private.guard_contract() returns trigger
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
    new.salaire_en_chiffre is distinct from old.salaire_en_chiffre or new.salaire is distinct from old.salaire or
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
create trigger guard_list_contract before update or delete on public.contrat
for each row execute function list_private.guard_contract();

create function list_private.guard_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' or (new.nom, new.prenom, new.nif, new.sexe, new.adresse, new.ninu, new.deleted_at)
    is distinct from (old.nom, old.prenom, old.nif, old.sexe, old.adresse, old.ninu, old.deleted_at) then
    if exists(select 1 from public.contrat c join public.contract_list_members m on m.contract_id=c.id_contrat
      join public.contract_lists l on l.id=m.list_id where c.nif=old.nif and l.sealed_at is not null) then
      raise exception 'Cette personne appartient à une liste scellée. Faites rouvrir la liste avant de modifier son identité.';
    end if;
  end if;
  update public.contract_lists set version=version+1 where id in (
    select m.list_id from public.contract_list_members m join public.contrat c on c.id_contrat=m.contract_id where c.nif=old.nif
  );
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
create trigger guard_list_identity before update or delete on public.identification
for each row execute function list_private.guard_identity();

create function list_private.authorize(p_session_token text, p_workspace_id text)
returns public.app_users language plpgsql security definer set search_path = '' as $$
declare actor public.app_users;
begin
  select * into actor from public.app_users where id=public.resolve_task_session(p_session_token);
  if actor.id is null or p_workspace_id is null or not (
    p_workspace_id=any(coalesce(actor.workspaces, array[]::text[])) or
    (p_workspace_id='workspace_default' and not (coalesce(actor.workspaces, array[]::text[]) && array['workspace_default','workspace_mouvement','workspace_avantages']))
  ) then raise exception 'Accès aux listes non autorisé.'; end if;
  return actor;
end;
$$;

create function public.read_contract_lists(p_session_token text, p_workspace_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform list_private.authorize(p_session_token, p_workspace_id);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',l.id, 'workspaceId',l.workspace_id, 'durationMonths',l.duration_months,
    'visaNumber',l.visa_number, 'sealedAt',l.sealed_at, 'version',l.version,
    'createdAt',l.created_at, 'history',l.history,
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id_contrat, 'firstName',i.prenom, 'lastName',i.nom, 'nif',c.nif,
      'position',c.titre, 'salaryNumber',c.salaire_en_chiffre, 'durationMonths',c.duree_contrat
    )) from public.contract_list_members m join public.contrat c on c.id_contrat=m.contract_id
      join public.identification i on i.nif=c.nif where m.list_id=l.id and c.deleted_at is null), '[]'::jsonb)
  ) order by l.created_at desc, l.id) from public.contract_lists l where l.workspace_id=p_workspace_id), '[]'::jsonb);
end;
$$;

create function public.mutate_contract_list(p_session_token text, p_workspace_id text, p_operation jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor public.app_users; lot public.contract_lists; source public.contract_lists;
  contract public.contrat; target_id uuid := nullif(p_operation->>'listId','')::uuid;
  op text := p_operation->>'action'; ids text[]; v_contract_id text;
  event jsonb; changed uuid[] := array[]::uuid[]; changed_id uuid;
begin
  actor := list_private.authorize(p_session_token,p_workspace_id);
  if actor.role not in ('admin','agent','controller') then raise exception 'Vous n’avez pas le droit de modifier les listes.'; end if;
  perform pg_advisory_xact_lock(739214801);
  event := jsonb_build_object('at',clock_timestamp(),'actor',actor.full_name,'action',op,'reason',btrim(p_operation->>'reason'));
  if target_id is not null then
    select * into lot from public.contract_lists where id=target_id and workspace_id=p_workspace_id;
    if lot.id is null then raise exception 'Liste introuvable.'; end if;
  end if;
  if op='create' then
    insert into public.contract_lists(workspace_id,duration_months,visa_number,history)
      values(p_workspace_id,(p_operation->>'durationMonths')::integer,nullif(btrim(p_operation->>'visaNumber'),''),jsonb_build_array(event))
      returning id into target_id;
  elsif op='assign' then
    select array_agg(distinct value) into ids from jsonb_array_elements_text(p_operation->'contractIds');
    if coalesce(cardinality(ids),0)=0 then raise exception 'Sélectionnez au moins un contrat.'; end if;
    if lot.sealed_at is not null then raise exception 'Faites rouvrir la liste scellée avant de la modifier.'; end if;
    foreach v_contract_id in array ids loop
      select * into contract from public.contrat c where c.id_contrat=v_contract_id and c.workspace_id=p_workspace_id and c.deleted_at is null;
      if contract.id_contrat is null then raise exception 'Un contrat est introuvable. Actualisez la page.'; end if;
      if lot.id is not null and contract.duree_contrat <> lot.duration_months then
        raise exception 'Tous les contrats d’une liste doivent avoir la même durée.';
      end if;
      select l.* into source from public.contract_lists l join public.contract_list_members m on m.list_id=l.id where m.contract_id=v_contract_id;
      if source.id is not distinct from target_id then continue; end if;
      if source.sealed_at is not null then raise exception 'Faites rouvrir la liste scellée avant de déplacer ses contrats.'; end if;
      delete from public.contract_list_members m where m.contract_id=v_contract_id;
      if source.id is not null then changed := array_append(changed,source.id); end if;
      if target_id is not null then
        insert into public.contract_list_members values(v_contract_id,target_id);
        changed := array_append(changed,target_id);
      end if;
    end loop;
    event := event || jsonb_build_object('reason',cardinality(ids)::text || ' contrat(s) · destination : ' || coalesce(target_id::text,'sans liste'));
    for changed_id in select distinct unnest(changed) loop
      update public.contract_lists set history=history || jsonb_build_array(event),version=version+1 where id=changed_id;
    end loop;
  else
    if lot.id is null then raise exception 'Liste introuvable.'; end if;
    if lot.version is distinct from (p_operation->>'version')::integer then
      raise exception 'La liste a changé. Actualisez-la avant de continuer.';
    end if;
    if op='reopen' then
      if actor.role <> 'admin' then raise exception 'Seul un administrateur peut rouvrir une liste.'; end if;
      if lot.sealed_at is null or coalesce(btrim(p_operation->>'reason'),'')='' then raise exception 'Indiquez le motif de réouverture.'; end if;
      update public.contract_lists set sealed_at=null where id=target_id;
    else
      if lot.sealed_at is not null then raise exception 'Faites rouvrir la liste scellée avant de la modifier.'; end if;
      if op='visa' then
        update public.contract_lists set visa_number=nullif(btrim(p_operation->>'visaNumber'),'') where id=target_id;
      elsif op='seal' then
        if not exists(select 1 from public.contract_list_members where list_id=target_id) then raise exception 'Une liste vide ne peut pas être scellée.'; end if;
        update public.contract_lists set sealed_at=clock_timestamp() where id=target_id;
      elsif op='delete' then
        if exists(select 1 from public.contract_list_members where list_id=target_id) then raise exception 'Retirez les contrats avant de supprimer la liste.'; end if;
        delete from public.contract_lists where id=target_id;
      else raise exception 'Action inconnue.'; end if;
    end if;
    update public.contract_lists set history=history || jsonb_build_array(event),version=version+1 where id=target_id;
  end if;
  return target_id;
end;
$$;
revoke all on all functions in schema list_private from public, anon, authenticated;
revoke all on function public.read_contract_lists(text,text) from public;
revoke all on function public.mutate_contract_list(text,text,jsonb) from public;
grant execute on function public.read_contract_lists(text,text) to anon, authenticated;
grant execute on function public.mutate_contract_list(text,text,jsonb) to anon, authenticated;
