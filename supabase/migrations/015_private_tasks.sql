-- Private, account-scoped task list.
--
-- The application uses its own app_users authentication instead of Supabase
-- Auth. Task access therefore goes through short-lived opaque sessions and
-- SECURITY DEFINER functions. The tables themselves are never exposed to the
-- anonymous API role.

create table if not exists public.app_task_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists app_task_sessions_user_idx
  on public.app_task_sessions(user_id);

create index if not exists app_task_sessions_expiry_idx
  on public.app_task_sessions(expires_at);

create table if not exists public.private_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users(id) on delete cascade,
  created_by uuid not null references public.app_users(id) on delete cascade,
  content text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_tasks_content_check
    check (char_length(btrim(content)) between 1 and 1000)
);

create index if not exists private_tasks_owner_updated_idx
  on public.private_tasks(owner_id, completed, updated_at desc);

alter table public.app_task_sessions enable row level security;
alter table public.private_tasks enable row level security;

revoke all on table public.app_task_sessions from anon, authenticated;
revoke all on table public.private_tasks from anon, authenticated;

create or replace function public.set_private_task_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_private_tasks on public.private_tasks;
create trigger set_updated_at_private_tasks
before update on public.private_tasks
for each row execute procedure public.set_private_task_updated_at();

create or replace function public.resolve_task_session(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_user_id uuid;
begin
  if p_session_token is null or char_length(p_session_token) < 32 then
    raise exception 'TASK_SESSION_INVALID';
  end if;

  select user_id
  into session_user_id
  from public.app_task_sessions
  where token_hash = digest(p_session_token, 'sha256')
    and expires_at > now();

  if session_user_id is null then
    raise exception 'TASK_SESSION_INVALID';
  end if;

  update public.app_task_sessions
  set last_used_at = now()
  where token_hash = digest(p_session_token, 'sha256');

  return session_user_id;
end;
$$;

create or replace function public.create_task_session(
  p_user_id uuid,
  p_password text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  raw_token text;
begin
  if not exists (
    select 1
    from public.app_users
    where id = p_user_id
      and password = p_password
  ) then
    raise exception 'TASK_SESSION_INVALID_CREDENTIALS';
  end if;

  delete from public.app_task_sessions where expires_at <= now();

  raw_token := encode(gen_random_bytes(32), 'hex');

  insert into public.app_task_sessions(user_id, token_hash)
  values (p_user_id, digest(raw_token, 'sha256'));

  return raw_token;
end;
$$;

create or replace function public.revoke_task_session(p_session_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.app_task_sessions
  where token_hash = digest(coalesce(p_session_token, ''), 'sha256');
  return found;
end;
$$;

create or replace function public.list_task_recipients(p_session_token text)
returns table (
  id uuid,
  username text,
  full_name text
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
  select app_user.id, app_user.username, app_user.full_name
  from public.app_users app_user
  where app_user.id <> actor_id
  order by app_user.full_name, app_user.username;
end;
$$;

create or replace function public.list_private_tasks(p_session_token text)
returns table (
  id uuid,
  content text,
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
  order by task.completed asc, task.updated_at desc;
end;
$$;

create or replace function public.create_private_task(
  p_session_token text,
  p_content text,
  p_assignee_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid;
  target_id uuid;
  created_task_id uuid;
begin
  actor_id := public.resolve_task_session(p_session_token);
  target_id := coalesce(p_assignee_id, actor_id);

  if not exists (select 1 from public.app_users where id = target_id) then
    raise exception 'TASK_RECIPIENT_NOT_FOUND';
  end if;

  insert into public.private_tasks(owner_id, created_by, content)
  values (target_id, actor_id, btrim(p_content))
  returning id into created_task_id;

  return created_task_id;
end;
$$;

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
    completed = p_completed,
    completed_at = case when p_completed then now() else null end
  where id = p_task_id
    and owner_id = actor_id;

  return found;
end;
$$;

create or replace function public.delete_private_task(
  p_session_token text,
  p_task_id uuid
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

  delete from public.private_tasks
  where id = p_task_id
    and owner_id = actor_id;

  return found;
end;
$$;

revoke all on function public.resolve_task_session(text) from public;
revoke all on function public.create_task_session(uuid, text) from public;
revoke all on function public.revoke_task_session(text) from public;
revoke all on function public.list_task_recipients(text) from public;
revoke all on function public.list_private_tasks(text) from public;
revoke all on function public.create_private_task(text, text, uuid) from public;
revoke all on function public.set_private_task_completed(text, uuid, boolean) from public;
revoke all on function public.delete_private_task(text, uuid) from public;

grant execute on function public.create_task_session(uuid, text) to anon, authenticated;
grant execute on function public.revoke_task_session(text) to anon, authenticated;
grant execute on function public.list_task_recipients(text) to anon, authenticated;
grant execute on function public.list_private_tasks(text) to anon, authenticated;
grant execute on function public.create_private_task(text, text, uuid) to anon, authenticated;
grant execute on function public.set_private_task_completed(text, uuid, boolean) to anon, authenticated;
grant execute on function public.delete_private_task(text, uuid) to anon, authenticated;
