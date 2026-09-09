-- 023~027 적용 전 점검. 읽기만 한다. 아무것도 바꾸지 않는다.
--
-- 배경: 배포된 v0.22.15 서버 함수는 이 다섯 개가 만드는 RPC 를 부른다.
--   /api/google/connect     → begin_google_oauth_operation(027) → store_verified_google_grant(024)
--   /api/google/disconnect  → read_google_disconnect_snapshot, disconnect_google_calendar (026)
--   /api/google/calendar    → read_google_binding_snapshot, bind_verified_google_calendar (025/026)
-- 지금은 없으므로 재연결·연결 해제·전용 캘린더 바인딩이 모두 실패한다.
-- 021·022 로 토큰 경로만 살아난 상태다.
--
-- 이 다섯 개는 아무것도 활성화하지 않는다. 계정은 계속 비활성이고 프로토콜은 1 그대로다.
--
-- STOP 이 하나라도 있으면 적용하지 말고 원인을 먼저 확인한다.
-- NOTE 는 적용을 막지 않는다.
--
-- 적용 순서는 강제된다: 023 → 024 → 025 → 026 → 027.
-- 026 은 025 가 만든 bind_verified_google_calendar 를 _core 로 rename 한 뒤 감싼다.

select check_name, expected, actual,
       case when expected = actual then 'OK'
            when severity = 'INFO' then 'NOTE'
            else 'STOP' end as verdict
from (values
  -- 선행: 021·022 가 이미 적용돼 있어야 한다.
  ('prereq  021 적용됨 (google_task_sync_accounts)', true,
     to_regclass('public.google_task_sync_accounts') is not null, 'BLOCK'),
  ('prereq  022 적용됨 (authorize_google_token)',    true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='authorize_google_token'), 'BLOCK'),
  ('prereq  google_calendar_tokens 존재 (017)',      true,
     to_regclass('public.google_calendar_tokens') is not null, 'BLOCK'),
  ('prereq  google_calendar_connections 존재 (017)', true,
     to_regclass('public.google_calendar_connections') is not null, 'BLOCK'),

  -- 023~027 이 하나도 적용되지 않았어야 한다. 일부만 있으면 부분 적용이므로 재실행하면 안 된다.
  ('023 미적용  google_legacy_mapping_imports 없음', true,
     to_regclass('public.google_legacy_mapping_imports') is null, 'BLOCK'),
  ('024 미적용  store_verified_google_grant 없음',   true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='store_verified_google_grant'), 'BLOCK'),
  ('024 미적용  google_calendar_tokens.google_subject 없음', true,
     not exists (select 1 from information_schema.columns where table_schema='public'
                 and table_name='google_calendar_tokens' and column_name='google_subject'), 'BLOCK'),
  ('025 미적용  google_calendar_tokens.grant_version 없음', true,
     not exists (select 1 from information_schema.columns where table_schema='public'
                 and table_name='google_calendar_tokens' and column_name='grant_version'), 'BLOCK'),
  ('025 미적용  bind_verified_google_calendar 없음',  true,
     not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='bind_verified_google_calendar'), 'BLOCK'),
  ('026 미적용  google_verified_connection_history 없음', true,
     to_regclass('public.google_verified_connection_history') is null, 'BLOCK'),
  ('027 미적용  google_oauth_operations 없음',        true,
     to_regclass('public.google_oauth_operations') is null, 'BLOCK'),

  -- 활성화된 계정이 있으면 안 된다. 이 적용은 연결 관리 복구이지 기능 켜기가 아니다.
  ('활성화된 계정 0개',                              true,
     not exists (select 1 from public.google_task_sync_accounts where enabled), 'BLOCK'),
  ('프로토콜 2 로 올라간 계정 0개',                  true,
     not exists (select 1 from public.google_task_sync_accounts where minimum_google_protocol = 2), 'BLOCK'),

  -- 참고. 나중에 인바운드를 켤 때의 선행 조건이며 023~027 과는 무관하다.
  ('note    public.lists 존재 (007, 지금은 불필요)', true,
     to_regclass('public.lists') is not null, 'INFO')
) as t(check_name, expected, actual, severity);
