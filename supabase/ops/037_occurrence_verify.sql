-- Read-only. Run state.sql and 028_034_verify.sql first.
select '037 receipt table' as check_name, to_regclass('public.google_task_occurrence_receipts') is not null as ok
union all select '037 reservation', to_regprocedure('public.reserve_google_task_occurrence(uuid,jsonb)') is not null
union all select '037 snapshot wrapper', to_regprocedure('public.read_google_task_sync_snapshot_occurrence_core(uuid)') is not null
union all select '037 dispatch wrapper', to_regprocedure('public.begin_google_task_outbound_occurrence_core(uuid,uuid,uuid)') is not null
union all select '037 settlement wrapper', to_regprocedure('public.finish_google_task_outbound_occurrence_core(uuid,uuid,uuid,text,jsonb,jsonb)') is not null
-- 038 없이 037 을 켜면 영수증이 세대 교체 때마다 영구히 쌓인다. 나이로는 지울 수 없는
-- 표라서(멱등 장부다) 정리 규칙이 따로 필요했다.
union all select '038 receipt retention', to_regprocedure('public.prune_google_task_history_occurrence_core(uuid)') is not null;

-- to_jsonb allows this inventory to run before the new column exists.
select a.user_id, a.enabled as task_sync_enabled,
  coalesce((to_jsonb(a)->>'occurrence_sync_enabled')::boolean,false) as occurrence_sync_enabled,
  c.calendar_id, c.sync_timezone,
  c.google_subject is not null and c.calendar_verified_at is not null as verified_connection,
  (select count(*) from public.google_task_outbound_operations o where o.user_id=a.user_id
    and o.state in ('reserved','running','uncertain')) as pending_writes
from public.google_task_sync_accounts a left join public.google_calendar_connections c using(user_id);
