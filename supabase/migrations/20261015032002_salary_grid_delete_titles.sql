begin;

create or replace function reference_private.sync_change(p_session_token text, p_operation_id text, p_workspace_id text, p_change jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; actor_role text; allowed text[]; receipt reference_private.receipts;
  scope text := p_change->>'scope'; patch jsonb; old jsonb; next jsonb; input jsonb;
  result jsonb; saved public.autocompletion; previous public.autocompletion;
  suggestion_type text; entry_id text; learning boolean := coalesce((p_change->>'learn')::boolean,false);
  rules jsonb; current_minister text;
begin
  actor := public.resolve_task_session(p_session_token);
  select role,workspaces into actor_role,allowed from public.app_users where id=actor;
  if not coalesce(p_workspace_id=any(allowed),false) then raise exception 'Espace de travail inaccessible.'; end if;
  if scope not in ('addresses','positions','institutions','salary','prepositions','ministers') or scope is null then raise exception 'Référentiel invalide.'; end if;
  if p_operation_id is null or length(p_operation_id) not between 1 and 150 then raise exception 'Opération invalide.'; end if;
  if jsonb_typeof(p_change->'patches') is distinct from 'array' then raise exception 'Modifications invalides.'; end if;
  if learning and (scope not in ('addresses','institutions') or jsonb_array_length(p_change->'patches')<>1
    or p_change->'patches'->0->'before' is distinct from 'null'::jsonb
    or jsonb_typeof(p_change->'patches'->0->'after') is distinct from 'object') then raise exception 'Apprentissage invalide.'; end if;
  if actor_role is distinct from 'admin' and not coalesce(learning and actor_role='agent',false) then raise exception 'Modification non autorisée.'; end if;
  -- Serialize this receipt and the references; existing RPC locks are acquired afterwards.
  perform pg_catalog.pg_advisory_xact_lock(739214809);
  select * into receipt from reference_private.receipts where actor_id=actor and operation_id=p_operation_id;
  if found then
    if receipt.input is distinct from p_change or receipt.workspace_id<>p_workspace_id then raise exception 'Opération réutilisée avec des données différentes.'; end if;
    return receipt.result;
  end if;
  if scope='salary' then
    if jsonb_array_length(p_change->'patches')<>1 then raise exception 'Modification invalide.'; end if;
    patch := p_change->'patches'->0;
    next := nullif(patch->'after','null'::jsonb);
    if next is null then
      old := nullif(patch->'before','null'::jsonb);
      entry_id := patch->>'id';
      if old is null or entry_id is null or entry_id is distinct from old->>'id'
        or not (patch ? 'after') then raise exception 'Suppression invalide.'; end if;
      -- Share the lock used by save_entry so updates and deletes cannot race.
      perform pg_catalog.pg_advisory_xact_lock(739214804);
      delete from public.salary_grid where id=entry_id and version=(old->>'version')::integer;
      if not found then raise exception 'Cette ligne a changé. Rechargez la grille.'; end if;
      result := salary_private.read_grid(p_session_token);
    else
      input := next || jsonb_build_object('version',coalesce((patch->'before'->>'version')::integer,0));
      result := public.save_salary_grid_entry(p_session_token,input);
    end if;
  elsif scope='prepositions' then
    select jsonb_agg((p->'after') || jsonb_build_object('version',(p->'before'->>'version')::integer)) into rules
      from jsonb_array_elements(p_change->'patches') p;
    result := public.save_institution_prepositions(p_session_token,rules);
  elsif scope='ministers' then
    input := p_change->'input';
    if input->>'action'='select' then
      select ministre_id into current_minister from public.ministre_actuel where singleton for update;
      if current_minister is distinct from input->>'expectedMinisterId' then raise exception 'Le ministre sélectionné a changé. La modification locale est conservée.'; end if;
    end if;
    result := public.manage_ministers(p_session_token,input);
  else
    if jsonb_array_length(p_change->'patches')<>1 then raise exception 'Modification invalide.'; end if;
    patch := p_change->'patches'->0; old := nullif(patch->'before','null'::jsonb); next := nullif(patch->'after','null'::jsonb);
    entry_id := patch->>'id';
    suggestion_type := case scope when 'addresses' then 'address' when 'positions' then 'position' else 'institution' end;
    if scope='institutions' and next is not null then
      if learning then result := public.learn_institution(p_session_token,p_workspace_id,next);
      else result := public.save_institution(p_session_token,p_workspace_id,next || jsonb_build_object('version',coalesce((old->>'version')::integer,0)));
      end if;
    else
      select * into previous from public.autocompletion where id=entry_id for update;
      if previous.id is not null and (previous.workspace_id<>p_workspace_id or previous.type<>suggestion_type) then raise exception 'Référence inaccessible.'; end if;
      if (old is null) <> (previous.id is null) then raise exception 'Ce référentiel a changé. La modification locale est conservée.'; end if;
      if old is not null then
        if scope='institutions' then
          if previous.version is distinct from (old->>'version')::integer then raise exception 'Cette institution a changé.'; end if;
        elsif jsonb_strip_nulls(jsonb_build_object('id',previous.id,'label',previous.label,'prefix',previous.prefix,'labelFeminine',previous.label_feminine,'order',previous.order_index)
          || case when scope='positions' then jsonb_build_object('salaries',to_jsonb(previous.salaries)) else '{}'::jsonb end)
          is distinct from jsonb_strip_nulls(old) then raise exception 'Ce référentiel a changé. La modification locale est conservée.';
        end if;
      end if;
      if next is null then
        delete from public.autocompletion where id=entry_id;
        result := 'null'::jsonb;
      else
        if next->>'id' is distinct from entry_id or nullif(btrim(next->>'label'),'') is null or length(next->>'label')>250 then raise exception 'Référence invalide.'; end if;
        if scope='positions' and (jsonb_typeof(next->'salaries') is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(next->'salaries') s where s::numeric<=0)) then raise exception 'Salaires invalides.'; end if;
        insert into public.autocompletion(id,workspace_id,type,label,prefix,label_feminine,salaries,order_index,created_by)
          values(entry_id,p_workspace_id,suggestion_type,btrim(next->>'label'),next->>'prefix',next->>'labelFeminine',
            case when scope='positions' then array(select s::numeric from jsonb_array_elements_text(next->'salaries') s) else null end,
            coalesce((next->>'order')::integer,0),actor)
          on conflict(id) do update set label=excluded.label,prefix=excluded.prefix,label_feminine=excluded.label_feminine,
            salaries=excluded.salaries,updated_at=now() returning * into saved;
        result := jsonb_build_object('id',saved.id,'label',saved.label,'prefix',saved.prefix,'labelFeminine',saved.label_feminine,'order',saved.order_index)
          || case when scope='positions' then jsonb_build_object('salaries',to_jsonb(saved.salaries)) else '{}'::jsonb end;
      end if;
    end if;
  end if;
  insert into reference_private.receipts(actor_id,operation_id,workspace_id,input,result)
    values(actor,p_operation_id,p_workspace_id,p_change,coalesce(result,'null'::jsonb));
  return result;
end;
$$;

commit;
