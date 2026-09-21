# Todo Planner — Design Document

## 1. Product Vision

개인용 Task Management 앱. Notion처럼 범용 워크스페이스가 아니라, **할 일을 빠르게 캡처하고 우선순위를 잡아 실행하는 데 집중**한다.

핵심 원칙:
- 빠른 입력, 빠른 파악
- 기능은 필요한 만큼만 — 쓰지 않는 기능은 추가하지 않는다
- 개인 혼자 쓰는 도구이므로 협업 기능은 없다

---

## 2. MVP Scope

### 포함
- Task CRUD (추가 / 수정 / 삭제)
- 완료 체크
- 우선순위 (none / low / medium / high)
- 마감일
- 프로젝트 / 리스트 구분
- Subtasks
- 보드 뷰 (Kanban: todo → in_progress → waiting → blocked → done)
- Dashboard (통계 요약)
- Eisenhower Matrix (importance × urgency 2×2)
- 간단한 dependency (blockedByTaskId — 단방향 1:1)

### 의도적으로 제외 (scope out)
- 댓글, 공유, 멤버 초대
- 복잡한 dependency 그래프 (DAG)
- 타임라인 / Gantt
- 파일 첨부
- AI 기능

---

## 3. Data Model

### Task
```
id            string        PK
title         string        required
description   string
status        TaskStatus    todo | in_progress | waiting | blocked | done
priority      TaskPriority  none | low | medium | high
importance    TaskLevel     high | low   ← Eisenhower 축
urgency       TaskLevel     high | low   ← Eisenhower 축
dueDate       string        YYYY-MM-DD
projectId     string        FK → Project (비어있으면 Inbox)
tags          string[]
notes         string
blockedByTaskId string      FK → Task (단방향 dependency)
repeatType    RepeatType    none | daily | weekly | monthly
repeatInterval  number
repeatDays    number[]
repeatEndDate string
createdAt     string
updatedAt     string
completedAt   string
```

### Subtask
```
id        string
taskId    string   FK → Task
title     string
completed boolean
createdAt string
updatedAt string
```

### Project
```
id          string
name        string
description string
color       string   hex
createdAt   string
updatedAt   string
```

---

## 4. Pages & Navigation

| Page      | Route Key   | 역할 |
|-----------|-------------|------|
| Today     | today       | 오늘 마감 / 오버듀 / 이번 주 요약 |
| Inbox     | inbox       | 프로젝트 없고 날짜 없는 태스크 |
| Tasks     | tasks       | 전체 태스크, 필터 + 정렬 |
| Board     | board       | Kanban 보드 뷰 |
| Calendar  | calendar    | 월간 달력, 날짜별 태스크 |
| Matrix    | matrix      | Eisenhower 2×2 |
| Projects  | projects    | 프로젝트 목록 + 프로젝트별 태스크 |
| Dashboard | dashboard   | 통계 요약 (완료율, 상태별, 우선순위별, 프로젝트별) |
| Habits    | habits      | 습관 트래커 (Task와 분리된 도메인) |
| Focus     | focus       | 포모도로 타이머 |
| Settings  | settings    | 데이터 import/export, 계정(Supabase) |

---

## 5. Feature Details

### 5-1. Task CRUD
- QuickAdd: 제목만 입력해도 즉시 생성 (dueDate, projectId 선택 가능)
- TaskDetail 사이드패널: 모든 필드 편집
- 삭제는 TaskDetail에서만 (실수 방지)

### 5-2. Board View
- 컬럼: `todo` / `in_progress` / `waiting` / `blocked` / `done`
- 카드 드래그로 status 변경
- 프로젝트 필터 지원

### 5-3. Eisenhower Matrix
- 4사분면: Important+Urgent / Important+Not Urgent / Not Important+Urgent / Not Important+Not Urgent
- importance × urgency 필드로 분류
- 완료되지 않은 태스크만 표시

### 5-4. Dashboard
- 핵심 지표: 전체 / 완료 / 진행중 / 블록됨 / 오버듀 / 이번 주 마감
- 바 차트: 프로젝트별 / 상태별 / 우선순위별 태스크 수
- 습관 스트릭, 포커스 시간 요약 포함

### 5-5. Subtasks
- Task에 종속된 체크리스트 형태
- TaskDetail 패널에서 추가 / 완료 토글 / 삭제

### 5-6. Dependencies (간단)
- `blockedByTaskId`: 이 태스크가 어떤 태스크에 의해 블록되는지 1:1 단방향
- status가 `blocked`이면 TaskDetail에서 blocking task를 표시
- DAG / 순환 체크 없음 (MVP 범위)

### 5-7. Repeat (반복)
- repeatType: none / daily / weekly / monthly
- repeatInterval: n일/주/월 간격
- repeatDays: 요일 지정 (weekly일 때)
- repeatEndDate: 반복 종료일

---

## 6. State & Storage

- 기본 저장소: **localStorage** (브라우저 로컬)
- 선택적 클라우드 동기화: **Supabase** (설정에서 계정 연결)
  - Supabase 환경변수 미설정 시 localStorage 전용으로 동작
  - 로컬 데이터 → Supabase 마이그레이션 기능 제공
- 데이터 훅: `usePlannerData` — 모든 CRUD 로직 집중

---

## 7. Tech Stack

| 역할 | 선택 |
|------|------|
| UI | React 18 + TypeScript |
| 빌드 | Vite |
| 스타일 | CSS (styles.css, CSS 변수 기반) |
| 백엔드 (선택) | Supabase (auth + DB) |
| 상태관리 | React 내장 (useState, useMemo, useRef) |

외부 UI 라이브러리 없음. 아이콘 라이브러리 없음.

---

## 8. UX 원칙

- **사이드패널 패턴**: 태스크 클릭 → 오른쪽 패널에서 편집, 페이지 이동 없음
- **키보드 단축키**: `/` 검색, `t` Today, `i` Inbox, `n` 새 태스크, `Esc` 닫기
- **QuickAdd 우선**: 매 페이지 상단에 빠른 입력창
- **빈 상태 메시지**: 리스트가 비어있을 때 항상 안내 문구 표시

---

## 9. Out of Scope (현재 버전)

- 다크/라이트 테마 토글 (설정에 theme 필드 있으나 UI 미구현)
- 알림 / 리마인더
- 모바일 최적화 — 아래 단서 참조
- 오프라인 PWA
- 다중 사용자 / 팀 기능

### 9-1. "모바일 최적화 제외"가 뜻하는 것

CSS에는 `max-width` 브레이크포인트가 <!--@ breakpoints.narrow -->600 · 639 · 680 ·
768 · 900<!--@--> 다섯 값으로 <!--@ breakpoints.narrow.count -->열아홉(19)<!--@-->
곳 있다. 이것을 모바일 지원으로 읽으면 안 된다. **데스크톱 창을 좁혔을
때 레이아웃이 깨지지 않게 하는 대응**이고, 그 이상을 약속하지 않는다.

구체적으로, 모바일 지원이라면 당연히 따라와야 할 것들이 여기 없다:

- **타입 스케일이 좁은 폭에서 커지지 않는다.** 기본 UI 텍스트는 어느 폭에서나
  `--type-md: 13px`이고 본문/태스크 제목은 `--type-lg: 15px`다. 모바일 본문
  16px 권고(WCAG 인접 가이드라인)를 만족하지 않으며, **만족시킬 의도도 없다** —
  이 앱은 밀집형 데스크톱 생산성 도구고 `20-density.css`가 그 밀도 위에 서
  있다. 13 → 15로 올리면 태스크 행이 눈에 띄게 높아져 그 결정에서 멀어진다.
- 터치 제스처, 모바일 내비게이션, 세이프 에어리어, 뷰포트 회전 대응 없음.
  `@media (pointer: coarse)`로 터치 타깃을 44px로 키우는 자리는 있지만, 그것은
  터치 스크린 데스크톱/태블릿을 위한 것이다.

**그래서 좁은 폭 브레이크포인트는 걷어내지 않는다.** 창을 좁히는 것은 데스크톱
사용자가 실제로 하는 일이고, 그때 깨지지 않는 것은 모바일 지원과 무관하게
필요하다. 다만 모바일에서 실제로 쓸 만한지는 이 문서가 보증하는 범위 밖이다.

브레이크포인트 자체는 두 형식이 섞여 있다 — `N-1/N`(1023/1024, 1279, 639)과
`N/N+1`(900/901, 960/961). 각각은 겹치지 않으므로 그대로 두되, **같은 경계를
두 형식으로 적은 자리**는 정확히 그 1px에서 규칙이 모순되므로 맞춘다.
