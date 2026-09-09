-- 021+022 적용 후 검증. 읽기만 한다.
--
-- 모든 행이 OK 여야 한다. 특히 마지막 두 줄이 핵심이다:
-- 새 동기화는 여전히 꺼져 있어야 하고(enabled=false, minimum=1),
-- 지금 클라이언트가 쓰는 프로토콜 1 이 계속 허용돼야 한다.

select check_name, expected, actual,
       case when expected = actual then 'OK' else 'STOP' end as verdict
from (values
  ('authorize_google_token 생성됨',                  true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='authorize_google_token')),
  ('authorize_google_token 은 service_role 전용',    true,
     has_function_privilege('service_role','public.authorize_google_token(uuid,integer,integer)','execute')
     and not has_function_privilege('authenticated','public.authorize_google_token(uuid,integer,integer)','execute')
     and not has_function_privilege('anon','public.authorize_google_token(uuid,integer,integer)','execute')),
  ('google_task_sync_accounts 생성됨',               true,
     to_regclass('public.google_task_sync_accounts') is not null),
  ('google_task_sync_accounts RLS 켜짐',             true,
     (select relrowsecurity from pg_class where oid='public.google_task_sync_accounts'::regclass)),
  ('google_task_mappings RLS 켜짐',                  true,
     (select relrowsecurity from pg_class where oid='public.google_task_mappings'::regclass)),
  ('task_write_receipts RLS 켜짐',                   true,
     (select relrowsecurity from pg_class where oid='public.task_write_receipts'::regclass)),
  ('tasks.revision 컬럼 생성됨',                     true,
     exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='tasks' and column_name='revision')),
  ('guard_task_revision 트리거 설치됨',              true,
     exists (select 1 from pg_trigger where tgname='guard_task_revision' and not tgisinternal)),
  ('minimum_google_protocol 기본값 1',               true,
     (select column_default like '1%' from information_schema.columns
      where table_schema='public' and table_name='google_task_sync_accounts'
        and column_name='minimum_google_protocol')),

  -- 활성화된 계정이 하나도 없어야 한다. 이번 적용의 목적은 장애 복구이지 기능 켜기가 아니다.
  ('활성화된 계정 0개 (동기화 여전히 OFF)',          true,
     not exists (select 1 from public.google_task_sync_accounts where enabled)),
  ('프로토콜 2 로 올라간 계정 0개',                  true,
     not exists (select 1 from public.google_task_sync_accounts where minimum_google_protocol = 2))
) as t(check_name, expected, actual);
