-- Read-only. Inspect before applying 039 through 044 in numeric order.
select to_regprocedure('public.commit_google_task_inbound_core(uuid,text,bigint,uuid,bigint,uuid,text,jsonb)') as inbound_core,
       to_regprocedure('public.prune_google_task_history(uuid)') as retention,
       to_regprocedure('public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text)') as binding,
       to_regclass('public.google_task_occurrence_receipts') as occurrence_receipts,
       to_regclass('public.google_task_versions') as already_started;

-- Aggregate only; no task titles, descriptions, account addresses, or tokens.
select decision->>'kind' as kind, decision->>'reason' as reason, count(*)
from public.google_task_inbound_records group by 1,2 order by 1,2;
select count(*) filter(where s.data->'appSettings'->>'timezone' is distinct from c.sync_timezone) as timezone_mismatches,
       count(*) filter(where c.lease_until>clock_timestamp()) as live_leases
from public.google_calendar_connections c
left join public.settings s on s.user_id=c.user_id and s.id='app_settings';
