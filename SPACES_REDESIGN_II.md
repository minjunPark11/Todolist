# Spaces 재설계 II — 업무 영역 계층과 View 레지스트리

- 작성일: 2026-08-16
- 정합성 개정: 2026-08-17 — List/Table, Navigation, Horizons Domain, 문서 정본/중복 구조 정리
- **Repository 검증 반영: 2026-08-17 — §0.3 참조. Gate 4개 선해소, Renderer 가정 정정, 체크리스트 보강**
- 기준: `v0.8.0` (`c3bb2fc`)
- 선행 문서:
  - `SPACES_CLICKUP_REDESIGN.md` — D1\~D9 · 데이터 모델
  - `SPACES_CLICKUP_UI_DESIGN.md` — U1\~U7 · 트리와 탐색
  - `CLICKUP_IMPORT_DESIGN.md` — §4 View Engine
- 입력:
  - `ClickUp Space 구조 이해용 설명.md`
- 대상:
  - `src/types.ts`
  - `src/domain/spaces/**`
  - `src/domain/view/**`
  - `src/components/sidebar/SpaceTree.tsx`
  - `src/components/spaces/**`
  - `src/app/spaceSelection.ts`
  - 라우팅 관련 파일
  - `supabase/migrations/`

---

# 0. 이번 재설계의 결론

이번 변경의 핵심은 ClickUp의 계층을 그대로 복사하는 것이 아니다.

현재 제품에서 부족한 것은 정확히 하나다.

> **기존 Project보다 위에서 여러 Project를 하나의 업무 영역으로 묶는 Context가 없다.**

현재는:

```
Project
└── Folder
    └── List
        └── Task

```

구조이기 때문에,

```
연구
├── 드론 배송 연구
├── VR 프로젝트
└── Skin AI 연구

```

에서 `연구`를 표현할 위치가 없다.

따라서 새로운 최상위 업무 영역인 `Space`를 추가한다.

최종 Hierarchy는:

```
Space
└── Project
    ├── Folder (optional)
    │   └── List
    │       └── Task
    │           └── Subtask
    │
    └── List
        └── Task

```

로 한다.

중요한 점은 **기존 Project를 Folder로 개명하거나 재해석하지 않는 것**이다.

```
Space    = 업무 영역
Project  = 프로젝트
Folder   = 프로젝트 내부 선택적 분류
List     = 작업 묶음
Task     = 실제 실행 업무

```

라는 도메인 의미를 그대로 유지한다.

Workspace는 구현하지 않는다.

앱 전체를 하나의 암묵적 Workspace로 취급한다.

---


## 0.1 문서 사용 규칙 — 정본 계층과 충돌 해결

이 문서는 설계 이유, 공통 규칙, 화면별 Contract, 구현 절차를 모두 포함한다.
문서가 커져도 같은 결정을 여러 곳에서 다시 정의하지 않도록 **각 종류의 결정에는 정본 위치를 하나만 둔다.**

### 정본 계층

| 결정 종류 | 정본 위치 | 역할 |
|---|---|---|
| Hierarchy 의미 | §3~§8 | Space / Project / Folder / List / Task의 도메인 의미 |
| Hierarchy invariant | §6 | 이동·소속·중복 저장 금지 |
| Section / Task View 분류 | §12~§13 | 내부 Registry 의미 |
| 사용자 Navigation | §14 | 단일 View Bar와 고정 순서 |
| Scope | §16~§18 | 현재 위치가 어떤 데이터 집합을 뜻하는지 |
| Task View 집합 / List-Table 결정 | §25 | 사용자-facing Task View의 존재 이유 |
| Horizons Domain | §27 | Life / Year / Month / Week / Day 및 저장 의미 |
| Routing / Migration / 저장 규칙 | §30~§45 | 계층을 실제 데이터와 연결하는 규칙 |
| 공통 화면 규칙 | **§49A** | Header, View Bar, 생성 Context, Detail, Loading/Error, 접근성 공통 규칙 |
| 화면별 UI / interaction | §50~§50F | 각 화면에만 존재하는 차이와 예외 |
| 구현 전 검증 | §61~§63 | Repository 사실 확인과 Gap 분류 |
| 구현 Decision Gate | **§0.2** | Repository-dependent 결정을 추적하고 구현 진입 조건을 고정 |
| 구현 판단 우선순위 | §74 | 두 설계 선택이 충돌할 때의 가치 우선순위 |
| 실제 실행 순서 | **§75** | 구현 작업의 유일한 순서 |

### 충돌 시 적용 순서

```text
Repository-confirmed Domain fact
        ↓
Domain / Architecture Contract
        ↓
Shared UI Contract (§49A)
        ↓
View-specific Contract (§50~§50F)
        ↓
예시 / ASCII mockup / 설명 문장
```

단, View-specific Contract는 공통 규칙을 **재정의하는 곳이 아니라 해당 View의 예외만 추가하는 곳**이다.
공통 규칙을 바꾸려면 §49A를 먼저 바꾼다.

또한 다음을 구분한다.

```text
"왜 이렇게 설계하는가"  = rationale
"무엇이 반드시 참인가"  = contract
"어떤 순서로 구현하는가" = implementation sequence
```

rationale이나 예시가 Contract를 덮어쓰지 않는다.
문서 뒤쪽에 있다는 이유만으로 더 높은 우선순위를 갖지도 않는다.

---

## 0.2 Implementation Decision Gates

이 문서에서 Repository 사실에 따라 결정해야 하는 항목은 본문에 흩어진 선택지로 남겨두지 않고 Gate로 추적한다.

Gate의 목적은 구현자가 화면을 만들면서 임의로 Domain 의미를 정하는 것을 막는 것이다.

| Gate | Concern | 현재 상태 | 해소 기준 | 구현 제한 |
|---|---|---|---|---|
| `G-CTX-01a` | Space Scope Task 생성의 제품 규칙 | **CONTRACT FIXED** | §49A.3 규칙 사용 | 소속 Context를 임의 추측해 생성 금지 |
| `G-CTX-01b` | Task/List ownership 필수조건과 default-list 규칙 | **RESOLVED** — §0.3.6 | `listIdFor` 파생 규칙 | 파생 가능한 값을 저장하지 않는다 |
| `G-STATUS-01` | Status definition ownership | **RESOLVED** — §0.3.3 | Project별 소유 | Space 수준 Board는 §60에서 **OUT OF SCOPE** |
| `G-SPACE-DELETE-01` | Space 삭제 lifecycle | **CONTRACT FIXED** | §6 H-INV-06의 non-cascade 정책 사용 | 하위 Project가 있는 Space의 암묵적 hard delete 금지 |
| `G-GANTT-01` | Due-only / no-date Task의 Timeline semantics | **RESOLVED** — §0.3.5 | `span.ts`가 이미 정의 | 새 fallback 규칙을 만들지 않는다 |
| `G-CALENDAR-01` | Calendar date field | **RESOLVED** — §0.3.4 | `scheduledDate`(블록) / `dueDate`(마커) 분리 | 두 필드를 하나로 통합 금지 |
| `G-RENDER-01` | layout → renderer 디스패치 부재 | **RESOLVED** — §0.3.2 | `spec.layout`을 읽는 렌더러 없음 | List/Calendar를 "연결 작업"으로 산정 금지 |
| `G-TAG-01` | `space:<id>` 태그 기반 소속 잔존 | **RESOLVED** — §0.3.7 | 태그 경로 존재 확인 | STEP 4.5에서 제거. Space Entity와 공존 금지 |

Gate 하나가 `RESOLVED`가 되면서 **새 제품 결정이 필요해지는 경우**, 그 결정은 Gate 상태로 표현하지 않고 §60 Workstream의 범위(`이번 범위` 열)로 기록한다. `G-STATUS-01`이 그 사례다 — 사실은 해소되었고, 그 사실이 만든 선택지 중 하나를 §0.3.3이 골랐다.

Gate 상태의 의미:

```text
CONTRACT FIXED
= 이 문서에서 제품 원칙이 이미 정해져 있다. Repository에서는 구현 가능 경로만 확인한다.

REPOSITORY CHECK
= 기존 코드의 Source of Truth를 먼저 확인해야 한다.

RESOLVED
= Repository 근거와 최종 구현 선택이 Revised Implementation Plan에 기록되었다.

OUT OF SCOPE
= 이번 구현에서 해당 기능 자체를 만들지 않으므로 명시적으로 보류한다.
```

`REPOSITORY CHECK` Gate는 해당 기능 구현 단계에 들어가기 전에 반드시 `RESOLVED` 또는 `OUT OF SCOPE`가 되어야 한다.
해소 결과는 §63의 Repository Status / Implementation Action과 함께 STEP 4 Revised Implementation Plan에 기록한다.

---

## 0.3 Repository 검증 결과 (2026-08-17)

STEP 1의 일부를 `v0.8.0` 코드에 대해 실행한 결과다. **이 절의 사실 판정은 문서 본문의 추정보다 우선한다**(§75 STEP 1). 각 항목은 자신이 수정하는 절을 명시한다.

### 0.3.1 문서 가정이 확인된 것

| 문서 | 주장 | 판정 | 근거 |
|---|---|---|---|
| §7 | `List.spaceId`가 실제로는 Project.id | **CONFIRMED** | `types.ts` `List.spaceId` 주석 — Space를 Folder 경유로 찾으면 two-hop join이 된다는 이유로 직접 보유 |
| §30 | `/s/:space`가 Project.id를 Space처럼 사용 | **CONFIRMED** | `spaceSelection.ts` `parseSelection` |
| §27 | Horizons = Life / Year / Month / Week / Day | **CONFIRMED** | `utils/horizons.ts` `HORIZONS` |
| §27 | `Now/Next/Later`는 Today bucket이며 Horizon이 아님 | **CONFIRMED** | `viewSpec.ts` `AXIS_ORDER.bucket` |
| §27.3 | `unscheduled`는 여섯 번째 Horizon이 아님 | **CONFIRMED** | `goalSchedule.ts` `VisibleGoalUnit` |
| §11 | Goals가 `layout:"board"`로 억지 표현되어 있음 | **CONFIRMED** | `spaceViews.ts` `SPACE_VIEWS` |
| §41 | Project 이동이 한 행이어야 함 | **CONFIRMED 가능** | `Task.projectId`는 Project를 직접 가리키므로 상위 관계만 바뀐다 |

### 0.3.2 `G-RENDER-01` — layout → renderer 디스패치가 존재하지 않는다

**§19와 §25.2의 전제를 정정한다.**

`ViewSpec.layout`은 7종을 선언하지만 **`spec.layout`을 읽어 렌더러를 고르는 코드가 저장소에 없다.** `BoardPage`와 `TimelinePage`는 스펙에 `layout` 값을 써넣기만 하고, 렌더러는 직접 호출한다.

```text
선언된 layout   list · columns · rows · board · table · timegrid · timeline
렌더러 존재                            board                      timeline
```

따라서:

```text
Gantt     = 기존 TimelinePage를 새 Scope에 연결   → wiring
Board     = 기존 BoardPage를 새 Scope에 연결      → wiring
List      = 신규 구축                             → NOT wiring
Calendar  = 기존 CalendarView는 Item 엔진 밖의 자체 경로. Scope 연결 + 재작성 → 부분 신규
```

§25.2의 *"기존 `table` renderer를 List View 내부 rendering capability로 재사용할 수 있다"* 는 **재사용할 대상이 없으므로 성립하지 않는다.** `layout: "table"`은 타입 union의 값일 뿐이다.

이 절은 §25.1(독립 Table View를 만들지 않는다)의 **결론을 바꾸지 않는다.** 근거만 바꾼다 — "List와 목적이 중복되므로" 만들지 않는 것이지, "이미 있으니 재사용"이 아니다.

**§60 Workstream 산정에 반영한다.**

### 0.3.3 `G-STATUS-01` — Project별 소유. Space Board는 정의되지 않는다

Status 정의의 Source of Truth는 **Project(현행 코드의 Space)** 다. `membership.ts`의 `statusesWithCustom(project)`가 Project의 기본 세트와 사용자가 추가한 컬럼을 합쳐 돌려주고, List가 자기 세트로 덮어쓸 수 있다(D7).

global이 아니다. 그래서 새 Space 계층에서 다음이 **정의되지 않은 상태로 남는다.**

> 한 Space 안의 두 Project가 서로 다른 상태 세트를 가질 때, Space Board는 어떤 컬럼을 그리는가?

가능한 해소 경로는 셋이다.

```text
(a) Space가 상태를 소유하고 Project가 덮어쓴다   → D7 상속 사슬을 한 단계 늘린다
(b) 합집합으로 그린다                             → 컬럼이 Project 수에 따라 늘어난다
(c) Space 수준 Board를 만들지 않는다              → 상태 축은 Project 안에서만 의미를 갖는다
```

**V1 기본값은 (c)** 로 둔다. Space 수준에서 필요한 것은 Overview · List · Gantt · Calendar이고, "지금 어떤 워크플로 상태인가"는 하나의 프로젝트 안에서 답할 때 의미가 있다. (a)는 필요가 확인되면 D7의 자연스러운 확장이므로 나중에 열 수 있다.

이 결정에 따라 §14 Canonical View Bar는 **Scope에 따라 항목이 달라진다**:

```text
Project / Folder / List Scope
Overview | List | Board | Gantt | Calendar | Goals | Horizons

Space Scope
Overview | List | Gantt | Calendar | Goals | Horizons
```

§49A.1의 "active 항목은 정확히 하나"와 고정 순서 규칙은 그대로다. 항목이 빠지는 것이지 순서가 바뀌는 것이 아니다.

### 0.3.4 `G-CALENDAR-01` — 게이트의 전제가 반대다

게이트는 *"없으면 STEP 4에서 하나로 확정"* 이라고 적혀 있으나, 코드는 **두 필드를 의도적으로 분리**한다.

```text
scheduledDate  → 드래그 가능한 작업 블록. startTime/endTime이 여기에 붙는다
dueDate        → 드래그 불가 종일 마감 마커
```

(`utils/calendarItems.ts` D1/D2 주석)

이는 §27.2가 Goal에 대해 이미 세운 원칙과 같은 구분이다.

```text
schedule / scheduledDate  = 언제 할 것인가
deadlineDate / dueDate    = 언제까지인가
```

**둘을 하나의 canonical dateField로 합치지 않는다.** Calendar mutation은 `scheduledDate`를 쓰고, `dueDate`는 읽기 전용 마커로 유지한다. §50D는 이 규칙을 따른다.

### 0.3.5 `G-GANTT-01` — 이미 해소되어 있다

`domain/view/span.ts`가 규칙을 소유한다.

```text
날짜가 하나라도 있으면      → 막대가 생긴다 (단일 날짜는 하루짜리 막대)
아무 날짜도 없으면          → 타임라인에서 빠진다
추론된 시작일               → inferredStart: true 로 표시해 다르게 그린다
```

추론을 레코드에 저장하지 않는다는 규칙도 이미 명문화되어 있다. **새 fallback을 정의하지 않고 이 모듈을 그대로 쓴다.**

### 0.3.6 `G-CTX-01b` — default List 규칙이 이미 있다

`membership.ts`의 `listIdFor`가 답한다: 저장된 `listId`가 있으면 그것, 없으면 Project의 기본 List. 모든 Project는 기본 List를 갖는다(`ensureDefaultLists`, D5).

따라서 §49A.3의 4번 조항(*"target List를 결정할 기존 규칙이 없다면 List를 추가로 묻는다"*)은 **발동하지 않는다.** Space Scope 생성 흐름에서 물어야 하는 것은 **Project 하나뿐**이다.

추가 제약: 기본 List로 지정될 때는 **`listId`를 저장하지 않고 비운다**(`resolveListMove`). 파생 가능한 값을 저장하면 나중에 파생 결과와 어긋난다. 생성 경로도 이 규칙을 따른다.

### 0.3.7 `G-TAG-01` — Space Entity 도입 전에 제거해야 할 소속 경로

`lib/spaceSelectors.ts`의 `getSpaceTasks`가 아직 살아 있고 `SpaceDetailView`가 사용한다.

```text
소속 판정이 두 벌이다
  (1) task.projectId / listId      ← 도메인 정본
  (2) tags에 `space:<id>` 포함      ← 레거시. 프로젝트 없는 Space가 태스크를 주장하는 경로
```

선행 문서 D6이 이미 제거하기로 했으나 남아 있다. **진짜 Space Entity가 생기면 `space:<id>`라는 문자열이 새 Space를 가리키는 것처럼 보이지만 실제로는 Project를 가리킨다.** 공존시키면 소속 판정이 네 벌이 된다.

**§75 STEP 5보다 먼저 제거한다.** 데이터 변경이 없고(태그 문자열 정리만) 되돌리기 쉬우므로 가장 싼 선행 작업이다.

### 0.3.8 §61 체크리스트 보강 항목

다음이 누락되어 있어 추가한다. 상세는 §61 본문에 반영했다.

```text
space:<id> 태그 소속 경로            → G-TAG-01
listsRevealed 단방향 노출 규칙 (U2)   → SpaceTree 확장 시 보존 필요
타입 어휘 3벌 중복                    → ProjectType / SpaceType / SpaceHubType
project-space-${id} id 네임스페이스   → SpacesPage 지역 타입
```

### 0.3.9 이 절이 바꾸지 않는 것

§8(Project를 Folder로 재해석하지 않는다), §77의 여섯 원칙, §74의 우선순위, H-INV-01~06은 **전부 유지된다.** 위 항목은 모두 그 결정 아래에서의 사실 확인과 범위 조정이다.

---
# 1. 선행 설계에서 뒤집는 것

선행 문서에서는 추가적인 상위 계층을 만들지 않기로 했다.

근거는:

> 단일 사용자에게 계층이 깊어질수록 “어디에 넣지?”라는 판단 비용이 증가한다.

는 것이었다.

이 원칙 자체는 여전히 유효하다.

하지만 현재 요구사항을 실제 사용 구조로 다시 보면:

```
연구                     ← 업무 영역
├── 드론 배송 연구        ← 프로젝트
├── VR 프로젝트
└── ABM 논문

```

처럼 여러 프로젝트를 상위 업무 맥락으로 묶을 필요가 있다.

현재 구조에서는:

```
드론 배송 연구 = Project
VR 프로젝트    = Project
ABM 논문       = Project

```

까지만 표현할 수 있고,

그 위의:

```
연구

```

를 표현할 Entity가 없다.

따라서 이번 재설계에서는 **새로운 계층을 무작정 늘리는 것이 아니라, 실제로 빠져 있던 업무 영역 Context 하나를 추가한다.**

---

# 2. 이번에 추가하지 않는 것

이번 변경을 ClickUp 계층 복제로 확장하지 않는다.

다음은 만들지 않는다.

```
Workspace entity
Subfolder entity
무제한 Folder nesting

```

특히 Subfolder는 현재 필요성이 증명되지 않았다.

기본 구조는 최대한 단순하게 유지한다.

```
Space
→ Project
→ List
→ Task

```

Folder는 프로젝트가 커졌을 때만 선택적으로 사용한다.

```
Space
→ Project
→ Folder
→ List
→ Task

```

즉 사용자는 기본적으로 Folder를 만들지 않아도 된다.

---

# 3. First Principles

이번 설계에서 계층은 화면 모양이 아니라 **데이터의 의미와 이동 비용**으로 결정한다.

## 3.1 Space의 존재 이유

Space의 질문은:

> 이 프로젝트는 어떤 큰 업무 영역에 속하는가?

이다.

예:

```
Space: 연구

Projects
├── 드론 배송 연구
├── VR Serious Game
└── 피부 AI 연구

```

또는:

```
Space: 개인

Projects
├── 블로그
├── 개인 개발
└── 여행 준비

```

Space 자체는 프로젝트가 아니다.

---

## 3.2 Project의 존재 이유

Project는:

> 실제로 끝내야 하는 하나의 독립적인 프로젝트

를 의미한다.

예:

```
Space: 연구

Project:
드론 배송 방식의 공간·기상 조건별 적합성 연구

```

기존 `Project` Entity는 이 의미와 이미 일치하므로 그대로 유지한다.

---

## 3.3 Folder의 존재 이유

Folder는:

> 하나의 Project가 커졌을 때 여러 List를 의미 있는 덩어리로 묶기 위한 선택적 분류

다.

Folder는 Project가 아니다.

예:

```
Project: 드론 배송 연구

Folder: 논문
├── List: 선행연구
├── List: 방법론
└── List: 결과 작성

Folder: 실험
├── List: 공간 측정
└── List: ABM 실행

```

Folder가 필요 없는 Project라면:

```
Project
├── List
├── List
└── List

```

로 바로 사용한다.

---

## 3.4 List의 존재 이유

List는 실제 Task를 담는 작업 묶음이다.

예:

```
List: 문헌연구

├── Contingency Theory 정리
├── Drone logistics 논문 정리
└── Truck-drone 비교 문헌 정리

```

---

# 4. 최종 Hierarchy

최종 Domain Hierarchy는 다음과 같다.

```
APPLICATION
│
└── implicit Workspace
     │
     ├── Space
     │    │
     │    ├── Project
     │    │    │
     │    │    ├── Folder (optional)
     │    │    │    ├── List
     │    │    │    │    └── Task
     │    │    │    │         └── Subtask
     │    │    │    │
     │    │    │    └── List
     │    │    │
     │    │    └── List
     │    │         └── Task
     │    │
     │    └── Project
     │
     └── Space

```

Domain 의미:

```
Space
= 업무 영역

Project
= 실제 프로젝트

Folder
= 프로젝트 내부 선택적 분류

List
= 작업 묶음

Task
= 실행 업무

Subtask
= Task의 세부 업무

```

---

# 5. 기존 데이터 모델과의 관계

현재:

```
Project
→ Folder
→ List
→ Task

```

구조는 가능한 한 유지한다.

새로 필요한 핵심 관계는:

```
Space
→ Project

```

뿐이다.

따라서 개념적으로:

```
Project {
  ...
  spaceId
}

```

관계를 추가한다.

Task·List·Folder 자체를 Space 이동 때문에 다시 작성하지 않는다.

---

# 6. 가장 중요한 Architecture Invariant

## H-INV-01

Project는 정확히 하나의 Space에 속한다.

```
Project.spaceId -> Space.id

```

---

## H-INV-02

Folder는 기존과 동일하게 하나의 Project에 속한다.

---

## H-INV-03

List는 하나의 Project에 속한다.

Folder는 선택적이다.

개념적으로:

```
Project
├── List
└── Folder
    └── List

```

둘 다 가능해야 한다.

---

## H-INV-04

Task ownership 구조는 이번 변경으로 바꾸지 않는다.

기존 Task 관계를 Source of Truth로 유지한다.

---

## H-INV-05

Project를 다른 Space로 이동할 때 하위 데이터를 재작성하지 않는다.

예:

```
BEFORE

Space A
└── Project P
    └── Folder F
        └── List L
            └── Task × 1,000

```

Project를 Space B로 이동하면:

```
AFTER

Space B
└── Project P
    └── Folder F
        └── List L
            └── Task × 1,000

```

실제 변경은 개념적으로:

```
UPDATE projects
SET space_id = 'SpaceB'
WHERE id = 'ProjectP';

```

한 행이면 끝나야 한다.

Folder/List/Task ID는 그대로 유지된다.

---

## H-INV-06

Space 삭제가 하위 Project의 암묵적 Hard Delete를 의미해서는 안 된다.

`G-SPACE-DELETE-01`의 V1 정책은 다음으로 고정한다.

```text
Empty Space
→ 삭제 UX가 존재한다면 Hard Delete 허용 가능

Space with Project(s)
→ Hard Delete 차단
→ Project를 다른 Space로 이동하도록 안내
→ 기존 Archive semantics가 존재하면 Archive를 비파괴 대안으로 제공 가능

Cascade Delete
→ 이번 재설계 범위 밖
```

핵심 invariant는:

```text
Space delete
≠ Project / Folder / List / Task implicit cascade delete
```

이다.

Archive 기능이 Repository에 존재하지 않는다면 이번 재설계만을 위해 새 Archive 시스템을 만들 필요는 없다.
그 경우 최소 안전 동작은 **하위 Project가 있는 Space의 삭제를 차단하고 Project 이동 경로를 제공하는 것**이다.

향후 명시적 Cascade Delete를 제품 기능으로 도입하려면 별도 설계에서 영향 범위, 복구 가능성, 확인 UX, DB FK 정책을 정의해야 한다.

---

# 7. 기존 필드 이름의 의미 왜곡을 확대하지 않는다

현재 저장 구조에는 역사적으로 도메인 의미와 이름이 어긋난 필드가 있을 수 있다.

대표적으로 기존 `List.spaceId`가 실제로 Project ID를 저장하고 있다면 이를 새 Space 도입 후 진짜 Space ID로 재사용해서는 안 된다.

예:

```
LegacyListRow {
  spaceId: string
}

```

실제 의미:

```
Project.id

```

라면 Persistence Boundary에서 변환한다.

```
DB / Persistence

row.spaceId
      ↓
Adapter
      ↓
Domain

list.projectId

```

Domain 코드에서는 잘못된 Legacy 이름이 최대한 노출되지 않도록 한다.

예:

```
// Legacy persistence key.
// `spaceId` stores Project.id.
// Do not propagate this name into domain code.

```

이번 변경을 이유로 기존 저장 키를 즉시 Rename하지 않는다.

구버전 클라이언트와 Migration 호환성이 중요하다.

---

# 8. Project를 Folder로 재해석하지 않는 이유

다음 구조는 채택하지 않는다.

```
Space
└── Folder = 기존 Project
    └── Subfolder = 기존 Folder

```

이렇게 하면 기존:

```
task.projectId

```

가 실제로는 Folder를 의미하게 된다.

또 기존:

```
list.spaceId

```

도 Folder를 의미하게 된다.

그 결과 코드 전체의 Domain Language가 실제 구조와 계속 어긋난다.

Migration 비용을 조금 줄이기 위해 장기적인 의미 부채를 만드는 선택은 하지 않는다.

기존 Project는 이미 실제 프로젝트라는 의미를 가지고 있으므로 그대로 유지한다.

---

# 9. Space 생성 후 기본 사용자 구조

사용자는 처음 Space를 만들고 Project를 넣는다.

예:

```
연구
├── 드론 배송 연구
├── VR 프로젝트
└── Skin AI 연구

공부
├── 대학원 수업
└── 영어 공부

개인
├── 개인 개발
└── 블로그

```

Project 내부에서는 필요에 따라:

```
드론 배송 연구

├── 문헌연구
├── 공간 측정
├── ABM
└── 논문 작성

```

같은 List를 바로 만들 수 있다.

Project가 복잡해졌을 때만:

```
드론 배송 연구

├── Folder: 연구
│   ├── 문헌연구
│   └── 연구 설계
│
└── Folder: 실험
    ├── 공간 측정
    └── ABM 실행

```

처럼 Folder를 사용한다.

---

# 10. Hierarchy와 View를 분리한다

이번 설계의 두 번째 핵심은 Hierarchy와 View를 혼동하지 않는 것이다.

Hierarchy:

```
Space
→ Project
→ Folder
→ List
→ Task

```

는:

> 데이터가 어디에 속하는가?

를 결정한다.

View:

```
List
Board
Calendar
Gantt

```

는:

> 같은 Task를 어떤 방식으로 보는가?

를 결정한다.

View는 새로운 Task Container가 아니다.

---

# 11. 현재 View 구조의 문제

현재 Space 화면의 Navigation이 개념적으로:

```
Overview
Board
Goals
Horizons

```

처럼 되어 있고,

`SPACE_VIEWS`가 이들을 같은 종류로 취급하고 있다면 Domain 구분이 불명확하다.

특히:

```
Board

```

는 Task View지만,

```
Goals
Horizons

```

는 Task View가 아니다.

따라서 단순히:

```
SPACE_VIEWS = [
  board,
  goals,
  horizons,
  list,
  gantt,
  calendar
]

```

처럼 확장하지 않는다.

---

# 12. Space Section과 Task View를 분리한다

내부 Architecture에서는 두 개념을 분리한다.

## Space Sections

Space 자체의 정보를 보여주는 Domain Section.

```
Overview
Goals
Horizons

```

---

## Task Views

동일한 Task Scope를 서로 다른 사용자 목적에 맞게 보여주는 View.

```
List
Board
Calendar
Gantt

```

따라서:

```
SPACE
│
├── Sections
│   ├── Overview
│   ├── Goals
│   └── Horizons
│
└── Task Views
    ├── List
    ├── Board
    ├── Calendar
    └── Gantt

```

`Table`은 이 단계에서 사용자에게 노출되는 독립 Task View가 아니다.
표 형태의 Row/Column UI나 기존 `table` layout/renderer는 List View를 구현하는 내부 Rendering Capability로 재사용할 수 있다.

로 이해한다.

---

# 13. Navigation Registry

Navigation 자체는 하나의 Registry로 관리할 수 있다.

단 각 항목의 종류를 명시한다.

개념 예시:

```
type SpaceSectionId =
  | "overview"
  | "goals"
  | "horizons";

type BuiltInTaskViewId =
  | "list"
  | "board"
  | "calendar"
  | "gantt";

```

그리고:

```
type SpaceNavItem =
  | {
      kind: "section";
      id: SpaceSectionId;
    }
  | {
      kind: "task-view";
      id: BuiltInTaskViewId;
      viewSpec: ViewSpec;
    };

```

실제 이름과 타입 위치는 현재 코드 스타일을 따른다.

중요한 것은 `Goals`를 억지로 `layout: "board"`로 표현하는 구조를 제거하는 것이다.

---

# 14. 사용자 Navigation은 단일 View Bar로 고정한다

내부 Architecture에서는 `Space Section`과 `Task View`를 구분하지만, 사용자에게 그 구분을 두 단계 Navigation으로 강제하지 않는다.

이번 재설계의 Canonical Navigation은 **하나의 평평한 View Bar**로 고정한다.

```text
Research

Overview | List | Board | Gantt | Calendar | Goals | Horizons
```

이 결정은 뒤의 Overview/List/Board/Gantt/Calendar/Goals/Horizons 상세 UI Contract와 동일한 Navigation Mental Model을 사용하기 위한 것이다.

> **§0.3.3 반영 — Scope별 항목 차이.** Status는 Project별로 정의되므로 Space Scope에서 Board 컬럼이 정의되지 않는다. V1의 Space Scope View Bar는 Board를 뺀다.
>
> ```text
> Project / Folder / List Scope
> Overview | List | Board | Gantt | Calendar | Goals | Horizons
>
> Space Scope
> Overview | List | Gantt | Calendar | Goals | Horizons
> ```
>
> **순서는 바뀌지 않는다. 항목이 빠질 뿐이다.** 두 단계 Navigation을 만들지 않는다는 이 절의 결정은 그대로다.

```text
Internal Architecture
├── Section: Overview / Goals / Horizons
└── Task View: List / Board / Gantt / Calendar

User Navigation
└── one View Bar
    Overview | List | Board | Gantt | Calendar | Goals | Horizons
```

즉:

- 내부 Registry의 `kind` 구분은 유지한다.
- 화면에서는 별도의 `Tasks` 상위 Tab이나 두 번째 Navigation Row를 만들지 않는다.
- Context Header와 Primary Action 위치는 View 전환 시 유지한다.
- 현재 선택한 항목 하나만 active state를 가진다.
- Navigation 순서는 위 Canonical 순서를 기본으로 한다.

이렇게 하면 Domain Architecture를 왜곡하지 않으면서도 사용자가 `Section인가 View인가`를 판단해야 하는 비용을 제거할 수 있다.

향후 Saved View가 추가되더라도 이 문서의 기본 Navigation을 임의로 두 단계 구조로 바꾸지 않는다. 별도 요구가 확인되면 Saved View Navigation을 별도로 설계한다.

---

# 15. Overview의 위치

Overview는 Task View가 아니다.

Overview는:

> 현재 선택한 Scope의 상황을 빠르게 파악하기 위한 집계 화면

이다.

예:

```
Space: 연구

Overview
────────────────────────

Projects             3
Open Tasks          28
In Progress          7
Overdue              2

Current Focus
• 연구모형 수정
• VR 테스트

Upcoming
8/18 문헌연구
8/21 실험

Goals
2 active

```

Overview는 별도 Task 데이터를 저장하지 않는다.

기존 Domain 데이터를 집계한다.

---

# 16. View Scope

View Engine의 핵심 원칙은 그대로 유지한다.

> View는 Task를 소유하지 않고 Scope를 받는다.

예:

```
Space View
scope = Space

Project View
scope = Project

Folder View
scope = Folder

List View
scope = List

```

같은 Board Renderer라도:

```
Research Space Board

```

에서는 Research Space에 포함된 Project 전체의 Task를 보여준다.

```
Drone Project Board

```

에서는 해당 Project Task만 보여준다.

---

# 17. Scope Resolver

View마다 별도의 Task Query를 만들지 않는다.

개념적으로:

```
Hierarchy Location
        ↓
Scope Resolver
        ↓
Canonical Task Set
        ↓
ViewSpec
        ↓
Renderer

```

예:

```
Space A
   ↓
resolveScope(spaceId)
   ↓
Task Set
   ↓
Board

```

또는:

```
Space A
   ↓
resolveScope(spaceId)
   ↓
같은 Task Set
   ↓
Gantt

```

가 되어야 한다.

---

# 18. Scope의 예상 구조

정확한 타입은 기존 코드에 맞춰야 하지만 개념적으로는:

```
type ViewScope =
  | {
      type: "space";
      spaceId: string;
    }
  | {
      type: "project";
      spaceId: string;
      projectId: string;
    }
  | {
      type: "folder";
      spaceId: string;
      projectId: string;
      folderId: string;
    }
  | {
      type: "list";
      spaceId: string;
      projectId: string;
      listId: string;
    };

```

처럼 Hierarchy 위치를 명시적으로 표현하는 것을 검토한다.

기존 Scope 타입이 있다면 이를 확장하고 새 Parallel 시스템을 만들지 않는다.

---

# 19. 기존 View Engine 평가

현재 `ViewSpec.layout`이 다음 Layout을 이미 선언하고 있다.

```
list
columns
rows
board
table
timegrid
timeline

```

여기서 중요한 원칙은:

> **View Engine의 Layout Capability와 사용자에게 노출되는 Built-in View는 같은 개념이 아니다.**

> **검증 결과 (§0.3.2).** 이 저장소에는 `spec.layout`을 읽어 renderer를 고르는 코드가 없다. `board`와 `timeline`만 실제 renderer를 갖고, `list` / `table` / `timegrid` / `columns` / `rows`는 타입 union의 값일 뿐이다. 아래 문단의 조건절은 **거짓**이며, List View는 신규 구축이다.

예를 들어 기존 `table` layout/renderer가 안정적으로 존재한다면 이를 List View의 고밀도 Row/Column Rendering에 재사용할 수 있다.

```text
Built-in View: List
        ↓
ViewSpec / preset
        ↓
existing list/table rendering capability
        ↓
TaskTable UI
```

따라서 `ViewSpec.layout`에 `table`이 존재한다는 이유만으로 `Table`을 별도의 `BuiltInTaskViewId`나 View Bar 항목으로 노출하지 않는다.

그리고:

```
applyView()
span.ts
timeline.ts
connectors.ts
TimelinePage

```

등이 존재한다면 상당한 View Engine 기반은 이미 마련되어 있다.

하지만 다음 문장을 전제로 해서는 안 된다.

> Layout type이 있으므로 Space Views Bar에 연결하기만 하면 끝난다.

각 View는 별도 검증이 필요하다.

---

# 20. Built-in View 검증 체크리스트

각 View에 대해 다음을 확인한다.

```
Renderer가 실제 존재하는가?

Space Scope를 받을 수 있는가?

Project Scope를 받을 수 있는가?

Task Detail을 동일하게 열 수 있는가?

Task 생성이 가능한가?

Task 수정이 Canonical Task에 반영되는가?

Filter / Sort / Group이 기존 ViewSpec과 일치하는가?

Empty State가 있는가?

Route / Deep Link가 가능한가?

View state가 필요한 경우 보존되는가?

```

따라서 이번 작업은 **새 Domain 기능 개발보다는 기존 Renderer와 View Engine을 새 Scope에 연결하는 작업이 중심**이지만, 단순 Wiring이라고 단정하지 않는다.

---

# 21. Built-in View와 Custom View를 분리한다

다음 Built-in View를 사용자에게 노출한다.

```
List
Board
Gantt
Calendar

```

`Table`은 별도 Built-in View로 노출하지 않는다.
필요한 표 형태 UI는 List View 내부의 Rendering 방식으로 취급한다.

반면:

```
+ View

```

를 통해 사용자가 새로운 View를 저장하는 것은 별도 기능이다.

`+ View`가 실제 Saved View라면 최소한:

```
SavedView

id
name
scope
layout
filter
sort
group
display
position

```

등을 저장해야 한다.

또한:

```
생성
이름 변경
삭제
순서 변경
설정 저장

```

이 필요하다.

따라서 이번 단계에서 `+ View`를 Built-in Views와 동일 범위로 취급하지 않는다.

---

# 22. View 구현 단계

## V1 — Built-in Registry

우선 Built-in Task View Registry를 만든다.

```
List
Board
Gantt
Calendar

```

사용자 View Bar의 기본 순서는 §14의 Canonical Navigation을 따른다.
각 Renderer의 실제 완성도는 구현 전 검증하되, 내부 `table` capability의 존재 여부는 별도 View 노출의 근거가 되지 않는다.

---

## V2 — Renderer 연결

기존 Renderer를 새로운 Hierarchy Scope에서 재사용한다.

---

## V3 — Navigation 연결

사용자가 Space/Project 안에서 View를 바꿀 수 있도록 한다.

---

## V4 — Saved Views

필요성이 확인된 뒤 `+ View`와 Saved View 모델을 설계한다.

이번 작업의 필수 조건이 아니다.

---

# 23. Board

Board는 Canonical Task를 **Workflow 상태 또는 선택된 grouping 기준으로 읽는 Task View**다.

사용자가 Board에서 답하려는 질문은:

> 각 Task는 지금 어떤 상태에 있는가?

이다.

Board가 별도 Task 저장소나 `SpaceBoardTask` 같은 Entity를 소유하지 않는다.

```text
Hierarchy Scope
    ↓
Canonical Task Set
    ↓
Board projection
```

**이 절은 Board의 존재 이유만 정의한다.**
Column, Card, DnD, Empty/Responsive 등 실제 UI Contract의 정본은 **§50B**다.

# 24. Gantt

Gantt는 같은 Canonical Task를 **기간·순서·Dependency 축으로 읽는 Task View**다.

사용자가 Gantt에서 답하려는 질문은:

> Task가 언제 시작·종료되고 어떤 순서로 연결되는가?

이다.

```text
Hierarchy Scope
    ↓
Canonical Task Set
    ↓
startDate / dueDate / dependency projection
```

Board와 별도의 Task Entity를 만들지 않는다.

**이 절은 Gantt의 존재 이유만 정의한다.**
Split layout, Bar, Drag/Resize, 날짜 예외 처리 등 UI Contract의 정본은 **§50C**다.

# 25. Task View의 존재 이유와 List / Table 구분

Task View 하나가 사용자 Navigation에 독립적으로 존재하려면 단순히 Renderer 모양이 달라서는 부족하다.

각 View는 사용자가 **서로 다른 질문에 답하거나 서로 다른 작업을 더 잘 수행하게 해야 한다.**

이번 단계의 Built-in Task View는 다음 네 개다.

```text
List
= 지금 어떤 Task가 있고 무엇을 확인·수정해야 하는가?
= 고밀도 Row 기반 Task management

Board
= 각 Task는 지금 어떤 상태에 있는가?
= Workflow / grouping 중심

Calendar
= Task를 언제 해야 하는가?
= 날짜 중심

Gantt
= Task가 언제 시작·종료되고 어떤 순서와 기간으로 연결되는가?
= 기간 / 순서 / dependency 중심
```

모두 동일한 Scope Resolver와 Canonical Task Set을 사용한다.

## 25.1 독립 Table View를 두지 않는 이유

현재 상세 List View는 이미 다음 기능을 가진 기본 작업 화면으로 설계되어 있다.

```text
Row / Column
핵심 Field 표시
Inline field editing
Filter
Sort
Group
Search
Column display
Selection / Bulk action
```

따라서 같은 Task를 다시 필드 기반 표로 보여주는 독립 `Table View`를 추가하면 사용자 목적이 List와 중복된다.

```text
List View
= Task를 표 형태로 훑고 직접 관리

Table View
= 같은 Task를 다시 표 형태로 훑고 직접 관리
```

처럼 되면 Navigation 항목만 늘고 새로운 Mental Model을 제공하지 못한다.

그래서 이번 단계에서는:

```text
User-facing Built-in View
≠ Table

List View internal rendering
= TaskTable / existing table renderer를 사용할 수 있음
```

으로 구분한다.

## 25.2 `table` layout / renderer는 삭제하지 않는다

> **검증 결과 (§0.3.2).** Table Renderer는 존재하지 않는다. `layout: "table"`은 타입 값만 있다. **§25.1의 결론(독립 Table View를 만들지 않는다)은 유지되지만 근거가 바뀐다** — "이미 있으니 재사용"이 아니라 "List와 사용자 목적이 중복되므로 만들지 않는다"가 유일한 근거다. 아래 절은 타입 값을 지우지 말라는 지침으로만 읽는다.

기존 View Engine에 `layout: "table"` 또는 Table Renderer가 이미 존재한다면 제거하지 않는다.

그것은 **제품 Navigation Entity가 아니라 Rendering Capability**로 취급한다.

개념적으로:

```text
List View
    ↓
ViewSpec / preset
    ↓
list 또는 table rendering capability
    ↓
TaskTable
    ↓
Task Row × N
```

가 가능하다.

즉:

```text
BuiltInTaskViewId
≠ ViewSpec.layout
```

이다.

View 이름과 Renderer 이름을 1:1로 맞추기 위해 기존 Engine을 복제하거나 삭제하지 않는다.

## 25.3 향후 Table View 승격 Gate

향후 다음과 같은 **독립적인 field-centric workflow**가 실제로 필요해지면 Table View를 다시 검토할 수 있다.

```text
많은 Field를 동시에 다루는 고밀도 데이터 작업
Custom Fields 중심 화면
강한 Column reorder / resize / visibility workflow
대량 Field editing
List와 명확히 다른 사용자 목적
```

하지만 현재 범위에서는 Custom Fields와 Saved View 자체가 필수가 아니며, 위 필요성도 증명되지 않았다.

따라서 지금은 미래 확장을 위해 빈 `Table` Navigation을 미리 만들지 않는다.

---

# 26. Goals

Goals는 Task View가 아니라 **Domain Section**이다.

질문은:

> 이 Space 또는 Project에서 무엇을 달성하려고 하는가?

이다.

Task는 그 목표를 실행하기 위한 단위일 수 있지만 Goal 안에 Task를 복제하지 않는다.

```text
Goal
  └── linked Task references
```

**이 절은 Goals의 도메인 역할만 정의한다.**
Card, Progress, Completed 분리, Detail interaction 등 화면 Contract의 정본은 **§50E**다.

# 27. Horizons — 실제 Domain 의미 확정

> **정본 책임:** 이 절은 Horizons의 **Domain 의미와 저장 규칙**을 소유한다. 5-column 배치, Card anatomy, Drag UI, Responsive 등 화면 표현은 §50F가 소유한다. §50F가 이 절의 Domain 의미를 다시 정의해서는 안 된다.

Horizons의 의미는 더 이상 추정 항목이 아니다.

현재 Repository 기준 Horizons의 시간 지평은 다음 다섯 개로 확정되어 있다.

```text
Life
Year
Month
Week
Day
```

순서는 가장 넓은 계획 지평에서 가장 가까운 실행 지평으로:

```text
Life → Year → Month → Week → Day
```

이다.

`Now / Next / Later`는 Horizons의 Domain이 아니다.

그 구분은 Today Queue의 `bucket` 축과 같은 별도 계획 개념이며, Horizons에 재사용하지 않는다.

즉:

```text
Today bucket
Now / Next / Later
= 오늘 안에서 무엇을 먼저 할 것인가?

Horizons
Life / Year / Month / Week / Day
= 어느 계획 규모와 캘린더 기간에 둘 것인가?
```

두 축을 섞지 않는다.

---

## 27.1 Horizons가 답하는 질문

Horizons의 질문은:

> **이 목표 또는 실행 항목을 어느 계획 지평과 어느 기간에서 바라볼 것인가?**

이다.

Board의 질문:

> 지금 어떤 Workflow 상태인가?

와도 다르다.

Calendar의 질문:

> 어느 날짜/시간에 실행하는가?

와도 다르다.

Gantt의 질문:

> 어느 기간 동안 어떤 순서로 진행되는가?

와도 다르다.

따라서 Horizons는 계속 `Domain Section`으로 분류한다.

`layout: "columns"` 또는 `groupBy: "horizon"`을 사용한다고 해서 사용자-facing Task View로 재분류하지 않는다.

---

## 27.2 Goal / Milestone과 Task는 같은 저장 규칙을 사용하지 않는다

Horizons에서 보이는 항목은 하나의 종류가 아니다.

```text
Goal
Milestone
Task
```

가 하나의 Horizon projection에서 함께 보일 수 있다.

하지만 Source of Truth는 다르다.

### Goal / Milestone

계획 단위를 명시적으로 저장하는 기존 `GoalSchedule`을 사용한다.

개념적으로:

```text
GoalSchedule
= unscheduled
| life
| year(startDate)
| month(startDate)
| week(startDate)
| day(startDate)
```

`Year / Month / Week / Day`의 `startDate`는 특정 마감일이 아니라 **선택한 캘린더 기간의 anchor**다.

예:

```text
{ unit: "month", startDate: "2026-09-01" }
= 2026년 9월에 집중할 목표
```

Goal의 `deadlineDate`가 있다면 계획 기간과 별도로 유지한다.

```text
schedule
= 언제의 계획으로 둘 것인가?

deadlineDate
= 언제까지 끝내야 하는가?
```

둘을 합치지 않는다.

### Task

Task는 실행 단위이므로 GoalSchedule로 승격하지 않는다.

기존:

```text
scheduledDate
startTime / endTime
dueDate
```

를 계속 사용한다.

Task가 Horizons에 놓이는 위치는 기존 날짜 기반 compatibility rule에서 파생한다.

즉:

```text
Goal / Milestone
→ explicit planning period

Task
→ execution date projection
```

이다.

---

## 27.3 `unscheduled`는 여섯 번째 Horizon이 아니다

GoalSchedule의:

```text
unscheduled
```

은 화면에 표시할 Horizon Column이 아니다.

의미는:

> 아직 Horizons의 특정 계획 지평에 올리지 않은 목표

다.

따라서:

```text
Visible Horizons
= Life / Year / Month / Week / Day

Unscheduled
= Board / Goal backlog에 남아 있음
```

으로 구분한다.

`Life`와 `unscheduled`도 같은 의미가 아니다.

```text
Life
= 사용자가 장기 방향으로 명시적으로 계획함

Unscheduled
= 아직 시간 지평을 선택하지 않음
```

이다.

---

## 27.4 Horizon은 별도 Entity가 아니다

다음은 만들지 않는다.

```text
HorizonTask
HorizonGoal
NowTask / NextTask / LaterTask
SpaceHorizonItem DB table
```

기존 Source Record를 하나의 projection으로 변환한다.

개념적으로:

```text
Goal / Milestone / Task
          ↓
Existing Horizon rules
          ↓
Unified Horizon Item projection
          ↓
Life | Year | Month | Week | Day
```

이다.

Space / Project Scope 역시 Horizon membership를 Task나 Goal에 중복 저장하지 않는다.

새 Space 계층에서는:

```text
Project.spaceId
      ↓
Hierarchy Scope
      ↓
현재 Scope의 Goal / Milestone / Task
      ↓
Horizon projection
```

으로 계산한다.

---

## 27.5 Board와 Horizons는 서로 직교하는 두 축이다

하나의 Goal은 동시에:

```text
Project / List / Status
```

라는 업무 구조와,

```text
Life / Year / Month / Week / Day
```

라는 계획 시간 구조를 가질 수 있다.

예:

```text
Project: 드론 배송 연구
Status: In Progress
Horizon: Month = 2026-09
```

이 세 값은 서로를 대체하지 않는다.

따라서 Goal을 다른 Horizon으로 이동했다고 Project나 Status가 바뀌어서는 안 되고,
Project를 다른 Space로 옮겼다고 GoalSchedule이 바뀌어서도 안 된다.

---

# 28. Space Sidebar

Sidebar의 목적은:

> 사용자가 어느 업무 Context로 이동할 것인가?

를 결정하는 것이다.

예:

```
Spaces

▼ 연구
   ├── 드론 배송 연구
   ├── VR 프로젝트
   └── Skin AI 연구

▼ 개인
   ├── 개인 개발
   └── 블로그

▼ 공부
   └── 대학원

```

기본 상태에서는 Project까지만 보여주는 것도 가능하다.

필요하면 Project를 펼쳤을 때:

```
드론 배송 연구
├── 문헌연구
├── 실험
└── 분석

```

처럼 Folder/List를 탐색하게 한다.

기존 `SpaceTree.tsx`를 최대한 확장한다.

---

# 29. Sidebar와 View Navigation 역할

둘의 역할을 명확히 나눈다.

```
Sidebar
= 어디를 볼 것인가?

View Bar
= 그곳을 어떻게 볼 것인가?

```

예:

```
SIDEBAR

연구
└── 드론 배송 연구

```

를 선택한 후:

```
VIEW BAR

Overview | List | Board | Gantt | Calendar | Goals | Horizons

```

을 바꾸는 구조다.

---

# 30. Routing — 기존 완료 판단을 철회한다

기존:

```
/s/:space
/s/:space/f/:folder
/s/:space/l/:list

```

구조가 현재 `Project.id`를 Space ID처럼 사용하고 있었다면, 새로운 진짜 Space Entity를 추가하는 순간 기존 Route는 그대로 사용할 수 없다.

따라서 View Scope와 Routing은 **부분 완료**로 재분류한다.

---

# 31. 권장 새 Route 구조

개념적으로:

```
/s/:spaceId

```

Space 수준.

```
/s/:spaceId/p/:projectId

```

Project 수준.

```
/s/:spaceId/p/:projectId/f/:folderId

```

Folder 수준.

```
/s/:spaceId/p/:projectId/l/:listId

```

Project 직속 List.

또는 Folder 내부 List라면:

```
/s/:spaceId/p/:projectId/f/:folderId/l/:listId

```

를 사용할 수 있다.

실제 Router의 중첩 방식은 현재 구조를 분석하고 가장 간단한 형태를 선택한다.

---

# 32. View Route

선택한 View를 URL로 표현하는 것이 가능하면 권장한다.

예:

```
/s/:spaceId/overview
/s/:spaceId/board
/s/:spaceId/gantt

```

또는:

```
/s/:spaceId?view=board

```

처럼 현재 Router에 더 자연스러운 방법을 사용해도 된다.

필수 조건:

```
새로고침 후 View 유지

Back / Forward 정상 동작

Deep Link 가능

Hierarchy Context 유지

```

이다.

---

# 33. Legacy Route Migration

기존:

```
/s/:legacyProjectId

```

가 Project를 의미했다면 새 구조에서 같은 Route를 Space로 해석해서는 안 된다.

기존 Deep Link를 위한 Compatibility Layer를 고려한다.

개념:

```
Old Route
/s/:legacyProjectId

       ↓

Legacy resolver

       ↓

Project.spaceId 조회

       ↓

New Route
/s/:spaceId/p/:projectId

```

지원 기간과 삭제 시점은 별도로 정한다.

---

# 34. `spaceSelection.ts` Migration

기존 `selectedSpaceId`가 실제로 Project ID였다면 이름과 의미가 바뀐다.

이를 그대로 두면:

```
old Project ID

```

를:

```
new Space ID

```

로 잘못 읽는 버그가 발생한다.

따라서 Persisted Selection Migration이 필요하다.

기존:

```
selectedSpaceId = projectId

```

에서 새로운 구조는 개념적으로:

```
selectedSpaceId   = parent Space ID
selectedProjectId = old Project ID

```

가 된다.

---

# 35. Hierarchy Selection 모델

필요하다면 선택 상태를 문자열 하나가 아니라 명시적인 Location으로 표현한다.

예:

```
type HierarchySelection =
  | {
      type: "space";
      spaceId: string;
    }
  | {
      type: "project";
      spaceId: string;
      projectId: string;
    }
  | {
      type: "folder";
      spaceId: string;
      projectId: string;
      folderId: string;
    }
  | {
      type: "list";
      spaceId: string;
      projectId: string;
      listId: string;
    };

```

기존 모델이 이미 이에 준하는 구조를 제공한다면 재사용한다.

---

# 36. Database 변경

핵심 DB 변경은 최대한 작게 유지한다.

개념적으로:

```
spaces

```

테이블을 신규 생성한다.

그리고:

```
projects.space_id

```

관계를 추가한다.

Folder/List/Task는 가능한 한 Schema를 변경하지 않는다.

---

# 37. Space 최소 모델

초기 Space는 최소한의 Identity만 가진다.

개념:

```
Space {
  id
  name
  icon?
  description?
  position?
  archivedAt?
  createdAt
  updatedAt
}

```

현재 DB Convention에 맞춰 실제 필드는 조정한다.

초기 단계에서 ClickUp식 Permission, Custom Field, ClickApps 등을 넣지 않는다.

---

# 38. 기존 데이터 Migration 원칙

기존 Project가 어느 Space에 속해야 하는지 Migration 코드가 추측하지 않는다.

예를 들어 Project 이름을 보고:

```
Drone → 연구
Blog → 개인

```

처럼 자동 분류하지 않는다.

사용자의 의미를 추측하는 Migration은 피한다.

---

# 39. Default Space Migration

가장 안전한 방식은 기존 Project를 담는 기본 Space 하나를 만드는 것이다.

예:

```
기존

Drone Project
VR Project
Skin AI
Blog

```

Migration 후:

```
기본 공간
├── Drone Project
├── VR Project
├── Skin AI
└── Blog

```

이후 사용자가 직접:

```
연구
개인
공부
생활

```

등의 Space를 만들고 Project를 이동할 수 있다.

---

# 40. 권장 Migration 단계

## M1

`spaces` 테이블 생성.

---

## M2

기존 사용자별 Default Space 생성.

단일 사용자 구조라면 현재 데이터 모델에 맞게 하나를 생성한다.

---

## M3

`projects.space_id` nullable 관계 추가.

---

## M4

기존 모든 Project를 Default Space로 Backfill.

---

## M5

데이터 검증 후 `projects.space_id`를 필수 관계로 변경.

현재 DB 전략상 nullable 유지가 더 안전하면 그 이유를 문서화한다.

---

## M6

Foreign Key / Index 추가.

---

## M7

Domain Read Path를 새 구조로 전환.

---

## M8

`spaceSelection` 및 Persisted UI State Migration.

---

## M9

Routing / Legacy Route Compatibility 적용.

---

## M10

Write Path를 새 Space 구조로 전환.

---

# 41. Project 이동

Project 이동은 매우 가벼운 연산이어야 한다.

사용자가:

```
기본 공간
└── Drone Project

```

를:

```
연구
└── Drone Project

```

로 옮기면:

```
Project.spaceId

```

만 변경한다.

하위:

```
Folder
List
Task
Subtask

```

는 다시 작성하지 않는다.

이것이 새로운 Architecture의 핵심 장점이다.

---

# 42. View Scope와 Project 이동

Project가 Space A에서 Space B로 이동하면 별도 Task Migration 없이 즉시:

```
Space A Board

```

에서는 Task가 사라지고,

```
Space B Board

```

에서는 같은 Task가 나타나야 한다.

Scope Resolver가 Hierarchy를 따라 계산하기 때문이다.

즉:

```
Project.spaceId 변경
        ↓
Hierarchy 변경
        ↓
Scope 결과 변경

```

이어야 한다.

Task에 `spaceId`를 중복 저장해서 동기화하지 않는다.

---

# 43. Denormalization 금지

이번 변경을 쉽게 만들기 위해:

```
Task.spaceId
Folder.spaceId
List.realSpaceId

```

같은 중복 Field를 무분별하게 추가하지 않는다.

Space membership는 Project 관계를 통해 계산할 수 있다면 그것을 Source of Truth로 한다.

필요한 Denormalization이 있다면 성능 근거와 동기화 규칙을 별도로 작성해야 한다.

---

# 44. Canonical Task Source

Task 데이터는 계속 하나만 존재한다.

다음 구조를 만들지 않는다.

```
Space Tasks
Board Tasks
Gantt Tasks
Calendar Tasks

```

실제 구조:

```
Canonical Tasks
      │
      ├── List Projection
      ├── Board Projection
      ├── Calendar Projection
      └── Gantt Projection

```

이어야 한다.

---

# 45. View Engine 목표 구조

최종적으로:

```
Hierarchy Location
        │
        ▼
Scope Resolver
        │
        ▼
Canonical Tasks
        │
        ▼
ViewSpec
        │
        ├── filter
        ├── sort
        ├── group
        └── layout
        │
        ▼
Renderer

```

구조를 지향한다.

---

# 46. Overview도 같은 Scope 사용

Overview가 독립 Query 규칙을 가지면 Board와 숫자가 어긋날 수 있다.

따라서:

```
resolveTasks(spaceScope)
        ↓
Canonical Task Set
        ↓
Aggregation
        ↓
Overview

```

방식으로 한다.

예:

```
Board: 28 Tasks
Overview: Open 28

```

처럼 같은 의미를 유지한다.

---

# 47. Gantt 예외

Gantt는 Start Date / Due Date가 없는 Task를 화면에서 표시하지 않거나 별도 영역에 둘 수 있다.

하지만 이것은 Source Scope가 다른 것이 아니다.

```
Space Task Set
      ↓
Gantt-compatible projection

```

의 차이다.

---

# 48. Space 화면

권장 기본 Layout:

```
┌────────────────────────────────────────────────────┐
│ Space Header                                       │
│                                                    │
│ 연구                                               │
│ 연구·논문·실험 프로젝트                           │
├────────────────────────────────────────────────────┤
│ Overview | List | Board | Gantt | Calendar | Goals | Horizons      │
├────────────────────────────────────────────────────┤
│                                                    │
│                 Selected Content                   │
│                                                    │
└────────────────────────────────────────────────────┘

```

Header와 Overview 역할을 분리한다.

---

# 49. Space Header

> Header의 화면 간 공통 동작은 §49A에서 정본으로 정의한다. 이 절은 Space Header에 필요한 Entity 정보만 다룬다.

Header는 Context Identity를 제공한다.

포함 후보:

```
Icon
Name
Description
More menu

```

진행률, KPI 등을 Header에 과도하게 넣지 않는다.

그런 정보는 Overview에서 보여준다.

---


# 49A. Shared UI Contract — 화면 전체가 한 번만 공유하는 규칙

§50~§50F는 각 화면의 차이만 정의한다.
다음 규칙은 모든 Section / Task View가 공유하며, 화면별 절에서 같은 내용을 다시 선언하지 않는다.

## 49A.1 App Shell / Context Header / View Bar

Hierarchy 위치를 선택하면 Shell은 다음 순서를 유지한다.

```text
Context Header
  - Breadcrumb / Entity title
  - Context action (+ Task 등)
  - More

Canonical View Bar
  Overview | List | Board | Gantt | Calendar | Goals | Horizons

View-specific content
```

규칙:

1. View 전환으로 Header 높이와 주요 Action 위치가 흔들리지 않는다.
2. active 항목은 정확히 하나다.
3. 각 View 내부에 `LIST VIEW`, `BOARD`, `CALENDAR` 같은 두 번째 큰 페이지 제목을 반복하지 않는다.
4. Goals/Horizons가 Domain Section이어도 두 번째 Navigation row를 만들지 않는다.
5. Navigation의 정본 순서는 §14다. §50~§50F는 active id만 지정한다.

## 49A.2 Scope / Canonical Data

모든 화면은 현재 Hierarchy Location을 직접 해석하지 않고 §17의 Scope Resolver 결과를 사용한다.

```text
Hierarchy Location
      ↓
Scope Resolver
      ↓
Canonical records / projection
      ↓
View renderer or Domain Section
```

Task View는 동일한 Canonical Task Set을 사용한다.
Goals/Horizons는 해당 Domain source를 같은 Hierarchy Scope로 제한한다.

화면마다 별도 `spaceId` 필터 로직이나 수동 descendant walk를 만들지 않는다.

## 49A.3 Create Context

Header의 `+ Task`와 View 내부 `+ Task`는 같은 생성 경로를 사용한다.
사용자가 이미 선택한 위치는 생성 Context로 자동 상속한다.

기본 원칙은:

> **이미 알고 있는 Context는 자동 상속하고, Canonical Task ownership을 완성하기 위해 아직 모르는 최소 Context만 묻는다.**

```text
Project에서 생성 → 해당 Project의 기본/선택 List Context
List에서 생성    → 해당 List
Board column에서 생성 → 동일 Scope + 해당 Status
Calendar date cell에서 생성 → 동일 Scope + 해당 날짜
```

### Space Scope에서 Task 생성 — `G-CTX-01`

Space는 Task의 최종 ownership container가 아니다.
따라서 Space 수준 List / Board / Gantt / Calendar에서 Task를 생성할 때 현재 Space만 알고 있다는 이유로 Project/List를 임의 추측해서는 안 된다.

Canonical flow:

```text
Current Space
    ↓ automatically inherited
Known view context
    ├── Board column → Status inherited
    └── Calendar cell → Date inherited
    ↓
Choose Project inside current Space
    ↓
Resolve target List using existing ownership/default-list rule
    ↓
If target List is still ambiguous → ask only for List inside chosen Project
    ↓
Create Canonical Task
```

규칙:

1. Space를 Create Modal에서 다시 선택하게 하지 않는다.
2. Project 선택지는 현재 Space에 속한 Project로 제한한다.
3. 기존 Domain에 Project의 default/selected List 규칙이 있어 target List가 결정되면 List를 다시 묻지 않는다.
4. Task가 반드시 List에 속해야 하고 target List를 결정할 기존 규칙이 없다면 선택한 Project의 List만 추가로 묻는다.
5. Board/Calendar가 이미 제공한 Status/Date는 유지하며 Project/List를 고르는 과정에서 잃지 않는다.
6. ownership이 완성되지 않은 Task를 임시로 `Space Task` 같은 별도 Entity/Store에 저장하지 않는다.

`Project → List → Task`의 실제 ownership 필수조건과 default-list 규칙은 STEP 3에서 Repository를 확인해 `G-CTX-01`의 구현 경로를 확정한다.

사용자가 이미 정한 Context를 Create Modal에서 이유 없이 다시 선택하게 하지 않는다.
Goal 생성은 Task 생성과 다른 Domain mutation이며 Goals/Horizons의 명시적 `+ Goal` 경로를 사용한다.

## 49A.4 Detail Surface

Task를 여는 View가 달라도 Task Detail은 하나의 공용 Surface를 사용한다.

```text
List ─┐
Board ├── TaskDetail
Gantt ┤
Calendar ┘
```

View는 `taskId`와 필요한 return/focus context만 전달한다.
View마다 별도 Task Detail 모델이나 저장 규칙을 만들지 않는다.

Goal 역시 Goals/Horizons에서 같은 Goal Detail surface를 공유하는 방향을 유지한다.

## 49A.5 Loading / Error / Mutation Failure

공통 원칙:

1. Shell, Context Header, View Bar는 데이터 로딩 때문에 사라지지 않는다.
2. Content의 구조를 유지하는 skeleton을 사용해 loading 전후 layout shift를 줄인다.
3. **Scope resolution 자체 실패**는 해당 Content 영역 전체 error state다.
4. **부분 집계/Picker/개별 mutation 실패**는 가능한 한 가장 작은 interaction 범위에서 처리한다.
5. Optimistic mutation을 사용했다면 실패 시 기존 Canonical value로 복원한다.
6. 이번 재설계만을 위해 새로운 전역 cache/error framework를 만들지 않는다.

각 View 절에는 skeleton의 모양이나 mutation rollback처럼 **그 View만의 차이만 적는다.**

## 49A.6 Responsive Baseline

공통 원칙:

- 읽을 수 없는 수준으로 Desktop layout을 압축하지 않는다.
- View의 핵심 mental model을 모바일에서 다른 기능으로 바꾸지 않는다.
- 정보가 줄어들 때는 primary information을 먼저 남기고 secondary metadata는 Detail로 보낸다.
- Horizontal scroll이 그 View의 공간 모델에 자연스러우면 허용한다.
- 정확한 breakpoint는 기존 Design Token / Shell 폭을 우선하고, 이 문서의 숫자는 구현 검증 대상이다.

List/Board/Gantt/Calendar/Horizons의 구체적인 축소 방식은 각 View Contract에 남긴다.

## 49A.7 Accessibility Baseline

공통 원칙:

1. Drag/resize가 유일한 mutation 경로가 되어서는 안 된다.
2. Keyboard 또는 Detail/Picker/Menu를 통한 비드래그 대체 경로를 제공한다.
3. interactive Card/Row/Event는 focus와 button semantics를 명확히 한다.
4. 색상만으로 Status, Horizon, Priority, 기간을 전달하지 않는다.
5. 진행률/날짜/기간처럼 시각적으로만 읽히는 정보에는 접근 가능한 text label/value를 제공한다.

각 View 절에는 해당 View의 구체적인 keyboard target과 label만 적는다.

## 49A.8 Visual Tokens

Spacing, radius, typography, shadow, border, focus ring의 정확한 값은 기존 Design System을 따른다.
§50~§50F는 **정보 구조, 상대적 위계, 고정 interaction**을 규정하고 새로운 독립 Design System을 만들지 않는다.

---
# 50. Overview — 상세 UI / Layout Contract

Overview는 단순한 데이터 모음이 아니라:

> **선택한 Scope의 상태를 5초 안에 이해하고, 다음 행동으로 바로 이동하는 기본 화면**

이다.

이번 단계에서는 Overview의 Desktop 기본형을 아래 시안과 동일한 정보 위계로 고정한다.

특히 Project를 선택한 경우 다음 구성을 **Canonical Project Overview**로 사용한다.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb                                                                  │
│ [Icon] 드론 배송 연구                                         [ + Task ] […] │
│        공간·기상 조건에 따른 배송 방식 적합성 연구                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ Overview | List | Board | Gantt | Calendar | Goals | Horizons               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│ │ Open Tasks   │ │ In Progress  │ │ Completed    │ │ Overdue      │          │
│ │ 12           │ │ 5            │ │ 15           │ │ 1            │          │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘          │
│                                                                              │
│ ┌────────────────────────────────────────────┐ ┌───────────────────────────┐ │
│ │ Lists                                      │ │ Upcoming                  │ │
│ │                                            │ │                           │ │
│ │ 선행연구        3          60%             │ │ AUG 18  문헌연구 정리    │ │
│ │ 방법론          2          40%             │ │ AUG 21  실험 조건 검증   │ │
│ │ 결과 작성       4          70%             │ │ AUG 24  ABM 실험 실행    │ │
│ │ 공간 측정       1          30%             │ │                           │ │
│ │ ABM 실행        2          50%             │ └───────────────────────────┘ │
│ │ 일반            0         100%             │                               │
│ └────────────────────────────────────────────┘ ┌───────────────────────────┐ │
│                                                │ Goals                     │ │
│ ┌────────────────────────────────────────────┐ │ 저널 논문 1편 투고  62%  │ │
│ │ Recently updated tasks                     │ └───────────────────────────┘ │
│ │ 연구모형 수정             선행연구  Aug 18 │                               │
│ │ ABM 시나리오 설계         ABM 실행  Aug 17 │ ┌───────────────────────────┐ │
│ │ 도시 공간 변수 정리       공간 측정 Aug 16 │ │ Horizons                  │ │
│ └────────────────────────────────────────────┘ │ Life 2 · Year 3 · Month 6 │ │
│                                                │ Week 4 · Day 5             │ │
│                                                └───────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

이 Wireframe은 단순 예시가 아니라 **Desktop Project Overview의 기본 배치 Contract**다.

기존 Design System과 충돌하지 않는 범위에서 색상·폰트 세부값은 기존 Token을 사용하되, **영역 순서·정보 우선순위·Grid 구조·상호작용은 이 문서를 우선한다.**

---

## 50.1 Overview가 시작되는 위치

Overview 본문은 다음 Shell 아래에서 시작한다.

```text
App Shell
├── Sidebar
└── Main
    ├── Context Header
    ├── View Bar
    └── Overview Content   ← 이 절의 대상
```

Overview 안에서 Header나 View Bar를 다시 렌더링하지 않는다.

즉:

```text
Overview component
≠ entire Project page
```

다.

Overview는 현재 `HierarchySelection / ViewScope`를 받아 집계와 요약 UI만 렌더링한다.

---

## 50.2 Desktop 전체 Grid

Desktop 기준 Overview Content는 다음 세 구간으로 나눈다.

```text
Overview Content
│
├── Summary Row
│   └── 4 KPI Cards
│
└── Body Grid
    ├── Main Column
    │   ├── Lists / Projects Summary
    │   └── Recently Updated Tasks
    │
    └── Aside Column
        ├── Upcoming
        ├── Goals Summary
        └── Horizons Summary
```

권장 Layout Token:

```text
Content horizontal padding     24px
Content top padding            20~24px
Section gap                    16px
Card gap                       12~16px

Summary columns                repeat(4, minmax(0, 1fr))
Body grid                      minmax(0, 2fr) minmax(280px, 0.9fr)
Body main : aside              약 68~72% : 28~32%
Body column gap                16px
```

Main Column과 Aside Column은 별도 페이지가 아니라 같은 Overview의 한 Grid다.

---

## 50.3 Summary Row — 상태 카드 4개 고정

Project Overview의 첫 번째 정보 행은 다음 네 개를 이 순서로 노출한다.

```text
1. Open Tasks
2. In Progress
3. Completed
4. Overdue
```

기본 Desktop에서는 **한 행에 같은 폭의 4개 Card**를 사용한다.

```text
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Open Tasks │ │ In Progress│ │ Completed  │ │ Overdue    │
│ 12         │ │ 5          │ │ 15         │ │ 1          │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

각 Card의 구조:

```text
[Semantic Icon]  Label
                 Primary Count
                 Secondary helper text(optional)
```

권장 Token:

```text
Card min height      104~116px
Card padding         16px
Card radius          10~12px
Border               1px neutral
Shadow               none 또는 매우 약하게
Primary number       가장 높은 text emphasis
Label                medium emphasis
Helper               muted
```

색상은 정보의 보조 수단이다.

```text
Open Tasks     neutral / primary accent
In Progress    blue/purple 계열 semantic accent
Completed      success semantic
Overdue        danger semantic
```

단 색상만으로 상태를 구분하지 않고 Label과 Icon을 항상 함께 사용한다.

---

## 50.4 Summary Count의 계산 규칙

모든 Summary Count는 Overview 전용 Store에서 계산하지 않는다.

```text
Current Scope
     ↓
resolveTasks(scope)
     ↓
Canonical Task Set
     ↓
status aggregation
     ↓
Summary Cards
```

이어야 한다.

예:

```text
Board scope task count
=
List scope task count
=
Overview aggregation source
```

상태 이름이 현재 제품에서 `todo / doing / done` 등 다른 Enum을 사용한다면 기존 Status Model을 Source of Truth로 사용한다.

Overview를 맞추기 위해 Status Enum을 새로 만들지 않는다.

Overdue는 최소한 다음 조건으로 파생한다.

```text
not completed
AND dueDate < currentDate
```

정확한 시간대와 완료 상태 판정은 기존 Domain Rule을 따른다.

---

## 50.5 Main Column 첫 카드 — Project에서는 Lists

Project Scope의 Overview에서 Main Column 첫 영역은 **Lists Summary**다.

목적:

> Project 안에서 실제 작업이 어떤 작업 묶음에 분포되어 있는지 빠르게 확인한다.

기본 컬럼:

```text
List
Open Tasks
Progress
```

예:

```text
Lists
────────────────────────────────────────────
List             Open Tasks       Progress
선행연구              3             60%
방법론                2             40%
결과 작성             4             70%
공간 측정             1             30%
ABM 실행              2             50%
일반                  0            100%
```

이 영역은 Card 안에 **compact table/list hybrid**로 렌더링한다.

각 행은 과도한 Card nesting을 사용하지 않는다.

```text
Card
├── Header
└── Rows
    ├── Row
    ├── Row
    └── Row
```

각 Row를 다시 별도 Card로 만들지 않는다.

---

## 50.6 Folder가 있을 때 Lists Summary 표시 규칙

Project는 다음 구조를 동시에 가질 수 있다.

```text
Project
├── Folder
│   ├── List A
│   └── List B
└── Direct List C
```

Overview의 Lists Summary에서는 **List가 핵심 단위**다.

Folder는 필요하면 Context Metadata로 표현한다.

권장 방식:

```text
List                 Folder
선행연구             논문
방법론               논문
공간 측정             실험
ABM 실행             실험
일반                  —
```

하지만 기본 이미지처럼 화면 밀도를 낮추기 위해 Folder column은 생략할 수 있다.

생략할 경우:

- List 이름/아이콘은 유지한다.
- Hover/secondary text/tooltip에서 Parent Folder를 확인할 수 있어야 한다.
- 서로 다른 Folder 아래 동일한 이름의 List가 있다면 Context를 생략하지 않는다.

즉 **시각적 단순화 때문에 hierarchy 의미를 잃지 않는다.**

---

## 50.7 List Progress 정의

Progress는 새 Entity를 만들지 않고 Task 상태에서 파생한다.

기본 정의:

```text
completed tasks / all non-archived tasks × 100
```

단 기존 제품에 공식 Progress 계산 규칙이 이미 있다면 그것을 우선한다.

표현:

```text
[──────────────] 60%
```

Progress Bar는 정량 비교를 돕는 보조 시각화다.

- Bar + 숫자를 함께 표시한다.
- Bar 색상만으로 값을 전달하지 않는다.
- `0 tasks`인 List의 progress를 임의로 `100%`로 계산하지 않는다.
- Empty List 표기는 기존 Domain Rule 또는 `—`를 사용한다.

Mockup의 숫자는 Layout 예시이며 Domain 규칙보다 우선하지 않는다.

---

## 50.8 Lists Summary interaction

List Row 클릭:

```text
Project Overview
→ List Row
→ 해당 List Scope
```

예:

```text
/s/:spaceId/p/:projectId/l/:listId
```

Folder 내부 List라면 현재 Routing Contract에 맞는 Folder Context를 유지한다.

`전체 보기`가 있다면:

- 현재 Project Scope의 List 중심 화면으로 이동하거나
- List View로 전환한다.

어느 동작을 사용할지는 기존 Routing/View Registry와 일치시킨다.

Overview 안에 별도의 List 관리 시스템을 만들지 않는다.

---

## 50.9 Main Column 두 번째 카드 — Recently Updated Tasks

Lists Summary 아래에는 `Recently updated tasks`를 배치한다.

기본 구조:

```text
Recently updated tasks
────────────────────────────────────────────
[ ] 연구모형 수정          선행연구       Aug 18
[ ] ABM 시나리오 설계      ABM 실행       Aug 17
[ ] 도시 공간 변수 정리    공간 측정      Aug 16
```

목적:

> 사용자가 최근 손댄 작업으로 빠르게 다시 진입한다.

권장 필드:

```text
Task completion control(optional)
Task title
List / hierarchy context
Updated date
```

Project Overview에서는 기본 3~5개를 노출한다.

정렬:

```text
updatedAt DESC
```

동률이면 기존 Task sort rule을 사용할 수 있다.

Task Row 클릭 시 공통 `TaskDetail`을 연다.

별도 Overview Task Detail을 만들지 않는다.

---

## 50.10 Aside 첫 카드 — Upcoming

Desktop Aside의 가장 위에는 `Upcoming`을 둔다.

기본 3개 항목을 표시하고 필요하면 `전체 보기`를 제공한다.

구조:

```text
Upcoming
──────────────────────────
AUG
18     문헌연구 정리       D-1
       선행연구

AUG
21     실험 조건 검증      D-4
       공간 측정

AUG
24     ABM 실험 실행       D-7
       ABM 실행
```

각 항목의 우선 정보:

```text
Date
Task title
Parent List
Relative due indicator(optional)
```

정렬:

```text
nearest future dueDate ASC
```

이미 Overdue인 Task는 `Upcoming`에 섞기보다 Summary의 Overdue 또는 별도 overdue treatment를 우선한다.

현재 제품에 overdue item을 Upcoming에 포함하는 정책이 있다면 그 정책을 유지하되 danger 상태를 명확하게 표시한다.

---

## 50.11 Aside 두 번째 카드 — Goals Summary

Upcoming 아래에는 `Goals` Summary Card를 둔다.

Overview 안의 Goals는 전체 Goal 관리 UI가 아니다.

목적:

> 현재 Scope의 핵심 목표 진행 상황을 한눈에 보여주고 Goals Section으로 진입시킨다.

기본 구조:

```text
Goals                                      전체 보기
──────────────────────────────────────────────────
저널 논문 1편 투고
[────────────────────────────] 62%
Due 2026-12-31
```

Project에서 Active Goal이 여러 개라면:

- 가장 우선순위가 높거나 가까운 Active Goal 1개를 대표로 보여주거나
- 최대 2개까지 compact하게 표시한다.

선정 규칙은 deterministic해야 한다.

예:

```text
priority DESC
→ dueDate ASC
→ createdAt ASC
```

기존 Goal ordering이 있다면 그것을 사용한다.

Card 또는 `전체 보기` 클릭:

```text
current scope
→ Goals section
```

으로 이동한다.

---

## 50.12 Aside 세 번째 카드 — Horizons Summary

Goals 아래에는 `Horizons` Summary를 둔다.

Horizons Summary는 실제 Horizon Domain과 동일하게 다음 다섯 지평을 사용한다.

```text
Life
Year
Month
Week
Day
```

`Now / Next / Later`를 사용하지 않는다.

기본 예:

```text
Horizons                                   전체 보기
──────────────────────────────────────────────────
Life          2        Year          3
Month         6        Week          4
Day           5
```

또는 현재 Design System에 더 자연스럽다면 같은 정보를 compact bar/mini-grid로 표현할 수 있다.

중요한 것은 **다섯 지평의 의미와 Count가 상세 Horizons Section과 동일해야 한다는 것**이다.

목적:

> 현재 Scope의 Goal·Milestone·Task가 Life / Year / Month / Week / Day 계획 지평에 어떻게 분포되어 있는지 빠르게 확인한다.

---

### Summary가 보는 기간

Overview는 사용자가 Horizons Section에서 과거/미래 기간으로 탐색한 임시 UI anchor를 저장하는 Dashboard가 아니다.

기본 Summary는 **현재 날짜 기준 Current Anchors**를 사용한다.

개념적으로:

```text
Today
  ↓
Current Year / Month / Week / Day anchors
  ↓
Current Scope Horizon projection
  ↓
Overview Horizons Summary
```

Life는 anchor가 없다.

Year / Month / Week / Day는 현재 캘린더 기간을 기준으로 집계한다.

---

### Carryover Count

현재 기간을 보고 있을 때 과거 미완료 Goal/Milestone은 기존 Horizons 규칙에 따라 `carryover`로 보일 수 있다.

Overview의 숫자와 상세 Section의 Column Count가 서로 다른 말을 하지 않도록 기본 Count는:

```text
current-period items
+
visible carryover items
```

를 포함한다.

Carryover가 많아 별도 신호가 유용하면:

```text
Month  8   · 2 이월
```

처럼 보조 표기를 사용할 수 있다.

하지만 `carryover`를 별도 저장하지 않는다.

---

### Summary의 Source

Horizons Summary를 Task 전용 집계로 만들지 않는다.

```text
Current Hierarchy Scope
        ↓
Canonical Goal / Milestone / Task Sources
        ↓
Existing Horizon projection
        ↓
Life / Year / Month / Week / Day counts
        ↓
Overview
```

이어야 한다.

중요:

- 이 Card는 Board View가 아니다.
- `Now / Next / Later` Today bucket을 재사용하지 않는다.
- Horizon용 복제 데이터를 만들지 않는다.
- GoalSchedule과 Task date projection을 하나의 저장 규칙으로 합치지 않는다.
- `unscheduled` Goal은 visible Horizon Count에 넣지 않는다.

Card 클릭 또는 `전체 보기`:

```text
current scope
→ Horizons section
```

으로 이동한다.

---

## 50.13 Aside의 순서는 고정한다

Desktop 기본 순서:

```text
1. Upcoming
2. Goals
3. Horizons
```

이 순서는 다음 질문의 우선순위다.

```text
Upcoming
= 가장 가까운 다음 행동은 무엇인가?

Goals
= 무엇을 달성하려 하는가?

Horizons
= 시간 범위별로 무엇이 쌓여 있는가?
```

사용자 설정 기능이 생기기 전까지 Overview Card reorder를 제공하지 않는다.

Saved Dashboard 기능으로 확장하지 않는다.

---

## 50.14 Project Overview와 Space Overview의 차이

같은 Overview Layout System을 사용하되 Main Summary의 중심 Entity만 Scope에 따라 달라진다.

### Project Scope

```text
Main Column Top
= Lists
```

### Space Scope

```text
Main Column Top
= Projects
```

Space Overview 예:

```text
Projects
────────────────────────────────────────────
Project                Open Tasks     Status
드론 배송 연구             12         Active
VR Serious Game             9         Active
Skin AI                     7         Paused
```

즉:

```text
Space Overview    → Projects Summary
Project Overview  → Lists Summary
```

로 한다.

KPI / Upcoming / Goals / Horizons / Recent Activity는 동일한 Grid와 Component Family를 재사용하되 Scope만 달라진다.

Overview를 Space용과 Project용으로 완전히 별도 구현하지 않는다.

---

## 50.15 Current Focus의 위치

기존 문서에서 `Current Focus`는 Overview 후보 정보로 정의했다.

하지만 이번 Canonical Mockup에서는 기본 Desktop Project Overview의 필수 Card로 두지 않는다.

이유:

- Summary / Lists / Upcoming / Goals / Horizons만으로 첫 화면의 핵심 역할이 충분하다.
- `Current Focus`를 억지로 추가하면 정보 밀도가 높아진다.
- 현재 제품에 Focus Domain이 실제로 안정적으로 존재하는지 먼저 확인해야 한다.

따라서:

```text
Current Focus
= optional enhancement
```

로 둔다.

실제 Focus 데이터가 이미 Source of Truth로 존재하고 사용성이 확인되면 Main Column에서 `Recently Updated Tasks`와 교체하거나 그 위에 추가할 수 있다.

Overview를 채우기 위해 Focus Entity를 새로 만들지 않는다.

---

## 50.16 Card Visual Language

Overview Card는 동일한 Visual Family를 사용한다.

공통 규칙:

```text
Background          surface / white 계열
Border              1px neutral
Border radius       10~12px
Padding             14~16px
Heading             medium / semibold
Secondary text      muted
Primary accent      현재 앱 Accent Token
```

피해야 할 것:

```text
각 Card마다 서로 다른 강한 배경색
과도한 gradient
큰 drop shadow
Card 안의 Card 안의 Card
모든 숫자를 다른 색으로 표시
```

Accent Color는 선택 상태, Progress, 핵심 Action 등에 제한적으로 사용한다.

Status semantic color는 `success / warning / danger`의 의미가 있을 때만 사용한다.

---

## 50.17 Header / View Bar와 Overview의 시각적 연결

Overview가 선택된 상태에서는 View Bar에서 `Overview`만 active state를 가진다.

```text
Overview   List   Board   Gantt   Calendar   Goals   Horizons
────────
active
```

선택 표현은:

- active text color
- underline / bottom border
- 또는 현재 Design System의 selected tab treatment

중 하나를 사용한다.

두 개 이상의 Tab이 동시에 active처럼 보이지 않는다.

Overview Content 자체에 `Overview`라는 큰 제목을 다시 반복할 필요는 없다.

Context Header의 Project/Space 이름이 이미 페이지 제목 역할을 하기 때문이다.

---

## 50.18 Main Action — + Task

Project Overview의 Primary Action은 Header 우측의 `+ Task`다.

```text
[ + Task ]  […]
```

Overview Card 내부에 `+ Task` 버튼을 반복 배치하지 않는다.

`+ Task` 클릭 시 현재 Scope를 자동 상속한다.

Project Scope라면:

```text
projectId = currentProjectId
```

를 기본 Context로 제공한다.

어느 List에 넣을지 필수인 현재 Domain Model이라면 Create Flow에서 List만 선택하도록 하고 이미 알고 있는 Space/Project를 다시 묻지 않는다.

---

## 50.19 Loading State

공통 Loading 원칙은 §49A.5를 따른다.

Overview는 `Summary / Lists(or Projects) / Upcoming / Goals / Horizons`의 **영역별 skeleton**을 사용해 카드 크기를 유지한다. 현재 Store에 없는 cache 시스템은 추가하지 않는다.

## 50.20 Empty State

Overview 전체를 빈 화면 하나로 대체하지 않는다.

### Empty Project

Task가 없더라도 Project Context는 유지한다.

```text
Summary
Open 0 / In Progress 0 / Completed 0 / Overdue 0

Lists
현재 List가 있으면 표시

Recently Updated
아직 최근 작업이 없습니다.

Upcoming
예정된 작업이 없습니다.
```

프로젝트에 List조차 없다면 Main Column에서 다음 CTA를 제공할 수 있다.

```text
아직 작업 묶음이 없습니다.
첫 List 또는 Task를 추가해 프로젝트를 시작하세요.

[ + List ]   [ + Task ]
```

현재 생성 모델에서 List 없이 Task를 만들 수 없다면 가능한 Action만 노출한다.

### No Goals / No Horizons

Goals/Horizons 데이터가 없을 때 Overview Grid 자체를 무너뜨리지 않는다.

Compact Empty Card 또는 해당 Card 생략 규칙 중 하나를 제품 전체에서 일관되게 사용한다.

기본 권장:

- Goals는 Empty Card 유지 + `목표 추가` CTA가 실제 기능으로 존재할 때만 제공.
- Horizons는 기존 Horizon 기능이 활성화된 경우 Empty Summary 유지.

---

## 50.21 Error State

공통 Error 원칙은 §49A.5를 따른다.

Overview는 부분 집계 실패를 해당 Card 안에서 격리할 수 있다. 단 `resolveTasks(scope)` 또는 핵심 Scope resolution이 실패하면 Overview Content 전체 error state로 처리한다.

## 50.22 Responsive Layout

### Wide Desktop

```text
≥ 1200px

Summary        4 columns
Body           2 columns
Main : Aside   약 70 : 30
```

### Medium

```text
768~1199px

Summary        2 × 2
Body           2 columns 유지 가능하면 유지
Aside min      260~280px
```

### Narrow / Mobile

```text
< 768px

Summary        1 또는 2 columns
Body           1 column
Order:
1. Summary
2. Lists / Projects
3. Upcoming
4. Goals
5. Horizons
6. Recently Updated Tasks
```

Desktop의 오른쪽 Aside가 좁은 화면에서 숨겨져서는 안 된다.

**오른쪽에서 아래로 내려갈 뿐 정보 우선순위는 유지한다.**

Horizontal overflow로 Desktop Layout을 억지로 유지하지 않는다.

---

## 50.23 Overflow / Long Content

### 긴 Task / List 이름

- 기본 한 줄.
- width를 넘으면 ellipsis.
- 전체 이름은 tooltip/title 또는 Task Detail에서 확인 가능.

### Lists가 많을 때

Overview에서 모든 List를 무제한 렌더링하지 않는다.

권장:

```text
기본 5~8개
+ 전체 보기
```

단 List 개수가 적으면 모두 표시한다.

### Upcoming이 많을 때

기본 3개.

Overview가 Calendar 전체 목록으로 변하지 않게 한다.

### Recent Tasks가 많을 때

기본 3~5개.

---

## 50.24 Overview에서 하지 않을 것

다음은 하지 않는다.

```text
Overview 전용 Task Store
Overview 전용 Project/List 복제 데이터
Overview 안에 완전한 Board 삽입
Overview 안에 완전한 Calendar 삽입
Overview 안에 완전한 Gantt 삽입
모든 Goal을 Overview에 전부 표시
모든 Horizon Task를 Overview에 전부 표시
사용자 지정 Dashboard Builder를 이번 범위에 포함
각 Card마다 독립적인 Scope Query 규칙 작성
```

Overview는 어디까지나 **Summary + Navigation Surface**다.

상세 조작은 각 List / Board / Gantt / Calendar / Goals / Horizons 화면으로 넘긴다.

---

## 50.25 Component decomposition 권장

정확한 파일 구조는 현재 Repository를 확인한 뒤 정하지만 개념적으로 다음 수준의 분리를 권장한다.

```text
OverviewPage / ScopeOverview
│
├── OverviewSummaryRow
│   └── OverviewMetricCard × 4
│
├── OverviewMainSummary
│   ├── ProjectSummaryTable   // Space scope
│   └── ListSummaryTable      // Project scope
│
├── RecentTasksCard
├── UpcomingCard
├── GoalsSummaryCard
└── HorizonsSummaryCard
```

주의:

```text
SpaceOverviewPage
ProjectOverviewPage
```

를 완전히 별도 복제 구현하는 것보다 Scope에 따른 작은 variation을 우선한다.

---

## 50.26 Data contract

Overview에 필요한 데이터는 개념적으로 다음 집계에서 나온다.

```text
OverviewModel {
  scope

  taskSummary {
    open
    inProgress
    completed
    overdue
  }

  childSummaries   // Space -> Projects / Project -> Lists
  upcomingTasks
  recentTasks
  goalsSummary
  horizonsSummary
}
```

이것은 반드시 새로운 DB Entity를 의미하지 않는다.

가능하면 Selector / Derived Model / Query Result 형태로 계산한다.

```text
Domain Data
→ Scope Resolver
→ Derived Overview Model
→ UI
```

방식을 우선한다.

---

## 50.27 Overview visual acceptance criteria

구현 결과는 최소한 다음을 만족해야 한다.

### T-OV01 — Shell

Context Header 아래에 View Bar가 있고, 그 아래에 Overview Content가 위치한다.

### T-OV02 — Summary cards

Desktop에서 `Open Tasks / In Progress / Completed / Overdue`가 동일 폭 4개 Card로 한 행에 표시된다.

### T-OV03 — Body columns

Desktop Overview Body는 Main + Aside의 2-column으로 보이며 Main이 더 넓다.

### T-OV04 — Project main summary

Project Scope에서는 Main Column 첫 Card가 `Lists`다.

### T-OV05 — Space main summary

Space Scope에서는 같은 위치가 `Projects`다.

### T-OV06 — Aside order

Aside는 반드시:

```text
Upcoming
→ Goals
→ Horizons
```

순서다.

### T-OV07 — Recent tasks

`Recently updated tasks`는 Main Column에서 Lists/Projects Summary 아래에 위치한다.

### T-OV08 — Scope consistency

Overview 숫자는 동일 Scope의 Board/List가 보는 Canonical Task Set과 모순되지 않는다.

### T-OV09 — Navigation

List/Project Row 클릭 시 해당 Scope로 내려가고, Goal/Horizon Summary 클릭 시 해당 Section으로 이동한다.

### T-OV10 — No duplication

Overview를 위해 Task/Goal/Horizon 데이터를 별도 복제 저장하지 않는다.

### T-OV11 — Responsive

좁은 화면에서는 Aside가 Main 아래로 내려가며 기능이 사라지지 않는다.

### T-OV12 — Visual density

Overview에 Board/Gantt/Calendar 전체 Renderer가 중첩되어 Dashboard가 과밀해지지 않는다.

### T-OV13 — Canonical Project Overview

다음 구조가 별도 예외 코드 없이 표현 가능해야 한다.

```text
Project Header
View Bar
4 Summary Cards

Main Column                   Aside
├── Lists                     ├── Upcoming
└── Recently Updated Tasks    ├── Goals
                              └── Horizons
```

### T-OV14 — 5-second comprehension

사용자가 첫 화면에서 다음 네 질문에 별도 페이지 이동 없이 답할 수 있어야 한다.

```text
1. 지금 일이 얼마나 남았는가?
2. 어느 List/Project에 일이 몰려 있는가?
3. 가장 가까운 일정은 무엇인가?
4. 목표와 시간 지평은 어떤 상태인가?
```

---

## 50.28 이 단계에서의 고정 / 비고정 범위

### 이번 문서에서 고정

```text
Overview 정보 위계
Summary 4-card 구조
Desktop Main/Aside 2-column 구조
Project -> Lists Summary
Space -> Projects Summary
Recently Updated 위치
Upcoming / Goals / Horizons 순서
기본 interaction
Scope 기반 데이터 원칙
Responsive stacking 원칙
```

### Design Token에 맡김

```text
정확한 purple hex
font family
font weight 세부값
shadow blur 수치
border 색상 hex
icon library
animation duration
```

따라서 구현 결과가 Mockup과 **같은 정보 구조와 시각적 위계**를 가지는 것이 필수이며, 현재 앱 Design System을 무시하고 색상 값까지 하드코딩하는 것은 요구하지 않는다.

---


# 50A. List View — 상세 UI / Layout Contract

기존 §25의 List 정의는 **행 기반 Task Projection**이라는 Domain/View Engine 원칙을 설명한다.

이 절은 그 원칙을 실제 화면으로 옮길 때의 **Rendering / Interaction Contract**를 고정한다.

List View의 목적은:

> **현재 Scope의 Task를 가장 빠르게 훑고, 비교하고, 여러 필드를 직접 수정할 수 있는 기본 작업 화면**

이다.

이번 단계에서는 다음 형태를 **Canonical Project List View**로 사용한다.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb                                                                  │
│ [Icon] 드론 배송 연구                                         [ + Task ] […] │
│        공간·기상 조건에 따른 배송 방식 적합성 연구                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ Overview | List | Board | Gantt | Calendar | Goals | Horizons               │
│            ────                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ All Lists ▾ ] [ Group: List ▾ ] [ Filter ] [ Sort ]     [ Search… ] [⚙]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ □  Task                         List        Status       Assignee Due   Priority│
│ ──────────────────────────────────────────────────────────────────────────── │
│ □  문헌연구 정리                 선행연구    In Progress  나       Aug18 High   │
│ □  Contingency Theory 정리       선행연구    Todo         나       Aug20 Medium │
│ □  Drone logistics 논문 정리     선행연구    Todo         나       Aug21 Medium │
│ □  연구모형 수정                 방법론      In Progress  나       Aug25 High   │
│ □  변수 정의 검토                방법론      Todo         나       Aug28 Medium │
│ □  공간 데이터 수집              공간 측정   In Progress  나       Aug21 High   │
│ □  ABM 시나리오 설계             ABM 실행    In Progress  나       Aug17 High   │
│ □  ABM 실행                      ABM 실행    Todo         나       Aug24 Medium │
│ □  결과 시각화                   결과 작성   Todo         나       Aug30 Low    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Showing 9 of 12 tasks                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

이 Wireframe은 데이터 예시가 아니라 **화면의 정보 위계와 배치 기준**이다.

Status 이름, Priority Enum, Assignee 모델 등 실제 값은 현재 Domain Model을 Source of Truth로 사용한다.

여기서 사용하는 `Task Table`, `Table Header`, `Column`, `Row`는 **List View 내부의 UI/Rendering Primitive**다.
이 용어들은 별도의 사용자-facing `Table View`가 존재한다는 뜻이 아니다.

```text
User View = List
Rendering = TaskTable / Row / Column
```

기존 Repository에 `TableRenderer`가 있다면 List View가 이를 재사용할 수 있지만, 이름을 맞추기 위해 별도 Table View를 만들지 않는다.

---

## 50A.1 List View가 시작되는 위치

List View는 Overview와 동일한 App Shell을 사용한다.

```text
App Shell
├── Sidebar
└── Main
    ├── Context Header
    ├── View Bar
    └── List View Content
        ├── Toolbar
        └── Task Table
```

List View가 자체 Sidebar/Header를 다시 만들지 않는다.

Project, Space, Folder, List 어느 Scope에서 열더라도 **같은 List Renderer**를 사용하고 Scope만 달라져야 한다.

---

## 50A.2 View Bar

공통 구조는 §49A.1을 따른다. 이 화면의 `activeId`는 `list`다.

List 내부에 별도 대제목이나 두 번째 Navigation을 만들지 않는다.

## 50A.3 상단 Toolbar 구조

Task Table 바로 위에 한 줄 Toolbar를 둔다.

Desktop 기본 순서:

```text
LEFT
[ Scope/List selector ]
[ Group ]
[ Filter ]
[ Sort ]

RIGHT
[ Search tasks… ]
[ Display / column settings ]
```

Mockup 기준:

```text
[ All Lists ▾ ] [ Group: List ▾ ] [ Filter ] [ Sort ]     [ Search tasks… ] [⚙]
```

Toolbar는 Table의 일부이지만 Header/View Bar와 시각적으로 구분한다.

권장 Token:

```text
Toolbar min height       44~48px
Control height           30~34px
Control gap              8px
Toolbar bottom border    1px neutral 또는 Table header와 연결
```

Primary `+ Task`는 Toolbar가 아니라 Context Header 우측에 유지한다.

---

## 50A.4 Scope/List selector

Project Scope에서 첫 Control은 기본적으로:

```text
All Lists
```

이다.

목적:

> 같은 Project 안에서 특정 List만 빠르게 좁혀 볼 수 있게 한다.

예:

```text
All Lists
선행연구
방법론
결과 작성
공간 측정
ABM 실행
일반
```

Folder Scope에서는 해당 Folder가 포함하는 List만 후보로 제한한다.

List Scope에서는 이미 Scope가 하나의 List이므로 Selector를:

- 숨기거나
- 현재 List 이름으로 disabled/compact 표시

할 수 있다.

이 Selector가 새로운 Hierarchy Selection Source of Truth가 되어서는 안 된다.

현재 Route/Scope를 기준으로 Task Set을 좁히는 **View-level control**이다.

---

## 50A.5 Group control

List View는 `Group` Control을 제공할 수 있다.

Project Scope의 기본 권장은:

```text
Group: List
```

이다.

가능한 값은 현재 View Engine이 실제 지원하는 Grouping만 노출한다.

예:

```text
None
List
Status
Priority
Assignee
```

지원하지 않는 Group 옵션을 UI만 먼저 만들지 않는다.

### Group: List 표현

그룹 Header를 사용하는 경우:

```text
▼ 선행연구 · 3
   Task A
   Task B
   Task C

▼ 방법론 · 2
   Task D
   Task E
```

처럼 표현한다.

다만 Mockup과 같이 전체 밀도를 낮추기 위해 **flat table + List column**으로 표현하는 것도 허용한다.

Canonical 기본은 다음 우선순위로 해석한다.

```text
1. 현재 기존 List Renderer가 grouping을 안정적으로 지원함
   → Group: List를 실제 section group으로 렌더링

2. grouping renderer가 아직 없음
   → 동일 Task Set을 flat table로 렌더링하고 List column 유지
```

별도 Group 전용 Task 데이터를 만들지 않는다.

---

## 50A.6 기본 Table Column

Project Scope Desktop의 기본 Column Set은 다음 순서로 고정한다.

```text
1. Selection checkbox
2. Task
3. List
4. Status
5. Assignee
6. Due Date
7. Priority
```

즉:

```text
□ | Task | List | Status | Assignee | Due Date | Priority
```

이다.

Start Date, Tags, Created At 등 추가 Field는 기본 화면에 모두 노출하지 않는다.

Display/Column Settings가 실제 구현되어 있다면 사용자가 추가할 수 있다.

초기 화면은 **작업 판단에 필요한 핵심 필드만** 유지한다.

---

## 50A.7 Column width / alignment

권장 Desktop 비율:

```text
Selection     36~40px
Task          minmax(260px, 2.2fr)
List          minmax(120px, 1fr)
Status        110~130px
Assignee      90~110px
Due Date      90~110px
Priority      80~100px
```

원칙:

- Task가 가장 넓다.
- Checkbox / Date / Priority는 과도한 폭을 차지하지 않는다.
- Text column은 left align.
- 숫자/짧은 상태 필드는 시각적 정렬이 일관되어야 한다.
- 좁은 화면에서 Column을 억지로 압축해 읽을 수 없게 하지 않는다.

필요하면 Table 자체의 horizontal scroll을 허용한다.

---

## 50A.8 Table Header

Table Header는 Body와 명확히 구분하되 과도하게 무겁지 않게 한다.

```text
□   Task                  List        Status       Assignee   Due Date   Priority
```

권장:

```text
Header height        34~40px
Background           page surface 또는 매우 약한 neutral
Text                 muted / medium
Bottom border        1px neutral
```

긴 Task Table에서 Header는 sticky가 가능하다.

단 View Bar까지 sticky header로 중복 겹치지 않게 현재 App Shell의 sticky 전략을 따른다.

---

## 50A.9 Task Row anatomy

각 Row의 기본 구조:

```text
[Checkbox]
Task title
List context
Status badge/control
Assignee
Due date
Priority badge/control
```

권장 Row height:

```text
36~44px
```

Task Row를 큰 Card 형태로 만들지 않는다.

List View의 핵심은 **높은 정보 밀도와 빠른 스캔**이다.

Row hover 시 전체 Row에 약한 background를 적용할 수 있다.

---

## 50A.10 Task title interaction

Task title 클릭:

```text
Task Row
→ shared TaskDetail
```

을 연다.

List View 전용 Detail을 만들지 않는다.

Task title inline edit이 기존 제품에서 안정적으로 지원되면 double click / explicit edit interaction을 재사용할 수 있다.

지원되지 않는다면 이번 작업 때문에 새 편집 패턴을 만들지 않는다.

---

## 50A.11 Inline field editing

List View는 가능한 경우 **상태/담당자/날짜/우선순위의 빠른 수정**을 지원하는 작업형 화면이다.

권장 interaction:

```text
Status click
→ Status picker
→ Canonical Task update

Assignee click
→ Assignee picker
→ Canonical Task update

Due Date click
→ Date picker
→ Canonical Task update

Priority click
→ Priority picker
→ Canonical Task update
```

수정 후 다른 View에서도 즉시 같은 Task 값이 보여야 한다.

```text
List 수정
→ Canonical Task
→ Board / Gantt / Calendar / Detail 동기화
```

List View local copy를 따로 저장하지 않는다.

---

## 50A.12 Selection / Bulk actions

Checkbox는 Row navigation과 별개다.

한 개 이상 선택되면 기존 제품이 지원하는 경우에만 compact Bulk Action Bar를 노출한다.

예:

```text
3 selected
[ Status ] [ Move ] [ Assignee ] [ Delete ]
```

지원하지 않는 Bulk Action을 이번 UI를 맞추기 위해 임의로 추가하지 않는다.

Header checkbox는 현재 로드된/현재 Filter 결과에 대한 선택 규칙을 명확하게 가져야 한다.

---

## 50A.13 Filter

Filter는 `ViewSpec.filter`와 같은 기존 View Engine 규칙을 사용한다.

예:

```text
Status
Assignee
Due Date
Priority
List
```

Filter 적용 시 Toolbar에 active 상태를 표시한다.

예:

```text
[ Filter · 2 ]
```

Filter를 적용해도 원본 Task membership은 바뀌지 않는다.

```text
Filter
= projection condition
≠ hierarchy move
```

---

## 50A.14 Sort

Sort 역시 기존 `ViewSpec.sort`를 Source of Truth로 한다.

기본 Sort는 현재 제품의 Task ordering을 최대한 유지한다.

별도 근거가 없다면 임의로 `Due Date ASC`를 새 기본값으로 강제하지 않는다.

사용자가 Sort를 선택한 경우 예:

```text
Due Date ↑
Priority ↓
Updated ↓
```

처럼 현재 상태를 확인할 수 있어야 한다.

---

## 50A.15 Search

Toolbar 우측에 compact Search를 둔다.

```text
[ Search tasks… ]
```

기본 대상:

```text
Task title
```

현재 Search Engine이 description/tag 등 추가 필드를 검색한다면 그대로 재사용한다.

Search 결과 때문에 별도 Task Query/Store를 만들지 않는다.

Search가 활성화되어도 현재 Scope 밖 Task를 섞지 않는다.

```text
Current Scope
→ Filter/Search
→ Result
```

순서다.

---

## 50A.16 Status 표현

Status는 badge/chip 형태 또는 compact select 형태를 사용한다.

예:

```text
Todo
In Progress
Review
Done
```

하지만 위 이름은 Mockup 예시다.

실제 Board/List 모두 **동일한 Status Definition / order / semantic color**를 공유해야 한다.

Status color만으로 의미를 전달하지 않는다.

Label을 항상 표시한다.

---

## 50A.17 Assignee 표현

Assignee는 현재 제품의 단일/다중 담당자 모델에 맞춘다.

개인용 앱에서 현재 사용자 한 명만 존재한다면 지나치게 큰 Avatar column을 만들지 않는다.

예:

```text
나
```

또는 compact avatar + tooltip을 사용할 수 있다.

Assignee 기능 자체가 현재 Domain에 없다면 Mockup 때문에 가짜 Field를 추가하지 않는다.

그 경우 해당 Column을 생략하고 남은 Column이 자연스럽게 확장된다.

---

## 50A.18 Due Date / Overdue

Due Date는 짧은 형식으로 표시한다.

예:

```text
Aug 18
Aug 25
—
```

연도가 현재 연도와 다르거나 혼동 가능하면 연도를 포함한다.

Overdue Task는 Date text 또는 보조 indicator에 danger semantic을 사용할 수 있다.

완료 Task에는 overdue 표현을 적용하지 않는다.

---

## 50A.19 Priority

Priority가 실제 Domain Field로 존재한다면 compact badge로 표시한다.

예:

```text
High
Medium
Low
```

색상은 semantic 보조다.

Priority가 없는 제품 구조라면 Mockup을 맞추기 위해 새 필드를 만들지 않는다.

List View의 Column Contract는 **지원되는 Domain Field만 렌더링한다**는 원칙이 우선한다.

---

## 50A.20 + Task 생성

Primary Create Action은 Header 우측:

```text
[ + Task ]
```

이다.

현재 Scope를 상속한다.

Project Scope + All Lists 상태에서 List가 필수라면 Create Flow에서 **List만 선택**하게 한다.

특정 List Selector가 활성화된 상태라면:

```text
projectId = currentProject
listId = selectedList
```

를 기본값으로 상속한다.

같은 Context를 다시 선택하게 하지 않는다.

---

## 50A.21 Footer / Result count

Table 하단에는 필요하면 compact result count를 보여준다.

예:

```text
Showing 9 of 12 tasks
```

Pagination/virtualization이 실제로 존재한다면 그 전략과 연결한다.

모든 Task를 이미 렌더링하고 있다면 불필요한 pagination UI를 만들지 않는다.

---

## 50A.22 Empty State

### Project에 Task가 없음

```text
아직 작업이 없습니다.
첫 Task를 추가해 프로젝트를 시작하세요.

[ + Task ]
```

List 생성이 선행되어야 하면 실제 가능한 CTA만 보여준다.

### Filter/Search 결과 없음

Hierarchy 자체가 비었다고 말하지 않는다.

```text
조건에 맞는 작업이 없습니다.
[ Filter 초기화 ]
```

처럼 **empty scope와 empty result를 구분**한다.

---

## 50A.23 Loading / Error

공통 원칙은 §49A.5를 따른다.

List는 `Toolbar + Header + Row skeleton` 형태를 유지한다. Field option 로딩 실패는 해당 picker 안에서만 처리한다.

## 50A.24 Responsive

### Wide Desktop

```text
≥ 1200px
모든 기본 Column 표시
Toolbar 한 줄
```

### Medium

```text
768~1199px
Task / List / Status / Due 중심 유지
Assignee / Priority는 폭에 따라 compact
Toolbar wrap 허용
```

### Narrow

모바일에서 Desktop Table을 7열로 압축하지 않는다.

권장 우선순위:

```text
Task
Status
Due Date
```

나머지 Metadata는 Row secondary line 또는 Task Detail에서 확인한다.

Horizontal scroll을 사용할 경우 Task column은 가능하면 sticky하게 유지할 수 있다.

---

## 50A.25 List View에서 하지 않을 것

다음은 하지 않는다.

```text
List View 전용 Task Store
각 Row를 큰 Card로 렌더링
모든 Custom Field를 기본 Column으로 노출
Search 결과에 다른 Scope Task 섞기
Filter를 hierarchy move로 처리
List View에서 편집한 값을 다른 View와 별도로 저장
지원하지 않는 Assignee/Priority Field를 Mockup 때문에 생성
별도 List 전용 Task Detail 작성
```

---

## 50A.26 Component decomposition 권장

개념적으로:

```text
TaskListView
│
├── TaskListToolbar
│   ├── ScopeListSelector
│   ├── GroupControl
│   ├── FilterControl
│   ├── SortControl
│   ├── TaskSearch
│   └── ColumnDisplayControl
│
└── TaskTable
    ├── TaskTableHeader
    ├── TaskRow × N
    └── TaskTableFooter
```

기존 Table/List Renderer가 이미 있다면 이를 우선 재사용하고 이름을 맞추기 위해 새 Parallel Renderer를 만들지 않는다.

---

## 50A.27 List View visual acceptance criteria

### T-LV01 — Shell

Sidebar / Context Header / View Bar를 유지한 채 Content만 List View로 전환된다.

### T-LV02 — Active tab

View Bar에서 `List`만 active다.

### T-LV03 — Toolbar

Desktop에서 Table 위에 다음 Control Family가 한 행에 배치된다.

```text
Scope/List | Group | Filter | Sort | Search | Display
```

### T-LV04 — Core columns

지원되는 Domain Field 기준으로 기본 Column 순서는 다음을 유지한다.

```text
Task → List → Status → Assignee → Due Date → Priority
```

### T-LV05 — Density

Task가 Row 기반 compact table로 표현되고 각 Task가 큰 Card로 변하지 않는다.

### T-LV06 — Scope

Project List View는 현재 Project의 Task만 표시한다.

### T-LV07 — Shared data

Status/Date/Title 수정은 Board/Gantt/Calendar/Task Detail에 동일하게 반영된다.

### T-LV08 — Task detail

Task title/row interaction은 공통 `TaskDetail`로 연결된다.

### T-LV09 — Filter/Search

Filter/Search는 현재 Scope 안에서만 Projection을 좁힌다.

### T-LV10 — Creation context

`+ Task`는 현재 Project/List Context를 자동 상속한다.

### T-LV11 — Responsive

좁은 화면에서 7개 Column을 읽을 수 없게 압축하지 않는다.

### T-LV12 — Canonical visual

Desktop에서는 최소한 다음 구조가 별도 예외 코드 없이 표현 가능해야 한다.

```text
Header + View Bar
Toolbar
Task Table
Result count
```

---

# 50B. Board View — 상세 UI / Layout Contract

기존 §23의 Board 정의는 **Canonical Task를 Status 또는 다른 Group 기준으로 나누어 보는 Task View**라는 원칙을 설명한다.

이 절은 실제 사용 화면을 다음과 같은 Kanban 형태로 고정한다.

Board View의 목적은:

> **Task의 현재 상태 흐름을 한눈에 보고, Drag & Drop으로 작업 상태를 빠르게 변경하는 것**

이다.

다음 형태를 **Canonical Project Board View**로 사용한다.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb                                                                  │
│ [Icon] 드론 배송 연구                                         [ + Task ] […] │
│        공간·기상 조건에 따른 배송 방식 적합성 연구                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ Overview | List | Board | Gantt | Calendar | Goals | Horizons               │
│                   ─────                                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐  │
│ │ Todo        6  │ │ In Progress 3  │ │ Review      2  │ │ Done        5  │  │
│ │                │ │                │ │                │ │                │  │
│ │ Task A         │ │ Task D         │ │ Task G         │ │ Task I         │  │
│ │ 선행연구  Med  │ │ 선행연구  ●나 │ │ ABM 실행  High │ │ 방법론         │  │
│ │                │ │                │ │                │ │                │  │
│ │ Task B         │ │ Task E         │ │ Task H         │ │ Task J         │  │
│ │ 선행연구  Med  │ │ 방법론 High ● │ │ 공간 측정 High │ │ ABM 실행       │  │
│ │                │ │                │ │                │ │                │  │
│ │ Task C         │ │ Task F         │ │ + New Task     │ │ + New Task     │  │
│ │ 방법론    Med  │ │ 공간 측정 High │ │                │ │                │  │
│ │                │ │                │ │                │ │                │  │
│ │ + New Task     │ │ + New Task     │ │                │ │                │  │
│ └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

`Todo / In Progress / Review / Done`은 Mockup의 예시다.

실제 Column은 현재 Status Domain과 `ViewSpec.group`에서 파생한다.

Mockup과 맞추기 위해 존재하지 않는 `Review` Status를 새로 만들지 않는다.

---

## 50B.1 Board View가 시작되는 위치

Board 역시 같은 Shell을 공유한다.

```text
App Shell
├── Sidebar
└── Main
    ├── Context Header
    ├── View Bar
    └── Board Content
        └── Board Columns
```

Board만을 위한 별도 Project page를 만들지 않는다.

```text
Same Scope
→ same Canonical Tasks
→ Board projection
```

이다.

---

## 50B.2 View Bar

공통 구조는 §49A.1을 따른다. 이 화면의 `activeId`는 `board`다.

Board 전환 때문에 Header의 `+ Task`나 More 위치가 이동하지 않는다.

## 50B.3 Board grouping

Canonical 기본 Grouping은 **Status**다.

```text
Canonical Tasks
      ↓
Group by Status
      ↓
Board Columns
```

각 Status가 한 Column이다.

Column 순서는:

```text
existing status order
```

를 Source of Truth로 사용한다.

예:

```text
Todo
In Progress
Review
Done
```

하지만 Status 모델이:

```text
Not Started
Doing
Done
```

이라면 그대로 3개 Column을 사용한다.

Board UI를 위해 Status Enum을 재정의하지 않는다.

### 50B.3A Status ownership Gate — `G-STATUS-01`

Project Board에서는 현재 Project의 Status Definition을 그대로 사용하면 된다.
하지만 Space Board는 여러 Project의 Task를 합치므로 **Status Definition이 어디에 소유되는지**를 먼저 확인해야 한다.

STEP 3에서 최소한 다음을 판정한다.

```text
Status Definition ownership
= global/shared ?
= project-specific ?
= list-specific ?
```

해소 규칙:

```text
Global/shared status definition
→ Space Board도 동일 definition/order로 Group by Status 가능

Project/List-specific status definition
→ label 문자열이 같다는 이유만으로 하나의 Column으로 합치지 않는다
→ 기존 Engine에 cross-scope normalization/grouping semantics가 있으면 그것을 재사용
→ 없다면 Space Board grouping 정책을 STEP 4에서 별도 명시하기 전 구현하지 않는다
```

금지:

```text
Project A: Doing
Project B: Doing
→ 이름이 같으므로 자동으로 같은 Domain Status라고 가정
```

Status label의 우연한 문자열 일치는 Domain identity가 아니다.
`G-STATUS-01`이 `RESOLVED` 또는 해당 Space Board 기능이 `OUT OF SCOPE`가 되기 전에는 Space Board의 Column mutation을 구현하지 않는다.

---

## 50B.4 Board 전체 Layout

Desktop Board는 horizontal column layout이다.

```text
Board viewport
└── horizontal flex/grid
    ├── Column
    ├── Column
    ├── Column
    └── Column
```

권장 Token:

```text
Board horizontal padding    16~20px
Column gap                  10~12px
Column width                280~320px
Column min width            260px
Column max width            340px
Column radius               8~10px
Column background           subtle neutral / semantic tint
```

4개 Column이 충분한 폭에서 보이면 viewport를 균등 사용하되, Column이 너무 넓어지지 않게 max width를 둔다.

Column 수가 많거나 화면이 좁으면 **Board 자체 horizontal scroll**을 허용한다.

Sidebar까지 같이 horizontal scroll되지 않는다.

---

## 50B.5 Column header anatomy

각 Column 상단에는:

```text
Status name
Task count
Optional collapse/menu
```

를 둔다.

예:

```text
Todo 6
In Progress 3
Review 2
Done 5
```

Task count는 현재 Filter/Search가 적용된 Board 결과와 일치해야 한다.

Header color는 Status semantic을 보조할 수 있지만 텍스트 Label을 생략하지 않는다.

Column 전체를 강한 Status 색으로 채우지 않는다.

---

## 50B.6 Board Card anatomy

Card의 필수 정보는 **Task title**이다.

Project Board의 기본 Card는 다음 순서를 권장한다.

```text
Task title
List context
Card metadata row
├── Priority(optional)
├── Due indicator(optional)
└── Assignee(optional)
```

예:

```text
┌──────────────────────┐
│ 연구모형 수정         │
│ 방법론                │
│ High             ●나 │
└──────────────────────┘
```

또는 Metadata가 적다면:

```text
Task title
List                 Priority
```

정도로 compact하게 유지한다.

Board Card를 mini Task Detail로 만들지 않는다.

---

## 50B.7 Card Visual Language

권장:

```text
Card background       surface
Card border           1px neutral
Card radius           8~10px
Card padding          10~12px
Card vertical gap     8px
Title                 medium emphasis
Context               muted small text
Metadata              compact
```

Column background와 Card background의 대비를 이용해 Card boundary를 만든다.

큰 shadow, gradient, 여러 단계 Card nesting은 피한다.

Priority/Status 색상은 작은 Badge/indicator 범위에 제한한다.

---

## 50B.8 List context 표시

Project Board에서는 Task가 어느 List에서 왔는지 Card에 표시한다.

예:

```text
Contingency Theory 정리
선행연구
```

Folder가 중요하면 tooltip/secondary context로 확장할 수 있다.

Space Board에서는 Project context가 더 중요하다.

따라서 Scope에 따라 secondary label을 바꾼다.

```text
Space Board
→ Project name 우선

Project Board
→ List name 우선

Folder Board
→ List name 우선

List Board
→ parent label 생략 가능
```

같은 Renderer가 Scope에 따라 Context label만 조정한다.

---

## 50B.9 Card click

Card 클릭:

```text
Board Card
→ shared TaskDetail
```

Board 전용 Detail을 만들지 않는다.

Drag handle 영역과 Card click 영역은 충돌하지 않도록 한다.

모바일/터치에서는 drag와 open detail을 명확하게 구분해야 한다.

---

## 50B.10 Drag & Drop — Status 이동

다른 Status Column으로 Card를 이동하면:

```text
Drag Task A
Todo → In Progress
```

은 단순한 시각적 이동이 아니라:

```text
Canonical Task.status update
```

여야 한다.

흐름:

```text
Board interaction
      ↓
Task mutation
      ↓
Canonical Task
      ↓
Board regroup
      ↓
List / Detail / Overview 즉시 일치
```

Board 전용 Column membership 배열을 Source of Truth로 저장하지 않는다.

Optimistic update를 기존 mutation architecture가 지원한다면 사용할 수 있다.

실패 시 Card를 원래 Column으로 복원하고 오류를 사용자에게 알려야 한다.

---

## 50B.11 Column 내부 순서 변경

같은 Column 안에서 Drag reorder를 허용할지는 **현재 Task position 모델**에 달려 있다.

### position/order Field가 이미 있음

```text
Task.position
```

등 기존 ordering source가 있다면 reorder를 지원할 수 있다.

### 안정적인 position 모델이 없음

Mockup을 맞추기 위해 새로운 ordering field를 즉시 만들지 않는다.

그 경우 Card는 현재 `ViewSpec.sort` 또는 기존 Task sort rule로 정렬하고, 같은 Column 내 자유 reorder는 제공하지 않는다.

Status 이동과 순서 이동을 같은 기능으로 착각하지 않는다.

---

## 50B.12 + New Task — Column 내부 생성

각 Column 하단에는 compact:

```text
+ New Task
```

Action을 둘 수 있다.

이 Action은 Column Status를 자동 상속한다.

예:

```text
In Progress
└── + New Task

→ status = In Progress
```

Project Board에서 List가 필수라면:

- 현재 Filter/selected List Context가 하나로 특정되면 자동 상속
- 아니면 Create Flow에서 List만 선택

하도록 한다.

Header의 `+ Task`와 Column의 `+ New Task`는 역할이 다르다.

```text
Header + Task
= 현재 Scope만 상속

Column + New Task
= 현재 Scope + Column Status 상속
```

둘 다 같은 Task Create Domain flow를 재사용한다.

---

## 50B.13 Done / terminal status

완료 Status도 다른 Column과 같은 Board 구조를 사용한다.

완료 Task를 숨기고 싶다면 기존 ViewSpec filter 또는 별도 사용자 설정으로 처리한다.

Board Renderer 안에서 `Done`이라는 이름을 hard-code하여 자동 숨김하지 않는다.

Terminal status 판정은 현재 Status Domain을 따른다.

---

## 50B.14 Filter / Sort / Search

Mockup의 Board는 시각적 단순화를 위해 별도 Toolbar를 크게 노출하지 않는다.

하지만 Board도 List와 동일한 View Engine Filter/Sort를 사용할 수 있어야 한다.

권장 Desktop 전략:

```text
Context Header / View Bar 아래의 compact controls
또는
Board 상단 우측 overflow/filter controls
```

필수 원칙:

```text
Board filter
= List filter와 같은 ViewSpec semantics
```

이다.

Board만 별도 Filter 언어를 만들지 않는다.

Search 역시 현재 Scope 안에서 Task를 좁힌다.

UI 위치는 기존 Board renderer가 가진 Control 패턴을 우선한다.

---

## 50B.15 Column count / Overflow

Column 안의 Task를 단순히 3개만 보여주고 나머지를 영구적으로 숨기지 않는다.

Mockup의 `+ 2 more` 같은 표현은 다음 경우에만 사용한다.

- 기존 Renderer가 pagination/lazy loading을 사용함
- 사용자에게 명확한 `더 보기` interaction이 있음
- 성능상 실제 필요가 검증됨

그 외에는 Column이 자연스럽게 세로로 늘어나거나 virtualization을 사용한다.

Board는 Summary가 아니라 Full Task View다.

---

## 50B.16 Board scrolling

기본 Scroll 원칙:

```text
Horizontal
= Board columns

Vertical
= Main content/page
```

Column마다 서로 다른 독립 vertical scroll을 남발하지 않는다.

독립 Column scroll이 기존 Renderer의 핵심 동작이라면 유지할 수 있지만, Header/Column 정렬과 drag UX를 검증한다.

가로 Scroll 중 Sidebar/Header는 고정된 App Shell로 유지한다.

---

## 50B.17 Empty Column

Task가 0개인 Status도 Status 자체가 유효하다면 Column을 유지한다.

```text
Review 0

아직 작업이 없습니다.
+ New Task
```

처럼 보여준다.

빈 Column을 제거하면 사용자가 해당 상태로 Task를 이동할 Drop Target을 잃을 수 있다.

따라서 Filter가 아닌 이상 **valid Status Column은 0개여도 유지**하는 것을 기본으로 한다.

---

## 50B.18 Empty Board

현재 Scope에 Task가 하나도 없으면 Status Column shell을 유지할 수 있다.

```text
Todo 0 | In Progress 0 | Done 0
```

각 Column에 `+ New Task`가 존재하면 생성 경로가 자연스럽다.

Status 자체도 아직 없는 구조라면 현재 Status Domain setup flow를 따른다.

Board를 채우기 위해 Status를 자동 생성하지 않는다.

---

## 50B.19 Loading / Error

공통 원칙은 §49A.5를 따른다.

Board는 Column header와 Card skeleton으로 Column geometry를 유지한다. Status mutation 실패는 해당 Card를 원래 Canonical status로 복원한다.

## 50B.20 Responsive

### Wide Desktop

```text
≥ 1200px
3~4개 Column을 viewport 안에 최대한 표시
Column width 280~320px
```

### Medium

```text
768~1199px
Column width 유지
Board horizontal scroll
```

### Narrow / Mobile

Board Column을 한 화면 폭에 맞춰 너무 좁게 만들지 않는다.

권장:

```text
Column width ≈ viewport의 80~90%
Horizontal snap/scroll 가능
```

Touch drag가 불안정하면 Status picker를 보조 이동 수단으로 제공할 수 있다.

단 Desktop Drag & Drop과 별도 Status Source를 만들지 않는다.

---

## 50B.21 Keyboard / accessibility

공통 기준은 §49A.7을 따른다.

Board의 비드래그 대체 경로는 Status picker 또는 Task Detail이다. Column과 Card에는 텍스트 Status identity를 제공한다.

## 50B.22 Board에서 하지 않을 것

다음은 하지 않는다.

```text
Board 전용 Task Entity
Board 전용 Task Store
Column 배열을 Task status보다 우선 Source of Truth로 저장
Mockup 때문에 존재하지 않는 Review Status 생성
Board Card에 모든 Task Field 노출
각 Column을 완전히 다른 Component/데이터 모델로 구현
Status drag 후 다른 View와 동기화하지 않음
Task를 3개만 보여주고 나머지를 접근 불가능하게 숨김
Board 전용 Task Detail 생성
```

---

## 50B.23 Component decomposition 권장

개념적으로:

```text
TaskBoardView
│
├── BoardControls            // 기존 Renderer가 필요할 때
└── BoardViewport
    ├── BoardColumn × Status
    │   ├── BoardColumnHeader
    │   ├── TaskCard × N
    │   └── AddTaskInColumn
    └── DragDropContext
```

Task mutation / Task Detail / Create Flow는 다른 View와 공유한다.

기존 Board Renderer가 있으면 이를 확장하고 `SpaceBoard`, `ProjectBoard`를 별도 복제하지 않는다.

---

## 50B.24 Board data contract

개념적으로 Board Renderer에 필요한 것은:

```text
BoardModel {
  scope
  tasks
  statuses
  viewSpec {
    filter
    sort
    group
  }
}
```

정도다.

Column membership은 파생한다.

```text
Task.status
+ status definitions/order
→ Board columns
```

별도 DB Entity를 의미하지 않는다.

---

## 50B.25 Board visual acceptance criteria

### T-BV01 — Shell

Sidebar / Context Header / View Bar는 유지되고 Content만 Board로 전환된다.

### T-BV02 — Active tab

`Board`만 active state를 가진다.

### T-BV03 — Status columns

현재 Status Definition에 존재하는 Status가 순서대로 Column으로 표현된다.

### T-BV04 — Count

각 Column Header의 Count는 현재 Filter 결과의 실제 Task 수와 일치한다.

### T-BV05 — Card density

각 Task는 title + 필요한 최소 context/metadata의 compact Card로 보인다.

### T-BV06 — Scope context

Project Board Card는 기본적으로 List context를 식별할 수 있다.

### T-BV07 — Drag mutation

다른 Column으로 Drag하면 Canonical Task Status가 변경된다.

### T-BV08 — Cross-view sync

Board에서 Status를 변경한 Task는 List/Overview/Detail에서도 즉시 동일하게 보인다.

### T-BV09 — Empty status

유효한 Status의 Task가 0개여도 Column/Drop Target은 유지된다.

### T-BV10 — New task context

Column `+ New Task`는 해당 Column Status와 현재 Hierarchy Scope를 자동 상속한다.

### T-BV11 — Horizontal overflow

Column이 화면 폭보다 많아도 Column width를 읽을 수 없게 압축하지 않고 Board 영역에서 가로 Scroll된다.

### T-BV12 — Shared detail

Card 클릭은 공통 `TaskDetail`을 연다.

### T-BV13 — No board data duplication

Board Column을 위해 Task를 별도 저장하거나 복제하지 않는다.

### T-BV14 — Canonical visual

Desktop에서 최소한 다음 구조가 표현 가능해야 한다.

```text
Header + View Bar
Status Column × N
  ├── Column Header + count
  ├── Task Cards
  └── + New Task
```

### T-BV15 — Domain over mockup

Mockup의 Status label/Assignee/Priority가 실제 Domain에 없으면 화면을 맞추기 위해 가짜 Domain Field를 추가하지 않는다.

UI Layout은 Mockup을 따르되 **Domain Data는 기존 Source of Truth를 따른다.**

---


# 50C. Gantt View — 상세 UI / Layout Contract

기존 §24의 Gantt 정의는 **동일한 Canonical Task를 Start Date / Due Date / Dependency를 기준으로 시간축에 투영하는 Task View**라는 원칙을 설명한다.

이 절은 그 원칙을 실제 화면으로 옮길 때의 **Rendering / Interaction Contract**를 고정한다.

Gantt View의 목적은:

> **현재 Scope의 Task를 시간축 위에서 한눈에 비교하고, 작업의 기간·겹침·순서·의존관계를 조정하는 계획 화면**

이다.

이번 단계에서는 다음 형태를 **Canonical Project Gantt View**로 사용한다.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb                                                                                │
│ [Icon] 드론 배송 연구                                                     [ + Task ] […] │
│        공간·기상 조건에 따른 배송 방식 적합성 연구                                       │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Overview | List | Board | Gantt | Calendar | Goals | Horizons                            │
│                          ─────                                                           │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [ Zoom: Month ▾ ] [ ‹ ] [ Aug 2026 — Dec 2026 ] [ › ]                    [ Today ]      │
├───────────────────────────────────┬──────────────────────────────────────────────────────┤
│ Task                    List      │ Aug        Sep        Oct        Nov        Dec      │
│ ──────────────────────────────────┼──────────────────────────────────────────────────────│
│ 문헌연구 정리            선행연구  │      ███████                                         │
│ Contingency Theory 정리  선행연구  │         █████████                                    │
│ 연구모형 수정            방법론    │              ███████                                 │
│ 변수 정의 검토           방법론    │                  █████████                           │
│ 공간 데이터 수집         공간 측정 │             ███████████                              │
│ ABM 시나리오 설계        ABM 실행  │          ███████                                     │
│ ABM 실행                  ABM 실행  │                     █████████                        │
│ 결과 시각화               결과 작성 │                                █████████             │
│ 논문 초안 작성            결과 작성 │                                         ███████████  │
│                                   │             │ Today                                  │
└───────────────────────────────────┴──────────────────────────────────────────────────────┘
```

이 Wireframe은 날짜 예시가 아니라 **화면의 정보 위계와 배치 기준**이다.

실제 Task의 Start Date / Due Date / Dependency 존재 여부와 필드명은 현재 Domain Model을 Source of Truth로 사용한다.

---

## 50C.1 Gantt View가 시작되는 위치

Gantt View는 Overview/List/Board와 동일한 App Shell을 재사용한다.

```text
App Shell
├── Sidebar
└── Main
    ├── Context Header
    ├── View Bar
    └── Gantt View Content
        ├── Timeline Toolbar
        └── Split Timeline
            ├── Task Table
            └── Time Grid
```

`SpaceGantt`, `ProjectGantt`처럼 Scope별 별도 화면을 만들지 않는다.

같은 Gantt Renderer가 `ViewScope`를 받아 Task Set만 달라져야 한다.

---

## 50C.2 View Bar

공통 구조는 §49A.1을 따른다. 이 화면의 `activeId`는 `gantt`다.

Gantt 내부에 `GANTT VIEW` 또는 `Timeline` 같은 두 번째 페이지 제목을 만들지 않는다.

## 50C.3 Timeline Toolbar

View Bar 아래, Timeline 위에 한 줄 Toolbar를 둔다.

Desktop 기본 구조:

```text
LEFT
[ Zoom selector ]
[ Previous ]
[ Visible date range ]
[ Next ]

RIGHT
[ Today ]
[ Optional filter/display controls ]
```

Canonical Mockup:

```text
[ Zoom: Month ▾ ] [ ‹ ] [ Aug 2026 — Dec 2026 ] [ › ]        [ Today ]
```

권장 Token:

```text
Toolbar min height       44~48px
Control height           30~34px
Control gap              8px
Horizontal padding       12~16px
```

Primary `+ Task`는 Header 우측에 유지한다.

---

## 50C.4 Zoom

Gantt는 시간축 밀도를 바꿀 수 있어야 한다.

기본 권장값:

```text
Month
```

사용 가능한 Zoom 값은 현재 Timeline Engine이 실제 지원하는 범위만 노출한다.

예:

```text
Day
Week
Month
Quarter
```

지원하지 않는 Zoom을 Mockup 때문에 UI만 먼저 만들지 않는다.

Zoom은 **Task Date 자체를 변경하지 않고 시간축 Projection만 변경**한다.

```text
Zoom change
= timeline scale change
≠ task mutation
```

---

## 50C.5 Visible Date Range / Navigation

현재 화면이 보여주는 날짜 범위를 Toolbar에서 확인할 수 있어야 한다.

예:

```text
Aug 2026 — Dec 2026
```

`Previous / Next`는 현재 Zoom에 맞는 적절한 범위만큼 이동한다.

예:

```text
Month zoom
→ 한 달 또는 viewport 단위 이동
```

정확한 이동 폭은 기존 Timeline Engine의 navigation semantics를 우선한다.

`Today`는 오늘 날짜가 보이도록 Timeline을 이동한다.

---

## 50C.6 Split Layout

Desktop Gantt의 핵심은 **왼쪽 Task Table + 오른쪽 Time Grid**다.

```text
┌─────────────────────────────┬────────────────────────────────────────┐
│ Task Table                  │ Time Grid                              │
│                             │                                        │
│ Task / List context         │ Date Header                            │
│ Row × N                     │ Bar × N                                │
└─────────────────────────────┴────────────────────────────────────────┘
```

권장 초기 비율:

```text
Task table       32~38%
Timeline         62~68%
```

Task Table이 과도하게 넓어져 Timeline을 압박하지 않는다.

가능하면 split divider를 사용자가 조절할 수 있으나, 기존 UI에 resize pattern이 없으면 이번 단계의 필수 조건은 아니다.

---

## 50C.7 Task Table Column

Canonical Project Gantt의 왼쪽 Table은 최소한 다음을 보여준다.

```text
Task
List
```

필요하면 현재 Renderer가 안정적으로 지원하는 범위에서 다음을 추가할 수 있다.

```text
Start
Due
Assignee
```

하지만 Timeline 옆 Table이 List View처럼 모든 필드를 보여주는 화면이 되어서는 안 된다.

Gantt의 중심은 시간축이다.

권장 폭:

```text
Task     minmax(200px, 2fr)
List     110~140px
```

---

## 50C.8 Row alignment invariant

Task Table의 한 Row와 Timeline의 한 Bar는 반드시 같은 Task를 의미해야 한다.

```text
Task Table row i
      ↕
Timeline row i
```

Vertical Scroll 시 두 영역의 Row가 어긋나서는 안 된다.

다음은 금지한다.

```text
왼쪽 Table 독립 vertical scroll
오른쪽 Timeline 독립 vertical scroll
→ row alignment 붕괴
```

필요하면 하나의 shared vertical scroll state를 사용한다.

---

## 50C.9 Time Header

Timeline 상단은 현재 Zoom에 맞춰 날짜 Label을 렌더링한다.

Month Zoom 예:

```text
Aug 2026 | Sep 2026 | Oct 2026 | Nov 2026 | Dec 2026
```

Week Zoom 예:

```text
Aug 17 | Aug 24 | Aug 31 | Sep 07 | ...
```

Header의 Grid boundary와 Body Grid가 같은 날짜 계산을 사용해야 한다.

별도 날짜 계산 로직을 두지 않는다.

---

## 50C.10 Task Bar anatomy

날짜가 있는 Task는 Timeline Bar로 표현한다.

기본 의미:

```text
bar start = Task Start Date
bar end   = Task Due Date
```

권장 Visual:

```text
Bar height          18~24px
Bar radius          4~6px
Row height          34~40px
Horizontal padding  4~6px
```

Bar 안에는 충분한 폭이 있을 때만 Task title 또는 짧은 날짜 정보를 넣는다.

폭이 좁은 Bar에 텍스트를 억지로 겹쳐 넣지 않는다.

Task title은 왼쪽 Table에서 항상 확인 가능해야 한다.

---

## 50C.11 Start / Due Date가 모두 있는 Task

```text
startDate = Aug 10
dueDate   = Aug 20
```

이라면 Aug 10~20을 하나의 연속 Bar로 표시한다.

Bar 길이는 날짜 차이를 정확히 반영한다.

화면상 보기 좋은 최소 길이를 위해 실제 기간 의미를 왜곡하지 않는다.

---

## 50C.12 Start Date만 있는 Task

현재 Domain에서 Due Date 없이 Start Date만 허용된다면 Renderer는 이를 별도 규칙으로 처리해야 한다.

권장 우선순위:

```text
1. 기존 Timeline Engine의 open-ended rendering 재사용
2. 없으면 point/milestone-like marker로 표시
3. 의미를 추측해 임의 Due Date 생성 금지
```

새 날짜를 DB에 써서 Gantt를 채우지 않는다.

---

## 50C.13 Due Date만 있는 Task

Due Date만 있는 Task 역시 현재 Timeline Engine의 기존 semantics를 우선한다.

가능한 표현:

```text
single-day marker
또는
minimum-width due marker
```

중요한 것은:

```text
Due only Task
≠ 임의 Start Date 자동 생성
```

이다.

---

## 50C.14 날짜가 없는 Task

Start Date / Due Date가 모두 없는 Task는 시간축에 거짓 위치를 만들어 넣지 않는다.

기본 원칙:

```text
Canonical Scope에는 포함
Gantt-compatible projection에서는 별도 처리
```

가능한 UX:

```text
Unscheduled 영역
No dates filter/count
또는 Gantt에서 숨기되 명확한 안내
```

현재 기존 Timeline 구현이 가진 방식이 있으면 그것을 재사용한다.

문서 수준의 필수 조건은 **날짜가 없다고 Task 자체를 다른 Store로 옮기지 않는 것**이다.

### 50C.14A Repository Gate — `G-GANTT-01`

§50C.12~§50C.14의 표현 선택지는 구현자가 화면을 만들면서 고르는 자유 선택지가 아니다.

STEP 3에서 기존 Timeline Engine에 대해 다음을 확인한다.

```text
Start-only semantics
Due-only semantics
No-date semantics
open-ended / point / milestone-like renderer 존재 여부
Unscheduled / hidden / count 처리 방식
```

결정 순서:

```text
1. Existing Timeline semantics 존재
   → 그대로 REUSE / ADAPT

2. Existing semantics 없음
   → 실제 Task date model이 허용하는 의미 안에서 STEP 4에 하나의 canonical rendering rule 기록

3. 어느 경우에도
   → UI를 채우기 위한 가짜 Start/Due DB write 금지
```

`G-GANTT-01`이 `RESOLVED`되기 전에는 Due-only/no-date Task에 대해 임의 marker나 임의 숨김 정책을 로컬 Renderer에 하드코딩하지 않는다.

---

## 50C.15 Today indicator

오늘 날짜가 Visible Range 안에 있으면 세로 `Today` indicator를 표시한다.

```text
              Today
                │
Task A    █████ │
Task B          │ █████
Task C          │
```

Today line은 Task Bar보다 강하게 시선을 빼앗지 않는 accent로 사용한다.

Today button과 Today line은 같은 날짜 계산 Source를 사용한다.

---

## 50C.16 Dependency connector

Task Dependency가 실제 Domain에 존재하고 기존 Timeline Engine이 이를 지원한다면 Gantt에서 connector를 표시한다.

```text
Task A █████ ─────┐
                  └──▶ Task B █████
```

원칙:

- Connector는 실제 Dependency만 표현한다.
- Bar의 시각적 인접성을 Dependency로 추측하지 않는다.
- Dependency를 화면 전용 Edge로 별도 저장하지 않는다.
- Filter로 선행/후행 Task가 숨겨졌을 때 connector 처리 규칙을 명확히 한다.

Dependency가 현재 Domain에 없다면 Mockup을 맞추기 위해 새 관계를 만들지 않는다.

---

## 50C.17 Bar Drag — 기간 이동

기존 Timeline Engine이 drag mutation을 지원한다면 Bar 전체를 좌우로 Drag하여 기간을 이동할 수 있다.

예:

```text
Aug 10 — Aug 20
        ↓ +3 days
Aug 13 — Aug 23
```

의미:

```text
duration 유지
startDate +3d
dueDate   +3d
```

이어야 한다.

단순 pixel offset을 별도 UI State로 저장하지 않는다.

Mutation 실패 시 원래 날짜로 복원한다.

---

## 50C.18 Bar Resize — Start / Due 수정

기존 Engine이 resize handle을 지원한다면:

```text
left handle
→ Start Date 수정

right handle
→ Due Date 수정
```

으로 해석한다.

날짜 변경은 Canonical Task에 반영되어야 한다.

```text
Gantt resize
→ Canonical Task dates
→ Calendar / List / Detail 동기화
```

현재 Engine이 resize를 지원하지 않으면 Mockup 때문에 새 interaction을 무리하게 추가하지 않는다.

Task Detail의 날짜 Picker가 보조 수정 경로가 될 수 있다.

---

## 50C.19 Task title / Row click

Task title 또는 Row 클릭:

```text
Gantt Row
→ shared TaskDetail
```

을 연다.

Bar drag/resize와 Detail open gesture가 충돌하지 않도록 hit area를 분리한다.

---

## 50C.20 Grouping / Sorting

Project Gantt의 기본 Row context는 List를 식별할 수 있어야 한다.

Grouping이 기존 View Engine에 구현되어 있다면 다음과 같은 Group을 사용할 수 있다.

```text
Group: List
```

하지만 기본 Mockup에서는 **flat rows + List column**을 우선한다.

Sort는 기존 `ViewSpec.sort`를 따른다.

Timeline 위치 자체가 Task order를 암묵적으로 다시 정의하지 않는다.

---

## 50C.21 Filter

Gantt도 다른 Task View와 같은 `ViewSpec.filter` semantics를 사용한다.

예:

```text
Status
List
Assignee
Date range
```

Gantt 전용 Filter Store를 만들지 않는다.

날짜 Filter와 Visible Timeline Range는 구분한다.

```text
Visible range
= 현재 화면에 그리는 시간축 범위

Date filter
= 어떤 Task를 결과에 포함할지 결정
```

둘을 동일 개념으로 취급하지 않는다.

---

## 50C.22 Gantt Scroll behavior

기본 Scroll은:

```text
Horizontal
= Timeline time axis

Vertical
= Task rows 전체
```

이다.

왼쪽 Task Table은 horizontal Timeline scroll에 따라 같이 밀려나지 않고 가능하면 pinned/frozen 상태를 유지한다.

Date Header도 vertical scroll 시 필요하면 sticky로 유지할 수 있다.

Sticky 전략은 App Header/View Bar와 겹치지 않게 한다.

---

## 50C.23 Large data / virtualization

Task가 많을 경우 Timeline은 rendering cost가 높아질 수 있다.

기존 virtualization이 있다면 재사용한다.

없다면 우선 실제 성능 병목을 측정한다.

성능을 이유로:

```text
Task 100개 중 임의 30개만 표시
```

처럼 데이터 의미를 바꾸지 않는다.

필요하면 명시적 pagination/filter를 사용한다.

---

## 50C.24 Empty Gantt

### Scope에 Task 자체가 없음

```text
아직 작업이 없습니다.
기간이 있는 첫 작업을 추가해 타임라인을 시작하세요.
[ + Task ]
```

### Task는 있지만 날짜가 없음

```text
이 Scope에는 아직 일정이 지정된 작업이 없습니다.
Task에 Start Date 또는 Due Date를 추가하면 Gantt에 표시됩니다.
```

두 상태를 구분한다.

---

## 50C.25 Loading / Error

공통 원칙은 §49A.5를 따른다.

Gantt는 Date header를 유지한 채 Task row와 Bar skeleton을 사용한다. 날짜 mutation 실패는 해당 Bar를 원래 Start/Due 값으로 복원한다.

## 50C.26 Responsive

### Wide Desktop

```text
≥ 1200px
Task Table + Timeline 동시 표시
왼쪽 Table 32~38%
오른쪽 Timeline 62~68%
```

### Medium

```text
768~1199px
Task Table 폭을 최소값까지 축소
Timeline horizontal scroll 허용
```

### Narrow / Mobile

Gantt를 카드형 목록으로 완전히 재해석하지 않는다.

기본은 최소 readable width를 유지하고 Gantt 영역 안에서 horizontal scroll을 허용한다.

필요하면 왼쪽 Task Table을 compact/frozen first column 형태로 줄인다.

모바일에서 drag/resize가 불안정하면 Task Detail 날짜 Picker를 보조 수정 수단으로 제공한다.

---

## 50C.27 Keyboard / accessibility

공통 기준은 §49A.7을 따른다.

Gantt의 비드래그 대체 경로는 Task Detail/inline date control이다. Timeline Bar의 accessible label에는 Task identity와 기간을 포함한다.

## 50C.28 Gantt에서 하지 않을 것

다음은 하지 않는다.

```text
Gantt 전용 Task Entity 생성
Gantt Bar 위치를 별도 DB Source of Truth로 저장
날짜 없는 Task에 임의 날짜 생성
Timeline Bar와 왼쪽 Row가 서로 다른 Task Set 사용
Start/Due 변경 후 Calendar/List와 동기화하지 않음
Mockup 때문에 존재하지 않는 Dependency/Milestone Field 추가
한 화면에 맞추기 위해 날짜축을 왜곡
Gantt 전용 Task Detail 생성
```

---

## 50C.29 Component decomposition 권장

개념적으로:

```text
TaskGanttView
│
├── GanttToolbar
│   ├── ZoomControl
│   ├── RangeNavigation
│   └── TodayAction
│
└── GanttSplitPane
    ├── GanttTaskTable
    │   ├── Header
    │   └── TaskRow × N
    │
    └── TimelineViewport
        ├── TimeHeader
        ├── TodayIndicator
        ├── GridRows
        ├── TaskBar × N
        └── DependencyLayer(optional)
```

기존 `TimelinePage`, `timeline.ts`, `connectors.ts` 등이 있으면 이를 우선 재사용/확장한다.

새 `SpaceGantt`, `ProjectGantt`를 복제하지 않는다.

---

## 50C.30 Gantt data contract

개념적으로 Renderer가 필요로 하는 것은:

```text
GanttModel {
  scope
  tasks
  visibleRange
  zoom
  viewSpec {
    filter
    sort
    group
  }
}
```

Task Bar는 다음으로 파생한다.

```text
Canonical Task dates
+ current zoom
+ visible range
→ timeline geometry
```

Dependency Layer는 실제 Dependency 데이터가 있을 때만 파생한다.

---

## 50C.31 Gantt visual acceptance criteria

### T-GV01 — Shell

Sidebar / Context Header / View Bar는 유지되고 Content만 Gantt로 전환된다.

### T-GV02 — Active tab

`Gantt`만 active state를 가진다.

### T-GV03 — Split layout

Desktop에서 왼쪽 Task Table과 오른쪽 Timeline이 동시에 보인다.

### T-GV04 — Row alignment

Task Table Row와 Timeline Bar Row가 vertical scroll 후에도 정확히 정렬된다.

### T-GV05 — Date projection

Start/Due가 있는 Task는 실제 기간에 맞는 위치와 길이로 표시된다.

### T-GV06 — No fake dates

날짜 없는 Task를 표시하기 위해 임의 Start/Due를 생성하지 않는다.

### T-GV07 — Today

Visible Range에 오늘이 있으면 Today indicator가 보이고 `Today` Action으로 해당 날짜로 이동 가능하다.

### T-GV08 — Zoom

Zoom 변경은 Timeline scale만 변경하고 Task Date를 변경하지 않는다.

### T-GV09 — Date mutation

지원되는 경우 Bar drag/resize는 Canonical Task Start/Due를 변경한다.

### T-GV10 — Cross-view sync

Gantt에서 날짜를 바꾸면 Calendar/List/TaskDetail에서도 동일하게 반영된다.

### T-GV11 — Dependency

Dependency가 존재할 때만 실제 관계를 Connector로 표현한다.

### T-GV12 — Horizontal overflow

좁은 화면에서도 날짜축을 읽을 수 없게 압축하지 않고 Timeline 영역에서 horizontal scroll한다.

### T-GV13 — Shared detail

Task Row/Title은 공통 `TaskDetail`을 연다.

### T-GV14 — Canonical visual

Desktop에서 최소한 다음 구조가 표현 가능해야 한다.

```text
Header + View Bar
Timeline Toolbar
Task Table | Time Grid
           | Task Bars
           | Today indicator
```

### T-GV15 — Domain over mockup

Mockup에 보이는 Dependency/기간/색상 요소가 실제 Domain에 없으면 화면을 맞추기 위해 가짜 Domain Field를 추가하지 않는다.

---


# 50D. Calendar View — 상세 UI / Layout Contract

기존 §25의 Calendar 정의는 **동일한 Canonical Task를 날짜 기준으로 Calendar Grid에 투영하는 Task View**라는 원칙을 설명한다.

이 절은 Calendar를 실제 화면으로 옮길 때의 **Rendering / Interaction Contract**를 고정한다.

Calendar View의 목적은:

> **현재 Scope의 Task가 언제 예정되어 있는지 월/주 단위로 빠르게 파악하고, 날짜를 직접 조정하는 일정 중심 작업 화면**

이다.

이번 단계에서는 다음 형태를 **Canonical Project Calendar View**로 사용한다.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb                                                                  │
│ [Icon] 드론 배송 연구                                         [ + Task ] […] │
│        공간·기상 조건에 따른 배송 방식 적합성 연구                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ Overview | List | Board | Gantt | Calendar | Goals | Horizons               │
│                                  ────────                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ [ Month ▾ ]            [ ‹ ]   Aug 2026   [ › ]                  [ Today ] │
├──────────────────────────────────────────────────────────────────────────────┤
│ Sun        Mon        Tue        Wed        Thu        Fri        Sat        │
│ ┌────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐ │
│ │ 26     │ 27       │ 28       │ 29       │ 30       │ 31       │ 1        │ │
│ ├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤ │
│ │ 2      │ 3        │ 4        │ 5        │ 6        │ 7        │ 8        │ │
│ │        │          │ 연구모형 │          │          │ 문헌정리 │          │ │
│ ├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤ │
│ │ 9      │ 10       │ 11       │ 12       │ 13       │ 14       │ 15       │ │
│ │        │ ABM설계  │          │          │          │          │          │ │
│ ├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤ │
│ │ 16     │ 17       │ 18 Today │ 19       │ 20       │ 21       │ 22       │ │
│ │        │ ABM 실행 │ 실험검증 │          │          │ 데이터수집│          │ │
│ ├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤ │
│ │ 23     │ 24       │ 25       │ 26       │ 27       │ 28       │ 29       │ │
│ │        │ 결과정리 │          │          │          │          │          │ │
│ └────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

이 Wireframe은 날짜/Task 예시가 아니라 **Calendar의 정보 위계와 배치 기준**이다.

---

## 50D.1 Calendar View가 시작되는 위치

Calendar View도 동일한 App Shell을 재사용한다.

```text
App Shell
├── Sidebar
└── Main
    ├── Context Header
    ├── View Bar
    └── Calendar View Content
        ├── Calendar Toolbar
        └── Calendar Grid
```

Scope에 따라 별도 Calendar Component를 만들지 않는다.

```text
Space Calendar
Project Calendar
Folder Calendar
List Calendar
```

는 같은 Renderer + 다른 Scope다.

---

## 50D.2 View Bar

공통 구조는 §49A.1을 따른다. 이 화면의 `activeId`는 `calendar`다.

Calendar 내부에 별도 `CALENDAR` 대제목을 반복하지 않는다.

## 50D.3 Calendar Toolbar

View Bar 아래에 한 줄 Toolbar를 둔다.

Desktop 기본 구조:

```text
LEFT
[ Calendar mode ]

CENTER / LEFT-CENTER
[ Previous ] [ Current range label ] [ Next ]

RIGHT
[ Today ]
[ Optional filter/display controls ]
```

Canonical Mockup:

```text
[ Month ▾ ]       [ ‹ ]   Aug 2026   [ › ]                    [ Today ]
```

권장 Token:

```text
Toolbar min height       44~48px
Control height           30~34px
Control gap              8px
Horizontal padding       12~16px
```

---

## 50D.4 Calendar mode

초기 기본은:

```text
Month
```

이다.

다른 Mode는 현재 Calendar Renderer가 실제 지원하는 경우에만 노출한다.

예:

```text
Month
Week
```

`Day`, `Agenda` 등 미지원 Mode를 Mockup 때문에 먼저 만들지 않는다.

Mode 변경은 Task 데이터를 변경하지 않는다.

---

## 50D.5 Calendar date source

Calendar에 어떤 날짜를 사용하는지는 반드시 명시적이어야 한다.

기본 권장 Source는:

```text
Task.dueDate
```

이다.

단 기존 Calendar/ViewSpec이 이미 `dateField` 또는 Start/Due semantics를 가지고 있다면 그것을 Source of Truth로 한다.

예:

```text
ViewSpec.calendar.dateField = dueDate
```

같은 구조가 존재한다면 재사용한다.

다음처럼 화면마다 임의로 다른 날짜를 선택하지 않는다.

```text
Calendar A → dueDate
Calendar B → startDate
Calendar C → updatedAt
```

### 50D.5A Repository Gate — `G-CALENDAR-01`

`Task.dueDate`는 fallback 후보이지 Repository 사실 확인을 건너뛰기 위한 강제값이 아니다.

STEP 3에서 다음을 확인한다.

```text
ViewSpec.calendar.dateField 존재 여부
기존 Calendar renderer가 사용하는 field
Calendar drag mutation이 실제로 쓰는 field
startDate / scheduledDate / dueDate의 현재 Domain semantics
```

결정 순서:

```text
1. Existing canonical dateField 존재
   → 그대로 Source of Truth로 REUSE

2. 명시적 dateField는 없지만 기존 Calendar mutation/read path가 일관됨
   → 그 실제 field를 canonical dateField로 문서화하고 ADAPT

3. 기존 구현도 일관된 Source가 없음
   → STEP 4 Revised Implementation Plan에서 실제 Task date model에 근거해 하나의 field를 명시적으로 확정
```

`G-CALENDAR-01`이 `RESOLVED`되기 전에는 Calendar Event drag/write mutation을 구현하지 않는다.
화면마다 편의상 다른 날짜 field를 읽거나 쓰는 Parallel semantics를 만들지 않는다.

---

## 50D.6 Month Grid

Month View는 7-column Calendar Grid를 사용한다.

```text
Sun | Mon | Tue | Wed | Thu | Fri | Sat
```

Locale에 따라 주 시작일이 이미 앱 설정에 있다면 그 설정을 우선한다.

한국어 Locale의 기본 주 시작일을 이번 문서에서 강제로 새로 정의하지 않는다.

각 Date Cell은:

```text
Date number
Task event(s)
Optional +N more
```

구조를 가진다.

---

## 50D.7 Outside-month dates

Month Grid를 완성하기 위해 이전/다음 달 날짜를 함께 보여줄 수 있다.

예:

```text
Jul 26 27 28 29 30 31 | Aug 1
```

Outside-month Date는 현재 Month보다 muted하게 표시한다.

하지만 클릭/Task 표시 동작은 정상적으로 유지할 수 있다.

---

## 50D.8 Today state

오늘 날짜 Cell은 한눈에 구분되어야 한다.

권장:

```text
date number accent
또는
subtle cell highlight
```

Today가 선택된 날짜와 동일한 시각 상태를 가져 혼동되지 않게 한다.

```text
Today
≠ Selected date
```

Toolbar의 `Today` 버튼은 오늘이 포함된 Range로 이동한다.

---

## 50D.9 Task event anatomy

한 Calendar Event는 compact하게 유지한다.

기본 필수 정보:

```text
Task title
```

Scope에 따라 필요한 경우 작은 Context indicator를 추가할 수 있다.

```text
Space Calendar
→ Project context

Project Calendar
→ List context
```

하지만 Month Cell 안에 Status / Assignee / Priority / List를 모두 넣지 않는다.

Calendar의 핵심은 날짜 스캔이다.

---

## 50D.10 Event Visual Language

권장:

```text
Event height          20~24px
Event radius          4~6px
Horizontal padding    5~7px
Vertical gap          2~4px
Title                 single line
Overflow              ellipsis
```

색상은 기존 Status/List/Project color system이 있을 때만 보조적으로 사용한다.

색상만으로 Task 종류를 구분하지 않는다.

---

## 50D.11 Due Date Task

기본 Calendar가 Due Date 기반이라면:

```text
Task.dueDate = Aug 18
```

인 Task는 Aug 18 Cell에 Event로 표시한다.

같은 Task를 여러 날짜 Cell에 복제하지 않는다.

---

## 50D.12 Start + Due Range Task

현재 Calendar Renderer가 기간 Event를 실제 지원하고 Calendar semantics가 Start~Due 범위를 표현하도록 설계되어 있다면 multi-day event로 표시할 수 있다.

```text
Aug 18 ───────── Aug 21
```

하지만 기본 Month Calendar를 맞추기 위해 새 range event system을 강제로 만들지 않는다.

지원하지 않는 경우 Calendar의 canonical dateField만 사용하고, 전체 기간은 Gantt에서 보여준다.

즉:

```text
Gantt
= 기간 중심

Calendar
= 날짜 배치 중심
```

역할을 구분한다.

---

## 50D.13 날짜 없는 Task

Calendar dateField가 없는 Task는 거짓 날짜를 만들어 표시하지 않는다.

가능한 UX:

```text
Unscheduled / No date count
또는
Calendar에서 숨김 + 명확한 Filter/안내
```

기존 Calendar가 Unscheduled panel을 지원하면 재사용한다.

Task를 Calendar에 넣기 위해 오늘 날짜를 자동 부여하지 않는다.

---

## 50D.14 Date Cell overflow

한 Date Cell에 Task가 많을 때 Cell 높이를 무한정 늘려 Month 전체 Layout을 깨지 않는다.

권장:

```text
Task A
Task B
Task C
+ 4 more
```

`+ N more` 클릭 시:

```text
Popover / Drawer / expanded cell
```

등으로 해당 날짜의 전체 Task에 접근 가능해야 한다.

영구적으로 숨기지 않는다.

---

## 50D.15 Event click

Event 클릭:

```text
Calendar Event
→ shared TaskDetail
```

을 연다.

Calendar 전용 Task Detail을 만들지 않는다.

---

## 50D.16 Date Cell click / + Task

빈 Date Cell 또는 explicit `+` Action으로 새 Task를 만들 수 있다면 해당 날짜 Context를 자동 상속한다.

예:

```text
Aug 21 Cell
→ + Task
→ dueDate = Aug 21
```

그리고 현재 Hierarchy Scope도 함께 상속한다.

```text
Project Calendar
→ projectId 자동 상속
```

단 Create Flow가 현재 제품에서 cell-click create를 지원하지 않으면 이번 작업 때문에 무리하게 새 패턴을 만들지 않는다.

Header `+ Task`는 날짜를 자동 상속하지 않고 현재 Scope만 상속한다.

---

## 50D.17 Drag & Drop — 날짜 이동

기존 Calendar Renderer가 drag mutation을 지원한다면 Event를 다른 날짜로 Drag할 수 있다.

```text
Aug 18
Task A

Drag → Aug 21
```

의미:

```text
Canonical Task calendar date field
Aug 18 → Aug 21
```

이어야 한다.

기본 dateField가 Due Date라면 Due Date를 변경한다.

Pixel position을 Calendar local state로만 저장하지 않는다.

Mutation 실패 시 원래 날짜로 복원한다.

---

## 50D.18 Multi-day drag / resize

기간 Event를 실제 지원하는 경우에만 시작/종료 날짜 drag/resize를 제공한다.

지원하지 않는 Calendar에 Gantt의 resize interaction을 복제하지 않는다.

기간 편집의 주 작업 화면은 Gantt 또는 Task Detail이 될 수 있다.

---

## 50D.19 Previous / Next navigation

Month Mode에서는 이전/다음 Month로 이동한다.

Week Mode가 있다면 이전/다음 Week로 이동한다.

현재 Range Label은 navigation 결과와 항상 일치해야 한다.

Back/Forward browser history에 Calendar의 내부 month 이동을 모두 기록할지는 기존 Router/View State 전략에 따른다.

---

## 50D.20 Filter / Search

Calendar도 다른 Task View와 동일한 `ViewSpec.filter` semantics를 사용한다.

예:

```text
Status
List
Assignee
Priority
```

Calendar 전용 Task Query를 만들지 않는다.

Search가 지원된다면 현재 Scope/Filter 결과 안에서 title 등을 좁힌다.

Mockup처럼 Toolbar를 단순하게 유지하되, 기존 Calendar Renderer가 가진 Filter UI가 있다면 우선한다.

---

## 50D.21 Scope context

Calendar Event의 Context 표시는 현재 Scope에 따라 달라진다.

```text
Space Calendar
→ Project 구분이 중요

Project Calendar
→ List 구분이 중요

Folder Calendar
→ List 구분이 중요

List Calendar
→ parent context 생략 가능
```

Renderer를 Scope별로 복제하지 않고 Context label만 조정한다.

---

## 50D.22 Overdue visual

Due Date 기반 Calendar에서 완료되지 않은 Task의 Due Date가 과거라면 기존 Domain의 overdue 계산을 사용할 수 있다.

Overdue Event는 작은 semantic indicator로 구분할 수 있다.

하지만 Calendar 자체에서 새로운 overdue 정의를 만들지 않는다.

```text
Overview overdue
List overdue
Calendar overdue
```

가 서로 다른 기준을 사용해서는 안 된다.

---

## 50D.23 Weekend / non-working day

주말 또는 비근무일을 시각적으로 약하게 구분할 수 있다.

단 현재 앱에 Working Calendar / Holiday Domain이 없다면 새 업무일 계산 시스템을 만들지 않는다.

단순 neutral background 수준의 시각적 구분은 가능하다.

---

## 50D.24 Calendar scrolling

Month Grid는 기본적으로 한 Month 전체를 한 Content 영역에서 보여준다.

좁은 높이에서 각 Week Row마다 별도 scroll을 만들지 않는다.

Page vertical scroll 또는 Calendar content scroll 중 하나의 일관된 전략을 사용한다.

Sticky weekday header는 기존 App Shell과 충돌하지 않는 경우 허용한다.

---

## 50D.25 Empty Calendar

### Scope에 Task가 없음

```text
아직 작업이 없습니다.
첫 작업을 추가해 일정을 시작하세요.
[ + Task ]
```

### Task는 있지만 Calendar date가 없음

```text
이 Scope에는 아직 날짜가 지정된 작업이 없습니다.
Task에 Due Date를 추가하면 Calendar에 표시됩니다.
```

두 상태를 구분한다.

---

## 50D.26 Loading / Error

공통 원칙은 §49A.5를 따른다.

Calendar는 Weekday header와 Grid geometry를 유지하는 skeleton을 사용한다. Date mutation 실패는 Event를 원래 날짜로 복원한다.

## 50D.27 Responsive

### Wide Desktop

```text
≥ 1200px
7-column Month Grid 전체 표시
Cell 안에 2~4개 Event + overflow 가능
```

### Medium

```text
768~1199px
7-column 구조 유지
Event metadata 축소
Task title ellipsis 강화
```

### Narrow / Mobile

7개 Column을 지나치게 좁혀 Task title을 읽을 수 없게 하지 않는다.

현재 모바일 전략에 따라:

```text
horizontal calendar scroll
또는
Week/Agenda fallback
```

중 하나를 사용할 수 있다.

단 기존 Calendar에 Agenda/Week Renderer가 없다면 이번 문서만으로 새 Mode를 강제하지 않는다.

최소한 날짜와 Task 접근성이 유지되어야 한다.

---

## 50D.28 Keyboard / accessibility

공통 기준은 §49A.7을 따른다.

Date Cell과 Event는 keyboard 탐색 대상이다. Event label에는 Task title과 날짜를 포함하고, 날짜 변경의 대체 경로는 Task Detail Date Picker를 사용한다.

## 50D.29 Calendar에서 하지 않을 것

다음은 하지 않는다.

```text
Calendar 전용 Task Entity 생성
Calendar 전용 Due Date 복사본 저장
날짜 없는 Task에 오늘 날짜 자동 할당
월 Cell에 모든 Task metadata 노출
+N more 뒤의 Task를 접근 불가능하게 숨김
Calendar마다 서로 다른 overdue 계산
Mockup 때문에 미지원 Week/Agenda/Range 기능을 무조건 추가
Calendar 전용 Task Detail 생성
```

---

## 50D.30 Component decomposition 권장

개념적으로:

```text
TaskCalendarView
│
├── CalendarToolbar
│   ├── ModeSelector
│   ├── RangeNavigation
│   └── TodayAction
│
└── CalendarGrid
    ├── WeekdayHeader
    └── CalendarWeek × N
        └── DateCell × 7
            ├── DateLabel
            ├── TaskEvent × N
            └── OverflowAction(optional)
```

Task Detail / Task mutation / Create Flow는 다른 View와 공유한다.

기존 Calendar Renderer가 있으면 이를 확장하고 Scope별 Calendar를 복제하지 않는다.

---

## 50D.31 Calendar data contract

개념적으로:

```text
CalendarModel {
  scope
  tasks
  mode
  visibleRange
  calendarDateField
  viewSpec {
    filter
    sort
  }
}
```

Calendar Event는 다음으로 파생한다.

```text
Canonical Task
+ calendarDateField
+ visibleRange
→ Calendar Event
```

별도 Calendar Event DB Entity를 의미하지 않는다.

---

## 50D.32 Calendar visual acceptance criteria

### T-CV01 — Shell

Sidebar / Context Header / View Bar는 유지되고 Content만 Calendar로 전환된다.

### T-CV02 — Active tab

`Calendar`만 active state를 가진다.

### T-CV03 — Month layout

기본 Month View는 7-column Calendar Grid로 표현된다.

### T-CV04 — Range navigation

Previous / Next / Today를 사용해 현재 Calendar Range를 이동할 수 있다.

### T-CV05 — Date source

Calendar Event 날짜는 명시된 Canonical Task date field와 일치한다.

### T-CV06 — Today

오늘 날짜는 다른 날짜와 구분되지만 Selected state와 혼동되지 않는다.

### T-CV07 — No fake dates

날짜 없는 Task를 Calendar에 표시하기 위해 임의 날짜를 생성하지 않는다.

### T-CV08 — Event density

Month Cell의 Event는 compact한 title 중심으로 표시되고 과도한 metadata를 넣지 않는다.

### T-CV09 — Overflow

Cell에 Task가 많으면 `+N more` 또는 동등한 interaction으로 모든 Task에 접근할 수 있다.

### T-CV10 — Shared detail

Calendar Event 클릭은 공통 `TaskDetail`을 연다.

### T-CV11 — Date mutation

지원되는 경우 Event drag는 Canonical Task의 Calendar date field를 변경한다.

### T-CV12 — Cross-view sync

Calendar에서 날짜를 변경하면 Gantt/List/TaskDetail에서도 동일하게 반영된다.

### T-CV13 — Scope context

Space Calendar에서는 Project, Project Calendar에서는 List 등 현재 Scope에 적절한 Context를 식별할 수 있다.

### T-CV14 — Responsive

좁은 화면에서도 날짜와 Task title을 읽을 수 없게 7개 Column을 무리하게 압축하지 않는다.

### T-CV15 — Canonical visual

Desktop에서 최소한 다음 구조가 표현 가능해야 한다.

```text
Header + View Bar
Calendar Toolbar
Weekday Header
7-column Month Grid
Date Cell
  ├── Date
  ├── Task Event(s)
  └── +N more(optional)
```

### T-CV16 — Domain over mockup

Mockup에 보이는 Event range/color/extra mode가 실제 Domain/Renderer에 없으면 화면을 맞추기 위해 가짜 기능이나 Field를 추가하지 않는다.

---

# 50E. Goals — 상세 UI / Domain Section Contract

Goals는 List / Board / Gantt / Calendar와 같은 Task View가 아니다.

Goals의 질문은:

> **현재 선택한 Space 또는 Project에서 무엇을 달성하려고 하는가?**

다.

따라서 Goals 화면은 Task를 다른 Layout으로 투영하는 화면이 아니라, 현재 Scope의 Goal을 관리하고 그 Goal과 실행 Task의 연결 상태를 확인하는 **Domain Section**으로 구현한다.

이번 단계에서는 Desktop 기본형을 다음 정보 위계로 고정한다.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumb                                                                  │
│ [Icon] 드론 배송 연구                                         [ + Goal ] […] │
│        공간·기상 조건에 따른 배송 방식 적합성 연구                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ Overview | List | Board | Gantt | Calendar | Goals | Horizons               │
│                                             ━━━━━                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Active Goals                                                    [optional]   │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 저널 논문 1편 투고                                              [⋯]      │ │
│ │                                                                          │ │
│ │ [──────────────────────────────────────────────────────] 62%              │ │
│ │                                                                          │ │
│ │ Due 2026-12-31                              Linked tasks 8 / 13           │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ABM 모델 고도화                                                   [⋯]      │ │
│ │                                                                          │ │
│ │ [────────────────────────────────────] 45%                               │ │
│ │                                                                          │ │
│ │ Due 2026-10-31                              Linked tasks 5 / 11           │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Completed Goals                                                              │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 문헌연구 완료                                              Completed      │ │
│ │ [────────────────────────────────────────────────────────] 100%          │ │
│ │ Completed 2026-07-15                                                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

이 Wireframe은 **Goals Section의 Canonical Desktop Layout**이다.

다만 이미지와 맞추기 위해 실제 Domain에 존재하지 않는 Goal Field를 새로 만들지 않는다.

즉:

```text
Layout / information hierarchy
= 이 문서에서 고정

실제 Goal field / status / progress semantics
= 기존 Goal Domain을 Source of Truth로 사용
```

한다.

---

## 50E.1 Goals가 시작되는 위치

Goals는 공통 App Shell 안에서 Content 영역만 교체한다.

```text
App Shell
├── Sidebar
└── Main
    ├── Context Header
    ├── View Bar
    └── Goals Content   ← 이 절의 대상
```

Goals 화면 안에서 별도의 Sidebar / Project Header / View Bar를 다시 만들지 않는다.

현재 Scope는 기존 `HierarchySelection / ViewScope`에서 받는다.

---

## 50E.2 View Bar

공통 구조는 §49A.1을 따른다. 이 화면의 `activeId`는 `goals`다.

Goals는 내부적으로 Domain Section이지만 사용자 UI에서는 동일한 한 줄 View Bar를 사용한다.

## 50E.3 Scope 규칙

Goals의 기본 지원 Scope는:

```text
Space
Project
```

다.

기존 제품이 Folder/List 수준 Goal을 이미 지원한다면 해당 기능을 보존할 수 있다.

하지만 이번 UI를 맞추기 위해 새로:

```text
Folder Goal
List Goal
Task-local Goal
```

관계를 추가하지 않는다.

Project Goals에서는 해당 Project의 Goal만 보이고, Space Goals에서는 해당 Space에 속하는 Goal을 보여준다.

Scope 간 Goal 복제는 금지한다.

---

## 50E.4 Goals 전체 Layout

Goals Content는 기본적으로 세 구역으로 나눈다.

```text
Goals Content
│
├── Section Header / optional controls
│
├── Active Goals
│   └── Goal Card × N
│
└── Completed Goals
    └── Goal Card × N
```

Desktop에서는 Goal Card를 **세로로 쌓는 1-column 구조**를 기본으로 한다.

Goal 하나의 정보량이 충분히 크므로 Dashboard처럼 3~4개의 작은 카드를 한 행에 억지로 배치하지 않는다.

권장 Layout Token:

```text
Content horizontal padding   20~24px
Content top padding          20~24px
Section gap                  24~32px
Goal card gap                12px
Goal card padding            16~20px
Goal card radius             10~12px
Goal card border             1px neutral
Goal card max readable width content 영역 전체
```

---

## 50E.5 Section Header

Goals Content 상단은 과도한 Dashboard Header를 만들지 않는다.

기본적으로:

```text
Goals
현재 Scope의 목표와 진행 상태
```

정도의 Section identity만 둘 수 있다.

Context Header에 이미 Project Name이 있으므로 Project Name을 Goals 내부에서 다시 크게 반복하지 않는다.

Goal 생성 기능이 기존 Domain에 존재한다면 우측에:

```text
[ + Goal ]
```

을 둘 수 있다.

중요:

> Mockup에 `+ Goal`이 있다는 이유만으로 Goal create capability를 새로 만들지는 않는다.

기존 Goal 생성 경로가 없다면 해당 Action은 숨긴다.

---

## 50E.6 Active Goals / Completed Goals 분리

기본 Grouping은:

```text
Active Goals
Completed Goals
```

이다.

하지만 실제 상태 판정은 기존 Goal Domain의 Status를 따른다.

예:

```text
active
completed
archived
paused
```

등의 상태가 이미 존재한다면 현재 의미를 보존한다.

특히 다음을 하지 않는다.

```text
progress === 100
→ 무조건 completed로 변경
```

Goal의 progress가 100%여도 Domain Status가 Active라면 자동 완료 처리하지 않는다.

완료 여부는 기존 Goal 상태 모델이 Source of Truth다.

Archived Goal이 있다면 기본 Active/Completed 목록에 섞지 않고 기존 Archive 정책을 따른다.

---

## 50E.7 Goal Card anatomy

Active Goal Card의 기본 구조는 다음과 같다.

```text
Goal Card
├── Header
│   ├── Goal title
│   ├── optional status badge
│   └── More menu
│
├── Progress
│   ├── Progress bar
│   └── numeric progress(optional)
│
└── Meta
    ├── Due date(optional)
    └── Linked task progress/count(optional)
```

예:

```text
저널 논문 1편 투고                                      ⋯

[██████████████████████──────────────] 62%

Due 2026-12-31                     Linked tasks 8 / 13
```

Goal title은 Card의 가장 높은 정보 위계를 갖는다.

More menu에는 기존 Goal이 실제 지원하는 Action만 노출한다.

예:

```text
Edit
Complete
Archive
Delete
```

중 실제 구현이 존재하는 것만 사용한다.

---

## 50E.8 Goal Progress Source of Truth

Progress는 시각화를 위해 임의 계산하지 않는다.

다음 우선순위를 따른다.

### Case A — Goal 자체 Progress가 존재

기존 Goal Domain에 명시적인:

```text
progress
current / target
percent
```

등이 있으면 그것을 사용한다.

### Case B — Linked Tasks 기반 Progress가 기존 의미

Goal과 Task 연결 관계가 존재하고 기존 제품에서 Task 완료율을 Goal Progress로 사용하는 것이 명확하다면:

```text
completed linked tasks
──────────────────────
all linked tasks
```

를 사용할 수 있다.

### Case C — 둘 다 없음

Progress Bar 자체를 숨긴다.

```text
Goal title
Due date(optional)
Linked task count(optional)
```

만 보여준다.

절대 다음을 하지 않는다.

```text
기간이 60% 지남
→ Goal progress 60%
```

또는 임의 상수를 사용해 Mockup 숫자를 맞추지 않는다.

---

## 50E.9 Progress 표현

Progress가 존재하면:

```text
[────────────────────────────] 62%
```

처럼 Bar + Numeric Value를 함께 보여주는 것을 기본으로 한다.

권장 Token:

```text
Progress height     6~8px
Track               neutral subtle
Fill                accent / semantic
Value               right aligned
```

완료 Goal은 기존 success semantic을 사용할 수 있다.

색상만으로 Progress 상태를 전달하지 않는다.

---

## 50E.10 Due Date

Goal에 실제 Due Date가 있을 때만 표시한다.

```text
Due 2026-12-31
```

Overdue Goal이 기존 Domain Rule로 판정되면 danger semantic을 보조적으로 사용할 수 있다.

Goal용 별도 Overdue Rule을 만들지 않는다.

```text
Goal Domain due semantics
→ Goals UI
```

로 유지한다.

Due Date가 없는 Goal에 가짜 날짜를 채우지 않는다.

---

## 50E.11 Linked Tasks

Goal과 Task의 실제 관계가 존재할 경우 Goal Card에서 실행 상태를 요약할 수 있다.

기본 예:

```text
Linked tasks 8 / 13
```

여기서 의미는 기존 Domain에 맞춘다.

예를 들어 완료 Task 수를 표현한다면:

```text
8 completed / 13 linked
```

의 의미가 명확해야 한다.

단순 Task 개수만 존재한다면:

```text
13 linked tasks
```

로 표시한다.

Goal Card 안에서 모든 Linked Task를 펼쳐 보여주지 않는다.

상세 Task 목록은 Goal Detail 또는 관련 Task View에서 확인한다.

---

## 50E.12 Goal Card click / detail

Goal Card를 클릭했을 때는 기존 제품의 Goal 상세/편집 UX를 재사용한다.

가능한 형태:

```text
Goal Detail Drawer
Goal Detail Modal
Goal Detail Route
Inline Detail
```

중 현재 Architecture와 맞는 것을 사용한다.

이번 문서 때문에 새로운 Goal Detail 데이터 모델을 만들지 않는다.

Goal Detail에서 Linked Task를 클릭하면 공통 `TaskDetail`을 사용한다.

---

## 50E.13 Goal 정렬

기존 Goal ordering / position이 있다면 그것을 우선한다.

없다면 deterministic fallback을 사용할 수 있다.

Active Goals 권장 fallback:

```text
priority DESC   // 실제 필드가 존재할 때만
→ dueDate ASC   // null last
→ createdAt ASC
```

Priority가 Domain에 없다면 Priority를 새로 만들지 않는다.

Completed Goals 권장 fallback:

```text
completedAt DESC
→ updatedAt DESC
```

해당 필드가 없으면 기존 ordering을 따른다.

---

## 50E.14 Completed Goals 표현

Completed Goal은 Active Goal보다 시각적 emphasis를 낮춘다.

기본 구조:

```text
문헌연구 완료                                     Completed
[████████████████████████████████████████] 100%
Completed 2026-07-15
```

다만 Goal Progress가 존재하지 않으면 100% Bar를 억지로 추가하지 않는다.

완료 Status와 완료 시점만 표시해도 된다.

Completed Goals가 매우 많으면 초기에는 최근 N개만 보여주고:

```text
Show more
```

또는 기존 pagination/virtualization 전략을 사용한다.

---

## 50E.15 Goal status change

Goal을 Complete / Reopen / Pause하는 기능이 기존 Domain에 있다면 Goals Section에서 사용할 수 있다.

Mutation은 반드시 Canonical Goal을 수정한다.

```text
Goals UI
   ↓
Canonical Goal mutation
   ↓
Overview Goals Summary
Goals Section
관련 화면
```

이 즉시 일치해야 한다.

Overview용 Goal 상태를 별도 저장하지 않는다.

---

## 50E.16 Goal과 Task의 관계

Goal은 Task Container가 아니다.

다음 구조를 만들지 않는다.

```text
Goal
└── copied Tasks
```

실제 구조는:

```text
Goal
   └── links/references
         ↓
Canonical Tasks
```

이어야 한다.

Task를 Goal에 연결/해제하면 Task Entity 자체가 복제되지 않는다.

---

## 50E.17 Space Goals의 Context 표시

Space Scope에서는 여러 Project의 Goal이 함께 나타날 수 있다.

이 경우 Goal Card에서 Project Context를 식별할 수 있어야 한다.

예:

```text
저널 논문 1편 투고
드론 배송 연구
```

Project Scope에서는 이미 Header가 Project Context를 제공하므로 같은 Project Name을 모든 Goal Card에서 반복하지 않아도 된다.

즉:

```text
Space Goals   → Project context 표시
Project Goals → 중복 context 최소화
```

한다.

---

## 50E.18 Goal Filter / Search

초기 기본 화면에는 복잡한 Filter Builder를 강제하지 않는다.

Goal 수가 충분히 많거나 기존 Goal 기능에 Filter가 있으면 다음 정도를 사용할 수 있다.

```text
Status
Search
Project context (Space Scope)
```

Task View의 `ViewSpec.filter`를 Goal에 그대로 억지로 적용하지 않는다.

Goals는 Task View Registry가 아니므로 Goal 전용 Domain semantics를 따른다.

---

## 50E.19 Empty State

### Goal이 하나도 없음

```text
아직 목표가 없습니다.

이 프로젝트에서 달성하려는 목표를 추가해보세요.

[ + Goal ]   // 생성 기능이 실제 존재할 때만
```

### Active Goal은 없고 Completed Goal만 있음

```text
현재 진행 중인 목표가 없습니다.
```

Completed Goals는 아래에서 계속 보여준다.

### Completed Goal이 없음

Completed 영역을 억지로 큰 Empty Card로 채우지 않는다.

Section label + compact empty text 정도로 처리하거나 영역 자체를 생략할 수 있다.

---

## 50E.20 Loading / Error

공통 원칙은 §49A.5를 따른다.

Goals는 Goal Card skeleton을 사용하고 오류를 Goals Content 안에서 처리한다. Sidebar / Context Header / View Bar를 통째로 Error 화면으로 바꾸지 않는다.

## 50E.21 Responsive

### Desktop

```text
Goal Card 1-column
full available content width
```

### Tablet

같은 1-column을 유지한다.

Meta 정보가 좁으면:

```text
Due date
Linked task count
```

를 두 줄로 내려도 된다.

### Mobile / narrow panel

Goal Card는 계속 세로 구조를 유지한다.

```text
Title
Progress
Due
Linked tasks
```

순으로 stack한다.

Goal 내용을 읽을 수 없게 작은 multi-column card로 압축하지 않는다.

---

## 50E.22 Keyboard / accessibility

공통 기준은 §49A.7을 따른다.

Goal Card, More button, Progress indicator의 semantics를 분리한다. Progress에는 label/value를 제공하고 Card click과 내부 Button click이 충돌하지 않게 한다.

## 50E.23 Goals에서 하지 않을 것

다음은 금지한다.

```text
Goals를 Task ViewSpec layout으로 위장
Goal마다 Task 복제본 저장
Overview용 Goal progress 별도 저장
Due Date 경과율을 Goal progress로 임의 사용
progress 100%만 보고 Goal을 자동 Complete
실제 없는 Priority / Target / Metric Field를 Mockup 때문에 추가
Goal Card 안에 모든 Linked Task를 항상 펼침
Space Goals와 Project Goals를 별도 Goal Store로 분리
Goals 전용 Task Detail 구현
```

---

## 50E.24 Component decomposition 권장

개념적으로:

```text
GoalsSection
├── GoalsSectionHeader
├── ActiveGoalsSection
│   └── GoalCard × N
├── CompletedGoalsSection
│   └── GoalCard × N
└── GoalsEmptyState
```

Goal Card는 가능한 한 Scope에 따라 복제하지 않는다.

```text
SpaceGoalCard
ProjectGoalCard
```

같은 평행 컴포넌트를 만들기보다:

```text
GoalCard
+ context display policy
```

로 재사용한다.

---

## 50E.25 Goals data contract

정확한 타입은 기존 Repository를 확인한 뒤 맞춘다.

개념적으로 UI가 기대하는 최소 모델은 다음 범위다.

```text
GoalViewModel {
  goal
  scopeContext?
  status
  progress?          // 실제 Domain에서 제공/파생 가능할 때만
  dueDate?
  linkedTaskCount?
  linkedDoneCount?
}
```

중요:

> 이 타입은 UI Projection 예시이지 새 DB Schema 요구사항이 아니다.

기존 Goal Entity/Selector에서 계산 가능한 값은 ViewModel에서 파생한다.

---

## 50E.26 Goals visual acceptance criteria

### T-GL01 — Shell consistency

Sidebar / Context Header / View Bar는 유지되고 Content만 Goals로 전환된다.

### T-GL02 — Active tab

`Goals`만 active state를 가진다.

### T-GL03 — Domain section

Goals가 Task `layout`으로 처리되지 않는다.

### T-GL04 — Canonical grouping

Desktop 기본형에서 Active Goals와 Completed Goals가 구분되어 표현된다.

### T-GL05 — Goal card hierarchy

Goal title → progress → due/linked task meta의 정보 위계가 명확하다.

### T-GL06 — Progress source

Progress 값은 기존 Goal Domain 또는 명시적으로 정의된 linked-task 계산에서만 나온다.

### T-GL07 — No fake progress

Progress Source가 없을 때 Mockup을 맞추기 위해 임의 percentage를 생성하지 않는다.

### T-GL08 — Completion semantics

Progress 100%가 기존 Domain 규칙 없이 Goal 완료 상태를 강제로 바꾸지 않는다.

### T-GL09 — Space context

Space Goals에서 여러 Project Goal이 보이면 각 Goal의 Project Context를 구분할 수 있다.

### T-GL10 — Goal mutation sync

Goal 상태/제목/진행 값을 수정하면 Overview Goals Summary와 동일 Canonical Goal을 사용해 즉시 일치한다.

### T-GL11 — Linked tasks

Linked Task는 복제되지 않으며 기존 Canonical Task를 참조한다.

### T-GL12 — Empty state

Goal이 없을 때 빈 카드 배열 대신 목적과 다음 Action이 명확한 Empty State를 보여준다.

### T-GL13 — Responsive

좁은 화면에서도 Goal title / progress / due / linked task 정보가 읽을 수 있는 순서로 stack된다.

### T-GL14 — Domain over mockup

Mockup에 보이는 Progress, Due, Linked Tasks, Status 중 실제 Domain이 지원하지 않는 Field는 화면을 맞추기 위해 새로 생성하지 않는다.

---

# 50F. Horizons — 상세 UI / Domain Section Contract

기존 §27에서 Horizons의 실제 Domain 의미를 확정했다.

이 절은 Repository에 이미 존재하는 Horizons 2.0 모델을 Space / Project 공통 Shell 안에 연결할 때의 **Rendering / Interaction / Data Contract**를 고정한다.

Horizons의 목적은:

> **장기 방향부터 오늘 실행까지 Life / Year / Month / Week / Day의 서로 다른 계획 규모를 한 화면에서 비교하고, Goal → Milestone → Task의 연결을 잃지 않은 채 계획 기간을 조정하는 것**

이다.

Horizons는 Task 상태 Board가 아니다.

또한 `Now / Next / Later` 우선순위 화면도 아니다.

---

## 50F.1 Repository-confirmed Domain Contract

구현 전 확인 Gate로 남겨두지 않는다.

현재 Repository에서 이미 다음이 확인되어 있으므로 이 문서의 Source of Truth로 사용한다.

```text
Visible Horizon IDs
= life / year / month / week / day

Visible order
= Life → Year → Month → Week → Day

Goal / Milestone timing
= GoalSchedule

Task timing
= scheduledDate / dueDate compatibility projection

Unified presentation
= HorizonItem / canonical Item projection

Carryover
= derived, not stored
```

`unscheduled`은 GoalSchedule의 상태지만 visible Horizon Column이 아니다.

따라서 이 절에서 Horizon이라는 단어는 기본적으로:

```text
Life / Year / Month / Week / Day
```

다섯 개를 의미한다.

---

## 50F.2 Horizons가 시작되는 위치

다른 Section/View와 동일한 App Shell을 공유한다.

```text
App Shell
├── Sidebar
└── Main
    ├── Context Header
    ├── View Bar
    └── Horizons Content
```

`HorizonsPage`가 자체 전체 페이지 Header/Shell을 중복해서 만들지 않는다.

새 구조에서는 기존 Horizons 기능을 현재 `HierarchySelection / ViewScope` 아래에서 재사용한다.

---

## 50F.3 View Bar

공통 구조는 §49A.1을 따른다. 이 화면의 `activeId`는 `horizons`다.

Registry의 `kind = "section"`은 내부 분류이며 별도 Navigation row를 의미하지 않는다.

## 50F.4 Canonical Desktop Layout — 5 Horizon Columns

Wide Desktop에서 Horizons의 핵심은 다섯 지평을 **동시에 비교할 수 있는 것**이다.

기본 순서:

```text
Life | Year | Month | Week | Day
```

을 고정한다.

Canonical 구조:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Context Header                                                     [ + Task ] […]            │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Overview | List | Board | Gantt | Calendar | Goals | Horizons                               │
│                                                        ─────────                              │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Horizons                                              [Hide completed] [Back to today]        │
├──────────────────┬──────────────────┬──────────────────┬──────────────────┬──────────────────┤
│ LIFE             │ YEAR             │ MONTH            │ WEEK             │ DAY              │
│                  │ ‹ 2026 ›         │ ‹ Aug 2026 ›     │ ‹ Aug 16–22 ›    │ ‹ Aug 17 ›       │
│              2   │              3   │              6   │              4   │              5   │
│                  │                  │                  │                  │                  │
│ Goal             │ Goal             │ Goal             │ Milestone        │ Task             │
│                  │                  │ Carryover · 1    │ Task             │ Task             │
│                  │                  │ Goal             │                  │                  │
│                  │                  │                  │                  │                  │
│ + Goal           │ + Goal           │ + Goal           │ + Goal           │ + Goal           │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

Wireframe의 Item 수와 날짜는 예시다.

필수 Contract는:

```text
5 horizons
same order
same scope
period anchors
unified card language
carryover
```

다.

---

## 50F.5 왜 3-column/vertical Now-Next-Later 구조를 사용하지 않는가

Horizons의 핵심 정보는 단순한 우선순위 순서가 아니라 **서로 다른 계획 규모의 동시 비교**다.

```text
Life
→ Year
→ Month
→ Week
→ Day
```

를 한 화면에서 읽을 수 있어야:

- 장기 Goal이 어느 수준까지 구체화됐는지
- Month Goal이 Week/Day 실행으로 내려왔는지
- 특정 지평에 계획이 과도하게 몰렸는지

를 파악할 수 있다.

따라서 Desktop에서 다섯 지평을 단순 vertical stack으로 바꾸지 않는다.

Narrow 화면에서는 비교 기능을 억지로 5개의 좁은 Column로 압축하지 않고 Focus Mode를 사용한다 (§50F.24).

---

## 50F.6 Horizon과 Period Anchor는 다른 개념이다

다섯 Horizon 중 Life를 제외한 네 Horizon은 각각 독립적인 캘린더 Period Anchor를 가진다.

개념적으로:

```text
Year  → selected year anchor
Month → selected month anchor
Week  → selected week anchor
Day   → selected day anchor
Life  → no anchor
```

예:

```text
Year  = 2026
Month = 2026-08
Week  = 2026-08-16 시작 주
Day   = 2026-08-17
```

이 네 Anchor는 서로 독립적으로 이전/다음 기간을 탐색할 수 있다.

```text
Year Previous / Next
Month Previous / Next
Week Previous / Next
Day Previous / Next
```

Month를 9월로 이동했다고 Day가 자동으로 9월 날짜로 이동하지 않는다.

각 Column은 자신의 계획 규모를 독립적으로 탐색한다.

---

## 50F.7 Back to Today

Toolbar의 `Back to today`는 네 bounded Horizon Anchor를 현재 날짜 기준 Period로 한 번에 복원한다.

```text
current year
current month
current week
current day
```

로 되돌린다.

Life에는 변화가 없다.

이 Action은 Goal/Task 데이터를 변경하지 않는 순수 UI navigation이다.

---

## 50F.8 GoalSchedule이 Horizon의 Source of Truth다

Goal과 Milestone은 단순히 `deadlineDate - today` 거리로 현재 Column을 결정하지 않는다.

새 Goal/Milestone의 계획 위치는 explicit `GoalSchedule`이 Source of Truth다.

개념:

```text
{ unit: "life" }

{ unit: "year", startDate: "2027-01-01" }

{ unit: "month", startDate: "2026-09-01" }

{ unit: "week", startDate: "...week anchor..." }

{ unit: "day", startDate: "2026-08-20" }
```

같은 날짜라도 Unit이 다르면 의미가 다를 수 있으므로 `unit`을 없애지 않는다.

`targetDate`는 Legacy Compatibility Field일 수 있으나 새 Domain Contract로 되돌리지 않는다.

---

## 50F.9 `schedule`과 `deadlineDate`를 합치지 않는다

Goal의 두 시간 정보는 다른 질문에 답한다.

```text
schedule
= 어느 기간의 계획인가?

deadlineDate
= 언제까지 끝내야 하는가?
```

예:

```text
schedule = September 2026

deadlineDate = 2026-09-25
```

이면:

> 9월에 집중하고 25일까지 끝내야 하는 Goal

이다.

Horizons에서 Column을 이동한다고 deadlineDate를 자동 변경하지 않는다.

---

## 50F.10 Task는 GoalSchedule을 사용하지 않는다

Task는 실행 단위다.

기존:

```text
scheduledDate
startTime
endTime
dueDate
```

를 계속 Source of Truth로 사용한다.

Task의 Horizon placement는:

```text
scheduledDate
→ 없으면 dueDate
→ existing task Horizon derivation
```

으로 계산한다.

즉 Horizons UI를 맞추기 위해:

```text
Task.goalSchedule
Task.horizonId
```

같은 Field를 추가하지 않는다.

---

## 50F.11 Unified Horizon Item

Horizons는 다음 서로 다른 Source를 한 Visual Language로 보여준다.

```text
Goal
Milestone
Task
```

Renderer가 Source마다 완전히 다른 카드 시스템을 만들지 않는다.

개념적으로:

```text
Source Records
   │
   ├── Goal
   ├── Milestone
   └── Task
        ↓
Unified Horizon Item projection
        ↓
Horizon Card
```

이다.

Projection은 View Model이며 별도 DB Entity가 아니다.

---

## 50F.12 Scope 규칙

이번 재설계에서 Horizons Section은 최소한 다음 Scope를 지원한다.

```text
Space
Project
```

### Project Horizons

현재 Project에 속하는 Goal/Milestone/Task만 포함한다.

### Space Horizons

현재 Space 아래 모든 Project에 속하는 Goal/Milestone/Task를 포함한다.

개념적으로:

```text
Hierarchy Scope
      ↓
resolve sources for scope
      ↓
Horizon projection
      ↓
Life / Year / Month / Week / Day
```

이다.

새 Space 도입을 위해 Goal/Task에 `realSpaceId`를 중복 저장하지 않는다.

Project의 Space membership를 통해 Scope를 계산한다.

---

## 50F.13 현재 Legacy `projectId / boardId` 이름 처리

기존 Horizons 구현에는 역사적 이유로 Goal/Item의 업무 영역 관계가 `projectId`, `boardId` 등의 이름으로 표현되어 있을 수 있다.

새 Hierarchy에서는 Domain 의미를 다음처럼 해석한다.

```text
Space
└── Project
    └── Goal / Milestone / Task
```

따라서 Migration 후 Horizons Scope가 필요로 하는 핵심 관계는:

```text
Item → Project
Project → Space
```

다.

이번 문서 때문에 Goal/Milestone/Task에 새로운 Space FK를 중복 추가하지 않는다.

Legacy 이름은 Adapter / Migration Boundary에서 처리한다.

---

## 50F.14 Column Header anatomy

각 Horizon Column Header는 최소한:

```text
Horizon Label
Current selected period label
Visible item count
Previous / Next period controls   // Life 제외
```

를 제공한다.

예:

```text
MONTH
Aug 2026                                      6
‹                                                   ›
```

실제 배치는 기존 Component/Design Token에 맞춘다.

Label과 Period를 합쳐 의미를 잃지 않는다.

```text
Month
Aug 2026
```

처럼 둘 다 읽을 수 있어야 한다.

Life는:

```text
Life
2
```

처럼 Period navigation이 없다.

---

## 50F.15 Column Count

Column Count는 단순히 Horizon ID가 같은 전체 Item 수가 아니다.

bounded Horizon에서는 현재 선택한 Anchor에 해당하는 Item을 기본으로 센다.

현재 Period를 보고 있을 때 visible carryover가 있으면 Column Count는 실제 화면에 보이는 수와 일치해야 한다.

```text
Column count
=
selected-period items
+
visible carryover items
```

Filter/Hide completed가 적용되어 있다면 Count 역시 현재 visible result와 일치시킨다.

---

## 50F.16 Carryover

과거 Period에 놓여 있던 미완료 Goal/Milestone이 현재 기간에서 조용히 사라져서는 안 된다.

현재 Period를 보고 있을 때 기존 Horizon Domain의 Carryover Rule을 사용한다.

예:

```text
Month: Aug 2026

Carryover · 2
├── 7월 미완료 Goal
└── 7월 미완료 Milestone

Current period
├── 8월 Goal
└── 8월 Goal
```

중요:

```text
carryover
= derived visibility
≠ schedule mutation
```

이다.

앱이 사용자를 대신해 7월 Goal의 Schedule을 자동으로 8월로 바꾸지 않는다.

사용자가 명시적으로 현재 기간으로 이동시킬 때만 Schedule을 변경한다.

Task는 기존 Horizon carryover helper의 대상처럼 별도 과거 Goal carryover로 승격하지 않는다.

Task의 overdue/execution 처리는 Task Domain Rule을 따른다.

---

## 50F.17 Card anatomy

Horizon Card는 모든 Source가 같은 Visual Family를 사용하되 실제 가능한 Action은 Source에 따라 달라진다.

기본 구조:

```text
Horizon Card
├── completion control
├── title
├── parent / cascade context(optional)
├── done criteria(optional)
└── metadata/actions
```

예:

```text
[ ] 저널 논문 1편 투고
    연구 설계 완료 기준
    Due Sep 25
```

Milestone이라면 Parent Goal Context를 보여줄 수 있다.

Task라면 실행 업무라는 의미를 보존한다.

Card를 Source마다 완전히 다른 외형으로 만들어 지평 간 관계를 읽기 어렵게 하지 않는다.

---

## 50F.18 Card open / completion interaction

`완료`와 `상세 열기`를 같은 클릭에 겹치지 않는다.

```text
Checkbox / completion control
→ done mutation

Title / card body
→ common Goal Detail or Task Detail
```

Goal/Milestone은 기존 공용 Goal Detail 경로를 사용한다.

Task는 공통 `TaskDetail`을 사용한다.

Horizons 전용 별도 Detail Store를 만들지 않는다.

---

## 50F.19 Horizon 간 Drag — Goal / Milestone

Goal 또는 Milestone을 다른 Horizon/Period로 이동하면 **해당 Source Record의 GoalSchedule을 변경**한다.

예:

```text
Month Sep 2026
    Goal A

Goal A drag
→ Week Sep 13–19

schedule
{ unit: "week", startDate: selectedWeekAnchor }
```

이동 후:

```text
Horizon projection recompute
→ Overview Summary recompute
→ 다른 Horizons surface와 동기화
```

되어야 한다.

Horizon Column 배열 자체를 저장하지 않는다.

---

## 50F.20 Horizon 간 Drag — Task

Task Drag는 Goal/Milestone과 다른 mutation이다.

Task를 허용된 Horizon Period로 이동하면:

```text
scheduledDate
```

를 변경한다.

`dueDate`는 자동 변경하지 않는다.

```text
Task drag in Horizons
= execution planning mutation
≠ deadline mutation
```

이다.

현재 Domain Contract상 Task Drag는 실행에 가까운 지평으로 제한한다.

기본 허용:

```text
Day
Week
Month
```

다음으로의 Task Drag는 제공하지 않는다.

```text
Year
Life
```

이유:

> Task는 장기 방향을 저장하는 Goal이 아니라 실제 실행 단위이기 때문이다.

장기 계획을 Year/Life에 둘 필요가 있다면 Goal/Milestone으로 표현하고 필요한 시점에 Task로 내려온다.

---

## 50F.21 Goal → Milestone → Task 분해는 Drag와 별도다

큰 Goal을 작은 실행 단위로 바꾸는 것과 같은 Record를 다른 기간으로 옮기는 것은 다른 사용자 의도다.

따라서:

```text
Drag
= 같은 Record의 계획 Period 변경

Add Milestone
= Goal을 중간 Goal로 분해

오늘 할 일로 / materialise
= Milestone에서 Task 생성
```

으로 구분한다.

Drag가 암묵적으로 새 Task를 생성하지 않는다.

---

## 50F.22 `+ Goal`과 Header `+ Task`

Horizons Column 내부의 생성 Action은 Goal 계획 문맥이다.

기존 Domain이 지원하면 각 Horizon에서:

```text
+ Goal
```

을 제공할 수 있다.

생성 시 현재 Column의 Horizon/Anchor를 자동 상속한다.

```text
Month Sep 2026에서 + Goal
→ schedule = { unit: "month", startDate: "2026-09-01" }
```

Context Header의 공통 `+ Task`는 그대로 존재할 수 있지만 두 Action의 의미를 섞지 않는다.

```text
+ Goal
= 계획 목표 생성

+ Task
= 실행 업무 생성
```

이다.

---

## 50F.23 `unscheduled` Goal 처리

`unscheduled` Goal은 Horizons Section에 가짜 여섯 번째 Column으로 넣지 않는다.

```text
Unscheduled
→ Board / Goal backlog

Life
→ explicit long-term planning
```

이다.

사용자가 Board에서 Goal을 특정 Horizon으로 계획하면 같은 Goal Record의 Schedule을 변경해 Horizons에 나타나게 한다.

별도 복제 Goal을 만들지 않는다.

---

## 50F.24 Responsive / Focus Mode

### Wide Desktop

핵심 비교 경험을 유지하기 위해 다섯 Horizon을 동시에 표시한다.

```text
Life | Year | Month | Week | Day
```

Column을 읽을 수 없을 정도로 축소하지 않는다.

### Narrow / Mobile

다섯 Column을 5등분해 좁게 압축하지 않는다.

기존 Horizons의 Focus Mode처럼 한 Horizon을 중심으로 보여준다.

예:

```text
[ Life ] [ Year ] [ Month ] [ Week ] [ Day ]
                                      active

DAY
Aug 17
Task...
Task...
```

Narrow 진입 시 기본 Focus는 실행 가능성이 가장 높은 `Day`를 사용할 수 있다.

사용자는 `All Horizons` 또는 Horizon selector를 통해 다른 지평으로 전환할 수 있어야 한다.

정확한 breakpoint는 기존 Horizons responsive token을 우선한다.

현재 구현의 `max-width: 900px` Focus 전환이 유지 가능한지 실제 Shell 폭에서 검증한다.

---

## 50F.25 Horizontal / Vertical Scroll

Wide Desktop의 목표는 다섯 지평의 동시 비교이므로 처음부터 Board처럼 무한 horizontal scroll을 전제로 하지 않는다.

각 Column의 내용이 길면 Page/Content vertical scroll을 사용한다.

```text
Horizontal
= 5-horizon comparison layout 유지

Vertical
= card list growth
```

화면 폭이 부족하면 Column을 계속 좁히거나 가로 Scroll에 의존하기보다 Focus Mode로 전환한다.

---

## 50F.26 Hide Completed

기존 Horizons가 제공하는 `Hide completed`는 보조 Filter로 유지할 수 있다.

이 Control은:

```text
visibility filter
```

이지 completion 상태를 변경하는 기능이 아니다.

Filter를 켜면:

- Card visibility
- Column visible count
- Overview와 연결되는 동일 필터 상태를 공유하기로 한 경우 해당 count

가 일관되어야 한다.

단 Overview 기본 Summary는 별도 사용자 Filter를 영구 상속하기보다 제품이 정한 기본 집계 규칙을 사용한다.

---

## 50F.27 Empty State

각 Horizon은 Item이 0개여도 **Horizon 자체는 사라지지 않는다.**

```text
MONTH
Sep 2026                                      0

아직 이 기간에 계획된 항목이 없습니다.
+ Goal
```

처럼 유지한다.

왜냐하면 빈 Horizon 자체가:

> 이 계획 규모에는 아직 아무것도 배치되지 않았다

는 정보이기 때문이다.

`axisGroupIds(horizon)`와 같은 기존 Engine의 fixed group semantics를 유지한다.

---

## 50F.28 Loading / Error

공통 원칙은 §49A.5를 따른다.

Horizons는 5개 Horizon Header 위치를 유지한 Card skeleton을 사용한다. Goal/Task mutation 실패는 해당 Card interaction 수준에서 복구한다. Period navigation은 local view state이므로 DB write를 만들지 않는다.

## 50F.29 Keyboard / accessibility

공통 기준은 §49A.7을 따른다.

Goal/Milestone은 Action Menu/Detail에서 Horizon을 바꿀 수 있어야 한다. Task는 허용된 `Day / Week / Month` 범위에서 scheduledDate를 비드래그 방식으로 변경할 수 있어야 한다. Column은 Horizon label, Period label, Count를 텍스트로 제공한다.

## 50F.30 View Engine과의 관계

View Engine에 이미:

```text
groupBy: "horizon"
HORIZONS fixed order
PRESET_HORIZONS
presetSpaceHorizons(...)
```

같은 기반이 있다면 이를 재사용한다.

하지만 다음을 구분한다.

```text
Generic View Engine
= Scope / Item / horizon group 공통 projection

Horizons Domain UI
= GoalSchedule period anchor
  carryover
  source별 mutation
  period navigation
```

즉 `groupBy: "horizon"` 하나가 존재한다는 이유로 Horizon-specific Domain Rule을 generic Board grouping으로 재작성하지 않는다.

반대로 Horizon grouping 자체를 별도 Page마다 다시 구현하지도 않는다.

---

## 50F.31 권장 Data Contract

정확한 타입 이름은 Repository에 맞추되 개념적으로 다음 정도를 기대한다.

```text
HorizonsSectionModel {
  scope

  anchors {
    year
    month
    week
    day
  }

  groups [
    {
      id: life | year | month | week | day
      periodLabel
      items[]
      carryoverItems[]
      visibleCount
    }
  ]
}
```

`items[]`는 새로운 DB Entity가 아니다.

기존 Goal/Milestone/Task를 참조하는 canonical Item 또는 HorizonItem projection이다.

---

## 50F.32 Overview Summary와의 관계

Overview Horizons Summary와 Horizons Section은 서로 다른 분류 Rule을 사용하지 않는다.

```text
Current Scope Sources
         ↓
Same Horizon projection
         ↓
┌────────────────────┬────────────────────────┐
│ Overview Summary   │ Horizons Section       │
│ compact 5 counts   │ full cards + anchors   │
└────────────────────┴────────────────────────┘
```

Overview 기본은 Current Anchors를 사용한다.

예:

```text
Life   2
Year   3
Month  6
Week   4
Day    5
```

상세 Section의 Current Anchor로 돌아왔을 때 같은 Scope의 visible count와 모순되지 않아야 한다.

---

## 50F.33 Horizons에서 하지 않을 것

다음은 하지 않는다.

```text
Horizons를 Now / Next / Later로 재정의
Today bucket과 Horizon bucket 공유
Horizon 전용 Task/Goal DB Entity 생성
Life / Year / Month / Week / Day별 복제 Store 생성
GoalSchedule을 dueDate 하나로 축소
Task에 GoalSchedule 강제 추가
Unscheduled를 여섯 번째 visible Horizon으로 표시
Horizon Drag로 Goal의 deadlineDate 자동 변경
Task Horizon Drag로 dueDate 자동 변경
Goal/Milestone Drag에서 Task 자동 생성
Project 이동 시 Horizon Schedule 변경
Space Scope를 위해 Task/Goal에 Space ID 중복 저장
Space용 / Project용 Horizon Domain 로직 복제
각 Horizon별 독립 Component 복제
```

---

## 50F.34 Component decomposition 권장

개념적으로:

```text
HorizonsSection
│
├── HorizonsToolbar
│   ├── HideCompleted
│   └── BackToToday
│
├── HorizonsGrid
│   └── HorizonColumn × 5
│       ├── HorizonColumnHeader
│       ├── CarryoverGroup(optional)
│       ├── HorizonCard × N
│       └── AddGoal
│
└── HorizonFocusMode   // narrow
```

각 Horizon을:

```text
LifeHorizon
YearHorizon
MonthHorizon
WeekHorizon
DayHorizon
```

로 복제 구현하지 않는다.

```text
HorizonColumn(horizon, anchor)
```

하나를 재사용한다.

기존 `HorizonCard`가 있다면 Space/Project Scope에서도 같은 Visual/Interaction Language를 우선 재사용한다.

---

## 50F.35 Horizons visual acceptance criteria

### T-HZ01 — Shell consistency

Sidebar / Context Header / View Bar는 유지되고 Content만 Horizons로 전환된다.

### T-HZ02 — Active tab

`Horizons`만 active state를 가진다.

### T-HZ03 — Five canonical horizons

Desktop 기본 Horizon은 정확히:

```text
Life | Year | Month | Week | Day
```

순서다.

`Now / Next / Later`를 Horizon으로 렌더링하지 않는다.

### T-HZ04 — Fixed perspective

유효 Item이 0개인 Horizon도 사라지지 않는다.

### T-HZ05 — Period anchors

Year / Month / Week / Day는 각자 독립적인 선택 Period를 가진다.

### T-HZ06 — Life has no period navigation

Life에는 Previous/Next calendar period control을 만들지 않는다.

### T-HZ07 — Goal schedule source

Goal/Milestone의 Horizon/Period는 explicit GoalSchedule을 Source of Truth로 사용한다.

### T-HZ08 — Task compatibility source

Task는 GoalSchedule을 만들지 않고 scheduledDate/dueDate 기반 기존 Task rule을 사용한다.

### T-HZ09 — Mixed-source projection

Goal / Milestone / Task가 같은 Horizon presentation model로 표시 가능하다.

### T-HZ10 — Scope consistency

Project Horizons에는 해당 Project Source만, Space Horizons에는 해당 Space 아래 Project Source만 포함된다.

### T-HZ11 — No Space denormalization

Space Horizons 구현을 위해 Goal/Task에 Space membership를 중복 저장하지 않는다.

### T-HZ12 — Carryover

현재 Period에서 과거 미완료 Goal/Milestone은 existing carryover rule에 따라 보일 수 있으며 원래 Schedule은 자동 변경되지 않는다.

### T-HZ13 — Goal drag mutation

Goal/Milestone Drag는 해당 Source의 GoalSchedule을 변경한다.

### T-HZ14 — Task drag mutation

Task Drag는 허용된 Day / Week / Month 범위에서 scheduledDate를 변경하며 dueDate를 변경하지 않는다.

### T-HZ15 — No task promotion to Life/Year

Task를 Life/Year 계획 Goal처럼 Drag해 배치하는 기본 interaction을 제공하지 않는다.

### T-HZ16 — Unscheduled is not a horizon

`unscheduled` Goal은 Life와 구분되며 visible 5 Horizon Grid에 나타나지 않는다.

### T-HZ17 — Detail sharing

Goal/Milestone은 공통 Goal Detail, Task는 공통 TaskDetail을 연다.

### T-HZ18 — No duplication

Horizon 이동을 위해 Goal/Milestone/Task 복제본을 생성하지 않는다.

### T-HZ19 — Overview consistency

Overview의 Life/Year/Month/Week/Day Summary는 동일 Scope와 동일 Horizon projection을 사용한다.

### T-HZ20 — Responsive focus

좁은 화면에서 5 Column을 읽을 수 없게 압축하지 않고 Focus Mode로 전환할 수 있다.

### T-HZ21 — Domain over mockup

시안과 맞추기 위해 GoalSchedule, Task date semantics, carryover, source type의 의미를 변경하지 않는다.

### T-HZ22 — Canonical visual

Wide Desktop에서 최소한 다음 구조가 표현 가능해야 한다.

```text
Header + View Bar
Horizons Toolbar

Life | Year | Month | Week | Day
     period anchors / counts
     carryover where applicable
     unified Horizon Cards
     + Goal
```

---

# 51. Space 수준 Project 표현

Space Overview 또는 기본 화면에는 해당 Space의 Project를 빠르게 확인할 수 있어야 한다.

예:

```
Projects

Drone Delivery       Active
VR Serious Game      Active
Skin AI              Paused

```

Project 클릭 시:

```
/s/:spaceId/p/:projectId

```

Scope로 내려간다.

---

# 52. Project 수준 View

Project를 선택해도 Renderer를 새로 만들지 않는다.

```text
Space Scope   → same View Registry
Project Scope → same View Registry, narrower scope
```

정본은 §16~§18의 Scope Contract와 §49A.2다.
Project 화면에서 별도 Board/List/Gantt/Calendar 구현을 만들지 않는다.

# 53. Folder/List Scope

Folder/List도 동일한 Scope Resolver를 사용한다.
계층을 내려갈수록 **데이터 집합만 좁아지고 View의 의미는 바뀌지 않는다.**

```text
Space → Project → Folder → List
               scope narrows →
```

정본은 §16~§18과 §49A.2다.

# 54. Task 생성 Context

Task 생성 Context의 정본은 **§49A.3**이다.

이 절에서 추가로 강조할 규칙은 하나뿐이다.

> 사용자가 이미 Hierarchy 위치를 선택했다면 Create Modal에서 같은 Context를 이유 없이 다시 묻지 않는다.

View별 추가 mutation(Status/Date 등)은 각 §50A~§50D Contract가 정의한다.

# 55. Task Detail

Task Detail의 정본은 **§49A.4**다.

List / Board / Gantt / Calendar는 모두 동일한 `TaskDetail` surface를 연다.
View별 Detail 구현을 만들지 않는다.

# 56. SpaceTree 변경

`SpaceTree.tsx`는 새로운 구조를 다음처럼 표현해야 한다.

```
Space
└── Project
    ├── Folder
    │   └── List
    └── List

```

하지만 모든 레벨을 항상 펼쳐놓지 않는다.

기본적으로:

```
Space
└── Project

```

중심으로 보여주고 필요할 때 하위 구조를 펼치는 Progressive Disclosure를 적용한다.

---

# 57. Tree UX

계층이 깊어질수록 사용자가 현재 위치를 잃을 수 있다.

따라서 다음을 고려한다.

```
Selected row highlight
Expand / collapse
Project count
Folder/List icon 차이
현재 Scope 유지

```

각 계층의 시각적 차이는 명확하되 과도한 색상으로 구분하지 않는다.

## 57.1 Sidebar hierarchy rendering

Sidebar는 Hierarchy를 별도 화면으로 분리하지 않고 **하나의 연속된 Tree**로 렌더링한다.

기본 렌더링 구조는 다음과 같다.

```
Space                      Level 0
└── Project                Level 1
    ├── Folder             Level 2
    │   └── List           Level 3
    └── List               Level 2

```

즉 같은 Project 안에서 다음 두 구조가 동시에 보여야 한다.

```
Project
├── Folder
│   ├── List
│   └── List
└── Direct List

```

Folder 내부 List와 Project 직속 List를 서로 다른 패널이나 별도 화면으로 분리하지 않는다.

사용자가 Project를 펼쳤을 때 그 Project가 실제로 가지고 있는 Folder/List 관계가 Tree 안에서 바로 보여야 한다.

---

## 57.2 기본 펼침 깊이

초기 Sidebar는 모든 레벨을 펼치지 않는다.

기본 원칙:

```
Space
└── Project

```

까지만 빠르게 탐색할 수 있게 한다.

세부 규칙:

- Space는 최근 상태 또는 persisted expansion state를 복원할 수 있다.
- Project는 기본적으로 collapsed 상태를 허용한다.
- 사용자가 Project를 명시적으로 펼치면 Folder와 Project 직속 List를 노출한다.
- Folder를 펼치면 해당 Folder의 List를 노출한다.
- List는 Sidebar에서 leaf row다.
- Task/Subtask는 이 Tree에 기본 노출하지 않는다.
- 선택된 하위 Scope가 있는 경우 그 Scope까지의 ancestor는 자동으로 펼쳐 현재 위치를 숨기지 않는다.

예:

```
▼ 연구
   ▼ 드론 배송 연구
      ▼ 논문
         선행연구
         방법론
         결과 작성
      ▼ 실험
         공간 측정
         ABM 실행
      일반

   ▸ VR 프로젝트
   ▸ Skin AI 연구

▸ 공부
▸ 개인

```

이 형태를 Sidebar의 기준 Mental Model로 사용한다.

---

## 57.3 Expand / Collapse interaction

Expand 가능한 Entity는:

```
Space
Project
Folder

```

이다.

List는 expand chevron을 갖지 않는다.

권장 interaction:

- Chevron 클릭 → expand/collapse만 수행한다.
- Row 본문 클릭 → 해당 Space/Project/Folder/List Scope로 이동한다.
- Row를 선택했다고 해서 이미 펼쳐진 sibling을 자동으로 닫지 않는다.
- 현재 선택된 Row가 collapsed ancestor 아래로 숨겨지지 않도록 한다.
- Back/Forward 또는 Deep Link 복원 시 선택된 Scope의 ancestor를 자동 expand한다.

Tree의 확장 상태는 Navigation 편의 상태이며 Domain Data가 아니다.

필요하면 Local UI State 또는 현재 Persisted UI State 전략에 저장한다.

---

## 57.4 Indentation and alignment

각 레벨은 동일한 indentation step을 사용한다.

초기 권장 Visual Token:

```
Sidebar width         272px
Sidebar min width     240px
Sidebar max width     360px
Tree row height       32~36px
Indent step           16px
Chevron box           16px
Entity icon           16px
Row horizontal gap     6~8px
Row horizontal pad     8px
Row vertical gap       2px

```

정확한 값은 Design Token으로 관리할 수 있으나, 레벨마다 제각각 다른 들여쓰기를 사용하지 않는다.

정렬 기준은:

```
[Chevron] [Icon] [Label] [Optional meta]

```

로 통일한다.

Leaf인 List는 Chevron 영역을 비워 두거나 placeholder width를 유지하여 부모/자식 label 시작점이 흔들리지 않게 한다.

---

## 57.5 Tree connector

계층 연결선은 필수 Domain 요소가 아니라 Navigation 보조 요소다.

사용할 경우 다음 원칙을 따른다.

- 부모와 자식 관계를 읽기 쉽게 만드는 얇은 neutral connector만 사용한다.
- 선택 상태보다 connector가 더 강하게 보이지 않는다.
- 모든 레벨에 진한 border를 넣어 Tree가 표처럼 보이게 하지 않는다.
- connector를 사용하지 않아도 indentation만으로 계층이 명확하면 생략할 수 있다.

즉 구현 우선순위는:

```
Indentation
→ Chevron
→ Icon
→ Selected state
→ Optional connector

```

이다.

---

## 57.6 Entity icon 규칙

각 Entity는 최소한 형태로 구분 가능해야 한다.

권장 의미:

```
Space     = 업무 영역 icon
Project   = project icon 또는 project custom icon
Folder    = folder icon
List      = list icon

```

색상만으로 Entity 종류를 구분하지 않는다.

예를 들어 Folder가 노란색이 아니어도 Folder icon의 형태로 인식 가능해야 한다.

Space/Project에 custom icon이 있는 경우 이를 우선 사용할 수 있다.

---

## 57.7 Selected / Hover / Focus state

현재 Scope는 Tree에서 한눈에 식별되어야 한다.

### Selected

- Row 전체에 selected background를 적용한다.
- Label 또는 icon에 accent를 사용할 수 있다.
- 텍스트 대비가 충분해야 한다.
- parent와 child가 동시에 selected처럼 보이지 않는다.

### Hover

- Selected보다 약한 neutral/accent background를 사용한다.
- Hover만으로 hierarchy depth를 표현하지 않는다.

### Keyboard focus

- 키보드 탐색 시 focus ring 또는 동등한 focus indicator를 제공한다.
- focus와 selected를 동일 상태로 취급하지 않는다.

---

## 57.8 Project 내부 자식 배치

Project를 펼쳤을 때 Folder와 Project 직속 List가 한 Tree 안에 함께 존재한다.

기본 표시 순서는 다음을 권장한다.

```
Project
├── Folder(s)
│   └── List(s)
└── Direct List(s)

```

즉 Folder를 먼저 묶어 보여주고 Project 직속 List는 그 아래에 표시하면 계층을 빠르게 이해하기 쉽다.

다만 기존 모델에 명시적 `position` 또는 사용자 지정 정렬이 이미 존재한다면 그것을 Source of Truth로 우선한다.

새 UI를 만들기 위해 기존 사용자 정렬을 임의로 깨지 않는다.

---

## 57.9 Label overflow

Sidebar는 폭이 제한되어 있으므로 긴 이름에 대한 규칙이 필요하다.

- 한 Row의 label은 기본적으로 한 줄로 표시한다.
- 폭을 넘으면 ellipsis를 사용한다.
- 전체 이름은 hover tooltip 또는 접근 가능한 title/label로 확인 가능하게 한다.
- 긴 이름 때문에 Sidebar 전체 폭이 자동 확장되지 않는다.
- meta 정보가 있다면 label보다 우선해서 공간을 차지하지 않는다.

예:

```
드론 배송 방식의 공간·기상 조건별 적합성 연구

↓

드론 배송 방식의 공간·기상 조건별 적합성…

```

---

## 57.10 Space 간 시각적 구분

서로 다른 Space는 같은 Tree의 최상위 sibling이다.

Space 사이에는 Project/List 사이보다 조금 더 강한 vertical rhythm을 사용할 수 있다.

하지만 별도 Card로 감싸 Sidebar가 여러 Panel처럼 보이게 하지 않는다.

권장 표현:

```
▼ 연구
   ...

▸ 공부

▸ 개인

```

즉 Space는 시각적으로 구분되지만 Navigation은 하나의 연속된 Sidebar로 유지한다.

---

## 57.11 Sidebar에서 하지 않을 것

다음 구조는 만들지 않는다.

```
Space 클릭
→ 중앙 화면에서 Project 선택
→ 다시 Folder 화면
→ 다시 List 화면

```

Hierarchy 탐색을 위해 매 단계마다 별도 화면을 강제하지 않는다.

또한:

```
Space panel
Project panel
Folder panel
List panel

```

처럼 Sidebar를 여러 column browser로 만들지 않는다.

이번 설계의 기본 Navigation은 **single tree + main content** 구조다.

---

## 57.12 Sidebar visual acceptance criteria

구현 결과는 최소한 다음을 만족해야 한다.

### T-SB01

Space → Project → Folder → List 깊이가 indentation만 보고도 구분된다.

### T-SB02

Project 직속 List와 Folder 내부 List의 parent 관계를 혼동하지 않는다.

### T-SB03

현재 선택된 Scope가 Row highlight로 명확하다.

### T-SB04

Project/Folder를 접었다 펼쳐도 선택된 Scope와 URL Context가 유실되지 않는다.

### T-SB05

Deep Link로 Folder/List에 진입했을 때 필요한 ancestor가 자동으로 펼쳐진다.

### T-SB06

긴 이름이 Sidebar Layout을 밀어내지 않는다.

### T-SB07

Folder와 List가 icon 형태만으로도 구분된다.

### T-SB08

Task가 Sidebar Tree에 중복 노출되지 않는다.

### T-SB09

기본 화면에서 모든 Project의 Folder/List가 한꺼번에 펼쳐져 과밀해지지 않는다.

### T-SB10

다음 형태의 Tree가 별도 예외 코드 없이 표현 가능하다.

```
▼ 연구
   ▼ 드론 배송 연구
      ▼ 논문
         선행연구
         방법론
         결과 작성
      ▼ 실험
         공간 측정
         ABM 실행
      일반

   ▸ VR 프로젝트
   ▸ Skin AI 연구

▸ 공부
▸ 개인

```

---

# 58. Empty State

## Empty Space

```
아직 프로젝트가 없습니다.

이 업무 영역에서 진행할 첫 프로젝트를 만들어보세요.

[ + 프로젝트 ]

```

---

## Empty Project

```
아직 작업이 없습니다.

첫 List 또는 Task를 추가해 프로젝트를 시작하세요.

```

현재 제품 생성 모델에 맞춰 문구와 액션은 조정한다.

---

# 59. Custom Fields / Docs / Whiteboards

ClickUp에 존재한다는 이유만으로 이번 Architecture에 넣지 않는다.

현재 Gap:

```
Custom Fields
Docs collection
Dashboards
Whiteboards
Forms

```

는 별도 기능이다.

이번 재설계의 성공 조건과 무관하다.

---

# 60. 이번 작업의 우선순위

이 절은 **작업 영역(Workstream)과 의존성**을 분류한다.
실제 구현 순서를 다시 정의하지 않는다. **실행 순서의 유일한 정본은 §75**다.

> **§0.3 반영.** Task Views를 한 줄로 묶으면 실제 작업량이 가려진다. `G-RENDER-01`에 따라 **연결(wiring)과 신규 구축을 분리한다.**

| Workstream | 포함 범위 | 선행 의존성 | 이번 범위 |
|---|---|---|---|
| **Debt** | `space:<id>` 태그 소속 제거, 타입 어휘 통일 | — (데이터 변경 0) | **필수, 최선행** |
| Foundation | Space Domain, Project→Space 관계, Migration | Debt + Repository 검증 | 필수 |
| Location | Selection, Routing, Legacy redirect | Foundation | 필수 |
| Scope | Scope Resolver, Canonical Task/Domain projection | Foundation + Location | 필수 |
| Navigation | Section / Task View Registry, Canonical View Bar | Scope 의미 확정 | 필수 |
| Task Views — 연결 | **Board, Gantt** 를 새 Scope에 연결 | Scope + Navigation | 필수 |
| Task Views — 신규 | **List** 구축, **Calendar** Scope 연결 + 재작성 | Scope + Navigation | 필수, **비용 큼** |
| Domain Sections | Overview, Goals, Horizons Scope 연결 | Scope + Navigation | 필수 |
| Sidebar | SpaceTree hierarchy/selection (U2 규칙 보존) | Location + Scope | 필수 |
| Cleanup | Legacy manual rendering/filtering 제거 | 등가성 테스트 통과 | 필수(마지막) |
| Space 수준 Board | Space Scope의 status grouping | `G-STATUS-01` (a) 채택 시 | **OUT OF SCOPE (§0.3.3)** |
| Saved Views / +View | 사용자 저장 View | Built-in 안정화 | **후속** |
| Custom Fields / Docs / Whiteboards | 별도 제품 기능 | 별도 설계 | **후속** |

의존성의 핵심은:

```text
Repository Facts
      ↓
Foundation
      ↓
Location
      ↓
Scope
      ↓
Navigation / Views / Domain Sections / Sidebar
      ↓
Equivalence Tests
      ↓
Legacy Cleanup
```

이다.

`Saved Views`가 Built-in View 연결보다 먼저 오거나, Cleanup이 등가성 검증보다 먼저 오는 순서는 허용하지 않는다.

# 61. 구현 전에 Repository에서 반드시 확인할 것

코드를 수정하기 전에 다음을 조사한다.

```
Project model
Folder model
List model
Task model
children/subtask model

Project ↔ Folder
Project ↔ List
Folder ↔ List
List ↔ Task
Task 생성 시 필수 ownership
Project의 default/selected List 규칙

현재 spaceId의 실제 의미

spaceSelection.ts

현재 URL 구조

ViewSpec
applyView()
View presets
Board renderer
Status definition ownership/order   // global / project / list 확인
List renderer
Table renderer        // List가 재사용 가능한 내부 capability인지 확인
TimelinePage
Timeline start-only / due-only / no-date semantics
Calendar
Calendar canonical dateField / read-write mutation field

Goals
Horizons

Space delete/archive mutation 존재 여부
Supabase FK delete policy / cascade 여부
Supabase schema
Migration order
Local persisted state

space:<id> 태그 소속 경로            // G-TAG-01. Space Entity 도입 전 제거
listsRevealed 단방향 노출 규칙 (U2)   // SpaceTree 확장 시 보존 여부
타입 어휘 중복                        // ProjectType / SpaceType / SpaceHubType
project-space-${id} id 네임스페이스   // SpacesPage 지역 타입
SpaceCustomConfig 저장 위치           // 기기 로컬 blob인지 synced dataset인지

```

추측하지 않는다.

> **§0.3 반영.** 위 항목 중 상당수는 2026-08-17에 이미 확인했다. §0.3.1의 CONFIRMED 표와 §0.3.2~§0.3.7의 Gate 해소 결과를 STEP 1의 부분 완료로 인정하고, **남은 항목만 다시 조사한다.** 이미 확인된 사실을 재조사해 다른 결론을 내지 않는다.

---

# 62. Current Architecture Map 작성

구현 전에 실제 코드 기준으로 다음을 출력한다.

```
현재 Hierarchy

현재 Selection

현재 Routing

현재 Board task flow
현재 Status Definition ownership

현재 Timeline task flow
현재 Timeline partial/no-date semantics

현재 Calendar canonical dateField / mutation field

현재 Goals/Horizons navigation

현재 Task create ownership/default List rule
현재 Space delete/archive/FK delete semantics
현재 List.spaceId 의미

```

이 과정 없이 바로 Migration을 작성하지 않는다.

---

# 63. Gap Analysis 분류

Gap Analysis는 하나의 라벨로 끝내지 않는다.

Repository를 확인한 결과와 그 결과에 따른 구현 조치는 서로 다른 질문이므로 **두 축으로 분리**한다.

```text
Axis A — Repository Status
= 실제 코드가 설계 가정과 어떤 관계인가?

Axis B — Implementation Action
= 그 사실을 바탕으로 무엇을 할 것인가?
```

## 63.1 Axis A — Repository Status

각 확인 항목은 먼저 다음 네 상태 중 하나로 분류한다.

```text
CONFIRMED
= Repository가 문서의 가정과 일치한다.

MISMATCH
= 관련 구현은 존재하지만 의미·관계·이름·흐름이 문서 가정과 다르다.

MISSING
= 문서가 필요로 하는 Domain/Flow/Renderer/Adapter가 Repository에 없다.

OBSOLETE
= 기존 구현이 새 Architecture에서는 더 이상 Source of Truth가 아니거나 제거 후보가 된다.
```

이 축은 **사실 판정**이다.

`MISMATCH`라고 해서 반드시 제거하는 것도 아니고, `CONFIRMED`라고 해서 반드시 수정하지 않는 것도 아니다.

---

## 63.2 Axis B — Implementation Action

Repository Status를 확인한 뒤 실제 구현 조치를 다음 Canonical Action으로 분류한다.

```text
KEEP
= 의미와 구현을 그대로 유지한다.

REUSE
= 기존 구현을 다른 Scope/Context에서도 재사용한다.

EXTEND
= 기존 의미를 유지하면서 필요한 관계나 기능을 추가한다.

ADAPT
= Legacy 이름/형식/경계 차이를 Adapter 또는 Compatibility Layer에서 변환한다.

MERGE
= 중복 구현을 하나의 Canonical Path로 합친다.

REMOVE
= 등가성 검증 후 더 이상 필요 없는 Legacy 구현을 제거한다.

ADD
= Repository에 없는 새 Domain/Flow/Component를 추가한다.
```

필요하면 한 항목에 둘 이상의 Action을 순서대로 적용할 수 있다.

예를 들어 `REMOVE + ADD`는 가능하지만, `REPLACE`, `SPLIT`처럼 별도 Canonical Action을 즉석에서 만들지 않는다.

---

## 63.3 기록 형식

Gap Analysis 결과는 최소한 다음 형식으로 남긴다.

```text
Module / Concern        Repository Status    Implementation Action    Evidence / Note
```

예시:

```text
Project model           CONFIRMED            EXTEND                   spaceId 관계 추가 필요
Folder model            CONFIRMED            KEEP                     기존 ownership 유지
List legacy spaceId     MISMATCH             ADAPT                    persistence key와 Domain 의미 불일치
Task model              CONFIRMED            KEEP                     ownership 변경 없음
View Engine             CONFIRMED            REUSE                    기존 renderer/scope 연결 검토
Space entity            MISSING              ADD                      새 최상위 업무 영역 필요
Legacy SPACE_VIEWS      MISMATCH             ADAPT                    Section/Task View 구분 필요
Legacy manual view path   OBSOLETE             REMOVE                   등가성 검증 후 제거 후보
```

하나의 Concern에서 서로 다른 사실 상태가 발견되면 `MISMATCH/OBSOLETE`처럼 합쳐 쓰지 않고 Concern을 분리해 각각 기록한다.

위 예시는 **분류 형식의 예시**일 뿐 실제 Repository 판정을 미리 확정하지 않는다.

## 63.4 적용 원칙

```text
Repository Status
        ↓
Implementation Action
        ↓
Revised Implementation Plan
```

순서를 지킨다.

즉 구현 Action을 먼저 정한 뒤 Repository 사실을 그 결론에 맞추지 않는다.

## 63.5 Gate Resolution 기록

§0.2의 `REPOSITORY CHECK` Gate는 Gap Analysis 결과와 별도로 최종 해소 상태를 기록한다.

```text
Gate              Evidence                         Resolution                         Status
G-STATUS-01       statusDefinitions are global    shared status/order reuse          RESOLVED
G-GANTT-01        timeline due-only = point        existing point renderer reuse      RESOLVED
G-CALENDAR-01     calendar.dateField = dueDate     dueDate read/write 유지            RESOLVED
```

위 값은 형식 예시일 뿐 실제 Repository 결과를 미리 확정하지 않는다.

Gate가 해소되지 않았다면 가능한 상태는 둘 중 하나뿐이다.

```text
RESOLVED
OUT OF SCOPE
```

`아직 모르지만 구현하면서 정함`은 허용되는 상태가 아니다.

---

# 64. 새로운 Entity를 만들기 전 판단 규칙

## Q1

이것이 Domain Data인가 UI State인가?

UI State라면 DB Entity를 만들지 않는다.

---

## Q2

기존 Entity가 이미 같은 의미인가?

그렇다면 이름을 바꾸기 위해 새 Entity를 만들지 않는다.

---

## Q3

이 관계를 부모 Entity 하나의 Foreign Key로 해결할 수 있는가?

가능하면 Task 수천 행에 중복 관계를 저장하지 않는다.

---

## Q4

View가 필요해서 데이터를 복제하려는가?

그렇다면 설계가 잘못되었다.

---

## Q5

사용자가 실제로 이 계층을 관리할 필요가 있는가?

필요가 없다면 추가하지 않는다.

---

# 65. Test — Hierarchy

## T-H01

새 Space 생성 가능.

---

## T-H02

기존 Project를 Space에 연결 가능.

---

## T-H03

Project를 Space A에서 Space B로 이동 가능.

---

## T-H04

Project 이동 후 Folder/List/Task ID가 변하지 않음.

---

## T-H05

Project 이동 시 Task 행 대량 Update가 발생하지 않음.

---

## T-H06

Space A Scope에서 이동된 Project Task가 사라짐.

---

## T-H07

Space B Scope에서는 동일 Task가 나타남.

---

## T-H08

하위 Project가 존재하는 Space의 삭제가 Project/Folder/List/Task Hard Delete로 암묵적 Cascade되지 않음.

---

## T-H09

하위 Project가 있는 Space를 삭제하려 할 때 최소한 삭제가 차단되고 Project 이동 경로가 제공됨. 기존 Archive semantics가 있을 경우 Archive는 비파괴 대안으로 사용할 수 있음.

---

# 66. Test — Selection / Routing

## T-R01

Space Deep Link 새로고침 후 유지.

---

## T-R02

Project Deep Link 유지.

---

## T-R03

Folder/List Deep Link 유지.

---

## T-R04

Back/Forward 정상 작동.

---

## T-R05

기존 Legacy `/s/:projectId` 경로가 올바른 새 경로로 이동.

---

## T-R06

기존 Persisted `selectedSpaceId = projectId`가 새 Selection 구조로 안전하게 Migration됨.

---

# 67. Test — View

## T-V01

Space Board의 Task Set과 Space List의 Task Set이 동일 Scope를 사용함.

---

## T-V02

Board에서 Task 제목 수정.

→ Gantt/List에서도 동일하게 반영.

---

## T-V03

Gantt에서 Due Date 수정.

→ Board Detail에서도 동일하게 반영.

---

## T-V04

Task 삭제.

→ 모든 Task View와 Overview에서 제거.

---

## T-V05

Overview Count.

→ 동일 Scope의 Canonical Task Set과 일치.

---

## T-V06

Space A View에서 Space B Task가 노출되지 않음.

---

## T-V07

Space Scope에서 Task 생성 시 현재 Space와 이미 선택한 Status/Date는 유지되고, Canonical ownership에 필요한 Project/List만 최소한으로 추가 선택함. 다른 Space의 Project를 선택할 수 없음.

---

## T-V08

`G-STATUS-01`, `G-GANTT-01`, `G-CALENDAR-01` 중 해당 View에 필요한 Gate가 미해소 상태이면 임의 Domain semantics를 하드코딩해 구현을 진행하지 않음.

---

# 68. Test — Domain Section

## T-D01

Goals가 Task ViewSpec으로 위장하지 않음.

---

## T-D02

Horizons가 Task View Registry에 포함되지 않음.

---

## T-D03

Overview가 독립 Task Store를 사용하지 않음.

---

## T-D04

Horizons가 `Now / Next / Later` Today bucket을 사용하지 않고 `Life / Year / Month / Week / Day` Domain을 유지함.

---

## T-D05

Goal/Milestone은 GoalSchedule, Task는 기존 실행 날짜를 Source of Truth로 사용하며 두 모델을 하나의 저장 규칙으로 합치지 않음.

---

## T-D06

`unscheduled` Goal은 visible Horizon Column이 아니며 `Life`와 구분됨.

---

# 69. 성능

Space 수준 View는 여러 Project의 Task를 포함할 수 있다.

따라서 다음 구조를 피한다.

```
Space
→ Project 1 query
→ Project 2 query
→ Project 3 query
→ ...

```

현재 Store/DB Architecture에 맞춰 적절한 Query를 사용한다.

하지만 성능 최적화를 위해 Domain 관계를 중복 저장하지 않는다.

먼저 실제 병목을 확인한다.

---

# 70. Backward Compatibility

이번 변경은 구조적으로 큰 의미 변경을 포함한다.

특히:

```
space

```

라는 단어가 기존에는 Project와 사실상 동의어였다면 이제 실제 `Space` Entity를 의미한다.

따라서 아래 Legacy 영역을 명시적으로 식별한다.

```
DB column names
localStorage keys
URLs
preset names
component props
functions
tests

```

모든 이름을 한 번에 Rename하지 않는다.

Persistence/Compatibility Boundary를 두고 단계적으로 전환한다.

---

# 71. Non-goals

이번 작업에서는 다음을 하지 않는다.

```
Workspace Entity 추가

Subfolder 추가

무제한 Nested Folder

Task DB 재설계

Project를 Folder로 Rename

Folder를 Subfolder로 Rename

Space 전용 Board Engine 작성

Space 전용 Gantt Engine 작성

Gantt 전용 Task 데이터 생성

모든 Layout 즉시 노출

내부 `table` layout이 있다는 이유만으로 독립 Table View 노출

Saved Views를 Built-in View와 동시에 구현

Custom Fields 추가

Docs 시스템 재설계

Dashboard 추가

Whiteboard 추가

Form 추가

Permission 시스템 추가

Space 삭제 시 Project/Folder/List/Task의 명시적 Cascade Delete 기능

ClickUp 전체 복제

```

---

# 72. 완료 후 기대되는 Mental Model

사용자는 제품을 다음처럼 이해할 수 있어야 한다.

```
Space
= 어떤 업무 영역인가?

Project
= 무엇을 끝내려는가?

Folder
= 프로젝트 안을 어떻게 정리할까?

List
= 어떤 종류의 작업 묶음인가?

Task
= 지금 실제로 무엇을 해야 하는가?

```

그리고:

```
Overview
= 지금 전체 상황은?

Board
= 지금 어떤 상태인가?

List
= 어떤 작업들이 있는가?

Calendar
= 언제 해야 하는가?

Gantt
= 어떤 순서와 기간으로 진행되는가?

Goals
= 무엇을 달성하려는가?

Horizons
= Life / Year / Month / Week / Day 중 어느 계획 지평과 기간에서 바라보는가?

```

로 구분되어야 한다.

---

# 73. 최종 Architecture

```
                       APPLICATION
                           │
                    implicit Workspace
                           │
               ┌───────────┴───────────┐
               │                       │
             SPACE                   SPACE
          업무 영역                   업무 영역
               │
       ┌───────┴────────┐
       │                │
    PROJECT          PROJECT
       │
       ├───────────────┐
       │               │
    FOLDER          LIST
   optional            │
       │              TASK
      LIST              │
       │             SUBTASK
      TASK
       │
    SUBTASK

```

그리고 View Architecture는:

```
                    HIERARCHY LOCATION
                           │
                           ▼
                    SCOPE RESOLVER
                           │
                           ▼
                    CANONICAL TASKS
                           │
        ┌──────────────────┼──────────────────┬──────────────────┐
        │                  │                  │                  │
        ▼                  ▼                  ▼                  ▼
      LIST               BOARD            CALENDAR            GANTT
        │                  │                  │                  │
        └──────────────── identical canonical data ─────────────┘

```

`LIST`는 내부적으로 기존 `table` layout/renderer 또는 `TaskTable` primitive를 사용할 수 있지만, `TABLE`을 별도의 사용자 View로 의미하지 않는다.

Space의 전체 화면 구조는:

```
                           SPACE
                             │
            ┌────────────────┴─────────────────┐
            │                                  │
       DOMAIN SECTIONS                    TASK VIEWS
            │                                  │
       ├── Overview                        ├── List
       ├── Goals                           ├── Board
       └── Horizons                        ├── Calendar
                                           └── Gantt

```

이다.

---

# 74. 구현 판단 우선순위

> 이 절은 **어떤 설계 선택이 더 중요한가**를 정한다. 작업 순서는 §75가 정한다. §60의 Workstream 분류와도 목적이 다르다.

충돌이 생기면 다음 순서로 판단한다.

```
1. 기존 데이터 보존
2. Domain 의미의 명확성
3. Single Source of Truth
4. Hierarchy 이동 비용 최소화
5. 기존 Engine 재사용
6. Backward Compatibility
7. 사용자에게 노출되는 복잡성 최소화
8. 코드 변경량 최소화

```

`코드를 덜 바꾸는 것`보다 `도메인 의미를 계속 틀리게 유지하지 않는 것`을 우선한다.

다만 저장 포맷 호환을 위해 Legacy 이름을 유지해야 한다면 Adapter Boundary에서 격리한다.

---

# 75. 구현 순서

바로 코딩하지 않는다.

이 절은 실제 실행 순서의 유일한 정본이다.

특히 **Domain Sections / Sidebar를 생략한 채 Cleanup으로 넘어가거나, Equivalence Test 전에 Legacy 구현을 제거하는 순서는 허용하지 않는다.**

## STEP 1 — Inspect

§61의 Repository 확인 체크리스트를 실행한다. 여기서 얻은 사실이 문서의 추정보다 우선한다.

## STEP 2 — Architecture Map

§62 형식으로 현재 Hierarchy / Routing / Selection / View flow를 코드 기준으로 작성한다.

## STEP 3 — Validate Assumptions

§63의 2축 Gap Analysis를 실행한다.

먼저 각 항목의 Repository Status를:

```text
CONFIRMED / MISMATCH / MISSING / OBSOLETE
```

로 판정한 뒤, 그 사실에 근거해 Implementation Action을:

```text
KEEP / REUSE / EXTEND / ADAPT / MERGE / REMOVE / ADD
```

중 하나 또는 필요한 조합으로 지정한다.

문서 예시를 실제 코드에 억지로 맞추지 않는다.

동시에 §0.2의 `REPOSITORY CHECK` Gate에 필요한 Evidence를 수집한다.
특히 `G-CTX-01`, `G-STATUS-01`, `G-GANTT-01`, `G-CALENDAR-01`의 실제 Source of Truth를 확인한다.

## STEP 4 — Revised Implementation Plan

§61~§63 결과를 반영해 변경 파일, Migration, Compatibility, 추가/삭제 후보를 확정한다.

이 단계에서 Gate Resolution Table도 함께 확정한다.

```text
Gate
Evidence
Resolution
Status = RESOLVED | OUT OF SCOPE
```

해당 기능 구현 단계에 필요한 Gate가 `REPOSITORY CHECK` 상태로 남아 있으면 그 기능 구현으로 넘어가지 않는다.
이후 STEP 5부터 실제 변경에 들어간다.

## STEP 4.5 — Debt 정리 (§0.3.7, §0.3.8) — 완료 (2026-08-17)

Space Entity를 만들기 전에 소속 판정과 이름을 하나로 줄인다. **데이터 변경이 없으므로 되돌리기 싸고, 이후 모든 단계가 여기에 의존한다.**

이 단계를 건너뛰고 STEP 5로 가면 소속 판정이 네 벌이 된다.

### 결과

```text
G-TAG-01        space:<id> 태그 소속 제거        도달 불가 코드였다. 태스크 재작성 0
                getSpaceTasks(tasks, projectId)  기존 태그 문자열은 무해하므로 남긴다
                spaceSelectors.test.ts 신설      규칙이 되돌아오지 않도록 고정

타입 어휘        SpaceType / SpaceHubType 삭제    ProjectType 한 벌로 통일
                "personal" 프리셋 삭제            생성 경로가 없던 세 번째 프리셋
                "custom" -> "area"               저장된 값과 키를 일치시킴
                getSpaceSignal의 type 인자 삭제   분기가 하나뿐이었다

id 네임스페이스   project-space-${id} 제거         공간 id = Project id
                Space.sourceId / sourceRef 삭제  같은 값을 두 이름으로 들고 있었다
                DeleteSpaceConfirmModal 정리     isProject/isStudy 세 갈래 -> 한 갈래
                useSpaceHubData 로드 시 키 정규화 기기 로컬 blob, 1회 재작성
```

검증: typecheck 통과, 테스트 616개 통과. 실제 앱에서 레거시 접두어로 저장된 설정·활동이 새 id로 이어지는 것과, 레거시 태그를 단 다른 Project의 태스크가 섞이지 않는 것을 확인했다.

**남은 판단 하나.** `spaces.type.area`의 표시 문구는 "커스텀"/"Custom" 그대로 두었다. 키는 저장 값에 맞췄지만, 라벨을 "영역"/"Area"로 바꾸는 것은 제품 결정이라 손대지 않았다.

---

## STEP 5 — Hierarchy Migration — 완료 (2026-08-17)

Space → Project 관계부터 완성한다.

### 무엇이 생겼는가

```text
types.ts               Space 레코드 + Project.spaceId (optional)
domain/spaces/spaces.ts  Space 레코드와 Project→Space 관계의 소유자
                       sanitizeSpace / activeSpaces / projectsInSpace
                       spaceIdForProject / canDeleteSpace
                       ensureDefaultSpace / backfillProjectSpace
                       addSpace / patchSpace / archiveSpace / moveProjectToSpace
008_spaces.sql         id/user_id/data jsonb — 다른 컬렉션과 같은 형태
buildSyncPlan          collectionTables + optionalRemoteTables 등록
usePlannerData         로드 시 M2/M4 마이그레이션, createSpace 등 액션 4개
```

`domain/spaces/hierarchy.ts`에 넣지 않은 이유: 그 모듈은 *"Nothing here reads Task or Project"* 를 명시한다. Project를 쓰는 backfill이 그 경계를 깬다.

### 재작성 예산 — 실측

STEP 5 이전 저장소(= `spaces` 키 없음, `Project.spaceId` 없음)로 앱을 띄워 확인했다.

```text
생성   Space 1개 (space-default, "My Space")
수정   Project N개 — spaceId 부여. updatedAt은 건드리지 않음
불변   Task · List · Folder · Subtask — 0행

재실행 멱등: 두 번째 로드에서 Space가 1개 그대로
빈 계정: 아무것도 만들지 않음 (Project가 생길 때 함께 생긴다)
```

`updatedAt`을 올리지 않는 것은 의도다. 사용자가 편집한 것이 아니므로, 올리면 첫 실행에 모든 Project가 "최근 업데이트" 맨 위로 올라가 마이그레이션이 스스로를 광고하게 된다.

### FK를 만들지 않은 이유

`projects.space_id` 컬럼 + FK 대신 `spaceId`를 기존 `projects.data` jsonb 안에 둔다. 모든 컬렉션이 jsonb 레코드로 저장되므로 관계도 레코드가 사는 곳에 둔다. 컬럼+FK는 스키마 유일의 교차 테이블 제약이 되고, **두 테이블이 계정에 도달하는 순서가 어긋나면 평범한 저장이 실패한다.** H-INV-06(Project를 가진 Space는 삭제 불가)은 이유를 설명할 수 있는 클라이언트에서 강제한다.

### `Project.spaceId`가 유일한 M0 의존 지점

이 마이그레이션이 만드는 다른 컬렉션은 전부 신규라 구버전 클라이언트가 건드리지 않는다. `spaceId`만 **이미 동기화되는 레코드에 얹히는 필드**이고, 구버전이 Project를 되쓸 때 이 필드를 지우지 않게 막는 것은 M0 passthrough뿐이다. `forwardCompat.test.ts`가 이 한 지점을 지킨다.

### 검증

typecheck 통과, 테스트 **640개** 통과 (spaces 도메인 22, sync 2, forwardCompat 2 신규).

### 이 단계가 하지 않은 것

라우팅·트리·Scope는 STEP 6/7/11이다. `createSpace`/`moveProjectToSpace`는 아직 호출자가 없다 — Folder/List 액션이 P3에서 그랬듯, 컬렉션에 처음부터 주인을 하나 두기 위해 먼저 존재한다.

---

## STEP 6 — Routing / Selection — 완료 (2026-08-17)

Hierarchy Location의 의미를 맞춘다.

### Selection 모델

§35의 `HierarchySelection`을 기존 `Selection`을 확장해 구현했다. 새 병렬 시스템을 만들지 않았다(§18).

```ts
| { kind: "none" }
| { kind: "space";   spaceId }
| { kind: "project"; spaceId, projectId }
| { kind: "folder";  spaceId, projectId, folderId }
| { kind: "list";    spaceId, projectId, listId }
```

조상을 함께 들고 다니는 이유는 트리가 아무것도 조회하지 않고 올바른 가지를 열 수 있어야 하기 때문이다.

### Route

```text
/s/:spaceId
/s/:spaceId/p/:projectId
/s/:spaceId/p/:projectId/f/:folderId
/s/:spaceId/p/:projectId/l/:listId
```

### 레거시 해소 (§33) — 파싱과 조회를 분리한다

옛 스킴은 첫 칸에 **Project id**를 담았다. 세 가지 모양 중 둘은 경로만으로 구분된다 — 옛 route는 첫 id 뒤에 바로 `f`/`l`이 오고, 새 route는 `p`가 먼저다. 남는 `/s/:id` 하나만 진짜 모호하다.

```text
/s/X/f/Y  /s/X/l/Y   →  구문만으로 레거시로 판정. spaceId를 비워 파싱
/s/X                 →  모호. 컬렉션만이 X가 Space인지 Project인지 안다
```

그래서 `parseSelection`은 순수·구문 전용으로 남기고, `resolveSelection(selection, {spaces, projects})`이 조회를 맡는다. **해소는 항상 승격이며 절대 버리지 않는다** — 첫 렌더에는 컬렉션이 비어 있고, 여기서 "없음"을 답하면 사용자가 방금 따라온 딥링크를 잃는다. 데이터가 도착하면 memo가 다시 돌아 채운다.

주소창은 해소 직후 새 스킴으로 `replace`한다. `push`가 아닌 이유는 Back이 사용자가 온 곳으로 가야지 방금 따라온 링크로 가면 안 되기 때문이다.

### `filterForSelection`의 경계

`ViewFilter.spaceId`는 **아직 Project id를 담는다.** 필터 언어를 옮기는 것은 STEP 7이므로, Project 선택이 그 칸을 채우고 **Space 선택은 아무것도 좁히지 않는다.** 지금 여기서 Space 스코프를 만들어내면 같은 결정이 두 곳에 생긴다.

### 검증

typecheck 통과, 테스트 **650개** 통과 (selection 19개로 확장). 실제 앱에서:

```text
/s/p1              → /s/space-default/p/p1                  (레거시 최상위)
/s/p1/l/list-x     → /s/space-default/p/p1/l/list-x         (레거시 List)
트리 클릭          → 새 스킴으로 기록, 정확히 한 행만 선택
새로고침           → 딥링크·선택·분기 펼침 유지
Back               → /app (레거시 승격이 히스토리에 남지 않음)
```

도중에 회귀 하나를 만들고 고쳤다: 트리의 초기 펼침 집합이 `selection.spaceId`로 키잉돼 있었는데, 그 값이 이제 Space를 가리켜 Project id 키와 영원히 어긋났다. `selectedProjectId(selection)`으로 교정.

### 이 단계가 하지 않은 것

Space 수준 화면은 없다. `/s/:spaceId`는 유효한 경로이고 선택도 되지만, 그 스코프를 그리는 것은 STEP 7(Scope)과 STEP 10(Domain Sections)이다. 트리 행도 여전히 Project다 — 위에 Space 레벨을 얹는 것은 STEP 11이다.

---

## STEP 7 — Scope — 완료 (2026-08-17)

새 계층을 기존 View Engine과 연결한다.

### 어휘 교정 — `spaceId`가 Project를 뜻하던 곳

STEP 7의 본체는 새 기능이 아니라 **한 단어가 두 가지를 뜻하던 것을 가르는 일**이다.

```text
Item.spaceId       Project id  →  실제 Space (Project를 통해 파생)
Item.projectId     (없음)      →  신규
ViewFilter.spaceId Project id  →  실제 Space
ViewFilter.projectId (없음)    →  신규
GroupAxis "space"  Project 축  →  실제 Space 축
GroupAxis "project" (없음)     →  신규
```

한 id로는 Space 스코프를 표현할 수 없다 — **여러 Project를 모아야 하는데 그게 레벨의 존재 이유다.**

### Scope Resolver (§17)

`filterForSelection`이 네 단계를 모두 표현한다. 각 단계는 **정확히 한 필드만** 이름 붙이고, 가장 좁은 것이 답 전체다.

```text
space   → { spaceId }      Item이 자기 Project를 통해 해소
project → { projectId }
folder  → { folderId }
list    → { listId }
```

이것이 모든 뷰가 각자 쿼리를 쓰지 않고 하나를 공유하게 하는 지점이다(§44). 화면은 layout을 고르고, 이쪽이 레코드를 고른다.

### 비정규화하지 않는다 (§43)

`Item.spaceId`는 **파생값이며 저장되지 않는다.** Project 관계를 통해 계산한다.

```text
Project.spaceId  →  Item.spaceId
```

복사본을 Task마다 두면 (1) 어긋날 수 있는 것이 하나 늘고 (2) **Project를 다른 Space로 옮길 때 그 아래 모든 Item을 다시 써야 한다** — H-INV-05가 금지하는 바로 그것이다.

### 고친 의미 오류

`spaceId`가 Project를 뜻한다는 전제로 쓰인 곳들:

```text
calendarItems      프로젝트 필터·색 조회 → item.projectId
                   (안 고쳤으면 Space id로 조회해 전부 색을 잃는다)
TimelinePage       스코프 필터·그룹 축·라벨 → project
BoardPage          filter.projectId
SpaceDetailView    Project 수준 화면임을 주석에 명시
activeSpaces       → activeProjects (실제로 Project 목록이었다)
timeline.axis.space → timeline.axis.project
```

### 검증

typecheck 통과, 테스트 **654개** 통과. Space 스코프 전용 스위트를 새로 추가했다 — 한 Space 아래 두 Project + 다른 Space의 Project 하나로, 이전 모델이 표현할 수 없던 경우다.

실제 앱(Space 2 · Project 3):

```text
/s/sp-research         → Space 선택 유지 (화면은 STEP 10)
/s/sp-research/p/p1    → p1의 태스크만
타임라인               → 프로젝트 축 3그룹, 스코프 picker에 Project 3개
캘린더                 → 태스크마다 자기 Project 색 (#0066cc / #5856d6 / #f97316)
```

캘린더 색이 결정적 증거다 — `item.spaceId`를 남겼다면 `projectById.get()`이 Space id로 조회해 전부 실패했을 것이다.

### 범위 밖에서 발견한 것

캘린더 좌측 사이드바의 프로젝트 표시 토글이 **기록만 되고 실제로 가리지 않는다.** `projectFilter`가 `"all"`로 하드코딩돼 있고(이 작업 이전부터), 토글은 카테고리 경로를 타는데 `categoryId`가 빈 태스크가 기본 카테고리로 떨어진다. 이 재설계와 무관하며 별도 작업으로 분리했다.

### 이 단계가 하지 않은 것

Space 수준 **화면**은 없다. 스코프는 해소되지만 그릴 곳이 STEP 10이다. Space 축으로 묶는 picker도 아직 없다 — 지금 picker는 Project를 나열하므로 "project" 축이 맞다.

---

## STEP 8 — Navigation Registry — 완료 (2026-08-17)

Section과 Task View를 내부적으로 분리하고 §14의 Canonical View Bar와 연결한다.

### 분류를 타입으로 옮겼다

`domain/view/spaceNav.ts` 신설. §13의 두 종류가 판별 유니온이 된다.

```ts
type SpaceNavItem =
  | { kind: "section";   id: "overview" | "goals" | "horizons" }
  | { kind: "task-view"; id: SpaceViewId }
```

`BuiltInTaskViewId`는 `SpaceViewId`에서 **파생**한다 — 두 목록이 어긋날 수 없다. 테스트가 그것도 지킨다.

### `SPACE_VIEWS`에서 Section을 뺐다

이전에는 `goals`가 `layout: "board"`, `horizons`가 `layout: "board"`로 view 테이블에 있었다. **Goal은 Task를 다르게 읽은 것이 아니라 자기 Source of Truth를 가진 다른 레코드다**(§26, §27.2). `layout`을 준다는 것은 엔진이 답하지 않는 질문에 답한다고 주장하는 것이다.

테이블은 이제 §25의 Task View 넷만 담는다.

```text
list     none   / list      task+goal
board    status / board     task
gantt    none   / timeline  task+goal+milestone
calendar none   / timegrid  task
```

넷 다 선언하되 렌더러가 붙은 것은 `board`뿐이다. `PENDING_TASK_VIEWS`가 나머지를 바에서 가린다 — **아무것도 그리지 않는 탭은 없는 탭보다 나쁘다.** STEP 9가 하나씩 연결하며 이 집합을 비우고, 마지막에 집합 자체가 사라진다.

### 사용자에게는 한 줄이다 (§14)

내부 분류는 코드용이지 독자에게 넘길 판단이 아니다. 두 번째 네비게이션 행을 만들지 않고, active는 정확히 하나다. 순서는 `SPACE_NAV` 한 곳에만 적혀 있고 화면은 active id만 지정한다.

`navItemsForScope`가 스코프별 차이를 낸다 — **항목이 빠질 뿐 순서는 바뀌지 않는다.** 테스트가 이 불변을 검사한다.

### 임시로 남긴 것

Goals·Horizons의 실제 화면은 §50E·§50F이고 STEP 10이 만든다. 그때까지 두 섹션은 지금의 보드 렌더링을 유지하되, 그 spec을 **view 테이블이 아니라 화면 안에** 적어두었다. 차이는 장식이 아니다 — 화면은 임시 형태를 가질 수 있지만, 레지스트리의 한 줄은 엔진이 무엇을 담는지에 대한 주장이다.

### 검증

typecheck 통과, 테스트 **664개** 통과 (spaceNav 10개 신규). 실제 앱에서 세 탭이 이전과 동일하게 렌더된다.

```text
개요 · 보드 · 목표 · 지평     바가 registry에서 생성, active 정확히 하나
보드                          상태 5컬럼, 태스크만 (목표 없음)
목표                          상태 컬럼, 목표만 (태스크 없음)
지평                          평생/올해/이번 달/이번 주/오늘 5컬럼
?view=goals                   딥링크 유지
```

---

## STEP 9 — Built-in Task Views — List 완료 (2026-08-17)

### List (§50A)

`components/TaskListView.tsx` 신설. §0.3.2에서 확인했듯 재사용할 table renderer가 없어 신규 구축이다.

**툴바가 곧 spec이다.** group / sort / search 컨트롤이 각각 `groupBy` · `sort` · `filter.query`를 바꾸고 같은 엔진이 다시 답한다. 손으로 거르거나 정렬하는 코드가 없다.

검색은 `ViewFilter.query`로 **필터 언어에 넣었다**(§50A.13이 "Filter는 ViewSpec.filter 규칙을 사용한다"고 못박는다). 화면이 따로 하는 단계가 아니라 술어이므로, 스코프가 먼저 좁히고 검색이 그 나머지를 좁힌다 — 검색 결과에 스코프 밖 Task가 섞이지 않는 이유다(§50A.15).

**Assignee 컬럼은 없다.** Task에 담당자 필드가 없고, §50A.25가 목업을 맞추려고 없는 필드를 만들지 말라고 한다. T-LV04의 "지원되는 Domain Field 기준" 조항을 따른다.

상태 쓰기만 별도 콜백(`onSetStatus`)이다. 상태는 평범한 필드가 아니라 — 기본 상태는 `status`를 쓰고 `statusId`를 비우며 사용자가 만든 상태는 그 반대 — 그 규칙은 `statusPatch`가 소유한다. 목표·마일스톤 행은 읽기 전용이다. 목표의 컬럼은 `boardListId`라는 다른 쓰기이고, **아무 일도 안 하는 편집기를 절반만 붙이는 것은 라벨보다 나쁘다.**

### 검증 — §50A.27

```text
T-LV01  Shell 유지, Content만 교체            ✓
T-LV02  View Bar에서 List만 active            ✓
T-LV03  Group | Sort | Search 한 행           ✓ (Filter/Display는 후속)
T-LV04  작업 → 리스트 → 상태 → 마감일 → 우선순위  ✓ (Assignee 제외, 위 참조)
T-LV05  compact row, card 아님                 ✓ 행 높이 38px
T-LV06  현재 Project의 Task만                 ✓
T-LV07  List 수정이 Board에 반영               ✓ 문헌 검토 할 일 → 진행 중
T-LV08  공통 TaskDetail로 연결                ✓
T-LV09  Search가 Scope 안에서만               ✓ 4개 중 1개 표시
T-LV10  생성이 Project/List Context 상속       ✓ List 스코프에서 listId 상속
T-LV11  좁은 화면에서 압축하지 않음            ✓ 보조 컬럼만 접힘, 본문 가로 스크롤 없음
T-LV12  Header + Bar + Toolbar + Table + Count ✓
```

typecheck 통과, 테스트 **667개** 통과. `PENDING_TASK_VIEWS`에서 `list` 제거.

### 아직 안 한 것

Filter 컨트롤(§50A.13)과 Display/column settings(§50A.6)는 붙이지 않았다. Bulk action(§50A.12)은 선택 상태만 있고 동작은 없다 — §50A.12가 "지원하지 않는 Bulk Action을 UI를 맞추려고 추가하지 않는다"고 한다.

---

### Gantt (§50C) — 완료 (2026-08-17)

List와 성격이 다르다. 이건 **진짜 wiring**이었다.

**두 번째 타임라인을 만들지 않았다.** `TimelinePage`에서 스코프에 무관한 부분 — 윈도우·줌·이동·미기간 트레이·span 드래그 — 을 `TaskGanttView`로 뽑고, 전역 페이지와 Space 화면이 **같은 컴포넌트를 마운트**한다(§50C.29). 페이지에 남은 것은 그 페이지에 관한 것뿐이다: 어느 Project로 좁힐지, 어느 축으로 묶을지.

날짜 의미는 여기서 정하지 않는다. `spanForItem`이 이미 소유한다(`G-GANTT-01`, §0.3.5) — 날짜가 하나라도 있으면 막대가 생기고, 없으면 그리드에서 빠지며, 추론된 시작일은 표시하되 저장하지 않는다.

**`groupBy`를 `"none"`에서 `"list"`로 바꿨다.** §50C.20은 행이 자기 List를 식별할 수 있어야 한다면서 flat rows + List column을 선호한다. 그런데 타임라인 행에는 컬럼이 없다 — 라벨과 막대뿐이다. 그래서 그 컨텍스트가 살 수 있는 곳은 그룹 헤딩이고, **공유 행을 호출자 하나 때문에 넓히는 것보다 엔진의 축을 쓰는 편이 낫다.**

### 검증 — §50C.31

start+due · due-only · no-date · dependency 네 경우를 모두 태웠다.

```text
T-GV02  Gantt만 active                        ✓
T-GV03  왼쪽 라벨 + 오른쪽 타임라인            ✓
T-GV05  기간에 맞는 위치와 길이                ✓
T-GV06  날짜 없는 Task에 가짜 날짜 안 만듦     ✓ "기간 없음 (1)" 트레이로
T-GV07  Today indicator                        ✓
T-GV10  교차 뷰 동기화                         ✓ 리스트에서 마감일 변경 → 막대 1열 → 4열
T-GV11  실제 Dependency만 connector로          ✓ connector path 2개
T-GV13  공통 TaskDetail                        ✓
§50C.20 행이 자기 List를 식별                  ✓ 그룹 헤딩 "문헌" / "실험"
```

전역 타임라인 페이지도 리팩터 후 동일하게 동작한다 — picker 2개, 줌, 그룹, 트레이 모두 유지.

**직접 확인하지 못한 것:** 막대 드래그/리사이즈(T-GV09)는 HTML5 drag-and-drop이라 시뮬레이션하지 못했다. 배선은 확인했고(`draggable="true"`, `onUpdateTask` 전달) 쓰기 규칙 `patchForSpanDrag`는 단위 테스트가 덮는다.

---

### Calendar (§50D) — 완료 (2026-08-17)

셋 중 결합도가 가장 높아 보였는데, **재사용할 것과 버릴 것의 경계가 오히려 제일 분명했다.**

`calendar/MonthView`는 7열 그리드에 compact chip과 `+N` 오버플로까지 갖춘 **순수 렌더러**다(164줄). `buildCalendarItems`는 Task를 그 날짜가 버는 chip으로 이미 펼친다. `TaskCalendarView`는 이 둘을 스코프에 마운트할 뿐이고, 그게 Calendar 페이지와의 차이 전부다.

**가져오지 않은 것**은 그 페이지에서 Task가 아닌 모든 것이다 — 외부 캘린더, 집중 세그먼트, 카테고리 관리, 공유. **어느 것도 Item이 아니므로 스코프가 할 말이 없다.**

날짜는 `G-CALENDAR-01`(§0.3.4) 그대로 둘을 분리한다. `scheduledDate`가 드래그 가능한 작업 블록이고 `dueDate`는 읽기 전용 마감 마커라, 드롭은 전자만 쓴다. 마커 드래그는 `handleDragStart`에서 막는다 — 마감일을 옮기는 것은 "언제까지"를 바꾸는 것이지 "언제 할지"가 아니다.

Month만 노출한다. §50D.4가 미지원 Mode를 목업 때문에 먼저 만들지 말라고 하고, Week 렌더러는 페이지에 강하게 묶여 있다.

### 검증 — §50D의 T-CV

```text
T-CV02  Calendar만 active                     ✓
T-CV03  7열 월 그리드                          ✓
T-CV04  이전/다음/오늘                         ✓ 8월 → 9월 → 8월
T-CV05  명시된 날짜 필드와 일치                ✓ 예정=블록, 마감=마커
T-CV07  날짜 없는 Task에 가짜 날짜 안 만듦     ✓ 그리드에 없음
T-CV09  +N 오버플로                            ✓ chip 5개 + "+2개 더"
T-CV10  공통 TaskDetail                        ✓
T-CV11  드롭이 Canonical date 변경              ✓ scheduledDate만, dueDate 불변
T-CV12  교차 뷰 동기화                          ✓ 리스트 예정일 정렬 맨 앞으로
T-CV14  좁은 화면에서 본문 가로 스크롤 없음    ✓ 375px
스코프   다른 Project의 Task 안 섞임            ✓
```

`PENDING_TASK_VIEWS`가 비었다. §14의 View Bar 일곱 항목이 모두 실제로 열린다.

### STEP 9 남은 것

Filter·Display 컨트롤(§50A.13/§50A.6), Bulk action(§50A.12), 막대 드래그 실측(T-GV09), Calendar의 Week mode. 그리고 별도 작업으로 뺀 **캘린더 페이지의 프로젝트 표시 토글 결함**은 그대로 남아 있다 — 이 뷰는 그 경로를 쓰지 않는다.

---

## STEP 9 — Built-in Task Views

기존 Renderer를 검증하면서 다음 Task View를 하나씩 연결한다.

```text
List
Board
Gantt
Calendar
```

각 View는 동일한 Scope Resolver와 Canonical Task Set을 사용해야 한다.

STEP 9 진입 전 또는 각 View 구현 전에 다음 Gate를 확인한다.

```text
Space-scope create → G-CTX-01 구현 경로 확정
Space Board        → G-STATUS-01 RESOLVED 또는 Space Board OUT OF SCOPE
Gantt              → G-GANTT-01 RESOLVED
Calendar           → G-CALENDAR-01 RESOLVED
```

Gate가 미해소인 상태에서 Mockup을 맞추기 위해 임시 Domain semantics를 구현하지 않는다.

---

## STEP 10 — Domain Sections — Goals · Horizons 완료 (2026-08-17)

STEP 8이 임시로 남긴 것 — 두 Section이 보드 렌더링을 빌려 쓰던 부분 — 을 교체했다. `sectionSpec` 임시 코드는 삭제됐다.

### Goals (§50E) — 신규

`components/spaces/GoalsSection.tsx`. Active / Completed로 나뉜 1열 카드 스택이다. Goal 하나의 정보량이 커서 대시보드처럼 한 행에 여러 개를 밀어넣지 않는다(§50E.4).

**Progress는 `goalProgress`에서만 온다**(§50E.8 Case A). 마일스톤은 Goal 자신의 구조이므로 그 완료율이 곧 진행률이고, **마일스톤도 연결 작업도 없는 Goal은 바를 아예 그리지 않는다**(Case C). 기간이 얼마나 지났는지로 퍼센트를 만들지 않는다 — T-GL07이 금지하는 바로 그것이다.

바와 숫자를 함께 낸다. 바만으로는 값이 길이에만 실리는데 §49A.7이 그것을 허용하지 않는다.

### Horizons (§50F) — wiring

`HorizonsPage`가 이미 다섯 컬럼·기간 앵커·carryover·드래그를 전부 갖고 있었고, `paths`/`tasks`로 파라미터화까지 되어 있었다. **스코프된 데이터를 넘겨 그대로 마운트한다.**

유일한 차이는 제목이다. §49A.1이 뷰 안의 두 번째 대제목을 금지하므로 `embedded` prop이 `<h1>`을 `<h2>`로 낮추고 부제를 없앤다. 컨트롤은 남는다 — §50F.4의 canonical 배치가 그 줄에 두 컨트롤을 그린다.

이를 위해 `onDeletePath` · `onAddMilestone` · `onDeleteMilestone` · `onCreateTaskFromMilestone` 네 핸들러를 App → SpacesPage → SpaceDetailView로 이었다. **두 번째 Horizons 구현을 만드는 것보다 prop 네 개를 잇는 편이 싸다.**

### 검증

```text
T-GL03  Goals가 Task layout으로 처리되지 않음   ✓ 보드 컬럼 0개
T-GL04  Active / Completed 구분                 ✓ 진행 중 2 · 완료 1
T-GL06  Progress가 Domain에서만                 ✓ 마일스톤 1/3 → 33%
T-GL07  Source 없으면 임의 퍼센트 없음          ✓ 바 자체가 없음
T-HZ02  Horizons만 active                       ✓
T-HZ03  다섯 지평 고정                          ✓ 평생·올해·이번 달·이번 주·오늘
T-HZ04  빈 지평도 사라지지 않음                 ✓ 올해 0 · 오늘 0
T-HZ05  Year/Month/Week/Day가 각자 기간         ✓ ‹ › 앵커
T-HZ06  Life에는 기간 이동 없음                 ✓
T-HZ07  Goal은 GoalSchedule 기준                ✓ month → 이번 달
T-HZ08  Task는 기존 날짜 규칙                   ✓ scheduledDate → 이번 주
§49A.1  뷰 안 두 번째 대제목 없음               ✓ h1 없음
```

typecheck 통과, 테스트 668개 통과.

### Overview (§50) · Space 화면 (§51) — 완료 (2026-08-17)

**둘을 같이 했다.** §50.14가 "Overview를 Space용과 Project용으로 완전히 별도 구현하지 말라"고 하므로, 하나의 컴포넌트에 인자만 다르게 준다.

```text
OverviewSection
├── Summary Row   Open · In Progress · Completed · Overdue   4장 고정
└── Body
    ├── Main      [Projects | Lists] → Recently updated
    └── Aside     Upcoming → Goals → Horizons               순서 고정
```

**Main의 첫 카드만 레벨에 따라 바뀐다** — Space는 Projects, Project는 Lists. 나머지는 같은 컴포넌트가 같은 스코프를 읽는다.

모든 숫자는 호출자가 해소한 Task 집합에서 나온다(§50.4). **자기 쿼리를 가진 Overview는 옆 화면과 다른 말을 할 수 있는 Overview다.**

빈 컨테이너의 진행률은 `—`이지 100%가 아니다(§50.7) — 존재한 적 없는 완료를 보고하는 셈이 된다.

### Space 화면

`/s/:spaceId`가 STEP 6부터 유효한 경로였는데 그릴 것이 없어 카드 목록으로 떨어졌다. 이제 자기 화면이 있다.

Project 화면의 shell과 Overview를 공유하고, 다른 것은 레벨뿐이다 — Main 첫 카드가 Projects이고 **View Bar에서 Board가 빠진다**(§0.3.3).

멤버십은 Project 관계를 통해서만 계산한다(§43, T-HZ11). Task에 Space를 복사해두면 Project 이동이 한 행으로 끝나지 않는다.

### 검증

```text
T-OV02  KPI 4장 한 행                         ✓ 열린 3 · 진행 1 · 완료 1 · 초과 1
T-OV03  Main + Aside, Main이 넓음             ✓
T-OV04  Project → Main 첫 카드가 Lists        ✓ 문헌 · 실험
T-OV05  Space → Main 첫 카드가 Projects       ✓ 드론 배송 연구 · VR 프로젝트
T-OV06  Aside 순서 Upcoming→Goals→Horizons    ✓
T-OV07  Recently updated가 그 아래            ✓
T-OV11  좁은 화면에서 Aside가 아래로, 안 사라짐 ✓ 375px, 순서 유지
§51     Space View Bar에서 Board 제외          ✓ 개요·리스트·간트·캘린더·목표·지평
§51     Project View Bar에는 Board 있음        ✓
```

typecheck 통과, 테스트 668개 통과.

### 미뤄둔 것

§50.8은 List 행 클릭이 그 List로 스코프를 좁히길 원하는데, 그 선택자는 트리가 갖고 있고 이 화면에는 없다. 지금은 List 뷰를 여는 것으로 두었다 — **스코프를 좁혔다고 주장하고 안 하는 클릭보다 실제로 가는 곳이 있는 클릭이 낫다.** 선택자를 내려주는 것이 후속 작업이다.

`SpaceOverviewTab`(다음 행동·시그널·집중 시간)은 더 이상 쓰이지 않는다. §50.15가 Current Focus를 optional로 두므로 삭제 후보이나, 등가성 확인 전까지 남긴다(STEP 13).

---

## STEP 10 — Domain Sections

Task View 연결 뒤 같은 Hierarchy Scope 아래에서 다음 Domain Section을 연결한다.

```text
Overview
Goals
Horizons
```

Overview는 Canonical Task/Domain 집계를 사용하고, Goals/Horizons는 각자의 기존 Domain Source of Truth를 유지한다.

---

## STEP 11 — Sidebar / SpaceTree

Location + Scope가 안정된 뒤 Sidebar를 새 Hierarchy에 연결한다.

```text
Space
└── Project
    ├── Folder
    │   └── List
    └── Direct List
```

기존 `SpaceTree`를 우선 확장하고, 선택된 Scope / URL / ancestor expansion이 서로 어긋나지 않는지 검증한다.

---

## STEP 12 — Equivalence / Regression Tests

Legacy Cleanup 전에 새 경로가 기존 기능과 Domain 의미를 보존하는지 검증한다.

최소한 §65~§68의 Hierarchy / Routing / View / Domain Section 테스트와 각 §50~§50F의 Acceptance Criteria를 확인한다.

특히 다음이 통과해야 한다.

```text
Project 이동 후 하위 ID 유지
Space/Project Scope의 Task Set 정합성
List / Board / Gantt / Calendar 간 Canonical Task 동기화
Overview 집계와 동일 Scope Task Set 일치
Goals / Horizons의 Domain Source of Truth 유지
Deep Link / Back / Forward / persisted selection 정상 동작
Sidebar 선택 상태와 URL Context 일치
Space Scope Task 생성의 최소 Context 상속
Space Board Status ownership 규칙 준수
Gantt/Calendar Gate Resolution과 실제 mutation field 일치
Non-empty Space delete가 하위 Domain을 cascade delete하지 않음
```

등가성이 확인되지 않은 Legacy Path는 제거 대상으로 승격하지 않는다.

---

## STEP 13 — Remove Legacy Duplication

STEP 12를 통과한 경로에 대해서만 기존 수동 Rendering / Filtering / Legacy Navigation 중복을 제거한다.

Cleanup은 기능 구현 단계가 아니라 **검증된 Canonical Path로 수렴하는 마지막 단계**다.

---

# 76. 완료 후 보고 형식

구현이 끝나면 다음을 보고한다.

## 1. 기존 실제 구조

코드 기준 Hierarchy / Routing / Selection / View Flow.

## 2. 설계 문서와 달랐던 점

실제 Repository가 예상과 달랐던 부분.

## 3. 최종 Hierarchy

ASCII Diagram.

## 4. 최종 View Architecture

Section / Task View / Scope 관계.

## 5. DB 변경

Migration별 역할.

## 6. Legacy Compatibility

기존 `spaceId`, Route, Selection을 어떻게 보존했는지.

## 7. 변경 파일

파일별 변경 이유.

## 8. 제거한 중복

기존 수동 Rendering/Filtering 중 제거한 부분.

## 9. 테스트 결과

Hierarchy 이동 및 View 동기화.

## 10. 보류 항목

Saved View, Custom Field 등 이번 범위 밖 기능.

---

# 77. 최종 설계 원칙

이번 재설계의 핵심은 다음 여섯 문장으로 요약한다.

> **Space는 프로젝트가 아니라 여러 프로젝트를 묶는 업무 영역이다.**

> **기존 Project는 실제 프로젝트라는 의미를 유지하며 Folder로 재해석하지 않는다.**

> **Folder는 선택적 정리 수단이며 기본 Hierarchy를 불필요하게 깊게 만들지 않는다.**

> **Task는 하나만 존재하며 List·Board·Calendar·Gantt는 같은 Task를 서로 다르게 보여준다.**

> **Goals·Horizons는 Task View가 아니므로 View Engine의 Layout과 Domain Section을 구분한다.**

> **Project를 다른 Space로 이동하는 비용은 Project 한 행의 관계 변경으로 끝나야 한다.**

이 원칙을 만족하는 가장 작은 변경을 선택한다.