select to_regclass('public.google_task_versions') as versions,
       to_regclass('public.google_task_restore_receipts') as restore_receipts,
       to_regprocedure('public.apply_google_account_timezone(uuid,text)') as timezone,
       to_regprocedure('public.accept_google_task_repeat(jsonb)') as recurrence;
select position('ACCOUNT_TIMEZONE_PENDING' in pg_get_functiondef('public.claim_google_task_sync(uuid,uuid)'::regprocedure))>0 as old_client_guard,
       position('INVALID_AUTOMATIC_MERGE' in pg_get_functiondef('public.commit_google_task_inbound_core(uuid,text,bigint,uuid,bigint,uuid,text,jsonb)'::regprocedure))>0 as server_merge_guard;
select relname,relrowsecurity from pg_class where oid in ('public.google_task_versions'::regclass,'public.google_task_restore_receipts'::regclass);
select decision->>'kind' as kind, decision->>'reason' as reason,count(*)
from public.google_task_inbound_records group by 1,2 order by 1,2;
