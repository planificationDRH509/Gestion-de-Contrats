-- Personnalisation des dossiers
alter table dossiers
add column if not exists accent_color text default '#1A8F5A';

alter table dossiers
add column if not exists focal_point text;

alter table dossiers
add column if not exists roadmap_sheet_number text;

update dossiers
set accent_color = '#1A8F5A'
where accent_color is null;

alter table dossiers
alter column accent_color set not null;

alter table dossiers
drop constraint if exists dossiers_accent_color_check;

alter table dossiers
add constraint dossiers_accent_color_check
check (accent_color ~ '^#[0-9A-Fa-f]{6}$');
