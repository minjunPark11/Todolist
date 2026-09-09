begin;
alter table public.google_task_mappings add column remote_deleted boolean not null default false;
update public.google_task_mappings set remote_deleted=true where source->>'status'='cancelled';
create function public.track_google_cancellation() returns trigger language plpgsql set search_path='' as $$
begin
  if new.source->>'status'='cancelled' then new.remote_deleted:=true; end if;
  return new;
end $$;
create trigger track_google_cancellation before insert or update on public.google_task_mappings
  for each row execute function public.track_google_cancellation();
create function public.track_google_cancelled_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.source->>'status'='cancelled' and not(new.source ?| array['recurringEventId','originalStartTime']) then
    update public.google_task_mappings set remote_deleted=true where user_id=new.user_id and generation=new.generation
      and calendar_id=new.calendar_id and event_id=new.event_id;
  end if;
  return new;
end $$;
create trigger track_google_cancelled_record after insert or update on public.google_task_inbound_records
  for each row execute function public.track_google_cancelled_record();
create table public.google_task_review_receipts (
  user_id uuid not null references auth.users(id) on delete cascade, operation_id uuid not null,
  request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,operation_id)
);
alter table public.google_task_review_receipts enable row level security;
create policy own_read on public.google_task_review_receipts for select to authenticated using(user_id=auth.uid());
revoke all on public.google_task_review_receipts from public,anon,authenticated,service_role;
grant select on public.google_task_review_receipts to authenticated;

alter function public.read_google_task_sync_snapshot(uuid) rename to read_google_task_sync_snapshot_review_core;
revoke all on function public.read_google_task_sync_snapshot_review_core(uuid) from public,anon,authenticated,service_role;
create function public.read_google_task_sync_snapshot(p_generation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; snapshot jsonb;
begin
  u:=public.google_task_actor();snapshot:=public.read_google_task_sync_snapshot_review_core(p_generation);
  return snapshot||jsonb_build_object('operations',coalesce((select jsonb_agg(to_jsonb(o)-'user_id')
    from public.google_task_outbound_operations o where user_id=u and state in ('reserved','running','uncertain')),'[]'::jsonb),
    'historicalTaskIds',coalesce((select jsonb_agg(distinct task_id) from public.google_task_mappings where user_id=u and generation<>p_generation),'[]'::jsonb));
end $$;

create function public.resolve_google_task_review(p_operation_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;c public.google_calendar_connections%rowtype;r public.google_task_inbound_records%rowtype;
  m public.google_task_mappings%rowtype;t public.tasks%rowtype;receipt public.google_task_review_receipts%rowtype;
  action text;d jsonb;f jsonb;answer jsonb;tid text;inbox text;
begin
  u:=public.google_task_actor();
  if p_operation_id is null or jsonb_typeof(p_request) is distinct from 'object' then raise exception 'INVALID_REVIEW';end if;
  select * into receipt from public.google_task_review_receipts where user_id=u and operation_id=p_operation_id;
  if found then
    if receipt.request is distinct from p_request then raise exception 'OPERATION_ID_REUSED';end if;
    return receipt.result;
  end if;
  if exists(select 1 from public.google_task_outbound_operations where user_id=u and state in ('reserved','running','uncertain')) then raise exception 'OUTBOUND_PENDING';end if;
  select * into c from public.google_calendar_connections where user_id=u for update;
  if c.connection_generation::text is distinct from p_request->>'generation' or c.calendar_id is distinct from p_request->>'calendarId'
    or c.sync_revision is distinct from (p_request->>'syncRevision')::bigint
    or c.lease_owner is null or c.lease_owner::text is distinct from p_request->>'owner'
    or c.lease_fence is distinct from (p_request->>'fence')::bigint or coalesce(c.lease_until,'-infinity')<=clock_timestamp()
    or c.google_subject is null or c.calendar_verified_at is null then raise exception 'STALE_SELECTION' using errcode='40001';end if;
  select * into r from public.google_task_inbound_records where user_id=u and generation=c.connection_generation
    and calendar_id=c.calendar_id and event_id=p_request->>'eventId' for update;
  if r.revision is null or r.revision is distinct from (p_request->>'recordRevision')::bigint or r.source is distinct from p_request->'source'
    then raise exception 'STALE_SELECTION' using errcode='40001';end if;
  if r.decision->>'kind' is distinct from 'review' and not(r.decision->>'kind'='skip' and r.decision->>'reason'='excluded') then raise exception 'REVIEW_REQUIRED';end if;
  select * into m from public.google_task_mappings where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=r.event_id for update;
  if m.task_id is not null then
    select * into t from public.tasks where user_id=u and id=m.task_id for update;
    if t.id is null or t.revision is distinct from (p_request->>'taskRevision')::bigint then raise exception 'STALE_SELECTION' using errcode='40001';end if;
  end if;
  action:=p_request->>'choice';
  if action='exclude' then
    if m.task_id is not null and m.state<>'trashed' then raise exception 'ACTIVE_MAPPING';end if;
    d:='{"kind":"skip","reason":"excluded"}';
  elsif action in ('import','restore') then
    f:=p_request->'fields';
    if not public.valid_google_task_fields(f) or r.source->>'id' is distinct from r.event_id
      or coalesce(r.source->>'status','confirmed') not in ('confirmed','tentative')
      or r.source ?| array['recurringEventId','originalStartTime']
      or (r.source ? 'recurrence' and r.source->'recurrence'<>'[]'::jsonb) then raise exception 'UNSUPPORTED_EVENT';end if;
    if action='import' then
      if m.task_id is not null then raise exception 'MAPPING_CHANGED';end if;
      select id into inbox from public.lists where user_id=u and data->>'kind'='inbox'
        and coalesce(data->>'deletedAt','')='' and coalesce(data->>'archivedAt','')='';
      if inbox is null then raise exception 'INBOX_REQUIRED';end if;
      tid:=gen_random_uuid()::text;
      insert into public.tasks(id,user_id,data) values(tid,u,f||jsonb_build_object('id',tid,'listId',inbox,'status','open','priority','none',
        'createdAt',clock_timestamp(),'updatedAt',clock_timestamp(),'googleEventId',r.event_id)) returning * into t;
      insert into public.google_task_mappings(user_id,generation,calendar_id,event_id,task_id,base,etag,source)
        values(u,c.connection_generation,c.calendar_id,r.event_id,tid,f,r.source->>'etag',r.source);
      d:=jsonb_build_object('kind','acknowledge','base',f);
    else
      if m.state is distinct from 'trashed' or t.id is null then raise exception 'RESTORE_REQUIRES_TRASH';end if;
      update public.tasks set data=(data-'deletedAt')||jsonb_build_object('updatedAt',clock_timestamp()) where user_id=u and id=t.id returning * into t;
      update public.google_task_mappings set state='active',remote_deleted=false,source=r.source where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=r.event_id;
      if public.google_task_shared_fields(t.data)=public.google_task_shared_fields(f) then
        update public.google_task_mappings set base=f,etag=r.source->>'etag',source=r.source where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=r.event_id;
        d:=jsonb_build_object('kind','acknowledge','base',f);
      else d:=jsonb_build_object('kind','conflict','local',public.google_task_shared_fields(t.data),'remote',f);end if;
    end if;
  else raise exception 'INVALID_CHOICE';end if;
  update public.google_task_inbound_records set decision=d,revision=revision+1,updated_at=clock_timestamp()
    where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=r.event_id;
  update public.google_calendar_connections set sync_revision=sync_revision+1 where user_id=u returning * into c;
  answer:=jsonb_build_object('syncRevision',c.sync_revision,'decision',d);
  insert into public.google_task_review_receipts(user_id,operation_id,request,result) values(u,p_operation_id,p_request,answer);
  return answer;
end $$;
revoke all on function public.track_google_cancellation() from public,anon,authenticated,service_role;
revoke all on function public.track_google_cancelled_record() from public,anon,authenticated,service_role;
revoke all on function public.read_google_task_sync_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.resolve_google_task_review(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_google_task_sync_snapshot(uuid) to authenticated;
grant execute on function public.resolve_google_task_review(uuid,jsonb) to authenticated;
commit;
