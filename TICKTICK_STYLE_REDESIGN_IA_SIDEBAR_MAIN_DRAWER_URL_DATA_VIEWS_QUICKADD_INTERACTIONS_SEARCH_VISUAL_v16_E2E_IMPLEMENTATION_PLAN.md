# TickTick형 메인 작업 경험 재설계 문서

- 작성일: 2026-08-18
- 목적: 기존 Todo 앱의 복잡한 프로젝트 계층을 유지하면서도, 일상 작업 경험은 TickTick처럼 빠르고 단순하게 재구성한다.
- 범위: §1~§15 — IA, Rail/Sidebar, Main, Drawer, URL/Navigation, Data Model, Scope Views, Quick Add, Interaction, Search, Visual System, Canonical Behavior Registry, Data Model Closure, Implementation Contract, Responsive Contract
- 정합성 기준: §1~§11의 동일 주제 규칙은 §12 Canonical Behavior Registry와 일치하도록 동기화했으며, Subtask/Repeat/Reminder/Container lifecycle의 최종 데이터 계약은 §13을 따른다. Registry/Query/Create Resolver/Domain Command/Optimistic Mutation의 구현 경계는 §14를 최종 계약으로 사용한다. 화면 폭·입력 방식에 따른 Rail/Sidebar/Main/Drawer/Board/Quick Add/Search의 Presentation 전환은 §15 Responsive Contract를 최종 기준으로 사용한다.
- 설계 원칙:
  1. TickTick의 정보구조와 사용 흐름을 최대한 따른다.
  2. Presentation IA와 Domain IA를 분리한다.
  3. 사용자가 일상적으로 Task를 처리할 때 Space / Project의 복잡한 계층을 강제로 이해하게 하지 않는다.
  4. Rail = 모듈, Sidebar = 현재 범위, Main = 실제 작업이라는 역할을 섞지 않는다.
  5. Task 생성은 사용자가 결과 위치를 예측할 수 있을 때만 즉시 수행한다.

---

# 1. 전체 정보구조(IA) 세부 설계

## 1.1 목적

메인 작업 경험은 **TickTick의 구조와 사용 흐름을 최대한 따른다.**

기존 도메인의 복잡한 계층을 사용자가 항상 이해해야 하는 구조는 피한다.

사용자가 앱을 열었을 때 가장 먼저 이해해야 하는 것은 다음 세 가지뿐이다.

```text
1. 지금 해야 할 일은 무엇인가
2. 내 작업은 어디에 모여 있는가
3. 원하는 작업으로 어떻게 이동하는가
```

따라서 IA의 중심 객체는 `Space`나 `Project`가 아니라 **Task와 List**로 둔다.

기존의 Space / Project / Folder 등의 구조는 제거하지 않되, 일반적인 일상 작업 흐름에서는 전면에 노출하지 않는다.

---

## 1.2 IA의 최상위 원칙

전체 앱의 탐색 구조를 다음 세 계층으로 구분한다.

```text
App
│
├─ Level 1: Module
│   └─ 앱의 큰 기능 선택
│
├─ Level 2: Navigation Scope
│   └─ 현재 모듈 안에서 무엇을 볼지 선택
│
└─ Level 3: Content / Workbench
    └─ 실제 작업을 보고 수정하는 영역
```

화면 구조:

```text
┌──────────┬──────────────────────┬───────────────────────────────┐
│ Level 1  │ Level 2              │ Level 3                       │
│          │                      │                               │
│ Rail     │ Sidebar              │ Main Workbench                │
│          │                      │                               │
│ 앱 기능   │ 현재 위치 탐색        │ 실제 작업                     │
│ 선택      │                      │ 조회 / 생성 / 수정 / 완료       │
│          │                      │                               │
└──────────┴──────────────────────┴───────────────────────────────┘
```

세 영역은 서로 다른 질문에 답해야 한다.

| 영역 | 답하는 질문 |
|---|---|
| Rail | 어떤 기능을 사용할 것인가? |
| Sidebar | 무엇을 보고 있는가? |
| Main | 여기서 무엇을 할 것인가? |

하나의 영역이 두 역할을 동시에 담당하지 않는다.

---

## 1.3 최상위 Module 구조

앱의 Level 1은 다음과 같이 정의한다.

```text
App
│
├─ Tasks
├─ Calendar
├─ Spaces
├─ Focus
├─ Search
└─ Settings
```

### Tasks

앱의 기본 진입점이다.

TickTick과 가장 유사한 작업 관리 경험을 제공한다.

포함:

```text
오늘
다음 7일
기본함

리스트
태그
필터

완료
휴지통
```

### Calendar

동일한 Task 데이터를 날짜 중심으로 보는 별도 Module이다.

```text
Task
 ├─ Tasks에서 표시
 └─ Calendar에서도 표시
```

Task를 복제하지 않는다.

### Spaces

기존 고급 프로젝트 관리 영역을 유지한다.

```text
Space
 ├─ Overview
 ├─ List
 ├─ Board
 ├─ Gantt
 ├─ Calendar
 ├─ Goals
 └─ Horizons
```

역할을 다음처럼 분리한다.

```text
Tasks
"오늘 내가 무엇을 해야 하지?"

Spaces
"프로젝트 전체는 지금 어떤 상태지?"
```

### Focus

실제 실행 세션을 담당한다.

```text
Task 선택
    ↓
집중 시작
    ↓
Timer / Session
    ↓
완료 또는 중단
```

### Search

위치와 관계없는 전역 탐색이다.

검색 대상 최소 범위:

```text
Task
List
Tag
Space
Project
```

### Settings

앱 전역 설정, 계정, 표시, 알림, 데이터 관련 설정을 담당한다.

---

## 1.4 Tasks Module의 IA

Tasks 내부 구조를 다음과 같이 확정한다.

```text
Tasks
│
├─ Smart Lists
│   ├─ 오늘
│   ├─ 다음 7일
│   └─ 기본함
│
├─ Lists
│   ├─ Folder
│   │   ├─ List
│   │   └─ List
│   └─ List
│
├─ Tags
├─ Filters
├─ Completed
└─ Trash
```

---

## 1.5 Smart List

Smart List는 실제 Task 저장 위치가 아니라 자동으로 계산되는 View이다.

단, `기본함(Inbox)`만 예외로 실제 Task의 임시 소유 Container가 된다.

### 오늘

다음 조건에 해당하는 Task를 자동 수집한다.

```text
active AND (
  effectiveDueDate < today
  OR effectiveDueDate == today
  OR Task가 사용자의 오늘 계획(TodayPlan)에 포함됨
)
```

즉 기한이 지난 미완료 Task도 canonical Today Scope에 포함하며 UI에서는 `기한 지남` 그룹으로 분리한다.

원래 List 소속은 변경하지 않는다.

> Today는 Container가 아니라 Query이다.

### 다음 7일

오늘부터 향후 7일 내 일정이 있는 Task를 자동 수집한다.

```text
today <= dueDate <= today + 6 days
```

원래 List 소속은 유지한다.

---

## 1.6 기본함(Inbox)

Inbox는 **1급 객체(first-class container)** 로 취급한다.

목적:

> 어디에 넣을지 아직 결정하지 않은 Task를 가장 빠르게 받는 곳.

예:

```text
생각남
 ↓
빠른 추가
 ↓
"교수님께 자료 확인"
 ↓
Inbox
```

이후 사용자가 실제 List로 정리한다.

```text
Inbox
   ↓
학교 / ABM 연구
```

Task를 다음처럼 애매하게 두지 않는다.

```text
projectId = null
listId = null
```

대신 canonical data model에서는 모든 활성 Task가 정확히 하나의 `List`를 가진다.

```text
Task.listId =
  Inbox system List ID
  OR
  Regular List ID
```

즉 Inbox는 별도 owner 타입이 아니라 `kind=inbox`인 시스템 List다.

Task는 항상 하나의 List를 owner로 가지며 `listId = null` 상태를 허용하지 않는다.

---

## 1.7 List

List는 사용자가 가장 직접적으로 이해하는 실제 작업 저장 단위다.

예:

```text
논문
영어 공부
Todo App
블로그
해야 하는 일
```

특정 List에서 `+ 작업`을 누르면 별도 위치 선택 없이 해당 List에 생성한다.

---

## 1.8 Folder

Folder의 역할은 **List 정리**다.

```text
학교
├─ ABM 연구
├─ 수업
└─ 영어 공부
```

Folder 자체는 Task를 소유하지 않는다.

원칙:

> Task는 Folder가 아니라 List에 속한다. Inbox도 `kind=inbox`인 List의 한 종류다.

Folder를 클릭하면 하위 List Task를 집계해서 보여줄 수 있지만, 이것은 Aggregated View다.

---

## 1.9 Tag

Tag는 Task의 위치가 아니라 횡단 분류 속성이다.

```text
#중요
#학교
#읽기
#기다리는중
```

하나의 Task가 여러 Tag를 가질 수 있다.

```text
논문 읽기

List:
ABM 연구

Tags:
#학교
#읽기
#중요
```

정의:

```text
List = Task가 어디에 있는가
Tag  = Task가 어떤 성격인가
```

---

## 1.10 Filter

Filter는 사용자가 정의한 Query다.

예:

```text
중요 + 오늘
학교 + 미완료
다음 7일 + 연구
마감일 없음
```

Filter 자체는 Task를 소유하지 않는다.

Filter에서 생성할 때 정확히 하나의 List가 positive 조건으로 결정되면 해당 List를 owner로 사용한다.
그렇지 않으면 canonical default owner인 Inbox에 생성한다.

생성 가능한 positive Filter 조건만 자동 적용하며, 임의 Regular List를 자동 선택하지 않는다.

---

## 1.11 Completed

Completed는 별도 List가 아니다.

```text
Task.completedAt != null
AND Task.deletedAt == null
```

인 Task를 모아 보는 시스템 View다.

완료 여부의 canonical source는 `completedAt` 하나를 사용한다.

완료 시 원래 List 관계를 삭제하거나 이동하지 않는다.

---

## 1.12 Trash

삭제된 Task를 임시 보존하는 시스템 영역이다.

```text
Task
 ↓ delete

Trash
 ↓
restore / permanent delete
```

Trash Task는 일반 Smart List, Calendar, 일반 Search 결과에서 제외한다.

---

## 1.13 기존 Space / Project / Folder / List와의 관계

가장 중요한 원칙:

> UI IA와 데이터 계층을 1:1로 강제하지 않는다.

내부 데이터가 다음처럼 연결되어 있더라도:

```text
Space
└─ Project
   └─ Folder
      └─ List
         └─ Task
```

Tasks Module에서 전체 계층을 그대로 노출할 필요가 없다.

Presentation IA에서는:

```text
학교
├─ ABM 연구
├─ 영어 공부
└─ 수업

개인
├─ Todo App
└─ 블로그
```

처럼 단순화할 수 있다.

---

## 1.14 Presentation IA와 Domain IA 분리

```text
DOMAIN IA
Space
Project
Folder
List
Task
Tag
```

```text
PRESENTATION IA
오늘
다음 7일
기본함

학교
 ├ ABM 연구
 └ 수업

개인
 ├ Todo App
 └ 블로그

태그
필터
```

Presentation IA는 사용자가 알아야 할 구조만 보여준다.

---

## 1.15 Main Workbench의 의미

Sidebar 선택에 따라 오른쪽 Main Workbench만 변경한다.

```text
Sidebar: 오늘
→ Main: 오늘의 Task
```

```text
Sidebar: ABM 연구
→ Main: ABM 연구 Task
```

```text
Sidebar: #중요
→ Main: 중요 Tag Task
```

App Shell은 유지한다.

```text
Rail      고정
Sidebar   구조 유지
Main      선택에 따라 변경
```

---

## 1.16 객체별 역할 정의

| 객체 | Task 소유 가능 | Task 집계 | 사용자 생성 | 주요 역할 |
|---|---:|---:|---:|---|
| Today | X | O | X | 오늘 작업 |
| Next 7 Days | X | O | X | 예정 작업 |
| Inbox | O | O | 시스템 | 미분류 Task |
| Folder | X | O | O | List 그룹 |
| List | O | O | O | Task 저장 |
| Tag | X | O | O | 횡단 분류 |
| Filter | X | O | O | 사용자 Query |
| Completed | X | O | X | 완료 작업 |
| Trash | X | O | X | 삭제 복구 |
| Space | 간접 | O | O | 프로젝트 관리 범위 |
| Project | 간접 | O | O | 프로젝트 구조 |

---

## 1.17 Task 생성 원칙

### Case A — 소유 위치가 명확

```text
Inbox
+ 작업
→ Inbox에 생성
```

```text
ABM 연구 List
+ 작업
→ ABM 연구 List에 생성
```

### Case B — Context별 owner 결정 규칙

Folder처럼 **현재 Context 자체가 owner가 아니고 선택 가능한 하위 List가 의미의 일부인 경우**에는 List 선택이 필수다.

```text
학교 Folder
+ 작업
→ 하위 List 선택 필수
```

반대로 Tag / Filter처럼 Query Scope에서 owner가 명확하지 않은 경우에는 canonical default owner인 Inbox를 사용한다.

```text
#중요 Tag
+ 작업
→ Inbox에 생성
→ #중요 자동 적용
```

```text
Filter
+ 작업
→ 단일 List 조건이면 해당 List
→ 아니면 Inbox
→ 생성 가능한 positive 조건 자동 적용
```

공통 규칙은 UI마다 다시 판단하지 않고 `resolveCreateContext(scope, localContext)`로 통합한다.

```text
Create Context 해석
   ↓
정확한 owner List가 결정되는가?
   ├─ Yes → 해당 List
   ├─ Folder → 사용자 List 선택 필수
   └─ Query Scope(Tag/Filter 등) → canonical Inbox default
```

사용자 몰래 임의 Regular List로 fallback하지 않는다.

---

## 1.18 기본 진입 화면

기본 Module:

```text
Tasks
```

기본 Scope:

```text
오늘
```

따라서 기본 흐름:

```text
App 실행
   ↓
Tasks
   ↓
오늘
```

마지막 열었던 위치 복원 여부는 추후 URL/상태 설계에서 확정한다.

---

## 1.19 Navigation 일관성

```text
Rail 선택
= Module 변경

Sidebar 선택
= Scope 변경

Main View 선택
= 같은 Scope를 다른 방식으로 보기
```

즉:

```text
WHERE = Sidebar
HOW   = View
```

로 분리한다.

---

## 1.20 IA에서 금지할 것

1. 모든 Domain 계층을 Sidebar에 그대로 노출하지 않는다.
2. Folder와 List를 같은 Task Container처럼 처리하지 않는다.
3. Smart List에서 Task를 복제하지 않는다.
4. 완료 시 별도 List로 Task를 이동하지 않는다.
5. 모호한 Context에서 임의 Regular List를 선택하지 않는다. Query Scope의 canonical Inbox fallback은 §12 Create Resolver를 따른다.
6. Space 구조를 Tasks 메인 경험에 강제로 노출하지 않는다.

---

## 1.21 최종 IA

```text
APP
│
├── TASKS
│   │
│   ├── Smart Lists
│   │   ├── 오늘
│   │   ├── 다음 7일
│   │   └── 기본함
│   │
│   ├── Lists
│   │   ├── 학교
│   │   │   ├── ABM 연구
│   │   │   ├── 수업
│   │   │   └── 영어 공부
│   │   │
│   │   └── 개인
│   │       ├── Todo App
│   │       └── 블로그
│   │
│   ├── Tags
│   ├── Filters
│   ├── Completed
│   └── Trash
│
├── CALENDAR
├── SPACES
│   └── Space
│       ├── Overview
│       ├── List
│       ├── Board
│       ├── Gantt
│       ├── Calendar
│       ├── Goals
│       └── Horizons
│
├── FOCUS
├── SEARCH
└── SETTINGS
```

---

## 1.22 §1 확정 결정

- **D1.** Tasks를 앱의 기본 작업 경험으로 사용한다.
- **D2.** Tasks는 `Smart Lists → Lists → Tags → Filters → Completed/Trash` 구조를 사용한다.
- **D3.** Task의 유일한 직접 소유 단위는 `List`이며, Inbox는 `kind=inbox`인 시스템 List다.
- **D4.** Folder는 List를 그룹화하지만 Task를 직접 소유하지 않는다.
- **D5.** Today / Next 7 Days / Tag / Filter / Completed는 Query View다.
- **D6.** 기존 Space/Project 계층은 유지하되 Tasks 메인 UI에는 필요 이상 노출하지 않는다.
- **D7.** Space는 고급 프로젝트 관리 Module로 분리한다.
- **D8.** Rail은 Module, Sidebar는 Scope, Main View는 표시 방식을 담당한다.
- **D9.** Task 생성 owner는 §12 `resolveCreateContext`를 따른다. List/Inbox처럼 명확하면 즉시 생성하고, Folder는 List 선택을 요구하며, Tag/Filter처럼 Query Scope에서 owner가 불명확하면 canonical Inbox default를 사용한다.
- **D10.** Presentation IA와 Domain IA를 의도적으로 분리한다.

---

# 2. Rail + Sidebar 세부 설계

## 2.1 목적

§2의 목표는 TickTick의 좌측 탐색 경험을 최대한 가깝게 구현하는 것이다.

사용자는 Sidebar를 보자마자 다음을 즉시 알아야 한다.

```text
1. 지금 어디를 보고 있는가
2. 오늘/예정/기본함으로 어떻게 이동하는가
3. 내가 만든 List는 어디 있는가
4. Tag와 Filter는 어디 있는가
5. 완료/휴지통은 어디 있는가
```

Sidebar는 정보 밀도가 높지만 복잡해 보이지 않아야 한다.

---

## 2.2 전체 좌측 구조

좌측은 2개 층으로 분리한다.

```text
┌──────┬─────────────────────┐
│ Rail │ Sidebar             │
│      │                     │
│ 52px │ 220~260px           │
│      │                     │
└──────┴─────────────────────┘
```

### Rail
- 앱 Module 이동
- 항상 고정
- 아이콘 중심
- 텍스트 최소

### Sidebar
- 현재 Module 내부 탐색
- Tasks를 선택했을 때 Smart List / List / Tag / Filter 표시
- 스크롤 가능

---

## 2.3 Rail 기본 사양

### 권장 크기

```text
width: 48~56px
default: 52px
```

### Rail 아이콘 순서

상단:

```text
[앱 로고]

Tasks
Calendar
Spaces
Focus
Search
```

하단:

```text
Settings
```

필요 시 프로필/동기화 상태는 Settings 근처에 둔다.

### 금지

Rail에 다음을 직접 넣지 않는다.

```text
특정 Space
특정 Project
특정 List
특정 Tag
```

Rail은 Module 선택만 담당한다.

---

## 2.4 Rail 선택 상태

현재 Module은 다음 3가지 신호 중 최소 2가지를 사용한다.

1. 배경 강조
2. 아이콘 색 강조
3. 얇은 선택 Indicator

예:

```text
┌────┐
│ ✓  │ ← Tasks selected
└────┘
```

선택되지 않은 아이콘은 중립 상태를 유지한다.

Hover와 Selected가 시각적으로 구분되어야 한다.

---

## 2.5 Rail Hover

Hover 시 Tooltip을 제공한다.

예:

```text
[✓]  → "작업"
[▣]  → "공간"
[◎]  → "집중"
```

Tooltip은 약 300~500ms 이후 나타나도록 한다.

클릭하지 않아도 아이콘의 의미를 학습할 수 있어야 한다.

---

## 2.6 Sidebar 폭

기본 권장:

```text
240px
```

허용 범위:

```text
220px ~ 280px
```

TickTick처럼 한눈에 List와 Count를 볼 수 있으면서 Main 영역을 과도하게 침범하지 않는 수준으로 유지한다.

### 최소 폭

```text
220px
```

그 이하로 줄이지 않는다.

텍스트 잘림이 과도해지고 Count와 Action이 겹치기 때문이다.

---

## 2.7 Sidebar 전체 섹션 순서

Tasks Module Sidebar는 다음 순서로 고정한다.

```text
① Smart Lists
   오늘
   다음 7일
   기본함

② Lists
   Folder / List Tree

③ Tags

④ Filters

⑤ Completed
⑥ Trash
```

시각화:

```text
오늘                      5
다음 7일                  12
기본함                    10

─────────────────────────

리스트                 ＋

▾ 학교
   ABM 연구              7
   수업                   5
   영어 공부              4

▾ 개인
   Todo App               6
   블로그                  4

─────────────────────────

태그                   ＋

● 중요                    7
● 기다리는 중             3
● 읽기                    4

─────────────────────────

필터                   ＋

중요한 오늘
마감 없음

─────────────────────────

완료
휴지통
```

---

## 2.8 Smart Lists 세부 규칙

Smart Lists는 Sidebar 최상단에 항상 표시한다.

기본 순서:

```text
오늘
다음 7일
기본함
```

사용자가 순서를 바꾸지 못하게 하는 것을 기본값으로 한다.

이유:
- 앱의 핵심 탐색 축이기 때문
- 위치 기억을 안정적으로 유지하기 때문

---

## 2.9 Smart List 아이콘

각 Smart List는 고유 아이콘을 가진다.

예:

```text
오늘       해/체크 계열
다음 7일   달력 계열
기본함     Inbox 계열
```

텍스트만 표시하지 않는다.

TickTick처럼 빠른 시각 탐색이 가능해야 한다.

---

## 2.10 Count Badge

각 Sidebar 항목 오른쪽에는 해당 Scope의 **미완료 Task 수**를 표시한다.

예:

```text
오늘          5
ABM 연구      7
```

기본적으로 완료 Task는 Count에서 제외한다.

### Count = 0

0은 기본적으로 숨긴다.

```text
오늘
```

처럼 표현한다.

다만 사용자가 명시적으로 Count를 항상 표시하도록 설정하는 옵션은 향후 추가 가능하다.

### Count가 큰 경우

```text
99+
```

처럼 제한한다.

Sidebar 폭이 숫자 때문에 흔들리지 않게 한다.

---

## 2.11 Smart List 선택 상태

현재 선택된 항목은 Row 전체에 부드러운 배경을 적용한다.

```text
┌──────────────────────┐
│ 오늘              5   │  ← selected
└──────────────────────┘
```

Text, Icon, Count 모두 선택 상태를 공유한다.

Indicator만 바뀌고 Row 배경이 그대로인 디자인은 피한다.

현재 위치를 한눈에 알아야 하기 때문이다.

---

## 2.12 Lists 섹션

Smart Lists 아래에 Lists 섹션을 둔다.

Header:

```text
리스트                      +
```

### Header 역할

- 섹션 이름
- 새 List/Folder 생성 진입점
- 섹션 접기/펼치기

권장 상호작용:

- `리스트` 텍스트 또는 Chevron 클릭 → 섹션 collapse
- `+` 클릭 → 생성 메뉴

---

## 2.13 Lists `+` 메뉴

`+`를 클릭하면 작은 메뉴를 연다.

```text
새 리스트
새 폴더
```

Space / Project 같은 고급 객체를 여기서 만들지 않는다.

그 기능은 Spaces Module에서 담당한다.

---

## 2.14 Folder 표시

Folder Row 예:

```text
▾ 학교
```

접힌 상태:

```text
▸ 학교
```

Folder는 기본적으로 다음 요소를 가진다.

```text
Chevron
Folder icon 또는 optional icon
Folder name
Hover actions
```

Task count는 기본적으로 Folder에 표시하지 않는 것을 권장한다.

이유:
- Folder는 직접 Task를 소유하지 않음
- 하위 List 집계 Count는 오해 가능성이 있음

필요 시 향후 aggregated count 옵션으로 추가 가능하다.

---

## 2.15 List 표시

List Row 예:

```text
   ● ABM 연구             7
```

구성:

```text
Indent
Color dot / List icon
Name
Count
```

List에는 색상 Dot을 지원한다.

이 색은:
- Sidebar 식별
- Task 카드의 List 표시
- Calendar 표시

등에 재사용할 수 있다.

---

## 2.16 들여쓰기 규칙

Folder와 List 관계를 한 단계 들여쓰기로 표현한다.

예:

```text
▾ 학교
   ● ABM 연구
   ● 수업
   ● 영어 공부
```

### 권장 Depth

Tasks Sidebar에서는 표시 Depth를 가급적 2단계로 제한한다.

```text
Folder
└─ List
```

내부 Domain에 더 깊은 계층이 있어도 Tasks Sidebar에 그대로 투영하지 않는다.

깊은 계층은 Spaces에서 관리한다.

---

## 2.17 Nested Folder

TickTick에 가까운 단순성을 유지하기 위해 **Folder 안에 Folder**는 Tasks Sidebar에서 지원하지 않는 것을 권장한다.

즉:

```text
Folder
└─ List
```

까지만 허용한다.

금지:

```text
Folder
└─ Folder
   └─ Folder
      └─ List
```

기존 Domain에 Subfolder가 존재하더라도 Tasks Presentation IA에서는 평탄화하거나 상위 Folder 기준으로 재표현한다.

---

## 2.18 List 선택

List를 클릭하면 Main Scope가 해당 List로 변경된다.

```text
Sidebar:
ABM 연구
   ↓

Main:
ABM 연구
```

Rail과 Sidebar는 그대로 유지한다.

페이지 전체를 교체하는 느낌이 아니라 Main Content만 즉시 변경한다.

---

## 2.19 Folder 선택

Folder를 클릭하는 동작과 Chevron 클릭을 분리한다.

### Chevron 클릭
접기/펼치기만 수행.

### Folder 이름 클릭
해당 Folder 하위 모든 List Task를 집계한 View를 연다.

예:

```text
학교
├─ ABM 연구
├─ 수업
└─ 영어 공부
```

`학교` 클릭:

```text
Main Scope = 학교 Folder
```

Task는 집계해서 표시한다.

단, Folder에서 `+ 작업`을 누르면 어느 List에 넣을지 선택하게 한다.

---

## 2.20 Folder Aggregate View의 표시

Folder 선택 시 Main Header:

```text
학교
3개 리스트 · 작업 16개
```

Task 수는 현재 Folder 하위 List들의 현재 Scope 기준으로 계산한다.

Folder가 Task를 소유하는 것처럼 보이게 표현하지 않는다.

---

## 2.21 Tags 섹션

Lists 아래에 Tags 섹션을 둔다.

```text
태그                       +
```

각 Tag:

```text
● 중요                     7
● 기다리는 중              3
● 읽기                     4
```

색상 사용 가능.

Tag 클릭 → 해당 Tag Query View.

---

## 2.22 Tag 생성

`태그 +` 클릭:

```text
새 태그
```

Tag 생성 시 최소 필드:

```text
name
optional color
```

Folder 구조와 분리한다.

---

## 2.23 Filters 섹션

Tags 아래에 Filters 섹션을 둔다.

예:

```text
필터                       +

중요한 오늘
마감 없음
학교 + 이번 주
```

Filter는 사용자가 저장한 Query다.

Filter 클릭 → Main Scope를 해당 Query로 변경한다.

---

## 2.24 Completed / Trash 위치

Completed와 Trash는 Sidebar 최하단에 둔다.

```text
완료
휴지통
```

Lists / Tags / Filters와 시각적으로 분리한다.

이 둘은 사용 빈도가 낮고 시스템 관리 성격이 강하기 때문이다.

---

## 2.25 Sidebar Scroll

Sidebar는 독립적으로 스크롤한다.

```text
Rail        fixed
Sidebar     own scroll
Main        own scroll
```

Main Content를 스크롤해도 Sidebar 위치가 움직이지 않는다.

---

## 2.26 Smart Lists Sticky

Sidebar가 길어진 경우 Smart Lists를 화면 상단에 고정할 수 있다.

권장 구조:

```text
[Smart Lists]  ← sticky

[Lists]
[Tags]
[Filters]
[Completed]
[Trash]        ← scroll
```

단, 작은 화면에서는 고정 영역이 너무 커지지 않게 한다.

---

## 2.27 Section Collapse

다음 섹션은 접을 수 있다.

```text
Lists
Tags
Filters
```

Smart Lists는 기본적으로 접지 않는다.

Completed / Trash도 별도 collapse가 필요 없다.

상태는 사용자별로 저장한다.

---

## 2.28 Long Name 처리

List / Tag / Filter 이름이 길 경우 한 줄 ellipsis를 사용한다.

예:

```text
매우 긴 프로젝트 관련 연구...
```

Hover 시 Tooltip으로 전체 이름을 보여준다.

Row 높이를 이름 길이에 따라 늘리지 않는다.

Sidebar의 수직 리듬을 유지하기 위해서다.

---

## 2.29 Row 높이

권장:

```text
32~38px
default: 36px
```

Smart List, List, Tag, Filter 모두 기본 Row 높이를 동일하게 유지한다.

Folder Header도 동일하거나 최대 2px 정도만 크게 한다.

---

## 2.30 Hover Action

일반 상태에서는 Row를 최대한 단순하게 유지한다.

Hover 시 오른쪽에 `...` 또는 필요한 Action을 표시한다.

예:

```text
ABM 연구            7  ...
```

클릭 시 Context Menu.

---

## 2.31 List Context Menu

List `...` 메뉴:

```text
이름 변경
색상 변경
폴더로 이동
복제
내보내기
보관
삭제
```

MVP에서는 최소:

```text
이름 변경
색상 변경
이동
삭제
```

만 구현해도 된다.

---

## 2.32 Folder Context Menu

Folder:

```text
이름 변경
새 리스트
삭제
```

삭제 시 하위 List를 함께 삭제하지 않는다.

권장 기본 동작:

```text
Folder 삭제
→ 하위 List를 루트 Lists로 이동
```

파괴적인 삭제를 피한다.

---

## 2.33 Tag Context Menu

```text
이름 변경
색상 변경
삭제
```

Tag 삭제는 Task를 삭제하지 않는다.

단순히 해당 Tag 관계만 제거한다.

---

## 2.34 Drag & Drop — List 이동

List Row를 Drag하여 다음이 가능하다.

```text
루트 → Folder
Folder → 다른 Folder
Folder → 루트
```

Drop target은 명확한 Highlight를 보여준다.

---

## 2.35 Drag & Drop — Folder 순서

Folder끼리 순서를 바꿀 수 있다.

동일 Folder 안 List 순서도 Drag로 조정할 수 있다.

따라서 사용자 지정 정렬 순서를 저장한다.

```text
sortOrder
```

가 필요하다.

---

## 2.36 Drag & Drop에서 금지

Sidebar에서 Task 자체를 Drag하지 않는다.

Task Drag는 Main Workbench에서 담당한다.

Sidebar는 Navigation 구조만 다룬다.

단, 향후 Task를 특정 List Row 위로 Drag해서 소속을 변경하는 고급 기능은 P2 이후 고려 가능하다.

---

## 2.37 Sidebar `+`의 규칙

전역 `+` 하나로 모든 객체를 만들지 않는다.

각 섹션의 `+`는 해당 타입만 생성한다.

```text
Lists +   → List / Folder
Tags +    → Tag
Filters + → Filter
```

생성 결과가 예측 가능해야 한다.

---

## 2.38 Sidebar Resize

데스크톱에서는 Sidebar 폭 조절을 지원할 수 있다.

Resize handle:

```text
Sidebar | Main
        ↑
```

권장 제약:

```text
min: 220px
default: 240px
max: 320px
```

MVP에서 꼭 필요하지 않다면 후순위로 둔다.

---

## 2.39 Sidebar Collapse

Main 공간이 필요한 경우 Sidebar 전체를 접을 수 있다.

예:

```text
Rail | Sidebar | Main
         ↓ collapse

Rail | Main
```

다시 펼칠 수 있는 명확한 버튼을 Rail 또는 Main Header에 제공한다.

Rail 자체는 유지한다.

---

## 2.40 작은 화면 대응

폭이 좁아질 경우 우선순위:

```text
Desktop
Rail + Sidebar + Main

Medium
Rail + collapsible Sidebar + Main

Small
Sidebar overlay / drawer + Main
```

Mobile 수준의 세부 설계는 별도 문서에서 다룬다.

---

## 2.41 Keyboard Navigation

Sidebar는 최소한 다음 키보드 동작을 지원하는 것이 좋다.

```text
↑ / ↓  항목 이동
Enter  선택
← / → Folder 접기/펼치기
```

검색 중심 사용자 경험을 위해 향후 Command Palette와도 연결할 수 있다.

---

## 2.42 Empty State

### Lists 없음

```text
리스트가 없습니다.
+ 새 리스트
```

### Tags 없음

```text
태그가 없습니다.
+ 새 태그
```

단, Sidebar에서 Empty State가 지나치게 큰 영역을 차지하지 않게 한다.

한두 줄 정도로 최소화한다.

---

## 2.43 Error State

List/Tag Count 계산이나 동기화가 실패해도 Sidebar 전체가 깨지면 안 된다.

예:

```text
ABM 연구       —
```

또는 Count만 숨기고 탐색 기능은 유지한다.

Navigation은 derived metadata보다 우선한다.

---

## 2.44 Loading State

앱 실행 시 Sidebar 전체 Skeleton을 길게 보여주기보다:

1. Smart List Shell 즉시 표시
2. List/Tag 데이터 로드
3. Count는 후속 로드

순으로 보여주는 것을 권장한다.

사용자가 앱이 즉시 열린다고 느끼게 해야 한다.

---

## 2.45 Count 계산 범위

Sidebar Count는 항상 해당 Scope의 **활성 미완료 Task**를 기준으로 한다.

예:

```text
ABM 연구 7
```

은:

```text
해당 List
AND not completed
AND not trashed
```

Task 수다.

Folder Count를 향후 보여주는 경우 하위 List를 집계한다.

---

## 2.46 Sidebar와 URL 관계

Sidebar에서 Scope가 바뀌면 URL도 함께 바뀌도록 설계한다.

예:

```text
오늘
→ /today

기본함
→ /inbox

ABM 연구
→ /list/:listId

학교 Folder
→ /folder/:folderId

중요 Tag
→ /tag/:tagId

중요한 오늘 Filter
→ /filter/:filterId
```

정확한 URL 규칙은 §5에서 최종 확정한다.

---

## 2.47 Sidebar와 Main Header 관계

Sidebar가 Navigation의 현재 Scope를 결정한다.

따라서 Main Header는 Sidebar 선택을 그대로 반영한다.

예:

```text
Sidebar selected:
ABM 연구

Main Header:
ABM 연구
```

다만 Main의 작업 수, 완료율 등 derived 정보는 현재 Scope 기준으로 계산한다.

---

## 2.48 Sidebar Visual Density

TickTick처럼 비교적 조밀하지만 숨막히지 않게 설계한다.

권장:

```text
Row: 36px
Section gap: 14~20px
Horizontal padding: 10~14px
Indent: 16~20px
```

메뉴 항목 사이에 과도한 Card UI나 Border를 사용하지 않는다.

Sidebar는 목록형 Navigation이어야 한다.

---

## 2.49 Sidebar에서 피해야 할 디자인

다음은 금지한다.

### ① 모든 Row를 Card처럼 표시

Sidebar가 무거워진다.

### ② 항목마다 항상 `...`, `+`, Drag handle 노출

정보 밀도가 지나치게 높아진다.

### ③ Folder에 Task 생성 버튼 직접 노출

소유 위치가 모호해진다.

### ④ Space / Project / Folder / List를 동시에 여러 Depth로 표시

TickTick형 단순성이 무너진다.

### ⑤ Count와 Main 실제 결과가 다르게 계산

사용자의 신뢰를 깨뜨린다.

---

## 2.50 Sidebar 기본 와이어프레임

```text
┌─────┬────────────────────────┐
│     │  오늘               5   │
│ ✓   │  다음 7일           12  │
│     │  기본함             10  │
│ ▣   │                        │
│     │ ─────────────────────  │
│ ◎   │  리스트            ＋   │
│     │                        │
│ ◫   │ ▾ 학교                 │
│     │    ● ABM 연구       7   │
│ ⌕   │    ● 수업            5   │
│     │    ● 영어 공부       4   │
│     │                        │
│     │ ▾ 개인                 │
│     │    ● Todo App       6   │
│     │    ● 블로그          4   │
│     │                        │
│     │ ─────────────────────  │
│     │  태그              ＋   │
│     │  ● 중요             7   │
│     │  ● 기다리는 중      3   │
│     │  ● 읽기             4   │
│     │                        │
│     │  필터              ＋   │
│     │  중요한 오늘           │
│     │  마감 없음             │
│     │                        │
│     │ ─────────────────────  │
│ ⚙   │  완료                  │
│     │  휴지통                │
└─────┴────────────────────────┘
  Rail       Sidebar
```

---

## 2.51 §2 확정 결정

- **S1.** 좌측은 `Rail + Sidebar` 2층 구조로 고정한다.
- **S2.** Rail은 Module만 선택하며 Space/List/Tag 같은 항목을 넣지 않는다.
- **S3.** Tasks Sidebar 순서는 `Smart Lists → Lists → Tags → Filters → Completed/Trash`로 한다.
- **S4.** Smart Lists는 `오늘 → 다음 7일 → 기본함` 순서를 기본 고정한다.
- **S5.** Sidebar Count는 해당 Scope의 미완료 Task 수를 표시한다.
- **S6.** Count가 0이면 기본적으로 숨긴다.
- **S7.** Folder는 Task를 소유하지 않으며 Folder 이름 클릭 시 Aggregated View를 연다.
- **S8.** Tasks Sidebar의 표시 Depth는 `Folder → List` 2단계까지만 유지한다.
- **S9.** Nested Folder는 Tasks Presentation IA에서 기본 지원하지 않는다.
- **S10.** Section Header의 `+`는 해당 객체만 생성한다.
- **S11.** Row의 부가 Action은 Hover에서 노출한다.
- **S12.** Sidebar는 독립 Scroll을 사용한다.
- **S13.** List/Folder는 Drag & Drop으로 정렬·이동할 수 있다.
- **S14.** Main Header와 Sidebar 선택 Scope는 항상 일치해야 한다.
- **S15.** Scope 변경은 향후 URL과 동기화한다.
- **S16.** Sidebar 기본 폭은 약 240px, Rail은 약 52px로 설계한다.
- **S17.** Sidebar 전체는 접을 수 있지만 Rail은 유지한다.
- **S18.** Navigation 기능은 Count/metadata 로딩보다 우선해서 표시한다.

---

---

# 3. Main Workbench / 메인 작업 영역 세부 설계

## 3.1 목적

Main Workbench는 사용자가 실제로 Task를 보고, 만들고, 이동하고, 완료하고, 세부 내용을 여는 핵심 작업 영역이다.

TickTick의 메인 화면처럼 다음 세 가지를 가장 우선한다.

```text
1. 현재 보고 있는 Scope가 무엇인지 즉시 알 수 있어야 한다.
2. 새 작업을 최대한 빠르게 추가할 수 있어야 한다.
3. 작업을 열지 않아도 핵심 상태를 파악하고 바로 조작할 수 있어야 한다.
```

Main Workbench는 대시보드처럼 많은 정보를 한 번에 보여주는 화면이 아니라, **현재 Scope 안에서 Task를 처리하는 작업면(work surface)** 으로 정의한다.

---

## 3.2 Main Workbench 기본 구조

전체 Main 영역은 다음 4개 층으로 구성한다.

```text
┌─────────────────────────────────────────────────────────────┐
│ ① Main Header                                               │
│ 제목 / Scope 정보 / + 작업 / 더보기                           │
├─────────────────────────────────────────────────────────────┤
│ ② View Toolbar                                              │
│ List / Board / Calendar 등 현재 Scope에서 허용되는 보기        │
├─────────────────────────────────────────────────────────────┤
│ ③ Main Content                                             │
│ Task List 또는 Board Columns                                │
├─────────────────────────────────────────────────────────────┤
│ ④ Optional Detail Drawer                                   │
│ Task 클릭 시 우측에서 열리는 상세 패널                         │
└─────────────────────────────────────────────────────────────┘
```

기본적으로 ①~③은 항상 존재하고, ④는 Task를 선택했을 때만 열린다.

---

## 3.3 Main Header 역할

Main Header는 다음 질문에 답해야 한다.

> 지금 무엇을 보고 있는가?

Header 구성:

```text
[Title]                           [+ 작업] [...]
[보조 정보]
```

예:

```text
기본함                            + 작업   ...
미분류 1 · 일정 1 · 언젠가 8
```

또는:

```text
ABM 연구                          + 작업   ...
작업 7개 · 완료 3개
```

### Header에 넣을 것

- 현재 Scope 이름
- 현재 Scope 기준 Task Count
- 선택적 보조 정보
- `+ 작업`
- 더보기 `...`

### Header에 넣지 않을 것

- 너무 많은 KPI
- 여러 Progress card
- Space 전체 통계
- 긴 설명문
- Project 전체 데이터와 현재 Scope 데이터 혼용

TickTick처럼 상단은 최대한 가볍게 유지한다.

---

## 3.4 Header Identity와 Scope 정보 분리

§1에서 정한 원칙을 Main에서도 그대로 적용한다.

```text
Identity = 현재 선택한 Resource
Derived information = 현재 Scope 기준
```

예:

```text
Sidebar selected:
학교 Folder

Main Header:
학교
3개 리스트 · 미완료 16개
```

또는:

```text
Sidebar selected:
ABM 연구 List

Main Header:
ABM 연구
미완료 7개 · 완료 3개
```

현재 화면에 보이지 않는 외부 Scope Task를 Count나 추천에 포함하지 않는다.

---

## 3.5 `+ 작업` 기본 위치

Main Header 우측에 항상 동일한 위치를 사용한다.

```text
Title                               + 작업
```

다만 `+ 작업`의 동작은 현재 Scope에 따라 달라진다.

### Inbox

```text
+ 작업
→ Inbox에 즉시 생성
```

### List

```text
+ 작업
→ 해당 List에 즉시 생성
```

### Folder

```text
+ 작업
→ 하위 List 선택
→ 선택한 List에 생성
```

### Tag

```text
+ 작업
→ 기본 owner = Inbox
→ 현재 Tag 자동 적용
```

Quick Add에서 사용자가 List를 직접 선택하면 해당 List로 override할 수 있다.

### Filter

Filter가 정확히 하나의 List를 positive 조건으로 결정하면 해당 List에 즉시 생성한다.

그 외에는:

```text
+ 작업
→ 기본 owner = Inbox
```

필터 조건 중 생성 가능한 positive 속성만 자동 적용할 수 있다.

예:

```text
Filter = #중요 + 오늘
```

이라면 생성 후:

```text
tag = 중요
dueDate = today
```

를 자동 적용할 수 있다.

단, 조건이 모순되거나 생성 불가능한 조건이면 자동 적용하지 않는다.

---

## 3.6 Quick Add

TickTick처럼 `+ 작업`을 누른 뒤 별도의 큰 Modal로 이동하지 않는다.

기본 동작은 Main 영역 안에 **inline quick add**를 연다.

예:

```text
+ 작업
   ↓

┌────────────────────────────────────┐
│ 작업 이름 입력...                  │
│ 오늘   우선순위   태그   리스트      │
└────────────────────────────────────┘
```

Enter:

```text
Task 생성
```

Shift+Enter 또는 확장 버튼:

```text
상세 입력
```

Esc:

```text
Quick Add 닫기
```

---

## 3.7 Quick Add 최소 입력 필드

첫 화면에서는 다음만 노출한다.

```text
Title
Due date
Priority
Tag
List
```

다음은 기본 Quick Add에 노출하지 않는다.

```text
긴 Description
Attachment
Checklist 전체
Activity log
복잡한 반복 규칙
```

이 항목은 Task Detail Drawer에서 편집한다.

---

## 3.8 View Toolbar

Header 아래에 View Toolbar를 둔다.

예:

```text
List   Board   Calendar
```

또는 Scope에 따라:

```text
List   Board
```

현재 선택 View는 명확히 표시한다.

### 원칙

```text
Sidebar = WHERE
View     = HOW
```

View를 변경해도 Scope는 바뀌지 않는다.

예:

```text
ABM 연구 / List
→
ABM 연구 / Board
```

이지:

```text
ABM 연구
→
다른 Project
```

가 아니다.

---

## 3.9 기본 View

TickTick과 유사한 일상 작업 경험을 위해 기본 View는 Scope 종류에 따라 다르게 둔다.

| Scope | 기본 View |
|---|---|
| Today | List |
| Next 7 Days | List |
| Inbox | List |
| Folder | List |
| List | List |
| Tag | List |
| Filter | List |
| Completed | List |
| Trash | List |

사용자가 특정 Scope의 View를 변경한 기록은 앱 내부 preference로 기억할 수 있다.

예:

```text
ABM 연구 → Board
```

다만 직접 URL 진입·새로고침·공유 링크에서는 URL이 source of truth이며, `?view=`가 없으면 system default인 List를 사용한다.

```text
/list/lst_abm           → List
/list/lst_abm?view=board → Board
```

Saved preference가 canonical URL 의미를 바꾸면 안 된다.

---

## 3.10 List View 기본 구조

TickTick처럼 List View는 한 줄 한 Task 방식으로 조밀하게 구성한다.

```text
□ 작업 제목                              오늘
  List / Tag / Priority
```

권장 Row 구성:

```text
Checkbox
Title
Optional metadata
Due date
Hover actions
```

### 예

```text
□ 교수님께 자료 보내기              오늘
  ABM 연구 · #중요
```

---

## 3.11 List Row 정보 우선순위

항상 보여줄 정보:

```text
Checkbox
Title
```

조건부 표시:

```text
Due date
Priority
List
Tag
Subtask count
Reminder icon
Repeat icon
```

모든 metadata를 항상 노출하지 않는다.

한 Task에 정보가 많아도 1~2줄을 넘기지 않는 것을 기본으로 한다.

---

## 3.12 List Row 높이

권장:

```text
기본: 44~52px
2줄 metadata 포함: 최대 60px
```

한 Task가 너무 커져 Card처럼 보이지 않게 한다.

TickTick식 빠른 스캔을 우선한다.

---

## 3.13 Board View 기본 구조

Board View는 현재 Scope 안의 Task를 여러 Column으로 나눈다.

```text
┌────────────┬────────────┬────────────┐
│ Column A   │ Column B   │ Column C   │
│            │            │            │
│ [Task]     │ [Task]     │ [Task]     │
│ [Task]     │ [Task]     │            │
│            │            │            │
│ + 작업      │ + 작업      │ + 작업      │
└────────────┴────────────┴────────────┘
```

Column은 View의 분류 기준이지 별도 List를 의미하지 않을 수 있다.

---

## 3.14 Inbox Board의 TickTick형 Column

TickTick과 최대한 비슷한 기본 Inbox Board를 제공하려면 다음 구성을 권장한다.

```text
미분류
일정
언젠가
```

의미:

### 미분류

아직 구체적인 일정이나 계획이 정해지지 않은 Inbox Task.

```text
dueDate 없음
AND someday 아님
```

### 일정

날짜가 설정된 Inbox Task.

```text
dueDate 존재
```

### 언젠가

당장 실행하지 않지만 보존하려는 Task.

```text
someday == true
```

이 세 Column은 Task의 소유 위치를 바꾸는 것이 아니라 Task 속성을 바꾼다.

---

## 3.15 Board Column 이동 의미

예:

```text
미분류 → 일정
```

Drag하면 날짜 입력이 필요하다.

따라서 Drop 직후 작은 Date Picker를 연다.

```text
Drop
 ↓
날짜 선택
 ↓
dueDate 저장
```

반대로:

```text
일정 → 미분류
```

은:

```text
dueDate 제거
```

로 처리한다.

```text
미분류 → 언젠가
```

은:

```text
someday = true
```

로 처리한다.

즉 Board Drag는 단순 위치 변경이 아니라 **해당 Column을 정의하는 속성 Patch**다.

---

## 3.16 일반 List의 Board Column

일반 List를 Board로 볼 때는 기본적으로 다음 중 하나를 사용할 수 있다.

### Option A — 상태 기반

```text
할 일
진행 중
완료
```

### Option B — 사용자 정의 Section 기반

```text
준비
진행
검토
```

### 기본 권장

TickTick에 최대한 맞추려면 **Section 기반**을 우선한다.

List 안에 Section이 없다면 하나의 기본 Section으로 보여준다.

상태 관리는 별도 속성으로 유지할 수 있다.

---

## 3.17 Board Column Header

각 Column Header:

```text
미분류      3       ...
```

포함:

- Column 이름
- 현재 Task Count
- `...`
- 필요 시 접기

Column 전체를 Card처럼 둘러싸지 않고, 제목 + Task stack 형태를 우선한다.

---

## 3.18 Board Column 폭

권장:

```text
280~340px
default: 300px
```

Main 폭보다 Column이 많으면 가로 Scroll을 허용한다.

Column 폭이 Task 내용 때문에 계속 변하지 않도록 고정 범위를 사용한다.

---

## 3.19 Board Card 구조

TickTick처럼 Card는 가볍게 유지한다.

```text
┌─────────────────────────┐
│ □ 작업 제목              │
│                         │
│ 오늘 · #중요             │
└─────────────────────────┘
```

기본 구성:

```text
Checkbox
Title
최대 1줄 metadata
```

필요할 때만 아이콘:

```text
Subtask
Comment
Attachment
Repeat
Reminder
```

---

## 3.20 Board Card에서 숨길 정보

기본 Card에 다음은 넣지 않는다.

```text
긴 Description
전체 Checklist
Activity history
Created time
Modified time
모든 Tag
모든 관계 객체
```

Card는 `파악 + 이동 + 완료`를 위한 UI다.

세부 수정은 Detail Drawer가 담당한다.

---

## 3.21 Priority 표시

Priority는 TickTick처럼 과도한 Badge보다 작은 시각 신호로 표시한다.

예:

```text
작은 Flag icon
Title 강조
```

정확한 색상 체계는 별도 Visual Design 단계에서 확정한다.

Priority 때문에 Card 높이가 늘어나지 않게 한다.

---

## 3.22 Due Date 표시

Due date는 Task의 실행 가능성을 판단하는 핵심 metadata이므로 우선순위가 높다.

표시 예:

```text
오늘
내일
8월 21일
기한 지남
```

같은 연도 내에서는 연도를 생략한다.

Overdue는 일반 날짜와 명확히 구분한다.

---

## 3.23 Tag 표시

Card/List Row에 모든 Tag를 표시하지 않는다.

기본적으로:

```text
최대 1~2개
```

만 노출한다.

더 많으면:

```text
+2
```

처럼 축약한다.

---

## 3.24 List 이름 표시

Smart List나 Tag View에서는 Task의 원래 List 이름이 중요하다.

예:

```text
Today
□ 교수님 자료 확인
  ABM 연구
```

반대로 특정 List 자체를 보고 있을 때는 List 이름을 반복하지 않는다.

즉 metadata는 **현재 Scope에서 이미 아는 정보는 숨긴다.**

---

## 3.25 Task 완료 동작

Checkbox 클릭 시 즉시 완료 처리한다.

기본 흐름:

```text
Checkbox click
 ↓
optimistic UI
 ↓
짧은 완료 animation
 ↓
현재 View에서 제거 또는 완료 영역으로 이동
```

사용자가 실수했을 경우를 위해 짧은 Undo Toast를 제공한다.

```text
작업을 완료했습니다. [실행 취소]
```

---

## 3.26 완료 Task 표시 옵션

일반 View에서는 완료 Task를 기본적으로 숨긴다.

필요 시:

```text
완료된 작업 표시
```

Toggle을 제공할 수 있다.

Today에서는 당일 완료 Task를 하단에 접힌 Section으로 보여주는 방식도 가능하다.

예:

```text
완료됨 3
▸
```

---

## 3.27 Task 클릭

Task Row 또는 Card 클릭 시 전체 페이지 이동 대신 우측 Detail Drawer를 연다.

```text
Main Workbench
┌───────────────────────┬────────────────────┐
│ Current List / Board  │ Task Detail Drawer │
│                       │                    │
│ [Task]                │ 작업 제목          │
│ [Task]                │ 날짜               │
│ [Task]                │ List               │
│                       │ Tags               │
│                       │ Description        │
└───────────────────────┴────────────────────┘
```

현재 Context를 유지한다.

---

## 3.28 Detail Drawer 기본 폭

권장:

```text
360~460px
default: 400px
```

너무 좁아 Description/Checklist 편집이 불편하지 않게 하고, Main Board를 완전히 가리지 않는 수준으로 둔다.

---

## 3.29 Detail Drawer 필드 순서

기본 권장:

```text
Title
Completion
List
Due date
Start date
Priority
Tags
Repeat
Reminder
Subtasks
Description / Notes
Attachments
Activity
```

MVP에서는:

```text
Title
List
Due date
Priority
Tags
Subtasks
Description
```

까지만 우선 구현 가능하다.

---

## 3.30 Detail Drawer 닫기

다음 방식 지원:

```text
X 버튼
Esc
다른 Task 클릭
```

다른 Task 클릭 시 Drawer를 닫았다 다시 열지 않고 내용만 교체한다.

---

## 3.31 Detail Drawer와 URL

Task 상세를 URL 상태로 넣을지는 §5에서 결정한다.

예:

```text
/list/abc?task=task123
```

를 사용하면 링크 공유가 가능하다.

다만 초기 MVP에서는 Drawer를 local UI state로 둘 수도 있다.

---

## 3.32 Today View

Today는 TickTick처럼 실행 중심의 List View를 기본으로 한다.

기본:

```text
오늘
──────────────────────────────

□ Task A
□ Task B
□ Task C
```

기본 Grouping은 §12와 동일하게 다음만 사용한다.

```text
기한 지남       ← 존재할 때만
오늘
완료됨          ← 당일 완료, 선택적 접힘 영역
```

오전/오후/저녁이나 List 기준 Grouping을 기본값으로 사용하지 않는다.
시간이 있는 Task는 Row metadata로 표시한다.

---

## 3.33 Next 7 Days View

Next 7 Days 기본은 날짜별 Grouping List를 권장한다.

```text
오늘
  □ Task

내일
  □ Task
  □ Task

8월 20일
  □ Task
```

Calendar Module과 겹치지 않도록 상세 월간 Calendar를 Main에 기본 노출하지 않는다.

---

## 3.34 Inbox View

Inbox는 TickTick식 정리 화면으로 동작한다.

기본 View 후보:

```text
List
Board
```

Board를 선택하면:

```text
미분류 / 일정 / 언젠가
```

구조를 제공한다.

Inbox Task를 다른 List로 Drag하거나 Detail Drawer에서 List를 지정해 정리할 수 있다.

---

## 3.35 Folder Aggregate View

Folder를 선택하면 하위 List Task를 모아 보여준다.

기본 List View에서는 List 기준 Grouping을 권장한다.

```text
ABM 연구
  □ Task
  □ Task

수업
  □ Task

영어 공부
  □ Task
```

MVP에서는 Folder Aggregate View에 Board를 제공하지 않는다.

하위 List를 Column으로 사용하는 Folder Board는 List 이동이 Project/Space membership까지 바꿀 수 있으므로 P1 이후 별도 설계로만 고려한다.

---

## 3.36 Tag View

Tag View에서는 현재 Tag가 이미 명확하므로 해당 Tag badge를 각 Task에 반복 표시할 필요가 없다.

대신 Task의 List와 Due date를 우선 표시한다.

```text
#중요

□ 교수님 메일
  ABM 연구 · 오늘

□ CV 수정
  개인 · 내일
```

---

## 3.37 Filter View

Filter View는 조건 결과를 보여준다.

Header에 간단한 조건 요약을 제공할 수 있다.

예:

```text
중요한 오늘
#중요 · 오늘 · 미완료
```

단, 긴 조건식을 Header에 그대로 나열하지 않는다.

`필터 편집`은 `...` 메뉴에서 진입한다.

---

## 3.38 Completed View

Completed는 완료 날짜 기준으로 Grouping할 수 있다.

예:

```text
오늘
✓ Task A
✓ Task B

어제
✓ Task C
```

Task를 다시 미완료로 되돌릴 수 있다.

---

## 3.39 Trash View

Trash에서는 일반 Task manipulation을 제한한다.

기본 Action:

```text
복원
영구 삭제
```

`+ 작업`은 제공하지 않는다.

---

## 3.40 Search Result와 Main

Search Module이 별도 Rail 항목이더라도 결과 표시 패턴은 Main Workbench의 List Row를 재사용한다.

새로운 전혀 다른 Card 시스템을 만들지 않는다.

---

## 3.41 Drag & Drop — Board

Board에서는 Task Card를 Column 간 이동할 수 있다.

Drop 시:

```text
UI 이동
→ Column 정의에 맞는 Task patch
→ 저장
```

저장 실패:

```text
원래 위치로 복귀
+ 오류 Toast
```

optimistic update를 기본으로 한다.

---

## 3.42 Drag & Drop — List

List View에서 Drag를 제공한다면 같은 Group/Section 안의 수동 정렬을 지원한다.

다만 날짜 기준, 우선순위 기준처럼 자동 정렬 중인 View에서는 수동 Drag를 제한한다.

규칙:

```text
Manual sort → Drag 가능
Derived sort → Drag reorder 불가
```

---

## 3.43 Board Column 내 `+ 작업`

각 Column 하단 또는 Header 근처에:

```text
+ 작업
```

을 제공할 수 있다.

이때 생성 Task는 해당 Column 조건을 자동으로 적용한다.

예:

```text
언젠가 Column + 작업
→ someday = true
```

```text
미분류 Column + 작업
→ dueDate = null
→ someday = false
```

---

## 3.44 Empty State

Scope에 Task가 없으면 큰 일러스트 중심 화면보다 TickTick처럼 가볍게 처리한다.

예:

```text
아직 작업이 없습니다.
+ 작업 추가
```

Folder:

```text
이 폴더의 리스트에 작업이 없습니다.
```

Tag:

```text
이 태그가 붙은 작업이 없습니다.
```

---

## 3.45 Column Empty State

Board Column이 비어 있을 때:

```text
여기로 작업을 끌어오세요
+ 작업
```

정도로 최소 표시한다.

빈 Column마다 큰 Card를 넣지 않는다.

---

## 3.46 Loading State

Main Shell과 Header는 즉시 보여주고 Task만 Skeleton 처리한다.

예:

```text
ABM 연구

████████████████
████████████
██████████████████
```

View Toolbar와 Header를 숨겼다 나타나게 하지 않는다.

Layout shift를 줄인다.

---

## 3.47 Error State

Task 로딩 실패 시 Main 전체 앱을 깨뜨리지 않는다.

```text
작업을 불러오지 못했습니다.
[다시 시도]
```

Sidebar와 Rail은 계속 사용할 수 있어야 한다.

---

## 3.48 Optimistic UI

다음 Action은 가능한 한 optimistic update를 사용한다.

```text
완료
제목 수정
날짜 변경
Priority 변경
Tag 변경
Board Drag
List 변경
```

사용자가 서버 round-trip을 기다린다고 느끼지 않게 한다.

실패 시 rollback + Toast.

---

## 3.49 Keyboard Interaction

Main Workbench에서 최소 지원 권장:

```text
N / Ctrl+N      새 작업
Enter           선택 Task 열기
Space           완료 토글
Delete          삭제
Esc             Quick Add / Drawer 닫기
↑ ↓             Task 이동
```

정확한 단축키는 OS 충돌을 확인한 뒤 확정한다.

---

## 3.50 Context Menu

Task `...` 또는 우클릭:

```text
완료
오늘로 이동
날짜 설정
Priority
Tag
List 이동
복제
삭제
```

MVP:

```text
완료
날짜
Priority
List 이동
삭제
```

부터 구현 가능하다.

---

## 3.51 Main More Menu

Header `...`에서는 현재 Scope에 대한 Action만 제공한다.

List:

```text
이름 변경
색상 변경
정렬
완료 작업 표시
List 삭제
```

Tag:

```text
Tag 편집
정렬
삭제
```

Smart List:

```text
정렬
완료 작업 표시
```

Smart List 삭제는 제공하지 않는다.

---

## 3.52 Sort

View Toolbar 또는 More Menu에서 Sort를 선택할 수 있다.

예:

```text
수동
날짜
Priority
생성일
제목
```

Sort를 바꾸면 현재 Scope 안에서만 적용한다.

---

## 3.53 Grouping

필요 시 Grouping을 별도 옵션으로 제공한다.

예:

```text
그룹 없음
List
날짜
Priority
Section
```

하지만 TickTick식 단순성을 위해 기본 UI에서 Sort와 Grouping을 과도하게 노출하지 않는다.

`...` 메뉴 아래에 숨기는 것을 권장한다.

---

## 3.54 Main Header의 Sticky 처리

Task가 많아 Main을 세로 Scroll할 때 Main Header와 View Toolbar는 상단 Sticky를 권장한다.

```text
Header        sticky
View Toolbar  sticky
Content       scroll
```

사용자가 긴 List에서도 현재 Scope와 보기 방식을 잃지 않게 한다.

---

## 3.55 Main Scroll

Main Content는 Sidebar와 독립 Scroll이다.

Board View:

```text
세로: Column 내부 또는 전체 Main
가로: Board 전체
```

지나치게 복잡한 이중 Scroll을 피하기 위해 기본은:

```text
Main 세로 Scroll 1개
Board 가로 Scroll 1개
```

로 제한한다.

---

## 3.56 Detail Drawer가 열린 상태의 Board

Drawer가 열릴 때 Board Column 폭을 강제로 지나치게 줄이지 않는다.

필요하면 Main의 가로 Scroll 범위를 늘린다.

사용자가 Drawer를 열었다고 Board 레이아웃이 완전히 깨져서는 안 된다.

---

## 3.57 반응형

Desktop:

```text
Rail | Sidebar | Main | optional Drawer
```

Medium:

```text
Rail | collapsible Sidebar | Main | overlay Drawer
```

Small:

```text
Main
Sidebar = overlay
Drawer = full-screen sheet
```

Mobile 전용 상세 UX는 별도 설계에서 다룬다.

---

## 3.58 TickTick과 최대한 비슷하게 유지할 요소

다음 요소는 적극적으로 가져온다.

```text
- 넓은 Main 작업 영역
- 얇은 Header
- 조밀한 Task Row
- 가벼운 Board Card
- 빠른 Inline Add
- Task 클릭 시 즉시 상세
- Hover 시 Action 노출
- 좌측 Navigation을 유지한 채 Main만 전환
- Task 완료의 빠른 피드백
- 불필요한 Dashboard card 최소화
```

---

## 3.59 그대로 복제하지 않을 요소

제품 내부 구조와 충돌하는 부분은 무조건 TickTick을 복사하지 않는다.

예:

```text
- Task 소유 모델과 충돌하는 생성 규칙
- 기존 Space/Project 데이터 관계를 깨는 단순화
- URL/웹 탐색에서 불리한 local-only navigation
- 현재 앱에 존재하지 않는 기능을 보이기만 하는 UI
```

즉 시각과 상호작용은 TickTick에 최대한 가깝게 가져오되, 데이터 무결성과 Navigation semantics는 현재 앱의 규칙을 따른다.

---

## 3.60 Main Workbench 와이어프레임 — List

```text
┌───────────────────────────────────────────────────────────────┐
│ ABM 연구                                      + 작업      ... │
│ 미완료 7개 · 완료 3개                                         │
│                                                               │
│ List   Board                                                  │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ □ 교수님께 결과 전달                              오늘         │
│   #중요                                                      │
│                                                               │
│ □ 논문 3편 정리                                  내일         │
│   #읽기                                                      │
│                                                               │
│ □ 시뮬레이션 결과 확인                           8월 21일      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 3.61 Main Workbench 와이어프레임 — Inbox Board

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ 기본함                                                   + 작업       ... │
│ 미분류 2 · 일정 2 · 언젠가 3                                              │
│                                                                          │
│ List   Board                                                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 미분류 2             일정 2                  언젠가 3                     │
│                                                                          │
│ ┌──────────────┐     ┌──────────────┐      ┌──────────────┐             │
│ │ □ 자료 확인   │     │ □ 교수님 미팅 │      │ □ 책 읽기      │             │
│ └──────────────┘     │ 오늘          │      └──────────────┘             │
│                      └──────────────┘                                    │
│ ┌──────────────┐                                ┌──────────────┐         │
│ │ □ 아이디어 정리│                                │ □ 앱 개선      │         │
│ └──────────────┘                                └──────────────┘         │
│                                                                          │
│ + 작업                + 작업                 + 작업                       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3.62 Main Workbench 와이어프레임 — Detail Drawer

```text
┌────────────────────────────────────────────┬────────────────────────────┐
│ ABM 연구                                   │ □ 교수님께 결과 전달        │
│                                            │                            │
│ □ 교수님께 결과 전달                       │ List      ABM 연구           │
│ □ 논문 3편 정리                            │ Due       오늘               │
│ □ 시뮬레이션 결과 확인                      │ Priority  높음               │
│                                            │ Tags      #중요             │
│                                            │                            │
│                                            │ Subtasks                   │
│                                            │ □ 표 확인                   │
│                                            │ □ 메일 작성                 │
│                                            │                            │
│                                            │ Notes                      │
│                                            │ ...                        │
└────────────────────────────────────────────┴────────────────────────────┘
```

---

## 3.63 §3 확정 결정

- **M1.** Main Workbench는 `Header → View Toolbar → Content → Optional Detail Drawer` 구조로 한다.
- **M2.** Header는 현재 Scope 이름과 현재 Scope 기준 정보만 표시한다.
- **M3.** `+ 작업`은 Header 우측의 일관된 위치에 둔다.
- **M4.** 생성 owner는 §12 `resolveCreateContext`를 따른다. Folder는 List 선택이 필수이고, Tag/Filter의 불명확 owner는 Inbox를 canonical default로 사용한다.
- **M5.** Quick Add는 Modal보다 Inline 방식을 기본으로 한다.
- **M6.** 기본 View는 List이며, Inbox에서는 Board를 함께 적극 지원한다.
- **M7.** Inbox Board 기본 Column은 `미분류 / 일정 / 언젠가`로 한다.
- **M8.** Board Drag는 Column 의미에 해당하는 Task 속성을 Patch한다.
- **M9.** 일반 List Board는 Section 기반 Column을 우선한다.
- **M10.** Task Row/Card는 제목 중심으로 최소 metadata만 노출한다.
- **M11.** 현재 Scope에서 이미 아는 metadata는 반복 표시하지 않는다.
- **M12.** Task 클릭은 페이지 이동보다 우측 Detail Drawer를 기본으로 한다.
- **M13.** 완료는 optimistic UI + Undo를 기본으로 한다.
- **M14.** Smart List / Folder / Tag / Filter는 각각의 Scope 특성에 맞춰 metadata와 Grouping을 달리한다.
- **M15.** Main Header와 View Toolbar는 긴 목록에서 Sticky 처리한다.
- **M16.** Sidebar, Main, Drawer의 Scroll 역할을 분리한다.
- **M17.** Loading/Error 상태에서도 Rail과 Sidebar Navigation은 유지한다.
- **M18.** Sort/Grouping은 제공하되 기본 화면에 과도하게 노출하지 않는다.
- **M19.** TickTick의 밀도, 빠른 입력, 가벼운 Card, Context 유지 방식은 적극 채택한다.
- **M20.** TickTick과 현재 앱의 Domain 규칙이 충돌하면 데이터 무결성과 예측 가능성을 우선한다.

---

---

# 4. Task Detail Drawer / 작업 상세 패널 세부 설계

## 4.1 목적

Task Detail Drawer는 Task를 클릭했을 때 현재 List/Board의 맥락을 잃지 않고 세부 내용을 확인·수정하는 영역이다.

TickTick처럼 **작업을 열기 위해 별도 상세 페이지로 이동하지 않는 것**을 기본 경험으로 한다.

사용자는 Drawer 안에서 다음 작업을 완료할 수 있어야 한다.

```text
1. 제목 수정
2. 완료 / 미완료 전환
3. List 이동
4. 날짜 / 시간 / 반복 / Reminder 설정
5. Priority / Tag 수정
6. Subtask 추가·완료
7. Description / Notes 편집
8. Attachment 확인
9. Task 복제 / 삭제
10. 이전·다음 Task로 빠르게 이동
```

핵심 원칙:

> Detail Drawer는 Task의 모든 정보를 한꺼번에 보여주는 데이터 시트가 아니라, 현재 Task를 빠르게 편집하는 작업 패널이다.

---

## 4.2 기본 구조

Drawer는 Main Workbench 우측에서 열린다.

```text
┌───────────────────────────────────────┬───────────────────────────────┐
│ Main Workbench                        │ Task Detail Drawer            │
│                                       │                               │
│ [Task A]                              │ □ Task A                      │
│ [Task B]                              │                               │
│ [Task C]                              │ List        ABM 연구           │
│                                       │ Date        오늘               │
│                                       │ Priority    높음               │
│                                       │ Tags        #중요             │
│                                       │                               │
│                                       │ Subtasks                      │
│                                       │ Notes                         │
└───────────────────────────────────────┴───────────────────────────────┘
```

Drawer를 열어도:

```text
Rail
Sidebar
현재 Scope
현재 View
현재 Scroll 위치
```

는 유지한다.

즉 Drawer는 Navigation 전환이 아니라 **현재 Context 위에 추가되는 편집 Layer**다.

---

## 4.3 Drawer 크기

Desktop 기본:

```text
default width: 400px
min width: 360px
max width: 480px
```

권장:

```text
400~420px
```

Drawer는 기본적으로 고정폭에 가깝게 유지한다.

긴 Description 때문에 자동으로 넓어지지 않는다.

---

## 4.4 Drawer Resize

Desktop에서는 향후 수동 Resize를 지원할 수 있다.

```text
Main | Drawer
     ↑ resize handle
```

권장 범위:

```text
360px ~ 560px
```

MVP에서는 고정폭으로 시작해도 된다.

Resize 여부는 핵심 기능이 아니므로 P2로 미룰 수 있다.

---

## 4.5 Drawer 상단 구조

상단은 다음 순서로 구성한다.

```text
[완료 Checkbox] [Task Title]                 [↑] [↓] [...] [X]
```

또는 공간이 부족하면:

```text
□ Task Title

                         ↑  ↓  ...  X
```

### 구성 요소

- 완료 Checkbox
- Task 제목
- 이전 Task
- 다음 Task
- 더보기
- 닫기

별도 큰 Header Card는 사용하지 않는다.

---

## 4.6 Task 제목 편집

Task Title은 Drawer에서 가장 높은 시각 우선순위를 가진다.

클릭 시 바로 inline edit.

```text
Task 제목
→ click
→ text input
```

### 저장 규칙

권장:

```text
입력 중 local state
↓
blur / Enter / 짧은 debounce
↓
저장
```

매 keystroke마다 서버 저장을 강제하지 않는다.

### Enter

단일 줄 제목이므로:

```text
Enter
→ 제목 저장
→ focus 해제 또는 다음 필드
```

### Esc

```text
현재 편집 취소
```

이미 서버에 저장된 이전 값으로 복원한다.

---

## 4.7 빈 제목 처리

완전히 빈 Title은 허용하지 않는 것을 기본으로 한다.

사용자가 모든 글자를 삭제하고 blur하면:

```text
이전 제목 복원
```

또는:

```text
"제목 없음"
```

으로 자동 저장하지 않는다.

Task 생성 중인 Quick Add에서만 임시 빈 상태를 허용한다.

---

## 4.8 완료 Checkbox

상단 Checkbox는 Main Row/Card의 Checkbox와 동일한 Task 상태를 변경한다.

```text
unchecked
→ completed
```

완료 후 Drawer를 즉시 닫지 않는다.

권장 흐름:

```text
완료 처리
→ Drawer 유지
→ 완료 상태 표시
→ Main에서 Task는 현재 View 규칙에 따라 제거/이동
```

사용자는 Drawer 안에서 Undo하거나 다시 미완료로 돌릴 수 있다.

---

## 4.9 완료 상태의 Drawer

완료된 Task를 열면 다음을 명확히 표시한다.

```text
✓ 완료됨
완료 시간: 필요 시 표시
```

Title 전체를 과도하게 흐리게 처리하지 않는다.

내용을 읽고 수정할 수 있어야 한다.

완료 상태에서도:

```text
List
Tag
Notes
Attachments
```

등은 수정 가능하게 두는 것을 기본으로 한다.

---

## 4.10 Metadata 영역 구조

Title 아래에 Task 핵심 속성을 세로 Row로 배치한다.

권장 순서:

```text
List
Date
Repeat
Reminder
Priority
Tags
```

예:

```text
List        ABM 연구
Date        오늘 18:00
Repeat      없음
Reminder    30분 전
Priority    높음
Tags        #중요 #읽기
```

각 Row는 클릭 시 해당 Picker를 연다.

---

## 4.11 Metadata Row 디자인

각 Row:

```text
[Icon] Label        Value
```

예:

```text
📁 List            ABM 연구
📅 Date            오늘
🚩 Priority        높음
🏷 Tags            #중요
```

단, 실제 아이콘 스타일은 앱의 기존 Icon set과 맞춘다.

항목마다 Border Card를 만들지 않는다.

한 패널 안의 연속된 설정 목록처럼 보여준다.

---

## 4.12 Metadata 값 없음

값이 설정되지 않은 경우:

```text
Date        날짜 없음
Priority    없음
Tags        태그 추가
```

처럼 Action 가능성이 드러나는 텍스트를 사용한다.

단순 `—`만 표시하면 수정 가능성을 알아보기 어렵다.

---

# 4.13 List 변경

Task의 실제 소유 위치를 변경하는 핵심 기능이다.

`List` Row 클릭:

```text
List Picker
```

Picker 기본 구조:

```text
검색...

기본함
────────────
학교
  ABM 연구
  수업

개인
  Todo App
  블로그
```

Task는 List Picker를 통해:

```text
Inbox system List
OR
Regular List
```

중 하나의 List로 이동할 수 있다.

---

## 4.14 List Picker 규칙

Folder는 선택할 수 없다.

즉:

```text
학교 Folder      선택 불가
ABM 연구 List    선택 가능
```

Folder는 Navigation grouping일 뿐 Task owner가 아니기 때문이다.

---

## 4.15 List 이동 시 즉시 반영

List 변경:

```text
Picker에서 List 선택
↓
optimistic update
↓
Main 현재 Scope와 관계 재평가
```

예:

현재:

```text
ABM 연구 List
```

에서 Task를:

```text
Todo App
```

으로 옮기면 현재 ABM 연구 View에서 해당 Task는 사라질 수 있다.

이 경우 Drawer도 닫는 것이 기본적으로 자연스럽다.

권장:

```text
Task가 현재 Scope를 더 이상 만족하지 않음
→ Drawer 닫기
→ Main에서 제거
→ Undo Toast
```

단, Tag View처럼 List 이동 후에도 현재 Scope를 만족하면 Drawer를 유지한다.

---

## 4.16 Inbox로 이동

List Picker에서 `기본함`을 선택하면:

```text
Task.listId = Inbox system List ID
```

로 변경한다.

`Task.owner = Inbox` 같은 별도 owner 타입이나 `listId = null` 암묵 상태로 처리하지 않는다.

---

# 4.17 Date 설계

Date는 Task의 실행 시점을 표현한다.

기본적으로 다음 수준을 지원한다.

```text
날짜 없음
오늘
내일
특정 날짜
특정 날짜 + 시간
```

향후:

```text
Start date
Duration
```

을 추가할 수 있다.

---

## 4.18 Date Picker Quick Actions

Date Picker 상단에 빠른 선택:

```text
오늘
내일
이번 주말
다음 주
날짜 없음
```

을 제공한다.

TickTick처럼 빠른 날짜 지정이 핵심이다.

---

## 4.19 시간 설정

날짜를 선택한 뒤 선택적으로 시간 지정.

```text
8월 18일
18:00
```

Time이 없는 Task는 All-day Task로 취급한다.

Calendar에서도 All-day 영역에 표시할 수 있다.

---

## 4.20 Start Date / Due Date

현재 Domain이 `startDate`와 `dueDate`를 이미 사용한다면 Drawer에서는 복잡성을 숨길 수 있다.

기본 표현:

```text
날짜
```

클릭 후 Advanced에서:

```text
시작일
마감일
```

을 설정하게 한다.

개인 Todo 중심 Main에서는 `dueDate` 하나만 먼저 보여주는 것이 TickTick식 단순성에 더 가깝다.

---

## 4.21 Overdue

기한이 지난 Task는 Date 값 자체에서 명확히 표시한다.

예:

```text
어제
8월 16일
```

등을 일반 미래 날짜와 시각적으로 구분한다.

단, 상세 패널 전체를 경고 UI로 만들지 않는다.

---

# 4.22 Repeat / 반복

Repeat는 Date와 연결된 속성으로 취급한다.

**MVP에서는 Repeat를 제공하지 않는다.**

따라서 MVP Drawer / Date Picker / Quick Add에는 실제로 동작하지 않는 Repeat Row나 disabled control을 미리 노출하지 않는다.

P1에서 Repeat를 활성화할 때는 §13의 `TaskRecurrence` / occurrence 계약을 구현한 뒤 UI를 연다.

Date가 없는 Task에 Repeat를 설정하려 하면 먼저 기준 날짜를 정하도록 한다.

P1 기본 Preset:

```text
매일
매주
매월
매년
```

`평일 / 사용자 지정`은 P2 확장으로 둔다.

---

## 4.23 Custom Repeat

사용자 지정 반복은 **P2**로 둔다.

예:

```text
매 N일
매 N주 특정 요일
매 N개월 특정 날짜
종료 없음
특정 날짜에 종료
N회 후 종료
```

P1에서는 `매일 / 매주 / 매월 / 매년`의 단순 Rule만 지원한다.

---

## 4.24 반복 Task 완료

Repeat는 MVP 범위 밖이므로 현재 `completeTask`에 반복 예외를 섞지 않는다.

P1에서 활성화할 때는 §13의 canonical recurrence operation을 사용한다.

```text
현재 occurrence 완료 기록
↓
TaskRecurrenceOccurrence 저장
↓
다음 occurrence 계산
↓
현재 Task의 next due 갱신
```

반복 Series가 계속되는 동안 Task 자체를 영구 완료 상태로 만들지 않는다.

마지막 occurrence가 끝난 경우에만 Series 종료 규칙에 따라 최종 완료 상태로 전환한다.

---

# 4.25 Reminder

Reminder는 Due date/time과 분리된 알림 속성이다.

**MVP에서는 Reminder를 제공하지 않는다.**

따라서 MVP Drawer / Date Picker / Quick Add에는 실제 알림 스케줄러가 없는 Reminder control을 노출하지 않는다.

P1에서 §13의 `TaskReminder` 모델과 notification scheduling이 구현된 뒤 활성화한다.

P1 Preset:

```text
정시
5분 전
10분 전
30분 전
1시간 전
1일 전
사용자 지정
```

데이터 모델은 처음부터 다중 Reminder를 허용하지만 P1 UI는 1개 Reminder부터 시작할 수 있다.

---

## 4.26 Reminder without Time

Task에 날짜만 있고 시간이 없는 경우 Reminder를 설정하면 시간 입력을 요구하거나 기본 시간을 명확히 사용해야 한다.

숨겨진 시간으로 알림을 보내지 않는다.

권장:

```text
Reminder 선택
→ "알림 시간을 설정하세요"
```

---

# 4.27 Priority

기본 Priority:

```text
없음
낮음
중간
높음
```

혹은 기존 앱 Priority enum이 있으면 해당 모델을 유지한다.

Picker는 작은 Popover 형태.

Priority는 Task의 위치를 바꾸지 않는다.

---

## 4.28 Priority 표시

Drawer에서는 텍스트 + 아이콘으로 명확히 표시한다.

```text
Priority    높음
```

Main Card에서는 더 압축된 신호만 사용한다.

즉 Detail에서는 의미를 명시하고 Main에서는 시각적으로 간결하게 한다.

---

# 4.29 Tags

Tags Row 클릭:

```text
Tag Picker
```

구성:

```text
검색...
선택된 Tag
전체 Tag
+ 새 태그
```

여러 개 선택 가능.

---

## 4.30 Tag Picker 검색

Tag 수가 많아져도 빠르게 찾을 수 있도록 검색을 기본 제공한다.

입력한 Tag가 존재하지 않으면:

```text
"연구" 태그 만들기
```

를 제공할 수 있다.

---

## 4.31 Tag 삭제와 Task

Drawer에서 Tag의 `x`를 눌러 제거해도 Task 자체는 변경 없이 Tag 관계만 제거한다.

현재 Tag View에서 해당 Tag를 제거하면 Task가 현재 Scope를 더 이상 만족하지 않는다.

권장:

```text
Tag 제거
→ Main에서 Task 제거
→ Drawer 닫기
→ Undo
```

---

# 4.32 Subtasks

Subtasks는 Drawer의 핵심 실행 요소다.

권장 구조:

```text
Subtasks                         2/4

□ 자료 확인
✓ 표 정리
□ 메일 초안
□ 교수님께 전달

+ 하위 작업
```

---

## 4.33 Subtask 모델

Subtask는 MVP 기능이므로 저장 모델도 지금 확정한다.

Subtask를 일반 `Task` row의 `parentTaskId`로 표현하지 않고 별도 **`TaskSubtask` entity**로 둔다.

```text
Task
├─ TaskSubtask
├─ TaskSubtask
└─ TaskSubtask
```

이유:

```text
- Main Scope Query에 Subtask가 독립 Task처럼 섞이는 것을 막음
- 모든 Task가 List를 가져야 한다는 owner invariant를 흐리지 않음
- 현재 UX가 요구하는 title / completion / order만 정확히 표현
```

MVP `TaskSubtask`는 독립 List / Date / Priority / Tag / Repeat / Reminder를 갖지 않는다.

Subtask 안에 또 Subtask를 만드는 2단계 이상 계층도 허용하지 않는다.

정확한 schema와 lifecycle은 §13을 canonical source로 사용한다.

---

## 4.34 Subtask 완료

Checkbox로 즉시 완료.

```text
2/4
```

처럼 진행 정도를 보여줄 수 있다.

Parent Task 자동 완료는 기본으로 하지 않는다.

모든 Subtask가 완료되어도 Parent를 자동 완료하지 않고 사용자가 최종 완료한다.

---

## 4.35 Subtask 순서 변경

Drag handle을 Hover 또는 focus 시 표시한다.

```text
≡ □ Subtask
```

수동 순서를 저장한다.

---

## 4.36 Subtask 빠른 추가

`+ 하위 작업`을 누르면 inline row 추가.

```text
Enter
→ 저장 후 다음 Subtask 입력 줄 생성
```

Esc:

```text
입력 종료
```

여러 개를 빠르게 입력할 수 있어야 한다.

---

# 4.37 Description / Notes

Task Description은 자유 텍스트 메모 영역이다.

기본 UI:

```text
메모
────────────────────
내용을 추가하세요...
```

클릭하면 편집 모드.

---

## 4.38 Description 편집 형식

MVP에서는 다음 중 하나를 선택한다.

### 권장

기본 Rich Text 또는 Markdown-like lightweight editor.

최소 지원:

```text
본문
줄바꿈
Bold
Bullet list
Numbered list
Link
```

복잡한 문서 편집기는 만들지 않는다.

Task Detail의 목적은 문서 작성이 아니라 작업 맥락 기록이다.

---

## 4.39 Description 자동 저장

Text 입력은 debounce 기반 자동 저장을 권장한다.

예:

```text
입력
↓
500~1000ms idle
↓
save
```

저장 상태:

```text
저장 중...
저장됨
저장 실패
```

을 아주 작게 표시할 수 있다.

---

# 4.40 Attachments

Attachment 영역은 Description 아래 또는 별도 섹션으로 둔다.

예:

```text
첨부파일

📄 result.pdf
🖼 graph.png

+ 첨부
```

MVP에서 파일 업로드가 아직 없다면 UI를 미리 노출하지 않는다.

작동하지 않는 Placeholder 기능을 만들지 않는다.

---

## 4.41 Attachment 기본 Action

지원 시:

```text
열기
다운로드
이름 보기
삭제
```

이미지는 작은 Preview를 제공할 수 있다.

---

# 4.42 Activity

Activity는 Task의 변경 기록을 보여주는 보조 영역이다.

예:

```text
Activity

18:20  날짜를 오늘로 변경
18:02  #중요 추가
17:55  Task 생성
```

개인 Todo 앱의 MVP에서는 후순위로 둘 수 있다.

Collaboration이 없으면 Activity를 전면에 노출할 필요가 적다.

---

## 4.43 Activity 기본 접힘

Activity는 Drawer 하단에서 기본 Collapse를 권장한다.

```text
▸ 활동
```

사용 빈도가 낮은 정보가 주요 편집 기능을 밀어내지 않게 한다.

---

# 4.44 Comments

협업 기능이 아직 핵심이 아니라면 Comments는 §4 MVP에서 제외한다.

향후 collaboration을 도입하면 Activity와 별도로:

```text
Comments
```

섹션을 추가한다.

개인용 Todo 경험에 불필요한 협업 UI를 먼저 넣지 않는다.

---

# 4.45 Task More Menu

상단 `...` 메뉴에는 Task 단위 Action을 넣는다.

기본:

```text
복제
다른 List로 이동
링크 복사
삭제
```

필요 시:

```text
완료 취소
보관
템플릿으로 저장
```

등을 향후 추가한다.

---

## 4.46 Duplicate

Task 복제 시 기본 복제 항목:

```text
Title
Description
Priority
Tags
Subtasks
```

MVP 복제 규칙은 다음으로 고정한다.

```text
Due date       복제
Subtasks       미완료/완료 상태까지 그대로 복제
Repeat         MVP 미지원 → 없음
Reminder       MVP 미지원 → 없음
```

P1에서 Repeat/Reminder가 활성화된 뒤에는 기본 Duplicate가 recurrence/reminder 설정을 조용히 복제하지 않는다. 별도 명시 Action을 통해 복제한다.

---

# 4.47 Delete

삭제는 즉시 Trash로 이동한다.

```text
Delete
↓
Trash
↓
Undo Toast
```

Drawer는 닫는다.

즉시 영구 삭제하지 않는다.

---

## 4.48 Permanent Delete

영구 삭제는 Trash View에서만 기본 제공한다.

Drawer 일반 More Menu에는 넣지 않는 것을 권장한다.

파괴적인 Action을 일상 작업 흐름에서 멀리 둔다.

---

# 4.49 이전 / 다음 Task Navigation

Drawer 상단에:

```text
↑ 이전
↓ 다음
```

또는 Arrow icon을 제공한다.

순서는 **현재 Main View에 보이는 Task 순서**를 따른다.

예:

```text
현재 Sort = Due Date
```

라면 이전/다음도 해당 정렬 순서를 따른다.

---

## 4.50 Filter/Scope와 이전·다음

이전/다음 Navigation은 현재 Scope 밖 Task로 넘어가지 않는다.

예:

```text
#중요 View
```

라면 `#중요` Task 사이에서만 이동한다.

현재 화면과 Drawer가 다른 Scope를 말하지 않게 한다.

---

## 4.51 마지막 Task

마지막 Task에서 `다음`은 disabled.

첫 Task에서 `이전` disabled.

순환 Navigation은 기본으로 하지 않는다.

---

# 4.52 Drawer 닫기

지원:

```text
X
Esc
Main 빈 영역 클릭 (선택적)
```

Main의 다른 Task를 클릭하면 Drawer를 닫지 않고 해당 Task로 교체한다.

---

## 4.53 바깥 클릭

바깥 클릭으로 Drawer를 닫는 것은 선택사항이다.

권장:

Desktop에서는 Main 빈 영역 클릭 시 닫을 수 있다.

단, Drag, text selection, popover interaction 때문에 실수로 닫히지 않게 한다.

---

# 4.54 Drawer 내부 Scroll

Drawer Header는 Sticky.

```text
Drawer Header   sticky
Drawer body     scroll
```

Title과 닫기/More Action은 긴 Task에서도 계속 접근할 수 있게 한다.

---

## 4.55 Popover Layer

Date Picker, Tag Picker, List Picker 등은 Drawer 안에 갇히는 별도 페이지가 아니라 Popover로 연다.

우선순위:

```text
Drawer
  └─ Popover
```

Popover가 열릴 때 Drawer Scroll이 갑자기 움직이지 않아야 한다.

---

# 4.56 Keyboard Navigation

Drawer 기본 Keyboard:

```text
Esc           현재 Popover 닫기 → 없으면 Drawer 닫기
Ctrl/Cmd+Enter  현재 편집 저장
↑ / ↓         이전/다음 Task (입력창 focus가 아닐 때)
Delete        명시적 Shortcut가 설정된 경우 삭제
```

Text editor focus 중에는 Arrow/Delete가 편집 동작을 우선한다.

---

## 4.57 Tab 순서

Keyboard focus 순서는 시각적 순서와 일치해야 한다.

예:

```text
Title
Completion
List
Date
Repeat
Reminder
Priority
Tags
Subtasks
Description
Attachment
```

숨겨진 Hover Action 때문에 Tab 순서가 난잡해지지 않게 한다.

---

# 4.58 자동 저장 전략

Drawer는 기본적으로 **명시적 Save 버튼 없이 자동 저장**한다.

다만 속성 타입에 따라 저장 시점을 다르게 한다.

### 즉시 저장

```text
Completion
List
Date
Priority
Tag
Reminder
Repeat
```

### Debounce 저장

```text
Title
Description
Subtask title
```

---

## 4.59 Optimistic Update

다음은 optimistic update:

```text
Completion
List
Date
Priority
Tag
Subtask completion
```

사용자는 저장 완료를 기다리지 않고 바로 결과를 본다.

실패하면:

```text
rollback
+
오류 Toast
```

---

## 4.60 저장 중 표시

각 필드마다 Spinner를 붙이지 않는다.

Drawer 전체에서 아주 작은 상태로:

```text
저장 중...
```

을 표시하거나 완전히 background 처리한다.

오류가 있을 때만 적극적으로 표시한다.

---

# 4.61 저장 실패

실패 유형에 따라 처리:

### 단순 네트워크 실패

```text
변경사항을 저장하지 못했습니다.
[다시 시도]
```

### Optimistic action 실패

기존 값으로 rollback.

### Description 같은 긴 입력

사용자가 입력한 local text를 잃지 않는다.

---

## 4.62 Offline 고려

향후 Offline-first를 지원할 경우:

```text
local save
↓
pending sync
↓
server sync
```

구조로 확장할 수 있다.

현재 MVP에서 구현하지 않더라도 Drawer state를 서버 저장 성공에만 의존하는 구조는 피한다.

---

# 4.63 동시 편집 Conflict

개인 Todo 앱에서는 우선순위가 낮지만, 여러 기기 동기화를 고려하면 같은 Task가 동시에 변경될 수 있다.

초기 기본:

```text
last-write-wins
```

을 사용할 수 있다.

다만 Description 같은 긴 텍스트에 대한 conflict 전략은 향후 별도 정의한다.

---

# 4.64 Task가 현재 Scope에서 사라지는 변경

다음 변경은 Task를 현재 Main 결과에서 제거할 수 있다.

```text
List 이동
Tag 제거
Date 변경
Completion
Filter 조건 변경
Trash 이동
```

공통 규칙:

```text
변경 적용
↓
현재 Scope 재평가
↓
Task가 Scope를 만족하는가?
├─ Yes → Drawer 유지
└─ No  → Drawer 닫기 + Main에서 제거
```

이 규칙을 각 기능별로 따로 구현하지 않고 공통화하는 것을 권장한다.

---

# 4.65 Undo

사용자가 현재 Scope에서 Task를 사라지게 만드는 Action에는 Undo를 적극 사용한다.

예:

```text
완료
삭제
List 이동
Tag 제거
```

Toast:

```text
작업을 이동했습니다. [실행 취소]
```

또는:

```text
작업을 완료했습니다. [실행 취소]
```

---

# 4.66 URL과 Drawer 상태

웹앱에서 Task 상세 링크 공유가 중요하다면 다음 구조를 권장한다.

```text
/list/abc?task=task123
```

또는:

```text
/today?task=task123
```

의미:

```text
pathname/query scope = 현재 Main 위치
task param          = 열린 Drawer
```

이렇게 하면:

- 새로고침 후 같은 Task 재오픈
- 링크 공유
- 뒤로가기 시 Drawer 닫기

가 가능하다.

정확한 URL canonicalization은 §5에서 최종 확정한다.

---

## 4.67 Drawer와 Browser Back

URL에 Task 상태를 넣는 경우 권장:

```text
Task 클릭
→ history push
→ Drawer open

Browser Back
→ Drawer close
→ 기존 Scope 유지
```

즉 Back 버튼 한 번으로 List 자체를 떠나지 않고 Drawer만 닫혀야 한다.

---

# 4.68 Deep Link 예외

URL로 Task를 직접 열었는데 현재 Scope가 Task를 포함하지 않는 경우 두 전략이 있다.

### 권장

Task의 원래 List로 이동해서 Drawer를 연다.

예:

```text
task123 belongs to ABM 연구
↓
/list/abm?task=task123
```

현재 Scope와 Task가 모순되는 상태를 만들지 않는다.

§5에서 최종 규칙을 정의한다.

---

# 4.69 Loading State

Task를 클릭하면 Drawer Shell을 즉시 열고 내용은 Skeleton 처리한다.

```text
┌────────────────────────┐
│ ███████████            │
│                        │
│ ██████   █████         │
│ ██████   ████          │
└────────────────────────┘
```

Task fetch가 끝날 때까지 Main을 Block하지 않는다.

---

## 4.70 Error State

Task 상세 fetch 실패:

```text
작업 정보를 불러오지 못했습니다.
[다시 시도]
[X 닫기]
```

Main은 계속 사용 가능해야 한다.

---

# 4.71 Deleted / Missing Task

URL로 열린 Task가 삭제되었거나 존재하지 않는 경우:

```text
이 작업을 찾을 수 없습니다.
```

Drawer를 닫고 현재 Scope는 유지한다.

Trash에 존재한다면 권한/정책에 따라 Trash Task임을 명확히 보여줄 수 있다.

---

# 4.72 Responsive — Medium / Tablet

Drawer의 Responsive 표현은 §15의 breakpoint contract를 따른다.

```text
>= 1280px
→ inline Drawer 400px

1024~1279px
→ right overlay Drawer 400px
→ Main은 resize하지 않음

768~1023px
→ right sheet Drawer
→ preferred width 520px
→ max-width: calc(100vw - 84px)
→ scrim + focus containment
```

중요:

> Drawer가 inline/overlay/sheet로 바뀌어도 `?task=` URL과 열린 Task identity는 바뀌지 않는다.

Responsive 전환은 Presentation 변화이지 Navigation mutation이 아니다.

---

## 4.73 Responsive — Small / Mobile

`< 768px`에서는 Drawer를 별도 오른쪽 Panel로 유지하지 않는다.

Task Detail은 full-screen surface로 전환한다.

```text
┌─────────────────────────────┐
│ ←        작업 상세      ··· │
├─────────────────────────────┤
│ □ Task title                │
│                             │
│ List                        │
│ Date                        │
│ Priority                    │
│ Tags                        │
│                             │
│ Subtasks                    │
│ Description                 │
└─────────────────────────────┘
```

그러나 URL semantics는 동일하다.

```text
/today?task=tsk_123
```

- Mobile Back button → `task` query 제거
- Browser Back → 기존 §5 History 규칙에 따라 Detail 닫힘
- 화면 회전/폭 증가 → 같은 Task를 overlay/inline Drawer로 이어서 표시
- Detail presentation 전환 때문에 URL을 replace/push하지 않음

세부 규칙은 §15.17~§15.21을 따른다.

---

# 4.74 Accessibility

최소 요구:

```text
- Checkbox keyboard 접근
- 모든 Metadata Row에 명확한 accessible label
- Popover focus trap
- Esc로 Popover/Drawer 닫기
- Color만으로 Priority/Overdue 구분하지 않기
- Drag 없이도 List/Section 이동 가능
```

Drag & Drop은 유일한 조작 방법이 되어서는 안 된다.

---

# 4.75 Drawer에서 피해야 할 설계

### ① 모든 속성을 처음부터 펼쳐서 노출

복잡해진다.

### ② 속성마다 Card

정보 밀도가 낮아지고 TickTick 특유의 가벼움이 사라진다.

### ③ Task 열 때 별도 페이지 이동

Main Context를 잃는다.

### ④ Folder를 Task 소유 위치로 선택

Domain 규칙과 충돌한다.

### ⑤ 자동 저장인데 변경 결과가 전혀 보이지 않음

실패 시 신뢰가 떨어진다.

### ⑥ List/Tag 변경 후 현재 Scope 밖인데 Drawer만 남음

Main과 Drawer가 서로 다른 상태를 말하게 된다.

### ⑦ 모든 고급 기능을 MVP Drawer에 포함

핵심 Task editing 속도가 느려진다.

---

# 4.76 Drawer 정보 우선순위

## P0 — 항상 보여야 함

```text
Completion
Title
List
Date
Priority
Tags
Subtasks
Description
```

## P1 — 필요 시 추가

```text
Repeat
Reminder
Attachments
Previous / Next
URL deep link
```

## P2 — 고급

```text
Activity
Comments
Resize
Advanced recurrence
Conflict UI
Multiple reminders
```

---

# 4.77 기본 Drawer 와이어프레임

```text
┌──────────────────────────────────────────┐
│ □  교수님께 결과 전달          ↑ ↓ ... X │
│                                          │
│ List        ABM 연구                     │
│ Date        오늘 18:00                   │
│ Priority    높음                         │
│ Tags        #중요  #연구                 │
│                                          │
│ ──────────────────────────────────────── │
│                                          │
│ 하위 작업                         2 / 4   │
│                                          │
│ ✓ 결과표 확인                            │
│ ✓ 그래프 저장                            │
│ □ 메일 초안 작성                         │
│ □ 교수님께 전송                          │
│                                          │
│ + 하위 작업                              │
│                                          │
│ ──────────────────────────────────────── │
│                                          │
│ 메모                                     │
│                                          │
│ 시뮬레이션 결과 중 p95와 비용 결과를      │
│ 다시 확인하고 메일에 포함하기.            │
│                                          │
│ ──────────────────────────────────────── │
│                                          │
│ 첨부파일                                 │
│ result.pdf                               │
│                                          │
│ ▸ 활동                                   │
│                                          │
└──────────────────────────────────────────┘
```

---

# 4.78 List Picker 와이어프레임

```text
┌─────────────────────────────┐
│ List 이동                    │
│ ┌─────────────────────────┐ │
│ │ 검색...                  │ │
│ └─────────────────────────┘ │
│                             │
│ 기본함                       │
│                             │
│ ▾ 학교                       │
│    ABM 연구                  │
│    수업                      │
│    영어 공부                 │
│                             │
│ ▾ 개인                       │
│    Todo App                  │
│    블로그                    │
└─────────────────────────────┘
```

Folder는 Group label이며 선택 대상이 아니다.

---

# 4.79 Date Picker 와이어프레임

```text
┌──────────────────────────────┐
│ 오늘       내일       다음 주 │
│                              │
│       2026년 8월             │
│  월 화 수 목 금 토 일         │
│              18 19 20 ...    │
│                              │
│ 시간          18:00          │
│                              │
│ 날짜 없음                    │
└──────────────────────────────┘
```

MVP Date Picker는 Date/Time만 다룬다. Repeat/Reminder는 P1에서 §13 데이터 계약이 구현된 뒤 별도 Row로 추가한다.

---

# 4.80 §4 확정 결정

- **T1.** Task 클릭은 별도 페이지 이동이 아니라 우측 Detail Drawer를 기본으로 한다.
- **T2.** Drawer를 열어도 Rail / Sidebar / Scope / View / Main Scroll context를 유지한다.
- **T3.** Desktop Drawer 기본 폭은 약 400px로 한다.
- **T4.** 상단에는 Completion / Title / Previous / Next / More / Close를 둔다.
- **T5.** Drawer는 명시적 Save 버튼보다 자동 저장을 기본으로 한다.
- **T6.** Completion / List / Date / Priority / Tag 등은 즉시 optimistic update한다.
- **T7.** Title / Description / Subtask title은 debounce 저장한다.
- **T8.** Task owner는 항상 `List`이며 Inbox는 system List다. Folder는 List Picker의 선택 대상이 아니다.
- **T9.** 현재 Scope를 벗어나게 만드는 변경 후에는 Task를 Main에서 제거하고 Drawer를 닫는다.
- **T10.** Scope를 벗어나지 않는 변경이면 Drawer를 유지한다.
- **T11.** Task Date는 기본적으로 간단한 Due date 중심 UI를 사용하고 고급 Start/Due는 필요할 때 확장한다.
- **T12.** Repeat / Reminder는 MVP에서 숨기며, §13의 P1 데이터 계약과 scheduler가 구현된 뒤 별도 Metadata Row로 활성화한다.
- **T13.** Tags는 다중 선택을 지원한다.
- **T14.** Subtasks는 Main Todo UX에서 1단계 계층을 기본으로 한다.
- **T15.** Parent Task는 모든 Subtask 완료만으로 자동 완료하지 않는다.
- **T16.** Description은 경량 Rich Text/Markdown 수준으로 제한한다.
- **T17.** Attachment가 실제 구현되지 않았다면 빈 UI를 미리 노출하지 않는다.
- **T18.** Activity / Comments는 핵심 Todo 흐름보다 후순위로 둔다.
- **T19.** 삭제는 Trash 이동 + Undo를 기본으로 하고 영구 삭제는 Trash에서만 제공한다.
- **T20.** Previous / Next는 현재 Main Scope와 현재 정렬 순서를 따른다.
- **T21.** 긴 Drawer에서는 Header를 Sticky 처리한다.
- **T22.** Drawer가 열린 상태에서도 Main은 독립적으로 유지된다.
- **T23.** URL에 Task id를 담는 deep-link 구조를 권장하되 정확한 규칙은 §5에서 확정한다.
- **T24.** Browser Back으로 Drawer만 닫히게 하는 Navigation을 권장한다.
- **T25.** Small 화면에서는 Drawer를 Full-screen Task Detail로 전환한다.
- **T26.** Drag 없이도 모든 핵심 Task 수정 기능을 사용할 수 있어야 한다.
- **T27.** TickTick처럼 속도와 정보 밀도를 우선하고, 속성마다 Card를 만드는 무거운 상세 화면은 피한다.

---

---

# 5. URL / Navigation State / 새로고침 / 뒤로가기 세부 설계

## 5.1 목적

§5의 목표는 웹앱에서 사용자가 현재 보고 있는 위치와 상태를 **브라우저 주소와 일치**시키는 것이다.

사용자가 다음 동작을 했을 때 화면 상태가 자연스럽게 유지되어야 한다.

```text
- 새로고침
- 뒤로가기
- 앞으로가기
- 링크 복사
- 다른 탭에서 열기
- 브라우저 재진입
```

핵심 원칙:

> 사용자가 “다른 화면을 보고 있다”고 느끼는 상태는 URL에 포함한다.

반대로:

> 단순한 일시적 UI 상태는 URL에 넣지 않는다.

---

## 5.2 Navigation State와 UI State 분리

상태를 두 종류로 구분한다.

### Navigation State

사용자가 현재 **어디를 보고 있는가**를 정의한다.

예:

```text
현재 Module
현재 Scope
현재 View
열린 Task
```

이 상태는 URL에 반영한다.

### UI State

현재 화면 안에서만 의미가 있는 일시적 상태다.

예:

```text
Hover
열린 Context Menu
Date Picker open
Sidebar section hover
Drag 중
입력 focus
```

이 상태는 URL에 넣지 않는다.

---

## 5.3 URL 기본 구조

Tasks Module의 URL 구조를 다음처럼 잡는다.

```text
/today
/upcoming
/inbox

/folder/:folderId
/list/:listId
/tag/:tagId
/filter/:filterId

/completed
/trash
```

예:

```text
/today
/inbox
/list/abm-research
/tag/important
```

실제 구현에서는 사람이 읽는 slug보다 내부 안정성을 위해 ID를 사용할 수 있다.

예:

```text
/list/lst_01HXYZ
```

표시 이름 변경 때문에 URL이 깨지지 않는 구조가 더 안전하다.

---

## 5.4 Module별 URL

최상위 Module은 Path를 분리한다.

권장:

```text
/tasks/...
/calendar
/spaces/...
/focus
/search
/settings
```

다만 Tasks를 앱의 기본 Module로 쓰고 더 짧은 URL을 선호한다면:

```text
/today
/inbox
/list/:id
```

처럼 `/tasks`를 생략할 수 있다.

### 권장

사용자-facing URL은 짧게 유지한다.

```text
/today
/upcoming
/inbox
/list/:id
```

Spaces처럼 충돌 가능성이 큰 Module만 별도 Prefix를 사용한다.

```text
/spaces/:spaceId
```

---

## 5.5 Smart List URL

Smart List는 안정적인 고정 Path를 사용한다.

```text
/today
/upcoming
/inbox
/completed
/trash
```

`다음 7일`은 URL 내부에서는 영어 의미를 명확히 유지하기 위해:

```text
/upcoming
```

을 권장한다.

표시 이름과 URL 이름은 반드시 같을 필요가 없다.

---

## 5.6 Folder URL

Folder 클릭:

```text
/folder/:folderId
```

예:

```text
/folder/fld_school
```

Folder 이름이 바뀌어도 URL은 유지한다.

---

## 5.7 List URL

List 클릭:

```text
/list/:listId
```

예:

```text
/list/lst_abm
```

List 이름 변경:

```text
ABM 연구
→ Drone 연구
```

를 해도:

```text
/list/lst_abm
```

URL은 변하지 않는다.

---

## 5.8 Tag URL

Tag 클릭:

```text
/tag/:tagId
```

예:

```text
/tag/tag_important
```

Tag 이름 변경에도 URL 안정성을 유지한다.

---

## 5.9 Filter URL

Filter:

```text
/filter/:filterId
```

Filter 조건이 바뀌어도 동일 Filter identity이면 URL은 유지한다.

---

# 5.10 View State

같은 Scope를 어떻게 보고 있는지는 Query Parameter로 표현한다.

예:

```text
/list/lst_abm?view=list
/list/lst_abm?view=board
```

즉:

```text
Path  = WHERE
Query = HOW
```

로 구분한다.

---

## 5.11 기본 View는 URL에서 생략

기본 View가 `list`인 Scope에서는:

```text
/list/lst_abm
```

을 canonical URL로 한다.

다음처럼 쓸 수 있지만:

```text
/list/lst_abm?view=list
```

새로고침 후 canonicalization 시:

```text
/list/lst_abm
```

으로 정리한다.

즉 기본값은 URL에서 생략한다.

---

## 5.12 Board View

Board로 바꾸면:

```text
/list/lst_abm?view=board
```

Inbox도:

```text
/inbox?view=board
```

처럼 표현한다.

---

## 5.13 허용 View 검증

모든 Scope가 모든 View를 지원하는 것은 아니다.

예:

```text
Today
→ list만 지원

Inbox
→ list, board

List
→ list, board

Trash
→ list만 지원
```

따라서 URL의 `view`는 현재 Scope의 허용 View와 대조해 검증한다.

---

## 5.14 잘못된 View 처리

예:

```text
/trash?view=board
```

처럼 허용되지 않는 View가 들어오면:

```text
1. 기본 View로 fallback
2. replaceState로 canonical URL 정리
```

결과:

```text
/trash
```

브라우저 history에 잘못된 URL을 한 단계 더 남기지 않는다.

---

# 5.15 Task Drawer URL

Task Detail Drawer가 열려 있다면:

```text
?task=:taskId
```

를 사용한다.

예:

```text
/list/lst_abm?task=tsk_123
```

Board와 함께 열면:

```text
/list/lst_abm?view=board&task=tsk_123
```

즉 Query는 다음처럼 구성된다.

```text
view
task
```

---

## 5.16 Query Parameter 순서

Canonical URL의 Query 순서를 고정한다.

권장:

```text
?view=board&task=tsk_123
```

항상:

```text
view
task
```

순서로 serialize한다.

기능적으로는 순서가 중요하지 않지만 URL 비교와 테스트를 단순하게 한다.

---

# 5.17 Task 클릭 history 정책

Task 클릭 시:

```text
/list/lst_abm
↓
/list/lst_abm?task=tsk_123
```

`pushState`를 사용한다.

따라서 Browser Back 한 번:

```text
/list/lst_abm?task=tsk_123
↓
/list/lst_abm
```

이 되고 Drawer만 닫힌다.

---

## 5.18 Task 간 이동 history 정책

Drawer에서 다음 Task로 이동할 때 매 Task마다 history를 쌓으면 뒤로가기가 지나치게 길어진다.

따라서 기본 권장:

```text
첫 Task open → pushState
Drawer 내부 Previous/Next → replaceState
```

예:

```text
/list/lst_abm
↓ click Task A
/list/lst_abm?task=A   ← push

↓ next
/list/lst_abm?task=B   ← replace

↓ next
/list/lst_abm?task=C   ← replace
```

Back 한 번:

```text
→ Drawer close
```

가 된다.

---

## 5.19 Drawer X 닫기

사용자가 X 버튼으로 Drawer를 닫으면 Browser history semantics와 일치해야 한다.

권장:

현재 entry가 Drawer open으로 생성된 것이면:

```text
history.back()
```

을 사용한다.

다만 Deep Link로 직접 진입한 경우 back destination이 앱 밖일 수 있다.

그 경우:

```text
replaceState로 task param 제거
```

하는 안전 장치가 필요하다.

---

# 5.20 Scope 변경 history 정책

Sidebar에서 다른 Scope를 클릭하는 것은 명백한 Navigation이다.

따라서:

```text
pushState
```

사용.

예:

```text
/today
↓
/inbox
↓
/list/lst_abm
```

Back:

```text
/list/lst_abm
→ /inbox
→ /today
```

사용자가 실제 이동했던 순서를 따른다.

---

## 5.21 View 변경 history 정책

View 전환은 같은 Scope 안의 Navigation이다.

여기에는 두 전략이 가능하다.

### A. pushState

```text
List → Board
```

도 뒤로가기로 복원.

### B. replaceState

View는 같은 위치의 표현 방식이므로 history를 쌓지 않음.

### 권장

**pushState를 사용한다.**

이유:

```text
List와 Board는 사용자가 서로 다른 화면으로 느낄 가능성이 높음
```

따라서:

```text
/list/lst_abm
↓ Board
/list/lst_abm?view=board
```

Back:

```text
/list/lst_abm
```

으로 자연스럽게 돌아간다.

---

# 5.22 Sidebar Section Collapse는 URL에 넣지 않음

예:

```text
Lists 접힘
Tags 펼침
```

은 Navigation State가 아니다.

따라서 URL에 넣지 않는다.

Local persistence 또는 user preference로 저장한다.

---

## 5.23 Sidebar 폭도 URL에 넣지 않음

```text
sidebarWidth=260
```

같은 값은 URL에 넣지 않는다.

Local storage / user setting으로 관리한다.

---

## 5.24 Sort / Grouping URL

Sort와 Grouping을 URL에 넣을지는 사용 목적에 따라 다르다.

### 기본 권장

초기 MVP에서는 URL에 넣지 않는다.

Scope별 user preference로 저장한다.

예:

```text
List ABC
sort = dueDate
group = none
```

은 사용자 설정으로 유지.

### 향후 공유 가능한 View가 중요해지면

```text
?sort=due&group=priority
```

형태로 확장할 수 있다.

---

# 5.25 새로고침 복원

다음 URL에서 새로고침:

```text
/list/lst_abm?view=board&task=tsk_123
```

하면 다음 순서로 복원한다.

```text
1. Route解析
2. List 존재 확인
3. 허용 View 검증
4. Main Scope 로드
5. Board View 적용
6. Task 존재/Scope 관계 확인
7. Drawer 열기
```

UI state를 local state 기본값으로 먼저 그렸다가 여러 번 뒤집는 것을 최소화한다.

---

## 5.26 복원 우선순위

새로고침 시 URL이 source of truth다.

우선순위:

```text
URL
>
last opened local state
>
default
```

예:

사용자의 마지막 View가 Board였어도 URL이:

```text
/list/lst_abm
```

이면 canonical 기본값인 List로 연다.

---

# 5.27 마지막 열린 위치 복원

앱 루트:

```text
/
```

로 진입했을 때만 last location을 고려할 수 있다.

전략:

### 권장 기본

```text
/
→ /today
```

항상 오늘로 진입.

### 향후 옵션

사용자 설정:

```text
앱 시작 위치
- 오늘
- 마지막 위치
- 기본함
```

§1에서 정한 기본은 `/today`다.

---

# 5.28 존재하지 않는 List URL

예:

```text
/list/lst_deleted
```

List가 삭제되었거나 존재하지 않으면:

```text
1. Not found 상태 표시
2. Sidebar는 정상 유지
3. /today 또는 /inbox로 이동할 수 있는 Action 제공
```

자동으로 조용히 다른 List로 보내지 않는다.

사용자가 왜 화면이 바뀌었는지 알 수 있어야 한다.

---

## 5.29 삭제된 Folder / Tag / Filter

동일 원칙 적용.

```text
/folder/missing
/tag/missing
/filter/missing
```

→ 해당 Resource not found.

자동으로 임의 Scope를 선택하지 않는다.

---

# 5.30 존재하지 않는 Task URL

예:

```text
/list/lst_abm?task=tsk_missing
```

처리:

```text
Main List는 정상 표시
Drawer 영역에서:
"이 작업을 찾을 수 없습니다."
```

그 후:

```text
task param 제거
```

를 선택할 수 있다.

권장:

오류를 짧게 표시한 뒤 `replaceState`로 task param을 제거한다.

Main Scope까지 깨뜨리지 않는다.

---

# 5.31 Task가 현재 Scope에 속하지 않는 경우

예:

```text
/list/lst_abm?task=tsk_blog
```

인데 Task가 `블로그` List 소속이라면 현재 URL은 의미상 모순이다.

권장 처리:

```text
Task 실제 owner 확인
↓
canonical Task location 계산
↓
/list/lst_blog?task=tsk_blog
```

로 `replaceState` 또는 redirect한다.

현재 Scope와 Drawer가 서로 다른 위치를 말하지 않게 한다.

---

## 5.32 Tag / Filter Deep Link의 Task

Tag View에서는 Task가 해당 Tag를 만족하면 그대로 열 수 있다.

```text
/tag/important?task=tsk_123
```

Task가 #important를 가지고 있으면 유효.

없다면 현재 Scope와 모순이므로 Task의 owner List로 canonicalize한다.

Filter도 동일.

---

# 5.33 Completed Task Deep Link

일반 List에서 완료 Task를 숨기고 있어도:

```text
/list/lst_abm?task=completedTask
```

처럼 직접 Task deep link가 들어온 경우 Drawer는 열 수 있다.

단 Main에서 해당 Task가 안 보이는 상태가 혼란스러울 수 있다.

권장:

```text
Drawer open
+
"이 작업은 완료됨" 표시
```

필요 시 Main에서 완료 Task를 임시 reveal하는 방식은 후순위다.

---

# 5.34 Trash Task Deep Link

Trash Task는 일반 List URL에서 열지 않는다.

Trash에 있는 Task라면:

```text
/trash?task=tsk_123
```

으로 canonicalize하는 것을 권장한다.

삭제 상태를 명확히 유지한다.

---

# 5.35 Canonical URL

같은 화면을 가리키는 URL이 여러 개 생기지 않게 한다.

예:

```text
/inbox?view=list
```

은 canonical:

```text
/inbox
```

으로 정리.

또:

```text
/list/lst_abm?task=abc&view=board
```

도 canonical order:

```text
/list/lst_abm?view=board&task=abc
```

로 정리한다.

---

## 5.36 Canonicalization은 replaceState

URL 정리 때문에 history를 쌓지 않는다.

항상:

```text
replaceState
```

사용.

---

# 5.37 Browser Back 동작 표

| 현재 상태 | Back 결과 |
|---|---|
| `/list/A?task=1` | `/list/A` |
| `/list/A?view=board` | `/list/A` |
| `/list/A` | 이전 Scope |
| `/tag/X?task=1` | `/tag/X` |
| `/inbox?view=board&task=1` | `/inbox?view=board` |

이 동작을 E2E test로 고정한다.

---

# 5.38 Browser Forward

Back 후 Forward도 정확히 같은 상태를 복원해야 한다.

예:

```text
/list/A
→ Back
/inbox
→ Forward
/list/A
```

Drawer / View도 동일.

`popstate` 처리에서 URL을 다시 push하지 않도록 주의한다.

---

# 5.39 popstate 원칙

브라우저 Back/Forward로 state가 바뀌었을 때:

```text
URL parse
→ application state sync
```

만 한다.

다시:

```text
pushState
```

하면 history loop가 생길 수 있으므로 금지한다.

---

# 5.40 Navigation Action 분류

모든 navigation action을 다음 세 가지로 나눈다.

### PUSH

사용자가 새 위치/화면으로 이동.

```text
Sidebar Scope 변경
View 변경
Task 최초 open
```

### REPLACE

같은 navigation entry의 정리/보정.

```text
invalid view fallback
canonical query order
Drawer 내부 next/previous
잘못된 task scope canonicalization
```

### NONE

URL과 무관한 UI state.

```text
Popover open
Hover
Sidebar collapse
Quick Add focus
```

---

# 5.41 URL Builder 공통화

컴포넌트마다 문자열을 직접 조립하지 않는다.

예:

```text
buildScopeUrl(scope, options)
```

형태의 공통 함수 사용을 권장한다.

개념:

```text
buildScopeUrl({
  scope: { type: "list", id: "lst_abm" },
  view: "board",
  taskId: "tsk_123"
})
```

결과:

```text
/list/lst_abm?view=board&task=tsk_123
```

---

## 5.42 URL Parser 공통화

반대로 URL → navigation state도 한 곳에서 처리한다.

```text
parseNavigationUrl(location)
```

결과 예:

```text
{
  module: "tasks",
  scope: {
    type: "list",
    id: "lst_abm"
  },
  view: "board",
  taskId: "tsk_123"
}
```

컴포넌트가 각각 query param을 읽지 않는다.

---

# 5.43 Navigation State 타입

개념적으로 다음 형태를 권장한다.

```text
NavigationState
├─ module
├─ scope
│  ├─ type
│  └─ id?
├─ view
└─ taskId?
```

예:

```text
{
  module: "tasks",
  scope: {
    type: "today"
  },
  view: "list",
  taskId: null
}
```

또는:

```text
{
  module: "tasks",
  scope: {
    type: "list",
    id: "lst_abm"
  },
  view: "board",
  taskId: "tsk_123"
}
```

---

# 5.44 Scope 타입

최소:

```text
today
upcoming
inbox
folder
list
tag
filter
completed
trash
```

를 구분한다.

문자열 URL을 앱 내부 의미로 직접 사용하는 대신 typed scope를 사용한다.

---

# 5.45 View Registry

Scope별 허용 View를 Registry로 관리한다.

예:

```text
today:
  list

upcoming:
  list

inbox:
  list
  board

folder:
  list

list:
  list
  board

tag:
  list

filter:
  list

completed:
  list

trash:
  list
```

MVP에서 Board는 Inbox와 실제 List에만 허용한다.

View validation을 각 화면에서 중복 구현하지 않는다.

---

# 5.46 Default View Registry

각 Scope의 기본 View도 같은 Registry에 둔다.

예:

```text
today      → list
upcoming   → list
inbox      → list
folder     → list
list       → list
tag        → list
filter     → list
completed  → list
trash      → list
```

향후 Calendar View가 추가되어도 한 곳에서 확장한다.

---

# 5.47 Sidebar와 URL 단방향/양방향 동기화

원칙:

```text
User action
→ URL 변경
→ Navigation state 변경
→ Sidebar selection / Main 변경
```

또:

```text
Browser Back
→ URL 변경
→ Navigation state 변경
→ Sidebar selection / Main 변경
```

Sidebar가 독립 local state로 현재 selection을 들고 있지 않게 한다.

현재 선택의 source of truth는 Navigation State다.

---

# 5.48 Main View와 URL 동기화

View tab도 마찬가지다.

```text
Board 클릭
→ URL ?view=board
→ navigation state.view = board
→ Main Board 렌더
```

`setView("board")`만 하고 URL을 나중에 맞추는 식의 이중 상태를 피한다.

---

# 5.49 Drawer와 URL 동기화

Task 클릭:

```text
URL task param 추가
→ navigation state.taskId
→ Drawer open
```

Drawer local `isOpen`을 별도로 source of truth로 두지 않는다.

개념:

```text
drawerOpen = navigationState.taskId != null
```

---

# 5.50 Quick Add는 URL과 무관

Quick Add open/close는 URL state가 아니다.

새로고침하면 사라져도 된다.

입력 중 draft를 보존하고 싶다면 별도의 local draft persistence 문제로 다룬다.

---

# 5.51 Scroll 복원

Back으로 이전 Scope에 돌아갔을 때 이전 scroll 위치를 복원하면 사용성이 좋아진다.

예:

```text
/inbox scroll 1200px
→ /list/A
→ Back
→ /inbox scroll 1200px
```

브라우저 기본 scroll restoration을 활용하거나 Scope별 위치를 session memory에 저장할 수 있다.

---

## 5.52 Drawer open 시 Main Scroll

Task Drawer를 열어도 Main scroll 위치는 유지한다.

Drawer close 후:

```text
Task가 있던 위치
```

로 그대로 돌아와야 한다.

---

# 5.53 Board Horizontal Scroll 복원

Board View도 Scope별 가로 scroll 위치를 session 수준에서 기억할 수 있다.

URL에 넣지 않는다.

```text
/list/A?view=board
```

안에서:

```text
horizontalScroll = 620
```

은 UI session state.

---

# 5.54 URL 공유

사용자가 주소창 URL을 복사했을 때 다음을 재현할 수 있어야 한다.

```text
Scope
View
열린 Task
```

예:

```text
/list/lst_abm?view=board&task=tsk_123
```

공유 받은 사용자는 권한이 있다면 동일 Context를 본다.

---

# 5.55 권한 없는 Deep Link

향후 협업 기능이 있다면 권한 없는 Resource URL에 접근할 수 있다.

처리:

```text
이 항목에 접근할 권한이 없습니다.
```

Not Found와 Permission Denied를 내부적으로 구분한다.

보안상 외부 사용자에게 상세 차이를 숨겨야 하는 정책이 있다면 해당 정책을 따른다.

---

# 5.56 Spaces URL과의 일관성

Spaces에서도 같은 원칙을 사용한다.

예:

```text
/spaces/:spaceId
/spaces/:spaceId?view=gantt
/spaces/:spaceId?view=calendar
```

즉 Tasks와 Spaces가 navigation semantics에서 서로 다른 규칙을 쓰지 않는다.

---

## 5.57 Space invalid view

예:

```text
/spaces/abc?view=board
```

인데 해당 Space Scope에서 Board가 허용되지 않는다면:

```text
default view
```

로 fallback 후 `replaceState`.

이 규칙은 Tasks의 View Registry와 동일한 시스템을 재사용할 수 있다.

---

# 5.58 Search URL

Search가 Module이면:

```text
/search?q=keyword
```

를 사용할 수 있다.

검색어는 공유/새로고침 가치가 있으므로 URL에 넣는 것이 자연스럽다.

다만 검색창 focus 여부나 최근 검색 dropdown은 URL에 넣지 않는다.

---

# 5.59 Calendar URL

Calendar는 최소:

```text
/calendar
```

로 시작할 수 있다.

향후:

```text
/calendar?date=2026-08-18&view=week
```

형태로 확장할 수 있다.

현재 §5의 공통 원칙을 그대로 적용한다.

---

# 5.60 Focus URL

실행 중 Focus Session을 URL에 넣을지는 별도 결정이 필요하다.

기본 추천:

```text
/focus
```

Task 선택이나 실행 Session 자체는 지속 상태이므로 서버/앱 state에서 복원하고 URL에는 과도한 runtime state를 넣지 않는다.

---

# 5.61 URL에 넣지 않을 것

다음은 명시적으로 제외한다.

```text
Sidebar width
Sidebar collapsed section
Hover
Context menu
Popover
Drag state
Loading state
Toast
Quick Add open
Quick Add draft
Detail Drawer internal scroll
Board horizontal scroll
Selected text
Input focus
```

---

# 5.62 URL에 넣을 것

반대로 다음은 포함한다.

```text
현재 Module
현재 Scope
현재 non-default View
현재 열린 Task
공유 가치가 있는 Search query
```

---

# 5.63 Navigation Error Boundary

URL parsing이나 Resource load 실패가 앱 Shell 전체를 무너뜨리지 않게 한다.

구조:

```text
Rail           유지
Sidebar        유지
Main           error state
Drawer         필요 시 close/error
```

Navigation error와 앱 전체 fatal error를 분리한다.

---

# 5.64 Initial Render 깜빡임 방지

URL:

```text
/list/A?view=board
```

인데 초기 local default가 List라서:

```text
List → Board
```

로 한 프레임 뒤집히는 현상을 피한다.

초기 render 전에 URL을 parse해 initial navigation state를 만든다.

---

# 5.65 잘못된 Query 값

예:

```text
?view=banana
```

처리:

```text
unknown value
→ default view
→ replace canonical URL
```

앱 crash 금지.

---

# 5.66 중복 Query

예:

```text
?view=list&view=board
```

같은 비정상 URL은 parser 규칙으로 하나를 선택한 뒤 canonicalize한다.

권장:

마지막 유효값 사용 또는 첫 유효값 사용 중 하나를 정하고 테스트로 고정.

간단하게는 첫 유효값 사용을 권장한다.

---

# 5.67 Unknown Query 보존 여부

예:

```text
/list/A?foo=bar&view=board
```

앱이 관리하지 않는 Query를 보존할지 제거할지 결정해야 한다.

권장:

자사 앱이 관리하는 navigation URL에서는 unknown query를 canonicalization 시 제거한다.

단 외부 attribution/tracking parameter 정책이 있다면 예외 처리한다.

---

# 5.68 URL Encoding

ID나 검색어는 반드시 안전하게 encode한다.

사용자 입력 이름을 raw path로 직접 사용하지 않는 이유이기도 하다.

예:

```text
/search?q=ABM%20드론
```

---

# 5.69 테스트해야 할 핵심 Scenario

### Scenario 1 — List → Board → Back

```text
/list/A
→ /list/A?view=board
→ Back
→ /list/A
```

### Scenario 2 — Task open → Back

```text
/list/A
→ /list/A?task=1
→ Back
→ /list/A
```

### Scenario 3 — Board + Task

```text
/list/A?view=board
→ /list/A?view=board&task=1
→ Back
→ /list/A?view=board
```

### Scenario 4 — 새로고침

```text
/inbox?view=board&task=1
→ refresh
→ 같은 상태 복원
```

### Scenario 5 — invalid view

```text
/trash?view=board
→ /trash
```

### Scenario 6 — deleted list

```text
/list/deleted
→ Not Found
```

### Scenario 7 — wrong task scope

```text
/list/A?task=taskFromB
→ canonical B location
```

---

# 5.70 구현 책임 분리

권장 모듈:

```text
navigation/
├─ types
├─ parseUrl
├─ buildUrl
├─ viewRegistry
├─ canonicalize
├─ navigate
└─ history
```

UI component가 browser API를 직접 여기저기 호출하지 않는다.

---

# 5.71 `pushState` 직접 사용 최소화

컴포넌트에서:

```text
window.history.pushState(...)
```

를 직접 부르기보다:

```text
navigateToScope(...)
openTask(...)
changeView(...)
closeTask(...)
```

같은 domain navigation 함수로 감싼다.

이렇게 해야 history 정책이 한 곳에서 유지된다.

---

# 5.72 URL 설계와 데이터 모델 분리

URL은 resource identity만 표현한다.

예:

```text
/list/:id
```

가 실제 내부에서:

```text
Space
→ Project
→ Folder
→ List
```

경로를 가진다고 해서 URL에 전체 Domain hierarchy를 넣지 않는다.

즉:

```text
/spaces/A/projects/B/folders/C/lists/D
```

처럼 지나치게 긴 URL을 Tasks Module에서 강제하지 않는다.

Presentation IA를 따른다.

---

# 5.73 TickTick형 UX와 URL의 관계

TickTick처럼 빠른 single-pane 앱 느낌을 유지하면서도 웹에서는 URL을 적극 활용한다.

사용자 경험:

```text
Sidebar 클릭
→ 화면 즉시 변경
```

처럼 느껴져야 한다.

내부적으로는:

```text
history
URL
navigation state
```

가 정확히 따라간다.

즉 URL이 있다고 해서 전통적인 페이지 reload 방식으로 만들 필요는 없다.

SPA navigation을 유지한다.

---

# 5.74 §5에서 피해야 할 설계

### ① Sidebar selection과 URL을 별도 state로 관리

둘이 어긋날 수 있다.

### ② Task Drawer는 local state인데 URL에는 task가 존재

source of truth가 두 개가 된다.

### ③ 모든 View를 URL에 항상 명시

canonical URL이 불필요하게 길어진다.

### ④ 잘못된 URL을 조용히 임의 List로 보냄

사용자에게 예측 불가능하다.

### ⑤ Drawer의 Next마다 pushState

Back history가 Task 수만큼 쌓인다.

### ⑥ invalid view fallback 시 pushState

잘못된 history entry가 남는다.

### ⑦ 이름을 ID 대신 URL identity로 사용

Rename 시 링크 안정성이 떨어진다.

### ⑧ UI 상태까지 Query에 저장

URL이 지나치게 복잡해진다.

---

# 5.75 최종 URL 예시

```text
/today

/upcoming

/inbox

/inbox?view=board

/list/lst_abm

/list/lst_abm?view=board

/list/lst_abm?task=tsk_123

/list/lst_abm?view=board&task=tsk_123

/folder/fld_school

/tag/tag_important

/filter/flt_today_important

/completed

/trash

/spaces/spc_personal

/spaces/spc_personal?view=gantt

/search?q=ABM
```

---

# 5.76 Navigation 상태 흐름 와이어프레임

```text
Sidebar click
     │
     ▼
Navigation command
     │
     ▼
URL push / replace
     │
     ▼
Parse URL
     │
     ▼
NavigationState
     │
     ├──────────────┬──────────────┐
     ▼              ▼              ▼
Sidebar selected   Main Scope     Drawer
                                   open/close
```

---

# 5.77 History 흐름 예시

```text
/today
   ↓ Sidebar: Inbox
/inbox
   ↓ Board
/inbox?view=board
   ↓ Task 클릭
/inbox?view=board&task=1
   ↓ Task 다음
/inbox?view=board&task=2   (replace)
   ↓ Back
/inbox?view=board
   ↓ Back
/inbox
   ↓ Back
/today
```

이 흐름을 목표 동작으로 고정한다.

---

# 5.78 §5 확정 결정

- **N1.** 사용자가 다른 화면으로 느끼는 상태만 URL에 넣는다.
- **N2.** Tasks의 주요 Scope는 `/today`, `/upcoming`, `/inbox`, `/folder/:id`, `/list/:id`, `/tag/:id`, `/filter/:id`, `/completed`, `/trash`로 표현한다.
- **N3.** Path는 `WHERE`, Query의 `view`는 `HOW`를 표현한다.
- **N4.** 기본 View인 `list`는 URL에서 생략한다.
- **N5.** non-default View는 `?view=`로 표현한다.
- **N6.** 열린 Task Drawer는 `?task=`로 표현한다.
- **N7.** canonical Query 순서는 `view → task`로 고정한다.
- **N8.** Sidebar Scope 변경은 `pushState`를 사용한다.
- **N9.** View 변경도 `pushState`를 기본으로 한다.
- **N10.** Task 최초 open은 `pushState`를 사용한다.
- **N11.** Drawer 내부 이전/다음 Task 이동은 `replaceState`를 사용한다.
- **N12.** invalid view / canonicalization은 `replaceState`를 사용한다.
- **N13.** Browser Back 한 번으로 열린 Drawer만 닫혀야 한다.
- **N14.** URL은 새로고침 시 Navigation State의 source of truth다.
- **N15.** Sidebar selection, Main Scope, Drawer open state를 독립 local source of truth로 두지 않는다.
- **N16.** Scope별 허용 View와 기본 View는 Registry로 공통 관리한다.
- **N17.** 잘못된 View는 기본 View로 fallback하고 URL을 canonicalize한다.
- **N18.** 존재하지 않는 Resource는 임의 위치로 redirect하지 않고 명확한 Not Found 상태를 보여준다.
- **N19.** Task와 현재 Scope가 모순되면 Task의 canonical location으로 정리한다.
- **N20.** Sidebar width, section collapse, hover, popover, drag, scroll 등은 URL에 넣지 않는다.
- **N21.** 기본 앱 진입 `/`은 `/today`로 연결한다.
- **N22.** List/Folder/Tag 등의 표시 이름 변경이 URL을 깨지 않도록 identity는 안정적인 ID를 사용한다.
- **N23.** URL Builder / Parser / Canonicalizer를 공통 Navigation 계층으로 분리한다.
- **N24.** Browser Back/Forward의 `popstate` 처리에서는 history를 다시 push하지 않는다.
- **N25.** TickTick처럼 즉시 전환되는 SPA 경험을 유지하면서 URL과 history는 정확히 동기화한다.

---

---

# 6. 데이터 모델 / Task 소유 구조 / Inbox / List / Folder / Tag 연결 규칙

## 6.1 목적

§1~§5에서 정의한 TickTick형 UI가 실제 데이터 구조와 충돌하지 않도록 **Task의 소유권과 List 중심 모델을 다시 정리**한다.

이번 단계에서 가장 중요한 질문은 이것이다.

> TickTick처럼 사용자가 `새 리스트`를 바로 만들 수 있는데, 그 List가 반드시 Project 안에 있어야 하는가?

결론은 **아니다.**

Tasks Module을 진짜 TickTick처럼 단순하게 만들려면 `List` 자체가 독립적인 1급 Task Container여야 한다.

즉 기존의:

```text
Space
└─ Project
   └─ Folder
      └─ List
         └─ Task
```

만 허용하는 모델에서 다음처럼 확장한다.

```text
Task
└─ List
   ├─ Project에 연결된 List
   ├─ Project와 무관한 독립 List
   └─ 시스템 Inbox List
```

Project / Space는 Task의 필수 부모가 아니라 **List가 선택적으로 연결될 수 있는 고급 프로젝트 Context**로 둔다.

이 변경이 §6의 핵심이다.

---

## 6.2 핵심 불변식

전체 데이터 모델은 다음 불변식을 만족해야 한다.

### I1. 모든 활성 Task는 정확히 하나의 List를 가진다.

```text
Task.listId != null
```

Task가 아무 곳에도 속하지 않는 상태를 허용하지 않는다.

### I2. Inbox도 List의 한 종류다.

따라서 다음 같은 별도 예외 owner 모델을 만들지 않는다.

```text
task.listId = null
task.isInbox = true
```

대신:

```text
Task
└─ Inbox List
```

로 표현한다.

### I3. Project는 List의 선택적 상위 Context다.

```text
List.projectId = Project ID | null
```

### I4. Space 소속은 Project를 통해 파생한다.

```text
Task
→ List
→ Project?
→ Space?
```

Task에 `spaceId`, `projectId`를 중복 저장하지 않는다.

### I5. Folder는 Task를 소유하지 않는다.

Task의 실제 owner는 항상 List다.

### I6. Smart List는 Task를 소유하지 않는다.

Today / Upcoming / Tag / Filter / Completed는 Query다.

### I7. Presentation Folder와 Domain Folder를 분리한다.

Tasks Sidebar의 Folder와 기존 Project 내부 Folder가 동일한 의미라고 가정하지 않는다.

---

# 6.3 가장 중요한 구조 변경 — List의 Project 의존성 제거

TickTick형 Tasks Module에서 사용자는 다음 동작을 기대한다.

```text
리스트 +
→ 새 리스트
→ "블로그"
```

이때 Project 선택을 요구하면 TickTick형 단순성이 깨진다.

그렇다고 사용자 몰래:

```text
숨겨진 기본 Project
```

를 만들어 그 안에 List를 넣는 것도 피한다.

사용자는 보지 못하는 소유 규칙 때문에 데이터 위치를 예측할 수 없게 된다.

따라서 `List.projectId`를 nullable로 만든다.

```text
List
├─ projectId = null
│  └─ 독립 List
│
└─ projectId = project123
   └─ Project에 연결된 List
```

---

## 6.4 List의 세 종류

개념적으로 List를 다음 세 유형으로 구분한다.

```text
List.kind =
  inbox
  regular
```

`regular` List는 다시 Project 연결 여부에 따라 두 종류의 사용 상태를 가진다.

```text
regular + projectId null
→ 독립 List

regular + projectId set
→ Project 연결 List
```

즉 데이터 enum은 단순하게 유지한다.

---

# 6.5 Inbox를 시스템 List로 구현

Inbox는 별도 Task owner 타입이 아니라 **시스템 List**로 구현한다.

예:

```text
List
id: inbox_user_123
kind: inbox
name: 기본함
projectId: null
```

Task 생성:

```text
Task.listId = inbox_user_123
```

이렇게 하면 모든 Task에 동일한 owner rule을 적용할 수 있다.

---

## 6.6 Inbox의 유일성

개인 Todo 기준으로 사용자마다 Inbox 하나를 가진다.

개념적 제약:

```text
UNIQUE(ownerUserId, kind = inbox)
```

멀티 워크스페이스 앱이라면 정책에 따라:

```text
UNIQUE(workspaceId, ownerUserId, kind = inbox)
```

로 둘 수 있다.

중요한 것은 **한 사용자가 같은 Context 안에서 Inbox를 여러 개 갖지 않게 하는 것**이다.

---

## 6.7 Inbox의 UI와 데이터 이름 분리

DB 내부 이름:

```text
kind = inbox
```

UI 표시 이름:

```text
기본함
```

사용자가 표시 언어를 바꾸더라도 system identity는 변하지 않는다.

Inbox 이름을 일반 List rename처럼 바꾸게 하지 않는다.

---

# 6.8 Regular List

Regular List는 Task를 직접 소유하는 일반 List다.

예:

```text
ABM 연구
영어 공부
Todo App
블로그
```

최소 속성:

```text
id
workspaceId / owner scope
kind = regular
name
projectId?
sidebarFolderId?
color?
sortKey
createdAt
updatedAt
archivedAt?
deletedAt?
```

---

## 6.9 독립 List

Tasks Sidebar에서 바로 생성한 List는 기본적으로 독립 List다.

```text
projectId = null
```

예:

```text
블로그
해야 하는 일
장보기
영어 공부
```

이 List의 Task는 Tasks Module에서는 정상 동작하지만 Space / Project 화면에는 나타나지 않는다.

이것은 오류가 아니라 의도된 의미다.

> Project에 넣지 않은 개인 Task는 Project 관리 화면에 나타날 이유가 없다.

---

# 6.10 Project 연결 List

List를 Project에 연결하면:

```text
List.projectId = project123
```

이후 List 안의 모든 Task는 자동으로 해당 Project 및 Space Context에 포함된다.

```text
Task
→ List
→ Project
→ Space
```

Task row 자체를 일괄 수정할 필요가 없다.

---

## 6.11 List를 Project에 연결하는 방법

Tasks Module에서 List를 만들 때 Project 선택을 강제하지 않는다.

필요할 때 다음과 같은 Action을 제공할 수 있다.

```text
List ...
→ 프로젝트에 연결
```

또는 Spaces에서 기존 List를 가져오는 흐름:

```text
Project
→ 기존 List 연결
```

MVP에서는 기존 프로젝트 연결 기능을 별도 관리 화면에 둘 수 있다.

---

# 6.12 Project 연결 해제

Project와 연결된 List에서:

```text
projectId = null
```

로 변경하면 List는 독립 List가 된다.

Task 자체는 삭제되지 않는다.

다만 Space/Project 화면에서는 더 이상 나타나지 않는다.

이 변경은 범위가 크게 달라지므로 사용자 Action으로 명시적으로 수행한다.

---

## 6.13 숨겨진 기본 Project를 만들지 않음

다음 패턴은 금지한다.

```text
Tasks에서 새 List
↓
사용자 몰래 "Default Project" 생성
↓
그 안에 List 저장
```

이 방식은:

- Space/Project 수를 오염시키고
- 사용자가 보지 못하는 부모를 만들고
- Project 삭제/이동 semantics를 복잡하게 만든다.

따라서 독립 List를 정식 지원한다.

---

# 6.14 Task 기본 스키마

개념적인 최소 Task schema:

```text
Task
├─ id
├─ workspaceId
├─ listId                 NOT NULL
├─ sectionId?             nullable
├─ title
├─ description?
├─ priority
├─ dueOn?                 date-only
├─ dueAt?                 timestamp
├─ someday                boolean
├─ completedAt?
├─ deletedAt?
├─ sortKey
├─ createdBy
├─ createdAt
└─ updatedAt
```

기존 Domain에 필요한 추가 필드는 유지할 수 있다.

MVP Subtask는 `Task.parentTaskId`를 추가하지 않는다. 별도 `TaskSubtask` table을 사용한다.

Repeat / Reminder도 Task row에 임의 JSON/string field를 먼저 추가하지 않는다. P1에서 §13의 별도 entity를 additive migration으로 도입한다.

---

# 6.15 날짜 저장 — date-only와 time 포함을 분리

Todo 앱에서는:

```text
오늘까지
```

와:

```text
오늘 18:00까지
```

가 의미상 다르다.

따라서 가능한 경우 다음을 구분한다.

### 날짜만 있는 Task

```text
dueOn = 2026-08-18
dueAt = null
```

### 시간이 있는 Task

```text
dueOn = null
dueAt = 2026-08-18T18:00:00+09:00
```

단순히 모든 날짜를 UTC 자정 timestamp로 저장하면 timezone 이동 시 날짜가 바뀌는 문제가 생길 수 있으므로 피한다.

---

## 6.16 dueOn / dueAt 불변식

기본:

```text
dueOn != null XOR dueAt != null
```

또는 둘 다 null.

즉:

```text
둘 중 하나만 설정
또는 둘 다 없음
```

동시에 둘 다 source of truth가 되지 않는다.

---

# 6.17 Today Query

Today는 저장 Container가 아니라 Query다.

canonical 조건:

```text
not deleted
AND not completed
AND (
  effectiveDueDate < userToday
  OR effectiveDueDate == userToday
  OR explicitTodayPlan exists for userToday
)
```

즉 Today active membership에는 Overdue, 오늘 마감, TodayPlan(today) Task가 모두 포함된다.

`effectiveDueDate`:

```text
dueOn
OR
dueAt을 사용자 timezone의 날짜로 변환
```

---

## 6.18 Explicit Today Plan

기존 Today 계획 기능을 살리려면 Task row에 매일 바뀌는 상태를 직접 박지 않고 별도 관계로 둔다.

권장 개념:

```text
TaskDailyPlan
├─ taskId
├─ userId
├─ planDate
├─ bucket?
└─ sortKey
```

예:

```text
task123
2026-08-18
bucket = next
```

Today UI가 TickTick처럼 단순 List가 되더라도 이 구조는 향후 순서/계획 기능에 재사용할 수 있다.

---

## 6.19 기존 Now / Next / Later와의 관계

기존 Today 모델에:

```text
now
next
later
```

가 있다면 이를 Task의 영구 상태로 만들지 않는다.

`TaskDailyPlan.bucket` 같은 **해당 날짜의 planning metadata**로 유지한다.

즉 Task 자체의 정체성과 분리한다.

---

# 6.20 Upcoming Query

`다음 7일` 기본 Query:

```text
not deleted
AND not completed
AND effectiveDueDate >= today
AND effectiveDueDate <= today + 6 days
```

사용자 timezone을 기준으로 계산한다.

---

## 6.21 Overdue

Overdue는 별도 owner나 상태가 아니다.

```text
effectiveDueDate < today
AND not completed
```

인 Derived State다.

Today canonical query에는 overdue Task를 포함한다.

UI에서는 `기한 지남` 그룹으로 Today 상단에 분리해서 표시하며, Sidebar/Header Today Count도 동일 query를 사용한다.

---

# 6.22 Someday 모델

Inbox Board의 `언젠가`를 지원하기 위해 Task에 명시적 속성을 둔다.

```text
someday boolean NOT NULL DEFAULT false
```

이는 List/Project 소유와 독립적이다.

---

## 6.23 Someday 불변식

애매한 상태를 막기 위해 권장:

```text
someday = true
→ dueOn = null
→ dueAt = null
```

즉 `언젠가` Task는 동시에 특정 날짜를 가지지 않는다.

---

## 6.24 Inbox Board Column 계산

Inbox Board는 저장된 Section이 아니라 가상 Column이다.

### 미분류

```text
list.kind = inbox
AND someday = false
AND dueOn is null
AND dueAt is null
```

### 일정

```text
list.kind = inbox
AND someday = false
AND (dueOn is not null OR dueAt is not null)
```

### 언젠가

```text
list.kind = inbox
AND someday = true
```

---

## 6.25 Inbox Board Drag Patch

### 미분류 → 일정

```text
날짜 선택 필요
someday = false
dueOn / dueAt 설정
```

### 일정 → 미분류

```text
dueOn = null
dueAt = null
someday = false
```

### 미분류/일정 → 언젠가

```text
someday = true
dueOn = null
dueAt = null
```

### 언젠가 → 미분류

```text
someday = false
```

이 규칙을 UI마다 따로 구현하지 않고 domain function으로 공통화한다.

---

# 6.26 일반 List의 Section 모델

일반 List의 Board Column은 `Section`을 사용한다.

개념:

```text
List
├─ Section A
├─ Section B
└─ Section C
```

Task:

```text
Task.sectionId = sectionA
```

Section은 반드시 자신이 속한 List 안에서만 유효하다.

---

## 6.27 Section schema

```text
ListSection
├─ id
├─ listId
├─ name
├─ sortKey
├─ createdAt
└─ updatedAt
```

Task `sectionId`는 nullable.

null이면:

```text
기본 / 미분류 Section
```

으로 렌더할 수 있다.

---

## 6.28 Section 불변식

다음은 금지한다.

```text
Task.listId = List A
Task.sectionId = Section of List B
```

DB constraint만으로 어렵다면 domain validation으로 반드시 막는다.

---

## 6.29 List 이동 시 Section 처리

Task를 다른 List로 이동하면 기존 Section은 무효가 된다.

기본:

```text
listId 변경
→ sectionId = null
```

사용자가 대상 List의 Section까지 명시적으로 선택한 경우에만 새 sectionId를 설정한다.

---

# 6.30 Task 수동 정렬

List/Board의 manual sort를 위해 Task에 단순 정수 index보다 **삽입 친화적 sort key**를 권장한다.

예:

```text
sortKey: fractional / lexicographic rank
```

장점:

```text
Task A
Task B
```

사이에 Task를 넣을 때 전체 Task를 재번호 매기지 않아도 된다.

---

## 6.31 sortKey의 의미 범위

`Task.sortKey`는 기본적으로 **owner List 안의 manual order**를 의미한다.

Section이 존재하면:

```text
(listId, sectionId, sortKey)
```

기준으로 정렬한다.

---

## 6.32 Smart List의 수동 순서

Today처럼 owner가 아닌 Query View에서의 수동 순서를 Task.sortKey로 저장하면 원래 List 순서와 충돌한다.

`TaskDailyPlan.sortKey`가 이미 존재하는 Task는 Today 정렬 우선순위에 반영할 수 있다.

하지만 MVP에서는 Today 전체의 자유 Drag reorder를 제공하지 않는다.

```text
Today 자유 Drag reorder = OFF
```

이유는 due-only Task를 정렬하기 위해 새 TodayPlan membership을 생성하는 부작용을 피하기 위해서다.

향후 전체 manual reorder를 도입하려면 Today membership과 Today view order를 분리한 데이터 계약을 먼저 정의한다.

---

# 6.33 Sidebar Folder — Domain Folder와 분리

Tasks Sidebar에서 보이는:

```text
학교
├─ ABM 연구
└─ 영어 공부
```

의 `학교`는 **Presentation Folder**다.

기존 Project 구조의 Domain Folder와 역할이 다르다.

내부 타입 이름은 혼동을 줄이기 위해:

```text
SidebarFolder
```

또는:

```text
TaskListFolder
```

를 권장한다.

---

## 6.34 SidebarFolder schema

```text
SidebarFolder
├─ id
├─ ownerUserId / workspace scope
├─ name
├─ sortKey
├─ createdAt
└─ updatedAt
```

List:

```text
sidebarFolderId?
sidebarSortKey
```

를 가진다.

---

## 6.35 SidebarFolder는 List만 그룹화

```text
SidebarFolder
└─ List
```

Task 직접 소유 금지.

또한 Tasks Presentation IA에서는 Nested Folder를 허용하지 않으므로:

```text
parentFolderId
```

를 두지 않는 것을 권장한다.

---

# 6.36 Domain Folder와 동시 존재

Project 내부 Domain Folder가 필요한 경우 List는 다음 두 관계를 동시에 가질 수 있다.

```text
List
├─ domainFolderId?      // Spaces/Project 구조
└─ sidebarFolderId?     // Tasks UI 그룹
```

예:

```text
실제 Domain:
Space: 학교
Project: Drone 연구
Domain Folder: 논문

Tasks Sidebar:
Sidebar Folder: 연구
List: ABM 연구
```

둘은 같은 이름일 필요도 없다.

---

## 6.37 Sidebar에서 List 이동

Sidebar drag:

```text
List A
→ SidebarFolder B
```

는 오직:

```text
sidebarFolderId
sidebarSortKey
```

만 변경한다.

다음은 바뀌지 않는다.

```text
projectId
domainFolderId
Task ownership
Space membership
```

이 구분이 매우 중요하다.

---

# 6.38 List와 Project 관계

List가 Project에 연결되면:

```text
projectId
```

만 해당 Project를 가리킨다.

Project가 속한 Space는:

```text
Project.spaceId
```

에서 파생한다.

Task에 별도:

```text
projectId
spaceId
```

를 중복 저장하지 않는다.

---

## 6.39 Task의 Project / Space 계산

공통 selector/domain function:

```text
getTaskProject(task)
→ task.list.project

getTaskSpace(task)
→ task.list.project?.space
```

UI가 직접 여러 FK를 추론하지 않게 한다.

---

# 6.40 Task를 다른 List로 이동

Task move의 핵심 operation:

```text
moveTask(taskId, targetListId, targetSectionId?)
```

처리:

```text
1. target List 존재 확인
2. 권한 확인
3. task.listId 변경
4. sectionId 재계산
5. sortKey 새 위치 생성
6. Project/Space derived scope 자동 변경
7. 현재 View membership 재평가
```

Task에 projectId를 별도로 업데이트하는 작업은 없다.

---

## 6.41 Project 간 Task 이동

예:

```text
ABM 연구 List (Project A)
→ Todo App List (Project B)
```

Task는 List 이동 하나로:

```text
Project A
→ Project B
```

Context가 변경된다.

별도의 Project Move operation과 Task List Move가 서로 다른 결과를 만들지 않게 한다.

---

# 6.42 Project 연결 List → Inbox 이동

Project Task를 Inbox로 옮기면:

```text
listId = inboxListId
```

가 된다.

그 결과 Project / Space derived membership이 사라진다.

이것은 명시적 사용자 Action이므로 허용한다.

다만 Task가 Project 전용 관계를 가지고 있다면 사전 검증이 필요하다.

예:

```text
Milestone link
Project-only custom field
dependency scoped to project
```

이런 관계가 있다면:

```text
이 작업을 기본함으로 이동하면 프로젝트 연결 정보 일부가 제거됩니다.
```

같은 확인 또는 cleanup 정책이 필요하다.

---

# 6.43 Task 생성

공통 create operation:

```text
createTask({
  targetListId,
  title,
  sectionId?,
  initialAttributes?
})
```

`targetListId`는 항상 필수다.

UI가 Folder/Tag/Filter Context에서 생성하더라도 최종 domain command 호출 전에는 target List가 확정되어야 한다.

---

## 6.44 Context별 Task 생성

### Inbox

```text
targetListId = inboxList.id
```

### 특정 List

```text
targetListId = currentList.id
```

### Folder

```text
List Picker
→ targetListId 확정
```

### Tag

```text
List Picker
→ targetListId 확정
→ tag 자동 추가
```

### Filter

```text
List 결정 가능?
├─ Yes → 사용
└─ No → Picker
```

이후 생성 가능한 Filter 조건을 적용한다.

---

# 6.45 Tag 모델

Tag는 독립 객체다.

```text
Tag
├─ id
├─ owner/workspace scope
├─ name
├─ color?
├─ sortKey?
├─ createdAt
└─ updatedAt
```

Task와 다대다 관계:

```text
TaskTag
├─ taskId
└─ tagId
```

---

## 6.46 Tag 불변식

하나의 Task에 같은 Tag를 중복 연결할 수 없다.

```text
UNIQUE(taskId, tagId)
```

Tag 삭제:

```text
Tag row 삭제/soft delete
→ TaskTag 관계 제거
→ Task 자체 유지
```

---

# 6.47 Smart List 저장 여부

다음은 DB row로 만들지 않는다.

```text
Today
Upcoming
Completed
Trash
```

이들은 system query definition이다.

Inbox만 실제 List row로 존재한다.

---

## 6.48 Smart List Registry

앱 코드에 다음과 같은 registry를 둔다.

```text
today
upcoming
inbox
completed
trash
```

여기서:

- label
- icon
- query builder
- default view
- allowed views

를 연결한다.

DB에 매 사용자마다 Today row를 만들지 않는다.

---

# 6.49 Saved Filter

사용자가 만든 Filter만 DB에 저장한다.

권장:

```text
SavedFilter
├─ id
├─ ownerUserId / workspaceId
├─ name
├─ filterSpec
├─ sortKey
├─ createdAt
└─ updatedAt
```

---

## 6.50 filterSpec은 구조화된 형태

단순 SQL 문자열이나 자유 텍스트 query를 저장하지 않는다.

예:

```text
{
  version: 1,
  all: [
    { field: "tag", op: "includes", value: "tag_important" },
    { field: "due", op: "on", value: "today" },
    { field: "completed", op: "eq", value: false }
  ]
}
```

구조화된 AST/JSON 형태로 저장한다.

---

## 6.51 Filter schema version

향후 조건 종류가 늘어날 수 있으므로:

```text
version
```

을 반드시 둔다.

Filter parser가 이전 버전을 migration할 수 있게 한다.

---

# 6.52 Completion 모델

완료 여부는 하나의 canonical source만 둔다.

권장:

```text
completedAt timestamp | null
```

판정:

```text
completed = completedAt != null
```

---

## 6.53 기존 status가 있는 경우

현재 Domain에서:

```text
todo
doing
done
```

같은 workflow status가 있다면 `completedAt`과 `status=done`을 서로 독립적인 완료 source로 두면 안 된다.

두 가지 중 하나로 정리한다.

### 권장

```text
completedAt = Todo completion canonical source
workflowStatus = Project workflow metadata
```

`done` workflow와 completion을 연결해야 한다면 domain rule로 명시적으로 동기화한다.

무조건 양쪽을 제각각 수정하는 구조는 금지한다.

---

# 6.54 Trash 모델

Task 삭제는 soft delete를 사용한다.

```text
deletedAt timestamp | null
```

일반 Query:

```text
deletedAt is null
```

Trash Query:

```text
deletedAt is not null
```

---

## 6.55 완료와 Trash 관계

Trash가 더 높은 제외 우선순위를 가진다.

예:

```text
completedAt != null
deletedAt != null
```

인 Task는 Completed가 아니라 Trash에만 나타난다.

복원하면 원래 완료 상태는 유지할 수 있다.

---

# 6.56 List Archive / Delete / Restore와 Task

List lifecycle은 §13을 canonical source로 사용하며 다음으로 확정한다.

### Archive

```text
List.archivedAt = now
→ Task.listId 유지
→ 해당 List와 Task는 active Tasks Scope에서 제외
→ Archived Lists 관리 화면에서 복원 가능
```

### Delete

```text
List.deletedAt = now
→ Task.listId 유지
→ Task.deletedAt은 건드리지 않음
→ 해당 List와 Task는 active Tasks Scope에서 제외
→ Deleted Lists 관리 화면에서 복원 가능
```

List 삭제 때문에 자식 Task를 개별 Trash Task로 바꾸지 않는다.

### Restore

```text
archivedAt / deletedAt = null
→ 기존 Task가 같은 listId로 다시 접근 가능
```

### Permanent Delete

Deleted Lists 관리 화면에서만 강한 confirmation 후 허용한다. 이 경우 List에 남아 있는 Task와 Task 종속 데이터도 함께 영구 삭제한다.

일반 Delete에서는 hard cascade를 절대 수행하지 않는다.

---

## 6.57 SidebarFolder 삭제

SidebarFolder는 Presentation grouping이므로 삭제해도 List는 삭제하지 않는다.

```text
SidebarFolder 삭제
→ 하위 List.sidebarFolderId = null
→ List는 Sidebar root로 이동
```

§2에서 정한 UX와 데이터 규칙을 일치시킨다.

---

# 6.58 Project Archive / Delete / Restore

Project는 List의 optional context이므로 Project lifecycle이 Task owner를 바꾸지 않도록 한다.

### Archive

```text
Project.archivedAt = now
→ Spaces의 active Project View에서 제외
→ 연결 List.projectId 유지
→ Tasks Module의 List/Task는 그대로 사용 가능
```

### Delete

```text
Project.deletedAt = now
→ Spaces의 active View에서 제외
→ 연결 List.projectId는 restore를 위해 유지
→ Tasks Module의 List/Task는 그대로 사용 가능
```

active Project/Space selector는 deleted Project를 active context로 반환하지 않는다.

### Restore

```text
Project.deletedAt = null
→ 기존 List 연결 관계가 그대로 복구
```

### Permanent Delete

연결 List를 자동 삭제하지 않는다. 하나의 atomic command에서:

```text
linked List.projectId = null
→ Project hard delete
```

로 처리하여 List를 독립 List로 보존한다. List까지 삭제하려면 별도의 명시적 List delete action이 필요하다.

---

# 6.59 Space Archive / Delete / Restore

Space lifecycle도 Task/List를 직접 변경하지 않는다.

### Archive

```text
Space.archivedAt = now
→ Spaces active navigation에서 제외
→ Project.spaceId 유지
→ Tasks Module은 영향 없음
```

### Delete

```text
Space.deletedAt = now
→ Spaces active navigation에서 제외
→ Project.spaceId 유지
→ List/Task 데이터 변경 없음
```

### Restore

```text
Space.deletedAt = null
→ 기존 Project 관계 복구
```

### Permanent Delete

Project를 숨은 기본 위치로 자동 이동시키지 않는다.

```text
해당 Space를 참조하는 Project가 하나라도 존재
→ permanent delete 차단
```

사용자가 Project를 다른 Space로 이동하거나 Project lifecycle을 먼저 정리한 뒤에만 Space hard delete를 허용한다.

---

# 6.60 Workspace / 사용자 Scope

멀티 사용자 가능성을 고려하면 모든 주요 객체는 소유 범위를 명확히 가진다.

예:

```text
Task.workspaceId
List.workspaceId
Tag.workspaceId
SavedFilter.workspaceId
```

개인 전용 Inbox는 추가로:

```text
ownerUserId
```

를 가질 수 있다.

---

## 6.61 개인 Inbox와 공유 Project

공유 Workspace에서 여러 사용자가 하나의 Inbox를 공유하면 미분류 개인 작업이 섞일 수 있다.

따라서 기본 권장:

```text
Inbox = user-scoped
Regular List = workspace/project-scoped 가능
```

Task를 Inbox에서 공유 List로 옮기는 순간 공유 Context로 들어간다.

---

# 6.62 데이터베이스 개념 구조

```text
User
│
├─ Inbox List
│   └─ Task
│
├─ SidebarFolder
│   └─ List
│
└─ SavedFilter

Workspace
│
├─ Space
│   └─ Project
│       └─ Domain Folder?
│           └─ List
│               ├─ Section
│               └─ Task
│
├─ Standalone List
│   └─ Task
│
└─ Tag
    └─ TaskTag
```

실제 권한 모델에 따라 User/Workspace 경계는 조정할 수 있다.

---

# 6.63 List 관계 전체 그림

```text
                        ┌──────────────┐
                        │ SidebarFolder│
                        └──────┬───────┘
                               │ presentation grouping
                               ▼
┌─────────┐       optional   ┌───────┐      owns      ┌──────┐
│ Project │ ───────────────▶ │ List  │ ─────────────▶ │ Task │
└────┬────┘                  └───┬───┘                └──────┘
     │                           │
     ▼                           │ optional
┌─────────┐                      ▼
│ Space   │                 ┌─────────┐
└─────────┘                 │ Section │
                            └─────────┘
```

Task는 Project/Space를 직접 참조하지 않는다.

---

# 6.64 Presentation Folder 관계 그림

```text
Tasks Sidebar

학교
├─ ABM 연구
├─ 영어 공부
└─ 수업
```

실제 Domain은 다음처럼 서로 달라도 된다.

```text
ABM 연구
→ Project A

영어 공부
→ standalone

수업
→ Project B
```

SidebarFolder는 이 차이를 숨기고 사용자의 개인 정리 방식만 표현한다.

---

# 6.65 데이터 생성 Flow

## 새 List

```text
Tasks > Lists +
↓
새 List
↓
name 입력
↓
regular List 생성
projectId = null
sidebarFolderId = current folder or null
```

Project를 몰래 만들지 않는다.

---

## 새 Inbox Task

```text
Inbox
↓
+ 작업
↓
Task 생성
listId = currentUserInboxListId
```

---

## 새 Project Task

```text
Specific Project-linked List
↓
+ 작업
↓
Task 생성
listId = that List
```

Project/Space membership은 자동 파생.

---

# 6.66 Migration 전략

기존 데이터 모델에서 새 구조로 옮길 때 **한 번에 기존 필드를 삭제하지 않는다.**

단계적으로 진행한다.

---

## 6.67 Migration Phase 0 — 현행 스키마 Audit

먼저 확인해야 한다.

```text
- Task는 현재 projectId를 직접 가지는가?
- Task는 listId를 항상 가지는가?
- List는 projectId를 필수로 가지는가?
- Folder와 List 관계는 무엇인가?
- orphan Task가 존재하는가?
- Today override는 어디 저장되는가?
- status / completed 정보 source는 무엇인가?
```

실제 코드/DB를 확인한 후 migration SQL을 작성한다.

문서 설계를 추측으로 바로 migration으로 옮기지 않는다.

---

# 6.68 Migration Phase 1 — Additive Schema

기존 기능을 깨지 않고 새 필드/테이블부터 추가한다.

예:

```text
List.projectId nullable 허용
List.kind
List.sidebarFolderId
Task.sectionId
Task.someday
Task.completedAt
Task.deletedAt
Task.sortKey

SidebarFolder
ListSection
TaskTag
SavedFilter
TaskDailyPlan
```

실제 현재 schema에 이미 있는 필드는 재사용한다.

---

# 6.69 Migration Phase 2 — Inbox 생성

각 사용자마다 Inbox system List를 생성한다.

```text
kind = inbox
projectId = null
```

중복 생성되지 않게 unique constraint를 둔다.

---

# 6.70 Migration Phase 3 — 기존 Task owner 정리

### Case A — 이미 List가 있는 Task

```text
기존 listId 유지
```

### Case B — Project만 있고 List가 없는 Task

해당 Project 안에 명시적인 기본 List를 생성하여 이동한다.

예:

```text
Project A
└─ 기본 목록
```

이 List는 숨겨진 부모가 아니라 실제 List로 취급한다.

가능하면 UI에서 이름을 조정할 수 있게 한다.

### Case C — Project도 List도 없는 orphan Task

```text
사용자 Inbox
```

로 이동한다.

---

# 6.71 왜 Project-only Task를 바로 Inbox로 보내지 않는가

기존 Project 소속 의미를 보존해야 하기 때문이다.

```text
Project-only Task
→ Inbox
```

로 옮기면 기존 Space/Project 화면에서 갑자기 사라질 수 있다.

따라서 Project마다 실제 List를 하나 만들어 기존 membership을 유지한다.

---

# 6.72 Migration Phase 4 — Project FK 완화

기존 List가 반드시 Project를 가져야 한다면:

```text
projectId NOT NULL
```

제약을 안전하게 완화한다.

```text
projectId nullable
```

이후 Tasks Module에서 standalone List 생성이 가능해진다.

---

# 6.73 Migration Phase 5 — Presentation Folder 도입

기존 Domain Folder를 그대로 Sidebar Folder로 바꾸지 않는다.

초기 Presentation Folder를 생성할 때는 다음 두 전략 중 하나를 선택한다.

### A. 자동 Seed

기존 Folder 이름을 기반으로 SidebarFolder 생성.

### B. 처음에는 모두 Root

사용자가 직접 TickTick식 Sidebar를 정리.

### 권장

기존 사용자가 많지 않은 초기 앱이라면 **B**가 더 안전하다.

Domain semantics를 Presentation semantics로 잘못 복제하지 않는다.

---

# 6.74 Migration Phase 6 — Dual Read 금지 방향

전환 기간에 구/신 모델을 둘 다 읽어 비교할 수는 있지만 장기간:

```text
oldProjectId
newListProjectId
```

를 각각 source of truth로 유지하면 안 된다.

최종 canonical source:

```text
Task.listId
List.projectId
```

로 수렴한다.

---

# 6.75 Migration Phase 7 — Legacy field 제거

새 경로가 충분히 검증된 뒤에만:

```text
Task.projectId
Task.spaceId
legacy folder relation
old today override
```

등 중복 필드를 제거하거나 read-only migration compatibility로 남긴다.

---

# 6.76 Space / Project와 Tasks Module 일관성

동일 Task를 두 Module에서 다른 객체처럼 만들지 않는다.

```text
Tasks
└─ Task 123

Spaces
└─ Task 123
```

둘은 같은 Task row다.

한 곳에서 완료/제목/날짜를 바꾸면 다른 곳에도 즉시 반영된다.

---

# 6.77 Project Scope Query

Project 화면의 Task 집계는:

```text
List.projectId = currentProjectId
AND Task.listId = List.id
```

기준으로 계산한다.

Task에 별도 projectId를 읽지 않는다.

---

# 6.78 Space Scope Query

Space:

```text
Project.spaceId = currentSpaceId
→ 해당 Project의 List
→ 해당 List의 Task
```

로 집계한다.

이렇게 하면 List가 다른 Project로 이동할 때 Task를 일괄 업데이트할 필요가 없다.

---

# 6.79 Standalone List와 Spaces

```text
List.projectId = null
```

인 List는 Space Query에 포함되지 않는다.

Tasks Module에서만 정상 표시한다.

필요하면 향후 사용자가 Project에 연결할 수 있다.

---

# 6.80 Inbox와 Spaces

Inbox는:

```text
kind = inbox
projectId = null
```

이므로 Space에 포함되지 않는다.

따라서 Space 화면에서는 Inbox Task 생성도 하지 않는다.

앞서 §1~§4에서 정한 생성 규칙과 일치한다.

---

# 6.81 Domain Command 공통화

데이터 무결성을 위해 UI 컴포넌트가 직접 여러 필드를 patch하지 않는다.

권장 Command:

```text
createTask
moveTask
completeTask
reopenTask
trashTask
restoreTask

createList
moveListToSidebarFolder
attachListToProject
detachListFromProject

moveTaskToInbox
setTaskDueDate
setTaskSomeday
moveTaskToSection
```

각 Command가 불변식을 책임진다.

---

# 6.82 예: `setTaskSomeday`

UI가 직접:

```text
someday = true
```

만 patch하면 due date가 남을 수 있다.

공통 domain function:

```text
setTaskSomeday(taskId, true)
```

는 반드시:

```text
someday = true
dueOn = null
dueAt = null
```

까지 처리한다.

---

# 6.83 예: `moveTask`

```text
moveTask(taskId, targetListId)
```

는:

```text
listId 변경
sectionId 초기화/검증
sortKey 생성
scope membership 재평가
```

를 한 operation으로 처리한다.

---

# 6.84 DB Constraint로 막을 것

가능하면 DB 수준에서 다음을 보장한다.

```text
Task.listId NOT NULL
TaskTag unique(taskId, tagId)
Inbox unique per user/context
Section.listId NOT NULL
List.kind valid enum
```

날짜/someday 같은 cross-field 규칙도 CHECK constraint가 가능하면 추가한다.

예:

```text
someday = true
→ dueOn IS NULL AND dueAt IS NULL
```

---

# 6.85 Domain Validation으로 막을 것

DB 단일 row constraint로 어려운 것:

```text
Task.sectionId가 Task.listId와 같은 List의 Section인지
target List 접근 권한
Project 전용 relation이 있는 Task의 Inbox 이동 가능 여부
Filter 조건 auto-apply 유효성
```

은 domain service에서 검증한다.

---

# 6.86 데이터 모델에서 피해야 할 것

### ① Task.projectId + Task.listId를 모두 canonical source로 사용

언젠가 둘이 어긋난다.

### ② Inbox를 `listId = null`로 표현

모든 query/validation에서 null 예외가 생긴다.

### ③ 새 List마다 숨겨진 Project 자동 생성

사용자가 이해하지 못하는 데이터가 쌓인다.

### ④ Tasks Sidebar Folder와 Domain Folder를 같은 테이블 의미로 강제

사용자 정리와 Project 구조가 얽힌다.

### ⑤ Today / Upcoming을 실제 List로 저장

Task 복제/동기화 문제가 생긴다.

### ⑥ Inbox Board Column을 실제 Section으로 저장

날짜 속성과 Section 상태가 이중 source가 된다.

### ⑦ `someday = true`인데 dueDate도 유지

Column 의미가 모순된다.

### ⑧ 모든 Query View의 수동 정렬을 Task.sortKey 하나로 처리

원래 List 순서와 충돌한다.

### ⑨ soft delete 없이 FK cascade로 List/Project 삭제

복구가 어려워지고 사용자 데이터 손실 위험이 커진다.

---

# 6.87 권장 타입 모델

개념적인 TypeScript 형태:

```ts
type ListKind = 'inbox' | 'regular'

type TaskList = {
  id: string
  kind: ListKind
  name: string
  projectId: string | null
  sidebarFolderId: string | null
  sortKey: string
  archivedAt: string | null
  deletedAt: string | null
}

type Task = {
  id: string
  listId: string
  sectionId: string | null

  title: string
  description: string | null

  dueOn: string | null
  dueAt: string | null
  someday: boolean

  priority: TaskPriority

  completedAt: string | null
  deletedAt: string | null

  sortKey: string
}

type TaskSubtask = {
  id: string
  parentTaskId: string
  title: string
  completedAt: string | null
  deletedAt: string | null
  sortKey: string
  createdAt: string
  updatedAt: string
}
```

Project / Space에도 lifecycle을 위해 `archivedAt` / `deletedAt`을 canonical timestamp로 둔다.

실제 코드베이스 타입과 합칠 때는 기존 이름을 최대한 재사용한다.

---

# 6.88 핵심 selector

```text
isInboxTask(task)
getTaskList(task)
getTaskProject(task)
getTaskSpace(task)
isTaskCompleted(task)
isTaskDeleted(task)
getEffectiveDueDate(task, timezone)
isTaskToday(task, user, date)
isTaskUpcoming(task, user, date)
getInboxBoardBucket(task)
```

UI가 같은 조건식을 중복 작성하지 않는다.

---

# 6.89 핵심 query

```text
queryTodayTasks(userId, date)
queryUpcomingTasks(userId, start, end)
queryInboxTasks(userId)
queryListTasks(listId)
queryFolderTasks(sidebarFolderId)
queryTagTasks(tagId)
queryFilterTasks(filterSpec)
queryCompletedTasks(scope?)
queryTrashTasks(userId)
```

Scope semantics를 한 곳에 고정한다.

---

# 6.90 성능 기본 원칙

Task 수가 늘어나도 Smart List가 느려지지 않도록 다음 index를 고려한다.

개념:

```text
Task.listId
Task.completedAt
Task.deletedAt
Task.dueOn
Task.dueAt
List.projectId
List.sidebarFolderId
TaskTag.tagId
ListSection.listId
TaskSubtask.parentTaskId
TaskSubtask.deletedAt
List.archivedAt
List.deletedAt
```

실제 DB 엔진과 query plan을 보고 최종 index를 정한다.

---

# 6.91 데이터 동기화 단위

화면별 별도 Task 사본을 만들지 않는다.

캐시에서도 canonical Task entity를 중심으로:

```text
Task entities
+
Scope별 Task ID list
```

형태를 권장한다.

예:

```text
entities.tasks[task123]
views.today = [task123, task456]
views.listA = [task123, task789]
```

Task 123을 수정하면 모든 View가 같은 entity 변경을 본다.

---

# 6.92 Optimistic Update와 Query 재평가

Task Date, Tag, List, Completion을 바꾸면 해당 Task가 여러 Scope에서 들어오고 나갈 수 있다.

따라서 mutation 후 단순 row patch만 하지 않고:

```text
Task entity patch
+
affected scope membership re-evaluation
```

을 수행한다.

예:

```text
due date → 오늘
```

이면 Today View에 즉시 들어와야 한다.

---

# 6.93 Scope membership 함수 공통화

개념적으로:

```text
matchesScope(task, scope, context)
```

를 둘 수 있다.

예:

```text
matchesScope(task, todayScope)
matchesScope(task, tagScope)
matchesScope(task, folderScope)
```

Main, Count Badge, next-action, optimistic cache가 서로 다른 조건을 쓰지 않게 한다.

---

# 6.94 Sidebar Count와 동일 Query 사용

Sidebar Count:

```text
ABM 연구 7
```

과 Main에 나타나는 미완료 Task 수가 다르면 안 된다.

따라서 Count도 동일 scope query/filter를 사용한다.

별도 간이 계산식을 만들지 않는다.

---

# 6.95 데이터 무결성 Acceptance Criteria

다음은 구현 완료 조건으로 테스트한다.

### AC1

모든 활성 Task는 List를 가진다.

### AC2

Inbox Task도 일반 Task와 동일한 CRUD path를 사용한다.

### AC3

독립 List를 Project 없이 생성할 수 있다.

### AC4

독립 List Task는 Spaces에 나타나지 않는다.

### AC5

Project-linked List Task는 해당 Project/Space에 나타난다.

### AC6

List의 Project 연결을 변경하면 Task row를 수정하지 않아도 Scope가 바뀐다.

### AC7

Sidebar Folder 이동은 Project/Space membership을 변경하지 않는다.

### AC8

Task를 다른 Project의 List로 옮기면 Project/Space Scope가 자동 변경된다.

### AC9

Someday Task에는 날짜가 남지 않는다.

### AC10

Inbox Board Drag 결과와 Task 속성이 항상 일치한다.

### AC11

Section은 다른 List의 Task에 연결될 수 없다.

### AC12

Today / Upcoming은 Task 사본을 만들지 않는다.

### AC13

완료/Trash Query는 서로 모순되지 않는다.

### AC14

Sidebar Count와 Main 결과가 같은 Scope semantics를 사용한다.

### AC15

기존 Project-only Task migration 후 기존 Project membership이 보존된다.

---

# 6.96 §6에서 확정하는 핵심 결정

- **D11.** `List`를 Task의 유일한 직접 소유 Container로 둔다.
- **D12.** 모든 활성 Task의 `listId`는 필수다.
- **D13.** Inbox는 `listId = null` 예외가 아니라 `kind=inbox`인 시스템 List로 구현한다.
- **D14.** 일반 List는 `projectId = null`인 독립 List를 정식 지원한다.
- **D15.** 새 List 생성 시 숨겨진 기본 Project를 자동 생성하지 않는다.
- **D16.** List가 Project에 연결되었을 때만 그 List의 Task가 Project/Space Scope에 포함된다.
- **D17.** Task의 Project/Space는 `Task → List → Project → Space`로 파생하고 Task에 중복 저장하지 않는다.
- **D18.** Tasks Sidebar Folder는 기존 Domain Folder와 분리한 `SidebarFolder`로 취급한다.
- **D19.** SidebarFolder 이동은 Presentation grouping만 변경하고 Project 관계는 변경하지 않는다.
- **D20.** Today / Upcoming / Completed / Trash는 저장 List가 아니라 Query다.
- **D21.** 사용자 Saved Filter만 저장 객체로 만들고 versioned structured filter spec을 사용한다.
- **D22.** Inbox Board의 `미분류 / 일정 / 언젠가`는 실제 Section이 아니라 Task 속성 기반 virtual column이다.
- **D23.** `someday=true`일 때 날짜는 반드시 비운다.
- **D24.** 일반 List의 Board Column은 `ListSection`으로 저장한다.
- **D25.** Task를 다른 List로 옮기면 기존 `sectionId`는 기본적으로 초기화한다.
- **D26.** Task manual order는 삽입 친화적인 `sortKey`로 관리한다.
- **D27.** Query View의 별도 수동 순서는 Task 자체 sortKey와 분리한다.
- **D28.** 완료 상태는 하나의 canonical source를 사용한다.
- **D29.** Task 삭제는 soft delete를 기본으로 한다.
- **D30.** List/Project/Space의 일반 Delete는 soft delete이며 고아 Task를 만들거나 즉시 hard cascade하지 않는다.
- **D31.** 기존 Project-only Task는 migration 시 해당 Project의 실제 기본 List로 옮겨 membership을 보존한다.
- **D32.** 진짜 orphan Task만 사용자 Inbox로 migration한다.
- **D33.** 새 schema는 additive migration → backfill → read 전환 → legacy 제거 순으로 적용한다.
- **D34.** UI가 여러 필드를 직접 patch하지 않고 domain command가 불변식을 책임진다.
- **D35.** Sidebar Count, Main 결과, optimistic update 모두 동일한 Scope membership 규칙을 사용한다.
- **D36.** MVP Subtask는 일반 Task self-reference가 아니라 별도 `TaskSubtask` entity로 저장한다.
- **D37.** TaskSubtask는 1단계만 허용하고 독립 List/Date/Priority/Tag/Repeat/Reminder를 갖지 않는다.
- **D38.** Repeat와 Reminder는 MVP에서 숨기고 P1 데이터 계약이 구현된 뒤 활성화한다.
- **D39.** List의 Archive/Delete는 자식 Task의 `listId`를 유지하며 active Scope에서만 제외한다.
- **D40.** Project Archive/Delete는 연결 List/Task를 Tasks Module에서 숨기거나 이동시키지 않는다.
- **D41.** Project permanent delete는 연결 List를 독립 List로 detach한 뒤 Project만 hard delete한다.
- **D42.** Space permanent delete는 참조 Project가 남아 있으면 차단한다.
- **D43.** Container restore는 soft-delete 전 relation을 그대로 복구하는 것을 기본으로 한다.

---

---

# 7. Main View별 구체 UX — Today / Upcoming / Inbox / List / Folder / Tag / Filter / Completed / Trash

## 7.1 목적

§7의 목적은 지금까지 정의한 공통 Main Workbench 규칙을 실제 Scope별 화면에 적용하여, 사용자가 각 화면에서 **무엇을 보고, 무엇을 할 수 있고, 무엇이 달라지는지**를 확정하는 것이다.

이번 단계에서 가장 중요한 원칙은 다음과 같다.

> 모든 Scope가 같은 List 화면을 복제해서 쓰는 것이 아니라, Scope의 의미에 맞는 기본 정렬·그룹·메타데이터·생성 동작을 가진다.

다만 다음 공통 구조는 유지한다.

```text
Main Header
↓
View Toolbar
↓
Task Content
↓
Optional Detail Drawer
```

Scope에 따라 달라지는 것은:

```text
- 기본 View
- Grouping
- Sort
- 보여줄 Metadata
- + 작업 동작
- Board 허용 여부
- Empty State
```

이다.

---

# 7.2 Scope별 기본값 요약

| Scope | 기본 View | 기본 Grouping | 기본 Sort | + 작업 |
|---|---|---|---|---|
| Today | List | `기한 지남 / 오늘` | 기존 TodayPlan order가 있으면 우선 → 시간 → 우선순위 → stable | Inbox + TodayPlan |
| Upcoming | List | 날짜별 | 날짜 → 시간 → 우선순위 → stable | Inbox + 날짜 필수 |
| Inbox | List | 없음 | 수동 순서 | Inbox에 즉시 생성 |
| Inbox Board | Board | 미분류/일정/언젠가 | 컬럼별 수동 | 컬럼 의미 자동 적용 |
| List | List | Section | 수동 순서 | 현재 List |
| Folder | List | 하위 List별 | List 순서 → Task 순서 | 하위 List 선택 필수 |
| Tag | List | 없음 | 날짜 → 우선순위 → stable | Inbox 기본 + Tag 자동 적용 |
| Filter | List | 없음 | Filter 정의 또는 due → priority → stable | 단일 List 조건이면 해당 List, 아니면 Inbox |
| Completed | List | 완료 날짜별 | 최근 완료순 | 생성 불가 |
| Trash | List | 삭제 날짜별 | 최근 삭제순 | 생성 불가 |

이 표는 기본값이며 사용자가 일부 View에서 Sort/Grouping을 바꿀 수 있다.

---

# 7.3 Today — 역할

Today는 단순히 `dueDate = today`를 보여주는 화면이 아니다.

사용자가 앱을 열었을 때 가장 먼저 묻게 되는:

> 오늘 실제로 무엇을 처리해야 하는가?

에 답하는 **실행 중심 View**다.

Today는 기본 진입 화면으로 유지한다.

```text
/
→ /today
```

---

## 7.4 Today 포함 규칙

Today의 기본 포함 대상은 다음과 같다.

```text
A. 기한이 지난 미완료 Task
B. 오늘 마감 Task
C. 오늘로 명시적으로 계획한 Task
```

A/B/C는 모두 canonical Today active membership에 포함한다.

Overdue는 Today 화면 상단의 별도 그룹으로 표시한다.

이유:

> 기한이 지났다고 사용자의 오늘 할 일에서 사라지면 실제 실행 흐름에서 놓치기 쉽다.

따라서:

```text
기한 지남
────────
□ 어제 끝냈어야 할 Task

오늘
────────
□ 오늘 Task
```

형태를 권장한다.

---

# 7.5 Today 기본 Grouping

기본적으로 과도한 시간대 그룹은 사용하지 않는다.

권장:

```text
기한 지남       ← 있을 때만
오늘
완료됨           ← 선택적, 접힘
```

즉:

```text
오전 / 오후 / 저녁
```

을 기본 Group으로 강제하지 않는다.

시간이 있는 Task는 우측 Metadata로 시간만 표시한다.

---

## 7.6 Today 기본 Sort

정렬 우선순위:

```text
1. TaskDailyPlan.sortKey가 있으면 그 순서
2. 시간이 있는 Task는 시간순
3. 동일 조건에서는 Priority
4. 이후 생성/기본 stable order
```

이미 `TaskDailyPlan.sortKey`가 존재하면 그 값을 Today 정렬 우선순위에 반영한다.

다만 MVP에서는 Today 전체의 자유 Drag reorder를 제공하지 않는다. due-only Task의 정렬 때문에 TodayPlan membership이 새로 생기는 것을 막기 위해서다.

---

# 7.7 Today의 직접 추가

`/today`에서 `+ 작업`을 누르면 소유 List가 명확하지 않다.

두 가지 전략이 가능하다.

### A. Inbox에 생성 + 오늘 날짜 적용

```text
Task.listId = Inbox
dueOn = today
```

### B. List Picker를 항상 먼저 연다.

### 권장

**A를 기본으로 한다.**

이유:

TickTick형 빠른 입력 경험을 살리려면 Today에서 작업을 만들 때 Project/List 선택 때문에 흐름이 멈추면 안 된다.

즉:

```text
Today
+ 작업
↓
Inbox에 생성
+ 오늘로 계획
```

한다.

사용자는 나중에 Drawer에서 List를 지정할 수 있다.

---

## 7.8 Today 생성 Task의 의미

Today에서 새 작업은:

```text
Task.listId = Inbox
TaskDailyPlan.planDate = today
```

를 권장한다.

단순히:

```text
dueOn = today
```

로만 만들면 "오늘 하려는 것"과 "오늘까지 해야 하는 것"의 의미가 섞인다.

따라서 `Today Plan`을 유지한다면:

```text
오늘 할 일
≠
오늘 마감
```

을 데이터에서 구분한다.

---

# 7.9 Today 화면 Metadata

현재 Today에서는 Date가 이미 오늘이라는 정보가 반복되므로, `오늘` 날짜 Badge를 모든 Task에 붙이지 않는다.

대신 우선 표시:

```text
시간
원래 List
Priority
Tag 일부
```

예:

```text
□ 교수님께 결과 전달            18:00
  ABM 연구 · #중요
```

날짜 자체는 Overdue나 다른 날짜 의미가 있을 때만 강조한다.

---

# 7.10 Today 완료 Task

완료 Task는 기본 Task 목록에서 즉시 제거하되, 화면 하단에 다음처럼 복구 가능 영역을 둔다.

```text
완료됨 3
▸
```

펼치면:

```text
✓ Task A
✓ Task B
✓ Task C
```

당일 완료 항목만 표시하는 것을 기본으로 한다.

---

# 7.11 Today Empty State

아무 Task도 없을 때:

```text
오늘 예정된 작업이 없습니다.

+ 작업 추가
```

과도한 축하 일러스트는 기본으로 하지 않는다.

필요하면 작은 완료 메시지 정도만 제공한다.

---

# 7.12 Upcoming — 역할

Upcoming은 향후 일정을 **날짜 흐름으로 빠르게 스캔**하는 화면이다.

Calendar처럼 월간 그리드를 보여주는 것이 목적이 아니다.

질문:

> 앞으로 며칠 동안 무엇이 예정되어 있는가?

---

## 7.13 Upcoming 범위

§6에서 정한 기본:

```text
today ~ today + 6 days
```

를 사용한다.

UI 표시 이름:

```text
다음 7일
```

URL:

```text
/upcoming
```

---

# 7.14 Upcoming Grouping

날짜별 Grouping을 기본으로 한다.

예:

```text
오늘 · 8월 18일
  □ Task A

내일 · 8월 19일
  □ Task B
  □ Task C

목요일 · 8월 20일
  □ Task D
```

날짜가 없는 Task는 Upcoming에 나타나지 않는다.

---

## 7.15 Upcoming Sort

각 날짜 그룹 안에서:

```text
1. 시간 있는 Task → 시간순
2. Priority
3. stable order
```

원래 List의 수동 순서를 Upcoming에 그대로 적용하지 않는다.

Upcoming은 날짜 중심 Query View이기 때문이다.

---

# 7.16 Upcoming + 작업

현재 Scope가 저장 Container가 아니므로 기본적으로 List가 불명확하다.

두 전략:

### 권장

Today와 동일하게 Inbox에 빠르게 생성하되 날짜를 먼저 선택하게 한다.

예:

```text
+ 작업
↓
날짜 선택
↓
Inbox에 생성
```

또는 Quick Add에서:

```text
Title
Date
List(optional)
```

을 함께 입력하게 한다.

List를 선택하지 않으면 Inbox.

---

# 7.17 Upcoming Metadata

날짜는 Group Header에 이미 있으므로 Task Row에서 날짜 Badge를 반복하지 않는다.

표시:

```text
시간
List
Priority
Tag
```

예:

```text
8월 20일

□ 교수님 미팅                  14:00
  ABM 연구 · #중요
```

---

# 7.18 Upcoming Board

기본적으로 Board View를 제공하지 않는다.

이유:

Upcoming의 핵심 의미가 날짜 순서인데 Board를 제공하면 Calendar와 역할이 겹치고, 컬럼 수가 7개 이상으로 늘어난다.

따라서:

```text
Upcoming = List only
```

를 유지한다.

---

# 7.19 Inbox — 역할

Inbox는:

> 아직 어디에 속할지 정하지 않은 Task를 빠르게 받는 곳

이다.

Inbox에서 중요한 행동은 **정리(triage)** 다.

즉 단순 저장 목록이 아니라:

```text
Capture
↓
Review
↓
Date / Someday / List 지정
```

흐름을 지원한다.

---

# 7.20 Inbox List View

기본 List View:

```text
기본함

□ 교수님 자료 확인
□ 앱 아이디어 정리
□ 다음 학기 준비
```

기본 Sort:

```text
manual sort
```

Quick Add로 입력한 순서를 유지한다.

---

# 7.21 Inbox Board View

Board는 §3/§6에서 확정한:

```text
미분류
일정
언젠가
```

를 사용한다.

```text
┌────────────┬────────────┬────────────┐
│ 미분류     │ 일정       │ 언젠가     │
│            │            │            │
│ Task       │ Task       │ Task       │
│ Task       │ Task       │            │
│            │            │            │
└────────────┴────────────┴────────────┘
```

---

## 7.22 Inbox 미분류

조건:

```text
someday = false
dueOn = null
dueAt = null
```

의미:

> 아직 실행 시점도 정하지 않은 Inbox Task

여기에서 사용자는 Task를 검토하고:

```text
날짜 지정
List 이동
언젠가로 이동
삭제
```

할 수 있다.

---

# 7.23 Inbox 일정

날짜가 있는 Inbox Task.

```text
dueOn != null
OR dueAt != null
```

List는 여전히 Inbox다.

즉:

> 날짜는 정했지만 Project/List 분류는 아직 하지 않은 Task

도 허용한다.

이것이 TickTick형 빠른 입력과 잘 맞는다.

---

# 7.24 Inbox 언젠가

```text
someday = true
```

Task.

의미:

> 지금 실행할 계획은 없지만 보존할 아이디어/작업

특정 날짜를 동시에 갖지 않는다.

---

# 7.25 Inbox 정리 Workflow

Task Card/Row Hover 시 빠른 Action:

```text
날짜
List 이동
Tag
...
```

을 우선 제공한다.

Inbox Detail Drawer에서 List를 지정하면 해당 Task는 Inbox에서 즉시 사라진다.

```text
Inbox
→ ABM 연구 List
```

이동 후 Undo Toast.

---

# 7.26 Inbox의 완료

Inbox Task도 바로 완료할 수 있다.

작업을 정리하기 전에 끝낸 경우:

```text
Inbox에서 완료
```

를 허용한다.

완료 후 Completed에서는 원래 List가 Inbox였음을 필요 시 표시할 수 있다.

---

# 7.27 Inbox Empty State

```text
기본함이 비어 있습니다.

떠오르는 작업을 바로 추가해보세요.
+ 작업
```

Inbox의 Empty State에서는 Quick Capture 성격을 강조한다.

---

# 7.28 List — 역할

List는 Task의 실제 저장 Container이므로 가장 기본적인 작업 관리 화면이다.

질문:

> 이 List 안에서 어떤 작업들이 있고 어떻게 정리되어 있는가?

---

# 7.29 List 기본 Header

```text
ABM 연구                         + 작업   ...
작업 7개 · 완료 3개
```

Project 연결 List인 경우에도 Project/Space 정보를 Header 전면에 반복하지 않는다.

필요하면 Breadcrumb이나 Detail Drawer에서만 보조 표시한다.

---

# 7.30 List 기본 Grouping

List에 Section이 있으면 Section 기준.

예:

```text
준비
  □ Task

진행
  □ Task

검토
  □ Task
```

Section이 하나도 없으면:

```text
Task
Task
Task
```

평면 List.

---

# 7.31 List Section Empty State

Section이 비어 있을 때:

```text
+ 작업
```

만 간단히 표시한다.

큰 빈 상태 Card는 사용하지 않는다.

---

# 7.32 List 기본 Sort

기본:

```text
manual
```

즉 `Task.sortKey`.

사용자가 날짜/우선순위 정렬을 선택하면 derived sort가 된다.

Derived sort 상태에서는 Drag reorder를 막는다.

---

# 7.33 List + 작업

현재 List가 owner이므로 즉시 생성한다.

Section 안의 `+ 작업`이면:

```text
listId = currentList
sectionId = currentSection
```

으로 생성한다.

Header의 `+ 작업`은:

```text
listId = currentList
sectionId = null
```

또는 사용자가 마지막으로 사용한 Section을 자동 선택하지 않는 것을 기본으로 한다.

---

# 7.34 List Board

List Board는 Section을 Column으로 표현한다.

예:

```text
준비 | 진행 | 검토
```

Task Drag:

```text
sectionId 변경
```

으로 처리한다.

Section 없는 Task는 첫 번째:

```text
미분류
```

Column으로 보여줄 수 있다.

---

# 7.35 List Board의 완료 Task

완료된 Task는 기본 숨김.

필요 시:

```text
완료된 작업 표시
```

로 각 Section 안 또는 별도 완료 영역에 표시한다.

완료 자체를 Board Column으로 만들지 않는다.

왜냐하면 `Section`과 `Completion`은 다른 축이기 때문이다.

---

# 7.36 List Metadata

현재 List를 이미 알고 있으므로 Task Row/Card에서 List 이름은 숨긴다.

우선 표시:

```text
Due date
Priority
Tag
Subtask progress
```

불필요한 중복을 줄인다.

---

# 7.37 List Empty State

```text
아직 작업이 없습니다.
+ 첫 작업 추가
```

Project-linked List여도 과도한 프로젝트 설명은 넣지 않는다.

---

# 7.38 Folder — 역할

Tasks Sidebar의 Folder는 List를 묶는 Presentation Group이다.

Folder View는:

> 이 Folder 아래 여러 List의 Task를 한 번에 보고 싶다

는 요구를 해결한다.

---

# 7.39 Folder 기본 Grouping

하위 List별로 그룹한다.

예:

```text
학교

ABM 연구                     7
  □ Task
  □ Task

수업                          4
  □ Task

영어 공부                     5
  □ Task
```

List 순서는 Sidebar의 `sidebarSortKey`를 따른다.

각 List 안 Task는 해당 List의 기본/manual order를 따른다.

---

# 7.40 Folder + 작업

Folder는 owner가 아니므로 Header `+ 작업` 클릭 시 List Picker를 연다.

```text
어느 리스트에 추가할까요?

ABM 연구
수업
영어 공부
```

현재 Folder 하위 List만 우선 표시한다.

Search 또는 "다른 List 선택"을 통해 외부 List도 고를 수 있게 할지는 후순위.

### 권장 MVP

현재 Folder 하위 List만 선택 가능.

---

# 7.41 Folder Board

MVP에서는 Folder Board를 제공하지 않는다.

```text
Folder = List only
```

하위 List를 Column으로 두면 Task Drag가 곧 `listId` 변경이 되고 Project/Space membership까지 달라질 수 있으므로, 단순 View 전환으로 취급하지 않는다.

Folder Board는 P1 이후 별도 이동 semantics와 validation을 설계한 뒤에만 고려한다.

---

# 7.42 Folder Metadata

Task Row에 반드시 원래 List 이름을 보여줄 필요는 없다.

그룹 Header가 이미 List를 보여주기 때문이다.

표시:

```text
Due date
Priority
Tag
```

만으로 충분하다.

---

# 7.43 Folder Empty State

하위 List 자체가 없음:

```text
이 폴더에 리스트가 없습니다.
+ 새 리스트
```

List는 있지만 Task 없음:

```text
이 폴더의 리스트에 아직 작업이 없습니다.
```

두 상태를 구분한다.

---

# 7.44 Tag — 역할

Tag View는 소속 위치와 관계없이 같은 의미를 가진 Task를 모아본다.

예:

```text
#중요
#읽기
#기다리는중
```

---

# 7.45 Tag 기본 View

기본:

```text
List
```

Grouping 없음.

Sort:

```text
Due date
→ Priority
→ stable order
```

을 권장한다.

Tag는 위치가 아닌 분류이므로 원래 List 정보가 중요하다.

---

# 7.46 Tag Metadata

예:

```text
#중요

□ 교수님께 결과 전달          오늘
  ABM 연구

□ CV 수정                    내일
  개인
```

즉 Task Row에:

```text
List
Due date
```

를 우선 표시.

현재 Tag는 이미 Header에 있으므로 같은 Tag badge는 숨긴다.

---

# 7.47 Tag + 작업

`+ 작업`:

```text
Quick Add
↓
List 선택 optional
↓
기본 선택 없으면 Inbox
↓
현재 Tag 자동 적용
```

TickTick형 빠른 흐름을 위해 **List를 선택하지 않으면 Inbox**로 생성하는 것을 권장한다.

즉 Tag에서도 반드시 Picker를 강제할 필요는 없다.

```text
Task.listId = Inbox
TaskTag += currentTag
```

---

# 7.48 Tag Board

MVP에서는 Tag에 Board View를 제공하지 않는다.

이유:

Board Column의 의미가 자연스럽지 않다.

Section은 List마다 다르고, List를 Column으로 쓰면 Folder View와 중복된다.

따라서:

```text
Tag = List only
```

를 기본으로 한다.

향후 사용자 Grouping이 필요하면 Board가 아니라 Grouped List로 해결한다.

---

# 7.49 Tag Empty State

```text
이 태그가 붙은 작업이 없습니다.

+ 작업 추가
```

새 작업은 Inbox + 현재 Tag로 생성.

---

# 7.50 Filter — 역할

Saved Filter는 사용자가 정의한 조건을 만족하는 Task Query다.

예:

```text
중요한 오늘
학교 + 이번 주
마감 없음
```

---

# 7.51 Filter Header

Header:

```text
중요한 오늘                      + 작업   ...
#중요 · 오늘 · 미완료
```

조건 요약은 최대 1줄.

조건이 복잡하면:

```text
조건 4개
```

처럼 축약하고 `필터 편집`에서 전체 조건을 본다.

---

# 7.52 Filter 기본 Sort

Filter definition에 Sort가 포함되어 있다면 그것을 따른다.

없으면:

```text
Due date
→ Priority
→ stable order
```

기본.

---

# 7.53 Filter + 작업

Filter는 조건에 따라 생성 규칙이 달라진다.

### Auto-apply 가능한 조건

예:

```text
tag = 중요
due = today
priority = high
```

은 새 Task에 적용 가능.

### Owner List가 조건에 포함

```text
list = ABM 연구
```

이면 바로 해당 List에 생성.

### List 조건 없음

기본:

```text
Inbox
```

에 생성.

초기 owner 선택 중심 설계보다 TickTick형 빠른 입력을 위해 canonical Inbox fallback으로 단순화한다.

### 최종 권장

```text
owner가 하나로 정해짐 → 해당 List
owner 불명확 → Inbox
생성 가능한 Filter 조건 → 자동 적용
```

사용자 몰래 임의 Regular List를 고르지만 않으면 된다.

---

# 7.54 Filter에서 자동 적용하면 안 되는 조건

다음은 새 Task에 직접 적용하기 애매하다.

```text
createdBefore
contains text
completed = true
not tag X
not list Y
```

이 조건은 생성 시 자동 적용하지 않는다.

새 Task가 Filter 결과에 바로 나타나지 않을 수도 있다.

필요하면 Quick Add 아래에:

```text
이 작업은 현재 필터 조건을 모두 만족하지 않을 수 있습니다.
```

같은 보조 안내를 넣을 수 있으나 기본 UI에서는 과도한 경고를 피한다.

---

# 7.55 Filter Board

MVP에서는 Filter에 Board를 제공하지 않는다.

Filter 결과는 여러 List/Section을 횡단할 수 있고 Column 정의가 불명확하기 때문이다.

따라서:

```text
Filter = List only
```

MVP 기본.

향후 Grouping을 제공해도 `Grouped List`로 시작한다.

---

# 7.56 Filter Empty State

```text
조건에 맞는 작업이 없습니다.
```

`+ 작업`은 Filter 조건을 생성 가능한 만큼 적용한다.

---

# 7.57 Completed — 역할

Completed는 완료된 Task를 찾아보고, 필요하면 다시 열거나 원래 작업을 복원하는 시스템 View다.

---

# 7.58 Completed 기본 Grouping

완료 날짜별:

```text
오늘
  ✓ Task A
  ✓ Task B

어제
  ✓ Task C

8월 16일
  ✓ Task D
```

최근 완료순.

---

# 7.59 Completed Metadata

Task의 원래 List를 표시한다.

예:

```text
✓ 교수님께 결과 전달
  ABM 연구 · 오늘 18:20 완료
```

완료 시점이 중요한 정보다.

---

# 7.60 Completed Action

허용:

```text
다시 열기
Task Detail 보기
삭제 → Trash
```

`+ 작업`은 제공하지 않는다.

완료 Task를 다시 열면:

```text
completedAt = null
```

되고 원래 List/Scope로 복귀한다.

---

# 7.61 Completed Board

지원하지 않는다.

```text
Completed = List only
```

완료 날짜별 List가 가장 자연스럽다.

---

# 7.62 Completed Empty State

```text
완료된 작업이 없습니다.
```

별도 생성 CTA 없음.

---

# 7.63 Trash — 역할

Trash는 삭제된 Task를 복원하거나 영구 삭제하는 시스템 관리 View다.

일반 Task management 기능을 제공하지 않는다.

---

# 7.64 Trash Grouping

삭제 날짜별:

```text
오늘 삭제
  Task A

어제 삭제
  Task B
```

최근 삭제순.

---

# 7.65 Trash Row Action

기본 Action:

```text
복원
영구 삭제
```

Task Detail을 열 경우 편집은 read-only에 가깝게 제한한다.

복원 전에는:

```text
List 이동
Tag 편집
Date 편집
```

등 일반 수정을 하지 않는 것을 권장한다.

---

# 7.66 Trash 복원

복원 시:

```text
deletedAt = null
```

원래 List가 존재하면 원래 위치로 돌아간다.

---

## 7.67 원래 List가 삭제된 Trash Task 복원

이 경우 Task를 고아로 만들 수 없다.

권장:

```text
원래 List가 없습니다.
복원 위치를 선택하세요.

기본함
다른 List
```

기본 선택은 Inbox.

---

# 7.68 Trash 영구 삭제

영구 삭제는 confirmation을 요구한다.

```text
이 작업을 영구 삭제하시겠습니까?
이 작업은 복구할 수 없습니다.
```

일상 Delete와 다르게 destructive confirmation을 사용한다.

---

# 7.69 Trash Empty State

```text
휴지통이 비어 있습니다.
```

추가 Action 없음.

---

# 7.70 Scope별 Main Header 규칙

## Today

```text
오늘
8월 18일 화요일 · 미완료 5개
```

날짜는 유용하므로 보조 Header에 표시할 수 있다.

## Upcoming

```text
다음 7일
8월 18일 – 8월 24일
```

## Inbox

```text
기본함
미분류 3 · 일정 2 · 언젠가 4
```

Board일 때 특히 유용.

## List

```text
ABM 연구
미완료 7 · 완료 3
```

## Folder

```text
학교
3개 리스트 · 미완료 16
```

## Tag

```text
#중요
미완료 7
```

## Filter

```text
중요한 오늘
미완료 5
```

## Completed

```text
완료
총 124개
```

전체 Count를 항상 계산하는 비용이 크면 생략 가능.

## Trash

```text
휴지통
삭제된 작업 3개
```

---

# 7.71 Scope별 View Registry 최종 조정

§5의 View Registry를 UX 기준으로 다시 좁힌다.

### MVP 확정

```text
today:
  list

upcoming:
  list

inbox:
  list
  board

folder:
  list

list:
  list
  board

tag:
  list

filter:
  list

completed:
  list

trash:
  list
```

즉 Board는 **Inbox와 실제 List**에만 우선 제공한다.

이것이 TickTick형 단순성에 더 맞다.

---

# 7.72 왜 Board를 모든 Scope에 제공하지 않는가

Board는 단순 "다른 보기"가 아니다.

Board에는 Column 의미가 필요하다.

자연스러운 Column이 있는 Scope:

```text
Inbox
→ 미분류 / 일정 / 언젠가

List
→ Section
```

자연스럽지 않은 Scope:

```text
Today
Tag
Filter
Completed
Trash
```

에 억지로 Board를 넣으면 사용자는 Column의 의미를 이해해야 한다.

따라서 View 수보다 의미 명확성을 우선한다.

---

# 7.73 Scope별 생성 규칙 최종 정리

| Scope | 생성 위치 | 추가 자동 속성 |
|---|---|---|
| Today | Inbox | today plan |
| Upcoming | Inbox | 사용자가 고른 날짜 |
| Inbox | Inbox | 없음 |
| Inbox 미분류 | Inbox | due 없음, someday=false |
| Inbox 일정 | Inbox | 날짜 필요 |
| Inbox 언젠가 | Inbox | someday=true |
| List | 현재 List | Section이면 sectionId |
| Folder | 하위 List 선택 | 없음 |
| Tag | Inbox 기본 | 현재 Tag |
| Filter | 단일 List이면 해당 List, 아니면 Inbox | 적용 가능한 Filter 조건 |
| Completed | 생성 불가 | - |
| Trash | 생성 불가 | - |

이 규칙은 UI와 Domain Command 모두 동일하게 사용한다.

---

# 7.74 Scope별 Metadata 규칙

### Today

```text
시간
List
Priority
Tag
```

### Upcoming

```text
시간
List
Priority
Tag
```

날짜는 Group Header에서 처리.

### Inbox

```text
Date
Priority
Tag
```

List는 Inbox이므로 생략.

### List

```text
Date
Priority
Tag
Subtask progress
```

List 이름 생략.

### Folder

```text
Date
Priority
Tag
```

List는 Group Header에서 처리.

### Tag

```text
Date
List
Priority
```

현재 Tag 생략.

### Filter

Filter 내용에 따라 동적.

기본:

```text
Date
List
Priority
Tag 일부
```

### Completed

```text
List
완료 시간/날짜
```

### Trash

```text
원래 List
삭제 날짜
```

---

# 7.75 Scope별 Empty State 원칙

Empty State는 현재 Scope의 의미를 짧게 설명해야 한다.

금지:

```text
데이터가 없습니다.
```

처럼 맥락 없는 문장.

권장:

```text
Today
→ 오늘 예정된 작업이 없습니다.

Inbox
→ 기본함이 비어 있습니다.

Tag
→ 이 태그가 붙은 작업이 없습니다.

Filter
→ 조건에 맞는 작업이 없습니다.
```

CTA는 생성이 가능한 Scope에만 제공한다.

---

# 7.76 Scope별 Task Click

모든 활성 Task View에서 Task 클릭은 동일하게 Drawer open.

```text
Today
Upcoming
Inbox
List
Folder
Tag
Filter
Completed
```

Trash는 Drawer를 열더라도 제한된 상태로 표시한다.

Page 전환은 사용하지 않는다.

---

# 7.77 Scope 밖으로 나가는 변경

각 Scope에서 Task의 속성을 바꿔 현재 Query를 더 이상 만족하지 않으면 §4 공통 규칙을 따른다.

예:

### Today

```text
오늘 계획 제거
+ due date도 오늘 아님
→ Today에서 제거
```

### Tag

```text
현재 Tag 제거
→ Tag View에서 제거
```

### Filter

```text
Filter 조건 불충족
→ Filter View에서 제거
```

### Inbox

```text
List를 ABM 연구로 이동
→ Inbox에서 제거
```

공통:

```text
optimistic remove
+ Undo
```

---

# 7.78 Today와 Due Date의 충돌 방지

Today 화면에 Task가 있다는 사실만으로 due date가 today라는 뜻은 아니다.

예:

```text
Task due date = 금요일
하지만 오늘 계획함
```

Today에서는 표시 가능하다.

이 Task의 Date metadata는:

```text
금요일
```

을 보여줘야 한다.

즉 Today에서 날짜가 오늘이 아닌 경우에는 날짜를 숨기지 않는다.

규칙:

```text
due date == today → 날짜 badge 생략 가능
due date != today → 실제 날짜 표시
```

---

# 7.79 Today에 Future Task 계획

사용자가 금요일 마감 Task를 화요일 Today에 끌어왔다고 가정한다.

데이터:

```text
dueOn = Friday
TaskDailyPlan.planDate = Tuesday
```

Today에 나타나며:

```text
금요일 마감
```

metadata를 보여준다.

마감일을 오늘로 바꾸지 않는다.

---

# 7.80 Upcoming과 Today Plan

Upcoming은 due date 기반 View로 유지한다.

오늘 계획했다고 해서 미래 due date가 없는 Task를 Upcoming에 넣지 않는다.

즉:

```text
Today = 실행 계획 + due today
Upcoming = due date horizon
```

역할을 분리한다.

---

# 7.81 Inbox와 Today 동시 membership

Inbox에 있으면서 Today Plan을 가진 Task는:

```text
Inbox
Today
```

양쪽에 동시에 보일 수 있다.

이는 복제가 아니라 같은 Task의 Query membership이다.

Inbox에서 List 이동해도 Today Plan이 유지된다면 Today에서는 계속 보인다.

---

# 7.82 Tag와 List 동시 membership

Task는:

```text
ABM 연구 List
#중요
Today
```

에 동시에 나타날 수 있다.

모두 같은 Task entity다.

이 설계 때문에 동일 Task의 title/completion/date는 어떤 화면에서 수정해도 즉시 일치해야 한다.

---

# 7.83 Scope별 Count 정의

Sidebar Count와 Header Count는 동일한 query semantics를 사용한다.

### Today

```text
현재 Today query의 미완료 Task 수
```

### Upcoming

```text
다음 7일 미완료 Task 수
```

### Inbox

```text
Inbox 미완료 Task 수
```

### List

```text
해당 List 미완료 Task 수
```

### Folder

```text
하위 List 전체 미완료 Task 합
```

### Tag

```text
현재 Tag 미완료 Task 수
```

### Filter

```text
현재 Filter 결과 미완료 Task 수
```

Completed/Trash는 필요 시 전체 row count.

---

# 7.84 Main Header Count와 Sidebar Count

같은 Scope의 경우 반드시 일치한다.

예:

```text
Sidebar:
ABM 연구 7
```

Main:

```text
ABM 연구
미완료 7
```

이어야 한다.

동일 Scope인데 하나는 7, 하나는 9가 되는 것을 금지한다.

---

# 7.85 Default Sort 저장

사용자가 Scope별 Sort를 바꿀 수 있다면 preference key는 resource identity 단위로 저장한다.

예:

```text
list:lst_abm:view=list
→ sort=due
```

System Scope:

```text
today:view=list
→ sort=manual
```

URL에는 기본적으로 넣지 않는다.

---

# 7.86 Default View 저장

Inbox/List는 사용자가 마지막 사용 View를 기억할 수 있다.

예:

```text
inbox → board
list:A → board
list:B → list
```

단, URL이 명시적으로 View를 지정하면 URL이 우선한다.

우선순위:

```text
URL view
>
saved preference
>
scope default
```

§5의 새로고침 원칙을 보완한다.

---

# 7.87 `/inbox` canonical 기본 View 문제

§5에서는 기본 View `list`를 URL에서 생략했다.

만약 사용자의 Inbox 기본 preference가 Board라면 `/inbox`만으로는 공유 시 결과가 달라질 수 있다.

따라서 canonical navigation에서는:

```text
공유/직접 URL에 view가 없음
→ scope의 system default인 list
```

를 사용한다.

Saved preference는 **앱 내부 일반 재진입**에서만 활용할 수 있다.

사용자가 직접 `/inbox`를 열거나 새로고침한 경우 system default를 적용하는 것이 가장 예측 가능하다.

---

# 7.88 Scope별 More Menu

### Today

```text
정렬
완료된 작업 표시
```

### Upcoming

```text
정렬
```

### Inbox

```text
정렬
완료된 작업 표시
기본함 비우기? → 제공하지 않는 것을 권장
```

### List

```text
이름 변경
색상 변경
Section 관리
정렬
완료 작업 표시
프로젝트 연결
삭제
```

### Folder

```text
이름 변경
새 List
삭제
```

### Tag

```text
이름 변경
색상 변경
삭제
```

### Filter

```text
필터 편집
이름 변경
삭제
```

### Completed

```text
정렬
```

### Trash

```text
휴지통 비우기
```

`휴지통 비우기`는 destructive confirmation 필수.

---

# 7.89 Scope별 Drag & Drop

### Today

MVP에서는 자유 reorder Drag를 제공하지 않는다.

이미 존재하는 `TaskDailyPlan.sortKey`는 정렬에 반영하지만, Drag를 통해 새 TodayPlan membership을 만들지 않는다.

### Upcoming

기본 날짜 순이므로 reorder Drag 금지.

날짜 그룹 간 Drag로 due date 변경 기능은 P2 이후.

### Inbox List

manual reorder 가능.

### Inbox Board

Column Drag 가능.

### List

manual sort일 때 reorder 가능.

### List Board

Section Drag 가능.

### Folder

List 그룹 간 Task Drag로 List 이동은 P1 이후.

### Tag / Filter

기본 derived sort이므로 reorder 금지.

### Completed / Trash

Drag 금지.

---

# 7.90 Scope별 Keyboard Quick Add

빠른 새 작업 shortcut이 실행되면 현재 Scope 의미를 따른다.

예:

```text
Ctrl/Cmd + N
```

### Today

Inbox + Today Plan

### Inbox

Inbox

### List

현재 List

### Tag

Inbox + current Tag

### Folder

List Picker

### Completed / Trash

전역 Quick Add를 사용한다면 Inbox 생성으로 fallback할 수 있지만,
Scope Header 내 `+ 작업`은 숨긴다.

---

# 7.91 Scope별 URL 예시

```text
/today

/upcoming

/inbox
/inbox?view=board

/list/lst_abm
/list/lst_abm?view=board

/folder/fld_school

/tag/tag_important

/filter/flt_today_important

/completed

/trash
```

§7에서 Board를 Inbox/List로 좁혔으므로 View Registry도 이에 맞춰 수정한다.

---

# 7.92 Main View별 Acceptance Criteria

## Today

- **V1.** Overdue, 오늘 마감 Task, Today Plan Task를 모두 canonical Today active 결과에 보여준다.
- **V2.** Future due Task를 오늘 계획해도 due date는 유지한다.
- **V3.** Today에서 새 Task는 Inbox에 생성되고 Today Plan에 추가된다.
- **V4.** 기존 TodayPlan sortKey는 List 순서와 분리해 정렬에 반영하되, MVP 자유 Drag reorder는 제공하지 않는다.

## Upcoming

- **V5.** 향후 7일 due Task만 날짜별로 그룹한다.
- **V6.** Today Plan만 있는 Task는 Upcoming에 나타나지 않는다.
- **V7.** Board를 제공하지 않는다.

## Inbox

- **V8.** Inbox는 List와 Board를 지원한다.
- **V9.** Board Column은 미분류/일정/언젠가다.
- **V10.** List 이동 시 Inbox 결과에서 즉시 제거된다.

## List

- **V11.** Section이 있으면 List/Board 모두 같은 Section semantics를 사용한다.
- **V12.** List Header + 작업은 현재 List에 생성한다.
- **V13.** List View에서는 List 이름 metadata를 반복하지 않는다.

## Folder

- **V14.** Folder는 하위 List 기준으로 Task를 그룹한다.
- **V15.** Folder 생성은 하위 List 선택이 필요하다.
- **V16.** Folder Board는 MVP에서 제공하지 않는다.

## Tag

- **V17.** Tag View에서는 원래 List를 보여준다.
- **V18.** 새 Task는 기본 Inbox + 현재 Tag로 생성한다.
- **V19.** Tag Board는 MVP에서 제공하지 않는다.

## Filter

- **V20.** Filter의 생성 가능한 조건만 새 Task에 자동 적용한다.
- **V21.** owner List가 불명확하면 Inbox를 사용한다.
- **V22.** Filter Board는 MVP에서 제공하지 않는다.

## Completed

- **V23.** 완료 날짜별 최근순으로 보여준다.
- **V24.** Task를 다시 미완료로 복원할 수 있다.
- **V25.** `+ 작업`을 제공하지 않는다.

## Trash

- **V26.** 복원과 영구 삭제만 핵심 Action으로 제공한다.
- **V27.** 원래 List가 없으면 복원 위치를 선택하게 한다.
- **V28.** `+ 작업`을 제공하지 않는다.

---

# 7.93 §7 확정 결정

- **V29.** Today는 실행 중심 View로 유지하며 `Overdue + 오늘 마감 + Today Plan`을 함께 보여준다.
- **V30.** Overdue는 canonical Today membership에 포함하고 Today 상단의 `기한 지남` 그룹으로 표시한다.
- **V31.** Today에서 새 Task는 Inbox에 생성하고 Today Plan을 적용한다.
- **V32.** Upcoming은 due date 기반 7일 Query이며 날짜별 Grouping을 사용한다.
- **V33.** Inbox는 Capture/Triage 영역으로 정의하고 List와 Board를 모두 지원한다.
- **V34.** Inbox Board는 `미분류 / 일정 / 언젠가`의 virtual column을 사용한다.
- **V35.** 일반 List는 Section 기반 List/Board를 지원한다.
- **V36.** Folder는 기본적으로 하위 List별 Grouped List로 표시한다.
- **V37.** Tag와 Filter는 기본적으로 List View만 제공한다.
- **V38.** Board는 의미가 자연스러운 `Inbox`와 `List`에만 MVP에서 제공한다.
- **V39.** Tag/Filter에서 새 Task owner가 불명확하면 Inbox를 기본 owner로 사용한다.
- **V40.** Filter에서는 적용 가능한 positive condition만 새 Task에 자동 적용한다.
- **V41.** Completed는 완료 날짜별, Trash는 삭제 날짜별로 그룹한다.
- **V42.** Completed/Trash에서는 새 Task 생성 Action을 제공하지 않는다.
- **V43.** 각 Scope에서 이미 명확한 metadata는 Task Row/Card에서 반복 표시하지 않는다.
- **V44.** Scope별 Header Count와 Sidebar Count는 동일 query semantics를 사용한다.
- **V45.** Scope membership을 벗어나는 mutation은 optimistic remove + Undo를 사용한다.
- **V46.** View/Sort/Grouping의 기본값은 Scope 의미를 우선하고, 모든 화면을 동일하게 만들지 않는다.

---

---

# 8. Quick Add / 전역 작업 추가 / 키보드 중심 생성 UX

## 8.1 목적

§8의 목적은 TickTick처럼 사용자가 **생각난 작업을 최대한 빠르게 입력하고, 필요할 때만 추가 속성을 지정**할 수 있도록 작업 생성 UX를 통일하는 것이다.

작업 생성은 앱 전체에서 매우 자주 발생하므로 다음 세 가지를 최우선으로 한다.

```text
1. 입력까지의 클릭 수를 최소화한다.
2. 생성 위치가 예측 가능해야 한다.
3. 빠른 입력과 정교한 입력을 같은 흐름 안에서 연결한다.
```

핵심 원칙:

> 빠른 추가는 “모든 필드를 입력하는 폼”이 아니라 “제목을 먼저 받고, 나머지는 필요할 때 붙이는 흐름”이어야 한다.

---

# 8.2 Quick Add의 종류

작업 생성 UI는 세 종류로 나눈다.

```text
A. Context Quick Add
B. Global Quick Add
C. Column / Section Inline Add
```

각 UI는 모양은 유사하지만 owner 결정 방식이 다르다.

---

## 8.3 Context Quick Add

현재 Main Scope 안에서 `+ 작업`을 눌렀을 때 열린다.

예:

```text
List
+ 작업
```

또는:

```text
Today
+ 작업
```

현재 Scope가 작업 생성 Context가 된다.

---

## 8.4 Global Quick Add

앱 어디서나 키보드 Shortcut 또는 Rail/Global button으로 호출한다.

예:

```text
Ctrl/Cmd + N
```

또는:

```text
Global +
```

Global Quick Add는 특정 List Scope에 묶이지 않는다.

따라서 기본 owner rule이 필요하다.

### 권장

```text
owner = Inbox
```

로 한다.

사용자가 필요하면 Quick Add 안에서 List를 바꿀 수 있다.

---

## 8.5 Column / Section Inline Add

Board Column 또는 List Section 안의 `+ 작업`을 누르면 해당 Context를 자동 적용한다.

예:

```text
List: ABM 연구
Section: 검토

+ 작업
```

→

```text
listId = ABM 연구
sectionId = 검토
```

Inbox Board:

```text
언젠가 + 작업
```

→

```text
listId = Inbox
someday = true
```

---

# 8.6 Quick Add 기본 UI

권장 기본 형태:

```text
┌───────────────────────────────────────────────┐
│ 작업을 입력하세요...                          │
│                                               │
│ 📅 날짜   🚩 우선순위   🏷 태그   📁 리스트    │
└───────────────────────────────────────────────┘
```

처음 focus 시 제목 입력창이 가장 먼저 활성화된다.

초기에는 한 줄 입력을 우선하고, 보조 속성은 작은 Action row로 제공한다.

---

## 8.7 Quick Add의 첫 입력 필드

첫 입력 focus는 항상:

```text
Task title
```

이다.

사용자가 Quick Add를 열자마자 바로 타이핑할 수 있어야 한다.

마우스로 input을 한 번 더 클릭하게 하지 않는다.

---

# 8.8 Context별 기본 Owner

§7의 생성 규칙을 Quick Add에서 하나로 통합한다.

| Context | 기본 Owner |
|---|---|
| Global Quick Add | Inbox |
| Today | Inbox |
| Upcoming | Inbox |
| Inbox | Inbox |
| List | 현재 List |
| List Section | 현재 List |
| Inbox Board Column | Inbox |
| Folder | owner 미확정 → List 선택 |
| Tag | Inbox |
| Filter | 단일 List 조건이면 해당 List, 아니면 Inbox |
| Completed | Context add 없음 |
| Trash | Context add 없음 |

---

# 8.9 Context별 자동 속성

### Today

```text
TaskDailyPlan.planDate = today
```

기본적으로 due date를 today로 강제하지 않는다.

### Upcoming

사용자가 날짜를 지정한 뒤 생성.

### Tag

```text
currentTag 자동 적용
```

### Filter

적용 가능한 positive condition만 자동 적용.

### List Section

```text
sectionId = currentSection
```

### Inbox 일정 Column

날짜 필수.

### Inbox 언젠가 Column

```text
someday = true
```

---

# 8.10 Folder Quick Add

Folder는 Task owner가 아니므로 단순 Inbox fallback으로 만들지 않는다.

Folder Header `+ 작업`을 누르면:

```text
Quick Add
+ List 선택이 필수
```

권장 UI:

```text
작업 제목 입력...

추가 위치:
○ ABM 연구
○ 수업
○ 영어 공부
```

또는 먼저 제목을 입력하고 저장 직전에 List를 고르게 할 수 있다.

### 권장

List Picker를 Quick Add 하단에 inline으로 표시하고, 기본 선택은 하지 않는다.

---

# 8.11 Quick Add 저장 조건

최소 저장 조건:

```text
title != empty
AND targetListId 확정
```

그 외 속성은 선택사항.

즉 사용자는 제목만 입력하고 Enter로 끝낼 수 있어야 한다.

---

# 8.12 Enter / Shift+Enter / Esc

### Enter

```text
현재 Task 생성
```

생성 후 Quick Add는 Context에 따라 유지 또는 종료한다.

### Shift+Enter

권장:

```text
Task 생성
→ Detail Drawer 열기
```

즉 빠르게 만든 뒤 바로 상세 편집.

### Esc

```text
Quick Add 닫기
```

입력 내용이 있으면 draft 보존 여부를 따로 정한다.

---

# 8.13 연속 입력

TickTick형 사용성을 위해 Inbox/List에서 여러 Task를 연속으로 빠르게 입력할 수 있어야 한다.

권장:

```text
Enter
→ Task 생성
→ input 유지
→ 다음 Task 바로 입력 가능
```

특히:

```text
Inbox
List
Section
Board Column
```

에서는 연속 입력을 기본으로 한다.

---

## 8.14 Global Quick Add 종료

Global Quick Add는 별도 overlay/popover 성격이므로:

```text
Enter
→ 생성
→ 닫기
```

를 기본으로 한다.

연속 입력을 원하면:

```text
Ctrl/Cmd + Enter
```

또는 설정으로 확장할 수 있다.

MVP에서는 단순 종료가 더 낫다.

---

# 8.15 Quick Add의 저장 Feedback

작업 생성 후 큰 성공 Modal을 띄우지 않는다.

Inline Context에서는 즉시 Task Row/Card가 나타나고 별도 Toast 없이 끝내도 된다.

Global Quick Add에서는 짧은 Toast:

```text
작업을 기본함에 추가했습니다.
```

정도 제공 가능.

---

# 8.16 생성 직후 Task 위치

새 Task는 현재 Context에서 사용자가 예상하는 위치에 나타나야 한다.

예:

### List manual sort

```text
현재 Section 하단 또는 Quick Add 위치
```

### Inbox

```text
현재 List 하단
```

### Today

```text
Today Plan의 기본 끝 위치
```

### Board Column

```text
해당 Column 하단
```

생성 후 화면이 다른 위치로 jump하지 않게 한다.

---

# 8.17 Quick Add 내 List Picker

List Picker는 §4의 Detail Drawer Picker를 재사용한다.

구성:

```text
기본함
────────────
Folder
  List
  List

Folder
  List
```

Folder 자체는 선택 불가.

최근 사용 List를 상단에 보여줄 수 있다.

---

## 8.18 최근 List

Global Quick Add에서는 Inbox만 기본으로 하되 자주 쓰는 List를 빠르게 선택할 수 있도록:

```text
최근
- ABM 연구
- Todo App
```

을 Picker 상단에 둘 수 있다.

단, 최근 List를 자동 owner로 사용하지 않는다.

기본 owner는 항상 Inbox다.

---

# 8.19 Date Quick Action

Quick Add에서 Date는 가장 자주 쓰는 속성이므로 빠른 Preset을 제공한다.

예:

```text
오늘
내일
이번 주말
다음 주
날짜 선택
```

선택 즉시 적용.

---

# 8.20 Today Context의 Date

Today에서 새 Task의 기본 의미는:

```text
오늘 계획
```

이지:

```text
오늘 마감
```

이 아니다.

따라서 Quick Add에서 별도로 날짜를 고르지 않으면:

```text
due date 없음
today plan 적용
```

으로 한다.

사용자가 Date = 오늘을 직접 선택하면 그때 due date도 today가 된다.

---

# 8.21 Upcoming Context의 Date

Upcoming에서는 날짜가 핵심이므로 Date가 없는 상태로 저장하지 않는 것을 권장한다.

Flow:

```text
Upcoming + 작업
↓
Title 입력
↓
Date 선택
↓
Save
```

기본 날짜는 현재 화면에서 선택한 date group이 있으면 그 날짜.

Header에서 생성하면 date picker를 먼저 요구한다.

---

# 8.22 Priority Quick Action

Preset:

```text
없음
낮음
중간
높음
```

Picker를 열고 한 번 클릭으로 적용.

Priority는 생성 완료를 막는 필수 속성이 아니다.

---

# 8.23 Tag Quick Action

Tag Picker는 검색 + 다중 선택.

현재 Tag View에서 Quick Add를 열면 current Tag가 이미 선택된 상태로 시작한다.

사용자는 추가 Tag를 더 붙일 수 있다.

---

# 8.24 자연어 날짜 입력

예:

```text
"교수님 메일 내일"
"보고서 금요일 오후 3시"
```

처럼 제목 입력에서 날짜를 자연어로 파싱할 수 있다.

### 장점

- TickTick과 유사한 빠른 입력
- 키보드 사용성이 크게 좋아짐

### 위험

- 한국어 날짜 표현 파싱 정확성
- 제목 일부를 잘못 날짜로 인식
- 구현 복잡도 증가

### 권장

**MVP에서는 자연어 날짜 파싱을 필수로 하지 않는다.**

P1 이후 기능으로 둔다.

---

# 8.25 자연어 파싱 도입 시 원칙

도입한다면 자동 적용 전에 인식 결과를 눈에 보이게 한다.

예:

```text
교수님 메일 내일

[내일]
```

사용자가 쉽게 취소할 수 있어야 한다.

조용히 제목 일부를 삭제하고 날짜로 바꾸지 않는다.

---

# 8.26 자연어 입력과 원문 보존

예:

```text
"내일 회의 자료"
```

에서 `내일`이 작업 제목의 실제 일부일 수도 있다.

따라서 parser가 날짜로 인식해도:

```text
recognized token highlight
```

을 보여주고 최종 제거/적용을 명확하게 해야 한다.

---

# 8.27 Quick Add 확장 모드

기본 Quick Add는 작게 유지하지만 필요 시:

```text
더 보기
```

또는 `Shift+Enter`로 확장할 수 있다.

확장 시:

```text
Description
Subtasks
Reminder
Repeat
```

까지 추가 가능.

다만 완전한 Task Detail form으로 커지지 않게 한다.

정교한 편집은 Drawer가 담당한다.

---

# 8.28 Quick Add → Detail Drawer 연결

작업 생성 직후 바로 상세 입력이 필요한 사용자 흐름을 지원한다.

권장 Shortcut:

```text
Shift+Enter
→ 생성
→ 해당 Task Drawer 열기
```

또는 Quick Add 우측:

```text
[추가] [추가 후 열기]
```

같은 UI는 복잡할 수 있으므로 키보드 Shortcut을 우선한다.

---

# 8.29 Duplicate 방지

빠르게 Enter를 여러 번 눌렀을 때 동일 Task가 중복 생성되지 않도록 한다.

권장:

```text
clientGeneratedId / mutationId
```

를 생성 command에 포함.

서버가 동일 mutation을 중복 처리하지 않게 idempotency를 고려한다.

---

# 8.30 생성 중 UI

Enter 후:

```text
Task row optimistic insert
```

를 즉시 한다.

사용자가 네트워크 응답을 기다리지 않게 한다.

Row/Card는 짧은 pending 상태를 가질 수 있다.

---

# 8.31 생성 실패

생성 실패 시:

```text
optimistic row rollback
```

만 하면 사용자가 입력한 제목을 잃을 수 있다.

권장:

```text
생성 실패
→ Quick Add에 입력값 복원
→ "작업을 추가하지 못했습니다. 다시 시도하세요."
```

사용자 입력은 반드시 보존한다.

---

# 8.32 Offline 생성

향후 Offline-first를 고려한다면:

```text
local task 생성
pending sync
```

을 지원할 수 있다.

이 경우 temporary local id를 사용하고 서버 sync 후 canonical id로 매핑한다.

MVP에서 완전한 offline sync를 하지 않더라도 command 구조가 확장 가능해야 한다.

---

# 8.33 Quick Add Draft

Quick Add를 실수로 닫았을 때 입력을 보존할지 결정해야 한다.

### 권장

Context Quick Add:

```text
Esc → draft 폐기
```

Global Quick Add:

입력이 있는 상태에서 outside click:

```text
draft 유지 또는 닫기 confirmation
```

보다 단순하게:

```text
outside click으로 닫지 않음
Esc로 명시적 닫기
```

를 권장한다.

---

# 8.34 Global Quick Add UI 형태

Desktop에서는 중앙 Modal보다 작은 Overlay/Popover 형태를 권장한다.

예:

```text
┌───────────────────────────────────────────────┐
│ 작업을 입력하세요...                          │
│                                               │
│ 기본함 · 날짜 · Priority · Tag                │
└───────────────────────────────────────────────┘
```

화면을 완전히 가리지 않는다.

---

# 8.35 Global Quick Add 단축키

권장:

```text
Ctrl+N / Cmd+N
```

단, 브라우저 기본 새 창 Shortcut과 충돌 가능성이 있다.

실제 웹 환경에서는:

```text
Q
```

또는:

```text
Ctrl/Cmd + Shift + A
```

등으로 대체할 수 있다.

### 중요

실제 Shortcut은 브라우저/OS 충돌 검증 후 확정한다.

문서에서는 개념적으로:

```text
Global Quick Add Shortcut
```

으로 정의하고 구현 시 최종 키 조합을 정한다.

---

# 8.36 Command Palette와의 관계

향후 Command Palette를 넣더라도 Quick Add와 역할을 섞지 않는다.

```text
Quick Add
= Task 생성

Command Palette
= Navigation / Action 검색
```

둘은 별도 Shortcut을 갖는다.

---

# 8.37 Sidebar의 `+`

§2에서 정한:

```text
Lists +
Tags +
Filters +
```

는 Task Quick Add가 아니다.

객체 생성 역할:

```text
Lists + → List/Folder 생성
Tags + → Tag 생성
Filters + → Filter 생성
```

Task 생성은 Main/Global Quick Add로 통일한다.

---

# 8.38 Board Column Add

각 Column 하단:

```text
+ 작업
```

을 제공한다.

클릭 시 Card 형태의 inline input을 Column 안에 표시한다.

예:

```text
┌───────────────┐
│ 작업 입력...  │
└───────────────┘
```

저장하면 같은 Column 하단에 Task가 생긴다.

---

# 8.39 List Section Add

Section Header 또는 하단에:

```text
+ 작업
```

을 제공한다.

새 Task:

```text
listId = currentList
sectionId = currentSection
```

자동 적용.

---

# 8.40 Header Add와 Inline Add의 차이

### Header `+ 작업`

현재 Scope 전체 기준 생성.

### Section/Column `+ 작업`

해당 하위 Context까지 포함하여 생성.

예:

```text
List Header + 작업
→ sectionId = null

검토 Section + 작업
→ sectionId = 검토
```

사용자가 Action 결과를 쉽게 예측할 수 있다.

---

# 8.41 Quick Add에서 Metadata 표시 우선순위

좁은 공간에서는:

```text
Date
List
Priority
Tag
```

순으로 우선한다.

Context에 따라 이미 고정된 값은 숨긴다.

예:

List 안에서 Quick Add:

```text
List picker 숨김
```

Tag View:

```text
current Tag는 선택 상태로 표시
```

---

# 8.42 Quick Add와 Scope Context 표시

사용자가 어디에 생성되는지 헷갈릴 수 있는 곳에서는 작은 Context label을 제공한다.

예:

```text
ABM 연구에 추가
```

또는:

```text
기본함 · 오늘 계획
```

Global Quick Add:

```text
기본함에 추가
```

Context를 명시한다.

---

# 8.43 Quick Add에서 owner 변경

기본 owner가 정해져 있어도 사용자는 생성 전에 바꿀 수 있어야 한다.

예:

Today Quick Add:

```text
기본함
↓
ABM 연구로 변경
```

이 경우:

```text
Task.listId = ABM 연구
TaskDailyPlan.planDate = today
```

로 생성.

즉 Today Plan과 List owner는 독립이다.

---

# 8.44 Quick Add에서 Someday

Quick Add의 Date action 안에:

```text
언젠가
```

를 넣을 수 있다.

선택 시:

```text
someday = true
dueOn = null
dueAt = null
```

§6 불변식을 그대로 적용한다.

---

# 8.45 Quick Add에서 Reminder

Reminder는 Due Date/Time이 있어야 의미가 명확하다.

MVP Quick Add 기본 row에는 Reminder를 숨긴다.

Date를 고른 후 추가 Action으로 제공하거나 Drawer에서 설정.

---

# 8.46 Quick Add에서 Repeat

Repeat도 기본 Quick Add에서 숨긴다.

Date가 설정된 뒤에만 접근 가능.

복잡한 recurrence 설정은 Drawer에서 담당한다.

---

# 8.47 Quick Add에서 Subtask

MVP에서는 Quick Add에서 Subtask 입력을 지원하지 않는다.

필요하면:

```text
Shift+Enter
→ 생성 후 Drawer
```

로 이어간다.

빠른 입력 UI를 무겁게 만들지 않는다.

---

# 8.48 Quick Add에서 Description

기본 Quick Add에서는 Description을 숨긴다.

한 줄 title 중심.

Multi-line이 필요하면 확장 모드 또는 Drawer.

---

# 8.49 Mobile Quick Add

Mobile Quick Add의 최종 Presentation은 §15을 따른다.

`< 768px`에서는 Desktop inline editor를 그대로 축소하지 않고 **Bottom Sheet Quick Add**를 사용한다.

```text
┌─────────────────────────────┐
│ 작업 추가                   │
│ [제목을 입력하세요.......] │
│                             │
│ [날짜] [리스트] [우선순위] │
│ [태그]                      │
│                             │
│                     [추가]  │
└─────────────────────────────┘
```

호출점은 mobile shell의 Quick Add FAB 또는 Scope별 생성 Action이다.

동작은 새로운 mobile 전용 저장 로직을 만들지 않는다.

```text
Mobile UI
→ resolveCreateContext()
→ CreateTaskPlan
→ createTask()
```

Tasks Scope에서 호출하면 현재 Scope context를 사용한다.

Completed/Trash처럼 Context Create가 `disabled`인 화면에서 shell-level Global Quick Add를 호출한 경우에는 별도의 **Global mode**임을 UI에 명시하고 Inbox를 owner로 사용한다.

예:

```text
기본함에 추가
```

처럼 destination을 보이게 하여 Context Create처럼 오해하지 않게 한다.

---

# 8.50 Mobile Keyboard / Safe Area

모바일에서는 가상 키보드가 열려도 다음을 보장한다.

```text
- title input은 항상 visible
- primary save action은 keyboard에 완전히 가려지지 않음
- Bottom Sheet는 visual viewport를 따라 재배치
- 화면 mode breakpoint는 layout viewport width 기준 유지
- keyboard open/close 때문에 Desktop/Tablet/Mobile mode가 바뀌지 않음
```

높이는 `100vh` 고정값보다 `100dvh`를 우선하고, 지원하지 않는 환경에서는 안전한 fallback을 사용한다.

Bottom inset:

```css
padding-bottom: max(16px, env(safe-area-inset-bottom));
```

Keyboard가 열린 동안 FAB는 숨겨 중복 Action과 가림을 방지한다.

상세 규칙은 §15.34~§15.36을 따른다.

---

# 8.51 Quick Add Accessibility

필수:

```text
- opening 시 title input 자동 focus
- Tab으로 metadata action 이동
- Enter 저장
- Esc 닫기
- icon-only button accessible label
- color만으로 Priority 표현 금지
```

---

# 8.52 Quick Add Loading State

List/Tag picker 데이터가 늦게 로드되어도 title 입력은 즉시 가능해야 한다.

즉:

```text
Quick Add shell + title input
→ 즉시 표시

List/Tag metadata
→ 후속 로드
```

사용자가 입력을 시작하는 것을 막지 않는다.

---

# 8.53 Quick Add와 Task Count

Optimistic insert 직후 Sidebar Count와 Main Header Count도 즉시 증가해야 한다.

예:

```text
ABM 연구 7
↓ 새 Task
ABM 연구 8
```

서버 응답 후 뒤늦게 변경되지 않도록 한다.

---

# 8.54 Quick Add와 Scope Membership

생성 시 자동 속성 때문에 여러 Scope에 동시에 나타날 수 있다.

예:

Today에서:

```text
Inbox + Today Plan
```

으로 생성하면:

```text
Today
Inbox
```

양쪽 Count에 즉시 반영된다.

Tag View에서:

```text
Inbox + #중요
```

이면:

```text
Tag #중요
Inbox
```

양쪽에 나타난다.

---

# 8.55 Quick Add와 URL

Quick Add open/close 자체는 URL에 넣지 않는다.

작업 생성 후 Drawer를 열면 그때:

```text
?task=:id
```

를 URL에 추가한다.

즉:

```text
Quick Add = UI state
Created Task Detail = Navigation state
```

로 분리한다.

---

# 8.56 Quick Add Analytics 이벤트

필요 시 다음 이벤트를 기록할 수 있다.

```text
quick_add_opened
task_created
task_created_from_context
task_created_with_date
task_created_with_list
task_created_with_tag
```

단 사용자 입력 title/content 자체를 analytics payload에 넣지 않는다.

---

# 8.57 Quick Add에서 피해야 할 설계

### ① 작업 생성 Modal에 모든 필드 노출

속도가 느려진다.

### ② 현재 Context에서 생성 위치가 분명한데 List Picker 강제

불필요한 단계가 늘어난다.

### ③ owner가 불명확한데 임의 Regular List 자동 선택

예측 불가능하다.

### ④ Today에서 dueDate=today를 무조건 강제

Today Plan과 Deadline 의미가 섞인다.

### ⑤ 자연어 날짜를 조용히 자동 파싱

제목이 의도치 않게 바뀔 수 있다.

### ⑥ 생성 실패 시 사용자가 입력한 제목 삭제

신뢰를 크게 떨어뜨린다.

### ⑦ Enter를 빠르게 여러 번 눌렀을 때 중복 생성

idempotency 필요.

### ⑧ Quick Add가 열릴 때마다 List/Tag fetch가 끝날 때까지 입력 막기

빠른 Capture 경험을 깨뜨린다.

---

# 8.58 Desktop Context Quick Add 와이어프레임

```text
ABM 연구

┌─────────────────────────────────────────────────────┐
│ 작업을 입력하세요...                                │
│                                                     │
│ 📅 날짜 없음   🚩 없음   🏷 태그                    │
└─────────────────────────────────────────────────────┘

Enter: 추가
Shift+Enter: 추가 후 상세 열기
Esc: 취소
```

현재 List가 이미 정해져 있으므로 List Picker는 숨긴다.

---

# 8.59 Today Quick Add 와이어프레임

```text
오늘

┌─────────────────────────────────────────────────────┐
│ 작업을 입력하세요...                                │
│                                                     │
│ 기본함 · 오늘 계획                                  │
│ 📅 날짜 없음   🚩 없음   🏷 태그   📁 기본함        │
└─────────────────────────────────────────────────────┘
```

Date를 선택하지 않아도 Today에 나타난다.

---

# 8.60 Global Quick Add 와이어프레임

```text
                ┌─────────────────────────────────────────┐
                │ 새 작업                                 │
                │                                         │
                │ 작업을 입력하세요...                    │
                │                                         │
                │ 📁 기본함  📅 날짜  🚩 우선순위  🏷 태그 │
                └─────────────────────────────────────────┘
```

기본 owner는 Inbox.

---

# 8.61 Inbox Board Inline Add 와이어프레임

```text
미분류                 일정                  언젠가

[Task]                 [Task]                [Task]

+ 작업                 + 작업                + 작업
  ↓                      ↓                     ↓

title                  title                 title
                       날짜 선택              someday=true
```

Column의 의미가 새 Task 속성에 자동 적용된다.

---

# 8.62 생성 Flow 공통 구조

```text
User opens Quick Add
        ↓
Context resolver
        ↓
Default owner + default attributes
        ↓
Title input
        ↓
Optional metadata change
        ↓
Submit
        ↓
createTask domain command
        ↓
optimistic entity insert
        ↓
affected scopes membership update
        ↓
server success
```

실패:

```text
server failure
↓
rollback
↓
input restore
↓
retry
```

---

# 8.63 Context Resolver

Quick Add마다 owner/attribute 규칙을 중복 구현하지 않는다.

공통:

```text
resolveCreateContext(scope, placement?)
```

예:

```text
Today
→ owner Inbox
→ todayPlan=today

List
→ owner currentList

Tag
→ owner Inbox
→ tag=currentTag

List Section
→ owner currentList
→ section=currentSection
```

---

# 8.64 Create Context 타입

개념적으로:

```text
CreateContext
├─ targetListId?
├─ requiredOwnerSelection
├─ sectionId?
├─ todayPlanDate?
├─ dueDate?
├─ someday?
├─ tagIds[]
└─ filterDerivedAttributes
```

Folder처럼 owner가 아직 정해지지 않으면:

```text
requiredOwnerSelection = true
```

---

# 8.65 Quick Add와 Domain Command

최종 생성 시에는 반드시:

```text
createTask({
  targetListId,
  title,
  ...
})
```

형태로 targetListId가 확정되어야 한다.

UI Context가 애매한 상태로 domain layer에 넘기지 않는다.

---

# 8.66 Acceptance Criteria

### QA1

Global Quick Add를 열면 title input이 즉시 focus된다.

### QA2

Global Quick Add 기본 owner는 Inbox다.

### QA3

List에서 Quick Add하면 List Picker 없이 현재 List에 생성된다.

### QA4

Today에서 생성하면 due date 없이도 Today에 나타날 수 있다.

### QA5

Today Quick Add에서 List를 변경해도 Today Plan은 유지된다.

### QA6

Tag에서 생성하면 current Tag가 자동 적용된다.

### QA7

Folder에서는 owner List 선택 전에는 저장되지 않는다.

### QA8

Inbox Board 일정 Column에서 생성하려면 날짜가 필요하다.

### QA9

Inbox Board 언젠가 Column에서 생성하면 날짜가 남지 않는다.

### QA10

Enter로 생성 후 Inline Add는 연속 입력 가능하다.

### QA11

Shift+Enter로 생성 후 해당 Task Drawer를 열 수 있다.

### QA12

생성 실패 시 입력 Title과 선택 Metadata를 잃지 않는다.

### QA13

같은 submit이 중복 Task를 만들지 않는다.

### QA14

optimistic insert와 함께 Sidebar/Main Count가 즉시 갱신된다.

### QA15

Quick Add open state는 URL에 저장되지 않는다.

---

# 8.67 §8 확정 결정

- **Q1.** 작업 생성 UX는 `Context Quick Add / Global Quick Add / Column·Section Inline Add` 세 종류로 통일한다.
- **Q2.** Quick Add는 제목 입력을 가장 먼저 받고, 고급 필드는 숨긴다.
- **Q3.** Global Quick Add 기본 owner는 Inbox다.
- **Q4.** 현재 List가 명확하면 List Picker를 표시하지 않는다.
- **Q5.** Folder처럼 owner가 불명확하면 List 선택을 필수로 한다.
- **Q6.** Today에서 새 Task는 Inbox + Today Plan으로 생성하며 dueDate=today를 강제하지 않는다.
- **Q7.** Tag에서 새 Task는 Inbox + 현재 Tag를 기본으로 한다.
- **Q8.** Filter에서는 단일 owner가 명확하면 그 List, 아니면 Inbox를 사용한다.
- **Q9.** Section/Column Inline Add는 해당 Section/Column 속성을 자동 적용한다.
- **Q10.** Enter는 생성, Shift+Enter는 생성 후 Detail Drawer 열기를 기본으로 한다.
- **Q11.** Inbox/List/Section/Board Column에서는 연속 입력을 지원한다.
- **Q12.** 자연어 날짜 파싱은 MVP 필수 기능에서 제외하고 P1 이후로 둔다.
- **Q13.** 자연어 파싱 도입 시 인식 결과를 사용자에게 명시적으로 보여준다.
- **Q14.** Reminder/Repeat/Subtask/Description은 기본 Quick Add에서 숨기고 Detail Drawer로 넘긴다.
- **Q15.** 생성은 optimistic insert를 사용하되 실패 시 입력 내용을 복원한다.
- **Q16.** client mutation id 등으로 중복 생성 방지를 고려한다.
- **Q17.** Quick Add open state는 URL에 넣지 않는다.
- **Q18.** Context별 생성 규칙은 `resolveCreateContext` 같은 공통 resolver로 통합한다.
- **Q19.** 최종 domain `createTask` 호출 시에는 반드시 targetListId가 확정되어야 한다.
- **Q20.** 생성 결과는 현재 Context와 관련된 모든 Scope Count/Query에 즉시 반영한다.

---

---

# 9. Interaction State / Drag & Drop / Hover / Selection / Undo / Toast 공통 UX

## 9.1 목적

§9의 목적은 앱 전체에서 반복적으로 나타나는 상호작용 상태를 하나의 규칙으로 통일하는 것이다.

대상:

```text
- Hover
- Focus
- Selected
- Pressed
- Dragging
- Drop Target
- Disabled
- Loading
- Error
- Undo
- Toast
- Multi-select
```

핵심 원칙:

> 같은 의미의 상호작용은 Sidebar, List, Board, Drawer에서 서로 다른 방식으로 보이지 않게 한다.

사용자가 한 번 배운 조작 방식을 앱 전체에서 그대로 재사용할 수 있어야 한다.

---

# 9.2 Interaction State 우선순위

하나의 Row/Card가 동시에 여러 상태를 가질 수 있으므로 표시 우선순위를 정한다.

권장 우선순위:

```text
Disabled
>
Dragging
>
Selected
>
Pressed
>
Hover
>
Default
```

Focus는 별도 접근성 Layer로 유지한다.

예:

```text
Selected + Hover
```

라면 Selected 배경을 유지하면서 Hover Action만 추가 표시한다.

---

# 9.3 기본 상태

기본 상태에서는 Task Row/Card를 최대한 가볍게 유지한다.

항상 보이는 것:

```text
Checkbox
Title
핵심 Metadata
```

기본적으로 숨기는 것:

```text
Drag Handle
More(...)
Quick action icon
Secondary controls
```

사용자가 실제로 해당 Task에 접근할 때만 추가 Action을 보여준다.

---

# 9.4 Hover State

Task Row/Card Hover 시 다음이 가능하다.

```text
- 배경 약한 강조
- Drag Handle 표시
- More(...) 표시
- 빠른 날짜/우선순위 Action 일부 표시
```

그러나 Hover 시 Layout width가 변하면 안 된다.

즉 Action 영역의 공간을 미리 확보하거나 overlay 형태로 표시한다.

---

# 9.5 Hover Action 최소화

TickTick형 밀도를 유지하기 위해 Task Hover에서 Action을 너무 많이 노출하지 않는다.

MVP 권장:

```text
Drag Handle
More(...)
```

필요하면:

```text
날짜
```

정도만 추가한다.

Priority, Tag, List 이동 등은 More Menu 또는 Drawer에서 처리한다.

---

# 9.6 Keyboard Focus

마우스 Hover와 Keyboard Focus를 구분한다.

키보드로 Row/Card에 focus가 들어오면:

```text
명확한 focus ring
```

을 보여준다.

Color 차이만으로 focus를 표현하지 않는다.

---

# 9.7 Selected State

Selection은 다음 두 종류를 구분한다.

```text
A. Opened Task
B. Multi-selected Task
```

### Opened Task

Drawer에 열려 있는 Task.

Main에서 해당 Row/Card가 약하게 Selected 표시된다.

### Multi-selected Task

Bulk action 대상으로 명시적으로 선택된 Task.

Opened Task와 시각적으로 구분해야 한다.

---

# 9.8 Drawer Open Task Highlight

Task Drawer가 열린 동안 Main의 원본 Task에 선택 표시를 유지한다.

예:

```text
[Task A]  ← selected
[Task B]
[Task C]
```

다른 Task를 Drawer에서 열면 selection도 해당 Task로 이동한다.

---

# 9.9 Multi-select 지원 여부

TickTick형 개인 Todo 앱에서는 Multi-select가 유용하지만 핵심 MVP 기능은 아니다.

권장 단계:

```text
MVP:
단일 Task selection

P1:
Multi-select
```

P1에서 지원할 경우:

```text
Ctrl/Cmd + Click
Shift + Click
Checkbox-like selection mode
```

등을 고려한다.

---

# 9.10 Multi-select 진입

Desktop 권장:

```text
Ctrl/Cmd + Click
→ 개별 추가/해제

Shift + Click
→ 범위 선택
```

Touch에서는:

```text
Long press
→ selection mode
```

모바일 상세는 별도 설계.

---

# 9.11 Multi-select Action Bar

2개 이상 선택 시 Main 상단 또는 하단에 임시 Action Bar를 표시한다.

예:

```text
3개 선택됨

완료 | 날짜 | List 이동 | Tag | 삭제 | X
```

Action Bar는 기존 Main Header를 완전히 대체하지 않고 overlay/sticky 형태를 권장한다.

---

# 9.12 Multi-select 범위

기본적으로 현재 Scope 안의 Task만 선택 가능하다.

다른 Scope로 이동하면 selection을 초기화한다.

예:

```text
/list/A
→ 3개 선택

Sidebar: /list/B
→ selection clear
```

URL에는 selection을 넣지 않는다.

---

# 9.13 Multi-select와 Drawer

Multi-select 모드에서는 Task 클릭의 의미가 달라질 수 있다.

권장:

```text
selection mode 활성
→ Task click = select/unselect
→ Drawer open은 Enter 또는 별도 Action
```

혼합 조작을 피한다.

---

# 9.14 Drag & Drop 원칙

Drag는 **현재 화면에서 의미가 명확한 이동에만** 사용한다.

지원:

```text
- List manual reorder
- Board Column 이동
- Section 이동
- Sidebar List/Folder 정렬
- Folder 간 List 이동
```

후순위:

```text
- Folder Aggregate View에서 Task를 다른 List로 이동
- Task를 Sidebar List 위로 Drag
```

---

# 9.15 Drag Handle

Desktop에서는 Row/Card 전체를 Drag zone으로 만들기보다 Hover 시 작은 Handle을 노출하는 것을 권장한다.

예:

```text
⋮⋮ □ Task title
```

이유:

```text
Task 클릭 → Drawer
Text selection
Checkbox click
```

과 Drag가 충돌하는 것을 줄인다.

---

# 9.16 Board Card Drag

Board Card는 Handle 또는 Card의 안전한 영역에서 Drag 가능.

Dragging 시작 시:

```text
원본 Card opacity 감소
Drag Preview 표시
```

원본 위치는 placeholder로 유지한다.

---

# 9.17 Drag Preview

Drag Preview는 원본 Card를 그대로 복사하기보다 필요한 정보만 표시한다.

```text
Task title
```

정도면 충분하다.

너무 큰 그림자/Animation으로 시각적 소음을 만들지 않는다.

---

# 9.18 Valid Drop Target

Drop 가능한 Column/Section은 Drag 중에 명확하게 강조한다.

예:

```text
Column background 약한 highlight
Insertion line
```

사용자는 놓기 전에 결과 위치를 예측할 수 있어야 한다.

---

# 9.19 Invalid Drop Target

Drop 불가능한 위치는 다음 중 하나로 표시한다.

```text
- highlight 없음
- 금지 cursor
- 필요 시 짧은 tooltip
```

Task가 허용되지 않는 Folder/Smart List 등에 Drop되면 아무 일도 일어나지 않아야 한다.

---

# 9.20 Drop Insertion Indicator

같은 List/Section 안에서 reorder할 때는 정확한 삽입 위치를 line으로 표시한다.

```text
Task A
────────────  ← insertion
Task B
```

Card 전체 Highlight만으로 위치를 모호하게 만들지 않는다.

---

# 9.21 List Manual Reorder

조건:

```text
sort = manual
```

일 때만 가능.

Drop 후:

```text
Task.sortKey 업데이트
```

optimistic reorder.

---

# 9.22 Derived Sort에서 Drag

다음과 같은 정렬에서는 reorder drag를 금지한다.

```text
due date
priority
title
createdAt
```

왜냐하면 사용자가 Task를 움직여도 정렬 규칙이 다시 원래 위치로 되돌릴 수 있기 때문이다.

이때 Drag Handle도 숨긴다.

---

# 9.23 Today Drag

MVP에서는 Today 전체 자유 Drag reorder를 제공하지 않는다.

```text
Today free reorder = disabled
```

이미 `TaskDailyPlan.sortKey`가 있는 Task는 정렬에 반영할 수 있지만, drag를 통해 due-only Task에 TodayPlan을 새로 만드는 동작은 하지 않는다.

향후 Today reorder를 도입하더라도 원래 List의 `Task.sortKey`는 변경하지 않는다.

---

# 9.24 Inbox Board Drag

§6 규칙을 그대로 따른다.

```text
미분류 → 일정
→ Date Picker

일정 → 미분류
→ due date 제거

→ 언젠가
→ someday=true
```

특히 `미분류 → 일정`은 Drop만으로 완료되지 않는다.

날짜가 필수이므로:

```text
Drop
→ Date Picker
→ Date 선택
→ commit
```

한다.

---

# 9.25 Drop 후 추가 입력이 필요한 경우

Drop 결과가 추가 값을 요구하면 즉시 commit하지 않는다.

예:

```text
미분류 → 일정
```

Flow:

```text
temporary placement
↓
Date Picker
├─ 선택 → commit
└─ 취소 → 원래 위치 복귀
```

중간 불완전 상태를 DB에 저장하지 않는다.

---

# 9.26 List Board Section Drag

Task를 다른 Section으로 이동:

```text
sectionId 변경
sortKey 새 위치 생성
```

같은 List 안이므로 List owner는 유지한다.

---

# 9.27 Sidebar Drag

지원:

```text
List reorder
List → SidebarFolder
List → root
Folder reorder
```

변경되는 필드:

```text
sidebarFolderId
sidebarSortKey
```

Project 관계는 절대 변경하지 않는다.

---

# 9.28 Sidebar Folder Drop Area

Folder row 전체를 target으로 사용할 수 있다.

Drag over:

```text
Folder highlight
```

Drop:

```text
List.sidebarFolderId = targetFolder
```

---

# 9.29 Sidebar root Drop

List를 Folder 밖 root로 옮길 수 있어야 한다.

Sidebar의 Lists root 영역에:

```text
root drop zone
```

을 제공한다.

---

# 9.30 Folder 자체 Nesting 금지

Tasks Sidebar에서는 Nested Folder를 허용하지 않으므로:

```text
Folder → Folder
```

drop으로 subfolder를 만드는 동작은 금지한다.

Folder drag는 순서 변경만 가능하다.

---

# 9.31 Drag Cancel

지원:

```text
Esc
```

또는 pointer cancel.

취소 시 원래 위치 복원.

서버 mutation을 보내지 않는다.

---

# 9.32 Optimistic Drag

유효 Drop 후 즉시 화면에서 이동시킨다.

```text
Drop
→ UI 위치 변경
→ mutation
```

서버 응답을 기다리지 않는다.

---

# 9.33 Drag 실패 Rollback

서버 저장 실패:

```text
원래 위치 복원
+
Toast
```

예:

```text
작업을 이동하지 못했습니다.
[다시 시도]
```

가능하면 사용자가 놓으려 했던 target 정보를 유지해 retry할 수 있게 한다.

---

# 9.34 Undo와 Rollback 차이

두 개념을 구분한다.

### Rollback

요청 실패 때문에 시스템이 자동으로 이전 상태로 되돌림.

### Undo

요청은 성공했지만 사용자가 선택을 되돌림.

예:

```text
Task 완료
→ 성공
→ Undo 가능
```

---

# 9.35 Undo 대상

Undo를 적극 지원할 Action:

```text
Task 완료
Task 삭제 → Trash
List 이동
Tag 제거
Board 이동
Date 제거/변경
Sidebar List 이동
```

단 모든 작은 편집에 Undo Toast를 띄우지는 않는다.

예:

```text
Title typing
Description typing
Priority 변경
```

은 Toast 기반 Undo보다 직접 재편집이 자연스럽다.

---

# 9.36 Undo Toast 기본 구조

```text
작업을 완료했습니다.            실행 취소
```

또는:

```text
작업을 ABM 연구로 이동했습니다.   실행 취소
```

한 줄 메시지 + 하나의 Action.

---

# 9.37 Undo Toast 위치

Desktop 권장:

```text
화면 하단 중앙 또는 우하단
```

Main/Drawer를 가리지 않는 위치.

앱 전체에서 하나의 Toast stack 위치를 사용한다.

---

# 9.38 Undo 시간

권장:

```text
5~8초
```

너무 짧지 않게 한다.

기본:

```text
6초
```

정도를 권장한다.

---

# 9.39 Undo 처리 방식

Undo는 반대 mutation을 새로 실행하는 방식보다 가능한 경우 mutation context를 보존한다.

예:

```text
moveTask
previousListId
previousSectionId
previousSortKey
```

를 Undo payload에 저장.

Undo:

```text
restore previous placement
```

---

# 9.40 여러 Undo Toast

사용자가 빠르게 여러 Action을 할 수 있다.

두 전략:

### A. Toast stack

최근 여러 Action을 각각 Undo 가능.

### B. 마지막 Action만 표시

### 권장 MVP

**B. 마지막 Action만**.

구현 단순성과 UI 밀도를 우선한다.

P1에서 stack 또는 history Undo를 고려할 수 있다.

---

# 9.41 Toast 유형

최소:

```text
Success
Error
Info
Undo
```

Success Toast는 남발하지 않는다.

대부분의 성공은 UI 변화 자체로 충분하다.

---

# 9.42 Success Toast를 띄울 때

권장:

```text
Global Quick Add 성공
링크 복사
설정 저장
```

처럼 결과가 화면에서 바로 보이지 않는 경우.

Task inline 생성/완료처럼 결과가 즉시 보이면 생략 가능.

---

# 9.43 Error Toast

저장 실패, 네트워크 실패 등은 명확히 알린다.

예:

```text
변경사항을 저장하지 못했습니다.
[다시 시도]
```

오류를 조용히 무시하지 않는다.

---

# 9.44 Toast 중복 방지

동일한 네트워크 오류가 여러 Task에서 연속 발생한다고 같은 Toast를 10개 쌓지 않는다.

짧은 시간 내 동일 message는 merge/debounce할 수 있다.

---

# 9.45 Destructive Confirmation

Undo로 충분히 복구 가능한 Action은 confirm을 최소화한다.

예:

```text
Task 삭제 → Trash
```

는 confirmation 없이 수행 + Undo.

반면:

```text
영구 삭제
휴지통 비우기
```

는 confirmation 필수.

---

# 9.46 List 삭제 Confirmation

List 삭제는 여러 Task에 영향을 주므로 confirmation을 사용한다.

예:

```text
"ABM 연구" 리스트를 삭제하시겠습니까?

이 리스트의 작업은 함께 보관/삭제 상태로 이동합니다.

[취소] [삭제]
```

정확한 문구는 실제 데이터 정책에 맞춘다.

---

# 9.47 SidebarFolder 삭제

Folder 삭제는 하위 List를 root로 이동시키므로 destructive 수준이 낮다.

Confirm 없이:

```text
Folder 삭제
→ List root 이동
→ Undo
```

도 가능하다.

MVP에서는 짧은 confirmation 없이 Undo를 권장한다.

---

# 9.48 Pressed State

Button/Card를 누르는 순간 짧은 pressed feedback을 제공한다.

예:

```text
background/scale 아주 약한 변화
```

과도한 bounce animation은 피한다.

---

# 9.49 Disabled State

Disabled Action은 단순 opacity 감소만 하지 않는다.

필요하면 Tooltip으로 이유를 알려준다.

예:

```text
Derived sort 상태에서 drag handle 없음
```

이 경우 아예 Action을 숨기는 것이 더 낫다.

반면:

```text
다음 Task 없음
```

Arrow disabled는 상태가 보이도록 유지할 수 있다.

---

# 9.50 Loading State — Button

mutation 중 button을 무조건 전체 disabled하지 않는다.

예:

```text
Task 완료
```

는 optimistic 처리 후 즉시 다음 행동 가능.

반면 중복 제출 위험이 있는:

```text
영구 삭제 confirm
```

은 요청 중 버튼 disabled.

---

# 9.51 Loading State — Row/Card

Background sync 중 Task마다 spinner를 붙이지 않는다.

필요 시:

```text
subtle pending marker
```

정도.

사용자가 저장 중이라는 것을 지나치게 의식하지 않게 한다.

---

# 9.52 Error State — Row/Card

특정 Task mutation만 실패했다면 전체 Main Error로 만들지 않는다.

해당 Task rollback + Toast.

Main 전체 Query 실패일 때만 Main Error State.

---

# 9.53 Selection과 Hover 충돌

Opened Task가 selected 상태일 때 Hover하면:

```text
selected background 유지
+ hover controls 표시
```

Hover background로 selected 상태를 덮지 않는다.

---

# 9.54 Dragging과 Selected 충돌

Selected Task를 Drag하면 Dragging이 최우선 시각 상태.

Drawer가 열려 있는 Task를 Drag하는 것은 허용 가능하지만 UX가 복잡하다.

### 권장 MVP

Drawer가 열린 Task Drag 허용.

이동 후 현재 Scope를 벗어나면 Drawer는 §4 규칙에 따라 닫힌다.

---

# 9.55 Checkbox Interaction

Checkbox 클릭 영역은 충분히 넓게 확보한다.

Task Row 클릭과 분리한다.

```text
Checkbox click
→ 완료

Row body click
→ Drawer open
```

Checkbox 클릭 때문에 Drawer가 같이 열리면 안 된다.

---

# 9.56 More Menu Interaction

`...` 클릭:

```text
Context Menu open
```

Row body click event가 전달되지 않게 한다.

즉 Drawer가 동시에 열리지 않는다.

---

# 9.57 Context Menu 닫기

지원:

```text
Outside click
Esc
Action 선택
다른 Menu open
```

Context Menu 상태는 URL에 넣지 않는다.

---

# 9.58 Context Menu 위치

가능하면 클릭한 `...` 근처에 표시한다.

Viewport 밖으로 잘리면 자동 reposition.

Drawer/Menu가 서로 겹칠 때 z-index 규칙을 통일한다.

---

# 9.59 Layer 우선순위

권장 layer hierarchy:

```text
Base App
< Sticky Header
< Drawer
< Popover / Context Menu
< Modal / Confirm Dialog
< Toast
```

Toast는 인터랙션을 block하지 않는다.

---

# 9.60 Focus Trap

Modal/Confirm Dialog는 focus trap 필요.

Drawer는 Desktop에서 완전 Modal이 아니므로 focus trap을 기본으로 하지 않는다.

사용자는 Main과 Drawer 사이를 오갈 수 있다.

---

# 9.61 Keyboard Row Navigation

List View에서:

```text
↑ / ↓
```

로 focus 이동 가능.

Enter:

```text
Drawer open
```

Space:

```text
완료 토글
```

단 Input/Editor focus 중에는 해당 shortcut 비활성.

---

# 9.62 Board Keyboard Navigation

P1 이후 권장:

```text
← / → Column 이동
↑ / ↓ Card 이동
Enter Drawer
Space 완료
```

MVP에서 완전한 Board keyboard navigation이 어렵더라도 모든 Action을 pointer-only로 만들지 않도록 한다.

---

# 9.63 Drag 대체 Action

Accessibility를 위해 Drag가 유일한 이동 수단이면 안 된다.

Board Card More Menu:

```text
다른 Section으로 이동
```

Sidebar List Menu:

```text
폴더로 이동
```

Task Drawer:

```text
List 이동
```

을 항상 제공한다.

---

# 9.64 Touch Drag

모바일/터치에서는 Scroll과 Drag 충돌이 크다.

권장:

```text
Long press
→ drag mode
```

또는 More Menu 기반 이동을 우선.

Mobile 상세은 별도 문서에서 확정.

---

# 9.65 Animation Duration

상호작용 Animation은 짧게 유지한다.

권장 범위:

```text
120~200ms
```

완료/삭제처럼 상태 변화가 큰 경우:

```text
150~220ms
```

정도.

앱을 느리게 느끼게 하는 300ms 이상의 일반 transition은 피한다.

---

# 9.66 Reduced Motion

OS의 reduced-motion 설정을 존중한다.

해당 설정에서는:

```text
Card 이동 animation 최소화
Fade/scale 최소화
```

한다.

---

# 9.67 Hover 없는 환경

Touch에서는 Hover에 숨겨진 핵심 Action에 접근할 수 없다.

따라서:

```text
More Menu
Drawer
Long press menu
```

등 다른 경로가 반드시 존재해야 한다.

---

# 9.68 Bulk Complete

P1 Multi-select에서:

```text
3개 선택
→ 완료
```

optimistic update.

각 Task가 서로 다른 Scope membership을 가지더라도 같은 domain command batch로 처리할 수 있다.

실패가 일부만 발생할 경우 partial failure UI가 필요하다.

---

# 9.69 Bulk Move

여러 Task를 List 이동:

```text
targetList 선택
→ 모든 Task move
```

기존 Section은 모두 null 처리하는 것을 기본으로 한다.

Project 전용 relation이 있는 Task가 포함되면 batch 전체를 막을지 일부만 막을지 정책 필요.

### 권장

MVP multi-select 도입 시:

```text
전체 validation
→ 하나라도 불가하면 commit 전에 알려줌
```

---

# 9.70 Bulk Delete

Task 여러 개 삭제:

```text
Trash로 이동
```

confirm 없이 Undo로 처리 가능.

영구 삭제는 Trash에서만 confirmation.

---

# 9.71 Selection Count

Multi-select Action Bar에:

```text
3개 선택됨
```

을 명확히 표시한다.

전체 몇 개인지보다 선택 수가 중요하다.

---

# 9.72 Escape Key 우선순위

Esc는 현재 가장 안쪽 interaction부터 닫는다.

권장 순서:

```text
1. Modal/Confirm
2. Popover/Context Menu
3. Quick Add
4. Multi-select mode
5. Drawer
```

한 번의 Esc로 모든 Layer를 닫지 않는다.

---

# 9.73 Undo와 Browser Back 분리

Undo는 데이터 mutation을 되돌리는 기능.

Browser Back은 navigation을 되돌리는 기능.

예:

```text
Task 완료
→ Undo Toast

Task Drawer open
→ Browser Back
```

두 기능을 혼동하지 않는다.

---

# 9.74 Toast와 URL

Toast state는 URL에 넣지 않는다.

새로고침하면 사라져도 된다.

Undo 가능 mutation이 새로고침 전에 발생했다면 reload 후 Undo까지 보존할지는 MVP에서 지원하지 않아도 된다.

---

# 9.75 Interaction Event 공통화

컴포넌트마다 상태 이름을 제각각 쓰지 않는다.

예:

```text
isHovered
isFocused
isSelected
isDragging
isDropTarget
isDisabled
isPending
```

공통 primitive/API를 사용한다.

---

# 9.76 Task Row Primitive

List Row와 Board Card가 완전히 별개 interaction 로직을 갖지 않게 한다.

공통 Task Interaction Layer:

```text
TaskInteraction
├─ complete
├─ open
├─ more
├─ drag
├─ select
└─ keyboard
```

Presentation만 Row/Card로 달라진다.

---

# 9.77 Drag Domain Operation 분리

UI Drop handler가 직접 여러 필드를 patch하지 않는다.

예:

```text
moveTaskWithinList(...)
moveTaskToSection(...)
moveInboxTaskToBucket(...)
moveListToSidebarFolder(...)
```

처럼 의미 있는 domain operation 호출.

§6의 불변식을 보존한다.

---

# 9.78 Optimistic Mutation 공통 패턴

모든 interaction mutation은 가능한 한 다음 구조를 따른다.

```text
snapshot previous state
↓
optimistic patch
↓
UI/query membership update
↓
server mutation
├─ success → finalize
└─ failure → rollback + error
```

---

# 9.79 Undoable Mutation 공통 패턴

```text
perform mutation
↓
capture undo payload
↓
show Undo Toast
↓
user clicks Undo?
├─ Yes → inverse/restore mutation
└─ No → expire
```

---

# 9.80 Interaction State 와이어프레임

```text
Default
□ Task title                         오늘

Hover
⋮⋮ □ Task title                     오늘   ...

Selected / Drawer open
▌ □ Task title                      오늘   ...

Dragging
   ┌────────────────────────────┐
   │ Task title                 │
   └────────────────────────────┘

Drop target
────────────── 여기에 놓기 ──────────────
```

실제 색상/Border는 Visual Design 단계에서 확정한다.

---

# 9.81 Board Drag 와이어프레임

```text
할 일                  진행                  검토

[Task A]               [Task C]             [Task D]

[Task B]  ───────▶     ─────────────
                       여기에 놓기
```

Drop 후:

```text
sectionId = 진행
```

---

# 9.82 Undo Toast 와이어프레임

```text
┌────────────────────────────────────────┐
│ 작업을 완료했습니다.        실행 취소   │
└────────────────────────────────────────┘
```

한 Toast에 여러 secondary action을 넣지 않는다.

---

# 9.83 Destructive Confirm 와이어프레임

```text
┌───────────────────────────────────────┐
│ 작업을 영구 삭제하시겠습니까?          │
│                                       │
│ 이 작업은 복구할 수 없습니다.          │
│                                       │
│                  취소    영구 삭제     │
└───────────────────────────────────────┘
```

destructive action이 시각적으로 구분되어야 한다.

---

# 9.84 Acceptance Criteria

### IX1
Task Row Hover 시 Layout shift가 발생하지 않는다.

### IX2
Checkbox 클릭은 Drawer를 열지 않는다.

### IX3
More Menu 클릭은 Drawer를 열지 않는다.

### IX4
Derived sort에서는 manual reorder Drag를 제공하지 않는다.

### IX5
Board Drop target은 놓기 전에 결과 위치가 명확하다.

### IX6
추가 입력이 필요한 Drop은 commit 전에 필요한 값을 받는다.

### IX7
Drag mutation 실패 시 원래 위치로 rollback한다.

### IX8
Sidebar Drag는 Project/Space 관계를 변경하지 않는다.

### IX9
Task 삭제는 Trash + Undo이며 영구 삭제가 아니다.

### IX10
영구 삭제는 confirmation을 요구한다.

### IX11
Opened Task는 Main에서 selected 상태가 유지된다.

### IX12
현재 Scope 변경 시 Multi-select는 초기화된다.

### IX13
Keyboard Focus는 Hover 없이도 명확히 보인다.

### IX14
Drag를 사용하지 않고도 동일 이동을 수행할 대체 Action이 있다.

### IX15
Esc는 가장 안쪽 Layer부터 하나씩 닫는다.

### IX16
Toast state는 URL과 분리된다.

### IX17
optimistic mutation 실패 시 UI와 Query membership 모두 이전 상태로 복원된다.

### IX18
Undo는 navigation history가 아니라 data mutation을 되돌린다.

---

# 9.85 §9 확정 결정

- **I1.** Task interaction state는 `Default / Hover / Focus / Selected / Dragging / Disabled / Pending`으로 공통화한다.
- **I2.** Hover 시 Drag Handle과 More Action을 노출하되 Layout shift가 없어야 한다.
- **I3.** Drawer에 열린 Task는 Main에서 selected 상태를 유지한다.
- **I4.** Multi-select는 MVP 필수가 아니라 P1 기능으로 둔다.
- **I5.** Drag는 manual order나 명확한 Column semantics가 있는 곳에서만 허용한다.
- **I6.** Derived sort에서는 reorder Drag를 숨긴다.
- **I7.** Inbox Board/Section/List/Sidebar Drag는 각각 별도 domain operation으로 처리한다.
- **I8.** 추가 값이 필요한 Drop은 해당 값을 받은 뒤 commit한다.
- **I9.** 유효 Drop은 optimistic update하고 실패 시 rollback한다.
- **I10.** Undo와 rollback을 명확히 구분한다.
- **I11.** 완료/Trash 이동/List 이동 등 위치가 크게 바뀌는 mutation에는 Undo를 적극 제공한다.
- **I12.** MVP Toast는 마지막 Action 중심의 단일 Undo Toast를 기본으로 한다.
- **I13.** Success Toast는 화면 변화로 결과가 명확한 경우 생략한다.
- **I14.** 영구 삭제/휴지통 비우기만 강한 confirmation을 기본으로 한다.
- **I15.** 일반 Task 삭제는 confirmation 없이 Trash + Undo로 처리한다.
- **I16.** Checkbox/More/Drag Handle은 Row click과 event를 분리한다.
- **I17.** Drag가 유일한 이동 수단이 되지 않도록 Menu/Drawer 기반 대체 Action을 제공한다.
- **I18.** Esc는 Modal → Popover → Quick Add → Multi-select → Drawer 순으로 가장 안쪽 상태부터 닫는다.
- **I19.** interaction state와 Toast는 URL에 저장하지 않는다.
- **I20.** mutation은 `snapshot → optimistic update → server → success/rollback` 공통 패턴을 따른다.

---

---

# 10. Search / Command Palette / 빠른 Navigation UX

## 10.1 목적

§10의 목적은 사용자가 현재 위치와 상관없이 **원하는 Task, List, Tag, Space, Project를 몇 글자만 입력해서 찾고 이동하거나 필요한 Action을 실행**할 수 있도록 전역 탐색 경험을 설계하는 것이다.

TickTick처럼 앱이 커져도 사용자가 Sidebar를 계속 펼쳐가며 목적지를 찾게 하지 않는다.

핵심 원칙:

```text
Search = 무엇을 찾는가
Command = 무엇을 실행하는가
```

두 기능은 같은 진입 UI를 공유할 수 있지만 내부 의미는 구분한다.

---

# 10.2 최종 방향

전역 진입점은 하나로 통합한다.

```text
Global Search / Command Palette
```

사용자는 하나의 Overlay를 열고 바로 입력한다.

입력 내용에 따라 결과를 다음 두 종류로 나눈다.

```text
① Search Results
   Task / List / Tag / Folder / Space / Project

② Commands
   오늘로 이동
   새 작업
   새 리스트
   Board로 보기
   설정 열기
   ...
```

즉 UI는 하나지만 결과 type과 실행 semantics는 분리한다.

---

# 10.3 Search Module과 Palette Overlay 구분

두 형태를 함께 제공한다.

### A. Quick Palette

키보드 Shortcut 또는 Search icon으로 즉시 여는 작은 Overlay.

목적:

```text
빠르게 찾기
빠르게 이동
빠르게 실행
```

### B. Full Search Page

URL:

```text
/search?q=ABM
```

목적:

```text
검색 결과를 더 많이 보고
필터링하고
공유/새로고침 가능한 상태로 유지
```

즉:

```text
Palette = 빠른 진입
Search Page = 깊은 검색
```

---

# 10.4 Palette 기본 UI

권장 구조:

```text
┌───────────────────────────────────────────────────┐
│ 🔍 검색하거나 명령을 입력하세요...                │
├───────────────────────────────────────────────────┤
│ 최근                                               │
│  ABM 연구                                         │
│  오늘                                              │
│  교수님께 결과 전달                                │
│                                                   │
│ 명령                                               │
│  + 새 작업                                        │
│  → 오늘로 이동                                    │
└───────────────────────────────────────────────────┘
```

입력 즉시 결과가 갱신된다.

별도 Search 버튼을 누르지 않는다.

---

# 10.5 Palette 위치와 크기

Desktop 권장:

```text
화면 상단 중앙
width: 560~680px
max-height: 60~70vh
```

기본 권장:

```text
width: 620px
```

화면 전체를 덮는 Modal보다 가벼운 Command Palette 형태를 사용한다.

---

# 10.6 Palette 열기

진입 방법:

```text
Rail Search icon
Keyboard shortcut
```

권장 Shortcut 개념:

```text
Ctrl/Cmd + K
```

단 실제 브라우저/OS 충돌을 확인한 후 확정한다.

Search icon 클릭과 Shortcut 모두 같은 Palette를 연다.

---

# 10.7 Palette가 열릴 때 Focus

Palette open:

```text
input auto-focus
```

사용자가 한 번 더 클릭할 필요 없이 바로 입력한다.

---

# 10.8 기본 빈 상태

검색어가 없을 때는 다음을 보여준다.

```text
최근 항목
자주 쓰는 항목
추천 명령
```

### 권장 우선순위

```text
1. 최근 열었던 Scope
2. 최근 열었던 Task
3. 자주 사용하는 명령
```

과도한 추천 알고리즘은 넣지 않는다.

---

# 10.9 검색 대상

전역 Search 최소 대상:

```text
Task
List
Tag
SidebarFolder
Space
Project
Saved Filter
```

향후:

```text
Attachment filename
Comment
Description full text
```

등으로 확장할 수 있다.

---

# 10.10 검색 결과 Grouping

검색 결과는 type별로 그룹한다.

예:

```text
작업
  교수님께 ABM 결과 전달
  ABM 시뮬레이션 확인

리스트
  ABM 연구

태그
  #ABM

공간
  연구

프로젝트
  Drone Delivery
```

결과를 하나의 평면 리스트로 섞지 않는다.

사용자가 항목의 종류를 즉시 이해할 수 있어야 한다.

---

# 10.11 결과 그룹 순서

기본 권장:

```text
1. Task
2. List
3. Tag
4. Filter
5. Folder
6. Project
7. Space
8. Command
```

단 exact match나 현재 사용 맥락에 따라 상위 결과를 일부 재정렬할 수 있다.

MVP에서는 고정 group order가 더 예측 가능하다.

---

# 10.12 Task 검색 결과 Row

표시:

```text
Task title
원래 List
Due date 또는 상태
```

예:

```text
교수님께 결과 전달
ABM 연구 · 오늘
```

현재 검색어가 title과 일치한 부분은 강조할 수 있다.

---

# 10.13 List 검색 결과 Row

표시:

```text
List name
Sidebar Folder 또는 연결 Project
```

예:

```text
ABM 연구
학교
```

Project-linked List라면 필요 시:

```text
Drone Research
```

를 보조 정보로 보여줄 수 있다.

---

# 10.14 Tag 검색 결과 Row

예:

```text
#중요
작업 7개
```

Count는 현재 미완료 기준으로 표시 가능.

---

# 10.15 Folder 검색 결과 Row

SidebarFolder 검색 결과:

```text
학교
3개 리스트
```

클릭:

```text
/folder/:id
```

로 이동.

---

# 10.16 Project / Space 결과

Project:

```text
Drone Research
연구 Space
```

Space:

```text
연구
```

결과가 Tasks Module의 List와 혼동되지 않게 icon/label로 구분한다.

---

# 10.17 Search Result 클릭 동작

### Task

현재 검색 UI를 닫고 Task의 canonical 위치로 이동한 뒤 Drawer를 연다.

예:

```text
Task belongs to ABM 연구
↓
/list/lst_abm?task=tsk_123
```

### List

```text
/list/:id
```

### Folder

```text
/folder/:id
```

### Tag

```text
/tag/:id
```

### Filter

```text
/filter/:id
```

### Space

```text
/spaces/:id
```

### Project

현재 Spaces 구조의 canonical Project URL로 이동.

---

# 10.18 Task 검색 결과의 Context 유지 여부

두 전략:

### A. 현재 화면에서 Drawer만 연기

장점:
- 현재 Context 유지

단점:
- 검색 Task가 현재 Scope에 없으면 Main과 Drawer가 모순됨

### B. Task canonical location으로 이동 후 Drawer 열기

### 권장

**B를 사용한다.**

§5에서 정한 URL/Scope consistency 원칙을 유지한다.

---

# 10.19 Search Page

Palette에서:

```text
모든 결과 보기
```

또는 Enter를 통해 Full Search Page로 이동할 수 있다.

URL:

```text
/search?q=ABM
```

Full Search는 Main Workbench Shell 안에서 열린다.

---

# 10.20 Search Page 구조

```text
검색

[ ABM                                      ]

전체   작업   리스트   태그   프로젝트   공간

──────────────────────────────────────────

작업 12
...

리스트 2
...

태그 1
...
```

검색 결과가 많을 때 type filter를 제공한다.

---

# 10.21 Search Query URL

검색어는 URL에 저장한다.

```text
/search?q=ABM
```

이유:

```text
새로고침
뒤로가기
링크 공유
```

가 의미 있기 때문이다.

---

# 10.22 Search Page Filter URL

MVP에서는 검색 type filter를 local state로 둘 수 있다.

향후 공유 가치가 있다면:

```text
/search?q=ABM&type=task
```

로 확장 가능.

### 권장 MVP

`q`만 URL에 넣는다.

---

# 10.23 Palette 입력은 URL에 넣지 않음

Quick Palette에서 타이핑 중인 query는 일시적 UI state다.

따라서:

```text
URL unchanged
```

Full Search Page로 전환할 때만 `/search?q=`를 만든다.

---

# 10.24 Search Query Debounce

입력마다 서버 요청을 보내지 않는다.

권장:

```text
local index search → 즉시
remote/full-text search → 150~300ms debounce
```

MVP에서 데이터가 적다면 client-side search만으로 시작할 수도 있다.

---

# 10.25 검색 Match 우선순위

기본 ranking:

```text
1. exact title/name match
2. prefix match
3. substring match
4. fuzzy match
5. description/content match
```

Task title과 List name은 Description보다 우선한다.

---

# 10.26 Fuzzy Search

오타 허용은 사용성이 좋다.

예:

```text
"에이비엠"
"abm"
```

같은 완전한 의미 변환까지 할 필요는 없지만:

```text
"profesor" → "professor"
```

수준의 typo tolerance는 향후 고려 가능.

### 권장

MVP:

```text
case-insensitive substring + prefix
```

P1:

```text
fuzzy matching
```

---

# 10.27 한국어 검색

한글 검색은 최소 다음을 제대로 지원해야 한다.

```text
완성형 문자열 검색
공백 무시 여부
대소문자 무관 영문 혼합
```

초성 검색:

```text
ㄱㅅ → 교수
```

은 편리하지만 MVP 필수 기능은 아니다.

P1 이후 검토.

---

# 10.28 Search 대상 필드

### Task

MVP:

```text
title
```

P1:

```text
description
subtask title
```

### List / Tag / Folder / Project / Space

```text
name
```

Attachment 본문, Activity log는 검색 대상에서 제외한다.

---

# 10.29 완료 Task 검색

기본 Palette에서는 미완료 Task를 우선한다.

완료 Task도 결과에 포함할 수 있으나:

```text
완료됨
```

label을 명확히 표시한다.

### 권장

미완료 Task → 상단
완료 Task → 하단 또는 lower rank

---

# 10.30 Trash 검색

일반 전역 Search에서는 Trash Task를 제외한다.

Trash Task는 `/trash` 안에서 별도 검색 기능을 향후 제공할 수 있다.

---

# 10.31 권한/Scope

검색 결과는 사용자가 접근 가능한 데이터만 포함한다.

공유 Workspace 환경에서는 서버 search도 권한 필터를 반드시 적용한다.

Client UI에서 숨기는 것만으로 보안을 구현하지 않는다.

---

# 10.32 Command Palette — Command 종류

Command는 Search Result와 별도 type이다.

최소 명령:

```text
새 작업 만들기
오늘로 이동
다음 7일로 이동
기본함 열기
새 리스트 만들기
새 태그 만들기
검색 열기
설정 열기
```

Scope Context가 있을 때:

```text
Board로 보기
List로 보기
완료 작업 표시
현재 List 이름 변경
```

등을 추가할 수 있다.

---

# 10.33 Command 실행 원칙

Command를 실행하면 결과가 예측 가능해야 한다.

예:

```text
"새 작업 만들기"
→ Global Quick Add

"오늘로 이동"
→ /today

"Board로 보기"
→ 현재 Scope가 Board 지원 시 ?view=board
```

실행 불가능한 Command는 결과에서 숨긴다.

---

# 10.34 Context-aware Command

현재 Scope를 알면 관련 명령을 우선 제공한다.

예:

현재:

```text
/list/lst_abm
```

이면:

```text
이 리스트에 작업 추가
Board로 보기
완료 작업 표시
리스트 이름 변경
```

현재:

```text
/today
```

이면:

```text
오늘에 작업 추가
완료된 오늘 작업 표시
```

---

# 10.35 Command Search Prefix

명령을 명확히 찾고 싶은 사용자를 위해 향후 prefix를 지원할 수 있다.

예:

```text
> board
> new task
```

또는:

```text
/
```

### 권장 MVP

특수 prefix 없이 일반 입력 안에서 command도 검색.

P1 이후 `>` prefix 지원 가능.

---

# 10.36 Search와 Command 결과 섞기

입력:

```text
"today"
```

결과:

```text
이동
  오늘로 이동

작업
  Today 발표 자료 정리
```

처럼 그룹을 구분한다.

Command와 Search entity를 같은 스타일로 완전히 섞지 않는다.

---

# 10.37 Keyboard Navigation

Palette 기본:

```text
↑ / ↓     결과 이동
Enter     선택/실행
Esc       닫기
Tab       필요 시 group/action 이동
```

검색 input focus를 유지하면서 Arrow로 results를 탐색한다.

---

# 10.38 첫 결과 자동 선택

검색 결과가 생기면 첫 항목을 기본 active 상태로 둘 수 있다.

Enter:

```text
active result 실행
```

다만 사용자가 단순히 검색어 줄바꿈을 기대하지 않으므로 Search input은 single-line로 유지한다.

---

# 10.39 Group Header는 선택 불가

```text
작업
리스트
태그
```

같은 Group Header는 keyboard selection 대상이 아니다.

실제 결과만 navigation index에 포함한다.

---

# 10.40 Esc 동작

§9의 Layer 우선순위 적용:

```text
Palette 안 Popover가 있으면 Popover 닫기
그 외 → Palette 닫기
```

Palette를 닫아도 현재 Main Scope는 변하지 않는다.

---

# 10.41 Palette에서 Quick Add

검색어가 아무 결과와 일치하지 않을 때:

```text
"ABM 결과 표 정리"
```

를 입력한 상태에서:

```text
+ "ABM 결과 표 정리" 작업 만들기
```

Action을 하단에 제공할 수 있다.

### 권장

지원한다.

실행:

```text
Global Quick Add
title = 현재 입력
owner = Inbox
```

즉 Search에서 Capture로 자연스럽게 연결한다.

---

# 10.42 검색어를 Task title로 전달

검색 → 새 Task Flow:

```text
Palette query
↓
Create Task command
↓
Quick Add title prefilled
```

바로 자동 생성하지 않는다.

사용자는 날짜/List 등을 확인할 수 있어야 한다.

---

# 10.43 최근 항목

Palette query가 비어 있을 때 최근 항목을 표시한다.

저장 후보:

```text
최근 Scope 5개
최근 Task 5개
```

동일 항목은 중복 제거.

---

# 10.44 최근 항목 저장 위치

최근 항목은 navigation history 전체와 동일하지 않다.

사용자별 local/session preference로 저장할 수 있다.

공유 필요가 없으므로 URL/서버 동기화는 MVP 필수가 아니다.

---

# 10.45 최근 검색어

Full Search에서는 최근 검색어를 제공할 수 있다.

다만 개인 Task title 검색은 민감할 수 있으므로 최근 검색어를 지나치게 오래 저장하지 않는다.

### 권장 MVP

Palette에는 최근 검색어 대신 **최근 항목**만 표시.

검색어 history 저장은 제외.

---

# 10.46 Search Empty State

Palette:

```text
검색 결과가 없습니다.

+ "입력 내용" 작업 만들기
```

Full Search:

```text
"ABM2"에 대한 결과가 없습니다.

다른 검색어를 사용해보세요.
```

---

# 10.47 Search Loading

Palette는 input을 즉시 사용할 수 있어야 한다.

결과 fetch 중:

```text
작은 loading indicator
```

만 표시.

Overlay 전체를 Skeleton으로 바꾸지 않는다.

---

# 10.48 Search Error

Remote Search 실패:

```text
검색 결과를 불러오지 못했습니다.
[다시 시도]
```

최근 항목/로컬 검색 결과는 가능하면 계속 보여준다.

---

# 10.49 검색 결과 제한

Palette는 빠른 탐색이 목적이므로 그룹별 결과 수를 제한한다.

예:

```text
Task 최대 5
List 최대 3
Tag 최대 3
Project 최대 3
Space 최대 3
Command 최대 5
```

더 많은 결과:

```text
모든 결과 보기
```

→ Full Search.

---

# 10.50 Full Search Pagination

결과가 많아지면:

```text
pagination
또는
infinite scroll
```

가능.

### 권장

초기에는 최대 N개 결과 + `더 보기`.

Task 수가 커지면 cursor pagination으로 확장.

---

# 10.51 검색 결과 Count

Full Search에서만 그룹별 Count를 표시한다.

예:

```text
작업 12
리스트 2
태그 1
```

Palette에서는 Count보다 빠른 탐색을 우선한다.

---

# 10.52 Search Result Highlight

검색어 일치 부분을 Bold 등으로 강조할 수 있다.

예:

```text
ABM 연구 결과 정리
```

하지만 Highlight 때문에 Text 색이 지나치게 복잡해지지 않게 한다.

---

# 10.53 현재 Scope 우선 Ranking

같은 score라면 현재 Context와 가까운 결과를 약간 우선할 수 있다.

예:

현재:

```text
Space: 연구
```

검색:

```text
결과
```

이면 같은 Space/Project 내 Task를 약간 우선.

### 권장

MVP에서는 적용하지 않아도 된다.

P1 Ranking 개선으로 둔다.

---

# 10.54 Search Index Source

초기 앱 규모가 작으면:

```text
loaded entities
```

기반 client search 가능.

하지만 전체 Task/Project가 많아질 것을 고려하면 search API boundary를 둔다.

예:

```text
searchAll(query, filters)
```

UI는 client/server 구현 세부사항에 의존하지 않는다.

---

# 10.55 Search Result 타입

개념:

```text
SearchResult =
  TaskResult
  ListResult
  TagResult
  FolderResult
  FilterResult
  ProjectResult
  SpaceResult
  CommandResult
```

모든 결과에 공통:

```text
id
type
title
subtitle?
icon
action
score
```

를 둘 수 있다.

---

# 10.56 Command Registry

명령도 화면마다 하드코딩하지 않는다.

공통 Registry:

```text
Command
├─ id
├─ label
├─ keywords
├─ when(context)
├─ execute(context)
└─ shortcut?
```

예:

```text
command.openToday
command.createTask
command.changeToBoard
```

---

# 10.57 Command `when`

예:

```text
Board로 보기
```

는:

```text
current scope supports board
AND current view != board
```

일 때만 표시.

사용할 수 없는 command를 disabled로 잔뜩 보여주지 않는다.

---

# 10.58 Search Result 실행과 History

Entity 이동은 §5 Navigation 정책을 따른다.

```text
List click → pushState
Tag click → pushState
Task result → canonical scope + task param push
```

Command도 navigation이면 같은 navigate API를 사용한다.

---

# 10.59 Search Page Back

예:

```text
/list/A
↓ Search
/search?q=ABM
↓ Task click
/list/B?task=1
```

Back:

```text
/search?q=ABM
```

로 돌아갈 수 있어야 한다.

검색 query가 URL에 있기 때문에 결과 화면을 복원 가능.

---

# 10.60 Palette 실행 후 History

Palette 자체는 URL state가 아니므로 Back history에 추가하지 않는다.

Palette에서 List를 선택하면:

```text
현재 URL
↓ push target URL
```

만 추가.

---

# 10.61 Task Result와 Drawer History

Palette에서 Task를 선택:

```text
/list/B?task=1
```

로 한 번에 navigation.

이 경우 Back은 이전 실제 화면으로 돌아간다.

Task Drawer만 닫는 중간 history entry를 만들 필요는 없다.

왜냐하면 Task open 이전의 canonical List B 화면을 사용자가 실제로 방문한 적이 없기 때문이다.

---

# 10.62 Search Page Task 클릭의 History

Full Search에서는:

```text
/search?q=ABM
↓
/list/B?task=1
```

push.

Back:

```text
/search?q=ABM
```

으로 돌아간다.

---

# 10.63 Search에서 Completed Task 열기

완료 Task 검색 결과:

```text
Task title
완료됨 · ABM 연구
```

클릭 시 원래 List의 Drawer로 열 수 있다.

§5의 completed deep link 규칙을 따른다.

---

# 10.64 Search에서 Trash 제외

Trash는 전역 Search 결과에서 제외한다.

사용자가 삭제 Task를 찾고 싶으면 Trash View를 사용한다.

이 규칙을 Search API 자체에서 적용한다.

---

# 10.65 Search와 Sidebar Search icon

Rail에 Search icon이 있으므로 Sidebar에 별도 큰 Search field를 상시 노출하지 않는 것을 권장한다.

TickTick처럼 화면을 가볍게 유지한다.

단 Sidebar 상단에 작은 search affordance를 추가하는 것은 향후 사용성 테스트 후 결정 가능.

---

# 10.66 Search와 Header

각 Scope Header에 검색창을 반복 배치하지 않는다.

Search는 전역 기능으로 통일한다.

List 내부 전용 filtering이 필요하면:

```text
현재 결과 필터
```

라는 별도 기능으로 정의한다.

---

# 10.67 Global Search와 Current View Filter 구분

둘을 혼동하지 않는다.

### Global Search

앱 전체 entity 탐색.

### Current View Filter

현재 List/Scope 안에서 보이는 Task만 좁힘.

Current View Filter는 향후:

```text
Filter icon
```

으로 별도 제공 가능.

---

# 10.68 검색 Shortcut 표시

Tooltip이나 Palette empty state에서 shortcut을 알려줄 수 있다.

예:

```text
검색  ⌘K
```

사용자가 Keyboard flow를 자연스럽게 학습하게 한다.

---

# 10.69 Mobile Search

`< 768px`에서 Search는 **full-screen Search surface**로 표시한다.

```text
┌─────────────────────────────┐
│ ← 검색                      │
│ [ 검색어 입력...          ] │
├─────────────────────────────┤
│ 최근                        │
│ ...                         │
│                             │
│ 작업                        │
│ ...                         │
└─────────────────────────────┘
```

Mobile Bottom Navigation에서 Search를 선택하면 `/search` route로 이동하고 Search item이 selected state가 된다.

규칙:

```text
- 진입 시 input focus
- keyboard가 열려도 search field는 상단 고정
- 결과 목록만 독립 scroll
- Task 결과 open → 기존 canonical Task URL / Detail semantics 사용
- orientation/breakpoint 전환 시 query와 selection을 보존
- mobile presentation 때문에 별도 search data model을 만들지 않음
```

Command 기능은 같은 결과 그룹을 재사용할 수 있으나, touch 화면에서 keyboard shortcut 표시는 우선순위를 낮춘다.

세부 Responsive 규칙은 §15.27을 따른다.

---

# 10.70 Accessibility

필수:

```text
- Palette open 시 input focus
- 결과에 role=option 등 적절한 semantics
- Arrow keyboard 이동
- Active descendant 명확
- 결과 type을 screen reader가 알 수 있게 label
- Esc 닫기
- Color만으로 result type 구분 금지
```

---

# 10.71 Analytics

필요 시:

```text
search_opened
search_query_submitted
search_result_opened
command_executed
search_to_quick_add
```

를 기록할 수 있다.

검색어 원문이나 Task title을 analytics payload로 전송하지 않는 것을 기본으로 한다.

---

# 10.72 Search에서 피해야 할 설계

### ① Task만 검색

앱이 커질수록 Navigation 탐색 비용이 남는다.

### ② Search와 Command를 완전히 동일한 결과 type으로 취급

실행 의미가 모호해진다.

### ③ 검색 결과 Task를 현재 Scope에 억지로 Drawer만 열기

Main과 Drawer scope가 모순될 수 있다.

### ④ Palette typing을 URL에 매 입력마다 반영

history와 URL이 불필요하게 흔들린다.

### ⑤ 완료/Trash 결과를 미완료 Task와 같은 우선순위로 섞기

검색 결과의 실행성을 떨어뜨린다.

### ⑥ Palette에 너무 많은 결과 표시

빠른 탐색 목적이 사라진다.

### ⑦ 입력할 때마다 blocking spinner

검색이 느리게 느껴진다.

### ⑧ Command를 화면 component마다 하드코딩

명령 의미와 shortcut이 제각각이 된다.

---

# 10.73 Palette 와이어프레임 — 기본

```text
┌───────────────────────────────────────────────────────────┐
│ 🔍 검색하거나 명령을 입력하세요...                       │
├───────────────────────────────────────────────────────────┤
│ 최근                                                      │
│                                                           │
│  ▣ ABM 연구                              리스트           │
│  ✓ 교수님께 결과 전달                    작업             │
│  ◉ 오늘                                 스마트 목록       │
│                                                           │
│ 명령                                                      │
│                                                           │
│  + 새 작업 만들기                                         │
│  → 기본함 열기                                            │
└───────────────────────────────────────────────────────────┘
```

---

# 10.74 Palette 와이어프레임 — 검색

```text
┌───────────────────────────────────────────────────────────┐
│ 🔍 ABM                                                   │
├───────────────────────────────────────────────────────────┤
│ 작업                                                      │
│  교수님께 ABM 결과 전달                 ABM 연구 · 오늘    │
│  ABM 시뮬레이션 확인                    ABM 연구           │
│                                                           │
│ 리스트                                                    │
│  ABM 연구                              학교              │
│                                                           │
│ 태그                                                      │
│  #ABM                                  작업 4개           │
│                                                           │
│ 명령                                                      │
│  + "ABM" 작업 만들기                                      │
│                                                           │
│                            모든 결과 보기                  │
└───────────────────────────────────────────────────────────┘
```

---

# 10.75 Full Search 와이어프레임

```text
검색

┌──────────────────────────────────────────────────────────┐
│ ABM                                                      │
└──────────────────────────────────────────────────────────┘

전체   작업   리스트   태그   프로젝트   공간

───────────────────────────────────────────────────────────

작업 12

□ 교수님께 ABM 결과 전달
  ABM 연구 · 오늘

□ ABM 시뮬레이션 확인
  ABM 연구

───────────────────────────────────────────────────────────

리스트 2

ABM 연구
학교
```

---

# 10.76 Command Registry 예시

```text
새 작업 만들기
keywords: task, add, new, 작업, 추가
action: openGlobalQuickAdd

오늘로 이동
keywords: today, 오늘
action: navigate('/today')

기본함 열기
keywords: inbox, 기본함
action: navigate('/inbox')

Board로 보기
when: currentScope supports board && view != board
action: setView('board')

List로 보기
when: view != list
action: setView('list')
```

---

# 10.77 Acceptance Criteria

### S10-1
Search icon과 Keyboard shortcut이 같은 Palette를 연다.

### S10-2
Palette open 시 Search input이 즉시 focus된다.

### S10-3
검색 대상에는 최소 Task/List/Tag/Folder/Filter/Project/Space가 포함된다.

### S10-4
검색 결과는 type별 그룹으로 표시된다.

### S10-5
Task 검색 결과에는 List와 핵심 metadata가 표시된다.

### S10-6
Task 선택 시 canonical Task 위치로 이동한 뒤 Drawer가 열린다.

### S10-7
List/Tag/Folder/Filter/Space/Project 결과는 해당 Scope로 이동한다.

### S10-8
Palette query는 URL에 저장되지 않는다.

### S10-9
Full Search query는 `/search?q=`에 저장된다.

### S10-10
검색어 없는 Palette에는 최근 항목과 주요 Command를 보여준다.

### S10-11
Arrow + Enter + Esc만으로 Palette를 사용할 수 있다.

### S10-12
검색 결과가 없으면 현재 query를 Quick Add title로 넘길 수 있다.

### S10-13
Trash Task는 전역 검색에서 제외된다.

### S10-14
완료 Task는 검색 가능하지만 미완료보다 낮은 우선순위로 표시된다.

### S10-15
Palette는 그룹별 결과 수를 제한하고 Full Search 진입점을 제공한다.

### S10-16
Command는 Registry 기반으로 관리하고 현재 Context에 맞는 항목만 노출한다.

### S10-17
Palette open/close는 browser history에 entry를 만들지 않는다.

### S10-18
Full Search → Result 이동 → Back 시 검색 query와 결과 화면이 복원된다.

### S10-19
Search input 중 서버 요청은 debounce되며 input 자체는 block되지 않는다.

### S10-20
검색 결과 실행은 기존 §5 navigation API를 재사용한다.

---

# 10.78 §10 확정 결정

- **S10-D1.** 전역 Search와 Command Palette는 하나의 진입 Overlay를 공유한다.
- **S10-D2.** Search entity와 Command는 내부적으로 다른 result type으로 관리한다.
- **S10-D3.** 빠른 Palette와 Full Search Page를 분리한다.
- **S10-D4.** Palette query는 URL에 넣지 않고 Full Search query만 `/search?q=`로 저장한다.
- **S10-D5.** 검색 대상은 Task뿐 아니라 List/Tag/Folder/Filter/Project/Space까지 포함한다.
- **S10-D6.** 검색 결과는 type별 Grouping을 사용한다.
- **S10-D7.** Task 검색 결과는 canonical owner Scope로 이동한 뒤 Drawer를 연다.
- **S10-D8.** Palette empty state는 최근 항목 + 주요 Command 중심으로 구성한다.
- **S10-D9.** Palette 결과 수는 제한하고 `모든 결과 보기`로 Full Search에 연결한다.
- **S10-D10.** Search 결과가 없을 때 현재 입력을 Global Quick Add title로 넘길 수 있게 한다.
- **S10-D11.** 미완료 Task를 검색 우선하고 완료 Task는 lower rank로 포함한다.
- **S10-D12.** Trash Task는 전역 Search에서 제외한다.
- **S10-D13.** MVP 검색은 title/name 중심의 prefix/substring search로 시작하고 fuzzy/초성 검색은 P1 이후로 둔다.
- **S10-D14.** Command는 공통 Registry로 관리한다.
- **S10-D15.** Context에서 실행할 수 없는 Command는 disabled로 쌓지 않고 결과에서 숨긴다.
- **S10-D16.** Palette는 Keyboard-first UX를 기본으로 한다.
- **S10-D17.** Palette 자체는 Navigation State가 아니므로 Browser History에 남기지 않는다.
- **S10-D18.** Full Search는 Navigation State이며 Back/Forward/Refresh에서 복원한다.
- **S10-D19.** Global Search와 Current View Filter는 서로 다른 기능으로 정의한다.
- **S10-D20.** 검색/Command 실행은 기존 Navigation, Quick Add, Domain Command를 재사용하고 별도 중복 로직을 만들지 않는다.

---

---

# 11. Visual System / 밀도 / 간격 / Typography / Color / Icon / 상태 표현

## 11.1 목적

§11의 목적은 지금까지 확정한 구조와 상호작용을 실제 화면에서 **TickTick처럼 가볍고 조밀하며 빠르게 읽히는 시각 시스템**으로 통일하는 것이다.

이 단계에서는 기능을 추가하지 않는다.

대신 다음을 확정한다.

```text
- 화면 영역별 폭과 높이
- Row / Card 밀도
- 여백 체계
- Typography 계층
- Divider / Border / Surface
- Hover / Selected / Focus 상태
- List color / Priority / Overdue 표현
- Icon 크기와 위치
- Border radius
- Shadow
- Drawer 시각 구조
- Light / Dark mode의 기본 원칙
```

핵심 원칙:

> UI가 예뻐 보이는 것보다 많은 Task를 빠르게 훑고 바로 조작할 수 있는 것이 우선이다.

또 하나의 핵심 원칙:

> TickTick처럼 보이기 위해 Card와 Box를 늘리지 않는다. 오히려 Border와 Surface를 줄이고 Typography, spacing, alignment로 구조를 만든다.

---

# 11.2 전체 Visual Direction

전체 인상은 다음 키워드를 따른다.

```text
Compact
Calm
Flat
Fast
Readable
Low-noise
```

즉 피해야 할 방향은:

```text
대시보드형 큰 카드
과도한 그림자
두꺼운 Border
큰 Heading
넓은 여백
과도한 Gradient
색상 Badge 남발
```

이다.

---

# 11.3 기본 화면 Grid

Desktop 기본 구조:

```text
┌──────┬──────────────────────┬─────────────────────────────────────┐
│ Rail │ Sidebar              │ Main                                │
│ 52px │ 240px                │ flexible                            │
└──────┴──────────────────────┴─────────────────────────────────────┘
```

Detail Drawer open:

```text
┌──────┬──────────────────────┬──────────────────────┬──────────────┐
│ Rail │ Sidebar              │ Main                 │ Drawer       │
│ 52px │ 240px                │ flexible             │ 400px        │
└──────┴──────────────────────┴──────────────────────┴──────────────┘
```

기본 권장:

```text
Rail: 52px
Sidebar: 240px
Drawer: 400px
Main min usable width: 560px 이상 권장
```

---

# 11.4 Rail Visual

Rail은 Sidebar보다 더 진한 Navigation zone으로 만들 필요는 없다.

권장:

```text
background: app base 또는 아주 약한 secondary surface
border-right: 1px subtle divider
```

Rail icon은:

```text
size: 18~20px
button hit area: 36~40px
```

정도로 한다.

아이콘 버튼 자체를 둥근 Card처럼 만들지 않는다.

---

# 11.5 Rail Item 높이

권장:

```text
button: 36px
vertical gap: 4~6px
```

Selected:

```text
soft rounded background
```

를 사용한다.

큰 Pill 형태는 피한다.

---

# 11.6 Sidebar Visual

Sidebar는 TickTick처럼 정보 밀도가 높은 목록형 Navigation으로 만든다.

권장:

```text
background: base보다 아주 약한 secondary surface
border-right: 1px subtle divider
```

각 Row마다 Border를 두지 않는다.

섹션 간에만 spacing과 약한 Divider를 사용한다.

---

# 11.7 Sidebar Row 높이

최종 기본값:

```text
36px
```

허용:

```text
34~38px
```

Smart List / List / Tag / Filter 모두 같은 기본 Row rhythm을 유지한다.

---

# 11.8 Sidebar Horizontal Padding

권장:

```text
left/right: 10~12px
```

Folder child List:

```text
additional indent: 18px
```

너무 깊은 들여쓰기를 만들지 않는다.

---

# 11.9 Sidebar Section 간격

권장:

```text
section top margin: 14~18px
section header bottom: 4~6px
```

큰 빈 여백 대신 작고 일정한 rhythm을 유지한다.

---

# 11.10 Sidebar Section Header

예:

```text
리스트                         +
```

Typography:

```text
font-size: 12~13px
font-weight: 600
```

본문 Navigation Row보다 조금 작되 의미상 구분될 정도만 차이를 둔다.

Uppercase 영문 heading을 강제하지 않는다.

---

# 11.11 Main Content Padding

Desktop Main 기본:

```text
horizontal: 28~36px
top: 20~28px
bottom: 32px
```

권장:

```text
32px horizontal
24px top
```

TickTick처럼 Main Content는 Sidebar보다 여유를 주되 Dashboard 수준으로 넓게 두지 않는다.

---

# 11.12 Main 최대 폭

List View는 화면 전체 폭으로 텍스트가 길게 늘어지면 스캔이 어렵다.

권장:

```text
List content readable max width: 900~1100px
```

단 Board는 가로 폭 전체를 사용한다.

즉:

```text
List = readable width 중심
Board = workspace width 전체
```

---

# 11.13 Main Header 높이

Header 전체 블록:

```text
56~72px
```

권장:

```text
64px
```

여기에:

```text
Title
Subtitle / count
Actions
```

를 넣는다.

큰 Hero Header는 사용하지 않는다.

---

# 11.14 Main Title Typography

권장:

```text
font-size: 20~24px
font-weight: 600~700
line-height: 1.3
```

기본:

```text
22px / 600
```

정도를 권장한다.

TickTick형 작업 화면에서는 30px 이상의 큰 제목은 과하다.

---

# 11.15 Main Subtitle / Count

예:

```text
미완료 7 · 완료 3
```

권장:

```text
font-size: 12~13px
font-weight: 400~500
secondary text color
```

Title보다 명확히 약하게 표시한다.

---

# 11.16 View Toolbar

List / Board tab:

```text
List   Board
```

권장:

```text
height: 36~40px
font-size: 13px
```

Selected tab는:

```text
text emphasis
+ 2px underline 또는 subtle background
```

둘 중 하나만 사용한다.

큰 Segmented Control처럼 만들지 않는 것을 기본으로 한다.

---

# 11.17 Typography Scale

앱 전체 Typography를 작은 계층으로 제한한다.

권장:

```text
XS   11px   보조 Count / tiny metadata
SM   12px   metadata / section label
MD   13px   sidebar / secondary text
BASE 14px   Task title / 일반 UI
LG   16px   Drawer section title / 강조
XL   22px   Main title
```

너무 많은 font size token을 만들지 않는다.

---

# 11.18 기본 글꼴

시스템 UI font stack을 기본으로 한다.

예:

```text
system-ui
-apple-system
BlinkMacSystemFont
"Segoe UI"
"Apple SD Gothic Neo"
"Noto Sans KR"
sans-serif
```

별도 브랜드 Font 때문에 초기 로딩이나 가독성이 나빠지지 않게 한다.

---

# 11.19 Task List Row 높이

기본 Row:

```text
48px
```

metadata 두 줄형:

```text
56px
```

최대:

```text
60px
```

Task 하나가 Card처럼 두껍게 보이지 않게 한다.

---

# 11.20 Task Row 내부 배치

권장:

```text
[Checkbox] [Title + metadata]           [Date] [...]
```

Checkbox와 Title 사이:

```text
8~10px
```

Title과 metadata:

```text
2~4px
```

정도로 유지한다.

---

# 11.21 Task Title Typography

권장:

```text
font-size: 14px
font-weight: 400~500
line-height: 1.4
```

기본 Task title을 Bold로 남발하지 않는다.

Priority가 높다고 Title을 과도하게 굵게 만들지 않는다.

---

# 11.22 Task Metadata Typography

예:

```text
ABM 연구 · #중요
```

권장:

```text
font-size: 11~12px
secondary text
```

Task title보다 시각 우선순위가 낮아야 한다.

---

# 11.23 Board Column 폭

§3의 기본값을 시각 시스템에서 확정:

```text
default: 300px
min: 280px
max: 340px
gap: 16px
```

Column 수가 많아지면 Main 전체 가로 Scroll.

---

# 11.24 Board Column Header

권장:

```text
height: 36~40px
font-size: 13px
font-weight: 600
```

Count:

```text
11~12px
secondary
```

예:

```text
미분류  3
```

---

# 11.25 Board Card 크기

기본:

```text
min-height: 68px
padding: 10~12px
```

정보가 많아도:

```text
90~110px
```

를 자주 넘지 않게 한다.

Task Detail을 Board Card에 다 넣지 않는다.

---

# 11.26 Board Card Radius

권장:

```text
6~8px
```

기본:

```text
8px
```

과도한 16~20px round card는 피한다.

---

# 11.27 Board Card Border

권장:

```text
1px subtle border
```

또는 surface contrast만으로 구분.

그림자를 기본 상태에서 강하게 사용하지 않는다.

Hover 시 아주 약한 elevation 가능.

---

# 11.28 Shadow 사용

Shadow를 제한적으로 사용한다.

사용:

```text
Popover
Context Menu
Palette
Modal
Dragging preview
```

비사용 또는 최소:

```text
Sidebar
Task Row
Board Column
Main Header
일반 Card
```

---

# 11.29 Divider

Divider는 구조 분리에만 사용한다.

예:

```text
Rail | Sidebar
Sidebar | Main
Drawer boundary
Section separation
```

권장:

```text
1px
low contrast
```

Task Row마다 divider를 넣을 경우 매우 약하게 한다.

---

# 11.30 Surface 계층

Light mode 개념:

```text
Surface 0 = app background
Surface 1 = sidebar / panel
Surface 2 = hover / selected
Surface 3 = popover / modal
```

4단계 이상 Surface 체계를 만들지 않는다.

---

# 11.31 Color 사용 원칙

색상은 의미가 있을 때만 사용한다.

사용:

```text
List color
Priority
Overdue
Selected accent
Success / Error
Tag optional color
```

비사용:

```text
각 Section마다 임의 색
모든 Badge에 랜덤 색
각 Main Card마다 다른 배경
```

---

# 11.32 Accent Color

앱 Primary Accent는 하나만 사용한다.

활용:

```text
Selected navigation
Focus
Primary action
Checkbox completed state
Active view
```

너무 많은 UI 요소에 Primary color를 쓰지 않는다.

---

# 11.33 List Color Dot

List color는 작은 Dot으로 사용한다.

권장:

```text
diameter: 6~8px
```

Sidebar:

```text
● ABM 연구
```

Task metadata에서도 필요할 때 같은 색을 재사용.

색 자체만으로 List를 식별하게 하지 않고 name을 항상 함께 제공한다.

---

# 11.34 Tag Color

Tag는 기본적으로 Text label 위주.

색상은 optional.

TickTick처럼 작은 color marker 또는 낮은 채도의 background를 사용할 수 있으나 모든 Tag를 강한 Pill로 만들지 않는다.

---

# 11.35 Priority 표현

Priority는 단계에 따라 과도한 색 면적을 사용하지 않는다.

권장:

```text
High   Flag/icon accent
Medium Flag/icon accent
Low    Flag/icon subtle
None   icon hidden 또는 neutral
```

Task Card 전체 background를 priority 색으로 칠하지 않는다.

---

# 11.36 Overdue 표현

Overdue는 날짜 Text 자체를 강조한다.

예:

```text
어제
8월 17일
```

을 warning/error semantic color로 표시.

Task 전체 Row를 붉게 칠하지 않는다.

---

# 11.37 Completed 표현

완료 Task:

```text
Checkbox checked
Title line-through 또는 opacity 감소
```

둘 다 너무 강하게 쓰지 않는다.

권장:

```text
line-through
+ secondary text
```

완료된 Task 내용을 읽을 수 있어야 한다.

---

# 11.38 Checkbox 크기

권장:

```text
visual size: 16~18px
hit area: 28~32px
```

작아 보이지만 클릭/터치 영역은 넉넉하게 확보한다.

---

# 11.39 Checkbox Style

기본:

```text
circle 또는 rounded square
```

중 하나로 앱 전체 통일.

TickTick 느낌을 원하면 circle 계열을 고려할 수 있다.

완료 시 Accent Color + Check.

---

# 11.40 Icon Size System

권장 token:

```text
Small: 14px
Default: 16px
Nav: 18px
Large: 20px
```

24px 이상 icon은 제한적으로만 사용한다.

---

# 11.41 Icon Stroke

한 icon library/스타일만 사용한다.

예:

```text
outline icon
consistent stroke width
```

Filled icon과 outline icon을 무작위로 섞지 않는다.

---

# 11.42 More Button

`...` hit area:

```text
28~32px
```

icon 자체는:

```text
16px
```

Hover에서만 노출하더라도 위치를 고정해 layout shift를 막는다.

---

# 11.43 Hover Visual

Task Row:

```text
background: subtle surface
```

Board Card:

```text
border/elevation 아주 약한 증가
```

Sidebar Row:

```text
background: subtle
```

Hover 때문에 Text color까지 크게 바꾸지 않는다.

---

# 11.44 Selected Visual

Selected는 Hover보다 한 단계 강해야 한다.

Sidebar:

```text
soft accent-tinted background
```

Task open:

```text
soft selected background
또는 왼쪽 2px indicator
```

둘 중 하나를 중심으로 사용한다.

---

# 11.45 Focus Visual

Keyboard Focus:

```text
2px focus ring
```

권장.

Hover/Selected와 동시에 보여도 구분되어야 한다.

Focus ring을 `outline: none`으로 제거하지 않는다.

---

# 11.46 Dragging Visual

Dragging:

```text
원본 opacity 감소
drag preview shadow
drop target indicator
```

색상을 과도하게 사용하지 않는다.

---

# 11.47 Empty State Visual

TickTick처럼 가볍게 유지한다.

구성:

```text
짧은 문장
작은 secondary 설명
필요 시 + Action
```

큰 Illustration은 기본값으로 사용하지 않는다.

---

# 11.48 Loading Visual

Loading은 Skeleton 중심.

Task List:

```text
2~4개 skeleton row
```

Sidebar:

```text
shell 먼저
count 후속
```

전 화면에 Spinner 하나만 크게 띄우지 않는다.

---

# 11.49 Error Visual

Error는 해당 영역 안에서 작게 표시.

예:

```text
작업을 불러오지 못했습니다.
다시 시도
```

큰 red alert panel은 fatal 상태에서만 사용.

---

# 11.50 Toast Visual

권장:

```text
height: 40~48px
radius: 8px
padding: 12~16px
shadow: medium
```

내용:

```text
message                      action
```

한 줄 우선.

---

# 11.51 Popover Visual

Date/List/Tag Picker:

```text
radius: 8~10px
border: subtle
shadow: medium
padding: 8px
```

너무 큰 Modal처럼 보이지 않게 한다.

---

# 11.52 Command Palette Visual

Palette:

```text
width: 620px
radius: 10~12px
shadow: stronger than popover
border: subtle
```

Search input:

```text
height: 48~52px
font-size: 14~15px
```

결과 Row:

```text
40~44px
```

---

# 11.53 Detail Drawer Visual

Drawer는 Card가 아니라 **고정 Side Panel**처럼 보여야 한다.

권장:

```text
background: surface
border-left: 1px divider
shadow: none 또는 아주 약함
```

Drawer 자체를 떠 있는 Modal처럼 강하게 shadow 처리하지 않는다.

---

# 11.54 Drawer Header

권장:

```text
height: 52~60px
padding: 12~16px
sticky
```

Title area가 긴 경우 Header 전체 높이가 계속 늘어나지 않도록 한다.

긴 Title은 body 상단 영역으로 내려가는 방식도 가능.

---

# 11.55 Drawer Body Padding

권장:

```text
horizontal: 16px
vertical: 12~16px
```

Metadata Row는:

```text
36~40px
```

정도.

---

# 11.56 Drawer Section Divider

Subtasks / Notes / Attachment 사이:

```text
16~20px vertical gap
+ optional subtle divider
```

모든 섹션을 Card로 감싸지 않는다.

---

# 11.57 Quick Add Visual

Inline Quick Add는 현재 Task Row/Card와 자연스럽게 이어져야 한다.

List:

```text
Row 형태
```

Board:

```text
Card 형태
```

Global Quick Add:

```text
Palette/Popover 형태
```

동일 컴포넌트 구조를 context에 맞게 presentation만 바꾼다.

---

# 11.58 Quick Add 입력 높이

List Inline:

```text
44~48px
```

Global Quick Add:

```text
52~60px
```

큰 textarea로 시작하지 않는다.

---

# 11.59 Button Hierarchy

최소 세 단계:

```text
Primary
Secondary
Ghost/Icon
```

### Primary

정말 중요한 confirm/action.

### Secondary

보조 action.

### Ghost

Sidebar/Header/Task hover action.

Task management 앱에서는 Primary Button 남발을 피한다.

---

# 11.60 `+ 작업` Button

Main Header `+ 작업`은 너무 큰 CTA로 만들지 않는다.

권장:

```text
height: 32~36px
compact button
```

또는 icon + text.

화면에서 Task 자체보다 버튼이 더 눈에 띄면 안 된다.

---

# 11.61 Border Radius Scale

권장:

```text
4px  작은 chip / tiny control
6px  row button
8px  card / toast
10px popover
12px palette/modal
```

20px 이상 radius는 mobile sheet 등 특수 UI에만 사용.

---

# 11.62 Spacing Scale

권장 기본 spacing token:

```text
2
4
6
8
12
16
20
24
32
```

임의의 13px, 19px 같은 spacing을 남발하지 않는다.

---

# 11.63 Vertical Rhythm

Task List:

```text
Row 48px
Row gap 0~2px
```

Board:

```text
Card gap 8px
Column gap 16px
```

Sidebar:

```text
Row 36px
```

이 세 rhythm을 기본 축으로 사용한다.

---

# 11.64 Content Alignment

Main Header Title과 Task content 시작점은 같은 left axis에 맞춘다.

Board Column Header와 Card도 동일 left alignment.

아이콘 때문에 Text 시작점이 들쭉날쭉하지 않게 한다.

---

# 11.65 Number Alignment

Sidebar Count:

```text
right-aligned
```

고정 영역을 확보해 List 이름 길이에 따라 Count 위치가 흔들리지 않게 한다.

---

# 11.66 Long Text

Sidebar:

```text
single line ellipsis
```

Task title:

List Row에서는 기본 1줄, 필요 시 2줄까지 허용 가능.

Board Card:

```text
2줄 clamp
```

Drawer:

전체 Title 편집 가능.

---

# 11.67 Light Mode

Light mode는 전체 대비를 너무 강하게 만들지 않는다.

개념:

```text
Base background: near-white
Sidebar: subtle gray tint
Text primary: near-black
Text secondary: medium gray
Divider: low-contrast gray
```

완전 검정/완전 흰색만으로 구성하지 않는다.

---

# 11.68 Dark Mode

Dark mode는 단순히 Light 색을 반전하지 않는다.

권장 계층:

```text
Base
Sidebar/Panel
Hover
Selected
Popover
```

각 Surface가 구분되도록 최소 contrast를 확보한다.

---

# 11.69 Dark Mode에서 Color

Priority/List/Tag 색상은 Light와 동일 Hex를 그대로 사용하지 않을 수 있다.

Dark background에서 읽히도록 saturation/lightness를 조정한 semantic token을 사용한다.

---

# 11.70 Semantic Color Token

권장:

```text
textPrimary
textSecondary
textMuted

surfaceBase
surfacePanel
surfaceHover
surfaceSelected

borderSubtle
borderStrong

accent
danger
warning
success
```

실제 Hex 값은 구현 Theme에서 관리한다.

---

# 11.71 List/Tag Color Token과 Theme 분리

사용자 지정 List color는 Theme semantic token과 분리한다.

예:

```text
list.red
list.orange
list.yellow
list.green
list.blue
list.purple
```

Light/Dark에서 각각 대응값을 가진다.

---

# 11.72 Accessibility Contrast

텍스트/Background 대비는 WCAG를 고려한다.

특히:

```text
secondary text
disabled text
selected background
overdue text
```

가 너무 흐려지지 않게 한다.

---

# 11.73 Color에만 의미를 맡기지 않음

예:

Priority:

```text
색 + flag icon
```

Overdue:

```text
색 + 실제 날짜 text
```

Selected:

```text
background + optional indicator
```

Color blindness 환경에서도 의미를 알 수 있어야 한다.

---

# 11.74 Density Mode

향후 사용자 설정으로:

```text
Comfortable
Compact
```

를 지원할 수 있다.

하지만 MVP에서는 하나의 기본 density만 만든다.

### 권장 MVP

`Compact but readable`

즉 지금 문서의:

```text
Sidebar 36px
Task Row 48px
Board Card 68px+
```

를 기준으로 한다.

---

# 11.75 Responsive Density

Responsive Density의 최종 breakpoint와 component 전환은 §15를 따른다.

공간이 부족해질 때의 순서는 다음으로 고정한다.

```text
1. secondary metadata 축소/숨김
2. Header secondary action을 overflow로 이동
3. Drawer inline → overlay
4. Sidebar persistent → overlay
5. Rail → Mobile Bottom Navigation
```

Text size를 viewport에 맞춰 임의로 축소하지 않는다.

기본 density:

```text
Wide/Compact Desktop
- Sidebar row: 36px
- Task row: 48px

Tablet / coarse pointer
- visual row density는 유지하되 interactive hit target >= 44px

Mobile
- Task row: 52px 전후 허용
- icon visual size는 유지
- hit target만 44px 이상 확보
```

즉 Responsive는 글자를 작게 만들어 해결하지 않고 **Navigation chrome과 secondary information을 재배치**하여 해결한다.

---

# 11.76 Metadata 숨김 우선순위

좁아질 때 숨기는 순서:

```text
1. secondary Tag
2. subtask icon
3. List color marker
4. secondary metadata
```

유지:

```text
Checkbox
Title
Due date/critical state
```

---

# 11.77 TickTick 유사성을 위해 반드시 유지할 것

```text
- 얇은 Rail
- 조밀한 Sidebar
- 작은 Row
- 넓은 Main
- Task 제목 중심
- 작은 metadata
- 가벼운 Card
- Hover에서만 action 노출
- Color 사용 제한
- 큰 Dashboard card 없음
- Drawer context 유지
```

---

# 11.78 TickTick과 다르게 가져갈 수 있는 것

완전히 똑같은 Pixel copy를 목표로 하지 않는다.

다음은 현재 앱 구조에 맞게 조정 가능하다.

```text
- Spaces icon / Module
- List/Project 보조 정보
- Drawer field 수
- Board Section semantics
- Brand Accent color
- Typography font stack
```

즉 **Visual grammar는 TickTick에 가깝게, 도메인 정보는 현재 앱에 맞게** 한다.

---

# 11.79 Design Token 초안

개념적으로 다음 token을 둔다.

```text
layout.railWidth = 52
layout.sidebarWidth = 240
layout.drawerWidth = 400

size.sidebarRow = 36
size.taskRow = 48
size.header = 64

space.1 = 4
space.2 = 8
space.3 = 12
space.4 = 16
space.5 = 24
space.6 = 32

radius.sm = 6
radius.md = 8
radius.lg = 12

icon.sm = 14
icon.md = 16
icon.nav = 18
icon.lg = 20

font.xs = 11
font.sm = 12
font.md = 13
font.base = 14
font.lg = 16
font.xl = 22

breakpoint.mobile = 768
breakpoint.desktop = 1024
breakpoint.wideDesktop = 1280

layout.mobileHeader = 56
layout.mobileBottomNav = 56
layout.tabletSidebarSheet = 288
layout.touchTargetMin = 44

space.mainXDesktop = 32
space.mainXCompactDesktop = 24
space.mainXTablet = 20
space.mainXMobile = 16
```

실제 px token 이름은 코드 스타일에 맞춰 조정한다.

---

# 11.80 Light Mode 와이어프레임 개념

```text
┌────┬────────────────────┬───────────────────────────────────────────┐
│    │ 오늘            5   │ 오늘                            + 작업    │
│ ✓  │ 다음 7일       12   │ 8월 18일 · 미완료 5                     │
│    │ 기본함          10   │                                           │
│ ▣  │                    │ □ 교수님께 결과 전달            18:00     │
│    │ 리스트             │   ABM 연구 · #중요                       │
│ ◎  │ ▾ 학교             │                                           │
│    │   ● ABM 연구     7  │ □ 논문 결과 정리                        │
│ ⌕  │   ● 수업         5  │   ABM 연구                              │
│    │                    │                                           │
│ ⚙  │ 태그               │                                           │
└────┴────────────────────┴───────────────────────────────────────────┘
```

핵심은 Border가 아니라:

```text
spacing
alignment
typography
subtle surface
```

로 영역을 나누는 것이다.

---

# 11.81 Board 와이어프레임 개념

```text
기본함                                      + 작업
미분류 2 · 일정 2 · 언젠가 3

미분류                     일정                       언젠가

┌──────────────────┐      ┌──────────────────┐       ┌──────────────────┐
│ □ 자료 확인       │      │ □ 교수님 미팅     │       │ □ 책 읽기         │
│                  │      │ 오늘 14:00       │       │                  │
└──────────────────┘      └──────────────────┘       └──────────────────┘

┌──────────────────┐                                  ┌──────────────────┐
│ □ 아이디어 정리   │                                  │ □ 앱 개선         │
└──────────────────┘                                  └──────────────────┘

+ 작업                    + 작업                      + 작업
```

Card와 Column 사이에 큰 배경 Panel을 두지 않는 것을 기본으로 한다.

---

# 11.82 Drawer 와이어프레임 개념

```text
│ □ 교수님께 결과 전달                        ... X │
│                                                    │
│ List        ABM 연구                               │
│ Date        오늘 18:00                             │
│ Priority    높음                                   │
│ Tags        #중요                                  │
│                                                    │
│ ───────────────────────────────────────────────── │
│ 하위 작업                                  2 / 4   │
│                                                    │
│ ✓ 결과표 확인                                      │
│ □ 메일 초안 작성                                   │
│                                                    │
│ ───────────────────────────────────────────────── │
│ 메모                                               │
│ 시뮬레이션 결과 확인 후 메일에 포함...             │
```

각 속성을 Box로 감싸지 않는다.

---

# 11.83 Visual QA 체크리스트

구현 검수 시 다음을 확인한다.

### Layout

- **VS1.** Rail/Sidebar/Main/Drawer 폭이 token 기준을 따른다.
- **VS2.** Sidebar와 Main이 같은 Scroll container가 아니다.
- **VS3.** Header/Content left alignment가 일치한다.

### Density

- **VS4.** Sidebar Row는 기본 36px 전후다.
- **VS5.** Task Row는 기본 48px 전후다.
- **VS6.** Board Card가 불필요하게 100px 이상 커지지 않는다.

### Typography

- **VS7.** Task title보다 metadata가 시각적으로 약하다.
- **VS8.** Main title이 과도하게 크지 않다.
- **VS9.** Typography size 종류가 불필요하게 많지 않다.

### State

- **VS10.** Hover/Selected/Focus를 서로 구분할 수 있다.
- **VS11.** Hover action 때문에 layout shift가 없다.
- **VS12.** Focus ring을 제거하지 않는다.

### Color

- **VS13.** Priority/Overdue가 Color만으로 전달되지 않는다.
- **VS14.** List color는 작은 marker 중심이다.
- **VS15.** UI 전체에 Accent Color를 남발하지 않는다.

### Card / Surface

- **VS16.** 일반 Task Row는 Card로 감싸지 않는다.
- **VS17.** Board Card shadow는 최소화한다.
- **VS18.** Drawer 내부 속성마다 Card를 만들지 않는다.

### Responsive

- **VS19.** 좁은 화면에서 font-size를 줄이기보다 metadata/sidebar를 먼저 줄인다.
- **VS20.** Main의 Task title과 Due date는 최우선으로 유지한다.

---

# 11.84 §11 확정 결정

- **VS-D1.** 전체 Visual Direction은 `Compact / Calm / Flat / Fast / Readable`로 한다.
- **VS-D2.** Desktop 기본 폭은 Rail 52px / Sidebar 240px / Drawer 400px를 기준으로 한다.
- **VS-D3.** Sidebar Row 36px, Task Row 48px을 기본 density로 한다.
- **VS-D4.** Main horizontal padding은 약 32px, top padding은 약 24px로 한다.
- **VS-D5.** Main Title은 약 22px/600 수준으로 제한한다.
- **VS-D6.** Task Title은 약 14px, metadata는 11~12px을 기본으로 한다.
- **VS-D7.** Board Column 기본 폭은 300px, Column gap은 16px로 한다.
- **VS-D8.** Board Card 기본 radius는 8px 전후로 하고 shadow를 최소화한다.
- **VS-D9.** Row/Card의 시각 계층은 Border보다 spacing/alignment/typography로 만든다.
- **VS-D10.** Accent Color는 Selected/Focus/Primary/Completion 등 의미 있는 상태에만 사용한다.
- **VS-D11.** List color는 작은 Dot 중심으로 사용한다.
- **VS-D12.** Priority는 작은 icon/semantic color로 표현하고 Card 전체를 색칠하지 않는다.
- **VS-D13.** Overdue는 날짜 text 자체를 강조하고 Row 전체를 error background로 만들지 않는다.
- **VS-D14.** 일반 Task Row와 Drawer metadata를 Card UI로 감싸지 않는다.
- **VS-D15.** Hover에서는 action을 추가로 보여주되 layout shift가 없어야 한다.
- **VS-D16.** Focus state는 명확한 focus ring을 유지한다.
- **VS-D17.** Shadow는 Popover/Palette/Modal/Drag preview 등 떠 있는 Layer에만 적극 사용한다.
- **VS-D18.** Light/Dark mode 모두 semantic color token을 사용하고 단순 색 반전을 하지 않는다.
- **VS-D19.** MVP에서는 단일 `Compact but readable` density만 제공한다.
- **VS-D20.** TickTick의 시각 문법은 적극 따르되 Pixel-perfect 복제보다 현재 앱 도메인과 접근성을 우선한다.

---

# 12. Canonical Behavior Registry / 구현 일관성 단일 기준

## 12.1 목적

§12는 §1~§11에서 여러 단계에 걸쳐 발전한 설계를 실제 구현에서 **하나의 규칙 체계로 읽을 수 있게 만드는 최상위 행동 Registry**다.

이 장의 목적은 새 기능을 추가하는 것이 아니다.

다음 질문에 대해 구현자가 문서의 여러 절을 비교하거나 추론하지 않아도 **한 곳에서 하나의 답**을 얻도록 하는 것이다.

```text
- 이 Scope에는 어떤 Task가 들어오는가?
- 어떤 View를 허용하는가?
- 기본 Grouping / Sort는 무엇인가?
- + 작업을 누르면 어디에 생성되는가?
- 어떤 속성이 자동 적용되는가?
- Count는 무엇을 세는가?
- Drag / manual reorder를 허용하는가?
- URL은 무엇인가?
```

핵심 원칙:

> 같은 사용자 행동은 UI 위치에 따라 다른 Domain 의미를 가져서는 안 된다.

또한:

> Sidebar Count, Main 결과, Quick Add, Board, Drag & Drop, Search 결과 이동, URL 복원은 모두 같은 Scope semantics를 재사용한다.

---

## 12.2 규칙 우선순위

§1~§11에는 설계가 발전하는 과정에서 과거 권장안과 후기 확정안이 함께 남아 있다.

구현 단계에서는 다음 우선순위를 사용한다.

```text
1. §6 Data Invariant
   ↓
2. §12 Canonical Behavior Registry
   ↓
3. 각 Scope / UI 세부 설명
   ↓
4. 예시 / 와이어프레임 / 과거 권장 문구
```

### 규칙 A — Data Invariant는 깨지지 않는다

예:

```text
Task.listId != null
Folder는 Task owner가 아님
Inbox는 system List
someday=true → dueOn/dueAt=null
```

§12의 어떤 UX도 이 불변식을 우회하지 않는다.

### 규칙 B — 행동 의미는 §12를 따른다

예를 들어 이전 절에:

```text
Tag + 작업 → List 선택 필수
```

와:

```text
Tag + 작업 → 기본 Inbox
```

가 동시에 남아 있으면 **§12의 값을 canonical behavior로 사용한다.**

### 규칙 C — 기존 충돌 문구는 다음 consistency pass에서 수정한다

§12를 추가하는 이번 단계에서는 과거 절을 모두 다시 쓰지 않는다.

다음 단계에서 §12와 충돌하는 §1~§11 문장을 제거·수정한다.

---

# 12.3 Canonical Scope 종류

Tasks Module의 구현 Scope는 다음 9개로 고정한다.

```text
today
upcoming
inbox
list
folder
tag
filter
completed
trash
```

Inbox Board의:

```text
unclassified
scheduled
someday
```

및 일반 List의:

```text
section
```

은 별도 Navigation Scope가 아니라 **현재 Scope 안의 grouping / column context**다.

즉:

```text
/inbox?view=board
```

안에서 Column이 바뀌어도 Scope는 계속 `inbox`다.

---

# 12.4 Canonical Scope Behavior Matrix

| Scope | URL | Allowed View | Default | Membership | Default Grouping | Default Sort | `+ 작업` Owner | Auto Apply | Manual reorder / Drag |
|---|---|---|---|---|---|---|---|---|---|
| Today | `/today` | List | List | active AND (`overdue` OR `due today` OR `TodayPlan(today)`) | `기한 지남` / `오늘`; 완료는 별도 접힘 영역 | TodayPlan order가 있으면 우선 → time → priority → stable | Inbox | `TodayPlan(today)` | MVP 자유 reorder는 비활성. 기존 TodayPlan sortKey는 정렬에 반영 |
| Upcoming | `/upcoming` | List | List | active AND `today <= effectiveDueDate <= today+6` | 날짜별 | date → time → priority → stable | Inbox | 사용자가 선택한 date/time | reorder 불가 |
| Inbox | `/inbox` | List, Board | List | active AND `list.kind=inbox` | List: 없음 / Board: 미분류·일정·언젠가 | List: Task.sortKey / Board: bucket 안 Task.sortKey | Inbox | 현재 Column 조건 | manual reorder 및 Board drag 허용 |
| List | `/list/:id` | List, Board | List | active AND `task.listId=currentList` | Section; Section 없으면 평면 | `(sectionId, Task.sortKey)` | current List | Section inline add이면 current section | manual sort에서 reorder 허용; Board drag는 section 이동 |
| Folder | `/folder/:id` | List | List | active AND `task.list.sidebarFolderId=currentFolder` | 하위 List별 | sidebar list order → 각 List의 task order | **하위 List 선택 필수** | 없음 | MVP Task drag/reorder 없음 |
| Tag | `/tag/:id` | List | List | active AND current Tag relation | 없음 | due → priority → stable | Inbox | current Tag | reorder 불가 |
| Filter | `/filter/:id` | List | List | active AND `matches(filterSpec)` | 기본 없음 | filter-defined sort → 없으면 due → priority → stable | single owner 조건이면 해당 List, 아니면 Inbox | create-applicable positive conditions | reorder 불가 |
| Completed | `/completed` | List | List | `completedAt != null AND deletedAt == null` | 완료 날짜별 | completedAt desc | 생성 불가 | - | reorder/drag 불가 |
| Trash | `/trash` | List | List | `deletedAt != null` | 삭제 날짜별 | deletedAt desc | 생성 불가 | - | reorder/drag 불가 |

`active`의 canonical 의미:

```text
deletedAt == null
AND completedAt == null
```

---

# 12.5 Today Scope canonicalization

Today는 기존 문서에서 가장 쉽게 의미가 갈릴 수 있으므로 여기서 명확히 고정한다.

## 12.5.1 Today Membership

```text
matchesToday(task, userToday) =
  task.deletedAt == null
  AND task.completedAt == null
  AND (
    effectiveDueDate(task) < userToday
    OR effectiveDueDate(task) == userToday
    OR hasTodayPlan(task, userToday)
  )
```

즉 Today에는 다음 세 종류가 포함된다.

```text
1. Overdue active Task
2. 오늘 마감 Task
3. 오늘로 명시적으로 계획한 Task
```

### 중요한 의미

```text
Today membership
≠
dueDate == today
```

Future due Task도 TodayPlan이 있으면 Today에 들어올 수 있다.

그 경우 원래 due date는 변경하지 않는다.

---

## 12.5.2 Today Grouping

기본:

```text
기한 지남       // 존재할 때만
오늘
완료됨          // 당일 완료, optional collapsed secondary group
```

`완료됨`은 active Today Count에는 포함하지 않는다.

---

## 12.5.3 Today 생성

```text
Today + 작업
→ targetListId = Inbox
→ Task 생성
→ TaskDailyPlan(planDate=today) 생성
```

기본적으로:

```text
dueOn = null
dueAt = null
```

을 유지한다.

사용자가 Quick Add에서 날짜를 직접 지정했을 때만 Due date를 만든다.

즉:

```text
오늘 계획
≠
오늘 마감
```

을 보존한다.

---

## 12.5.4 Today reorder 결정

기존 설계에는 Today manual order를 `TaskDailyPlan.sortKey`로 저장하는 방향이 있으나, due-only Task까지 자유 reorder할 경우 **정렬을 위해 TodayPlan membership을 새로 만드는 문제**가 생길 수 있다.

따라서 MVP canonical rule은 다음으로 고정한다.

```text
Today 자유 Drag reorder = OFF
```

단:

```text
이미 TaskDailyPlan.sortKey가 존재하면 정렬 우선순위에 반영
```

한다.

향후 Today 전체 manual reorder를 도입하려면 `TodayPlan membership`과 `Today view order`를 혼동하지 않는 별도 데이터 계약을 먼저 추가한다.

---

# 12.6 Upcoming Scope canonicalization

## Membership

```text
active
AND effectiveDueDate >= today
AND effectiveDueDate <= today + 6 days
```

Overdue는 Upcoming에 포함하지 않는다.

TodayPlan만 있고 due date가 없는 Task도 Upcoming에 포함하지 않는다.

## Grouping

```text
날짜별
```

## Sort

```text
날짜
→ 시간
→ Priority
→ stable order
```

## 생성

```text
Upcoming + 작업
→ title 입력 가능
→ 저장 전에 날짜 필수
→ 기본 owner = Inbox
```

List를 사용자가 선택하면 해당 List를 target owner로 바꿀 수 있다.

날짜 없는 Task를 Upcoming에서 commit하지 않는다.

---

# 12.7 Inbox Scope canonicalization

## Membership

```text
active
AND task.list.kind == inbox
```

## List View

```text
Grouping: 없음
Sort: Task.sortKey manual order
```

## Board View

Column은 실제 Section이 아니다.

```text
미분류
= someday=false AND no due

일정
= someday=false AND due exists

언젠가
= someday=true
```

Column 이동은 `List`를 바꾸지 않는다.

Task 속성만 해당 Column 의미에 맞게 domain command로 변경한다.

### 미분류 → 일정

```text
날짜 입력 필수
→ due 설정
```

### 일정 → 미분류

```text
dueOn = null
dueAt = null
someday = false
```

### * → 언젠가

```text
setTaskSomeday(true)
→ someday = true
→ dueOn = null
→ dueAt = null
```

## 생성

```text
Inbox Header + 작업
→ Inbox
```

Board Column inline add는 Column 조건까지 자동 적용한다.

---

# 12.8 List Scope canonicalization

## Membership

```text
active
AND task.listId == currentList.id
```

## View

```text
List
Board
```

둘 다 같은 `ListSection` semantics를 사용한다.

## Grouping

```text
Section 존재 → Section별
Section 없음 → flat list
```

## Sort

기본:

```text
manual
→ Task.sortKey
```

Section이 있으면:

```text
(sectionId, sortKey)
```

Derived sort를 선택한 동안 manual Drag reorder는 비활성화한다.

## 생성

Header:

```text
targetListId = currentList
sectionId = null
```

Section inline:

```text
targetListId = currentList
sectionId = currentSection
```

마지막 사용 Section을 암묵적으로 자동 선택하지 않는다.

---

# 12.9 Folder Scope canonicalization

Folder는 `SidebarFolder`이며 Task owner가 아니다.

## Membership

```text
active
AND task.list.sidebarFolderId == currentFolder.id
```

## Grouping

반드시 하위 List별로 그룹한다.

```text
Folder
├─ List A
│  └─ Tasks
├─ List B
│  └─ Tasks
└─ List C
   └─ Tasks
```

## Sort

```text
1. List.sidebarSortKey
2. 각 List 안의 canonical Task order
```

## 생성

```text
Folder + 작업
→ current Folder 하위 List Picker
→ List 선택 전 저장 불가
```

MVP에서는 현재 Folder 밖의 List를 선택 대상으로 열지 않는다.

## Drag

Folder Aggregate View에서 Task를 다른 List로 Drag하는 기능은 MVP에서 제공하지 않는다.

이 이동은 단순 정렬이 아니라 Project/Space membership까지 바꿀 수 있기 때문이다.

List 이동은 Drawer/More Menu로 수행한다.

---

# 12.10 Tag Scope canonicalization

## Membership

```text
active
AND TaskTag(taskId, currentTag.id) exists
```

## View

```text
List only
```

## Sort

```text
due
→ priority
→ stable order
```

## 생성

이전 초기 설계의 `List 선택 필수`를 최종적으로 사용하지 않는다.

Canonical:

```text
Tag + 작업
→ targetListId = Inbox
→ current Tag 자동 적용
```

Quick Add에서 사용자가 List를 직접 선택하면 해당 List에 생성한다.

따라서:

```text
List 선택 = optional override
Inbox = default owner
```

이다.

---

# 12.11 Filter Scope canonicalization

Saved Filter는 저장 Container가 아니라 Query다.

## Membership

MVP Filter는 일반 Task 탐색용으로 다음 baseline을 사용한다.

```text
deletedAt == null
AND completedAt == null
AND matches(filterSpec)
```

완료 Task와 삭제 Task 관리는 각각 `Completed`, `Trash` 시스템 Scope에서 담당한다.

## View

```text
List only
```

## Sort

```text
filterSpec에 sort 존재
→ 해당 sort

없음
→ due → priority → stable
```

## 생성 owner

```text
filterSpec이 정확히 하나의 target List를 positive 조건으로 결정
→ 해당 List

그 외
→ Inbox
```

## Auto Apply

자동 적용은 명시적인 allowlist resolver를 사용한다.

MVP create-applicable condition 예:

```text
list = X
tag includes X
due = today / concrete date
priority = X
```

자동 적용하지 않는 예:

```text
createdBefore
contains text
completed=true
NOT tag
NOT list
```

즉 UI가 filter JSON을 직접 보고 임의 patch하지 않는다.

```text
resolveFilterCreatePatch(filterSpec)
```

같은 공통 resolver를 사용한다.

---

# 12.12 Completed Scope canonicalization

## Membership

```text
completedAt != null
AND Task.deletedAt == null
AND List.deletedAt == null
AND List.archivedAt == null
```

Trash와 owner List lifecycle이 완료보다 높은 exclusion 우선순위를 가진다.

## Grouping / Sort

```text
완료 날짜별
completedAt desc
```

## Action

```text
reopen
open detail
trash
```

## 생성

```text
+ 작업 없음
```

## Reopen

```text
completedAt = null
```

후 Task의 실제 List / Today / Tag / Filter membership을 다시 계산한다.

---

# 12.13 Trash Scope canonicalization

## Membership

```text
Task.deletedAt != null
AND List.deletedAt == null
```

완료 여부와 관계없이 Task Trash에 표시한다.

Owner List 자체가 deleted 상태라면 해당 Task는 Task Trash에 중복 표시하지 않고 §13의 Deleted Lists 복구 Surface에서 List와 함께 다룬다.

## Grouping / Sort

```text
삭제 날짜별
deletedAt desc
```

## 기본 Action

```text
restore
permanent delete
```

Trash 상태에서는 일반 Task editing을 기본 비활성화한다.

## Restore

원래 List가 존재:

```text
deletedAt = null
→ 기존 List 복원
```

원래 List가 없음:

```text
복원 위치 Picker 필수
기본 제안 = Inbox
```

사용자가 복원 위치를 확정한 뒤 commit한다.

영구 삭제는 confirmation이 필요하다.

---

# 12.14 Canonical Count Registry

Count는 화면마다 별도의 간이 계산식을 만들지 않는다.

```text
Count
=
해당 Scope query의 row count
```

단 Completed / Trash는 각 시스템 Scope semantics를 따른다.

| Scope | Canonical Count |
|---|---|
| Today | `matchesToday()`인 active Task 수 — **Overdue 포함** |
| Upcoming | 향후 7일 active due Task 수 |
| Inbox | Inbox active Task 수 |
| List | current List active Task 수 |
| Folder | current Folder 하위 List의 active Task 합 |
| Tag | current Tag active Task 수 |
| Filter | current Filter active result 수 |
| Completed | `completedAt != null AND deletedAt == null` 수 |
| Trash | `deletedAt != null` 수 |

### Count UI 표시와 Count semantics는 분리한다

예를 들어 Folder는 aggregated count semantics를 가지지만 Sidebar에서는 기본적으로 숫자를 숨길 수 있다.

즉:

```text
count가 존재하는가?
```

와:

```text
Sidebar에 항상 보여주는가?
```

는 다른 결정이다.

### Sidebar 기본 표시

```text
Today       표시
Upcoming    표시
Inbox       표시
List        표시
Folder      숨김
Tag         표시
Filter      optional
Completed   optional / 기본 숨김
Trash       optional / 기본 숨김
```

Count = 0은 공통적으로 숨긴다.

---

# 12.15 Canonical Metadata Registry

현재 Scope에서 이미 아는 정보는 반복하지 않는다.

| Scope | 기본 Task Row Metadata |
|---|---|
| Today | time 또는 실제 non-today due, List, Priority, Tag 일부 |
| Upcoming | time, List, Priority, Tag 일부; 날짜는 Group Header |
| Inbox | Date, Priority, Tag; List 이름 생략 |
| List | Date, Priority, Tag, Subtask progress; List 이름 생략 |
| Folder | Date, Priority, Tag; List는 Group Header |
| Tag | Date, List, Priority; current Tag 생략 |
| Filter | Date, List, Priority, Tag 일부; filter에 따라 동적 축소 |
| Completed | 원래 List, 완료 날짜/시간 |
| Trash | 원래 List, 삭제 날짜 |

---

# 12.16 Canonical Create Resolver

모든 `+ 작업` 진입점은 서로 다른 컴포넌트가 직접 owner를 결정하지 않는다.

공통 resolver를 둔다.

개념:

```ts
type CreateResolution = {
  targetListId: string | null
  requiredBeforeCommit: Array<'list' | 'date'>
  patch: TaskCreatePatch
  dailyPlan?: {
    planDate: string
  }
}
```

```text
resolveCreateContext(scope, localContext)
→ CreateResolution
```

Canonical 결과:

```text
Today
→ Inbox + TodayPlan

Upcoming
→ Inbox + date required

Inbox
→ Inbox

Inbox scheduled column
→ Inbox + date required

Inbox someday column
→ Inbox + someday=true

List
→ current List

List Section
→ current List + sectionId

Folder
→ list required; current Folder children only

Tag
→ Inbox + current Tag

Filter
→ exact single List if resolvable, else Inbox
→ positive create-applicable filter patch

Completed / Trash
→ creation disabled
```

Domain `createTask()`에는 `targetListId=null` 상태를 넘기지 않는다.

---

# 12.17 Canonical View Registry

MVP View Registry는 다음 하나만 사용한다.

```ts
const taskScopeViewRegistry = {
  today: ['list'],
  upcoming: ['list'],
  inbox: ['list', 'board'],
  list: ['list', 'board'],
  folder: ['list'],
  tag: ['list'],
  filter: ['list'],
  completed: ['list'],
  trash: ['list'],
} as const
```

Default View:

```text
all scope → list
```

따라서 다음은 invalid canonical URL이다.

```text
/today?view=board
/tag/x?view=board
/filter/x?view=board
/folder/x?view=board
/completed?view=board
/trash?view=board
```

처리:

```text
invalid view
→ list fallback
→ replaceState로 canonical URL 정리
```

---

# 12.18 Canonical Sort / Reorder Registry

| Scope / View | 기본 Sort | Manual reorder |
|---|---|---|
| Today List | TodayPlan order if exists → time → priority → stable | MVP OFF |
| Upcoming List | date → time → priority → stable | OFF |
| Inbox List | Task.sortKey | ON |
| Inbox Board | bucket + Task.sortKey | ON |
| List List | Section + Task.sortKey | ON when manual sort |
| List Board | Section + Task.sortKey | ON; column 이동 = sectionId patch |
| Folder | sidebar List order → 각 List order | OFF in aggregate view |
| Tag | due → priority → stable | OFF |
| Filter | filter sort 또는 due → priority → stable | OFF |
| Completed | completedAt desc | OFF |
| Trash | deletedAt desc | OFF |

공통:

```text
Derived sort
→ reorder drag 숨김
```

Drag가 유일한 이동 수단이 되지 않도록 Drawer/More Menu 대체 Action을 유지한다.

---

# 12.19 Canonical Scope Query API

UI가 직접 where 조건을 조합하지 않는다.

권장 boundary:

```text
queryTodayTasks(userId, date)
queryUpcomingTasks(userId, startDate, endDate)
queryInboxTasks(userId)
queryListTasks(listId)
queryFolderTasks(sidebarFolderId)
queryTagTasks(tagId)
queryFilterTasks(filterId)
queryCompletedTasks(userId)
queryTrashTasks(userId)
```

그리고 client optimistic membership 재평가에는:

```text
matchesScope(task, scope, context)
```

를 사용한다.

### 중요한 공통 조건

```text
Sidebar Count
Main result
Header Count
optimistic insert/remove
Drawer mutation 후 scope 유지 여부
```

가 모두 같은 query / `matchesScope` 의미를 사용해야 한다.

Active Scope의 공통 precondition은 §13 lifecycle selector를 사용한다.

```text
isTaskActive(task, ownerList)
= Task.deletedAt == null
  AND List.deletedAt == null
  AND List.archivedAt == null
```

각 Scope가 이 조건을 별도로 복사해서 구현하지 않는다.

---

# 12.20 Canonical Scope Registry 타입

구현 개념:

```ts
type TaskScopeKind =
  | 'today'
  | 'upcoming'
  | 'inbox'
  | 'list'
  | 'folder'
  | 'tag'
  | 'filter'
  | 'completed'
  | 'trash'

type TaskScopePolicy = {
  kind: TaskScopeKind
  allowedViews: readonly TaskViewKind[]
  defaultView: TaskViewKind
  canCreate: boolean
  canManualReorder: boolean
  countMode: 'active' | 'completed' | 'trash'
  resolveCreateContext?: ResolveCreateContext
  matches: MatchesScope
  getDefaultSort: GetDefaultSort
  getGrouping: GetGrouping
}
```

예:

```ts
scopeRegistry.today
scopeRegistry.inbox
scopeRegistry.list
```

처럼 한 곳에서 참조한다.

컴포넌트에서:

```text
if pathname === '/today' ...
```

같은 조건을 반복해서 제품 규칙을 재구현하지 않는다.

---

# 12.21 Mutation 후 Scope 재평가

Task mutation 후 항상 현재 Scope membership을 다시 계산한다.

```text
mutation
↓
canonical entity patch
↓
matchesScope(task, currentScope)
↓
YES → 현재 Main/Drawer 유지
NO  → Main에서 optimistic remove
      + Drawer가 해당 Task면 close
      + Undo 제공 가능한 action이면 Undo
```

대표 사례:

### Today

```text
TodayPlan 제거
AND due가 오늘/과거 아님
→ Today에서 제거
```

### Inbox

```text
List 이동
→ Inbox에서 제거
```

### Tag

```text
current Tag 제거
→ Tag에서 제거
```

### Filter

```text
Filter condition 불충족
→ Filter에서 제거
```

### Completed

```text
reopen
→ Completed에서 제거
→ 다른 active Scope membership 재평가
```

### Trash

```text
restore
→ Trash에서 제거
→ 복원된 owner/query membership 재평가
```

---

# 12.22 URL과 Registry 연결

URL parser가 Scope를 만들고 Registry가 화면 정책을 제공한다.

```text
URL
↓
parseUrl
↓
NavigationState.scope
↓
scopeRegistry[scope.kind]
↓
allowed view / default view / query / create / sort / grouping
```

즉 URL layer와 제품 규칙을 분리한다.

URL은:

```text
WHERE / HOW / OPEN TASK
```

를 표현하고,

Registry는:

```text
그 WHERE에서 무엇이 가능한가
```

를 표현한다.

---

# 12.23 Search와 Registry 연결

Search Result에서 Scope로 이동할 때도 별도 navigation rule을 만들지 않는다.

예:

```text
ListResult
→ /list/:id

TagResult
→ /tag/:id

TaskResult
→ canonical scope 결정
→ ?task=:taskId
```

이후 View 허용 여부와 canonicalization은 같은 Registry를 사용한다.

Search가 `Tag Board`, `Filter Board` 같은 존재하지 않는 조합을 만들어서는 안 된다.

---

# 12.24 Sidebar와 Registry 연결

Sidebar Row는 Scope를 선택할 뿐 Scope semantics를 자체 구현하지 않는다.

```text
Sidebar click
→ navigate(scope)
```

Count도:

```text
sidebarCount(scope)
```

가 별도 조건을 작성하는 대신 canonical Scope query를 사용한다.

특히 Folder의 경우:

```text
Count semantics = 하위 List active Task 합
Sidebar display = 기본 숨김
```

으로 의미와 표시를 분리한다.

---

# 12.25 Canonical MVP Boundary

이 Registry는 **현재 Tasks Desktop MVP**의 행동 계약이다.

### MVP에 포함

```text
Today / Upcoming
Inbox List + Board
List List + Board
Folder grouped List
Tag List
Filter List
Completed
Trash
Context/Global Quick Add
Detail Drawer P0
URL/history
optimistic mutation
Search/Command 기본
```

### MVP에서 제외 또는 후순위

```text
Today 전체 자유 manual reorder
Folder Board
Tag Board
Filter Board
Multi-select
Advanced recurrence
Multiple reminder
완전한 offline sync
Mobile-specific interaction
```

후순위 기능을 구현하기 위해 현재 Registry semantics를 깨지 않는다.

---

# 12.26 구현 중 금지할 것

### ① 컴포넌트별 Scope 조건 복제

```text
Sidebar의 Today 조건
≠
Main의 Today 조건
```

이 되는 구조 금지.

### ② 과거 절의 예시를 보고 Registry를 우회

예:

```text
Tag에서 List Picker 강제
```

를 다시 구현하지 않는다.

### ③ Filter에서 임의 Regular List fallback

```text
owner 불명확
→ Inbox
```

만 허용한다.

### ④ Today Task 생성 시 due=today 자동 강제

TodayPlan과 Due date 의미를 분리한다.

### ⑤ Inbox Board Column을 실제 Section으로 저장

가상 Column 의미를 유지한다.

### ⑥ Folder를 Task owner로 저장

반드시 실제 List를 target으로 선택한다.

### ⑦ Derived sort 중 Drag reorder

보이는 순서와 저장 순서가 어긋난다.

### ⑧ Count 전용 별도 필터 구현

Main과 숫자가 달라질 수 있다.

---

# 12.27 Acceptance Criteria — Registry 일관성

### CBR-AC1 — Today membership

Overdue / due today / TodayPlan task가 모두 Today active 결과에 나타난다.

### CBR-AC2 — Today Count

Today Sidebar/Header Count는 CBR-AC1의 active 결과 수와 같다.

### CBR-AC3 — Today create

Today에서 제목만 입력해 생성하면 Inbox owner + TodayPlan이며 due date는 자동 생성되지 않는다.

### CBR-AC4 — Upcoming membership

Upcoming은 today~today+6의 due Task만 포함하고 overdue 및 due 없는 TodayPlan task를 포함하지 않는다.

### CBR-AC5 — Upcoming create

날짜를 정하지 않으면 Upcoming Context Quick Add를 commit할 수 없다.

### CBR-AC6 — Inbox owner

Inbox List/Board의 Task는 모두 동일한 system Inbox List를 owner로 가진다.

### CBR-AC7 — Inbox Board

미분류/일정/언젠가 이동 결과가 Task due/someday 속성과 항상 일치한다.

### CBR-AC8 — List Section

List List View와 Board View가 같은 ListSection 데이터를 사용한다.

### CBR-AC9 — Folder create

Folder에서 하위 List를 선택하기 전에는 Task가 생성되지 않는다.

### CBR-AC10 — Tag create

Tag에서 List를 선택하지 않고 생성하면 Inbox + current Tag가 된다.

### CBR-AC11 — Filter create

Filter가 단일 target List를 확정하면 그 List, 아니면 Inbox를 owner로 사용한다.

### CBR-AC12 — Completed exclusion

`deletedAt != null`인 완료 Task는 Completed가 아니라 Trash에만 나타난다.

### CBR-AC13 — Restore

Trash Task의 원래 List가 없으면 owner가 확정되기 전에는 restore commit하지 않는다.

### CBR-AC14 — View Registry

Board는 MVP에서 Inbox와 List에서만 열 수 있다.

### CBR-AC15 — Invalid View URL

허용되지 않는 `?view=board`는 list로 fallback하고 replaceState로 canonicalize한다.

### CBR-AC16 — Count consistency

Sidebar Count와 Main active result가 동일한 canonical Scope query를 사용한다.

### CBR-AC17 — Mutation membership

Task mutation으로 현재 Scope를 벗어나면 Main과 Drawer가 같은 시점에 해당 Task를 제거한다.

### CBR-AC18 — Drag consistency

Derived sort에서는 reorder Drag가 표시되지 않는다.

### CBR-AC19 — Domain invariant

어떤 create/move/restore flow에서도 active Task의 `listId`가 null이 되지 않는다.

### CBR-AC20 — Single behavior source

Scope별 View/Create/Count/Grouping/Sort 정책은 UI component의 하드코딩이 아니라 공통 Registry/Resolver에서 읽힌다.

---

# 12.28 §12 확정 결정

- **CBR-D1.** Tasks의 canonical Scope는 `today / upcoming / inbox / list / folder / tag / filter / completed / trash` 9개로 고정한다.
- **CBR-D2.** §6 Data Invariant를 최상위 구조 제약으로 유지하고, 제품 행동 충돌은 §12 Registry를 최종 기준으로 한다.
- **CBR-D3.** Today active membership은 `overdue OR due today OR TodayPlan(today)`로 확정한다.
- **CBR-D4.** Today Count는 Overdue를 포함한 동일 active Today query를 사용한다.
- **CBR-D5.** Today에서 새 Task는 `Inbox + TodayPlan`이며 `due=today`를 자동 강제하지 않는다.
- **CBR-D6.** Today 전체 자유 manual reorder는 MVP에서 제외하고 기존 TodayPlan sortKey만 정렬에 반영한다.
- **CBR-D7.** Upcoming은 due 기반 today~today+6 Query이며 생성 시 date를 필수로 한다.
- **CBR-D8.** Inbox Board의 Column은 Task 속성 기반 virtual column이며 실제 Section으로 저장하지 않는다.
- **CBR-D9.** 일반 List의 List/Board는 동일 ListSection semantics를 사용한다.
- **CBR-D10.** Folder는 List-only MVP로 고정하고 Task 생성 시 현재 Folder 하위 List 선택을 필수로 한다.
- **CBR-D11.** Tag는 List-only이며 새 Task의 기본 owner는 Inbox, current Tag는 자동 적용한다.
- **CBR-D12.** Filter는 List-only이며 single List owner가 확정되지 않으면 Inbox를 사용한다.
- **CBR-D13.** Filter auto-apply는 create-applicable positive condition allowlist만 사용한다.
- **CBR-D14.** Completed는 완료 Task이면서 owner List가 active인 경우, Task Trash는 `Task.deletedAt != null AND List.deletedAt == null`인 경우를 canonical membership으로 사용하며 List 자체 삭제는 §13 Deleted Lists lifecycle로 분리한다.
- **CBR-D15.** Board는 MVP에서 Inbox와 실제 List에만 허용한다.
- **CBR-D16.** 모든 Scope의 기본 View는 List다.
- **CBR-D17.** Sidebar Count / Header Count / Main result / optimistic membership은 동일 Scope query semantics를 사용한다.
- **CBR-D18.** Count semantics와 Sidebar에서 Count를 실제 표시하는 정책을 분리한다.
- **CBR-D19.** Task 생성은 공통 `resolveCreateContext`에서 owner/required field/auto patch를 확정한 뒤 `createTask`를 호출한다.
- **CBR-D20.** UI component가 Scope membership, create owner, allowed view를 독립적으로 재구현하지 않는다.
- **CBR-D21.** Derived sort에서는 manual reorder Drag를 제공하지 않는다.
- **CBR-D22.** Scope 밖으로 나가는 mutation은 공통 `matchesScope` 재평가를 통해 Main/Drawer/Count에 동시에 반영한다.
- **CBR-D23.** §1~§11의 Scope/View/Create/Count/Sort 관련 규칙은 §12와 동기화된 상태를 유지하며 이후 변경도 Registry에서 먼저 수정한다.

---

# 13. Data Model Closure / Subtask · Repeat · Reminder · Container Lifecycle

## 13.1 목적

§13은 UI에는 존재하거나 향후 활성화될 수 있지만 §6에서 저장 계약이 완전히 닫히지 않았던 기능을 canonical data contract로 확정한다.

대상:

```text
1. Subtask
2. Repeat / Recurrence
3. Reminder
4. List Archive / Delete / Restore / Permanent Delete
5. Project Archive / Delete / Restore / Permanent Delete
6. Space Archive / Delete / Restore / Permanent Delete
```

핵심 원칙:

> MVP에서 실제로 보이는 기능은 완전한 저장 규칙을 가져야 한다. 아직 저장·동기화·복구 semantics가 구현되지 않은 기능은 disabled UI로 미리 노출하지 않는다.

우선순위:

```text
§6 Data Invariant
↓
§12 Canonical Behavior Registry
↓
§13 Data Model Closure
↓
개별 UI 예시
```

§13은 Subtask / Repeat / Reminder / Container lifecycle에 한해 기존의 모호한 문장을 대체한다.

---

# 13.2 MVP / P1 경계

```text
MVP
├─ Subtask           O
├─ List lifecycle    O
├─ Project lifecycle O
├─ Space lifecycle   O
├─ Repeat            X
└─ Reminder          X

P1
├─ Repeat            O
└─ Reminder          O

P2
├─ Custom recurrence
└─ Multiple reminder UI 고도화
```

Repeat/Reminder용 확장 계약은 지금 정의하지만 MVP schema migration과 UI에서 반드시 만들 필요는 없다.

---

# 13.3 Subtask를 일반 Task로 저장하지 않는 이유

MVP Subtask는 다음 기능만 가진다.

```text
title
completion
manual order
```

반면 일반 Task는:

```text
List owner
Section
Date
Priority
Tag
Today membership
Search/navigation identity
Trash
```

를 가진다.

Subtask를 `Task.parentTaskId` self-reference로 만들면 모든 Task Query가:

```text
parentTaskId IS NULL
```

예외를 기억해야 하고, Subtask에도 List owner를 강제할지 여부가 생긴다.

현재 UX 요구에는 그 복잡성이 필요하지 않다.

따라서 별도 entity를 사용한다.

---

# 13.4 TaskSubtask schema

```text
TaskSubtask
├─ id
├─ parentTaskId          NOT NULL
├─ title                 NOT NULL
├─ completedAt?          nullable
├─ deletedAt?            nullable
├─ sortKey               NOT NULL
├─ createdAt
└─ updatedAt
```

FK:

```text
TaskSubtask.parentTaskId
→ Task.id
```

Parent Task hard delete 시에는 Subtask도 hard cascade 가능하다.

이 경우 Subtask는 독립적으로 복구할 가치가 없는 종속 객체이기 때문이다.

---

# 13.5 Subtask 불변식

### ST-I1 — 1단계만 허용

TaskSubtask에는 `parentSubtaskId`를 두지 않는다.

```text
Task
└─ TaskSubtask
```

까지만 허용한다.

### ST-I2 — 독립 owner 없음

Subtask에는 다음을 두지 않는다.

```text
listId
sectionId
projectId
spaceId
```

Parent Task의 context를 따른다.

### ST-I3 — 독립 scheduling 없음

MVP에서는 Subtask에:

```text
dueOn / dueAt
priority
tag
repeat
reminder
```

를 두지 않는다.

### ST-I4 — Parent 자동 완료 없음

모든 Subtask가 완료되어도 Parent `completedAt`을 자동 설정하지 않는다.

### ST-I5 — Parent 완료 허용

미완료 Subtask가 남아 있어도 Parent Task 완료를 block하지 않는다.

재오픈하면 기존 Subtask 상태를 그대로 볼 수 있다.

### ST-I6 — 순서

Subtask manual order는:

```text
(parentTaskId, sortKey)
```

범위에서만 의미를 가진다.

---

# 13.6 Subtask Delete / Undo

Subtask 일반 삭제:

```text
deletedAt = now
→ Drawer에서 즉시 제거
→ Undo 가능
```

Subtask는 Tasks의 일반 Trash Scope에 독립 row로 표시하지 않는다.

Undo 기간이 지나도 parent Task가 존재하면 soft-deleted Subtask data는 보존 정책에 따라 cleanup할 수 있다.

Parent Task soft delete:

```text
Parent.deletedAt = now
→ Subtask row 변경 없음
→ Parent와 함께 숨김
```

Parent restore:

```text
Parent.deletedAt = null
→ 기존 Subtask 그대로 복구
```

Parent permanent delete:

```text
Task hard delete
→ TaskSubtask hard cascade
```

---

# 13.7 Subtask Search

MVP Global Search에서 Subtask를 독립 Navigation Resource로 만들지 않는다.

다만 title index/search가 필요하면:

```text
Subtask title match
→ Parent Task result 반환
→ "하위 작업: ..." 보조 정보 표시
```

형태로 확장할 수 있다.

SearchResult에 별도 `SubtaskResult`를 넣는 것은 P1 이후다.

---

# 13.8 Subtask Domain Command

UI가 table을 직접 patch하지 않는다.

```text
createSubtask(parentTaskId, title)
renameSubtask(subtaskId, title)
completeSubtask(subtaskId)
reopenSubtask(subtaskId)
moveSubtask(subtaskId, beforeId?, afterId?)
trashSubtask(subtaskId)
restoreSubtask(subtaskId)
```

모든 command는 Parent 존재/권한을 검증한다.

---

# 13.9 Repeat MVP 정책

Repeat는 **MVP 기능에서 제외**한다.

따라서 다음을 금지한다.

```text
실제로 저장되지 않는 Repeat Row 표시
Task.repeat = "weekly" 같은 임시 문자열 field 추가
UI만 있고 scheduler가 없는 상태
완료 시 다음 occurrence가 생성되지 않는 반쪽 구현
```

P1 시작 전까지 일반 `completeTask`는 반복 Task 분기를 갖지 않는다.

---

# 13.10 P1 Recurrence canonical model

P1에서 Repeat를 구현할 때는 Task row에 자유 문자열을 저장하지 않고 별도 structured entity를 둔다.

```text
TaskRecurrence
├─ taskId                 PK / FK → Task
├─ version                1
├─ ruleSpec               structured JSON
├─ timezone
├─ createdAt
└─ updatedAt
```

개념적 Rule:

```text
{
  version: 1,
  frequency: daily | weekly | monthly | yearly,
  interval: 1,
  end: never | until(date) | count(n)
}
```

P1에서는 `interval = 1`의 기본 반복만 UI에 노출해도 된다.

Custom interval / weekday set은 P2다.

---

# 13.11 Recurrence anchor

Repeat는 반드시 Task의 현재 Due를 anchor로 사용한다.

```text
dueOn != null
OR
dueAt != null
```

Repeat 설정 시 Due가 없다면 Date를 먼저 요구한다.

date-only recurrence:

```text
Task.dueOn
```

시간 포함 recurrence:

```text
Task.dueAt + timezone
```

을 사용한다.

---

# 13.12 Recurrence occurrence ledger

반복 완료 이력을 잃지 않기 위해 occurrence 기록을 별도 저장한다.

```text
TaskRecurrenceOccurrence
├─ id
├─ taskId
├─ scheduledOn?           XOR
├─ scheduledAt?           XOR
├─ completedAt?
├─ skippedAt?
└─ createdAt
```

제약:

```text
UNIQUE(taskId, scheduledOn/scheduledAt)
```

한 occurrence가 완료와 skip을 동시에 가질 수 없다.

---

# 13.13 반복 Task 완료 operation

P1 canonical command:

```text
completeRecurringOccurrence(taskId)
```

한 transaction/domain operation에서:

```text
1. 현재 due를 occurrence identity로 확정
2. occurrence completedAt 기록
3. recurrence rule로 next due 계산
4. next 존재 → Task.dueOn/dueAt을 다음 occurrence로 이동
5. next 없음 → recurrence 종료 + Task.completedAt 설정
6. reminder schedule 재계산
7. affected Scope membership 재평가
```

Series가 계속되는 동안 `Task.completedAt`은 null을 유지한다.

따라서 P1 recurrence를 실제 활성화할 때는 Completed UX가 occurrence history를 어떻게 노출할지 별도 View adapter를 함께 구현해야 한다.

반쪽 구현을 피하기 위해 **occurrence ledger + completion UX가 준비되기 전에는 Repeat UI를 열지 않는다.**

---

# 13.14 월말 / 윤년 규칙

기본 recurrence에서 존재하지 않는 날짜가 발생할 수 있다.

예:

```text
1월 31일 → 다음 달
2월 29일 → 다음 해
```

canonical 규칙은 **해당 월의 마지막 유효 날짜로 clamp**한다.

예:

```text
1월 31일 monthly → 2월 28일/29일
2월 29일 yearly → 비윤년 2월 28일
```

조용히 다음 달 1일로 넘기지 않는다.

---

# 13.15 Reminder MVP 정책

Reminder도 **MVP 기능에서 제외**한다.

notification scheduler / permission / persistence가 없는 상태에서 Reminder icon이나 설정 Row를 미리 노출하지 않는다.

---

# 13.16 P1 TaskReminder schema

P1에서는 Reminder를 Task의 단일 field가 아니라 별도 entity로 둔다.

```text
TaskReminder
├─ id
├─ taskId
├─ mode                   relative_due | absolute
├─ offsetMinutes?         relative_due일 때
├─ remindAt?              absolute일 때
├─ createdAt
└─ updatedAt
```

불변식:

```text
mode = relative_due
→ offsetMinutes required
→ remindAt null

mode = absolute
→ remindAt required
→ offsetMinutes null
```

한 Task에 여러 Reminder row를 둘 수 있게 하여 data model은 처음부터 다중 Reminder를 허용한다.

P1 UI는 최대 1개만 노출해도 된다.

---

# 13.17 Reminder와 Date/Time

`relative_due` Reminder는 `dueAt`이 있을 때만 허용한다.

date-only:

```text
dueOn != null
dueAt == null
```

상태에서 Reminder를 누르면:

```text
알림 시간을 설정하세요
```

를 표시하고 Due Time을 먼저 받는다.

숨은 기본 시간을 만들지 않는다.

---

# 13.18 Reminder schedule lifecycle

다음 mutation은 pending notification을 재계산한다.

```text
due 변경
reminder 변경
Task 완료/재오픈
Task Trash/Restore
List Archive/Delete/Restore
```

Task가 완료/Trash이거나 owner List가 archived/deleted 상태면 pending notification을 cancel한다.

다시 활성화되고 예정 시간이 미래라면 schedule을 복구할 수 있다.

P1 recurrence와 함께 사용하는 relative reminder는 각 occurrence의 현재 due를 기준으로 재계산한다.

---

# 13.19 Active owner List rule

Task가 active Task Scope에 나타나려면 Task 자체뿐 아니라 owner List도 active여야 한다.

공통 precondition:

```text
Task.deletedAt == null
AND List.deletedAt == null
AND List.archivedAt == null
```

그 다음 Today/Upcoming/List/Tag/Filter 등의 개별 membership 조건을 적용한다.

Project / Space archived/deleted 여부는 Tasks Module active membership을 자동으로 제거하지 않는다.

이유:

> Project / Space는 List의 고급 context이지 Task의 직접 owner가 아니다.

---

# 13.20 List lifecycle model

`TaskList`는:

```text
archivedAt timestamp | null
deletedAt timestamp | null
```

을 가진다.

동시에 둘 다 설정하지 않는 것을 기본으로 한다.

```text
archivedAt != null
→ deletedAt == null

deletedAt != null
→ archivedAt == null
```

Archive된 List는 보존 상태, Deleted List는 복구 가능한 삭제 상태다.

---

# 13.21 Archive List

```text
archiveList(listId)
```

처리:

```text
1. list.archivedAt = now
2. list.deletedAt = null
3. child Task row 변경 없음
4. Sidebar에서 제거
5. active Task Scope membership 재평가
```

Task를 Inbox로 옮기지 않는다.

Archived Lists 관리 화면에서 복원한다.

---

# 13.22 Delete List

일반 Delete:

```text
trashList(listId)
```

처리:

```text
1. confirmation
2. list.deletedAt = now
3. list.archivedAt = null
4. child Task.listId 유지
5. child Task.deletedAt 변경 없음
6. active Scope에서 List/Task 제거
```

따라서 사용자가 List 하나를 삭제했다고 Task 수백 개에 개별 mutation을 발생시키지 않는다.

삭제된 List의 Task는 Task Trash에 중복 표시하지 않는다.

---

# 13.23 Restore List

```text
restoreList(listId)
```

처리:

```text
list.deletedAt = null
```

기존:

```text
Task.listId
List.projectId
List.sidebarFolderId
```

관계를 가능한 한 그대로 보존한다.

단 원래 SidebarFolder가 삭제되었다면 root로 표시하고, 원래 Project가 영구 삭제되었다면 standalone List로 복구한다.

---

# 13.24 Permanent Delete List

영구 삭제는 Deleted Lists 관리 화면에서만 제공한다.

강한 confirmation:

```text
이 리스트와 안의 작업을 영구 삭제하시겠습니까?
이 작업은 되돌릴 수 없습니다.
```

canonical operation:

```text
permanentlyDeleteList(listId)
```

한 transaction에서:

```text
TaskSubtask / TaskTag / reminders 등 Task 종속 데이터 삭제
→ Task hard delete
→ ListSection hard delete
→ List hard delete
```

일반 Sidebar Delete에서는 이 operation을 호출하지 않는다.

---

# 13.25 Deleted / Archived List 복구 Surface

Task `Trash` Scope는 Task delete semantics를 유지한다.

삭제된 List를 Task Trash row처럼 섞지 않는다.

List section의 관리 Action에서 별도:

```text
보관된 리스트
삭제된 리스트
```

관리 Surface를 제공한다.

이 Surface는 Task Scope가 아니므로 §12의 9개 Scope Registry를 늘리지 않는다.

---

# 13.26 Project lifecycle model

Project에는:

```text
archivedAt timestamp | null
deletedAt timestamp | null
```

을 둔다.

Project Archive/Delete는 연결 List를 이동시키거나 숨기지 않는다.

Tasks Module에서 List는 계속 정상 owner로 동작한다.

---

# 13.27 Archive Project

```text
archiveProject(projectId)
```

```text
Project.archivedAt = now
Project.deletedAt = null
```

효과:

```text
Spaces active Project navigation에서 제외
List.projectId 유지
Task/List는 Tasks Module에서 계속 표시
```

Project archive가 곧 Task archive를 의미하지 않는다.

---

# 13.28 Delete / Restore Project

일반 Delete:

```text
trashProject(projectId)
→ Project.deletedAt = now
→ List.projectId 유지
```

Tasks Module은 List가 active라면 계속 사용한다.

Spaces active query에서는 deleted Project를 제외한다.

Restore:

```text
restoreProject(projectId)
→ Project.deletedAt = null
```

List relation을 다시 backfill할 필요가 없다.

---

# 13.29 Permanent Delete Project

Project permanent delete에서 List까지 자동 삭제하지 않는다.

canonical operation:

```text
permanentlyDeleteProject(projectId)
```

한 transaction에서:

```text
1. linked List.projectId = null
2. Project hard delete
```

결과:

```text
연결 List → standalone List
Task → 그대로 보존
```

List 삭제를 원하면 사용자가 별도 List delete를 명시적으로 수행한다.

---

# 13.30 Space lifecycle model

Space에도:

```text
archivedAt timestamp | null
deletedAt timestamp | null
```

을 둔다.

Space lifecycle은 직접 List/Task를 mutation하지 않는다.

---

# 13.31 Archive / Delete / Restore Space

Archive:

```text
Space.archivedAt = now
→ Spaces active navigation에서 제외
→ Project.spaceId 유지
```

Delete:

```text
Space.deletedAt = now
→ Spaces active navigation에서 제외
→ Project.spaceId 유지
```

Restore:

```text
Space.deletedAt = null
→ 기존 Project 관계 그대로 복구
```

Tasks Module은 직접 영향받지 않는다.

---

# 13.32 Permanent Delete Space

Space hard delete는 참조 Project가 남아 있으면 차단한다.

```text
exists Project where project.spaceId = targetSpaceId
→ permanent delete 불가
```

사용자는 먼저:

```text
Project를 다른 Space로 이동
또는
Project를 영구 삭제
```

해야 한다.

숨겨진 `Default Space`나 자동 이동 destination을 만들지 않는다.

---

# 13.33 Effective active selectors

UI가 lifecycle 조건을 제각각 판단하지 않도록 selector를 둔다.

```text
isListActive(list)
isProjectActive(project)
isSpaceActive(space)
isTaskActive(task, list)
```

권장:

```text
isListActive
= archivedAt == null AND deletedAt == null

isProjectActive
= archivedAt == null AND deletedAt == null

isSpaceActive
= archivedAt == null AND deletedAt == null

isTaskActive
= task.deletedAt == null AND isListActive(ownerList)
```

Tasks Scope Query는 `isTaskActive`를 공통 precondition으로 사용한다.

---

# 13.34 Domain Command Registry 추가

§6의 command boundary에 다음을 추가한다.

```text
createSubtask
renameSubtask
completeSubtask
reopenSubtask
moveSubtask
trashSubtask
restoreSubtask

archiveList
restoreArchivedList
trashList
restoreList
permanentlyDeleteList

archiveProject
restoreArchivedProject
trashProject
restoreProject
permanentlyDeleteProject

archiveSpace
restoreArchivedSpace
trashSpace
restoreSpace
permanentlyDeleteSpace
```

P1:

```text
setTaskRecurrence
clearTaskRecurrence
completeRecurringOccurrence
addTaskReminder
updateTaskReminder
removeTaskReminder
```

UI component가 lifecycle FK patch를 직접 하지 않는다.

---

# 13.35 Migration 전략

MVP에 필요한 additive migration:

```text
1. TaskSubtask table 추가
2. TaskList.archivedAt 추가
3. TaskList.deletedAt 확인/추가
4. Project.archivedAt/deletedAt 확인/추가
5. Space.archivedAt/deletedAt 확인/추가
6. lifecycle index 추가
```

기존 컬럼이 이미 있다면 재사용한다.

P1 시작 시 별도 additive migration:

```text
TaskRecurrence
TaskRecurrenceOccurrence
TaskReminder
```

사용하지 않는 P1 table을 MVP 때문에 억지로 먼저 만들 필요는 없다.

---

# 13.36 권장 Index

MVP:

```text
TaskSubtask(parentTaskId, deletedAt, sortKey)
TaskList(archivedAt, deletedAt)
Project(archivedAt, deletedAt)
Space(archivedAt, deletedAt)
```

기존 Task index와 결합해 실제 DB query plan을 보고 조정한다.

P1:

```text
TaskRecurrence(taskId)
TaskRecurrenceOccurrence(taskId, scheduledOn/scheduledAt)
TaskReminder(taskId)
TaskReminder(remindAt)
```

---

# 13.37 Acceptance Criteria — Subtask

### DM-AC1

Subtask 생성 시 일반 Task row가 새로 생기지 않는다.

### DM-AC2

Subtask는 Parent Task와 다른 List/Section을 가질 수 없다.

### DM-AC3

Subtask 안에 Subtask를 만들 수 없다.

### DM-AC4

모든 Subtask 완료가 Parent Task를 자동 완료하지 않는다.

### DM-AC5

Parent Task 완료 후 재오픈해도 Subtask 상태가 보존된다.

### DM-AC6

Parent Task soft delete/restore 시 Subtask relation이 그대로 복구된다.

### DM-AC7

Parent Task permanent delete 시 종속 Subtask가 남지 않는다.

---

# 13.38 Acceptance Criteria — Repeat / Reminder Boundary

### DM-AC8

MVP에서는 Repeat/Reminder control이 Drawer/Date Picker에 노출되지 않는다.

### DM-AC9

MVP Task schema에 임시 recurrence/reminder 문자열 field를 추가하지 않는다.

### DM-AC10

P1 Repeat는 structured versioned rule을 사용한다.

### DM-AC11

P1 recurring completion은 occurrence history를 잃지 않는다.

### DM-AC12

date-only Task에 Reminder를 설정할 때 숨은 기본 시간을 사용하지 않는다.

### DM-AC13

Task 완료/Trash 시 pending reminder가 취소된다.

---

# 13.39 Acceptance Criteria — List Lifecycle

### DM-AC14

List Archive/Delete 시 child Task `listId`가 바뀌지 않는다.

### DM-AC15

Archived/Deleted List의 Task는 Today/Upcoming/Tag/Filter 등 active Scope에서 제외된다.

### DM-AC16

List Restore 후 기존 Task가 같은 List로 다시 나타난다.

### DM-AC17

List 일반 Delete가 Task hard delete를 실행하지 않는다.

### DM-AC18

List permanent delete는 Deleted Lists 관리 Surface에서만 가능하다.

---

# 13.40 Acceptance Criteria — Project / Space Lifecycle

### DM-AC19

Project Archive/Delete가 연결 List/Task를 Tasks Module에서 자동 제거하지 않는다.

### DM-AC20

Project Restore 후 기존 List relation이 그대로 복구된다.

### DM-AC21

Project permanent delete 시 연결 List는 `projectId = null`인 standalone List로 보존된다.

### DM-AC22

Space Archive/Delete가 Task/List row를 직접 수정하지 않는다.

### DM-AC23

참조 Project가 남아 있으면 Space permanent delete가 실패한다.

### DM-AC24

어떤 container lifecycle command도 active Task를 owner 없는 상태로 만들지 않는다.

---

# 13.41 §13 확정 결정

- **DM-D1.** MVP Subtask는 별도 `TaskSubtask` entity를 사용한다.
- **DM-D2.** Subtask는 1단계만 지원하며 독립 List/Date/Priority/Tag/Repeat/Reminder를 갖지 않는다.
- **DM-D3.** 모든 Subtask 완료는 Parent 자동 완료 조건이 아니다.
- **DM-D4.** Parent soft delete는 Subtask를 보존하고 Parent hard delete만 Subtask hard cascade를 허용한다.
- **DM-D5.** Repeat는 MVP에서 숨기고 P1에서 versioned structured recurrence model로 활성화한다.
- **DM-D6.** Reminder도 MVP에서 숨기고 P1에서 별도 `TaskReminder` entity로 활성화한다.
- **DM-D7.** Reminder data model은 다중 row를 허용하지만 초기 UI는 1개부터 시작할 수 있다.
- **DM-D8.** Active Task Scope는 Task뿐 아니라 owner List가 active인지도 공통 precondition으로 검사한다.
- **DM-D9.** List Archive/Delete는 Task owner relation을 변경하지 않고 List lifecycle state로 visibility를 제어한다.
- **DM-D10.** Deleted List의 Task를 Task Trash에 중복 표시하지 않는다.
- **DM-D11.** List permanent delete만 명시적 hard cascade를 허용한다.
- **DM-D12.** Project Archive/Delete는 Tasks Module의 연결 List/Task visibility를 자동 변경하지 않는다.
- **DM-D13.** Project permanent delete는 연결 List를 standalone으로 detach하고 Task를 보존한다.
- **DM-D14.** Space Archive/Delete는 Project relation을 restore 가능하게 유지한다.
- **DM-D15.** Space permanent delete는 참조 Project가 남아 있으면 차단한다.
- **DM-D16.** Container lifecycle mutation은 UI patch가 아니라 공통 domain command로 처리한다.
- **DM-D17.** P1 recurrence/reminder schema는 해당 기능 착수 시 additive migration으로 도입한다.

---

# 14. Implementation Contract / Registry · Query · Domain Command Boundary

## 14.1 목적

§12는 **제품 행동의 단일 기준**, §13은 **데이터와 lifecycle의 단일 기준**을 정의했다.

§14의 목적은 이 둘을 실제 코드가 그대로 따를 수 있도록 다음 경계를 확정하는 것이다.

```text
제품 규칙
§12 Canonical Behavior Registry
        +
데이터 불변식 / lifecycle
§6 + §13
        ↓
구현 계약
§14
        ↓
UI / Query / Mutation / Persistence
```

이 절은 새로운 UX를 추가하지 않는다.

핵심 질문은 다음이다.

```text
1. Scope는 어떤 타입으로 전달되는가?
2. Registry는 무엇을 소유하고 무엇을 소유하지 않는가?
3. Query와 client-side membership 판정이 어떻게 같은 의미를 유지하는가?
4. 생성 전에 owner/필수 입력/자동 속성을 누가 확정하는가?
5. Mutation의 원자적 경계는 어디인가?
6. 실패·충돌·Undo 시 누가 원상복구를 책임지는가?
7. UI가 직접 DB field를 patch하지 못하게 어떻게 막는가?
```

---

## 14.2 구현 우선순위

구현 시 다음 우선순위를 따른다.

```text
Data invariant (§6 / §13)
>
Canonical behavior (§12)
>
Implementation contract (§14)
>
개별 component convenience
```

즉 component 구현이 더 간단하다는 이유로 §12/§13 의미를 바꾸지 않는다.

§14의 타입/API 예시는 구현 언어에 맞게 이름을 바꿀 수 있지만 다음은 바꾸지 않는다.

```text
- owner 결정 위치
- query semantics
- mutation atomicity
- validation 책임
- scope 재평가 방식
- error category
- optimistic / rollback 원칙
```

---

## 14.3 전체 Layer Boundary

권장 구조:

```text
┌─────────────────────────────────────────┐
│ Presentation                            │
│ React View / Sidebar / Drawer / QuickAdd│
└────────────────────┬────────────────────┘
                     │ intent
                     ▼
┌─────────────────────────────────────────┐
│ Application                             │
│ scope registry / create resolver        │
│ query service / command dispatcher      │
└───────────────┬────────────────┬────────┘
                │ read           │ command
                ▼                ▼
┌───────────────────────┐  ┌───────────────────────┐
│ Query / Selector       │  │ Domain Command        │
│ canonical scope query │  │ invariant + validation│
│ matchesScope          │  │ atomic mutation       │
└───────────┬───────────┘  └───────────┬───────────┘
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────┐
│ Repository / Transaction / Persistence  │
│ DB / Supabase                           │
└─────────────────────────────────────────┘
```

금지:

```text
Component
→ supabase.from('tasks').update(...)
```

허용:

```text
Component
→ commandDispatcher.execute(setTaskDueDate(...))
```

Read도 같은 원칙을 사용한다.

금지:

```text
TodayPage.tsx
→ 자체 where 조합
```

허용:

```text
TodayPage.tsx
→ taskQueryService.queryScope(todayScope)
```

---

## 14.4 Canonical Scope Reference 타입

`kind`만 전달하면 List/Tag/Filter 같은 instance를 식별할 수 없다.

따라서 `TaskScopeRef`를 discriminated union으로 고정한다.

```ts
type TaskScopeRef =
  | { kind: 'today'; date: LocalDate }
  | { kind: 'upcoming'; startDate: LocalDate; endDate: LocalDate }
  | { kind: 'inbox' }
  | { kind: 'list'; listId: ListId }
  | { kind: 'folder'; sidebarFolderId: SidebarFolderId }
  | { kind: 'tag'; tagId: TagId }
  | { kind: 'filter'; filterId: FilterId }
  | { kind: 'completed' }
  | { kind: 'trash' }
```

`today.date`와 `upcoming.startDate/endDate`는 서버 UTC date를 그대로 쓰지 않는다.

반드시:

```text
user timezone
→ local calendar date
```

를 기준으로 만든다.

`Upcoming` 기본 factory:

```ts
makeUpcomingScope(userToday)
→ {
    kind: 'upcoming',
    startDate: userToday,
    endDate: userToday + 6 days
  }
```

UI가 임의로 `+7`을 다시 계산하지 않는다.

---

## 14.5 Navigation Scope와 Query Scope 분리

URL parser는 **식별 가능한 navigation state**만 만든다.

```ts
type TaskNavigationState = {
  scope: TaskScopeRef
  view: TaskViewKind
  openTaskId?: TaskId
}
```

URL parser가 하지 않는 것:

```text
- Today query 실행
- Folder child List 조회
- Filter 조건 해석
- Tag membership 계산
- create owner 결정
```

흐름:

```text
URL
→ parseNavigationState()
→ TaskScopeRef
→ validateView(scope, requestedView)
→ queryScope(scope)
```

이 분리로 URL layer와 domain/query layer가 서로 침범하지 않는다.

---

## 14.6 Canonical Scope Policy 타입

§12의 Registry를 다음 수준으로 고정한다.

```ts
type TaskScopePolicy<K extends TaskScopeKind = TaskScopeKind> = {
  kind: K

  allowedViews: readonly TaskViewKind[]
  defaultView: TaskViewKind

  canCreate: boolean
  canManualReorder: boolean

  countMode: 'active' | 'completed' | 'trash'

  resolveCreate: ResolveCreateContext<K>
  getDefaultSort: GetDefaultSort<K>
  getGrouping: GetGrouping<K>
  getMetadataPolicy: GetMetadataPolicy<K>
}
```

중요:

`matchesScope`는 Registry의 임의 callback으로 각 Scope마다 따로 작성하지 않는 것을 권장한다.

대신 아래 §14.13의 **공통 Scope Predicate Compiler**를 사용한다.

이유:

```text
Registry callback 9개
+
server query 9개
```

를 따로 관리하면 두 의미가 다시 갈라질 수 있다.

---

## 14.7 View Registry 계약

§12의 MVP Registry를 그대로 사용한다.

```ts
const taskScopeViewRegistry = {
  today: ['list'],
  upcoming: ['list'],
  inbox: ['list', 'board'],
  list: ['list', 'board'],
  folder: ['list'],
  tag: ['list'],
  filter: ['list'],
  completed: ['list'],
  trash: ['list'],
} as const
```

공통 API:

```ts
getAllowedViews(scope: TaskScopeRef): readonly TaskViewKind[]
getDefaultView(scope: TaskScopeRef): TaskViewKind
isViewAllowed(scope: TaskScopeRef, view: TaskViewKind): boolean
canonicalizeView(scope: TaskScopeRef, requested?: string): TaskViewKind
```

`canonicalizeView()` 결과가 URL과 다르면 Navigation layer가 `replaceState`를 수행한다.

Registry가 직접 browser history를 조작하지 않는다.

---

## 14.8 Create Resolver 결과를 discriminated union으로 변경

기존의:

```ts
targetListId: string | null
requiredBeforeCommit: ...
```

형태는 `null`의 의미가 모호하다.

§14에서는 다음으로 고정한다.

```ts
type CreateResolution =
  | {
      status: 'ready'
      plan: CreateTaskPlan
    }
  | {
      status: 'needs-input'
      fields: readonly CreateRequiredField[]
      partial: PartialCreateTaskPlan
    }
  | {
      status: 'disabled'
      reason: 'scope-readonly' | 'permission-denied'
    }
```

```ts
type CreateRequiredField =
  | 'list'
  | 'date'
```

이렇게 하면:

```text
Folder
→ needs-input(list)

Upcoming
→ needs-input(date)

Completed
→ disabled(scope-readonly)

Today
→ ready
```

가 타입으로 분리된다.

`targetListId = null`을 `createTask()`에 전달하는 경로 자체를 없앤다.

---

## 14.9 CreateTaskPlan

Task 생성은 Task row만 만드는 operation이 아니다.

Today/Tag/Filter에서는 relation write가 함께 필요하다.

따라서 resolver의 최종 결과를 다음처럼 정의한다.

```ts
type CreateTaskPlan = {
  targetListId: ListId

  task: {
    title: string
    description?: string
    priority?: TaskPriority
    dueOn?: LocalDate | null
    dueAt?: ZonedDateTime | null
    someday?: boolean
    sectionId?: ListSectionId | null
  }

  relations: {
    tagIds?: readonly TagId[]
    dailyPlan?: {
      planDate: LocalDate
      sortKey?: string
    }
  }
}
```

`CreateTaskPlan`에는 다음이 들어가지 않는다.

```text
projectId
spaceId
sidebarFolderId
```

Task의 canonical owner는 List이기 때문이다.

---

## 14.10 resolveCreateContext 입력 계약

```ts
type ResolveCreateInput = {
  scope: TaskScopeRef
  placement?:
    | { kind: 'header' }
    | { kind: 'list-section'; sectionId: ListSectionId }
    | { kind: 'inbox-bucket'; bucket: 'unclassified' | 'scheduled' | 'someday' }

  draft: {
    title: string
    selectedListId?: ListId
    selectedDate?: LocalDate
  }

  context: {
    inboxListId: ListId
    permittedListIds: ReadonlySet<ListId>
    folderChildListIds?: readonly ListId[]
    compiledFilter?: CompiledSavedFilter
  }
}
```

Canonical resolver 결과:

### Today

```text
ready
owner = Inbox
relations.dailyPlan.planDate = Today scope date
```

List를 사용자가 Quick Add에서 명시적으로 바꾸면:

```text
owner = selected List
TodayPlan 유지
```

### Upcoming

```text
selectedDate 없음
→ needs-input(date)

selectedDate 있음 AND scope.startDate <= selectedDate <= scope.endDate
→ ready
→ owner = selected List 또는 Inbox
→ dueOn = selectedDate

selectedDate가 현재 Upcoming horizon 밖
→ VALIDATION_FAILED(field=date)
```

이 규칙은 **Upcoming Context Quick Add**에만 적용한다. Global Quick Add에서는 임의 미래 날짜를 선택할 수 있다.

현재 Scope에서 생성한 Task가 생성 직후 바로 사라지는 UX를 피하기 위한 규칙이다.

### Inbox

```text
owner = Inbox
```

### Inbox scheduled

```text
date 없음
→ needs-input(date)

date 있음
→ owner = Inbox
→ dueOn = date
→ someday = false
```

### Inbox someday

```text
owner = Inbox
someday = true
dueOn = null
dueAt = null
```

### List

```text
owner = current List
```

Section placement:

```text
sectionId = current section
```

### Folder

```text
selectedList 없음
→ needs-input(list)

selectedList ∉ current Folder child Lists
→ validation error

selectedList valid
→ ready
```

### Tag

```text
owner = selected List 또는 Inbox
current tag relation 자동 추가
```

### Filter

```text
filter가 exact single owner List를 결정
→ owner = that List

그 외
→ selected List가 있으면 selected List
→ 없으면 Inbox

create-applicable positive condition만 patch/relation으로 추가
```

### Completed / Trash

```text
disabled(scope-readonly)
```

---

## 14.11 Filter create-applicable condition compiler

Saved Filter 전체 조건을 Create Resolver가 직접 해석하지 않는다.

공통 compiler를 둔다.

```ts
compileFilterCreatePatch(filterSpec)
→ {
    exactOwnerListId?: ListId
    taskPatch: TaskCreatePatch
    tagIds: TagId[]
    unappliedConditionCount: number
  }
```

Allowlist 예:

```text
list == X
 tag == X
 due == today / explicit date
 priority == X
 someday == true
```

자동 적용 금지:

```text
NOT
contains text
created before/after
completed == true
multiple alternative owner Lists
relative condition whose create meaning is ambiguous
```

Filter UI와 Quick Add가 별도로 이 로직을 구현하지 않는다.

---

## 14.12 Query Request / Response 계약

모든 Scope Query는 공통 형태를 사용한다.

```ts
type TaskScopeQueryRequest = {
  actorId: UserId
  workspaceId: WorkspaceId
  scope: TaskScopeRef
  view: TaskViewKind
  cursor?: string
  limit?: number
}
```

```ts
type TaskScopeQueryResult = {
  rows: readonly TaskReadModel[]
  nextCursor?: string
  totalCount?: number
  groups?: readonly TaskGroupReadModel[]
}
```

`rows`와 `groups`를 동시에 어떤 방식으로 사용할지는 View adapter가 결정한다.

Query service는 Presentation JSX structure를 반환하지 않는다.

---

## 14.13 Scope Predicate Compiler

Server Query와 client optimistic membership이 같은 의미를 유지하려면 **한 번 정의한 Scope 의미를 두 표현으로 compile**한다.

Client predicate가 DB를 다시 조회하지 않도록 평가에 필요한 canonical snapshot을 명시한다.

```ts
type TaskScopeSnapshot = {
  task: TaskFilterableSnapshot
  ownerList: {
    id: ListId
    kind: 'inbox' | 'regular'
    archivedAt: string | null
    deletedAt: string | null
  }
  tagIds: ReadonlySet<TagId>
  dailyPlanDates: ReadonlySet<LocalDate>
}
```

```ts
type ScopeEvaluationContext = {
  userTimeZone: string
  userToday: LocalDate
  folderChildListIds?: ReadonlySet<ListId>
  compiledFilter?: CompiledSavedFilter
}
```

`TaskFilterableSnapshot`은 Saved Filter가 실제로 참조할 수 있는 Task 필드만 포함한다. UI Read Model 전체를 predicate 입력으로 사용하지 않는다.

개념:

```ts
compileScope(scope, evaluationContext)
→ {
    serverQuery: QuerySpec
    clientPredicate: (snapshot: TaskScopeSnapshot) => boolean
  }
```

또는 실제 기술 제약상 같은 compiler를 공유할 수 없다면 최소한 다음을 공유한다.

```text
Canonical Scope Spec
↓                ↓
DB Query Builder  Client Predicate Builder
```

금지:

```text
queryTodayTasks() 안의 조건을 손으로 작성
+
matchesScope(today) 조건을 또 손으로 작성
```

Today canonical spec:

```text
isTaskActive
AND
(
  effectiveDueDate < today
  OR effectiveDueDate == today
  OR DailyPlan.planDate == today
)
```

Upcoming:

```text
isTaskActive
AND
effectiveDueDate BETWEEN startDate AND endDate
```

Inbox:

```text
isTaskActive
AND
ownerList.kind == inbox
```

List:

```text
isTaskActive
AND
Task.listId == scope.listId
```

Folder:

```text
isTaskActive
AND
Task.listId IN current SidebarFolder child List ids
```

Tag:

```text
isTaskActive
AND
TaskTag(tagId = scope.tagId) exists
```

Filter:

```text
isTaskActive
AND
compiled SavedFilter predicate
```

Completed:

```text
Task.deletedAt == null
AND
ownerList active
AND
Task.completedAt != null
```

Trash:

```text
Task.deletedAt != null
AND
ownerList.deletedAt == null
```

List 자체가 deleted인 Task는 §13 Deleted Lists surface에서 다룬다.

---

## 14.14 Query Semantic Fixture

Server와 client 구현이 완전히 같은 코드를 공유하기 어렵기 때문에 semantic fixture를 둔다.

예:

```ts
type ScopeFixture = {
  name: string
  scope: TaskScopeRef
  task: TaskScopeSnapshot
  expectedMatch: boolean
}
```

필수 fixture:

```text
- overdue active Task → Today true
- future TodayPlan Task → Today true
- due 없는 TodayPlan Task → Upcoming false
- archived List Task → all active Scope false
- deleted Task → Trash true / Completed false
- Inbox + TodayPlan → Inbox true / Today true
- Tag removed → Tag false
- Folder child List 이동 → old Folder false
- Completed active List Task → Completed true
- completed + deleted Task → Completed false / Trash true
```

동일 fixture를:

```text
DB query integration test
client predicate unit test
```

둘 다 통과해야 한다.

---

## 14.15 Count Query 계약

Count는 별도 의미를 만들지 않는다.

```ts
countScope(requestWithoutPagination)
```

는:

```text
compileScope(scope)
```

의 동일 predicate를 사용하되 projection만 `COUNT`로 바꾼다.

금지:

```text
SidebarTodayCountRepository
→ 별도 Today where
```

허용:

```text
scopeQueryService.count(todayScope)
```

Completed/Trash 전체 count는 비용상 생략할 수 있지만, 표시한다면 같은 membership을 사용한다.

---

## 14.16 Sorting / Grouping Contract

Query membership과 presentation ordering을 분리한다.

```ts
type ScopeQueryPlan = {
  predicate: CanonicalPredicate
  sort: CanonicalSortSpec
  grouping: CanonicalGroupingSpec
}
```

Sort가 membership을 바꾸지 않는다.

Grouping도 membership을 바꾸지 않는다.

예:

```text
Today
membership = overdue / due today / TodayPlan
sort = TodayPlan sortKey → time → priority → stable
group = overdue / today
```

`overdue / today` grouping 때문에 Today predicate를 두 번 구현하지 않는다.

---

## 14.17 Domain Command Envelope

모든 mutation은 공통 envelope를 가진다.

```ts
type CommandEnvelope<TPayload> = {
  commandId: string
  actorId: UserId
  workspaceId: WorkspaceId
  payload: TPayload

  expected?: {
    entityUpdatedAt?: string
  }
}
```

`commandId`는 동일 요청 재전송 시 중복 mutation을 방지할 수 있도록 idempotency key로 사용할 수 있다.

MVP에서 서버 idempotency 저장소까지 구현하지 않더라도 API signature에는 자리를 둔다.

`expected.entityUpdatedAt`은 편집 충돌 감지에 사용할 수 있다.

---

## 14.18 공통 Command Result

```ts
type CommandResult<T> =
  | {
      ok: true
      data: T
      canonical: CanonicalMutationSnapshot
      undo?: UndoDescriptor
    }
  | {
      ok: false
      error: DomainCommandError
    }
```

```ts
type CanonicalMutationSnapshot = {
  tasks?: readonly TaskReadModel[]
  subtasks?: readonly TaskSubtask[]
  lists?: readonly TaskList[]
  projects?: readonly Project[]
  spaces?: readonly Space[]
}
```

성공 결과는 UI가 추측한 patch가 아니라 **서버가 확정한 canonical state**를 반환한다.

UI는 성공 시 optimistic state를 canonical result로 reconcile한다.

---

## 14.19 Domain Error Taxonomy

문자열 error message를 제품 로직으로 분기하지 않는다.

```ts
type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'STALE_WRITE'
  | 'INVALID_OWNER'
  | 'INVALID_SECTION'
  | 'SCOPE_READ_ONLY'
  | 'RESTORE_TARGET_REQUIRED'
  | 'PERMANENT_DELETE_BLOCKED'
  | 'PRECONDITION_FAILED'
```

```ts
type DomainCommandError = {
  code: DomainErrorCode
  messageKey: string
  field?: string
  retryable: boolean
  details?: Record<string, unknown>
}
```

UI는 `messageKey`를 사용자 문구로 mapping한다.

Domain layer가 한국어 Toast 문자열을 반환하지 않는다.

---

## 14.20 Validation 책임

### UI validation

빠른 피드백용:

```text
- title empty
- Upcoming date 미선택
- Folder List 미선택
```

### Application / Resolver validation

Context UX 의미를 검사:

```text
- Folder create target이 현재 Folder child List인지
- Upcoming Context create date가 현재 horizon 안인지
- Filter auto-apply가 allowlist 조건인지
```

### Domain validation

반드시 다시 검사:

```text
- target List 존재
- actor가 List 접근 가능
- section이 target List 소속
- active Task listId NOT NULL
- someday와 due 공존 금지
- restore target이 유효한지
- permanent delete prerequisite
```

### DB constraint

최후의 무결성:

```text
- FK
- NOT NULL
- unique
- enum/check
```

UI validation 통과가 Domain validation을 생략하는 근거가 아니다.

---

## 14.21 Transaction Boundary

한 사용자 action이 여러 canonical row를 변경하면 하나의 transaction으로 처리한다.

반드시 atomic:

```text
Today create
→ Task insert + TaskDailyPlan insert

Tag create
→ Task insert + TaskTag insert

Filter create
→ Task insert + applicable TaskTag / DailyPlan relation

moveTask
→ listId + sectionId validation/reset + sortKey

setTaskSomeday(true)
→ someday=true + dueOn/dueAt clear

Inbox scheduled → someday
→ someday=true + due clear

restore Task with new owner
→ deletedAt clear + listId assign + section validation

List permanent delete
→ §13 cascade policy 전체

Project permanent delete
→ linked List projectId detach + Project delete
```

부분 성공을 허용하지 않는다.

예:

```text
Task는 생성됐는데 Tag relation insert 실패
```

같은 상태가 남으면 안 된다.

---

## 14.22 Task Core Command Registry

MVP Task command를 다음으로 고정한다.

```text
createTask
renameTask
updateTaskDescription
setTaskPriority
setTaskDueDate
clearTaskDueDate
setTaskSomeday
addTaskTag
removeTaskTag
moveTask
moveTaskWithinList
moveTaskToSection
moveInboxTaskToBucket
completeTask
reopenTask
trashTask
restoreTask
permanentlyDeleteTask
setTaskTodayPlan
clearTaskTodayPlan
```

`Today 전체 자유 reorder`는 MVP OFF이므로 `reorderTodayTask`는 MVP command에 넣지 않는다.

---

## 14.23 `createTask` 계약

입력:

```ts
createTask(plan: CreateTaskPlan)
```

Precondition:

```text
- targetListId required
- target List active
- actor permission
- sectionId가 있으면 target List 소속
- someday=true이면 due 없음
```

원자적 write:

```text
Task
+ TaskTag[]
+ TaskDailyPlan?
```

Postcondition:

```text
Task.listId != null
Task.projectId 없음
Task.spaceId 없음
```

`createTask()`가 Context를 다시 추론하지 않는다.

Context 해석은 `resolveCreateContext()`의 책임이다.

---

## 14.24 `setTaskDueDate` 계약

```ts
setTaskDueDate(taskId, due)
```

날짜를 부여하면:

```text
someday = false
```

를 함께 보장한다.

```text
due.kind = date-only
→ dueOn = local date
→ dueAt = null

due.kind = date-time
→ dueAt = zoned timestamp
→ dueOn = null
```

`effectiveDueDate`가 필요하면 §6처럼 `dueAt`을 사용자 timezone의 날짜로 변환해 계산한다.

Date-only Task에 임의 `23:59` 같은 hidden time을 넣지 않는다.

---

## 14.25 `setTaskSomeday` 계약

§6 규칙을 command contract로 고정한다.

```ts
setTaskSomeday(taskId, true)
```

원자적으로:

```text
someday = true
dueOn = null
dueAt = null
```

```ts
setTaskSomeday(taskId, false)
```

는:

```text
someday = false
```

만 수행하고 임의 due date를 만들지 않는다.

---

## 14.26 `moveTask` 계약

```ts
moveTask(taskId, {
  targetListId,
  targetSectionId?: ListSectionId | null,
  beforeTaskId?: TaskId,
  afterTaskId?: TaskId,
})
```

검증:

```text
- target List active
- permission
- targetSectionId가 target List 소속
```

Target List가 바뀌면 기존 `sectionId`를 그대로 들고 가지 않는다.

```text
targetSection 명시
→ 해당 Section

미지정
→ sectionId = null
```

새 `sortKey`는 target ordering context 안에서 생성한다.

Task Tag / Due / TodayPlan은 List 이동만으로 제거하지 않는다.

Project/Space relation은 List를 통해 파생되므로 Task row에 patch하지 않는다.

---

## 14.27 `moveTaskWithinList` / `moveTaskToSection`

Manual sort가 허용된 상태에서만 호출한다.

```ts
moveTaskWithinList(taskId, anchor)
```

은:

```text
Task.sortKey
```

만 재계산하고 membership 의미를 바꾸지 않는다.

```ts
moveTaskToSection(taskId, sectionId, anchor?)
```

은:

```text
sectionId
+ Task.sortKey
```

를 원자적으로 변경한다.

Derived sort에서 command 호출 자체를 UI에서 차단하고, Domain에서도 precondition을 둘 수 있다.

---

## 14.28 `moveInboxTaskToBucket` 계약

Inbox Board virtual column을 위한 semantic command다.

```ts
moveInboxTaskToBucket(taskId, target)
```

### unclassified

```text
someday = false
dueOn = null
dueAt = null
```

### scheduled

날짜가 없으면 바로 commit하지 않는다.

```text
needs-input(date)
```

날짜가 확정되면:

```text
someday = false
dueOn/dueAt = selected due
```

### someday

```text
someday = true
dueOn = null
dueAt = null
```

어떤 경우에도 `sectionId`를 Inbox Board column 저장용으로 사용하지 않는다.

---

## 14.29 Completion Command

```ts
completeTask(taskId, completedAt)
```

```text
completedAt = server-authoritative timestamp
```

을 권장한다.

```ts
reopenTask(taskId)
```

```text
completedAt = null
```

완료/재오픈은 List owner, Tags, TodayPlan, Due를 변경하지 않는다.

반복 Task는 MVP에서 숨겨져 있으므로 일반 `completeTask`가 recurrence를 암묵적으로 처리하지 않는다.

P1에서는 `completeRecurringOccurrence`로 별도 분기한다.

---

## 14.30 Trash / Restore Command

```ts
trashTask(taskId)
```

```text
deletedAt = server timestamp
```

일반 삭제는 hard delete가 아니다.

```ts
restoreTask(taskId, targetListId?)
```

원래 owner List가 active면:

```text
targetListId optional
→ 원래 List 사용
```

원래 List가 없거나 deleted/archived로 복원 불가능하면:

```text
RESTORE_TARGET_REQUIRED
```

를 반환한다.

UI가 target을 받은 뒤 command를 다시 실행한다.

기본 제안은 Inbox이지만 Domain이 자동으로 Inbox를 선택하지 않는다.

```ts
permanentlyDeleteTask(taskId)
```

은 Trash 상태에서만 허용하고 Undo를 제공하지 않는다.

Subtask hard cascade는 §13을 따른다.

---

## 14.31 Today Plan Command

```ts
setTaskTodayPlan(taskId, planDate)
clearTaskTodayPlan(taskId, planDate)
```

TodayPlan은 Due와 독립이다.

금지:

```text
setTaskTodayPlan
→ due=today 자동 변경
```

`clearTaskTodayPlan()` 후에도 due가 과거/오늘이면 Today membership이 유지될 수 있다.

따라서 command 자체가 "Today에서 제거"를 보장하지 않는다.

제거 여부는 `matchesScope` 재평가 결과다.

---

## 14.32 Tag Command

```ts
addTaskTag(taskId, tagId)
removeTaskTag(taskId, tagId)
```

DB unique:

```text
unique(taskId, tagId)
```

동일 Tag add 재시도는 가능하면 idempotent하게 처리한다.

현재 Tag Scope에서 `removeTaskTag` 성공 후:

```text
matchesScope = false
```

이면 optimistic remove / canonical reconcile 규칙을 따른다.

---

## 14.33 Subtask Command 계약 연결

§13의:

```text
createSubtask
renameSubtask
completeSubtask
reopenSubtask
moveSubtask
trashSubtask
restoreSubtask
```

는 모두 parent Task를 통해 permission을 검증한다.

Subtask mutation이 Parent Task의:

```text
listId
due
tag
priority
```

를 암묵적으로 변경하지 않는다.

`moveSubtask`는 parent 내부 sortKey만 바꾼다.

---

## 14.34 Container Command 계약 연결

§13 lifecycle command는 다음 원칙을 따른다.

```text
archiveList / trashList / restoreList / permanentlyDeleteList
archiveProject / trashProject / restoreProject / permanentlyDeleteProject
archiveSpace / trashSpace / restoreSpace / permanentlyDeleteSpace
```

공통:

```text
UI가 archivedAt/deletedAt/FK를 직접 patch하지 않는다.
```

특히:

```text
permanentlyDeleteProject
→ linked List projectId detach
→ Project hard delete
```

는 하나의 transaction이다.

```text
permanentlyDeleteSpace
→ 참조 Project 존재 검사
→ 존재하면 PERMANENT_DELETE_BLOCKED
```

로 처리한다.

---

## 14.35 Command Permission Boundary

UI에서 button을 숨기는 것은 보안이 아니다.

모든 command는 서버/domain boundary에서:

```text
actor
workspace
entity ownership/membership
role/permission
```

을 검증한다.

Query 결과를 봤다는 사실만으로 mutation permission을 추론하지 않는다.

---

## 14.36 Optimistic Mutation Eligibility

모든 mutation을 optimistic하게 만들 필요는 없다.

### Optimistic 권장

```text
renameTask
setTaskPriority
setTaskDueDate
setTaskSomeday
add/remove Tag
moveTaskWithinList
moveTaskToSection
moveInboxTaskToBucket
complete/reopen
trashTask
set/clear TodayPlan
```

### 서버 확인 후 반영 권장

```text
restore with uncertain target
permanentlyDeleteTask
permanentlyDeleteList
permanentlyDeleteProject
permanentlyDeleteSpace
permission-sensitive complex lifecycle mutation
```

Destructive hard delete를 먼저 화면에서 낙관적으로 없애고 서버 실패 후 되살리는 UX는 피한다.

---

## 14.37 Optimistic Mutation Pipeline

공통 pipeline:

```text
1. capture canonical local snapshot
2. derive optimistic entity patch
3. apply local patch
4. re-evaluate current Scope with clientPredicate
5. update Main / Drawer / visible Count projection
6. execute Domain Command
7A. success
    → replace optimistic state with canonical result
    → re-evaluate Scope again
7B. failure
    → rollback exact captured snapshot
    → re-evaluate Scope
    → error feedback
```

중요:

```text
optimistic UI에서 "이 Scope에서 빠질 것 같다"고 별도 if 문을 쓰지 않는다.
```

항상 같은 `clientPredicate`를 호출한다.

---

## 14.38 Drawer와 Mutation Reconciliation

현재 Drawer Task가 mutation 후 Scope를 벗어나면:

```text
Main에서 remove
+
Drawer close
```

를 기본으로 한다.

단, mutation 실패 시:

```text
snapshot rollback
→ 이전 membership 복구
→ 필요한 경우 Drawer reopen 상태 복구
```

가 가능해야 한다.

따라서 optimistic mutation snapshot에는 최소:

```text
entity state
current scope
openTaskId
```

가 포함되어야 한다.

Browser history 의미는 §5 규칙을 유지한다.

UI rollback 때문에 임의 `pushState`를 만들지 않는다.

---

## 14.39 Undo Descriptor

MVP Undo는 reload를 넘어 보존하지 않는다.

서버에 별도 Undo history table을 만들 필요는 없다.

권장:

```ts
type UndoDescriptor = {
  labelKey: string
  inverse: DomainCommandInvocation
  expectedUpdatedAt?: string
  expiresAt: number
}
```

예:

```text
trashTask
→ inverse = restoreTask(original owner)

completeTask
→ inverse = reopenTask

moveTask
→ inverse = moveTask(original list/section/sort anchor)
```

Undo도 raw DB rollback이 아니라 **Domain Command**를 호출한다.

Undo 전에 entity가 다른 곳에서 수정됐다면 `STALE_WRITE`가 날 수 있다.

이 경우 오래된 snapshot을 강제로 덮어쓰지 않는다.

---

## 14.40 Conflict / Stale Write 정책

MVP 기본은 lightweight last-write model을 유지하되, destructive/structural mutation에는 precondition을 둔다.

권장:

```text
단순 title/priority
→ latest successful server result canonical

move / restore / lifecycle / permanent delete
→ expected updatedAt 또는 structural precondition 확인
```

서버가 `STALE_WRITE`를 반환하면:

```text
optimistic rollback
→ 최신 entity refetch
→ "다른 위치에서 변경되었습니다" 수준의 오류
```

자동 merge는 MVP에서 하지 않는다.

긴 Description 동시 편집 conflict는 별도 P1 범위다.

---

## 14.41 Query Cache / Invalidation 원칙

Mutation 성공 후 Scope별 cache key를 사람이 일일이 나열하는 방식을 피한다.

권장 dependency:

```text
Task entity mutation
→ task entity cache update
→ visible Scope predicate 재평가
→ 관련 aggregate count stale 처리
```

Container lifecycle:

```text
List mutation
→ List cache
→ active Task scope query/count invalidation

Project/Space mutation
→ 해당 module query invalidation
→ Tasks는 §13 semantics에 따라 필요한 경우에만 영향
```

특히 Project archive 때문에 모든 Task query를 무조건 비우지 않는다.

Project archive는 Tasks Module의 List/Task visibility를 바꾸지 않기 때문이다.

---

## 14.42 Stable Ordering / sortKey 서비스

`sortKey` 생성 알고리즘을 component에서 구현하지 않는다.

공통:

```ts
sortKeyService.between(before?, after?)
sortKeyService.append(last?)
sortKeyService.prepend(first?)
```

을 둔다.

Ordering context:

```text
Inbox List
List + sectionId
Inbox Board bucket
Subtask parent
```

마다 같은 알고리즘을 재사용한다.

필요 시 background rebalance를 할 수 있지만 사용자가 reorder한 의미는 유지해야 한다.

---

## 14.43 Read Model과 Write Model 분리

UI가 DB row shape에 직접 묶이지 않게 한다.

예:

```ts
type TaskReadModel = {
  id: TaskId
  title: string
  completed: boolean
  deleted: boolean
  ownerList: {
    id: ListId
    name: string
  }
  due: TaskDueReadModel | null
  priority: TaskPriority
  tags: readonly TagChipReadModel[]
  subtaskProgress?: {
    completed: number
    total: number
  }
}
```

DB의:

```text
completedAt
deletedAt
listId
```

를 UI가 매번 presentation 형태로 해석하지 않는다.

반대로 Command payload에 `TaskReadModel` 전체를 보내지 않는다.

필요한 intent만 보낸다.

---

## 14.44 Scope Query Adapter와 View Adapter

Query 결과는 Scope semantics를 책임지고, View adapter는 표현만 책임진다.

```text
queryScope(scope)
→ canonical Task rows
→ ListViewAdapter
or
→ BoardViewAdapter
```

Inbox Board:

```text
같은 Inbox query result
→ virtual bucket projector
```

List Board:

```text
같은 List query result
→ ListSection projector
```

Board를 위해 별도의 "다른 Task 집합"을 조회하지 않는다.

List/List Board 간 전환 시 membership이 달라져서는 안 된다.

---

## 14.45 권장 파일 경계

현재 TypeScript/React 구조에서는 다음 정도로 분리하는 것을 권장한다.

```text
src/domain/tasks/
  scope/
    types.ts
    scopeRegistry.ts
    viewRegistry.ts
    compileScope.ts
    scopeFixtures.ts

  create/
    resolveCreateContext.ts
    compileFilterCreatePatch.ts

  commands/
    taskCommands.ts
    todayPlanCommands.ts
    subtaskCommands.ts
    listLifecycleCommands.ts
    projectLifecycleCommands.ts
    spaceLifecycleCommands.ts

  queries/
    taskScopeQueryService.ts
    taskScopeCountService.ts

  ordering/
    sortKeyService.ts

  errors/
    domainErrors.ts

src/app/tasks/
  commandDispatcher.ts
  optimisticMutation.ts
  taskReadModel.ts

src/components/tasks/
  TaskListView.tsx
  TaskBoardView.tsx
  TaskDetailDrawer.tsx
  QuickAdd.tsx
```

실제 repo 구조에 맞게 폴더명은 조정할 수 있다.

중요한 것은 **UI / Registry / Query / Command / Persistence 책임이 섞이지 않는 것**이다.

---

## 14.46 직접 import 금지 규칙

가능하면 lint/module boundary로 다음을 막는다.

```text
components/**
→ DB client 직접 import 금지

components/**
→ repository 직접 import 금지

components/**
→ task table column patch helper 직접 import 금지
```

Components가 사용할 수 있는 mutation 경계:

```text
application command dispatcher
```

Read 경계:

```text
query hook / query service
```

이 규칙은 문서 규칙이 시간이 지나면서 component별로 복제되는 것을 막는 실질적인 안전장치다.

---

## 14.47 Registry Change Protocol

향후 Scope 행동을 바꿀 때는 다음 순서를 지킨다.

```text
1. §12 Canonical behavior 수정
2. §14 Registry/contract 수정
3. semantic fixture 수정/추가
4. server query test
5. client predicate test
6. UI implementation 수정
```

금지:

```text
UI에서 먼저 예외 추가
→ 나중에 문서 맞추기
```

Board를 Tag에 추가하는 예를 들면:

```text
§12 allowed view 변경
→ viewRegistry 변경
→ column semantics 설계
→ query/view adapter test
→ UI 노출
```

순서다.

---

## 14.48 구현 순서

실제 코드 구현은 다음 순서가 가장 안전하다.

```text
Phase 1
TaskScopeRef / View Registry / Scope Registry

Phase 2
compileScope + semantic fixtures

Phase 3
TaskScopeQueryService + CountService

Phase 4
resolveCreateContext + CreateTaskPlan

Phase 5
Task core commands

Phase 6
optimistic mutation + rollback + Undo

Phase 7
Subtask / container lifecycle commands

Phase 8
UI component에서 기존 직접 condition/patch 제거
```

UI부터 고치면 기존 분산 규칙 위에 새 abstraction이 얹혀 이중 구조가 될 가능성이 높다.

---

## 14.49 Acceptance Criteria — Registry / Query

### IC-AC1

모든 Tasks navigation state가 `TaskScopeRef` 하나로 표현된다.

### IC-AC2

List/Folder/Tag/Filter Scope는 각각 필요한 ID 없이는 생성될 수 없다.

### IC-AC3

Upcoming 기본 범위 계산은 공통 factory 하나를 사용한다.

### IC-AC4

허용 View 판단은 `taskScopeViewRegistry`만 사용한다.

### IC-AC5

Invalid View canonicalization이 Registry와 URL layer 사이에서만 처리되고 component가 별도 fallback하지 않는다.

### IC-AC6

Today server query와 client predicate가 동일 semantic fixture를 통과한다.

### IC-AC7

Inbox/List/Folder/Tag/Filter/Completed/Trash도 동일 fixture 방식으로 server/client semantics가 일치한다.

### IC-AC8

Sidebar Count는 Scope query와 동일 predicate를 사용한다.

### IC-AC9

List View와 Board View 전환이 Task membership을 바꾸지 않는다.

### IC-AC10

Archived/Deleted owner List의 Task는 active Scope query에 나타나지 않는다.

---

## 14.50 Acceptance Criteria — Create Resolver

### IC-AC11

Today create는 resolver 결과가 `ready`이고 `Inbox + TodayPlan`을 포함한다.

### IC-AC12

Today create가 due=today를 자동 생성하지 않는다.

### IC-AC13

Upcoming date 미선택은 `needs-input(date)`다.

### IC-AC14

Folder List 미선택은 `needs-input(list)`다.

### IC-AC15

Folder Context Create에서 외부 List를 target으로 선택하면 Create Resolver가 commit을 허용하지 않는다.

### IC-AC16

Tag create에서 List 미선택은 Inbox + current Tag다.

### IC-AC17

Filter의 owner 불명확 상태는 Inbox를 사용하고 임의 Regular List를 선택하지 않는다.

### IC-AC18

Completed/Trash resolver는 `disabled`다.

### IC-AC19

`createTask()`는 `targetListId=null` 입력 타입을 허용하지 않는다.

### IC-AC20

Task + Tag/TodayPlan relation 생성 중 하나라도 실패하면 전체 create transaction이 rollback된다.

---

## 14.51 Acceptance Criteria — Domain Command

### IC-AC21

`setTaskSomeday(true)` 후 dueOn/dueAt가 남지 않는다.

### IC-AC22

`setTaskDueDate()` 후 someday가 true로 남지 않는다.

### IC-AC23

다른 List로 `moveTask()`할 때 invalid previous sectionId가 남지 않는다.

### IC-AC24

`moveTaskToSection()`은 target Task와 같은 List의 Section만 허용한다.

### IC-AC25

Inbox Board bucket 이동이 실제 Section row를 생성/수정하지 않는다.

### IC-AC26

Task 완료/재오픈이 owner List/Tags/TodayPlan/Due를 임의로 변경하지 않는다.

### IC-AC27

Task Trash는 soft delete이며 permanent delete와 다른 command다.

### IC-AC28

복원 대상 List가 유효하지 않으면 `RESTORE_TARGET_REQUIRED`가 발생한다.

### IC-AC29

Permanent Delete command는 confirmation 이후 서버 성공 전에 최종 성공 UI를 표시하지 않는다.

### IC-AC30

List/Project/Space lifecycle command가 §13의 FK/visibility 의미를 보존한다.

---

## 14.52 Acceptance Criteria — Optimistic / Undo / Conflict

### IC-AC31

Optimistic mutation 후 현재 Scope membership은 component if문이 아니라 client predicate로 계산한다.

### IC-AC32

Mutation 실패 시 exact pre-mutation snapshot으로 rollback된다.

### IC-AC33

Rollback 후 Main과 Drawer state가 서로 다른 Task 상태를 보여주지 않는다.

### IC-AC34

성공 응답은 optimistic patch를 서버 canonical state로 reconcile한다.

### IC-AC35

Undo는 raw row patch가 아니라 inverse Domain Command를 호출한다.

### IC-AC36

Undo 전에 다른 수정이 발생해 stale 상태가 되면 오래된 snapshot을 강제로 덮어쓰지 않는다.

### IC-AC37

Hard delete/lifecycle destructive action은 기본적으로 optimistic 대상이 아니다.

### IC-AC38

`STALE_WRITE` 후 최신 entity를 다시 읽고 UI를 canonical state로 복구한다.

---

## 14.53 Acceptance Criteria — Architecture Boundary

### IC-AC39

Task UI component가 DB client를 직접 import하지 않는다.

### IC-AC40

Task UI component가 `listId`, `sectionId`, `deletedAt`, `archivedAt` 등을 조합한 multi-field mutation을 직접 수행하지 않는다.

### IC-AC41

Today/Upcoming/Inbox 조건이 Sidebar/Main/Drawer 각각에 복제되지 않는다.

### IC-AC42

sortKey 생성은 공통 ordering service를 사용한다.

### IC-AC43

Query service가 JSX/presentation component 구조를 반환하지 않는다.

### IC-AC44

Command payload가 전체 TaskReadModel을 통째로 저장 요청으로 보내지 않는다.

### IC-AC45

Scope 정책 변경 시 semantic fixture가 먼저 수정되거나 함께 수정된다.

---

## 14.54 §14 확정 결정

- **IC-D1.** Tasks navigation의 canonical scope representation은 discriminated union `TaskScopeRef`로 고정한다.
- **IC-D2.** URL parser는 navigation state만 만들며 query/create/domain 의미를 직접 구현하지 않는다.
- **IC-D3.** View 허용 여부는 단일 `taskScopeViewRegistry`를 사용한다.
- **IC-D4.** `resolveCreateContext`는 `ready / needs-input / disabled` discriminated result를 반환한다.
- **IC-D5.** `createTask`에는 null owner를 전달할 수 없고 resolver가 완성한 `CreateTaskPlan`만 전달한다.
- **IC-D6.** Today/Tag/Filter create의 Task row + relation writes는 하나의 transaction으로 처리한다.
- **IC-D7.** Saved Filter의 create auto-apply는 공통 `compileFilterCreatePatch` allowlist를 사용한다.
- **IC-D8.** Server query와 client `matchesScope`는 하나의 canonical Scope spec 또는 동일 semantic fixture를 공유한다.
- **IC-D9.** Count는 Scope membership의 별도 구현이 아니라 같은 predicate의 count projection이다.
- **IC-D10.** Query membership, sort, grouping은 서로 다른 책임으로 유지한다.
- **IC-D11.** UI component는 DB/repository를 직접 patch하지 않고 Domain Command를 호출한다.
- **IC-D12.** 여러 row/field가 하나의 의미를 이루는 mutation은 transaction 단위로 원자성을 보장한다.
- **IC-D13.** `setTaskDueDate`는 `someday=false`, `setTaskSomeday(true)`는 due clear를 보장한다.
- **IC-D14.** `moveTask`는 target List/Section을 검증하고 새로운 ordering context에서 sortKey를 생성한다.
- **IC-D15.** Inbox Board bucket 이동은 semantic command이며 실제 Section을 사용하지 않는다.
- **IC-D16.** TodayPlan은 Due와 독립된 command/data 의미를 유지한다.
- **IC-D17.** Domain error는 stable error code로 분류하고 UI 문구와 분리한다.
- **IC-D18.** Optimistic mutation은 같은 client Scope predicate로 membership을 재평가하고 실패 시 exact snapshot rollback을 수행한다.
- **IC-D19.** Mutation 성공 시 서버 canonical state로 optimistic state를 reconcile한다.
- **IC-D20.** Undo는 inverse Domain Command로 수행하며 reload를 넘어 지속하지 않는다.
- **IC-D21.** Hard delete와 복잡한 lifecycle destructive mutation은 기본적으로 optimistic 처리하지 않는다.
- **IC-D22.** Structural mutation에는 stale/precondition 검사를 두고 충돌 시 자동 덮어쓰지 않는다.
- **IC-D23.** sortKey 생성은 공통 ordering service가 소유한다.
- **IC-D24.** UI용 Read Model과 Domain Command payload를 분리한다.
- **IC-D25.** Inbox/List의 List↔Board 전환은 같은 Task membership을 다른 projector로 표현한다.
- **IC-D26.** Scope 정책 변경은 `§12 → §14 → semantic fixture → query/predicate → UI` 순서로 반영한다.

---

# 15. Responsive Contract / Desktop·Tablet·Mobile / Navigation·Drawer·Board·Quick Add

## 15.1 목적

§15의 목적은 지금까지 확정한 IA와 Domain semantics를 화면 크기와 입력 방식에 맞게 **표현만 변환**하는 것이다.

이 절에서는 새로운 Scope, 새로운 Task ownership, 새로운 URL semantics를 만들지 않는다.

핵심 원칙:

> Responsive는 Domain adaptation이 아니라 Presentation adaptation이다.

따라서 화면 폭이 바뀌어도 다음은 변하지 않는다.

```text
- 현재 Module
- 현재 Scope
- current Task identity
- Task membership
- allowed View semantics
- Create Resolver 결과
- Domain Command
- URL canonical rules
- History semantics
```

바뀌는 것은 다음뿐이다.

```text
- Navigation chrome 위치
- Sidebar persistent / overlay 여부
- Drawer inline / overlay / full-screen 표현
- Main padding
- Metadata 노출량
- Board column viewport
- Quick Add surface
- Touch/hover interaction affordance
```

---

# 15.2 Breakpoint를 정하는 기준

Breakpoint는 특정 기기 이름이나 관습적인 숫자를 먼저 선택하지 않는다.

현재 Desktop layout의 최소 폭을 역산한다.

```text
Rail              52px
Sidebar          240px
Main usable min  560px
Drawer           400px
─────────────────────
합계            1252px
```

Scrollbar, browser zoom 오차, divider 등의 여유를 고려하면 약 1280px부터 네 영역을 동시에 유지하는 것이 안전하다.

Sidebar까지 persistent로 유지하되 Drawer를 overlay로 돌리면 필요한 최소 폭은:

```text
52 + 240 + 560 = 852px
```

이지만 852px 근처에서 Header action과 Main padding까지 포함하면 지나치게 조밀해진다.

따라서 persistent Sidebar의 안정적 하한을 1024px로 둔다.

마지막으로 768px 아래에서는 Rail까지 남기는 것보다 Main width와 touch navigation을 우선한다.

이 계산을 기준으로 다음 네 mode를 사용한다.

---

# 15.3 Canonical Responsive Mode

| Mode | Viewport width | Rail | Sidebar | Main | Task Detail |
|---|---:|---|---|---|---|
| Wide Desktop | `>= 1280px` | persistent 52px | persistent 240px | flexible | inline 400px Drawer |
| Compact Desktop | `1024~1279px` | persistent 52px | persistent 240px | flexible | right overlay 400px |
| Tablet | `768~1023px` | persistent 52px | overlay sheet | full remaining width | right sheet overlay |
| Mobile | `< 768px` | hidden | overlay navigation sheet | full width | full-screen detail |

Breakpoint 상수:

```ts
export const RESPONSIVE_BREAKPOINTS = {
  mobile: 768,
  desktop: 1024,
  wideDesktop: 1280,
} as const
```

의미:

```text
width < 768              → mobile
768 <= width < 1024      → tablet
1024 <= width < 1280     → compactDesktop
1280 <= width            → wideDesktop
```

---

# 15.4 Breakpoint와 Input Modality를 분리한다

화면 폭과 pointer 유형은 같은 정보가 아니다.

예:

```text
큰 터치 태블릿 + keyboard
작은 desktop window + mouse
touch 가능한 Windows laptop
```

이 모두 가능하다.

따라서 다음을 별도로 판단한다.

```text
Responsive mode
→ viewport width

Hover affordance
→ (hover: hover)

Touch target / coarse interaction
→ (pointer: coarse)
```

금지:

```text
if (width < 1024) {
  무조건 touch UI
}
```

권장:

```css
@media (hover: hover) and (pointer: fine) { ... }
@media (pointer: coarse) { ... }
```

---

# 15.5 Wide Desktop — `>=1280px`

Wide Desktop은 현재 Visual System의 기본 상태다.

```text
┌────┬──────────────────┬────────────────────────────┬────────────────────┐
│Rail│ Sidebar          │ Main                       │ Drawer             │
│52  │ 240              │ min 560 / flexible         │ 400                │
└────┴──────────────────┴────────────────────────────┴────────────────────┘
```

규칙:

```text
- Rail persistent
- Sidebar persistent
- Main 독립 scroll
- Drawer open 시 layout column으로 참여
- Drawer 독립 scroll
- Main clickable 유지
- List readable max width 900~1100px
- Board는 available workspace width 전체 사용
```

Drawer open 때문에 Main usable width가 560px 아래로 내려가면 Wide Desktop layout을 강제로 유지하지 않고 Compact Desktop presentation을 적용한다.

즉 실제 implementation에서는 단순 device width뿐 아니라 container가 극단적으로 제한된 embed 환경도 고려할 수 있다.

MVP의 기본 기준은 viewport width다.

---

# 15.6 Compact Desktop — `1024~1279px`

Compact Desktop의 목표는 Sidebar 탐색을 유지하면서 Drawer 때문에 Main을 찌그러뜨리지 않는 것이다.

```text
┌────┬──────────────────┬─────────────────────────────────────────────┐
│Rail│ Sidebar          │ Main                                        │
│52  │ 240              │ flexible                                    │
│    │                  │                           ┌────────────────┐ │
│    │                  │                           │ Drawer overlay │ │
│    │                  │                           │ 400px          │ │
└────┴──────────────────┴───────────────────────────┴────────────────┘
```

Drawer:

```text
position: absolute/fixed within app shell
right: 0
width: 400px
```

이 mode의 Drawer는 **non-modal overlay**를 기본으로 한다.

따라서:

```text
- heavy scrim 없음
- Drawer 왼쪽의 Main은 계속 클릭 가능
- 다른 Task 클릭 → 같은 Drawer에서 task 전환
- Esc → Drawer 닫기
- Drawer shadow/divider로 layer 구분
```

Main은 Drawer open 때문에 layout width 자체를 줄이지 않는다.

---

# 15.7 Tablet — `768~1023px`

Tablet에서는 Main 작업 공간을 우선한다.

기본 구조:

```text
┌────┬──────────────────────────────────────────────┐
│Rail│ Main                                         │
│52  │                                              │
│    │                                              │
│    │                                              │
└────┴──────────────────────────────────────────────┘
```

Sidebar는 persistent column이 아니라 left overlay sheet다.

```text
┌────┬───────────────┬──────────────────────────────┐
│Rail│ Sidebar sheet │ Main + scrim                 │
│52  │ 288px         │                              │
└────┴───────────────┴──────────────────────────────┘
```

기본 width:

```text
288px
max-width: calc(100vw - 72px)
```

Drawer는 right sheet:

```text
preferred: 520px
max-width: calc(100vw - 84px)
min-width는 content가 깨지지 않는 범위에서 축소
```

Tablet Drawer는 Main을 완전히 사용할 수 있는 non-modal surface보다 **focused sheet**가 더 안전하므로:

```text
- subtle scrim 사용
- background Main pointer interaction 차단
- Esc / X / scrim tap으로 닫기
- keyboard 사용 시 focus containment
```

을 기본으로 한다.

---

# 15.8 Mobile — `<768px`

Mobile에서는 동시에 여러 navigation column을 유지하지 않는다.

기본 구조:

```text
┌─────────────────────────────┐
│ Mobile Header               │
├─────────────────────────────┤
│                             │
│ Main                        │
│                             │
│                             │
├─────────────────────────────┤
│ Bottom Navigation           │
└─────────────────────────────┘
```

Rail은 숨기고 Bottom Navigation으로 변환한다.

Sidebar는 필요할 때만 여는 Navigation Sheet다.

Task Detail은 Full-screen.

Quick Add는 Bottom Sheet.

Search는 Full-screen Search surface.

---

# 15.9 Responsive는 URL을 변경하지 않는다

중요한 불변조건이다.

예:

```text
Desktop
/list/lst_abm?view=board&task=tsk_1
```

브라우저 폭을 390px로 줄여도:

```text
/list/lst_abm?view=board&task=tsk_1
```

그대로다.

바뀌는 것:

```text
inline Drawer
→ full-screen Task Detail
```

바뀌지 않는 것:

```text
scope = list(lst_abm)
view = board
task = tsk_1
```

따라서 금지:

```text
if mobile:
  ?view=board 제거
```

또는:

```text
if mobile:
  task query를 별도 /task/:id route로 변환
```

하지 않는다.

Responsive rendering은 URL canonicalization의 원인이 아니다.

---

# 15.10 Orientation 변화도 Navigation이 아니다

Portrait ↔ Landscape 전환으로 breakpoint가 바뀔 수 있다.

예:

```text
태블릿 Portrait 900px
→ Tablet

Landscape 1180px
→ Compact Desktop
```

이때:

```text
- 현재 Scope 유지
- List/Board View 유지
- opened Task 유지
- current scroll anchor 가능한 범위에서 유지
- Quick Add draft 유지
- Search query 유지
```

한다.

Mode 전환을 이유로 새 route navigation을 발생시키지 않는다.

---

# 15.11 Rail — Desktop / Tablet

`>=768px`에서는 Rail을 유지한다.

기본:

```text
width: 52px
```

Visual icon:

```text
18~20px
```

Fine pointer:

```text
visual button 36~40px
```

Coarse pointer가 감지되면 Rail 자체 폭을 무조건 키우기보다 hit area를 최소 44px로 확보한다.

```text
52px rail 안에 44px hit area
```

가 가능하다.

---

# 15.12 Mobile Bottom Navigation

`<768px`에서는 Rail을 숨기고 Bottom Navigation을 사용한다.

기본 5개:

```text
Tasks
Calendar
Spaces
Focus
Search
```

Settings는 primary navigation 빈도가 낮으므로 Bottom Navigation slot을 차지하지 않는다.

Mobile Settings 진입은:

```text
Profile / Account / More action
→ Settings
```

으로 제공한다.

이것은 Module 삭제가 아니다.

```text
Rail presentation의 Settings icon
→ Mobile presentation의 account/settings action
```

으로 위치만 바뀐다.

Bottom Navigation:

```text
base height: 56px
+ safe-area-inset-bottom
```

아이콘:

```text
20~22px
```

각 item hit target:

```text
>= 44px
```

Selected 상태는 icon + label 또는 semantic emphasis로 표현하고 color만으로 구분하지 않는다.

---

# 15.13 Mobile Bottom Navigation과 Task Detail

Full-screen Task Detail에서는 Bottom Navigation을 기본적으로 숨긴다.

이유:

```text
- Task 편집에 집중
- accidental module switch 방지
- keyboard 공간 확보
```

Task Detail Header의 Back이 이전 Main context로 돌아가는 핵심 Action이다.

URL은 계속 `?task=`를 사용하므로 Back semantics는 Desktop과 동일하다.

---

# 15.14 Sidebar — Persistent / Overlay 상태

Sidebar presentation state:

```ts
type SidebarPresentation =
  | 'persistent'
  | 'overlay'
```

Mode별:

```text
wideDesktop    persistent
compactDesktop persistent
tablet         overlay
mobile         overlay
```

`sidebarOpen`은 URL state가 아니다.

```text
/sidebar=open
```

같은 query를 만들지 않는다.

---

# 15.15 Tablet Sidebar 동작

Tablet에서 Sidebar open:

```text
Rail의 Tasks icon 또는 Main Header navigation action
↓
left sheet open
```

규칙:

```text
- Main 위에 표시
- scrim 제공
- Sidebar 자체 독립 scroll
- outside tap으로 닫기
- Esc로 닫기
- Scope 선택 즉시 navigate + Sidebar close
- List expand/collapse만 한 경우 Sheet 유지
```

Scope를 선택한 뒤 Sheet가 남아 Main을 가리지 않게 한다.

---

# 15.16 Mobile Sidebar 동작

Mobile Tasks Module의 Main Header 왼쪽에는 Sidebar open action을 둔다.

```text
☰  오늘
```

또는 navigation drawer를 의미하는 동일 계열 icon을 사용한다.

Open:

```text
┌──────────────────────┬──────┐
│ Tasks Navigation     │scrim │
│                      │      │
│ 오늘                 │      │
│ 다음 7일             │      │
│ 기본함               │      │
│                      │      │
│ 리스트               │      │
│ ...                  │      │
└──────────────────────┴──────┘
```

권장 width:

```css
width: min(88vw, 360px);
```

최소한 화면 오른쪽에 약간의 Main/scrim 영역이 남도록 한다.

아주 작은 320px viewport에서는:

```text
calc(100vw - 32px)
```

까지 허용한다.

---

# 15.17 Task Detail Presentation Registry

Task Detail 표현은 다음으로 고정한다.

```ts
const taskDetailPresentation = {
  wideDesktop: 'inline-drawer',
  compactDesktop: 'overlay-drawer',
  tablet: 'right-sheet',
  mobile: 'full-screen',
} as const
```

이 Registry는 **Presentation만 결정**한다.

Task fetch/query/command에는 영향을 주지 않는다.

---

# 15.18 Wide Desktop Drawer

Wide Desktop:

```text
width: 400px
```

독립 column.

Main과 Drawer는 서로 다른 scroll container다.

Drawer header는 상단 sticky 가능.

Drawer open 시 Main에서 다른 Task를 선택하면:

```text
?task=A
→ replace/push 규칙은 §5에 따름
→ Drawer content만 B로 교체
```

한다.

Responsive layer는 History 규칙을 재정의하지 않는다.

---

# 15.19 Compact Desktop Drawer

Compact Desktop Drawer는 400px right overlay.

Main context를 유지하는 것이 목적이므로 heavy modal scrim을 사용하지 않는다.

경계:

```text
subtle left shadow
또는
1px divider + shadow
```

를 사용한다.

Drawer가 Main 위를 덮더라도 Main의 남은 왼쪽 영역에서 Task 선택은 가능해야 한다.

---

# 15.20 Tablet Drawer

Tablet Drawer:

```css
width: min(520px, calc(100vw - 84px));
```

오른쪽 Sheet.

Tablet에서는 화면이 좁으므로 background Main interaction을 막는다.

동작:

```text
- scrim tap → close
- Esc → close
- close icon → close
- focus가 sheet 밖으로 임의 이동하지 않음
- task mutation으로 scope에서 row가 사라져도 sheet는 §4 정책에 따라 필요한 상태 유지 후 close/transition
```

---

# 15.21 Mobile Task Detail

Mobile Task Detail은 full-screen surface다.

Header:

```text
←               작업 상세               ···
```

Task title은 Header에 억지로 넣지 않는다.

본문 첫 영역에서 편집한다.

```text
□ 교수님께 결과 전달
```

속성 row는 한 줄이 부족하면 두 줄까지 허용한다.

```text
List
ABM 연구
```

Popover 대신 Bottom Sheet picker를 우선한다.

예:

```text
Date picker
List picker
Tag picker
Priority picker
```

---

# 15.22 Main Content Padding

Mode별 기본 horizontal padding:

```text
wideDesktop      32px
compactDesktop   24px
tablet           20px
mobile           16px
```

작은 mobile (`<=359px`)에서만:

```text
12px
```

까지 축소 가능하다.

Text size를 줄이는 대신 padding을 먼저 줄인다.

Top padding:

```text
Desktop 24px
Tablet  20px
Mobile  12~16px
```

---

# 15.23 Main Header Responsive 구조

### Wide Desktop

```text
Title / subtitle                         + 작업   View   ...
```

### Compact Desktop

```text
Title / subtitle                     + 작업   View   ...
```

secondary text action label 일부를 icon으로 줄일 수 있다.

### Tablet

```text
[nav] Title                         [+] [view] [...]
```

secondary action은 overflow로 보낸다.

### Mobile

```text
[☰]  오늘                           [...] 
```

Context Quick Add는 Header에 중복으로 항상 넣지 않고 FAB/sheet flow를 기본으로 한다.

완료/휴지통처럼 Context Create가 없는 Scope에서는 context `+`를 표시하지 않는다.

---

# 15.24 Header Action 축소 우선순위

폭이 좁아질 때 Action 제거 순서:

```text
1. label text 제거 → icon only
2. secondary sort/group action → overflow
3. tertiary action → overflow
```

항상 직접 노출할 것:

```text
- navigation/back
- 현재 Scope title
- 현재 화면에서 가장 핵심적인 primary action
```

금지:

```text
폭이 좁다고 primary action 자체를 아무 설명 없이 삭제
```

---

# 15.25 Task Row — Desktop

Desktop 기본 48px rhythm을 유지한다.

Fine pointer에서는 hover action을 사용할 수 있다.

```text
□ Task title                         due   ...
  metadata
```

Hover action을 보여줘도 layout shift가 없어야 한다.

---

# 15.26 Task Row — Tablet / Mobile

Touch 환경에서는 hover에 의존하지 않는다.

Mobile 권장 구조:

```text
┌────────────────────────────────────────┐
│ □  Task title                    due  ⋯│
│    List / critical metadata            │
└────────────────────────────────────────┘
```

우선순위:

```text
항상 유지
1. Checkbox
2. Title
3. critical due/overdue state
4. direct overflow action

공간이 있으면
5. contextual List name
6. Priority
7. primary Tag
```

Secondary Tag와 장식 metadata는 먼저 숨긴다.

Mobile Task Row는 필요 시 52px 전후까지 높아질 수 있지만, 무조건 큰 Card 형태로 바꾸지 않는다.

---

# 15.27 Mobile Search

Mobile Bottom Navigation의 Search를 선택하면 Full-screen Search surface를 사용한다.

Search Header:

```text
검색
[ 검색어 입력........................ ]
```

진입 시 input autofocus.

Search field는 상단에 유지하고 결과만 scroll한다.

Keyboard open 시 결과 viewport가 줄어들어도 Search input이 화면 밖으로 밀리지 않는다.

Task 결과 선택:

```text
canonical scope URL + ?task=id
```

규칙을 사용한다.

Search result 때문에 별도 mobile-only Task route를 만들지 않는다.

---

# 15.28 Metadata Responsive Policy

§11.76의 숨김 원칙을 mode별로 구체화한다.

### Wide Desktop

Scope별 canonical metadata 대부분 노출.

### Compact Desktop

```text
secondary Tag
decorative color marker
```

부터 줄인다.

### Tablet

Task별:

```text
Title
Due/Overdue
필요한 List context
Priority
```

중심.

### Mobile

기본 한 행에서:

```text
Title
critical Due
```

우선.

두 번째 line이 허용될 때 Scope에서 의미 있는 **하나 또는 두 개**의 metadata만 노출한다.

예:

```text
Today
→ List / future due

Tag
→ List / due

List
→ due / priority
```

현재 Scope에서 이미 알려진 정보는 반복하지 않는다.

---

# 15.29 Metadata를 숨겨도 정보 접근성은 유지한다

Responsive에서 Row metadata를 숨겼다고 해당 정보가 사라지는 것은 아니다.

항상 다음 경로 중 하나로 접근 가능해야 한다.

```text
Task Detail
Overflow menu
Accessible label
```

예:

Mobile List View에서 Tag badge를 숨겨도 Drawer의 Tags field에서는 확인/수정 가능해야 한다.

---

# 15.30 Board — Responsive 기본 원칙

Board allowed scope는 §12를 그대로 따른다.

```text
Inbox
List
```

Responsive 때문에 Board 지원 Scope를 늘리거나 줄이지 않는다.

특히 Mobile에서:

```text
?view=board
```

를 자동으로 List로 canonicalize하지 않는다.

사용자가 Board URL을 열면 Mobile에서도 Board를 표현해야 한다.

---

# 15.31 Board — Wide / Compact Desktop

Wide Desktop:

```text
column width: 300px
column gap: 16px
```

workspace width를 충분히 사용한다.

Column이 viewport를 넘으면 Board area 내부 horizontal scroll을 허용한다.

Compact Desktop에서도 기본 300px을 유지하되 필요하면:

```text
280~300px
```

범위까지 축소 가능하다.

Card text를 지나치게 압축하지 않는다.

---

# 15.32 Board — Tablet

Tablet:

```text
column width: 280px 전후
column gap: 12~16px
horizontal scroll
```

한 화면에 모든 Column을 억지로 맞추지 않는다.

각 Column Header는 Board vertical scroll context 안에서 sticky 가능하다.

Board 전체가 페이지의 horizontal scroll을 발생시키지 않고 **Board content area만** 가로 스크롤한다.

---

# 15.33 Board — Mobile

Mobile Board는 한 Column을 주로 보면서 다음 Column의 존재를 알 수 있는 구조를 사용한다.

권장:

```css
column-width: min(320px, calc(100vw - 32px));
column-gap: 12px;
```

예:

```text
┌──────────────────────────┐  ┌─
│ 미분류 3                 │  │ 일정
│                          │  │
│ Task                     │  │
│ Task                     │  │
│                          │  │
└──────────────────────────┘  └─
           → horizontal scroll
```

선택적으로:

```css
scroll-snap-type: x proximity;
```

를 사용할 수 있다.

`mandatory` snap은 긴 Board 탐색을 방해할 수 있어 기본으로 강제하지 않는다.

---

# 15.34 Touch Drag & Drop

Desktop mouse DnD 규칙은 §9를 유지한다.

하지만 coarse pointer에서는 Drag가 유일한 조작법이 되어서는 안 된다.

MVP 원칙:

```text
Desktop/fine pointer
→ drag reorder / cross-column drag 지원

Touch/coarse pointer
→ Move action / Section picker / List picker를 반드시 제공
→ free-form touch DnD는 필수 아님
```

이유:

```text
- vertical scroll과 drag 충돌
- Board horizontal scroll과 cross-column drag 충돌
- long press delay 문제
- 접근성
```

Touch DnD를 후속 제공한다면 dedicated handle 또는 명시적 lift mode를 사용한다.

```text
long press 아무 곳
```

만으로 drag를 강제하지 않는다.

---

# 15.35 Mobile Quick Add Surface

Mobile Quick Add는 Bottom Sheet를 기본으로 한다.

Closed:

```text
                         (+)
─────────────────────────────
Tasks  Calendar  Spaces ...
```

FAB:

```text
visual size: 48~52px
hit target: >= 48px
bottom: bottomNav + safe area + 12~16px
right: 16px
```

Sheet open:

```text
┌─────────────────────────────┐
│ 작업 추가                   │
│                             │
│ [제목.....................] │
│                             │
│ [날짜] [리스트]             │
│ [우선순위] [태그]           │
│                             │
│                     [추가]  │
└─────────────────────────────┘
```

기본 sheet는 화면 전체를 덮지 않는다.

Description/Subtask 편집이 필요하면 생성 후 Task Detail로 이어간다.

MVP에서 Repeat/Reminder는 §13에 따라 노출하지 않는다.

---

# 15.36 Mobile Quick Add Context / Global 구분

FAB/호출점은 두 mode를 명시적으로 구분한다.

```ts
type QuickAddMode =
  | { kind: 'context'; scope: TaskScopeRef }
  | { kind: 'global' }
```

### Context

현재 Tasks Scope에서 호출.

```text
resolveCreateContext(scope)
```

사용.

예:

```text
Today → Inbox + TodayPlan
Tag → Inbox + current Tag
List → current List
Folder → needs-input(list)
```

### Global

Tasks 외 Module 또는 별도 Global Add affordance에서 호출.

```text
Inbox
```

기본 owner.

Completed/Trash에서 shell-level Global Add를 제공한다면 Sheet 상단에:

```text
기본함에 추가
```

를 표시해 현재 Scope 생성으로 오해하지 않게 한다.

---

# 15.37 Virtual Keyboard

가상 키보드는 Responsive mode를 바꾸는 신호가 아니다.

Breakpoint 계산:

```text
layout viewport width
```

Keyboard positioning:

```text
visual viewport
```

를 사용한다.

즉 keyboard open으로 visible height가 줄어들어도:

```text
mobile → tablet
```

같은 mode 변경을 발생시키지 않는다.

---

# 15.38 Keyboard Safe Area

Quick Add / Search / Task Detail에서 input focus 시:

```text
- focused input을 keyboard 위로 scrollIntoView
- sticky header 유지
- primary action이 keyboard 뒤에 고정되지 않음
- bottom padding을 keyboard/safe-area에 맞춤
```

Bottom fixed element가 여러 개 겹치지 않게 한다.

예:

```text
keyboard open
→ FAB hidden
→ Bottom Navigation 필요 시 visual viewport 밖/뒤로 밀리지 않게 조정
```

Mobile web에서는 browser별 keyboard resize 차이가 있으므로 `visualViewport`가 사용 가능하면 위치 보정에 활용하되 Domain state와 연결하지 않는다.

---

# 15.39 Safe Area

Notch / gesture bar가 있는 환경을 고려한다.

App Shell:

```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
```

실제 적용 위치는 surface마다 다를 수 있다.

특히:

```text
- Mobile Header top
- Bottom Navigation bottom
- Quick Add Sheet bottom
- Full-screen Task Detail bottom
- Toast bottom offset
```

에 반영한다.

Safe area 값을 중복 padding하지 않게 shell ownership을 명확히 한다.

---

# 15.40 Touch Target

Coarse pointer 환경 최소 interactive hit area:

```text
44 x 44 CSS px
```

권장 primary FAB:

```text
48~52px
```

중요:

> visual icon 크기와 hit target 크기는 같을 필요가 없다.

예:

```text
18px icon
inside
44px transparent button hit box
```

따라서 Desktop visual density를 잃지 않고 touch usability를 확보한다.

---

# 15.41 Hover Action의 Touch 대체

Desktop:

```text
Hover → quick actions
```

Mobile에는 hover가 없다.

따라서 핵심 Row/Card Action은:

```text
- Checkbox
- Overflow button
- direct Due/date action 필요 시
```

처럼 직접 접근 가능한 형태가 있어야 한다.

금지:

```text
hover에서만 삭제/이동 가능
```

Swipe gesture는 향후 보조 기능으로 추가할 수 있으나 유일한 Action path가 되어서는 안 된다.

---

# 15.42 Popover → Sheet 변환 규칙

Fine pointer Desktop:

```text
Date Picker
List Picker
Tag Picker
Priority Picker
→ anchored popover
```

Tablet/Mobile coarse pointer:

```text
→ Bottom Sheet 또는 centered touch sheet
```

을 우선한다.

하지만 선택 결과와 Domain Command는 동일하다.

```text
Popover Date Picker
Bottom Sheet Date Picker
```

가 서로 다른 date mutation을 만들면 안 된다.

---

# 15.43 Modal / Confirmation

Destructive confirmation은 viewport에 따라 표현만 바꾼다.

Desktop:

```text
center modal
```

Mobile:

```text
bottom confirmation sheet
또는 compact centered dialog
```

가능.

문구와 destructive command는 동일하다.

Permanent Delete는 Responsive mode와 관계없이 confirmation을 요구한다.

---

# 15.44 Toast / Undo 위치

Desktop:

```text
bottom center 또는 bottom right
```

Mobile:

Bottom Navigation/FAB와 겹치면 안 된다.

권장:

```text
bottom = bottom nav height
       + safe area
       + 12px
```

Quick Add FAB가 동시에 보이는 경우 Toast가 FAB를 덮지 않도록 vertical stacking한다.

Undo interaction target도 coarse pointer에서 44px에 가까운 hit area를 제공한다.

---

# 15.45 Empty / Loading / Error State

Responsive에서 상태 의미를 바꾸지 않는다.

### Desktop

Main content readable width 안에 표시.

### Mobile

과도한 illustration을 확대하지 않는다.

```text
오늘 예정된 작업이 없습니다.
+ 작업 추가
```

같은 핵심 문구/CTA만 중앙 또는 상단 content zone에 표시한다.

Loading skeleton도 Desktop Card를 그대로 축소하기보다 실제 Mobile Row 구조와 같은 skeleton을 사용한다.

---

# 15.46 Independent Scroll Ownership

Desktop:

```text
Rail      fixed
Sidebar   own vertical scroll
Main      own vertical scroll
Drawer    own vertical scroll
```

Tablet:

```text
Rail           fixed
Main           own scroll
Sidebar sheet  own scroll
Drawer sheet   own scroll
```

Mobile:

```text
Header         fixed/sticky
Main           own document/app scroll
Bottom Nav     fixed
Sidebar sheet  own scroll
Task Detail    own scroll
QuickAdd Sheet own scroll when necessary
```

금지:

```text
Sidebar를 스크롤하면 Main도 함께 움직임
```

Overlay open 시 background scroll chaining을 차단한다.

---

# 15.47 Overscroll / Scroll Chaining

Mobile/Tablet Sheet에서 끝까지 스크롤했을 때 뒤의 Main이 같이 움직이는 것을 막는다.

가능한 구현:

```css
overscroll-behavior: contain;
```

Board horizontal scroll도 페이지 navigation gesture와 충돌하지 않도록 실제 브라우저/PWA 환경에서 검증한다.

---

# 15.48 Focus Management

Overlay open 시 최초 focus:

```text
Sidebar
→ selected/current navigation item 또는 첫 meaningful control

Drawer
→ Drawer shell, title 또는 명시적 first focus target

Quick Add
→ title input

Search
→ search input
```

Close 시:

```text
원래 trigger로 focus restore
```

가능한 경우 보장한다.

Mobile touch-only 환경에서 보이지 않는 focus trap을 과도하게 적용하지 않되 hardware keyboard가 연결될 수 있으므로 keyboard path는 유지한다.

---

# 15.49 Overlay Stack Priority

동시에 여러 transient surface가 떠도 layer ownership을 명확히 한다.

권장 conceptual stack:

```text
Base Main
< Sidebar / Drawer
< Picker Popover / Sheet
< Global Search/Command surface
< Confirmation dialog
< Toast
```

예:

Task Detail 위에서 Date Picker를 열면 Date Picker가 Detail보다 위에 있어야 한다.

Confirmation은 Picker보다 위다.

Z-index 숫자를 component별 임의 값으로 흩뿌리지 않고 semantic layer token을 둔다.

---

# 15.50 Breakpoint 전환 중 Overlay 처리

예:

```text
Tablet에서 Sidebar sheet open
↓
window width가 1100px
↓
Compact Desktop
```

이때 Sidebar는 persistent로 자연스럽게 승격한다.

별도 close animation 후 다시 open하지 않는다.

반대:

```text
Compact Desktop persistent Sidebar
↓
Tablet
```

에서는 Sidebar를 기본 closed overlay 상태로 전환한다.

이것은 navigation selection을 지우는 것이 아니다.

현재 selected Scope는 유지된다.

---

# 15.51 Drawer 전환 중 Task 유지

```text
wideDesktop inline Drawer open
↓ resize
compactDesktop overlay
↓ resize
mobile full-screen
```

동안:

```text
openedTaskId 유지
Drawer draft/editor state 유지 가능한 범위에서 보존
Task fetch 재시작 불필요
URL 변화 없음
```

Responsive component를 완전히 unmount/remount하여 편집 draft를 잃지 않도록 공통 Detail state owner를 둔다.

---

# 15.52 Quick Add 전환 중 Draft 유지

Quick Add가 열린 상태에서 orientation/breakpoint가 바뀌어:

```text
Desktop inline
→ Mobile Bottom Sheet
```

가 되어도 아직 commit하지 않은:

```text
Title
Date selection
List selection
Priority
Tags
```

Draft를 유지한다.

Presentation component가 Draft state의 owner가 되어서는 안 된다.

권장:

```text
QuickAddController / state machine
→ DesktopInlineQuickAdd
→ MobileQuickAddSheet
```

가 같은 draft를 렌더한다.

---

# 15.53 Search 전환 중 Query 유지

Desktop Search Palette/Route와 Mobile Full-screen Search 사이에서 breakpoint가 바뀌어도 query를 유지한다.

단:

```text
Command Palette transient open state
```

와:

```text
/search route state
```

는 기존 §10 의미를 그대로 따른다.

Responsive 때문에 transient Palette를 persistent route로 자동 승격하지 않는다.

---

# 15.54 Responsive Metadata는 CSS만으로 무작정 숨기지 않는다

단순히:

```css
.metadata:nth-child(n+2) { display:none }
```

같이 의미를 모르는 CSS 순번으로 숨기지 않는다.

Read Model 또는 presentation descriptor에서 metadata importance를 구분한다.

예:

```ts
type MetadataPriority = 'critical' | 'primary' | 'secondary'
```

Responsive projector가:

```text
mobile
→ critical + 필요한 primary

desktop
→ critical + primary + secondary
```

를 선택한다.

이렇게 해야 Scope별 의미가 유지된다.

---

# 15.55 Responsive Component Boundary

권장 구조:

```text
AppShell
├─ DesktopRail / MobileBottomNav
├─ ResponsiveSidebar
├─ MainWorkbench
├─ ResponsiveTaskDetail
├─ QuickAddController
│  ├─ DesktopInlineQuickAdd
│  └─ MobileQuickAddSheet
└─ OverlayHost
```

중요:

```text
ResponsiveTaskDetail
```

내부에서 Task Domain logic을 다시 구현하지 않는다.

예:

```text
TaskDetailContent
```

하나를 공유하고 wrapper만:

```text
Drawer / Sheet / FullScreen
```

으로 바꾼다.

---

# 15.56 CSS와 JS의 책임

가능한 layout 변화는 CSS media/container query를 우선한다.

```text
display
width
padding
position
visibility
```

등.

JS가 필요한 경우:

```text
focus management
overlay open/close policy
presentation component 선택
virtual keyboard compensation
```

정도다.

금지:

```text
window.innerWidth를 여러 component에서 각각 읽고
각각 다른 breakpoint if문 사용
```

공통 responsive service/hook 하나를 사용한다.

---

# 15.57 Responsive Mode API

개념적 타입:

```ts
type ResponsiveMode =
  | 'mobile'
  | 'tablet'
  | 'compactDesktop'
  | 'wideDesktop'

type InputModality = {
  canHover: boolean
  coarsePointer: boolean
}
```

공통 API:

```ts
useResponsiveMode(): ResponsiveMode
useInputModality(): InputModality
```

이 값은 **Presentation decision에만 사용**한다.

금지:

```ts
if (mode === 'mobile') {
  task.listId = inboxId
}
```

Domain mutation에 mode를 넣지 않는다.

---

# 15.58 Layout Token 최종안

```ts
const layoutTokens = {
  railWidth: 52,
  sidebarWidth: 240,
  drawerWidth: 400,

  tabletSidebarWidth: 288,
  tabletDrawerPreferredWidth: 520,

  mobileHeaderHeight: 56,
  mobileBottomNavHeight: 56,
  touchTargetMin: 44,

  mainPaddingX: {
    wideDesktop: 32,
    compactDesktop: 24,
    tablet: 20,
    mobile: 16,
  },

  boardColumnWidth: {
    desktop: 300,
    compactDesktop: 280,
    tablet: 280,
  },
} as const
```

Mobile Board column은 viewport-dependent token으로 계산한다.

```css
width: min(320px, calc(100vw - 32px));
```

---

# 15.59 Mobile 320px Edge Case

최소 목표 viewport:

```text
320 CSS px
```

에서 기본 기능이 깨지지 않아야 한다.

허용 조정:

```text
Main horizontal padding 12px
Sidebar width calc(100vw - 32px)
Board column calc(100vw - 24~32px)
secondary metadata 추가 숨김
Header secondary action overflow
```

금지:

```text
horizontal page scroll 발생
Task title input viewport 밖으로 밀림
44px touch target을 28px로 축소
```

Board 자체의 의도된 horizontal scroll은 예외다.

---

# 15.60 Large Desktop Edge Case

초대형 모니터에서도 List content를 끝없이 늘리지 않는다.

```text
List readable max width: 900~1100px
```

유지.

Main 전체 폭이 1800px 이상이어도 Task text line이 지나치게 길어지지 않는다.

Board만 workspace width를 적극 사용한다.

---

# 15.61 Browser Zoom

125% / 150% zoom으로 effective CSS viewport가 줄어들면 responsive mode가 자연스럽게 전환되는 것을 허용한다.

Pixel-perfect Desktop layout을 고정하기 위해 overflow를 발생시키지 않는다.

즉 zoom은 accessibility input으로 취급하고 layout이 적응한다.

---

# 15.62 Reduced Motion

Responsive overlay/sheet transition은 `prefers-reduced-motion`을 존중한다.

```css
@media (prefers-reduced-motion: reduce) {
  transition-duration: minimal/none;
}
```

Animation을 줄여도 open/close state는 동일하다.

---

# 15.63 Responsive Performance

Breakpoint 변경 시 Task query 전체를 다시 fetch하지 않는다.

왜냐하면:

```text
Responsive mode
≠ query semantics
```

이기 때문이다.

허용:

```text
layout recalculation
projection change
metadata visibility change
```

금지:

```text
mode change
→ invalidate every Task query
```

---

# 15.64 Accessibility — Screen Reader Order

Visual position이 바뀌어도 logical reading order가 깨지지 않아야 한다.

Desktop에서:

```text
Rail → Sidebar → Main → Drawer
```

Mobile에서:

```text
Header → Main → Bottom Nav
```

Task Detail이 full-screen일 때 background content를 screen reader 탐색 대상에서 제외한다.

Overlay Sidebar/Drawer도 modal behavior인 mode에서는 적절한 aria semantics를 사용한다.

---

# 15.65 Accessibility — Zoom / Text

200% 확대 또는 OS text scaling 상황에서:

```text
Title clip
button overlap
fixed-height field clipping
```

이 발생하지 않게 한다.

Task Row 48/52px은 기본 rhythm이지 **강제 max-height**가 아니다.

텍스트가 실제로 두 줄 필요하면 row가 확장될 수 있다.

---

# 15.66 Responsive QA Matrix

최소 QA viewport:

```text
320 x 568
390 x 844
768 x 1024
900 x 1200
1024 x 768
1280 x 800
1440 x 900
1920 x 1080
```

추가:

```text
- mouse/fine pointer
- touch/coarse pointer
- keyboard open mobile
- portrait/landscape
- 125% browser zoom
- 200% text/zoom accessibility check
```

Device name보다 CSS viewport와 modality를 기준으로 테스트한다.

---

# 15.67 Acceptance Criteria — Breakpoint / Shell

### RSP-AC1

`>=1280px`에서 Rail 52 + Sidebar 240 + Main + inline Drawer 400 구조가 유지된다.

### RSP-AC2

`1024~1279px`에서 Sidebar는 persistent이고 Drawer는 Main width를 줄이지 않는 overlay다.

### RSP-AC3

`768~1023px`에서 Sidebar는 overlay sheet로 전환한다.

### RSP-AC4

`<768px`에서 Rail은 렌더되지 않고 Bottom Navigation이 제공된다.

### RSP-AC5

Mobile Bottom Navigation에서 Tasks/Calendar/Spaces/Focus/Search에 접근할 수 있다.

### RSP-AC6

Settings는 Mobile에서도 명시적 account/settings action을 통해 접근 가능하다.

### RSP-AC7

Breakpoint 변경이 URL push/replace를 발생시키지 않는다.

### RSP-AC8

Orientation 변화가 현재 Scope를 초기화하지 않는다.

---

# 15.68 Acceptance Criteria — Sidebar / Navigation

### RSP-AC9

Tablet/Mobile Sidebar open state는 URL query로 저장하지 않는다.

### RSP-AC10

Overlay Sidebar에서 Scope를 선택하면 navigation 후 Sidebar가 닫힌다.

### RSP-AC11

Folder expand/collapse만 했을 때 Sidebar가 강제로 닫히지 않는다.

### RSP-AC12

Overlay Sidebar가 열린 동안 background scroll chaining이 발생하지 않는다.

### RSP-AC13

Coarse pointer에서도 Sidebar/Rail 핵심 action hit target이 44px 이상이다.

---

# 15.69 Acceptance Criteria — Task Detail

### RSP-AC14

Wide Desktop에서는 Task Detail이 400px inline Drawer다.

### RSP-AC15

Compact Desktop에서는 같은 `?task=` 상태가 400px overlay Drawer로 보인다.

### RSP-AC16

Tablet에서는 같은 Task가 right sheet로 보인다.

### RSP-AC17

Mobile에서는 같은 Task가 full-screen detail로 보인다.

### RSP-AC18

Desktop → Mobile resize 중 opened Task ID가 바뀌지 않는다.

### RSP-AC19

Mobile Detail의 Back은 기존 URL/history semantics에 따라 Detail을 닫는다.

### RSP-AC20

Detail presentation 전환 때문에 Task를 다시 생성하거나 별도 mobile Task entity를 만들지 않는다.

---

# 15.70 Acceptance Criteria — Main / Metadata

### RSP-AC21

Mobile에서도 Checkbox, Task Title, critical Due/Overdue 정보는 우선 유지된다.

### RSP-AC22

Secondary Tag가 공간 부족 시 primary 정보보다 먼저 숨겨진다.

### RSP-AC23

숨겨진 metadata는 Task Detail에서 접근 가능하다.

### RSP-AC24

Fine pointer 전용 hover action이 touch 환경의 유일한 조작 path가 아니다.

### RSP-AC25

320px viewport에서 일반 Main page horizontal overflow가 발생하지 않는다.

---

# 15.71 Acceptance Criteria — Board

### RSP-AC26

Mobile에서 `?view=board`가 자동으로 List View로 변경되지 않는다.

### RSP-AC27

Board의 horizontal scroll은 Board content area 안에서만 발생한다.

### RSP-AC28

Mobile Board column은 viewport보다 넓어 page-level overflow를 만들지 않는다.

### RSP-AC29

Touch 환경에서 drag가 불가능해도 Move/Section/List action으로 동일 핵심 mutation을 수행할 수 있다.

### RSP-AC30

Inbox Board와 List Board의 Domain semantics는 Desktop/Mobile에서 동일하다.

---

# 15.72 Acceptance Criteria — Quick Add / Keyboard

### RSP-AC31

Mobile Quick Add는 Bottom Sheet를 사용하고 Desktop 전용 inline width를 축소 복사하지 않는다.

### RSP-AC32

Mobile Quick Add도 `resolveCreateContext → CreateTaskPlan → createTask` 경계를 그대로 사용한다.

### RSP-AC33

Folder Quick Add는 Mobile에서도 List 선택 없이는 commit되지 않는다.

### RSP-AC34

Completed/Trash에서 shell-level Global Add를 제공할 경우 current Scope create처럼 보이지 않고 Inbox destination을 명시한다.

### RSP-AC35

Keyboard open 시 title input과 저장 Action이 keyboard에 완전히 가려지지 않는다.

### RSP-AC36

Keyboard open/close가 responsive mode를 바꾸지 않는다.

### RSP-AC37

Breakpoint/orientation 변화 중 Quick Add draft가 보존된다.

---

# 15.73 Acceptance Criteria — Search / Overlay / Accessibility

### RSP-AC38

Mobile Search는 full-screen surface이고 진입 시 input focus가 된다.

### RSP-AC39

Search input은 keyboard가 열려도 상단에 유지된다.

### RSP-AC40

Overlay close 후 가능한 경우 trigger로 focus가 복원된다.

### RSP-AC41

Task Detail/Sidebar가 modal-like presentation인 mode에서 background focus가 적절히 차단된다.

### RSP-AC42

Safe area가 Bottom Navigation, FAB, Sheet, Toast에 중복/누락 없이 반영된다.

### RSP-AC43

`prefers-reduced-motion`에서 기능 손실 없이 transition이 줄어든다.

### RSP-AC44

Browser zoom으로 effective width가 줄면 layout이 breakpoint에 따라 적응하고 page overflow를 고집하지 않는다.

### RSP-AC45

Responsive mode 변화가 Task query cache 전체 invalidation을 발생시키지 않는다.

---

# 15.74 §15 확정 결정

- **RSP-D1.** Responsive는 Presentation adaptation이며 Domain/Scope/URL semantics를 바꾸지 않는다.
- **RSP-D2.** Breakpoint는 `768 / 1024 / 1280px`을 기준으로 `Mobile / Tablet / Compact Desktop / Wide Desktop` 네 mode를 사용한다.
- **RSP-D3.** `>=1280px`에서 Rail 52 / Sidebar 240 / Drawer 400의 4-column 구조를 사용한다.
- **RSP-D4.** `1024~1279px`에서는 Rail/Sidebar를 유지하고 Drawer만 400px non-modal overlay로 전환한다.
- **RSP-D5.** `768~1023px`에서는 Rail을 유지하고 Sidebar는 288px overlay sheet, Drawer는 right sheet로 전환한다.
- **RSP-D6.** `<768px`에서는 Rail을 숨기고 Bottom Navigation을 사용한다.
- **RSP-D7.** Mobile Bottom Navigation primary item은 Tasks / Calendar / Spaces / Focus / Search로 한다.
- **RSP-D8.** Settings는 Mobile의 account/settings action으로 이동하되 Module 접근성은 유지한다.
- **RSP-D9.** Mobile Task Detail은 full-screen이지만 `?task=` URL semantics를 그대로 유지한다.
- **RSP-D10.** Breakpoint/orientation 변화는 History mutation을 발생시키지 않는다.
- **RSP-D11.** Board View는 Mobile에서도 유지하며 responsive 이유로 List로 자동 canonicalize하지 않는다.
- **RSP-D12.** Mobile Board는 horizontal scroll을 사용하고 column width는 `min(320px, calc(100vw - 32px))`을 기본으로 한다.
- **RSP-D13.** Touch DnD는 MVP 필수가 아니며 Move/List/Section action을 대체 경로로 반드시 제공한다.
- **RSP-D14.** Mobile Quick Add는 Bottom Sheet, Search는 Full-screen surface를 사용한다.
- **RSP-D15.** Quick Add의 Context/Global 의미와 Domain Command는 Desktop/Mobile에서 동일하다.
- **RSP-D16.** Coarse pointer interactive hit target은 최소 44px로 한다.
- **RSP-D17.** 좁은 화면에서는 font size를 줄이기보다 metadata/action/sidebar를 먼저 축소·재배치한다.
- **RSP-D18.** Mobile Main horizontal padding은 16px, 320px edge case에서 12px까지 허용한다.
- **RSP-D19.** `100dvh`, safe-area inset, visualViewport 보정을 사용해 keyboard/notch 환경을 처리한다.
- **RSP-D20.** Responsive mode와 input modality를 분리하여 판단한다.
- **RSP-D21.** Overlay/Drawer/QuickAdd/Search의 draft/query/entity state는 presentation component보다 상위 controller가 소유한다.
- **RSP-D22.** Responsive layout은 가능한 CSS가 담당하고 JS breakpoint logic은 공통 service/hook 하나로 제한한다.
- **RSP-D23.** Responsive mode 변화는 data refetch나 query semantics 변경의 원인이 아니다.
- **RSP-D24.** 최소 QA 범위에 320/390/768/900/1024/1280/1440/1920 CSS viewport와 touch/mouse/keyboard/zoom 조건을 포함한다.

---

---

# 16. E2E Acceptance Matrix / 구현 순서 / Release Gate

## 16.1 목적

§1~§15는 무엇을 만들지, 어떤 데이터 의미를 유지할지, 어떤 interaction과 responsive behavior를 가져야 하는지를 정의했다.

§16의 목적은 이 설계를 실제 개발과 QA가 사용할 수 있는 **실행 계약(execution contract)** 으로 바꾸는 것이다.

이 절이 답해야 하는 질문은 다음과 같다.

```text
1. 어떤 사용자 Journey가 반드시 끝까지 성공해야 하는가?
2. 각 Journey에서 URL / Query / Count / Drawer / Mutation이 어떻게 같이 움직여야 하는가?
3. 실패 / Undo / stale write / reload에서도 어떤 상태가 보존되어야 하는가?
4. Desktop / Tablet / Mobile에서 의미가 동일한가?
5. 무엇부터 구현해야 뒤 단계의 재작업이 최소화되는가?
6. 각 구현 단계는 어떤 Gate를 통과해야 다음 단계로 넘어갈 수 있는가?
```

핵심 원칙:

> 화면 하나가 예쁘게 동작하는 것은 완료가 아니다. 같은 Task가 Scope, Sidebar Count, Drawer, URL, Search, Undo를 통과해도 하나의 canonical state로 유지될 때 기능이 완료된 것이다.

---

## 16.2 §16이 새 규칙을 만드는 방식

§16은 원칙적으로 새로운 Product semantics를 만들지 않는다.

우선순위는 그대로다.

```text
§6 / §13 Data Invariant
↓
§12 Canonical Behavior Registry
↓
§14 Implementation Contract
↓
§15 Responsive Contract
↓
§16 E2E Acceptance / Implementation Order
```

§16의 E2E 시나리오가 앞 절과 충돌하면 E2E를 억지로 맞추지 않는다.

먼저 canonical contract를 수정한 뒤 E2E expectation을 다시 생성한다.

즉:

> E2E test는 숨은 Product Rule의 저장소가 아니다.

---

# 16.3 테스트 계층

완료 여부를 E2E 하나에만 의존하지 않는다.

```text
Contract Unit Test
↓
Domain / Repository Integration Test
↓
Component Interaction Test
↓
Browser E2E Test
↓
Responsive / Accessibility QA
```

각 계층의 책임을 분리한다.

### Contract Unit

검증 대상:

```text
scopeRegistry
viewRegistry
resolveCreateContext
compileScopePredicate
matchesScope
sort/group resolver
create-applicable filter compiler
URL canonicalizer
```

### Domain Integration

검증 대상:

```text
createTask
moveTask
setTaskDueDate
setTaskSomeday
completeTask
trashTask
restoreTask
TodayPlan commands
Tag commands
Subtask commands
Container lifecycle commands
transaction / constraint
```

### Component Interaction

검증 대상:

```text
Task Row
Quick Add
Task Detail Drawer
Sidebar
Board
Toast / Undo
Search surface
Overlay stack
```

### Browser E2E

검증 대상:

```text
사용자 Journey 전체
URL / History
Reload
cross-scope mutation
optimistic remove
rollback
responsive presentation transition
```

---

# 16.4 E2E Fixture 표준

테스트마다 서로 다른 임시 데이터를 만들면 Scope semantics 검증이 어려워진다.

따라서 공통 workspace fixture를 둔다.

권장 fixture:

```text
Workspace W1

Inbox (system List)

Folder 학교
├─ List ABM 연구
│  ├─ Section 준비
│  ├─ Section 진행
│  └─ Section 검토
└─ List 수업

Standalone List 개인

Tags
├─ #중요
└─ #읽기

Saved Filters
├─ 중요한 오늘
│  └─ due=today AND priority=high
└─ ABM 중요
   └─ list=ABM 연구 AND tag=중요
```

Task fixture:

```text
T1 Inbox / no date
T2 Inbox / due today
T3 Inbox / someday=true
T4 ABM / due yesterday / incomplete
T5 ABM / due today
T6 ABM / due +3 days
T7 개인 / TodayPlan(today) / due +5 days
T8 수업 / tag #중요
T9 ABM / completed today
T10 ABM / deleted today
T11 ABM / priority high / due today / tag #중요
T12 ABM / 2 subtasks, 1 completed
```

이 fixture로 최소 다음 의미가 동시에 검증돼야 한다.

```text
Today:
T2, T4, T5, T7, T11

Upcoming:
T2, T5, T6, T11
+ horizon 안의 future due tasks

Inbox:
T1, T2, T3

ABM List:
T4, T5, T6, T11, T12

#중요:
T8, T11

중요한 오늘 Filter:
T11

Completed:
T9

Trash:
T10
```

완료/삭제/archived List exclusion은 별도 fixture variation으로 검증한다.

---

# 16.5 E2E 공통 Assertion Set

모든 핵심 Journey는 화면 text만 검사하지 않는다.

가능한 경우 아래를 함께 검사한다.

```text
A. URL
B. selected Scope
C. Main result membership
D. Sidebar/Header count
E. Drawer opened entity
F. persistent domain state
G. secondary membership 변화
H. Toast / Undo state
I. reload 후 동일 결과
```

이를 `Canonical Assertion Set`으로 부른다.

예:

```text
Tag에서 current Tag 제거

A. URL              /tag/:tagId?task=:taskId
B. selected Scope   같은 Tag
C. Main             Task 제거
D. Count            -1
E. Drawer            canonical rule에 따라 close 또는 retained presentation
F. DB               TaskTag row 제거
G. List             Task는 여전히 존재
H. Toast             Undo 제공
I. Reload            제거 상태 유지
```

---

# 16.6 E2E Priority

E2E를 세 등급으로 나눈다.

```text
P0 = merge / release blocking
P1 = MVP release blocking, 매 PR마다 전체 실행할 필요는 없음
P2 = regression / enhancement
```

P0는 다음 조건을 만족하는 Journey다.

```text
- Task 생성/완료/이동/삭제
- Scope membership
- URL/Back/Reload
- Undo/rollback
- 핵심 responsive presentation
- Task owner/data invariant
```

---

# 16.7 Journey Matrix — App Entry / Navigation

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-NAV-01 | P0 | `/` 진입 | `/today`로 canonicalize, Today selected |
| E2E-NAV-02 | P0 | Sidebar에서 Inbox 선택 | `/inbox`, Main/Count 일치 |
| E2E-NAV-03 | P0 | List 선택 | `/list/:id`, 해당 List query |
| E2E-NAV-04 | P0 | 직접 `/list/:id?view=board` 진입 | List Board 유지 |
| E2E-NAV-05 | P0 | `/tag/:id?view=board` 직접 진입 | 허용되지 않은 view canonicalize → List |
| E2E-NAV-06 | P0 | 존재하지 않는 Scope id | 명시된 Not Found behavior |
| E2E-NAV-07 | P1 | Folder expand/collapse | Navigation URL 변경 없음 |
| E2E-NAV-08 | P0 | Scope 이동 후 Browser Back | 직전 Scope 정확히 복원 |

---

# 16.8 Journey Matrix — Today

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-TDY-01 | P0 | Today 최초 렌더 | overdue + due today + TodayPlan 포함 |
| E2E-TDY-02 | P0 | Today `+ 작업` | Inbox owner + TodayPlan(today) |
| E2E-TDY-03 | P0 | 새 Today Task 확인 | due date가 자동 today로 바뀌지 않음 |
| E2E-TDY-04 | P0 | future due Task를 TodayPlan 추가 | due 유지 + Today membership 추가 |
| E2E-TDY-05 | P0 | TodayPlan 제거, due도 today 아님 | Today에서 즉시 제거 + Count 감소 |
| E2E-TDY-06 | P0 | overdue Task due를 future로 변경 | Today 조건이 없으면 제거 |
| E2E-TDY-07 | P0 | Today Task 완료 | active list에서 제거, 완료 영역/Completed 반영 |
| E2E-TDY-08 | P1 | Today ordering | canonical sort order 유지, 자유 DnD 비활성 |

---

# 16.9 Journey Matrix — Upcoming

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-UP-01 | P0 | Upcoming 진입 | today~today+6 due Task만 표시 |
| E2E-UP-02 | P0 | 날짜별 grouping | group header와 row metadata 중복 방지 |
| E2E-UP-03 | P0 | `+ 작업` 후 horizon 날짜 선택 | Inbox + 선택 due date |
| E2E-UP-04 | P0 | Quick Add에서 List override | 선택 List owner + 선택 due date |
| E2E-UP-05 | P0 | date를 horizon 밖으로 이동 | Main에서 즉시 제거 + Count 재평가 |
| E2E-UP-06 | P1 | TodayPlan만 있고 due 없음 | Upcoming에 나타나지 않음 |

---

# 16.10 Journey Matrix — Inbox / Triage

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-INB-01 | P0 | Inbox 빠른 생성 | Inbox + 미분류 membership |
| E2E-INB-02 | P0 | Inbox Task에 날짜 지정 | 미분류 → 일정 bucket |
| E2E-INB-03 | P0 | 일정 Task를 Someday로 이동 | due 제거 + someday=true + 언젠가 bucket |
| E2E-INB-04 | P0 | Someday Task에 날짜 지정 | someday=false + 일정 bucket |
| E2E-INB-05 | P0 | Inbox → ABM List 이동 | Inbox에서 제거, ABM List에서 표시 |
| E2E-INB-06 | P0 | 위 이동 Undo | Inbox 및 원래 bucket 정확히 복구 |
| E2E-INB-07 | P0 | Inbox Board 직접 생성 | column semantics에 맞는 patch 적용 |
| E2E-INB-08 | P1 | List View manual reorder | Task.sortKey만 변경 |

---

# 16.11 Journey Matrix — List / Section / Board

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-LST-01 | P0 | List Header `+ 작업` | current List, sectionId=null |
| E2E-LST-02 | P0 | Section `+ 작업` | current List + current section |
| E2E-LST-03 | P0 | manual reorder | same List/Section 내 sortKey 변경 |
| E2E-LST-04 | P0 | Board column 이동 | sectionId 변경, owner List 유지 |
| E2E-LST-05 | P0 | Board 미분류 → Section | sectionId null → target id |
| E2E-LST-06 | P0 | derived sort 활성화 | manual DnD 비활성 |
| E2E-LST-07 | P1 | 완료된 Task 표시 toggle | completion이 Section 축을 대체하지 않음 |

---

# 16.12 Journey Matrix — Folder / Tag / Filter

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-QRY-01 | P0 | Folder `+ 작업` | List picker 없이는 commit 금지 |
| E2E-QRY-02 | P0 | Folder 하위 List 선택 후 생성 | 선택 List owner |
| E2E-QRY-03 | P0 | Tag `+ 작업`, List 미지정 | Inbox + current Tag |
| E2E-QRY-04 | P0 | Tag 생성 시 List override | selected List + current Tag |
| E2E-QRY-05 | P0 | current Tag 제거 | Tag Scope에서 즉시 제거 + Undo |
| E2E-QRY-06 | P0 | Filter가 단일 List owner 결정 | 해당 List에 생성 |
| E2E-QRY-07 | P0 | Filter owner 불명확 | Inbox에 생성 |
| E2E-QRY-08 | P0 | create-applicable positive 조건 | 새 Task에 자동 적용 |
| E2E-QRY-09 | P1 | non-applicable filter 조건 | 억지 mutation 없음 |
| E2E-QRY-10 | P0 | Folder/Tag/Filter `?view=board` | canonical List View로 정리 |

---

# 16.13 Journey Matrix — Drawer / URL / History

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-DRW-01 | P0 | Task click | `?task=:id` 추가 + Detail 표시 |
| E2E-DRW-02 | P0 | Drawer close | task query 제거, Scope 유지 |
| E2E-DRW-03 | P0 | Task open 후 Browser Back | Drawer만 먼저 닫힘 |
| E2E-DRW-04 | P0 | `?task=` URL reload | 같은 Scope + 같은 Task Detail 복원 |
| E2E-DRW-05 | P0 | Drawer previous/next | replaceState, history spam 없음 |
| E2E-DRW-06 | P0 | wrong-scope task URL | canonical task location policy 적용 |
| E2E-DRW-07 | P0 | Desktop→Mobile width 전환 | 같은 task id, URL 그대로, full-screen presentation |
| E2E-DRW-08 | P1 | Mobile→Desktop 복귀 | same entity state, inline/overlay contract에 맞게 전환 |

---

# 16.14 Journey Matrix — Core Mutation / Undo

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-MUT-01 | P0 | title 수정 | 모든 Scope에서 즉시 같은 title |
| E2E-MUT-02 | P0 | due date 수정 | Today/Upcoming membership 재평가 |
| E2E-MUT-03 | P0 | priority 수정 | Filter/Sort 재평가 |
| E2E-MUT-04 | P0 | List 이동 | old/new List, Folder, Inbox membership 재평가 |
| E2E-MUT-05 | P0 | complete | active Scope 제거 + Completed 추가 |
| E2E-MUT-06 | P0 | reopen | Completed 제거 + 원래 active membership 복구 |
| E2E-MUT-07 | P0 | trash | active/Completed 결과에서 제거 + Trash 추가 |
| E2E-MUT-08 | P0 | Undo trash | 원래 canonical state 복원 |
| E2E-MUT-09 | P0 | mutation server failure | optimistic patch exact rollback |
| E2E-MUT-10 | P0 | stale write | silent overwrite 금지, canonical error policy |

---

# 16.15 Journey Matrix — Subtask

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-SUB-01 | P0 | Drawer에서 Subtask 추가 | TaskSubtask 생성, parent Task owner 불변 |
| E2E-SUB-02 | P0 | Subtask 완료 | progress 즉시 업데이트 |
| E2E-SUB-03 | P0 | Subtask manual reorder | parent 단위 sortKey 변경 |
| E2E-SUB-04 | P0 | Subtask 삭제 + Undo | 동일 parent/position으로 복구 |
| E2E-SUB-05 | P0 | parent Task trash | 정의된 cascade lifecycle 적용 |
| E2E-SUB-06 | P1 | Search | §13에서 정의한 Subtask Search policy와 일치 |

---

# 16.16 Journey Matrix — Completed / Trash

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-SYS-01 | P0 | Completed 진입 | completedAt 기준 grouping / 최근순 |
| E2E-SYS-02 | P0 | Completed Task reopen | 원래 List로 active 복귀 |
| E2E-SYS-03 | P0 | Trash 진입 | deletedAt 기준 grouping / 최근순 |
| E2E-SYS-04 | P0 | Trash restore, 원래 List 존재 | 원래 List 복원 |
| E2E-SYS-05 | P0 | Trash restore, 원래 List 없음 | restore target 요구, Inbox 기본 |
| E2E-SYS-06 | P0 | permanent delete | confirmation 후만 실행 |
| E2E-SYS-07 | P0 | Trash Detail | 일반 edit action 제한 |

---

# 16.17 Journey Matrix — Container Lifecycle

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-CNT-01 | P0 | List archive | Task FK 유지, active Scope에서 숨김 |
| E2E-CNT-02 | P0 | List restore | 같은 Task/List 관계로 재노출 |
| E2E-CNT-03 | P0 | List soft delete | Task.listId 유지, active selector 제외 |
| E2E-CNT-04 | P0 | deleted List restore | Task 그대로 복구 |
| E2E-CNT-05 | P1 | permanent List delete | §13 blocking/handling rule 적용 |
| E2E-CNT-06 | P0 | Project archive/delete | linked List/Task destructive cascade 없음 |
| E2E-CNT-07 | P1 | Project permanent delete | linked List가 standalone으로 보존 |
| E2E-CNT-08 | P1 | Space permanent delete with refs | 차단되어 hidden reassignment 없음 |

---

# 16.18 Journey Matrix — Search / Command

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-SRC-01 | P0 | Global Search open | transient palette, URL Scope 유지 |
| E2E-SRC-02 | P0 | Task result 선택 | canonical Scope + `?task=`로 이동 |
| E2E-SRC-03 | P0 | List/Tag/Folder result 선택 | canonical Scope URL 이동 |
| E2E-SRC-04 | P0 | Trash Task 검색 | 기본 검색 결과에서 제외 |
| E2E-SRC-05 | P1 | completed Task 검색 | active Task보다 낮은 rank |
| E2E-SRC-06 | P1 | full search route | reload 가능한 URL state 유지 |
| E2E-SRC-07 | P1 | command 실행 | command registry permission 적용 |

---

# 16.19 Journey Matrix — Responsive

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-RSP-01 | P0 | 1440px | Rail + Sidebar + Main + inline Drawer |
| E2E-RSP-02 | P0 | 1100px | Drawer overlay, Main semantics 동일 |
| E2E-RSP-03 | P0 | 900px | Rail + overlay Sidebar + right sheet Drawer |
| E2E-RSP-04 | P0 | 390px | Bottom Nav + full-screen Detail |
| E2E-RSP-05 | P0 | Mobile Board | horizontal scroll, view=board 유지 |
| E2E-RSP-06 | P0 | Touch 환경 | DnD 없이 Move action으로 동일 결과 가능 |
| E2E-RSP-07 | P0 | Mobile Quick Add | Bottom Sheet + same Create Resolver |
| E2E-RSP-08 | P0 | keyboard open | input/action 가려지지 않음 |
| E2E-RSP-09 | P0 | resize with Drawer open | URL/history mutation 없음 |
| E2E-RSP-10 | P0 | resize with Quick Add draft | draft 유지 |
| E2E-RSP-11 | P1 | 320px | horizontal page overflow 없이 핵심 action 접근 |
| E2E-RSP-12 | P1 | browser zoom | effective breakpoint adaptation |

---

# 16.20 Journey Matrix — Error / Empty / Loading

| ID | Pri | Journey | 핵심 기대 결과 |
|---|---|---|---|
| E2E-ERR-01 | P0 | initial query loading | 이전 Scope data를 잘못 현재 Scope처럼 표시하지 않음 |
| E2E-ERR-02 | P0 | query error | retry 가능한 Error State |
| E2E-ERR-03 | P0 | empty Today | 올바른 contextual CTA |
| E2E-ERR-04 | P0 | empty Folder, child List 없음 | `새 리스트` 상태 |
| E2E-ERR-05 | P0 | Folder에 List는 있으나 Task 없음 | 별도 empty message |
| E2E-ERR-06 | P0 | mutation error | optimistic rollback + failure feedback |
| E2E-ERR-07 | P1 | network reconnect | stale optimistic state가 영구 고착되지 않음 |

---

# 16.21 P0 Golden Journeys

모든 P0 E2E를 매 PR에서 돌릴 필요는 없지만 다음 **12개 Golden Journey**는 Main branch merge gate로 권장한다.

```text
G1  App entry → Today canonical render
G2  Global Quick Add → Inbox
G3  Today add → Inbox + TodayPlan
G4  Inbox triage → List 이동 → Undo
G5  List create → Section move / Board
G6  Tag add → Inbox + Tag
G7  Drawer open → URL → Reload → Back
G8  Complete → Completed → Reopen
G9  Trash → Restore
G10 Server failure → optimistic rollback
G11 Desktop ↔ Mobile while Drawer open
G12 Mobile Quick Add → same domain result
```

이 12개가 깨지면 MVP core experience가 깨진 것으로 본다.

---

# 16.22 구현 순서의 원칙

구현 순서는 화면 순서가 아니다.

다음 의존성을 따른다.

```text
Invariant
→ Registry
→ Query
→ Command
→ Shell
→ Scope UI
→ Drawer/Create
→ Mutation/Undo
→ Board/Search
→ Lifecycle
→ Responsive hardening
→ Release QA
```

잘못된 순서 예:

```text
Today 화면부터 예쁘게 구현
→ 나중에 Query semantics 작성
→ Sidebar count 별도 구현
→ Quick Add 별도 owner logic
→ 뒤늦게 Registry 도입
```

이는 현재 설계가 피하려는 구조다.

---

# 16.23 Implementation Phase 0 — Schema / Migration / Fixture

목표:

> UI 전에 canonical data shape를 실행 가능한 상태로 만든다.

구현:

```text
TaskList.kind inbox|regular
Task core fields
TaskDailyPlan
TaskTag relation
ListSection
TaskSubtask
archivedAt / deletedAt lifecycle fields
sortKey infrastructure
required indices
```

동시에:

```text
migration
backfill
fixture factory
repository test DB
```

를 준비한다.

### Gate 0

다음을 통과해야 Phase 1로 간다.

```text
- active Task는 정확히 하나의 active owner List를 가진다.
- Inbox가 system List로 존재한다.
- TaskSubtask invariant가 DB/Domain에서 지켜진다.
- deleted/archived List Task는 active selector에서 제외된다.
- fixture가 deterministic하게 생성된다.
```

---

# 16.24 Implementation Phase 1 — Canonical Registry / URL

구현 순서:

```text
TaskScopeRef
scopeRegistry
viewRegistry
scope → path serializer
path → scope parser
query canonicalizer
resolveCreateContext skeleton
```

아직 풍부한 화면을 만들 필요는 없다.

### Gate 1

```text
- 모든 Scope URL round-trip 가능
- invalid view canonicalization 가능
- `/` → `/today`
- default `view=list`는 URL에서 생략
- `?task=`를 보존한 canonicalization 가능
- Registry 외 UI hard-code 없음
```

필수 테스트:

```text
E2E-NAV-01
E2E-NAV-04
E2E-NAV-05
E2E-NAV-08
```

---

# 16.25 Implementation Phase 2 — Query / Count / Scope Read Model

구현:

```text
compileScopePredicate
queryScopeTasks
queryScopeCount
matchesScope
sort/group resolver
active owner selector
query semantic fixtures
```

UI는 최소 skeleton list여도 된다.

중요:

> Sidebar Count를 나중에 따로 만들지 않는다.

### Gate 2

같은 fixture에 대해:

```text
server query ids
== client matchesScope ids
== Sidebar/Header count 대상 ids
```

이어야 한다.

필수 시나리오:

```text
Today membership
Upcoming horizon
Inbox
List
Folder
Tag
Filter
Completed
Trash
```

---

# 16.26 Implementation Phase 3 — Shell / Sidebar / Main List

구현:

```text
Rail
Sidebar
Main Header
View Toolbar
Task List primitive
Scope empty/loading/error
selection/navigation
```

이 단계에서는 List rendering을 먼저 완성한다.

Board나 풍부한 Drawer는 뒤로 미룬다.

### Gate 3

```text
- 모든 9개 Scope를 navigation 가능
- 각 Scope query/count 일치
- 허용 View selector만 노출
- empty/loading/error state 존재
- Browser Back으로 Scope 복원
```

---

# 16.27 Implementation Phase 4 — Quick Add / Create Resolver

구현:

```text
Context Quick Add
Global Quick Add
CreateTaskPlan
createTask command
Folder List picker
Tag auto-apply
Filter create compiler
TodayPlan creation
Upcoming date requirement
```

### Gate 4

Scope별 생성 결과:

```text
Today     → Inbox + TodayPlan
Upcoming  → Inbox/default override + selected date
Inbox     → Inbox
List      → current List
Folder    → selected child List only
Tag       → Inbox default + Tag
Filter    → unique List else Inbox + applicable patches
Completed → disabled
Trash     → disabled
```

가 §12 matrix와 정확히 일치해야 한다.

필수 E2E:

```text
E2E-TDY-02
E2E-UP-03
E2E-INB-01
E2E-LST-01
E2E-QRY-01
E2E-QRY-03
E2E-QRY-06
E2E-QRY-07
```

---

# 16.28 Implementation Phase 5 — Task Detail / Subtask

구현:

```text
Task Detail Drawer controller
?task= synchronization
core task fields
List move
Date
Priority
Tag
Description MVP editor
Subtask CRUD/reorder
Trash action
```

MVP에서 숨김:

```text
Repeat
Reminder
```

§13 모델/서비스가 실제 구현되기 전에는 placeholder control도 기본 노출하지 않는다.

### Gate 5

```text
- Drawer open/close와 URL 일치
- reload에서 open Task 복원
- Browser Back 1회로 Drawer close
- Subtask CRUD complete
- Drawer mutation이 Main row와 즉시 reconcile
```

---

# 16.29 Implementation Phase 6 — Mutation / Optimistic / Undo

구현:

```text
setTaskDueDate
setTaskSomeday
moveTask
moveTaskToSection
completeTask
reopenTask
trashTask
restoreTask
TodayPlan add/remove
Tag add/remove
optimistic coordinator
Undo descriptor
stale write handling
```

### Gate 6

다음 세 상태를 모두 검증한다.

```text
success
server failure
Undo
```

그리고 mutation마다:

```text
Main membership
Count
Drawer
secondary Scope
```

가 같이 움직여야 한다.

필수 Golden:

```text
G4
G8
G9
G10
```

---

# 16.30 Implementation Phase 7 — Board / DnD

구현:

```text
Inbox Board
List Board
sortKeyService
mouse/fine pointer DnD
keyboard/non-drag alternative action
```

Board를 generic column component 하나로 공유할 수는 있지만 Domain semantics는 adapter로 분리한다.

```text
Inbox Board column
→ due/someday mutation

List Board column
→ sectionId mutation
```

### Gate 7

```text
- same visual drag가 Scope별 다른 canonical command를 호출한다.
- Inbox Board drag가 sectionId를 만들지 않는다.
- List Board drag가 due/someday를 암묵적으로 바꾸지 않는다.
- derived sort에서는 manual reorder가 비활성이다.
```

---

# 16.31 Implementation Phase 8 — Search / Command Palette

구현:

```text
search index/query
palette
full search route
result adapters
command registry
keyboard navigation
```

MVP 검색:

```text
title/name prefix/substring
```

P1:

```text
fuzzy
Korean 초성
advanced ranking
```

### Gate 8

```text
- Task result가 canonical Scope + task URL로 연다.
- Trash 기본 제외
- permission 없는 command 노출/실행 금지
- Palette state와 full Search URL state를 혼동하지 않음
```

---

# 16.32 Implementation Phase 9 — Container Lifecycle

구현:

```text
Archived Lists surface
Deleted Lists surface
List archive/delete/restore
Project archive/delete/restore
Space archive/delete/restore
permanent delete guards
```

### Gate 9

```text
- Task orphan 없음
- List delete가 Task hard delete를 암묵적으로 유발하지 않음
- restore가 FK를 보존
- Project/Space destructive cascade가 §13 정책을 넘지 않음
```

---

# 16.33 Implementation Phase 10 — Responsive Presentation

이 단계에서 처음 responsive를 생각하는 것이 아니다.

초기 component는 이미 responsive-friendly 구조여야 하지만, 여기서 §15 전체 contract를 완성한다.

구현:

```text
1280 / 1024 / 768 breakpoints
inline/overlay/full-screen Task Detail
persistent/overlay Sidebar
Mobile Bottom Navigation
Mobile Quick Add Bottom Sheet
Mobile Search
Board horizontal scroll
safe area
visualViewport keyboard handling
focus trap / restore
44px coarse-pointer targets
```

### Gate 10

동일 Golden Journey를 최소:

```text
1440px mouse
900px touch-capable
390px touch
```

에서 실행하고 Domain 결과가 같아야 한다.

---

# 16.34 Implementation Phase 11 — Hardening / Accessibility / Performance

구현:

```text
loading race
rapid navigation
stale response ignore
network failure
focus order
screen reader labels
reduced motion
browser zoom
large task list virtualization 필요성 검증
query/cache profiling
mutation race tests
```

### Gate 11

```text
- P0 Golden Journey 12개 전부 통과
- P0 E2E 전부 통과
- critical accessibility violation 0
- known destructive data-loss bug 0
- query/count semantic mismatch 0
- unsupported URL state 0
```

이 Gate를 통과하면 MVP release candidate로 본다.

---

# 16.35 P0 / P1 Feature Boundary

## P0 MVP

```text
Tasks Module Shell
Today
Upcoming
Inbox List / Board
List List / Board
Folder List
Tag List
Filter List
Completed
Trash
Quick Add
Task Detail
Subtask
Date / Priority / Tag / List move
TodayPlan
Completion
Trash / Restore
Undo
Search 기본
Desktop / Tablet / Mobile responsive
Container archive/delete/restore 기본
```

## P1

```text
Repeat
Reminder
Folder Board
advanced grouping
Multi-select
Touch drag lift mode
fuzzy / Korean 초성 search
advanced command palette
richer recurrence presets
multiple reminder UI
```

P1 기능은 P0 component에 disabled-looking placeholder로 기본 노출하지 않는다.

---

# 16.36 PR 단위 구현 전략

하나의 PR에서 Scope 하나를 UI부터 DB까지 전부 만드는 vertical slice만 반복하면 canonical layer가 중복될 수 있다.

권장 방식은 **foundation-first + thin vertical verification**이다.

예:

```text
PR1  schema + fixture
PR2  scope/view registry + URL
PR3  predicate/query/count
PR4  shell + Today/Inbox thin render
PR5  나머지 Scope read render
PR6  create resolver + createTask
PR7  Drawer URL/controller
PR8  Drawer fields + Subtask
PR9  mutation coordinator + Undo
PR10 Inbox/List Board
PR11 Search
PR12 container lifecycle
PR13 responsive completion
PR14 accessibility/performance/release hardening
```

각 PR은 가능한 경우 해당 Gate의 automated test를 같이 포함한다.

---

# 16.37 Definition of Done — 기능 단위

어떤 기능도 다음 중 UI 한 가지만 완료됐다고 Done으로 표시하지 않는다.

기능 Done 조건:

```text
[ ] canonical rule 존재
[ ] data invariant 존재
[ ] query/mutation contract 존재
[ ] UI 구현
[ ] loading/empty/error 처리
[ ] optimistic/rollback 필요 여부 처리
[ ] URL 영향 처리
[ ] Count 영향 처리
[ ] responsive presentation 처리
[ ] keyboard/touch 대체 경로 처리
[ ] automated test
```

해당 항목이 적용되지 않으면 `N/A` 이유를 명시한다.

---

# 16.38 Definition of Done — Scope 단위

Scope 하나의 완료 조건:

```text
[ ] canonical membership
[ ] default/allowed view
[ ] grouping/sort
[ ] count
[ ] metadata
[ ] create behavior
[ ] scope-exit mutation
[ ] empty/loading/error
[ ] URL / reload / Back
[ ] Desktop presentation
[ ] Tablet presentation
[ ] Mobile presentation
```

9개 Scope 모두 이 체크리스트를 통과해야 Tasks Module MVP가 완료된다.

---

# 16.39 Regression Traceability Matrix

기존 Acceptance Criteria를 버리지 않는다.

E2E failure가 어떤 설계 계약을 위반했는지 추적할 수 있어야 한다.

권장 test metadata:

```ts
{
  id: 'E2E-TDY-05',
  traces: [
    'CBR-AC...',
    'IC-AC...',
    'RSP-AC...'
  ]
}
```

정확한 번호 연결은 test file 작성 시 해당 requirement를 직접 붙인다.

핵심은:

> E2E test name만 보고 Product Rule을 추측하지 않게 한다.

---

# 16.40 Test Data Isolation

E2E는 서로 상태를 공유하지 않는다.

권장:

```text
beforeEach
→ deterministic fixture reset
→ test user/workspace seed
→ clock freeze
→ execute
```

특히 Today/Upcoming은 현재 날짜에 따라 결과가 변하므로 test clock을 고정한다.

예:

```text
userToday = 2026-08-18
userTimezone = Asia/Seoul
```

Server/Client 모두 같은 테스트 clock/timezone을 사용한다.

---

# 16.41 Timezone Acceptance

날짜 중심 앱에서 timezone mismatch는 P0 데이터 오류로 본다.

최소 테스트:

```text
23:59 → 00:00 day boundary
userToday 변경
Today Count 변경
Upcoming horizon shift
Date-only Task가 UTC 변환으로 전날/다음날로 이동하지 않음
```

Date-only와 Date-time을 같은 UTC instant처럼 취급하지 않는다.

---

# 16.42 Concurrency Acceptance

최소 두 종류를 테스트한다.

### 같은 Task를 두 surface에서 수정

```text
Main Row
Drawer
```

한쪽 변경 후 다른 쪽이 stale snapshot을 덮지 않는다.

### 두 client/session

P1 수준이라도 최소 stale write integration test를 둔다.

MVP 정책은 §14의 conflict contract를 따른다.

---

# 16.43 Performance Acceptance

정확한 ms 수치는 실제 환경을 측정한 뒤 budget을 정한다.

하지만 구조적 기준은 지금 고정한다.

금지:

```text
Sidebar Count마다 전체 Task fetch
Scope 전환마다 모든 query cache 폐기
responsive breakpoint 변경마다 refetch
Drawer open마다 전체 Scope 재조회
한 Task mutation 때문에 모든 workspace query 무조건 invalidate
```

측정 대상:

```text
initial Tasks shell
Scope change
Quick Add commit
Task complete optimistic feedback
Drawer open
Search first result
Board drag commit
```

---

# 16.44 Accessibility Release Gate

최소:

```text
keyboard-only navigation
visible focus
logical tab order
Dialog/Sheet focus containment
trigger focus restore
checkbox accessible name
icon-only button label
44px coarse hit target
200% browser zoom
prefers-reduced-motion
```

Mobile/desktop layout이 다르더라도 DOM reading order가 의미를 잃지 않아야 한다.

---

# 16.45 Destructive Action Release Gate

다음은 release blocker다.

```text
Task 영구 삭제가 confirm 없이 가능
List delete가 Task를 고아로 만듦
Project delete가 암묵적으로 Task를 hard delete
Space delete가 hidden default relation으로 조용히 재배치
Trash restore가 owner 없이 성공
Undo가 다른 Task 상태를 덮음
```

---

# 16.46 Manual QA Smoke Set

자동화와 별개로 release candidate마다 사람이 확인할 최소 smoke:

```text
1. Today에서 Task 생성
2. Drawer에서 List/Date/Tag 수정
3. Inbox Board triage
4. List Board Section 이동
5. Tag/Filter 생성 의미 확인
6. 완료 → 다시 열기
7. 삭제 → Undo → 다시 삭제 → Trash 복원
8. Search에서 Task 열기
9. Browser Reload / Back / Forward
10. 1440 → 900 → 390 resize
11. Mobile keyboard + Quick Add
12. List archive → restore
```

---

# 16.47 Release Blocking Bug Classification

### Blocker

```text
데이터 손실
Task owner invariant 위반
잘못된 Task를 수정/삭제
Undo가 다른 state 복원
URL reload로 다른 Task 열림
```

### Critical

```text
Scope membership 오류
Count가 Main과 지속적으로 불일치
Today/Upcoming 날짜 semantics 오류
Mobile에서 핵심 Task create/edit 불가
```

### Major

```text
특정 secondary action 실패
responsive metadata 일부 겹침
비핵심 keyboard shortcut 실패
```

Blocker/Critical open bug가 있으면 MVP release하지 않는다.

---

# 16.48 최종 구현 순서 요약

```text
0. Schema / Migration / Fixture
1. Registry / URL
2. Query / Count
3. Shell / Sidebar / Main List
4. Quick Add / Create Resolver
5. Task Detail / Subtask
6. Mutation / Optimistic / Undo
7. Inbox Board / List Board
8. Search / Command Palette
9. Container Lifecycle
10. Responsive completion
11. Accessibility / Performance / Release QA
```

이 순서를 권장하는 이유는 앞 단계가 뒤 단계의 의미를 결정하기 때문이다.

특히:

```text
Query 전에 화면을 만들지 않는다.
Create Resolver 전에 Scope별 + 작업을 따로 만들지 않는다.
Domain Command 전에 DnD를 만들지 않는다.
URL contract 전에 Drawer navigation을 만들지 않는다.
Responsive semantics를 바꾸는 별도 mobile domain logic을 만들지 않는다.
```

---

# 16.49 §16 Acceptance Criteria

### E2E-AC1

9개 canonical Scope 모두 최소 하나 이상의 P0 E2E를 가진다.

### E2E-AC2

P0 create behavior는 §12 Create Registry와 동일하다.

### E2E-AC3

P0 mutation behavior는 §14 Domain Command를 우회하지 않는다.

### E2E-AC4

Today test fixture는 overdue / due today / TodayPlan을 별도 Task로 포함한다.

### E2E-AC5

Upcoming fixture는 horizon boundary를 포함한다.

### E2E-AC6

Query / matchesScope / Count가 동일 fixture에서 같은 membership을 산출한다.

### E2E-AC7

Task open URL은 reload 후 같은 Task와 Scope를 복원한다.

### E2E-AC8

Browser Back은 Drawer open history와 Scope history를 설계된 순서로 복원한다.

### E2E-AC9

server mutation failure test가 optimistic rollback을 검증한다.

### E2E-AC10

Undo test는 단순 UI reinsertion이 아니라 canonical inverse command 결과를 검증한다.

### E2E-AC11

Subtask CRUD/reorder가 parent Task owner를 바꾸지 않는다.

### E2E-AC12

Repeat/Reminder는 해당 P1 implementation이 완료되기 전 P0 UI/E2E 기대에 포함하지 않는다.

### E2E-AC13

List archive/delete/restore test가 Task FK 보존을 검증한다.

### E2E-AC14

Project/Space lifecycle test가 hidden reassignment 또는 implicit hard delete가 없음을 검증한다.

### E2E-AC15

Mobile에서도 Context Quick Add가 동일 Create Resolver 결과를 사용한다.

### E2E-AC16

Mobile Board는 `view=board`를 responsive 이유로 List로 바꾸지 않는다.

### E2E-AC17

Breakpoint 전환은 History entry를 만들지 않는다.

### E2E-AC18

Drawer open 상태 breakpoint 전환에서 task id가 유지된다.

### E2E-AC19

Quick Add draft가 orientation/breakpoint 변화에서 보존된다.

### E2E-AC20

Touch 환경에는 DnD 없이 동일 Domain 결과를 만드는 대체 Action이 있다.

### E2E-AC21

P0 Golden Journey 12개는 main merge/release pipeline의 blocking suite로 운용한다.

### E2E-AC22

날짜 관련 E2E는 테스트 timezone과 clock을 명시적으로 고정한다.

### E2E-AC23

Blocker/Critical data semantics bug가 존재하면 release하지 않는다.

### E2E-AC24

각 Implementation Phase는 자신의 Gate를 통과하기 전에 다음 Phase를 완료 처리하지 않는다.

---

# 16.50 §16 확정 결정

- **E2E-D1.** 테스트는 UI text 확인이 아니라 URL/Scope/Membership/Count/Drawer/Persistence/Undo를 가능한 한 함께 검증한다.
- **E2E-D2.** 공통 deterministic workspace fixture를 사용하고 Today/Upcoming 테스트 clock과 timezone을 고정한다.
- **E2E-D3.** `Contract Unit → Domain Integration → Component → Browser E2E → Responsive/A11y` 계층을 사용한다.
- **E2E-D4.** P0 Golden Journey 12개를 핵심 merge/release blocking suite로 둔다.
- **E2E-D5.** 구현은 Schema → Registry → Query → Shell → Create → Drawer → Mutation → Board → Search → Lifecycle → Responsive → Hardening 순서로 진행한다.
- **E2E-D6.** Query와 Count는 UI보다 먼저 구현하고 동일 canonical predicate에서 파생한다.
- **E2E-D7.** Scope별 create UI는 `resolveCreateContext → CreateTaskPlan → createTask`가 준비되기 전에 독자적으로 구현하지 않는다.
- **E2E-D8.** DnD는 Domain Command와 sortKey service 이후 구현한다.
- **E2E-D9.** Repeat/Reminder는 P1이며 구현 계약이 실제로 완성되기 전 MVP UI에서 숨긴다.
- **E2E-D10.** Responsive는 같은 Journey의 presentation variant로 테스트하며 별도 mobile domain behavior를 만들지 않는다.
- **E2E-D11.** 기능 Done은 UI뿐 아니라 canonical rule/data/query/mutation/error/URL/count/responsive/test까지 확인한다.
- **E2E-D12.** Scope Done은 membership/view/group/sort/count/create/mutation/state/URL/responsive까지 확인한다.
- **E2E-D13.** destructive data-loss, owner invariant, wrong-task mutation은 Blocker로 분류한다.
- **E2E-D14.** Scope membership, Today/Upcoming 날짜 semantics, persistent Count mismatch, Mobile core-action failure는 Critical로 분류한다.
- **E2E-D15.** §16이 완료됨으로써 Tasks Module의 MVP 설계는 구현 순서와 acceptance 관점에서 닫힌다.

---

# 17. 구현 착수 상태

§1~§16 기준으로 이제 추가적인 큰 UX 설계 없이 **Tasks Module MVP 구현을 시작할 수 있다.**

구현 중 새로운 결정을 만나면 먼저 다음 중 어디에 속하는지 판단한다.

```text
Data invariant 문제
→ §6 / §13

Scope behavior 문제
→ §12

Query / Command 책임 문제
→ §14

Responsive presentation 문제
→ §15

Test / implementation order 문제
→ §16
```

새 결정을 component 내부의 임시 조건문으로만 남기지 않는다.

현재 문서에서 P1로 의도적으로 열어 둔 주요 항목은:

```text
Repeat
Reminder
Folder Board
advanced grouping
Multi-select
advanced touch DnD
advanced Search
```

이며, 이들은 MVP 구현을 막지 않는다.
