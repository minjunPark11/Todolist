-- 두 번째 자물쇠: OAuth 로 발급된 토큰은 읽기만 한다.
--
-- registry.ts 는 오랫동안 "쓰기 도구를 tools/list 에서 빼는 것은 안전장치가
-- 아니다. OAuth 클라이언트의 쓰기를 데이터베이스가 거절하는 것이 안전장치다.
-- 자물쇠가 둘이다"라고 적고 있었다. 그런 정책은 없었다 [실측, pg_policies]:
--
--   public 스키마의 쓰기 정책        45개 (표 23개)
--   그중 client_id 를 보는 것         0개
--   그중 auth.jwt() 를 보는 것        0개
--
-- 그래서 자물쇠는 하나뿐이었다. 이 마이그레이션이 두 번째를 채운다.
--
--
-- 왜 이것이 필요한가
--
-- 커넥터가 쥔 토큰은 범위가 좁혀지지 않은 사용자 토큰이다. Supabase 문서가
-- 그대로 말한다:
--
--   "All OAuth access tokens have full access to user data (same as regular
--    session tokens), with the addition of the `client_id` claim. Use Row
--    Level Security policies with the `client_id` claim to control which data
--    each OAuth client can access."
--
-- 즉 커넥터는 이 서버를 거치지 않고 PostgREST 에 직접 대고 지울 수 있었다.
-- MCP 서버가 쓰기 도구를 하나도 등록하지 않는다는 사실은 그 길과 아무
-- 상관이 없다.
--
--
-- 왜 정책(RLS)이 아니라 트리거인가
--
-- 문서가 권하는 대로 정책에 `client_id` 조건을 붙이면 표에 직접 쓰는 길은
-- 막힌다. 그런데 이 스키마에는 `security definer` 함수가 57개 있고 전부
-- 소유자가 `postgres`, 즉 `rolbypassrls = true` 다. 그 함수들을 통과하는
-- 쓰기에는 RLS 가 애초에 적용되지 않는다 — PostgREST 는 그 함수들을 RPC 로
-- 노출한다. 정책만 고치면 자물쇠에 뚫린 구멍을 그대로 둔 채 채웠다고
-- 믿게 된다.
--
-- 트리거는 RLS 와 무관하게 발화하므로 두 길을 한 번에 막는다. 실측으로
-- 확인했다 (임시 표 + 임시 security definer 함수, 트랜잭션 롤백):
--
--   1. 클레임 없음 (마이그레이션·크론)        통과
--   2. 앱 자신의 세션 토큰                     통과
--   3. service_role 키 (구글 동기화가 쓰는 길) 통과
--   4. OAuth 토큰, 표에 직접 쓰기              막힘
--   5. OAuth 토큰, security definer RPC 우회   막힘   ← 정책으로는 못 막던 길
--   6. OAuth 토큰, DELETE                      막힘
--
-- 행 단위가 아니라 **문장 단위** 트리거인 것은 값이 아니라 토큰을 보고
-- 판단하기 때문이다. 구글 동기화가 수천 행을 한 문장으로 쓸 때 행마다
-- 클레임을 파싱할 이유가 없다.
--
--
-- V2 가 쓰기 도구를 들일 때
--
-- 이 자물쇠는 그때 걸린다. 그것이 의도다 — 쓰기 도구를 켜는 일은 여기까지
-- 와서 무엇을 열어줄지 정하는 일이어야 하고, 도구 목록에 한 줄 더하는
-- 일이어서는 안 된다.

-- 토큰이 OAuth 클라이언트의 것이면 그 클라이언트 id, 아니면 null.
--
-- `auth.jwt()` 를 다시 만들지 않고 그대로 쓴다. 클레임을 어디서 읽는지를
-- 두 곳에 적어두면 한 곳이 어긋나고, 그 어긋남이 곧 열린 자물쇠다.
create or replace function public.oauth_client_id()
returns text
language sql
stable
-- 경로를 못 박는다. Supabase 의 데이터베이스 린터가 그렇지 않은 함수를
-- `function_search_path_mutable` 로 잡는데, 자물쇠 노릇을 하는 함수야말로
-- 어느 스키마의 `oauth_client_id` 가 불릴지 모호해서는 안 된다.
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'client_id', '');
$$;

comment on function public.oauth_client_id() is
  'OAuth 로 발급된 토큰의 client_id. 앱 자신의 세션 토큰과 service_role 키에는 없으므로 null 이다.';

create or replace function public.reject_oauth_client_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.oauth_client_id() is not null then
    -- 42501 = insufficient_privilege. PostgREST 가 403 으로 옮긴다.
    --
    -- 메시지가 길어도 좋다: 이것을 보는 사람은 "왜 내 커넥터가 못 쓰지"를
    -- 알아내려는 사람이고, 한 번 읽어서 답이 나와야 한다.
    raise exception
      using
        errcode = '42501',
        message = format(
          'A connected application has read-only access to this account. It cannot %s %I.',
          lower(tg_op), tg_table_name),
        detail = format('OAuth client %s.', public.oauth_client_id()),
        hint = 'Make the change in the app itself. Connected applications may read, not write.';
  end if;
  -- 문장 단위 트리거의 반환값은 무시된다.
  return null;
end;
$$;

comment on function public.reject_oauth_client_write() is
  'public 의 모든 표에 붙는 두 번째 자물쇠. 첫 번째는 MCP 서버가 쓰기 도구를 등록하지 않는 것이다.';

-- public 의 **모든** 표에 붙인다. 목록을 손으로 적으면 다음에 표가 하나
-- 늘 때 조용히 빠지고, 빠진 표는 자물쇠가 없는 표다.
do $$
declare
  t record;
  uncovered text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format('drop trigger if exists reject_oauth_client_write on public.%I', t.relname);
    execute format(
      'create trigger reject_oauth_client_write
         before insert or update or delete or truncate on public.%I
         for each statement execute function public.reject_oauth_client_write()',
      t.relname);
  end loop;

  -- 자기 점검: 위 루프가 실제로 한 표도 빠뜨리지 않았는지 다시 센다.
  select string_agg(c.relname, ', ' order by c.relname) into uncovered
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (
      select 1 from pg_trigger g
      where g.tgrelid = c.oid and g.tgname = 'reject_oauth_client_write' and not g.tgisinternal
    );

  if uncovered is not null then
    raise exception 'These tables have no write lock: %', uncovered;
  end if;
end
$$;
