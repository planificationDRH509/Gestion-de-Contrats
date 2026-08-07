alter table public.autocompletion
  add column if not exists department text,
  add column if not exists commune text;

comment on column public.autocompletion.department is
  'Département administratif de l’institution, lorsque la suggestion est une institution.';

comment on column public.autocompletion.commune is
  'Commune de l’institution, lorsque la suggestion est une institution.';
