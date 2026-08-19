# Nav Shell 재설계 — Phase 0 현행 감사 및 해석 (§R)

- 대상 설계서: [`TICKTICK_NAV_SHELL_REDESIGN_SPEC.md`](TICKTICK_NAV_SHELL_REDESIGN_SPEC.md) (26,097줄, §0~§12 + Appendix A)
- 작성일: 2026-08-19
- 기준 코드: v0.13.0 (`9ec9d94`)
- 선행 문서: [v16 계획서](TICKTICK_STYLE_REDESIGN_IA_SIDEBAR_MAIN_DRAWER_URL_DATA_VIEWS_QUICKADD_INTERACTIONS_SEARCH_VISUAL_v16_E2E_IMPLEMENTATION_PLAN.md), [`TICKTICK_MIGRATION_PHASE0_AUDIT.md`](TICKTICK_MIGRATION_PHASE0_AUDIT.md)

---

## R.1 이 문서가 존재하는 이유

설계서는 이 저장소를 보지 않고 쓰였다. 그리고 이번에는 그보다 큰 문제가 하나 더 있다 — **설계서가 리포에 이미 있는 v16 계획서와 정면으로 충돌한다.** v16은 Space/Project 계층을 일상 흐름에서 숨기려고 만들어졌고, 새 설계서 §1.4는 그 계층을 사이드바 한복판에 되돌려 놓는다.

두 문서를 다 따를 수는 없다. 그래서 규칙은 셋이다.

1. **설계서 본문 §0~§12는 수정하지 않는다.** 원문을 고치면 다음 개정판과 대조할 수 없다.
2. **설계서와 이 저장소(또는 v16 계획서)가 충돌하면 전부 이 문서에서 해소한다.**
3. 이 문서와 설계서 본문이 다르면 **이 문서가 이긴다.**

### R.1.1 채택 결정 — 2026-08-19

> **v16의 List 중심 IA를 유지하되, 새 설계서의 Global Rail / Context Sidebar Frame / Main Content 분리 원칙은 채택한다.**

이 한 줄이 아래 모든 판정의 근거다. 풀어 쓰면:

- **가져오는 것은 셸의 "골격"이다** — 3열 분리, Rail 56px 불변, Context Sidebar의 폭·collapse·resize 계약, Main이 Rail/Sidebar를 모르는 경계.
- **가져오지 않는 것은 셸에 "담기는 내용"이다** — 사이드바 안에 무엇이 나열되는가는 v16 §1.14가 이미 정했고, 그건 화면 하나가 아니라 데이터 모델(Scope 9종, `listId` 소유 역전)까지 끌고 온 결정이다. 그림 한 장 때문에 되돌리지 않는다.

---

## R.2 설계서 섹션별 채택 판정

| § | 제목 | 판정 | 근거 |
|---|---|---|---|
| §1 | Navigation Architecture | **부분** | 3계층 분리(§1.2)·상태 모델(§1.23)·불변식(§1.24)은 채택. §1.4 Navigation Tree의 **내용**과 §1.5 Rail 항목표는 R.3/R.6에서 다시 쓴다 |
| §2 | Global Rail | **채택** | 리포에 대응물이 아예 없다. 충돌할 것도 없음 |
| §3 | Context Sidebar Frame | **채택** | 폭·collapse·resize·persistence 계약 전부. 리포에는 collapse만 있고 resize가 없다 |
| §4 | Tasks Sidebar | **거부** | v16 §1.14가 이긴다. 프레임(§3)만 쓰고 내용은 현행 `TasksSidebar` 유지 |
| §5 | Space / Project Tree | **채택 (조건부)** | 기본 Tasks 탐색 모델에서는 거부. 단 SpaceHub 진입 시 같은 Context Sidebar 자리를 SpaceTree로 전환한다 — D-14 |
| §6 | Create UX | **완료** | Add List는 v0.13.0에 이미 있다 ([`CreateListModal.tsx`](src/components/tasks/CreateListModal.tsx), [`TICKTICK_STYLE_ADD_LIST_DESIGN.md`](TICKTICK_STYLE_ADD_LIST_DESIGN.md)) |
| §7 | Main Content 연동 | **부분** | "Main은 Rail/Sidebar를 모른다"는 경계는 채택. Project View Registry(Overview 포함)는 거부 — D-09 |
| §8 | URL / Navigation State | **거부** | Appendix A.5의 `/project/:id/board` 계열은 v16 Scope 라우트와 양립 불가 — D-03 |
| §9 | Global Search | **부분** | `CommandPalette`가 이미 있다. "Rail에서 열리는 전역 오버레이"라는 위치만 채택 |
| §10 | Collapse / Resize | **채택** | §3과 한 덩어리 |
| §11 | Visual System | **보류** | 토큰 적용은 P0 마지막. 지금 손대면 `09-calendar-redesign.css` 오버라이드 층과 싸운다 |
| §12 | Responsive / A11y / Edge | **부분** | 브레이크포인트는 리포 `responsive.ts`가 이긴다 — R.5.5 |

---

## R.3 최대 충돌 — Context Sidebar에 무엇이 들어가는가

### 설계서 §1.4

```text
TASKS CONTEXT SIDEBAR
├─ Today
├─ Upcoming
├─ Spaces
│   └─ Space > Project > Project
└─ Archive
```

### 현행 = v16 §1.14 ([`TasksSidebar.tsx:126`](src/components/tasks/TasksSidebar.tsx:126))

```text
[ 오늘 · 다음 7일 · 받은함 ]
[ 리스트 (+ 추가 / 관리) — SidebarFolder 그룹핑 ]
[ 태그 ]
[ 필터 ]
[ 완료 · 휴지통 ]
```

`TasksSidebar.tsx` 머리 주석이 이 화면의 존재 이유를 이미 못박아 두었다 — 사용자에게 보이는 것은 도메인의 `Space > Project > Folder > List` 사다리가 아니며, **이 화면은 그 트리를 대체하려고 존재한다.**

**판정: v16이 이긴다.** 설계서 §4 전체와 §1.4의 사이드바 가지는 채택하지 않는다.

### 이 판정이 무효화하는 설계서 조항

거부 판정 하나가 설계서 여기저기 흩어진 전제를 같이 무너뜨린다. 구현 중 되살아나지 않도록 전부 적어 둔다.

| 조항 | 원문 전제 | 이 리포에서의 처리 |
|---|---|---|
| §1.24 INV-02 | Project가 active면 부모 Space가 사이드바에서 식별 가능해야 함 | **mode에 따라 갈린다.** `mode="tasks"`에서는 무효 — 사이드바에 Space가 없고, List의 부모 SidebarFolder 식별로 대체한다. `mode="space"`(D-14)에서는 **원문 그대로 유효**하다 |
| §1.24 INV-06 | 동시에 2개 이상 Project row active 금지 | **번역.** "2개 이상 Scope row active 금지"로 읽는다 |
| §1.24 INV-07 | Today와 Project 동시 active 금지 | **번역.** "Today와 List 동시 active 금지". `sameScope`([`TasksSidebar.tsx:44`](src/components/tasks/TasksSidebar.tsx:44))가 이미 보장 |
| §2.47 Route-to-Rail 매트릭스 | `/space/s1`, `/project/p1/board` | **재작성.** D-03의 표로 대체 |
| §1.24 INV-01/03/04/05/08 | — | **그대로 채택.** Space/Project에 의존하지 않는다 |

---

## R.4 어휘 매핑 — MUST

| 설계서 | 이 저장소 | 비고 |
|---|---|---|
| `GlobalModule` | **없음 — 신설 필요** | 지금은 `PageId`(React state)와 Scope 라우트로 쪼개져 있다. R.5.2 |
| `activeGlobalModule` | `activePage` ([`App.tsx:121`](src/App.tsx:121)) + `parseTaskScope` 분기 | URL에서 derive되지 않는다 — 이 감사의 최대 발견 |
| `Scope` | `TaskScopeRef` ([`scopeRegistry.ts`](src/domain/tasks/scopeRegistry.ts)) | 설계서는 4종, 리포는 9종. **리포가 이긴다** |
| `ProjectView` | `TaskViewKind` + `policy.allowedViews` ([`listView.ts`](src/domain/tasks/listView.ts)) | Overview 없음 — D-09 |
| `SpaceView` | `SpaceTab` ([`spaceTabUrl.ts`](src/lib/spaceTabUrl.ts)) | "개요" 탭이 여기 있다 |
| Context Sidebar | `TasksSidebar` (Tasks) / `Sidebar.tsx` (그 외) | **둘이다** — R.5.1 |
| `contextSidebarWidth` | **없음** | CSS 상수. `.app-shell` 248px, `--tm-sidebar-w` 240px |
| `contextSidebar.collapsed` | `focusflow-sidebar-collapsed` ([`App.tsx:1017`](src/App.tsx:1017)) | 키 이름 유지. 설계서 §3.67의 `focusflow.ui.*`로 개명하지 않는다 — D-07 |
| `GlobalOverlay: "search"` | `paletteOpen` ([`TasksModule.tsx:153`](src/components/tasks/TasksModule.tsx:153)) | Tasks 모듈 로컬 state — 전역으로 올려야 한다 |
| `GlobalOverlay: "account"` | 없음 (`userEmail` 텍스트만) | 신규 |
| `lastTasksLocation` | 없음 | 신규 (§2.20) |

---

## R.5 현행 감사

여기 적힌 "현재"는 전부 v0.13.0 코드에서 확인한 값이다. 추정은 `추정`으로 표시했다.

### R.5.1 셸이 둘이다 — 이번 작업의 몸통

[`App.tsx:1070`](src/App.tsx:1070)이 URL 하나로 앱을 두 갈래로 가른다.

| 조건 | 렌더 | 사이드바 | Main |
|---|---|---|---|
| `parseTaskScope(path)` 또는 `parseSearchUrl` | `<TasksModule>` | `TasksSidebar` (`.tm-shell` 그리드) | `.tm-main` |
| 그 외 전부 | `<Sidebar>` + `<main>` | `Sidebar.tsx` (`.app-shell` 그리드) | 페이지별 |

두 셸은 그리드도, 폭도, collapse 상태도 공유하지 않는다. **Rail을 붙이기 전에 이 둘을 합치지 않으면 Rail을 두 번 만들게 된다.** 설계서 §12.129의 `P0-2 AppShell + 56px Rail`은 이 리포에서 "AppShell 통합"이 90%고 "Rail"이 10%다.

### R.5.2 Rail의 active 상태를 URL에서 derive할 수 없다

설계서 §2.19 Active Derivation은 라우트에서 active Rail 항목을 유도하라고 요구한다. **현재는 불가능하다.**

- `activePage`는 URL이 아니라 `useState`다 ([`App.tsx:121`](src/App.tsx:121)).
- `navigateSection()` ([`App.tsx:1025`](src/App.tsx:1025))은 `setActivePage`와 selection 정리만 하고 **주소를 바꾸지 않는다.**
- 즉 캘린더·집중·보드·보관함·설정에는 **라우트가 없다.** 새로고침하면 `appSettings.defaultView`가 정한 페이지로 돌아간다.
- URL을 가진 것은 Tasks Scope 9종([`taskScopeUrl.ts`](src/app/taskScopeUrl.ts))과 트리 selection(`/s/:sp/p/:pj/l/:id`, [`spaceSelection.ts:119`](src/app/spaceSelection.ts:119))뿐이다.

**결론: 설계서 §12.129의 `P0-1 Route registry`는 이 리포에서 선택이 아니라 전제다.** Rail보다 먼저 온다.

### R.5.3 폭 상수

| 값 | 설계서 (A.1) | 현재 | 판정 |
|---|---|---|---|
| Rail | 56 | 없음 | 신규 |
| Sidebar default | 248 | 레거시 **200px** / Tasks **240px** — 아래 정정 | 248로 통일 (P0-3) |
| Sidebar min / max | 216 / 360 | 없음 (resize 자체가 없음) | 신규 |
| Overlay 폭 | §3.35 | `min(280px, 82vw)` ([`17-tasks-module.css:913`](src/styles/17-tasks-module.css:913)) | 현행 유지 `추정` — §3.35 확인 후 확정 |

**정정 (P0-2, 2026-08-19).** 이 표의 첫 판정은 "248px은 우연히 이미 맞다"였고, **틀렸다.** [`01-base.css:275`](src/styles/01-base.css:275)의 `248px`은 선언될 뿐 적용되지 않는다 — [`02-calendar.css:2912`](src/styles/02-calendar.css:2912)가 `.app-shell`을 나중에 다시 열어 `grid-template-columns: 200px`으로 덮는다. 브라우저에서 잰 실제 값은 **200px**이다.

읽은 것이 계산된 값이 아니라 선언이었던 탓이고, 이 리포에서 특히 위험한 실수다. 스타일시트가 19개고 뒤쪽 파일이 앞쪽을 다시 여는 것이 예외가 아니라 관행이다. **폭에 관한 판단은 `getComputedStyle`로 확인한다.**

따라서 P0-3의 폭 통일은 "이미 맞는 값을 확인하는 일"이 아니라 **200 → 248, 240 → 248 두 번의 실제 변경**이다.

### R.5.4 collapse는 있고 resize는 없다

- `sidebarCollapsed` ([`App.tsx:177`](src/App.tsx:177)) — 레거시 셸 전용. `.app-shell.sidebar-collapsed` 클래스로 라벨을 숨긴다.
- `sidebarOpen` ([`TasksModule.tsx`](src/components/tasks/TasksModule.tsx)) — Tasks 셸 전용, **overlay 열림 여부**이지 collapse가 아니다.
- **설계서 §3.28의 "width와 collapse는 독립"은 아직 표현할 상태 자체가 없다.** collapse는 라벨 숨김이지 폭 0이 아니고, "마지막 expanded width"라는 개념이 없다.

### R.5.5 브레이크포인트 — 리포가 이긴다

| | 설계서 (A.2, §3.33) | 리포 ([`responsive.ts:19`](src/domain/tasks/responsive.ts:19)) |
|---|---|---|
| 경계 | `>=1024 persistent / <1024 overlay` | mobile 768 / desktop 1024 / wideDesktop 1280, 4모드 |
| 사이드바 | 2분기 | `sidebarPresentationFor()` → mobile·tablet = overlay, 그 외 persistent |

**1024 경계는 이미 일치한다.** 리포는 거기에 더해 Task Detail 표현(v16 §15.17)까지 같은 축으로 결정하므로 정보량이 더 많다. 설계서의 2분기 모델로 후퇴하지 않는다.

### R.5.6 `main { zoom: 0.9 }` — Rail 계산의 함정

[`01-base.css:283`](src/styles/01-base.css:283)이 `.app-shell > main`에 `zoom: 0.9`를 걸고 있다. 전체 밀도 조절용이고 `min-height: calc(100vh / 0.9)`가 그 값에 묶여 있다.

Rail과 Context Sidebar는 **zoom 바깥**에 있어야 한다. 안에 두면 56px이 화면에서 50.4px로 그려져 §2.3.3의 `GLOBAL_RAIL_WIDTH = 56` 불변식이 첫 줄부터 깨진다. 폭 관련 값은 `09-calendar-redesign.css`(최종 오버라이드 층)에서 한 번 더 확인한다.

### R.5.7 Search / Account

- Search: `CommandPalette` ([`TasksModule.tsx:659`](src/components/tasks/TasksModule.tsx:659))가 이미 Task/List/Project를 검색한다. 다만 **Tasks 모듈 안에서만 열린다** — 캘린더·집중·설정에는 진입점이 없다.
- Account: `Sidebar.tsx`가 `userEmail`을 텍스트로 보여준다. 설계서 §2.9의 avatar + popover는 신규.

---

## R.6 확정 결정

구현 PR에서 `D-01`처럼 인용한다.

**D-01 — Rail 항목은 설계서 §1.5를 그대로 쓴다.**
`App mark / Account / Tasks / Calendar / Focus / (spacer) / Search / Settings`. 항목을 늘리지 않는다.

**D-02 — Context Sidebar의 내용은 현행 `TasksSidebar`다.** (R.3)

**D-03 — 라우트는 v16 Scope 스킴을 유지한다.** Appendix A.5는 채택하지 않는다.

| Rail active | 라우트 | Context Sidebar mode |
|---|---|---|
| Tasks | `/today` `/upcoming` `/inbox` `/list/:id` `/folder/:id` `/tag/:id` `/filter/:id` `/completed` `/trash` `/archive` `/search` | `tasks` |
| Tasks | `/s/:sp` `/s/:sp/p/:pj` 계열 (SpaceHub · 트리 selection) | **`space`** (D-14) |
| Tasks | `/board` **(신설)** | `tasks` `추정` — Q-06 |
| Calendar | `/calendar` **(신설)** | `none` |
| Focus | `/focus` **(신설)** | `none` |
| Settings | `/settings` **(신설)** | `none` |

Space 계열에 Rail 항목을 새로 주지 않는다 — §1.5가 Space를 Rail 금지 목록에 올려 두었고, SpaceHub는 Tasks 안에서 도달하는 곳이다. 바뀌는 것은 Context Sidebar mode뿐이다.

**D-04 — 라우트 없는 페이지에 라우트를 준다.** `calendar` `focus` `settings` `board` `archive`. `activePage` state는 URL의 파생값이 되고 `navigateSection()`은 `navigate()`를 호출한다. 이것이 P0-1이며 Rail보다 먼저다. (R.5.2)

다섯 개 전부에 라우트를 준다. D-13이 `board`의 **진입점**을 미결로 남기지만 화면은 남으므로 주소는 필요하고, `archive`는 Q-07의 답이 무엇이든 주소가 필요하다. 즉 **P0-1은 남은 미결에 막히지 않는다.**

구현하며 D-04가 정하지 않고 남겼던 주소 둘을 채웠다 ([`app/pageRoute.ts`](src/app/pageRoute.ts)).

- `today` → **`/app`**. `/today`는 Tasks Module이 이미 자기 Today를 걸어 둔 주소다. 둘 중 무엇이 살아남는지는 P0-2의 질문이고, P0-1은 주소를 두고 다투지 않게만 하면 된다.
- `projects` → **`/spaces`**. Space를 닫는 동작(`clearSelection`)이 예전에는 `/app`으로 갔는데, 주소가 곧 페이지가 된 지금 `/app`은 Today를 뜻한다. Space를 닫는 것은 Today를 요청하는 것이 아니다.

**D-05 — 폭.** Rail 56 고정, Sidebar 248/216/360, 두 셸의 `--tm-sidebar-w`와 `.app-shell` 열을 하나의 토큰으로 통일.

**D-06 — 상태 소유권** (설계서 §2.46/§3.66을 이 리포 이름으로):

```text
URL                      module / scope / view
AppShell (App.tsx)       globalOverlay(search|account|null), lastTasksLocation,
                         contextSidebarWidth, contextSidebarCollapsed
TasksSidebar             펼침 상태 (SidebarFolder)
CommandPalette           query, selected result
```

Rail 컴포넌트는 위 어느 것도 로컬 state로 갖지 않는다.

**D-07 — persistence 키는 개명하지 않는다.** `focusflow-sidebar-collapsed`를 그대로 쓰고 폭만 `focusflow-sidebar-width`를 추가한다. 설계서 §3.67은 "기존 preference abstraction이 있으면 그것을 쓰라"고 이미 허용한다. 저장 타이밍은 §3.68을 따른다 — 폭은 pointerup, collapse는 즉시.

**D-08 — Search는 전역으로 올린다.** `paletteOpen`을 `TasksModule`에서 AppShell로 이동. `/` 단축키와 Rail 아이콘이 같은 오버레이를 연다. 설계서 §2.14는 **라우팅을 금지**하는데 리포에는 `/search` 라우트가 이미 있다 → Q-03.

**D-09 — Overview 뷰를 Project에 도입하지 않는다.** 설계서 §1.12는 `Overview/List/Board/Gantt/Calendar`를 요구하지만, 이 리포에서 "개요"는 SpaceHub 탭(`spaceHub.tab.overview`)이고 Scope의 뷰는 `scopeRegistry.allowedViews`가 정한다. 사이드바 내용을 v16으로 유지하면서 뷰 목록만 설계서로 뒤집으면 둘이 어긋난다.

**D-10 — `zoom`은 Rail/Sidebar에 적용되지 않는다.** (R.5.6)

**D-11 — 브레이크포인트는 [`responsive.ts`](src/domain/tasks/responsive.ts)가 단일 출처다.** 설계서 §12의 2분기 표는 이 함수를 통해 읽는다.

**D-12 — feature flag를 쓰지 않는다.** 설계서 §12.133은 `newNavigationShell` 플래그를 권하지만, 같은 문서 §12.132가 "두 navigation architecture를 장기 병행하지 않는다"고 못박는다. 이 리포는 이미 셸이 둘이라(R.5.1) 플래그를 더하면 넷이 된다. 통합을 되돌릴 수 없게 만드는 것이 목적이다.

**D-13 — 세 페이지를 Rail 밖에서 흡수한다.** (Q-01 해소, 2026-08-19)

- **보관함** → Tasks Sidebar 최하단 시스템 섹션(`완료`·`휴지통`) 옆으로 이동. Rail 항목이 아니다. 승격 형태는 Q-07.
- **공간(SpaceHub)** → D-14가 받는다.
- **보드** → **"전역 보드 페이지 제거"는 철회한다.**

철회 근거를 남긴다. 이 판단은 코드를 열기 전 "보드는 이미 Scope의 뷰로 있으니 중복"이라는 전제 위에 있었고, **그 전제가 틀렸다.**

| | [`BoardPage.tsx`](src/components/BoardPage.tsx) (전역) | [`TaskBoard.tsx`](src/components/tasks/TaskBoard.tsx) (Scope 뷰) |
|---|---|---|
| 범위 | 전 Space 가로지르기 (`ALL_PROJECTS` 포함) | 한 Scope 안 |
| 컬럼 | Space가 소유하고 하위로 상속되는 status (`statusesWithCustom`) | `domain/tasks/board.ts`가 정하는 컬럼 |
| 축 | `GroupAxis` 선택기 — Status ↔ **Quadrant(아이젠하워)** | 축 개념 없음 |

즉 둘은 같은 것의 두 벌이 아니다. 전역 보드를 지우면 **사분면 축이 앱에서 통째로 사라진다.** [`Sidebar.tsx:239`](src/components/Sidebar.tsx:239) 주석이 이미 그 이유로 이 항목을 남겨 두었다 — 타임라인과 Horizons는 스코프 안에서 도달 가능해져서 지웠지만 Board는 남겼다고 적혀 있다.

따라서 화면과 라우트는 유지하고, **진입점만** Q-06으로 넘긴다. "Rail에 두지 않는다"는 Q-01의 답은 그대로 지킨다.

**D-15 — `lastTasksLocation`은 세션 범위다.** (Q-04 해소, 2026-08-19)

[`app/railNav.ts`](src/app/railNav.ts) + `App.tsx`의 ref 하나. localStorage에 쓰지 않는다.

§2.20이 요구하는 것은 "캘린더 갔다 돌아오면 읽던 리스트로"이고 그건 세션 안의 이야기다. 콜드 스타트는 복귀가 아니라 **도착**이고, 도착지는 D-04가 정한 시작 페이지 설정이 정한다. 둘을 영속 저장으로 합치면 "기본 시작 페이지" 설정이 조용히 무력해진다.

fallback은 `TASKS_HOME = "/today"` — 레거시 `/app`의 Today가 아니라 **Tasks Module의 Today**다. D-02가 Context Sidebar 내용을 v16으로 정했으니, Rail의 Tasks가 여는 곳도 그쪽이어야 한다.

**D-16 — P0-2는 Rail과 레거시 사이드바의 중복을 남긴다.** (의도됨)

Rail에 캘린더·집중·설정이 생겼는데 레거시 사이드바에도 같은 항목이 그대로 있다. 설계서 §12.131의 마이그레이션 순서가 `3. Global Rail 추가` → `4. 기존 Sidebar content를 Context Sidebar로 이동`으로 두 단계를 나눠 놓았고, 중복은 그 사이의 상태다. P0-4에서 레거시 사이드바의 전역 항목을 걷어낼 때 사라진다. 이 중복을 P0-2에서 미리 지우면 아직 없는 Context Sidebar가 유일한 진입점이 되어 도달 불가 화면이 생긴다.

**D-17 — P0-3은 프레임의 *계약*을 통합하고, DOM은 옮기지 않는다.**

설계서 §3.4는 Rail / Context Sidebar / Main을 App Shell의 형제 영역으로 두라고 한다. P0-3은 그중 **계약**만 가져왔다 — 폭·collapse·resize·mode를 [`app/contextSidebar.ts`](src/app/contextSidebar.ts) + [`hooks/useContextSidebar.ts`](src/hooks/useContextSidebar.ts) 한 곳이 소유하고, 두 셸의 그리드는 프레임이 발행하는 `--context-sidebar-w` 하나를 읽는다. 사이드바 DOM은 아직 각자의 그리드 안에 있다.

DOM까지 끌어올리려면 `TasksSidebar`를 `TasksModule` 밖으로 빼야 하는데, 그러면 모듈의 내부 상태(`managing`, `creatingListIn`, `sidebarOpen`, `go`)를 함께 들어올리게 된다. 그건 사이드바 **내용**을 옮기는 P0-4의 일이고, 거기서 어차피 건드린다. 지금 하면 같은 코드를 두 번 옮긴다.

**D-18 — 레거시 collapse는 "68px 아이콘 레일"에서 "폭 0"으로 바뀐다.**

기존 `.sidebar-collapsed`는 사이드바를 68px 아이콘 열로 줄였다. §3.22/§3.30의 collapse는 **layout slot이 0**이다. 아이콘 수준의 탐색은 이제 Global Rail에 있으므로 축소판 사이드바는 같은 일을 두 번 하는 것이고, §3.31이 요구하는 "collapsed면 tab order와 접근성 트리에서 빠진다"도 68px 열로는 만족할 수 없다.

`display: none`으로 처리한다. React unmount가 아니라 CSS인 이유는 §3.31이 실제로 막으려는 것(보이지 않는데 포커스 가능한 트리)이 그것으로 해결되고, 사이드바 내부 상태는 보존되기 때문이다.

**D-14 — SpaceHub 진입 시 Context Sidebar를 SpaceTree로 전환한다.** (Q-02 해소, 2026-08-19)

`SpaceTree`를 없애는 것이 아니라 **기본 Tasks 탐색 모델에서만** 뺀다. 같은 사이드바 자리를 mode로 바꾼다.

```ts
type ContextSidebarMode = "tasks" | "space" | "none";
```

설계서 §3.3은 P0 mode를 `"tasks" | "none"` 둘로 제한하지만, 같은 절이 **"향후 새로운 mode를 추가할 수 있다. 단 같은 컴포넌트에 `if calendar... if focus...`를 쌓기보다 mode registry로 확장한다"**고 확장 지점을 미리 열어 두었다. 그 지점을 P0에서 바로 쓴다. `if`가 아니라 레지스트리여야 한다는 조건도 그대로 지킨다.

계약:

- mode는 라우트에서 derive한다 (§3.29 — `mode`는 상태가 아니라 파생값).
- **mode 전환은 Rail active를 바꾸지 않는다** (D-03). SpaceHub에서도 Rail은 Tasks다.
- **폭·collapse·resize는 mode와 무관하게 공유한다.** mode가 바뀌었다고 폭이 튀거나 collapse가 풀리면 §3.28을 어긴다.
- 전환 시 이전 mode의 content는 unmount하고(§3.31), 펼침 상태는 external store에 남긴다(D-06).
- `mode="space"`에서는 §1.24 INV-02가 원문 그대로 유효해진다 (R.3).

---

## R.7 미결 — 다음 결정이 필요한 것

| # | 질문 | 상태 |
|---|---|---|
| ~~Q-01~~ | `board` / `archive` / `projects`(SpaceHub)의 행선지 | **해소 → D-13** (2026-08-19). 단 보드 진입점이 Q-06으로 갈라져 나왔다 |
| ~~Q-02~~ | `SpaceTree`의 진입 경로 | **해소 → D-14** (2026-08-19) |
| **Q-03** | `/search` 라우트 vs 설계서 §2.14 "Search는 라우팅하지 않는다" | 리포에 Search Page가 이미 있고 `TasksModule`이 그 라우트를 claim한다 ([`App.tsx:1070`](src/App.tsx:1070)) |
| ~~Q-04~~ | Rail의 Tasks 재클릭 동작 | **해소 → D-15** (2026-08-19). 세션 범위, fallback은 `/today` |
| **Q-05** | Horizons / Goals / LearningPath | v16 Phase 0 감사 §B에서도 미결로 남았던 항목. 이번에도 Rail 밖이다 |
| **Q-06** | 전역 보드(사분면 축)의 진입점 | D-13이 화면과 라우트를 살렸다. Rail도 아니고 사이드바 기본 섹션도 아니면 **어디서 여는가.** 후보: 사이드바 하단 시스템 섹션 / Scope의 뷰로 사분면 축 이식 / SpaceHub 안 |
| **Q-07** | `보관함`을 10번째 Scope로 승격할 것인가 | `완료`·`휴지통` 옆에 나란히 두면 시각과 동작이 같아 보이는데, 진짜로 같게 하려면 [`scopeRegistry.ts`](src/domain/tasks/scopeRegistry.ts)를 건드려야 한다. 라우트만 가진 페이지로 두면 그 줄만 다르게 동작한다 |

**막힌 것과 안 막힌 것.** Q-06·Q-07은 **P0-1을 막지 않는다** — D-04가 다섯 페이지 전부에 라우트를 주기로 했고, 두 질문 모두 "그 주소를 어디서 여는가"이지 "주소가 있는가"가 아니다. 답이 필요한 시점은 P0-4(사이드바 내용)다. Q-03은 P0-9, Q-04는 P0-2, Q-05는 여전히 열려 있다.

---

## R.8 구현 순서 — 설계서 §12.129를 이 리포로 번역

| 설계서 | 이 리포에서 실제로 하는 일 | 선행 |
|---|---|---|
| ~~P0-1 Route registry~~ | **완료** (2026-08-19). [`app/pageRoute.ts`](src/app/pageRoute.ts) + `activePage`가 `pageForPath(currentPath)`가 됐다 | — |
| ~~P0-2 AppShell + Rail~~ | **완료** (2026-08-19). [`AppShell.tsx`](src/components/shell/AppShell.tsx)이 두 셸의 공통 프레임이 되고, [`GlobalRail.tsx`](src/components/shell/GlobalRail.tsx)이 그 첫 열. 안쪽 두 셸은 그대로 — 그건 P0-3 | P0-1, Q-04 |
| ~~P0-3 Context Sidebar frame~~ | **완료** (2026-08-19). 폭 200·240 → **248 하나**, resize 핸들(드래그·키보드·더블클릭), collapse 상태 모델(§3.28~3.30), mode registry `tasks\|space\|none`. DOM 통합은 D-17 | P0-2 |
| P0-4 Sidebar content | `TasksSidebar`를 새 프레임에 꽂는다(`mode="tasks"`) + 하단 시스템 섹션에 보관함 추가 | P0-3, Q-06, Q-07 |
| P0-5 Tree | **부활** (D-14). 새로 그리지 않고 기존 [`SpaceTree.tsx`](src/components/sidebar/SpaceTree.tsx)를 `mode="space"` 슬롯에 꽂는다 | P0-3 |
| P0-6 Main Header | `tm-header`를 새 셸 기준으로 정리. 뷰 전환은 현행 유지(D-09) | P0-2 |
| P0-7 Create/Menu | **완료** (Add List v0.13.0) | — |
| P0-8 Collapse/Resize | §10 상호작용 마무리 (키보드 resize, 더블클릭, 영속) | P0-3 |
| P0-9 Search | **D-08.** 팔레트를 전역으로 승격 | P0-2, Q-03 |
| P0-10 Visual tokens | §11 적용. `09-calendar-redesign.css` 오버라이드 층 정리 포함 | P0-6 |
| P0-11 A11y | §2.33 / §3.49~§3.52 ARIA | P0-10 |
| P0-12 E2E | §2.48 / §3.85 케이스를 `e2e/`에 | 전부 |

---

## R.9 이 감사가 답한 것

- 설계서와 v16의 충돌은 **v16 승**으로 해소했다 (R.3). 그로 인해 무효화된 설계서 조항 5개를 명시했다.
- 설계서가 예상하지 못한 이 리포의 사실 둘을 발견했다.
  1. **셸이 둘이다** (R.5.1) — P0-2의 실제 작업량은 Rail이 아니라 병합이다.
  2. **절반의 페이지에 라우트가 없다** (R.5.2) — P0-1은 선택이 아니라 전제다.
- 1024px 경계는 **이미 일치한다.** (폭 248px도 맞다고 적었다가 P0-2에서 정정했다 — R.5.3.)
- 착수 전 결정 둘(Q-01·Q-02)을 D-13·D-14로 닫았다. 그 과정에서 "전역 보드는 Scope 뷰와 중복"이라는 통념이 **틀렸음**을 확인했다 — 사분면 축은 거기에만 있다 (D-13).

다음 산출물은 **P0-1의 라우트 레지스트리**다. 남은 미결(Q-03~Q-07)은 P0-1을 막지 않는다.
