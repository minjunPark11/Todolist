begin;
do $$
declare definition text;changed text;
begin
 definition:=pg_get_functiondef('public.resolve_google_task_review(uuid,jsonb)'::regprocedure);
 changed:=replace(definition,$old$if action='exclude' then$old$,$new$if action in ('keep-task','accept-delete') then
    if r.decision->>'reason' is distinct from 'deletion-conflict' or r.source->>'status' is distinct from 'cancelled'
      or r.source ?| array['recurringEventId','originalStartTime'] or m.state is distinct from 'active' or t.id is null then
      raise exception 'STALE_SELECTION' using errcode='40001';end if;
    if action='accept-delete' then
      update public.tasks set data=data||jsonb_build_object('deletedAt',clock_timestamp(),'updatedAt',clock_timestamp()) where user_id=u and id=t.id;
    end if;
    -- Keeping the task makes the old deleted mapping historical. The normal
    -- lifecycle creates a fresh event, preserving the existing task identity.
    update public.google_task_mappings set state='trashed',remote_deleted=true,source=r.source
      where user_id=u and generation=c.connection_generation and calendar_id=c.calendar_id and event_id=r.event_id;
    d:=jsonb_build_object('kind','skip','reason','already-trashed');
  elsif action='exclude' then$new$);
 if changed=definition then raise exception 'REVIEW_CORE_DRIFT';end if;
 execute changed;
end $$;
commit;
