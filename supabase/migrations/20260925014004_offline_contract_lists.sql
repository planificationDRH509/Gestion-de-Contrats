-- Durable receipts make retries safe even if the response is lost after COMMIT.
create table list_private.operation_receipts (
  request_id uuid primary key,
  actor_id uuid not null references public.app_users(id) on delete cascade,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  request jsonb not null,
  result_id uuid,
  created_at timestamptz not null default now()
);
alter table list_private.operation_receipts enable row level security;
revoke all on list_private.operation_receipts from public, anon, authenticated;

-- Compare business content, since contract/identity triggers also bump versions.
create function list_private.offline_snapshot(l jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id',l->'id', 'workspaceId',l->'workspaceId', 'durationMonths',l->'durationMonths',
    'visaNumber',l->'visaNumber', 'sealed',coalesce(l->'sealedAt','null'::jsonb) <> 'null'::jsonb,
    'members',coalesce((select jsonb_agg(m order by m->>'id') from jsonb_array_elements(l->'members') m),'[]'::jsonb)
  );
$$;
revoke all on function list_private.offline_snapshot(jsonb) from public, anon, authenticated;

create function public.sync_contract_list(
  p_session_token text, p_workspace_id text, p_request_id uuid,
  p_operation jsonb, p_expected_lists jsonb, p_expected_memberships jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor public.app_users;
  receipt list_private.operation_receipts;
  request jsonb := jsonb_build_object('operation',p_operation,'lists',p_expected_lists,'memberships',p_expected_memberships);
  current_lists jsonb; expected record; actual jsonb; target_id uuid; current_version integer;
begin
  -- This app authenticates with opaque sessions, as do the existing list RPCs.
  actor := list_private.authorize(p_session_token,p_workspace_id);
  if actor.role not in ('admin','agent','controller') then raise exception 'Vous n’avez pas le droit de modifier les listes.'; end if;
  if p_request_id is null or jsonb_typeof(p_expected_lists) is distinct from 'object'
    or jsonb_typeof(p_expected_memberships) is distinct from 'object' then
    raise exception 'Requête de synchronisation invalide.';
  end if;
  perform pg_advisory_xact_lock(739214801);
  select * into receipt from list_private.operation_receipts where request_id=p_request_id;
  if found then
    if receipt.actor_id <> actor.id or receipt.workspace_id <> p_workspace_id or receipt.request is distinct from request then
      raise exception 'Identifiant de synchronisation déjà utilisé.';
    end if;
    return receipt.result_id;
  end if;

  current_lists := public.read_contract_lists(p_session_token,p_workspace_id);
  for expected in select key,value from jsonb_each(p_expected_lists) loop
    select list_private.offline_snapshot(l) into actual from jsonb_array_elements(current_lists) l where l->>'id'=expected.key;
    if coalesce(actual,'null'::jsonb) is distinct from expected.value then
      raise exception 'Conflit de liste : le lot a été modifié sur un autre appareil. Vos modifications locales sont conservées.';
    end if;
  end loop;
  for expected in select key,value from jsonb_each(p_expected_memberships) loop
    select to_jsonb(m.list_id::text) into actual from public.contract_list_members m
      join public.contract_lists l on l.id=m.list_id
      where m.contract_id=expected.key and l.workspace_id=p_workspace_id;
    if coalesce(actual,'null'::jsonb) is distinct from expected.value then
      raise exception 'Conflit de liste : un contrat a changé de lot sur un autre appareil. Vos modifications locales sont conservées.';
    end if;
  end loop;

  if p_operation->>'action'='create' then
    target_id := (p_operation->>'createId')::uuid;
    if target_id is null then raise exception 'Identifiant de liste requis.'; end if;
    insert into public.contract_lists(id,workspace_id,duration_months,visa_number,history)
      values(target_id,p_workspace_id,(p_operation->>'durationMonths')::integer,
        nullif(btrim(p_operation->>'visaNumber'),''),
        jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'actor',actor.full_name,'action','create')));
    if p_operation ? 'contractIds' then
      perform public.mutate_contract_list(p_session_token,p_workspace_id,jsonb_build_object(
        'action','assign','listId',target_id,'contractIds',p_operation->'contractIds'));
    end if;
  else
    target_id := nullif(p_operation->>'listId','')::uuid;
    select version into current_version from public.contract_lists where id=target_id and workspace_id=p_workspace_id;
    target_id := public.mutate_contract_list(p_session_token,p_workspace_id,
      p_operation || jsonb_build_object('version',current_version));
  end if;
  insert into list_private.operation_receipts(request_id,actor_id,workspace_id,request,result_id)
    values(p_request_id,actor.id,p_workspace_id,request,target_id);
  return target_id;
end;
$$;
revoke all on function public.sync_contract_list(text,text,uuid,jsonb,jsonb,jsonb) from public;
grant execute on function public.sync_contract_list(text,text,uuid,jsonb,jsonb,jsonb) to anon, authenticated;
