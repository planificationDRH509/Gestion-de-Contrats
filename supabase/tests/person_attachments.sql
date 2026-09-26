begin;
do $$
declare
  w text := 'attachments-test-'||gen_random_uuid();
  actor uuid := gen_random_uuid(); reader_id uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  token text := encode(extensions.gen_random_bytes(32),'hex');
  reader_token text := encode(extensions.gen_random_bytes(32),'hex');
  outsider_token text := encode(extensions.gen_random_bytes(32),'hex');
  document_id uuid := gen_random_uuid(); link_id uuid := gen_random_uuid(); path_id uuid := gen_random_uuid();
  items jsonb; failed boolean;
begin
  insert into public.workspaces(id,name,created_at,updated_at) values(w,'Attachment tests',now(),now());
  insert into public.app_users(id,username,password,full_name,role,workspaces) values
    (actor,w||'-agent','test-only','Agent','agent',array[w]),
    (reader_id,w||'-reader','test-only','Reader','reader',array[w]),
    (outsider,w||'-outsider','test-only','Outsider','admin',array['another-workspace']);
  insert into public.app_task_sessions(user_id,token_hash) values
    (actor,extensions.digest(token,'sha256')),
    (reader_id,extensions.digest(reader_token,'sha256')),
    (outsider,extensions.digest(outsider_token,'sha256'));
  insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id)
    values(w,'TEST','Attachment','Homme','Test',w),(w||'-other','TEST','Other','Homme','Test',w);
  insert into public.contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id) values
    (w||'-c1',w,6,'2025-2026',100,'Test','Test',w),
    (w||'-c2',w,6,'2026-2027',100,'Test','Test',w),
    (w||'-c3',w||'-other',6,'2025-2026',100,'Test','Test',w);
  set local role anon;
  failed := false;
  begin perform 1 from attachment_private.documents; exception when insufficient_privilege then failed := true; end;
  assert failed, 'Direct table access denied';
  items := public.manage_person_attachments(token,w||'-c1','add',jsonb_build_object('id',document_id,'name','test.pdf','kind','file','content','SGVsbG8='));
  assert jsonb_array_length(items)=1 and not (items->0 ? 'content'), 'Metadata excludes file contents';
  perform public.manage_person_attachments(token,w||'-c1','add',jsonb_build_object('id',document_id,'name','test.pdf','kind','file','content','SGVsbG8='));
  assert jsonb_array_length(public.manage_person_attachments(reader_token,w||'-c2','list'))=1, 'Readers see person files from another contract';
  assert public.manage_person_attachments(reader_token,w||'-c2','get',jsonb_build_object('id',document_id))->>'content'='SGVsbG8=', 'Reader downloads exact file bytes';
  assert jsonb_array_length(public.manage_person_attachments(token,w||'-c3','list'))=0, 'Other person has no files';
  failed := false;
  begin perform public.manage_person_attachments(reader_token,w||'-c1','delete',jsonb_build_object('id',document_id)); exception when others then failed := true; end;
  assert failed, 'Readers cannot delete';
  failed := false;
  begin perform public.manage_person_attachments(reader_token,w||'-c1','add',jsonb_build_object('id',gen_random_uuid(),'name','No','kind','path','location','/no')); exception when others then failed := true; end;
  assert failed, 'Readers cannot add';
  failed := false;
  begin perform public.manage_person_attachments(outsider_token,w||'-c1','list'); exception when others then failed := true; end;
  assert failed, 'Unauthorized workspace is denied';
  failed := false;
  begin perform public.manage_person_attachments('invalid',w||'-c1','list'); exception when others then failed := true; end;
  assert failed, 'Invalid session denied';
  failed := false;
  begin perform public.manage_person_attachments(token,w||'-c3','get',jsonb_build_object('id',document_id)); exception when others then failed := true; end;
  assert failed, 'Cannot download another person file';
  failed := false;
  begin perform public.manage_person_attachments(token,w||'-c1','add',jsonb_build_object('id',gen_random_uuid(),'name','Bad','kind','link','location','javascript:alert(1)')); exception when check_violation then failed := true; end;
  assert failed, 'Unsafe URL rejected';
  failed := false;
  begin perform public.manage_person_attachments(token,w||'-c1','add',jsonb_build_object('id',gen_random_uuid(),'name','Huge','kind','file','content',repeat('A',13981017))); exception when others then failed := true; end;
  assert failed, 'Large files rejected';
  failed := false;
  begin perform public.manage_person_attachments(token,w||'-c1','add',jsonb_build_object('id',gen_random_uuid(),'name','Missing','kind','path')); exception when check_violation then failed := true; end;
  assert failed, 'Missing paths rejected';
  perform public.manage_person_attachments(token,w||'-c1','add',jsonb_build_object('id',link_id,'name','Lien','kind','link','location','https://example.com/document.pdf'));
  perform public.manage_person_attachments(token,w||'-c1','add',jsonb_build_object('id',path_id,'name','Chemin','kind','path','location','s3://archive/document.pdf'));
  assert jsonb_array_length(public.manage_person_attachments(reader_token,w||'-c2','list'))=3, 'All source types persisted';
  perform public.manage_person_attachments(token,w||'-c1','delete',jsonb_build_object('id',document_id));
  assert jsonb_array_length(public.manage_person_attachments(reader_token,w||'-c2','list'))=2, 'Deletion shared across contracts';
  reset role;
end;
$$;
rollback;
