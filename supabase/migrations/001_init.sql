-- PLANIFICATION schema
create extension if not exists "pgcrypto";

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create table if not exists applicants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  gender text not null,
  first_name text not null,
  last_name text not null,
  nif text,
  ninu text,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  applicant_id uuid references applicants(id) on delete set null,
  status text not null default 'draft',
  gender text not null,
  first_name text not null,
  last_name text not null,
  nif text,
  ninu text,
  address text not null,
  position text not null,
  assignment text not null,
  salary_number numeric(12,2) not null,
  salary_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint contracts_status_check check (status in ('draft','final'))
);

create table if not exists contract_print_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contract_ids uuid[] not null,
  created_at timestamptz not null default now(),
  printed_at timestamptz
);

create index if not exists applicants_search_idx on applicants (workspace_id, last_name, first_name);
create index if not exists applicants_nif_idx on applicants (workspace_id, nif);
create index if not exists applicants_ninu_idx on applicants (workspace_id, ninu);

create index if not exists contracts_search_idx on contracts (workspace_id, last_name, first_name);
create index if not exists contracts_nif_idx on contracts (workspace_id, nif);
create index if not exists contracts_ninu_idx on contracts (workspace_id, ninu);
create index if not exists contracts_assignment_idx on contracts (workspace_id, assignment);
create index if not exists contracts_position_idx on contracts (workspace_id, position);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_workspaces
before update on workspaces
for each row execute procedure set_updated_at();

create trigger set_updated_at_applicants
before update on applicants
for each row execute procedure set_updated_at();

create trigger set_updated_at_contracts
before update on contracts
for each row execute procedure set_updated_at();
