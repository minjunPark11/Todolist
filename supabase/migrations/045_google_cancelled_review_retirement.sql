-- A cancelled, unmapped event has no remaining import decision. Preserve
-- tasks, sources, exclusions and replay receipts; allow only the exact skip.
begin;
do $$
declare definition text;changed text;
begin
 definition:=pg_get_functiondef('public.commit_google_task_inbound_review_core(uuid,text,bigint,uuid,bigint,uuid,text,jsonb)'::regprocedure);
 changed:=replace(definition,
 $old$and exists(select 1 from public.google_task_mappings where user_id=u and generation=p_generation and calendar_id=p_calendar_id and event_id=entry->>'eventId')),false)$old$,
 $new$and (exists(select 1 from public.google_task_mappings where user_id=u and generation=p_generation and calendar_id=p_calendar_id and event_id=entry->>'eventId')
   or (entry->'decision'='{"kind":"skip","reason":"cancelled-unmapped"}'::jsonb
     and not exists(select 1 from public.google_task_mappings where user_id=u and generation=p_generation and calendar_id=p_calendar_id and event_id=entry->>'eventId')))),false)$new$);
 if changed=definition then raise exception 'CANCELLED_REVIEW_CORE_DRIFT';end if;
 execute changed;
end $$;
commit;
