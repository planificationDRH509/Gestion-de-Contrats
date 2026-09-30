begin;
do $$
declare admin_id uuid:=gen_random_uuid(); reader_id uuid:=gen_random_uuid(); admin_token text:=gen_random_uuid()::text; reader_token text:=gen_random_uuid()::text;
begin
  insert into public.app_users(id,username,full_name,password,role,workspaces) values
    (admin_id,'preposition-admin-'||admin_id,'Test','unused','admin',array['workspace_default']),
    (reader_id,'preposition-reader-'||reader_id,'Test','unused','reader',array['workspace_default']);
  insert into public.app_task_sessions(user_id,token_hash,expires_at) values
    (admin_id,extensions.digest(admin_token,'sha256'),now()+interval '5 minutes'),
    (reader_id,extensions.digest(reader_token,'sha256'),now()+interval '5 minutes');
  perform set_config('test.preposition_admin',admin_token,true);
  perform set_config('test.preposition_reader',reader_token,true);
end $$;
set local role anon;
do $$
declare rules jsonb; result jsonb; hospital jsonb; department jsonb; rejected boolean;
begin
  rejected:=false;
  begin perform public.read_institution_prepositions('invalid'); exception when others then rejected:=sqlerrm='TASK_SESSION_INVALID'; end;
  assert rejected,'Invalid session read accepted';
  rules:=public.read_institution_prepositions(current_setting('test.preposition_reader'));
  assert jsonb_array_length(rules)=16,'Reader cannot read common rules';
  select r into hospital from jsonb_array_elements(rules) r where r->>'family'='hospital';
  select r into department from jsonb_array_elements(rules) r where r->>'family'='department';
  rejected:=false;
  begin perform public.save_institution_prepositions(current_setting('test.preposition_reader'),jsonb_build_array(hospital)); exception when others then rejected:=sqlerrm='Modification réservée aux administrateurs.'; end;
  assert rejected,'Reader write accepted';
  result:=public.save_institution_prepositions(current_setting('test.preposition_admin'),jsonb_build_array(hospital||'{"prefix":" au sein de l’ "}'::jsonb,department||'{"prefix":"au sein du"}'::jsonb));
  assert exists(select 1 from jsonb_array_elements(result) r where r->>'family'='hospital' and r->>'prefix'='au sein de l’' and (r->>'version')::integer=(hospital->>'version')::integer+1),'Shared hospital save failed';
  assert exists(select 1 from jsonb_array_elements(result) r where r->>'family'='department' and r->>'prefix'='au sein du'),'Shared department save failed';
  assert (select r from jsonb_array_elements(result) r where r->>'family'='direction')=(select r from jsonb_array_elements(rules) r where r->>'family'='direction'),'Unrelated rule changed';
  rejected:=false;
  begin perform public.save_institution_prepositions(current_setting('test.preposition_admin'),jsonb_build_array(hospital)); exception when others then rejected:=sqlerrm like 'Ces prépositions ont changé%'; end;
  assert rejected,'Stale update accepted';
  select r into hospital from jsonb_array_elements(result) r where r->>'family'='hospital';
  rejected:=false;
  begin perform public.save_institution_prepositions(current_setting('test.preposition_admin'),jsonb_build_array(hospital||'{"prefix":"à"}'::jsonb,department)); exception when others then rejected:=sqlerrm like 'Ces prépositions ont changé%'; end;
  assert rejected,'Partial stale batch accepted';
  assert public.read_institution_prepositions(current_setting('test.preposition_reader'))=result,'Failed batch was not atomic';
  rejected:=false;
  begin perform public.save_institution_prepositions(current_setting('test.preposition_admin'),jsonb_build_array(hospital||'{"family":"unknown"}'::jsonb)); exception when others then rejected:=sqlerrm='Famille d’institution invalide.'; end;
  assert rejected,'Unknown family accepted';
  rejected:=false;
  begin perform public.save_institution_prepositions(current_setting('test.preposition_admin'),jsonb_build_array(hospital||'{"prefix":"  "}'::jsonb)); exception when others then rejected:=sqlerrm='Préposition invalide.'; end;
  assert rejected,'Empty prefix accepted';
  rejected:=false;
  begin perform public.save_institution_prepositions(current_setting('test.preposition_admin'),jsonb_build_array(hospital||jsonb_build_object('prefix',repeat('x',51)))); exception when others then rejected:=sqlerrm='Préposition invalide.'; end;
  assert rejected,'Oversized prefix accepted';
  rejected:=false;
  begin perform public.save_institution_prepositions(current_setting('test.preposition_admin'),jsonb_build_array(hospital,hospital)); exception when others then rejected:=sqlerrm='Famille d’institution invalide.'; end;
  assert rejected,'Duplicate family accepted';
  rejected:=false;
  begin update public.institution_preposition_rules set prefix='à' where family='department'; exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Direct anonymous table write accepted';
end $$;
rollback;
