begin;
do $$
declare admin_id uuid := gen_random_uuid(); reader_id uuid := gen_random_uuid();
  admin_token text := gen_random_uuid()::text; reader_token text := gen_random_uuid()::text;
begin
  insert into public.app_users(id,username,full_name,password,role,workspaces) values
    (admin_id,'institution-admin-'||admin_id,'Test','unused','admin',array['workspace_default']),
    (reader_id,'institution-reader-'||reader_id,'Test','unused','reader',array['workspace_default']);
  insert into public.app_task_sessions(user_id,token_hash,expires_at) values
    (admin_id,extensions.digest(admin_token,'sha256'),now()+interval '5 minutes'),
    (reader_id,extensions.digest(reader_token,'sha256'),now()+interval '5 minutes');
  perform set_config('test.institution_admin',admin_token,true);
  perform set_config('test.institution_reader',reader_token,true);
end $$;
set local role anon;
do $$
declare payload jsonb; result jsonb; rejected boolean;
begin
  payload := '{"id":"institution-test","label":"Établissement d’Essai","department":"Ouest","commune":"Delmas","institutionType":"Centre de Santé","source":null,"addressKeywords":[],"version":0}'::jsonb;
  rejected:=false;
  begin perform public.save_institution('bad','workspace_default',payload); exception when others then rejected:=sqlerrm='TASK_SESSION_INVALID'; end;
  if not rejected then raise exception 'Invalid session accepted'; end if;
  rejected:=false;
  begin perform public.save_institution(current_setting('test.institution_reader'),'workspace_default',payload); exception when others then rejected:=sqlerrm like 'Modification réservée%'; end;
  if not rejected then raise exception 'Reader write accepted'; end if;
  rejected:=false;
  begin perform public.save_institution(current_setting('test.institution_admin'),'workspace_avantages',payload); exception when others then rejected:=sqlerrm='Espace de travail inaccessible.'; end;
  if not rejected then raise exception 'Foreign workspace accepted'; end if;
  result:=public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload);
  if result->>'version'<>'1' or result->>'commune'<>'Delmas' then raise exception 'Insert failed'; end if;
  rejected:=false;
  begin perform public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload || '{"id":"institution-duplicate","label":"etablissement d essai"}'::jsonb); exception when others then rejected:=sqlerrm='Cette institution existe déjà.'; end;
  if not rejected then raise exception 'Duplicate accepted'; end if;
  rejected:=false;
  begin perform public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload); exception when others then rejected:=sqlerrm like 'Cette institution a changé%'; end;
  if not rejected then raise exception 'Stale update accepted'; end if;
  result:=public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload || '{"version":1,"institutionType":"HCR","commune":"Tabarre"}'::jsonb);
  if result->>'version'<>'2' or result->>'institutionType'<>'HCR' then raise exception 'Update failed'; end if;
  rejected:=false;
  begin perform public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload || '{"version":2,"institutionType":"Inconnu"}'::jsonb); exception when others then rejected:=sqlerrm='Type d’institution invalide.'; end;
  if not rejected then raise exception 'Invalid type accepted'; end if;
  rejected:=false;
  begin perform public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload || '{"version":2,"source":"javascript:alert(1)"}'::jsonb); exception when others then rejected:=sqlerrm='Adresse de source invalide.'; end;
  if not rejected then raise exception 'Unsafe source accepted'; end if;

  payload := '{"id":"institution-prefix-test","label":"Département Sanitaire de Test","institutionType":"Bureau Départemental","addressKeywords":[],"prefix":" au ","version":0}'::jsonb;
  result := public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload);
  assert result->>'prefix'='au','Insert did not persist and trim prefix';
  assert (select prefix='au' from public.autocompletion where id='institution-prefix-test'),'Stored insert prefix missing';
  result := public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload || '{"version":1,"prefix":"au sein du"}'::jsonb);
  assert result->>'prefix'='au sein du','Update did not persist prefix';
  result := public.save_institution(current_setting('test.institution_admin'),'workspace_default',(payload - 'prefix') || '{"version":2}'::jsonb);
  assert result->>'prefix'='au sein du','Older client erased prefix';
  result := public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload || '{"version":3,"prefix":null}'::jsonb);
  assert result->>'prefix' is null,'Automatic prefix reset failed';
  assert (select prefix is null from public.autocompletion where id='institution-prefix-test'),'Stored prefix not cleared';
  rejected:=false;
  begin perform public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload || jsonb_build_object('version',4,'prefix',repeat('x',51))); exception when others then rejected:=sqlerrm='Préposition invalide.'; end;
  assert rejected,'Oversized prefix accepted';
  rejected:=false;
  begin perform public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload || '{"version":4,"prefix":42}'::jsonb); exception when others then rejected:=sqlerrm='Préposition invalide.'; end;
  assert rejected,'Non-text prefix accepted';
end $$;
reset role;
insert into public.identification(nif,nom,prenom,sexe,adresse,workspace_id)
values('institution-test-nif','TEST','Test','Homme','Test','workspace_default');
insert into public.contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,workspace_id)
values('institution-test-contract','institution-test-nif',6,'2025-2026',100,'Test','Établissement d’Essai','workspace_default');
set local role anon;
do $$
declare result jsonb; payload jsonb; rejected boolean; list_id uuid; list_version integer;
begin
  payload:='{"id":"institution-test","label":"Établissement Renommé","department":"Ouest","commune":"Tabarre","institutionType":"HCR","addressKeywords":[],"version":2}'::jsonb;
  result:=public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload);
  assert (select lieu_affectation='Établissement Renommé' and salaire_en_chiffre=100 from public.contrat where id_contrat='institution-test-contract'),'Rename did not update contract';
  assert (select historique_saisie::jsonb->'entries'->-1->'changes' @> '[{"field":"assignment","newValue":"Établissement Renommé"}]'::jsonb from public.contrat where id_contrat='institution-test-contract'),'Rename audit missing';
  list_id:=public.mutate_contract_list(current_setting('test.institution_admin'),'workspace_default','{"action":"create","durationMonths":6,"contractIds":["institution-test-contract"]}'::jsonb);
  select (e->>'version')::integer into list_version from jsonb_array_elements(public.read_contract_lists(current_setting('test.institution_admin'),'workspace_default')) e where e->>'id'=list_id::text;
  perform public.mutate_contract_list(current_setting('test.institution_admin'),'workspace_default',jsonb_build_object('action','seal','listId',list_id,'version',list_version));
  rejected:=false;
  begin perform public.save_institution(current_setting('test.institution_admin'),'workspace_default',payload || '{"version":3,"label":"Autre nom"}'::jsonb); exception when others then rejected:=sqlerrm like '%scell%'; end;
  assert rejected,'Sealed rename accepted';
  assert (select label='Établissement Renommé' and version=3 from public.autocompletion where id='institution-test'),'Failed rename was not atomic';
  rejected:=false;
  begin insert into public.autocompletion(id,type,label,workspace_id) values('institution-direct-test','institution','Untrusted','workspace_default'); exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Anonymous institution insert accepted';
  result:=public.learn_institution(current_setting('test.institution_admin'),'workspace_default','{"label":"etablissement renomme","addressKeywords":[],"institutionType":"Centre de Santé"}'::jsonb);
  assert result->>'id'='institution-test' and result->>'institutionType'='HCR','Learning changed existing reference';
  rejected:=false;
  begin perform public.learn_institution(current_setting('test.institution_reader'),'workspace_default','{"label":"Institution apprise"}'::jsonb); exception when others then rejected:=sqlerrm='Droit insuffisant.'; end;
  assert rejected,'Reader learning accepted';
end $$;
rollback;
