-- 동기화 시간대를 다시 고정할 수 있게 한다.
--
-- 025 는 이미 검증된 연결에 다른 시간대로 바인딩하는 것을 거부했고 (025 line 57),
-- 026 은 연결 해제 후 재연결에서도 옛 시간대와 다르면 거부했다 (026 line 42).
-- 둘 다 옳은 거절이다. 매핑의 `base` 는 벽시계 필드이고 (021 line 341), 시간대가
-- 바뀌면 그 계정의 모든 매핑의 base 가 동시에 의미를 잃는다. 몰래 갈아끼우면
-- 전 항목이 조용히 어긋난다.
--
-- 없던 것은 **되돌리는 문**이다. 바인딩 시점의 시간대는 사람이 고른 값이 아니라
-- 구글의 캘린더 속성에서 읽어온 값이고 (`calendarBinding.ts` line 35), 그것이
-- 그 사람이 시계를 읽는 시간대와 다르면 — 다른 지역에서 만들어진 캘린더, VPN을
-- 통해 만든 캘린더 — 들어오는 모든 일정이 그 차이만큼 어긋난 채로 저장된다.
-- 그리고 지금은 고칠 방법이 없다. 그 캘린더는 그 시간대에 영구히 묶인다.
--
-- 그래서 거절을 유지하되 통제된 경로를 하나 연다: 같은 주체, 같은 캘린더,
-- 같은 세대이고 시간대만 다르면 **제자리에서** 다시 고정한다.
--
-- 제자리인 것이 핵심이다. 연결 해제/재연결은 새 세대를 시작하고, 새 세대에서는
-- 이벤트가 매핑 없는 것으로 보여 `create` 가 된다 — 같은 일정이 작업으로 한 번 더
-- 생긴다. 세대와 매핑을 유지하면 `taskInboundPlan.ts` line 117 이 걸린다:
--
--     로컬 == base 이면  → update, 새 시간대로 다시 계산한 시각으로 덮어쓴다
--     로컬 <> base 이면  → conflict, 사람이 본다
--
-- 즉 가져온 뒤 손대지 않은 작업은 저절로 교정되고, 손댄 것만 검토로 간다.
-- 그러려면 전체를 다시 읽어야 하므로 sync_token 을 비운다. 증분 읽기는 바뀐
-- 것만 가져오는데, 여기서 바뀐 것은 구글이 아니라 우리가 읽는 방식이다.
begin;

-- 026 의 래퍼가 이력 이관 담당이 된다. _core 사슬의 다음 칸.
alter function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text)
  rename to bind_verified_google_calendar_history;
revoke all on function public.bind_verified_google_calendar_history(uuid,text,text,uuid,uuid,text,text,text)
  from public,anon,authenticated,service_role;

create function public.bind_verified_google_calendar(p_user_id uuid,p_refresh_token text,p_subject text,
  p_grant_version uuid,p_expected_generation uuid,p_calendar_id text,p_timezone text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.google_calendar_connections%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,21));
  select * into c from public.google_calendar_connections where user_id=p_user_id for update;

  -- 025 가 거부하던 그 한 가지 경우인지 본다. 나머지는 전부 아래로 넘긴다 —
  -- 주체가 다르거나 캘린더가 다르면 그것은 재고정이 아니라 다른 연결이고,
  -- 025/026 의 신원 검사가 그대로 판단해야 한다.
  if not found or c.google_subject is distinct from p_subject or c.calendar_id is distinct from p_calendar_id
    or c.calendar_verified_at is null or c.sync_timezone is null
    or c.sync_timezone is not distinct from p_timezone then
    return public.bind_verified_google_calendar_history(p_user_id,p_refresh_token,p_subject,
      p_grant_version,p_expected_generation,p_calendar_id,p_timezone,p_email);
  end if;

  -- 여기부터가 새 경로다. 025 의 검사들을 하나도 빼지 않는다.
  if p_grant_version is null or length(btrim(coalesce(p_timezone,'')))=0
    or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'INVALID_CALENDAR_BINDING' using errcode='22023';
  end if;
  if c.connection_generation is distinct from p_expected_generation then
    return jsonb_build_object('bound',false,'reason','generation-changed');
  end if;
  -- 살아 있는 토큰/승인이 이 주체의 것이어야 한다. 025 와 같은 검사이고, 같은
  -- 이유로 여기에도 있다: 재고정은 읽기 방식을 통째로 바꾸는 쓰기다.
  if not exists(select 1 from public.google_calendar_tokens t where t.user_id=p_user_id
      and t.google_subject is not distinct from p_subject
      and t.refresh_token is not distinct from p_refresh_token
      and t.grant_version is not distinct from p_grant_version) then
    return jsonb_build_object('bound',false,'reason','grant-changed');
  end if;

  -- 진행 중인 읽기가 있으면 물러난다. 그 패스는 옛 시간대로 계산하는 중이고,
  -- 그 결과가 새 시간대의 base 위에 얹히면 어느 쪽으로 읽힌 값인지 알 수 없어진다.
  if coalesce(c.lease_until,'-infinity'::timestamptz)>clock_timestamp() then
    return jsonb_build_object('bound',false,'reason','sync-in-progress');
  end if;
  -- 진행 중인 쓰기도 마찬가지다. 예약된 작업은 자기 시간대를 들고 다니고
  -- (029 line 157), 발송 직전에 연결의 시간대와 대조해 다르면 스스로 폐기된다
  -- (029 line 190). 즉 여기서 막지 않아도 데이터가 깨지지는 않지만, 사람이
  -- 방금 누른 편집이 이유 없이 사라진 것처럼 보인다. 먼저 끝내게 한다.
  if exists(select 1 from public.google_task_outbound_operations
      where user_id=p_user_id and state in ('reserved','running','uncertain')) then
    return jsonb_build_object('bound',false,'reason','outbound-in-flight');
  end if;
  -- 미해결 검토는 옛 시간대에서 계산된 두 값의 비교다. 그것을 남겨둔 채 시간대를
  -- 바꾸면 사람은 어느 쪽도 더는 참이 아닌 선택지를 고르게 된다. 지우지 않는다 —
  -- 지우는 것은 사람이 아직 답하지 않은 질문을 대신 답하는 것이다. 먼저 답하게 한다.
  if exists(select 1 from public.google_task_inbound_records
      where user_id=p_user_id and generation=c.connection_generation and resolved_at is null) then
    return jsonb_build_object('bound',false,'reason','reviews-unresolved');
  end if;

  -- account_email 은 건드리지 않는다. 021 line 118 의 가드가 calendar_id 나
  -- account_email 이 바뀌면 세대를 새로 발급하고 sync_timezone 을 null 로 만든다.
  -- 제자리 재고정에서 그것이 돌면 방금 넣은 값이 지워진다.
  update public.google_calendar_connections
    set sync_timezone=p_timezone,
        -- 전체 재읽기. 증분 커서는 "구글에서 무엇이 바뀌었나" 를 묻는데, 바뀐 것은
        -- 구글이 아니라 우리가 읽는 방식이다.
        sync_token=null,
        -- 옛 시간대로 계산한 결과를 들고 도착하는 클라이언트를 거절하게 만든다.
        sync_revision=sync_revision+1,
        lease_owner=null, lease_until=null, lease_fence=lease_fence+1,
        calendar_verified_at=clock_timestamp()
    where user_id=p_user_id;
  return jsonb_build_object('bound',true,'retimed',true);
end $$;
revoke all on function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.bind_verified_google_calendar(uuid,text,text,uuid,uuid,text,text,text) to service_role;

commit;
