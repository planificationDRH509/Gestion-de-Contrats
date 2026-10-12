-- Membership owns the persisted workflow state while a contract is in a list.
alter table public.contrat drop constraint if exists contrat_status_check;
alter table public.contrat add constraint contrat_status_check check
  (status in ('draft','final','saisie','liste','correction','impression_partiel','imprime','signe','transfere','classe'));

create function list_private.persist_member_status() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.contrat set status='liste', updated_at=clock_timestamp()
      where id_contrat=new.contract_id and status is distinct from 'liste';
    return new;
  end if;
  update public.contrat set status='saisie', updated_at=clock_timestamp()
    where id_contrat=old.contract_id and status='liste';
  return old;
end;
$$;
revoke all on function list_private.persist_member_status() from public, anon, authenticated;
create trigger persist_list_member_status after insert or delete on public.contract_list_members
  for each row execute function list_private.persist_member_status();

-- This private guard reads membership without granting direct access to the table.
create function list_private.guard_member_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare listed boolean;
begin
  select exists(select 1 from public.contract_list_members where contract_id=new.id_contrat) into listed;
  if new.deleted_at is not null then
    if new.status='liste' then new.status := 'saisie'; end if;
  elsif listed and new.status <> 'liste' then
    raise exception 'Retirez le contrat de sa liste avant de changer son état.';
  elsif not listed and new.status='liste' then
    raise exception 'Ajoutez le contrat à une liste pour utiliser l’état Listé.';
  end if;
  return new;
end;
$$;
revoke all on function list_private.guard_member_status() from public, anon, authenticated;
create trigger contract_list_status_guard before insert or update on public.contrat
  for each row execute function list_private.guard_member_status();

update public.contrat c set status='liste', updated_at=clock_timestamp()
  where c.deleted_at is null and c.status is distinct from 'liste'
    and exists(select 1 from public.contract_list_members m where m.contract_id=c.id_contrat);
