-- Priorite des dossiers
alter table dossiers
add column if not exists priority text default 'normal';

update dossiers
set priority = 'normal'
where priority is null;

alter table dossiers
alter column priority set not null;

alter table dossiers
drop constraint if exists dossiers_priority_check;

alter table dossiers
add constraint dossiers_priority_check
check (priority in ('normal', 'urgence'));
