alter table public.salary_grid
  add column job_type text not null default 'Technique'
  check (job_type in ('Universitaire', 'Technique'));

-- Classify by the current job, including titles added or edited after the import.
update public.salary_grid
set job_type = case
  when category = 'Personnel de décision' then 'Universitaire'
  when category = 'Personnel d’encadrement'
    and masculine not like 'Assistant Administratif%'
    and masculine not like 'Inspecteur%' then 'Universitaire'
  when category = 'Personnel professionnel diplômé ou certifié'
    and masculine not like 'Technicien%'
    and masculine not like 'Tech.%'
    and masculine not like 'Teneur de Livre%'
    and masculine not ilike 'Agent Douanier%' then 'Universitaire'
  when category = 'Personnel médical'
    and masculine not like 'Auxiliaire%'
    and masculine not like 'Aide en soins%'
    and masculine not like 'Régisseur%'
    and masculine not like 'Massothérapeute%' then 'Universitaire'
  else 'Technique'
end;

create or replace function salary_private.read_grid(p_session_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.resolve_task_session(p_session_token);
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.category,e.masculine) from (
    select id, masculine, feminine, category, job_type as "jobType", salaries, aliases,
      source, source_rows as "sourceRows", notes, active, version from public.salary_grid
  ) e),'[]'::jsonb);
end;
$$;

create or replace function salary_private.save_entry(p_session_token text, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; actor_role text; entry_id text; amounts numeric[]; current_version integer; current_job_type text; entry_job_type text;
begin
  actor := public.resolve_task_session(p_session_token);
  select role into actor_role from public.app_users where id=actor;
  if actor_role is distinct from 'admin' then raise exception 'Modification réservée aux administrateurs.'; end if;
  entry_id := p_entry->>'id';
  if entry_id is null or length(entry_id) not between 1 and 150 then raise exception 'Identifiant invalide.'; end if;
  select array_agg(distinct v::numeric order by v::numeric) into amounts from jsonb_array_elements_text(p_entry->'salaries') v;
  if amounts is null or cardinality(amounts)=0 or exists(select 1 from unnest(amounts) n where n is null or n <= 0 or n <> round(n,2) or n::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'Salaires invalides.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(739214804);
  select version, job_type into current_version, current_job_type from public.salary_grid where id=entry_id;
  if (current_version is not null and current_version is distinct from (p_entry->>'version')::integer)
    or (current_version is null and (p_entry->>'version')::integer is distinct from 0) then
    raise exception 'Cette ligne a changé. Rechargez la grille.';
  end if;
  entry_job_type := coalesce(p_entry->>'jobType', current_job_type, 'Technique');
  if entry_job_type not in ('Universitaire', 'Technique') then raise exception 'Type de poste invalide.'; end if;
  insert into public.salary_grid(id,masculine,feminine,category,job_type,salaries,aliases,source,source_rows,notes,active,version,updated_by)
  values(entry_id,btrim(p_entry->>'masculine'),btrim(p_entry->>'feminine'),btrim(p_entry->>'category'),entry_job_type,amounts,
    array(select jsonb_array_elements_text(p_entry->'aliases')),
    coalesce(p_entry->>'source',''),
    array(select v::integer from jsonb_array_elements_text(p_entry->'sourceRows') v),
    coalesce(p_entry->>'notes',''),(p_entry->>'active')::boolean,coalesce(current_version,0)+1,actor)
  on conflict(id) do update set masculine=excluded.masculine,feminine=excluded.feminine,category=excluded.category,
    job_type=excluded.job_type,salaries=excluded.salaries,aliases=excluded.aliases,
    source=excluded.source,source_rows=excluded.source_rows,notes=excluded.notes,active=excluded.active,
    version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
  return salary_private.read_grid(p_session_token);
end;
$$;
