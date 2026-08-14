# Horizons 2.0 — 기간 기반 목표·Board 실행 설계

- 작성일: 2026-08-14
- 기준: `3a1d34c` (`v0.5.2` 이후 Horizons·Spaces 통합 상태)
- 관련 문서: `HORIZONS_DESIGN.md`, `SPACES_BOARD_DESIGN.md`, `TIMESTRIPE_REFERENCE.md`
- 목적: Timestripe의 화면을 복제하지 않고, **기간 단위 목표 → Board에서 정리 → 오늘 실행 → 실제 집중 회고**가 하나의 흐름이 되게 한다.

---

## 0. 제품 결론

이 앱이 Timestripe와 닮아야 하는 부분은 다음 세 가지다.

1. 목표를 특정 마감일만이 아니라 `Day / Week / Month / Year / Life`라는 **계획 단위**에 놓는다.
2. Board는 목표를 잠시 보관하고 구조화하는 곳이며, 준비된 목표를 Horizons에 **같은 레코드로 계획**한다.
3. 큰 목표를 마일스톤과 오늘 할 일로 내리되 관계를 잃지 않는다.

반대로 이 앱이 Timestripe보다 더 잘해야 하는 부분은 다음이다.

1. `scheduledDate`와 `dueDate`를 분리한 캘린더 계획
2. Focus Session으로 측정한 실제 실행 시간
3. 로컬 우선 저장과 선택적 동기화
4. 사용자의 확인을 거치는 로컬 AI 계획 보조

제품의 한 문장 정의는 다음으로 둔다.

> **장기 목표가 오늘의 일정과 실제 집중 시간까지 내려오는 개인 실행 시스템.**

---

## 1. 현재 모델의 문제

### 1.1 Month 목표가 실제로는 “45일 뒤 목표”다

현재 `deriveHorizon(targetDate, today)`는 목표 날짜까지 남은 일수로 지평을 정한다.

| 현재 지평 | 판정 |
|---|---|
| Day | 오늘 또는 과거 |
| Week | 7일 이내 |
| Month | 90일 이내 |
| Year | 365일 이내 |
| Life | 그 이후 또는 날짜 없음 |

드롭할 때도 Week는 3일 뒤, Month는 45일 뒤, Year는 180일 뒤라는 대표 날짜를 쓴다.

이 방식은 화면을 빠르게 만들기에는 좋았지만 사용자의 의도를 정확히 저장하지 않는다.

- “9월 목표”는 9월의 특정 하루가 아니다.
- “2027년 목표”는 오늘부터 180일 뒤가 아니다.
- 시간이 흐르면 같은 날짜가 Year → Month → Week → Day로 자동 이동한다. 이것은 **남은 거리**이지 사용자가 정한 **계획 단위**가 아니다.

### 1.2 목표 카드가 상세 정보를 담지 못한다

현재 `LearningPath`는 제목, 날짜, Board, 마일스톤, 완료 상태 중심이다. 카드 제목을 누르면 상세를 여는 대신 완료 상태를 토글한다. 목표에 다음 내용을 둘 정식 표면이 없다.

- 왜 이 목표를 하는가
- 어떤 상태가 완료인가
- 관련 노트와 링크
- 어느 정도 진행됐는가
- 얼마를 계획했고 실제로 얼마를 실행했는가

### 1.3 Project는 Board지만 목표 목록은 아니다

Space 상세는 Overview·Tasks·Focus·Notes·Records를 제공한다. 하지만 “언젠가”, “후보”, “이번 분기”처럼 날짜를 정하기 전 목표를 정리하는 Board 목록은 없다.

`SpaceSectionGroup`는 화면 섹션 설정이지 목표가 소속되는 동기화된 목록이 아니다.

### 1.4 실행 데이터가 목표까지 올라오지 않는다

Task와 Focus Session에는 계획 시간과 실제 시간이 있지만, Learning Path는 이를 보여주지 않는다. 장기 목표와 오늘 실행은 연결되어 있으나 사용자가 그 연결의 결과를 읽을 수 없다.

---

## 2. 확정 결정

### D1. 지평은 이제 날짜 거리만으로 파생하지 않는다

새 목표와 마일스톤은 계획 단위를 직접 가진다.

```ts
export type GoalSchedule =
  | { unit: "unscheduled" }
  | { unit: "life" }
  | { unit: "year"; startDate: string }
  | { unit: "month"; startDate: string }
  | { unit: "week"; startDate: string }
  | { unit: "day"; startDate: string };
```

`startDate`는 로컬 캘린더 기준 기간 시작일을 `YYYY-MM-DD`로 저장한다.

| 단위 | startDate 예시 | 의미 |
|---|---|---|
| Unscheduled | 없음 | Board에 보관 중이며 Horizons에는 아직 올리지 않음 |
| Life | 없음 | 특정 기간을 아직 정하지 않은 인생 방향 |
| Year | `2027-01-01` | 2027년 |
| Month | `2026-09-01` | 2026년 9월 |
| Week | `2026-08-16` | 설정된 주 시작일 기준 해당 주 |
| Day | `2026-08-20` | 해당 날짜 |

`unit`을 저장하는 이유는 같은 날짜가 서로 다른 의도를 가질 수 있기 때문이다. `2027-01-01`이라는 값만으로는 “2027년 목표”인지 “1월 1일 할 일”인지 알 수 없다.

`unscheduled`과 `life`도 구분한다. 둘 다 날짜는 없지만 전자는 아직 계획하지 않은 Board 항목이고, 후자는 사용자가 Life 지평에 명시적으로 놓은 목표다.

### D2. Task는 기간 모델로 승격하지 않는다

Task는 실행 단위다. 기존 필드를 그대로 유지한다.

- `scheduledDate`: 언제 실행할 것인가
- `startTime` / `endTime`: 어느 시간 블록에서 실행할 것인가
- `dueDate`: 언제까지 끝내야 하는가

Goal과 Milestone은 `GoalSchedule`을 사용하고, Task는 날짜와 시간을 사용한다. 장기 목표를 실제 실행으로 내릴 때만 Task가 생성된다.

이 구분을 없애면 “올해 목표”와 “오늘 오후 3시에 할 일”이 같은 저장 규칙을 가져야 하고, 캘린더와 반복 작업 로직이 불필요하게 복잡해진다.

### D3. 기한과 계획 기간을 분리한다

Goal에는 선택적 기한을 별도로 둔다.

```ts
type LearningPath = {
  schedule: GoalSchedule;
  deadlineDate?: string;
};
```

예:

- `schedule = { unit: "month", startDate: "2026-09-01" }`
- `deadlineDate = "2026-09-25"`

이는 “9월에 집중하지만 25일까지 끝내야 한다”는 뜻이다. Task에서 이미 검증된 `scheduledDate`와 `dueDate`의 분리를 Goal에도 맞는 형태로 적용한다.

### D4. 다섯 칼럼은 각각 독립적인 기간 앵커를 가진다

Horizons 화면의 기본 앵커는 다음이다.

```ts
type HorizonAnchors = {
  year: "2026-01-01";
  month: "2026-08-01";
  week: "2026-08-09";
  day: "2026-08-14";
};
```

Life에는 앵커가 없다.

각 칼럼은 독립적으로 이전·다음 기간으로 이동할 수 있다.

- Year: 이전 해 / 다음 해
- Month: 이전 달 / 다음 달
- Week: 이전 주 / 다음 주
- Day: 이전 날 / 다음 날
- Life: 항상 동일

“오늘로 돌아오기”는 네 앵커를 현재 기간으로 한 번에 복원한다.

### D5. 미완료 과거 목표는 사라지지 않고 이월로 보인다

현재 기간을 보고 있을 때, 같은 단위의 과거 미완료 목표는 칼럼 상단의 `이월` 그룹에 보인다.

예:

- 7월 Month 목표가 미완료
- 현재 Month 칼럼이 8월
- 8월 칼럼 상단에 `이월 · 7월` 배지로 표시

규칙:

1. 이월은 뷰 파생값이며 저장하지 않는다.
2. 원래 `schedule`은 자동 변경하지 않는다.
3. 사용자가 `8월로 옮기기`를 선택하거나 카드 자체를 현재 칼럼에 드롭할 때만 저장값이 바뀐다.
4. 과거 기간을 직접 탐색할 때는 원래 위치에 정상 표시한다.

이 규칙은 목표가 조용히 사라지는 것을 막으면서, 앱이 사용자 대신 계획을 바꾸지 않게 한다.

### D6. 기존 `targetDate`는 한 릴리스 동안 호환 필드로 유지한다

바로 삭제하지 않는다.

```ts
type LearningPath = {
  schedule?: GoalSchedule;
  deadlineDate?: string;
  /** @deprecated compatibility with pre-Horizons-2 clients */
  targetDate?: string;
};
```

읽기 우선순위:

1. 유효한 `schedule`
2. 기존 `targetDate`를 현재 규칙으로 변환
3. 둘 다 없으면 `{ unit: "life" }`

기존 `targetDate` 변환:

1. 기존 `deriveHorizon(targetDate, today)`로 **현재 화면 위치를 먼저 보존**한다.
2. 그 결과 단위와 `targetDate`가 속한 캘린더 기간의 시작일로 `schedule`을 만든다.
3. AI나 사용자가 직접 넣은 실제 날짜일 수 있으므로 원본은 `deadlineDate`에도 보존한다.

쓰기 규칙:

- 새 클라이언트는 `schedule`을 정본으로 쓴다.
- 호환 기간에는 `targetDate`도 대표 날짜로 dual-write한다.
- 다음 메이저 데이터 버전에서 구형 클라이언트 사용 여부를 확인한 뒤 제거한다.

### D7. Goal 카드는 체크와 열기를 분리한다

- 체크박스: 완료·미완료만 변경
- 제목 또는 카드 본문: Goal Detail 열기
- 드래그 핸들 또는 카드 빈 영역: 기간 이동
- Board 배지: Board 변경

제목 클릭이 완료 토글로 폴백하는 현재 동작은 제거한다. 목표를 실수로 완료시키는 문제를 막고, 목표를 정보 컨테이너로 승격하는 첫 단계다.

### D8. Goal Detail은 새 페이지가 아니라 공용 드로어다

Today·Calendar·Planning이 `TaskDetail`을 공유하듯 Horizons와 Space가 하나의 `GoalDetail`을 공유한다.

초기 구성:

1. 제목
2. Board와 Board List
3. 계획 기간
4. 선택적 기한
5. 설명
6. 완료 기준
7. 마일스톤 목록
8. 연결된 Task
9. 진행 요약
10. 삭제·완료

확장 필드:

```ts
type GoalLink = {
  id: string;
  title: string;
  url: string;
};

type LearningPath = {
  description?: string;
  successCriteria?: string;
  tags?: string[];
  links?: GoalLink[];
};
```

초기 버전에서는 첨부 파일과 임베드를 넣지 않는다. Space Notes와 Obsidian Knowledge Base가 이미 자료 저장 역할을 하므로 먼저 링크만 제공한다.

### D9. Project는 계속 Board이고, Board List만 추가한다

별도 `Board` 레코드는 만들지 않는다.

```ts
export type BoardList = {
  id: string;
  name: string;
  order: number;
  archivedAt?: string;
};

type Project = {
  boardLists?: BoardList[];
};

type LearningPath = {
  projectId?: string;
  boardListId?: string;
  boardOrder?: number;
};
```

목표의 `boardListId`는 반드시 `projectId`가 가리키는 Project 내부 목록이어야 한다.

불변식:

1. Board가 바뀌면 기존 `boardListId`는 비운다.
2. 목록이 삭제되면 목표는 삭제하지 않고 `boardListId`만 비운다.
3. 목록이 없는 목표도 허용하며 `미분류`에 표시한다.
4. Board List 순서는 Project JSON 안에서 동기화된다.
5. 목록 내부 목표 순서는 `boardOrder`로 저장하며, 목록 간 이동 시 새 위치를 부여한다.

별도 Supabase 테이블은 필요 없다. Project와 Learning Path 모두 기존 `data jsonb`에 새 필드가 함께 저장된다.

### D10. Space에 Goals 탭을 추가한다

Space 탭은 다음이 된다.

```ts
type SpaceTab = "overview" | "goals" | "tasks" | "focus" | "notes" | "records";
```

역할:

- Overview: 지금과 같이 핵심 상태와 Board별 Horizons 요약
- Goals: Board List별 목표 보관·정리·계획
- Tasks: 실행 단위 목록
- Focus: 실제 실행 기록
- Notes: 자료
- Records: 활동 기록

Goals 탭의 기본 동작:

1. 목표 만들기 — 기간 없이 만들면 Life가 아니라 **Board에만 있는 미계획 목표**가 된다.
2. 목록 간 이동
3. `Horizons에 계획` — 기간 선택
4. 계획 해제 — Board에는 남고 Horizons에서만 빠짐

`unscheduled`과 `life`는 다르다(D1).

- `unscheduled`: Board에 보관 중이며 Horizons에는 보이지 않음
- `life`: 인생 지평에 명시적으로 둔 목표

### D11. Board와 Horizons는 같은 Goal 레코드를 본다

`Horizons에 계획`은 복제나 변환이 아니다. 같은 Learning Path의 `schedule`만 바꾼다.

```text
Board의 미계획 목표
        │ schedule 지정
        ▼
같은 목표가 Horizons에 표시
        │ 마일스톤을 오늘 할 일로 재료화
        ▼
연결된 Task가 Today·Calendar에 표시
```

Board에서 목표를 삭제하면 Horizons에서도 사라지고, Horizons에서 제목을 바꾸면 Board에서도 즉시 바뀐다.

### D12. 진행률은 저장하지 않고 파생한다

저장된 `progressPercent`는 금방 실제 데이터와 어긋난다. 다음 원본에서 계산한다.

```ts
type GoalProgress = {
  milestoneDone: number;
  milestoneTotal: number;
  taskDone: number;
  taskTotal: number;
  plannedMinutes: number;
  actualMinutes: number;
  lastProgressAt?: string;
  staleDays?: number;
};
```

초기 표시:

- 마일스톤 `2/5`
- 연결된 작업 `7/10`
- 최근 7일 집중 `4시간 20분`
- 마지막 진전 `3일 전`

단일 퍼센트는 보조 값으로만 계산한다. 마일스톤 하나와 10분짜리 Task 하나의 무게가 같다고 단정하지 않는다.

### D13. AI는 계획안을 만들지만 직접 적용하지 않는다

AI가 할 수 있는 일:

- 목표 설명을 바탕으로 기간 제안
- 마일스톤 초안
- 이번 주로 내릴 후보 추천
- 실제 집중 기록 기반 주간 회고
- 오래 정체된 목표 감지

AI가 하면 안 되는 일:

- 사용자 확인 없이 기간 변경
- 사용자 확인 없이 Board 이동
- 완료 상태 추정 후 저장
- 기존 목표를 조용히 Task로 변환

모든 변경은 기존 `AgentActionPreview` 패턴으로 미리 보여주고 승인 후 실행한다.

### D14. 색상 의미는 현재 앱 규칙을 유지한다

색상은 Project/Board 정체성이다. Calendar와 Horizons가 같은 색 언어를 쓰는 현재 장점을 유지한다.

관련 목표 관계를 표현하려고 별도의 Goal 색상을 추가하지 않는다. 관계는 breadcrumb, Board 이름, 마일스톤 구조로 표현한다.

---

## 3. 화면 설계

### 3.1 Horizons 기본 화면

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ 지평                         미완료 숨기기  정렬: 최근 수정   오늘로     │
├─────────────┬─────────────┬─────────────┬─────────────┬───────────────┤
│ LIFE        │ 2026 YEAR   │ 2026.08     │ 8.09–8.15   │ 8.14 TODAY    │
│             │ ‹         › │ ‹         › │ ‹         › │ ‹           › │
│             │             │             │             │               │
│ [Goal]      │ [Carryover] │ [Goal]      │ [Milestone] │ [Task]        │
│ [Goal]      │ [Goal]      │ [Goal]      │ [Goal]      │ [Task]        │
│             │             │             │             │               │
│ + 목표      │ + 목표      │ + 목표      │ + 목표      │ + 할 일       │
└─────────────┴─────────────┴─────────────┴─────────────┴───────────────┘
```

헤더 조작:

- 기간명 클릭: 해당 지평 Focus View
- 좌우 버튼: 해당 단위의 이전·다음 기간
- 오늘로: 모든 앵커 초기화
- 칼럼 접기: Life부터 Day까지 사용자 선택

정렬:

1. 미완료 우선
2. 최근 수정
3. 이름

Horizons의 수동 정렬은 초기 범위에서 제외한다. Goal·Milestone·Task 세 레코드 타입의 전역 순서를 별도로 저장해야 하기 때문이다. Board 목록 내부의 수동 순서는 `boardOrder`로 지원한다.

필터 초기 범위:

1. 완료 숨기기
2. 미배정 Board만
3. 태그

Board 필터는 넣지 않는다. 특정 Board 조망은 Space 상세이 담당한다.

### 3.2 지평 Focus View

칼럼 제목을 누르면 새 페이지로 이동하지 않고 같은 화면 안에서 한 지평이 넓어진다.

```text
← 전체 지평       2026년 8월                     ‹ 이전 달  다음 달 ›

이월 2
  [7월에서 이월된 목표]

이번 달 5
  [Goal card — 설명 1줄, Board, 진행 요약]
```

모바일·좁은 데스크톱에서는 이 뷰가 기본이다. 다섯 칼럼을 억지로 축소하지 않는다.

### 3.3 Goal Detail 드로어

```text
┌──────────────────────── Goal Detail ────────────────────────┐
│ HSK4 수준 중국어                                      완료 □ │
│ Health / 2026년 9월 / 기한 9월 25일                         │
│                                                            │
│ 설명                                                       │
│ 중국 여행에서 기본적인 대화를 할 수 있도록…                │
│                                                            │
│ 완료 기준                                                  │
│ 모의시험 70점 이상, 10분 대화 가능                          │
│                                                            │
│ 마일스톤 2/5                                               │
│ ✓ 단어 600개                                               │
│ → 문법 20개                                                │
│ ○ 모의시험                                                 │
│                                                            │
│ 이번 주 실행                                               │
│ 연결 작업 3개 · 계획 180분 · 실제 125분                     │
│                                                            │
│ 링크 · 태그 · 삭제                                         │
└────────────────────────────────────────────────────────────┘
```

### 3.4 Space Goals 탭

초기 버전은 칸반보다 세로 목록을 우선한다. 여러 가로 리스트는 Space 상세 폭과 모바일에서 불리하다.

```text
Goals                                      + 목표  + 목록

미분류 (2)
  [Goal]                          [Horizons에 계획]

다음 분기 후보 (3)
  [Goal]                          [2026년 9월]

언젠가 (5)
  [Goal]                          [미계획]
```

드래그는 목록 간 이동에만 사용한다. 기간 지정은 명시적 피커로 한다. 같은 화면에서 세로 위치와 시간 위치를 모두 드래그로 조작하게 만들지 않는다.

---

## 4. 파생 규칙

### 4.1 기간 정규화

```ts
normalizeGoalSchedule(schedule, fallbackTargetDate, today)
```

규칙:

1. `unscheduled`, `life`는 `startDate`를 갖지 않는다.
2. `year.startDate`는 반드시 1월 1일로 정규화한다.
3. `month.startDate`는 반드시 해당 달 1일로 정규화한다.
4. `week.startDate`는 현재 앱의 `getWeekStart()`와 동일하게 일요일로 맞춘다. 향후 주 시작 설정을 추가한다면 Calendar와 Horizons가 같은 전역 설정을 함께 사용해야 하며, Horizons만 따로 바꾸지 않는다.
5. `day.startDate`는 그대로 둔다.
6. 잘못된 날짜는 `life`가 아니라 `unscheduled`로 보낸다. 잘못된 데이터를 인생 목표처럼 보이게 하지 않는다.

### 4.2 화면 포함 여부

```ts
matchesGoalAnchor(schedule, unit, anchor): boolean
```

- `schedule.unit !== unit`이면 false
- `life`는 Life 칼럼에 항상 true
- 나머지는 정규화된 `startDate === anchor`
- `unscheduled`는 Horizons에서 항상 false

### 4.3 이월

```ts
isGoalCarryover(goal, unit, currentAnchor): boolean
```

- 완료되지 않음
- 같은 unit
- `schedule.startDate < currentAnchor`
- 화면이 현재 실제 기간을 보고 있음

과거 탐색 화면이나 미래 탐색 화면에는 이월을 합치지 않는다.

### 4.4 드롭

Goal 또는 Milestone:

- Life 드롭 → `{ unit: "life" }`
- Year 드롭 → 현재 Year 앵커
- Month 드롭 → 현재 Month 앵커
- Week 드롭 → 현재 Week 앵커
- Day 드롭 → 현재 Day 앵커

Task:

- Day 드롭 → `scheduledDate = dayAnchor`
- Week/Month 드롭은 Phase 1에서 허용하지 않는다. Task는 실행 날짜가 필요한 레코드다.
- 장기 단위로 올리고 싶다면 `목표로 승격`이라는 별도 명시적 액션을 향후 검토한다.

현재 Task가 Week/Month에 대표 날짜로 들어가는 동작은 호환 기간에 유지하되, 기간 모델 전환 완료 후 제거 여부를 사용성 테스트로 판단한다.

---

## 5. 데이터 마이그레이션

### 5.1 스키마 버전

PlannerData에 별도 정수 버전을 추가하지 않는다. 현재 앱은 레코드별 sanitizer를 사용하며 JSONB 테이블도 필드 추가에 열려 있다.

대신 `sanitizeLearningPath()`가 구형과 신형을 모두 읽는다.

### 5.2 구형 Learning Path

```text
구형 targetDate 있음
  → schedule 생성
  → deadlineDate에 원본 보존
  → targetDate 호환 유지

구형 targetDate 없음
  → schedule = life
```

### 5.3 Board List

- 기존 Project: `boardLists = []`
- 기존 Learning Path: `boardListId = undefined`
- 기존 목표는 현재처럼 Board 안에서 `미분류`로 표시
- 기존 `SpaceSectionGroup`는 자동 이관하지 않는다. 그것은 레이아웃 그룹이고 Board 목표 목록이라는 보장이 없다.

### 5.4 마이그레이션 안전 선행 작업

기간 모델 작업 전에 현재 migration edge case를 먼저 닫는다.

1. `countDataItems()`에 `learningPaths.length` 포함
2. legacy marker는 실제 채택된 데이터가 저장된 뒤 기록
3. Learning Path만 있는 로컬 사용자 로그인 테스트
4. 손상된 planner blob + 정상 legacy blob 테스트

새 마이그레이션을 기존 불안정한 마커 흐름 위에 쌓지 않는다.

---

## 6. 동기화와 충돌

기존 Learning Path와 Project가 JSONB 레코드 단위로 동기화되므로 새 테이블은 필요 없다.

다만 같은 Goal을 두 기기에서 편집하면 현재 LWW(record-level last write wins) 특성상 한쪽의 nested milestone 변경이 다른 쪽 변경을 덮을 수 있다. 이 설계에서 새로 악화되는 문제는 아니지만 Goal Detail이 풍부해질수록 영향이 커진다.

이번 범위:

- 기존 record-level LWW 유지
- `updatedAt`을 모든 Goal/Board List 변경에서 갱신
- 저장 실패 시 baseline을 전진시키지 않는 현재 규칙 유지

후속 검토:

- milestone 단위 레코드 분리
- field-level merge
- 충돌 감지용 `revision`

초기 구현에 이 복잡도를 넣지 않는다.

---

## 7. 구현 단계

### Phase 0 — 마이그레이션 안전 보강

목표: 현재 데이터 이관의 알려진 구멍부터 닫는다.

작업:

1. `countDataItems()`에 Learning Path 포함
2. legacy marker 커밋 조건 개선
3. 로그인 전후 로컬 목표 보존 테스트
4. 손상 저장소 테스트

완료 기준:

- 목표만 가진 로컬 사용자가 로그인해도 업로드 선택지가 보인다.
- 파싱 실패가 legacy marker를 소모하지 않는다.

### Phase 1 — 기간 모델과 순수 함수

목표: UI 변경 없이 새 데이터를 안전하게 읽고 쓴다.

신규 후보:

- `src/domain/horizons/goalSchedule.ts`
- `src/domain/horizons/goalSchedule.test.ts`

수정:

- `learningPaths/types.ts`
- `learningPaths/store.ts`
- `pathMutations.ts`
- `horizonItems.ts`
- `usePlannerData.ts`

필수 테스트:

1. 구형 targetDate 마이그레이션
2. 각 단위 startDate 정규화
3. invalid schedule 처리
4. current anchor 일치
5. 이월 판정
6. DST·UTC+9 날짜 보존
7. dual-write 호환

### Phase 2 — 기간 탐색 Horizons

목표: 사용자가 주·월·년을 실제 기간으로 계획한다.

작업:

1. 칼럼별 앵커 상태
2. 이전·다음 탐색
3. 오늘로 복귀
4. 기간 기반 생성과 드롭
5. 이월 그룹
6. Focus View
7. 좁은 화면에서 Focus View 기본 적용

완료 기준:

- “2027년”, “2026년 9월”, “다음 주”가 대표 날짜 없이 저장된다.
- 앱을 다시 열어도 동일 기간에 보인다.
- 과거 미완료 목표가 조용히 사라지지 않는다.

### Phase 3 — Goal Detail

목표: Goal을 제목 이상의 1급 객체로 만든다.

작업:

1. `GoalDetail.tsx`
2. 카드 제목 클릭 배선
3. 설명·완료 기준·태그·링크
4. 마일스톤 편집
5. 연결 Task 목록
6. 키보드·모바일 드로어 접근성

완료 기준:

- Horizons와 Space에서 같은 드로어가 열린다.
- 제목 클릭은 완료 상태를 변경하지 않는다.
- 모든 편집이 동기화와 undo 흐름을 탄다.

### Phase 4 — Space Goals와 Board List

목표: 날짜를 정하기 전 목표가 머물 곳을 만든다.

작업:

1. `Project.boardLists`
2. `LearningPath.boardListId`
3. Space `goals` 탭
4. 목록 생성·이름 변경·정렬·보관
5. 목록 간 목표 이동
6. `Horizons에 계획` / `계획 해제`

완료 기준:

- 미계획 목표가 Horizons에는 없고 Board에는 남는다.
- 계획을 지정하면 같은 ID의 목표가 Horizons에 나타난다.
- Board 변경 시 잘못된 list ID가 남지 않는다.

### Phase 5 — 목표 진행과 회고

목표: 실행 데이터가 Goal로 올라온다.

신규 후보:

- `src/domain/horizons/goalProgress.ts`
- `src/domain/horizons/goalProgress.test.ts`

작업:

1. 마일스톤·Task 완료 집계
2. Goal별 Focus Session 집계
3. 최근 실행과 정체 일수
4. Goal Detail 진행 카드
5. 주간 리뷰 요약

완료 기준:

- Goal에서 연결 작업과 실제 집중 시간이 보인다.
- 파생 결과는 화면·AI 컨텍스트에서 같은 함수를 사용한다.

### Phase 6 — 빠른 입력과 AI

목표: 새 모델을 빠르게 사용할 수 있게 한다.

작업:

1. `다음 주`, `이번 달`, `9월`, `2027년`, `언젠가` 파싱
2. AI 기간·마일스톤 제안
3. 정체 목표와 이번 주 실행 후보 제안
4. 승인 전 Action Preview

---

## 8. 테스트 전략

### 순수 함수

- schedule sanitizer
- 기간 시작일 계산
- 이전·다음 앵커
- 포함 여부
- 이월
- legacy 변환
- Goal progress
- Board/list 불변식

### 컴포넌트

- 카드 체크와 열기 분리
- 기간 피커 저장 payload
- 이전·다음 기간 탐색
- 이월 액션
- Board 변경 시 list 초기화
- Goals 탭에서 계획·해제

### 통합/E2E

1. Board에서 미계획 목표 생성
2. 다음 달로 계획
3. Horizons 다음 달에서 확인
4. 마일스톤 생성
5. 오늘 Task로 재료화
6. Calendar에 시간 배치
7. Focus 완료
8. Goal Detail에서 실제 시간 확인
9. 재시작 후 전체 관계 유지
10. Supabase 로그인 후 다른 기기에서 동일 상태 확인

---

## 9. 이번 설계에서 하지 않는 것

| 항목 | 이유 |
|---|---|
| 팀 협업 Spaces | 개인용 제품 정체성과 다름 |
| 공개 Board·템플릿 갤러리 | 커뮤니티·콘텐츠 사업이 필요 |
| Climbs | 같은 이유. AI 계획 초안이 더 자연스러운 대안 |
| 무제한 nested subgoal | 현재 Goal → Milestone → Task로 충분하며 UI 복잡도가 큼 |
| Goal 첨부 파일·임베드 | Space Notes와 Knowledge Base가 먼저 존재 |
| Goal 전용 색상 | Board/Calendar 색 언어와 충돌 |
| Task를 Year/Life로 직접 이동 | 실행 레코드와 방향 레코드의 구분이 무너짐 |
| 자동 이월 저장 | 앱이 사용자 계획을 조용히 바꾸게 됨 |
| 별도 Board 테이블 | Project와 역할 중복 |

---

## 10. 성공 지표

기능 개수보다 실제 흐름이 이어지는지를 본다.

1. Goal 중 Board가 지정된 비율
2. Goal 중 기간이 지정된 비율
3. Goal → Milestone → Task까지 연결된 비율
4. 이번 주 Goal과 연결된 Focus Session 수
5. 과거 미완료 Goal 중 사용자가 재계획한 비율
6. Horizons에서 만든 Goal이 7일 안에 Task로 내려온 비율

정성 기준:

- 사용자가 “이번 달 목표가 무엇인지” 한 화면에서 답할 수 있는가
- 오늘 할 일이 어떤 장기 목표에서 내려왔는지 알 수 있는가
- 계획과 실제 실행의 차이를 Goal 단위로 설명할 수 있는가
- AI 없이도 전 기능을 사용할 수 있는가

---

## 11. 최종 우선순위

```text
P0  현재 마이그레이션 안전성
 ↓
P1  기간 기반 GoalSchedule
 ↓
P2  기간 탐색 Horizons
 ↓
P3  Goal Detail
 ↓
P4  Space Goals + Board List
 ↓
P5  목표 진행·실제 집중 회고
 ↓
P6  빠른 입력·AI 제안
```

가장 먼저 구현할 수직 슬라이스는 다음이다.

> **Board에서 “9월 목표”를 만들고 → Horizons의 9월 칼럼에서 열고 → 마일스톤을 오늘 Task로 내려 → Focus 완료 시간이 Goal Detail에 올라오는 흐름.**

이 한 흐름이 끝까지 동작하면 제품의 새 방향이 증명된다.
