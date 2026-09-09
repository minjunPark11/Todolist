# 운영 점검 스크립트

마이그레이션이 아니다. 운영 DB 에서 사람이 직접 실행하는 읽기 전용 점검 쿼리다.
Supabase SQL Editor 에 붙여넣고 실행한다.

## 먼저 — `state.sql`

**어떤 preflight 보다 먼저 `state.sql` 을 돌린다.** 읽기만 하고, 021–034 중 무엇이 지금
존재하는지 26행으로 답한다.

2026-09-09 에 이것이 필요해졌다. 넘겨받은 진단은 "022 가 없다" 였는데 운영에는 있었고,
그대로 021·022 를 적용했다면 `public.tasks` 에 컬럼과 트리거를 추가하는 파일을 재실행하는
것이었다. preflight 는 "적용해도 되는가" 를 묻고 state 는 "지금 어디인가" 를 답한다. 다른
질문이고, 순서상 state 가 먼저다.

migration 이력 테이블에 기대지 않는다 — 이 프로젝트에 없고, 있더라도 "파일이 실행됐다" 와
"그 안의 객체가 지금 존재한다" 는 같은 말이 아니다.


## 021+022 — 구글 연결 중단 복구

증상: 설정의 구글 캘린더 카드에 "동기화 호환성을 확인하지 못해 Google 연결을 잠시
중단했습니다" 가 뜨고, 캘린더 목록도 뜨지 않는다. 연결 상태와 계정 이메일은 정상으로 보인다.

원인: 배포된 `/api/google/token` 과 `/api/google/calendar` 는 Supabase 의
`authorize_google_token` RPC 로 프로토콜 호환성을 먼저 확인한다
(`src/integrations/google/protocol.ts`). 이 RPC 는 마이그레이션 022 가 만든다.
클라이언트만 배포되고 DB 마이그레이션이 따라가지 않으면 RPC 가 404 이고,
`protocol.ts` 는 **의도적으로 fail-closed** 라서 access token 을 내주지 않는다.
재시도로는 절대 풀리지 않는다.

확인:

```sql
select proname from pg_proc where proname = 'authorize_google_token';
```

0 행이면 이 절차를 따른다.

### 순서

1. **운영 DB 백업.** 021 은 `public.tasks` 에 `revision` 컬럼과 트리거를 추가한다.
2. `021_022_preflight.sql` 실행. **STOP 이 하나도 없어야** 한다.
   STOP 은 부분 적용 상태이거나 선행 마이그레이션이 빠졌다는 뜻이므로 적용하지 않는다.
   NOTE 는 적용을 막지 않는다(아래 참고).
3. `supabase/migrations/021_google_inbound_cursor.sql` 을 **통째로** 실행한다.
4. `supabase/migrations/022_google_sync_protocol.sql` 을 **통째로** 실행한다.
5. `021_022_verify.sql` 실행. **모든 행이 OK** 여야 한다.
   3, 4 를 건너뛰었거나 실패했다면 검사표 대신 무엇이 빠졌는지 한국어 오류로 알려주고 멈춘다.
   021 은 트랜잭션이므로 실패하면 아무것도 남기지 않는다. 다시 돌리기 전에 그 오류를 먼저 읽는다.
6. 앱에서 구글 캘린더 카드의 "다시 확인" 을 누른다. 빨간 문구가 사라져야 한다.

### 이 적용이 무엇을 켜지 않는가

021+022 는 구조만 설치하고 동작은 그대로 둔다. 확인된 사실:

- `google_task_sync_accounts.enabled` 는 `default false` 다. 새 작업 동기화는 꺼진 채다.
- `minimum_google_protocol` 은 `default 1` 이라 현재 클라이언트가 보내는 프로토콜 1 이
  계속 허용된다 (`authorize_google_token(user,1,null)` → `{"allowed":true,"minimumProtocol":1}`).
- `guard_task_revision` 은 계정이 `enabled` 일 때만 legacy 쓰기를 막는다. 지금은 revision 만
  증가시키고 기존 작업 저장 경로는 그대로 동작한다.

023–034 적용과 계정 활성화는 별개의 작업이며 `docs/google-task-rollout.md` 를 따른다.

### NOTE: public.lists 가 없다

2026-09-09 운영 확인: `public.lists` 가 없다. 007 을 적용한 적이 없는 프로젝트다.
이것은 고장이 아니다. 클라이언트가 `lists` 를 `optionalRemoteTables` 로 취급해
없으면 없는 대로 나머지를 동기화한다(`src/domain/sync/buildSyncPlan.ts`).

이번 복구에는 지장이 없다. 021 은 `public.lists` 를 `commit_google_task_inbound` 의
PL/pgSQL 본문에서만 참조하고, 본문은 함수를 만들 때 테이블을 확인하지 않는다.
`lists` 없이 001–020 을 적용한 PostgreSQL 에서 021, 022 가 정상 적용되고
`authorize_google_token(user,1,null)` 이 `{"allowed":true,"minimumProtocol":1}` 을
돌려주는 것을 확인했다.

다만 **나중에 인바운드(구글 일정 → 작업 생성)를 켤 때는 선행 조건이다.**
`commit_google_task_inbound` 는 `public.lists` 에 살아 있는 inbox 행이 있어야 생성을
허용하고, 없으면 `INBOX_CHANGED` 로 거절한다(021 line 312). 활성화 전에 007 적용과
inbox 행 존재를 먼저 해결해야 한다.

### 검증 방법

007 을 제외한 001–020 을 적용해 운영 상태를 그대로 재현한 PGlite PostgreSQL 에서
021, 022 를 순서대로 적용해 확인했다. preflight 는 적용 전 STOP 0 / NOTE 1(lists),
021 만 적용한 부분 상태에서는 STOP 9 를 낸다. verify 는 적용 후 11개 항목 전부 OK.


## 023–027 — 재연결·연결 해제·바인딩 복구

증상: 겉으로는 멀쩡하다. 기존 연결은 동기화가 잘 된다. 그런데 **"연결 해제"를 누르면
실패하고, 끊긴 상태에서 재연결도 되지 않는다.** 연결이 살아 있는 동안에는 드러나지 않는다.

원인: 021·022 로 토큰 경로만 복구했다. 배포된 v0.22.15 서버 함수가 부르는 나머지 RPC 는
아직 없다.

| 엔드포인트 | 부르는 RPC | 만드는 migration |
|---|---|---|
| `/api/google/token`, `/api/google/calendar` | `authorize_google_token` | 022 ✅ |
| `/api/google/connect` | `begin_google_oauth_operation` → `store_verified_google_grant` | 027, 024 |
| `/api/google/calendar` | `read_google_binding_snapshot`, `bind_verified_google_calendar` | 025, 026 |
| `/api/google/disconnect` | `read_google_disconnect_snapshot`, `disconnect_google_calendar` | 026 |

`connect` 는 024 보다 **027 을 먼저** 부른다. 024 만 적용해도 재연결은 그 앞에서 실패한다.

### 순서

1. `023_027_preflight.sql` 실행. **STOP 이 하나도 없어야** 한다.
2. `supabase/migrations/` 의 023 → 024 → 025 → 026 → 027 을 **이 순서대로 통째로** 실행한다.
   순서는 강제된다. 026 은 025 가 만든 `bind_verified_google_calendar` 를 `_core` 로 rename 한 뒤
   감싸므로, 025 없이 026 을 실행하면 `function ... does not exist` 로 실패한다.
3. `023_027_verify.sql` 실행. **모든 행이 OK** 여야 한다.

### 이 적용이 무엇을 켜지 않는가

아무것도 켜지 않는다. 계정은 계속 `enabled=false`, 프로토콜은 1 그대로다. 지금 도는
동기화 동작은 바뀌지 않는다. 재현 환경에서 실제로 실행해 확인했다:

- 클라이언트의 연결 행 읽기, `labels_supported` 수정, 기존 작업 저장 — 모두 그대로 동작한다.
  025 의 가드는 연결 scope 칼럼만 잠그고 메타데이터 수정은 허용한다.
- 클라이언트의 연결 행 직접 INSERT 는 거절된다. 의도된 것이다. 연결 생성은 이미
  `/api/google/calendar` 서버 경로를 쓴다(`src/lib/googleCalendar.ts` `supabaseWriteConnection`).
- 서버의 refresh token 읽기는 그대로다. 직접 쓰는 `writeRefreshToken` 은 어디서도 호출되지 않는다.

### 적용 후 알아둘 것

- **기존 연결은 재연결 시 한 번 거절된다.** 지금 토큰 행에는 검증된 Google `sub` 이 없다.
  `store_verified_google_grant` 는 옛 grant 를 아무 계정에나 묶지 않으려고 `identity-mismatch`
  를 돌려준다. 앱은 "연결 해제 후 다시 연결" 을 안내한다. 연결 해제가 되므로 막히지 않는다.
- **연결 해제는 선택한 캘린더 목록도 지운다.** `disconnect_google_calendar` 가
  connections, tokens, `google_calendar_sources` 를 함께 지운다(026). 재연결 후
  `동기화할 캘린더` 를 다시 체크해야 한다.

### 검증 방법

007 을 제외한 001–020 에 021·022 를 적용하고 살아 있는 연결 행을 넣어 운영 상태를 재현한
PGlite PostgreSQL 에서 023→027 을 순서대로 적용해 확인했다. preflight 는 적용 전
STOP 0 / NOTE 1, verify 는 적용 후 21개 항목 전부 OK, 위 동작 검사 5건 전부 통과,
025 를 건너뛴 026 은 의도대로 거절된다.


## 028–034 — 작업 동기화 설치

**앞의 둘과 성격이 다르다.** 021+022 와 023–027 은 배포된 코드가 이미 부르고 있는 RPC 가
없어서 고장 난 것을 되살리는 복구였다. 이 일곱 개는 **아직 아무도 부르지 않는 새 기능을
설치한다.** 적용해도 동작은 그대로다 — 계정은 계속 `enabled=false`, 프로토콜은 1 이다.
켜는 것은 별개의 결정이고 `activation_preflight.sql` 이 그 앞에 선다.

선행: 023–027 이 먼저다. 029 가 027 의 `begin_google_oauth_operation` 을 감싼다.

### 순서

1. **운영 DB 백업.**
2. `028_034_preflight.sql` 실행. **STOP 이 하나도 없어야** 한다.
3. `supabase/migrations/` 의 028 → 029 → 030 → 031 → 032 → 033 → 034 를
   **이 순서대로 통째로** 실행한다.
4. `028_034_verify.sql` 실행. **모든 행이 OK** 여야 한다.

### 순서가 강제되는 이유

뒤의 파일이 앞의 함수를 `_core` 로 rename 한 뒤 감싼다. 재현 환경에서 하나씩 건너뛰어
확인한 결과:

| 건너뛰면 | 어디서 죽는가 |
|---|---|
| 027 | 029 — `begin_google_oauth_operation(uuid,uuid,text) does not exist` |
| 028 | 034 — `commit_google_task_inbound_core(...) does not exist` |
| 029 | 031 — `relation "google_task_outbound_operations" does not exist` |
| 030 | 034 — `resolve_google_task_review(uuid,jsonb) does not exist` |
| 031 | 033 — `constraint "google_task_outbound_operations_kind_check" does not exist` |
| 033 | 034 — `reserve_google_task_recurrence(uuid,jsonb) does not exist` |
| **032** | **아무 데서도 죽지 않는다** |

**032 가 이 묶음에서 가장 위험하다.** 아무도 의존하지 않으므로 빠뜨려도 나머지 여섯 개가
오류 없이 적용된다. 전부 정상으로 보이지만 관리자 복구 경로
(`recover_google_task_no_write`, `google_task_recovery_audit`) 가 통째로 없다. 불확실한
쓰기가 났을 때 쓸 수단이 없다는 뜻이다. `028_034_verify.sql` 이 유일한 방어선이다.

### `_core` 사슬 — 부분 적용의 지문

함수가 "있다" 는 것만으로는 부족하다. 마지막으로 감싼 판이 걸려 있어야 한다.

| `_core` 함수 | 이것이 있으면 |
|---|---|
| `commit_google_task_inbound_core` | 028 까지 |
| `read_google_task_sync_snapshot_core` | 028 까지 |
| `begin_google_oauth_operation_outbound_core` | 029 까지 |
| `commit_google_task_inbound_review_core` | 029 까지 |
| `read_google_task_sync_snapshot_review_core` | 030 까지 |
| `read_google_task_sync_snapshot_retention_core` | 034 까지 |

`read_google_task_sync_snapshot` 은 021 이 만들고 028 → 030 → 034 가 세 번 감싼다.

### 이 적용이 무엇을 켜지 않는가

아무것도 켜지 않는다. verify 의 마지막 세 행이 그것을 확인한다 — 활성화된 계정 0개,
프로토콜 2 계정 0개, `enabled` 기본값 `false`.

### 검증 방법

007 을 제외한 001–027 을 적용해 운영 상태를 재현한 PGlite PostgreSQL 에서 확인했다.
preflight 는 적용 직전 STOP 0 / NOTE 1, 023–027 이 빠진 상태에서는 STOP 6,
030 까지만 적용한 부분 상태에서는 STOP 5 를 낸다. verify 는 적용 후 29개 항목 전부 OK 이고,
032 만 건너뛴 상태에서는 가드가 `032` 를 지목하고 멈춘다.


## 035 — 프로토콜 1 서빙 은퇴 (전역)

022 의 활성화 가드는 계정마다 65분을 요구했다. 035 는 그 65분을 전역 한 줄로 옮긴다.
계정별 안전은 그대로 남는다.

### 왜

022 의 가드가 보던 것은 둘이었다.

| 검사 | 무엇을 막는가 | 계정의 속성인가 |
|---|---|---|
| `legacy_google_token_valid_until` + 5분 | 이 계정에 나간 프로토콜 1 토큰이 아직 살아 있는 것 | **그렇다** |
| cutover + 65분 | **022 이전 서버 배포**가 계속 토큰을 내주는 것 | 아니다 |

두 번째는 배포의 속성이다. 022 이전 배포는 `authorize_google_token` 을 아예 부르지
않으므로 어느 계정의 minimum 을 올려도 막히지 않는다. 그것을 계정마다 다시 세는 것은 같은
사실을 사람 수만큼 확인하는 일이고, **한 번도 연동한 적 없는 새 계정까지 65분을 기다리게**
만든다 — 소진할 토큰이 없는데도.

첫 번째는 정확하다. 022 는 access token 을 클라이언트에 넘기기 **전에** 만료 시각을
기록하므로(`functions/google/token.ts` 가 인가를 두 번 부르는 이유), 실제로 나간 토큰은
하나도 빠짐없이 잡힌다. 계정별 안전은 이쪽이 지킨다.

### 적용

1. `035_google_protocol_retirement.sql` 을 통째로 실행한다.
2. 이때부터 **아무 계정도 켜지지 않는다.** 전역 값이 null 이고 null 은 거절이다 —
   fail-closed 다. DB 는 옛 배포가 물러났는지 알 수 없다.
3. 022 이전 배포가 더는 트래픽을 받지 않는다고 판단되면 담당자가 선언한다:

```sql
update public.google_sync_protocol_state
   set legacy_serving_retired_at = clock_timestamp(), updated_at = clock_timestamp();
```

4. 그로부터 65분이 지나면 전역 조건이 충족된다. **한 번만 하면 되고, 이후 계정은 자기
   토큰이 만료됐는지만 보면 된다.**

### 새 계정은 이제 어떻게 되는가

`google_task_sync_accounts` 의 기본값은 `enabled=false`, `minimum_google_protocol=1`
이므로 새 계정은 여전히 구버전으로 시작한다. 켜려면:

```sql
update public.google_task_sync_accounts set minimum_google_protocol = 2 where user_id = '...';
-- 그 계정의 클라이언트가 프로토콜 1 로 마지막 토큰을 받은 지 65분이 지났으면 바로:
update public.google_task_sync_accounts set enabled = true where user_id = '...';
```

한 번도 연동한 적 없는 계정은 `legacy_google_token_valid_until` 이 null 이라 두 번째
줄이 **즉시** 통과한다. 전역 65분은 이미 지나 있기 때문이다.

주의: 두 UPDATE 사이에 그 계정의 구글 연동은 막힌다. 클라이언트는 `enabled` 를 보고서야
프로토콜 2 를 보내기 시작하기 때문이다(`lib/googleCalendar.ts`). 둘을 한 트랜잭션에 넣으면
그 틈이 없다.

### 검증 방법

001–035 를 적용한 PGlite PostgreSQL 에서 확인했다. 은퇴 선언 전에는 다른 조건이 맞아도
거절하고, 선언 후 64분에도 거절하고, 66분 뒤 토큰을 받은 적 없는 계정은 통과하고, 토큰이
살아 있는 계정은 여전히 거절하고, 그 토큰이 만료되면 통과한다. 프로토콜 1 로 되돌리는 것도
켜져 있는 동안에는 여전히 거절된다. 전역 행은 둘이 될 수 없고 anon·authenticated·
service_role 은 읽지 못한다.


## 여러 계정 — `activation_status.sql`

사람이 둘 이상이 되면 `activation_preflight.sql` 을 사람 수만큼 고쳐 돌리게 되고, 그것은
실수를 부른다. 이 스크립트는 uuid 를 넣지 않고 **전 계정을 한 표로** 보여준다.

- 첫 결과: 전역 소진 상태 (035). 미선언이면 아무도 켤 수 없다.
- 둘째 결과: 계정마다 프로토콜 · 구버전 토큰 · `준비` · 연결 · inbox 행.

`준비` 는 022+035 가드가 요구하는 조건 그대로다. true 면 지금 그 계정의 `enabled=true`
UPDATE 가 통과한다.

쓰는 순서: 이것으로 **누가 준비됐는지 고르고**, 고른 계정으로 `activation_preflight.sql`
을 한 번 돌려 **켜면 무엇이 깨지는지** 본다. 얕게 전부 / 깊게 하나다.

준비된 계정이 여럿이면 한 문장으로 켤 수 있다. 가드는 행마다 도는 트리거라 각각 따로
판정된다:

```sql
update public.google_task_sync_accounts
   set enabled = true
 where user_id in ('...', '...');
```

### 계정이 늘어날 때 무엇을 반복하나

| | 몇 번 |
|---|---|
| 035 적용 · 은퇴 선언 · 전역 65분 | **전체를 통틀어 한 번** |
| `minimum_google_protocol = 2` | 계정마다 |
| `enabled = true` | 계정마다 |

두 UPDATE 사이에 그 계정의 구글 연동은 막힌다 — 클라이언트는 `enabled` 를 보고서야
프로토콜 2 를 보내기 때문이다. 한 번도 연동한 적 없는 계정은 토큰 만료를 기다릴 것이
없으므로 **둘을 한 트랜잭션에 넣으면 그 틈이 없다.**

```sql
begin;
update public.google_task_sync_accounts set minimum_google_protocol = 2 where user_id = '...';
update public.google_task_sync_accounts set enabled = true where user_id = '...';
commit;
```

이미 연동해 온 계정은 그 계정의 구버전 토큰이 만료될 때까지(최대 65분) 두 번째 줄이
거절되므로 한 트랜잭션에 넣을 수 없다. `activation_status.sql` 의 "구버전 토큰" 칸이
얼마나 남았는지 말해 준다.


## 활성화 — `activation_preflight.sql`

021–034 를 전부 적용한 뒤, 계정을 실제로 켜기 전에 돌린다. **적용과 활성화는 다른 일이다.**
이 스크립트가 보는 것은 "지금 켜면 무엇이 깨지는가" 다.

사용법: 파일 안의 `target` CTE 에서 uuid 를 켜려는 계정의 것으로 바꾸고 통째로 실행한다.
STOP 이 하나라도 있으면 켜지 않는다.

### 무엇을 보는가

| 묶음 | 내용 |
|---|---|
| 007 | `public.lists` 존재 · 이 계정의 살아 있는 inbox 행이 **정확히 하나** |
| 적용 | 034 까지 · 032 관리자 복구 |
| drain | `minimum_google_protocol=2` · cutover 65분 경과 · 구버전 토큰 만료 +5분 |
| 연결 | 검증된 `google_subject` · 전용 캘린더 바인딩 및 검증 |
| 대기 | 진행 중인 아웃바운드 0개 · 미해결 인바운드 검토 0개 |
| note | `pg_cron` 설치 여부 |

drain 세 줄은 022 의 `guard_google_protocol_activation` 이 강제하는 조건 그대로다
(022 line 21–28). 맞지 않으면 `enabled=true` UPDATE 가 `GOOGLE_PROTOCOL_DRAIN_REQUIRED`
로 거절된다. 이 스크립트는 그 거절을 **미리, 이유를 분리해서** 보여준다.

### inbox 행은 어떻게 생기는가

**손으로 넣지 않는다.** 007 을 적용해 `public.lists` 가 생기면 다음 동기화가 올려준다.

클라이언트는 로드할 때마다 `ensureInboxList` 를 돌려 고정 id `list-inbox` 로 Inbox 를
로컬에 만들어 둔다 (`hooks/usePlannerData.ts:215`, `domain/spaces/hierarchy.ts`). 그 행은
줄곧 있었고, 테이블이 없어서 올라가지 못했을 뿐이다 — 클라이언트가 `lists` 를
`optionalRemoteTables` 로 취급해 없으면 없는 대로 나머지를 동기화해 왔다
(`domain/sync/buildSyncPlan.ts`).

그래서 순서는 이렇다:

1. 007 적용
2. 앱을 열어 한 번 동기화시킨다 (활성화하려는 그 계정으로)
3. `activation_preflight.sql` 의 "살아 있는 inbox 행이 정확히 하나" 로 확인한다

2 를 건너뛰고 3 으로 가면 STOP 이 뜬다. 테이블만 있고 행이 없는 상태이기 때문이다.
그때는 손으로 INSERT 하지 말고 앱을 한 번 더 열어 동기화시킨다 — 손으로 넣은 id 가
`list-inbox` 와 다르면 클라이언트가 자기 것을 하나 더 만들어 **inbox 가 둘이 되고**,
그 검사는 "정확히 하나" 를 요구한다.

### 007 이 없으면 검사표가 아니라 가드가 뜬다

`public.lists` 를 직접 읽는 행이 있어 007 없이는 문장 전체가 파싱되지 않는다
(`to_regclass` 로 감싸도 PostgreSQL 은 문장을 먼저 계획한다). 그래서 스크립트 맨 앞의
`do $$` 가드가 먼저 멈추고 007 이 왜 선행 조건인지 설명한다.

그 이유는 오류의 종류가 갈리기 때문이다. 재현 환경에서 확인했다:

```
lists 없음         → 42P01 relation "public.lists" does not exist   ← 하드 오류
lists 있고 행 없음 → 40001 INBOX_CHANGED                            ← 설계된 거절
```

40001 은 직렬화 실패로 다시 시도되는 부류이고 42P01 은 그렇지 않다. **007 없이 켜면
구글에서 온 새 일정을 작업으로 승격할 때마다 인바운드 패스가 통째로 실패한다.**

### 검증 방법

021–034 를 전부 적용한 PGlite PostgreSQL 에서 세 상태를 확인했다. 007 없는 상태는 가드가
잡고, 007 은 있으나 계정·연결이 없는 상태는 STOP 6 을 낸다. inbox 행 · 검증된 연결 ·
프로토콜 2 · cutover 66분 경과 · 구버전 토큰 만료를 모두 갖춘 계정에서는 10개 항목 전부
OK 이고, 그 상태에서 `enabled=true` UPDATE 가 실제로 통과한다 — 즉 이 검사표는 통과할 수
있는 검사다.

## 036 — 동기화 시간대 다시 고정하기

`sync_timezone` 은 바인딩할 때 한 번 정해지고, 025 와 026 이 다른 값으로의
재바인딩을 거부한다. 옳은 거절이다 — 매핑의 `base` 가 벽시계 필드라서
(021 line 341) 시간대가 바뀌면 그 계정의 모든 base 가 동시에 의미를 잃는다.

없던 것은 되돌리는 문이다. 그 값은 사람이 고른 것이 아니라 구글의 캘린더
속성에서 읽어온 것이고 (`calendarBinding.ts` line 35), 그것이 그 사람이 시계를
읽는 시간대와 다르면 — 다른 지역에서 만든 캘린더, VPN 을 통해 만든 캘린더 —
들어오는 모든 일정이 그 차이만큼 어긋난 채로 저장되고 고칠 방법이 없었다.

036 은 거절을 유지한 채 한 경우에만 문을 연다: 같은 주체, 같은 캘린더, 같은
세대, 시간대만 다름 → **제자리** 재고정. 제자리인 것이 핵심이다. 연결
해제/재연결은 새 세대를 시작하고, 새 세대에서는 이벤트가 매핑 없는 것으로 보여
같은 일정이 작업으로 한 번 더 생긴다.

세대와 매핑을 유지하면 `taskInboundPlan.ts` line 117 이 걸린다:

    로컬 == base 이면  → update, 새 시간대로 다시 계산한 시각으로 덮어쓴다
    로컬 <> base 이면  → conflict, 사람이 본다

즉 **가져온 뒤 손대지 않은 작업은 저절로 교정되고, 손댄 것만 검토로 간다.**

순서:

1. `036_repin_preflight.sql` — 지금 무엇으로 고정돼 있는지 보고, 거절 조건 넷을
   미리 확인한다. 첫 표의 "그 시간대의 지금" 이 실제 시계와 다르면 그것이 원인이다.
2. `036_google_sync_timezone_repin.sql` 적용. 적용만으로는 아무것도 바뀌지 않는다.
3. 앱 → 설정 → 일반 → **시간대** 를 올바른 값으로 고른다. 이 값이 다음 바인딩에서
   `sync_timezone` 이 된다.
4. 앱 → 설정 → 캘린더 → 구글을 **다시 연결**한다. 연결 흐름이 끝에서
   `bind_verified_google_calendar` 를 부르고, 036 이 그것을 제자리 재고정으로 받는다.
5. 다음 동기화가 전체 재읽기다 (`sync_token` 이 비워진다). 어긋나 있던 작업들이
   교정되고, 가져온 뒤 손댄 것만 검토로 올라온다.

거절되면 응답에 `reason` 이 실려 온다:

    generation-changed   다른 곳에서 연결이 새로 만들어졌다. 화면을 새로고침하고 다시.
    grant-changed        승인이 바뀌었다. 연결 해제 후 다시 연결한다.
    sync-in-progress     동기화 패스가 돌고 있다. 끝나고 다시.
    outbound-in-flight   보내는 중인 편집이 있다. 끝나고 다시.
    reviews-unresolved   검토가 남아 있다. 먼저 답한다.

마지막 둘은 순서의 문제다. 미해결 검토는 옛 시간대에서 계산된 두 값의 비교라서,
남겨둔 채 시간대를 바꾸면 어느 쪽도 더는 참이 아닌 선택지를 고르게 된다.
