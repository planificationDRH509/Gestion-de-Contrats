-- The grid records approved amounts by title; an effective date is not part of the model.
create or replace function salary_private.read_grid(p_session_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.resolve_task_session(p_session_token);
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.category,e.masculine) from (
    select id, masculine, feminine, category, salaries, aliases,
      source, source_rows as "sourceRows", notes, active, version from public.salary_grid
  ) e),'[]'::jsonb);
end;
$$;

create or replace function salary_private.save_entry(p_session_token text, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; actor_role text; entry_id text; amounts numeric[]; current_version integer;
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
  select version into current_version from public.salary_grid where id=entry_id;
  if (current_version is not null and current_version is distinct from (p_entry->>'version')::integer)
    or (current_version is null and (p_entry->>'version')::integer is distinct from 0) then
    raise exception 'Cette ligne a changé. Rechargez la grille.';
  end if;
  insert into public.salary_grid(id,masculine,feminine,category,salaries,aliases,source,source_rows,notes,active,version,updated_by)
  values(entry_id,btrim(p_entry->>'masculine'),btrim(p_entry->>'feminine'),btrim(p_entry->>'category'),amounts,
    array(select jsonb_array_elements_text(p_entry->'aliases')),
    coalesce(p_entry->>'source',''),
    array(select v::integer from jsonb_array_elements_text(p_entry->'sourceRows') v),
    coalesce(p_entry->>'notes',''),(p_entry->>'active')::boolean,coalesce(current_version,0)+1,actor)
  on conflict(id) do update set masculine=excluded.masculine,feminine=excluded.feminine,category=excluded.category,
    salaries=excluded.salaries,aliases=excluded.aliases,
    source=excluded.source,source_rows=excluded.source_rows,notes=excluded.notes,active=excluded.active,
    version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
  return salary_private.read_grid(p_session_token);
end;
$$;

alter table public.salary_grid drop constraint salary_grid_check;
alter table public.salary_grid drop column effective_date;
