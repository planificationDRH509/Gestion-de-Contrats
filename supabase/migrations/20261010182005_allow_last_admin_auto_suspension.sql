-- Eight failed credentials suspend every account, including the last admin.
-- The counter is server-owned; API roles cannot set it to bypass this guard.
create or replace function app_security.guard_user_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and not old.is_suspended
      and (new.role <> 'admin' or (new.is_suspended and new.failed_password_attempts < 8)) then
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

create or replace function app_security.authenticate_app_user(p_user_id uuid, p_password text)
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
    if failures >= 8 then
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

create or replace function app_security.report_offline_suspension(p_session_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare capability app_security.offline_suspension_capabilities; actor public.app_users;
begin
  perform pg_advisory_xact_lock(739214806);
  select * into capability from app_security.offline_suspension_capabilities
    where token_hash=extensions.digest(p_session_token,'sha256') for update;
  if not found then raise exception 'TASK_SESSION_INVALID'; end if;
  if capability.reported then return true; end if;
  select * into actor from public.app_users where id=capability.user_id for update;
  if actor.suspension_epoch=capability.epoch then
    update public.app_users set is_suspended=true,failed_password_attempts=8,updated_at=now() where id=actor.id;
  end if;
  update app_security.offline_suspension_capabilities set reported=true where token_hash=capability.token_hash;
  return true;
end;
$$;
