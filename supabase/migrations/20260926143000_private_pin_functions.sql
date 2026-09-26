-- Keep privileged pin operations outside the exposed API schema.
create schema pin_private;
revoke all on schema pin_private from public, anon, authenticated;
grant usage on schema pin_private to anon, authenticated;

create function pin_private.read_contracts(p_session_token text)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid;
  pins text[];
begin
  actor_id := public.resolve_task_session(p_session_token);
  select coalesce(array_agg(p.contract_id order by p.created_at, p.contract_id), array[]::text[])
    into pins
    from public.pinned_contracts p
    join public.contrat c on c.id_contrat = p.contract_id
    where p.user_id = actor_id and c.deleted_at is null;
  return pins;
end;
$$;

create function pin_private.set_contract(p_session_token text, p_contract_id text, p_pinned boolean)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid;
  contract_workspace text;
  pin_count integer;
begin
  actor_id := public.resolve_task_session(p_session_token);
  if p_contract_id is null or p_pinned is null then
    raise exception 'Épinglage invalide.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(739214803);
  if p_pinned then
    select c.workspace_id into contract_workspace from public.contrat c
      where c.id_contrat = p_contract_id and c.deleted_at is null;
    if contract_workspace is null then raise exception 'Contrat introuvable.'; end if;
    perform list_private.authorize(p_session_token, contract_workspace);
    if not exists (select 1 from public.pinned_contracts
      where user_id = actor_id and contract_id = p_contract_id) then
      select count(*) into pin_count from public.pinned_contracts p
        where p.user_id = actor_id;
      if pin_count >= 10 then raise exception 'Vous pouvez épingler jusqu’à 10 contrats.'; end if;
      insert into public.pinned_contracts(user_id, contract_id) values(actor_id, p_contract_id);
    end if;
  else
    delete from public.pinned_contracts
      where user_id = actor_id and contract_id = p_contract_id;
  end if;
  return pin_private.read_contracts(p_session_token);
end;
$$;

revoke all on function pin_private.read_contracts(text) from public, anon, authenticated;
revoke all on function pin_private.set_contract(text,text,boolean) from public, anon, authenticated;
grant execute on function pin_private.read_contracts(text) to anon, authenticated;
grant execute on function pin_private.set_contract(text,text,boolean) to anon, authenticated;

create or replace function public.read_pinned_contracts(p_session_token text)
returns text[] language sql security invoker set search_path = '' as $$
  select pin_private.read_contracts(p_session_token);
$$;

create or replace function public.set_pinned_contract(p_session_token text, p_contract_id text, p_pinned boolean)
returns text[] language sql security invoker set search_path = '' as $$
  select pin_private.set_contract(p_session_token, p_contract_id, p_pinned);
$$;
