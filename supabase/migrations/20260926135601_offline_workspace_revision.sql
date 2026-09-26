-- A content revision detects edits, relation changes, and hard deletions without
-- transferring the complete workspace on every automatic refresh.
create function task_private.workspace_revision(p_session_token text, p_workspace_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare revision text;
begin
  perform list_private.authorize(p_session_token,p_workspace_id);
  select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(t) order by t.nif) from public.identification t where t.workspace_id=p_workspace_id),
    (select jsonb_agg(to_jsonb(t) order by t.id_contrat) from public.contrat t where t.workspace_id=p_workspace_id),
    (select jsonb_agg(to_jsonb(t) order by t.id) from public.dossiers t where t.workspace_id=p_workspace_id),
    (select jsonb_agg(to_jsonb(t) order by t.id) from public.tags t where t.workspace_id=p_workspace_id),
    (select jsonb_agg(to_jsonb(t) order by t.contract_id,t.tag_id) from public.contract_tags t
      join public.contrat c on c.id_contrat=t.contract_id where c.workspace_id=p_workspace_id),
    (select jsonb_agg(to_jsonb(t) order by t.id) from public.autocompletion t where t.workspace_id=p_workspace_id),
    (select jsonb_agg(to_jsonb(t) order by t.id) from public.contract_lists t where t.workspace_id=p_workspace_id),
    (select jsonb_agg(to_jsonb(t) order by t.contract_id) from public.contract_list_members t
      join public.contract_lists l on l.id=t.list_id where l.workspace_id=p_workspace_id)
  )::text) into revision;
  return revision;
end;
$$;
revoke all on function task_private.workspace_revision(text,text) from public;
grant execute on function task_private.workspace_revision(text,text) to anon, authenticated;
create function public.get_offline_workspace_revision(p_session_token text, p_workspace_id text)
returns text language sql security invoker set search_path = '' as $$
  select task_private.workspace_revision(p_session_token,p_workspace_id);
$$;
revoke all on function public.get_offline_workspace_revision(text,text) from public;
grant execute on function public.get_offline_workspace_revision(text,text) to anon, authenticated;
