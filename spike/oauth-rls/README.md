# Validation Spike — Supabase OAuth 2.1 + RLS

`FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md` rev.2의 인증 설계에서 **실측이 필요한 4가지**를
확인한다. 일회용 검증 도구이고 앱 코드가 아니다 — 결론이 나면 삭제해도 된다.

| # | 확인할 것 | 설계 근거 |
|---|---|---|
| 1 | 실제 OAuth 토큰에 `client_id` 클레임이 들어오는가 | §6.5 / Q1 |
| 2 | OAuth 토큰은 SELECT만 되고 INSERT/UPDATE/DELETE는 RLS에서 막히는가 | §6.5 / M5 |
| 3 | 일반 FocusFlow 로그인의 기존 CRUD가 정상인가 (회귀) | §4 |
| 4 | User A 토큰으로 User B 데이터에 접근할 수 없는가 | §14 |

## 왜 Claude가 직접 돌리지 않았나

1·2·4는 **두 계정으로 실제 로그인**해야 한다. 비밀번호를 입력하거나 계정을 만드는 일은
Claude가 하지 않는다. 그래서 검증 자체를 스크립트로 만들어 두었고, 자격증명은 실행하는
사람이 자기 셸에서 넣는다. Claude는 자격증명을 보지 않는다.

저장소에 `.env`가 없고 Supabase 프로젝트 ref도 코드 어디에도 없어서, 프로젝트 URL조차
알 수 없는 상태이기도 하다.

## 준비물

- Supabase 프로젝트 URL과 anon key
- **테스트 계정 2개** (A, B). 실데이터 계정을 써도 되지만 §"데이터 영향"을 먼저 읽을 것
- 대시보드에서 **Authentication > OAuth Server 활성화** (probe가 확인해 준다)
- Node 18+ (저장소 루트에서 실행 — `@supabase/supabase-js`가 이미 설치돼 있다)

## 실행

### 0단계 — 자격증명 없이 되는 것부터

```bash
SUPABASE_URL=https://<ref>.supabase.co node spike/oauth-rls/probe.mjs
```

OAuth 2.1이 켜져 있는지, DCR이 가능한지, JWT 서명이 대칭인지 비대칭인지,
authorize/token/register 실제 경로가 무엇인지를 출력한다. 여기서 실패하면 다음 단계는 무의미하다.

### 1단계 — 정책 **없이** 한 번

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_ANON_KEY=<anon key> \
USER_A_EMAIL=a@example.com USER_A_PASSWORD=... \
USER_B_EMAIL=b@example.com USER_B_PASSWORD=... \
node spike/oauth-rls/spike.mjs
```

기대 결과: **1 PASS · 2 FAIL · 3 PASS · 4 PASS**

2번의 FAIL은 정상이다 — 정책을 아직 안 걸었으니 OAuth 토큰으로 쓰기가 된다는 뜻이고,
그것이 §6.5 정책이 필요한 이유를 실증한다.

**1번이 FAIL이면 여기서 멈춘다.** `client_id` 클레임이 없으면 정책을 걸 수 없다.
설계 §6.5를 Custom Access Token Hook 또는 애플리케이션 층 단독 의존으로 바꿔야 한다.

### 2단계 — 정책 적용 후 다시

`policy.sql`의 **§1 부분만** SQL Editor에서 실행한 뒤 같은 명령을 다시 돌린다.

기대 결과: **1·2·3·4 전부 PASS**

3번이 FAIL로 바뀌면 정책이 일반 로그인의 쓰기까지 막은 것이다 →
`auth.jwt() ->> 'client_id'`가 세션 토큰에서도 값을 갖는다는 뜻이므로 §6.5는 성립하지 않는다.
`policy.sql` §3으로 롤백할 것.

### DCR이 꺼져 있다면

대시보드에서 OAuth 클라이언트를 수동으로 만들고 두 값을 추가로 넘긴다:

```bash
OAUTH_CLIENT_ID=<client id> OAUTH_REDIRECT_URI=http://localhost:54321/spike-callback
```

## 데이터 영향

`public.tasks`에 id가 `spike-`로 시작하는 임시 행을 **최대 4개** 만들고 끝에 지운다.
예외로 중단돼도 `finally`에서 정리한다. 그래도 남으면:

```sql
delete from public.tasks where id like 'spike-%';
```

이 행들은 로컬 앱의 다음 동기화에서 사라진다(`buildSyncPlan`이 로컬에 없는 id를 지운다).
그 전에 앱을 열면 제목이 "spike: ..."인 작업이 잠깐 보일 수 있다.

또 하나: 승인 과정에서 A 계정에 **OAuth grant가 실제로 남는다**. 검증이 끝나면
앱의 설정에서(또는 `supabase.auth.oauth.revokeGrant({ clientId })`로) 해지할 것.

## 결과를 어디에 반영하나

- 1번 결과 → 설계 §6.5, §23 Q1, §19 M5의 확정 또는 대안 전환
- 2번 결과 → §22 인수 조건 12번
- 4번 결과 → §22 인수 조건 10·11번
- probe의 JWKS 결과 → SEC-1(비대칭 서명 마이그레이션)의 착수 여부

## 검증하지 않는 것

- MCP 프로토콜 자체(툴 목록, 호출) — Phase 4
- 동의 화면 UI — Phase 5. 스파이크는 `approveAuthorization`을 직접 불러 UI를 건너뛴다
- 토큰 만료/refresh — Phase 5
- ChatGPT/Claude 실제 연결 — Phase 6·7
