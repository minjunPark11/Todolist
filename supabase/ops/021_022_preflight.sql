-- 021+022 적용 전 점검. 읽기만 한다. 아무것도 바꾸지 않는다.
--
-- 배경: 배포된 /api/google/token 은 authorize_google_token RPC 를 호출하고,
-- 이 RPC 가 없으면 access token 을 내주지 않는다(fail-closed). 그래서 022 가
-- 빠진 운영 DB 에서는 구글 연결이 통째로 멈춘다.
--
-- 모든 행이 OK 여야 021, 022 를 순서대로 적용한다.
-- STOP 이 하나라도 있으면 적용하지 말고 원인을 먼저 확인한다.

select check_name, expected, actual,
       case when expected = actual then 'OK' else 'STOP' end as verdict
from (values
  -- 선행 마이그레이션(001~020)이 적용돼 있어야 021 이 참조할 대상이 있다.
  ('prereq  public.tasks 존재',                     true,
     to_regclass('public.tasks') is not null),
  ('prereq  public.lists 존재',                     true,
     to_regclass('public.lists') is not null),
  ('prereq  google_calendar_connections 존재',      true,
     to_regclass('public.google_calendar_connections') is not null),
  ('prereq  google_calendar_tokens 존재',           true,
     to_regclass('public.google_calendar_tokens') is not null),
  ('prereq  google_calendar_sources 존재 (019)',    true,
     to_regclass('public.google_calendar_sources') is not null),

  -- 021 이 만드는 것들이 하나도 없어야 한다. 일부만 있으면 부분 적용 상태이므로
  -- 021 을 통째로 재실행하면 안 된다(트랜잭션이라 실패 후 롤백되지만, 원인 확인이 먼저다).
  ('021 미적용  google_task_sync_accounts 없음',    true,
     to_regclass('public.google_task_sync_accounts') is null),
  ('021 미적용  google_task_mappings 없음',         true,
     to_regclass('public.google_task_mappings') is null),
  ('021 미적용  google_task_inbound_records 없음',  true,
     to_regclass('public.google_task_inbound_records') is null),
  ('021 미적용  google_task_inbound_passes 없음',   true,
     to_regclass('public.google_task_inbound_passes') is null),
  ('021 미적용  task_revision_tombstones 없음',     true,
     to_regclass('public.task_revision_tombstones') is null),
  ('021 미적용  task_write_receipts 없음',          true,
     to_regclass('public.task_write_receipts') is null),
  ('021 미적용  tasks.revision 컬럼 없음',          true,
     not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='tasks' and column_name='revision')),
  ('021 미적용  write_task_revision 없음',          true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='write_task_revision')),
  ('021 미적용  guard_task_revision 트리거 없음',   true,
     not exists (select 1 from pg_trigger where tgname='guard_task_revision' and not tgisinternal)),

  -- 022 가 만드는 것. 지금 장애의 직접 원인이다.
  ('022 미적용  authorize_google_token 없음',       true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='authorize_google_token')),

  -- 021 이 service_role 에 select 를 주므로 역할이 실재해야 한다.
  ('role    service_role 존재',                     true,
     exists (select 1 from pg_roles where rolname='service_role')),
  ('role    authenticated 존재',                    true,
     exists (select 1 from pg_roles where rolname='authenticated'))
) as t(check_name, expected, actual);
