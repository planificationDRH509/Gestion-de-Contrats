-- Requires the login_app_user client update to be deployed first.
-- The application uses opaque sessions, not Supabase Auth JWT identities.
revoke create on schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

alter table public.app_users add column password_hash text;

create function app_security.hash_password(p_password text)
returns text language sql volatile set search_path = '' as $$
  -- Prehash to avoid bcrypt's 72-byte password truncation.
  select extensions.crypt(encode(extensions.digest(p_password, 'sha256'), 'hex'), extensions.gen_salt('bf', 12));
$$;
revoke all on function app_security.hash_password(text) from public, anon, authenticated;

create function app_security.verify_password(p_user_id uuid, p_password text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.password_hash = extensions.crypt(
    encode(extensions.digest(p_password, 'sha256'), 'hex'), u.password_hash)
    from public.app_users u where u.id = p_user_id), false);
$$;
revoke all on function app_security.verify_password(uuid,text) from public, anon, authenticated;

update public.app_users set password_hash = app_security.hash_password(password), password = '';
alter table public.app_users alter column password_hash set not null;

create function app_security.store_password()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.password is distinct from old.password then
    if new.password is null or length(new.password) < 8 then
      raise exception 'APP_PASSWORD_TOO_SHORT';
    end if;
    new.password_hash := app_security.hash_password(new.password);
    new.password := '';
    if tg_op = 'UPDATE' then
      delete from public.app_task_sessions where user_id = new.id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_security.store_password() from public, anon, authenticated;
create trigger app_users_store_password before insert or update of password on public.app_users
for each row execute function app_security.store_password();

create or replace function public.create_task_session(p_user_id uuid, p_password text)
returns text language plpgsql security definer set search_path = '' as $$
declare raw_token text;
begin
  if not app_security.verify_password(p_user_id, p_password) then
    raise exception 'TASK_SESSION_INVALID_CREDENTIALS';
  end if;
  delete from public.app_task_sessions where expires_at <= now();
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_task_sessions(user_id, token_hash)
  values (p_user_id, extensions.digest(raw_token, 'sha256'));
  return raw_token;
end;
$$;

create or replace function private.change_app_user_password(
  p_session_token text, p_current_password text, p_new_password text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_id uuid;
begin
  actor_id := public.resolve_task_session(p_session_token);
  perform 1 from public.app_users where id = actor_id for update;
  if not app_security.verify_password(actor_id, p_current_password) then
    raise exception 'APP_PASSWORD_CURRENT_INVALID';
  end if;
  if p_new_password is null or length(p_new_password) < 8 then raise exception 'APP_PASSWORD_TOO_SHORT'; end if;
  if p_new_password = p_current_password then raise exception 'APP_PASSWORD_UNCHANGED'; end if;
  update public.app_users set password = p_new_password, updated_at = now() where id = actor_id;
  return true;
end;
$$;

-- These stable helpers read an opaque session sent with every REST request.
-- They never trust a client-supplied role, user id or workspace claim.
create function app_security.request_user_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select s.user_id from public.app_task_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = extensions.digest(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-app-session', 'sha256')
    and s.expires_at > now();
$$;
create function app_security.request_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.app_users where id = app_security.request_user_id();
$$;
create function app_security.request_workspaces()
returns text[] language sql stable security definer set search_path = '' as $$
  select case when workspaces && array['workspace_default','workspace_mouvement','workspace_avantages']
    then workspaces else workspaces || array['workspace_default'] end
  from public.app_users where id = app_security.request_user_id();
$$;
revoke all on function app_security.request_user_id() from public;
revoke all on function app_security.request_role() from public;
revoke all on function app_security.request_workspaces() from public;
grant execute on function app_security.request_user_id(), app_security.request_role(), app_security.request_workspaces() to anon, authenticated;

-- Restrict table privileges as well as rows (TRUNCATE does not obey RLS).
do $$
declare t text; p record;
begin
  foreach t in array array['app_users','workspaces','identification','contrat','dossiers',
    'contract_print_jobs','tags','contract_tags','templates','autocompletion'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    if t <> 'app_users' then
      execute format('grant select, insert, update, delete on table public.%I to anon, authenticated', t);
    end if;
  end loop;
end;
$$;

grant select (id, username, full_name, role, workspaces, created_at, updated_at)
  on public.app_users to anon, authenticated;
grant insert (username, full_name, password, role, workspaces) on public.app_users to anon, authenticated;
grant update (role) on public.app_users to anon, authenticated;
create policy app_users_read on public.app_users for select to anon, authenticated
using ((select app_security.request_user_id()) is not null);
create policy app_users_create on public.app_users for insert to anon, authenticated
with check ((select app_security.request_role()) = 'admin');
create policy app_users_role_update on public.app_users for update to anon, authenticated
using ((select app_security.request_role()) = 'admin' and id <> (select app_security.request_user_id()))
with check ((select app_security.request_role()) = 'admin' and id <> (select app_security.request_user_id()));

-- Serialize administrator changes and prevent removal of the last administrator.
create function app_security.guard_user_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and new.role <> 'admin' then
    perform pg_advisory_xact_lock(739214806);
    if not exists(select 1 from public.app_users where role = 'admin' and id <> old.id) then
      raise exception 'Au moins un compte administrateur doit être conservé.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_security.guard_user_role() from public, anon, authenticated;
create trigger app_users_guard_role before update of role on public.app_users
for each row execute function app_security.guard_user_role();

do $$
declare t text; writers text;
begin
  foreach t in array array['workspaces','identification','contrat','dossiers',
    'contract_print_jobs','tags','templates','autocompletion'] loop
    execute format('create policy session_read on public.%I for select to anon, authenticated using (%I = any((select app_security.request_workspaces())::text[]))',
      t, case when t = 'workspaces' then 'id' else 'workspace_id' end);
    writers := case
      when t in ('workspaces','templates') then '''admin'''
      when t in ('identification','dossiers') then '''admin'',''agent'''
      when t = 'contract_print_jobs' then '''admin'',''agent'',''controller'',''reader'''
      else '''admin'',''agent'',''controller''' end;
    if t = 'contrat' then writers := '''admin'',''agent'''; end if;
    execute format('create policy session_insert on public.%I for insert to anon, authenticated with check (%I = any((select app_security.request_workspaces())::text[]) and (select app_security.request_role()) in (%s)%s)',
      t, case when t = 'workspaces' then 'id' else 'workspace_id' end, writers,
      case when t = 'autocompletion' then ' and type <> ''institution''' else '' end);
    if t = 'contrat' then writers := '''admin'',''agent'',''controller'''; end if;
    if t = 'autocompletion' then writers := '''admin'''; end if;
    execute format('create policy session_update on public.%I for update to anon, authenticated using (%I = any((select app_security.request_workspaces())::text[]) and (select app_security.request_role()) in (%s)%s) with check (%I = any((select app_security.request_workspaces())::text[]) and (select app_security.request_role()) in (%s)%s)',
      t, case when t = 'workspaces' then 'id' else 'workspace_id' end, writers,
      case when t = 'autocompletion' then ' and type <> ''institution''' else '' end,
      case when t = 'workspaces' then 'id' else 'workspace_id' end, writers,
      case when t = 'autocompletion' then ' and type <> ''institution''' else '' end);
    if t = 'contrat' then writers := '''admin'''; end if;
    execute format('create policy session_delete on public.%I for delete to anon, authenticated using (%I = any((select app_security.request_workspaces())::text[]) and (select app_security.request_role()) in (%s)%s)',
      t, case when t = 'workspaces' then 'id' else 'workspace_id' end, writers,
      case when t = 'autocompletion' then ' and type <> ''institution''' else '' end);
  end loop;
end;
$$;

create policy contract_tags_read on public.contract_tags for select to anon, authenticated
using (exists(select 1 from public.contrat c where c.id_contrat = contract_id)
  and exists(select 1 from public.tags t where t.id = tag_id));
create policy contract_tags_insert on public.contract_tags for insert to anon, authenticated
with check ((select app_security.request_role()) in ('admin','agent','controller')
  and exists(select 1 from public.contrat c join public.tags t on t.workspace_id = c.workspace_id
    where c.id_contrat = contract_id and t.id = tag_id));
create policy contract_tags_delete on public.contract_tags for delete to anon, authenticated
using ((select app_security.request_role()) in ('admin','agent','controller')
  and exists(select 1 from public.contrat c where c.id_contrat = contract_id));
revoke update on public.contract_tags from anon, authenticated;

create function app_security.guard_contract_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare actor_role text;
begin
  -- Privileged RPCs have their own session, role and workspace checks.
  if current_user not in ('anon','authenticated') then return new; end if;
  actor_role := app_security.request_role();
  if tg_op = 'UPDATE' then
    if new.deleted_at is distinct from old.deleted_at and actor_role is distinct from 'admin' then
      raise exception 'Suppression réservée aux administrateurs.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and actor_role not in ('admin','controller') then
      raise exception 'Changement de statut non autorisé.' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'Auteur de création immuable.' using errcode = '42501';
    end if;
  else
    new.created_by := app_security.request_user_id();
    if actor_role <> 'admin' and new.status not in ('draft','saisie') then
      raise exception 'Statut initial non autorisé.' using errcode = '42501';
    end if;
  end if;
  if new.nif is not null and not exists(select 1 from public.identification
    where nif = new.nif and workspace_id = new.workspace_id) then
    raise exception 'Identité inaccessible.' using errcode = '42501';
  end if;
  if new.dossier_id is not null and not exists(select 1 from public.dossiers
    where id = new.dossier_id and workspace_id = new.workspace_id) then
    raise exception 'Dossier inaccessible.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_security.guard_contract_write() from public, anon, authenticated;
create trigger contrat_check_access before insert or update on public.contrat
for each row execute function app_security.guard_contract_write();

-- Keep the existing RPC signatures, moving privileged implementations outside
-- the exposed public schema. Each implementation validates its session token.
do $$
declare f record; forwarded text;
begin
  for f in select p.oid, p.proname, p.proretset,
    pg_get_function_identity_arguments(p.oid) identity_args,
    pg_get_function_arguments(p.oid) all_args,
    pg_get_function_result(p.oid) result_type,
    p.pronargs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef loop
    select string_agg('$' || i, ', ' order by i) into forwarded from generate_series(1,f.pronargs) i;
    execute format('alter function public.%I(%s) set schema app_security', f.proname, f.identity_args);
    execute format('revoke all on function app_security.%I(%s) from public', f.proname, f.identity_args);
    execute format('grant execute on function app_security.%I(%s) to anon, authenticated', f.proname, f.identity_args);
    execute format('create function public.%I(%s) returns %s language sql security invoker set search_path = '''' as %L',
      f.proname, f.all_args, f.result_type,
      format('select %sapp_security.%I(%s);', case when f.proretset then '* from ' else '' end, f.proname, coalesce(forwarded,'')));
    execute format('revoke all on function public.%I(%s) from public', f.proname, f.identity_args);
    execute format('grant execute on function public.%I(%s) to anon, authenticated, service_role', f.proname, f.identity_args);
  end loop;
end;
$$;
revoke execute on function public.ensure_contrat_audit_history(), public.set_private_task_updated_at() from public, anon, authenticated;
alter table salary_archive.contrat_words enable row level security;
notify pgrst, 'reload schema';
