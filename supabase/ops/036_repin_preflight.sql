-- 036 적용 전 점검, 그리고 시간대를 다시 고정하기 전 점검. 읽기만 한다.
--
-- 036 은 025/026 이 거부하던 한 경우 — 같은 주체, 같은 캘린더, 시간대만 다름 —
-- 에 제자리 재고정 경로를 연다. 적용 자체는 아무 동작도 바꾸지 않는다. 재고정은
-- 앱에서 구글을 다시 연결할 때 일어나고, 그때 앱의 시간대 설정값이 넘어간다.
--
-- STOP 이 하나라도 있으면 재고정을 시도해도 거절된다. 거절 사유는 그대로
-- 돌아오지만(reason), 어차피 먼저 치워야 하는 것들이므로 여기서 미리 본다.

-- 지금 무엇으로 고정돼 있나. 이 값이 구글 화면에서 읽는 시간과 다르면 그 차이가
-- 곧 들어오는 일정이 어긋나는 시간이다.
select
  c.account_email as "계정",
  c.calendar_id as "캘린더",
  c.sync_timezone as "동기화 시간대",
  to_char(clock_timestamp() at time zone c.sync_timezone, 'YYYY-MM-DD HH24:MI') as "그 시간대의 지금",
  to_char(clock_timestamp() at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as "서울의 지금",
  c.sync_token is not null as "증분 커서 있음",
  c.connection_generation as "세대"
from public.google_calendar_connections c;

select check_name, expected, actual,
       case when expected = actual then 'OK' else 'STOP' end as verdict
from (values
  ('적용  036 적용됨 (bind_verified_google_calendar_history)', true,
     exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='bind_verified_google_calendar_history')),

  -- 아래 넷은 036 이 재고정을 거절하는 조건 그대로다.
  ('재고정  진행 중인 동기화 패스 없음 (lease)', true,
     not exists (select 1 from public.google_calendar_connections
                 where coalesce(lease_until,'-infinity'::timestamptz) > clock_timestamp())),
  ('재고정  진행 중인 아웃바운드 0개', true,
     not exists (select 1 from public.google_task_outbound_operations
                 where state in ('reserved','running','uncertain'))),
  ('재고정  미해결 인바운드 검토 0개', true,
     not exists (select 1 from public.google_task_inbound_records r
                 join public.google_calendar_connections c
                   on c.user_id = r.user_id and c.connection_generation = r.generation
                 where r.resolved_at is null)),
  ('재고정  검증된 연결이 있음 (없으면 재고정이 아니라 최초 바인딩)', true,
     exists (select 1 from public.google_calendar_connections
             where google_subject is not null and calendar_verified_at is not null and sync_timezone is not null))
) as t(check_name, expected, actual);
