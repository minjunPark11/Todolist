# App Flow

## 최상위 흐름

1. `C:\Users\minju\Todolist\src\main.tsx`가 `App`을 mount한다.
2. `C:\Users\minju\Todolist\src\App.tsx`가 `usePlannerData()`로 전체 앱 데이터를 가져온다.
3. `App.tsx` 내부 `activePage` 상태가 현재 화면을 결정한다.
4. `Sidebar`에서 `onNavigate(page)`가 호출되면 `activePage`가 변경된다.
5. 각 페이지 컴포넌트는 `planner` hook에서 받은 데이터와 mutation 함수를 props로 받는다.
6. `OllamaChat`은 모든 페이지 위에 floating assistant로 렌더링된다.

## 페이지 라우팅

`C:\Users\minju\Todolist\src\App.tsx`의 `renderPage()`가 다음 화면을 분기한다.

- 구현됨: `today` -> `C:\Users\minju\Todolist\src\components\TodayPage.tsx`
- 구현됨: `inbox` -> `C:\Users\minju\Todolist\src\components\InboxPage.tsx`
- 구현됨: `planning` -> `C:\Users\minju\Todolist\src\components\PlanningPage.tsx`
- 구현됨: `study` -> `C:\Users\minju\Todolist\src\components\StudyPage.tsx`
- 구현됨: `archive` -> `C:\Users\minju\Todolist\src\components\ArchivePage.tsx`
- 구현됨: `calendar` -> `C:\Users\minju\Todolist\src\components\CalendarView.tsx`
- 구현됨: `projects` -> `C:\Users\minju\Todolist\src\components\ProjectsPage.tsx`
- 구현됨: `settings` -> `C:\Users\minju\Todolist\src\components\SettingsPage.tsx`
- 구현됨/숨김: `tomorrow`, `next7`, `tasks`, `board`, `matrix`, `dashboard`, `habits`, `focus`

## 데이터 흐름

- 데이터 모델: `C:\Users\minju\Todolist\src\types.ts`
- 데이터 정규화/저장: `C:\Users\minju\Todolist\src\hooks\usePlannerData.ts`
- 기본 저장소: browser `localStorage`, key는 `focusflow.appData.v1`
- legacy migration: `todo-planner-data`에서 읽어 canonical status로 변환
- optional remote sync: `C:\Users\minju\Todolist\src\services\supabaseClient.ts`와 `C:\Users\minju\Todolist\supabase\migrations\001_initial_schema.sql`

## AI 흐름

1. `C:\Users\minju\Todolist\src\components\OllamaChat.tsx`에서 사용자 입력 수신
2. `detectAgentIntent()`로 intent 추정
3. `buildAiContextText()`와 필요 시 `buildCalendarContextText()`로 compact context 생성
4. `runPersonalAgent()`가 system prompt, context, chat history를 조합
5. `sendAiChat()`이 provider 체인을 순회
6. 응답에서 ```agent_actions``` JSON block을 파싱
7. `AgentActionPreview`에서 검증 결과와 함께 표시
8. 사용자가 적용하면 `App.tsx`의 `executeAgentActions()`가 실제 planner mutation 호출

## 리팩토링 후보

- 추정: `App.tsx`가 페이지 분기, modal, AI action execution, import/export, auth UI까지 많이 들고 있어 장기적으로 feature별 container 분리가 필요하다.
- 추정: hidden/non-MVP page들이 `PageId`와 `renderPage()`에 남아 있어 navigation 정책과 코드 소유권을 정리할 필요가 있다.
- 개선 필요: `serverProvider`가 파일로는 존재하지만 `gateway.ts` provider 배열에는 포함되어 있지 않다.

## 1차 App Shell 리팩토링 결과

- 구현됨: `C:\Users\minju\Todolist\src\App.tsx`는 app shell, global navigation/search, selected task detail 연결, auth gate, 주요 상태 연결을 담당한다.
- 구현됨: page routing/renderPage 로직은 `C:\Users\minju\Todolist\src\app\AppPages.tsx`로 분리했다.
- 구현됨: tasks page의 filter/sort/group 상태도 `C:\Users\minju\Todolist\src\app\AppPages.tsx`로 이동했다.
- 구현됨: task/project delete modal과 toast 렌더링은 `C:\Users\minju\Todolist\src\app\AppModals.tsx`로 분리했다.
- 구현됨: JSON export/import 로직은 `C:\Users\minju\Todolist\src\app\useDataPortability.ts`로 분리했다.
- 구현됨: AI action execution 로직은 `C:\Users\minju\Todolist\src\app\executeAgentActions.ts`로 분리했다.
- 개선 필요: `AppPages.tsx`가 아직 모든 page switch를 한 파일에 모으고 있으므로, 다음 단계에서는 feature별 route group으로 더 나눌 수 있다.
