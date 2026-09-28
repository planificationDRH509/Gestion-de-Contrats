-- The shared reference is readable; institution writes use app-session RPCs.
alter table public.autocompletion enable row level security;
create policy suggestions_read on public.autocompletion for select to anon,authenticated using (true);
create policy other_suggestions_insert on public.autocompletion for insert to anon,authenticated with check (type<>'institution');
create policy other_suggestions_update on public.autocompletion for update to anon,authenticated using (type<>'institution') with check (type<>'institution');
create policy other_suggestions_delete on public.autocompletion for delete to anon,authenticated using (type<>'institution');
grant usage on schema institution_private to service_role;
grant execute on function institution_private.normalized_name(text) to service_role;

-- Contract writers may register a new reference, but cannot edit an existing one.
create function institution_private.learn_entry(p_session_token text,p_workspace_id text,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; actor_role text; allowed_workspaces text[]; saved public.autocompletion;
  name text := btrim(p_entry->>'label'); kind text := p_entry->>'institutionType';
  dept text := nullif(btrim(p_entry->>'department'),''); town text := nullif(btrim(p_entry->>'commune'),'');
begin
  actor := public.resolve_task_session(p_session_token);
  select role,workspaces into actor_role,allowed_workspaces from public.app_users where id=actor;
  if actor_role not in ('admin','agent') or actor_role is null then raise exception 'Droit insuffisant.'; end if;
  if not coalesce(p_workspace_id=any(allowed_workspaces),false) then raise exception 'Espace de travail inaccessible.'; end if;
  if name is null or length(name) not between 1 and 250 or institution_private.normalized_name(name)='' then raise exception 'Nom d’institution invalide.'; end if;
  if kind is not null and kind not in ('Centre de Santé','Hôpital','Hôpital Universitaire','HCR','Centre Hospitalier','Centre Médico-Social','Dispensaire','Clinique','Maternité','Bureau Administratif','Bureau Départemental','Bureau Communal','Bureau Central','UAS / UCS','Autre') then raise exception 'Type d’institution invalide.'; end if;
  if dept is not null and dept not in ('Artibonite','Centre','Grand’Anse','Nippes','Nord','Nord-Est','Nord-Ouest','Ouest','Sud','Sud-Est') then raise exception 'Département invalide.'; end if;
  if town is not null and (dept is null or length(town)>150) then raise exception 'Commune invalide.'; end if;
  if jsonb_typeof(coalesce(p_entry->'addressKeywords','[]'::jsonb))<>'array' then raise exception 'Mots-clés invalides.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(739214805);
  select * into saved from public.autocompletion where type='institution' and workspace_id=p_workspace_id and institution_private.normalized_name(label)=institution_private.normalized_name(name);
  if saved.id is null then
    insert into public.autocompletion(id,type,label,workspace_id,institution_type,department,commune,address_keywords,created_by,order_index)
    values(gen_random_uuid()::text,'institution',name,p_workspace_id,kind,dept,town,coalesce((p_entry->'addressKeywords')::text,'[]'),actor,
      (select coalesce(max(order_index),-1)+1 from public.autocompletion where type='institution' and workspace_id=p_workspace_id)) returning * into saved;
  end if;
  return jsonb_build_object('id',saved.id,'label',saved.label,'department',saved.department,'commune',saved.commune,
    'institutionType',saved.institution_type,'source',saved.source_url,'version',saved.version,
    'addressKeywords',coalesce(saved.address_keywords,'[]')::jsonb,'prefix',saved.prefix,'labelFeminine',saved.label_feminine,'order',saved.order_index);
end;
$$;
create function public.learn_institution(p_session_token text,p_workspace_id text,p_entry jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select institution_private.learn_entry(p_session_token,p_workspace_id,p_entry);
$$;
revoke all on function institution_private.learn_entry(text,text,jsonb),public.learn_institution(text,text,jsonb) from public,anon,authenticated;
grant execute on function institution_private.learn_entry(text,text,jsonb),public.learn_institution(text,text,jsonb) to anon,authenticated;
