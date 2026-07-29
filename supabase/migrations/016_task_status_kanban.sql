-- Add a three-state workflow to private tasks and expose status changes
-- through the same private session boundary.

alter table public.private_tasks
  add column if not exists status text;

update public.private_tasks
set status = case when completed then 'done' else 'todo' end
where status is null
   or status not in ('todo', 'in_progress', 'done');

alter table public.private_tasks
  alter column status set default 'todo',
  alter column status set not null;

alter table public.private_tasks
  drop constraint if exists private_tasks_status_check;

alter table public.private_tasks
  add constraint private_tasks_status_check
  check (status in ('todo', 'in_progress', 'done'));

create index if not exists private_tasks_owner_status_updated_idx
  on public.private_tasks(owner_id, status, updated_at desc);

-- PostgreSQL cannot change a table function return type in place.
drop function if exists public.list_private_tasks(text);

create function public.list_private_tasks(p_session_token text)
returns table (
  id uuid,
  content text,
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

create or replace function public.set_private_task_status(
  p_session_token text,
  p_task_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid;
begin
  actor_id := public.resolve_task_session(p_session_token);

  if p_status not in ('todo', 'in_progress', 'done') then
    raise exception 'TASK_STATUS_INVALID';
  end if;

  update public.private_tasks
  set
    status = p_status,
    completed = p_status = 'done',
    completed_at = case when p_status = 'done' then now() else null end
  where id = p_task_id
    and owner_id = actor_id;

  return found;
end;
$$;

-- Keep the original completion RPC coherent for older deployed clients.
create or replace function public.set_private_task_completed(
  p_session_token text,
  p_task_id uuid,
  p_completed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid;
begin
  actor_id := public.resolve_task_session(p_session_token);

  update public.private_tasks
  set
    status = case when p_completed then 'done' else 'todo' end,
    completed = p_completed,
    completed_at = case when p_completed then now() else null end
  where id = p_task_id
    and owner_id = actor_id;

  return found;
end;
$$;

revoke all on function public.list_private_tasks(text) from public;
revoke all on function public.set_private_task_status(text, uuid, text) from public;

grant execute on function public.list_private_tasks(text) to anon, authenticated;
grant execute on function public.set_private_task_status(text, uuid, text) to anon, authenticated;
