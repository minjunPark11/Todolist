-- M6: disabled until a test account passes the live rollout checks.
begin;
alter table public.google_task_sync_accounts add column occurrence_sync_enabled boolean not null default false;
alter table public.google_task_outbound_operations drop constraint google_task_outbound_operations_kind_check;
alter table public.google_task_outbound_operations add constraint google_task_outbound_operations_kind_check
  check(kind in ('patch','create','delete','recurrence','occurrence-patch','occurrence-delete'));

create table public.google_task_occurrence_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  generation uuid not null, calendar_id text not null, master_event_id text not null,
  occurrence_date text not null, kind text not null, fields jsonb, source jsonb not null, timezone text not null,
  primary key(user_id,generation,calendar_id,master_event_id,occurrence_date)
);
alter table public.google_task_occurrence_receipts enable row level security;
revoke all on public.google_task_occurrence_receipts from public,anon,authenticated,service_role;

alter function public.read_google_task_sync_snapshot(uuid) rename to read_google_task_sync_snapshot_occurrence_core;
revoke all on function public.read_google_task_sync_snapshot_occurrence_core(uuid) from public,anon,authenticated,service_role;
create function public.read_google_task_sync_snapshot(p_generation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; snapshot jsonb;
begin
  u:=public.google_task_actor();
  snapshot:=public.read_google_task_sync_snapshot_occurrence_core(p_generation);
  return snapshot || jsonb_build_object('occurrenceSyncEnabled',
    (select occurrence_sync_enabled from public.google_task_sync_accounts where user_id=u),
    'occurrenceReceipts',coalesce((select jsonb_agg(to_jsonb(r)-'user_id') from public.google_task_occurrence_receipts r
      where user_id=u and generation=p_generation and calendar_id=snapshot->>'calendarId'),'[]'::jsonb));
end $$;

-- Close the ordinary-create path for older protocol-2 clients as well.
alter function public.reserve_google_task_event(uuid,jsonb) rename to reserve_google_task_event_occurrence_core;
revoke all on function public.reserve_google_task_event_occurrence_core(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.reserve_google_task_event(p_operation_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
  u:=public.google_task_actor();
  if not exists(select 1 from public.google_task_outbound_operations where user_id=u and operation_id=p_operation_id)
    and p_request->>'kind'='create' and exists(select 1 from public.tasks where user_id=u and id=p_request->>'taskId'
      and coalesce(data->>'occurrenceOf','')<>'' and coalesce(data->>'recurrenceId','')<>'') then
    raise exception 'OCCURRENCE_CANNOT_CREATE' using errcode='22023';
  end if;
  return public.reserve_google_task_event_occurrence_core(p_operation_id,p_request);
end $$;

create function public.reserve_google_task_occurrence(p_operation_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; c public.google_calendar_connections%rowtype; s public.tasks%rowtype; t public.tasks%rowtype;
  m public.google_task_mappings%rowtype; op public.google_task_outbound_operations%rowtype;
  mode text; d date; anchor date; original text; desired jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(270027); u:=public.google_task_actor();
  if p_operation_id is null or jsonb_typeof(p_request) is distinct from 'object' then raise exception 'INVALID_REQUEST' using errcode='22023';end if;
  select * into op from public.google_task_outbound_operations where user_id=u and operation_id=p_operation_id;
  if found then
    if not public.google_task_receipt_matches(op.request,p_request) then raise exception 'OPERATION_ID_REUSED' using errcode='22023';end if;
    return jsonb_build_object('operationId',p_operation_id,'state',op.state);
  end if;
  if not exists(select 1 from public.google_task_sync_accounts where user_id=u and occurrence_sync_enabled) then
    raise exception 'OCCURRENCE_SYNC_DISABLED' using errcode='55000';end if;
  if exists(select 1 from public.google_oauth_operations where state<>'completed') or exists(select 1 from public.google_task_outbound_operations
    where user_id=u and state in ('reserved','running','uncertain')) then raise exception 'SYNC_BUSY' using errcode='55000';end if;
  select * into c from public.google_calendar_connections where user_id=u for update;
  if c.connection_generation::text is distinct from p_request->>'generation' or c.calendar_id is distinct from p_request->>'calendarId'
    or c.sync_revision is distinct from (p_request->>'syncRevision')::bigint or c.lease_owner is null
    or c.lease_owner::text is distinct from p_request->>'owner' or c.lease_fence is distinct from (p_request->>'fence')::bigint
    or coalesce(c.lease_until,'-infinity')<=clock_timestamp() or c.google_subject is null or c.calendar_verified_at is null
    or c.sync_timezone is null then raise exception 'STALE_SELECTION' using errcode='40001';end if;
  select * into s from public.tasks where user_id=u and id=p_request->>'seriesId' for update;
  select * into t from public.tasks where user_id=u and id=p_request->>'taskId' for update;
  select * into m from public.google_task_mappings where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id
    and event_id=p_request->>'masterEventId' and task_id=s.id and state='active' and not remote_deleted for update;
  if s.id is null or t.id is null or m.event_id is null or coalesce(s.data->>'deletedAt','')<>''
    or s.revision is distinct from (p_request->>'seriesRevision')::bigint or t.revision is distinct from (p_request->>'taskRevision')::bigint
    or not public.valid_google_task_fields(m.base) or jsonb_typeof(m.source->'recurrence') is distinct from 'array'
    or jsonb_array_length(m.source->'recurrence')=0 then raise exception 'STALE_SERIES' using errcode='40001';end if;
  mode:=p_request->>'kind'; d:=(p_request->>'occurrenceDate')::date;
  if to_char(d,'YYYY-MM-DD') is distinct from p_request->>'occurrenceDate' then raise exception 'INVALID_DATE' using errcode='22023';end if;
  if mode='occurrence-patch' then
    if t.data->>'occurrenceOf' is distinct from s.id or t.data->>'recurrenceId' is distinct from d::text
      or coalesce(t.data->>'deletedAt','')<>'' or coalesce(t.data->>'completedAt','')<>''
      or coalesce(t.data->>'status','') in ('done','completed','abandoned','given_up')
      or coalesce(s.data->'exdates','[]') ? d::text then raise exception 'INELIGIBLE_OCCURRENCE' using errcode='40001';end if;
    desired:=public.google_task_shared_fields(t.data);
    if not public.valid_google_task_fields(desired) then raise exception 'INVALID_FIELDS' using errcode='22023';end if;
  elsif mode='occurrence-delete' then
    if t.id<>s.id or not(coalesce(s.data->'exdates','[]') ? d::text or exists(select 1 from public.tasks
      where user_id=u and data->>'occurrenceOf'=s.id and data->>'recurrenceId'=d::text and coalesce(data->>'deletedAt','')<>'')) then
      raise exception 'SKIP_REQUIRED' using errcode='40001';end if;
    desired:='{}';
  else raise exception 'INVALID_KIND' using errcode='22023';end if;
  anchor:=d-((m.base->>'dueDate')::date-coalesce(nullif(m.base->>'startDate',''),m.base->>'dueDate')::date);
  original:=p_request->>'originalStart';
  if coalesce(m.base->>'startTime','')='' then
    if original is distinct from anchor::text or p_request->'source'->'originalStartTime'->>'date' is distinct from original then
      raise exception 'WRONG_OCCURRENCE' using errcode='22023';end if;
  else
    if original !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or
      (original::timestamptz at time zone c.sync_timezone) is distinct from (anchor+(m.base->>'startTime')::time)
      or (p_request->'source'->'originalStartTime'->>'dateTime')::timestamptz is distinct from original::timestamptz then
      raise exception 'WRONG_OCCURRENCE' using errcode='22023';end if;
  end if;
  if p_request->'source'->>'recurringEventId' is distinct from m.event_id or p_request->'source'->>'id' is distinct from p_request->>'eventId'
    or coalesce(p_request->>'eventId','') in ('',m.event_id)
    or (not(mode='occurrence-delete' and coalesce(p_request->'source'->>'status','')='cancelled') and coalesce(p_request->'source'->>'etag','') in ('','*')) then
    raise exception 'INSTANCE_REQUIRED' using errcode='22023';end if;
  insert into public.google_task_outbound_operations(user_id,operation_id,generation,calendar_id,event_id,task_id,request,desired,remote,timezone,state,kind)
    values(u,p_operation_id,c.connection_generation,c.calendar_id,p_request->>'eventId',t.id,p_request,desired,
      coalesce(p_request->'remote','{}'),c.sync_timezone,'reserved',mode);
  return jsonb_build_object('operationId',p_operation_id,'state','reserved');
end $$;

alter function public.begin_google_task_outbound(uuid,uuid,uuid) rename to begin_google_task_outbound_occurrence_core;
revoke all on function public.begin_google_task_outbound_occurrence_core(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function public.begin_google_task_outbound(p_user_id uuid,p_operation_id uuid,p_dispatch_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op public.google_task_outbound_operations%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into op from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id for update;
  if op.kind not in ('occurrence-patch','occurrence-delete') or op.kind is null then
    return public.begin_google_task_outbound_occurrence_core(p_user_id,p_operation_id,p_dispatch_id);end if;
  if op.state<>'reserved' or p_dispatch_id is null then return jsonb_build_object('send',false,'state',op.state);end if;
  if not exists(select 1 from public.google_calendar_connections c join public.google_task_sync_accounts a using(user_id)
    where c.user_id=p_user_id and a.enabled and a.occurrence_sync_enabled and c.connection_generation=op.generation
      and c.calendar_id=op.calendar_id and c.sync_timezone=op.timezone and c.google_subject is not null)
    or not exists(select 1 from public.tasks where user_id=p_user_id and id=op.task_id and revision=(op.request->>'taskRevision')::bigint)
    or not exists(select 1 from public.tasks where user_id=p_user_id and id=op.request->>'seriesId' and revision=(op.request->>'seriesRevision')::bigint) then
    update public.google_task_outbound_operations set state='aborted',result='{"reason":"stale-before-dispatch"}' where user_id=p_user_id and operation_id=p_operation_id;
    return '{"send":false,"state":"aborted"}';end if;
  update public.google_task_outbound_operations set state='running',dispatch_id=p_dispatch_id where user_id=p_user_id and operation_id=p_operation_id;
  return jsonb_build_object('send',true,'kind',op.kind,'generation',op.generation,'calendarId',op.calendar_id,'eventId',op.event_id,
    'fields',op.desired,'remote',op.remote,'source',op.request->'source','timezone',op.timezone,
    'masterEventId',op.request->>'masterEventId','originalStart',op.request->>'originalStart');
end $$;

alter function public.read_google_task_outbound(uuid,uuid) rename to read_google_task_outbound_occurrence_core;
revoke all on function public.read_google_task_outbound_occurrence_core(uuid,uuid) from public,anon,authenticated,service_role;
create function public.read_google_task_outbound(p_user_id uuid,p_operation_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select public.read_google_task_outbound_occurrence_core(p_user_id,p_operation_id)||jsonb_build_object(
    'masterEventId',request->>'masterEventId','originalStart',request->>'originalStart','source',request->'source')
  from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id;
$$;

alter function public.finish_google_task_outbound(uuid,uuid,uuid,text,jsonb,jsonb) rename to finish_google_task_outbound_occurrence_core;
revoke all on function public.finish_google_task_outbound_occurrence_core(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.finish_google_task_outbound(p_user_id uuid,p_operation_id uuid,p_dispatch_id uuid,p_outcome text,p_source jsonb,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op public.google_task_outbound_operations%rowtype; answer jsonb; final_state text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into op from public.google_task_outbound_operations where user_id=p_user_id and operation_id=p_operation_id for update;
  if op.kind not in ('occurrence-patch','occurrence-delete') or op.kind is null then
    return public.finish_google_task_outbound_occurrence_core(p_user_id,p_operation_id,p_dispatch_id,p_outcome,p_source,p_fields);end if;
  if op.dispatch_id is null or op.dispatch_id is distinct from p_dispatch_id then raise exception 'DISPATCH_CHANGED';end if;
  answer:=jsonb_build_object('outcome',p_outcome,'source',p_source,'fields',p_fields);
  if op.state in ('completed','aborted') then
    if not public.google_task_receipt_matches(op.result,answer) then raise exception 'RESULT_CHANGED';end if;
    return jsonb_build_object('finished',true,'state',op.state);end if;
  if p_outcome='uncertain' then
    update public.google_task_outbound_operations set state='uncertain' where user_id=p_user_id and operation_id=p_operation_id;
    return '{"finished":false,"state":"uncertain"}';end if;
  if p_outcome='rejected' and op.state='running' then final_state:='aborted';
  else
    -- 신원 증명. 무게를 지는 것은 앞의 두 줄이다: 인스턴스 id 는 그 인스턴스를 유일하게
    -- 지목하고, recurringEventId 는 그것이 예약된 시리즈의 것임을 말한다. 두 값 모두
    -- 구글이 돌려준 것 그대로 올라온다.
    --
    -- 세 번째 줄은 그렇지 않다. 클라이언트가 originalStartTime 을 예약 때 보낸 값으로
    -- 덮어쓴 뒤 보내므로 (`integrations/google/occurrenceOutbound.ts` 의 `normalized`),
    -- 이 비교는 자기 자신과의 비교이고 이 클라이언트로는 절대 실패하지 않는다. 그렇게
    -- 하는 이유는 구글이 같은 순간을 다른 표기로 돌려줄 수 있어서 — 오프셋이 다른
    -- dateTime, 날짜와 시각의 교차 — jsonb 정확 비교가 참인 것을 거짓으로 만들기
    -- 때문이다. 회차가 맞는지는 클라이언트의 `matchesOccurrence` 가 순간 동치로 본다.
    --
    -- 그러므로 이 줄은 모양 검사이지 독립적인 증명이 아니다. 위의 id 검사가 이미 그
    -- 일을 하고 있어서 잃는 것은 없지만, 이것을 두 번째 자물쇠로 읽으면 안 된다.
    if p_source->>'id' is distinct from op.event_id or p_source->>'recurringEventId' is distinct from op.request->>'masterEventId'
      or p_source->'originalStartTime' is distinct from op.request->'source'->'originalStartTime' then raise exception 'INSTANCE_PROOF_REQUIRED';end if;
    if p_outcome='superseded' then
      if coalesce(p_source->>'etag','') in ('','*') or p_source->>'etag' is not distinct from op.request->'source'->>'etag' then
        raise exception 'VERSION_PROOF_REQUIRED';end if;
      final_state:='aborted';
    elsif p_outcome='applied' then
      if op.kind='occurrence-patch' and (p_fields is distinct from op.desired or p_source->>'status'='cancelled'
        or coalesce(p_source->>'etag','') in ('','*') or p_source->>'etag' is not distinct from op.request->'source'->>'etag') then
        raise exception 'RECONCILIATION_REQUIRED';end if;
      if op.kind='occurrence-delete' and p_source->>'status' is distinct from 'cancelled' then raise exception 'RECONCILIATION_REQUIRED';end if;
      perform 1 from public.google_calendar_connections where user_id=p_user_id and connection_generation=op.generation
        and calendar_id=op.calendar_id for update;
      if not found then raise exception 'SCOPE_CHANGED';end if;
      insert into public.google_task_occurrence_receipts(user_id,generation,calendar_id,master_event_id,occurrence_date,kind,fields,source,timezone)
        values(p_user_id,op.generation,op.calendar_id,op.request->>'masterEventId',op.request->>'occurrenceDate',op.kind,
          case when op.kind='occurrence-patch' then op.desired else null end,p_source,op.timezone)
        on conflict(user_id,generation,calendar_id,master_event_id,occurrence_date) do update
          set kind=excluded.kind,fields=excluded.fields,source=excluded.source,timezone=excluded.timezone;
      update public.google_calendar_connections set sync_revision=sync_revision+1 where user_id=p_user_id;
      final_state:='completed';
    else raise exception 'INVALID_OUTCOME';end if;
  end if;
  update public.google_task_outbound_operations set state=final_state,result=answer where user_id=p_user_id and operation_id=p_operation_id;
  return jsonb_build_object('finished',true,'state',final_state);
end $$;

revoke all on function public.read_google_task_sync_snapshot(uuid), public.reserve_google_task_event(uuid,jsonb),
  public.reserve_google_task_occurrence(uuid,jsonb),public.begin_google_task_outbound(uuid,uuid,uuid),
  public.read_google_task_outbound(uuid,uuid),public.finish_google_task_outbound(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_google_task_sync_snapshot(uuid),public.reserve_google_task_event(uuid,jsonb),public.reserve_google_task_occurrence(uuid,jsonb) to authenticated;
grant execute on function public.begin_google_task_outbound(uuid,uuid,uuid),public.read_google_task_outbound(uuid,uuid),
  public.finish_google_task_outbound(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
commit;
