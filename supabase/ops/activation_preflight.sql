-- 계정 활성화 전 점검. 읽기만 한다. 아무것도 바꾸지 않는다.
--
-- 021~034 를 전부 적용한 뒤, 계정을 실제로 켜기 전에 돌린다.
-- 적용과 활성화는 다른 일이다. 적용은 구조만 설치하고 아무 동작도 바꾸지 않는다.
-- 이 스크립트가 보는 것은 "지금 켜면 무엇이 깨지는가" 다.
--
-- 사용법: 맨 아래 set 한 줄의 uuid 만 바꾸고 파일을 통째로 실행한다.
-- 바꾸지 않으면 가드가 멈춘다 — placeholder 로도 그럴듯한 표가 나오기 때문이다.
-- STOP 이 하나라도 있으면 켜지 않는다.

-- 007 이 없으면 아래 검사표 자체가 파싱되지 않는다. public.lists 를 직접 읽는 행이
-- 있고, PostgreSQL 은 to_regclass 로 감싸도 문장 전체를 먼저 계획하기 때문이다.
-- 그래서 여기서 먼저 멈추고, 검사표가 삼켜버릴 사실을 대신 말한다.
do $$
begin
  if to_regclass('public.lists') is null then
    raise exception e'public.lists 가 없습니다 (007 미적용).\n'
      '이것은 활성화의 하드 선행 조건입니다. 007 을 적용하고 이 계정의 inbox 행을\n'
      '확보한 뒤 다시 실행하세요.\n'
      '\n'
      '021 의 commit_google_task_inbound 은 public.lists 에 살아 있는 inbox 행을\n'
      '요구합니다 (021 line 312). PL/pgSQL 본문은 함수를 만들 때 테이블을 확인하지\n'
      '않으므로 007 없이도 028~034 는 전부 적용됩니다. 갈리는 것은 실행 시점입니다:\n'
      '  lists 없음         → 42P01 relation "public.lists" does not exist  ← 하드 오류\n'
      '  lists 있고 행 없음 → 40001 INBOX_CHANGED                           ← 설계된 거절\n'
      '40001 은 다시 시도되는 부류이고 42P01 은 그렇지 않습니다. 007 없이 켜면 구글에서\n'
      '온 새 일정을 작업으로 승격할 때마다 인바운드 패스가 통째로 실패합니다.';
  end if;
end $$;

-- ↓↓↓ 바꿀 곳은 여기 하나다 ↓↓↓
set ff.target_user = '00000000-0000-0000-0000-000000000000';

-- 두 번째 가드: 대상 계정이 실재하는지.
--
-- uuid 를 바꾸지 않고 돌리면 계정별 검사가 전부 false 가 되고, 그 와중에 "진행 중인 작업
-- 0개" 같은 줄은 OK 로 뜬다 — 없는 계정에는 행도 없기 때문이다. 그럴듯한 표가 나오고
-- 아무도 틀렸다는 것을 모른다. 그래서 검사표 앞에서 멈춘다.
do $$
declare target uuid;
begin
  begin
    target := nullif(current_setting('ff.target_user', true), '')::uuid;
  exception when others then
    raise exception '대상 계정 uuid 가 uuid 형식이 아닙니다: %', current_setting('ff.target_user', true);
  end;
  if target is null or target = '00000000-0000-0000-0000-000000000000' then
    raise exception e'대상 계정 uuid 를 바꾸지 않았습니다.\n'
      '이 파일 위쪽의 set ff.target_user 한 줄을 켜려는 계정의 것으로 바꾸고 다시 실행하세요.\n'
      '계정 uuid 는 다음으로 찾습니다:\n'
      '  select id, email from auth.users order by created_at;';
  end if;
  if not exists (select 1 from auth.users where id = target) then
    raise exception e'auth.users 에 % 가 없습니다.\n'
      '오타이거나 다른 프로젝트의 uuid 입니다. 위 쿼리로 다시 확인하세요.', target;
  end if;
end $$;

with target as (
  select current_setting('ff.target_user')::uuid as user_id
)
select check_name, expected, actual,
       case when expected = actual then 'OK'
            when severity = 'INFO' then 'NOTE'
            else 'STOP' end as verdict
from (values
  -- 1. 007 — 인바운드 승격의 선행 조건. 테이블 존재는 위 가드가 이미 확인했다.
  --    남은 것은 이 계정에 살아 있는 inbox 행이 정확히 하나 있는지다.
  ('007  이 계정의 살아 있는 inbox 행이 정확히 하나', true,
     (select count(*) = 1 from public.lists
      where user_id = (select user_id from target)
        and data->>'kind' = 'inbox'
        and coalesce(data->>'archivedAt','') = ''
        and coalesce(data->>'deletedAt','') = ''), 'BLOCK'),

  -- 2. 021~034 가 전부 적용돼 있어야 한다. 마지막 _core 사슬로 확인한다.
  ('적용  034 까지 (read_google_task_sync_snapshot_retention_core)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='read_google_task_sync_snapshot_retention_core'), 'BLOCK'),
  ('적용  032 관리자 복구 (recover_google_task_no_write)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='recover_google_task_no_write'), 'BLOCK'),

  -- 3. 프로토콜 소진. 022 의 guard_google_protocol_activation 이 강제하는 조건 그대로다
  --    (022 line 21~28). 맞지 않으면 enabled=true UPDATE 가
  --    GOOGLE_PROTOCOL_DRAIN_REQUIRED 로 거절된다. 여기서 미리 읽어 이유를 분리한다.
  ('drain 이 계정의 minimum_google_protocol = 2', true,
     coalesce((select minimum_google_protocol = 2 from public.google_task_sync_accounts
               where user_id = (select user_id from target)), false), 'BLOCK'),
  ('drain cutover 로부터 65분 경과', true,
     coalesce((select google_protocol_cutover_at is not null
                      and google_protocol_cutover_at + interval '65 minutes' <= clock_timestamp()
               from public.google_task_sync_accounts
               where user_id = (select user_id from target)), false), 'BLOCK'),
  ('drain 구버전 토큰 만료 + 5분 경과', true,
     coalesce((select coalesce(legacy_google_token_valid_until + interval '5 minutes',
                               '-infinity'::timestamptz) <= clock_timestamp()
               from public.google_task_sync_accounts
               where user_id = (select user_id from target)), false), 'BLOCK'),

  -- 4. 연결이 검증된 상태여야 한다. 미검증 grant 로는 재연결이 identity-mismatch 로 거절된다.
  ('연결  검증된 google_subject 존재', true,
     coalesce((select google_subject is not null and google_subject <> ''
               from public.google_calendar_tokens
               where user_id = (select user_id from target)), false), 'BLOCK'),
  ('연결  전용 캘린더가 검증되어 바인딩됨', true,
     exists (select 1 from public.google_calendar_connections
             where user_id = (select user_id from target)
               and coalesce(calendar_id,'') <> ''
               and calendar_verified_at is not null), 'BLOCK'),

  -- 5. 진행 중인 쓰기가 없어야 한다. pending 은 연결 해제/세대 변경으로 우회하지 말고
  --    먼저 복구한다 (rollout 전환 순서 5).
  ('대기  진행 중인 아웃바운드 0개 (reserved/running/uncertain)', true,
     not exists (select 1 from public.google_task_outbound_operations
                 where user_id = (select user_id from target)
                   and state in ('reserved','running','uncertain')), 'BLOCK'),
  ('대기  미해결 인바운드 검토 0개', true,
     not exists (select 1 from public.google_task_inbound_records
                 where user_id = (select user_id from target)
                   and resolved_at is null), 'BLOCK'),

  -- 6. 참고. pg_cron 이 없으면 비접속 계정의 비교 기록이 쌓인다. 034 는 앱 snapshot 조회
  --    시 해당 계정만 정리한다. 매일 전체를 정리하려면 Cron 활성화 후
  --    select public.prune_all_google_task_history() 를 일일 작업으로 건다.
  ('note  pg_cron 설치됨 (없으면 접속 계정만 자동 정리)', true,
     exists (select 1 from pg_extension where extname = 'pg_cron'), 'INFO')
) as t(check_name, expected, actual, severity);
