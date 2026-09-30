-- Restore custom prepositions through the versioned institution editor.
-- Omitted prefixes from older clients keep their existing value.
create or replace function institution_private.save_entry(p_session_token text,p_workspace_id text,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; actor_role text; allowed_workspaces text[];
  previous public.autocompletion; saved public.autocompletion;
  entry_id text := p_entry->>'id'; name text := btrim(p_entry->>'label');
  dept text := nullif(btrim(p_entry->>'department'),'');
  town text := nullif(btrim(p_entry->>'commune'),'');
  entry_prefix text := nullif(btrim(p_entry->>'prefix'),'');
  kind text := p_entry->>'institutionType'; source text := nullif(btrim(p_entry->>'source'),'');
begin
  actor := public.resolve_task_session(p_session_token);
  select role,workspaces into actor_role,allowed_workspaces from public.app_users where id=actor;
  if actor_role is distinct from 'admin' then raise exception 'Modification réservée aux administrateurs.'; end if;
  if not exists(select 1 from public.workspaces where id=p_workspace_id) then raise exception 'Espace de travail invalide.'; end if;
  if not coalesce(p_workspace_id=any(allowed_workspaces),false) then raise exception 'Espace de travail inaccessible.'; end if;
  if entry_id is null or length(entry_id) not between 1 and 150 then raise exception 'Identifiant invalide.'; end if;
  if name is null or length(name) not between 1 and 250 or institution_private.normalized_name(name)='' then raise exception 'Nom d’institution invalide.'; end if;
  if kind is null or kind not in ('Centre de Santé','Hôpital','Hôpital Universitaire','HCR','Centre Hospitalier','Centre Médico-Social','Dispensaire','Clinique','Maternité','Bureau Administratif','Bureau Départemental','Bureau Communal','Bureau Central','UAS / UCS','Autre') then raise exception 'Type d’institution invalide.'; end if;
  if dept is not null and dept not in ('Artibonite','Centre','Grand’Anse','Nippes','Nord','Nord-Est','Nord-Ouest','Ouest','Sud','Sud-Est') then raise exception 'Département invalide.'; end if;
  if town is not null and (dept is null or length(town)>150) then raise exception 'Commune invalide.'; end if;
  if source is not null and (source !~* '^https?://' or length(source)>2000) then raise exception 'Adresse de source invalide.'; end if;
  if p_entry ? 'prefix' and (jsonb_typeof(p_entry->'prefix') not in ('string','null') or length(p_entry->>'prefix')>50) then raise exception 'Préposition invalide.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(739214805);
  select * into previous from public.autocompletion where id=entry_id for update;
  if previous.id is not null and (previous.type <> 'institution' or previous.workspace_id <> p_workspace_id) then raise exception 'Institution inaccessible.'; end if;
  if coalesce(previous.version,0) is distinct from (p_entry->>'version')::integer then raise exception 'Cette institution a changé. Rechargez la liste.'; end if;
  if exists(select 1 from public.autocompletion where type='institution' and workspace_id=p_workspace_id and id<>entry_id and institution_private.normalized_name(label)=institution_private.normalized_name(name)) then raise exception 'Cette institution existe déjà.'; end if;
  if previous.id is null then
    insert into public.autocompletion(id,type,label,prefix,workspace_id,address_keywords,department,commune,institution_type,source_url,created_by,order_index)
    values(entry_id,'institution',name,entry_prefix,p_workspace_id,coalesce((p_entry->'addressKeywords')::text,'[]'),dept,town,kind,source,actor,
      (select coalesce(max(order_index),-1)+1 from public.autocompletion where type='institution' and workspace_id=p_workspace_id)) returning * into saved;
  else
    update public.autocompletion set label=name,prefix=case when p_entry ? 'prefix' then entry_prefix else previous.prefix end,department=dept,commune=town,institution_type=kind,source_url=source,updated_at=now()
    where id=entry_id returning * into saved;
    if previous.label is distinct from name then
      -- The existing audit and sealed-list guards run on every affected contract.
      update public.contrat set lieu_affectation=name,updated_at=now()
      where workspace_id=p_workspace_id and lieu_affectation=previous.label;
    end if;
  end if;
  return jsonb_build_object('id',saved.id,'label',saved.label,'department',saved.department,'commune',saved.commune,
    'institutionType',saved.institution_type,'source',saved.source_url,'version',saved.version,
    'addressKeywords',coalesce(saved.address_keywords,'[]')::jsonb,'prefix',saved.prefix,'labelFeminine',saved.label_feminine,'order',saved.order_index);
end;
$$;
