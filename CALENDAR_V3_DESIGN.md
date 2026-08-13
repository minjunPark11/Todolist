# Calendar V3 세부 설계 — Drag-to-create Week/Day Planner

원본 스펙: `CALENDAR_USABILITY_IMPROVEMENT_SPEC_V3_LAYOUT_INTERACTION_READY.md`
기준 구현: `CALENDAR_DESIGN.md` Phase 1~5 (현재 `codex/new_design`에 구현 완료)
이 문서는 위 V3 스펙을 **실제 코드베이스에 맞게 정정한 확정 설계**다. 스펙이 가정한 파일명(DayView.tsx, TaskBlock.tsx, taskStore.ts 등)은 실제 구조와 다르므로 무시하고 아래 실제 파일에 매핑한다.

목표: Calendar를 "보기 화면"에서 **빈 시간대를 드래그해 작업 시간을 잡고, Create 전엔 임시 draft로 두다가, 오른쪽 패널에서 task를 생성하는** Week/Day Planner로 만든다.

---

## 0. 확정 결정

| # | 결정 | 근거 |
|---|---|---|
| V1 | **오른쪽 = 단일 contextual 패널로 통합.** Unscheduled backlog + 전역 TaskDetail을 하나의 `CalendarRightPanel`로 합침(summary / newTaskDraft / taskDetail 모드). | 현재 task 선택 시 5칼럼으로 비좁음. 스펙 §12 의도. |
| V2 | **드래그 = 하이브리드.** 빈 그리드만 pointer 이벤트(drag-to-create), 기존 task/backlog reschedule은 HTML5 DnD 유지. | Phase 1 회귀 위험 최소(스펙 §3.1.12). |
| V3 | **스냅 30분, visual row는 1시간 유지**(`SLOT_HEIGHT=44`/hr). | 스냅은 분 단위 계산이라 행 높이와 무관. CSS 변경 최소화. |
| V4 | **포인터 시간 = 드롭/이동 시점 `getBoundingClientRect()` 재측정.** 별도 scrollTop 변수 안 씀. | rect.top이 스크롤을 이미 반영. 스펙 §11A.8 문제를 더 견고하게 해결. |
| V5 | **QuickCreatePopover는 Month 전용으로 축소.** Day/Week 클릭·드래그 → draft + 패널 form. | 스펙 §14. |
| V6 | **draft 시간정보와 form 입력상태 분리.** `draft{date,start,end}`=CalendarView, `form{title,projectId,dueDate,error}`=패널 컴포넌트. | Cancel/Create 초기화 단순화(스펙 §7). |
| V7 | **선택 개선 3종 포함**: 빈 그리드 드래그 힌트, Unscheduled 문구 개선, 현재시각 라벨. (Deadline D-day는 후속 Phase 3.) | 사용자 선택. |

**반드시 유지(불변) — 스펙 §2:**
`scheduledDate`=작업 예정일, `startTime`/`endTime`=그 날의 작업 시간대, `dueDate`=마감(드래그로 변경 금지, deadline marker `draggable=false`).

---

## 1. 오른쪽 패널 통합 (V1) — 이번 작업의 구조적 핵심

### 1.1 현재 문제
task 선택 시 데스크톱 레이아웃이:
```
[앱 사이드바][캘린더 사이드바][주간 그리드][Unscheduled backlog][전역 TaskDetail]  ← 5칼럼
```

### 1.2 목표 구조
```
[앱 사이드바][캘린더 사이드바][주간 그리드][CalendarRightPanel]  ← 4칼럼
```
`CalendarRightPanel`이 상태에 따라 내용만 바뀐다(위치·너비 320–380px 고정):

| 조건 | 패널 모드 | 내용 |
|---|---|---|
| draft 있음 | `newTaskDraft` | New Task form |
| draft 없음 · task 선택됨 | `taskDetail` | 전달받은 TaskDetail 노드 |
| 둘 다 없음 | `summary` | Today 카운트 + compact Unscheduled |

### 1.3 구현 방식 (prop drilling 회피)
`ProjectsPage`가 이미 쓰는 패턴을 재사용: App이 `renderTaskDetail()` **ReactNode를 prop으로** 넘긴다.
- `App.tsx`: calendar 페이지를 `pageGridClass` 분할에서 빼고 `<CalendarView ... taskDetail={renderTaskDetail()} selectedTaskId={...} />` 전체폭으로 렌더.
- `CalendarView`: `taskDetail` 노드를 패널의 taskDetail 모드에 그대로 꽂음. TaskDetail의 10여 개 prop을 다시 뚫을 필요 없음.
- Unscheduled 목록은 별도 aside에서 패널 summary 모드 **안으로 이동**.

---

## 2. Drag-to-create 상호작용 (V2)

### 2.1 상태 모델 (CalendarView 로컬 state)
스펙 §6의 개념 enum을 MVP 최소 상태로 축약:
```ts
selection: null | { date: string; startMin: number; currentMin: number };  // 드래그 중
draft:     null | { date: string; startTime: string; endTime: string };     // 확정된 임시 블록
// viewingTask는 기존 selectedTaskId로 판정. draggingTask는 HTML5 DnD라 별도 state 불필요.
```
동시 금지(스펙 §6.2): `selection`과 HTML5 드래그가 겹치지 않게 — task 위에선 selection을 시작하지 않음(§2.3).

### 2.2 pointer 파이프라인 (WeekView, Day 포함)
- `onPointerDown`: `shouldStartTimeSelection(e)` 통과 시에만 → `setPointerCapture(pointerId)`, `selection` 시작. time gutter/헤더/all-day/interactive 요소는 제외.
- `onPointerMove`: `currentMin` 갱신 → selection block 실시간 렌더.
- `onPointerUp`: 스냅/clamp 후 `draft` 확정, `releasePointerCapture`. 이동거리 ≤4px면 클릭으로 간주(기본 1시간).
- `onPointerCancel`: selection 제거, draft 생성 안 함, release.

### 2.3 충돌 방지 (스펙 §10)
```ts
function shouldStartTimeSelection(e: React.PointerEvent) {
  const el = e.target as HTMLElement;
  if (el.closest('[data-calendar-interactive="true"]')) return false;
  if (el.closest('button, input, textarea, select, a')) return false;
  return true;
}
```
`data-calendar-interactive="true"` 부착 대상: **timed task block, all-day task 칩, deadline/study-review/project 마커, QuickCreatePopover, CalendarRightPanel wrapper**. (WeekView 안 인라인 렌더라 컴포넌트 분리 없이 속성만 추가.)

### 2.4 시간 계산 (V4)
```
const rect = timeColEl.getBoundingClientRect();   // 드롭/이동 시점 재측정 → 스크롤 반영됨
const y = e.clientY - rect.top;
let minutes = DAY_START*60 + (y / SLOT_HEIGHT) * 60;
```
- `DAY_START=6`, `DAY_END=23`, `SLOT_HEIGHT=44`(1시간).
- gutter(56px)는 날짜 column이 아니므로 시작 대상에서 제외(§11A.4).

### 2.5 스냅/clamp 규칙 (스펙 §9.3~9.5)
- `startMin` = 30분 내림, `endMin` = 30분 올림, 최소 30분.
- 클릭(≤4px) = 기본 1시간.
- clamp: start ≥ 06:00, end ≤ 23:00. 클릭 1시간이 23:00 초과면 end=23:00. clamp 후 30분 미만이면 draft 생성 안 함(예: 22:30 클릭 → 22:30–23:00 OK, 23:00 근처는 생성 안 함).
- Week view: `draft.date` = **pointerdown이 시작된 column의 날짜**. 드래그가 다른 요일로 넘어가도 유지(multi-day 제외, §9.6).

### 2.6 Draft 저장 규칙 (스펙 §8) — 절대 규칙
- draft는 **React state에만** 존재. localStorage/task list/project data에 절대 안 들어감.
- **Create 클릭 순간에만** `createTask` 호출.
- Cancel/Esc/바깥클릭은 draft state만 null. 실제 데이터 불변(Create 후 삭제하는 방식 금지).

---

## 3. New Task form (스펙 §13)

패널 `newTaskDraft` 모드. `form` state = `{ title, projectId?, dueDate?, error? }`.
- 필수: title + (draft의) scheduledDate/startTime/endTime.
- 선택: projectId, dueDate.
- draft 생성 직후 title input 자동 focus. Enter=Create(title 있으면), Esc=취소.
- **Create 동작**: title trim → 비면 error → `createTask({ title, scheduledDate:draft.date, startTime:draft.startTime, endTime:draft.endTime, dueDate:dueDate||undefined, projectId:projectId||undefined, status:"todo" })` → draft/form 초기화 → 생성 task를 `onSelectTask` → 패널 taskDetail 모드 → toast "Created ...".
- **Cancel**: draft/form null, 패널 summary, 데이터 불변.

### 3.1 draftCreated 상태의 바깥클릭 처리 (스펙 §12.4)
- 패널 내부/폼 input/draft block 클릭 → draft 유지.
- 기존 task·marker 클릭 → draft 제거 후 해당 detail.
- 다른 빈 그리드 pointerdown → 기존 draft 제거 후 새 selection.
- toolbar/sidebar 클릭 → draft 강제 취소 안 함.

---

## 4. Selection / Draft block 시각 (스펙 §11)
- **Selection block**(드래그 중): 반투명 배경, 얇은 border, 시간 범위(`09:00–11:00`) 실시간.
- **Draft block**(확정): 실제 task와 **다르게** — 점선 border, "New task" 라벨 + 시간 범위. 저장 전임이 드러나야 함.
- z-index(스펙 §11A.9): task block < selection < draft < popover/panel.

---

## 5. 선택 개선 3종 (V7)
- **빈 그리드 드래그 힌트**(§18.1): visible range에 item 없고 draft도 없고 드래그 중 아닐 때 그리드 중앙에 "Drag on the calendar to create a task".
- **Unscheduled 문구**(§16): dueDate 있으면 `Due Jul 10 · Not scheduled yet`, 없으면 `No deadline · Not scheduled yet`. 0개면 큰 카드 대신 compact `All clear`.
- **현재시각 라벨**(§19): 기존 빨간 now-line 왼쪽에 `13:36` 텍스트. 오늘 column에서만.

(Deadline D-day/Overdue는 후속 Phase 3.)

---

## 6. 파일 맵 (실제 구조 기준)

| 파일 | 변경 |
|---|---|
| `src/components/CalendarView.tsx` | selection/draft state, pointer 핸들러 오케스트레이션, 오른쪽을 `CalendarRightPanel`로 교체, `taskDetail` prop 수신 |
| `src/components/calendar/WeekView.tsx` | pointer 기반 drag-to-create, selection/draft block 렌더, interactive 요소에 `data-calendar-interactive`, 시간 util 사용 |
| `src/components/calendar/CalendarRightPanel.tsx` | **신규** — summary/newTaskDraft/taskDetail 모드 |
| `src/components/calendar/NewTaskForm.tsx` | **신규** — draft 기반 생성 폼 |
| `src/utils/calendarTime.ts` | **신규** — `timeToMinutes/minutesToTime/snapDownTo30/snapUpTo30/clampRange/minutesFromPointer` |
| `src/components/calendar/MonthView.tsx` | 변경 없음(QuickCreatePopover 유지) |
| `src/components/calendar/QuickCreatePopover.tsx` | Month 전용으로 호출부만 축소(컴포넌트 자체 유지) |
| `src/App.tsx` | calendar 렌더를 전체폭으로, `taskDetail`/`selectedTaskId` prop 전달, backlog aside 제거 |
| `src/styles.css` | `.gcal-selection`, `.gcal-draft`, right-panel, now-label, hint 스타일 |

---

## 7. Phase 1 세부 단계

- **1A — Drag-to-create MVP**: `calendarTime.ts` util + WeekView pointer 파이프라인 + selection/draft block + interactive 가드. (Day=days 1개로 커버.)
- **1B — Right panel 통합 + New Task form**: `CalendarRightPanel`(summary/newTaskDraft/taskDetail) 신설, backlog를 summary로 이동, App 레이아웃 전체폭化 + `taskDetail` prop.
- **1C — 실제 생성**: Create 시에만 `createTask`, 생성 후 taskDetail 모드 + toast.
- **1D — 회귀 보존 확인**: 기존 task click/drag-reschedule(dueDate 불변), marker click, Month QuickCreatePopover.
- **1E — 선택 개선 3종**(V7).

---

## 8. 이번 Phase 제외 (스펙 §3.3 / §20)
draft resize, 기존 task resize, drag-reschedule Undo toast, Month +N more agenda popover, overlap collision column layout, study review quick actions, project deadline progress, 모바일 touch drag, Ollama visible-range context, week-start 변경, layer/filter localStorage 영속화.

---

## 9. Acceptance / 테스트 (스펙 §24~25)

### 필수
- typecheck 통과, build 성공.
- Day 09:00–11:00 드래그 → draft 09:00–11:00.
- Week 수요일 14:00–16:00 드래그 → 해당 날짜 draft.
- 클릭만 → 1시간, 아주 짧게 → 30분 보정, 22:30 클릭 → 22:30–23:00.
- 06:00 이전/23:00 이후 clamp.
- **그리드 스크롤 후 14:00–16:00 드래그해도 정확히 저장**(V4 검증 포인트).
- 기존 task/deadline/review/project 마커 위에서 draft 생성 안 됨.
- Create 전 localStorage/task list 불변 → Create 후 scheduledDate/startTime/endTime 정확.
- Create 후 패널 taskDetail 전환, Esc/Cancel 취소 정상.
- 기존 task drag-reschedule 정상 + dueDate 불변, marker click 유지, Month QuickCreatePopover 유지.

### 회귀
Today/Inbox/Board/Study 페이지 및 기존 캘린더 레이어 토글·프로젝트 필터·크로스페이지 링크(§CALENDAR_DESIGN Phase 4)가 그대로인지.

---

## 10. 위험 및 완화
- **HTML5 DnD ↔ pointer 공존**: `shouldStartTimeSelection` 가드 + interactive 마킹으로 분리. task 내부 pointer가 그리드로 전파돼 draft가 생기지 않게 필요 시 `stopPropagation`(단 기존 click/reschedule 깨지지 않게).
- **레이아웃 전환**(V1)이 App.tsx의 calendar 렌더 구조를 바꾸므로, Today/Projects 등 다른 페이지의 `pageGridClass` 사용에는 영향 없도록 calendar 분기만 수정.
- **pointer capture 누수**: pointerup/cancel에서 반드시 release, selection 잔상 방지.
