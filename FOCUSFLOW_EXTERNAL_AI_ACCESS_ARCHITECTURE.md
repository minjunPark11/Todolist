# FocusFlow External AI Access Architecture

> 상태: **설계 · 감사 (구현 전)** · 2026-08-27
> 개정 **rev.5** — OAuth server 활성화 후 0단계 재실행: Q9·Q10·DCR 전부 해소(§26.4b). 검증 1~4는 자격증명 대기.
> 개정 **rev.4** — Validation Spike 0단계 실행 결과 반영(§26.4). OAuth server가 꺼져 있어 검증 1~4는 대기.
> 개정 **rev.3** — RRULE 확장을 V1 필수로 승격(§9.2.1), Validation Spike 추가(§26).
> 개정 **rev.2** — 인증 구조 전면 수정. Supabase Auth의 OAuth 2.1 Server를 확인한 결과 rev.1의 "자체 OAuth AS + JWT 직접 서명" 설계는 **철회**한다. 상세는 §6 및 §25 개정 기록.
> 목표: FocusFlow를 개인 데이터 소스(MCP Service)로 만들어 ChatGPT / Claude가 사용자 데이터를 안전하게 읽게 한다
> 선행: `LOCAL_AI_REMOVAL_DESIGN.md` (내부 AI 제거, 실행 완료)
> 이 문서의 주장은 저장소 코드에 file:line으로, 외부 규격은 공식 문서 URL로 근거를 단다.

---

## 1. Executive Summary

목표는 타당하고, 도메인 계층은 이미 이 일에 알맞게 생겼다. **인증은 rev.1에서 걱정한 것보다 훨씬 간단하다** — Supabase Auth가 OAuth 2.1 Authorization Server로 동작하므로 FocusFlow는 서명키를 하나도 갖지 않는다(§6).

남은 blocker는 **데이터 쪽 셋**이다.

| # | 발견 | 영향 |
|---|---|---|
| **B1** | **Supabase는 Single Source of Truth가 아니다.** 진짜 저장소는 기기 localStorage(`focusflow.appData.v1`)이고, Supabase는 로그인했을 때만 도는 **선택적 미러**다 | 로그인/동기화하지 않은 사용자는 계정에 데이터가 0건 → §19 M2에서 "AI 연결 = 클라우드 동기화 필수"로 제품 규칙화 |
| **B2** | **모든 테이블이 `(id text, user_id uuid, data jsonb)` 한 모양이고 인덱스가 PK뿐이다** | 서버 측 필드 질의 불가. 모든 Tool이 필요한 테이블을 통째로 읽어 메모리에서 거른다 |
| **B3** | **타임존이 저장되지 않는다.** 날짜는 전부 기기 로컬 벽시계 문자열(`YYYY-MM-DD`) | 서버가 "오늘"을 모른다. `get_current_context`의 전제 → §19 M1 |
| **B4** | **OAuth access token은 사용자 세션 토큰과 동등한 권한을 가진다.** 커스텀 scope가 지원되지 않는다 ([oauth-flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)) | "읽기 전용"을 토큰으로 강제할 수 없다 → RLS에서 `client_id` 클레임으로 쓰기를 막는다(§6.5). rev.1의 `scope: focusflow.read` 설계는 폐기 |

좋은 소식 넷:

1. **RLS가 이미 완전하다.** 24개 테이블 전부 `auth.uid() = user_id`로 4개 동사가 잠겨 있다(§4).
2. **Supabase가 OAuth AS·DCR·PKCE·discovery를 다 해준다.** FocusFlow가 만들 것은 **동의 화면 한 장**뿐이다(§6).
3. **설치된 `@supabase/supabase-js@2.108.2`에 이미 `supabase.auth.oauth.*`가 있다** — `getAuthorizationDetails` / `approveAuthorization` / `denyAuthorization` / `listGrants` / `revokeGrant` (`node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:2248,2265,2282,2294,2309`). **의존성 업그레이드 불필요.**
4. **순수 도메인 계층이 서버에서 그대로 돈다**(§7.2). ICS 파서도 순수 함수다(`src/lib/externalCalendars.ts:121`) — §9.2의 캘린더 문제를 푸는 열쇠.

권장: **기존 Vercel serverless 확장(§17)** + **Supabase OAuth 2.1(§6)** + **ICS 서버 fetch로 캘린더 완결(§9.2)** + **AI 연결 사용자에게 클라우드 동기화 필수화(§19 M2)**.

---

## 2. Current Architecture Audit

### 2.1 저장소 / 동기화

```
[사용자 조작]
   ↓
usePlannerData (React 상태, src/hooks/usePlannerData.ts, 2505줄)
   ↓ 항상
localStorage  "focusflow.appData.v1"      ← 실제 저장소
   ↓ 로그인했을 때만, 700ms 디바운스
saveQueue → buildSyncPlan → Supabase 17개 테이블 upsert/delete
```

| 사실 | 근거 |
|---|---|
| 로컬 저장이 1차 | `src/domain/migrations/persistPlannerData.ts:5` — `PLANNER_STORAGE_KEY = "focusflow.appData.v1"` |
| Supabase 미설정이면 아예 없음 | `src/services/supabaseClient.ts:21-24` — `isSupabaseConfigured`가 false면 `supabase`는 `null` |
| 동기화는 이메일 로그인 이후에만 | `src/hooks/usePlannerData.ts:883-899` |
| 저장은 디바운스 큐 | `src/hooks/usePlannerData.ts:914` — 700ms |
| 무엇을 쓸지는 순수 함수가 결정 | `src/domain/sync/buildSyncPlan.ts:19-36` — `collectionTables` 17쌍 |
| 로드는 테이블 전체 select | `src/hooks/usePlannerData.ts:942~` — 각 테이블 `select("data")`, 페이지네이션·필터 없음 |
| 뒤늦게 추가된 테이블은 optional | `src/domain/sync/buildSyncPlan.ts:40-54` |
| 계획 실행(업서트/삭제) 위치 | `src/hooks/usePlannerData.ts:1087-1150` — §19 M4의 삽입 지점 |

### 2.2 데이터 모델 (실제 필드)

**Task** — `src/types.ts:58-211`. 요청서 위시리스트와 대조:

| 요청 필드 | 실제 | 위치 |
|---|---|---|
| title / description | ✅ (+ `contentMode`로 description/checklist 전환) | `types.ts:59-67` |
| status | ✅ 단, 사실상 **술어(predicate)로 읽는다** | `types.ts:30-51`, `domain/tasks/taskState.ts:84-126` |
| priority | ✅ `none/low/medium/high` | `types.ts:52` |
| start / due date | ✅ `startDate`, `dueDate` (`""` = 미설정) | `types.ts:70-88` |
| start / end time | ✅ `startTime`, `endTime` (`HH:mm`) | `types.ts:89-90` |
| estimated duration | ✅ `estimatedMinutes` (0 = 미설정) | `types.ts:97` |
| recurrence | ✅ `repeatType/Interval/Days/EndDate` | `types.ts:190-193` |
| subtasks | ✅ `Subtask` 레코드 + 부모-자식 Task(`parentTaskId`) 두 갈래 | `types.ts:212-219`, `domain/tasks/children.ts:32` |
| checklist | ✅ `CheckItem` 별도 테이블 | `types.ts:712`, `domain/tasks/checkItems.ts:53` |
| tags | ✅ `task.tags: string[]` + `Tag`/`TaskTag` 테이블 (두 경로 공존) | `types.ts:96,666,806` |
| list / project | ✅ `listId?`, `projectId` (Project == Space) | `types.ts:170,441-497` |
| dependencies | ✅ `blockedByTaskId` — **선행 작업 1개만** | `types.ts:166`, `domain/tasks/dependencies.ts:42` |
| notes | ✅ `notes` (description과 별개) | `types.ts:96` |
| completion state | ✅ `completedAt`/`wontDoAt`/`deletedAt`/`archivedAt` (status와 이중, status 우선) | `types.ts:119-152` |
| created/modified | ✅ `createdAt`, `updatedAt` | `types.ts:117-118` |

**FocusSession** `types.ts:504-526` · **Project(=Space)** `types.ts:441-497` · 계층 Space→Folder?→List→Task `types.ts:297-421`.

**Calendar Event 레코드는 존재하지 않는다.** 캘린더는 파생물이다 (`src/utils/calendarItems.ts:34-70`):

```
CalendarItem = Task(startDate/dueDate/startTime/endTime)   layer "task"
             + ExternalCalendarEvent (ICS 구독)             layer "external"
             + FocusSession.segments                        layer "focus-actual"
```

### 2.3 인증

| 사실 | 근거 |
|---|---|
| Supabase Auth 이메일+비밀번호. 소셜 provider 설정 코드 없음 | `usePlannerData.ts:1168,1183,1211` |
| 세션은 supabase-js가 관리, 앱은 email만 상태로 보유 | `usePlannerData.ts:861-874` |
| user id는 필요 시 `auth.getUser()` | `usePlannerData.ts:929-940` |
| **workspace / organization / team 모델 없음.** 소유권 축은 `user_id` 하나 | 마이그레이션 전체에 `workspace_id`/`owner_id`/`org_id` 0건 |
| **supabase-js가 OAuth 2.1 Server API를 이미 노출** | `@supabase/auth-js@2.108.2` `AuthOAuthServerApi` (`types.d.ts:2248-2309`) |

### 2.4 서버 (현재 존재하는 것 전부)

| 위치 | 무엇 | 런타임 |
|---|---|---|
| `api/ics.js` | 외부 ICS 동일출처 프록시. **SSRF 차단 포함**(`:8-21`), 5MB 상한(`:6`) | Vercel Function |
| `api/calendar/[token].js` | 공개 캘린더 공유 → ICS. **service_role 사용** | Vercel Function |
| `src-tauri/src/main.rs` | 트레이/미니타이머/백업 | 데스크톱 로컬 |
| Supabase Edge Functions | **없음** (`supabase/`에 `migrations/`만) | — |

### 2.5 기존 AI

전부 제거됨(`LOCAL_AI_REMOVAL_DESIGN.md` §8). 이 설계는 그 잔재를 재사용하지 않는다(§18).

---

## 3. Current Data Ownership Model

### 3.1 테이블 24개 — 전부 같은 모양

```sql
create table public.<name> (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);
```
(`supabase/migrations/001_initial_schema.sql:3-10`, 이후 전부 동일)

예외는 `calendar_shares` 하나: PK가 `user_id`, `token text unique`, `enabled boolean` (`003_calendar_shares.sql:1-9`).

| 분류 | 테이블 |
|---|---|
| 동기화 대상 (17) | tasks, projects, subtasks, focus_sessions, learning_paths, spaces, folders, lists, sidebar_folders, list_sections, saved_filters, daily_plans, tags, task_tags, check_items, reminders, task_templates |
| 설정 (1, 행 2개) | settings — `id="settings"`(`usePlannerData.ts:1131`), `id="app_settings"`(`:1144`) |
| 공유 (1) | calendar_shares |
| **고아 — 제품에 없는데 테이블만 남음 (5)** | habits, habit_logs, study_topics, concept_notes, space_notes |

`space_notes`가 `collectionTables`에서 빠진 이유는 `buildSyncPlan.ts:10-18`에 있다 — 목록에 넣으면 첫 동기화가 그 테이블을 전부 지운다.

### 3.2 Supabase에 **없는** 사용자 데이터 (기기 로컬 전용)

| 키 | 내용 | 근거 |
|---|---|---|
| `focusflow.externalCalendars.v1` | **ICS 구독의 이벤트 캐시** | `src/lib/externalCalendars.ts:11,213,227` |
| `focusflow.calendarCategories.v1` | 캘린더 카테고리(색/표시) | `src/lib/calendarCategories.ts:61` |
| `focusflow.focusSettings.v1` | 포커스 사용자 설정 | `src/lib/focusSettingsStorage.ts` |
| `focusflow.tasks.recents.v1` 외 | 기기 UI 상태 | — |

단 **ICS 구독 목록(URL 포함)은 동기화된다**: `PlannerSettings.externalCalendars` (`src/types.ts:530`, `usePlannerData.ts:400`). 서버는 "어디서 가져오는지"를 안다 → §9.2가 이걸 이용한다.

---

## 4. Security / RLS Audit

### 4.1 RLS — 결론: **읽기에 대해서는 현재 구조로 충분하다**

24개 테이블 전부 `enable row level security` + 4개 정책이 `auth.uid() = user_id`.

- 일괄 생성 루프: `001_initial_schema.sql:106-172` (8개 테이블)
- 개별 선언: `004`~`016` 각 파일

| 점검 항목 | 결과 |
|---|---|
| RLS 미적용 테이블 | **0** |
| `using (true)` 등 느슨한 정책 | **0** |
| `security definer` 함수 | **0** (`set_updated_at()`은 단순 트리거, `001:73-79`) |
| anon 읽기 정책 | **0** |
| 클라이언트의 service_role 사용 | **0** (anon key만, `supabaseClient.ts:4,24`) |
| 앱 레벨 user_id 필터 의존 | 쓰기 경로에만, RLS와 **중복 방어** (`usePlannerData.ts:1100,1117`) |

**단 하나 부족한 것**: OAuth 클라이언트가 받은 토큰은 세션 토큰과 동등하므로(B4), 현재 정책은 **Claude/ChatGPT에게 발급된 토큰의 쓰기도 허용한다.** §6.5가 이를 막는다.

### 4.2 service_role 사용처 — 딱 한 곳

`api/calendar/[token].js:6,47-54`. 평가: **의도된 설계이며 남용이 아니다** — 토큰 형식 검증 후(`:34-38`) 1개 테이블 2개 컬럼만, 사용자가 명시적으로 공개한 축소 스냅샷(`src/lib/calendarShare.ts:16-28`), 읽기 전용.
**그러나 MCP의 선례가 되어서는 안 된다.** rev.2 설계에서 MCP 데이터 경로는 service_role을 쓰지 않는다(§6.4).

### 4.3 남은 취약 지점

| # | 사안 | 심각도 | 비고 |
|---|---|---|---|
| S1 | `calendar_shares.token` 활성 동안 인증 없이 일정 제목/시각 노출 | 낮음(설계상 의도) | 만료·회전 정책 없음 |
| S2 | 고아 테이블 5개에 옛 데이터 잔존 가능 | 낮음 | RLS는 걸려 있음. MCP allowlist에서 제외 |
| S3 | jsonb `data`에 DB 제약이 없다 | 중간 | `domain/schedule/types.ts:44-48`이 명시. MCP 출력은 **반드시 화이트리스트 투영**(§16) |
| S4 | `SUPABASE_SERVICE_ROLE_KEY`가 이미 Vercel 환경에 존재 | 중간 | MCP 코드가 실수로 집어 쓰기 쉽다 → §6.4 + CI 규칙(§22) |
| S5 | **DCR을 켜면 누구나 클라이언트로 등록 가능** | 중간 | 등록 자체는 데이터 접근이 아니다(사용자 동의가 별도 관문). 그래도 §21 R4 참조 |

---

## 5. Target Architecture

```
   사용자
     │  "나 다음으로 뭐 해야 해?"
     ▼
ChatGPT / Claude  ── MCP client
     │  ① OAuth 2.1 (PKCE + DCR)  →  Supabase Auth  ← FocusFlow는 서명키 없음
     │  ② Authorization: Bearer <Supabase가 발급한 사용자 access token>
     ▼
┌──────────────────────────────────────────────────────────┐
│  FocusFlow MCP Endpoint   (api/mcp, Vercel Function)     │
│   1. Transport / JSON-RPC (MCP SDK)                      │
│   2. 토큰 검증: getClaims() → sub(user), client_id       │
│   3. Tool registry (read/ 만 노출, write/ 는 비어 있음)  │
│                        ↓                                  │
│  Query Layer  src/server/data/**      ← AI를 모른다       │
│                        ↓ 재사용                           │
│  순수 도메인  src/domain/**, utils/todayView 등            │
│                        ↓ 유일한 I/O                       │
│  Repository: PostgREST 호출                               │
│     Authorization: Bearer <그 사용자의 access token 그대로>│
└──────────────────────────────────────────────────────────┘
                         ↓
                 Supabase PostgREST
                         ↓
                 **RLS = 최종 경계**  auth.uid() = user_id
                 (+ client_id 클레임으로 쓰기 차단, §6.5)
```

핵심 규칙 5개:

1. **Query Layer는 MCP를 import하지 않는다.** 방향은 MCP → Query Layer 한쪽뿐 (AI Provider Independence).
2. **MCP 서버는 어떤 서명키도 보유하지 않는다.** 사용자 토큰을 받아 **그대로** PostgREST에 전달한다.
3. **service_role 클라이언트를 데이터 경로에 만들지 않는다.**
4. **Tool 출력은 화이트리스트 투영만.** jsonb 원본을 그대로 반환하는 경로가 존재하지 않게 한다(§16).
5. **read/write는 디렉터리부터 분리.** V1에 `write/`는 빈 디렉터리다(§9.4).

---

## 6. Authentication Architecture

### 6.1 rev.1의 오류와 정정

rev.1은 "Supabase Auth는 서드파티 OAuth AS가 아니다"라고 판단해 **자체 AS + 자체 토큰 테이블 4개 + 60초 사용자 JWT 직접 서명**을 설계했다. **이는 사실 오인이었다.** Supabase Auth는 OAuth 2.1 Server 기능을 제공하며 MCP 인증 스펙을 충족한다.

| rev.1 | rev.2 |
|---|---|
| 자체 authorize/token/register/revoke 엔드포인트 4개 | **불필요.** Supabase의 `/auth/v1/oauth/*` 사용 |
| `mcp_oauth_clients`/`mcp_authorization_codes`/`mcp_connections`/`mcp_tokens` 4개 테이블 | **불필요.** Supabase가 클라이언트·코드·토큰·grant를 관리 |
| MCP 서버가 JWT secret 또는 signing key 보유 | **보유하지 않는다** |
| "JWT 서명 방식 확인"이 blocker | **blocker 아님.** §6.6에서 별도 보안 개선으로 분리 |
| 커스텀 scope `focusflow.read` | **불가능**(커스텀 scope 미지원). §6.5로 대체 |

### 6.2 목표 구조

```
MCP Client (Claude / ChatGPT)
   ↓ OAuth 2.1 + PKCE (+ Dynamic Client Registration)
Supabase Auth  /auth/v1/oauth/{authorize,token,userinfo}
   ↓ 발급
Supabase user access token (표준 Supabase JWT: sub, role, aud, client_id)
   ↓ Authorization: Bearer …
FocusFlow MCP  (검증만 하고 그대로 전달)
   ↓ 같은 토큰
PostgREST / Supabase REST
   ↓
기존 RLS: auth.uid() = user_id
```

### 6.3 연결 흐름 (ChatGPT·Claude 공통)

```
1. 커넥터에 https://<app>/api/mcp 입력
2. 서버 401 + WWW-Authenticate: Bearer resource_metadata="https://<app>/.well-known/oauth-protected-resource"
3. 클라이언트가 protected-resource 메타데이터 조회
      → authorization_servers: ["https://<ref>.supabase.co/auth/v1"]
4. AS 메타데이터 조회
      https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1
5. (DCR 활성 시) 클라이언트가 자신을 등록
6. 브라우저: https://<ref>.supabase.co/auth/v1/oauth/authorize
      ?response_type=code&client_id=…&redirect_uri=…
      &code_challenge=…&code_challenge_method=S256
   → Supabase가 파라미터 검증 후 **FocusFlow의 동의 화면**으로 리다이렉트
      https://<app>/oauth/consent?authorization_id=…
7. 동의 화면 (FocusFlow가 만드는 유일한 인증 UI, §6.4)
8. 승인 → Supabase가 authorization code 발급(10분, 1회용)
9. 클라이언트가 /auth/v1/oauth/token 에서 code + verifier → access(1h) + refresh(회전)
10. 이후 MCP 요청: Authorization: Bearer <access token>
```

FocusFlow가 새로 만드는 HTTP 표면은 **두 개뿐**이다: `/api/mcp`와 `/.well-known/oauth-protected-resource`. 그리고 페이지 하나: `/oauth/consent`.

### 6.4 동의 화면 (FocusFlow가 만드는 것)

`supabase.auth.oauth` API를 그대로 쓴다. **설치된 2.108.2에 이미 있다**(§1-3).

```ts
// /oauth/consent  — authorization_id 를 쿼리로 받는다
const { data: claims } = await supabase.auth.getClaims();
if (!claims) → 기존 FocusFlow 로그인 화면으로 (returnTo 보존)

const { data: details } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
//   details.client.name  →  "Claude" / "ChatGPT"
//   details.scope

// ★ FocusFlow 고유의 게이트 (§19 M2):
//   - 클라우드 동기화가 꺼져 있으면 승인 버튼을 막고 "먼저 동기화" 안내
//   - 이 계정에 데이터가 0건이면 uploadLocalDataToSupabase() 유도

승인 → supabase.auth.oauth.approveAuthorization(authorizationId)
거부 → supabase.auth.oauth.denyAuthorization(authorizationId)
```

**연결 관리 UI**도 자체 테이블 없이 된다: 설정 화면에서 `supabase.auth.oauth.listGrants()`로 목록을, `revokeGrant({ clientId })`로 해지를 처리한다(`types.d.ts:2294,2309`). 해지 시 해당 클라이언트의 세션·refresh token이 즉시 무효화된다.

### 6.5 읽기 전용을 무엇으로 강제하는가 (B4 대응)

커스텀 scope가 없으므로 **"읽기 전용 토큰" 같은 것은 존재하지 않는다.** 두 겹으로 막는다.

**(1) 애플리케이션 층 — MCP 서버가 write 툴을 노출하지 않는다.**
V1에 write 툴이 아예 없으므로 AI는 쓰기를 시도할 방법이 없다. 다만 이것은 *MCP를 통한* 경로만 막는다.

**(2) 데이터베이스 층 — RLS에서 `client_id` 클레임으로 쓰기를 차단한다.** ★핵심

Supabase가 발급한 OAuth 토큰에는 `client_id` 클레임이 있고 일반 세션 토큰에는 없다. 이 차이가 "사람이 앱에서 하는 쓰기"와 "AI 클라이언트의 쓰기"를 DB가 구분할 수 있게 한다.

```sql
-- 예시(tasks). 17개 동기화 테이블 전부에 동일 적용.
-- 읽기 정책은 그대로 두고, 쓰기 3개만 조건을 덧붙인다.
drop policy if exists "Users can insert own tasks" on public.tasks;
create policy "Users can insert own tasks" on public.tasks
  for insert with check (
    auth.uid() = user_id
    and (auth.jwt() ->> 'client_id') is null   -- OAuth 클라이언트 토큰이면 거부
  );
-- update / delete 도 동일하게 using + with check 에 조건 추가
```

이것이 왜 중요한가: 토큰이 유출되더라도 그 토큰으로는 **PostgREST에 직접 붙어도 읽기만** 된다. V1의 "READ ONLY"가 애플리케이션 약속이 아니라 **DB가 강제하는 사실**이 된다.

V2에서 쓰기를 열 때는 이 정책을 특정 `client_id` 허용 목록으로 완화하면 되고, 그때도 기본값은 거부다.

> **확인 필요(§23 Q1)**: `auth.jwt()`가 OAuth 토큰의 `client_id`를 그대로 노출하는지 실측이 필요하다. 노출되지 않으면 대안은 (a) Custom Access Token Hook으로 클레임을 심거나, (b) 애플리케이션 층 (1)에만 의존하고 그 사실을 문서화하는 것이다.

### 6.6 JWT 서명 방식 — blocker에서 제외

rev.1은 이것을 blocker로 뒀지만, rev.2에서는 **MCP 서버가 서명을 하지 않으므로 blocker가 아니다.** 토큰 검증은 두 경로 모두에서 동작한다:

| 프로젝트 상태 | `supabase.auth.getClaims(token)` 동작 |
|---|---|
| legacy HS256 secret | Auth 서버에 원격 검증 요청 (네트워크 1회) |
| asymmetric signing key (RS256/ES256) | JWKS로 **로컬 검증** (네트워크 0회) |

즉 서명 방식은 **성능과 견고성의 문제이지 가능/불가능의 문제가 아니다.**

→ **asymmetric signing key 마이그레이션은 별도 보안 개선 항목(SEC-1)으로 분리한다.** 이점: (a) MCP 요청마다의 원격 검증 왕복 제거, (b) OIDC ID 토큰 사용 시 필수, (c) 키 회전 용이. MCP V1의 선행 조건은 아니다.

### 6.7 토큰 취급 규칙

- MCP 서버는 access token을 **저장하지 않는다.** 요청 수명 동안만 메모리에 두고 PostgREST 호출에 전달한다.
- refresh token은 **MCP 클라이언트(Claude/ChatGPT)가 보관**한다. FocusFlow는 보지 않는다.
- 로그·에러 메시지·예외 스택에 토큰이 들어가지 않게 한다(§16).
- 검증 결과(`sub`, `client_id`, `exp`)는 요청 컨텍스트에만 싣는다.

### 6.8 여러 AI 클라이언트 동시 연결

Supabase의 grant가 `client_id` 단위이므로 ChatGPT와 Claude는 각각 독립된 grant·토큰을 갖는다. 한쪽 `revokeGrant`가 다른 쪽에 영향을 주지 않는다. 사용자에겐 설정 화면의 "연결된 AI" 목록으로 보인다(§6.4).

---

## 7. AI-independent Data Access Layer

### 7.1 위치

```
src/server/                       ← 신규. 브라우저 코드가 아님을 이름으로 못박는다
  data/
    repository.ts                 ← 유일한 Supabase I/O (사용자 토큰으로만)
    context.ts                    ← RequestContext
    projections.ts                ← jsonb → 공개 DTO 화이트리스트
    freshness.ts                  ← §19 M4의 동기화 메타데이터
    calendar/
      icsSource.ts                ← §9.2. 서버 측 ICS fetch + 캐시
    queries/
      currentContext.ts  todayTasks.ts  tasks.ts  taskDetail.ts
      calendar.ts  deadlines.ts  projects.ts  focus.ts
  mcp/                            ← §8. data/ 를 부르기만 한다
```

`src/server/data/**`는 `src/server/mcp/**`를 import하지 않는다. lint 규칙으로 강제(§22).

### 7.2 재사용 가능성 (실측)

`src/domain`·`src/utils`에서 `platform`/`react`/`supabaseClient`를 import하는 파일 전수 조사 결과:

```
src/domain/migrations/dropAiStorage.ts
src/domain/migrations/persistPlannerData.ts
src/domain/today/dailyPlan.ts          ← platform.storage (레거시 override 읽기, :173)
src/utils/notificationCopy.ts
src/utils/quickParse.ts
```

**그 외 전부 서버에서 그대로 돈다:**

| 모듈 | 쓸 곳 |
|---|---|
| `domain/tasks/taskState.ts:84-126` | 모든 Task 필터 |
| `domain/tasks/dependencies.ts:42-64` | 차단 여부 |
| `domain/tasks/children.ts:32-68` | 하위 작업 + 진행률 |
| `domain/tasks/checkItems.ts:53` | 체크리스트 완료율 |
| `domain/schedule/scheduleQueries.ts:36-92` | 일정·overdue 판정 |
| `domain/schedule/taskSchedule.ts` | Task → Schedule 어댑터 |
| `utils/todayView.ts:101-199` | 오늘 버킷 |
| `utils/date.ts` | 날짜 산술 |
| `domain/focus/selectors.ts:10` | 집중 요약 |
| `domain/spaces/membership.ts`, `hierarchy.ts` | List/Space 해석 |
| **`lib/externalCalendars.ts:121` `parseIcsEvents`** | **§9.2 — 순수 함수. 모듈에서 분리만 하면 서버에서 동작** |

소규모 추출 필요: `domain/today/dailyPlan.ts`(platform 의존 분리), `utils/calendarItems.ts`(`lib/externalCalendars`·`lib/calendarCategories`를 타고 platform에 닿음), `lib/externalCalendars.ts`(파서/포맷터를 platform 의존 없는 파일로 분리).

### 7.3 시그니처

`userId`가 아니라 `RequestContext`를 받는다 — 토큰 없이 부를 수 있는 함수가 생기면 §5 규칙 2·3이 깨진다.

```ts
export interface RequestContext {
  userId: string;      // 검증된 JWT의 sub
  accessToken: string; // 그대로 PostgREST에 전달
  clientId?: string;   // OAuth 클라이언트 식별 (로깅·정책용)
  timezone: string;    // §19 M1
  now: Date;
}

getCurrentContext(ctx)                     getTodayTasks(ctx, opts?)
getTasks(ctx, filter)                      getTaskDetail(ctx, taskId)
getSubtasks(ctx, taskId)                   getOverdueTasks(ctx)
getUpcomingDeadlines(ctx, days)            searchTasks(ctx, query, limit)
getCalendarRange(ctx, from, to)            getFreeTimeBlocks(ctx, date, dayStart, dayEnd)
getProjects(ctx)                           getProjectContext(ctx, projectId)
getFocusSummary(ctx, range)                getSyncFreshness(ctx)
```

### 7.4 Repository — B2 대응

jsonb 스키마상 서버 필터링이 불가능하므로 앱이 부팅 때 하는 일을 그대로 한다: 필요한 테이블만 통째로 읽고 메모리에서 판단.

```ts
const READABLE = ["tasks","subtasks","check_items","projects","lists","spaces",
                  "folders","list_sections","tags","task_tags","focus_sessions",
                  "daily_plans","reminders","settings"] as const;
loadSlice(ctx, tables): Promise<PlannerSlice>
```

- 고아 테이블 5개(§3.1)는 allowlist에 없다 — 존재 자체가 방어다.
- 요청 단위 캐시로 한 호출 안의 중복 로드를 막는다.
- Tool마다 필요한 테이블만 지정한다.
- 테이블당 5,000행 상한, 초과 시 `truncated: true`(§15).

---

## 8. MCP Server Architecture

### 8.1 배치 (Option C — §17)

```
api/
  ics.js                            (기존, §9.2에서 로직 재사용)
  calendar/[token].js               (기존)
  mcp/index.ts                      POST/GET — MCP Streamable HTTP
  .well-known/
    oauth-protected-resource.ts     ← RFC 9728. authorization_servers 를 Supabase로 지목
앱 라우트:
  /oauth/consent                    ← §6.4 동의 화면
  설정 > 연결된 AI                   ← listGrants / revokeGrant
```

**rev.1 대비 사라진 것**: `api/oauth/register.ts`, `api/oauth/token.ts`, `api/oauth/revoke.ts`, `.well-known/oauth-authorization-server.ts`. 전부 Supabase가 제공한다.

서버 코어는 `src/server/mcp/`에 두고 `api/mcp/index.ts`는 얇은 어댑터로 둔다 → 나중에 Edge Function으로 옮길 때 HTTP 껍데기만 교체.

### 8.2 요청 처리

```
1. Bearer 추출 → 없으면 401 + WWW-Authenticate(resource_metadata)
2. getClaims(token) 검증 → 실패/만료면 401
   - iss 가 우리 Supabase 프로젝트인지 확인 (confused deputy 방지)
   - aud 확인
3. RequestContext 구성 (sub, client_id, accessToken, timezone, now)
4. tool 실행 → Query Layer → Repository → PostgREST(RLS)
5. 투영 후 반환 + freshness 메타 첨부(§11.2)
```

### 8.3 상태성

MCP Streamable HTTP를 **stateless 모드**로 구현한다. Vercel Function은 인스턴스가 유지되지 않아 SSE 장기 세션·재개를 신뢰할 수 없고, V1 툴은 전부 짧은 읽기다.

---

## 9. MCP Tool Catalog

### 9.1 V1 (READ ONLY) — 12개

| Tool | 목적 | 읽는 소스 |
|---|---|---|
| `get_current_context` | §11. 한 번에 "지금 상황" 전부 | tasks, check_items, subtasks, focus_sessions, projects, lists, settings, **ICS** |
| `get_today_tasks` | 오늘 할 일 (버킷 포함) | tasks, daily_plans, check_items |
| `get_tasks` | 필터 조회 | tasks, projects, lists, task_tags |
| `get_task_detail` | 단일 Task 전체 | tasks, subtasks, check_items, reminders, projects, lists, tags |
| `get_subtasks` | 하위 작업 | subtasks, tasks |
| `get_overdue_tasks` | 기한 지난 미완료 | tasks |
| `get_upcoming_deadlines` | N일 내 마감 | tasks |
| `search_tasks` | 제목/설명 검색 | tasks |
| `get_calendar_events` | **Task 블록 + 외부 캘린더 + 집중 실적** | tasks, focus_sessions, **ICS** |
| `get_free_time_blocks` | 특정 날짜의 빈 시간 | tasks, focus_sessions, **ICS** |
| `get_projects` / `get_project_detail` | 프로젝트 목록·상세 | projects, lists, tasks |
| `get_focus_summary` | 기간 집중 통계 + 최근 세션 | focus_sessions, tasks |

`get_today_calendar`는 `get_calendar_events(from=to=오늘)`로, `get_project_tasks`는 `get_tasks({projectId})`로, `get_focus_history`는 `get_focus_summary`의 `recentSessions`로 흡수한다. **툴 개수는 AI의 선택 비용이다.**

### 9.2 외부 캘린더(ICS) — V1에 **포함한다**

rev.1의 `externalCalendarsIncluded: false`는 철회한다. "다음 일정 전까지 할 만한 작업"에 답하려면 실제 캘린더가 있어야 하고, 그것 없이는 §22의 인수 조건을 만족할 수 없다.

전제: **구독 URL은 이미 Supabase에 동기화된다**(`PlannerSettings.externalCalendars`, `types.ts:530`). 이벤트만 없다.

| 기준 | **안 1: MCP 요청 시 서버가 ICS fetch/parse** | 안 2: 이벤트를 Supabase에 mirror |
|---|---|---|
| **구현량** | **작다.** `api/ics.js:8-21`의 SSRF 차단 + `parseIcsEvents`(`externalCalendars.ts:121`) 재사용. 새 코드는 캐시 계층 정도 | **크다.** 새 테이블 + 정규화 스키마 + 동기화 주체(클라이언트? 크론?) + 삭제/갱신 diff + `buildSyncPlan` 확장. 삭제 diff는 `space_notes` 사고(`buildSyncPlan.ts:10-18`)와 같은 위험 |
| **Freshness** | **항상 원본 기준.** 캐시 TTL(5분)만큼만 지연 | 마지막 미러 시각에 의존. 기기가 꺼져 있으면 며칠 낡을 수 있다 |
| **Latency** | 나쁘다. 구독 3개 × 300~1500ms. 병렬화 + 캐시로 완화, 워스트 케이스는 여전히 존재 | **좋다.** DB 읽기 한 번 |
| **Privacy** | **좋다.** 이벤트가 우리 DB에 저장되지 않는다. 서버가 사용자 대신 외부 요청을 한다는 점만 남는다 | 나쁘다. 회의 제목·참석자·장소가 우리 DB에 상주 → 유출 반경 확대, 보관·삭제 정책 필요 |
| **Failure** | 실패가 **요청 단위**. 부분 성공(`partial: true`)으로 "외부 캘린더 2개 중 1개 실패"를 AI에게 정확히 알릴 수 있다 | 실패가 **조용하다.** 미러가 3일 전에 깨졌으면 AI는 낡은 데이터를 최신으로 믿는다 — 가장 나쁜 실패 양식 |
| **비용** | 무료 tier 내. 요청당 외부 fetch가 늘어남 | 크론/Edge Function 추가 필요 |

**V1 권장: 안 1 (서버 측 fetch/parse + 캐시).**

이유 세 가지. (a) 재사용 가능한 코드가 이미 있어 구현량이 압도적으로 작다. (b) 개인 캘린더 원문을 우리 DB에 복제하지 않는 쪽이 §16의 최소화 원칙과 맞다. (c) **실패가 보인다** — 미러 방식의 조용한 낡음은 AI가 자신 있게 틀리게 만드는, 이 제품에서 가장 피해야 할 실패다.

구현 요지:

```ts
// src/server/data/calendar/icsSource.ts
- settings.externalCalendars 에서 enabled === true 인 구독만
- 구독 최대 5개, 각 5MB / 8초 타임아웃, 전체 예산 12초
- api/ics.js:8-21 의 호스트 차단 규칙을 공유 모듈로 추출해 그대로 적용 (SSRF)
- parseIcsEvents() 로 파싱 → 요청 범위(from~to)로 필터
- 캐시: (icsUrl 해시 → 파싱 결과) 5분. 서버리스 인스턴스 로컬 캐시로 시작
- 응답 메타: calendars: [{ name, ok, eventCount, error?, fetchedAt }]
```

안 2는 폐기가 아니라 **보류**다. latency가 실제 문제가 되면 V2에서 다시 꺼낸다.

### 9.2.1 RRULE 확장 — **V1 필수 항목**

현재 파서는 **RRULE을 확장하지 않는다**(`externalCalendars.ts:121-166`에 RRULE 처리 없음).
반복 일정은 DTSTART의 첫 인스턴스만 보인다.

앱에서는 이것이 "달력에 반복 회의가 안 보인다"는 표시 누락이었지만, **MCP에서는 계산이 틀리는
문제**가 된다. 매주 화요일 14:00 정기 회의가 빠지면 `get_free_time_blocks`는 그 두 시간을
비어 있다고 답하고, AI는 없는 시간에 작업을 배치한다. 사용자가 "다음 일정 전까지 할 만한 작업"을
물었을 때 **자신 있게 틀린 답**이 나오는 경로다 — §21에서 가장 피해야 할 실패 양식으로 꼽은 바로 그것.

따라서 **선택이 아니라 V1 인수 조건**으로 올린다(§22-19, §20 Phase 3).

**V1 지원 범위** (RFC 5545 전체가 아니라, 실제 캘린더가 쓰는 부분집합):

| 지원 | 항목 |
|---|---|
| ✅ 필수 | `FREQ=DAILY/WEEKLY/MONTHLY/YEARLY`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY`(요일 목록), `BYMONTHDAY` |
| ✅ 필수 | `EXDATE` — 취소된 회차. 없으면 취소한 회의가 살아난다 |
| ✅ 필수 | `RECURRENCE-ID` 오버라이드 — 한 회차만 시간이 바뀐 경우. 같은 UID의 별도 VEVENT가 해당 회차를 대체한다 |
| ✅ 필수 | **범위 한정 확장** — `from~to` 안에서만 전개. 무한 반복(`UNTIL`/`COUNT` 없음)에 대한 상한을 둔다 |
| ⛔ V1 제외 | `BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`, `WKST` 조합, `RDATE`의 PERIOD 형식 |
| ⛔ V1 제외 | VTIMEZONE 본문 파싱 (기존대로 TZID 문자열 + `Intl`로 처리) |

**구현 시 걸리는 기존 코드 사실 3가지** (실측):

1. `getIcsProperty`(`externalCalendars.ts:44`)는 **첫 줄만** 반환한다. `EXDATE`는 여러 줄로 올 수 있으므로 "전부 가져오기" 변형이 필요하다.
2. 이벤트 id가 `${calendarId}:${uid}`(`:145`)라 **같은 UID의 오버라이드 VEVENT가 id 충돌**을 일으킨다. 회차 id를 `${calendarId}:${uid}:${occurrenceDate}`로 바꿔야 한다 — 이건 지금도 존재하는 버그다.
3. TZID 이벤트는 벽시계 기준으로 전개하는 것이 옳다(매주 09:00은 DST를 넘어도 09:00). `parseIcsDate`(`:63`)가 TZID를 값에 적용하지 않고 문자열로 이월하므로 이 성질이 자연스럽게 유지된다. UTC(`Z`) 앵커 이벤트만 별도 주의가 필요하다.

**검증**: 순수 함수이므로 단위 테스트로 끝난다. Google/iCloud/Outlook이 실제로 뱉는 ICS 샘플을 고정 픽스처로 두고, 확장 결과를 스냅샷으로 잠근다. 외부 네트워크가 필요 없다.

전개 결과에는 `occurrenceOf: <uid>`를 실어 AI가 "같은 반복 일정의 다른 회차"임을 알 수 있게 한다.

### 9.3 Notes / Knowledge Base

요청서 §11의 A~E 분리 감사 결과: A(파일 접근/동기화/검색)를 포함해 전부 삭제됐다(`LOCAL_AI_REMOVAL_DESIGN.md` §8). `PlatformFiles` 표면 자체가 Obsidian vault 전용이었으므로 **살릴 대상이 남아 있지 않다.** FocusFlow가 가진 노트(`Task.notes`, `Task.description`)는 이미 `get_task_detail`에 있다. → **1차 scope 제외.**

### 9.4 Write Tool 대비 (구현하지 않음)

```
src/server/mcp/tools/
  read/       ← V1. 전부 여기
  write/      ← 빈 디렉터리 + README. V2
  registry.ts
```

`{ name, mode: "read" | "write", inputSchema, handler }`로 등록하고, V1 빌드는 `mode === "write"`를 `tools/list`에서 제외한다. **그리고 그것과 무관하게 DB가 쓰기를 거부한다**(§6.5) — 애플리케이션 실수와 무관한 두 번째 자물쇠다.

---

## 10. Tool Input / Output Schema

공통: 날짜 `YYYY-MM-DD`, 시각 `HH:mm`, 타임스탬프 ISO 8601. 미설정은 `null`이 아니라 **필드 생략**(토큰 절약).

### 10.1 공통 DTO

```ts
interface TaskSummary {
  id: string;
  title: string;
  status: "open" | "completed" | "wont_do";   // 술어로 계산 (taskState.ts)
  priority: "none" | "low" | "medium" | "high";
  dueDate?: string;  startDate?: string;
  startTime?: string;  endTime?: string;
  estimatedMinutes?: number;
  isOverdue: boolean;                          // ★ 서버 계산
  isBlocked: boolean;                          // ★ 서버 계산 (dependencies.ts:42)
  daysUntilDue?: number;                       // ★ 서버 계산 (음수 = 지남)
  listName?: string;  projectName?: string;
  tags?: string[];
  progress?: { done: number; total: number };  // ★ 체크리스트/하위작업
}

interface TaskDetail extends TaskSummary {
  description?: string;        // §16 길이 정책
  notes?: string;              // 〃
  contentMode: "description" | "checklist";
  recurrence?: { type: "daily"|"weekly"|"monthly"|"yearly"; interval: number;
                 days?: number[]; endDate?: string };
  subtasks:  Array<{ id: string; title: string; completed: boolean }>;
  checklist: Array<{ id: string; title: string; completed: boolean }>;
  blockedBy?: { id: string; title: string; resolved: boolean };
  blocking:  Array<{ id: string; title: string }>;
  reminder?: string;
  createdAt: string; updatedAt: string; completedAt?: string;
}

// 모든 툴 응답에 붙는 공통 메타 (§11.2)
interface ResponseMeta {
  freshness: {
    lastSyncedAt?: string;      // 계정에 마지막으로 동기화된 시각
    staleness: "live" | "recent" | "stale" | "unknown";
    syncedFromDevice?: string;  // 라벨만, 식별자 아님
  };
  externalCalendars?: Array<{ name: string; ok: boolean; eventCount?: number;
                              error?: string; fetchedAt?: string }>;
  truncated: boolean;
  partial: boolean;
}
```

**반환하지 않는 필드**: `order`, `sortKey`, `sectionId`, `statusId`, `previousStatus`, `categoryId`, `activeSessionId`, `listsRevealed`, `boardLists`, `features`, `deletedAt`, `archivedAt`, 그리고 `appSettings` 전체(테마·폰트·사이드바는 AI가 알 이유가 없다. 단 `timezone`은 예외적으로 사용 — 반환은 하되 설정값 전체는 노출하지 않는다).

### 10.2 툴별 스키마 (요약)

```ts
get_current_context: { input: {}, output: CurrentContext }              // §11

get_today_tasks: {
  input:  { includeCompleted?: boolean }
  output: { date; timezone;
            buckets: { now: TaskSummary[]; next: TaskSummary[]; later: TaskSummary[] };
            completedCount: number; meta: ResponseMeta }
}

get_tasks: {
  input:  { status?; projectId?; listId?; tag?; priority?;
            dueFrom?; dueTo?;            // 최대 366일
            limit?;                      // 기본 50, 최대 200
            cursor? }
  output: { items: TaskSummary[]; nextCursor?; total; meta }
}

get_task_detail:        { input: { taskId }, output: TaskDetail & { meta } }
get_subtasks:           { input: { taskId }, output: { items; meta } }
get_overdue_tasks:      { input: { limit? }, output: { items; total; meta } }
get_upcoming_deadlines: { input: { days? },  // 기본 7, 최대 90
                          output: { items; groupedByDate; meta } }
search_tasks:           { input: { query; limit? },   // query 2자 이상
                          output: { items; total; meta } }

get_calendar_events: {
  input:  { from; to;                          // 최대 92일
            include?: Array<"tasks"|"external"|"focus"> }   // 기본 전부
  output: { entries: CalendarEntry[]; meta: ResponseMeta }  // meta.externalCalendars 필수
}

get_free_time_blocks: {
  input:  { date; dayStart?; dayEnd? }         // 기본 09:00~22:00
  output: { date; blocks: Array<{ start; end; minutes }>;
            totalFreeMinutes; busy: Array<{ start; end; title; kind }>; meta }
}

get_projects:       { input: { includeArchived? }, output: { items; meta } }
get_project_detail: { input: { projectId },       output: ProjectDetail & { meta } }
get_focus_summary:  { input: { from?; to? },      // 기본 최근 14일
                      output: FocusSummary & { meta } }
```

```ts
interface CalendarEntry {
  kind: "task" | "external" | "focus";
  sourceId: string;
  calendarName?: string;        // kind === "external"
  title: string;
  date: string;
  startTime?: string; endTime?: string;
  allDay: boolean;
  location?: string;            // external 만
  completed?: boolean;          // task 만
}

interface FocusSummary {
  from; to;
  totalMinutes: number; sessionCount: number;
  byDay: Array<{ date; minutes; sessions }>;
  topTasks: Array<{ taskId; title; minutes }>;                          // 상위 5
  recentSessions: Array<{ taskId?; title; startedAt; minutes; completed }>; // 최근 10
}
```

---

## 11. Current Context Model

### 11.1 CurrentContext

```ts
interface CurrentContext {
  // 1. 시간 기준
  now: string;              // ISO 8601, 사용자 타임존 기준
  timezone: string;         // IANA
  today: string;            // YYYY-MM-DD (사용자 로컬)
  dayOfWeek: string;

  // 2. 오늘의 일정 — Task 블록 + 외부 캘린더 + 집중 실적이 모두 섞여 있다
  todaySchedule: CalendarEntry[];        // 시간순
  nextEvent?: CalendarEntry;
  minutesUntilNextEvent?: number;        // ★ 서버 계산
  freeMinutesUntilNextEvent?: number;    // ★ 서버 계산

  // 3. 할 일
  todayTasks:   { now: TaskSummary[]; next: TaskSummary[]; later: TaskSummary[] };
  overdue:      { count: number; items: TaskSummary[] };   // 상위 10
  upcoming:     { withinDays: 7; items: TaskSummary[] };   // 상위 10
  highPriority: TaskSummary[];                             // 상위 10

  // 4. 최근 집중
  focus: { last7DaysMinutes: number;
           lastSession?: { title; endedAt; minutes };
           activeSession?: { taskId; title; startedAt } };

  // 5. 메타
  counts: { openTasks: number; projects: number; lists: number };
  meta: ResponseMeta;      // freshness + externalCalendars + truncated/partial
}
```

서버가 계산해 넘기는 deterministic 값과 근거:

| 값 | 근거 |
|---|---|
| `isOverdue`, `daysUntilDue` | `domain/schedule/scheduleQueries.ts:92`, `utils/date.ts` `daysBetween` |
| `isBlocked` | `domain/tasks/dependencies.ts:42` |
| `progress` | `domain/tasks/checkItems.ts:53`, `domain/tasks/children.ts:57` |
| 오늘 버킷 | `utils/todayView.ts:101` — **앱 Today 화면과 같은 규칙** |
| free time / `freeMinutesUntilNextEvent` | 신규. Task 블록 + 외부 이벤트 + 집중 실적을 병합한 뒤 여집합 |
| `status` 3값 | `domain/tasks/taskState.ts:84-126` |

**FocusFlow는 "무엇을 먼저 하라"고 판정하지 않는다.** 위 목록은 전부 사실이지 판단이 아니다.

### 11.2 Freshness 메타데이터 (B1의 운영 대응)

로컬 우선 구조를 유지하는 이상, **계정의 데이터가 기기보다 낡을 수 있다는 사실을 숨기면 안 된다.** 모든 툴 응답이 `meta.freshness`를 싣는다.

| `staleness` | 기준 | AI가 해야 할 일 |
|---|---|---|
| `live` | 마지막 동기화 < 5분 | 그대로 답한다 |
| `recent` | < 24시간 | 그대로 답하되, 어긋나면 동기화를 언급 |
| `stale` | ≥ 24시간 | **답 앞에 "마지막 동기화가 N일 전"을 밝힌다** |
| `unknown` | 동기화 기록이 없음 | 데이터가 불완전할 수 있음을 밝힌다 |

툴 설명(description)에 이 규칙을 명시해 AI가 실제로 따르게 한다. 값의 출처는 §19 M4.

---

## 12. ChatGPT Connection Flow

```
ChatGPT → Settings → Connectors → Add custom connector
   URL: https://<app>/api/mcp
   ↓ 401 + WWW-Authenticate(resource_metadata)
   ↓ https://<app>/.well-known/oauth-protected-resource
        → authorization_servers: ["https://<ref>.supabase.co/auth/v1"]
   ↓ https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1
   ↓ (DCR) Supabase에 클라이언트 자동 등록
   ↓ 브라우저: Supabase authorize → FocusFlow /oauth/consent
        FocusFlow 로그인(기존 화면) → 동기화 상태 확인 → 동의
   ↓ code → token (access 1h, refresh 회전)
   ↓ initialize → tools/list → read 툴 12개
사용자: "오늘 뭐 해야 해?" → get_current_context → 답변
```

ChatGPT 커넥터의 요구사항(툴 이름 규칙, 필수 툴, 심사 절차)은 제품 정책에 따라 바뀐다. **실제 시도 없이 확정할 수 없으므로 Phase 7을 별도로 둔다.**

---

## 13. Claude Connection Flow

§12와 **완전히 동일한 엔드포인트·동일한 흐름**이다. MCP와 OAuth 2.1 모두 클라이언트 중립 규격이고, 이 설계에는 벤더 분기가 한 줄도 없다 — 요청서 §2.A의 요구가 이렇게 충족된다. 차이는 Supabase가 기록하는 `client_name` 문자열뿐이다.

---

## 14. Multi-user Isolation

```
User A의 Claude ─┐                                 A의 access token (sub=A)
                 ├→ 같은 /api/mcp → getClaims 검증 → ↓
User B의 ChatGPT─┘                                 그 토큰 그대로 PostgREST
                                                        ↓
                                     RLS: auth.uid() = user_id  → A의 행만
```

**"A가 B의 task id를 인자로 넣으면?"** — B의 행은 A의 토큰으로 조회 자체가 되지 않는다. Repository가 받은 집합에 B의 Task가 애초에 없으므로 `getTaskDetail`은 `NOT_FOUND`를 던진다. **`FORBIDDEN`이 아니라 `NOT_FOUND`다** — 존재 여부조차 알리지 않는다(§15).

이 성질을 보장하는 것은 애플리케이션 코드가 아니라 DB다. MCP 서버는 `user_id`로 필터링하는 코드를 **한 줄도 갖지 않는다** — 가질 수 없다. 그래서 §22의 인수 조건은 코드 리뷰가 아니라 실제 두 계정 시도다.

---

## 15. Error Handling

도구 오류는 JSON-RPC 오류가 아니라 **`isError: true` tool result**로 돌려준다(AI가 사용자에게 설명할 수 있어야 한다). 인증 실패만은 HTTP 401이어야 커넥터가 재인증을 시작한다.

| 상황 | 응답 |
|---|---|
| Authorization 헤더 없음 | HTTP 401 + `WWW-Authenticate` (OAuth 시작 신호) |
| 토큰 만료 | HTTP 401 `invalid_token` → 클라이언트가 refresh |
| grant 해지됨 | HTTP 401 → 재연결 유도 |
| 토큰의 `iss`/`aud`가 우리 프로젝트가 아님 | HTTP 401 (confused deputy 방지) |
| write 시도 (V2 이전) | 툴이 존재하지 않음 + DB 정책 거부(§6.5) |
| 없는 taskId | tool error `NOT_FOUND` |
| **다른 사용자의 taskId** | tool error `NOT_FOUND` — 동일 메시지, 동일 지연 |
| Supabase 장애 | `UPSTREAM_UNAVAILABLE` (원본 에러 문자열 노출 금지) |
| **외부 캘린더 일부 실패** | 성공 + `meta.partial = true` + `meta.externalCalendars[].error` |
| 외부 캘린더 전부 실패 | 성공(Task 일정만) + 위와 동일 표기 — 캘린더 실패가 툴 전체를 죽이지 않는다 |
| 일부 테이블 실패 | 부분 성공 + `partial: true` + 빠진 영역 명시 |
| 범위 초과 | `INVALID_ARGUMENT` + 허용 범위 안내 |
| 결과 상한 초과 | 잘라내고 `truncated: true` — 조용한 절단 금지 |
| 인자 형식 오류 | `INVALID_ARGUMENT` + 어떤 필드가 왜 |

---

## 16. Privacy / Logging

### 16.1 반환 정책

| 항목 | 정책 |
|---|---|
| `description` / `notes` | 목록 툴에서 반환하지 않음. `get_task_detail`만, 각 4,000자 상한 + `truncated` 표시 |
| 외부 캘린더 `description` | **반환하지 않는다.** 회의 초대 본문에는 링크·전화번호·참석자가 들어 있다. `title`, 시각, `location`만 |
| `appSettings` | 어떤 툴도 반환하지 않음 (`timezone` 값만 예외적으로 사용) |
| 삭제/보관된 Task | 기본 제외 (`taskState.ts:95`) |
| 페이지네이션 | `get_tasks`/`search_tasks` 기본 50, 최대 200, cursor |
| 기간 상한 | 캘린더 92일, 마감 90일, 집중 366일 |
| 응답 크기 | 툴당 직렬화 후 256KB 상한, 초과 시 `truncated: true` |
| 외부 ICS 원문 | **저장하지 않는다.** 파싱 후 메모리 캐시 5분, 디스크·DB 기록 없음 |

### 16.2 로깅

**남기는 것**: `request_id`, `client_id`(OAuth 클라이언트 — 사용자 식별자 아님), `tool_name`, `timestamp`, `success|error_code`, `latency_ms`, `result_item_count`, 외부 캘린더 fetch 성공/실패 카운트.

**절대 남기지 않는 것**: Task 제목·본문·노트, 일정 제목·장소, 집중 노트, 검색어 원문(`search_tasks`의 `query`는 길이만), 이메일, **access token 전체 또는 일부**, ICS URL 원문(호스트만).

사용자 식별이 필요한 운영 로그에는 `sub`의 해시 접두 8자만 남긴다. 로그 보존 30일.

---

## 17. Supabase Infrastructure Decision

| 기준 | A: Supabase Edge Functions | B: 별도 MCP 서버 | **C: 기존 Vercel serverless 확장 (권장)** |
|---|---|---|---|
| 현재 코드 적합성 | Edge Function이 저장소에 **0개**. Deno 툴체인 신규 | 인프라 신규 | `api/*.js` 2개가 이미 돌고, ICS 프록시 로직을 그대로 재사용 |
| 구현 난이도 | 중 | 상 | **하~중** |
| **동의 화면** | 앱과 다른 오리진 | 별도 도메인 | **앱과 같은 오리진.** Site URL + `/oauth/consent`가 곧 앱 라우트 — Supabase 설정과 정확히 맞는다 |
| 인증 | Supabase가 담당(동일) | 동일 | 동일 |
| RLS | 동일 | 동일 | 동일 |
| **ICS fetch(§9.2)** | 가능 | 가능 | **`api/ics.js`의 SSRF 차단 코드를 그대로 공유** |
| 유지보수 | 배포 파이프라인 2개 | 서버 운영 부담 | **배포 1개** |
| 무료 tier | 무료 한도 내 | 대개 유료 | **Vercel Hobby 무료 내 가능** |
| ChatGPT/Claude 호환 | 동일 | 동일 | 동일 (호스팅이 아니라 규격의 문제) |
| DB 근접성 | ✅ 가장 가까움 | ❌ | 리전 선택으로 완화 |

**C를 권장한다.** 결정적 이유 둘: (a) Supabase OAuth의 동의 화면은 **Site URL + 경로**로 지정되므로 앱과 같은 오리진에 있어야 자연스럽다, (b) §9.2의 ICS fetch가 이미 Vercel에 있는 SSRF 차단 코드를 재사용한다.

`src/server/mcp/**`를 전송 계층과 분리해 두면(§8.1), 나중에 Edge Function으로 옮기는 비용은 HTTP 어댑터 한 파일이다.

---

## 18. Local AI Removal Dependency

**충돌 없음.** 제거 작업이 오히려 전제를 정리했다. 단 **지금 지우면 안 되는 코드가 있다.**

제거로 소비자가 사라져 현재 고아 상태인 순수 selector들:

| 함수 | 위치 | 제거 전 소비자 | External AI에서의 용도 |
|---|---|---|---|
| `selectRelevantTasks` | `src/domain/tasks/selectors.ts:42` | `lib/ai/context/selectRelevantAppContext.ts` | `get_current_context` 후보 선별 |
| `nextActionableDateOf` | `src/domain/tasks/selectors.ts:20` | 〃 | 마감/시작일 정규화 |
| `selectRecentFocusSessions` | `src/domain/focus/selectors.ts:10` | `lib/ai/assistant/buildAssistantContext.ts` | `get_focus_summary` |
| `selectActiveProjects` | `src/domain/projects/selectors.ts:5` | 〃 | `get_projects` |

**삭제 금지** 표시가 필요하다(파일 상단 한 줄 주석).

재사용하지 않는 것: `LocalAIProvider`, `serverProvider`, `llamaServerProvider`, AI Chat, RAG — 전부 삭제됐고 되살릴 이유가 없다.

부수 정리: `platform.aiFetch`는 이제 ICS 전용이므로 `httpFetch`로 개명하는 편이 MCP 코드와의 혼동을 막는다.

---

## 19. Migration Plan

MCP 이전에 선행돼야 하는 것들. **rev.1의 M4(자체 토큰 테이블 4개)는 §6에 따라 삭제됐다.**

### M1. 타임존 확보 (B3)
`AppSettings`에 `timezone: string` 추가. 앱 시작 시 `Intl.DateTimeFormat().resolvedOptions().timeZone`으로 채운다. `AppSettings`는 `settings` 테이블의 `app_settings` 행으로 이미 동기화된다(`usePlannerData.ts:1144`). M0 passthrough 규칙(`types.ts:79-84`)상 구버전 클라이언트를 깨지 않는다.
**폴백 2단**: (1) 저장값, (2) 툴 입력의 선택적 `timezone` 인자(AI가 아는 경우가 많다). 둘 다 없으면 `INVALID_ARGUMENT`로 명확히 거절한다 — **UTC로 추측하지 않는다.** 하루가 어긋난 답보다 거절이 낫다.

### M2. "AI 연결 = 로그인 + 클라우드 동기화 필수" (B1)
**local-first 구조는 그대로 둔다.** AI를 쓰지 않는 사용자는 지금과 완전히 동일하게 로그인 없이 쓴다. 달라지는 것은 AI를 연결한 사용자뿐이다.

| 지점 | 규칙 |
|---|---|
| 동의 화면(`/oauth/consent`) | Supabase가 이미 로그인을 요구한다. 여기에 FocusFlow가 **동기화 상태 검사**를 더한다: 계정에 Task가 0건이거나 마지막 동기화가 없으면 승인 버튼을 막고 "이 기기의 데이터를 계정에 올려야 AI가 볼 수 있습니다" + 기존 `uploadLocalDataToSupabase()`(`usePlannerData.ts:1237`) 실행 |
| 연결 이후 앱 | 활성 grant가 있으면(`listGrants()`) 설정 화면에 "AI 연결됨 — 클라우드 동기화 필요" 배지. 로그아웃 시도 시 "AI 연결이 끊깁니다" 경고 |
| 연결 이후 MCP | 데이터가 낡아도 **거절하지 않고** `meta.freshness`로 알린다(§11.2). 거절은 사용자를 막을 뿐 고쳐주지 않는다 |

이 설계의 요점: **동기화를 강제하는 지점은 "연결하는 순간" 한 번이고, 그 뒤에는 정직한 메타데이터로 대신한다.**

### M3. 인덱스 (B2 완화, 선택)
```sql
create index if not exists tasks_user_idx on public.tasks (user_id);
-- 마감 질의가 실제로 느려지면:
create index if not exists tasks_due_idx on public.tasks (user_id, ((data->>'dueDate')));
```
PK가 `(id, user_id)`라 `user_id` 선행 인덱스가 없다. 개인 규모에선 무시 가능하나 비용이 거의 0이다.

### M4. 동기화 상태 행 (§11.2의 데이터 출처)
**스키마 변경 없이** 기존 `settings` 테이블에 행 하나를 추가한다.

```
settings 테이블
  id="settings"     (기존)
  id="app_settings" (기존)
  id="sync_state"   ← 신규: { lastSyncedAt, appVersion, deviceLabel }
```

`usePlannerData.ts:1087-1150`의 계획 실행이 **성공한 뒤** 이 행을 upsert한다. 교차 검증용으로 MCP가 `max(updated_at)`를 테이블 몇 개에서 읽어(각 `order=updated_at.desc&limit=1`) 실제 콘텐츠 갱신 시각과 비교할 수 있다.

### M5. OAuth 쓰기 차단 정책 (§6.5)
17개 동기화 테이블 + `settings`의 insert/update/delete 정책에 `(auth.jwt() ->> 'client_id') is null` 조건을 추가하는 마이그레이션. **Q1 실측 이후에 확정**한다.

### M6. 고아 테이블 정리 (선택)
`habits`, `habit_logs`, `study_topics`, `concept_notes`, `space_notes` — MCP allowlist 제외로 V1은 충분. 실제 삭제는 별도 판단.

**기존 데이터 모델 변경 총량: `AppSettings.timezone` 필드 1개 + `settings` 테이블의 행 1종.** 새 테이블은 **0개**다(rev.1은 4개였다).

---

## 20. Phase Plan

| Phase | 내용 | 비고 |
|---|---|---|
| **0** | 아키텍처·보안 감사 | **이 문서로 완료** |
| **0.5** | **Validation Spike** — OAuth 토큰의 `client_id`, RLS 쓰기 차단, 세션 CRUD 회귀, 교차 사용자 격리 | `spike/oauth-rls/` (§26). Phase 5·5.5의 설계를 확정하거나 대안으로 전환시킨다 |
| **1** | Local AI 제거 + 회귀 테스트 | **완료**. §18의 selector 4개 보존 표시만 남음 |
| **2** | 데이터 선행조건 — M1(타임존) + M4(sync_state) | ★rev.1의 "RLS 정비"를 대체. RLS는 이미 완전하다(§4) |
| **3** | AI-independent Data Access Layer + ICS 소스(§9.2) + **RRULE 확장(§9.2.1)** + 단위 테스트 | MCP 없이 순수 함수로 완결. §11의 계산값과 반복 일정 전개가 여기서 검증된다 |
| **4** | Read-only MCP Core — **개발용 고정 토큰**으로 툴 12개 완성 | ★인증보다 툴을 먼저. `mcp-inspector`로 즉시 검증되고, 인증 문제와 데이터 문제가 뒤엉키지 않는다 |
| **5** | Supabase OAuth 2.1 연결 — 대시보드 활성화, `/oauth/consent`, protected-resource 메타데이터, M2 게이트, 연결 관리 UI | rev.1보다 대폭 축소 |
| **5.5** | M5(OAuth 쓰기 차단 RLS) — Q1 실측 후 적용 | 순서 주의: **연결이 되어야 실제 OAuth 토큰으로 검증할 수 있다** |
| **6** | Claude 연결 검증 | |
| **7** | ChatGPT 연결 검증 | 요구사항 차이 흡수 |
| **8** | 보안 / 교차 사용자 격리 테스트(§22) | 두 계정 실제 시도 + 토큰 직접 PostgREST 호출 테스트 |
| **9** | V1 릴리스 | |
| **SEC-1** (별도) | asymmetric JWT signing key 마이그레이션 | **이미 완료된 것으로 보인다** — JWKS에 ES256 키 1개 게시 중(§26.4). 발급 토큰 헤더의 `kid` 일치만 확인하면 종결. MCP 선행 조건 아님(§6.6) |

---

## 21. Risks

| # | 리스크 | 영향 | 완화 |
|---|---|---|---|
| R1 | **로컬 우선 저장**이라 계정 데이터가 낡음 | AI가 자신 있게 틀린 답 | M2(연결 시 게이트) + §11.2 freshness를 모든 응답에 |
| R2 | **OAuth 토큰이 세션 토큰과 동등**(B4) — 유출 시 PostgREST 직접 접근 가능 | 데이터 유출 | §6.5의 RLS `client_id` 차단으로 **읽기 전용으로 축소**. 토큰 미저장(§6.7). Q1이 부정되면 이 완화가 약해지므로 R2는 Q1에 종속 |
| R3 | jsonb 전체 로드로 인한 지연·메모리 | 툴 타임아웃 | 테이블별 로드, 5,000행 상한, `truncated`, M3 인덱스 |
| R4 | **DCR을 켜면 누구나 클라이언트 등록 가능** | 피싱 클라이언트가 그럴듯한 이름으로 동의를 유도 | 동의 화면에 `client.name`과 redirect URI를 **그대로** 보여주고 "모르는 앱이면 거부" 문구. 필요 시 DCR을 끄고 수동 등록으로 전환 가능 |
| R5 | 타임존 오판 | 답이 하루씩 틀림 | M1 2단 폴백 + **추측 금지**. 응답에 `today`/`timezone` 항상 명시 |
| R6 | 동일 오리진에 service_role 키 존재 | 실수로 데이터 경로에 사용 | §5 규칙 3 + CI grep(§22) |
| R7 | 무료 tier 한도 / 외부 ICS fetch 비용 | 중단·지연 | ICS 5분 캐시, 구독 5개·전체 12초 예산, `get_current_context` 60초 캐시 |
| R8 | V2 write 도입 시 last-write-wins 동기화와 충돌 | 데이터 손실 | write는 별도 설계. `buildSyncPlan`의 baseline(`buildSyncPlan.ts:83-88`)을 서버 쓰기가 어떻게 존중할지 먼저 풀어야 한다 |
| R9 | **ICS 파서가 RRULE을 확장하지 않는다** | 반복 회의가 빠져 free time이 과대평가되고 **AI가 없는 시간에 작업을 배치한다** | **V1 필수 구현으로 승격**(§9.2.1). 고정 ICS 픽스처 기반 단위 테스트로 검증. 미구현 상태로는 §22-4를 통과할 수 없다 |
| R10 | Supabase OAuth 2.1이 **beta** | 규격·API 변경 가능 | 벤더 API 호출을 `src/server/auth/` 한 곳에 모아 교체 지점을 좁힌다 |

---

## 22. Acceptance Criteria

**기능**
1. User A가 Claude에서 "오늘 뭐 해야 해?" → `get_current_context` 1회로 오늘 일정·미완료·마감·우선순위·집중 요약을 받아 답한다.
2. 같은 질문을 ChatGPT에서 해도 **같은 엔드포인트·같은 툴**로 동작한다.
3. "2시간 안에 끝낼 수 있는 일" → `freeMinutesUntilNextEvent`와 `estimatedMinutes`가 응답에 있다.
4. "다음 일정 전까지 할 만한 작업" → **외부 캘린더 이벤트가 `todaySchedule`에 포함**되어 있고 `meta.externalCalendars[].ok === true`다. (`externalCalendarsIncluded: false`는 인수 조건 불충족으로 간주한다.) **반복 일정의 오늘 회차도 포함되어야 한다**(§9.2.1).
5. "논문 Task에서 아직 안 끝난 세부 작업" → `search_tasks` → `get_task_detail`의 `subtasks`/`checklist`로 답한다.
6. 마지막 동기화가 24시간 넘은 계정에서 툴을 부르면 `meta.freshness.staleness === "stale"`이고 `lastSyncedAt`이 실려 온다.

**인증 / 보안 (전부 실제 실행으로 증명)**
7. Claude·ChatGPT가 **수동 클라이언트 설정 없이** OAuth로 연결된다(DCR).
8. FocusFlow 코드베이스에 **JWT를 서명하는 코드가 0줄**이고, `SUPABASE_JWT_SECRET` / signing key 환경변수를 읽는 곳이 없다.
9. `grep -rn "SERVICE_ROLE" src/server` 결과가 **0건**이다 (CI 규칙).
10. User A의 토큰으로 User B의 taskId를 `get_task_detail`에 넣으면 `NOT_FOUND`이며, 존재하는 id와 존재하지 않는 id의 응답이 **구분되지 않는다**.
11. 어떤 툴 조합으로도 A의 응답에 B의 행이 1건도 나타나지 않는다.
12. **OAuth 토큰으로 PostgREST에 직접 `POST /rest/v1/tasks`를 시도하면 거부된다**(§6.5). 같은 사용자의 일반 세션 토큰으로는 성공한다.
13. `revokeGrant` 후 첫 MCP 요청이 401이다.
14. 만료된 access token이 401이고, 클라이언트의 refresh로 복구된다.

**품질**
15. `src/server/data/**`가 `src/server/mcp/**`를 import하지 않는다 (lint 규칙).
16. 모든 툴 응답이 투영 함수를 거친다 — 스냅샷 테스트로 `order`·`sectionId`·`appSettings`·외부 이벤트 `description`이 새지 않음을 고정한다.
17. 기본 로그에 Task 제목·일정 제목·검색어 원문·토큰이 없다 (로그 스냅샷 테스트).
18. 외부 캘린더 1개를 의도적으로 실패시켜도 툴이 성공하고 `meta.partial`과 해당 캘린더의 `error`가 실린다.
19. **RRULE 확장**: 매주 반복되는 픽스처 이벤트가 조회 범위 안의 모든 회차로 전개되고, `EXDATE`로 취소된 회차는 빠지며, `RECURRENCE-ID`로 시간이 바뀐 회차는 바뀐 시간으로 나온다. 같은 반복의 두 회차가 **서로 다른 id**를 갖는다.
20. 반복 회의가 있는 날의 `get_free_time_blocks`가 그 시간대를 **busy로 보고**한다 — 미구현 시 이 시간이 free로 잡히는 것이 R9의 실제 피해다.

---

## 23. Open Questions

| # | 질문 | 왜 지금 필요한가 |
|---|---|---|
| **Q1** | **`auth.jwt() ->> 'client_id'`가 OAuth 토큰에서 실제로 읽히는가?** | §6.5(읽기 전용의 DB 강제)와 R2의 완화가 여기 달렸다. 부정되면 Custom Access Token Hook 또는 애플리케이션 층 단독 의존으로 후퇴 |
| Q2 | 배포 도메인 확정 | Supabase Site URL + `authorization_url_path`, protected-resource 메타데이터가 도메인에 묶인다 |
| Q3 | 실제 계정의 `tasks` 행 수 | R3 상한을 실측으로 정한다 |
| Q4 | 여러 기기를 쓰는가 | M2·M4의 "어느 기기가 최신인가" 문제 크기 |
| Q5 | ICS 구독을 실제로 몇 개, 어떤 서비스(Google/iCloud/Outlook)로 쓰는가? | §9.2.1의 **우선순위 조정용**(구현 여부는 확정됐다). 어느 서비스의 ICS를 픽스처로 삼을지, `BYSETPOS` 같은 V1 제외 항목이 실제로 등장하는지를 정한다 |
| Q6 | 고아 테이블 5개에 데이터가 남아 있나 | M6 |
| Q7 | V2 write를 실제로 원하나 | R8을 Phase 3부터 고려할지 |
| Q8 | ChatGPT 커넥터를 쓸 계정의 요금제 | Phase 7 실행 가능성 |
| ~~Q9~~ | ~~OAuth 2.1 활성화 가능 여부~~ | **종결(§26.4b).** 2026-08-27 활성화 확인 |
| ~~Q10~~ | ~~RFC 8414 메타데이터 게시 여부~~ | **종결(§26.4b).** 활성화와 동시에 `/.well-known/oauth-authorization-server/auth/v1`에 게시됨. MCP discovery 경로 확보 |

---

## 24. 최종 설계 판단

**1. 이 구조를 추가하기 가장 적합한 위치는?**
`src/server/`(순수 TS 쿼리 계층) + `api/mcp`(Vercel serverless) + 앱 라우트 `/oauth/consent`. 도메인 로직은 `src/domain/**`를 **그대로 재사용**한다 — 앱과 MCP가 같은 규칙을 쓰게 하는 것이 두 번째 진실을 막는 유일한 방법이다.

**2. 기존 데이터 모델을 얼마나 수정해야 하나?**
**필드 1개**(`AppSettings.timezone`) + **기존 `settings` 테이블의 행 1종**(`sync_state`). **새 테이블 0개.** Task/Project/FocusSession 모델은 손대지 않는다. RLS 정책 수정(M5)은 스키마 변경이 아니다.

**3. 현재 RLS 구조는 충분한가?**
**읽기에 대해서는 충분하다** — 24개 테이블 전부 `auth.uid() = user_id`, 느슨한 정책·security definer·anon 정책 0건. **쓰기에 대해서는 한 가지가 빠져 있다**: OAuth 클라이언트 토큰이 세션 토큰과 동등하므로, `client_id` 클레임 기반 쓰기 차단(M5)을 더해야 "V1은 읽기 전용"이 DB가 강제하는 사실이 된다.

**4. Supabase Edge Function만으로 MCP 서버가 가능한가?**
기술적으로 가능하나 권장하지 않는다. 동의 화면이 Site URL 기준 앱 라우트이고, ICS fetch가 Vercel의 기존 SSRF 차단 코드를 재사용하기 때문이다(§17).

**5. 별도 서버가 실제로 필요한가?**
**아니다.** 기존 Vercel serverless로 충분하고 무료 tier 안에서 운영 가능하다.

**6. ChatGPT와 Claude가 동일한 MCP endpoint를 쓸 수 있는가?**
**그렇다.** MCP와 OAuth 2.1 모두 클라이언트 중립 규격이고 이 설계에 벤더 분기가 없다.

**7. 최초 Read-only 버전의 최소 Tool은?**
엄밀한 최소는 **4개**: `get_current_context`, `get_task_detail`, `get_tasks`, `get_calendar_events`. 요청서의 예시 질문 8개를 모두 답하려면 `search_tasks`, `get_free_time_blocks`, `get_focus_summary`를 더한 **7개**. 나머지 5개는 토큰 절약용 편의다.

**8. "나 다음으로 뭐 해야 해?"에 반드시 필요한 데이터는?**
① 사용자 타임존 기준 **현재 시각·오늘 날짜**(현재 미저장 — B3). ② **실제 캘린더**(Task 블록 + 외부 구독 이벤트)와 다음 일정까지 남은 시간. ③ 미완료 Task의 `dueDate`·`priority`·`estimatedMinutes`. ④ overdue 여부와 **차단 여부**(`blockedByTaskId`) — 차단된 일을 추천하면 답이 틀린다. ⑤ 진행률. ⑥ 최근 집중 기록. ⑦ **데이터 신선도** — 낡은 데이터로 확신에 찬 답을 하지 않기 위해.

**9. Local AI removal에서 지금 삭제하면 안 되는 재사용 코드는?**
`selectRelevantTasks`(`domain/tasks/selectors.ts:42`), `nextActionableDateOf`(`:20`), `selectRecentFocusSessions`(`domain/focus/selectors.ts:10`), `selectActiveProjects`(`domain/projects/selectors.ts:5`). 넷 다 현재 고아 상태라 죽은 코드 정리에서 지워지기 쉽다. 추가로 **`parseIcsEvents`(`lib/externalCalendars.ts:121`)** 는 §9.2의 핵심이므로 함께 보존 대상이다.

**10. 구현 전에 해결해야 하는 blocker는?**

| 우선 | Blocker | 해결 | rev.1 대비 |
|---|---|---|---|
| 1 | **타임존이 없다** | M1 | 유지 |
| 2 | **미동기화 계정은 빈 답** | M2 | 유지 |
| 3 | `client_id` 클레임이 RLS에서 읽히는가 | Q1 실측 | **신규** |
| 4 | 배포 도메인 미확정 | Q2 | 유지 |
| ~~5~~ | ~~OAuth server 비활성~~ | **해소** — 활성화 완료(§26.4b) | — |
| ~~6~~ | ~~RFC 8414 메타데이터 404~~ | **해소** — 활성화와 함께 게시(§26.4b) | — |
| ~~—~~ | ~~Supabase Auth가 OAuth AS가 아님~~ | — | **철회** — 사실 오인 |
| ~~—~~ | ~~JWT 서명 방식 확인~~ | — | **blocker 아님**. SEC-1로 분리(§6.6) |

3·5번은 확인 한 번씩이고, 1·2번만 실제 코드 작업이다. **1번 없이는 `get_current_context`가 정확할 수 없고, 3번의 결과에 따라 "읽기 전용"의 강도가 달라진다.**

---

## 25. 개정 기록

### rev.3 (2026-08-27) — 검증 항목 승격 + 스파이크

| 항목 | rev.2 | rev.3 | 근거 |
|---|---|---|---|
| RRULE 확장 | "정직하게 남는 한계"로 표기, 구현 여부는 Q5에 위임 | **V1 필수**(§9.2.1). 인수 조건 19·20 추가 | 표시 누락이 아니라 **free time 계산 오류**다. 반복 회의가 빠지면 AI가 없는 시간에 작업을 배치한다 |
| Q5 | "RRULE을 구현할 것인가" | "어느 서비스의 ICS를 픽스처로 삼을 것인가" — 우선순위 조정용 | 구현 여부는 확정 |
| Phase | 0 → 1 → 2 … | **0.5 Validation Spike** 추가 | Q1·Q9가 설계의 분기점이라 전체 구현 전에 실측이 필요 |
| 검증 도구 | 없음 | `spike/oauth-rls/` (§26) | — |

### rev.2 (2026-08-27) — 인증 전면 수정 + 캘린더 결정 변경

| 항목 | rev.1 | rev.2 | 근거 |
|---|---|---|---|
| Supabase Auth의 성격 | "서드파티 OAuth AS가 아니다"(B3) | **OAuth 2.1 AS로 동작한다.** PKCE·discovery·DCR·MCP 인증 지원 | [MCP Authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), [OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server) |
| 토큰 발급 | MCP 서버가 60초 사용자 JWT 직접 서명 | **Supabase가 발급한 access token을 그대로 전달.** 서명키 미보유 | [OAuth Flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows) — access token은 `sub`/`role`/`client_id`를 담은 표준 Supabase JWT이고 기존 RLS가 그대로 적용된다 |
| 자체 테이블 | `mcp_oauth_clients` 등 4개 | **0개.** Supabase가 클라이언트·코드·토큰·grant 관리 | `listGrants`/`revokeGrant` (`@supabase/auth-js@2.108.2`) |
| 자체 엔드포인트 | authorize/token/register/revoke + AS 메타데이터 | **`/api/mcp`와 protected-resource 메타데이터, 동의 화면 1장** | [Getting Started](https://supabase.com/docs/guides/auth/oauth-server/getting-started) |
| JWT 서명 방식 | 구현 blocker | **blocker 아님.** SEC-1 보안 개선으로 분리 | §6.6 |
| 읽기 전용 강제 | 커스텀 scope `focusflow.read` | **불가능**(커스텀 scope 미지원) → RLS `client_id` 차단으로 대체 | [OAuth Flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows) — "Custom scopes are not currently supported", "All OAuth access tokens provide full user data access" |
| 외부 캘린더 | V1에서 제외(`externalCalendarsIncluded: false`) | **V1에 포함.** 서버 측 ICS fetch/parse | §9.2 비교 |
| 데이터 신선도 | 언급만 | `meta.freshness`를 **모든 응답에** + `sync_state` 행 | §11.2, §19 M4 |
| local-first | 유지 | 유지. **AI 연결 사용자만** 로그인+동기화 필수, 강제 지점은 연결 순간 1회 | §19 M2 |

새 blocker 2개(Q1 `client_id` 클레임, Q9 beta 활성화)가 생겼고, 기존 blocker 2개(자체 AS 구축, JWT 서명 방식)가 사라졌다. 순 효과는 **구현량 대폭 감소**다.

---

## 26. Validation Spike (`spike/oauth-rls/`)

전체 구현 전에 실측이 필요한 4가지를 확인하는 일회용 도구. 결론이 나면 삭제한다.

| 파일 | 역할 |
|---|---|
| `probe.mjs` | **자격증명 불필요.** OAuth 2.1 활성화 여부(Q9), DCR 가능 여부, JWT 서명 방식(SEC-1), 실제 엔드포인트 경로를 GET만으로 확인 |
| `spike.mjs` | 검증 1~4. PKCE authorize → `approveAuthorization` → code → token 전 과정을 헤드리스로 수행한 뒤 PostgREST에 직접 질의 |
| `policy.sql` | §6.5 후보 정책(tasks 한정) + 전체 적용 루프(주석) + 롤백 |
| `README.md` | 실행 절차, 데이터 영향, 실패 해석 |

### 26.1 동의 화면 없이 검증이 가능한 이유

`approveAuthorization(id, { skipBrowserRedirect: true })`가 **authorization code가 담긴 redirect_url을 그대로 반환**한다(`@supabase/auth-js` `types.d.ts:2258-2266`). 따라서 Phase 5(동의 화면 구현)를 기다리지 않고 지금 실제 OAuth 토큰을 얻을 수 있다. **스파이크가 Phase 5 앞에 놓일 수 있는 근거가 이것이다.**

### 26.2 실행 순서와 기대값

| 단계 | 명령 | 기대 |
|---|---|---|
| 0 | `probe.mjs` | Q9 PASS. DCR·JWKS 상태 확인 |
| 1 | `spike.mjs` (정책 미적용) | 1 PASS · **2 FAIL** · 3 PASS · 4 PASS |
| 2 | `policy.sql` §1 적용 후 `spike.mjs` | **1·2·3·4 전부 PASS** |

1단계의 2번 FAIL은 정상이다 — 정책 없이 OAuth 토큰으로 쓰기가 된다는 사실이 §6.5의 필요성을 실증한다.

### 26.3 결과가 설계를 어떻게 바꾸는가

| 결과 | 설계 반영 |
|---|---|
| **1이 PASS** | §6.5 확정. M5를 17개 테이블로 확대. Q1 종결 |
| **1이 FAIL** (`client_id` 없음) | §6.5 폐기 → 대안 A: Custom Access Token Hook으로 클레임 주입 / 대안 B: 애플리케이션 층 단독 의존 + R2를 "완화 불가"로 격상. **B로 가면 "V1 READ ONLY"는 DB가 아니라 코드의 약속이 된다** — 문서에 그대로 적어야 한다 |
| **1은 PASS, 3이 FAIL** | 세션 토큰에도 `client_id`가 있다는 뜻. §6.5 성립 불가, 즉시 롤백 |
| **4가 FAIL** | 최우선 사고. MCP 이전에 RLS 자체를 다시 봐야 한다 |
| probe의 JWKS에 키 있음 | SEC-1이 이미 절반 완료 — 토큰 검증을 로컬 JWKS로 |

### 26.4 0단계 실행 결과 (2026-08-27, `pxhbbnirodqjgpdbuqss`)

`probe.mjs` 실행. 자격증명 없이 익명 GET만.

| 항목 | 결과 | 근거 |
|---|---|---|
| **Q9 — OAuth 2.1 server** | **FAIL — 꺼져 있음** | `GET /auth/v1/oauth/authorize` → `{"code":404,"error_code":"feature_disabled","msg":"OAuth server is disabled"}` |
| RFC 8414 메타데이터 | **404** (3개 경로 전부) | `/.well-known/oauth-authorization-server{,/auth/v1}`, `/auth/v1/.well-known/oauth-authorization-server` |
| OIDC discovery | 200 | `/auth/v1/.well-known/openid-configuration` — `oauth/authorize`·`oauth/token`·`oauth/userinfo` 경로를 광고하지만 **기능은 꺼져 있다** |
| DCR | 판정 불가 | OAuth server가 꺼져 있어 무의미. `/auth/v1/oauth/register`는 401(라우트는 존재) |
| SEC-1 — 서명 방식 | **ES256 키 1개** (`kid=ec48159c-…`) | `/auth/v1/.well-known/jwks.json` |
| 검증 1~4 | **미실행** | OAuth 토큰을 발급받을 수 없어 착수 불가 |

**OIDC 문서에서 확인된 유용한 사실** (활성화 후에도 유효할 값들):

```
scopes_supported                    openid, profile, email, phone, offline_access
grant_types_supported               authorization_code, refresh_token
token_endpoint_auth_methods         client_secret_basic, client_secret_post, none   ← public client 가능
code_challenge_methods_supported    S256, plain
response_types_supported            code
```

`none`(public client)과 `S256`이 모두 지원되므로 §6.3의 PKCE 흐름은 그대로 성립한다.
`offline_access`가 있으므로 refresh token도 정상.

#### 이 결과가 바꾸는 것

| # | 내용 |
|---|---|
| 1 | **Q9는 질문에서 할 일이 됐다.** 대시보드 Authentication > OAuth Server 활성화 + authorization URL path(`/oauth/consent`) + Site URL + DCR 토글. 이것 없이는 검증 1~4도 Phase 5도 시작할 수 없다 |
| 2 | **Q10 신규**: RFC 8414 메타데이터가 활성화 후 게시되는지 확인해야 한다. 현재 404이고, MCP 클라이언트가 OIDC로 폴백하지 않으면 discovery가 실패한다. 폴백하지 않는 클라이언트가 있다면 §8.1의 `/.well-known/oauth-protected-resource`에서 authorization server를 어떻게 지목할지 다시 봐야 한다 |
| 3 | **SEC-1은 사실상 이미 끝난 것으로 보인다.** ES256 키가 게시 중이므로 토큰 검증을 로컬 JWKS로 할 수 있다. 발급된 토큰 헤더의 `kid`가 이 키와 일치하는지만 spike.mjs에서 확인하면 종결 |
| 4 | `claims_supported`에 `client_id`가 없다 — 다만 이 목록은 **ID token/UserInfo** 클레임을 서술하는 것이지 access token 클레임이 아니므로 **Q1을 부정하지 않는다.** 약한 신호일 뿐이고, 검증 1이 여전히 유일한 판정 수단이다 |

#### 방법론 교훈 (스크립트 수정함)

`probe.mjs` 초판은 **OIDC discovery 문서가 200을 준다는 사실만으로 "OAuth 켜짐"을 PASS로 판정했다.**
GoTrue는 OAuth server가 꺼져 있어도 그 문서를 게시하고, 문서 안에 `oauth/authorize` 경로까지 적어 둔다.
메타데이터의 존재를 기능의 존재로 착각한 것이다. 지금은 authorize 엔드포인트를 실제로 눌러
`feature_disabled`를 보고 판정한다. **"광고된 경로"와 "동작하는 기능"은 다르다.**

### 26.4b 활성화 후 재실행 (2026-08-27)

대시보드에서 OAuth server를 켠 뒤 `probe.mjs` 재실행.

| 항목 | 이전 | 이후 |
|---|---|---|
| **Q9 — OAuth 2.1 server** | FAIL (`feature_disabled`) | **PASS** — authorize가 HTTP 400(파라미터 없음)으로 응답 |
| **Q10 — RFC 8414 메타데이터** | 404 | **PASS** — `/.well-known/oauth-authorization-server/auth/v1` 게시 |
| **DCR** | 판정 불가 | **PASS** — `registration_endpoint` = `/auth/v1/oauth/clients/register` |
| SEC-1 | ES256 키 1개 | 변화 없음 (`kid=ec48159c-…`) |

**확정된 엔드포인트** (설계 §6.3·§8.1이 쓸 값):

```
issuer                  https://<ref>.supabase.co/auth/v1
authorization_endpoint  https://<ref>.supabase.co/auth/v1/oauth/authorize
token_endpoint          https://<ref>.supabase.co/auth/v1/oauth/token
registration_endpoint   https://<ref>.supabase.co/auth/v1/oauth/clients/register
userinfo_endpoint       https://<ref>.supabase.co/auth/v1/oauth/userinfo
jwks_uri                https://<ref>.supabase.co/auth/v1/.well-known/jwks.json
RFC 8414 메타데이터     https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1
```

RFC 8414 문서는 OIDC discovery 문서와 내용이 같고 `registration_endpoint`가 추가된 형태다.
**`revocation_endpoint`는 광고되지 않는다** — 해지는 RFC 7009 엔드포인트가 아니라
`supabase.auth.oauth.revokeGrant({ clientId })`로 한다(§6.4). `/.well-known/oauth-protected-resource`는
여전히 404이며, 그것은 **우리가 만들 몫**이다(§8.1).

#### 남은 것

검증 1~4는 계정 2개의 자격증명이 필요해 **아직 미실행**이다. 인프라 쪽 미지수는 전부 해소됐고,
남은 유일한 설계 분기점은 **Q1(`client_id` 클레임)** 이다.

### 26.5 이 스파이크가 검증하지 않는 것

MCP 프로토콜 자체(Phase 4), 동의 화면 UI(Phase 5), 토큰 만료·refresh(Phase 5), ChatGPT/Claude 실제 연결(Phase 6·7), RRULE 확장(§9.2.1 — 순수 함수라 픽스처 단위 테스트로 별도 검증).
