-- 지금 어디까지 적용돼 있나. 읽기만 한다. 아무것도 바꾸지 않는다.
--
-- 다른 스크립트보다 먼저 돌린다. preflight 는 "적용해도 되는가" 를 묻고 이것은
-- "지금 어디인가" 를 답한다. 둘은 다른 질문이고, 2026-09-09 에 그 차이가 실제로
-- 문제가 됐다 — 진단은 022 가 없다고 했는데 운영에는 있었다. 그 상태에서 021·022 를
-- 다시 적용했다면 rollout 문서가 하지 말라고 한 바로 그 재실행이었다.
--
-- migration 이력 테이블에 기대지 않는다. 이 프로젝트에는 그런 것이 없고
-- (SCHEDULE_EDITOR_PHASE0_AUDIT.md §2), 있더라도 "파일이 실행됐다" 와 "그 안의 객체가
-- 지금 존재한다" 는 같은 말이 아니다. 카탈로그를 직접 본다.
--
-- 부분 적용을 어떻게 아는가: 뒤의 파일이 앞의 함수를 _core 로 rename 해서 감싼다.
-- 그래서 _core 의 존재가 지문이 된다. 함수 이름만으로는 부족하다 — 있어도 어느 판인지
-- 모르기 때문이다.

with procs as (
  select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
has as (
  select
    (select count(*) > 0 from procs where proname = 'authorize_google_token') as authorize_google_token,
    (select count(*) > 0 from procs where proname = 'guard_google_protocol_activation') as guard_protocol,
    (select count(*) > 0 from procs where proname = 'store_verified_google_grant') as store_grant,
    (select count(*) > 0 from procs where proname = 'bind_verified_google_calendar') as bind_cal,
    (select count(*) > 0 from procs where proname = 'bind_verified_google_calendar_core') as bind_cal_core,
    (select count(*) > 0 from procs where proname = 'commit_google_task_inbound_core') as inbound_core,
    (select count(*) > 0 from procs where proname = 'read_google_task_sync_snapshot_core') as snapshot_core,
    (select count(*) > 0 from procs where proname = 'begin_google_oauth_operation_outbound_core') as oauth_outbound_core,
    (select count(*) > 0 from procs where proname = 'read_google_task_sync_snapshot_review_core') as snapshot_review_core,
    (select count(*) > 0 from procs where proname = 'reserve_google_task_event') as reserve_event,
    (select count(*) > 0 from procs where proname = 'recover_google_task_no_write') as recover_no_write,
    (select count(*) > 0 from procs where proname = 'reserve_google_task_recurrence') as reserve_recurrence,
    (select count(*) > 0 from procs where proname = 'prune_google_task_history') as prune_history,
    (select count(*) > 0 from procs where proname = 'read_google_task_sync_snapshot_retention_core') as snapshot_retention_core
)
select step, present, case when present then 'APPLIED' else '—' end as verdict
from has, lateral (values
  -- 선행. 이것들이 없으면 아래는 읽을 필요도 없다.
  ('017  google_calendar_tokens',             to_regclass('public.google_calendar_tokens') is not null),
  ('019  google_calendar_sources',            to_regclass('public.google_calendar_sources') is not null),
  ('007  public.lists  ← 활성화의 선행 조건',  to_regclass('public.lists') is not null),

  -- 021~022. 토큰 경로. 없으면 구글 연동이 fail-closed 로 통째로 멈춘다.
  ('021  google_task_mappings',               to_regclass('public.google_task_mappings') is not null),
  ('021  google_task_sync_accounts',          to_regclass('public.google_task_sync_accounts') is not null),
  ('021  tasks.revision 컬럼',
     exists (select 1 from information_schema.columns where table_schema='public'
             and table_name='tasks' and column_name='revision')),
  ('022  authorize_google_token',             has.authorize_google_token),
  ('022  guard_google_protocol_activation',   has.guard_protocol),

  -- 023~027. 재연결 · 연결 해제 · 전용 캘린더 바인딩.
  ('023  google_legacy_mapping_imports',      to_regclass('public.google_legacy_mapping_imports') is not null),
  ('024  store_verified_google_grant',        has.store_grant),
  ('025  bind_verified_google_calendar',      has.bind_cal),
  ('026  google_verified_connection_history', to_regclass('public.google_verified_connection_history') is not null),
  ('026  bind_verified_google_calendar_core  (025 를 감쌌다)', has.bind_cal_core),
  ('027  google_oauth_operations',            to_regclass('public.google_oauth_operations') is not null),

  -- 028~034. 작업 동기화. 설치만으로는 아무것도 켜지지 않는다.
  ('028  commit_google_task_inbound_core',    has.inbound_core),
  ('028  read_google_task_sync_snapshot_core',has.snapshot_core),
  ('029  google_task_outbound_operations',    to_regclass('public.google_task_outbound_operations') is not null),
  ('029  begin_google_oauth_operation_outbound_core  (027 을 감쌌다)', has.oauth_outbound_core),
  ('030  google_task_review_receipts',        to_regclass('public.google_task_review_receipts') is not null),
  ('030  read_google_task_sync_snapshot_review_core', has.snapshot_review_core),
  ('031  reserve_google_task_event',          has.reserve_event),
  ('032  recover_google_task_no_write  ← 건너뛰어도 오류가 안 난다', has.recover_no_write),
  ('032  google_task_recovery_audit',         to_regclass('public.google_task_recovery_audit') is not null),
  ('033  reserve_google_task_recurrence',     has.reserve_recurrence),
  ('034  prune_google_task_history',          has.prune_history),
  ('034  read_google_task_sync_snapshot_retention_core  (마지막 판)', has.snapshot_retention_core)
) as t(step, present);
