begin;
alter function public.read_google_task_sync_snapshot(uuid) rename to read_google_task_sync_snapshot_core;
revoke all on function public.read_google_task_sync_snapshot_core(uuid) from public,anon,authenticated,service_role;
create function public.read_google_task_sync_snapshot(p_generation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; inbox text; inbox_count bigint;
begin
  u:=public.google_task_actor();
  if not exists(select 1 from public.google_calendar_connections where user_id=u and connection_generation=p_generation
    and google_subject is not null and calendar_verified_at is not null) then
    raise exception 'VERIFIED_CALENDAR_REQUIRED' using errcode='42501';
  end if;
  select min(id),count(*) into inbox,inbox_count from public.lists where user_id=u and data->>'kind'='inbox'
    and coalesce(data->>'deletedAt','')='' and coalesce(data->>'archivedAt','')='';
  if inbox_count<>1 then raise exception 'UNIQUE_INBOX_REQUIRED' using errcode='40001'; end if;
  return public.read_google_task_sync_snapshot_core(p_generation)||jsonb_build_object('userId',u,'inboxListId',inbox);
end $$;

alter function public.commit_google_task_inbound(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) rename to commit_google_task_inbound_core;
revoke all on function public.commit_google_task_inbound_core(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.commit_google_task_inbound(p_generation uuid,p_calendar_id text,p_sync_revision bigint,p_owner uuid,
  p_fence bigint,p_pass_id uuid,p_next_sync_token text,p_entries jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; entry jsonb; prior jsonb;
begin
  u:=public.google_task_actor();
  perform 1 from public.google_calendar_connections where user_id=u for update;
  -- Receipts must remain replayable even if a later pass changed the review record.
  if not exists(select 1 from public.google_task_inbound_passes where user_id=u and generation=p_generation and pass_id=p_pass_id) then
    for entry in select value from jsonb_array_elements(p_entries) loop
      select decision into prior from public.google_task_inbound_records where user_id=u and generation=p_generation
        and calendar_id=p_calendar_id and event_id=entry->>'eventId';
      if prior->>'kind'='review' and prior is distinct from entry->'decision' and not coalesce((
        entry->'source'->>'status'='cancelled' and not(entry->'source' ?| array['recurringEventId','originalStartTime'])
        and entry->'decision'->>'kind' in ('trash','skip')
        and exists(select 1 from public.google_task_mappings where user_id=u and generation=p_generation and calendar_id=p_calendar_id and event_id=entry->>'eventId')),false) then
        raise exception 'REVIEW_RESOLUTION_REQUIRED' using errcode='40001';
      end if;
      if prior->>'kind'='skip' and prior->>'reason'='excluded' and
        not exists(select 1 from public.google_task_mappings where user_id=u and generation=p_generation
          and calendar_id=p_calendar_id and event_id=entry->>'eventId') and
        prior is distinct from entry->'decision' then
        raise exception 'EXCLUSION_RESOLUTION_REQUIRED' using errcode='40001';
      end if;
    end loop;
  end if;
  return public.commit_google_task_inbound_core(p_generation,p_calendar_id,p_sync_revision,p_owner,p_fence,p_pass_id,p_next_sync_token,p_entries);
end $$;
revoke all on function public.read_google_task_sync_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.commit_google_task_inbound(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_google_task_sync_snapshot(uuid) to authenticated;
grant execute on function public.commit_google_task_inbound(uuid,text,bigint,uuid,bigint,uuid,text,jsonb) to authenticated;
commit;
