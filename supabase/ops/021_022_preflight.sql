-- 021+022 적용 전 점검. 읽기만 한다. 아무것도 바꾸지 않는다.
--
-- 배경: 배포된 /api/google/token 은 authorize_google_token RPC 를 호출하고,
-- 이 RPC 가 없으면 access token 을 내주지 않는다(fail-closed). 그래서 022 가
-- 빠진 운영 DB 에서는 구글 연결이 통째로 멈춘다.
--
-- STOP 이 하나라도 있으면 적용하지 말고 원인을 먼저 확인한다.
-- NOTE 는 적용을 막지 않는다. 나중에 동기화를 켤 때 필요한 것을 알려줄 뿐이다.

select check_name, expected, actual,
       case when expected = actual then 'OK'
            when severity = 'INFO' then 'NOTE'
            else 'STOP' end as verdict
from (values
  -- 021 이 DDL 로 직접 건드리는 대상. 없으면 적용 자체가 실패한다.
  ('prereq  public.tasks 존재',                     true,
     to_regclass('public.tasks') is not null, 'BLOCK'),
  ('prereq  google_calendar_connections 존재',      true,
     to_regclass('public.google_calendar_connections') is not null, 'BLOCK'),
  ('prereq  google_calendar_tokens 존재 (017)',     true,
     to_regclass('public.google_calendar_tokens') is not null, 'BLOCK'),
  ('prereq  google_calendar_sources 존재 (019)',    true,
     to_regclass('public.google_calendar_sources') is not null, 'BLOCK'),

  -- 참고. 021 은 public.lists 를 PL/pgSQL 함수 본문에서만 참조하므로 이 테이블이
  -- 없어도 021·022 는 정상 적용되고 구글 연결도 복구된다. 클라이언트도 lists 를
  -- optionalRemoteTables 로 취급해 없으면 없는 대로 동기화한다(007 주석, buildSyncPlan.ts).
  -- 다만 나중에 인바운드(구글 일정 → 작업 생성)를 켜려면 이 테이블과 살아 있는
  -- inbox 행이 있어야 한다. 없으면 commit_google_task_inbound 가 INBOX_CHANGED 로 거절한다.
  ('note    public.lists 존재 (007, 지금은 불필요)', true,
     to_regclass('public.lists') is not null, 'INFO'),

  -- 021 이 만드는 것들이 하나도 없어야 한다. 일부만 있으면 부분 적용 상태이므로
  -- 021 을 통째로 재실행하면 안 된다(트랜잭션이라 실패 후 롤백되지만, 원인 확인이 먼저다).
  ('021 미적용  google_task_sync_accounts 없음',    true,
     to_regclass('public.google_task_sync_accounts') is null, 'BLOCK'),
  ('021 미적용  google_task_mappings 없음',         true,
     to_regclass('public.google_task_mappings') is null, 'BLOCK'),
  ('021 미적용  google_task_inbound_records 없음',  true,
     to_regclass('public.google_task_inbound_records') is null, 'BLOCK'),
  ('021 미적용  google_task_inbound_passes 없음',   true,
     to_regclass('public.google_task_inbound_passes') is null, 'BLOCK'),
  ('021 미적용  task_revision_tombstones 없음',     true,
     to_regclass('public.task_revision_tombstones') is null, 'BLOCK'),
  ('021 미적용  task_write_receipts 없음',          true,
     to_regclass('public.task_write_receipts') is null, 'BLOCK'),
  ('021 미적용  tasks.revision 컬럼 없음',          true,
     not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='tasks' and column_name='revision'), 'BLOCK'),
  ('021 미적용  write_task_revision 없음',          true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='write_task_revision'), 'BLOCK'),
  ('021 미적용  guard_task_revision 트리거 없음',   true,
     not exists (select 1 from pg_trigger where tgname='guard_task_revision' and not tgisinternal), 'BLOCK'),

  -- 022 가 만드는 것. 지금 장애의 직접 원인이다.
  ('022 미적용  authorize_google_token 없음',       true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='authorize_google_token'), 'BLOCK'),

  -- 021 이 service_role 에 select 를 주므로 역할이 실재해야 한다.
  ('role    service_role 존재',                     true,
     exists (select 1 from pg_roles where rolname='service_role'), 'BLOCK'),
  ('role    authenticated 존재',                    true,
     exists (select 1 from pg_roles where rolname='authenticated'), 'BLOCK')
) as t(check_name, expected, actual, severity);
