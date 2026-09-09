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
2. `021_022_preflight.sql` 실행. **모든 행이 OK** 여야 한다.
   STOP 이 있으면 부분 적용 상태이거나 선행 마이그레이션이 빠진 것이므로 적용하지 않는다.
3. `supabase/migrations/021_google_inbound_cursor.sql` 을 **통째로** 실행한다.
4. `supabase/migrations/022_google_sync_protocol.sql` 을 **통째로** 실행한다.
5. `021_022_verify.sql` 실행. **모든 행이 OK** 여야 한다.
6. 앱에서 구글 캘린더 카드의 "다시 확인" 을 누른다. 빨간 문구가 사라져야 한다.

### 이 적용이 무엇을 켜지 않는가

021+022 는 구조만 설치하고 동작은 그대로 둔다. 확인된 사실:

- `google_task_sync_accounts.enabled` 는 `default false` 다. 새 작업 동기화는 꺼진 채다.
- `minimum_google_protocol` 은 `default 1` 이라 현재 클라이언트가 보내는 프로토콜 1 이
  계속 허용된다 (`authorize_google_token(user,1,null)` → `{"allowed":true,"minimumProtocol":1}`).
- `guard_task_revision` 은 계정이 `enabled` 일 때만 legacy 쓰기를 막는다. 지금은 revision 만
  증가시키고 기존 작업 저장 경로는 그대로 동작한다.

023–034 적용과 계정 활성화는 별개의 작업이며 `docs/google-task-rollout.md` 를 따른다.

### 검증 방법

001–020 을 적용한 PGlite PostgreSQL 에 021, 022 를 순서대로 적용해 위 세 가지를 확인했다.
preflight 는 적용 전 17개 항목 전부 OK, 021 만 적용한 부분 상태에서는 STOP 을 낸다.
verify 는 적용 후 11개 항목 전부 OK.
