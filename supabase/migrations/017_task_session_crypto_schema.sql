-- Supabase installs pgcrypto in the extensions schema. The private task
-- functions use a restricted search_path, so expose that trusted schema when
-- resolving gen_random_bytes() and digest() in the already-deployed functions.

alter function public.resolve_task_session(text)
  set search_path = public, extensions, pg_temp;

alter function public.create_task_session(uuid, text)
  set search_path = public, extensions, pg_temp;

alter function public.revoke_task_session(text)
  set search_path = public, extensions, pg_temp;
