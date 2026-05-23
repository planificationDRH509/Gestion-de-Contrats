alter table tags
  add column if not exists workspace_id text not null default 'workspace_default',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists created_by text;

alter table tags
  alter column color set default '#64748b';

alter table tags drop constraint if exists tags_name_key;
drop index if exists tags_name_key;

create unique index if not exists tags_workspace_name_unique_idx
  on tags (workspace_id, lower(name))
  where deleted_at is null;

create index if not exists tags_workspace_idx on tags(workspace_id);
