-- Statut ephemere des dossiers
alter table dossiers
add column if not exists is_ephemeral boolean default false;

update dossiers
set is_ephemeral = false
where is_ephemeral is null;

alter table dossiers
alter column is_ephemeral set not null;
