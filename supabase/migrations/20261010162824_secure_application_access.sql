-- Deploy this compatibility endpoint before updating the web application.
-- The following enforce_application_rls migration closes the legacy table API.
create schema if not exists app_security;
revoke all on schema app_security from public, anon, authenticated;
grant usage on schema app_security to anon, authenticated, service_role;
alter default privileges in schema app_security revoke execute on functions from public;

create function app_security.login(p_username text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor public.app_users; token text;
begin
  select * into actor from public.app_users where username = btrim(p_username);
  if actor.id is null then raise exception 'TASK_SESSION_INVALID_CREDENTIALS'; end if;
  token := public.create_task_session(actor.id, p_password);
  return jsonb_build_object('id', actor.id, 'username', actor.username,
    'full_name', actor.full_name, 'role', actor.role, 'workspaces', actor.workspaces,
    'taskSessionToken', token);
end;
$$;
revoke all on function app_security.login(text,text) from public;
grant execute on function app_security.login(text,text) to anon, authenticated;

create function public.login_app_user(p_username text, p_password text)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_security.login(p_username, p_password);
$$;
revoke all on function public.login_app_user(text,text) from public;
grant execute on function public.login_app_user(text,text) to anon, authenticated;
