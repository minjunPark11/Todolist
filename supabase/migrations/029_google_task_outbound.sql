-- Dormant infrastructure: no account activation and no Google calls in SQL.
begin;
create table public.google_task_outbound_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  generation uuid not null,
  calendar_id text not null,
  event_id text not null,
  task_id text not null,
  request jsonb not null,
  desired jsonb not null,
  remote jsonb not null,
  timezone text not null,
  state text not null check(state in ('reserved','running','uncertain','completed','aborted')),
  dispatch_id uuid,
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,operation_id)
);
create unique index google_task_one_pending_write on public.google_task_outbound_operations(user_id)
  where state in ('reserved','running','uncertain');
alter table public.google_task_outbound_operations enable row level security;
create policy own_read on public.google_task_outbound_operations for select to authenticated using(user_id=auth.uid());
revoke all on public.google_task_outbound_operations from public,anon,authenticated,service_role;
grant select on public.google_task_outbound_operations to authenticated;

-- Code exchange/revocation can affect the same Google account across app users.
alter function public.begin_google_oauth_operation(uuid,uuid,text) rename to begin_google_oauth_operation_outbound_core;
revoke all on function public.begin_google_oauth_operation_outbound_core(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.begin_google_oauth_operation(p_operation_id uuid,p_user_id uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(270027);
  if exists(select 1 from public.google_task_outbound_operations where state in ('reserved','running','uncertain')) then
    return jsonb_build_object('acquired',false,'uncertain',exists(select 1 from public.google_task_outbound_operations where state='uncertain'));
  end if;
  return public.begin_google_oauth_operation_outbound_core(p_operation_id,p_user_id,p_kind);
end $$;
revoke all on function public.begin_google_oauth_operation(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.begin_google_oauth_operation(uuid,uuid,text) to service_role;

-- Same canonical six fields as the domain; no metadata is ever selected as shared content.
create function public.google_task_shared_fields(v jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('title',case when btrim(coalesce(v->>'title',''),
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')=''
    then '(제목 없음)' else v->>'title' end,
    'description',replace(replace(coalesce(v->>'description',''),E'\r\n',E'\n'),E'\r',E'\n'),
    'startDate',case when coalesce(v->>'startDate','')=coalesce(v->>'dueDate','') then '' else coalesce(v->>'startDate','') end,
    'dueDate',coalesce(v->>'dueDate',''),'startTime',coalesce(v->>'startTime',''),'endTime',coalesce(v->>'endTime',''));
$$;

-- A pending remote request outlives a lease. Scope changes cannot orphan it.
create function public.guard_google_pending_scope() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.user_id::text,21));
  if exists(select 1 from auth.users where id=old.user_id) and
    exists(select 1 from public.google_task_outbound_operations where user_id=old.user_id and state in ('reserved','running','uncertain')) then
    if tg_op='DELETE' then raise exception 'OUTBOUND_PENDING' using errcode='55000'; end if;
    if (new.connection_generation,new.calendar_id,new.google_subject,new.sync_timezone) is distinct from
      (old.connection_generation,old.calendar_id,old.google_subject,old.sync_timezone) then
      raise exception 'OUTBOUND_PENDING' using errcode='55000';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_google_pending_scope before update or delete on public.google_calendar_connections
  for each row execute function public.guard_google_pending_scope();

alter function public.commit_google_task_inbound(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) rename to commit_google_task_inbound_review_core;
revoke all on function public.commit_google_task_inbound_review_core(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.commit_google_task_inbound(p_generation uuid,p_calendar_id text,p_sync_revision bigint,p_owner uuid,
  p_fence bigint,p_pass_id uuid,p_next_sync_token text,p_entries jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
  u:=public.google_task_actor();
  if exists(select 1 from public.google_task_outbound_operations where user_id=u and state in ('reserved','running','uncertain'))
    and not exists(select 1 from public.google_task_inbound_passes where user_id=u and generation=p_generation and pass_id=p_pass_id) then
    raise exception 'OUTBOUND_PENDING' using errcode='55000';
  end if;
  return public.commit_google_task_inbound_review_core(p_generation,p_calendar_id,p_sync_revision,p_owner,p_fence,p_pass_id,p_next_sync_token,p_entries);
end $$;

-- request: generation/calendarId/syncRevision/owner/fence/eventId/taskId/taskRevision/
-- recordRevision/source/local/remote/choice. All user-visible selection data is compared.
create function public.reserve_google_task_outbound(p_operation_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; c public.google_calendar_connections%rowtype; t public.tasks%rowtype;
  m public.google_task_mappings%rowtype; r public.google_task_inbound_records%rowtype;
  op public.google_task_outbound_operations%rowtype; local_fields jsonb; remote_fields jsonb; desired_fields jsonb;
  choice text; answer jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(270027);
  u:=public.google_task_actor();
  if p_operation_id is null or jsonb_typeof(p_request) is distinct from 'object' then
    raise exception 'INVALID_OUTBOUND_REQUEST' using errcode='22023'; end if;
  select * into op from public.google_task_outbound_operations where user_id=u and operation_id=p_operation_id;
  if found then
    if op.request is distinct from p_request then raise exception 'OPERATION_ID_REUSED' using errcode='22023'; end if;
    return jsonb_build_object('operationId',p_operation_id,'state',op.state,'result',op.result);
  end if;
  if exists(select 1 from public.google_oauth_operations where state<>'completed') then
    raise exception 'OAUTH_PENDING' using errcode='55000'; end if;
  if exists(select 1 from public.google_task_outbound_operations where user_id=u and state in ('reserved','running','uncertain')) then
    raise exception 'OUTBOUND_PENDING' using errcode='55000'; end if;
  select * into c from public.google_calendar_connections where user_id=u for update;
  if c.connection_generation::text is distinct from p_request->>'generation' or c.calendar_id is distinct from p_request->>'calendarId'
    or c.sync_revision is distinct from (p_request->>'syncRevision')::bigint
    or c.lease_owner is null or c.lease_owner::text is distinct from p_request->>'owner'
    or c.lease_fence is distinct from (p_request->>'fence')::bigint or coalesce(c.lease_until,'-infinity')<=clock_timestamp()
    or c.google_subject is null or c.calendar_verified_at is null or c.sync_timezone is null then
    raise exception 'SYNC_PRECONDITION_FAILED' using errcode='40001'; end if;
  select * into m from public.google_task_mappings where user_id=u and generation=c.connection_generation
    and calendar_id=c.calendar_id and event_id=p_request->>'eventId' for update;
  select * into t from public.tasks where user_id=u and id=m.task_id for update;
  select * into r from public.google_task_inbound_records where user_id=u and generation=c.connection_generation
    and calendar_id=c.calendar_id and event_id=m.event_id for update;
  if m.state is distinct from 'active' or m.task_id is distinct from p_request->>'taskId' or t.id is null
    or t.revision is distinct from (p_request->>'taskRevision')::bigint or coalesce(t.data->>'deletedAt','')<>''
    or r.revision is null or r.revision is distinct from (p_request->>'recordRevision')::bigint
    or r.source is distinct from p_request->'source' then raise exception 'STALE_SELECTION' using errcode='40001'; end if;
  if r.source->>'id' is distinct from m.event_id or coalesce(r.source->>'etag','') in ('','*')
    or jsonb_typeof(r.source->'etag') is distinct from 'string'
    or coalesce(r.source->>'status','confirmed') not in ('confirmed','tentative')
    or r.source ?| array['recurringEventId','originalStartTime']
    or (r.source ? 'recurrence' and jsonb_typeof(r.source->'recurrence')<>'array') then
    raise exception 'ORIGINAL_EVENT_REQUIRED' using errcode='22023'; end if;
  choice:=p_request->>'choice'; local_fields:=public.google_task_shared_fields(t.data);
  if choice='automatic' then
    if r.decision->>'kind' is distinct from 'keep-local' or not public.valid_google_task_fields(m.base) then
      raise exception 'CONFLICT_RESOLUTION_REQUIRED' using errcode='40001'; end if;
    remote_fields:=public.google_task_shared_fields(m.base);
  elsif choice in ('app','google') then
    if r.decision->>'kind' is distinct from 'conflict' or not public.valid_google_task_fields(r.decision->'remote')
      or public.google_task_shared_fields(r.decision->'local') is distinct from local_fields then
      raise exception 'STALE_CONFLICT' using errcode='40001'; end if;
    remote_fields:=public.google_task_shared_fields(r.decision->'remote');
  else raise exception 'INVALID_CHOICE' using errcode='22023'; end if;
  if p_request->'local' is distinct from local_fields or p_request->'remote' is distinct from remote_fields
    or local_fields=remote_fields then raise exception 'STALE_SELECTION' using errcode='40001'; end if;
  desired_fields:=case when choice='google' then remote_fields else local_fields end;
  if choice='google' then
    update public.tasks set data=data||desired_fields||jsonb_build_object('updatedAt',clock_timestamp())
      where user_id=u and id=t.id returning * into t;
    update public.google_task_mappings set base=desired_fields,etag=r.source->>'etag',source=r.source
      where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=m.event_id;
    update public.google_task_inbound_records set decision=jsonb_build_object('kind','acknowledge','base',desired_fields),
      revision=revision+1,updated_at=clock_timestamp()
      where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=m.event_id;
    update public.google_calendar_connections set sync_revision=sync_revision+1 where user_id=u returning * into c;
    answer:=jsonb_build_object('task',jsonb_build_object('id',t.id,'data',t.data,'revision',t.revision),'syncRevision',c.sync_revision);
  end if;
  insert into public.google_task_outbound_operations(user_id,operation_id,generation,calendar_id,event_id,task_id,request,desired,remote,timezone,state,result)
    values(u,p_operation_id,c.connection_generation,c.calendar_id,m.event_id,m.task_id,p_request,desired_fields,remote_fields,c.sync_timezone,
      case when choice='google' then 'completed' else 'reserved' end,answer);
  return jsonb_build_object('operationId',p_operation_id,'state',case when choice='google' then 'completed' else 'reserved' end,'result',answer);
end $$;

-- A user may cancel a reservation only before the server claims dispatch.
create function public.cancel_google_task_outbound(p_operation_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
  u:=public.google_task_actor();
  update public.google_task_outbound_operations set state='aborted',result='{"reason":"cancelled-before-dispatch"}'
    where user_id=u and operation_id=p_operation_id and state='reserved';
  return found;
end $$;

-- Only a server with its own Google credentials can dispatch/settle. Replaying begin never resends.
create function public.read_google_task_outbound(p_user_id uuid,p_operation_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('state',state,'generation',generation,'calendarId',calendar_id,'eventId',event_id,
    'fields',desired,'timezone',timezone,'dispatchId',dispatch_id,'etag',request->'source'->>'etag')
    from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id;
$$;

create function public.begin_google_task_outbound(p_user_id uuid,p_operation_id uuid,p_dispatch_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op public.google_task_outbound_operations%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into op from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id for update;
  if op.state is distinct from 'reserved' or p_dispatch_id is null then return jsonb_build_object('send',false,'state',op.state); end if;
  if not exists(select 1 from public.google_calendar_connections c join public.google_task_sync_accounts a on a.user_id=c.user_id
      where c.user_id=p_user_id and a.enabled and c.connection_generation=op.generation and c.calendar_id=op.calendar_id
      and c.sync_timezone=op.timezone and c.google_subject is not null and c.calendar_verified_at is not null)
    or not exists(select 1 from public.tasks t join public.google_task_mappings m on m.user_id=t.user_id and m.task_id=t.id
      where t.user_id=p_user_id and t.id=op.task_id and t.revision=(op.request->>'taskRevision')::bigint
      and coalesce(t.data->>'deletedAt','')='' and m.generation=op.generation and m.calendar_id=op.calendar_id and m.event_id=op.event_id and m.state='active') then
    update public.google_task_outbound_operations set state='aborted',result='{"reason":"stale-before-dispatch"}' where user_id=p_user_id and operation_id=p_operation_id;
    return jsonb_build_object('send',false,'state','aborted');
  end if;
  update public.google_task_outbound_operations set state='running',dispatch_id=p_dispatch_id where user_id=p_user_id and operation_id=p_operation_id;
  return jsonb_build_object('send',true,'generation',op.generation,'calendarId',op.calendar_id,'eventId',op.event_id,'fields',op.desired,
    'remote',op.remote,'source',op.request->'source','timezone',op.timezone);
end $$;

create function public.finish_google_task_outbound(p_user_id uuid,p_operation_id uuid,p_dispatch_id uuid,
  p_outcome text,p_source jsonb,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op public.google_task_outbound_operations%rowtype; answer jsonb; rev bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into op from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id for update;
  if op.dispatch_id is null or op.dispatch_id is distinct from p_dispatch_id then raise exception 'DISPATCH_CHANGED' using errcode='40001'; end if;
  answer:=jsonb_build_object('outcome',p_outcome,'source',p_source,'fields',p_fields);
  if op.state in ('completed','aborted') then
    if op.result is distinct from answer then raise exception 'RESULT_CHANGED' using errcode='40001'; end if;
    return jsonb_build_object('finished',true,'state',op.state);
  end if;
  if p_outcome='uncertain' then
    update public.google_task_outbound_operations set state='uncertain' where user_id=p_user_id and operation_id=p_operation_id;
    return jsonb_build_object('finished',false,'state','uncertain');
  end if;
  -- An uncertain request cannot be dismissed by a later rejection; it needs positive reconciliation.
  if p_outcome='rejected' and op.state='running' then
    update public.google_task_outbound_operations set state='aborted',result=answer where user_id=p_user_id and operation_id=p_operation_id;
    return jsonb_build_object('finished',true,'state','aborted');
  end if;
  if p_outcome is distinct from 'applied' or not public.valid_google_task_fields(p_fields) or p_fields is distinct from op.desired
    or p_source->>'id' is distinct from op.event_id or jsonb_typeof(p_source->'etag') is distinct from 'string'
    or coalesce(p_source->>'etag','') in ('','*') or p_source->>'etag'=op.request->'source'->>'etag'
    or coalesce(p_source->>'status','confirmed') not in ('confirmed','tentative') or p_source ?| array['recurringEventId','originalStartTime']
    or (p_source ? 'recurrence' and jsonb_typeof(p_source->'recurrence')<>'array') then
    raise exception 'OUTBOUND_RECONCILIATION_REQUIRED' using errcode='40001'; end if;
  perform 1 from public.google_calendar_connections where user_id=p_user_id and connection_generation=op.generation and calendar_id=op.calendar_id for update;
  if not found then raise exception 'SYNC_CONNECTION_CHANGED' using errcode='40001'; end if;
  -- A local edit/trash/delete during the remote request remains intact, including mapping state.
  update public.google_task_mappings set base=op.desired,etag=p_source->>'etag',source=p_source
    where user_id=p_user_id and generation=op.generation and calendar_id=op.calendar_id and event_id=op.event_id and task_id=op.task_id;
  if not found then raise exception 'MAPPING_CHANGED' using errcode='40001'; end if;
  update public.google_task_inbound_records set source=p_source,decision=jsonb_build_object('kind','acknowledge','base',op.desired),
    revision=revision+1,updated_at=clock_timestamp()
    where user_id=p_user_id and generation=op.generation and calendar_id=op.calendar_id and event_id=op.event_id
      and revision=(op.request->>'recordRevision')::bigint;
  if not found then raise exception 'RECORD_CHANGED' using errcode='40001'; end if;
  update public.google_calendar_connections set sync_revision=sync_revision+1 where user_id=p_user_id returning sync_revision into rev;
  update public.google_task_outbound_operations set state='completed',result=answer where user_id=p_user_id and operation_id=p_operation_id;
  return jsonb_build_object('finished',true,'state','completed');
end $$;

revoke all on function public.google_task_shared_fields(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.guard_google_pending_scope() from public,anon,authenticated,service_role;
revoke all on function public.commit_google_task_inbound(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.reserve_google_task_outbound(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.cancel_google_task_outbound(uuid) from public,anon,authenticated,service_role;
revoke all on function public.begin_google_task_outbound(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.read_google_task_outbound(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.finish_google_task_outbound(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commit_google_task_inbound(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) to authenticated;
grant execute on function public.reserve_google_task_outbound(uuid,jsonb) to authenticated;
grant execute on function public.cancel_google_task_outbound(uuid) to authenticated;
grant execute on function public.begin_google_task_outbound(uuid,uuid,uuid) to service_role;
grant execute on function public.read_google_task_outbound(uuid,uuid) to service_role;
grant execute on function public.finish_google_task_outbound(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
commit;
