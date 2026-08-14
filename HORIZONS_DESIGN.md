# Study → Horizons 설계 (레퍼런스: Timestripe)

- 작성일: 2026-08-14
- 기준: `v0.5.2` (`0060c49`)
- 대상: `src/components/StudyPage.tsx`가 차지하던 자리를 **목표 지평(Horizons) 페이지**로 교체
- 전제: 사용자 승인 — 현재 Study 기능(토픽·개념 노트·복습 큐)은 전부 없애도 된다

---

## 0. 먼저 정직하게 — 레퍼런스의 범위

Timestripe에서 내가 확신하는 것은 **시간 지평 모델** 하나다:

- 목표를 `Day / Week / Month / Year / Life` 지평에 나눠 **나란히 놓고 본다**
- 위 지평의 목표가 아래 지평으로 **분해되어 내려온다**
- 태스크가 아니라 **목표가 1급 시민**이다
- 항목은 지평 사이를 오간다

픽셀 단위 UI, 정확한 메뉴 구성, 유료 기능 경계는 확신하지 못한다. 그러니 이 문서는 **화면 복제가 아니라 지평 모델의 이식**이다. 그 편이 낫기도 하다 — 이 앱에는 Timestripe에 없는 것(캘린더 드래그 플래너, 포커스 세션 실측, 로컬 AI)이 이미 있어서, 겉모습을 베끼면 오히려 충돌한다.

---

## 1. 핵심 발견 — 이 모델은 이미 절반 이상 구현돼 있다

새로 만들 게 아니다. `lib/ai/`에 **결정적 로직과 테스트까지 갖춘 목표 계층**이 이미 있다.

| 있는 것 | 위치 | Timestripe 대응 |
|---|---|---|
| `LearningPath.goal` — 한 문장짜리 큰 방향 | `learningPaths/types.ts` | **Life / Year 목표** |
| `Milestone` — 순서 있는 중간 목표 + `doneCriteria` | 같은 파일 | **Month / Week 목표** |
| `ContextCard.stage` 5단계 | `contextCards/types.ts` | 목표가 실행으로 내려가는 과정 |
| `resolveMilestoneStatus` / `currentMilestoneIndex` | `learningPaths/progress.ts` | "지금 이 길의 어디인가" |
| `Task.scheduledDate` | `types.ts` | **Day** |
| `Project` / Space | `types.ts` | **Board (영역)** |

`progress.ts`에는 이미 이런 계약이 박혀 있다:

```
// 모델은 사용자가 경로의 어디에 있는지 결정하지 않는다 —
// 순수 함수가 연결된 카드들의 stage로부터 계산한다.
```

그리고 `docs/Features/Learning_Path.md`가 슬라이스 A를 이미 스펙으로 못박아 뒀고, 메모리의 장기 비전(`목표→프로젝트화→정보수집→계획→실행`)이 정확히 이 얘기다.

**문제는 이게 전부 AI 채팅 안에서만 보인다는 것이다.** `loadLearningPaths()`를 부르는 곳은 `OllamaChat.tsx`와 `AssistantTurnCards.tsx` 둘뿐이다. 채팅을 닫으면 내 목표가 어디 있는지 볼 방법이 없다.

> **그래서 이 설계는 "새 기능 개발"이 아니라 "이미 만든 것에 화면을 주는 일"이다.**
> 그리고 그 화면이 들어갈 자리가 마침 비어 있다 — 메뉴에서 도달할 수 없는 StudyPage.

---

## 2. 확정 결정

### D1. 뷰는 소유하고 **저장은 소유하지 않는다** — 5칼럼 전부 상호작용

> **개정 (2026-08-14).** 초안은 Day/Week 칼럼을 읽기 전용 미러로 뒀다. 시각까지
> 레퍼런스로 두기로 하면서 다시 판단했고, **틀린 결정이었다.**

초안의 논리는 "StudyPage처럼 화면이 겹치면 둘 다 반쪽이 된다"였다. 그런데 StudyPage의 실패 원인을 다시 보면 **저장소가 둘이었던 것**이지 화면이 둘이었던 게 아니다. 하나의 저장소에 여러 뷰가 붙는 것은 이 앱에서 이미 정상이다 — 같은 `Task`를 Today · 캘린더 · Planning이 각각 다른 각도로 그린다.

그리고 반쪽만 상호작용하는 칼럼은 **양극단보다 나쁘다.** 다섯 칼럼이 똑같이 생겼는데 오른쪽 둘만 드래그를 거부하면, UI가 균일함을 약속해놓고 어기는 셈이다. Timestripe의 핵심 동작(위 지평의 목표를 아래로 끌어내리기)이 정확히 그 자리에서 죽는다.

**개정된 결정: 다섯 칼럼 모두 완전히 상호작용한다. 대신 Horizons는 어떤 레코드도 새로 만들지 않는다 — 이미 있는 레코드에 쓰기만 한다.**

| 드래그 | 실제로 일어나는 쓰기 | 이미 있는 구현 |
|---|---|---|
| Life → Year | `LearningPath.targetDate` 설정 | 신규 (필드 1개) |
| Year → Month | `targetDate` 앞당김 | 신규 |
| Month → Week | 마일스톤에서 `Task` 생성, `taskIds` 연결 | `onCreateTask` |
| Week → Day | `Task.scheduledDate = 오늘` | 캘린더 드롭과 동일 |
| Day → Week | `scheduledDate` 미룸 | 동일 |

**규칙: 뷰는 소유하되 저장은 절대 소유하지 않는다.** Day 칼럼에서 태스크 제목을 고치면 그건 `Task`를 고치는 것이고, Today 페이지에도 즉시 반영된다. 새 "Day 목표" 레코드 같은 건 만들지 않는다.

### D2. 지평은 저장하지 않고 **파생**한다

리포에 이미 확립된 규칙이 있다. `utils/eisenhower.ts`:

```
// 사분면은 저장되지 않는다 — 태스크의 기존 필드에서 파생되므로
// 서로 어긋날 수 없다.
```

**결정: `horizon = f(targetDate, today)`.** `LearningPath`와 `Milestone`에 `targetDate?: string` 하나만 추가한다.

| targetDate | 지평 |
|---|---|
| 없음 | Life |
| 오늘 + 12개월 초과 | Life |
| 오늘 + 90일 ~ 12개월 | Year |
| 오늘 + 90일 이내 | Month |

목표를 칼럼 사이로 드래그하면 `patchForQuadrant`와 똑같이 **`targetDate`를 쓴다.** 지평 자체는 어디에도 저장되지 않으므로 어긋날 수 없다.

경계값은 조정 가능한 상수 하나(`HORIZON_BOUNDS`)로 둔다.

### D3. 목표는 동기화되어야 한다 — 로컬 블롭에서 승격

지금 `LearningPath`는 `focusflow.learningPaths.v1` 로컬 KV에 있고 **Supabase 동기 대상이 아니다.** 채팅 부속물일 때는 맞는 선택이었지만, 1급 페이지가 되면 틀린 선택이 된다 — 다른 기기에서 안 보이는 목표는 목표가 아니다.

`store.ts` 주석이 이미 이 전환을 예고해 뒀다:

```
// 나중에 DB 기반 스토어로 교체 가능 — 호출자를 건드리지 않고.
```

**결정: `PlannerData.learningPaths`로 승격 + `learning_paths` 동기 테이블 추가.** 첫 로드 때 로컬 블롭을 읽어 이관하고 블롭은 비운다(멱등, 기존 `normalizeTask`의 scheduledDate 승격과 동일 패턴).

`ContextCard`는 **로컬에 남긴다.** 카드는 채팅 세션의 부산물이고 양이 많으며, 승격하면 동기 비용이 커진다. 마일스톤 상태는 카드가 없어도 `upcoming`으로 안전하게 파생된다(`resolveMilestoneStatus`가 이미 그렇게 동작).

### D4. AI는 초안만, 페이지가 정본

기존 계약 3개를 그대로 승계한다 (`Learning_Path.md` §1):

1. 모델은 제안만 하고 판정은 결정적 함수가 한다
2. 정보 수집은 게이트가 아니다 — 미해결 슬롯이 진행을 막지 않는다
3. 내부 판정 용어(SMART 등)는 사용자 표면에 노출하지 않는다

채팅에서 "브레인 덤프 → 경로 제안"은 **빠른 입구**로 유지하고, Horizons 페이지가 **머무는 곳**이 된다. 페이지에서 목표를 손으로 만드는 경로도 반드시 있어야 한다 — AI 없이도 쓸 수 있어야 하고, 로컬 AI가 없는 웹 빌드가 존재한다.

### D5. 이름

| 후보 | 평가 |
|---|---|
| **Horizons / 지평** | 기제를 그대로 이름으로. Planning(아이젠하워)과 안 겹침. **권장** |
| Goals / 목표 | 가장 쉽지만 밋밋하고, Spaces·Planning과 관계가 안 드러남 |

사이드바 위치: `Today · Calendar` 다음, `Planning` 앞. 시간 축이 긴 것부터 짧은 것 순이 아니라 **매일 여는 것부터** 순이라는 기존 배치(0.5.0의 "daily screens first")를 유지한다.

### D6. 지평 간 이동은 드래그, 분해는 명시적으로

- **드래그**: 칼럼 사이로 목표를 옮기면 `targetDate`가 바뀐다 (D2)
- **분해**: Life/Year 목표에서 "마일스톤 추가" → 아래 지평에 생김. Timestripe의 캐스케이드를 명시적 액션으로 구현한다. 자동 분해는 AI 제안일 때만이고, 항상 사용자 확인을 거친다 (D4)
- **실행 연결**: 마일스톤에서 "오늘 할 일로" → `Task` 생성 (`scheduledDate = today`, `projectId` 승계). 이게 Month → Day를 잇는 유일한 다리다

---

## 2-B. 시각을 레퍼런스로 둘 때 추가되는 결정

D1이 개정되면서, "Timestripe처럼 보인다"를 CSS가 아니라 **데이터 층에서** 만들어야 한다는 게 분명해졌다.

### D7. 카드 타입을 하나로 통일한다 — `HorizonItem`

Timestripe의 시각 언어가 성립하는 이유는 **Life 목표와 오늘 할 일이 같은 카드로 보이기 때문**이다. 그래서 지평 사이를 옮기는 게 자연스럽게 느껴진다. 생김새가 다르면 드래그가 "변환"처럼 느껴지고, 그 순간 모델이 무너진다.

이 앱에는 정확히 그 패턴의 선례가 있다. `utils/calendarItems.ts`는 5개 소스(`task` · `project` · `note` · `external` · `focus`)를 **하나의 `CalendarItem`**으로 파생시키고, 캘린더는 그 한 타입만 그린다.

**결정: `utils/horizonItems.ts` 신설, 같은 패턴.**

```ts
export interface HorizonItem {
  key: string;
  horizon: "life" | "year" | "month" | "week" | "day";  // 파생 (D2)
  sourceType: "path" | "milestone" | "task";
  sourceId: string;
  title: string;
  targetDate?: string;
  done: boolean;
  color: string;        // Board(=Space) 색 (D9)
  parentTitle?: string; // 상위 지평에서 내려온 경우의 breadcrumb
  draggable: boolean;
}
```

이게 "시각적으로 Timestripe처럼"에 가장 크게 기여하는 결정이다. 균일함을 CSS로 흉내내는 게 아니라 데이터가 균일해지기 때문이다.

### D8. 다섯 칼럼을 **동시에** 보여준다 — 측정 근거 있음

지평이 나란히 보이는 것 자체가 제품이다. 스크롤해야 보이는 지평은 안 보이는 지평이다.

실측: 기본 창(1280×720)에서 `main`의 논리 폭은 **1200px**이다(사이드바 198px 제외, `zoom: 0.9` 보정). 5칼럼이면 **칼럼당 240px**.

그리고 240px는 이 리포가 이미 쓰는 값이다 — `03-planning.css:178`:

```css
grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
```

**결정:** 같은 `minmax(240px, 1fr)` + `auto-fit`을 쓴다. 폭이 줄면 자동으로 칼럼이 접히는데, 접히는 순서는 **오른쪽(Day)이 아니라 왼쪽(Life)부터**여야 한다 — 좁은 화면에서 급한 건 오늘이다. `auto-fit`은 순서를 못 고르므로 칼럼 수를 폭에서 계산해 렌더 범위를 자르고, 접힌 지평은 헤더의 스위처로 꺼낸다. **가로 스크롤은 쓰지 않는다.**

### D9. 색은 Board(= 기존 Space)가 소유한다

캘린더 Phase B에서 확립한 규칙을 그대로 가져온다: **hue = 어느 Board인가, 형태 = 어떤 종류인가.** Timestripe의 보드별 색 구분과도 맞고, 무엇보다 캘린더와 Horizons가 같은 색 언어를 쓰게 된다 — 같은 프로젝트가 두 화면에서 같은 색이다.

구현도 재사용한다. `10-calendar-apple.css`의 `--ev-color` + `color-mix()` 메커니즘을 그대로 쓴다:

```css
.hz-card {
  background: color-mix(in srgb, var(--ev-color) 14%, transparent);
  border-left: 3px solid var(--ev-color);
  color: color-mix(in srgb, var(--ev-color) 74%, var(--text-primary));
  box-shadow: none;   /* 보드도 캘린더와 같이 평평하다 */
}
```

### D10. 모든 지평에서 체크가 된다 — 파생 상태와의 충돌을 여기서 정리

Timestripe는 어느 지평이든 목표를 체크해 완료한다. 그런데 이 앱의 마일스톤 완료는 **파생**이다 — `resolveMilestoneStatus`가 연결된 카드들의 stage로 계산하고, `progress.ts`는 "모델이 결정하지 않는다"를 계약으로 못박아 뒀다.

정면으로 부딪힌다. **목표를 체크할 수 없는 목표 페이지는 목표 페이지가 아니다.**

**결정: 사용자의 명시적 완료가 파생을 이긴다.** `Milestone.completedAt` / `LearningPath.completedAt`을 추가하고, 판정 우선순위를 이렇게 둔다:

```
completedAt 있음        → done   (사용자가 그렇다면 그런 것)
없음                    → resolveMilestoneStatus(카드 stage) 로 파생
```

기존 계약은 깨지지 않는다. 그 계약이 막으려던 건 **모델**이 상태를 주장하는 것이지 사용자가 주장하는 것이 아니다. 이 구분을 `progress.ts` 주석에 명시해 둔다.

### D11. 카드에 상위 목표를 breadcrumb으로 흘린다

캐스케이드가 보이지 않으면 지평은 그냥 5개의 목록이다. 아래 지평 카드에 자기가 어디서 내려왔는지가 흐리게 붙어야 한다.

이것도 이미 있다 — `OllamaChat.tsx:101`의 `formatBreadcrumb(activePath, loadContextCards())`. 채팅 헤더에만 쓰이던 것을 카드로 옮긴다.

### 무엇이 "Timestripe처럼 보이게" 만드는가 (요약)

| 요소 | 결정 |
|---|---|
| 균일한 카드 | D7 — 데이터 층에서 통일 |
| 항상 다 보이는 지평 | D8 — 240px×5, 가로 스크롤 없음 |
| 보드 색 | D9 — Space가 소유, 캘린더와 공유 |
| 어디서나 체크 | D10 |
| 보이는 캐스케이드 | D11 — breadcrumb |
| 장식 없는 표면 | 그림자 없음, 헤어라인, 텍스트 우선 — 캘린더 Phase A와 동일 |

### D12. Planning(아이젠하워)과의 관계 — 지금 정하지 않는다

축이 다르다. Planning은 중요도×긴급도, Horizons는 시간 스케일. 겹치지 않는다.

다만 첫 사용성 평가에서 Planning은 **`priority === "high"`가 아니면 전부 Q4로 떨어지는** 문제가 확인됐고, Horizons가 "무엇이 큰 목표인가"를 더 직접적으로 답한다. 둘 중 하나가 남는 결말이 있을 수 있지만 **Phase 3 이후 실제로 써보고 판단한다.** 지금 지우는 결정을 내리기엔 근거가 없다.

---

## 3. 데이터 모델 변경

```ts
// learningPaths/types.ts — optional 필드만 추가, 기존 구조는 그대로
export type LearningPath = {
  id: string;
  goal: string;
  milestones: Milestone[];
  targetDate?: string;        // 신규: 지평 파생의 유일한 입력 (D2)
  projectId?: string;         // 신규: Board = 기존 Space 재사용 (D9)
  completedAt?: string;       // 신규: 사용자 완료가 파생을 이긴다 (D10)
  infoSlots?: InfoSlot[];
  source: LearningPathSource;
  createdAt: string;
  updatedAt: string;
};

export type Milestone = {
  id: string;
  title: string;
  doneCriteria: string;
  cardIds: string[];
  targetDate?: string;        // 신규
  taskIds?: string[];         // 신규: Month → Day 다리 (D6)
  completedAt?: string;       // 신규 (D10)
  status?: MilestoneStatus;
};
```

전부 optional이라 기존 저장 데이터가 그대로 읽힌다 — `store.ts`의 sanitize 원칙과 같다.

`ConceptNote` / `StudyTopic`은 **새 모델에 대응물이 없다.** 개념 노트는 지식 산출물이고 목표 지평과 다른 축이다. §5 참조.

---

## 4. Phase 계획

**순서 규칙: 새것이 동작한 뒤에 옛것을 지운다.** StudyPage를 먼저 지우면 되돌릴 근거가 사라진다.

### Phase 1 — 화면 주기 (저장 구조 변경 없음) — **완료 (2026-08-14)**

실측 결과와 설계에서 어긋난 점 2가지는 §4-A에 기록.


| # | 작업 |
|---|---|
| 1.1 | `buildHorizonItems()` — `LearningPath` · `Milestone` · `Task`를 하나의 `HorizonItem`으로 파생 (D7). `calendarItems.ts`와 같은 구조, 테스트 동반 |
| 1.2 | `deriveHorizon(targetDate, today)` 순수 함수 + 테스트 (`utils/horizons.ts`, D2) |
| 1.3 | `HorizonsPage.tsx` — 5칼럼 렌더, 읽기 전용 (D8 레이아웃) |
| 1.4 | 목표·마일스톤 손으로 생성/편집/삭제 (기존 `saveLearningPath` 사용) |
| 1.5 | 사이드바에 Horizons 항목 추가 — **StudyPage의 "메뉴가 없다" 문제를 여기서 해소** |

Phase 1은 **드래그 없이** 끝낸다. 파생과 레이아웃이 맞는지 먼저 눈으로 확인해야 드래그가 무엇을 써야 하는지 확실해진다. StudyPage는 그대로 둔다.

### 4-A. Phase 1에서 설계가 어긋난 곳 (구현 중 정정)

**1. `auto-fit`으로는 5칼럼이 유지되지 않는다.**
D8은 `03-planning.css`의 `repeat(auto-fit, minmax(240px, 1fr))`를 재사용하자고 했다. 실제로 띄워보니 사용 가능 폭이 **1104px**(1200px이 아니라 — 페이지 패딩과 상세 패널 슬롯이 먹는다)이라 `auto-fit`이 4칼럼만 잡고 다섯 번째가 **둘째 줄로 접혔다.** 줄바꿈은 가로 스크롤과 똑같이 나란한 조망을 깨뜨린다.

→ `repeat(5, minmax(0, 1fr))` 고정. 칼럼이 접히는 대신 **압축**된다(기본 창에서 칼럼당 211px, 충분히 읽힌다). 좁은 창에서 칼럼을 떨구는 처리는 **보류**했다 — 데스크톱 앱이고, `life`를 숨기는 것이 카드가 좁아지는 것보다 나쁘다.

**2. 마일스톤 0개짜리 목표가 저장 즉시 사라졌다.**
`store.ts`의 `sanitizePath`가 `milestones.length === 0`이면 `null`을 반환했다. 작성자가 어시스턴트뿐일 때는 옳았다 — 빈 제안은 망가진 제안이니까. 하지만 Horizons는 **사람이 목표만 먼저 적고 나중에 쪼개는** 것을 전제로 한다.

→ 빈 마일스톤 목록을 정상 상태로 허용. `matchMilestone.ts`와 `progress.ts`는 이미 빈 목록에 `null`을 돌려주도록 방어돼 있어 연쇄 영향은 없었고, AI 초안 경로의 최소 개수 요구(`pathDraft.ts`의 `MIN_PATH_MILESTONES`)는 그대로 두어 어시스턴트 쪽 계약은 유지된다.

**검증 (실측)**

| 확인 | 결과 |
|---|---|
| 5칼럼 한 줄 · 가로 스크롤 없음 | `211.2px × 5`, `sameRow: true`, `overflowX: false` ✔ |
| 목표 생성 (Life, 날짜 없음) | 저장·렌더 ✔ — sanitize 수정이 없었으면 사라졌을 케이스 |
| 마일스톤 추가 + breadcrumb | `↳ 중국어로 일할 수 있게 되기` ✔ |
| 체크 완료 → `completedAt` | ISO 타임스탬프 기록, 취소선 ✔ |
| 태스크 파생 | `scheduledDate`/`dueDate`에서 Day 칼럼으로 ✔ |
| 리로드 지속성 | 목표·마일스톤·완료 상태 모두 유지 ✔ |
| 라이트/다크 | 14%/8% ↔ 30%/18%, 텍스트가 카테고리 색을 따라감 ✔ |

`npx tsc -b` 통과, 284개 테스트 통과(신규 13개), 신규 콘솔 에러 없음.

### Phase 2 — 동기화 승격 — **완료 (2026-08-14)**

| # | 작업 | 결과 |
|---|---|---|
| 2.1 | `PlannerData.learningPaths` + 정규화 | 블롭을 읽던 `sanitizeLearningPath`를 공개해 **동기 행과 로컬 블롭이 같은 검증기**를 쓴다 |
| 2.2 | `collectionTables` + Supabase 마이그레이션 | `004_learning_paths.sql`. `optionalRemoteTables`에도 등록 — 이 마이그레이션을 안 돌린 계정이 **매 저장마다 실패하지 않도록** |
| 2.3 | 로컬 블롭 → planner 1회 이관 | id 기준 병합. §4-B의 사고 참조 |
| 2.4 | `OllamaChat` / `AssistantTurnCards` 전환 | `LearningPathStore` 한 덩어리로 주입 |

배열 연산은 `domain/horizons/pathMutations.ts`로 분리했다(순수 + 테스트 8개). `store.ts`에는 검증기와 레거시 블롭만 남는다.

### 4-B. Phase 2에서 데이터를 잃을 뻔한 곳

**읽기에 부작용을 넣었다가 이관이 통째로 유실됐다.**

처음 구현은 `drainLegacyLearningPaths()` 하나로 "블롭을 읽고 마커를 찍는다"를 같이 했다. 실제로 돌려보니 **마커는 `"1"`인데 planner의 목표는 비어 있었다.**

원인: React StrictMode가 `useState(() => readStorage())` 초기화 함수를 두 번 호출한다. 첫 호출이 블롭을 읽고 마커를 찍었고, **React가 실제로 채택하는 두 번째 호출**은 마커를 보고 빈 배열을 돌려줬다.

StrictMode만의 문제가 아니다. 로컬 읽기가 저장되기 전에 원격 로드가 `adoptLoadedData`를 다시 부르면 같은 구멍이 열린다. 근본 원인은 **여러 번 불릴 수 있고 결과가 버려질 수도 있는 자리에 부작용을 둔 것**이다.

→ 읽기와 마킹을 분리했다. `readLegacyLearningPaths()`는 순수하고 몇 번 불러도 안전하며, `markLegacyLearningPathsMigrated()`는 상태가 커밋된 뒤 마운트 이펙트에서 한 번 호출된다. 채택은 항상 **id 기준 병합**이라 반복 실행이 중복을 만들지 않는다.

**검증 (실측, 실사용 업그레이드 상황 재현)**

| 확인 | 결과 |
|---|---|
| 이관 전 상태 | 블롭에 목표 1 + 마일스톤 1, 마커 없음, planner에 필드 없음 |
| 리로드 후 | `learningPaths`에 목표·마일스톤 이관, 마커 `"1"` ✔ |
| 화면 | 카드 + breadcrumb + 완료 상태까지 그대로 ✔ |
| **이관 후 삭제 → 리로드** | 되살아나지 않음 ✔ (블롭은 남아 있는데도) — 마커가 막는 지점 |
| AI 채팅 | 경로 0개 상태에서 정상 동작 ✔ |

블롭은 **한 릴리스 동안 남긴다.** 몇 KB로 사는 안전망이다.

`npx tsc -b` 통과, 292개 테스트 통과(신규 8개), 신규 콘솔 에러 없음.

### Phase 3 — 캐스케이드 — **완료 (2026-08-14)**, 3.5만 보류

| # | 작업 | 결과 |
|---|---|---|
| 3.1 | 지평 간 드래그 | 완료. D1 표에서 한 줄 정정 — 아래 참조 |
| 3.2 | 체크박스 + `completedAt` | Phase 1에서 이미 들어감 |
| 3.3 | breadcrumb을 카드로 | Phase 1에서 이미 들어감 |
| 3.4 | 완료 판정 통일 | `resolveMilestoneStatus`에 `completedAt` 우선 + 연결 태스크 신호 |
| 3.5 | AI 제안 경로를 페이지에서 확인/저장 | **보류** — 채팅에서 저장하면 이미 페이지에 나타난다. 별도 확인 UI는 실제로 부족함을 느낀 뒤에 |

**D1 표 정정 — 드래그는 재료화하지 않는다**

D1의 표는 `Month → Week` 드래그가 "마일스톤에서 Task 생성"이라고 적었다. 구현하면서 그게 두 가지 의도를 하나에 섞는다는 게 분명해졌다 — **항목을 옮기는 것**과 **다른 종류의 항목을 낳는 것**은 다른 일이고, 드래그가 조용히 후자를 하면 예측할 수 없다.

→ **드래그는 언제나 날짜만 쓴다**(path/milestone은 `targetDate`, task는 `scheduledDate`). 재료화는 마일스톤 카드의 명시적 `+ 오늘 할 일로` 버튼이고, 이건 원래 D6의 세 번째 항목이었다.

**태스크는 Life/Year에 못 놓는다.** 놓으면 날짜가 지워지고 모든 칼럼에서 사라져 Inbox로 조용히 돌아간다. 카드가 사라지는 것보다 드롭을 거부하는 게 정직하다. 거부되는 칼럼은 드롭 표시 대신 흐려진다.

### 4-C. Phase 3에서 나온 결함 2건

**1. 완료 판정이 화면마다 달랐다.**
Horizons는 `completedAt`을 읽고, `progress.ts`의 `resolveMilestoneStatus`는 카드 stage만 봤다. **한 화면에서 체크한 마일스톤이 다른 화면에선 계속 "current"였다.** D10을 타입에만 넣고 판정 함수에 넣지 않은 탓이다.

→ 단일 출처에 우선순위를 명시했다: ① 사용자의 `completedAt` ② 연결된 태스크가 전부 done ③ 카드 stage. 이 모듈 첫 줄의 "상태를 신뢰하지 않는다"는 계약은 **모델**이 진행을 주장하는 것에 대한 것이지, 자기 목표를 체크하는 사람에 대한 것이 아니다 — 주석에 명시했다.

**2. `toISOString()`이 날짜를 하루 당겼다.**
`dateForHorizonDrop`을 로컬 자정 `Date` + `toISOString().slice(0,10)`으로 짰더니 KST(UTC+9)에서 **항상 전날**이 나왔다. 라운드트립 테스트(`deriveHorizon(dateForHorizonDrop(h)) === h`)가 잡았다.

→ 리포의 `addDays`로 교체. **Phase 1의 `targetDateForHorizon`에도 같은 버그가 있었고** 함께 제거해 생성과 드롭이 같은 함수를 쓰게 했다.

**검증 (실측)**

| 확인 | 결과 |
|---|---|
| 목표 Life → Month 드래그 | `targetDate: 2026-09-28` (오늘+45일, 시간대 오차 없음) ✔ |
| 마일스톤 동반 이동 | 경로 날짜를 상속하므로 같이 이동 ✔ |
| 태스크 → Life/Year | 두 칼럼이 흐려지고, 놓아도 `scheduledDate` 불변 ✔ |
| `+ 오늘 할 일로` | 오늘 날짜 태스크 생성 + `taskIds` 연결 + Day 칼럼 등장 ✔ |
| breadcrumb 중복 | 제목이 같으면 숨김 (아래) ✔ |

재료화한 태스크는 마일스톤 제목을 그대로 받으므로 캐스케이드 줄이 카드 제목을 그대로 반복했다. 정보를 더하지 못하는 breadcrumb은 소음이라, 제목이 같으면 표시하지 않는다.

`npx tsc -b` 통과, 301개 테스트 통과(신규 9개), 신규 콘솔 에러 없음.

### Phase 4 — Study 제거

**Phase 1~3이 동작한 뒤에만.** 없어지는 것을 §5에서 확인하고 착수한다.

---

## 5. Study 제거 시 함께 사라지는 것 — 착수 전 확인 필요

`ConceptNote` / `StudyTopic`은 **23개 파일**이 참조한다. StudyPage만 지우면 끝나지 않는다. 페이지 밖에서 사라지는 것:

| 사라지는 것 | 위치 |
|---|---|
| 캘린더의 **복습 블록**(`study-review` 레이어) | `utils/calendarItems.ts` |
| 캘린더 사이드바의 **STUDY 카테고리 그룹** | `lib/calendarCategories.ts` |
| Spaces의 **스터디 Space** (토픽에서 파생) | `SpacesPage.tsx:220` |
| 전역 검색의 **토픽·노트 결과** | `App.tsx:228` |
| 공유 캘린더의 복습 항목 | `lib/calendarShare.ts` |

**"Study 기능은 다 없애도 된다"에 위 5개가 포함되는지 확인이 필요하다.** 특히 캘린더 복습 블록과 Spaces 스터디 Space는 Study 페이지 바깥에서 보이던 것이라, 페이지만 생각하고 승인했다면 의도와 다를 수 있다.

**개념 노트 본문의 행선지도 정해야 한다.** `ConceptNote`는 `summary` / `content` / `examples` / `personalExplanation` / `confusionPoint` / `reviewHistory`를 가진 구조화 문서다. Horizons에는 대응물이 없다. 선택지:

1. **그냥 삭제** — 사용자가 적어둔 내용이 사라진다
2. **Spaces의 `SpaceNote`로 이관** — Spaces에 이미 스플릿 뷰 에디터가 있다(686줄). 필드를 합쳐 본문 하나로 붙이는 손실 있는 변환
3. **export만 제공하고 삭제** — Settings의 데이터 export에 한 번 담고 지운다

권장은 **3번**이다. 되돌릴 수 없는 삭제 전에 사용자가 자기 글을 손에 쥘 수 있어야 한다.

---

## 6. 하지 않을 것

| 항목 | 이유 |
|---|---|
| Horizons 전용 "Day 목표" 레코드 신설 | 그게 Task다. 뷰는 늘리되 저장은 늘리지 않는다 (D1) |
| 지평 가로 스크롤 | 스크롤해야 보이는 지평은 안 보이는 지평이다 (D8) |
| 카드 모양을 지평별로 다르게 | 균일함이 깨지는 순간 드래그가 "변환"처럼 느껴진다 (D7) |
| `ContextCard`를 동기 데이터로 승격 | 채팅 부산물이라 양이 많다. 마일스톤 상태는 카드 없이도 안전하게 파생됨 |
| 지평을 필드로 저장 | 아이젠하워에서 이미 겪은 "상태 두 벌이 어긋나는" 문제 (D2) |
| AI가 확인 없이 목표를 쓰기 | 기존 계약 위반 (D4) |
| StudyPage를 Phase 1 전에 삭제 | 새 화면이 동작하기 전에 되돌릴 근거를 없애는 일 |
