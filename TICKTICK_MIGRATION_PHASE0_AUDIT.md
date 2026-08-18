# TickTick 재설계 — Phase 0 현행 감사 및 개념 매핑

계획서(`TICKTICK_STYLE_REDESIGN_IA_SIDEBAR_MAIN_DRAWER_URL_DATA_VIEWS_QUICKADD_INTERACTIONS_SEARCH_VISUAL_v16_E2E_IMPLEMENTATION_PLAN.md`) §6.67이 요구하는 Phase 0 산출물이다.

> 실제 코드/DB를 확인한 후 migration SQL을 작성한다.
> 문서 설계를 추측으로 바로 migration으로 옮기지 않는다.

여기 적힌 "현재"는 전부 v0.10.2 코드에서 확인한 값이다. 추정은 `추정`으로 표시했다.

**개정 (v0.10.3).** 감사 직후 Migration Phase 1~3이 구현되어 아래 표의 일부가 낡았다. 바뀐 칸은 원래 값을 취소선으로 남기고 `✅`(완료) / `🟡`(진행 중)를 덧붙였다 — 감사 시점의 판단을 지우면 무엇을 왜 고쳤는지가 사라지기 때문이다. 계획서 원본도 이제 리포에 있다.

---

## A. §6.67 감사 질문에 대한 답

| 질문 | 답 | 근거 |
|---|---|---|
| Task가 `projectId`를 직접 갖는가 | **그렇다**, 필수 `string` | `types.ts` Task |
| Task가 `listId`를 항상 갖는가 | ~~**아니다**, `listId?` 선택~~ → ✅ 타입은 선택이지만 **값은 전부 채워짐** | Migration Phase 3(`backfillTaskListId`)이 계획서의 A/B/C 세 경우를 모두 기록. `listIdFor`의 유도는 백필이 닿지 않은 레코드용 fallback으로만 남음 |
| List가 `projectId`를 필수로 갖는가 | **그렇다** — ~~단 필드명이 `List.spaceId`~~ → ✅ 이름이 `projectId`로 정리됨 | 저장 키는 둘 다 쓴다(`sanitizeList`가 `projectId ?? spaceId`로 읽고 항상 병행 기록). nullable화는 Migration Phase 4(§6.72)로 남음 |
| Folder와 List 관계 | Folder는 Project 소속(`Folder.spaceId`=Project id), List는 `folderId?` | `types.ts` |
| orphan Task가 있는가 | **있다** — `projectId: ""`인 받은함 작업 | `App.tsx`의 project 없는 Task 폴백 |
| Today override 저장 위치 | ~~localStorage `todayPage.bucketOverrides.v1`~~ → ✅ `TaskDailyPlan` 레코드 (§6.18) | `domain/today/dailyPlan.ts` — **동기된다.** 구 블롭은 읽어서 흡수만 하고 더는 쓰지 않는다 |
| completed source | `task.status === "done"` + `completedAt` | 두 곳에 있고 `status`가 우선 |

---

## B. Scope 매핑 (§12.3의 canonical 9종)

| 목표 Scope | URL | 현재 대응물 | 격차 |
|---|---|---|---|
| `today` | `/today` | TodayPage (사이드바 "오늘") | **부분** — 화면은 있으나 Scope/Registry가 아님. plan override가 localStorage |
| `upcoming` | `/upcoming` | 없음 | **신규** |
| `inbox` | `/inbox` | ~~`status === "inbox"` + Today 분류 서랍~~ → 🟡 Inbox system List 레코드(`INBOX_LIST_ID`)가 생김 + 기존 두 경로 | **부분** — 소유 구조는 Phase 2에서 갖춰졌다. Scope와 화면이 없다 |
| `list` | `/list/:id` | 트리의 List 선택 (`/s/:sp/p/:pj/l/:id`) | **부분** — 존재하나 Project 종속 |
| `folder` | `/folder/:id` | 트리의 Folder 선택 | **부분** — Domain Folder이고 Presentation Folder 아님 |
| `tag` | `/tag/:id` | ~~없음 (`task.tags: string[]`만)~~ → 🟡 `Tag` + `TaskTag` 레코드 있음 | **부분** — 데이터는 갖춰졌고 Scope·화면이 없다 |
| `filter` | `/filter/:id` | 없음 | **신규** |
| `completed` | `/completed` | 없음 (보관함은 archived 전용) | **신규** |
| `trash` | `/trash` | 없음 (`deletedAt`은 있는데 노출 화면 없음) | **신규** — 필드는 이미 있음 |

**개정 (Implementation Phase 1).** 위 표의 "현재 대응물"은 화면 기준이고, 그건 아직 그대로다. 다만 9개 Scope의 **정의는 생겼다** — `domain/tasks/scopeRegistry.ts`가 §12.4 매트릭스를(허용 View·기본 View·생성 가능 여부·수동 정렬·count 의미·생성 owner) 한 표로 들고 있고, `app/taskScopeUrl.ts`가 URL 왕복과 canonical 정리를 한다. 화면은 Implementation Phase 3부터다.

현재 있으나 목표 Scope에 자리가 없는 것:

- **간트(Gantt)** — §12.4 Allowed View는 List/Board뿐. 계획서 전체에서 간트 언급 4회, Scope 배정 없음
- **목표(Goals) / LearningPath** — Tasks Module 밖. 별도 결정 필요
- **집중(Focus)** — §5.60이 `/focus`를 남겨둠. 유지 가능

---

## C. 데이터 모델 매핑

### C-1. List

| 목표 (§6.87) | 현재 | 등급 |
|---|---|---|
| `kind: 'inbox' \| 'regular'` | ~~없음 (`isDefault: boolean`)~~ → ✅ `kind?: "inbox" \| "regular"` (없으면 regular로 읽음) | ~~신규~~ → **완료** |
| `projectId: string \| null` | ~~`spaceId: string` (필수, 값은 Project id)~~ → ✅ `projectId: string`, `""`가 계획서의 `null` 역할 (`spaceId?`는 레거시 미러) | ~~개명 + nullable~~ → **완료** (Phase 4) |
| `sidebarFolderId: string \| null` | 없음 | 신규 |
| `sortKey` | `order: number` | 개명 |
| `archivedAt` | `archivedAt?` | **일치** |
| `deletedAt` | 없음 | 신규 |
| — | `statuses?: Status[]` | 목표에 대응 없음 (유지 결정 필요) |

### C-2. Task

| 목표 | 현재 | 등급 |
|---|---|---|
| `listId: string` (필수) | 🟡 `listId?` (백필로 전부 채워짐) + `projectId` 필수 | ~~**구조 변경 — 가장 큼**~~ → **진행 중** — 소유 방향은 역전됐다(`projectIdFor`, §6.77). 남은 것은 필수화와 fallback 제거 |
| `sectionId` | 없음 | 신규 |
| `dueOn` / `dueAt` (XOR) | `dueDate` + `startTime`/`endTime` | 구조 변경 |
| `someday` | `isSomeday: boolean` | **일치** |
| `completedAt` | `completedAt` + `status === "done"` | 정리 필요 (source 이중화) |
| `deletedAt` | `deletedAt?` | **일치** |
| `sortKey` | `order: number` | 개명 |
| — | `scheduledDate` | 목표엔 TodayPlan이 대응 (§6.17) |
| — | `status` 6종 + 사용자 정의 | 목표에 대응 없음 |

### C-3. Subtask — 정면 충돌

계획서 §13.3은 **`Task.parentTaskId` self-reference를 명시적으로 반대**하고 별도 `TaskSubtask` 엔티티를 쓴다. 근거로 든 증상이 이것이다:

> 모든 Task Query가 `parentTaskId IS NULL` 예외를 기억해야 하고

현재 코드가 정확히 그 상태다. `domain/view/spaceViews.ts`의 `specForSpaceView`가 **모든 뷰 스펙에** `parentId: ""`를 넣는다. 계획서가 예측한 비용을 이미 치르고 있다.

**v0.10.3에서도 그대로다.** Phase 1~3은 소유 축만 다뤘고 Subtask는 건드리지 않았다.

### C-4. Folder

| 목표 | 현재 |
|---|---|
| `SidebarFolder` (표시 전용, List만 그룹화, 중첩 금지) | `Folder` (Project 소속 도메인 레코드) |

§6.36은 **둘의 공존**을 허용한다 — List가 `domainFolderId`와 `sidebarFolderId`를 동시에 가질 수 있다. 현재 Folder를 버릴 필요는 없다.

---

## D. 재사용 가능한 자산

계획서를 처음부터 짓는 게 아니다. 이미 대응물이 있는 것:

| 계획서 개념 | 현재 자산 |
|---|---|
| §12 Canonical Registry | `domain/view/spaceViews.ts` (`SPACE_VIEWS`), `spaceNav.ts` (`navItemsForScope`) — 같은 발상 |
| §5 URL/Navigation | `app/spaceSelection.ts` (`parseSelection`/`pathForSelection`/canonical 재작성), `lib/spaceTabUrl.ts` (`?view=`) |
| §6.88 selector 공통화 | `domain/spaces/membership.ts` (`listIdFor`, `statusIdFor`) |
| §6.94 Sidebar Count = 동일 Query | v0.10.2에서 트리·헤더 개수를 일치시킴 |
| §9.34 Undo | `App.tsx` Ctrl+Z |
| §11 Design Token | `styles/01-base.css` 토큰 |
| Board / List 뷰 | `BoardView`, `TaskListView` |

---

## E. 충돌 등급 요약

**1급 — 구조 변경 (되돌리기 비쌈)**
- Task 소유 축을 `projectId`+`listId?`(해석 함수) → `listId` 단일 필수로 — 🟡 **진행 중** (Phase 2·3 완료, 필수화와 fallback 제거가 남음)
- `List.spaceId` → `projectId` 개명 후 nullable — ✅ **완료** (개명 Phase 1, 소유 없는 List 허용 Phase 4)
- Subtask를 Task self-reference → 별도 엔티티 — ⬜ 착수 전
- 날짜를 `dueDate`/`scheduledDate` → `dueOn`/`dueAt` + TodayPlan — ⬜ 착수 전

**2급 — 신규 추가 (기존을 깨지 않음)**
- Tag 레코드, SavedFilter, ListSection, SidebarFolder
- Upcoming / Completed / Trash 화면
- Rail, Command Palette, 다중 선택

**3급 — 이름만 다름**
- `order` → `sortKey`, `isSomeday` → `someday`

**4급 — 목표에 자리가 없는 현재 기능**
- 간트, 목표(Goals), 상태(status) 6종 + 사용자 정의 컬럼

---

## F. 이 감사가 드러낸 것

가장 중요한 발견은 **방향의 차이**다.

계획서 §1.14는 Presentation IA와 Domain IA를 분리하고, 사용자에게 `Space > Project > Folder > List` 4단을 그대로 보여주지 말라고 한다. 현재 사이드바는 정확히 그 4단을 노출한다 — v0.10.2에서 들여쓰기 사다리와 개수 배지를 정합하게 만든 그 트리다.

그 작업이 헛되지는 않았다. 고친 것은 전부 **자기모순**(사이드바 4 vs 헤더 5, 리스트 그룹 두 개가 같은 이름, 영어 상태 라벨)이었고, 어느 IA를 택하든 틀린 것들이었다. 다만 트리 자체의 미래는 계획서 쪽에서 짧다.

---

## G. 다음 단계

1. ~~**`List.spaceId` → `List.projectId` 개명**~~ — **완료.** 저장 키를 바꾸지 않고 병행 기록으로 처리했다. `sanitizeList`/`sanitizeFolder`가 두 키 중 하나를 owner로 읽고 항상 둘 다 쓴다. 구버전 클라이언트의 `sanitizeList`는 `spaceId` 없는 List를 **버리므로**, 그냥 개명했으면 업데이트 안 한 기기에서 리스트가 전부 사라졌을 것이다. 미러 제거는 계획서의 Migration Phase 7
2. ~~**§16.35 P0/P1 경계 읽고 1차 범위 확정**~~ — **읽었다.** 계획서가 리포에 들어왔다. P0 MVP는 9개 Scope를 **전부** 포함한다(Today · Upcoming · Inbox · List · Folder · Tag · Filter · Completed · Trash). P1로 미룬 것은 Repeat / Reminder / Folder Board / advanced grouping / Multi-select / touch DnD / advanced search이며, §17은 *"§1~§16 기준으로 이제 추가적인 큰 UX 설계 없이 Tasks Module MVP 구현을 시작할 수 있다"*고 선언한다. 즉 "일부 Scope부터"는 계획서가 주는 선택지가 아니다
3. **4급 항목 결정** — 절반은 답이 나왔다. **Repeat / Reminder는 §16.35가 P1로 배치**했으므로 유지하되 뒤로 미루면 된다. 그러나 **간트 · 목표(Goals) · status 6종은 P0에도 P1에도 없다** — 계획서가 다루지 않는 영역이므로 여전히 명시적 결정이 필요하다. 조용히 남겨두면 v0.10.x에서 정리한 것과 같은 잔재가 된다
4. ~~**Migration Phase 4 (§6.72) — `List.projectId` nullable**~~ — **완료.** 계획서는 `NOT NULL` 제약 완화를 말하지만 `lists` 테이블은 `data jsonb` 한 칸이라 완화할 컬럼이 없었다. 제약은 `sanitizeList`의 게이트에 있었고, 거기서 풀었다 — `kind`가 "스스로 독립을 선언한 List"(`"regular"`/`"inbox"`)와 "그냥 owner를 잃은 레코드"를 가르고, 후자만 계속 버린다. `activeLists`는 빈 Project로 물으면 아무것도 답하지 않는다(§6.79/§6.80). 생성 UI는 Implementation Phase 3(§16.48) 몫이므로 아직 아무것도 독립 List를 만들지 않는다
5. **Phase 1(§6.68) 잔여 필드** — `List.sidebarFolderId`, `Task.sectionId`, `SidebarFolder`, `ListSection`, `SavedFilter`
6. ~~**`TaskDailyPlan` (§6.68)**~~ — **완료.** A절이 지적한 *"Today override가 localStorage에 있고 동기되지 않는다"*의 정식 해법. 하루치 계획을 Task에 박지 않고(§6.19) 별도 레코드로 두었고, `daily_plans` 테이블과 함께 동기된다. 기기에 남아 있던 블롭은 id로 병합해 흡수하되 덮어쓰지 않는다
7. ~~**`Tag` / `TaskTag` (§6.45)**~~ — **완료.** B절의 `tag` Scope가 "Tag 레코드 없음"이라 막혀 있던 것이 풀렸다. `Task.tags` 문자열은 그대로 두고 레코드를 옆에 세웠다 — 문자열을 고치면 그 태그를 단 모든 Task를 다시 써야 하지만 레코드는 한 줄이면 되고, 그게 이 조인이 존재하는 이유다. 레거시 `space:`/`group:` 마커는 백필에서 걸러진다
8. ~~**Implementation Phase 1 (§16.24) — Canonical Registry / URL**~~ — **완료.** Gate 1의 여섯 항목이 전부 테스트로 고정됐다: 9개 Scope URL 왕복, `?view=banana` → 기본 View, `/` → `/today`, 기본 `view=list`는 URL에서 생략, `?task=` 보존, 그리고 쿼리 순서 고정. 화면에는 아직 붙이지 않았다 — §16.48이 "Query 전에 화면을 만들지 않는다"고 못박고, Phase 2(Query/Count)가 그 사이에 있다
9. ~~**Implementation Phase 2 (§16.25) — Query / Count / Scope Read Model**~~ — **완료.** `domain/tasks/scopeQuery.ts`가 9개 Scope의 membership을 술어 하나로 정의하고, 쿼리와 count는 거기서 파생된다(§12.14의 *"Count = 해당 Scope query의 row count"*). Gate 2가 요구하는 "query ids == matchesScope ids == count 대상 ids"는 우연이 아니라 구조상 참이다. **단 Today는 지금 답이 둘이다** — 이 canonical 술어(§12.5.1: overdue + 오늘 마감 + TodayPlan)와, TodayPage가 여전히 쓰는 `utils/todayView.ts`의 `isTodayTask`(doing/waiting 상태와 `scheduledDate`까지 포함). 화면을 바꾸는 Phase 3에서 하나로 합쳐진다
10. **Implementation Phase 3 (§16.26) — Shell / Sidebar / Main List** — **1차 완료.** 9개 Scope가 canonical URL로 전부 navigate되고, 사이드바가 §2.7 순서(Smart Lists → 리스트 트리 → 태그 → 완료/휴지통)로 렌더되며, 개수는 전부 `queryScopeCount`에서 온다. 허용 View만 셀렉터에 나오고(Today는 셀렉터 자체가 없음), 없는 레코드를 가리키는 링크는 빈 Scope가 아니라 "찾을 수 없음"으로 구분된다. **기존 앱과 공존한다** — `/app`과 `/s/...`는 그대로고, Tasks Module은 자기 9개 경로만 가져간다. 남은 것: Board(Phase 7), Drawer(Phase 5), Quick Add(Phase 4), 그리고 `/` → `/today` 전환(현관을 바꾸는 건 별도 결정)
