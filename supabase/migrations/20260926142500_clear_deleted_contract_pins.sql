-- A deleted contract must no longer occupy one of a user's ten pin slots.
create function list_private.clear_deleted_contract_pins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.pinned_contracts where contract_id = new.id_contrat;
  return new;
end;
$$;

revoke all on function list_private.clear_deleted_contract_pins() from public, anon, authenticated;

create trigger clear_deleted_contract_pins
after update of deleted_at on public.contrat
for each row
when (new.deleted_at is not null and old.deleted_at is null)
execute function list_private.clear_deleted_contract_pins();
