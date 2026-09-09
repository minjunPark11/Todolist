-- 023~027 적용 후 검증. 읽기만 한다.
--
-- 아직 적용하지 않았다면 가드가 무엇이 빠졌는지 한국어로 알려주고 멈춘다.
-- 검사표가 나오면 모든 행이 OK 여야 한다.
--
-- 마지막 묶음이 핵심이다: 배포된 서버 함수가 부르는 RPC 가 전부 존재해야 하고,
-- 그러면서도 새 동기화는 여전히 꺼져 있어야 한다.

do $$
declare missing text := '';
begin
  if to_regclass('public.google_legacy_mapping_imports') is null then missing := missing || ' 023'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='store_verified_google_grant') then missing := missing || ' 024'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public'
                 and table_name='google_calendar_tokens' and column_name='grant_version') then missing := missing || ' 025'; end if;
  if to_regclass('public.google_verified_connection_history') is null then missing := missing || ' 026'; end if;
  if to_regclass('public.google_oauth_operations') is null then missing := missing || ' 027'; end if;
  if missing <> '' then
    raise exception e'아직 적용되지 않은 migration 이 있습니다:%\n'
      '023 → 024 → 025 → 026 → 027 순서대로 통째로 실행한 뒤 이 스크립트를 다시 돌리세요.\n'
      '순서를 지켜야 합니다. 026 은 025 가 만든 함수를 rename 해서 감싸므로 025 없이는 실패합니다.\n'
      '각 파일은 트랜잭션이라 실패하면 아무것도 남기지 않습니다. 실패했다면 그 오류를 먼저 읽으세요.', missing;
  end if;
end $$;

select check_name, expected, actual,
       case when expected = actual then 'OK' else 'STOP' end as verdict
from (values
  -- 배포된 코드가 실제로 부르는 RPC. 하나라도 없으면 그 화면이 실패한다.
  ('rpc  authorize_google_token        (token, calendar, connect)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='authorize_google_token')),
  ('rpc  begin_google_oauth_operation  (connect)',      true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='begin_google_oauth_operation')),
  ('rpc  finish_google_oauth_operation (connect)',      true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='finish_google_oauth_operation')),
  ('rpc  store_verified_google_grant   (connect)',      true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='store_verified_google_grant')),
  ('rpc  read_google_binding_snapshot  (calendar)',     true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='read_google_binding_snapshot')),
  ('rpc  bind_verified_google_calendar (calendar)',     true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='bind_verified_google_calendar')),
  ('rpc  read_google_disconnect_snapshot (disconnect)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='read_google_disconnect_snapshot')),
  ('rpc  disconnect_google_calendar    (disconnect)',   true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='disconnect_google_calendar')),

  -- 026 이 025 를 감쌌는지. _core 가 남아 있어야 정상이다.
  ('026 이 025 함수를 _core 로 보존함',                 true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='bind_verified_google_calendar_core')),

  -- 컬럼과 트리거
  ('tokens.google_subject / grant_version 생성됨',      true,
     (select count(*) from information_schema.columns where table_schema='public'
      and table_name='google_calendar_tokens'
      and column_name in ('google_subject','verified_email','identity_verified_at','grant_version')) = 4),
  ('connections.google_subject / calendar_verified_at 생성됨', true,
     (select count(*) from information_schema.columns where table_schema='public'
      and table_name='google_calendar_connections'
      and column_name in ('google_subject','calendar_verified_at')) = 2),
  ('trigger  guard_verified_google_grant (024)',        true,
     exists (select 1 from pg_trigger where tgname='guard_verified_google_grant' and not tgisinternal)),
  ('trigger  rotate_google_grant_version (025)',        true,
     exists (select 1 from pg_trigger where tgname='rotate_google_grant_version' and not tgisinternal)),
  ('trigger  archive_verified_google_connection (026)', true,
     exists (select 1 from pg_trigger where tgname='archive_verified_google_connection' and not tgisinternal)),

  -- 자격증명·이력 테이블은 클라이언트에 열리면 안 된다.
  ('google_oauth_operations RLS 켜짐',                  true,
     coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='google_oauth_operations'), false)),
  ('google_verified_connection_history RLS 켜짐',       true,
     coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='google_verified_connection_history'), false)),
  ('google_legacy_mapping_imports RLS 켜짐',            true,
     coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relname='google_legacy_mapping_imports'), false)),
  ('import_google_legacy_mappings 는 service_role 전용', true,
     has_function_privilege('service_role','public.import_google_legacy_mappings(uuid,uuid,text,uuid,jsonb)','execute')
     and not has_function_privilege('authenticated','public.import_google_legacy_mappings(uuid,uuid,text,uuid,jsonb)','execute')),
  ('store_verified_google_grant 는 service_role 전용',  true,
     has_function_privilege('service_role','public.store_verified_google_grant(uuid,text,text,text,text)','execute')
     and not has_function_privilege('authenticated','public.store_verified_google_grant(uuid,text,text,text,text)','execute')),

  -- 여전히 꺼져 있어야 한다.
  ('활성화된 계정 0개 (동기화 여전히 OFF)',             true,
     not exists (select 1 from public.google_task_sync_accounts where enabled)),
  ('프로토콜 2 로 올라간 계정 0개',                     true,
     not exists (select 1 from public.google_task_sync_accounts where minimum_google_protocol = 2))
) as t(check_name, expected, actual);
