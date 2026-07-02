# Calendar

## 관련 파일

- `C:\Users\minju\Todolist\src\components\CalendarView.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\CalendarToolbar.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\CalendarLeftSidebar.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\WeekView.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\MonthView.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\CalendarRightPanel.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\QuickCreatePopover.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\NewTaskForm.tsx`
- `C:\Users\minju\Todolist\src\utils\calendarItems.ts`
- `C:\Users\minju\Todolist\src\utils\calendarTime.ts`
- `C:\Users\minju\Todolist\src\lib\calendarContext.ts`

## 구현된 기능

- 구현됨: month/week/day mode 전환
- 구현됨: today, 이전/다음 range 이동
- 구현됨: 좌측 mini calendar, layer toggle, project filter
- 구현됨: sidebar collapse 시 slim icon rail 유지
- 구현됨: task scheduled block과 deadline marker 분리
- 구현됨: `scheduledDate + startTime/endTime`은 작업 시간 block으로 표시
- 구현됨: `dueDate`는 all-day deadline marker로 표시하며 draggable이 아님
- 구현됨: study review와 project deadline layer 표시
- 구현됨: month cell click / all-day click quick create
- 구현됨: week/day time grid drag selection으로 draft block 생성
- 구현됨: draft block은 `CalendarRightPanel`의 `NewTaskForm`에서 확정해야 실제 task로 저장
- 구현됨: unscheduled task panel과 drag/drop schedule/unschedule
- 구현됨: Calendar page에서 AI에게 전달할 이번 주 calendar context 생성

## 미구현 또는 개선 필요

- 개선 필요: overlapping timed blocks는 작은 offset으로만 쌓이며 collision layout은 구현되어 있지 않다.
- 개선 필요: `buildCalendarContextText()`는 현재 calendar view state가 아니라 오늘 기준 week snapshot을 사용한다.
- 개선 필요: Calendar 내부 sidebar collapse 상태는 app setting의 `sidebarCollapsed`와 별도 상태다.
- 추정: Calendar V3 작업이 최근에 많이 진행되어 문서와 코드 주석에 설계 단계 흔적이 남아 있다.

## 리팩토링 후보

- Calendar item 생성 규칙은 `C:\Users\minju\Todolist\src\utils\calendarItems.ts`에 잘 모여 있으므로 유지.
- `CalendarView.tsx`는 view state와 drag/drop handler가 많아졌으므로 mode별 interaction hook 분리를 검토할 수 있다.
- Calendar AI context가 실제 선택된 anchor/mode와 연결되지 않아, 필요하면 `CalendarView` state를 상위로 올리거나 context callback을 추가하는 방식이 후보이다.

관련 문서: [[Architecture/App_Flow]], [[Features/AI_Assistant]]
