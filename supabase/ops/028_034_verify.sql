-- 028~034 적용 후 검증. 읽기만 한다.
--
-- 아직 적용하지 않았다면 가드가 무엇이 빠졌는지 한국어로 알려주고 멈춘다.
-- 검사표가 나오면 모든 행이 OK 여야 한다.
--
-- 두 가지가 핵심이다.
--
-- 1. 032 는 아무도 의존하지 않는다. 빠뜨려도 나머지가 오류 없이 적용되므로,
--    존재 검사를 여기서 하지 않으면 관리자 복구 경로가 없는 것을 아무도 모른다.
-- 2. 뒤의 파일이 앞의 함수를 _core 로 rename 해서 감싼다. 그래서 함수가 "있다" 는 것만으로는
--    부족하다 — 마지막으로 감싼 판이 걸려 있어야 한다. _core 사슬이 그것을 말한다:
--
--      read_google_task_sync_snapshot 은 021 이 만들고 028 → 030 → 034 가 세 번 감싼다.
--        028: read_google_task_sync_snapshot_core
--        030: read_google_task_sync_snapshot_review_core
--        034: read_google_task_sync_snapshot_retention_core
--      commit_google_task_inbound 은 021 이 만들고 028 → 029 가 두 번 감싼다.
--        028: commit_google_task_inbound_core
--        029: commit_google_task_inbound_review_core
--      begin_google_oauth_operation 은 027 이 만들고 029 가 감싼다.
--        029: begin_google_oauth_operation_outbound_core
--
--    셋 중 마지막 것이 없으면 그 단계에서 멈춘 것이다.
--
-- 마지막 묶음은 이 적용이 아무것도 켜지 않았음을 확인한다.

do $$
declare missing text := '';
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='commit_google_task_inbound_core') then missing := missing || ' 028'; end if;
  if to_regclass('public.google_task_outbound_operations') is null then missing := missing || ' 029'; end if;
  if to_regclass('public.google_task_review_receipts') is null then missing := missing || ' 030'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='reserve_google_task_event') then missing := missing || ' 031'; end if;
  if to_regclass('public.google_task_recovery_audit') is null then missing := missing || ' 032'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='reserve_google_task_recurrence') then missing := missing || ' 033'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='prune_google_task_history') then missing := missing || ' 034'; end if;
  if missing <> '' then
    raise exception e'아직 적용되지 않은 migration 이 있습니다:%\n'
      '028 → 029 → 030 → 031 → 032 → 033 → 034 순서대로 통째로 실행한 뒤 이 스크립트를 다시 돌리세요.\n'
      '순서를 지켜야 합니다. 뒤의 파일이 앞의 함수를 _core 로 rename 해서 감싸므로 건너뛰면 실패합니다.\n'
      '032 만은 예외로 아무 오류 없이 건너뛰어집니다. 그래서 이 검사가 필요합니다.\n'
      '023~027 이 먼저입니다. 029 가 027 의 begin_google_oauth_operation 을 감쌉니다.\n'
      '각 파일은 트랜잭션이라 실패하면 아무것도 남기지 않습니다. 실패했다면 그 오류를 먼저 읽으세요.', missing;
  end if;
end $$;

select check_name, expected, actual,
       case when expected = actual then 'OK' else 'STOP' end as verdict
from (values
  -- 인바운드 실행 (028)
  ('028  commit_google_task_inbound_core', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='commit_google_task_inbound_core')),
  ('028  read_google_task_sync_snapshot_core', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='read_google_task_sync_snapshot_core')),

  -- 아웃바운드 예약/실행 (029)
  ('029  google_task_outbound_operations 테이블', true,
     to_regclass('public.google_task_outbound_operations') is not null),
  ('029  reserve_google_task_outbound', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='reserve_google_task_outbound')),
  ('029  begin_google_task_outbound', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='begin_google_task_outbound')),
  ('029  finish_google_task_outbound', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='finish_google_task_outbound')),
  ('029  cancel_google_task_outbound', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='cancel_google_task_outbound')),
  ('029  begin_google_oauth_operation_outbound_core (027 을 감쌌다)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='begin_google_oauth_operation_outbound_core')),
  ('029  guard_google_pending_scope 트리거', true,
     exists (select 1 from pg_trigger where tgname='guard_google_pending_scope' and not tgisinternal)),

  -- 검토 (030)
  ('030  google_task_review_receipts 테이블', true,
     to_regclass('public.google_task_review_receipts') is not null),
  ('030  resolve_google_task_review', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='resolve_google_task_review')),
  ('030  read_google_task_sync_snapshot_review_core', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='read_google_task_sync_snapshot_review_core')),

  -- 이벤트 생명주기 (031)
  ('031  reserve_google_task_event', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='reserve_google_task_event')),
  ('031  begin_google_task_patch', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='begin_google_task_patch')),
  ('031  finish_google_task_patch', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='finish_google_task_patch')),

  -- 관리자 복구 (032). 아무도 의존하지 않으므로 여기서만 잡힌다.
  ('032  google_task_recovery_audit 테이블', true,
     to_regclass('public.google_task_recovery_audit') is not null),
  ('032  recover_google_task_no_write', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='recover_google_task_no_write')),

  -- 반복 (033)
  ('033  reserve_google_task_recurrence', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='reserve_google_task_recurrence')),
  ('033  google_task_repeat_fields', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='google_task_repeat_fields')),

  -- 보관 정리 (034)
  ('034  prune_google_task_history', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='prune_google_task_history')),
  ('034  prune_all_google_task_history', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='prune_all_google_task_history')),
  ('034  read_google_task_sync_snapshot_retention_core (마지막 판)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='read_google_task_sync_snapshot_retention_core')),
  ('034  google_task_receipt_digest', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='google_task_receipt_digest')),

  -- 새 테이블은 RLS 가 켜져 있어야 한다.
  ('rls  google_task_outbound_operations', true,
     (select relrowsecurity from pg_class where oid = to_regclass('public.google_task_outbound_operations'))),
  ('rls  google_task_review_receipts', true,
     (select relrowsecurity from pg_class where oid = to_regclass('public.google_task_review_receipts'))),
  ('rls  google_task_recovery_audit', true,
     (select relrowsecurity from pg_class where oid = to_regclass('public.google_task_recovery_audit'))),

  -- 그리고 아무것도 켜지지 않았어야 한다.
  ('여전히 꺼짐  활성화된 계정 0개', true,
     not exists (select 1 from public.google_task_sync_accounts where enabled)),
  ('여전히 꺼짐  프로토콜 2 계정 0개', true,
     not exists (select 1 from public.google_task_sync_accounts where minimum_google_protocol = 2)),
  ('여전히 꺼짐  enabled 기본값 false', true,
     (select column_default = 'false' from information_schema.columns
      where table_schema='public' and table_name='google_task_sync_accounts' and column_name='enabled'))
) as t(check_name, expected, actual);
