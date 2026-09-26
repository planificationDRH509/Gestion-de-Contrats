-- Private binary storage: documents are fetched separately from the metadata list.
-- App sessions are opaque tokens, not Supabase Auth JWTs.
create schema attachment_private;
revoke all on schema attachment_private from public, anon, authenticated;
grant usage on schema attachment_private to anon, authenticated;
create table attachment_private.documents (
  id uuid primary key,
  workspace_id text not null references public.workspaces(id),
  person_id text not null references public.identification(nif) on update cascade,
  name text not null check (length(btrim(name)) between 1 and 255),
  kind text not null check (kind in ('file','link','path')),
  location text,
  content bytea,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.app_users(id),
  check (
    (kind='file' and content is not null and octet_length(content) between 1 and 10485760 and location is null)
    or (kind in ('link','path') and content is null and length(btrim(location)) between 1 and 4096
      and (kind='path' or location ~* '^https?://[^[:space:]/]+'))
  )
);
create index documents_person_idx on attachment_private.documents(workspace_id,person_id,created_at);
create index documents_created_by_idx on attachment_private.documents(created_by);
alter table attachment_private.documents enable row level security;
revoke all on attachment_private.documents from public, anon, authenticated;

create function attachment_private.manage(p_session_token text,p_contract_id text,p_action text,p_document jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.contrat;
  actor public.app_users;
  d attachment_private.documents;
  document_id uuid;
  file_bytes bytea;
begin
  -- Authorization is based on the contract's actual workspace, never a client-supplied one.
  perform public.resolve_task_session(p_session_token);
  select * into c from public.contrat where id_contrat=p_contract_id and deleted_at is null;
  if c.id_contrat is null or c.nif is null then raise exception 'Contrat introuvable ou personne non renseignée.'; end if;
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
revoke all on function attachment_private.manage(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function attachment_private.manage(text,text,text,jsonb) to anon, authenticated;
create function public.manage_person_attachments(p_session_token text,p_contract_id text,p_action text,p_document jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select attachment_private.manage(p_session_token,p_contract_id,p_action,p_document);
$$;
revoke all on function public.manage_person_attachments(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.manage_person_attachments(text,text,text,jsonb) to anon, authenticated;
