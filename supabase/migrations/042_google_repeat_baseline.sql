begin;
alter table public.google_task_mappings add column repeat_base jsonb;
create function public.accept_google_task_repeat(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid;c public.google_calendar_connections%rowtype;m public.google_task_mappings%rowtype;t public.tasks%rowtype;r public.google_task_inbound_records%rowtype;patch jsonb;
begin
 u:=public.google_task_actor();
 select * into c from public.google_calendar_connections where user_id=u for update;
 if c.connection_generation::text is distinct from p_request->>'generation' or c.sync_revision is distinct from (p_request->>'syncRevision')::bigint
   or c.lease_owner::text is distinct from p_request->>'owner' or c.lease_owner is null or c.lease_fence is distinct from (p_request->>'fence')::bigint
   or coalesce(c.lease_until,'-infinity')<=clock_timestamp() then raise exception 'SYNC_PRECONDITION_FAILED' using errcode='40001';end if;
 select * into m from public.google_task_mappings where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=p_request->>'eventId' for update;
 select * into t from public.tasks where user_id=u and id=m.task_id for update;
 select * into r from public.google_task_inbound_records where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=m.event_id for update;
 if m.state is distinct from 'active' or t.id is null or t.revision is distinct from (p_request->>'taskRevision')::bigint
   or r.revision is distinct from (p_request->>'recordRevision')::bigint or r.source is distinct from p_request->'source'
   or r.decision->>'kind' is distinct from 'acknowledge' or coalesce(t.data->>'deletedAt','')<>''
   or public.google_task_shared_fields(t.data) is distinct from m.base
   or m.repeat_base is distinct from nullif(p_request->'base','null'::jsonb) then raise exception 'STALE_SELECTION' using errcode='40001';end if;
 if p_request->>'choice'='google' then
  if m.repeat_base is null or public.google_task_repeat_fields(t.data) is distinct from m.repeat_base->'task'
    or public.google_task_shared_fields(t.data)-'title'-'description' is distinct from m.repeat_base->'schedule' then
    raise exception 'REPEAT_CONFLICT' using errcode='40001';end if;
  patch:=p_request->'patch';
  if jsonb_typeof(patch) is distinct from 'object' or patch is distinct from public.google_task_repeat_fields(patch)
    or patch->>'repeatType' not in ('none','daily','weekly','monthly','yearly') then raise exception 'INVALID_REPEAT' using errcode='22023';end if;
  update public.tasks set data=data||patch||jsonb_build_object('updatedAt',clock_timestamp()) where user_id=u and id=t.id returning * into t;
 elsif p_request->>'choice' is distinct from 'baseline' then raise exception 'INVALID_CHOICE' using errcode='22023';end if;
 update public.google_task_mappings set repeat_base=jsonb_build_object('rules',coalesce(r.source->'recurrence','[]'::jsonb),
   'task',public.google_task_repeat_fields(t.data),'schedule',public.google_task_shared_fields(t.data)-'title'-'description')
   where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=m.event_id;
 return jsonb_build_object('applied',true);
end $$;
revoke all on function public.accept_google_task_repeat(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.accept_google_task_repeat(jsonb) to authenticated;
commit;
