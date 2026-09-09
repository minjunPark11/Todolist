-- 021+022 적용 후 검증. 읽기만 한다.
--
-- 아직 적용하지 않았다면 아래 두 가드가 무엇이 빠졌는지 한국어로 알려주고 멈춘다.
-- 검사표가 나오면 모든 행이 OK 여야 한다. 특히 마지막 두 줄이 핵심이다:
-- 새 동기화는 여전히 꺼져 있어야 하고(enabled=false, minimum=1),
-- 지금 클라이언트가 쓰는 프로토콜 1 이 계속 허용돼야 한다.

do $$ begin
  if to_regclass('public.google_task_sync_accounts') is null then
    raise exception e'021 이 아직 적용되지 않았습니다.\n'
      '먼저 supabase/migrations/021_google_inbound_cursor.sql 을 통째로 실행하고, '
      '이어서 022_google_sync_protocol.sql 을 실행한 뒤 이 스크립트를 다시 돌리세요.\n'
      '021 을 실행했는데도 이 메시지가 보인다면 021 이 오류로 롤백된 것입니다 '
      '(021 은 트랜잭션이라 실패하면 아무것도 남기지 않습니다). 그 오류 메시지를 확인하세요.';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'authorize_google_token') then
    raise exception e'021 은 적용됐지만 022 가 아직 적용되지 않았습니다.\n'
      'supabase/migrations/022_google_sync_protocol.sql 을 실행한 뒤 이 스크립트를 다시 돌리세요.\n'
      '구글 연결을 되살리는 것은 022 입니다. 여기서 멈추면 증상은 그대로입니다.';
  end if;
end $$;

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
     coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='google_task_sync_accounts'), false)),
  ('google_task_mappings RLS 켜짐',                  true,
     coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='google_task_mappings'), false)),
  ('task_write_receipts RLS 켜짐',                   true,
     coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='task_write_receipts'), false)),
  ('tasks.revision 컬럼 생성됨',                     true,
     exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='tasks' and column_name='revision')),
  ('guard_task_revision 트리거 설치됨',              true,
     exists (select 1 from pg_trigger where tgname='guard_task_revision' and not tgisinternal)),
  ('minimum_google_protocol 기본값 1',               true,
     coalesce((select column_default like '1%' from information_schema.columns
               where table_schema='public' and table_name='google_task_sync_accounts'
                 and column_name='minimum_google_protocol'), false)),

  -- 활성화된 계정이 하나도 없어야 한다. 이번 적용의 목적은 장애 복구이지 기능 켜기가 아니다.
  ('활성화된 계정 0개 (동기화 여전히 OFF)',          true,
     not exists (select 1 from public.google_task_sync_accounts where enabled)),
  ('프로토콜 2 로 올라간 계정 0개',                  true,
     not exists (select 1 from public.google_task_sync_accounts where minimum_google_protocol = 2))
) as t(check_name, expected, actual);
