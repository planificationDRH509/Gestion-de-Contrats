-- Change the password of an application account only after checking the
-- current credential. The app uses public.app_users instead of Supabase Auth.
create or replace function public.change_app_user_password(
  p_session_token text,
  p_current_password text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
begin
  actor_id := public.resolve_task_session(p_session_token);

  if p_current_password is null
     or not exists (
       select 1
       from public.app_users
       where id = actor_id
         and password = p_current_password
     ) then
    raise exception 'APP_PASSWORD_CURRENT_INVALID';
  end if;

  if p_new_password is null or char_length(p_new_password) < 8 then
    raise exception 'APP_PASSWORD_TOO_SHORT';
  end if;

  if p_new_password = p_current_password then
    raise exception 'APP_PASSWORD_UNCHANGED';
  end if;

  update public.app_users
  set password = p_new_password,
      updated_at = now()
  where id = actor_id
    and password = p_current_password;

  if not found then
    raise exception 'APP_PASSWORD_CURRENT_INVALID';
  end if;

  -- Any previously issued private-task token must stop working after a
  -- credential change. The client creates a fresh token immediately after.
  delete from public.app_task_sessions
  where user_id = actor_id;

  return true;
end;
$$;

revoke all on function public.change_app_user_password(text, text, text) from public;
grant execute on function public.change_app_user_password(text, text, text) to anon, authenticated;
