begin;

alter table public.ministres
  add column debut_mandat date,
  add column fin_mandat date,
  add constraint minister_mandate_interval check (
    (debut_mandat is null or debut_mandat between date '0001-01-01' and date '9999-12-31')
    and (fin_mandat is null or (debut_mandat is not null and fin_mandat >= debut_mandat and fin_mandat <= date '9999-12-31'))
  );
-- Initial mandate supplied by the administrator; never derive it from contract dates.
update public.ministres set debut_mandat = date '2020-01-01' where id = 'bertrand-sinal';

create or replace function minister_private.read_registry(p_session_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.resolve_task_session(p_session_token);
  return jsonb_build_object(
    'currentMinisterId', (select ministre_id from public.ministre_actuel where singleton),
    'ministers', (select coalesce(jsonb_agg(to_jsonb(m) order by m."fullName"),'[]'::jsonb) from (
      select id,nom_complet as "fullName",sexe as gender,nif,ninu,
        debut_mandat as "mandateStartDate",fin_mandat as "mandateEndDate" from public.ministres
    ) m)
  );
end;
$$;

create or replace function minister_private.manage(p_session_token text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; entry jsonb; entry_nif text; entry_name text; existing public.ministres;
  start_text text; end_text text; start_date date; end_date date;
begin
  actor := public.resolve_task_session(p_session_token);
  if not exists(select 1 from public.app_users where id=actor and role='admin') then
    raise exception 'Modification réservée aux administrateurs.';
  end if;
  -- Serialize selection, idempotent additions and mandate changes.
  perform 1 from public.ministre_actuel where singleton for update;
  if p_input->>'action' in ('add','mandate') then
    entry := case when p_input->>'action'='add' then p_input->'minister' else p_input end;
    start_text := nullif(btrim(entry->>'mandateStartDate'),'');
    end_text := nullif(btrim(entry->>'mandateEndDate'),'');
    if start_text is null or start_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Renseignez une date de début de mandat valide.';
    end if;
    if end_text is not null and end_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Renseignez une date de fin de mandat valide.';
    end if;
    begin
      start_date := start_text::date;
      end_date := end_text::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Renseignez des dates de mandat valides.';
    end;
    if end_date < start_date then raise exception 'La fin du mandat ne peut pas précéder son début.'; end if;
  end if;
  if p_input->>'action' = 'add' then
    entry_nif := regexp_replace(entry->>'nif', '[[:space:]-]', '', 'g');
    entry_name := btrim(regexp_replace(entry->>'fullName','[[:space:]]+',' ','g'));
    if entry_nif is null or entry_nif !~ '^[0-9]{10}$' then raise exception 'Le NIF doit contenir 10 chiffres.'; end if;
    entry_nif := substr(entry_nif,1,3)||'-'||substr(entry_nif,4,3)||'-'||substr(entry_nif,7,3)||'-'||substr(entry_nif,10,1);
    select * into existing from public.ministres where id=entry->>'id';
    if found then
      if existing.nom_complet is distinct from entry_name or existing.sexe is distinct from entry->>'gender'
        or existing.nif is distinct from entry_nif or existing.ninu is distinct from btrim(entry->>'ninu')
        or existing.debut_mandat is distinct from start_date or existing.fin_mandat is distinct from end_date then
        raise exception 'Ce ministre existe déjà avec des informations différentes.';
      end if;
    else
      if exists(select 1 from public.ministres where nif=entry_nif or ninu=btrim(entry->>'ninu')) then
        raise exception 'Un ministre possède déjà ce NIF ou ce NINU.';
      end if;
      insert into public.ministres(id,nom_complet,sexe,nif,ninu,debut_mandat,fin_mandat)
      values(entry->>'id',entry_name,entry->>'gender',entry_nif,btrim(entry->>'ninu'),start_date,end_date);
    end if;
  elsif p_input->>'action' = 'mandate' then
    select * into existing from public.ministres where id=p_input->>'ministerId' for update;
    if not found then raise exception 'Ministre introuvable.'; end if;
    if not (p_input ? 'expectedStartDate' and p_input ? 'expectedEndDate')
      or existing.debut_mandat::text is distinct from p_input->>'expectedStartDate'
      or existing.fin_mandat::text is distinct from p_input->>'expectedEndDate' then
      raise exception 'Le mandat a changé. Rechargez les ministres avant de réessayer.';
    end if;
    update public.ministres set debut_mandat=start_date,fin_mandat=end_date where id=existing.id;
  elsif p_input->>'action' = 'select' then
    if not exists(select 1 from public.ministres where id=p_input->>'ministerId') then raise exception 'Ministre introuvable.'; end if;
    update public.ministre_actuel set ministre_id=p_input->>'ministerId' where singleton;
  else raise exception 'Action invalide.';
  end if;
  return minister_private.read_registry(p_session_token);
end;
$$;
commit;
