# 여러 기기 동기화 — 내려받기 · 설정 병합 · 기기별 커서

> 상태: **구현 완료** (S1~S3) · 2026-09-08
> 요청: "웹에서 바꾼 부분들이랑 어플에서 바꾼 부분들이랑 연동이 안 되는 것 같다"
> 결정: 내려받기는 **realtime + 포커스/주기 둘 다** · 구글 미러는 **커서를 기기별로**
> 대상: `hooks/usePlannerData.ts` · `domain/sync/*` · `lib/googleCalendarSources.ts` ·
> `hooks/useGoogleInboundSync.ts` · `supabase/migrations/*`
> 선행 문서: `GOOGLE_SYNC_LOGIC_REFERENCE.md` · `GOOGLE_SYNC_HARDENING_DESIGN.md`(H2가 여기 맞물린다)

---

## 0. 근거 수준

| 등급 | 무엇 | 표기 |
|---|---|---|
| **실측** | `loadSupabaseData()`를 부르는 곳이 `[userEmail]` effect 하나다 · `.channel(` 사용처 0건 · `refreshSupabaseData`를 앱에서 아무도 안 부른다 · `settings`/`app_settings`는 행 통째 upsert다 · `google_calendar_sources`의 PK가 `(user_id, calendar_id)`다 · 이벤트 미러는 `focusflow.externalCalendars.v1` 로컬 전용이다 | [실측] |
| **결정** | 사용자 — realtime과 포커스/주기를 둘 다 · 커서는 기기별 | [결정] |
| **규격** | Supabase Realtime `postgres_changes`는 publication에 등록된 테이블만 보낸다 | [규격] |
| **추론** | 실제 사용에서 두 기기가 동시에 열려 있는 빈도 | [추론] |

---

## 1. 무엇이 안 맞는가 — 셋이다 [실측]

### 1.1 동기화가 한 방향만 자동이다

| 방향 | 언제 | 근거 |
|---|---|---|
| 올리기 | 편집 **700ms** 뒤, 자동 | `usePlannerData.ts:552` |
| 내려받기 | **로그인 때 딱 한 번** | `usePlannerData.ts:549` — `[userEmail]` effect |

창 포커스 리스너도, 주기 타이머도, realtime 구독도 없다. `refreshSupabaseData`는 export돼
있지만 앱에서 부르는 곳이 없다(테스트만 쓴다). 유일한 수동 경로는 레일의 동기화
버튼(`syncNow` — 업로드 → 큐 비우기 → 다운로드).

**그래서 앱을 켜 둔 채 웹에서 고치면 앱은 재시작 전까지 모른다.** 반대도 같다.

여기서 좋은 소식 하나 [실측]: 컬렉션은 **레코드 단위 diff**라(`buildSyncPlan`) 낡은 기기가
저장한다고 남의 편집이 지워지지는 않는다. `diffRemovedIds`는 baseline에 있고 로컬에 없는
것만 지우므로, 다른 기기가 새로 만든 레코드는 애초에 후보가 아니다. 문제는 손실이 아니라
**낡은 화면**이다 — 아래 1.2를 빼면.

### 1.2 설정은 행 통째로 올라가 나중 저장이 이긴다

`settings`와 `app_settings`는 jsonb 한 덩어리다. `buildSyncPlan`은 객체 identity가 바뀌면
**행 전체를 upsert**하고, `reapplyLocalEdits`도 같은 입자로 판단한다(`localNow.appSettings
!== localBefore.appSettings`면 로컬 것으로 통째 교체).

그래서 웹에서 언어를 바꾸고 앱에서 주 시작 요일을 바꾸면, **나중에 저장한 쪽이 앞의 것을
지운다.** 서로 다른 필드를 고쳤는데도 그렇다.

### 1.3 구글 캘린더는 커서를 공유하고 사본은 기기마다 따로다

| 무엇 | 어디 | 범위 |
|---|---|---|
| 이벤트 미러 | `focusflow.externalCalendars.v1` | **기기 로컬** |
| 캘린더 목록 | `settings.externalCalendars` | 계정 |
| `sync_token` | `google_calendar_sources` PK `(user_id, calendar_id)` | **계정 — 모든 기기가 공유** |

증분 응답은 한 번만 온다. 웹이 먼저 폴링해 그것을 소비하고 커서를 앞으로 옮기면, 앱은 다음
폴링에서 빈 응답을 받고 **그 변경을 못 본다.** 커서가 만료(410)돼 전체 재나열이 돌 때까지.
두 기기가 각자 다른 조각만 든 상태가 된다.

---

## 2. 결정 [결정]

| # | 결정 | 절 |
|---|---|---|
| **S-D1** | realtime은 **초인종**으로만 쓴다. 페이로드를 적용하지 않고 기존 pull을 유발한다 | §3.2 |
| **S-D2** | 포커스와 주기 pull을 **그물망**으로 함께 둔다. realtime이 끊겨도 앱이 낡지 않는다 | §3.3 |
| **S-D3** | pull 전에 **저장 큐를 비운다.** 보내지 않은 편집 위로 계정을 덮지 않기 위해 | §3.4 |
| **S-D4** | `settings`·`appSettings`는 **필드 단위 3-way 병합**(baseline · 로컬 · 원격) | §4 |
| **S-D5** | 구글 커서는 **기기별 별도 테이블**. `google_calendar_sources`는 목록·선택만 든다 | §5 |

---

## 3. 자동 내려받기

### 3.1 pull은 이미 안전하다 [실측]

`loadSupabaseData()`는 이미 세션 중에 불려도 되게 만들어져 있다 — `reapplyLocalEdits`가
"로드가 시작된 시점의 로컬"과 "지금의 로컬"을 비교해 그 사이에 사용자가 건드린 레코드를
다시 얹고, baseline은 **로드된 것**으로 남긴다(그래야 다음 저장이 그 편집만 밀어 올린다).

즉 이 항목은 새 병합 로직을 만드는 일이 아니라 **이미 있는 것을 더 자주 부르는 일**이다.
§4가 그 위에 얹는 것은 그 병합의 입자를 설정에 대해서만 잘게 만드는 것뿐이다.

### 3.2 realtime은 초인종이다 [결정]

`postgres_changes` 페이로드를 상태에 적용하지 않는다. 이벤트가 오면 **pull을 예약**한다.

이유가 셋이다.

- 우리 상태는 컬렉션 통째이고 병합 규칙(`reapplyLocalEdits`)이 이미 그 입자로 쓰여 있다.
  행 단위 페이로드를 적용하려면 두 번째 병합 규칙이 생기고, 둘이 어긋나는 날 아무도
  설명하지 못한다.
- 페이로드는 놓칠 수 있다(재연결 · 순서 뒤바뀜 · publication 누락). 초인종은 놓쳐도
  §3.3의 그물망이 덮는다. 데이터 채널은 놓치면 그대로 구멍이다.
- 초인종은 **테이블마다 다르게 처리할 것이 없다.** 어느 행이 바뀌었든 답은 하나 — 다시 읽어라.

구독은 `user_id = <나>`로 필터한 `public.settings`와 §5를 제외한 컬렉션 테이블들. 등록은
migration에서 publication에 테이블을 더한다 [규격].

### 3.3 그물망 — 포커스와 주기 [결정]

| 방아쇠 | 간격 | 왜 |
|---|---|---|
| realtime 이벤트 | 즉시(디바운스 1초) | 다른 기기의 변경을 몇 초 안에 |
| 창 포커스 | 쿨다운 **10초** | 구글 인바운드가 이미 쓰는 리듬. 탭을 옮겨 다닐 때 폭주하지 않게 쿨다운 |
| 주기 | **5분** | realtime이 조용히 끊긴 경우의 바닥. 창이 숨겨져 있으면 건너뛴다 |

셋 다 **같은 한 함수**를 부른다. 겹쳐 불려도 `loadSupabaseData`가 스스로 stale 판정을 하므로
(`isStale()`) 늦게 끝난 낡은 로드는 아무것도 쓰지 않는다.

### 3.4 순서 — 비우고 나서 읽는다 [결정]

`syncNow`가 이미 이 순서로 되어 있고, 이유가 그대로 적용된다. 보내지 않은 편집이 큐에 있는
채로 계정을 내려받으면, 그 편집은 `reapplyLocalEdits`가 다시 얹어주긴 하지만 **baseline이
그 사이에 바뀌어** 무엇을 밀어 올려야 하는지가 흐려진다. 자동 pull도 같은 순서를 쓴다:

```
저장 큐 drain  →  loadSupabaseData()
```

### 3.5 자기 메아리 [추론]

우리 저장이 realtime 이벤트를 만들고, 그 이벤트가 pull을 부르고, pull이 상태를 갈아 끼운다.
해롭지는 않다(같은 데이터다). 다만 낭비이므로 **마지막 저장이 끝난 뒤 2초 안에 온 이벤트는
무시한다.** 넉넉히 잡는다: 놓쳐도 §3.3의 그물망이 덮고, 반대로 좁게 잡으면 매 키 입력마다
왕복이 하나 늘어난다.

---

## 4. 설정 — 필드 단위 3-way 병합

### 4.1 규칙

`reapplyLocalEdits`가 레코드에 대해 하는 일과 **정확히 같은 판단을 필드에 대해** 한다.

```
각 필드 k에 대해:
  로컬[k] !== baseline[k]  →  로컬이 이긴다   (이 기기가 고친 것)
  그 외                    →  원격이 이긴다   (저쪽이 고쳤거나, 아무도 안 고쳤다)
```

- 서로 다른 필드를 고친 두 기기는 **둘 다 살아남는다.** 이것이 1.2가 고치려는 전부다.
- 같은 필드를 고쳤으면 마지막에 저장한 쪽이 이긴다 — 지금과 같고, 그게 맞다.
- baseline이 없으면(첫 로드) 원격을 그대로 쓴다. 지금 동작 그대로다.

### 4.2 어디에 두는가

순수 함수 `mergeSettingsFields(baseline, local, remote)`를 `domain/sync/`에 두고
`reapplyLocalEdits`가 `settings`와 `appSettings` 두 자리에서 부른다. 나머지 필드
(`activeSessionId` · `focusFlow`)는 **손대지 않는다** — 포커스 세션은 기기 간 소유권 규칙이
따로 있고(`usePlannerData`의 focus host 충돌 검사), 그것을 필드 병합으로 흉내 내면 두 규칙이
싸운다.

### 4.3 기각

- **필드마다 타임스탬프를 붙이기** — 스키마와 모든 쓰기 경로가 바뀐다. 얻는 것은 "같은 필드
  동시 편집"의 정확도 하나뿐이고, 그건 이미 last-write-wins로 충분하다.
- **설정을 행으로 쪼개기(키당 한 행)** — 병합 문제는 사라지지만 읽기가 N배가 되고
  `normalizeAppSettings`의 단일 진입점이 깨진다.

---

## 5. 구글 커서를 기기별로

### 5.1 왜 별도 테이블인가 [결정]

`google_calendar_sources` 행에는 **계정 전체가 공유해야 하는 것**(목록 · `summary` · `color`
· `selected` · `writable`)과 **기기마다 달라야 하는 것**(`sync_token`)이 섞여 있다.
`device_id`를 그 테이블의 키에 더하면 목록이 기기 수만큼 복제되고, 한 기기에서 캘린더를
체크하면 다른 기기에는 안 보인다 — 지금 잘 되는 것을 깨뜨린다.

그래서 커서만 옮긴다.

```sql
create table public.google_calendar_device_cursors (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  calendar_id text not null,
  sync_token text,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id, calendar_id)
);
```

`google_calendar_sources.sync_token` 컬럼은 **남겨둔다.** 지우면 아직 배포되지 않은 구버전
클라이언트가 그 컬럼을 읽다 깨진다. 새 코드는 읽지도 쓰지도 않는다.

### 5.2 기기 id

`focusflow.deviceId.v1` — `crypto.randomUUID()`, 로컬 저장소. 계정에 종속되지 않는다(로그아웃
후 다른 계정으로 들어와도 이 기기는 이 기기다). 지워지면 새 기기로 취급되고, 그 결과는
**한 번의 전체 나열**이다 — 아프지 않다.

### 5.3 H2가 여기에 정확히 맞물린다

커서가 없는 기기의 첫 패스는 전체 나열이고, H2가 만든 `complete` + `pruneAfterFullListing`이
그때 **그 기기의 미러를 계정의 진짜 상태와 일치시킨다.** 즉 기기별 커서로 바꾸는 순간,
기존에 어긋나 있던 미러들이 각자 다음 패스에서 스스로 고쳐진다. 별도의 복구 절차가 필요 없다.

### 5.4 값 [추론]

구글 API 호출이 기기 수만큼 는다. 증분 응답은 보통 비어 있고 한 패스에 요청 하나이므로,
기기 두세 대 규모에서 이것은 문제가 아니다. 무료 할당량은 하루 100만 요청이다.

---

## 6. 단계

| 단계 | 무엇 | 왜 이 순서 | 상태 |
|---|---|---|---|
| **S1** | 설정 필드 병합 (§4) | 순수 함수 하나. **S3보다 먼저여야 한다** — pull이 잦아지면 1.2의 손실도 그만큼 잦아진다 | **완료** — `domain/sync/mergeSettingsFields.ts` + `performSave`의 읽고-병합-쓰기 |
| **S2** | 기기별 커서 (§5) | 마이그레이션 + `googleCalendarSources`. 역시 S3보다 먼저: pull이 잦아진다고 구글 미러가 나아지지는 않는다 | **완료** — 마이그레이션 020 · `lib/deviceId.ts` |
| **S3** | 자동 내려받기 (§3) | 앞의 둘이 고쳐진 뒤라야 "자주 읽기"가 순수한 이득이 된다 | **완료** — `domain/sync/pullSchedule.ts` · 마이그레이션 021 |

### 6.1 구현하면서 설계에서 달라진 것

**§4는 절반이었다.** 내려받기(`reapplyLocalEdits`)에만 병합을 넣으면 이 버그는 안 고쳐진다.
손실이 일어나는 곳은 **올릴 때**다 — 기기 B가 baseline 위에서 만든 설정 행을 통째로
upsert하는 순간, A가 방금 바꾼 필드가 사라진다. B는 그 사이에 내려받은 적이 없어도 그렇다.
그래서 `performSave`가 그 두 행을 **쓰기 직전에 다시 읽어 병합**한다. 창이 몇 시간에서
요청 하나 길이로 줄어든다. 읽기가 실패하면 로컬 값을 쓴다 — 지금과 같은 동작이고, 예의상
하는 읽기 때문에 저장을 거부할 수는 없다.

**필드 병합은 계정의 부재도 따른다.** 우리가 안 건드린 필드가 계정에 없으면 그 부재가
계정의 답이다. `googleDeletedEventIds`가 다른 기기에서 비워진 것이 우리에게 닿아야 하기
때문이고, 대가는 그 필드를 모르는 구버전 클라이언트가 행을 쓴 경우인데 — normalize가
이 빌드가 아는 필드를 전부 채운 뒤에 병합에 들어오므로 실제로 걸리는 것은 선택 필드뿐이다.

**§6의 순서는 옳았다.** S3을 먼저 켰다면 S1이 고친 손실과 S2가 고친 어긋남을 오히려 더
자주 일으켰을 것이다.

**증상이 가장 큰 것(S3)을 마지막에 두는 이유**가 이것이다. S3은 다른 둘을 고치지 않은 채로
켜면 오히려 그 둘의 실패를 자주 일으킨다.

## 7. 무엇으로 증명하는가

| 단계 | 테스트 | 어디 |
|---|---|---|
| S1 | 서로 다른 필드를 고친 두 기기가 둘 다 살아남는다 · 같은 필드는 로컬이 이긴다 · baseline이 없으면 원격 그대로 · identity를 보존한다 · 필드 삭제가 전달된다 | `mergeSettingsFields.test.ts` · `reapplyLocalEdits.test.ts` |
| S2 | 이 기기의 커서만 읽는다 · 다른 기기 것만 있으면 전체 나열로 간다 · 쓰기가 이 기기를 지목한다 · 캘린더를 끄면 모든 기기의 커서가 지워진다 | `googleCalendarDeviceCursor.test.ts` |
| S3 | 우리 저장 직후의 realtime 이벤트는 무시한다 · 포커스는 쿨다운을 지킨다 · 주기는 절대 억제되지 않는다 | `pullSchedule.test.ts` |

## 8. 열린 질문

| # | 질문 | 기본값 제안 |
|---|---|---|
| Q1 | 주기 pull을 창이 숨겨져 있을 때도 돌릴 것인가 | 돌리지 않는다. 포커스가 돌아올 때 어차피 한 번 돈다 |
| Q2 | realtime 구독을 컬렉션 테이블 전부에 걸 것인가 | 그렇다. 초인종이라 페이로드 비용이 없고, 빠뜨린 테이블은 5분 지연이 된다 |
| Q3 | 오래된 기기의 커서 행을 언제 지울 것인가 | 지금은 두지 않는다. 행 하나가 몇 바이트다. 필요해지면 `updated_at` 기준 정리 |
