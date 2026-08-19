# FocusFlow TickTick-style Navigation Redesign Spec

- 문서 상태: **v0.1 — §1 Navigation IA 확정본**
- 작성일: 2026-08-19
- 대상: FocusFlow Desktop/Web
- 목적: 현재 단일 좌측 사이드바 구조를 **Global Rail + Context Sidebar + Main View** 구조로 재설계
- 기준 화면: 현재 FocusFlow 좌측 사이드바 (`FocusFlow / account / 전체 검색 / 오늘 / 캘린더 / 공간 트리 / 보드 / 집중 / 보관함 / 설정`)
- 구현 우선순위: **P0**
- 이 문서는 개발자가 추가 해석 없이 구현할 수 있도록 **IA, 상태, 상호작용 계약, 마이그레이션 규칙, 수용 기준**까지 정의한다.

---

# 0. 문서 사용 방법

이 문서는 전체 사이드바 재설계의 단일 소스 문서로 사용한다.

향후 아래 순서로 같은 파일에 계속 추가한다.

1. **Navigation IA** ← 현재 확정
2. Global Rail
3. Context Sidebar Frame
4. Tasks Sidebar
5. Space / Project Tree
6. Create UX
7. Main Content 연동
8. URL / Navigation State
9. Global Search
10. Collapse / Resize
11. Visual System
12. Responsive / Accessibility / Edge Cases

## 0.1 구현 원칙

개발 중 새로운 UI 요소를 추가해야 하는 경우 다음 우선순위를 따른다.

1. 이 문서에 명시된 IA를 깨지 않는다.
2. `기능`, `탐색 대상`, `View`를 서로 다른 계층으로 유지한다.
3. 동일 Entity가 여러 내비게이션 계층에 중복 노출되지 않게 한다.
4. 현재 선택된 **scope**와 현재 선택된 **view**를 별도 상태로 취급한다.
5. URL, 브라우저 history, sidebar active state, main content가 서로 다른 대상을 가리키지 않게 한다.

---

# 1. Navigation Architecture

## 1.1 재설계 목적

현재 FocusFlow의 좌측 사이드바는 아래 서로 다른 성격의 항목을 같은 내비게이션 레벨에 배치하고 있다.

- 계정
- 검색
- 오늘
- 캘린더
- 공간
- 프로젝트
- 보드
- 집중
- 보관함
- 설정

문제는 `오늘`, `공간`, `보드`, `캘린더`, `집중`이 서로 같은 종류의 항목이 아니라는 점이다.

예:

- `오늘`: Task 집합을 날짜로 필터링한 **Smart View**
- `공간`: 사용자 데이터 구조를 탐색하는 **Entity Collection**
- `fNIRS 졸업 논문`: 실제 사용자 데이터 **Project Entity**
- `보드`: 같은 Project 데이터를 표현하는 **Presentation View**
- `캘린더`: 앱 전체 범위의 독립 **Global Module**
- `집중`: 앱 전체 범위의 독립 **Execution Mode**

따라서 기존의 단일 메뉴 구조를 유지한 채 아이콘만 줄이는 방식은 금지한다.

---

# 1.2 핵심 모델

전체 내비게이션을 아래 3계층으로 분리한다.

```text
LEVEL 1 — Global Module
"앱에서 무엇을 할 것인가"

LEVEL 2 — Navigation Scope / Entity
"어떤 작업 집합 또는 어떤 대상을 볼 것인가"

LEVEL 3 — View
"그 대상을 어떤 방식으로 표현할 것인가"
```

이를 UI 구조에 대응시키면 다음과 같다.

```text
┌──────────────┬─────────────────────────┬─────────────────────────────┐
│ Global Rail  │ Context Sidebar         │ Main Content                │
│              │                         │                             │
│ 기능 전환    │ 대상 / 범위 탐색       │ 선택 대상 + 선택 View       │
└──────────────┴─────────────────────────┴─────────────────────────────┘
```

---

# 1.3 용어 정의

## Global Module

현재 선택된 Space 또는 Project와 무관하게 앱의 작동 모드를 바꾸는 최상위 기능.

예:

- Tasks
- Calendar
- Focus
- Search
- Settings

## Scope

현재 메인 화면이 대상으로 삼는 데이터 범위.

예:

- Today
- Upcoming
- Space A
- Project A
- Archive

## Entity

사용자가 생성하거나 관리하는 실제 데이터 객체.

현재 재설계 범위에서는:

- Space
- Project

## View

동일한 Scope를 다른 방식으로 표현하는 UI.

예:

- Overview
- List
- Board
- Gantt
- Calendar
- Goals
- Horizons

---

# 1.4 최종 Navigation Tree

```text
FOCUSFLOW
│
├─ GLOBAL RAIL
│   │
│   ├─ Account
│   ├─ Tasks
│   ├─ Calendar
│   ├─ Focus
│   ├─ Search
│   └─ Settings
│
├─ TASKS CONTEXT SIDEBAR
│   │
│   ├─ Today
│   ├─ Upcoming
│   │
│   ├─ Spaces
│   │   │
│   │   ├─ Space
│   │   │   ├─ Project
│   │   │   ├─ Project
│   │   │   └─ Project
│   │   │
│   │   └─ Space
│   │
│   └─ Archive
│
├─ SPACE VIEW
│   │
│   ├─ Overview
│   ├─ Projects
│   ├─ Goals
│   └─ Horizons
│
└─ PROJECT VIEW
    │
    ├─ Overview
    ├─ List
    ├─ Board
    ├─ Gantt
    └─ Calendar
```

---

# 1.5 Global Rail 확정 항목

Global Rail에는 다음 항목만 존재한다.

| Item | 종류 | 위치 | 비고 |
|---|---|---|---|
| App mark | Branding | 최상단 | 텍스트 로고 금지 |
| Account | Utility | 상단 | Avatar만 노출 |
| Tasks | Global Module | Main navigation | Context Sidebar 사용 |
| Calendar | Global Module | Main navigation | 독립 글로벌 캘린더 |
| Focus | Global Module | Main navigation | 독립 집중 모드 |
| Search | Global Utility | Main/utility | 전체 검색 진입점 |
| Settings | Utility | 최하단 | 항상 bottom anchored |

다음 항목은 **Global Rail에 배치하지 않는다.**

- Today
- Upcoming
- Space
- Project
- Board
- Gantt
- Project Calendar
- Goals
- Horizons
- Archive

---

# 1.6 Tasks Module

`Tasks`는 FocusFlow의 핵심 기본 모듈이다.

Tasks가 활성화되면 Context Sidebar는 Task 탐색용 Sidebar로 전환된다.

```text
Tasks

오늘
다가오는 일정

────────────

공간

▼ My Space
   ● fNIRS 졸업 논문
   ● Project B
   + 프로젝트

+ 공간

────────────

보관함
```

## Tasks Module의 책임

Tasks는 아래 데이터를 탐색하게 한다.

- Smart View
- Space
- Project
- Archive

Tasks는 아래 기능을 직접 제공하지 않는다.

- Board 자체를 독립 모듈로 전환
- Gantt 자체를 독립 모듈로 전환
- 특정 Project와 무관한 Project View 전환

---

# 1.7 Today

## 분류

`Today`는 Global Module이 아니라 **Tasks 내부 Smart View**다.

## 이유

Today는 앱 모드를 바꾸는 것이 아니라 전체 Task 집합에 날짜 필터를 적용한 Scope이기 때문이다.

## 동작 계약

```text
User clicks "오늘"
→ activeGlobalModule = "tasks"
→ activeScope.type = "smart"
→ activeScope.id = "today"
→ Main Content renders Today view
```

## Sidebar state

- `오늘` row가 active 상태
- 특정 Space 또는 Project active 상태는 해제
- Space Tree의 expand/collapse 상태는 유지
- Project View state는 선택 해제되거나 보존 가능한 최근 상태로만 저장하며 현재 active로 표시하지 않음

---

# 1.8 Upcoming

## 분류

`Upcoming`은 Tasks 내부 Smart View다.

## 목적

Today와 Calendar의 역할을 분리한다.

- Upcoming: 작업 중심 목록
- Global Calendar: 시간축 중심 일정 UI

## 최소 요구사항

Upcoming은 P0에서 아래 범위만 지원해도 된다.

- 내일
- 이번 주
- 이후 예정

구체적 date grouping은 별도 View 문서에서 정의한다.

---

# 1.9 Spaces Section

`공간`은 독립 페이지가 아니라 **Tasks Sidebar 내부 Section Header**다.

## 기본 동작

- Section label 자체는 navigation target이 아니다.
- expand/collapse 가능 여부는 §4 Tasks Sidebar에서 확정한다.
- `+` 또는 create affordance는 Space 생성 진입점이다.
- Space Entity는 해당 Section 하위에 표시한다.

## 금지

다음 형태로 구현하지 않는다.

```text
[Global Rail]
공간 아이콘
```

현재 설계에서 Space는 앱 모듈이 아니라 Tasks 내부 사용자 데이터 계층이다.

---

# 1.10 Space Entity

Space는 실제 navigation target이다.

예:

```text
▼ My Space
```

## Space 클릭

Space 이름을 클릭하면 해당 Space의 기본 화면으로 이동한다.

```text
activeGlobalModule = "tasks"
activeScope.type = "space"
activeScope.id = <spaceId>
activeView = "overview"
```

## Space의 기본 View

```text
Overview
```

## Space View Registry

P0 기준 Space는 다음 View를 가진다.

```text
Overview
Projects
Goals
Horizons
```

### 원칙

- `Goals`와 `Horizons`는 Global Rail로 승격하지 않는다.
- Space를 벗어나지 않은 채 representation/tab만 변경한다.
- Space Scope는 유지된다.

---

# 1.11 Project Entity

Project는 Space 하위의 navigation target이다.

예:

```text
▼ My Space
   ● fNIRS 졸업 논문
```

## Project 클릭

```text
activeGlobalModule = "tasks"
activeScope.type = "project"
activeScope.id = <projectId>
activeView = <defaultProjectView>
```

## defaultProjectView

기본값은 `list`를 권장한다.

단, 기존 FocusFlow에 저장된 사용자별 last-view 정책이 있다면 §8 URL / Navigation State에서 다시 확정한다.

---

# 1.12 Project View Registry

Project는 아래 View를 가진다.

```text
Overview
List
Board
Gantt
Calendar
```

## 핵심 규칙

Project View를 바꿔도 Sidebar에서는 동일 Project가 active 상태를 유지한다.

예:

```text
fNIRS 졸업 논문 > List
      ↓
fNIRS 졸업 논문 > Board
```

변하는 것:

```text
activeView
```

변하지 않는 것:

```text
activeGlobalModule
activeScope.type
activeScope.id
activeSpace ancestry
Sidebar active Project
```

---

# 1.13 Board

## 결정

현재 Global Navigation에 존재하는 `보드` 항목은 제거한다.

Board는 Project View다.

## Before

```text
오늘
캘린더
공간
보드
집중
```

## After

```text
Global Rail
- Tasks
- Calendar
- Focus

Project Header
- Overview
- List
- Board
- Gantt
- Calendar
```

## 금지

`Board` 클릭으로 전체 Project가 사라지고 모든 Project의 Board를 통합해서 보여주는 전역 Board는 현재 범위에 포함하지 않는다.

향후 Global Board가 필요할 경우 별도 Module로 설계하며 기존 Project Board와 개념을 분리한다.

---

# 1.14 Gantt

Gantt는 Project View다.

- Global Rail 배치 금지
- Project Scope 유지
- Project Header 또는 View Switcher에서 선택

---

# 1.15 Calendar

FocusFlow에는 서로 다른 2종의 Calendar가 존재한다.

## A. Global Calendar

Global Rail에 존재.

Scope:

```text
all relevant tasks/events
```

목적:

- 일간/주간/월간 시간축 탐색
- 프로젝트를 가로지르는 일정 확인

## B. Project Calendar

Project View에 존재.

Scope:

```text
projectId = currentProjectId
```

목적:

- 현재 Project Task의 일정 시각화

## 상태 규칙

둘은 이름은 같을 수 있지만 navigation level이 다르다.

```text
Global Calendar
→ activeGlobalModule = "calendar"

Project Calendar
→ activeGlobalModule = "tasks"
→ activeScope = project
→ activeView = "calendar"
```

---

# 1.16 Goals

## 결정

P0에서 Goals는 **Space View**로 취급한다.

```text
Space
├ Overview
├ Projects
├ Goals
└ Horizons
```

## 이유

Goals는 단일 Task 표현 방식이라기보다 Space 내 여러 Project를 포괄할 수 있는 상위 관리 정보다.

## Project-level Goals

현재 P0 IA에서는 별도 Project Goals 탭을 만들지 않는다.

필요 시 Project 화면 내부 section 또는 future feature로 추가한다.

---

# 1.17 Horizons

## 결정

P0에서 Horizons는 **Space View**로 취급한다.

```text
Space
├ Overview
├ Projects
├ Goals
└ Horizons
```

## 이유

Horizons는 개별 Project 작업 표시 방식보다 장기 방향성/범위를 보여주는 상위 개념에 가깝다.

## 금지

- Global Rail에 Horizons 아이콘 추가
- Project View와 Space View에 동일 Horizons를 중복 생성

---

# 1.18 Focus

`집중`은 Global Module로 유지한다.

## 이유

Focus는 특정 Project를 탐색하는 View가 아니라 앱 전체의 실행 모드다.

## 동작

```text
User clicks Focus
→ activeGlobalModule = "focus"
→ Focus module render
```

현재 집중 대상 Task가 특정 Project에 속할 수 있지만 이는 context 정보일 뿐 navigation hierarchy가 아니다.

---

# 1.19 Archive

## 결정

현재 Global Sidebar에 있는 `보관함`은 Global Rail에서 제거한다.

Tasks Context Sidebar 하단으로 이동한다.

## 분류

Archive는 Tasks 내부 특별 Scope다.

```text
activeGlobalModule = "tasks"
activeScope.type = "archive"
```

## P0

보관함은 단일 entry로 제공한다.

```text
보관함
```

향후 필요 시:

```text
보관된 공간
보관된 프로젝트
완료된 작업
```

등으로 확장할 수 있으나 현재 구현 범위에는 포함하지 않는다.

---

# 1.20 Search

Search는 Global Utility다.

## 변경

기존 상시 노출 검색창:

```text
[ 전체 검색 / ]
```

을 제거한다.

Global Rail에 Search icon만 남긴다.

## 검색 Scope

검색 대상은 Tasks Sidebar에 한정하지 않는다.

최소 검색 대상:

- Task
- Space
- Project

추후:

- Goal
- Horizon

따라서 Search를 Tasks Sidebar 내부 input으로 구현하지 않는다.

구체 UX는 §9에서 정의한다.

---

# 1.21 Settings

Settings는 Global Utility다.

## 배치

Global Rail 최하단 고정.

## 이유

설정은 Tasks / Calendar / Focus와 같은 작업 컨텍스트가 아니다.

---

# 1.22 Account

현재 아래 UI는 제거한다.

```text
M  minjun3164@gmail.com
```

Rail에는 Avatar만 표시한다.

```text
[M]
```

Account click 시 상세 정보는 Popover/Menu로 제공한다.

P0에서 Sidebar에 이메일을 상시 노출하지 않는다.

---

# 1.23 Navigation State Model

UI 구현 시 최소한 아래 상태를 논리적으로 분리한다.

```ts
type GlobalModule =
  | "tasks"
  | "calendar"
  | "focus"
  | "settings";

type GlobalOverlay =
  | "search"
  | "account"
  | null;

type Scope =
  | { type: "smart"; id: "today" | "upcoming" }
  | { type: "space"; id: string }
  | { type: "project"; id: string }
  | { type: "archive" };

type SpaceView =
  | "overview"
  | "projects"
  | "goals"
  | "horizons";

type ProjectView =
  | "overview"
  | "list"
  | "board"
  | "gantt"
  | "calendar";
```

구현 세부 naming은 기존 코드 convention에 맞춰 변경 가능하지만 개념 분리는 유지한다.

---

# 1.24 State Invariants

다음 조건은 항상 참이어야 한다.

## INV-01

`activeGlobalModule !== "tasks"`인 경우 Tasks Sidebar의 active row는 화면의 현재 navigation target으로 취급하지 않는다.

단, 마지막 Tasks state를 메모리에서 보존하는 것은 허용한다.

## INV-02

`activeScope.type === "project"`이면 해당 Project의 parent Space는 Sidebar에서 식별 가능해야 한다.

## INV-03

Project View 전환은 `activeScope`를 변경하지 않는다.

## INV-04

Space View 전환은 `activeScope`를 변경하지 않는다.

## INV-05

Global Calendar와 Project Calendar는 동일 상태 값으로 표현하지 않는다.

## INV-06

동시에 2개 이상의 Project row가 active 상태일 수 없다.

## INV-07

Today와 Project가 동시에 active 스타일을 가질 수 없다.

## INV-08

Board를 Global Module로 저장하지 않는다.

---

# 1.25 Existing → New IA Mapping

| 기존 UI | 신규 위치 | 처리 |
|---|---|---|
| FocusFlow 텍스트 로고 | Global Rail | icon만 유지 |
| `<<` sidebar collapse | 추후 §10 | 현재 위치 제거 예정 |
| `M + 이메일` | Global Rail Account | Avatar만 |
| 전체 검색 input | Global Rail Search | input 제거 |
| 오늘 | Tasks Sidebar | Smart View |
| 캘린더 | Global Rail | Global Module |
| 공간 label | Tasks Sidebar | Section |
| My Space | Tasks Sidebar | Space Entity |
| fNIRS 졸업 논문 | Tasks Sidebar | Project Entity |
| + 프로젝트 | Space Tree | Create Action |
| + 공간 | Spaces Section | Create Action |
| 보드 | Project View | Global에서 제거 |
| 집중 | Global Rail | 유지 |
| 보관함 | Tasks Sidebar | Global에서 제거 |
| 설정 | Global Rail bottom | 유지 |
| Overview | Space/Project View | 대상별 Registry |
| List | Project View | 유지 |
| Gantt | Project View | 유지 |
| Project Calendar | Project View | 유지 |
| Goals | Space View | 확정 |
| Horizons | Space View | 확정 |

---

# 1.26 Interaction Examples

## Case A — Today → Project

초기:

```text
Tasks active
Today active
```

사용자:

```text
fNIRS 졸업 논문 클릭
```

결과:

```text
Tasks active
Today inactive
fNIRS 졸업 논문 active
Project default view render
```

---

## Case B — Project List → Project Board

초기:

```text
Tasks active
fNIRS 졸업 논문 active
List active
```

사용자:

```text
Board 클릭
```

결과:

```text
Tasks active
fNIRS 졸업 논문 active
Board active
```

Sidebar Project selection은 변하지 않는다.

---

## Case C — Project → Global Calendar

초기:

```text
Tasks active
fNIRS 졸업 논문 active
Board active
```

사용자:

```text
Global Rail Calendar 클릭
```

결과:

```text
Calendar Global Module active
Global Calendar render
```

기존 Project selection은 lastTasksState로 보존 가능하지만 active 표시하지 않는다.

---

## Case D — Calendar → Tasks 복귀

사용자:

```text
Tasks 클릭
```

권장:

마지막 Tasks context를 복원한다.

예:

```text
fNIRS 졸업 논문
Board
```

단, 정확한 restore 정책은 §8에서 확정한다.

---

# 1.27 IA Decision Rules

향후 기능이 추가될 때 아래 질문으로 위치를 결정한다.

## Rule A — Global Module인가?

> 현재 Space/Project를 떠나 앱 전체의 작동 모드를 바꾸는가?

YES → Global Rail 후보.

## Rule B — Scope인가?

> 사용자가 “어떤 데이터 집합/대상”을 보고 있는지를 바꾸는가?

YES → Context Sidebar 후보.

## Rule C — View인가?

> 같은 데이터 대상은 그대로이고 표현 방식만 바뀌는가?

YES → Main View Switcher 후보.

## Rule D — Utility인가?

> 탐색 대상과 직접 관련 없는 계정/설정/검색 보조 기능인가?

YES → Rail utility 영역 또는 overlay 후보.

---

# 1.28 명시적 금지 사항

P0 구현에서 아래 구조를 만들지 않는다.

### 금지 1

```text
Global Rail:
Today / Calendar / Space / Board / Focus
```

### 금지 2

Project를 Global Rail 아이콘으로 표현.

### 금지 3

`Board` 클릭 시 현재 Project active state 해제.

### 금지 4

`Global Calendar`와 `Project Calendar`의 state/route를 동일하게 취급.

### 금지 5

Sidebar Search input을 항상 노출.

### 금지 6

Account email 전체 문자열을 Rail에 상시 노출.

### 금지 7

Space Goals와 Project Goals를 별도 근거 없이 중복 생성.

### 금지 8

Space Horizons와 Project Horizons를 별도 근거 없이 중복 생성.

---

# 1.29 Migration Strategy

현재 Sidebar를 한 번에 삭제하고 새 구조를 붙이는 방식보다 아래 순서를 권장한다.

## Migration M1 — Navigation semantics

기존 메뉴 click handler를 `GlobalModule / Scope / View` 개념으로 먼저 분리한다.

## Migration M2 — Board 이동

현재 Global Board navigation을 Project View navigation으로 이동한다.

## Migration M3 — Archive 이동

Global Archive를 Tasks Context Sidebar로 이동한다.

## Migration M4 — Search 분리

상시 검색 input 제거 전에 Search action 자체를 독립 command/page로 분리한다.

## Migration M5 — Rail UI 적용

기존 full sidebar navigation을 compact Global Rail로 교체한다.

## Migration M6 — Tasks Context Sidebar 적용

Space / Project Tree를 Context Sidebar로 이동한다.

## Migration M7 — legacy route cleanup

기존 `/board` 등의 전역 route가 있다면 redirect 또는 제거 정책을 적용한다.

구체 route는 §8에서 확정한다.

---

# 1.30 Acceptance Criteria

다음 조건을 모두 충족하면 §1 구현을 만족한 것으로 본다.

- [ ] Global Rail에 사용자 Space/Project 이름이 직접 노출되지 않는다.
- [ ] Global Rail에 Today가 존재하지 않는다.
- [ ] Global Rail에 Board가 존재하지 않는다.
- [ ] Global Rail에 Archive가 존재하지 않는다.
- [ ] Tasks 선택 시 Context Sidebar에서 Today / Upcoming / Spaces / Archive를 탐색할 수 있다.
- [ ] Space 클릭 시 Space View로 이동한다.
- [ ] Project 클릭 시 Project View로 이동한다.
- [ ] Board 전환 시 Project active state가 유지된다.
- [ ] Gantt 전환 시 Project active state가 유지된다.
- [ ] Project Calendar 전환 시 Project active state가 유지된다.
- [ ] Global Calendar 클릭 시 Tasks의 Project active 표시가 해제된다.
- [ ] Calendar에서 Tasks로 돌아왔을 때 유효한 Task context를 복원할 수 있는 구조가 존재한다.
- [ ] Goals는 Space View로 존재한다.
- [ ] Horizons는 Space View로 존재한다.
- [ ] Account email은 Rail에서 상시 텍스트로 노출되지 않는다.
- [ ] Search input은 기존 Sidebar 상시 영역에서 제거 가능한 구조다.
- [ ] 하나의 화면에서 active Scope가 2개 이상 표시되지 않는다.

---

# 1.31 완료 결정

## 확정

```text
Global Rail
- Tasks
- Calendar
- Focus
- Search
- Settings
```

```text
Tasks Sidebar
- Today
- Upcoming
- Spaces
- Archive
```

```text
Space Views
- Overview
- Projects
- Goals
- Horizons
```

```text
Project Views
- Overview
- List
- Board
- Gantt
- Calendar
```

## §1에서 더 이상 미결로 남기지 않는 항목

- Today의 위치
- Space의 위치
- Project의 위치
- Board의 위치
- Archive의 위치
- Goals의 기본 Scope
- Horizons의 기본 Scope
- Global Calendar와 Project Calendar의 구분

---

# 2. Global Rail

- 상태: **확정**
- 우선순위: **P0**
- 목적: 기존 텍스트 중심 좌측 사이드바에서 앱 전역 기능만 분리하여 **56px 고정 아이콘 Rail**로 제공한다.
- 핵심 원칙: Rail은 “현재 어떤 앱 모듈을 사용 중인가”만 표현한다. Space / Project / View 상태는 Rail에 표현하지 않는다.

---

# 2.1 설계 목표

Global Rail은 다음 문제를 해결해야 한다.

1. 기존 Sidebar 상단의 로고, 계정 이메일, 검색 input이 차지하는 수평 공간을 제거한다.
2. Today / Space / Project / Board처럼 서로 다른 개념이 같은 navigation level에 존재하는 문제를 제거한다.
3. 전역 기능과 현재 작업 Scope를 시각적으로 분리한다.
4. 사용자가 어떤 Project View에 있더라도 앱 전체 기능으로 즉시 이동할 수 있게 한다.
5. 아이콘만 사용하는 구조에서도 tooltip, focus state, accessible label을 통해 의미를 잃지 않게 한다.
6. Global Rail 자체는 더 이상 접히지 않는 **항상 존재하는 최소 navigation shell**로 사용한다.

---

# 2.2 최종 구조

Desktop/Web P0의 Global Rail은 아래 구조를 사용한다.

```text
┌────────────────────────┐
│        App Mark        │  branding
│                        │
│        Account         │  account utility
│                        │
│        Tasks           │
│        Calendar        │  primary modules
│        Focus           │
│                        │
│                        │
│                        │
│        Search          │  global utility
│        Settings        │  global module / utility
└────────────────────────┘
          56px
```

실제 화면에서는 모든 label을 숨기고 아이콘만 표시한다.

```text
┌──────┐
│  ◈   │
│      │
│  M   │
│      │
│ [✓]  │
│  □   │
│  ◎   │
│      │
│      │
│      │
│  ⌕   │
│  ⚙   │
└──────┘
 56px
```

> 위 ASCII의 기호는 구조 설명용이다. 실제 구현에서 emoji/icon 문자를 사용하지 않는다.

---

# 2.3 Rail Layout Contract

## 2.3.1 Root

```text
width: 56px
min-width: 56px
max-width: 56px
height: 100dvh
box-sizing: border-box

padding-top: 8px
padding-right: 8px
padding-bottom: 8px
padding-left: 8px

display: flex
flex-direction: column
align-items: center

overflow: hidden
flex-shrink: 0
```

## 2.3.2 Divider

Rail과 오른쪽 영역 사이에는 1px divider를 둔다.

```text
border-right-width: 1px
border-right-style: solid
```

색상은 §11 Visual System token에서 정의한다.

Rail 자체에 drop shadow는 사용하지 않는다.

## 2.3.3 Width invariant

아래 상황에서도 Rail width는 변경하지 않는다.

- Tasks Sidebar 표시
- Tasks Sidebar 숨김
- Calendar 진입
- Focus 진입
- Settings 진입
- Search overlay open
- Account popover open
- browser resize
- Project View 변경

즉:

```text
GLOBAL_RAIL_WIDTH = 56
```

은 desktop shell의 invariant다.

---

# 2.4 Vertical Regions

Global Rail 내부는 4개 의미 영역으로 나눈다.

```text
A. Branding
B. Account
C. Primary Navigation
D. Bottom Utilities
```

DOM 구조 권장안:

```tsx
<GlobalRail>
  <RailBrand />

  <RailAccount />

  <RailPrimaryNavigation>
    <RailTasks />
    <RailCalendar />
    <RailFocus />
  </RailPrimaryNavigation>

  <RailSpacer />

  <RailUtilities>
    <RailSearch />
    <RailSettings />
  </RailUtilities>
</GlobalRail>
```

`RailSpacer`는 `flex: 1`을 사용한다.

---

# 2.5 Exact Spacing

## Branding → Account → Navigation

```text
Rail top padding        8px

App Mark slot           40px
gap after App Mark       8px

Account slot            40px
gap after Account       16px

Primary nav item        40px
Primary nav gap          4px
```

## Bottom utilities

```text
Search                  40px
gap                      4px
Settings                40px

Rail bottom padding      8px
```

## Result

Rail의 중간 빈 공간은 고정 px로 계산하지 않는다.

```css
flex: 1;
```

로 bottom utility를 아래쪽에 고정한다.

---

# 2.6 Rail Item Geometry

모든 일반 Rail action은 같은 geometry를 사용한다.

```text
button/link outer size      40 × 40px
icon size                   20 × 20px
border radius               10px
horizontal margin            0
```

Rail root가 좌우 8px padding을 가지므로:

```text
8 + 40 + 8 = 56px
```

이 된다.

## 예외

### App Mark

```text
slot           40 × 40
visible mark   max 28 × 28
```

### Account Avatar

```text
button         40 × 40
avatar         28 × 28
avatar radius  50%
```

이미지가 없는 경우 initials avatar를 사용한다.

---

# 2.7 Icon Rules

## P0 아이콘 의미

| Item | 의미 | 권장 형태 |
|---|---|---|
| Tasks | 작업 관리 | check/list 계열 |
| Calendar | 전역 일정 | calendar 계열 |
| Focus | 집중 실행 | timer/focus 계열 |
| Search | 전체 검색 | search 계열 |
| Settings | 설정 | gear/sliders 계열 |

## 규칙

- 기존 프로젝트에서 사용 중인 icon library가 있다면 그대로 사용한다.
- Rail만을 위해 다른 icon library를 추가하지 않는다.
- outline icon과 filled icon을 무작위로 섞지 않는다.
- 아이콘 자체에 색상으로 Scope/Project 정보를 표현하지 않는다.
- icon stroke/style은 전 항목에서 통일한다.
- 실제 emoji는 사용하지 않는다.
- label text는 Rail 본문에 상시 표시하지 않는다.

색상/stroke의 구체 token은 §11에서 확정한다.

---

# 2.8 Branding Slot

## 목적

앱 identity만 표시한다.

## P0 결정

- FocusFlow 텍스트를 표시하지 않는다.
- App Mark 또는 간단한 monogram만 표시한다.
- App Mark는 navigation item이 아니다.
- active / hover navigation state를 사용하지 않는다.
- P0에서 App Mark 클릭에 기능을 부여하지 않는다.
- pointer cursor를 사용하지 않는다.

## 접근성

장식 요소로만 사용할 경우:

```text
aria-hidden="true"
```

를 사용한다.

앱 이름은 상위 shell landmark 또는 document title에서 제공한다.

---

# 2.9 Account Button

## 표시

Rail에는 아래만 표시한다.

```text
[Avatar]
```

아래는 Rail 본문에 표시하지 않는다.

```text
사용자 이름
이메일 전체 문자열
로그아웃 text
```

## click

Account button 클릭 시 Rail 오른쪽에 account popover를 연다.

```text
globalOverlay = "account"
```

현재 Global Module은 변경하지 않는다.

예:

```text
before:
activeGlobalModule = "tasks"

account click

after:
activeGlobalModule = "tasks"
globalOverlay = "account"
```

## popover 최소 내용

P0 기준:

```text
사용자 identity
- avatar
- display name (존재 시)
- email

────────────

설정
로그아웃
```

기존 제품에서 이미 제공하는 account action이 있다면 해당 action을 유지한다.

새로운 account feature를 Rail 재설계 때문에 추가하지 않는다.

## position

```text
anchor: account button
placement: right-start
offset: 8px
preferred width: 240px
```

viewport 충돌 시 floating UI library의 collision handling을 사용한다.

## close

다음 조건에서 닫는다.

- 외부 클릭
- Escape
- 메뉴 action 실행
- 다른 overlay open
- navigation으로 app shell이 교체됨

## open state

Account popover가 열린 동안 Account button은 `open` visual state를 가진다.

이는 Global Module의 `active`와 별개다.

---

# 2.10 Primary Navigation Group

Primary Navigation은 아래 세 항목만 포함한다.

```text
Tasks
Calendar
Focus
```

Settings는 bottom utility 영역에 배치하지만 route 관점에서는 persistent module로 취급한다.

Search는 persistent module이 아니라 overlay action이다.

---

# 2.11 Tasks Rail Item

## 의미

Task / Space / Project 탐색 모드로 진입한다.

## left click

### 현재 다른 module인 경우

```text
Calendar / Focus / Settings
        ↓
Tasks click
        ↓
restore last valid Tasks location
```

last valid Tasks location이 없으면:

```text
/tasks/today
```

로 이동한다.

## 현재 이미 Tasks인 경우

아무것도 toggle하지 않는다.

즉, active Tasks 버튼을 다시 클릭한다고 Context Sidebar를 접거나 펼치지 않는다.

Sidebar collapse는 §10의 별도 명시적 control로 처리한다.

## middle click / cmd-click

Rail navigation item은 가능하면 실제 anchor semantics를 유지한다.

Tasks의 href는 현재 메모리에 유효한 last Tasks location이 있으면 해당 route를 사용하고, 없으면 `/tasks/today`를 사용한다.

---

# 2.12 Calendar Rail Item

## 역할

앱 전체 범위의 Global Calendar로 이동한다.

## click

```text
activeGlobalModule = "calendar"
contextSidebar = none
route = /calendar
```

## 중요

Project Calendar와 동일한 상태로 취급하지 않는다.

예:

```text
/project/p1/calendar
```

은 Tasks module이 active다.

```text
/calendar
```

은 Calendar module이 active다.

---

# 2.13 Focus Rail Item

## 역할

앱 전체 Focus mode로 이동한다.

## click

```text
activeGlobalModule = "focus"
contextSidebar = none
route = /focus
```

Focus 화면에서도 Global Rail은 계속 표시한다.

P0에서 Focus 진입 시 Rail을 자동으로 숨기는 immersive/fullscreen behavior는 넣지 않는다.

필요 시 향후 Focus feature 내부에서 별도 full-screen command로 추가한다.

---

# 2.14 Search Rail Item

## 분류 수정

Search는 **Global Module이 아니라 Global Overlay Utility**다.

따라서 Search를 눌러도 현재 route와 persistent module을 바꾸지 않는다.

## click

```text
globalOverlay = "search"
```

예:

```text
/tasks/today
→ Search click
→ /tasks/today 유지
→ Search overlay open
```

또는:

```text
/calendar
→ Search click
→ /calendar 유지
→ Search overlay open
```

## Search open state

검색창이 열려 있는 동안 Search button은 `open` 상태를 사용한다.

`activeGlobalModule = "search"` 같은 상태는 만들지 않는다.

## shortcut

P0에서는 기존 UI에서 암시된 `/` shortcut을 유지한다.

```text
/ → Search overlay open
```

단, 아래 focus context에서는 shortcut을 실행하지 않는다.

- input
- textarea
- select
- contenteditable
- rich text editor
- code editor
- IME composition 중

Escape는 Search overlay를 닫고 이전 focus를 복원한다.

검색 자체의 상세 UX는 §9에서 정의한다.

---

# 2.15 Settings Rail Item

## 위치

Rail 최하단.

## click

```text
activeGlobalModule = "settings"
contextSidebar = none
route = /settings
```

Settings에서 별도 left settings navigation이 필요해질 경우 이는 Global Rail이 아니라 Settings Main Content 내부 또는 향후 Context Sidebar variant로 설계한다.

P0에서는 Tasks Sidebar를 Settings 화면에 재사용하지 않는다.

---

# 2.16 Context Sidebar Visibility Contract

Global Rail item에 따라 오른쪽 Context Sidebar 표시 상태는 다음과 같이 고정한다.

| 상태 | Context Sidebar |
|---|---|
| Tasks | Tasks Context Sidebar 표시 |
| Calendar | 없음 |
| Focus | 없음 |
| Settings | 없음 |
| Search open over Tasks | Tasks Sidebar 유지 |
| Search open over Calendar | 없음 |
| Search open over Focus | 없음 |
| Account popover | 기존 상태 유지 |

## 핵심 원칙

Search / Account처럼 overlay인 기능은 아래 underlying layout을 바꾸지 않는다.

Persistent Global Module 전환만 layout slot을 바꾼다.

---

# 2.17 Layout Examples

## Tasks

```text
┌────────┬──────────────────────┬───────────────────────────────┐
│ Rail   │ Tasks Sidebar        │ Main Content                  │
│ 56px   │ §3에서 폭 확정       │                               │
│        │                      │                               │
│ [✓]    │ 오늘                 │ 오늘                          │
│  □     │ 공간                 │                               │
│  ◎     │ ▼ My Space           │                               │
│        │   fNIRS 졸업 논문    │                               │
│  ⌕     │                      │                               │
│  ⚙     │                      │                               │
└────────┴──────────────────────┴───────────────────────────────┘
```

## Calendar

```text
┌────────┬─────────────────────────────────────────────────────┐
│ Rail   │ Global Calendar                                     │
│ 56px   │                                                     │
│  ✓     │                                                     │
│ [□]    │                                                     │
│  ◎     │                                                     │
│        │                                                     │
│  ⌕     │                                                     │
│  ⚙     │                                                     │
└────────┴─────────────────────────────────────────────────────┘
```

## Focus

```text
┌────────┬─────────────────────────────────────────────────────┐
│ Rail   │ Focus                                               │
│ 56px   │                                                     │
│  ✓     │                                                     │
│  □     │                                                     │
│ [◎]    │                                                     │
│        │                                                     │
│  ⌕     │                                                     │
│  ⚙     │                                                     │
└────────┴─────────────────────────────────────────────────────┘
```

## Search over Tasks

```text
┌────────┬──────────────────────┬───────────────────────────────┐
│ Rail   │ Tasks Sidebar        │ Main                          │
│        │                      │                               │
│ [✓]    │ ...                  │        ┌───────────────┐      │
│  □     │                      │        │ Search        │      │
│  ◎     │                      │        │ Overlay       │      │
│        │                      │        └───────────────┘      │
│ [⌕]    │                      │                               │
│  ⚙     │                      │                               │
└────────┴──────────────────────┴───────────────────────────────┘
```

`[⌕]`는 open state이며 module active state를 뜻하지 않는다.

---

# 2.18 Persistent Active State

아래 항목만 persistent `active module` 상태를 가질 수 있다.

```text
Tasks
Calendar
Focus
Settings
```

항상 최대 하나만 active다.

## Search

Search는 `open`, `closed` 상태만 가진다.

## Account

Account는 `open`, `closed` 상태만 가진다.

## App Mark

상태 없음.

---

# 2.19 Active Derivation

가능하면 Rail active state를 별도 mutable boolean로 관리하지 않고 **현재 route에서 derive**한다.

권장 mapping:

```ts
function deriveGlobalModule(pathname: string): GlobalModule | null {
  if (
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/space/") ||
    pathname.startsWith("/project/")
  ) {
    return "tasks";
  }

  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) {
    return "calendar";
  }

  if (pathname === "/focus" || pathname.startsWith("/focus/")) {
    return "focus";
  }

  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings";
  }

  return null;
}
```

실제 route prefix는 기존 router 구조에 맞춰 조정할 수 있다.

중요한 것은 **Project route는 Tasks module로 derive**한다는 점이다.

---

# 2.20 Last Tasks Location

Global Module을 이동해도 마지막 Tasks 위치를 잃지 않는다.

예:

```text
/project/p1/board
→ /calendar
→ Tasks click
→ /project/p1/board
```

## P0 fallback

저장된 last Tasks location이 아래 사유로 invalid하면:

- Project 삭제
- Space 삭제
- Archive 처리로 접근 불가
- permission 없음
- route migration 실패

다음으로 fallback한다.

```text
/tasks/today
```

정확한 persistence 위치(session/local/user preference)는 §8에서 확정한다.

---

# 2.21 Rail Visual States

각 interactive item은 최소 다음 visual state를 지원한다.

```text
default
hover
pressed
active
active + hover
focus-visible
open
open + hover
disabled
```

P0에서 disabled item을 실제로 노출하는 것은 권장하지 않지만 컴포넌트 상태는 지원 가능해야 한다.

---

# 2.22 State Priority

상태가 겹칠 때 아래 우선순위로 표현한다.

```text
disabled
    >
pressed
    >
active/open + hover
    >
active/open
    >
hover
    >
default
```

`focus-visible`은 배경 상태를 대체하지 않고 별도의 focus ring layer로 함께 표시한다.

예:

```text
active + focus-visible
```

은 active background + focus ring을 동시에 사용한다.

---

# 2.23 Hover State

Pointer hover 시:

- item background만 변경
- icon 위치 이동 없음
- icon scale 없음
- label inline reveal 없음
- rail width 변화 없음
- Main Content 이동 없음

즉 hover 때문에 layout shift가 발생하면 안 된다.

---

# 2.24 Pressed State

mouse down / pointer down 순간 짧은 pressed state를 사용한다.

권장:

- background token만 한 단계 강조
- scale animation 사용하지 않음
- translateY 사용하지 않음

Navigation rail에서 버튼이 튀거나 줄어드는 motion은 사용하지 않는다.

---

# 2.25 Active State

Persistent module의 active item은 rounded background로 표시한다.

```text
40 × 40px
radius 10px
```

별도의 3px left indicator bar는 사용하지 않는다.

이유:

- 56px compact rail에서는 bar + icon background를 함께 쓰면 시각적 요소가 과해진다.
- TickTick-like compact rail의 목적은 조용한 강조다.

구체 색상은 §11에서 정의한다.

---

# 2.26 Open State

Search / Account overlay가 열렸을 때 사용하는 temporary state.

시각 강도는 active와 같은 계열을 사용할 수 있으나 semantic은 분리한다.

예:

```ts
data-state="open"
aria-expanded="true"
```

Search button에 `aria-current`를 주지 않는다.

---

# 2.27 Focus-visible

Keyboard navigation 시 반드시 visible focus indicator를 표시한다.

요구사항:

```text
ring width: 2px
ring offset: 2px 또는 컴포넌트 내부에서 충돌하지 않는 값
radius: item radius와 일치
```

구체 색상은 §11.

mouse click 후에는 `:focus-visible` 조건에 맞지 않으면 ring을 표시하지 않아도 된다.

---

# 2.28 Tooltip Contract

아이콘 전용 navigation이므로 tooltip은 P0 필수다.

## labels

```text
Account  → 계정
Tasks    → 작업
Calendar → 캘린더
Focus    → 집중
Search   → 검색
Settings → 설정
```

## position

```text
placement: right
alignment: center
offset: 8px
```

## delay

pointer hover:

```text
show delay: 450ms
hide delay: 0~100ms
```

keyboard focus:

```text
show immediately
```

## Search tooltip

shortcut 표시가 지원되면:

```text
검색    /
```

형태로 secondary shortcut hint를 표시할 수 있다.

## Tooltip rules

- tooltip 때문에 rail width가 늘어나지 않는다.
- portal/floating layer로 표시한다.
- viewport edge collision을 처리한다.
- tooltip 자체를 클릭 target으로 만들지 않는다.
- touch-only 환경에서는 hover tooltip에 의존하지 않는다.
- Account tooltip에 이메일을 노출하지 않는다.

---

# 2.29 Pointer Behavior

## single click

정의된 action 수행.

## double click

별도 action 없음.

두 번째 click을 특별한 collapse/toggle 의미로 해석하지 않는다.

## right click

P0 custom context menu 없음.

브라우저 기본 context behavior를 불필요하게 막지 않는다.

## drag

Rail item drag-and-drop 없음.

---

# 2.30 Link Semantics

Persistent navigation은 가능한 경우 실제 anchor/link semantics를 사용한다.

대상:

- Tasks
- Calendar
- Focus
- Settings

이유:

- browser status/link semantics
- Cmd/Ctrl+click 새 탭
- middle click
- 접근성

Search와 Account는 overlay trigger이므로 button semantics를 사용한다.

---

# 2.31 Keyboard Contract

## Tab

기본 tab sequence:

```text
Account
→ Tasks
→ Calendar
→ Focus
→ Search
→ Settings
→ 다음 app region
```

App Mark는 interactive하지 않으므로 tab stop이 아니다.

## Enter / Space

현재 focus된 button/action 실행.

Link의 경우 browser standard interaction을 유지한다.

## Escape

- Account popover open → close
- Search overlay open → close
- 아무 overlay 없음 → Rail 자체에서는 아무 동작 없음

## `/`

텍스트 입력 context가 아닐 때 Search open.

## Arrow keys

P0에서 Rail을 `menu` widget으로 만들지 않는다.

따라서 강제 roving tabindex / ArrowUp / ArrowDown navigation을 도입하지 않는다.

표준 Tab navigation을 우선한다.

향후 desktop power-user shortcut이 필요하면 별도 shortcut layer에서 추가한다.

---

# 2.32 Focus Restoration

Overlay가 닫히면 원래 trigger로 focus를 복원한다.

예:

```text
Search button
→ Search overlay
→ Escape
→ focus returns to Search button
```

Account도 동일하다.

Route navigation으로 module이 바뀐 경우 이전 rail item으로 강제 focus를 복원하지 않는다.

---

# 2.33 ARIA Contract

권장 구조:

```tsx
<nav aria-label="주요 탐색">
  ...
</nav>
```

Persistent active link:

```text
aria-current="page"
```

Search:

```text
aria-label="검색"
aria-haspopup="dialog"
aria-expanded={searchOpen}
```

Account:

```text
aria-label="계정"
aria-haspopup="menu"
aria-expanded={accountOpen}
```

Settings 등 icon-only item에는 반드시 accessible name을 제공한다.

아이콘 SVG 자체는 duplicate label이 되지 않게:

```text
aria-hidden="true"
```

로 처리한다.

---

# 2.34 Context Sidebar Transition Policy

Global Rail은 Context Sidebar의 상세 애니메이션을 소유하지 않는다.

하지만 visibility 결정은 아래 계약을 전달해야 한다.

```ts
type ContextSidebarMode =
  | "tasks"
  | "none";
```

현재 mapping:

```ts
const contextSidebarModeByModule = {
  tasks: "tasks",
  calendar: "none",
  focus: "none",
  settings: "none",
} as const;
```

Search / Account는 이 값을 변경하지 않는다.

Sidebar animation, resize, overlay behavior는 §3 및 §10에서 상세 정의한다.

---

# 2.35 Module Switch Behavior

## Tasks → Calendar

```text
1. current Tasks route를 lastTasksLocation 후보로 기록
2. route를 /calendar로 이동
3. Rail Calendar active
4. Tasks Context Sidebar 제거
5. Global Calendar render
```

## Calendar → Tasks

```text
1. lastTasksLocation resolve
2. valid하면 해당 route 이동
3. invalid/null이면 /tasks/today
4. Rail Tasks active
5. Tasks Context Sidebar render
```

## Tasks → Focus

Tasks location은 보존하고 Focus로 이동.

## Focus → Calendar

Tasks state에는 영향 없음.

## Settings → Tasks

lastTasksLocation restore.

---

# 2.36 Search / Account Mutual Exclusion

P0에서 Global Overlay는 한 번에 하나만 열 수 있다.

```ts
type GlobalOverlay = "search" | "account" | null;
```

예:

```text
Account open
→ Search shortcut
→ Account close
→ Search open
```

반대도 동일하다.

---

# 2.37 Rail Persistence

Global Rail은 아래 app route에서 항상 유지한다.

- Tasks
- Space
- Project
- Calendar
- Focus
- Settings

다음 route에서는 app shell 밖이므로 표시하지 않아도 된다.

- login
- signup
- password reset
- onboarding full-screen flow
- error document outside authenticated shell

실제 인증 route 이름은 프로젝트 구조에 맞춘다.

---

# 2.38 Rail Collapse Policy

## 결정

**Global Rail 자체는 collapse하지 않는다.**

이유:

1. 56px가 이미 최소 navigation width다.
2. Rail까지 숨기면 사용자가 Global Module을 전환할 고정 기준점을 잃는다.
3. Context Sidebar와 Rail 두 곳에 collapse 기능이 생기면 mental model이 복잡해진다.
4. 현재 화면의 `<<` 기능은 향후 **Context Sidebar collapse**로 역할을 변경하는 것이 더 자연스럽다.

따라서 현재 Sidebar 상단의 `<<` control을 Rail에 그대로 이식하지 않는다.

구체 collapse 버튼 위치는 §10에서 확정한다.

---

# 2.39 Responsive Boundary Contract

정확한 responsive behavior는 §12에서 정의한다.

§2에서 확정할 것은 다음뿐이다.

## Desktop/tablet app shell

```text
Rail width = 56px
```

viewport가 좁아져도 Rail 자체를 40px 등으로 축소하지 않는다.

## Narrow viewport

Context Sidebar가 overlay로 바뀌거나 숨겨질 수는 있으나 Rail width는 유지한다.

## Mobile-specific shell

향후 완전한 mobile navigation(bottom navigation 등)이 필요하면 별도 설계한다.

P0 Desktop/Web Rail을 억지로 bottom bar로 변환하지 않는다.

---

# 2.40 Height Edge Case

일반적인 viewport에서는 Rail 전체 item이 충분히 들어간다.

P0에서는 Rail root를 scroll container로 만들지 않는다.

```text
overflow: hidden
```

을 유지한다.

향후 viewport height가 비정상적으로 작아 모든 action을 표시할 수 없는 경우 §12에서 compact-height policy를 정의한다.

P0에서 임의로 item을 숨기지 않는다.

---

# 2.41 Notification Badge Policy

## P0 결정

Global Rail에 generic count badge를 넣지 않는다.

금지 예:

```text
Tasks  12
Calendar 4
```

아이콘 전용 Rail에 숫자 badge가 과도하게 생기면 시각적 밀도가 다시 올라간다.

향후 실제 unread/attention semantics가 필요한 기능만 별도 badge spec을 만든다.

Project task count 등 Entity 정보는 Context Sidebar 또는 Main Content에서 표시한다.

---

# 2.42 Loading State

Module navigation은 일반적으로 SPA route transition으로 즉시 처리한다.

P0에서 Rail icon 내부에 spinner를 넣지 않는다.

긴 loading이 필요한 경우:

- Rail active state는 destination route 기준으로 전환 가능
- 실제 loading indicator는 Main Content 영역에서 제공

Rail을 loading indicator로 사용하지 않는다.

---

# 2.43 Error State

Destination route load에 실패해도 Rail 자체 layout은 유지한다.

예:

```text
Calendar active
Main Content → error state
```

오류 때문에 Rail을 숨기거나 width를 바꾸지 않는다.

Route 자체가 invalid한 404인 경우 active module을 derive할 수 없다면 모든 persistent item이 inactive일 수 있다.

---

# 2.44 Recommended Component Contract

실제 파일명은 기존 codebase convention에 맞춘다.

권장 책임 분리는 아래와 같다.

```text
GlobalRail
├ RailBrand
├ RailAccountButton
├ RailNavLink
├ RailSearchButton
└ RailTooltip
```

## RailNavLink conceptual props

```ts
type RailNavLinkProps = {
  label: string;
  icon: ReactNode;
  href: string;
  active: boolean;
  onNavigate?: () => void;
};
```

## RailActionButton conceptual props

```ts
type RailActionButtonProps = {
  label: string;
  icon: ReactNode;
  open?: boolean;
  shortcut?: string;
  onClick: () => void;
  ariaHasPopup?: "dialog" | "menu";
};
```

중복되는 hover/active/focus style을 각 button에서 개별 구현하지 않는다.

공통 primitive를 사용한다.

---

# 2.45 Recommended Shell Contract

Global Rail과 Context Sidebar/Main layout 사이의 책임은 아래처럼 분리한다.

```tsx
<AppShell>
  <GlobalRail />

  <ContextSidebarSlot mode={contextSidebarMode} />

  <MainContent />
</AppShell>
```

Global Rail 컴포넌트가 Tasks Tree를 직접 렌더하지 않는다.

Global Rail 컴포넌트가 Main Content를 직접 조건부 렌더하지 않는다.

Rail은 navigation event / route와 현재 module 상태만 다룬다.

---

# 2.46 State Ownership

권장:

```text
Router
 └ persistent module / scope / view

App shell UI state
 └ globalOverlay
 └ lastTasksLocation cache

Context Sidebar state
 └ expanded spaces
 └ width
 └ collapsed

Search state
 └ query
 └ selected result
```

Rail component local state로 다음을 저장하지 않는다.

```text
current Project
current Board/List/Gantt
expanded Space
Sidebar width
search query
```

---

# 2.47 Route-to-Rail Test Matrix

| Route example | Active Rail | Context Sidebar |
|---|---|---|
| `/tasks/today` | Tasks | Tasks |
| `/tasks/upcoming` | Tasks | Tasks |
| `/tasks/archive` | Tasks | Tasks |
| `/space/s1` | Tasks | Tasks |
| `/space/s1/goals` | Tasks | Tasks |
| `/space/s1/horizons` | Tasks | Tasks |
| `/project/p1/list` | Tasks | Tasks |
| `/project/p1/board` | Tasks | Tasks |
| `/project/p1/gantt` | Tasks | Tasks |
| `/project/p1/calendar` | Tasks | Tasks |
| `/calendar` | Calendar | None |
| `/focus` | Focus | None |
| `/settings` | Settings | None |

실제 route schema 확정 전에도 이 semantic mapping은 유지한다.

---

# 2.48 Interaction Test Cases

## RAIL-01 Tasks restore

```text
Given user is at /project/p1/board
When user opens Calendar
And clicks Tasks
Then /project/p1/board is restored
```

## RAIL-02 Search does not navigate

```text
Given user is at /project/p1/gantt
When Search is opened
Then pathname remains /project/p1/gantt
And Tasks remains persistent active module
```

## RAIL-03 Account does not navigate

```text
Given Calendar is active
When Account popover opens
Then Calendar remains active
```

## RAIL-04 Project Calendar

```text
Given /project/p1/calendar
Then Tasks is active
And Calendar Rail item is not active
```

## RAIL-05 Global Calendar

```text
Given /calendar
Then Calendar is active
And Tasks is inactive
```

## RAIL-06 Active Tasks re-click

```text
Given Tasks is active
When Tasks icon is clicked again
Then Context Sidebar does not toggle
```

## RAIL-07 Escape Search

```text
Given Search was opened from Search rail button
When user presses Escape
Then Search closes
And focus returns to Search rail button
```

---

# 2.49 Visual Token Interface

실제 색상은 §11에서 정의하지만 Global Rail 구현은 아래 token interface를 사용하도록 한다.

```css
--rail-width: 56px;

--rail-padding-x: 8px;
--rail-padding-y: 8px;

--rail-item-size: 40px;
--rail-icon-size: 20px;
--rail-avatar-size: 28px;
--rail-mark-size: 28px;

--rail-item-radius: 10px;
--rail-item-gap: 4px;
--rail-section-gap: 16px;

--rail-tooltip-gap: 8px;
--rail-divider-width: 1px;

--rail-bg: ...;
--rail-divider: ...;

--rail-icon: ...;
--rail-icon-hover: ...;
--rail-icon-active: ...;

--rail-item-hover-bg: ...;
--rail-item-active-bg: ...;
--rail-item-active-hover-bg: ...;
--rail-item-open-bg: ...;

--rail-focus-ring: ...;
--rail-disabled-opacity: ...;
```

컴포넌트 내부에 임의 hex color를 직접 넣지 않는다.

---

# 2.50 CSS Layout Reference

구조 예시:

```css
.globalRail {
  width: var(--rail-width);
  min-width: var(--rail-width);
  max-width: var(--rail-width);
  height: 100dvh;

  box-sizing: border-box;
  padding:
    var(--rail-padding-y)
    var(--rail-padding-x);

  display: flex;
  flex-direction: column;
  align-items: center;

  flex-shrink: 0;
  overflow: hidden;

  background: var(--rail-bg);
  border-right:
    var(--rail-divider-width)
    solid
    var(--rail-divider);
}

.railPrimary {
  display: flex;
  flex-direction: column;
  gap: var(--rail-item-gap);
}

.railSpacer {
  flex: 1;
  min-height: 8px;
}

.railUtilities {
  display: flex;
  flex-direction: column;
  gap: var(--rail-item-gap);
}
```

이는 구조 reference이며 실제 class naming은 codebase convention에 맞춘다.

---

# 2.51 Rail Item CSS Reference

```css
.railItem {
  width: var(--rail-item-size);
  height: var(--rail-item-size);

  display: grid;
  place-items: center;

  border: 0;
  border-radius: var(--rail-item-radius);

  background: transparent;
  color: var(--rail-icon);

  cursor: pointer;
}

.railItem:hover {
  background: var(--rail-item-hover-bg);
  color: var(--rail-icon-hover);
}

.railItem[data-active="true"] {
  background: var(--rail-item-active-bg);
  color: var(--rail-icon-active);
}

.railItem[data-active="true"]:hover {
  background: var(--rail-item-active-hover-bg);
}

.railItem[data-state="open"] {
  background: var(--rail-item-open-bg);
}

.railItem:focus-visible {
  outline: 2px solid var(--rail-focus-ring);
  outline-offset: 2px;
}
```

구조 예시일 뿐 §11 token 확정 전 색상을 고정하지 않는다.

---

# 2.52 Migration from Current Sidebar

현재 화면 기준으로 아래 순서로 옮긴다.

## Existing top

```text
FocusFlow
M minjun3164@gmail.com
[전체 검색 /]
```

## New Rail

```text
App Mark
Avatar

...

Search
```

이메일은 Account popover로 이동한다.

상시 검색 input은 제거한다.

## Existing menu

```text
오늘
캘린더
공간 tree
보드
집중
보관함
설정
```

## New split

```text
Rail:
Tasks
Calendar
Focus
Search
Settings

Tasks Context Sidebar:
Today
Upcoming
Spaces tree
Archive

Project View:
Board
```

---

# 2.53 Explicit Non-goals

§2 구현에서 다음을 하지 않는다.

- Tasks Sidebar 내부 tree row 디자인 확정
- Space expand/collapse 세부 구현 확정
- Project DnD 확정
- Search result UI 확정
- Context Sidebar resize handle 확정
- Project Header View Switcher 디자인 확정
- Rail 색상 palette 최종 확정
- mobile bottom navigation 설계
- shortcut 전체 체계 설계

각 항목은 후속 section에서 다룬다.

---

# 2.54 Explicit Prohibitions

## 금지 1 — Rail label 상시 표시

```text
[✓] 작업
[□] 캘린더
```

형태로 다시 폭을 넓히지 않는다.

## 금지 2 — hover expand

아이콘 hover만으로 Rail이 200px 이상 확장되는 interaction을 넣지 않는다.

## 금지 3 — active Tasks click collapse

Tasks 재클릭을 Sidebar collapse shortcut으로 사용하지 않는다.

## 금지 4 — Board icon

Global Rail에 Board icon을 추가하지 않는다.

## 금지 5 — Space icon

현재 IA에서 Space를 Global Module처럼 Rail에 추가하지 않는다.

## 금지 6 — Search route hijack

Search button을 누르는 순간 현재 Project route를 잃게 하지 않는다.

## 금지 7 — duplicate active state

Project Calendar에서 Tasks와 Calendar를 동시에 persistent active로 표시하지 않는다.

## 금지 8 — rail resize

사용자가 Rail width를 drag resize하게 하지 않는다.

## 금지 9 — dynamic rail width

label 길이, locale, active state에 따라 Rail width가 변하지 않는다.

## 금지 10 — hidden settings

Settings를 account popover에만 숨기지 않는다. Rail bottom의 고정 진입점을 유지한다.

---

# 2.55 Performance Requirements

Rail은 앱 shell의 고정 primitive이므로 불필요한 재렌더를 최소화한다.

권장:

- Project task list 변경 때문에 모든 Rail item이 재렌더되지 않게 한다.
- active module derivation은 route-level 값만 구독한다.
- avatar/profile data는 account section에 국소화한다.
- tooltip mount가 대량 layout calculation을 만들지 않게 한다.

정확한 최적화는 기존 상태관리 라이브러리에 맞춘다.

---

# 2.56 Analytics/Event Semantics

제품 analytics를 사용한다면 event 이름은 UI label보다 semantic action에 맞춘다.

예:

```text
global_nav_open_tasks
global_nav_open_calendar
global_nav_open_focus
global_search_open
account_menu_open
global_nav_open_settings
```

Project Board 클릭을 `global_nav_*` 이벤트로 기록하지 않는다.

Analytics가 없는 프로젝트라면 이 항목 때문에 새 SDK를 추가하지 않는다.

---

# 2.57 QA Checklist

- [ ] Rail 실제 width가 모든 app module에서 56px로 유지된다.
- [ ] Rail은 viewport 전체 높이를 차지한다.
- [ ] Rail 오른쪽 divider가 1px로 일관된다.
- [ ] App Mark에 상시 `FocusFlow` text가 붙지 않는다.
- [ ] Account는 Avatar만 상시 표시한다.
- [ ] 이메일은 Account popover 내부에서만 노출된다.
- [ ] Tasks / Calendar / Focus가 main navigation group에 존재한다.
- [ ] Search / Settings가 bottom utility group에 존재한다.
- [ ] Tasks active 시 Tasks Sidebar가 표시된다.
- [ ] Calendar active 시 Tasks Sidebar가 표시되지 않는다.
- [ ] Focus active 시 Tasks Sidebar가 표시되지 않는다.
- [ ] Settings active 시 Tasks Sidebar가 표시되지 않는다.
- [ ] Search open이 Context Sidebar visibility를 바꾸지 않는다.
- [ ] Account open이 Context Sidebar visibility를 바꾸지 않는다.
- [ ] Search open이 route를 바꾸지 않는다.
- [ ] Account open이 route를 바꾸지 않는다.
- [ ] Project Calendar route에서 Tasks icon만 persistent active다.
- [ ] Global Calendar route에서 Calendar icon만 persistent active다.
- [ ] persistent active Rail item은 최대 1개다.
- [ ] Search와 Account는 `open` state로 표현한다.
- [ ] hover 시 Rail width가 변하지 않는다.
- [ ] hover 시 icon 위치가 이동하지 않는다.
- [ ] hover 시 text label이 inline으로 나타나지 않는다.
- [ ] 모든 icon-only action에 tooltip이 존재한다.
- [ ] pointer tooltip은 약 450ms delay 후 표시된다.
- [ ] keyboard focus 시 tooltip을 즉시 확인할 수 있다.
- [ ] 모든 interactive item에 accessible name이 있다.
- [ ] Tab으로 모든 Rail action에 접근할 수 있다.
- [ ] Search overlay Escape 후 Search button으로 focus가 돌아온다.
- [ ] Account popover Escape 후 Account button으로 focus가 돌아온다.
- [ ] `/`가 일반 화면에서 Search를 연다.
- [ ] text input 중 `/` 입력은 Search shortcut으로 가로채지 않는다.
- [ ] Global Rail 자체를 collapse하는 control이 없다.
- [ ] 현재 `<<` button은 Rail로 복제되지 않는다.
- [ ] Rail item에 generic task count badge가 추가되지 않는다.
- [ ] Main Content loading 때문에 Rail에 spinner가 생기지 않는다.
- [ ] Rail의 색상은 raw hex가 아니라 token을 통해 적용 가능하다.

---

# 2.58 Acceptance Criteria

§2는 아래 조건을 모두 충족할 때 완료로 판단한다.

## AC-RAIL-01

Global Rail은 desktop app shell에서 정확히 56px의 고정 width를 가진다.

## AC-RAIL-02

Rail에는 상시 text navigation label이 표시되지 않는다.

## AC-RAIL-03

Persistent navigation은 Tasks / Calendar / Focus / Settings 네 상태 중 하나만 active가 될 수 있다.

## AC-RAIL-04

Search와 Account는 persistent module을 변경하지 않는 overlay action이다.

## AC-RAIL-05

Tasks를 제외한 Calendar / Focus / Settings에서는 Tasks Context Sidebar가 제거된다.

## AC-RAIL-06

Tasks로 돌아오면 마지막 valid Tasks location을 복원할 수 있으며 없으면 Today로 fallback한다.

## AC-RAIL-07

Project의 List / Board / Gantt / Calendar 전환은 Rail active state를 바꾸지 않는다.

## AC-RAIL-08

Global Calendar와 Project Calendar의 Rail active state가 구분된다.

## AC-RAIL-09

Global Rail 자체에는 collapse/resize 기능이 없다.

## AC-RAIL-10

모든 icon-only action은 mouse와 keyboard 양쪽에서 의미를 파악할 수 있다.

## AC-RAIL-11

Search shortcut은 text editing context를 방해하지 않는다.

## AC-RAIL-12

Rail은 route deep link로 진입해도 별도 click 없이 올바른 active module을 derive한다.

---

# 2.59 최종 결정 요약

```text
RAIL WIDTH
56px fixed
```

```text
TOP
App Mark
Account
```

```text
PRIMARY
Tasks
Calendar
Focus
```

```text
BOTTOM
Search
Settings
```

```text
PERSISTENT ACTIVE
Tasks | Calendar | Focus | Settings
```

```text
TEMPORARY OPEN
Search | Account
```

```text
CONTEXT SIDEBAR
Tasks    → Tasks Sidebar
Calendar → None
Focus    → None
Settings → None
```

```text
RAIL COLLAPSE
Not allowed
```

```text
ITEM
40 × 40px
Icon 20px
Radius 10px
```

```text
TOOLTIP
Right / 8px gap / 450ms pointer delay
```

```text
SEARCH
Overlay
Current route preserved
Shortcut "/"
```

---

# 2.60 §2에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- Rail width
- Rail의 상단/중단/하단 구조
- App Mark 위치
- Account 위치 및 상시 노출 정보
- Tasks / Calendar / Focus 순서
- Search / Settings 하단 배치
- Rail item size
- icon size
- radius
- Tasks 이외 module의 Context Sidebar visibility
- Search의 overlay 성격
- Account의 popover 성격
- persistent active와 temporary open의 구분
- Rail collapse 금지
- tooltip 기본 위치와 delay
- `/` Search shortcut
- keyboard 기본 contract
- route 기반 active derivation
- last Tasks location restore 원칙
- generic count badge 미사용

---

# 3. Context Sidebar Frame

- 상태: **확정**
- 우선순위: **P0**
- 적용 대상: 우선 `Tasks` module
- 목적: Global Rail 오른쪽에 붙는 두 번째 패널의 **프레임·폭·resize·collapse·scroll·responsive behavior**를 정의한다.
- 비고: 이 section은 Sidebar 안에 어떤 row가 들어가는지 정의하지 않는다. `Today / Upcoming / Spaces / Archive`의 콘텐츠 구조는 §4에서 정의한다.

---

# 3.1 핵심 결정

P0의 Context Sidebar는 아래 정책으로 확정한다.

```text
Default width     248px
Minimum width     216px
Maximum width     360px

Resizable         Yes
Collapsible       Yes
Default state     Expanded

Persistent mode   >= 1024px viewport
Overlay mode      < 1024px viewport

Rail width        Always 56px
Collapsed width   0px
```

핵심 구조:

```text
Desktop / expanded

┌────────┬────────────────────────┬───────────────────────────────┐
│ Rail   │ Context Sidebar        │ Main                          │
│ 56px   │ 248px default          │ minmax(0, 1fr)                │
└────────┴────────────────────────┴───────────────────────────────┘
```

```text
Desktop / collapsed

┌────────┬────────────────────────────────────────────────────────┐
│ Rail   │ Main                                                   │
│ 56px   │                                                        │
└────────┴────────────────────────────────────────────────────────┘
```

```text
Narrow viewport / overlay

┌────────┬────────────────────────────────────────────────────────┐
│ Rail   │ Main                                                   │
│ 56px   │                                                        │
│        │┌───────────────────────┐                               │
│        ││ Context Sidebar       │  ← overlay                    │
│        ││ 248px remembered      │                               │
│        │└───────────────────────┘                               │
└────────┴────────────────────────────────────────────────────────┘
```

---

# 3.2 역할

Context Sidebar는 다음 책임만 가진다.

1. 현재 Global Module에 필요한 2차 탐색 제공
2. 선택 가능한 Scope / Entity 표시
3. Entity Tree 표시
4. 현재 Scope의 active state 표시
5. Sidebar 자체 collapse / resize 제공
6. Sidebar content의 vertical scroll 제공

Context Sidebar가 담당하지 않는 것:

- Global Module active state
- Main View content
- Project View switcher
- Search overlay
- Account popover
- Main Content scroll
- Project data mutation semantics 자체
- Browser route ownership

---

# 3.3 Context Sidebar Mode

현재 P0에서는 Context Sidebar mode를 아래 두 개로 제한한다.

```ts
type ContextSidebarMode =
  | "tasks"
  | "none";
```

mapping:

```ts
const contextSidebarModeByModule: Record<GlobalModule, ContextSidebarMode> = {
  tasks: "tasks",
  calendar: "none",
  focus: "none",
  settings: "none",
};
```

향후 Calendar sidebar 등이 필요해지면 새로운 mode를 추가할 수 있다.

단, 같은 Sidebar component 안에 `if calendar... if focus...`를 무한히 쌓기보다 mode registry로 확장한다.

---

# 3.4 Layout Ownership

App Shell이 layout을 소유한다.

권장 구조:

```tsx
<AppShell>
  <GlobalRail />

  <ContextSidebarSlot
    mode={contextSidebarMode}
    state={contextSidebarState}
  />

  <MainContentSlot />
</AppShell>
```

Global Rail 안에 Context Sidebar를 nesting하지 않는다.

Main Content 안에 Context Sidebar를 nesting하지 않는다.

세 영역은 App Shell의 sibling layout region으로 둔다.

---

# 3.5 Desktop Shell Grid

persistent mode에서는 CSS Grid 사용을 권장한다.

```css
.appShell {
  display: grid;
  grid-template-columns:
    var(--rail-width)
    var(--context-sidebar-current-width)
    minmax(0, 1fr);

  width: 100%;
  height: 100dvh;
  overflow: hidden;
}
```

expanded:

```text
--context-sidebar-current-width: 248px
```

collapsed / none:

```text
--context-sidebar-current-width: 0px
```

## 필수

Main Content column은 반드시:

```css
minmax(0, 1fr)
```

를 사용한다.

`1fr`만 사용하여 긴 콘텐츠 때문에 전체 shell이 viewport 밖으로 밀려나는 문제를 만들지 않는다.

---

# 3.6 Width Constants

```ts
const CONTEXT_SIDEBAR_DEFAULT_WIDTH = 248;
const CONTEXT_SIDEBAR_MIN_WIDTH = 216;
const CONTEXT_SIDEBAR_MAX_WIDTH = 360;
```

단위:

```text
px
```

## 왜 248px인가

- 56px Rail과 결합했을 때 총 좌측 navigation 영역이 304px로 유지되어 과도하게 넓지 않다.
- 200px 초반보다 Space / Project tree 이름을 읽기 쉽다.
- 현재의 넓은 Sidebar보다 Main Content를 크게 확보한다.
- 8px spacing grid에 맞는다.

---

# 3.7 Width Clamp

user resize 결과는 항상 아래로 clamp한다.

```ts
function clampContextSidebarWidth(width: number) {
  return Math.min(
    CONTEXT_SIDEBAR_MAX_WIDTH,
    Math.max(CONTEXT_SIDEBAR_MIN_WIDTH, width)
  );
}
```

아래는 허용하지 않는다.

```text
< 216px
> 360px
```

## resize past minimum

216px보다 더 왼쪽으로 drag한다고 자동 collapse하지 않는다.

```text
resize != collapse
```

Collapse는 명시적 action으로만 수행한다.

---

# 3.8 Sidebar Root Geometry

expanded persistent sidebar:

```text
height: 100dvh
min-height: 0

display: flex
flex-direction: column

overflow: hidden

background: var(--context-sidebar-bg)
border-right: 1px solid var(--context-sidebar-divider)
```

left border는 사용하지 않는다.

Global Rail이 이미 자신의 right divider를 가진다.

따라서 Rail ↔ Sidebar 경계와 Sidebar ↔ Main 경계가 각각 존재한다.

---

# 3.9 Internal Frame

Context Sidebar 내부는 3영역으로 나눈다.

```text
Header
Body
Footer (optional)
```

구조:

```tsx
<ContextSidebar>
  <ContextSidebarHeader />

  <ContextSidebarBody />

  <ContextSidebarFooter />
</ContextSidebar>
```

Footer가 필요 없는 mode에서는 렌더하지 않는다.

---

# 3.10 Header

## Height

```text
48px
min-height: 48px
max-height: 48px
```

## Padding

```text
left   12px
right   8px
```

## Layout

```text
display: flex
align-items: center
```

left:

```text
title / context label
```

right:

```text
optional actions
collapse button
```

## Example

```text
┌──────────────────────────┐
│ 작업                 ‹   │
├──────────────────────────┤
│                          │
```

`‹`는 설명용이며 실제 아이콘은 기존 icon library의 panel-left-close 계열을 사용한다.

## Title

P0 Tasks mode:

```text
작업
```

을 권장한다.

단, §4에서 TickTick과 더 유사하게 header title을 생략하는 결정을 할 수 있다.

Frame 차원에서는 title slot을 지원해야 한다.

---

# 3.11 Header Divider Policy

P0에서는 Header 아래에 강한 horizontal line을 기본 적용하지 않는다.

```text
header border-bottom: none
```

이유:

- compact sidebar에서 선이 과도하게 많아지는 것을 방지
- Section spacing으로 hierarchy 표현

특정 mode가 divider를 필요로 할 경우 content-level token을 사용한다.

Sidebar ↔ Main vertical divider는 항상 유지한다.

---

# 3.12 Body

Body가 Sidebar vertical scroll의 owner다.

```css
.contextSidebarBody {
  flex: 1 1 auto;
  min-height: 0;

  overflow-y: auto;
  overflow-x: hidden;
}
```

## 핵심 규칙

전체 App Shell 또는 Sidebar root에 vertical scrolling을 주지 않는다.

Header와 optional Footer는 body scroll에 따라 사라지지 않는다.

---

# 3.13 Body Horizontal Overflow

```text
overflow-x: hidden
```

Project 이름이 길어져 Sidebar 전체 폭을 늘리지 않는다.

Tree row의 text는:

```text
white-space: nowrap
overflow: hidden
text-overflow: ellipsis
```

를 사용한다.

구체 row layout은 §5에서 확정한다.

---

# 3.14 Footer

Context Sidebar Footer는 optional slot이다.

P0 Tasks Sidebar에서는 Footer를 **기본 사용하지 않는다.**

예:

```text
Archive
```

를 footer에 고정하지 않는다.

Archive는 §4의 body navigation flow에 둔다.

이유:

- Archive도 Tasks navigation의 일부
- Sidebar item 수가 많아져도 body와 함께 탐색 가능해야 함
- Footer를 utility dumping area로 만들지 않기 위함

향후 필요한 action이 생기면 Footer slot을 사용할 수 있다.

---

# 3.15 Resize Handle

Context Sidebar의 오른쪽 경계 전체를 resize target으로 사용한다.

## Visual

기본 보이는 divider:

```text
1px
```

## Pointer hit target

실제 resize hit area:

```text
6px
```

divider 중심 기준으로 양쪽에 겹쳐 배치할 수 있다.

```text
visual line: 1px
hit area: 6px
cursor: col-resize
```

## hover

hover 시 divider가 약하게 강조될 수 있다.

단:

- Sidebar width 변화 없음
- 별도 drag icon 상시 표시 없음
- Main Content가 shift하지 않음

---

# 3.16 Resize Pointer Interaction

pointer down:

```text
startWidth = currentWidth
startX = pointer.clientX
```

pointer move:

```text
nextWidth = clamp(
  startWidth + pointer.clientX - startX,
  MIN,
  MAX
)
```

pointer up:

```text
persist width
end resize session
```

## Pointer capture

가능하면:

```ts
element.setPointerCapture(pointerId)
```

를 사용한다.

drag 중 pointer가 handle 영역 밖으로 벗어나도 resize가 끊기지 않게 한다.

---

# 3.17 Live Resize

resize 중에는 Main Content가 실시간으로 width를 따라간다.

drag 종료 후 한 번에 jump하지 않는다.

단, 고비용 Main chart/layout이 resize마다 과도하게 재계산되는 경우:

- CSS width 업데이트는 실시간
- expensive measurement는 requestAnimationFrame 또는 debounced observer 사용

을 권장한다.

---

# 3.18 Resize Transition Rule

사용자가 pointer drag 중일 때 width transition을 적용하지 않는다.

```text
resizing = true
→ transition: none
```

drag가 끝난 후 일반 collapse/expand transition을 다시 허용한다.

---

# 3.19 Double-click Resize Handle

resize handle double click:

```text
currentWidth = DEFAULT_WIDTH
```

즉:

```text
248px
```

로 reset한다.

Collapse는 하지 않는다.

---

# 3.20 Keyboard Resize

Resize handle은 keyboard 접근 가능해야 한다.

권장 semantics:

```text
role="separator"
aria-orientation="vertical"
tabIndex={0}
```

추가 ARIA:

```text
aria-valuemin="216"
aria-valuemax="360"
aria-valuenow="<currentWidth>"
```

## key

```text
ArrowLeft   → -16px
ArrowRight  → +16px

Shift + ArrowLeft   → -32px
Shift + ArrowRight  → +32px

Home        → 216px
End         → 360px
```

각 결과는 clamp한다.

---

# 3.21 Resize Persistence

Sidebar width는 사용자 기기 UI preference로 취급한다.

P0 권장 저장:

```text
localStorage
```

예 key:

```text
focusflow.contextSidebar.width
```

실제 namespace convention에 맞게 변경 가능하다.

## 저장 값

```ts
type StoredContextSidebarWidth = number;
```

## invalid stored value

다음이면 무시한다.

- NaN
- string parse 실패
- min보다 작음
- max보다 큼

invalid 값은 clamp하거나 default 248로 복구한다.

## backend sync

P0에서 Sidebar width를 서버 사용자 preference로 동기화하지 않는다.

---

# 3.22 Collapse State

Context Sidebar는 두 가지 visibility 상태를 가진다.

```ts
type ContextSidebarVisibility =
  | "expanded"
  | "collapsed";
```

단, `mode = "none"`은 visibility와 별개다.

예:

```text
Tasks + collapsed
```

과

```text
Calendar + no sidebar mode
```

는 서로 다른 상태다.

---

# 3.23 Collapse Button

expanded Tasks Sidebar header 우측에 collapse button을 둔다.

button:

```text
32 × 32px
icon 18px
radius 8px
```

accessible label:

```text
"사이드바 접기"
```

tooltip:

```text
사이드바 접기
```

## click

```text
visibility = "collapsed"
```

Sidebar width가 min width까지 줄어드는 것이 아니라 최종 layout slot이 0이 된다.

---

# 3.24 Expand Button after Collapse

Sidebar가 collapsed일 때는 기존 collapse button이 존재하지 않으므로 **Main Header의 left utility slot**에 expand action을 표시한다.

개념:

```text
┌────────┬────────────────────────────────────────────┐
│ Rail   │ [☰]  Main Header                           │
│        │                                            │
└────────┴────────────────────────────────────────────┘
```

실제 icon은 `panel-left-open` 계열을 사용한다.

button:

```text
32 × 32px
```

accessible label:

```text
"사이드바 펼치기"
```

## 중요한 ownership

이 버튼은 Main feature의 business action이 아니라 App Shell action이다.

따라서 Main Header가 제공하는:

```tsx
<AppShellSidebarToggleSlot />
```

에 주입하는 구조를 권장한다.

각 페이지가 별도로 구현하지 않는다.

---

# 3.25 Active Tasks Icon Re-click

§2 정책을 유지한다.

```text
Tasks active
+ Tasks rail icon click
≠ Sidebar toggle
```

즉 active Tasks icon 재클릭으로 collapsed Sidebar를 펼치지 않는다.

이유:

- navigation과 panel visibility action을 분리
- pointer 행동 예측 가능성 유지

Sidebar는 dedicated toggle button 또는 shortcut으로만 toggle한다.

---

# 3.26 Collapse Shortcut

P0 keyboard shortcut을 아래로 확정한다.

```text
Ctrl/Cmd + \
```

동작:

```text
if activeGlobalModule === "tasks":
    expanded ↔ collapsed

else:
    no-op
```

## 입력 보호

text editor가 해당 shortcut을 자체적으로 사용하는 경우 충돌 가능성이 있으므로 앱 shortcut registry를 거쳐야 한다.

OS/browser 예약 shortcut과 충돌하면 §12 shortcut audit에서 조정 가능하다.

P0 code에서는 magic key listener를 페이지별로 중복 등록하지 않는다.

---

# 3.27 Collapse Persistence

collapsed / expanded 상태도 local UI preference로 저장한다.

예 key:

```text
focusflow.contextSidebar.collapsed
```

## Tasks → Calendar

Tasks Sidebar가 collapsed였다고 해도 Calendar에서는 mode = none.

## Calendar → Tasks

마지막 collapse state 복원.

예:

```text
Tasks collapsed
→ Calendar
→ Tasks
→ Tasks Sidebar remains collapsed
```

---

# 3.28 Width and Collapse Are Independent

사용자 상태:

```ts
{
  width: 304,
  visibility: "collapsed"
}
```

은 유효하다.

collapsed 상태에서도 마지막 expanded width를 잃지 않는다.

다시 펼치면:

```text
304px
```

로 복원한다.

Collapse 시 width를 0으로 저장하지 않는다.

---

# 3.29 Suggested UI State Model

```ts
type ContextSidebarUIState = {
  width: number;
  visibility: "expanded" | "collapsed";
  isResizing: boolean;
};
```

`mode`는 route/global module에서 derive한다.

```ts
type ContextSidebarRuntime = {
  mode: "tasks" | "none";
  width: number;
  visibility: "expanded" | "collapsed";
  isResizing: boolean;
};
```

---

# 3.30 Effective Width

desktop persistent mode:

```ts
function getEffectiveContextSidebarWidth({
  mode,
  visibility,
  width,
}: ContextSidebarRuntime) {
  if (mode === "none") return 0;
  if (visibility === "collapsed") return 0;
  return width;
}
```

---

# 3.31 Mount Policy

## mode = "none"

Sidebar content는 DOM에서 unmount한다.

이유:

- focusable tree item이 숨은 상태로 남는 문제 방지
- screen reader가 off-screen navigation을 읽는 문제 방지
- 불필요한 tree rendering 방지

## collapsed

P0에서도 content를 visual DOM에서 unmount하는 것을 권장한다.

Sidebar 내부 UI state는 external store에서 보존한다.

예:

- expanded Space ids
- scroll target
- selected scope

이 상태는 Sidebar component local DOM에만 의존하지 않는다.

---

# 3.32 Scroll Position Policy

Tasks Sidebar scroll position은 module 전환 사이에 best-effort로 복원한다.

예:

```text
Tasks sidebar scrollY = 480
→ Calendar
→ Tasks
→ scrollY ≈ 480
```

## 단

현재 active Project가 복원된 scroll 위치 밖에 있고 사용자가 deep link로 직접 진입한 경우:

```text
ensure active row visible
```

가 scroll restore보다 우선한다.

정확한 tree behavior는 §5에서 정의한다.

---

# 3.33 Persistent Mode Breakpoint

viewport width:

```text
>= 1024px
```

에서는 persistent mode를 사용한다.

```text
Rail | Sidebar | Main
```

Sidebar expanded 시 Main Content가 실제로 오른쪽으로 줄어든다.

overlay가 아니다.

---

# 3.34 Overlay Mode Breakpoint

viewport width:

```text
< 1024px
```

에서는 Context Sidebar가 overlay mode로 동작한다.

Base layout:

```text
Rail | Main
```

Sidebar를 열면 Main 위에 겹친다.

```text
Rail | [Sidebar overlay]
     | Main behind
```

## 이유

248px Sidebar를 persistent하게 유지하면 Main Content usable width가 빠르게 줄어들기 때문이다.

---

# 3.35 Overlay Sidebar Width

overlay mode에서는 저장된 width를 그대로 쓰되 clamp한다.

```text
min 216px
max min(360px, viewportWidth - 56px - 24px)
```

즉 rail 오른쪽에서 최소 24px의 viewport 여유를 둔다.

개념:

```ts
overlayWidth = Math.min(
  storedWidth,
  360,
  viewportWidth - 56 - 24
);
```

단, 결과가 216px보다 작아지는 viewport는 §12 mobile shell 범위로 넘어간다.

---

# 3.36 Overlay Open State

overlay mode에서는 `visibility`가 Sidebar overlay open 여부를 결정한다.

```text
expanded  → overlay open
collapsed → overlay closed
```

## 초기 진입

저장 state가 expanded이면 Tasks route 진입 시 overlay를 자동으로 열지 않는다.

narrow viewport에서는 **initial effective state를 closed**로 시작한다.

이유:

- Main Content를 즉시 가리지 않기 위함
- desktop의 persistent preference를 narrow viewport에 강제하지 않기 위함

즉 저장된 desktop collapse state와 narrow runtime open state를 분리한다.

---

# 3.37 Overlay Runtime State

권장:

```ts
type ContextSidebarResponsiveState = {
  desktopVisibility: "expanded" | "collapsed";
  overlayOpen: boolean;
};
```

persistent mode:

```text
use desktopVisibility
```

overlay mode:

```text
use overlayOpen
```

overlay open/close는 desktop collapsed preference를 변경하지 않는다.

---

# 3.38 Overlay Open Trigger

narrow viewport의 Main Header left utility slot에 `사이드바 열기` 버튼을 표시한다.

Tasks가 active일 때만 표시한다.

click:

```text
overlayOpen = true
```

Rail Tasks 재클릭을 overlay trigger로 사용하지 않는다.

---

# 3.39 Overlay Dismissal

overlay Sidebar는 다음 조건에서 닫는다.

- backdrop click
- Escape
- explicit close/collapse button
- Project / Today / Upcoming / Archive navigation 성공
- Global Module 전환
- browser navigation으로 Tasks module을 떠남

## Space expand/collapse

단순 Space tree expand/collapse는 overlay를 닫지 않는다.

---

# 3.40 Overlay Backdrop

overlay mode에서 Sidebar 뒤 Main Content 위에 backdrop을 둔다.

요구:

```text
Rail은 backdrop 위에 남음
Sidebar는 backdrop 위에 남음
Main은 backdrop 아래
```

backdrop click → close.

구체 opacity/color는 §11에서 정의한다.

---

# 3.41 Overlay Layer Order

semantic order:

```text
Main Content
<
Backdrop
<
Context Sidebar Overlay
<
Rail tooltips / popovers
<
Global Search overlay
```

Account popover는 overlay Sidebar보다 위에 표시되어야 한다.

Search는 가장 상위 global dialog layer에 둔다.

실제 z-index 숫자는 design token으로 관리한다.

---

# 3.42 Responsive Transition

viewport가:

```text
1023px → 1024px
```

로 커질 때:

- overlayOpen 상태는 닫는다.
- desktopVisibility를 적용한다.
- stored width를 적용한다.

viewport가:

```text
1024px → 1023px
```

로 줄어들 때:

- persistent Sidebar는 layout에서 제거
- overlayOpen = false
- desktopVisibility 값은 그대로 보존

자동으로 overlay를 열지 않는다.

---

# 3.43 Collapse Animation

persistent expanded ↔ collapsed transition:

```text
duration: 160ms
timing: ease-out 계열
```

width 248 → 0 자체를 직접 transition해도 되지만 content clipping/fade가 어색하지 않아야 한다.

권장:

```text
grid column width transition
+
content opacity 80~120ms
```

## resize

pointer resize 중에는 transition 없음.

## reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  transition: none;
}
```

---

# 3.44 Module Transition

Tasks → Calendar처럼 Sidebar mode가 없어질 때도 collapse animation과 같은 최대 160ms 범위를 사용할 수 있다.

단:

- route 전환보다 Sidebar animation 때문에 interaction이 지연되면 안 됨
- click 즉시 destination navigation 시작
- animation 완료를 기다린 후 route 변경하는 구조 금지

---

# 3.45 Sidebar Background

Rail과 Sidebar는 같은 exact surface token을 공유할 수도 있고 살짝 다른 surface를 사용할 수도 있다.

§3에서는 다음 semantic token만 요구한다.

```css
--context-sidebar-bg
--context-sidebar-divider
--context-sidebar-resize-hover
```

실제 light/dark 값은 §11에서 확정한다.

---

# 3.46 Main Content Boundary

Sidebar 오른쪽 divider가 Main Content와의 유일한 permanent boundary다.

금지:

- divider + shadow 동시 사용
- 2px 이상의 항상 보이는 경계
- resize handle 전체를 진한 색상으로 표시

Hover / dragging 중에만 resize affordance를 강화한다.

---

# 3.47 Sidebar Focus Order

expanded persistent mode:

```text
Rail navigation
→ Sidebar header actions
→ Sidebar body navigation
→ Main Content
```

단, DOM order 자체는:

```text
Rail
Sidebar
Main
```

로 두는 것을 권장한다.

Overlay mode:

- Sidebar가 dialog-like temporary navigation panel로 열렸을 때 focus를 panel 내부로 이동
- Escape / close 후 trigger로 복원

---

# 3.48 Overlay Focus Management

overlay mode에서 Sidebar open:

1. 기존 trigger 기억
2. Sidebar container 또는 첫 navigation item으로 focus 이동
3. Tab focus가 backdrop/Main으로 빠져나가지 않도록 focus trap 또는 inert 처리
4. close 시 trigger로 focus 복원

persistent mode에서는 focus trap을 사용하지 않는다.

---

# 3.49 ARIA — Persistent Sidebar

Context Sidebar는 navigation landmark로 제공한다.

```tsx
<aside>
  <nav aria-label="작업 탐색">
    ...
  </nav>
</aside>
```

Header title이 있다면 `aria-labelledby` 사용 가능.

---

# 3.50 ARIA — Overlay Sidebar

overlay mode에서는 navigation panel을 modal-like surface로 취급한다.

구현 라이브러리에 따라:

```text
role="dialog"
aria-modal="true"
```

안에 nav landmark를 둘 수 있다.

단, native/established Drawer primitive가 있다면 그 접근성 semantics를 우선 사용한다.

---

# 3.51 Resize Handle ARIA

앞서 정의한 값:

```text
role="separator"
aria-orientation="vertical"
aria-valuemin="216"
aria-valuemax="360"
aria-valuenow="<width>"
aria-label="사이드바 너비 조절"
```

---

# 3.52 Collapse Button ARIA

expanded:

```text
aria-label="사이드바 접기"
```

collapsed expand trigger:

```text
aria-label="사이드바 펼치기"
```

`aria-expanded`를 toggle button에 사용할 수 있다.

---

# 3.53 Loading Frame

Sidebar content data가 loading 중이어도 frame geometry는 즉시 확정한다.

즉:

```text
Rail 56px
Sidebar remembered width
Main
```

이 먼저 렌더된다.

Sidebar body에서 skeleton을 보여준다.

## 금지

data load 완료 후 Sidebar가 0 → 248px로 갑자기 나타나는 layout shift.

---

# 3.54 Loading Skeleton Contract

§3에서는 최소 frame만 정의한다.

Tasks Sidebar loading:

```text
Header는 즉시 렌더
Body에 5~8개의 row skeleton
```

Skeleton 때문에 실제 row 높이를 별도 추정해서 layout이 크게 흔들리지 않게 한다.

정확 row height는 §4/§5에서 정의한다.

---

# 3.55 Error Frame

Tasks Sidebar data load 실패:

- Sidebar frame 유지
- width 유지
- Header 유지
- Body에 compact error state 표시
- Main Content route와 별개로 retry 가능

예:

```text
공간을 불러오지 못했습니다.
[다시 시도]
```

Global Rail은 정상 유지한다.

---

# 3.56 Empty Frame

Space가 하나도 없어도 Context Sidebar 자체를 숨기지 않는다.

Tasks Sidebar는 여전히:

```text
Today
Upcoming
Spaces empty state
Archive
```

를 보여준다.

empty data ≠ no Sidebar.

---

# 3.57 Error During Resize Persistence

localStorage 쓰기 실패는 UI interaction을 막지 않는다.

```text
resize works
persistence fails silently or logs diagnostic
```

다음 load에서 default width로 돌아갈 수 있다.

사용자에게 toast를 띄우지 않는다.

Sidebar width persistence는 critical data가 아니다.

---

# 3.58 Invalid Width Recovery

stored width가:

```text
100
9999
NaN
null
```

등이면:

```text
248px
```

default로 복구한다.

viewport overlay mode에서는 runtime clamp를 추가 적용한다.

---

# 3.59 Main Content Min Width

persistent mode에서 Main Content가 지나치게 작아질 수 있으므로 App Shell은 Sidebar max width 360 제한을 지킨다.

P0에서는 Sidebar를 위해 Main Content를 0px까지 압축시키는 것을 허용하지 않는다.

정확한 minimum usable Main width와 mobile shell 전환은 §12에서 검수한다.

---

# 3.60 Touch Resize

touch 환경에서 resize handle drag는 P0 필수 기능이 아니다.

Pointer Events를 사용하여 동작할 수 있으면 허용하되, 작은 6px hit target에 touch resize를 의존하지 않는다.

narrow/touch 환경에서는 기본 width + overlay behavior가 우선이다.

---

# 3.61 Cursor

resize handle:

```text
cursor: col-resize
```

collapse button:

```text
cursor: pointer
```

Sidebar body background 자체는 resize cursor를 사용하지 않는다.

---

# 3.62 Selection Prevention During Resize

resize drag 중 accidental text selection 방지:

```text
document/body user-select: none
```

또는 pointer session scope에서 equivalent 처리.

drag 종료 시 반드시 원복한다.

---

# 3.63 Resize Escape

pointer resize 중 Escape를 누른 경우 권장:

```text
cancel resize
restore startWidth
end resize session
```

필수는 아니지만 구현 가능하면 제공한다.

keyboard separator resize에서는 각 key press가 즉시 commit되므로 Escape rollback이 필요하지 않다.

---

# 3.64 Component Boundary

권장 컴포넌트 분리:

```text
ContextSidebarSlot
├ PersistentContextSidebar
├ OverlayContextSidebar
├ ContextSidebarHeader
├ ContextSidebarBody
├ ContextSidebarResizeHandle
├ ContextSidebarCollapseButton
└ ContextSidebarExpandButton
```

실제로 desktop/overlay wrapper를 하나의 responsive Drawer primitive로 합칠 수 있다.

중요한 것은 콘텐츠 컴포넌트와 frame interaction을 분리하는 것이다.

---

# 3.65 Content Injection Contract

Frame은 content를 직접 알지 않는다.

개념:

```tsx
<ContextSidebarFrame
  title="작업"
  width={width}
  collapsed={collapsed}
  onCollapse={...}
  onResize={...}
>
  <TasksSidebarContent />
</ContextSidebarFrame>
```

향후 다른 mode:

```tsx
<ContextSidebarFrame ...>
  <SomeFutureSidebarContent />
</ContextSidebarFrame>
```

가 가능해야 한다.

---

# 3.66 State Ownership

권장 위치:

```text
AppShell UI store
├ contextSidebarWidth
├ contextSidebarDesktopVisibility
└ contextSidebarOverlayOpen

Tasks navigation store / route
├ active scope
├ expanded space ids
└ tree state
```

Frame component local state로 Space/Project tree expansion을 저장하지 않는다.

---

# 3.67 Persistence Keys

프로젝트가 existing preference abstraction을 갖고 있다면 그 abstraction을 사용한다.

없다면 conceptual keys:

```text
focusflow.ui.contextSidebar.width
focusflow.ui.contextSidebar.collapsed
```

version migration이 필요하면:

```text
focusflow.ui.v1.contextSidebar.width
```

같은 namespace를 사용할 수 있다.

---

# 3.68 Persistence Timing

width:

```text
pointer move마다 localStorage write 금지
```

권장:

- UI width는 실시간 update
- pointerup에서 persistence
- keyboard resize는 debounce 150~300ms

collapse:

```text
state change 직후 persistence
```

---

# 3.69 Sidebar Resize and Browser Zoom

width 저장은 CSS pixel 단위로 한다.

browser zoom이 바뀌어도 stored numeric width 자체를 재계산하지 않는다.

CSS layout engine이 zoom을 처리하도록 둔다.

---

# 3.70 Multi-window Behavior

localStorage 기반 preference는 같은 origin의 다른 창/탭에 공유될 수 있다.

P0에서는 `storage` event를 구독하여 실시간 다른 탭의 Sidebar width를 동기화할 필요 없다.

새로 로드될 때 마지막 저장 값을 읽으면 충분하다.

---

# 3.71 Deep Link Behavior

예:

```text
/project/p1/board
```

로 직접 접속하면:

1. Global Rail Tasks active derive
2. Context Sidebar mode = tasks
3. viewport >= 1024이고 desktopVisibility = expanded면 Sidebar 표시
4. Project p1의 parent Space가 Sidebar tree에서 식별 가능
5. active Project가 보이도록 필요한 expansion/scroll 수행

3~5의 tree 구체 규칙은 §5에서 확정한다.

---

# 3.72 Project Deletion Edge Case

현재 active Project가 삭제되어 fallback route로 이동하더라도 Sidebar frame은 유지한다.

예:

```text
/project/p1
→ p1 delete
→ /space/s1 또는 /tasks/today
```

Sidebar width/collapse 상태는 변하지 않는다.

Scope failure와 UI preference를 연결하지 않는다.

---

# 3.73 Module Switch during Resize

사용자가 resize drag 중 Global Module을 전환하는 edge case에서는:

1. resize session 종료
2. 현재 valid width clamp
3. 필요 시 width persist
4. destination module 전환

pointer capture를 해제한다.

---

# 3.74 Search Open during Resize

resize session 중 Search shortcut이 발생하면:

- resize session 우선 종료
- Search open

동시에 drag와 global overlay가 유지되지 않게 한다.

---

# 3.75 Context Sidebar + Search Overlay

Search overlay가 열린 경우 Sidebar underlying state는 그대로 유지한다.

예:

```text
Tasks
Sidebar width 312
Project p1 active
→ Search
→ close Search
→ 동일 layout/state 복원
```

---

# 3.76 Context Sidebar + Account Popover

Account popover도 Sidebar width/visibility를 변경하지 않는다.

popover는 Rail에 anchor되며 Sidebar 위로 떠도 된다.

---

# 3.77 Context Sidebar + Settings

Settings 진입 시:

```text
mode = none
```

Tasks Sidebar component는 unmount.

하지만 아래 preference는 유지:

```text
width
desktopVisibility
tree expansion state
```

Tasks 복귀 시 복원.

---

# 3.78 Context Sidebar + Focus

Focus 진입 시 mode = none.

P0에서 Focus page가 자체 secondary navigation을 필요로 하더라도 Tasks Sidebar를 재사용하지 않는다.

향후 필요 시 새로운 context mode로 추가한다.

---

# 3.79 Context Sidebar + Global Calendar

Global Calendar 역시 mode = none.

Project Calendar와 혼동하지 않는다.

---

# 3.80 Animation Token Interface

§11에서 실제 easing/token 값을 확정할 수 있도록 다음 interface를 사용한다.

```css
--context-sidebar-collapse-duration: 160ms;
--context-sidebar-collapse-easing: ease-out;

--context-sidebar-resize-handle-width: 6px;
--context-sidebar-divider-width: 1px;
```

raw animation duration을 여러 컴포넌트에 중복 하드코딩하지 않는다.

---

# 3.81 Size Token Interface

```css
--context-sidebar-default-width: 248px;
--context-sidebar-min-width: 216px;
--context-sidebar-max-width: 360px;

--context-sidebar-header-height: 48px;

--context-sidebar-header-padding-left: 12px;
--context-sidebar-header-padding-right: 8px;

--context-sidebar-toggle-size: 32px;
--context-sidebar-toggle-icon-size: 18px;

--context-sidebar-divider-width: 1px;
--context-sidebar-resize-hit-width: 6px;
```

---

# 3.82 Suggested CSS Reference

```css
.contextSidebar {
  height: 100dvh;
  min-height: 0;

  display: flex;
  flex-direction: column;

  overflow: hidden;

  background: var(--context-sidebar-bg);
  border-right:
    var(--context-sidebar-divider-width)
    solid
    var(--context-sidebar-divider);
}

.contextSidebarHeader {
  height: var(--context-sidebar-header-height);
  min-height: var(--context-sidebar-header-height);

  padding-left: var(--context-sidebar-header-padding-left);
  padding-right: var(--context-sidebar-header-padding-right);

  display: flex;
  align-items: center;
}

.contextSidebarBody {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
```

---

# 3.83 Suggested Shell State Example

```ts
type AppShellUIState = {
  contextSidebar: {
    width: number;
    desktopVisibility: "expanded" | "collapsed";
    overlayOpen: boolean;
    isResizing: boolean;
  };
};
```

initializer:

```ts
const initialContextSidebarState = {
  width: readStoredWidthOrDefault(248, 216, 360),
  desktopVisibility: readStoredCollapsed()
    ? "collapsed"
    : "expanded",
  overlayOpen: false,
  isResizing: false,
};
```

---

# 3.84 Route + Viewport Matrix

| Route / Module | >=1024 | <1024 |
|---|---|---|
| Tasks + desktop expanded | persistent Sidebar | closed overlay initially |
| Tasks + desktop collapsed | no Sidebar | closed overlay |
| Calendar | none | none |
| Focus | none | none |
| Settings | none | none |
| Search over Tasks | underlying state 유지 | underlying state 유지 |
| Account over Tasks | underlying state 유지 | underlying state 유지 |

---

# 3.85 Interaction Test Cases

## CS-01 resize

```text
Given Sidebar width = 248
When resize handle is dragged +40px
Then width = 288
And Main Content width decreases by 40px
And Rail remains 56px
```

## CS-02 resize minimum

```text
Given Sidebar width = 248
When handle is dragged far left
Then width stops at 216
And Sidebar does not auto-collapse
```

## CS-03 resize maximum

```text
Given Sidebar width = 248
When handle is dragged far right
Then width stops at 360
```

## CS-04 double click

```text
Given width = 336
When resize handle is double-clicked
Then width = 248
```

## CS-05 collapse preserves width

```text
Given width = 320
When user collapses Sidebar
And expands again
Then width = 320
```

## CS-06 Tasks re-click

```text
Given Tasks active + Sidebar expanded
When Tasks Rail item is clicked again
Then Sidebar remains expanded
```

## CS-07 module switch

```text
Given Tasks Sidebar width = 304
When Calendar is opened
Then Context Sidebar disappears
And Rail remains 56
When Tasks is reopened
Then Sidebar returns at 304
```

## CS-08 narrow viewport

```text
Given viewport = 900
And route is /project/p1
Then Context Sidebar is not persistent
When sidebar-open trigger is clicked
Then Sidebar opens over Main
```

## CS-09 overlay navigation

```text
Given overlay Sidebar is open
When user selects Project p2
Then navigation occurs
And overlay closes
```

## CS-10 overlay tree expand

```text
Given overlay Sidebar is open
When user expands Space s1
Then overlay remains open
```

## CS-11 keyboard resize

```text
Given resize separator focused at width 248
When ArrowRight is pressed
Then width becomes 264
```

## CS-12 keyboard collapse

```text
Given Tasks active
When Cmd/Ctrl+\ is pressed
Then Sidebar visibility toggles
```

---

# 3.86 QA Checklist

- [ ] Context Sidebar default width는 248px이다.
- [ ] 최소 width는 216px이다.
- [ ] 최대 width는 360px이다.
- [ ] Rail width 56px는 Sidebar resize에 영향을 받지 않는다.
- [ ] Main Content는 `minmax(0,1fr)` 또는 equivalent로 overflow 안전하다.
- [ ] Sidebar root가 app vertical scroll owner가 아니다.
- [ ] Sidebar Body만 vertical scroll한다.
- [ ] Header는 Body scroll에 따라 사라지지 않는다.
- [ ] P0 Tasks Sidebar는 fixed Footer를 사용하지 않는다.
- [ ] Sidebar ↔ Main 사이에 1px divider가 있다.
- [ ] resize hit target은 visual divider보다 넓다.
- [ ] resize cursor는 `col-resize`다.
- [ ] drag 중 text selection이 발생하지 않는다.
- [ ] drag 중 width transition이 없다.
- [ ] drag 종료 후 width가 persist된다.
- [ ] localStorage에 pointermove마다 write하지 않는다.
- [ ] resize minimum에서 자동 collapse되지 않는다.
- [ ] resize handle double click 시 248px로 reset된다.
- [ ] keyboard로 resize할 수 있다.
- [ ] collapse 후 expand해도 이전 width가 복원된다.
- [ ] active Tasks Rail item 재클릭이 collapse를 일으키지 않는다.
- [ ] collapse/expand는 dedicated control을 사용한다.
- [ ] desktop collapsed state가 Calendar/Focus 진입으로 소실되지 않는다.
- [ ] mode=none일 때 Sidebar focusable content가 DOM에 남지 않는다.
- [ ] viewport >=1024에서는 persistent layout을 사용한다.
- [ ] viewport <1024에서는 overlay layout을 사용한다.
- [ ] 1024 아래로 내려갈 때 overlay가 자동으로 열린 채 시작하지 않는다.
- [ ] overlay open 시 backdrop이 있다.
- [ ] overlay에서 backdrop click으로 닫힌다.
- [ ] overlay에서 Escape로 닫힌다.
- [ ] overlay에서 Project/Today navigation 후 닫힌다.
- [ ] overlay에서 Space expand만 한 경우 닫히지 않는다.
- [ ] overlay open 시 focus가 Main으로 빠져나가지 않는다.
- [ ] overlay close 후 trigger로 focus가 돌아온다.
- [ ] Search open이 Sidebar width/collapse state를 변경하지 않는다.
- [ ] Account popover가 Sidebar state를 변경하지 않는다.
- [ ] Loading 중에도 Sidebar width가 먼저 확정되어 layout shift가 없다.
- [ ] Sidebar data error가 Rail이나 Main layout을 파괴하지 않는다.
- [ ] Space가 0개여도 Sidebar frame은 유지된다.
- [ ] prefers-reduced-motion에서 collapse animation을 제거할 수 있다.

---

# 3.87 Acceptance Criteria

## AC-CS-01

Tasks module은 desktop에서 `56px Rail + resizable Context Sidebar + Main` 구조를 가진다.

## AC-CS-02

Sidebar width는 216~360px 범위에서 사용자 resize가 가능하고 default는 248px이다.

## AC-CS-03

Resize와 Collapse는 서로 다른 interaction이며 minimum width drag가 auto-collapse를 발생시키지 않는다.

## AC-CS-04

Collapse해도 마지막 expanded width는 유지된다.

## AC-CS-05

Sidebar width와 desktop collapsed state는 page/module 이동 사이에 보존된다.

## AC-CS-06

Calendar / Focus / Settings에서는 Context Sidebar layout slot이 0이 된다.

## AC-CS-07

Context Sidebar가 없어져도 Global Rail은 56px로 유지된다.

## AC-CS-08

Sidebar Body가 자체 vertical scroll owner이며 Header는 고정된다.

## AC-CS-09

viewport <1024px에서 Context Sidebar는 persistent column이 아니라 overlay로 동작한다.

## AC-CS-10

overlay Sidebar는 navigation 완료, backdrop click, Escape로 닫힌다.

## AC-CS-11

Overlay mode의 open/close state는 desktop collapse preference를 덮어쓰지 않는다.

## AC-CS-12

Sidebar frame은 loading / empty / error 상태에서도 동일한 geometry를 유지한다.

## AC-CS-13

resize handle은 mouse/pointer와 keyboard 양쪽에서 조작 가능하다.

## AC-CS-14

Context Sidebar의 frame state와 Tasks Tree의 business/navigation state가 분리되어 있다.

---

# 3.88 최종 결정 요약

```text
DEFAULT WIDTH
248px
```

```text
MIN / MAX
216px / 360px
```

```text
RESIZE
Yes
6px hit area
1px visual divider
Double-click → reset 248
Keyboard → ±16px
```

```text
COLLAPSE
Yes
Explicit button only
Rail Tasks re-click does not toggle
```

```text
PERSISTENCE
Width + desktop collapse state
local UI preference
```

```text
HEADER
48px
```

```text
SCROLL
Body only
```

```text
FOOTER
P0 Tasks = none
```

```text
RESPONSIVE
>=1024 → persistent
<1024  → overlay
```

```text
OVERLAY
Backdrop
Escape close
Navigation close
Tree expand does not close
```

```text
RAIL
Always 56px
```

---

# 3.89 §3에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- Context Sidebar default/min/max width
- resize 허용 여부
- resize hit target
- double-click reset
- keyboard resize
- width persistence 원칙
- collapse 허용 여부
- collapse와 resize의 분리
- collapse state persistence
- active Tasks icon re-click 정책
- Header height
- Body scroll ownership
- P0 Footer 미사용
- persistent/overlay breakpoint
- overlay open/close semantics
- overlay focus behavior
- Sidebar mode가 없는 module의 layout
- loading/empty/error frame 유지 원칙
- Rail과 Sidebar의 독립 width
- responsive 전환 시 desktop preference 보존

---

# 4. Tasks Sidebar

- 상태: **확정**
- 우선순위: **P0**
- 적용 대상: `ContextSidebarMode = "tasks"`
- 목적: Context Sidebar 내부에 들어가는 **Smart View + Space / Project 탐색 + Archive**의 정보 구조, 밀도, 순서, row 규칙, section 규칙을 정의한다.
- 비고: Space / Project의 chevron, DnD, context menu, rename 등 **Tree interaction 자체는 §5**에서 더 상세히 정의한다.

---

# 4.1 핵심 결정

Tasks Sidebar는 아래 구조로 확정한다.

```text
[Header: 작업                         ‹]

오늘
다가오는 일정

공간                              ＋
▼ My Space
   ● fNIRS 졸업 논문
   ● Project B

+ 공간

보관함
```

핵심 정책:

```text
Smart Views        → 상단 고정
Spaces             → 중앙 Tree
Create Space       → Spaces group 내부
Archive            → body 최하단
```

---

# 4.2 Sidebar Information Hierarchy

Tasks Sidebar 안의 정보 우선순위는 다음과 같다.

```text
1. 오늘
2. 다가오는 일정
3. 공간
   3-1. Space
        3-1-1. Project
4. + 공간
5. 보관함
```

## 이유

사용 빈도가 높은 Smart View를 가장 위에 둔다.

사용자가 생성한 Space / Project는 그 아래에서 장기 탐색 구조를 담당한다.

Archive는 자주 쓰는 primary destination이 아니므로 body 하단으로 내려간다.

---

# 4.3 Header Policy

§3에서 정의한 48px Header slot을 실제로 사용한다.

P0에서는 title을 표시한다.

```text
작업
```

## 구조

```text
┌────────────────────────────┐
│ 작업                    ‹  │
└────────────────────────────┘
```

## Header content

left:

```text
작업
```

right:

```text
Context Sidebar collapse button
```

## 금지

Header 안에 다음을 넣지 않는다.

- Search input
- Space create button
- Project create button
- Today count
- Profile / email
- Board / Gantt view switcher

---

# 4.4 Header Typography Interface

실제 font token은 §11에서 확정한다.

semantic 요구사항:

```text
font-size: 14px
font-weight: 600
line-height: 20px
```

Header가 페이지 title처럼 커 보이지 않게 한다.

Tasks Sidebar는 navigation panel이지 main page가 아니다.

---

# 4.5 Body Padding

Tasks Sidebar body 기본 padding:

```text
top: 4px
right: 8px
bottom: 8px
left: 8px
```

row outer width:

```text
sidebar inner width - 16px
```

default width 248px일 때:

```text
248 - 16 = 232px
```

의 row 영역을 갖는다.

---

# 4.6 Navigation Row Base Geometry

Smart View / Archive의 기본 navigation row:

```text
height: 36px
min-height: 36px

border-radius: 8px

padding-left: 8px
padding-right: 8px

display: flex
align-items: center
```

## Icon

```text
18 × 18px
```

## Icon → label gap

```text
8px
```

## Label

```text
single line
min-width: 0
overflow: hidden
text-overflow: ellipsis
white-space: nowrap
```

Space / Project row는 §5의 Tree geometry를 사용하되 **36px vertical rhythm을 기본값으로 맞춘다.**

---

# 4.7 Density Rule

P0 Sidebar는 compact하지만 과도하게 조밀하지 않게 한다.

따라서:

```text
row height 36px
```

보다 작게 내리지 않는다.

금지:

```text
28px / 30px rows
```

이유:

- 클릭 target이 너무 작아짐
- icon-only Rail과 달리 tree navigation은 텍스트 판독이 중요함
- 다단계 Space tree에서 오클릭 가능성이 커짐

---

# 4.8 Smart Views Group

Smart Views는 Header 바로 아래 첫 그룹이다.

P0:

```text
오늘
다가오는 일정
```

이 두 항목만 포함한다.

## 구조

```text
[오늘]
[다가오는 일정]
```

별도의 `스마트 목록` section title은 표시하지 않는다.

이유:

- Today / Upcoming 자체가 충분히 명확함
- 작은 Sidebar에서 불필요한 label depth를 추가하지 않음
- TickTick-like compact hierarchy 유지

---

# 4.9 Today Row

## 표시

```text
icon + "오늘"
```

## icon

calendar-day / sun / today 계열 중 기존 library에서 가장 명확한 것을 사용한다.

## click

§1 정의대로:

```text
activeScope = today
```

## active

Today가 현재 Scope인 경우 selected row style 사용.

## count

P0에서 **오늘의 미완료 Task count를 row 우측에 상시 표시하지 않는다.**

예:

```text
오늘                  12
```

금지.

이유:

- count가 navigation hierarchy보다 시선을 더 끌 수 있음
- Sidebar를 다시 숫자 dashboard로 만들지 않기 위함

향후 count가 필요하면 Smart View metadata spec으로 별도 추가한다.

---

# 4.10 Upcoming Row

표시:

```text
icon + "다가오는 일정"
```

## active

Upcoming Scope일 때 selected.

## count

P0 없음.

---

# 4.11 Smart View Group Bottom Gap

Upcoming row 뒤와 Spaces Section 사이:

```text
12px
```

정확히는:

```text
Smart rows 끝
→ 8~12px visual gap
→ Spaces header
```

P0 token:

```text
12px
```

을 사용한다.

horizontal divider line은 기본 사용하지 않는다.

---

# 4.12 Spaces Section Header

표시:

```text
공간                              +
```

## height

```text
28px
```

## padding

```text
left: 8px
right: 4px
```

## label

semantic:

```text
font-size: 12px
font-weight: 600
line-height: 16px
```

색상은 muted label token 사용.

---

# 4.13 Spaces Section Header Action

Header 우측에 Space 생성 icon button을 둔다.

```text
button: 28 × 28px
icon: 16px
radius: 7px
```

accessible label:

```text
"공간 만들기"
```

tooltip:

```text
공간 만들기
```

## visibility

P0에서는 **항상 표시**한다.

hover 때만 나타나게 하지 않는다.

이유:

- 새 Space 생성 진입점을 숨기지 않음
- 빈 상태에서도 discoverability 유지
- Sidebar 폭이 충분함

---

# 4.14 Section Header Click

`공간` label 자체는 navigation target이 아니다.

click behavior:

```text
none
```

P0에서는 Section label click으로 전체 Space group을 접지 않는다.

Space group 전체 collapse 기능은 제공하지 않는다.

각 Space만 개별 expand/collapse한다.

---

# 4.15 Space Tree Placement

Spaces Section Header 바로 아래 Space Tree를 렌더한다.

```text
공간                             +
▼ My Space
   ● fNIRS 졸업 논문
   ● Project B
▼ Work
   ● Project C
```

Space 간 별도 card/container background를 만들지 않는다.

모든 Space / Project row는 하나의 flat navigation surface 위에서 indentation만으로 hierarchy를 표현한다.

---

# 4.16 Space Tree Group Spacing

각 Space 사이에 큰 margin을 넣지 않는다.

기본:

```text
0px vertical gap between adjacent tree rows
```

row 자체의 36px height + selected/hover background로 리듬을 만든다.

Space 하위 Project 마지막 row와 다음 Space row 사이에도 별도 12px gap을 주지 않는다.

Tree 연속성을 유지한다.

---

# 4.17 Project Creation Entry Placement

`+ 프로젝트`를 각 Space 하위에 **상시 text row로 노출하지 않는다.**

기존 화면:

```text
▼ My Space
   fNIRS 졸업 논문
   + 프로젝트
```

에서 P0 TickTick-style 구조는 다음으로 변경한다.

```text
▼ My Space                         +
   ● fNIRS 졸업 논문
   ● Project B
```

즉 Project 생성은 **해당 Space row의 hover/focus action**으로 이동한다.

구체 hover action과 inline create UX는 §5 / §6에서 정의한다.

## 이유

- 모든 Space마다 `+ 프로젝트` row를 두면 tree가 불필요하게 길어짐
- project가 많아질수록 create row가 navigation item처럼 보임
- TickTick-like list tree는 section/entity row의 trailing action으로 생성 진입점을 두는 편이 더 compact함

---

# 4.18 Empty Space Exception

Space 안에 Project가 0개인 경우에는 discoverability를 위해 body 안에 compact empty action을 허용한다.

예:

```text
▼ My Space
   + 첫 프로젝트 만들기
```

하지만 일반적인 non-empty Space에서는 이 row를 표시하지 않는다.

empty row:

```text
height: 32px
indent: Project level
muted style
```

§6에서 정확한 create behavior를 정의한다.

---

# 4.19 Create Space Secondary Entry

Spaces tree 마지막에는 secondary `+ 공간` text action을 둔다.

```text
+ 공간
```

## 이유

Header의 `+` icon만으로도 생성 가능하지만,
사용자가 tree 끝에서 새 Space를 추가할 때 명시적인 text affordance가 있으면 좋다.

따라서 P0에서는 **두 개의 진입점**을 허용한다.

```text
1. Spaces header "+"
2. Tree bottom "+ 공간"
```

둘은 동일한 create flow를 호출한다.

---

# 4.20 `+ 공간` Row Geometry

```text
height: 32px
border-radius: 8px

padding-left: 8px
padding-right: 8px

icon: 16px
gap: 8px
```

selected navigation state는 가지지 않는다.

상태:

```text
default
hover
pressed
focus-visible
disabled
```

active 없음.

---

# 4.21 `+ 공간` Placement

Space Tree 마지막 row 뒤:

```text
4px
```

gap 후 표시한다.

예:

```text
▼ My Space
   Project A
   Project B

+ 공간
```

큰 horizontal divider를 넣지 않는다.

---

# 4.22 Archive Placement

Archive는 `+ 공간` 뒤, Sidebar body의 마지막 navigation group에 둔다.

기본:

```text
+ 공간

보관함
```

`Archive`를 fixed footer에 두지 않는다.

---

# 4.23 Archive Separation

`+ 공간`과 Archive 사이:

```text
12px
```

Archive 위에 horizontal divider는 기본 사용하지 않는다.

P0는 whitespace로 group을 구분한다.

---

# 4.24 Archive Row

geometry:

```text
36px
icon 18px
radius 8px
```

label:

```text
보관함
```

active:

```text
activeScope.type = "archive"
```

count:

```text
none
```

badge:

```text
none
```

---

# 4.25 Selected Row Style Contract

실제 색은 §11에서 정의한다.

selected row는 다음 semantic layer를 사용한다.

```text
background: sidebar-selected-bg
text: sidebar-selected-text
icon: sidebar-selected-icon
```

## 금지

- 2px 이상의 outline
- 진한 full-width blue bar
- left 3px accent bar + background 중복
- bold 700으로만 selected 표현

selected background 하나를 기본 강조 방식으로 사용한다.

---

# 4.26 Hover Style Contract

hover:

```text
background: sidebar-hover-bg
```

icon/text 위치 변화 없음.

row height 변화 없음.

font weight 변화 없음.

trailing actions만 나타날 수 있다.

---

# 4.27 Active + Hover

selected row hover 시:

```text
selected-hover-bg
```

를 사용할 수 있다.

hover 때문에 selected state가 사라져 보이지 않게 한다.

---

# 4.28 Focus-visible

keyboard focus:

```text
2px focus ring
```

또는 시스템 token 기반 equivalent.

selected 여부와 별개로 visible해야 한다.

---

# 4.29 Trailing Action Region

각 row는 optional trailing action slot을 지원한다.

개념:

```text
[leading] [label................] [trailing]
```

P0 사용:

- Space row: create Project / context menu
- Project row: context menu
- Section header: create Space

Smart View row에는 trailing action 없음.

Archive row에도 P0 trailing action 없음.

---

# 4.30 Trailing Action Visibility

Space / Project row action은:

```text
row hover
row focus-within
context menu open
```

일 때 표시한다.

active row라는 이유만으로 항상 trailing action을 표시하지 않는다.

단, touch-only 환경의 접근성은 §12에서 별도 처리한다.

---

# 4.31 Trailing Action Size

Tree row trailing icon button 기본:

```text
28 × 28px
icon 16px
radius 7px
```

row 36px 안에 수직 중앙 정렬한다.

---

# 4.32 Name Truncation

모든 Space / Project label:

```text
white-space: nowrap
overflow: hidden
text-overflow: ellipsis
min-width: 0
```

tooltip:

이름이 실제로 truncate된 경우에만 full name tooltip을 표시하는 것을 권장한다.

일반 row hover마다 무조건 이름 tooltip을 띄우지 않는다.

---

# 4.33 Long Name Priority

row width가 부족할 때 우선순위:

```text
1. leading icon/chevron 유지
2. trailing action hit target 유지
3. label을 ellipsis
```

trailing action 때문에 icon이나 chevron을 숨기지 않는다.

---

# 4.34 Count / Badge Global Policy

P0 Tasks Sidebar에는 **숫자 count를 기본 표시하지 않는다.**

적용 대상:

- Today
- Upcoming
- Space
- Project
- Archive

## 이유

현재 목표는 navigation density 감소다.

숫자 badge는 사용자에게 action priority를 의미하는 경우만 도입해야 한다.

Task 총 개수 표시를 단순 metadata로 넣지 않는다.

---

# 4.35 Status Dot Policy

P0에서는 Space/Project row 앞에 임의의 status color dot을 자동 추가하지 않는다.

Project의 icon/color system이 이미 제품에 존재한다면 해당 icon primitive를 유지할 수 있다.

새로운 색상 dot system은 이번 Sidebar redesign의 범위가 아니다.

---

# 4.36 Space Icon Policy

Space는 Folder/Workspace 계열 icon을 사용한다.

Project와 visually distinguish해야 한다.

예:

```text
Space   → folder / layers
Project → list / dot / project icon
```

실제 icon은 기존 library를 사용한다.

---

# 4.37 Project Icon Policy

Project icon은 Space icon보다 시각적으로 단순하게 한다.

만약 Project마다 사용자 지정 색상/아이콘이 기존 모델에 존재한다면 이를 사용할 수 있다.

없다면 Sidebar redesign 때문에 custom icon data model을 새로 추가하지 않는다.

---

# 4.38 Chevron Policy

Space expand/collapse chevron은 Space row의 leading 영역에서 사용한다.

Project에는 자식 계층이 없다면 chevron을 표시하지 않는다.

구체 width/interaction은 §5.

---

# 4.39 Smart View Icons vs Entity Icons

사용자는 시각적으로 다음을 구분할 수 있어야 한다.

```text
Today / Upcoming → 기능성 icon
Space            → hierarchy icon + chevron
Project          → entity icon
Archive          → archive icon
```

모든 row를 동일한 circle icon으로 처리하지 않는다.

---

# 4.40 Section Ordering Invariant

순서는 아래와 같이 고정한다.

```text
Smart Views
→ Spaces
→ Create Space
→ Archive
```

사용자가 이 group 자체의 순서를 drag reorder하지 못한다.

Space / Project reorder만 향후 허용한다.

---

# 4.41 Smart View Reorder

P0 불가.

Today / Upcoming 순서는 고정.

---

# 4.42 Archive Reorder

P0 불가.

항상 Tasks body 마지막 group에 위치.

---

# 4.43 Space Reorder

가능 여부와 interaction은 §5에서 정의한다.

§4에서는 Space list가 사용자 정의 순서를 표현할 수 있는 구조여야 한다는 것만 요구한다.

---

# 4.44 Project Reorder

가능 여부와 interaction은 §5.

---

# 4.45 Empty Sidebar — No Spaces

Space가 0개면:

```text
오늘
다가오는 일정

공간                              +

아직 공간이 없습니다.
[공간 만들기]

보관함
```

## empty message

짧게 유지:

```text
아직 공간이 없습니다.
```

## CTA

```text
공간 만들기
```

Header `+`도 그대로 유지한다.

---

# 4.46 Empty Spaces UX

Empty state는 별도 card를 만들지 않는다.

```text
background card 없음
border 없음
illustration 없음
```

작은 navigation Sidebar 안에서 정보 밀도를 과도하게 높이지 않는다.

---

# 4.47 Loading Structure

Tasks Sidebar body loading:

```text
Today row       → 실제 row 즉시 표시 가능
Upcoming row    → 실제 row 즉시 표시 가능

Spaces header   → 즉시 표시

Space tree      → skeleton rows 4~6개

Archive         → 실제 row 즉시 표시 가능
```

Smart View / Archive가 local/static navigation이면 data loading 때문에 숨기지 않는다.

---

# 4.48 Space Tree Loading Skeleton

권장:

```text
4~6 rows
height 36px
```

skeleton width는 서로 다르게 하되 실제 Project 이름처럼 보이는 정도만 사용한다.

animation 색상은 §11.

---

# 4.49 Loading Interaction

Spaces loading 중에도:

- Today 클릭 가능
- Upcoming 클릭 가능
- Archive 클릭 가능
- Space 생성 action 가능 여부는 backend state에 따라 결정

Project tree만 loading disable할 수 있다.

---

# 4.50 Error — Spaces Load Failure

예:

```text
공간                              +

공간을 불러오지 못했습니다.
[다시 시도]

보관함
```

Today / Upcoming / Archive는 정상 유지.

Error message 때문에 Sidebar 전체가 error page가 되지 않는다.

---

# 4.51 Partial Failure

특정 Space Project만 load 실패하면 전체 Spaces section을 error 처리하지 않는다.

해당 Space 하위에 compact error row를 표시할 수 있다.

예:

```text
▼ My Space
   프로젝트를 불러오지 못했습니다.
   다시 시도
```

§5에서 자세히 정의.

---

# 4.52 Navigation Click Contract

## Smart View click

navigate immediately.

## Space click

Space Overview로 navigate.

## Project click

Project default/last View로 navigate.

## Archive click

Archive scope로 navigate.

## Create action click

navigation row selected state를 바꾸지 않고 create flow open.

---

# 4.53 Selected State Source

row selected 여부는 local click state가 아니라 route/scope에서 derive한다.

예:

```ts
todaySelected =
  scope.type === "smart" &&
  scope.id === "today";
```

```ts
spaceSelected =
  scope.type === "space" &&
  scope.id === space.id;
```

```ts
projectSelected =
  scope.type === "project" &&
  scope.id === project.id;
```

```ts
archiveSelected =
  scope.type === "archive";
```

---

# 4.54 Deep Link Active State

deep link:

```text
/project/p1/gantt
```

로 들어와도:

- Tasks Rail active
- p1 Project row selected
- parent Space visible/expanded
- Gantt View active

가 되어야 한다.

§5에서 parent expansion을 정의한다.

---

# 4.55 Selected Space + Project Rule

Project가 selected일 때 parent Space row까지 selected background를 주지 않는다.

즉:

```text
▼ My Space          ← expanded, not selected
   ● Project A      ← selected
```

Space는 ancestry를 나타낼 뿐 active Scope는 Project다.

---

# 4.56 Space View Selected Rule

Space Overview/Goals/Horizons 중 하나를 보고 있을 때:

```text
Space row selected
Project rows unselected
```

Space View 종류는 Sidebar selected state에 추가 표현하지 않는다.

Main View Switcher에서만 표시한다.

---

# 4.57 Keyboard DOM Order

Tab order는 visual order와 동일하게 한다.

```text
Header collapse
Today
Upcoming
Spaces create
Space rows / Project actions
+ 공간
Archive
Main Content
```

다만 Tree 내부 keyboard semantics는 §5에서 별도 설계한다.

---

# 4.58 Tab Stop Density

Tree가 Project 100개일 경우 모든 trailing `...` 버튼을 상시 tab stop으로 만들면 지나치게 많아질 수 있다.

따라서 §5에서:

```text
roving focus
context action exposure
```

정책을 확정한다.

§4에서는 trailing action을 hover/focus-within 기반으로 렌더 가능한 slot으로만 정의한다.

---

# 4.59 Sidebar Body Scroll Behavior

Tasks Sidebar body scroll은 §3 정책을 따른다.

Header는 sticky가 아니라 scroll container 외부에 존재.

Body 내부 group:

```text
Smart Views
Spaces Tree
Create Space
Archive
```

전체가 한 scroll context를 공유한다.

Archive를 화면 하단에 sticky하지 않는다.

---

# 4.60 Archive Reachability with Long Tree

Space / Project가 많으면 Archive는 scroll 후 접근한다.

P0에서는 Archive를 fixed footer로 복제하지 않는다.

중복 진입점보다 navigation hierarchy 일관성을 우선한다.

---

# 4.61 Section Label Stickiness

`공간` section header를 body 상단 sticky로 만들지 않는다.

스크롤하면 함께 올라간다.

이유:

- Sidebar header 자체가 이미 고정됨
- sticky section header가 작은 panel에서 화면을 더 차지함
- tree가 하나의 main group이라 필요성이 낮음

---

# 4.62 Search in Sidebar

P0에서는 Tasks Sidebar 내부 검색 input을 두지 않는다.

Global Search(`/`)를 사용한다.

Space / Project가 많아져 tree filtering이 필요해지면 향후 filter affordance를 별도 설계한다.

---

# 4.63 Favorites / Pinned

P0에서 Favorites / Pinned section을 새로 만들지 않는다.

사용자에게 실제 요구가 확인되기 전에는:

```text
즐겨찾기
최근
고정됨
```

같은 group을 추가하지 않는다.

---

# 4.64 Tags / Filters

TickTick에 존재하더라도 현재 FocusFlow IA에 없는 개념을 단순 모방으로 추가하지 않는다.

P0에서:

- Tags section 없음
- Filters section 없음

필요 시 별도 feature spec.

---

# 4.65 Smart List Expansion

P0 Smart Views:

```text
Today
Upcoming
```

만 구현한다.

`Inbox`, `Tomorrow`, `Next 7 Days` 등을 TickTick과 동일하게 복제하지 않는다.

FocusFlow의 현재 기능과 목적에 필요한 항목만 유지한다.

---

# 4.66 Visual Grouping Rule

Sidebar hierarchy는 아래 세 수단으로만 표현한다.

```text
1. indentation
2. spacing
3. typography / icon semantics
```

과도한:

- 카드
- 테두리 박스
- section background
- 여러 divider

는 사용하지 않는다.

---

# 4.67 Background Rule

Tasks Sidebar Body는 하나의 continuous surface를 유지한다.

Space마다 다른 background block을 만들지 않는다.

selected/hover row만 배경을 가진다.

---

# 4.68 Default Expanded Space Policy

첫 진입에서 모든 Space를 자동 expand하지 않는다.

정책:

```text
1. 현재 active Project의 parent Space → 반드시 expanded
2. 저장된 expanded state → 복원
3. 나머지 Space → 저장값 없으면 collapsed
```

정확한 persistence는 §5.

---

# 4.69 Default View with One Space

Space가 하나만 있더라도 tree hierarchy를 제거하지 않는다.

금지:

```text
공간
Project A
Project B
```

로 Space layer를 자동 생략.

Space가 하나라도 IA를 동일하게 유지한다.

---

# 4.70 Single Project Space

Space 안에 Project가 하나여도 동일하게 표시.

```text
▼ My Space
   Project A
```

Space row를 건너뛰지 않는다.

---

# 4.71 Many Spaces

Space가 많아져도:

- Sidebar width 자동 증가 없음
- section header duplication 없음
- separate horizontal cards 없음

Body scroll을 사용한다.

---

# 4.72 Many Projects

Project가 많아져도:

- `+ 프로젝트` text row를 모든 Space에 반복하지 않음
- tree virtualization 필요 여부는 performance test 후 결정
- P0에서 100~200 row 수준은 정상 DOM으로 처리 가능하되 기존 codebase 성능에 따라 최적화

virtualization을 도입하더라도 keyboard/active-row scroll semantics를 깨지 않는다.

---

# 4.73 Project Name Collision

동일한 이름의 Project가 서로 다른 Space에 존재할 수 있다.

Sidebar는 parent hierarchy로 구분한다.

Project label에 Space 이름을 반복해서 붙이지 않는다.

---

# 4.74 Space Name Collision

동일 Space 이름이 허용되는 데이터 모델이라면 Sidebar에서 자동 rename하지 않는다.

entity id가 navigation identity다.

---

# 4.75 Localization

한국어 기준 label:

```text
작업
오늘
다가오는 일정
공간
공간 만들기
보관함
```

향후 localization에서도 row height나 Sidebar width가 label 길이에 따라 변하지 않는다.

긴 locale에서는 ellipsis 가능.

---

# 4.76 Component Structure

권장:

```text
TasksSidebarContent
├ SmartViewsGroup
│  ├ TodayNavItem
│  └ UpcomingNavItem
│
├ SpacesSection
│  ├ SpacesSectionHeader
│  ├ SpaceTree
│  └ CreateSpaceRow
│
└ ArchiveNavItem
```

---

# 4.77 Shared Primitive

Smart View / Archive는 공통 primitive를 사용한다.

```ts
type SidebarNavItemProps = {
  icon: ReactNode;
  label: string;
  selected: boolean;
  href: string;
  trailing?: ReactNode;
};
```

Space / Project Tree는 §5의 전용 TreeRow primitive를 사용한다.

---

# 4.78 Section Primitive

```ts
type SidebarSectionHeaderProps = {
  label: string;
  action?: ReactNode;
};
```

`공간` label에 click handler를 넣지 않는다.

---

# 4.79 Create Space Primitive

Create Space는 navigation item과 다른 semantic button이다.

```tsx
<button aria-label="공간 만들기">
  ...
</button>
```

route link로 만들지 않는다.

---

# 4.80 Tooltip Policy

다음에는 tooltip 필요:

- icon-only `+ 공간`
- trailing icon action
- truncated entity name

다음에는 tooltip 불필요:

- Today full row
- Upcoming full row
- Archive full row
- non-truncated label

---

# 4.81 Context Menu Entry Visibility

Project / Space context menu entry는 trailing `...`로 제공할 수 있다.

하지만 구체 menu 내용은 §5.

P0에서 Smart View나 Archive에 `...` menu를 추가하지 않는다.

---

# 4.82 Row Pressed / Hover

navigation row 전체가 click target이다.

leading icon만 클릭해 navigation 되는 식으로 target을 좁히지 않는다.

예외:

- Space chevron
- trailing actions

이 두 영역은 별도 interaction을 가질 수 있음.

§5에서 event propagation 정의.

---

# 4.83 Space Label Click vs Chevron

§4 기본 원칙:

```text
Space label click     → Space Overview navigation
Chevron click         → expand/collapse only
```

이 분리를 §5에서 상세 확정한다.

---

# 4.84 Project Row Click

Project row main area click:

```text
navigate to Project
```

Project에 children이 없으므로 expand action 없음.

---

# 4.85 Section Create vs Space Create

Spaces header `+`:

```text
new Space
```

Space row trailing `+`:

```text
new Project inside that Space
```

둘의 icon이 같더라도 tooltip/aria-label은 다르게 한다.

---

# 4.86 Spacing Summary

```text
Body top padding             4px

Nav row                     36px
Nav radius                   8px

Smart rows gap               0px
Smart → Spaces gap          12px

Spaces header               28px

Tree row rhythm             36px
Space-to-Space extra gap     0px

Tree → + Space gap           4px
+ Space row                 32px

+ Space → Archive gap       12px
Archive row                 36px

Body bottom padding          8px
```

---

# 4.87 Size Token Interface

```css
--tasks-sidebar-body-padding-top: 4px;
--tasks-sidebar-body-padding-x: 8px;
--tasks-sidebar-body-padding-bottom: 8px;

--sidebar-nav-row-height: 36px;
--sidebar-nav-row-radius: 8px;
--sidebar-nav-row-padding-x: 8px;
--sidebar-nav-icon-size: 18px;
--sidebar-nav-icon-gap: 8px;

--sidebar-section-header-height: 28px;
--sidebar-section-action-size: 28px;
--sidebar-section-action-icon-size: 16px;

--sidebar-smart-to-section-gap: 12px;

--sidebar-create-row-height: 32px;
--sidebar-create-row-icon-size: 16px;

--sidebar-tree-to-create-gap: 4px;
--sidebar-create-to-archive-gap: 12px;
```

---

# 4.88 Color Token Interface

실제 값은 §11.

```css
--sidebar-nav-text
--sidebar-nav-icon

--sidebar-nav-hover-bg
--sidebar-nav-hover-text

--sidebar-nav-selected-bg
--sidebar-nav-selected-text
--sidebar-nav-selected-icon
--sidebar-nav-selected-hover-bg

--sidebar-section-label
--sidebar-create-text
--sidebar-create-hover-bg

--sidebar-focus-ring
--sidebar-error-text
--sidebar-muted-text
```

---

# 4.89 Route-to-Row Matrix

| Route | Selected row |
|---|---|
| `/tasks/today` | Today |
| `/tasks/upcoming` | Upcoming |
| `/space/s1` | Space s1 |
| `/space/s1/goals` | Space s1 |
| `/space/s1/horizons` | Space s1 |
| `/project/p1/list` | Project p1 |
| `/project/p1/board` | Project p1 |
| `/project/p1/gantt` | Project p1 |
| `/project/p1/calendar` | Project p1 |
| `/tasks/archive` | Archive |

---

# 4.90 Interaction Test Cases

## TS-01 Today

```text
Given Project p1 selected
When Today is clicked
Then Today becomes selected
And Project p1 becomes unselected
```

## TS-02 Project

```text
Given Today selected
When Project p1 is clicked
Then Project p1 becomes selected
And Today becomes unselected
```

## TS-03 Project View

```text
Given Project p1 selected
When Board → Gantt
Then Project p1 remains selected
```

## TS-04 Space View

```text
Given Space s1 selected
When Overview → Goals
Then Space s1 remains selected
```

## TS-05 Create Space

```text
Given Project p1 selected
When Spaces header + is clicked
Then create-space flow opens
And Project p1 remains current selected scope until creation completes
```

## TS-06 Empty space

```text
Given Space s1 has no projects
Then compact "첫 프로젝트 만들기" affordance is visible
```

## TS-07 Non-empty space

```text
Given Space s1 has >=1 project
Then persistent "+ 프로젝트" text row is not rendered
```

## TS-08 Archive

```text
When Archive is clicked
Then Archive becomes selected
And Space/Project selected state clears
```

## TS-09 Long Project name

```text
Given Project name exceeds available width
Then label ellipsizes
And row width remains unchanged
```

## TS-10 Count

```text
Given Today has 18 tasks
Then "18" is not automatically rendered in Sidebar
```

---

# 4.91 QA Checklist

- [ ] Header에 `작업` title이 표시된다.
- [ ] Header 우측에 Sidebar collapse control만 존재한다.
- [ ] Search input이 Header에 없다.
- [ ] Today와 Upcoming은 Sidebar 최상단 Smart View로 존재한다.
- [ ] `Smart Views`라는 별도 section title을 표시하지 않는다.
- [ ] Today/Upcoming row는 36px이다.
- [ ] Smart View row에는 P0 count가 없다.
- [ ] Smart Views와 Spaces 사이에 12px gap이 있다.
- [ ] `공간` section header가 있다.
- [ ] Spaces header는 28px이다.
- [ ] Spaces header `+`는 항상 표시된다.
- [ ] `공간` label 클릭은 navigation을 발생시키지 않는다.
- [ ] Space/Project tree는 card로 감싸지 않는다.
- [ ] 각 Space 사이에 큰 추가 margin이 없다.
- [ ] non-empty Space마다 `+ 프로젝트` text row가 반복되지 않는다.
- [ ] Space row trailing action으로 Project 생성 진입점이 가능하다.
- [ ] empty Space에는 `첫 프로젝트 만들기` compact action을 허용한다.
- [ ] Spaces tree 끝에 `+ 공간` text action이 존재한다.
- [ ] Header `+`와 `+ 공간` row는 동일 create-space flow를 사용한다.
- [ ] `+ 공간`과 Archive 사이에 12px gap이 있다.
- [ ] Archive는 fixed Footer가 아니라 body 마지막 group이다.
- [ ] Archive row는 36px이다.
- [ ] Today/Upcoming/Space/Project/Archive에 generic count badge가 없다.
- [ ] selected row는 하나의 background emphasis를 사용한다.
- [ ] Project selected 시 parent Space까지 selected background가 생기지 않는다.
- [ ] Space View에서는 해당 Space row만 selected다.
- [ ] Project View 변경은 Sidebar Project selection을 유지한다.
- [ ] row hover로 layout shift가 발생하지 않는다.
- [ ] long label은 ellipsis 처리된다.
- [ ] truncated name만 필요 시 tooltip을 제공한다.
- [ ] No Spaces 상태에서도 Today/Upcoming/Archive는 유지된다.
- [ ] Space loading 중에도 Smart View는 사용 가능하다.
- [ ] Spaces error가 전체 Sidebar error로 번지지 않는다.
- [ ] Tags/Filters/Favorites를 이번 redesign 때문에 임의 추가하지 않는다.
- [ ] Space가 하나만 있어도 Space hierarchy를 자동 생략하지 않는다.
- [ ] Sidebar section order는 Smart → Spaces → Create Space → Archive다.
- [ ] Sidebar 내부 background는 continuous surface다.

---

# 4.92 Acceptance Criteria

## AC-TS-01

Tasks Sidebar는 Header 아래에 Today / Upcoming / Spaces / Archive가 일관된 순서로 표시된다.

## AC-TS-02

Smart View와 Entity tree는 시각적으로 다른 의미를 가지되 하나의 continuous Sidebar surface 안에서 표현된다.

## AC-TS-03

Today / Upcoming / Archive row의 높이는 36px이며 선택 상태는 route/scope에서 derive된다.

## AC-TS-04

Spaces section은 28px section header와 36px tree rhythm을 사용한다.

## AC-TS-05

Project 생성 진입점은 일반 상태에서 Space row trailing action으로 제공하며 각 Space 하위에 `+ 프로젝트` row를 반복하지 않는다.

## AC-TS-06

Space 생성은 section header icon action과 tree bottom text action 두 진입점에서 동일 flow를 호출한다.

## AC-TS-07

Archive는 Sidebar body 마지막 group이며 fixed Footer가 아니다.

## AC-TS-08

P0 Sidebar에는 navigation row generic count badge가 존재하지 않는다.

## AC-TS-09

Project View가 바뀌어도 해당 Project row의 selected state가 유지된다.

## AC-TS-10

Space / Project 이름이 길어도 Sidebar 폭 또는 action geometry를 변경하지 않고 ellipsis 처리된다.

## AC-TS-11

Space가 0개이거나 load/error 상태여도 Sidebar의 Smart View와 Archive navigation은 유지된다.

## AC-TS-12

Sidebar에 TickTick의 Tags/Filters 등 FocusFlow에 존재하지 않는 IA를 모방 목적으로 추가하지 않는다.

---

# 4.93 최종 결정 요약

```text
HEADER
48px frame
Title = "작업"
Collapse control only
```

```text
SMART VIEWS
Today
Upcoming
No section label
36px rows
No counts
```

```text
SPACES HEADER
28px
Label "공간"
Always-visible + Space button
```

```text
TREE
36px rhythm
Continuous surface
No cards
No extra per-Space spacing
```

```text
PROJECT CREATE
Space row trailing +
No repeated "+ 프로젝트" row
Exception: empty Space
```

```text
SPACE CREATE
Header +
+
Tree bottom "+ 공간"
```

```text
ARCHIVE
Body bottom
36px
Not fixed footer
```

```text
BADGES
None in P0
```

```text
LONG NAMES
Ellipsis
No width growth
```

---

# 4.94 §4에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- Tasks Sidebar Header title 표시 여부
- Smart View 종류
- Smart View 순서
- Smart View row 높이
- count badge 미사용
- Spaces section 위치
- Spaces section header height
- section create button 상시 노출
- Space Tree continuous surface
- Project create entry 기본 위치
- empty Space 예외
- secondary `+ 공간` row 유지
- Archive 위치
- Archive fixed footer 미사용
- group spacing
- long-name truncation
- selected state source
- Smart View / Entity / Archive의 순서
- Tags / Filters / Favorites 미추가

---

# 5. Space / Project Tree

- 상태: **확정**
- 우선순위: **P0**
- 적용 대상: `Tasks Sidebar > Spaces`
- 목적: Space / Project hierarchy의 **row geometry, expand/collapse, selection, hover actions, context menu, rename, archive/delete, DnD, keyboard navigation, persistence, active-row reveal**을 개발자가 추가 추측 없이 구현할 수 있도록 정의한다.
- 선행: §4 Tasks Sidebar
- 후속: §6 Create UX

---

# 5.1 핵심 결정

Space / Project Tree는 아래 구조를 사용한다.

```text
공간                                      +

▼  My Space                         +   ···
   ●  fNIRS 졸업 논문                    ···
   ●  Project B                          ···

▶  Work                             +   ···

+ 공간
```

핵심 정책:

```text
Space label click      → Space Overview
Space chevron click    → expand/collapse only

Project row click      → Project navigation

Space trailing +       → Project creation
Space trailing ···     → Space context menu
Project trailing ···   → Project context menu

Project selected       → parent Space is expanded, not selected

Expanded state         → persisted
Active parent          → auto-expand
```

---

# 5.2 Hierarchy Scope

P0 Sidebar hierarchy는 정확히 2단계다.

```text
Space
└ Project
```

P0에서 Sidebar Tree에 다음 hierarchy를 추가하지 않는다.

- Subspace
- Folder
- Subfolder
- Section
- Task
- Subtask

Project 내부 Task hierarchy는 Main View에서 처리한다.

---

# 5.3 Tree Container

Space Tree는 별도 card가 아닌 하나의 navigation tree surface다.

권장 structure:

```tsx
<SpaceTree aria-label="공간과 프로젝트">
  <SpaceTreeItem />
  <SpaceTreeItem />
  ...
</SpaceTree>
```

visual:

```text
background: transparent
border: none
```

Space별 wrapper에 visible border/background를 주지 않는다.

---

# 5.4 Base Row Height

Space row:

```text
36px
```

Project row:

```text
36px
```

두 entity row는 동일한 vertical rhythm을 사용한다.

---

# 5.5 Horizontal Geometry — Space Row

default Sidebar inner width가 232px일 때 개념:

```text
┌────────────────────────────────────────┐
│ [chev] [icon] [label............] [+][…]│
└────────────────────────────────────────┘
```

정확한 슬롯:

```text
row height                 36px
row padding-left            4px
row padding-right           4px

chevron slot               24px
space icon slot            20px
gap icon→label              6px

trailing button            28px
trailing gap                0px
```

label 영역은:

```text
flex: 1
min-width: 0
```

로 남는 공간을 사용한다.

---

# 5.6 Horizontal Geometry — Project Row

Project는 Space보다 한 단계 indentation한다.

```text
┌────────────────────────────────────────┐
│        [icon] [label..............] [ …]│
└────────────────────────────────────────┘
```

정확한 기준:

```text
project indentation        24px
project row padding-left    4px
project icon slot          20px
icon→label gap              6px
trailing button            28px
```

Space chevron slot과 동일한 indentation 공간을 Project가 차지한다.

즉 Project label이 Space label보다 명확히 오른쪽에서 시작한다.

---

# 5.7 Tree Indentation Token

```css
--tree-level-indent: 24px;
```

P0 hierarchy가 2단계이므로 level 계산은:

```text
Space   level = 0
Project level = 1
```

이다.

향후 하위 hierarchy를 추가할 경우에도 같은 token을 재사용할 수 있다.

---

# 5.8 Chevron

Space row leading 첫 슬롯에 chevron을 둔다.

size:

```text
button hit area   24 × 28px
icon              14 × 14px
```

visual:

```text
collapsed → right
expanded  → down
```

## animation

```text
rotation duration: 120ms
```

reduced-motion에서는 animation 제거.

---

# 5.9 Chevron Click Contract

Chevron click은 정확히 다음만 수행한다.

```text
expanded ↔ collapsed
```

navigation은 발생시키지 않는다.

event:

```ts
event.preventDefault();
event.stopPropagation();
```

이 필요할 수 있다.

Space label/row click과 interaction이 섞이지 않아야 한다.

---

# 5.10 Space Main Click Area

Chevron 및 trailing action을 제외한 Space row 본문 전체:

```text
Space navigation target
```

클릭 결과:

```text
activeScope = space
activeView = space default/last view
```

P0 default:

```text
Overview
```

---

# 5.11 Space Expand Behavior on Main Click

Space label을 클릭했다고 자동으로 expand/collapse를 toggle하지 않는다.

정책:

```text
Space click
→ navigate
→ expansion state unchanged
```

다만 active Space의 자식 Project를 보여줄 필요가 있다면 route restore 규칙에 따라 expanded 유지 가능하다.

"Space 선택"과 "Space 펼침"을 다른 상태로 취급한다.

---

# 5.12 Project Row Click

Project row main area:

```text
navigate to Project
```

Project는 P0 Sidebar에서 children이 없으므로 chevron 없음.

click:

```text
activeScope.type = "project"
activeScope.id = projectId
```

---

# 5.13 Project Default View

§1 원칙 유지.

P0 fallback:

```text
list
```

last valid Project View 복원이 있다면 §8 정책을 적용한다.

Sidebar 자체는 어떤 Project View가 active인지 추가 아이콘으로 표시하지 않는다.

---

# 5.14 Space Selected State

현재 Scope가 Space일 때:

```text
Space row selected
```

예:

```text
/space/s1
/space/s1/projects
/space/s1/goals
/space/s1/horizons
```

모두 `s1` Space row가 selected.

---

# 5.15 Project Selected State

현재 Scope가 Project일 때:

```text
Project row selected
```

parent Space는:

```text
expanded
not selected
```

---

# 5.16 Parent Auto-expand

Project deep link 또는 navigation 시 parent Space는 반드시 expanded 상태가 된다.

예:

```text
expandedSpaceIds = []
route = /project/p1/gantt
parentSpace(p1) = s1

→ s1 is forced expanded
```

사용자가 p1을 보는 중에는 s1을 collapse하려고 해도 허용할지 결정이 필요하다.

P0 결정:

**허용한다.**

즉 active Project의 parent도 사용자가 수동 collapse할 수 있다.

다만:

- 현재 Project route는 유지
- selected Project row는 숨겨질 수 있음
- Space row는 selected로 바뀌지 않음

다시 다른 route에서 p1이 active restore될 때는 auto-expand 가능하다.

---

# 5.17 Initial Expanded State

Tasks Sidebar mount 시 순서:

```text
1. stored expandedSpaceIds 읽기
2. 존재하지 않는 Space id 제거
3. current active Project의 parent Space 추가
4. render
```

따라서 current active Project는 initial render에서 hidden child가 되지 않는다.

---

# 5.18 Expanded State Persistence

Expanded Space ids를 local UI preference로 저장한다.

권장 conceptual key:

```text
focusflow.ui.spaceTree.expandedSpaceIds
```

type:

```ts
type ExpandedSpaceIds = string[];
```

## server sync

P0에서는 필요 없음.

## invalid ids

존재하지 않는 Space id는 다음 save 시 정리한다.

---

# 5.19 Expand Persistence Timing

Space chevron toggle 후:

```text
UI state 즉시 변경
→ persistence
```

debounce가 필수는 아니다.

Space 수가 많더라도 toggle frequency가 낮으므로 즉시 localStorage write 가능.

---

# 5.20 Space Trailing Actions

Space row는 hover/focus 시 아래 두 action을 제공한다.

```text
+     프로젝트 만들기
···   더보기
```

우선순위:

```text
[label flex]
[+]
[···]
```

둘 다 28×28px.

---

# 5.21 Trailing Action Visibility

desktop pointer:

```text
default              hidden
row hover             visible
row focus-within      visible
menu open             visible
inline create active  visible as needed
```

## selected row

selected라고 항상 표시하지 않는다.

## touch

touch behavior는 §12에서 처리.

---

# 5.22 Space Trailing Plus

accessible label:

```text
"<Space 이름>에 프로젝트 만들기"
```

예:

```text
"My Space에 프로젝트 만들기"
```

tooltip:

```text
프로젝트 만들기
```

click:

```text
open create Project flow scoped to this Space
```

Space navigation은 발생하지 않는다.

---

# 5.23 Space Context Menu

Space trailing `···` 클릭 시 context menu를 연다.

P0 menu:

```text
이름 바꾸기
새 프로젝트
────────────
보관
삭제
```

`새 프로젝트`는 trailing `+`와 동일 create flow.

---

# 5.24 Space Context Menu Order

정확한 순서:

```text
1. 이름 바꾸기
2. 새 프로젝트
3. separator
4. 보관
5. 삭제
```

보관과 삭제는 destructive group으로 아래에 둔다.

`삭제`는 가장 마지막.

---

# 5.25 Project Trailing Actions

Project row는 P0에서 `···` 하나만 사용한다.

```text
[label flex] [···]
```

Space처럼 `+` action 없음.

---

# 5.26 Project Context Menu

P0:

```text
이름 바꾸기
────────────
보관
이동
삭제
```

권장 순서:

```text
1. 이름 바꾸기
2. separator
3. 보관
4. 이동
5. 삭제
```

단 `이동`은 destructive가 아니므로 별도 separator 없이 보관과 같이 둘 수도 있다.

P0 final:

```text
이름 바꾸기
────────────
이동
보관
삭제
```

로 확정한다.

---

# 5.27 Context Menu Anchoring

anchor:

```text
trailing ··· button
```

placement:

```text
right-start
```

Sidebar 오른쪽 viewport collision 시:

```text
left-start
```

로 flip 가능.

offset:

```text
4~8px
```

P0 token:

```text
6px
```

---

# 5.28 Context Menu Open State

menu open 중:

- 해당 row hover background 유지 가능
- trailing action 계속 visible
- row selected state는 그대로
- navigation 발생 없음

`contextMenuOpenEntityId`를 route selected state와 분리한다.

---

# 5.29 Rename — Entry

rename 시작 경로:

```text
Space context menu → 이름 바꾸기
Project context menu → 이름 바꾸기
```

P0에서 더블클릭 label로 rename하지 않는다.

이유:

- 더블클릭 navigation과 충돌 가능
- discoverability 낮음
- accidental rename 방지

---

# 5.30 Rename — Inline

P0 rename은 inline row editor로 처리한다.

예:

```text
▼ [ My Space________________ ] 
```

Project:

```text
   ● [ fNIRS 졸업 논문_______ ]
```

별도 modal을 열지 않는다.

---

# 5.31 Rename Input Geometry

기존 row 안에 들어간다.

```text
height: 28px
```

row height 36px는 유지.

input:

```text
min-width: 0
flex: 1
```

leading icon/chevron은 유지.

trailing action은 rename 중 숨긴다.

---

# 5.32 Rename Initial Focus

rename start:

- input autofocus
- 기존 전체 이름 select

사용자가 바로 typing하면 기존 이름을 교체할 수 있게 한다.

---

# 5.33 Rename Commit

다음에서 commit:

```text
Enter
blur
```

단 blur로 context menu/open dialog로 이동하는 경우 duplicate submit을 방지한다.

---

# 5.34 Rename Cancel

```text
Escape
```

→ 원래 이름 복원

empty/whitespace-only name:

```text
commit 금지
```

기존 이름으로 복구하고 error style 또는 validation message를 제공한다.

---

# 5.35 Rename Validation

P0 최소:

```text
trimmed length >= 1
```

max length는 기존 data model 제한을 따른다.

Sidebar redesign 때문에 임의 제한을 추가하지 않는다.

동일 이름 허용 여부도 기존 domain rule을 따른다.

---

# 5.36 Rename Failure

server/update 실패 시:

- 기존 이름 복원
- compact toast 또는 existing error system 사용
- row layout 유지
- selected state 유지

---

# 5.37 Archive — Space

Space `보관` 선택 시:

- confirmation 없이 archive가 reversible한 현재 domain action이면 즉시 실행 가능
- archive가 사실상 삭제와 동일하면 confirmation 필요

P0 IA에서는 archive를 reversible action으로 간주한다.

성공 후:

- Space tree에서 제거
- 해당 Space 또는 자식 Project가 active면 safe fallback route
- Archive scope에서 접근 가능

fallback은 §8에서 확정.

---

# 5.38 Archive — Project

Project 보관도 동일.

성공:

```text
tree에서 제거
```

active Project였다면:

```text
parent Space 또는 /tasks/today
```

로 fallback.

정확 rule은 §8.

---

# 5.39 Delete — Confirmation

Space / Project 삭제는 confirmation 필수.

P0에서 context menu 클릭 즉시 삭제하지 않는다.

---

# 5.40 Delete Confirmation Content

Space:

```text
제목: 공간 삭제
설명: 이 공간과 관련된 데이터가 삭제될 수 있음을 명확히 설명
Primary destructive: 삭제
Secondary: 취소
```

Project:

```text
제목: 프로젝트 삭제
Primary destructive: 삭제
Secondary: 취소
```

실제 cascading semantics는 existing domain model을 정확히 반영해야 하며 UI 문구가 거짓이면 안 된다.

---

# 5.41 Delete Confirmation Input

P0에서 이름 재입력 같은 강한 confirmation은 요구하지 않는다.

다만 Space delete가 대량 data destructive라면 domain 위험도에 따라 향후 추가 가능.

---

# 5.42 Delete Success

성공 시:

- Tree에서 즉시 제거
- expanded state id cleanup
- active Entity였다면 route fallback
- deleted entity selected state 제거

---

# 5.43 Delete Failure

실패:

- Tree row 복구/유지
- error toast
- menu/dialog close 또는 retry 가능
- current navigation 유지

---

# 5.44 Move Project

Project context menu `이동`으로 Space 간 이동 가능하게 한다.

P0에서는 context menu submenu 또는 small picker를 사용한다.

예:

```text
이동 >
   My Space
   Work
   Personal
```

현재 Space는 disabled 또는 check 표시.

---

# 5.45 Move Project Result

성공:

```text
project.parentSpaceId 변경
```

Tree에서:

- 기존 Space 하위 제거
- 새 Space 하위 삽입
- Project selected라면 새 parent Space auto-expand
- route는 Project id 기반이면 유지

---

# 5.46 Move Project + Collapsed Destination

destination Space가 collapsed였더라도 active Project를 이동시킨 경우:

```text
destination Space auto-expand
```

current Project가 selected이기 때문이다.

---

# 5.47 DnD Scope

P0 DnD는 아래 두 동작을 지원한다.

```text
1. Space reorder
2. Project reorder / Project move between Spaces
```

금지:

- Project를 root level에 drop
- Space를 Project 아래에 drop
- nested Space 생성
- Task를 Sidebar tree에 drop

---

# 5.48 DnD — Space Reorder

Space row drag:

```text
Space A
Space B
Space C
```

→ 순서 변경.

drag handle을 별도로 상시 표시하지 않는다.

P0에서는 Space row main area에서 drag 시작 가능하되 click threshold를 둔다.

권장:

```text
pointer movement >= 6px
```

일 때 drag로 판단.

---

# 5.49 DnD — Project Reorder

Project는 같은 Space 안에서 reorder 가능.

예:

```text
Space A
  P1
  P2
  P3
```

P3를 P1 위로 이동 가능.

---

# 5.50 DnD — Move Between Spaces

Project를 다른 Space row 또는 해당 Space child region에 drop하면 move.

collapsed Space 위 hover 시:

```text
600ms
```

후 auto-expand를 권장한다.

---

# 5.51 DnD Drop Zones

Space reorder:

```text
before Space
after Space
```

Project:

```text
before Project
after Project
inside Space
```

visual indicator는 2px 이하의 subtle insertion line 또는 target highlight.

실제 색상은 §11.

---

# 5.52 DnD Invalid Drop

invalid target:

- no indicator
- cursor / drag preview로 unavailable 표현
- drop 시 no-op

toast를 매번 띄우지 않는다.

---

# 5.53 DnD Selected State

selected Project를 drag해도 selected state 유지.

drop 후 route가 바뀌지 않으면 selection 그대로.

Space reorder도 current Scope 변경 없음.

---

# 5.54 DnD Failure

backend reorder/move 실패:

- optimistic UI를 사용했다면 원래 위치로 rollback
- error toast
- route/selection 유지

---

# 5.55 DnD Keyboard Accessibility

P0에서 복잡한 keyboard drag reordering을 직접 구현하는 대신 context menu `이동`을 keyboard-accessible fallback으로 제공한다.

Space reorder keyboard 기능은 P1 가능.

즉 Project 이동은 mouse DnD에만 의존하지 않는다.

---

# 5.56 Tree Keyboard Model

Space / Project navigation은 ARIA Tree 패턴을 완전히 구현하거나, simpler nested navigation list를 사용할 수 있다.

P0 권장:

**nested navigation list + roving focus-like arrow navigation**.

이유:

- hierarchy가 2단계로 단순
- link semantics 유지가 중요
- full `role=tree`의 복잡한 aria-selected/expanded 처리보다 router 링크와 호환이 쉬움

---

# 5.57 Keyboard Focus Target

각 Space / Project row의 main interactive area는 하나의 주요 focus target을 가진다.

trailing action은 row가 focus되었을 때 별도로 Tab 접근 가능.

Arrow navigation은 main row targets 사이에서 수행한다.

---

# 5.58 Arrow Navigation

Tree main rows에서:

```text
ArrowDown   → 다음 visible Space/Project row
ArrowUp     → 이전 visible Space/Project row

ArrowRight on collapsed Space
           → expand

ArrowRight on expanded Space
           → first child Project focus

ArrowLeft on expanded Space
           → collapse

ArrowLeft on Project
           → parent Space focus
```

Enter:

```text
navigate selected/focused entity
```

Space chevron focus까지 별도로 Tab해야만 expand할 수 있게 만들지 않는다.

---

# 5.59 Home / End

Tree main row focus 시:

```text
Home → first visible Space row
End  → last visible Space/Project row
```

---

# 5.60 Tab Behavior in Tree

Tab은 tree 전체를 빠져나갈 수 있어야 한다.

권장:

- tree main rows는 roving tabindex
- 현재 focus row만 `tabIndex=0`
- 나머지 main rows `tabIndex=-1`

trailing action은 current focused/hovered row에 대해 Tab reachable.

구현 complexity가 기존 component system과 맞지 않으면 standard links Tab 순서를 유지할 수 있으나 100개 row에서 UX가 나빠지므로 roving focus를 우선 권장한다.

---

# 5.61 Focus after Collapse

Space가 keyboard로 collapse되고 focus가 그 child Project에 있던 edge case는 일반적으로 발생하지 않지만 state change로 child가 사라진다면:

```text
focus → parent Space row
```

로 복원.

---

# 5.62 Focus after Delete

focused Project 삭제:

```text
focus → next sibling
```

없으면:

```text
previous sibling
```

그것도 없으면:

```text
parent Space
```

Space 삭제:

```text
focus → next Space
→ previous Space
→ Create Space action
```

순서.

---

# 5.63 Active Row Auto-scroll

새 route/deep link로 selected Entity가 바뀌면 selected row가 Sidebar viewport 밖에 있을 경우:

```text
scrollIntoView({
  block: "nearest"
})
```

사용.

무조건 center로 스크롤하지 않는다.

---

# 5.64 Scroll Priority

Tasks Sidebar mount 시:

1. deep link/current selection이 visible하도록 parent expansion
2. selected row가 viewport 밖이면 nearest reveal
3. 아니면 stored scroll position restore

selected active row visibility가 old scroll 위치보다 우선.

---

# 5.65 User Manual Scroll Protection

사용자가 이미 Sidebar를 직접 scroll하고 있는 동안 background state update가 발생했다고 매번 selected row로 jump하지 않는다.

Auto-scroll은 아래 이벤트에만 사용:

- route change
- initial deep link
- explicit navigation selection
- Project move로 parent가 변경됨

일반 data refresh에는 사용하지 않는다.

---

# 5.66 Hover Behavior

Space/Project row hover:

- hover background
- trailing actions reveal
- label font weight 변화 없음
- icon 위치 변화 없음
- chevron 위치 변화 없음

---

# 5.67 Selected + Context Menu

selected row에서 context menu open:

```text
selected background 유지
+
menu-open affordance
```

selected state를 hover state로 덮지 않는다.

---

# 5.68 Inline Rename + Selected

selected Project를 rename해도 selected background 의미는 유지하되 input focus ring이 명확해야 한다.

background가 너무 복잡하면 rename 중 selected bg를 약화할 수 있으나 Scope selected semantic은 사라지면 안 된다.

---

# 5.69 Empty Space

Project 0개 + expanded:

```text
▼ My Space
   + 첫 프로젝트 만들기
```

Project 0개 + collapsed:

```text
▶ My Space
```

empty action은 expanded일 때만 보임.

---

# 5.70 Empty Project Create Action

geometry:

```text
height: 32px
indent: Project level
icon: 16px
```

click:

```text
create Project in parent Space
```

row selected state 없음.

---

# 5.71 Space with Loading Children

lazy-loading을 사용하는 경우:

```text
▼ My Space
   [skeleton]
   [skeleton]
```

Space row 자체는 즉시 표시.

loading 중 collapse 가능.

collapsed 상태에서는 children fetch를 계속할지 cancel할지는 data layer 결정.

---

# 5.72 Space Child Load Error

```text
▼ My Space
   프로젝트를 불러오지 못했습니다.
   [다시 시도]
```

Space row navigation은 정상.

---

# 5.73 Project Count Metadata

P0 Space row에 child Project count를 표시하지 않는다.

예:

```text
My Space (12)
```

금지.

Project 수는 Main Space Overview에서 제공 가능.

---

# 5.74 Tree Icons

Space:

```text
16~18px folder/layers icon
```

Project:

```text
16~18px project/list icon
```

실제 row geometry상 icon slot은 20px.

icon 자체는 16~18px.

P0 권장:

```text
16px
```

더 compact하고 label hierarchy가 잘 보인다.

---

# 5.75 Icon Color

default는 neutral/muted.

selected row에서는 selected icon token.

사용자 지정 Project color가 기존 모델에 존재한다면 해당 color를 작은 icon/accent에 사용할 수 있다.

없다면 새 color picker system을 만들지 않는다.

---

# 5.76 Tooltip — Space/Project Name

full label이 잘리지 않았으면 tooltip 없음.

truncated일 때:

```text
full entity name
```

hover delay:

```text
500ms
```

trailing action tooltip보다 이름 tooltip이 우선 충돌하지 않게 한다.

---

# 5.77 Tooltip — Trailing Actions

Space `+`:

```text
프로젝트 만들기
```

Space `···`:

```text
더보기
```

Project `···`:

```text
더보기
```

keyboard focus 시 즉시.

---

# 5.78 Tooltip Collision

row name tooltip과 trailing action tooltip을 동시에 띄우지 않는다.

pointer target 기준 하나만 표시.

---

# 5.79 Context Menu Invocation via Keyboard

focused Space/Project row에서:

```text
Shift + F10
```

또는 context-menu key가 있으면 해당 row menu open.

trailing `···` button도 Tab/Enter로 열 수 있어야 한다.

---

# 5.80 Right-click

Space/Project row right-click 시 동일 context menu를 열어도 된다.

P0 권장:

```text
지원
```

단 browser native menu를 막는 이유가 명확해야 한다.

앱 entity context action이 충분히 가치 있으므로 지원한다.

---

# 5.81 Right-click Selection Policy

inactive row를 right-click해 menu를 열어도 **Scope selection은 바꾸지 않는다.**

예:

```text
Project A selected
right-click Project B
→ menu for Project B
→ Project A remains selected
```

context target과 active navigation target을 분리한다.

---

# 5.82 Context Target State

권장:

```ts
type TreeContextMenuState = {
  entityType: "space" | "project";
  entityId: string;
} | null;
```

`activeScope`와 별개.

---

# 5.83 Rename Context Target

Project B menu에서 rename 선택하면 Project B inline editor가 열린다.

Project A가 current Scope여도 selection route를 Project B로 바꾸지 않는다.

---

# 5.84 Rename + Navigation

rename input이 열린 row 외 다른 navigation item 클릭:

- current rename commit 가능하면 commit
- validation failure면 navigation을 막지 않는 정책을 권장

P0 final:

**navigation을 막지 않는다.**

invalid rename이면 rename cancel/revert 후 navigation한다.

---

# 5.85 Create Project from Space Trailing Plus

Space가 collapsed 상태라도 trailing `+`를 클릭할 수 있다.

create flow open 시:

```text
parent Space = clicked Space
```

생성 완료 후:

```text
Space auto-expand
new Project visible
```

신규 Project로 자동 navigation할지는 §6에서 확정.

---

# 5.86 Project Move via DnD + Expanded State

Project가 destination Space에 drop되면:

```text
destination Space expanded
```

를 권장.

단 source Space가 비어도 자동 collapse하지 않는다.

---

# 5.87 Space Reorder Persistence

Space order는 UI preference가 아니라 domain ordering data다.

따라서 localStorage-only로 저장하지 않는다.

기존 backend/domain order field를 사용한다.

없다면 DnD 구현 전에 explicit sort order field가 필요하다.

---

# 5.88 Project Reorder Persistence

Project order도 domain data다.

Space별 sort order가 필요하다.

권장 conceptual model:

```text
project.spaceId
project.sortOrder
```

실제 schema는 기존 DB 구조에 맞춘다.

---

# 5.89 Sparse Ordering

reorder가 잦을 경우 매 drag마다 전체 row 순번을 1..N 재작성하지 않는 방식을 권장한다.

예:

```text
1000, 2000, 3000
```

또는 fractional indexing.

단 기존 project가 이미 order utility를 갖고 있다면 재사용한다.

§5 때문에 별도의 고급 ordering library를 무조건 추가하지 않는다.

---

# 5.90 Concurrent Reorder

multi-device sync를 지원한다면 stale reorder conflict가 생길 수 있다.

P0에서는 backend 성공 응답을 source of truth로 사용하고 필요 시 list refetch/reconcile한다.

UI가 조용히 잘못된 순서를 영구 유지하지 않게 한다.

---

# 5.91 DnD Library Policy

기존 codebase에 DnD library가 있으면 재사용.

없다면 다음 요구를 만족하는 접근을 선택한다.

- pointer support
- nested sortable
- drag overlay
- collision detection
- accessible fallback
- React concurrent rendering과 충돌 없음

library 이름은 본 문서에서 고정하지 않는다.

---

# 5.92 Drag Preview

drag overlay에는 row 전체를 복제한 compact preview를 사용.

금지:

- screenshot bitmap
- 투명도가 너무 낮아 식별 불가
- 전체 Sidebar width만큼 큰 drop ghost

---

# 5.93 Auto-scroll during Drag

Project가 Sidebar viewport 상하단 근처로 이동하면 body auto-scroll을 허용한다.

threshold:

```text
상/하 32px
```

speed는 distance 기반 완만하게.

---

# 5.94 Auto-expand during Drag

collapsed Space 위에 Project drag hover:

```text
600ms
```

후 expand.

pointer가 target을 떠나면 timer cancel.

---

# 5.95 Drop Indicator

same-level reorder:

```text
2px insertion line max
```

inside Space target:

```text
Space row subtle target background
```

둘을 동시에 표시하지 않는다.

---

# 5.96 Context Menu During Drag

drag start 시 열린 context menu가 있으면 닫는다.

rename active row는 drag 시작 불가.

---

# 5.97 Rename During Drag

inline rename 상태에서는 해당 row draggable=false.

rename 종료 후 다시 draggable.

---

# 5.98 Archived Entity in Main Tree

보관된 Space/Project는 active Spaces Tree에 표시하지 않는다.

Archive scope에서만 표시.

즉 main Tree 데이터 query는:

```text
archived = false
```

개념을 가진다.

---

# 5.99 Deleted Entity in Tree

soft-delete model이라도 active Tree에는 표시하지 않는다.

---

# 5.100 Active Entity Archived Elsewhere

현재 Project가 다른 device/action으로 archive된 경우 next sync에서:

- Tree에서 제거
- current route fallback
- selected state clear
- Sidebar geometry 유지

---

# 5.101 Active Entity Parent Changed Elsewhere

Project parent Space가 remote update로 바뀌면:

- 새 parent Space 아래로 row 이동
- active Project이면 새 parent auto-expand
- scroll nearest reveal 가능
- Project route 유지

---

# 5.102 Tree Rendering Key

React key 등 rendering identity는:

```text
entity id
```

사용.

index를 key로 사용하지 않는다.

특히 DnD/reorder에서 중요.

---

# 5.103 Memoization / Render Scope

Task data 변화 때문에 Space Tree 전체가 불필요하게 rerender되지 않게 한다.

Project row가 표시하는 정보가:

- id
- name
- icon/color
- archived
- parentSpaceId
- order

정도라면 Task count 등의 unrelated subscription을 row마다 붙이지 않는다.

---

# 5.104 Virtualization Threshold

P0에서 virtualization은 **기본 필수 아님**.

권장 검토 threshold:

```text
visible tree rows > 250
```

에서 실제 performance profile 후 도입.

100~200개 row 정도는 interaction/keyboard correctness를 우선한다.

---

# 5.105 Virtualization Requirements

향후 도입 시 반드시 유지:

- active row scrollIntoView equivalent
- keyboard ArrowUp/Down
- DnD
- inline rename
- context menu anchoring
- expanded state
- screen reader accessible label

이 중 하나라도 깨지면 virtualization보다 일반 rendering을 유지한다.

---

# 5.106 Test IDs

E2E test 안정성을 위해 semantic test id를 둘 수 있다.

예:

```text
space-row-{spaceId}
project-row-{projectId}
space-toggle-{spaceId}
space-create-project-{spaceId}
space-menu-{spaceId}
project-menu-{projectId}
```

실제 testing convention이 있으면 그것을 따른다.

---

# 5.107 State Model

개념:

```ts
type SpaceTreeUIState = {
  expandedSpaceIds: Set<string>;
  contextMenuTarget:
    | { type: "space"; id: string }
    | { type: "project"; id: string }
    | null;

  renaming:
    | { type: "space"; id: string }
    | { type: "project"; id: string }
    | null;

  focusedTreeItemId: string | null;

  dragging:
    | { type: "space"; id: string }
    | { type: "project"; id: string }
    | null;
};
```

route selection은 별도.

---

# 5.108 Selected State Must Not Be Stored Here

금지:

```ts
spaceTreeState.selectedProjectId = ...
```

selected Scope는 router/app navigation state에서 derive한다.

Tree UI state에 중복 저장하지 않는다.

---

# 5.109 Expanded State Update API

권장:

```ts
expandSpace(spaceId)
collapseSpace(spaceId)
toggleSpace(spaceId)
ensureSpaceExpanded(spaceId)
```

`ensureSpaceExpanded`는 deep link/active parent reveal에 사용.

---

# 5.110 Entity Menu API

권장:

```ts
openSpaceMenu(spaceId)
openProjectMenu(projectId)
closeTreeMenu()
```

context target은 navigation selection 변경을 발생시키지 않는다.

---

# 5.111 Rename API

```ts
startRename(type, id)
commitRename(type, id, name)
cancelRename()
```

rename 중 다른 rename 시작:

```text
기존 rename commit/cancel
→ 새 rename start
```

동시에 두 input이 열리지 않는다.

---

# 5.112 DnD API

conceptual:

```ts
moveSpace(spaceId, targetIndex)

moveProject({
  projectId,
  destinationSpaceId,
  targetIndex,
})
```

UI가 DB transaction 세부를 직접 알 필요 없다.

domain command로 분리한다.

---

# 5.113 Tree Event Propagation Matrix

| Target | Navigate | Expand | Create | Menu |
|---|---:|---:|---:|---:|
| Space chevron | No | Yes | No | No |
| Space icon/label/body | Yes | No | No | No |
| Space `+` | No | No | Yes | No |
| Space `···` | No | No | No | Yes |
| Project icon/label/body | Yes | No | No | No |
| Project `···` | No | No | No | Yes |
| Empty `첫 프로젝트 만들기` | No | No | Yes | No |

이 표를 구현 기준으로 사용한다.

---

# 5.114 Route + Expansion Matrix

| 상황 | Parent Space |
|---|---|
| Space route | current stored state 유지 |
| Project route direct load | auto-expand |
| Project clicked from visible row | 이미 expanded |
| Project moved to new Space | new parent expand |
| Active Project parent manually collapsed | collapsed 허용 |
| Calendar → Tasks restore Project | parent auto-expand |
| Search result → Project | parent auto-expand |

---

# 5.115 Interaction Test Cases

## TREE-01 Chevron

```text
Given Space s1 collapsed
When its chevron is clicked
Then s1 expands
And route does not change
```

## TREE-02 Space click

```text
Given s1 expanded
When Space label is clicked
Then navigate to s1 Overview
And s1 remains expanded
```

## TREE-03 Project click

```text
When p1 row is clicked
Then p1 becomes active Scope
And parent Space remains expanded
```

## TREE-04 Deep link

```text
Given s1 stored collapsed
When user opens /project/p1/gantt directly
Then s1 is expanded on initial render
And p1 is selected
```

## TREE-05 Parent manual collapse

```text
Given p1 is selected
When user collapses parent s1
Then route remains p1
And p1 row becomes hidden
And s1 is not selected
```

## TREE-06 Space trailing +

```text
When s1 trailing + is clicked
Then create-project flow opens for s1
And Space navigation does not occur
```

## TREE-07 Right-click inactive row

```text
Given p1 selected
When p2 is right-clicked
Then p2 menu opens
And p1 remains selected
```

## TREE-08 Rename cancel

```text
Given Project p1 rename active
When Escape is pressed
Then original name is restored
```

## TREE-09 Rename commit

```text
Given rename input has non-empty new name
When Enter is pressed
Then update command runs
And inline editor closes on success
```

## TREE-10 Move Project

```text
Given p1 is in s1
When p1 is moved to s2
Then p1 appears under s2
And if p1 is active, s2 expands
```

## TREE-11 DnD invalid

```text
When Space s1 is dragged over Project p1 child position
Then invalid nested-Space drop is not allowed
```

## TREE-12 Delete active Project

```text
Given p1 active
When p1 deletion succeeds
Then p1 disappears
And navigation falls back safely
And no stale selected row remains
```

## TREE-13 ArrowRight

```text
Given collapsed Space s1 focused
When ArrowRight is pressed
Then s1 expands
```

## TREE-14 ArrowLeft Project

```text
Given Project p1 focused
When ArrowLeft is pressed
Then focus moves to parent Space
```

## TREE-15 Auto-scroll

```text
Given selected Project p20 is below current Sidebar viewport
When navigation changes to p20
Then p20 is revealed using nearest scrolling
```

---

# 5.116 QA Checklist

- [ ] Tree hierarchy는 Space → Project 2단계만 사용한다.
- [ ] Space row와 Project row는 36px 높이를 사용한다.
- [ ] Space row에는 chevron / icon / label / + / ··· slot이 있다.
- [ ] Project row에는 indentation / icon / label / ··· slot이 있다.
- [ ] Tree indentation token은 24px이다.
- [ ] Chevron 클릭은 navigation을 발생시키지 않는다.
- [ ] Space label click은 expand/collapse를 toggle하지 않는다.
- [ ] Space label click은 Space Overview로 이동한다.
- [ ] Project row click은 Project로 이동한다.
- [ ] Project selected 시 parent Space가 selected background를 갖지 않는다.
- [ ] Project deep link 시 parent Space가 auto-expand된다.
- [ ] active Project parent를 수동 collapse하는 것은 허용된다.
- [ ] expanded Space ids가 persist된다.
- [ ] Space trailing +는 Project create flow를 연다.
- [ ] Space trailing ···는 Space context menu를 연다.
- [ ] Project trailing ···는 Project context menu를 연다.
- [ ] right-click menu가 active Scope를 바꾸지 않는다.
- [ ] rename은 inline이다.
- [ ] rename Escape가 cancel한다.
- [ ] whitespace-only name은 commit되지 않는다.
- [ ] delete는 confirmation을 거친다.
- [ ] Project 이동은 context menu에서도 가능하다.
- [ ] Space reorder DnD가 가능하다.
- [ ] Project same-Space reorder가 가능하다.
- [ ] Project cross-Space move DnD가 가능하다.
- [ ] invalid nested hierarchy drop은 막힌다.
- [ ] collapsed Space drag hover auto-expand가 가능하다.
- [ ] DnD 실패 시 rollback 가능하다.
- [ ] Project 이동은 DnD 외 keyboard-accessible menu fallback이 있다.
- [ ] ArrowUp/Down으로 visible tree rows를 이동할 수 있다.
- [ ] ArrowRight/Left로 Space hierarchy를 탐색할 수 있다.
- [ ] selected row는 route change 때 viewport 안으로 reveal된다.
- [ ] data refresh만으로 Sidebar가 임의 scroll jump하지 않는다.
- [ ] empty Space expanded 상태에서 `첫 프로젝트 만들기`가 보인다.
- [ ] archived Entity는 active Tree에서 보이지 않는다.
- [ ] React rendering key로 array index를 사용하지 않는다.
- [ ] selected Entity id를 Tree local state에 중복 저장하지 않는다.
- [ ] DnD reorder order는 domain/backend에 저장된다.
- [ ] localStorage는 expanded UI state에만 사용한다.
- [ ] 100~200 row에서 virtualization을 성급히 도입하지 않는다.

---

# 5.117 Acceptance Criteria

## AC-TREE-01

Space / Project Tree는 2단 hierarchy를 명확한 indentation과 icon semantics로 표현한다.

## AC-TREE-02

Space의 navigation과 expand/collapse는 서로 다른 hit target 및 event로 분리되어 있다.

## AC-TREE-03

Project route에서는 해당 Project만 selected이고 parent Space는 expanded ancestry만 표현한다.

## AC-TREE-04

Deep link 및 Tasks restore 시 active Project의 parent Space가 자동으로 expand된다.

## AC-TREE-05

Space expand/collapse 상태는 route selection과 분리되어 저장되고 복원된다.

## AC-TREE-06

Space row의 trailing `+`와 `···`, Project row의 `···`는 navigation을 발생시키지 않는다.

## AC-TREE-07

Space / Project rename은 inline으로 수행되며 Enter commit, Escape cancel을 지원한다.

## AC-TREE-08

Space / Project delete는 destructive confirmation 없이 실행되지 않는다.

## AC-TREE-09

Project는 context menu 또는 DnD로 다른 Space로 이동할 수 있다.

## AC-TREE-10

Space와 Project의 reorder가 domain ordering에 반영되며 UI-only localStorage 순서로 끝나지 않는다.

## AC-TREE-11

Tree는 mouse뿐 아니라 keyboard로 expand/collapse, 이동, navigation이 가능하다.

## AC-TREE-12

현재 active Entity가 바뀌면 해당 row가 nearest 방식으로 Sidebar viewport에 드러난다.

## AC-TREE-13

Right-click/context menu target은 current navigation Scope와 독립적이다.

## AC-TREE-14

Tree interaction 때문에 Sidebar width, Global Rail state, Project View state가 의도치 않게 바뀌지 않는다.

---

# 5.118 최종 결정 요약

```text
HIERARCHY
Space
└ Project
```

```text
ROW
36px
Indent 24px
```

```text
SPACE
Chevron | Icon | Label | + | ···
```

```text
PROJECT
Indent | Icon | Label | ···
```

```text
SPACE CLICK
Navigate only
```

```text
CHEVRON CLICK
Expand/collapse only
```

```text
PROJECT SELECTED
Parent expanded, not selected
```

```text
EXPANSION
Persisted
Deep-link parent auto-expand
Manual collapse still allowed
```

```text
RENAME
Inline
Enter = commit
Escape = cancel
```

```text
DELETE
Confirmation required
```

```text
MOVE / REORDER
Space reorder
Project reorder
Project cross-Space move
```

```text
KEYBOARD
Arrow navigation
Context-menu fallback
```

---

# 5.119 §5에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- Tree hierarchy depth
- Space/Project row height
- indentation
- chevron 위치 및 역할
- Space label click 역할
- Project row click 역할
- selected parent 처리
- active Project parent auto-expand
- active parent manual collapse 허용
- expanded state persistence
- trailing + / ··· 배치
- Space / Project context menu 기본 항목
- inline rename
- delete confirmation
- Project move
- Space reorder
- Project reorder
- cross-Space DnD
- invalid drop 정책
- keyboard tree navigation
- right-click selection 독립
- active row auto-scroll
- empty Space child create action
- archived entity exclusion
- Tree state와 route selection 분리

---

# 6. Create UX

- 상태: **확정**
- 우선순위: **P0**
- 적용 대상: `Space 생성`, `Project 생성`
- 목적: Sidebar 안의 모든 생성 진입점을 **하나의 일관된 생성 모델**로 통합하고, 입력 위치·검증·취소·완료 후 선택/이동·오류 복구까지 정의한다.
- 선행: §4 Tasks Sidebar, §5 Space / Project Tree
- 후속: §7 Main Content 연동

---

# 6.1 핵심 결정

P0 생성 UX는 아래와 같이 확정한다.

```text
Space 생성
→ Sidebar inline create

Project 생성
→ 해당 Space 하위 inline create
```

즉, 기본 생성에는 Modal을 사용하지 않는다.

---

# 6.2 Entry Point Matrix

## Space 생성 진입점

P0에서 2개를 유지한다.

```text
1. Spaces section header의 +
2. Tree 하단의 + 공간
```

둘은 정확히 동일한 create-space flow를 호출한다.

## Project 생성 진입점

P0에서 아래를 유지한다.

```text
1. Space row trailing +
2. Empty Space의 + 첫 프로젝트 만들기
3. Space context menu → 새 프로젝트
```

셋은 정확히 동일한 create-project flow를 호출한다.

---

# 6.3 Create Flow Single Source

생성 진입점이 여러 개더라도 실제 상태와 command는 하나만 사용한다.

권장:

```ts
type CreateTarget =
  | { type: "space" }
  | { type: "project"; parentSpaceId: string }
  | null;
```

생성 UI 상태:

```ts
type CreateUIState = {
  target: CreateTarget;
  draftName: string;
  status: "idle" | "editing" | "submitting" | "error";
  errorMessage?: string;
};
```

각 버튼마다 독립 create state를 만들지 않는다.

---

# 6.4 Modal / Popover / Inline Decision

P0 final:

```text
Space   → inline
Project → inline
```

Popover는 사용하지 않는다.

Modal은 사용하지 않는다.

## 이유

- 생성 시 필요한 필드가 이름 1개뿐임
- 사용자가 현재 hierarchy 안에서 생성 위치를 바로 이해할 수 있음
- 생성 후 새 Entity가 어디에 생겼는지 즉시 확인 가능
- TickTick-like sidebar interaction과 잘 맞음
- 불필요한 context switch 감소

---

# 6.5 Space Create Placement

Space 생성 시작 시 Spaces Tree 최하단의 `+ 공간` row 위치가 inline input으로 전환된다.

Before:

```text
▼ My Space
   Project A

+ 공간
```

During:

```text
▼ My Space
   Project A

[ 새 공간 이름________________ ]
```

## Header `+`로 시작한 경우도 동일

Header `+`를 눌러도 input은 Tree 하단에 나타난다.

즉 entry point에 따라 input 위치가 달라지지 않는다.

---

# 6.6 Space Inline Row Geometry

```text
height: 36px
border-radius: 8px

padding-left: 8px
padding-right: 8px
```

leading:

```text
Space icon slot 18px
```

input:

```text
flex: 1
min-width: 0
height: 28px
```

trailing:

```text
none
```

생성 중에는 `+ 공간` row는 따로 중복 표시하지 않는다.

---

# 6.7 Space Input Placeholder

```text
공간 이름
```

placeholder는 실제 값이 아니다.

빈 상태 그대로 Enter하면 생성하지 않는다.

---

# 6.8 Project Create Placement

Project 생성 시작 시 대상 Space를 반드시 expanded 상태로 만든다.

예:

```text
▶ My Space
```

Space trailing `+` 클릭:

```text
▼ My Space
   ● Project A
   [ 새 프로젝트 이름____________ ]
```

새 Project input은 해당 Space의 **마지막 child row 아래**에 표시한다.

---

# 6.9 Empty Space Project Create

기존:

```text
▼ My Space
   + 첫 프로젝트 만들기
```

클릭 후:

```text
▼ My Space
   [ 새 프로젝트 이름____________ ]
```

empty action row는 input으로 교체한다.

---

# 6.10 Project Input Geometry

```text
height: 36px
indentation: Project level (24px)
```

leading:

```text
Project icon slot 18px
```

input:

```text
height: 28px
flex: 1
min-width: 0
```

trailing action 없음.

---

# 6.11 Project Input Placeholder

```text
프로젝트 이름
```

---

# 6.12 Autofocus

Create flow 시작 즉시 input에 focus한다.

규칙:

```text
open create flow
→ ensure row visible
→ requestAnimationFrame / layout settle
→ focus input
```

특히 collapsed Space를 expand한 직후에도 focus가 실패하지 않게 한다.

---

# 6.13 Input Selection

새 생성이므로 기존 text가 없다.

따라서 `select all`은 필요 없다.

cursor는 input start에 위치한다.

---

# 6.14 Keyboard Contract

## Enter

non-empty valid name:

```text
submit create
```

## Escape

```text
cancel create
restore previous UI
```

## Tab

P0 final:

```text
Tab = create submit 아님
```

기본 focus 이동을 허용하지 않고, create mode에서는 다음 정책을 권장한다.

```text
Tab → commit if valid, then move focus to created row
```

하지만 웹 폼 표준과 충돌 가능성이 있어 P0 최종은 더 단순하게:

**Tab은 default browser focus 이동을 허용하고, blur commit을 하지 않는다.**

즉:

```text
Enter = commit
Escape = cancel
blur = cancel
```

로 확정한다.

---

# 6.15 Blur Policy

Create input이 blur되면:

```text
cancel
```

생성하지 않는다.

## 이유

- 사용자가 Sidebar 다른 항목을 클릭했는데 의도치 않게 Entity가 생성되는 문제 방지
- 생성 action은 명시적 Enter로만 commit
- inline create의 accidental creation 방지

---

# 6.16 Name Normalization

submit 직전:

```ts
const normalizedName = draftName.trim();
```

validation은 normalized 값 기준.

---

# 6.17 Minimum Validation

P0:

```text
trimmed length >= 1
```

빈 문자열 / whitespace-only:

```text
submit 금지
```

Enter 시:

- input 유지
- error state 표시 가능
- focus 유지

---

# 6.18 Maximum Length

기존 domain model의 최대 길이를 사용한다.

없다면 Sidebar redesign 때문에 임의의 50/100자 제한을 새로 만들지 않는다.

다만 DB column limit이 존재한다면 동일하게 맞춘다.

---

# 6.19 Duplicate Names

동일 Space 이름 / 동일 Project 이름 허용 여부는 existing domain rule을 따른다.

P0 Sidebar에서는 중복 이름을 자동 변경하지 않는다.

금지:

```text
Project
Project (2)
```

같은 client-side 자동 rename.

---

# 6.20 Submitting State

Enter 후 create request 중:

```text
status = submitting
```

input:

```text
disabled 또는 readOnly
```

중복 Enter submit 방지.

## Visual

row geometry 유지.

작은 inline spinner를 trailing 영역에 둘 수 있다.

단:

- row height 변화 없음
- Sidebar width 변화 없음

---

# 6.21 Optimistic Create Policy

P0 권장:

**Entity 생성은 pessimistic navigation + lightweight optimistic row 가능.**

구체:

1. create command 전송
2. submitting row 유지
3. 서버/DB에서 id 확정
4. 성공 후 실제 Entity row로 교체
5. 그 후 navigation

이유:

- 신규 Entity route에는 실제 id가 필요
- 임시 id route 생성은 복잡성 증가
- 실패 rollback을 단순화

---

# 6.22 Create Success — Space

Space 생성 성공 후:

```text
1. 새 Space Entity를 Tree에 추가
2. 새 Space expanded = true
3. inline input 제거
4. 새 Space row selected
5. 새 Space Overview로 navigation
6. focus는 새 Space row 또는 Main Header로 이동
```

P0 final:

```text
자동 navigation = Yes
```

---

# 6.23 Why Space Auto-navigation

새 Space를 만들었다는 것은 일반적으로 바로 해당 Space를 설정/사용하려는 의도가 강하다.

또한 아무것도 선택하지 않은 채 Tree에만 생성하는 것보다 생성 결과가 명확하다.

---

# 6.24 Space New Position

P0 신규 Space는:

```text
Space Tree 마지막
```

에 삽입한다.

사용자 reorder로 이후 위치 변경 가능.

sort order는 domain ordering에 저장한다.

---

# 6.25 Create Success — Project

Project 생성 성공 후:

```text
1. 새 Project를 parent Space 마지막 child에 추가
2. parent Space expanded 유지
3. inline input 제거
4. 새 Project selected
5. Project default view로 navigation
```

P0 default view:

```text
List
```

---

# 6.26 Why Project Auto-navigation

Project 생성 직후 사용자는 보통 Task를 추가하거나 Project 세부 설정을 이어서 수행한다.

따라서 P0에서는 생성 후 자동 navigation을 기본으로 한다.

---

# 6.27 Project New Position

새 Project는 해당 Space의 마지막 child에 삽입한다.

예:

```text
P1
P2
[New Project]
```

이후 DnD로 reorder 가능.

---

# 6.28 Create Success Focus

## Space

성공 후 route navigation이 Main으로 이동하므로:

- keyboard 사용자의 focus가 사라지지 않게
- route 후 Main Content heading 또는 새 Space row 중 하나에 focus

P0 권장:

```text
focus new Space row
```

다만 Main View가 autofocus 정책을 갖고 있으면 §7에서 조정 가능.

## Project

P0 권장:

```text
focus new Project row
```

그 후 사용자가 Enter로 다시 main route를 열 필요는 없음. 이미 navigation은 완료되어 있음.

---

# 6.29 Create Error

request 실패 시:

```text
status = error
input 유지
draftName 유지
focus 유지
```

사용자가 이름을 수정하거나 Enter로 retry 가능.

---

# 6.30 Error Message Placement

inline input row 아래에 별도 36px error row를 추가하지 않는다.

P0:

- input error border/state
- compact tooltip 또는 existing toast system

권장 조합:

```text
inline visual error + toast
```

Sidebar 높이 jump를 최소화한다.

---

# 6.31 Network Failure

create 실패 시 임시 Entity row를 실제 Entity처럼 남기지 않는다.

input row를 그대로 유지하고 retry 가능.

---

# 6.32 Duplicate Submission

submitting 동안 Enter 재입력:

```text
no-op
```

두 Entity가 생성되지 않게 한다.

---

# 6.33 Cancel — Space

Escape / blur:

```text
create state clear
+ 공간 row 복원
focus → create trigger
```

trigger가 Header `+`였으면:

```text
focus → Header +
```

Tree bottom `+ 공간`이었으면:

```text
focus → + 공간 row
```

---

# 6.34 Cancel — Project

Escape / blur:

```text
input 제거
기존 tree 복원
focus → 시작 trigger
```

Space row trailing `+`에서 시작했다면 그 버튼으로 복원.

empty action에서 시작했다면:

```text
focus → + 첫 프로젝트 만들기
```

---

# 6.35 Remember Create Origin

권장:

```ts
type CreateOrigin =
  | "spaces-header-plus"
  | "spaces-bottom-row"
  | { type: "space-trailing-plus"; spaceId: string }
  | { type: "empty-space-create"; spaceId: string }
  | { type: "space-context-menu"; spaceId: string };
```

cancel/focus restoration에 사용한다.

---

# 6.36 Only One Create Session

P0에서 동시에 하나의 create input만 열 수 있다.

예:

```text
Space create active
→ Project + click
→ 기존 Space create cancel
→ Project create 시작
```

또는 commit하지 않는다.

final:

```text
새 create action 시작 시 기존 create session cancel
```

---

# 6.37 Create vs Rename Mutual Exclusion

동시에 create와 rename을 열지 않는다.

새 create 시작 시:

```text
active rename → commit if valid? 
```

P0 final:

```text
active rename → cancel
→ create start
```

반대도 동일:

```text
active create → cancel
→ rename start
```

---

# 6.38 Create vs Context Menu

create input open 시 기존 context menu는 닫는다.

context menu open 중 create action 선택:

```text
menu close
→ create input mount
→ focus input
```

---

# 6.39 Create vs DnD

create input이 열려 있는 동안:

- 해당 create row draggable 아님
- parent Space DnD는 비활성화 권장
- 다른 Space/Project DnD는 가능하지만 UX 복잡성 때문에 P0 final:

**Tree 전체 DnD를 create session 동안 잠시 비활성화한다.**

create 종료 후 복원.

---

# 6.40 Create vs Sidebar Collapse

create input open 상태에서 Sidebar collapse action:

```text
cancel create
→ collapse
```

자동 submit하지 않는다.

---

# 6.41 Create vs Global Module Switch

create input open:

```text
Tasks → Calendar/Focus/Settings
```

시:

```text
cancel create
→ navigate
```

draft를 저장하지 않는다.

---

# 6.42 Create vs Search

Search overlay를 열 때:

P0 final:

```text
create session 유지
```

Search overlay가 닫히면 기존 create input으로 focus 복원.

단, Search 결과 navigation을 실행하면 create session cancel.

---

# 6.43 Create vs Account Popover

Account popover open:

```text
create session 유지
```

Account action으로 module/navigation이 변경되면 cancel.

---

# 6.44 Create vs Browser Back

create input 자체는 route를 바꾸지 않았으므로 Browser Back을 create cancel로 hijack하지 않는다.

Back은 browser history대로 동작.

route 이동이 발생하면 create session cancel.

---

# 6.45 Create via Keyboard Shortcut

P0에서 새 global shortcut을 추가하지 않는다.

예:

```text
N
Cmd+N
```

등을 Sidebar redesign 이유로 임의 추가하지 않는다.

Quick Add는 기존 기능이 있다면 별도 유지.

---

# 6.46 Create Trigger Tooltip

Spaces header `+`:

```text
공간 만들기
```

Space trailing `+`:

```text
프로젝트 만들기
```

Empty action은 text label이 있으므로 tooltip 필수 아님.

---

# 6.47 Create Trigger ARIA

Spaces header:

```text
aria-label="공간 만들기"
```

Space trailing:

```text
aria-label="<Space 이름>에 프로젝트 만들기"
```

Empty Space:

```text
aria-label="<Space 이름>에 첫 프로젝트 만들기"
```

---

# 6.48 Inline Input ARIA

Space:

```text
aria-label="새 공간 이름"
```

Project:

```text
aria-label="<Space 이름>의 새 프로젝트 이름"
```

error:

```text
aria-invalid="true"
```

필요 시 `aria-describedby`로 validation message 연결.

---

# 6.49 Enter During IME Composition

한국어 입력 중 Enter가 IME 조합 확정에 사용될 수 있다.

따라서:

```ts
if (event.isComposing || nativeEvent.isComposing) {
  return;
}
```

IME composition 중 Enter를 create submit으로 처리하지 않는다.

이건 P0 필수.

---

# 6.50 Escape During IME Composition

IME composition 중 Escape 동작은 브라우저/IME에 맡긴다.

composition 종료 전 create cancel을 강제하지 않도록 이벤트 상태를 확인한다.

---

# 6.51 Space Create Scroll Behavior

Tree가 길어 `+ 공간` row가 viewport 아래에 있을 때 Header `+`를 누르면:

```text
1. inline create row mount
2. row scrollIntoView({ block: "nearest" })
3. focus input
```

---

# 6.52 Project Create Scroll Behavior

대상 Space의 새 input이 viewport 밖이면:

```text
scrollIntoView({ block: "nearest" })
```

center 사용하지 않는다.

---

# 6.53 Collapsed Space Project Create

Space trailing `+`는 collapsed row에서도 visible할 수 있다.

click:

```text
1. expand Space
2. create input last child에 mount
3. scroll nearest
4. focus
```

---

# 6.54 Project Create from Context Menu

Space context menu → 새 프로젝트:

```text
1. menu close
2. parent Space expand
3. create input mount
4. focus
```

trailing `+`와 동일 flow.

---

# 6.55 Space Create when No Spaces Exist

No Spaces empty state에서 CTA `공간 만들기` 클릭 시:

```text
empty state → inline Space input
```

Header `+`와 같은 create session.

---

# 6.56 No Space Required for Project

Project는 반드시 parent Space가 필요하다.

P0에서:

```text
Space 없는 상태에서 global Project create
```

를 허용하지 않는다.

Project create 진입점은 Space context 안에서만 제공한다.

---

# 6.57 Default Project Parent

별도 global create가 없으므로 default parent resolution 불필요.

향후 Quick Add가 Project 생성까지 지원한다면 별도 parent picker가 필요하다.

---

# 6.58 Create Ordering Command

Space:

```ts
createSpace({
  name,
  sortOrder: getNextSpaceOrder(),
})
```

Project:

```ts
createProject({
  name,
  spaceId,
  sortOrder: getNextProjectOrder(spaceId),
})
```

정확 schema는 domain model에 맞춘다.

---

# 6.59 ID Ownership

client가 id를 생성하는 architecture라면 기존 규칙 유지.

server가 id를 생성한다면 create 성공 전 route navigation을 하지 않는다.

Sidebar UX가 id strategy를 새로 결정하지 않는다.

---

# 6.60 Create Command Boundary

UI component가 직접 Supabase/DB insert를 호출하지 않는 구조를 권장한다.

예:

```text
CreateSpaceInline
→ domain command / service
→ repository / backend
```

Project도 동일.

---

# 6.61 Success Update Strategy

create 성공 후 Tree 데이터 반영은 existing state/query architecture를 따른다.

권장:

```text
optimistic cache insert 또는 query update
```

불필요한 full page reload 금지.

---

# 6.62 Full Reload Prohibition

생성 후:

```text
window.location.reload()
```

같은 전체 reload를 사용하지 않는다.

Sidebar width, expand state, scroll state를 잃을 수 있다.

---

# 6.63 Create Analytics Semantics

analytics가 있다면:

```text
space_create_started
space_create_completed
space_create_cancelled

project_create_started
project_create_completed
project_create_cancelled
```

entry point metadata:

```text
origin
```

을 붙일 수 있다.

analytics가 없다면 새 SDK를 추가하지 않는다.

---

# 6.64 Loading after Create

새 Space/Project의 Main Content가 추가 data loading을 필요로 해도:

```text
Sidebar new row는 즉시 표시
selected state는 route 기준
Main은 skeleton/loading 처리
```

Sidebar 생성 결과가 Main loading 때문에 사라지지 않는다.

---

# 6.65 Create Success + Sidebar Overlay Mode

narrow viewport overlay에서 Project/Space 생성 성공:

```text
1. create 성공
2. navigation
3. Sidebar overlay close
```

§3 overlay navigation rule과 일치.

---

# 6.66 Create Cancel + Sidebar Overlay Mode

cancel:

```text
overlay 유지
```

사용자가 계속 다른 항목을 선택할 수 있게 한다.

---

# 6.67 Create Error + Sidebar Overlay Mode

error 시:

```text
overlay 유지
input 유지
```

---

# 6.68 Rename Style Reuse

§5 inline rename과 Create input은 가능한 한 같은 input primitive를 재사용한다.

공통:

```text
height 28px
focus ring
error state
IME handling
Enter/Escape
```

다른 점:

```text
Create blur = cancel
Rename blur = commit
```

이 차이를 primitive API에서 명확히 분리한다.

---

# 6.69 Suggested Input Primitive

```ts
type SidebarInlineEditorProps = {
  mode: "create" | "rename";
  value: string;
  placeholder?: string;
  ariaLabel: string;
  submitting?: boolean;
  invalid?: boolean;

  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;

  blurBehavior: "cancel" | "commit";
};
```

---

# 6.70 Suggested Create Controller

```ts
type SidebarCreateController = {
  state: CreateUIState;

  startSpaceCreate(origin: CreateOrigin): void;

  startProjectCreate(
    spaceId: string,
    origin: CreateOrigin
  ): void;

  setDraftName(name: string): void;
  submit(): Promise<void>;
  cancel(): void;
};
```

---

# 6.71 Create Session Invariants

## INV-CREATE-01

동시에 하나의 create session만 존재한다.

## INV-CREATE-02

Project create는 항상 valid parentSpaceId를 가진다.

## INV-CREATE-03

Create session은 route selected state를 즉시 바꾸지 않는다.

## INV-CREATE-04

성공한 뒤에만 새 Entity가 selected Scope가 된다.

## INV-CREATE-05

Escape/blur cancel은 backend mutation을 발생시키지 않는다.

## INV-CREATE-06

Submitting 중 duplicate submit이 발생하지 않는다.

## INV-CREATE-07

IME composition 중 Enter는 submit이 아니다.

---

# 6.72 Interaction Test Cases

## CREATE-01 Header Space Create

```text
Given Tasks Sidebar open
When Spaces header + is clicked
Then inline Space input appears at tree bottom
And input is focused
```

## CREATE-02 Bottom Space Create

```text
When + 공간 row is clicked
Then the same inline Space input flow is used
```

## CREATE-03 Project Create

```text
Given s1 collapsed
When s1 trailing + is clicked
Then s1 expands
And Project input appears as last child
And input receives focus
```

## CREATE-04 Escape

```text
Given create input active
When Escape is pressed
Then create session cancels
And no Entity is created
```

## CREATE-05 Blur

```text
Given create input has text
When input loses focus without Enter
Then create session cancels
And no Entity is created
```

## CREATE-06 Empty name

```text
Given draftName = "   "
When Enter is pressed
Then create request is not sent
And input remains focused
```

## CREATE-07 Space Success

```text
Given valid Space name
When Enter and create succeeds
Then new Space is appended
And expanded
And selected
And navigation opens Space Overview
```

## CREATE-08 Project Success

```text
Given valid Project name under s1
When create succeeds
Then new Project is appended under s1
And selected
And navigation opens Project List
```

## CREATE-09 Failure

```text
Given create request fails
Then input remains
And draft name remains
And user can retry
```

## CREATE-10 IME

```text
Given Korean IME composition active
When Enter is used to confirm composition
Then create is not submitted
```

## CREATE-11 Create vs Rename

```text
Given rename active
When create starts
Then rename is cancelled
And exactly one create input exists
```

## CREATE-12 Narrow Overlay

```text
Given Sidebar overlay open
When Project creation succeeds
Then project navigation occurs
And Sidebar overlay closes
```

---

# 6.73 QA Checklist

- [ ] Space 생성은 Header `+`와 `+ 공간` 두 entry가 동일 flow를 사용한다.
- [ ] Project 생성은 Space trailing `+`, Empty Space CTA, context menu가 동일 flow를 사용한다.
- [ ] Space/Project 기본 생성에 Modal을 사용하지 않는다.
- [ ] Space input은 Tree 하단에 inline으로 열린다.
- [ ] Project input은 parent Space의 마지막 child 위치에 열린다.
- [ ] collapsed Space에서 Project create 시작 시 자동 expand된다.
- [ ] create input은 36px row 안의 28px input을 사용한다.
- [ ] input은 생성 시작 즉시 focus된다.
- [ ] Enter가 commit한다.
- [ ] Escape가 cancel한다.
- [ ] blur는 cancel한다.
- [ ] whitespace-only name은 submit되지 않는다.
- [ ] IME composition 중 Enter가 submit을 발생시키지 않는다.
- [ ] submitting 중 duplicate Enter가 중복 생성하지 않는다.
- [ ] create request 실패 시 draft가 유지된다.
- [ ] create 성공 전 실제 Entity route로 이동하지 않는다.
- [ ] Space 생성 성공 후 새 Space가 selected + expanded된다.
- [ ] Space 생성 성공 후 Space Overview로 이동한다.
- [ ] Project 생성 성공 후 parent Space가 expanded 유지된다.
- [ ] Project 생성 성공 후 새 Project가 selected된다.
- [ ] Project 생성 성공 후 Project List로 이동한다.
- [ ] 신규 Entity는 해당 list 마지막에 삽입된다.
- [ ] create 중 Sidebar collapse 시 create가 cancel된다.
- [ ] global module 이동 시 create가 cancel된다.
- [ ] Search overlay open 자체는 create session을 취소하지 않는다.
- [ ] Search 결과 navigation 시 create가 cancel된다.
- [ ] 동시에 두 create input이 열리지 않는다.
- [ ] create와 rename이 동시에 열리지 않는다.
- [ ] create session 동안 Tree DnD가 비활성화된다.
- [ ] cancel 시 시작 trigger로 focus가 복원된다.
- [ ] overlay mode에서 create 성공 후 Sidebar overlay가 닫힌다.
- [ ] 생성 후 full page reload를 사용하지 않는다.
- [ ] Space/Project create command가 UI component에 DB 세부를 직접 노출하지 않는다.

---

# 6.74 Acceptance Criteria

## AC-CREATE-01

모든 Space 생성 진입점은 동일한 inline create-space flow를 사용한다.

## AC-CREATE-02

모든 Project 생성 진입점은 parent Space를 명시하는 동일한 inline create-project flow를 사용한다.

## AC-CREATE-03

기본 생성은 Modal/Popover 없이 Sidebar inline editor로 처리한다.

## AC-CREATE-04

Enter commit / Escape cancel / blur cancel이 일관되게 동작한다.

## AC-CREATE-05

IME composition 중 Enter가 Entity 생성으로 오인되지 않는다.

## AC-CREATE-06

성공하기 전에는 현재 Scope/route가 바뀌지 않는다.

## AC-CREATE-07

Space 생성 성공 후 새 Space가 expanded + selected되고 Space Overview로 이동한다.

## AC-CREATE-08

Project 생성 성공 후 새 Project가 selected되고 Project List로 이동한다.

## AC-CREATE-09

실패 시 draft input과 focus를 유지하여 즉시 retry 가능하다.

## AC-CREATE-10

동시에 하나의 create/rename edit session만 존재한다.

## AC-CREATE-11

생성 UX는 Sidebar collapse/module switch/overlay navigation과 충돌하지 않는다.

## AC-CREATE-12

생성 성공이 full page reload 없이 Tree와 Main Content에 반영된다.

---

# 6.75 최종 결정 요약

```text
SPACE CREATE
Inline at tree bottom
```

```text
PROJECT CREATE
Inline as last child of target Space
```

```text
MODAL
No
```

```text
ENTER
Commit
```

```text
ESCAPE
Cancel
```

```text
BLUR
Cancel
```

```text
SPACE SUCCESS
Append
Expand
Select
Navigate → Space Overview
```

```text
PROJECT SUCCESS
Append
Select
Navigate → Project List
```

```text
ERROR
Keep input + draft + focus
```

```text
IME
Composition Enter ≠ submit
```

```text
CONCURRENCY
One create/rename session only
```

---

# 6.76 §6에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- Space 생성 entry point 통합
- Project 생성 entry point 통합
- Modal/Popover 미사용
- Inline create 위치
- collapsed Space 자동 expand
- Enter/Escape/blur 정책
- 이름 trim validation
- duplicate submit 방지
- IME handling
- success 후 selection
- success 후 navigation
- new Entity append 위치
- create failure retry
- create/rename mutual exclusion
- create 중 DnD 비활성화
- module switch/collapse 시 cancel
- Search overlay와의 상호작용
- overlay mode success 후 close
- full reload 금지

---

# 7. Main Content 연동

- 상태: **확정**
- 우선순위: **P0**
- 적용 대상: `Today / Upcoming / Space / Project / Archive`
- 목적: Sidebar에서 선택된 **Scope**와 Main Header / View Switcher / Main Body가 항상 같은 대상을 가리키도록 하고, `Scope 변경`과 `View 변경`을 UI·상태·route 수준에서 분리한다.
- 선행: §1 Navigation IA, §3 Context Sidebar Frame, §4 Tasks Sidebar, §5 Space / Project Tree, §6 Create UX
- 후속: §8 URL / Navigation State

---

# 7.1 핵심 결정

Main Content는 아래 3영역으로 구성한다.

```text
Main Header
Optional View Switcher
Main Body
```

구조:

```text
┌─────────────────────────────────────────────────────────────┐
│ Main Header                                                 │ 56px
├─────────────────────────────────────────────────────────────┤
│ View Switcher (Space / Project only)                        │ 40px
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Main Body                                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Smart View와 Archive는 View Switcher를 사용하지 않는다.

```text
Today      → Header + Body
Upcoming   → Header + Body
Archive    → Header + Body

Space      → Header + View Switcher + Body
Project    → Header + View Switcher + Body
```

---

# 7.2 가장 중요한 상태 분리

Main Content는 아래 두 상태를 절대 혼합하지 않는다.

```text
Scope
= 무엇을 보고 있는가

View
= 그것을 어떤 방식으로 보는가
```

예:

```text
Scope = Project p1
View  = Board
```

에서:

```text
Board → Gantt
```

는 Scope 변경이 아니다.

반대로:

```text
Project p1 → Project p2
```

는 View가 같은 Board여도 Scope 변경이다.

---

# 7.3 Rendering Contract

개념:

```ts
type MainRenderContext = {
  globalModule: GlobalModule;
  scope: Scope | null;
  view: SpaceView | ProjectView | null;
};
```

Tasks module에서는:

```text
scope 반드시 존재
```

Calendar / Focus / Settings는 이 section의 Scope renderer를 사용하지 않는다.

---

# 7.4 Scope → Main Structure Matrix

| Scope | Header title | View Switcher | Main Body |
|---|---|---|---|
| Today | 오늘 | 없음 | Today View |
| Upcoming | 다가오는 일정 | 없음 | Upcoming View |
| Space | Space name | Space View Switcher | Space View |
| Project | Project name | Project View Switcher | Project View |
| Archive | 보관함 | 없음 | Archive View |

---

# 7.5 Main Root Geometry

Main root:

```css
.mainRegion {
  min-width: 0;
  min-height: 0;

  height: 100dvh;

  display: flex;
  flex-direction: column;

  overflow: hidden;
}
```

Main root 자체를 page vertical scroll owner로 만들지 않는다.

Header와 View Switcher는 고정되고 Body가 남은 높이를 사용한다.

---

# 7.6 Main Header Geometry

```text
height: 56px
min-height: 56px
max-height: 56px

padding-left: 20px
padding-right: 16px

display: flex
align-items: center
```

구조:

```text
[optional sidebar open] [title area................] [actions]
```

---

# 7.7 Main Header Title Typography

P0 semantic:

```text
font-size: 18px
font-weight: 600
line-height: 24px
```

Entity 이름이 길면:

```text
white-space: nowrap
overflow: hidden
text-overflow: ellipsis
min-width: 0
```

Header title 때문에 action 영역이 밀려나지 않는다.

---

# 7.8 Header Leading Slot

Tasks module에서 Context Sidebar를 열기 위한 button이 필요할 때만 leading slot을 표시한다.

조건:

```text
A. desktop persistent mode + Sidebar collapsed
B. narrow overlay mode + Sidebar closed
```

그 외에는 표시하지 않는다.

---

# 7.9 Sidebar Open Button

button:

```text
32 × 32px
icon: 18px
radius: 8px
```

label:

```text
사이드바 펼치기
```

narrow overlay mode에서는 의미상:

```text
사이드바 열기
```

라고 tooltip/aria-label을 사용해도 된다.

---

# 7.10 Header Leading Gap

Sidebar open button이 존재할 때:

```text
button → title gap: 8px
```

존재하지 않을 때 불필요한 blank placeholder를 유지하지 않는다.

즉 Sidebar collapse/expand에 따라 title x-position이 일부 이동하는 것을 허용한다.

P0에서는 이를 막기 위한 빈 32px slot을 상시 두지 않는다.

---

# 7.11 Header Action Region

right side:

```text
display: flex
align-items: center
gap: 4px
flex-shrink: 0
```

P0 shell-level actions는 최소화한다.

---

# 7.12 Smart View Header Actions

Today:

```text
없음
```

Upcoming:

```text
없음
```

Archive:

```text
없음
```

기존 feature에 `작업 추가` 등의 Main action이 이미 있다면 Body 또는 기존 Quick Add primitive를 유지할 수 있다.

Sidebar redesign 때문에 새로운 Header CTA를 임의 추가하지 않는다.

---

# 7.13 Space Header Actions

Space Header 우측에는 P0에서 entity `더보기` action 하나를 제공한다.

```text
···
```

button:

```text
32 × 32px
icon: 18px
radius: 8px
```

menu는 §5 Space context menu와 동일 command source를 재사용한다.

즉 Main Header용 별도 action semantics를 만들지 않는다.

---

# 7.14 Space Header More Menu

P0:

```text
이름 바꾸기
새 프로젝트
────────────
보관
삭제
```

Sidebar Space menu와 동일하다.

다만 Main Header에서 `이름 바꾸기` 선택 시 rename UX는 Sidebar inline input이 아니라 Main Header title rename으로 이어질 수 있다.

P0 final:

**Main Header에서 Rename 선택 시 Main Header title inline rename을 사용한다.**

이유:

- Sidebar가 collapsed일 수 있음
- 사용자가 action을 실행한 위치에서 바로 편집
- hidden Sidebar를 강제로 열지 않음

---

# 7.15 Project Header Actions

Project Header 우측:

```text
···
```

P0 menu:

```text
이름 바꾸기
────────────
이동
보관
삭제
```

§5 Project context menu와 동일 command source를 사용한다.

---

# 7.16 Header More Menu State

Main Header의 menu open은 Sidebar context menu state와 동시에 열리지 않는다.

```text
open Main Header menu
→ close Sidebar entity menu
```

반대도 동일.

Global Account/Search overlay와는 global overlay 정책을 따른다.

---

# 7.17 Main Header Inline Rename

Space / Project Header `이름 바꾸기` 실행 시 title이 inline input으로 변한다.

geometry:

```text
input height: 32px
max width: min(480px, available title width)
```

Enter:

```text
commit
```

Escape:

```text
cancel
```

Blur:

```text
commit
```

IME handling은 §6/§5와 동일.

---

# 7.18 Header Rename Synchronization

Header rename 성공 시:

- Main Header title update
- Sidebar Entity label update
- Search index/cache update 필요 시 data layer 처리
- route id는 변경하지 않음

name이 route slug에 포함되는 architecture라면 §8 route 정책을 따른다.

P0 IA는 id-based route를 권장한다.

---

# 7.19 Header Rename Failure

실패:

- 기존 title 복원
- focus 유지 또는 title button에 복원
- existing toast/error system 사용

Sidebar label도 기존 값 유지.

---

# 7.20 Breadcrumb Policy

P0 Main Header에는 **상시 breadcrumb를 표시하지 않는다.**

예:

```text
My Space / fNIRS 졸업 논문
```

을 기본으로 사용하지 않는다.

## 이유

- Context Sidebar가 hierarchy를 이미 제공
- compact TickTick-like Main Header 유지
- Project 이름을 핵심 title로 명확히 보이게 함
- Sidebar collapsed 상태에서도 Project title 자체만으로 현재 Scope 식별 가능

향후 cross-Space 이동이 잦아 parent context 필요성이 검증되면 secondary breadcrumb를 별도 추가한다.

---

# 7.21 Main Header Icon Policy

P0에서 Main Header title 앞에 Space/Project icon을 필수로 표시하지 않는다.

Sidebar에 이미 entity icon이 존재한다.

Main Header는 text title 중심.

Smart View에도 Today icon을 title 옆에 반복하지 않는다.

---

# 7.22 Today Header

표시:

```text
오늘
```

optional secondary metadata:

```text
8월 19일 수요일
```

P0 final:

**짧은 local-date metadata를 title 오른쪽에 muted text로 표시한다.**

개념:

```text
오늘   8월 19일 수요일
```

date metadata:

```text
font-size: 12px
font-weight: 400
```

actual formatting은 locale-aware date formatter 사용.

---

# 7.23 Today Date Semantics

`오늘`의 날짜는 client local timezone 기준.

hardcoded string 금지.

route 자체에는 date를 중복 저장하지 않는다.

날짜가 자정에 바뀌면 Today 화면이 열린 상태에서 date label도 업데이트되어야 한다.

정확 refresh timing은 app clock utility에 맞춘다.

---

# 7.24 Upcoming Header

```text
다가오는 일정
```

secondary metadata 없음.

---

# 7.25 Archive Header

```text
보관함
```

secondary metadata 없음.

---

# 7.26 Space Header

```text
<Space.name>                                  ···
```

예:

```text
My Space                                      ···
```

Space View active 상태는 아래 View Switcher에서 표시한다.

Header title 자체에:

```text
My Space · Goals
```

처럼 View label을 붙이지 않는다.

---

# 7.27 Project Header

```text
<Project.name>                                ···
```

예:

```text
fNIRS 졸업 논문                              ···
```

현재 Board/Gantt 등의 View label을 title에 붙이지 않는다.

---

# 7.28 View Switcher Eligibility

View Switcher가 존재하는 Scope:

```text
Space
Project
```

존재하지 않는 Scope:

```text
Today
Upcoming
Archive
```

---

# 7.29 View Switcher Geometry

```text
height: 40px
min-height: 40px

padding-left: 16px
padding-right: 16px

display: flex
align-items: flex-end
```

background:

```text
Main surface
```

Header와 같은 surface를 사용한다.

---

# 7.30 View Switcher Tab Geometry

tab:

```text
height: 36px
padding-left: 10px
padding-right: 10px

display: inline-flex
align-items: center

position: relative
```

gap between tabs:

```text
4px
```

---

# 7.31 View Switcher Typography

```text
font-size: 13px
line-height: 20px
font-weight: 500 default
```

active:

```text
font-weight: 600
```

---

# 7.32 Active View Indicator

P0는 filled pill보다 **bottom indicator**를 사용한다.

```text
indicator height: 2px
indicator width: tab content width or tab inset width
```

tab bottom에 위치.

active text + 2px indicator로 표현.

---

# 7.33 View Switcher Hover

hover:

- text color 강화
- optional very light background
- geometry 변화 없음

P0 권장:

```text
background 없음
text color만 변경
```

active tab hover에서도 indicator 유지.

---

# 7.34 View Switcher Divider

Space/Project에서는 View Switcher 아래에 1px horizontal divider를 둔다.

Header와 View Switcher 사이에는 divider 없음.

즉:

```text
Header
View Switcher
──────────── 1px
Body
```

---

# 7.35 Header Divider without View Switcher

Today / Upcoming / Archive처럼 View Switcher가 없으면 Header 아래에 1px divider를 둔다.

즉 항상 Main Body 시작 직전에 divider 하나만 존재한다.

double divider 금지.

---

# 7.36 Space View Registry

P0 order:

```text
Overview
Projects
Goals
Horizons
```

한국어 UI label 권장:

```text
개요
프로젝트
목표
지평
```

실제 product terminology가 이미 정해져 있으면 기존 label 유지 가능.

---

# 7.37 Space Default View

Space Entity를 직접 클릭했을 때 fallback default:

```text
Overview
```

last-view restore가 존재하면 §8에서 적용 가능.

P0 route가 명시적으로 `/space/:id/goals`이면 Goals active.

---

# 7.38 Space View Semantics

## Overview

Space 전체 요약.

## Projects

Space 하위 Project 집합.

## Goals

Space-level Goals.

## Horizons

Space-level Horizons.

각 View는 동일 `spaceId` Scope를 유지한다.

---

# 7.39 Space View Switch Contract

예:

```text
Space s1 / Overview
→ Goals click
```

결과:

```text
activeScope.type = "space"
activeScope.id = s1
activeView = "goals"
```

Sidebar:

```text
s1 selected 유지
```

---

# 7.40 Project View Registry

P0 order:

```text
Overview
List
Board
Gantt
Calendar
```

한국어 UI:

```text
개요
리스트
보드
간트
캘린더
```

---

# 7.41 Project Default View

P0 fallback:

```text
List
```

이는 tab order 첫 번째가 Overview인 것과 모순되지 않는다.

`default`와 `visual order`는 다른 개념이다.

---

# 7.42 Project View Switch Contract

예:

```text
p1 / List
→ Board
```

결과:

```text
activeScope remains p1
activeView = board
```

Sidebar:

```text
p1 selected 유지
```

Global Rail:

```text
Tasks active 유지
```

---

# 7.43 Project Calendar vs Global Calendar

Project View Switcher의:

```text
캘린더
```

클릭은:

```text
Project Calendar
```

이다.

Global Rail Calendar active로 바꾸지 않는다.

예:

```text
/project/p1/calendar
```

Rail:

```text
Tasks active
Calendar inactive
```

---

# 7.44 Tab Link Semantics

View Switcher tab은 가능한 경우 실제 route link를 사용한다.

이유:

- Cmd/Ctrl click
- browser history
- deep link
- active route derivation

tab을 단순 local state button으로만 구현하지 않는다.

---

# 7.45 View Switcher Overflow

Project View 5개가 좁은 width에서 한 줄에 들어가지 않을 수 있다.

P0:

```text
no wrap
horizontal scroll
```

```css
overflow-x: auto;
overflow-y: hidden;
white-space: nowrap;
```

tab이 두 줄로 내려가지 않는다.

---

# 7.46 Scrollbar Visibility

View Switcher horizontal scrollbar는 가능하면 platform overlay/native 방식 사용.

스크롤바를 숨기기 위해 접근성을 해치는 hack을 넣지 않는다.

---

# 7.47 Active Tab Auto-reveal

narrow width에서 active tab이 viewport 밖이면 route change 후:

```text
scrollIntoView({
  block: "nearest",
  inline: "nearest"
})
```

---

# 7.48 Main Body Geometry

```css
.mainBody {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
```

View가 사용하는 scroll model에 따라 overflow를 결정한다.

---

# 7.49 Main Scroll Modes

P0는 두 종류를 지원한다.

```ts
type MainScrollMode =
  | "document"
  | "contained";
```

## document

Main Body가 vertical scroll owner.

적합:

- Today
- Upcoming
- Space Overview
- Space Projects
- Space Goals
- Space Horizons
- Project Overview
- Project List
- Archive

## contained

View 자체가 내부 scrolling/canvas layout을 소유.

적합 가능:

- Project Board
- Project Gantt
- Project Calendar

실제 기존 View 구현을 우선한다.

---

# 7.50 Document Scroll Mode

```css
.mainBody[data-scroll-mode="document"] {
  overflow-y: auto;
  overflow-x: hidden;
}
```

---

# 7.51 Contained Scroll Mode

```css
.mainBody[data-scroll-mode="contained"] {
  overflow: hidden;
}
```

View root가 자체:

```text
min-width: 0
min-height: 0
height: 100%
```

를 가져야 한다.

---

# 7.52 Header Sticky Policy

Header / View Switcher는 Main Body scroll container 밖에 있으므로 자연스럽게 고정된다.

별도:

```text
position: sticky
```

를 중복 사용하지 않는다.

---

# 7.53 Body Content Padding

Main Body padding은 View별로 소유한다.

Shell이 모든 View에 강제 24px padding을 주지 않는다.

이유:

- Board/Gantt/Calendar는 edge-to-edge canvas가 필요할 수 있음
- List/Overview는 content padding이 필요함

따라서 View descriptor에 layout variant를 둔다.

---

# 7.54 Main View Descriptor

권장 conceptual shape:

```ts
type MainViewDescriptor = {
  id: string;
  label: string;
  href: (scopeId: string) => string;
  scrollMode: "document" | "contained";
  layout: "padded" | "edge-to-edge";
};
```

---

# 7.55 Space View Descriptor Example

```ts
const SPACE_VIEWS = [
  {
    id: "overview",
    label: "개요",
    scrollMode: "document",
    layout: "padded",
  },
  {
    id: "projects",
    label: "프로젝트",
    scrollMode: "document",
    layout: "padded",
  },
  {
    id: "goals",
    label: "목표",
    scrollMode: "document",
    layout: "padded",
  },
  {
    id: "horizons",
    label: "지평",
    scrollMode: "document",
    layout: "padded",
  },
];
```

---

# 7.56 Project View Descriptor Example

```ts
const PROJECT_VIEWS = [
  {
    id: "overview",
    label: "개요",
    scrollMode: "document",
    layout: "padded",
  },
  {
    id: "list",
    label: "리스트",
    scrollMode: "document",
    layout: "padded",
  },
  {
    id: "board",
    label: "보드",
    scrollMode: "contained",
    layout: "edge-to-edge",
  },
  {
    id: "gantt",
    label: "간트",
    scrollMode: "contained",
    layout: "edge-to-edge",
  },
  {
    id: "calendar",
    label: "캘린더",
    scrollMode: "contained",
    layout: "edge-to-edge",
  },
];
```

기존 View 구현이 다른 scroll ownership을 가진다면 descriptor만 조정한다.

---

# 7.57 View Registry Single Source

Header View Switcher와 Router가 서로 다른 View 배열을 갖지 않는다.

권장:

```text
View Registry
→ tab label
→ route segment
→ scroll mode
→ layout
→ component
```

를 한 source에서 관리.

---

# 7.58 Main Renderer

개념:

```ts
switch (scope.type) {
  case "smart":
    return renderSmartView(scope);

  case "space":
    return renderSpaceView(scope.id, activeSpaceView);

  case "project":
    return renderProjectView(scope.id, activeProjectView);

  case "archive":
    return renderArchive();
}
```

Project Board 같은 View가 Scope selection을 직접 바꾸지 않는다.

---

# 7.59 Sidebar ↔ Main State Invariant

항상:

```text
Sidebar selected Scope
==
Main Header Scope
```

이어야 한다.

예:

Sidebar:

```text
Project A selected
```

Main Header:

```text
Project B
```

인 상태는 bug다.

---

# 7.60 Main Header ↔ View Switcher Invariant

Space Header이면 Space View Switcher만 렌더.

Project Header이면 Project View Switcher만 렌더.

예:

```text
Header = Project p1
Tabs = Goals / Horizons
```

금지.

---

# 7.61 Scope Switch while Preserving Compatible View

Project A Board → Project B를 Sidebar에서 클릭했을 때 View를 Board로 유지할지 default로 갈지는 §8에서 최종 확정한다.

§7 P0 baseline:

```text
Entity click → target Entity default/last valid View
```

현재 View를 무조건 carry over하지 않는다.

---

# 7.62 View Switch Does Not Expand Sidebar

Sidebar가 collapsed 상태에서 Main View Switcher로 Board → Gantt를 바꿔도 Sidebar는 collapsed 유지.

View action이 panel preference를 변경하지 않는다.

---

# 7.63 Scope Switch Does Not Change Sidebar Width

Today → Project / Project → Space 이동 시 Sidebar width와 collapse preference 유지.

---

# 7.64 Global Module Switch

Tasks Main Content에서 Calendar/Focus로 이동하면 해당 Global Module renderer로 Main 전체가 교체된다.

Tasks Header / View Switcher는 unmount한다.

Rail은 유지.

---

# 7.65 Search Overlay

Search는 Main underlying structure를 변경하지 않는다.

예:

```text
Project p1 / Gantt
→ Search open
```

underlying:

```text
Header p1
Tabs Gantt active
Body Gantt
```

그대로 유지.

Search result navigation 완료 후 새 Scope/Main으로 전환.

---

# 7.66 Account Popover

Account popover도 Main Content state를 변경하지 않는다.

---

# 7.67 Loading — Smart Views

Today / Upcoming은 title을 즉시 렌더할 수 있다.

Body만 loading skeleton 사용.

Header title skeleton 필요 없음.

---

# 7.68 Loading — Entity Scope

Space/Project deep link에서 Entity name을 아직 모르면 Header에서 title skeleton을 사용한다.

권장:

```text
width: 160~220px
height: 20px
```

More button은 Entity data가 확인될 때까지 disabled/hidden 가능.

---

# 7.69 Cached Entity Name

cache에서 name이 있으면 Header에 즉시 표시하고 background refresh 가능.

stale name 때문에 layout skeleton으로 되돌아가지 않는다.

---

# 7.70 View Switcher during Entity Loading

route segment가 유효하면 View Switcher는 즉시 렌더 가능.

예:

```text
/project/p1/gantt
```

Project name loading 중에도 Gantt tab active 표시 가능.

---

# 7.71 Entity Not Found

Project/Space fetch 결과가 definitively not found이면 stale Header를 유지하지 않는다.

route fallback 또는 dedicated not-found state를 적용.

P0 fallback:

## Project missing

parent Space를 route data/history에서 확정 가능하면:

```text
→ parent Space Overview
```

불가능하면:

```text
→ Today
```

## Space missing

```text
→ Today
```

정확 URL은 §8.

---

# 7.72 Deleted Active Project

현재 Project delete 성공 시:

```text
if parent Space exists:
  → parent Space Overview
else:
  → Today
```

Sidebar selection과 Main Header를 동시에 갱신.

---

# 7.73 Deleted Active Space

현재 Space delete 성공:

```text
→ Today
```

---

# 7.74 Archived Active Project

사용자가 현재 Project를 Archive:

```text
if parent Space remains active:
  → parent Space Overview
else:
  → Today
```

Archive view로 강제 이동하지 않는다.

이유:

- 사용자가 보관 action 후 원래 작업 맥락으로 자연스럽게 복귀
- Archive는 필요 시 직접 열 수 있음

---

# 7.75 Archived Active Space

Space archive:

```text
→ Today
```

---

# 7.76 Direct Link to Archived Entity

active Tree에서는 archived Entity가 없으므로 direct link가 archived entity를 가리키면:

```text
→ Archive scope
```

가능하면 해당 archived entity를 Archive Body에서 reveal.

구체 query/URL은 §8.

---

# 7.77 Remote Archive/Delete

다른 device/data sync로 현재 Entity가 사라진 경우에도 동일 fallback rule 적용.

Main Header에 존재하지 않는 Entity 이름을 계속 표시하지 않는다.

---

# 7.78 View Not Available

route가:

```text
/project/p1/horizons
```

처럼 Project에서 지원하지 않는 View를 가리키면:

```text
→ Project default View (List)
```

Space에서:

```text
/space/s1/board
```

처럼 invalid면:

```text
→ Space Overview
```

---

# 7.79 Invalid View Must Not Create Hybrid UI

invalid route를 그대로 두고:

```text
Space Header + Project Board component
```

같은 hybrid UI를 만들지 않는다.

Router/registry에서 먼저 canonical fallback.

---

# 7.80 Main Header More Menu — Collapsed Sidebar Requirement

Sidebar를 접은 상태에서도 Space/Project의 핵심 entity action은 Header `···`를 통해 접근 가능해야 한다.

이 때문에 Main Header More button은 P0 필수다.

---

# 7.81 Main Header More Menu — Expanded Sidebar

Sidebar가 펼쳐져 있어도 Header `···`를 숨기지 않는다.

동일 action이 두 위치에 존재해도 허용한다.

이유:

- Main에 집중하는 사용자의 pointer travel 감소
- Sidebar collapse 여부에 따라 기능 접근성이 달라지지 않음

---

# 7.82 Duplicate Action Source

Sidebar menu와 Header menu는 동일 domain command를 호출한다.

금지:

```text
Sidebar delete logic A
Header delete logic B
```

---

# 7.83 Header Action Tooltip

Main entity `···`:

```text
더보기
```

tooltip delay는 일반 button system을 따른다.

---

# 7.84 View Tab Tooltip

full label이 보이므로 기본 tooltip 없음.

label이 future localization에서 truncate되면 tooltip 허용.

---

# 7.85 Keyboard — Header

Tab order:

```text
optional Sidebar Open
→ Header More
→ View Switcher active/links
→ Main Body interactive content
```

Title 자체는 일반적으로 tab stop이 아니다.

rename input 상태일 때만 focusable.

---

# 7.86 Keyboard — View Switcher

기본 link semantics 사용.

P0에서는 ARIA tablist widget을 강제하지 않는다.

이유:

- 각 View가 distinct route
- link semantics가 browser history/new tab과 잘 맞음

따라서:

```text
Tab
Enter
Cmd/Ctrl click
```

을 표준대로 지원한다.

---

# 7.87 `aria-current`

현재 active View link:

```text
aria-current="page"
```

또는 route-aware link semantics 사용.

Sidebar selected Entity도 current page 의미를 가질 수 있으나 nested landmarks에서 중복 설명이 과하지 않게 한다.

---

# 7.88 Header Heading Semantics

Main title은:

```html
<h1>
```

로 제공하는 것을 권장한다.

각 View Body 내부의 section heading은:

```text
h2 이하
```

로 계층을 맞춘다.

---

# 7.89 Smart View Heading

Today:

```html
<h1>오늘</h1>
```

Upcoming:

```html
<h1>다가오는 일정</h1>
```

Archive:

```html
<h1>보관함</h1>
```

---

# 7.90 Entity Header Heading

Space/Project name도 `h1`.

View tab label을 heading에 포함하지 않는다.

예:

```text
h1 = fNIRS 졸업 논문
active tab = 간트
```

---

# 7.91 Route Announcement

SPA navigation 시 screen reader가 page change를 인지할 수 있도록 existing route announcer 또는 `document.title` update를 사용한다.

Sidebar row click마다 H1로 강제 focus 이동하는 것은 P0 기본 정책이 아니다.

---

# 7.92 Create Success Focus — Final Decision

§6에서 추천안으로 남겨둔 focus를 §7에서 최종 확정한다.

Space/Project 생성 성공 후 자동 navigation 시:

```text
focus → Main h1
```

로 이동한다.

즉 새 Sidebar row에 focus를 남기지 않는다.

## 이유

- 생성 후 페이지가 실제로 바뀌었음을 keyboard/screen-reader 사용자에게 알림
- 사용자가 바로 새 Space/Project의 본문 작업을 시작할 수 있음

이 항목이 §6의 “새 row focus 권장”보다 우선한다.

---

# 7.93 Ordinary Sidebar Navigation Focus

일반 Sidebar Project 클릭:

```text
focus는 클릭한 Sidebar row에 유지 가능
```

자동으로 Main H1로 강제 이동하지 않는다.

route announcer/document title로 화면 전환을 알린다.

Create Success만 특별히 H1 focus.

---

# 7.94 Document Title

권장:

Today:

```text
오늘 — FocusFlow
```

Space:

```text
My Space — FocusFlow
```

Project:

```text
fNIRS 졸업 논문 — FocusFlow
```

Project View 이름을 title에 넣을 수 있으나 P0 필수 아님.

---

# 7.95 Main Body Loading Layout Shift

Header/View Switcher geometry는 데이터 loading과 관계없이 먼저 확정한다.

Body skeleton 때문에 Header 높이가 변하지 않는다.

---

# 7.96 Error — View Data

Entity는 존재하지만 특정 View data loading 실패:

- Header 유지
- View Switcher 유지
- 해당 View Body만 error state
- 다른 tab으로 이동 가능

예:

```text
Project Gantt data error
≠ Project 전체 not found
```

---

# 7.97 Error — Entity Data

Entity 자체 fetch 실패:

일시 network error이면:

- Header skeleton 또는 cached title
- Body error + retry
- 즉시 not-found fallback 하지 않음

404/definitive missing일 때만 §7.71 fallback.

---

# 7.98 Main Empty States

empty는 View별로 소유한다.

예:

- Space Projects empty
- Project List empty
- Archive empty

Shell Header/View Switcher는 그대로 유지.

---

# 7.99 View Switch Preserves Main Shell

Board → Gantt 전환 시:

- Header unmount/recreate 불필요
- Space/Project title 유지
- Sidebar selection 유지
- View Switcher active만 변경
- Body renderer 교체

가능하면 Main Shell component를 안정적으로 유지한다.

---

# 7.100 Scope Switch Rebuilds Scope Header

Project A → Project B:

- Header title update
- Header menu target update
- View registry same Project registry 재사용
- Body target Project update

stale `Project A` More menu target이 남지 않게 한다.

---

# 7.101 Scope Identity Key

Main shell 전체를:

```text
key={projectId}
```

로 무조건 remount하는 것보다 필요한 view state reset만 명시적으로 처리하는 것을 권장한다.

Board/Gantt internal state 보존 정책은 각 View spec에 따른다.

---

# 7.102 View Internal State

예:

```text
Board column scroll
Gantt zoom
Calendar month
List sort
```

등은 Scope/View 내부 state다.

Global Rail이나 Sidebar selection state에 저장하지 않는다.

---

# 7.103 Scope Change Internal State

Project A Board의 scroll state를 Project B에 그대로 적용하지 않는다.

Scope id를 state key에 포함한다.

예:

```text
boardStateByProjectId
```

필요한 경우.

---

# 7.104 View Switch History

View Switcher click은 browser history entry를 만든다.

예:

```text
List
→ Board
→ Gantt
```

Browser Back:

```text
Gantt → Board → List
```

가능해야 한다.

정확 replace/push 정책은 §8.

---

# 7.105 Sidebar Scope History

Today → Project → Space도 browser history와 동기화.

Main local state만 바꾸는 방식 금지.

---

# 7.106 Main Header Title Click

P0에서 title click action 없음.

Space/Project title을 눌러 rename이나 dropdown을 열지 않는다.

명시적 `··· → 이름 바꾸기` 사용.

---

# 7.107 Main Header Double-click

별도 action 없음.

---

# 7.108 Main Header Right-click

custom menu 없음.

Entity context menu는 `···` 또는 Sidebar row right-click으로 제공.

---

# 7.109 View Switcher Context Menu

custom context menu 없음.

link browser behavior 유지.

---

# 7.110 Responsive Header

정확한 전체 responsive는 §12.

§7 P0 contract:

```text
Main Header height = 56px 유지
View Switcher = no-wrap horizontal scroll
Title = ellipsis
Actions = fixed hit target
```

viewport 좁다고 Header를 2줄로 늘리지 않는다.

---

# 7.111 Narrow Project Header

title이 너무 길면:

```text
[sidebar button] [Project name……] [···]
```

More button은 숨기지 않는다.

title만 줄인다.

---

# 7.112 Narrow Today Header

Today date metadata가 공간 부족하면 우선 숨길 수 있다.

우선순위:

```text
1. "오늘" title 유지
2. Sidebar open button 유지
3. date metadata hide
```

---

# 7.113 View Switcher Narrow Width

5 tabs는 horizontal scroll.

`More` dropdown으로 자동 축약하지 않는다.

P0에서 tab discoverability를 유지한다.

---

# 7.114 Header Surface

semantic tokens:

```css
--main-header-bg
--main-header-text
--main-header-muted
--main-header-divider

--main-view-tab-text
--main-view-tab-hover-text
--main-view-tab-active-text
--main-view-tab-indicator
```

실제 color는 §11.

---

# 7.115 Main Header Size Tokens

```css
--main-header-height: 56px;
--main-header-padding-left: 20px;
--main-header-padding-right: 16px;

--main-header-title-size: 18px;
--main-header-title-line-height: 24px;

--main-header-action-size: 32px;
--main-header-action-icon-size: 18px;
--main-header-action-radius: 8px;

--main-header-leading-gap: 8px;
```

---

# 7.116 View Switcher Tokens

```css
--main-view-switcher-height: 40px;
--main-view-switcher-padding-x: 16px;

--main-view-tab-height: 36px;
--main-view-tab-padding-x: 10px;
--main-view-tab-gap: 4px;

--main-view-tab-font-size: 13px;
--main-view-tab-indicator-height: 2px;

--main-body-divider-width: 1px;
```

---

# 7.117 Suggested Main Shell Structure

```tsx
<TasksMainShell>
  <MainHeader
    leading={sidebarOpenAction}
    title={scopeTitle}
    metadata={scopeMetadata}
    actions={scopeActions}
  />

  {viewRegistry ? (
    <MainViewSwitcher
      views={viewRegistry}
      activeView={activeView}
    />
  ) : null}

  <MainBody
    scrollMode={activeDescriptor.scrollMode}
    layout={activeDescriptor.layout}
  >
    {renderActiveView()}
  </MainBody>
</TasksMainShell>
```

---

# 7.118 Header Metadata Type

권장:

```ts
type MainHeaderMetadata =
  | { type: "date"; label: string }
  | null;
```

P0에서는 Today date만 사용.

Space/Project parent breadcrumb metadata는 사용하지 않는다.

---

# 7.119 Scope Header Resolver

```ts
function resolveMainHeader(scope: Scope, data: ScopeData) {
  switch (scope.type) {
    case "smart":
      if (scope.id === "today") {
        return {
          title: "오늘",
          metadata: getLocalTodayLabel(),
          actions: [],
        };
      }

      return {
        title: "다가오는 일정",
        metadata: null,
        actions: [],
      };

    case "space":
      return {
        title: data.space.name,
        metadata: null,
        actions: ["more"],
      };

    case "project":
      return {
        title: data.project.name,
        metadata: null,
        actions: ["more"],
      };

    case "archive":
      return {
        title: "보관함",
        metadata: null,
        actions: [],
      };
  }
}
```

---

# 7.120 View Registry Resolver

```ts
function resolveViewRegistry(scope: Scope) {
  if (scope.type === "space") return SPACE_VIEWS;
  if (scope.type === "project") return PROJECT_VIEWS;
  return null;
}
```

Smart View에 fake active View를 만들지 않는다.

---

# 7.121 Main View Active Derivation

active View는 route에서 derive.

local tab click state를 별도 source of truth로 두지 않는다.

예:

```text
/project/p1/board
→ activeView = board
```

---

# 7.122 Main Header Scope Derivation

Header title target도 route Scope id + entity data에서 derive.

Sidebar click event payload를 Header local state에 그대로 저장하지 않는다.

---

# 7.123 Deep Link Matrix

| Direct route semantic | Header | Selected Sidebar | Active View |
|---|---|---|---|
| Today | 오늘 | Today | none |
| Upcoming | 다가오는 일정 | Upcoming | none |
| Space Overview | Space name | Space | Overview |
| Space Goals | Space name | Space | Goals |
| Project List | Project name | Project | List |
| Project Board | Project name | Project | Board |
| Project Gantt | Project name | Project | Gantt |
| Project Calendar | Project name | Project | Calendar |
| Archive | 보관함 | Archive | none |

---

# 7.124 Sidebar Collapsed Matrix

| Scope | Sidebar collapsed | Main Header leading button |
|---|---|---|
| Today | Yes | Show |
| Upcoming | Yes | Show |
| Space | Yes | Show |
| Project | Yes | Show |
| Archive | Yes | Show |
| Calendar global | N/A | Tasks Sidebar button 없음 |
| Focus | N/A | Tasks Sidebar button 없음 |
| Settings | N/A | Tasks Sidebar button 없음 |

---

# 7.125 Overlay Mode Matrix

Tasks active + viewport <1024:

```text
Sidebar overlay closed
→ Main Header sidebar-open button visible
```

overlay open:

```text
button은 underlying Header에 남아도 되지만 backdrop 아래라 interaction 불가
```

Drawer 안 close button 사용.

---

# 7.126 Header Rename + Overlay Sidebar

Sidebar overlay가 열려 있는 상태에서 Main Header는 backdrop 아래라 접근 불가.

따라서 conflict 없음.

---

# 7.127 Main Menu Delete/Archive

Header More에서 delete/archive 성공 시 Sidebar row action과 동일 fallback navigation rule을 사용.

action origin이 다르다고 fallback이 달라지지 않는다.

---

# 7.128 Main Menu Move Project

Header Project menu의 `이동`도 §5 Project move picker를 재사용.

성공 시:

- Project route 유지
- Sidebar parent tree 위치 변경
- 새 parent auto-expand
- Header title 유지

---

# 7.129 Main Menu New Project

Space Header menu `새 프로젝트`는 §6 create flow와 동일 domain command를 사용해야 한다.

하지만 Sidebar가 collapsed일 수 있어 inline Sidebar input을 열 수 없는 문제가 있다.

P0 final:

**Space Header의 `새 프로젝트` 항목은 제거한다.**

즉 Main Header Space menu는:

```text
이름 바꾸기
────────────
보관
삭제
```

로 최종 확정한다.

Project 생성은 Sidebar Space `+` / context menu를 통해 수행.

## 이유

- Header action이 Sidebar를 강제로 펼치는 side effect 방지
- Create UX를 inline Sidebar로 일관되게 유지
- Header menu를 entity management에 집중

이 항목은 §7.14의 초기 menu 예시를 대체한다.

---

# 7.130 Final Space Header Menu

최종:

```text
이름 바꾸기
────────────
보관
삭제
```

Sidebar Space context menu는 여전히 `새 프로젝트`를 포함한다.

---

# 7.131 Final Project Header Menu

```text
이름 바꾸기
────────────
이동
보관
삭제
```

---

# 7.132 Main Header Rename vs Sidebar Rename

둘 다 동일 rename command.

UI 위치만 다름.

- Sidebar menu → Sidebar row inline rename
- Main Header menu → Main Header inline rename

동시에 두 rename editor가 열리지 않게 shared edit-session lock을 사용.

---

# 7.133 Shared Edit Session

§6 create/rename mutual exclusion을 Main Header rename에도 확장.

개념:

```ts
type EntityEditSession =
  | { type: "sidebar-create"; ... }
  | { type: "sidebar-rename"; ... }
  | { type: "header-rename"; ... }
  | null;
```

동시에 하나만.

---

# 7.134 Main Header Rename while Sidebar Create Active

Header rename 시작:

```text
cancel sidebar create
→ start header rename
```

Sidebar rename 시작 시 header rename도 cancel.

---

# 7.135 Main Body Error Boundary

View별 error boundary를 권장.

Project Board error가 Main Shell/Header/Sidebar까지 unmount시키지 않는다.

---

# 7.136 Main Body Suspense Boundary

loading boundary도 View Body 단위.

Header/View Switcher는 유지.

---

# 7.137 Focus after View Switch

tab link click 후 focus는 clicked tab link에 유지.

Main Body로 강제 이동하지 않는다.

route announcer/document title update 사용.

---

# 7.138 Focus after Scope Delete Fallback

삭제 confirmation dialog에서 delete 후 fallback navigation이 발생하면:

```text
focus → fallback Main h1
```

권장.

삭제된 trigger로 focus를 복원하려고 하지 않는다.

---

# 7.139 Focus after Archive Fallback

active Entity archive 후 fallback:

```text
focus → fallback Main h1
```

---

# 7.140 Main Header Delete Dialog Ownership

confirmation dialog는 shared destructive-action primitive 사용.

Header와 Sidebar가 서로 다른 dialog 디자인을 사용하지 않는다.

---

# 7.141 Context Sidebar Expand from Main Header

collapsed 상태에서 Main Header button으로 Sidebar를 펼쳐도:

- Main Scope 유지
- active View 유지
- Main Body scroll 위치 유지
- Header menu state 닫힘 여부는 자연스럽게 처리

P0 권장:

```text
Header menu open이면 close 후 Sidebar expand
```

---

# 7.142 Main Body Scroll Preservation — View Switch

View마다 독립 scroll position을 보존할 수 있으나 P0 필수 아님.

기본:

```text
new View route → top/start
```

Board/Gantt/Calendar contained view는 자체 state 정책.

---

# 7.143 Main Body Scroll Preservation — Global Module

Tasks → Calendar → Tasks restore 시 last Tasks route가 복원되더라도 Main Body scroll까지 반드시 복원할 필요는 없다.

P0:

```text
route restore 필수
scroll restore optional
```

Sidebar scroll restore와는 별개.

---

# 7.144 Main Body Scroll Reset — Scope Change

Project A → Project B:

document View는 기본 top으로 reset.

같은 Entity 내 View switch도 각 View initial position을 사용.

---

# 7.145 Main Body Overscroll

Main Body가 document scroll owner일 때 Header가 흔들리지 않게 App Shell overflow를 숨긴다.

---

# 7.146 Padded Layout Token

padded View 권장:

```text
content max width: View-specific
horizontal padding: 20~24px
vertical padding: 16~24px
```

정확 값은 각 Main View spec에서 결정.

§7에서는 Shell이 강제하지 않는다는 것만 확정.

---

# 7.147 Edge-to-edge Layout

Board/Gantt/Calendar는 divider 아래부터 available body를 100% 사용할 수 있다.

불필요한 outer 24px padding을 넣지 않는다.

---

# 7.148 Main Header Z-index

Header는 Main Body internal layers보다 위에 있어야 할 수 있지만 App Global overlays보다 아래.

semantic order:

```text
Main Body
<
Main Header / View Switcher
<
Context Sidebar overlay
<
Rail popover
<
Global Search
```

실제 z-index token은 §11.

---

# 7.149 Tooltip and Menu Portal

Header menus/tooltips은 Body overflow에 clip되지 않게 portal layer 사용.

---

# 7.150 View Switcher Route Failure

tab click route load 실패 시:

- active URL이 destination으로 바뀌었다면 해당 tab active 유지
- Body error 표시
- Header/Sidebar 유지

network error 때문에 이전 tab을 가짜 active로 유지하지 않는다.

---

# 7.151 Permission Failure

Entity route에 권한이 없으면 missing과 구분 가능할 경우 dedicated permission state 또는 fallback.

P0에서는 보안상 Entity name을 stale cache로 계속 보여주지 않는다.

정확 permission UX는 domain auth 정책에 따름.

---

# 7.152 Header Title Sanitization

Entity name은 text로 렌더.

HTML injection 허용하지 않는다.

---

# 7.153 View Label Localization

View ids는 stable internal id.

label만 locale에 따라 변한다.

예:

```text
id = "board"
label ko = "보드"
label en = "Board"
```

route segment localization은 권장하지 않는다.

§8에서 확정.

---

# 7.154 Today Date Localization

locale-aware formatter.

직접:

```text
`${month}월 ${day}일`
```

조합을 하드코딩하지 않는다.

---

# 7.155 Main Header Action Disabled State

Entity mutation in progress:

- relevant action만 disabled
- Header 전체 disabled 금지

예:

rename submitting 중 delete menu open 방지 가능.

---

# 7.156 Entity Mutation Lock

동일 Entity에 rename/delete/archive/move가 동시에 실행되지 않게 domain mutation guard 권장.

---

# 7.157 Main Header Skeleton Accessibility

skeleton 자체는 screen reader에서 장식 처리.

loading status는 View-level accessible status로 제공.

---

# 7.158 Header More Button ARIA

```text
aria-label="더보기"
aria-haspopup="menu"
aria-expanded={open}
```

---

# 7.159 View Switcher Navigation Landmark

권장:

```html
<nav aria-label="프로젝트 보기">
```

Space:

```html
<nav aria-label="공간 보기">
```

---

# 7.160 Main Landmark

Main Content:

```html
<main>
```

앱 shell 안에 중복 `<main>`이 생기지 않게 한다.

---

# 7.161 Main Header Structure Example — Today

```text
┌─────────────────────────────────────────────────────────────┐
│ [sidebar]  오늘   8월 19일 수요일                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Today Body                                                  │
└─────────────────────────────────────────────────────────────┘
```

`[sidebar]`는 collapsed/overlay closed일 때만.

---

# 7.162 Main Header Structure Example — Space

```text
┌─────────────────────────────────────────────────────────────┐
│ [sidebar]  My Space                                   ···   │
├─────────────────────────────────────────────────────────────┤
│ 개요   프로젝트   목표   지평                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Active Space View                                           │
└─────────────────────────────────────────────────────────────┘
```

---

# 7.163 Main Header Structure Example — Project

```text
┌─────────────────────────────────────────────────────────────┐
│ [sidebar]  fNIRS 졸업 논문                            ···   │
├─────────────────────────────────────────────────────────────┤
│ 개요   리스트   보드   간트   캘린더                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Active Project View                                         │
└─────────────────────────────────────────────────────────────┘
```

---

# 7.164 Scope/View Examples

## Example A — Today → Project

```text
Before
Scope = Today
View = null

Sidebar Project click

After
Scope = Project p1
View = project default/last
Header = p1.name
Tabs = Project tabs
```

---

# 7.165 Example B — Project List → Board

```text
Before
Scope = p1
View = list

Board click

After
Scope = p1
View = board
Header unchanged
Sidebar selection unchanged
Rail unchanged
```

---

# 7.166 Example C — Project → Space

```text
Before
Scope = Project p1
View = gantt

Space s1 click

After
Scope = Space s1
View = overview/last
Header = s1.name
Tabs = Space tabs
Project p1 no longer selected
```

---

# 7.167 Example D — Project Calendar → Global Calendar

```text
Before
activeGlobalModule = tasks
Scope = p1
View = calendar

Rail Calendar click

After
activeGlobalModule = calendar
Tasks Main Shell unmount
Global Calendar render
```

---

# 7.168 Example E — Global Calendar → Tasks Restore

```text
lastTasksLocation = Project p1 / calendar

Tasks Rail click

→ Tasks Main Shell
→ Project p1 Header
→ Project View Switcher
→ Calendar tab active
```

---

# 7.169 Example F — Sidebar Collapsed

```text
Scope = p1
View = board
Sidebar = collapsed

Main:
[open sidebar] p1.name                ···
Overview List [Board] Gantt Calendar
```

View change does not auto-open Sidebar.

---

# 7.170 Route-to-Shell Test Matrix

| Semantic route | Header | Tabs | Body |
|---|---|---|---|
| Today | 오늘 + date | none | Today |
| Upcoming | 다가오는 일정 | none | Upcoming |
| Space Overview | Space name | Space tabs / Overview | Overview |
| Space Projects | Space name | Space tabs / Projects | Projects |
| Space Goals | Space name | Space tabs / Goals | Goals |
| Space Horizons | Space name | Space tabs / Horizons | Horizons |
| Project Overview | Project name | Project tabs / Overview | Overview |
| Project List | Project name | Project tabs / List | List |
| Project Board | Project name | Project tabs / Board | Board |
| Project Gantt | Project name | Project tabs / Gantt | Gantt |
| Project Calendar | Project name | Project tabs / Calendar | Calendar |
| Archive | 보관함 | none | Archive |

---

# 7.171 Interaction Test Cases

## MAIN-01 Scope consistency

```text
Given Sidebar p1 selected
Then Main Header title is p1.name
```

## MAIN-02 Project View

```text
Given p1 selected
When Board is clicked
Then p1 remains selected
And Board becomes active
```

## MAIN-03 Space View

```text
Given s1 selected
When Goals is clicked
Then s1 remains selected
And Goals becomes active
```

## MAIN-04 Project Calendar

```text
Given /project/p1/calendar
Then Project Calendar tab is active
And Rail Tasks remains active
```

## MAIN-05 Global Calendar

```text
When Rail Calendar is clicked
Then Tasks Main Header/Tabs unmount
And Global Calendar renders
```

## MAIN-06 Header More

```text
Given Sidebar collapsed
When Project Header ··· is clicked
Then rename/move/archive/delete remain accessible
```

## MAIN-07 Header Rename

```text
When Project Header rename succeeds
Then Header title and Sidebar row label both update
```

## MAIN-08 Invalid Project View

```text
Given /project/p1/horizons
Then canonical fallback is Project List
And no hybrid Project+Horizons UI renders
```

## MAIN-09 Entity Missing

```text
Given p1 is definitively missing
And parent s1 is known
Then navigate to s1 Overview
```

## MAIN-10 Active Project Delete

```text
Given p1 active
When delete succeeds
Then fallback to parent Space Overview
And focus fallback h1
```

## MAIN-11 Create Success Focus

```text
Given a new Project is created
Then auto-navigation occurs
And focus lands on Main h1
```

## MAIN-12 Narrow tabs

```text
Given Project tabs exceed width
Then tabs remain one line
And horizontal scrolling is available
```

---

# 7.172 QA Checklist

- [ ] Main root는 Header / optional View Switcher / Body 세 영역으로 구성된다.
- [ ] Header height는 56px이다.
- [ ] View Switcher height는 40px이다.
- [ ] Today/Upcoming/Archive에는 View Switcher가 없다.
- [ ] Space에는 Space View Switcher만 표시된다.
- [ ] Project에는 Project View Switcher만 표시된다.
- [ ] Main Header title은 현재 Sidebar selected Scope와 일치한다.
- [ ] Project View 변경은 Sidebar Project selected state를 바꾸지 않는다.
- [ ] Space View 변경은 Sidebar Space selected state를 바꾸지 않는다.
- [ ] Project Calendar에서 Global Rail Calendar가 active 되지 않는다.
- [ ] Global Calendar 진입 시 Tasks Main Shell이 제거된다.
- [ ] Space Header에는 More button이 있다.
- [ ] Project Header에는 More button이 있다.
- [ ] Header More는 Sidebar collapsed 상태에서도 접근 가능하다.
- [ ] Space Header final menu에 `새 프로젝트`가 없다.
- [ ] Sidebar Space menu에는 `새 프로젝트`가 유지된다.
- [ ] Header rename은 Header inline editor를 사용한다.
- [ ] Header rename 성공이 Sidebar label에도 반영된다.
- [ ] Header에 상시 breadcrumb가 없다.
- [ ] Main Header title 앞 icon을 필수 반복하지 않는다.
- [ ] Today에는 locale-aware local date metadata가 표시된다.
- [ ] View tabs는 filled pill이 아니라 bottom indicator를 사용한다.
- [ ] View tabs는 route links다.
- [ ] View tabs는 좁은 화면에서 wrap되지 않는다.
- [ ] active tab은 horizontal overflow에서 reveal된다.
- [ ] Main Body scroll ownership이 View descriptor에 의해 정해진다.
- [ ] Board/Gantt/Calendar는 edge-to-edge contained layout을 사용할 수 있다.
- [ ] Main Shell이 모든 View에 동일 padding을 강제하지 않는다.
- [ ] Entity loading 중 Header geometry가 변하지 않는다.
- [ ] View data error가 Header/Sidebar를 unmount하지 않는다.
- [ ] definitive missing Entity는 canonical fallback한다.
- [ ] invalid Space/Project View route는 hybrid UI 없이 fallback한다.
- [ ] Sidebar collapsed 시 Main Header에 open button이 나타난다.
- [ ] View 변경이 Sidebar collapse state를 바꾸지 않는다.
- [ ] Create 성공 auto-navigation 후 focus가 Main h1으로 간다.
- [ ] 일반 Sidebar navigation은 무조건 Main h1 focus를 강제하지 않는다.
- [ ] Main title은 h1 semantic을 가진다.
- [ ] View switcher는 적절한 nav landmark를 가진다.
- [ ] Header/View Switcher는 Body scroll과 독립적으로 고정된다.
- [ ] Main Header/View Switcher 아래 permanent divider는 한 줄만 존재한다.
- [ ] Main actions/menu는 Body overflow에 clip되지 않는다.
- [ ] entity mutation command가 Sidebar/Header에서 중복 구현되지 않는다.

---

# 7.173 Acceptance Criteria

## AC-MAIN-01

Tasks Main Content는 Scope와 View를 분리하여 렌더하며 Sidebar selected Scope와 Main Header Scope가 항상 일치한다.

## AC-MAIN-02

Today / Upcoming / Archive는 56px Header + Body만 사용한다.

## AC-MAIN-03

Space / Project는 56px Header + 40px View Switcher + Body 구조를 사용한다.

## AC-MAIN-04

Space View 변경은 Space Scope를, Project View 변경은 Project Scope를 유지한다.

## AC-MAIN-05

Project Calendar와 Global Calendar는 Header/Sidebar/Rail state에서 명확히 구분된다.

## AC-MAIN-06

Sidebar collapsed 또는 overlay closed 상태에서 Main Header에 Sidebar open control이 제공된다.

## AC-MAIN-07

Space/Project entity management는 Main Header More menu에서도 접근 가능하며 Sidebar menu와 동일 command를 사용한다.

## AC-MAIN-08

View Switcher는 route-aware links이며 active View를 URL/deep link에서 derive한다.

## AC-MAIN-09

View Body loading/error가 Main Header와 View Switcher geometry를 파괴하지 않는다.

## AC-MAIN-10

invalid View 또는 missing Entity는 canonical fallback하며 Scope/View가 뒤섞인 hybrid UI를 만들지 않는다.

## AC-MAIN-11

Space/Project 생성 성공 후 자동 navigation 시 focus는 새 Main H1으로 이동한다.

## AC-MAIN-12

Main Body scroll/padding은 View별 descriptor로 제어되어 Board/Gantt/Calendar 같은 canvas형 View가 손상되지 않는다.

---

# 7.174 최종 결정 요약

```text
MAIN HEADER
56px
```

```text
VIEW SWITCHER
40px
Space / Project only
```

```text
TODAY
Header + date metadata
No tabs
```

```text
SPACE
Title = Space name
Tabs = Overview / Projects / Goals / Horizons
Header ··· = Rename / Archive / Delete
```

```text
PROJECT
Title = Project name
Tabs = Overview / List / Board / Gantt / Calendar
Header ··· = Rename / Move / Archive / Delete
```

```text
BREADCRUMB
None in P0
```

```text
VIEW ACTIVE
Route-derived
```

```text
TAB STYLE
Bottom 2px indicator
No filled pill
```

```text
SIDEBAR COLLAPSED
Main Header shows open button
```

```text
CREATE SUCCESS
Auto-navigation
Focus → Main h1
```

```text
BODY
View-owned scroll/layout descriptor
```

---

# 7.175 §7에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- Main Header height
- optional View Switcher 구조
- Today/Upcoming/Archive의 Header-only structure
- Space/Project Header 구조
- Space/Project Main Header More action
- Header breadcrumb 미사용
- Today date metadata 표시
- Space View registry/order
- Project View registry/order
- Project default fallback = List
- View tab geometry
- View active indicator
- route link semantics
- narrow tab horizontal scroll
- Main Body scroll-mode abstraction
- Header/View Switcher scroll independence
- Sidebar collapsed Main open button 위치
- Header rename 위치
- Header/Sidebar mutation command 공유
- Space Header menu에서 새 프로젝트 제거
- missing/deleted/archived entity fallback 원칙
- invalid View fallback
- Create success focus = Main h1
- 일반 Sidebar navigation focus 유지 정책

---

# 8. URL / Navigation State

- 상태: **확정**
- 우선순위: **P0**
- 적용 대상: `Global Module / Scope / View / Browser History / Deep Link`
- 목적: 지금까지 정의한 내비게이션 의미를 **URL과 browser history의 단일 source of truth**에 연결하고, 새로고침·Back/Forward·새 탭·deep link에서도 동일 UI 상태가 복원되도록 한다.
- 선행: §1 Navigation IA, §2 Global Rail, §7 Main Content 연동
- 후속: §9 Global Search

---

# 8.1 핵심 결정

P0 canonical route schema를 아래로 확정한다.

```text
/tasks/today
/tasks/upcoming
/tasks/archive

/space/:spaceId/overview
/space/:spaceId/projects
/space/:spaceId/goals
/space/:spaceId/horizons

/project/:projectId/overview
/project/:projectId/list
/project/:projectId/board
/project/:projectId/gantt
/project/:projectId/calendar

/calendar
/focus
/settings
```

---

# 8.2 Route Design Principle

URL은 아래 3가지를 표현한다.

```text
Global Module
Scope
View
```

예:

```text
/project/p1/gantt
```

해석:

```text
Global Module = Tasks
Scope         = Project p1
View          = Gantt
```

---

# 8.3 URL에 넣지 않는 상태

아래 UI preference는 URL에 넣지 않는다.

```text
Sidebar width
Sidebar collapsed
Sidebar overlay open
expanded Space ids
Sidebar scroll position
Search overlay open
Account popover open
context menu open
rename/create editor state
```

이들은 local UI state다.

---

# 8.4 Canonical Smart View Routes

```text
/tasks/today
/tasks/upcoming
/tasks/archive
```

P0에서:

```text
/tasks
```

자체는 canonical destination이 아니다.

접근 시:

```text
→ /tasks/today
```

로 redirect한다.

---

# 8.5 Canonical Space Routes

```text
/space/:spaceId/overview
/space/:spaceId/projects
/space/:spaceId/goals
/space/:spaceId/horizons
```

Space id는 stable internal id를 사용한다.

---

# 8.6 Canonical Project Routes

```text
/project/:projectId/overview
/project/:projectId/list
/project/:projectId/board
/project/:projectId/gantt
/project/:projectId/calendar
```

Project id도 stable internal id.

---

# 8.7 Global Calendar Route

```text
/calendar
```

Project Calendar는:

```text
/project/:projectId/calendar
```

이므로 충돌하지 않는다.

---

# 8.8 Focus Route

```text
/focus
```

P0에서 Focus 세부 mode를 URL path segment로 추가하지 않는다.

---

# 8.9 Settings Route

```text
/settings
```

Settings subpage가 필요해질 경우:

```text
/settings/:section
```

형태로 향후 확장 가능.

---

# 8.10 Route ID Policy

P0 route는 name slug가 아니라 id 기반.

권장:

```text
/project/9f3a.../board
```

금지:

```text
/project/fNIRS-졸업-논문/board
```

## 이유

- rename 시 URL 안정성
- 동일 이름 허용 가능
- slug migration 불필요
- Sidebar rename과 route가 분리됨

---

# 8.11 Localized Route Policy

route segment는 locale에 따라 바꾸지 않는다.

예:

```text
/board
```

는 한국어 UI에서도 그대로 internal segment.

UI label만:

```text
보드
```

로 표시.

---

# 8.12 Default Space Route

사용자가:

```text
/space/:spaceId
```

로 진입하면:

```text
→ /space/:spaceId/overview
```

canonical redirect.

---

# 8.13 Default Project Route

사용자가:

```text
/project/:projectId
```

로 진입하면:

```text
→ /project/:projectId/list
```

canonical redirect.

P0 Project default는 §7과 동일하게 `List`.

---

# 8.14 Redirect vs Render Alias

default route는 alias rendering보다 redirect를 권장한다.

즉:

```text
/project/p1
```

에서 List component를 그대로 렌더하되 URL을 유지하는 방식보다:

```text
/project/p1
→ replace
→ /project/p1/list
```

을 사용.

---

# 8.15 Redirect History Policy

canonicalization redirect는:

```text
replace
```

사용.

예:

```text
/project/p1
→ replace /project/p1/list
```

Back 버튼이 불필요하게 `/project/p1` alias로 돌아가지 않게 한다.

---

# 8.16 User Navigation History Policy

사용자가 명시적으로 navigation item/tab을 클릭한 경우:

```text
push
```

사용.

예:

```text
/project/p1/list
→ Board click
→ push /project/p1/board
```

---

# 8.17 Browser Back / Forward

아래 sequence:

```text
/tasks/today
→ /project/p1/list
→ /project/p1/board
→ /calendar
```

Back:

```text
/calendar
→ /project/p1/board
→ /project/p1/list
→ /tasks/today
```

Forward는 역순.

각 단계에서:

- Rail active
- Sidebar selected
- View active
- Main Header

가 URL에서 재derive되어야 한다.

---

# 8.18 Route as Source of Truth

P0에서:

```text
activeGlobalModule
activeScope
activeView
```

는 route에서 derive한다.

별도 mutable store를 authoritative source로 두지 않는다.

---

# 8.19 Route Parsing Contract

개념:

```ts
type ParsedNavigation = {
  module: "tasks" | "calendar" | "focus" | "settings";
  scope: Scope | null;
  view: SpaceView | ProjectView | null;
};
```

---

# 8.20 Parsed Today

```text
/tasks/today
```

→

```ts
{
  module: "tasks",
  scope: { type: "smart", id: "today" },
  view: null,
}
```

---

# 8.21 Parsed Upcoming

```text
/tasks/upcoming
```

→

```ts
{
  module: "tasks",
  scope: { type: "smart", id: "upcoming" },
  view: null,
}
```

---

# 8.22 Parsed Archive

```text
/tasks/archive
```

→

```ts
{
  module: "tasks",
  scope: { type: "archive" },
  view: null,
}
```

---

# 8.23 Parsed Space

```text
/space/s1/goals
```

→

```ts
{
  module: "tasks",
  scope: { type: "space", id: "s1" },
  view: "goals",
}
```

---

# 8.24 Parsed Project

```text
/project/p1/board
```

→

```ts
{
  module: "tasks",
  scope: { type: "project", id: "p1" },
  view: "board",
}
```

---

# 8.25 Parsed Global Calendar

```text
/calendar
```

→

```ts
{
  module: "calendar",
  scope: null,
  view: null,
}
```

---

# 8.26 Parsed Focus

```text
/focus
```

→

```ts
{
  module: "focus",
  scope: null,
  view: null,
}
```

---

# 8.27 Parsed Settings

```text
/settings
```

→

```ts
{
  module: "settings",
  scope: null,
  view: null,
}
```

---

# 8.28 Route Registry

route 문자열과 View Registry를 별도로 중복 관리하지 않는다.

권장:

```ts
const SPACE_VIEW_REGISTRY = {
  overview: {...},
  projects: {...},
  goals: {...},
  horizons: {...},
};

const PROJECT_VIEW_REGISTRY = {
  overview: {...},
  list: {...},
  board: {...},
  gantt: {...},
  calendar: {...},
};
```

Router와 View Switcher가 동일 id set을 사용.

---

# 8.29 Invalid Space View Segment

예:

```text
/space/s1/board
```

Space에서 `board`는 invalid.

P0:

```text
replace → /space/s1/overview
```

---

# 8.30 Invalid Project View Segment

예:

```text
/project/p1/horizons
```

P0:

```text
replace → /project/p1/list
```

---

# 8.31 Unknown Tasks Smart Route

예:

```text
/tasks/foo
```

P0:

```text
replace → /tasks/today
```

---

# 8.32 Unknown Global Route

app shell 내부 unknown route:

```text
/abc
```

은 generic Not Found 처리.

무조건 Today로 보내지 않는다.

사용자가 잘못된 외부 link를 열었는지 구분 가능해야 한다.

---

# 8.33 Entity Not Found — Project

definitive 404:

parent Space를 알고 있으면:

```text
replace → /space/:parentSpaceId/overview
```

모르면:

```text
replace → /tasks/today
```

---

# 8.34 Entity Not Found — Space

```text
replace → /tasks/today
```

---

# 8.35 Archived Entity Direct Link

Project/Space가 archived 상태인 경우 active Tree에 없음.

P0 canonical behavior:

```text
replace → /tasks/archive
```

가능하면 Archive Body에서 해당 entity highlight/reveal을 지원.

---

# 8.36 Archived Entity Query Hint

Archive에서 특정 entity reveal이 필요하면 URL query를 허용한다.

예:

```text
/tasks/archive?reveal=project:p1
```

P0 optional.

핵심 canonical destination은 `/tasks/archive`.

---

# 8.37 Deleted Entity Direct Link

soft-deleted/removed entity는 archived와 다르다.

definitive deleted:

```text
Project → parent Space 또는 Today
Space   → Today
```

Archive로 보내지 않는다.

---

# 8.38 Permission Denied

403/permission denied는 Not Found와 구분 가능하면 dedicated state를 보여준다.

P0에서 자동 Today redirect를 권장하지 않는다.

이유:

- 사용자가 link가 왜 열리지 않았는지 알 수 있어야 함
- permission 요청/계정 mismatch 가능

---

# 8.39 Last Tasks Location

Global Calendar / Focus / Settings에서 Tasks로 돌아올 때 마지막 Tasks route를 복원한다.

저장 예:

```text
/project/p1/board
```

---

# 8.40 Last Tasks Location Storage

P0 권장:

```text
sessionStorage
```

conceptual key:

```text
focusflow.nav.lastTasksLocation
```

## 이유

- 같은 탭의 앱 이동 흐름만 기억하면 충분
- 오래된 Project route가 며칠 뒤 자동 복원되는 문제 감소
- 새 탭은 URL 자체가 source of truth

---

# 8.41 Last Tasks Location Update

Tasks module의 canonical route로 성공적으로 이동할 때마다 update.

대상:

```text
/tasks/today
/tasks/upcoming
/tasks/archive
/space/...
/project/...
```

---

# 8.42 Last Tasks Location Validation

Tasks Rail 클릭 시 저장값을 바로 trust하지 않는다.

validation:

```text
1. route pattern valid
2. module = tasks
3. entity route면 entity가 접근 가능
```

빠른 client validation이 어려우면 route 이동 후 loader fallback 허용.

---

# 8.43 Last Tasks Location Fallback

invalid/null:

```text
/tasks/today
```

---

# 8.44 Tasks Active Re-click

Tasks module이 이미 active일 때 Rail Tasks click:

```text
current route 유지
```

lastTasksLocation으로 다시 navigate하지 않는다.

---

# 8.45 Calendar → Tasks Restore

예:

```text
lastTasksLocation = /project/p1/gantt
current = /calendar
```

Tasks click:

```text
push /project/p1/gantt
```

사용자 명시 navigation이므로 push.

---

# 8.46 Focus → Tasks Restore

동일.

---

# 8.47 Settings → Tasks Restore

동일.

---

# 8.48 Last Project View

P0에서는 Project별 last View를 별도 localStorage에 저장하지 않는다.

이유:

- URL/history가 이미 current view를 표현
- Sidebar에서 Project를 새로 클릭할 때 동작이 예측 가능해야 함
- per-project preference 복잡성 방지

---

# 8.49 Project Click Destination

Sidebar에서 Project 클릭:

```text
/project/:projectId/list
```

로 이동.

P0에서는 다른 Project에서 Board를 보고 있더라도 Board를 carry over하지 않는다.

---

# 8.50 Why Project Click Always List

예측 가능성 우선.

```text
Project A Board
→ Sidebar Project B click
→ Project B List
```

으로 확정.

사용자가 Board로 가고 싶으면 View tab 클릭.

---

# 8.51 Space Click Destination

Sidebar에서 Space 클릭:

```text
/space/:spaceId/overview
```

항상 Overview.

per-Space last View 저장 없음.

---

# 8.52 View Carry-over Policy

P0:

```text
Entity Scope switch
→ View reset to target default
```

Project default:

```text
List
```

Space default:

```text
Overview
```

---

# 8.53 Same Entity View Navigation

같은 Entity 안에서 tab 변경은 route만 변경.

예:

```text
/project/p1/list
→ /project/p1/board
```

Scope 유지.

---

# 8.54 Search Result Navigation

Search 결과가 Project이면:

```text
/project/:id/list
```

Space이면:

```text
/space/:id/overview
```

Task 결과 destination은 §9에서 확정.

---

# 8.55 Create Success Navigation

§6/§7 정책 반영.

Space create 성공:

```text
push /space/:newId/overview
```

Project create 성공:

```text
push /project/:newId/list
```

---

# 8.56 Delete Fallback History

active Project delete 후 fallback은:

```text
replace
```

권장.

이유:

Back을 눌러 삭제된 Project route로 즉시 돌아가는 loop 방지.

---

# 8.57 Archive Fallback History

active Entity archive 후 fallback도:

```text
replace
```

권장.

---

# 8.58 Missing Entity Fallback History

definitive missing route redirect:

```text
replace
```

---

# 8.59 Invalid View Fallback History

canonicalization:

```text
replace
```

---

# 8.60 User-selected Archive Navigation

Sidebar Archive click:

```text
push /tasks/archive
```

---

# 8.61 Direct Deep Link

직접 URL 입력/외부 link:

```text
/project/p1/board
```

페이지 load 순서:

```text
1. route parse
2. Rail Tasks active derive
3. Context Sidebar mode = tasks
4. Project/parent Space load
5. parent Space auto-expand
6. Project row selected
7. Main Header p1
8. Board active
```

---

# 8.62 Refresh

새로고침 후 route에서:

- active module
- scope
- view

를 그대로 복원.

Sidebar width/collapse/expanded Space ids는 local preference에서 별도 복원.

---

# 8.63 New Tab

View tab 또는 Sidebar link Cmd/Ctrl click:

실제 anchor href를 사용하므로 새 탭에서 canonical route open.

새 탭은 기존 탭의 ephemeral overlay/create state를 공유하지 않는다.

---

# 8.64 Middle Click

Persistent links:

- Tasks
- Calendar
- Focus
- Settings
- Today
- Upcoming
- Archive
- Space
- Project
- View tabs

가능하면 middle click 지원.

Overlay action Search/Account는 button이므로 해당되지 않음.

---

# 8.65 Browser Back during Inline Create

Create input은 route state가 아니므로 Back history를 추가하지 않는다.

Back이 발생해 route가 바뀌면 create session cancel.

---

# 8.66 Browser Back during Rename

Rename 역시 route state 아님.

Back으로 route 이동 시 rename cancel.

---

# 8.67 Search Overlay History

P0 Search open/close는 URL/history entry를 만들지 않는다.

금지:

```text
?search=open
```

Search query 역시 P0에서는 URL에 넣지 않는다.

---

# 8.68 Account Popover History

URL/history 변경 없음.

---

# 8.69 Sidebar Collapse History

URL/history 변경 없음.

---

# 8.70 Expanded Space History

URL/history 변경 없음.

---

# 8.71 Global Calendar Internal State

예:

```text
month/week/day
selected date
```

는 Global Calendar feature spec에 따라 query/path에 포함할 수 있다.

본 Sidebar redesign에서는 강제하지 않는다.

---

# 8.72 Project Calendar Internal State

Project Calendar 내부 month/date state도 Project Calendar feature가 소유.

canonical scope/view route는:

```text
/project/:id/calendar
```

까지.

---

# 8.73 Query Param Policy

query param은 아래 경우에만 사용한다.

```text
현재 View 안의 shareable secondary state
```

예:

```text
?date=2026-08-19
?task=...
```

단 P0 Sidebar navigation 자체는 query param에 의존하지 않는다.

---

# 8.74 Hash Policy

P0 navigation에 URL hash를 사용하지 않는다.

---

# 8.75 Legacy Route Migration

현재 기존 app에 아래와 같은 route가 있을 수 있다.

예:

```text
/board
/archive
/today
/space/:id
/project/:id
```

P0 migration layer에서 canonical redirect를 제공한다.

---

# 8.76 Legacy `/today`

```text
/today
→ replace /tasks/today
```

---

# 8.77 Legacy `/archive`

```text
/archive
→ replace /tasks/archive
```

---

# 8.78 Legacy `/board`

Global Board가 기존에 특정 Project context 없이 존재했다면 자동으로 임의 Project Board로 보내지 않는다.

두 경우로 나눈다.

## legacy route에 project id를 추론 가능

```text
/board?project=p1
→ /project/p1/board
```

## project id를 추론 불가

```text
/board
→ /tasks/today
```

또는 migration notice.

P0 final:

```text
replace /tasks/today
```

---

# 8.79 Legacy Space Route

```text
/space/s1
→ replace /space/s1/overview
```

---

# 8.80 Legacy Project Route

```text
/project/p1
→ replace /project/p1/list
```

---

# 8.81 Legacy Calendar Collision

기존 `/calendar`가 이미 Global Calendar라면 유지.

기존 Project Calendar가 `/calendar?project=p1` 형태라면:

```text
→ /project/p1/calendar
```

migration.

---

# 8.82 Legacy Redirect Duration

P0 migration 기간 동안 유지.

완전히 제거하기 전 analytics/log로 legacy hit가 더 이상 없는지 확인 가능하면 좋다.

analytics 없으면 코드 comment/TODO로 migration removal version을 명시.

---

# 8.83 Route Builder Functions

raw string concatenation을 여러 컴포넌트에서 반복하지 않는다.

권장:

```ts
routes.tasks.today()
routes.tasks.upcoming()
routes.tasks.archive()

routes.space.overview(spaceId)
routes.space.projects(spaceId)
routes.space.goals(spaceId)
routes.space.horizons(spaceId)

routes.project.overview(projectId)
routes.project.list(projectId)
routes.project.board(projectId)
routes.project.gantt(projectId)
routes.project.calendar(projectId)

routes.calendar()
routes.focus()
routes.settings()
```

---

# 8.84 Route Parser Functions

route builder와 parse semantics가 같은 registry를 참조하도록 한다.

---

# 8.85 ID Encoding

id가 URL-safe UUID/opaque id라면 그대로.

그 외에는:

```text
encodeURIComponent
```

등 router standard를 따른다.

---

# 8.86 Trailing Slash Policy

P0 canonical route는 trailing slash 없음.

```text
/project/p1/list
```

canonical.

```text
/project/p1/list/
```

은 router/server가 canonicalize 가능.

---

# 8.87 Case Sensitivity

route segment는 lowercase canonical.

```text
/Project/P1/Board
```

같은 variant는 지원하지 않아도 됨.

---

# 8.88 Document Title Synchronization

route 변경 후 §7 document title update.

브라우저 history navigation에서도 title이 current route와 일치해야 한다.

---

# 8.89 Route Loading Race

빠르게:

```text
p1 → p2 → p3
```

클릭했을 때 느린 p1 fetch가 나중에 완료되어 Main Header를 p1으로 덮으면 안 된다.

현재 route id와 response target을 확인.

---

# 8.90 Abort / Stale Request

router/data layer가 지원하면 stale loader abort.

없어도 stale response 적용 방지.

---

# 8.91 Route Mutation Race — Delete

p1 delete 중 사용자가 p2로 이동했다면 delete 성공 후 fallback navigation을 강제로 실행하지 않는다.

fallback은:

```text
if current route still points to deleted entity
```

일 때만 적용.

---

# 8.92 Route Mutation Race — Archive

동일.

---

# 8.93 Route Mutation Race — Move

Project move는 projectId route가 유지되므로 current route를 바꿀 필요 없음.

---

# 8.94 Route Mutation Race — Rename

id-based route이므로 route 변경 없음.

---

# 8.95 Navigation Guard — Unsaved Inline Create

inline create는 blur/module switch에서 cancel하는 정책이므로 별도 browser unload guard 없음.

---

# 8.96 Navigation Guard — Main View Unsaved State

Project View 내부 편집기 등 unsaved state는 각 View feature가 소유.

Sidebar redesign에서 전역 guard를 추가하지 않는다.

---

# 8.97 Route Error Boundary

route parsing 오류와 View rendering 오류를 구분.

invalid segment:

```text
canonical redirect
```

valid route의 data error:

```text
Main Body error state
```

---

# 8.98 Route Not Found vs Entity Not Found

```text
Unknown path
≠
Known entity route + missing id
```

서로 다른 error path.

---

# 8.99 URL and UI Preference Separation Table

| 상태 | URL | sessionStorage | localStorage |
|---|---:|---:|---:|
| Global Module | Yes | No | No |
| Scope | Yes | No | No |
| View | Yes | No | No |
| Last Tasks Location | No | Yes | No |
| Sidebar width | No | No | Yes |
| Sidebar collapsed | No | No | Yes |
| Expanded Space ids | No | No | Yes |
| Search open | No | No | No |
| Account open | No | No | No |
| Create/Rename | No | No | No |

---

# 8.100 Navigation Event Table

| User action | History | Destination |
|---|---|---|
| Today click | push | `/tasks/today` |
| Upcoming click | push | `/tasks/upcoming` |
| Space click | push | `/space/:id/overview` |
| Project click | push | `/project/:id/list` |
| View tab click | push | current entity + view |
| Archive click | push | `/tasks/archive` |
| Calendar Rail | push | `/calendar` |
| Focus Rail | push | `/focus` |
| Settings Rail | push | `/settings` |
| Tasks Rail restore | push | last valid Tasks route |
| Invalid alias | replace | canonical route |
| Entity delete fallback | replace | safe route |
| Entity archive fallback | replace | safe route |
| Missing entity fallback | replace | safe route |

---

# 8.101 State Invariants

## INV-URL-01

하나의 canonical URL은 하나의 `module/scope/view` 조합으로만 해석된다.

## INV-URL-02

Project Calendar route에서 Global Calendar module이 active가 되지 않는다.

## INV-URL-03

Sidebar selected state는 URL Scope와 일치한다.

## INV-URL-04

View Switcher active state는 URL View와 일치한다.

## INV-URL-05

Sidebar width/collapse는 URL 변경으로 reset되지 않는다.

## INV-URL-06

Search/Account open state가 browser history entry를 만들지 않는다.

## INV-URL-07

삭제/보관된 Entity route를 Back으로 즉시 되살리는 redirect loop가 없어야 한다.

---

# 8.102 Interaction Test Cases

## URL-01 Project Direct Link

```text
Open /project/p1/board
→ Tasks active
→ parent Space expanded
→ p1 selected
→ Board active
```

## URL-02 Global Calendar

```text
Open /calendar
→ Calendar Rail active
→ no Tasks Sidebar
```

## URL-03 Project Calendar

```text
Open /project/p1/calendar
→ Tasks Rail active
→ p1 selected
→ Project Calendar tab active
```

## URL-04 Default Project Alias

```text
Open /project/p1
→ replace /project/p1/list
```

## URL-05 Default Space Alias

```text
Open /space/s1
→ replace /space/s1/overview
```

## URL-06 Invalid Project View

```text
Open /project/p1/horizons
→ replace /project/p1/list
```

## URL-07 Back View History

```text
List → Board → Gantt
Back → Board
Back → List
```

## URL-08 Tasks Restore

```text
Current /project/p1/gantt
→ Calendar
→ Tasks
→ /project/p1/gantt
```

## URL-09 Project Scope Switch

```text
Current /project/p1/board
Click p2
→ /project/p2/list
```

## URL-10 Delete Fallback

```text
Current /project/p1/list
Delete p1
→ replace /space/s1/overview
Back does not reopen deleted p1 route
```

## URL-11 Search Overlay

```text
Current /project/p1/board
Open Search
→ URL unchanged
Close Search
→ URL unchanged
```

## URL-12 Refresh

```text
Refresh /space/s1/goals
→ s1 selected
→ Goals active
```

---

# 8.103 QA Checklist

- [ ] `/tasks/today`이 canonical Today route다.
- [ ] `/tasks/upcoming`이 canonical Upcoming route다.
- [ ] `/tasks/archive`가 canonical Archive route다.
- [ ] Space route는 `/space/:id/:view` 구조다.
- [ ] Project route는 `/project/:id/:view` 구조다.
- [ ] Global Calendar는 `/calendar`이다.
- [ ] Project Calendar는 `/project/:id/calendar`이다.
- [ ] `/space/:id`는 Overview로 replace redirect된다.
- [ ] `/project/:id`는 List로 replace redirect된다.
- [ ] Project 클릭은 항상 List로 이동한다.
- [ ] Space 클릭은 항상 Overview로 이동한다.
- [ ] View carry-over는 P0에서 하지 않는다.
- [ ] active module/scope/view는 route에서 derive된다.
- [ ] Sidebar selected row를 별도 authoritative local state로 저장하지 않는다.
- [ ] View active tab을 별도 authoritative local state로 저장하지 않는다.
- [ ] View tab click은 history push를 만든다.
- [ ] canonicalization은 history replace를 사용한다.
- [ ] delete/archive fallback은 replace를 사용한다.
- [ ] Browser Back/Forward가 View 전환을 복원한다.
- [ ] Deep link 새로고침 후 동일 Header/Sidebar/View가 복원된다.
- [ ] Search open/close는 URL/history를 바꾸지 않는다.
- [ ] Account popover는 URL/history를 바꾸지 않는다.
- [ ] Sidebar width/collapse는 URL에 없다.
- [ ] expanded Space ids는 URL에 없다.
- [ ] last Tasks route는 sessionStorage를 사용한다.
- [ ] invalid last Tasks route는 Today로 fallback한다.
- [ ] Legacy `/today`가 canonical Today로 redirect된다.
- [ ] Legacy `/archive`가 canonical Archive로 redirect된다.
- [ ] Legacy `/board`는 Project id가 없으면 Today로 redirect된다.
- [ ] route builder function이 존재하여 raw string 중복을 줄인다.
- [ ] route id는 name slug가 아니라 stable id를 사용한다.
- [ ] Entity rename이 URL을 변경하지 않는다.
- [ ] stale async response가 current route Header를 덮지 않는다.
- [ ] delete/archive race에서 이미 다른 route로 이동한 사용자를 강제 fallback시키지 않는다.

---

# 8.104 Acceptance Criteria

## AC-URL-01

모든 Tasks navigation destination은 canonical URL을 가지며 새로고침 후 동일 UI 상태를 복원한다.

## AC-URL-02

Global Module, Scope, View는 URL에서 derive되며 별도 local authoritative state와 충돌하지 않는다.

## AC-URL-03

Project Calendar와 Global Calendar가 URL 및 Rail state에서 완전히 분리된다.

## AC-URL-04

Space/Project default alias는 replace redirect로 canonicalize된다.

## AC-URL-05

사용자 View 전환은 push history로 기록되어 Browser Back/Forward로 복원된다.

## AC-URL-06

Project/Space Sidebar 클릭은 각각 List/Overview default View로 이동하며 현재 View를 carry over하지 않는다.

## AC-URL-07

Tasks Rail은 session 내 last valid Tasks route를 복원하고 없으면 Today로 이동한다.

## AC-URL-08

삭제/보관/missing Entity fallback은 replace를 사용해 stale route loop를 만들지 않는다.

## AC-URL-09

Search/Account/Sidebar UI preference는 URL과 browser history를 오염시키지 않는다.

## AC-URL-10

legacy route는 canonical route로 migration redirect되며 Global Board 개념을 임의로 유지하지 않는다.

---

# 8.105 최종 결정 요약

```text
TODAY
/tasks/today
```

```text
UPCOMING
/tasks/upcoming
```

```text
ARCHIVE
/tasks/archive
```

```text
SPACE
/space/:id/overview
/space/:id/projects
/space/:id/goals
/space/:id/horizons
```

```text
PROJECT
/project/:id/overview
/project/:id/list
/project/:id/board
/project/:id/gantt
/project/:id/calendar
```

```text
GLOBAL
/calendar
/focus
/settings
```

```text
DEFAULT
Space   → Overview
Project → List
```

```text
ENTITY SWITCH
No View carry-over
```

```text
HISTORY
User navigation = push
Canonical fallback = replace
```

```text
LAST TASKS
sessionStorage
Fallback = /tasks/today
```

```text
ROUTE ID
Stable id
No name slug
```

---

# 8.106 §8에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- canonical route schema
- Smart View route
- Space route
- Project route
- Global Calendar / Project Calendar 분리
- default Space/Project View
- alias redirect
- push vs replace 정책
- Project/Space click 시 View reset
- per-Project last View 미사용
- last Tasks location storage
- browser Back/Forward
- deep link
- refresh
- new tab semantics
- invalid View fallback
- missing/deleted/archived Entity fallback
- legacy route migration
- URL과 local UI preference 분리
- stable id route
- localized route 미사용
- stale async route race 방지

---

# 9. Global Search

- 상태: **확정**
- 우선순위: **P0**
- 적용 대상: `Global Rail > Search`, `/` shortcut
- 목적: 기존 Sidebar 상시 검색창을 제거하고, 현재 route를 유지한 채 Task / Project / Space를 빠르게 찾는 **전역 Search Overlay**를 제공한다.
- 선행: §2 Global Rail, §8 URL / Navigation State
- 후속: §10 Sidebar Collapse / Resize 상세 상호작용 정리

---

# 9.1 핵심 결정

P0 Search는 별도 Page가 아니라 **Global Modal Search Overlay**로 구현한다.

```text
Current Route
     ↓
Search Overlay open
     ↓
Underlying route/layout preserved
```

예:

```text
/project/p1/gantt
→ Search
→ URL remains /project/p1/gantt
```

---

# 9.2 Entry Points

P0 Search 진입점은 정확히 2개다.

```text
1. Global Rail Search icon
2. "/" keyboard shortcut
```

P0에서 다음 shortcut을 임의 추가하지 않는다.

```text
Cmd/Ctrl + K
Cmd/Ctrl + F
```

향후 shortcut 체계를 별도 설계할 때 추가 가능.

---

# 9.3 Search Overlay Type

semantic:

```text
modal dialog
```

underlying App Shell은 유지하지만 Search open 동안 직접 interaction할 수 없다.

권장:

```text
role="dialog"
aria-modal="true"
```

---

# 9.4 Desktop Placement

viewport width:

```text
>= 768px
```

에서 Search panel은 상단 중앙에 배치한다.

```text
width: 640px
max-width: calc(100vw - 32px)

top offset: 64px
horizontal: center
```

개념:

```text
┌──────────────────────────────────────────────────────────────┐
│                         Search Panel                         │
│                                                              │
│                ┌──────────────────────────────┐              │
│                │ 🔍 검색...                   │              │
│                ├──────────────────────────────┤              │
│                │ Results                      │              │
│                │                              │              │
│                └──────────────────────────────┘              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

# 9.5 Search Panel Height

```text
max-height: min(720px, calc(100dvh - 96px))
```

최소 높이는 강제하지 않는다.

검색 결과가 적으면 content height만큼 줄어든다.

---

# 9.6 Search Panel Radius

```text
12px
```

border:

```text
1px
```

shadow:

Search overlay는 floating surface이므로 subtle elevation shadow를 허용한다.

실제 색상/elevation token은 §11.

---

# 9.7 Backdrop

Search open 시 전체 App Shell 위에 backdrop을 둔다.

Global Rail도 backdrop 아래에 둔다.

즉 Search는 Rail보다 상위 global layer다.

backdrop click:

```text
Search close
```

---

# 9.8 Layer Order

semantic:

```text
Main
<
Context Sidebar
<
Rail
<
Account popover / local menus
<
Search backdrop
<
Search panel
<
Search internal tooltip
```

Search open 시 다른 local popover/menu는 닫는다.

---

# 9.9 Search Open Contract

Search open:

```text
1. close Account popover
2. close Sidebar entity context menu
3. preserve route
4. preserve Sidebar width/collapse
5. preserve current Scope/View
6. store previously focused element
7. open Search dialog
8. focus Search input
```

---

# 9.10 Search Close Contract

Search close:

```text
1. clear ephemeral selected result
2. keep underlying route unchanged
3. restore prior focus when possible
```

Rail Search icon에서 열었으면:

```text
focus → Rail Search button
```

`/` shortcut에서 열었으면:

```text
focus → previously focused non-text control
```

이전 target이 DOM에서 사라졌으면:

```text
focus → Main h1 또는 Rail Search button
```

---

# 9.11 Search Close Triggers

다음에서 닫는다.

```text
Escape
Backdrop click
Result navigation
Explicit close button (narrow layout only if needed)
```

input blur만으로는 닫지 않는다.

---

# 9.12 Search Input Geometry

Desktop:

```text
height: 52px
```

padding:

```text
left: 16px
right: 12px
```

leading Search icon:

```text
20px
```

icon → input gap:

```text
10px
```

---

# 9.13 Search Input Border

Search panel 자체가 container border를 가진다.

input 영역에 별도 full rounded input border를 중복 적용하지 않는다.

권장:

```text
Search panel
┌───────────────────────────┐
│ icon  input               │
├───────────────────────────┤
│ results                   │
└───────────────────────────┘
```

input bottom divider:

```text
1px
```

---

# 9.14 Placeholder

```text
작업, 프로젝트, 공간 검색
```

P0 한국어 label.

---

# 9.15 Input Font

semantic:

```text
font-size: 15px
line-height: 22px
font-weight: 400
```

---

# 9.16 Search Query State

```ts
type SearchUIState = {
  open: boolean;
  query: string;
  status: "idle" | "searching" | "success" | "error";
  activeResultId: string | null;
};
```

Search query는 URL에 저장하지 않는다.

---

# 9.17 Query Normalization

입력 display 값은 그대로 보존.

검색용 normalization은 별도.

권장:

```ts
const normalizedQuery = query.trim().normalize("NFC");
```

한국어 조합 문자 처리 때문에 Unicode normalization을 사용한다.

---

# 9.18 Minimum Search Length

P0:

```text
1 character
```

부터 검색한다.

공백-only query는 empty query로 취급.

---

# 9.19 Empty Query State

query empty이면 검색 결과 대신 **최근 항목**을 표시한다.

P0에서 최근 “검색어 문자열”을 저장하지 않는다.

대신 최근에 열었던 Entity를 보여준다.

```text
최근 항목
- Project
- Space
- Task
```

---

# 9.20 Why Recent Items Instead of Recent Query Strings

- 같은 검색어를 다시 입력하는 것보다 실제 대상 재접근이 더 빠름
- 민감할 수 있는 검색어 문자열을 장기간 저장하지 않음
- 최근 사용 목적과 더 직접적으로 연결됨

---

# 9.21 Recent Item Scope

P0 최대:

```text
8 items
```

종류:

```text
Task
Project
Space
```

중복 entity id 제거.

---

# 9.22 Recent Item Persistence

권장:

```text
localStorage
```

conceptual key:

```text
focusflow.search.recentEntities
```

저장:

```ts
type RecentSearchEntity = {
  type: "task" | "project" | "space";
  id: string;
  lastOpenedAt: number;
};
```

name 자체는 저장하지 않아도 된다.

현재 data source에서 다시 resolve.

---

# 9.23 Recent Entity Cleanup

다음은 표시에서 제외.

```text
deleted
archived (active search 기준)
permission lost
unresolvable
```

Archive 검색을 별도 지원하지 않는 P0에서는 archived Entity를 Recent에서 제외한다.

---

# 9.24 Searchable Entity Types

P0 검색 대상:

```text
Task
Project
Space
```

P0에서 제외:

```text
Goal
Horizon
Settings
Calendar event
Tags
Filters
Archived Entity
```

향후 search provider 확장 가능.

---

# 9.25 Result Group Order

query가 존재할 때 결과 group order:

```text
1. 작업
2. 프로젝트
3. 공간
```

Task를 가장 위에 둔다.

이유:

FocusFlow의 최종 행동 단위가 Task이기 때문.

---

# 9.26 Group Labels

```text
작업
프로젝트
공간
```

height:

```text
28px
```

padding:

```text
left/right: 12px
```

typography:

```text
12px
600
muted
```

---

# 9.27 Results Container

```css
.searchResults {
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
```

Panel 전체가 viewport 밖으로 늘어나지 않는다.

---

# 9.28 Result Row Base Geometry

```text
height: 44px
min-height: 44px

margin-left/right: 6px
padding-left/right: 10px

border-radius: 8px
```

---

# 9.29 Result Row Layout

```text
[icon] [primary label................] [secondary metadata]
```

optional second line을 기본으로 사용하지 않는다.

P0는 한 줄 compact 결과.

---

# 9.30 Result Icon

```text
18px
```

Task / Project / Space의 의미가 구분되는 icon.

---

# 9.31 Result Label

```text
font-size: 14px
line-height: 20px
font-weight: 500
```

ellipsis.

---

# 9.32 Secondary Metadata

결과 우측 또는 label 다음에 muted metadata를 표시할 수 있다.

P0 권장:

Task:

```text
Project name
```

Project:

```text
Space name
```

Space:

```text
"공간"
```

---

# 9.33 Metadata Layout

metadata:

```text
font-size: 12px
line-height: 18px
flex-shrink: 0
max-width: 40%
ellipsis
```

label이 가장 높은 우선순위를 가진다.

---

# 9.34 Task Result Metadata

Project 소속 Task:

```text
Task title             Project A
```

Project가 없고 Space만 존재하는 domain이면 해당 owner label.

owner 없음:

```text
metadata 없음
```

---

# 9.35 Project Result Metadata

```text
Project title          My Space
```

---

# 9.36 Space Result Metadata

P0:

```text
Space title            공간
```

필요 없으면 type icon만으로 충분할 수 있으나 P0에서는 명시적 metadata를 권장한다.

---

# 9.37 Query Highlight

P0에서 match substring을 bold highlight하는 기능은 선택적.

최종 결정:

**P0에서는 highlight하지 않는다.**

이유:

- 한국어 fuzzy matching에서 부분 강조 정확도가 복잡함
- compact 결과에서 font weight가 과도하게 흔들릴 수 있음

---

# 9.38 Result Selection State

keyboard active result:

```text
background = search-result-active-bg
```

hover와 동일 계열.

selected route 의미와 구분하기 위해 `selected` 대신 `activeResult` 용어 사용.

---

# 9.39 Mouse Hover

pointer hover 시 해당 row가 activeResult가 될 수 있다.

단 keyboard로 이동 중 pointer가 panel 밖에 있으면 keyboard active 유지.

---

# 9.40 Keyboard Navigation

Search input focus 상태에서:

```text
ArrowDown → 다음 result
ArrowUp   → 이전 result
Enter     → active result open
Escape    → Search close
```

---

# 9.41 Arrow Wrap Policy

P0:

```text
wrap 없음
```

첫 result에서 ArrowUp:

```text
input focus / no-op
```

마지막에서 ArrowDown:

```text
no-op
```

---

# 9.42 Empty Query Keyboard

Recent items도 동일 ArrowDown/Up/Enter navigation을 지원.

---

# 9.43 Group Header Focus

Group header는 keyboard focus target이 아니다.

Arrow navigation은 결과 row만 순회.

---

# 9.44 Active Result Auto-scroll

Arrow navigation 시 active result가 결과 viewport 밖이면:

```text
scrollIntoView({
  block: "nearest"
})
```

---

# 9.45 Enter with No Active Result

P0:

```text
no-op
```

검색 query 자체를 별도 Search Page로 제출하지 않는다.

---

# 9.46 Tab Behavior

P0 Search dialog에서 Tab은 dialog 내부 focus loop.

순서:

```text
Search input
→ visible interactive result (if tab-focusable policy)
→ optional close
```

그러나 result 전체를 Tab 순회하면 결과가 많을 때 비효율적.

P0 final:

**결과 row는 Tab stop이 아니다.**

결과 선택은 Arrow + Enter 또는 pointer click.

Tab은 input과 dialog controls만 순회.

---

# 9.47 Result Row Semantics

결과는 listbox-like pattern을 사용할 수 있다.

권장:

```text
input role="combobox"
aria-controls="global-search-results"
aria-expanded="true"
aria-activedescendant="<active-result-id>"

results role="listbox"
result role="option"
```

실제 component library가 combobox primitive를 제공하면 재사용.

---

# 9.48 Search Input Focus Trap

Search dialog open 동안 keyboard focus가 underlying App Shell로 빠져나가지 않게 한다.

---

# 9.49 IME Composition

한국어 입력 중:

```text
Arrow / Enter
```

이 IME 후보 선택에 사용될 수 있다.

따라서 composition 중에는 Search result Enter navigation을 강제하지 않는다.

```ts
if (event.isComposing || nativeEvent.isComposing) return;
```

---

# 9.50 Search Trigger Shortcut `/`

아래 context에서는 `/` shortcut 비활성.

```text
input
textarea
select
contenteditable
rich text editor
code editor
IME composition
```

---

# 9.51 `/` Shortcut Prevent Default

shortcut으로 Search를 열 때:

```text
event.preventDefault()
```

하여 `/` 문자가 body에 입력되거나 browser quick find 유사 동작을 만들지 않는다.

---

# 9.52 Search Open while Search Already Open

`/` 재입력:

```text
input에 "/" 문자 입력 가능
```

즉 Search overlay가 이미 open이면 shortcut handler가 가로채지 않는다.

---

# 9.53 Debounce

remote/data search는:

```text
120ms
```

debounce.

Space/Project가 memory에 이미 있고 local filter 가능하더라도 결과 update timing을 지나치게 다르게 만들지 않는다.

---

# 9.54 Search Request Cancellation

query:

```text
a
ab
abc
```

가 빠르게 바뀌면 이전 request 결과가 최신 결과를 덮지 않아야 한다.

가능하면:

```text
AbortController
```

사용.

아니면 request sequence id 비교.

---

# 9.55 Search Status

```text
idle
searching
success
error
```

query empty:

```text
idle
```

Recent items 표시.

---

# 9.56 Search Loading Delay

아주 빠른 검색에서 spinner flicker 방지.

loading indicator 표시 delay 권장:

```text
150ms
```

150ms 안에 결과가 오면 spinner 생략 가능.

---

# 9.57 Loading UI

Search input trailing에 작은 spinner를 둘 수 있다.

결과 list 전체 skeleton은 P0 필수 아님.

기존 결과를 query change 중 계속 유지하면 stale result click 문제가 있으므로 P0 final:

```text
query change
→ previous active result clear
→ old result list clear
→ loading
```

---

# 9.58 Search Empty Result

query non-empty + 0 results:

```text
검색 결과가 없습니다.
```

secondary suggestion:

```text
다른 검색어를 입력해 보세요.
```

CTA 없음.

---

# 9.59 Search Error

```text
검색하지 못했습니다.
[다시 시도]
```

Retry는 현재 query 그대로 재실행.

Search dialog는 닫히지 않는다.

---

# 9.60 Error Row Geometry

error state는 결과 영역 중앙/상단에 compact message.

큰 full-page illustration 사용하지 않는다.

---

# 9.61 Search Provider Contract

UI는 entity-specific DB query를 직접 호출하지 않는다.

권장:

```ts
type GlobalSearchProvider = {
  search(query: string, signal?: AbortSignal): Promise<SearchResults>;
};
```

---

# 9.62 Search Results Type

```ts
type SearchResults = {
  tasks: SearchTaskResult[];
  projects: SearchProjectResult[];
  spaces: SearchSpaceResult[];
};
```

---

# 9.63 Search Result Base

```ts
type SearchResultBase = {
  id: string;
  type: "task" | "project" | "space";
  title: string;
};
```

---

# 9.64 Task Search Result

conceptual:

```ts
type SearchTaskResult = SearchResultBase & {
  type: "task";
  projectId?: string | null;
  spaceId?: string | null;
  dueAt?: string | null;
  ownerLabel?: string | null;
};
```

---

# 9.65 Project Search Result

```ts
type SearchProjectResult = SearchResultBase & {
  type: "project";
  spaceId: string;
  spaceName?: string;
};
```

---

# 9.66 Space Search Result

```ts
type SearchSpaceResult = SearchResultBase & {
  type: "space";
};
```

---

# 9.67 Ranking Principle

P0 ranking priority:

```text
1. exact title match
2. title prefix match
3. word/token prefix match
4. substring match
5. fuzzy match
```

동점이면:

```text
recently opened
then stable name sort
```

---

# 9.68 Entity Group Ranking

Group order는 고정:

```text
Task
Project
Space
```

Task fuzzy score가 낮다고 Project group 위/아래를 섞지 않는다.

P0는 grouped result 구조 유지.

---

# 9.69 Result Limit

P0 overlay 내 최대 초기 결과:

```text
Tasks     8
Projects  5
Spaces    5
```

총 최대:

```text
18
```

---

# 9.70 More Results

P0에서:

```text
"모든 결과 보기"
```

full Search Page를 추가하지 않는다.

18개 이상이면 상위 결과만 표시.

필요성이 확인되면 향후 Search Page를 별도 설계.

---

# 9.71 Search Index Scope

P0 active Entity만 검색.

즉:

```text
archived = false
deleted = false
```

---

# 9.72 Case Sensitivity

영문:

```text
case-insensitive
```

한국어:

Unicode-normalized.

---

# 9.73 Whitespace Tokenization

연속 공백은 검색 normalization에서 하나의 separator로 취급 가능.

display query는 원본 유지.

---

# 9.74 Search Fields — Task

P0 searchable:

```text
task.title
```

P0에서 description/body 전문 검색은 필수 아님.

---

# 9.75 Search Fields — Project

```text
project.name
```

---

# 9.76 Search Fields — Space

```text
space.name
```

---

# 9.77 Search by Parent Name

P0에서는 Project를 Space name으로 역검색하는 기능은 필수 아님.

예:

```text
"My Space"
```

검색 시 My Space 자체는 나오지만 그 안 모든 Project가 나오지는 않음.

---

# 9.78 Search by Task Project Name

Project name으로 모든 Task를 결과에 포함시키지 않는다.

Task title 자체 match 우선.

---

# 9.79 Fuzzy Search Requirement

P0 fuzzy search를 권장하되 한국어 초성 검색까지 필수로 요구하지 않는다.

예:

```text
"ㄴㅁ"
```

같은 초성 검색은 P1 가능.

---

# 9.80 Search Backend Strategy

기존 데이터 규모가 작으면:

```text
loaded/local entity index
```

로 가능.

Task 데이터가 많거나 서버 중심이면:

```text
server search
```

사용.

문서는 특정 DB implementation을 강제하지 않는다.

---

# 9.81 Search Performance Budget

P0 target:

```text
local result update: perceived immediate
remote median: < 300ms 권장
```

정확 SLA는 인프라 spec이 아니므로 hard failure criterion은 아님.

UI는 느린 검색을 정상 처리해야 한다.

---

# 9.82 Project Result Navigation

Project result 선택:

```text
close Search
push /project/:projectId/list
```

§8 Project default와 동일.

---

# 9.83 Space Result Navigation

Space result:

```text
close Search
push /space/:spaceId/overview
```

---

# 9.84 Task Result Navigation — Principle

Task는 Entity 자체보다 **Task를 실제로 확인/수정할 수 있는 owning Scope**로 이동해야 한다.

Search UI가 임의 route를 하드코딩하지 않고 domain resolver를 사용한다.

---

# 9.85 Task Navigation Resolver

권장 contract:

```ts
type TaskNavigationTarget = {
  href: string;
  revealTaskId: string;
};

function resolveTaskNavigationTarget(
  task: SearchTaskResult
): TaskNavigationTarget;
```

---

# 9.86 Task Result — Project-owned

Task에 `projectId`가 있으면 canonical destination:

```text
/project/:projectId/list?task=:taskId
```

예:

```text
/project/p1/list?task=t10
```

---

# 9.87 `?task=` Semantics

`task` query param은 current List View 안에서 특정 Task를 reveal/select하는 shareable secondary state다.

§8 query-param policy와 일치.

List View는:

```text
1. taskId 존재 확인
2. 필요 시 해당 row scroll reveal
3. Task detail interaction이 기존에 있다면 open
```

을 수행한다.

---

# 9.88 Task Result — No Project

Project가 없는 Task의 canonical owning Scope는 domain resolver가 결정한다.

P0 최소 rule:

```text
due/visible in Today    → /tasks/today?task=:id
future scheduled        → /tasks/upcoming?task=:id
```

둘 다 아닌 unassigned/undated Task가 실제 domain에 존재한다면 **그 Task를 표시할 canonical Task scope를 기존 domain에서 제공해야 한다.**

Search 때문에 임의로 Today에 잘못 배치하지 않는다.

---

# 9.89 Unresolvable Task

Task는 검색되었지만 canonical destination을 resolve할 수 없는 경우:

P0:

```text
result disabled
```

또는 검색 provider에서 제외.

최종 결정:

**검색 provider에서 제외한다.**

사용자가 클릭할 수 없는 결과를 노출하지 않는다.

---

# 9.90 Task Result Selection

Task result 선택:

```text
1. resolve canonical target
2. close Search
3. push target href
4. destination view reveals task
```

---

# 9.91 Task Reveal Failure

destination에 task가 이미 삭제/이동되어 reveal 실패하면:

- owning Scope는 정상 표시
- task-specific query param을 replace로 제거 가능
- compact toast optional

---

# 9.92 Search Result Same Route

현재 이미:

```text
/project/p1/list
```

이고 Search에서 p1 Project를 선택한 경우:

P0:

```text
Search close
route navigation no-op 또는 same-route push 방지
```

history에 동일 entry를 불필요하게 추가하지 않는다.

---

# 9.93 Search Result Current Task

현재 route가 동일 task reveal 상태면 Search close만.

---

# 9.94 Recent Entity Update

다음에서 Recent entity timestamp update:

```text
Search result open
Sidebar Entity navigation
Direct Entity navigation optionally
```

P0 final:

**Search result open + Sidebar Entity navigation**에서 update.

Smart Views는 recent Entity에 저장하지 않는다.

---

# 9.95 Recent Task Update

Task Search result를 실제 open했을 때 recent에 저장.

---

# 9.96 Recent Order

```text
lastOpenedAt descending
```

최대 8.

---

# 9.97 Recent Section Label

empty query:

```text
최근 항목
```

group type별로 나누지 않는다.

최근성을 우선.

---

# 9.98 Recent Result Row

동일 44px Search result row primitive 사용.

metadata로 type/parent 표시.

---

# 9.99 Empty Recent State

최근 항목이 없으면:

```text
작업, 프로젝트, 공간을 검색해 보세요.
```

추가 illustration 없음.

---

# 9.100 Search Initial Active Result

dialog open + empty query:

```text
activeResult = null
```

ArrowDown 첫 입력에서 첫 Recent item active.

query 검색 완료 후도:

```text
activeResult = null
```

P0에서는 첫 result를 자동 active하지 않는다.

---

# 9.101 Why No Automatic First Result

Enter를 누르는 순간 의도하지 않은 첫 결과가 열리는 사고 방지.

사용자가 ArrowDown 또는 pointer로 명시 선택.

---

# 9.102 Pointer Click

Result row 전체가 click target.

metadata/icon 부분도 같은 result open.

---

# 9.103 Double Click

별도 action 없음.

---

# 9.104 Right Click

P0 Search result custom context menu 없음.

Search는 빠른 navigation에 집중.

---

# 9.105 Drag

Search result drag 없음.

---

# 9.106 Search and Sidebar Create

§6 정책 유지.

Search overlay open 자체는 Sidebar create session을 유지한다.

Search close without navigation:

```text
focus → create input
```

Search result navigation:

```text
create session cancel
→ navigate
```

---

# 9.107 Search and Sidebar Rename

Search open:

P0 final:

```text
rename session 유지
```

Search close:

```text
focus → rename input
```

Search result navigation:

```text
rename cancel
→ navigate
```

---

# 9.108 Search and Header Rename

동일.

---

# 9.109 Search and Context Sidebar Overlay

narrow viewport에서 Tasks Sidebar overlay가 열려 있을 때 Search open:

```text
Context Sidebar overlay remains logically open but inert
```

P0 final UX:

**Search open 시 Context Sidebar overlay를 close한다.**

이유:

- global modal 위에 drawer가 남아 있는 복잡한 stack 방지
- Search close 후 Main으로 명확히 복귀

desktop persistent Sidebar는 그대로 유지.

---

# 9.110 Search and Account Popover

Account popover가 open이면 Search open 시 Account close.

---

# 9.111 Search and Header/Tree Context Menu

모두 닫음.

---

# 9.112 Search and Destructive Confirmation Dialog

Delete confirmation 같은 modal dialog가 이미 open이면 `/` shortcut으로 Search를 열지 않는다.

Global modal stack에서 destructive dialog가 우선.

Rail Search button도 confirmation dialog 뒤에 inert이므로 접근 불가.

---

# 9.113 Search and Focus Mode

Focus Global Module에서도 Search 사용 가능.

underlying `/focus` 유지.

Search result 선택 시 Tasks Project/Space route로 이동 가능.

---

# 9.114 Search and Settings

Settings에서도 Search 사용 가능.

Search result 선택 시 Tasks route로 이동.

---

# 9.115 Search and Global Calendar

Global Calendar에서도 Search 사용 가능.

Project result 선택 시 Tasks Project route로 이동.

---

# 9.116 Search Open Visual Rail State

Search button:

```text
data-state="open"
```

persistent active module은 유지.

예:

```text
Calendar active
Search open

Rail:
Calendar = active
Search = open
```

---

# 9.117 Search Panel Header

별도 title row를 만들지 않는다.

input 자체가 panel 상단.

즉:

```text
"검색"
title
+
input
```

처럼 vertical space를 중복 사용하지 않는다.

---

# 9.118 Close Button

Desktop P0에서는 별도 `X` close button을 필수로 두지 않는다.

Escape/backdrop으로 닫기 가능.

접근성 관점에서 pointer close affordance가 필요하면 input trailing에 `X`를 둘 수 있으나 P0 final:

**input trailing에 Close button을 둔다.**

---

# 9.119 Close Button Geometry

```text
32 × 32px
icon 16px
radius 8px
```

aria-label:

```text
검색 닫기
```

검색 query가 있더라도 `X`는 query clear가 아니라 dialog close.

---

# 9.120 Query Clear Button

P0 별도 clear `×`를 추가하지 않는다.

keyboard:

```text
Cmd/Ctrl+A → Backspace
```

또는 입력 표준 사용.

Close와 Clear가 같은 icon으로 혼동되는 문제 방지.

---

# 9.121 Search Input Trailing

```text
[optional loading spinner] [close]
```

spinner와 close hit target이 겹치지 않게.

---

# 9.122 Search Footer

P0 Desktop에서 panel footer를 둔다.

height:

```text
32px
```

내용:

```text
↑↓ 이동   Enter 열기   Esc 닫기
```

muted keyboard hint.

---

# 9.123 Footer Visibility

viewport height가 작으면 footer를 숨길 수 있다.

narrow mobile-like layout에서는 optional.

---

# 9.124 Footer Typography

```text
11px
400
muted
```

keyboard hint keycaps는 과한 boxed style 대신 subtle token.

---

# 9.125 Panel Internal Structure

```text
Search Input        52px
Divider             1px
Results             flex / max height
Footer              32px
```

---

# 9.126 Search Result Divider Policy

각 row 사이 horizontal line 없음.

Group 사이 spacing:

```text
4px
```

Group label로만 구분.

---

# 9.127 Group Empty Omission

특정 group 결과가 0이면 해당 group header도 렌더하지 않는다.

예:

```text
Tasks 0
Projects 2
Spaces 1
```

→ Project / Space groups만 표시.

---

# 9.128 All Group Empty

단일 empty state.

---

# 9.129 Search Results Stable Ordering

같은 query에서 data refresh가 일어나도 결과가 불필요하게 계속 재정렬되지 않게 stable tie-break 사용.

예:

```text
score
recent
title
id
```

---

# 9.130 Search Entity Identity

result key:

```text
`${type}:${id}`
```

type이 다르면 id collision이 있어도 안전.

---

# 9.131 Search Result Accessible Name

Task:

```text
"<title>, 작업, <project name>"
```

Project:

```text
"<title>, 프로젝트, <space name>"
```

Space:

```text
"<title>, 공간"
```

---

# 9.132 Search Announcement

결과 업데이트 후 screen reader live region:

```text
"검색 결과 6개"
```

정도를 polite announce 가능.

매 keystroke에 장문의 결과를 읽지 않는다.

---

# 9.133 Search Loading Announcement

150ms 이상 걸리는 경우:

```text
"검색 중"
```

polite.

---

# 9.134 Search Error Announcement

error message는 `role=status` 또는 appropriate alert semantics.

---

# 9.135 Narrow Layout Breakpoint

viewport width:

```text
< 768px
```

에서 Search panel을 inset sheet처럼 사용.

```text
top: 12px
left: 12px
right: 12px
bottom: 12px
width: auto
max-height: none
```

거의 full-screen overlay.

---

# 9.136 Narrow Panel Radius

```text
12px
```

유지.

완전 edge-to-edge full-screen으로 붙이지 않는다.

---

# 9.137 Narrow Search Input

```text
height: 52px
```

desktop과 동일.

---

# 9.138 Narrow Results

남은 height를 모두 사용.

```text
flex: 1
overflow-y: auto
```

---

# 9.139 Narrow Footer

keyboard hint footer는 touch viewport에서는 숨길 수 있다.

close button은 유지.

---

# 9.140 Search and Virtual Keyboard

mobile/touch 환경에서 input autofocus로 virtual keyboard가 열리는 것을 허용.

result panel은 remaining visual viewport에 맞춰야 한다.

가능하면:

```text
100dvh / visualViewport
```

handling을 기존 overlay primitive와 맞춘다.

---

# 9.141 Touch Result Row

44px row는 최소 pointer target에 근접.

touch-only breakpoint에서 필요하면:

```text
48px
```

로 늘릴 수 있다.

§12에서 최종 responsive token 확정.

---

# 9.142 Search Backdrop Motion

open:

```text
panel opacity + slight translateY
```

권장:

```text
duration 140ms
translateY -4px → 0
```

과한 scale animation 없음.

---

# 9.143 Search Close Motion

```text
100~120ms
```

정도.

route navigation 선택 시 animation 완료를 기다린 뒤 navigate하지 않는다.

navigation 즉시 수행 가능.

---

# 9.144 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  transition: none;
}
```

---

# 9.145 Search Overlay Token Interface

```css
--search-panel-width: 640px;
--search-panel-top: 64px;
--search-panel-radius: 12px;
--search-panel-border-width: 1px;

--search-input-height: 52px;
--search-input-padding-x: 16px;
--search-input-icon-size: 20px;

--search-result-row-height: 44px;
--search-result-row-radius: 8px;
--search-result-margin-x: 6px;
--search-result-padding-x: 10px;

--search-group-header-height: 28px;
--search-footer-height: 32px;

--search-close-button-size: 32px;

--search-open-duration: 140ms;
--search-close-duration: 110ms;
```

---

# 9.146 Search Color Token Interface

```css
--search-backdrop
--search-panel-bg
--search-panel-border
--search-panel-shadow

--search-input-text
--search-input-placeholder
--search-input-icon
--search-input-divider

--search-result-text
--search-result-meta
--search-result-hover-bg
--search-result-active-bg

--search-group-label
--search-footer-text
--search-empty-text
--search-error-text
--search-focus-ring
```

실제 값은 §11.

---

# 9.147 Suggested Component Structure

```text
GlobalSearchDialog
├ SearchInput
├ SearchResults
│  ├ RecentResults
│  └ GroupedSearchResults
│     ├ TaskResultGroup
│     ├ ProjectResultGroup
│     └ SpaceResultGroup
└ SearchFooter
```

---

# 9.148 Search Controller

권장:

```ts
type GlobalSearchController = {
  open(origin: "rail" | "shortcut"): void;
  close(): void;
  setQuery(query: string): void;
  moveActive(direction: "next" | "previous"): void;
  openActive(): void;
  openResult(result: GlobalSearchResult): void;
};
```

---

# 9.149 Search Result Union

```ts
type GlobalSearchResult =
  | SearchTaskResult
  | SearchProjectResult
  | SearchSpaceResult;
```

---

# 9.150 Open Result Resolver

```ts
function resolveSearchResultHref(
  result: GlobalSearchResult
): string | null {
  switch (result.type) {
    case "space":
      return routes.space.overview(result.id);

    case "project":
      return routes.project.list(result.id);

    case "task":
      return resolveTaskNavigationTarget(result)?.href ?? null;
  }
}
```

---

# 9.151 Search Open Invariants

## INV-SEARCH-01

Search open은 current route를 변경하지 않는다.

## INV-SEARCH-02

Search open 중 persistent Rail active module은 유지된다.

## INV-SEARCH-03

Search result navigation 성공 시 Search는 닫힌다.

## INV-SEARCH-04

Search query는 URL에 들어가지 않는다.

## INV-SEARCH-05

동시에 Account popover/context menu와 Search가 열리지 않는다.

## INV-SEARCH-06

Result navigation은 canonical route builder를 사용한다.

## INV-SEARCH-07

Task result는 실제 reveal 가능한 canonical target이 있을 때만 노출한다.

---

# 9.152 Interaction Test Cases

## SEARCH-01 Rail Open

```text
Given /project/p1/gantt
When Rail Search is clicked
Then Search opens
And URL remains /project/p1/gantt
And Tasks remains active
```

## SEARCH-02 Shortcut

```text
Given body/non-input focus
When "/" is pressed
Then Search opens
And Search input receives focus
```

## SEARCH-03 Shortcut Input Protection

```text
Given a text input focused
When "/" is typed
Then "/" is entered normally
And Search does not open
```

## SEARCH-04 Recent

```text
Given query empty
Then up to 8 recent entities are shown
```

## SEARCH-05 Search Project

```text
Given query matches Project p1
When p1 result is opened
Then Search closes
And route becomes /project/p1/list
```

## SEARCH-06 Search Space

```text
When Space s1 result is opened
Then route becomes /space/s1/overview
```

## SEARCH-07 Search Task

```text
Given task t1 belongs to Project p1
When t1 result is opened
Then route becomes /project/p1/list?task=t1
And destination reveals t1
```

## SEARCH-08 No Automatic First Result

```text
Given search results loaded
When user presses Enter without choosing a result
Then no navigation occurs
```

## SEARCH-09 Keyboard Result

```text
Given results loaded
When ArrowDown then Enter
Then first result opens
```

## SEARCH-10 Escape

```text
Given Search open from Rail button
When Escape
Then Search closes
And focus returns to Rail Search button
```

## SEARCH-11 Request Race

```text
Given query "a" request is slow
And query changes to "ab"
When "a" response arrives last
Then "a" results do not overwrite "ab" results
```

## SEARCH-12 Error

```text
Given search request fails
Then dialog remains open
And retry is available
```

## SEARCH-13 Search while Account Open

```text
Given Account popover open
When Search opens
Then Account popover closes
```

## SEARCH-14 Narrow Drawer

```text
Given viewport <768
When Search opens
Then inset near-fullscreen Search layout is used
```

---

# 9.153 QA Checklist

- [ ] 기존 Sidebar 상시 검색 input이 제거 가능하다.
- [ ] Rail Search icon과 `/` shortcut이 동일 Search Overlay를 연다.
- [ ] Search는 Page navigation이 아니라 modal overlay다.
- [ ] Search open 시 current route가 유지된다.
- [ ] Search open 시 current Global Module active state가 유지된다.
- [ ] Search panel desktop width는 640px이다.
- [ ] Search panel은 top 64px에 배치된다.
- [ ] Search panel max height가 viewport를 넘지 않는다.
- [ ] Search input height는 52px이다.
- [ ] Search placeholder가 `작업, 프로젝트, 공간 검색`이다.
- [ ] Empty query에서는 최근 Entity 최대 8개를 보여준다.
- [ ] 최근 검색어 문자열을 저장하지 않는다.
- [ ] Search 대상은 Task / Project / Space다.
- [ ] Archived/deleted Entity는 P0 active 검색에서 제외된다.
- [ ] Result group order는 Task → Project → Space다.
- [ ] Result row height는 44px이다.
- [ ] Result label은 한 줄 ellipsis다.
- [ ] Task 결과에는 owner metadata를 표시할 수 있다.
- [ ] Project 결과에는 Space metadata를 표시한다.
- [ ] match substring bold highlight는 P0에서 사용하지 않는다.
- [ ] ArrowUp/Down/Enter/Escape keyboard interaction이 동작한다.
- [ ] Enter는 명시 active result가 없으면 no-op이다.
- [ ] 결과 row는 Tab stop을 대량 생성하지 않는다.
- [ ] Search dialog는 focus trap을 가진다.
- [ ] IME composition 중 Enter가 result open으로 오인되지 않는다.
- [ ] `/` shortcut은 text-editing context를 방해하지 않는다.
- [ ] Search debounce는 약 120ms다.
- [ ] stale request 결과가 최신 query를 덮지 않는다.
- [ ] Search loading spinner flicker를 줄이기 위한 delay가 있다.
- [ ] zero result state가 있다.
- [ ] error + retry state가 있다.
- [ ] Project result는 `/project/:id/list`로 간다.
- [ ] Space result는 `/space/:id/overview`로 간다.
- [ ] Project-owned Task result는 `/project/:id/list?task=:taskId`를 사용한다.
- [ ] canonical target이 없는 Task는 클릭 불가 결과로 노출하지 않는다.
- [ ] Search open 시 Account/context menu를 닫는다.
- [ ] destructive modal open 중 Search를 stack하지 않는다.
- [ ] Search close 시 focus가 적절히 복원된다.
- [ ] Desktop Search에는 Close button이 있다.
- [ ] Close button과 query clear 기능을 혼동하지 않는다.
- [ ] Search footer에 keyboard hints가 있다.
- [ ] viewport <768에서는 inset near-fullscreen layout을 사용한다.
- [ ] Search motion은 reduced-motion을 존중한다.
- [ ] Search result route는 raw string이 아니라 route builder를 사용한다.

---

# 9.154 Acceptance Criteria

## AC-SEARCH-01

Search는 현재 route와 persistent Global Module을 보존하는 전역 modal overlay로 동작한다.

## AC-SEARCH-02

Rail icon과 `/` shortcut이 동일 controller를 사용하며 text input/IME context를 방해하지 않는다.

## AC-SEARCH-03

빈 query에서는 최근 Entity를, query가 있으면 Task / Project / Space 그룹 결과를 표시한다.

## AC-SEARCH-04

Search 결과는 keyboard Arrow + Enter와 pointer click 양쪽으로 열 수 있다.

## AC-SEARCH-05

Project/Space 결과는 §8 canonical default route로 이동한다.

## AC-SEARCH-06

Task 결과는 실제 Task를 reveal 가능한 canonical owning Scope로 이동하며 unresolvable result는 노출하지 않는다.

## AC-SEARCH-07

Search request debounce/cancellation이 stale result overwrite를 방지한다.

## AC-SEARCH-08

Search open/close는 browser history 또는 URL query를 오염시키지 않는다.

## AC-SEARCH-09

Search는 loading / empty / error / recent 상태를 모두 처리한다.

## AC-SEARCH-10

Desktop과 narrow viewport에서 동일 search semantics와 keyboard/focus contract를 유지한다.

---

# 9.155 최종 결정 요약

```text
TYPE
Global Modal Overlay
```

```text
ENTRY
Rail Search
/
```

```text
DESKTOP
640px wide
Top 64px
Max height min(720px, viewport - 96px)
```

```text
NARROW
<768px
12px inset near-fullscreen
```

```text
INPUT
52px
```

```text
TARGETS
Task
Project
Space
```

```text
EMPTY QUERY
Recent Entities
max 8
```

```text
GROUP ORDER
Tasks
Projects
Spaces
```

```text
ROW
44px
```

```text
KEYBOARD
↑ ↓ Enter Escape
```

```text
DEBOUNCE
120ms
```

```text
PROJECT RESULT
/project/:id/list
```

```text
SPACE RESULT
/space/:id/overview
```

```text
TASK RESULT
Owning canonical Scope
Project example:
/project/:id/list?task=:taskId
```

```text
URL
Search open/query not stored
```

---

# 9.156 §9에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- Search overlay vs Search page
- entry point
- desktop position/size
- narrow layout
- backdrop/layer
- Search input geometry
- placeholder
- empty query Recent strategy
- Recent storage policy
- searchable Entity types
- group order
- result row geometry
- metadata
- query highlight 미사용
- keyboard selection
- no auto-first-result policy
- IME handling
- `/` shortcut protection
- debounce
- stale request cancellation
- loading/empty/error
- result limits
- full result page 미사용
- Project/Space destination
- Task destination resolver
- Search/Account/context menu modal stacking
- focus restoration
- Search URL/history 미사용

---

# 10. Sidebar Collapse / Resize Interaction Consolidation

- 상태: **확정**
- 우선순위: **P0**
- 적용 대상: `Context Sidebar Frame / App Shell`
- 목적: §2~§4에서 정의한 Sidebar의 `width / collapse / overlay / resize / persistence / breakpoint` 규칙을 하나의 **상태 머신과 구현 계약**으로 통합한다.
- 선행: §2 Global Rail, §3 Context Sidebar Frame, §7 Main Content 연동
- 후속: §11 Visual System
- 우선순위 규칙: 본 §10이 §2~§4의 Sidebar interaction 세부 규칙과 충돌할 경우 **§10이 우선**한다.

---

# 10.1 최종 상태 모델

Sidebar는 아래 3종 상태를 분리해서 관리한다.

```text
A. Mode
   tasks | none

B. Desktop Visibility Preference
   expanded | collapsed

C. Responsive Runtime
   persistent | overlay
```

추가 transient state:

```text
overlayOpen
isResizing
```

---

# 10.2 최종 타입

권장 conceptual type:

```ts
type ContextSidebarMode =
  | "tasks"
  | "none";

type DesktopSidebarVisibility =
  | "expanded"
  | "collapsed";

type SidebarResponsiveMode =
  | "persistent"
  | "overlay";

type ContextSidebarState = {
  width: number;

  desktopVisibility: DesktopSidebarVisibility;

  responsiveMode: SidebarResponsiveMode;

  overlayOpen: boolean;

  isResizing: boolean;
};
```

---

# 10.3 핵심 원칙

다음은 서로 독립된 개념이다.

```text
width
≠
desktopVisibility
≠
overlayOpen
≠
mode
```

예:

```ts
{
  width: 304,
  desktopVisibility: "collapsed",
  responsiveMode: "persistent",
  overlayOpen: false,
  isResizing: false,
}
```

은 유효한 상태다.

---

# 10.4 Width Constants

최종:

```text
default = 248px
min     = 216px
max     = 360px
```

Rail:

```text
56px fixed
```

---

# 10.5 Breakpoint

최종 breakpoint:

```text
1024px
```

조건:

```ts
responsiveMode =
  viewportWidth >= 1024
    ? "persistent"
    : "overlay";
```

---

# 10.6 Persistent Mode

조건:

```text
viewport >= 1024px
```

layout:

```text
Rail | Context Sidebar | Main
```

Sidebar effective visibility:

```text
desktopVisibility = expanded
→ width slot = stored width

desktopVisibility = collapsed
→ width slot = 0
```

---

# 10.7 Overlay Mode

조건:

```text
viewport < 1024px
```

base layout:

```text
Rail | Main
```

Sidebar는 overlay layer.

```text
overlayOpen = true
→ visible drawer

overlayOpen = false
→ hidden
```

---

# 10.8 Mode = none

Global Module이:

```text
Calendar
Focus
Settings
```

일 때:

```text
ContextSidebarMode = none
```

결과:

```text
persistent → width slot 0
overlay     → overlay closed
```

단 preference는 지우지 않는다.

---

# 10.9 Effective Desktop Width

```ts
function getPersistentSidebarWidth({
  mode,
  desktopVisibility,
  width,
}: ContextSidebarState & { mode: ContextSidebarMode }) {
  if (mode === "none") return 0;

  if (desktopVisibility === "collapsed") {
    return 0;
  }

  return clamp(width, 216, 360);
}
```

---

# 10.10 Effective Overlay Width

overlay:

```ts
function getOverlaySidebarWidth(
  storedWidth: number,
  viewportWidth: number
) {
  const maxByViewport =
    viewportWidth
    - 56
    - 24;

  return clamp(
    Math.min(storedWidth, maxByViewport),
    216,
    360
  );
}
```

단:

```text
viewportWidth - 56 - 24 < 216
```

가 되는 매우 좁은 viewport는 §12 mobile fallback 범위.

---

# 10.11 Desktop Collapse Toggle

persistent + Tasks:

```text
expanded ↔ collapsed
```

control:

```text
Expanded:
Sidebar Header의 collapse button

Collapsed:
Main Header의 expand button
```

Rail Tasks icon은 toggle 아님.

---

# 10.12 Overlay Toggle

overlay + Tasks:

```text
overlayOpen true ↔ false
```

control:

```text
Closed:
Main Header sidebar-open button

Open:
Overlay Sidebar Header close/collapse button
```

---

# 10.13 Toggle 의미 분리

같은 icon family를 사용할 수 있지만 내부 command는 다르다.

```text
Desktop:
setDesktopVisibility(...)

Overlay:
setOverlayOpen(...)
```

하나의 boolean `sidebarOpen`으로 둘을 합치지 않는다.

---

# 10.14 Shortcut

P0 shortcut:

```text
Cmd/Ctrl + \
```

---

# 10.15 Shortcut Persistent Mode

Tasks + persistent:

```text
expanded ↔ collapsed
```

---

# 10.16 Shortcut Overlay Mode

Tasks + overlay:

```text
overlayOpen ↔ closed
```

즉 shortcut semantics는:

```text
"현재 Tasks Sidebar를 toggle"
```

이지만 저장 state는 responsive mode별로 다름.

---

# 10.17 Shortcut Mode = none

Calendar / Focus / Settings:

```text
no-op
```

Search modal open:

```text
no-op
```

destructive dialog open:

```text
no-op
```

text editor가 shortcut을 claim:

```text
editor 우선
```

---

# 10.18 Shortcut Registry

페이지별:

```ts
window.addEventListener("keydown", ...)
```

를 중복 등록하지 않는다.

앱 수준 shortcut registry 또는 shell handler 한 곳에서 관리.

---

# 10.19 Shortcut Conflict Policy

브라우저/OS/기존 editor와 실제 충돌이 확인되면 shortcut만 변경 가능하다.

다만 UI button behavior/state machine은 변경하지 않는다.

P0 default는:

```text
Cmd/Ctrl + \
```

로 구현.

---

# 10.20 Persistent Collapse Transition

expanded → collapsed:

```text
1. close Sidebar-local menu/popover
2. cancel inline create/rename
3. desktopVisibility = collapsed
4. width preference는 유지
5. Main expands into freed space
```

---

# 10.21 Persistent Expand Transition

collapsed → expanded:

```text
1. desktopVisibility = expanded
2. restore stored width
3. render Tasks Sidebar
4. active parent Space ensure expanded
5. active Entity nearest reveal
```

---

# 10.22 Overlay Open Transition

closed → open:

```text
1. overlayOpen = true
2. mount Sidebar overlay
3. backdrop mount
4. active Entity hierarchy ensure visible
5. focus panel or active row
```

---

# 10.23 Overlay Close Transition

open → closed:

```text
1. close Sidebar-local menu
2. cancel inline create/rename
3. overlayOpen = false
4. unmount overlay
5. focus restore to Main Header sidebar-open button
```

---

# 10.24 Overlay Navigation Close

Overlay Sidebar에서:

```text
Today
Upcoming
Space
Project
Archive
```

중 하나 선택 후 route navigation 성공:

```text
overlayOpen = false
```

---

# 10.25 Overlay Tree Expansion

Space chevron:

```text
overlay 유지
```

---

# 10.26 Overlay Create

create session:

```text
overlay 유지
```

성공 후 auto navigation:

```text
overlay close
```

실패:

```text
overlay 유지
```

---

# 10.27 Overlay Rename

rename:

```text
overlay 유지
```

rename 성공 자체는 navigation이 아니므로:

```text
overlay 유지
```

---

# 10.28 Search Open from Persistent Sidebar

persistent mode:

```text
Search open
→ Sidebar geometry/state 그대로
```

Search close:

```text
복원
```

---

# 10.29 Search Open from Overlay Sidebar

§9 최종 규칙 유지.

```text
overlay Sidebar open
→ Search open
→ overlay Sidebar close
```

단 desktop preference는 변경하지 않는다.

---

# 10.30 Account Popover

persistent:

```text
Sidebar 유지
```

overlay:

Account popover는 Rail에 anchor되므로 Overlay Sidebar와 동시에 열릴 경우 시각 stack이 복잡하다.

P0 final:

```text
Account open
→ overlay Sidebar close
```

desktop preference 변경 없음.

---

# 10.31 Resize Eligibility

resize 가능 조건:

```text
mode = tasks
responsiveMode = persistent
desktopVisibility = expanded
```

그 외:

```text
resize disabled
```

---

# 10.32 Overlay Resize

P0에서는 overlay Sidebar drag resize를 지원하지 않는다.

overlay width는 stored desktop width를 viewport clamp해서 사용.

---

# 10.33 Collapsed Resize

collapsed 상태에서는 resize handle이 존재하지 않는다.

---

# 10.34 Resize Start State

pointer down:

```ts
isResizing = true;
resizeStartWidth = width;
resizeStartX = event.clientX;
```

추가:

```text
close tooltip
close local context menu
```

---

# 10.35 Resize Live Update

pointer move:

```ts
width = clamp(
  resizeStartWidth
  + currentX
  - resizeStartX,
  216,
  360
);
```

Main layout 즉시 업데이트.

---

# 10.36 Resize Commit

pointer up:

```text
isResizing = false
persist final width
release pointer capture
restore selection behavior
```

---

# 10.37 Resize Cancel

resize 중 Escape:

```text
width = resizeStartWidth
isResizing = false
do not persist cancelled width
```

---

# 10.38 Resize → Module Switch

drag 중 Calendar/Focus/Settings 이동:

```text
1. commit current clamped width
2. isResizing = false
3. release pointer capture
4. module switch
```

---

# 10.39 Resize → Search

drag 중 `/`:

```text
1. commit current width
2. end resize
3. open Search
```

---

# 10.40 Resize → Collapse

drag 중 collapse action이 발생하면:

```text
1. commit current width
2. end resize
3. collapse
```

---

# 10.41 Resize → Browser Resize

drag 도중 browser viewport가 breakpoint를 넘으면:

```text
1. commit current clamped width
2. end resize
3. responsive transition
```

---

# 10.42 Resize Double-click

Resize handle double click:

```text
width = 248
persist
```

collapsed로 바꾸지 않는다.

---

# 10.43 Keyboard Resize

separator focused:

```text
ArrowLeft  -16
ArrowRight +16

Shift+ArrowLeft  -32
Shift+ArrowRight +32

Home 216
End  360
```

---

# 10.44 Keyboard Resize Persistence

매 keydown마다 synchronous localStorage write는 하지 않는다.

권장:

```text
UI 즉시 update
persist debounce 200ms
```

focus blur 시 final 값 flush.

---

# 10.45 Width Persistence

conceptual:

```text
focusflow.ui.contextSidebar.width
```

저장:

```text
number
```

---

# 10.46 Desktop Visibility Persistence

conceptual:

```text
focusflow.ui.contextSidebar.collapsed
```

저장:

```text
boolean
```

---

# 10.47 Overlay Open Persistence

저장하지 않는다.

```text
sessionStorage X
localStorage X
URL X
```

runtime-only.

---

# 10.48 First Load Default

저장값이 없으면:

```text
width = 248
desktopVisibility = expanded
overlayOpen = false
```

---

# 10.49 First Load Persistent

viewport >= 1024 + Tasks:

```text
stored expanded
→ Sidebar render

stored collapsed
→ collapsed
```

---

# 10.50 First Load Overlay

viewport < 1024 + Tasks:

```text
overlayOpen = false
```

desktopVisibility가 expanded여도 자동 open하지 않는다.

---

# 10.51 Breakpoint Persistent → Overlay

viewport:

```text
1024 → 1023 이하
```

transition:

```text
1. preserve width
2. preserve desktopVisibility
3. overlayOpen = false
4. persistent Sidebar slot → 0
5. Main expands
```

자동 Drawer open 금지.

---

# 10.52 Breakpoint Overlay → Persistent

viewport:

```text
1023 → 1024 이상
```

transition:

```text
1. overlayOpen = false
2. apply stored desktopVisibility
3. if expanded:
     restore stored width
4. if collapsed:
     width slot 0
```

---

# 10.53 Breakpoint Hysteresis

P0에서는 별도 hysteresis를 두지 않는다.

정확히:

```text
>=1024 persistent
<1024 overlay
```

단 브라우저 scrollbar/zoom 때문에 반복 toggle이 실제로 발생하면 향후 8~16px hysteresis 검토 가능.

---

# 10.54 Mode Change Tasks → Calendar

```text
mode tasks → none
```

동작:

```text
1. close overlay if open
2. cancel create/rename
3. close local menu
4. preserve width
5. preserve desktopVisibility
6. Sidebar slot remove
```

---

# 10.55 Mode Change Calendar → Tasks

persistent:

```text
restore desktopVisibility
restore width if expanded
```

overlay:

```text
overlay closed
```

Tasks route와 tree state는 §8/§5 정책대로 복원.

---

# 10.56 Mode Change Tasks → Focus

Calendar와 동일.

---

# 10.57 Mode Change Tasks → Settings

동일.

---

# 10.58 Collapse Animation

persistent:

```text
duration = 160ms
easing = ease-out
```

---

# 10.59 Expand Animation

persistent:

```text
duration = 160ms
easing = ease-out
```

---

# 10.60 Overlay Open Animation

권장:

```text
duration = 160ms
transform: translateX(-8px) → 0
opacity: 0.98 → 1
```

큰 slide animation 금지.

---

# 10.61 Overlay Close Animation

```text
120ms
```

---

# 10.62 Resize Animation

```text
none
```

drag 중 transition disabled.

---

# 10.63 Reduced Motion

```text
all collapse/expand/overlay transitions = none
```

layout correctness는 동일.

---

# 10.64 Animation and Navigation

animation 완료를 기다린 후 route navigate하는 구조 금지.

navigation 먼저/동시에 진행 가능.

---

# 10.65 App Shell Grid Transition

persistent에서 권장:

```css
grid-template-columns:
  56px
  var(--context-sidebar-effective-width)
  minmax(0, 1fr);
```

collapse animation:

```text
second column width transition
```

---

# 10.66 Content Fade

Sidebar content는 column이 너무 좁아지는 구간에서 clip될 수 있다.

권장:

```text
collapse start
→ content opacity 1 → 0
```

duration:

```text
80ms
```

expand:

```text
column starts expanding
→ content opacity 0 → 1
```

delay:

```text
40ms optional
```

---

# 10.67 `display:none` Timing

persistent collapse animation 중 바로 content `display:none` 처리하지 않는다.

transition 완료 후 unmount/hidden 가능.

단 reduced-motion에서는 즉시 가능.

---

# 10.68 Pointer Blocking During Collapse

Sidebar가 160ms 동안 접히는 중 hidden content가 click되지 않게:

```text
pointer-events: none
```

을 collapse transition 시작 시 적용 가능.

---

# 10.69 Expand Interaction Timing

expand transition 시작 직후 Sidebar content pointer interaction을 허용해도 되지만 clipping 영역 오클릭 방지를 위해:

P0 권장:

```text
80ms 후 pointer enabled
```

또는 transition end.

---

# 10.70 Collapse Focus Handling

Sidebar 내부 요소가 keyboard focus인 상태에서 collapse:

```text
focus → Main Header sidebar-open button
```

collapse 후 hidden element에 focus가 남지 않게 한다.

---

# 10.71 Expand Focus Handling

Main Header open button click:

```text
expand Sidebar
```

P0 final focus:

```text
focus → active Sidebar row
```

active row가 없으면:

```text
Today row
```

---

# 10.72 Shortcut Expand Focus

Cmd/Ctrl+\ 로 expand했을 때:

P0:

```text
focus는 기존 위치 유지
```

shortcut은 pointer/button navigation이 아니므로 강제 focus 이동하지 않는다.

---

# 10.73 Shortcut Collapse Focus

Sidebar 내부 focus일 때 shortcut collapse:

```text
focus → Main Header open button
```

Main Body focus 상태에서 shortcut collapse:

```text
focus 유지
```

---

# 10.74 Overlay Open Focus

Main Header open button click:

```text
focus → active Sidebar row
```

없으면 Today.

---

# 10.75 Overlay Close Focus

escape/backdrop/close button:

```text
focus → Main Header sidebar-open button
```

navigation close:

```text
focus는 clicked row에 남길 수 없으므로
route navigation 정책 따름
```

P0 ordinary nav:

```text
route announcer 사용
Main H1 강제 focus 없음
```

---

# 10.76 Overlay Backdrop Click

backdrop:

```text
close overlay
```

create/rename active면:

```text
cancel edit
close overlay
```

---

# 10.77 Overlay Escape

Escape 우선순위:

```text
1. context menu open → close menu
2. inline rename/create active → cancel edit
3. overlay Sidebar close
```

즉 한 번의 Escape로 edit와 drawer를 동시에 둘 다 닫지 않을 수 있다.

P0 final:

```text
계층적으로 하나씩 닫기
```

---

# 10.78 Persistent Escape

persistent Sidebar에서는 Escape로 Sidebar를 collapse하지 않는다.

---

# 10.79 Resize Handle Focus + Collapse

resize separator가 focus 중 collapse button click:

```text
collapse
focus → Main Header open button
```

---

# 10.80 Hydration Problem

Sidebar preference는 localStorage에 있으므로 SSR/server render 단계에서 알 수 없을 수 있다.

잘못 구현하면:

```text
server: expanded 248
client: collapsed 0
```

으로 layout shift.

---

# 10.81 SSR Strategy — Recommended

앱이 SSR을 사용한다면 Sidebar UI preference를 알기 전까지 **shell-ready class**로 transition을 비활성화한다.

순서:

```text
1. initial shell render
2. client preference read
3. apply width/collapse atomically
4. mark hydrated
5. 이후 transition enable
```

---

# 10.82 No Animation on Initial Hydration

초기 localStorage 복원 과정:

```text
transition: none
```

사용.

사용자가 처음부터 collapse animation을 보는 것처럼 만들지 않는다.

---

# 10.83 Initial Layout Shift Mitigation

가능한 경우 `<head>` 이전 inline script 또는 app bootstrap에서 UI preference를 읽어 root CSS variables에 반영 가능.

예:

```text
--initial-context-sidebar-width
--initial-context-sidebar-collapsed
```

단 CSP/architecture를 깨면서까지 필수로 요구하지 않는다.

---

# 10.84 CSR-only App

CSR-only이면 mount 전에 localStorage state를 읽을 수 있는 state initializer 사용.

가능하면 첫 paint 전에 preference를 적용.

---

# 10.85 Storage Read Failure

localStorage unavailable:

```text
fallback width 248
expanded
```

앱 사용 자체는 계속 가능.

---

# 10.86 Storage Write Failure

interaction은 정상 동작.

다음 load에 preference가 유지되지 않을 수 있음.

toast 없음.

---

# 10.87 Invalid Stored Width

```text
NaN
<216
>360
non-number
```

P0 final:

```text
default 248
```

로 복구.

단 이전 버전에서 220 같은 valid 범위 값은 유지.

---

# 10.88 Invalid Collapsed Value

boolean이 아니면:

```text
expanded
```

fallback.

---

# 10.89 Storage Versioning

기존 Sidebar preference가 이미 존재하면 migration 필요.

권장 conceptual:

```text
focusflow.ui.v1.contextSidebar.width
focusflow.ui.v1.contextSidebar.collapsed
```

또는 existing settings namespace 재사용.

---

# 10.90 Old Sidebar Width Migration

기존 sidebar 폭이 300px 이상으로 저장돼 있다면:

```text
clamp to 360 max
```

단 구 Sidebar가 400px였다는 이유로 새 Sidebar default를 400으로 유지하지 않는다.

---

# 10.91 Old Sidebar Collapsed Migration

기존 full Sidebar collapsed preference가 있더라도 의미가 완전히 같지 않을 수 있다.

P0 final:

- 기존 preference semantics가 "sidebar hidden"과 동일하면 migration 가능
- 아니면 새 preference default expanded

자동 추측 migration 금지.

---

# 10.92 Layout State Ownership

권장:

```text
AppShellUIStore
├ contextSidebarWidth
├ desktopSidebarVisibility
├ overlaySidebarOpen
├ responsiveMode
└ isResizing
```

---

# 10.93 Route Store Separation

다음은 AppShellUIStore에 넣지 않는다.

```text
activeProjectId
activeSpaceId
activeView
activeModule
```

route에서 derive.

---

# 10.94 Tree State Separation

다음은 Sidebar layout store에 넣지 않는다.

```text
expandedSpaceIds
renamingEntity
contextMenuTarget
```

§5 Tree state 소유.

---

# 10.95 Search State Separation

Search open/query도 Sidebar state와 분리.

---

# 10.96 State Machine Events

권장 event:

```ts
type SidebarEvent =
  | { type: "VIEWPORT_CHANGED"; width: number }
  | { type: "MODULE_CHANGED"; mode: ContextSidebarMode }

  | { type: "DESKTOP_TOGGLE" }
  | { type: "DESKTOP_EXPAND" }
  | { type: "DESKTOP_COLLAPSE" }

  | { type: "OVERLAY_OPEN" }
  | { type: "OVERLAY_CLOSE" }

  | { type: "RESIZE_START"; x: number }
  | { type: "RESIZE_MOVE"; x: number }
  | { type: "RESIZE_COMMIT" }
  | { type: "RESIZE_CANCEL" }

  | { type: "RESET_WIDTH" };
```

---

# 10.97 State Transition Table — Persistent

| Current | Event | Next |
|---|---|---|
| expanded | DESKTOP_COLLAPSE | collapsed |
| collapsed | DESKTOP_EXPAND | expanded |
| expanded | DESKTOP_TOGGLE | collapsed |
| collapsed | DESKTOP_TOGGLE | expanded |
| expanded | RESIZE_START | resizing |
| resizing | RESIZE_COMMIT | expanded |
| resizing | RESIZE_CANCEL | expanded |

---

# 10.98 State Transition Table — Overlay

| Current | Event | Next |
|---|---|---|
| closed | OVERLAY_OPEN | open |
| open | OVERLAY_CLOSE | closed |
| open | navigation success | closed |
| open | Search open | closed |
| open | Account open | closed |

---

# 10.99 Breakpoint Transition Table

| From | To | Result |
|---|---|---|
| persistent expanded | overlay | closed overlay, desktop expanded preserved |
| persistent collapsed | overlay | closed overlay, desktop collapsed preserved |
| overlay closed | persistent | restore desktop preference |
| overlay open | persistent | close overlay, restore desktop preference |

---

# 10.100 Module Transition Table

| Module | Sidebar |
|---|---|
| Tasks | responsive rule 적용 |
| Calendar | none |
| Focus | none |
| Settings | none |
| Search overlay | underlying state preserve |

---

# 10.101 Race — Rapid Toggle

사용자가 collapse/expand를 빠르게 연타해도 final state가 event 순서대로 결정되어야 한다.

animation이 중간 state를 lock하지 않는다.

가능하면 transition은 current computed width에서 새 target으로 이어진다.

---

# 10.102 Race — Toggle During Animation

160ms animation 중 반대 toggle 허용.

```text
expanding
→ collapse event
→ 현재 visual position에서 reverse
```

animation 완료를 기다리지 않는다.

---

# 10.103 Race — Viewport Change During Animation

persistent collapse 애니메이션 중 overlay breakpoint 진입:

```text
animation cancel
persistent slot 0
overlay closed
```

---

# 10.104 Race — Search During Animation

persistent collapse animation 중 Search:

```text
Search open
Sidebar transition 계속 가능
```

underlying layout transition을 Search backdrop 아래에서 완료해도 됨.

단 overlay Sidebar인 경우 Search open 시 즉시 close.

---

# 10.105 Race — Route Change During Expand

Sidebar expand 중 Project navigation:

```text
route change 허용
active row resolve
animation 계속
```

완료 후 active row reveal.

---

# 10.106 Active Row Reveal Timing

persistent expand:

```text
transition start
→ tree mount
→ next frame active row measure
→ nearest reveal
```

Sidebar 폭이 0에 가까운 시점에 scrollIntoView를 실행해 잘못된 계산이 되지 않게 한다.

P0 권장:

```text
content interactive point(약 80ms) 후 reveal
```

또는 ResizeObserver/layout-ready callback.

---

# 10.107 Main Content Layout Stability

Sidebar toggle에서 Main은 같은 App Shell 안에서 width만 변경.

Main component를 route-like remount하지 않는다.

Board/Gantt 등 expensive View가 Sidebar toggle 때문에 unmount되면 안 된다.

---

# 10.108 Board/Gantt Resize Notification

Sidebar width 변경으로 contained View available width가 바뀐다.

Board/Gantt/Calendar가 measurement를 필요로 하면:

```text
ResizeObserver
```

사용을 권장.

Sidebar component가 직접 각 View의 `recalculate()`를 호출하지 않는다.

---

# 10.109 ResizeObserver Contract

Main Content root 또는 contained view root가 자체 크기 변화를 관찰.

이를 통해:

- Sidebar resize
- collapse
- browser resize

모두 동일 mechanism으로 대응.

---

# 10.110 Window Resize Listener

Sidebar responsive mode 결정에는 viewport listener 필요.

권장:

```text
matchMedia("(min-width: 1024px)")
```

또는 app breakpoint abstraction.

scroll마다 실행되는 layout listener 금지.

---

# 10.111 Breakpoint Source Single

CSS breakpoint와 JS breakpoint 값이 다르지 않게 한다.

권장 token/source:

```ts
const CONTEXT_SIDEBAR_PERSISTENT_MIN_WIDTH = 1024;
```

CSS에도 동일 design token/build constant 사용 가능.

---

# 10.112 CSS Media Query

개념:

```css
@media (min-width: 1024px) {
  ...
}
```

JS state와 같은 기준.

---

# 10.113 Main Header Toggle Visibility

Tasks + persistent:

```text
desktop expanded  → Header open button hidden
desktop collapsed → Header open button visible
```

Tasks + overlay:

```text
overlay closed → Header open button visible
overlay open   → backdrop 아래
```

mode none:

```text
button hidden
```

---

# 10.114 Sidebar Header Toggle Visibility

persistent expanded:

```text
collapse button visible
```

persistent collapsed:

```text
Sidebar 없음
```

overlay open:

```text
close button visible
```

overlay closed:

```text
Sidebar 없음
```

---

# 10.115 Toggle Labels

persistent:

```text
expanded button → "사이드바 접기"
collapsed button → "사이드바 펼치기"
```

overlay:

```text
open button → "사이드바 열기"
drawer button → "사이드바 닫기"
```

---

# 10.116 Toggle Tooltip

ARIA label과 동일 문구 사용.

---

# 10.117 Toggle Icon Direction

persistent:

```text
collapse → panel-left-close
expand   → panel-left-open
```

overlay도 같은 icon family 사용 가능.

---

# 10.118 Collapsed Rail Relationship

Global Rail은 항상 56px 유지.

Context Sidebar collapse가 Rail icon/spacing을 변경하지 않는다.

---

# 10.119 Sidebar Collapse ≠ Rail Collapse

UI copy나 code naming에서 혼동 금지.

권장 naming:

```text
GlobalRail
ContextSidebar
```

금지:

```text
leftSidebar
sidebar2
miniSidebar
```

처럼 의미가 불명확한 이름.

---

# 10.120 Layout Token Interface

```css
--context-sidebar-default-width: 248px;
--context-sidebar-min-width: 216px;
--context-sidebar-max-width: 360px;

--context-sidebar-persistent-breakpoint: 1024px;

--context-sidebar-collapse-duration: 160ms;
--context-sidebar-close-duration: 120ms;

--context-sidebar-content-fade-duration: 80ms;
```

CSS custom property에 breakpoint 값 자체를 media query에서 직접 쓸 수 없는 환경이면 build token으로 공유.

---

# 10.121 Resizing Class

resize session:

```text
data-resizing="true"
```

App Shell 또는 Sidebar root에 설정.

CSS:

```text
transition: none
cursor: col-resize
user-select: none
```

---

# 10.122 Body Cursor During Resize

drag session 동안:

```text
document.body.style.cursor = "col-resize"
```

가능.

종료 시 반드시 원복.

---

# 10.123 Cleanup Requirements

component unmount / route shell teardown 시:

- pointer capture release
- body cursor restore
- user-select restore
- resize listener remove
- RAF cancel
- debounce flush/cancel

---

# 10.124 Development Logging

P0 debug build에서 상태 transition log를 optional로 둘 수 있다.

예:

```text
sidebar: persistent expanded → collapsed
sidebar: persistent → overlay
```

production console noise 금지.

---

# 10.125 E2E Stable State Attributes

권장:

```text
data-sidebar-mode="tasks|none"
data-sidebar-responsive="persistent|overlay"
data-sidebar-visibility="expanded|collapsed"
data-sidebar-overlay="open|closed"
data-sidebar-resizing="true|false"
```

테스트가 pixel query 대신 semantic state를 확인 가능.

---

# 10.126 Initial Hydration Test

```text
Stored collapsed = true
Open app at /project/p1/list
Viewport 1440
→ First stable client frame has no 248px expanded Sidebar flash
```

---

# 10.127 First Mobile Load Test

```text
Stored desktop expanded = true
Viewport 900
Open /project/p1/list
→ overlay starts closed
→ Main visible
```

---

# 10.128 Breakpoint Preservation Test

```text
Desktop width = 320
desktop expanded
→ viewport 900
→ overlay closed
→ viewport 1440
→ persistent Sidebar returns at 320
```

---

# 10.129 Collapsed Preservation Test

```text
Desktop collapsed
→ viewport 900
→ overlay closed
→ viewport 1440
→ desktop remains collapsed
```

---

# 10.130 Resize Persistence Test

```text
resize 248 → 312
reload
→ 312 restored
```

---

# 10.131 Invalid Storage Test

```text
stored width = 9999
reload
→ 248
```

---

# 10.132 Toggle Animation Test

```text
rapid collapse → expand
→ final expanded
→ no stuck pointer-events
→ no invisible Sidebar
```

---

# 10.133 Resize + Search Test

```text
drag Sidebar
press /
→ resize commits
→ Search opens
→ no stuck col-resize cursor
```

---

# 10.134 Resize + Calendar Test

```text
resize active
click Calendar
→ width commit
→ resize cleanup
→ Sidebar slot none
```

---

# 10.135 Overlay + Search Test

```text
viewport 900
overlay Sidebar open
open Search
→ Sidebar overlay closes
→ Search open
```

---

# 10.136 Overlay Escape Hierarchy Test

```text
overlay open
rename input active
Escape
→ rename cancel
→ overlay remains open

Escape again
→ overlay closes
```

---

# 10.137 Focus Collapse Test

```text
focus Project row
click collapse
→ Sidebar collapses
→ focus lands on Main Header open button
```

---

# 10.138 Focus Expand Test

```text
focus Main Header open button
click
→ Sidebar expands
→ focus active Project row
```

---

# 10.139 Main View Preservation Test

```text
Project p1 Gantt
collapse Sidebar
expand Sidebar
→ Gantt remains mounted
→ route remains same
→ zoom/view state not reset solely by shell toggle
```

---

# 10.140 Performance Requirement

pointer resize는 매 move마다 React app 전체를 고비용 rerender하지 않게 한다.

권장:

- CSS variable update
- local shell state
- rAF batching

Project/Task query re-fetch 금지.

---

# 10.141 Resize Frame Budget

hard SLA는 아니지만 사용자 체감 기준:

```text
60fps 지향
```

drag 중:

- network request 없음
- domain mutation 없음
- localStorage write 없음

---

# 10.142 Collapse Performance

collapse/expand로 Space/Project data refetch하지 않는다.

Tree unmount 시 query cache는 유지.

---

# 10.143 Overlay Performance

overlay open마다 Space/Project 전체를 network refetch하지 않는다.

기존 cache/store 사용.

---

# 10.144 Accessibility — Separator

resize handle:

```text
role="separator"
aria-orientation="vertical"
aria-valuemin="216"
aria-valuemax="360"
aria-valuenow=<width>
```

---

# 10.145 Accessibility — Collapse

toggle button:

```text
aria-expanded
aria-controls
```

가능하면 연결.

---

# 10.146 Accessibility — Overlay

overlay open:

- modal/drawer semantics
- focus trap
- underlying Main inert
- backdrop pointer block

---

# 10.147 Accessibility — Motion

prefers-reduced-motion 존중.

---

# 10.148 Accessibility — Zoom

browser zoom 200%에서도 Sidebar width가 CSS px 기준으로 clamp되고 Main이 사용 가능해야 한다.

정확 responsive 검수는 §12.

---

# 10.149 Explicit Prohibitions

## 금지 1

Rail Tasks 재클릭으로 Sidebar toggle.

## 금지 2

216px 아래로 drag하면 자동 collapse.

## 금지 3

overlay width drag resize.

## 금지 4

overlay open state localStorage 저장.

## 금지 5

initial hydration에서 collapse animation 실행.

## 금지 6

Sidebar toggle로 Main View remount.

## 금지 7

resize 중 localStorage write spam.

## 금지 8

CSS 1024 / JS 1000처럼 breakpoint 불일치.

## 금지 9

Search modal과 overlay Sidebar를 동시에 stack해서 유지.

## 금지 10

Calendar/Focus/Settings 진입 시 Sidebar width preference 삭제.

---

# 10.150 QA Checklist

- [ ] Sidebar state가 mode / desktopVisibility / responsiveMode / overlayOpen / isResizing으로 분리된다.
- [ ] default width 248px이 유지된다.
- [ ] min/max 216/360이 유지된다.
- [ ] persistent breakpoint는 1024px이다.
- [ ] desktop expanded/collapsed는 local preference로 유지된다.
- [ ] overlay open은 runtime-only다.
- [ ] overlay 첫 진입은 항상 closed다.
- [ ] viewport가 persistent→overlay로 바뀌어도 desktop preference는 보존된다.
- [ ] overlay→persistent 복귀 시 desktop preference가 복원된다.
- [ ] Tasks 이외 module에서는 Sidebar mode가 none이다.
- [ ] Rail은 항상 56px이다.
- [ ] active Tasks re-click이 Sidebar toggle을 발생시키지 않는다.
- [ ] dedicated collapse/expand button이 존재한다.
- [ ] shortcut Cmd/Ctrl+\가 Tasks Sidebar toggle을 수행한다.
- [ ] Search/destructive dialog open 중 shortcut 충돌이 없다.
- [ ] persistent expanded에서만 resize가 가능하다.
- [ ] overlay에서는 resize되지 않는다.
- [ ] resize 중 transition이 없다.
- [ ] resize cancel Escape가 start width로 복귀한다.
- [ ] resize pointerup에서만 width를 persist한다.
- [ ] keyboard resize는 debounce persistence를 사용한다.
- [ ] resize 중 module switch가 cleanup을 누락하지 않는다.
- [ ] resize 중 Search open이 stuck cursor를 만들지 않는다.
- [ ] collapse animation 160ms를 사용한다.
- [ ] reduced motion에서는 transition이 제거된다.
- [ ] collapse 시 Sidebar 내부 focus가 hidden DOM에 남지 않는다.
- [ ] expand button click 후 active Sidebar row로 focus가 이동한다.
- [ ] overlay Escape는 nested edit/menu를 먼저 닫는다.
- [ ] initial hydration에서 잘못된 expanded flash를 최소화한다.
- [ ] initial hydration 중 animation을 실행하지 않는다.
- [ ] invalid stored width는 248로 복구된다.
- [ ] storage 실패가 app 사용을 막지 않는다.
- [ ] Sidebar toggle이 Board/Gantt를 unmount하지 않는다.
- [ ] contained View는 ResizeObserver로 shell width 변화에 대응 가능하다.
- [ ] breakpoint source가 CSS/JS에서 일치한다.
- [ ] rapid toggle에도 final semantic state가 일관된다.
- [ ] overlay Search open 시 Drawer가 닫힌다.
- [ ] overlay Account open 시 Drawer가 닫힌다.
- [ ] mode 전환 시 create/rename/menu가 정리된다.
- [ ] Sidebar data를 collapse/expand마다 재fetch하지 않는다.

---

# 10.151 Acceptance Criteria

## AC-SHELL-01

Context Sidebar는 persistent와 overlay runtime mode를 1024px 기준으로 정확히 전환한다.

## AC-SHELL-02

desktop expanded/collapsed preference와 overlay open state는 서로 독립적이며 responsive 전환에서 덮어쓰지 않는다.

## AC-SHELL-03

persistent expanded 상태에서만 216~360px resize가 가능하고 stored width는 pointerup/final keyboard input 후 persist된다.

## AC-SHELL-04

collapse는 명시적 toggle action으로만 발생하며 minimum-width drag가 auto-collapse를 만들지 않는다.

## AC-SHELL-05

Sidebar toggle/resize가 current route, Scope, View, Main component identity를 의도치 않게 바꾸지 않는다.

## AC-SHELL-06

initial hydration에서 preference 복원 때문에 불필요한 collapse/expand animation 또는 큰 layout flash가 발생하지 않는다.

## AC-SHELL-07

overlay mode는 initial closed이며 navigation/Search/Account 등의 규칙에 따라 deterministic하게 닫힌다.

## AC-SHELL-08

resize/toggle/viewport/module change race에서도 pointer capture, cursor, transition, focus가 stuck state로 남지 않는다.

## AC-SHELL-09

keyboard/assistive technology로 Sidebar toggle과 resize가 가능하다.

## AC-SHELL-10

Sidebar layout preference는 local UI state이며 URL 및 domain data와 분리된다.

---

# 10.152 최종 결정 요약

```text
STATE
mode
desktopVisibility
responsiveMode
overlayOpen
isResizing
width
```

```text
WIDTH
248 default
216 min
360 max
```

```text
BREAKPOINT
>=1024 persistent
<1024 overlay
```

```text
DESKTOP
expanded/collapsed persisted
```

```text
OVERLAY
runtime-only
initial closed
no resize
```

```text
SHORTCUT
Cmd/Ctrl + \
```

```text
RESIZE
persistent expanded only
pointer + keyboard
```

```text
COLLAPSE
160ms
explicit control only
```

```text
HYDRATION
restore before enabling transition
```

```text
MAIN VIEW
must not remount solely from Sidebar toggle
```

---

# 10.153 §10에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- Sidebar state machine
- persistent/overlay breakpoint
- desktop visibility persistence
- overlay runtime state
- shortcut semantics
- persistent/overlay toggle 분리
- resize eligibility
- overlay resize 미지원
- resize commit/cancel
- resize race cleanup
- breakpoint transition
- module transition
- Search/Account와 overlay stacking
- collapse/expand animation
- reduced motion
- focus 이동
- initial hydration strategy
- invalid storage fallback
- Main View remount 금지
- ResizeObserver 기반 contained View 대응
- CSS/JS breakpoint single source
- E2E semantic state attributes

---

# 11. Visual System

- 상태: **확정**
- 우선순위: **P0**
- 적용 대상: `Global Rail / Context Sidebar / Tasks Tree / Main Header / View Switcher / Search Overlay`
- 목적: 지금까지 확정한 구조가 실제 화면에서 **조용하고 밀도 높은 TickTick-style 생산성 UI**로 보이도록 색상·타이포그래피·아이콘·radius·divider·shadow·motion을 하나의 token system으로 통합한다.
- 선행: §2~§10
- 후속: §12 Responsive / Accessibility / Edge Cases
- 우선순위 규칙: §2~§10의 geometry는 유지하고, 본 §11은 **시각 표현 방식**을 확정한다.

---

# 11.1 Visual Direction

FocusFlow P0의 시각 방향은 아래 5개 원칙으로 고정한다.

```text
1. Neutral-first
2. Low-contrast chrome
3. One primary accent
4. Selection is quiet, not loud
5. Content gets more visual weight than navigation
```

즉 Sidebar와 Rail 자체가 시선을 끌기보다 Main Content가 우선되어야 한다.

---

# 11.2 TickTick-style의 해석

이번 redesign에서 TickTick-like라는 말은 다음을 의미한다.

```text
- 좁은 Global Rail
- muted navigation surfaces
- 작은 radius
- 일정한 36px navigation rhythm
- 얇은 divider
- subtle hover
- active state의 과도한 filled color 금지
- icon + text의 낮은 대비
- content-first hierarchy
```

다음은 그대로 복제하지 않는다.

```text
- TickTick brand red
- TickTick proprietary icon set
- TickTick exact color values
- TickTick 기능 taxonomy
```

FocusFlow의 시각 체계는 별도 token으로 유지한다.

---

# 11.3 Primary Accent

P0 FocusFlow accent를 아래로 확정한다.

```text
Light accent: #5B6EF5
Dark accent:  #8B95FF
```

용도:

```text
- active Rail icon
- active View indicator
- focus-visible ring 계열
- selected interactive emphasis
- primary button 계열
```

Accent를 모든 navigation text에 상시 사용하지 않는다.

---

# 11.4 Light Theme Foundation

```css
:root,
[data-theme="light"] {
  --ff-color-bg-app: #FFFFFF;
  --ff-color-bg-rail: #F7F7F8;
  --ff-color-bg-sidebar: #FAFAFB;
  --ff-color-bg-main: #FFFFFF;
  --ff-color-bg-elevated: #FFFFFF;

  --ff-color-bg-hover: #F1F2F4;
  --ff-color-bg-pressed: #E9EBEF;
  --ff-color-bg-selected: #ECEEF3;
  --ff-color-bg-selected-hover: #E5E8EE;

  --ff-color-text-primary: #202329;
  --ff-color-text-secondary: #555B66;
  --ff-color-text-muted: #7A808B;
  --ff-color-text-disabled: #A9ADB5;
  --ff-color-text-inverse: #FFFFFF;

  --ff-color-icon-primary: #4E545E;
  --ff-color-icon-muted: #7C828D;
  --ff-color-icon-disabled: #B0B4BC;

  --ff-color-border-subtle: #E7E8EB;
  --ff-color-border-strong: #D7D9DE;

  --ff-color-accent: #5B6EF5;
  --ff-color-accent-hover: #4F61E8;
  --ff-color-accent-pressed: #4657D5;
  --ff-color-accent-soft: #EEF0FF;
  --ff-color-accent-soft-hover: #E7E9FF;

  --ff-color-danger: #D94B4B;
  --ff-color-danger-hover: #C83D3D;
  --ff-color-danger-soft: #FFF0F0;

  --ff-color-success: #3B8F63;
  --ff-color-warning: #B27818;

  --ff-color-focus-ring: #6C7CF6;

  --ff-color-backdrop: rgba(20, 23, 30, 0.40);
}
```

---

# 11.5 Dark Theme Foundation

```css
[data-theme="dark"] {
  --ff-color-bg-app: #181A1F;
  --ff-color-bg-rail: #14161A;
  --ff-color-bg-sidebar: #17191E;
  --ff-color-bg-main: #1B1D22;
  --ff-color-bg-elevated: #22252B;

  --ff-color-bg-hover: #22252B;
  --ff-color-bg-pressed: #292D34;
  --ff-color-bg-selected: #2A2E36;
  --ff-color-bg-selected-hover: #313641;

  --ff-color-text-primary: #F2F3F5;
  --ff-color-text-secondary: #C4C8CF;
  --ff-color-text-muted: #969CA6;
  --ff-color-text-disabled: #686E78;
  --ff-color-text-inverse: #15171B;

  --ff-color-icon-primary: #C5C9D0;
  --ff-color-icon-muted: #9399A3;
  --ff-color-icon-disabled: #5E646D;

  --ff-color-border-subtle: #2B2E34;
  --ff-color-border-strong: #3A3E46;

  --ff-color-accent: #8B95FF;
  --ff-color-accent-hover: #9AA3FF;
  --ff-color-accent-pressed: #7C87F4;
  --ff-color-accent-soft: #282C46;
  --ff-color-accent-soft-hover: #303553;

  --ff-color-danger: #FF7A7A;
  --ff-color-danger-hover: #FF8E8E;
  --ff-color-danger-soft: #402326;

  --ff-color-success: #64C28A;
  --ff-color-warning: #E3B35D;

  --ff-color-focus-ring: #A0A8FF;

  --ff-color-backdrop: rgba(0, 0, 0, 0.56);
}
```

---

# 11.6 Theme Surface Hierarchy

Light:

```text
Rail       #F7F7F8
Sidebar    #FAFAFB
Main       #FFFFFF
Elevated   #FFFFFF
```

Dark:

```text
Rail       #14161A
Sidebar    #17191E
Main       #1B1D22
Elevated   #22252B
```

## 원칙

Rail → Sidebar → Main이 완전히 동일한 색이면 구조 분리가 약해진다.

반대로 각 영역 대비가 너무 크면 앱이 조각나 보인다.

따라서 각 surface 차이는 작게 유지한다.

---

# 11.7 Divider

기본 divider:

```text
1px
```

Light:

```text
#E7E8EB
```

Dark:

```text
#2B2E34
```

사용 위치:

```text
Rail | Sidebar
Sidebar | Main
Main View Switcher | Body
Search Input | Results
```

---

# 11.8 Divider 금지 규칙

다음에는 기본 divider를 넣지 않는다.

```text
Smart View row 사이
Space row 사이
Project row 사이
Space group 사이
Archive 위
Header와 View Switcher 사이
```

whitespace와 background state로 hierarchy를 만든다.

---

# 11.9 Text Hierarchy

P0 text level:

```text
Primary
Secondary
Muted
Disabled
```

mapping:

```text
Main H1                 Primary
Sidebar row label       Primary/Secondary 사이
Section label           Muted
Metadata                Muted
Tooltip                 Primary inverse/elevated
Disabled action         Disabled
```

---

# 11.10 Font Family

P0는 별도 웹폰트를 추가하지 않는다.

권장 system stack:

```css
font-family:
  Inter,
  Pretendard,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  "Noto Sans KR",
  sans-serif;
```

## 구현 규칙

기존 FocusFlow가 Pretendard/System UI를 이미 사용한다면 그대로 유지.

Sidebar redesign 때문에 새로운 font asset을 다운로드하지 않는다.

---

# 11.11 Typography Scale

```css
--ff-font-size-11: 11px;
--ff-font-size-12: 12px;
--ff-font-size-13: 13px;
--ff-font-size-14: 14px;
--ff-font-size-15: 15px;
--ff-font-size-18: 18px;
```

---

# 11.12 Font Weight Scale

```css
--ff-font-weight-regular: 400;
--ff-font-weight-medium: 500;
--ff-font-weight-semibold: 600;
```

P0 navigation에서 `700`은 사용하지 않는다.

---

# 11.13 Line Height Scale

```css
--ff-line-height-16: 16px;
--ff-line-height-18: 18px;
--ff-line-height-20: 20px;
--ff-line-height-22: 22px;
--ff-line-height-24: 24px;
```

---

# 11.14 Component Typography Mapping

```text
Main H1
18 / 24 / 600

Header metadata
12 / 18 / 400

Sidebar header
14 / 20 / 600

Sidebar row
14 / 20 / 500

Sidebar section label
12 / 16 / 600

View tab
13 / 20 / 500
Active View tab
13 / 20 / 600

Search input
15 / 22 / 400

Search result title
14 / 20 / 500

Search result metadata
12 / 18 / 400

Tooltip
12 / 18 / 500

Keyboard hint
11 / 16 / 400
```

---

# 11.15 Letter Spacing

일반 UI text:

```text
letter-spacing: normal
```

Section label에 uppercase tracking 같은 별도 스타일을 사용하지 않는다.

한국어 UI에서 과도한 letter spacing 금지.

---

# 11.16 Icon System

P0 icon은 하나의 outline icon family를 사용한다.

기존 library가 있으면 그대로 유지.

새로 선택해야 한다면 다음 특성을 만족해야 한다.

```text
- rounded line caps
- simple geometry
- consistent optical size
- 1.75~2px stroke
- 16 / 18 / 20px 사용 가능
```

---

# 11.17 Icon Stroke

권장:

```text
stroke-width: 1.8
```

library가 integer만 지원하면:

```text
2
```

사용.

---

# 11.18 Icon Size Mapping

```text
Rail icon              20px
Sidebar nav icon       18px
Tree entity icon       16px
Trailing action icon   16px
Header action icon     18px
Search input icon      20px
Search result icon     18px
Chevron                14px
```

---

# 11.19 Icon Color Mapping

default interactive icon:

```text
--ff-color-icon-primary
```

secondary:

```text
--ff-color-icon-muted
```

active Rail:

```text
--ff-color-accent
```

selected Sidebar icon:

P0 final:

```text
--ff-color-text-primary
```

즉 selected Sidebar row 전체를 accent color로 칠하지 않는다.

---

# 11.20 Why Sidebar Selected is Neutral

TickTick-like compact navigation에서는 current scope를 매우 강한 brand color로 칠하면 Sidebar가 Main보다 더 눈에 띈다.

P0 selected row:

```text
neutral selected bg
+
primary text
+
primary icon
```

로 확정.

Accent는 Rail과 View indicator처럼 더 상위 navigation signal에 집중한다.

---

# 11.21 Rail Default State

default:

```text
background: transparent
icon: icon-muted
```

---

# 11.22 Rail Hover State

Light:

```text
background: #ECEEF2
icon: #3F4650
```

Dark:

```text
background: #22252B
icon: #E0E3E8
```

semantic token으로 구현:

```text
rail-hover-bg
rail-icon-hover
```

---

# 11.23 Rail Active State

P0:

```text
background: accent-soft
icon: accent
```

Light:

```text
bg   #EEF0FF
icon #5B6EF5
```

Dark:

```text
bg   #282C46
icon #8B95FF
```

---

# 11.24 Rail Open Utility State

Search / Account open:

active module과 구분하지만 visual은 유사 강도.

P0:

```text
background: selected-neutral 또는 accent-soft
```

최종:

```text
Search open → accent-soft
Account open → neutral selected
```

이유:

Search는 전역 작업 모드에 가까운 강한 temporary action.
Account는 utility.

---

# 11.25 Rail Pressed State

```text
background: pressed token
```

icon scale/translate 없음.

---

# 11.26 Sidebar Default Row

```text
background: transparent
text: text-secondary
icon: icon-muted
```

---

# 11.27 Sidebar Hover Row

```text
background: bg-hover
text: text-primary
icon: icon-primary
```

---

# 11.28 Sidebar Selected Row

```text
background: bg-selected
text: text-primary
icon: icon-primary
```

font weight:

```text
500
```

P0에서 selected row label을 600으로 올리지 않는다.

---

# 11.29 Sidebar Selected Hover

```text
background: bg-selected-hover
```

---

# 11.30 Sidebar Create Row

default:

```text
text: text-muted
icon: icon-muted
```

hover:

```text
background: bg-hover
text: text-secondary/primary
```

---

# 11.31 Sidebar Section Label

```text
text: text-muted
```

P0에서 accent 사용 금지.

---

# 11.32 Project/Space Trailing Actions

default hidden.

visible:

```text
icon: icon-muted
```

hover button:

```text
background: bg-hover
icon: icon-primary
```

selected row 안에서도 accent icon으로 바꾸지 않는다.

---

# 11.33 View Switcher Default

```text
text: text-muted
```

hover:

```text
text: text-primary
```

active:

```text
text: text-primary
indicator: accent
```

---

# 11.34 View Indicator

```text
height: 2px
radius: 999px
background: accent
```

width:

```text
tab content width minus 4px
```

또는:

```text
calc(100% - 12px)
```

P0 권장:

```text
calc(100% - 12px)
```

---

# 11.35 Main Header

Light:

```text
background: #FFFFFF
```

Dark:

```text
background: #1B1D22
```

Header 자체에 shadow 없음.

---

# 11.36 Search Panel

Search는 elevated surface.

Light:

```text
bg: #FFFFFF
border: #E3E5E9
```

Dark:

```text
bg: #22252B
border: #353941
```

---

# 11.37 Shadow Scale

P0 shadow token:

```css
--ff-shadow-popover:
  0 8px 24px rgba(20, 23, 30, 0.12),
  0 2px 8px rgba(20, 23, 30, 0.06);

--ff-shadow-dialog:
  0 18px 48px rgba(20, 23, 30, 0.20),
  0 4px 14px rgba(20, 23, 30, 0.08);
```

Dark:

```css
[data-theme="dark"] {
  --ff-shadow-popover:
    0 10px 28px rgba(0, 0, 0, 0.34),
    0 2px 8px rgba(0, 0, 0, 0.22);

  --ff-shadow-dialog:
    0 20px 52px rgba(0, 0, 0, 0.50),
    0 4px 14px rgba(0, 0, 0, 0.28);
}
```

---

# 11.38 Shadow Usage

```text
Rail                 none
Sidebar              none
Main Header           none
View Switcher         none
Context Menu          popover
Tooltip               popover/light
Account Popover       popover
Search Panel          dialog
Delete Dialog         dialog
```

---

# 11.39 Radius Scale

```css
--ff-radius-6: 6px;
--ff-radius-7: 7px;
--ff-radius-8: 8px;
--ff-radius-10: 10px;
--ff-radius-12: 12px;
--ff-radius-round: 999px;
```

---

# 11.40 Radius Mapping

```text
Sidebar row          8px
Create row           8px
Header action        8px
Trailing action      7px
Rail item           10px
Search panel        12px
Popover/Menu        10px
Tooltip              6px
Input                8px
View indicator       round
Avatar               round
```

---

# 11.41 Radius Principle

너무 많은 16~24px card radius를 사용하지 않는다.

생산성 앱의 compact density를 유지하기 위해 주요 radius는 8~12px 범위.

---

# 11.42 Focus Ring

P0:

```text
2px solid focus-ring
outline-offset: 2px
```

Light:

```text
#6C7CF6
```

Dark:

```text
#A0A8FF
```

---

# 11.43 Focus Ring Scope

반드시 적용:

```text
Rail button
Sidebar row/link
Trailing action
Header action
View link
Search input
Search close
Search result active control
Resize separator
Dialog buttons
```

---

# 11.44 Focus Ring and Selected

selected background를 focus ring이 대체하지 않는다.

```text
selected + focus-visible
```

동시 표현.

---

# 11.45 Danger Visuals

삭제 action:

```text
text/icon = danger
```

context menu hover:

Light:

```text
danger-soft
```

Dark:

```text
danger-soft
```

전체 menu를 red theme로 만들지 않는다.

---

# 11.46 Archive Visuals

Archive는 destructive가 아니므로 red 금지.

default neutral action.

---

# 11.47 Success / Warning

P0 Sidebar 기본 navigation에는 success/warning color를 거의 사용하지 않는다.

Main Content status에서 필요할 때만 사용.

---

# 11.48 Input Visual

default:

```text
background: bg-elevated or transparent
border: border-strong
text: text-primary
```

focus:

```text
border: accent
ring: focus-ring soft
```

error:

```text
border: danger
```

---

# 11.49 Inline Rename/Create Input

Sidebar row 내부 input은 지나치게 두꺼운 border를 사용하지 않는다.

P0:

```text
1px border
8px radius
```

focus:

```text
1px accent border
+
optional 2px soft ring
```

---

# 11.50 Search Input

Search panel 안에서는 outer border를 input에 다시 두지 않는다.

input field background:

```text
transparent
```

focus ring은 dialog focus 전체가 아니라 text input cursor/focus semantics만으로 충분.

단 keyboard focus가 명확하지 않으면 subtle inset accent line 허용.

---

# 11.51 Tooltip Surface

Light:

```text
background: #25282E
text: #FFFFFF
```

Dark:

```text
background: #F1F2F4
text: #202329
```

P0 tooltip은 theme에서 inverse surface를 사용.

---

# 11.52 Tooltip Radius

```text
6px
```

padding:

```text
6px 8px
```

---

# 11.53 Tooltip Shadow

작은 popover shadow 또는 none.

P0:

```text
subtle shadow
```

---

# 11.54 Tooltip Animation

```text
opacity
+
translateX(-2px → 0)
```

duration:

```text
80ms
```

scale 없음.

---

# 11.55 Context Menu Surface

```text
min width: 180px
radius: 10px
padding: 6px
```

menu item:

```text
height: 32px
radius: 6px
padding-x: 8px
font: 13/20/500
```

---

# 11.56 Menu Separator

```text
1px
margin: 4px 0
```

subtle border token.

---

# 11.57 Menu Selected/Checked

Move Project submenu의 current Space 등:

```text
check icon
+
primary text
```

accent filled row로 만들지 않는다.

---

# 11.58 Backdrop

Search / modal:

Light:

```text
rgba(20, 23, 30, 0.40)
```

Dark:

```text
rgba(0, 0, 0, 0.56)
```

Context Sidebar overlay drawer backdrop는 Search보다 약하게 할 수 있다.

P0:

```text
drawer backdrop = global backdrop opacity × 0.75
```

---

# 11.59 Motion Scale

```css
--ff-motion-fast: 80ms;
--ff-motion-short: 120ms;
--ff-motion-medium: 160ms;
--ff-motion-dialog: 140ms;
```

---

# 11.60 Easing

P0 standard easing:

```css
--ff-ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ff-ease-enter: cubic-bezier(0, 0, 0, 1);
--ff-ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

---

# 11.61 Motion Mapping

```text
Tooltip                    80ms
Hover background           80ms
Chevron rotation          120ms
Menu open                 120ms
Sidebar collapse          160ms
Sidebar overlay           160ms
Search open               140ms
Search close              110~120ms
```

---

# 11.62 Hover Transition

background/color:

```text
80ms standard
```

font weight는 animate하지 않는다.

---

# 11.63 Geometry Transition

width/height를 hover state에서 animate하지 않는다.

Sidebar collapse만 예외.

---

# 11.64 Transform Policy

허용:

```text
small translate 2~8px
chevron rotate
```

금지:

```text
button scale 0.95
card bounce
spring overshoot
large zoom
```

---

# 11.65 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto;
  }
}
```

실제 production에서 모든 animation을 blanket 제거하기보다 FocusFlow motion tokens를 0ms로 override하는 방식을 권장.

---

# 11.66 Selection Strength Hierarchy

강도 순서:

```text
1. Main View active indicator
2. Rail active
3. Sidebar selected
4. Hover
5. Default
```

단 Main View indicator는 작지만 accent color라 인지 우선순위가 높다.

---

# 11.67 Avoid Accent Saturation

한 화면에서 accent filled background가 여러 군데 동시에 존재하지 않게 한다.

예:

```text
Rail Tasks active = accent-soft
Project Sidebar selected = neutral
Board tab active = accent indicator
```

이 조합을 기본으로 한다.

---

# 11.68 Dark Mode Contrast Principle

Dark theme에서 selected/hover background를 너무 밝게 만들지 않는다.

Main surface와 row selected 차이는 작지만 명확해야 한다.

---

# 11.69 Dark Mode Pure Black 금지

Main/Rail/Sidebar에:

```text
#000000
```

을 직접 쓰지 않는다.

예외:

backdrop alpha.

---

# 11.70 Light Mode Pure Gray Border 최소화

많은 `#D0D0D0` 선을 사용하지 않는다.

divider는 subtle border token 하나를 기본으로 사용.

---

# 11.71 Main Content Priority

Sidebar와 Rail의 text/icon contrast는 Main H1보다 낮아야 한다.

Main H1:

```text
text-primary
600
```

Sidebar:

```text
text-secondary
500
```

---

# 11.72 Sidebar Width and Visual Density

248px 기본 폭에서 다음이 자연스럽게 보여야 한다.

```text
My Space
  fNIRS 졸업 논문
```

이름이 20자 내외면 trailing actions 숨김 상태에서 충분히 표시.

trailing actions visible 시 ellipsis 허용.

---

# 11.73 Sidebar Selected Background Width

row 전체 container 폭.

left/right:

```text
8px Sidebar body inset
```

을 유지.

full Sidebar edge-to-edge selected bar 금지.

---

# 11.74 Rail Selected Background

40×40 button geometry 전체.

circle active background가 아니라:

```text
10px radius rounded square
```

---

# 11.75 Rail Avatar

Avatar:

```text
28×28
```

background fallback:

Light:

```text
#E6E8ED
```

Dark:

```text
#30343C
```

initial text:

```text
12px / 600
```

---

# 11.76 App Mark

visible mark 최대:

```text
28×28
```

brand accent 사용 가능.

Rail item active background와 혼동되지 않게 brand mark 주변에 hover container를 만들지 않는다.

---

# 11.77 Scrollbar

Sidebar/Search result 등 내부 scroll 영역에서 native scrollbar를 우선.

custom scrollbar를 사용할 경우:

```text
width 8px max
thumb low contrast
track transparent
```

hover 시 thumb 대비 강화.

---

# 11.78 Scrollbar Dark

Dark theme에서 bright scrollbar 금지.

system/native scrollbar color scheme을 활용 가능.

---

# 11.79 Selection Text

사용자 text selection color:

Light:

```text
accent-soft-hover
```

Dark:

```text
accent-soft-hover
```

가능.

---

# 11.80 Search Active Result

P0:

```text
background = bg-selected
text = primary
```

accent filled background 아님.

keyboard active와 mouse hover visual을 거의 동일하게 유지.

---

# 11.81 Search Group Label

muted.

group header에 uppercase/letter spacing 없음.

---

# 11.82 Search Panel Divider

input 아래 1px.

footer 위도 1px 사용 가능.

P0 final:

```text
Input → Results: divider yes
Results → Footer: divider yes
```

---

# 11.83 Main View Divider

View Switcher 아래 1px.

Today/Upcoming/Archive는 Header 아래 1px.

항상 body 시작 직전 divider 하나.

---

# 11.84 Main Header More Hover

32×32:

```text
hover bg
icon primary
```

active/open:

```text
selected neutral bg
```

---

# 11.85 Sidebar Collapse Button

32×32:

default icon-muted.

hover bg-hover.

---

# 11.86 Resize Handle

visual line:

```text
1px border-subtle
```

hover:

```text
accent with 35~45% perceived strength
```

dragging:

```text
accent
```

P0에서 6px hit area 전체를 채우지 않는다.

---

# 11.87 DnD Drop Indicator

insertion line:

```text
2px accent
radius round
```

inside-Space target:

```text
accent-soft background
```

---

# 11.88 DnD Drag Preview

```text
bg elevated
border subtle
shadow popover
radius 8px
opacity 0.96
```

---

# 11.89 Skeleton

Light:

```text
base: #ECEEF1
highlight: #F5F6F8
```

Dark:

```text
base: #282B31
highlight: #32363E
```

animation:

```text
subtle shimmer 1200~1600ms
```

reduced-motion:

```text
static
```

---

# 11.90 Empty State

Sidebar empty state는 muted text만.

Main empty state는 View별 spec.

Sidebar empty에 illustration/card/shadow 금지.

---

# 11.91 Error State

Inline error text:

```text
danger
```

background card를 크게 만들지 않는다.

retry action은 neutral or accent text button.

---

# 11.92 Disabled State

```text
opacity: 0.45~0.5
cursor: default/not-allowed
```

P0 final:

```text
opacity: 0.48
```

disabled 요소에 tooltip이 꼭 필요한 경우 이유 설명 가능.

---

# 11.93 Button Hierarchy

P0 shell 기준:

```text
Icon button
Text action
Danger action
Primary CTA
```

Sidebar 자체에는 large primary filled CTA를 사용하지 않는다.

---

# 11.94 Primary CTA

Create dialog 등 향후 필요 시:

```text
background accent
text inverse
radius 8px
height 36~40px
```

Sidebar navigation과 혼합하지 않는다.

---

# 11.95 Semantic Token Layer

foundation token을 component가 직접 쓰기보다 semantic alias를 권장한다.

예:

```css
--rail-bg: var(--ff-color-bg-rail);
--rail-divider: var(--ff-color-border-subtle);

--sidebar-bg: var(--ff-color-bg-sidebar);
--sidebar-hover-bg: var(--ff-color-bg-hover);
--sidebar-selected-bg: var(--ff-color-bg-selected);

--main-header-bg: var(--ff-color-bg-main);

--search-panel-bg: var(--ff-color-bg-elevated);
```

---

# 11.96 Rail Semantic Tokens

```css
--rail-bg: var(--ff-color-bg-rail);
--rail-divider: var(--ff-color-border-subtle);

--rail-icon: var(--ff-color-icon-muted);
--rail-icon-hover: var(--ff-color-icon-primary);
--rail-icon-active: var(--ff-color-accent);

--rail-item-hover-bg: var(--ff-color-bg-hover);
--rail-item-active-bg: var(--ff-color-accent-soft);
--rail-item-active-hover-bg: var(--ff-color-accent-soft-hover);

--rail-item-open-bg: var(--ff-color-accent-soft);

--rail-focus-ring: var(--ff-color-focus-ring);
```

---

# 11.97 Sidebar Semantic Tokens

```css
--context-sidebar-bg: var(--ff-color-bg-sidebar);
--context-sidebar-divider: var(--ff-color-border-subtle);

--sidebar-nav-text: var(--ff-color-text-secondary);
--sidebar-nav-icon: var(--ff-color-icon-muted);

--sidebar-nav-hover-bg: var(--ff-color-bg-hover);
--sidebar-nav-hover-text: var(--ff-color-text-primary);

--sidebar-nav-selected-bg: var(--ff-color-bg-selected);
--sidebar-nav-selected-text: var(--ff-color-text-primary);
--sidebar-nav-selected-icon: var(--ff-color-icon-primary);
--sidebar-nav-selected-hover-bg: var(--ff-color-bg-selected-hover);

--sidebar-section-label: var(--ff-color-text-muted);
--sidebar-create-text: var(--ff-color-text-muted);

--sidebar-focus-ring: var(--ff-color-focus-ring);
```

---

# 11.98 Main Semantic Tokens

```css
--main-bg: var(--ff-color-bg-main);
--main-header-bg: var(--ff-color-bg-main);

--main-header-text: var(--ff-color-text-primary);
--main-header-muted: var(--ff-color-text-muted);
--main-header-divider: var(--ff-color-border-subtle);

--main-view-tab-text: var(--ff-color-text-muted);
--main-view-tab-hover-text: var(--ff-color-text-primary);
--main-view-tab-active-text: var(--ff-color-text-primary);
--main-view-tab-indicator: var(--ff-color-accent);
```

---

# 11.99 Search Semantic Tokens

```css
--search-backdrop: var(--ff-color-backdrop);
--search-panel-bg: var(--ff-color-bg-elevated);
--search-panel-border: var(--ff-color-border-subtle);
--search-panel-shadow: var(--ff-shadow-dialog);

--search-input-text: var(--ff-color-text-primary);
--search-input-placeholder: var(--ff-color-text-muted);
--search-input-icon: var(--ff-color-icon-muted);
--search-input-divider: var(--ff-color-border-subtle);

--search-result-text: var(--ff-color-text-primary);
--search-result-meta: var(--ff-color-text-muted);
--search-result-hover-bg: var(--ff-color-bg-hover);
--search-result-active-bg: var(--ff-color-bg-selected);

--search-group-label: var(--ff-color-text-muted);
--search-footer-text: var(--ff-color-text-muted);
--search-error-text: var(--ff-color-danger);
```

---

# 11.100 Menu Semantic Tokens

```css
--menu-bg: var(--ff-color-bg-elevated);
--menu-border: var(--ff-color-border-subtle);
--menu-shadow: var(--ff-shadow-popover);

--menu-text: var(--ff-color-text-primary);
--menu-muted: var(--ff-color-text-muted);
--menu-hover-bg: var(--ff-color-bg-hover);

--menu-danger: var(--ff-color-danger);
--menu-danger-hover-bg: var(--ff-color-danger-soft);
```

---

# 11.101 Tooltip Semantic Tokens

```css
[data-theme="light"] {
  --tooltip-bg: #25282E;
  --tooltip-text: #FFFFFF;
}

[data-theme="dark"] {
  --tooltip-bg: #F1F2F4;
  --tooltip-text: #202329;
}
```

---

# 11.102 Theme Switching

권장 root:

```html
<html data-theme="light">
```

또는:

```html
<html data-theme="dark">
```

System mode 지원 시 app appearance layer에서 OS preference를 resolve.

Component가:

```ts
if (dark) color = ...
```

를 개별적으로 가지지 않는다.

---

# 11.103 Theme Transition

light ↔ dark 전환 시 전체 app background color transition을 길게 걸지 않는다.

P0:

```text
no theme transition
```

즉시 변경.

이유:

- 수십 개 surface가 동시에 fade하는 번쩍임 방지
- 빠른 UI preference 적용

---

# 11.104 CSS Color Scheme

가능하면:

```css
html[data-theme="dark"] {
  color-scheme: dark;
}

html[data-theme="light"] {
  color-scheme: light;
}
```

native form/scrollbar와 조화.

---

# 11.105 Contrast Targets

P0 목표:

```text
Primary body text          >= 4.5:1
Secondary navigation text  >= 4.5:1 가능 범위
Large title                >= 3:1
Interactive boundaries     >= 3:1 where required
Focus indicator            clearly distinguishable
```

muted metadata는 정보 중요도에 따라 조정하되 읽기 불가능한 low contrast를 만들지 않는다.

---

# 11.106 Color-only State 금지

active/selected 상태를 색상 하나로만 표현하지 않는다.

예:

View active:

```text
text contrast
+
2px indicator
```

Rail active:

```text
background
+
icon color
```

---

# 11.107 Danger Color-only Confirmation 금지

Delete confirmation은 red color뿐 아니라:

```text
"삭제"
destructive label
dialog structure
```

로 의미 제공.

---

# 11.108 High Contrast Compatibility

forced-colors 환경에서:

- outline 제거 금지
- transparent border-only control이 사라지지 않게
- native `currentColor` 활용

정확한 high-contrast 대응은 §12에서 최종 검수.

---

# 11.109 Spacing Foundation

기존 geometry와 맞추기 위한 spacing scale:

```css
--ff-space-2: 2px;
--ff-space-4: 4px;
--ff-space-6: 6px;
--ff-space-8: 8px;
--ff-space-10: 10px;
--ff-space-12: 12px;
--ff-space-16: 16px;
--ff-space-20: 20px;
--ff-space-24: 24px;
--ff-space-32: 32px;
```

---

# 11.110 Avoid Arbitrary Spacing

새 component에서:

```text
13px
17px
23px
```

등 임의 spacing을 계속 추가하지 않는다.

기존 spec에서 이미 확정된 예외 값은 유지.

---

# 11.111 Density Summary

```text
Rail width              56
Rail item               40
Sidebar default         248
Sidebar row              36
Section header           28
Header                    56
View Switcher             40
Search input              52
Search result             44
```

이 rhythm을 전체 visual system의 핵심 density로 유지한다.

---

# 11.112 Visual Hierarchy Example — Light

```text
Rail        light gray
Sidebar     nearly white
Main        white

Rail active      soft indigo
Project selected neutral gray
Board active     indigo underline
```

---

# 11.113 Visual Hierarchy Example — Dark

```text
Rail        darkest
Sidebar     slightly lighter
Main        one level lighter

Rail active      muted indigo surface
Project selected neutral slate
Board active     bright indigo underline
```

---

# 11.114 Do Not Over-box

다음 UI에 별도 box/card를 만들지 않는다.

```text
Smart Views group
Spaces group
Space row
Project row
Archive
View Switcher
Main Header
```

Search/Popover/Dialog만 elevated container.

---

# 11.115 Do Not Over-round

Navigation surface를 전부 pill로 만들지 않는다.

예:

```text
Today [ pill ]
Upcoming [ pill ]
```

금지.

8px rounded rectangle 사용.

---

# 11.116 Do Not Over-shadow

Rail/Sidebar/Main Header에 box-shadow 금지.

Divider로 충분.

---

# 11.117 Do Not Over-bold

선택된 Sidebar text:

```text
500
```

Main H1:

```text
600
```

Navigation row에 700 금지.

---

# 11.118 Do Not Over-color

Space마다 자동 random color를 부여하지 않는다.

Project마다 자동 accent color를 붙이지 않는다.

기존 user-defined color model이 있을 때만 사용.

---

# 11.119 Visual Regression Baseline

P0 구현 후 아래 화면을 visual regression snapshot으로 남기는 것을 권장한다.

```text
1. Light / Tasks / Sidebar expanded / Project selected
2. Dark / Tasks / Sidebar expanded / Project selected
3. Light / Sidebar collapsed / Project Board
4. Dark / Calendar global
5. Light / Search open
6. Dark / Search open
7. Light / Context menu open
8. Dark / inline rename
```

---

# 11.120 Pixel Alignment

1px divider가 흐릿해지지 않도록 transform으로 half-pixel 위치에 놓지 않는다.

icon button도 odd transform으로 blur 금지.

---

# 11.121 Device Pixel Ratio

SVG icon 사용을 권장.

PNG icon을 navigation base system으로 사용하지 않는다.

---

# 11.122 App Mark Asset

브랜드 mark가 raster만 있다면 고해상도 asset 필요.

하지만 별도 font/icon asset을 만들기보다 SVG mark를 권장.

---

# 11.123 Visual QA — Rail

검수:

```text
- 56px width
- 40px active background
- icon centered
- hover does not widen
- active accent-soft
- tooltip readable
```

---

# 11.124 Visual QA — Sidebar

검수:

```text
- 36px row rhythm
- no cards
- no excessive dividers
- selected neutral
- hover subtle
- long names ellipsis
- trailing actions quiet
```

---

# 11.125 Visual QA — Main

검수:

```text
- 56px Header
- 18px H1
- View tabs compact
- 2px accent indicator
- no unnecessary breadcrumb
```

---

# 11.126 Visual QA — Search

검수:

```text
- 640px desktop
- elevated surface
- readable backdrop
- 52px input
- 44px results
- compact groups
```

---

# 11.127 Dark Theme QA

확인:

```text
- Rail/Sidebar/Main 구분됨
- selected row가 검은 배경에 묻히지 않음
- divider가 과도하게 밝지 않음
- accent가 네온처럼 보이지 않음
- tooltip inverse contrast가 충분함
```

---

# 11.128 Light Theme QA

확인:

```text
- Sidebar와 Main이 완전한 회색 박스로 갈리지 않음
- hover가 너무 짙지 않음
- selected row가 버튼처럼 과도하게 보이지 않음
- divider가 과도하게 많지 않음
```

---

# 11.129 Accessibility QA

확인:

```text
- focus ring visible
- text contrast
- selected state not color-only
- danger action not color-only
- reduced motion
- zoom에서 geometry 유지
```

---

# 11.130 Design Token File 권장 구조

예:

```text
src/styles/
├ tokens.css
├ themes/
│  ├ light.css
│  └ dark.css
└ components/
   ├ rail.css
   ├ sidebar.css
   ├ main-shell.css
   ├ search.css
   └ overlays.css
```

실제 project styling system에 맞춰 변경 가능.

---

# 11.131 CSS-in-JS 사용 시

동일 token naming을 theme object로 유지.

금지:

```text
component마다 hex literal 반복
```

---

# 11.132 Tailwind 사용 시

Tailwind를 사용한다면 semantic class/token을 theme extension에 매핑.

예:

```text
bg-sidebar
bg-sidebar-hover
text-muted
text-primary
border-subtle
text-accent
```

raw `bg-zinc-800`를 feature code 곳곳에 직접 쓰는 방식은 피한다.

---

# 11.133 Existing Design System Integration

FocusFlow에 기존 token/design system이 이미 있으면:

```text
기존 token
→ 본 semantic 역할로 mapping
```

하는 것이 우선.

§11 때문에 전체 앱 theme architecture를 새로 갈아엎을 필요는 없다.

---

# 11.134 Token Migration Rule

기존 Sidebar에 hardcoded color가 많다면:

1. 먼저 semantic token alias 생성
2. 기존 UI에 mapping
3. 새 Rail/Sidebar 적용
4. unused legacy color 제거

한 번에 global color reset 금지.

---

# 11.135 Explicit Prohibitions

## 금지 1

Sidebar selected row를 bright accent filled button으로 처리.

## 금지 2

Rail/Sidebar/Main Header에 shadow.

## 금지 3

모든 row/card를 16px 이상 둥글게 처리.

## 금지 4

hover 시 scale animation.

## 금지 5

Space마다 random color.

## 금지 6

Navigation row에 font-weight 700.

## 금지 7

light/dark 컴포넌트별 별도 hardcoded hex.

## 금지 8

Theme 전환 시 긴 fade animation.

## 금지 9

Divider를 group마다 반복.

## 금지 10

실제 emoji를 navigation icon으로 사용.

---

# 11.136 QA Checklist

- [ ] Light/Dark foundation token이 존재한다.
- [ ] Accent light `#5B6EF5`, dark `#8B95FF`를 기본값으로 사용한다.
- [ ] Rail/Sidebar/Main이 subtle한 surface hierarchy를 가진다.
- [ ] Divider는 1px이다.
- [ ] Rail/Sidebar/Main Header에 shadow가 없다.
- [ ] Search/Menu/Dialog에만 elevation shadow를 사용한다.
- [ ] Primary/Secondary/Muted/Disabled text hierarchy가 있다.
- [ ] System/Pretendard 계열 font를 사용하고 새 font dependency를 추가하지 않는다.
- [ ] UI font weight는 400/500/600 범위다.
- [ ] Sidebar row는 14/20/500이다.
- [ ] Main H1은 18/24/600이다.
- [ ] View tab은 13/20/500, active 600이다.
- [ ] Rail active는 accent-soft + accent icon이다.
- [ ] Sidebar selected는 neutral bg + primary text/icon이다.
- [ ] View active는 2px accent bottom indicator다.
- [ ] Search active result는 neutral selected bg다.
- [ ] 기본 radius scale은 6/7/8/10/12다.
- [ ] Sidebar row radius 8px이다.
- [ ] Rail item radius 10px이다.
- [ ] Search panel radius 12px이다.
- [ ] Focus ring은 2px이며 dark/light 양쪽에서 명확하다.
- [ ] Delete만 danger color를 사용하고 Archive는 neutral이다.
- [ ] Tooltip은 inverse surface다.
- [ ] Context Menu radius 10px, item height 32px다.
- [ ] backdrop은 Light 0.40 / Dark 0.56 수준이다.
- [ ] hover transition은 약 80ms다.
- [ ] Sidebar collapse는 160ms다.
- [ ] scale/bounce animation이 없다.
- [ ] reduced-motion을 지원한다.
- [ ] selected state가 color 하나로만 표현되지 않는다.
- [ ] Sidebar/Space groups를 card로 감싸지 않는다.
- [ ] navigation surface에 excessive pill UI가 없다.
- [ ] hardcoded hex가 feature component에 퍼지지 않는다.
- [ ] CSS/Theme token을 semantic alias로 사용한다.
- [ ] visual regression baseline 화면을 확보할 수 있다.

---

# 11.137 Acceptance Criteria

## AC-VIS-01

Light/Dark 양쪽에서 Rail / Sidebar / Main이 낮은 대비의 연속적인 surface hierarchy로 보인다.

## AC-VIS-02

Rail active는 accent-soft, Sidebar selected는 neutral selected background, Main View active는 2px accent indicator로 서로 다른 navigation level을 구분한다.

## AC-VIS-03

Navigation UI에 불필요한 card, shadow, divider, pill, bold text가 추가되지 않는다.

## AC-VIS-04

Typography는 400/500/600의 제한된 scale을 사용하고 Main Content가 navigation보다 높은 시각 우선순위를 갖는다.

## AC-VIS-05

모든 색상은 semantic theme token을 통해 Light/Dark에 대응하며 feature component에 raw hex가 반복되지 않는다.

## AC-VIS-06

Focus, danger, hover, selected, pressed 상태가 Light/Dark에서 일관되고 accessibility 검수가 가능하다.

## AC-VIS-07

Tooltip/Menu/Search 같은 floating surface만 elevation을 사용하며 fixed navigation chrome에는 shadow를 사용하지 않는다.

## AC-VIS-08

Motion은 80~160ms 범위의 짧고 비탄성적인 transition을 사용하며 reduced-motion을 존중한다.

## AC-VIS-09

기존 §2~§10 geometry와 충돌하지 않고 동일한 density rhythm을 유지한다.

## AC-VIS-10

전체 결과가 “아이콘이 많고 화려한 UI”가 아니라 “조용한 navigation + 선명한 Main Content”로 인식된다.

---

# 11.138 최종 결정 요약

```text
VISUAL DIRECTION
Neutral-first
Low-contrast chrome
Content-first
```

```text
ACCENT
Light #5B6EF5
Dark  #8B95FF
```

```text
RAIL ACTIVE
Accent-soft bg
Accent icon
```

```text
SIDEBAR SELECTED
Neutral selected bg
Primary text/icon
```

```text
VIEW ACTIVE
2px accent bottom indicator
```

```text
FONT
System / Pretendard
400 / 500 / 600
```

```text
RADIUS
6 / 7 / 8 / 10 / 12
```

```text
SHADOW
Only floating/elevated surfaces
```

```text
MOTION
80 / 120 / 160ms
No scale/bounce
```

```text
LIGHT / DARK
Semantic token system
```

---

# 11.139 §11에서 더 이상 미결로 남기지 않는 항목

아래는 확정된 것으로 취급한다.

- primary accent
- light/dark surfaces
- text hierarchy
- icon hierarchy
- divider
- Rail active visual
- Sidebar selected visual
- View active indicator
- typography scale
- font weight scale
- icon sizes/stroke
- radius scale
- focus ring
- danger style
- tooltip style
- menu style
- backdrop
- shadow
- motion timing/easing
- skeleton tone
- semantic token naming
- raw color 사용 금지
- card/shadow/pill 과다 사용 금지
- visual regression baseline 범위

---

# 12. Responsive / Accessibility / Edge Cases

- 상태: **최종 확정**
- 우선순위: **P0 + Release Gate**
- 적용 대상: 전체 `Global Rail / Context Sidebar / Main Header / View Switcher / Search / Tree / Overlay`
- 목적: 지금까지 확정한 구조가 다양한 viewport, 입력 방식, 접근성 환경, 데이터 규모, 네트워크/동기화 오류에서도 깨지지 않도록 **최종 responsive / accessibility / edge-case contract**를 정의한다.
- 선행: §1~§11 전체
- 이 section 완료 시 문서는 Sidebar redesign의 최종 개발 명세로 간주한다.

---

# 12.1 Responsive Strategy Overview

P0는 완전한 mobile-first 제품 재설계가 아니라 **Desktop/Web 중심 Sidebar shell의 안전한 축소**를 목표로 한다.

기본 구간:

```text
>= 1280px   Comfortable Desktop
1024~1279   Compact Desktop
768~1023    Tablet / Narrow Desktop
<768        Narrow / Mobile-like Web
```

Context Sidebar persistent breakpoint는 기존대로:

```text
>=1024px persistent
<1024px overlay
```

---

# 12.2 Viewport 1440px+

권장 기본 상태:

```text
Rail      56px
Sidebar   248px
Main      remaining
```

사용자 resize:

```text
216~360px
```

Main Content는 충분한 폭 확보.

---

# 12.3 Viewport 1280~1439px

동일 persistent layout 유지.

```text
Rail 56
Sidebar remembered width
Main remaining
```

Sidebar max 360으로 인해 Main을 과도하게 압축하지 않는다.

---

# 12.4 Viewport 1024~1279px

persistent mode 유지.

권장 UX:

- Sidebar는 사용자 저장 width 적용
- Main title은 ellipsis 가능
- View tabs는 필요 시 horizontal scroll
- Board/Gantt contained view는 ResizeObserver 기반 재계산

---

# 12.5 Viewport 1024px 정확 경계

정확히:

```text
1024px = persistent
```

CSS와 JS 모두 동일 기준.

---

# 12.6 Viewport 768~1023px

Context Sidebar는 overlay.

Base:

```text
Rail 56px
Main remaining
```

Main Header에 Sidebar open button 표시.

Sidebar overlay width:

```text
clamp(storedWidth, 216, min(360, viewport - 56 - 24))
```

---

# 12.7 Viewport 768~1023 Search

Search는 desktop-style 640px panel을 그대로 사용하되:

```text
max-width = calc(100vw - 32px)
```

때문에 안전하게 축소.

---

# 12.8 Viewport <768px

Search는 12px inset near-fullscreen.

Context Sidebar도 overlay.

Global Rail은 P0에서 여전히 56px 유지한다.

---

# 12.9 Extreme Narrow Viewport

아래 조건:

```text
viewportWidth < 296px
```

이면:

```text
56 Rail
+ 216 min Sidebar
+ 24 margin
```

이 성립하지 않는다.

P0 final:

- Sidebar overlay min-width constraint를 해제하고
- 사용 가능한 viewport에 맞춰 full-width-like drawer로 축소

공식 fallback:

```text
overlay width = viewportWidth - 56px
min-width floor disabled
```

---

# 12.10 Extreme Narrow Overlay

```text
Rail 56px
Sidebar overlay fills remaining width
```

backdrop은 Sidebar 뒤 Main에만 존재.

---

# 12.11 Mobile Shell Policy

P0에서는 별도의 bottom navigation을 만들지 않는다.

즉:

```text
Rail 유지
Context Sidebar overlay
Main
```

구조를 그대로 유지.

완전한 mobile-native shell은 future scope.

---

# 12.12 Touch Pointer Rules

touch-only 환경에서는 hover-only action을 그대로 의존할 수 없다.

따라서 Space/Project trailing action은 다음 조건에서 표시 가능해야 한다.

```text
pointer: coarse
→ trailing ···는 상시 표시 또는 row long-press 대체
```

P0 final:

**coarse pointer에서는 Project/Space `···`를 상시 표시한다.**

Space `+`도 상시 표시.

---

# 12.13 Touch Row Height

touch-only/coarse pointer에서는 Sidebar row:

```text
36px → 40px
```

로 확장 가능.

P0 final:

```css
@media (pointer: coarse) {
  --sidebar-nav-row-height: 40px;
}
```

Search result:

```text
44px → 48px
```

---

# 12.14 Touch Tooltip

hover tooltip에 의존하지 않는다.

coarse pointer에서는 tooltip 없이도:

- icon semantics
- accessible label
- visible trailing action

으로 이해 가능해야 한다.

---

# 12.15 Touch DnD

coarse pointer에서 drag reorder는 P0 필수 아님.

Project move는 context menu `이동`으로 완전히 가능해야 한다.

Space reorder도 future keyboard/menu fallback을 고려.

---

# 12.16 200% Zoom

브라우저 zoom 200%에서도:

- Rail 56 CSS px 유지
- Sidebar는 breakpoint 규칙에 따라 overlay로 전환 가능
- Main Header는 2줄로 늘지 않음
- title은 ellipsis
- View tabs horizontal scroll

기능 손실이 없어야 한다.

---

# 12.17 400% Zoom

WCAG reflow 관점에서 매우 좁은 effective viewport가 될 수 있다.

P0:

- Context Sidebar overlay
- Search near-fullscreen
- View tab horizontal scroll
- no horizontal page overflow outside intentional contained views

---

# 12.18 Horizontal Page Overflow 금지

App shell 자체:

```text
overflow-x: hidden
```

Main 내부 Board/Gantt/Calendar만 의도적으로 horizontal scroll 가능.

---

# 12.19 RTL Readiness

P0 한국어/영문 기준이지만 logical CSS property 사용 권장.

예:

```css
padding-inline-start
padding-inline-end
border-inline-end
```

가능하면 `left/right` 하드코딩을 최소화.

---

# 12.20 RTL Chevron

RTL 지원 시 tree chevron 방향:

collapsed:

```text
inline-end 방향
```

으로 전환 가능해야 함.

P0 구현에서 꼭 RTL locale을 제공하지 않아도 구조적 준비는 해둔다.

---

# 12.21 Localization Overflow

긴 locale에서도:

- Rail label은 tooltip이므로 width 영향 없음
- Sidebar label ellipsis
- Main title ellipsis
- View tabs horizontal scroll
- Search placeholder truncate 가능

layout width가 text 때문에 확장되지 않는다.

---

# 12.22 Korean IME Final Rule

Create / Rename / Search 모두:

```text
composition 중 Enter
≠ submit / navigate
```

공통 input utility를 사용한다.

---

# 12.23 Screen Reader Landmarks

App shell landmark 권장:

```text
<nav aria-label="주요 탐색">      Global Rail
<aside>                           Context Sidebar
<nav aria-label="작업 탐색">      Tasks nav
<main>                            Main Content
```

중복 main landmark 금지.

---

# 12.24 Header Semantics

Main Header title:

```text
h1
```

View body section:

```text
h2 이하
```

Sidebar header `작업`은 h1이 아니다.

---

# 12.25 Search Semantics

Search:

```text
role="dialog"
aria-modal="true"
```

input:

```text
combobox
```

results:

```text
listbox / option
```

또는 안정적인 component library semantics.

---

# 12.26 Context Sidebar Overlay Semantics

overlay drawer:

- modal-like behavior
- focus trap
- Main inert
- Escape close

persistent Sidebar에서는 modal semantics 사용 금지.

---

# 12.27 Focus Order

Desktop expanded 기준:

```text
Global Rail
→ Context Sidebar Header controls
→ Context Sidebar navigation
→ Main Header controls
→ View Switcher
→ Main Body
```

DOM order와 visual order가 크게 다르지 않아야 한다.

---

# 12.28 Keyboard-only Full Flow

키보드만으로 다음이 가능해야 한다.

```text
Tasks 진입
Today 선택
Space expand
Project 선택
Project View 변경
Sidebar collapse
Sidebar expand
Search 열기
Search 결과 이동
Project context menu 열기
Project 이동
Rename
Delete confirmation
```

---

# 12.29 Tree Keyboard Final

§5 유지:

```text
↑ ↓ visible rows
→ expand / child
← collapse / parent
Home / End
Enter navigate
Shift+F10 context menu
```

---

# 12.30 Rail Keyboard Final

표준 Tab + Enter/Space.

Arrow-key menu widget으로 강제하지 않는다.

---

# 12.31 View Switcher Keyboard Final

route link semantics.

Tab으로 이동.

Enter로 activation.

---

# 12.32 Focus-visible

mouse click과 keyboard focus를 구분해:

```text
:focus-visible
```

사용.

focus ring 제거 금지.

---

# 12.33 Focus Restoration Matrix

| Interaction | Close/Complete 후 focus |
|---|---|
| Search close | origin / Rail Search |
| Account close | Account button |
| Sidebar overlay close | Main Header open button |
| Delete success fallback | fallback Main h1 |
| Create success | new Main h1 |
| Rename cancel | rename trigger |
| Context menu close | menu trigger |
| Sidebar collapse from focused row | Main Header open button |

---

# 12.34 Focus Loss Prevention

unmount되는 element에 focus가 남지 않게 한다.

특히:

- Sidebar collapse
- overlay close
- Entity delete
- Search result navigation

에서 explicit focus handling.

---

# 12.35 Forced Colors / High Contrast

forced-colors 환경에서:

- selected background만으로 상태 표현 금지
- focus outline 유지
- active View underline 유지
- icon `currentColor` 사용 권장

---

# 12.36 Forced Colors CSS

필요 시:

```css
@media (forced-colors: active) {
  .selected {
    outline: 1px solid currentColor;
  }

  .viewIndicator {
    background: Highlight;
  }
}
```

정도 지원.

---

# 12.37 Reduced Motion Final

prefers-reduced-motion:

```text
Sidebar collapse animation 0
Search animation 0
Tooltip animation 0
Chevron rotation 0
Skeleton shimmer off
```

기능 상태 전환은 동일.

---

# 12.38 Color Blindness

상태 의미를 red/green color 하나로만 표현하지 않는다.

Delete:

```text
label + icon + dialog
```

active:

```text
background/indicator + text
```

---

# 12.39 Offline State

Offline에서도 local/cache data가 있다면 Sidebar navigation은 가능한 범위에서 유지.

mutation:

- create
- rename
- move
- archive
- delete

이 offline에서 불가능하면 기존 offline system에 따라 disable/queue.

Sidebar redesign 자체가 임의 offline queue를 만들지 않는다.

---

# 12.40 Offline Mutation UX

실행 불가 시:

- action disabled
- 필요하면 tooltip `오프라인에서는 사용할 수 없습니다`
- navigation 자체는 계속 가능

---

# 12.41 Search Offline

local index가 있으면 검색 가능.

server-only search라면:

```text
오프라인에서는 검색할 수 없습니다.
```

compact state.

---

# 12.42 Loading State Global

App shell은 즉시:

```text
Rail
Sidebar frame
Main shell
```

을 렌더하고 data만 skeleton.

대형 blank screen 금지.

---

# 12.43 Permission Edge Case

Space는 보이지만 일부 Project 접근 권한 없음:

- inaccessible Project는 Tree에서 제외 또는 disabled according to domain rule
- 클릭 후 403 반복을 만들지 않는다

---

# 12.44 Remote Permission Revoked

현재 Project 권한이 revoke되면:

- stale name 제거
- dedicated permission state/fallback
- Sidebar row 제거
- toast optional

---

# 12.45 Remote Delete

현재 선택 Entity가 remote delete:

```text
route fallback
Sidebar row 제거
Main title update
```

---

# 12.46 Remote Archive

현재 선택 Entity가 remote archive:

```text
Tree 제거
/tasks/archive 또는 safe parent fallback policy
```

§7/§8 규칙 우선.

---

# 12.47 Remote Move

Project parent 변경:

- new Space 아래로 이동
- active Project면 parent expand
- route 유지
- Main Header 유지

---

# 12.48 Concurrent Rename

다른 device에서 rename이 들어오면:

inline rename 중인 로컬 draft를 무조건 덮지 않는다.

P0 권장:

- edit session 끝날 때 conflict detection
- server latest가 충돌하면 existing mutation conflict system 사용

Sidebar redesign만으로 별도 CRDT 도입 금지.

---

# 12.49 0 Space

Tasks Sidebar:

```text
Today
Upcoming
Spaces header
empty state
Archive
```

정상 유지.

---

# 12.50 1 Space

Space hierarchy 생략 금지.

---

# 12.51 100+ Space

많은 Space에서도:

- Body scroll
- fixed Header
- no card layout
- Search로 빠른 접근 가능

---

# 12.52 100+ Project

한 Space 하위 Project가 많아도:

- Tree scroll
- trailing actions
- active reveal
- keyboard navigation

유지.

---

# 12.53 250+ Visible Rows

실제 profiling에서 문제 확인 시 virtualization 검토.

기능 correctness 우선.

---

# 12.54 Very Long Space Name

ellipsis.

hover truncation tooltip.

context menu/action geometry 유지.

---

# 12.55 Very Long Project Name

동일.

---

# 12.56 Emoji in User Names

사용자가 Entity 이름에 emoji를 입력하는 것은 허용 가능.

Navigation icon 자체로 emoji를 사용하지 않는 규칙과 별개.

---

# 12.57 Newline in Entity Name

기존 domain이 newline을 허용해도 Sidebar label은 single line normalization/ellipsis.

rename input에서 newline 입력은 막는다.

---

# 12.58 Empty Name

trim 후 0 length 금지.

---

# 12.59 Duplicate Name

기존 domain rule 따름.

Sidebar는 id로 identity.

---

# 12.60 Malicious HTML in Name

text node rendering.

`dangerouslySetInnerHTML` 금지.

---

# 12.61 Search Query Special Characters

검색 input에:

```text
/ \ " ' < > &
```

등 입력해도 UI가 깨지지 않아야 한다.

query는 parameterized/search API를 통해 처리.

---

# 12.62 Browser Compatibility

P0 target 권장:

```text
Latest Chrome
Latest Edge
Latest Safari
Latest Firefox
```

최소 지원 version은 프로젝트 정책 따름.

---

# 12.63 `100dvh` Fallback

구형 browser 대응이 필요하면:

```css
height: 100vh;
height: 100dvh;
```

순서로 fallback.

---

# 12.64 Pointer Events Compatibility

resize는 Pointer Events 기반.

지원 대상 browser가 오래되어 Pointer Events 미지원이면 mouse fallback 검토.

---

# 12.65 ResizeObserver Compatibility

contained View resize 대응에 ResizeObserver 사용.

필요 시 polyfill은 기존 browser support policy에 따라.

---

# 12.66 `inert` Compatibility

overlay/modal에서 `inert`를 사용할 수 있다.

미지원 환경은 focus trap primitive로 fallback.

---

# 12.67 Scrollbar Overlay Differences

Windows/macOS scrollbar 폭 차이로 layout이 깨지지 않게 `min-width:0` 유지.

---

# 12.68 OS Font Rendering

system font 차이로 title width가 달라져도 ellipsis.

pixel-perfect label width에 의존하지 않는다.

---

# 12.69 Windows High DPI

SVG icon / CSS border 사용.

bitmap 1x asset 금지.

---

# 12.70 Error Boundary

Sidebar Tree / Main View / Search 각각 적절한 error boundary.

하나의 View 오류로 App Shell 전체가 blank 되지 않는다.

---

# 12.71 Search Provider Error Isolation

Search provider failure가 current Main route를 손상시키지 않는다.

Search dialog만 error state.

---

# 12.72 Sidebar Query Error Isolation

Spaces load failure:

- Today/Upcoming/Archive 유지
- Main route가 already-loaded Project라면 가능하면 유지

---

# 12.73 Main View Error Isolation

Project Gantt error:

- Header
- tabs
- Sidebar

유지.

---

# 12.74 Mutation Error Isolation

rename 실패가 Tree 전체 refetch/blank를 만들지 않는다.

---

# 12.75 Delete Confirmation Accessibility

dialog open:

- initial focus = 취소 또는 destructive 버튼 정책은 기존 design system 따름
- Escape = cancel
- focus trap
- descriptive title

P0 권장 initial focus:

```text
취소
```

---

# 12.76 Archive Accessibility

archive는 reversible이면 confirmation 생략 가능.

Undo system이 있으면 existing pattern 사용.

---

# 12.77 Toast Accessibility

mutation error toast:

```text
role=status 또는 alert
```

너무 긴 메시지 금지.

---

# 12.78 Context Menu Accessibility

menu:

```text
role=menu
menuitem
```

또는 established Menu primitive.

ArrowUp/Down / Enter / Escape 지원.

---

# 12.79 Tooltip Accessibility

tooltip을 accessible name의 유일한 source로 의존하지 않는다.

icon-only control에는 `aria-label`.

---

# 12.80 Resize Separator Accessibility

role separator + aria-valuenow/min/max.

keyboard resize.

---

# 12.81 Search Recent Privacy

최근 Entity id만 저장.

최근 검색어 문자열 저장하지 않음.

로그아웃 시 user-scoped local cache cleanup 권장.

---

# 12.82 Multi-user Same Browser

여러 계정을 같은 browser에서 사용 가능하면 localStorage key를 user scope에 namespace하는 것을 권장.

예:

```text
focusflow:<userId>:ui:contextSidebar.width
```

---

# 12.83 User-scoped Preferences

권장 대상:

```text
Sidebar width
collapsed state
expanded Space ids
recent Search entities
```

공용 브라우저에서 계정 간 섞이지 않게.

---

# 12.84 Logout Cleanup

민감한 데이터는 아니지만 recent entity ids는 logout 시 cleanup 또는 namespace 분리.

---

# 12.85 Data Migration Edge Case

old Space/Project 구조 migration 후 id가 바뀌면:

- expandedSpaceIds invalid cleanup
- recent entities invalid cleanup
- lastTasksLocation invalid fallback

---

# 12.86 Route Migration Edge Case

legacy route redirect 실패 시 generic Not Found.

redirect loop 금지.

---

# 12.87 Deleted Last Tasks Location

sessionStorage:

```text
/project/deleted/list
```

Tasks restore 시 loader fallback → Today.

그 후 lastTasksLocation도 Today로 갱신.

---

# 12.88 Archived Last Tasks Location

restore archived Project route:

```text
/tasks/archive
```

로 replace 가능.

다음 Tasks restore가 계속 archived route loop를 만들지 않게 저장값 갱신.

---

# 12.89 Sidebar Width after Window Move

multi-monitor에서 viewport가 달라져도:

- persistent/overlay 재평가
- stored width 유지
- runtime clamp

---

# 12.90 Sidebar Width after Zoom

stored width numeric 유지.

runtime layout만 적응.

---

# 12.91 Search Panel after Zoom

max-width / inset 규칙으로 reflow.

---

# 12.92 Tooltip Overflow

viewport edge에서 flip/shift.

Rail tooltip이 screen 밖으로 나가지 않게.

---

# 12.93 Context Menu Overflow

floating positioning library collision handling.

---

# 12.94 Rename Input Overflow

row 내 `min-width:0`.

Sidebar 폭 증가 없음.

---

# 12.95 Main Header Overflow

title ellipsis.

actions 유지.

---

# 12.96 View Switcher Overflow

wrap 금지.

horizontal scroll.

---

# 12.97 Search Result Metadata Overflow

primary label 우선.

metadata max-width 40%.

ellipsis.

---

# 12.98 Full Keyboard Release Test

마우스 없이 아래 시나리오가 통과해야 한다.

```text
1. Tasks Rail focus
2. Enter
3. Today
4. Tree Space focus
5. ArrowRight expand
6. ArrowDown Project
7. Enter
8. View tab 이동
9. Search /
10. 검색
11. ArrowDown
12. Enter
13. Project context menu
14. rename
15. cancel
16. Sidebar collapse shortcut
17. expand shortcut
```

---

# 12.99 Screen Reader Release Test

최소 NVDA/VoiceOver 중 하나에서:

- Rail names
- Sidebar landmark
- active navigation
- expanded/collapsed
- Search dialog
- result count
- context menu
- rename input

확인.

---

# 12.100 Zoom Release Test

브라우저:

```text
100%
200%
400%
```

에서 core flow 사용 가능.

---

# 12.101 Contrast Release Test

Light/Dark 모두:

- text
- focus
- selected
- danger

검수.

---

# 12.102 High Contrast Release Test

Windows forced-colors 가능하면 확인.

불가능하면 최소 CSS fallback 검수.

---

# 12.103 Reduced Motion Release Test

OS reduced motion on:

- Sidebar
- Search
- Tooltip
- Skeleton

검수.

---

# 12.104 Data Scale Release Test

테스트 fixture:

```text
0 Space
1 Space / 1 Project
10 Space / 100 Project
1 Space / 250 Project
```

각각 Sidebar 사용성 확인.

---

# 12.105 Slow Network Release Test

네트워크 throttling:

```text
Slow 3G equivalent
```

에서:

- shell geometry
- loading skeleton
- no layout shift
- Search loading
- mutation failure

확인.

---

# 12.106 Offline Release Test

offline:

- cached navigation 가능 여부
- mutation state
- Search error/local behavior

확인.

---

# 12.107 Race Condition Release Test

다음 빠른 sequence 검수:

```text
Project A → B → C
Board → Gantt → Calendar
Sidebar resize → Calendar
Sidebar expand → Search
Search query rapid typing
Delete then immediate navigation
```

stale state가 current UI를 덮지 않아야 한다.

---

# 12.108 Main Content Persistence Release Test

Sidebar collapse/expand/resize로:

- Board column state
- Gantt zoom
- Calendar position

이 불필요하게 reset되지 않는지 검수.

---

# 12.109 Visual Regression Release Set

필수 snapshot:

```text
Light / Tasks / expanded
Dark / Tasks / expanded

Light / collapsed
Dark / collapsed

Light / overlay Sidebar
Dark / overlay Sidebar

Light / Search
Dark / Search

Light / context menu
Dark / context menu

Light / inline create
Dark / inline rename
```

---

# 12.110 E2E Core Routes

필수:

```text
/tasks/today
/tasks/upcoming
/tasks/archive

/space/:id/overview
/space/:id/goals

/project/:id/list
/project/:id/board
/project/:id/gantt
/project/:id/calendar

/calendar
/focus
/settings
```

---

# 12.111 E2E Deep Link

직접 opening:

```text
/project/:id/gantt
```

→ parent expand / project selected / Gantt active.

---

# 12.112 E2E Browser History

```text
Today
→ Project List
→ Board
→ Calendar Global
→ Back
→ Back
```

state 정확성 확인.

---

# 12.113 E2E Legacy Route

```text
/today
/archive
/board
/project/:id
/space/:id
```

redirect 검수.

---

# 12.114 E2E Search

- recent
- query
- stale request
- task reveal
- escape
- focus restore

---

# 12.115 E2E Create

- Space create
- Project create
- Escape
- blur cancel
- IME
- error retry
- success auto-nav

---

# 12.116 E2E Rename

- Sidebar rename
- Header rename
- Escape
- blur
- failure

---

# 12.117 E2E Move

- context menu move
- DnD
- active Project move
- collapsed destination

---

# 12.118 E2E Delete

- inactive delete
- active Project delete
- active Space delete
- fallback route
- Back loop 없음

---

# 12.119 E2E Archive

- Project
- Space
- active/inactive
- archive view

---

# 12.120 E2E Collapse/Resize

- resize min/max
- double-click reset
- collapse
- persistence
- breakpoint preservation

---

# 12.121 Release Gate — P0 Blocking

아래 중 하나라도 실패하면 P0 release를 막는다.

```text
1. Sidebar/Main selected Scope 불일치
2. Project Calendar가 Global Calendar active로 표시
3. Deep link 후 parent Space 미확장
4. Search가 current route를 파괴
5. Sidebar collapse 후 focus loss
6. Resize 후 stuck cursor/user-select
7. Delete 후 stale route loop
8. 1024 breakpoint CSS/JS 불일치
9. IME Enter 오작동
10. keyboard-only core navigation 불가
11. Light/Dark focus ring 식별 불가
12. Sidebar toggle로 Main View remount/reset
```

---

# 12.122 Release Gate — P1 Non-blocking

다음은 있으면 좋지만 P0 release blocker는 아니다.

```text
- Space keyboard reorder
- 초성 fuzzy search
- virtualization
- server preference sync
- mobile bottom navigation
- recent search query history
```

---

# 12.123 Final Architecture Summary

```text
GLOBAL RAIL
56px
Tasks / Calendar / Focus / Search / Settings
```

```text
TASKS CONTEXT SIDEBAR
248px default
216~360 resize
Today / Upcoming / Spaces / Archive
```

```text
SPACE TREE
Space
└ Project
```

```text
SPACE VIEWS
Overview
Projects
Goals
Horizons
```

```text
PROJECT VIEWS
Overview
List
Board
Gantt
Calendar
```

```text
SEARCH
Global modal overlay
Task / Project / Space
```

```text
RESPONSIVE
>=1024 persistent
<1024 overlay
```

---

# 12.124 Final State Sources

```text
URL
→ Global Module
→ Scope
→ View
```

```text
sessionStorage
→ last Tasks route
```

```text
localStorage
→ Sidebar width
→ desktop collapsed
→ expanded Spaces
→ recent Search entities
```

```text
runtime only
→ Search open
→ Account open
→ overlay open
→ resize
→ create
→ rename
→ context menu
```

---

# 12.125 Final Component Boundary

권장 최종 구조:

```text
AppShell
├ GlobalRail
│  ├ RailBrand
│  ├ RailAccountButton
│  ├ RailNavLink
│  └ RailSearchButton
│
├ ContextSidebarSlot
│  └ TasksSidebar
│     ├ TasksSidebarHeader
│     ├ SmartViewsGroup
│     ├ SpacesSection
│     │  └ SpaceTree
│     └ ArchiveNavItem
│
└ MainRegion
   ├ MainHeader
   ├ MainViewSwitcher
   └ MainBody
```

Global overlays:

```text
GlobalSearchDialog
AccountPopover
SharedContextMenu
SharedConfirmationDialog
```

---

# 12.126 Final State Ownership

```text
Router
→ module
→ scope
→ view
```

```text
AppShell UI store
→ Sidebar layout state
```

```text
Tree UI store
→ expanded
→ context target
→ rename
→ drag
```

```text
Global overlay store
→ Search
→ Account
```

```text
Domain/query layer
→ Space / Project / Task data
```

---

# 12.127 Final Non-goals

P0 Sidebar redesign 범위 밖:

```text
- 완전한 mobile bottom nav
- Tags
- Filters
- Favorites
- Inbox
- Sprint
- Milestone
- notification center
- collaborative presence
- full search results page
- global Board
- nested folder hierarchy
- Subspace
```

---

# 12.128 Final Prohibitions

다음은 최종적으로 금지한다.

```text
- Global Rail에 Today
- Global Rail에 Board
- Global Rail에 Archive
- Global Rail에 Space/Project
- Project click 시 current View carry-over
- Search를 persistent route module로 취급
- Sidebar selected를 local click state로 authoritative 저장
- Sidebar minimum drag auto-collapse
- Mobile에서 hover-only action
- Main Header breadcrumb 상시 표시
- Sidebar group card화
- selected row bright accent fill
- Main View remount on sidebar toggle
```

---

# 12.129 Final Developer Implementation Order

권장 실제 구현 순서:

```text
P0-1  Route registry / parser
P0-2  AppShell + 56px Rail
P0-3  Context Sidebar frame
P0-4  Tasks Sidebar content
P0-5  Space/Project Tree
P0-6  Main Header + View Switcher
P0-7  Create/Rename/Context menu
P0-8  Collapse/Resize state machine
P0-9  Global Search
P0-10 Visual tokens Light/Dark
P0-11 Accessibility pass
P0-12 E2E / visual regression
```

---

# 12.130 Implementation Dependency Graph

```text
Route Registry
      ↓
AppShell
      ↓
Rail ─────────────┐
      ↓            │
Context Sidebar    │
      ↓            │
Tasks Tree         │
      ↓            │
Main Shell ◀───────┘
      ↓
Create / Rename / Menu
      ↓
Collapse / Resize
      ↓
Search
      ↓
Visual Tokens
      ↓
Accessibility / QA
```

---

# 12.131 Migration Order from Existing UI

현재 FocusFlow 기준:

```text
1. 기존 Board global nav 제거 준비
2. route semantics 분리
3. Global Rail 추가
4. 기존 Sidebar content를 Context Sidebar로 이동
5. Search input 제거 후 overlay 연결
6. Account email 제거 후 avatar popover
7. Board를 Project View로 이동
8. Archive를 Tasks Sidebar로 이동
9. Sidebar resize/collapse 교체
10. visual token 적용
11. legacy route redirect
12. QA
```

---

# 12.132 Rollback Strategy

새 shell rollout 중 critical issue 발생 시:

- route/domain migration은 유지
- visual shell만 feature flag로 legacy Sidebar fallback 가능하게 하면 좋음

단 장기간 두 navigation architecture를 병행하지 않는다.

---

# 12.133 Feature Flag 권장

가능하면:

```text
newNavigationShell
```

하나의 flag.

세부 Rail/Sidebar/Search를 여러 flag로 조각내지 않는다.

---

# 12.134 Telemetry 권장

analytics가 있다면:

```text
Rail navigation
Sidebar collapse
Sidebar resize
Search open/result click
Space/Project create
```

정도만.

개인 entity name/query text는 analytics payload에 넣지 않는다.

---

# 12.135 Privacy

Search query, Project/Space names를 telemetry로 수집하지 않는다.

이벤트는 semantic id/category 중심.

---

# 12.136 Final QA Checklist

- [ ] 1440px에서 default shell 정상
- [ ] 1280px persistent 정상
- [ ] 1024px persistent 정상
- [ ] 1023px overlay 정상
- [ ] 900px overlay 정상
- [ ] 768px overlay 정상
- [ ] 767px Search near-fullscreen 정상
- [ ] extreme narrow fallback 정상
- [ ] coarse pointer에서 trailing action 접근 가능
- [ ] 200% zoom core flow 정상
- [ ] 400% zoom core flow 사용 가능
- [ ] keyboard-only flow 정상
- [ ] screen reader landmark 정상
- [ ] Search combobox/dialog semantics 정상
- [ ] focus restoration 정상
- [ ] forced-colors fallback 존재
- [ ] reduced-motion 정상
- [ ] offline state가 shell을 깨지 않음
- [ ] 0 Space 정상
- [ ] 1 Space 정상
- [ ] 100+ Project 정상
- [ ] long names ellipsis 정상
- [ ] malicious name text-safe
- [ ] remote delete/archive/move 대응
- [ ] race condition 검수
- [ ] legacy route redirect 검수
- [ ] Light/Dark visual regression 통과
- [ ] Sidebar toggle로 Main state reset 없음

---

# 12.137 Final Acceptance Criteria

## AC-FINAL-01

모든 viewport에서 Global Rail은 일관된 global navigation anchor로 유지되고 Context Sidebar만 persistent/overlay로 적응한다.

## AC-FINAL-02

keyboard, screen reader, zoom, reduced-motion 환경에서 Tasks → Project → View → Search의 핵심 흐름이 기능적으로 완전하다.

## AC-FINAL-03

touch/coarse pointer에서도 hover-only affordance 때문에 Project/Space 관리 기능에 접근 불가능한 상태가 없다.

## AC-FINAL-04

URL/state/persistence/runtime state가 서로 분리되어 reload, Back/Forward, deep link, breakpoint 전환에서 deterministic하게 복원된다.

## AC-FINAL-05

0개부터 대규모 Space/Project까지 동일 IA가 유지되고 데이터 양에 따라 hierarchy 자체가 변하지 않는다.

## AC-FINAL-06

loading/error/offline/permission/remote mutation이 App Shell 전체를 파괴하지 않고 해당 영역에서 격리된다.

## AC-FINAL-07

Light/Dark 모두 시각적 hierarchy, focus, selected, danger 상태가 명확하고 TickTick-style의 낮은 시각 밀도를 유지한다.

## AC-FINAL-08

P0 release blocker 목록이 모두 통과되어야 새 navigation shell을 기본값으로 전환할 수 있다.

---

# 12.138 문서 최종 상태

이 문서의 12개 설계 영역은 모두 확정되었다.

```text
§1  Navigation IA                 DONE
§2  Global Rail                   DONE
§3  Context Sidebar Frame         DONE
§4  Tasks Sidebar                 DONE
§5  Space / Project Tree          DONE
§6  Create UX                     DONE
§7  Main Content 연동             DONE
§8  URL / Navigation State        DONE
§9  Global Search                 DONE
§10 Collapse / Resize             DONE
§11 Visual System                 DONE
§12 Responsive / A11y / Edge      DONE
```

---

# 12.139 개발자 전달 기준

이 문서는 다음 용도로 바로 전달 가능하다.

```text
- 구현 설계 기준
- component 분리 기준
- route migration 기준
- state ownership 기준
- UI QA 기준
- accessibility QA 기준
- release gate 기준
```

개발 중 해석 충돌이 생기면 다음 우선순위를 따른다.

```text
1. §12 final contract
2. §10 state machine
3. §8 URL/navigation
4. §7 Main linkage
5. §5 Tree interaction
6. §4 Tasks Sidebar
7. §3 Frame
8. §2 Rail
9. §1 IA
10. §11 visual token은 geometry를 변경하지 않음
```

---

# 12.140 최종 한 줄 설계 정의

```text
FocusFlow의 좌측 내비게이션은
56px Global Rail + 필요할 때만 나타나는 Context Sidebar로 분리하고,
Space/Project는 Scope,
Board/Gantt/Calendar는 View로 취급하며,
URL을 navigation source of truth로 사용한다.
```

---

# Appendix A. Developer Quick Reference

## A.1 Width

```text
Rail              56
Sidebar default  248
Sidebar min      216
Sidebar max      360
```

## A.2 Breakpoint

```text
>=1024 persistent
<1024 overlay
```

## A.3 Rows

```text
Rail item          40
Sidebar row        36
Touch row          40
Search result      44
Touch search       48
```

## A.4 Headers

```text
Sidebar Header     48
Main Header        56
View Switcher      40
Search Input       52
```

## A.5 Routes

```text
/tasks/today
/tasks/upcoming
/tasks/archive

/space/:id/overview
/space/:id/projects
/space/:id/goals
/space/:id/horizons

/project/:id/overview
/project/:id/list
/project/:id/board
/project/:id/gantt
/project/:id/calendar

/calendar
/focus
/settings
```

## A.6 Project Default

```text
List
```

## A.7 Space Default

```text
Overview
```

## A.8 Search

```text
Global modal
/
Task / Project / Space
```

## A.9 Accent

```text
Light #5B6EF5
Dark  #8B95FF
```

## A.10 Release Blockers

```text
Scope mismatch
Calendar ambiguity
focus loss
IME failure
route loop
breakpoint mismatch
resize stuck state
Main remount/reset
keyboard core flow failure
```
