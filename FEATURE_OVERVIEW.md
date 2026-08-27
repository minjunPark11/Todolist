# FocusFlow 전체 기능 & 플로우 문서

> 📌 이 문서는 과거 커밋 시점의 스냅샷입니다. 여기 적힌 AI/Ollama 관련 내용은
> 2026-08-27에 앱에서 모두 제거되었습니다 (`LOCAL_AI_REMOVAL_DESIGN.md`).

기준: 브랜치 `claude/ollama-local-setup-6enkbr` (커밋 `babbcd3 add ai` 시점)의 현재 코드.

이 문서는 지금 이 GitHub 저장소에 실제로 구현되어 있는 **모든 기능**이 어떤 파일에서, 어떤 흐름으로 동작하는지 하나씩 정리한다. `CURRENT_PRODUCT_SPEC.md`는 더 이전 커밋(`a554f80`) 기준의 "재구현용 명세서"이고, 이 문서는 **AI/Ollama, Calendar, Habits, Focus, Dashboard까지 포함한 현재 시점의 전체 그림**을 다룬다.

---

## 목차

1. [제품 개요 & 기술 스택](#1-제품-개요--기술-스택)
2. [전체 아키텍처](#2-전체-아키텍처)
3. [데이터 모델](#3-데이터-모델)
4. [데이터 저장 & 동기화 (localStorage ↔ Supabase)](#4-데이터-저장--동기화-localstorage--supabase)
5. [인증 흐름](#5-인증-흐름)
6. [앱 셸 & 전역 네비게이션](#6-앱-셸--전역-네비게이션)
7. [공통 UI 부품 (kit.tsx)](#7-공통-ui-부품-kittsx)
8. [페이지별 기능 상세](#8-페이지별-기능-상세)
   - 8.1 Inbox
   - 8.2 Today
   - 8.3 Projects
   - 8.4 Planning (Board + Matrix)
   - 8.5 Study
   - 8.6 Archive
   - 8.7 Settings
   - 8.8 Habits
   - 8.9 Focus
   - 8.10 Dashboard
   - 8.11 Calendar
9. [Personal AI (Ollama 기반 채팅 에이전트)](#9-personal-ai-ollama-기반-채팅-에이전트)
10. [유틸리티 함수](#10-유틸리티-함수)
11. [샘플/시드 데이터](#11-샘플시드-데이터)
12. [레거시 코드 & 숨겨진 기능](#12-레거시-코드--숨겨진-기능)
13. [관련 문서](#13-관련-문서)

---

## 1. 제품 개요 & 기술 스택

FocusFlow는 할 일 관리, 프로젝트 관리, 캘린더, 학습 노트(간격반복 복습), 습관 트래킹, 포모도로 타이머, 통계 대시보드, 그리고 로컬 LLM(Ollama) 기반 개인 AI 비서를 하나로 묶은 개인 생산성 SPA다.

- **프레임워크**: React 18 + TypeScript, Vite 번들러
- **스타일**: 단일 CSS 파일 `src/styles.css`
- **데이터 저장**: 기본은 브라우저 `localStorage`. `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`가 설정되면 계정 기반 Supabase 동기화가 추가로 활성화됨(선택 사항, 없어도 앱은 완전히 동작함)
- **AI**: 별도 백엔드 서버 없음. 브라우저가 사용자 PC에서 실행 중인 로컬 Ollama(`http://localhost:11434`)에 직접 fetch. `VITE_AI_SERVER_URL`(유료 서버용 provider)은 코드에 자리만 있고 실제로는 사용되지 않는 죽은 코드(`src/lib/ai/providers/serverProvider.ts`)
- **실행 명령**: `npm run dev`(Vite dev 서버, `127.0.0.1`), `npm run build`(tsc + vite build), `npm run typecheck`

---

## 2. 전체 아키텍처

```text
src/main.tsx
  -> src/App.tsx (최상위 상태/라우팅 컨테이너)
       -> usePlannerData()  ─┬─ localStorage 영구 저장
                              └─ (선택) Supabase 동기화
       -> Sidebar (좌측 네비게이션)
       -> renderPage() (activePage에 따라 페이지 컴포넌트 렌더)
       -> OllamaChat (전역 플로팅 AI 채팅 패널, 모든 페이지에서 항상 마운트)
       -> 전역 모달: 삭제 확인, Toast
```

핵심 설계: **모든 페이지 컴포넌트는 상태를 직접 소유하지 않는다.** 상태는 `usePlannerData` 훅 하나(`App.tsx`에서 호출)가 전부 소유하고, 각 페이지는 props로 데이터와 콜백(`onCreateTask`, `onUpdateTask` 등)만 받는 **완전히 controlled한 프레젠테이션 컴포넌트**다. 데이터 변경은 항상 `usePlannerData`가 반환하는 함수(`addTask`, `updateTask`, `createProject`, `markNoteReviewed` 등)를 거쳐서만 일어나며, 이 함수들이 `setData`로 React state를 바꾸면 `useEffect`가 자동으로 `localStorage`에 저장하고(항상), 로그인 상태면 700ms 디바운스 후 Supabase에도 저장한다.

AI 에이전트(Personal AI)가 앱 데이터를 바꾸는 경우도 예외가 아니다 — AI가 제안한 액션조차 결국 `App.tsx`의 `executeAgentActions`를 거쳐 동일한 `planner.createTask` 등의 함수를 호출한다. 즉 **데이터 변경 경로는 사용자가 직접 클릭하든 AI가 제안하든 단일 경로로 수렴**한다.

---

## 3. 데이터 모델

`src/types.ts`에 전체 타입이 정의되어 있다. 핵심 엔티티:

| 엔티티 | 설명 | 핵심 필드 |
|---|---|---|
| `Task` | 할 일 | `status`(inbox→todo→doing→waiting→done→archived), `priority`, `dueDate`(마감일), `scheduledDate`(작업 예정일 — 마감일과 별개), `startTime`/`endTime`, `projectId`, `importance`/`urgency`(아이젠하워 매트릭스용), `isFocus`, `waitingReason`, `blockedByTaskId`, `repeatType`(none/daily/weekly/monthly) |
| `Subtask` | 태스크 하위 체크리스트 | `taskId`, `completed` |
| `Project` | 프로젝트/영역 | `type`("project"\|"area"), `status`(active/paused/completed/archived), `pinned`, `color` |
| `StudyTopic` | 학습 주제 | `category`(Python/LeetCode/Research/fNIRS/English/Presentation/Other) |
| `ConceptNote` | 개념 노트 | `noteType`(concept/leetcode/research/english/presentation/other), `difficulty`, `reviewStatus`, `nextReviewDate`, `reviewHistory`, 타입별 확장 필드(`leetcode`/`research`/`english`) |
| `Habit` / `HabitLog` | 습관 / 일별 완료 기록 | `frequency`(daily/weekly) |
| `FocusSession` | 포모도로 세션 기록 | `mode`(focus/short_break/long_break), `durationMinutes` |
| `TaskTemplate` | 태스크 템플릿 | 저장된 태스크 형태를 재사용 |
| `AppSettings` | 앱 설정 | 테마, 색상, 폰트, 기본 시작 페이지 등 |

**주의(레거시 흔적)**: `TaskStatus`에는 `in_progress`, `blocked`가 legacy 값으로 남아있으며, 데이터 로드 시 `migrateStatus()`가 자동으로 `doing`/`waiting`으로 변환한다(하위호환용, 새 코드는 사용하지 않음).

`PageId`에는 사이드바에 실제로 노출되는 7개(inbox/today/projects/planning/study/archive/settings) 외에 코드에는 남아있지만 네비게이션에는 없는 8개 페이지(tomorrow/next7/tasks/board/**calendar**/matrix/dashboard/habits/focus)가 있다. 이 중 **calendar/habits/focus/dashboard는 실제로 접근 가능한 라우트이며 완전히 동작한다** — 단지 `Sidebar`의 기본 메뉴 목록에는 없을 뿐이다(§12 참조).

---

## 4. 데이터 저장 & 동기화 (localStorage ↔ Supabase)

`src/hooks/usePlannerData.ts` (파일 전체 ~1400줄, 앱의 진짜 "백엔드")

### 4.1 로컬 저장
- 저장 키: `localStorage["focusflow.appData.v1"]`
- 데이터가 바뀔 때마다(`useEffect([data])`) 전체 `PlannerData` 객체를 JSON으로 직렬화해 즉시 저장
- 레거시 키(`todo-planner-data`)에서의 1회성 마이그레이션 지원
- 저장된 데이터가 없으면 `sampleData.ts` + `studySeed.ts`로 초기화

### 4.2 Supabase 동기화 (선택)
1. `isSupabaseConfigured`(env var 존재 여부)가 true면 세션 확인 → 로그인되어 있으면 `userEmail` 세팅
2. 로그인되는 순간, 로컬에 있던 데이터가 있으면 `localMigrationData`에 보관(마이그레이션 후보로 UI에 노출: "N local items can be uploaded")
3. `loadSupabaseData()`: 테이블별로(`tasks`, `projects`, `subtasks`, `habits`→`habit_logs`, `focus_sessions`, `task_templates`, `settings`) `select("data")`로 전체 로드 후 `normalizeData`
4. 이후 데이터 변경은 700ms 디바운스 타이머(`syncTimerRef`)를 거쳐 `saveSupabaseData()` 호출 — 매 테이블마다 `upsert(rows, {onConflict: "id,user_id"})` 후, 로컬에 없는 id는 `delete().not("id","in",[...])`로 정리(로컬이 always source of truth)
5. 로그인 화면(`AccountSection`, Settings 페이지 하단)에서 "Upload local data" 버튼으로 수동 마이그레이션 실행 가능
6. Supabase가 설정되지 않았으면 이 모든 로직은 완전히 스킵되고 앱은 순수 localStorage 모드로 동작(`auth.mode === "localStorage"`)

---

## 5. 인증 흐름

`App.tsx`의 `AuthGate`(전체 화면 로그인/회원가입 폼)와 `AccountSection`(Settings 내부 계정 카드) 두 곳에서 동일한 `usePlannerData().auth` 상태와 `signIn`/`signUp`/`signOut`을 사용한다.

- **Supabase 미설정**: `auth.isConfigured === false` → `AuthGate`가 렌더링되지 않고 앱이 바로 열림(로그인 없이 로컬 전용 사용)
- **Supabase 설정 + 로그인 안 됨**: `App` 컴포넌트가 조건부로 `AuthGate` 화면만 렌더링(다른 페이지 접근 불가)
- **로그인/회원가입**: 이메일 + 비밀번호(6자 이상). 회원가입 시 이메일 인증이 필요하면(`needsEmailConfirmation`) "인증 메일을 확인하라"는 메시지 후 로그인 모드로 전환
- **에러 처리**: `formatAuthError()`가 Supabase 원본 에러 메시지를 사용자 친화적 문구로 변환(예: URL 오설정, 잘못된 로그인 정보)

---

## 6. 앱 셸 & 전역 네비게이션

`App.tsx` + `components/Sidebar.tsx`

- **키보드 단축키**(입력 필드에 포커스가 없을 때): `/` = 검색창 포커스, `t` = Today, `i` = Inbox, `n` = Inbox + 새 태스크 입력 포커스, `Esc` = 선택 해제 + 검색 초기화
- **전역 검색**(`SearchBox`): 태스크/프로젝트/스터디토픽/노트를 제목·설명·태그 기준으로 동시 검색, 결과 클릭 시 각 항목이 속한 정확한 페이지로 이동(`openTaskInOfficialPage` — 태스크의 상태/프로젝트에 따라 inbox/archive/projects/planning 중 알맞은 곳으로 라우팅)
- **테마 적용**: `appSettings.theme`(system/light/dark), `accentColor`, `fontSize`, `reduceMotion`을 `document.documentElement.dataset`에 반영 → CSS가 이를 읽어 스타일링
- **Toast**: 4.5초 후 자동 소멸, 선택적으로 "Undo" 액션 버튼 포함(예: 태스크 보관 후 "Undo"로 즉시 복원)
- **삭제 확인 모달**: `appSettings.confirmBeforeDelete`가 true면 삭제 요청 시 모달로 재확인, false면 즉시 삭제
- **모바일**: 햄버거 버튼으로 사이드바를 오버레이 형태로 토글

---

## 7. 공통 UI 부품 (kit.tsx)

`src/components/kit.tsx`는 Inbox/Today/Projects/Study/Archive/Settings 등 최신 디자인 시스템 페이지들이 공유하는 재사용 컴포넌트 모음이다.

- **`TaskRow`**: 리스트의 태스크 한 줄 — 체크박스, 제목, 서브태스크 진행률, `ProjectBadge`/`DueDatePill`/`PriorityBadge`(모두 클릭하면 팝오버가 열려 그 자리에서 즉시 값 변경), `MoreMenu`
- **`Popover`/`MoreMenu`/`useOutsideClose`**: 바깥 클릭·ESC로 닫히는 드롭다운 인프라
- **`EmptyState`/`SegmentedTabs`/`ConfirmModal`/`Toast`/`Modal`/`useAutoFocus`**: 빈 상태, 탭 전환, 삭제 확인, 토스트, 범용 모달, 모달 오픈 시 자동 포커스

---

## 8. 페이지별 기능 상세

### 8.1 Inbox — `components/InboxPage.tsx`

빠르게 캡처한 미분류 태스크(`status === "inbox"`)를 모아 정리하는 페이지.

- **QuickAddBar**: 제목 입력 + Enter, "Today" 칩(예정일=오늘 토글), 프로젝트 선택 칩, 우선순위 칩 → `onCreateTask({..., status:"inbox"})`
- **"Needs attention" 카드 3종**: 날짜 없음 / 프로젝트 없음 / 우선순위 없음 — 클릭 시 해당 필터로 리스트 좁힘
- **Clean Up Flow(모달 마법사)**: 정리가 필요한 태스크를 하나씩 순회하며 프로젝트/날짜/우선순위/상태를 지정. "Skip" 또는 "Save & Next"(저장 시 inbox 상태였다면 todo로 승격)
- **Recently Added**: 최근 생성된 항목 4개 + 상대 시간("Xm ago")

### 8.2 Today — `components/TodayPage.tsx`

`getTodayBuckets()`(utils/planner.ts) 로직으로 태스크를 아래 우선순위 순서로 **정확히 한 버킷에만** 분류한다: 오늘 완료 → Waiting → In Progress → Overdue → Focus → Due Today → Scheduled Today.

- 각 섹션은 접이식 카드이며 하단에 "+ Add task" 인라인 입력(섹션별 기본값이 다름 — Focus 섹션은 `isFocus:true`로 생성 등)
- 섹션별 `MoreMenu` 액션: Focus 승격/해제, "Start Focus"(status→doing), Snooze(예정일을 내일로, Undo 토스트 제공), Waiting으로 이동(사유+후속일 입력 모달), Overdue는 "Move to Today"
- **Start Day 모달**: 오늘의 포커스 태스크 빠른 추가 + Due/Scheduled Today 후보 중 최대 6개를 "★ Focus"로 즉시 승격
- **End Day Review 모달**: 오늘 완료/대기중/초과 개수를 읽기 전용으로 요약

### 8.3 Projects — `components/ProjectsPage.tsx`

목록(그리드) 뷰와 개별 프로젝트 상세(4탭) 뷰.

- **목록**: Active/Archived 탭, 카드마다 진행률 바, 고정(pin), `MoreMenu`(Archive/Delete 또는 Restore/Delete)
- **상세 — Overview 탭**: 진행률, 우선순위/상태별 카운트(클릭 시 Tasks 탭으로 필터 이동), 최근 태스크 5개
- **상세 — Tasks 탭**: 우선순위 필터 칩, 인라인 추가, `TaskRow` 리스트
- **상세 — Subtasks 탭**: 프로젝트 내 모든 서브태스크 평면 나열
- **상세 — Notes 탭**: 프로젝트 자유 메모 편집(Edit/Save/Cancel)
- 신규/수정: `ProjectFormModal`(이름/설명/타입[project|area]/마감일/색상 6종)

### 8.4 Planning — `components/PlanningPage.tsx` (Board + Matrix 탭)

사이드바 "Planning" 메뉴가 실제로 렌더링하는, 현재 사용 중인 계획 뷰. 대상 데이터는 archived/삭제 제외한 모든 활성 태스크(완료 포함).

- **Board 탭**: Inbox/To Do/Doing/Waiting/Done 5개 컬럼, 드래그앤드롭(HTML5 DnD, `dataTransfer`로 taskId 전달)으로 컬럼 이동 시 `onUpdateStatus`, 컬럼 하단 인라인 추가
- **Matrix 탭(아이젠하워 매트릭스)**: 중요도×긴급도 4분면(Do Now / Schedule / Quick Handle / Later), 드래그앤드롭으로 `importance`/`urgency` 값을 재설정하는 방식으로 분면 이동 구현, `MoreMenu`로도 이동 가능

### 8.5 Study — `components/StudyPage.tsx`

학습 주제 관리 + 개념노트 + **간격반복(spaced repetition) 복습 큐**.

- **Topics 탭**: 메트릭 카드 4개(Total Topics/Notes/Due Reviews/Study Streak), 토픽 카드 그리드(카테고리 7종: Python/LeetCode/Research/fNIRS/English/Presentation/Other)
- **Notes 탭**: 토픽 필터, 난이도/복습상태 배지, 노트타입별 조건부 입력 필드(LeetCode→패턴/시간복잡도, Research→논문 출처, English/Presentation→표현)
- **Reviews 탭**: Due(오늘 복습할 것)/Upcoming/Mastered 3섹션. Due 항목만 Hard/Medium/Easy/Mastered 4단계 평가 버튼 노출 → `markNoteReviewed(id, difficulty)`
- **복습 간격 알고리즘**(`usePlannerData.markNoteReviewed`): `REVIEW_INTERVALS = {hard:1, medium:3, easy:7, mastered:null}`일 뒤로 `nextReviewDate` 재계산, `reviewHistory`에 기록 추가
- **Study Streak**: 모든 노트의 리뷰 기록 날짜를 모아 오늘(또는 어제)부터 역산해 연속 복습일 수 계산(`computeStreak`, StudyPage 로컬 함수)

### 8.6 Archive — `components/ArchivePage.tsx`

`status === "archived"`인 태스크/프로젝트를 모아 복원(Restore)하거나 영구 삭제(Delete)하는 페이지. Tasks/Projects 탭 구분, 각 항목에 Restore/Delete 버튼.

### 8.7 Settings — `components/SettingsPage.tsx`

- **Appearance**: Theme(Light/Dark/System), Accent Color(5색), Font Size(3단계)
- **Behavior**: 기본 시작 페이지(Today/Inbox), Show Completed Tasks, Confirm Before Delete, Show Sidebar Counts, Reduce Motion(4개 토글)
- **Data**: Export JSON(전체 데이터 파일 다운로드), Import JSON, Load Samples(샘플 데이터로 리셋), Reset All Data(위험)
- 탭 하단에 `AccountSection`(Supabase 로그인/로그아웃/동기화 상태/로컬→클라우드 업로드) 삽입

### 8.8 Habits — `components/HabitsPage.tsx` *(사이드바 비노출, `/habits` 접근 가능)*

습관 생성(이름 + 빈도[daily/weekly]) 및 체크. 각 카드에 최근 7일 요일별 완료 점(과거 날짜도 클릭해 소급 토글 가능)과 **연속 기록(streak)**. `getHabitStreak()`는 오늘부터 거꾸로 연속 완료일을 세는 함수로, Dashboard에서도 재사용됨.

### 8.9 Focus — `components/FocusPage.tsx` *(사이드바 비노출, `/focus` 접근 가능)*

포모도로 타이머. Focus(25분)/Short Break(5분)/Long Break(15분) 모드, 태스크 연결 가능, 타이머가 0에 도달하면 자동으로 `FocusSession` 기록 생성(`addFocusSession`). 오늘의 세션 수/포커스 세션 수/포커스 총 분을 우측에 요약.

### 8.10 Dashboard — `components/DashboardView.tsx` *(사이드바 비노출, `/dashboard` 접근 가능)*

Overview/Tasks/Focus 3탭의 통계 대시보드. KPI 카드(완료/오픈/지연/완료율), SVG 라인 트렌드 차트(일/주/월 단위 전환), 상태별·우선순위별·프로젝트별 막대그래프, 습관 streak 막대그래프. 전부 읽기 전용 파생 통계이며 "Export" 버튼만 데이터 변경(사실은 내보내기이므로 읽기)에 관여.

### 8.11 Calendar — `components/CalendarView.tsx` *(사이드바 비노출, `/calendar` 접근 가능, 기능적으로는 가장 복잡한 페이지)*

Month/Week/Day 3개 뷰 모드를 가진 완전한 캘린더. 구조: 좌측 미니캘린더+필터 사이드바, 중앙 그리드(월/주), 우측 컨텍스트 패널(상황에 따라 새 태스크 폼 / 선택된 태스크 상세 / 오늘 요약+미배정 목록 중 하나만 표시).

**데이터 → 캘린더 아이템 변환**(`utils/calendarItems.ts`의 `buildCalendarItems`): 하나의 `Task`가 최대 2개의 별도 아이템으로 나타날 수 있다 — `scheduledDate`가 있으면 "작업 예정" 블록(드래그 가능), `dueDate`가 있으면 "마감" 마커(드래그 불가, 항상 종일). 이 외에 프로젝트 마감일, 학습 복습 예정일(`nextReviewDate`)도 각각 별도 레이어로 표시된다. 4개 레이어(Tasks/Deadlines/Study Reviews/Projects)와 완료 표시 여부, 프로젝트별 필터를 좌측 사이드바에서 켜고 끌 수 있다.

**주간 뷰의 드래그로 새 태스크 생성**: 빈 시간대를 포인터로 드래그하면(`WeekView.tsx`, 포인터 이벤트 기반, 30분 단위 스냅) 확정 전 `draft` 블록이 만들어지고, 우측 패널에 `NewTaskForm`이 나타나 제목/프로젝트/마감일을 입력해 실제 태스크로 생성한다. 짧은 클릭(이동거리 4px 이하)은 기본 1시간 블록으로 처리된다.

**드래그앤드롭으로 기존 태스크 이동**: 시간 그리드 드롭 시 `scheduledDate`+`startTime`+`endTime` 갱신, 종일 영역 드롭 시 시간 제거, 미배정(백로그) 영역으로 드롭하면 `scheduledDate`/시간을 모두 비워 "배정 취소". **마감일(dueDate) 마커는 절대 드래그할 수 없다** — 마감일은 캘린더에서 직접 바꾸지 못하게 하는 의도된 제약.

**빠른 생성**: 사이드바 "+Create" 버튼이나 종일 영역 클릭 시 `QuickCreatePopover` 모달(태스크 vs 마감일 타입 선택 가능).

---

## 9. Personal AI (Ollama 기반 채팅 에이전트)

화면 우하단에 항상 떠 있는 플로팅 채팅(`components/OllamaChat.tsx`)이며, 모든 페이지에서 접근 가능하다. **자체 서버 없이, 사용자 PC에서 실행 중인 로컬 Ollama에 브라우저가 직접 연결**한다(자세한 설정 방법은 `AI_OLLAMA_FEATURES.md` 및 이 대화의 이전 답변 참고).

### 9.1 전체 흐름

```text
사용자 메시지 입력
  -> detectAgentIntent()          [클라이언트에서 즉시 규칙기반 분류]
  -> (캘린더 페이지면) buildCalendarContextText()  [이번 주 스냅샷]
  -> buildAiContextText()         [intent에 맞는 앱 데이터만 골라 12000자 이내로 압축]
  -> runPersonalAgent()
       -> sendAiChat()  [gateway.ts: ollamaProvider -> remoteOllamaProvider 순서 시도]
       -> parseAgentActionBlock()  [응답 텍스트에서 ```agent_actions 블록 추출]
  -> validateAgentActions()       [실제 데이터와 대조해 2차 검증]
  -> AgentActionPreview 카드로 표시
  -> 사용자가 "Apply" 클릭 시에만 executeAgentActions() -> planner.createTask 등 실제 반영
```

### 9.2 Intent 분류 — `lib/ai/agent/intent.ts`

LLM 호출 없이 순수 키워드 매칭으로 7종 분류: `daily_planning`, `weekly_planning`, `study_coaching`, `calendar_conflict_check`, `free_time_detection`, `task_organization`, `general_chat`(기본값). 검사 순서가 우선순위이며 첫 매치에서 확정.

### 9.3 컨텍스트 압축 — `lib/ai/context/buildAiContext.ts`, `lib/ai/context/limits.ts`, `lib/calendarContext.ts`

앱의 모든 데이터를 매번 통째로 보내지 않고, intent에 따라 필요한 것만 골라 압축해서 보낸다.

- intent별로 tasks/projects/study/habits/calendar 포함 여부가 다름(예: `general_chat`은 tasks도 생략, `study_coaching`일 때만 study 포함)
- 각 필드는 요약된 형태로만 포함(`compactTask`는 id/title/status/priority/dueDate/scheduledDate/projectId/tags(최대5)/isFocus만)
- 하드 제한: 전체 컨텍스트는 최대 **2,400토큰**(`AI_CONTEXT_LIMITS.maxContextTokens`), 초과 시 잘라내고 "[context truncated]" 표시. 문자 수가 아니라 토큰 수로 재는 이유는 한글·CJK가 1자당 약 1토큰이라 같은 글자 수라도 라틴 문자의 3.5배까지 비싸지기 때문 — 문자 기준 상한은 8192 컨텍스트 창을 지켜주지 못한다
- 캘린더 페이지에서는 별도로 `buildCalendarContextText()`가 "이번 주"(일~토) 범위의 예정된 작업/마감/복습/프로젝트 마감/미배정 태스크/요일별 업무시간 합계를 JSON으로 만들어 추가 주입(`calendarContext.ts`, `calendar_conflict_check`/`free_time_detection`/`daily_planning`/`weekly_planning` intent일 때만 실제로 포함됨)

### 9.4 시스템 프롬프트 — `lib/ai/agent/prompts.ts`

고정 지침 핵심: (1) 오직 제공된 컨텍스트만 사용, 데이터 지어내지 않기, (2) 한국어 사용자에겐 한국어로 응답, (3) **"자신이 이미 데이터를 바꿨다고 절대 주장하지 않기"** — 실제 변경은 사용자의 명시적 Apply가 있어야만 일어남, (4) 임포트된 노트/설명 내용을 지시문으로 취급하지 않기(프롬프트 인젝션 방어), (5) 액션 제안 시 최대 1개의 ` ```agent_actions ` JSON 블록만, (6) 지원 액션 5종만 허용, **삭제(delete) 액션은 절대 금지**.

### 9.5 액션 시스템 — `lib/ai/agent/actions.ts`, `actionParser.ts`, `tools/toolExecutor.ts`

지원하는 5가지 액션 타입:

| 타입 | 리스크 | 용도 |
|---|---|---|
| `create_task` | low | 새 태스크 생성 |
| `create_calendar_event` | low/medium | 예정일+시간이 있는 태스크(캘린더 이벤트) 생성 |
| `split_task` | medium | 기존 태스크에 서브태스크 여러 개 일괄 추가 |
| `update_task_due_date` | medium | 마감일 변경 |
| `update_task_priority` | medium | 우선순위 변경 |

- **1차 검증**(`actionParser.ts`): LLM 응답에서 ` ```agent_actions ` 블록을 정규식으로 추출, JSON 파싱, 타입/필수필드 형태 검증. 실패한 개별 액션은 조용히 버려지는 "관대한 파서" 방식. 최종적으로 최대 5개까지만 채택.
- **2차 검증**(`toolExecutor.ts`의 `validateAgentAction`): 실제 앱 데이터와 대조 — 날짜/시간 형식 유효성, 참조하는 `projectId`/`taskId`가 실제로 존재하는지, `startTime < endTime`인지 등. 이 단계는 검증만 하고 실행하지 않는다.
- **실제 실행**(`App.tsx`의 `executeAgentActions`): 2차 검증을 한 번 더 거친 뒤 `planner.createTask`/`planner.addSubtask`/`planner.updateTask` 등 usePlannerData의 실제 CRUD 함수를 호출 — 이 시점에만 진짜로 localStorage/Supabase에 반영됨.

### 9.6 채팅 UI — `components/OllamaChat.tsx`, `components/ai/AgentActionPreview.tsx`

- 스트리밍 없음(응답 완료까지 "Thinking..." 정적 표시)
- 헤더에 어느 provider가 응답했는지("Local Ollama"/"Remote Ollama") 및 감지된 intent 라벨 표시
- 실패 시(Ollama 꺼져있음 등) 에러 메시지를 채팅 패널 내에 노출 — 별도의 "연결 상태" 인디케이터는 없고, 이 성공/실패 자체가 사실상의 연결 상태 표시
- AI가 액션을 제안하면 `AgentActionPreview`가 카드로 렌더링 — 각 카드에 요약 문구, 위험도(Low risk/Needs review), 검증 실패 시 사유 표시. "Apply"(검증 실패 항목이 하나라도 있으면 비활성화)/"Dismiss" 버튼

### 9.7 Provider 계층 — `lib/ai/gateway.ts`

```ts
const providers: AiProvider[] = [ollamaProvider, remoteOllamaProvider];
```

- `ollamaProvider`: `http://localhost:11434`(env로 변경 가능)에 `/api/tags`(헬스체크)/`/api/chat` 호출
- `remoteOllamaProvider`: `VITE_REMOTE_OLLAMA_ENABLED=true`일 때만 활성화되는 선택적 원격 fallback
- `serverProvider`: 코드는 존재하지만 **gateway에 포함되지 않음(미사용 dead code)** — 나중에 유료 백엔드를 붙일 때를 위해 남겨둔 자리

---

## 10. 유틸리티 함수

- **`utils/date.ts`**: `YYYY-MM-DD` 문자열 기반 날짜 연산(로컬 타임존), `todayValue`, `addDays`/`addMonths`, `isOverdue`/`isToday`/`isThisWeek`, 캘린더 그리드용 `getMonthDays`/`getMonthGrid`/`getWeekDays` 등
- **`utils/planner.ts`**: 태스크/프로젝트/스터디 파생 데이터 계산 — `getTodayBuckets`(Today 페이지 핵심 분류 로직, 각 태스크는 우선순위 순서로 정확히 1개 버킷에만 배정), `getProjectProgress`, `getComputedReviewStatus`, `getStudyReviewQueue`, `getDueReviewCount`(Sidebar 배지)
- **`utils/calendarItems.ts`**: `buildCalendarItems` — Task/Project/ConceptNote를 4개 레이어의 통일된 `CalendarItem[]`으로 변환(캘린더 렌더링과 AI 캘린더 컨텍스트 양쪽에서 공유)
- **`utils/calendarTime.ts`**: 캘린더 주간뷰의 포인터 드래그-생성에 필요한 시간 계산 순수함수(30분 스냅, 픽셀→시간 변환 등) + `DAY_START`/`DAY_END`/`SLOT_HEIGHT` 그리드 상수

---

## 11. 샘플/시드 데이터

- **`data/sampleData.ts`**: Settings의 "Load Samples" 버튼과 최초 실행 시 로드되는 데모 데이터. 프로젝트 5개, 태스크 15개 내외(Today 페이지의 모든 버킷을 시연할 수 있게 의도적으로 구성), 습관/집중세션/템플릿 포함
- **`data/studySeed.ts`**: 학습 토픽 5개 + 개념노트 5개(LeetCode 3개, fNIRS Research 2개) — Reviews 탭의 Due/Upcoming/Mastered 큐를 바로 시연 가능하도록 난이도·복습상태가 다양하게 세팅됨

---

## 12. 레거시 코드 & 숨겨진 기능

문서화 시 헷갈리지 않도록 정리:

- **사이드바에 노출되는 7개 페이지**: Inbox, Today, Projects, Planning, Study, Archive, Settings
- **코드상 존재하고 URL/state로는 접근 가능하지만 사이드바 메뉴엔 없는 페이지**: Tomorrow, Next 7 Days, Tasks(전체 필터 뷰), Board(레거시 칸반), **Calendar**, Matrix(독립 매트릭스 뷰 — Planning 안의 Matrix 탭과는 별개 코드), **Dashboard**, **Habits**, **Focus**
- **`components/TaskList.tsx` / `components/BoardView.tsx`**: 구버전 디자인 시스템 컴포넌트지만 `App.tsx`에서 여전히 여러 곳(Tomorrow/Next7/Tasks/Board/Matrix 등 비노출 페이지들)에 실사용 중. `PlanningPage.tsx`가 Board+Matrix의 최신 통합 버전이며 신규 디자인 시스템(`kit.tsx`) 기반
- **`components/HabitsPage.tsx` / `FocusPage.tsx` / `DashboardView.tsx`**: 구버전 클래스명("content-stack" 등) 사용, `kit.tsx` 기반 최신 디자인 시스템으로 아직 마이그레이션 안 됨
- **`TaskStatus`의 `in_progress`/`blocked`**: 레거시 값, 로드 시 자동으로 `doing`/`waiting`으로 마이그레이션됨
- **`src/lib/ai/providers/serverProvider.ts`**: 유료/원격 백엔드 AI를 나중에 붙이기 위한 미사용 코드. `gateway.ts`의 provider 목록에 포함되어 있지 않아 실제로는 절대 호출되지 않음

---

## 13. 관련 문서

- `AI_OLLAMA_FEATURES.md` — Personal AI/Ollama 연동의 더 상세한 문서(환경변수, fallback 정책)
- `CURRENT_PRODUCT_SPEC.md` — 더 이전 커밋(`a554f80`) 기준 재구현용 상세 명세(이 문서보다 페이지별 UI 세부사항이 더 촘촘하지만 AI/Calendar/Habits/Focus/Dashboard는 다루지 않음)
- `CALENDAR_DESIGN.md`, `CALENDAR_V3_DESIGN.md`, `CALENDAR_IMPLEMENTATION_REPORT.md` — 캘린더 기능의 설계/구현 히스토리
- `DESIGN-apple.md`, `design.md` — 비주얼 디자인 가이드
