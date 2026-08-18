# Schedule Editor — Phase 0 현행 감사 및 설계 대조

설계서 `TICKTICK_STYLE_SCHEDULE_EDITOR_DESIGN(20260818-120201).md` §22.10~§22.15가 요구하는 Phase 0 산출물이다. 설계서가 이름 붙인 `CURRENT_SCHEDULE_INVENTORY.md`가 이 문서다.

> 설계와 실제 코드베이스의 mismatch 발견 — §22.15

여기 적힌 "현재"는 전부 v0.11.0 (`f7ab043`) 코드에서 직접 확인한 값이다. 추정은 `추정`으로 표시했다.

이 문서의 결론부터:

1. **설계서 §20(DB Migration, 약 2,600줄)은 이 리포에 적용되지 않으며 삭제 가능하다.** Task가 jsonb 한 덩어리로 저장되어 스키마 자체가 없다 (§2).
2. **설계서가 예상하지 못한 `scheduledDate` 필드 하나가 §1(도메인 모델)의 전제를 정면으로 무너뜨린다** (§5 D1).
3. 2번은 **C — `scheduledDate` 제거, 설계서 모델로 통일**로 확정했다 (§6 결정 1). 목표가 "TickTick처럼"이고, TickTick의 단순함은 편집기가 아니라 **날짜 개념이 하나인 모델**에서 나오기 때문이다.

C는 이 프로젝트에서 가장 비싼 선택이며 되돌릴 수 없는 데이터 변경을 포함한다. §7의 expand → migrate → contract 순서와 §10의 위험 완화가 그 대가를 관리하는 방법이다.

---

# 1. 현재 Task의 Schedule 관련 필드

`src/types.ts:28`의 `Task`에서 일정에 관여하는 필드는 아홉 개다. 전부 `""`(빈 문자열)를 미설정 sentinel로 쓴다 — `null`이나 `undefined`가 아니다.

| 필드 | 타입 | 의미 (코드 기준) | 설계서 대응 |
|---|---|---|---|
| `dueDate` | `YYYY-MM-DD \| ""` | 마감일. 캘린더에서 **all-day, 드래그 불가 마감 마커** | `dueDate` (단, 의미 다름 — §5 D1) |
| `scheduledDate` | `YYYY-MM-DD \| ""` | 실제 작업 예정일. **Today 페이지와 캘린더 시간 블록의 기준** | **대응 없음** ⚠️ |
| `startDate` | `YYYY-MM-DD \| ""` | 작업 시작일. 타임라인/간트 span의 시작 | `startDate` |
| `startTime` | `HH:mm \| ""` | 작업 블록 시작 시각. **`scheduledDate`에 종속** | `startTime` (단, 종속 대상 다름) |
| `endTime` | `HH:mm \| ""` | 작업 블록 종료 시각. **`scheduledDate`에 종속** | `dueTime` (이름·종속 대상 모두 다름) |
| `repeatType` | `"none"\|"daily"\|"weekly"\|"monthly"` | 반복 종류 | `recurrence.freq` 일부 |
| `repeatInterval` | `number` | 반복 간격 | `recurrence.interval` |
| `repeatDays` | `number[]` | 주간 반복 요일 | `recurrence` weekly byDay |
| `repeatEndDate` | `YYYY-MM-DD \| ""` | 반복 종료일 | `recurrence` end condition |

설계서에 있으나 **현재 존재하지 않는** 필드:

```text
dueTime      (endTime이 유사 역할이나 종속 대상이 다름)
timezone
reminders    (ReminderRule[])
recurrence   (RecurrenceRule — 구조화된 단일 객체)
```

## 1.1 세 날짜 필드의 관계

`src/types.ts:38`의 주석이 셋의 구분을 명시한다.

> a task can start on Monday and be due Friday while the day actually blocked out on the calendar is Wednesday

즉 이 앱은 **이미** "언제 시작 / 언제 해야 / 언제 마감"을 셋으로 분리해 두었고, 이는 의도적 설계다. 설계서는 둘(`startDate` / `dueDate`)만 가정한다.

`src/domain/view/span.ts:35`의 `spanForItem()`은 셋 전부를 읽어 min/max로 간트 막대를 만든다. 저장이 아니라 투영이며, 주석대로 "fallback으로 그린 막대를 사용자가 고른 값처럼 저장하지 않는다".

---

# 2. 저장 계층 — 설계서 §20이 무효인 이유

`supabase/migrations/001_initial_schema.sql:3`:

```sql
create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  ...
);
```

**Task의 모든 필드는 `data` jsonb 한 덩어리 안에 있다. 일정 관련 컬럼은 하나도 없다.** 읽기 경로도 동일하다 (`src/hooks/usePlannerData.ts:737`):

```ts
const { data: rows } = await supabase.from(table).select("data");
partial[key] = (rows ?? []).map((row) => row.data);
```

따라서 설계서 §20/§22.33의 다음 단계는 **전부 해당 사항 없음**이다.

| §22.33 단계 | 이 리포에서 |
|---|---|
| M1 columns add | 불필요 — 스키마 없음 |
| M2 backfill | 불필요 — `normalizeTask` 기본값이 곧 backfill |
| M3 audit | **필요** (형태 변경) — §2.2 |
| M4 constraints | 불가 — jsonb라 DB가 강제 불가 |
| M5 revision trigger | 불필요 |
| M6 indexes | 불필요 |
| M7 generated types | 불필요 — generated type 미사용 |

마지막 migration은 `013_saved_filters.sql`이므로 다음 번호는 `014`이나, **이 기능은 migration을 쓰지 않는다.**

## 2.1 스키마 대신 `normalizeTask`가 계약이다

`src/hooks/usePlannerData.ts`의 `normalizeTask()`가 유일한 스키마 게이트다. 새 일정 필드는 여기에 기본값을 추가하는 것만으로 도입된다.

이 함수에는 이미 forward-compat 장치가 있다:

```ts
// 구버전 클라이언트가 새 필드를 지우지 않게 하는 spread
...task,
id: task.id ?? createId("task"),
```

주석이 이유를 남겨두었다 — spread가 없으면 "한 버전 뒤진 클라이언트가 최신 클라이언트가 쓴 필드를 조용히 지운다". `reminders` / `recurrence`를 넣을 때 이 성질에 의존하게 된다.

또한 이 함수에는 **이미 일정 관련 legacy 복구 로직이 하나 살아 있다**:

```ts
// CALENDAR_DESIGN.md §1.2/§10.2: startTime/endTime now belong to scheduledDate
// (not dueDate). ... promote dueDate into scheduledDate so the timed block
// keeps showing up.
if (startTime && !scheduledDate && dueDate) {
  scheduledDate = dueDate;
}
```

이 다섯 줄이 §5 D1의 증거다. **과거에 이 앱은 시간을 `dueDate`에 붙였고, 의도적으로 `scheduledDate`로 옮겼다.** 설계서는 그 이전 모델로 되돌리라고 말하고 있다.

## 2.2 DB가 막아주지 않으므로 오히려 더 중요해지는 것

설계서 §1.6의 아홉 개 불변식(INV-01~INV-09)을 **DB constraint로 강제할 수단이 없다.** `NOT VALID → repair → VALIDATE`(§22.36) 전략도 쓸 수 없다.

결과적으로:

```text
normalizeSchedule()
= 유일한 방어선
```

읽기 시점에 불변식 위반을 복구해야 하며, 위반 데이터는 이미 존재한다고 가정해야 한다 (§22.35의 audit은 SQL이 아니라 런타임 계측으로 수행). 설계서 §17(예외 상황과 Validation)의 가치는 §20이 사라진 만큼 **올라간다**.

---

# 3. Writer 인벤토리

§22.12가 요구하는 목록이다. 기준은 "Task의 일정 필드를 실제로 변경(저장)하는 경로".

## 3.1 최종 저장 경로 (단일)

```text
src/hooks/usePlannerData.ts:1027
  function updateTask(taskId: string, patch: Partial<Task>)
```

**모든 쓰기가 여기로 모인다.** 설계서 §13이 요구하는 `updateTaskSchedule()` canonical mutation을 만들 자리가 이미 확보돼 있다는 뜻이며, 이것은 좋은 소식이다. 다만 현재는 `Partial<Task>`를 그대로 받으므로 일정 불변식을 강제하지 않는다.

## 3.2 일정 필드를 담아 `updateTask`를 호출하는 곳

| 파일 | 무엇을 쓰는가 |
|---|---|
| `src/components/TaskDetail.tsx:116-190` | `startDate`, `startTime`, `endTime`, `dueDate`, `repeat*` — 현재 편집 UI 전체 |
| `src/components/CalendarView.tsx` | 드래그/리사이즈 → `scheduledDate`, `startTime`, `endTime` |
| `src/components/TaskCalendarView.tsx` | 캘린더 드롭 |
| `src/components/TodayPage.tsx:318` | inbox → todo 승격 시 `scheduledDate: today` |
| `src/app/executeAgentActions.ts` | AI 에이전트 액션 |

## 3.3 생성 시점에 일정을 정하는 곳 (`addTask` / `createTask`)

| 파일 | 비고 |
|---|---|
| `src/components/today/QuickAddTaskModal.tsx` | |
| `src/components/calendar/NewTaskForm.tsx` | |
| `src/components/calendar/QuickCreatePopover.tsx` | |
| `src/components/tasks/TaskDrawer.tsx` | |
| `src/components/spaces/SpaceModals.tsx`, `SpaceDetailView.tsx` | |
| `src/components/TaskListView.tsx` | |
| `src/utils/quickParse.ts:124` | 자연어 파싱. 명시적 날짜를 **`dueDate`로** 넣음 |
| `src/domain/tasks/createResolver.ts` | |
| `src/lib/ai/agent/actions.ts` | |

## 3.4 일정 필드를 파생·변형하는 도메인 코드

| 파일 | 역할 |
|---|---|
| `src/utils/planner.ts:131` | 완료 시 `repeatType` 기준으로 다음 반복 날짜 계산 |
| `src/hooks/usePlannerData.ts:1195` | 완료 시 `repeatType !== "none"`이면 반복 인스턴스 생성 |
| `src/domain/tasks/filters.ts:112` | 저장 필터의 `dueDate` 조건 평가·패치 |
| `src/domain/horizons/goalSchedule.ts` | Horizons 목표 일정 |

**반복(repeat) 로직은 두 곳에 있다** — 새 `recurrence` 도입 시 이 둘이 신·구 필드를 동시에 보게 된다. 어댑터 하나로 좁혀야 한다.

---

# 4. Reader 인벤토리

`dueDate`를 읽는 파일만 **82개**다. 전수는 의미가 없으므로 의미를 결정하는 곳만 적는다.

| 파일 | 무엇을 결정하는가 |
|---|---|
| `src/utils/calendarItems.ts:210-255` | **캘린더 표시 규칙의 원본** — 아래 §4.1 |
| `src/utils/planner.ts:64-73` | **Today 버킷 규칙의 원본** — 아래 §4.2 |
| `src/domain/view/span.ts:35` | 간트 막대의 [start, end] |
| `src/domain/tasks/filters.ts` | 저장 필터 평가 |
| `src/components/kit.tsx:278` | `DueDatePill` — 리스트 행의 날짜 표시 |
| `src/domain/view/item.ts` | 뷰 공통 Item 투영 |
| `src/lib/ai/context/selectRelevantAppContext.ts` | AI 컨텍스트 |

## 4.1 캘린더의 현재 계약 (`calendarItems.ts:226-255`)

```ts
// D1: scheduledDate drives the work-time block; startTime/endTime belong to it.
if (layers.task && item.scheduledDate) { ... allDay: !item.startTime ... }

// D2: dueDate is always an all-day, non-draggable deadline marker.
if (layers.deadline && item.dueDate && ...) { date: item.dueDate }
```

두 줄로 요약하면:

```text
scheduledDate + startTime/endTime  →  드래그 가능한 작업 블록
dueDate                            →  시간 없는 마감 마커
```

## 4.2 Today의 현재 계약 (`planner.ts:64-73`)

`buildPlannerBuckets()`는 두 날짜를 **서로 다른 버킷**으로 분류한다. 우선순위가 있는 if-continue 체인이다.

```ts
if (task.dueDate && task.dueDate < today)  → overdue
if (task.dueDate === today)                → dueToday
if (task.scheduledDate === today)          → scheduledToday
```

즉 **두 필드 모두 Today에 나타나되, 다른 줄에 선다.** `dueToday`가 먼저 걸러지므로 마감일이 오늘인 Task는 `scheduledDate`와 무관하게 `dueToday`로 간다.

## 4.3 네 번째 날짜 개념 — DailyPlan

`src/domain/today/dailyPlan.ts`는 Task 필드가 아니라 **별도 레코드**다. `(planDate, taskId)`로 키를 만들고(`dailyPlanIdFor`, `:29`) 하루 단위 bucket override를 저장한다.

Task의 일정 필드를 전혀 읽지 않으므로 이 기능의 직접 대상이 아니며, 결정 1(C)의 영향도 받지 않는다. 다만 `scheduledDate`가 사라진 뒤 **"오늘 무엇을 할지"를 하루 단위로 고르는 경로는 DailyPlan이 유일해진다.** Phase 9에서 Today 버킷을 정리할 때 이 점을 고려한다.

---

# 5. 설계서와의 Mismatch

## D1 — `scheduledDate`의 부재, 그리고 시간의 종속 대상 ⚠️ 최우선

설계서 §1.5는 이렇게 못박는다.

> Date 모드에서 `dueDate` = Task가 위치하는 날짜

그리고 §1.3.5는 `startTime` / `dueTime`을 `startDate` / `dueDate`에 붙인다. 그런데 현재 코드에서:

- **시간 블록의 기준**은 `scheduledDate`다 (`calendarItems.ts:226`)
- `dueDate`는 **시간을 가질 수 없는** 마감 마커다 (`calendarItems.ts:247`)
- Today는 `dueToday` / `scheduledToday` **두 버킷**으로 나뉜다 (`planner.ts:64-73`)

설계서대로 Date 모드에서 `dueDate`에 날짜와 시간을 쓰면 두 가지가 깨진다.

**첫째, 시간이 아무 데도 나타나지 않는다.**

```text
새 Editor에서 "오늘 14:00" 지정
→ dueDate=오늘, dueTime=14:00
→ Today에는 뜬다 (dueToday 버킷)
→ 그러나 캘린더에 14:00 블록이 안 생김 — dueDate는 all-day 마커이므로
→ 사용자에게는 "시간을 정했는데 시간표에 안 보임"
```

(Today 표시 자체는 문제없다. `dueDate === today`도 Today에 들어간다 — §4.2.)

**둘째, `scheduledDate`의 writer가 사라진다.** 새 Editor가 Date 모드에서 `dueDate`만 쓰면, 캘린더의 드래그 가능한 작업 블록 레이어에 값을 넣는 주된 경로가 없어진다. 캘린더 드래그(`CalendarView.tsx`)만 남고, 편집 UI에서는 작업 블록을 만들 수 없게 된다.

게다가 이 앱은 **과거에 설계서와 같은 모델이었다가 의도적으로 빠져나왔다.** `normalizeTask`의 legacy 복구 코드(§2.1)와 `CALENDAR_DESIGN.md §1.2/§10.2`가 그 기록이다. 설계서를 문자 그대로 구현하는 것은 그 결정을 되돌리는 일이다.

**이것은 이름 충돌이 아니라 의미 충돌이며, 도메인 코드 한 줄을 쓰기 전에 결정되어야 한다.** → §6 결정 1

## D2 — `endTime` vs `dueTime`

47개 파일이 `endTime`을 쓴다. 순수 명명 문제다. → §6 결정 2

## D3 — 반복 모델의 형태

```text
현재  repeatType / repeatInterval / repeatDays / repeatEndDate  (플랫 4필드, 31개 파일)
설계  recurrence: RecurrenceRule                                 (구조화된 단일 객체)
```

현재 모델은 `daily`/`weekly`/`monthly`뿐이고 `yearly`, nth-weekday, count 종료가 없다. 설계서 §9의 표현력이 확실히 넓다. 다만 `planner.ts:131`과 `usePlannerData.ts:1195`가 구 모델에 묶여 있다. → §6 결정 3

## D4 — 미설정 sentinel

```text
현재  ""     (문자열)
설계  null
```

`Task` 경계 전체가 `""`에 의존한다. 도메인 내부는 설계서대로 `null`을 쓰고, Task ↔ Schedule 변환 지점에서만 번역하는 것이 옳다. → §6 결정 4

## D5 — Reminder의 배달 수단이 없다

`tauri-plugin-notification`은 존재하나(`src-tauri/Cargo.toml:40`), 현재 용도는 포커스 타이머의 즉시 알림뿐이다. **미래 시각에 발화하는 예약 스케줄러가 없고, 앱이 종료돼 있으면 발화 경로 자체가 없다.**

설계서 §8을 P0로 잡으면 "설정은 되지만 울리지 않는 알림"이 출시된다. 스케줄러는 별도 설계가 필요하다. → §7

## D6 — 없는 것과 있는 것

**없어서 만들어야 하는 것:**

```text
날짜 선택용 MonthCalendar
```

`src/components/calendar/MonthView.tsx`는 일정을 그리는 뷰이지 선택기가 아니다. 설계서 §6/§4.62가 가정하는 controlled MonthCalendar는 신규 작성 대상이다.

**이미 있어서 안 만들어도 되는 것:**

```text
Popover              src/components/kit.tsx:92
useOutsideClose      src/components/kit.tsx:71
Modal / ConfirmModal src/components/kit.tsx:551,671
useAutoFocus         src/components/kit.tsx:731
단일 mutation 지점    usePlannerData.ts:1027
domain 순수함수 + vitest 관습  src/domain/** 전반
```

설계서 §19의 레이어 규칙(domain이 React/DB를 import하지 않음)은 `src/domain/`에서 **이미 지켜지고 있다.** 새 폴더 구조를 도입할 필요 없이 `src/domain/schedule/`만 추가하면 된다.

---

# 6. 결정 사항

전부 확정됐다. 결정 1이 나머지를 좌우하므로 먼저 읽는다.

## 결정 1 — `scheduledDate`를 어떻게 할 것인가 ✅ **C로 확정**

| 안 | 내용 | 비용 | 위험 |
|---|---|---|---|
| **A** | Editor는 `startDate`/`dueDate`만 편집. `scheduledDate`는 별개 개념으로 유지 | 낮음 | 시간이 시간표에 안 나타남 + `scheduledDate` writer 상실 (D1) |
| **B** | Editor의 Date 모드 = `scheduledDate` 편집, Duration = `startDate`→`dueDate` | 중간 | 설계서 §1 전반을 재해석. 결과물이 TickTick보다 복잡하면서 동시에 부족함 |
| **C** | `scheduledDate` 제거, 설계서 모델로 통일 | **높음** (67개 파일 + 캘린더 2레이어 폐기 + 데이터 통합) | 기존 "작업일 ≠ 마감일" 데이터의 의미 변형 |

**C로 확정한다.**

근거는 목표가 "TickTick처럼"이라는 것이다. TickTick의 편집기가 단순한 이유는 편집기 설계가 아니라 **모델이 단순하기 때문**이다 — 설계서 §1.5가 "Date 모드에서 `dueDate` = Task가 위치하는 날짜"라고 쓴 그대로, 날짜 개념이 하나다. 고른 날짜가 곧 할 날이고 마감이고 캘린더에 뜨는 날이다.

세 필드를 남긴 채 TickTick 모양의 편집기만 얹으면(B) 마감일 row가 하나 더 붙어 TickTick보다 복잡해지고, 동시에 기간+시간을 못 해서 TickTick보다 부족해진다. 모양만 닮고 성질은 닮지 않는다.

C는 이 프로젝트에서 가장 비싼 선택이며, **되돌릴 수 없는 데이터 변경을 포함한다.** §7의 단계 순서와 §10의 위험 완화가 그 대가를 관리하는 방법이다.

### 1-a. 최종 필드 모델

```text
startDate    범위 시작 (Duration 모드)
dueDate      Task의 날짜 (Date 모드) / 범위 종료 (Duration 모드)
startTime    블록 시작 시각
endTime      블록 종료 시각          ← 설계서의 dueTime 자리
timezone     신규
reminders    신규 (Phase 11)
recurrence   신규 (Phase 10)

scheduledDate  제거
```

설계서 §1.3.5와 이름 하나(`dueTime` → `endTime`)를 빼면 동일하다. 재해석 계층이 사라지므로 §1~§7을 원문 그대로 구현할 수 있다.

### 1-b. 시간은 "단일 시각"이 아니라 "구간 블록"이다 ⚠️ 설계서와 갈라짐

설계서 §1.11은 Date 모드의 시간을 단일 시각으로 규정한다.

```ts
draft.startTime = null
draft.dueTime = selectedTime
```

**이것은 따르지 않는다.** 이 앱의 캘린더는 이미 시작·종료를 가진 구간 블록이고, 드래그와 리사이즈가 되며(`WeekView.tsx`), `estimatedMinutes`가 기본 길이를 정한다. 단일 시각으로 내리면 기존 기능이 후퇴한다.

확정:

```text
Date 모드      startTime, endTime 모두 dueDate에 속한다
Duration 모드  startTime은 startDate에, endTime은 dueDate에   (설계서 §7 그대로)
```

Date 모드에서 `endTime`은 선택 사항이다. 없으면 `allDay`가 아니라 "시작 시각만 있는 블록"이며, 길이는 `estimatedMinutes`가 정한다 — 현재 동작 그대로다.

### 1-c. Duration + 시간을 v1에 포함한다

B에서 제외했던 항목이 C 덕분에 표현 가능해졌다. `startTime`이 `startDate`에, `endTime`이 `dueDate`에 직접 붙으므로 설계서 §7의 Duration 시간 규칙이 그대로 성립한다.

남는 작업은 렌더링 쪽이다.

- `span.ts`는 날짜만 다루므로 간트는 변경 없음
- 캘린더 주간뷰가 **여러 날에 걸친 블록**을 그려야 한다 → Phase 9

### 1-d. 데이터 통합 규칙 ⚠️ C의 핵심

두 필드를 하나로 접을 때 기존 값을 어떻게 보존하는가. 읽기 시점에 적용하며 멱등이어야 한다.

| 기존 상태 | 변환 결과 | 근거 |
|---|---|---|
| 둘 다 없음 | 일정 없음 | |
| `scheduledDate`만 | `dueDate = scheduledDate` | 유일한 날짜를 canonical 자리로 |
| `dueDate`만 | 그대로 | 변화 없음 |
| 둘이 **같음** | `dueDate` 유지, `scheduledDate` 폐기 | 무손실 |
| 둘이 **다름** | **`startDate = scheduledDate`, `dueDate` 유지 → Duration으로 승격** | 두 값을 모두 보존 |

마지막 줄이 C의 데이터 손실을 막는 장치다. "수요일에 하고 금요일 마감"은 "수 → 금 기간"이 된다. 완전히 같은 의미는 아니지만 — 기간은 사흘 내내 작업한다는 뜻에 가깝다 — 날짜를 하나 버리는 것보다 손실이 적고, 사용자가 편집기에서 즉시 고칠 수 있는 형태다.

**예외:** `startDate`가 이미 있고 `scheduledDate`가 그와 다르면 `startDate`를 유지하고 `scheduledDate`는 버린다. 세 날짜를 두 자리에 넣을 수 없기 때문이다. 이 경우는 통합 시점에 계측해 건수를 확인한다(§10).

**또한 `normalizeTask`의 기존 legacy 복구 코드(§2.1)를 삭제해야 한다.** 그 다섯 줄은 `dueDate → scheduledDate` 방향으로 승격시키는데, C에서는 정확히 반대 방향이다. 남겨두면 통합 규칙과 싸운다.

### 1-e. 캘린더 2레이어를 하나로 접는다

`calendarItems.ts`의 D1(작업 블록) / D2(마감 마커)가 통합된다. Task 하나가 아이템 하나를 만든다.

```text
before   scheduledDate → task 블록 (드래그 가능)
         dueDate       → deadline 마커 (종일, 드래그 불가)

after    dueDate       → task 블록 (드래그 가능, 시간 있으면 시간 블록)
```

`layers.deadline` 토글은 **프로젝트 마감 전용**으로 축소된다(`calendarItems.ts:267`의 `layers.projectDeadline`은 그대로).

`planner.ts`의 버킷도 셋에서 둘로 줄어든다.

```text
before   overdue / dueToday / scheduledToday
after    overdue / dueToday
```

**이것은 사용자가 보던 화면이 바뀌는 변경이다.** 마감 마커가 사라지고 Today의 줄 구성이 달라진다. 릴리스 노트가 필요하다.

## 결정 2 — `dueTime` vs `endTime` ✅ 확정

**기존 `startTime` / `endTime` 이름을 유지한다.** 47개 파일을 이름 하나 때문에 건드릴 이유가 없다.

```text
설계서 startTime  →  startTime
설계서 dueTime    →  endTime
```

C에서는 종속 대상까지 설계서와 같아지므로 순수 명명 치환이다. B판에서 필요했던 "Date 모드의 dueTime은 startTime으로" 같은 예외가 사라진다.

## 결정 3 — 반복 모델 ✅ 확정

**신규 `recurrence: RecurrenceRule | null`을 추가하고, 레거시 `repeat*` 4필드는 남긴다.**

- 읽기: `recurrence`가 있으면 그것을, 없으면 `repeat*`를 어댑터가 변환해 제공
- 쓰기: 새 Editor는 `recurrence`만 쓰고, 어댑터가 표현 가능한 범위에서 `repeat*`도 동기화 (구버전 클라이언트·`planner.ts` 호환)
- `planner.ts:131` / `usePlannerData.ts:1195`는 어댑터 한 곳만 보도록 좁힌다
- 레거시 필드 제거는 Phase 12에서 `scheduledDate`와 함께 처리한다

## 결정 4 — sentinel ✅ 확정

**`src/domain/schedule/` 내부는 `null`, `Task` 경계는 `""`.** 변환은 `toSchedule(task)` / `toTaskPatch(schedule)` 두 함수에만 존재한다.

## 결정 5 — 롤백 전략 ✅ 확정 (B판에서 변경됨)

리포에 feature flag 시스템이 없고, 이를 위해 새로 도입하지도 않는다. 그러나 **C는 데이터를 바꾸므로 "커밋 revert"만으로는 안 돌아간다.** B판의 결론을 폐기하고 다음으로 대체한다.

```text
Phase 1~9  (어댑터 · reader 전환 · Editor 전체)
  → 데이터 변경 없음. 전부 revert 자유

Phase 10   (데이터 통합)
  → 되돌릴 수 없는 유일한 단계. §7.1에 따라 v1 이후로 밀었고,
     이 시점에는 관찰 가능한 효과가 없다
```

핵심은 **디스크의 데이터가 v1 내내 옛 형태 그대로라는 것**이다. 어댑터가 읽는 쪽에서 통합하므로, 어느 단계에서 문제가 보여도 커밋을 되돌리면 원래 앱으로 돌아간다. 되돌릴 수 없는 단계는 남아 있지만 더 이상 급하지 않다.

---

# 7. 구현 순서 (C 확정판)

expand → migrate → contract 순서다. 설계서 §22.2의 13단계를 이 리포와 결정 1에 맞춰 재구성했다.

| Phase | 내용 | 설계서 대응 | 되돌리기 |
|---|---|---|---|
| **0** | 이 문서 | §22.10~15 | ✅ 완료 |
| **1** | `src/domain/schedule/` 코어 — types, mode 파생, Date/Duration 전환, normalize, validate, equality + 테스트 | §22.16~22 | 자유 |
| **2** | **읽기 어댑터** `toSchedule()` — 구 형태(`scheduledDate` 포함)와 신 형태를 모두 이해 | — (C 고유) | 자유 |
| **3** | **reader 전환 + 화면 재작업** — `span` / `calendarItems` / `planner` / `TodayPage` / `filters`가 어댑터 경유. 캘린더 2레이어 통합, Today 버킷 정리 | §14 (구 9 병합) | 자유 |
| **4** | `updateTaskSchedule()` 단일 mutation | §22.42~ | |
| **5** | Editor 상태 기계 (reducer) | §2 | |
| **6** | Popover + MonthCalendar (신규) + Date/Duration 선택 | §10, §6, §3, §4 | |
| **7** | Time — Date + Duration 양쪽 | §7 | 결정 1-b/1-c |
| — | **v1 여기서 끊는다** | | |
| **8** | Recurrence — 레거시 `repeat*` 흡수 | §9 | ✅ 완료 |
| **9** | Reminder — 배달까지 (`reminderQueue` + `useReminders`) | §8 | ✅ 완료 · D5 참고 |
| **10** | **데이터 통합** — `normalizeTask`에 1-d 규칙 적용(멱등) | §22.31~41 대체 | ✅ 완료 · ⚠️ 불가역 |
| **11** | contract — `Task`에서 `scheduledDate` 제거 | §22.13 | ✅ 완료 |

Phase 8~11 완료 시점의 주의사항 세 가지.

1. **Reminder는 앱이 켜져 있을 때만 울린다.** 백그라운드 서비스가 없고 Tauri의 notification 플러그인은 예약이 아니라 즉시 발송이라, `useReminders`가 30초마다 전경에서 훑는다. 30분(`GRACE_MINUTES`)보다 오래 지난 알림은 발송하지 않고 조용히 기록만 한다 — 노트북을 일주일 만에 열었을 때 마흔 개가 쏟아지지 않게 하기 위해서다.
2. **`repeat*`는 남는다.** Phase 11이 지운 것은 `scheduledDate` 하나다. 반복은 프리셋 6개로 편집하되 저장은 여전히 `repeatType`/`repeatInterval`/`repeatDays`이며, 그 변환은 `domain/schedule/recurrence.ts` 한 곳에만 있다. `getNextDueDate`와 이미 반복 중인 태스크가 그 세 필드를 쓰기 때문이다.
3. **1-d가 예고하지 않은 동작 변화 두 개.** (a) 아이젠하워에서 긴급 해제 시 마감일을 지우면 그 태스크는 Today에서도 빠진다 — 예전엔 두 번째 날짜로 붙잡아 뒀지만, 날짜가 하나면 "오늘이지만 오늘 마감은 아님"을 표현할 수 없다. (b) 캘린더 공유(ICS)가 태스크당 이벤트 하나만 내보낸다 — 작업일 블록과 마감 마커가 같은 날짜가 되어 중복이 되기 때문이다.

## 7.1 순서를 고친 이유 (v1 계획의 오류 수정)

초판 §7은 Phase 3을 "reader 전환, **화면 동작 불변**"으로, Phase 4를 데이터 통합으로 두었다. **둘 다 틀렸다.**

**첫째, "reader 전환 + 동작 불변"은 동시에 성립하지 않는다.** 어댑터는 의도적으로 통합한다(1-d). reader가 어댑터를 거치는 순간 `scheduled-only`와 `promoted` 레코드의 표시가 달라진다. 실제로 `calendarItems.test.ts`에는 이미 `"makes a work block from scheduledDate and a marker from dueDate"`라는 테스트가 있고, 이것은 전환과 **동시에** 깨지는 것이 정상이다. 결정 1-e가 예고한 화면 변화가 곧 그것이다. 그래서 구 Phase 9(레이어 통합)를 Phase 3에 병합했다 — 같은 변화를 두 단계로 쪼갤 수 없다.

**둘째, 데이터 통합이 reader 전환보다 앞서면 안 된다.** `scheduledDate`가 비워진 상태에서 `calendarItems`가 여전히 그것을 읽으면 모든 작업 블록이 사라진다. 순서가 반대였다.

**그리고 순서를 바로잡으면 통합이 거의 공짜가 된다.** Phase 2가 다음을 테스트로 고정했다.

```text
scheduleFromTask(scheduleToTaskPatch(s)) === s
```

즉 통합된 레코드와 통합 전 원본은 어댑터를 거치면 **같은 Schedule**을 만든다. 모든 reader가 어댑터를 통과한 뒤에는 데이터 통합이 관찰 가능한 변화를 만들지 않는다. 그래서 되돌릴 수 없는 유일한 단계를 v1 이후로 미뤘다 — 위험을 줄인 것이 아니라, **위험한 단계가 더 이상 필요하지 않은 순서**를 찾은 것이다.

**Popover는 Phase 5가 아니라 6이다.** 초판은 상태 기계와 Popover를 같은 단계에 뒀는데, 달력 없는 Popover는 눌러볼 것이 없어 브라우저에서 검증할 수 없고 사용자에게 내보낼 수도 없다. 껍데기를 먼저 만들어 두는 것은 검증되지 않은 코드를 한 단계 더 오래 방치하는 일이라, 달력이 도착하는 단계로 합쳤다.

**설계서 §2.12~2.14(Save lifecycle)는 채택하지 않는다.** `saving` / `saveError` 상태는 Confirm이 비동기 mutation을 부른다는 전제인데, 이 앱의 `updateTaskSchedule`은 동기다 — 상태를 갱신하고 저장은 별도 큐가 문서 단위로 처리한다. Draft가 "전송 중"인 구간이 존재하지 않으므로, 아무도 관찰할 수 없는 상태를 타입에 넣는 것은 거짓말이 된다. §20과 같은 종류의 불일치다.

**Phase 3이 여전히 이 계획의 관문이다.** 다만 통과 기준이 "아무것도 안 바뀜"이 아니라 **"바뀐 것이 전부 1-e가 예고한 것뿐임"**이다. 예고에 없는 변화가 나오면 그것이 1-d 규칙의 구멍이다.

설계서 §22.7의 P0 정의에서 **Reminder / Repeat를 제외**했다. 근거는 D5(배달 수단 부재)와, 현재 `repeat*`가 이미 동작 중이라 반복이 v1의 회귀 항목이 아니라는 점이다.

---

# 8. Phase 0 Exit Criteria (§22.14)

```text
☑ 현재 Schedule writer 목록이 있음          → §3
☑ 현재 DB schema를 확인함                   → §2 (jsonb, 컬럼 없음)
☑ 기존 date/time 의미를 설명할 수 있음       → §1, §4.1, §4.2
☑ migration next 번호 확인                  → 014 (단, 사용하지 않음)
☑ 기존 test runner 확인                     → vitest 4.1.10 + playwright 1.62.1
☑ Popover/Dialog/Button primitive 확인      → §5 D6
☑ 롤백 전략 결정                            → §6 결정 5
☑ scheduledDate 처리 확정                   → C, 하위 결정 1-a~1-e 포함
```

**Phase 0 완료. Phase 1 착수 가능.**

---

# 9. Phase 1이 물려받는 계약

도메인 코어를 쓸 때 아래가 전제다. 어긋나면 이 문서를 먼저 고친다.

```text
ScheduleDraft가 담는 것
  mode: "date" | "duration"
  startDate      Duration 시작
  dueDate        Date 모드의 날짜 / Duration 종료
  startTime      Date 모드: dueDate의 블록 시작
                 Duration:  startDate의 시각
  endTime        Date 모드: dueDate의 블록 종료 (선택)
                 Duration:  dueDate의 시각
  recurrence     Phase 10
  reminders      Phase 11

mode는 저장하지 않고 파생          (설계서 §1.4)
  startDate가 있으면 duration, 아니면 date

도메인 내부는 null, Task 경계는 ""  (결정 4)
시간은 구간 블록이며 단일 시각이 아니다  (결정 1-b — 설계서 §1.11 미채택)

scheduledDate는 도메인에 존재하지 않는다
  → Phase 2의 어댑터가 흡수하고, Phase 4가 데이터에서 지운다

도메인은 React / Supabase / browser API를 import하지 않는다  (설계서 §19.3)
```

---

# 10. C의 위험과 완화

C를 고른 이상 아래를 관리 항목으로 둔다.

| 위험 | 완화 |
|---|---|
| **작업일 ≠ 마감일 데이터의 의미 변형** | 1-d의 "Duration 승격" 규칙으로 두 값 모두 보존. 통합 실행 시 해당 건수를 계측해 로그로 남긴다 |
| **세 날짜가 모두 다른 Task** | `startDate`를 유지하고 `scheduledDate`를 버린다. 건수 계측 필요 — 예상보다 많으면 1-d를 재검토한다 |
| **67개 파일의 `scheduledDate` 참조** | Phase 2~3에서 어댑터 경유로 전환하고, 실제 필드 제거는 Phase 12까지 미룬다. 한 번에 고치지 않는다 |
| **사용자가 보던 화면이 바뀜** (마감 마커 소멸, Today 줄 구성 변화) | Phase 9에서 한꺼번에 반영하고 릴리스 노트에 명시한다 |
| **Phase 4 이후 롤백 불가** | Phase 3의 "화면 동작 불변" e2e 검증을 통과하기 전에는 Phase 4에 진입하지 않는다 |
| **DB constraint가 없어 불변식을 강제할 수 없음** | `normalizeSchedule()`이 유일한 방어선 (§2.2). 설계서 §17을 P0로 취급한다 |
