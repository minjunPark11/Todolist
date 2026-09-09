-- Explicit repeat-rule writes and selected copying into a different connection. No account activation.
begin;
alter table public.google_task_outbound_operations drop constraint google_task_outbound_operations_kind_check;
alter table public.google_task_outbound_operations add constraint google_task_outbound_operations_kind_check check(kind in ('patch','create','delete','recurrence'));
alter table public.google_task_outbound_operations add column repeat_task jsonb;
create function public.google_task_repeat_fields(v jsonb) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('repeatType',v->'repeatType','repeatInterval',v->'repeatInterval','repeatDays',v->'repeatDays','repeatEndDate',v->'repeatEndDate'));
$$;
revoke all on function public.google_task_repeat_fields(jsonb) from public,anon,authenticated,service_role;
create or replace function public.reserve_google_task_event(p_operation_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;c public.google_calendar_connections%rowtype;t public.tasks%rowtype;m public.google_task_mappings%rowtype;
  r public.google_task_inbound_records%rowtype;op public.google_task_outbound_operations%rowtype;mode text;eid text;f jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(270027);u:=public.google_task_actor();
  if p_operation_id is null or jsonb_typeof(p_request) is distinct from 'object' then raise exception 'INVALID_REQUEST';end if;
  select * into op from public.google_task_outbound_operations where user_id=u and operation_id=p_operation_id;
  if found then
    if op.request is distinct from p_request then raise exception 'OPERATION_ID_REUSED';end if;
    return jsonb_build_object('operationId',p_operation_id,'state',op.state);
  end if;
  if exists(select 1 from public.google_oauth_operations where state<>'completed') or
    exists(select 1 from public.google_task_outbound_operations where user_id=u and state in ('reserved','running','uncertain')) then raise exception 'SYNC_BUSY';end if;
  select * into c from public.google_calendar_connections where user_id=u for update;
  if c.connection_generation::text is distinct from p_request->>'generation' or c.calendar_id is distinct from p_request->>'calendarId'
    or c.sync_revision is distinct from (p_request->>'syncRevision')::bigint or c.lease_owner is null or c.lease_owner::text is distinct from p_request->>'owner'
    or c.lease_fence is distinct from (p_request->>'fence')::bigint or coalesce(c.lease_until,'-infinity')<=clock_timestamp()
    or c.google_subject is null or c.calendar_verified_at is null then raise exception 'STALE_SELECTION' using errcode='40001';end if;
  mode:=p_request->>'kind';select * into t from public.tasks where user_id=u and id=p_request->>'taskId' for update;
  if coalesce(t.revision,0) is distinct from (p_request->>'taskRevision')::bigint then raise exception 'STALE_SELECTION' using errcode='40001';end if;
  if mode='create' then
    if t.id is null or coalesce(t.data->>'deletedAt','')<>'' or coalesce(t.data->>'dueDate','')=''
      or coalesce(t.data->>'status','open')='abandoned' then raise exception 'INELIGIBLE_TASK';end if;
    if p_request->>'choice'='transfer' and not exists(select 1 from public.google_task_mappings where user_id=u and task_id=t.id and generation<>c.connection_generation) then raise exception 'HISTORY_REQUIRED';end if;
    -- Old-account tasks never flood a newly linked calendar. Unverified legacy IDs need review.
    if (p_request->>'choice' is distinct from 'transfer' and ((exists(select 1 from public.google_task_mappings where user_id=u and task_id=t.id and generation<>c.connection_generation)
      and not exists(select 1 from public.google_task_mappings where user_id=u and task_id=t.id and generation=c.connection_generation))
      or (coalesce(t.data->>'googleEventId','')<>'' and not exists(select 1 from public.google_task_mappings where user_id=u and task_id=t.id and generation=c.connection_generation))
      ))
      or exists(select 1 from public.google_task_mappings where user_id=u and task_id=t.id and generation=c.connection_generation and (not remote_deleted or state='active'))
      then raise exception 'MAPPING_REVIEW_REQUIRED';end if;
    update public.google_task_mappings set state='deleted' where user_id=u and task_id=t.id and generation=c.connection_generation and remote_deleted;
    eid:='ff'||replace(gen_random_uuid()::text,'-','');f:=public.google_task_shared_fields(t.data);
  elsif mode='delete' then
    select * into m from public.google_task_mappings where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=p_request->>'eventId' for update;
    select * into r from public.google_task_inbound_records where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=m.event_id;
    if m.task_id is distinct from p_request->>'taskId' or m.state not in ('trashed','deleted') or m.remote_deleted
      or (t.id is not null and coalesce(t.data->>'deletedAt','')='') or r.source is distinct from p_request->'source'
      or r.revision is distinct from (p_request->>'recordRevision')::bigint or r.decision->>'reason'='excluded'
      then raise exception 'STALE_SELECTION' using errcode='40001';end if;
    if r.source->>'id' is distinct from m.event_id or coalesce(r.source->>'etag','') in ('','*')
      or r.source ?| array['recurringEventId','originalStartTime'] then raise exception 'ORIGINAL_EVENT_REQUIRED';end if;
    eid:=m.event_id;f:='{}';
  else raise exception 'INVALID_CHOICE';end if;
  insert into public.google_task_outbound_operations(user_id,operation_id,generation,calendar_id,event_id,task_id,request,desired,remote,timezone,state,kind,repeat_task)
    values(u,p_operation_id,c.connection_generation,c.calendar_id,eid,p_request->>'taskId',p_request,f,'{}',c.sync_timezone,'reserved',mode,public.google_task_repeat_fields(t.data));
  return jsonb_build_object('operationId',p_operation_id,'state','reserved');
end $$;

create or replace function public.reserve_google_task_recurrence(p_operation_id uuid,p_request jsonb) returns jsonb
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
  if p_request->>'choice' is distinct from 'recurrence' or r.decision->>'kind' is distinct from 'acknowledge'
    or not public.valid_google_task_fields(m.base) or public.google_task_shared_fields(t.data) is distinct from m.base
    then raise exception 'CONFLICT_RESOLUTION_REQUIRED' using errcode='40001';end if;
  local_fields:=m.base;remote_fields:=m.base;desired_fields:=m.base;
  insert into public.google_task_outbound_operations(user_id,operation_id,generation,calendar_id,event_id,task_id,request,desired,remote,timezone,state,kind,repeat_task)
    values(u,p_operation_id,c.connection_generation,c.calendar_id,m.event_id,t.id,p_request,desired_fields,remote_fields,c.sync_timezone,'reserved','recurrence',public.google_task_repeat_fields(t.data));
  return jsonb_build_object('operationId',p_operation_id,'state','reserved');
end $$;

create or replace function public.begin_google_task_outbound(p_user_id uuid,p_operation_id uuid,p_dispatch_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op public.google_task_outbound_operations%rowtype;t public.tasks%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into op from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id for update;
  if op.kind='patch' then return public.begin_google_task_patch(p_user_id,p_operation_id,p_dispatch_id);end if;
  if op.kind='recurrence' then return public.begin_google_task_patch(p_user_id,p_operation_id,p_dispatch_id)||jsonb_build_object('kind',op.kind,'repeatTask',op.repeat_task);end if;
  if op.state is distinct from 'reserved' or p_dispatch_id is null then return jsonb_build_object('send',false,'state',op.state);end if;
  select * into t from public.tasks where user_id=p_user_id and id=op.task_id;
  if not exists(select 1 from public.google_calendar_connections c join public.google_task_sync_accounts a using(user_id)
    where c.user_id=p_user_id and a.enabled and c.connection_generation=op.generation and c.calendar_id=op.calendar_id and c.google_subject is not null)
    or coalesce(t.revision,0) is distinct from (op.request->>'taskRevision')::bigint
    or (op.kind='create' and (t.id is null or coalesce(t.data->>'deletedAt','')<>''))
    or (op.kind='delete' and t.id is not null and coalesce(t.data->>'deletedAt','')='') then
    update public.google_task_outbound_operations set state='aborted',result='{"reason":"stale-before-dispatch"}' where user_id=p_user_id and operation_id=p_operation_id;
    return jsonb_build_object('send',false,'state','aborted');
  end if;
  update public.google_task_outbound_operations set state='running',dispatch_id=p_dispatch_id where user_id=p_user_id and operation_id=p_operation_id;
  return jsonb_build_object('send',true,'kind',op.kind,'generation',op.generation,'calendarId',op.calendar_id,'eventId',op.event_id,
    'fields',op.desired,'repeatTask',op.repeat_task,'source',op.request->'source','timezone',op.timezone);
end $$;

create or replace function public.read_google_task_outbound(p_user_id uuid,p_operation_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('state',state,'kind',kind,'generation',generation,'calendarId',calendar_id,'eventId',event_id,
    'fields',desired,'repeatTask',repeat_task,'timezone',timezone,'dispatchId',dispatch_id,'etag',request->'source'->>'etag')
    from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id;
$$;

create or replace function public.finish_google_task_outbound(p_user_id uuid,p_operation_id uuid,p_dispatch_id uuid,p_outcome text,p_source jsonb,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op public.google_task_outbound_operations%rowtype;t public.tasks%rowtype;answer jsonb;mapping_state text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into op from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id for update;
  -- A newer remote version fences the old conditional PATCH/DELETE, even when its outcome was lost.
  if p_outcome='superseded' and op.kind in ('patch','delete','recurrence') then
    if op.dispatch_id is null or op.dispatch_id is distinct from p_dispatch_id or p_source->>'id' is distinct from op.event_id
      or jsonb_typeof(p_source->'etag') is distinct from 'string' or coalesce(p_source->>'etag','') in ('','*')
      or p_source->>'etag' is not distinct from op.request->'source'->>'etag'
      or p_source ?| array['recurringEventId','originalStartTime'] then raise exception 'VERSION_PROOF_REQUIRED';end if;
    answer:=jsonb_build_object('outcome',p_outcome,'source',p_source,'fields',p_fields);
    if op.state='aborted' and op.result=answer then return '{"finished":true,"state":"aborted"}';end if;
    if op.state not in ('running','uncertain') then raise exception 'RESULT_CHANGED';end if;
    update public.google_task_outbound_operations set state='aborted',result=answer where user_id=p_user_id and operation_id=p_operation_id;
    return '{"finished":true,"state":"aborted"}';
  end if;
  if op.kind in ('patch','recurrence') then return public.finish_google_task_patch(p_user_id,p_operation_id,p_dispatch_id,p_outcome,p_source,p_fields);end if;
  if op.dispatch_id is null or op.dispatch_id is distinct from p_dispatch_id then raise exception 'DISPATCH_CHANGED';end if;
  answer:=jsonb_build_object('outcome',p_outcome,'source',p_source,'fields',p_fields);
  if op.state in ('completed','aborted') then
    if op.result is distinct from answer then raise exception 'RESULT_CHANGED';end if;
    return jsonb_build_object('finished',true,'state',op.state);
  end if;
  if p_outcome='uncertain' then
    update public.google_task_outbound_operations set state='uncertain' where user_id=p_user_id and operation_id=p_operation_id;
    return jsonb_build_object('finished',false,'state','uncertain');
  elsif p_outcome='rejected' and op.state='running' then
    update public.google_task_outbound_operations set state='aborted',result=answer where user_id=p_user_id and operation_id=p_operation_id;
    return jsonb_build_object('finished',true,'state','aborted');
  end if;
  if (p_outcome is distinct from 'applied' and not(op.kind='create' and p_outcome='observed')) or p_source->>'id' is distinct from op.event_id
    or p_source ?| array['recurringEventId','originalStartTime'] then raise exception 'RECONCILIATION_REQUIRED';end if;
  perform 1 from public.google_calendar_connections where user_id=p_user_id and connection_generation=op.generation and calendar_id=op.calendar_id for update;
  if not found then raise exception 'SCOPE_CHANGED';end if;
  if op.kind='create' then
    if (p_outcome='applied' and p_fields is distinct from op.desired) or not public.valid_google_task_fields(p_fields)
      or p_source->'extendedProperties'->'private'->>'focusflowOperation' is distinct from p_operation_id::text
      or coalesce(p_source->>'status','confirmed') not in ('confirmed','tentative') or coalesce(p_source->>'etag','') in ('','*') then raise exception 'RECONCILIATION_REQUIRED';end if;
    select * into t from public.tasks where user_id=p_user_id and id=op.task_id;
    mapping_state:=case when t.id is null then 'deleted' when coalesce(t.data->>'deletedAt','')<>'' then 'trashed' else 'active' end;
    insert into public.google_task_mappings(user_id,generation,calendar_id,event_id,task_id,state,base,etag,source)
      values(p_user_id,op.generation,op.calendar_id,op.event_id,op.task_id,mapping_state,
        case when p_fields=op.desired then op.desired else null end,p_source->>'etag',p_source);
  else
    if p_source->>'status' is distinct from 'cancelled' then raise exception 'RECONCILIATION_REQUIRED';end if;
    update public.google_task_mappings set remote_deleted=true,source=p_source
      where user_id=p_user_id and generation=op.generation and calendar_id=op.calendar_id and event_id=op.event_id and task_id=op.task_id;
    if not found then raise exception 'MAPPING_CHANGED';end if;
  end if;
  insert into public.google_task_inbound_records(user_id,generation,calendar_id,event_id,source,decision)
    values(p_user_id,op.generation,op.calendar_id,op.event_id,p_source,case when op.kind='create' then
      case when p_fields=op.desired then jsonb_build_object('kind','acknowledge','base',op.desired)
      else jsonb_build_object('kind','conflict','local',public.google_task_shared_fields(coalesce(t.data,op.desired)),'remote',p_fields) end
      else '{"kind":"skip","reason":"already-trashed"}' end)
    on conflict(user_id,generation,calendar_id,event_id) do update set source=excluded.source,decision=excluded.decision,revision=public.google_task_inbound_records.revision+1,updated_at=clock_timestamp();
  update public.google_calendar_connections set sync_revision=sync_revision+1 where user_id=p_user_id;
  update public.google_task_outbound_operations set state='completed',result=answer where user_id=p_user_id and operation_id=p_operation_id;
  return jsonb_build_object('finished',true,'state','completed');
end $$;
revoke all on function public.reserve_google_task_recurrence(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.reserve_google_task_recurrence(uuid,jsonb) to authenticated;
commit;
