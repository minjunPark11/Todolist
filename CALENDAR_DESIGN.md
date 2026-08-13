# Calendar 세부 설계 (Google Calendar 스타일 Week Planner)

> **상태: 설계 확정 (구현 착수 대기).** 미해결 결정 없음. 착수 전 유일한 선행 작업은 §11의 데이터 집계 게이트.

원본 요구사항: `calendar_google_like_updated_flow_spec.md`
이 문서는 위 스펙을 **실제 코드베이스(`codex/new_design`)에 맞게 검증·정정한 확정 설계**다.
목표: 숨겨진 `CalendarView`를 정식 노출된 Week View 중심 Planning Calendar로 승격하고, Task/Deadline/Study Review/Project Deadline을 통합 표시한다.

관련 파일:
- `src/components/CalendarView.tsx` — 현재 단일 파일 구현 (분해 대상)
- `src/App.tsx` — `activePage === "calendar"` 렌더 (L804), `<OllamaChat/>` 마운트 (L1017)
- `src/components/Sidebar.tsx` — primaryNav (Calendar 미노출)
- `src/types.ts` — `Task`/`Project`/`ConceptNote`, `PageId`(calendar 이미 존재)
- `src/utils/date.ts` — `getWeekStart`(일요일 시작), `getWeekDays`, `getMonthGrid` 등
- `src/hooks/usePlannerData.ts` — `createTask`(L680), `addTask`(L656), `updateTask`(L721), `normalizeTask`
- `src/components/TaskDetail.tsx` — 우측 상세 패널 (동기화 필요)
- `src/lib/ollama.ts`, `src/components/OllamaChat.tsx` — AI 채팅

---

## 0. 확정된 핵심 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | **`startTime`/`endTime`은 `scheduledDate`의 시간대로 재정의.** 신규 필드 없음. | Today "Scheduled Today" 개념과 일치. 현재 CalendarView가 dueDate에 시간을 붙이는 건 버그성 불일치. |
| D2 | `dueDate`는 항상 all-day 마감 마커. 드래그로 이동하지 않음. | 마감=고정 약속. 스펙 Flow E. |
| D3 | 주간 뷰 시작 요일 = **일요일**. 기존 `getWeekStart` 그대로 사용. | 유틸 변경 최소화. |
| D4 | 기본 뷰 = **Week** (현재는 month). | 스펙 §2.2 / §7. |
| D5 | MVP 레이어 = Tasks / Deadlines / Study Reviews / Project Deadlines. **Event·Routine은 제외.** | 코드에 Event 엔티티 없음. Routine(반복 인스턴스)은 후속. |
| D6 | Detail Drawer 신규 제작 안 함 → 기존 `selectTask` → `TaskDetail` 재사용. | 중복 방지. 단 TaskDetail 시간 필드 위치 조정 필요(§5). |
| D7 | Ollama context는 MVP에서 "오늘 기준 이번 주"로 생성. 라이브 anchor 반영은 후속. | 상태 리프팅 회피. |
| D8 | 시간 블록 겹침 = **열 분할 안 함**(단순 포갬/보더). | MVP 속도. 겹침 잦으면 후속에 collision layout. |
| D9 | 하루 그리드 = **6AM–11PM 고정**(`DAY_START=6`, `DAY_END=23`). | 스펙 §7.3. 현재 8–20 교체. |
| D10 | Month 뷰 = **칩 목록 유지**(카운트 요약 미채택). | 코드 재사용. Week가 메인. |

> 세부 렌더/인터랙션 규칙(D8~D10 확장, 색상·필터·반복 등)은 §9, 위험·마이그레이션은 §10, 착수 게이트는 §11 참조.

---

## 1. 데이터 모델

### 1.1 기존 타입 유지 (신규 필드 0개)
`Task`(`src/types.ts:20`)의 `dueDate`, `scheduledDate`, `startTime`, `endTime`를 그대로 사용하되 **의미를 확정**:

```
scheduledDate  = 언제 실제로 할 것인가 (작업 예정일)  ← Time Block 기준일
startTime/endTime = scheduledDate 안에서의 시간대       ← Time Block 위치/길이
dueDate        = 언제까지 해야 하는가 (마감)            ← all-day Deadline 마커
```

- 하나의 Task는 `scheduledDate`와 `dueDate`를 동시에 가질 수 있고, 그 경우 캘린더에 **2개 아이템**(작업 블록 + 마감 마커)으로 표시된다. (스펙 §3.3)
- `estimatedMinutes`는 만들지 않는다. duration = endTime − startTime으로 파생.

### 1.2 normalize 마이그레이션 (데이터 보존)
기존에 CalendarView로 `dueDate + startTime`을 찍어둔 task가 새 모델에서 사라지지 않도록 `normalizeTask`에 규칙 추가:

```
if (task.startTime && !task.scheduledDate && task.dueDate) {
  task.scheduledDate = task.dueDate;   // 시간 있는 항목은 작업 블록으로 승격
}
```

> ⚠ 상세 위험 분석·엣지케이스·검증 절차는 **§10**에 별도 정리. 이 규칙은 §10 없이 단독 적용 금지.

### 1.3 CalendarItem 파생 모델
CalendarView와 Ollama context가 **공유**하는 중간 표현. 소스별 렌더 분기를 없애 로직을 단순화.

```ts
type CalendarLayer = "task" | "deadline" | "study-review" | "project-deadline";

interface CalendarItem {
  key: string;            // "task-block:<id>" | "deadline:<id>" | "review:<id>" | "proj:<id>"
  layer: CalendarLayer;
  sourceType: "task" | "project" | "note";
  sourceId: string;
  title: string;
  date: string;           // 렌더 기준일 YYYY-MM-DD
  startTime?: string;     // task 블록만; 없으면 all-day
  endTime?: string;
  allDay: boolean;
  color: string;          // project.color 우선, 없으면 레이어 기본색
  priority?: TaskPriority;
  status?: TaskStatus;
  draggable: boolean;     // task 블록만 true
}
```

### 1.4 파생 규칙 `buildCalendarItems(planner, opts)`
| Source | 조건 | layer | 배치 | draggable |
|---|---|---|---|---|
| Task → 작업 블록 | `scheduledDate` 있음 · status ∉ {done, archived}\* · projectFilter 통과 | `task` | `scheduledDate` (startTime 있으면 timed, 없으면 all-day) | ✅ |
| Task → 마감 마커 | `dueDate` 있음 · projectFilter 통과 | `deadline` | `dueDate` all-day | ❌ |
| Project → 마감 | `dueDate` 있음 · status ∈ {active, paused} | `project-deadline` | `dueDate` all-day 다이아몬드 | ❌ |
| ConceptNote → 복습 | `nextReviewDate` 있음 · reviewStatus ≠ mastered · `!deletedAt` | `study-review` | `nextReviewDate` all-day | ❌ |

\* **status 주의**: canonical status는 `inbox / todo / doing / waiting / done / archived` 6개(+레거시 `in_progress`,`blocked`).
"작업 블록 표시 대상"은 done·archived만 제외 → **inbox·waiting·doing도 포함**해야 누락이 없다.
`Completed` 레이어 ON일 때만 done 블록을 추가로 표시.

레이어 토글은 이 함수 뒤에 `items.filter(i => layers[i.layer])`로 적용.

---

## 2. 컴포넌트 아키텍처

현재 단일 `CalendarView.tsx`(352줄)를 다음으로 분해:

```
CalendarView/                컨테이너: 상태 + buildCalendarItems + 레이아웃
├─ CalendarToolbar          view switcher(Day/Week/Month), Today, ‹ ›, range label,
│                           search·settings placeholder, sidebar toggle
├─ CalendarSidebar          Create 버튼, MiniMonth, LayerToggles, ProjectFilters
├─ WeekView                 기존 renderTimeGrid 확장 (7열 + all-day row + 시간 grid + 현재시각 라인)
├─ DayView                  WeekView의 1열 모드 (days=[anchor])
├─ MonthView                기존 renderCell 그리드 + 날짜별 count 요약
└─ QuickCreatePopover       빈 슬롯 클릭 생성 (Phase 3)
```

- Detail Drawer는 신규 제작하지 않고 App의 `planner.selectTask(id)` → 우측 `TaskDetail` 재사용.
- `renderTimeGrid`, `renderCell`은 기존 로직을 최대한 재활용하되 데이터 소스를 `CalendarItem[]`로 교체.

---

## 3. CalendarView 내부 상태

```ts
mode: "week"                    // 기본값 변경 (month → week)
anchor: todayValue()
layers: {
  task: true, deadline: true, studyReview: true, projectDeadline: true,
  completed: false             // 기본 off
}
projectFilter: "all" | Set<string>
sidebarCollapsed: false
dragOver: string               // 기존 유지
quickCreate: null | { date, startTime?, endTime?, allDay }
```

- `layers`, `projectFilter`, `sidebarCollapsed`는 세션 유지가 바람직하나 MVP는 컴포넌트 로컬 state로 시작. (후속: appSettings 확장)
- 주 시작 = 일요일 (`getWeekDays`/`getWeekStart` 그대로).

---

## 4. 인터랙션 상세

### 4.1 빈 슬롯 클릭 → Quick Create (`createTask` 재사용)
- **Week/Day 시간칸 클릭**: 기존 `dropTime`의 hour 계산 재사용.
  기본값 `{ date, startTime: "HH:00", endTime: "HH+1:00", allDay:false }`
  저장 → `createTask({ title, status:"todo", scheduledDate:date, startTime, endTime, projectId? })`
  (`createTask` 기본 status가 `inbox`이므로 `todo`로 override)
- **Month 셀 / All-day row 클릭**: `{ date, allDay:true }`, type 선택
  - Task → `{ scheduledDate: date }`
  - Deadline → `{ dueDate: date }`
- Popover: Enter 저장 / Esc 취소 / 저장 후 즉시 블록 표시.

### 4.2 Drag & Drop 리스케줄 (기존 핸들러 **교체** — dueDate→scheduledDate)
현재 `dropDate`/`dropTime`/`dropAllDay`는 `dueDate`를 바꾼다. 전부 `scheduledDate` 기준으로 교체:

| 드롭 대상 | updateTask patch |
|---|---|
| 시간칸 | `{ scheduledDate: day, startTime, endTime }` |
| all-day 칸 | `{ scheduledDate: day, startTime:"", endTime:"" }` |
| month 셀 | `{ scheduledDate: day }` |
| Unscheduled 백로그 | `{ scheduledDate:"", startTime:"", endTime:"" }` |

- **deadline / project-deadline / study-review 마커는 draggable=false** (마감은 DnD로 이동 불가, 스펙 Flow E 규칙).
- Unscheduled 백로그 필터: 현재 `!task.dueDate` → **`!task.scheduledDate && status ∉ {done,archived}`** 로 변경.
- 변경 후 작은 toast(후속 단계에서 추가 가능).

### 4.3 아이템 클릭
- task 블록 / 마감 마커 → `onSelectTask(task.id)` (기존 흐름 유지, TaskDetail 열림)
- study-review → ConceptNote 상세 열기 (Phase 4)
- project-deadline → 해당 프로젝트로 이동 (Phase 4)

---

## 5. TaskDetail 동기화 (필수)

D1로 시간의 의미가 바뀌므로 `TaskDetail`도 함께 수정하지 않으면 두 화면이 어긋난다.
현재 Schedule 섹션은 `Due date + Start/End time`을 한 그룹으로 보여준다(제품스펙 §15.2).

변경:
- `scheduledDate` 편집 필드 **추가**
- `startTime`/`endTime`을 **scheduledDate 하위로 재배치** (마감이 아니라 작업 시간대임을 시각적으로 명확화)
- `dueDate`는 별도(마감)로 유지

---

## 6. Ollama Calendar Context

문제: `OllamaChat`은 App 루트(`App.tsx:1017`)에 있고 캘린더 뷰 상태는 CalendarView 내부. 라이브 anchor를 끌어올리는 건 MVP에 과함.

설계(D7):
- `buildCalendarContext(planner)` 유틸 신설 — §1.4 `buildCalendarItems` 재사용, range = **오늘 기준 이번 주**.
- `<OllamaChat activePage={activePage} planner={planner} />` prop 전달.
- `askOllamaChat(messages, context?)`에 optional context 인자 추가 → system 메시지 1개 추가 형태(ollama.ts 최소 변경).
- `activePage === "calendar"`일 때만 context 주입.
- **AI는 제안만, 자동 변경 없음** (스펙 §14.4: AI proposes → User approves → App applies).

Context 예시(JSON): view, range, scheduledTasks, deadlines, studyReviews, projectDeadlines, unscheduledTasks, workloadSummary(요일별 블록 수/시간 합).

---

## 7. Phase 계획 (리뷰 가능한 단위로 분할)

원본 스펙 §17은 Phase 1~6을 한 요청에 담고 있어 diff가 비대해짐. 분할안:

- **Phase 1 — 노출 + 레이아웃**
  Sidebar primaryNav에 Calendar 추가(+아이콘), active 표시, 기본 Week 뷰, Toolbar/좌측 Sidebar 골격, MiniMonth.
  수용: Calendar 클릭 가능 / Week 기본 / Toolbar·Sidebar·월~일 grid 표시.
- **Phase 2 — 데이터 연결 + 시간 의미 확정** ⚠ 가장 중요·위험
  `buildCalendarItems` + CalendarItem 렌더 + 레이어 토글 + **D1 시간 재정의 + normalize 마이그레이션(§1.2) + TaskDetail 동기화(§5)**.
  수용: scheduledDate=블록 / dueDate=마감마커 / project·review 마커 / 레이어 on·off.
- **Phase 3 — 생성 + 드래그**
  Quick Create popover + 드롭 핸들러 scheduledDate 교체(§4.2) + Unscheduled 백로그 기준 변경.
  수용: 빈 슬롯 클릭 생성 / 블록 드래그 이동 / dueDate는 드래그로 안 바뀜.
- **Phase 4 — Today·Study 연결**
  Today 카드 "View in Calendar" / Drawer "Move to Today" / review 블록→Note.
- **Phase 5 — Ollama context** (§6).

## 8. 이번 단계 제외 (스펙 §16)
Google Calendar 연동, 외부 API/알림, 고급 반복 엔진, AI 자동 일정 변경, 팀 공유. Event 엔티티, Resize duration도 MVP 제외(후속).

---

## 9. 렌더링·인터랙션 세부 규칙 (2차 확정)

### 9.1 시간 블록 겹침 (D8)
- **MVP: 열 분할 안 함.** 겹치는 블록은 그대로 포갠 뒤 약간의 좌측 오프셋/보더로 구분(z-index).
- Google 스타일 열 분할(collision layout)은 겹침이 실사용에서 잦으면 후속으로 도입.

### 9.2 하루 시간 그리드 범위 (D9)
- **6AM–11PM 고정** (`DAY_START = 6`, `DAY_END = 23`). 현재 코드의 8–20을 교체.
- `dropTime`/Quick Create hour 계산의 clamp도 `[6, 22]`로 조정(마지막 시작 슬롯 22시 → 23시 종료).
- 범위 밖 시간(예: 새벽 2시)은 상/하단으로 clamp되어 경계 슬롯에 표시.

### 9.3 Month 뷰 (D10)
- **현재 칩 목록 유지.** 날짜당 task 칩 최대 3개 + `+N more`. 카운트 요약(스펙 §8.1)은 채택하지 않음.
- Month 셀에도 CalendarItem을 쓰되, all-day/timed 구분 없이 칩으로 나열. deadline/review/project 마커는 작은 아이콘 칩으로.

### 9.4 scheduledDate 있음 + startTime 없음
- **all-day row에 task 칩**으로 표시 (backlog로 보내지 않음). 마감 마커와 다른 스타일(작업 톤).

### 9.5 레이어별 색상 규칙 (color 단일 필드 보강)
- `task` 블록: `project.color` 배경/좌측 보더 (프로젝트 없으면 중립 회색)
- `deadline`: warning 톤(주황) 마커 + `Deadline` 뱃지
- `study-review`: soft accent 배경 + ↻ 아이콘 + `Review` 라벨
- `project-deadline`: 다이아몬드(◆) 마커 + project 라벨
- → CalendarItem.color는 task 블록 accent 용도로만, 나머지 레이어는 CSS 톤이 결정.

### 9.6 projectFilter 규칙
- projectId가 **빈 task는 필터와 무관하게 항상 표시**.
- 필터는 projectId가 있는데 미선택인 것만 숨김.
- `study-review`는 프로젝트 없으므로 항상 표시. `project-deadline`은 자기 project id로 필터.

### 9.7 반복(repeat) task
- **MVP: 자기 scheduledDate에 1회만 표시.** 주/월 전체로 전개(projection) 안 함.
- `repeatType !== "none"`이면 반복 아이콘 뱃지만 부착.

### 9.8 완료 task
- `Completed` 레이어 ON일 때만 done 블록 표시. 스타일: 흐림 + 취소선.

### 9.9 현재 시각 라인
- 렌더 시 1회 계산(틱 없음). 오늘이 현재 range에 포함될 때, 오늘 열에만 red dot + 가로선.
- 위치: `(nowMinutes - DAY_START*60) / 60 * SLOT_HEIGHT`.

### 9.10 Sidebar 노출 (Phase 1 상세)
- `Sidebar.tsx`의 `IconName` union + `paths`에 `"calendar"` 추가 (today 아이콘과 구분되는 캘린더 아이콘).
- primaryNav 순서: **Today 다음**에 Calendar. count 뱃지 없음(0).

### 9.11 Study review 클릭 → Note 열기 (Phase 4 주의)
- StudyPage는 `studyTab`/NoteDetail 상태를 **내부 보유**. Note엔 `selectTask` 같은 전역 선택 훅이 없음.
- 캘린더에서 Note를 열려면 "Study 페이지로 이동 + 해당 note 선택" **크로스 페이지 배선**이 별도 필요.
- Phase 4에서 독립 작업으로 분리. (Phase 1~3에서는 review 블록 클릭이 no-op 또는 Study 탭 이동까지만.)

---

## 10. Phase 2 위험 정밀 분석 및 안전 절차 ⚠

Phase 2는 이 프로젝트에서 유일하게 **기존 사용자 데이터를 되돌리기 어렵게 바꿀 수 있는** 단계다.
D1(시간 재정의) + normalize 마이그레이션 + TaskDetail 동기화가 한 덩어리로 묶여 있어, 하나만 빠지면 화면이 깨지거나 항목이 사라진 것처럼 보인다.

### 10.1 왜 결합되어 있나 (셋을 함께 배포해야 하는 이유)
1. **D1** 이후 캘린더 렌더는 `startTime`을 `scheduledDate` 기준으로 그린다.
2. 그런데 기존 데이터의 시간 있는 task는 `dueDate + startTime`(scheduledDate 빈) 형태 — 옛 CalendarView `dropTime`이 그렇게 저장했음.
3. **마이그레이션 없이 D1만** 배포하면: 그 task들은 scheduledDate가 비어 있어 **시간 블록으로 안 그려지고**, backlog(§4.2 변경 후 `!scheduledDate`)로 쓸려간다 → "일정이 사라졌다"는 착시.
4. **TaskDetail 동기화 없이** 배포하면: 시간 필드가 여전히 Due date 밑에 있어, scheduledDate로 옮겨진 시간을 "마감 시간"으로 오해. 또는 scheduledDate 필드가 비어 보여 데이터가 날아간 것처럼 보임.
→ **세 변경은 하나의 커밋/PR로 원자적 배포.**

### 10.2 마이그레이션 규칙 정밀화
`normalizeTask`(`usePlannerData.ts:97`)는 **매 로드 + 매 addTask마다** 실행된다(1회성 아님, 상시). 따라서 규칙은 **멱등**이어야 한다.

```
// normalizeTask 내부, scheduledDate/startTime 확정 후
if (task.startTime && !task.scheduledDate && task.dueDate) {
  scheduledDate = task.dueDate;
}
```
- **멱등성**: 1회 적용 후 scheduledDate가 채워지므로 `!scheduledDate` 가드에 걸려 재적용 안 됨. ✅
- **신규 데이터 안전**: 새 모델에서 startTime은 항상 scheduledDate와 함께 세팅되고(§4.1), unschedule 시 startTime도 함께 clear(§4.2)되므로, 새 데이터는 이 조건에 걸리지 않음. ✅
- **데이터 손실 없음**: 규칙은 scheduledDate를 *채우기*만 함(additive). 어떤 필드도 지우지 않음. ✅

### 10.3 되돌리기 어려운 엣지케이스: "두 날짜 + 시간"
`scheduledDate=A`, `dueDate=B(≠A)`, `startTime` 세팅된 task가 실재할 수 있다
(예: Inbox에서 scheduledDate 지정 → 옛 캘린더에서 드래그해 dueDate+time 부착).

- 옛 CalendarView: 블록을 **B(마감일)** 에 그림.
- 새 모델: 블록을 **A(작업일)** 에 그림.
- 마이그레이션 규칙은 `!scheduledDate` 가드로 이 task를 **건드리지 않음** → scheduledDate 값은 그대로.
- 하지만 렌더 기준이 B→A로 바뀌므로 **블록이 표시 날짜를 건너뛴다.**

판단: 단일 시간쌍 구조에서 불가피. A(실제 작업일)에 그리는 게 새 모델의 의도된 의미이므로 **정상 동작으로 간주**하되, 릴리스 노트/문서에 "시간 있는 일부 항목의 표시 날짜가 1회 이동할 수 있음"으로 명시.

### 10.4 TaskDetail 동기화 (정확한 변경 위치)
현재 `TaskDetail.tsx:88~113`의 Schedule 섹션은 `Due date → Start time → End time` 순.

변경:
- `scheduledDate` 편집 `<input type="date">` **신규 추가** (Due date와 별도 라벨: "Scheduled").
- `Start time`/`End time`을 **scheduledDate 라벨 아래로 재배치** (시각적으로 "작업 시간대"임을 표현).
- `Due date`는 마감으로 단독 유지.
- 결과 순서 예: `Scheduled date → Start time → End time → Due date → Repeat …`

### 10.5 Backlog 필터 변경의 파급 (§4.2)
`unscheduled` 필터를 `!task.dueDate` → `!task.scheduledDate && status ∉ {done,archived}`로 바꾸면:
- **마감만 있고 작업일 미정**인 task(dueDate 있음, scheduledDate 빈)가 이제 backlog에 **새로 등장**한다.
- 의미상 맞음("언제 할지 안 정함")이나, 마감 많은 사용자는 backlog가 붐빌 수 있음.
- MVP: 그대로 두되, backlog 아이템에 "마감 D-n" 힌트를 함께 표기하는 건 후속 옵션.

### 10.6 배포 전 검증 절차 (필수 순서)
1. **실데이터 백업**: Settings → Export JSON (`todo-planner-backup-*.json`). 롤백 원본.
2. **현황 파악**: export한 JSON에서 `startTime !== ""`인 task 수, 그중 `scheduledDate === ""`인 수, "두 날짜+시간"(§10.3) 수를 센다. 0이면 마이그레이션 영향 없음 → 위험 대폭 감소.
3. **격리 테스트**: 백업 JSON을 새 브랜치 빌드에 Import → Calendar/Today/TaskDetail에서 시간 있는 항목이 기대 위치에 뜨는지 확인.
4. **멱등 확인**: 앱을 두 번 새로고침해도 scheduledDate가 중복 변형 없이 안정적인지 확인.
5. **회귀 확인**: Today "Scheduled Today" 버킷, Inbox, Board가 그대로인지(시간 재정의가 다른 화면 안 깨는지).

### 10.7 롤백 전략
- 마이그레이션은 additive라 데이터 파괴는 없지만, scheduledDate가 채워진 상태는 남는다.
- 문제가 생기면: 코드 롤백 + Settings → Import로 §10.6-1의 백업 JSON 복원 → 원상 복구.
- 그래서 **§10.6-1 백업을 반드시 먼저** 수행한다.

### 10.8 Phase 2 착수 게이트 (체크리스트)
- [ ] 실데이터 export 백업 완료
- [ ] `startTime` 보유 task 수 / `scheduledDate` 빈 것 수 집계 완료
- [ ] 마이그레이션 + D1 렌더 + TaskDetail 변경이 **하나의 PR**로 묶임
- [ ] 격리 빌드에서 시간 있는 항목 위치 검증
- [ ] Today/Inbox/Board 회귀 없음 확인

---

## 11. 실행 시작점: 데이터 집계 게이트 (구현 전 유일한 선행 작업)

설계에는 미해결 결정이 없다. 구현 착수 전 **딱 한 가지**만 확인하면 되고, 그 결과가 Phase 2의 난이도를 결정한다:
**"실제 데이터에 시간(`startTime`) 붙은 task가 있는가?"**

### 11.1 왜 이게 게이트인가
- **집계 결과가 0이면**: §1.2 마이그레이션과 §10.3 "두 날짜+시간" 엣지케이스가 **실제로는 무영향** → Phase 2에서 데이터 위험이 사라지고, D1 렌더 + TaskDetail 변경만 남아 가벼워진다.
- **1개 이상이면**: §10 절차(백업→격리 테스트→멱등 확인)를 정식으로 수행한다.

### 11.2 집계 방법 (택1)
**A. 브라우저 콘솔** (dev 서버 실행 중, 앱 열린 상태):
```js
const d = JSON.parse(localStorage["focusflow.appData.v1"]).tasks;
console.table({
  withTime:        d.filter(t => t.startTime).length,
  withTimeNoSched: d.filter(t => t.startTime && !t.scheduledDate).length,  // §1.2 마이그레이션 대상
  bothDatesTime:   d.filter(t => t.startTime && t.scheduledDate && t.dueDate && t.scheduledDate !== t.dueDate).length, // §10.3 표시 이동 대상
});
```
- 레거시 키를 쓰는 경우 `focusflow.appData.v1` → `todo-planner-data`로도 확인.

**B. Export JSON**: Settings → Export JSON 받은 뒤 위 세 필터를 파일에 적용(또는 파일을 공유하면 대신 집계).

### 11.3 판정 → 다음 액션
| 집계 결과 | Phase 2 처리 |
|---|---|
| `withTime === 0` | 마이그레이션은 방어적으로 넣되(신규 데이터 대비), 실데이터 검증 부담 없음. 바로 진행. |
| `withTimeNoSched > 0` | §1.2 마이그레이션이 실제로 동작. §10.6 격리 테스트 필수. |
| `bothDatesTime > 0` | §10.3 "표시 날짜 1회 이동" 발생. 릴리스 노트 명시 + 해당 task 눈으로 확인. |

### 11.4 문서 완료 상태
- 미해결 설계 결정: **없음** (D1~D10 확정).
- 의도적 후속(스코프 밖): 열 분할 겹침(D8), Resize, Event/Routine, Ollama 라이브 anchor, 레이어 상태 영속화, Month 카운트 요약.
- 구현 순서: §7 Phase 1 → 2 → 3 → 4 → 5. Phase 2 착수 전 §11.2 집계 1회.

> 이 문서는 구현 착수 가능(implementation-ready). 다음 행동은 §11.2 집계 또는 §7 Phase 1 착수.

---

## 11. 최종 요약 및 착수 순서

### 11.1 착수 순서 (이 순서대로 진행)
0. **데이터 집계 게이트 (선행, §10.6-2)** — 코드 착수 전 딱 한 번.
   앱 실행 후 브라우저 콘솔에서:
   ```js
   const d = JSON.parse(localStorage['focusflow.appData.v1']);
   const timed = d.tasks.filter(t => t.startTime);
   console.log('시간 있는 task:', timed.length);
   console.log('그중 scheduledDate 빈 것:', timed.filter(t => !t.scheduledDate).length);
   console.log('두 날짜+시간(§10.3):', timed.filter(t => t.scheduledDate && t.dueDate && t.scheduledDate !== t.dueDate).length);
   ```
   - **셋 다 0이면**: 마이그레이션·§10.3 리스크 사실상 소멸 → Phase 2가 대폭 가벼워짐. 그래도 마이그레이션 코드는 방어적으로 넣어둔다(멱등·additive라 무해).
   - **0이 아니면**: §10.6 격리 테스트를 반드시 수행.
1. **Phase 1** — Sidebar 노출 + Week 기본 뷰 + Toolbar/좌측 Sidebar 골격 (§7, §9.10). 데이터 로직 무변경, 저위험.
2. **Phase 2** — CalendarItem 파생 + 레이어 토글 + **D1/마이그레이션/TaskDetail 원자 배포** (§1, §5, §10). ⚠ 유일한 고위험, §10.8 게이트 통과 후.
3. **Phase 3** — Quick Create + 드래그 scheduledDate 교체 + backlog 기준 변경 (§4).
4. **Phase 4** — Today↔Calendar, Study review 크로스페이지 (§9.11).
5. **Phase 5** — Ollama calendar context (§6).

### 11.2 확정 결정 요약 (D1~D10)
D1 시간=scheduledDate 귀속 · D2 dueDate=고정 마감 · D3 일요일 시작 · D4 기본 Week · D5 Event/Routine 제외 ·
D6 TaskDetail 재사용 · D7 Ollama=이번 주 고정 · D8 겹침=단순 포갬 · D9 6AM–11PM · D10 Month=칩 유지.

### 11.3 남은 것은 "미결"이 아니라 "후속 개선"
- 레이어/필터 상태 세션 유지(appSettings 확장) — MVP는 로컬 state
- Ollama 라이브 anchor 반영 — MVP는 이번 주 고정
- 겹침 열 분할 · Resize duration · Routine 전개 · Event 엔티티 — 후속
- backlog 마감 힌트(D-n) — 후속

이 문서로 구현 착수 가능. 추가 설계 결정 필요 없음.
