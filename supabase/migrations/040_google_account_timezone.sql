-- Account settings are authoritative. Keep raw sources and rebase wall-clock
-- snapshots transactionally; an old review must not block changing the reader's zone.
begin;
create function public.retime_google_task_fields(f jsonb,old_zone text,new_zone text) returns jsonb
language plpgsql stable set search_path='' as $$
declare a timestamp; b timestamp; start_day text; end_day text;
begin
  if coalesce(f->>'startTime','')='' or coalesce(f->>'endTime','')='' then return f;end if;
  a:=((coalesce(nullif(f->>'startDate',''),f->>'dueDate')||' '||(f->>'startTime'))::timestamp at time zone old_zone) at time zone new_zone;
  b:=(((f->>'dueDate')||' '||(f->>'endTime'))::timestamp at time zone old_zone) at time zone new_zone;
  start_day:=to_char(a,'YYYY-MM-DD');end_day:=to_char(b,'YYYY-MM-DD');
  return f||jsonb_build_object('startDate',case when start_day=end_day then '' else start_day end,
    'dueDate',end_day,'startTime',to_char(a,'HH24:MI'),'endTime',to_char(b,'HH24:MI'));
end $$;
revoke all on function public.retime_google_task_fields(jsonb,text,text) from public,anon,authenticated,service_role;

create function public.apply_google_account_timezone(p_generation uuid,p_expected_timezone text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;c public.google_calendar_connections%rowtype;zone text;m public.google_task_mappings%rowtype;
  t public.tasks%rowtype; fields jsonb;converted jsonb;
begin
  u:=public.google_task_actor();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,21));
  select * into c from public.google_calendar_connections where user_id=u for update;
  if c.connection_generation is distinct from p_generation or c.sync_timezone is null or c.calendar_verified_at is null then
    raise exception 'SYNC_CONNECTION_CHANGED' using errcode='40001';end if;
  select data->'appSettings'->>'timezone' into zone from public.settings where user_id=u and id='app_settings' for share;
  if p_expected_timezone is not null and zone is distinct from p_expected_timezone then return jsonb_build_object('applied',false,'reason','settings-pending');end if;
  if zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then
    return jsonb_build_object('applied',false,'reason','settings-pending');end if;
  if zone=c.sync_timezone then return jsonb_build_object('applied',true,'timezone',zone,'changed',false);end if;
  if coalesce(c.lease_until,'-infinity'::timestamptz)>clock_timestamp() or exists(select 1 from public.google_task_outbound_operations
    where user_id=u and state in ('reserved','running','uncertain')) then
    return jsonb_build_object('applied',false,'reason','sync-in-progress');end if;
  for m in select * from public.google_task_mappings where user_id=u and generation=p_generation and calendar_id=c.calendar_id for update loop
    if m.base is null then continue;end if;
    converted:=public.retime_google_task_fields(m.base,c.sync_timezone,zone);
    select * into t from public.tasks where user_id=u and id=m.task_id for update;
    if t.id is not null and m.state='active' then
      fields:=public.google_task_shared_fields(t.data);
      -- Unedited schedules preserve instants. A local schedule edit retains
      -- the wall clock the user chose; the next three-way pass reconciles it.
      if fields-'title'-'description'=public.google_task_shared_fields(m.base)-'title'-'description' then
        update public.tasks set data=data||(converted-'title'-'description')||jsonb_build_object('updatedAt',clock_timestamp())
          where user_id=u and id=t.id and data||(converted-'title'-'description') is distinct from data;
      end if;
    end if;
    update public.google_task_mappings set base=converted where user_id=u and generation=p_generation and calendar_id=c.calendar_id and event_id=m.event_id;
  end loop;
  -- Persist sources and exclusions. Bump revisions so old choices fail CAS;
  -- a full read below recomputes any conflict in the new zone before display.
  update public.google_task_inbound_records set revision=revision+1,updated_at=clock_timestamp(),
    decision=case when decision->>'kind'='conflict' then decision||jsonb_build_object('timezoneRecheck',true) else decision end
    where user_id=u and generation=p_generation and calendar_id=c.calendar_id;
  update public.google_calendar_connections set sync_timezone=zone,sync_token=null,sync_revision=sync_revision+1,
    lease_owner=null,lease_until=null,lease_fence=lease_fence+1 where user_id=u;
  return jsonb_build_object('applied',true,'timezone',zone,'changed',true);
end $$;
revoke all on function public.apply_google_account_timezone(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.apply_google_account_timezone(uuid,text) to authenticated;
alter function public.read_google_task_sync_snapshot(uuid) rename to read_google_task_sync_snapshot_automation_core;
revoke all on function public.read_google_task_sync_snapshot_automation_core(uuid) from public,anon,authenticated,service_role;
create function public.read_google_task_sync_snapshot(p_generation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  return public.read_google_task_sync_snapshot_automation_core(p_generation)||jsonb_build_object('automaticSyncEnabled',true);
end $$;
revoke all on function public.read_google_task_sync_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_google_task_sync_snapshot(uuid) to authenticated;
commit;
