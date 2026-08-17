# TickTick 재설계 — Phase 0 현행 감사 및 개념 매핑

계획서(`..._v16_E2E_IMPLEMENTATION_PLAN.md`) §6.67이 요구하는 Phase 0 산출물이다.

> 실제 코드/DB를 확인한 후 migration SQL을 작성한다.
> 문서 설계를 추측으로 바로 migration으로 옮기지 않는다.

여기 적힌 "현재"는 전부 v0.10.2 코드에서 확인한 값이다. 추정은 `추정`으로 표시했다.

---

## A. §6.67 감사 질문에 대한 답

| 질문 | 답 | 근거 |
|---|---|---|
| Task가 `projectId`를 직접 갖는가 | **그렇다**, 필수 `string` | `types.ts` Task |
| Task가 `listId`를 항상 갖는가 | **아니다**, `listId?` 선택 | 없으면 `membership.listIdFor`가 프로젝트 기본 List로 해석 |
| List가 `projectId`를 필수로 갖는가 | **그렇다** — 단 필드명이 `List.spaceId` | 이름은 Space, 값은 Project id |
| Folder와 List 관계 | Folder는 Project 소속(`Folder.spaceId`=Project id), List는 `folderId?` | `types.ts` |
| orphan Task가 있는가 | **있다** — `projectId: ""`인 받은함 작업 | `App.tsx`의 project 없는 Task 폴백 |
| Today override 저장 위치 | localStorage `todayPage.bucketOverrides.v1` | `utils/todayView.ts:36` — **동기되지 않음** |
| completed source | `task.status === "done"` + `completedAt` | 두 곳에 있고 `status`가 우선 |

---

## B. Scope 매핑 (§12.3의 canonical 9종)

| 목표 Scope | URL | 현재 대응물 | 격차 |
|---|---|---|---|
| `today` | `/today` | TodayPage (사이드바 "오늘") | **부분** — 화면은 있으나 Scope/Registry가 아님. plan override가 localStorage |
| `upcoming` | `/upcoming` | 없음 | **신규** |
| `inbox` | `/inbox` | `status === "inbox"` + Today 분류 서랍 | **구조 변경** — 화면 없음, 소유 개념 다름 |
| `list` | `/list/:id` | 트리의 List 선택 (`/s/:sp/p/:pj/l/:id`) | **부분** — 존재하나 Project 종속 |
| `folder` | `/folder/:id` | 트리의 Folder 선택 | **부분** — Domain Folder이고 Presentation Folder 아님 |
| `tag` | `/tag/:id` | 없음 (`task.tags: string[]`만) | **신규** — Tag 레코드 없음 |
| `filter` | `/filter/:id` | 없음 | **신규** |
| `completed` | `/completed` | 없음 (보관함은 archived 전용) | **신규** |
| `trash` | `/trash` | 없음 (`deletedAt`은 있는데 노출 화면 없음) | **신규** — 필드는 이미 있음 |

현재 있으나 목표 Scope에 자리가 없는 것:

- **간트(Gantt)** — §12.4 Allowed View는 List/Board뿐. 계획서 전체에서 간트 언급 4회, Scope 배정 없음
- **목표(Goals) / LearningPath** — Tasks Module 밖. 별도 결정 필요
- **집중(Focus)** — §5.60이 `/focus`를 남겨둠. 유지 가능

---

## C. 데이터 모델 매핑

### C-1. List

| 목표 (§6.87) | 현재 | 등급 |
|---|---|---|
| `kind: 'inbox' \| 'regular'` | 없음 (`isDefault: boolean`) | 신규 |
| `projectId: string \| null` | `spaceId: string` (필수, 값은 Project id) | **개명 + nullable** |
| `sidebarFolderId: string \| null` | 없음 | 신규 |
| `sortKey` | `order: number` | 개명 |
| `archivedAt` | `archivedAt?` | **일치** |
| `deletedAt` | 없음 | 신규 |
| — | `statuses?: Status[]` | 목표에 대응 없음 (유지 결정 필요) |

### C-2. Task

| 목표 | 현재 | 등급 |
|---|---|---|
| `listId: string` (필수) | `listId?` + `projectId` 필수 | **구조 변경 — 가장 큼** |
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
- Task 소유 축을 `projectId`+`listId?`(해석 함수) → `listId` 단일 필수로
- `List.spaceId` → `projectId` 개명 후 nullable
- Subtask를 Task self-reference → 별도 엔티티
- 날짜를 `dueDate`/`scheduledDate` → `dueOn`/`dueAt` + TodayPlan

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
2. **§16.35 P0/P1 경계 읽고 1차 범위 확정** — 9개 Scope를 다 만들 것인지, `inbox`/`today`/`list`부터인지
3. **4급 항목 결정** — 간트·목표·상태 컬럼을 유지할지 버릴지. 계획서에 자리가 없으므로 **명시적 결정이 필요**하다. 조용히 남겨두면 v0.10.x에서 정리한 것과 같은 잔재가 된다
