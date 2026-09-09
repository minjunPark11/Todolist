-- 028~034 적용 전 점검. 읽기만 한다. 아무것도 바꾸지 않는다.
--
-- 021~027 과 다르다. 그 둘은 배포된 코드가 이미 부르고 있는 RPC 를 되살리는 복구였다.
-- 이 일곱 개는 아직 아무도 부르지 않는 새 기능을 설치한다. 적용해도 동작은 그대로다 —
-- 계정은 계속 enabled=false 이고 프로토콜은 1 그대로다. 켜는 것은 별도의 결정이다
-- (`docs/google-task-rollout.md` 전환 순서 4).
--
-- STOP 이 하나라도 있으면 적용하지 말고 원인을 먼저 확인한다.
-- NOTE 는 적용을 막지 않는다.
--
-- 적용 순서는 강제된다: 028 → 029 → 030 → 031 → 032 → 033 → 034.
-- 뒤의 파일이 앞의 함수를 _core 로 rename 한 뒤 감싸기 때문이다. 재현 환경에서 하나씩
-- 건너뛰어 확인한 결과:
--
--   027 없이 029  → begin_google_oauth_operation(uuid,uuid,text) does not exist
--   028 없이 034  → commit_google_task_inbound_core(...) does not exist
--   029 없이 031  → relation "google_task_outbound_operations" does not exist
--   030 없이 034  → resolve_google_task_review(uuid,jsonb) does not exist
--   031 없이 033  → constraint "google_task_outbound_operations_kind_check" does not exist
--   033 없이 034  → reserve_google_task_recurrence(uuid,jsonb) does not exist
--
--   032 없이는 아무 오류도 나지 않는다. 032 에 의존하는 파일이 없기 때문이다.
--   그래서 032 를 빠뜨리면 전부 정상으로 보이지만 관리자 복구 경로
--   (recover_google_task_no_write, google_task_recovery_audit) 가 통째로 없다.
--   verify 가 이것을 잡는다.
--
-- 029 가 027 의 함수를 감싸므로 023~027 이 선행이다. 아직이라면 그것부터 한다
-- (`supabase/ops/README.md` 의 023~027 절).

select check_name, expected, actual,
       case when expected = actual then 'OK'
            when severity = 'INFO' then 'NOTE'
            else 'STOP' end as verdict
from (values
  -- 선행: 021~027 이 전부 적용돼 있어야 한다. 029 가 027 의 함수를 rename 한다.
  ('prereq  021 적용됨 (google_task_mappings)', true,
     to_regclass('public.google_task_mappings') is not null, 'BLOCK'),
  ('prereq  022 적용됨 (authorize_google_token)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='authorize_google_token'), 'BLOCK'),
  ('prereq  023 적용됨 (google_legacy_mapping_imports)', true,
     to_regclass('public.google_legacy_mapping_imports') is not null, 'BLOCK'),
  ('prereq  024 적용됨 (store_verified_google_grant)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='store_verified_google_grant'), 'BLOCK'),
  ('prereq  025 적용됨 (google_calendar_tokens.grant_version)', true,
     exists (select 1 from information_schema.columns where table_schema='public'
             and table_name='google_calendar_tokens' and column_name='grant_version'), 'BLOCK'),
  ('prereq  026 적용됨 (google_verified_connection_history)', true,
     to_regclass('public.google_verified_connection_history') is not null, 'BLOCK'),
  ('prereq  027 적용됨 (google_oauth_operations)', true,
     to_regclass('public.google_oauth_operations') is not null, 'BLOCK'),
  ('prereq  027 의 begin_google_oauth_operation 존재 (029 가 감싼다)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='begin_google_oauth_operation'), 'BLOCK'),

  -- 028~034 가 하나도 적용되지 않았어야 한다.
  -- _core 함수는 부분 적용의 지문이다. 있으면 그 단계까지 이미 실행됐다는 뜻이다.
  ('028 미적용  commit_google_task_inbound_core 없음', true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='commit_google_task_inbound_core'), 'BLOCK'),
  ('028 미적용  read_google_task_sync_snapshot_core 없음', true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='read_google_task_sync_snapshot_core'), 'BLOCK'),
  ('029 미적용  google_task_outbound_operations 없음', true,
     to_regclass('public.google_task_outbound_operations') is null, 'BLOCK'),
  ('029 미적용  begin_google_oauth_operation_outbound_core 없음', true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='begin_google_oauth_operation_outbound_core'), 'BLOCK'),
  ('030 미적용  google_task_review_receipts 없음', true,
     to_regclass('public.google_task_review_receipts') is null, 'BLOCK'),
  ('031 미적용  reserve_google_task_event 없음', true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='reserve_google_task_event'), 'BLOCK'),
  ('032 미적용  google_task_recovery_audit 없음', true,
     to_regclass('public.google_task_recovery_audit') is null, 'BLOCK'),
  ('033 미적용  reserve_google_task_recurrence 없음', true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='reserve_google_task_recurrence'), 'BLOCK'),
  ('034 미적용  prune_google_task_history 없음', true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='prune_google_task_history'), 'BLOCK'),

  -- 이 적용은 아무것도 켜지 않는다. 이미 켜져 있다면 전제가 무너진 것이므로 멈춘다.
  ('활성화된 계정 0개', true,
     not exists (select 1 from public.google_task_sync_accounts where enabled), 'BLOCK'),
  ('프로토콜 2 로 올라간 계정 0개', true,
     not exists (select 1 from public.google_task_sync_accounts where minimum_google_protocol = 2), 'BLOCK'),

  -- 참고. 적용에는 필요 없고 활성화에는 필요하다 — activation_preflight.sql 이 따로 본다.
  ('note    public.lists 존재 (007, 적용에는 불필요)', true,
     to_regclass('public.lists') is not null, 'INFO')
) as t(check_name, expected, actual, severity);
