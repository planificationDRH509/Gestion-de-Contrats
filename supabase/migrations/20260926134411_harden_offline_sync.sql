-- The application uses opaque app_task_sessions, not Supabase Auth JWTs.
-- Keep privileged code and receipts outside the exposed API schema.
create schema if not exists task_private;
revoke all on schema task_private from public;
grant usage on schema task_private to anon, authenticated;
create table task_private.sync_receipts (
  actor_id uuid not null references public.app_users(id) on delete cascade,
  request_id text not null check (length(request_id) between 1 and 200),
  request jsonb not null,
  result_id uuid,
  created_at timestamptz not null default now(),
  primary key (actor_id, request_id)
);
alter table task_private.sync_receipts enable row level security;
revoke all on task_private.sync_receipts from public, anon, authenticated;

create function task_private.sync_task(p_session_token text, p_request_id text, p_operation jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; receipt task_private.sync_receipts; result uuid; target uuid;
begin
  actor := public.resolve_task_session(p_session_token);
  if p_request_id is null or length(p_request_id) not between 1 and 200
    or jsonb_typeof(p_operation) is distinct from 'object' then raise exception 'TASK_REQUEST_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_request_id, 0));
  select * into receipt from task_private.sync_receipts where actor_id=actor and request_id=p_request_id;
  if found then
    if receipt.request is distinct from p_operation then raise exception 'TASK_REQUEST_REUSED'; end if;
    return receipt.result_id;
  end if;
  if p_operation->>'type'='create' then
    result := public.create_private_task(p_session_token, p_operation->>'content', nullif(p_operation->>'assigneeId','')::uuid);
    -- A transferred task starts as todo in its recipient's list.
    if nullif(p_operation->>'assigneeId','') is null then
      perform public.set_private_task_status(p_session_token,result,coalesce(p_operation->>'status','todo'));
    end if;
  elsif p_operation->>'type'='status' then
    target := (p_operation->>'taskId')::uuid;
    if not public.set_private_task_status(p_session_token,target,p_operation->>'status') then raise exception 'TASK_NOT_FOUND'; end if;
    result := target;
  elsif p_operation->>'type'='delete' then
    target := (p_operation->>'taskId')::uuid;
    -- The owner predicate lives in the existing function. A missing task is already deleted.
    perform public.delete_private_task(p_session_token,target);
    result := target;
  else raise exception 'TASK_OPERATION_INVALID'; end if;
  insert into task_private.sync_receipts(actor_id,request_id,request,result_id) values(actor,p_request_id,p_operation,result);
  return result;
end;
$$;
revoke all on function task_private.sync_task(text,text,jsonb) from public;
grant execute on function task_private.sync_task(text,text,jsonb) to anon, authenticated;
create function public.sync_private_task(p_session_token text, p_request_id text, p_operation jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select task_private.sync_task(p_session_token,p_request_id,p_operation);
$$;
revoke all on function public.sync_private_task(text,text,jsonb) from public;
grant execute on function public.sync_private_task(text,text,jsonb) to anon, authenticated;
