begin;
do $$
declare
  actor uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  token text := encode(extensions.gen_random_bytes(32),'hex');
  other_token text := encode(extensions.gen_random_bytes(32),'hex');
  request text := gen_random_uuid()::text; result uuid; failed boolean;
  op jsonb := '{"type":"create","content":"Offline replay test","assigneeId":null,"status":"done"}';
begin
  insert into public.app_users(id,username,password,full_name,role) values
    (actor,'offline-test-'||actor,'test-only','Offline test','admin'),
    (outsider,'offline-test-'||outsider,'test-only','Offline other','reader');
  insert into public.app_task_sessions(user_id,token_hash) values
    (actor,extensions.digest(token,'sha256')),(outsider,extensions.digest(other_token,'sha256'));
  set local role anon;
  result := public.sync_private_task(token,request,op);
  assert public.sync_private_task(token,request,op)=result, 'lost ACK must return the same task';
  failed := false;
  begin perform public.sync_private_task(token,request,op||'{"content":"Changed"}');
    exception when others then failed:=true; assert sqlerrm='TASK_REQUEST_REUSED'; end;
  assert failed, 'reused ID with different contents rejected';
  failed := false;
  begin perform public.sync_private_task('invalid',request,op);
    exception when others then failed:=true; assert sqlerrm='TASK_SESSION_INVALID'; end;
  assert failed, 'invalid session rejected';
  failed := false;
  begin perform public.sync_private_task(other_token,gen_random_uuid()::text,jsonb_build_object('type','status','taskId',result,'status','todo'));
    exception when others then failed:=true; assert sqlerrm='TASK_NOT_FOUND'; end;
  assert failed, 'other account cannot modify task';
  reset role;
  assert (select count(*) from public.private_tasks where created_by=actor)=1, 'no duplicates';
  assert (select status from public.private_tasks where id=result)='done', 'creation and status atomic';
  set local role anon;
  perform public.sync_private_task(token,'delete-'||request,jsonb_build_object('type','delete','taskId',result));
  perform public.sync_private_task(token,'delete-'||request,jsonb_build_object('type','delete','taskId',result));
  reset role;
  assert not exists(select 1 from public.private_tasks where id=result), 'delete can be retried';
end;
$$;
rollback;
