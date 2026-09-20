-- Create and populate a list atomically, preserving the existing session checks.
create or replace function public.mutate_contract_list(p_session_token text, p_workspace_id text, p_operation jsonb)
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
    -- Nested RPC shares this transaction: a failed assignment also rolls back creation.
    if p_operation ? 'contractIds' then
      perform public.mutate_contract_list(p_session_token,p_workspace_id,jsonb_build_object(
        'action','assign','listId',target_id,'contractIds',p_operation->'contractIds'
      ));
    end if;
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
