-- Row Level Security policies
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table applicants enable row level security;
alter table contracts enable row level security;
alter table contract_print_jobs enable row level security;

create or replace function is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
  );
$$;

create or replace function is_workspace_owner(target_workspace uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

-- Workspaces
create policy "workspaces_select" on workspaces
for select
using (is_workspace_member(id));

create policy "workspaces_insert" on workspaces
for insert
with check (auth.uid() is not null);

create policy "workspaces_update" on workspaces
for update
using (is_workspace_owner(id))
with check (is_workspace_owner(id));

create policy "workspaces_delete" on workspaces
for delete
using (is_workspace_owner(id));

-- Workspace members
create policy "workspace_members_select" on workspace_members
for select
using (user_id = auth.uid());

create policy "workspace_members_insert" on workspace_members
for insert
with check (user_id = auth.uid());

create policy "workspace_members_update" on workspace_members
for update
using (is_workspace_owner(workspace_id))
with check (is_workspace_owner(workspace_id));

create policy "workspace_members_delete" on workspace_members
for delete
using (is_workspace_owner(workspace_id));

-- Applicants
create policy "applicants_select" on applicants
for select
using (is_workspace_member(workspace_id));

create policy "applicants_insert" on applicants
for insert
with check (is_workspace_member(workspace_id));

create policy "applicants_update" on applicants
for update
using (is_workspace_member(workspace_id))
with check (is_workspace_member(workspace_id));

create policy "applicants_delete" on applicants
for delete
using (is_workspace_member(workspace_id));

-- Contracts
create policy "contracts_select" on contracts
for select
using (is_workspace_member(workspace_id));

create policy "contracts_insert" on contracts
for insert
with check (is_workspace_member(workspace_id));

create policy "contracts_update" on contracts
for update
using (is_workspace_member(workspace_id))
with check (is_workspace_member(workspace_id));

create policy "contracts_delete" on contracts
for delete
using (is_workspace_member(workspace_id));

-- Print jobs
create policy "print_jobs_select" on contract_print_jobs
for select
using (is_workspace_member(workspace_id));

create policy "print_jobs_insert" on contract_print_jobs
for insert
with check (is_workspace_member(workspace_id));

create policy "print_jobs_update" on contract_print_jobs
for update
using (is_workspace_member(workspace_id))
with check (is_workspace_member(workspace_id));

create policy "print_jobs_delete" on contract_print_jobs
for delete
using (is_workspace_member(workspace_id));
