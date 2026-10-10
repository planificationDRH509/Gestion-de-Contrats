alter table public.app_users add column is_suspended boolean not null default false;
grant select (is_suspended) on public.app_users to anon, authenticated;

create or replace function app_security.create_task_session(p_user_id uuid, p_password text)
returns text language plpgsql security definer set search_path = '' as $$
declare raw_token text; suspended boolean;
begin
  select is_suspended into suspended from public.app_users where id = p_user_id for share;
  if not app_security.verify_password(p_user_id, p_password) then
    raise exception 'TASK_SESSION_INVALID_CREDENTIALS';
  end if;
  if suspended then raise exception 'APP_ACCOUNT_SUSPENDED'; end if;
  delete from public.app_task_sessions where expires_at <= now();
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_task_sessions(user_id, token_hash)
    values (p_user_id, extensions.digest(raw_token, 'sha256'));
  return raw_token;
end;
$$;

create or replace function app_security.request_user_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select s.user_id from public.app_task_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = extensions.digest(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-app-session', 'sha256')
    and s.expires_at > now() and not u.is_suspended;
$$;

create or replace function app_security.resolve_task_session(p_session_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare session_user_id uuid;
begin
  if p_session_token is null or char_length(p_session_token) < 32 then
    raise exception 'TASK_SESSION_INVALID';
  end if;
  select s.user_id into session_user_id from public.app_task_sessions s
    join public.app_users u on u.id = s.user_id
    where s.token_hash = extensions.digest(p_session_token, 'sha256')
      and s.expires_at > now() and not u.is_suspended;
  if session_user_id is null then raise exception 'TASK_SESSION_INVALID'; end if;
  update public.app_task_sessions set last_used_at = now()
    where token_hash = extensions.digest(p_session_token, 'sha256');
  return session_user_id;
end;
$$;

create or replace function app_security.guard_user_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and not old.is_suspended
      and (new.role <> 'admin' or new.is_suspended) then
    perform pg_advisory_xact_lock(739214806);
    if not exists(select 1 from public.app_users
        where role = 'admin' and not is_suspended and id <> old.id) then
      raise exception 'Au moins un compte administrateur actif doit être conservé.';
    end if;
  end if;
  if new.is_suspended and not old.is_suspended then
    delete from public.app_task_sessions where user_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger app_users_guard_role on public.app_users;
create trigger app_users_guard_role before update of role, is_suspended on public.app_users
for each row execute function app_security.guard_user_role();

create function app_security.set_app_user_suspended(
  p_session_token text, p_user_id uuid, p_is_suspended boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid;
begin
  perform pg_advisory_xact_lock(739214806);
  actor_id := app_security.resolve_task_session(p_session_token);
  if not exists(select 1 from public.app_users where id = actor_id and role = 'admin' and not is_suspended) then
    raise exception 'Action réservée aux administrateurs.' using errcode = '42501';
  end if;
  if p_is_suspended is null then raise exception 'Statut invalide.'; end if;
  update public.app_users set is_suspended = p_is_suspended, updated_at = now() where id = p_user_id;
  if not found then raise exception 'Compte introuvable.'; end if;
  return true;
end;
$$;
revoke all on function app_security.set_app_user_suspended(text,uuid,boolean) from public;
grant execute on function app_security.set_app_user_suspended(text,uuid,boolean) to anon, authenticated;
create function public.set_app_user_suspended(
  p_session_token text, p_user_id uuid, p_is_suspended boolean)
returns boolean language sql security invoker set search_path = '' as $$
  select app_security.set_app_user_suspended(p_session_token, p_user_id, p_is_suspended);
$$;
revoke all on function public.set_app_user_suspended(text,uuid,boolean) from public;
grant execute on function public.set_app_user_suspended(text,uuid,boolean) to anon, authenticated;
