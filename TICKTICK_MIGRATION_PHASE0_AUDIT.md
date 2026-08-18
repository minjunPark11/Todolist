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
5. ~~**Phase 1(§6.68) 잔여 필드**~~ — **완료.** `ListSection`+`Task.sectionId`, `SidebarFolder`+`List.sidebarFolderId`, `SavedFilter`가 전부 레코드가 됐고, `Task.sortKey`는 새 필드 대신 이미 있던 `Task.order`를 쓴다(§6.68의 *"실제 현재 schema에 이미 있는 필드는 재사용한다"* — 지금까지 Task를 이 값으로 정렬한 곳이 하나도 없어서 두 번째 의미가 생기지 않는다). 세 잔여 항목의 상세는 아래 14번
6. ~~**`TaskDailyPlan` (§6.68)**~~ — **완료.** A절이 지적한 *"Today override가 localStorage에 있고 동기되지 않는다"*의 정식 해법. 하루치 계획을 Task에 박지 않고(§6.19) 별도 레코드로 두었고, `daily_plans` 테이블과 함께 동기된다. 기기에 남아 있던 블롭은 id로 병합해 흡수하되 덮어쓰지 않는다
7. ~~**`Tag` / `TaskTag` (§6.45)**~~ — **완료.** B절의 `tag` Scope가 "Tag 레코드 없음"이라 막혀 있던 것이 풀렸다. `Task.tags` 문자열은 그대로 두고 레코드를 옆에 세웠다 — 문자열을 고치면 그 태그를 단 모든 Task를 다시 써야 하지만 레코드는 한 줄이면 되고, 그게 이 조인이 존재하는 이유다. 레거시 `space:`/`group:` 마커는 백필에서 걸러진다
8. ~~**Implementation Phase 1 (§16.24) — Canonical Registry / URL**~~ — **완료.** Gate 1의 여섯 항목이 전부 테스트로 고정됐다: 9개 Scope URL 왕복, `?view=banana` → 기본 View, `/` → `/today`, 기본 `view=list`는 URL에서 생략, `?task=` 보존, 그리고 쿼리 순서 고정. 화면에는 아직 붙이지 않았다 — §16.48이 "Query 전에 화면을 만들지 않는다"고 못박고, Phase 2(Query/Count)가 그 사이에 있다
9. ~~**Implementation Phase 2 (§16.25) — Query / Count / Scope Read Model**~~ — **완료.** `domain/tasks/scopeQuery.ts`가 9개 Scope의 membership을 술어 하나로 정의하고, 쿼리와 count는 거기서 파생된다(§12.14의 *"Count = 해당 Scope query의 row count"*). Gate 2가 요구하는 "query ids == matchesScope ids == count 대상 ids"는 우연이 아니라 구조상 참이다. **단 Today는 지금 답이 둘이다** — 이 canonical 술어(§12.5.1: overdue + 오늘 마감 + TodayPlan)와, TodayPage가 여전히 쓰는 `utils/todayView.ts`의 `isTodayTask`(doing/waiting 상태와 `scheduledDate`까지 포함). 화면을 바꾸는 Phase 3에서 하나로 합쳐진다
10. **Implementation Phase 3 (§16.26) — Shell / Sidebar / Main List** — **1차 완료.** 9개 Scope가 canonical URL로 전부 navigate되고, 사이드바가 §2.7 순서(Smart Lists → 리스트 트리 → 태그 → 완료/휴지통)로 렌더되며, 개수는 전부 `queryScopeCount`에서 온다. 허용 View만 셀렉터에 나오고(Today는 셀렉터 자체가 없음), 없는 레코드를 가리키는 링크는 빈 Scope가 아니라 "찾을 수 없음"으로 구분된다. **기존 앱과 공존한다** — `/app`과 `/s/...`는 그대로고, Tasks Module은 자기 9개 경로만 가져간다. 남은 것: Board(Phase 7), Drawer(Phase 5), Quick Add(Phase 4), 그리고 `/` → `/today` 전환(현관을 바꾸는 건 별도 결정)
11. **Implementation Phase 4 (§16.27) — Quick Add / Create Resolver** — **1차 완료.** `domain/tasks/createResolver.ts`가 §12.16의 표 하나로 답하고, Gate 4의 9행이 테스트와 실제 앱 양쪽에서 확인됐다. 이 과정에서 `TaskDailyPlan.bucket`을 **선택으로 풀었다** — 레코드가 담는 사실이 둘("그날로 계획됨" / "그날의 어느 버킷")인데 하나로 묶여 있어서, 마감일 없이 Today에서 만든 작업이 Today에 남을 방법이 없었다. 계획서 §6.18도 `bucket?`이다. 남은 것: Global Quick Add(§8.34), 자연어 날짜(§8.24), Filter create compiler(SavedFilter 필요)
12. **Implementation Phase 5 (§16.28) — Task Detail / Subtask** — **1차 완료.** Gate 5 다섯 항목 모두 앱에서 확인(Drawer↔URL, 새로고침 복원, Back 한 번으로 닫힘, 하위 작업 CRUD, Drawer 편집이 메인 행에 즉시 반영). §16.28대로 Repeat/Reminder는 비활성 placeholder가 아니라 **아예 없다**.

    **C-3(Subtask 정면 충돌)의 증거가 구체화됐다.** `addSubtask`는 `Subtask` 레코드가 아니라 **`parentTaskId`를 가진 자식 Task를 만든다** — 계획서 §13.3이 금지하는 바로 그 형태다. 그 결과 하위 작업이 부모의 List 화면에 **최상위 행으로 뜨고 개수에도 잡혔다.** §13.3이 예측한 비용("모든 Task Query가 `parentTaskId IS NULL`을 기억해야 한다")이 그대로 나온 것이다. `matchesScope` 맨 앞 한 줄로 막았지만, **구조적 해결(별도 `TaskSubtask` 엔티티)은 여전히 열린 1급 항목이다** — 지금은 그 예외를 아홉 곳이 아니라 한 곳에서 기억하고 있을 뿐이다
13. **Implementation Phase 6 (§16.29) — Mutation / Optimistic / Undo** — **1차 완료.** `domain/tasks/mutations.ts`가 각 변경을 "적용할 patch + 되돌릴 patch"로 기술하고, `leavesScope`가 §12.21의 재평가를 한 곳에서 답한다. 앱에서 확인: 휴지통 → 행 제거 + 개수 감소 + Drawer 닫힘 + 휴지통 Scope 증가 + Undo 토스트, Undo → 전부 원복(`deletedAt`이 `""`가 아니라 **없던 상태 그대로**). 완료 → Today에서 빠지고 완료 Scope로 이동. **Gate 6의 세 상태 중 success와 Undo만 확인했고 server failure 경로는 확인하지 못했다** — 현재 동기 실패는 `syncError` 표면 하나뿐이라 mutation 단위 롤백이 없다. 남은 것: optimistic coordinator, stale write handling, Undo 스택(§9.40은 MVP에서 제외)
14. **Phase 0 잔여 스키마 (§16.23 Gate 0 / §6.68)** — **완료.** Phase 7(Board/DnD)이 요구하는 것들이 화면보다 먼저 생겼다. 계획서가 Phase 0을 Phase 1 앞에 두는 이유가 그것이고, 없는 채로 Board를 만들었으면 Board가 스키마를 발명했을 것이다.

    - **`ListSection` + `Task.sectionId` (§6.26-§6.29).** 두 Board가 같아 보이지만 다른 것이라는 §6.24를 스키마가 먼저 말한다 — Inbox Board 칼럼은 날짜 버킷이라 레코드가 아니고, List Board 칼럼만 레코드다. §6.28의 "다른 List의 Section을 가리키는 Task 금지"는 `data jsonb` 한 칸에 제약을 걸 곳이 없어서 **읽는 쪽에서** 답한다(`sectionIdFor`) — 이 리포가 `listIdFor`·`projectIdFor`에서 이미 쓰는 방식이고, 덤으로 **Section을 지워도 그 안의 Task가 사라지지 않는다**(기본 칼럼으로 돌아온다. 칼럼 삭제가 Task 전부를 다시 쓰는 것이 아니다). §6.29의 `listId 변경 → sectionId = null`은 `moveTaskToList`에 있고, 목적지 List의 Section을 **사용자가 명시적으로 고른 경우에만** 유지한다
    - **`Task.sortKey` = `Task.order` (§6.30/§6.31).** §6.30이 정수 index 대신 "삽입 친화적 rank"를 요구하는 이유는 하나 — 두 Task 사이에 끼워 넣을 때 **한 행만** 쓰기 위해서다. `domain/tasks/sortKey.ts`가 간격 1000으로 두고 중간값을 잡으며, 자리가 없어지면 그때만 칼럼을 다시 번호 매긴다(같은 두 Task 사이에 40번을 연속으로 떨어뜨려도 아직 자리가 있다는 것이 테스트로 고정돼 있다). §6.31대로 정렬 범위는 `(listId, sectionId)`이며, 그래서 여러 List에서 Task를 모으는 Scope는 수동 정렬이 **불가능**하다 — `scopeRegistry.canManualReorder`가 이미 그렇게 말하고 있었다. 쓰는 쪽은 Phase 7 몫이라 지금은 전부 0이고, 그동안의 순서는 `createdAt`이 답한다
    - **`SidebarFolder` + `List.sidebarFolderId` (§6.33-§6.35, D18/D19).** 도메인 `Folder`(Project 안의 계층)와 **다른 것**이다. 하나는 List가 어디에 *속하는지*를, 다른 하나는 사용자가 어디에서 *보고 싶은지*를 말하고, 후자는 Project를 건드리지 않는다. 사이드바와 `folder` Scope가 같은 답(`folderIdFor`)을 읽으므로 그룹에 넣은 List가 도메인 Folder 아래에 **동시에** 뜨는 일이 없다. 그룹을 지워도 List는 남고, 원래 하던 대로 도메인 Folder 밑으로 돌아간다(§6.57)
    - **`SavedFilter` + `filterSpec` (§6.49-§6.51, §12.11).** 이걸로 `filter` Scope가 `return false` 스텁에서 벗어났고, **Phase 2와 Phase 4의 구멍이 같이 메워졌다** — 9번 항목의 "SavedFilter 레코드가 없어 답할 수 없다"와 11번 항목의 "Filter create compiler(SavedFilter 필요)"가 그것이다. spec은 §6.50대로 구조화된 JSON이고 §6.51의 `version`을 갖는다. 버전이 다르면 **통째로 거부한다** — 반만 읽은 spec은 멀쩡해 보이면서 엉뚱한 Task를 고르기 때문이다. 생성 시 자동 적용은 §12.11의 allowlist(`list` / `tag` / 구체적 `due` / `priority`)로 제한되고, 부정 조건·`contains`·범위 날짜는 **매칭은 되지만 적용되지 않는다**

    실제 앱에서 확인(테스트만이 아니라): 씨앗 데이터로 `list=l1 AND priority=high` Filter를 만들었더니 사이드바에 FILTERS 구획이 생기고 개수 1이 떴으며, 완료된 것과 휴지통에 있는 것은 둘 다 조건에 맞는데도 빠졌다(§12.11의 baseline). 그 Filter 안에서 작업을 만들자 **`l1`에 `priority: high`로 들어가 화면에서 사라지지 않았다.** 사이드바 그룹에 넣은 List는 "My group" 아래에만 뜨고 원래의 "Domain folder" 아래에는 뜨지 않았으며, 그 그룹을 열면 Quick Add가 그 그룹의 List만 골라 준다.

    남은 것: 이 레코드들을 **만드는 UI**가 아직 없다(Section은 Phase 7, SidebarFolder 이동은 Phase 9, Filter 편집기는 §8.30). 그리고 **C-3(Subtask)은 여전히 열려 있다** — Gate 0이 요구하는 `TaskSubtask` 불변식만은 스키마로 답하지 않았다. 12번 항목이 적은 대로 지금의 하위 작업은 `parentTaskId`를 가진 자식 Task이고, 그것을 별도 엔티티로 되돌릴지는 스키마 결정이 아니라 제품 결정이다(자식 Task는 마감일·상태·보드 자리를 갖지만 §13.3의 `TaskSubtask`는 체크박스다)

15. **Implementation Phase 7 (§16.30) — Board / DnD** — **1차 완료.** Gate 7의 네 줄이 전부 앱에서 확인됐다.

    계획서가 허용한 대로 **컬럼 컴포넌트는 하나**(`TaskBoard.tsx`)이고 **도메인 의미만 adapter로 갈린다**(`domain/tasks/board.ts`). 이 분리가 Gate 7 그 자체다 — 같은 드래그가 Inbox Board에서는 날짜를, List Board에서는 `sectionId`를 쓴다. 한 커맨드에 플래그를 다는 대신 두 커맨드로 둔 이유는 §6.24에 있다: Inbox 칼럼은 Task의 날짜에서 **계산되는 가상 칼럼**이고 List 칼럼은 `ListSection` **레코드**다. 하나로 합치면 "이 칼럼으로 옮겨라"가 무엇을 뜻하는지 코드가 추측해야 한다.

    - **Gate 7-1 (Scope별 다른 커맨드)** — Inbox에서 카드를 옮기면 `{isSomeday, dueDate}`가, List에서 옮기면 `{sectionId}`가 바뀐다. 앱에서 둘 다 확인
    - **Gate 7-2 (Inbox 드래그가 sectionId를 만들지 않는다)** — `moveToInboxBucket`은 그 필드에 **닿을 수가 없다**(쓰는 필드가 둘뿐이다). 실제 이동 후에도 `sectionId`는 계속 없음
    - **Gate 7-3 (List 드래그가 due/someday를 건드리지 않는다)** — 마감일 `2026-08-22`를 가진 작업을 Doing → Review로 옮겼고 날짜는 그대로였다
    - **Gate 7-4 (파생 정렬에서 수동 정렬 비활성)** — Board는 `canManualReorder`가 참인 두 Scope(Inbox·List)에서만 열린다. `allowedViews`가 이미 그렇게 정의돼 있어서 구조적으로 참이고, 플래그는 그래도 `TaskBoard`까지 전달된다

    §6.25의 "미분류 → 일정"은 **날짜를 먼저 묻는다.** 그 칼럼이 곧 날짜라서, 날짜 없이 떨어뜨리면 자기 칼럼의 규칙을 만족하지 않는 카드가 된다 — Upcoming Scope에서 생성이 날짜를 요구하는 것과 같은 거절이다(§12.6). 앱에서 확인: 날짜를 고르기 전에는 **아무것도 쓰이지 않았고**, 고른 뒤에야 `dueDate`가 들어갔다. §6.23의 불변식(someday면 날짜 없음)은 같은 patch 안에서 함께 지워진다.

    **드래그가 유일한 길이 아니다.** §16.30이 요구하는 non-drag 대안으로 카드마다 "옮기기" 셀렉터가 있다 — 키보드로 닿고 터치로 눌린다. 드래그는 정밀 포인터와 양쪽 끝을 동시에 보는 시야를 요구하는데, 그건 기능이 아니라 전제 조건이다.

    수동 정렬은 §6.30의 sortKey를 쓴다. 앱에서 확인: 마지막 카드를 맨 앞으로 끌었을 때 **그 한 행만** `order: -1000`이 됐고 나머지 셋은 0 그대로였다. Undo는 칼럼과 자리를 **함께** 되돌린다(someday로 옮긴 뒤 Undo → `isSomeday: false` + 원래 `order`).

    남은 것: 완료된 Task의 Board 표시(§7.35), Section을 **만드는** UI(지금은 레코드가 있어야 칼럼이 보인다), 터치 드래그(§16.35에서 P1), Upcoming Board(§7.18)

16. **Implementation Phase 8 (§16.31) — Search / Command Palette** — **1차 완료.** Gate 8의 네 줄이 전부 앱에서 확인됐다.

    §10.1이 한 상자 안에서 두 가지를 갈라 놓는다 — **검색은 무엇을 찾는가, 명령은 무엇을 실행하는가**. 입력창만 공유하고 의미는 나눈다. 그래서 명령은 검색 결과에 섞인 행이 아니라 **자기 가용성 규칙을 가진 레코드**다(`domain/tasks/commands.ts`).

    - **Gate 8-1 (결과는 canonical Scope + task URL로 연다)** — §10.18이 두 전략을 저울질하고 B를 고른다: Task는 **자기 자리로 이동한 뒤** Drawer가 열린다. A(현재 화면 위에 Drawer만)는 뒤의 목록과 열린 Task가 서로 다른 것을 말하는 화면을 만든다. 앱에서 확인: 팔레트에서 Inbox 작업을 고르니 `/inbox?task=t3`으로 이동하고 Drawer가 열렸다
    - **Gate 8-2 (Trash 기본 제외)** — §10.30. 버린 것을 전역 검색이 다시 들이미는 일이 없다. 앱에서 확인: "Trashed report"는 팔레트에도 검색 페이지에도 없었다
    - **Gate 8-3 (권한 없는 command 노출/실행 금지)** — 같은 술어를 **두 번** 묻는다. `availableCommands`는 보여줄지를, `canRunCommand`는 실행할지를 — 팔레트가 열려 있는 동안 Scope가 바뀔 수 있으므로 두 질문은 서로 다른 시점의 서로 다른 상태에 대한 것이다. 앱에서 확인: "보드로 보기"가 `/inbox`에서는 나오고 `/today`(보드가 없는 Scope)에서는 **아예 나오지 않았다**
    - **Gate 8-4 (Palette state와 Search URL state 혼동 금지)** — §10.23. 팔레트에 타이핑하는 동안 주소는 `/today` 그대로였고, "결과 전체 보기"를 눌렀을 때만 `/search?q=board`가 생겼다. 검색 페이지의 입력은 반대로 URL에 묶여 있어서 새로고침해도 `report`와 결과 3건이 그대로 복원된다(§10.21)

    검색 페이지는 **Scope가 아니다** — 레지스트리 항목도, 허용 View도, 셀 것도 없다. 같은 셸 안에서 열리는 페이지이고(§10.19), 그래서 `canonicalizeTaskUrl`은 `/search`에 대해 `null`을 답한다(정리할 규칙이 그 페이지의 것이 아니다). 사이드바는 그동안 아무것도 현재로 표시하지 않는다.

    랭킹은 §10.25의 앞 세 줄까지만이다 — exact → prefix → substring. fuzzy와 한국어 초성은 §10.26/§10.27이 명시적으로 P1이고, **틀린 결과를 영리하게 정렬해도 여전히 틀린 결과**다. 완료된 작업은 §10.29대로 숨기지 않고 "완료됨"을 달아 아래로 내린다(앱에서 확인: exact match인 완료 작업이 prefix match인 미완료 작업보다 **아래**에 왔다).

    남은 것: 최근 항목/최근 검색어(§10.43-§10.45), 팔레트에서 Quick Add(§10.41-§10.42), `>` command prefix(§10.35, P1), Project/Space 검색 결과(§10.16 — Tasks Module 밖의 URL이라 Spaces 라우팅과 함께 붙여야 한다), 검색 페이지 type filter(§10.20)

17. **Phase 8 잔여 (§10.16, §10.20, §10.41-§10.45, §10.49)** — **완료.** 16번이 남겼다고 적은 목록을 처리했다. 하나(`>` prefix)만 남았고, 그건 §10.35가 **MVP에서 빼라**고 명시한 것이다 — "특수 prefix 없이 일반 입력 안에서 command도 검색", P1 이후 지원.

    - **최근 항목 (§10.43/§10.44)** — 팔레트를 열고 아무것도 입력하지 않았을 때 나온다. Scope 5개 + Task 5개, 중복 제거, 최신이 앞. §10.8이 *"과도한 추천 알고리즘은 넣지 않는다"*고 못박아서 **추천이 아니라 기록**이다 — 사용자가 실제로 간 곳이라 설명할 필요가 없고 틀릴 수도 없다. 기록은 **URL에서** 읽는다(클릭이 아니라): 뒤로가기로 간 곳이나 붙여넣은 링크로 간 곳도 똑같이 센다. 저장은 §10.44대로 기기 로컬(`focusflow.tasks.recents.v1`)이고 계정에 동기되지 않는다 — 동기할 가치도 없거니와, 무엇을 열었는지의 목록은 본인보다 어깨너머로 보는 사람에게 더 유용하다. **레코드가 사라진 항목은 표시하지 않는다**(지워진 Task를 여는 행은 한 줄 모자란 것보다 나쁘다)
    - **검색어 기록은 넣지 않았다 (§10.45)** — 계획서의 권장 그대로다. Task title 검색어는 이 앱에서 가장 사적인 텍스트가 될 수 있다
    - **팔레트에서 Quick Add (§10.41/§10.42)** — 입력이 아무것과도 일치하지 않으면 맨 아래에 `"…" 작업 만들기`가 붙고, 그게 Enter가 갈 곳이 된다. **바로 만들지 않는다** — §10.42가 금지한다. Inbox로 이동시키고 Quick Add 입력에 제목을 **채워 둔다**. 앱에서 확인: 팔레트에서 "buy milk on the way home"을 입력하고 Enter → `/inbox`로 이동, 입력창에 그 문장이 들어가 있고, **작업 수는 그대로 1개**였다(사용자가 Add를 눌러야 생긴다)
    - **Project / Space 검색 (§10.16)** — 두 개의 새 그룹이 §10.11 순서 맨 뒤에 붙었다. 목적지는 Scope가 아니라 **Spaces 라우트**다(`/s/:spaceId/p/:projectId`) — Tasks Module 밖이라 `pathForSelection`이 답한다. 앱에서 확인: 검색 결과의 프로젝트를 누르니 `/s/s1/p/p1`로 나갔다. 레코드가 없는 Project는 빈 id로 경로를 만드는 대신 `/app`으로 보낸다
    - **그룹별 결과 제한 (§10.49)** — 하나의 숫자가 아니라 종류별로: Task 5, 나머지 3. 팔레트는 빨리 가는 곳이고, 검색 페이지가 "전부"를 맡는다(거기선 50)
    - **검색 페이지 type filter (§10.20/§10.22)** — 전체/작업/리스트/… 칩. **실제로 결과가 있는 종류만** 나오므로 눌러서 빈 화면이 되는 칩이 없다. §10.22대로 로컬 state이고 URL에는 `q`만 남는다 — 앱에서 확인: Projects 칩을 눌러도 주소는 `/search?q=research` 그대로였다
    - **Empty state (§10.46)** — 팔레트는 "결과 없음 + 만들기", 검색 페이지는 검색어를 되짚어 말하고 다른 검색어를 권한다. 두 화면이 다른 말을 하는 것은 §10.46이 각각 따로 적어둔 대로다

    남은 것: `>` command prefix(§10.35, P1), remote search의 loading/error 표면(§10.47/§10.48 — 지금 검색은 전부 클라이언트 로컬이라 불러올 것이 없다)

18. **Implementation Phase 9 (§16.32) — Container Lifecycle** — **1차 완료.** Gate 9의 네 줄이 전부 앱에서 확인됐다.

    정책 전체가 한 문장이다: **컨테이너의 생애주기는 그 안의 것을 다시 쓰지 않는다.** List를 보관해도 Task는 움직이지 않고, Project를 지워도 List는 그대로이며, Space를 지우면 아무 일도 일어나지 않는다. 이유는 §13.19에 있다 — *"Project / Space는 List의 고급 context이지 Task의 직접 owner가 아니다"*. `domain/spaces/lifecycle.ts`가 세 컨테이너 × 네 동작을 한곳에서 답한다.

    - **Gate 9-1 (Task orphan 없음)** — Task는 어느 상태에서도 `listId`를 유지한다. 화면에서 사라지는 이유는 **주인 List가 active 조건을 잃어서**지 Task에 무언가 쓰여서가 아니다(§13.19의 공통 precondition을 `isTaskActive` 한 곳에서 답한다)
    - **Gate 9-2 (List delete가 Task hard delete를 유발하지 않음)** — §6.56의 *"List 삭제 때문에 자식 Task를 개별 Trash Task로 바꾸지 않는다"*. 앱에서 확인: 작업 2개짜리 리스트를 삭제하니 리스트에 `deletedAt`이 붙고 **두 Task는 `deletedAt` 없이 `listId`도 그대로**였다. Today·Upcoming·List 개수는 전부 빠졌고, **휴지통 Scope에는 나타나지 않았다** — 휴지통은 사용자가 버린 Task의 목록이라는 §13.25의 구분이 그대로 지켜진다
    - **Gate 9-3 (restore가 FK를 보존)** — 관계를 지운 적이 없으니 복원이 필드 하나다. 앱에서 확인: 복원하자 리스트와 **작업 2개가 모든 Scope 멤버십과 함께** 돌아왔다(Today 1, 다음 7일 1, 리스트 2). 백필 없음
    - **Gate 9-4 (destructive cascade가 §13 정책을 넘지 않음)** — 앱 전체에서 hard delete는 **한 군데**뿐이다: 이미 삭제 상태인 List의 영구 삭제(§6.56). Project 영구 삭제는 연결 List를 **독립 List로 남기고**(§13.29) Task는 건드리지 않으며, Space 영구 삭제는 참조하는 Project가 하나라도 있으면 **차단된다**(§13.32 — 보관/삭제된 Project도 복구 가능하므로 함께 센다)

    **§13.20의 배타성**(archived면 deleted 아님, 반대도)은 각 명령이 반대편을 지우는 것으로 보장한다. 두 타임스탬프가 동시에 설정될 수 있으면 "복원"이 *어느 상태로* 돌아가는지 모호해진다.

    **이 과정에서 기존 `deleteProject`를 고쳤다.** 그것은 Project row를 즉시 hard delete하면서 **그 아래 모든 Task의 `projectId`를 빈 값으로 다시 썼다** — 복구 불가에 Task 전부에 쓰기. §13.28은 정확히 그 반대를 말한다. 이제 soft delete이고, Task는 손대지 않으며, 영구 삭제조차 List를 살려 둔다.

    **관리 화면 (§13.25)** — "보관된 리스트 / 삭제된 리스트"는 **Scope가 아니다.** 계획서가 두 번 못박는다: §12의 9개 레지스트리를 늘리지 않고, 삭제된 List를 Task 휴지통에 섞지 않는다. 사이드바 LISTS 구획의 "관리"에서 열리는 다이얼로그이며, 영구 삭제만 **두 번 묻는다** — 두 번째 문장이 함께 사라질 작업 개수를 말한다("작업 2개도 함께 영구 삭제됩니다"). 앱에서 확인: 첫 클릭은 **아무것도 지우지 않았고**(store 그대로), 확인 후에야 리스트와 작업 2개가 사라졌다

    남은 것: Project/Space의 복원 **화면**(도메인과 store 명령은 전부 있지만 Spaces UI에는 아직 "삭제된 프로젝트" surface가 없다), Folder lifecycle(계획서가 SidebarFolder만 다루고 도메인 Folder의 delete는 정의하지 않는다)

19. **Implementation Phase 10 (§16.33) — Responsive Presentation** — **1차 완료.** Gate 10을 세 폭에서 확인했다.

    §15.9가 이 레이어가 **해서는 안 되는 일**을 정한다: *"Responsive rendering은 URL canonicalization의 원인이 아니다."* 창을 390px로 줄여도 `/list/l1?view=board&task=t1`은 그대로고, 바뀌는 것은 Drawer가 그려지는 자리뿐이다. `domain/tasks/responsive.ts`의 어떤 값도 query·count·command가 읽지 않으므로 **Gate 10은 세 폭을 테스트해서 통과한 것이 아니라 구조상 참**이다.

    - **§15.3의 네 모드** — mobile(<768) / tablet(768~1023) / compactDesktop(1024~1279) / wideDesktop(≥1280). 계획서의 상수 그대로
    - **§15.17의 Task Detail 레지스트리** — inline-drawer / overlay-drawer / right-sheet / full-screen. 컴포넌트는 하나이고 **어디에 그릴지만** 다르다
    - **§15.4의 분리** — 폭은 모드를, `(pointer: coarse)`는 히트 타깃을 정한다. 마우스를 쓰는 1024px 창과 1024px 태블릿은 같은 모드이면서 다른 크기를 원한다. 앱에서 확인: coarse 포인터에서 행과 작업 버튼이 **44px**로 커졌다(§15.12의 바닥)
    - **§15.14~§15.16의 사이드바** — desktop에서는 컬럼, 그 아래에서는 오버레이 시트(scrim + 헤더의 메뉴 버튼). `display:none`이 아니라 off-canvas라서 열림이 눈으로 따라갈 수 있는 움직임이고 트리의 스크롤 위치도 유지된다
    - **§15.20의 focus trap / restore** — 덮는 표현(overlay/sheet/full-screen)에서만 건다. wide desktop의 inline Drawer는 목록 **옆** 컬럼이라 가두면 그 목록으로 탭해 돌아갈 수 없다
    - **§15.37의 키보드** — `100vh`는 온스크린 키보드가 올라와도 줄지 않아서 full-screen 상세의 하단(하위 작업 입력 등)이 키보드 아래로 들어간다. `visualViewport.height`를 `--tm-viewport-height`로 흘려보내고, API가 없으면 `100dvh`로 떨어진다
    - **§15.22 / §15.39** — 모드별 좌우 여백(32/24/20/16)과 safe-area inset

    **Gate 10 확인 (동일 Golden Journey, 세 폭).** 1440(wideDesktop·inline-drawer) / 900(tablet·right-sheet) / 375(mobile·full-screen)에서 같은 여정 — 보드에서 카드를 다른 칼럼으로 이동 — 을 실행했고 **도메인 결과가 세 번 모두 동일**했다(`sectionId` 변경, `dueDate`·`isSomeday`·`listId` 불변). URL은 세 폭 모두 `/list/l1?view=board&task=t1` 그대로였다 — 특히 **휴대폰 폭에서도 `?view=board`가 사라지지 않았다**(§15.9가 명시적으로 금지하는 재작성).

    **확인하지 못한 것 두 가지, 도구의 한계다.** 임베디드 미리보기 창은 뷰포트를 바꿔도 페이지에 `resize`·`orientationchange`·`ResizeObserver` 중 **아무 신호도 보내지 않아서**, 실행 중 폭 변경(리로드 없는 모드 전환)은 확인할 수 없었다 — 각 모드는 그 폭에서 **로드해서** 확인했다. 훅은 세 신호를 모두 듣는다. 또 그 창은 프레임을 합성하지 않아 CSS transition이 진행되지 않는다(사이드바가 열림 클래스를 받고도 시작 위치에 멈춰 있었고, transition을 끄자 즉시 제자리로 갔다). 둘 다 앱 쪽 문제가 아니다.

    남은 것: **Mobile Bottom Navigation(§15.12)** — 다섯 칸이 Tasks·Calendar·Spaces·Focus·Search라서 Tasks Module 하나가 아니라 **앱 셸 전체**의 것이다. 지금 Tasks Module은 기존 앱과 공존하고(§16.26의 "기존 앱과 공존한다") 셸을 소유하지 않으므로, 셸이 하나로 합쳐질 때 붙일 항목으로 남긴다. 그 밖에: 터치 DnD(§15.34, §16.35가 P1), Bottom Sheet picker(§15.21), Mobile Quick Add Bottom Sheet(§15.35)

20. **Implementation Phase 11 (§16.34) — Hardening** — **진행 중.** Gate 11의 여섯 줄 중 넷을 닫았다.

    - **Today 이중 정의 해소 (Gate 11의 "query/count semantic mismatch 0")** — 9번 항목이 남긴 마지막 불일치다. `utils/todayView.ts`의 `isTodayTask`가 사라지고 `matchesScope`를 부른다. **이건 화면이 바뀌는 변경이다**: 날짜 없는 `doing`/`waiting` 작업이 Today에서 빠진다(§12.5.1은 Today를 *날짜*로 정의하지, 일이 어떻게 진행 중인지로 정의하지 않는다). 잃지 않은 것 둘: `scheduledDate === today`는 §6.18 `TaskDailyPlan`의 **레거시 형태**로 계속 읽히고(`Task.tags`를 Tag 레코드 옆에서 계속 읽는 것과 같은 dual read), "오늘 완료함" 줄은 멤버십이 아니라 **별도 질문**(`completedOn`)으로 그 자리에 남는다. 덤으로 §13.19가 공짜로 붙었다 — 보관/삭제된 List의 작업이 Today 화면에서도 빠진다
    - **P0 Golden Journey 12개 (§16.21)** — `domain/tasks/goldenJourneys.test.ts`. 다만 **도메인 레벨**이다: 이 리포에는 브라우저 하니스가 없어서, 화면이 부르는 그 함수들을 사용자가 일으키는 순서대로 조립해 확인한다. 버튼이 눌리는지가 아니라 규칙이 맞물리는지를 본다. 각 여정은 단계별로 실제 앱에서도 걸어봤고 그 기록이 이 문서 위쪽에 있다
    - **unsupported URL state 0** — `domain/tasks/hardening.test.ts`가 쓰레기 URL 열두 개를 넣고, **모듈이 주장한 것은 전부** 9개 Scope 중 하나로 canonical하게 왕복하며 두 번 정리해도 안 바뀌고 허용되지 않은 View를 절대 갖지 않음을, **주장하지 않은 것은** 파서도 남의 경로로 인정함을 고정한다
    - **stale response ignore (loading race)** — `loadSupabaseData`에 티켓이 생겼다. 두 로드가 동시에 떠 있을 때(재시도·재인증·탭 복귀) **오래된 응답이 마지막에 도착해 계정 상태를 조금 전으로 되돌리는** 데이터 손실 버그가 있었다. 느린 회선에서만 보이는 종류다. 이제 자기보다 새 로드가 시작됐으면 결과도 에러도 버린다
    - **접근성** — 메인 목록·보드 칼럼에 이름, 행 버튼에 "무엇을 여는지", 팔레트에 `combobox`/`listbox`/`option`(+`aria-selected`), 카드의 칼럼 이동 셀렉트에 라벨, `prefers-reduced-motion`에서 이 모듈의 transition 제거

    남은 것(Gate 11 미완): **P0 E2E 전부** — 브라우저 하니스가 없다. **critical accessibility violation 0** — 자동 검사 도구(axe 등)를 아직 붙이지 않았고, 위 손질은 코드 읽기 기반이다. **known destructive data-loss bug 0** — Phase 9의 `deleteProject`와 위 stale load 둘을 고쳤지만 "0"이라고 선언하려면 감사 한 바퀴가 더 필요하다. 그리고 §16.34의 나머지: mutation race test, query/cache profiling, 큰 목록의 virtualization 필요성 검증, browser zoom

21. **Phase 11 계속 — mutation race / 마이그레이션 (§16.34)** — 20번이 "감사 한 바퀴가 더 필요하다"고 적어둔 그 한 바퀴다. 저장 경로에서 **파괴적 버그 네 개**가 나왔고, 넷 다 같은 뿌리를 가진다: **로드에는 티켓이 있었는데 저장에는 없었다.**

    - **저장이 서로를 앞지를 수 있었다** — 디바운스(700ms)는 저장을 *시작*할 뿐 순서를 정하지 않는다. 회선이 느려 저장이 700ms보다 오래 걸리면 두 개가 동시에 떠 있고, 네트워크는 끝나는 순서를 약속하지 않는다. **오래된 저장이 나중에 도착하면 자기가 만들어둔 옛 레코드를 다시 써넣고**, 이어서 `syncedSnapshotRef`를 그 시점으로 **되돌린다**. 다음 편집이 있어야 자가 치유되므로, 사용자가 거기서 손을 놓으면 계정은 옛 내용을 그대로 갖는다
    - **저장 중 계정이 바뀌면 남의 계정에 썼다** — `getUserId()`가 저장 *안에서* await됐다. A로 로그인한 상태에서 시작한 저장이 그 왕복 동안 B로 로그인하면, **A의 레코드가 B의 `user_id`로 upsert된다**. 한 계정의 내용이 다른 계정에 섞이는 종류라 되돌릴 방법이 없다
    - **실패한 저장은 영영 재시도되지 않았다** — 재시도의 유일한 계기가 "다음 편집"이었다. 마지막 편집에서 네트워크가 끊기면 그 편집은 로컬에만 남고, 화면은 "동기화 실패"라고만 말한다
    - **"업로드" 버튼이 계정을 지웠다** — `uploadLocalDataToSupabase`가 로컬 상태를 그냥 저장했다. baseline이 방금 불러온 **계정 상태**이므로 `diffRemovedIds`가 *"로컬에 없는 계정 레코드 전부"*를 삭제 대상으로 계산하고, `setDataState(local)`이 화면까지 덮었다. 문구는 "로컬 데이터를 업로드할 수 있습니다"인데 동작은 **계정을 이 기기로 교체**였다. 상자가 뜨는 조건 자체가 *계정에도 데이터가 있고 이 기기에도 로컬 데이터가 남아 있는* 경우라, 정확히 잃을 것이 있는 사람에게만 보이는 버튼이었다

    고친 방식은 계획서가 `buildSyncPlan`에 쓴 것과 같다 — **결정을 순수 함수로 꺼내 노드에서 직접 테스트한다.** `buildSyncPlan`이 *무엇을* 쓸지 답하듯, 새 `domain/sync/saveQueue.ts`가 *언제* 쓸지 답한다: 한 번에 하나, 실행 중 들어온 요청은 **합쳐지고**(각 payload가 델타가 아니라 상태 전체라 마지막 것이 이미 앞의 것을 담고 있다), 실패는 **지수 백오프로 재시도**하며, `reset()`은 진행 중인 것의 결과까지 **소유권을 뗀다**(떠난 계정의 저장이 상태를 보고하거나 다음 실행을 시작하면 안 된다). 훅은 실행만 한다.

    `performSave`는 이제 **실패를 삼키지 않고 던진다**. 실패를 어떻게 볼지(재시도인지, 계정이 바뀌어 버릴 것인지)는 큐가 정하는데, 삼킨 에러는 성공한 저장과 구분되지 않는다. 계정 확인은 **세 번** 한다 — 차례를 기다린 뒤, `getUserId()` 왕복 뒤, 그리고 baseline을 올리기 직전. 마지막 것이 특히 필요하다: baseline은 *한* 계정의 행을 설명하는 물건이라 다른 계정에서 온 상태로 세워지면 안 된다.

    **`sync.retrying`이 새 상태로 생겼다.** 재시도가 예약된 것과 포기한 것은 사용자에게 다른 사건이다 — "실패"라고만 말하면 아직 잃지 않은 작업을 다시 입력하게 만든다.

    **마이그레이션은 이제 병합이고 삭제하지 않는다** (`domain/sync/buildMigrationUpload.ts`). 로컬에만 있는 레코드는 더해지고, 양쪽에 다 있는 레코드는 **계정 쪽이 이긴다** — 이 상자가 뜨는 상황에서 로컬은 보통 로그인 전에 남은 사본이고, 어느 쪽도 잃지 않는 결말만이 되돌리기를 요구하지 않는다. 손대지 않은 컬렉션은 **같은 배열로** 남긴다(`buildSyncPlan`이 identity로 진단하므로, 새 배열을 만들면 병합 한 번이 모든 테이블의 모든 행을 다시 올린다). settings는 컬렉션이 아니라 단일 행이라 "로컬에만 있는 절반"이 없고, 덮으면 모든 기기의 환경설정이 조용히 바뀌므로 계정 것을 유지한다.

    989 tests(975에서), 새 테스트 14개는 전부 노드 레벨이다 — 순서를 손으로 정하는 `perform`을 주입해 **오래된 저장이 새 저장 뒤에 도착하는 상황 자체를 만들 수 없다**는 것을 고정한다.

