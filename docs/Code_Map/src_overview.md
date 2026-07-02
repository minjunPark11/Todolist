# src Overview

## Entry

- `C:\Users\minju\Todolist\src\main.tsx`: React root 생성, `App` 렌더링, `styles.css` import
- `C:\Users\minju\Todolist\src\App.tsx`: 전체 앱 shell, page routing, selected task detail, auth form, search, AI action execution

## 주요 페이지 컴포넌트

- `C:\Users\minju\Todolist\src\components\TodayPage.tsx`: Today buckets, focus/due/scheduled/waiting/overdue/done today
- `C:\Users\minju\Todolist\src\components\InboxPage.tsx`: Inbox tasks
- `C:\Users\minju\Todolist\src\components\ProjectsPage.tsx`: Projects/areas 관리
- `C:\Users\minju\Todolist\src\components\PlanningPage.tsx`: planning board
- `C:\Users\minju\Todolist\src\components\CalendarView.tsx`: Calendar shell
- `C:\Users\minju\Todolist\src\components\StudyPage.tsx`: Study topics/notes/reviews
- `C:\Users\minju\Todolist\src\components\ArchivePage.tsx`: archived task/project restore/delete
- `C:\Users\minju\Todolist\src\components\SettingsPage.tsx`: app settings, export/import, sample load, reset
- `C:\Users\minju\Todolist\src\components\BoardView.tsx`: board page
- `C:\Users\minju\Todolist\src\components\DashboardView.tsx`: dashboard page
- `C:\Users\minju\Todolist\src\components\HabitsPage.tsx`: habits page
- `C:\Users\minju\Todolist\src\components\FocusPage.tsx`: focus timer/session page

## 주요 공통 컴포넌트

- `C:\Users\minju\Todolist\src\components\Sidebar.tsx`: primary/secondary navigation, project shortcuts
- `C:\Users\minju\Todolist\src\components\TaskList.tsx`: task grouping/list rows
- `C:\Users\minju\Todolist\src\components\TaskDetail.tsx`: selected task editor
- `C:\Users\minju\Todolist\src\components\QuickAdd.tsx`: quick task creation
- `C:\Users\minju\Todolist\src\components\kit.tsx`: shared UI helpers such as toast/empty state/tabs

## Calendar 파일

- `C:\Users\minju\Todolist\src\components\calendar\CalendarToolbar.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\CalendarLeftSidebar.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\WeekView.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\MonthView.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\CalendarRightPanel.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\QuickCreatePopover.tsx`
- `C:\Users\minju\Todolist\src\components\calendar\NewTaskForm.tsx`
- `C:\Users\minju\Todolist\src\utils\calendarItems.ts`
- `C:\Users\minju\Todolist\src\utils\calendarTime.ts`

## Study 파일

- `C:\Users\minju\Todolist\src\components\StudyPage.tsx`
- `C:\Users\minju\Todolist\src\data\studySeed.ts`
- `C:\Users\minju\Todolist\src\utils\planner.ts`

## AI/Ollama 파일

- `C:\Users\minju\Todolist\src\components\OllamaChat.tsx`
- `C:\Users\minju\Todolist\src\components\ai\AgentActionPreview.tsx`
- `C:\Users\minju\Todolist\src\lib\ollama.ts`
- `C:\Users\minju\Todolist\src\lib\ai`
- `C:\Users\minju\Todolist\src\lib\calendarContext.ts`

## Sidebar/navigation 파일

- `C:\Users\minju\Todolist\src\components\Sidebar.tsx`
- `C:\Users\minju\Todolist\src\App.tsx`
- `C:\Users\minju\Todolist\src\types.ts`의 `PageId`

## 데이터 모델/저장 파일

- `C:\Users\minju\Todolist\src\types.ts`
- `C:\Users\minju\Todolist\src\hooks\usePlannerData.ts`
- `C:\Users\minju\Todolist\src\data\sampleData.ts`
- `C:\Users\minju\Todolist\src\data\studySeed.ts`
- `C:\Users\minju\Todolist\src\services\supabaseClient.ts`
- `C:\Users\minju\Todolist\supabase\migrations\001_initial_schema.sql`

## 중복/정리 후보

- 추정: `App.tsx`와 `utils\planner.ts`에 Today bucket 계산이 중복된 흔적이 있다. `App.tsx` 내부 `getTodayBuckets()`와 `utils\planner.ts` export 버전을 비교해 단일화 후보.
- 추정: `src\lib\ollama.ts`와 `src\lib\ai\providers\ollamaProvider.ts`의 역할이 겹칠 가능성이 있어 확인 필요.
- 개선 필요: hidden page 컴포넌트가 실제 제품 navigation에서 빠진 상태로 남아 있어 유지/삭제/문서화 기준 필요.
