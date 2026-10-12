create or replace function list_private.persist_member_status() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.contrat set status='liste', updated_at=clock_timestamp()
      where id_contrat=new.contract_id and status is distinct from 'liste';
    return new;
  end if;
  -- guard_contract removes membership inside a BEFORE soft-delete trigger.
  -- guard_member_status already sets that pending row to saisie; updating the
  -- same row again here would abort the enclosing delete operation.
  if pg_trigger_depth() > 1 then return old; end if;
  update public.contrat set status='saisie', updated_at=clock_timestamp()
    where id_contrat=old.contract_id and status='liste';
  return old;
end;
$$;
revoke all on function list_private.persist_member_status() from public, anon, authenticated;
