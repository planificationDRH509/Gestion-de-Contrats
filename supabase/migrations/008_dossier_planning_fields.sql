-- Champs de pilotage des dossiers (objectif, commentaire, echeance)
alter table dossiers
add column if not exists contract_target_count integer default 0;

update dossiers
set contract_target_count = 0
where contract_target_count is null;

alter table dossiers
alter column contract_target_count set not null;

alter table dossiers
drop constraint if exists dossiers_contract_target_count_check;

alter table dossiers
add constraint dossiers_contract_target_count_check
check (contract_target_count >= 0);

alter table dossiers
add column if not exists comment text;

alter table dossiers
add column if not exists deadline_date date;
