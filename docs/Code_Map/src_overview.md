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
- 삭제됨 (2026-07-02): `BoardView.tsx`, `DashboardView.tsx`, `HabitsPage.tsx`, `FocusPage.tsx`는 hidden page 정리에서 제거했다.

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

## AI/Ollama 파일 (전부 삭제됨 — 2026-08-27, `LOCAL_AI_REMOVAL_DESIGN.md`)

- `C:\Users\minju\Todolist\src\components\OllamaChat.tsx`
- `C:\Users\minju\Todolist\src\components\ai\AgentActionPreview.tsx`
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
- 해결됨: `src\lib\ollama.ts` legacy wrapper를 제거했고 AI 호출은 `src\lib\ai\gateway.ts`와 provider 구조로 단일화했다.
- 해결됨 (2026-07-02): hidden page 컴포넌트는 삭제했다. navigation에 노출되는 MVP 페이지만 코드에 남아 있다.

## App Shell 리팩토링 후 src/app

- `C:\Users\minju\Todolist\src\app\AppPages.tsx`: active page routing/rendering, page별 props 연결, tasks page filter/sort/group 상태
- `C:\Users\minju\Todolist\src\app\AppModals.tsx`: task/project delete confirmation modal, toast rendering
- `C:\Users\minju\Todolist\src\app\useDataPortability.ts`: JSON export/import hook
- `C:\Users\minju\Todolist\src\app\executeAgentActions.ts`: AI agent action validation/execution adapter
- 현재 `C:\Users\minju\Todolist\src\App.tsx`는 layout shell, Sidebar/OllamaChat 연결, search, auth gate, selected task detail adapter를 담당한다.

## AI Gateway 정리 후 파일 역할

- `C:\Users\minju\Todolist\src\components\OllamaChat.tsx`: chat UI, intent/context 준비, personal agent 호출
- `C:\Users\minju\Todolist\src\lib\ai\agent\personalAgent.ts`: system prompt/context/messages 조합, action block parsing
- `C:\Users\minju\Todolist\src\lib\ai\gateway.ts`: AI 호출 단일 gateway, provider fallback orchestration
- `C:\Users\minju\Todolist\src\lib\ai\providers\ollamaProvider.ts`: local Ollama provider
- `C:\Users\minju\Todolist\src\lib\ai\providers\remoteOllamaProvider.ts`: explicitly enabled remote Ollama fallback provider
- `C:\Users\minju\Todolist\src\lib\ai\providers\serverProvider.ts`: configured server endpoint fallback provider
- 제거됨: `C:\Users\minju\Todolist\src\lib\ollama.ts` legacy wrapper
