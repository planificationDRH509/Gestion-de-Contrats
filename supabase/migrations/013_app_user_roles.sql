-- Add application roles while preserving the existing username/password login.
alter table public.app_users
  add column if not exists role text;

-- Keep the conventional admin account as administrator.
update public.app_users
set role = 'admin'
where lower(username) = 'admin';

-- Avoid locking an existing installation if the conventional account was renamed.
do $$
begin
  if exists (select 1 from public.app_users)
     and not exists (select 1 from public.app_users where role = 'admin') then
    update public.app_users
    set role = 'admin'
    where id = (
      select id
      from public.app_users
      order by created_at nulls last, id
      limit 1
    );
  end if;
end
$$;

update public.app_users
set role = 'agent'
where role is null
   or role not in ('admin', 'agent', 'controller', 'reader');

alter table public.app_users
  alter column role set default 'agent',
  alter column role set not null;

alter table public.app_users
  drop constraint if exists app_users_role_check;

alter table public.app_users
  add constraint app_users_role_check
  check (role in ('admin', 'agent', 'controller', 'reader'));
