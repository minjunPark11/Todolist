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
| §1 | Navigation Architecture | **부분** | 3계층 분리(§1.2)·상태 모델(§1.23)·불변식(§1.24)은 채택. §1.4 Navigation Tree의 **내용**은 R.3에서, §1.5 Rail 항목표는 D-01/**D-19**에서 다시 쓴다 (§1.5의 Board 금지는 Scope Board 한정, Global Matrix는 예외) |
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

**D-01 — Rail 항목은 설계서 §1.5를 그대로 쓴다.** *(→ D-19가 Matrix 하나를 더한다)*
`App mark / Account / Tasks / Calendar / Focus / (spacer) / Search / Settings`. 항목을 함부로 늘리지 않는다 — 예외는 D-19에 근거를 적었다.

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

- **보관함** → Tasks Sidebar 최하단 시스템 섹션(`완료`·`휴지통`) 옆으로 이동. Rail 항목이 아니다. **최종 형태는 D-20이 쪼갠다.**
- **공간(SpaceHub)** → D-14가 받는다.
- **보드** → **"전역 보드 페이지 제거"는 철회한다.** 이 철회가 세 화면 중 유일하게 "흡수"로 끝나지 않았고, **D-19가 Matrix로 재분류해 매듭짓는다.**

철회 근거를 남긴다. 이 판단은 코드를 열기 전 "보드는 이미 Scope의 뷰로 있으니 중복"이라는 전제 위에 있었고, **그 전제가 틀렸다.**

| | [`BoardPage.tsx`](src/components/BoardPage.tsx) (전역) | [`TaskBoard.tsx`](src/components/tasks/TaskBoard.tsx) (Scope 뷰) |
|---|---|---|
| 범위 | 전 Space 가로지르기 (`ALL_PROJECTS` 포함) | 한 Scope 안 |
| 컬럼 | Space가 소유하고 하위로 상속되는 status (`statusesWithCustom`) | `domain/tasks/board.ts`가 정하는 컬럼 |
| 축 | `GroupAxis` 선택기 — Status ↔ **Quadrant(아이젠하워)** | 축 개념 없음 |

즉 둘은 같은 것의 두 벌이 아니다. 전역 보드를 지우면 **사분면 축이 앱에서 통째로 사라진다.** [`Sidebar.tsx:239`](src/components/Sidebar.tsx:239) 주석이 이미 그 이유로 이 항목을 남겨 두었다 — 타임라인과 Horizons는 스코프 안에서 도달 가능해져서 지웠지만 Board는 남겼다고 적혀 있다.

따라서 화면과 라우트는 유지하고, **진입점만** Q-06으로 넘긴다. "Rail에 두지 않는다"는 Q-01의 답은 그대로 지킨다.

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

**D-19 — 전역 Board를 `Matrix`로 재분류하고, Rail에 올린다.** (Q-06 해소, 2026-08-19)

**Matrix ≠ Board.** 지금까지 한 이름이 두 물건을 가리키고 있었고, 그게 Q-06이 답을 못 찾던 이유였다.

| | **Matrix** (전역) | **Board View** (Scope) |
|---|---|---|
| 파일 | [`BoardPage.tsx`](src/components/BoardPage.tsx) | [`TaskBoard.tsx`](src/components/tasks/TaskBoard.tsx) |
| 범위 | 전 Space 가로지르기 (`All spaces`) | 한 Scope 안 |
| 컬럼 | Space가 소유·상속하는 status | `domain/tasks/board.ts` |
| 축 | Status ↔ **Quadrant** | 축 개념 없음 |
| 분류 | **Global Feature** | Scope의 View |

유지하는 것: 전 Space 가로지르기, Status/Quadrant 축, `/board` 라우트.
바뀌는 것: **이름과 navigation semantics.** Matrix는 Scope의 View가 아니라 Tasks·Calendar·Focus와 같은 층위의 독립 기능이다. TickTick도 Eisenhower Matrix를 좌측 레일의 독립 진입점으로 둔다.

**§1.5 개정.** 설계서 §1.5는 `Board`를 Rail 금지 목록에 올려 두었다. 그 금지는 **Scope Board에만** 적용한다. Global Matrix는 명시적 예외다 — 금지의 취지가 "Scope의 View 하나가 Rail 항목으로 승격되면 Rail이 화면 목록이 된다"인데, Matrix는 애초에 어느 Scope의 View도 아니다.

**D-01 개정.** Rail 항목이 5 → 6이 된다.

```text
App mark / Account / Tasks / Matrix / Calendar / Focus / (spacer) / Search / Settings
```

구현 시 딸려오는 것 (P0-4):
- `railNav.ts`의 매핑이 4갈래 → 5갈래. `/board`가 `tasks`가 아니라 `matrix`를 켠다
- `PageId`의 `board`와 그 라벨이 Matrix로. **라우트는 `/board`를 유지한다**(위 결정) — 이름과 주소가 어긋나는 건 알고 두는 것이고, 개명하려면 리다이렉트를 붙이는 별도 작업이다
- Matrix의 Context Sidebar mode는 `none` `추정` — 전역 기능이고 Scope가 아니다. P0-4에서 확정

**D-20 — Task의 Archive를 폐기한다. 프로젝트 Archive만 남는다.** (개정 2, 2026-08-19)

> **개정 이력.** ① Q-07 답: "쪼갠다 — 작업은 Scope, 프로젝트는 SpaceHub". ② 이 개정: **작업 쪽은 만들 것이 아니라 지울 것**이다.

Task의 `archived`가 하는 일은 **모든 화면에서 숨기기**뿐이다. `TaskStatus`의 값 하나([`types.ts:21`](src/types.ts:21))와 `archivedAt`이 있지만, 그것을 읽는 15곳은 전부 `status !== "archived"`라는 제외 필터다. 완료도 삭제도 아닌 세 번째 축을 사용자에게 이해시킬 값어치가 없다.

따라서 사이드바 하단 시스템 섹션은 **완료 · 안 함 · 휴지통** 셋이 된다. TickTick이 실제로 그렇고, `보관함`은 Task 쪽에서 사라진다.

**사라지지 않는 것 — List/Project의 Archive는 별개다.** `List.archivedAt`은 Add List 설계 §13.21/§13.22가 쓰고(리스트를 치우면 트리에서 빠지고 Manage에서 복원), `Project.status === "archived"`도 살아 있다. 보관된 **프로젝트**는 원래 계획대로 SpaceHub로 간다. 폐기 대상은 **Task의 archive뿐**이다.

**D-21 — 어느 사이드바가 그려지는지를 `mode`가 정하게 해야 한다.** (P0-4에서 드러남, 2026-08-19)

P0-3이 `mode`를 만들었지만 **그 mode는 아직 아무것도 고르지 않는다.** 폭과 표시 여부만 정할 뿐, 실제로 어떤 컴포넌트가 그려지는지는 여전히 [`App.tsx`](src/App.tsx)의 `parseTaskScope` 분기가 정한다. 둘이 어긋난다.

| 주소 | `mode` | 실제로 그려지는 것 |
|---|---|---|
| `/today` `/list/:id` | `tasks` | `TasksSidebar` ✅ |
| `/app` `/archive` | `tasks` | **`Sidebar.tsx`** ❌ |
| `/spaces` `/s/:sp` | `space` | `Sidebar.tsx` (트리 포함 — 우연히 맞다) |

이게 P0-4에서 두 가지를 막았다.

1. **TasksSidebar 하단에 보관함 행을 넣을 수 없다.** `/archive`는 Task Scope가 아니라 레거시 셸이 답하므로, 그 행을 누르는 순간 셸이 갈리며 사이드바가 통째로 교체된다. 같은 자리에 있어야 할 행이 자기를 지우는 버튼이 된다.
2. **D-14의 `mode="space"`가 아직 진짜가 아니다.** 지금 맞아 보이는 건 레거시 사이드바가 트리를 이미 품고 있어서지, mode가 골라서가 아니다.

해소는 `App.tsx`가 mode로 사이드바를 고르는 것이다. 그러려면 `TasksSidebar`를 `TasksModule` 밖으로 꺼내야 하고, 딸려 나오는 것이 있다 — `managing`, `creatingListIn`, `sidebarOpen`, `go`, 그리고 그 상태가 여는 `ListManager`·`CreateListModal`.

**D-17이 "P0-4가 어차피 내용을 옮기니 그때 하자"고 미룬 바로 그 작업이다.** 크기가 P0-4 한 단계에 들어가지 않으므로 **P0-4a**로 세운다 (R.8). D-20의 Archive 승격은 그 뒤에 와야 한다 — 보관된 작업이 Scope가 되려면 Tasks Module 안에서 그려져야 하기 때문이다.

**D-22 — Tasks Sidebar에 `공간` 행을 둔다.** (P0-4a에서 강제됨, 2026-08-19)

D-21을 고치자 SpaceHub가 **도달 불가**가 됐다. 사이드바가 `mode`를 따르게 되는 순간, 트리는 이미 space mode일 때만 보인다. Rail에는 §1.5가 Space를 금지한다. 즉 Tasks 화면에서 SpaceHub로 들어갈 문이 사라진다.

그래서 Tasks Sidebar에 `공간` 행 하나를 둔다. 트리를 가져오는 것이 아니라 **문만** 두는 것이다 — 누르면 `/spaces`로 가고, 거기서 mode가 `space`로 바뀌며 같은 자리를 트리가 차지한다. D-02(사이드바 내용은 v16)와 D-14(SpaceHub에서 트리로 전환)를 둘 다 지키는 최소 장치다.

`보관함` 행도 같은 성격이다. 둘 다 Scope가 아니므로 `row()`가 아니라 `pageRow()`로 그리고, **카운트를 붙이지 않는다** — 이 파일의 머리 주석이 "모든 카운트는 `queryScopeCount`에서 오고 화면이 카운트 공식을 발명하지 않는다"(§12.14)고 못박아 두었고, 물어볼 Scope가 없기 때문이다.

> **후속 (D-20 개정 2).** `보관함` 행은 숫자를 얻지 못하고 **없어진다.** Task Archive 자체가 폐기되고 그 자리에 `안 함`(Won't Do) Scope가 들어간다 — 그건 진짜 Scope이므로 카운트를 갖는다. `공간` 행은 문이므로 계속 카운트가 없다.

**D-23 — Won't Do는 `TaskStatus` 값이 아니라 `wontDoAt` 터미널 마커로 만든다.**

`TaskStatus`에 값을 하나 더 얹기 전에 세 터미널 상태의 현재 모양을 나란히 놓으면 답이 나온다.

| | `status` 값 | timestamp | 실제 판정 |
|---|---|---|---|
| Completed | `"done"` | `completedAt` | `isCompleted` = `status === "done"` — **timestamp를 안 읽는다** |
| Trash | 없음 | `deletedAt` | `Boolean(task.deletedAt)` |
| Archived | `"archived"` | `archivedAt` | `status === "archived"` — **timestamp를 안 읽는다** |

같은 개념이 세 가지 모양으로 있고, **둘은 진실을 두 곳에 두었다.** `completedAt`은 그 대가를 이미 치르고 있다 — [`scopeQuery.ts:67`](src/domain/tasks/scopeQuery.ts:67)의 주석이 "감사 A절이 두 곳에 저장된 것을 발견했고 `status`가 이긴다"고 적고 있으며, 둘을 합치는 일은 v16 감사 C-2의 미결로 남아 있다. **`wontDo`를 status 값으로 추가하면 그 버그를 의도적으로 한 번 더 만드는 것이다.**

그래서 **`deletedAt`의 모양을 본뜬다.**

```ts
/** 안 하기로 한 시각. 비어 있으면 안 한다고 하지 않은 것이다. */
wontDoAt?: string;
```

`TaskStatus`를 넓히지 않는 것 자체가 이득이다 — 그 유니온은 이미 마이그레이션으로 걷어내는 중인 레거시 값을 넷(`doing`/`waiting`/`in_progress`/`blocked`) 이고 있다.

이 모델이 공짜로 주는 것 셋:

1. **`status`를 덮어쓰지 않는다.** `completeTask`는 `status`를 `"done"`으로 밀어버리기 때문에 `reopenTask`가 `previousStatus`를 뒤져 원래 값을 복원해야 한다([`mutations.ts:61`](src/domain/tasks/mutations.ts:61)). Won't Do 취소는 필드를 비우면 끝이고, 되돌릴 `status`가 애초에 없다.
2. **반복이 저절로 맞는다.** occurrence에 timestamp가 붙을 뿐 `repeat`은 건드리지 않는다 — **P0 확정: 반복 Task의 Won't Do는 현재 occurrence에만 적용하고 recurrence rule은 유지한다.**
3. **하위 Task에 전파되지 않는다.** 부모의 필드는 자식의 필드가 아니다. **P0 확정: 자동 전파하지 않는다.**

`undo`는 `deletedAt`이 이미 확립한 규약을 따른다 — 없음과 `""`는 다른 값이고, undo는 있던 값을 그대로 되돌린다([`mutations.ts:31`](src/domain/tasks/mutations.ts:31)).

**마이그레이션:** 기존 `status === "archived"` / `archivedAt`을 가진 Task는 `wontDoAt`으로 옮긴다. 의미가 맞는다 — "보관했다 = 안 할 건데 지우긴 아깝다". Completed로 보내면 완료 통계가 오염된다. Won't Do는 `completedAt`을 쓰지 않으므로 Completed Scope(`completedAt != null`)에 새지 않는다.

**D-24 — 15곳을 개별 치환하지 않는다. canonical predicate로 통합한다.**

**그 predicate는 이미 있다.** [`scopeQuery.ts:79`](src/domain/tasks/scopeQuery.ts:79)의 `isTaskActive(task, lists)`이고, 주석이 존재 이유까지 적어 두었다 — *"보관된 task가 Today에 뜨는 것은 아홉 곳의 버그가 아니라 이 한 곳의 결정이어야 한다."*

문제는 **아무도 안 쓴다는 것**이다. 리포 전체에서 호출부가 같은 파일 안에 하나뿐이다. Tasks Module의 쿼리 층은 이걸 통과하지만, 밖의 15곳(Focus, Calendar, Matrix, Space 뷰 셋, TaskDetail, 카테고리 설정)은 각자 `status !== "archived"`를 손으로 쓴다.

그러니 할 일은 predicate를 **발명**하는 것이 아니라 **채택**하는 것이다. 다만 15곳이 묻는 질문이 하나가 아니라 둘이라는 점을 먼저 갈라야 한다.

| 질문 | 뜻 | 함수 |
|---|---|---|
| 살아 있는가 | 휴지통도 Won't Do도 아니고, 소유 List도 살아 있다 | `isTaskActive` |
| 아직 할 일인가 | 살아 있고 + 완료도 아니다 | `isActive` (현재 private) |

**구현하며 밝혀진 것 (P0-4b-2, 2026-08-19).**

경쟁하는 술어가 하나가 아니라 **셋**이었고, 그중 둘이 "active"라는 같은 이름을 쓰면서 다른 답을 냈다.

| 모듈 | 이름 | 실제 뜻 |
|---|---|---|
| `scopeQuery` | `isTaskActive` | 살아 있고 **+ 소유 List도 살아 있다** |
| `utils/planner` | `isActiveTask` | 살아 있다 |
| `domain/tasks/selectors` | `selectActiveTasks` | 살아 있고 **+ 완료가 아니다** |

즉 화면이 이름만 보고 고르면 어느 모듈에서 import했느냐에 따라 다른 답을 받았다. 그래서 [`domain/tasks/taskState.ts`](src/domain/tasks/taskState.ts)를 만들어 **축을 둘로 갈랐다.**

1. **Task 자신의 상태** — `isTrashed` / `isWontDo` / `isCompleted`, 그리고 그 위의 `isTaskAlive`(존재하는가) / `isTaskOpen`(아직 할 일인가). Task 말고는 아무것도 필요 없다.
2. **컨테이너의 상태** — `scopeQuery.isTaskActive`가 1번을 합성하고 소유 List 검사를 더한다. Lists가 필요하므로 거기 남는다.

**축을 가른 이유는 타협이 아니라 사실이다.** 채택 대상 17곳 중 `lists`가 스코프에 있는 곳이 **하나도 없었다** — `reminderQueue`와 `calendarShare`는 React 밖 모듈이라 컬렉션을 넘길 경로 자체가 없다. 술어를 구조적 타입(`TaskStateFields`)으로 만든 것도 같은 이유다: `ReminderTaskSource`처럼 `Task`보다 좁은 모양도 같은 질문을 물을 수 있어야, 규칙의 두 번째 사본이 안 생긴다.

**앞서 예고한 행동 변화는 이 단계가 아니라 P0-4b-5에서 일어났다.** "보관된 List의 Task가 Focus·Calendar에서도 사라진다"고 적었는데, 그러려면 `lists`를 8개 모듈에 배선해야 하고 그건 술어 통합보다 큰 작업이라 분리했다. 이 단계가 준 것은 "Task 자신의 상태에 대한 답이 앱 전체에서 하나"다.

**P0-4b-5의 해법 (2026-08-19).** 결국 `lists`를 아무 데도 배선하지 않았다. 14개 모듈에 인자를 하나씩 늘리는 대신, `App.tsx`가 **한 번** 거른다.

```ts
const visibleTasks = planner.tasks.filter((task) => isTaskActive(task, planner.lists));
```

그리고 **두 컬렉션의 역할을 갈랐다.**

| | 무엇 | 어디에 |
|---|---|---|
| `visibleTasks` | 사용자가 볼 수 있는 것 | 그리거나 제안하는 화면 — Today·Calendar·Focus·Matrix·SpaceHub·사이드바 카운트·검색·리마인더·캘린더 공유·AI 컨텍스트 |
| `planner.tasks` | 전부 | **조회** — 실행 중인 집중 세션의 Task, 부모 Task, 내보내기. 숨겨진 Task가 존재를 그만둔 것은 아니다 |

이 구분이 이 단계의 진짜 산출물이다. 인자를 배선했다면 각 모듈이 "어느 질문을 하는 중인지" 매번 다시 판단해야 했다.

## R.7 미결 — 다음 결정이 필요한 것

| # | 질문 | 상태 |
|---|---|---|
| ~~Q-01~~ | `board` / `archive` / `projects`(SpaceHub)의 행선지 | **해소 → D-13** (2026-08-19). 단 보드 진입점이 Q-06으로 갈라져 나왔다 |
| ~~Q-02~~ | `SpaceTree`의 진입 경로 | **해소 → D-14** (2026-08-19) |
| **Q-03** | `/search` 라우트 vs 설계서 §2.14 "Search는 라우팅하지 않는다" | 리포에 Search Page가 이미 있고 `TasksModule`이 그 라우트를 claim한다 ([`App.tsx:1070`](src/App.tsx:1070)) |
| ~~Q-04~~ | Rail의 Tasks 재클릭 동작 | **해소 → D-15** (2026-08-19). 세션 범위, fallback은 `/today` |
| **Q-05** | Horizons / Goals / LearningPath | v16 Phase 0 감사 §B에서도 미결로 남았던 항목. 이번에도 Rail 밖이다 |
| ~~Q-06~~ | 전역 보드(사분면 축)의 진입점 | **해소 → D-19** (2026-08-19). Matrix로 재분류하고 Rail에 올린다. §1.5에 명시적 예외 |
| ~~Q-07~~ | `보관함`을 10번째 Scope로 승격할 것인가 | **해소 → D-20** (2026-08-19), 그 뒤 **개정 2**로 뒤집힘: 승격이 아니라 **폐기**다. Task Archive는 Won't Do(D-23)로 대체되고, 프로젝트 Archive만 SpaceHub로 간다 |

**남은 것은 Q-03(P0-9)과 Q-05뿐이다.** 둘 다 P0-4를 막지 않는다.

---

## R.8 구현 순서 — 설계서 §12.129를 이 리포로 번역

| 설계서 | 이 리포에서 실제로 하는 일 | 선행 |
|---|---|---|
| ~~P0-1 Route registry~~ | **완료** (2026-08-19). [`app/pageRoute.ts`](src/app/pageRoute.ts) + `activePage`가 `pageForPath(currentPath)`가 됐다 | — |
| ~~P0-2 AppShell + Rail~~ | **완료** (2026-08-19). [`AppShell.tsx`](src/components/shell/AppShell.tsx)이 두 셸의 공통 프레임이 되고, [`GlobalRail.tsx`](src/components/shell/GlobalRail.tsx)이 그 첫 열. 안쪽 두 셸은 그대로 — 그건 P0-3 | P0-1, Q-04 |
| ~~P0-3 Context Sidebar frame~~ | **완료** (2026-08-19). 폭 200·240 → **248 하나**, resize 핸들(드래그·키보드·더블클릭), collapse 상태 모델(§3.28~3.30), mode registry `tasks\|space\|none`. DOM 통합은 D-17 | P0-2 |
| ~~P0-4 Rail + 중복 제거~~ | **완료** (2026-08-19). Rail에 Matrix 추가(D-19), 레거시 사이드바에서 전역 항목 제거(D-16) — 남은 것은 `오늘`·`보관함`·트리 | P0-3 |
| ~~P0-4a 사이드바 소유권~~ | **완료** (2026-08-19). [`TasksSidebarSlot`](src/components/shell/TasksSidebarSlot.tsx)이 사이드바+두 다이얼로그를 함께 들고, 레거시 셸이 `mode`로 고른다. DOM 통합은 여전히 D-17 | P0-4 |
| ~~P0-4b-1 Won't Do~~ | **완료** (2026-08-19). `wontDoAt` + `wontDo` Scope(`/wont-do`) + Drawer 액션·undo. `isTaskOpen`도 export됨 | P0-4a |
| ~~P0-4b-2 상태 술어 통합~~ | **완료** (2026-08-19). [`taskState.ts`](src/domain/tasks/taskState.ts)가 단일 출처, 17곳 채택, 경쟁 술어 셋 흡수 | P0-4b-1 |
| ~~P0-4b-3 Task Archive 폐기~~ | **완료** (2026-08-19). 로드 경로 마이그레이션(`archived` → `wontDoAt`, `previousStatus`로 워크플로 상태 복원), 사이드바 하단 = 완료·안 함·휴지통, ArchivePage는 프로젝트 전용 | P0-4b-2 |
| ~~P0-4b-4 프로젝트 Archive~~ | **완료** (2026-08-19). Space의 `보관함` 탭(`/s/:id?view=archive`)으로 이동. `/archive` 라우트·ArchivePage·`PageId "archive"` 폐기, 옛 링크는 `/spaces`로 리다이렉트 | P0-4b-3 |
| ~~P0-4b-5 컨테이너 축~~ | **완료** (2026-08-19). 14곳에 `lists`를 배선하는 대신 `App.tsx`가 `visibleTasks`를 한 번 파생해 화면에 넘긴다. `planner.tasks`는 조회용으로 남는다 | P0-4b-2 |
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
