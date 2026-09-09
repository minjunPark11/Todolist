-- 프로토콜 1 서빙 은퇴를 전역으로 옮긴다.
--
-- 022 의 활성화 가드는 계정마다 네 가지를 요구했다:
--
--   (a) minimum_google_protocol = 2
--   (b) google_protocol_cutover_at 이 있음
--   (c) cutover 로부터 65분 경과
--   (d) legacy_google_token_valid_until + 5분 경과
--
-- (d) 는 정확하다. 022 는 access token 을 클라이언트에 넘기기 **전에** 그 만료 시각을
-- 기록한다 (`functions/google/token.ts` 가 인가를 두 번 부르는 이유). 그러므로 실제로
-- 나간 프로토콜 1 토큰은 하나도 빠짐없이 (d) 에 잡힌다.
--
-- (c) 는 다른 위험을 본다. 022 의 주석이 말한 그것 —
--   "Old endpoint deployments must already be retired before raising minimum."
-- 022 이전의 서버 배포는 authorize_google_token 을 아예 부르지 않으므로, 어느 계정의
-- minimum 을 올려도 그 배포는 계속 토큰을 내준다. 65분은 그런 배포가 물러나고 그것이
-- 내준 토큰까지 만료되기를 기다리는 시간이다.
--
-- **그것은 계정의 속성이 아니라 배포의 속성이다.** 계정마다 다시 세는 것은 같은 사실을
-- 사람 수만큼 반복해서 확인하는 것이고, 한 번도 연동한 적 없는 새 계정까지 65분을
-- 기다리게 만든다 — 소진할 토큰이 없는데도.
--
-- 그래서 (c) 를 전역 한 줄로 옮긴다. (a) 와 (d) 는 그대로다. 계정별 안전은 (d) 가
-- 지키고, 그것이 정확한 쪽이다.
--
-- fail-closed: 적용 직후 전역 값은 null 이고, null 이면 아무 계정도 켜지지 않는다.
-- 담당자가 "프로토콜 1 서빙이 끝났다" 를 명시적으로 선언해야 시계가 시작된다.
begin;

-- 한 줄짜리 테이블. id 는 true 만 허용하므로 두 번째 행이 생길 수 없다.
create table public.google_sync_protocol_state (
  id boolean primary key default true check (id),
  /**
   * 프로토콜 1 을 내주던 서버 배포가 물러난 시각.
   *
   * null 이면 아직 선언되지 않았다는 뜻이고, 그 동안 활성화는 전부 거절된다.
   * 값을 넣는 것은 담당자의 판단이다 — 022 이전 배포가 더는 트래픽을 받지 않는다는
   * 사실은 DB 가 알 수 없다.
   */
  legacy_serving_retired_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.google_sync_protocol_state(id) values (true);

alter table public.google_sync_protocol_state enable row level security;
-- 정책을 두지 않는다. RLS 가 켜져 있고 정책이 없으면 소유자만 읽고 쓴다.
revoke all on table public.google_sync_protocol_state from public, anon, authenticated, service_role;
-- 가드가 읽어야 하므로 함수에 security definer 로 맡긴다 (아래).

create or replace function public.google_legacy_serving_drained() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.google_sync_protocol_state
    where legacy_serving_retired_at is not null
      and legacy_serving_retired_at + interval '65 minutes' <= clock_timestamp()
  );
$$;
revoke all on function public.google_legacy_serving_drained() from public, anon, authenticated, service_role;

create or replace function public.guard_google_protocol_activation() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- 기록은 그대로 남긴다. 이 계정이 언제 프로토콜 2 로 올라갔는지는 여전히 알아야 한다.
  if new.minimum_google_protocol = 2 and (tg_op = 'INSERT' or old.minimum_google_protocol <> 2) then
    new.google_protocol_cutover_at := clock_timestamp();
  elsif new.minimum_google_protocol = 1 then
    new.google_protocol_cutover_at := null;
  end if;
  if new.enabled then
    -- (a) 이 계정이 구버전 클라이언트를 더는 받지 않는다.
    -- (d) 이 계정에 마지막으로 나간 프로토콜 1 토큰이 만료되고 5분이 지났다.
    --     정확한 검사다 — 나간 토큰은 나가기 전에 기록된다.
    -- (전역) 프로토콜 1 을 내주던 배포가 물러나고 65분이 지났다.
    --     여기서 계정별 65분을 대신한다. 배포의 속성을 계정마다 다시 세지 않는다.
    if new.minimum_google_protocol <> 2
      or coalesce(new.legacy_google_token_valid_until + interval '5 minutes', '-infinity'::timestamptz) > clock_timestamp()
      or not public.google_legacy_serving_drained() then
      raise exception 'GOOGLE_PROTOCOL_DRAIN_REQUIRED' using errcode='42501';
    end if;
  end if;
  return new;
end $$;

commit;
