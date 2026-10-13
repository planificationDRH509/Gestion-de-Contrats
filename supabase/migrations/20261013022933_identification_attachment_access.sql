-- Documents already reference identification(nif); keep existing files intact.
create function attachment_private.manage_identification(p_session_token text,p_person_id text,p_action text,p_document jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.identification;
  actor public.app_users;
  d attachment_private.documents;
  document_id uuid;
  file_bytes bytea;
begin
  -- Resolve the workspace from the identification; no contract or period is required.
  perform public.resolve_task_session(p_session_token);
  select * into c from public.identification where nif=p_person_id and deleted_at is null;
  if c.nif is null then raise exception 'Identification introuvable.'; end if;
  actor := list_private.authorize(p_session_token,c.workspace_id);
  if p_action in ('add','delete') and actor.role not in ('admin','agent','controller') then
    raise exception 'Vous n’avez pas le droit de modifier les pièces jointes.';
  end if;
  if p_action in ('add','get','delete') then
    document_id := (p_document->>'id')::uuid;
    if document_id is null then raise exception 'Identifiant requis.'; end if;
  end if;
  if p_action='add' then
    -- Limit the encoded body before decoding it.
    if length(p_document->>'content') > 13981016 then raise exception 'Fichier trop volumineux (10 Mo maximum).'; end if;
    if p_document->>'kind'='file' then file_bytes := decode(p_document->>'content','base64'); end if;
    insert into attachment_private.documents(id,workspace_id,person_id,name,kind,location,content,created_by)
    values(document_id,c.workspace_id,c.nif,btrim(p_document->>'name'),p_document->>'kind',
      case when p_document->>'kind'='file' then null else btrim(p_document->>'location') end,file_bytes,actor.id)
    on conflict(id) do nothing;
    -- Idempotent retries may only refer to the exact same document.
    select * into d from attachment_private.documents where id=document_id;
    if d.workspace_id <> c.workspace_id or d.person_id <> c.nif or d.created_by <> actor.id
      or d.name is distinct from btrim(p_document->>'name') or d.kind is distinct from p_document->>'kind'
      or d.content is distinct from file_bytes
      or d.location is distinct from (case when p_document->>'kind'='file' then null else btrim(p_document->>'location') end)
    then raise exception 'Identifiant de pièce jointe déjà utilisé.'; end if;
  elsif p_action in ('get','delete') then
    select * into d from attachment_private.documents
      where id=document_id and workspace_id=c.workspace_id and person_id=c.nif;
    if d.id is null then raise exception 'Pièce jointe introuvable.'; end if;
    if p_action='get' then
      return jsonb_build_object('name',d.name,'content',encode(d.content,'base64'));
    end if;
    delete from attachment_private.documents where id=d.id;
  elsif p_action is distinct from 'list' then
    raise exception 'Action invalide.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,
    'location',location,'size',octet_length(content),'createdAt',created_at) order by created_at desc,id)
    from attachment_private.documents where workspace_id=c.workspace_id and person_id=c.nif),'[]'::jsonb);
end;
$$;
revoke all on function attachment_private.manage_identification(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function attachment_private.manage_identification(text,text,text,jsonb) to anon, authenticated;
create function public.manage_identification_attachments(p_session_token text,p_person_id text,p_action text,p_document jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select attachment_private.manage_identification(p_session_token,p_person_id,p_action,p_document);
$$;
revoke all on function public.manage_identification_attachments(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.manage_identification_attachments(text,text,text,jsonb) to anon, authenticated;

-- Keep older clients compatible while sharing the same identification-owned documents.
create or replace function attachment_private.manage(p_session_token text,p_contract_id text,p_action text,p_document jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.contrat;
begin
  perform public.resolve_task_session(p_session_token);
  select * into c from public.contrat where id_contrat=p_contract_id and deleted_at is null;
  if c.id_contrat is null or c.nif is null then raise exception 'Contrat introuvable ou personne non renseignée.'; end if;
  perform list_private.authorize(p_session_token,c.workspace_id);
  return attachment_private.manage_identification(p_session_token,c.nif,p_action,p_document);
end;
$$;
