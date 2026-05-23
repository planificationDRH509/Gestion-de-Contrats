alter table dossiers
add column if not exists status text default 'active';

update dossiers
set status = 'active'
where status is null;

alter table dossiers
alter column status set not null;

alter table dossiers
drop constraint if exists dossiers_status_check;

alter table dossiers
add constraint dossiers_status_check
check (status in ('active', 'classified'));
