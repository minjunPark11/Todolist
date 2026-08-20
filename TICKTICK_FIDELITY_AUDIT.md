# TickTick Fidelity Audit

기준 제품: TickTick Web (ticktick.com/webapp), 실제 계정
비교 대상: 현재 앱 v0.15.0 (`40d37a2`), `http://localhost:5180`
작성일: 2026-08-19

---

## 0. 측정 조건과 방법

| 항목 | 값 |
|---|---|
| viewport | 1440×900 (양쪽 동일, `innerWidth/innerHeight`로 확인) |
| theme | dark / light 양쪽 (Stage 1은 geometry라 theme 무관, Stage 2에서 분리) |
| dpr | 양쪽 2 (§0.3.2에서 교차 확인) — 모든 수치는 CSS px |
| 좌표계 | tool 좌표 × **4.70** = CSS px. §0.3에서 5점 검증, 오차 ≤2px |
| 샘플 데이터 | 현재 앱: `Fidelity Audit` 리스트 6 tasks. TickTick: 동명 리스트 생성 완료, 태스크 투입은 미완(§0.2) |
| 측정 도구 | 두 앱에 동일한 스크립트 주입. `getBoundingClientRect` + `getComputedStyle` |

### 0.1 판정 규칙

- **"비슷해 보인다"는 근거가 아니다.** 이 문서의 모든 숫자는 실행 중인 두 제품에서 잰 값이다.
- 재지 못한 항목은 재지 못했다고 쓴다. 추정치를 표에 넣지 않는다.
- 선행 문서(`TICKTICK_VISUAL_LANGUAGE_PLAN.md`)는 현재 앱만 측정하고 TickTick 쪽은 서술로 적었다. 이 문서는 그 서술을 검증 대상으로 본다.

### 0.2 남은 제약

TickTick quick-add에 태스크를 프로그램으로 넣지 못했다. CodeMirror 기반 에디터로, 텍스트 입력은 되지만 Enter가 제출로 이어지지 않는다(trusted 이벤트로 도달하는 것은 확인). 따라서:

- **geometry·anatomy 측정**은 기존 리스트(`Today`, 5 tasks)의 실제 행에서 수행했다 — 수치에 영향 없음.
- **Stage 8 screenshot 비교**는 `Fidelity Audit` 리스트에 동일 6개 태스크가 들어간 뒤에 진행한다.

---

## Stage 1 — Layout & Density Audit

### 1.1 TickTick 실측 (1440×900, dark)

**셸 4열 구조**

| 영역 | selector | 폭 | 위치 |
|---|---|---|---|
| Global Rail | `.g-left .sidebar_2byOi` | **50** | x 0 |
| Sidebar | `.listViewWrapper .g-left` | **240** | x 50 |
| List column | `.tasklist` | **649.6** | x 290 |
| Detail pane | `.g-right` | **500** | x 940 |

`50 + 240 + 650 + 500 = 1440`. Detail pane은 태스크 선택 여부와 무관하게 **항상 존재**하며, 선택이 없으면 `.empty-detail-wrapper`로 빈 상태를 그린다. 사이드바 우측에 `.detail-dragger` 5px 리사이즈 핸들(x 285).

**Rail**

| 항목 | 값 |
|---|---|
| padding | `0 0 11px` |
| 아이템 | 40×40, padding 6, radius 0 |
| 세로 step | **50** (y 64 · 114 · 164 · 214 · 264 · 314) |
| 아이콘 | **28×28** |
| 우측 경계 | 1px `rgba(255,255,255,.05)` |

**Sidebar**

| 항목 | 값 |
|---|---|
| 행 `li` | 239×**36**, padding `0 10` |
| 행 `button` | 219×36, padding `0 12`, **radius 10** |
| 세로 step | **38** (y 14 · 52 · 90) |
| 아이콘 | 20×20 |
| 섹션 헤더 | 219×**30**, padding `0 10 0 14`, radius 6 |

**Header / Quick Add**

| 항목 | 값 |
|---|---|
| `.tl-bar` | 649.6×**64**, padding `15px 20px` |
| 타이틀 | **20px / 28 / w600**, letter-spacing normal |
| 좌측 메뉴 버튼 | 20×20 |
| `.tl-quick` | 649.6×**76**, padding `0 20 16` |

**Task row** (`.l-task`, `Today` 리스트 실측)

| 항목 | 값 |
|---|---|
| 행 높이 | **40**, step **40** (gap 0) |
| padding | `0 0 0 18` |
| 드래그 핸들 | 12×12 @ +3 (hover 전 `invisible`) |
| 체크박스 | **17×17** @ +34 (히트영역 17×40) |
| 제목 | @ +58, line-height **40**, 14px |
| 구분선 `.t-line` | **1px, x +58부터 562 폭** — 행 전체가 아니라 제목 좌측에 맞춰 들여씀 |
| 행 배경 레이어 `.l-task-bg` | 616×40 @ +16 |
| more 메뉴 | 12×12 @ +634 (hover) |

### 1.2 현재 앱 실측 (1440×900)

**셸 3열 구조**

| 영역 | selector | 폭 | 위치 |
|---|---|---|---|
| Global Rail | `.global-rail` | **56** | x 0 |
| Sidebar | `.tm-sidebar` | **248** | x 56 |
| Main | `main.tm-main` | **1136** (태스크 선택 시 **736**) | x 304 |
| Detail 열 | `aside.tm-drawer.is-inline-drawer` | **400**, 태스크 선택 시에만 | x 1040 |

Detail 열은 `position: static`인 **인라인 컬럼**이다 — 오버레이가 아니다. 태스크를 열면 `56 + 248 + 736 + 400 = 1440`이 되고 리스트(`.tm-list`)는 1072 → **672**로 줄어든다.

**Rail**

| 항목 | 값 |
|---|---|
| padding | `8px` |
| 아이템 | 40×40, padding 0, **radius 10** |
| 세로 step | **44** (그룹 사이는 56 / 564) |
| 아이콘 | **20×20**, stroke-width 1.7 |
| 우측 경계 | 1px |

**Sidebar**

| 항목 | 값 |
|---|---|
| 컨테이너 | padding `16 8`, 섹션 gap 18 |
| 행 | 231×**30**, padding `0 10`, radius 6, gap 8 |
| 세로 step | **31** (y 16 · 47 · 78) |
| 글자 | 13px / 19.5 |

**Header / Quick Add**

| 항목 | 값 |
|---|---|
| `.tm-header` | 1072×**56**, gap 10 |
| 타이틀 | **22px / 33 / w700**, letter-spacing −0.484 |
| 뷰 탭 | 44.3×26, padding `4 12`, radius 6, 12px w600 |
| `.tm-quickadd-title` | 1010.9×**34**, padding `0 10`, radius 8, border 1px |

**Task row** (`.tm-task`)

| 항목 | 값 |
|---|---|
| 행 높이 | **36**, step **36** |
| padding | `0 4` |
| 드래그 핸들 | 없음 |
| 체크박스 | **없음** |
| 제목 | @ +4, 14px / 21 |
| 구분선 | 1px, **행 전체 폭** (1072) |
| more 메뉴 | 없음 |
| due chip | 76.4×18, 12px / 18 |

### 1.3 차이

| # | 항목 | TickTick | 현재 앱 | 차 |
|---|---|---|---|---|
| L-01 | Detail 열의 **기본 상태** | 선택 여부와 무관하게 **항상 확보** (빈 상태를 그림) | **태스크 선택 시에만** 나타남 | 상시 vs 조건부 |
| L-02 | 리스트 열 폭의 **안정성** | 항상 **650** | **1136 ↔ 672** 로 재배치 | 폭이 464 흔들림 |
| L-03 | Rail 폭 | 50 | 56 | +6 |
| L-04 | Rail step | 50 | 44 | −6 |
| L-05 | Rail 아이콘 | 28×28 | 20×20 | −8 |
| L-06 | Sidebar 폭 | 240 | 248 | +8 |
| L-07 | Sidebar 행 높이 | 36 | 30 | **−6** |
| L-08 | Sidebar step | 38 | 31 | **−7** |
| L-09 | Sidebar 행 radius | 10 | 6 | −4 |
| L-10 | Header 높이 | 64 | 56 | −8 |
| L-11 | Header 타이틀 | 20px w600 | 22px w700 | +2px, +100 |
| L-12 | Task row 높이 | 40 | 36 | **−4** |
| L-13 | Task row 체크박스 | 17×17 @+34 | **없음** | 구조 부재 |
| L-14 | Task row 제목 시작 | +58 | +4 | **−54** |
| L-15 | 구분선 | 제목에 맞춰 들여씀(+58) | 행 전체 폭 | 정렬 규칙 상이 |
| L-16 | 행 hover 레이어 | `.l-task-bg` 616×40 별도 요소 | 없음 | 구조 부재 |
| L-17 | 드래그 핸들 / more | 12×12 각각 존재(hover) | 둘 다 없음 | 구조 부재 |

### 1.4 원인

- **L-01·L-02 (가장 근본).** **문제는 Detail 열의 부재가 아니다.** 두 제품 모두 Detail을 인라인 컬럼으로 갖고 있다(TickTick `.g-right` 500, 현재 앱 `aside.tm-drawer.is-inline-drawer` 400, 둘 다 오버레이 아님). 차이는 **그 열을 언제 확보하느냐**다. TickTick은 태스크 선택 여부와 무관하게 열을 잡아두고 비어 있을 때 `.empty-detail-wrapper`를 그리므로 **리스트 폭이 650으로 고정**된다. 현재 앱은 선택했을 때만 열을 만들므로 **리스트가 1136에서 672로 줄며 모든 행이 재배치**된다. 즉 L-02는 "콘텐츠 열이 너무 넓다"가 아니라 **"콘텐츠 열 폭이 선택에 따라 흔들린다"**가 정확한 기술이다. 부수적으로, 선택되지 않은 기본 상태의 1136px 폭은 14px 한 줄의 줄 길이를 읽기 권장 범위 밖으로 밀어낸다.
- **L-07·L-08.** 현재 앱 사이드바는 30px 격자다. 선행 문서 §11.2가 "일정한 36px navigation rhythm"을 요구했는데, 실측은 30이고 TickTick 실측도 **36(step 38)**이다. 즉 설계서의 36은 맞았고 구현이 30으로 갔다.
- **L-03·L-05.** Rail은 우리가 더 넓은데(56) 아이콘은 더 작다(20 vs 28). TickTick은 좁은 기둥에 큰 아이콘, 우리는 넓은 기둥에 작은 아이콘 — 밀도 인상이 반대로 간다.
- **L-12·L-13·L-14.** 행이 4px 낮은 것보다 **체크박스가 없는 것**이 크다. TickTick 행의 좌측 58px는 드래그(3) + 체크박스(34) + 여백으로 짜인 고정 갱(gutter)이고, 제목은 그 뒤에서 시작한다. 현재 앱은 갱이 없어 제목이 +4에서 시작한다. L-15의 구분선 들여쓰기도 이 갱의 존재를 전제로 한 규칙이다.
- **L-11.** 타이틀이 2px 크고 굵기가 한 단계 높다(700 vs 600). 헤더가 8px 낮은데 글자는 더 크므로 헤더 내부 여백이 상대적으로 더 좁다.

### 1.5 수정 제안

각 항목은 독립적으로 적용 가능하되, **P1을 먼저 결정하지 않으면 나머지 수치가 다시 흔들린다.**

**P1 — 리스트 열 폭 안정화 (결정 필요, §1.7)**

Detail 열은 이미 있으므로 새로 만들 것은 없다. 정할 것은 **언제 확보하느냐**다.
- (a) TickTick처럼 Detail 열을 **항상 확보**하고 비어 있을 때 빈 상태를 그린다. 리스트 폭이 상시 고정된다.
- (b) Detail은 조건부로 두되 리스트 열에 `max-width`를 줘, 열려 있든 아니든 리스트 폭이 같게 만든다. 선택 시 우측에 여백이 남는다.
- (c) 현행 유지 (선택할 때마다 1136 ↔ 672 재배치).

**P2 — 네비게이션 격자 36으로 통일**
- 사이드바 행 30 → 36, step 31 → 38, radius 6 → 10.
- Rail step 44 → 50, 폭 56 → 50, 아이콘 20 → 28.

**P3 — Task row 재구성**
- 행 높이 36 → 40.
- 좌측 갱 신설: 드래그 핸들 12×12 @+3, 체크박스 17×17 @+34, 제목 @+58.
- 구분선을 행 전체 폭에서 제목 기준 들여쓰기로 변경.
- hover 배경을 행 자체가 아닌 내부 레이어로 분리(좌우 인셋 16).

**P4 — Header**
- 높이 56 → 64, 타이틀 22/700 → 20/600.

### 1.6 검증 조건

구현 후 아래가 **측정으로** 참이어야 한다. "더 비슷하다"는 통과 기준이 아니다.

| # | 검증문 |
|---|---|
| V1-1 | 1440×900에서 **태스크 선택 전과 후의 리스트 열 폭이 같다** (차이 ≤ 2px) |
| V1-2 | 사이드바 행 `getBoundingClientRect().height === 36`, 연속 두 행의 `y` 차 === 38 |
| V1-3 | Rail 폭 50, 아이템 step 50, 아이콘 28×28 |
| V1-4 | Task row 높이 40, 연속 두 행 `y` 차 40 |
| V1-5 | Task row에 체크박스 요소가 존재하고 그 `x`가 행 `x` + 34±2 |
| V1-6 | Task row 제목 요소의 `x`가 행 `x` + 58±2 |
| V1-7 | 구분선 요소의 `x`가 제목 `x`와 동일(±2), 폭이 행 폭보다 작음 |
| V1-8 | Header 높이 64, 타이틀 font-size 20 / font-weight 600 |

### 1.7 결정이 필요한 항목

| # | 결정 | 선택지 | 영향 |
|---|---|---|---|
| D1-1 | **이미 있는 Detail 열을 기본으로 확보할 것인가** | (a) 상시 확보 + 빈 상태 (b) 조건부 유지 + 리스트 `max-width` (c) 현행 | 최대. L-01·L-02가 여기 종속. Detail 열 자체는 이미 존재하므로 구현 부담은 작다 |
| D1-2 | Rail을 50으로 좁힐 것인가 | 좁힘 / 56 유지 | 설계서 §2.3.3이 56을 명시. 설계서를 고칠지 결정 필요 |
| D1-3 | 사이드바 폭 기준선 | TickTick 기본 240 채택 / 현행 248 유지 | TickTick은 사용자 리사이즈 가능(핸들 5px). 우리도 이미 리사이즈 지원 — 기본값만의 문제 |
| D1-4 | Task row 높이 40 채택 시 밀도 토큰 | `20-density.css` 전면 조정 / 리스트만 예외 | 다른 화면(Today, Calendar)의 행과 어긋날 수 있음 |

---

## 부록 A — FocusFlow 전 화면 실측 (1440×900, dark)

Stage 1은 리스트 화면만 다뤘다. 나머지 Rail 모듈을 같은 스크립트로 잰 결과다. Stage 2(Visual Language)의 "현재 앱" 절반에 해당한다.

### A.1 셸 — 화면마다 다르다

| 경로 | 화면 | 사이드바 | main | main padding | scrollHeight |
|---|---|---|---|---|---|
| `/list/:id` | Tasks 리스트 | `.tm-sidebar` **248** | 1136×900 | `16 32 24` | 900 |
| `/app` | Today | `.tm-sidebar` **248** | 1136×900 | `24 32` | 900 |
| `/board` | Matrix | **없음** | 1384×900 | `24 32` | 900 |
| `/calendar` | Calendar | `.gcal-sidebar` **220** | 1384×900 | `24 32` | 900 |
| `/focus` | Focus | **없음** | 1384×900 (`.foc-page` 1320) | `0 0 28` | **1172** |
| `/settings` | Settings | **없음** | 1384×900 | `24 32` | 900 |

- 캔버스 배경은 여섯 화면 모두 `#101012` (lum .0052)로 **일치**한다.
- 사이드바 폭이 **3종**이다: 248 / 220 / 없음. Rail만 여섯 화면 공통(56).
- main padding이 리스트 화면만 `16 32 24`이고 나머지는 `24 32`다.
- Focus만 세로로 넘친다(1172 > 900).

### A.2 radius — 여섯 화면 합집합 13종

| 화면 | 관측된 radius (빈도순) |
|---|---|
| Tasks 리스트 | 6×21, 10×7, 4×5, 8×3, 50%×2, 7×2 |
| Today | 8×6, 10×6, 12×3, 999px×3, 14×2, 50%×2, 7×2 |
| Matrix | 10×7, **99px**×7, 12×5, 50%×5, 8×2 |
| Calendar | **9999px**×52, 10×11, 8×4, **5**×4, **4**×4, 12×3, 6×2, 999px×1 |
| Focus | **999px**×6, 50%×6, **18**×5, 12×5, 8×5, **14**×4 |
| Settings | 8×14, 50%×5, 10×4, 12×1 |

합집합: `4, 5, 6, 7, 8, 10, 12, 14, 18, 50%, 99px, 999px, 9999px`.

**pill 하나를 세 가지 철자로 쓴다** — `99px`(Matrix), `999px`(Today·Focus), `9999px`(Calendar). 셋은 렌더 결과가 같지만 토큰이 없다는 증거다. 설계서 §11.39가 정한 범위는 6~12px인데, 그 밖의 값이 7종이다.

### A.3 typography — weight 8종, 비정수 크기 5종

관측된 font-weight: `400, 500, 550, 600, 650, 700, 750, 800` — **8단계**.

관측된 font-size: `10, 10.8333, 11, 11.9, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 18, 20, 22`.
이 중 **비정수 5종**(10.8333 · 11.9 · 12.5 · 13.5 · 14.5)은 어느 것도 의도된 스케일 값으로 보기 어렵다 — 상대 단위 곱셈의 잔재다.

line-height 비율도 통일되어 있지 않다: `1.5`(대부분), `1.4`(Matrix 14/19.6), `1.3`(20/26), `1.0`(Calendar 14/14).

### A.4 shadow — 7종, 그중 3종은 색이 섞였다

| 그림자 | 어디 |
|---|---|
| `rgba(0,0,0,.30) 0 1px 2px` | Today, Matrix, Focus, Settings |
| `rgba(0,0,0,.08) 0 1px 3px` | Calendar, Settings |
| `rgba(0,0,0,.34) 0 2px 8px` | Tasks 리스트 |
| `rgba(0,0,0,.38) 0 4px 16px` | AI FAB |
| `rgba(23,28,48,.18) 0 2px 8px` | Today — **네이비 틴트** |
| `rgba(47,111,224,.28) 0 6px 16px` | Today — **블루 틴트** |
| `rgba(10,132,255,.32) 0 2px 6px` | Calendar — **블루 틴트** |

dark 테마에서 `rgba(23,28,48,…)` 같은 밝은 네이비 그림자는 어두운 배경 위에서 그림자가 아니라 **발광**으로 보인다.

### A.5 세로 격자 — 5종

| 값 | 어디 |
|---|---|
| 30 | 사이드바 행 |
| 36 | Task row |
| 40 | Rail 아이템 |
| 42 | Focus 버튼 (`.foc-options-button`, `.foc-play`) |
| **65** | `.foc-task-main` |

TickTick 실측은 사이드바 36(step 38) / Task row 40 / Rail 40(step 50) 세 값이고, 그중 둘이 40으로 겹친다.

### A.6 Focus 화면 개별 실측

| 요소 | 값 |
|---|---|
| `.foc-page` | 1320×1124, padding `0 0 28`, gap 18 |
| `.foc-card` | 792.6×614.3, padding 18, **radius 18**, bg `#1c1c1e`(lum .0117), border 1px `rgba(255,255,255,.08)`, shadow `rgba(0,0,0,.3) 0 1px 2px` |
| `.foc-options-button` | 42×42, **radius 999px** |
| `.foc-play` | 42×42, **radius 50%** |
| `.foc-task-main` | 623×**65**, radius 0, 배경 없음 |
| `.ollama-chat-fab` | 56×56, **radius 50%**, bg `#007aff`(lum .2114), shadow `rgba(0,0,0,.38) 0 4px 16px` |

`.foc-card`의 배경 `#1c1c1e`는 사이드바와 같은 밝기다. 즉 Focus 화면에서 카드는 캔버스(#101012)보다 **밝다**.

AI FAB의 `#007aff`는 lum .2114로, 이 화면에서 **가장 밝은 면**이다. 캔버스 대비 40배.

### A.7 이 부록이 Stage 2에 남기는 질문

| # | 결정 |
|---|---|
| DA-1 | radius 토큰을 몇 개로 확정할 것인가. TickTick 실측(사이드바 10 / 섹션 6)과 맞출지, 자체 스케일을 정할지 |
| DA-2 | pill 세 철자(`99/999/9999px`)를 하나로 통일 — 어느 것으로 |
| DA-3 | font-weight 8단계를 몇 단계로 줄일 것인가 |
| DA-4 | 비정수 font-size 5종을 정수 스케일로 되돌릴 것인가 |
| DA-5 | 색이 섞인 그림자 3종을 중립 그림자로 통일할 것인가 |
| DA-6 | 사이드바 폭 3종(248/220/없음)을 하나로 묶을 것인가. Calendar·Matrix·Focus·Settings에 Context Sidebar를 줄지 말지의 IA 결정이 선행 |
| DA-7 | `.foc-task-main` 65px 격자를 유지할 것인가 |

---

## Stage 2 — Visual Language Audit

측정 조건: 1440×900. TickTick은 Appearance > Color Series에서 `Dark` ↔ `Default`(라이트)를 전환해 각각 측정했고, 측정 후 `Dark`로 복구했다. 전환 시 TickTick이 "Just once"(임시 적용, 자동 전환 설정 유지)를 제안해 그것으로 적용했으므로 계정 설정은 바뀌지 않았다.

### 2.1 Surface hierarchy

**TickTick 실측**

| 영역 | dark | lum | light | lum |
|---|---|---|---|---|
| Rail | `#242424` | .0176 | `#f5f5f5` | .9131 |
| Sidebar | `#1c1c1c` | .0116 | `#ffffff` | 1.0000 |
| List column | `#1c1c1c` | .0116 | `#ffffff` | 1.0000 |
| Detail pane | `#1c1c1c` | .0116 | `#ffffff` | 1.0000 |

**TickTick의 표면은 두 개뿐이다.** Rail 하나, 나머지 전부 하나. 사이드바와 콘텐츠는 **같은 색**이고, 둘을 가르는 것은 채움이 아니라 1px 경계(`rgba(…,.05)`)와 hover뿐이다.

방향은 테마에 따라 뒤집힌다:
- dark — Rail이 콘텐츠보다 **밝다** (.0176 > .0116)
- light — Rail이 콘텐츠보다 **어둡다** (.9131 < 1.0)

즉 규칙은 "Rail이 밝다/어둡다"가 아니라 **"Rail만 콘텐츠 평면에서 한 칸 물러나 있고, 그 방향은 테마가 정한다"**이다.

**현재 앱 실측**

| 영역 | dark | lum | light | lum |
|---|---|---|---|---|
| Main(캔버스) | `#101012` | .0052 | `#f2f2f7` | .9307 |
| Rail | `#161618` | .0081 | `#f7f7f8` | .9307 |
| Sidebar | `#1c1c1e` | .0117 | `#fafafb` | .9566 |

**차이**

| # | 항목 | TickTick | 현재 앱 |
|---|---|---|---|
| V-01 | 표면 단계 수 | **2** | **3** |
| V-02 | 사이드바 vs 콘텐츠 | **동일 색** | 사이드바가 더 밝음 (양 테마) |
| V-03 | dark에서 가장 밝은 면 | Rail | 사이드바 |
| V-04 | light에서 가장 밝은 면 | 사이드바 = 콘텐츠 (동률 1.0) | 사이드바 |

**원인.** 설계서 §11.6은 `Rail → Sidebar → Main` 순으로 밝아지는 **3단계**를 요구했고, 구현은 그 순서를 뒤집었다(`Main < Rail < Sidebar`). 그런데 실측해 보면 **기준 제품에는 3단계 자체가 없다.** 선행 문서 `TICKTICK_VISUAL_LANGUAGE_PLAN.md` §V.2.1이 "TickTick은 정확히 반대로, 사이드바가 가장 가라앉고 콘텐츠 영역이 가장 밝다"고 적은 것은 **측정으로 확인되지 않는다** — 두 면은 같은 색이다. 구현이 설계서를 어긴 것도 사실이고, 설계서가 기준 제품을 잘못 기술한 것도 사실이다.

### 2.2 Radius

| | TickTick (light, 기본 레이아웃) | 현재 앱 (6화면 합집합) |
|---|---|---|
| 값 | `6, 8, 10, 50%, 9999px` — **5종** | `4, 5, 6, 7, 8, 10, 12, 14, 18, 50%, 99px, 999px, 9999px` — **13종** |
| pill 철자 | `9999px` **1종** | `99px` · `999px` · `9999px` **3종** |
| 최빈값 | `10px` ×16 | 화면마다 다름 (6 / 8 / 10 / 9999) |

TickTick은 사이드바 행 10, 섹션 헤더 6, 나머지 8과 pill. 현재 앱은 같은 역할의 요소가 화면마다 다른 값을 쓴다.

**단서:** 위 5종은 **기본 레이아웃**에서 잰 값이다. 이후 Date Picker 팝오버를 실측한 결과 **radius 14px**가 추가로 확인되었다(§3.6). 즉 TickTick의 실제 집합은 `6, 8, 10, 14, 50%, 9999px`이고, **14는 오버레이 전용**이다. 오버레이는 radius와 그림자를 함께 올려 평면에서 분리한다.

### 2.3 Typography

| | TickTick (light) | 현재 앱 (6화면 합집합) |
|---|---|---|
| font-size | `12, 14, 20` — **3종** | `10, 10.8333, 11, 11.9, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 18, 20, 22` — **15종** |
| 비정수 크기 | **0** | **5종** |
| font-weight | `400, 600, 700` — **3종** | `400, 500, 550, 600, 650, 700, 750, 800` — **8종** |
| 본문 | 14px / 20 / w400 | 13~14px / 19.5~21 / w400 |
| 화면 제목 | 20px / 28 / w600 | 20~22px / 26~33 / w700 |
| letter-spacing | `normal` | `-0.12 ~ -0.484` |

TickTick은 12/14/20 세 크기와 400/600/700 세 굵기로 전 화면을 짠다. 현재 앱은 크기 15종 · 굵기 8종이고, 그중 다섯 크기는 정수도 아니다.

### 2.4 Shadow

| | TickTick | 현재 앱 |
|---|---|---|
| 기본 레이아웃 | **0종** — 리스트 화면 전체에 `box-shadow` 없음 | **7종** |
| 색 섞인 그림자 | 0 | **3종** (네이비 1, 블루 2) |
| 오버레이 | Settings 모달에 `shadow-default` 존재 | 동일 그림자를 레이아웃에도 사용 |

TickTick은 그림자를 **오버레이 전용 신호**로 쓴다. 평면 위에 떠 있는 것만 그림자를 갖는다. 현재 앱은 카드·행·버튼에도 그림자를 주므로 그 신호가 구분력을 잃는다.

### 2.5 Iconography

| | TickTick | 현재 앱 |
|---|---|---|
| Rail 아이콘 | 28×28 | 20×20 (stroke 1.7) |
| 사이드바 아이콘 | 20×20 | 20×20 |
| 행 내부 | 12×12 (드래그·more), 17×17 (체크박스) | 없음 |
| 관측 크기 종수 | `12, 14, 16, 17, 20, 24, 28` | `20` (리스트 화면 단일) |

TickTick은 **역할별로 크기가 다르다**(칩 12 / 체크 17 / 사이드바 20 / Rail 28). 현재 앱은 리스트 화면에서 20 하나만 쓴다 — 통일된 것이 아니라 **역할 구분이 없는 것**에 가깝다.

### 2.6 Accent 사용 규칙

| | TickTick | 현재 앱 |
|---|---|---|
| accent | `#4772fa` | `#007aff` |
| 채움 사용처 | 측정된 base 화면에서 **채움 없음** — accent는 텍스트/아이콘 색으로만 (12px w400 `#4772fa`) | FAB 56×56 100% 채움, primary 버튼 3종 |
| 위험/기한 | `#e03131` (12px w400) | 미측정 |
| 뮤티드 텍스트 | `#191919/0.4`, `#191919/0.3`, `#191919/0.2` — **같은 잉크의 알파 단계** | `#8e8e93`, `#d1d1d6` — **별도 회색 토큰** |

TickTick의 뮤티드 위계는 **한 잉크의 불투명도 단계**(1.0 / .4 / .3 / .2)로 만들어진다. 어떤 배경 위에 놓여도 관계가 유지된다. 현재 앱은 배경과 무관한 고정 회색을 쓴다.

### 2.7 수정 제안

- **S1. 표면을 3단계에서 2단계로 줄인다.** 사이드바 배경을 콘텐츠와 동일하게 만들고, 경계는 1px + hover로만 표현. Rail만 별도 톤을 유지하되 방향은 테마별로 (dark: 밝게, light: 어둡게).
- **S2. radius 토큰을 5개로 확정** — `6 / 8 / 10 / 50% / 9999px`. `99px`·`999px` 제거, 4·5·7·12·14·18 폐기.
- **S3. type 스케일을 정수 3~5종, weight 3종으로 축소.** 비정수 5종 제거가 최우선.
- **S4. 그림자를 오버레이 전용으로 제한.** 색 섞인 그림자 3종 폐기, 중립 1종만 남김.
- **S5. 뮤티드 회색을 알파 단계로 전환** — 고정 회색 토큰 대신 본문 잉크의 알파.
- **S6. 아이콘 크기를 역할별로 분리** (Rail 28 / 사이드바 20 / 행 내부 12·17).
- **S7. AI FAB의 accent 채움 재검토** — 현재 화면에서 가장 밝은 면(lum .2114, 캔버스의 40배)이고, TickTick base 화면에는 accent 채움이 존재하지 않는다.

### 2.8 검증 조건

| # | 검증문 |
|---|---|
| V2-1 | 사이드바와 리스트 열의 유효 배경색이 **동일** (양 테마) |
| V2-2 | Rail의 lum이 dark에서 콘텐츠보다 크고, light에서 작다 |
| V2-3 | 전 화면 `border-radius` 실측 집합의 크기 ≤ 5, pill 철자 1종 |
| V2-4 | 전 화면 `font-size` 실측 집합에 비정수 값 0개, 크기 ≤ 5종, weight ≤ 3종 |
| V2-5 | `main` 하위에서 `box-shadow !== none`인 요소 수 0 (오버레이 제외) |
| V2-6 | 색 섞인 그림자(`rgb`의 R·G·B가 서로 다른 그림자) 0개 |

### 2.9 결정이 필요한 항목

| # | 결정 | 비고 |
|---|---|---|
| D2-1 | **표면 2단계로 갈 것인가** | 설계서 §11.6의 3단계 규정을 고쳐야 한다. 실측은 기준 제품에 3단계가 없음을 보임 |
| D2-2 | Rail 톤의 방향을 테마별로 뒤집을 것인가 | 현재는 양 테마 모두 같은 방향 |
| D2-3 | 확정할 radius 5종 | TickTick 실측값 채택 / 자체 스케일 |
| D2-4 | type 스케일을 무엇으로 확정할 것인가 | TickTick의 12/14/20 3종은 현재 앱의 정보 밀도에 부족할 수 있음 |
| D2-5 | 뮤티드를 알파 단계로 바꿀 것인가 | `01-base.css`의 회색 토큰 전면 교체 |
| D2-6 | AI FAB를 어떻게 할 것인가 | 제거 / 축소 / 뮤티드화 / 유지 |

---

## Stage 1 보강 실측 — 태스크 선택 상태의 셸

Stage 1 최초 측정은 태스크가 선택되지 않은 상태만 잡았다. 아래가 선택 상태를 포함한 실측이며, **§1.3의 L-01·L-02와 §1.4·§1.5·§1.6·§1.7은 이 결과에 맞게 이미 정정되어 있다.** 이 절은 그 근거 데이터다.

| 상태 | Rail | Sidebar | Main(리스트) | Detail | 합 |
|---|---|---|---|---|---|
| 현재 앱 — 태스크 미선택 | 56 | 248 | **1136** | 없음 | 1440 |
| 현재 앱 — 태스크 선택 | 56 | 248 | **736** (리스트 672) | **400** | 1440 |
| TickTick — 미선택 | 50 | 240 | **650** | **500** | 1440 |
| TickTick — 선택 | 50 | 240 | **650** | **500** | 1440 |

현재 앱의 Detail은 `aside.tm-drawer.is-inline-drawer`이고 `position: static`이다 — **오버레이가 아니라 인라인 컬럼**이다. 두 제품 모두 Detail을 인라인 컬럼으로 갖고 있다.

**따라서 기록되어야 할 차이는 열의 유무가 아니라 아래 둘이다.**

| # | 항목 | TickTick | 현재 앱 |
|---|---|---|---|
| L-01 | Detail 열의 **기본 상태** | 선택과 무관하게 항상 확보, 비면 빈 상태를 그림 | 태스크 선택 시에만 생성 |
| L-02 | 리스트 열 폭의 **안정성** | 항상 650 (선택해도 안 움직임) | **1136 ↔ 672** 재배치 |

TickTick은 Detail 열을 미리 확보해 **리스트 폭을 안정시킨다**. 현재 앱은 선택할 때마다 리스트가 464px 줄어들어 모든 행이 재배치된다.

---

## Stage 3 — Component Anatomy Audit (부분)

### 3.1 Task Row

| 부위 | TickTick | 현재 앱 |
|---|---|---|
| 행 | `.l-task` 40h, padding `0 0 0 18` | `.tm-task` 36h, padding `0 4` |
| 드래그 핸들 | `span.drag` 12×12 @+3 (`invisible`, hover 시 표시) | 없음 |
| 체크박스 | `.checker` **17×17** @+34, 히트영역 `.t-check` 17×**40** | **없음** |
| 제목 | `.title-wrap` @+58, 14px / **line-height 40** | `.tm-task-title` @+4, 14px / 21 |
| 구분선 | `.t-line` 562×**1** @+58, `#191919/.05` (light) | `li` 자체의 `border-bottom` 1px, 행 전체 폭 |
| hover 배경 | `.l-task-bg` 616×40 @+16 — **별도 레이어** | 없음 |
| more 메뉴 | `.t-menu-toggle` 12×12 @+634 | 없음 |
| 우선순위 | 미측정 | 렌더 없음 (high/medium 지정해도 표식 없음) |
| 날짜 | 미측정 | `.tm-task-due` 76.4×18, 12px / 18 |

체크박스 히트영역이 17×**40**인 점이 설계다 — 시각 크기는 17이지만 클릭 영역은 행 높이 전체다.

### 3.2 Task Detail

| | TickTick | 현재 앱 |
|---|---|---|
| 형태 | `.g-right` **인라인 컬럼** 500×900 @940 | `aside.tm-drawer` **인라인 컬럼** 400×900 @1040 |
| position | — | `static` |
| 경계 | border-left 1px `#ffffff/.1` | border-left 1px `#ffffff/.08` |
| 그림자 | 없음 | 없음 |
| 리사이즈 | `.detail-dragger` 5px (좌측 가장자리) | 없음 |
| URL | `#q/today/tasks/<taskId>` — **경로 세그먼트** | `?task=t-a2` — **쿼리 파라미터** |
| 구조 | header 499×66 / body 499×778 / footer 499×48 | head 367×22 / title input 367×40 / fields 367×109 / notes 367×120 / subtasks |
| header 내용 | 체크 29×30, 타임카드 394×48, 우선순위 36×30 | 완료 체크박스 13×13 + 닫기 25×22 |
| footer | 프로젝트 선택 240×48 + 아이콘 3개 18×18 | 없음 |
| 제목 | (본문 에디터) | `input.tm-drawer-title` 367×40 |

TickTick은 **툴바 header + 스크롤 body + 액션 footer** 3단이고, 현재 앱은 **필드 나열식 폼**이다. TickTick의 header에는 완료·시간·우선순위가 버튼으로 있고, 현재 앱은 같은 정보를 `select` 두 개와 `input` 하나로 받는다.

### 3.3 Modal

| | TickTick |
|---|---|
| Add List | **800×680** @(320,110) |
| Settings | **800×680** @(320,110) |
| 클래스 | `absolute overflow-hidden shadow-default` |
| 그림자 | 있음 (`shadow-default`) — 기본 레이아웃에는 그림자가 0인데 모달에는 있다 |

두 모달의 크기와 위치가 **동일**하다. 모달은 하나의 고정 규격을 쓴다.

Add List 모달의 내부 필드: Name 입력 / List Color(스와치 9) / View Type(List·Kanban·Timeline 3) / Folder / List Type / Show in Smart List / Cancel·Add.

현재 앱의 대응물은 미측정 (§3.5).

### 3.4 Confirm Dialog

TickTick은 테마 변경 시 확인 대화상자를 띄운다: 제목 `Change Theme`, 설명문, 라디오 2개(`Just once` / `Always`), 버튼 `Close` / `Confirm`. **모달 위에 뜨는 2차 모달**이다.

### 3.6 Date Picker (TickTick, 실측)

`.td-timecard` 클릭으로 열린다.

| 항목 | 값 |
|---|---|
| 요소 | `.timecard.pop-shadow` |
| 크기·위치 | **262×541** @(995, 47) |
| position / z-index | `absolute` / **1050** |
| radius | **14px** (기본 레이아웃에 없는 값 — 오버레이 전용) |
| 배경 | `#242424` — **Rail과 같은 색** |
| 경계 | 1px `#ffffff/0.1` |
| 그림자 | `rgba(0,0,0,.2) 0 16px 40px` |
| 날짜 셀 | **26×26** |
| 버튼 | `Clear` 116×30 r8 (투명) / `OK` 104×30 r8 **`#4772fa` 채움** |

두 가지가 §2.1·§2.6을 보강한다.

1. **dark 테마의 "떠 있는 면"은 `#242424`다.** Rail과 팝오버가 같은 색을 쓴다. 즉 TickTick의 dark 표면은 `#1c1c1c`(콘텐츠 평면)과 `#242424`(크롬·오버레이) 두 장이고, Rail은 "물러난 면"이 아니라 **떠 있는 면과 같은 층**이다.
2. **accent 채움은 존재한다** — 단, primary action 버튼(`OK`)에 한정된다. 기본 레이아웃에는 없다는 §2.6의 관찰은 유지되지만, "TickTick에 accent 채움이 없다"로 일반화하면 틀린다.

### 3.7 아직 못 잰 것

| 항목 | 이유 |
|---|---|
| TickTick Context Menu | 우클릭 필요 |
| TickTick 버튼·입력 상세 | 모달을 다시 열어야 함 |
| 현재 앱 Modal / Popover 전수 | Command Menu(Ctrl+K), Add List, Date Picker |
| 양쪽 hover/focus/pressed 상태 | Stage 6. 실제 포인터 입력 필요 |

---

## Stage 4 — Navigation / IA Audit (부분)

### 4.1 URL 문법

**TickTick** — 전부 hash 라우팅, 단일 문서

| 화면 | URL |
|---|---|
| Rail: Tasks | `#p/inbox/kanban` |
| Rail: Calendar | `#c/all/calendar/m` |
| Rail: Focus | `#focus` |
| Rail: (4번째) | `#s` |
| Rail: Matrix | `#m/all/matrix` |
| Rail: Habit | `#q/all/habit` |
| 리스트(List 뷰) | `#p/<projectId>/tasks` |
| 리스트(Kanban 뷰) | `#p/<projectId>/kanban` |
| 스마트리스트 Today | `#q/today/tasks` |
| **태스크 선택** | `#q/today/tasks/<taskId>` |
| 설정 | `#q/today/tasks?modalType=settings&tabs=appearance` |

규칙 두 개가 보인다:
1. **뷰 종류가 경로의 마지막 세그먼트다** — `/tasks` vs `/kanban`. 같은 리스트의 다른 뷰가 다른 URL을 갖는다.
2. **모달은 현재 화면의 URL에 쿼리로 얹힌다** — 화면을 떠나지 않는다. `modalType`·`tabs` 두 파라미터.

**현재 앱** — history API, 실제 경로

| 화면 | URL |
|---|---|
| Tasks 홈 | `/today` |
| 레거시 Today | `/app` |
| Matrix | `/board` |
| Calendar | `/calendar` |
| Focus | `/focus` |
| Settings | `/settings` |
| Spaces | `/spaces` |
| Scope | `/today` · `/upcoming` · `/inbox` · `/list/:id` · `/folder/:id` · `/tag/:id` · `/filter/:id` · `/completed` · `/wont-do` · `/trash` |
| **태스크 선택** | `?task=<taskId>` |
| 뷰 종류 | 미측정 |

### 4.2 차이

| # | 항목 | TickTick | 현재 앱 |
|---|---|---|---|
| N-01 | 라우팅 방식 | hash | history API |
| N-02 | 태스크 선택 표현 | 경로 세그먼트 `/tasks/<id>` | 쿼리 `?task=<id>` |
| N-03 | 뷰 종류 표현 | 경로 마지막 세그먼트 | 미측정 |
| N-04 | 모달 표현 | 쿼리 `?modalType=` — 화면 유지 | Settings는 **별도 경로** `/settings` — 화면을 떠남 |
| N-05 | Rail 항목 수 | 6 (Tasks·Calendar·Focus·?·Matrix·Habit) | 6 (Tasks·Matrix·Calendar·Focus·Search·Settings) |
| N-06 | Rail에 Settings | 없음 (모달) | **있음** (별도 페이지) |
| N-07 | Rail에 Search | 없음 | 있음 |

N-04/N-06이 짝을 이룬다. TickTick에서 설정은 **어디서든 현재 화면 위에 뜨는 모달**이고 뒤로 가기로 닫힌다. 현재 앱에서 설정은 **가는 곳**이라 리스트를 떠나야 하고 돌아오려면 다시 이동해야 한다.

### 4.3 아직 못 잰 것

| 항목 | 이유 |
|---|---|
| Rail active state의 시각 표현 | Stage 6과 함께 |
| history 스택 동작(뒤로/앞으로) | 실제 내비게이션 시퀀스 필요 |
| focus 이동·scroll 복원 | 실제 상호작용 필요 |
| 현재 앱의 뷰 종류 URL | 미측정 |

---

## Stage 0.3 — 좌표계 캘리브레이션 검증 (Stage 5·6·8의 전제)

Stage 5·6은 실제 포인터 입력이 필요하다. 앞선 시도가 실패한 원인과, 재개 조건이 성립함을 확인한 기록이다.

### 0.3.1 실패했던 상태

브라우저 패널의 렌더 표면이 뷰포트와 어긋나 있었다. 실측 증상:

- 같은 세션 안에서 입력 배율이 2.24 → 4.67로 변함
- tool 좌표 `(400,250)` 전송 → 페이지가 `clientX/Y = (1868,1170)` 수신. **1440×900 뷰포트 밖**
- `hover` 후 `document.querySelectorAll(':hover')`가 **빈 배열**
- 스크린샷에서 페이지가 프레임 좌상단 1/4에만 렌더

**조치:** 새 탭(`tabs_create`)을 열어 렌더 표면을 재설정했다. 패널 자체를 닫지 않았으므로 TickTick 세션은 유지되었다.

### 0.3.2 검증 조건 1–2: viewport / zoom / dpr / screenshot

| 항목 | 현재 앱 | TickTick |
|---|---|---|
| `innerWidth × innerHeight` | 1440 × 900 | 1440 × 900 |
| `documentElement.clientWidth/Height` | 1440 × 900 | 1440 × 900 |
| `visualViewport.scale` | **1** | **1** |
| `outerWidth / innerWidth` | **1** | **1** |
| `devicePixelRatio` | 2 | 2 |
| screenshot 실제 픽셀 | 800 × 500 | 800 × 500 |

zoom 100%가 두 값(`visualViewport.scale`, `outerWidth/innerWidth`)으로 교차 확인된다.

### 0.3.3 검증 조건 3: 4모서리 + 중앙 좌표 대조

문서상 기대 배율은 `1440/800 = 1.8`이지만, **실측 배율은 4.70**이다. 첫 검증에서 `(10,10)` 한 점만 도달하고 나머지 4점은 뷰포트 밖으로 나가 이벤트가 발생하지 않았다.

```
실측 입력 배율 4.70  =  스크린샷 배율 2.35  ×  devicePixelRatio 2
```

입력 좌표에만 dpr이 한 번 더 곱해진다. 이 매핑(`CSS = tool × 4.70`)으로 다시 검증한 결과:

| 목표 CSS | 보낸 tool | 현재 앱 수신 | 오차 | TickTick 수신 | 오차 |
|---|---|---|---|---|---|
| (20, 20) | (4, 4) | (18, 18) | −2, −2 | (18, 18) | −2, −2 |
| (1420, 20) | (302, 4) | (1421, 18) | +1, −2 | (1421, 18) | +1, −2 |
| (20, 880) | (4, 187) | (18, 880) | −2, 0 | (18, 880) | −2, 0 |
| (1420, 880) | (302, 187) | (1421, 880) | +1, 0 | (1421, 880) | +1, 0 |
| (720, 450) | (153, 96) | (718, 452) | −2, +2 | (718, 452) | −2, +2 |

**두 제품에서 오차가 완전히 동일하다.** 최대 오차 2px이고 계통 편차는 없다 — tool 좌표가 정수라 1 step = 4.70 CSS px로 양자화된 결과다. Task row 높이가 36~40px이므로 이 정밀도로 행을 정확히 지목할 수 있다.

### 0.3.4 검증 조건 4: `:hover`가 실제 요소에 잡히는가

| | `:hover` 체인 깊이 | 말단 요소 |
|---|---|---|
| 현재 앱 | 7 | `main.tm-main` |
| TickTick | 13 | `div.antiscroll-inner` (태스크 리스트 내부) |

둘 다 빈 배열이 아니고 의도한 영역까지 내려간다.

### 0.3.5 검증 조건 5: 판정

**통과.** 두 제품이 동일한 viewport·zoom·dpr을 갖고, 동일한 좌표 매핑과 동일한 오차를 보이며, `:hover`가 양쪽에서 실제 요소를 잡는다. Stage 5·6·8을 재개할 수 있다.

**운용 규칙:** tool 좌표는 `CSS / 4.70`으로 계산한다. 이 배율은 패널 크기가 바뀌면 달라지므로, **세션 중 패널 크기가 바뀌면 §0.3.3을 다시 수행**하고 배율을 재도출한다.

---

## Stage 6 — State Matrix Audit (진행 중)

### 6.0 방법

이 문서의 원칙에 따라 **CSS 규칙 선언을 근거로 상태를 확정하지 않는다.** 절차는 두 단계다.

1. **사전 인벤토리** — 현재 앱 CSS에서 상태 선택자 후보를 뽑는다. TickTick CSS는 cross-origin으로 차단되어(스타일시트 8개 중 3개 blocked, 나머지에 해당 규칙 없음) 같은 작업이 불가능하므로, 이 목록은 **어디를 측정할지 정하는 용도**일 뿐 결론이 아니다.
2. **실측 검증** — 실제 포인터를 올린 뒤 `element.matches(':hover')`로 상태 진입을 확인하고, `getComputedStyle`로 default와 비교한다.

### 6.1 사전 인벤토리 (현재 앱, **미검증 후보**)

| 상태 | 관측된 선택자 예 | Task row(`.tm-task`)에 존재? |
|---|---|---|
| `:hover` | `.tm-row:hover`, `.ff-btn-primary:hover`, `.rail-item` 계열 다수 | **후보 없음** |
| `:active` | `.rail-item:active`, `button:active`, `.ff-board-card:active` | **후보 없음** |
| `:focus-visible` | `.rail-item:focus-visible`, `.tdy-btn:focus-visible` 등 12+ | **후보 없음** |
| selected | `.ff-task-row.is-selected`, `.tlv-row.is-selected`, `.spt-row.is-selected` | **후보 없음** |
| current | `.tm-row.is-current`, `.tm-row.is-current:hover`, `.tm-view.is-current` | **후보 없음** |
| dragging | `.tm-card.is-dragging`, `.motion-task-row.is-dragging` | **후보 없음** |
| disabled | `:disabled` 다수 | 해당 없음 |
| done | `.tm-task-title.is-done` | **있음** (제목에만) |
| open | `.tm-task.is-open` | **있음** |

`.tm-task` 계열에서 발견된 규칙은 `.tm-task`, `.tm-task.is-open`, `.tm-task-title.is-done` 셋뿐이다. 사이드바 행(`.tm-row`)에는 `:hover`와 `.is-current`가 있는데 **Task row에는 없다**는 것이 검증할 가설이다.

### 6.2 실측 — Task row `hover` (검증 완료)

측정 방법: 행 중심의 CSS 좌표를 구해 `tool = CSS/4.70`으로 포인터를 올리고, `matches(':hover') === true`를 확인한 뒤 default와 비교.

**TickTick** (`.l-task` 3번째 행, 650×40 @290,227 → tool (131,53))

| 요소 | default | hover | 변화 |
|---|---|---|---|
| 행 자체 | `transparent` | `transparent` | 없음 |
| `.l-task-bg` 616×40 | `transparent` | **`#ffffff/0.05`**, radius **10px** | **배경 등장** |
| `.drag` 12×12 | `visibility: hidden` | **`visible`** | **등장** |
| `.t-menu-toggle` 12×12 | `visibility: hidden` | **`visible`** | **등장** |

`rowIsHovered: true`, hover 체인 말단 `div.title`.

**현재 앱** (`.tm-task` 3번째 행, 1072×36 @336,198 → tool (186,46))

| 요소 | default | hover | 변화 |
|---|---|---|---|
| 행 배경 | `transparent` | `transparent` | **없음** |
| 행 색상 | `#f5f5f7` | `#f5f5f7` | **없음** |
| 하단 border | `1px #ffffff/0.08` | `1px #ffffff/0.08` | **없음** |
| transform | `none` | `none` | **없음** |
| 내부 버튼 cursor | — | `pointer` | 커서만 |

`rowIsHovered: true`, hover 체인 말단 `span.tm-task-title`. 즉 **hover 상태에는 확실히 진입했고, 시각 변화가 하나도 없다.** 사전 인벤토리의 가설이 실측으로 확인되었다.

**차이 S-01.** TickTick은 hover에서 **세 가지가 동시에** 바뀐다(배경 레이어 등장 + 드래그 핸들 등장 + more 메뉴 등장). 현재 앱은 커서 외에 **아무 피드백이 없다**. 행이 클릭 가능하다는 사실이 포인터 모양으로만 전달된다.

**원인.** hover 배경을 그릴 자리가 없다. TickTick은 `.l-task-bg`라는 전용 레이어(행보다 좌우 16px 인셋, radius 10)를 미리 깔아두고 그 배경색만 바꾼다. 현재 앱의 행은 `li` 하나에 `button` 하나가 전부라(§3.1) 인셋된 라운드 배경을 그릴 요소가 없고, 행 자체에 배경을 주면 구분선과 충돌한다.

### 6.3 실측 — Task row `pressed` (`:active`)

`mousedown` 핸들러 안에서 동기적으로 스냅샷을 떠서 측정했다. 양쪽 모두 `matches(':active') === true` 확인.

| | TickTick | 현재 앱 |
|---|---|---|
| 행 배경 | 변화 없음 | 변화 없음 |
| 배경 레이어 | `#ffffff/0.05` 유지 (hover 값) | 해당 요소 없음 |
| transform | `none` | 내부 버튼 **`scale(0.97)`** |
| 그 외 | 없음 | 없음 |

**차이 S-02.** TickTick에는 pressed 전용 표현이 **없다** — hover 상태 그대로다. 현재 앱은 내부 버튼이 3% 축소된다. 이 항목은 현재 앱이 기준 제품보다 **더 많이** 하고 있다.

### 6.4 실측 — Task row `selected`

행을 클릭한 뒤 측정.

| | TickTick | 현재 앱 |
|---|---|---|
| 상태 클래스 | 부모에 `active selected` | 행에 `.is-open` |
| 시각 변화 | `.l-task-bg` **`#ffffff/0.05` → `#ffffff/0.08`** (radius 10, 좌우 16 인셋 유지) | 행 배경 `transparent` → **`#ffffff/0.1`** (전체 폭, radius 0) |
| URL | `#q/today/tasks/<taskId>` | `?task=t-a3` |
| 포커스 이동처 | **`TEXTAREA`** (제목 인라인 편집기) | `BUTTON.tm-task-open` |

**차이 S-03.** 선택 표시의 **모양**이 다르다. TickTick은 hover와 같은 인셋·라운드 레이어의 알파만 한 단계 올린다(.05 → .08). 현재 앱은 행 전체 폭에 각진 배경을 깐다. hover가 없으므로 알파 단계로 위계를 만들 자리도 없다.

**차이 S-04.** 선택하면 TickTick은 포커스를 **제목 편집기**로 보낸다 — 선택 즉시 이름을 고칠 수 있다. 현재 앱은 행 버튼에 머문다.

### 6.5 실측 — Task row `focus-visible` (키보드)

`blur()` 후 `Tab` 한 번. 양쪽 모두 `matches(':focus-visible') === true` 확인.

| | TickTick | 현재 앱 |
|---|---|---|
| 포커스 받는 요소 | `div.l-task` (`tabindex="0"`) | `button.tm-task-open` |
| outline | `3px` **`none`** — 스타일이 none이라 **렌더되지 않음** | **`2px solid #007aff`**, offset 2px |
| box-shadow | 없음 | 없음 |
| 배경 레이어 | **`transparent`** — 변화 없음 | — |

**차이 S-05.** TickTick은 키보드 포커스에 **시각 피드백이 전혀 없다.** 포커스 링도, 배경 변화도 없다. 현재 앱은 2px accent 링을 그린다.

**이 항목은 현재 앱이 기준 제품보다 낫다.** TickTick을 따라가면 접근성이 후퇴한다 — 모사 대상에서 제외해야 할 항목으로 기록한다.

### 6.6 실측 — Task row `completed`

TickTick은 `#q/all/completed`의 리스트 행(높이 40), 현재 앱은 `/completed`의 행에서 측정.

| | TickTick | 현재 앱 |
|---|---|---|
| 상태 클래스 | 부모에 `checked` | 제목에 `.is-done` |
| 제목 색 | `#ffffff` → **`#ffffff/0.4`** (알파 단계) | `#f5f5f7` → **`#8e8e93`** (별도 회색) |
| **취소선** | **없음** (`text-decoration: none`) | **있음** (`line-through solid #8e8e93`) |
| 체크박스 | 글리프 교체 `icon-checkbox` → `icon-completed`, 색 `#ffffff/0.4` → **`#ffffff/0.12`**, 크기 17×17 유지 | 요소 자체가 없음 |
| 행 높이 | 40 유지 | 36 유지 |
| 구분선 | 562×1 유지 | 유지 |

**차이 S-06.** TickTick은 완료를 **취소선으로 표시하지 않는다.** 잉크를 40%로 낮추고 체크박스 글리프를 바꾸는 두 가지로만 말한다. 현재 앱은 취소선 + 별도 회색이고 체크박스가 없어 글리프로 말할 수단이 없다.

### 6.7 상태 매트릭스 요약

| 상태 | TickTick | 현재 앱 | 판정 |
|---|---|---|---|
| default | 배경 레이어 투명 | 평면 | — |
| **hover** | 레이어 `#ffffff/.05` + 드래그 핸들 + more 등장 | **없음** (커서만) | 현재 앱 부족 |
| **pressed** | **없음** | 버튼 `scale(0.97)` | 현재 앱 과함 |
| **selected** | 레이어 `#ffffff/.08` (인셋·라운드) | 행 전체 `#ffffff/.1` (각짐) | 모양 상이 |
| **focus-visible** | **없음** | `2px solid #007aff` | **현재 앱 우수** |
| **completed** | 잉크 40% + 글리프 교체 | 취소선 + 회색 | 표현 수단 상이 |
| dragging | 미측정 | 미측정 | — |
| disabled | 미측정 | 미측정 | — |

세 방향이 다 나온다 — 부족한 것(hover), 과한 것(pressed), 더 나은 것(focus). **"TickTick을 그대로 따른다"가 옳은 답이 아닌 항목이 실제로 존재한다**는 것이 이 표의 결론이다.

### 6.8 수정 제안

- **T1.** Task row에 hover 배경 레이어를 신설한다. 좌우 16px 인셋, radius 10, `#ffffff/0.05`. §3.1의 구조 변경(P3)과 같은 작업이다.
- **T2.** selected를 같은 레이어의 알파 한 단계 위(`#ffffff/0.08`)로 바꾼다. 현재의 전체 폭 각진 `#ffffff/0.1`을 대체한다.
- **T3.** hover에서 드래그 핸들과 more 메뉴를 등장시킨다 (요소 신설 필요).
- **T4.** completed의 취소선을 제거하고, 잉크 알파 40%로 바꾼다. 체크박스 신설 후 글리프 교체를 더한다.
- **T5.** pressed의 `scale(0.97)`은 **유지 여부를 결정**한다. 기준 제품에는 없다.
- **T6.** focus-visible 링은 **유지한다.** 기준 제품을 따르지 않는다.

### 6.9 검증 조건

| # | 검증문 |
|---|---|
| V6-1 | 행에 포인터를 올린 뒤 `matches(':hover') === true`인 상태에서, 배경 레이어의 `backgroundColor`가 default와 **다르다** |
| V6-2 | 그 레이어의 `x`가 행 `x` + 16±2, `borderRadius === 10px` |
| V6-3 | selected 상태의 레이어 배경이 hover 상태보다 알파가 높고, 두 값이 같은 색상 채널을 쓴다 |
| V6-4 | completed 행의 제목에 `text-decoration-line === 'none'` |
| V6-5 | completed 행의 제목 색이 본문 잉크와 같은 색상의 알파 변형이다 |
| V6-6 | `Tab` 이후 포커스 요소의 `outlineStyle !== 'none'` (기존 동작 유지 회귀 테스트) |

### 6.10 실측 — Sidebar row 상태

양쪽 모두 실제 포인터를 올리고 `matches(':hover') === true` 확인 후 측정.

| 상태 | TickTick | 현재 앱 |
|---|---|---|
| default | `transparent`, w400, radius **10** | `transparent`, w400, radius **6** |
| **hover** | **`#ffffff/0.03`** | **`#ffffff/0.06`** |
| **current** | **`#ffffff/0.08`**, w400 | **`#ffffff/0.1`**, **w500** |

**차이 S-07.** 두 제품 모두 알파 사다리를 쓴다. 다만 현재 앱이 **양쪽 단계 모두 더 진하고**(hover 2배, current 1.25배), current에서 **font-weight까지 500으로 올린다.** TickTick은 굵기를 건드리지 않는다 — 배경 알파 하나로만 말한다.

**교차 관찰.** TickTick의 `selected/current` 값은 Task row와 Sidebar row가 **둘 다 `#ffffff/0.08`**로 같다. hover만 표면별로 다르다(Task `.05`, Sidebar `.03`). 즉 "선택"은 앱 전역에서 한 값이고, "hover"는 밀도에 따라 조절된다. 현재 앱도 선택 값이 `.1`로 공유되어 있어 같은 구조를 갖는다 — **값만 다르고 구조는 이미 맞다.**

### 6.11 실측 — Quick Add 입력 상태

| 상태 | TickTick | 현재 앱 |
|---|---|---|
| 요소 | `.tl-quick` 내부 박스 610×39 | `.tm-quickadd-title` 611×34 |
| default 배경 | **`#ffffff/0.03`** (채워짐) | `#1c1c1e` |
| default 경계 | 1px **투명** | 1px `#ffffff/0.08` |
| radius | 10 | 8 |
| **focus 배경** | **`transparent`** (채움이 사라짐) | `#1c1c1e` (변화 없음) |
| **focus 경계** | **1px `#4772fa`** (accent) | `#ffffff/0.08` (변화 없음) |
| **focus 링** | 없음 (경계가 대신함) | **`outline: 1px auto #e59700`** |

**차이 S-08.** TickTick은 focus에서 **채움과 테두리를 맞바꾼다** — 쉴 때는 옅게 채워진 면, 편집할 때는 accent 윤곽. 상태 전이가 한 요소 안에서 완결된다.

**차이 S-09 (결함).** 현재 앱 Quick Add의 focus 표시는 `outline: 1px auto #e59700`이다. `auto` 스타일과 이 색은 **브라우저 기본 포커스 링**이며, 앱이 정의한 값이 아니다. 같은 앱의 Task row 버튼은 `2px solid #007aff`를 갖는데(§6.5) 입력은 UA 기본값으로 떨어진다 — **포커스 표현이 앱 안에서 일관되지 않는다.**

### 6.12 상태 매트릭스 (갱신)

| 표면 / 상태 | TickTick | 현재 앱 |
|---|---|---|
| Task row hover | `.05` 레이어 + 핸들 2개 | **없음** |
| Task row selected | `.08` 레이어 | `.1` 전체 폭 |
| Task row pressed | 없음 | 버튼 `scale(.97)` |
| Task row focus | **없음** | `2px solid #007aff` |
| Task row completed | 잉크 40% + 글리프 | 취소선 + 회색 |
| Sidebar row hover | `.03` | `.06` |
| Sidebar row current | `.08` | `.1` + w500 |
| Input default | `#ffffff/.03` 채움 | `#1c1c1e` + 경계 |
| Input focus | accent 경계 + 채움 제거 | **UA 기본 링** |

### 6.13 수정 제안 (추가)

- **T7.** 알파 사다리 값을 재조정한다. 선택 값은 앱 전역 1개(현재 `.1`)로 이미 통일되어 있으므로 값만 정하면 된다. hover는 표면별로 다른 값을 허용한다.
- **T8.** Sidebar current의 `font-weight: 500`을 없앨지 결정한다. TickTick은 배경만으로 말한다.
- **T9.** Quick Add 입력에 **앱이 정의한 focus 표현**을 준다. 현재 UA 기본 링이 나오는 것은 명백한 결함이다.
- **T10.** 입력의 default/focus를 "채움 ↔ 윤곽" 전이로 바꿀지 검토한다.

### 6.14 검증 조건 (추가)

| # | 검증문 |
|---|---|
| V6-7 | 앱 전체에서 `outline-style: auto`인 포커스 요소가 0개 (UA 기본 링 사용 금지) |
| V6-8 | Sidebar row와 Task row의 selected 배경 알파가 **같은 값**이다 |
| V6-9 | Quick Add 입력의 focus 상태가 default와 최소 한 개 속성에서 다르다 |

### 6.15 실측 — Button 상태

측정 대상: 양쪽의 Add List 모달 하단 버튼 쌍(secondary + primary). pressed는 버튼 위에서 누르고 **바깥에서 떼서** 클릭이 완료되지 않게 측정했다 — 두 제품 모두 리스트가 생성되지 않았음을 확인(TickTick 사이드바 10개 유지, 현재 앱 8행 유지).

**기하**

| | TickTick | 현재 앱 |
|---|---|---|
| secondary | `Cancel` **76×30** | `Cancel` **77×37** |
| primary | `Add` **76×30** | `Create` **75×37** |
| radius | **8** | **9** |
| font | 14px / w400 | 14px / w400 |
| 두 버튼 폭 | **동일 (76 = 76)** | 다름 (77 vs 75) |

**색과 상태**

| 상태 | TickTick primary | 현재 앱 primary |
|---|---|---|
| default | `#4772fa`, 텍스트 `#ffffff`, 경계 투명 | `#007aff`, 텍스트 `#ffffff`, 경계 0 |
| **hover** | **`#4063d0`** — accent 자체를 어둡게 | **변화 없음** |
| **pressed** | **`#4063d0`** — hover와 동일, 별도 표현 없음 | 색 불변, **75×37 → 73×36** (`scale(0.97)`) |
| **disabled** | 빈 이름에도 **disabled 아님** (`disabled: false`, cursor `pointer`) | **`disabled: true`**, opacity **0.5**, cursor `not-allowed` |

| 상태 | TickTick secondary | 현재 앱 secondary |
|---|---|---|
| default | bg **투명**, 텍스트 `#ffffff/0.6`, 경계 **1px `#ffffff/0.1`** | bg **`#000000/0.05`**, 텍스트 `#f5f5f7`, 경계 **0px** |

### 6.16 차이

| # | 항목 | 내용 |
|---|---|---|
| B-01 | **primary에 hover 표현이 없다** | TickTick은 accent를 `#4772fa → #4063d0`으로 어둡게 한다. 현재 앱은 `#007aff` 그대로다. 마우스를 올려도 버튼이 반응하지 않는다 |
| B-02 | pressed 표현 방식 | TickTick 없음 / 현재 앱 `scale(0.97)`. §6.3의 Task row와 같은 패턴이 버튼에도 있다 |
| B-03 | **disabled 정책이 반대** | 현재 앱은 이름이 비면 submit을 막는다(opacity .5 + not-allowed). TickTick은 막지 않는다. **현재 앱 쪽이 낫다** — 모사 대상 아님 |
| B-04 | secondary의 표현 수단 | TickTick은 **경계**로(투명 배경 + 1px 테두리), 현재 앱은 **채움**으로(`#000000/0.05` + 테두리 없음) 만든다 |
| B-05 | secondary 채움이 dark에서 거의 안 보인다 | 현재 앱의 `#000000/0.05`는 **검정 5%**다. 패널 배경이 `#1c1c1e`인 dark 테마에서 검정을 5% 얹으면 차이가 거의 없다. light 테마 값을 dark에 그대로 쓴 것으로 보인다 |
| B-06 | 버튼 쌍의 폭 | TickTick은 76/76으로 **맞춘다**. 현재 앱은 77/75로 2px 어긋난다 |
| B-07 | 뷰 타입 칩 | 현재 앱 `.tm-view.is-current`는 `#0a84ff/0.18` 채움 + `#007aff` 경계. TickTick의 대응 컨트롤은 미측정 |

### 6.17 수정 제안 (버튼)

- **B1.** primary에 hover 표현을 준다. accent를 어둡게 하는 방식(TickTick)이 채움 위에 오버레이를 얹는 방식보다 예측 가능하다.
- **B2.** secondary의 `#000000/0.05`를 테마 인식 값으로 고친다. **dark에서 사실상 표현이 없는 상태이므로 그 자체로 결함이다.**
- **B3.** 버튼 쌍의 폭을 맞춘다 (min-width 지정).
- **B4.** disabled 정책은 **유지한다.** 기준 제품을 따르지 않는다.
- **B5.** pressed의 `scale(0.97)`은 §6.13 T5와 함께 일괄 결정한다 (Task row·버튼 모두 같은 패턴).

### 6.18 검증 조건 (버튼)

| # | 검증문 |
|---|---|
| V6-10 | primary 버튼의 hover 시 `backgroundColor`가 default와 다르다 |
| V6-11 | secondary 버튼의 배경이 dark 테마에서 패널 배경과 **구별 가능하다** (휘도 차 또는 경계 존재) |
| V6-12 | 모달 하단 버튼 쌍의 `getBoundingClientRect().width`가 서로 같다 |
| V6-13 | 필수 입력이 비었을 때 submit 버튼의 `disabled === true` (회귀 방지) |

### 6.19 아직 측정하지 않은 상태

`dragging` · `disabled` · 버튼 hover/pressed · 체크박스 각 상태. TickTick 쪽 `dragging`과 체크박스는 실제 데이터를 바꾸므로 샘플 태스크 투입 후 수행한다.

---

## Stage 5 — Interaction Audit

측정 조건: §0.3의 캘리브레이션 통과 상태. 모든 입력은 실제 포인터·키보드(`trusted=true`)로 보냈고, 결과는 DOM·URL·`document.activeElement`로 확인했다.

### 5.1 실측 표

| 입력 | TickTick | 현재 앱 |
|---|---|---|
| **hover** | 배경 레이어 `#ffffff/.05` + 드래그 핸들 + more 메뉴 등장 (§6.2) | 변화 없음. 커서만 `pointer` |
| **click** | 행 선택 → 레이어 `.08`, URL `#q/today/tasks/<id>`, **포커스가 제목 편집기(TEXTAREA)로 이동** | 행 `.is-open` → 배경 `#ffffff/.1`, URL `?task=<id>`, 포커스는 `button.tm-task-open` |
| **double click** | **행 안의 `TEXTAREA`에 포커스 — 리스트 행에서 제목 인라인 편집.** 오버레이 없음, URL 불변 | **단일 클릭과 동일.** drawer가 열릴 뿐 인라인 편집기 없음 |
| **right click** | **컨텍스트 메뉴 표시** (§5.2). 동시에 **행이 선택됨**(URL이 task id로 바뀜) | `contextmenu` 이벤트가 `defaultPrevented: false`로 통과 → **앱 메뉴 없음, 브라우저 기본 메뉴.** 행도 선택되지 않음 |
| **Escape** | 한 겹씩 벗김: 인라인 편집기 → 포커스 해제(BODY) / 컨텍스트 메뉴 → **DOM에서 제거**. Detail과 선택은 유지 | **아무 동작 없음.** drawer 유지, URL 유지, 포커스 유지 |
| **Tab** | 행이 `tabindex="0"`으로 포커스를 받지만 **시각 표시 없음** (§6.5) | `button.tm-task-open`에 `2px solid #007aff` 링 |
| **drag** | 미측정 (§5.4) | **재정렬 안 됨.** 드래그 후 순서 불변, `dragging` 클래스 이벤트 0건 |

### 5.2 Context Menu (TickTick 실측)

| 항목 | 값 |
|---|---|
| 요소 | `.taskMenu.task-menu.pop-shadow.context-menu` |
| 크기·위치 | **196×513** @(488, 248) — 포인터 위치에 뜸 |
| position / z-index | `absolute` / **1050** (Date Picker와 동일) |
| radius | **12px** |
| 배경 | `#242424` (Rail·Date Picker와 같은 "떠 있는 면") |
| 경계 | 1px `#363636` |
| 그림자 | `rgba(0,0,0,.08) 0 6px 24px` |
| padding | `4px 0` |
| 항목 | Date… / Priority… / Add Subtask / Pin / Won't Do / Move to / Tags |

### 5.3 차이와 원인

| # | 항목 | 내용 |
|---|---|---|
| I-01 | **더블클릭이 비어 있다** | TickTick은 더블클릭에 "제목 인라인 편집"이라는 고유 동작을 준다. 현재 앱은 단일 클릭과 구분되지 않으므로 입력 하나가 낭비된다 |
| I-02 | **우클릭이 비어 있다** | TickTick은 7개 항목의 컨텍스트 메뉴를 띄운다. 현재 앱은 브라우저 기본 메뉴가 나오므로, 사용자가 우클릭했을 때 앱이 아니라 브라우저가 응답한다 |
| I-03 | **Escape가 죽어 있다** | 현재 앱은 drawer가 열린 상태에서 Escape가 아무 일도 하지 않는다. 닫는 방법이 `.tm-drawer-close` 버튼(25×22)뿐이다 |
| I-04 | **드래그 재정렬이 없다** | 리스트 행에 드래그 핸들도, `draggable` 속성도, 재정렬 동작도 없다. `sortKey`가 도메인에 존재하는데(`src/types.ts`의 `order`) 리스트 화면에서 손으로 옮길 수단이 없다 |
| I-05 | 선택 후 포커스 행선지 | TickTick은 제목 편집기, 현재 앱은 행 버튼. TickTick은 "선택 = 편집 시작"으로 설계했다 |

**원인.** I-01·I-02·I-04는 §3.1의 행 구조와 같은 뿌리다 — 행이 `button` 하나로 되어 있어 **입력을 나눠 받을 표면이 없다.** 제목이 별도 편집 가능 요소가 아니므로 더블클릭에 줄 동작이 없고, 드래그 핸들이 없으므로 드래그를 시작할 지점이 없다. I-03만 구조와 무관한 독립 결함이다.

### 5.4 아직 측정하지 않은 것

| 항목 | 이유 |
|---|---|
| TickTick 드래그 재정렬 | 실행하면 사용자의 **실제 태스크 순서가 바뀐다.** `Fidelity Audit` 리스트가 비어 있어 안전한 대상이 없다. 태스크 투입 후 그 안에서 측정한다 |
| 키보드 단축키 전반 | TickTick은 `Shortcuts` 설정 탭을 갖고 있다. 목록 대조 필요 |
| 체크박스 클릭(완료 처리) | TickTick은 실제 데이터가 완료 처리된다. 샘플 리스트에서 수행 |
| 사이드바·헤더·QuickAdd의 상호작용 | 미착수 |

### 5.5 수정 제안

- **I1.** Escape로 drawer를 닫는다. 구조 변경이 필요 없는 유일한 항목이므로 우선순위가 높다.
- **I2.** 제목을 인라인 편집 가능한 요소로 분리하고 더블클릭에 연결한다 (§3.1 P3의 행 재구성과 함께).
- **I3.** 우클릭 컨텍스트 메뉴를 만든다. 항목은 TickTick의 7개가 출발점이 될 수 있으나, 현재 앱의 도메인에 맞춰 정한다.
- **I4.** 드래그 핸들(12×12, hover 시 등장)을 신설하고 `order` 필드에 연결한다.
- **I5.** 우클릭 시 행 선택도 함께 일어나게 한다.

### 5.6 검증 조건

| # | 검증문 |
|---|---|
| V5-1 | drawer가 열린 상태에서 Escape → `.tm-drawer`가 DOM에서 사라지고 URL의 `?task=` 파라미터가 제거된다 |
| V5-2 | 행 더블클릭 후 `document.activeElement`가 행 내부의 편집 가능 요소다 (`row.contains(activeElement) === true`) |
| V5-3 | 행 우클릭 후 `contextmenu` 이벤트의 `defaultPrevented === true`이고, `position:absolute`·`zIndex>100`인 메뉴 요소가 존재한다 |
| V5-4 | 행을 위로 드래그한 뒤 `.tm-task-title` 텍스트 배열이 드래그 전과 다르다 |
| V5-5 | 드래그 중 행에 상태 클래스가 붙는다 (MutationObserver로 관측 가능) |

### 5.7 결정이 필요한 항목

| # | 결정 | 비고 |
|---|---|---|
| D5-1 | 컨텍스트 메뉴 항목 구성 | TickTick의 7개(Date/Priority/Add Subtask/Pin/Won't Do/Move to/Tags)를 그대로 쓸지, 현재 앱 도메인(Space·Scope·Focus)에 맞춰 다시 짤지 |
| D5-2 | 더블클릭을 인라인 편집에 줄 것인가 | 현재 앱은 drawer에 제목 input이 이미 있다. 두 곳에서 편집 가능해지는 것을 허용할지 |
| D5-3 | "선택 = 편집 시작"을 따를 것인가 | TickTick은 단일 클릭만으로 제목 편집기에 포커스를 준다. 오타 입력 위험과 편의의 트레이드오프 |
| D5-4 | 리스트 드래그 재정렬의 허용 범위 | `scopeRegistry.canManualReorder`가 이미 Scope별로 정의되어 있다. 어느 Scope에서 허용할지 |

---

## Stage 7 — Overlay / Transition Audit

### 7.1 분류표 — 무엇이 무엇으로 동작하는가

| 표면 | TickTick | 현재 앱 |
|---|---|---|
| Task Detail | **인라인 컬럼** 500w, 상시 | **인라인 컬럼** 400w, 선택 시 |
| Search | **전용 페이지** (`#s`) — 사이드바가 사라지고 main 1390 | **모달** (Command Menu, `role=dialog`) |
| Settings | **모달** — 현재 화면 URL에 `?modalType=settings` | **전용 페이지** (`/settings`) |
| Add List | 모달 800×680 | 모달 1200×421 |
| Date Picker | 팝오버 262×541, z 1050 | 미측정 |
| Context Menu | 팝오버 196×513, z 1050 | **없음** (§5.1) |
| Quick Add | 리스트 상단 **인라인** 76h | 리스트 상단 **인라인** 34h |

**Search와 Settings가 정확히 반대다.** TickTick은 Search를 페이지로, Settings를 모달로 둔다. 현재 앱은 Search를 모달로, Settings를 페이지로 둔다.

TickTick의 배치에는 규칙이 읽힌다 — **결과가 많고 오래 머무는 것은 페이지, 설정하고 빠져나오는 것은 모달**이다. Search는 필터 칩(Lists·Tag·Date·Priority·Status)과 "Save as filter"를 갖는 작업 공간이라 페이지가 맞고, Settings는 값을 바꾸고 원래 하던 일로 돌아가는 곳이라 모달이 맞다. 현재 앱은 둘 다 반대다.

### 7.2 오버레이 기하 실측

**TickTick**

| | Date Picker | Context Menu | Settings 모달 |
|---|---|---|---|
| 크기 | 262×541 | 196×513 | 800×680 @(320,110) |
| position / z | absolute / **1050** | absolute / **1050** | — / 패널 위, scrim **998** |
| radius | **14** | **12** | — |
| 배경 | `#242424` | `#242424` | — |
| 경계 | 1px `#ffffff/.1` | 1px `#363636` | — |
| 그림자 | `rgba(0,0,0,.2) 0 16px 40px` | `rgba(0,0,0,.08) 0 6px 24px` | `shadow-default` |
| scrim | 없음 | 없음 | `#191919/0.6` |

팝오버 두 종이 **같은 z(1050)와 같은 배경(`#242424`)**을 쓴다. 이 색은 Rail과도 같다 — dark 테마에서 "떠 있는 면"은 하나의 값이다(§3.6).

**현재 앱**

| | Command Menu | Add List 모달 |
|---|---|---|
| 패널 | 620×240 @(410,108) | 1200×421 @(120,240) |
| radius | **14** | **14** |
| 배경 | `#1c1c1e` | `#1c1c1e` |
| 그림자 | `rgba(0,0,0,.28) 0 18px 48px` | `rgba(0,0,0,.28) 0 18px 48px` |
| scrim | `#000000/0.32`, z **60** | `#000000/0.32`, z **70** |
| role / aria-modal | `dialog` / `true` | `dialog` / `true` |

현재 앱의 오버레이는 radius·배경·그림자가 **이미 서로 일치**한다. 이 부분은 정리되어 있다.

주의: 오버레이 배경이 `#1c1c1e`인데 이는 **사이드바와 같은 값**이다(§2.1). TickTick은 오버레이(`#242424`)를 콘텐츠 평면(`#1c1c1c`)과 다른 값으로 두는데, 현재 앱은 오버레이와 사이드바가 같은 층으로 읽힌다.

### 7.3 open / close / focus / history 규칙

| 항목 | TickTick | 현재 앱 |
|---|---|---|
| Settings 열 때 URL | `?modalType=settings&tabs=appearance` 추가 | `/settings`로 **이동** |
| Settings 열 때 history | **+1** | 페이지 이동이므로 +1 |
| **뒤로 가기로 닫힘** | **된다** — hash 복원, 모달 제거 | 해당 없음(이전 페이지로 감) |
| Command Menu / Add List history | — | **+0** — URL 불변, 뒤로 가기로 못 닫음 |
| 열 때 포커스 | 모달 내부 링크로 이동 | 입력으로 이동 (`INPUT.cmd-menu-input`, `INPUT.tm-modal-input`) |
| **Escape로 닫힘** | 컨텍스트 메뉴 O (DOM에서 제거), 인라인 편집기 O | Command Menu O, Add List 모달 O, **Task Detail drawer X** |
| Escape의 범위 | **한 겹씩** — 위에서부터 하나만 닫고 아래는 유지 | 오버레이는 닫히나 drawer는 반응 없음 |
| **닫은 뒤 포커스 복원** | **안 됨** (BODY) | **오버레이마다 다름** — 정정 §7.3.1 |

#### 7.3.1 정정 — 현재 앱의 포커스 복원은 오버레이마다 달랐다

최초 측정은 "현재 앱도 복원하지 않음"이었다. **그 측정이 틀렸다.** Add List 모달을 JS `.click()`으로 열었기 때문에 여는 시점의 `document.activeElement`가 `BODY`였고, 복원 대상이 `BODY`였으므로 복원은 **정상 동작한 것**이었다. 측정 방법이 결과를 만들었다.

실제 포인터로 다시 확인한 결과:

| 오버레이 | 복원 | 근거 |
|---|---|---|
| Add List 모달 | **함** | `useFocusTrap` 사용. 실제 클릭으로 열고 Escape → 포커스가 `+` 버튼으로 돌아옴 |
| Task Drawer (비인라인) | **함** | 같은 훅 사용 |
| **Command Menu** | **안 함** | 훅을 쓰지 않음. `role="dialog"`·`aria-modal="true"`를 선언하고도 Tab이 밖으로 나가고 닫으면 `BODY`로 떨어짐 |

즉 결함은 앱 전체가 아니라 **Command Menu 하나**였다. TickTick이 복원하지 않는다는 관찰은 그대로 유효하다.

### 7.4 차이

| # | 항목 | 내용 |
|---|---|---|
| O-01 | Search / Settings의 배치가 반대 | §7.1 |
| O-02 | 현재 앱 오버레이가 URL에 없다 | Command Menu·Add List 모두 `historyDelta 0`. 공유 불가, 뒤로 가기로 닫기 불가, 새로고침하면 사라짐 |
| O-03 | Task Detail이 Escape에 반응하지 않는다 | §5.1의 I-03과 동일 |
| O-04 | 오버레이 배경이 사이드바와 같은 층 | 현재 앱 `#1c1c1e` = 사이드바. TickTick은 오버레이 `#242424` ≠ 콘텐츠 `#1c1c1c` |
| O-05 | 모달 규격 | TickTick은 800×680 **고정 규격**(Add List·Settings 동일). 현재 앱은 1200×421로 화면 폭의 83%를 덮는다 |
| O-06 | 포커스 복원 | **양쪽 다 안 함.** 기준 제품도 못 하는 항목 |

### 7.5 수정 제안

- **O1.** Escape로 Task Detail을 닫는다 (§5.5 I1과 동일 항목).
- **O2.** Command Menu와 Add List를 URL에 반영한다. TickTick의 `?modalType=` 방식이 참고가 된다 — 현재 화면을 떠나지 않으면서 뒤로 가기로 닫히고 링크로 공유된다.
- **O3.** 오버레이 배경을 사이드바와 다른 값으로 분리한다. §2.7 S1(표면 2단계)과 함께 결정해야 한다 — 사이드바를 콘텐츠와 같게 만들면 `#1c1c1e`가 비고 그 값을 오버레이 전용으로 쓸 수 있다.
- **O4.** 모달 규격을 하나로 정한다. 현재 1200×421은 Add List 하나만의 값이다.
- **O5.** 포커스 복원을 구현한다. **기준 제품을 넘어서는 항목**이므로 모사가 아니라 자체 판단이다.
- **O6.** Search와 Settings의 배치를 재고한다 (§7.6 D7-1).

### 7.6 검증 조건

| # | 검증문 |
|---|---|
| V7-1 | Task Detail이 열린 상태에서 Escape → `.tm-drawer` 제거 + URL `?task=` 제거 |
| V7-2 | Command Menu를 열면 `history.length`가 +1이고, 뒤로 가기로 닫힌다 |
| V7-3 | 오버레이 패널의 배경색이 사이드바의 유효 배경색과 **다르다** |
| V7-4 | 모달 패널의 크기가 종류와 무관하게 동일하다 |
| V7-5 | 오버레이를 닫은 뒤 `document.activeElement`가 열기 직전의 요소와 같다 |

### 7.7 결정이 필요한 항목

| # | 결정 | 비고 |
|---|---|---|
| D7-1 | **Search를 페이지로, Settings를 모달로 뒤집을 것인가** | 현재 앱은 최근 커밋(`d04001a`)에서 Rail의 돋보기를 "페이지 이탈" 대신 "메뉴 열기"로 **일부러 바꿨다.** TickTick 기준으로는 그 변경이 반대 방향이다. 어느 쪽이 이 앱에 맞는지는 Search가 작업 공간인지 점프대인지에 달렸다 |
| D7-2 | 오버레이를 URL에 넣을 것인가 | 넣으면 뒤로 가기·공유·새로고침이 생기지만, 모든 오버레이에 주소 체계가 필요해진다 |
| D7-3 | 모달 고정 규격 | TickTick의 800×680을 채택할지, 자체 규격을 정할지 |
| D7-4 | 포커스 복원 | 기준 제품에 없으므로 "따라가지 않는다"가 아니라 "넘어선다"는 결정 |

### 7.8 Transition / Motion 실측

**측정 방법.** 선언값만 읽지 않았다. `requestAnimationFrame` 루프로 매 프레임 대상 요소를 **재질의**해 `backgroundColor`를 샘플링하고, hover를 건 뒤 값이 바뀐 시점과 중간값의 개수를 셌다. 중간값이 없으면 그 전이는 실제로 애니메이션되지 않은 것이다.

측정 전 확인: `prefers-reduced-motion`은 **양쪽 다 `no-preference`**다. 따라서 아래 `0s` 값들은 reduced-motion 때문이 아니다.

#### 7.8.1 모션 인벤토리 — 전환이 걸린 요소 전수

**TickTick — 10개**

| 요소 | property | duration | easing |
|---|---|---|---|
| `li.task` (Task row wrapper) ×5 | `color, background-color, border-color…` | **0.2s** | `cubic-bezier(.4,0,.2,1)` |
| 모달 버튼 76×30 ×2 | `color, background-color, border-color…` | **0.2s** | `cubic-bezier(.4,0,1,1)` |
| `.lists` (사이드바 컨테이너) | `margin` | **0.2s** | `cubic-bezier(.4,0,.2,1)` |
| 스크롤바 ×2 | `opacity` | **0.3s** | `linear` |
| — | `animation: LOADING` | 2s | ease |

**현재 앱 — 2개**

| 요소 | property | duration | easing |
|---|---|---|---|
| `button.tm-section-action` 24×24 | `background, color` | **0.12s** | `ease` |
| `button.tm-section-action` 54×24 | `background, color` | **0.12s** | `ease` |

사이드바 섹션의 `+`와 `Manage` 두 버튼이 **앱 전체에서 전환을 가진 유일한 요소**다. Task row·Sidebar row·모달 버튼·오버레이·Detail 열은 모두 `transition-duration: 0s`다.

#### 7.8.2 실제 관측 — 사용자가 보는 전이는 양쪽 다 즉시다

| 대상 | 프레임 수 | 변화 횟수 | 중간값 | 관측 소요 |
|---|---|---|---|---|
| TickTick Task row hover (`.l-task-bg`) | 1762 | **1** | **없음** | **0ms** |
| 현재 앱 Sidebar row hover (`.tm-row`) | 1367 | **1** | **없음** | **0ms** |

둘 다 투명 → 목표값으로 **한 프레임에 점프**한다.

**TickTick의 0.2s 전환은 hover에 적용되지 않는다.** 이유가 측정으로 드러난다 — 0.2s는 wrapper `li.task`의 `background-color`에 걸려 있는데, wrapper의 배경은 default·hover 모두 `transparent`로 **변하지 않는다**(§6.2). 실제로 변하는 것은 자식 `.l-task-bg`이고 그 요소의 `transition-duration`은 `0s`다. 즉 선언된 전환과 실제로 변하는 속성이 **서로 다른 요소에 있다.**

#### 7.8.3 차이

| # | 항목 | TickTick | 현재 앱 |
|---|---|---|---|
| M-01 | 전환을 가진 요소 수 | 10 | **2** |
| M-02 | 표준 duration | **0.2s** (색), 0.3s (opacity) | **0.12s** |
| M-03 | 표준 easing | `cubic-bezier(.4,0,.2,1)` / `(.4,0,1,1)` | `ease` (= `cubic-bezier(.25,.1,.25,1)`) |
| M-04 | hover 피드백의 실제 애니메이션 | **없음** (즉시) | **없음** (즉시) |
| M-05 | 레이아웃 전환 | 사이드바 접힘에 `margin` 0.2s | 리스트 폭 1136↔672 변화에 **전환 없음** |

**M-05가 §1.3 L-02와 만난다.** 현재 앱은 태스크를 선택할 때 리스트 열이 1136에서 672로 줄어드는데, 그 변화에 전환이 없어 **한 프레임에 재배치**된다. TickTick은 애초에 폭이 변하지 않으므로 전환이 필요 없고, 폭이 변하는 유일한 경우(사이드바 접힘)에는 0.2s를 준다.

#### 7.8.4 수정 제안

- **M1.** 전환 토큰을 정한다. 색 전이 0.15~0.2s, easing 1종. 현재 0.12s는 단 두 요소에만 있어 사실상 토큰이 아니다.
- **M2.** hover/selected 배경 전이에 전환을 준다. **TickTick을 모사하는 것이 아니다** — TickTick도 실제로는 즉시 바뀐다. 이건 자체 판단으로 넘어서는 항목이다.
- **M3.** L-02를 (a)안(Detail 열 상시 확보)으로 해결하면 M-05는 사라진다. (b)·(c)안을 고르면 폭 변화에 전환이 필요하다.

#### 7.8.5 검증 조건

| # | 검증문 |
|---|---|
| V7-6 | hover 시 배경 전이를 rAF로 샘플링하면 중간값이 **2개 이상** 관측된다 |
| V7-7 | 전환을 가진 요소의 `transitionDuration` 집합의 크기 ≤ 2 |
| V7-8 | `transitionTimingFunction` 집합의 크기 ≤ 2 |
| V7-9 | 상태가 바뀌는 속성과 전환이 선언된 속성이 **같은 요소**에 있다 (TickTick의 결함을 따라하지 않기 위함) |

### 7.9 Date Picker — 현재 앱에는 커스텀 위젯이 없다

Task Detail의 필드를 전수 조사한 결과, 현재 앱은 **네이티브 폼 컨트롤에 위임**한다.

| 필드 | 현재 앱 | TickTick |
|---|---|---|
| 날짜 | **`<input type="date">`** 329×34 — OS/브라우저 위젯 | 커스텀 `.timecard` **262×541** (§3.6) |
| 우선순위 | **`<select>`** 314×30 | 커스텀 팝오버 (`.td-priority` 36×30 트리거) |
| 리스트 이동 | **`<select>`** 336×30 | 커스텀 드롭다운 (`.project-settings-dropdown` 58×30) |
| 완료 체크 | **`<input type="checkbox">` 13×13** (스타일 없음) | `.checker` 17×17 + 글리프 교체 |
| 제목 | `<input type="text">` 367×40, 17px | 본문 에디터 |
| 노트 | `<textarea>` 367×90 | 본문 에디터 |

**차이 P-01.** 현재 앱은 날짜·우선순위·리스트를 **브라우저 기본 위젯**으로 받는다. 이것이 세 가지 결과를 낳는다.

1. **시각 언어가 앱과 무관해진다** — 네이티브 date picker와 select 드롭다운은 앱의 radius·색·타이포를 따르지 않고, OS와 브라우저마다 다르게 보인다.
2. **체크박스가 스타일되지 않았다** — 13×13 `<input type="checkbox">`에 `border-radius: 0`, 커스텀 색 없음. dark 테마에서 브라우저 기본 체크박스가 그대로 나온다.
3. **기능 범위가 좁다** — TickTick의 날짜 팝오버는 날짜 외에 시간(14:00)·`On time` 알림·`Repeat`·Duration 탭을 한 곳에서 받는다. `<input type="date">`는 날짜 하나만 받는다.

이 항목은 §6.11 S-09(UA 기본 포커스 링), §6.16 B-05(dark에서 안 보이는 secondary)와 같은 계열이다 — **브라우저 기본값이 앱의 표현을 대신하고 있는 지점들**이다.

### 7.10 Focus trap — 양쪽 다 작동한다

| | 모달 내 focusable | Tab 횟수 | 결과 |
|---|---|---|---|
| 현재 앱 (Add List) | 18 | **46** (≈2.5바퀴) | 포커스가 모달 안에 유지됨 |
| TickTick (Settings) | 15 | **40** (≈2.7바퀴) | 포커스가 모달 안에 유지됨 |

**동등하다.** 다만 §7.3에서 본 대로 **닫은 뒤 포커스 복원은 양쪽 다 하지 않는다** — trap은 있고 restore는 없다.

### 7.11 오버레이 진입 애니메이션 — 양쪽 다 없다

`MutationObserver`로 오버레이 등장을 감지하는 동시에 같은 실행 안에서 열고, `opacity`·`transform`·scrim 색을 매 프레임 샘플링했다.

| | 샘플 프레임 | 구별되는 상태 | 관측 |
|---|---|---|---|
| TickTick Settings 모달 | 62 | **1** | `opacity: 1`, transform은 중앙정렬 고정값. 페이드·스케일 없음 |
| 현재 앱 Add List 모달 | 110 | **1** | `opacity: 1`, `transform: none`, scrim `#000000/0.32` 고정. 페이드 없음 |

**동등하다.** 두 제품 모두 오버레이가 한 프레임에 나타난다. §7.8.2의 hover 결과와 같은 결론이다 — **두 제품 다 실제 렌더에서는 모션이 거의 없다.**

현재 앱이 `framer-motion`을 의존성으로 갖고 있으나(`package.json`), Add List 모달 경로에서는 사용되지 않는다.

### 7.12 수정 제안 (추가)

- **P1.** 날짜·우선순위·리스트 이동을 커스텀 팝오버로 교체한다. §7.1의 팝오버 규격(z 1050, radius 12~14, 떠 있는 면 배경)을 그대로 쓸 수 있다.
- **P2.** 체크박스를 스타일한다. Task row에 체크박스를 신설하는 §6.13 T1~T3과 같은 작업이다.
- **P3.** 포커스 복원을 구현한다 (§7.5 O5와 동일).
- **P4.** 오버레이 진입 애니메이션은 **모사 대상이 아니다.** 넣을지는 자체 판단이며, §7.8.4 M2와 함께 결정한다.

### 7.13 검증 조건 (추가)

| # | 검증문 |
|---|---|
| V7-10 | Task Detail 안에 `input[type=date]`와 `select`가 **0개**다 |
| V7-11 | 체크박스 요소의 `borderRadius`가 `0px`가 아니고 배경/경계가 앱 토큰 값이다 |
| V7-12 | 모달을 닫은 뒤 `document.activeElement`가 열기 직전 요소와 같다 |

### 7.14 아직 측정하지 않은 것

TickTick의 Quick Add 확장 상태(Shift+Enter 설명 입력), 오버레이 **닫힘** 애니메이션, 두 제품의 스크롤 복원 동작.

---

# 결정 항목 정리

Stage 1~7에서 25개의 항목이 "결정 필요"로 쌓였다. 그중 상당수는 실제로는 결정이 아니다. 아래에서 셋으로 가른다.

---

## 8.1 결정이 아닌 것 — 그냥 고칠 결함 (8개)

측정 결과가 한쪽 답만 남긴 항목들이다. **TickTick 모사와 무관하게** 그 자체로 틀렸다. 논의 없이 착수 가능하다.

| # | 결함 | 실측 근거 | 출처 |
|---|---|---|---|
| F-1 | Quick Add 입력의 포커스가 **브라우저 기본 링**(`outline: 1px auto #e59700`) | 같은 앱 Task row 버튼은 `2px solid #007aff` | §6.11 S-09 |
| F-2 | secondary 버튼 배경 `#000000/0.05`가 **dark에서 안 보임** | 패널 배경 `#1c1c1e`에 검정 5% | §6.16 B-05 |
| F-3 | 완료 체크박스가 **스타일되지 않은 네이티브 위젯** (13×13, radius 0) | §7.9 | §7.9 |
| F-4 | Task Detail이 **Escape에 반응하지 않음** | drawer·URL·포커스 모두 불변 | §5.3 I-03 |
| F-5 | **Command Menu**가 닫힐 때 포커스 미복원 | 다른 두 오버레이는 `useFocusTrap`으로 복원함 (정정 §7.3.1) | §7.3.1 |
| F-6 | pill radius **세 철자 공존** (`99px`/`999px`/`9999px`) | §A.2 | DA-2 |
| F-7 | **비정수 font-size 5종** (10.8333·11.9·12.5·13.5·14.5) | §A.3 | DA-4 |
| F-8 | 모달 버튼 쌍 폭 **77 / 75로 2px 어긋남** | TickTick은 76/76 | §6.16 B-06 |

F-1·F-2·F-3은 한 뿌리다 — **앱이 표현을 정의하지 않아 브라우저 기본값이 대신하고 있는 지점들**이다.

---

## 8.2 이미 답이 나온 것 — 기준 제품을 따르지 않는다 (3개)

측정 결과 **현재 앱이 더 낫거나, 기준 제품 쪽이 결함**인 항목이다. "TickTick과 같게"의 예외로 명시해 둔다.

| # | 항목 | TickTick | 현재 앱 | 결론 |
|---|---|---|---|---|
| K-1 | Task row 키보드 포커스 | `outline-style: none` — **표시 없음** | `2px solid #007aff` | **현행 유지.** 따라가면 접근성 후퇴 |
| K-2 | 필수 입력이 빈 submit | **막지 않음** | `disabled` + opacity .5 + not-allowed | **현행 유지** |
| K-3 | 전환 선언 위치 | 0.2s가 **변하지 않는 속성**에 걸려 무효 | — | **모사 금지.** 검증 조건 V7-9로 고정 |

---

## 8.3 진짜 결정 — 의존 순서

### Tier 0 — 루트 결정 2개

이 둘이 나머지 대부분을 결정한다. **먼저 답해야 한다.**

| # | 결정 | 선택지 | 무엇이 여기 매달려 있나 |
|---|---|---|---|
| **D1-1** | Detail 열을 기본으로 확보할 것인가 | (a) 상시 확보 + 빈 상태 (b) 조건부 + 리스트 `max-width` (c) 현행 | L-01·L-02, M-05(폭 변화 전환), Stage 7 전체의 전제 |
| **D2-1** | 표면을 2단계로 갈 것인가 | 2단계(Rail / 나머지) / 3단계 유지 | V-01~04, O-04(오버레이 층), D2-2, 그리고 **오버레이 전용 배경값 확보 여부** |

**D1-1 권고: (a).** Detail 열은 이미 인라인 컬럼으로 존재하므로(§Stage 1 보강) 구현 부담이 작고, 리스트 폭 흔들림(1136↔672)과 전환 부재(M-05)가 한 번에 사라진다.

**D2-1 권고: 2단계.** 실측상 기준 제품에 3단계가 없고, 2단계로 가면 `#1c1c1e`가 비어 **오버레이 전용 배경**으로 쓸 수 있다(O-04 해소). 다만 설계서 §11.6을 고쳐야 한다 — §8.4 참조.

### Tier 1 — 설계서와 충돌하는 것 3개

측정이 설계서와 어긋난 항목이다. **문서를 고칠지 코드를 고칠지**의 결정이다.

| # | 결정 | 설계서 | 실측 |
|---|---|---|---|
| D1-2 | Rail 폭 | §2.3.3이 **56 명시** | TickTick **50** |
| D2-1 | 표면 위계 | §11.6이 `Rail→Sidebar→Main` **3단계** | TickTick **2단계** |
| D7-1 | Search 배치 | 커밋 `d04001a`가 **의도적으로** 메뉴로 바꿈 | TickTick은 **페이지** |

**D7-1이 가장 미묘하다.** 최근 커밋이 일부러 반대 방향으로 갔다. TickTick 기준으로는 되돌리는 셈이므로, "왜 그때 바꿨는가"를 먼저 확인해야 한다. Search가 **작업 공간**(필터·저장)이면 페이지, **점프대**면 메뉴다. 현재 앱의 Search가 어느 쪽인지는 제품 의도의 문제다.

### Tier 2 — 토큰 확정 5개

Tier 0이 정해진 뒤 값만 채우면 되는 항목이다.

| # | 결정 | 실측 대비 | 권고 |
|---|---|---|---|
| D2-3 / DA-1 | radius 집합 | TickTick 5종(+오버레이 14) vs 현재 **13종** | TickTick 집합 채택 |
| D2-4 / DA-3 | type 스케일 | TickTick 크기 3·굵기 3 vs 현재 **15·8** | TickTick 3종은 현재 앱 정보 밀도에 부족할 수 있음 — **자체 결정 필요** |
| D2-5 | 뮤티드를 알파 단계로 | TickTick은 한 잉크의 `.4/.3/.2` | 채택 권고 |
| DA-5 | 색 섞인 그림자 3종 | TickTick은 기본 레이아웃에 그림자 **0** | 중립 1종으로 통일 |
| D1-4 / DA-7 | 세로 격자 | 현재 **5종**(30·36·40·42·65) vs TickTick **3종** | 40으로 수렴, `20-density.css` 범위 결정 필요 |

### Tier 3 — 상호작용 범위 6개

구조 변경(§3.1 행 재구성)에 함께 실려야 하는 항목이다.

| # | 결정 | 비고 |
|---|---|---|
| D5-1 | 컨텍스트 메뉴 항목 구성 | TickTick 7개 그대로 vs 현재 앱 도메인(Space·Scope·Focus)에 맞춰 재구성 |
| D5-2 | 더블클릭 = 인라인 편집 | drawer에 이미 제목 input이 있음. 두 곳 편집 허용 여부 |
| D5-3 | "선택 = 편집 시작" | TickTick은 단일 클릭으로 편집기 포커스. 오타 위험 ↔ 편의 |
| D5-4 | 드래그 재정렬 허용 Scope | `scopeRegistry.canManualReorder`가 이미 있음 |
| T5 / B5 | pressed `scale(0.97)` | 기준 제품에 pressed 표현 **없음**. 자체 언어로 유지할지 |
| M2 / P4 | 모션을 넣을 것인가 | **양쪽 다 실제로는 즉시.** 넣으면 기준 제품을 넘어서는 것 |

### Tier 4 — IA 선행 결정 2개

| # | 결정 | 비고 |
|---|---|---|
| DA-6 | 사이드바 폭 3종(248/220/없음) 통합 | Calendar·Matrix·Focus·Settings에 Context Sidebar를 줄지가 **선행** |
| D7-2 | 오버레이를 URL에 넣을 것인가 | 넣으면 뒤로가기·공유·새로고침을 얻지만 모든 오버레이에 주소 체계 필요 |

### 남는 개별 항목

| # | 결정 | 비고 |
|---|---|---|
| D1-3 | 사이드바 기본 폭 240 vs 248 | 양쪽 다 리사이즈 지원 — 기본값만의 문제. 영향 작음 |
| D2-2 | Rail 톤 방향을 테마별로 뒤집기 | D2-1에 종속 |
| D2-6 | AI FAB | 제거/축소/뮤티드/유지. 화면에서 **가장 밝은 면**(lum .2114, 캔버스의 40배)이고 TickTick에 대응물 없음 |
| D7-3 | 모달 고정 규격 | TickTick 800×680 vs 자체. 현재 1200×421은 Add List 하나만의 값 |

---

## 8.4 설계서를 어떻게 할 것인가

D1-2·D2-1·D7-1은 모두 **설계서 또는 최근 결정과 충돌**한다. 이 저장소의 기존 규칙(`TICKTICK_VISUAL_LANGUAGE_PLAN.md` V.0)은 "설계서와 저장소가 부딪히면 계획 문서에서 해소하고 설계서 본문은 고치지 않는다"이다.

그런데 이번에는 **설계서가 기준 제품을 잘못 기술한 경우**가 나왔다(§2.1 — §11.6의 3단계 규정, 그리고 §V.2.1의 "TickTick은 사이드바가 가장 가라앉는다"는 서술). 이건 해석 충돌이 아니라 **사실 오류**다. 기존 규칙을 그대로 적용하면 틀린 기술이 설계서에 남는다.

**결정 필요:** 사실 오류로 확인된 설계서 조항을 (a) 설계서 본문에서 정정할지, (b) 기존 규칙대로 이 문서에서만 해소할지.

---

## 8.5 권고 착수 순서

1. **8.1의 결함 8개** — 결정 대기 없이 착수. F-4(Escape)는 구조 변경도 필요 없다.
2. **D1-1, D2-1** 결정 — 나머지가 여기 매달려 있다.
3. **§8.4** 설계서 처리 방침 결정.
4. Tier 2 토큰 확정 → Tier 3 구조 변경(§3.1 행 재구성 + Stage 5 상호작용) 일괄.
5. Tier 4 IA 결정은 별도 트랙.

**8.1과 D1-1만 처리해도** L-02(폭 흔들림)·M-05(전환 부재)·I-03(Escape)·S-09·B-05·P-01(체크박스)가 해소된다. 착수 대비 회수가 가장 큰 묶음이다.

---

# 9. 구현 기록 — 8.1의 결함 8개

착수일 2026-08-19. **§8.1만** 적용했다. §8.2(따라가지 않기로 한 것)와 §8.3(진짜 결정)은 손대지 않았다.

## 9.1 무엇을 고쳤나

| # | 고친 것 | 파일 | 방법 |
|---|---|---|---|
| F-1 | 입력의 포커스 링이 브라우저 기본값 | `01-base.css` | `button:focus-visible`만 있던 규칙을 `:where(button, input, select, textarea, a[href], [tabindex])`로 확장. `:where()`라 특이도 0 — 기존 컴포넌트별 규칙이 모두 그대로 이긴다 |
| F-2 | `--surface-2`가 **정의된 적 없음** | `01-base.css` | light `rgba(0,0,0,.05)` / dark `rgba(255,255,255,.08)`로 정의. 9곳이 각자의 검정 알파 fallback으로 떨어지던 것이 한 값으로 수렴 |
| F-3 | 완료 체크박스가 스타일 없는 네이티브 위젯 | `17-tasks-module.css` | 16×16 + `accent-color: var(--accent)`. 컨트롤을 교체하지 않았으므로 키보드 동작은 그대로 |
| F-4 | Task Detail이 Escape에 무반응 | `TaskDrawer.tsx` | `document` keydown. `event.defaultPrevented` 가드로 **한 겹씩** 닫힘 |
| F-5 | Command Menu가 포커스를 복원 안 함 | `CommandMenu.tsx` | 다른 두 오버레이가 이미 쓰던 `useFocusTrap` 적용. `autoFocus` 제거하고 `initial`로 입력을 지정 |
| F-6 | pill radius 세 철자 | `*.css` 12개 | `border-radius: 99/999px` 41개를 `var(--radius-pill)`로. `--rounded-pill`은 `var(--radius-pill)` 별칭으로 축소 |
| F-7 | 비정수 font-size | `04-today`, `05-spaces`, `06-space-detail`, `08-calendar-categories` | 44개를 정수로. 본문 13px 기준 위/아래 관계를 유지: `10.5→10 · 11.5→11 · 12.5→12 · 13.5→14 · 14.5→15 · 15.5→16` |
| F-8 | 모달 버튼 쌍 폭 불일치 | `17-tasks-module.css` | `.tm-modal-actions button`에 `min-width: 88px` |

## 9.2 검증 — 실행 중인 앱 실측

`npx tsc -b` 통과, `vitest run` **1512 passed / 1 skipped**. 그 위에 실제 포인터·키보드로:

| # | 검증문 | 결과 |
|---|---|---|
| F-1 | Quick Add를 실제 클릭 → `outline` | **`2px solid #007aff`, offset 2px** (이전 `1px auto #e59700`) |
| F-2 | `--surface-2` | dark `rgba(255,255,255,.08)` / light `rgba(0,0,0,.05)` — 양 테마 모두 `--bg-hover`(.06/.04)보다 위 |
| F-2 | 모달 Cancel 배경 | `#ffffff/0.08` (이전 `#000000/0.05`) |
| F-3 | 체크박스 | **16×16**, `accent-color: rgb(0,122,255)`, cursor `pointer` |
| F-4 | Drawer 열고 Escape | drawer 제거 + **URL의 `?task=` 제거** + 리스트 폭 1072 복귀 |
| F-5 | 행 버튼 포커스 → Ctrl+K → Escape | `activeElement === opener` **true**, 드로어는 열리지 않음(한 겹만 닫힘) |
| F-6 | `--radius-pill` / `--rounded-pill` | 둘 다 `9999px`, 소스에 리터럴 0개 |
| F-7 | 화면의 비정수 font-size | **빈 배열** |
| F-8 | 모달 버튼 쌍 | Cancel **88**×37 / Create **88**×37 |

§6.14의 V6-7("`outline-style: auto`인 포커스 요소 0개")과 §5.6의 V5-1("Escape → `.tm-drawer` 제거 + `?task=` 제거")이 이로써 참이 되었다.

## 9.3 이 작업이 드러낸 것

**측정 방법이 결과를 만든 사례가 하나 나왔다** — §7.3.1. F-5를 고치려고 코드를 열었더니 `useFocusTrap`이 이미 복원을 하고 있었고, 최초 측정에서 "복원 안 함"이 나온 것은 모달을 JS `.click()`으로 열어 opener가 `BODY`였기 때문이었다. 결함은 앱 전체가 아니라 Command Menu 하나였다.

이 문서의 원칙("선언이 아니라 실행 결과")은 유지되지만, **실행을 어떻게 일으켰는지도 측정 조건의 일부**라는 단서가 붙는다. 앞으로 상호작용을 측정할 때는 합성 이벤트가 아니라 실제 입력으로 일으킨다.

**F-2는 예상보다 넓었다.** Cancel 버튼 하나의 문제로 적었으나 `--surface-2`를 쓰는 9곳 전부가 같은 상태였다. 정의하면서 각자 달랐던 fallback(.03/.04/.05/.08)이 한 값으로 통일된다 — light 테마에서도 그 9곳의 채도가 미세하게 바뀐다.

## 9.4 남긴 것

§8.2·§8.3은 그대로다. 특히 `button:active { transform: scale(0.97) }`(`01-base.css`)는 §6.13 T5·§6.17 B5의 결정 대상이므로 건드리지 않았다.

---

# 10. 구현 기록 — D1-1 (a) Detail 열 상시 확보

결정: §8.3 Tier 0의 **D1-1을 (a)안**으로. 열은 이미 인라인 컬럼으로 존재했으므로 새로 만든 것이 아니라 **언제 확보하느냐**만 바꿨다.

## 10.1 무엇을 바꿨나

| 파일 | 변경 |
|---|---|
| `TasksModule.tsx` | 선택된 Task가 없고 presentation이 `inline-drawer`일 때 `aside.tm-drawer.is-inline-drawer.is-empty`를 렌더 |
| `17-tasks-module.css` | `.tm-drawer.is-empty` — 같은 400px 폭, 가운데 정렬. `.tm-drawer-empty` 안내 문구 |
| `en.ts` / `ko.ts` | `tasks.drawerEmpty` 추가 |

**`inline-drawer`에서만이다.** 나머지 세 presentation(§15.17의 `overlay-drawer` / `right-sheet` / `full-screen`)에서 Detail은 그리드 트랙을 차지하지 않으므로 확보할 것이 없고, 빈 패널을 띄우면 페이지 위에 떠 있는 빈 면이 된다.

## 10.2 검증 — 실측

1440×900:

| 상태 | 리스트 | main | Detail |
|---|---|---|---|
| 선택 없음 (이전) | **1136** | 1136 | 없음 |
| 선택 없음 (이후) | **672** | 736 | **400** (빈 상태) |
| 선택 있음 (이후) | **672** | 736 | 400 |

**V1-1 통과: 선택 전후 리스트 폭 delta 0.**

1200×800(compactDesktop)에서는 `.tm-drawer.is-empty`가 **렌더되지 않음**을 확인 — 그 모드의 Detail은 오버레이다.

`npx tsc -b` 통과, `vitest run` 1512 passed.

## 10.3 회귀 테스트

`e2e/taskDetailColumn.spec.ts` 신규 3건. **jsdom은 레이아웃을 계산하지 않아 이 결함을 볼 수 없다** — `getBoundingClientRect()`가 0을 돌려주므로 유닛 층에서는 폭 변화가 애초에 관측되지 않는다. 리포가 `e2e/`를 두는 이유와 같다.

| 테스트 | 내용 |
|---|---|
| is reserved before anything is selected | 빈 열이 보이고 폭이 **400** |
| opening a Task does not resize the list | 선택 전후 `.tm-list` 폭이 **정확히 같음** |
| Escape closes the Detail and the list still does not move | Escape가 `?task=`까지 지우고, 폭은 그대로 |

`< 1280`에서는 skip한다(§15.17). desktop 3건 통과 / tablet·mobile 6건 skip.

폭을 `672`로 못박지 않고 **"같다"로 단언**했다. 숫자를 박으면 Detail 폭을 조정할 때마다 깨지고, 두 숫자가 같이 변하면 통과해 버린다 — 그 하나가 일어나면 안 되는 경우다.

## 10.4 함께 해결된 것

| # | 항목 | 상태 |
|---|---|---|
| L-02 | 리스트 폭이 1136↔672로 흔들림 | **해소** |
| M-05 | 그 폭 변화에 전환이 없어 한 프레임에 재배치 | **해소** — 변화 자체가 없어졌으므로 전환이 필요 없다 |

§7.8.4 M3이 예고한 대로다. (b)·(c)안을 골랐다면 폭 변화에 전환을 따로 넣어야 했다.

## 10.5 남은 D1

D1-2(Rail 50) · D1-3(사이드바 기본 폭) · D1-4(Task row 40과 밀도 토큰 범위)는 그대로 미결이다.

---

## 11. Stage 11 — 행이 할 수 있는 일 (2026-08-19)

Stage 1~3은 치수를 쟀고, v0.16.0의 §V(시각 언어)는 색·모양·리듬을 맞췄다. **둘 다 "무엇을 할 수 있는가"는 다루지 않았다.** §3.7이 미룬 것(우클릭·상태)과 §3.1의 표에 "없음"으로 적힌 것들이 그 자리에 남아 있었고, 이 단계는 그중 행의 것부터다.

### 11.1 무엇이 없었나 — 코드에서 확인

| # | 항목 | 확인 |
|---|---|---|
| L-13 | 행에서 완료 | 완료 토글이 [`TaskDrawer.tsx`](src/components/tasks/TaskDrawer.tsx)에만 존재. **리스트에서 태스크를 끝낼 방법이 없었다** |
| L-17 | 행 hover 액션 | 행이 제목 버튼 하나. 드래그 핸들·더보기 둘 다 없음 |
| — | 리스트 정렬 | 보드는 `sortKey`를 읽는데 리스트 뷰는 저장소 순서를 그대로 그렸다. **같은 태스크가 두 뷰에서 다른 순서** |
| §3.1 | 우선순위 | 데이터에 있고 화면에 없음 |

### 11.2 무엇을 했나

- **체크박스** — 17px 상자, 히트 영역은 행 높이 전체(§3.1이 잰 17×40의 설계 의도). Drawer와 **같은** `completeTask`/`reopenTask` 뮤테이션을 쓰므로 `done`이 무엇을 쓰는지 두 곳이 어긋날 수 없고(§12.12), 실행 취소가 같이 온다.
- **드래그 정렬** — 행에 떨구면 그 자리로 간다. `placeTask`가 이웃 사이 번호만 다시 매기므로 두세 행만 쓴다. 수동 순서가 있는 Scope에서만(§16.26 policy) — 날짜로 정렬되는 스마트 리스트에는 드래그가 바꿀 순서가 없다.
- **리스트 뷰도 `sortByManualOrder`** — 보드에서 옮긴 순서가 리스트에서도 같은 순서다.
- **우선순위 깃발** — 제목 끝에 13px 깃발, high=danger / medium=warning / low=accent.

### 11.3 실측 (1440×900, dark, 실행 중인 앱)

| | TickTick | 지금 |
|---|---|---|
| 체크박스 크기 | 17 | **17** |
| 체크박스 히트 영역 높이 | 40 (행 전체) | **35 (행 전체 − 1px 구분선)** |
| 제목 시작 | +58 | **+53** |
| 핸들 | hover 시 표시 | **hover 시 표시**(평소 `opacity: 0`) |

행 높이(36 vs 40)는 그대로다 — L-12는 밀도 토큰의 문제고 D1-4에 걸려 있다.

### 11.4 회귀 테스트

[`e2e/taskRow.spec.ts`](e2e/taskRow.spec.ts) 6건. **단언은 클래스가 아니라 저장소로 간다** — 제목의 취소선은 스타일이고, 계정이 들고 있는 것은 `status: "done"`이다.

| 테스트 | 내용 |
|---|---|
| 행에서 완료 | `status`가 `done`이 되고, 행이 리스트에서 빠지고, **URL의 `?task=`는 그대로** (패널이 안 열림) |
| 히트 영역 | 체크박스 17px, 타깃 높이 = 행의 content 높이 |
| 실행 취소 | 되돌리면 상태가 돌아오고 **행도 돌아온다**, 리로드 후에도 |
| 드래그 정렬 | 세 행 순서가 바뀌고 **리로드 후에도 유지** |
| 우선순위 | high 지정 전 0개, 지정 후 깃발 1개 + `aria-label` |
| 터치 바닥값 | coarse 포인터에서 행 ≥44, 상자 22px, **핸들은 숨김**(hover가 없는 곳에서 hover로 드러나는 것은 없는 것과 같다) |

### 11.5 컨텍스트 메뉴 (2026-08-19)

§3.7이 "우클릭이 필요해서" 미뤄 둔 항목. 미룬 쪽은 TickTick 측정이었지만, 이 앱에는 **`onContextMenu` 핸들러가 소스 전체에 0개**였다 — 우클릭에 아무 반응이 없었다.

[`ContextMenu.tsx`](src/components/common/ContextMenu.tsx)는 일부러 아무것도 모른다. 자기 위치를 잡고, 닫히는 법을 알고, 키보드로 항목 사이를 걷는 것까지가 전부다. **무엇이 올라가는지는 부르는 쪽이 만든다** — 태스크와 리스트가 공유하는 것은 그것을 여는 제스처뿐이기 때문이다.

| 열리는 곳 | 어떻게 |
|---|---|
| 리스트 행 | 우클릭 |
| 리스트 행의 `⋯` | hover에서 나타나는 버튼 — 우클릭은 발견되지 않고 터치에는 없다 |
| 보드 카드 | 우클릭 |

메뉴 항목: 완료/완료 취소 · 우선순위 4단계 · 오늘/내일/날짜 지우기 · 휴지통. **전부 `mutate`를 거치므로 전부 실행 취소된다.** 그 과정에서 `setTaskPriority` 뮤테이션을 새로 만들었다 — Detail 패널은 `priority`를 필드 쓰기로 직접 바꾸고 있었고, 그래서 **거기서 바꾼 우선순위는 되돌릴 수 없었다.**

날짜 지우기는 지울 날짜가 있을 때만 나온다. 아무것도 하지 않는 항목은 메뉴를 열 때마다 읽고 배제해야 하는 줄이다.

**Escape는 한 겹만 닫는다.** 메뉴가 이벤트를 거기서 멈추므로, Drawer를 열어 둔 채 메뉴를 열고 Escape를 누르면 메뉴만 닫히고 Drawer는 남는다(§16.28). 포커스는 연 버튼으로 돌아간다.

리듬 가드가 `⋯` 버튼을 24px로 잡아냈다. 예외로 적는 대신 컨트롤 높이(32)로 올렸다 — 폭은 24, 높이는 격자. 체크박스와 같은 어휘다.

[`e2e/contextMenu.spec.ts`](e2e/contextMenu.spec.ts) 6건: 항목 목록, **두 경로가 같은 메뉴인지**(문자열 비교), 각 항목이 저장소에 무엇을 쓰는지, Escape의 한 겹, 바깥 클릭, 보드 카드.

### 11.6 남은 것 (같은 성격, 아직)

| 항목 | 왜 아직인가 |
|---|---|
| ~~행의 ⋯ 메뉴~~ · ~~우클릭 메뉴~~ | **§11.5에서 완료** |
| 사이드바 리스트의 메뉴 | 같은 컴포넌트를 쓰면 되지만 이름 바꾸기·보관·휴지통 핸들러가 아직 사이드바까지 내려가 있지 않다 |
| 날짜 팝오버 | 지금은 `input[type=date]`. TickTick은 달력 + 반복 + 알림(§3.6에 실측 있음) |
| 헤더 정렬·더보기 | 헤더에 제목·개수·뷰 전환만 있다 |
| 다중 선택 | Today의 인박스 정리에만 있고 리스트에는 없다 |
| 보드 카드 | 클릭=열기, 드래그=이동. 카드에서 완료·우선순위는 아직 |
