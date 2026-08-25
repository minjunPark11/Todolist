# TICKTICK_STYLE_TASK_DETAIL_SPEC

> 목적: TickTick 스타일의 Task Detail을 시각적으로만 모사하는 것이 아니라, 실제 제품 수준의 데이터 구조·상태 관리·상호작용·동기화까지 구현할 수 있도록 정의하는 단일 Master Specification.

---

## Document Structure

1. Task Detail Shell
2. Task Data Model
3. Task Selection & Navigation
4. Completion & Status
5. Date · Time · Duration
6. Reminder
7. Repeat / Recurrence
8. Priority
9. Title Editor
10. Description Editor
11. Checklist
12. Subtask
13. List · Folder · Tags
14. Attachment
15. More Actions
16. Autosave & Optimistic Update
17. Undo & Feedback
18. Keyboard & Focus System
19. Popover & Layer System
20. Visual System
21. State Synchronization
22. Edge Cases & Error Handling
23. Accessibility
24. Final Acceptance Criteria
25. TickTick Fidelity Verification & Product Gap Addendum
26. Codebase Harmonization Overrides — **이 저장소에서는 26장이 1–25장보다 우선한다**

---

# 1. Task Detail Shell

## 1.1 Purpose

Task Detail은 현재 선택한 Task를 확인하고 수정하는 상세 편집 surface다.

Desktop의 List/Today/Inbox 계열 surface에서는 기본적으로 **persistent right-side detail pane**으로 표현한다. 다만 Task Detail의 기능 semantics와 presentation은 분리하며, Mobile/Tablet/일부 context에서는 popup 또는 split-column presentation을 사용할 수 있다.

> **[VERIFIED TICKTICK + FIDELITY CORRECTION]** TickTick은 Desktop에서 side-detail 형태를 사용하지만, Mobile v7.0에서는 Task Popup Style을 도입했고 Tablet에서는 사용 시나리오에 따라 split-column 또는 pop-up으로 전환한다. 따라서 `Task Detail = 항상 persistent pane`을 전역 invariant로 두지 않는다.

핵심 원칙:

```text
Task를 클릭한다
        ↓
Main View는 유지된다
        ↓
우측 Detail Pane이 열린다
        ↓
다른 Task를 클릭한다
        ↓
Pane을 새로 열지 않고 내용만 교체한다
```

Desktop의 **side-pane presentation**은 Modal이 아니다.

```text
Desktop List-like surface

❌ blocking modal
Main View
   ↓
Backdrop + interaction block
   ↓
Task Detail

✅ structural side pane
Sidebar │ Main View │ Task Detail
```

Mobile/Tablet/context-specific popup은 별도 presentation이며, 같은 Task Detail domain commands와 canonical Task entity를 재사용한다.

```ts
type TaskDetailPresentation =
  | "side-pane"
  | "popup"
  | "split-column"
  | "full-page"; // fallback/exception, not the universal mobile default
```

---

## 1.2 Desktop Layout

Desktop 기본 구조:

```text
┌────────┬──────────────────────────────┬────────────────────┐
│        │                              │                    │
│ Global │                              │    Task Detail     │
│ Rail   │          Main View           │                    │
│        │                              │                    │
│        │                              │                    │
├────────┤                              │                    │
│ Tasks  │                              │                    │
│Sidebar │                              │                    │
│        │                              │                    │
└────────┴──────────────────────────────┴────────────────────┘
```

Task Detail을 열어도 다음 상태는 유지한다.

- Sidebar
- 현재 List
- Main View
- Main View scroll position
- 현재 filter/sort/view state

Task Detail이 열리면 현재 선택된 Task만 변경된다.

---

## 1.3 Shell State

최소 상태:

```ts
type TaskDetailState =
  | "closed"
  | "open";
```

실제 source of truth:

```ts
selectedTaskId: string | null;
```

### Closed

```ts
selectedTaskId = null;
```

### Open

```ts
selectedTaskId = "task-123";
```

Task A가 열린 상태에서 Task B를 클릭하면:

```text
OPEN(Task A)
    ↓ Task B click
OPEN(Task B)
```

Pane 자체를 닫았다 다시 여는 transition은 발생하지 않는다.

---

## 1.4 Task Selection Rule

Main View의 Task row를 한 번 클릭하면 Detail을 연다.

```text
☐ SU Meeting
      ↓ click

Main View               Task Detail
☐ SU Meeting            SU Meeting
```

Detail이 이미 열려 있는 상태에서 다른 Task를 클릭하면 같은 Pane의 내용만 교체한다.

> Detail Pane은 Task마다 생성하지 않는다. 앱 Shell에 단 하나만 존재한다.

---

## 1.5 Selected Task Representation

현재 Detail에서 열려 있는 Task는 Main View에서도 selected state를 갖는다.

지원해야 하는 row state:

```text
default
hover
selected
selected + hover
```

Selected state는 다음 의미만 가진다.

> 현재 오른쪽 Detail Pane에서 보고 있는 Task.

Hover와 Selected는 동일한 표현으로 처리하지 않는다.

---

## 1.6 Internal Regions

Shell 기준 Detail Pane은 세 영역으로 나눈다.

```text
┌─────────────────────────────────────┐
│ A. Property Header                  │
│                                     │
│ □ │ Date / Time              │ ⚑    │
├─────────────────────────────────────┤
│                                     │
│ B. Content Header                   │
│                                     │
│ Task Title                      ☷   │
│                                     │
├─────────────────────────────────────┤
│                                     │
│ C. Content Body                     │
│                                     │
│ Description                         │
│                                     │
│ +                                   │
│                                     │
└─────────────────────────────────────┘
```

Component hierarchy:

```text
TaskDetailPane
│
├── TaskPropertyHeader
│
├── TaskContentHeader
│
└── TaskContentBody
```

---

## 1.7 Property Header

Property Header는 Detail 상단의 고정 영역이다.

```text
□ │ Apr 20, 9:30 PM - 10:30 PM │ ⚑
```

향후 포함 기능:

- Complete
- Date
- Time
- Duration
- Reminder
- Repeat
- Priority

Property Header 자체는 콘텐츠 스크롤에 따라 사라지지 않는다.

```text
┌─────────────────┐
│ Property Header │ ← sticky/fixed
├─────────────────┤
│                 │
│    CONTENT      │
│       ↑↓        │ ← scroll
│                 │
└─────────────────┘
```

---

## 1.8 Detail Close

Detail Pane은 명시적으로 닫는다.

### Close button

```text
Task Detail                       ×
```

클릭 시:

```ts
selectedTaskId = null;
```

Main View는 그대로 유지한다.

### Esc

Esc 우선순위:

```text
1. 열린 Menu / Popover
2. Editor의 temporary/special state
3. Task Detail
```

예:

```text
Date Popover open
    ↓ Esc
Date Popover close
    ↓ Esc
Task Detail close
```

---

## 1.9 Outside Click

Main View의 빈 공간을 클릭해도 Detail은 닫지 않는다.

```text
❌ outside click → close
```

Task Detail은 Popover나 Modal이 아니라 persistent pane이기 때문이다.

---

## 1.10 Main View Interaction While Open

Detail이 열려 있어도 Main View는 계속 사용할 수 있다.

허용:

- 다른 Task 선택
- Main View scroll
- Task 완료
- 정렬
- 필터
- View 변경
- 일반적인 Main View interaction

금지:

```text
❌ backdrop
❌ dim overlay
❌ Main View pointer-events block
```

---

## 1.11 Detail Width

초기 권장값:

```text
default: 420px
min:     360px
max:     600px
```

이 값은 하드코딩하지 않고 design token 또는 UI preference로 관리한다.

예:

```css
--task-detail-width-default: 420px;
--task-detail-width-min: 360px;
--task-detail-width-max: 600px;
```

향후 TickTick DOM 실측 결과에 따라 값은 교체 가능해야 한다.

---

## 1.12 Resize

Desktop에서는 Detail Pane의 좌측 경계를 drag해 너비를 조절할 수 있도록 한다.

```text
Main View       │ Detail
                ↑
          resize handle
```

Interaction:

```text
pointerDown
   ↓
drag
   ↓
detailWidth 변경
   ↓
pointerUp
   ↓
width preference 저장
```

Constraint:

```text
360px ≤ detailWidth ≤ 600px
```

---

## 1.13 Resize Handle

보이는 divider와 실제 hit area를 분리한다.

```text
visible divider: 1px
interactive hit area: 약 8px
```

예:

```text
       invisible hit area
          ← 8px →
            │
            │ ← visible 1px divider
```

Hover 시 cursor:

```css
cursor: col-resize;
```

---

## 1.14 Width Persistence

사용자가 변경한 Detail 너비는 UI preference로 저장한다.

```ts
taskDetailWidth = 486;
```

저장 위치:

```text
Task data             ❌
User UI preference    ✅
```

앱 재실행 후에도 가능한 경우 복원한다.

---

## 1.15 Responsive & Contextual Presentation Strategy

> **[VERIFIED TICKTICK + FIDELITY CORRECTION]** 정확한 presentation은 width 하나만으로 결정하지 않는다. TickTick은 Mobile에서 Task Popup Style을 사용하고, Tablet에서는 사용 시나리오에 따라 split-column 또는 pop-up으로 전환한다. 따라서 viewport breakpoint는 input 중 하나이며 `platform + current view + available width + interaction context`를 함께 본다.

### Wide Desktop

기본 presentation:

```text
Sidebar │ Main │ Detail
         side-pane
```

List / Today / Inbox처럼 Main View를 유지한 채 빠르게 Task를 바꾸는 surface에서는 structural side-pane을 우선한다.

### Medium / Tablet

허용 presentation:

```text
split-column
OR
popup
```

Tablet에서 항상 3-column을 강제하지 않는다. 같은 Task Detail command/data layer를 재사용하고 presentation만 바꾼다.

### Small / Mobile

기본 fidelity 방향:

```text
Task click
  ↓
Task Popup Style
```

`< 760px → full-screen`을 TickTick fidelity rule로 고정하지 않는다. Full-page는 긴 content, accessibility, OS/browser 제약 또는 별도 product decision이 있을 때 fallback으로 사용할 수 있다.

### Presentation Resolver

```ts
type TaskDetailPresentation =
  | "side-pane"
  | "split-column"
  | "popup"
  | "full-page";

resolveTaskDetailPresentation({
  platform,
  viewportWidth,
  currentView,
  inputMode,
  contentConstraints
});
```

> **[OUR DESIGN DECISION]** 실제 TickTick 내부 resolver 구현은 공개되어 있지 않다. 위 resolver는 관찰된 외부 behavior를 재현하기 위한 구현 abstraction이다.

---

## 1.16 Small-screen / Mobile Detail

좁은 화면에서는 right-side pane을 강제로 유지하지 않는다.

기본 흐름:

```text
Task List
   ↓ task click
┌────────────────────────┐
│      Task Popup        │
│ □  Today          ⚑    │
│ Task Title             │
│ Description            │
│ Actions / More         │
└────────────────────────┘
```

Popup에서 닫기/Back 시:

- 기존 Task List context로 복귀
- 기존 scroll position 복원
- 기존 view/filter/sort 유지
- 같은 Task canonical data와 command layer 유지

Tablet에서는 상황에 따라:

```text
Main │ Detail
```

형태의 split-column도 허용한다.

금지:

```text
❌ Mobile = 무조건 Desktop 3-column 축소판
❌ Mobile = 무조건 full-page라는 단일 fidelity rule
❌ popup용 별도 Task business logic
```

---

## 1.17 Scroll Ownership

전체 앱을 하나의 scroll container로 만들지 않는다.

```text
┌────────┬─────────────────┬─────────────────┐
│Sidebar │ Main            │ Detail          │
│ ↑↓     │ ↑↓              │ ↑↓              │
│        │                 │                 │
└────────┴─────────────────┴─────────────────┘
```

각 영역은 독립적으로 scroll한다.

- Sidebar scroll
- Main View scroll
- Task Detail scroll

---

## 1.18 Detail Internal Scroll

Property Header는 고정하고 content 영역만 scroll한다.

```text
┌────────────────────────┐
│ □ Date           ⚑     │ ← sticky/fixed
├────────────────────────┤
│                        │
│ Title                  │
│                        │
│ Description            │ ↑
│                        │ │ scroll
│                        │ ↓
│ Subtasks               │
│                        │
└────────────────────────┘
```

긴 Description에서도 Complete / Date / Priority에 계속 접근할 수 있어야 한다.

---

## 1.19 Content Padding

Task Detail은 카드 UI를 빽빽하게 쌓지 않는다.

초기 token:

```css
--task-detail-padding-x: 24px;
--task-detail-content-gap: 12px;
```

컴포넌트에서 수치를 반복 하드코딩하지 않는다.

향후 TickTick 실측값으로 token만 교체 가능해야 한다.

---

## 1.20 Divider

구획에 필요한 최소한의 divider만 사용한다.

```text
Property Header
────────────────────
Content
```

금지:

- 각 속성을 카드로 감싸기
- 과도한 border
- 영역마다 별도 box

---

## 1.21 Surface Hierarchy

Detail은 Main View와 동일한 앱 구조 안의 surface다.

권장 hierarchy:

```text
App background
Main surface
Detail surface
Popover surface
```

Dark mode에서도 Detail만 과도하게 밝거나 어둡게 만들지 않는다.

Elevation 차이는 Popover에서 더 분명하게 표현한다.

---

## 1.22 Border Radius

Desktop Task Detail 자체에는 radius를 사용하지 않는다.

```text
❌ Floating card

   ╭──────────────╮
   │ Task Detail  │
   ╰──────────────╯


✅ Structural pane

──────│ Task Detail
      │
      │
```

Radius는 Date Picker, Menu 등 floating surface에서 사용한다.

---

## 1.23 Shadow

Desktop structural pane:

```css
box-shadow: none;
```

Main View와 Detail의 경계는 divider로 처리한다.

Responsive에서 Detail이 floating overlay-like surface가 되는 경우에만 미세한 shadow를 허용한다.

---

## 1.24 Layer Architecture

초기 layer token 예시:

```text
Layer 0   App content
Layer 10  Sidebar / Detail structural shell
Layer 20  Sticky Task Property Header
Layer 100 Popover
Layer 200 Context menu / Tooltip
Layer 300 Modal
Layer 400 Toast
```

개별 component에서 임의의 `z-index: 9999` 등을 사용하지 않는다.

---

## 1.25 Loading State

Task 클릭 후 데이터 fetch가 필요한 경우에도 Pane은 즉시 열린다.

```text
Task click
   ↓
Detail Pane open
   ↓
content loading
   ↓
content render
```

금지:

```text
click
→ 서버 응답 대기
→ 그 후 Detail 등장
```

Local store에 이미 Task entity가 있다면 skeleton 없이 즉시 표시한다.

---

## 1.26 Task Switching

Task A → Task B 전환 시 전체 Pane에 loading animation을 다시 표시하지 않는다.

```text
Task A
  ↓ Task B click
Task B
```

지양:

- slide out → slide in
- fade out → fade in
- Task 전환마다 skeleton
- Pane close/reopen

빠른 context switching을 우선한다.

---

## 1.27 Deleted Task

현재 열려 있는 Task가 삭제되면:

```text
Task Detail open
      ↓
Delete Task
      ↓
selectedTaskId = null
      ↓
Detail close
```

Main View navigation state는 유지한다.

---

## 1.28 Task Leaves Current Query by Editing

현재 View의 조건과 맞지 않게 Task를 수정하더라도 Detail은 자동으로 닫지 않는다.

예:

```text
Today View

Task A Detail open
Task A date: Today
      ↓
Date → Tomorrow
      ↓
Task A disappears from Today list
      ↓
Task A Detail remains open
```

동일 규칙을 다음에도 적용한다.

- filter 결과에서 빠짐
- sort 위치 이동
- smart list 조건에서 빠짐

Task 자체 수정 때문에 현재 query 결과에서 사라졌다는 이유만으로 Detail을 닫지 않는다.

---

## 1.29 Explicit Navigation to Another View

사용자가 Sidebar에서 다른 List/View로 명시적으로 이동하는 경우에는 Detail을 닫는다.

```text
Task A Detail open
      ↓
Sidebar → Study
      ↓
Detail close
      ↓
Study View
```

구분:

```text
Task 자체 수정으로 현재 View에서 사라짐  → Detail 유지
사용자가 다른 View/List로 명시적 이동   → Detail 닫기
```

---

## 1.30 URL Policy

Task Detail state는 URL과 연결할 수 있는 구조로 설계한다.

예:

```text
/tasks/today
```

Task 클릭:

```text
/tasks/today/task/abc123
```

또는:

```text
/tasks/today?task=abc123
```

최종 URL 형식은 기존 앱 routing 규칙과 통합해 결정한다.

URL 반영 목적:

- Browser Back
- Deep link
- Refresh 후 Detail 복원
- 향후 Task link 공유

---

## 1.31 Browser Back

History에 Task 선택을 반영하는 경우:

```text
Today
 ↓
Task A
 ↓
Task B
```

Browser Back:

```text
Task B
 ↓
Task A
 ↓
Today
```

실제 TickTick 동작과 동일성을 최우선으로 할 경우, 구현 전 TickTick routing audit로 최종 검증한다.

---

## 1.32 Focus on Open

Task를 클릭해 Detail을 열었다고 Title input에 자동 focus하지 않는다.

```text
Task click
   ↓
Detail open
   ↓
read/view state
```

Title을 사용자가 직접 클릭해야 editing state로 전환한다.

---

## 1.33 Opening Motion

Open/close transition이 있다면 매우 짧고 비침투적으로 한다.

초기 권장:

```text
150–200ms 이하
```

Task A → Task B switching에는 Pane transition을 적용하지 않는다.

---

## 1.34 Reduced Motion

사용자 시스템 설정이 reduced motion이면 Detail open/close transition을 제거한다.

---

## 1.35 Component Architecture

초기 shell component:

```text
TaskDetail/
│
├── TaskDetailPane
├── TaskDetailPropertyHeader
├── TaskDetailContent
├── TaskDetailResizeHandle
└── TaskDetailCloseButton
```

후속 기능의 컴포넌트는 각 기능 장에서 별도로 설계한다.

예:

```text
DatePicker
PriorityMenu
Checklist
```

를 Shell component에 직접 혼합하지 않는다.

---

## 1.36 State Ownership

Task Detail이 Task data의 별도 복사본을 갖지 않는다.

금지:

```text
Task Store

+

TaskDetail {
   localTaskCopy
}
```

기본 구조:

```text
Task Store
    │
selectedTaskId
    ↓
Task Detail
```

Task Detail은 동일 Task entity를 표현하고 수정하는 View다.

---

## 1.37 Domain State vs UI State

Domain state와 UI state를 분리한다.

### Domain State

```text
title
date
priority
completed
description
...
```

### UI State

```text
selectedTaskId
detailWidth
activePopover
focusedField
isResizing
...
```

예:

```text
taskStore
uiStore
```

또는 동일 책임 분리를 보장하는 구조를 사용한다.

`detailWidth` 같은 UI preference를 Task entity에 저장하지 않는다.

---

## 1.38 Shell State Machine

```text
                   ┌─────────────┐
                   │   CLOSED    │
                   └──────┬──────┘
                          │ task click
                          ↓
                   ┌─────────────┐
            ┌──────│    OPEN     │───────┐
            │      └─────────────┘       │
            │                            │
   another task click                 close
            │                            │
            ↓                            ↓
      replace task                   CLOSED
            │
            └────────→ OPEN
```

Task switch는:

```text
OPEN(Task A)
→
OPEN(Task B)
```

로 처리한다.

---

## 1.39 Prohibited Patterns

다음 패턴은 사용하지 않는다.

- Task 클릭마다 새로운 Detail instance 생성
- Modal backdrop
- Outside click으로 Detail 닫기
- Detail 때문에 Main View interaction 차단
- Main View와 Detail이 하나의 scroll container 공유
- Task마다 Detail width 저장
- Detail 내부 Task data 별도 복제
- Task 전환마다 Pane animation
- Small screen에서도 3-column 강제
- 카드 UI 남발
- 불필요한 border/shadow 남발
- 임의의 고정 z-index 사용

---

## 1.40 Acceptance Criteria

### Opening

- [ ] Task 클릭으로 Detail이 열린다.
- [ ] Main View를 가리거나 block하지 않는다.
- [ ] Main View 상태가 유지된다.
- [ ] 선택 Task가 시각적으로 구분된다.
- [ ] Title이 자동 edit/focus 상태가 되지 않는다.

### Switching

- [ ] 다른 Task 클릭 시 같은 Pane의 내용만 교체된다.
- [ ] Pane close/reopen이 발생하지 않는다.
- [ ] 불필요한 loading/transition이 없다.

### Closing

- [ ] Close button으로 닫을 수 있다.
- [ ] Esc로 닫을 수 있다.
- [ ] 열린 Popover가 있으면 Esc는 Popover를 먼저 닫는다.
- [ ] Main View 빈 공간 클릭으로는 닫히지 않는다.

### Layout

- [ ] Desktop에서 right-side structural pane으로 동작한다.
- [ ] 기본/min/max width token을 가진다.
- [ ] Main View와 Detail scroll이 독립적이다.
- [ ] Property Header는 content scroll과 독립적으로 접근 가능하다.

### Resize

- [ ] 좌측 경계를 drag해 resize할 수 있다.
- [ ] 최소 폭 이하로 줄지 않는다.
- [ ] 최대 폭 이상으로 늘어나지 않는다.
- [ ] 사용자 width preference를 복원할 수 있다.

### Navigation

- [ ] Task 자체 수정으로 현재 View에서 사라져도 Detail은 유지된다.
- [ ] 명시적인 다른 View/List navigation 시 Detail은 닫힌다.
- [ ] 삭제된 Task의 Detail은 닫힌다.

### Responsive

- [ ] 좁은 Desktop 대응 전략이 있다.
- [ ] Small screen에서는 full-screen Detail로 전환할 수 있다.
- [ ] Back 시 기존 View/scroll 상태를 복원할 수 있다.

### Architecture

- [ ] `selectedTaskId`가 Detail 선택 상태의 single source of truth다.
- [ ] Task domain data와 Detail UI state가 분리되어 있다.
- [ ] Detail이 Task entity의 별도 복사본을 관리하지 않는다.

---

## 1.41 Shell Summary

```text
                     APP
                      │
       ┌──────────────┴───────────────┐
       │                              │
   MAIN VIEW                    TASK DETAIL
       │                              │
       │                        selectedTaskId
       │                              │
       └──────── SAME TASK STORE ─────┘
```

사용자 관점:

```text
Task 선택
   ↓
오른쪽에서 상세 확인

다른 Task 선택
   ↓
즉시 내용 교체

Task 수정
   ↓
Main과 Detail 즉시 동기화

다른 공간으로 명시적 이동
   ↓
Detail 종료
```

---

# 2. Task Data Model

## 2.1 Purpose

Task Detail의 모든 기능이 같은 Task entity를 읽고 수정하도록 canonical data model을 정의한다.

핵심 원칙:

```text
                    Task Entity
                        │
          ┌─────────────┼──────────────┐
          ↓             ↓              ↓
       Today          Detail        Calendar
          ↓             ↓              ↓
        List          Board          Search
```

View별 Task 사본을 만들지 않는다.

```text
❌ todayTasks
❌ calendarTasks
❌ detailTask
❌ boardTasks

✅ tasksById
```

---

## 2.2 Canonical Task Entity

권장 기본 모델:

```ts
type Task = {
  id: string;

  // Content
  title: string;
  description: string;
  contentMode: "description" | "checklist";

  // State
  status: "open" | "completed" | "wont_do";
  completedAt: string | null;

  // Scheduling
  schedule: TaskSchedule | null;

  // Priority
  priority: "none" | "low" | "medium" | "high";

  // Organization
  listId: string;
  sectionId: string | null;

  // Hierarchy
  parentTaskId: string | null;

  // Ordering
  sortKey: string;

  // Additional state
  isPinned: boolean;

  // System
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
```

---

## 2.3 Stable ID

Task ID는 영구적으로 변하지 않는 unique ID를 사용한다.

```text
✅ UUID / ULID / equivalent stable ID
❌ 화면 순번
❌ list 내 index
```

List 이동, 정렬, parent 변경과 관계없이 ID는 유지한다.

이는 다음 기능의 기반이다.

- Deep link
- Browser URL
- Task sharing
- Cross-view synchronization
- History / activity tracking

---

## 2.4 Title

Canonical field:

```ts
title: string;
```

`taskName`, `label`, `summary` 등 동일 의미의 중복 field를 만들지 않는다.

생성 중 임시 empty title은 허용할 수 있으나, 확정 규칙은 Title Editor 장에서 정의한다.

---

## 2.5 Task Status

완료 여부를 boolean 하나로만 표현하지 않는다.

```ts
type TaskStatus =
  | "open"
  | "completed"
  | "wont_do";
```

의미:

```text
open
→ 아직 수행 가능한 Task

completed
→ 수행 완료

wont_do
→ 의도적으로 수행하지 않기로 종료
```

완료 시:

```ts
status = "completed";
completedAt = <timestamp>;
```

미완료로 되돌리면:

```ts
status = "open";
completedAt = null;
```

---

## 2.6 Won't Do vs Delete

두 상태를 구분한다.

```text
Won't Do
→ Task는 존재
→ 수행하지 않기로 종료

Delete
→ Task를 삭제 상태로 이동
```

`wont_do`는 Task history의 일부이며 삭제와 동일 취급하지 않는다.

---

## 2.7 Soft Delete

Task 삭제는 기본적으로 soft delete를 사용한다.

```ts
deletedAt: string | null;
```

평상시:

```ts
deletedAt = null;
```

삭제:

```ts
deletedAt = <timestamp>;
```

Undo:

```ts
deletedAt = null;
```

이 구조는 향후 Undo / Trash 기능을 지원한다.

---

## 2.8 Priority

```ts
type TaskPriority =
  | "none"
  | "low"
  | "medium"
  | "high";
```

숫자 자체를 domain value로 사용하지 않는다.

```text
❌ 0 / 1 / 2 / 3

✅ none / low / medium / high
```

시각적 색·아이콘 매핑은 Visual System에서 정의한다.

---

## 2.9 Schedule Model

Task의 날짜/시간은 여러 독립 field를 무분별하게 두지 않고 Schedule object로 묶는다.

```ts
type TaskSchedule = {
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  timezone: string | null;
};
```

Task:

```ts
schedule: TaskSchedule | null;
```

날짜가 없는 Task:

```ts
schedule = null;
```

---

## 2.10 All-day Task

예:

```text
Apr 20
All Day
```

개념적으로:

```ts
schedule = {
  startAt: "2026-04-20",
  endAt: null,
  allDay: true,
  timezone: null
};
```

All-day 값은 timezone conversion 때문에 날짜가 앞뒤로 밀리지 않도록 date-only 의미를 보존해야 한다.

직렬화 세부 규칙은 Date · Time · Duration 장에서 확정한다.

---

## 2.11 Timed Task

예:

```text
Apr 20
9:30 PM – 10:30 PM
```

개념적으로:

```ts
schedule = {
  startAt: "2026-04-20T21:30:00",
  endAt: "2026-04-20T22:30:00",
  allDay: false,
  timezone: "Asia/Seoul"
};
```

---

## 2.12 Duration Is Derived

Duration을 canonical persisted field로 중복 저장하지 않는다.

```text
persist:
startAt
endAt

derive:
duration = endAt - startAt
```

따라서 기본적으로 다음 field는 저장하지 않는다.

```ts
durationMinutes
```

필요한 경우 UI에서 계산한다.

---

## 2.13 Multi-day Task

Multi-day 여부 역시 별도 boolean으로 저장하지 않는다.

```text
startAt
endAt
```

의 날짜 차이로 계산한다.

```text
❌ isMultiDay persisted
✅ derived from schedule
```

---

## 2.14 Content Mode

Task body가 현재 Description인지 Checklist인지 구분한다.

```ts
type TaskContentMode =
  | "description"
  | "checklist";
```

```text
contentMode = description
→ Description UI

contentMode = checklist
→ Checklist UI
```

전환 과정의 데이터 보존 규칙은 Checklist 장에서 정의한다.

---

## 2.15 Description

초기 canonical field:

```ts
description: string;
```

초기 구현은 plain text를 허용하되, 향후 Rich Text / Slash Command로 확장할 수 있도록 editor implementation과 domain model을 과도하게 결합하지 않는다.

특정 editor library의 proprietary JSON을 Task 전체의 필수 domain 구조로 고정하지 않는다.

---

## 2.16 Checklist Item

Checklist Item은 Subtask와 별개의 entity다.

```ts
type CheckItem = {
  id: string;
  taskId: string;

  text: string;

  checked: boolean;
  completedAt: string | null;

  sortKey: string;

  createdAt: string;
  updatedAt: string;
};
```

관계:

```text
Task
│
├── CheckItem
├── CheckItem
└── CheckItem
```

CheckItem을 Task 내부 배열 하나만으로 canonical source of truth로 관리하지 않는다.

---

## 2.17 Why CheckItem Is Separate

개별 item의 다음 연산을 독립적으로 처리할 수 있어야 한다.

- Complete
- Uncomplete
- Edit
- Delete
- Reorder
- Drag & Drop

예:

```text
☐ A
☐ B
☐ C

B drag
↓
B
A
C
```

Task 전체를 다시 기록하지 않고 B의 상태/정렬만 업데이트할 수 있다.

---

## 2.18 Description ↔ Checklist Conversion

Task는 description과 check items 데이터를 모두 수용할 수 있으나, 현재 표시되는 mode는 `contentMode`가 결정한다.

중요 invariant:

> Mode 전환으로 사용자 데이터가 조용히 유실되어서는 안 된다.

변환 정책은 Checklist 장에서 별도 확정한다.

---

## 2.19 Subtask Is a Task

Subtask 전용 간이 entity를 만들지 않는다.

```text
❌ Subtask {
  text
  completed
}
```

Subtask도 완전한 `Task` entity다.

구분은:

```ts
parentTaskId: string | null;
```

로 한다.

Root Task:

```ts
parentTaskId = null;
```

Subtask:

```ts
parentTaskId = "<parent-task-id>";
```

---

## 2.20 Parent / Child Hierarchy

예:

```text
Task A
│
├─ Task B
│   └─ Task C
│
└─ Task D
```

관계:

```text
A.parentTaskId = null
B.parentTaskId = A
C.parentTaskId = B
D.parentTaskId = A
```

Multi-level nesting을 동일 구조로 표현한다.

---

## 2.21 No Canonical `subtasks[]`

Task 안에 child ID 배열을 또 하나의 canonical 관계로 저장하지 않는다.

```text
❌
A.subtasks = [B, C]
B.parentTaskId = A
```

두 관계를 동시에 유지하면 불일치 가능성이 생긴다.

Canonical 관계:

```ts
parentTaskId
```

하나만 사용한다.

Children은 query/index로 가져온다.

---

## 2.22 Hierarchy Invariants

금지:

```text
A.parent = A
```

또한 cycle을 허용하지 않는다.

```text
A → B → C → A
```

Parent 변경 전에 ancestry validation이 필요하다.

---

## 2.23 List Membership

모든 Task는 정확히 하나의 List에 속한다.

```ts
listId: string;
```

List를 명시하지 않은 새 Task는 기본 List(예: Inbox)에 배치한다.

```text
listId = null
```

상태를 일반적인 Task에 허용하지 않는 것을 권장한다.

---

## 2.24 Subtask List Invariant

권장 규칙:

> Parent와 descendant는 동일 List에 속한다.

Parent를 다른 List로 이동하면 descendants도 함께 이동한다.

```text
Parent: Study → Work
Child:  Study → Work
```

Hierarchy와 List membership이 충돌하지 않도록 한다.

---

## 2.25 Tags

Task와 Tag는 many-to-many 관계다.

```ts
type Tag = {
  id: string;
  name: string;
};

type TaskTag = {
  taskId: string;
  tagId: string;
};
```

Task에 Tag name 문자열 배열을 canonical 데이터로 중복 저장하지 않는다.

---

## 2.26 Reminder

Task 하나는 여러 Reminder를 가질 수 있다.

```ts
type Reminder = {
  id: string;
  taskId: string;

  type: "relative" | "absolute";

  offsetMinutes: number | null;
  absoluteAt: string | null;

  enabled: boolean;

  createdAt: string;
};
```

예:

```text
30 minutes before
1 day before
```

각 Reminder를 독립 entity로 관리한다.

---

## 2.27 No `hasReminder`

다음과 같은 중복 boolean을 canonical field로 저장하지 않는다.

```ts
hasReminder: boolean;
```

Reminder 존재 여부는 Reminder relation에서 계산한다.

---

## 2.28 Recurrence

반복은 단순 문자열 하나로 제한하지 않는다.

```ts
type RecurrenceRule = {
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly";

  interval: number;

  byWeekday: number[] | null;
  byMonthDay: number[] | null;

  endMode:
    | "never"
    | "until"
    | "count";

  until: string | null;
  count: number | null;
};
```

가능하면 내부 의미는 iCalendar RRULE과 호환 가능한 방향으로 설계한다.

실제 occurrence 생성/완료 규칙은 Repeat / Recurrence 장에서 확정한다.

---

## 2.29 Ordering

Task 및 CheckItem 정렬은 대량 renumbering을 피할 수 있도록 rank key 방식 사용을 권장한다.

```ts
sortKey: string;
```

Fractional indexing / LexoRank 계열 전략을 사용할 수 있다.

정렬 scope:

Root Task:

```text
listId + parentTaskId=null
```

Subtask:

```text
same parentTaskId
```

별도의 `subtaskOrder` field는 두지 않는다.

---

## 2.30 Pin

향후 More Action의 Pin을 지원하기 위해:

```ts
isPinned: boolean;
```

을 둔다.

필요한 경우 이후:

```ts
pinnedAt: string | null;
```

로 확장할 수 있다.

---

## 2.31 System Timestamps

기본 시스템 field:

```ts
createdAt: string;
updatedAt: string;
deletedAt: string | null;
```

Task 수정 시 `updatedAt`을 갱신한다.

---

## 2.32 Derived State

다음 값은 기본적으로 canonical Task field로 저장하지 않는다.

```text
isOverdue
isToday
isTomorrow
durationMinutes
isMultiDay
isSubtask
subtaskDepth
subtaskCount
checklistProgress
hasReminder
displayDate
displayDateLabel
```

기존 canonical data에서 계산한다.

---

## 2.33 Entity Relationship Summary

```text
                         TASK
                           │
       ┌────────────┬──────┼───────┬────────────┐
       │            │      │       │            │
       ↓            ↓      ↓       ↓            ↓
   CheckItem     Reminder  Tag    Parent       List
                           ↑      Task
                           │
                        TaskTag
```

Subtask 관계:

```text
TASK
  │
  └── parentTaskId → TASK
```

---

## 2.34 Frontend Normalized Store

권장 개념 구조:

```ts
{
  tasksById: {},
  checkItemsById: {},
  remindersById: {},
  tagsById: {},
  listsById: {},

  selectedTaskId: null
}
```

View는 Task entity의 별도 복사본을 만들지 않는다.

---

## 2.35 Final Type Reference

```ts
type TaskStatus =
  | "open"
  | "completed"
  | "wont_do";

type TaskPriority =
  | "none"
  | "low"
  | "medium"
  | "high";

type TaskContentMode =
  | "description"
  | "checklist";

type TaskSchedule = {
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  timezone: string | null;
};

type Task = {
  id: string;

  title: string;
  description: string;
  contentMode: TaskContentMode;

  status: TaskStatus;
  completedAt: string | null;

  schedule: TaskSchedule | null;

  priority: TaskPriority;

  listId: string;
  sectionId: string | null;

  parentTaskId: string | null;

  sortKey: string;

  isPinned: boolean;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type CheckItem = {
  id: string;
  taskId: string;

  text: string;

  checked: boolean;
  completedAt: string | null;

  sortKey: string;

  createdAt: string;
  updatedAt: string;
};

type Reminder = {
  id: string;
  taskId: string;

  type: "relative" | "absolute";

  offsetMinutes: number | null;
  absoluteAt: string | null;

  enabled: boolean;
};

type RecurrenceRule = {
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly";

  interval: number;

  byWeekday: number[] | null;
  byMonthDay: number[] | null;

  endMode:
    | "never"
    | "until"
    | "count";

  until: string | null;
  count: number | null;
};
```

---

## 2.36 Data Model Invariants

다음은 구현 시 반드시 지켜야 한다.

- [ ] Task는 앱 전체에서 하나의 canonical entity를 사용한다.
- [ ] Subtask도 Task entity다.
- [ ] Parent/child의 canonical 관계는 `parentTaskId` 하나다.
- [ ] Checklist Item은 Subtask와 별개의 entity다.
- [ ] 모든 Task는 정확히 하나의 List에 속한다.
- [ ] Parent/descendant의 List membership은 일치한다.
- [ ] Schedule은 `startAt + endAt + allDay + timezone`으로 표현한다.
- [ ] Duration/Multi-day/Overdue 등 계산 가능한 값은 derived state로 둔다.
- [ ] Delete와 Won't Do를 구분한다.
- [ ] Reminder는 복수 entity를 지원한다.
- [ ] hierarchy cycle을 허용하지 않는다.
- [ ] View가 Task data의 별도 사본을 source of truth로 만들지 않는다.

---

# 3. Task Selection & Navigation

## 3.1 Purpose

Task selection은 단순한 row highlight가 아니라 다음 네 가지를 하나로 연결하는 시스템이다.

```text
현재 View
   │
   ↓
selectedTaskId
   │
   ├── Main View selected row
   ├── Task Detail content
   ├── URL
   └── Browser history
```

핵심 invariant:

> 현재 Detail에 표시되는 Task와 현재 `selectedTaskId`는 항상 동일하다.

---

## 3.2 Selection Source of Truth

선택 상태는 하나만 둔다.

```ts
selectedTaskId: string | null;
```

다음과 같은 View별 selected state를 canonical source로 만들지 않는다.

```text
❌ selectedListTaskId
❌ selectedCalendarTaskId
❌ selectedBoardTaskId
❌ detailTaskId
```

모든 View는 동일한 `selectedTaskId`를 참조한다.

---

## 3.3 Default State

Task가 선택되지 않은 상태:

```ts
selectedTaskId = null;
```

Task B를 선택하면:

```ts
selectedTaskId = "task-b";
```

Main View와 Detail은 동일 Task를 가리킨다.

---

## 3.4 Single-click Selection

Desktop에서는 Task row의 neutral area를 single click하면 Detail을 연다.

```text
Task row click
   ↓
selectTask(taskId)
   ↓
selectedTaskId update
   ↓
Detail open/update
```

Double click을 Detail open의 기본 조건으로 사용하지 않는다.

---

## 3.5 Row Interaction Zones

Task row 전체 click을 같은 action으로 처리하지 않는다.

```text
┌──────────────────────────────────────┐
│ □  Task title            Apr 20   ⚑ │
└──────────────────────────────────────┘
```

영역별 기본 의미:

```text
Checkbox
→ Complete toggle

Date
→ Date UI

Priority
→ Priority UI

More
→ Context / More menu

Title / neutral row surface
→ Task select + Detail open
```

Interactive child control의 click은 row selection으로 bubbling시키지 않는다.

---

## 3.6 Checkbox Click

선택되지 않은 Task의 checkbox를 클릭하면 완료 상태만 변경한다.

```text
□ Task A
  ↓ checkbox click
✓ Task A

Detail open ❌
```

이미 해당 Task Detail이 열린 상태라면 완료 상태는 동일 Task entity를 통해 즉시 Detail에도 반영한다.

---

## 3.7 Inline Property Actions

Date / Priority / More 등 inline property action도 row selection과 분리한다.

```text
property control click
→ 해당 action 실행
→ selectedTaskId 변경하지 않음
```

이미 같은 Task가 selected 상태라면 selection은 유지한다.

---

## 3.8 Re-click Selected Task

이미 Task B가 selected 상태일 때 Task B row를 다시 클릭해도 Detail을 닫지 않는다.

```text
Task B click
→ OPEN(B)

Task B click again
→ still OPEN(B)
```

Selection은 toggle이 아니다.

Detail close는 명시적 action으로만 한다.

---

## 3.9 Switch to Another Task

Task A가 selected 상태에서 Task B를 클릭하면:

```text
selectedTaskId
A → B
```

같은 Detail Pane에서 Task 내용만 교체한다.

Pane close/reopen transition을 발생시키지 않는다.

---

## 3.10 Selection vs Focus vs Editing

세 상태를 구분한다.

```text
Selected Task
≠
Keyboard Focus
≠
Editing Field
```

예:

```ts
selectedTaskId
focusedTaskId
editingField
```

을 동일 개념으로 취급하지 않는다.

---

## 3.11 Focus on Detail Open

Task를 선택해 Detail을 열었다고 Title이나 Description에 자동 focus하지 않는다.

```text
Task click
   ↓
Detail open
   ↓
view/read state
```

사용자가 직접 field를 클릭해야 editing state로 진입한다.

---

## 3.12 Keyboard Row Navigation

Task list가 keyboard navigation을 지원할 경우:

```text
Arrow Up / Down
→ row focus 이동

Enter
→ focused Task 선택 + Detail open
```

Arrow만 눌렀다고 Detail이 계속 변경되는 방식은 기본값으로 사용하지 않는다.

---

## 3.13 Escape Priority

Esc는 전역 우선순위를 따른다.

```text
1. Popover / Menu
2. Context Menu
3. Editor temporary state
4. Task Detail
```

예:

```text
Priority Popover open
↓ Esc
Priority Popover close

↓ Esc
Task Detail close
```

---

## 3.14 Close Button

Close button 실행 시:

```ts
selectedTaskId = null;
```

다음 상태는 유지한다.

- Current View
- Filter
- Sort
- Group
- Scroll position
- Sidebar state

---

## 3.15 Focus Restoration After Close

가능한 경우 Detail을 닫은 후 keyboard focus를 방금 선택했던 Task row 또는 안정적인 Main View anchor로 복원한다.

목적:

> 사용자가 목록 탐색을 즉시 이어갈 수 있어야 한다.

---

## 3.16 Primary View Navigation

사용자가 Sidebar/Rail을 통해 다른 primary View/List로 명시적으로 이동하면 Detail selection을 종료한다.

예:

```text
Today + Task A Detail
   ↓ Sidebar → Inbox
Inbox
selectedTaskId = null
```

적용 예:

```text
Today → Inbox
List A → List B
Tasks → Calendar
Tasks → Search
```

정확한 route 범위는 전체 App Shell routing 규칙에 맞춘다.

---

## 3.17 Filter Change

같은 View 안에서 filter가 변경되어 selected Task가 결과에서 사라져도 Detail을 유지한다.

```text
selectedTaskId = A

Filter change
A no longer visible

Detail A remains open
```

Filter change는 primary navigation과 구분한다.

---

## 3.18 Sort / Group Change

Sort 또는 Group 변경으로 selected Task의 화면 위치가 바뀌어도 selection은 유지한다.

```text
Manual → Date sort
Group by List → Group by Date
```

Task의 위치만 변경하고 `selectedTaskId`는 유지한다.

---

## 3.19 Task Leaves Current Query by Editing

Detail에서 Task의 property를 수정해 현재 query에서 빠져도 Detail을 닫지 않는다.

예:

```text
Today
Task A selected
date = Today

Detail에서 date → Tomorrow
```

결과:

```text
Main View: Task A 제거
Detail: Task A 유지
```

---

## 3.20 Completion Removes Row

현재 View가 completed task를 숨기는 경우 Task 완료 후 Main View에서 row가 사라질 수 있다.

이 경우에도 기본적으로 Detail은 유지한다.

```text
Main View
Task A disappears

Detail
✓ Task A
still open
```

삭제와 완료를 동일하게 처리하지 않는다.

---

## 3.21 Delete Is Different

삭제 시에는 selection을 종료한다.

```text
Task A selected
↓ Delete
deletedAt = timestamp
selectedTaskId = null
Detail close
```

---

## 3.22 Won't Do

`wont_do`는 Task entity가 존재하는 상태이므로 기본적으로 Detail을 유지한다.

현재 query에서 row가 제거될 수 있어도 selection을 강제로 종료하지 않는다.

---

## 3.23 Subtask Selection

Detail 내부 Subtask를 클릭하면 해당 Subtask 자체를 selected Task로 전환한다.

```text
Parent Detail

Subtasks
☐ Child A
☐ Child B

Child A click
↓
selectedTaskId = Child A
```

같은 Detail Pane을 사용한다.

---

## 3.24 Parent Navigation

Subtask Detail에서는 상위 Task로 이동할 수 있는 affordance를 제공한다.

UI는 Subtask 장에서 확정하되 navigation semantics는:

```ts
selectTask(parentTaskId);
```

이다.

새 Modal이나 별도 Detail Pane을 만들지 않는다.

---

## 3.25 Deep Hierarchy

예:

```text
A
└─ B
   └─ C
      └─ D
```

D까지 이동해도 Detail Pane DOM stack을 중첩 생성하지 않는다.

Canonical state:

```ts
selectedTaskId = "D";
```

Task navigation history는 URL/browser history와 통합 가능하다.

---

## 3.26 URL Principle

Task Detail은 가능한 경우 URL에 반영한다.

예:

```text
/tasks/today
```

Task A:

```text
/tasks/today/task/A
```

Task B:

```text
/tasks/today/task/B
```

정확한 path syntax는 기존 Router 규칙과 통합해 결정한다.

---

## 3.27 Preserve View Context in URL

Task URL은 Task뿐 아니라 어떤 View에서 열었는지도 보존한다.

예:

```text
/tasks/today/task/A
```

의 의미:

```text
context = Today
selectedTask = A
```

List라면:

```text
/tasks/list/:listId/task/:taskId
```

와 같은 개념을 사용한다.

---

## 3.28 Browser Back / Forward

예:

```text
Today
↓
Task A
↓
Task B
```

Back:

```text
Task B → Task A
```

다시 Back:

```text
Task A → Today(no Detail)
```

Forward는 반대로 복원한다.

---

## 3.29 Close and URL

Detail close는 UI state만 null로 만들고 URL을 그대로 두지 않는다.

예:

```text
/tasks/today/task/A
↓ close
/tasks/today
```

URL과 Detail state를 일치시킨다.

---

## 3.30 Refresh Restoration

다음 URL에서 refresh:

```text
/tasks/today/task/A
```

하면:

```text
Today View
+
Task A Detail
```

을 복원한다.

URL이 selection 복원의 우선 source다.

---

## 3.31 Missing / Unavailable Task

URL의 Task가 존재하지 않거나 접근 불가능한 경우 무한 loading으로 남지 않는다.

안전한 unavailable state를 보여준 뒤 base View로 돌아갈 수 있어야 한다.

구체 UX는 Edge Cases & Error Handling 장에서 정의한다.

---

## 3.32 Search / Calendar / Board

Search result, Calendar item, Board card도 동일한 selection system을 사용한다.

```text
click item/card
→ selectedTaskId
→ same Task Detail
```

View별 Detail 구현을 따로 만들지 않는다.

---

## 3.33 Selected Task May Be Invisible

다음 상태는 유효하다.

```text
selectedTaskId = A

현재 Main query에는 A가 보이지 않음
```

따라서:

```text
selectedTaskId must be visible in Main View
```

같은 invariant를 만들지 않는다.

---

## 3.34 Selection Persistence

Refresh 시:

```text
URL에 taskId 존재
→ selection 복원

URL에 taskId 없음
→ selectedTaskId = null
```

이전 세션의 stale local selected Task만으로 Detail을 자동 재오픈하지 않는다.

---

## 3.35 Selection Command API

선택 로직은 컴포넌트마다 직접 작성하지 않는다.

개념적 command:

```ts
selectTask(taskId, context?)
closeTaskDetail()
```

`selectTask()`의 책임:

```text
1. Task 존재 확인
2. selectedTaskId 갱신
3. Detail state 갱신
4. URL 갱신
5. history 처리
```

---

## 3.36 View Navigation Command

Primary View 이동도 공통 navigation layer를 통해 처리한다.

예:

```ts
navigateToView(view);
```

이 command가 필요에 따라:

```text
selectedTaskId clear
```

를 일관되게 수행한다.

Sidebar item마다 제각각 selection state를 직접 조작하지 않는다.

---

## 3.37 Event Propagation

Task row:

```text
Row
├ Checkbox
├ Title
├ Date
├ Tag
├ Priority
└ More
```

Neutral surface:

```text
→ selectTask()
```

Child interactive control:

```text
→ 자체 action
→ row selection propagation 차단
```

---

## 3.38 Drag vs Click

Drag threshold를 넘긴 pointer interaction은 click selection으로 처리하지 않는다.

```text
pointer down
↓
drag threshold exceeded
↓
drag operation
↓
selectTask() ❌
```

---

## 3.39 Context Menu

Right click은 기본적으로 context menu만 연다.

```text
right click
→ context menu
→ selectedTaskId unchanged
```

Context menu target은 selection과 분리한다.

```ts
contextTargetTaskId
```

는 `selectedTaskId`와 다를 수 있다.

---

## 3.40 Future Multi-select

향후 multi-select를 지원할 경우에도 single Detail selection과 분리한다.

```ts
selectedTaskId: string | null;
multiSelectedTaskIds: string[];
```

Task Detail은 기본적으로 `selectedTaskId` 하나를 대상으로 한다.

---

## 3.41 Selection UI State Model

개념적 UI state:

```ts
type TaskSelectionUIState = {
  selectedTaskId: string | null;
  focusedTaskId: string | null;
  contextTargetTaskId: string | null;
  multiSelectedTaskIds?: string[];
};
```

모든 field를 즉시 구현할 필요는 없지만 역할을 혼합하지 않는다.

---

## 3.42 State Transition Summary

```text
CLOSED
  │
  │ neutral row click
  ↓
OPEN(A)
  │
  ├── Task B click ───────→ OPEN(B)
  ├── A checkbox ─────────→ OPEN(A), status update
  ├── A date change ──────→ OPEN(A), schedule update
  ├── filter removes A ───→ OPEN(A)
  ├── complete removes A ─→ OPEN(A)
  ├── won't do ───────────→ OPEN(A)
  ├── delete ─────────────→ CLOSED
  ├── primary navigation ─→ CLOSED
  ├── Close button ───────→ CLOSED
  └── Esc ────────────────→ CLOSED
```

---

## 3.43 Prohibited Patterns

- Checkbox 클릭으로 Detail 자동 open
- Selected row 재클릭으로 Detail toggle close
- Arrow focus 이동만으로 Detail 계속 변경
- Filter 변경만으로 Detail 강제 close
- 완료되어 row가 사라졌다고 Detail 자동 close
- Subtask마다 새로운 Detail DOM stack 생성
- Calendar/List/Board별 별도 selected Task source
- URL과 `selectedTaskId` 불일치
- Context-menu target과 selected Task를 무조건 동일 취급
- Drag 시작을 row click으로 처리

---

## 3.44 Acceptance Criteria

### Basic Selection

- [ ] Neutral Task row 클릭 시 해당 Task가 selected된다.
- [ ] Detail이 같은 Task를 표시한다.
- [ ] Selected Task 재클릭으로 Detail이 닫히지 않는다.
- [ ] 다른 Task 클릭 시 같은 Pane에서 Task만 교체된다.

### Child Controls

- [ ] Checkbox click은 Detail을 자동 open하지 않는다.
- [ ] Date click은 row selection을 유발하지 않는다.
- [ ] Priority click은 row selection을 유발하지 않는다.
- [ ] More menu click은 row selection을 유발하지 않는다.
- [ ] Drag operation은 click selection으로 처리되지 않는다.

### Close

- [ ] Close button으로 selection을 해제한다.
- [ ] Esc로 Detail을 닫는다.
- [ ] Popover가 열려 있으면 Esc는 Popover를 우선 닫는다.
- [ ] Close 후 Main View context가 유지된다.

### Query Changes

- [ ] Sort 변경 후 selection이 유지된다.
- [ ] Group 변경 후 selection이 유지된다.
- [ ] Filter로 selected Task가 숨겨져도 Detail은 유지된다.
- [ ] Task 자체 수정으로 query에서 빠져도 Detail은 유지된다.
- [ ] 완료로 query에서 사라져도 Detail은 유지된다.
- [ ] Delete 시 Detail은 닫힌다.

### Navigation

- [ ] 다른 primary View/List로 명시적 이동 시 Detail은 닫힌다.
- [ ] Subtask click 시 같은 Detail에서 해당 Subtask로 전환된다.
- [ ] Parent Task로 다시 이동할 수 있다.
- [ ] Calendar/Board/Search가 같은 selection system을 사용한다.

### URL

- [ ] Selected Task가 URL에 표현된다.
- [ ] Close 시 base View URL로 돌아간다.
- [ ] Refresh 후 selected Task를 복원한다.
- [ ] Browser Back/Forward가 selection을 복원한다.
- [ ] Missing Task URL을 안전하게 처리한다.

### Architecture

- [ ] `selectedTaskId`가 single source of truth다.
- [ ] Focus state와 Selection state가 분리된다.
- [ ] Context-menu target과 Selected Task가 분리될 수 있다.
- [ ] View별 별도 selected Task source를 만들지 않는다.
- [ ] Selection/navigation 로직이 공통 command layer에 모인다.

---

# 4. Completion & Status

## 4.1 Purpose

Task의 상태는 세 가지 canonical state로 관리한다.

```text
OPEN
  │
  ├── Complete ─────→ COMPLETED
  └── Won't Do ─────→ WONT_DO

COMPLETED
  └── Reopen ───────→ OPEN

WONT_DO
  └── Reopen ───────→ OPEN
```

데이터:

```ts
status:
  | "open"
  | "completed"
  | "wont_do";

completedAt: string | null;
```

---

## 4.2 Complete Control

Task Detail 상단 좌측과 Main View Task Row의 checkbox는 같은 Task status를 조작한다.

```text
Detail
□ │ Date / Time │ Priority

Main
□ Task title
```

Detail용 별도 완료 상태를 만들지 않는다.

---

## 4.3 Open State

```ts
status = "open";
completedAt = null;
```

Visual:

```text
□
```

---

## 4.4 Hover Preview

미완료 checkbox hover 시 완료 가능성을 preview할 수 있다.

```text
□
↓ hover
✓ preview
```

Hover는 visual state이며 domain state를 변경하지 않는다.

---

## 4.5 Complete Action

Complete action:

```ts
updateTask(taskId, {
  status: "completed",
  completedAt: now
});
```

UI는 optimistic update한다.

```text
click
↓
✓ 즉시 표시
↓
store update
↓
persistence
```

---

## 4.6 Completed State

```ts
status = "completed";
completedAt = <timestamp>;
```

Completed styling은 UI에서 표현하며 title 문자열 자체를 변형해 저장하지 않는다.

---

## 4.7 Reopen

완료 Task를 다시 열면:

```ts
status = "open";
completedAt = null;
```

기존 `completedAt`을 현재 Task field에 유지하지 않는다.

---

## 4.8 Detail에서 완료

Detail에서 Task를 완료해도 Detail은 기본적으로 닫지 않는다.

```text
Complete
→ Detail 유지
```

---

## 4.9 Main View에서 완료

선택되지 않은 Task의 checkbox를 Main View에서 클릭하면 완료만 실행한다.

```text
□ Task A
↓
✓ Task A
```

Detail은 자동으로 열지 않는다.

---

## 4.10 Query에서 Row가 사라지는 경우

Completed Task를 숨기는 View라면 완료 후 Main View에서 row가 제거될 수 있다.

이미 Detail이 열려 있다면 Detail은 유지한다.

---

## 4.11 Removal Feedback

완료 직후 row가 사라지는 View에서는 짧은 완료 feedback 또는 Undo feedback을 제공할 수 있다.

정확한 timing은 TickTick 실측값이 있으면 해당 값으로 조정한다.

긴 animation/delay는 사용하지 않는다.

---

## 4.12 Undo

Complete action은 Undo 가능하게 한다.

```text
Task completed                     Undo
```

Undo:

```ts
status = "open";
completedAt = null;
```

UI뿐 아니라 Store/Persistence/View 전체를 복구한다.

---

## 4.13 Mutation-specific Undo

Undo는 특정 mutation을 가리켜야 한다.

개념 예:

```ts
{
  action: "complete-task",
  taskId: "task-a",
  previousStatus: "open"
}
```

---

## 4.14 Persistence Failure

Optimistic complete 후 저장에 실패하면:

```text
completed UI
↓ save failure
rollback
↓
open UI
```

Error feedback을 함께 제공한다.

---

## 4.15 Won't Do

Won't Do는 기본 checkbox click과 분리된 action으로 제공한다.

예:

```text
More Menu
→ Won't Do
```

Domain:

```ts
updateTask(taskId, {
  status: "wont_do",
  completedAt: null
});
```

---

## 4.16 Won't Do ≠ Completed

다음 구조를 사용하지 않는다.

```ts
status = "completed";
wontDo = true;
```

Canonical state 하나로 표현한다.

```ts
status = "wont_do";
```

---

## 4.17 Won't Do Visual

Completed와 Won't Do는 사용자가 구분할 수 있어야 한다.

예시 의미:

```text
Completed
✓ Task A

Won't Do
– Task A
```

정확한 icon/color는 Visual System에서 확정한다.

---

## 4.18 Reopen from Won't Do

```text
wont_do
↓ Reopen
open
```

Domain:

```ts
status = "open";
completedAt = null;
```

---

## 4.19 Delete와 상태 변경 분리

```text
Complete
→ Task 유지

Won't Do
→ Task 유지

Delete
→ deletedAt 설정
```

Delete만 기본적으로 Detail selection을 종료한다.

---

## 4.20 Parent Completion

Parent Task를 완료해도 Child Task 상태를 자동 완료하지 않는다.

```text
✓ Parent
├─ □ Child A
└─ □ Child B
```

Parent와 Child는 각각 독립적인 Task entity다.

---

## 4.21 Child Completion Does Not Auto-complete Parent

모든 Child가 완료되어도 Parent를 자동 완료하지 않는다.

```text
✓ Child A
✓ Child B

Parent status 자동 변경 ❌
```

Parent 완료는 별도 사용자 action이다.

---

## 4.22 Subtask Progress

Parent UI는 child 상태에서 derived progress를 표시할 수 있다.

예:

```text
2 / 3 subtasks
66%
```

`subtaskProgress`는 canonical Task field로 저장하지 않는다.

---

## 4.23 Checklist Completion Independence

모든 CheckItem이 완료되어도 Task 자체를 자동 완료하지 않는다.

```text
Checklist completion
≠
Task completion
```

---

## 4.24 Task Completion Does Not Modify CheckItems

Task를 완료해도 미완료 CheckItem을 자동 체크하지 않는다.

```text
✓ Task

☑ Item A
☐ Item B
☐ Item C
```

유효한 상태다.

---

## 4.25 Completed Task Remains Editable

Completed Task를 read-only로 잠그지 않는다.

사용자는 완료 후에도 필요에 따라 다음을 확인/수정할 수 있다.

- Title
- Description
- Date
- Tags
- Subtasks
- Other properties

```text
completed
≠
locked
```

---

## 4.26 Won't Do Task Remains Editable

Won't Do 역시 immutable/archive object가 아니다.

Task entity가 존재하므로 기본적으로 편집 가능하다.

---

## 4.27 Completion Timestamp

Task를 다시 열었다가 재완료하면 현재 `completedAt`은 가장 최근 완료 시각을 기록한다.

과거 완료/재오픈 이력은 향후 Activity Log로 관리한다.

---

## 4.28 Activity History Preparation

Task entity에 completion history 배열을 누적하지 않는다.

향후 별도 `TaskActivity` 이벤트 시스템으로 확장할 수 있다.

예:

```text
Task completed
Task reopened
Task moved
Priority changed
```

---

## 4.29 Keyboard Completion

Keyboard shortcut으로 Complete를 실행하더라도 checkbox click과 동일한 command semantics를 사용한다.

정확한 shortcut key는 Keyboard & Focus System에서 확정한다.

---

## 4.30 More Menu Status Actions

### Open

```text
Complete
Won't Do
Delete
```

### Completed

```text
Reopen
Won't Do
Delete
```

### Won't Do

```text
Reopen
Complete
Delete
```

현재 상태에서 의미 없는 중복 action은 피한다.

---

## 4.31 Status Command Layer

컴포넌트가 직접 Task status를 변경하지 않는다.

개념적 command:

```ts
completeTask(taskId)
reopenTask(taskId)
markTaskWontDo(taskId)
```

Command 책임:

```text
Domain mutation
Optimistic Store update
Persistence
Undo registration
Failure rollback
```

---

## 4.32 State Machine

```text
                complete
        ┌──────────────────────┐
        │                      ↓
     ┌──────┐             ┌───────────┐
     │ OPEN │             │ COMPLETED │
     └──────┘             └───────────┘
        ↑  │                   │
        │  │ wont do           │ reopen
        │  ↓                   │
        │ ┌─────────┐          │
        └─│ WONT_DO │←─────────┘
          └─────────┘
             │
             └── reopen → OPEN
```

---

## 4.33 Cross-view Synchronization

Status mutation은 동일 Task entity를 통해 다음 View에 반영된다.

```text
completeTask(A)
  ├─ Today
  ├─ List
  ├─ Calendar
  ├─ Board
  ├─ Search
  └─ Detail
```

View별 complete state를 따로 관리하지 않는다.

---

## 4.34 Sidebar / Smart-list Count

Today, Inbox 등 count가 active/open task를 기준으로 계산된다면 status 변경 후 derived count도 자동 갱신되어야 한다.

Counter를 컴포넌트에서 수동 `-1/+1`하지 않는다.

---

## 4.35 Completion Motion

Completion feedback은 짧고 방해가 적어야 한다.

허용:

- checkbox transition
- title completed styling
- 짧은 row removal transition

지양:

- 큰 celebration animation
- 긴 delay
- 연속 완료를 방해하는 motion

---

## 4.36 Reduced Motion

Reduced Motion 설정에서는 completion animation을 최소화/제거한다.

상태 변화 자체는 여전히 명확해야 한다.

---

## 4.37 Rapid Toggle Safety

빠른 연속 상태 변경에서 늦게 도착한 오래된 persistence response가 최신 상태를 덮어쓰지 않아야 한다.

```text
request #1 complete
request #2 reopen

latest mutation = #2
```

Mutation ordering/versioning 전략이 필요하다.

---

## 4.38 Local-first / Offline Consideration

네트워크 latency가 Complete UX를 막지 않는다.

```text
User action
→ immediate local state
→ persistence/sync
```

오프라인 지원 시 sync queue로 확장 가능하다.

---

## 4.39 Prohibited Patterns

- `completed` boolean과 `status`를 동시에 canonical state로 사용
- Complete와 Delete를 같은 처리로 취급
- Parent 완료 시 모든 Subtask 강제 완료
- Child 전체 완료 시 Parent 자동 완료
- CheckItem 전체 완료 시 Task 자동 완료
- Task 완료 시 모든 CheckItem 자동 체크
- Completed Task를 무조건 read-only 처리
- 서버 응답 후에야 checkbox UI 변경
- Undo가 UI만 복구하고 persistence는 복구하지 않음
- 완료로 query에서 사라졌다고 Detail 자동 close
- View별 별도 completion state 관리

---

## 4.40 Acceptance Criteria

### Complete

- [ ] Open Task를 Complete할 수 있다.
- [ ] `completedAt`이 기록된다.
- [ ] UI가 optimistic하게 즉시 변경된다.
- [ ] Main과 Detail이 같은 상태를 표시한다.
- [ ] 완료로 Main View에서 사라져도 열린 Detail은 유지된다.

### Reopen

- [ ] Completed Task를 Open으로 되돌릴 수 있다.
- [ ] `completedAt`이 `null`로 복원된다.
- [ ] 모든 View가 즉시 갱신된다.

### Won't Do

- [ ] Open Task를 Won't Do로 변경할 수 있다.
- [ ] Completed와 데이터/시각적으로 구분된다.
- [ ] 다시 Open으로 돌릴 수 있다.
- [ ] Won't Do는 Delete로 처리되지 않는다.

### Hierarchy

- [ ] Parent 완료가 Child를 자동 완료하지 않는다.
- [ ] Child 전체 완료가 Parent를 자동 완료하지 않는다.
- [ ] Checklist 완료와 Task 완료가 독립적이다.
- [ ] Subtask/Checklist progress는 derived state로 계산할 수 있다.

### Undo / Error

- [ ] Complete 후 Undo할 수 있다.
- [ ] Undo가 Domain/Store/Persistence 전체를 복구한다.
- [ ] Save 실패 시 optimistic state를 rollback한다.
- [ ] 빠른 연속 toggle에서 최신 mutation이 승리한다.

### Synchronization

- [ ] Today/List/Calendar/Board/Search/Detail이 같은 `status`를 읽는다.
- [ ] 관련 smart-list/count가 상태 변경을 반영한다.
- [ ] View별 별도 complete state를 만들지 않는다.

---

# 5. Date · Time · Duration

## 5.1 Purpose

Task Detail 상단의 Date 영역은 단순한 `dueDate` 입력이 아니라 다음 기능을 하나의 scheduling system으로 제공한다.

```text
Date
├─ No Date
├─ Today
├─ Tomorrow
├─ Specific Date
├─ All Day
├─ Start Time
├─ End Time
├─ Duration
├─ Multi-day
└─ Timezone
```

Canonical data는 2장에서 확정한 `TaskSchedule`을 사용한다.

```ts
type TaskSchedule = {
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  timezone: string | null;
};
```

핵심 원칙:

> UI에서 보이는 Date / Time / Duration은 모두 하나의 `schedule`을 편집한다.

---

## 5.2 Date Property 위치

Task Detail의 Property Header 중앙 영역을 Date trigger로 사용한다.

예:

```text
□ │ Apr 20, 9:30 PM - 10:30 PM │ ⚑
```

Date가 없는 경우:

```text
□ │ Add date │ ⚑
```

또는 최종 Visual System에서 정한 muted placeholder를 사용한다.

Date 영역 자체는 클릭 가능한 하나의 property trigger다.

---

## 5.3 Display State

Date trigger는 schedule 상태에 따라 다른 label을 보여준다.

### No Date

```text
Add date
```

### All-day single date

```text
Apr 20
```

### Timed single date

```text
Apr 20, 9:30 PM
```

### Timed duration

```text
Apr 20, 9:30 PM - 10:30 PM
```

### Multi-day timed

```text
Apr 20, 9:30 PM - Apr 22, 6:00 PM
```

### Multi-day all-day

```text
Apr 20 - Apr 22
```

좁은 Pane에서는 label을 축약할 수 있으나 의미를 잃지 않는다.

---

## 5.4 Relative Date Labels

현재 날짜와 가까운 날짜는 Visual System에서 다음과 같은 relative label을 사용할 수 있다.

예:

```text
Today, 9:30 PM
Tomorrow
Mon, Apr 20
```

하지만 domain에는 `Today`, `Tomorrow` 문자열을 저장하지 않는다.

항상 absolute schedule로 저장한다.

```text
UI: Today
Data: 2026-08-23
```

---

## 5.5 Date Trigger Click

Date trigger click:

```text
Date trigger
   ↓
Schedule Popover open
```

Popover는 Detail 위의 floating surface다.

기본 구조:

```text
┌────────────────────────────┐
│ Quick dates                │
│ Today Tomorrow Next week   │
├────────────────────────────┤
│        Calendar            │
├────────────────────────────┤
│ All-day                    │
│ Start time                 │
│ End time / Duration        │
├────────────────────────────┤
│ Reminder                   │
│ Repeat                     │
├────────────────────────────┤
│ Clear date                 │
└────────────────────────────┘
```

Reminder / Repeat의 실제 기능은 6, 7장에서 설계한다.

---

## 5.6 Popover Open State

Popover state는 Task domain과 분리한다.

예:

```ts
activePopover = {
  type: "schedule",
  taskId: "task-a"
};
```

Date Popover를 열었다고 Task schedule이 즉시 변경되지는 않는다.

실제 date/time selection이 발생할 때 mutation을 수행한다.

---

## 5.7 Quick Date Options

기본 Quick Date:

```text
Today
Tomorrow
Next week
```

추가 quick option은 전체 UX에 맞게 확장 가능하다.

예:

```text
This weekend
Next Monday
```

단 quick option은 결국 absolute date로 변환한다.

---

## 5.8 Today

Today 선택 시, 현재 Task에 날짜가 없으면 기본적으로 all-day Task로 생성한다.

```ts
schedule = {
  startAt: "<today YYYY-MM-DD>",
  endAt: null,
  allDay: true,
  timezone: null
};
```

기존 timed Task에서 Today를 선택하는 경우에는 기존 time-of-day를 보존하는 것을 기본으로 한다.

예:

```text
Before
Apr 20, 9:30 PM - 10:30 PM

Today click

After
Today, 9:30 PM - 10:30 PM
```

즉 날짜만 바꾸는 action은 기존 time을 가능한 한 보존한다.

---

## 5.9 Tomorrow / Specific Date

Tomorrow 또는 Calendar의 특정 날짜를 선택할 때도 동일한 보존 규칙을 적용한다.

### Existing all-day task

```text
date만 교체
```

### Existing timed task

```text
date 교체
time 유지
duration 유지
```

예:

```text
Apr 20 09:30 - 10:30
↓ Apr 24 선택
Apr 24 09:30 - 10:30
```

---

## 5.10 Calendar Selection

Calendar는 single-date selection을 기본으로 한다.

```text
click date
→ start date 변경
```

Multi-day 범위 선택은 별도의 explicit range/duration interaction을 통해 지원한다.

단순 click/drag가 accidental multi-day를 만들지 않게 한다.

---

## 5.11 No Date / Clear Date

Date 제거 action을 제공한다.

```text
Clear date
```

실행:

```ts
schedule = null;
```

Date 제거 시 다음도 함께 영향을 받는다.

```text
startAt 제거
endAt 제거
allDay 제거
timezone 제거
```

Reminder/Repeat가 schedule에 의존하는 경우 어떻게 처리할지는 6, 7장에서 세부 규칙을 확정한다.

---

## 5.12 All-day Toggle

All-day toggle:

```text
All-day OFF
→ timed task

All-day ON
→ date-only task
```

All-day 전환은 사용자에게 예측 가능하게 동작해야 한다.

---

## 5.13 Timed → All-day

예:

```text
Apr 20, 9:30 PM - 10:30 PM
```

All-day ON:

```text
Apr 20
```

Domain:

```ts
{
  startAt: "2026-04-20",
  endAt: null,
  allDay: true,
  timezone: null
}
```

시간 값은 active schedule에서는 제거한다.

향후 OFF로 되돌릴 때 이전 시간을 복원할지는 UI draft state로 별도 보존할 수 있으나 canonical Task schedule에 숨은 stale time을 남기지 않는다.

---

## 5.14 All-day → Timed

All-day OFF 시 time이 필요하다.

기본 정책:

```text
start time = user preference 또는 sensible default
end time   = null
```

권장 기본값 예:

```text
Start: 9:00 AM
```

정확한 default time은 앱의 global preference가 있으면 그것을 사용한다.

앱 전체에서 임의로 서로 다른 default time을 만들지 않는다.

---

## 5.15 Start Time

Timed Task에서 Start Time을 설정할 수 있다.

예:

```text
Start
9:30 PM
```

시간 선택 방식은:

- time field 직접 입력
- dropdown/time picker
- keyboard input

중 하나 또는 조합으로 제공할 수 있다.

정확한 visual은 Popover & Visual System에서 확정한다.

---

## 5.16 End Time

End Time은 optional이다.

```ts
endAt: string | null;
```

예:

```text
Apr 20, 9:30 PM
```

은:

```text
startAt = 21:30
endAt = null
```

유효한 timed Task다.

---

## 5.17 Duration Task

End Time이 존재하면 Duration Task로 간주한다.

```text
09:30 → 10:30
```

Derived:

```text
duration = 60 min
```

`durationMinutes`를 canonical field로 저장하지 않는다.

---

## 5.18 End Time Editing

Start/End가 모두 있는 Task에서 End Time을 변경하면 Start는 유지하고 Duration을 다시 계산한다.

예:

```text
09:30 - 10:30
↓ End → 11:00
09:30 - 11:00
```

---

## 5.19 Start Time Editing with Existing End

Start Time만 변경할 때는 **duration 유지**를 기본값으로 한다.

예:

```text
09:30 - 10:30
duration 60m

Start → 10:00
```

결과:

```text
10:00 - 11:00
```

이유:

> Start를 이동하는 행위는 일정 블록 전체를 옮기는 것으로 해석하는 편이 예측 가능하다.

단 사용자가 End를 직접 수정하면 duration이 바뀐다.

---

## 5.20 Date Change with Existing Duration

Timed duration task의 날짜를 변경하면 time과 duration을 보존한다.

```text
Apr 20
09:30 - 10:30

↓ Apr 24

Apr 24
09:30 - 10:30
```

---

## 5.21 Invalid End Before Start

동일 날짜의 timed Task에서:

```text
Start 10:30
End   09:30
```

은 그대로 저장하지 않는다.

다음 두 가지 중 하나로 해석해야 한다.

기본 추천:

> End가 Start보다 이르면 다음 날 종료로 해석하지 말고, 사용자에게 명시적인 multi-day date 선택을 요구한다.

즉:

```text
same-day end < start
→ validation error / prevent save
```

야간 일정이 필요한 경우:

```text
Start: Apr 20 11:00 PM
End:   Apr 21 1:00 AM
```

처럼 End Date를 명시한다.

---

## 5.22 Multi-day Timed Task

Timed Task는 시작일과 종료일을 다르게 설정할 수 있다.

예:

```text
Apr 20 9:30 PM
→
Apr 22 6:00 PM
```

Domain:

```ts
{
  startAt: "2026-04-20T21:30:00",
  endAt: "2026-04-22T18:00:00",
  allDay: false,
  timezone: "Asia/Seoul"
}
```

---

## 5.23 Multi-day All-day Task

All-day Task도 date range를 지원한다.

예:

```text
Apr 20 - Apr 22
```

Domain 의미:

```ts
{
  startAt: "2026-04-20",
  endAt: "2026-04-22",
  allDay: true,
  timezone: null
}
```

All-day `endAt`은 UI/domain 관점에서 **inclusive final date**로 정의한다.

즉 위 일정은 Apr 20, 21, 22를 포함한다.

DB/Calendar library가 exclusive end를 요구하면 adapter layer에서 변환한다.

---

## 5.24 Single-day All-day Normalization

Single-day all-day Task는:

```ts
startAt = "2026-04-20";
endAt = null;
```

을 기본 canonical representation으로 한다.

다음과 같이 중복 표현하지 않는다.

```ts
startAt = "2026-04-20";
endAt = "2026-04-20";
```

---

## 5.25 End Date Removal

Multi-day Task의 End Date를 제거하면:

```text
Apr 20 - Apr 22
↓ remove end
Apr 20
```

Timed Task라면 End Time도 함께 제거되어:

```ts
endAt = null;
```

이 된다.

---

## 5.26 Date-only vs Date-time Serialization

All-day:

```text
YYYY-MM-DD
```

Timed:

```text
local date-time + timezone semantics
```

을 명확히 분리한다.

금지:

```text
All-day Apr 20
→ UTC midnight 저장
→ timezone 변환 후 Apr 19로 보임
```

All-day는 date-only 의미를 유지한다.

---

## 5.27 Timezone

Timed Task에는 timezone을 지원할 수 있다.

```ts
timezone: string | null;
```

IANA timezone ID 사용을 권장한다.

예:

```text
Asia/Seoul
Europe/London
America/New_York
```

표시용 abbreviation만 저장하지 않는다.

```text
❌ KST
❌ EST
✅ Asia/Seoul
```

---

## 5.28 Default Timezone

새 Timed Task의 timezone:

```text
user/app default timezone
```

을 사용한다.

일반적으로 현재 앱/user timezone을 기준으로 생성한다.

All-day Task:

```ts
timezone = null;
```

---

## 5.29 Timezone Change Semantics

Timezone 변경에는 두 가지 의미가 있을 수 있다.

### Keep instant

```text
서울 09:00
→ 런던 01:00
```

### Keep wall-clock time

```text
서울 09:00
→ 런던 09:00
```

Task scheduling에서는 혼란을 막기 위해 명시적 정책이 필요하다.

기본 추천:

> Timezone property 변경은 같은 실제 instant를 유지하고 표시 시각만 변환한다.

즉 일정의 실제 시점을 보존한다.

별도의 “keep local time” 옵션은 고급 기능으로 확장 가능하다.

---

## 5.30 Timezone UI Scope

초기 V1에서는 Timezone UI를 숨겨두고 앱 timezone을 자동 적용할 수 있다.

하지만 data model은 이미 timezone을 수용한다.

즉:

```text
V1
auto timezone

V2
explicit timezone selector
```

로 확장 가능하다.

---

## 5.31 Schedule Mutation Commands

컴포넌트마다 `task.schedule`을 직접 수정하지 않는다.

공통 command 예:

```ts
setTaskDate(taskId, date)
setTaskStartTime(taskId, time)
setTaskEnd(taskId, endDateTime)
setTaskAllDay(taskId, allDay)
clearTaskSchedule(taskId)
setTaskTimezone(taskId, timezone)
```

Command layer가 invariants를 보장한다.

---

## 5.32 One Patch API

최종 persistence는 공통 Task update path를 사용할 수 있다.

예:

```ts
updateTask(taskId, {
  schedule: nextSchedule
});
```

하지만 `nextSchedule` 생성은 schedule-specific command/helper가 담당한다.

UI component가 invalid schedule object를 임의 생성하지 않게 한다.

---

## 5.33 Optimistic Update

Date / Time 변경은 선택 즉시 UI에 반영한다.

```text
select Apr 24
↓
Detail label 즉시 Apr 24
↓
Calendar/List 즉시 update
↓
persistence
```

서버 응답을 기다리고 나서 Date label을 바꾸지 않는다.

---

## 5.34 Save Granularity

다음 action은 각각 독립 mutation으로 저장 가능하다.

```text
Date select
All-day toggle
Start time change
End time change
Clear schedule
Timezone change
```

단 Popover 내 임시 keyboard typing 중에는 draft state를 사용할 수 있다.

유효한 값이 확정될 때 commit한다.

---

## 5.35 Direct Time Input Draft

예:

```text
Start time input
"1"
"10"
"10:"
"10:3"
"10:30"
```

중간 문자열은 Task domain에 저장하지 않는다.

```text
temporary input draft
→ parse/validate
→ commit valid time
```

---

## 5.36 Popover Close Behavior

Schedule Popover는 다음으로 닫을 수 있다.

```text
Esc
outside click
완료/확정 action이 필요한 sub-flow의 confirm
```

Task Detail 자체와 달리 Popover는 outside click으로 닫을 수 있다.

즉:

```text
Task Detail
→ outside click close ❌

Schedule Popover
→ outside click close ✅
```

---

## 5.37 Auto-close after Date Selection

Quick Date 또는 Calendar date를 선택했을 때 Popover를 즉시 닫을지 여부는 workflow에 따라 결정한다.

TickTick 스타일의 빠른 편집을 위해 기본 추천:

### Quick single date selection

```text
select date
→ schedule 즉시 update
→ Popover 유지 가능
```

이유:

사용자가 이어서:

```text
Time
Reminder
Repeat
```

를 설정할 수 있기 때문이다.

명시적 outside click/Esc로 닫는다.

다만 실제 TickTick audit 값이 확보되면 동일 행동으로 맞춘다.

---

## 5.38 Keyboard in Calendar

Schedule Popover는 keyboard navigation을 지원할 수 있어야 한다.

기본 의미:

```text
Arrow keys
→ Calendar date 이동

Enter
→ date 선택

Esc
→ current sub-popup / Schedule Popover close

Tab
→ 다음 interactive control
Shift+Tab
→ 이전 control
```

정확한 roving focus 구현은 Accessibility 장과 통합한다.

---

## 5.39 Natural Language Input

향후:

```text
tomorrow 3pm
next monday
fri 9-10
```

같은 natural-language schedule parsing을 추가할 수 있다.

하지만 V1의 core schedule data model과 분리한다.

Parser 결과는 동일한 `TaskSchedule`로 변환한다.

---

## 5.40 Main View Inline Date Edit

Main View에서 Date property를 직접 클릭해도 같은 scheduling command와 popover system을 사용한다.

```text
List Date Popover
Detail Date Popover
```

를 별도 비즈니스 로직으로 만들지 않는다.

Surface anchor만 다르고 schedule semantics는 동일하다.

---

## 5.41 Calendar Drag Synchronization

향후 Calendar에서 timed block을 drag하면:

```text
startAt / endAt
```

이 변경되고 Detail Date label도 즉시 갱신된다.

Calendar drag 전용 별도 date state를 만들지 않는다.

---

## 5.42 Calendar Resize Synchronization

Calendar에서 duration block의 bottom edge를 resize하면:

```text
endAt 변경
```

으로 처리한다.

Derived duration이 자동 갱신된다.

---

## 5.43 Smart List Synchronization

Schedule 변경은 Today/Tomorrow/Next 7 Days 등의 derived query에 즉시 반영되어야 한다.

예:

```text
Task A
Today → Tomorrow
```

결과:

```text
Today query에서 제거
Tomorrow query에 추가
Detail은 유지
```

3장 Selection 규칙과 일치해야 한다.

---

## 5.44 Overdue Derived State

Overdue 여부를 schedule mutation 후 다시 계산한다.

Canonical field:

```text
isOverdue 저장 ❌
```

Derived rule 예:

```text
status = open
AND
relevant schedule boundary < now
```

정확히 start/end 중 어떤 값을 deadline으로 사용할지는 View semantics와 함께 확정한다.

---

## 5.45 Reminder Dependency

Reminder가 있는 Task에서 Date를 제거하면 Reminder가 실행할 기준 시점이 사라질 수 있다.

Core rule:

> Invalid reminder를 조용히 남겨두지 않는다.

구체적으로:

- 삭제
- 비활성화
- 사용자 확인

중 어떤 정책을 쓸지는 6. Reminder에서 확정한다.

---

## 5.46 Recurrence Dependency

Repeat 역시 schedule date에 의존한다.

Date 제거 시 recurrence 처리 규칙은 7장에서 확정한다.

Schedule layer는 dependency event를 발생시킬 수 있어야 한다.

---

## 5.47 DST

Timezone이 있는 timed Task는 DST transition을 고려해야 한다.

예:

```text
1:30 AM → 3:30 AM
```

처럼 지역 timezone에서 존재하지 않거나 중복되는 시각이 있을 수 있다.

원칙:

- IANA timezone 기반
- timezone-aware date library 사용
- ambiguous/nonexistent local time을 무시하지 않음

정확한 사용자 피드백은 Edge Cases 장에서 정의한다.

---

## 5.48 Locale / 12h / 24h

저장 형식과 표시 형식을 분리한다.

사용자 preference에 따라:

```text
9:30 PM
```

또는:

```text
21:30
```

표시 가능.

Domain은 표시 문자열을 저장하지 않는다.

---

## 5.49 Week Start

Calendar의 주 시작 요일:

```text
Monday / Sunday
```

은 user locale/preferences를 따른다.

Task schedule data와는 무관한 UI preference다.

---

## 5.50 Date Formatting

Date label은 locale-aware formatting을 사용한다.

```text
Apr 20
20 Apr
2026. 4. 20.
```

등.

Canonical data에는 포맷된 label을 저장하지 않는다.

---

## 5.51 Rapid Schedule Changes

사용자가 빠르게 여러 날짜를 선택하면 마지막 mutation이 최종 상태가 되어야 한다.

늦게 도착한 이전 persistence response가 최신 schedule을 덮어쓰지 않도록 mutation ordering/versioning을 적용한다.

---

## 5.52 Offline / Local-first

Schedule 변경도 optimistic/local-first 가능해야 한다.

```text
select date
→ local store immediate update
→ persistence/sync
```

네트워크 latency 때문에 Calendar/Detail 반영이 지연되지 않는다.

---

## 5.53 Schedule State Examples

### No Date

```ts
schedule = null;
```

### Single-day All-day

```ts
schedule = {
  startAt: "2026-04-20",
  endAt: null,
  allDay: true,
  timezone: null
};
```

### Multi-day All-day

```ts
schedule = {
  startAt: "2026-04-20",
  endAt: "2026-04-22",
  allDay: true,
  timezone: null
};
```

### Timed Start Only

```ts
schedule = {
  startAt: "2026-04-20T21:30:00",
  endAt: null,
  allDay: false,
  timezone: "Asia/Seoul"
};
```

### Timed Duration

```ts
schedule = {
  startAt: "2026-04-20T21:30:00",
  endAt: "2026-04-20T22:30:00",
  allDay: false,
  timezone: "Asia/Seoul"
};
```

### Multi-day Timed

```ts
schedule = {
  startAt: "2026-04-20T21:30:00",
  endAt: "2026-04-22T18:00:00",
  allDay: false,
  timezone: "Asia/Seoul"
};
```

---

## 5.54 Schedule Invariants

항상 지켜야 한다.

```text
schedule = null
OR
valid TaskSchedule
```

All-day:

```text
startAt = date-only
endAt = null or date-only
timezone = null
```

Timed:

```text
startAt = date-time
endAt = null or date-time
timezone = valid IANA zone or app-resolved zone
```

또한:

```text
endAt 존재 시
endAt > startAt
```

Timed same-day에서 end < start를 자동 다음 날로 해석하지 않는다.

---

## 5.55 Prohibited Patterns

- `dueDate`, `date`, `time`, `duration`을 서로 독립 canonical source로 중복 저장
- `Today`, `Tomorrow` 문자열을 domain date로 저장
- All-day를 UTC midnight datetime으로 저장해 timezone shift 발생
- `durationMinutes`와 `endAt`을 동시에 canonical source로 유지
- `isMultiDay`, `displayDate` 등을 canonical field로 저장
- Start Time 변경 후 End Time이 Start보다 앞선 invalid state 그대로 저장
- Date를 바꿀 때 기존 time/duration을 불필요하게 초기화
- Main/Detail/Calendar가 서로 다른 scheduling logic 사용
- 직접 time input의 미완성 문자열을 domain에 저장
- Schedule Popover와 Detail의 outside-click 정책을 동일하게 처리

---

## 5.56 Acceptance Criteria

### Date

- [ ] No Date Task에 날짜를 추가할 수 있다.
- [ ] Today/Tomorrow/특정 날짜를 선택할 수 있다.
- [ ] 기존 timed Task의 날짜 변경 시 time과 duration이 보존된다.
- [ ] Date를 Clear하면 `schedule = null`이 된다.
- [ ] Relative label은 UI에서만 사용한다.

### All-day

- [ ] All-day single-date Task를 표현할 수 있다.
- [ ] All-day multi-day Task를 표현할 수 있다.
- [ ] Timed → All-day 전환 시 active schedule의 time이 제거된다.
- [ ] All-day → Timed 전환 시 일관된 default time이 적용된다.
- [ ] All-day date가 timezone 때문에 하루 이동하지 않는다.

### Time

- [ ] Start Time을 설정/수정할 수 있다.
- [ ] End Time은 optional이다.
- [ ] End Time이 있으면 duration을 derived할 수 있다.
- [ ] Start Time 변경 시 기존 duration을 기본적으로 유지한다.
- [ ] End Time 변경 시 duration이 다시 계산된다.
- [ ] End <= Start invalid state를 저장하지 않는다.

### Multi-day

- [ ] Multi-day timed Task를 만들 수 있다.
- [ ] Multi-day all-day Task를 만들 수 있다.
- [ ] End Date를 제거해 single-date/start-only Task로 되돌릴 수 있다.
- [ ] All-day end date는 inclusive 의미로 일관되게 처리된다.

### Timezone

- [ ] Timed Task가 timezone 의미를 가질 수 있다.
- [ ] IANA timezone ID를 사용할 수 있다.
- [ ] All-day Task에는 timezone을 적용하지 않는다.
- [ ] Display format과 stored value가 분리된다.

### Interaction

- [ ] Date trigger click으로 Schedule Popover가 열린다.
- [ ] Popover는 Esc/outside click으로 닫을 수 있다.
- [ ] Task Detail 자체는 outside click으로 닫히지 않는다.
- [ ] Date/Time mutation이 optimistic하게 즉시 반영된다.
- [ ] Invalid keyboard draft는 commit되지 않는다.

### Synchronization

- [ ] Detail, List, Calendar, Board, Search가 같은 `schedule`을 읽는다.
- [ ] Schedule 변경이 Today/Tomorrow 등 smart query에 즉시 반영된다.
- [ ] Calendar drag/resize가 같은 `schedule`을 수정할 수 있다.
- [ ] Schedule 변경으로 현재 query에서 Task가 빠져도 Detail selection은 유지된다.

### Architecture

- [ ] Schedule mutation은 공통 command/helper를 통해 수행된다.
- [ ] `duration`, `isMultiDay`, formatted label은 derived state다.
- [ ] All-day와 timed serialization 의미가 명확히 분리된다.
- [ ] Rapid mutation에서 마지막 사용자 action이 최종 상태가 된다.

---

# 6. Reminder

## 6.1 Purpose

Reminder는 Task의 `schedule`을 기준으로 사용자가 원하는 시점에 알림을 발생시키는 독립 scheduling layer다.

핵심 원칙:

```text
Task Schedule
     │
     ├── Relative Reminder
     │      └── "30 min before"
     │
     └── Absolute Reminder
            └── "Apr 20, 8:00 PM"
```

Reminder는 Task의 날짜/시간 자체가 아니다.

```text
Schedule
≠
Reminder
```

Task 하나는 여러 Reminder를 가질 수 있다.

---

## 6.2 Data Model

2장에서 정의한 Reminder entity를 기본으로 사용한다.

```ts
type Reminder = {
  id: string;
  taskId: string;

  type:
    | "relative"
    | "absolute";

  offsetMinutes: number | null;
  absoluteAt: string | null;

  enabled: boolean;

  createdAt: string;
};
```

권장 확장:

```ts
type Reminder = {
  id: string;
  taskId: string;

  type:
    | "relative"
    | "absolute";

  offsetMinutes: number | null;
  absoluteAt: string | null;

  enabled: boolean;

  createdAt: string;
  updatedAt: string;
};
```

---

## 6.3 Reminder Is a Separate Entity

Task 안에 다음과 같이 단일 boolean이나 단일 시간만 넣지 않는다.

```text
❌ hasReminder: true
❌ reminderAt: "..."
❌ remindBefore: 30
```

Task 하나가 여러 Reminder를 가질 수 있어야 하기 때문이다.

예:

```text
Task A
├─ 1 day before
├─ 1 hour before
└─ At time
```

---

## 6.4 Reminder Entry Point

기본 진입점은 Schedule Popover 내부에 둔다.

예:

```text
┌─────────────────────────────┐
│ Date / Calendar             │
├─────────────────────────────┤
│ All-day                     │
│ Start time                  │
│ End time                    │
├─────────────────────────────┤
│ Reminder                >   │
│ Repeat                  >   │
└─────────────────────────────┘
```

Reminder row 클릭:

```text
Schedule Popover
    ↓ Reminder
Reminder Submenu / Sub-popover
```

Task Detail 상단에 별도의 항상 노출된 Reminder 아이콘을 추가하는 것은 V1의 기본값으로 하지 않는다.

---

## 6.5 No Reminder State

Reminder가 없는 Task:

```text
Reminder
None
```

또는 Schedule Popover row에서:

```text
Reminder
```

만 보여줄 수 있다.

Domain:

```text
해당 taskId의 enabled Reminder entity 없음
```

---

## 6.6 Default Quick Options

Timed Task의 기본 quick reminder 옵션:

```text
At time
5 minutes before
10 minutes before
30 minutes before
1 hour before
1 day before
Custom
```

앱 요구에 따라:

```text
2 hours before
1 week before
```

등을 추가할 수 있다.

Quick option은 UI preset일 뿐 domain에는 relative offset으로 저장한다.

---

## 6.7 Relative Reminder

예:

```text
30 minutes before
```

Domain:

```ts
{
  type: "relative",
  offsetMinutes: 30,
  absoluteAt: null,
  enabled: true
}
```

실제 fire time:

```text
anchorTime - offsetMinutes
```

---

## 6.8 Reminder Anchor

Relative Reminder는 어떤 schedule boundary를 기준으로 하는지 명확히 해야 한다.

기본 규칙:

> Reminder의 기준점은 Task의 `startAt`이다.

예:

```text
Task
Apr 20
09:30 - 10:30

Reminder
30 min before
```

fire time:

```text
Apr 20 09:00
```

`endAt`을 기준으로 계산하지 않는다.

---

## 6.9 Timed Task: At Time

Timed Task에서:

```text
At time
```

은:

```text
fire time = startAt
```

의미다.

Domain은 다음 두 방식 중 하나가 가능하나, 일관성을 위해 relative 형태를 권장한다.

```ts
type = "relative"
offsetMinutes = 0
```

즉 별도 `"at_time"` type을 만들지 않는다.

---

## 6.10 All-day Task Reminder Semantics

All-day Task는 정확한 시간값이 없으므로 `At time`의 의미가 불명확하다.

따라서 all-day Task에는 별도의 기본 reminder time이 필요하다.

예:

```text
All-day Task
Apr 20

Reminder
On the day at 9:00 AM
```

기본 정책:

```text
all-day reminder default time
= user/app preference
```

예:

```text
09:00
```

단 이 시간은 Task `schedule` 자체에 넣지 않는다.

---

## 6.11 All-day Relative Presets

All-day Task의 quick option은 timed Task와 다르게 표시할 수 있다.

예:

```text
On the day
1 day before
2 days before
1 week before
Custom
```

각 option은 최종 notification datetime으로 해석 가능해야 한다.

---

## 6.12 All-day Reminder Model

현재 Reminder 모델의 `offsetMinutes`만으로는 all-day의 “1 day before at 9 AM” 의미가 부족할 수 있다.

따라서 확장 가능한 구조를 권장한다.

```ts
type Reminder = {
  id: string;
  taskId: string;

  type:
    | "relative"
    | "absolute";

  offsetMinutes: number | null;
  absoluteAt: string | null;

  allDayTime: string | null;

  enabled: boolean;

  createdAt: string;
  updatedAt: string;
};
```

예:

```ts
{
  type: "relative",
  offsetMinutes: 1440,
  absoluteAt: null,
  allDayTime: "09:00",
  enabled: true
}
```

정확한 persistence 방식은 DB adapter에서 구현해도 되지만, domain semantics는 보존해야 한다.

---

## 6.13 Absolute Reminder

Custom Reminder에서는 Task start와 무관한 절대 시각도 설정할 수 있다.

예:

```text
Task
Apr 20 09:30

Reminder
Apr 19 18:00
```

Domain:

```ts
{
  type: "absolute",
  offsetMinutes: null,
  absoluteAt: "2026-04-19T18:00:00+09:00",
  enabled: true
}
```

---

## 6.14 Relative vs Absolute

기본 UX에서는 relative reminder를 우선한다.

이유:

Task date/time 변경 시 자동으로 따라가기 때문이다.

예:

```text
Task
Apr 20 09:30
Reminder
30 min before

↓ Task → Apr 21 11:00

Reminder
Apr 21 10:30
```

Absolute Reminder는 Task schedule이 바뀌어도 원래 절대 시각을 유지한다.

---

## 6.15 Multiple Reminders

Task 하나에 여러 Reminder를 추가할 수 있다.

예:

```text
Reminder
✓ 1 day before
✓ 1 hour before
✓ 10 min before
```

Data relation:

```text
Task A
├─ Reminder R1
├─ Reminder R2
└─ Reminder R3
```

---

## 6.16 Duplicate Reminder Prevention

동일 Task에 의미상 완전히 같은 Reminder를 중복 생성하지 않는다.

예:

```text
30 min before
30 min before
```

중복 생성:

```text
❌
```

동일 absolute timestamp도 기본적으로 중복 방지한다.

---

## 6.17 Reminder List UI

Reminder submenu는 multi-select 형태로 구성 가능하다.

예:

```text
┌────────────────────────────┐
│ Reminder                   │
├────────────────────────────┤
│ ✓ At time                  │
│   5 minutes before         │
│ ✓ 30 minutes before        │
│   1 hour before            │
│   1 day before             │
├────────────────────────────┤
│ Custom...                  │
└────────────────────────────┘
```

선택된 preset은 현재 Task의 Reminder entity와 동기화한다.

---

## 6.18 Adding a Reminder

Preset click:

```text
30 min before
↓
Reminder entity create
↓
UI selected
↓
notification schedule update
```

Popover 전체를 반드시 닫을 필요는 없다.

여러 Reminder를 연속 선택할 수 있어야 한다.

---

## 6.19 Removing a Reminder

선택된 preset을 다시 클릭하거나 별도 delete action을 통해 제거한다.

```text
✓ 30 min before
↓ click
30 min before
```

Domain에서는 해당 Reminder entity를 삭제하거나 soft-disable한다.

초기 권장:

```text
user removal
→ entity delete
```

`enabled=false`는 notification permission/sync 상태 등 시스템적 일시 비활성화에 더 적합하다.

---

## 6.20 Clear All

Reminder가 여러 개 있으면:

```text
Clear all reminders
```

action을 제공할 수 있다.

실행 후:

```text
해당 Task의 Reminder entity = 0개
```

Task schedule 자체는 변경하지 않는다.

---

## 6.21 Custom Reminder Flow

`Custom...` 선택:

```text
Reminder menu
    ↓
Custom Reminder
```

Custom UI에서 설정 가능:

```text
Relative / Absolute
Date
Time
Before offset
```

예:

```text
2 days before at 6:00 PM
```

또는:

```text
Apr 18, 6:00 PM
```

---

## 6.22 Custom Relative Unit

Custom relative reminder는 최소 다음 unit을 지원할 수 있다.

```text
minutes
hours
days
weeks
```

예:

```text
45 minutes before
3 hours before
2 days before
1 week before
```

Domain에서는 분 단위로 normalize 가능하다.

```text
2 days
→ 2880 minutes
```

---

## 6.23 Invalid Relative Offset

다음 값은 허용하지 않는다.

```text
negative offset
NaN
empty committed value
```

`0`은 `At time`으로 허용한다.

---

## 6.24 Reminder in the Past

Reminder 계산 결과가 이미 과거일 수 있다.

예:

```text
Now: Apr 20 09:20
Task: Apr 20 09:30

Select:
1 hour before
```

fire time:

```text
08:30
```

이미 지남.

이 경우 조용히 등록해 “알림이 설정됐다”고 보이면 안 된다.

기본 권장:

```text
show warning
"That reminder time has already passed."
```

선택 가능한 정책:

```text
A. 등록 차단
B. 등록은 하되 즉시 알림
```

기본값은 **등록 차단**을 권장한다.

---

## 6.25 Absolute Reminder in the Past

Absolute Reminder도 동일.

```text
absoluteAt <= now
```

이면 commit을 막고 validation feedback을 준다.

---

## 6.26 Date Change with Relative Reminder

Relative Reminder는 Task schedule 변경을 따라간다.

```text
Task start
Apr 20 09:30

Reminder
30 min before

↓ Task date/time change

Apr 21 13:00

Reminder fire
Apr 21 12:30
```

Reminder entity 자체의 `offsetMinutes`는 바뀌지 않는다.

---

## 6.27 Date Change with Absolute Reminder

Absolute Reminder는 Task schedule 변경과 독립적이다.

```text
Task date change
→ absoluteAt unchanged
```

다만 변경 후 absolute reminder가 Task보다 훨씬 뒤에 오거나 의미가 이상해질 수 있으므로 advanced warning은 향후 고려할 수 있다.

V1에서는 강제 변경하지 않는다.

---

## 6.28 Start Time Change

Relative Reminder anchor는 `startAt`이므로 Start Time 변경 시 notification scheduling도 즉시 재계산한다.

```text
Start 09:30
Reminder 30m before = 09:00

↓ Start → 10:30

Reminder = 10:00
```

---

## 6.29 End Time Change

Reminder anchor는 `startAt`이므로 End Time만 바뀌어도 relative Reminder fire time은 바뀌지 않는다.

```text
Start 09:30
End 10:30 → 11:30

Reminder 30m before
still 09:00
```

---

## 6.30 Schedule Removal

Task에서 Date를 제거하면 relative Reminder는 anchor를 잃는다.

기본 규칙:

> `schedule = null`로 바뀌면 모든 relative Reminder를 제거한다.

예:

```text
Task
Apr 20 09:30
Reminder 30m before

↓ Clear Date

Task
No Date
Reminder
None
```

사용자 데이터 손실 가능성이 있으므로 실제 UX에서는 Clear Date 직전 또는 직후에 feedback을 줄 수 있다.

---

## 6.31 Absolute Reminder When Date Is Cleared

Absolute Reminder는 technically Task schedule 없이도 실행 가능하다.

하지만 product semantics가 혼란스러울 수 있다.

기본 추천:

> Task date를 제거할 때 absolute Reminder도 함께 제거한다.

즉 V1에서는:

```text
Clear Task Schedule
→ all Reminder entities remove
```

로 단순하고 예측 가능하게 한다.

향후 “date 없는 reminder task”를 지원하고 싶으면 별도 기능으로 확장한다.

---

## 6.32 All-day → Timed Conversion

All-day Task가 Timed Task로 변환될 때:

- relative day offset은 유지 가능
- `allDayTime` 기반 의미는 timed anchor 기반으로 normalize

예:

```text
All-day
Apr 20
1 day before at 09:00
```

Timed:

```text
Apr 20 15:00
```

변환 후 기본 정책:

```text
1 day before
→ Apr 19 15:00
```

즉 offset 중심의 semantics를 우선한다.

복잡한 custom all-day time은 변환 시 명시적 normalization이 필요하다.

---

## 6.33 Timed → All-day Conversion

Timed Task:

```text
Apr 20 15:00
Reminder 30m before
```

All-day 전환 시 30분 전은 all-day 의미상 애매해진다.

기본 권장:

> Timed-specific minute/hour Reminder는 제거하고 사용자에게 feedback한다.

예:

```text
"Time-based reminders were removed because this task is now all-day."
```

Day/week 단위 Reminder는 all-day semantics로 변환 가능하다.

---

## 6.34 Reminder Summary in Schedule UI

Reminder가 하나 이상이면 Schedule Popover의 Reminder row에 summary를 보여준다.

예:

```text
Reminder
30 min before
```

복수:

```text
Reminder
3 reminders
```

또는 공간이 충분하면:

```text
30 min before, 1 day before
```

정확한 표현은 Visual System에서 확정한다.

---

## 6.35 Reminder Indicator in Detail

Property Header의 Date label 자체에 작은 reminder indicator를 추가할 수 있다.

예:

```text
🔔 Apr 20, 9:30 PM
```

다만 시각적 과밀을 막기 위해 V1 필수요소로 두지 않는다.

Schedule Popover 내 summary만으로도 기능 접근이 가능해야 한다.

---

## 6.36 Notification Scheduling Layer

Domain Reminder와 OS/browser notification scheduling은 분리한다.

```text
Reminder Entity
      ↓
Reminder Scheduler
      ↓
Platform Notification
```

즉 UI가 직접 `setTimeout()` 같은 방식으로 알림을 관리하지 않는다.

---

## 6.37 Scheduler Responsibility

Reminder Scheduler의 책임:

```text
1. enabled Reminder 조회
2. 실제 fire time 계산
3. permission 상태 확인
4. notification 등록
5. schedule 변경 시 재등록
6. Reminder 삭제 시 취소
7. app restart 후 복구
```

---

## 6.38 Notification Permission

Reminder 생성과 OS/browser notification permission은 서로 다른 상태다.

예:

```text
Reminder saved
+
Notification permission denied
```

이 경우 Task data는 유지할 수 있지만 사용자에게 실제 알림이 전달되지 않는다는 상태를 알려야 한다.

---

## 6.39 Permission Request Timing

앱 첫 실행 시 이유 없이 notification permission을 요구하지 않는다.

권장:

```text
사용자가 첫 Reminder를 설정하려고 함
↓
permission 필요
↓
contextual permission request
```

사용자 intent가 있는 시점에 요청한다.

---

## 6.40 Permission Denied

Permission이 거절된 경우:

```text
Reminder
30 min before
```

을 저장할지 여부는 제품 정책 선택이지만 기본 추천은 **저장한다**.

그리고 UI에:

```text
Notifications are disabled
```

상태를 표시한다.

나중에 permission을 허용하면 Scheduler가 활성 reminder를 다시 등록할 수 있다.

---

## 6.41 App Restart

Reminder는 앱이 열려 있는 동안만 살아있는 memory timer에 의존하면 안 된다.

```text
❌ setTimeout-only
```

앱 재시작/브라우저 재로드 후에도 persistence된 Reminder를 기반으로 다시 schedule할 수 있어야 한다.

---

## 6.42 Cross-device Sync

향후 계정 기반 sync가 있다면 Reminder entity도 Task와 함께 sync한다.

다만 실제 OS notification 등록은 각 device가 독립적으로 수행한다.

```text
Cloud Reminder
   │
   ├─ Device A scheduler
   └─ Device B scheduler
```

Device별 알림 정책은 향후 확장 가능하다.

---

## 6.43 Duplicate Notifications Across Devices

Cross-device 환경에서는 동일 Reminder가 여러 device에서 울릴 수 있다.

V1에서는 허용 가능하나, 향후:

```text
notification device preference
```

를 추가할 수 있다.

이 기능은 core Task model에 넣지 않는다.

---

## 6.44 Completed Task and Pending Reminders

Task가 Reminder fire 전에 완료되면 pending Reminder를 어떻게 할지 명확히 한다.

기본 규칙:

> Task가 `completed` 또는 `wont_do`가 되면 아직 발생하지 않은 Reminder notification은 취소한다.

Reason:

완료된 Task를 다시 알리는 것은 기본 UX에서 불필요하다.

---

## 6.45 Reopen Completed Task

Task를 Reopen해도 과거 Reminder를 무조건 다시 발행하지 않는다.

재계산 결과 future fire time이 존재하면 다시 schedule 가능하다.

예:

```text
Task tomorrow 09:00
Reminder 1 day before
Complete today
→ pending reminder cancel

Reopen before reminder fire time
→ future reminder reschedule
```

이미 fire time이 지난 Reminder는 다시 울리지 않는다.

---

## 6.46 Won't Do

`wont_do` 상태도 pending Reminder를 취소한다.

Reopen 시 future reminder만 다시 schedule한다.

---

## 6.47 Recurring Task Reminder

반복 Task의 Reminder는 recurrence rule과 결합되어 각 occurrence에 적용될 수 있어야 한다.

예:

```text
Every Monday 09:00
Reminder 30 min before
```

각 occurrence:

```text
Mon 08:30
Mon 08:30
...
```

실제 occurrence 생성 정책은 7. Repeat / Recurrence에서 확정한다.

Reminder 자체는 recurrence rule을 복제해 저장하지 않는다.

---

## 6.48 Reminder + Recurrence Principle

```text
Recurrence
→ occurrence schedule 결정

Reminder
→ 각 occurrence startAt 기준 fire time 계산
```

즉 Reminder는 Repeat 규칙과 역할을 섞지 않는다.

---

## 6.49 Reminder Ordering in UI

복수 Reminder는 사용자가 이해하기 쉬운 시간 순으로 정렬한다.

예:

```text
1 day before
1 hour before
30 min before
At time
```

Domain에 display order를 별도 저장할 필요는 기본적으로 없다.

fire time/offset 기준 derived sorting을 사용할 수 있다.

---

## 6.50 Reminder Command Layer

UI component가 Reminder entity를 직접 생성/삭제하지 않는다.

개념 command:

```ts
addRelativeReminder(taskId, offsetMinutes)
addAbsoluteReminder(taskId, absoluteAt)
removeReminder(reminderId)
clearTaskReminders(taskId)
```

Command 책임:

```text
validation
duplicate prevention
store update
persistence
scheduler registration/cancel
error rollback
```

---

## 6.51 Schedule Dependency Handler

Task schedule mutation 이후 Reminder dependency를 검사하는 공통 로직이 필요하다.

예:

```ts
onTaskScheduleChanged(taskId, previousSchedule, nextSchedule)
```

책임:

```text
relative reminder fire-time 재계산
all-day/timed conversion 처리
clear-date 처리
scheduler reschedule
```

Schedule component가 Reminder 내부 로직까지 직접 알 필요는 없다.

---

## 6.52 Optimistic UI

Reminder preset 선택:

```text
click
↓
selected check 즉시 표시
↓
store update
↓
persistence
↓
scheduler
```

Persistence/scheduler 실패 시 적절히 rollback 또는 warning을 제공한다.

---

## 6.53 Scheduler Failure vs Persistence Failure

두 실패를 구분한다.

### Persistence failure

```text
Reminder 자체 저장 실패
→ UI rollback
```

### Notification scheduling failure

```text
Reminder data 저장 성공
Notification 등록 실패
→ Reminder 유지 + warning
```

두 경우를 같은 “저장 실패”로 처리하지 않는다.

---

## 6.54 Timezone Change

Timed Task의 timezone이 바뀌면 relative Reminder의 실제 fire instant도 Task timezone semantics에 따라 다시 계산한다.

Reminder 자체의 offset은 유지한다.

Absolute Reminder는 `absoluteAt`이 실제 instant 기준이면 그대로 유지한다.

---

## 6.55 DST

Relative Reminder는 timezone-aware 계산을 사용한다.

예:

```text
Task start
DST transition day 09:00

Reminder
1 day before
```

단순 `- 24 * 60 minutes`가 항상 “전날 같은 시각”을 의미하지 않을 수 있다.

일/day 단위 preset은 calendar arithmetic 의미가 필요할 수 있다.

따라서 내부적으로:

```text
30 minutes before
→ duration arithmetic

1 day before
→ calendar-day arithmetic
```

을 구분할 수 있는 확장 모델이 이상적이다.

---

## 6.56 Recommended Reminder Model Extension

장기적으로는 `offsetMinutes` 하나보다 다음 구조가 더 안전하다.

```ts
type ReminderOffset = {
  value: number;
  unit:
    | "minute"
    | "hour"
    | "day"
    | "week";
};

type Reminder = {
  id: string;
  taskId: string;

  type:
    | "relative"
    | "absolute";

  offset: ReminderOffset | null;
  absoluteAt: string | null;

  allDayTime: string | null;

  enabled: boolean;

  createdAt: string;
  updatedAt: string;
};
```

이 구조를 **최종 권장안**으로 한다.

이유:

- 1 day before와 24 hours before를 필요하면 구분 가능
- DST/calendar semantics 대응
- UI preset 의미를 그대로 보존 가능

---

## 6.57 Migration from `offsetMinutes`

초기 DB가 이미:

```ts
offsetMinutes
```

를 사용한다면 즉시 변경이 필수는 아니다.

다만 Master Spec의 목표 모델은:

```ts
offset: {
  value,
  unit
}
```

을 권장한다.

구현 복잡도에 따라 V1에서는 minutes normalization으로 시작하고 migration 가능하게 설계한다.

---

## 6.58 Rapid Reminder Changes

사용자가 빠르게:

```text
30m add
↓
30m remove
↓
1h add
```

하는 경우 늦은 async response가 최신 state를 덮어쓰지 않아야 한다.

Task status/schedule과 동일하게 mutation ordering/versioning 전략을 적용한다.

---

## 6.59 Offline

Reminder entity는 local-first로 생성 가능하다.

다만 실제 platform notification scheduling은 현재 device capability에 따라 달라질 수 있다.

```text
Domain reminder saved
≠
Notification guaranteed
```

상태를 구분한다.

---

## 6.60 Reminder Status Presentation

사용자에게 최소한 다음 두 개념을 구분할 수 있어야 한다.

```text
Reminder configured
Notification unavailable
```

예:

```text
30 min before
Notifications off
```

Reminder 자체가 사라진 것처럼 표현하지 않는다.

---

## 6.61 Prohibited Patterns

- `hasReminder` boolean을 canonical source로 사용
- Task당 Reminder 하나만 가정
- Reminder와 Task Schedule을 같은 field로 저장
- Relative Reminder의 실제 fire timestamp만 저장하고 offset 의미를 버림
- Schedule 변경 후 Relative Reminder를 재계산하지 않음
- Date 제거 후 실행 불가능한 Relative Reminder를 조용히 남김
- Completed/Won't Do Task의 pending Reminder를 계속 울림
- OS notification permission 거부를 Reminder data 삭제로 처리
- UI component가 직접 `setTimeout()`으로 notification 관리
- 앱 재시작 시 Reminder가 모두 사라지는 memory-only 구현
- Main View와 Detail이 서로 다른 Reminder 로직 사용
- 과거 시점 Reminder를 정상 설정된 것처럼 표시
- 동일 Reminder를 무한 중복 생성

---

## 6.62 Acceptance Criteria

### Basic Reminder

- [ ] Reminder가 없는 Task에 Reminder를 추가할 수 있다.
- [ ] At time / 5m / 10m / 30m / 1h / 1d preset을 지원할 수 있다.
- [ ] Custom Reminder를 만들 수 있다.
- [ ] Task 하나에 여러 Reminder를 추가할 수 있다.
- [ ] 동일 Reminder 중복 생성을 방지한다.
- [ ] Reminder를 개별 삭제할 수 있다.
- [ ] 모든 Reminder를 Clear할 수 있다.

### Relative / Absolute

- [ ] Relative Reminder는 Task `startAt`을 기준으로 계산된다.
- [ ] Task 날짜/시간 변경 시 Relative Reminder가 자동 재계산된다.
- [ ] Absolute Reminder는 Task schedule 변경과 독립적으로 유지된다.
- [ ] 과거 Reminder는 validation 없이 조용히 등록되지 않는다.

### All-day

- [ ] All-day Task용 Reminder semantics가 정의되어 있다.
- [ ] All-day Reminder time preference를 적용할 수 있다.
- [ ] Timed ↔ All-day 변환 시 Reminder 의미가 깨지지 않도록 처리한다.
- [ ] 변환 불가능한 time-based Reminder는 사용자 feedback과 함께 제거/정규화한다.

### Schedule Dependency

- [ ] Clear Date 시 Reminder 처리 규칙이 일관된다.
- [ ] Start Time 변경 시 Relative Reminder를 reschedule한다.
- [ ] End Time 변경만으로 start-based Reminder가 변하지 않는다.
- [ ] Timezone 변경 시 timezone-aware 재계산이 가능하다.

### Status Dependency

- [ ] Completed Task의 future Reminder를 취소한다.
- [ ] Won't Do Task의 future Reminder를 취소한다.
- [ ] Reopen 시 future Reminder만 재등록한다.
- [ ] 이미 지난 Reminder를 재발송하지 않는다.

### Notification Layer

- [ ] Reminder domain과 platform notification scheduler가 분리되어 있다.
- [ ] Permission이 없더라도 Reminder data와 permission state를 구분한다.
- [ ] App restart 후 Reminder를 복구할 수 있다.
- [ ] Persistence failure와 notification scheduling failure를 구분한다.

### Synchronization

- [ ] Main/Detail/Schedule Popover가 같은 Reminder entity를 읽는다.
- [ ] Schedule 변경이 Reminder scheduling에 즉시 반영된다.
- [ ] Cross-device sync 확장이 가능한 구조다.
- [ ] Rapid mutation에서 마지막 사용자 action이 최종 상태가 된다.

### Architecture

- [ ] Reminder는 별도 entity다.
- [ ] Task당 복수 Reminder를 지원한다.
- [ ] Reminder command layer가 validation/persistence/scheduler를 담당한다.
- [ ] Reminder가 Recurrence rule을 복제하지 않는다.
- [ ] Day/week offset의 calendar semantics를 확장 가능하게 설계한다.

---

# 7. Repeat / Recurrence

## 7.1 Purpose

Repeat / Recurrence는 하나의 Task를 특정 규칙에 따라 반복 발생시키는 scheduling system이다.

핵심 원칙:

```text
Task Schedule
     │
     └── Recurrence Rule
             │
             ├── Daily
             ├── Weekly
             ├── Monthly
             ├── Yearly
             └── Custom
```

Repeat는 단순히 `"weekly"` 같은 문자열 하나를 저장하는 기능이 아니라 다음을 포함한다.

```text
반복 주기
반복 간격
특정 요일
특정 날짜
반복 종료 조건
완료 후 다음 occurrence 처리
수정 범위
삭제 범위
Reminder와의 결합
```

---

## 7.2 Data Model

기본 Recurrence Rule:

```ts
type RecurrenceRule = {
  frequency:
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly";

  interval: number;

  byWeekday: number[] | null;
  byMonthDay: number[] | null;

  endMode:
    | "never"
    | "until"
    | "count";

  until: string | null;
  count: number | null;
};
```

장기적으로는 RFC 5545 / iCalendar RRULE과 의미상 호환되는 구조를 권장한다.

---

## 7.3 Recurrence Is Not a Display String

다음과 같은 UI 문자열을 canonical field로 저장하지 않는다.

```text
❌ "Every Monday"
❌ "Every 2 weeks"
❌ "Monthly on the 15th"
```

대신 구조화된 rule을 저장한다.

예:

```text
Every 2 weeks on Monday and Wednesday
```

```ts
{
  frequency: "weekly",
  interval: 2,
  byWeekday: [1, 3],
  byMonthDay: null,
  endMode: "never",
  until: null,
  count: null
}
```

---

## 7.4 Repeat Entry Point

기본 진입점은 Schedule Popover 내부 `Repeat` row다.

```text
┌─────────────────────────────┐
│ Date / Calendar             │
├─────────────────────────────┤
│ Reminder                >   │
│ Repeat                  >   │
└─────────────────────────────┘
```

Repeat row 클릭:

```text
Schedule Popover
    ↓
Repeat Menu
```

---

## 7.5 No Repeat State

반복이 없는 Task:

```text
Repeat
Never
```

Domain:

```text
recurrenceRule = null
```

Task가 반복하지 않는 경우 빈 rule object를 만들지 않는다.

---

## 7.6 Quick Repeat Presets

기본 quick options:

```text
Never
Daily
Weekly
Monthly
Yearly
Custom
```

날짜 context에 따라 조금 더 구체적인 preset을 보여줄 수 있다.

예:

```text
Every weekday
Every weekend
Every Monday
Every month on the 20th
Every year on Apr 20
```

이들은 UI preset일 뿐 모두 동일한 RecurrenceRule로 변환한다.

---

## 7.7 Daily

```text
Every day
```

Domain:

```ts
{
  frequency: "daily",
  interval: 1,
  byWeekday: null,
  byMonthDay: null,
  endMode: "never",
  until: null,
  count: null
}
```

---

## 7.8 Every N Days

Custom:

```text
Every 3 days
```

```ts
{
  frequency: "daily",
  interval: 3,
  ...
}
```

`interval`은 최소 1이다.

```text
interval <= 0
→ invalid
```

---

## 7.9 Weekly

기본 Weekly는 Task의 현재 schedule weekday를 기준으로 생성한다.

예:

```text
Task date
Monday

Repeat
Weekly
```

결과:

```ts
{
  frequency: "weekly",
  interval: 1,
  byWeekday: [MONDAY],
  ...
}
```

---

## 7.10 Weekly on Multiple Days

Custom weekly:

```text
Every week
Mon Wed Fri
```

Domain:

```ts
{
  frequency: "weekly",
  interval: 1,
  byWeekday: [MONDAY, WEDNESDAY, FRIDAY],
  byMonthDay: null,
  ...
}
```

요일 선택은 multi-select다.

---

## 7.11 Every N Weeks

예:

```text
Every 2 weeks on Tuesday
```

Domain:

```ts
{
  frequency: "weekly",
  interval: 2,
  byWeekday: [TUESDAY],
  ...
}
```

---

## 7.12 Monthly by Date

예:

```text
Every month on the 20th
```

Domain:

```ts
{
  frequency: "monthly",
  interval: 1,
  byWeekday: null,
  byMonthDay: [20],
  ...
}
```

기본 Monthly preset은 Task 시작일의 day-of-month를 사용한다.

---

## 7.13 Monthly by Weekday Position

향후 다음 규칙도 지원 가능해야 한다.

```text
First Monday of every month
Last Friday of every month
```

현재 단순 `byWeekday` + `byMonthDay` 구조만으로 부족할 수 있으므로 장기 권장 모델은 ordinal weekday를 수용한다.

예:

```ts
type MonthlyWeekdayRule = {
  weekday: number;
  ordinal: 1 | 2 | 3 | 4 | 5 | -1;
};
```

예:

```text
Last Friday
```

```ts
{
  weekday: FRIDAY,
  ordinal: -1
}
```

V1에서 이 기능을 제외해도 data migration이 가능하게 설계한다.

---

## 7.14 Monthly Date That Does Not Exist

예:

```text
Every month on the 31st
```

2월에는 31일이 없다.

이 경우 정책을 명확히 한다.

기본 추천:

> 해당 월에 그 날짜가 없으면 그 occurrence를 건너뛴다.

즉:

```text
Jan 31
Feb → skip
Mar 31
Apr → skip
May 31
```

자동으로 마지막 날로 바꾸지 않는다.

향후 `last day of month`는 별도 rule로 지원한다.

---

## 7.15 Last Day of Month

별도 preset:

```text
Last day of every month
```

를 지원할 경우:

```text
31일 반복
```

과 의미를 구분한다.

장기 모델에서는 month-end semantic을 별도 저장하는 것이 좋다.

예:

```ts
byMonthDay: [-1]
```

처럼 RRULE 호환 표현을 사용할 수 있다.

---

## 7.16 Yearly

기본 Yearly는 현재 schedule의 month/day를 사용한다.

예:

```text
Apr 20
→ Every year
```

의미:

```text
Every year on Apr 20
```

---

## 7.17 Leap Day

예:

```text
Feb 29 yearly
```

윤년이 아닌 해에는 occurrence가 존재하지 않는다.

기본 정책:

```text
skip non-leap year
```

Feb 28이나 Mar 1로 자동 변환하지 않는다.

---

## 7.18 Recurrence Requires a Schedule

Repeat는 기준 날짜가 필요하다.

따라서:

```text
schedule = null
+
recurrence
```

상태를 기본적으로 허용하지 않는다.

No Date Task에서 Repeat를 선택하면 먼저 date selection을 요구한다.

예:

```text
Repeat → Weekly
↓
"Choose a date first"
```

또는 Repeat selection flow 안에서 시작 날짜를 함께 설정한다.

---

## 7.19 All-day and Timed Recurrence

Recurrence는 All-day와 Timed Task 모두 지원한다.

### All-day

```text
Every Monday
```

각 occurrence:

```text
Monday all-day
```

### Timed

```text
Every Monday 09:30 - 10:30
```

각 occurrence:

```text
same local time / duration
```

---

## 7.20 Preserve Time and Duration

반복 occurrence는 기본적으로 원본 Task의 time-of-day와 duration을 유지한다.

예:

```text
Every Monday
09:30 - 10:30
```

다음 occurrence:

```text
next Monday
09:30 - 10:30
```

Duration은 `endAt - startAt`에서 derived한다.

---

## 7.21 Timezone Semantics

Timed recurring Task는 Task timezone을 기준으로 반복한다.

핵심 정책:

> 반복은 같은 local wall-clock time을 유지하는 것을 기본으로 한다.

예:

```text
Every Monday
09:00 America/New_York
```

DST가 변경되어도:

```text
09:00 local time
```

을 유지한다.

UTC instant는 계절에 따라 달라질 수 있다.

---

## 7.22 Why Wall-clock Time

Recurring meeting/task는 일반적으로:

```text
매주 월요일 오전 9시
```

라는 의미이지:

```text
매주 정확히 168시간 후
```

라는 의미가 아니다.

따라서 recurring occurrence 계산은 timezone-aware calendar arithmetic을 사용한다.

---

## 7.23 End Modes

반복 종료는 세 가지 mode를 지원한다.

```text
Never
Until date
After N occurrences
```

Domain:

```ts
endMode:
  | "never"
  | "until"
  | "count";
```

---

## 7.24 Never

```ts
{
  endMode: "never",
  until: null,
  count: null
}
```

---

## 7.25 Until Date

예:

```text
Repeat until Dec 31, 2026
```

Domain:

```ts
{
  endMode: "until",
  until: "2026-12-31",
  count: null
}
```

`until`은 recurrence timezone/date semantics와 일관되게 해석한다.

---

## 7.26 Count

예:

```text
Repeat 10 times
```

Domain:

```ts
{
  endMode: "count",
  until: null,
  count: 10
}
```

`count`에는 최초 occurrence 포함 여부를 명확히 해야 한다.

기본 권장:

> 최초 Task occurrence를 count 1로 본다.

---

## 7.27 Invalid End Conditions

다음은 commit하지 않는다.

```text
count < 1
until < first occurrence date
```

Validation feedback을 제공한다.

---

## 7.28 Recurring Task Representation Strategy

여기서 가장 중요한 구조 결정이 있다.

반복 Task를 DB에 미리 무한 생성하면 안 된다.

```text
❌ 앞으로 10년치 occurrence 사전 생성
```

기본 권장:

```text
Series Template / Master
        │
        ↓
Recurrence Rule
        │
        ↓
필요한 occurrence를 계산/생성
```

---

## 7.29 Series vs Occurrence

반복 Task에는 두 개념이 필요하다.

```text
Series
→ 반복 규칙을 가진 원본

Occurrence
→ 특정 날짜에 나타나는 한 번의 반복 instance
```

예:

```text
Series:
Every Monday 9AM

Occurrences:
Aug 24
Aug 31
Sep 7
...
```

---

## 7.30 Recommended Series Model

장기적으로 다음 구조를 권장한다.

```ts
type RecurrenceSeries = {
  id: string;
  taskId: string;
  rule: RecurrenceRule;

  createdAt: string;
  updatedAt: string;
};
```

Task와 recurrence rule을 1:1로 두거나 Task에 `recurrenceRule`을 직접 둘 수 있다.

다만 occurrence-level exception을 지원하려면 series identity가 분리되어 있는 편이 유리하다.

---

## 7.31 Occurrence Identity

각 occurrence는 최소 다음 identity를 가져야 한다.

```text
seriesId
occurrenceStart
```

예:

```text
series: abc
occurrence: 2026-08-24T09:00
```

이 두 값으로 특정 occurrence를 식별할 수 있다.

---

## 7.32 Materialized Occurrence

모든 occurrence를 항상 별도 Task entity로 저장할 필요는 없다.

기본 전략:

```text
Virtual occurrence
→ rule에서 계산

사용자가 해당 occurrence를 수정/완료
→ 필요 시 materialize
```

이 방식이 저장 효율과 exception 처리에 유리하다.

---

## 7.33 Completion Semantics

반복 Task에서 한 occurrence를 완료했다고 Series 전체를 완료하면 안 된다.

예:

```text
Every Monday Task
Aug 24 occurrence complete
```

결과:

```text
Aug 24 → completed
Aug 31 → still scheduled
Series → active
```

---

## 7.34 Completion Creates/Advances Next Occurrence

제품 구현 방식은 두 가지가 있다.

### A. Calendar-computed occurrence

다음 occurrence는 rule에서 계산

### B. Completion-driven next Task

완료할 때 다음 Task 생성

TickTick 스타일 구현에서는 반복 규칙을 기반으로 다음 occurrence가 지속적으로 존재하는 의미가 더 적합하다.

따라서 Master Spec은:

> **Recurrence Rule이 다음 occurrence를 결정하며, Complete action은 Series 자체를 종료하지 않는다.**

를 기본 원칙으로 한다.

---

## 7.35 Overdue Recurrence

이전 occurrence를 완료하지 않았는데 다음 recurrence 날짜가 도래할 수 있다.

예:

```text
Daily Task

Aug 20 미완료
Aug 21 도래
```

정책 선택이 필요하다.

기본 권장:

> 각 occurrence를 독립적으로 표현할 수 있어야 한다.

즉 하나의 Task 날짜만 계속 다음 날로 밀어버리는 방식은 피한다.

이렇게 해야 missed occurrence history를 보존할 수 있다.

---

## 7.36 Recurrence Exceptions

사용자는 특정 occurrence만 수정할 수 있어야 한다.

예:

```text
Every Monday 9AM

Aug 31만 10AM으로 변경
```

이 경우 Series rule은 그대로 유지하고 occurrence exception을 저장한다.

---

## 7.37 Exception Model

권장 개념:

```ts
type RecurrenceException = {
  id: string;
  seriesId: string;

  originalStartAt: string;

  type:
    | "modified"
    | "cancelled";

  overrideTaskId: string | null;
};
```

### Modified

```text
Aug 31 09:00
→ Aug 31 10:00
```

### Cancelled

```text
Aug 31 occurrence only delete
```

---

## 7.38 Edit Scope Prompt

반복 Task를 수정할 때 중요한 선택이 필요하다.

기본 scope:

```text
This occurrence
This and future occurrences
All occurrences
```

모든 변경에 항상 prompt를 띄우면 과도할 수 있으므로 recurrence-impacting 변경에서 사용한다.

예:

```text
Date
Time
Repeat rule
Title
Delete
```

정확한 적용 범위는 property별로 정의한다.

---

## 7.39 This Occurrence

특정 occurrence만 변경한다.

예:

```text
Every Monday 9AM

Aug 31
9AM → 10AM
```

Series rule:

```text
unchanged
```

Exception:

```text
Aug 31 override
```

---

## 7.40 This and Future

현재 occurrence를 기준으로 Series를 둘로 나눈다.

예:

```text
Original:
Every Monday 9AM

From Aug 31:
Every Monday 10AM
```

결과:

```text
Series A
until Aug 24

Series B
starts Aug 31
10AM
```

즉 단순히 기존 rule을 덮어쓰지 않는다.

과거 occurrence 의미를 보존한다.

---

## 7.41 All Occurrences

Series 전체 rule/template를 변경한다.

예:

```text
Every Monday 9AM
↓
Every Tuesday 10AM
```

과거 완료 history는 보존하되 향후 recurrence 계산은 새로운 rule을 적용한다.

이미 발생한 exception의 처리 규칙은 별도로 정의해야 한다.

기본 추천:

- past exceptions 유지
- future exceptions는 충돌 여부 검증

---

## 7.42 Title Edit Scope

Title 같은 비-schedule property도 반복 Task라면 scope가 필요할 수 있다.

예:

```text
Weekly Team Meeting
→ Weekly Planning Meeting
```

기본 권장:

- 현재 occurrence를 직접 연 상태에서 수정하면 scope prompt
- Series 관리 화면에서 수정하면 All future/all series 명확화

V1 단순화가 필요하면 Title edit은 `This and future`를 기본으로 하고 명확한 feedback을 제공할 수 있다.

---

## 7.43 Description / Tag Scope

Description, Tags, Priority도 occurrence별 exception이 가능한 구조가 이상적이다.

하지만 복잡도가 높으므로 V1에서는 다음 우선순위를 권장한다.

```text
Schedule exception 지원
Delete exception 지원
Completion per occurrence 지원
```

그 외 property exception은 후속 확장 가능하게 한다.

---

## 7.44 Delete Scope

Recurring occurrence 삭제 시:

```text
Delete this occurrence
Delete this and future
Delete all occurrences
```

세 가지 scope를 지원할 수 있어야 한다.

---

## 7.45 Delete This Occurrence

Series는 유지.

해당 occurrence에:

```text
cancelled exception
```

을 생성한다.

---

## 7.46 Delete This and Future

현재 occurrence 이전까지만 기존 Series를 유지하고 이후 Series를 종료한다.

예:

```text
Series end
= previous occurrence
```

또는 `until` rule을 조정한다.

---

## 7.47 Delete All

Series 자체를 종료/삭제한다.

과거 history까지 물리 삭제할지는 Trash/History 정책과 분리한다.

기본적으로 soft delete를 권장한다.

---

## 7.48 Repeat Rule Change

Repeat menu에서:

```text
Weekly → Monthly
```

같이 rule을 바꾸면 recurrence-impacting edit이므로 scope 처리가 필요하다.

현재 occurrence context에서 수정한다면:

```text
This and future
All
```

중 선택하게 하는 것이 자연스럽다.

`This occurrence`에 repeat rule을 변경한다는 의미는 모호하므로 일반적으로 제공하지 않는다.

---

## 7.49 Turning Repeat Off

Repeat → Never 선택 시:

현재 occurrence 기준으로:

```text
This and future
All occurrences
```

scope를 고려한다.

기본 의미:

```text
현재 occurrence 이후 더 이상 반복하지 않음
```

즉 `This and future`에 가까운 UX가 자연스럽다.

---

## 7.50 Reminder + Recurrence

Reminder는 Series rule을 복제하지 않는다.

```text
Recurrence
→ occurrence startAt 계산

Reminder
→ occurrence별 fire time 계산
```

예:

```text
Every Monday 9AM
30 min before
```

각 occurrence:

```text
Monday 8:30
```

---

## 7.51 Reminder Exception

특정 occurrence의 시간이 바뀌면 해당 occurrence의 Reminder도 override된 start time을 기준으로 계산한다.

예:

```text
Series
Mon 9AM
Reminder 30m

Occurrence override
Aug 31 → 10AM

Reminder
Aug 31 → 9:30
```

---

## 7.52 Completed Occurrence Reminder

Occurrence가 완료되면 해당 occurrence의 아직 발생하지 않은 Reminder를 취소한다.

다음 occurrence Reminder에는 영향이 없다.

---

## 7.53 Won't Do Occurrence

특정 occurrence를 Won't Do로 처리할 경우:

```text
해당 occurrence 종료
future Series 유지
```

향후 occurrence는 정상 생성된다.

Series 전체를 Won't Do로 바꾸는 action과 구분한다.

---

## 7.54 Reopen Occurrence

Completed/Won't Do occurrence를 Reopen하면 해당 occurrence 상태만 복원한다.

future Series rule은 변경하지 않는다.

---

## 7.55 Recurrence and Parent/Subtask

Subtask도 Task entity이므로 반복 설정을 가질 수 있다.

다만 Parent와 Child recurrence를 자동 연동하지 않는다.

```text
Parent repeat
≠
Child automatically repeats
```

Child가 반복되어야 한다면 명시적으로 repeat rule을 가진다.

---

## 7.56 Repeating Parent with Subtasks

복잡한 case:

```text
Weekly Parent
├─ Child A
└─ Child B
```

Parent occurrence가 새로 생길 때 Child를 어떻게 할지 결정해야 한다.

기본 추천:

> 반복 Parent의 template 구조에 속한 Subtask는 새 occurrence에서도 template-based로 복제될 수 있어야 한다.

다만 이미 완료된 과거 Child state를 그대로 복사하지 않는다.

---

## 7.57 Template Child Semantics

Series template의 Child 정의와 occurrence Child 상태를 구분하는 것이 이상적이다.

V1 구현이 복잡하면:

- Repeating Parent 자체만 지원
- Nested repeating structure는 제한

할 수 있지만 data model은 future extension을 막지 않아야 한다.

---

## 7.58 Recurrence UI Summary

Schedule Popover Repeat row에는 현재 rule을 짧게 표시한다.

예:

```text
Repeat
Every week
```

```text
Repeat
Mon, Wed, Fri
```

```text
Repeat
Every 2 months
```

긴 custom rule은 축약 표시하고 상세는 submenu에서 확인한다.

---

## 7.59 Custom Repeat UI

Custom Repeat 화면 구성 예:

```text
Repeat every
[ 2 ] [ weeks ]

On
[Mon] [Tue] [Wed] [Thu] [Fri] [Sat] [Sun]

Ends
○ Never
○ On date
○ After N times
```

Monthly에서는 rule type에 따라:

```text
On day 20
On the last Friday
```

같은 옵션을 제공할 수 있다.

---

## 7.60 UI Validation

Custom rule은 invalid state를 commit하지 않는다.

예:

```text
Every 0 weeks
Weekly + no weekday selected
Count = 0
Until before start
```

입력 중 draft는 허용하되 commit 전에 validate한다.

---

## 7.61 Repeat Menu Close

Repeat menu/sub-popover는:

```text
Esc
outside click
valid selection/confirm
```

으로 닫을 수 있다.

Task Detail 자체의 close 규칙과 분리한다.

---

## 7.62 Optimistic Update

Repeat preset 선택 시:

```text
Weekly click
↓
Repeat summary 즉시 변경
↓
future occurrences recompute
↓
persistence
```

server response를 기다리지 않는다.

단 recurrence rule 변경은 파급 범위가 크므로 mutation versioning이 필요하다.

---

## 7.63 Occurrence Cache

Calendar/List rendering 성능을 위해 일정 기간의 computed occurrence를 cache할 수 있다.

예:

```text
visible range
-30 days ~ +90 days
```

하지만 cache는 canonical source가 아니다.

Rule/exception이 변경되면 invalidate한다.

---

## 7.64 Infinite Recurrence Expansion

`endMode = never`인 Series를 무한히 materialize하지 않는다.

필요한 date range만 계산한다.

```text
query range
→ occurrence expansion
```

---

## 7.65 Smart Lists

Today/Tomorrow/Next 7 Days는 recurrence occurrence도 정상적으로 query에 포함해야 한다.

예:

```text
Weekly Monday Task
```

오늘이 Monday라면 Today에 표시.

---

## 7.66 Search

Search에서 recurring Task를 검색할 때:

- Series/template result
- current/future occurrence

를 어떻게 보여줄지 제품 정책이 필요하다.

기본 추천:

> 일반 텍스트 검색 결과에서는 Series identity를 중심으로 보여주고, 날짜 기반 View에서는 occurrence를 보여준다.

중복 결과 폭증을 막는다.

---

## 7.67 Calendar

Calendar에서는 각 occurrence를 별도 일정 block으로 표시한다.

Occurrence 수정은 edit scope를 통해 exception/series update로 연결한다.

---

## 7.68 Board/List

일반 Task List에서는 current relevant occurrence를 보여준다.

같은 recurring Series의 미래 occurrence를 무한히 나열하지 않는다.

정확한 View별 expansion window는 각 View spec과 통합한다.

---

## 7.69 Completion History

Recurring Series의 완료율/통계를 만들려면 occurrence별 상태 history가 필요하다.

다음처럼 Series Task의 단일 status를 반복해서 덮어쓰는 방식은 피한다.

```text
❌ Series.status = completed
→ 다음 occurrence에서 open
→ 과거 완료 정보 소실
```

Occurrence-level status record가 필요하다.

---

## 7.70 Recommended Occurrence State Model

장기 권장:

```ts
type RecurrenceOccurrenceState = {
  id: string;
  seriesId: string;

  originalStartAt: string;

  status:
    | "open"
    | "completed"
    | "wont_do"
    | "cancelled";

  completedAt: string | null;

  overrideTaskId: string | null;

  createdAt: string;
  updatedAt: string;
};
```

이 구조로 완료/예외/취소를 occurrence 단위로 보존할 수 있다.

---

## 7.71 Series Active State

Series 자체에는:

```text
active
ended
deleted
```

같은 lifecycle이 필요할 수 있다.

Task의 일반 `completed` 상태와 Series 종료 상태를 혼동하지 않는다.

즉:

```text
Occurrence completed
≠
Series completed
```

---

## 7.72 Recurrence Command Layer

UI component가 rule/exception을 직접 조작하지 않는다.

개념 command:

```ts
setRecurrence(taskId, rule, scope)
clearRecurrence(taskId, scope)

modifyOccurrence(seriesId, occurrenceStart, patch)
cancelOccurrence(seriesId, occurrenceStart)

completeOccurrence(seriesId, occurrenceStart)
reopenOccurrence(seriesId, occurrenceStart)
```

---

## 7.73 Command Responsibilities

Recurrence command layer가 담당한다.

```text
Rule validation
Scope resolution
Series split
Exception creation
Occurrence cache invalidation
Reminder rescheduling
Persistence
Optimistic update
Failure rollback
```

---

## 7.74 Series Split Transaction

`This and future` 수정은 여러 entity를 변경할 수 있으므로 atomic transaction으로 처리하는 것이 좋다.

예:

```text
1. Old Series end
2. New Series create
3. Current/future Reminder relation copy
4. Future exceptions migrate/validate
```

중간 상태로 저장되면 안 된다.

---

## 7.75 Failure Rollback

Series edit에 실패하면:

```text
rule summary
occurrences
reminders
calendar blocks
```

전체를 이전 상태로 rollback해야 한다.

일부만 성공한 것처럼 보이면 안 된다.

---

## 7.76 Rapid Rule Changes

사용자가 빠르게:

```text
Weekly
→ Daily
→ Monthly
```

로 바꾸면 마지막 action이 최종 상태다.

늦은 이전 response가 최신 rule을 덮어쓰지 않도록 mutation version을 사용한다.

---

## 7.77 Offline / Local-first

Recurrence rule 자체는 local-first로 수정 가능하다.

다만 복잡한 `This and future` series split은 sync conflict 가능성이 있으므로 transaction/event log 기반 구조가 유리하다.

V1에서도 최소한 conflict가 발생했을 때 silent overwrite하지 않도록 한다.

---

## 7.78 Conflict Principle

다른 device에서 동일 Series rule을 동시에 수정한 경우:

```text
last write wins
```

만으로 과거 Series split이 유실될 수 있다.

향후 sync layer에서 version/revision을 지원할 수 있도록 Series에 revision 개념을 추가할 수 있다.

```ts
revision: number
```

이 필드는 core V1 필수는 아니지만 확장 여지를 둔다.

---

## 7.79 Prohibited Patterns

- `repeat: "weekly"` 문자열 하나만으로 모든 recurrence 의미를 표현
- 미래 occurrence를 무한 사전 생성
- 한 occurrence 완료를 Series 전체 완료로 처리
- 반복 Task의 `status` 하나를 매번 open/completed로 덮어써 과거 기록 소실
- 특정 occurrence 수정 시 Series 전체를 무조건 변경
- `This and future` 수정에서 과거 occurrence까지 재작성
- Repeat off 시 과거 history 삭제
- 31일 monthly recurrence를 매월 자동 마지막 날로 변환
- Feb 29 yearly를 비윤년마다 임의 날짜로 이동
- Timed recurrence를 단순 24h/168h duration 반복으로 계산
- Reminder가 recurrence rule을 복제 저장
- View마다 독자적인 occurrence 계산 로직 사용
- Calendar에 infinite recurrence를 모두 materialize
- exception 없이 특정 occurrence override를 원본 rule에 덮어쓰기

---

## 7.80 Acceptance Criteria

### Basic Repeat

- [ ] Repeat 없는 Task에 Daily/Weekly/Monthly/Yearly를 설정할 수 있다.
- [ ] Repeat를 Never로 되돌릴 수 있다.
- [ ] Every N days/weeks/months/years를 표현할 수 있다.
- [ ] Weekly multi-day selection을 지원할 수 있다.
- [ ] Repeat에는 기준 schedule이 필요하다.

### End Condition

- [ ] Never를 지원한다.
- [ ] Until date를 지원한다.
- [ ] After N occurrences를 지원한다.
- [ ] Invalid end condition을 commit하지 않는다.
- [ ] Count의 첫 occurrence 포함 의미가 명확하다.

### Time / Calendar Semantics

- [ ] Timed recurrence가 local wall-clock time을 유지한다.
- [ ] DST가 있어도 timezone-aware recurrence를 계산한다.
- [ ] Duration을 occurrence마다 유지한다.
- [ ] Monthly invalid date 처리 규칙이 일관된다.
- [ ] Leap-day yearly 처리 규칙이 일관된다.

### Occurrence

- [ ] Series와 Occurrence 개념이 분리된다.
- [ ] 한 occurrence Complete가 Series 전체를 완료하지 않는다.
- [ ] Missed occurrence history를 보존 가능한 구조다.
- [ ] Infinite recurrence를 무한 materialize하지 않는다.
- [ ] 필요한 date range만 occurrence expansion한다.

### Edit Scope

- [ ] This occurrence를 수정할 수 있다.
- [ ] This and future를 수정할 수 있다.
- [ ] All occurrences를 수정할 수 있다.
- [ ] This and future가 Series split으로 처리될 수 있다.
- [ ] 특정 occurrence 수정이 Series rule을 불필요하게 변경하지 않는다.

### Delete Scope

- [ ] This occurrence delete를 지원할 수 있다.
- [ ] This and future delete를 지원할 수 있다.
- [ ] All occurrences delete를 지원할 수 있다.
- [ ] Delete scope가 past history를 불필요하게 소실시키지 않는다.

### Reminder Integration

- [ ] Relative Reminder가 occurrence별 start time을 기준으로 계산된다.
- [ ] Occurrence time override 시 Reminder도 해당 occurrence 기준으로 재계산된다.
- [ ] 한 occurrence 완료 시 그 occurrence의 pending Reminder만 취소된다.
- [ ] Recurrence rule과 Reminder rule을 중복 저장하지 않는다.

### View Synchronization

- [ ] Calendar가 occurrence를 별도 block으로 표시할 수 있다.
- [ ] Today/Tomorrow 등 smart list가 occurrence를 올바르게 포함한다.
- [ ] List/Search에서 infinite duplicate result를 만들지 않는다.
- [ ] 모든 View가 동일 recurrence expansion logic을 사용한다.

### Architecture

- [ ] RecurrenceRule이 구조화된 데이터다.
- [ ] Series identity를 지원할 수 있다.
- [ ] Occurrence exception/cancel state를 지원할 수 있다.
- [ ] Recurrence command layer가 scope/transaction/rollback을 담당한다.
- [ ] Rapid mutation에서 마지막 사용자 action이 최종 state가 된다.

---

# 8. Priority

## 8.1 Purpose

Priority는 Task의 상대적 중요도를 빠르게 표시하고, 정렬·필터·시각적 강조에 사용할 수 있는 단일 속성이다.

Canonical value:

```ts
type TaskPriority =
  | "none"
  | "low"
  | "medium"
  | "high";
```

핵심 원칙:

```text
Priority
→ 하나의 Task property

Detail / List / Board / Calendar / Search
→ 모두 같은 값을 읽음
```

View별 별도 priority state를 만들지 않는다.

---

## 8.2 Entry Point

Task Detail 상단 우측의 flag control을 기본 진입점으로 사용한다.

```text
□ │ Apr 20, 9:30 PM - 10:30 PM │ ⚑
                                  ↑
                               Priority
```

Main View의 Task Row에 priority flag가 노출되는 경우에도 같은 property를 조작한다.

---

## 8.3 Default State

Priority가 없는 Task:

```ts
priority = "none";
```

Visual:

```text
⚐ / muted flag / empty state
```

정확한 icon/color는 Visual System에서 확정한다.

---

## 8.4 Priority Levels

지원 level:

```text
None
Low
Medium
High
```

의미:

```text
None
→ 별도 중요도 없음

Low
→ 낮은 우선순위

Medium
→ 중간 우선순위

High
→ 높은 우선순위
```

Priority는 status와 별개다.

```text
High + Completed
가능

Low + Won't Do
가능
```

---

## 8.5 Flag Trigger Click

Flag click:

```text
Priority trigger
   ↓
Priority Popover open
```

Popover 예:

```text
┌────────────────────┐
│ None               │
│ Low                │
│ Medium             │
│ High               │
└────────────────────┘
```

현재 선택된 priority는 selected state로 표시한다.

---

## 8.6 Popover State

Priority Popover는 Task domain과 분리된 UI state다.

예:

```ts
activePopover = {
  type: "priority",
  taskId: "task-a"
};
```

Popover를 열었다고 Task priority가 바뀌지 않는다.

사용자가 option을 선택할 때만 mutation한다.

---

## 8.7 Selection

예:

```text
Current
None

↓ High click

High
```

Domain:

```ts
updateTask(taskId, {
  priority: "high"
});
```

UI는 optimistic update한다.

---

## 8.8 Re-select Same Priority

현재 High 상태에서 다시 High를 클릭해도 별도 mutation을 발생시키지 않는 것을 기본으로 한다.

```text
high → high
```

은 no-op이다.

불필요한 persistence/history를 만들지 않는다.

---

## 8.9 Clear Priority

`None` 선택은 priority 제거 의미다.

```ts
priority = "none";
```

별도의:

```ts
priority = null
```

과 혼합하지 않는다.

Canonical empty state는 `"none"` 하나로 통일한다.

---

## 8.10 Popover Close Behavior

Priority Popover는 다음으로 닫을 수 있다.

```text
option 선택
Esc
outside click
```

Option 선택 후에는 기본적으로 즉시 닫는다.

Priority는 한 번에 하나만 선택하는 single-select property이므로 Reminder처럼 Popover를 계속 유지할 필요가 적다.

---

## 8.11 Esc Priority

Esc 우선순위는 기존 Shell 규칙을 따른다.

```text
Priority Popover open
↓ Esc
Priority Popover close

↓ Esc
Task Detail close
```

---

## 8.12 Outside Click

Priority Popover는 floating surface이므로 outside click으로 닫는다.

```text
Priority Popover
→ outside click close ✅

Task Detail
→ outside click close ❌
```

---

## 8.13 Detail Trigger Display

Priority trigger는 현재 value를 즉시 반영한다.

예:

```text
None
→ muted flag

Low
→ low-priority flag

Medium
→ medium-priority flag

High
→ high-priority flag
```

색상/채도/아이콘 fill 여부는 Visual System에서 통합 정의한다.

---

## 8.14 Main View Synchronization

Detail에서 High로 변경하면 Main View도 즉시 갱신된다.

```text
Detail
None → High
   ↓
Task Store
   ↓
Main View flag
None → High
```

반대로 Main View inline priority 변경도 Detail에 즉시 반영된다.

---

## 8.15 Board Synchronization

Board Card가 priority indicator를 표시한다면 동일 Task entity를 읽는다.

Priority 변경으로 Board 내 sort/group 위치가 바뀔 수 있다.

예:

```text
Group by Priority
```

상태에서:

```text
Low → High
```

변경 시 Card는 High group으로 이동한다.

Detail은 유지한다.

---

## 8.16 List / Smart Filter Synchronization

Priority 기반 filter/smart list에 즉시 반영되어야 한다.

예:

```text
Filter = High only
Task A = High
```

Detail에서:

```text
High → Low
```

하면 Main View에서는 Task A가 사라질 수 있다.

3장 Selection 규칙에 따라:

```text
Main View에서 row 제거
Detail은 유지
```

한다.

---

## 8.17 Sort by Priority

Priority sort가 켜져 있으면 mutation 후 Task row 위치가 바뀔 수 있다.

예:

```text
High
Medium
Low
None
```

정렬 순서는 View/Sort spec에서 최종 확정한다.

하지만 기본 severity order는:

```text
high
medium
low
none
```

을 권장한다.

---

## 8.18 Priority Is Not Due Urgency

Priority와 overdue/near-due 상태를 혼합하지 않는다.

```text
Priority
→ 사용자가 지정한 중요도

Overdue
→ Schedule에서 계산한 시간 상태
```

예:

```text
Low + Overdue
가능

High + No Date
가능
```

---

## 8.19 Priority Is Not Status

```text
priority
≠
status
```

완료한다고 priority를 자동으로 `none`으로 바꾸지 않는다.

Reopen해도 기존 priority는 그대로 유지한다.

---

## 8.20 Priority and Recurrence

Recurring Task의 priority는 기본적으로 Series-level property로 취급한다.

즉:

```text
Weekly Task = High
```

이면 future occurrence도 High를 상속한다.

특정 occurrence만 priority를 다르게 하려면 recurrence exception을 통해 override할 수 있는 구조로 확장 가능하다.

V1에서는 Series-level priority를 기본으로 한다.

---

## 8.21 Priority and Subtasks

Parent와 Subtask priority는 자동 연동하지 않는다.

```text
Parent = High
Child A = None
Child B = Medium
```

유효하다.

Parent priority 변경이 Child를 강제로 변경하지 않는다.

---

## 8.22 Priority and Checklist

Checklist Item에는 별도 priority를 두지 않는다.

```text
Task priority
→ Task 수준

CheckItem
→ simple item
```

Priority가 필요한 단위라면 Subtask로 만들어야 한다.

---

## 8.23 Inline Main View Priority Control

Main View에서 priority flag가 노출된다면 click은 row selection과 분리한다.

```text
flag click
→ Priority Popover
→ selectedTaskId 변경 없음
```

이미 해당 Task Detail이 열려 있다면 selection은 유지한다.

---

## 8.24 Context Menu Priority

Context Menu에서도 Priority submenu를 제공할 수 있다.

```text
Priority >
  None
  Low
  Medium
  High
```

하지만 이것도 동일 command를 사용한다.

별도 mutation logic을 만들지 않는다.

---

## 8.25 Keyboard Navigation

Priority Popover 기본 keyboard behavior:

```text
Arrow Up / Down
→ option 이동

Enter / Space
→ option 선택

Esc
→ Popover close

Tab
→ 다음 focusable element
```

정확한 focus management는 Accessibility 장과 통합한다.

---

## 8.26 Direct Keyboard Shortcut

향후 빠른 priority shortcut을 지원할 수 있다.

예:

```text
1 → High
2 → Medium
3 → Low
0 → None
```

정확한 key mapping은 Keyboard & Focus System에서 확정한다.

Shortcut을 쓰더라도 command semantics는 동일하다.

---

## 8.27 Tooltip

Flag icon만 보이는 경우 hover/focus tooltip을 제공한다.

예:

```text
Priority: High
```

None 상태:

```text
Set priority
```

아이콘 의미를 색상만으로 전달하지 않는다.

---

## 8.28 Accessibility Label

Priority trigger는 현재 상태를 포함한 accessible name을 가져야 한다.

예:

```text
"Priority, High"
```

None:

```text
"Set priority"
```

각 option도 text label을 제공한다.

---

## 8.29 Color Is Supplemental

Priority는 색상만으로 구분하지 않는다.

다음 조합을 사용한다.

```text
icon
+
text label
+
selected state
+
color
```

Color vision deficiency 환경에서도 의미를 구분할 수 있어야 한다.

---

## 8.30 Visual Hierarchy

Priority는 중요하지만 Date/Title보다 시각적으로 과도하게 강해지지 않게 한다.

기본 원칙:

```text
High
→ 분명한 강조

Medium / Low
→ 단계적 강조

None
→ muted
```

전체 Task row 배경을 강한 priority color로 채우는 방식은 기본으로 사용하지 않는다.

---

## 8.31 Priority Command Layer

컴포넌트마다 직접:

```ts
task.priority = "high";
```

하지 않는다.

공통 command:

```ts
setTaskPriority(taskId, priority);
```

책임:

```text
validation
no-op detection
optimistic update
persistence
query/sort invalidation
failure rollback
```

---

## 8.32 Validation

허용되는 값 외의 priority는 commit하지 않는다.

```text
none
low
medium
high
```

만 valid.

서버/DB에서 잘못된 값이 들어오면 안전하게 `none` fallback 또는 data error handling을 수행한다.

---

## 8.33 Optimistic Update

Priority click:

```text
High select
↓
flag 즉시 변경
↓
store update
↓
sort/filter 즉시 반영
↓
persistence
```

서버 응답을 기다리지 않는다.

---

## 8.34 Persistence Failure

저장 실패:

```text
High UI
↓ save failed
rollback
↓
previous priority
```

error feedback을 제공한다.

Sort/filter로 row가 이미 이동했더라도 rollback 시 원래 위치로 복원한다.

---

## 8.35 Rapid Changes

사용자가 빠르게:

```text
None
→ High
→ Medium
→ Low
```

로 바꾸면 마지막 사용자 action이 최종 상태가 되어야 한다.

늦게 도착한 이전 persistence response가 최신 value를 덮어쓰지 않도록 mutation ordering/versioning을 적용한다.

---

## 8.36 Undo

Priority 변경은 반드시 toast Undo까지 제공해야 하는 핵심 destructive action은 아니다.

기본 권장:

```text
Priority change
→ direct edit
→ Cmd/Ctrl+Z 또는 activity undo system 확장 가능
```

별도 Toast Undo는 V1 필수로 하지 않는다.

---

## 8.37 Activity History

향후 Task Activity를 지원하면 다음 이벤트를 기록할 수 있다.

```text
Priority changed
None → High
```

현재 Task entity에 priority history 배열을 저장하지 않는다.

---

## 8.38 Offline / Local-first

Priority 변경은 local-first로 처리 가능하다.

```text
click
→ immediate local state
→ persistence/sync
```

네트워크 latency로 flag update가 지연되지 않는다.

---

## 8.39 Prohibited Patterns

- Priority를 boolean으로 표현
- `null`과 `"none"`을 혼합해 empty state를 두 개로 관리
- Detail/List/Board별 별도 priority state
- Complete 시 priority 자동 제거
- Parent priority를 Child에 강제 복제
- Checklist Item에 Task-level priority 기능 추가
- Priority와 overdue severity를 같은 속성으로 사용
- Flag 색상만으로 상태 의미 전달
- Server response 후에야 flag 변경
- Main View inline priority click이 row selection까지 발생
- View별 서로 다른 priority mutation logic
- 잘못된 priority value를 그대로 렌더

---

## 8.40 Acceptance Criteria

### Basic

- [ ] None / Low / Medium / High를 지원한다.
- [ ] Flag trigger로 Priority Popover를 열 수 있다.
- [ ] 현재 priority가 selected state로 표시된다.
- [ ] Priority를 다른 level로 변경할 수 있다.
- [ ] None을 선택해 priority를 제거할 수 있다.
- [ ] 동일 priority 재선택은 불필요한 mutation을 만들지 않는다.

### Interaction

- [ ] Option 선택 후 Popover가 닫힌다.
- [ ] Esc로 Popover를 닫을 수 있다.
- [ ] Outside click으로 Popover를 닫을 수 있다.
- [ ] Main View inline flag click은 Task selection을 강제하지 않는다.
- [ ] Keyboard로 option 탐색/선택이 가능하다.

### Synchronization

- [ ] Detail에서 변경한 priority가 Main View에 즉시 반영된다.
- [ ] Main View에서 변경한 priority가 Detail에 즉시 반영된다.
- [ ] Board/Calendar/Search가 같은 Task priority를 읽는다.
- [ ] Priority filter/group/sort가 mutation에 즉시 반응한다.
- [ ] Priority 변경으로 Task가 현재 query에서 빠져도 열린 Detail은 유지된다.

### Semantics

- [ ] Priority와 Status가 독립적이다.
- [ ] Priority와 Overdue가 독립적이다.
- [ ] Completed/Reopen으로 priority가 자동 초기화되지 않는다.
- [ ] Parent/Child priority가 자동 연동되지 않는다.
- [ ] Checklist Item에는 별도 Task priority를 두지 않는다.

### Accessibility

- [ ] Priority trigger에 accessible label이 있다.
- [ ] Color 외에도 icon/text/selected state로 의미를 전달한다.
- [ ] Keyboard focus state가 명확하다.
- [ ] Tooltip 또는 동등한 설명을 제공한다.

### Architecture

- [ ] Canonical empty value는 `"none"`이다.
- [ ] `setTaskPriority()` 같은 공통 command를 사용한다.
- [ ] Optimistic update와 failure rollback을 지원한다.
- [ ] Rapid mutation에서 마지막 사용자 action이 최종 state가 된다.
- [ ] View별 별도 priority business logic을 만들지 않는다.

---

# 9. Title Editor

## 9.1 Purpose

Title Editor는 Task의 가장 핵심적인 텍스트 입력 영역이며, 다음 세 가지 목표를 동시에 만족해야 한다.

```text
빠른 확인
빠른 수정
안전한 자동 저장
```

핵심 원칙:

> Task Detail이 열리는 것과 Title을 편집하는 것은 서로 다른 상태다.

즉:

```text
Task 선택
→ Detail open
→ Title은 read/view state

Title click
→ editing state
```

Task Detail을 열었다고 Title input에 자동 focus하지 않는다.

---

## 9.2 Canonical Data

Title의 canonical field는 2장에서 확정한:

```ts
title: string;
```

하나다.

다음과 같은 중복 field를 만들지 않는다.

```text
❌ taskName
❌ displayTitle
❌ titleDraft persisted
❌ summary
```

편집 중 draft는 UI state로만 존재한다.

---

## 9.3 Visual Position

Title은 Property Header 바로 아래 Content Header의 핵심 요소다.

```text
┌─────────────────────────────────────┐
│ □ │ Date / Time              │ ⚑    │
├─────────────────────────────────────┤
│                                     │
│ Task Title                      ☷   │
│                                     │
├─────────────────────────────────────┤
│ Description / Checklist             │
└─────────────────────────────────────┘
```

Title은 Task Detail에서 가장 높은 텍스트 hierarchy를 가진다.

---

## 9.4 State Model

Title Editor는 최소 다음 상태를 구분한다.

```text
VIEW
FOCUSED
EDITING
DIRTY
SAVING
ERROR
```

개념적으로:

```ts
type TitleEditorState = {
  taskId: string;

  draft: string;
  isFocused: boolean;
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
};
```

Domain Task와는 분리된 UI/editor state다.

---

## 9.5 View State

Detail이 처음 열렸을 때:

```text
SU Meeting
```

은 읽기 상태다.

다음은 발생하지 않는다.

```text
❌ caret 자동 표시
❌ text 전체 선택
❌ keyboard focus 강제 이동
```

사용자가 Title을 직접 클릭해야 editing으로 진입한다.

---

## 9.6 Enter Editing State

Title click:

```text
VIEW
↓ click
EDITING
```

Editing 진입 시:

```text
Task.title
→ editor draft로 복사
```

예:

```ts
draft = task.title;
```

단 이 draft를 별도 persistence source로 취급하지 않는다.

---

## 9.7 Caret Placement

Title의 특정 위치를 클릭했다면 caret은 클릭한 텍스트 위치에 놓는다.

단순히:

```text
click anywhere
→ caret always end
```

로 강제하지 않는다.

Keyboard로 editing에 진입한 경우에는 플랫폼 관례에 맞춰 caret을 끝에 둘 수 있다.

---

## 9.8 No Full-text Auto-selection

편집 진입 시 기존 제목 전체를 자동 선택하지 않는 것을 기본값으로 한다.

이유:

- 작은 수정이 흔함
- 실수로 타이핑해 제목 전체를 덮어쓰는 위험 감소

전체 선택은 일반 OS shortcut을 사용한다.

```text
Cmd/Ctrl + A
```

---

## 9.9 Single-line Editor

Task Title은 **single logical title**로 취급한다.

기본적으로 multiline title 입력은 허용하지 않는다.

```text
Enter
→ line break ❌
```

Paste 시 newline이 포함되어 있으면 normalize한다.

예:

```text
"Meeting
Notes"
```

→

```text
"Meeting Notes"
```

또는 whitespace 하나로 치환한다.

정확한 whitespace normalization은 아래 규칙을 따른다.

---

## 9.10 Enter Behavior

Title editing 중 Enter:

```text
draft commit
↓
editing 종료
↓
focus는 Detail 내 안정적인 다음 context 또는 Title view 상태
```

기본적으로 Enter가 Description으로 newline을 삽입하지 않는다.

Title field의 Enter는 **commit action**이다.

---

## 9.11 Shift + Enter

Title은 multiline을 허용하지 않으므로:

```text
Shift + Enter
```

도 line break를 만들지 않는다.

기본적으로 Enter와 동일한 commit으로 처리하거나 no-op으로 둘 수 있다.

권장:

```text
Shift + Enter
→ same as Enter
```

키 조합별 예외를 최소화한다.

---

## 9.12 Escape Behavior

Title editing 중 Esc:

```text
현재 draft가 변경되지 않음
→ editing 종료

현재 draft가 변경됨
→ 마지막 committed title로 rollback
→ editing 종료
```

즉 Esc는 **cancel current uncommitted edit** 의미다.

예:

```text
Committed:
SU Meeting

Draft:
SU Meeting 2

↓ Esc

SU Meeting
```

---

## 9.13 Blur Behavior

다른 곳을 클릭해 Title focus가 빠질 때:

```text
valid dirty draft
→ commit

unchanged draft
→ no-op

invalid draft
→ validation rule 적용
```

즉 일반적인 마우스 흐름에서 별도 Save 버튼을 누를 필요가 없다.

---

## 9.14 Autosave Principle

Title은 명시적 Save 버튼을 사용하지 않는다.

```text
❌ Save button
✅ Autosave / implicit commit
```

다만 모든 keypress마다 원격 DB에 요청하는 방식은 피한다.

---

## 9.15 Local Draft vs Persisted Title

입력 흐름:

```text
Task.title = "SU Meeting"

click Title
↓
draft = "SU Meeting"

typing
↓
draft = "SU Meeting 2"

commit
↓
Task.title = "SU Meeting 2"
```

Draft를 domain store의 canonical `title`과 동일하게 취급하지 않는다.

---

## 9.16 Debounced Autosave

긴 편집 중 변경을 보존하기 위해 debounce save를 지원할 수 있다.

권장 초기값:

```text
300–500ms
```

예:

```text
typing
↓
local draft 즉시 변경
↓
500ms idle
↓
commit/update
```

단 Enter/Blur/Task switch 직전에는 debounce를 기다리지 않고 즉시 flush한다.

---

## 9.17 Commit Triggers

Title draft를 commit하는 주요 trigger:

```text
Enter
Blur
Debounce timeout
Task switch 전
Detail close 전
Primary navigation 전
App background/unload 가능한 시점
```

이 중 일부는 동일 `flushTitleDraft()` command로 통합한다.

---

## 9.18 Task Switch During Editing

Task A Title을 편집 중 Task B를 클릭할 수 있다.

```text
Task A editing
↓
Task B click
```

기본 규칙:

```text
1. Task A valid draft flush
2. Task A mutation commit
3. selectedTaskId → B
4. Task B Detail 표시
```

Task switch 때문에 입력 내용을 조용히 버리지 않는다.

---

## 9.19 Detail Close During Editing

Title editing 중 Detail Close:

```text
valid draft
→ flush
→ Detail close
```

Esc가 Title Editor 내부에서 눌린 경우는 9.12의 cancel semantics가 우선한다.

즉:

```text
Title focused + Esc
→ Title draft cancel
→ Detail 유지

다시 Esc
→ Detail close
```

전역 Esc 우선순위와 일치한다.

---

## 9.20 Primary Navigation During Editing

다른 List/View로 이동하는 경우:

```text
valid draft flush
↓
navigation
```

네비게이션 때문에 최신 Title 입력이 손실되지 않아야 한다.

---

## 9.21 Empty Title

Task Title이 빈 문자열이 되는 경우 정책이 필요하다.

기본 권장:

> 기존 Task를 편집하는 경우 empty title commit을 허용하지 않는다.

예:

```text
"SU Meeting"
↓ 전부 삭제
""
↓ blur
```

결과:

```text
마지막 valid committed title로 복원
```

또는 inline validation을 보여준다.

---

## 9.22 New Task Creation Exception

새 Task 생성 flow에서는 임시 empty title이 존재할 수 있다.

하지만 생성 확정 시:

```text
trim(title).length === 0
```

이면 Task 생성 자체를 취소/보류한다.

기존 Task edit과 새 Task create의 empty-title semantics를 섞지 않는다.

---

## 9.23 Whitespace-only Title

다음은 empty와 동일하게 취급한다.

```text
"     "
"\t"
```

Commit 전에 trim/validation한다.

---

## 9.24 Leading / Trailing Whitespace

Commit 시 title의 leading/trailing whitespace는 제거하는 것을 기본으로 한다.

예:

```text
"  SU Meeting  "
```

→

```text
"SU Meeting"
```

사용자가 의도한 내부 공백은 유지한다.

---

## 9.25 Repeated Spaces

내부 repeated spaces를 강제로 하나로 줄일 필요는 없다.

예:

```text
"Research  Meeting"
```

을 사용자 입력 그대로 유지할 수 있다.

단 paste newline normalization 과정에서 생긴 불필요한 whitespace는 합리적으로 정리한다.

---

## 9.26 Newline Normalization

Single-line Title에 newline이 paste되면:

```text
CR/LF
→ single space
```

로 normalize한다.

예:

```text
"Weekly
Team
Meeting"
```

→

```text
"Weekly Team Meeting"
```

여러 newline/space 조합이 과도한 공백을 만들지 않도록 normalize한다.

---

## 9.27 Maximum Length

Title에는 명확한 max length를 둔다.

정확한 TickTick 실측값을 확보하지 못한 상태에서는 구현 token/constant로 정의한다.

예:

```ts
TASK_TITLE_MAX_LENGTH = 500;
```

단 값 자체는 향후 audit로 교체 가능해야 한다.

하드코딩을 여러 컴포넌트에 반복하지 않는다.

---

## 9.28 Max Length UX

최대 길이에 도달하면:

```text
추가 입력 차단
```

또는:

```text
validation feedback
```

을 제공한다.

사용자가 입력한 기존 텍스트를 임의로 잘라 저장하지 않는다.

Paste로 초과된 경우에도 명확한 처리 규칙을 적용한다.

---

## 9.29 Character Counter

일반적인 짧은 Title에서는 counter를 항상 노출하지 않는다.

Max에 가까워졌을 때만:

```text
480 / 500
```

처럼 보조 정보를 보여줄 수 있다.

V1 필수 요소는 아니다.

---

## 9.30 IME Composition

한국어/중국어/일본어 입력에서 매우 중요하다.

IME composition 중에는:

```text
Enter
```

가 글자 조합 확정일 수 있다.

따라서:

```text
compositionstart
compositionupdate
compositionend
```

상태를 추적한다.

---

## 9.31 Enter During IME

```text
isComposing = true
```

인 동안 Enter:

```text
Title commit ❌
IME composition 처리 ✅
```

composition이 종료된 이후의 Enter만 commit으로 처리한다.

---

## 9.32 Debounce During IME

IME composition 중간값을 원격 persistence에 불필요하게 저장하지 않는다.

권장:

```text
composition 중
→ local draft only

compositionend
→ debounce restart
```

한글 자모 조합 중간값 등이 server history에 남지 않게 한다.

---

## 9.33 Paste

Plain text paste를 기본으로 한다.

Rich HTML을 paste해도 Title에는 formatting을 유지하지 않는다.

```text
<strong>Meeting</strong>
→ "Meeting"
```

Title은 rich-text field가 아니다.

---

## 9.34 Drag / Drop Text

Text drag/drop이 가능한 브라우저에서도 결과는 plain text로 normalize한다.

파일 drop은 Title field에서 Attachment 기능으로 해석하지 않는다.

Attachment drop target은 Description/Attachment area에서 별도로 처리한다.

---

## 9.35 Emoji / Unicode

Emoji와 일반 Unicode title을 허용한다.

예:

```text
📌 Weekly Meeting
研究ミーティング
회의 준비
```

문자 수 제한은 UTF-16 code unit이 아니라 사용자 인식 문자(grapheme) 기준을 고려하는 것이 이상적이다.

V1에서는 library/runtime 제약에 따라 구현하되 surrogate pair를 잘못 잘라 저장하지 않는다.

---

## 9.36 URL-like Text

Title에 URL이 있어도 Title Editor 자체에서는 링크로 자동 interactive하게 만들지 않는다.

```text
https://example.com
```

은 title text다.

링크 인식/열기는 Description Editor에서 처리하는 편이 자연스럽다.

---

## 9.37 Markdown in Title

Title에 `**bold**`, `# heading` 등을 입력해도 기본적으로 Markdown formatting으로 렌더하지 않는다.

Task Title은 plain text 의미를 유지한다.

---

## 9.38 Keyboard Shortcuts While Editing

Title Editor가 focus된 상태에서는 일반 텍스트 편집 shortcut을 우선한다.

예:

```text
Cmd/Ctrl + A → Select all text
Cmd/Ctrl + C → Copy
Cmd/Ctrl + V → Paste
Cmd/Ctrl + Z → text edit undo
```

앱 전역 shortcut이 Title typing을 가로채지 않는다.

---

## 9.39 Global Shortcut Suppression

Title Editor focus 중:

```text
P
1
T
```

같은 단일-key global shortcut이 있다면 text input으로 우선 처리한다.

즉:

```text
editing context
→ text input priority
```

Keyboard & Focus System에서 공통 규칙으로 다시 통합한다.

---

## 9.40 Undo Layers

두 종류의 Undo를 구분한다.

### Editor Undo

```text
typing
→ Cmd/Ctrl+Z
```

브라우저/editor의 local text history.

### Task Mutation Undo

이미 commit된 Title 변경을 되돌리는 app-level action.

두 시스템을 억지로 하나로 합치지 않는다.

---

## 9.41 Autosave Indicator

일반적인 빠른 편집에서는:

```text
Saving...
Saved
```

텍스트를 항상 노출하지 않는 것을 기본으로 한다.

필요하다면 subtle state로 제공한다.

예:

```text
error 발생 시에만 명확히 노출
```

정상 저장은 조용히 처리한다.

---

## 9.42 Saving State

Debounced commit 후 persistence 중에도 사용자는 계속 입력할 수 있다.

```text
Saving request #1
↓
user continues typing
↓
draft newer than request #1
```

이전 save response가 현재 draft를 덮어쓰면 안 된다.

---

## 9.43 Mutation Versioning

Title save는 revision/sequence를 사용해 latest-write semantics를 보장한다.

예:

```text
save #1 → "Meeting A"
save #2 → "Meeting AB"

#2가 최신
```

#1 응답이 늦게 도착해도:

```text
"Meeting A"
```

로 rollback하지 않는다.

---

## 9.44 Optimistic Domain Update

Commit 시:

```text
draft
↓
Task Store title 즉시 update
↓
List/Board/Search/Calendar/Detail 즉시 update
↓
persistence
```

서버 응답 후 다른 View가 바뀌는 방식은 사용하지 않는다.

---

## 9.45 Persistence Failure

저장 실패 시 두 상황을 구분한다.

### User가 더 이상 편집하지 않는 경우

이전 committed value로 rollback + error feedback 가능.

### 실패 이후에도 사용자가 계속 입력 중

최신 draft를 조용히 과거 값으로 덮어쓰면 안 된다.

이 경우:

```text
unsaved/error state 표시
retry 가능
```

를 우선한다.

---

## 9.46 Retry

저장 실패 시:

```text
Retry
```

또는 자동 재시도 정책을 지원할 수 있다.

최신 draft/revision을 기준으로 retry한다.

오래된 failed request를 다시 적용하지 않는다.

---

## 9.47 Offline Editing

Offline/local-first 구조에서는 Title 수정이 즉시 local persistence에 반영되고 sync queue에 들어갈 수 있다.

```text
typing
→ local commit
→ sync pending
```

사용자는 네트워크 복구를 기다리지 않고 계속 작업 가능해야 한다.

---

## 9.48 Cross-view Synchronization

Title mutation:

```text
Detail Title
      ↓
same Task entity
      ├─ Main List
      ├─ Board
      ├─ Calendar
      ├─ Search
      └─ Parent Subtask row
```

모두 즉시 같은 title을 표시한다.

---

## 9.49 Search Index

Title이 검색 index 대상이라면 commit 후 검색 index도 갱신되어야 한다.

예:

```text
"SU Meeting"
→
"Planning Meeting"
```

Search query 결과가 새 title을 반영한다.

별도 stale search cache가 오래 남지 않게 한다.

---

## 9.50 Sorting by Title

Title sort가 켜진 View에서는 title mutation 후 row 위치가 바뀔 수 있다.

```text
A Task
→ Z Task
```

정렬 위치가 변경되어도 Detail selection은 유지한다.

3장 Selection rule을 따른다.

---

## 9.51 Filter/query Matching

Title 기반 search/filter에서 수정으로 현재 결과에서 빠져도:

```text
Main result에서 제거
Detail 유지
```

한다.

현재 editing context를 갑자기 닫지 않는다.

---

## 9.52 Recurring Task Title

Recurring Task Title은 기본적으로 Series-level property다.

특정 occurrence title 변경을 지원하는 경우 recurrence edit scope를 거쳐야 한다.

예:

```text
This occurrence
This and future
All occurrences
```

V1에서는 Series-level Title 수정 또는 명시적 scope selection을 사용한다.

---

## 9.53 Subtask Title

Subtask도 동일한 Task entity이므로 같은 Title Editor를 사용한다.

Parent/Child라고 별도의 제목 컴포넌트를 만들지 않는다.

---

## 9.54 Checklist Item Text와 구분

Task Title Editor와 CheckItem text editor는 비슷해 보여도 domain 의미가 다르다.

```text
Task Title
→ Task.title

Checklist Item
→ CheckItem.text
```

공통 primitive를 재사용할 수는 있지만 mutation command와 validation 책임을 섞지 않는다.

---

## 9.55 Accessibility Role

편집 상태에서는 적절한 text input semantics를 제공한다.

예:

```text
aria-label="Task title"
```

필요한 경우 현재 Task와 연결된 accessible name을 제공한다.

View 상태가 단순 텍스트처럼 보이더라도 keyboard로 편집 진입할 수 있어야 한다.

---

## 9.56 Focus Style

Editing/focus 상태는 색상만으로 표현하지 않는다.

```text
caret
focus indicator
surface/background subtle change
```

등을 조합한다.

과도한 input border로 TickTick 스타일의 미니멀함을 깨지 않는다.

---

## 9.57 Focus Ring

Keyboard focus에는 시각적 focus indication이 있어야 한다.

Mouse click과 keyboard focus styling을 미세하게 다르게 할 수 있지만 접근성을 희생하지 않는다.

---

## 9.58 Long Title Rendering

View state에서 긴 Title은 Detail width 안에서 wrap 가능하다.

중요:

> Title 데이터는 single-line logical string이지만 화면 표시가 여러 줄로 wrap되는 것은 허용한다.

즉:

```text
single-line input semantics
≠
single visual line
```

---

## 9.59 Editing Long Title

편집 중에도 field 높이가 텍스트 wrap에 따라 자연스럽게 늘어날 수 있다.

브라우저 기본 `<input>`보다 auto-growing single-value textarea 스타일 구현을 사용할 수 있다.

단 Enter/newline은 막는다.

---

## 9.60 Layout Shift

Title이 길어져 높이가 늘어나더라도 Property Header 위치는 유지되고 Content Body가 아래로 자연스럽게 밀린다.

Detail 전체 폭이 임의로 변경되면 안 된다.

---

## 9.61 Title Editor Primitive Recommendation

구현 방식은 다음 중 하나가 가능하다.

```text
auto-growing textarea
contenteditable
custom text editor
```

권장:

> V1에서는 auto-growing textarea 기반이 가장 단순하고 안정적이다.

이유:

- IME 처리 용이
- selection/caret 안정성
- plain text semantics
- newline 차단 가능
- rich-text 불필요

---

## 9.62 Contenteditable Caution

`contenteditable` 사용 시:

```text
newline
HTML paste
DOM normalization
IME
selection restoration
```

복잡도가 커진다.

Title은 rich text가 아니므로 특별한 이유가 없으면 contenteditable을 우선하지 않는다.

---

## 9.63 Component Responsibility

권장 component:

```text
TaskTitleEditor
```

책임:

```text
draft state
focus
IME
keyboard
validation
commit/cancel
```

Task persistence 세부 구현은 command/store layer에 위임한다.

---

## 9.64 Command Layer

공통 command:

```ts
setTaskTitle(taskId, title);
```

책임:

```text
normalize
validate
no-op detection
optimistic Task update
persistence
search/sort invalidation
failure handling
```

UI Editor가 DB API를 직접 호출하지 않는다.

---

## 9.65 No-op Detection

Normalize 결과가 기존 title과 동일하면 mutation을 만들지 않는다.

예:

```text
existing:
"SU Meeting"

draft:
" SU Meeting "
```

trim 후 동일하면:

```text
persistence request ❌
activity event ❌
```

---

## 9.66 Activity History

향후 Task Activity를 지원하면:

```text
Title changed
"SU Meeting" → "Planning Meeting"
```

같은 event를 기록할 수 있다.

Task entity에 title history 배열을 넣지 않는다.

---

## 9.67 Conflict Handling

다른 device에서 같은 Task title이 수정된 경우 sync conflict가 발생할 수 있다.

V1에서는 revision/updatedAt 기반 last-write 정책을 사용할 수 있지만, 현재 사용자가 local unsaved draft를 입력 중이라면 remote update가 draft를 덮어쓰면 안 된다.

기본 원칙:

```text
active local edit
→ remote update 표시/merge policy 필요
→ silent overwrite 금지
```

상세 conflict UX는 Edge Cases 장에서 통합한다.

---

## 9.68 Remote Update While Not Editing

사용자가 Title을 편집 중이 아니라면 remote title update를 즉시 반영할 수 있다.

```text
VIEW state
→ remote title update
→ render new title
```

---

## 9.69 Remote Update While Editing

Editing 중 remote update:

```text
local draft = A
remote committed = B
```

기본적으로 local draft를 유지하고 conflict state를 기록한다.

Blur/commit 시 revision validation을 거친다.

단순 remote overwrite를 하지 않는다.

---

## 9.70 Prohibited Patterns

- Detail open과 동시에 Title auto-focus
- Title을 multiline domain string으로 사용
- Enter로 newline 삽입
- IME composition 중 Enter를 commit으로 처리
- Keypress마다 원격 DB 요청
- Task switch/navigation 시 dirty draft 유실
- Empty/whitespace title을 기존 Task에 조용히 저장
- HTML/Rich Text를 Title에 저장
- URL/Markdown을 Title에서 자동 rich rendering
- Title draft를 canonical Task field와 별도 영구 source로 저장
- 오래된 save response가 최신 draft를 덮어쓰기
- Save 실패 시 사용자의 최신 입력을 조용히 삭제
- Main/List/Board별 별도 Title copy 사용
- recurring Task occurrence scope를 무시하고 Series title을 무조건 변경
- 앱 전역 shortcut이 Title typing을 가로채기

---

## 9.71 Acceptance Criteria

### Basic Editing

- [ ] Detail open 시 Title은 자동 edit/focus되지 않는다.
- [ ] Title click으로 editing에 진입한다.
- [ ] 기존 title이 draft로 로드된다.
- [ ] caret이 정상적으로 위치한다.
- [ ] 전체 text를 자동 select하지 않는다.
- [ ] Title은 plain text다.

### Keyboard

- [ ] Enter로 valid Title을 commit할 수 있다.
- [ ] Shift+Enter가 newline을 만들지 않는다.
- [ ] Esc로 uncommitted draft를 취소할 수 있다.
- [ ] 일반 text editing shortcut이 정상 동작한다.
- [ ] Global shortcut이 editing context를 가로채지 않는다.

### IME

- [ ] 한글/중국어/일본어 composition을 정상 지원한다.
- [ ] IME composition 중 Enter가 Title commit을 일으키지 않는다.
- [ ] composition 중간값을 불필요하게 persistence하지 않는다.
- [ ] compositionend 이후 autosave가 정상 재개된다.

### Autosave

- [ ] Blur 시 valid dirty draft를 commit한다.
- [ ] Debounced autosave를 지원할 수 있다.
- [ ] Enter/Blur/Task switch 전에는 pending draft를 flush한다.
- [ ] Task switch/navigation 때문에 Title이 유실되지 않는다.
- [ ] 별도 Save 버튼이 필요하지 않다.

### Validation

- [ ] Empty existing Task title을 commit하지 않는다.
- [ ] Whitespace-only title을 empty로 처리한다.
- [ ] Leading/trailing whitespace를 normalize한다.
- [ ] Pasted newline을 single-line text로 normalize한다.
- [ ] Max length를 하나의 shared constant로 관리한다.
- [ ] Invalid draft를 domain에 commit하지 않는다.

### Synchronization

- [ ] Title 변경이 Main/List/Board/Calendar/Search에 즉시 반영된다.
- [ ] Title sort/filter 변화로 row 위치/노출이 바뀌어도 Detail은 유지된다.
- [ ] Subtask도 동일 Title system을 사용한다.
- [ ] Search index가 최신 committed title을 반영할 수 있다.

### Persistence / Error

- [ ] Optimistic Task title update를 지원한다.
- [ ] Saving 중에도 계속 typing할 수 있다.
- [ ] 오래된 response가 최신 title을 덮어쓰지 않는다.
- [ ] Persistence failure를 안전하게 처리한다.
- [ ] Retry/local-first 확장이 가능하다.
- [ ] Active local edit를 remote update가 조용히 덮어쓰지 않는다.

### Architecture

- [ ] Canonical field는 `Task.title` 하나다.
- [ ] Draft는 UI/editor state다.
- [ ] `setTaskTitle()` 같은 공통 command를 사용한다.
- [ ] Editor가 DB API를 직접 호출하지 않는다.
- [ ] Normalize 후 no-op이면 불필요한 mutation을 만들지 않는다.
- [ ] Title History는 향후 Activity system으로 분리한다.

---

# 10. Description Editor

## 10.1 Purpose

Description Editor는 Task의 상세 메모·회의 내용·참고 정보·링크·구조화된 텍스트를 기록하는 본문 영역이다.

Title과 달리 Description은 다음을 지원하는 **multi-line content editor**다.

```text
Paragraph
Line break
Bullet list
Numbered list
Bold / Italic / Strike
Link
Heading
Inline code
Slash command
Paste
Long-form text
```

향후 Attachment / Image / Checklist conversion과도 연결될 수 있어야 한다.

핵심 원칙:

> Description은 빠르게 메모할 수 있어야 하지만, Task Detail 전체를 문서 편집기처럼 무겁게 만들어서는 안 된다.

---

## 10.2 Canonical Data

2장에서 확정한 V1 canonical field:

```ts
description: string;
```

을 유지한다.

V1에서는 plain-text / Markdown-compatible string으로 시작할 수 있다.

Rich editor를 도입하더라도 특정 editor library의 proprietary document JSON을 Task domain에 직접 고정하지 않는다.

```text
❌ TipTap JSON을 Task model 자체로 고정
❌ Lexical state를 그대로 canonical domain으로 사용
❌ DOM HTML을 무검증 저장

✅ portable description representation
```

---

## 10.3 Format Evolution Strategy

Description은 단계적으로 확장한다.

### Phase A — Core

```text
Plain text
Multi-line
URLs
Autosave
Paste
```

### Phase B — Structured Text

```text
Bold
Italic
Strike
Heading
Bullet list
Numbered list
Link
Inline code
```

### Phase C — Productivity Editor

```text
Slash command
Attachment insertion
Image
Advanced keyboard transforms
```

UI는 단계적으로 확장할 수 있지만, 이후 기능을 막지 않는 구조로 설계한다.

---

## 10.4 Markdown-compatible Direction

Portable canonical representation이 필요할 경우 Markdown-compatible string을 우선 고려한다.

예:

```md
## Meeting Notes

- Review data
- Decide next action

**Important:** send by Friday.
```

장점:

```text
portable
human-readable
searchable
exportable
editor library 독립적
```

다만 정확한 Markdown dialect는 구현 시 하나로 고정한다.

---

## 10.5 Description vs Checklist

Description과 Checklist는 같은 것이 아니다.

```text
Description
→ 자유 형식 본문

Checklist
→ CheckItem entity collection
```

따라서 Description 안의:

```text
- item
```

은 bullet list일 뿐이다.

Task-level Checklist Item과 혼동하지 않는다.

---

## 10.6 Content Mode

현재 Task가:

```ts
contentMode = "description";
```

일 때 Description Editor를 표시한다.

```ts
contentMode = "checklist";
```

이면 Checklist UI를 표시한다.

Description과 Checklist 전환 규칙은 11장에서 확정한다.

---

## 10.7 Position

Task Detail 구조:

```text
┌─────────────────────────────────────┐
│ Property Header                     │
├─────────────────────────────────────┤
│ Task Title                      ☷   │
├─────────────────────────────────────┤
│                                     │
│ Description                         │
│                                     │
│ +                                   │
│                                     │
└─────────────────────────────────────┘
```

Description은 Title 바로 아래의 주요 scrollable content다.

---

## 10.8 Empty State

Description이 비어 있으면 빈 editor surface를 제공한다.

예:

```text
Add notes...
```

또는 TickTick 실측에 맞춘 muted placeholder.

Placeholder는 실제 domain string으로 저장하지 않는다.

```text
description = ""
```

만 canonical empty state다.

---

## 10.9 Detail Open Behavior

Task Detail을 열었다고 Description Editor에 자동 focus하지 않는다.

```text
Task click
→ Detail open
→ Description view state
```

사용자가 본문을 클릭해야 editing focus에 들어간다.

---

## 10.10 Editor State

최소 상태:

```text
VIEW / IDLE
FOCUSED
EDITING
DIRTY
SAVING
ERROR
```

개념 UI state:

```ts
type DescriptionEditorState = {
  taskId: string;
  draft: string;

  isFocused: boolean;
  isDirty: boolean;
  isSaving: boolean;

  isComposing: boolean;

  selection: unknown | null;
  error: string | null;
};
```

selection type은 editor implementation에 따라 달라질 수 있다.

---

## 10.11 Multi-line Semantics

Description은 multi-line을 허용한다.

```text
Enter
→ 새 paragraph / newline
```

Title과 다르게 Enter는 commit action이 아니다.

---

## 10.12 Shift + Enter

Rich/structured editor에서는 다음 의미를 권장한다.

```text
Enter
→ new paragraph/list item

Shift + Enter
→ soft line break
```

Plain textarea V1에서는 둘 다 newline으로 처리할 수 있으나, 향후 structured editor semantics와 충돌하지 않게 한다.

---

## 10.13 Paragraphs

본문은 여러 paragraph를 허용한다.

예:

```text
Meeting agenda

Review beta results.

Decide next action.
```

빈 줄도 사용자 의도대로 보존한다.

---

## 10.14 View vs Edit Rendering

Description은 일반 상태에서는 읽기 쉬운 rendered surface처럼 보일 수 있다.

클릭하면 같은 위치에서 editor로 전환한다.

```text
View
↓ click
Edit
```

대형 modal editor로 강제 전환하지 않는다.

---

## 10.15 No Separate Save Button

Description은 Title과 마찬가지로 별도 Save button을 기본적으로 사용하지 않는다.

```text
typing
→ local draft
→ debounce/autosave
```

사용자는 문서 저장을 신경쓰지 않고 작성할 수 있어야 한다.

---

## 10.16 Autosave Delay

Description은 Title보다 긴 입력이 많으므로 약간 긴 debounce를 사용할 수 있다.

권장 초기값:

```text
500–800ms idle
```

정확한 값은 실측/성능 테스트로 조정한다.

shared token/constant로 관리한다.

---

## 10.17 Commit / Flush Triggers

Pending Description draft는 다음 상황에서 즉시 flush한다.

```text
Debounce timeout
Task switch 전
Detail close 전
Primary navigation 전
App background/unload 가능한 시점
Explicit editor mode exit
```

---

## 10.18 Task Switch During Editing

Task A Description 편집 중 Task B 클릭:

```text
1. A의 pending valid draft flush
2. A store/persistence update
3. selectedTaskId → B
4. B Description load
```

Task switch 때문에 본문 최신 입력이 유실되지 않는다.

---

## 10.19 Detail Close During Editing

Close button:

```text
pending draft flush
→ Detail close
```

Esc는 editor temporary UI가 있으면 그것부터 닫는다.

예:

```text
Slash menu open
↓ Esc
Slash menu close

다시 Esc
↓
editor focus exit / Detail close rule
```

전역 Esc priority는 18장에서 최종 통합한다.

---

## 10.20 Empty Description

Description은 빈 문자열을 유효하게 허용한다.

```ts
description = "";
```

Title과 달리 empty validation error를 만들지 않는다.

---

## 10.21 Whitespace-only Description

Description이 whitespace만 남은 경우 commit 시 완전히 빈 문자열로 normalize할 수 있다.

예:

```text
"   \n   "
```

→

```ts
description = "";
```

단 정상 문서 내부의 intentional indentation/line breaks는 과도하게 제거하지 않는다.

---

## 10.22 Leading / Trailing Blank Lines

문서 가장 앞/뒤의 과도한 blank line은 normalize할 수 있다.

하지만 사용자의 paragraph 구조를 임의로 재작성하지 않는다.

Normalization은 보수적으로 적용한다.

---

## 10.23 Plain Text Paste

Plain text paste는 기본적으로 그대로 삽입한다.

```text
line 1
line 2
line 3
```

줄바꿈 구조를 보존한다.

---

## 10.24 Rich HTML Paste

웹페이지나 문서에서 rich content를 paste할 경우:

```text
HTML
↓ sanitize
supported formatting만 변환
↓
Description representation
```

지원하지 않는 styling은 제거한다.

예:

```text
font-family
font-size
background layout
tracking script
```

등은 가져오지 않는다.

---

## 10.25 Paste Sanitization

외부 HTML을 그대로 저장/렌더하면 안 된다.

제거 대상 예:

```text
<script>
onerror
onclick
style injection
iframe
unsafe URL scheme
```

Description rendering은 XSS-safe해야 한다.

---

## 10.26 URL Auto-detection

일반 URL 입력:

```text
https://example.com
```

은 view state에서 clickable link로 렌더할 수 있다.

Canonical description에는 URL text 자체를 저장한다.

---

## 10.27 Link Interaction

View state에서 link click은 링크 열기 action이다.

Edit state에서는 accidental navigation을 막는다.

권장:

```text
Edit mode
plain click → caret/select
Cmd/Ctrl + click → open link
```

또는 link tooltip/popover에서 Open action 제공.

---

## 10.28 Link Creation

Structured editor에서는 선택 text를 링크로 변환할 수 있다.

예:

```text
OpenAI
↓ Add link
https://openai.com
```

Canonical portable representation:

```md
[OpenAI](https://openai.com)
```

또는 정의된 equivalent format.

---

## 10.29 Unsafe Links

다음과 같은 unsafe scheme을 링크로 실행하지 않는다.

```text
javascript:
data: (위험한 경우)
```

허용 scheme을 명시적으로 관리한다.

일반적으로:

```text
http
https
mailto
```

등.

---

## 10.30 Formatting Toolbar

Rich text Phase에서는 text selection 시 contextual toolbar를 제공할 수 있다.

예:

```text
B  I  S  Link
```

항상 큰 toolbar를 상단에 고정해 Detail 공간을 차지하지 않는 방향을 권장한다.

Progressive disclosure 원칙을 따른다.

---

## 10.31 Bold

지원:

```text
Bold
```

Keyboard:

```text
Cmd/Ctrl + B
```

Markdown-compatible representation 예:

```md
**text**
```

---

## 10.32 Italic

Keyboard:

```text
Cmd/Ctrl + I
```

Representation 예:

```md
*text*
```

---

## 10.33 Strikethrough

지원 가능:

```text
Strikethrough
```

Description text decoration일 뿐 Task completed status와는 별개다.

```text
strikethrough text
≠
Task completed
```

---

## 10.34 Heading

본문 구조용 heading을 지원할 수 있다.

권장 범위:

```text
Heading 1
Heading 2
Heading 3
Paragraph
```

Task Detail 안에서는 너무 많은 heading level을 제공하지 않는다.

---

## 10.35 Bullet List

```text
• Item A
• Item B
• Item C
```

Enter:

```text
새 list item
```

빈 item에서 Enter:

```text
list 종료
```

일반적인 editor 관례를 따른다.

---

## 10.36 Numbered List

```text
1. Item A
2. Item B
3. Item C
```

자동 numbering은 presentation/editor layer가 담당한다.

실제 number를 사용자가 일일이 관리하지 않도록 한다.

---

## 10.37 List Indentation

Tab / Shift+Tab:

```text
list item indent
list item outdent
```

단 editor focus 문맥에서만 동작한다.

일반 Detail focus navigation의 Tab과 충돌하지 않게 한다.

---

## 10.38 Markdown Shortcuts

향후 다음 입력 shortcut을 지원할 수 있다.

```text
# + space
→ Heading

- + space
→ Bullet list

1. + space
→ Numbered list

> + space
→ Quote (지원 시)
```

V1 필수는 아니지만 Slash/structured editor와 호환 가능하게 한다.

---

## 10.39 Inline Code

지원 가능:

```text
`code`
```

짧은 command/path 등을 메모하기 좋다.

Code syntax highlighting 같은 무거운 기능은 V1 필수로 하지 않는다.

---

## 10.40 Code Block

Long-form technical note 요구가 있다면 code block을 지원할 수 있다.

다만 일반 Todo 앱의 core feature는 아니므로 Phase C 이후 확장 기능으로 둔다.

---

## 10.41 Slash Command Entry

빈 paragraph 또는 typing 중:

```text
/
```

입력하면 Slash Command Menu를 열 수 있다.

예:

```text
/
├ Text
├ Heading
├ Bullet list
├ Numbered list
├ Link
├ Attachment
├ Image
└ Subtask
```

실제 command 목록은 기능 구현 상태에 따라 달라진다.

---

## 10.42 Slash Menu State

Slash menu는 UI overlay state다.

```ts
activePopover = {
  type: "description-slash",
  taskId,
  anchorPosition
};
```

Task domain에 slash menu state를 저장하지 않는다.

---

## 10.43 Slash Menu Filtering

사용자가:

```text
/he
```

처럼 입력하면:

```text
Heading
```

등 matching command만 보여준다.

검색 문자열은 commit된 Description에 그대로 남지 않도록 command 선택 시 replace한다.

---

## 10.44 Slash Menu Keyboard

```text
Arrow Up / Down
→ command 이동

Enter
→ command 실행

Esc
→ menu close

typing
→ filter
```

IME composition 중 Slash command parsing이 오작동하지 않게 한다.

---

## 10.45 Slash Menu Outside Click

Slash menu는 outside click으로 닫는다.

Description Editor 자체 focus는 가능한 경우 유지한다.

---

## 10.46 `+` Add Control

스크린샷의 본문 좌측/하단 `+` control은 Slash Command와 같은 insertion command system의 별도 진입점으로 사용할 수 있다.

```text
+
↓
Insert Menu
```

예:

```text
Text
List
Attachment
Image
Subtask
```

`+`와 `/`는 별개의 business logic을 만들지 않고 같은 command registry를 사용한다.

---

## 10.47 Command Registry

권장 구조:

```ts
type EditorCommand = {
  id: string;
  label: string;
  icon?: string;
  isEnabled(context): boolean;
  execute(context): void;
};
```

Slash menu와 `+` menu가 동일 registry를 읽는다.

---

## 10.48 Attachment Command Boundary

Attachment 삽입 command가 존재하더라도 실제 upload/storage semantics는 14장에서 설계한다.

Description Editor는:

```text
attachment insertion request
```

를 발생시키는 역할만 한다.

---

## 10.49 Image Boundary

Image도 동일.

Editor가 직접 파일 storage/upload 정책을 소유하지 않는다.

```text
Editor
→ insert image request
→ Attachment/Image layer
```

---

## 10.50 Subtask Command Boundary

Slash 또는 `+` 메뉴에서 Subtask를 만들 수 있다면:

```text
Create Subtask
```

command는 12장의 Subtask command를 호출한다.

Description 텍스트 안에 가짜 Subtask markup을 저장하지 않는다.

---

## 10.51 Checklist Command Boundary

Description에서 Checklist mode로 전환하는 command가 있다면 11장의 conversion flow를 호출한다.

단순 Markdown checkbox list를 Task CheckItem entity로 암묵 변환하지 않는다.

---

## 10.52 IME Composition

한국어/중국어/일본어 입력 중 composition state를 추적한다.

```text
compositionstart
compositionupdate
compositionend
```

composition 중간값을 parsing/shortcut trigger로 과도하게 해석하지 않는다.

---

## 10.53 Enter During IME

```text
isComposing = true
```

일 때 Enter는 IME 확정에 사용될 수 있다.

따라서:

```text
list item 생성
paragraph split
slash command execute
```

를 즉시 실행하지 않는다.

Composition 종료 이후 정상 editor key behavior를 적용한다.

---

## 10.54 Slash During IME

IME composition 중 발생한 `/` 비슷한 문자 입력을 Slash Menu trigger로 잘못 인식하지 않게 한다.

Slash command activation은 composition이 종료된 실제 ASCII slash 입력 문맥에서 처리한다.

---

## 10.55 Autosave During IME

Composition 중에는 remote save debounce를 일시 정지할 수 있다.

```text
composition
→ local draft

compositionend
→ debounce restart
```

중간 조합 상태가 activity/history에 남지 않게 한다.

---

## 10.56 Editor-local Undo

Editing 중:

```text
Cmd/Ctrl + Z
```

는 우선 editor-local text undo history를 사용한다.

App-level Task mutation Undo와 분리한다.

---

## 10.57 App-level Undo Boundary

이미 autosave되어 Task.description이 commit된 이후의 변경을 app-level undo stack에서 되돌릴 수 있는 구조로 확장 가능하다.

V1에서는 editor-native Undo가 우선이다.

---

## 10.58 Selection Persistence

Toolbar/Link Popover를 클릭할 때 text selection이 사라져 formatting 대상이 없어지는 문제를 방지해야 한다.

Editor layer가 selection bookmark/range를 보존할 수 있어야 한다.

---

## 10.59 Focus Restoration

Formatting/Link/Slash sub-popover 종료 후 focus는 Description Editor의 기존 caret/selection으로 돌아간다.

---

## 10.60 Keyboard Shortcut Priority

Description Editor focus 중에는 text editing shortcut이 앱 global shortcut보다 우선한다.

예:

```text
B
I
T
1
```

등의 일반 typing이 global actions를 실행하면 안 된다.

---

## 10.61 Tab Behavior

일반 paragraph에서 Tab이 앱 focus navigation인지 text indentation인지 정책이 필요하다.

권장:

```text
List context
→ indent/outdent

Code block context
→ tab insertion 가능

Normal paragraph
→ focus navigation
```

정확한 규칙은 Keyboard & Focus System과 통합한다.

---

## 10.62 Long Description

긴 Description은 Detail 내부 scroll을 사용한다.

Editor 때문에 전체 App page가 scroll되는 구조는 사용하지 않는다.

```text
Property Header fixed
Detail content scroll
```

1장 Shell 규칙과 일치한다.

---

## 10.63 Editor Height

Description Editor 자체를 작은 고정 height textarea로 만들고 내부 scroll을 또 만드는 것은 피한다.

권장:

```text
Editor auto-grow
→ Detail content 자체가 scroll
```

즉 nested scroll을 최소화한다.

---

## 10.64 Maximum Description Length

실질적인 max length는 backend/storage limit에 맞춰 shared constant로 관리한다.

예:

```ts
TASK_DESCRIPTION_MAX_LENGTH
```

정확한 값은 구현 환경에 맞게 확정한다.

컴포넌트마다 다른 limit을 하드코딩하지 않는다.

---

## 10.65 Large-content Performance

매우 긴 Description에서도 typing latency가 크게 증가하지 않게 한다.

고려:

```text
incremental rendering
debounced serialization
expensive markdown parsing 최소화
syntax transform throttling
```

매 keypress마다 전체 document를 무거운 방식으로 재파싱하지 않는다.

---

## 10.66 Character Counter

평상시에는 counter를 항상 노출하지 않는다.

Limit에 가까워질 때만 보조적으로 표시할 수 있다.

---

## 10.67 Search Index

Description도 Search 대상이 될 수 있다.

Commit된 Description 변경 후 search index를 업데이트한다.

다만 화면에서 매 keystroke마다 전체 검색 index를 무거운 방식으로 rebuild하지 않는다.

Debounced indexing을 사용할 수 있다.

---

## 10.68 Search Highlight

Search 결과에서 Description match를 보여줄 때 canonical description을 변경하지 않는다.

Highlight는 derived presentation이다.

---

## 10.69 Cross-view Rendering

Description 전체를 Main List에 항상 노출할 필요는 없다.

View별로:

```text
Detail
→ full description

Search
→ snippet

Board/List
→ optional preview
```

처럼 같은 canonical Description을 목적에 맞게 render한다.

---

## 10.70 Recurring Task Description

Recurring Task의 Description은 기본적으로 Series-level property로 취급한다.

특정 occurrence의 Description만 바꾸는 기능을 지원할 경우 7장의 recurrence edit scope를 거쳐야 한다.

V1에서는 Series-level description을 기본값으로 한다.

---

## 10.71 Subtask Description

Subtask도 Task entity이므로 동일한 Description Editor를 사용한다.

별도 Subtask Notes model을 만들지 않는다.

---

## 10.72 Completed Task Description

Completed/Won't Do Task도 Description 확인 및 편집이 가능하다.

```text
completed
≠
read-only
```

4장 Status 규칙과 일치한다.

---

## 10.73 Remote Update While Not Editing

Editor가 focus되지 않은 상태에서 remote description update가 오면 즉시 반영 가능하다.

---

## 10.74 Remote Update While Editing

사용자가 local draft를 편집 중인데 remote update가 오면 local draft를 조용히 덮어쓰지 않는다.

```text
local draft
+
remote newer version
→ conflict state
```

V1에서는 revision 검증 + user feedback을 사용할 수 있다.

---

## 10.75 Save Revision

Description 저장도 revision/sequence를 사용한다.

예:

```text
save #1 = "A"
save #2 = "AB"
save #3 = "ABC"
```

최종 state는 #3이다.

#1 response가 늦게 와도 `"A"`로 돌아가지 않는다.

---

## 10.76 Optimistic Store Update

Autosave commit 시:

```text
draft
↓
Task.description 즉시 update
↓
Search/snippet 등 즉시 반영
↓
persistence
```

다만 editor local draft와 committed domain value를 명확히 구분한다.

---

## 10.77 Persistence Failure

저장 실패 시 사용자의 최신 draft를 잃지 않는다.

권장:

```text
draft 유지
error state 표시
retry
```

특히 사용자가 계속 typing 중일 때 이전 persisted value로 강제 rollback하지 않는다.

---

## 10.78 Offline Editing

Offline/local-first:

```text
edit
→ local persistence
→ sync pending
```

Description은 네트워크가 없어도 계속 편집 가능하게 확장할 수 있다.

---

## 10.79 Sanitized Rendering

View state에서 Markdown/structured formatting을 HTML로 render한다면 반드시 sanitized renderer를 사용한다.

Raw user HTML을 그대로 DOM에 주입하지 않는다.

---

## 10.80 External Content Privacy

Paste한 외부 image URL이나 tracking resource를 자동으로 background-load하는 기능은 신중히 다룬다.

V1에서는 text/link paste 중심으로 두고 외부 media embed는 별도 명시적 command로 제한하는 것이 안전하다.

---

## 10.81 Accessibility

Description Editor에는 명확한 accessible label을 제공한다.

예:

```text
aria-label="Task description"
```

Formatting controls는 각각 text label/tooltip을 가져야 한다.

---

## 10.82 Screen Reader Semantics

Heading/list/link 등 structured content를 지원한다면 view/edit 양쪽에서 가능한 한 semantic HTML 또는 동등한 accessibility tree를 제공한다.

---

## 10.83 Focus Visibility

Keyboard로 Description에 진입했을 때 focus 상태를 식별할 수 있어야 한다.

과도한 border를 사용하지 않더라도 caret/focus ring/subtle surface change로 표현한다.

---

## 10.84 Reduced Motion

Toolbar/Slash Menu open transition은 Reduced Motion 환경에서 제거/축소한다.

Editor typing 자체에 animation을 넣지 않는다.

---

## 10.85 Component Architecture

권장:

```text
TaskDescription/
│
├── TaskDescriptionEditor
├── DescriptionRenderer
├── DescriptionToolbar
├── DescriptionSlashMenu
├── DescriptionInsertMenu
└── LinkEditorPopover
```

Attachment/Image/Subtask 자체 구현은 별도 feature component를 호출한다.

---

## 10.86 Editor Adapter Layer

특정 editor library를 사용하더라도 앱 domain과 직접 결합하지 않는다.

```text
TaskDescriptionEditor
      │
      ↓
Editor Adapter
      │
      ↓
Library
```

Adapter 책임:

```text
parse
serialize
selection
commands
formatting
```

향후 editor library 변경 비용을 줄인다.

---

## 10.87 Description Command Layer

Task domain update는 공통 command를 사용한다.

```ts
setTaskDescription(taskId, description);
```

책임:

```text
normalize
validate
no-op detection
optimistic update
persistence
search indexing
failure handling
```

Editor가 DB API를 직접 호출하지 않는다.

---

## 10.88 No-op Detection

Normalize 결과가 기존 committed Description과 동일하면 불필요한 mutation을 만들지 않는다.

---

## 10.89 Activity History

향후 Task Activity를 지원할 경우 Description change event를 기록할 수 있다.

본문 전체 version history를 Task entity 내부 배열로 저장하지 않는다.

필요하면 별도 document revision/history system으로 확장한다.

---

## 10.90 Prohibited Patterns

- Detail open과 동시에 Description auto-focus
- Description을 Title처럼 single-line으로 제한
- 모든 keypress마다 원격 DB 요청
- 작은 고정 textarea + 내부 scroll + Detail scroll의 중첩 스크롤
- raw HTML을 검증 없이 저장/렌더
- 특정 editor proprietary state를 Task domain의 영구 필수 구조로 고정
- IME composition 중 Enter/Slash shortcut 오작동
- Global shortcut이 Description typing을 가로채기
- Task switch/navigation 중 pending draft 유실
- Save failure 시 최신 사용자 draft 삭제
- 오래된 save response가 최신 Description을 덮어쓰기
- Markdown bullet을 Task CheckItem으로 암묵 변환
- Description 내부 가짜 Subtask markup을 실제 Subtask처럼 취급
- Slash Menu와 `+` Menu에 서로 다른 command business logic 사용
- Completed Task Description을 무조건 read-only 처리
- View별 Description 사본을 별도 source로 관리

---

## 10.91 Acceptance Criteria

### Basic

- [ ] Description은 multi-line text를 지원한다.
- [ ] Empty Description을 허용한다.
- [ ] Detail open 시 자동 focus하지 않는다.
- [ ] 클릭해 편집할 수 있다.
- [ ] Enter로 paragraph/newline을 만들 수 있다.
- [ ] 별도 Save button 없이 사용할 수 있다.

### Autosave

- [ ] Debounced autosave를 지원한다.
- [ ] Task switch/Detail close/navigation 전 pending draft를 flush한다.
- [ ] Typing 중 저장 요청이 있어도 계속 편집할 수 있다.
- [ ] 오래된 save response가 최신 draft를 덮어쓰지 않는다.
- [ ] Save failure 시 최신 draft를 보존하고 retry할 수 있다.

### Text / Paste

- [ ] Plain text paste의 줄바꿈을 보존한다.
- [ ] Rich HTML paste를 sanitize한다.
- [ ] Unsafe script/event handler를 제거한다.
- [ ] URL을 안전하게 detect/render할 수 있다.
- [ ] Unsafe URL scheme을 실행하지 않는다.

### Structured Text

- [ ] Bold/Italic/Strike를 확장 가능하게 지원한다.
- [ ] Heading을 지원할 수 있다.
- [ ] Bullet/Numbered List를 지원할 수 있다.
- [ ] Link formatting을 지원할 수 있다.
- [ ] Structured formatting이 Task status/checklist semantics와 혼동되지 않는다.

### Slash / Insert

- [ ] `/` command menu를 지원할 수 있다.
- [ ] `+` insert menu를 지원할 수 있다.
- [ ] 두 진입점이 같은 command registry를 사용한다.
- [ ] Slash menu를 keyboard로 탐색할 수 있다.
- [ ] Attachment/Image/Subtask command는 해당 feature layer를 호출한다.

### IME / Keyboard

- [ ] 한국어/중국어/일본어 IME composition을 정상 지원한다.
- [ ] IME 중 Enter가 paragraph/command를 잘못 실행하지 않는다.
- [ ] IME 중 Slash Menu가 오작동하지 않는다.
- [ ] Text editing shortcut이 global shortcut보다 우선한다.
- [ ] Editor-local Undo를 지원한다.

### Layout / Performance

- [ ] Editor가 auto-grow하고 Detail content가 scroll한다.
- [ ] 불필요한 nested scroll을 만들지 않는다.
- [ ] 긴 Description에서도 typing latency가 과도하게 증가하지 않는다.
- [ ] expensive parsing/indexing은 debounce/throttle할 수 있다.

### Synchronization

- [ ] Canonical `Task.description` 하나를 사용한다.
- [ ] Search/snippet이 최신 committed Description을 반영한다.
- [ ] Subtask도 같은 Description system을 사용한다.
- [ ] Recurring Task의 Description scope를 Recurrence 규칙과 통합할 수 있다.
- [ ] Remote update가 active local draft를 조용히 덮어쓰지 않는다.

### Architecture

- [ ] Editor local draft와 canonical Task.description을 분리한다.
- [ ] `setTaskDescription()` 같은 공통 command를 사용한다.
- [ ] Editor library와 domain 사이에 adapter boundary를 둘 수 있다.
- [ ] Slash/Insert command가 registry 기반으로 동작한다.
- [ ] Rich text 확장이 특정 library에 앱 전체를 lock-in시키지 않는다.
- [ ] Sanitized rendering을 사용한다.

---

# 11. Checklist

## 11.1 Purpose

Checklist는 하나의 Task 안에서 여러 개의 간단한 실행 항목을 관리하는 구조다.

핵심 원칙:

```text
Task
│
├─ CheckItem A
├─ CheckItem B
└─ CheckItem C
```

Checklist Item은 Subtask가 아니다.

```text
Checklist Item
→ 간단한 text + checked state

Subtask
→ 완전한 Task entity
   ├─ title
   ├─ date
   ├─ priority
   ├─ tags
   ├─ description
   └─ subtasks
```

따라서 복잡한 일정/우선순위/태그가 필요한 항목은 Checklist가 아니라 Subtask로 승격해야 한다.

---

## 11.2 Data Model

2장에서 확정한 `CheckItem` entity를 사용한다.

```ts
type CheckItem = {
  id: string;
  taskId: string;

  text: string;

  checked: boolean;
  completedAt: string | null;

  sortKey: string;

  createdAt: string;
  updatedAt: string;
};
```

Task에는 현재 body mode를 나타내는:

```ts
contentMode:
  | "description"
  | "checklist";
```

가 존재한다.

---

## 11.3 Checklist Is a Separate Entity Collection

다음과 같이 Task 내부 배열을 canonical source of truth로 만들지 않는다.

```ts
❌ task.checkItems = [...]
```

권장 관계:

```text
Task A
  │
  ├── CheckItem 1 (taskId=A)
  ├── CheckItem 2 (taskId=A)
  └── CheckItem 3 (taskId=A)
```

Frontend에서는 selector를 통해:

```ts
getCheckItemsByTaskId(taskId)
```

형태로 가져온다.

---

## 11.4 Content Mode Entry Point

Task Content Header의 mode toggle이 Description ↔ Checklist 전환 진입점이다.

예:

```text
Task Title                      ☷
                                ↑
                          Content mode
```

현재:

```ts
contentMode = "description";
```

인 상태에서 toggle:

```text
Description
↓
Checklist
```

반대도 가능하다.

---

## 11.5 Mode Toggle Is Not a View-only Switch

`contentMode`는 단순히 같은 데이터를 다른 모양으로 렌더하는 view setting이 아니다.

```text
Description
→ Task.description

Checklist
→ CheckItem entities
```

서로 다른 content representation을 사용한다.

따라서 전환 시 **데이터 변환 정책**이 필요하다.

---

## 11.6 Empty Description → Checklist

Description이 비어 있다면 가장 단순하다.

```text
description = ""
checkItems = []
```

Checklist mode 선택:

```ts
contentMode = "checklist";
```

즉시 빈 Checklist UI를 보여준다.

```text
☐ Add an item...
```

별도 confirm은 필요하지 않다.

---

## 11.7 Non-empty Description → Checklist

Description이 비어 있지 않은 상태에서 Checklist로 바꾸는 경우 사용자 데이터를 잃으면 안 된다.

기본 권장 flow:

```text
Description has content
↓ Checklist toggle

┌──────────────────────────────────┐
│ Convert to checklist?            │
│                                  │
│ • Convert lines to items         │
│ • Keep text and switch manually  │
│ • Cancel                         │
└──────────────────────────────────┘
```

다만 UI는 TickTick 실측에 맞춰 더 간단하게 만들 수 있다.

핵심은 **silent data loss 금지**다.

---

## 11.8 Default Conversion Rule

V1의 기본 자동 변환 규칙은:

> Description의 각 non-empty line을 하나의 CheckItem으로 변환한다.

예:

```text
Description

Prepare slides
Email professor
Check data
```

→

```text
☐ Prepare slides
☐ Email professor
☐ Check data
```

---

## 11.9 Blank Lines During Conversion

Description:

```text
Prepare slides

Email professor


Check data
```

에서 blank line은 CheckItem으로 만들지 않는다.

결과:

```text
☐ Prepare slides
☐ Email professor
☐ Check data
```

---

## 11.10 Bullet Prefix Normalization

Description이 다음처럼 bullet text를 포함하면:

```text
- Prepare slides
- Email professor
* Check data
```

변환 시 common bullet prefix를 제거할 수 있다.

결과:

```text
☐ Prepare slides
☐ Email professor
☐ Check data
```

단 임의의 의미 있는 leading character를 과도하게 제거하지 않는다.

---

## 11.11 Numbered List Conversion

Description:

```text
1. Prepare slides
2. Email professor
3. Check data
```

를 Checklist로 바꿀 때 일반적인 ordered-list prefix는 제거 가능하다.

결과:

```text
☐ Prepare slides
☐ Email professor
☐ Check data
```

번호 자체가 내용의 일부인 경우 사용자에게 결과를 예측할 수 있게 해야 한다.

---

## 11.12 Rich Description Conversion

Rich/Markdown Description을 Checklist로 변환할 때 formatting을 완전히 보존하기 어려울 수 있다.

기본 정책:

> Checklist Item text는 plain text를 기준으로 한다.

예:

```md
**Send** the final file
```

→

```text
☐ Send the final file
```

Checklist Item 자체는 rich text를 지원하지 않는 것을 V1 기본값으로 한다.

---

## 11.13 Description Preservation During Conversion

자동 변환 성공 후 기존 Description을 어떻게 할지 명확히 해야 한다.

기본 권장:

```text
Description → Checklist conversion
↓
CheckItem 생성
↓
description = ""
↓
contentMode = "checklist"
```

즉 현재 active content는 한 종류만 유지한다.

다만 conversion은 Undo 가능하게 만들어야 한다.

---

## 11.14 Atomic Conversion

Description → Checklist 변환은 하나의 transaction으로 처리한다.

```text
1. CheckItem entities create
2. description clear
3. contentMode switch
```

중간 상태가 사용자에게 보여서는 안 된다.

예:

```text
CheckItems는 생성됐는데
Description도 남아 있고
contentMode는 description
```

같은 불일치 상태를 만들지 않는다.

---

## 11.15 Conversion Undo

Mode conversion은 데이터 구조를 바꾸는 action이므로 Undo를 지원하는 것이 좋다.

예:

```text
Converted to checklist                 Undo
```

Undo 시:

```text
CheckItems 제거
description 복원
contentMode = description
```

원래 순서와 text를 보존해야 한다.

---

## 11.16 Empty Checklist → Description

Checklist가 비어 있는 경우 Description으로 전환:

```ts
contentMode = "description";
description = "";
```

즉시 가능하다.

---

## 11.17 Non-empty Checklist → Description

Checklist Item이 존재하는 상태에서 Description으로 전환하면 각 Item을 line text로 변환한다.

예:

```text
☐ Prepare slides
☑ Email professor
☐ Check data
```

기본 변환:

```text
Prepare slides
Email professor
Check data
```

---

## 11.18 Checked State Conversion

Checklist → Description 변환에서 checked/unchecked 정보를 plain text로 완전히 보존하기 어렵다.

V1 기본 권장:

```text
checked 상태는 text formatting으로 보존하지 않음
```

따라서 전환 전에 명확한 confirm/feedback이 필요하다.

대안으로 Markdown-compatible checkbox를 사용할 수 있다.

```md
- [ ] Prepare slides
- [x] Email professor
- [ ] Check data
```

Description이 Markdown-compatible canonical representation을 채택한 경우 이 방식을 **권장 확장안**으로 한다.

---

## 11.19 Recommended Reverse Conversion

Description Editor가 Markdown-compatible representation을 지원하는 경우:

```text
Checklist → Description
```

시:

```md
- [ ] Prepare slides
- [x] Email professor
- [ ] Check data
```

로 변환하는 것이 정보 보존 측면에서 더 좋다.

단 이 Markdown checkbox는 `CheckItem entity`가 아니라 Description text다.

---

## 11.20 Re-converting Markdown Checkbox Text

Description에:

```md
- [ ] Prepare slides
- [x] Email professor
```

가 있다고 해서 자동으로 CheckItem entity로 해석하지 않는다.

사용자가 명시적으로:

```text
Convert to Checklist
```

를 실행할 때만 entity로 변환한다.

---

## 11.21 Checklist Empty State

Checklist mode에서 Item이 하나도 없으면:

```text
☐ Add an item...
```

또는:

```text
+ Add item
```

을 표시한다.

Placeholder 자체를 CheckItem으로 저장하지 않는다.

---

## 11.22 Add Item

빈 Checklist에서 클릭 또는 Add action:

```text
+ Add item
↓
새 CheckItem draft
```

새 item은 아직 text가 비어 있는 동안 UI draft일 수 있다.

실제 entity 생성 시점은 다음 두 방식 중 하나다.

### A. Focus 즉시 생성

```text
draft item entity create
```

### B. 첫 유효 text 입력 시 생성

권장:

> 첫 non-empty text가 생길 때 entity를 생성하거나 temporary client ID를 사용한다.

빈 DB row가 누적되지 않게 한다.

---

## 11.23 New CheckItem Temporary ID

Local-first/optimistic UI에서는 새 Item 입력 즉시 client-generated stable ID를 만들어도 된다.

```text
chk_<ulid>
```

첫 입력 시 바로 local entity로 생성하고 persistence할 수 있다.

이 경우 빈 상태에서 focus를 잃으면 unused empty Item을 제거한다.

---

## 11.24 CheckItem Editor

각 Item text는 single logical line이다.

```text
☐ Prepare slides
```

Title Editor와 유사하게:

```text
Enter
→ 다음 Item 생성

Shift+Enter
→ 기본적으로 newline ❌
```

V1 Checklist Item은 multiline을 지원하지 않는다.

---

## 11.25 Item Text Canonical Field

```ts
text: string;
```

plain text다.

다음 기능은 V1 Checklist Item에서 제공하지 않는다.

```text
Rich text
Heading
Nested bullet formatting
Attachment inside item
Date inside item
Priority inside item
```

그런 기능이 필요하면 Subtask를 사용한다.

---

## 11.26 Enter Behavior

Item editing 중 Enter:

```text
current item valid
↓
commit current item
↓
new item create
↓
focus new item
```

예:

```text
☐ Prepare slides|
↓ Enter
☐ Prepare slides
☐ |
```

---

## 11.27 Enter on Empty Item

현재 Item이 empty이고 Enter:

```text
☐ |
↓ Enter
```

기본 권장:

```text
empty item 제거
→ checklist editing 종료 또는 다음 안정적 focus로 이동
```

불필요한 빈 CheckItem을 DB에 남기지 않는다.

---

## 11.28 Backspace on Empty Item

빈 Item에서 Backspace:

```text
☐ |
```

동작:

```text
현재 empty item 삭제
↓
이전 item 끝으로 focus 이동
```

첫 Item이고 이전 Item이 없으면 빈 draft를 제거하고 empty Checklist state로 돌아간다.

---

## 11.29 Delete Item with Text

Text가 있는 Item을 Backspace 한 번으로 통째로 삭제하지 않는다.

일반 text editing semantics를 따른다.

Item 전체 삭제는:

```text
More / Delete
```

또는 명확한 keyboard command/context action을 사용한다.

---

## 11.30 Blur Behavior

Item editing 중 blur:

```text
non-empty dirty text
→ commit

empty item
→ remove temporary/empty entity
```

---

## 11.31 Whitespace-only Item

```text
"    "
```

은 empty로 취급한다.

Commit하지 않는다.

---

## 11.32 Leading / Trailing Whitespace

Commit 시 trim한다.

```text
"  Prepare slides  "
→
"Prepare slides"
```

내부 공백은 유지한다.

---

## 11.33 Newline Paste

Checklist Item은 single-line이므로 paste된 newline을 어떻게 처리할지 정해야 한다.

기본 권장:

> 여러 줄 paste는 여러 CheckItem으로 분할한다.

예:

```text
Paste:
Prepare slides
Email professor
Check data
```

결과:

```text
☐ Prepare slides
☐ Email professor
☐ Check data
```

Checklist workflow에 자연스럽다.

---

## 11.34 Multi-line Paste Transaction

여러 줄 paste는 하나의 transaction으로 Item 여러 개를 생성한다.

원본 caret 위치의 Item 앞/뒤 text와 결합할 경우 결과가 예측 가능해야 한다.

V1 단순화:

- Empty item에서 multi-line paste를 우선 지원
- 복잡한 middle-of-text paste는 editor helper에서 deterministic하게 처리

---

## 11.35 Checkbox Toggle

Unchecked:

```text
☐ Item
```

click:

```text
☑ Item
```

Domain:

```ts
checked = true;
completedAt = now;
```

---

## 11.36 Uncheck

Checked Item을 다시 클릭:

```text
☑ Item
↓
☐ Item
```

Domain:

```ts
checked = false;
completedAt = null;
```

Task status와 같은 원칙을 사용한다.

---

## 11.37 Item Completion Does Not Select Task

Main/Detail 내부 Checkbox Item click은:

```text
CheckItem toggle
```

만 수행한다.

Task status/selection을 바꾸지 않는다.

---

## 11.38 Item Completion Does Not Complete Task

모든 CheckItem 완료:

```text
☑ A
☑ B
☑ C
```

되어도:

```text
Task.status → completed
```

를 자동 실행하지 않는다.

4장에서 확정한 원칙을 유지한다.

---

## 11.39 Task Completion Does Not Check Items

Task 자체를 완료해도:

```text
☐ unchecked item
```

을 자동 체크하지 않는다.

유효한 상태:

```text
✓ Task
├─ ☑ A
├─ ☐ B
└─ ☐ C
```

---

## 11.40 Completion Styling

Checked Item은 다음 중 일부로 표현한다.

```text
checked icon
muted text
optional strikethrough
```

정확한 styling은 Visual System에서 확정한다.

Color 하나만으로 상태를 표현하지 않는다.

---

## 11.41 Completed Item Ordering

여기서 중요한 정책이 있다.

기본 권장:

> Item을 체크했다고 자동으로 맨 아래로 이동시키지 않는다.

즉 사용자 순서를 유지한다.

```text
☐ A
☑ B
☐ C
```

그대로.

자동 reorder는 입력 흐름을 방해할 수 있다.

---

## 11.42 Optional “Completed at Bottom”

향후 preference로:

```text
Move completed items to bottom
```

을 지원할 수 있다.

하지만 V1 기본값은 manual order 유지다.

이 preference는 UI/view setting이며 CheckItem domain에 넣지 않는다.

---

## 11.43 Checklist Progress

Progress는 derived state다.

예:

```text
2 / 5
40%
```

계산:

```text
checked items / total items
```

Canonical Task field:

```text
❌ checklistProgress
```

를 저장하지 않는다.

---

## 11.44 Empty Checklist Progress

CheckItem이 0개라면:

```text
0 / 0
```

을 UI에 굳이 표시하지 않는다.

Progress indicator 자체를 숨긴다.

---

## 11.45 Drag Handle

각 CheckItem에는 hover/focus 시 drag handle을 표시할 수 있다.

예:

```text
⋮⋮  ☐ Prepare slides
```

항상 강하게 노출하지 않고 progressive disclosure한다.

---

## 11.46 Drag Reorder

Sibling CheckItem끼리 drag reorder를 지원한다.

```text
A
B
C

C drag
↓
C
A
B
```

`sortKey`를 갱신한다.

---

## 11.47 Reorder Scope

CheckItem은 같은 Task 안에서만 reorder한다.

```text
Task A CheckItem
→ Task B Checklist로 drag
```

는 V1에서 지원하지 않는다.

Task 간 이동은 별도 Move action으로 확장할 수 있다.

---

## 11.48 Fractional Ordering

순서 변경 시 모든 Item index를 매번 다시 쓰지 않도록 2장의 `sortKey` 전략을 사용한다.

```text
CheckItem.sortKey
```

을 sibling scope에서 계산한다.

---

## 11.49 Drag vs Click

Drag threshold 이전의 pointer click은 normal focus/select.

Threshold를 넘으면:

```text
drag operation
```

으로 전환한다.

Drag 시작 때문에 checkbox toggle이나 text edit이 발생하지 않게 한다.

---

## 11.50 Drag Placeholder

Drag 중 원래/새 위치를 알 수 있도록 insertion indicator 또는 placeholder를 보여준다.

과도한 animation은 사용하지 않는다.

---

## 11.51 Keyboard Reorder

접근성을 위해 keyboard-based reorder도 제공할 수 있어야 한다.

예:

```text
Alt/Option + Arrow Up/Down
```

정확한 key binding은 18장에서 확정한다.

핵심은 drag mouse만이 유일한 reorder 방법이 되지 않는 것이다.

---

## 11.52 Item Delete Action

각 Item에 명시적인 delete action을 제공한다.

예:

```text
More
→ Delete
```

또는 hover action.

Delete:

```text
CheckItem entity remove
```

Task 자체에는 영향 없음.

---

## 11.53 Delete Undo

CheckItem delete는 Undo 지원을 권장한다.

```text
Item deleted                     Undo
```

Undo:

```text
text
checked state
completedAt
sortKey
```

를 복원한다.

---

## 11.54 Soft Delete vs Hard Delete

CheckItem은 Task보다 복구 요구가 낮아 hard delete도 가능하지만, Undo를 안정적으로 지원하려면 short-lived tombstone/undo snapshot을 사용할 수 있다.

Master Spec에서는:

> persistence 모델은 구현 선택이지만 사용자 Undo가 가능해야 한다.

로 둔다.

---

## 11.55 Item Complete Undo

Checkbox toggle 자체에 매번 Toast Undo를 띄울 필요는 없다.

사용자는 checkbox를 다시 눌러 바로 되돌릴 수 있다.

App-level undo stack으로 확장 가능하지만 V1 Toast는 필수 아님.

---

## 11.56 IME Composition

CheckItem text 입력도 Title과 동일하게 IME composition을 지원한다.

```text
compositionstart
compositionupdate
compositionend
```

---

## 11.57 Enter During IME

`isComposing = true`일 때 Enter:

```text
새 Item 생성 ❌
IME composition 확정 ✅
```

composition 종료 이후 Enter만 new item action으로 처리한다.

---

## 11.58 Paste During IME

Composition 중 paste/shortcut 처리도 일반 text input 안전성을 우선한다.

Global shortcut이 CheckItem typing을 가로채지 않는다.

---

## 11.59 Autosave

CheckItem text는 Title과 유사하게 debounce autosave할 수 있다.

권장:

```text
300–500ms
```

단:

```text
Enter
Blur
Task switch
Detail close
```

전에는 pending text를 flush한다.

---

## 11.60 Optimistic Update

Item add/edit/check/reorder/delete는 모두 local UI에 즉시 반영한다.

```text
interaction
↓
local state
↓
persistence
```

서버 roundtrip 때문에 typing/checkbox/drag가 지연되지 않는다.

---

## 11.61 Persistence Failure — Text

Text save 실패 시 최신 draft를 보존한다.

사용자가 계속 입력 중이라면 오래된 value로 조용히 rollback하지 않는다.

`unsaved/error` state + retry를 우선한다.

---

## 11.62 Persistence Failure — Toggle

Check toggle 저장 실패:

```text
optimistic checked
↓ failure
previous checked state로 rollback
```

error feedback을 제공한다.

---

## 11.63 Persistence Failure — Reorder

Reorder 저장 실패:

```text
dragged order
↓ failure
previous order restore
```

가능하면 사용자가 이해할 수 있는 subtle error feedback을 준다.

---

## 11.64 Rapid Toggle

빠른:

```text
unchecked
→ checked
→ unchecked
```

에서 마지막 action이 최종 상태여야 한다.

Mutation sequence/version을 사용해 늦은 response가 최신 state를 덮어쓰지 않게 한다.

---

## 11.65 Rapid Reorder

연속 drag reorder에서도 최신 `sortKey` state가 최종 상태여야 한다.

---

## 11.66 Cross-view Preview

Checklist 전체는 Detail에서 관리하지만 다른 View에서 preview를 보여줄 수 있다.

예:

```text
Task A      2/5
```

또는 일부 item preview.

이 경우 같은 CheckItem entities에서 derived한다.

별도 `checklistPreview` data를 저장하지 않는다.

---

## 11.67 Search

CheckItem text를 Search index에 포함할 수 있다.

예:

```text
Task title에는 "Meeting"
CheckItem에는 "Send budget"
```

Search `"budget"`으로 해당 Task를 찾을 수 있게 확장 가능하다.

검색 결과에는 parent Task context를 보여준다.

---

## 11.68 Search Result Editing

Search 결과에서 CheckItem을 직접 편집할지 여부는 View spec에 맡긴다.

V1에서는 Task Detail을 열어 수정하는 것을 기본으로 한다.

---

## 11.69 Recurring Task Checklist

Recurring Task가 Checklist mode일 경우 중요한 복제 semantics가 필요하다.

기본 원칙:

> Series의 Checklist는 occurrence template로 취급한다.

새 occurrence에서는 Item text/order를 복제하되 checked 상태는 reset한다.

예:

```text
Series template
☐ A
☐ B
☐ C
```

Aug 24 occurrence:

```text
☑ A
☐ B
☑ C
```

Aug 31 occurrence:

```text
☐ A
☐ B
☐ C
```

과거 occurrence의 checked 상태를 다음 occurrence에 복사하지 않는다.

---

## 11.70 Recurring Checklist Template

장기적으로 Series template CheckItem과 occurrence CheckItem state를 분리하는 구조가 이상적이다.

V1 구현이 단순해야 한다면 materialized occurrence 생성 시 CheckItem을 clone할 수 있다.

중요한 invariant:

```text
previous occurrence completion state
→ next occurrence에 전파 ❌
```

---

## 11.71 Editing Recurring Checklist Text

Recurring occurrence의 Item text를 수정하면 recurrence edit scope 문제가 생긴다.

예:

```text
This occurrence
This and future
All
```

V1에서는 Series-level Checklist template 편집을 기본으로 하고, 특정 occurrence override는 Recurrence exception 확장으로 처리한다.

---

## 11.72 Subtask Conversion

Checklist Item을 Subtask로 승격하는 기능을 향후 지원할 수 있다.

예:

```text
☐ Prepare slides
↓ Convert to Subtask
```

결과:

```text
Subtask
title = "Prepare slides"
```

CheckItem은 제거되고 새 Task가 생성된다.

---

## 11.73 Checklist → Subtask Conversion Transaction

Conversion은 atomic해야 한다.

```text
1. Subtask Task create
2. Parent link 설정
3. CheckItem remove
```

중간에 둘 다 존재하거나 둘 다 사라지는 상태를 피한다.

실패 시 원래 CheckItem을 유지한다.

---

## 11.74 Checked Item → Subtask

이미 checked Item을 Subtask로 변환할 경우 상태 처리 정책이 필요하다.

기본 권장:

```text
checked CheckItem
→ completed Subtask
```

로 의미를 보존한다.

다만 사용자 확인 없이 복잡한 schedule/tag를 생성하지 않는다.

---

## 11.75 Subtask → Checklist Conversion

반대로 단순 Subtask를 CheckItem으로 바꾸는 기능을 향후 제공할 수 있다.

단 다음 속성이 있는 Subtask는 정보 손실 위험이 있다.

```text
date
priority
tags
description
children
attachments
```

따라서 정보 손실 가능성이 있으면 conversion을 차단하거나 confirm을 요구한다.

---

## 11.76 Checklist and Attachments

CheckItem 자체에 Attachment를 직접 연결하지 않는 것을 V1 기본으로 한다.

Attachment가 필요한 항목은 Subtask로 승격하는 편이 domain이 명확하다.

---

## 11.77 Checklist and Priority

CheckItem에는 Task priority를 추가하지 않는다.

Priority가 필요하면 Subtask로 승격한다.

---

## 11.78 Checklist and Date

CheckItem에는 개별 date/reminder를 추가하지 않는다.

Date가 필요한 항목은 Subtask다.

---

## 11.79 Checklist and Tags

CheckItem에는 Tag를 추가하지 않는다.

분류 가능한 작업 단위가 필요하면 Subtask를 사용한다.

---

## 11.80 Completed / Won't Do Task

Task 자체가 completed/wont_do 상태여도 Checklist를 확인/편집할 수 있다.

```text
Task completed
≠
Checklist locked
```

4장 Status 원칙과 일치한다.

---

## 11.81 Parent Task Selection

CheckItem click/edit는 `selectedTaskId`를 다른 값으로 바꾸지 않는다.

Checklist Item은 독립 Task가 아니므로 Detail navigation target이 아니다.

---

## 11.82 Context Menu Target

CheckItem context menu를 지원하면:

```ts
contextTargetCheckItemId
```

를 사용한다.

Task의:

```ts
contextTargetTaskId
```

와 의미를 섞지 않는다.

---

## 11.83 Keyboard Focus Model

각 Item은 다음 focusable 요소를 가질 수 있다.

```text
checkbox
text editor
drag/reorder control
more menu
```

Tab order가 자연스럽고 예측 가능해야 한다.

---

## 11.84 Arrow Navigation

Text editing 중 Arrow는 caret 이동을 우선한다.

Item 간 navigation shortcut은 text caret semantics와 충돌하지 않게 별도 modifier를 사용하거나 명확한 context에서만 동작한다.

---

## 11.85 Accessibility Label

Checkbox:

```text
"Mark Prepare slides complete"
```

checked:

```text
"Mark Prepare slides incomplete"
```

같이 Item text와 상태를 포함한 accessible name을 제공한다.

---

## 11.86 Drag Accessibility

Mouse drag를 사용할 수 없는 사용자를 위해 reorder menu/action 또는 keyboard reorder를 제공한다.

---

## 11.87 Checked State Accessibility

Color/strikethrough만으로 완료를 표시하지 않는다.

실제 checkbox semantics:

```text
checked=true
```

를 accessibility tree에 제공한다.

---

## 11.88 Long Item Text

Item text는 logical single-line이지만 Detail width에서 visual wrap은 허용한다.

```text
single logical line
≠
single visual line
```

Title과 같은 원칙.

---

## 11.89 Auto-growing Item Editor

긴 Item text는 필요하면 높이가 늘어나는 single-value editor를 사용할 수 있다.

Enter/newline은 막는다.

---

## 11.90 Large Checklist Performance

Item이 매우 많아질 경우:

```text
100+
500+
```

에도 scroll/typing/checkbox latency가 과도해지지 않게 한다.

필요하면:

```text
virtualized rendering
memoized selectors
incremental updates
```

를 사용할 수 있다.

단 virtualization 때문에 focus/drag/accessibility가 깨지지 않도록 한다.

---

## 11.91 Sorting and Derived Progress

Check toggle은 manual `sortKey`를 변경하지 않는다.

Progress 계산만 다시 한다.

자동 completed-bottom preference가 활성화된 경우 View에서 derived grouping을 적용할 수 있다.

---

## 11.92 Command Layer

UI가 CheckItem store를 직접 수정하지 않는다.

공통 command 예:

```ts
createCheckItem(taskId, text, position?)
setCheckItemText(checkItemId, text)
toggleCheckItem(checkItemId)
deleteCheckItem(checkItemId)
reorderCheckItem(checkItemId, beforeId?, afterId?)
```

---

## 11.93 Conversion Commands

Description/Checklist/Subtask 변환은 별도 command로 묶는다.

```ts
convertDescriptionToChecklist(taskId)
convertChecklistToDescription(taskId)
convertCheckItemToSubtask(checkItemId)
```

각 command가 transaction/Undo를 책임진다.

---

## 11.94 Command Responsibilities

Checklist command layer:

```text
validation
normalization
optimistic update
sortKey calculation
persistence
undo snapshot
failure rollback
search/progress invalidation
```

을 담당한다.

---

## 11.95 No-op Detection

Item text normalize 결과가 기존 text와 동일하면 불필요한 mutation을 만들지 않는다.

---

## 11.96 Activity History

향후 Task Activity를 지원하면 다음 event를 기록할 수 있다.

```text
Checklist item added
Checklist item completed
Checklist item reordered
Checklist converted
```

하지만 CheckItem history 배열을 Task entity 안에 넣지 않는다.

---

## 11.97 Offline / Local-first

Add/Edit/Toggle/Reorder는 local-first로 처리 가능하다.

```text
interaction
→ local state
→ persistence/sync queue
```

네트워크가 없어도 Checklist 사용 흐름이 막히지 않게 확장 가능해야 한다.

---

## 11.98 Conflict Handling

다른 device에서 같은 Checklist를 동시에 수정할 수 있다.

특히 reorder와 text edit이 충돌할 수 있으므로:

```text
entity revision
sortKey
updatedAt
```

기반 conflict handling을 확장할 수 있게 한다.

Active local text draft를 remote update가 조용히 덮어쓰지 않는다.

---

## 11.99 Prohibited Patterns

- Checklist Item을 Subtask와 같은 entity로 취급
- CheckItem에 Date/Priority/Tag/Reminder를 계속 붙여 사실상 Task로 만들기
- Description → Checklist 전환 시 기존 Description을 조용히 삭제
- Checklist → Description 전환 시 checked state 정보 손실을 사용자에게 숨김
- 모든 CheckItem 완료 시 Task 자동 완료
- Task 완료 시 모든 CheckItem 자동 체크
- Check toggle 후 Item 자동 맨 아래 이동을 강제
- Enter로 multiline CheckItem 생성
- IME composition 중 Enter로 새 Item 생성
- 빈 CheckItem을 DB에 계속 누적
- CheckItem reorder 때 모든 sibling index를 매번 대량 rewrite
- Main/Detail마다 별도 Checklist data copy 사용
- Checkbox click이 Task Detail navigation/selection을 바꿈
- Markdown checkbox text를 자동으로 CheckItem entity로 간주
- Recurring Task의 이전 occurrence checked state를 다음 occurrence에 복사
- Drag만 유일한 reorder 방법으로 제공
- Conversion을 여러 개의 비원자적 mutation으로 처리

---

## 11.100 Acceptance Criteria

### Mode Conversion

- [ ] Empty Description에서 Checklist로 즉시 전환할 수 있다.
- [ ] Non-empty Description 전환 시 사용자 데이터가 유실되지 않는다.
- [ ] Description line을 CheckItem으로 변환할 수 있다.
- [ ] Blank line을 불필요한 Item으로 만들지 않는다.
- [ ] Bullet/number prefix를 합리적으로 normalize할 수 있다.
- [ ] Checklist → Description 전환이 가능하다.
- [ ] Checked state의 정보 손실 가능성을 명확히 처리한다.
- [ ] Conversion은 atomic하고 Undo 가능하다.

### Item Creation / Editing

- [ ] 새 CheckItem을 만들 수 있다.
- [ ] Item text는 single logical line이다.
- [ ] Enter로 다음 Item을 만들 수 있다.
- [ ] Empty Item Enter/Blur 시 불필요한 entity가 남지 않는다.
- [ ] Empty Item Backspace로 이전 Item으로 자연스럽게 이동한다.
- [ ] Leading/trailing whitespace를 normalize한다.
- [ ] Multi-line paste를 여러 Item으로 만들 수 있다.

### Completion

- [ ] Item을 check/uncheck할 수 있다.
- [ ] checked state에 `completedAt`을 기록한다.
- [ ] 모든 Item 완료가 Task 자동 완료를 유발하지 않는다.
- [ ] Task 완료가 Item 상태를 자동 변경하지 않는다.
- [ ] Check toggle이 manual order를 바꾸지 않는다.
- [ ] Progress를 derived할 수 있다.

### Reorder / Delete

- [ ] Drag & Drop으로 Item 순서를 바꿀 수 있다.
- [ ] `sortKey` 기반으로 reorder할 수 있다.
- [ ] Drag와 click/edit를 구분한다.
- [ ] Keyboard 또는 대체 reorder 방법을 지원할 수 있다.
- [ ] Item을 삭제할 수 있다.
- [ ] Delete Undo를 지원할 수 있다.

### IME / Keyboard

- [ ] 한국어/중국어/일본어 IME를 정상 지원한다.
- [ ] IME 중 Enter가 새 Item을 만들지 않는다.
- [ ] Text editing shortcut이 global shortcut보다 우선한다.
- [ ] Keyboard focus order가 예측 가능하다.

### Synchronization

- [ ] Detail과 다른 View preview가 같은 CheckItem entities를 읽는다.
- [ ] Checklist progress가 즉시 갱신된다.
- [ ] Search index에 CheckItem text를 포함할 수 있다.
- [ ] Task selection과 CheckItem interaction이 분리된다.
- [ ] Recurring Checklist occurrence가 checked state를 독립적으로 유지할 수 있다.

### Architecture

- [ ] CheckItem은 별도 entity다.
- [ ] `contentMode`가 Description/Checklist active mode를 결정한다.
- [ ] Checklist command layer가 add/edit/toggle/delete/reorder를 담당한다.
- [ ] Conversion command가 transaction/Undo를 담당한다.
- [ ] CheckItem을 복잡한 Task entity로 비대하게 만들지 않는다.
- [ ] Rapid mutation에서 마지막 사용자 action이 최종 state가 된다.
- [ ] Offline/local-first 확장이 가능하다.

---

# 12. Subtask

## 12.1 Purpose

Subtask는 Parent Task 아래에 속하는 **완전한 Task entity**다.

핵심 원칙:

```text
Task
│
├─ Subtask A
│   ├─ date
│   ├─ priority
│   ├─ tags
│   ├─ description
│   └─ own subtasks
│
└─ Subtask B
```

Checklist Item과 달리 Subtask는 독립적인 Task lifecycle을 가진다.

```text
Checklist Item
→ simple text + checked

Subtask
→ full Task
```

---

## 12.2 Data Model

2장에서 확정한 동일 `Task` entity를 사용한다.

Subtask를 구분하는 canonical field:

```ts
parentTaskId: string | null;
```

Root Task:

```ts
parentTaskId = null;
```

Subtask:

```ts
parentTaskId = "<parent-task-id>";
```

별도의 `Subtask` entity type은 만들지 않는다.

---

## 12.3 Canonical Relationship

Parent/Child 관계의 source of truth는 `parentTaskId` 하나다.

```text
Task A
├─ Task B
└─ Task C
```

```ts
A.parentTaskId = null;
B.parentTaskId = A.id;
C.parentTaskId = A.id;
```

Task 안에 다음을 중복 저장하지 않는다.

```ts
❌ subtasks: ["B", "C"]
```

Children은 selector/query로 가져온다.

```ts
getChildTasks(parentTaskId);
```

---

## 12.4 Multi-level Nesting

Subtask는 다시 Subtask를 가질 수 있다.

예:

```text
Task A
└─ Task B
   └─ Task C
      └─ Task D
```

동일한 `parentTaskId` 구조로 표현한다.

---

## 12.5 Nesting Depth

기술적으로는 arbitrary depth를 수용 가능한 모델을 유지한다.

다만 UI 복잡도를 제한하기 위해 제품 차원의 max nesting depth를 둘 수 있다.

권장:

```ts
MAX_SUBTASK_DEPTH = configurable;
```

하드코딩을 여러 component에 반복하지 않는다.

실제 TickTick 실측 depth가 확인되면 해당 값으로 조정한다.

---

## 12.6 Hierarchy Invariants

다음 관계는 허용하지 않는다.

### Self Parent

```text
A.parentTaskId = A.id
```

### Cycle

```text
A → B → C → A
```

### Descendant as Parent

A의 descendant C를 A의 새 parent로 지정하는 것:

```text
A
└─ B
   └─ C

A.parent = C
```

금지.

Parent 변경 전에 ancestry validation을 수행한다.

---

## 12.7 Subtask Section 위치

Task Detail의 Content Body 아래쪽에 Subtask section을 둔다.

예:

```text
Task Title

Description / Checklist

────────────────────

Subtasks
☐ Child A
☐ Child B

+ Add subtask
```

정확한 divider/spacing은 Visual System에서 확정한다.

---

## 12.8 Empty State

Subtask가 없을 때 과도한 empty card를 표시하지 않는다.

예:

```text
+ Add subtask
```

만 노출할 수 있다.

Progressive disclosure 원칙을 따른다.

---

## 12.9 Add Subtask Entry Point

기본 진입점:

```text
+ Add subtask
```

Description의 Slash / `+` Insert Menu에서도 같은 action을 호출할 수 있다.

모든 진입점은 같은 business logic을 사용한다.

```ts
createSubtask(parentTaskId, title?)
```

---

## 12.10 New Subtask Creation

Add Subtask 클릭:

```text
Parent Detail
↓
inline new-subtask editor
```

예:

```text
☐ |
```

사용자는 바로 title을 입력한다.

---

## 12.11 Temporary Empty Subtask

빈 Subtask를 누르자마자 permanent DB entity로 남기지 않는다.

권장 방식:

```text
inline draft
→ 첫 non-empty title 입력
→ Task entity 생성
```

또는 client-generated temp ID를 사용하고, empty blur 시 제거한다.

---

## 12.12 Empty Subtask Blur

새 Subtask editor가 비어 있는 상태에서 blur:

```text
draft remove
```

실제 Task entity를 남기지 않는다.

---

## 12.13 Enter Behavior

Subtask title editing 중:

```text
Enter
→ current Subtask title commit
→ next new Subtask editor create/focus
```

빠른 연속 입력을 지원한다.

예:

```text
☐ Research
↓ Enter
☐ Research
☐ |
```

---

## 12.14 Enter on Empty Draft

빈 Subtask draft에서 Enter:

```text
empty draft 제거
→ creation flow 종료
```

불필요한 empty Task를 생성하지 않는다.

---

## 12.15 Escape in New Subtask Draft

새 Subtask title 입력 중 Esc:

```text
uncommitted draft cancel
→ empty row 제거
```

이미 생성/commit된 Subtask를 자동 삭제하지 않는다.

---

## 12.16 Title Editor Reuse

Subtask title은 9장의 `TaskTitleEditor` primitive/semantics를 최대한 재사용한다.

단 inline row에서:

```text
Enter → next subtask
```

같은 context-specific behavior는 adapter를 통해 확장한다.

Subtask만을 위한 별도 title domain logic을 만들지 않는다.

---

## 12.17 Default Inheritance

새 Subtask 생성 시 무엇을 Parent에서 상속할지 명확히 한다.

기본 권장:

```text
Inherited
→ listId

Not automatically inherited
→ date
→ reminder
→ priority
→ tags
→ description
→ recurrence
→ completed status
```

즉 Child는 Parent와 같은 List에는 속하지만 나머지는 독립 Task다.

---

## 12.18 List Inheritance

2장에서 확정한 invariant:

> Parent와 descendants는 같은 List에 속한다.

따라서 Subtask 생성 시:

```ts
child.listId = parent.listId;
```

로 설정한다.

사용자가 Subtask만 다른 List로 이동하는 것은 기본적으로 허용하지 않는다.

---

## 12.19 Parent Move to Another List

Parent를:

```text
Study → Work
```

로 이동하면 모든 descendants도 함께 이동한다.

```text
Parent → Work
Child A → Work
Child B → Work
Grandchild → Work
```

하나의 hierarchy transaction으로 처리한다.

---

## 12.20 Why Descendants Move Together

Parent와 Child가 서로 다른 List에 존재하면 다음 문제가 생긴다.

```text
Hierarchy navigation 혼란
List ownership 불명확
Drag/drop semantics 충돌
Breadcrumb 불일치
```

따라서 hierarchy와 List membership을 일관되게 유지한다.

---

## 12.21 Subtask Complete State

각 Subtask는 독립적인 Task status를 가진다.

```text
□ Parent
├─ ✓ Child A
└─ □ Child B
```

유효하다.

Parent 상태는 Child status를 자동 변경하지 않는다.

---

## 12.22 Parent Completion

4장에서 확정한 규칙을 유지한다.

Parent complete:

```text
✓ Parent
├─ □ Child A
└─ □ Child B
```

가능.

Child를 강제로 complete하지 않는다.

---

## 12.23 Child Completion

모든 Child가 complete되어도 Parent는 자동 complete되지 않는다.

```text
□ Parent
├─ ✓ Child A
└─ ✓ Child B
```

유효하다.

---

## 12.24 Derived Subtask Progress

Parent UI에서 다음 progress를 보여줄 수 있다.

```text
2 / 3 subtasks
67%
```

하지만 canonical Task field로 저장하지 않는다.

```text
❌ subtaskProgress
❌ completedSubtaskCount
```

selector로 계산한다.

---

## 12.25 Status Definition for Progress

Progress 계산에 어떤 status를 완료로 취급할지 명확히 한다.

기본 권장:

```text
completed → done
wont_do   → done/closed
open      → not done
```

UI에서 완료율을 “실행 완료율”로 볼지 “종료율”로 볼지 다를 수 있으므로 label semantics를 명확히 한다.

V1 기본 progress는:

```text
closed child count / total child count
```

로 정의할 수 있다.

---

## 12.26 Subtask Row 기본 구조

예:

```text
☐  Child Task Title          Today   ⚑
```

표시 가능한 정보:

```text
status
title
date summary
priority
```

과도한 metadata는 한 줄에 모두 노출하지 않는다.

---

## 12.27 Subtask Row Click

Subtask row의 neutral surface 클릭:

```text
selectedTaskId
Parent → Child
```

같은 Task Detail Pane에서 Child Detail로 전환한다.

새 Modal을 띄우지 않는다.

---

## 12.28 Subtask Checkbox Click

Checkbox click:

```text
status toggle only
```

Child Detail을 자동으로 열지 않는다.

3장의 Task Row interaction rule과 동일하다.

---

## 12.29 Subtask Date / Priority Inline Click

Subtask row에 Date/Priority control이 노출되는 경우:

```text
Date click
→ Date popover

Priority click
→ Priority popover
```

Row selection으로 bubbling하지 않는다.

---

## 12.30 Parent Navigation

Child Detail에서는 Parent로 돌아갈 수 있는 navigation affordance가 필요하다.

예:

```text
← Parent Task
```

또는 breadcrumb:

```text
Parent Task > Child Task
```

정확한 visual은 Visual System에서 정한다.

---

## 12.31 Breadcrumb

Deep nesting에서 breadcrumb를 사용할 수 있다.

예:

```text
Project Setup > Research > Sources
```

너무 긴 hierarchy에서는:

```text
… > Research > Sources
```

처럼 축약할 수 있다.

Canonical hierarchy는 생략하지 않는다.

---

## 12.32 Breadcrumb Click

Ancestor를 클릭하면:

```ts
selectTask(ancestorTaskId);
```

같은 Detail Pane에서 해당 Task로 전환한다.

새 Detail stack을 생성하지 않는다.

---

## 12.33 Browser History

Parent → Child → Grandchild 이동이 URL에 반영되는 경우 browser history와 통합한다.

예:

```text
/task/A
→ /task/B
→ /task/C
```

Back:

```text
C → B → A
```

3장의 navigation rule을 따른다.

---

## 12.34 Reorder Siblings

같은 Parent 아래 sibling Subtask는 drag reorder를 지원한다.

```text
A
B
C

C drag
↓
C
A
B
```

각 Task의 `sortKey`를 sibling scope에서 갱신한다.

---

## 12.35 Reorder Scope

Sibling reorder의 scope:

```text
same parentTaskId
```

이다.

Root Task와 Child Task의 sortKey namespace를 구분한다.

---

## 12.36 Fractional Ordering

모든 sibling index를 매번 다시 쓰지 않고 2장의 `sortKey` 전략을 사용한다.

---

## 12.37 Drag Handle

Hover/focus 시 drag handle을 노출할 수 있다.

```text
⋮⋮ ☐ Child Task
```

항상 강하게 표시하지 않아도 된다.

---

## 12.38 Drag to Reparent

Subtask를 다른 Parent 아래로 drag하여 parent를 변경하는 기능을 지원할 수 있다.

예:

```text
Parent A
└─ Child X

Parent B
```

Child X를 Parent B로 drag:

```text
Child X.parentTaskId
A → B
```

---

## 12.39 Reparent Validation

Reparent 전에 검사:

```text
새 Parent 존재
same List
not self
not descendant
max depth 초과 아님
```

모두 만족해야 한다.

---

## 12.40 Reparent and List

새 Parent가 같은 List에 있으면 그대로 reparent.

다른 List에 있다면 기본적으로 두 선택지가 있다.

Master Spec 권장:

> Reparent action과 함께 Child subtree 전체를 새 Parent의 List로 이동한다.

즉:

```text
Child subtree
→ newParent.listId
```

transaction으로 처리한다.

---

## 12.41 Reparent Entire Subtree

Child X에 descendants가 있다면 X만 이동시키지 않는다.

```text
X
└─ Y
   └─ Z
```

X를 Parent B로 이동:

```text
X/Y/Z hierarchy 유지
```

전체 subtree가 함께 이동한다.

---

## 12.42 Drag Drop Zones

Drag 중 구분 가능한 drop target:

```text
Between siblings
→ reorder

On another Task
→ make child / reparent
```

시각적 insertion indicator가 명확해야 한다.

---

## 12.43 Accidental Reparent Prevention

Reorder하려다가 우연히 nesting되는 것을 방지한다.

권장:

```text
horizontal threshold
hover dwell
명확한 indent indicator
```

중 하나 이상 사용.

정확한 interaction은 Visual/Interaction polish에서 실측 후 조정한다.

---

## 12.44 Keyboard Reorder / Reparent

Mouse drag 외에도 keyboard action을 지원할 수 있어야 한다.

예:

```text
Move up
Move down
Indent
Outdent
```

정확한 shortcut은 18장에서 확정한다.

---

## 12.45 Indent

Sibling Task를 이전 sibling의 Child로 만드는 action:

```text
A
B

B indent
↓
A
└─ B
```

Hierarchy validation을 거친다.

---

## 12.46 Outdent

Subtask를 Parent의 sibling으로 올리는 action:

```text
A
└─ B

B outdent
↓
A
B
```

B의 새 parent:

```ts
B.parentTaskId = A.parentTaskId;
```

---

## 12.47 Outdent with Children

B에게 descendants가 있다면 B subtree 전체가 함께 outdent된다.

Children hierarchy는 유지한다.

---

## 12.48 Root Task

Root Task는 더 이상 outdent할 수 없다.

```text
parentTaskId = null
→ outdent disabled
```

---

## 12.49 Max Depth

> **[VERIFIED TICKTICK]** TickTick은 최대 **5개의 Task hierarchy level**을 지원한다. TickTick fidelity mode의 기본값은 root Task를 Level 1로 계산하여 총 5단계까지 허용한다.

```ts
const TICKTICK_MAX_TASK_DEPTH = 5;
```

예:

```text
Level 1  Task A
└─ Level 2  Task B
   └─ Level 3  Task C
      └─ Level 4  Task D
         └─ Level 5  Task E
```

Level 5 아래에 추가 Indent/Reparent를 시도하면 action을 차단한다.

```text
Cannot create deeper subtask level
```

같은 feedback을 제공한다.

> **[OUR DESIGN DECISION]** 제품이 향후 TickTick compatibility mode와 자체 확장 mode를 분리해야 한다면 configurable token으로 둘 수 있지만, TickTick fidelity profile에서는 값 5를 사용한다.

---

## 12.50 Delete Subtask

Subtask는 일반 Task이므로 Delete는 Task delete semantics를 따른다.

```text
deletedAt = timestamp
```

단 descendants 처리 정책이 필요하다.

---

## 12.51 Delete Parent with Descendants

기본 권장:

> Parent 삭제 시 descendant subtree도 함께 soft delete한다.

예:

```text
Delete Parent
↓
Parent deleted
Child deleted
Grandchild deleted
```

hierarchy를 고아 상태로 남기지 않는다.

---

## 12.52 Delete Confirmation

Descendant가 있는 Parent 삭제는 영향 범위가 크므로 confirm 또는 명확한 undo feedback을 권장한다.

예:

```text
Delete task and 4 subtasks?
```

정확한 confirm 정책은 More Actions / Error Handling 장에서 통합한다.

---

## 12.53 Delete Undo

Parent subtree delete는 하나의 undo transaction으로 복구해야 한다.

```text
Parent
Children
sortKey
parentTaskId
```

전체 hierarchy를 원래 상태로 복원한다.

---

## 12.54 Delete Child Only

Leaf Child 삭제:

```text
해당 Task만 soft delete
```

Parent는 유지한다.

---

## 12.55 Delete Intermediate Parent

예:

```text
A
└─ B
   └─ C
```

B 삭제 시 기본적으로:

```text
B + C subtree 삭제
```

C를 자동으로 A 밑으로 승격시키지 않는다.

암묵적인 hierarchy 재구성을 피한다.

---

## 12.56 Move Subtask to Root

명시적 action으로 Child를 Root Task로 승격할 수 있다.

```text
parentTaskId = null
```

List는 기존 List 유지.

---

## 12.57 Move Root into Parent

Root Task를 다른 Task의 Subtask로 만들 수도 있다.

조건:

```text
same/compatible List
cycle 없음
depth 허용
```

기존 subtree도 함께 이동한다.

---

## 12.58 Convert CheckItem to Subtask

11장에서 정의한 conversion을 Subtask system에서 수용한다.

```text
CheckItem
↓ Convert to Subtask
Task create
parentTaskId = owning Task
```

CheckItem text는 Subtask title이 된다.

---

## 12.59 Convert Subtask to CheckItem

단순 Subtask를 CheckItem으로 변환하는 기능은 정보 손실 검사를 거친다.

다음 속성이 있으면 경고/차단:

```text
schedule
priority
tags
description
children
attachments
recurrence
reminder
```

안전한 단순 Subtask만 바로 변환 가능하다.

---

## 12.60 Parent Move / Archive-like Actions

Parent에 적용되는 hierarchy-sensitive action은 descendants 영향 여부를 반드시 정의한다.

예:

```text
Move List
Delete
Duplicate
Recurring conversion
```

Subtree 단위 transaction이 필요한 경우 command layer가 처리한다.

---

## 12.61 Duplicate Parent

Parent Task를 duplicate할 때 Subtasks도 복제할지 선택 정책이 필요하다.

기본 권장:

```text
Duplicate Task
→ include subtasks
```

를 기본값으로 하거나 confirm option을 제공한다.

복제된 hierarchy는 새 Task ID를 사용한다.

---

## 12.62 Duplicate IDs

Duplicate 시 절대 기존 IDs를 재사용하지 않는다.

```text
Original A → Copy A'
Original B → Copy B'
```

Parent mapping도 새 ID 기준으로 다시 연결한다.

---

## 12.63 Status on Duplicate

Duplicate된 Task/Subtask는 기본적으로:

```text
status = open
completedAt = null
```

로 reset하는 것을 권장한다.

원본 완료 상태를 그대로 복사할지 여부는 Duplicate spec에서 최종 확정한다.

---

## 12.64 Date / Reminder on Duplicate

Schedule/Reminder 복제 여부는 Duplicate action의 product semantics와 통합한다.

Subtask 구조 자체는 유지 가능해야 한다.

---

## 12.65 Recurring Parent

7장에서 정의한 중요한 case:

```text
Recurring Parent
├─ Child A
└─ Child B
```

Parent occurrence가 생성될 때 Child template 처리 규칙이 필요하다.

---

## 12.66 Recurring Parent Template

기본 권장:

> Recurring Parent의 Subtask hierarchy는 Series template의 일부로 취급할 수 있다.

각 새 Parent occurrence에:

```text
Child title/structure
→ 복제

Child completed state
→ reset
```

한다.

---

## 12.67 Recurring Child State

이전 occurrence:

```text
Parent Aug 24
├─ ✓ Child A
└─ □ Child B
```

다음 occurrence:

```text
Parent Aug 31
├─ □ Child A
└─ □ Child B
```

과거 status를 다음 occurrence에 전파하지 않는다.

---

## 12.68 Child with Own Recurrence

Child도 자체 recurrence rule을 가질 수 있다.

하지만 Parent recurrence와 자동 결합하지 않는다.

```text
Parent weekly
Child monthly
```

도 기술적으로 가능할 수 있다.

V1에서는 복잡한 nested recurrence를 제한할 수 있으나 data model을 막지 않는다.

---

## 12.69 Recurrence Scope for Subtask Edit

Recurring Series의 Child 구조를 수정할 때:

```text
This occurrence
This and future
All
```

scope가 필요할 수 있다.

V1에서는 template-level Subtask edit을 기본으로 하고 occurrence-specific hierarchy override는 고급 기능으로 둘 수 있다.

---

## 12.70 Parent/Child Dates

Parent와 Child schedule은 독립적이다.

예:

```text
Parent: Friday
Child A: Wednesday
Child B: Thursday
```

유효하다.

Parent 날짜를 바꿨다고 Child 날짜를 자동 이동시키지 않는다.

---

## 12.71 Parent Due Before Child

다음도 기술적으로 가능하다.

```text
Parent: Apr 20
Child: Apr 21
```

시스템이 자동 수정하지 않는다.

필요하면 warning을 줄 수 있으나 domain invariant로 금지하지 않는다.

---

## 12.72 Parent/Child Priority

독립적.

```text
Parent High
Child None
```

유효하다.

---

## 12.73 Parent/Child Tags

Tags도 자동 상속하지 않는다.

Parent와 Child가 각각 고유 Tag를 가질 수 있다.

향후 “inherit tag” 기능은 별도 feature다.

---

## 12.74 Parent/Child Reminder

Reminder도 독립적이다.

Parent Reminder가 Child에 자동 복제되지 않는다.

---

## 12.75 Parent/Child Description

각 Task가 독립 Description을 가진다.

Child Detail에서도 10장의 Description Editor를 그대로 사용한다.

---

## 12.76 Parent/Child Checklist

각 Subtask도 자신의 `contentMode`와 CheckItems를 가질 수 있다.

즉:

```text
Parent
└─ Child
   ├─ Checklist Item A
   └─ Checklist Item B
```

가능하다.

---

## 12.77 Subtask Count

Parent row/Detail에 표시하는:

```text
3 subtasks
```

는 derived selector다.

Canonical field:

```text
❌ subtaskCount
```

를 저장하지 않는다.

---

## 12.78 Descendant Count

필요하면 direct child count와 all descendant count를 구분한다.

```text
directChildCount
descendantCount
```

둘 다 derived.

UI에서는 의미를 명확히 한다.

---

## 12.79 Collapsed / Expanded State

Subtask list가 inline tree로 노출되는 View에서는 expand/collapse UI state가 필요할 수 있다.

이 상태는 Task domain에 저장하지 않는다.

```ts
expandedTaskIds: Set<string>
```

같은 UI state로 관리한다.

---

## 12.80 Detail Subtask Section Expansion

Task Detail 내 Subtask section을 접을 수 있다면 collapse state는 UI preference다.

Task 자체의 field로 저장하지 않는다.

---

## 12.81 Search

Search는 Subtask title/description도 일반 Task와 동일하게 검색할 수 있다.

검색 결과에는 Parent context를 표시할 수 있다.

예:

```text
Child Task
in Parent Task
```

---

## 12.82 Search Result Selection

Subtask 검색 결과를 클릭하면:

```ts
selectedTaskId = childId;
```

같은 Task Detail system으로 연다.

---

## 12.83 Calendar

Subtask가 schedule을 가진다면 Calendar에 독립 Task처럼 표시될 수 있다.

Parent도 schedule을 갖고 있으면 둘 다 표시 가능하다.

Calendar에서는 hierarchy context를 보조 정보로 표시할 수 있다.

---

## 12.84 Board / List

Board/List에서 Subtask 노출 여부는 View 설정에 따라 달라질 수 있다.

하지만 표시 여부와 상관없이 canonical Task entity는 동일하다.

---

## 12.85 Hidden Subtask Does Not Cease to Exist

어떤 View가 Subtask를 숨겨도:

```text
Task entity 삭제 ❌
parent relation 변경 ❌
```

단순 presentation/filter 차이다.

---

## 12.86 URL

Subtask도 일반 Task와 같은 Task URL identity를 가진다.

```text
/task/:childId
```

Parent context는 breadcrumb/query로 복구할 수 있다.

---

## 12.87 Deep Link

Subtask deep link를 직접 열었을 때:

```text
Child Detail
+
Parent hierarchy context
```

를 복원할 수 있어야 한다.

---

## 12.88 Missing Parent

데이터 corruption/sync 문제로 Child의 `parentTaskId`가 존재하지 않는 경우 안전하게 처리한다.

기본 정책:

```text
orphan detected
→ error/recovery
```

조용히 root로 바꾸지 않는다.

Sync repair layer에서 명시적으로 처리한다.

---

## 12.89 Deleted Parent, Live Child Invariant

정상 command flow에서는:

```text
deleted parent
+
live child
```

상태를 만들지 않는다.

Parent delete transaction이 descendants를 함께 soft delete하기 때문이다.

---

## 12.90 Concurrency

두 device에서 동시에 reparent/reorder할 수 있다.

예:

```text
Device A: Child → Parent B
Device B: Child → Parent C
```

silent inconsistent tree가 되지 않도록 revision/conflict policy를 확장 가능하게 한다.

---

## 12.91 Active Edit During Reparent

Child Title 편집 중 remote reparent가 발생해도 local text draft를 조용히 삭제하지 않는다.

Hierarchy update와 text edit state를 분리한다.

---

## 12.92 Command Layer

Subtask/hierarchy 변경은 공통 command를 사용한다.

예:

```ts
createSubtask(parentTaskId, title?)
reorderSubtask(taskId, beforeId?, afterId?)
reparentTask(taskId, newParentTaskId, position?)
outdentTask(taskId)
indentTask(taskId)
moveTaskToRoot(taskId)
deleteTaskSubtree(taskId)
```

---

## 12.93 Hierarchy Command Responsibilities

Command layer가 담당한다.

```text
cycle validation
depth validation
list consistency
subtree collection
sortKey calculation
atomic transaction
optimistic update
persistence
undo snapshot
failure rollback
```

UI component가 `parentTaskId`를 직접 임의 수정하지 않는다.

---

## 12.94 Create Command

`createSubtask()`는 최소 다음을 설정한다.

```ts
{
  id: newId,
  title,
  parentTaskId,
  listId: parent.listId,
  status: "open",
  completedAt: null,
  priority: "none",
  ...
}
```

Parent의 date/priority/tag는 자동 복제하지 않는다.

---

## 12.95 Reparent Transaction

Subtree reparent가 List 이동까지 수반하면 다음을 atomic하게 처리한다.

```text
1. cycle/depth validation
2. parentTaskId update
3. subtree listId update
4. sortKey update
5. affected queries invalidate
```

중간 상태를 화면에 남기지 않는다.

---

## 12.96 Optimistic Update

Reorder/reparent/add/delete 모두 UI에 즉시 반영한다.

```text
interaction
→ local tree update
→ persistence
```

네트워크 roundtrip 때문에 tree interaction이 느려지지 않는다.

---

## 12.97 Failure Rollback

Reparent 실패:

```text
new parent UI
↓ persistence failure
original hierarchy restore
```

Subtree 전체를 원래 `parentTaskId/listId/sortKey` 상태로 되돌린다.

---

## 12.98 Rapid Reorder / Reparent

연속 hierarchy mutation에서 늦은 이전 response가 최신 tree state를 덮어쓰지 않아야 한다.

Mutation sequence/revision을 사용한다.

---

## 12.99 Undo

다음 action은 Undo 지원을 권장한다.

```text
Subtask delete
Reparent
Indent
Outdent
Convert CheckItem → Subtask
```

Undo는 전체 hierarchy snapshot/transaction을 복원해야 한다.

---

## 12.100 Accessibility

Subtask row는 Task title과 hierarchy level을 접근성 tree에서 인식 가능하게 해야 한다.

예:

```text
"Child Task, subtask level 2"
```

같은 정보 제공을 고려한다.

---

## 12.101 Keyboard Navigation

Tree 형태 View에서는:

```text
Arrow Up/Down
→ sibling/visible row 이동

Arrow Right
→ expand / child navigation

Arrow Left
→ collapse / parent navigation
```

같은 tree navigation pattern을 사용할 수 있다.

정확한 binding은 18장 Keyboard와 통합한다.

---

## 12.102 Indent Accessibility

Indent/Outdent는 drag gesture만으로 제공하지 않는다.

Menu/keyboard action을 제공한다.

---

## 12.103 Focus After Create

새 Subtask 생성 후 focus는 새 Subtask title editor에 둔다.

Enter로 연속 생성 가능하게 한다.

---

## 12.104 Focus After Delete

현재 focus된 Subtask 삭제 후:

```text
next sibling
→ 없으면 previous sibling
→ 없으면 Add Subtask / Parent context
```

순으로 안정적인 focus를 복원한다.

---

## 12.105 Focus After Reparent

Reparent 후에도 가능한 경우 이동된 Task row에 focus를 유지한다.

화면에서 위치가 바뀌더라도 사용자가 현재 Task를 잃지 않게 한다.

---

## 12.106 Large Hierarchy Performance

Subtask 수가 많거나 깊은 hierarchy에서도 전체 tree를 매 mutation마다 재귀적으로 무겁게 계산하지 않게 한다.

고려:

```text
parentId index
memoized child selectors
iterative ancestry checks
subtree caching
```

---

## 12.107 Recursive Rendering Safety

재귀 component를 사용할 경우 corrupted cycle 때문에 무한 렌더가 발생하지 않도록 defensive guard를 둔다.

Domain에서는 cycle을 금지하지만 UI도 방어한다.

---

## 12.108 Prohibited Patterns

- Subtask 전용 간이 entity를 별도로 만들어 Task와 기능이 갈라짐
- `parentTaskId`와 `subtasks[]`를 둘 다 canonical relationship으로 유지
- Parent 완료 시 Child 자동 완료
- Child 전체 완료 시 Parent 자동 완료
- Parent 날짜/priority/tag/reminder를 Child에 자동 강제 상속
- Subtask만 다른 List로 독립 이동해 hierarchy/List invariant 깨기
- Reparent 시 cycle 검증 생략
- Parent 삭제 시 live orphan Child 남기기
- Intermediate Parent 삭제 시 Child를 임의로 위로 승격
- Reorder할 때 모든 sibling integer index를 항상 대량 rewrite
- Drag만 유일한 indent/outdent/reparent 방법으로 제공
- Child click마다 새로운 Detail Pane/Modal stack 생성
- Deep link에서 Parent context를 복원할 수 없음
- Recurring Parent의 과거 Child 완료 상태를 다음 occurrence에 복사
- UI component가 `parentTaskId`/`listId`를 직접 임의 변경
- Reparent 실패 시 subtree 일부만 rollback
- 오래된 async response가 최신 hierarchy를 덮어쓰기

---

## 12.109 Acceptance Criteria

### Data / Hierarchy

- [ ] Subtask가 동일 `Task` entity를 사용한다.
- [ ] `parentTaskId`가 canonical hierarchy 관계다.
- [ ] Multi-level nesting을 표현할 수 있다.
- [ ] Self-parent/cycle을 허용하지 않는다.
- [ ] Descendant를 ancestor의 parent로 지정할 수 없다.
- [ ] Max depth를 configurable rule로 제한할 수 있다.

### Creation

- [ ] Parent Detail에서 Subtask를 inline 생성할 수 있다.
- [ ] 빈 Subtask draft가 permanent entity로 남지 않는다.
- [ ] Enter로 연속 Subtask 생성이 가능하다.
- [ ] Esc로 uncommitted new-subtask draft를 취소할 수 있다.
- [ ] 새 Subtask는 Parent의 `listId`만 기본 상속한다.

### Status

- [ ] Parent와 Child status가 독립적이다.
- [ ] Parent 완료가 Child를 자동 완료하지 않는다.
- [ ] Child 전체 완료가 Parent를 자동 완료하지 않는다.
- [ ] Subtask progress를 derived할 수 있다.
- [ ] Child 완료/해제가 일반 Task status command를 사용한다.

### Navigation

- [ ] Subtask row 클릭으로 같은 Detail Pane에서 Child를 연다.
- [ ] Checkbox/Date/Priority click은 row selection과 분리된다.
- [ ] Parent/Ancestor로 돌아갈 수 있다.
- [ ] Deep hierarchy에서도 하나의 `selectedTaskId`를 사용한다.
- [ ] Browser Back/Deep Link와 통합 가능하다.

### Reorder / Reparent

- [ ] Sibling drag reorder를 지원한다.
- [ ] `sortKey` 기반으로 정렬한다.
- [ ] 다른 Parent로 reparent할 수 있다.
- [ ] Reparent 시 subtree가 함께 이동한다.
- [ ] 다른 List Parent로 이동하면 subtree List도 함께 변경된다.
- [ ] Cycle/depth/list validation을 수행한다.
- [ ] Indent/Outdent를 지원할 수 있다.
- [ ] Mouse drag 외 대체 interaction을 제공할 수 있다.

### Delete / Undo

- [ ] Leaf Child를 삭제할 수 있다.
- [ ] Parent 삭제 시 descendant subtree를 함께 soft delete한다.
- [ ] Intermediate Parent 삭제가 children을 임의 승격시키지 않는다.
- [ ] Subtree delete를 Undo할 수 있다.
- [ ] Reparent/Indent/Outdent Undo를 지원할 수 있다.

### Feature Independence

- [ ] Parent/Child Date가 독립적이다.
- [ ] Parent/Child Priority가 독립적이다.
- [ ] Parent/Child Tags가 독립적이다.
- [ ] Parent/Child Reminder가 독립적이다.
- [ ] 각 Child가 자체 Description/Checklist를 가질 수 있다.
- [ ] CheckItem → Subtask conversion을 transaction으로 처리할 수 있다.

### Recurrence

- [ ] Recurring Parent의 Subtask hierarchy를 template로 확장할 수 있다.
- [ ] 다음 occurrence에서 Child status를 reset할 수 있다.
- [ ] Child 자체 recurrence와 Parent recurrence를 자동 혼합하지 않는다.
- [ ] recurrence edit scope와 hierarchy edit를 통합할 수 있다.

### Synchronization / Architecture

- [ ] Search/Calendar/Board/List가 같은 Subtask Task entity를 읽는다.
- [ ] Hierarchy command layer가 mutation을 담당한다.
- [ ] Reparent/List 이동을 atomic transaction으로 처리한다.
- [ ] Optimistic update + failure rollback을 지원한다.
- [ ] Rapid hierarchy mutation에서 마지막 사용자 action이 최종 state가 된다.
- [ ] Orphan/corrupted hierarchy를 안전하게 감지할 수 있다.

---

# 13. List · Folder · Tags

## 13.1 Purpose

List · Folder · Tags는 Task를 **어디에 소속시키고, 어떻게 분류하고, 어떻게 다시 찾을 것인지**를 담당하는 organization layer다.

핵심 개념을 먼저 분리한다.

```text
Folder
└─ List
   └─ Task

Tag
↔ Task
```

즉:

```text
List
→ Task의 primary container

Folder
→ 여러 List를 묶는 navigation container

Tag
→ Task에 복수로 붙을 수 있는 cross-cutting classification
```

Task가 Folder에 직접 소속되는 구조는 기본적으로 사용하지 않는다.

---

## 13.2 Canonical Relationships

Task의 primary organization field:

```ts
listId: string;
```

Tag는 many-to-many 관계:

```ts
type TaskTag = {
  taskId: string;
  tagId: string;
};
```

Folder는 List를 묶는 구조다.

예:

```ts
type Folder = {
  id: string;
  name: string;
  sortKey: string;
};

type List = {
  id: string;
  name: string;
  folderId: string | null;
  sortKey: string;
};
```

Task에는:

```text
folderId
```

를 직접 저장하지 않는다.

---

## 13.3 Why Task Does Not Store `folderId`

다음 구조는 중복 관계를 만든다.

```text
Task.listId = Study
Study.folderId = School

+

Task.folderId = School
```

List를 다른 Folder로 옮겼을 때 Task.folderId까지 전부 갱신해야 한다.

따라서 canonical path는 하나만 둔다.

```text
Task → List → Folder
```

---

## 13.4 Every Task Belongs to One List

기본 invariant:

> 모든 live Task는 정확히 하나의 List에 속한다.

```ts
task.listId !== null;
```

사용자가 List를 명시하지 않은 새 Task는 기본 List로 생성한다.

예:

```text
Inbox
```

---

## 13.5 Default List

앱에는 하나의 기본 수신함 역할 List가 필요하다.

예:

```text
Inbox
```

새 Task 생성 시 명시적 destination이 없다면:

```ts
listId = inboxListId;
```

로 설정한다.

`null list` Task를 대량으로 허용하지 않는다.

---

## 13.6 List vs Smart View

다음을 구분한다.

```text
List
→ Task가 실제로 소속되는 container

Today
Tomorrow
Next 7 Days
High Priority
Search
→ query/view
```

예:

```text
Task A
listId = Study

Today에도 표시될 수 있음
High Priority에도 표시될 수 있음
Search에도 표시될 수 있음
```

하지만 canonical 소속 List는 Study 하나다.

---

## 13.7 Folder Is Not a Task Container

Folder는 Task가 직접 들어가는 container가 아니다.

```text
Folder
├─ List A
├─ List B
└─ List C
```

Task 생성 위치를 Folder만 선택하도록 하지 않는다.

반드시 하나의 List를 선택한다.

---

## 13.8 List Entry Point in Task Detail

Task Detail에서 현재 List를 확인/변경할 수 있는 organization affordance가 필요하다.

표현 방식 예:

```text
List
Study
```

또는 compact property row:

```text
📁 Study
```

정확한 위치는 전체 Detail layout/Visual System에서 확정한다.

---

## 13.9 Move to List

List property click:

```text
Current List
↓
List Picker / Move Menu
```

예:

```text
┌────────────────────────┐
│ Move to                │
├────────────────────────┤
│ Inbox                  │
│ School                 │
│   Research             │
│   Coursework           │
│ Work                   │
│   SkinIDX              │
└────────────────────────┘
```

Folder는 list grouping을 위해 menu에 표시할 수 있다.

---

## 13.10 List Picker Semantics

List Picker에서 selectable item은 List다.

Folder header는 기본적으로 selection target이 아니다.

```text
School          ← group heading
  Research      ← selectable
  Coursework    ← selectable
```

---

## 13.11 Current List Indicator

현재 Task의 List는 selected/check state로 보여준다.

예:

```text
✓ Study
```

같은 List를 다시 선택하면 no-op이다.

불필요한 move transaction을 만들지 않는다.

---

## 13.12 Move Command

공통 command:

```ts
moveTaskToList(taskId, targetListId);
```

단 Subtask hierarchy가 있으면 실제 동작은 subtree-aware해야 한다.

---

## 13.13 Root Task List Move

Root Task에 descendants가 없다면:

```text
Task A
Study → Work
```

Domain:

```ts
task.listId = workListId;
```

---

## 13.14 Parent Task List Move

Parent Task에 descendants가 있으면 12장에서 확정한 invariant를 유지한다.

```text
Parent + entire subtree
→ same target List
```

예:

```text
Study
Parent
├─ Child A
└─ Child B
```

Move Parent → Work:

```text
Work
Parent
├─ Child A
└─ Child B
```

모든 descendant의 `listId`를 함께 변경한다.

---

## 13.15 Subtask-only List Move

Subtask만 다른 List로 옮기는 것은 기본적으로 허용하지 않는다.

이유:

```text
Parent/Child hierarchy
+
List membership
```

불일치를 만들기 때문이다.

사용자가 Child를 다른 List로 보내고 싶다면 다음 중 하나의 명시적 구조 변경이 필요하다.

```text
1. Child를 Root로 승격 후 이동
2. 다른 Parent로 reparent
```

---

## 13.16 Move Subtask to Another List UX

Subtask에서 Move to List를 실행하면 기본적으로 다음 선택을 제공할 수 있다.

```text
Move this task to another list?
This will remove it from its parent.
```

확정 시:

```text
1. parentTaskId = null
2. listId = targetListId
```

즉 암묵적으로 hierarchy invariant를 깨지 않는다.

V1에서는 이 action 자체를 숨기고 `Move to Root` 후 이동하도록 단순화할 수 있다.

---

## 13.17 Folder Move

List를 Folder 간 이동시키는 것은 List management 기능이다.

예:

```text
List Research
Folder School → Work
```

Task는 `listId`가 그대로이므로 개별 Task mutation은 필요 없다.

즉:

```text
Task.listId unchanged
Folder path derived via List
```

---

## 13.18 Folder Rename

Folder 이름 변경은 Task 데이터에 영향이 없다.

Task에 folder path string을 저장하지 않기 때문이다.

---

## 13.19 List Rename

List 이름 변경도 Task의 `listId`는 그대로 유지한다.

```text
Study → Coursework
```

Task migration 불필요.

View label만 새 List name을 읽는다.

---

## 13.20 List Delete

List를 삭제하려면 해당 List의 Task 처리 정책이 필요하다.

기본 권장:

> Task를 고아 상태로 남기지 않는다.

선택 가능한 UX:

```text
Move tasks to Inbox
Choose another List
Delete tasks too
Cancel
```

V1 기본 추천:

```text
Delete List
→ contained Tasks move to Inbox
```

단 destructive ambiguity를 줄이기 위해 confirm을 제공한다.

---

## 13.21 List Delete with Hierarchy

Parent/Subtask subtree도 함께 동일 fallback List로 이동한다.

Hierarchy는 유지한다.

```text
Deleted List
Parent
├─ Child
└─ Child
```

→ Inbox:

```text
Parent
├─ Child
└─ Child
```

---

## 13.22 Cannot Delete Default Inbox

기본 Inbox를 시스템 필수 List로 쓴다면 삭제 불가로 두는 것을 권장한다.

Rename 허용 여부는 제품 정책에 따라 결정한다.

---

## 13.23 Deleted List Deep Link

삭제된 List URL을 열었을 경우 무한 loading을 띄우지 않는다.

안전한 unavailable state 또는 Inbox fallback을 제공한다.

Task Detail이 열려 있고 Task가 이미 다른 List로 migration됐다면 새 List context를 반영한다.

---

## 13.24 Move and Current View

현재 List A 화면에서 Task를 List B로 이동하면 Main View에서 Task가 사라질 수 있다.

3장 Selection 규칙:

```text
Task 자체 property 수정으로 query에서 빠짐
→ 열린 Detail 유지
```

따라서:

```text
List A Main
Task A disappears

Detail
Task A remains open
List = B
```

---

## 13.25 Sidebar Count

List별 count는 Task relation/status에서 derived한다.

Task move 시:

```text
List A count
List B count
```

를 자동 재계산한다.

컴포넌트가 수동 `-1 / +1`하지 않는다.

---

## 13.26 List Picker Search

List 수가 많을 수 있으므로 picker에서 검색을 지원할 수 있다.

```text
Search lists...
```

Folder name도 search context에 포함할 수 있다.

---

## 13.27 List Picker Keyboard

```text
Arrow Up / Down
→ List 이동

Enter
→ 선택 / Move

Esc
→ picker close

typing
→ search/filter
```

Folder heading은 focusable selection target이 아닐 수 있다.

---

## 13.28 List Picker Outside Click

List Picker는 floating surface이므로 outside click으로 닫는다.

Task Detail 자체는 유지한다.

---

## 13.29 Recent Lists

Move workflow를 빠르게 하기 위해:

```text
Recent
```

section을 추가할 수 있다.

하지만 recent ordering은 UI-derived/personal preference이며 Task domain에 저장하지 않는다.

---

## 13.30 Favorites / Pinned Lists

List 자체의 favorites/pin 기능이 있다면 picker에서 우선 노출할 수 있다.

Task organization semantics와는 별개다.

---

# Tags

## 13.31 Tag Purpose

Tag는 Task를 List 경계를 넘어 분류하는 many-to-many metadata다.

예:

```text
Task A
List = Study

Tags
#research
#urgent
#professor
```

같은 Task가 여러 Tag를 가질 수 있다.

---

## 13.32 Tag Data Model

권장:

```ts
type Tag = {
  id: string;
  name: string;

  createdAt: string;
  updatedAt: string;
};

type TaskTag = {
  taskId: string;
  tagId: string;
};
```

Task에 Tag name 문자열 배열을 canonical source로 저장하지 않는다.

---

## 13.33 Tag Identity

Tag의 identity는 name 문자열 자체가 아니라 stable ID다.

```text
Tag ID
→ stable

Tag name
→ rename 가능
```

Tag rename 시 모든 Task relation을 rewrite할 필요가 없다.

---

## 13.34 Tag Name Uniqueness

동일 workspace/user scope에서 Tag 이름 uniqueness 정책을 명확히 한다.

기본 권장:

> normalized name 기준 중복 Tag를 만들지 않는다.

예:

```text
Research
research
```

을 같은 Tag로 취급할지 여부는 case policy를 정한다.

권장:

```text
display case 보존
comparison은 case-insensitive
```

---

## 13.35 Tag Name Validation

금지/제한:

```text
empty
whitespace-only
과도한 길이
control characters
```

`#`를 실제 name에 저장할지 여부도 하나로 통일한다.

권장:

```text
stored name = "research"
display = "#research"
```

즉 `#`는 presentation prefix다.

---

## 13.36 Tag Entry Point

Task Detail에서 Tag property를 제공한다.

예:

```text
Tags
#research  #urgent   +
```

또는 compact row:

```text
🏷 research, urgent
```

---

## 13.37 Tag Picker

Tag property click:

```text
Tag Picker
```

예:

```text
┌────────────────────────────┐
│ Search or create tag...    │
├────────────────────────────┤
│ ✓ research                 │
│   school                   │
│ ✓ urgent                   │
│   meeting                  │
└────────────────────────────┘
```

Tag는 multi-select다.

---

## 13.38 Multiple Tag Selection

사용자는 picker를 닫지 않고 여러 Tag를 연속 toggle할 수 있다.

```text
research ✓
urgent   ✓
meeting  ✓
```

Reminder와 유사한 multi-select interaction이다.

---

## 13.39 Tag Toggle

Tag selected:

```text
click
→ TaskTag create
```

다시 click:

```text
→ TaskTag remove
```

Task entity 자체 전체를 다시 저장할 필요가 없다.

---

## 13.40 Tag Picker Does Not Auto-close Per Selection

Tag는 multi-select이므로 option 하나를 선택할 때마다 picker를 닫지 않는다.

```text
select
select
select
↓
outside click / Esc
```

로 종료하는 흐름이 자연스럽다.

---

## 13.41 Create Tag Inline

검색어와 matching Tag가 없으면:

```text
Create "#newtag"
```

action을 제공할 수 있다.

선택 시:

```text
1. Tag create
2. TaskTag create
```

를 하나의 사용자 action으로 처리한다.

---

## 13.42 Tag Creation Atomicity

새 Tag 생성 성공했지만 Task에 연결이 실패하는 중간 상태를 줄이기 위해 transaction 또는 rollback을 고려한다.

최소한 UI에서는 일관되게 처리한다.

---

## 13.43 Tag Rename

Tag rename:

```text
research
→ academic
```

TaskTag relation은 그대로 유지된다.

모든 연결 Task에서 새 name을 즉시 표시한다.

---

## 13.44 Tag Delete

Tag 자체 삭제 시:

```text
Tag entity delete
+
all TaskTag relations remove
```

Task는 삭제되지 않는다.

---

## 13.45 Tag Delete vs Remove from Task

두 action을 구분한다.

```text
Remove tag from this Task
→ TaskTag relation만 제거

Delete Tag
→ Tag 자체와 모든 Task relation 제거
```

UI에서 혼동되지 않게 한다.

---

## 13.46 Tag Delete Confirmation

여러 Task에 연결된 Tag 삭제는 영향 범위가 크므로 confirm을 권장한다.

예:

```text
Delete #research from 24 tasks?
```

---

## 13.47 Tags and Subtasks

Parent와 Child Tag는 자동 연동하지 않는다.

```text
Parent #research
Child #urgent
```

유효하다.

Parent Tag 추가가 Child에 자동 복제되지 않는다.

---

## 13.48 Tags and Recurrence

Recurring Task의 Tags는 기본적으로 Series-level metadata로 취급한다.

Future occurrence는 Series Tags를 상속한다.

Occurrence-specific Tag override를 지원할 경우 7장의 recurrence exception scope를 따른다.

V1은 Series-level Tag를 기본으로 한다.

---

## 13.49 Tags and Checklist

CheckItem에는 Tag를 붙이지 않는다.

Tag가 필요한 실행 항목은 Subtask로 승격한다.

---

## 13.50 Tag Filter

Tag는 Smart Filter/View에서 사용할 수 있다.

예:

```text
#research
```

View는 Tag relation을 query해 Task를 표시한다.

Task가 어느 List에 속해 있든 검색 가능하다.

---

## 13.51 Multiple Tag Filter

향후:

```text
#research AND #urgent
```

또는:

```text
#research OR #school
```

같은 query를 지원할 수 있다.

Filter semantics는 View/filter spec에서 정한다.

---

## 13.52 Tag-based Sidebar View

Tags를 Sidebar navigation에 노출한다면:

```text
Tags
#research
#school
```

는 List와 별개의 query navigation이다.

Task의 canonical `listId`는 바뀌지 않는다.

---

## 13.53 Tag Color

Tag에 color metadata를 둘 수 있다.

예:

```ts
colorToken: string | null;
```

하지만 색상만으로 Tag identity를 전달하지 않는다.

V1 core domain에 color가 필요하지 않다면 후속 확장으로 둔다.

---

## 13.54 Tag Ordering

Task Detail 내 Tag chip 순서는:

```text
manual
alphabetical
recent
```

중 정책이 필요하다.

기본 권장:

> selected order 또는 stable global Tag order를 유지한다.

단 `TaskTag`에 별도 sortKey가 정말 필요한지 신중히 판단한다.

V1에서는 Tag order를 derived해도 충분하다.

---

## 13.55 Tag Chip Removal

Task Detail에 Tag chip이 보이면 chip의 remove control로 빠르게 relation을 제거할 수 있다.

예:

```text
#research ×
```

이 action은 Tag 자체 삭제가 아니다.

---

## 13.56 Tag Chip Overflow

Tag가 많아 Detail 폭을 넘으면:

```text
wrap
```

하거나:

```text
+3
```

overflow summary를 사용할 수 있다.

Task Detail width를 밀어내지 않는다.

---

## 13.57 Tag Picker Search

Tag 수가 많으면 fuzzy/prefix search를 지원한다.

검색 결과가 없을 때만 Create action을 노출한다.

---

## 13.58 Tag Picker Keyboard

```text
Arrow Up / Down
→ option 이동

Enter / Space
→ toggle

Esc
→ picker close

typing
→ search
```

Multi-select이므로 Enter 후 picker 유지가 기본이다.

---

## 13.59 Tag Accessibility

Tag chip:

```text
"Tag research"
```

Remove button:

```text
"Remove research tag from task"
```

같은 accessible name을 제공한다.

Color만으로 Tag를 구분하지 않는다.

---

# Shared Organization Behavior

## 13.60 Organization Property Synchronization

List/Tag 변경은 모든 View에서 즉시 반영된다.

```text
Detail
↓
same Task entity / relation
↓
List View
Board
Search
Tag View
Sidebar count
```

---

## 13.61 Search Index

List name / Tag name을 검색 metadata에 포함할 수 있다.

Tag rename/List rename 후 stale index가 오래 남지 않게 한다.

---

## 13.62 Board Grouping

Board가:

```text
Group by List
Group by Tag
```

를 지원할 경우 organization mutation 후 Card 위치가 즉시 이동할 수 있다.

Detail은 유지한다.

---

## 13.63 Filter Removes Current Task

예:

```text
View = #research
Task A selected
```

Detail에서 `#research` 제거:

```text
Main View에서 Task A 사라짐
Detail 유지
```

3장 Selection 규칙을 따른다.

---

## 13.64 Move from Current List View

예:

```text
View = Study List
Task A selected
```

Detail에서:

```text
Move → Work
```

하면:

```text
Study Main에서 제거
Detail 유지
Current List property = Work
```

사용자가 Sidebar로 Work를 직접 선택한 것은 아니므로 View 자체는 Study에 머문다.

---

## 13.65 Organization Command Layer

UI가 relation을 직접 수정하지 않는다.

공통 command 예:

```ts
moveTaskToList(taskId, listId)
addTagToTask(taskId, tagId)
removeTagFromTask(taskId, tagId)
createTagAndAttach(taskId, tagName)
renameTag(tagId, nextName)
deleteTag(tagId)
```

---

## 13.66 List Move Command Responsibilities

`moveTaskToList()`가 담당한다.

```text
Task 존재 validation
Target List validation
Subtree collection
Hierarchy/List invariant
Optimistic update
Persistence transaction
Query/count invalidation
Failure rollback
```

---

## 13.67 Tag Command Responsibilities

Tag command layer:

```text
name normalization
duplicate prevention
relation mutation
optimistic update
persistence
search/filter invalidation
failure rollback
```

을 담당한다.

---

## 13.68 Optimistic List Move

List 이동:

```text
Move to Work
↓
Detail List 즉시 Work
↓
Main query 즉시 update
↓
persistence
```

서버 응답을 기다리지 않는다.

---

## 13.69 List Move Failure

Persistence failure:

```text
Task/subtree
→ original List로 rollback
```

현재 View에서 row가 사라졌다가 rollback되는 경우에도 state를 일관되게 복구한다.

---

## 13.70 Optimistic Tag Toggle

Tag add/remove도 즉시 chip/picker/filter에 반영한다.

실패 시 relation을 rollback하고 feedback한다.

---

## 13.71 Rapid Tag Toggle

빠르게:

```text
research add
→ remove
→ add
```

할 때 마지막 action이 최종 state가 되어야 한다.

Mutation ordering/versioning을 적용한다.

---

## 13.72 Rapid List Move

빠르게:

```text
Study → Work → Personal
```

로 옮길 경우 마지막 move가 최종 state다.

오래된 async response가 이전 List로 되돌리지 않게 한다.

---

## 13.73 Offline / Local-first

List move/Tag toggle도 local-first로 확장 가능해야 한다.

단 hierarchy subtree move는 여러 Task를 변경하므로 sync transaction/conflict 처리가 중요하다.

---

## 13.74 Remote List Move While Editing

Task Title/Description을 local에서 편집 중 remote device가 List를 이동해도 text draft를 조용히 삭제하지 않는다.

Organization mutation과 editor draft를 분리한다.

---

## 13.75 Remote Tag Update

Editor focus와 무관한 Tag relation update는 즉시 반영 가능하다.

동일 Tag relation을 동시에 toggle할 경우 revision/conflict rule을 적용할 수 있다.

---

## 13.76 Activity History

향후 Task Activity:

```text
Moved from Study to Work
Added #research
Removed #urgent
```

등을 기록할 수 있다.

Task entity 안에 organization history 배열을 저장하지 않는다.

---

## 13.77 Folder/List Management Boundary

Task Detail에서는 다음 기능에 집중한다.

```text
View current List
Move Task
View/add/remove Tags
```

다음은 별도 List/Folder management UI의 책임이다.

```text
Create Folder
Rename Folder
Delete Folder
Reorder Lists
Create List
List settings
```

Task Detail 안에 모든 관리 기능을 몰아넣지 않는다.

---

## 13.78 Create New List from Picker

List Picker에서:

```text
+ New List
```

를 제공할 수 있다.

이 경우 List creation system을 호출하고, 생성 성공 후 새 List로 Task를 이동할 수 있다.

하지만 picker가 List management 전체를 소유하지 않는다.

---

## 13.79 Create New Tag from Picker

Tag는 lightweight metadata이므로 Tag Picker에서 inline create를 적극 지원해도 좋다.

List보다 creation cost가 낮기 때문이다.

---

## 13.80 Prohibited Patterns

- Task에 `listId`와 `folderId`를 둘 다 canonical relation으로 저장
- Task가 List 없이 존재하도록 방치
- Folder를 Task direct container로 사용
- Smart View(Today 등)를 실제 `listId`처럼 저장
- Subtask만 다른 List로 이동해 Parent/Child hierarchy와 List membership 불일치
- Parent List 이동 시 descendants를 이전 List에 남김
- List rename 시 모든 Task를 rewrite
- Folder 이동 시 모든 Task를 rewrite
- Tag name 문자열 배열을 Task의 유일 canonical Tag source로 저장
- `#` prefix를 데이터와 presentation에서 일관성 없이 혼합
- Tag 하나 선택할 때마다 multi-select picker 자동 close
- Tag 제거와 Tag 자체 삭제를 같은 action으로 처리
- Parent Tag를 Child에 자동 강제 상속
- CheckItem에 Tag를 붙여 domain을 비대하게 만듦
- List move/Tag toggle이 서버 응답 후에야 UI 반영
- View별 별도 List/Tag copy 관리
- Task가 current filter/list에서 빠졌다고 Detail 자동 close
- Folder/List management 전체를 Task Detail에 몰아넣기

---

## 13.81 Acceptance Criteria

### List / Folder Model

- [ ] 모든 live Task가 정확히 하나의 List에 속한다.
- [ ] 기본 Inbox/List fallback이 존재한다.
- [ ] Task는 Folder에 직접 소속되지 않는다.
- [ ] Folder는 List를 묶는 navigation container다.
- [ ] List rename/Folder move가 Task rewrite를 요구하지 않는다.
- [ ] Smart View와 List membership을 구분한다.

### Move to List

- [ ] Task Detail에서 현재 List를 확인할 수 있다.
- [ ] List Picker를 열 수 있다.
- [ ] 다른 List로 Task를 이동할 수 있다.
- [ ] 같은 List 재선택은 no-op이다.
- [ ] Parent 이동 시 descendant subtree가 함께 이동한다.
- [ ] Subtask-only cross-list move가 hierarchy invariant를 깨지 않는다.
- [ ] List move로 current View에서 Task가 사라져도 Detail은 유지된다.

### List Delete

- [ ] List 삭제 시 contained Task 처리 정책이 있다.
- [ ] Task를 orphan 상태로 남기지 않는다.
- [ ] Hierarchy를 유지한 채 fallback List로 migration할 수 있다.
- [ ] 기본 Inbox를 보호할 수 있다.
- [ ] 삭제된 List deep link를 안전하게 처리한다.

### Tag Basics

- [ ] Task에 여러 Tag를 붙일 수 있다.
- [ ] Tag가 stable ID를 가진다.
- [ ] TaskTag many-to-many relation을 사용한다.
- [ ] Tag name validation/normalization이 있다.
- [ ] `#` prefix의 저장/표시 규칙이 일관된다.
- [ ] 동일 normalized name의 중복 Tag를 방지한다.

### Tag Picker

- [ ] Tag를 검색할 수 있다.
- [ ] 여러 Tag를 연속 선택/해제할 수 있다.
- [ ] 선택할 때마다 picker가 자동 close되지 않는다.
- [ ] 새로운 Tag를 inline 생성할 수 있다.
- [ ] Tag chip에서 relation만 빠르게 제거할 수 있다.
- [ ] Remove from Task와 Delete Tag를 구분한다.

### Hierarchy / Recurrence

- [ ] Parent/Child Tag가 자동 연동되지 않는다.
- [ ] CheckItem에는 Tag를 두지 않는다.
- [ ] Recurring Task Tag를 Series-level metadata로 사용할 수 있다.
- [ ] List move가 Subtask hierarchy invariant와 일치한다.

### Synchronization

- [ ] List move가 Sidebar count/query에 즉시 반영된다.
- [ ] Tag add/remove가 Tag View/filter/Search에 즉시 반영된다.
- [ ] Board grouping이 organization mutation에 반응할 수 있다.
- [ ] Filter/List에서 Task가 빠져도 열린 Detail은 유지된다.
- [ ] View별 별도 organization state를 만들지 않는다.

### Accessibility / Keyboard

- [ ] List Picker를 keyboard로 탐색/선택할 수 있다.
- [ ] Tag Picker를 keyboard로 탐색/toggle할 수 있다.
- [ ] Tag chip/remove action에 accessible name이 있다.
- [ ] Color만으로 Tag 의미를 전달하지 않는다.

### Architecture / Reliability

- [ ] List move는 subtree-aware command layer를 사용한다.
- [ ] Tag relation은 Tag command layer를 사용한다.
- [ ] Optimistic update와 rollback을 지원한다.
- [ ] Rapid mutation에서 마지막 사용자 action이 최종 state가 된다.
- [ ] List/Folder/Tag 관리 책임과 Task Detail 책임이 분리된다.
- [ ] Offline/local-first 확장이 가능한 구조다.

---

# 14. Attachment

## 14.1 Purpose

Attachment는 Task에 파일·이미지·문서를 연결하여 관련 자료를 Task Detail 안에서 함께 관리하는 기능이다.

핵심 원칙:

```text
Task
│
├─ Description
├─ Checklist / Subtasks
└─ Attachments
    ├─ File
    ├─ Image
    └─ Other supported media
```

Attachment는 단순한 URL 문자열이 아니라 업로드 상태·파일 메타데이터·삭제/재시도·다운로드/미리보기 상태를 가진 독립 entity로 관리한다.

---

## 14.2 Attachment Scope

V1에서는 Attachment를 **Task-level entity**로 정의한다.

```text
Task A
├─ Attachment 1
├─ Attachment 2
└─ Attachment 3
```

Description의 Slash Command나 `+` Insert Menu에서 파일을 추가하더라도 최종적으로는 같은 Task Attachment system을 호출한다.

즉:

```text
Description Insert
Task-level Add Attachment
Drag & Drop
```

세 진입점이 서로 다른 업로드 시스템을 만들지 않는다.

---

## 14.3 Recommended Data Model

권장 entity:

```ts
type Attachment = {
  id: string;
  taskId: string;

  fileName: string;
  mimeType: string;
  fileSize: number;

  storageKey: string | null;
  remoteUrl: string | null;

  kind:
    | "file"
    | "image";

  status:
    | "pending"
    | "uploading"
    | "ready"
    | "failed"
    | "deleted";

  uploadProgress: number | null;

  createdAt: string;
  updatedAt: string;
};
```

필요하면 다음을 추가할 수 있다.

```ts
thumbnailUrl?: string | null;
width?: number | null;
height?: number | null;
checksum?: string | null;
```

---

## 14.4 Stable Attachment ID

Attachment는 client-generated stable ID를 사용할 수 있다.

예:

```text
att_<ulid>
```

업로드 시작 전부터 local entity를 만들 수 있어야 optimistic UI가 가능하다.

---

## 14.5 Task Does Not Store Raw Files

Task entity 안에:

```text
❌ base64
❌ Blob
❌ raw binary
```

를 직접 넣지 않는다.

Task는 Attachment relation만 가진다.

Binary file은 별도 storage layer에 저장한다.

---

## 14.6 Attachment Entry Points

Attachment 추가 진입점은 최소 다음을 허용할 수 있다.

### Task-level Add

```text
+ Add attachment
```

### Description Slash Command

```text
/attachment
```

### Description `+` Insert Menu

```text
+
→ Attachment
```

### Drag & Drop

```text
file drag
→ Task Detail drop zone
```

### Clipboard Paste

이미지 파일 paste를 지원하는 경우:

```text
Ctrl/Cmd + V
→ image attachment
```

각 진입점은 같은 attachment command layer를 호출한다.

---

## 14.7 Upload Flow

기본 흐름:

```text
File selected
↓
Client validation
↓
Local Attachment entity create
↓
Upload begins
↓
Progress UI
↓
Storage success
↓
Attachment status = ready
```

예:

```text
report.pdf
Uploading 42%
```

→

```text
report.pdf
Ready
```

---

## 14.8 Local Placeholder

파일 선택 직후 Detail에 placeholder를 즉시 표시한다.

```text
report.pdf
Uploading...
```

서버 업로드 완료 후에야 row가 나타나는 방식은 사용하지 않는다.

---

## 14.9 Upload Status

Attachment status:

```text
pending
uploading
ready
failed
deleted
```

각 상태는 UI에서 구분 가능해야 한다.

---

## 14.10 Upload Progress

`uploading` 상태에서는:

```text
0–100%
```

progress를 표시할 수 있다.

권장:

```text
file name
progress bar / percentage
cancel
```

정확한 visual은 20. Visual System에서 확정한다.

---

## 14.11 Progress Is UI/Transfer State

`uploadProgress`는 persistence가 꼭 필요한 canonical business field는 아니다.

앱 재시작 후 업로드 세션을 복원하지 않는다면 in-memory transfer state로 둘 수 있다.

장기 resumable upload를 지원하면 별도 transfer metadata가 필요하다.

---

## 14.12 Client-side Validation

업로드 전 최소 다음을 검증한다.

```text
file size
file type
file count limit
invalid filename
unsupported media
```

허용하지 않는 파일은 업로드 요청 자체를 보내지 않는다.

---

## 14.13 File Size Limit

파일 크기 제한은 shared constant/config로 관리한다.

예:

```ts
MAX_ATTACHMENT_SIZE_BYTES
```

컴포넌트마다 다른 제한을 하드코딩하지 않는다.

실제 수치는 storage/backend 정책에 맞춰 정한다.

---

## 14.14 File Count Limit

Task당 attachment 개수 제한이 필요하다면 shared config로 관리한다.

예:

```ts
MAX_ATTACHMENTS_PER_TASK
```

V1에서 충분히 큰 수를 허용할 수 있지만 무제한을 암묵적으로 가정하지 않는다.

---

## 14.15 File Type Policy

V1 기본 정책:

```text
일반 문서 파일
이미지
압축파일
텍스트 파일
```

등을 허용할 수 있다.

실행파일·위험한 확장자는 backend policy에 따라 제한할 수 있다.

Client validation만 신뢰하지 않고 server에서도 재검증한다.

---

## 14.16 MIME Type vs Extension

파일 유형 판정은 extension만 믿지 않는다.

```text
file name
+
MIME/content validation
```

을 사용한다.

---

## 14.17 Filename

원래 filename은 metadata로 저장한다.

```ts
fileName: string;
```

하지만 storage path/key는 filename과 분리한다.

```text
display filename
≠
storage identifier
```

동일 이름 파일 중복을 안전하게 지원해야 한다.

---

## 14.18 Duplicate Filename

같은 Task에:

```text
report.pdf
report.pdf
```

두 파일이 있어도 허용 가능하다.

Attachment identity는 ID/storageKey로 구분한다.

원한다면 UI에서:

```text
report.pdf
report (2).pdf
```

처럼 display rename을 적용할 수 있으나 canonical file identity와 분리한다.

---

## 14.19 Storage Key

파일 storage는 stable opaque key를 사용한다.

예:

```text
attachments/<user>/<attachment-id>
```

Task title/List name 같은 변경 가능한 문자열을 storage path의 핵심 identity로 사용하지 않는다.

---

## 14.20 Upload Command Layer

공통 command 예:

```ts
addAttachment(taskId, file)
cancelAttachmentUpload(attachmentId)
retryAttachmentUpload(attachmentId)
deleteAttachment(attachmentId)
```

---

## 14.21 Upload Command Responsibilities

`addAttachment()`가 담당한다.

```text
client validation
Attachment ID 생성
local entity 생성
upload request
progress reporting
storage metadata 저장
ready/failure state update
rollback/cleanup
```

UI component가 storage API를 직접 호출하지 않는다.

---

## 14.22 Upload Cancel

업로드 중 Cancel을 지원한다.

```text
Uploading 56%
↓ Cancel
```

기본 정책:

```text
network upload abort
temporary remote object cleanup
local placeholder remove
```

사용자가 의도적으로 취소한 것이므로 `failed` row를 남길 필요는 없다.

---

## 14.23 Upload Failure

네트워크/서버 오류:

```text
report.pdf
Upload failed
Retry   Remove
```

Attachment placeholder를 즉시 사라지게 하지 않는다.

사용자가 무엇이 실패했는지 알 수 있어야 한다.

---

## 14.24 Retry

Retry:

```text
failed
↓
uploading
↓
ready
```

같은 Attachment ID를 재사용하는 것을 권장한다.

새 attachment가 중복 생성되지 않게 한다.

---

## 14.25 Failure After Partial Upload

Storage provider에 부분 object가 남을 수 있다.

backend/storage layer가 orphan multipart/temporary upload cleanup을 담당한다.

UI가 직접 storage garbage collection을 책임지지 않는다.

---

## 14.26 Persistence Failure after Upload Success

파일 binary upload는 성공했지만 Attachment metadata 저장이 실패할 수 있다.

```text
Storage success
Metadata persistence failure
```

이 경우:

```text
orphan storage object cleanup
또는 retryable metadata state
```

가 필요하다.

단순히 사용자에게 성공처럼 보이면 안 된다.

---

## 14.27 Attachment Layout

Task Detail에서 attachment를 별도 section 또는 Description 근처에 표시할 수 있다.

예:

```text
Attachments

📄 report.pdf        2.4 MB
🖼 screenshot.png    820 KB
```

이미지는 thumbnail preview를 사용할 수 있다.

---

## 14.28 Compact Row

일반 파일 row:

```text
[file icon] filename
            metadata
                     More
```

가능한 metadata:

```text
size
type
upload state
```

지나친 정보는 기본 row에 모두 노출하지 않는다.

---

## 14.29 Image Preview

Image Attachment가 `ready` 상태라면 thumbnail을 표시할 수 있다.

예:

```text
┌───────────────┐
│ image preview │
└───────────────┘
screenshot.png
```

원본 전체 이미지를 Detail에서 무조건 로드하지 않는다.

thumbnail/optimized preview를 우선한다.

---

## 14.30 Image Metadata

이미지의:

```text
width
height
thumbnail
```

을 metadata로 저장할 수 있다.

하지만 반드시 필요한 core field는 아니다.

---

## 14.31 Preview Open

Attachment click:

### Supported preview

```text
Image/PDF/Text preview
→ preview surface
```

### Unsupported preview

```text
→ file download/open action
```

정확한 preview 범위는 구현 환경에 맞춘다.

---

## 14.32 Preview Surface

Attachment Preview는 Task Detail 내부에 억지로 넣지 않고 Modal/Overlay 또는 dedicated viewer를 사용할 수 있다.

Attachment Preview는 Task Detail Shell과 다른 interaction layer다.

---

## 14.33 Preview Esc

```text
Attachment Preview open
↓ Esc
Preview close
↓ Esc
Task Detail close
```

전역 Esc 우선순위에 통합한다.

---

## 14.34 Download

Ready Attachment는 다운로드/저장을 지원할 수 있어야 한다.

실제 download URL은 짧은 수명의 signed URL 등을 사용할 수 있다.

Permanent public URL 노출을 기본 가정하지 않는다.

---

## 14.35 External Link vs File Attachment

다음을 구분한다.

```text
Attachment
→ 실제 업로드 파일

Link
→ URL reference
```

URL text를 Attachment entity로 자동 변환하지 않는다.

향후 Link Attachment를 별도 kind로 확장할 수 있다.

---

## 14.36 Description-inline Attachment

Description의 특정 위치에 attachment chip/preview를 “삽입”하는 UI를 지원하고 싶다면 별도 placement metadata가 필요할 수 있다.

예:

```ts
descriptionBlockId
anchorPosition
```

하지만 V1에서는 Task-level attachment list를 canonical로 유지하고, Description command는 “Task에 Attachment 추가”까지만 담당하는 것을 권장한다.

---

## 14.37 Why Avoid Inline-first V1

Inline rich attachment는 다음 복잡도를 추가한다.

```text
editor document structure
attachment anchor
drag/reorder
삭제 시 document mutation
export/import
selection
```

따라서 V1 Task Detail의 핵심 목표에는 Task-level Attachment가 더 안정적이다.

---

## 14.38 Drag & Drop Target

파일을 Task Detail 위로 drag하면 명확한 drop zone을 표시한다.

예:

```text
Drop files to attach
```

Detail 전체를 drop target으로 둘 수 있으나:

```text
Title editor
Checklist drag
Subtask reorder
```

와 충돌하지 않게 한다.

---

## 14.39 Drag Enter State

파일 drag가 감지된 경우에만 attachment drop overlay를 보여준다.

일반 text drag를 파일 업로드로 오인하지 않는다.

---

## 14.40 Drop Multiple Files

여러 파일을 한 번에 drop할 수 있다.

```text
file A
file B
file C
```

각 파일은 독립 Attachment entity/transfer를 가진다.

---

## 14.41 Multi-upload Progress

여러 파일 업로드 시:

```text
3 uploads
```

를 통합 summary로 보여줄 수 있으나 각 파일 실패/재시도 상태는 독립적으로 관리한다.

---

## 14.42 Partial Multi-upload Failure

3개 중 1개 실패:

```text
A ready
B failed
C ready
```

전체 operation을 모두 rollback하지 않는다.

개별 파일 단위로 retry/remove 가능해야 한다.

---

## 14.43 Clipboard Image Paste

Description/Attachment area focus 중 clipboard image paste를 지원할 수 있다.

예:

```text
screenshot paste
→ image attachment create
```

단 일반 text paste와 명확히 구분한다.

---

## 14.44 Clipboard File Naming

Clipboard image에 filename이 없으면 앱이 display name을 생성할 수 있다.

예:

```text
Screenshot 2026-08-23 01.38.png
```

이 값은 display metadata다.

---

## 14.45 Attachment Reorder

Task-level Attachment 목록을 drag reorder할 필요가 있는지 제품 정책으로 정한다.

V1에서는 기본적으로:

```text
created order
```

또는 latest-first를 사용하고 manual reorder를 필수 기능으로 두지 않는다.

Manual order가 필요해지면 `sortKey`를 추가한다.

---

## 14.46 Attachment Delete

Ready Attachment의 More menu:

```text
Delete attachment
```

실행:

```text
UI에서 제거
metadata delete/soft-delete
storage cleanup
```

---

## 14.47 Delete Confirmation

단일 attachment 삭제는 Undo가 있다면 별도 confirm 없이 빠르게 처리할 수 있다.

대용량/중요 파일이라도 Task 전체 삭제보다 영향이 작다.

권장:

```text
Delete
→ immediate
→ Undo 가능
```

---

## 14.48 Delete Undo

Attachment delete는 Undo를 지원하는 것을 권장한다.

다만 storage binary를 즉시 물리 삭제하면 Undo가 어려워진다.

따라서:

```text
soft delete / delayed physical cleanup
```

전략이 적합하다.

---

## 14.49 Soft Delete Model

필요하면:

```ts
deletedAt: string | null;
```

을 Attachment에 추가한다.

Delete:

```text
deletedAt = now
```

Undo:

```text
deletedAt = null
```

일정 retention 이후 physical storage cleanup.

---

## 14.50 Storage Cleanup

최종 physical delete는 backend cleanup job이 담당할 수 있다.

UI action 직후 storage object를 즉시 영구 삭제하지 않아도 된다.

---

## 14.51 Task Delete

Task를 삭제하면 attached files도 lifecycle 처리 대상이 된다.

기본 권장:

```text
Task soft delete
→ Attachment soft delete / retain during undo window
```

Task Undo 시 Attachment도 함께 복원 가능해야 한다.

---

## 14.52 Subtree Delete

Parent Task subtree를 삭제하면 각 descendant Task Attachment도 동일 delete transaction/lifecycle을 따른다.

---

## 14.53 Move Task to List

Task의 List 이동은 Attachment에 영향을 주지 않는다.

```text
Task moves
Attachment.taskId unchanged
storage unchanged
```

Folder/List path를 storage path로 사용하지 않는 이유 중 하나다.

---

## 14.54 Task Rename

Task title 변경도 Attachment storage에 영향이 없다.

Attachment identity는 Task title과 분리되어 있다.

---

## 14.55 Subtask Attachments

Subtask도 Task entity이므로 독립 Attachment를 가질 수 있다.

```text
Parent Attachment
≠
Child Attachment
```

Parent file이 Child에 자동 상속되지 않는다.

---

## 14.56 Checklist Attachments

CheckItem에는 Attachment를 붙이지 않는 것을 V1 기본으로 한다.

파일이 필요한 Checklist Item은 Subtask로 승격하는 것이 domain이 명확하다.

---

## 14.57 Recurring Task Attachments

Recurring Task에서 Attachment를 어떻게 처리할지 정의해야 한다.

기본 권장:

> Series-level Attachment는 future occurrence에서 참조 가능하다.

즉 같은 파일 binary를 occurrence마다 복제하지 않는다.

---

## 14.58 Occurrence-specific Attachment

특정 occurrence에만 Attachment를 추가하는 기능은 Recurrence exception/occurrence materialization과 결합되는 고급 기능이다.

V1에서는 Series-level attachment를 기본으로 한다.

---

## 14.59 Duplicate Task

Task duplicate 시 Attachment를 어떻게 처리할지 정책이 필요하다.

권장 선택지:

```text
Copy attachment references
```

즉 binary를 물리적으로 다시 업로드하지 않고 새 Attachment metadata가 같은 storage object를 참조할 수 있다.

단 삭제 lifecycle/ref-count 정책이 필요하다.

V1 단순화:

```text
Duplicate Task
→ Attachments 제외
```

로 시작할 수도 있다.

최종 Duplicate spec에서 확정한다.

---

## 14.60 Shared Storage Reference

하나의 binary object를 여러 Attachment metadata가 참조하는 구조를 쓴다면:

```text
storage object ref-count
```

또는 orphan cleanup 정책이 필요하다.

첨부 삭제 하나가 다른 Task의 파일까지 삭제하지 않게 한다.

---

## 14.61 File Rename

Attachment display filename을 rename하는 기능을 지원할 수 있다.

```text
report.pdf
→ final-report.pdf
```

storageKey는 변경하지 않는다.

---

## 14.62 Rename Validation

Filename rename 시:

```text
empty
invalid control chars
path traversal-like input
```

을 normalize/차단한다.

Display filename이 storage path가 아니어도 안전한 filename policy를 적용한다.

---

## 14.63 Security Scanning

파일 업로드 환경에 따라 malware scanning을 추가할 수 있다.

이 경우 Attachment에:

```text
scanning
quarantined
```

같은 상태가 필요할 수 있다.

V1 core는 아니지만 architecture를 막지 않는다.

---

## 14.64 Private Access

Attachment는 기본적으로 Task/account 권한을 상속하는 private resource로 취급한다.

파일 URL을 영구 public URL로 노출하지 않는 것을 권장한다.

---

## 14.65 Authorization

파일 fetch/download 시:

```text
현재 사용자에게 Task 접근 권한이 있는가?
```

를 server-side에서 확인해야 한다.

Attachment ID를 안다고 아무나 파일을 가져갈 수 있어서는 안 된다.

---

## 14.66 Signed URL

Cloud storage 사용 시 download/preview는 짧은 수명의 signed URL을 사용할 수 있다.

UI는 signed URL을 canonical Attachment field처럼 장기간 저장하지 않는다.

---

## 14.67 Filename XSS

Filename은 사용자 입력으로 취급한다.

```text
<img ...>
<script>
```

같은 문자열이 filename에 들어와도 HTML로 실행되지 않게 escape한다.

---

## 14.68 SVG Consideration

SVG 등 script-capable media를 inline preview할 경우 보안 위험이 있다.

V1에서는 안전하게 file download로 처리하거나 sanitize된 rendering만 허용한다.

---

## 14.69 Image EXIF / Privacy

이미지 업로드 시 EXIF metadata가 포함될 수 있다.

제품 정책에 따라:

```text
strip location metadata
```

등 privacy 보호를 고려할 수 있다.

Core requirement는 아니지만 확장 가능하게 한다.

---

## 14.70 Large Image Optimization

이미지는 preview용 thumbnail을 생성할 수 있다.

원본을 Detail scrolling 중 계속 decode하지 않도록 한다.

---

## 14.71 Lazy Loading

Task Detail의 Attachment preview는 viewport에 들어올 때 lazy-load할 수 있다.

특히 이미지가 많은 Task에서 성능을 보호한다.

---

## 14.72 Preview Cache

Thumbnail/preview cache를 사용할 수 있으나 Attachment metadata가 canonical source다.

Cache failure가 Attachment data loss로 이어지면 안 된다.

---

## 14.73 Cross-view Preview

Main List/Board에서 Attachment 존재 여부만 indicator로 보여줄 수 있다.

예:

```text
📎 2
```

이는 derived count다.

```text
❌ attachmentCount persisted on Task
```

를 기본으로 하지 않는다.

---

## 14.74 Attachment Count

Attachment count:

```text
ready + optionally uploading
```

중 무엇을 포함할지 UI semantics를 정한다.

기본 권장:

```text
ready attachment count
```

Uploading은 별도 transfer indicator.

---

## 14.75 Search

Attachment filename을 Search index에 포함할 수 있다.

예:

```text
final-report.pdf
```

검색으로 parent Task를 찾을 수 있다.

Binary file content까지 full-text index하는 기능은 별도 고급 feature다.

---

## 14.76 Attachment Search Result

검색 결과에서는:

```text
Task title
matching attachment filename
```

context를 보여준다.

Attachment 자체를 독립 navigation root로 만들 필요는 없다.

---

## 14.77 Accessibility

파일 row는 다음 정보를 screen reader에 제공할 수 있어야 한다.

```text
filename
file type
upload status
size
```

예:

```text
"report.pdf, PDF file, 2.4 megabytes, uploaded"
```

---

## 14.78 Upload Progress Accessibility

Progress는 visual bar만 표시하지 않는다.

```text
aria-valuenow
aria-valuemin
aria-valuemax
```

또는 동등 semantics를 제공한다.

---

## 14.79 Failed Upload Accessibility

`Upload failed` 상태와 Retry/Remove action이 keyboard와 screen reader에서 접근 가능해야 한다.

---

## 14.80 Keyboard

Attachment row:

```text
Enter / Space
→ preview/open

Delete via explicit menu/action

Tab
→ action navigation

Esc
→ preview/popover close
```

정확한 global key map은 18장에서 통합한다.

---

## 14.81 Focus After Upload

파일 선택 dialog가 닫힌 후 focus는:

```text
새 Attachment row
```

또는 원래 Add Attachment control로 안정적으로 돌아가야 한다.

---

## 14.82 Focus After Delete

Attachment 삭제 후:

```text
next attachment
→ previous attachment
→ Add Attachment control
```

순으로 안정적인 focus를 복원한다.

---

## 14.83 Offline Behavior

완전 offline 상태에서는 원격 storage upload가 불가능할 수 있다.

선택 가능한 전략:

```text
A. upload action disable
B. local pending queue
```

Local-first desktop 앱이라면 pending queue가 가능하다.

Web V1에서는 명확히 offline 상태를 알려주고 retry를 제공하는 것으로 충분할 수 있다.

---

## 14.84 Pending Offline Upload

향후 local queue를 지원하면:

```text
status = pending
```

상태로 file handle/local cache를 보존하고 네트워크 복구 후 upload한다.

브라우저 보안 제약상 영구 file handle은 환경별로 다르므로 platform abstraction이 필요하다.

---

## 14.85 Cross-device Sync

Attachment metadata는 sync 가능하지만 binary storage는 중앙 storage를 통해 공유한다.

다른 device는 `ready` Attachment metadata를 받아 preview/download한다.

---

## 14.86 Uploading on One Device

Device A에서 업로드 중인 Attachment가 Device B에 보이는 경우:

```text
uploading
```

state를 실시간 sync할지 제품 정책으로 정한다.

V1에서는 ready 후 sync되어도 충분할 수 있다.

---

## 14.87 Conflict

같은 Attachment filename rename/delete가 여러 device에서 동시에 발생할 수 있다.

Attachment entity revision/updatedAt 기반 conflict handling으로 확장 가능하게 한다.

---

## 14.88 Activity History

향후 Task Activity:

```text
Attachment added
Attachment deleted
Attachment renamed
```

event를 기록할 수 있다.

Attachment history 배열을 Task entity 안에 저장하지 않는다.

---

## 14.89 Component Architecture

권장:

```text
TaskAttachments/
│
├── AttachmentList
├── AttachmentRow
├── AttachmentUploader
├── AttachmentDropZone
├── AttachmentPreview
├── ImageThumbnail
└── UploadProgress
```

Storage provider logic은 별도 service/adapter에 둔다.

---

## 14.90 Storage Adapter

권장 boundary:

```text
Attachment Command Layer
        │
        ↓
Storage Adapter
        │
        ↓
S3 / GCS / Firebase Storage / local storage
```

앱 domain을 특정 provider SDK에 직접 결합하지 않는다.

---

## 14.91 Storage Adapter Responsibilities

```text
upload
abort
retry support
delete
signed preview/download URL
metadata
```

등을 추상화한다.

---

## 14.92 Attachment Selector

Task Detail은:

```ts
getAttachmentsByTaskId(taskId)
```

selector를 사용한다.

Task object 안의 중복 attachment 배열을 source of truth로 두지 않는다.

---

## 14.93 Optimistic Delete

Delete:

```text
row 즉시 제거
↓
soft-delete/persistence
```

실패하면 row 복원 + error feedback.

---

## 14.94 Rapid Delete / Undo

Delete 직후 Undo를 빠르게 눌러도 최종 state가 일관되어야 한다.

늦은 storage cleanup이 Undo된 Attachment를 물리 삭제하지 않게 retention/job coordination이 필요하다.

---

## 14.95 Prohibited Patterns

- Task entity 안에 raw file/base64 저장
- Description/Task-level/Drag upload마다 서로 다른 upload business logic 구현
- 업로드 성공 후에야 Attachment row 표시
- 파일 extension만 믿고 type validation
- fileName을 storage identity로 사용
- Task title/List path를 storage key에 강하게 결합
- upload failure row를 조용히 사라지게 함
- metadata 저장 실패인데 성공처럼 표시
- browser `setTimeout`/temporary URL만으로 파일 lifecycle 관리
- delete 즉시 physical storage 제거 후 Undo 제공 불가
- CheckItem에 Attachment를 계속 붙여 domain 비대화
- Series recurring Task마다 동일 binary를 무한 복제
- permanent public URL을 기본 파일 접근 방식으로 사용
- signed URL을 canonical data로 장기간 저장
- unsafe HTML/SVG/fileName을 그대로 inline 실행
- Drag & Drop만 유일한 upload 방법 제공
- Upload progress를 색상/bar로만 전달
- Task move/rename 때 storage object를 불필요하게 이동
- View별 attachment count/data copy 별도 관리

---

## 14.96 Acceptance Criteria

### Upload

- [ ] Task에 파일을 추가할 수 있다.
- [ ] Add Attachment / Slash / `+` / Drag & Drop이 같은 upload system을 사용한다.
- [ ] 파일 선택 직후 local placeholder가 나타난다.
- [ ] Upload progress를 표시할 수 있다.
- [ ] 여러 파일을 동시에 업로드할 수 있다.
- [ ] Partial multi-upload failure를 개별 처리할 수 있다.
- [ ] Upload cancel/retry를 지원할 수 있다.

### Validation

- [ ] File size/type/count를 client에서 검증한다.
- [ ] Server에서도 validation할 수 있다.
- [ ] Filename과 storage identity를 분리한다.
- [ ] 동일 filename을 가진 여러 Attachment를 처리할 수 있다.
- [ ] 위험한 파일/preview type을 안전하게 처리한다.

### Display / Preview

- [ ] 일반 파일 row를 표시한다.
- [ ] Image thumbnail을 표시할 수 있다.
- [ ] Supported file preview를 열 수 있다.
- [ ] Unsupported file은 download/open action으로 처리한다.
- [ ] Preview Esc가 Detail Esc보다 우선한다.
- [ ] Image/preview를 lazy-load할 수 있다.

### Delete / Undo

- [ ] Attachment를 삭제할 수 있다.
- [ ] Delete Undo를 지원할 수 있다.
- [ ] Task delete/undo와 Attachment lifecycle이 일치한다.
- [ ] Physical storage cleanup을 delayed/controlled하게 수행할 수 있다.
- [ ] Undo된 Attachment가 늦은 cleanup 때문에 사라지지 않는다.

### Security / Access

- [ ] Attachment는 private resource로 취급할 수 있다.
- [ ] Download/preview 시 server-side authorization을 검증한다.
- [ ] Signed URL 같은 임시 접근 방식을 사용할 수 있다.
- [ ] Filename/HTML/media preview에서 XSS 위험을 막는다.
- [ ] Storage provider와 domain을 adapter로 분리한다.

### Feature Integration

- [ ] Subtask도 독립 Attachment를 가질 수 있다.
- [ ] CheckItem에는 V1에서 Attachment를 붙이지 않는다.
- [ ] List move/Task rename이 Attachment storage에 영향을 주지 않는다.
- [ ] Recurring Task에서 Series-level Attachment를 지원할 수 있다.
- [ ] Search에서 filename을 parent Task와 함께 찾을 수 있다.
- [ ] Main/Board에서 attachment indicator/count를 derived할 수 있다.

### Reliability

- [ ] Metadata persistence failure와 binary upload failure를 구분한다.
- [ ] Retry가 duplicate Attachment를 만들지 않는다.
- [ ] Optimistic delete 실패 시 row를 복원한다.
- [ ] Offline/pending upload 확장이 가능하다.
- [ ] Cross-device sync 확장이 가능하다.
- [ ] Attachment mutation conflict를 revision 기반으로 확장 가능하다.

### Accessibility

- [ ] Attachment row를 keyboard로 탐색할 수 있다.
- [ ] Upload progress에 accessible progress semantics가 있다.
- [ ] Failed upload Retry/Remove action이 keyboard/screen reader에서 접근 가능하다.
- [ ] Preview/open/download action에 명확한 label이 있다.

### Architecture

- [ ] Attachment는 별도 entity다.
- [ ] Task에 raw binary를 저장하지 않는다.
- [ ] Upload command layer가 validation/transfer/persistence를 관리한다.
- [ ] Storage adapter가 provider-specific 로직을 숨긴다.
- [ ] Task-level selector로 Attachment를 조회한다.
- [ ] View별 별도 Attachment source를 만들지 않는다.

---

# 15. More Actions

## 15.1 Purpose

More Actions는 Task Detail의 기본 property bar에 항상 노출할 필요는 없지만, 사용 빈도가 낮거나 파급력이 큰 보조 작업을 한곳에 모으는 command surface다.

핵심 원칙:

```text
Frequently used
→ 직접 노출

Secondary / destructive / structural
→ More Actions
```

More 메뉴는 “기능 창고”가 아니라 Task lifecycle과 구조 변경을 위한 정돈된 command menu여야 한다.

---

## 15.2 Entry Point

Task Detail의 우측 상단 또는 Content Header의 `More` trigger를 사용한다.

예:

```text
Task Title                         ⋯
                                   ↑
                              More Actions
```

정확한 위치는 Visual System에서 확정한다.

---

## 15.3 Menu Structure

> **[VERIFIED TICKTICK + FIDELITY CORRECTION]** TickTick의 Task Detail action surface는 고정 메뉴 한 벌이 아니다. Task 상태, shared-list context, platform, 그리고 사용자가 pin/unpin/reorder한 action preference에 따라 노출 위치와 순서가 달라질 수 있다.

지원해야 하는 verified capability registry:

```text
Task actions
├─ Add Subtask
├─ Pin / Unpin
├─ Tags / Move / hierarchy actions
├─ Start Focus
├─ Duplicate
├─ Copy task link
├─ Task Activities
├─ Save as Template
├─ Convert to Note
├─ Comment              [context]
├─ Assign               [shared-list context]
├─ Complete / Reopen
├─ Won't Do / Restart
└─ Delete
```

기본 grouping은 제품 일관성을 위해 둘 수 있지만 **정확한 visual order를 immutable constant로 보지 않는다.**

```text
High-frequency / pinned actions
→ primary action surface

Other supported actions
→ More

Destructive
→ 마지막 그룹
```

현재 Task 상태와 context에 따라 항목은 달라진다.

---

## 15.4 Menu Is Context-sensitive

More Actions는 모든 Task에 항상 동일한 항목을 보여주지 않는다.

예:

### Open Task

```text
Pin
Duplicate
Copy link
Move
Won't Do
Delete
```

### Completed Task

```text
Pin
Duplicate
Copy link
Move
Reopen
Won't Do
Delete
```

### Won't Do Task

```text
Pin
Duplicate
Copy link
Move
Reopen
Complete
Delete
```

---

## 15.5 Disabled vs Hidden

사용 불가능한 action을 무조건 disabled로 쌓지 않는다.

기본 정책:

```text
사용할 이유가 없는 action
→ hide

현재 context 때문에 일시 불가
→ disabled + explanation
```

예:

```text
Outdent on root task
→ hidden 또는 disabled

Move during unresolved upload transaction
→ disabled + reason
```

---

## 15.6 Pin / Unpin

Task의 canonical field:

```ts
isPinned: boolean;
```

을 사용한다.

Menu:

```text
Pin
```

선택:

```ts
isPinned = true;
```

Pinned Task:

```text
Unpin
```

으로 label이 바뀐다.

---

## 15.7 Pin Semantics

Pin은 Task status/list/date와 독립적이다.

```text
Pinned + Completed
가능

Pinned + No Date
가능
```

Pin이 Task를 다른 List로 이동시키거나 priority를 변경하지 않는다.

---

## 15.8 Pinned Ordering

Pinned Task가 View 상단에 배치될 수 있지만 실제 표시 정책은 각 View spec에서 결정한다.

Canonical data는:

```ts
isPinned
```

하나만 사용한다.

---

## 15.9 Duplicate

Duplicate는 현재 Task를 기반으로 새로운 Task entity를 생성한다.

기본 원칙:

```text
new stable ID
new createdAt
status reset
```

---

## 15.10 Duplicate Base Fields

기본 권장 복제:

```text
title
description
contentMode
checklist template
priority
tags
listId
schedule (optional policy)
subtask hierarchy
```

기본 reset:

```text
id
status → open
completedAt → null
createdAt
updatedAt
deletedAt → null
```

---

## 15.11 Duplicate Schedule Policy

Task duplicate 시 schedule을 그대로 복제할지 제품 정책이 필요하다.

기본 권장:

```text
Duplicate
→ schedule 복제
```

사용자가 현재 Task의 “복사본”을 기대하기 때문이다.

다만 overdue/past schedule도 그대로 복제될 수 있으므로 Quick Add 용도와는 구분한다.

---

## 15.12 Duplicate Reminder

Reminder는 schedule과 연동되므로 기본적으로 함께 복제할 수 있다.

새 Reminder ID를 생성한다.

```text
Original Reminder ID 재사용 ❌
```

---

## 15.13 Duplicate Subtasks

Parent Task duplicate 시 기본 권장:

```text
subtree 전체 복제
```

새 Task ID mapping을 생성한다.

예:

```text
A → A'
B → B'
C → C'
```

그리고:

```text
B'.parentTaskId = A'
C'.parentTaskId = B'
```

로 재연결한다.

---

## 15.14 Duplicate Checklist

Checklist mode라면 CheckItem도 새 ID로 복제한다.

기본 상태 정책:

```text
checked = false
completedAt = null
```

을 권장한다.

원본의 완료 state를 그대로 복제하지 않는다.

---

## 15.15 Duplicate Attachments

Attachment binary까지 자동 복제할지 정책이 필요하다.

V1 권장:

```text
Duplicate Task
→ Attachment 제외
```

이유:

- storage lifecycle 단순화
- 대용량 중복 방지
- reference-count 복잡도 회피

향후 “Include attachments” 옵션으로 확장 가능하다.

---

## 15.16 Duplicate Recurring Task

Recurring Task를 duplicate하면 새로운 Series identity를 만든다.

```text
Original Series
≠
Duplicated Series
```

Rule 자체는 복제할 수 있지만 occurrence history/exception은 복제하지 않는다.

---

## 15.17 Duplicate Command

개념 command:

```ts
duplicateTask(taskId, options?)
```

책임:

```text
new ID mapping
subtree clone
Checklist clone
Tag relation clone
Reminder clone
Recurrence Series clone
status reset
transaction
```

---

## 15.18 Duplicate Atomicity

Parent + Subtasks + CheckItems + relations 복제가 중간에 일부만 성공하면 안 된다.

가능하면 하나의 transaction으로 처리한다.

실패 시 원본 Task는 영향을 받지 않는다.

---

## 15.19 Copy Task Link

Task deep link를 clipboard에 복사한다.

예:

```text
Copy task link
```

결과:

```text
current Task canonical URL
→ clipboard
```

---

## 15.20 Copy Link and Context

복사 URL에는 Task identity가 반드시 포함되어야 한다.

가능하면 현재 View context도 보존한다.

예:

```text
/tasks/list/abc/task/task123
```

하지만 canonical sharing URL과 context-preserving URL이 다르다면 Router spec에서 하나로 정한다.

---

## 15.21 Copy Link Feedback

성공:

```text
Link copied
```

짧은 Toast/feedback.

실패:

```text
Couldn’t copy link
```

를 제공한다.

---

## 15.22 Clipboard Permission Failure

브라우저 clipboard API 실패 시 fallback을 제공할 수 있다.

예:

```text
selectable URL
```

하지만 메뉴 action 자체가 아무 반응 없이 끝나면 안 된다.

---

## 15.23 Move to List

More Actions에서 `Move to List`를 제공해도 13장의 동일 command를 호출한다.

```ts
moveTaskToList(taskId, targetListId)
```

별도 이동 로직을 만들지 않는다.

---

## 15.24 Hierarchy-sensitive Move

Subtask에서 Move action이 실행되면 13장에서 정의한 hierarchy rule을 적용한다.

현재 Parent 관계를 유지할 수 없는 이동은:

```text
promote to root
```

또는 명시적 confirmation flow가 필요하다.

---

## 15.25 Convert Actions

현재 Task context에 따라 다음 conversion을 제공할 수 있다.

예:

```text
Make subtask of...
Move to root
Convert to checklist
Convert checklist item to subtask
```

모든 conversion은 해당 feature chapter의 command를 호출한다.

---

## 15.26 Convert Is Not Generic Mutation

More 메뉴가 직접 data model을 조작하지 않는다.

예:

```text
Convert to Checklist
→ convertDescriptionToChecklist()

Move to Root
→ moveTaskToRoot()
```

More는 command entry point일 뿐이다.

---

## 15.27 Complete / Reopen

상태 변경 action을 More 메뉴에서도 제공할 수 있다.

```text
Open
→ Complete

Completed / Won't Do
→ Reopen
```

4장의 동일 status command를 사용한다.

---

## 15.28 Won't Do

`Won't Do`는 secondary resolution action이므로 More menu가 적절한 기본 진입점이다.

```ts
markTaskWontDo(taskId)
```

을 사용한다.

---

## 15.29 Delete

Delete는 menu 하단의 독립 destructive group에 둔다.

예:

```text
────────────
Delete
```

다른 action과 시각적으로 구분한다.

---

## 15.30 Delete Color

Delete를 destructive color로 표현할 수 있다.

다만 색상만으로 의미를 전달하지 않고 text label을 명확히 표시한다.

---

## 15.31 Delete Leaf Task

Subtask가 없는 일반 Task:

```text
Delete
→ soft delete
→ Detail close
→ Undo 가능
```

3장/4장 원칙을 따른다.

---

## 15.32 Delete Task with Subtasks

Descendants가 있는 Task:

```text
Delete
↓
Task + descendants 영향
```

영향 범위를 사용자에게 알려야 한다.

예:

```text
Delete this task and 4 subtasks?
```

---

## 15.33 Delete Confirmation Policy

모든 Task delete에 modal confirmation을 띄우면 속도가 느려질 수 있다.

기본 권장:

### Leaf Task

```text
즉시 delete
+ Undo
```

### Descendant가 있는 Parent

```text
confirm
또는 매우 명확한 destructive sheet
```

### Recurring Task

```text
scope 선택 필요
```

---

## 15.34 Soft Delete

Delete는 2장의:

```ts
deletedAt
```

을 사용한다.

즉시 물리 삭제하지 않는다.

Undo/Trash를 지원할 수 있어야 한다.

---

## 15.35 Delete Undo

삭제 후:

```text
Task deleted                     Undo
```

Undo:

```text
deletedAt = null
```

Subtree delete라면 전체 subtree를 복원한다.

---

## 15.36 Detail After Delete

현재 selected Task를 Delete하면:

```text
selectedTaskId = null
Detail close
```

Undo 후 Detail을 자동 다시 열지는 기본값으로 하지 않는다.

Task가 복구됐다는 feedback만 주고 현재 Main context를 유지한다.

---

## 15.37 Recurring Task Action Scope

Recurring occurrence에서 More Action을 실행하면 scope가 필요할 수 있다.

특히:

```text
Delete
Move
Title/structure conversion
Repeat off
```

등.

---

## 15.38 Recurring Delete Scope

7장의 rule을 그대로 사용한다.

```text
Delete this occurrence
Delete this and future
Delete all occurrences
```

More menu가 recurrence logic을 새로 만들지 않는다.

---

## 15.39 Recurring Move Scope

특정 occurrence를 다른 List로 옮기는 의미는 복잡하다.

V1 권장:

> Recurring Series의 List 이동은 Series-level action으로 처리한다.

즉 occurrence 하나만 다른 List로 이동하는 기능은 V1에서 지원하지 않는다.

---

## 15.40 Recurring Pin Scope

Pin 역시 기본적으로 Series-level property로 처리한다.

Occurrence-specific Pin은 V1에서 지원하지 않는다.

---

## 15.41 Recurring Duplicate

Recurring occurrence에서 Duplicate를 선택했을 때 기본 권장:

```text
현재 occurrence를 standalone Task로 duplicate
```

또는 별도 메뉴:

```text
Duplicate occurrence
Duplicate series
```

를 제공할 수 있다.

V1에서는 ambiguity를 줄이기 위해 명확한 label을 사용한다.

---

## 15.42 More Menu Groups

권장 group order:

```text
1. Quick utilities
   Pin / Copy Link / Duplicate

2. Organization / structure
   Move / Convert / Hierarchy actions

3. Status
   Complete / Reopen / Won't Do

4. Destructive
   Delete
```

위치가 계속 바뀌지 않도록 안정적인 order를 유지한다.

---

## 15.43 Menu Width

Menu item label이 잘리지 않을 정도의 최소 폭을 유지한다.

긴 설명은 submenu/tooltip으로 처리하고 menu 자체를 지나치게 넓히지 않는다.

정확한 width token은 Visual System에서 확정한다.

---

## 15.44 Icons

중요 action에는 icon을 사용할 수 있다.

예:

```text
Pin
Duplicate
Link
Move
Delete
```

하지만 icon만 보여주지 않는다.

More menu는 text label을 기본으로 한다.

---

## 15.45 Keyboard Navigation

More menu는 standard menu keyboard semantics를 따른다.

```text
Arrow Up / Down
→ item 이동

Enter / Space
→ action 실행

Arrow Right
→ submenu open

Arrow Left
→ submenu close

Esc
→ menu close
```

---

## 15.46 Focus on Open

More trigger click/keyboard activation:

```text
menu open
→ 첫 유효 item 또는 현재 context item에 focus
```

정확한 focus strategy는 18/23장에서 통합한다.

---

## 15.47 Focus Restoration

Menu close 후 focus는 More trigger로 돌아간다.

Action 실행으로 Detail이 닫힌 경우에는 3장의 안정적인 Main View focus restoration rule을 따른다.

---

## 15.48 Outside Click

More menu는 outside click으로 닫는다.

Task Detail은 닫지 않는다.

---

## 15.49 Escape Priority

```text
More menu open
↓ Esc
More menu close

↓ Esc
Task Detail close
```

Layer/Esc 규칙과 일치한다.

---

## 15.50 Submenu

Move / Convert / Priority 같은 action이 submenu를 가질 수 있다.

예:

```text
Move to >
Convert >
```

Submenu는 parent menu 위에 별도 floating layer로 열 수 있다.

---

## 15.51 Nested Menu Depth

More menu 안에서 submenu를 지나치게 중첩하지 않는다.

권장:

```text
최대 1단계
```

복잡한 설정은 dedicated popover/dialog로 전환한다.

---

## 15.52 Destructive Action in Submenu

Delete를 깊은 submenu 안에 숨기지 않는다.

사용자가 영향 범위를 명확히 인식할 수 있는 독립 action으로 둔다.

---

## 15.53 Loading / Disabled State

긴 transaction이 실행 중이면 같은 destructive action을 재실행하지 못하게 한다.

예:

```text
Deleting...
```

또는 item disabled.

하지만 전체 More menu를 불필요하게 lock하지 않는다.

---

## 15.54 Double-trigger Prevention

Double click / Enter 반복으로 duplicate/delete가 두 번 실행되지 않도록 command idempotency 또는 pending guard를 둔다.

특히 Duplicate는 duplicate Task가 여러 개 생기지 않게 한다.

---

## 15.55 Optimistic Actions

다음은 optimistic하게 처리 가능하다.

```text
Pin
Status
Move
Delete
```

Duplicate는 새 entity 생성이므로 local ID를 사용해 즉시 결과를 표시할 수 있다.

---

## 15.56 Persistence Failure

Action별 rollback:

```text
Pin failure
→ previous pin state

Move failure
→ previous List/hierarchy

Delete failure
→ Task restore

Status failure
→ previous status
```

각 feature command가 책임진다.

More menu는 공통 error feedback만 연결한다.

---

## 15.57 Duplicate Failure

Duplicate transaction 실패 시:

```text
partial duplicate entity
```

를 남기지 않는다.

생성된 local optimistic copy가 있다면 제거하고 원본은 유지한다.

---

## 15.58 Copy Link Failure

Copy Link는 persistence mutation이 아니다.

실패 시 clipboard feedback만 제공한다.

Task state는 변경하지 않는다.

---

## 15.59 Activity History

More Actions 자체가 history를 저장하는 게 아니라 실제 domain action이 Activity event를 생성할 수 있다.

예:

```text
Task pinned
Task duplicated
Task moved
Task deleted
Task reopened
```

---

## 15.60 Permission-aware Actions

향후 shared workspace가 있다면 사용 권한에 따라 action을 제어한다.

예:

```text
Can edit
Can delete
Can move
```

권한 없는 action은 숨기거나 disabled + explanation.

Client UI만 믿지 않고 server-side authorization을 다시 검증한다.

---

## 15.61 Offline

Offline에서 가능한 action과 불가능한 action을 구분한다.

대부분 local-first action:

```text
Pin
Status
Move
Delete
```

는 queue 가능.

Copy Link는 local URL 생성 가능.

원격 permission 검증이 필요한 action은 sync 시 충돌할 수 있다.

---

## 15.62 More Menu and Selection

More trigger를 눌러 menu를 여는 것만으로 `selectedTaskId`를 변경하지 않는다.

Task Detail 내 More는 이미 selected Task를 대상으로 한다.

Main View context menu와는 별도로:

```text
contextTargetTaskId
```

를 사용할 수 있다.

---

## 15.63 Main View Context Menu Reuse

Main View 우클릭/More에서도 동일 action registry를 재사용할 수 있다.

단 context에 따라 available action만 필터링한다.

```text
Task Detail More
Main Row Context Menu
Board Card More
```

가 서로 다른 business logic을 갖지 않게 한다.

---

## 15.64 Action Registry

권장 구조:

```ts
type TaskAction = {
  id: string;
  label(context): string;
  icon?: string;

  group: string;

  isVisible(context): boolean;
  isEnabled(context): boolean;

  execute(context): void;
};
```

---

## 15.65 Why Registry

Action registry를 사용하면:

```text
Detail More
Context Menu
Command Palette
Keyboard Shortcut
```

가 같은 command를 재사용할 수 있다.

중복 로직을 줄인다.

---

## 15.66 Action Preconditions

각 action은 실행 전 precondition을 다시 확인한다.

예:

```text
Task exists
not deleted
permissions valid
recurrence scope resolved
hierarchy invariant valid
```

Menu가 열려 있는 동안 state가 바뀌었을 수 있기 때문이다.

---

## 15.67 Stale Menu

More menu가 열린 상태에서 remote update로 Task가 삭제/권한 변경된 경우 action 실행 시 안전하게 실패해야 한다.

UI menu state를 domain truth로 신뢰하지 않는다.

---

## 15.68 Confirmation Dialog Boundary

More menu 자체가 complex confirmation logic을 소유하지 않는다.

예:

```text
Delete recurring task
→ Recurrence Scope Dialog

Delete parent with children
→ Delete Confirmation Dialog
```

를 호출한다.

---

## 15.69 Toast Boundary

More menu가 Toast 내용을 직접 관리하지 않는다.

Domain command 결과:

```text
success / undo token / error
```

을 feedback layer로 넘긴다.

17장 Undo & Feedback에서 통합한다.

---

## 15.70 Prohibited Patterns

- More menu에 모든 기능을 무차별적으로 몰아넣기
- 현재 상태에서 의미 없는 action을 중복 노출
- Delete를 다른 일반 action 사이에 섞기
- Leaf/Parent/Recurring Delete를 동일 의미로 처리
- Duplicate 시 기존 Task ID 재사용
- Duplicate 시 completed state/history까지 그대로 복제
- Subtree duplicate에서 parent mapping을 원본 ID로 유지
- Recurring occurrence Delete에서 scope 없이 Series 전체 삭제
- More menu가 List/Status/Subtask 로직을 직접 구현
- context menu/Detail menu마다 별도 action business logic
- menu open state를 Task domain에 저장
- async action double-trigger로 duplicate/delete 두 번 실행
- 권한 없는 destructive action을 client에서만 막기
- action 실패 시 partial hierarchy/duplicate 상태 방치
- nested submenu를 여러 단계로 계속 확장
- Menu item을 icon-only로 구성해 의미 불명확하게 만들기

---

## 15.71 Acceptance Criteria

### Menu

- [ ] More trigger로 menu를 열 수 있다.
- [ ] 메뉴가 context-sensitive하게 구성된다.
- [ ] action group order가 안정적이다.
- [ ] Delete가 독립 destructive group에 있다.
- [ ] outside click/Esc로 menu를 닫을 수 있다.
- [ ] 닫힌 후 focus가 적절히 복원된다.

### Pin

- [ ] Pin/Unpin을 실행할 수 있다.
- [ ] `isPinned` 하나를 canonical state로 사용한다.
- [ ] Pin이 status/list/priority를 바꾸지 않는다.
- [ ] 모든 View가 동일 pin state를 읽을 수 있다.

### Duplicate

- [ ] 새로운 stable Task ID를 생성한다.
- [ ] status/completedAt을 안전하게 reset한다.
- [ ] Subtask hierarchy를 새 ID mapping으로 복제할 수 있다.
- [ ] Checklist/Tag/Reminder를 정책에 따라 복제할 수 있다.
- [ ] Recurring Task는 새로운 Series identity를 만든다.
- [ ] Duplicate transaction 실패 시 partial copy를 남기지 않는다.

### Copy Link

- [ ] 현재 Task의 deep link를 복사할 수 있다.
- [ ] 성공/실패 feedback을 제공한다.
- [ ] clipboard 실패 시 fallback을 제공할 수 있다.
- [ ] Copy Link는 Task domain을 변경하지 않는다.

### Status / Move / Convert

- [ ] Complete/Reopen/Won't Do가 기존 status command를 사용한다.
- [ ] Move가 13장의 list command를 사용한다.
- [ ] Convert가 각 feature의 conversion command를 사용한다.
- [ ] More menu가 중복 business logic을 만들지 않는다.

### Delete

- [ ] Leaf Task를 soft delete할 수 있다.
- [ ] Parent Delete가 descendants 영향 범위를 처리한다.
- [ ] Recurring Task Delete가 scope를 요구한다.
- [ ] Delete 후 Detail이 닫힌다.
- [ ] Undo로 복구할 수 있다.
- [ ] Task/subtree delete가 atomic하게 처리된다.

### Keyboard / Accessibility

- [ ] Arrow/Enter/Esc로 menu를 사용할 수 있다.
- [ ] submenu를 keyboard로 열고 닫을 수 있다.
- [ ] icon만으로 action 의미를 전달하지 않는다.
- [ ] destructive/disabled state가 접근성 tree에서 전달된다.

### Architecture / Reliability

- [ ] Action registry를 통해 여러 surface가 같은 command를 재사용할 수 있다.
- [ ] 실행 시 precondition을 다시 검증한다.
- [ ] async double-trigger를 방지한다.
- [ ] optimistic action 실패 시 feature command가 rollback한다.
- [ ] confirmation/Toast는 별도 layer와 연결된다.
- [ ] 권한 검증을 server-side에서도 수행 가능하다.

---

# 16. Autosave & Optimistic Update

## 16.1 Purpose

Autosave & Optimistic Update는 지금까지 정의한 모든 Task 편집 기능의 공통 저장 계층이다.

핵심 목표:

```text
사용자 입력
→ 즉시 화면 반영
→ 백그라운드 저장
→ 실패 시 안전한 복구
```

사용자는 매번 Save 버튼을 누르지 않아야 하며, 네트워크 응답을 기다리지 않고 계속 작업할 수 있어야 한다.

---

## 16.2 Core Principle

앱의 기본 mutation 흐름:

```text
User Action
   ↓
Local/UI State
   ↓
Optimistic Domain Store
   ↓
Persistence
   ↓
Remote Sync
```

실패 시:

```text
Persistence Failure
   ↓
Rollback / Unsaved State / Retry
```

Mutation 종류에 따라 rollback 방식이 달라질 수 있다.

---

## 16.3 Save Button Is Not the Default

Task Detail의 일반 편집에는 별도 Save button을 두지 않는다.

대상:

```text
Title
Description
Checklist Item
Date / Time
Priority
Tags
List
Status
Reminder
Repeat
Subtask
Attachment metadata
```

단 복잡한 multi-step dialog에서 명시적 Confirm이 필요한 경우는 예외다.

예:

```text
Recurring scope
Delete confirmation
Custom repeat rule
```

---

## 16.4 Draft State vs Domain State

텍스트 입력처럼 중간값이 존재하는 기능은 UI draft를 사용한다.

예:

```text
Title draft
Description draft
Checklist Item draft
Custom time input
```

구조:

```text
Editor Draft
   ↓ valid commit
Domain Store
```

중간 invalid text를 canonical domain에 저장하지 않는다.

---

## 16.5 Immediate Property Mutation

다음 property는 draft 없이 직접 optimistic mutation할 수 있다.

```text
Priority
Status
Pin
Tag toggle
List move
Date selection
Reminder preset
Repeat preset
Checkbox toggle
```

예:

```text
High 클릭
↓
Store 즉시 High
↓
Persistence
```

---

## 16.6 Text Mutation

Title/Description/CheckItem text는 typing마다 remote request를 보내지 않는다.

흐름:

```text
keypress
↓
local draft
↓
debounce
↓
valid commit
↓
optimistic domain update
↓
persistence
```

---

## 16.7 Recommended Debounce

초기 권장값:

```text
Title / CheckItem
300–500ms

Description
500–800ms
```

정확한 값은 실측 후 token/config로 조정한다.

컴포넌트에 숫자를 중복 하드코딩하지 않는다.

---

## 16.8 Shared Save Configuration

예:

```ts
const SAVE_TIMING = {
  title: 400,
  checkItem: 400,
  description: 700,
};
```

실제 값은 구현 시 환경에 맞게 조정한다.

---

## 16.9 Flush

Debounce가 남아 있어도 다음 상황에서는 즉시 저장해야 한다.

```text
Task switch
Detail close
Primary navigation
Editor blur
Explicit Enter commit
App background
Page unload 가능한 시점
```

공통 개념:

```ts
flushPendingEdits(taskId?)
```

---

## 16.10 Flush Before Task Switch

예:

```text
Task A Description typing
↓
Task B click
```

순서:

```text
1. A pending draft flush
2. A latest value store에 반영
3. selection → B
```

Task switch 때문에 마지막 몇 글자가 유실되면 안 된다.

---

## 16.11 Flush Before Detail Close

```text
dirty editor
↓ Close
flush
↓ Detail close
```

단 Esc가 editor cancel semantics를 가진 경우 해당 editor의 규칙이 먼저 적용된다.

---

## 16.12 Flush Before Primary Navigation

Sidebar/Rail navigation:

```text
dirty draft
↓
flush
↓
navigate
```

네비게이션이 autosave보다 먼저 실행되어 component unmount로 draft가 사라지지 않게 한다.

---

## 16.13 Page Unload

브라우저 unload는 async save가 보장되지 않을 수 있다.

따라서 핵심 draft는 가능하면 이미 local persistence/store에 최신 상태가 존재해야 한다.

다음에만 의존하지 않는다.

```text
beforeunload에서 마지막 remote API call
```

---

## 16.14 Local Persistence

가능하면 remote sync 이전에 local durable storage를 둘 수 있다.

예:

```text
IndexedDB
SQLite
local database
```

흐름:

```text
User edit
→ local store
→ local persistence
→ remote sync
```

이 구조는 네트워크 장애에 강하다.

---

## 16.15 Optimistic Update Definition

Optimistic update란:

> 서버 성공 응답을 기다리지 않고 사용자가 요청한 최종 상태를 화면과 local store에 먼저 적용하는 것.

예:

```text
Priority None
↓ High click
High 즉시 표시
↓
server save
```

---

## 16.16 Canonical Store

모든 View가 같은 normalized store를 읽는다.

```text
Task Store
├─ Detail
├─ List
├─ Board
├─ Calendar
├─ Search
└─ Sidebar counts
```

Optimistic mutation은 이 canonical store에 반영한다.

View별 local copy만 바꾸지 않는다.

---

## 16.17 Mutation Object

모든 mutation을 추적 가능한 object로 표현하는 것을 권장한다.

예:

```ts
type Mutation = {
  id: string;
  entityType: string;
  entityId: string;

  action: string;

  sequence: number;

  status:
    | "pending"
    | "saving"
    | "succeeded"
    | "failed";

  createdAt: number;
};
```

실제 구현은 더 단순할 수 있지만 mutation identity는 중요하다.

---

## 16.18 Mutation ID

각 mutation은 unique ID를 가진다.

예:

```text
mut_<ulid>
```

목적:

```text
retry
deduplication
undo association
logging
stale-response detection
```

---

## 16.19 Per-entity Sequence

동일 Task/property에 연속 mutation이 발생할 수 있다.

예:

```text
Priority
None → High → Medium → Low
```

각 mutation에 sequence/revision을 부여한다.

최종값:

```text
latest user mutation wins
```

---

## 16.20 Stale Response Problem

예:

```text
#1 title = "Meeting A"
#2 title = "Meeting AB"
```

서버 응답 순서:

```text
#2 success
#1 success
```

#1 응답이 늦게 왔다고 화면을 `"Meeting A"`로 되돌리면 안 된다.

---

## 16.21 Stale Response Rule

응답 처리 전:

```text
response.sequence
<
latestSequence
```

이면 UI canonical state를 덮어쓰지 않는다.

필요하면 성공 bookkeeping만 처리한다.

---

## 16.22 Property-level vs Entity-level Versioning

두 전략 가능:

### Entity-level revision

```text
Task revision = 17
```

### Property-level sequence

```text
title seq = 8
priority seq = 3
schedule seq = 5
```

V1에서는 mutation queue + entity revision을 조합하는 방식이 단순하다.

---

## 16.23 Independent Properties

Title save와 Priority save가 동시에 발생해도 서로 덮어쓰면 안 된다.

금지:

```text
PATCH title
→ full stale Task object 전송
→ 최신 priority 덮어씀
```

권장:

```text
field-level PATCH
```

또는 revision-aware merge.

---

## 16.24 Partial Patch

예:

```ts
updateTask(taskId, {
  title: "Planning Meeting"
});
```

처럼 실제 변경 field만 persistence layer에 전달한다.

가능하면 full object replace를 피한다.

---

## 16.25 Structural Mutation

다음은 여러 entity를 변경할 수 있다.

```text
Subtree List Move
Reparent
Delete Parent
Duplicate Hierarchy
Description ↔ Checklist Conversion
Recurring Series Split
```

이들은 단순 field PATCH와 다르게 transaction 단위로 처리한다.

---

## 16.26 Atomic Transaction

예:

```text
Parent move Study → Work

Parent
Child A
Child B
```

세 Task의 `listId`가 하나의 transaction으로 바뀌어야 한다.

중간 상태:

```text
Parent = Work
Children = Study
```

가 canonical persisted state로 남으면 안 된다.

---

## 16.27 Transaction Mutation

권장 concept:

```ts
runTransaction([
  mutationA,
  mutationB,
  mutationC
]);
```

실패하면:

```text
all rollback
```

가능해야 한다.

---

## 16.28 Optimistic Transaction

Structural action도 UI에서는 즉시 반영할 수 있다.

```text
reparent
↓
tree 즉시 이동
↓
transaction save
```

실패 시 전체 subtree를 원래 상태로 되돌린다.

---

## 16.29 Rollback Snapshot

Optimistic mutation 전 필요한 최소 이전 상태를 저장한다.

예:

```ts
{
  taskId,
  previous: {
    priority: "medium"
  }
}
```

Structural mutation은 affected entities snapshot이 필요하다.

---

## 16.30 Rollback Must Be Mutation-aware

오래된 실패 mutation이 최신 user edit까지 되돌리면 안 된다.

예:

```text
#1 Priority High
#2 Priority Low

#1 save failure
```

현재 Low를 Medium/None으로 rollback하면 안 된다.

즉 rollback도 sequence/revision을 확인한다.

---

## 16.31 Safe Rollback Rule

Rollback 대상 mutation이 여전히 latest일 때만 직접 rollback한다.

그 이후 새로운 mutation이 있다면:

```text
latest local state 유지
+
sync/error reconciliation
```

을 수행한다.

---

## 16.32 Text Save Failure

텍스트 편집에서는 실패 시 무조건 이전 committed value로 rollback하지 않는다.

왜냐하면 최신 draft가 더 중요하기 때문이다.

권장:

```text
draft 유지
isUnsaved = true
error 표시
retry
```

---

## 16.33 Toggle Save Failure

Checkbox/Priority처럼 명확한 discrete mutation은 최신 mutation인 경우 이전 값으로 rollback할 수 있다.

예:

```text
unchecked → checked
save failure
→ unchecked
```

---

## 16.34 Destructive Mutation Failure

Delete failure:

```text
Task optimistic remove
↓ failure
Task restore
```

Move failure:

```text
new List
↓ failure
original List restore
```

사용자에게 error feedback을 제공한다.

---

## 16.35 Save Status Model

UI layer에서 다음 상태를 구분할 수 있다.

```text
clean
dirty
saving
saved
error
offline-pending
```

모든 상태를 항상 사용자에게 텍스트로 노출할 필요는 없다.

---

## 16.36 Quiet Success

정상적인 autosave 성공마다:

```text
Saved!
Saved!
Saved!
```

Toast를 반복하지 않는다.

기본:

```text
success → quiet
error → visible
offline pending → visible when useful
```

---

## 16.37 Saving Indicator

평상시에는 숨겨도 된다.

긴 저장/오프라인/에러 시에만 subtle indicator를 사용할 수 있다.

예:

```text
Saving…
Unsaved
Offline
```

---

## 16.38 Error Indicator

저장 실패는 조용히 숨기면 안 된다.

특히 텍스트 draft:

```text
Couldn't save. Retry
```

처럼 사용자가 데이터가 안전하지 않음을 알 수 있어야 한다.

---

## 16.39 Retry

실패 mutation은 retry 가능해야 한다.

중요:

> Retry는 실패 당시 오래된 payload가 아니라 현재 유효한 최신 state를 기준으로 해야 한다.

특히 text property에서 중요하다.

---

## 16.40 Automatic Retry

일시적인 network error는 자동 retry 가능하다.

권장:

```text
exponential backoff
```

예:

```text
1s
2s
4s
8s
```

무한 aggressive retry는 피한다.

---

## 16.41 Manual Retry

자동 retry 한계를 넘으면:

```text
Retry
```

action을 제공한다.

---

## 16.42 Offline Detection

네트워크 disconnected:

```text
mutation
→ local state 적용
→ offline queue
```

가능하게 설계한다.

단 브라우저 online event만 절대 진실로 믿지 않고 실제 request failure도 처리한다.

---

## 16.43 Offline Queue

권장 concept:

```ts
pendingMutations: Mutation[];
```

네트워크 복구 후 순서대로 또는 dependency-aware하게 sync한다.

---

## 16.44 Mutation Dependency

모든 mutation을 무조건 FIFO로 보내면 안 되는 경우가 있다.

예:

```text
Create Task
↓
Add Tag
↓
Add Attachment
```

Task가 remote에 생성되기 전에 relation mutation이 전송되면 실패할 수 있다.

dependency를 표현할 수 있어야 한다.

---

## 16.45 Local-generated IDs

Client-generated stable ID를 사용하면 offline create dependency가 단순해진다.

예:

```text
Task ID를 서버가 반환할 때까지 기다릴 필요 없음
```

Task/CheckItem/Attachment/Subtask에서 동일 전략을 사용할 수 있다.

---

## 16.46 Mutation Coalescing

Offline/rapid typing 중 같은 property mutation이 여러 개 쌓이면 합칠 수 있다.

예:

```text
Title A
Title AB
Title ABC
```

Remote에 세 개 모두 보낼 필요 없이:

```text
latest Title ABC
```

로 coalesce 가능하다.

---

## 16.47 Do Not Coalesce Everything

다음처럼 history 의미가 중요한 mutation은 단순 합치면 안 될 수 있다.

```text
Delete
Reparent
Series split
Attachment upload
```

Mutation type별 coalescing 정책이 필요하다.

---

## 16.48 Conflict Definition

Conflict는 local과 remote가 같은 entity를 서로 다른 방향으로 수정했을 때 발생한다.

예:

```text
Device A:
Title → "Meeting"

Device B:
Title → "Planning"
```

---

## 16.49 Revision

Entity에 revision을 둘 수 있다.

예:

```ts
revision: number;
```

Server update:

```text
expectedRevision = 12
```

인데 현재 remote revision이 13이면 conflict를 감지한다.

---

## 16.50 `updatedAt` Alone Is Not Enough

`updatedAt`만으로도 단순 last-write-wins는 가능하지만:

```text
clock skew
동시 수정
field-level merge
```

에 약하다.

가능하면 revision/version을 명시적으로 둔다.

---

## 16.51 Field-level Merge

서로 다른 field를 수정했다면 자동 merge 가능하다.

예:

```text
Device A → title
Device B → priority
```

결과:

```text
title A
priority B
```

한쪽 full object가 다른 쪽을 덮어쓰지 않게 한다.

---

## 16.52 Same-field Conflict

같은 field를 동시에 수정하면 정책이 필요하다.

텍스트 field에서는:

```text
silent overwrite
```

를 피한다.

V1 가능한 정책:

```text
latest revision wins
+
active local draft는 보존
+
conflict feedback
```

---

## 16.53 Active Editor Conflict

사용자가 Description을 입력 중 remote update가 오면:

```text
remote value로 editor 교체 ❌
```

local draft를 유지한다.

필요하면:

```text
This task changed elsewhere
Review / Keep mine
```

같은 conflict UX로 확장한다.

---

## 16.54 Non-editing Remote Update

사용자가 해당 field를 편집 중이 아니면 remote update를 즉시 canonical store에 적용할 수 있다.

---

## 16.55 Structural Conflict

Hierarchy/Recurrence 등 structural mutation은 자동 merge가 위험하다.

예:

```text
Device A → Child reparent B
Device B → Child reparent C
```

이 경우 revision conflict를 명시적으로 처리한다.

silent dual-parent 상태는 금지.

---

## 16.56 Server Authority

권한, 삭제, invalid hierarchy처럼 server가 최종 authority여야 하는 영역은 local optimistic state를 rollback할 수 있어야 한다.

예:

```text
권한 없음
Task already deleted
List no longer exists
```

---

## 16.57 Remote Delete

사용자가 Task를 편집 중인데 다른 device에서 Task가 삭제된 경우:

```text
local draft
+
remote deleted
```

를 감지한다.

조용히 사라지게 하기보다:

```text
Task was deleted elsewhere
```

feedback과 recovery option을 고려한다.

---

## 16.58 Save Lifecycle

일반 mutation lifecycle:

```text
IDLE
↓ action
OPTIMISTIC
↓ request
SAVING
├─ success → CLEAN
└─ failure → ERROR / ROLLBACK
```

Offline:

```text
OPTIMISTIC
↓
OFFLINE_PENDING
↓ network restored
SAVING
```

---

## 16.59 Editor Lifecycle

텍스트 editor:

```text
CLEAN
↓ typing
DIRTY
↓ debounce
COMMITTING
↓ optimistic domain update
SAVING
├─ success → CLEAN
└─ failure → UNSAVED_ERROR
```

사용자가 계속 typing하면 다시 DIRTY가 될 수 있다.

---

## 16.60 Multiple In-flight Saves

동일 Task에 여러 request가 동시에 존재할 수 있다.

예:

```text
Title save
Priority save
Tag save
```

서로 block하지 않는다.

다만 같은 property mutation은 ordering을 보장한다.

---

## 16.61 Global Save Lock 금지

Task 하나 저장 중이라고 Detail 전체를 disabled로 만들지 않는다.

```text
Title saving
→ Priority click 가능
→ Date edit 가능
```

부분 failure가 전체 편집을 막지 않는다.

---

## 16.62 Per-feature Pending State

필요하면:

```text
titleSaving
scheduleSaving
tagSaving
```

같은 derived pending state를 selector로 계산한다.

Task model에 영구 boolean으로 저장하지 않는다.

---

## 16.63 Mutation Store

권장 architecture:

```text
Domain Store
+
Mutation Store/Queue
```

예:

```ts
{
  pendingByEntity: {},
  failedMutations: {},
  latestSequenceByKey: {}
}
```

---

## 16.64 Mutation Key

같은 property ordering을 위해 key를 만들 수 있다.

예:

```text
task:123:title
task:123:priority
task:123:schedule
```

Structural transaction은 별도 transaction key를 사용한다.

---

## 16.65 Query Invalidation

Mutation 후 관련 query/view를 갱신해야 한다.

예:

```text
Date Today → Tomorrow
```

영향:

```text
Today query
Tomorrow query
Calendar
Sidebar count
```

하지만 가능하면 normalized store와 derived selector로 자동 반영한다.

무조건 모든 query를 전체 refetch하지 않는다.

---

## 16.66 Optimistic Derived State

다음 derived state도 optimistic domain store에서 즉시 재계산된다.

```text
Today membership
Overdue
Priority grouping
Tag filter
List counts
Checklist progress
Subtask progress
```

---

## 16.67 Server Reconciliation

Server 성공 응답에 canonical normalized data가 포함될 수 있다.

예:

```text
updatedAt
revision
normalized value
```

이를 local latest mutation과 안전하게 merge한다.

---

## 16.68 Server-normalized Value

예:

```text
client tag name:
"  Research "

server:
"Research"
```

server normalization이 최신 mutation과 호환되면 canonical store에 반영한다.

하지만 stale response의 normalized value로 최신 edit을 덮어쓰지 않는다.

---

## 16.69 Idempotency

Create/Duplicate/Delete 같은 action은 request 재시도로 중복 수행되지 않도록 idempotency key를 사용할 수 있다.

예:

```text
duplicateTask request timeout
↓ retry
```

Task copy가 2개 생성되면 안 된다.

---

## 16.70 Idempotency Key

Mutation ID를 server idempotency key로 재사용할 수 있다.

```text
mutation.id
```

같은 mutation retry는 같은 logical action으로 취급한다.

---

## 16.71 Delete Idempotency

이미 deleted Task에 같은 delete mutation이 재전송되어도 안전해야 한다.

```text
delete deleted Task
→ no-op / success equivalent
```

---

## 16.72 Create Idempotency

Client-generated ID를 사용하면 create retry도 중복 entity 생성 위험이 낮아진다.

---

## 16.73 Autosave and Undo

Autosave와 Undo는 충돌하지 않아야 한다.

예:

```text
Priority High
↓ autosave
↓ Undo
Priority None
```

Undo도 새로운 mutation으로 persistence한다.

단 단순 local history rewind만 하고 remote를 그대로 두면 안 된다.

---

## 16.74 Undo During Pending Save

예:

```text
#1 complete pending
↓
Undo
#2 reopen
```

#1 응답이 나중에 와도 reopen 상태를 덮어쓰면 안 된다.

Sequence rule을 그대로 적용한다.

---

## 16.75 Delete Undo During Pending Delete

Delete request가 아직 pending인데 Undo:

```text
delete mutation
↓
restore mutation
```

또는 pending delete cancel 가능.

어느 방식이든 최종 canonical state는 live Task여야 한다.

---

## 16.76 Autosave and Recurrence Scope

Recurring Task의 scope prompt가 필요한 mutation은 scope를 선택하기 전까지 autosave하지 않는다.

예:

```text
Occurrence date edit
↓
scope unresolved
```

는 temporary draft.

사용자 scope 선택:

```text
This occurrence
This and future
All
```

후 transaction commit.

---

## 16.77 Autosave and Confirmation

Delete/Conversion처럼 confirm이 필요한 destructive action은 user confirmation 전 domain mutation을 수행하지 않는다.

Optimistic update는 confirmation 이후 시작한다.

---

## 16.78 Autosave and Attachment

Attachment binary upload는 일반 Task autosave와 별도 transfer lifecycle을 가진다.

하지만 Attachment metadata mutation은 same mutation infrastructure를 사용할 수 있다.

---

## 16.79 Autosave and Search Index

Text mutation마다 remote search index rebuild를 block하지 않는다.

Commit된 latest value를 비동기 index queue에 보낼 수 있다.

---

## 16.80 Autosave and Analytics

Mutation event와 analytics event를 구분한다.

```text
save mutation retry
```

때문에:

```text
user changed priority
```

analytics가 여러 번 기록되면 안 된다.

User intent event 기준으로 deduplicate한다.

---

## 16.81 Telemetry

개발/품질 개선을 위해 다음 metrics를 기록할 수 있다.

```text
save latency
failure rate
retry count
conflict count
offline queue size
rollback count
```

사용자 content 자체를 불필요하게 telemetry로 보내지 않는다.

---

## 16.82 Performance Budget

Optimistic mutation은 UI thread에서 즉시 느껴져야 한다.

예:

```text
checkbox
priority
tag
```

같은 action은 클릭 후 frame 수준에서 반영되어야 한다.

네트워크 latency와 독립적이어야 한다.

---

## 16.83 Background Sync

remote persistence가 진행 중이어도 사용자는 다른 Task를 열고 편집할 수 있다.

Mutation queue가 component lifecycle과 분리되어야 한다.

---

## 16.84 Component Unmount Safety

Component unmount로 pending save promise가 사라지더라도 mutation tracking은 유지된다.

즉:

```text
editor component
≠
save lifecycle owner
```

Save lifecycle은 store/service layer가 소유한다.

---

## 16.85 App Restart Recovery

Local durable mutation queue를 사용한다면 app restart 후:

```text
pending mutations
```

을 다시 전송할 수 있다.

이미 성공한 mutation을 중복 적용하지 않도록 idempotency가 필요하다.

---

## 16.86 Sync Success after Restart

Server가 이미 mutation을 처리했지만 client가 성공 응답 전에 종료된 경우:

```text
same mutation id retry
```

로 안전하게 reconcile한다.

---

## 16.87 Multi-tab

같은 앱을 여러 browser tab에서 열 수 있다.

Local store가 완전히 독립이면 서로 stale 상태가 될 수 있다.

향후:

```text
BroadcastChannel
storage events
shared worker
```

등으로 local tab sync를 지원할 수 있다.

---

## 16.88 Multi-tab Edit Conflict

같은 Task를 두 tab에서 수정하면 remote/device conflict와 같은 원칙을 적용한다.

active draft silent overwrite 금지.

---

## 16.89 Security

Optimistic UI가 권한을 대신하지 않는다.

서버는 모든 mutation마다:

```text
authentication
authorization
validation
```

을 수행한다.

클라이언트가 High priority를 보여줬다고 실제 저장 권한이 있다고 가정하지 않는다.

---

## 16.90 Validation Layer

Mutation은 UI, command/domain, server에서 단계적으로 validation한다.

```text
UI
→ 빠른 피드백

Domain Command
→ invariant 보장

Server
→ 최종 신뢰 경계
```

---

## 16.91 Error Types

최소 다음을 구분한다.

```text
Validation Error
Network Error
Permission Error
Conflict Error
Server Error
Not Found / Deleted
```

모든 오류를:

```text
Something went wrong
```

하나로 처리하지 않는다.

---

## 16.92 User-facing Error Strategy

사용자에게 기술적인 stack trace를 보여주지 않는다.

예:

```text
Couldn’t save changes.
Retry
```

Conflict:

```text
This task changed on another device.
```

Permission:

```text
You no longer have permission to edit this task.
```

---

## 16.93 Error Persistence

저장 실패 state가 Task를 이동하거나 Detail을 닫는 순간 사라져 사용자가 데이터가 저장된 줄 착각하면 안 된다.

Local unsaved draft가 있다면 recovery 가능해야 한다.

---

## 16.94 Unsaved Draft Recovery

앱 reload/crash 대비 중요한 long-form Description draft를 local draft cache에 임시 보관할 수 있다.

예:

```text
taskId + editor field + timestamp
```

remote 성공 후 cache 제거.

---

## 16.95 Draft Recovery Expiry

임시 draft cache는 무한 누적하지 않는다.

성공 저장 또는 일정 retention 후 cleanup한다.

---

## 16.96 Save Indicator Placement

전역적인 큰 status bar보다 필요한 위치에 subtle feedback을 권장한다.

예:

```text
Description area
→ Unsaved / Retry

Attachment row
→ Upload failed
```

전체 Detail을 error mode로 바꾸지 않는다.

---

## 16.97 Shared Feedback Layer

Mutation command는 UI에 직접 Toast를 렌더하지 않는다.

결과:

```ts
{
  success,
  undoToken?,
  error?
}
```

를 feedback layer에 전달한다.

17. Undo & Feedback에서 통합한다.

---

## 16.98 Command Contract

권장 개념:

```ts
type CommandResult<T> = {
  optimisticValue?: T;
  mutationId: string;

  undoToken?: string;

  error?: {
    type: string;
    message: string;
  };
};
```

실제 타입은 구현에 맞게 단순화 가능하다.

---

## 16.99 Prohibited Patterns

- 모든 편집마다 Save 버튼 요구
- 서버 성공 후에야 UI 상태 변경
- Keypress마다 remote API 호출
- View component가 save lifecycle을 직접 소유
- Component unmount 시 pending mutation 유실
- full stale Task object PATCH로 다른 property 최신값 덮어쓰기
- 늦게 온 response가 최신 user action을 덮어쓰기
- 오래된 failed mutation rollback이 최신 mutation까지 되돌리기
- 텍스트 save failure 시 최신 draft를 조용히 삭제
- 모든 mutation을 하나의 global save lock으로 막기
- structural transaction을 여러 비원자적 request로 방치
- offline mutation을 무조건 즉시 실패 처리
- create/duplicate retry로 entity 중복 생성
- conflict 상황에서 active draft silent overwrite
- 모든 error를 하나의 generic 메시지로 처리
- success마다 반복 Toast
- autosave와 Undo를 서로 다른 canonical state로 운영
- recurrence scope 결정 전에 mutation commit
- optimistic UI를 server authorization 대체물로 사용

---

## 16.100 Acceptance Criteria

### Autosave

- [ ] 일반 Task 편집에 별도 Save 버튼이 필요하지 않는다.
- [ ] Title/Description/CheckItem에 debounce autosave가 적용될 수 있다.
- [ ] Task switch 전 pending draft가 flush된다.
- [ ] Detail close/navigation 전 pending draft가 flush된다.
- [ ] invalid draft는 canonical domain에 저장되지 않는다.
- [ ] component unmount 후에도 save lifecycle이 유지된다.

### Optimistic Update

- [ ] Status/Priority/Tag/List/Date 등의 변경이 즉시 UI에 반영된다.
- [ ] 모든 View가 같은 optimistic canonical store를 읽는다.
- [ ] server latency가 일반 interaction을 block하지 않는다.
- [ ] derived query/count/progress도 즉시 갱신된다.

### Mutation Ordering

- [ ] 각 mutation에 identity를 부여할 수 있다.
- [ ] 동일 property의 latest mutation을 추적할 수 있다.
- [ ] stale response가 최신 state를 덮어쓰지 않는다.
- [ ] rapid toggle/edit/reorder에서 마지막 user action이 승리한다.
- [ ] Undo가 pending mutation ordering과 충돌하지 않는다.

### Persistence

- [ ] 변경 field만 partial patch할 수 있다.
- [ ] 서로 다른 property mutation이 독립적으로 저장될 수 있다.
- [ ] structural action은 transaction으로 처리할 수 있다.
- [ ] transaction 실패 시 전체 affected state를 rollback할 수 있다.
- [ ] create/duplicate 등에서 idempotency를 적용할 수 있다.

### Failure / Retry

- [ ] Network/Validation/Permission/Conflict/Server 오류를 구분한다.
- [ ] discrete mutation 실패 시 안전한 rollback이 가능하다.
- [ ] text save failure 시 최신 draft를 보존한다.
- [ ] 자동/수동 Retry를 지원할 수 있다.
- [ ] success는 기본적으로 quiet하게 처리한다.
- [ ] unsaved 상태는 사용자에게 숨기지 않는다.

### Offline

- [ ] Offline mutation queue로 확장 가능하다.
- [ ] client-generated stable ID를 사용할 수 있다.
- [ ] 동일 property mutation을 안전하게 coalesce할 수 있다.
- [ ] app restart 후 pending mutation을 복구할 수 있는 구조다.
- [ ] retry가 duplicate entity를 만들지 않는다.

### Conflict

- [ ] Entity revision/version을 지원할 수 있다.
- [ ] 서로 다른 field 수정은 merge 가능하게 설계한다.
- [ ] active local draft를 remote update가 조용히 덮어쓰지 않는다.
- [ ] structural conflict를 silent merge하지 않는다.
- [ ] remote delete/permission change를 안전하게 처리할 수 있다.

### Architecture

- [ ] Draft state와 Domain state가 분리된다.
- [ ] Domain Store와 Mutation Queue/Store가 분리될 수 있다.
- [ ] Save lifecycle을 component가 직접 소유하지 않는다.
- [ ] Command layer가 validation/optimistic update/persistence를 조율한다.
- [ ] Feedback rendering은 17장의 공통 feedback layer로 분리된다.
- [ ] Server-side authorization/validation을 항상 유지한다.

---

# 17. Undo & Feedback

## 17.1 Purpose

Undo & Feedback은 사용자가 Task를 빠르게 수정하면서도 실수에서 안전하게 복구할 수 있도록 하는 공통 interaction layer다.

핵심 목표:

```text
User Action
   ↓
즉시 UI 반영
   ↓
짧고 명확한 feedback
   ↓
필요한 action만 Undo 가능
```

모든 성공 action마다 큰 알림을 띄우는 것이 아니라, **실수 가능성이 높거나 구조적 영향이 큰 action에 Undo를 집중**한다.

---

## 17.2 Feedback Types

Feedback은 최소 다음 네 종류로 구분한다.

```text
1. Silent success
2. Inline feedback
3. Toast feedback
4. Dialog / blocking feedback
```

사용 빈도와 위험도에 따라 가장 가벼운 수단을 사용한다.

---

## 17.3 Silent Success

다음과 같은 일상적인 direct edit은 성공 Toast를 기본적으로 띄우지 않는다.

예:

```text
Priority change
Date change
Tag add/remove
Title autosave
Description autosave
Pin
Checklist toggle
```

성공은 UI state 변화 자체로 충분하다.

---

## 17.4 Inline Feedback

해당 영역 안에서 바로 해결해야 하는 상태는 inline feedback을 사용한다.

예:

```text
Upload failed
Couldn't save description
Invalid reminder time
Invalid recurrence rule
```

관련 context와 멀리 떨어진 Toast 하나로만 처리하지 않는다.

---

## 17.5 Toast Feedback

Toast는 다음에 적합하다.

```text
Undo 가능한 destructive/structural action
짧은 성공 확인이 필요한 utility action
전역적인 비차단 오류
```

예:

```text
Task deleted                 Undo
Task moved to Work           Undo
Checklist converted          Undo
Link copied
```

---

## 17.6 Dialog / Blocking Feedback

사용자 확인 없이 진행하면 데이터 손실 위험이 큰 경우 Dialog를 사용한다.

예:

```text
Delete Parent + descendants
Recurring Task scope
Description ↔ Checklist 정보 손실 conversion
Permission/security-sensitive action
```

Dialog를 모든 사소한 action에 사용하지 않는다.

---

## 17.7 Undo Principle

Undo는 UI state만 되돌리는 기능이 아니다.

```text
Undo
↓
Domain state restore
↓
Store update
↓
Persistence
↓
All Views sync
```

Undo 자체도 새로운 mutation으로 취급할 수 있다.

---

## 17.8 Undoable Actions

V1에서 Undo를 적극 권장하는 action:

```text
Task Delete
Subtask/Subtree Delete
CheckItem Delete
Attachment Delete
Move to List
Reparent / Indent / Outdent
Description ↔ Checklist Conversion
CheckItem → Subtask Conversion
Complete
```

상황에 따라:

```text
Tag removal
Priority
Pin
```

까지 app-level Undo stack으로 확장할 수 있다.

---

## 17.9 Actions That Do Not Need Toast Undo

다음은 사용자가 즉시 같은 control로 되돌리기 쉬우므로 Toast Undo가 필수는 아니다.

```text
Priority change
Pin / Unpin
Tag toggle
Checklist check/uncheck
Reminder preset toggle
```

다만 global Undo history에는 포함할 수 있다.

---

## 17.10 Undo Token

Command 결과는 필요하면 Undo 정보를 반환한다.

개념:

```ts
type UndoToken = {
  id: string;

  action: string;

  entityIds: string[];

  createdAt: number;

  expiresAt?: number;

  undo(): Promise<void>;
};
```

UI가 직접 이전 domain snapshot을 임의로 재구성하지 않는다.

---

## 17.11 Undo Snapshot

Undo에 필요한 최소 이전 상태를 mutation 시점에 보존한다.

예:

### Move

```ts
{
  taskId,
  previousListId,
  previousParentTaskId,
  previousSortKey
}
```

### Delete subtree

```text
affected Task IDs
deletedAt values
parent relationships
sort keys
```

### Conversion

```text
description
checkItems
contentMode
```

---

## 17.12 Undo Must Be Transaction-aware

원래 action이 transaction이었다면 Undo도 transaction이다.

예:

```text
Delete Parent + 4 descendants
```

Undo:

```text
Parent + 4 descendants
전체 복구
```

일부만 복원하면 안 된다.

---

## 17.13 Undo Is a New Mutation

예:

```text
#1 Delete Task
↓
Undo
#2 Restore Task
```

Undo는 로컬 화면만 rewind하는 것이 아니라 persistence에도 반영된다.

---

## 17.14 Undo During Pending Mutation

원래 mutation이 아직 저장 중이어도 Undo할 수 있어야 한다.

예:

```text
#1 complete pending
↓
Undo
#2 reopen
```

최종 상태는 #2가 승리한다.

16장의 mutation sequence rule을 그대로 적용한다.

---

## 17.15 Cancel Pending vs Compensating Mutation

가능한 경우 pending request 자체를 취소할 수 있다.

하지만 이미 server processing이 시작되었을 수 있으므로 기본적으로는:

```text
Original Mutation
+
Compensating Mutation
```

전략을 지원해야 한다.

예:

```text
delete
→ restore
```

---

## 17.16 Undo Expiry

Toast Undo에는 제한 시간이 필요할 수 있다.

권장 초기값:

```text
5–8 seconds
```

정확한 값은 Visual/Interaction audit 후 token으로 확정한다.

시간 자체를 여러 컴포넌트에 하드코딩하지 않는다.

---

## 17.17 Undo After Toast Expiry

Toast가 사라져도 데이터가 즉시 물리 삭제되어야 한다는 의미는 아니다.

예:

```text
Task Delete
→ Trash / soft delete
```

를 통해 별도 복구가 가능할 수 있다.

Toast Undo와 장기 복구 정책을 구분한다.

---

## 17.18 Toast Structure

기본 Toast:

```text
┌─────────────────────────────────┐
│ Task deleted              Undo  │
└─────────────────────────────────┘
```

구성:

```text
message
optional action
optional close
```

불필요한 제목/본문/아이콘을 모두 넣어 과밀하게 만들지 않는다.

---

## 17.19 Toast Placement

Toast는 App Shell의 고정 feedback layer에 렌더한다.

Task Detail 내부에 잘려 보이거나 scroll에 따라 이동하면 안 된다.

정확한 위치는 Visual System에서 확정한다.

---

## 17.20 Toast Layer

1장의 layer system과 통합한다.

예:

```text
App shell          0
Popover          100
Modal            300
Toast            400
```

Toast가 Popover 뒤에 가려지지 않는다.

---

## 17.21 Toast Does Not Block Work

Toast는 기본적으로 non-modal이다.

사용자는 Toast가 보이는 동안:

```text
다른 Task 선택
계속 입력
다른 action 실행
```

을 할 수 있어야 한다.

---

## 17.22 Multiple Toasts

연속 action:

```text
Delete A
Delete B
Move C
```

에서 Toast가 화면을 무한히 쌓아 올리면 안 된다.

기본 권장:

> 제한된 stack을 사용한다.

예:

```text
최대 3개 visible
```

초과분은 queue 또는 collapse한다.

정확한 개수는 Visual System에서 token화할 수 있다.

---

## 17.23 Undo Ordering

여러 Undo 가능한 action이 존재할 때 각 Toast의 Undo는 **해당 mutation만** 대상으로 한다.

```text
Toast A → Undo A
Toast B → Undo B
```

“가장 최근 action 아무거나 Undo”와 혼동하지 않는다.

---

## 17.24 Global Undo Stack

향후:

```text
Cmd/Ctrl + Z
```

로 app-level mutation undo를 지원할 수 있다.

권장 개념:

```ts
undoStack: UndoToken[];
redoStack: UndoToken[];
```

단 text editor focus 중에는 editor-local Undo가 우선한다.

---

## 17.25 Editor-local vs App-level Undo

### Editor Focus

```text
Cmd/Ctrl + Z
→ text edit undo
```

### No Active Text Editing

```text
Cmd/Ctrl + Z
→ last app mutation undo
```

이 우선순위는 18장에서 확정한다.

---

## 17.26 Redo

Global Undo를 제공한다면 Redo도 확장 가능하게 한다.

```text
Cmd/Ctrl + Shift + Z
```

또는 플랫폼 관례.

V1 필수는 아니지만 Undo architecture가 Redo를 막지 않게 한다.

---

## 17.27 New Action After Undo

일반적인 history semantics:

```text
Undo
↓
새로운 mutation
↓
Redo stack clear
```

를 따른다.

---

## 17.28 Complete Undo

Task Complete 후:

```text
Task completed              Undo
```

Undo:

```text
status = open
completedAt = null
```

현재 View에서 Task가 사라졌다면 다시 query에 나타날 수 있다.

---

## 17.29 Complete Undo and Detail

완료된 Task Detail이 유지되고 있었다면 Undo 후 같은 Detail에서 open state를 표시한다.

Detail이 닫혀 있었다면 Undo만으로 자동 open하지 않는다.

---

## 17.30 Delete Undo

Delete:

```text
Task removed
Detail closed
```

Toast:

```text
Task deleted                Undo
```

Undo:

```text
Task restore
```

기본적으로 Detail은 자동 재오픈하지 않는다.

---

## 17.31 Subtree Delete Undo

Parent delete:

```text
Parent
├ Child A
└ Child B
```

Undo 시 hierarchy 전체를 원래:

```text
parentTaskId
listId
sortKey
deletedAt
```

상태로 복원한다.

---

## 17.32 Move Undo

Task:

```text
Study → Work
```

Toast:

```text
Moved to Work               Undo
```

Undo:

```text
Work → Study
```

Subtree move였다면 descendants도 함께 돌아간다.

---

## 17.33 Reparent Undo

```text
Child:
Parent A → Parent B
```

Undo:

```text
Parent B → Parent A
```

원래 sibling position까지 복원한다.

---

## 17.34 Indent / Outdent Undo

Indent/Outdent도 hierarchy transaction으로 복원한다.

단 현재 tree가 이후 다른 mutation으로 크게 바뀌었다면 conflict-aware Undo가 필요하다.

---

## 17.35 Conversion Undo

Description → Checklist:

```text
Converted to checklist      Undo
```

Undo:

```text
description 복원
checkItems 제거
contentMode = description
```

---

## 17.36 CheckItem → Subtask Undo

Undo:

```text
created Subtask 제거
원래 CheckItem 복구
order/checked state 복원
```

---

## 17.37 Attachment Delete Undo

Attachment 삭제 Undo는 metadata와 file availability를 함께 복구한다.

Physical file cleanup이 Undo window 전에 완료되어서는 안 된다.

---

## 17.38 Copy Link Feedback

Copy Link는 Undo가 필요 없다.

Toast:

```text
Link copied
```

처럼 짧은 성공 feedback만 제공한다.

---

## 17.39 Save Success Feedback

Autosave 성공은 기본적으로 Toast를 띄우지 않는다.

```text
Saved
```

를 매번 노출하면 attention noise가 된다.

필요한 경우 subtle inline state만 사용한다.

---

## 17.40 Save Error Feedback

저장 실패는 성공과 다르게 명확히 표시한다.

예:

```text
Couldn't save changes.      Retry
```

텍스트 draft가 위험한 경우 해당 editor에 inline feedback을 우선한다.

---

## 17.41 Error Priority

사용자에게 즉시 action이 필요한 오류를 우선한다.

예:

```text
1. Unsaved text
2. Permission error
3. Upload failure
4. transient background retry
```

단순 background retry 중에는 즉시 큰 Toast를 띄울 필요가 없다.

---

## 17.42 Validation Feedback

Validation error는 해당 입력 근처에서 보여준다.

예:

```text
Reminder time has already passed
```

을 화면 하단 Toast만으로 보여주지 않는다.

---

## 17.43 Permission Feedback

권한 상실:

```text
You no longer have permission to edit this task.
```

같은 명확한 feedback을 제공한다.

필요하면 editor를 read-only 상태로 전환한다.

---

## 17.44 Conflict Feedback

동시 편집 충돌:

```text
This task changed on another device.
```

등으로 알린다.

텍스트 draft가 있으면:

```text
Keep mine
Review changes
```

같은 recovery flow로 확장 가능하다.

---

## 17.45 Offline Feedback

Offline 상태에서 local queue에 저장되었다면:

```text
Saved offline
```

또는 subtle offline indicator를 제공할 수 있다.

매 mutation마다 반복 Toast를 띄우지 않는다.

---

## 17.46 Reconnected Feedback

네트워크 복구 후 pending mutation sync가 완료되면 필요 시:

```text
Back online
```

정도의 짧은 feedback을 제공할 수 있다.

대량 Toast는 피한다.

---

## 17.47 Action-specific Message

Toast는 가능한 한 사용자가 방금 한 일을 명확히 말한다.

좋음:

```text
Task deleted
Moved to Work
Checklist converted
Link copied
```

나쁨:

```text
Success
Done
Action completed
```

---

## 17.48 Dynamic Entity Name

Task title을 Toast에 넣을 수 있다.

예:

```text
“Weekly Meeting” deleted
```

하지만 긴 title은 truncate한다.

민감한 content를 시스템 notification처럼 과도하게 노출하지 않는다.

---

## 17.49 Toast Action Label

Undo 가능한 경우 action label은:

```text
Undo
```

처럼 짧고 일관되게 한다.

```text
Restore it now
Go back
Reverse
```

등 action마다 다른 표현을 사용하지 않는다.

---

## 17.50 Toast Close

사용자가 직접 Toast를 닫을 수 있게 할 수 있다.

Close했다고 Undo data가 즉시 영구 삭제될 필요는 없다.

단 visible Undo affordance는 사라진다.

---

## 17.51 Hover Pause

Desktop에서 Toast에 hover/focus 중이면 auto-dismiss timer를 잠시 멈출 수 있다.

Undo 버튼을 클릭하려는데 Toast가 사라지는 문제를 줄인다.

---

## 17.52 Keyboard Focus

Toast가 나타났다고 현재 editor focus를 자동 빼앗지 않는다.

```text
typing
↓ Toast appears
focus remains editor
```

---

## 17.53 Keyboard Access to Toast

Toast action은 Tab/keyboard로 접근 가능해야 한다.

하지만 Toast가 나타날 때 강제로 focus 이동하지 않는다.

---

## 17.54 Screen Reader Announcement

중요 feedback은 live region을 통해 announce할 수 있다.

예:

```text
Task deleted. Undo available.
```

너무 잦은 silent success까지 모두 announce해 screen reader를 과부하시키지 않는다.

---

## 17.55 `aria-live` Priority

일반 status:

```text
polite
```

심각한 blocking error는 상황에 따라 더 높은 priority를 고려할 수 있다.

---

## 17.56 Undo Countdown Accessibility

Undo 남은 시간을 초 단위로 계속 읽어주는 방식은 피한다.

시각적 timer가 있더라도 screen reader에 과도한 live update를 보내지 않는다.

---

## 17.57 Reduced Motion

Toast enter/exit animation은 Reduced Motion 환경에서 최소화한다.

기능적으로는 동일하게 동작한다.

---

## 17.58 Toast Animation

기본 motion은 짧고 subtle하게 한다.

```text
fade / slight translate
```

과도한 bounce/scale animation을 사용하지 않는다.

정확한 timing은 Visual System에서 확정한다.

---

## 17.59 Duplicate Feedback Suppression

같은 오류가 빠르게 반복될 때 Toast를 무한 생성하지 않는다.

예:

```text
autosave failure
autosave retry failure
autosave retry failure
```

한 개의 persistent error state를 update하는 편이 낫다.

---

## 17.60 Error Deduplication

Feedback layer는 error key를 기준으로 같은 이벤트를 합칠 수 있다.

예:

```text
task:123:title-save-error
```

---

## 17.61 Success Deduplication

여러 Task를 빠르게 삭제할 때:

```text
Task deleted
Task deleted
Task deleted
```

대신 필요하면:

```text
3 tasks deleted                 Undo
```

처럼 batch action에서는 aggregate feedback을 사용할 수 있다.

단 서로 독립 action이면 개별 Undo semantics를 보존해야 한다.

---

## 17.62 Bulk Actions

향후 multi-select:

```text
Delete 5 tasks
```

는 하나의 transaction + 하나의 Undo token으로 처리할 수 있다.

Toast:

```text
5 tasks deleted                 Undo
```

---

## 17.63 Undo Conflict

Undo하려는 이전 상태가 이후 mutation과 충돌할 수 있다.

예:

```text
Move A → Work
↓
다른 device에서 A → Personal
↓
Undo Move
```

무조건 Study로 덮어쓰면 remote 최신 의도를 파괴할 수 있다.

Undo도 current revision/precondition을 검증한다.

---

## 17.64 Conflict-aware Undo

Undo 실행 전:

```text
entity exists?
expected revision?
required parent/list still exists?
```

를 확인한다.

불가능하면:

```text
Couldn't undo because the task changed.
```

처럼 명확한 feedback을 준다.

---

## 17.65 Undo after Parent/List Deletion

Move Undo에서 원래 List가 이미 삭제됐다면 복원이 불가능할 수 있다.

Fallback을 임의 적용하지 않는다.

사용자에게 conflict를 알리고 안전한 alternative를 제공할 수 있다.

---

## 17.66 Undo after Task Delete Elsewhere

Undo 대상 Task가 다른 device에서 permanent delete/permission loss 상태가 됐다면 local UI만 복구하지 않는다.

Server authority를 따른다.

---

## 17.67 Toast and Browser Navigation

View를 이동해도 global Toast는 남은 duration 동안 유지될 수 있다.

예:

```text
Task deleted
↓ Inbox → Today
Toast Undo still available
```

Undo는 원래 Task/domain mutation을 대상으로 한다.

---

## 17.68 Toast and Task Detail Close

Detail이 닫혀도 Toast feedback은 App Shell layer에 남아 있어야 한다.

---

## 17.69 Toast and Modal

Modal이 열린 경우 Toast를 modal 위에 표시할지 정책이 필요하다.

기본:

- Modal action 결과가 Toast라면 Modal close 후 Toast
- unrelated background Toast는 modal interaction을 방해하지 않게 함

Layer System에서 최종 확정한다.

---

## 17.70 Feedback Store

권장 architecture:

```ts
type FeedbackItem = {
  id: string;

  type:
    | "success"
    | "info"
    | "warning"
    | "error";

  message: string;

  action?: {
    label: string;
    execute: () => void;
  };

  dedupeKey?: string;
  duration?: number | null;
};
```

실제 callback은 serializable command reference로 구현할 수도 있다.

---

## 17.71 Undo Store

Feedback와 Undo history는 개념적으로 분리한다.

```text
Feedback Store
→ 무엇을 보여줄지

Undo History
→ 무엇을 되돌릴 수 있는지
```

Toast가 사라졌다고 반드시 Undo history가 즉시 사라질 필요는 없다.

---

## 17.72 Command Result Integration

Command는:

```text
success
undo token
error
```

를 반환할 수 있다.

Feedback layer가 이를 받아 UI를 구성한다.

Feature component가 직접 Toast DOM을 생성하지 않는다.

---

## 17.73 Central Feedback API

개념:

```ts
showFeedback({
  type,
  message,
  action,
  dedupeKey
});
```

또는 command bus/event system.

모든 feature가 제각각 Toast component를 만들지 않는다.

---

## 17.74 Undo API

개념:

```ts
registerUndo(undoToken);
undo(undoTokenId);
```

Global shortcut에서는:

```ts
undoLatest();
```

를 사용할 수 있다.

---

## 17.75 Undo Idempotency

같은 Undo token을 두 번 실행해 domain mutation이 두 번 일어나지 않게 한다.

```text
Undo once
→ success

Undo again
→ no-op / unavailable
```

---

## 17.76 Toast Action Pending

Undo 실행 중에는 같은 Undo 버튼을 반복 클릭하지 못하게 한다.

필요하면:

```text
Undoing...
```

state 또는 pending guard를 사용한다.

---

## 17.77 Undo Failure

Undo persistence 실패:

```text
Couldn't undo. Retry
```

를 제공할 수 있다.

UI만 복구됐는데 server는 원래 상태인 split-brain을 방지한다.

---

## 17.78 Optimistic Undo

Undo도 optimistic하게 즉시 UI에 반영 가능하다.

실패 시 원래 action state로 재복구하고 error feedback을 제공한다.

---

## 17.79 Activity History vs Undo

Activity History는 기록이고 Undo는 mutation reversal이다.

```text
History
≠
Undo stack
```

Activity log의 과거 모든 항목을 무조건 Undo 가능하게 만들 필요는 없다.

---

## 17.80 Trash vs Undo

Task Delete:

```text
Toast Undo
→ 단기 즉시 복구

Trash
→ 장기 복구
```

두 기능은 보완 관계다.

V1에 Trash가 없더라도 soft-delete 구조는 향후 추가를 허용한다.

---

## 17.81 Feedback Copy Guidelines

Feedback 문구는 짧고 구체적으로 작성한다.

권장:

```text
Task deleted
Moved to Work
Upload failed
Couldn't save changes
```

지양:

```text
Your operation has been successfully completed.
An unexpected error has occurred while processing your request.
```

---

## 17.82 No Blame Language

Error는 사용자 탓으로 표현하지 않는다.

예:

```text
Couldn't upload this file.
```

처럼 문제와 해결 action에 집중한다.

---

## 17.83 Error Recovery Action

가능하면 오류는 다음 행동을 함께 제공한다.

예:

```text
Couldn't save changes        Retry
Upload failed                Retry
No permission                View only
Conflict detected            Review
```

---

## 17.84 Persistent Errors

사용자 action 없이 해결되지 않는 error는 auto-dismiss하지 않는다.

예:

```text
Unsaved description
Upload failed
Permission lost
```

해결되거나 사용자가 dismiss하기 전까지 relevant surface에 남겨둘 수 있다.

---

## 17.85 Transient Errors

일시적인 background retry가 자동으로 해결되면 별도 error를 장기간 남길 필요 없다.

---

## 17.86 Network Recovery

자동 retry가 성공하면 기존 error indicator를 제거한다.

새로운 “Saved successfully” Toast를 굳이 추가하지 않는다.

---

## 17.87 Prohibited Patterns

- 모든 성공 action마다 Toast 띄우기
- Toast만으로 input validation 전달
- Undo가 UI만 되돌리고 persistence는 그대로 유지
- Transaction action의 일부 entity만 Undo
- 같은 Undo token을 여러 번 실행 가능하게 방치
- Toast가 나타날 때 editor focus 강제 이동
- 여러 Toast를 무제한 stack
- 모든 Toast를 동일 timeout으로 강제
- error Toast를 자동 dismiss해 unsaved 상태 숨기기
- 완료/체크처럼 쉽게 직접 되돌릴 수 있는 action마다 무조건 Undo Toast
- Feature component마다 별도 Toast 시스템 구현
- Toast DOM 안에 domain rollback 로직 직접 구현
- stale Undo가 최신 remote/local mutation을 무조건 덮어쓰기
- Delete Undo 제공하면서 file/data를 즉시 physical delete
- `Success`, `Done` 같은 모호한 feedback 문구 남발
- screen reader에 모든 사소한 autosave 성공을 live announce

---

## 17.88 Acceptance Criteria

### Feedback Strategy

- [ ] Silent success / Inline / Toast / Dialog를 구분한다.
- [ ] 일반 autosave 성공은 quiet하게 처리한다.
- [ ] Validation은 관련 입력 근처에서 보여준다.
- [ ] Destructive/structural action에는 필요한 Undo feedback을 제공한다.
- [ ] 오류는 복구 action과 함께 제공할 수 있다.

### Undo

- [ ] Undo가 Domain/Store/Persistence 전체를 복원한다.
- [ ] Undo가 새로운 mutation으로 처리될 수 있다.
- [ ] Pending mutation 중에도 Undo가 가능하다.
- [ ] Undo가 mutation ordering을 따른다.
- [ ] Transaction action을 atomic하게 Undo한다.
- [ ] 동일 Undo를 중복 실행하지 않는다.

### Action-specific Undo

- [ ] Complete를 Undo할 수 있다.
- [ ] Delete/Subtree Delete를 Undo할 수 있다.
- [ ] Move/Reparent/Indent/Outdent를 Undo할 수 있다.
- [ ] Description ↔ Checklist conversion을 Undo할 수 있다.
- [ ] CheckItem → Subtask conversion을 Undo할 수 있다.
- [ ] Attachment Delete를 Undo 가능한 lifecycle로 처리할 수 있다.

### Toast

- [ ] Toast는 App Shell feedback layer에 렌더된다.
- [ ] Toast가 현재 editor focus를 뺏지 않는다.
- [ ] Toast action은 keyboard로 접근 가능하다.
- [ ] Hover/focus 시 auto-dismiss를 안전하게 처리할 수 있다.
- [ ] Multiple Toast를 제한된 stack/queue로 관리한다.
- [ ] 각 Toast Undo가 해당 mutation만 대상으로 한다.

### Errors

- [ ] Save/Upload/Permission/Conflict 오류를 구분할 수 있다.
- [ ] persistent unsaved error를 자동으로 숨기지 않는다.
- [ ] duplicate error feedback을 dedupe할 수 있다.
- [ ] Undo 실패를 별도로 처리할 수 있다.
- [ ] Conflict-aware Undo precondition을 검증할 수 있다.

### Accessibility

- [ ] 중요한 Toast를 screen reader에 announce할 수 있다.
- [ ] 모든 사소한 success를 과도하게 announce하지 않는다.
- [ ] Undo button에 명확한 accessible label이 있다.
- [ ] Reduced Motion 환경에서 Toast animation을 줄인다.
- [ ] Color만으로 feedback severity를 전달하지 않는다.

### Architecture

- [ ] Feedback Store와 Undo History를 분리할 수 있다.
- [ ] Command Result가 feedback/undo token을 반환할 수 있다.
- [ ] 공통 feedback API를 사용한다.
- [ ] Feature component가 직접 rollback/Toast business logic을 소유하지 않는다.
- [ ] Undo architecture가 향후 global Undo/Redo로 확장 가능하다.

---

# 18. Keyboard & Focus System

## 18.1 Purpose

Keyboard & Focus System은 Task Detail 안의 모든 interaction이 서로 충돌하지 않도록 하는 공통 입력 규칙이다.

핵심 목표:

```text
Mouse
Keyboard
IME
Screen Reader
```

모두에서 같은 기능 구조를 사용할 수 있어야 한다.

특히 다음 우선순위를 명확히 한다.

```text
Text Editing
> Local Popover/Menu
> Task Detail
> Global App Shortcut
```

---

## 18.2 Core Principle

Keyboard event는 현재 focus context를 기준으로 해석한다.

같은 key라도 context에 따라 의미가 달라질 수 있다.

예:

```text
Enter

Task row focus
→ Detail open

Title editor
→ Title commit

Description editor
→ New paragraph

Menu
→ Current item execute
```

따라서 전역 `keydown` 하나에서 모든 key를 처리하지 않는다.

---

## 18.3 Focus Is Separate from Selection

다음 세 상태를 구분한다.

```text
selectedTaskId
focusedElement / focusedTaskId
editingField
```

예:

```text
Task A selected
Task B row focused
Title editor not active
```

도 가능하다.

Focus 이동만으로 `selectedTaskId`를 자동 변경하지 않는다.

---

## 18.4 Focus Regions

Task Detail 내부의 주요 focus region:

```text
1. Property Header
2. Title
3. Description / Checklist
4. Subtasks
5. Organization properties
6. Attachments
7. More Actions
8. Close button
```

정확한 DOM 순서는 시각적 순서와 최대한 일치시킨다.

---

## 18.5 Default Focus on Detail Open

Task row click으로 Detail을 열었을 때:

```text
Title auto-focus ❌
Description auto-focus ❌
```

Mouse interaction이라면 focus는 클릭 origin 또는 Detail의 안정적인 container에 남길 수 있다.

Keyboard `Enter`로 Task를 연 경우에는 Detail 내부 첫 meaningful control로 focus를 이동할 수 있다.

권장:

```text
Keyboard open
→ Complete control 또는 Detail heading region
```

단 실제 focus order는 accessibility audit로 조정한다.

---

## 18.6 Focus Trap

Desktop Task Detail은 Modal이 아니다.

따라서:

```text
focus trap ❌
```

사용자는 Tab으로 Detail 밖 Main View/Sidebar로 이동할 수 있어야 한다.

Modal/Preview/Dialog만 focus trap을 사용한다.

---

## 18.7 Tab Order

Task Detail의 Tab 순서는 DOM/visual order와 일치해야 한다.

권장 흐름:

```text
Complete
Date
Priority
Title
Description
Checklist/Subtasks controls
Tags/List
Attachments
More
Close
```

실제 항상 노출되는 control만 focus sequence에 포함한다.

---

## 18.8 Progressive Controls

Hover 때만 보이는 drag handle/More icon이 있다면 keyboard focus로도 접근 가능해야 한다.

즉:

```text
mouse hover only control ❌
```

Focus-within 시 동일 control을 노출한다.

---

## 18.9 Shift + Tab

Tab과 역순으로 이동한다.

Popover/menu가 닫힌 상태에서는 자연스럽게 Detail 밖 이전 focusable element로 이동 가능하다.

---

## 18.10 Arrow Keys in Task Lists

Main View Task row navigation:

```text
Arrow Up
→ previous visible Task focus

Arrow Down
→ next visible Task focus
```

Focus만 이동한다.

```text
selectedTaskId 변경 ❌
Detail 내용 자동 교체 ❌
```

---

## 18.11 Enter on Focused Task Row

```text
Task row focused
↓ Enter
selectTask(taskId)
↓
Detail open / switch
```

---

## 18.12 Space on Task Row

Space의 기본 의미는 browser/accessibility convention과 충돌할 수 있다.

권장:

- Row 자체에 Space를 complete shortcut으로 쓰지 않음
- Checkbox에 focus됐을 때 Space → toggle

즉 accidental completion을 줄인다.

---

## 18.13 Checkbox Keyboard

Task/CheckItem checkbox:

```text
Space
→ toggle

Enter
→ optional same action
```

native checkbox semantics를 우선한다.

---

## 18.14 Enter in Title

Title Editor:

```text
Enter
→ commit
→ editing exit
```

IME composition 중에는 commit하지 않는다.

---

## 18.15 Enter in Description

Description:

```text
Enter
→ paragraph/list item
Shift+Enter
→ soft line break
```

global Task open/complete shortcut으로 해석하지 않는다.

---

## 18.16 Enter in CheckItem

Checklist Item:

```text
Enter
→ current item commit
→ next item
```

IME composition 중에는 새 Item을 만들지 않는다.

---

## 18.17 Escape Global Priority

Esc는 가장 안쪽 temporary layer부터 닫는다.

권장 우선순위:

```text
1. IME/editor temporary state
2. Slash menu / Link editor / inline sub-popup
3. Popover
4. Context menu
5. Attachment preview / non-modal overlay
6. Editor cancel / focus exit
7. Task Detail
```

Modal이 열려 있으면 Modal의 Esc rule이 더 높은 layer에서 처리된다.

---

## 18.18 Escape Must Not Cascade

한 번의 Esc keypress로 여러 layer를 동시에 닫지 않는다.

예:

```text
Priority Popover open
↓ Esc
Priority Popover만 close
```

같은 event가 bubbling되어 Detail까지 닫히면 안 된다.

---

## 18.19 Editor Esc

Title:

```text
dirty uncommitted draft
→ cancel draft
→ Detail 유지
```

Description:

- Slash/Link popup이 있으면 popup close
- 일반 editing에서는 focus exit 또는 no-op 정책
- Detail close는 다음 Esc에서 실행

정확한 editor-specific rule은 해당 chapter를 따른다.

---

## 18.20 Global Shortcut Suppression in Text Editors

다음 context에서는 앱 단일-key shortcut을 막는다.

```text
input
textarea
contenteditable
editor composing
```

예:

```text
P
T
1
```

등이 실제 text 입력으로 처리되어야 한다.

---

## 18.21 Modifier Shortcuts in Editors

Text editor 안에서도 다음은 editor native semantics를 우선한다.

```text
Cmd/Ctrl + A
Cmd/Ctrl + C
Cmd/Ctrl + V
Cmd/Ctrl + X
Cmd/Ctrl + Z
Cmd/Ctrl + Shift + Z
Cmd/Ctrl + B
Cmd/Ctrl + I
```

앱 전역 command가 가로채지 않는다.

---

## 18.22 App-level Undo Shortcut

Text editor focus가 없을 때:

```text
Cmd/Ctrl + Z
→ latest app-level Undo
```

Editor focus 중에는:

```text
→ editor-local Undo
```

17장 Undo 구조와 연결한다.

---

## 18.23 Redo Shortcut

지원 시:

```text
Cmd/Ctrl + Shift + Z
```

또는 플랫폼 native mapping.

Windows 환경에서 필요하면:

```text
Ctrl + Y
```

도 고려할 수 있다.

---

## 18.24 Complete Shortcut

Task Detail 또는 row에서 Complete keyboard shortcut을 제공할 수 있다.

다만 정확한 키는 기존 App shortcut 충돌 audit 후 결정한다.

중요한 것은:

```text
shortcut
→ completeTask(taskId)
```

같은 공통 command를 호출한다는 점이다.

---

## 18.25 Priority Shortcut

Priority direct shortcut도 동일.

예시 가능성:

```text
1 = High
2 = Medium
3 = Low
0 = None
```

하지만 editor focus 중에는 사용하지 않는다.

정확한 mapping은 TickTick fidelity audit 이후 확정 가능하다.

---

## 18.26 Date Shortcut

Today/Tomorrow/No Date 같은 direct shortcut을 지원할 수 있다.

예:

```text
T → Today
```

하지만 text input과 충돌하므로:

- non-editing context에서만
- app shortcut registry를 통해

사용한다.

---

## 18.27 Shortcut Registry

권장:

```ts
type KeyboardShortcut = {
  id: string;
  keys: string[];
  context: string[];

  isEnabled(state): boolean;
  execute(): void;
};
```

기능별 component가 `window.addEventListener("keydown")`를 제각각 등록하지 않는다.

---

## 18.28 Shortcut Context

예:

```text
global
task-list
task-detail
editor
menu
modal
```

현재 context 우선순위가 높은 shortcut이 먼저 해석된다.

---

## 18.29 Shortcut Collision

같은 key가 여러 context에 등록되어 있다면 deterministic priority가 필요하다.

권장:

```text
Modal
> Menu/Popover
> Editor
> Detail
> Main View
> Global
```

---

## 18.30 Command Reuse

Keyboard shortcut은 UI button click과 별도 business logic을 갖지 않는다.

예:

```text
keyboard complete
button complete
context menu complete
```

모두:

```ts
completeTask(taskId)
```

를 호출한다.

---

## 18.31 Menu Keyboard

Context/More menu:

```text
Arrow Up/Down
→ item 이동

Home
→ first item

End
→ last item

Enter/Space
→ execute

Arrow Right
→ submenu

Arrow Left
→ submenu close

Esc
→ menu close
```

standard menu semantics를 따른다.

---

## 18.32 Popover Keyboard

Date/Reminder/Tag/Priority Popover는 각각 내부 widget semantics를 따른다.

공통:

```text
Esc
→ close current popover

Tab
→ focus 이동

Shift+Tab
→ reverse
```

필요한 경우 roving tabindex를 사용한다.

---

## 18.33 Calendar Keyboard

Date picker:

```text
Arrow keys
→ 날짜 이동

Page Up/Down
→ month 이동 가능

Home/End
→ week boundary 가능

Enter/Space
→ date select

Esc
→ picker close
```

정확한 mapping은 사용하는 calendar primitive의 접근성 표준을 따른다.

---

## 18.34 Tag Multi-select Keyboard

```text
Arrow Up/Down
→ option 이동
Enter/Space
→ toggle
Esc
→ close
```

한 option 선택 후 focus를 잃지 않는다.

---

## 18.35 Focus Restoration from Popover

Popover를 닫으면 focus는 해당 trigger로 돌아간다.

예:

```text
Priority trigger
→ Popover
→ Esc
→ Priority trigger focus
```

---

## 18.36 Focus Restoration after Dialog

Confirmation/Scope dialog close:

```text
Cancel
→ original trigger

Confirm + Detail remains
→ relevant stable control

Confirm + Detail closes
→ Main View origin row / stable anchor
```

---

## 18.37 Focus Restoration after Task Detail Close

3장의 rule:

```text
Detail close
→ originating Task row
```

가능하면 focus 복원.

Task row가 query에서 사라졌다면:

```text
next visible row
→ previous row
→ Main View heading
```

순으로 fallback한다.

---

## 18.38 Focus after Delete

Selected Task delete:

```text
Detail closes
```

삭제된 row는 존재하지 않으므로:

```text
next sibling/visible Task
→ previous
→ Main View anchor
```

로 focus를 보낸다.

---

## 18.39 Focus after Complete-and-hide

완료로 row가 Main View에서 사라져도 Detail은 유지되므로 focus를 강제로 Main View로 보내지 않는다.

현재 interaction context가 Detail이면 Detail focus를 유지한다.

---

## 18.40 Focus after Subtask Navigation

Parent → Child:

```text
same Detail Pane
```

Detail content가 교체된다.

Keyboard navigation으로 진입한 경우 Child Detail의 heading/first control로 focus를 안정적으로 옮긴다.

Mouse click이면 pointer interaction을 존중한다.

---

## 18.41 Focus after Browser Back

Task B → Back → Task A:

Detail Pane은 유지되고 content가 A로 바뀐다.

Focus가 사라진 DOM node에 남지 않게:

```text
Task Detail heading / equivalent stable anchor
```

로 복원할 수 있다.

---

## 18.42 Focus after Sort/Filter

selected Task row가 이동하거나 사라져도 현재 Detail focus는 유지한다.

Main View focus가 해당 row에 있었는데 row가 사라지면 nearest visible item으로 보정한다.

---

## 18.43 Focus and Drag

Drag handle이 focusable할 경우:

```text
Space/Enter
→ keyboard drag mode
```

같은 패턴을 사용할 수 있다.

대안으로:

```text
Move Up
Move Down
Indent
Outdent
```

menu action을 제공해도 된다.

중요한 것은 mouse drag만 유일한 수단이 아니어야 한다.

---

## 18.44 Keyboard Reorder

Checklist/Subtask reorder는 명시적 shortcut 또는 action menu로 지원한다.

예:

```text
Alt/Option + Arrow Up/Down
```

정확한 binding은 global conflict audit 후 정한다.

---

## 18.45 Focus Visible

Keyboard focus는 항상 시각적으로 식별 가능해야 한다.

```text
outline
focus ring
surface emphasis
```

중 하나 이상 사용한다.

`outline: none` 후 대체 focus indicator를 제공하지 않는 패턴은 금지한다.

---

## 18.46 Mouse vs Keyboard Focus

`:focus-visible` 같은 semantics를 사용해 mouse click에는 과도한 ring을 줄이고 keyboard focus에는 명확한 표시를 제공할 수 있다.

---

## 18.47 Focus Color Is Not Enough

Focus indication을 색상 변화 하나에만 의존하지 않는다.

outline/shape/background contrast를 함께 사용할 수 있다.

---

## 18.48 Roving Tabindex

List/Menu/Grid처럼 항목이 많은 영역은 roving tabindex를 사용할 수 있다.

예:

```text
one item tabindex=0
others tabindex=-1
```

Arrow navigation과 Tab stop 과다 문제를 줄인다.

---

## 18.49 When Not to Use Roving Tabindex

일반 text fields, buttons, links까지 억지로 하나의 composite widget으로 묶지 않는다.

Native Tab semantics가 더 적합한 곳은 그대로 사용한다.

---

## 18.50 IME State

전역 keyboard manager는:

```text
event.isComposing
```

또는 composition state를 확인한다.

IME 중:

```text
global shortcuts
Enter action
Slash command
```

을 실행하지 않는다.

---

## 18.51 Composition Event Ownership

각 editor primitive가 composition state를 관리할 수 있지만 global shortcut layer도 방어적으로 `isComposing`을 확인한다.

---

## 18.52 Key Repeat

키를 누르고 있을 때 browser key repeat가 발생한다.

다음처럼 destructive action이 반복 실행되지 않게 한다.

```text
Delete Task
Duplicate
Complete
```

필요하면:

```text
event.repeat
```

을 체크한다.

Arrow navigation은 repeat 허용 가능하다.

---

## 18.53 Modifier Normalization

Mac:

```text
Meta
```

Windows/Linux:

```text
Control
```

을 abstract하여:

```text
PrimaryModifier
```

로 다룬다.

UI shortcut label도 플랫폼에 맞춰 표시할 수 있다.

---

## 18.54 Shortcut Labels

Menu/Tooltip에서 shortcut을 보여줄 수 있다.

예:

```text
Undo          ⌘Z
```

Windows:

```text
Undo          Ctrl+Z
```

하드코딩된 Mac symbol을 모든 플랫폼에 표시하지 않는다.

---

## 18.55 Browser Reserved Shortcuts

브라우저/OS 기본 shortcut을 과도하게 override하지 않는다.

예:

```text
Cmd/Ctrl+L
Cmd/Ctrl+T
Cmd/Ctrl+W
```

같은 core browser shortcut은 앱에서 가로채지 않는다.

---

## 18.56 Accessibility Shortcut Conflicts

Screen reader/assistive technology가 사용하는 key 조합과 충돌할 수 있으므로 단일 문자 shortcut은 opt-in 또는 non-editing context로 제한한다.

---

## 18.57 Mobile Keyboard

모바일에서는 physical keyboard가 없을 수 있지만 external keyboard 사용을 막지 않는다.

On-screen keyboard open 시 Detail layout이 깨지지 않아야 한다.

---

## 18.58 Mobile Focus Scroll

Title/Description input focus 시 virtual keyboard로 인해 field가 가려지지 않게 scroll into view를 지원한다.

Property Header가 과도하게 영역을 가리지 않게 한다.

---

## 18.59 Focus after Virtual Keyboard Close

키보드가 닫혔다고 Detail selection/focus state를 임의 초기화하지 않는다.

---

## 18.60 Modal Focus Trap

Modal/confirmation/Attachment Preview가 실제 Modal semantics라면:

```text
focus enters modal
Tab cycles inside
Esc closes if allowed
close → origin focus restore
```

를 사용한다.

Task Detail 자체에는 적용하지 않는다.

---

## 18.61 Inert Background for Modal

Modal open 동안 background interaction을 막아야 한다면 `inert` 또는 동등한 semantics를 사용한다.

단 Popover에는 전체 앱을 inert 처리하지 않는다.

---

## 18.62 Screen Reader Focus

Task Detail open/Task switch 시 screen reader에게 현재 Task context가 바뀌었음을 전달할 수 있다.

과도한 live announcement로 typing을 방해하지 않는다.

---

## 18.63 Detail Heading

Task Title 또는 별도 hidden heading을 Detail region의 accessible heading으로 사용할 수 있다.

Landmark/region label:

```text
Task details
```

등을 제공한다.

---

## 18.64 Shortcut Help

Shortcut이 많아질 경우:

```text
Keyboard shortcuts
```

help surface를 제공할 수 있다.

V1 필수는 아니지만 registry metadata로 자동 문서화할 수 있게 한다.

---

## 18.65 Shortcut Discoverability

중요 shortcut은:

```text
tooltip
menu label
help dialog
```

중 하나에서 발견 가능해야 한다.

암기해야만 쓸 수 있는 기능으로 만들지 않는다.

---

## 18.66 Focus Debugging

개발 모드에서:

```text
activeElement
selectedTaskId
activePopover
editingField
```

를 로깅/inspect 가능하게 하면 복잡한 focus bug를 찾기 쉽다.

Production UI에는 노출하지 않는다.

---

## 18.67 Central Focus Utilities

권장 API:

```ts
focusTaskRow(taskId)
focusTaskDetail(taskId)
restoreFocus(origin)
focusNextVisibleTask()
focusPreviousVisibleTask()
```

feature component가 임의 selector/querySelector로 focus를 찾아다니지 않는다.

---

## 18.68 Focus Origin Tracking

Popover/Dialog/Detail open 시 origin ref를 저장할 수 있다.

```ts
focusOrigin
```

close 후 정확한 trigger로 복원하기 위함이다.

DOM node가 사라졌다면 fallback rule을 사용한다.

---

## 18.69 Stable Focus IDs

Task row, property trigger 등 주요 interactive element에는 stable focus target identifier를 사용할 수 있다.

Task sort/filter 변경으로 DOM 위치가 달라져도 복원이 가능하다.

---

## 18.70 Focus after Optimistic Reorder

Task/Subtask/CheckItem reorder 후 focus는 이동된 entity를 따라간다.

DOM index 기준 focus를 유지해 엉뚱한 row로 가면 안 된다.

---

## 18.71 Focus after Rollback

Optimistic action 실패로 item 위치가 원복되어도 focus는 가능하면 같은 entity에 유지한다.

---

## 18.72 Focus after Error

Error Toast가 나타나도 focus를 빼앗지 않는다.

Inline validation이 발생한 경우 필요하면 해당 field와 오류를 accessibility relation으로 연결한다.

---

## 18.73 Disabled Controls

Disabled control은 keyboard로 실행되지 않아야 한다.

왜 disabled인지 설명이 필요한 경우 tooltip/help text를 제공한다.

---

## 18.74 Hidden Controls

`display:none`/unmounted control은 Tab order에 남지 않는다.

Popover 닫혔는데 내부 item이 focusable한 상태로 남아서는 안 된다.

---

## 18.75 Nested Interactive Elements

Button 안에 또 Button을 넣는 등 invalid nested interactive markup을 피한다.

Task row neutral click 영역과 child controls는 semantic DOM으로 분리한다.

---

## 18.76 Enter Event Bubbling

Title Enter가 commit된 뒤 부모 Task row의 Enter handler까지 실행되어 Detail navigation이 중복 발생하면 안 된다.

Context-specific handler가 event propagation을 적절히 관리한다.

---

## 18.77 Space Event Bubbling

Checkbox Space toggle이 row keyboard handler까지 전달되어 두 action이 실행되지 않게 한다.

---

## 18.78 Pointer Focus Behavior

Mouse로 icon/button을 클릭했을 때 keyboard focus도 일반적으로 해당 control로 이동하게 native behavior를 존중한다.

불필요하게 `preventDefault()`하여 focus가 사라지지 않게 한다.

---

## 18.79 PreventDefault 최소화

Keyboard/Pointer handler는 실제로 browser default behavior를 대체할 때만 `preventDefault()`한다.

무분별한 preventDefault는 IME/accessibility/scroll을 깨뜨릴 수 있다.

---

## 18.80 Global Listener Cleanup

Shortcut manager가 route/component 변경마다 global keydown listener를 중복 등록하지 않게 한다.

Centralized listener 또는 lifecycle-safe hook을 사용한다.

---

## 18.81 Performance

Keydown마다 전체 Task tree/search index를 무겁게 계산하지 않는다.

Shortcut context/state는 빠른 selector로 평가한다.

---

## 18.82 Testing Matrix

Keyboard QA는 최소 다음 환경을 포함한다.

```text
Windows + Chrome
macOS + Chrome/Safari
Korean IME
Japanese/Chinese IME
Keyboard-only navigation
Screen reader smoke test
```

---

## 18.83 Prohibited Patterns

- Detail open 시 Title/Description auto-focus 강제
- Focus 이동만으로 selectedTaskId 변경
- Desktop Detail에 Modal focus trap 적용
- 한 번의 Esc로 Popover와 Detail을 동시에 닫음
- Text editor focus 중 global single-key shortcut 실행
- IME composition 중 Enter/shortcut 실행
- 모든 component가 독립적으로 window keydown listener 등록
- Browser/OS reserved shortcut 과도하게 override
- Mouse drag만 유일한 reorder 수단 제공
- Popover close 후 focus를 body로 잃어버림
- Task delete 후 존재하지 않는 row에 focus 유지
- `outline:none` 후 대체 focus style 미제공
- Color만으로 focus 표현
- 숨겨진 Popover 내부 control이 Tab order에 남음
- Checkbox/Title child interaction이 Row Enter/Space handler와 중복 실행
- Toast가 나타날 때 current editor focus 강제 이동
- Keyboard shortcut이 UI button과 별도 business logic 사용

---

## 18.84 Acceptance Criteria

### Focus / Selection

- [ ] Focus와 `selectedTaskId`가 분리된다.
- [ ] Arrow row navigation이 Detail을 자동 변경하지 않는다.
- [ ] Enter로 focused Task를 열 수 있다.
- [ ] Detail open 시 editor가 자동 focus되지 않는다.
- [ ] Desktop Detail은 focus trap이 아니다.

### Tab Navigation

- [ ] Tab order가 visual/DOM order와 일치한다.
- [ ] Shift+Tab이 역순으로 동작한다.
- [ ] Hover-only action도 keyboard로 접근 가능하다.
- [ ] 숨겨진 control이 Tab order에 남지 않는다.
- [ ] Focus-visible style이 명확하다.

### Enter / Escape

- [ ] Title Enter가 commit한다.
- [ ] Description Enter가 paragraph를 만든다.
- [ ] CheckItem Enter가 다음 item을 만든다.
- [ ] Esc가 가장 안쪽 layer부터 하나씩 닫는다.
- [ ] 한 keypress로 여러 layer가 동시에 닫히지 않는다.
- [ ] Editor-specific Esc semantics가 전역 Detail close보다 우선한다.

### Editor / IME

- [ ] Text editor focus 중 global shortcut이 typing을 가로채지 않는다.
- [ ] IME composition 중 Enter/Slash/global shortcut이 오작동하지 않는다.
- [ ] Editor-local Undo가 app-level Undo보다 우선한다.
- [ ] Composition 종료 후 정상 shortcut 처리가 재개된다.

### Popover / Menu / Modal

- [ ] Menu를 Arrow/Enter/Esc로 사용할 수 있다.
- [ ] Popover close 후 trigger에 focus가 복원된다.
- [ ] Dialog close 후 origin 또는 안정적 fallback으로 focus가 돌아간다.
- [ ] Modal만 focus trap을 사용한다.
- [ ] Popover는 앱 전체를 inert 처리하지 않는다.

### Task Navigation

- [ ] Detail close 후 origin row에 focus를 복원할 수 있다.
- [ ] origin row가 없으면 next/previous/main anchor fallback을 사용한다.
- [ ] Parent/Subtask navigation 후 focus가 유효한 Detail element로 이동한다.
- [ ] Browser Back으로 Task가 바뀌어도 focus가 orphan DOM에 남지 않는다.
- [ ] Reorder/rollback 후 focus가 같은 entity를 따라간다.

### Shortcut Architecture

- [ ] Central shortcut registry/context system을 사용할 수 있다.
- [ ] Modifier를 플랫폼별로 normalize한다.
- [ ] UI click과 keyboard가 같은 domain command를 호출한다.
- [ ] `event.repeat`가 destructive duplicate action을 만들지 않는다.
- [ ] Reserved browser shortcut을 불필요하게 override하지 않는다.
- [ ] Shortcut discoverability를 tooltip/menu/help로 제공할 수 있다.

### Accessibility

- [ ] Task Detail region에 accessible label/heading이 있다.
- [ ] Focus indicator가 색상만으로 표현되지 않는다.
- [ ] Keyboard-only로 주요 기능을 사용할 수 있다.
- [ ] Screen reader focus/announcement가 과도하지 않다.
- [ ] Drag action에 keyboard/menu 대안이 존재한다.

---

# 19. Popover & Layer System

## 19.1 Purpose

Popover & Layer System은 Task Detail 안에서 사용하는 모든 floating UI의 공통 규칙을 정의한다.

대상:

```text
Date / Schedule Popover
Reminder Popover
Repeat Popover
Priority Popover
Tag Picker
List Picker
More Menu
Context Menu
Slash Command Menu
Link Editor Popover
Tooltip
Attachment Preview
Confirmation Dialog
Toast
```

핵심 목표:

```text
같은 종류의 floating UI
→ 같은 positioning
→ 같은 close semantics
→ 같은 focus semantics
→ 같은 layer rules
```

각 feature가 독자적인 absolute positioning/z-index/outside-click 코드를 만들지 않는다.

---

## 19.2 Layer Categories

앱의 floating surface를 기능별로 나누지 않고 interaction 성격에 따라 분류한다.

```text
Tooltip
Popover
Menu
Context Menu
Overlay / Preview
Modal / Dialog
Toast
```

각 layer type은 공통 behavior contract를 가진다.

---

## 19.3 Structural Layer vs Floating Layer

Task Detail 자체는 floating popover가 아니다.

```text
Task Detail
→ structural pane

Date Picker
→ floating popover
```

따라서:

```text
Task Detail outside click close ❌
Popover outside click close ✅
```

1장의 Shell 원칙과 일치한다.

---

## 19.4 Z-index Scale

임의의 `9999`를 사용하지 않는다.

권장 semantic scale:

```text
App content / shell        0
Structural sticky         20
Tooltip                    80
Popover / dropdown        100
Menu / context menu       120
Overlay / preview         200
Modal / dialog            300
Toast                     400
```

정확한 숫자는 shared design token으로 관리한다.

---

## 19.5 Z-index Token

예:

```ts
const Z = {
  base: 0,
  sticky: 20,
  tooltip: 80,
  popover: 100,
  menu: 120,
  overlay: 200,
  modal: 300,
  toast: 400,
};
```

컴포넌트가 숫자를 직접 하드코딩하지 않는다.

---

## 19.6 Portal

Popover/Menu/Tooltip은 clipping 문제를 피하기 위해 app-level portal root에 렌더하는 것을 권장한다.

예:

```text
<body>
  <App />
  <FloatingLayerRoot />
</body>
```

Task Detail 내부의 `overflow:auto` 때문에 popover가 잘리지 않게 한다.

---

## 19.7 Portal Does Not Break Ownership

DOM은 portal에 있어도 logical owner는 원래 trigger/feature다.

예:

```text
Priority trigger
→ Priority Popover
```

focus restoration / close / taskId context는 유지해야 한다.

---

## 19.8 Anchor

Popover는 반드시 anchor를 가진다.

예:

```text
Priority button
Date trigger
Tag property row
Slash caret position
Context-menu pointer position
```

Popover 위치를 viewport 고정 좌표로 임의 하드코딩하지 않는다.

---

## 19.9 Anchor Types

지원 가능한 anchor:

```text
DOM element
virtual caret rect
pointer coordinates
selection range
```

예:

### Standard Popover

```text
anchor = button element
```

### Slash Menu

```text
anchor = editor caret rect
```

### Context Menu

```text
anchor = pointer x/y
```

---

## 19.10 Positioning Engine

권장:

```text
Floating UI positioning library
또는 공통 internal positioning engine
```

다음 기능을 지원해야 한다.

```text
offset
flip
shift
collision detection
size constraint
arrow(optional)
```

각 feature가 자체 `getBoundingClientRect()` 계산을 반복하지 않는다.

---

## 19.11 Preferred Placement

기본 placement는 feature별로 의미 있게 설정한다.

예:

```text
Date
→ bottom-start

Priority
→ bottom-end / bottom-start

More
→ bottom-end

Tag/List Picker
→ bottom-start

Tooltip
→ top / side

Context menu
→ pointer origin
```

실제 viewport 상황에 따라 flip될 수 있다.

---

## 19.12 Offset

Trigger와 floating surface 사이에는 작은 visual gap을 둔다.

예:

```text
4–8px
```

정확한 값은 Visual System token으로 확정한다.

---

## 19.13 Flip

아래 공간이 부족하면:

```text
bottom
↓ collision
top
```

으로 자동 flip한다.

사용자가 popover 일부를 볼 수 없는 상태를 허용하지 않는다.

---

## 19.14 Shift

좌우 viewport 밖으로 튀어나가면 화면 안쪽으로 shift한다.

```text
right overflow
→ shift left
```

단 anchor와의 관계를 완전히 잃을 정도로 멀리 이동시키지 않는다.

---

## 19.15 Collision Padding

Viewport edge와 최소 여백을 둔다.

예:

```text
8px
```

정확한 값은 token으로 둔다.

---

## 19.16 Max Width / Height

Popover가 viewport보다 커질 수 있으므로:

```text
max-width
max-height
```

를 적용한다.

특히:

```text
List Picker
Tag Picker
Calendar
More Menu
```

에서 중요하다.

---

## 19.17 Internal Scrolling

Popover 내용이 길면 popover 내부 scroll을 허용한다.

예:

```text
Tag Picker
List Picker
```

하지만 불필요한 nested scroll을 피한다.

```text
Popover 전체
→ header fixed(optional)
→ option list scroll
```

---

## 19.18 Viewport Resize

브라우저 resize/Task Detail resize 시 열린 popover 위치를 재계산한다.

Popover가 이전 anchor 좌표에 남아 floating되지 않아야 한다.

---

## 19.19 Scroll Reposition

Task Detail content가 scroll되면 anchor도 이동할 수 있다.

기본:

```text
scroll
→ floating position recompute
```

anchor가 viewport 밖으로 완전히 사라지면 popover를 닫는 정책을 사용할 수 있다.

---

## 19.20 Anchor Hidden

Popover가 열린 상태에서 anchor element가 unmount되면:

```text
Popover close
```

한다.

예:

```text
Task A Priority Popover open
↓ Task switch B
Task A trigger unmount
↓
Popover close
```

stale floating UI를 남기지 않는다.

---

## 19.21 Task Switch

Task switch 시 현재 Task-specific Popover/Menu는 기본적으로 닫는다.

```text
Task A Date Popover
↓ select Task B
Popover close
Detail → B
```

새 Task에 이전 Task의 popover state를 이어붙이지 않는다.

---

## 19.22 Active Floating State

공통 UI state 예:

```ts
type ActiveFloatingLayer =
  | {
      type: "popover";
      id: string;
      ownerTaskId?: string;
      anchorId?: string;
    }
  | {
      type: "menu";
      id: string;
      ownerTaskId?: string;
    }
  | null;
```

실제 구현은 registry/store/context 중 하나를 선택할 수 있다.

---

## 19.23 One Primary Popover at a Time

같은 Task Detail context에서 독립된 primary popover를 여러 개 동시에 열어두지 않는다.

예:

```text
Priority Popover open
↓ Date trigger click
Priority close
Date open
```

단 nested/sub-popover는 예외다.

---

## 19.24 Nested Popover

허용 예:

```text
Schedule Popover
└─ Reminder Sub-popover
```

또는:

```text
More Menu
└─ Move submenu
```

parent-child layer 관계를 명확히 한다.

---

## 19.25 Nested Close

Child popover에서 Esc:

```text
child close
parent 유지
```

다시 Esc:

```text
parent close
```

한 번에 둘 다 닫지 않는다.

---

## 19.26 Outside Click with Nested Layers

Nested child를 클릭한 것은 parent 기준 outside click으로 처리하면 안 된다.

즉 floating tree 전체를 하나의 interaction boundary로 이해한다.

---

## 19.27 Outside Click Definition

Outside click은:

```text
pointer event target
∉ trigger
∉ floating surface
∉ descendant floating surface
```

일 때만 close한다.

---

## 19.28 Pointer Down vs Click

Outside dismissal은 `click`보다 `pointerdown` 기준이 안정적일 수 있다.

하지만 drag/select interaction과 충돌하지 않게 한다.

공통 floating primitive에서 일관되게 구현한다.

---

## 19.29 Trigger Re-click

열린 Popover의 같은 trigger를 다시 클릭하면 기본적으로 toggle close한다.

```text
Priority trigger
→ open

same trigger
→ close
```

Task row selection의 “재클릭해도 Detail 유지” 규칙과는 별개다.

---

## 19.30 Menu Trigger Re-click

More Menu도 같은 trigger 재클릭 시 close 가능하다.

---

## 19.31 Focus on Open

Popover/Menu가 keyboard로 열리면 내부의 첫 meaningful control로 focus를 옮긴다.

Mouse click으로 열 때는 widget semantics에 따라 focus를 내부로 옮기거나 trigger focus를 유지할 수 있다.

접근성 표준을 우선한다.

---

## 19.32 Focus Restoration

Popover/Menu close 후:

```text
original trigger
```

로 focus를 복원한다.

단 trigger가 unmount됐다면 stable fallback을 사용한다.

---

## 19.33 Focus Trap

Popover/Menu에는 modal focus trap을 사용하지 않는다.

Tab으로 자연스럽게 이동 가능해야 한다.

단 composite widget 내부에서는 roving tabindex를 사용할 수 있다.

---

## 19.34 Modal Only

Focus trap / background inert는 Modal/Dialog에만 적용한다.

```text
Confirmation Dialog
Recurring Scope Dialog
Attachment full-screen Preview(Modal semantics일 때)
```

---

## 19.35 Tooltip Semantics

Tooltip은 단순 설명 surface다.

```text
hover / focus
→ show
```

사용자가 tooltip 내부 요소를 클릭해야만 기능을 사용할 수 있게 만들지 않는다.

Interactive content가 필요하면 Popover를 사용한다.

---

## 19.36 Tooltip Delay

Tooltip은 즉시 깜빡이지 않게 짧은 show delay를 사용할 수 있다.

예:

```text
300–500ms
```

정확한 값은 Visual System token.

Keyboard focus에서는 더 빠르게 표시 가능하다.

---

## 19.37 Tooltip Hide

```text
pointer leave
focus leave
Esc(optional)
```

으로 닫는다.

---

## 19.38 Tooltip Z-index

Tooltip이 Popover보다 위에 있어야 하는지 맥락에 따라 달라질 수 있다.

기본적으로 active Popover 안 Tooltip은 해당 layer context 위에 렌더하되 Modal을 넘지 않는다.

Semantic layer token으로 해결한다.

---

## 19.39 Menu Semantics

Menu는 command collection이다.

```text
More Menu
Context Menu
```

option 선택:

```text
execute command
→ menu close
```

단 submenu open은 parent menu 유지.

---

## 19.40 Select / Multi-select Popover

Priority:

```text
single-select
→ 선택 후 close
```

Tags:

```text
multi-select
→ 선택 후 유지
```

Reminder:

```text
multi-select
→ 유지
```

공통 surface를 쓰더라도 close policy는 interaction type에 따라 다르다.

---

## 19.41 Date Popover Close Policy

Date/Time은 여러 property를 이어서 편집할 수 있으므로 single date 선택 후에도 Popover를 유지할 수 있다.

5장에서 정한 semantics를 따른다.

---

## 19.42 Context Menu Anchor

Context Menu는 right-click pointer 위치를 anchor로 사용한다.

```text
x
y
```

viewport collision handling은 일반 menu와 동일하다.

---

## 19.43 Context Menu Selection Independence

Context Menu target:

```ts
contextTargetTaskId
```

는:

```ts
selectedTaskId
```

와 다를 수 있다.

Context Menu를 열기 위해 Task Detail selection을 강제로 변경하지 않는다.

---

## 19.44 Context Menu Reopen

다른 Task를 right-click하면:

```text
old context menu close
new context menu open
contextTargetTaskId update
```

---

## 19.45 Slash Menu Anchor

Slash Menu는 editor caret 위치를 anchor로 사용한다.

Editor scroll/typing으로 caret이 움직이면 필요에 따라 위치를 재계산한다.

---

## 19.46 Slash Menu Width

Slash Menu는 command name/shortcut을 읽을 수 있을 정도의 안정적인 폭을 가지되 editor width 전체를 덮지 않는다.

정확한 token은 Visual System에서 정한다.

---

## 19.47 Link Editor Popover

Selected link/caret에 anchor.

Link editor가 닫힌 후 기존 selection/caret을 복원한다.

10장의 selection bookmark와 통합한다.

---

## 19.48 Popover Header

복잡한 Popover는 title/search/back control을 가질 수 있다.

예:

```text
Reminder
Custom Repeat
Move to List
```

하지만 작은 Priority Menu에 불필요한 header를 넣지 않는다.

---

## 19.49 Back within Popover

모바일/좁은 환경에서 nested submenu를 같은 surface 내 drill-down으로 구현할 수 있다.

예:

```text
Schedule
↓ Reminder
[Back] Reminder
```

Desktop에서는 adjacent submenu가 더 적합할 수 있다.

---

## 19.50 Desktop vs Mobile

Desktop:

```text
anchored popover
submenu
context menu
```

Mobile:

```text
bottom sheet
full-width sheet
drill-down panel
```

로 바뀔 수 있다.

기능 semantics는 동일하게 유지한다.

---

## 19.51 Mobile Bottom Sheet

좁은 화면에서 Date/Reminder/Repeat/Tags/List 같은 복잡한 Popover는 bottom sheet로 전환할 수 있다.

```text
same data
same commands
different presentation
```

별도 business logic을 만들지 않는다.

---

## 19.52 Mobile Sheet Close

```text
Back
Close
Swipe down(optional)
outside backdrop(optional)
```

으로 닫을 수 있다.

Swipe는 유일한 close 방법이 아니어야 한다.

---

## 19.53 Safe Area

Mobile sheet는:

```text
safe-area-inset-bottom
```

등을 고려한다.

버튼이 홈 인디케이터/브라우저 chrome에 가려지지 않게 한다.

---

## 19.54 Virtual Keyboard

모바일에서 input이 있는 Popover/Sheet는 virtual keyboard로 인해 잘리지 않게 한다.

특히:

```text
Tag search
List search
Custom reminder time
```

등.

---

## 19.55 Backdrop

Popover에는 일반적으로 backdrop을 사용하지 않는다.

Modal/Sheet에는 필요할 수 있다.

```text
Popover → backdrop ❌
Modal   → backdrop ✅
```

Mobile bottom sheet는 product style에 따라 subtle backdrop 가능.

---

## 19.56 Dimming

Task Detail property Popover 때문에 App 전체를 dim하지 않는다.

경량 editing 흐름을 유지한다.

---

## 19.57 Border Radius

Floating surfaces는 구조 pane보다 더 명확한 elevation/radius를 사용할 수 있다.

정확한:

```text
radius
border
shadow
```

는 20. Visual System에서 확정한다.

---

## 19.58 Shadow

Popover/Menu는 배경과 구분될 정도의 subtle elevation을 사용한다.

과도한 heavy shadow를 피한다.

Dark mode에서 shadow만으로 separation을 만들지 않고 border/surface contrast를 함께 사용한다.

---

## 19.59 Surface Token

Popover/Menu/Modal은 semantic background token을 사용한다.

```text
surface-popover
surface-modal
```

개별 feature마다 다른 임의 background color를 넣지 않는다.

---

## 19.60 Animation

Popover open/close animation:

```text
short
subtle
non-blocking
```

예:

```text
opacity
small translate/scale
```

정확한 timing은 20장에서 token화한다.

---

## 19.61 No Layout-dependent Animation

Popover가 flip될 때 큰 이동 animation으로 반대편까지 날아가는 느낌을 만들지 않는다.

Positioning은 즉시 안정적으로 보이는 것이 우선이다.

---

## 19.62 Reduced Motion

Reduced Motion에서는 open/close transition을 최소화/제거한다.

---

## 19.63 Pointer Events

닫힌 layer는 pointer event를 받지 않는다.

애니메이션 중 invisible surface가 클릭을 가로채지 않게 한다.

---

## 19.64 Nested Z-index

Nested Popover/Submenu가 parent보다 위에 오도록 layer context를 관리한다.

개별 submenu에서 z-index 숫자를 계속 증가시키는 방식은 피한다.

Floating tree 내 stacking order로 해결한다.

---

## 19.65 Portal and Modal

Modal이 열렸을 때 그 아래 Popover가 계속 interactive하면 안 된다.

Modal open 시 lower-layer floating UI를 닫거나 inert 처리한다.

---

## 19.66 Opening Modal from Popover

예:

```text
More Menu
→ Delete recurring task
→ Scope Dialog
```

순서:

```text
More Menu close
↓
Modal open
```

두 layer가 애매하게 겹쳐 남지 않는다.

---

## 19.67 Opening Popover from Modal

Modal 안에서 Date Picker 같은 Popover가 필요하면 Modal layer context 위에 렌더한다.

단 앱 base popover layer에 잘못 렌더되어 Modal 뒤로 가면 안 된다.

---

## 19.68 Toast Interaction

Toast는 floating feedback layer지만 Popover ownership system과 분리한다.

Popover 밖 클릭했다고 Toast가 닫히는 식으로 연결하지 않는다.

---

## 19.69 Multiple Floating Types

허용 예:

```text
Popover + Tooltip
Modal + Toast
```

하지만:

```text
Priority Popover + Date Popover
```

같은 sibling primary popover 다중 open은 기본적으로 허용하지 않는다.

---

## 19.70 Floating Layer Manager

권장 architecture:

```text
FloatingLayerManager
│
├─ Popover
├─ Menu
├─ Tooltip
├─ ContextMenu
└─ Overlay
```

책임:

```text
active layer registry
outside click
Esc ordering
focus restoration
portal target
stack ordering
```

---

## 19.71 Feature-owned Content

Layer manager는 surface mechanics만 담당한다.

예:

```text
Date Popover content
→ Schedule feature

Priority options
→ Priority feature
```

Layer manager가 feature business logic을 알지 않는다.

---

## 19.72 Primitive Components

권장 primitives:

```text
Popover
PopoverTrigger
PopoverContent

Menu
MenuItem
MenuSubmenu

Tooltip

Dialog

Sheet
```

Feature는 이 primitive를 조합한다.

---

## 19.73 Anchor Identity

Focus restoration/positioning 안정성을 위해 trigger에 stable ref/id를 둘 수 있다.

Task switch로 owner가 바뀌면 stale anchor를 폐기한다.

---

## 19.74 Owner Task ID

Task-specific floating layer는 owner Task를 기억할 수 있다.

```ts
ownerTaskId
```

현재 `selectedTaskId`가 달라지면 자동 close 판단에 사용한다.

---

## 19.75 View Navigation

Primary View navigation 시 열린 Task Detail Popover/Menu는 모두 닫는다.

Detail 자체도 3장 rule에 따라 닫힌다.

---

## 19.76 Browser Back

Browser Back으로 selected Task/route가 바뀌면 이전 Task의 floating UI를 복원하지 않는다.

URL은 Task selection을 복원하지만 transient Popover state까지 URL에 저장하지 않는다.

---

## 19.77 Refresh

Refresh 후:

```text
Task Detail 복원 가능
Popover 복원 ❌
```

Transient UI는 closed state로 시작한다.

---

## 19.78 URL Exclusion

다음은 URL state에 넣지 않는다.

```text
priorityPopover=open
tagPicker=open
moreMenu=open
slashMenu=open
```

Deep link의 핵심 state가 아니다.

---

## 19.79 Error State Inside Popover

Custom Reminder validation처럼 Popover 내부 error가 발생하면 해당 surface 안에서 feedback한다.

Error 때문에 자동 close하지 않는다.

---

## 19.80 Async Option Loading

List/Tag Picker가 remote loading이 필요하면 Popover는 열린 채 local skeleton/spinner를 보여줄 수 있다.

전체 Task Detail을 loading 상태로 만들지 않는다.

---

## 19.81 Loading Focus

Loading 중 기존 focus를 잃지 않는다.

option이 로드되면 deterministic한 첫 focusable target을 제공한다.

---

## 19.82 Empty State

Picker 결과가 없으면:

```text
No results
```

또는:

```text
Create new tag
```

등 context-specific empty state를 표시한다.

---

## 19.83 Error Loading Options

```text
Couldn't load lists
Retry
```

처럼 Popover 안에서 해결 가능하게 한다.

---

## 19.84 Scroll Lock

Popover/Menu는 body scroll을 lock하지 않는다.

Modal/Sheet는 필요하면 lock한다.

Desktop Task Detail 자체도 body scroll lock 대상이 아니다.

---

## 19.85 Context Menu Native Behavior

Custom Context Menu를 사용하더라도 text input/selection area의 native context menu를 무조건 막지 않는다.

예:

```text
Title/Description text selection
→ native text context menu 필요 가능
```

Task row neutral surface에서만 custom menu를 적용하는 식으로 context를 구분한다.

---

## 19.86 Right-click on Link

Description의 링크 right-click은 브라우저 native link context menu를 유지하는 것이 자연스러울 수 있다.

Task custom context menu가 가로채지 않는다.

---

## 19.87 Pointer Type

Mouse/pen/touch를 고려한다.

Touch 환경에서는 hover-only interaction에 의존하지 않는다.

Long-press context menu는 향후 지원 가능하나 core action은 visible/accessible menu에서도 접근 가능해야 한다.

---

## 19.88 Accessibility Roles

각 primitive에 적절한 semantics를 사용한다.

예:

```text
Menu → role=menu / menuitem
Dialog → role=dialog
Tooltip → role=tooltip
Listbox-like picker → listbox/option or equivalent
```

실제 primitive library의 accessibility pattern을 따른다.

---

## 19.89 `aria-expanded`

Popover trigger에는 open state를 전달한다.

```text
aria-expanded
aria-controls
```

등.

---

## 19.90 Focus Return on Action

Option 선택 후 Popover가 닫히는 single-select flow:

```text
Priority High 선택
↓ close
↓
Priority trigger focus
```

Mouse 사용에서는 focus 정책이 다를 수 있지만 keyboard 사용자 흐름은 명확해야 한다.

---

## 19.91 Screen Reader Announcement

Popover open 시 title/context가 인식 가능해야 한다.

예:

```text
"Priority menu"
"Choose date"
"Tags"
```

아이콘만으로 이름을 제공하지 않는다.

---

## 19.92 Escape Listener Ownership

Esc handler를 각 feature에서 제각각 `window`에 등록하지 않는다.

Floating layer stack이 현재 topmost dismissable layer를 결정한다.

---

## 19.93 Layer Stack

개념:

```ts
layerStack = [
  schedulePopover,
  reminderSubPopover
];
```

Esc:

```text
pop top layer
```

Outside click도 topmost layer부터 판단한다.

---

## 19.94 Dismiss Reason

Close callback에는 이유를 전달할 수 있다.

예:

```ts
type DismissReason =
  | "escape"
  | "outside-pointer"
  | "selection"
  | "trigger-toggle"
  | "owner-unmounted"
  | "navigation";
```

필요한 경우 focus/commit 정책을 다르게 처리할 수 있다.

---

## 19.95 Dismiss Does Not Imply Cancel

Popover close가 항상 domain edit 취소를 의미하지 않는다.

예:

```text
Tag selection
→ 이미 즉시 commit
→ outside close
```

Custom form draft는:

```text
confirm 전
→ close 시 cancel
```

일 수 있다.

Feature가 commit semantics를 소유한다.

---

## 19.96 Draft Popover

Custom Repeat/Reminder처럼 draft를 편집하는 Popover는:

```text
draft state
Confirm
Cancel
```

을 사용할 수 있다.

이 경우 outside click 시:

```text
draft cancel
```

정책을 명확히 한다.

---

## 19.97 Unsaved Draft Warning

작은 Popover의 임시 draft에 매번 blocking confirmation을 띄우지 않는다.

다만 큰 custom rule 편집에서 데이터 입력량이 많다면 close 시 경고를 고려할 수 있다.

---

## 19.98 Testing Matrix

Floating UI QA:

```text
Task Detail narrow width
Task Detail max width
Browser viewport small
Near right edge
Near bottom edge
Scrollable Detail
Dark mode
Mobile sheet
Keyboard only
IME inside picker search
Zoom 200%
```

---

## 19.99 Prohibited Patterns

- feature마다 임의 z-index 숫자 사용
- Task Detail을 Popover처럼 outside click으로 닫기
- portal 없이 Detail overflow에 floating UI 잘리게 방치
- viewport collision detection 없이 항상 bottom placement
- anchor가 사라져도 stale Popover 유지
- Task switch 후 이전 Task Popover 유지
- sibling primary Popover 여러 개 무제한 동시 open
- Nested Popover click을 parent outside click으로 오인
- 한 Esc로 child/parent/Detail 모두 닫기
- Popover에 modal focus trap 적용
- Popover 때문에 App 전체 dim/backdrop 적용
- 모바일에서도 desktop-sized anchored popover 강제
- Tooltip 안에 필수 interactive 기능 넣기
- Context Menu를 위해 selectedTaskId 강제 변경
- Custom menu가 text editor native context menu를 전부 차단
- closed/unmounted floating content가 Tab order/pointer event에 남기
- Modal 뒤에 lower-layer Popover가 interactive하게 남기
- transient Popover state를 URL에 저장
- feature component마다 window Esc/outside-click listener 중복 등록
- z-index 문제를 `9999`, `99999`로 계속 해결

---

## 19.100 Acceptance Criteria

### Positioning

- [ ] 모든 anchored surface가 공통 positioning system을 사용한다.
- [ ] offset/flip/shift/collision detection을 지원한다.
- [ ] viewport edge에서 content가 잘리지 않는다.
- [ ] Detail resize/scroll 시 위치를 갱신한다.
- [ ] anchor unmount 시 floating layer를 안전하게 닫는다.

### Layering

- [ ] semantic z-index token을 사용한다.
- [ ] Popover/Menu/Modal/Toast의 layer 순서가 일관된다.
- [ ] arbitrary `9999` z-index를 사용하지 않는다.
- [ ] Modal open 시 lower interactive layers를 안전하게 처리한다.
- [ ] Nested submenu가 parent 위에 올바르게 렌더된다.

### Dismissal

- [ ] Popover/Menu는 outside click으로 닫힌다.
- [ ] Task Detail은 outside click으로 닫히지 않는다.
- [ ] Esc는 topmost layer 하나만 닫는다.
- [ ] trigger 재클릭으로 동일 Popover를 toggle할 수 있다.
- [ ] Task switch/navigation 시 transient floating UI가 닫힌다.

### Focus

- [ ] Keyboard open 시 적절한 내부 focus를 제공한다.
- [ ] Popover close 후 trigger에 focus를 복원한다.
- [ ] trigger가 사라졌으면 stable fallback을 사용한다.
- [ ] Popover는 focus trap을 사용하지 않는다.
- [ ] Modal/Dialog만 focus trap/background inert를 사용한다.

### Nested Layers

- [ ] Parent/Child Popover 관계를 표현할 수 있다.
- [ ] Child interaction이 Parent outside-click으로 오인되지 않는다.
- [ ] Child Esc 후 Parent가 유지된다.
- [ ] 복잡한 nested flow를 desktop submenu/mobile drill-down으로 표현할 수 있다.

### Responsive

- [ ] Desktop에서는 anchored popover/menu를 사용할 수 있다.
- [ ] Mobile에서는 bottom sheet/full-width surface로 전환할 수 있다.
- [ ] 동일 domain command/business logic을 재사용한다.
- [ ] Virtual keyboard/safe area에서 UI가 가려지지 않는다.

### Accessibility

- [ ] Menu/Dialog/Tooltip/Picker에 적절한 semantics가 있다.
- [ ] Trigger에 open state/accessibility label을 제공한다.
- [ ] Floating UI를 keyboard로 사용할 수 있다.
- [ ] Hover-only 기능을 만들지 않는다.
- [ ] Screen reader가 surface context를 이해할 수 있다.

### Architecture

- [ ] 공통 FloatingLayerManager/primitive를 사용할 수 있다.
- [ ] Feature content와 layer mechanics가 분리된다.
- [ ] Portal root를 공통으로 사용할 수 있다.
- [ ] Esc/outside-click/focus restoration을 중앙에서 관리할 수 있다.
- [ ] transient Popover state를 Task domain/URL에 저장하지 않는다.
- [ ] Desktop/Mobile presentation 차이가 business logic 복제로 이어지지 않는다.

---

# 20. Visual System

## 20.1 Purpose

Visual System은 Task Detail의 모든 요소가 동일한 시각 언어를 사용하도록 하는 공통 디자인 규칙이다.

핵심 목표:

```text
Dense but not cramped
Minimal but not ambiguous
Quiet hierarchy
Fast scanning
Consistent interaction states
```

Task Detail은 카드가 여러 개 쌓인 대시보드가 아니라 하나의 연속된 작업 surface처럼 보여야 한다.

---

## 20.2 Visual Direction

기본 방향:

```text
Flat structural surfaces
Subtle separators
Muted secondary text
Small icon controls
Minimal borders
Low visual noise
Strong state clarity
```

지양:

```text
과도한 cardification
두꺼운 border
큰 shadow
과한 radius
지나치게 큰 headings
강한 background blocks
```

---

## 20.3 Design Token Principle

색상·spacing·radius·shadow·type size를 feature component에서 직접 하드코딩하지 않는다.

예:

```ts
tokens.color.textPrimary
tokens.space.2
tokens.radius.popover
tokens.shadow.popover
```

Task Detail에 필요한 모든 핵심 visual value는 semantic token으로 정의한다.

---

## 20.4 Token Categories

최소 token group:

```text
Color
Typography
Spacing
Size
Radius
Border
Shadow
Motion
Z-index
Density
```

Z-index는 19장에서 정의한 semantic scale을 재사용한다.

---

## 20.5 Surface Hierarchy

권장 surface 구조:

```text
App Background
├─ Sidebar Surface
├─ Main View Surface
└─ Task Detail Surface
   ├─ Sticky Property Header
   ├─ Content Surface
   └─ Floating Surfaces
```

Task Detail 자체는 독립 card처럼 둥글게 떠 있는 박스가 아니라 App Shell의 구조 pane이다.

---

## 20.6 Task Detail Surface

Desktop Task Detail:

```text
border-radius: 0
box-shadow: none
```

기본.

Main View와는 divider / surface contrast로 구분한다.

예:

```text
Main View | 1px divider | Task Detail
```

---

## 20.7 Divider

Main ↔ Detail divider:

```text
visual width: 1px
resize hit area: larger invisible target
```

예:

```text
visible 1px
interaction hitbox 8px
```

Divider는 너무 강하게 보이지 않는다.

---

## 20.8 Divider Color

Semantic token:

```text
border-subtle
```

Dark/Light mode에 따라 자동 대응한다.

다음처럼 고정 hex를 각 component에 넣지 않는다.

```text
#333
#e5e5e5
```

---

## 20.9 Color Tokens

권장 semantic palette:

```text
surface-app
surface-sidebar
surface-main
surface-detail
surface-hover
surface-selected
surface-popover
surface-modal

text-primary
text-secondary
text-tertiary
text-disabled
text-inverse

border-subtle
border-default
border-strong

accent
accent-hover

danger
warning
success

priority-high
priority-medium
priority-low
priority-none

focus-ring
```

실제 색상값은 theme에서 매핑한다.

---

## 20.10 Light / Dark Theme

Task Detail은 Light/Dark theme에서 동일한 semantic hierarchy를 유지한다.

예:

```text
surface-detail
```

은 theme에 따라 실제 색상만 바뀐다.

Component logic에서:

```text
if dark -> #...
else -> #...
```

를 반복하지 않는다.

---

## 20.11 Dark Mode Principle

Dark mode에서 모든 요소에 border를 추가해 구분하려 하지 않는다.

다음 조합을 사용한다.

```text
surface contrast
subtle divider
hover fill
text hierarchy
```

Shadow는 dark background에서 효과가 약하므로 border/elevation token과 함께 사용한다.

---

## 20.12 Text Hierarchy

Task Detail의 텍스트 계층:

```text
Task Title
Property values
Section labels
Body text
Metadata
Placeholder
Disabled text
```

Task Title이 가장 강한 hierarchy다.

---

## 20.13 Typography Tokens

권장 구조:

```ts
type.title
type.body
type.bodySmall
type.caption
type.menu
type.placeholder
```

각 token에는:

```text
font-size
line-height
font-weight
letter-spacing
```

을 묶는다.

---

## 20.14 Font Family

App 전체에서 사용하는 system/UI font stack을 그대로 따른다.

Task Detail만 별도 font family를 사용하지 않는다.

한국어/중국어/일본어 fallback이 깨지지 않는 stack을 사용한다.

---

## 20.15 Task Title Typography

권장 초기 방향:

```text
font-size: 18–20px
font-weight: 500–600
line-height: 1.35–1.45
```

정확한 값은 TickTick DOM 실측 후 조정한다.

너무 큰 24px+ heading처럼 만들지 않는다.

Task Detail은 문서 페이지가 아니라 productivity pane이다.

---

## 20.16 Body Typography

Description/Checklist/Subtask text:

```text
14–16px
```

범위의 compact UI text를 권장한다.

정확한 값은 전체 App typography와 통일한다.

---

## 20.17 Secondary Metadata

Date, Tag, List metadata:

```text
12–14px
text-secondary
```

기본.

상태를 읽을 수 있을 만큼 contrast를 유지한다.

---

## 20.18 Placeholder

Placeholder:

```text
text-tertiary
```

를 사용한다.

실제 입력 text보다 명확히 약하지만 WCAG contrast를 지나치게 떨어뜨리지 않는다.

---

## 20.19 Line Height

긴 Description과 Task Title wrap에서 너무 빽빽하지 않도록 한다.

권장:

```text
Title: ~1.4
Body:  ~1.45–1.6
Menu:  compact but readable
```

---

## 20.20 Spacing Scale

권장 base spacing scale:

```text
2
4
6
8
12
16
20
24
32
```

px equivalent 또는 rem/token.

임의의:

```text
13px
17px
19px
```

같은 값이 계속 늘어나지 않게 한다.

---

## 20.21 Horizontal Pane Padding

Task Detail content의 좌우 padding은 충분한 읽기 공간을 주되 pane을 낭비하지 않는다.

권장 초기값:

```text
16–20px
```

정확한 값은 실제 width/DOM audit 후 조정한다.

---

## 20.22 Vertical Rhythm

기본 rhythm:

```text
Property Header
↓ 12–16

Title
↓ 12–16

Description / Checklist
↓ 20–24

Subtasks
↓ 20–24

Attachments / Metadata
```

너무 큰 section gap으로 card처럼 분절하지 않는다.

---

## 20.23 Property Header Height

Property Header는 compact하게 유지한다.

권장 초기 범위:

```text
40–48px
```

정확한 실측값은 TickTick audit 후 반영한다.

---

## 20.24 Property Control Size

상단 Complete / Date / Priority 등의 최소 pointer target:

```text
visual control은 compact
interaction hit area는 충분
```

권장:

```text
visual icon 16–18px
hit target 32–40px
```

시각적으로 작지만 클릭하기 어렵지 않게 한다.

---

## 20.25 Icon Size

기본 icon token:

```text
icon-xs
icon-sm
icon-md
```

예:

```text
14px
16px
18px
```

Task Detail은 대형 24–32px 아이콘을 남발하지 않는다.

---

## 20.26 Icon Stroke

한 화면 내 아이콘의 stroke weight/style을 통일한다.

예:

```text
outline icon
round cap
consistent stroke
```

서로 다른 icon library를 섞어 굵기가 들쭉날쭉해지지 않게 한다.

---

## 20.27 Icon-only Button

Icon-only button은:

```text
visible icon
hover state
focus state
tooltip
accessible label
```

을 가져야 한다.

---

## 20.28 Row Height

Task/Checklist/Subtask compact row 기본 높이는 density에 맞춘다.

권장 초기:

```text
32–40px
```

내용 wrap 시 자연스럽게 늘어난다.

모든 row를 48–56px 카드처럼 크게 만들지 않는다.

---

## 20.29 Minimum Hit Target

시각적 row가 compact해도 interactive target은 너무 작지 않게 한다.

Desktop mouse productivity UI와 accessibility 사이의 균형을 맞춘다.

Touch/mobile에서는 더 큰 hit target을 사용한다.

---

## 20.30 Border Radius Scale

권장:

```text
radius-xs
radius-sm
radius-md
radius-lg
```

사용 원칙:

```text
Task Detail structural pane
→ 0

Inline hover button
→ small

Popover/Menu
→ medium

Modal/Sheet
→ medium/large
```

---

## 20.31 Avoid Excessive Radius

모든 row/section에 radius를 적용하지 않는다.

예:

```text
Task title card
Description card
Subtask card
Attachment card
```

처럼 전부 별도 카드로 만들지 않는다.

---

## 20.32 Popover Radius

Popover/Menu는 구조 pane보다 더 분명한 radius를 사용할 수 있다.

권장 초기 범위:

```text
8–12px
```

정확한 값은 전체 app style에 맞춘다.

---

## 20.33 Shadow Tokens

권장:

```text
shadow-popover
shadow-modal
```

정도만 둔다.

Inline control마다 shadow를 넣지 않는다.

---

## 20.34 Popover Shadow

Popover shadow는:

```text
subtle elevation
+
border-subtle
```

조합.

Dark mode에서도 식별 가능해야 한다.

---

## 20.35 Hover State

Neutral interactive item:

```text
default
↓ hover
surface-hover
```

Hover는 subtle background change 중심으로 한다.

크기 확대/큰 translation은 사용하지 않는다.

---

## 20.36 Selected State

Selected Task row:

```text
surface-selected
+
optional text/icon emphasis
```

현재 focus와 selected를 다른 시각으로 구분한다.

---

## 20.37 Hover + Selected

Selected row hover:

```text
selected
→ slightly stronger selected-hover token
```

hover가 selected state를 지워버리지 않는다.

---

## 20.38 Focus State

Keyboard focus:

```text
focus ring / outline
```

Selected background만으로 focus를 표현하지 않는다.

---

## 20.39 Active / Pressed

Button pointer down:

```text
small surface darken/lighten
```

정도의 restrained feedback을 사용한다.

큰 scale-down animation은 필요 없다.

---

## 20.40 Disabled

Disabled control:

```text
lower contrast
no hover action
cursor semantics
```

단 opacity를 너무 낮춰 내용을 읽지 못하게 하지 않는다.

왜 disabled인지 필요한 경우 tooltip/help를 제공한다.

---

## 20.41 Complete State

Task/CheckItem completed:

```text
checked icon
text-muted
optional strikethrough
```

를 조합할 수 있다.

Status는 color 하나만으로 표현하지 않는다.

---

## 20.42 Won't Do State

Completed와 다른 icon/text semantics를 사용한다.

예:

```text
Completed → check
Won't Do → dash / cancelled marker
```

정확한 icon은 visual audit 후 정한다.

---

## 20.43 Priority Visual

Priority는 flag icon의 semantic color로 표현한다.

예:

```text
High
Medium
Low
None
```

색상 강도 순서를 가진다.

Task row 전체를 priority 색으로 채우는 것은 기본 사용하지 않는다.

---

## 20.44 Priority Accessibility

Priority label/menu에서는:

```text
High
Medium
Low
None
```

text를 함께 제공한다.

색상만으로 구분하지 않는다.

---

## 20.45 Date Visual State

Date는 상태에 따라 semantic color를 사용할 수 있다.

예:

```text
Normal date
Today
Overdue
```

Overdue는 danger semantic을 사용할 수 있으나 Priority High 색상과 혼동되지 않게 한다.

---

## 20.46 Overdue vs Priority

```text
Priority color
≠
Date urgency color
```

같은 red 계열을 사용하더라도 icon/context/text로 의미가 구분되어야 한다.

---

## 20.47 Tag Chip

Tag chip은 compact하게 유지한다.

예:

```text
#research
```

권장:

```text
small radius
subtle surface
text label
optional color indicator
```

대형 pill badge가 본문보다 강해지지 않게 한다.

---

## 20.48 Tag Overflow

많은 Tag는 wrap하거나:

```text
+3
```

summary를 사용한다.

한 줄에서 Detail width를 강제로 확장하지 않는다.

---

## 20.49 List Property Visual

List는 folder icon/color에 과하게 의존하지 않는다.

기본:

```text
List name
optional small icon
```

현재 Task의 소속을 빠르게 읽을 수 있어야 한다.

---

## 20.50 Section Labels

`Subtasks`, `Attachments` 같은 section label은:

```text
body-small / medium weight
text-secondary
```

정도로 둔다.

대형 heading으로 영역을 과도하게 분절하지 않는다.

---

## 20.51 Section Divider

모든 section 사이에 divider를 넣지 않는다.

필요한 구조 경계에서만:

```text
1px subtle
```

사용.

Spacing만으로 구분 가능한 곳은 divider를 생략한다.

---

## 20.52 Description Surface

Description은 별도 card border 없이 자연스럽게 본문 영역으로 보이게 한다.

Focus 시 subtle background/outline 정도만 제공한다.

---

## 20.53 Title Editing Surface

Title도 기본 상태에서는 input border가 보이지 않는다.

Editing/focus 시:

```text
caret
subtle focus indication
```

으로 충분하다.

---

## 20.54 Checklist Row

Checklist row:

```text
checkbox
text
secondary hover actions
```

구조.

Row 전체 background는 hover/focus 때만 필요하다.

---

## 20.55 Subtask Row

Checklist보다 조금 더 많은 metadata를 가질 수 있으나 동일 density family를 사용한다.

Date/Priority metadata는 secondary hierarchy로 둔다.

---

## 20.56 Attachment Row

Attachment는 파일 type을 인식할 수 있을 정도의 icon/thumbnail을 제공한다.

파일 metadata는 secondary.

Upload failure만 danger emphasis.

---

## 20.57 Empty States

Empty state는 큰 illustration/card 대신 lightweight action 중심.

예:

```text
+ Add subtask
+ Add attachment
Add notes...
```

Task Detail 안에서 빈 공간을 과도하게 장식하지 않는다.

---

## 20.58 Skeleton

Task Detail whole-pane skeleton을 기본적으로 사용하지 않는다.

Local Task data가 있으면 즉시 표시.

필요한 remote-only section만 작은 skeleton/loading state를 사용한다.

---

## 20.59 Spinner

작은 property save마다 spinner를 띄우지 않는다.

긴 upload/loading에서만 명확하게 사용한다.

---

## 20.60 Toast Visual

Toast:

```text
compact
single-line or short two-line
clear action
```

과도한 card shadow/large icon을 사용하지 않는다.

---

## 20.61 Menu Item Height

Menu는 빠르게 scanning할 수 있도록 compact하게 한다.

권장 초기:

```text
32–36px
```

touch/mobile sheet에서는 더 크게 조정한다.

---

## 20.62 Menu Group Divider

More Menu 등에서 semantic group 사이에만 divider를 둔다.

각 item마다 border를 넣지 않는다.

---

## 20.63 Destructive Item

Delete:

```text
danger text/icon
```

으로 명확히 구분한다.

Hover 시 danger surface를 subtle하게 사용할 수 있다.

---

## 20.64 Popover Search Input

Tag/List picker의 search field는:

```text
compact
border-subtle or surface inset
clear placeholder
```

를 사용한다.

Popover 전체와 과도하게 다른 스타일을 쓰지 않는다.

---

## 20.65 Scrollbar

Task Detail/Popover scrollbar는 플랫폼 기본을 존중하되 앱 theme에 맞게 subtle custom styling을 할 수 있다.

Scrollbar를 완전히 숨겨 scroll 가능성을 알기 어렵게 만들지 않는다.

---

## 20.66 Detail Width Tokens

1장에서 정한 초기값:

```text
default: 420px
min:     360px
max:     600px
```

을 semantic layout token으로 둔다.

실제 TickTick DOM 실측 후 교체 가능하게 한다.

---

## 20.67 Narrow Detail Behavior

폭이 좁아지면:

```text
metadata 축약
toolbar 일부 icon-only
long labels ellipsis
```

를 적용할 수 있다.

Title/Description 핵심 content는 유지한다.

---

## 20.68 Wide Detail Behavior

폭이 넓어져도 body line length가 지나치게 길어지지 않게 한다.

Detail max width로 이미 제한되므로 별도 huge layout을 만들 필요 없다.

---

## 20.69 Responsive Breakpoints

1장에서 정한 initial strategy:

```text
>= 1100
desktop 3-column

760–1099
medium

< 760
full-screen Detail
```

정확한 breakpoint는 App Shell 전체와 통합한다.

---

## 20.70 Mobile Visual Density

Mobile에서는:

```text
larger hit targets
slightly more vertical spacing
full-width sheets
```

를 사용한다.

Desktop compact density를 그대로 축소해 넣지 않는다.

---

## 20.71 Density Modes

향후:

```text
Compact
Comfortable
```

density preference를 지원할 수 있다.

하지만 V1은 하나의 default density로 일관되게 시작한다.

---

## 20.72 Compact Density Principle

TickTick-style productivity UI에서는 정보량이 많은 만큼 vertical density가 중요하다.

그러나:

```text
click target
text readability
focus visibility
```

를 희생하지 않는다.

---

## 20.73 Text Truncation

다음은 필요 시 ellipsis 가능:

```text
List name
Tag overflow summary
Attachment filename
Menu labels in extreme narrow width
```

반면 Task Title/Description 본문은 Detail에서 가능한 한 wrap한다.

---

## 20.74 Tooltip for Truncated Text

Truncated metadata는 hover/focus tooltip으로 전체 값을 확인할 수 있게 한다.

---

## 20.75 Numbers and Counts

Count는 secondary hierarchy.

예:

```text
Subtasks 2/5
Attachments 3
```

큰 KPI badge처럼 강조하지 않는다.

---

## 20.76 Motion Tokens

권장 semantic motion:

```text
motion-fast
motion-normal
motion-slow
```

Task Detail에서는 대부분:

```text
fast / normal
```

만 사용한다.

---

## 20.77 Motion Timing

초기 권장:

```text
hover:       80–120ms
popover:    120–180ms
detail open:150–200ms
```

정확한 값은 future TickTick motion audit 후 조정한다.

---

## 20.78 Easing

공통 easing token을 사용한다.

예:

```text
ease-standard
ease-out
```

feature마다 임의 cubic-bezier를 만들지 않는다.

---

## 20.79 Task Switch Motion

Task A → B Detail content switch에는 큰 slide/fade animation을 사용하지 않는다.

즉시 내용이 바뀌는 것이 빠른 탐색에 유리하다.

---

## 20.80 Completion Motion

Checkbox 상태 변화 정도의 짧은 visual feedback만 사용한다.

Task row 제거도 긴 animation을 피한다.

---

## 20.81 Reorder Motion

Drag/drop 후 item 위치 정렬에는 subtle layout transition을 사용할 수 있다.

사용자가 drop 위치를 이해하는 데 도움이 되는 정도로 제한한다.

---

## 20.82 Popover Motion

Popover:

```text
fade
+
small translate/scale
```

정도.

Flip 발생 시 반대편으로 “날아가는” animation은 사용하지 않는다.

---

## 20.83 Reduced Motion

`prefers-reduced-motion`을 존중한다.

```text
detail transition
popover transition
toast transition
reorder animation
```

을 최소화/제거한다.

---

## 20.84 Theme Transition

Light ↔ Dark 전환 시 모든 요소에 긴 color transition을 걸지 않는다.

짧거나 즉시 전환해 text flicker를 줄인다.

---

## 20.85 High Contrast

OS/browser high-contrast 환경에서도:

```text
selected
focus
disabled
danger
```

상태를 구분할 수 있어야 한다.

Background shade 하나에만 의존하지 않는다.

---

## 20.86 Contrast

일반 body text와 interactive labels는 충분한 contrast를 유지한다.

Muted metadata도 지나치게 희미하게 만들지 않는다.

WCAG 기준을 접근성 장에서 최종 검증한다.

---

## 20.87 Semantic State Matrix

각 interactive component는 최소 다음 state를 정의한다.

```text
default
hover
focus-visible
active
selected
disabled
error
```

모든 state가 필요한 것은 아니지만 component별로 빠짐없이 확인한다.

---

## 20.88 Button Primitive

권장 button variants:

```text
icon
ghost
subtle
primary
danger
```

Task Detail에서는 주로:

```text
icon
ghost
subtle
```

을 사용한다.

Primary button은 confirmation/custom form처럼 명시적 확정이 필요한 곳에 제한한다.

---

## 20.89 Input Primitive

Input/Textarea의 기본 visual:

```text
borderless or subtle
focus-visible clearly shown
error state
placeholder state
```

Task Detail 문맥에 맞춰 form-heavy 느낌을 줄인다.

---

## 20.90 Checkbox Primitive

Task checkbox와 CheckItem checkbox는 동일 visual family를 사용한다.

다만 size/importance는 조정 가능하다.

Native semantics를 유지한다.

---

## 20.91 Icon Consistency

Complete, Reminder, Repeat, Priority, Tag, Attachment, More 등에서 icon naming/shape rule을 문서화한다.

같은 의미에 두 종류 icon을 섞지 않는다.

---

## 20.92 State Icon Consistency

예:

```text
Complete
→ check

Reminder
→ bell

Repeat
→ repeat arrows

Priority
→ flag

Attachment
→ paperclip
```

이 의미 mapping을 앱 전체에서 유지한다.

---

## 20.93 Loading Placeholder Geometry

Skeleton을 사용할 경우 실제 content layout과 비슷한 크기로 만든다.

로드 완료 시 큰 layout shift가 발생하지 않게 한다.

---

## 20.94 Visual Regression

Task Detail의 핵심 state를 screenshot regression 대상으로 둔다.

예:

```text
No Date
Timed Task
Completed
Won't Do
Checklist
Long Description
Subtasks
Attachment upload
Dark Mode
Popover open
Error state
```

---

## 20.95 Theme Token Test

Light/Dark 각각에서 semantic token이 누락되어 hardcoded color가 새어나오지 않는지 검증한다.

---

## 20.96 Zoom Test

Browser 200% zoom에서도:

```text
Task Detail content
Popover
Menu
Focus ring
```

이 잘리지 않아야 한다.

---

## 20.97 Localization

영어보다 긴 한국어/독일어/일본어 label 등에서도 control이 깨지지 않아야 한다.

고정 폭 text button을 과도하게 사용하지 않는다.

---

## 20.98 CJK Typography

한국어/중국어/일본어에서 line-height가 너무 낮아 glyph가 답답해지지 않게 한다.

Latin 기준으로만 typography를 튜닝하지 않는다.

---

## 20.99 Number/Date Locale

Visual label:

```text
Apr 20
20 Apr
4월 20일
```

등 locale에 따라 달라져도 layout이 안정적이어야 한다.

---

## 20.100 Token Example

개념 예시:

```ts
const taskDetailTokens = {
  width: {
    min: 360,
    default: 420,
    max: 600,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },

  icon: {
    sm: 14,
    md: 16,
    lg: 18,
  },

  radius: {
    control: 6,
    popover: 10,
    modal: 12,
  },

  motion: {
    hover: 100,
    popover: 150,
    detail: 180,
  },
};
```

이 값은 초기 token 구조 예시이며 exact TickTick fidelity audit 후 교체 가능하다.

---

## 20.101 Visual Audit Strategy

TickTick과 최대한 유사하게 만들고 싶다면 추측만으로 pixel value를 확정하지 않는다.

실제 DOM/CSS를 접근 가능한 환경에서 측정한다.

측정 대상:

```text
Task Detail width
Property Header height
Horizontal padding
Title font-size/weight/line-height
Row height
Icon size
Divider color
Hover fill
Selected fill
Popover radius
Popover shadow
Menu item height
Animation duration
```

---

## 20.102 Token Replacement Rule

실측 결과가 나오면 component 코드를 개별 수정하지 않고 token만 교체한다.

예:

```text
현재:
detailPaddingX = 16

실측:
detailPaddingX = 18
```

→ token 수정 하나로 전체 반영.

---

## 20.103 Do Not Clone Accidental Values

실측에서 보이는 모든 px 값을 그대로 복제하는 것이 목적은 아니다.

브라우저 rounding/legacy CSS까지 그대로 모방하기보다:

```text
stable token system
+
measured appearance
```

를 맞춘다.

---

## 20.104 Visual Priority Order

Task Detail을 볼 때 사용자가 먼저 읽어야 하는 순서:

```text
1. Task Title
2. Completion / Date / Priority
3. Description or Checklist
4. Subtasks
5. Organization / Attachments
6. Secondary actions
```

Visual hierarchy도 이 순서를 따라야 한다.

---

## 20.105 Do Not Over-emphasize Properties

Date/Priority/Tag가 Title보다 더 큰 badge/색상으로 보이지 않게 한다.

Task content가 중심이다.

---

## 20.106 Visual Simplicity Test

각 section에 대해 다음 질문을 한다.

```text
이 border가 정말 필요한가?
이 background가 정말 필요한가?
이 icon이 항상 보여야 하는가?
hover에서만 보여도 되는가?
text label 하나로 충분한가?
```

답이 아니면 제거한다.

---

## 20.107 Density Test

한 화면에 Task Detail이 열렸을 때:

```text
Title
Description
Subtasks 몇 개
Attachments
```

를 적절한 스크롤 범위 안에서 볼 수 있어야 한다.

각 section이 큰 카드가 되어 viewport를 낭비하지 않는다.

---

## 20.108 Visual States Checklist

각 주요 component는 적어도 다음 screenshot/state를 확인한다.

### Task Row

```text
default
hover
selected
selected+hover
completed
wont_do
focus-visible
```

### Property Control

```text
default
hover
active
selected/value-set
focus-visible
disabled
```

### Editor

```text
empty
view
focused
dirty
saving
error
```

### Popover

```text
default
hover item
selected item
keyboard focus
loading
empty
error
```

---

## 20.109 Prohibited Patterns

- Task Detail 전체를 둥근 card로 띄우기
- 모든 section을 card로 분리
- 각 component마다 임의 hex/px/radius 하드코딩
- `z-index: 9999`로 시각 문제 해결
- Title보다 property badge를 더 강하게 강조
- 모든 icon을 24px 이상으로 크게 사용
- checkbox/flag/button의 visual size와 hit target을 동일하게 작게 만들기
- hover에서 scale-up/large motion 사용
- selected와 focus state를 동일하게 표현
- completed/wont-do를 색상만으로 구분
- dark mode에서 shadow만으로 layer 구분
- 모든 section 사이 divider 사용
- 모든 성공 save에 spinner/Toast 표시
- Task switch마다 전체 pane fade/slide
- mobile에 desktop compact hit target 그대로 사용
- browser zoom/긴 localization label을 고려하지 않음
- exact fidelity를 위해 component마다 pixel 값을 직접 복사
- hardcoded Light/Dark conditional color 반복

---

## 20.110 Acceptance Criteria

### Tokens

- [ ] Color/Spacing/Typography/Radius/Shadow/Motion을 semantic token으로 관리한다.
- [ ] Feature component에 임의 visual value가 반복되지 않는다.
- [ ] Light/Dark theme가 같은 semantic token 체계를 사용한다.
- [ ] Exact TickTick audit 값이 token 교체만으로 반영 가능하다.

### Layout

- [ ] Task Detail은 structural pane처럼 보인다.
- [ ] Main/Detail은 subtle divider로 구분된다.
- [ ] Property Header는 compact하다.
- [ ] Title/Description/Checklist/Subtask가 과도한 card로 분절되지 않는다.
- [ ] Detail width min/default/max token이 존재한다.

### Typography

- [ ] Task Title이 가장 강한 hierarchy다.
- [ ] Body/Metadata/Placeholder가 단계적으로 구분된다.
- [ ] CJK text에서도 line-height가 안정적이다.
- [ ] 긴 Title은 wrap 가능하다.
- [ ] metadata는 필요 시 truncate + tooltip 가능하다.

### Interaction States

- [ ] Default/Hover/Focus/Active/Selected/Disabled/Error 상태가 정의된다.
- [ ] Selected와 Keyboard Focus를 구분한다.
- [ ] Hover가 Selected state를 지우지 않는다.
- [ ] Disabled state가 읽을 수 없을 정도로 희미하지 않다.
- [ ] Color만으로 status/priority/focus를 전달하지 않는다.

### Icons / Controls

- [ ] 아이콘 크기/stroke family가 일관된다.
- [ ] Icon-only button에 tooltip/accessibility label이 있다.
- [ ] Compact visual과 충분한 interaction hit target을 분리한다.
- [ ] Task/CheckItem checkbox가 같은 visual family를 사용한다.

### Popover / Modal

- [ ] Popover/Menu에 일관된 surface/radius/shadow token을 사용한다.
- [ ] Dark mode에서도 layer separation이 보인다.
- [ ] Menu item density가 compact하고 읽기 쉽다.
- [ ] Destructive action이 명확히 구분된다.
- [ ] Mobile에서는 sheet density/hit target으로 대응한다.

### Motion

- [ ] Motion timing/easing이 tokenized되어 있다.
- [ ] Task switch에 큰 animation을 사용하지 않는다.
- [ ] Popover/Toast motion이 짧고 subtle하다.
- [ ] Reduced Motion을 지원한다.
- [ ] Reorder motion이 위치 이해를 돕는 수준으로 제한된다.

### Responsive / Accessibility

- [ ] Narrow/Medium/Mobile width에서 layout이 깨지지 않는다.
- [ ] Mobile hit target을 적절히 확장한다.
- [ ] 200% zoom에서 content와 focus ring이 잘리지 않는다.
- [ ] High Contrast 환경에서 상태를 구분할 수 있다.
- [ ] localization으로 label이 길어져도 layout이 안정적이다.

### Fidelity

- [ ] TickTick 실측이 필요한 값과 자체 design token을 구분한다.
- [ ] 실측 시 width/padding/font/row/icon/radius/shadow/motion을 체계적으로 기록한다.
- [ ] 실측값 반영이 token 수정으로 끝나도록 설계한다.
- [ ] accidental legacy CSS까지 무조건 복제하지 않는다.

---

# 21. State Synchronization

## 21.1 Purpose

State Synchronization은 Task Detail과 App의 다른 모든 surface가 **같은 Task를 같은 상태로 보고 있는지**를 보장하는 공통 상태 규칙이다.

대상:

```text
Task Store
UI Store
Mutation Queue
Router / URL
Main List
Board
Calendar
Search
Sidebar counts
Task Detail
Popover / Menu
Remote Sync
```

핵심 목표:

```text
One canonical domain state
+
Multiple derived views
+
Predictable transient UI state
```

같은 Task의 Title/Date/Priority/Status를 화면마다 별도 copy로 관리하지 않는다.

---

## 21.2 State Categories

앱 상태는 최소 네 종류로 나눈다.

```text
1. Domain State
2. UI State
3. Mutation / Sync State
4. Route State
```

각 상태의 책임을 섞지 않는다.

---

## 21.3 Domain State

Domain State는 Task 자체의 의미를 나타낸다.

예:

```text
Task
CheckItem
Tag
TaskTag
Attachment
Reminder
RecurrenceSeries
RecurrenceOccurrenceState
```

예:

```ts
task.title
task.status
task.schedule
task.priority
task.listId
task.parentTaskId
```

이 값들은 App 전체의 canonical source다.

---

## 21.4 UI State

UI State는 현재 화면에서만 필요한 transient state다.

예:

```text
selectedTaskId
focusedTaskId
activePopover
editingField
expandedTaskIds
taskDetailWidth
contextTargetTaskId
dragState
```

Task entity 안에 저장하지 않는다.

---

## 21.5 Mutation State

Mutation/Sync State는 저장 진행 상황을 관리한다.

예:

```text
pending
saving
failed
offline-pending
latest sequence
revision
undo token
```

Task model에:

```text
isSaving
saveError
```

같은 필드를 영구 저장하지 않는다.

---

## 21.6 Route State

URL이 표현할 수 있는 상태:

```text
current primary view
selected Task identity
search/filter context 일부
```

예:

```text
/list/study/task/abc123
```

반면 다음 transient state는 URL에 넣지 않는다.

```text
Priority Popover open
Tag Picker open
Title focused
Description selection
Toast visible
```

---

## 21.7 Canonical Store

권장 normalized domain structure:

```ts
type DomainStore = {
  tasksById: Record<string, Task>;
  checkItemsById: Record<string, CheckItem>;
  tagsById: Record<string, Tag>;
  attachmentsById: Record<string, Attachment>;

  // relations / indexes
};
```

View별 Task copy를 만들지 않는다.

---

## 21.8 Entity Identity

같은 `taskId`는 어디서 보더라도 같은 logical entity다.

```text
List row taskId=123
Board card taskId=123
Calendar item taskId=123
Detail taskId=123
```

모두:

```ts
tasksById["123"]
```

을 읽는다.

---

## 21.9 Derived Selectors

View에 필요한 표현은 selector로 만든다.

예:

```ts
getTasksForList(listId)
getTasksForToday()
getOverdueTasks()
getTasksByTag(tagId)
getSubtasks(taskId)
getChecklistProgress(taskId)
getAttachmentCount(taskId)
```

Derived 값을 Task에 중복 저장하지 않는다.

---

## 21.10 Main View and Detail Synchronization

Detail에서 Title 변경:

```text
Task Detail
"Meeting" → "Planning"
```

즉시:

```text
Main List row
Board card
Search snippet
Calendar title
```

가 같은 canonical store에서 새 값을 읽는다.

별도 “Detail Save 완료 후 Main refetch”에 의존하지 않는다.

---

## 21.11 Main View to Detail Synchronization

반대 방향도 동일하다.

예:

```text
Main List inline Complete
```

→ canonical Task status update

→ 열린 Detail checkbox/status도 즉시 반영.

---

## 21.12 Bidirectional Does Not Mean Two Sources

```text
Main → Detail
Detail → Main
```

처럼 보이지만 실제로는:

```text
Main
  ↘
  Domain Store
  ↗
Detail
```

이다.

두 화면이 서로 직접 state를 전달하지 않는다.

---

## 21.13 Task Selection Source of Truth

Task Detail open state:

```ts
selectedTaskId: string | null;
```

하나를 사용한다.

금지:

```text
isDetailOpen
+
selectedTaskId
```

를 서로 독립적으로 관리.

권장:

```text
selectedTaskId !== null
→ Detail open
```

---

## 21.14 Selection and Entity Existence

`selectedTaskId`가 존재하지만 Task entity가 로드되지 않았을 수 있다.

상태를 구분한다.

```text
selectedTaskId exists
Task data loading
```

→ Detail local loading state.

---

## 21.15 Selected Task Deleted

현재 selected Task가 canonical store에서 deleted state가 되면:

```text
selectedTaskId = null
```

로 Detail을 닫는다.

사용자 직접 삭제든 remote 삭제든 동일한 invariant를 따른다.

---

## 21.16 Selected Task Leaves Current Query

Task property 변경으로 현재 Main query에서 빠지는 경우:

```text
Main row 제거
Detail 유지
```

3장에서 확정한 핵심 rule이다.

예:

```text
Today View
Task date Today → Tomorrow
```

결과:

```text
Today Main에서 사라짐
Task Detail은 계속 열림
```

---

## 21.17 Explicit Navigation

Sidebar/Rail에서 다른 primary View로 명시적으로 이동:

```text
List A → Today
```

기본:

```text
selectedTaskId clear
Detail close
```

3장의 navigation rule을 따른다.

---

## 21.18 URL and Selection

URL에 Task identity를 반영하는 경우:

```text
selectedTaskId
↔ route task id
```

를 동기화한다.

하지만 서로 무한 update loop를 만들지 않는다.

---

## 21.19 Route → Store Flow

Deep link:

```text
/task/123
```

열기:

```text
1. Router parses taskId=123
2. selectedTaskId=123
3. Task data resolve/load
4. Detail render
```

---

## 21.20 Store → Route Flow

사용자 Task row 클릭:

```text
selectTask(123)
↓
selectedTaskId=123
↓
route update
```

Route update가 다시 duplicate selection mutation을 만들지 않도록 origin/reconciliation rule이 필요하다.

---

## 21.21 Avoid Route Sync Loops

예:

```text
Store update → Router update
Router event → Store update
Store update → Router update ...
```

를 방지한다.

방법:

```text
현재 route와 desired route 비교
동일하면 no-op
```

---

## 21.22 Browser Back

Back:

```text
Task B URL
→ Task A URL
```

Router가:

```text
selectedTaskId = A
```

로 복원한다.

Main View context도 route에 포함되어 있으면 함께 복원한다.

---

## 21.23 Browser Forward

Forward도 같은 방식으로 selection을 복원한다.

Task Detail local transient state:

```text
popover
caret
hover
```

는 복원하지 않는다.

---

## 21.24 Refresh

URL에 Task identity가 있다면 refresh 후 Detail 복원 가능.

필요한 순서:

```text
Route resolve
Domain hydrate/fetch
Task available
Detail render
```

중간에 false “Task not found”를 너무 빨리 보여주지 않는다.

---

## 21.25 Missing Task Deep Link

fetch 완료 후에도 Task가 없으면:

```text
Task unavailable / deleted
```

state를 보여준다.

무한 loading하지 않는다.

---

## 21.26 URL and Deleted Task

삭제된 Task URL:

```text
deleted / unavailable state
```

또는 Trash 접근 권한이 있으면 recovery affordance.

임의로 다른 Task를 선택하지 않는다.

---

## 21.27 Query Membership

List/Today/Search/Tag View에 포함되는지는 canonical state에서 계산한다.

예:

```text
Task.schedule
Task.status
Task.listId
Task tags
```

mutation 후 query membership이 즉시 달라질 수 있다.

---

## 21.28 Query Recalculation

Optimistic mutation 후 관련 selectors/query cache를 갱신한다.

예:

```text
Priority Low → High
```

영향:

```text
High Priority view
Board grouping
sort order
```

즉시 반영.

---

## 21.29 Do Not Refetch Everything

작은 property change마다:

```text
all tasks refetch
all lists refetch
all counts refetch
```

하지 않는다.

Normalized store + targeted invalidation을 사용한다.

---

## 21.30 Server Cache Integration

React Query/SWR류 cache를 쓴다면 domain store와 역할을 명확히 정한다.

가능한 구조:

```text
Server Cache
→ remote entity truth/cache

Client Domain Store
→ normalized local/optimistic state
```

또는 하나의 server-state library를 canonical store로 사용할 수도 있다.

중요한 것은 같은 entity의 conflicting source를 만들지 않는 것이다.

---

## 21.31 Query Cache Update

Optimistic mutation 시 관련 query cache에 직접 patch하거나 normalized entity reference를 통해 자동 반영한다.

“Detail cache”, “List cache”를 서로 독립 snapshot으로 방치하지 않는다.

---

## 21.32 Search Synchronization

Title/Description/CheckItem/Tag 변경은 Search 결과에 반영된다.

Local search:

```text
immediate / debounced index update
```

Remote search:

```text
server index delay 가능
```

이 경우 local selected Task Detail과 remote search 결과의 eventual consistency를 구분한다.

---

## 21.33 Search Result Staleness

Remote search result가 오래된 title을 잠시 보여줄 수 있다면 local canonical entity와 merge해 최신 display value를 사용한다.

검색 hit identity:

```text
taskId
```

가 핵심이다.

---

## 21.34 Calendar Synchronization

Schedule update:

```text
Detail
↓
Task.schedule
↓
Calendar event position
```

즉시 반영.

Calendar drag:

```text
Calendar
↓
same schedule command
↓
Detail Date/Time 즉시 반영
```

---

## 21.35 Board Synchronization

Priority/List/Status/Tag grouping이 바뀌면 Board card가 optimistic하게 다른 column/group으로 이동할 수 있다.

Detail은 선택된 Task를 그대로 보여준다.

---

## 21.36 Sidebar Count Synchronization

Sidebar count는 derived/query count다.

예:

```text
Today 12
```

Task를 Tomorrow로 옮기면 count가 즉시 줄어든다.

component가 수동:

```text
count - 1
```

을 하드코딩하지 않는다.

---

## 21.37 Subtask Synchronization

Subtask는 Task entity이므로:

```text
Parent Detail Subtask row
Search
Calendar
Board
Child Detail
```

가 동일 Child Task를 읽는다.

Child title 변경이 Parent Detail row에 즉시 반영된다.

---

## 21.38 Checklist Synchronization

CheckItem canonical entity 변경:

```text
Detail checklist
Progress
Search index
Main preview
```

에 반영된다.

---

## 21.39 Attachment Synchronization

Attachment upload/delete:

```text
Task Detail attachment list
Attachment count indicator
Search filename metadata
```

를 같은 entity collection에서 반영한다.

---

## 21.40 Tag Synchronization

Tag rename:

```text
Tag Picker
Task Detail chips
Tag Sidebar
Search/filter labels
```

모두 같은 Tag entity를 읽는다.

TaskTag relation은 변경하지 않는다.

---

## 21.41 List Synchronization

List rename:

```text
Sidebar
Task Detail List property
Move Picker
Breadcrumb
```

가 즉시 반영.

Task `listId`는 바뀌지 않는다.

---

## 21.42 Remote Update

다른 device/tab에서 Task update:

```text
remote event / refetch
↓
domain reconciliation
↓
all surfaces update
```

단 active local draft는 예외적으로 보호한다.

---

## 21.43 Active Draft Protection

Title/Description/CheckItem을 현재 편집 중이면 remote value로 draft를 덮어쓰지 않는다.

구분:

```text
Canonical remote update
Local active draft
```

둘 다 보존하고 conflict/reconciliation state를 만든다.

---

## 21.44 Remote Update to Unedited Field

사용자가 Description을 편집 중이지만 remote에서 Priority만 바뀌었다면:

```text
Priority 즉시 update
Description draft 유지
```

field-level merge가 가능해야 한다.

---

## 21.45 Remote Delete

현재 Task가 remote에서 삭제됨:

```text
Task removed from canonical live store
↓
Detail unavailable / close
↓
Main views update
```

Local dirty draft가 있다면 recovery feedback을 제공할 수 있다.

---

## 21.46 Remote Move

다른 device에서 Task가 List A → B로 이동:

```text
Task.listId update
```

현재 List A View에서는 row가 사라질 수 있다.

Detail에서 해당 Task를 보고 있었다면 Detail은 유지할 수 있다.

사용자 명시적 navigation이 아니기 때문이다.

---

## 21.47 Remote Status Change

remote completion:

```text
Task.status = completed
```

현재 Main query에서 사라질 수 있지만 Detail은 동일 Task를 계속 표시할 수 있다.

---

## 21.48 Remote Recurrence Change

Series rule이 remote에서 바뀌면 occurrence expansion cache를 invalidate/recompute한다.

이미 materialized exception은 Series identity에 맞게 reconcile해야 한다.

---

## 21.49 Sync Event Granularity

가능하면 remote sync event는 entity-level change를 전달한다.

예:

```text
task.updated
task.deleted
tag.updated
attachment.ready
```

매번 전체 workspace reload를 요구하지 않는다.

---

## 21.50 Real-time vs Polling

구현 방식은:

```text
WebSocket
SSE
Firestore listener
Polling
Manual refetch
```

중 무엇이든 가능하다.

State Synchronization spec은 transport 방식과 분리한다.

---

## 21.51 Transport Adapter

권장:

```text
Sync Adapter
→ event normalize
→ Domain reconciliation
```

View component가 WebSocket/Firestore SDK를 직접 구독하지 않는다.

---

## 21.52 Reconciliation

Remote entity가 들어오면:

```text
revision 확인
pending local mutation 확인
active draft 확인
```

후 merge한다.

단순:

```text
remote object로 local object 전체 replace
```

하지 않는다.

---

## 21.53 Revision Priority

Remote revision이 local known revision보다 오래되었으면 무시한다.

새 revision이면 pending mutation/conflict 여부를 확인한다.

---

## 21.54 Pending Mutation + Remote Echo

내가 보낸 mutation이 server에서 다시 sync event로 돌아올 수 있다.

Mutation ID/client operation ID를 통해:

```text
own echo
```

를 식별하고 중복 event/animation/history를 만들지 않는다.

---

## 21.55 Deduplication

동일 server event를 여러 번 받아도 idempotent하게 처리한다.

```text
eventId
revision
entity version
```

을 활용할 수 있다.

---

## 21.56 Race: Local Edit vs Remote Fetch

예:

```text
local title = New
↓
background fetch starts from old remote
↓
old response returns
```

old response가 New를 덮어쓰지 않는다.

Request 시작 시점과 entity revision을 비교한다.

---

## 21.57 Race: Task Switch vs Fetch

Task A fetch 중 B 선택:

```text
A response arrives later
```

A data는 store에 넣을 수 있지만:

```text
selectedTaskId를 A로 되돌리면 안 됨
```

selection과 fetch lifecycle을 분리한다.

---

## 21.58 Race: Popover vs Task Switch

Task A Priority Popover open:

```text
B select
↓
A popover close
```

A 관련 async option response가 늦게 와도 Popover를 다시 열지 않는다.

---

## 21.59 Race: Delete vs Save

Title save pending 중 Task Delete:

```text
delete
```

후 늦은 title save response가 Task를 resurrect하면 안 된다.

`deletedAt`/entity revision이 우선한다.

---

## 21.60 Race: Reopen vs Completion Response

```text
Complete #1
Reopen #2
```

#1 응답이 늦게 와도 #2가 최종 상태.

16장 sequence rule을 그대로 적용한다.

---

## 21.61 Race: Reorder

Subtask/CheckItem reorder 연속 수행:

```text
Order #1
Order #2
```

#1 늦은 response가 #2 sortKey를 덮어쓰지 않는다.

---

## 21.62 Entity Tombstone

Soft deleted entity는 일정 기간 tombstone 상태를 유지할 수 있다.

목적:

```text
stale remote update가 entity를 되살리는 것 방지
undo 지원
sync reconciliation
```

---

## 21.63 Delete Wins over Older Update

revision이 더 오래된 update가 삭제 tombstone 뒤에 도착하면 무시한다.

---

## 21.64 Restore after Delete

Undo/Trash restore는 명시적인 더 새로운 mutation이어야 한다.

stale update와 구분한다.

---

## 21.65 Store Hydration

App 시작 시 local cached entities를 먼저 hydrate할 수 있다.

```text
local cache
↓ immediate render
remote sync
↓ reconcile
```

빠른 startup과 offline을 지원한다.

---

## 21.66 Hydration Does Not Mean Fresh

Local data는 stale일 수 있다.

UI는 필요 시 sync indicator를 사용하되 화면을 빈 skeleton으로 만들지 않는다.

---

## 21.67 Detail Hydration

Deep-linked Task가 local cache에 있으면 즉시 Detail을 보여주고 background refresh 가능.

없으면 targeted fetch.

---

## 21.68 Partial Entity Loading

Task core가 먼저 있고 Attachments/Activity가 늦게 로드될 수 있다.

```text
Task core render
Attachment section loading
```

whole Detail block을 기다리지 않는다.

---

## 21.69 Store Indexes

Hierarchy/List/Tag query 성능을 위해 secondary index를 둘 수 있다.

예:

```text
taskIdsByList
childTaskIdsByParent
tagIdsByTask
attachmentIdsByTask
```

하지만 index는 canonical relation에서 재생성 가능해야 한다.

---

## 21.70 Index Consistency

Mutation command가 entity만 바꾸고 index를 안 바꾸는 상태를 만들지 않는다.

가능하면 store library/entity adapter가 atomic하게 관리한다.

---

## 21.71 Derived Cache

비싼 selector 결과를 memoize할 수 있다.

예:

```text
recursive descendant count
large filtered views
```

Canonical data mutation 시 올바르게 invalidate한다.

---

## 21.72 UI Store Scope

UI Store 예:

```ts
type TaskDetailUIState = {
  selectedTaskId: string | null;
  width: number;

  activePopover: unknown | null;
  contextTargetTaskId: string | null;

  expandedTaskIds: Set<string>;
};
```

Editor draft는 각 feature local/editor store에서 관리할 수도 있다.

---

## 21.73 Persistent UI Preferences

다음은 session을 넘어 저장할 수 있다.

예:

```text
Task Detail width
density
last used view
```

이들은 Task domain이 아니라 user preference storage다.

---

## 21.74 Non-persistent UI State

다음은 refresh 후 복원하지 않는다.

```text
hover
activePopover
context menu
selection range
drag state
toast
```

---

## 21.75 Selected Task Persistence

Task selection을 refresh 후 복원할지는 URL이 source라면 Router가 담당한다.

별도 localStorage `selectedTaskId`와 URL을 동시에 source로 두지 않는다.

---

## 21.76 View State

각 Main View는 다음 UI/query state를 가질 수 있다.

```text
filter
sort
group
scroll position
```

Task Detail 열고 닫는다고 이를 초기화하지 않는다.

---

## 21.77 Scroll Preservation

Detail open/close/Task switch 시 Main View scroll position 유지.

Explicit primary navigation에서만 새 View scroll policy를 적용.

---

## 21.78 Detail Scroll on Task Switch

Task A → B로 Detail content가 바뀌면 기본적으로 Detail scroll을 top으로 reset하는 것을 권장한다.

단 browser Back에서 이전 Task scroll을 복원할지는 별도 history enhancement로 둘 수 있다.

V1:

```text
new selectedTaskId
→ Detail scrollTop = 0
```

이 단순하고 예측 가능하다.

---

## 21.79 Editor State on Task Switch

Task A editor local state는 flush/cleanup.

Task B editor는 B canonical data에서 새 draft 생성.

A draft가 B에 재사용되면 안 된다.

---

## 21.80 Popover State on Task Switch

모든 owner-task-specific floating state clear.

---

## 21.81 Undo State and Navigation

Undo history는 View navigation으로 자동 clear하지 않는다.

예:

```text
Delete in Study
→ Today navigate
→ Undo 가능
```

17장 rule과 일치.

---

## 21.82 Mutation Queue and Navigation

pending save도 navigation/unmount와 무관하게 유지된다.

```text
Component lifecycle
≠
Mutation lifecycle
```

---

## 21.83 Offline Reconciliation

Offline 동안 local mutations:

```text
#1
#2
#3
```

이 쌓이고 remote도 바뀌었다면 reconnect 시 revision/conflict-aware sync를 수행한다.

무조건 local full snapshot overwrite를 하지 않는다.

---

## 21.84 Server Snapshot Merge

Remote full snapshot을 받을 때도:

```text
pending local mutation
active drafts
local-only entities
```

를 고려한 merge가 필요하다.

---

## 21.85 Initial Sync

앱 시작:

```text
1. UI preferences hydrate
2. Local domain hydrate
3. Router resolve
4. Main/Detail render
5. Remote sync
6. Reconcile
```

정확한 구현은 framework에 맞게 조정할 수 있다.

---

## 21.86 Sync Failure

Remote sync 실패:

```text
local data 유지
offline/stale indicator
retry
```

화면 전체를 사용할 수 없게 만들지 않는다.

---

## 21.87 Permission Change

Remote permission이 변경되면:

```text
editable → read-only
```

로 UI capability를 업데이트할 수 있다.

Active unsaved draft가 있으면 recovery feedback이 필요하다.

---

## 21.88 Entity Not Found after Move/Delete

Query refetch 중 Task가 current endpoint에서 안 보인다고 즉시 “deleted”로 판단하지 않는다.

Task가 다른 List로 이동했을 수 있다.

Task identity endpoint/normalized store를 기준으로 존재 여부를 판단한다.

---

## 21.89 View-local Optimistic Ghost 금지

예:

```text
Board에서만 ghost card
Detail은 old state
```

처럼 서로 다른 optimistic copy를 만들지 않는다.

필요한 drag placeholder는 UI state지만 final optimistic entity position은 canonical store에 반영한다.

---

## 21.90 Drag Preview vs Domain

Drag 중 아직 drop되지 않은 위치는 transient UI state다.

```text
drag preview
→ UI Store
```

Drop 확정:

```text
→ domain mutation
```

drag hover만으로 canonical sortKey를 계속 바꾸지 않는다.

---

## 21.91 Form Draft vs Domain

Custom Repeat dialog:

```text
temporary rule draft
```

는 UI/Form state.

Confirm:

```text
RecurrenceSeries domain update
```

Cancel:

```text
draft discard
```

---

## 21.92 Error State Ownership

Save error:

```text
Mutation state
```

Validation error:

```text
Editor/Form UI state
```

Domain entity에 영구 `errorMessage`를 저장하지 않는다.

---

## 21.93 Loading State Ownership

Loading status도 domain field가 아니다.

예:

```text
taskLoadStatus
attachmentLoadStatus
```

는 query/sync layer에서 관리한다.

---

## 21.94 State Machine Use

복잡한 feature에는 explicit state machine을 고려할 수 있다.

예:

```text
Attachment upload
Recurring scope
Task Detail loading
```

하지만 단순 boolean을 state machine으로 과도하게 복잡하게 만들지는 않는다.

---

## 21.95 Debugging State

개발 모드에서 다음을 inspect 가능하게 한다.

```text
selectedTaskId
current route
entity revision
pending mutations
active popover
editor dirty state
sync status
```

race condition 진단에 유용하다.

---

## 21.96 Logging

State sync 로그는 entity ID/mutation ID 중심으로 남길 수 있다.

사용자 Description 전체 content를 debug telemetry에 불필요하게 기록하지 않는다.

---

## 21.97 Test Scenarios

반드시 테스트할 대표 race/state scenario:

```text
Edit title → immediately switch Task
Complete → immediately reopen
Move List → current row disappears
Delete → immediately Undo
Open Date Popover → switch Task
Reorder twice rapidly
Remote title update while Description editing
Remote delete while Title dirty
Refresh deep-linked Task
Offline edit → reconnect
Browser Back across Task selections
```

---

## 21.98 Integration Test

단일 component unit test뿐 아니라:

```text
Main View
+
Task Detail
+
Router
+
Mutation Queue
```

통합 테스트가 필요하다.

State synchronization bug는 component 하나만 테스트해서 잡히지 않는 경우가 많다.

---

## 21.99 Prohibited Patterns

- Main/List/Board/Detail마다 별도 Task copy 유지
- `isDetailOpen`과 `selectedTaskId`를 독립 source로 관리
- UI transient state를 Task domain에 저장
- Popover open state를 URL에 저장
- URL과 selectedTaskId가 서로 무한 sync loop 생성
- query에서 Task가 사라졌다고 Detail 자동 close
- background fetch old response가 optimistic state 덮어쓰기
- Task A fetch 늦은 응답이 selectedTaskId를 A로 되돌리기
- Delete 후 stale save가 Task를 다시 살리기
- remote full snapshot으로 active local draft 덮어쓰기
- small mutation마다 전체 workspace refetch
- View별 count를 수동 +1/-1
- List rename/Tag rename 때문에 Task 전체 rewrite
- component unmount와 mutation lifecycle을 동일시
- drag hover 중 canonical data를 계속 mutation
- localStorage selectedTaskId와 URL을 동시에 source of truth로 사용
- error/loading state를 Task entity 영구 field로 저장
- stale remote event를 revision 확인 없이 적용

---

## 21.100 Acceptance Criteria

### Canonical State

- [ ] Task/CheckItem/Tag/Attachment가 normalized canonical entity로 관리된다.
- [ ] Main/List/Board/Calendar/Search/Detail이 같은 Task entity를 읽는다.
- [ ] View별 Task copy를 source of truth로 만들지 않는다.
- [ ] Derived count/progress/query membership을 selector로 계산한다.

### UI / Route State

- [ ] `selectedTaskId` 하나가 Detail open state를 결정한다.
- [ ] Focus/Popover/Edit state가 Task domain과 분리된다.
- [ ] URL이 primary view/Task identity를 복원할 수 있다.
- [ ] transient Popover/editor state는 URL에 저장하지 않는다.
- [ ] Browser Back/Forward와 Task selection이 동기화된다.
- [ ] route/store sync loop를 방지한다.

### Cross-view Sync

- [ ] Detail Title 변경이 Main/Board/Calendar/Search에 즉시 반영된다.
- [ ] Main inline status 변경이 열린 Detail에 즉시 반영된다.
- [ ] Schedule 변경이 Calendar와 양방향으로 동기화된다.
- [ ] Tag/List 변경이 Sidebar/filter/grouping에 즉시 반영된다.
- [ ] Child/CheckItem/Attachment 변경이 관련 derived UI에 반영된다.

### Selection Rules

- [ ] Task가 current query에서 빠져도 Detail은 유지된다.
- [ ] Explicit primary navigation에서 Detail을 닫을 수 있다.
- [ ] selected Task가 실제 삭제되면 Detail을 안전하게 닫는다.
- [ ] Task switch 시 Detail editor/popover state가 새 Task에 누수되지 않는다.
- [ ] Detail scroll reset/preservation 정책이 일관된다.

### Remote / Race Conditions

- [ ] Remote update를 revision-aware하게 reconcile한다.
- [ ] Active local draft를 remote update가 silent overwrite하지 않는다.
- [ ] 서로 다른 field remote/local update를 merge할 수 있다.
- [ ] stale fetch/response가 최신 optimistic state를 덮어쓰지 않는다.
- [ ] Delete tombstone 뒤 오래된 update가 entity를 resurrect하지 않는다.
- [ ] rapid status/reorder mutation에서 latest action이 승리한다.
- [ ] own remote echo를 deduplicate할 수 있다.

### Offline / Hydration

- [ ] Local cache hydrate 후 빠르게 UI를 렌더할 수 있다.
- [ ] Remote sync failure에도 local data를 사용할 수 있다.
- [ ] Pending mutation queue가 navigation/component lifecycle과 독립적이다.
- [ ] Offline edits를 reconnect 시 revision-aware하게 sync할 수 있다.
- [ ] Deep-linked Task를 local/remote source에서 안전하게 resolve할 수 있다.

### Architecture

- [ ] Domain/UI/Mutation/Route state의 책임이 분리된다.
- [ ] Sync transport와 domain reconciliation이 adapter로 분리된다.
- [ ] Query cache와 domain store가 conflicting source를 만들지 않는다.
- [ ] structural indexes/cache를 canonical relation과 일관되게 유지한다.
- [ ] integration test로 Router + Store + Detail + Mutation 흐름을 검증한다.

---

# 22. Edge Cases & Error Handling

## 22.1 Purpose

Edge Cases & Error Handling은 정상 흐름이 깨졌을 때도 Task Detail이 **데이터를 잃지 않고, 잘못된 상태를 확대하지 않고, 사용자가 다음 행동을 이해할 수 있게** 만드는 공통 예외 처리 규칙이다.

핵심 원칙:

```text
Detect
→ Contain
→ Explain
→ Recover
```

예외를 무조건 숨기거나 임의로 자동 수정하지 않는다.

---

## 22.2 Error Classes

오류는 최소 다음 범주로 나눈다.

```text
Validation Error
Not Found
Permission Error
Conflict
Network Error
Server Error
Corrupted / Malformed Data
Partial Transaction Failure
Storage / Attachment Error
Routing Error
Unsupported State
```

모든 오류를 동일한 generic message로 처리하지 않는다.

---

## 22.3 User-facing Severity

권장 수준:

```text
Info
Warning
Recoverable Error
Blocking Error
Fatal / Unrecoverable
```

가능한 한 사용자가 계속 작업할 수 있는 방향을 우선한다.

---

## 22.4 Validation Error

사용자 입력이 현재 규칙에 맞지 않는 경우:

예:

```text
Empty Title
Reminder in the past
Invalid end time
Too many attachments
Invalid Tag name
Max subtask depth exceeded
```

해당 입력 근처에서 inline으로 처리한다.

---

## 22.5 Validation Does Not Corrupt Domain

Validation 실패 상태는 UI draft에만 머물러야 한다.

```text
Invalid draft
→ canonical Task state unchanged
```

예:

```text
End time < Start time
```

인 임시 입력을 바로 `Task.schedule`에 저장하지 않는다.

---

## 22.6 Missing Task

URL/selection에 Task ID가 있지만 실제 Task를 찾을 수 없는 경우:

```text
Task unavailable
```

상태를 표시한다.

무한 spinner를 유지하지 않는다.

---

## 22.7 Missing Task Recovery

가능한 action:

```text
Go back
Return to current List
Open Inbox
```

Trash/restore 기능이 있다면:

```text
Restore
```

를 제공할 수 있다.

---

## 22.8 Deleted Task

Task가 soft deleted인 경우 live Task Detail로 그대로 편집하지 않는다.

정책:

```text
Deleted Task
→ unavailable / Trash mode
```

삭제 Undo window 중이라면 Undo flow를 사용한다.

---

## 22.9 Remote Delete While Open

현재 Task Detail을 보고 있는데 다른 device에서 삭제됨:

```text
remote delete
↓
Task no longer editable
```

권장 처리:

```text
Detail close 또는 unavailable state
+
"This task was deleted elsewhere."
```

Local dirty draft가 있으면 즉시 폐기하지 않는다.

---

## 22.10 Dirty Draft + Remote Delete

예:

```text
Description local draft 존재
+
Remote Task deleted
```

권장:

```text
Task was deleted elsewhere.
Copy draft / Save as new task
```

같은 recovery path로 확장 가능하다.

V1 최소 요구:

> local draft를 조용히 삭제하지 않는다.

---

## 22.11 Missing List

Task의 `listId`가 존재하지 않는 List를 가리키는 경우 정상 invariant 위반이다.

조용히 arbitrary List name을 보여주지 않는다.

---

## 22.12 Missing List Recovery

가능한 repair:

```text
Move Task to Inbox
```

단 자동 repair는 sync/domain repair layer에서 명시적으로 수행한다.

UI가 render 중 몰래 `listId`를 수정하지 않는다.

---

## 22.13 Deleted List

Task가 속한 List가 삭제됐는데 migration이 아직 반영되지 않은 transient 상태가 있을 수 있다.

예:

```text
List deleted
Task migration pending
```

UI는 임시:

```text
List unavailable
```

를 표시할 수 있다.

migration 완료 후 fallback List를 반영한다.

---

## 22.14 Missing Parent Task

Subtask의 `parentTaskId`가 가리키는 Task가 존재하지 않으면 orphan 상태다.

정상 command flow에서는 발생하면 안 된다.

---

## 22.15 Orphan Task Handling

UI에서는:

```text
Parent unavailable
```

로 표시하고 hierarchy action을 제한할 수 있다.

자동으로 root로 승격하지 않는다.

Repair command를 통해 명시적으로 복구한다.

---

## 22.16 Parent Deleted but Child Live

정상 invariant 위반.

가능한 원인:

```text
partial sync
legacy data
migration bug
corruption
```

domain repair layer가 탐지해야 한다.

---

## 22.17 Cycle Detection

Hierarchy load 시 방어적으로 cycle을 검사할 수 있다.

예:

```text
A → B → C → A
```

UI recursive render가 무한 루프에 빠지지 않게 한다.

---

## 22.18 Cycle UI Fallback

Cycle 감지:

```text
Hierarchy unavailable
```

같은 safe fallback을 사용하고 recursive descendant rendering을 중단한다.

corrupted relation을 자동 rewrite하지 않는다.

---

## 22.19 Max Depth Overflow

Legacy/corrupted data가 UI max depth보다 깊을 수 있다.

이 경우 기존 데이터를 강제 flatten하지 않는다.

표시는 가능하면 유지하되 추가 indent/reparent를 제한한다.

---

## 22.20 Missing CheckItem Parent

CheckItem의 `taskId`가 존재하지 않으면 orphan CheckItem이다.

일반 Task Detail에서 렌더하지 않는다.

cleanup/repair 대상으로 표시한다.

---

## 22.21 Missing Attachment Parent

Attachment의 `taskId`가 유효하지 않으면 orphan metadata다.

UI에 독립 파일처럼 표시하지 않는다.

storage cleanup/reconciliation 대상으로 보낸다.

---

## 22.22 Malformed Task Data

예:

```text
status = "donee"
priority = "urgent"
title = null
```

같은 예상 밖 값을 runtime에서 방어한다.

---

## 22.23 Schema Validation

Remote/local persisted entity hydrate 시 schema validation을 수행할 수 있다.

예:

```text
Zod
Valibot
JSON Schema
custom validator
```

기술 선택과 무관하게 boundary validation을 둔다.

---

## 22.24 Unknown Enum Value

새 버전/구버전 호환 문제로 unknown enum이 들어올 수 있다.

기본:

```text
safe fallback
+
telemetry/log
```

예:

```text
unknown priority
→ render as none visually
```

단 domain 값을 몰래 rewrite하지 않는다.

---

## 22.25 Null / Missing Title

Task Title은 invariant상 non-empty여야 하지만 legacy corruption에서 null이 들어올 수 있다.

UI fallback:

```text
Untitled task
```

같은 표시용 값 사용 가능.

Canonical repair는 명시적 migration에서 처리.

---

## 22.26 Overlong Text

서버/legacy data가 현재 max length보다 길 수 있다.

기존 content를 잘라 저장하지 않는다.

표시는 유지하고 새 edit 시 정책을 명확히 한다.

예:

```text
Existing 600 chars
Current max 500
```

→ read 가능
→ editing 시 warning / migration policy

---

## 22.27 Invalid Schedule

예:

```text
endAt < startAt
allDay=true인데 timestamp 포함
timezone invalid
```

정상 UI에서 만들면 안 되는 상태다.

---

## 22.28 Invalid Schedule Rendering

UI는 crash하지 않고 안전한 fallback을 사용한다.

예:

```text
Schedule unavailable
```

또는 start 값만 표시.

사용자에게 silent correction하지 않는다.

---

## 22.29 Invalid Timezone

IANA timezone ID가 더 이상 인식되지 않거나 malformed인 경우:

```text
timezone unavailable
```

fallback 표시.

기본 OS timezone로 조용히 재저장하지 않는다.

---

## 22.30 DST Invalid Local Time

DST 전환으로 존재하지 않는 local time이 생길 수 있다.

예:

```text
02:30가 존재하지 않는 날
```

사용자 입력 시:

```text
nearest valid time 제안
```

또는 명확한 validation.

---

## 22.31 DST Ambiguous Time

한 local time이 두 번 존재하는 fall-back 상황은 timezone offset을 명확히 resolve해야 한다.

internal instant를 모호하게 저장하지 않는다.

---

## 22.32 Invalid Reminder

예:

```text
relative reminder인데 schedule 없음
absoluteAt invalid
negative malformed offset
```

실행 대상에서 제외하고 error/recovery 가능하게 한다.

---

## 22.33 Reminder Scheduler Failure

Reminder 데이터 저장 성공 후 OS/browser notification scheduling 실패 가능.

구분:

```text
Reminder saved
Notification scheduling failed
```

사용자에게:

```text
Reminder saved, but notifications are unavailable.
```

처럼 의미를 정확히 전달한다.

---

## 22.34 Notification Permission Revoked

기존 Reminder는 남아 있어도 notification이 발송되지 않을 수 있다.

UI에서:

```text
Notifications disabled
```

상태를 별도로 알려준다.

Reminder data를 자동 삭제하지 않는다.

---

## 22.35 Invalid Recurrence Rule

예:

```text
interval = 0
count = -1
until < start date
empty weekday set
```

정상 UI에서는 저장 차단.

legacy data에서는 safe fallback.

---

## 22.36 Recurrence Expansion Failure

무한 loop나 비정상적으로 많은 occurrence를 생성하지 않도록 guard를 둔다.

예:

```text
max generated occurrences per query range
```

range-based expansion을 사용한다.

---

## 22.37 Recurrence Exception Missing Series

Exception이 존재하지만 Series가 없음:

```text
orphan exception
```

normal occurrence로 임의 변환하지 않는다.

repair 대상.

---

## 22.38 Recurrence Series Split Failure

`This and future` 편집 중 Series split이 일부만 저장되면 안 된다.

transaction 실패:

```text
old series unchanged
new series removed
exceptions unchanged
```

로 rollback.

---

## 22.39 Duplicate Occurrence Identity

같은:

```text
(seriesId, occurrenceStart)
```

identity가 중복 materialize되면 duplicate Task 표시 위험이 있다.

unique constraint 또는 reconciliation guard를 둔다.

---

## 22.40 Past Reminder after Schedule Change

Schedule 변경으로 relative reminder가 과거 시점이 될 수 있다.

정책:

```text
future schedule에 맞춰 recompute
```

또는 invalid 표시.

이미 지나간 reminder를 즉시 firing하지 않는다.

---

## 22.41 Save While Closing Browser

Browser/tab close 직전 pending draft가 있을 수 있다.

다음에만 의존하지 않는다.

```text
last-second network request
```

가능하면 local durable draft/store에 이미 기록돼 있어야 한다.

---

## 22.42 Browser Crash

Description 등 중요한 장문 draft는 local draft recovery로 확장 가능해야 한다.

다음 실행 시:

```text
Recovered unsaved draft
```

를 제공할 수 있다.

---

## 22.43 App Restart During Mutation

예:

```text
Move Task pending
app crash
```

local mutation queue가 durable하면 restart 후 재전송/reconcile.

없다면 server/local revision 비교로 상태를 복구한다.

---

## 22.44 Partial Transaction Failure

다중 entity mutation의 일부가 server에서 성공하고 일부 실패하는 상황을 backend transaction으로 방지하는 것이 우선이다.

불가피하면 compensating transaction/reconciliation을 사용한다.

---

## 22.45 Never Hide Partial Failure

예:

```text
Parent moved
Children failed
```

인데 UI가 성공처럼 끝나면 안 된다.

해당 hierarchy를 repair state로 표시하고 자동/수동 복구를 수행한다.

---

## 22.46 Duplicate Request

네트워크 timeout으로 같은 request가 재전송될 수 있다.

Create/Duplicate/Delete/Conversion 등에 idempotency key를 사용한다.

---

## 22.47 Duplicate Task Creation Failure

Duplicate action 중 일부 subtree만 생성된 경우:

```text
partial copy 제거
```

또는 transaction rollback.

원본은 절대 수정하지 않는다.

---

## 22.48 Delete During Upload

Task에 Attachment upload 중인데 Task Delete:

권장:

```text
Task delete
↓
upload cancel
↓
temporary storage cleanup
```

Task가 삭제됐는데 orphan upload가 계속 진행되지 않게 한다.

---

## 22.49 Delete Attachment During Upload

Uploading Attachment Delete/Remove:

```text
abort transfer
remove placeholder
cleanup temporary remote object
```

---

## 22.50 Upload Finishes after Delete

Race:

```text
Attachment delete
↓
upload completion response arrives
```

late success가 Attachment를 다시 `ready`로 resurrect하지 않게 sequence/status guard를 둔다.

---

## 22.51 Unsupported Preview

파일 형식을 preview할 수 없으면:

```text
Preview unavailable
Download
```

로 처리한다.

오류 modal을 반복 띄우지 않는다.

---

## 22.52 Corrupted Attachment Metadata

예:

```text
ready인데 storageKey 없음
mimeType invalid
fileSize negative
```

safe error state:

```text
Attachment unavailable
```

을 사용.

---

## 22.53 Storage File Missing

Metadata는 있지만 binary object가 없음:

```text
File unavailable
```

Retry download만 반복하지 않는다.

reconciliation/repair 대상으로 기록한다.

---

## 22.54 Permission Revoked While Open

현재 Task를 편집 중 권한이 read-only로 변경될 수 있다.

권장:

```text
active input stop/flush attempt
↓
server rejects
↓
read-only state
↓
local draft recovery
```

---

## 22.55 Read-only Mode

권한이 없는 Task Detail은:

```text
View content
Copy link
Navigate
```

등 허용 가능한 기능만 유지.

편집 control은 hidden/disabled policy를 일관되게 적용한다.

---

## 22.56 Permission Error after Optimistic Mutation

예:

```text
Priority High optimistic
↓
403 Forbidden
```

→ previous state rollback
→ permission feedback
→ capability refresh

---

## 22.57 List Deleted During Move

Task를 List B로 이동하는 순간 B가 remote에서 삭제될 수 있다.

Move transaction 실패:

```text
original List restore
```

가능하지 않으면 Inbox fallback을 **명시적 repair command**로 수행한다.

---

## 22.58 Parent Deleted During Reparent

Child를 Parent B로 옮기는 중 Parent B가 삭제됨:

```text
reparent fail
→ original hierarchy restore
```

새 orphan을 만들지 않는다.

---

## 22.59 Concurrent Reparent

Device A/B가 같은 Child를 다른 Parent로 이동:

```text
revision conflict
```

silent merge 금지.

최종 하나의 parent만 존재해야 한다.

---

## 22.60 Concurrent Reorder

같은 sibling set reorder 충돌 시:

```text
sortKey conflict
```

가 발생할 수 있다.

최종 order가 deterministic해야 한다.

필요하면 rebalance/reconciliation 수행.

---

## 22.61 `sortKey` Collision

fractional ordering에서 동일/너무 가까운 key가 생길 수 있다.

background rebalance를 지원한다.

UI reorder interaction 중 전체 sibling rewrite는 피하되 필요 시 maintenance operation으로 정리한다.

---

## 22.62 Rebalance Safety

`sortKey` rebalance는 visible order를 바꾸지 않아야 한다.

단순 internal key normalization이다.

---

## 22.63 Empty Query After Mutation

현재 View에서 마지막 Task를 이동/완료/삭제하면 Main View가 empty가 될 수 있다.

Detail이 유지되는 경우와 닫히는 경우를 구분한다.

예:

```text
Move out
→ Detail 유지 + Main empty

Delete selected Task
→ Detail close + Main empty
```

---

## 22.64 Focus When Last Row Disappears

focus fallback:

```text
Main View heading
Add Task control
empty-state primary action
```

중 안정적인 target으로 이동.

`document.body`에 focus가 사라지지 않게 한다.

---

## 22.65 Invalid URL

잘못된 Task/List ID URL:

```text
404-like app state
```

를 제공.

App 전체 crash 금지.

---

## 22.66 Malformed Query Parameters

알 수 없는 sort/filter/query parameter는 safe default로 fallback할 수 있다.

사용자 domain data를 변경하지 않는다.

---

## 22.67 Unsupported Future URL State

앱 버전이 오래되어 새로운 route parameter를 이해하지 못하는 경우 known part만 처리하고 나머지는 무시할 수 있다.

---

## 22.68 Popover Anchor Lost

Popover open 중 trigger unmount:

```text
close immediately
```

stale floating UI를 화면에 남기지 않는다.

---

## 22.69 Modal Origin Lost

Dialog close 시 원래 trigger가 사라졌다면 focus fallback:

```text
Task Detail heading
Main View stable anchor
```

사용.

---

## 22.70 Outside Click During Drag

Drag operation 중 outside-click dismiss가 잘못 실행되지 않게 한다.

예:

```text
Subtask drag
→ pointer leaves popover area
```

가 unrelated popover close를 과도하게 유발하지 않도록 interaction state를 고려한다.

---

## 22.71 Esc During IME

IME composition 중 Esc는 IME cancel에 사용될 수 있다.

전역 Popover/Detail close로 즉시 해석하지 않는다.

---

## 22.72 Double Enter / Rapid Click

빠른 반복 입력으로:

```text
Duplicate 2번
Delete 2번
Create Subtask 2번
```

이 발생하지 않게 pending guard/idempotency를 사용한다.

---

## 22.73 Long-running Mutation

예:

```text
Large subtree duplicate
```

가 오래 걸릴 수 있다.

UI 전체 block 대신 해당 action에 pending state 표시.

사용자는 다른 read interaction을 계속할 수 있게 한다.

---

## 22.74 Timeout

네트워크 request timeout은:

```text
unknown outcome
```

일 수 있다.

특히 create/delete에서 단순 failure로 단정하지 않는다.

idempotency key로 retry 후 상태를 확정한다.

---

## 22.75 409 Conflict

Server revision conflict:

```text
409
```

등이 오면 최신 remote entity를 가져와 reconciliation.

text active draft는 보존.

---

## 22.76 401 / Session Expiry

인증 만료:

```text
save 실패
```

시 Task content를 버리지 않는다.

로그인 복구 후 pending mutation을 재시도할 수 있게 한다.

---

## 22.77 403 Permission

권한 오류는 401과 다르다.

다시 로그인만 권하지 않는다.

```text
You no longer have permission to edit this task.
```

처럼 처리.

---

## 22.78 404 Entity

Task/List/Parent 등 entity 404는 stale local state 가능성을 의미한다.

targeted refetch/reconcile 후 unavailable 처리.

---

## 22.79 5xx Server Error

일시적 server error:

```text
local state/draft 유지
retry
```

대량 reset 금지.

---

## 22.80 Rate Limit

429:

```text
retry-after
```

를 존중.

autosave가 과도하게 request를 발생시키는 구조를 점검한다.

---

## 22.81 Offline False Positive

브라우저가 online이라고 해도 실제 API 연결 실패 가능.

실제 request 결과를 기준으로 sync state를 보정한다.

---

## 22.82 Clock Skew

Client `createdAt/completedAt`가 server clock과 다를 수 있다.

중요 ordering은 server revision을 우선.

UI timestamp는 server normalization 후 reconcile 가능.

---

## 22.83 Invalid Local Cache

IndexedDB/local cache schema가 오래됐거나 깨질 수 있다.

migration 실패 시:

```text
local cache reset
remote refetch
```

가능해야 한다.

단 unsynced mutation/draft가 있으면 먼저 recovery/export를 고려한다.

---

## 22.84 Cache Migration

App version update 시 local schema migration을 versioned하게 관리한다.

무조건 local DB 전체 삭제로 해결하지 않는다.

---

## 22.85 Unsupported Legacy Field

과거 필드는 migration layer에서 새 domain으로 변환한다.

UI component가 legacy field를 직접 조건 분기하며 영구 지원하지 않는다.

---

## 22.86 Partial Hydration

Task core는 있는데 relations가 아직 없을 수 있다.

예:

```text
Task loaded
Tags loading
Attachments loading
```

전체 Detail을 error로 판단하지 않는다.

---

## 22.87 Section-level Failure

Attachment만 load 실패:

```text
Task Detail 정상
Attachment section error
```

전체 Task를 unavailable로 만들지 않는다.

---

## 22.88 Section Retry

Section error는 해당 section에서 retry 가능해야 한다.

예:

```text
Couldn't load attachments
Retry
```

---

## 22.89 Duplicate Toast / Error Flood

같은 root cause로 여러 component가 동시에 error를 띄우지 않게 dedupe key를 사용한다.

예:

```text
offline
```

때 Title/Tag/Date 각각 Toast 3개 생성 금지.

---

## 22.90 Recovery-first Copy

오류 문구는 가능하면:

```text
무슨 일이 생겼는가
+
무엇을 할 수 있는가
```

를 포함한다.

예:

```text
Couldn't save your changes. Retry.
```

---

## 22.91 Technical Detail Logging

사용자 메시지에는:

```text
HTTP 500
stack trace
database key
```

를 직접 노출하지 않는다.

개발 로그/telemetry에만 기록.

---

## 22.92 Correlation ID

Server error debugging을 위해 내부 correlation/request ID를 기록할 수 있다.

필요 시 support UI에만 노출.

---

## 22.93 Data Loss Prevention Priority

여러 선택지가 있을 때 우선순위:

```text
1. User-entered unsaved content 보존
2. Domain invariant 유지
3. UI consistency
4. Visual polish
```

예외 상황에서는 animation보다 데이터 보존이 중요하다.

---

## 22.94 Fail Closed vs Fail Open

권한/보안:

```text
Fail closed
```

예:

```text
권한 확인 불가
→ edit 차단
```

일반 local viewing:

```text
Fail open where safe
```

예:

```text
remote sync 실패
→ local data 읽기 계속
```

---

## 22.95 Repair Commands

Data corruption을 UI 렌더 중 몰래 수정하지 않는다.

명시적 repair command 예:

```ts
repairTaskList(taskId, fallbackListId)
repairOrphanTask(taskId)
rebuildSortKeys(parentId)
reconcileRecurrence(seriesId)
```

운영/admin layer에서 사용할 수 있다.

---

## 22.96 Defensive Rendering

UI는 malformed entity 하나 때문에 전체 App이 crash하지 않도록 Error Boundary/defensive selectors를 사용할 수 있다.

---

## 22.97 Error Boundary Scope

권장:

```text
App Shell
Main View
Task Detail
Heavy section
```

단 작은 button마다 Error Boundary를 둘 필요는 없다.

---

## 22.98 Task Detail Error Boundary

Task Detail content render crash:

```text
Couldn’t display this task.
Reload task / Close
```

같은 recovery UI.

Main View까지 같이 crash시키지 않는다.

---

## 22.99 Telemetry

관찰할 error metrics:

```text
save failures
conflicts
rollback failures
orphan relations
schema validation failures
attachment failures
recurrence expansion failures
stale-response suppressions
```

사용자 content 자체를 불필요하게 수집하지 않는다.

---

## 22.100 Test Strategy

Edge Case는 단위 테스트만으로 부족하다.

최소:

```text
Unit
Integration
Failure injection
Offline simulation
Race-condition tests
Migration tests
```

를 조합한다.

---

## 22.101 Failure Injection

개발 환경에서 의도적으로 다음을 만들 수 있으면 좋다.

```text
save delay
save failure
409 conflict
403 permission
offline
attachment upload failure
remote delete
stale response
```

실제 recovery UX를 검증하기 쉽다.

---

## 22.102 Must-test Scenarios

반드시 검증:

```text
Title typing → immediate Task switch
Description dirty → browser close
Complete → immediate Reopen
Delete → immediate Undo
Move → target List deleted
Reparent → target Parent deleted
Attachment upload → Task deleted
Remote delete → local dirty draft
Recurring split → transaction failure
Tag rename → remote stale cache
Popover open → owner unmount
Offline edits → app restart → reconnect
```

---

## 22.103 Prohibited Patterns

- 모든 오류를 `Something went wrong` 하나로 처리
- Not Found를 무한 loading으로 표시
- malformed data를 render 중 임의로 canonical rewrite
- Missing Parent Task를 자동 root 승격
- Missing List를 조용히 임의 List로 변경
- Invalid schedule/recurrence를 silent normalize 후 저장
- active local draft를 remote delete/conflict에서 즉시 폐기
- partial transaction failure를 성공처럼 표시
- Attachment metadata와 storage state 불일치를 무시
- stale response가 deleted entity를 resurrect
- 401/403/404/409/429/5xx를 동일 retry UX로 처리
- offline일 때 local content 전체 사용 불가 처리
- local cache 문제를 항상 전체 삭제로 해결
- section 하나 load 실패했다고 전체 Detail error
- 같은 root error로 Toast 무한 생성
- 사용자 UI에 stack trace/DB detail 노출
- exception recovery에서 animation/visual polish를 데이터 보존보다 우선

---

## 22.104 Acceptance Criteria

### Validation / Malformed Data

- [ ] Invalid draft가 canonical domain에 저장되지 않는다.
- [ ] Unknown enum/malformed field가 App 전체 crash를 일으키지 않는다.
- [ ] Boundary에서 schema validation을 수행할 수 있다.
- [ ] Legacy/overlong data를 임의 truncate하지 않는다.
- [ ] Invalid schedule/reminder/recurrence를 안전하게 처리한다.

### Missing / Deleted Entities

- [ ] Missing Task가 무한 loading되지 않는다.
- [ ] Deleted Task를 live editable state로 표시하지 않는다.
- [ ] Missing List/Parent를 탐지할 수 있다.
- [ ] Orphan relation을 silent repair하지 않는다.
- [ ] Deleted Parent + live Child 상태를 repair 대상으로 감지한다.

### Race Conditions

- [ ] Delete 후 late save가 entity를 resurrect하지 않는다.
- [ ] Upload delete 후 late success가 attachment를 resurrect하지 않는다.
- [ ] Complete/Reopen rapid mutation에서 최신 action이 승리한다.
- [ ] Reorder/Reparent race를 revision-aware하게 처리한다.
- [ ] Popover owner unmount 시 stale floating UI가 닫힌다.

### Persistence / Transactions

- [ ] Structural mutation은 atomic하게 처리할 수 있다.
- [ ] Partial transaction failure를 감지/rollback할 수 있다.
- [ ] Retry에서 idempotency를 사용할 수 있다.
- [ ] Timeout의 unknown outcome을 안전하게 reconcile할 수 있다.
- [ ] Rollback 실패도 별도 error로 처리할 수 있다.

### Permissions / Network

- [ ] 401/403/404/409/429/5xx를 구분한다.
- [ ] Permission revoked 시 read-only/recovery flow를 제공한다.
- [ ] Offline에서도 local data를 계속 사용할 수 있다.
- [ ] Reconnect 후 pending mutation을 다시 sync할 수 있다.
- [ ] Server authority가 필요한 경우 optimistic state를 안전하게 rollback한다.

### Attachments

- [ ] Upload 중 Task/Attachment 삭제를 안전하게 처리한다.
- [ ] Missing binary/corrupted metadata를 safe unavailable state로 표시한다.
- [ ] Attachment section error가 전체 Detail을 막지 않는다.
- [ ] Retry/cleanup lifecycle이 명확하다.

### Recovery / UX

- [ ] Local dirty draft를 conflict/remote delete에서 보존할 수 있다.
- [ ] Error message가 문제와 recovery action을 명확히 전달한다.
- [ ] Persistent error를 자동으로 숨기지 않는다.
- [ ] Duplicate feedback/error flood를 dedupe할 수 있다.
- [ ] Focus fallback이 entity 삭제/empty view에서도 안정적이다.

### Reliability / Testing

- [ ] Defensive rendering/Error Boundary를 사용할 수 있다.
- [ ] Failure injection으로 주요 오류를 재현할 수 있다.
- [ ] Offline/race/migration/integration test를 포함한다.
- [ ] Error telemetry를 content 최소화 원칙으로 수집할 수 있다.
- [ ] Data loss prevention을 예외 처리의 최우선 원칙으로 유지한다.

---

# 23. Accessibility

## 23.1 Purpose

Accessibility는 Task Detail을 mouse 중심 UI가 아니라 **keyboard, screen reader, zoom, high contrast, reduced motion, touch** 환경에서도 동일한 핵심 기능을 사용할 수 있도록 만드는 공통 품질 기준이다.

핵심 원칙:

```text
Same capability
Different interaction method
```

접근성은 별도 “접근성 모드”가 아니라 기본 컴포넌트/interaction 자체에 포함한다.

---

## 23.2 Accessibility Baseline

Task Detail은 최소 다음 기준을 목표로 한다.

```text
Keyboard-only usable
Screen-reader understandable
Visible focus
Sufficient contrast
Zoom/reflow safe
Reduced Motion aware
Touch alternative available
```

가능하면 WCAG 2.2 AA 수준을 기본 구현 기준으로 삼는다.

---

## 23.3 Native Semantics First

가능하면 custom div보다 native semantic element를 우선한다.

예:

```text
button
input
textarea
checkbox
list
heading
dialog
```

다음처럼 보이기만 button인 `div`를 만들지 않는다.

```html
<div onclick="...">
```

필요한 경우에만 ARIA로 보완한다.

---

## 23.4 No ARIA Is Better Than Bad ARIA

잘못된 ARIA role/state는 native semantics보다 접근성을 악화시킬 수 있다.

원칙:

```text
Native first
ARIA second
Custom role last
```

---

## 23.5 Task Detail Landmark

Task Detail Pane은 독립 region으로 인식 가능해야 한다.

예:

```html
<aside aria-label="Task details">
```

또는:

```html
<section aria-labelledby="task-title-id">
```

실제 layout semantics에 맞는 element를 선택한다.

---

## 23.6 Accessible Heading

Task Title 또는 별도 hidden heading을 Task Detail의 heading으로 사용할 수 있다.

예:

```text
Heading: "Weekly Meeting"
Region: "Task details"
```

Screen reader 사용자가 현재 열린 Task context를 이해할 수 있어야 한다.

---

## 23.7 Heading Hierarchy

Task Detail 내부 heading level을 의미 있게 유지한다.

예:

```text
Task Title
  Subtasks
  Attachments
```

UI size를 맞추기 위해 heading level을 건너뛰거나 모든 label을 heading으로 만들지 않는다.

---

## 23.8 Accessible Names

Icon-only control에는 accessible name이 필수다.

예:

```text
Close task details
Set due date
Set priority
Open more actions
Add attachment
```

아이콘 자체의 파일명/Unicode 이름에 의존하지 않는다.

---

## 23.9 Visible Label vs Accessible Name

가능하면 visible text와 accessible name을 일치시킨다.

예:

```text
Visible: Delete
Accessible: Delete task
```

맥락을 더해도 사용자가 혼동할 정도로 다른 표현을 사용하지 않는다.

---

## 23.10 Tooltip Is Not the Label

Tooltip이 있다고 해서 accessible name이 자동 보장되는 것은 아니다.

Icon button은 tooltip과 별개로:

```text
aria-label
```

또는 visible label association을 가져야 한다.

---

## 23.11 Button Semantics

Complete, Date, Priority, More, Close 같은 control은 실제 button semantics를 사용한다.

Keyboard:

```text
Enter
Space
```

로 활성화 가능해야 한다.

---

## 23.12 Checkbox Semantics

Task completion / CheckItem completion은 실제 checkbox semantics를 제공한다.

예:

```text
checked=false
checked=true
```

Screen reader가 현재 완료 여부를 읽을 수 있어야 한다.

---

## 23.13 Checkbox Accessible Name

Task checkbox:

```text
Mark task complete
Mark task incomplete
```

CheckItem:

```text
Mark “Prepare slides” complete
```

처럼 대상과 action을 함께 제공한다.

---

## 23.14 Status Is Not Color-only

다음 상태는 색상만으로 구분하지 않는다.

```text
Completed
Won't Do
Overdue
Priority
Error
Selected
Focus
```

아이콘, text, shape, semantics를 함께 사용한다.

---

## 23.15 Keyboard-only Completion

Mouse 없이 다음 흐름이 가능해야 한다.

```text
Task row focus
→ Detail open
→ Complete control focus
→ Space
→ status toggle
```

---

## 23.16 Keyboard Coverage

Keyboard-only로 최소 다음 기능을 사용할 수 있어야 한다.

```text
Open/close Task Detail
Edit title
Edit description
Toggle checklist
Create subtask
Set date
Set priority
Add/remove tags
Move list
Open More menu
Delete
Undo
Open/close popovers
Navigate menus
```

---

## 23.17 Tab Order

18장의 keyboard rule을 접근성 기준으로 검증한다.

```text
visual order
≈
DOM order
≈
Tab order
```

CSS order만 바꾸고 DOM 순서를 반대로 두지 않는다.

---

## 23.18 No Keyboard Trap

사용자가 Tab/Shift+Tab으로 특정 non-modal 영역에서 빠져나오지 못하는 상태를 만들지 않는다.

Task Detail은 Modal이 아니므로 focus trap을 사용하지 않는다.

---

## 23.19 Modal Focus Trap

Dialog/Modal만 focus trap을 사용한다.

예:

```text
Delete confirmation
Recurring scope
Full-screen attachment preview
```

Modal 닫힘 후 origin focus를 복원한다.

---

## 23.20 Focus Visible

Keyboard focus는 항상 보이게 한다.

권장:

```text
2px equivalent focus ring
clear offset
sufficient contrast
```

정확한 visual은 20장 token과 통합한다.

---

## 23.21 Focus Contrast

Focus indicator는 주변 background와 충분히 구분되어야 한다.

Light/Dark/Selected/Hover 모든 상태에서 보이는지 확인한다.

---

## 23.22 Focus Is Not Selected

Task row:

```text
selected
focused
```

는 서로 다른 상태다.

선택 background만으로 keyboard focus를 나타내지 않는다.

---

## 23.23 Focus Restoration

Popover/Dialog/Task Detail close 후 focus를 논리적인 origin에 복원한다.

원래 요소가 사라졌다면 fallback:

```text
next visible item
previous visible item
Main View heading
```

을 사용한다.

---

## 23.24 Focus after Delete

현재 Task 삭제 후 존재하지 않는 row에 focus를 남기지 않는다.

다음 안정적인 target으로 이동한다.

---

## 23.25 Focus after Reorder

Reorder 후 DOM 위치가 바뀌어도 focus는 같은 entity를 따라간다.

Index 기준으로 엉뚱한 item에 focus가 가면 안 된다.

---

## 23.26 Screen Reader Announcement Policy

중요한 상태 변화만 announce한다.

예:

```text
Task completed
Task deleted, Undo available
Upload failed
Task changed elsewhere
```

모든 autosave 성공을 반복 announce하지 않는다.

---

## 23.27 Live Regions

Feedback에 필요한 경우:

```text
aria-live="polite"
```

를 기본으로 사용한다.

즉각 주의가 필요한 blocking error만 더 강한 방식 고려.

---

## 23.28 Avoid Announcement Flood

다음은 반복 announce하지 않는다.

```text
Saving...
Saved...
Saving...
Saved...
```

Description typing마다 screen reader가 방해받지 않게 한다.

---

## 23.29 Editor Accessibility

Title:

```text
label = Task title
```

Description:

```text
label = Task description
```

Checklist Item:

```text
label = Checklist item
```

Placeholder만 label로 사용하지 않는다.

---

## 23.30 Rich Editor Semantics

Description에 heading/list/link를 지원한다면 가능한 한 semantic document structure를 제공한다.

예:

```text
Heading
Paragraph
List
List item
Link
```

단 editor library 내부 ARIA가 실제 screen reader와 호환되는지 검증한다.

---

## 23.31 Rich Editor Toolbar

Formatting control:

```text
Bold
Italic
Strikethrough
Link
```

은 accessible name/state를 제공한다.

예:

```text
aria-pressed=true
```

현재 selection에 Bold가 적용된 상태를 표현할 수 있다.

---

## 23.32 Slash Menu Accessibility

Slash Menu는 command menu/listbox semantics를 사용한다.

Screen reader는:

```text
“Heading, 1 of 6”
```

처럼 현재 option과 위치를 이해할 수 있어야 한다.

---

## 23.33 IME Accessibility

한국어/중국어/일본어 IME composition 중:

```text
Enter
Esc
Slash
```

를 전역 command로 잘못 처리하지 않는다.

접근성 keyboard logic과 IME logic을 분리하지 않는다.

---

## 23.34 Error Association

Input validation error는 해당 input과 programmatically 연결한다.

예:

```text
aria-describedby
aria-invalid=true
```

사용자가 focus했을 때 오류 내용을 이해할 수 있어야 한다.

---

## 23.35 Error Text

오류는 색상만으로 표시하지 않는다.

예:

```text
Reminder time has already passed.
```

같은 실제 text가 있어야 한다.

---

## 23.36 Required State

Task Title처럼 required field는 screen reader에서도 필수임을 전달할 수 있다.

단 UI가 draft state에서 temporary empty를 허용할 경우 실제 commit validation semantics와 일치시킨다.

---

## 23.37 Popover Semantics

Date/Tag/List/Reminder/Priority Popover는 해당 interaction에 맞는 role을 선택한다.

예:

```text
single select → listbox / menu
multi-select → listbox with selection state
commands → menu
```

무조건 모든 floating UI에 `role=menu`를 쓰지 않는다.

---

## 23.38 `aria-expanded`

Popover trigger:

```text
aria-expanded=true/false
```

를 제공한다.

필요하면:

```text
aria-controls
aria-haspopup
```

를 연결한다.

---

## 23.39 Menu Semantics

More / Context Menu:

```text
role=menu
role=menuitem
```

또는 사용하는 accessible primitive의 표준 semantics를 따른다.

Keyboard pattern과 role이 일치해야 한다.

---

## 23.40 Multi-select Tag Picker

Tag selected state:

```text
selected / checked
```

를 screen reader가 알 수 있어야 한다.

Tag를 선택했다고 picker가 닫히지 않는 multi-select semantics를 유지한다.

---

## 23.41 Calendar Accessibility

Calendar control은 날짜 grid semantics를 따른다.

Screen reader에 다음이 전달될 수 있어야 한다.

```text
date
selected
today
disabled
```

단 직접 ARIA grid를 구현하기보다 검증된 accessible date-picker primitive 사용을 권장한다.

---

## 23.42 Date Status Labels

색상만 보고 overdue/today를 판단하지 않게 한다.

Accessible text:

```text
Overdue, Aug 20
Today, Aug 23
```

등을 제공할 수 있다.

---

## 23.43 Priority Accessible Text

Priority flag:

```text
High priority
Medium priority
Low priority
No priority
```

를 명확히 읽을 수 있어야 한다.

---

## 23.44 Tag Accessibility

Tag chip:

```text
Tag: research
```

Remove:

```text
Remove research tag
```

를 분리한다.

Chip 전체가 삭제 버튼처럼 읽히지 않게 한다.

---

## 23.45 List Accessibility

Move List picker에서는 Folder group과 List option을 구분한다.

Folder label을 selectable option으로 오인하지 않게 semantic grouping을 사용한다.

---

## 23.46 Subtask Hierarchy Semantics

Subtask tree를 시각적으로 indent한다면 hierarchy level도 accessibility tree에서 알 수 있어야 한다.

가능한 방식:

```text
tree / treeitem
```

또는:

```text
list + nested list
```

실제 interaction 복잡도에 맞춰 선택한다.

---

## 23.47 Do Not Use Tree Role Lightly

단순한 flat Subtask list라면 굳이 ARIA tree를 사용하지 않는다.

`role=tree`를 쓰면 Arrow navigation 등 추가 keyboard contract가 생긴다.

UI 동작과 semantics가 일치할 때만 사용한다.

---

## 23.48 Checklist Semantics

Checklist Item은:

```text
checkbox
+
text input/label
```

구조가 명확해야 한다.

완료 text에 strikethrough가 있어도 checkbox state가 primary semantics다.

---

## 23.49 Drag & Drop Alternative

다음 action은 mouse drag가 유일한 방법이면 안 된다.

```text
Checklist reorder
Subtask reorder
Reparent
Indent
Outdent
```

대체:

```text
Move up
Move down
Indent
Outdent
Move to parent
```

menu/keyboard action을 제공한다.

---

## 23.50 Keyboard Drag Mode

필요하면 accessible sortable pattern을 사용할 수 있다.

예:

```text
Space → grab
Arrow → move
Space → drop
Esc → cancel
```

하지만 구현 복잡도가 높다면 explicit move menu가 더 안전할 수 있다.

---

## 23.51 Drag Announcement

Keyboard reorder를 지원한다면:

```text
“Moved Prepare slides to position 2 of 5”
```

같은 결과 announcement를 제공할 수 있다.

---

## 23.52 Pointer Target Size

Desktop에서도 너무 작은 hit target을 피한다.

Touch/mobile에서는 최소 target을 더 크게 잡는다.

권장 기준은 WCAG target-size guidance와 플랫폼 관례를 따른다.

---

## 23.53 Visual Icon vs Hit Area

예:

```text
16px icon
+
32–44px interaction area
```

처럼 보이는 크기와 클릭 영역을 분리한다.

---

## 23.54 Touch-only Hover 금지

Hover에서만 나타나는 핵심 action은 touch에서 접근 불가능하다.

핵심 action은:

```text
tap
More menu
focus
```

등으로 접근 가능해야 한다.

---

## 23.55 Long Press

Long-press context menu를 지원할 수 있지만 유일한 진입점으로 사용하지 않는다.

---

## 23.56 Zoom

Browser zoom 200%에서도 Task Detail 핵심 기능을 사용할 수 있어야 한다.

확인:

```text
Title
Description
Property controls
Popover
Menu
Dialog
Toast
```

가 잘리지 않는다.

---

## 23.57 Reflow

좁아진 viewport/zoom 환경에서 horizontal scroll을 강제하지 않도록 한다.

예외:

```text
필요한 data table
wide code
```

Task Detail 기본 UI는 reflow 가능해야 한다.

---

## 23.58 Text Resize

OS/browser text size가 커져도 fixed-height control 때문에 글자가 잘리지 않게 한다.

높이는 필요하면 content에 따라 늘어난다.

---

## 23.59 Long Localization

긴 번역 문자열에서도:

```text
button label
menu item
error message
```

가 잘리지 않거나 의미를 잃지 않게 한다.

---

## 23.60 Contrast

텍스트와 배경의 contrast를 충분히 확보한다.

특히:

```text
text-secondary
text-tertiary
placeholder
disabled
divider
focus ring
```

을 dark/light 모두에서 검사한다.

---

## 23.61 Placeholder Contrast

Placeholder는 secondary이지만 읽을 수 있어야 한다.

너무 낮은 opacity로 사실상 보이지 않게 하지 않는다.

---

## 23.62 Disabled Contrast

Disabled item도 label 자체는 인식 가능해야 한다.

낮은 opacity만으로 disabled를 표현하지 않고 interaction state도 함께 전달한다.

---

## 23.63 High Contrast Mode

Windows High Contrast / forced-colors 환경에서:

```text
focus
selected
checked
button
border
```

가 사라지지 않게 한다.

필요하면 `forced-color-adjust` 사용을 신중히 조정한다.

---

## 23.64 Color Blindness

Priority/Status/Date 의미가 색상 차이만으로 구분되지 않게 한다.

text/icon shape로 보완한다.

---

## 23.65 Reduced Motion

`prefers-reduced-motion`을 존중한다.

대상:

```text
Task Detail open
Popover
Toast
Reorder
Completion
Sheet
```

기능 정보 전달을 animation에만 의존하지 않는다.

---

## 23.66 No Auto-scrolling Surprise

Focus 변화 때문에 화면이 크게 튀는 scroll을 피한다.

필요한 경우:

```text
scrollIntoView({ block: "nearest" })
```

같은 최소 이동을 사용한다.

---

## 23.67 Animation and Focus

Popover가 animation 중이라고 focus를 늦게/불안정하게 주지 않는다.

DOM mount와 focus timing을 안정적으로 관리한다.

---

## 23.68 Screen Reader + Dynamic Content

Task switch로 Detail 내용이 바뀔 때 현재 context가 바뀌었음을 알릴 수 있다.

하지만 Task 본문 전체를 자동으로 다시 읽어주지는 않는다.

---

## 23.69 Screen Reader + Search Result

Subtask/Attachment filename match로 Task가 검색되었다면 결과 context를 제공한다.

예:

```text
“Weekly Meeting, match in attachment final-report.pdf”
```

---

## 23.70 Screen Reader + Progress

Checklist/Subtask progress:

```text
2 of 5 completed
```

처럼 text semantics를 제공한다.

원형 progress visual만 제공하지 않는다.

---

## 23.71 Upload Progress

Attachment upload:

```text
42%
```

를 accessible progressbar semantics로 전달한다.

너무 잦은 percentage announcement는 throttling할 수 있다.

---

## 23.72 Upload Failure

Failed Attachment:

```text
Upload failed
Retry
Remove
```

가 keyboard/screen reader로 접근 가능해야 한다.

---

## 23.73 Toast Accessibility

Toast는 중요한 상태만 live region으로 announce한다.

Toast action:

```text
Undo
Retry
```

는 keyboard로 접근 가능.

Toast가 나타났다고 focus를 자동 이동하지 않는다.

---

## 23.74 Modal Accessibility

Dialog:

```text
role=dialog
aria-modal=true
accessible title
```

를 갖는다.

필요한 경우 description을 연결한다.

---

## 23.75 Dialog Title

Delete confirmation 같은 Dialog에는 visible/accessible title이 있어야 한다.

예:

```text
Delete task and 4 subtasks?
```

---

## 23.76 Destructive Confirmation

Confirm button label:

```text
Delete
```

처럼 구체적으로 쓴다.

```text
OK
Yes
```

같은 맥락 없는 label을 피한다.

---

## 23.77 Sheet Accessibility

Mobile bottom sheet가 modal semantics라면 Dialog와 같은 focus/inert 규칙을 적용한다.

단 단순 non-modal sheet라면 실제 behavior에 맞는 semantics를 사용한다.

---

## 23.78 Attachment Preview Accessibility

Image preview:

```text
file name
close action
download/open action
```

을 접근 가능하게 제공한다.

이미지에 의미 있는 alt가 없다면 filename을 context로 사용할 수 있다.

---

## 23.79 Decorative Icons

text label 옆의 purely decorative icon은 screen reader에서 숨긴다.

```text
aria-hidden=true
```

같은 방식.

같은 의미를 두 번 읽지 않게 한다.

---

## 23.80 Icon-only Controls Are Not Decorative

반대로 icon 자체가 유일한 control이면 숨기면 안 된다.

button accessible name을 제공한다.

---

## 23.81 Status Icons

Completed/Won't Do/Priority icon이 visible text 없이 단독 노출되는 경우 accessible label이 필요하다.

---

## 23.82 Keyboard Shortcut Accessibility

Single-letter shortcut은 text input 중 실행되지 않는다.

Screen reader/browser reserved shortcut과 충돌하지 않게 한다.

필요하면 shortcut setting에서 disable 가능하게 확장할 수 있다.

---

## 23.83 `aria-keyshortcuts`

중요 shortcut에는 필요 시:

```text
aria-keyshortcuts
```

를 제공할 수 있다.

단 실제 shortcut registry와 일치해야 한다.

---

## 23.84 Shortcut Help

Keyboard shortcut help surface는 keyboard만으로 열고 닫을 수 있어야 한다.

Shortcut label은 Mac/Windows에 맞춰 표시한다.

---

## 23.85 Error Boundary Accessibility

Task Detail render error fallback도 keyboard와 screen reader로 사용할 수 있어야 한다.

예:

```text
Couldn’t display this task.
Reload task
Close
```

---

## 23.86 Loading Accessibility

Loading indicator에는 필요 시 accessible status를 제공한다.

하지만 local data가 즉시 보이면 불필요한 “Loading” announcement를 남발하지 않는다.

---

## 23.87 Skeleton Accessibility

Skeleton은 screen reader에서 decorative로 숨기거나 실제 loading state를 별도로 전달한다.

Skeleton block 하나하나를 읽게 하지 않는다.

---

## 23.88 Virtualized Lists

큰 Checklist/Subtask list를 virtualization할 경우 keyboard/screen reader 사용성을 검증한다.

문제 가능성:

```text
offscreen focus target unmount
incorrect item count
lost position
```

성능 때문에 접근성을 깨지 않게 한다.

---

## 23.89 Virtualized Count

Screen reader에:

```text
item 32 of 500
```

같은 positional context가 필요할 수 있다.

사용하는 virtualization library의 accessible pattern을 검증한다.

---

## 23.90 Contenteditable Caution

Description rich editor에서 `contenteditable`을 사용하면 브라우저/screen reader 호환성을 별도 테스트한다.

가능하면 검증된 editor framework를 사용한다.

---

## 23.91 Accessibility Testing Tools

자동화 테스트:

```text
axe-core
eslint jsx-a11y
browser accessibility tree
```

등을 사용할 수 있다.

하지만 자동 검사만으로 충분하지 않다.

---

## 23.92 Manual Keyboard Test

반드시 실제 keyboard-only flow를 테스트한다.

예:

```text
Open Task
Edit Title
Set Date
Set Priority
Add Tag
Add Subtask
Delete
Undo
Close Detail
```

mouse 없이 완료 가능한지 확인한다.

---

## 23.93 Screen Reader Smoke Test

최소 환경:

```text
Windows + NVDA + Chrome
macOS + VoiceOver + Safari
```

가능하면 주요 release 전에 smoke test를 수행한다.

---

## 23.94 CJK + Screen Reader

한국어 Task Title/Description과 IME를 실제로 테스트한다.

영어 placeholder만으로 accessibility QA를 끝내지 않는다.

---

## 23.95 Zoom Test

최소:

```text
100%
200%
```

필요하면 더 높은 text zoom도 검토한다.

---

## 23.96 Contrast Test

Light/Dark theme 각각에서:

```text
text
focus
error
placeholder
selected
disabled
```

contrast를 검사한다.

---

## 23.97 Reduced Motion Test

OS Reduced Motion 활성화 후:

```text
Detail
Popover
Toast
Sheet
Reorder
```

가 기능적으로 문제 없는지 확인한다.

---

## 23.98 Touch Test

모바일/터치:

```text
hit targets
sheet controls
drag alternatives
keyboard overlay
```

를 확인한다.

---

## 23.99 Accessibility Regression

다음 핵심 state를 accessibility regression 대상으로 둔다.

```text
Open Task
Completed Task
Won't Do
Title editing
Description editing
Checklist
Nested Subtasks
Date Popover
Tag Picker
More Menu
Attachment upload error
Delete confirmation
Toast Undo
Dark Mode
200% Zoom
```

---

## 23.100 Definition of Done

새 Task Detail feature는 다음 질문을 통과해야 한다.

```text
Mouse 없이 가능한가?
Screen reader가 이름/상태를 이해하는가?
Focus를 잃지 않는가?
Color 없이도 상태를 구분하는가?
Zoom해도 사용할 수 있는가?
Reduced Motion에서도 기능이 유지되는가?
Touch에서 대체 action이 있는가?
```

하나라도 핵심 기능에 대해 “아니오”라면 완료로 보지 않는다.

---

## 23.101 Prohibited Patterns

- 클릭 가능한 `div`를 button처럼 사용하면서 keyboard semantics 미제공
- Icon-only control에 accessible name 없음
- Tooltip만 accessible label로 의존
- Task Detail 전체에 modal focus trap 적용
- `outline: none` 후 대체 focus 표시 없음
- selected state와 focus state를 동일하게 처리
- Status/Priority/Error를 색상만으로 전달
- Placeholder를 input의 유일 label로 사용
- 모든 floating UI에 무조건 `role=menu` 적용
- 실제 keyboard behavior와 ARIA role 불일치
- Drag & Drop만 reorder/reparent 방법으로 제공
- Hover에서만 핵심 action 노출
- Toast 등장 시 강제로 focus 이동
- 모든 autosave 성공을 live region으로 announce
- Dialog Confirm 버튼을 `OK` 같은 모호한 label로 사용
- Skeleton block을 screen reader가 하나씩 읽게 함
- 200% zoom에서 horizontal clipping 방치
- Reduced Motion을 무시
- Virtualization 때문에 focus item이 사라짐
- Rich editor를 실제 screen reader/IME 테스트 없이 배포

---

## 23.102 Acceptance Criteria

### Semantics

- [ ] Task Detail에 accessible region/heading이 있다.
- [ ] Button/Checkbox/Input에 native semantics를 우선 사용한다.
- [ ] Icon-only control에 accessible name이 있다.
- [ ] Decorative icon은 중복 announcement를 만들지 않는다.
- [ ] ARIA role과 실제 keyboard interaction이 일치한다.

### Keyboard

- [ ] Mouse 없이 Task Detail 핵심 기능을 사용할 수 있다.
- [ ] Task Detail은 non-modal focus trap을 사용하지 않는다.
- [ ] Modal/Dialog만 focus trap을 사용한다.
- [ ] Tab order가 visual/DOM order와 일치한다.
- [ ] Drag action에 keyboard/menu 대안이 있다.
- [ ] Text editor 중 global shortcut이 typing을 가로채지 않는다.

### Focus

- [ ] Keyboard focus가 항상 visible하다.
- [ ] Focus와 selected state가 구분된다.
- [ ] Popover/Dialog close 후 focus가 origin으로 복원된다.
- [ ] Delete/Reorder 후 focus가 유효한 entity/target으로 이동한다.
- [ ] Toast/Background error가 current focus를 빼앗지 않는다.

### Screen Reader

- [ ] Task/CheckItem completion state를 읽을 수 있다.
- [ ] Priority/Date/Tag/List 상태를 text semantics로 이해할 수 있다.
- [ ] 중요한 Toast/Error를 적절히 announce한다.
- [ ] Autosave success announcement flood를 만들지 않는다.
- [ ] Checklist/Subtask progress를 text로 전달할 수 있다.
- [ ] Upload progress/failure를 이해할 수 있다.

### Editor / Validation

- [ ] Title/Description/CheckItem에 명확한 label이 있다.
- [ ] Validation error가 input과 연결된다.
- [ ] IME composition과 keyboard shortcuts가 충돌하지 않는다.
- [ ] Rich Editor semantics를 실제 assistive technology로 검증한다.
- [ ] Placeholder만 label로 사용하지 않는다.

### Visual Accessibility

- [ ] Light/Dark에서 text/focus/error contrast가 충분하다.
- [ ] Color 없이도 주요 상태를 구분할 수 있다.
- [ ] High Contrast mode에서 focus/selection/check 상태가 유지된다.
- [ ] Disabled/Placeholder text가 지나치게 희미하지 않다.
- [ ] 200% zoom에서도 핵심 기능이 잘리지 않는다.

### Motion / Touch

- [ ] Reduced Motion preference를 존중한다.
- [ ] Animation이 정보 전달의 유일한 방법이 아니다.
- [ ] Mobile/touch에서 충분한 hit target을 제공한다.
- [ ] Hover-only 기능을 만들지 않는다.
- [ ] Bottom Sheet/Modal이 touch와 keyboard 모두에서 닫힐 수 있다.

### Testing

- [ ] axe 등 자동 검사 도구를 CI/개발에 통합할 수 있다.
- [ ] Keyboard-only manual QA를 수행한다.
- [ ] NVDA/VoiceOver smoke test를 수행할 수 있다.
- [ ] CJK + IME 환경을 포함한다.
- [ ] Zoom/Contrast/Reduced Motion regression을 수행한다.
- [ ] Accessibility Definition of Done을 feature acceptance에 포함한다.

---

# 24. Final Acceptance Criteria

## 24.1 Purpose

이 장은 1–23장에서 정의한 Task Detail 시스템을 실제 개발 완료 여부로 판정하기 위한 최종 Definition of Done이다.

목표는 단순히:

```text
화면이 보인다
버튼이 눌린다
```

수준이 아니라 다음을 모두 만족하는 것이다.

```text
기능적으로 완결됨
상태가 일관됨
데이터가 안전함
키보드/접근성이 동작함
오류에서 복구 가능함
다른 View와 동기화됨
TickTick-style visual/interaction 방향과 일치함
```

---

## 24.2 Acceptance Priority Levels

모든 요구사항을 세 단계로 구분한다.

### MUST

출시 전에 반드시 충족해야 한다.

```text
데이터 정합성
핵심 Task 편집
Selection/Navigation
Autosave
Error recovery
Keyboard core
Accessibility core
Cross-view synchronization
```

MUST 미충족 항목이 있으면 Task Detail 완료로 판정하지 않는다.

### SHOULD

초기 release 품질을 크게 높이는 항목.

```text
Undo 범위 확대
Advanced keyboard shortcuts
Rich Description formatting
More refined recurrence UX
Offline recovery
Advanced preview
```

MUST를 깨지 않는 범위에서 release 직후 보완 가능하다.

### LATER

architecture는 열어두되 V1 구현을 강제하지 않는 항목.

```text
Occurrence-specific rich overrides
CRDT collaborative editing
Advanced attachment embedding
Global Redo
Multiple density modes
Advanced accessibility sortable pattern
```

---

## 24.3 Release Gate — Data Model

### MUST

- [ ] Task가 stable ID를 가진다.
- [ ] Title의 canonical source가 하나다.
- [ ] Status가 `open / completed / wont_do`로 일관된다.
- [ ] `completedAt` lifecycle이 status와 일치한다.
- [ ] Schedule이 Date/Time/Duration을 하나의 모델로 표현한다.
- [ ] Priority가 `none / low / medium / high` 하나의 enum을 사용한다.
- [ ] List ownership이 `listId` 하나로 관리된다.
- [ ] Subtask hierarchy가 `parentTaskId` 하나로 관리된다.
- [ ] CheckItem이 별도 entity다.
- [ ] Tag가 stable entity + many-to-many relation이다.
- [ ] Attachment가 Task와 분리된 entity다.
- [ ] Domain field와 UI/transient field가 혼합되지 않는다.
- [ ] Derived 값(count/progress/overdue 등)을 불필요하게 persisted source로 만들지 않는다.

---

## 24.4 Pre-implementation Model Harmonization Gate

현재 각 장에서 확장된 모델 중 구현 전에 하나로 최종 통합해야 하는 항목이 있다.

### Reminder

2장의 초기 Reminder 모델보다 6장의 최종 권장 모델을 우선한다.

최종 구현 전 하나로 통일:

```ts
type ReminderOffset = {
  value: number;
  unit: "minute" | "hour" | "day" | "week";
};

type Reminder = {
  id: string;
  taskId: string;
  type: "relative" | "absolute";
  offset: ReminderOffset | null;
  absoluteAt: string | null;
  allDayTime: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### Won't Do Timestamp

현재 core Task model에는 `completedAt`만 있다.

Activity/history 요구가 커지면:

```text
wontDoAt
```

을 명시적으로 둘지, 별도 Activity Event에서만 추적할지 구현 전에 확정한다.

V1에서 timestamp 자체가 필요하지 않다면 status만 유지해도 된다.

### Recurrence

7장의:

```text
RecurrenceSeries
RecurrenceOccurrenceState
RecurrenceException
```

구조를 canonical recurrence architecture로 삼고, 2장의 단순 `RecurrenceRule`은 Series 내부 rule definition으로 정리한다.

### Attachment Delete

14장에서 제안한:

```text
deletedAt
```

사용 여부를 storage retention/Undo 정책과 함께 최종 확정한다.

이 harmonization이 끝나기 전 persistence schema를 freeze하지 않는다.

---

## 24.5 Release Gate — Task Detail Shell

### MUST

- [ ] Detail은 Desktop에서 구조적 right pane으로 열린다.
- [ ] Main View를 가리지 않고 동시에 사용할 수 있다.
- [ ] `selectedTaskId !== null`이 Detail open의 source다.
- [ ] 한 번에 하나의 Detail Pane만 존재한다.
- [ ] Task 전환 시 Pane 자체를 새로 stack하지 않는다.
- [ ] Main/Detail scroll이 독립적이다.
- [ ] Detail resize가 min/default/max 범위에서 동작한다.
- [ ] resize width가 user preference로 저장될 수 있다.
- [ ] outside click으로 Detail이 닫히지 않는다.
- [ ] explicit close/Esc/navigation semantics가 일관된다.
- [ ] Mobile에서는 full-screen 또는 equivalent responsive Detail로 전환된다.

---

## 24.6 Release Gate — Selection & Navigation

### MUST

- [ ] neutral Task row click으로 Task를 선택할 수 있다.
- [ ] Checkbox/Date/Priority/More click이 row selection과 분리된다.
- [ ] selected row 재클릭이 Detail close toggle로 동작하지 않는다.
- [ ] Focus와 selection이 분리된다.
- [ ] Task property 변경으로 current query에서 빠져도 Detail은 유지된다.
- [ ] Selected Task Delete 시 Detail이 닫힌다.
- [ ] Explicit primary navigation 시 Detail이 정해진 rule로 닫힌다.
- [ ] Parent/Subtask 이동도 같은 `selectedTaskId` 시스템을 사용한다.
- [ ] Browser Back/Forward와 Task selection이 충돌하지 않는다.
- [ ] Deep link/refresh에서 Task Detail을 복원할 수 있다.
- [ ] 존재하지 않는 Task URL을 안전하게 처리한다.

---

## 24.7 Release Gate — Completion & Status

### MUST

- [ ] Complete/Reopen/Won't Do가 명확히 구분된다.
- [ ] Main View와 Detail이 같은 status command를 사용한다.
- [ ] optimistic status 변경이 즉시 반영된다.
- [ ] 저장 실패 시 안전하게 rollback한다.
- [ ] Parent 완료가 Child를 자동 완료하지 않는다.
- [ ] Checklist 완료가 Task를 자동 완료하지 않는다.
- [ ] Task 완료가 CheckItem을 자동 체크하지 않는다.
- [ ] Completed/Won't Do Task도 기본적으로 Detail 열람이 가능하다.
- [ ] status mutation이 filtering/counts에 즉시 반영된다.

---

## 24.8 Release Gate — Date · Time · Duration

### MUST

- [ ] No Date / Today / Tomorrow / Specific Date를 지원한다.
- [ ] All-day와 Timed Task를 구분한다.
- [ ] Start/End 구조가 일관된다.
- [ ] Duration은 derived된다.
- [ ] Start 변경 시 기존 duration 보존 rule이 적용된다.
- [ ] invalid end-before-start를 저장하지 않는다.
- [ ] Multi-day schedule을 표현할 수 있다.
- [ ] All-day date가 timezone shift로 바뀌지 않는다.
- [ ] Clear Date가 schedule을 일관되게 제거한다.
- [ ] Calendar와 Detail이 같은 schedule command를 사용한다.
- [ ] Overdue/Today membership이 derived된다.

---

## 24.9 Release Gate — Reminder

### MUST

- [ ] Relative/Absolute reminder를 구분한다.
- [ ] Timed Task와 All-day Task reminder semantics가 다르게 처리된다.
- [ ] 여러 reminder를 지원할 수 있다.
- [ ] duplicate reminder를 방지한다.
- [ ] Schedule 변경 시 relative reminder를 올바르게 재계산한다.
- [ ] Absolute reminder는 Schedule 변경에 불필요하게 따라가지 않는다.
- [ ] Task completed/wont_do 시 미래 reminder lifecycle이 처리된다.
- [ ] Notification permission denied와 Reminder data를 구분한다.
- [ ] scheduler failure를 저장 failure와 구분한다.
- [ ] DST/timezone semantics가 offset unit 모델과 일치한다.

---

## 24.10 Release Gate — Recurrence

### MUST

- [ ] Daily/Weekly/Monthly/Yearly recurrence를 표현할 수 있다.
- [ ] Interval과 종료 조건을 표현할 수 있다.
- [ ] Recurrence가 Schedule에 의존한다.
- [ ] infinite occurrence를 미리 materialize하지 않는다.
- [ ] occurrence identity가 안정적이다.
- [ ] occurrence completion이 Series 전체 completion으로 처리되지 않는다.
- [ ] This occurrence / This and future / All scope를 표현할 수 있다.
- [ ] This and future가 Series split transaction으로 처리된다.
- [ ] exception/occurrence state를 표현할 수 있다.
- [ ] recurring reminder가 occurrence 기준으로 계산될 수 있다.
- [ ] DST/local wall-clock recurrence가 깨지지 않는다.
- [ ] malformed recurrence가 무한 expansion을 만들지 않는다.

---

## 24.11 Release Gate — Priority

### MUST

- [ ] `none / low / medium / high` 하나의 canonical enum을 사용한다.
- [ ] Priority Popover는 single-select다.
- [ ] 선택 즉시 optimistic update된다.
- [ ] 현재 Priority를 명확히 표시한다.
- [ ] Priority와 Overdue/Urgency를 혼동하지 않는다.
- [ ] List/Board/Search/Detail이 같은 priority state를 읽는다.
- [ ] Priority control이 keyboard/accessibility에서 사용 가능하다.

---

## 24.12 Release Gate — Title Editor

### MUST

- [ ] Detail open만으로 Title edit가 시작되지 않는다.
- [ ] Title click으로 edit mode에 들어간다.
- [ ] Canonical Title과 local draft가 분리된다.
- [ ] Enter로 commit한다.
- [ ] Esc가 uncommitted draft를 취소한다.
- [ ] Blur/Task switch/Detail close 전에 유효 draft를 flush한다.
- [ ] 빈 Title commit을 막는다.
- [ ] paste newline을 single logical line으로 normalize한다.
- [ ] IME composition 중 Enter가 commit하지 않는다.
- [ ] stale save response가 최신 Title을 덮어쓰지 않는다.
- [ ] save failure가 최신 draft를 유실시키지 않는다.
- [ ] 모든 View가 최신 committed Title을 표시한다.

---

## 24.13 Release Gate — Description Editor

### MUST

- [ ] Multi-line Description을 지원한다.
- [ ] Empty Description을 허용한다.
- [ ] 별도 Save button 없이 autosave된다.
- [ ] Task switch/Detail close/navigation 전 pending draft를 flush한다.
- [ ] Plain text paste가 줄바꿈을 보존한다.
- [ ] 외부 HTML paste를 sanitize한다.
- [ ] unsafe URL/HTML 실행을 막는다.
- [ ] IME composition을 안전하게 처리한다.
- [ ] editor-local Undo가 동작한다.
- [ ] 긴 Description에서도 Detail scroll 구조가 깨지지 않는다.
- [ ] active local draft가 remote update로 silent overwrite되지 않는다.
- [ ] editor library와 canonical domain representation이 분리된다.

### SHOULD

- [ ] Bold/Italic/Strike
- [ ] Heading
- [ ] Bullet/Numbered List
- [ ] Link formatting
- [ ] Slash Command
- [ ] `+` Insert Menu

---

## 24.14 Release Gate — Checklist

### MUST

- [ ] Description/Checklist mode를 명확히 구분한다.
- [ ] non-empty Description conversion에서 data loss가 발생하지 않는다.
- [ ] CheckItem을 생성/편집/삭제할 수 있다.
- [ ] Enter로 빠르게 다음 Item을 만들 수 있다.
- [ ] 빈 Item이 permanent entity로 남지 않는다.
- [ ] multi-line paste를 여러 Item으로 처리할 수 있다.
- [ ] check/uncheck가 independent state로 동작한다.
- [ ] 모든 Item 완료가 Task 자동 완료로 이어지지 않는다.
- [ ] drag 또는 대체 방식으로 reorder할 수 있다.
- [ ] progress가 derived된다.
- [ ] recurring occurrence에서 checked state가 다음 occurrence로 전파되지 않는다.
- [ ] conversion이 transaction + Undo 구조를 가진다.

---

## 24.15 Release Gate — Subtask

### MUST

- [ ] Subtask가 완전한 Task entity다.
- [ ] `parentTaskId` 하나로 hierarchy를 표현한다.
- [ ] multi-level nesting이 가능하다.
- [ ] self-parent/cycle을 차단한다.
- [ ] inline Subtask 생성이 가능하다.
- [ ] Parent/Child status가 독립적이다.
- [ ] Child click으로 같은 Detail Pane에서 navigation한다.
- [ ] sibling reorder가 가능하다.
- [ ] reparent/indent/outdent가 hierarchy invariant를 유지한다.
- [ ] Parent List move 시 subtree가 함께 이동한다.
- [ ] Parent delete 시 descendant orphan을 남기지 않는다.
- [ ] subtree mutation 실패 시 atomic rollback이 가능하다.
- [ ] recurring Parent의 Child completion state가 occurrence 간 섞이지 않는다.

---

## 24.16 Release Gate — List · Folder · Tags

### MUST

- [ ] 모든 Task가 정확히 하나의 List에 속한다.
- [ ] Folder는 List container이며 Task direct container가 아니다.
- [ ] Smart View와 List ownership을 구분한다.
- [ ] Move to List가 optimistic하게 동작한다.
- [ ] Parent List move 시 subtree consistency를 유지한다.
- [ ] List delete 시 Task orphan이 생기지 않는다.
- [ ] Tag가 stable ID를 가진다.
- [ ] TaskTag many-to-many relation을 사용한다.
- [ ] Tag Picker가 multi-select로 동작한다.
- [ ] Tag Create/Remove/Delete를 구분한다.
- [ ] List/Tag 변경으로 current query에서 Task가 빠져도 Detail을 불필요하게 닫지 않는다.
- [ ] Sidebar/filter/search/grouping이 organization mutation에 반응한다.

---

## 24.17 Release Gate — Attachments

### MUST

- [ ] Attachment가 별도 entity다.
- [ ] Task entity에 raw binary/base64를 저장하지 않는다.
- [ ] 파일 선택 직후 local upload placeholder가 보인다.
- [ ] progress/failure/retry/remove state를 표현한다.
- [ ] upload cancel이 가능하다.
- [ ] file size/type/count validation을 적용한다.
- [ ] 동일 filename을 안전하게 처리한다.
- [ ] filename과 storage key를 분리한다.
- [ ] server-side authorization을 적용할 수 있다.
- [ ] unsafe preview/file metadata를 안전하게 처리한다.
- [ ] Task/Attachment delete race가 file resurrection을 만들지 않는다.
- [ ] Task move/rename이 storage object identity에 영향을 주지 않는다.
- [ ] storage provider가 adapter 뒤에 있다.

### SHOULD

- [ ] Image thumbnail
- [ ] PDF/Image preview
- [ ] Drag & Drop
- [ ] Clipboard image paste
- [ ] Delete Undo
- [ ] filename search

---

## 24.18 Release Gate — More Actions

### MUST

- [ ] More Menu가 context-sensitive하다.
- [ ] Action group 순서가 안정적이다.
- [ ] Delete가 destructive group으로 분리된다.
- [ ] Complete/Reopen/Won't Do가 기존 command를 재사용한다.
- [ ] Move/Convert가 각 feature command를 재사용한다.
- [ ] Duplicate가 새 stable ID를 생성한다.
- [ ] subtree duplicate가 새 parent mapping을 만든다.
- [ ] recurring destructive action에 scope가 있다.
- [ ] duplicate/delete double-trigger를 방지한다.
- [ ] Action Registry를 통해 Context Menu/Detail Menu와 command를 공유할 수 있다.

---

## 24.19 Release Gate — Autosave & Optimistic Update

### MUST

- [ ] 일반 편집이 Save button 없이 동작한다.
- [ ] text 입력에 debounce를 사용한다.
- [ ] Task switch/close/navigation 전에 pending draft를 flush한다.
- [ ] discrete property가 optimistic하게 즉시 반영된다.
- [ ] Domain Store가 View별 optimistic copy보다 우선한다.
- [ ] mutation ID/sequence가 stale response를 막는다.
- [ ] field-level patch 또는 revision-aware merge를 사용한다.
- [ ] structural mutation이 transaction으로 처리된다.
- [ ] rollback이 mutation-aware하다.
- [ ] text save failure에서 최신 draft를 보존한다.
- [ ] create/duplicate/delete retry가 idempotent하다.
- [ ] component unmount가 mutation lifecycle을 종료시키지 않는다.

---

## 24.20 Release Gate — Undo & Feedback

### MUST

- [ ] Silent/Inline/Toast/Dialog feedback을 구분한다.
- [ ] 일반 autosave success Toast를 남발하지 않는다.
- [ ] Delete/Move/Conversion 같은 중요한 action에 Undo를 제공할 수 있다.
- [ ] Undo가 실제 Domain/Persistence mutation으로 처리된다.
- [ ] transaction action이 부분적으로만 Undo되지 않는다.
- [ ] Toast가 현재 editor focus를 빼앗지 않는다.
- [ ] 여러 Toast가 화면을 무제한 점유하지 않는다.
- [ ] Error/Undo feedback이 mutation과 연결된다.
- [ ] stale Undo가 최신 conflict state를 무조건 덮어쓰지 않는다.

---

## 24.21 Release Gate — Keyboard & Focus

### MUST

- [ ] Focus와 selection을 구분한다.
- [ ] Keyboard로 Task Detail을 열고 닫을 수 있다.
- [ ] Arrow/Enter/Space가 context에 맞게 동작한다.
- [ ] Esc가 topmost layer부터 한 단계씩 닫는다.
- [ ] 한 Esc가 Popover와 Detail을 동시에 닫지 않는다.
- [ ] Text editor focus 중 global shortcut이 typing을 방해하지 않는다.
- [ ] IME composition 중 전역 Enter/Slash shortcut이 실행되지 않는다.
- [ ] Popover/Dialog close 후 focus를 복원한다.
- [ ] Delete 후 존재하지 않는 DOM node에 focus가 남지 않는다.
- [ ] Detail 자체에는 modal focus trap을 사용하지 않는다.
- [ ] drag/reorder에 keyboard 또는 menu 대안이 있다.

---

## 24.22 Release Gate — Popover & Layers

### MUST

- [ ] Date/Reminder/Repeat/Priority/Tag/List/More 등이 공통 floating primitive를 사용한다.
- [ ] Portal을 통해 overflow clipping을 피한다.
- [ ] positioning에 offset/flip/shift/collision 처리가 있다.
- [ ] semantic z-index token을 사용한다.
- [ ] sibling primary popover를 무제한 동시 open하지 않는다.
- [ ] nested layer의 outside click이 parent를 잘못 닫지 않는다.
- [ ] Esc가 topmost layer 하나만 닫는다.
- [ ] owner Task switch/unmount 시 stale popover를 닫는다.
- [ ] Modal만 background inert/focus trap을 사용한다.
- [ ] Mobile에서 Sheet 형태로 presentation을 바꿀 수 있다.
- [ ] transient floating state를 URL/domain에 저장하지 않는다.

---

## 24.23 Release Gate — Visual System

### MUST

- [ ] Task Detail이 structural pane으로 보인다.
- [ ] Surface/Typography/Spacing/Radius/Shadow/Motion을 token화한다.
- [ ] Title이 가장 높은 visual hierarchy를 가진다.
- [ ] 모든 section을 card로 분절하지 않는다.
- [ ] icon style/size가 일관된다.
- [ ] visual icon과 interaction hit area를 구분한다.
- [ ] Default/Hover/Selected/Focus/Disabled/Error state가 구분된다.
- [ ] Selected와 Focus state가 다르다.
- [ ] Light/Dark에서 hierarchy가 유지된다.
- [ ] Reduced Motion을 지원한다.
- [ ] 200% zoom/좁은 폭에서 핵심 UI가 잘리지 않는다.
- [ ] exact TickTick fidelity 값이 component가 아니라 token 수준에서 교체 가능하다.

---

## 24.24 Release Gate — State Synchronization

### MUST

- [ ] Domain/UI/Mutation/Route state가 분리된다.
- [ ] Main/List/Board/Calendar/Search/Detail이 같은 canonical entity를 읽는다.
- [ ] `selectedTaskId` 하나가 Detail selection source다.
- [ ] route와 selection이 무한 sync loop를 만들지 않는다.
- [ ] current query에서 Task가 빠져도 selected Detail을 유지할 수 있다.
- [ ] stale fetch가 optimistic update를 덮어쓰지 않는다.
- [ ] Task A fetch response가 Task B selection을 되돌리지 않는다.
- [ ] remote update가 active local draft를 silent overwrite하지 않는다.
- [ ] delete tombstone 뒤 stale update가 entity를 resurrect하지 않는다.
- [ ] pending mutation이 navigation/component lifecycle과 독립적이다.
- [ ] local hydrate + remote reconcile이 가능하다.

---

## 24.25 Release Gate — Error Handling

### MUST

- [ ] Validation/Network/Permission/Conflict/Not Found/Server 오류를 구분한다.
- [ ] Missing Task를 무한 loading으로 두지 않는다.
- [ ] Missing Parent/List relation을 감지한다.
- [ ] malformed data 하나가 App 전체 crash를 만들지 않는다.
- [ ] invalid schedule/reminder/recurrence를 canonical state에 저장하지 않는다.
- [ ] partial transaction failure를 성공처럼 표시하지 않는다.
- [ ] upload/delete/save race를 sequence/revision으로 막는다.
- [ ] 401/403/404/409/429/5xx에 맞는 recovery가 있다.
- [ ] offline에서도 local content를 가능한 범위에서 계속 사용할 수 있다.
- [ ] data loss prevention을 visual polish보다 우선한다.

---

## 24.26 Release Gate — Accessibility

### MUST

- [ ] Native semantic element를 우선 사용한다.
- [ ] Icon-only control에 accessible name이 있다.
- [ ] Task Detail region/heading semantics가 있다.
- [ ] Keyboard-only로 핵심 Task Detail flow를 수행할 수 있다.
- [ ] Focus indicator가 항상 보인다.
- [ ] Status/Priority/Error를 color만으로 전달하지 않는다.
- [ ] Input validation이 input과 programmatically 연결된다.
- [ ] Popover/Dialog role과 keyboard behavior가 일치한다.
- [ ] Drag & Drop의 대체 수단이 있다.
- [ ] Toast가 focus를 훔치지 않는다.
- [ ] 200% Zoom/High Contrast/Reduced Motion에서 기능이 유지된다.
- [ ] NVDA 또는 VoiceOver smoke test를 수행한다.

---

# End-to-End Acceptance Scenarios

## 24.27 Scenario A — Basic Task Editing

```text
1. Main List에서 Task 선택
2. Detail open
3. Title 수정
4. Date Tomorrow 설정
5. Priority High 설정
6. Description 입력
7. Tag 추가
8. Detail close
9. 같은 Task 다시 open
```

### PASS

- [ ] 모든 변경이 저장되어 있다.
- [ ] Main List가 즉시 변경을 반영했다.
- [ ] 저장 과정에서 Save button이 필요하지 않았다.
- [ ] stale 값으로 되돌아가지 않았다.
- [ ] Detail close/open 후 값이 일치한다.

---

## 24.28 Scenario B — Query Exit While Editing

```text
1. Today View
2. Today Task 선택
3. Detail에서 date → Tomorrow
```

### PASS

- [ ] Main Today View에서 Task가 즉시 사라진다.
- [ ] Detail은 닫히지 않는다.
- [ ] Detail Date는 Tomorrow다.
- [ ] Tomorrow View를 열면 해당 Task가 보인다.
- [ ] Sidebar counts가 자동 반영된다.

---

## 24.29 Scenario C — Rapid Status Mutation

```text
Open
→ Complete
→ 즉시 Reopen
```

server response가 역순으로 도착한다고 가정한다.

### PASS

- [ ] 최종 상태는 Open이다.
- [ ] 늦은 Complete response가 Reopen을 덮어쓰지 않는다.
- [ ] Main/Detail status가 일치한다.
- [ ] completedAt이 최종 status와 일치한다.

---

## 24.30 Scenario D — Dirty Text + Task Switch

```text
1. Task A Description typing
2. debounce 전에 Task B 클릭
3. 다시 A 열기
```

### PASS

- [ ] A 마지막 입력이 유실되지 않는다.
- [ ] B에 A draft가 섞이지 않는다.
- [ ] A save가 B selection을 되돌리지 않는다.
- [ ] stale A response가 다른 Task UI를 바꾸지 않는다.

---

## 24.31 Scenario E — Checklist Conversion

```text
Description:
Prepare slides
Email professor
Check data

→ Convert to Checklist
```

### PASS

- [ ] 세 CheckItem이 생성된다.
- [ ] 순서가 유지된다.
- [ ] Description data loss가 예측 가능/Undo 가능하다.
- [ ] Undo 시 원래 Description이 복원된다.
- [ ] CheckItems가 남지 않는다.

---

## 24.32 Scenario F — Subtask Hierarchy

```text
Parent A
├─ Child B
└─ Child C

Child B → reparent under Task D
```

### PASS

- [ ] cycle/depth validation을 통과한다.
- [ ] B의 descendants도 함께 이동한다.
- [ ] List invariant가 유지된다.
- [ ] 실패 시 전체 subtree가 원위치로 rollback된다.
- [ ] Undo 시 original hierarchy/order가 복원된다.

---

## 24.33 Scenario G — Parent Move to Another List

```text
Study
Parent
├ Child A
└ Child B

Move Parent → Work
```

### PASS

- [ ] Parent/A/B가 모두 Work로 이동한다.
- [ ] hierarchy는 그대로다.
- [ ] Study View에서 row가 사라질 수 있다.
- [ ] 열린 Detail은 유지된다.
- [ ] Work View에서 hierarchy가 정상이다.

---

## 24.34 Scenario H — Delete + Undo

```text
1. Selected Task Delete
2. Detail close
3. Toast Undo
```

### PASS

- [ ] Delete 직후 Main에서 Task가 제거된다.
- [ ] Detail이 닫힌다.
- [ ] Undo가 실제 persistence restore mutation을 실행한다.
- [ ] Task가 원래 List/status/order로 돌아온다.
- [ ] stale delete response가 restored Task를 다시 삭제하지 않는다.

---

## 24.35 Scenario I — Parent Delete

```text
Parent
├ Child
└ Grandchild
```

Delete Parent.

### PASS

- [ ] 영향 범위를 명확히 알 수 있다.
- [ ] subtree 전체가 하나의 transaction으로 삭제된다.
- [ ] orphan Child가 남지 않는다.
- [ ] Undo로 전체 hierarchy를 복구할 수 있다.

---

## 24.36 Scenario J — Attachment Failure

```text
1. 파일 선택
2. upload 40%
3. network failure
4. Retry
```

### PASS

- [ ] 파일 row가 처음부터 보인다.
- [ ] progress가 표시된다.
- [ ] 실패 row가 사라지지 않는다.
- [ ] Retry가 duplicate attachment를 만들지 않는다.
- [ ] 성공 후 ready 상태가 된다.

---

## 24.37 Scenario K — Upload During Delete

```text
Attachment uploading
↓
Task Delete
↓
late upload success response
```

### PASS

- [ ] upload가 cancel/cleanup된다.
- [ ] late success가 Attachment/Task를 resurrect하지 않는다.
- [ ] storage orphan cleanup이 가능하다.

---

## 24.38 Scenario L — Recurring Completion

Weekly Task의 Aug 24 occurrence 완료.

### PASS

- [ ] Aug 24 occurrence만 completed 처리된다.
- [ ] Series rule은 유지된다.
- [ ] 다음 occurrence는 open이다.
- [ ] Checklist/Subtask completed state가 다음 occurrence에 복사되지 않는다.

---

## 24.39 Scenario M — Recurring “This and Future”

```text
Weekly Task
↓
Aug 31 이후 schedule 변경
↓
This and future
```

### PASS

- [ ] 기존 Series의 과거 occurrence가 유지된다.
- [ ] Aug 31 이후 새 Series가 생성된다.
- [ ] split이 atomic하다.
- [ ] transaction 실패 시 split 전 상태로 rollback된다.
- [ ] duplicate occurrence identity가 생기지 않는다.

---

## 24.40 Scenario N — Remote Edit Conflict

Device A:

```text
Description editing
```

Device B:

```text
same Task Description update
```

### PASS

- [ ] A의 active draft가 갑자기 바뀌지 않는다.
- [ ] conflict를 감지할 수 있다.
- [ ] 다른 field remote update는 별도로 반영 가능하다.
- [ ] 사용자의 unsaved text를 보존한다.

---

## 24.41 Scenario O — Remote Delete While Dirty

```text
Local Title/Description dirty
+
Remote Delete
```

### PASS

- [ ] Task가 계속 정상 저장되는 것처럼 보이지 않는다.
- [ ] local draft가 silent discard되지 않는다.
- [ ] deleted state를 알린다.
- [ ] recovery/copy path로 확장 가능하다.

---

## 24.42 Scenario P — Deep Link / Browser History

```text
List A
→ Task A
→ Task B
→ Browser Back
→ Browser Forward
```

### PASS

- [ ] Back에서 A Detail이 복원된다.
- [ ] Forward에서 B가 복원된다.
- [ ] Main View context가 불필요하게 초기화되지 않는다.
- [ ] transient Popover는 복원되지 않는다.
- [ ] focus가 orphan DOM에 남지 않는다.

---

## 24.43 Scenario Q — Keyboard-only

Mouse 사용 없이:

```text
Task 선택
Detail open
Title 편집
Date 설정
Priority 변경
Tag 추가
Subtask 생성
More Menu 열기
Close
```

### PASS

- [ ] 모든 단계가 keyboard로 가능하다.
- [ ] focus indicator가 항상 보인다.
- [ ] Esc layer priority가 일관된다.
- [ ] editor typing 중 global shortcuts가 오작동하지 않는다.

---

## 24.44 Scenario R — Korean IME

한국어 Title/Description/CheckItem 입력:

```text
ㅎ → 하 → 한
```

composition 중 Enter/Esc 사용.

### PASS

- [ ] 중간 composition string이 비정상 commit되지 않는다.
- [ ] Enter가 Task/Item action을 잘못 실행하지 않는다.
- [ ] Slash/global shortcut이 IME를 가로채지 않는다.
- [ ] composition 종료 후 정상 autosave된다.

---

## 24.45 Scenario S — Narrow / Mobile

```text
Desktop narrow width
Mobile full-screen Detail
Bottom Sheet open
Virtual keyboard open
```

### PASS

- [ ] 주요 control이 잘리지 않는다.
- [ ] Sheet가 viewport/safe area를 존중한다.
- [ ] input이 keyboard 뒤에 가려지지 않는다.
- [ ] touch hit target이 충분하다.
- [ ] desktop business logic과 동일 command를 사용한다.

---

## 24.46 Scenario T — 200% Zoom / Accessibility

200% zoom + keyboard-only + screen reader smoke test.

### PASS

- [ ] horizontal clipping으로 핵심 action을 잃지 않는다.
- [ ] focus ring이 보인다.
- [ ] Dialog/Popover context를 이해할 수 있다.
- [ ] Priority/Status가 color 없이도 전달된다.
- [ ] Toast가 focus를 빼앗지 않는다.

---

# Regression Matrix

## 24.47 Required Visual Regression States

최소 screenshot baseline:

```text
1. Empty open Task
2. Scheduled timed Task
3. All-day Task
4. Overdue Task
5. High Priority Task
6. Completed Task
7. Won't Do Task
8. Long Title
9. Long Description
10. Checklist mode
11. Checklist all checked
12. Nested Subtasks
13. Tags overflow
14. Attachments ready
15. Attachment uploading
16. Attachment failed
17. Date Popover
18. Priority Popover
19. Tag Picker
20. More Menu
21. Delete Dialog
22. Undo Toast
23. Dark Mode
24. Narrow Detail
25. Mobile Detail
```

---

## 24.48 Required Interaction Regression

자동/수동 test:

```text
Open / close Detail
Switch selected Task
Resize Detail
Edit Title
Edit Description
Toggle Complete
Set/Clear Date
Set Priority
Add/Remove Tag
Move List
Add/Check/Delete Checklist
Create/Reparent/Delete Subtask
Upload/Retry/Delete Attachment
Delete/Undo Task
Browser Back/Forward
Popover outside-click/Esc
```

---

## 24.49 Required Race Regression

반드시 failure/delay injection:

```text
stale title response
stale status response
delete vs save
delete vs upload
rapid reorder
rapid list move
remote update during local draft
remote delete during local draft
offline → reconnect
transaction partial failure
```

---

## 24.50 Required Accessibility Regression

최소:

```text
Keyboard-only
NVDA or VoiceOver smoke test
200% Zoom
High Contrast
Reduced Motion
CJK IME
Touch/mobile
```

---

# Performance Acceptance

## 24.51 Interaction Responsiveness

다음 direct interaction은 network와 무관하게 즉시 반응해야 한다.

```text
Complete toggle
Priority
Tag toggle
Date selection
Checklist toggle
Row selection
```

사용자가 서버 roundtrip을 기다리는 느낌이 없어야 한다.

---

## 24.52 Typing Responsiveness

Title/Description/CheckItem typing 중:

```text
autosave
markdown parsing
search indexing
sync
```

때문에 noticeable typing lag가 발생하면 안 된다.

비싼 작업은 debounce/throttle/background 처리.

---

## 24.53 Pane Switching

Task A → B 전환 시 전체 App reload/skeleton을 사용하지 않는다.

Local entity가 있으면 즉시 content switch.

---

## 24.54 Large Data

다음에서도 core interaction이 유지되어야 한다.

```text
많은 Tasks
많은 Tags
100+ Checklist Items
깊은 Subtask hierarchy
긴 Description
여러 Attachments
```

필요하면 memoization/virtualization/index를 사용한다.

---

# Security Acceptance

## 24.55 Input Safety

- [ ] Rich Description HTML을 sanitize한다.
- [ ] unsafe link scheme을 차단한다.
- [ ] filename을 escape한다.
- [ ] Attachment access를 server-side authorize한다.
- [ ] client optimistic state가 permission check를 대체하지 않는다.
- [ ] server가 domain invariant를 최종 검증한다.

---

## 24.56 Data Privacy

- [ ] Debug telemetry에 Description/Title full content를 불필요하게 남기지 않는다.
- [ ] Attachment를 기본 private resource로 처리할 수 있다.
- [ ] signed URL을 permanent canonical data로 저장하지 않는다.
- [ ] error UI에 내부 stack/database 정보를 노출하지 않는다.

---

# Architecture Acceptance

## 24.57 Required Shared Layers

구현 결과에 다음 공통 계층이 존재해야 한다.

```text
Domain Store
UI State
Command Layer
Mutation Queue
Undo / Feedback Layer
Floating Layer System
Router Integration
Storage Adapter
Sync Adapter
Design Tokens
```

이름은 달라도 책임은 분리되어야 한다.

---

## 24.58 No Feature-local Business Duplication

다음 surface가 같은 action을 실행할 때:

```text
Task Detail
Main Row
Board Card
Context Menu
Keyboard Shortcut
```

같은 domain command를 사용해야 한다.

예:

```text
completeTask()
setTaskPriority()
moveTaskToList()
```

---

## 24.59 Component Boundary

컴포넌트는 주로:

```text
render
local interaction
focus
draft
```

를 담당한다.

다음을 직접 소유하지 않는다.

```text
database transaction
storage provider
global sync
undo persistence
cross-view reconciliation
```

---

## 24.60 No Hidden Canonical Copies

코드 리뷰에서 다음 pattern이 발견되면 release blocker로 본다.

```text
detailTask copy
boardTask copy
calendarTask copy
searchTask copy
```

각각 독립 수정되는 구조.

---

# TickTick Fidelity Acceptance

## 24.61 Fidelity Goal

목표는 TickTick의 시각·interaction 패턴을 높은 수준으로 재현하되, 잘못된 legacy detail까지 무조건 복제하는 것이 아니다.

우선순위:

```text
1. Interaction model
2. Information density
3. State behavior
4. Spacing / sizing
5. Motion
6. Cosmetic detail
```

---

## 24.62 Required Fidelity Audit Before Pixel Lock

최종 visual freeze 전에 실제 TickTick 환경에서 가능한 경우 다음을 실측한다.

```text
Detail width
Header height
Padding
Typography
Row height
Icon geometry
Hover fill
Selected fill
Divider
Popover size/radius/shadow
Menu density
Transition timing
```

---

## 24.63 Replace Tokens, Not Components

실측 결과 반영 방식:

```text
measurement
↓
design token update
↓
all components inherit
```

feature component마다 별도 pixel patch를 넣지 않는다.

---

## 24.64 Fidelity Differences Log

TickTick과 의도적으로 다른 부분은 문서화한다.

예:

```text
Difference
Reason
Impact
Decision
```

“비슷해 보이니까” 임의로 다르게 만들지 않는다.

---

# Release Blocking Conditions

## 24.65 Automatic Release Blockers

다음 중 하나라도 존재하면 Task Detail release를 막는다.

```text
Data loss 가능성
Stale response가 최신 edit을 덮어씀
Delete 후 entity resurrection
Hierarchy cycle 생성 가능
Parent delete 후 orphan Child 생성
Task switch 중 draft 유실
Save failure가 사용자에게 숨겨짐
Keyboard로 핵심 기능 사용 불가
Focus trap / focus loss 심각
Unsafe HTML/file execution 가능
Permission 없이 mutation 가능
Current Task와 Detail 데이터 불일치
```

---

## 24.66 High-priority Blockers

다음도 release 전에 수정하는 것을 원칙으로 한다.

```text
Popover가 viewport 밖으로 잘림
Esc가 여러 layer를 동시에 닫음
Main/Detail status 불일치
Date/Calendar 불일치
Undo가 persistence와 불일치
Recurring scope가 잘못 적용됨
Attachment failure가 duplicate file을 만듦
200% zoom에서 핵심 control 접근 불가
```

---

# Final Definition of Done

## 24.67 Functional DoD

Task Detail이 완료되었다고 부르려면 사용자가 다음 흐름을 자연스럽게 수행할 수 있어야 한다.

```text
Task 열기
→ 내용 확인
→ Title/Description 수정
→ 날짜/우선순위/태그 설정
→ Checklist/Subtask 구성
→ 파일 첨부
→ 완료
→ 다른 Task 이동
→ 실수 Undo
→ Detail 닫기
```

그리고 이 과정에서 별도 Save workflow를 의식하지 않아야 한다.

---

## 24.68 State DoD

어느 surface에서 Task를 수정하더라도:

```text
Main
Board
Calendar
Search
Detail
```

은 같은 canonical state를 보여야 한다.

---

## 24.69 Reliability DoD

네트워크 지연·실패·재시도·remote update가 발생해도:

```text
최신 user intent
```

가 최대한 보존되어야 한다.

---

## 24.70 Interaction DoD

Mouse와 keyboard 모두에서:

```text
빠르고
예측 가능하고
중복 action 없이
focus를 잃지 않고
```

동작해야 한다.

---

## 24.71 Visual DoD

Task Detail은 다음 인상을 가져야 한다.

```text
Compact
Quiet
Structured
Lightweight
Productivity-first
```

과도한 카드·색상·모션·장식으로 Task content보다 UI chrome이 더 강해지면 안 된다.

---

## 24.72 Accessibility DoD

핵심 기능이:

```text
keyboard-only
screen reader
200% zoom
high contrast
reduced motion
touch
```

환경에서 사용할 수 있어야 한다.

---

## 24.73 Maintainability DoD

새 기능을 추가할 때 기존 여러 surface를 각각 수정하지 않아도:

```text
Domain Command
Shared Primitive
Design Token
Selector
```

확장을 통해 일관되게 반영할 수 있어야 한다.

---

## 24.74 Final Sign-off Checklist

### Product

- [ ] Task Detail 정보 구조가 확정됐다.
- [ ] 각 property의 interaction semantics가 확정됐다.
- [ ] destructive/recurrence scope가 확정됐다.
- [ ] V1 / Later 범위가 구분됐다.

### Design

- [ ] Detail density/hierarchy가 일관된다.
- [ ] interaction states가 tokenized됐다.
- [ ] desktop/mobile floating UI 전략이 일치한다.
- [ ] TickTick fidelity audit 대상이 명확하다.

### Frontend

- [ ] Shared Task entity/store를 사용한다.
- [ ] Draft/Selection/Focus/Popover state가 분리됐다.
- [ ] Common command/floating/focus primitives를 사용한다.
- [ ] stale async response 방어가 있다.

### Backend / Persistence

- [ ] Partial patch 또는 safe merge를 지원한다.
- [ ] structural transaction을 지원한다.
- [ ] revision/idempotency strategy가 있다.
- [ ] soft delete/Undo lifecycle을 지원할 수 있다.
- [ ] Attachment authorization/storage lifecycle이 정의됐다.

### QA

- [ ] End-to-end scenarios를 통과했다.
- [ ] Race/failure injection test를 통과했다.
- [ ] Visual regression을 통과했다.
- [ ] Keyboard/Accessibility smoke test를 통과했다.
- [ ] Light/Dark/Mobile/Zoom 검증을 통과했다.

---

## 24.75 Final Rule

Task Detail 구현의 최종 판단 기준은 다음 한 문장이다.

> 사용자가 어느 View에서 Task를 열고 수정하더라도, 저장을 의식하지 않고 빠르게 작업할 수 있으며, 같은 Task 상태가 앱 전체에 즉시 일관되게 반영되고, 실패·실수·동시 수정 상황에서도 사용자의 데이터를 잃지 않아야 한다.

이 조건을 만족하면 본 Master Specification 기준의 Task Detail V1을 완료한 것으로 본다.

---

# 25. TickTick Fidelity Verification & Product Gap Addendum

## 25.1 Purpose

이 장은 기존 1–24장의 설계를 폐기하지 않고, **실제 TickTick 외부 behavior로 검증된 사실**과 **우리 구현을 위한 자체 설계 결정**을 분리하기 위한 최종 fidelity layer다.

이 장의 correction은 기존 장과 충돌할 경우 **TickTick fidelity profile에서 우선**한다.

---

## 25.2 Fidelity Status Labels

모든 향후 TickTick-specific rule은 가능한 경우 다음 상태 중 하나를 가진다.

```text
[VERIFIED TICKTICK]
공식 TickTick Help / 공식 release note에서 외부 behavior 확인.
내부 구현 방식까지 확인된 것은 아님.

[OBSERVED / PLATFORM-SPECIFIC]
특정 Desktop/Mobile/Tablet surface에서 관찰 또는 공식 이미지로 확인.
모든 platform에 일반화하지 않음.

[OUR DESIGN DECISION]
동일한 UX를 안정적으로 구현하기 위해 우리가 정의한 architecture/domain rule.
TickTick 내부 구현이라고 주장하지 않음.

[NEEDS FIDELITY AUDIT]
실제 DOM/CSS/interaction 실측이 필요한 값 또는 behavior.
```

금지:

```text
❌ OUR DESIGN DECISION을 "TickTick 내부 구조"라고 서술
❌ Desktop에서 본 behavior를 Mobile까지 자동 일반화
❌ 미실측 pixel/token을 verified 값으로 표기
```

---

## 25.3 Verified External Behavior vs Internal Architecture

다음은 실제 TickTick behavior로 검증 가능한 범주다.

```text
Task Detail capabilities
Task Popup / split-column presentation
Task Detail action customization
Subtask maximum depth
Start Focus
Task Activities
Save as Template
Convert to Note
Comment
Assign
Won't Do / Restart
Duplicate
Copy Link
```

반대로 다음은 현재 Master Spec의 **reference implementation**이다.

```text
selectedTaskId
normalized tasksById store
mutation queue
entity/property revision
stale-response defense
soft-delete schema
Action Registry implementation
z-index token architecture
Undo transaction representation
storage/sync adapters
```

위 architecture는 제품 품질을 위해 유지하지만:

> **TickTick도 내부적으로 동일하게 구현되어 있다고 가정하지 않는다.**

---

## 25.4 Task Detail Presentation Model

### Verified rule

```text
Desktop List-like context
→ side-detail / structural detail presentation

Mobile v7.0+
→ Task Popup Style

Tablet
→ scenario에 따라 split-column 또는 pop-up
```

따라서 canonical state는:

```ts
selectedTaskId: string | null;
```

를 계속 사용할 수 있지만 presentation state를 분리한다.

```ts
type TaskDetailPresentation =
  | "side-pane"
  | "split-column"
  | "popup"
  | "full-page";
```

### Invariant

```text
same Task entity
same commands
same validation
same persistence
same undo semantics

presentation만 context에 따라 변경
```

### Prohibited

```text
❌ Desktop side-pane을 모든 platform의 유일한 Detail UI로 강제
❌ Mobile popup에 별도 Task entity/business logic 생성
❌ width 하나만으로 TickTick behavior 전체를 결정한다고 주장
```

---

## 25.5 Task Detail Action Menu Customization

> **[VERIFIED TICKTICK]** Task Detail/popup의 action menu는 Edit을 통해 customize할 수 있다. 사용자는 action을 pin/unpin하고 drag하여 순서를 변경할 수 있다.

제품 semantics:

```text
frequent action
→ pin 가능

low-frequency action
→ More에 유지 가능

user
→ order 변경 가능
```

Reference implementation:

```ts
type TaskDetailActionPreference = {
  pinnedActionIds: string[];
  orderedActionIds: string[];
};
```

> **[OUR DESIGN DECISION]** 위 preference field 이름/저장 구조는 TickTick 내부 구조가 아니라 우리 구현안이다.

Preference scope:

```text
Task entity        ❌
User UI preference ✅
```

Action customization으로 action의 domain availability가 바뀌지는 않는다.

예:

```text
Assign
→ shared list가 아니면 pin되어 있어도 hidden/unavailable
```

---

## 25.6 Verified Action — Start Focus

> **[VERIFIED TICKTICK]** Task Detail에서 `Start Focus`를 실행할 수 있고 Focus mode에서 Pomo/Stopwatch 등을 시작할 수 있다.

기본 command:

```ts
startFocusForTask(taskId, mode?);
```

Task Detail의 책임:

```text
Task identity 전달
Focus entry point 제공
현재 action context 유지
```

Focus engine의 책임:

```text
timer lifecycle
pause/resume
focus statistics
cross-device focus sync
```

금지:

```text
❌ Task Detail component가 timer engine 자체를 구현
❌ Focus를 단순 boolean Task field로 축약
```

---

## 25.7 Verified Action — Task Activities

> **[VERIFIED TICKTICK]** Task Detail의 More에서 `Task Activities`를 열어 Task의 변경 history를 확인할 수 있다.

UI semantics:

```text
Task Detail
→ More
→ Task Activities
→ history surface
```

Activity는 현재 Task의 canonical state를 복제하는 surface가 아니다.

Reference model:

```ts
type TaskActivityEvent = {
  id: string;
  taskId: string;
  actorId?: string;
  action: string;
  createdAt: string;
  metadata?: unknown;
};
```

> **[OUR DESIGN DECISION]** event schema는 구현 제안이며 TickTick 내부 schema로 간주하지 않는다.

---

## 25.8 Verified Action — Save as Template

> **[VERIFIED TICKTICK]** 기존 Task를 `Save as Template`로 저장하고 이후 새 Task 작성 시 Template에서 불러올 수 있다.

Task Detail action:

```text
Save as Template
```

기본 semantics:

```text
current Task
→ reusable Task Template 생성
→ current Task 자체는 유지
```

Template는 Task duplicate와 구분한다.

```text
Duplicate
→ 즉시 새로운 Task entity

Save as Template
→ 재사용 가능한 template definition
```

Reference command:

```ts
saveTaskAsTemplate(taskId);
```

---

## 25.9 Verified Action — Convert to Note

> **[VERIFIED TICKTICK]** Task는 Note로 변환할 수 있다.

Important verified constraint:

```text
Task에 Subtask가 있으면
→ Convert to Note 불가
```

따라서 action availability:

```ts
canConvertTaskToNote(taskId)
  = subtaskCount(taskId) === 0
    && otherProductConstraintsPass;
```

변환 시 silent data loss를 허용하지 않는다.

구체 Note schema는 별도 Note spec의 책임이다.

---

## 25.10 Verified Feature — Comments

> **[VERIFIED TICKTICK]** Shared List의 Task에 Comment를 남겨 협업할 수 있고, 개인 전용 List에서도 Comment를 note-like 기록으로 사용할 수 있다.

Comment는 Description과 별개다.

```text
Description
→ Task 본문

Comment
→ 시간 순서가 있는 추가 메시지/기록
```

Reference model:

```ts
type TaskComment = {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
};
```

Shared context에서는 mention/notification과 연결 가능하다.

---

## 25.11 Verified Feature — Assign

> **[VERIFIED TICKTICK]** Shared List의 Task는 member에게 Assign할 수 있다.

Availability:

```text
personal/non-shared list
→ Assign hidden/unavailable

shared list + permission
→ Assign available
```

Reference relation:

```ts
type TaskAssignee = {
  taskId: string;
  userId: string;
};
```

실제 cardinality와 permission model은 Collaboration spec에서 최종 확정한다.

Assign action은 Task Detail뿐 아니라 bulk/list surface와 같은 domain command를 재사용한다.

---

## 25.12 Verified Subtask Fidelity — Five Levels

> **[VERIFIED TICKTICK]** Subtask를 다시 Subtask로 만들 수 있으며 최대 5개의 Task hierarchy level을 지원한다.

TickTick fidelity profile:

```ts
TICKTICK_MAX_TASK_DEPTH = 5;
```

Subtask는 일반 Task와 같은 주요 기능을 가진다.

```text
schedule/time/duration
focus
description/details
trash recovery
tags
priority
assignment
```

따라서 기존 Chapter 12의 핵심 결정:

```text
Subtask is a Task
```

은 유지한다.

---

## 25.13 Verified Task Detail Capability Matrix

| Capability | Fidelity status | Master Spec action |
|---|---|---|
| Desktop side detail | VERIFIED / context-specific | 유지 |
| Mobile Task Popup | VERIFIED | Chapter 1 보정 |
| Tablet split-column / popup | VERIFIED | Chapter 1 보정 |
| Date / Time / Duration | VERIFIED | 유지 |
| Reminder / multiple reminders | VERIFIED | 유지 |
| Repeat / custom repeat | VERIFIED | 유지 |
| Priority | VERIFIED | 유지 |
| Rich description / Markdown / slash menu | VERIFIED | 유지 |
| Checklist / Check Items | VERIFIED | 유지 |
| Subtask as full Task | VERIFIED | 유지 |
| Max 5 hierarchy levels | VERIFIED | `12.49` 확정 |
| Tags / List | VERIFIED | 유지 |
| Attachment | VERIFIED | 유지 |
| Won't Do / Restart | VERIFIED | 유지 |
| Pin | VERIFIED | 유지 |
| Duplicate | VERIFIED | 유지 |
| Copy task link | VERIFIED | 유지 |
| Start Focus | VERIFIED | **추가** |
| Task Activities | VERIFIED | **추가** |
| Save as Template | VERIFIED | **추가** |
| Convert to Note | VERIFIED | **구체화** |
| Comments | VERIFIED | **추가** |
| Assign | VERIFIED in shared lists | **추가** |
| Action menu customization | VERIFIED | **추가** |
| `selectedTaskId` architecture | OUR DESIGN DECISION | 유지 |
| normalized store / mutation queue | OUR DESIGN DECISION | 유지 |
| 420px default / 360–600 width | NEEDS FIDELITY AUDIT | token 유지, verified로 취급 금지 |
| exact header/icon/row geometry | NEEDS FIDELITY AUDIT | live measurement 필요 |
| exact motion timing | NEEDS FIDELITY AUDIT | live measurement 필요 |

---

## 25.14 Fidelity Override Rules

다음 기존 문장은 전역 규칙으로 해석하지 않는다.

### Old interpretation

```text
Task Detail = 항상 persistent right-side pane
Small screen = 항상 full-screen
More Actions = 고정된 메뉴 순서
Max depth = unspecified configurable number
```

### Final TickTick fidelity interpretation

```text
Task Detail semantics
= one canonical detail system

Presentation
= side-pane / split-column / popup / fallback full-page

Action surface
= context-sensitive + user-customizable

Max hierarchy depth
= 5 levels in TickTick fidelity profile
```

---

## 25.15 External Verification Sources

검증일:

```text
2026-08-23
```

공식 TickTick Help / release documentation 기준:

1. **Task Details and Editing**  
   https://help.ticktick.com/articles/7055782408586526720

2. **Multilevel Tasks**  
   https://help.ticktick.com/articles/7055782219767349248

3. **How to Start Focus?**  
   https://help.ticktick.com/articles/7055782010496745472

4. **How Teams Can Collaborate**  
   https://help.ticktick.com/articles/7055781688281923584

5. **Updates in 2023 — Mobile v7.0 Task Popup Style / Detail Menu Customization**  
   https://help.ticktick.com/external/articles/7155128685119406080

6. **Updates in 2024 — Tablet Task Detail split-column / pop-up behavior**  
   https://help.ticktick.com/external/articles/7301088783166865408

### Source interpretation rule

공식 문서로 확인 가능한 것은 **외부 기능 및 behavior**다.

```text
공식 Help에서 feature 설명 확인
→ [VERIFIED TICKTICK]

소스 코드/DB schema/state manager 구조
→ 공개 검증 불가
→ [OUR DESIGN DECISION]
```

---

## 25.16 Additional Release Gates

TickTick fidelity release 전에 다음을 추가 검증한다.

### Presentation

- [ ] Desktop List-like context에서 side-detail이 자연스럽다.
- [ ] Mobile에서 popup presentation을 지원한다.
- [ ] Tablet에서 split-column / popup 전환이 가능하다.
- [ ] presentation이 바뀌어도 Task data/commands가 중복되지 않는다.

### Actions

- [ ] Start Focus entry가 존재한다.
- [ ] Task Activities를 열 수 있다.
- [ ] Save as Template가 존재한다.
- [ ] Convert to Note가 존재하며 Subtask 보유 Task를 안전하게 차단한다.
- [ ] Comment를 지원한다.
- [ ] Shared List에서 Assign을 지원한다.
- [ ] Action menu pin/unpin/reorder preference를 지원한다.

### Hierarchy

- [ ] TickTick fidelity profile에서 hierarchy depth가 5를 초과하지 않는다.
- [ ] Subtask가 일반 Task capability를 재사용한다.

### Provenance

- [ ] Verified behavior와 자체 architecture를 문서에서 구분한다.
- [ ] 미실측 pixel/motion 값은 `[NEEDS FIDELITY AUDIT]`로 남긴다.
- [ ] 실제 TickTick 내부 구현이라고 검증되지 않은 내용을 그렇게 표현하지 않는다.

---

## 25.17 Updated Final Fidelity Rule

Task Detail의 목표는 더 이상 단순히:

```text
"오른쪽에 TickTick 같은 pane 만들기"
```

가 아니다.

최종 목표:

> **TickTick에서 실제로 확인되는 Task Detail 기능·정보 밀도·context switching·platform-specific presentation을 재현하되, 공개되지 않은 내부 구현은 우리 architecture로 명확히 분리하고, 모든 surface가 하나의 canonical Task system을 공유하도록 한다.**

---

# END OF CHAPTERS 1–25

`TICKTICK_STYLE_TASK_DETAIL_SPEC.md`

> 이 저장소에 적용할 때는 **26장을 먼저 읽는다.** 26장은 1–25장과 현재 코드베이스가
> 충돌하는 지점을 명시하고, 그 지점에서 우선한다.

Status:

```text
Chapters 01–25: Designed
Architecture: Defined
Interaction Model: Defined
Data / Sync Rules: Defined
Visual System: Tokenized
Accessibility: Defined
Final Acceptance Criteria: Defined
TickTick External Fidelity Layer: Verified / Added
```

Exact TickTick pixel values and motion timings that require live DOM/CSS measurement remain intentionally tokenized for a later fidelity audit.

```text
Chapter 26: Codebase Harmonization Overrides — 확정
```

---

# 26. Codebase Harmonization Overrides

## 26.1 Purpose

1–25장은 TickTick fidelity를 기준으로 쓰인 문서이며, 이 저장소의 현재 구조를 전제하지 않는다.

이 장은 두 가지를 한다.

```text
1. 1–25장과 현재 코드베이스가 충돌하는 지점을 명시한다
2. 그 지점에서 무엇을 따를지 확정한다
```

### Precedence

```text
Chapter 26  >  Chapter 1–25
```

26장이 다루지 않는 모든 것은 1–25장이 그대로 유효하다. 26장은 스펙을 폐기하지 않고,
**충돌 지점에서만** 우선한다.

이 우선순위가 필요한 이유는 단순하다. 1–25장의 일부 모델은 이 저장소가 이미 겪고 문서로 남긴
문제를 다시 만든다(26.5). 스펙을 글자 그대로 따르는 것이 스펙의 MUST를 깨는 경우가 있다.

---

## 26.2 Override Summary

| # | 영역 | 1–25장 | Chapter 26 | 근거 |
|---|---|---|---|---|
| D1 | Task Status | `open / completed / wont_do` 단일 축 | Lifecycle(3값) + Workflow(`sectionId`) 분리 | 26.3 |
| D1a | Workflow 축 | 명시 없음 | `sectionId`, `statusId`는 은퇴 | 26.3.3 |
| D2 | Legacy Subtask | 언급 없음 | Child Task로 승격 유지 · CheckItem과 통합 금지 | 26.4 |
| D3 | Schedule | `startAt / endAt` instant | LocalDate + wall-clock 유지 | 26.5 |
| D3a | `allDay` | 저장 필드 | derived state | 26.5.3 |
| D4 | Reminder | 단일 관심사 | Reminder entity + Delivery Adapter 분리 | 26.6 |
| D5 | Recurrence | Series/Occurrence/Exception 필수 | 1차 범위에서 제외 | 26.7 |
| D6 | Mutation identity | mutation object + ID + per-entity sequence | state 기반 보장 (snapshot + queue + revision) | 26.8.1 |

---

## 26.3 D1 · Lifecycle 과 Workflow 의 분리

### 26.3.1 문제

현재 `Task.status`는 네 가지 서로 다른 질문에 한 필드로 답하고 있다.

```text
status: "inbox"     → 어느 컨테이너에 있는가
status: "todo"      → 작업 흐름상 어디인가
status: "doing"     → 작업 흐름상 어디인가
status: "waiting"   → 작업 흐름상 어디인가
status: "done"      → 생명주기가 끝났는가
status: "archived"  → 생명주기가 끝났는가 (은퇴 중)
```

2장은 이것을 `open / completed / wont_do` 세 값으로 축소하라고 한다.
**그대로 축소하면 `todo / doing / waiting`이 표현하던 작업 흐름 정보가 소실된다.**

### 26.3.2 확정

세 축으로 분리한다. 하나의 필드가 하나의 질문에만 답한다.

```text
Lifecycle   open | completed | wont_do
Workflow    sectionId
Deletion    deletedAt
```

```ts
type TaskLifecycle = "open" | "completed" | "wont_do";
```

각 축의 소유:

```text
Lifecycle
  → 이 Task가 끝났는가, 어떤 방식으로 끝났는가
  → 완료 / 포기 / 진행 중, 세 상태로 닫힌다

Workflow
  → List 안에서 어느 컬럼에 놓였는가
  → 사용자가 정의하며, 개수와 이름이 고정되어 있지 않다

Deletion
  → 휴지통에 있는가
  → Lifecycle과 직교한다. 완료된 Task도 삭제될 수 있다
```

### 26.3.3 D1a · Workflow 축은 `sectionId`다

`statusId`가 아니다. 이유:

```text
statusId가 의미를 갖던 근거
  = Project별 커스텀 상태 집합 (statusesWithCustom)

Project 기능 제거와 함께 그 집합이 사라짐
  → statusId는 DEFAULT_STATUSES의 여섯 값만 가리킬 수 있음
  → 즉 status를 한 번 더 가리키는 필드
```

반면 `ListSection` + `Task.sectionId`는 살아 있고, List별 보드 컬럼으로 실제 렌더링된다
(`domain/tasks/sections.ts`, `TasksModule`의 `listBoardColumns`).

```text
✅ Workflow = sectionId    List가 소유하는 컬럼, 이미 동작함
❌ Workflow = statusId     소유자 없는 두 번째 컬럼 개념의 부활
```

이것은 fidelity 측면에서도 더 정확하다. TickTick의 칸반 컬럼은 별도의 workflow status가 아니라
**List의 Section**이다.

### 26.3.4 마이그레이션

기존 여섯 값은 다음으로 흡수된다.

```text
inbox     → List membership (받은함 List 소속). 이미 그렇게 동작 중
todo      → Lifecycle open. Workflow는 Section 미지정(기본 컬럼)
doing     → Lifecycle open + Section "Doing"
waiting   → Lifecycle open + Section "Waiting"
done      → Lifecycle completed
archived  → Lifecycle wont_do (D-20이 이미 그렇게 읽고 있음)
```

`doing` / `waiting`을 Section으로 옮기는 것은 **자동 생성이 아니다.** 해당 값을 가진 Task가
실제로 존재하는 List에만 Section을 만든다. 쓰지 않는 컬럼을 모든 List에 심는 것은
사용자가 만들지 않은 구조를 앱이 발명하는 일이다.

### 26.3.5 술어를 먼저, enum은 나중에

`domain/tasks/taskState.ts`의 `isTaskOpen / isCompleted / isWontDo / isTaskAlive`를 유지하고
활용한다. 순서:

```text
1. 모든 화면이 status 원값 대신 술어만 읽도록 바꾼다
2. 그 다음 enum을 좁힌다
```

역순으로 하면 enum을 좁히는 커밋 하나에서 앱 전역이 동시에 깨진다.
술어는 이미 한 곳에 모여 있으므로 1단계는 기계적인 작업이다.

### 26.3.6 Invariants

- [ ] 한 필드는 한 질문에만 답한다.
- [ ] Lifecycle은 세 값으로 닫힌다.
- [ ] Workflow 컬럼은 List가 소유한다.
- [ ] `deletedAt`은 Lifecycle과 직교한다.
- [ ] 화면은 status 원값을 직접 비교하지 않는다.
- [ ] `statusId`는 새 코드에서 읽지 않는다.

---

## 26.4 D2 · Legacy Subtask 는 Task 로 간다

### 26.4.1 문제

현재 자식은 두 종류다.

```text
Child Task      parentTaskId. 날짜·우선순위·상태를 가진 완전한 Task
Legacy Subtask  id · title · completed. 그 이상 없음
```

`domain/tasks/children.ts`가 둘을 `TaskChild` 유니온으로 읽고, 사용자가 건드릴 때만 승격한다.
일괄 마이그레이션을 하지 않는 것은 의도된 선택이다 — 전체 재작성은 전체 업로드이고,
이 저장소는 그 write amplification을 두 번 제거했다.

### 26.4.2 확정

```text
Legacy Subtask  →  Child Task   (기존 승격 경로 유지)
Checklist       →  신규 CheckItem
```

Legacy Subtask를 CheckItem으로 보내지 않는다.

### 26.4.3 근거

Legacy Subtask의 *모양*은 CheckItem과 같다(텍스트 + 체크). 그래서 CheckItem으로 보내는 것이
자연스러워 보인다. 그렇게 하면 안 되는 이유는 모양이 아니라 **데이터의 출처**다.

```text
Legacy Subtask는 "Subtask"라는 이름으로 만들어진 데이터다.

같은 화면에서 같은 의도로 만든 항목이
  일부는 Child Task로 (이미 승격된 것)
  일부는 CheckItem으로 (아직 승격 안 된 것)

갈라지면, 사용자가 만든 적 없는 구분이 마이그레이션 시점에 의해 생긴다.
```

승격 시점이 데이터의 종류를 결정하게 두어서는 안 된다.

### 26.4.4 원칙

```text
Subtask       = Task
Checklist Item = CheckItem
```

이 둘은 12장과 11장이 이미 분리해 둔 구분이고, 26장은 그 구분을 레거시 데이터에도
일관되게 적용할 뿐이다.

### 26.4.5 Invariants

- [ ] 계층의 canonical 관계는 `parentTaskId` 하나다.
- [ ] Legacy Subtask는 Child Task로만 승격된다.
- [ ] CheckItem은 Checklist 기능으로만 생성된다.
- [ ] 승격은 일괄 실행하지 않는다.
- [ ] 승격 전후로 사용자에게 보이는 항목의 성격이 바뀌지 않는다.

---

## 26.5 D3 · Schedule 은 wall-clock 을 유지한다

### 26.5.1 스펙과의 충돌

2.9 / 2.35가 제안하는 모델:

```ts
type TaskSchedule = {
  startAt: string;        // ISO instant
  endAt: string | null;
  allDay: boolean;
  timezone: string | null;
};
```

`startAt: string`은 사실상 ISO instant다. 올데이 Task를 instant로 저장하면
UTC 동쪽 사용자에게 날짜가 하루 밀린다.

스펙 자신이 `24.8`에서 이것을 MUST로 금지한다.

```text
[ ] All-day date가 timezone shift로 바뀌지 않는다.
```

즉 **2장의 모델을 그대로 따르면 24장의 MUST를 깨기 쉽다.**

### 26.5.2 확정

현재 구조를 유지한다.

```ts
startDate: LocalDate | null;   // "YYYY-MM-DD"
dueDate:   LocalDate | null;
startTime: LocalTime | null;   // "HH:mm"
endTime:   LocalTime | null;
timezone:  string | null;
```

`domain/schedule/types.ts`가 이 선택의 이유를 이미 문서로 남겨 두었다. 날짜와 시간은
정의상 벽시계이고, instant로의 변환은 알림 스케줄러의 문제다.

### 26.5.3 D3a · `allDay` 는 derived 다

저장 필드로 올리지 않는다.

```ts
const isAllDay = hasDate(schedule) && schedule.startTime === null;
```

근거:

```text
저장하면 두 개의 진실이 생긴다
  allDay: true  +  startTime: "14:00"
  → 표현 가능하고, 의미 없음

파생하면 모순 자체가 표현 불가능하다
```

이것은 이 저장소가 이미 여러 번 적용한 규칙이다 — `ScheduleMode`도, Eisenhower quadrant도
저장하지 않고 파생한다. 26장은 같은 규칙을 `allDay`에 적용한다.

스펙이 `allDay`를 필드로 둔 이유는 instant 모델에서는 파생이 불가능하기 때문이다.
instant를 쓰지 않으면 그 필요도 사라진다.

### 26.5.4 스펙 MUST 충족 여부

`24.8`의 11개 MUST 중 10개가 현재 구조에서 그대로 성립한다.
남는 하나는 다음이며, 이것은 모델이 아니라 UI 문제다.

```text
[ ] All-day와 Timed Task를 구분한다
    → derived isAllDay로 구분하고, 편집기가 그것을 표시한다
```

### 26.5.5 Invariants

- [ ] 날짜와 시간은 벽시계 문자열로 저장한다.
- [ ] `allDay`를 저장하지 않는다.
- [ ] instant 변환은 알림 스케줄러 안에서만 한다.
- [ ] Duration은 derived다.
- [ ] `domain/schedule/`의 검증·정규화를 우회하는 schedule 쓰기를 만들지 않는다.

---

## 26.6 D4 · Reminder 는 저장과 발송을 분리한다

### 26.6.1 확정

복수 Reminder entity로의 승격에 동의한다. 6장의 모델을 따른다.

추가로, **두 책임을 분리한다.**

```text
Reminder Domain          "언제 알려달라고 저장되어 있는가"
  entity
  trigger 계산
  schedule 변경 시 reschedule
  cancel

Delivery Adapter         "OS 알림이 실제로 발송되었는가"
  Tauri Desktop  → 보장
  Web            → best-effort
```

### 26.6.2 근거

웹에서는 탭이 닫히면 알림이 가지 않는다. 이것은 구현 품질의 문제가 아니라 플랫폼의 사실이다.

두 책임을 한 덩어리로 두면 다음 두 상황을 구분할 수 없다.

```text
알림이 안 왔다
  ├─ Reminder가 저장되지 않았다        → 데이터 버그
  └─ 저장됐지만 발송 경로가 없었다      → 플랫폼 한계
```

스펙 `24.9`도 같은 구분을 MUST로 요구한다.

```text
[ ] Notification permission denied와 Reminder data를 구분한다.
[ ] scheduler failure를 저장 failure와 구분한다.
```

Adapter 분리는 이 MUST를 구조로 만족시키는 방법이다.

### 26.6.3 기존 자산

```text
domain/schedule/reminder.ts       preset 해석, reconcile
domain/schedule/reminderQueue.ts  큐
Tauri notification plugin         발송 경로
```

Adapter는 이 셋을 잇는 얇은 층이며, 새로 만드는 것은 entity와 adapter 인터페이스뿐이다.

### 26.6.4 Invariants

- [ ] Reminder는 Task와 별개 entity다.
- [ ] 하나의 Task가 여러 Reminder를 가질 수 있다.
- [ ] relative / absolute를 구분한다.
- [ ] Schedule 변경 시 relative만 재계산한다.
- [ ] 저장 성공과 발송 성공을 같은 것으로 보고하지 않는다.
- [ ] 발송 불가 플랫폼에서 Reminder 저장을 막지 않는다.

---

## 26.7 D5 · Recurrence Series 는 1차 범위 밖이다

### 26.7.1 확정

```text
유지    현재 preset 반복 (repeatType / repeatInterval / repeatDays / repeatEndDate)
제외    Series / Occurrence / Exception
제외    이번 것만 · 이후 전부 · 전체 편집 scope
```

### 26.7.2 근거

7장은 1,734줄로 전체 스펙의 5%이며, 요구하는 것은 Task Detail의 한 컨트롤이 아니라
독립적인 하위 시스템이다.

```text
3-entity 모델
occurrence identity의 안정성
편집 scope 3종
Series split transaction
DST 안전성
occurrence별 checklist 격리
```

Task Detail이 안정되기 전에 이것을 함께 열면, Detail의 결함과 Recurrence의 결함을
구분할 수 없게 된다.

### 26.7.3 1차에서 해야 하는 것

반복을 숨기지 않는다. 정확히 표시만 한다.

```text
✅ "이 Task는 반복됩니다" + 현재 preset 표시
✅ preset 변경
❌ occurrence 단위 편집
❌ "이후 전부" scope
```

### 26.7.4 열어둘 것

1차 구현이 Series 도입을 막지 않아야 한다.

- [ ] preset을 Series의 rule definition으로 이후 해석할 수 있게 둔다.
- [ ] occurrence 개념을 전제한 UI 문구를 쓰지 않는다.
- [ ] 반복 Task의 완료를 Series 완료로 기록하지 않는다.

---

## 26.8 Reuse Registry — 재구현 금지

다음은 스펙이 요구하는 수준으로 이미 존재한다. 새로 만들지 않는다.

| 영역 | 위치 | 대응 장 |
|---|---|---|
| Schedule domain | `src/domain/schedule/` | 5 |
| Mutation + Undo | `src/domain/tasks/mutations.ts` | 17 |
| Detail presentation registry | `src/domain/tasks/responsive.ts` | 1, 25.4 |
| Scope registry | `src/domain/tasks/scopeRegistry.ts` | 3 |
| Task state 술어 | `src/domain/tasks/taskState.ts` | 4 |
| Visual token + 회귀 e2e | `src/styles/`, `e2e/radiusScale` 외 | 20 |
| Focus engine | `usePlannerData.startFocusSession` | 25.6 |
| Section (보드 컬럼) | `src/domain/tasks/sections.ts` | 26.3.3 |

`mutations.ts`의 `TaskMutation { patch, undo, labelKey }`는 17장의
"Undo는 역동작이 아니라 그 시점 상태의 복원"을 이미 타입 수준에서 구현한다.
새 Undo 메커니즘을 만들지 않고 이것을 확장한다.

---

### 26.8.1 D6 · Mutation identity 는 operation log 가 아니라 state 로 보장된다

16장은 mutation 하나하나를 추적 가능한 object로 만들 것을 요구한다.

```text
16.17  Mutation Object
16.18  Mutation ID (mut_<ulid>)
16.19  Per-entity Sequence
16.20  Stale Response Problem
16.21  Stale Response Rule
```

이 코드베이스는 **operation 기반이 아니라 state 기반**이다.
mutation은 요청/응답이 아니라 동기적인 로컬 state 전이이고,
동기화는 delta가 아니라 스냅샷 전체를 diff해서 올린다.

그래서 mutation ID를 새로 도입해도 막을 race가 남아 있지 않다.
16.18이 열거한 목적은 이미 각각 다른 장치가 담당한다.

| 16장이 요구하는 것 | 이 코드베이스의 대응 | 위치 |
|---|---|---|
| retry | 실패한 save를 backoff로 재시도 | `saveQueue.ts` |
| deduplication | 실행 중 요청은 coalesce, 마지막 payload가 이김 | `saveQueue.ts` |
| stale-response detection (save) | 한 번에 하나만 실행 + `generation` | `saveQueue.ts` |
| stale-response detection (load) | `loadTicketRef` ticket 비교 | `usePlannerData.ts` |
| latest user mutation wins | payload가 항상 최신 state 전체 | `saveQueue.ts` |
| undo association | store `revision` + 스냅샷 undo | `usePlannerData.ts`, `undoStack.ts` |

핵심은 16.19의 "sequence가 필요한 이유"가 여기서는 성립하지 않는다는 것이다.

```text
스펙의 전제:  #1 title="Meeting A" 와 #2 title="Meeting AB" 가
              각각 서버로 나가고 응답 순서가 뒤집힐 수 있다.

이 코드베이스: #1과 #2는 같은 state에 순서대로 적용되고,
              나가는 것은 #2가 적용된 뒤의 state 하나뿐이다.
```

즉 늦은 응답이 UI를 되돌릴 경로가 없다. UI는 응답이 아니라 state를 그린다.

**대신 같은 부류의 race가 두 곳에 실재했고, 둘 다 16.21의 규칙으로 닫았다.**

```text
로드가 로컬 편집 위에 착지  →  reapplyLocalEdits (24.24, 9.45)
로드 이후의 undo 스냅샷      →  store revision (16.21)
```

두 번째가 특히 조용한 실패였다. undo 항목은 PlannerData 전체 스냅샷을 들고 있어서
로드가 store를 교체한 뒤에 적용하면 편집 하나를 되돌리는 것이 아니라
로드가 가져온 레코드 전부를 지운다. 그리고 sync baseline이 이미 `loaded`이므로
다음 save가 그 부재를 "사용자가 지웠다"로 읽어 계정에서도 지운다.

**금지**: mutation object / mutation ID / per-entity sequence를 새로 만드는 것.
이미 있는 보장을 다른 모양으로 다시 구현하는 것이고, 26장이 존재하는 이유가 그것이다.

**필요해지는 조건**: 서버가 delta를 받거나(전체 스냅샷이 아니라 operation),
낙관적 업데이트가 응답을 기다리거나, 오프라인 operation을 큐에 쌓아 재생해야 할 때.
그 셋 중 하나라도 사실이 되면 이 결정을 다시 연다.

---

## 26.9 Implementation Phases

각 단계는 앞 단계가 없으면 다시 써야 하는 순서다.

### Phase 0 · Model Harmonization

화면을 손대지 않는다. 산출물은 타입과 테스트뿐이다.

```text
Lifecycle / Workflow 분리          (26.3)
statusId 은퇴, sectionId 확정      (26.3.3)
Legacy compatibility adapter
CheckItem 신규 모델
Legacy Subtask → Task 승격 유지    (26.4)
Tag canonical source 통일
Domain invariant test
```

> Tag는 현재 `task.tags: string[]`와 `Tag` + `TaskTag` 관계가 **둘 다** 살아 있다.
> 26장은 관계 쪽을 canonical로 확정한다. 문자열 배열은 읽기 fallback으로만 남는다.

### Phase 1 · Editing Infrastructure

이후 모든 편집 UI가 이 계층 위에 올라간다.

```text
Draft state                        useDeferredTextField
Enter commit / Esc cancel          useDeferredTextField
Blur · Task 전환 시 flush           useDeferredTextField
IME composition guard              useDeferredTextField
Mutation ID / sequence             D6 — state 기반으로 대체 (26.8.1)
Stale response protection          reapplyLocalEdits · loadTicket · store revision
Save failure 시 draft 보존          usePlannerData 로컬 저장 실패 처리
```

> 현재 Drawer의 제목은 키 입력마다 도메인에 직접 커밋된다(`TaskDrawer`).
> 9장의 MUST를 정면으로 어기는 지점이며, Phase 1의 첫 대상이다.

"Save failure 시 draft 보존"은 이 앱에서 두 층이다.
원격 save 실패는 `saveQueue`가 이미 최신 state로 재시도한다.
문제는 로컬 스냅샷 쓰기였다 — 계정은 선택이지만 로컬 저장은 아니고,
quota가 차면 effect에서 throw해서 렌더를 같이 죽였다.
9.45와 16.38이 요구하는 두 가지를 지킨다: draft를 되돌리지 않고, 실패를 숨기지 않는다.
16.93에 따라 toast가 아니라 사라지지 않는 bar다.

### Phase 2 · Content

```text
Title                              useDeferredTextField (Phase 1)
Description                        useDeferredTextField (Phase 1)
Checklist                          ChecklistEditor + domain/tasks/checkItems
Description ↔ Checklist 전환        domain/tasks/contentMode + setTaskContentMode
Subtask                            childrenOf · childDraft (기존)
최대 5단계 hierarchy                domain/tasks/hierarchy
Parent navigation                  Drawer breadcrumb + child Task 열기
```

역방향 변환은 §11.18의 기본값이 아니라 §11.19의 확장안을 택했다.
checked 상태를 버리는 것은 되돌릴 수 없고, 되돌릴 수 없는 것을 되돌리는 Undo는 Undo가 아니다.
`- [x]` 문법이 사용자 텍스트에 남는 대신 왕복이 무손실이 되고, 그래야 §11.15가 성립한다.
§11.20은 그대로다 — 체크박스처럼 보이는 텍스트를 자동으로 entity로 읽지 않는다.

Checklist editor의 마지막 행은 entity가 아니라 draft다.
§11.22가 권장하는 "첫 유효 text에서 생성"을 만족하면서,
§11.23·§11.27·§11.30이 지우라고 말하는 빈 entity가 애초에 생기지 않는다.

깊이 제한은 데이터가 아니라 제품 규칙이다(§12.5).
그래서 §22.19가 성립한다 — 이미 5단계보다 깊은 데이터는 강제로 펴지 않고 그대로 보여준다.

### Phase 3 · Properties

```text
Shared Popover primitive        domain/floating + components/floating
ScheduleEditor 연결              SchedulePicker (기존 editor 그대로)
Priority                        domain/tasks/priority + PriorityPicker
List                            domain/tasks/listPicker + ListPicker
Tags                            domain/tags/tagPicker + TagPicker
Reminder                        Schedule Popover 내부 (§6.4)
```

> `ScheduleEditor`는 이미 완성되어 있으나 레거시 화면에만 연결되어 있다.
> Phase 3은 대부분 신규 구현이 아니라 연결 작업이다.

Reminder는 별도 property row를 만들지 않았다.
§6.4가 진입점을 Schedule Popover **안**으로 못박고,
"Task Detail 상단에 별도의 항상 노출된 Reminder 아이콘"을 V1 기본값으로 하지 않는다고 명시한다.
그래서 ScheduleEditor를 연결한 순간 이 줄은 성립한다 — 새 control을 만들었다면 §6.4를 어겼을 것이다.

다만 §6.3과 §6.15는 아직이다. 지금 모델은 Schedule 위의 단일 `ReminderPreset`이고,
§6.3이 요구하는 것은 별도 entity, §6.15가 요구하는 것은 Task 하나당 복수 Reminder다.
전달 계층(§6.36–§6.40)도 없다 — `domain/schedule/index.ts`가 이미 그렇게 적어두었다(audit D5).
둘 다 연결 작업이 아니라 **모델 변경**이므로, 26.10이 Phase 0에 요구한 규칙에 따라
화면과 같이 움직이지 않는 별도 단계에 속한다.

Phase 3에서 내린 판단 세 가지:

Escape는 capture가 아니라 bubble에서 받는다.
ScheduleEditor는 subpanel에서 뒤로 가기 위해 자기 capture listener를 이미 갖고 있었고,
layer manager가 capture에 있으면 등록 순서상 항상 먼저 도달해 popover 전체를 닫았다.
§19.25는 Escape가 한 겹만 벗긴다고 말하고, 그 한 겹이 늘 popover인 것은 아니다.

List 이동은 subtree 단위다(§13.14). 기존 `moveTaskToList`는 받은 Task 하나만 썼고,
그래서 자식이 있는 부모를 옮기면 자식들이 옛 List에 남았다 — §2.24가 금지하는 상태를,
그것을 지켜야 할 연산이 만들고 있었다. 양쪽 List 어느 화면에도 보이지 않아 조용했다.

Tag toggle은 relation만 지운다(§13.45). `removeTag`는 Tag 자체를 지우므로,
picker가 이름이 비슷하다는 이유로 그것을 불렀다면 한 Task에서 체크를 푸는 동작이
다른 마흔 개 Task에서도 태그를 떼었을 것이다.

### Phase 4 · Detail Shell Fidelity

```text
Resize                          app/taskDetailWidth + useTaskDetailWidth
Width persistence               localStorage (UI preference, §1.14)
Sticky property header          tm-drawer-head + tm-drawer-scroll
Loading                         이미 성립 — local store에서 동기적으로 읽음
Task switching                  Drawer의 key 제거 (§1.26)
Query에서 Task가 사라져도 Detail 유지   mutate()의 자동 close 제거 (§1.28)
Close / Esc                     Phase 2에서 완료
Focus restoration               Phase 3의 popover + useFocusTrap
```

§1.28은 기존 동작을 **뒤집는다**. `mutate()`는 Task가 Scope를 벗어나면 Drawer를
닫았고(TickTick plan §12.21/§4.64), 이 스펙은 반대를 말한다 — §1.28, §1.40,
§3.x(2407·2453·2462·2493), 그리고 §3 acceptance가 "완료로 query에서 사라져도
Detail은 유지된다"라고 직접 적는다. 다섯 번 반복되는 규칙이라 해석의 여지가 없다.

결정적인 사례는 평범한 쪽이다: Today에서 읽고 있던 Task를 완료 처리하는 것.
옛 동작은 방금 끝낸 일에 메모를 남기려는 바로 그 순간 패널을 치웠고,
돌아가는 길은 이미 필터에서 빠진 row를 찾는 것이었다.
§1.27(삭제)은 그대로 닫는다 — 삭제된 Task는 보여줄 Detail이 없고,
그것은 필터에 맞지 않게 된 Task와 다른 문제다.

Phase 4에서 드러난 것 세 가지:

Detail이 독립적으로 scroll하지 않았다(§1.17). `.tm-sidebar`와 `.tm-main`은
이미 `overflow-y: auto`를 갖고 있었지만 shell 높이를 묶는 것이 없었다 —
`.app-frame`이 `min-height`만 설정하므로 grid row가 가장 큰 자식까지 자랐고
**페이지 전체가** scroll했다. 520px 창에서 subtask 12개짜리 Detail을 열면
shell이 766px이 된다. §1.17이 명시적으로 금지하는 "전체 앱을 하나의 scroll
container로" 만드는 상태였다.

`min-height: 0`이 두 군데 필요했다. grid item과 flex item 모두 기본값이
`auto`라 내용보다 작아지기를 거부한다. 이것 없이는 안쪽 영역이 scroll할
기준 높이를 못 가지고, sticky header도 붙을 곳이 없다.

Drawer의 `key={task.id}`는 §1.26이 피하라고 적은 "Pane close/reopen"을
그대로 만들고 있었다. 텍스트 필드는 이미 `resetKey`를 쓰고 schedule editor는
자체 key가 있으므로, 남은 것은 checklist의 draft 행 하나뿐이었다 —
상태를 가진 component를 key하고, 그것을 감싼 surface는 두었다.

### Phase 5 · Actions

```text
Action Registry                 domain/tasks/actions
Duplicate                       domain/tasks/duplicate + usePlannerData
Copy Link                       app/taskLink + lib/copyText
Pin                             Task.pinnedAt + taskState.isPinned
Won't Do                        기존 mutation을 More로 옮긴 것 (§15.3)
Start Focus                     usePlannerData.startFocusSession 연결 (§25.6)
Task Activities                 domain/tasks/activity — 파생이며 이벤트 로그가 아니다
```

Phase 5의 실제 작업은 **하나로 모으는 것**이었다. §15.63이 요구하는 것은
"Detail More / Row Context Menu / Board Card More가 서로 다른 business logic을
갖지 않는다"이고, 이 저장소는 정확히 그 반대였다 — 행 메뉴는 `TasksModule`
안에 손으로 적혀 있었고 Detail에는 메뉴가 아예 없어서, Won't Do와 Trash는
패널 맨 아래 버튼 두 개였고 Pin·Duplicate·Copy Link·Start Focus는
**어느 화면에서도 닿을 수 없었다.**

`domain/tasks/actions`는 closure가 아니라 **데이터**를 돌려준다. 그래야
§15.66이 성립한다 — `canRunTaskAction`이 클릭 시점에 같은 질문을 다시 하고,
closure로 만든 registry에는 다시 물어볼 것이 남아 있지 않다.

손으로 적힌 메뉴가 틀렸던 것 세 가지:

휴지통에 있는 Task에 "휴지통으로"를 내주고 있었다. 그 동작의 유일한 효과는
거기에 넣은 timestamp를 다시 쓰는 것이다. §15.5는 이 경우를 disabled가 아니라
**hide**로 보내고, 남는 것은 복원 하나다.

Start Focus는 다른 세션이 돌고 있으면 조용히 아무것도 하지 않았다
(`startFocusSession`이 early return한다). §15.5의 다른 쪽 — 숨기는 것이 아니라
"지금은 안 됨"이고, 그래서 이유와 함께 disabled다.

Duplicate는 Phase 2 이후에 쓰인 부모를 자식 없이 복사했고(§15.13),
Tag relation을 빠뜨렸으며(§13.32가 canonical로 정한 쪽), `actualSeconds`와
`activeSessionId`를 spread로 함께 옮겼다 — 갓 만든 사본이 원본의 90분과
원본의 세션을 자기 것이라고 주장했다.

Phase 5에서 내린 판단 네 가지:

**Pin은 `pinnedAt`이다.** §15.6은 `isPinned: boolean`이라고 이름을 적지만,
§15.8이 실제로 요구하는 것은 canonical 값이 **하나**라는 것이고 timestamp도
하나다. 그리고 §15.8이 각 View에 넘긴 질문 — pinned Task들 사이의 순서 —
에는 boolean이 답할 수 없다. `wontDoAt`·`deletedAt`이 이미 쓰는 모양이다.

**Complete는 More에 없다.** §15.4의 표에는 있지만 §15.3은 자주 쓰는 action을
primary surface로 올리라고 말하고, Detail의 header에는 체크박스가 이미 있다.
같은 화면에 두 개를 그리는 것은 §15.70의 "의미 없는 중복 노출"이다. 그래서
registry에 `promoted`가 있다 — 화면이 "이건 내가 이미 그린다"라고 말하고,
registry가 추측하지 않는다.

**Copy Link의 origin은 실행 중인 앱의 것이다.** 데스크톱 빌드에서는 shell의
origin이므로 동료가 따라올 수 있는 주소가 아니다. 공개 base URL이 설정되어
있지 않은 동안에는 이것이 정직한 답이다 — 호스트를 지어내면 아무 데도
resolve되지 않는 링크를 복사하게 된다.

**Task Activities는 이벤트 로그가 아니다.** §25.7이 그리는
`TaskActivityEvent`는 그 절 자신이 OUR DESIGN DECISION으로 표시한 것이고,
이 앱은 스냅샷 전체를 diff해서 동기화한다(§26.8.1). 모든 mutation이 이벤트를
쓰면 편집할 때마다 그 스냅샷이 커지는데, 보존 규칙도 없고 정리할 화면도 없다.
Reminder와 같은 부류의 **모델 변경**이지 메뉴에 매달 수 있는 surface가 아니다.

대신 store가 이미 들고 있는 것을 읽는다 — 만든 시각, 완료, 안 함, 휴지통,
고정, 이 Task에 대한 모든 focus session, 체크된 checklist 줄. 전부 그 시점에
기록된 것이지 재구성이 아니다. **못 하는 것을 적어둔다**: 필드 단위 변경
("제목이 A에서 B로")은 없다. store는 필드의 현재 값만 갖고 있고, 그것은 로그가
있어야 답할 수 있다.

**`Save as Template`은 아직 없다.** §25.8은 VERIFIED TICKTICK이지만 26.9의
Phase 5 목록에도 Deferred 목록에도 들어 있지 않다 — 스펙의 빈틈이다.
Deferred의 다른 항목들과 달리 앱에 없는 개념에 의존하지도 않으므로
(Template은 Task 하나로 만들 수 있다), 미룬 이유는 "어렵다"가 아니라
"Phase 5가 요구하지 않았다"이다. 다음 단계에서 다시 연다.

### Deferred

```text
Recurrence Series      26.7
Attachment             파일 스토리지 결정 선행
Comments               공유 List / 멤버 개념 부재
Assign                 공유 List / 멤버 개념 부재
Convert to Note        Note 도메인 부재
```

Deferred 항목은 난이도 때문이 아니라 **앱에 아직 없는 개념에 의존하기 때문에** 미뤄진다.
`25.11`이 이미 "personal list면 Assign은 unavailable"이라고 적었으므로,
가용성 규칙만 구현하고 기능을 비워두는 것은 스펙과 모순되지 않는다.

---

## 26.10 Chapter 26 Acceptance

Phase 0 완료 판정:

- [ ] Lifecycle이 세 값으로 닫힌다.
- [ ] Workflow가 `sectionId` 하나로 표현된다.
- [ ] 새 코드에서 `statusId`를 읽지 않는다.
- [ ] 화면이 status 원값을 직접 비교하지 않는다.
- [ ] `CheckItem`이 별도 entity로 존재한다.
- [ ] Legacy Subtask 승격 경로가 Child Task로만 향한다.
- [ ] Tag의 canonical source가 하나다.
- [ ] Schedule이 wall-clock을 유지하고 `allDay`가 derived다.
- [ ] 위 전부에 domain invariant test가 있다.
- [ ] 이 단계에서 화면 코드가 변경되지 않았다.

마지막 항목이 중요하다. Phase 0에서 화면이 바뀌었다면 모델과 UI를 함께 움직인 것이고,
둘 중 무엇이 회귀를 만들었는지 구분할 수 없다.

---

## 26.11 Fidelity Status

26장의 결정은 전부 다음 분류다.

```text
[OUR DESIGN DECISION]
```

TickTick이 내부적으로 이렇게 구현되어 있다고 주장하지 않는다.
26장은 **이 저장소에서 스펙의 목표를 달성하기 위한 경로**이며, 목표 자체는 1–25장이 정의한다.

단 하나의 예외는 26.3.3이다.

```text
[VERIFIED TICKTICK]
칸반 컬럼은 별도 workflow status가 아니라 List의 Section이다.
```

이 경우 26장의 선택이 스펙 본문보다 fidelity에 더 가깝다.

---

# END OF CHAPTER 26

