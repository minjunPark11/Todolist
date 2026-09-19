-- 트리거 함수는 RPC 가 아니다 — 그런데 전부 RPC 로 열려 있었다.
--
-- Supabase 의 데이터베이스 린터(0028)가 하나를 짚었다:
--
--   "Function `public.archive_verified_google_connection()` can be executed by
--    the `anon` role as a `SECURITY DEFINER` function via
--    /rest/v1/rpc/archive_verified_google_connection."
--
-- 026 이 이 함수를 만들면서 바로 옆 형제 함수에는
-- `revoke all on function ... from public,anon,authenticated,service_role` 을
-- 적어 두고 이쪽에는 적지 않았다. 한 파일 안에서 한 줄이 빠진 것이다.
--
--
-- 실제로 무엇이 열려 있었나 [실측]
--
-- 권한은 정말 열려 있었다 (anon=t, authenticated=t). 그런데 불러보면:
--
--   0A000 / trigger functions can only be called as triggers
--
-- 트리거 함수는 트리거 밖에서 호출되지 않는다. 그러니 이것은 **권한으로는
-- 진짜, 동작으로는 닿지 않는** 구멍이었다. 부풀려 적지 않는다.
--
-- 그래도 거두는 이유는 두 가지다. 하나는 "이게 구멍인가?"를 다음 사람이
-- 다시 묻지 않게 하는 것이고, 하나는 026 이 형제 함수에 적어 둔 규칙을
-- 이 클래스 전체에 똑같이 적용하는 것이다. `public` 의 순수 트리거 함수는
-- 10개이고, 열 개 모두 같은 처지였다.
--
--
-- 거두기 전에 확인한 것 [실측]
--
--   1. 이 10개를 본문에서 부르는 다른 함수가 있는가        → 없음
--   2. 권한을 거둔 뒤에도 트리거가 발화하는가              → 발화한다
--      (앱 세션 토큰으로 UPDATE tasks · UPDATE settings ·
--       DELETE google_calendar_connections 전부 통과.
--       마지막 것이 archive_verified_google_connection 을 타는 경로다)
--   3. 047 의 자물쇠는 그대로 무는가                        → 문다
--   4. anon 이 문제의 함수를 부르면                         → 42501 permission denied
--
-- 2번이 요지다: 트리거 실행은 호출자의 EXECUTE 권한을 보지 않는다.
--
--
-- `oauth_client_id()` 는 일부러 건드리지 않는다
--
-- 처음에는 그것도 함께 거뒀다가 앱 전체의 쓰기가 멈추는 것을 봤다 [실측]:
--
--   앱 세션 토큰의 UPDATE : 막힘 ← 42501 permission denied for function oauth_client_id
--
-- 트리거 함수 자체는 권한 없이 발화하지만, 그 **본문이 부르는** 함수는
-- 호출자의 권한으로 검사된다. `reject_oauth_client_write` 가
-- `public.oauth_client_id()` 를 부르므로, 거두는 순간 모든 쓰기가 죽는다.
--
-- 열어 두어도 새어 나가는 것이 없다. 이 함수는 부르는 쪽 자신의 토큰에
-- 실린 `client_id` 를 돌려줄 뿐이고, 그것은 부르는 쪽이 이미 쥐고 있는
-- 값이다. anon 이 부르면 null 이다.
--
-- 그러니 린터가 언젠가 이것을 짚더라도 거두지 말 것. 거두려면 먼저
-- `reject_oauth_client_write` 가 그것을 부르지 않게 만들어야 한다.

revoke all on function public.archive_verified_google_connection() from public, anon, authenticated;
revoke all on function public.reject_oauth_client_write() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.guard_google_protocol_activation() from public, anon, authenticated;
revoke all on function public.guard_google_task_connection() from public, anon, authenticated;
revoke all on function public.guard_task_revision() from public, anon, authenticated;
revoke all on function public.guard_verified_google_grant() from public, anon, authenticated;
revoke all on function public.rotate_google_grant_version() from public, anon, authenticated;
revoke all on function public.google_task_operation_resolved() from public, anon, authenticated;
revoke all on function public.google_task_record_resolved() from public, anon, authenticated;

-- 자기 점검: `public` 에 아직 호출 가능하게 열려 있는 트리거 함수가 남았는가.
-- 위 목록을 손으로 적었으므로, 목록이 실제 스키마와 어긋나면 여기서 걸린다.
do $$
declare still_open text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into still_open
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype = 'pg_catalog.trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  if still_open is not null then
    raise exception 'These trigger functions are still exposed as RPCs: %', still_open;
  end if;
end
$$;
