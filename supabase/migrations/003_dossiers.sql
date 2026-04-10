-- Dossiers: regroupement de contrats
create table if not exists dossiers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table contracts
add column if not exists dossier_id uuid references dossiers(id) on delete set null;

create index if not exists dossiers_workspace_idx on dossiers (workspace_id);
create unique index if not exists dossiers_workspace_name_unique_idx
on dossiers (workspace_id, lower(name))
where deleted_at is null;

create index if not exists contracts_dossier_idx on contracts (workspace_id, dossier_id);

drop trigger if exists set_updated_at_dossiers on dossiers;
create trigger set_updated_at_dossiers
before update on dossiers
for each row execute procedure set_updated_at();

alter table dossiers enable row level security;

drop policy if exists "dossiers_select" on dossiers;
create policy "dossiers_select" on dossiers
for select
using (is_workspace_member(workspace_id));

drop policy if exists "dossiers_insert" on dossiers;
create policy "dossiers_insert" on dossiers
for insert
with check (is_workspace_member(workspace_id));

drop policy if exists "dossiers_update" on dossiers;
create policy "dossiers_update" on dossiers
for update
using (is_workspace_member(workspace_id))
with check (is_workspace_member(workspace_id));

drop policy if exists "dossiers_delete" on dossiers;
create policy "dossiers_delete" on dossiers
for delete
using (is_workspace_member(workspace_id));
