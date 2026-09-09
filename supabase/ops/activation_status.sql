-- 모든 계정의 활성화 준비 상태를 한 표로. 읽기만 한다.
--
-- `activation_preflight.sql` 은 계정 하나를 깊게 본다. 이것은 전부를 얕게 본다 — 사람이
-- 둘 이상이 되는 순간 파일을 사람 수만큼 고쳐 돌리는 것은 실수를 부른다.
--
-- 켤 수 있는 계정을 고르는 데 쓰고, 고른 다음에는 그 계정으로 `activation_preflight.sql`
-- 을 한 번 돌린다. 이쪽은 "누가 준비됐나", 저쪽은 "이 사람을 켜면 무엇이 깨지나" 다.

-- 전역 조건부터. 이것이 안 되면 아래 표는 전부 "대기" 다 (035).
select
  legacy_serving_retired_at as "은퇴 선언 시각",
  case
    when legacy_serving_retired_at is null then '미선언 — 아무도 켤 수 없다'
    when legacy_serving_retired_at + interval '65 minutes' > clock_timestamp()
      -- 분 단위로 직접 센다. to_char(..., 'MI') 는 시 자리를 버려서 65분을 "05분" 으로
      -- 보여준다 — 기다려야 할 시간을 열두 배 짧게 읽히게 하는 종류의 거짓말이다.
      then '대기 중 — 약 ' || ceil(extract(epoch from
        legacy_serving_retired_at + interval '65 minutes' - clock_timestamp()) / 60)::int || '분 남음'
    else '완료 — 이후는 계정별 토큰 만료만 본다'
  end as "전역 소진 (035)"
from public.google_sync_protocol_state;

-- 계정별. `준비` 가 true 면 지금 enabled=true 가 통과한다.
select
  u.email,
  a.user_id,
  a.enabled as "켜짐",
  a.minimum_google_protocol as "프로토콜",
  case
    when a.legacy_google_token_valid_until is null then '없음'
    when a.legacy_google_token_valid_until + interval '5 minutes' <= clock_timestamp() then '만료됨'
    else '살아 있음 — 약 ' || ceil(extract(epoch from
      a.legacy_google_token_valid_until + interval '5 minutes' - clock_timestamp()) / 60)::int || '분 남음'
  end as "구버전 토큰",
  -- 022+035 의 가드가 실제로 요구하는 것 그대로. 여기서 true 면 UPDATE 가 통과한다.
  (a.minimum_google_protocol = 2
   and coalesce(a.legacy_google_token_valid_until + interval '5 minutes', '-infinity'::timestamptz)
       <= clock_timestamp()
   and exists (select 1 from public.google_sync_protocol_state s
               where s.legacy_serving_retired_at is not null
                 and s.legacy_serving_retired_at + interval '65 minutes' <= clock_timestamp())
  ) as "준비",
  -- 켜기 전에 갖춰야 하는 계정 쪽 조건들. 자세한 것은 activation_preflight.sql 이 본다.
  (t.google_subject is not null and t.google_subject <> '') as "구글 검증됨",
  (c.calendar_id is not null and c.calendar_verified_at is not null) as "캘린더 바인딩",
  (select count(*) from public.lists l
    where l.user_id = a.user_id and l.data->>'kind' = 'inbox'
      and coalesce(l.data->>'archivedAt','') = '' and coalesce(l.data->>'deletedAt','') = ''
  ) as "inbox 행"
from public.google_task_sync_accounts a
left join auth.users u on u.id = a.user_id
left join public.google_calendar_tokens t on t.user_id = a.user_id
left join public.google_calendar_connections c on c.user_id = a.user_id
order by a.enabled desc, u.email;
