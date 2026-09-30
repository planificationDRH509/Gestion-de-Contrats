-- Shared grammar families are independent of administrative institution types.
create table public.institution_preposition_rules (
  family text primary key,
  prefix text not null check (length(btrim(prefix)) between 1 and 50),
  version integer not null default 1 check (version > 0)
);
alter table public.institution_preposition_rules enable row level security;
revoke all on public.institution_preposition_rules from public,anon,authenticated;

insert into public.institution_preposition_rules(family,prefix) values
  ('hospital','à l’'),('health_centre','au'),('hospital_centre','au'),
  ('social_medical_centre','au'),('centre','au'),('department','au'),
  ('direction','à la'),('bureau','au'),('unit','à l’'),('clinic','à la'),
  ('maternity','à la'),('dispensary','au'),('sanatorium','au'),
  ('brigade','à la'),('administration','à l’'),('society','à la');

create function institution_private.read_prepositions(p_session_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.resolve_task_session(p_session_token);
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.family),'[]'::jsonb)
    from public.institution_preposition_rules r);
end;
$$;

create function institution_private.save_prepositions(p_session_token text,p_rules jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; actor_role text; entry jsonb; previous public.institution_preposition_rules;
begin
  actor := public.resolve_task_session(p_session_token);
  select role into actor_role from public.app_users where id=actor;
  if actor_role is distinct from 'admin' then raise exception 'Modification réservée aux administrateurs.'; end if;
  if p_rules is null or jsonb_typeof(p_rules)<>'array' then raise exception 'Prépositions invalides.'; end if;
  if jsonb_array_length(p_rules) not between 1 and 16 then raise exception 'Prépositions invalides.'; end if;
  if (select count(distinct r->>'family') from jsonb_array_elements(p_rules) r)<>jsonb_array_length(p_rules) then raise exception 'Famille d’institution invalide.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(739214805);
  for entry in select * from jsonb_array_elements(p_rules) loop
    if jsonb_typeof(entry->'prefix') is distinct from 'string' or length(btrim(entry->>'prefix')) not between 1 and 50 then raise exception 'Préposition invalide.'; end if;
    if jsonb_typeof(entry->'version') is distinct from 'number' or entry->>'version' !~ '^[1-9][0-9]*$' then raise exception 'Version invalide.'; end if;
    select * into previous from public.institution_preposition_rules where family=entry->>'family' for update;
    if previous.family is null then raise exception 'Famille d’institution invalide.'; end if;
    if previous.version is distinct from (entry->>'version')::integer then raise exception 'Ces prépositions ont changé. Rechargez la liste.'; end if;
    update public.institution_preposition_rules set prefix=btrim(entry->>'prefix'),version=version+1 where family=previous.family;
  end loop;
  return institution_private.read_prepositions(p_session_token);
end;
$$;

create function public.read_institution_prepositions(p_session_token text)
returns jsonb language sql security invoker set search_path = '' as $$
  select institution_private.read_prepositions(p_session_token);
$$;
create function public.save_institution_prepositions(p_session_token text,p_rules jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select institution_private.save_prepositions(p_session_token,p_rules);
$$;
revoke all on function institution_private.read_prepositions(text),institution_private.save_prepositions(text,jsonb),public.read_institution_prepositions(text),public.save_institution_prepositions(text,jsonb) from public,anon,authenticated;
grant execute on function institution_private.read_prepositions(text),institution_private.save_prepositions(text,jsonb),public.read_institution_prepositions(text),public.save_institution_prepositions(text,jsonb) to anon,authenticated;
