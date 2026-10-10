begin;

create schema minister_private;
revoke all on schema minister_private from public, anon, authenticated;
grant usage on schema minister_private to anon, authenticated;

create table public.ministres (
  id text primary key check (length(id) between 1 and 150),
  nom_complet text not null check (length(btrim(nom_complet)) between 1 and 200),
  sexe text not null check (sexe in ('Homme','Femme')),
  nif text not null unique check (nif ~ '^[0-9]{3}-[0-9]{3}-[0-9]{3}-[0-9]$'),
  ninu text not null unique check (ninu ~ '^[0-9]{10}$'),
  created_at timestamptz not null default now()
);
-- Stable reference shared with legacy offline contracts, not a generated database ID.
insert into public.ministres(id,nom_complet,sexe,nif,ninu)
values ('bertrand-sinal','Bertrand SINAL','Homme','003-888-685-8','1009241060');
create table public.ministre_actuel (
  singleton boolean primary key default true check (singleton),
  ministre_id text not null references public.ministres(id) on delete restrict
);
insert into public.ministre_actuel(ministre_id) select id from public.ministres where id='bertrand-sinal';
create index ministre_actuel_ministre_idx on public.ministre_actuel(ministre_id);
alter table public.ministres enable row level security;
alter table public.ministre_actuel enable row level security;
revoke all on public.ministres, public.ministre_actuel from public, anon, authenticated;

-- A constant ADD COLUMN default backfills without changing timestamps, audit or sealed lists.
alter table public.contrat add column ministre_id text not null default 'bertrand-sinal'
  references public.ministres(id) on delete restrict;
alter table public.contrat alter column ministre_id drop default;
create index contrat_ministre_idx on public.contrat(ministre_id);

create function minister_private.bind_contract() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.ministre_id is distinct from old.ministre_id then
      raise exception 'Le ministre d’un contrat existant ne peut pas être remplacé.';
    end if;
  elsif new.ministre_id is null then
    select ministre_id into new.ministre_id from public.ministre_actuel where singleton;
  end if;
  return new;
end;
$$;
revoke all on function minister_private.bind_contract() from public, anon, authenticated;
create trigger bind_contract_minister before insert or update of ministre_id on public.contrat
  for each row execute function minister_private.bind_contract();

create function minister_private.read_registry(p_session_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.resolve_task_session(p_session_token);
  return jsonb_build_object(
    'currentMinisterId', (select ministre_id from public.ministre_actuel where singleton),
    'ministers', (select coalesce(jsonb_agg(to_jsonb(m) order by m."fullName"),'[]'::jsonb) from (
      select id,nom_complet as "fullName",sexe as gender,nif,ninu from public.ministres
    ) m)
  );
end;
$$;
create function minister_private.manage(p_session_token text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid; entry jsonb; entry_nif text; entry_name text; existing public.ministres;
begin
  actor := public.resolve_task_session(p_session_token);
  if not exists(select 1 from public.app_users where id=actor and role='admin') then
    raise exception 'Modification réservée aux administrateurs.';
  end if;
  -- Serialize current-minister changes and idempotent additions.
  perform 1 from public.ministre_actuel where singleton for update;
  if p_input->>'action' = 'add' then
    entry := p_input->'minister';
    entry_nif := regexp_replace(entry->>'nif', '[[:space:]-]', '', 'g');
    entry_name := btrim(regexp_replace(entry->>'fullName','[[:space:]]+',' ','g'));
    if entry_nif is null or entry_nif !~ '^[0-9]{10}$' then raise exception 'Le NIF doit contenir 10 chiffres.'; end if;
    entry_nif := substr(entry_nif,1,3)||'-'||substr(entry_nif,4,3)||'-'||substr(entry_nif,7,3)||'-'||substr(entry_nif,10,1);
    select * into existing from public.ministres where id=entry->>'id';
    if found then
      if existing.nom_complet is distinct from entry_name or existing.sexe is distinct from entry->>'gender'
        or existing.nif is distinct from entry_nif or existing.ninu is distinct from btrim(entry->>'ninu') then
        raise exception 'Ce ministre existe déjà avec des informations différentes.';
      end if;
    else
      if exists(select 1 from public.ministres where nif=entry_nif or ninu=btrim(entry->>'ninu')) then
        raise exception 'Un ministre possède déjà ce NIF ou ce NINU.';
      end if;
      insert into public.ministres(id,nom_complet,sexe,nif,ninu)
      values(entry->>'id',entry_name,entry->>'gender',entry_nif,btrim(entry->>'ninu'));
    end if;
  elsif p_input->>'action' = 'select' then
    if not exists(select 1 from public.ministres where id=p_input->>'ministerId') then raise exception 'Ministre introuvable.'; end if;
    update public.ministre_actuel set ministre_id=p_input->>'ministerId' where singleton;
  else raise exception 'Action invalide.';
  end if;
  return minister_private.read_registry(p_session_token);
end;
$$;
revoke all on function minister_private.read_registry(text), minister_private.manage(text,jsonb) from public, anon, authenticated;
grant execute on function minister_private.read_registry(text), minister_private.manage(text,jsonb) to anon, authenticated;
create function public.read_ministers(p_session_token text) returns jsonb
language sql security invoker set search_path = '' as $$ select minister_private.read_registry(p_session_token); $$;
create function public.manage_ministers(p_session_token text, p_input jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select minister_private.manage(p_session_token,p_input); $$;
revoke all on function public.read_ministers(text), public.manage_ministers(text,jsonb) from public, anon, authenticated;
grant execute on function public.read_ministers(text), public.manage_ministers(text,jsonb) to anon, authenticated;
commit;
