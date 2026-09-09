# 운영 점검 스크립트

마이그레이션이 아니다. 운영 DB 에서 사람이 직접 실행하는 읽기 전용 점검 쿼리다.
Supabase SQL Editor 에 붙여넣고 실행한다.

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
