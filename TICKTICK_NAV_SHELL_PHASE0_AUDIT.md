# Nav Shell 재설계 — Phase 0 현행 감사 및 해석 (§R)

- 대상 설계서: [`TICKTICK_NAV_SHELL_REDESIGN_SPEC.md`](TICKTICK_NAV_SHELL_REDESIGN_SPEC.md) (26,097줄, §0~§12 + Appendix A)
- 작성일: 2026-08-19
- 기준 코드: v0.13.0 (`9ec9d94`)
- 선행 문서: [v16 계획서](TICKTICK_STYLE_REDESIGN_IA_SIDEBAR_MAIN_DRAWER_URL_DATA_VIEWS_QUICKADD_INTERACTIONS_SEARCH_VISUAL_v16_E2E_IMPLEMENTATION_PLAN.md), [`TICKTICK_MIGRATION_PHASE0_AUDIT.md`](TICKTICK_MIGRATION_PHASE0_AUDIT.md)

---

## R.0 이어받는 사람에게 — 2026-08-19 기준

- **브랜치:** `feat/nav-shell-p0` (main 기준 커밋 13개). 트리 깨끗.
- **읽는 순서:** R.1.1 채택 결정 → R.6 확정 결정(D-01~D-30) → R.8 구현 순서. 설계서 본문은 필요할 때만 펼친다.
- **원칙 하나만 기억하면 된다:** 설계서는 이 저장소를 보지 않고 쓰였다. 본문과 이 문서가 다르면 **이 문서가 이긴다.** 본문은 절대 고치지 않는다.

### 지금 어디까지 왔나

```
P0-1  ✅ 라우트 레지스트리        P0-4b-3 ✅ Task Archive 폐기
P0-2  ✅ AppShell + Global Rail   P0-4b-4 ✅ 프로젝트 Archive → SpaceHub
P0-3  ✅ Context Sidebar 프레임   P0-4b-5 ✅ 컨테이너 축(visibleTasks)
P0-4  ✅ Matrix + 중복 제거       P0-5    ✅ Space 사이드바 = 트리
P0-4a ✅ 사이드바 소유권          P0-6    ✅ Main 헤더
P0-4b-1 ✅ Won't Do              ─────────────────────────────
P0-4b-2 ✅ 상태 술어 통합         P0-9    ✅ Command Menu 전역화
                                 P0-10   ✅ Visual tokens
                                 P0-11   ✅ A11y
                                 P0-12   ✅ E2E
                                 ─────────────────────────────
                                 P0 전부 완료
```

### 다음 작업과 그 전에 필요한 것

**P0는 끝났고 v0.15.0으로 배포됐다.** 다음 작업은 **시각 언어 통일**이고, 계획은 별도 문서에 있다 — [`TICKTICK_VISUAL_LANGUAGE_PLAN.md`](TICKTICK_VISUAL_LANGUAGE_PLAN.md). P0 이후 실행 중인 앱을 §11.2로 채점한 결과(4승 3패 2유보)와 V-1~V-6 단계가 거기 있다. **V-1(표면 밝기 순서)이 효과가 가장 크고 막는 결정이 없다.**

그 문서는 D-26의 오판 하나도 정정한다 — 표면 위계를 카드가 있는 화면에서만 재고 판정했다.

그 밖에 알아야 할 것 셋:

1. **설계서 §2.14는 결국 옳았다** (D-25 → **D-29**). Search가 페이지 이동이 되자 캘린더에서 돋보기 한 번에 넷이 바뀌었고, 되돌렸다. 지금은 §2.14대로 오버레이가 열리고, `/search`는 "전체 결과" 페이지로 남는다. **이 저장소가 설계서를 이긴 게 아니라 설계서가 맞았던 유일한 사례**이므로, 다음에 §2를 다시 읽을 때 이 줄을 먼저 볼 것.
2. **남은 미결은 Q-05 하나** — Horizons / Goals / LearningPath가 Rail 밖에 있다. v16 Phase 0 감사에서도 미결이었다. P0를 막지 않았고 P1의 질문이다.
3. **알려진 공백 하나** — Tasks 사이드바에 collapse 버튼이 없다(D-27). Ctrl/Cmd+`\`와 expand 버튼으로만 접근된다.

**검사 지형도.** 무엇이 어디서 잡히는지 — 새 작업을 어느 층에 둘지 정할 때 이 표를 볼 것.

| 층 | 무엇을 잡나 | 어디 |
|---|---|---|
| 도메인 단위 | 규칙 — Scope 쿼리, 상태 술어, 폭 클램프, 명령 가용성 | `src/domain/**/*.test.ts` |
| jsdom 컴포넌트 | 이벤트 루프가 필요한 상호작용, ARIA 계약, axe | `src/components/**/a11y.test.tsx`, `CommandMenu.test.tsx` |
| E2E | layout · pointers · storage · navigation — jsdom에 없는 넷 | `e2e/navShell.spec.ts` |

### 이 작업에서 배운 것 (반복하지 말 것)

- **폭·크기 판단은 `getComputedStyle`로 확인한다.** 스타일시트가 19개고 뒤쪽이 앞쪽을 다시 여는 게 관행이다. 선언만 읽고 "248px 이미 맞다"고 적었다가 실제 값이 200px이었다 (R.5.3).
- **브라우저에서 한 번은 돌려본다.** 단위 테스트는 내가 세운 전제 안에서만 돈다. `/list/:id` 딥링크가 시작 페이지로 튕기던 버그는 테스트가 아니라 브라우저에서 잡혔다.
- **같은 이름이 다른 뜻인지 의심한다.** "Board"가 두 물건이었고(D-19), "active"가 세 뜻이었다(D-24). 둘 다 그 발견이 곧 해법이었다.
- **CSS 클래스를 옮기기 전에 그 클래스를 누가 빌려 쓰는지 본다.** `ListManager`가 팔레트의 backdrop을 쓰고 있었고, 옮기자 배경이 조용히 사라졌다. 타입체커도 테스트도 못 잡는다 (D-25).
- **`var(--x, fallback)`을 보면 `--x`가 실재하는지 확인한다.** 다섯 스타일시트가 없는 이름을 참조하며 fallback으로만 그려지고 있었다. 문법이 맞고 화면도 (라이트에서는) 멀쩡해서 6개월을 살아남았다 (D-26).
- **한 모듈 안에서만 재고 "정상"이라고 적지 않는다.** 비율 문제를 "스크린샷이 2배라 커 보인 것"으로 닫았는데, Tasks 모듈 안에서만 쟀기 때문이었다. 셸이 둘인 앱에서는 **셸 사이를 건너며** 재야 한다 (D-30).
- **설계서를 이길 때는 이유가 측정이어야 한다.** D-25는 "TickTick이 이렇게 한다"는 **전제**로 §2.14를 뒤집었고, 실제로 써보니 그 전제가 틀렸다. 이 감사가 이긴 다른 판정들(v16 IA, 단일 accent, 흰 Main)은 전부 리포에 있는 사실을 근거로 삼았다 — 그게 차이다 (D-29).
- **테스트가 갑자기 깨지면 선택자를 좁히기 전에 왜 깨졌는지 본다.** Add List E2E 24개가 `[role="dialog"]` 2개로 실패했고, 원인은 테스트가 아니라 `aria-modal`을 동시에 주장하는 두 면이었다 (D-28).
- **`transform`으로 밀어낸 것은 숨긴 것이 아니다.** 화면 밖으로 옮긴 패널은 탭 순서와 접근성 트리에 그대로 남는다. `visibility`/`display`/`inert` 중 하나가 있어야 진짜로 빠진다 (D-27).
- **브라우저 pane이 표시되지 않으면 CSS 트랜지션이 진행되지 않는다.** 프레임을 그리지 않으므로 지연된 `visibility` 전환이 영영 끝나지 않아 "안 고쳐졌다"로 보였다. 트랜지션을 끄고 재면 된다.
- **`git checkout <file>`은 그 파일의 내 작업도 되돌린다.** P0-10 중간에 CSS 정리 스크립트를 다시 돌리려고 파일을 되돌렸다가 같은 파일에 있던 토큰 블록을 날렸다. 브라우저 실측이 아니었으면 모르고 커밋했다.

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

> **D-25가 뒷문장을 뒤집었다 (2026-08-19).** 전역으로 올린다는 결정은 그대로지만, 올라간 것은 "같은 오버레이"가 아니다. Rail과 `/`는 **Search Page**로 가고, Ctrl/Cmd+K가 **Command Menu** 오버레이를 연다. 하나가 아니라 둘이다.

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

**D-16 — P0-2는 Rail과 레거시 사이드바의 중복을 남긴다.** (의도됨 → **P0-5에서 해소**)

Rail에 캘린더·집중·설정이 생겼는데 레거시 사이드바에도 같은 항목이 그대로 있다. 설계서 §12.131의 마이그레이션 순서가 `3. Global Rail 추가` → `4. 기존 Sidebar content를 Context Sidebar로 이동`으로 두 단계를 나눠 놓았고, 중복은 그 사이의 상태다. 이 중복을 P0-2에서 미리 지우면 아직 없는 Context Sidebar가 유일한 진입점이 되어 도달 불가 화면이 생긴다.

**해소 (P0-5, 2026-08-19).** 단계적으로 걷혔다 — P0-4가 캘린더·집중·설정·보드 행을, P0-4b-4가 보관함 행을, P0-5가 남은 전부(브랜드·계정·검색창·`오늘`)를 가져갔다. `Sidebar.tsx`는 이제 없다. `space` 모드가 그리는 것은 [`SpaceSidebar`](src/components/shell/SpaceSidebar.tsx) — 헤더 하나와 트리뿐이다.

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


**D-25 — Search와 Command Menu는 한 상자가 아니라 두 기능이다. (Q-03 해소, 2026-08-19)**

설계서 §2.14는 "Search는 라우팅하지 않는다 — 어디에 있든 그 위에 전역 오버레이가 열린다"고 한다. 이 리포엔 이미 `/search` 라우트와 Search Page가 있었고(v16 §10.19), 오버레이 하나가 그 둘을 대신하려면 **주소로 공유할 수 있는 검색 결과**를 버려야 했다.

그래서 합치지 않고 **용도로 갈랐다.**

| | 무엇을 위한 것인가 | 주소 | 어떻게 연다 |
|---|---|---|---|
| **Search Page** (`/search?q=`) | 찾는다 — Task·List·Tag·Filter 전체 | URL에 남는다. 딥링크·공유 가능 | Rail의 Search, `/` 단축키, `openSearch` 명령 |
| **Command Menu** (오버레이) | 간다·실행한다 — 빠른 화면 이동과 명령 | 아무것도 쓰지 않는다 (§10.23) | Ctrl/Cmd+K |

**둘 사이에 다리를 놓지 않는다.** 옛 팔레트 하단의 "결과 전체 보기"는 타이핑한 질의를 `/search`로 넘겼다. 그 한 줄이 팔레트를 검색창으로 되돌린다 — 어느 행에 착지하느냐에 따라 입력의 의미가 달라지기 때문이다. 그래서 그 버튼은 없앴고, Search Page로 가는 길은 Rail·`/`·명령 셋뿐이다.

**Menu에서 Task를 뺀 것도 같은 규칙이다.** List·Tag·Filter·그룹·Project·Space는 *장소*라서 "이동"에 속한다. Task는 장소가 아니라 찾는 대상이고, 그건 Search Page의 일이다. 이 경계는 컴포넌트가 아니라 [`search.ts`](src/domain/tasks/search.ts)의 `MENU_LIMITS`(`task: 0`)가 지킨다 — 한 matcher를 두 질문이 공유하되, 무엇을 묻는지는 호출부가 정한다.

**전역화가 실제로 요구한 것은 Scope 없는 컨텍스트였다.** 메뉴가 Calendar·Focus·Spaces 위에서도 열리므로 `CommandContext.scope`는 `null`을 가진다. 없는 Scope를 지어내지 않는다 — Scope가 필요했던 명령(`viewBoard`/`viewList`)은 그냥 제시되지 않고, 이는 §10.33이 Module 안에서 이미 쓰던 규칙과 같다.

**옮겨간 것들.** 팔레트가 Tasks Module의 상태를 읽던 네 가지는 이제 URL에서 읽거나 App이 들고 있다.

| 무엇 | 어디로 | 왜 |
|---|---|---|
| `CommandPalette.tsx` | [`shell/CommandMenu.tsx`](src/components/shell/CommandMenu.tsx) | 두 셸 위에 그려진다 |
| `tm-palette-*` CSS | `19-app-shell.css`의 `cmd-menu-*` | 한 페이지의 스타일시트에 살 수 없다 |
| recents 상태·영속 | [`hooks/useRecents.ts`](src/hooks/useRecents.ts) | 저장 키는 그대로 — 기존 설치본의 기록이 유지된다 |
| `titleFor` / `namedRecordMissing` | [`domain/tasks/scopeTitle.ts`](src/domain/tasks/scopeTitle.ts) | Module 밖에서도 Scope 이름을 물어야 한다 |
| capture 초안 | App의 `capturedTitle` → `draftTitle` prop | 메뉴가 Module 위에 있으므로 |

**놓칠 뻔한 것 하나.** `ListManager`가 팔레트의 backdrop 클래스를 빌려 쓰고 있었다. CSS를 셸로 옮기자 그 다이얼로그의 배경이 조용히 사라진다 — 테스트도 타입체커도 잡지 못하는 종류다. `tm-manager-scrim`을 같은 형상으로 만들어 붙였다.

---


**D-26 — §11은 "예쁜 색을 칠하는 단계"가 아니었다. 토큰이 없어서 다크 모드가 없었다. (P0-10, 2026-08-19)**

착수 전 R.5.3의 규칙대로 **선언이 아니라 계산된 값**을 쟀고, 예상과 다른 것이 나왔다.

```js
getComputedStyle(root) → --text, --surface, --bg, --hover,
                         --selected, --border, --text-muted,
                         --surface-muted  ... 전부 (UNDEFINED)
```

`17-tasks-module.css`, `19-app-shell.css`, `13-list-view.css`, `15-goals-section.css`, `16-overview-section.css` — 다섯 장이 `var(--text, #1c1c1e)` 꼴로 **없는 이름**을 참조하고 있었다. 즉 전부 하드코딩된 라이트 모드 fallback으로 그려지고 있었다.

**증상은 다크 모드에서 눈에 보인다.** 실측:

| | 이전 (dark) | 이후 (dark) |
|---|---|---|
| `.tm-shell` 배경 | `rgb(255,255,255)` — 흰 패널 | `rgb(28,28,30)` |
| 상속된 `color` | `rgb(245,245,247)` — 흰 글씨 | 그대로 |
| `.tm-row` 글자색 | `rgb(28,28,30)` | `rgb(245,245,247)` |

**흰 패널 위의 흰 헤더 글씨**다. 모듈이 잘못 물어본 게 아니라 **아무도 답을 정의하지 않았다.** 그래서 이 단계의 핵심 산출물은 색 팔레트가 아니라 **이름의 정의**다 — 별칭 한 블록이 다섯 스타일시트를 동시에 고친다.

**§11에서 실제로 가져온 것.**

| §11 | 적용 | 실측 (light → dark) |
|---|---|---|
| §11.6 surface hierarchy | Rail·Sidebar·Main이 서로 다른 면 | Rail `#f7f7f8`→`#161618`, Sidebar `#fafafb`→`#1c1c1e`, canvas `#f2f2f7`→`#101012` |
| §11.20/§11.28 quiet selection | 사이드바 현재 행 = 중립 배경 + weight 500 | `rgba(0,122,255,.12)`/600 → `#eceef3`/500 |
| §11.42 focus ring | `--ff-focus-ring` 신설 | 셸의 5곳이 `--ff-blue`라고 적으며 "포커스 링"을 뜻하고 있었다 |
| §11.7 divider | 현행 유지 | 이미 1px `--border-subtle` |

**가져오지 않은 것과 그 이유.**

- **§11.4/§11.5의 팔레트 전체.** 이 리포는 이미 완성된 토큰 체계(Apple 계열 중립 그레이 + `[data-accent]` 5색 사용자 설정)를 가지고 있다. §11의 단일 accent `#5B6EF5`를 강제하면 **출시된 사용자 설정 하나가 죽는다.** 규칙(R.1.1)대로 골격은 가져오고 값은 리포가 이긴다 — 새 역할(selected/rail/sidebar)에만 §11의 값을 쓰고, 이미 정해진 역할은 건드리지 않았다.
- **다크의 §11.5 값.** `#14161A`/`#17191E`는 푸른기가 있고 이 리포의 다크는 순중립이다. 두 면만 다른 팔레트에서 가져오면 테마가 두 개로 보인다. **관계**(Rail < Sidebar < canvas 위)만 가져오고 값은 리포의 그레이 계단에서 뽑았다.
- **Main을 흰색으로.** §11.6은 Main `#FFFFFF`를 말하지만 이 앱의 Main은 **캔버스**이고 그 위의 카드가 흰색이다. 캔버스를 희게 하면 모든 카드가 평평해진다. chrome이 캔버스와 카드 사이에 앉는 것으로 §11.71(content-first)은 이미 성립한다.

**오버라이드 층 정리 — 실제로 무엇이 있었나.**

| 어디 | 무엇 | 처리 |
|---|---|---|
| `01-base.css` | 삭제된 `Sidebar.tsx`의 규칙 46개 (`.sidebar`, `.side-*`, `.sidebar-collapsed`, `.global-search`, `.search-results`, collapse 트랜지션 전부) | 삭제. JSX에 클래스명이 하나도 없음을 먼저 확인 |
| `02-calendar.css` | 같은 컴포넌트의 재도색 블록 + `--ff-*` 토큰 선언 | 도색은 삭제, 토큰은 `01-base.css`로 이동 |
| `09-calendar-redesign.css` | 같은 컴포넌트의 **세 번째** 도색 층 | 삭제 |

**`--ff-*`가 캘린더 스타일시트 2,900번째 줄에 선언돼 있었다는 게 이 감사가 P0-2에서 200px에 속은 이유와 같은 종류의 문제다.** 셸이 자기 색을 칠하는 이름을 찾으려면 캘린더를 grep해야 했다. 토큰은 토큰 있는 곳으로 옮겼다.

---


**D-27 — A11y는 속성을 채우는 일이 아니었다. 모바일에서 탭이 보이지 않는 사이드바로 들어가고 있었다. (P0-11, 2026-08-19)**

P0-11의 지시는 "§2.33 / §3.49~§3.52의 ARIA"였다. 셸 전체를 렌더해 axe를 돌리는 검사부터 새로 만들었고([`shell/a11y.test.tsx`](src/components/shell/a11y.test.tsx)), 거기서 **landmark 구조는 이미 통과했다** — Rail·Context Sidebar·Main이 각각 landmark고 두 `<nav>`의 이름도 서로 다르다. 기존 모듈 검사가 `region` 규칙을 끄면서 "이건 셸의 질문"이라고 적어둔 그 질문에 이제 답이 있다.

진짜 결함은 그 옆에 있었다. **모바일 오버레이 사이드바가 닫혀 있을 때 실측:**

```
transform: matrix(1,0,0,1,-280,0)   ← 화면 밖
visibility: visible                  ← 트리 안
포커스 가능한 요소: 9개              ← 탭 순서 안
```

`transform`으로 밀어낸 패널은 **보이지 않게 될 뿐 사라지지 않는다.** 폰에서 Tab을 누르면 없는 사이드바 안을 아홉 번 도는 상태였다. `19-app-shell.css`는 데스크톱 collapse에 대해 이걸 정확히 적어두고 있었다 — *"its rows must leave the tab order and the accessibility tree"* — 오버레이만 그 기준에 걸린 적이 없었다.

**고친 것 셋.**

| § | 무엇 | 실측 확인 |
|---|---|---|
| §3.31 | 닫힌 드로어에 `visibility: hidden` (슬라이드 길이만큼 지연) | `hidden`, 탭 순서에서 빠짐 |
| §3.50 | 열린 드로어만 `role="dialog"` + `aria-modal` + 포커스 트랩 + Escape | 열면 포커스가 안으로, Escape로 닫고 **포커스가 열었던 버튼으로 복귀** |
| §3.52 | collapse/expand가 같은 region을 지목 — `CONTEXT_SIDEBAR_ID` 상수 | 두 버튼이 같은 `aria-controls`, `aria-expanded`가 서로 반대 |

**§3.50에서 갈린 판단 하나.** 오버레이일 때 `<nav>`는 landmark 역할을 내주고 dialog가 된다. 폰에서는 "지금 모달 안에 있고 뒤쪽은 비활성"이라는 정보가 landmark 하나보다 값이 크다. 다만 **열려 있는 동안만**이다 — 닫힌 드로어가 `aria-modal`을 달고 있으면 덮은 것도 없이 뒤쪽이 비활성이라고 말하는 셈이고, 그건 지키지 못할 약속이다.

**§2.33에서 일부러 따르지 않은 줄 하나.** 설계서는 Search 버튼에 `aria-haspopup="dialog"`와 `aria-expanded`를 요구한다. D-25 이후 Search는 **페이지로 이동한다.** 열지 않을 dialog를 열겠다고 선언하면 스크린리더가 그 약속을 사용자에게 전달하고 앱이 그걸 깬다. 그래서 **이 줄의 올바른 구현은 그 속성의 부재**이고, §2.33을 읽은 다음 사람이 "빠졌네" 하고 채워 넣지 않도록 테스트로 못박았다.

**남긴 것.** Tasks 사이드바에는 collapse 버튼이 없다(v16 §1.14에 헤더가 없다). 접기는 Ctrl/Cmd+`\`와, 접힌 뒤 나타나는 expand 버튼으로만 가능하다. 버튼 자체를 다는 것은 §3.23이고 P0-3/P0-8의 영역이라 여기서 만들지 않았다 — **알려진 공백으로 남긴다.**

---


**D-28 — E2E는 jsdom이 답할 수 없는 것만 맡는다. 그리고 첫 실행에서 결함 하나를 잡았다. (P0-12, 2026-08-19)**

단위 층이 이미 촘촘하다 — axe 검사 셋, 사이드바의 순수 규칙, 라우트 레지스트리. 브라우저에서 `aria-label`을 한 번 더 확인하는 스펙은 CI 시간을 쓰고 아무것도 못 잡는다. 그래서 [`e2e/navShell.spec.ts`](e2e/navShell.spec.ts)에 들어간 것은 **jsdom에 없는 넷 중 하나가 필요한 케이스뿐**이다.

| 필요한 것 | 케이스 |
|---|---|
| **LAYOUT** — 폭이 있는 뷰포트 | CS-01(사이드바 +40 = Main −40, Rail 56 불변), CS-07(모듈 전환 후 폭 복귀), CS-08(1024 아래는 오버레이) |
| **POINTERS** — 실제 좌표의 드래그 | CS-01~04(min 216 / max 360 / 더블클릭 248) |
| **STORAGE** — 새로고침이 통과하는 localStorage | 폭·collapse 영속, §3.58 손상값 복구 |
| **NAVIGATION** — 브라우저가 소유한 history | RAIL-01·03·05·06, CS-09 |

**설계서 케이스 둘은 반대로 단언했고, 둘 다 D-25 때문이다.**

- **RAIL-02** — "Search를 열어도 pathname이 그대로다"는 오버레이 전제다. 여기서 Search는 페이지이므로 **이동한다.** 살아남는 절반은 원래 요점이던 쪽이다 — Search는 유틸리티고, 유틸리티는 Rail의 active를 가져가지 않는다(§2.14). 그대로 테스트했다.
- **RAIL-07** — Escape로 닫을 Search 오버레이가 없다. 그 자리를 Command Menu가 물려받았고, §2.48이 실제로 원하던 동작(Escape로 닫히고 주소는 그대로)은 메뉴가 진다.

**첫 실행이 잡은 것 — `aria-modal`이 둘이었다.**

P0-11이 드로어를 dialog로 만들었다(§3.50). 그런데 드로어 안의 `+`로 Add List를 열면 **드로어가 뒤에 열린 채 남는다.** 두 면이 동시에 "나머지는 비활성"이라고 선언하면 스크린리더는 어느 쪽이 진심인지 알 수 없다.

기존 Add List E2E가 태블릿·모바일에서 `[role="dialog"]`가 2개로 해석되며 24개 실패로 이것을 드러냈다. **선택자를 좁혀 넘어갈 수 있었지만 그건 결함을 테스트에서 숨기는 것이다.** 드로어는 애초에 그 버튼까지 가는 경로였고, 행을 눌러 **이동**할 때는 이미 비켜난다(§15.16) — 다이얼로그를 여는 것도 목적지만 다른 같은 사건이다. 그래서 드로어가 비켜나게 고치고, 케이스로 못박았다.

**P0-11이 기존 E2E 헬퍼도 하나 깨뜨렸다.** `openApp`이 준비 신호로 `.tm-sidebar`가 **보이기**를 기다리고 있었다. 닫힌 드로어가 진짜로 숨겨지기 전에는 좁은 뷰포트에서도 그게 참이었다. `.tm-shell`로 바꿨다 — 모든 모드에서 "모듈이 렌더됐다"를 뜻하는 신호.

**최종:** 단위 1507 passed, E2E 73 passed (desktop·tablet·mobile 3종, 뷰포트 가드로 74 skipped).

---


**D-29 — D-25의 절반을 뒤집는다. 돋보기는 이동이 아니라 오버레이다. (2026-08-19)**

D-25는 Q-03을 "Search는 페이지, Ctrl/Cmd+K는 메뉴, 둘 사이에 다리 없음"으로 닫았고, 근거는 **"TickTick과 동일한 mental model"**이었다. 만들어 놓고 써보니 그 전제가 사실이 아니었다.

**실측 — 캘린더에서 돋보기를 누르면 동시에 넷이 바뀌었다.**

| | 누르기 전 | 누른 후 |
|---|---|---|
| URL | `/calendar` | `/search` |
| Rail 활성 | 캘린더 | **작업** |
| 사이드바 | 없음 | **Tasks 사이드바** |
| 셸 | 레거시 | **Tasks 모듈** |
| 히스토리 | 7 | 8 |

뒤의 셋은 D-25가 의도한 게 아니라 파생 효과다 — `/search`가 Tasks 모듈 라우트라서 `railItemFor`와 `contextSidebarModeFor`가 둘 다 "tasks"로 읽는다. 게다가 Search 페이지에는 닫기 버튼도 Escape도 없어서 돌아오는 길은 브라우저 뒤로가기뿐이었다. **그리고 정작 누른 돋보기는 아무 반응이 없었다** — §2.14가 활성 상태를 금지하는데, 그 결과가 "누른 버튼은 가만있고 다른 버튼이 켜지는" 상태였다.

**원하는 동작을 내는 기계는 이미 있었다.** 같은 캘린더에서 Ctrl+K는 URL·Rail·셸·히스토리 **아무것도 건드리지 않고** 위에 뜨고 Escape로 닫힌다. 문제는 그게 돋보기에 연결돼 있지 않고 안에 Task가 없다는 것뿐이었다.

**그래서 되돌린 것 둘.**

| D-25 조항 | D-29 |
|---|---|
| Rail Search → `/search` 이동 | **오버레이를 연다.** 돋보기와 Ctrl/Cmd+K가 같은 표면 |
| `MENU_LIMITS.task = 0` | **`task: 5`.** 메뉴가 Task를 다시 찾는다 |
| "다리 없음" (전체 결과 행 폐기) | **마지막 행으로 복원.** 단, 리스트박스 **밖** — 화살표로 훑다가 이동에 착지하지 않는다 |

**유지한 것.** `/search` 페이지는 그대로다 — `?q=`가 주소에 남는 공유 가능한 전체 결과. D-25가 지켜낸 진짜 자산은 그것이었고, 메뉴는 그 페이지로 넘겨줄 뿐 대체하지 않는다.

**D-25의 분리 근거는 틀렸는가.** "한 입력창에서 어느 행에 착지하느냐에 따라 의미가 달라진다"는 우려는 관념적이었다. Linear·Notion·TickTick이 모두 한 입력창에 결과·장소·명령을 함께 담고, 실제로 문제되지 않는다. 반면 문맥 손실은 관념이 아니라 **네 개의 동시 변화로 측정됐다.**

**§2.33도 함께 돌아왔다.** 설계서는 Search 버튼에 `aria-haspopup="dialog"`와 `aria-expanded`를 요구했고, D-25 때는 **지키지 못할 약속이라 일부러 빼두고 그것을 테스트로 못박았다**(P0-11). 이제 약속이 참이 됐으므로 속성도 돌아온다. 그 테스트는 두 번 뒤집혔는데, 그게 그 테스트의 존재 이유다 — 속성을 설계서가 아니라 **실제 동작과 대조**한다.

---


**D-30 — 밀도는 배율이 아니다. `zoom: 0.9`를 걷어내고 토큰으로 옮긴다. (2026-08-19)**

`.app-shell > main`에 `zoom: 0.9`가 있었다. 주석은 *"content area를 조금 줄여 촘촘하게. Sidebar stays 100% so proportions read right"* — **셸이 하나였을 때** 쓰인 문장이다.

**실측.** main에 100px 상자를 넣고 렌더된 폭:

| 페이지 | 본문 | 사이드바 |
|---|---|---|
| Tasks 모듈 (`/today`, `/list/:id`) | **100px** | 100px |
| 레거시 (`/app`·캘린더·집중·공간) | **90px** | 100px |

Tasks 모듈의 그리드는 `.app-shell > main`이 아니므로 zoom이 닿지 않았다. 결과는 둘이다 — 레거시에선 사이드바가 본문보다 11% 크고, **두 셸을 오갈 때 본문이 11% 점프**한다.

**그리고 도구 자체가 틀렸다.** zoom은 타이포·패딩·테두리·히트 영역·헤더 높이를 **한꺼번에** 줄인다. 밀도는 그런 게 아니다 — 글자는 읽혀야 하고, 패딩은 글자보다 더 줄어도 되고, **누르는 영역은 줄면 안 된다.** 게다가 P0-10이 §11 토큰으로 밀도를 설계로 정한 뒤로는 전역 배율이 그 숫자들을 전부 명목값으로 만든다: 56px 헤더가 50.4px로, 13px 라벨이 11.7px로 렌더된다.

**그래서 배율을 없애고 토큰으로 옮겼다.** [`01-base.css`](src/styles/01-base.css)에 `--density-*` 정의, [`20-density.css`](src/styles/20-density.css)에 적용(마지막 임포트).

| | 이전 (0.9 적용 후 실효) | 이후 (100%) |
|---|---|---|
| main 패딩 | 36 / 39.6px | **24 / 32px** |
| 본문 글자 | 12.6px | **13px** |
| 카드 패딩 | 16.2px | **14px** |
| 버튼 높이 | 36px | **32px** (탭 바닥 24, 터치 44) |
| 페이지 제목 | 19.8px | **20px** |

즉 **패딩은 더 줄고 글자는 오히려 조금 커졌다.** 그게 배율과 밀도의 차이다. 아이콘(16px)과 컨트롤 높이(32px)를 **다른 토큰으로 분리**한 것도 같은 이유 — 아이콘은 작아져도 되지만 누를 곳은 아니다.

**덤으로 잡힌 것.** 이 작업 중 `.tm-main`의 위쪽 패딩이 24px, 사이드바가 16px이라 **P0-6이 만들었다고 한 "두 열에 하나의 헤더 라인"이 실제로는 8px 어긋나 있었다.** 밀도 레이어를 무력화해도 그대로였으니 원래 있던 것이다. P0-6은 두 **높이**를 맞추고 위쪽 **가장자리**는 우연에 맡겼다. 자를 대기 전에는 디자인처럼 읽히는 종류의 결함이다.

---

## R.7 미결 — 다음 결정이 필요한 것

| # | 질문 | 상태 |
|---|---|---|
| ~~Q-01~~ | `board` / `archive` / `projects`(SpaceHub)의 행선지 | **해소 → D-13** (2026-08-19). 단 보드 진입점이 Q-06으로 갈라져 나왔다 |
| ~~Q-02~~ | `SpaceTree`의 진입 경로 | **해소 → D-14** (2026-08-19) |
| ~~Q-03~~ | `/search` 라우트 vs 설계서 §2.14 "Search는 라우팅하지 않는다" | **해소 → D-25** (2026-08-19). 둘 다 유지하되 용도로 가른다 — Search는 페이지, Ctrl/Cmd+K는 메뉴. 설계서 §2.14는 이로써 개정된다 |
| ~~Q-04~~ | Rail의 Tasks 재클릭 동작 | **해소 → D-15** (2026-08-19). 세션 범위, fallback은 `/today` |
| **Q-05** | Horizons / Goals / LearningPath | v16 Phase 0 감사 §B에서도 미결로 남았던 항목. 이번에도 Rail 밖이다 |
| ~~Q-06~~ | 전역 보드(사분면 축)의 진입점 | **해소 → D-19** (2026-08-19). Matrix로 재분류하고 Rail에 올린다. §1.5에 명시적 예외 |
| ~~Q-07~~ | `보관함`을 10번째 Scope로 승격할 것인가 | **해소 → D-20** (2026-08-19), 그 뒤 **개정 2**로 뒤집힘: 승격이 아니라 **폐기**다. Task Archive는 Won't Do(D-23)로 대체되고, 프로젝트 Archive만 SpaceHub로 간다 |

**남은 것은 Q-05뿐이다.** 어느 P0도 막지 않는다.

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
| ~~P0-5 Tree~~ | **완료** (2026-08-19). [`SpaceSidebar`](src/components/shell/SpaceSidebar.tsx) = 헤더 + `SpaceTree`. 레거시 [`Sidebar.tsx`](src/components/Sidebar.tsx) 삭제, `/` 단축키는 전역 검색으로 | P0-3 |
| ~~P0-6 Main Header~~ | **완료** (2026-08-19). 헤더 56px·뷰 전환 40px(A.4)을 사이드바 헤더와 같은 토큰으로, 중복 Search 진입점 제거. 뷰 전환은 현행 유지(D-09) | P0-2 |
| P0-7 Create/Menu | **완료** (Add List v0.13.0) | — |
| P0-8 Collapse/Resize | §10 상호작용 마무리 (키보드 resize, 더블클릭, 영속) | P0-3 |
| ~~P0-9 Search~~ | **완료** (2026-08-19). 팔레트가 아니라 **Command Menu**가 전역으로 올라갔다(D-25). Search는 페이지로 남고 둘 사이에 다리는 없다. `MENU_LIMITS`·nullable `CommandContext`·[`useRecents`](src/hooks/useRecents.ts)가 그 경계 | P0-2, Q-03 |
| ~~P0-10 Visual tokens~~ | **완료** (2026-08-19). **D-26.** 진짜 문제는 색이 아니라 정의되지 않은 토큰 이름이었다 — 다섯 스타일시트가 없는 변수를 참조해 다크 모드가 라이트로 그려지고 있었다. §11.6 surface hierarchy·§11.28 quiet selection 적용, 삭제된 레거시 사이드바의 CSS 3개 층 제거 | P0-6 |
| ~~P0-11 A11y~~ | **완료** (2026-08-19). **D-27.** 셸 전체 axe 검사 신설(`region` 켠 채로) — landmark는 이미 통과했고, 진짜 결함은 닫힌 모바일 드로어가 탭 순서에 남아 있던 것이었다. §3.50 모달 계약·§3.52 공유 region id 적용 | P0-10 |
| ~~P0-12 E2E~~ | **완료** (2026-08-19). **D-28.** [`e2e/navShell.spec.ts`](e2e/navShell.spec.ts) — jsdom이 못 하는 넷(layout·pointers·storage·navigation)만. 첫 실행에서 `aria-modal` 중복 결함을 잡았다 | 전부 |

---

## R.9 이 감사가 답한 것

- 설계서와 v16의 충돌은 **v16 승**으로 해소했다 (R.3). 그로 인해 무효화된 설계서 조항 5개를 명시했다.
- 설계서가 예상하지 못한 이 리포의 사실 둘을 발견했다.
  1. **셸이 둘이다** (R.5.1) — P0-2의 실제 작업량은 Rail이 아니라 병합이다.
  2. **절반의 페이지에 라우트가 없다** (R.5.2) — P0-1은 선택이 아니라 전제다.
- 1024px 경계는 **이미 일치한다.** (폭 248px도 맞다고 적었다가 P0-2에서 정정했다 — R.5.3.)
- 착수 전 결정 둘(Q-01·Q-02)을 D-13·D-14로 닫았다. 그 과정에서 "전역 보드는 Scope 뷰와 중복"이라는 통념이 **틀렸음**을 확인했다 — 사분면 축은 거기에만 있다 (D-13).

다음 산출물은 **P0-1의 라우트 레지스트리**다. 남은 미결(Q-03~Q-07)은 P0-1을 막지 않는다.

*(위 문단은 착수 시점의 기록이다. 2026-08-19 현재 P0-1~P0-9는 끝났고 Q-03도 D-25로 닫혔다 — 현재 상태는 R.0을 볼 것.)*
