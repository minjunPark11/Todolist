# Timestripe 레퍼런스 기준점

- 작성일: 2026-08-14
- 목적: `HORIZONS_DESIGN.md` · `SPACES_BOARD_DESIGN.md`가 매번 §0에서 따로 고백하던 "레퍼런스의 범위"를 **한 곳으로 모은다.** 앞으로 "이게 Timestripe다운가?"는 이 문서를 근거로 판정한다.
- 방법: Timestripe 공식 Learning Center(기능 목록·보드 튜토리얼·Key Features)와 제3자 리뷰를 읽고 대조. 계정을 만들거나 앱에 로그인하지는 않았다 — 따라서 **로그인 후에만 보이는 화면은 이 문서의 사정권 밖**이다.

---

## 0. 이 문서를 쓰게 된 이유

설계문서 세 개가 전부 "확신하는 건 시간 지평 모델 하나뿐"이라고 적어두고 나머지는 추측으로 밀고 나갔다. 그 추측이 두 번 어긋났다:

1. `HORIZONS_DESIGN` D9 / `SPACES_BOARD_DESIGN` D1의 **"Board = 영역 축, 색을 소유"** — Timestripe의 Board는 그런 게 아니다 (§2)
2. 직전 논의에서 **"보드 필터는 Timestripe답지 않다"**고 말했는데, Timestripe에는 필터가 있다 (§2)

둘 다 "레퍼런스가 이렇더라"는 근거 없는 확신에서 나왔다. 그래서 근거를 먼저 만든다.

---

## 1. 확신도 표기

| 표기 | 뜻 |
|---|---|
| **[확인]** | 공식 문서에 명시됨 |
| **[교차]** | 공식 + 제3자 리뷰가 일치 |
| **[불명]** | 어느 쪽도 명시하지 않음 — 추측으로 쓰지 말 것 |
| **[오해]** | 내가 사실이라고 여겼으나 근거가 없던 것 |

---

## 2. 어휘 — 가장 중요한 정정

**Timestripe의 단어와 우리 앱의 단어가 서로 다른 것을 가리킨다.** 이게 혼선의 뿌리였다.

| Timestripe 용어 | 실제 의미 | 확신도 | 우리 앱에서 같은 이름의 것 |
|---|---|---|---|
| **Horizons** | Day / Week / Month / Year / Life 시간 축. 큰 목표는 Year·Life에, 작은 것은 Day·Week에 | [확인] | 우리 Horizons — **일치** |
| **Boards** | 목표를 담는 **컨테이너/리스트/DB**. 읽을 책 목록, 백로그, 칸반형 프로젝트 보드. 플래너 **아래**에 위치하고, 준비되면 Horizons로 올린다 | [교차] | ✗ 우리에겐 대응물이 애매 — Project(컨테이너) + Inbox(스테이징)에 가깝다 |
| **Spaces** | **팀 협업 공간** | [확인] | ✗✗ 우리 Spaces(생활 영역)와 **전혀 다른 것** |
| **색상(Color coding)** | 목표마다 지정. 여러 지평에 걸친 **목표 사이의 관계를 눈으로 잇는** 용도 | [확인] | 우리는 "보드(=Project) 정체성" — **다른 의미로 쓰고 있다** |
| **Tags** | 분류·정렬 | [확인] | 우리 `Task.tags` |
| **Filters** | 담당자·카테고리 등으로 걸러 화면을 줄임 | [확인] | 없음 |
| **Subgoals** | 큰 목표를 작은 것으로 쪼개되 연결 유지 | [확인] | `LearningPath` → `Milestone` — **일치** |
| **Climbs** | 미리 만들어진 가이드 프로그램(수면 개선, 20일 디자인 학습 등) | [확인] | 없음 |
| **Climates** | **존재하지 않는다** | [오해] | — 내가 지어낸 것 |
| 지평 간 이동 | **드래그로 옮길 수 있다** | [교차] | 우리 Phase 3 드래그 — **일치** |
| Calendar / 타임블로킹 | 있음 | [확인] | 우리 캘린더 — 일치 |

### 2.1 Board는 영역이 아니다

가장 큰 정정이다. 나는 Board를 "건강 / 커리어 같은 생활 영역"으로 읽고 `Board = Project`, `색 = 보드 정체성`이라는 D1/D9를 세웠다. 실제 Board는 **목표를 담아두는 리스트**다 — 읽을 책 목록이나 백로그처럼. 영역 축이라기보다 **스테이징·참조 저장소**다.

즉 Timestripe에는 **"생활 영역 축"이 1급 개념으로 존재하지 않는다.** 그 역할은 색·태그·보드가 나눠 갖는다.

### 2.2 색의 의미가 반대에 가깝다

Timestripe: 색은 **여러 지평에 흩어진 관련 목표를 하나로 잇는 표시**다.
우리: 색은 **어느 보드(Project) 소속인가**다.

공교롭게도 우리 `horizonItems.ts`에는 Timestripe 쪽 의미가 이미 들어 있다 — 연결된 태스크가 목표의 색을 물려받아 "캐스케이드가 한 색으로 읽히게" 한 부분이 그렇다. 두 의미가 한 필드에 섞여 있는 셈이다.

---

## 3. 우리가 의도적으로 다른 곳 — 그리고 그래도 되는 이유

**이건 결함 목록이 아니라 결정 목록이다.** 우리 앱에는 Timestripe에 없는 것(캘린더 드래그 플래너, 포커스 세션 실측, 로컬 AI)이 있고, 겉모습을 베끼면 그것들과 충돌한다. `HORIZONS_DESIGN` §0의 원래 판단은 여전히 옳다.

| 항목 | 우리 | Timestripe | 유지 근거 |
|---|---|---|---|
| 색 = Project 정체성 | 그렇다 | 목표 간 관계 표시 | **우리 캘린더가 이미 "hue = 어느 캘린더인가"다**(`CALENDAR_APPLE_DESIGN` D1). 두 화면이 같은 색 언어를 쓰는 값이 Timestripe 모방보다 크다 |
| Spaces = 생활 영역 | 그렇다 | 팀 협업 공간 | 우리 앱은 1인용이다. 협업 개념을 들일 이유가 없다 |
| 5칼럼 항상 동시 표시 | 그렇다 | [불명] | `HORIZONS_DESIGN` D8의 자체 근거(실측)로 선다. 레퍼런스 필요 없음 |
| Climbs 없음 | 없다 | 있다 | 콘텐츠 사업이다. 우리 범위 밖 |
| Board 컨테이너 | Project로 대체 | 별도 개념 | 우리에겐 Project·Inbox가 이미 그 일을 한다 |

**규칙:** 우리 결정의 근거로 "Timestripe가 그러니까"를 쓰려면 이 문서의 [확인]/[교차] 항목이어야 한다. 아니면 **우리 앱 내부 근거로 정당화하고, Timestripe를 인용하지 않는다.**

---

## 4. 기존 문서에 미치는 영향

### 4.1 `SPACES_BOARD_DESIGN` D1 / `HORIZONS_DESIGN` D9 — **근거만 교체, 결론은 유지**

"Board = Project, 색을 소유"는 **Timestripe 이식이 아니었다.** 우리 발명이다.

다만 결론 자체는 그대로 둔다. 근거가 캘린더와의 색 언어 일관성(`CALENDAR_APPLE_DESIGN` D1)으로 충분하고, 코드도 이미 그렇게 동작한다. **바뀌는 건 "Timestripe가 그렇다"는 문장을 지우는 것뿐이다.**

### 4.2 S3(보드 필터) — 반대 이유를 바꿔야 한다

직전에 나는 "Timestripe답지 않다"고 말했다. **틀렸다** — Timestripe에는 필터가 있다.

그래도 결론은 유지한다. 다만 이유는 우리 앱 내부에 있다:

1. Horizons 페이지의 존재 이유가 5지평 동시 조망이다 (`HORIZONS_DESIGN` D8, 실측 근거 있음)
2. 한 보드로 좁히면 **S2에서 만든 Space 상세와 같은 화면**이 된다
3. Timestripe의 필터는 훨씬 넓은 워크스페이스를 줄이는 도구다. 우리 Horizons는 이미 한 화면에 다 들어간다 — 줄일 게 없다

→ **필터 대신 §5의 항목들.**

### 4.3 색의 이중 의미 — 새로 생긴 숙제

`horizonItems.ts`의 `color`가 지금 두 가지를 한다: 보드 정체성(경로·마일스톤)과 캐스케이드 연결(연결된 태스크가 목표 색 상속). Timestripe 기준으로는 후자가 정통이고, 우리 캘린더 기준으로는 전자가 정통이다. **아직 충돌이 드러나진 않았다**(연결된 태스크는 대개 같은 보드니까). 다른 보드의 태스크가 목표에 연결되는 순간 어긋난다 — `boardId`는 목표를 따르는데 색도 목표를 따르므로 실은 일관적이다. **당장 고칠 것 없음, 기록만 남긴다.**

---

## 5. 이 조사가 바꾼 다음 할 일

우선순위는 "레퍼런스 흉내"가 아니라 **우리 모델의 구멍** 순이다.

| # | 할 일 | 왜 |
|---|---|---|
| 1 | Horizons 페이지에서 만든 목표에 **보드를 지정**할 수 있게 | 지금은 `projectId`가 안 붙어 **어느 Space에도 안 나타난다.** 두 축이 한 모델이라는 전제가 깨진 상태 |
| 2 | 목표의 **보드 변경** | 지평은 드래그로 오가는데 보드는 생성 시 고정. 축 하나가 write-once |
| 3 | Horizons 페이지에 **보드 이름 표시**(배지 또는 범례) | 색은 있는데 이름이 없어 어느 보드인지 그 화면에서 읽을 수 없다 |
| 4 | ~~보드 필터~~ | §4.2 — 하지 않는다 |

1번이 가장 급하다. 나머지 둘은 그다음이다.

---

## 6. [불명] 목록 — 추측 금지

아래는 근거를 못 찾았다. 필요해지면 **다시 조사하고 이 문서를 고칠 것.** 그 전에는 설계 근거로 쓰지 않는다.

- Horizons 칼럼의 실제 레이아웃(항상 5개 동시인지, 접히는지, 가로 스크롤인지)
- 지평별 경계 규칙(무엇이 "Month"인지 — 날짜 기반인지 수동 배치인지)
- 목표가 한 지평에만 속하는지, 상위 지평이 하위를 포함하는지
- 완료 처리와 지평의 관계
- 보드 항목과 Horizons 목표의 연결이 정확히 어떤 관계인지(복제인지 참조인지)
- 무료/유료 기능 경계

---

## 출처

- [Features — Timestripe Learning Center](https://timestripe.com/magazine/learning-center/features/)
- [How to use boards in Timestripe](https://timestripe.com/magazine/learning-center/tutorials/how-to-use-boards-in-timestripe/)
- [Key Features — Timestripe](https://timestripe.com/boards/YYgM63ny/key-features/)
- [Schedule your goals with Timestripe](https://timestripe.com/magazine/learning-center/tutorials/schedule-your-goals-with-timestripe/)
- [Timestripe 3.0: The Best Way to Plan Your Life? — Paul Dittus](https://pauldittus.com/timestripe-3-0-the-best-way-to-plan-your-life/)
