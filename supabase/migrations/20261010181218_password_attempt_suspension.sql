alter table public.app_users
  add column failed_password_attempts integer not null default 0 check (failed_password_attempts between 0 and 8),
  add column suspension_epoch bigint not null default 0;

-- This capability can only suspend its own account. It survives session expiry
-- so an offline lockout remains reportable; reactivation invalidates its epoch.
create table app_security.offline_suspension_capabilities (
  token_hash bytea primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  epoch bigint not null,
  reported boolean not null default false
);
create index on app_security.offline_suspension_capabilities(user_id);
alter table app_security.offline_suspension_capabilities enable row level security;
revoke all on app_security.offline_suspension_capabilities from public, anon, authenticated;
insert into app_security.offline_suspension_capabilities(token_hash,user_id,epoch)
  select s.token_hash,s.user_id,u.suspension_epoch from public.app_task_sessions s
  join public.app_users u on u.id=s.user_id;

create function app_security.reset_reactivated_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.is_suspended and not new.is_suspended then
    new.failed_password_attempts := 0;
    new.suspension_epoch := old.suspension_epoch + 1;
  end if;
  return new;
end;
$$;
revoke all on function app_security.reset_reactivated_account() from public, anon, authenticated;
create trigger app_users_reset_reactivated before update of is_suspended on public.app_users
for each row execute function app_security.reset_reactivated_account();

create function app_security.authenticate_app_user(p_user_id uuid, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor public.app_users; raw_token text; failures integer;
begin
  -- Same order as administrator suspension, including the last-admin guard.
  perform pg_advisory_xact_lock(739214806);
  select * into actor from public.app_users where id=p_user_id for update;
  if actor.id is null then return jsonb_build_object('error','TASK_SESSION_INVALID_CREDENTIALS'); end if;
  if actor.is_suspended then return jsonb_build_object('error','APP_ACCOUNT_SUSPENDED'); end if;
  if not app_security.verify_password(actor.id,p_password) then
    failures := least(8, actor.failed_password_attempts + 1);
    update public.app_users set failed_password_attempts=failures where id=actor.id;
    if failures >= 8 and (actor.role <> 'admin' or exists(
      select 1 from public.app_users where role='admin' and not is_suspended and id<>actor.id)) then
      update public.app_users set is_suspended=true,updated_at=now() where id=actor.id;
      return jsonb_build_object('error','APP_ACCOUNT_SUSPENDED');
    end if;
    -- Do not RAISE: that would roll back the failed attempt counter.
    return jsonb_build_object('error','TASK_SESSION_INVALID_CREDENTIALS','failedAttempts',failures);
  end if;
  update public.app_users set failed_password_attempts=0 where id=actor.id;
  raw_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.app_task_sessions(user_id,token_hash)
    values(actor.id,extensions.digest(raw_token,'sha256'));
  insert into app_security.offline_suspension_capabilities(token_hash,user_id,epoch)
    values(extensions.digest(raw_token,'sha256'),actor.id,actor.suspension_epoch);
  return jsonb_build_object('id',actor.id,'username',actor.username,'full_name',actor.full_name,
    'role',actor.role,'workspaces',actor.workspaces,'taskSessionToken',raw_token);
end;
$$;
revoke all on function app_security.authenticate_app_user(uuid,text) from public;
grant execute on function app_security.authenticate_app_user(uuid,text) to anon,authenticated;
create function public.authenticate_app_user(p_user_id uuid,p_password text)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_security.authenticate_app_user(p_user_id,p_password);
$$;
revoke all on function public.authenticate_app_user(uuid,text) from public;
grant execute on function public.authenticate_app_user(uuid,text) to anon,authenticated;

create or replace function app_security.login(p_username text,p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid;
begin
  select id into actor_id from public.app_users where username=btrim(p_username);
  return app_security.authenticate_app_user(actor_id,p_password);
end;
$$;
-- Legacy clients must also count failures. Return NULL on denial rather than
-- raising an exception that would undo the counter/suspension transaction.
create or replace function app_security.create_task_session(p_user_id uuid,p_password text)
returns text language sql security definer set search_path = '' as $$
  select app_security.authenticate_app_user(p_user_id,p_password)->>'taskSessionToken';
$$;

create function app_security.report_offline_suspension(p_session_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare capability app_security.offline_suspension_capabilities; actor public.app_users;
begin
  perform pg_advisory_xact_lock(739214806);
  select * into capability from app_security.offline_suspension_capabilities
    where token_hash=extensions.digest(p_session_token,'sha256') for update;
  if not found then raise exception 'TASK_SESSION_INVALID'; end if;
  if capability.reported then return true; end if;
  select * into actor from public.app_users where id=capability.user_id for update;
  if actor.suspension_epoch=capability.epoch and (actor.role <> 'admin' or exists(
    select 1 from public.app_users where role='admin' and not is_suspended and id<>actor.id)) then
    update public.app_users set is_suspended=true,failed_password_attempts=8,updated_at=now() where id=actor.id;
  end if;
  update app_security.offline_suspension_capabilities set reported=true where token_hash=capability.token_hash;
  return true;
end;
$$;
revoke all on function app_security.report_offline_suspension(text) from public;
grant execute on function app_security.report_offline_suspension(text) to anon,authenticated;
create function public.report_offline_suspension(p_session_token text)
returns boolean language sql security invoker set search_path = '' as $$
  select app_security.report_offline_suspension(p_session_token);
$$;
revoke all on function public.report_offline_suspension(text) from public;
grant execute on function public.report_offline_suspension(text) to anon,authenticated;

-- Direct password-change calls must not bypass the attempt counter either.
create or replace function private.change_app_user_password(
  p_session_token text,p_current_password text,p_new_password text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; verified jsonb;
begin
  perform pg_advisory_xact_lock(739214806);
  actor_id := app_security.resolve_task_session(p_session_token);
  verified := app_security.authenticate_app_user(actor_id,p_current_password);
  if verified ? 'error' then return false; end if;
  if p_new_password is null or length(p_new_password)<8 then raise exception 'APP_PASSWORD_TOO_SHORT'; end if;
  if p_new_password=p_current_password then raise exception 'APP_PASSWORD_UNCHANGED'; end if;
  update public.app_users set password=p_new_password,updated_at=now() where id=actor_id;
  return true;
end;
$$;
