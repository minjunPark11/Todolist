# FocusFlow 현재 결과물 상세 명세

검토 기준: `codex/new_design` 브랜치의 최신 커밋 `a554f80 designed` 기준.  
앱 이름은 화면상 `FocusFlow`이며, React 18 + Vite + TypeScript로 만든 개인 생산성/학습 관리 앱이다. 기본 저장소는 `localStorage`이고, Supabase 환경변수가 있을 때 계정 기반 동기화가 활성화된다.

이 문서는 현재 구현된 결과물을 그대로 다시 만들 수 있도록 페이지 구조, 상태 모델, 사용자 흐름, 예외 상태, UI 구성 요소를 상세히 서술한다.

## 1. 제품 개요

FocusFlow는 할 일 관리, 프로젝트 관리, 오늘 할 일 정리, 우선순위 계획, 학습 노트와 복습 큐를 하나의 앱에서 다루는 개인 워크플로 도구다.

핵심 목표는 다음과 같다.

- 빠른 캡처: 떠오른 일을 Inbox에 즉시 넣는다.
- 오늘 집중: 오늘 처리할 일을 Focus, Due Today, Scheduled Today, In Progress, Waiting, Overdue, Done Today로 분류한다.
- 정리와 계획: Inbox Clean Up 흐름으로 미분류 작업에 날짜, 프로젝트, 우선순위를 붙이고, Planning 보드/매트릭스로 상태를 조정한다.
- 프로젝트 관리: 프로젝트별 진행률, 우선순위 분포, 상태 분포, 태스크, 서브태스크, 노트를 관리한다.
- 학습 관리: 토픽과 개념 노트를 만들고, 난이도 기반 복습 주기를 운영한다.
- 데이터 관리: 로컬 데이터 export/import, 샘플 데이터 로드, 전체 초기화, Supabase 로그인/동기화를 지원한다.

## 2. 기술 스택과 실행 방식

프로젝트는 SPA 구조다.

- 프레임워크: React 18
- 언어: TypeScript
- 번들러/개발 서버: Vite
- 원격 동기화: Supabase JS client
- 스타일: 단일 CSS 파일 `src/styles.css`
- 데이터 저장: 기본 `localStorage`, 선택적으로 Supabase

주요 명령어:

```bash
npm run dev
npm run build
npm run typecheck
```

`package.json` 기준 개발 서버는 `vite --host 127.0.0.1 --configLoader runner`로 실행된다.

## 3. 전체 앱 레이아웃

최상위 레이아웃은 `src/App.tsx`의 `.app-shell`이다.

화면은 좌측 고정 사이드바와 우측 메인 영역으로 나뉜다.

- 좌측: `Sidebar`
- 우측: 현재 선택된 페이지
- 전역 모달: 삭제 확인, Study 모달 일부 레거시, toast

기본 그리드:

- 데스크톱: `248px` 사이드바 + 나머지 메인
- 사이드바는 `position: sticky`, 높이 `100vh`, 어두운 배경
- 메인은 `padding: 40px 44px`

대부분의 현재 MVP 화면은 `.ff-page` 계열의 새 디자인 시스템을 사용한다. 일부 레거시 화면과 TaskDetail은 `.detail-panel`, `.panel-section` 같은 이전 클래스도 남아 있다.

## 4. 노출 페이지와 숨겨진 페이지

사이드바에 실제로 노출되는 페이지는 다음 7개다.

- Inbox
- Today
- Projects
- Planning
- Study
- Archive
- Settings

코드상 `PageId`에는 다음 레거시/비노출 페이지도 남아 있다.

- tomorrow
- next7
- tasks
- board
- calendar
- matrix
- dashboard
- habits
- focus

이 비노출 페이지들은 일부 `renderPage()` 분기나 컴포넌트로 남아 있으나, 현재 사용자 내비게이션의 중심은 위 7개 페이지다. 새로 구현할 때는 MVP 페이지 7개를 우선 재현하고, 비노출 페이지는 호환성을 위해 타입/컴포넌트만 유지하는 방식이 현재 결과물과 가장 가깝다.

## 5. 전역 상태와 데이터 저장

상태 관리는 `usePlannerData()` 훅 하나가 중심이다.

앱 데이터는 `PlannerData` 형태로 관리된다.

- `tasks`
- `projects`
- `subtasks`
- `studyTopics`
- `conceptNotes`
- `habits`
- `habitLogs`
- `focusSessions`
- `taskTemplates`
- `recentItems`
- `settings`
- `appSettings`

### 5.1 localStorage

현재 기본 저장 키:

- `focusflow.appData.v1`

레거시 마이그레이션 키:

- `todo-planner-data`

앱 시작 시 동작:

1. `focusflow.appData.v1`을 읽는다.
2. JSON 파싱과 normalize에 성공하면 사용한다.
3. 실패하면 샘플 데이터로 fallback한다.
4. 새 키가 없으면 레거시 키를 읽어 normalize한다.
5. 레거시 키도 없으면 `sampleData`를 사용한다.

데이터 변경 시 `useEffect`로 전체 `PlannerData`를 localStorage에 저장한다.

### 5.2 Supabase

환경변수:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

둘 다 있을 때만 Supabase client가 생성된다. 없으면 `LocalStorage mode`로 동작한다.

Supabase 테이블은 다음과 같다.

- `tasks`
- `projects`
- `subtasks`
- `habits`
- `habit_logs`
- `focus_sessions`
- `task_templates`
- `settings`

각 테이블은 `id`, `user_id`, `data jsonb`, `created_at`, `updated_at`을 갖는다. RLS가 켜져 있고 `auth.uid() = user_id` 기준으로 select/insert/update/delete 정책이 있다.

중요한 현재 상태:

- Supabase 동기화 대상에 `studyTopics`, `conceptNotes`, `recentItems`, `appSettings`는 포함되어 있지 않다.
- `settings` 테이블에는 `PlannerSettings`만 저장된다.
- 앱의 실제 appearance/behavior 설정인 `appSettings`는 localStorage에는 저장되지만 Supabase 저장 루프에는 별도 upsert되지 않는다.

## 6. 데이터 모델

### 6.1 Task

작업의 주요 필드:

- `id`
- `title`
- `description`
- `status`
- `priority`
- `dueDate`
- `scheduledDate`
- `startTime`
- `endTime`
- `projectId`
- `parentTaskId`
- `tags`
- `notes`
- `importance`
- `urgency`
- `isFocus`
- `isSomeday`
- `waitingReason`
- `waitingFollowUpDate`
- `order`
- `createdAt`
- `updatedAt`
- `completedAt`
- `archivedAt`
- `deletedAt`
- `previousStatus`
- `blockedByTaskId`
- `repeatType`
- `repeatInterval`
- `repeatDays`
- `repeatEndDate`

Canonical status는 다음 6개다.

- `inbox`
- `todo`
- `doing`
- `waiting`
- `done`
- `archived`

레거시 호환 status:

- `in_progress`
- `blocked`

normalize 시 `in_progress`는 `doing`, `blocked`는 `waiting`으로 마이그레이션된다. 단, `TaskDetail`의 status select에는 아직 `in_progress`, `blocked`가 남아 있으므로 이 부분은 현재 결과물의 불일치 지점이다.

### 6.2 Task 날짜 의미

날짜는 빈 문자열 `""`을 미설정 값으로 사용한다.

- `dueDate`: 마감일
- `scheduledDate`: 작업하기로 계획한 날짜
- `completedAt`: 완료 시각 ISO string
- `archivedAt`: 아카이브 시각 ISO string

Snooze는 `dueDate`를 바꾸지 않고 `scheduledDate`만 내일로 옮긴다.

### 6.3 Project

프로젝트 주요 필드:

- `id`
- `name`
- `description`
- `color`
- `type`: `project` 또는 `area`
- `icon`
- `dueDate`
- `pinned`
- `order`
- `status`: `active`, `paused`, `completed`, `archived`
- `archivedAt`
- `createdAt`
- `updatedAt`

프로젝트 삭제 시 프로젝트만 삭제되고, 연결된 task의 `projectId`는 빈 문자열로 바뀌어 Inbox 성격이 된다.

### 6.4 Subtask

- `id`
- `taskId`
- `title`
- `completed`
- `createdAt`
- `updatedAt`

task 삭제 시 해당 task의 subtask도 삭제된다.

### 6.5 StudyTopic

- `id`
- `name`
- `category`
- `description`
- `status`
- `color`
- `icon`
- `order`
- `createdAt`
- `updatedAt`
- `archivedAt`

category:

- Python
- LeetCode
- Research
- fNIRS
- English
- Presentation
- Other

### 6.6 ConceptNote

학습 노트 주요 필드:

- `id`
- `topicId`
- `title`
- `noteType`
- `summary`
- `content`
- `examples`
- `personalExplanation`
- `confusionPoint`
- `difficulty`
- `reviewStatus`
- `nextReviewDate`
- `lastReviewedAt`
- `reviewHistory`
- `leetcode`
- `research`
- `english`
- `source`
- `tags`
- `order`
- `createdAt`
- `updatedAt`
- `deletedAt`

noteType:

- `concept`
- `leetcode`
- `research`
- `english`
- `presentation`
- `other`

difficulty:

- `unknown`
- `hard`
- `medium`
- `easy`

stored reviewStatus:

- `not_scheduled`
- `reviewed`
- `mastered`

computed reviewStatus:

- `not_scheduled`
- `due`
- `upcoming`
- `reviewed`
- `mastered`

실제 UI의 review queue는 computed status를 사용한다.

## 7. 공통 컴포넌트 명세

### 7.1 Sidebar

사이드바 구성:

1. 브랜드 영역
   - `brand-mark`: F
   - 텍스트: FocusFlow
2. 프로필 영역
   - avatar: 로그인 email 첫 글자, 없으면 `Junghoon`의 J
   - name: 로그인 email 또는 `Junghoon`
   - gear 버튼: Settings로 이동
3. 전역 검색
   - placeholder: `Search /`
4. Primary nav
   - Inbox
   - Today
   - Projects
   - Planning
   - Study
5. Project Shortcuts 접이식 섹션
   - 프로젝트 목록
   - 각 프로젝트별 미완료 task count
   - `+ Add Project` 입력 폼
6. Secondary nav
   - Archive
   - Settings

카운트 규칙:

- Inbox: `status === "inbox"` task 수
- Today: Today bucket 중 waiting, inProgress, overdue, focus, dueToday, scheduledToday 합계
- Projects: archived가 아닌 project 수
- Study: due review 수
- Settings/Archive/Planning: count 0

`showSidebarCounts` 설정이 false면 count badge를 숨긴다.

### 7.2 Global Search

검색 입력은 `/` 키로 focus된다.

검색 대상:

- task: `title`, `description`, `notes`, `tags`
- project: `name`, `description`
- habit: `name`, `description`

결과 표시:

- tasks 최대 6개
- projects 최대 4개
- habits 최대 4개

결과 클릭 동작:

- task: 해당 task 선택, `tasks` 페이지로 이동, 검색어 clear
- project: 프로젝트 detail 열고 Projects 페이지로 이동, 검색어 clear
- habit: Habits 페이지로 이동, 검색어 clear

주의: Habits와 Tasks 페이지는 사이드바에서 숨겨져 있으나 검색 결과 클릭으로 `activePage`가 해당 값이 될 수 있다.

### 7.3 Keyboard Shortcuts

전역 키보드:

- `Escape`: 선택된 task 해제, 검색어 clear
- `/`: 검색 입력 focus
- `t`: Today로 이동
- `i`: Inbox로 이동
- `n`: Inbox로 이동 후 task title 입력 focus 시도

입력 중에는 `/`, `t`, `i`, `n` shortcut이 동작하지 않는다. `Escape`는 입력 중에도 선택 해제와 검색 clear를 수행한다.

### 7.4 TaskRow

TaskRow는 여러 페이지에서 공통으로 쓰인다.

구성:

- 왼쪽 완료 체크 버튼
- task title
- subtask progress 텍스트: `done/total`
- project badge
- due/scheduled date pill
- priority badge
- optional right slot
- optional more menu

동작:

- row 클릭: task open/select
- Enter 또는 Space: task open/select
- check 클릭: done toggle
- project badge 클릭: project popover
- date pill 클릭: date picker popover
- priority badge 클릭: priority popover
- more menu 클릭: page별 액션

완료 상태:

- `status === "done"`이면 row에 `is-done`
- 체크 버튼은 checked
- title은 CSS에서 취소선 처리

### 7.5 Modal/Confirm/Toast

Modal:

- fixed backdrop
- Escape 또는 바깥 클릭으로 닫힘
- `wide` 옵션이 있으면 최대 폭 720px
- header에 close icon button

ConfirmModal:

- Cancel
- Confirm button
- danger=true면 danger style

Toast:

- 화면 하단 중앙
- message
- optional action button
- App의 toast는 4.5초 후 자동으로 사라진다.

## 8. Today 페이지

Today는 하루 실행 화면이다. 경로 개념상 `/today`이며 앱 기본 진입 페이지다.

### 8.1 헤더

표시 요소:

- 제목: Today
- 날짜: `getDayLabel(today)`
- 설명: Focus on what matters today.
- 버튼: Start Day
- 버튼: Add Task
- more icon button

현재 두 버튼 모두 `StartDayModal`을 연다.

### 8.2 Today Buckets

`getTodayBuckets(tasks, today)`가 task를 순서대로 하나의 bucket에만 넣는다.

분류 우선순위:

1. `completedAt` 날짜가 today면 `doneToday`
2. `status === "done"` 또는 `status === "archived"`면 제외
3. `status === "waiting"`이면 `waiting`
4. `status === "doing"`이면 `inProgress`
5. `dueDate < today`이면 `overdue`
6. `isFocus === true`이면 `focus`
7. `dueDate === today`이면 `dueToday`
8. `scheduledDate === today`이면 `scheduledToday`

이 순서가 중요하다. 예를 들어 overdue task이면서 focus인 경우 Overdue가 먼저 잡힌다.

### 8.3 섹션 구성

Today는 카드형 접이식 섹션을 세로로 보여준다.

1. Focus
   - tone: purple
   - icon: target
   - empty: Pick one high-priority task for today.
   - inline add: `status: todo`, `isFocus: true`, `scheduledDate: today`
   - more actions:
     - Start Focus: status를 `doing`으로 변경, task open, toast
     - Remove from Focus
     - Move to Waiting
2. Due Today
   - tone: warning
   - inline add: `status: todo`, `dueDate: today`
   - more actions:
     - Snooze to tomorrow
     - Move to Focus
     - Move to Waiting
3. Scheduled Today
   - tone: accent
   - inline add: `status: todo`, `scheduledDate: today`
   - date pill은 scheduledDate 중심
4. In Progress
   - tone: success
   - inline add: `status: doing`, `scheduledDate: today`
   - more actions:
     - Pause (To Do)
     - Move to Waiting
5. Waiting
   - tone: purple
   - inline add 없음
   - waitingReason이 있으면 meta에 표시
   - more actions:
     - Resume (To Do)
     - Resume (Doing)
6. Overdue
   - overdue가 있을 때만 표시
   - tone: danger
   - more actions:
     - Move to Today: `dueDate = today`
     - Snooze to tomorrow
7. Done Today
   - setting `showCompletedInToday`이 true일 때만 표시
   - Clear 버튼은 삭제가 아니라 로컬 UI에서 숨김 처리

### 8.4 Start Day Modal

열리는 조건:

- 헤더 `Start Day`
- 헤더 `+ Add Task`

구성:

- `Add a focus task for today` 입력
- Enter 입력 시 `status: todo`, `isFocus: true`, `scheduledDate: today` task 생성
- dueToday + scheduledToday 중 최대 6개 후보 표시
- 후보의 `Focus` 버튼을 누르면 `isFocus: true`
- footer: `Let's go`

### 8.5 Waiting Modal

열리는 조건:

- task more menu에서 Move to Waiting

입력:

- Waiting reason
- Follow-up date

저장 시:

- status를 `waiting`으로 변경
- `waitingReason`, `waitingFollowUpDate` 저장
- toast: Moved to Waiting

### 8.6 End Day Review Modal

more icon button에서 열린다.

내용:

- 오늘 완료한 task 수
- waiting task 수
- overdue task 수

현재는 리뷰 요약만 보여주고 추가 저장 동작은 없다.

## 9. Inbox 페이지

Inbox는 빠른 캡처와 정리 화면이다.

### 9.1 헤더

- 제목: Inbox
- 설명: Capture tasks quickly. Organize them when you are ready.
- `+ Add Task`: QuickAdd input focus
- more icon: Clean Up modal open

### 9.2 Quick Add Bar

구성:

- task title input
- Today chip
- Project chip + popover
- PriorityBadge
- Add button

동작:

- title이 비어 있으면 error 표시: Task title is required
- Enter 또는 Add 클릭으로 생성
- 생성 draft:
  - `title`
  - `status: inbox`
  - Today chip 활성화 시 `scheduledDate: today`
  - 선택한 projectId
  - 선택한 priority
- 생성 후 입력값 초기화
- toast: Added to Inbox
- toast action: Edit, 해당 task open

### 9.3 Needs Attention

Inbox task 중 정리가 필요한 항목을 3개 카드로 보여준다.

카드:

- Needs Date: `!dueDate && !scheduledDate`
- Needs Project: `!projectId`
- Needs Priority: `priority === "none"`

카드 클릭 시 해당 필터가 켜지고, 다시 클릭하면 all로 돌아간다.

### 9.4 Unsorted Tasks

현재 필터에 맞는 Inbox task 목록이다.

필터:

- all
- date
- project
- priority

행 액션:

- Edit
- Duplicate
- Archive
- Delete

rightSlot에는 Inbox 위치 표시가 붙는다.

### 9.5 Recently Added

archived가 아닌 전체 task를 `createdAt` 내림차순으로 정렬해 4개까지 보여준다.

metaSlot에는 상대 시간:

- just now
- Xm ago
- Xh ago
- Xd ago

### 9.6 Clean Up Flow

정리 대상:

- Inbox task 중 project가 없거나
- dueDate/scheduledDate가 없거나
- priority가 none인 task

모달 구성:

- 진행률: `index + 1 of tasks.length`
- 현재 task title/description 카드
- Project select
- Date input
- Priority select
- Status select
- Skip 버튼
- Save & Next 또는 Save & Done 버튼

저장 시 변경:

- `projectId`
- `scheduledDate`
- `priority`
- status가 inbox면 `todo`로 변경

dirty 상태에서 닫으려 하면 `Discard unsaved changes?` confirm이 뜬다.

## 10. Projects 페이지

Projects는 프로젝트 목록과 프로젝트 상세를 한 컴포넌트에서 처리한다.

### 10.1 목록 화면

헤더:

- 제목: Projects
- 설명: Organize tasks by goals, research, study, and personal areas.
- `+ New Project`

탭:

- Active
- Archived

프로젝트 카드 구성:

- 아이콘: type이 area면 area symbol, 아니면 folder symbol
- 이름
- type + task count
- pin/star 버튼
- more menu
- description
- progress bar
- due date 또는 No due date
- completed/total done

카드 클릭:

- 프로젝트 상세 화면으로 전환

more menu:

- Active view:
  - Archive
  - Delete
- Archived view:
  - Restore
  - Delete

### 10.2 New/Edit Project Modal

입력:

- Name
- Description
- Type: project/area
- Due date
- Color swatch

validation:

- name이 비어 있으면 `Project name is required.`

생성 후:

- toast: Project created
- action: Open

색상 후보:

- `#007aff`
- `#af52de`
- `#34c759`
- `#ff9500`
- `#ff2d55`
- `#8e8e93`

### 10.3 프로젝트 상세 레이아웃

상세 화면은 2열이다.

- 좌측: 프로젝트 상세 메인
- 우측: selectedTaskId가 있으면 TaskDetail, 없으면 ProjectInfoPanel

상단:

- Back: Projects
- 프로젝트 이름
- pin/star
- type, due date
- Edit 버튼
- More menu: Archive Project, Delete Project

탭:

- Overview
- Tasks
- Subtasks
- Notes

### 10.4 Overview 탭

카드:

1. Progress
   - percent
   - progress bar
   - completed/total
2. Priority Summary
   - High
   - Medium
   - Low
   - 클릭 시 Tasks 탭으로 이동하고 해당 priority filter 적용
3. Status Summary
   - To Do
   - In Progress
   - Waiting
   - Done
4. Recent Tasks
   - 최대 5개 task
   - 클릭 시 task open
   - View all 클릭 시 Tasks 탭

### 10.5 Tasks 탭

구성:

- priority filter chips: All, high, medium, low
- inline add input: `+ Add task to this project`
- task list

inline add는 `status: todo`, `projectId: current project.id`로 task를 만든다.

TaskRow는 `dateField="both"`로 dueDate와 scheduledDate를 표시한다.

### 10.6 Subtasks 탭

현재 프로젝트에 속한 task들의 subtask를 모두 모아 보여준다.

각 row:

- check 표시
- subtask title
- parent task title

여기서는 subtask toggle 동작 없이 읽기 중심으로 표시된다.

### 10.7 Notes 탭

프로젝트 노트는 현재 `App.tsx`의 `projectNotes` 로컬 state에 저장된다.

중요:

- `projectNotes`는 `localStorage`나 Supabase에 저장되지 않는다.
- 새로고침하면 현재 구현상 사라질 수 있다.
- notes 기본값은 `project.description`이다.

동작:

- Edit 클릭: textarea 표시
- Save 클릭: `projectNotes[project.id] = draftNotes`
- Cancel 클릭: 기존 notes로 되돌림

### 10.8 ProjectInfoPanel

우측 패널에는 다음 정보가 표시된다.

- Type
- Due Date
- Tasks
- Completed
- Progress
- Status
- Archive Project
- Delete Project

## 11. Planning 페이지

Planning은 task 상태와 중요도/긴급도를 조정하는 화면이다.

### 11.1 헤더와 탭

헤더:

- 제목: Planning
- 설명: Prioritize, schedule, and keep work moving.

탭:

- Board
- Matrix

상태는 `App.tsx`의 `planningTab`에 저장된다.

### 11.2 Board View

컬럼:

- Inbox
- To Do
- Doing
- Waiting
- Done

대상 task:

- `isActiveTask(task)` 기준
- 즉 `status !== archived && !deletedAt`

각 컬럼:

- label
- count
- task cards
- `+ Add Task`

drag & drop:

- 카드 drag start 시 `dataTransfer`에 `text/task = task.id`
- 컬럼 drop 시 해당 task의 status를 컬럼 status로 변경

inline add:

- 컬럼별 status로 task 생성

BoardCard 구성:

- title
- more menu
- project badge
- priority badge
- due date 월일 표시

more menu:

- 다른 컬럼으로 Move 액션들

### 11.3 Matrix View

4분면:

- Do Now: importance high, urgency high
- Schedule: importance high, urgency low
- Quick Handle: importance low, urgency high
- Later: importance low, urgency low

대상:

- active task 중 `status !== done`

drop:

- task의 `importance`, `urgency`를 해당 quadrant 값으로 변경

inline add:

- `status: todo`
- 해당 quadrant의 importance/urgency 값으로 생성

more menu:

- 다른 quadrant로 Move 액션

## 12. Study 페이지

Study는 토픽, 개념 노트, 복습 큐를 관리한다.

### 12.1 헤더와 탭

헤더:

- 제목: Study
- 설명: Track topics, concept notes, and spaced reviews.
- due review가 있으면 badge button 표시
- `+ New Topic`
- `+ New Note`

탭:

- Topics
- Notes
- Reviews

상태는 `App.tsx`의 `studyTab`에 저장된다.

### 12.2 Topics 탭

상단 metrics:

- Total Topics
- Concept Notes
- Due Reviews
- Study Streak

metric 클릭:

- Total Topics: topics 탭
- Concept Notes: notes 탭
- Due Reviews: reviews 탭
- Study Streak: 클릭 없음

Topic card:

- color dot
- name
- more menu: Delete topic
- category
- description
- note count
- due count 또는 Up to date

card 클릭:

- topic filter를 해당 topic으로 설정
- Notes 탭으로 이동

topic 삭제:

- topic 목록에서 제거
- 해당 topicId를 가진 note는 topicId가 빈 문자열로 바뀜

### 12.3 Topic Modal

입력:

- Topic name
- Category
- Color
- Description

기본 category는 `LeetCode`.

validation:

- name이 비면 `Topic name is required.`

저장:

- createTopic
- toast: Topic created

### 12.4 Notes 탭

필터:

- All Topics
- 각 topic

Note card:

- title
- more menu
  - Edit
  - Mark as mastered
  - Delete
- summary
- topic badge
- difficulty badge
- review status badge

review status badge:

- due: Due
- upcoming: nextReviewDate formatted
- mastered: Mastered
- not scheduled: Not scheduled

card 클릭:

- NoteDetail modal open

### 12.5 Note Editor

생성/수정 공통 모달이다.

입력:

- Title
- Topic
- Note type
- Summary
- Explanation / content
- Examples
- My explanation
- Difficulty
- Next review

type-specific field:

- leetcode:
  - Pattern
  - Related problems, one per line
- research:
  - Paper source
- english/presentation:
  - Expression

validation:

- title이 비면 `Note title is required.`

저장:

- create mode: createNote
- edit mode: updateNote
- toast: Note saved

현재 createNote 구현상 `nextReviewDate`가 있으면 stored `reviewStatus`는 `reviewed`가 된다. UI에서는 nextReviewDate가 오늘 이하이면 computed status가 due로 계산된다.

### 12.6 Note Detail

wide modal.

표시:

- title
- topic name
- difficulty
- noteType
- next review date
- summary
- content
- examples
- personalExplanation
- confusionPoint
- related problems
- review history 최신 5개

footer:

- Edit
- Review Now

Review Now는 현재 `medium`으로 리뷰 처리한다.

### 12.7 Reviews 탭

queue:

- Due
- Upcoming
- Mastered

Due 섹션만 리뷰 액션을 보여준다.

리뷰 액션:

- Hard
- Medium
- Easy
- Mastered

review interval:

- hard: 오늘 + 1일
- medium: 오늘 + 3일
- easy: 오늘 + 7일
- mastered: nextReviewDate 비움, reviewStatus mastered

리뷰 처리 시:

- `lastReviewedAt = now`
- `reviewHistory`에 기록 추가
- difficulty 업데이트
- reviewStatus 업데이트
- nextReviewDate 업데이트

Study streak:

- reviewHistory와 lastReviewedAt 날짜를 모아서 계산
- 오늘 기록이 없으면 어제부터 시작할 수 있음
- 연속 날짜 수를 반환

## 13. Archive 페이지

Archive는 숨긴 task/project를 복원하거나 영구 삭제하는 화면이다.

### 13.1 헤더와 탭

헤더:

- 제목: Archive
- 설명: Items here are hidden from your main views. Restore or permanently delete them.

탭:

- Tasks
- Projects

### 13.2 Archived Tasks

조건:

- `task.status === "archived" || task.archivedAt`

테이블 컬럼:

- Task
- Project
- Archived
- actions

액션:

- Restore: previousStatus가 있으면 그 상태로, 없으면 todo로 복원
- Delete: 삭제 확인 설정에 따라 confirm 후 삭제

task title 클릭:

- task select/open

### 13.3 Archived Projects

조건:

- `project.status === "archived"`

카드:

- icon
- name
- Archived + task count
- description
- Restore
- Delete

Restore:

- status active
- archivedAt empty

Delete:

- 프로젝트 삭제
- 연결 task의 projectId는 빈 문자열

## 14. Settings 페이지

Settings는 appearance, behavior, data 세 탭으로 구성된다.

### 14.1 Appearance

Theme:

- Light
- Dark
- System

Accent Color:

- blue
- purple
- green
- orange
- pink

Font Size:

- small
- medium
- large

설정 변경 시 `document.documentElement.dataset`에 다음 값이 반영된다.

- `data-theme`
- `data-accent`
- `data-font`
- `data-reduce-motion`

System theme는 `prefers-color-scheme: dark`를 즉시 읽어 dark/light 중 하나로 반영한다.

### 14.2 Behavior

설정:

- Default Start Page: `/today` 또는 `/inbox`
- Show Completed Tasks
- Confirm Before Delete
- Show Sidebar Counts
- Reduce Motion

중요:

- `defaultView` 설정은 저장되지만 현재 `App.tsx`의 초기 `activePage`는 항상 `"today"`로 시작한다.
- 따라서 default start page 설정은 현재 결과물에서 UI만 있고 실제 초기 진입 페이지에 반영되지 않는다.

### 14.3 Data

기능:

- Export JSON
- Import JSON
- Load Samples
- Reset All Data
- Account section

Export:

- `planner.exportData()`를 JSON으로 stringify
- 파일명: `todo-planner-backup-${today}.json`

Import:

- JSON 파일 선택
- parse 성공 후 normalize/import
- 성공 메시지: Import complete.
- 실패 메시지:
  - invalid file
  - invalid JSON

Load Samples:

- `sampleData`를 normalize해서 로드

Reset:

- `emptyData()`로 초기화
- studyTopics/conceptNotes는 빈 배열로 유지된다.

### 14.4 Account Section

Supabase 설정이 없으면:

- Supabase env vars are not configured. The app is using localStorage.
- 로그인/가입 버튼은 disabled

Supabase 설정이 있으면:

- email/password 입력
- Log in
- Sign up

로그인 상태:

- Signed in as email
- Refresh cloud data
- Log out

로컬 데이터 migration preview가 있으면:

- `N local items can be uploaded.`
- Upload local data

## 15. TaskDetail 패널

TaskDetail은 선택된 task를 편집하는 우측 상세 패널이다.

선택된 task가 없으면:

- 제목: Task Detail
- 문구: Select a task to review its details and planning fields.

선택된 task가 있으면 다음 섹션을 표시한다.

### 15.1 Header

- title input
- description textarea

변경 즉시 `updateTask` 호출.

### 15.2 Schedule

필드:

- Due date
- Start time
- End time
- Repeat
- Repeat interval
- Repeat end

Repeat가 none이 아닐 때 interval/end가 표시된다.

현재 TaskDetail에는 `scheduledDate` 편집 필드가 없다. scheduledDate는 Today/Inbox/TaskRow date pill 등에서 주로 다룬다.

### 15.3 Planning

필드:

- Status
- Priority
- List
- Importance
- Urgency
- Blocked by

Status select의 옵션은 현재 다음과 같다.

- todo
- in_progress
- waiting
- blocked
- done
- archived

주의: canonical status와 불일치한다. Planning/Today의 새 flow는 `doing`을 쓰지만 TaskDetail은 `in_progress`를 표시한다. 새 구현에서는 이 불일치를 그대로 재현할지, canonical로 정리할지 결정해야 한다.

Blocked by 선택:

- 다른 task를 선택하면 `blockedByTaskId` 저장
- status를 `blocked`로 변경
- 선택 해제 시 현재 status가 blocked면 todo로 변경

blocking task가 있으면 dependency note 표시:

- blocking task가 done이면 Clear block 버튼 표시

### 15.4 Subtasks

표시:

- completed/total
- progress bar
- percent
- Add subtask form
- subtask list

동작:

- Add: subtask 생성
- checkbox: toggle
- Delete: subtask 삭제

### 15.5 Notes

- notes textarea
- 변경 즉시 updateTask

### 15.6 Actions

- Duplicate
- Archive
- Delete

Archive는 task를 archived로 바꾸고 toast Undo를 제공한다.

## 16. Task Lifecycle

### 16.1 생성

`addTask(draft)`:

- title trim
- 비어 있으면 빈 문자열 반환
- id는 `task-${crypto.randomUUID()}`
- status 기본값은 `todo`
- normalizeTask 적용
- tasks 맨 앞에 추가
- selectedTaskId를 새 task로 설정

`createTask(draft, context?)`:

- 기본 status를 `inbox`로 둔다.
- context와 draft가 override 가능하다.

### 16.2 업데이트

`updateTask(taskId, patch)`:

- patch 적용
- status 변경 여부 계산
- status가 done이 되면 completedAt을 현재 시각으로 설정
- done에서 다른 status로 바뀌면 completedAt 비움
- archived가 되면 archivedAt 설정
- archived에서 다른 status로 바뀌면 archivedAt 비움
- previousStatus는 status 변경 시 이전 status로 저장
- updatedAt 현재 시각

### 16.3 완료 토글

`toggleTaskDone(taskId)`:

- done이면 todo로 되돌리고 completedAt 비움
- done이 아니면 done으로 바꾸고 completedAt 현재 시각

반복 task:

- done이 아니고 repeatType이 none이 아니면 완료 대신 next due date로 dueDate를 이동
- repeatEndDate가 있고 nextDueDate가 end를 넘으면 done 처리
- daily: interval일 뒤
- weekly: interval * 7일 뒤
- monthly: interval개월 뒤

### 16.4 Archive/Restore

Archive:

- previousStatus 저장
- status archived
- archivedAt 현재 시각
- selectedTaskId 비움

Restore:

- previousStatus가 있고 archived가 아니면 그 status
- 아니면 todo
- archivedAt 비움

### 16.5 Duplicate

Duplicate:

- 원본 복사
- 새 id
- title 뒤에 ` Copy`
- 원본이 done 또는 archived면 status는 todo
- completedAt, archivedAt 비움
- previousStatus todo
- subtasks도 복사하되 completed false
- 새 task 선택

### 16.6 Delete

Delete:

- task 배열에서 제거
- 해당 subtask 제거
- selectedTaskId 비움

`confirmBeforeDelete`가 true면 confirm modal을 거친다.

## 17. Project Lifecycle

### 17.1 생성

두 함수가 있다.

`addProject(name, color)`:

- Sidebar의 빠른 추가에서 사용
- name, color만 받음
- status active

`createProject(input)`:

- Projects modal에서 사용
- name, color, type, description, dueDate, icon 지원
- id 반환

### 17.2 업데이트

`updateProject(projectId, patch)`:

- patch 적용
- updatedAt 현재 시각

### 17.3 Pin

`toggleProjectPinned(projectId)`:

- pinned boolean 토글

현재 프로젝트 목록 정렬에 pinned 우선 정렬은 구현되어 있지 않고, 카드의 star 표시와 상태만 바뀐다.

### 17.4 Archive/Restore/Delete

Archive:

- status archived
- archivedAt 현재 시각

Restore:

- status active
- archivedAt empty

Delete:

- project 제거
- 연결된 task는 `projectId: ""`

## 18. Study Lifecycle

### 18.1 Topic

Create:

- name trim
- 비어 있으면 빈 문자열 반환
- category 기본 Other
- color 기본 `#007AFF`

Update:

- patch 적용
- updatedAt 현재 시각

Archive:

- status archived
- archivedAt 현재 시각

Delete:

- topic 제거
- 연결 note의 topicId 비움

### 18.2 Note

Create:

- title trim
- 비어 있으면 빈 문자열 반환
- normalizeConceptNote 적용
- nextReviewDate가 있으면 reviewStatus `reviewed`
- notes 맨 앞에 추가

Update:

- patch 적용
- updatedAt 현재 시각

Move:

- topicId 변경

Delete:

- 배열에서 제거

Schedule Review:

- nextReviewDate 저장
- nextReviewDate가 있으면 reviewed, 없으면 not_scheduled

Mark Reviewed:

- difficulty에 따라 다음 리뷰일 계산
- reviewHistory 추가
- lastReviewedAt 저장
- reviewStatus 업데이트

## 19. 디자인 시스템

현재 CSS는 Apple 느낌의 토큰과 FocusFlow 전용 `.ff-*` 컴포넌트 스타일이 섞여 있다.

### 19.1 기본 색상

주요 토큰:

- app background: `#f5f5f7`
- surface: `#ffffff`
- text primary: `#1d1d1f`
- text secondary: `#6e6e73`
- accent 기본: `#007aff`
- danger: `#ff3b30`
- warning: `#ff9500`
- success: `#34c759`
- purple: `#af52de`

Dark mode:

- app background: `#101012`
- surface: `#1c1c1e`
- muted surface: `#232325`
- text primary: `#f5f5f7`

### 19.2 Accent Theme

`data-accent` 값에 따라 `--accent`, `--accent-soft`가 바뀐다.

- blue
- purple
- green
- pink
- orange

### 19.3 Typography

기본 font stack:

- `-apple-system`
- `BlinkMacSystemFont`
- `SF Pro Text`
- `Inter`
- `system-ui`
- `Segoe UI`
- `sans-serif`

root 기본:

- font-size 17px
- line-height 1.44
- letter-spacing `-0.374px`

주의: 개발 지침상 새로 손볼 때는 negative letter-spacing을 피하는 편이 좋지만, 현재 결과물은 위 값을 사용한다.

### 19.4 Radius와 Shadow

주요 radius:

- small: 8px
- medium: 12px
- large: 16px
- xl: 22px
- pill: 9999px

shadow:

- card: 아주 약한 1px 계열
- raised: `0 6px 20px rgba(0,0,0,0.08)`
- panel: 우측 패널용

### 19.5 주요 UI 패턴

- `.ff-page`: 각 페이지 wrapper
- `.ff-page-head`: 페이지 헤더
- `.ff-btn`: 기본 버튼
- `.ff-btn-primary`: primary 버튼
- `.ff-btn-danger`: danger 버튼
- `.ff-segmented`: segmented tabs
- `.ff-task-row`: task row
- `.ff-badge`: badge
- `.ff-pill`: date pill
- `.ff-projbadge`: project badge
- `.ff-modal`: modal
- `.ff-toast`: toast
- `.ff-empty`: empty state

## 20. 샘플 데이터 기준 초기 화면

로컬 저장 데이터가 없으면 `sampleData`가 로드된다.

초기 프로젝트:

- fNIRS Thesis
- ITS Presentation
- Todo App Development
- LeetCode Study
- Personal

초기 task 구성:

- Inbox task 5개
- Focus today 1개
- Due today 2개
- Scheduled today 2개
- In progress 2개
- Waiting 1개
- Overdue 1개
- Done today 2개

초기 habit:

- Drink water
- Walk outside

초기 task template:

- Weekly review

Study seed는 별도 `defaultStudyTopics`, `defaultConceptNotes`에서 normalize된다. sampleData 자체에는 studyTopics/conceptNotes가 없기 때문에 normalize 시 기본 study seed가 들어간다.

## 21. 현재 구현상 주의해야 할 불일치/리스크

아래 항목은 버그라기보다 “현재 결과물의 실제 상태”다. 재구현하거나 다음 개발을 할 때 반드시 의식해야 한다.

### 21.1 Canonical status와 일부 UI 불일치

타입과 normalize는 `doing`을 canonical in-progress 상태로 사용한다. 그러나 `TaskDetail` status select는 `in_progress`, `blocked`를 아직 노출한다.

결과:

- Today/Planning은 `doing` 기준으로 In Progress를 본다.
- TaskDetail에서 `in_progress`를 선택하면 normalize 전까지 일부 bucket에서 빠질 수 있다.

### 21.2 App.tsx 안에 레거시 study state가 남아 있음

`App.tsx`에는 로컬 `studyTopics`, `conceptNotes`, `studyModal` state가 남아 있으나, 현재 `StudyPage`에는 `planner.studyTopics`, `planner.conceptNotes`가 전달된다.

결과:

- 일부 레거시 modal 코드가 렌더 조건으로 남아 있지만 주요 Study 흐름은 새 `StudyPage`가 담당한다.
- 리팩터링 시 혼동 가능성이 높다.

### 21.3 Project Notes는 영속화되지 않음

`projectNotes`는 `App.tsx`의 local state다.

결과:

- 페이지 새로고침 시 사라질 수 있다.
- export/import/Supabase sync에 포함되지 않는다.

### 21.4 Settings defaultView가 초기 페이지에 반영되지 않음

`appSettings.defaultView`는 UI에서 변경 가능하지만 `activePage` 초기값은 항상 `"today"`다.

### 21.5 Supabase sync 범위가 PlannerData 전체와 다름

Supabase collectionTables는 task/project/subtask/habit/focus/template/settings만 포함한다.

결과:

- studyTopics/conceptNotes/recentItems/appSettings는 원격 동기화되지 않는다.

### 21.6 검색 결과가 숨겨진 페이지로 이동할 수 있음

task 검색 결과 선택 시 `activePage = "tasks"`, habit 선택 시 `activePage = "habits"`가 된다. 이 페이지들은 사이드바에 없지만 renderPage에는 일부 대응 분기가 남아 있다.

### 21.7 일부 텍스트가 인코딩 깨짐처럼 보임

소스에는 아이콘/문자 일부가 `â...`, `ð...` 형태로 보인다. 실제 렌더링에서도 깨져 보일 가능성이 있다. 새 구현에서는 아이콘 라이브러리나 정상 UTF-8 문자를 쓰는 것이 좋다.

## 22. 재구현 우선순위

현재 페이지를 이 문서만 보고 다시 만든다면 다음 순서가 가장 안전하다.

1. 데이터 타입과 normalize 함수 구현
2. localStorage read/write와 sampleData 로드
3. 공통 UI primitives 구현
   - Button
   - SegmentedTabs
   - Modal
   - ConfirmModal
   - Toast
   - Popover
   - Badge/Pill
   - TaskRow
4. App shell과 Sidebar 구현
5. Inbox 구현
6. Today 구현
7. TaskDetail 구현
8. Projects 목록/상세 구현
9. Planning board/matrix 구현
10. Study topics/notes/reviews 구현
11. Archive 구현
12. Settings + export/import 구현
13. Supabase sync 구현

## 23. 페이지별 최소 수용 기준

### Inbox

- task를 빠르게 추가할 수 있어야 한다.
- title validation이 있어야 한다.
- Needs Date/Project/Priority count와 필터가 맞아야 한다.
- Clean Up flow가 task를 하나씩 정리해야 한다.

### Today

- bucket 분류 순서가 정확해야 한다.
- 각 섹션에서 inline add가 올바른 draft를 만들어야 한다.
- Waiting/Start Day/End Day modal이 있어야 한다.
- Snooze는 scheduledDate만 바꿔야 한다.

### Projects

- active/archived 탭이 있어야 한다.
- 프로젝트 생성/수정/삭제/아카이브/복원이 가능해야 한다.
- 상세 탭 4개가 있어야 한다.
- Overview의 progress/summary가 task 상태와 동기화되어야 한다.

### Planning

- Board에서 drag & drop으로 status가 바뀌어야 한다.
- Matrix에서 drag & drop으로 importance/urgency가 바뀌어야 한다.
- 각 칸에서 inline task 생성이 가능해야 한다.

### Study

- topic 생성/삭제가 가능해야 한다.
- note 생성/수정/삭제가 가능해야 한다.
- due/upcoming/mastered review queue가 계산되어야 한다.
- hard/medium/easy/mastered 리뷰 처리와 다음 복습일 계산이 되어야 한다.

### Archive

- archived task와 project가 분리 표시되어야 한다.
- restore/delete가 가능해야 한다.

### Settings

- theme/accent/font/reduce motion이 root dataset에 반영되어야 한다.
- export/import/load samples/reset이 가능해야 한다.
- Supabase 미설정/설정/로그인 상태를 구분해야 한다.

## 24. 구현 파일 지도

주요 파일:

- `src/App.tsx`: 앱 조립, 라우팅 상태, 전역 검색, toast/delete modal, page render
- `src/hooks/usePlannerData.ts`: 데이터 normalize, localStorage, Supabase sync, 모든 CRUD
- `src/types.ts`: 데이터 타입
- `src/utils/date.ts`: 날짜 유틸
- `src/utils/planner.ts`: bucket, project summary, study review queue
- `src/components/Sidebar.tsx`: 사이드바
- `src/components/kit.tsx`: 공통 UI primitive
- `src/components/TodayPage.tsx`: Today flow
- `src/components/InboxPage.tsx`: Inbox capture/cleanup
- `src/components/ProjectsPage.tsx`: Projects list/detail
- `src/components/PlanningPage.tsx`: board/matrix
- `src/components/StudyPage.tsx`: study topics/notes/reviews
- `src/components/ArchivePage.tsx`: archive
- `src/components/SettingsPage.tsx`: settings
- `src/components/TaskDetail.tsx`: task detail side panel
- `src/data/sampleData.ts`: demo data
- `src/data/studySeed.ts`: default study data
- `src/services/supabaseClient.ts`: Supabase client
- `supabase/migrations/001_initial_schema.sql`: database schema/RLS
- `src/styles.css`: 전체 스타일

## 25. 결론

현재 결과물은 “할 일 캡처 -> 오늘 실행 -> 프로젝트/계획 정리 -> 학습 복습 -> 보관/설정”까지 연결된 상당히 넓은 MVP다. 핵심 사용자 경험은 Today, Inbox, Projects, Planning, Study 다섯 화면에 집중되어 있고, Archive와 Settings가 보조한다.

다만 코드에는 이전 설계의 흔적이 남아 있어 status 체계, 숨겨진 페이지, project notes 영속화, Supabase sync 범위, 깨진 아이콘 문자열 같은 정리 포인트가 있다. 새로 페이지를 만들거나 리팩터링할 때는 이 문서의 “현재 구현상 주의해야 할 불일치/리스크”를 먼저 처리하면 이후 기능 확장이 훨씬 안정적이다.
