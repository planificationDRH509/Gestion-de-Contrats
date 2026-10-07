alter table public.private_tasks add column notes text not null default '' check (length(notes) <= 10000);

alter table public.private_tasks add column kind text not null default 'task' check (kind in ('task','note'));

drop function if exists public.list_private_tasks(text);

create function public.list_private_tasks(p_session_token text)
returns table (
  id uuid,
  content text,
  notes text,
  kind text,
  status text,
  completed boolean,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_by_username text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid;
begin
  actor_id := public.resolve_task_session(p_session_token);

  return query
  select
    task.id,
    task.content,
    task.notes,
    task.kind,
    task.status,
    task.completed,
    task.completed_at,
    task.created_at,
    task.updated_at,
    task.created_by,
    creator.full_name,
    creator.username
  from public.private_tasks task
  join public.app_users creator on creator.id = task.created_by
  where task.owner_id = actor_id
  order by
    case task.status
      when 'in_progress' then 1
      when 'todo' then 2
      else 3
    end,
    task.updated_at desc;
end;
$$;

revoke all on function public.list_private_tasks(text) from public;
grant execute on function public.list_private_tasks(text) to anon, authenticated;

create or replace function task_private.sync_task(p_session_token text, p_request_id text, p_operation jsonb)
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
    if coalesce(p_operation->>'kind','task') not in ('task','note')
      or length(coalesce(p_operation->>'notes','')) > 10000 then raise exception 'TASK_CONTENT_INVALID'; end if;
    if p_operation->>'kind'='note' and nullif(p_operation->>'assigneeId','') is not null then raise exception 'TASK_RECIPIENT_INVALID'; end if;
    update public.private_tasks set kind=coalesce(p_operation->>'kind','task'), notes=coalesce(p_operation->>'notes','') where id=result;
    -- A transferred task starts as todo in its recipient's list.
    if nullif(p_operation->>'assigneeId','') is null then
      perform public.set_private_task_status(p_session_token,result,coalesce(p_operation->>'status','todo'));
    end if;
  elsif p_operation->>'type'='status' then
    target := (p_operation->>'taskId')::uuid;
    if not public.set_private_task_status(p_session_token,target,p_operation->>'status') then raise exception 'TASK_NOT_FOUND'; end if;
    result := target;
  elsif p_operation->>'type'='edit' then
    target := (p_operation->>'taskId')::uuid;
    if nullif(btrim(p_operation->>'content'),'') is null
      or length(btrim(p_operation->>'content')) > 1000
      or length(coalesce(p_operation->>'notes','')) > 10000 then
      raise exception 'TASK_CONTENT_INVALID';
    end if;
    update public.private_tasks
      set content=btrim(p_operation->>'content'), notes=coalesce(p_operation->>'notes',''), updated_at=now()
      where id=target and owner_id=actor;
    if not found then raise exception 'TASK_NOT_FOUND'; end if;
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
