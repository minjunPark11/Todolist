# 반응형 레이아웃 감사 (Responsive Audit)

> 대상: `src/styles.css` (12,544줄, 단일 파일)
> 목적: 화면 비율/폭별 레이아웃을 **하나하나 손보지 않고** 체계적으로 정리하기 위한 현황 진단 + 마이그레이션 플랜.
> 작성: 2026-07-05

---

## 1. 요약 (TL;DR)

- media query **26개**, breakpoint 값이 **13종류**(1360/1280/1220/1200/1100/1000/980/900/861/860/760/720/640)로 흩어져 있음.
- 그중 `861`↔`860`, `900`↔`980`, `760`↔`720`처럼 **거의 같은 지점이 미세하게 갈려** 유지보수가 어려움.
- 대부분이 `grid-template-columns: repeat(N, …)` → 좁아지면 `1fr`로 바꾸는 **같은 패턴의 반복**. → 상당수는 `auto-fit/minmax`로 **breakpoint 없이** 대체 가능.
- container query는 **0개**. 여러 폭에서 재사용되는 컴포넌트(캘린더 패널, 보드, 카드)가 뷰포트에만 반응.
- 디자인 토큰(색/여백/radius)은 잘 잡혀 있으나 **breakpoint 토큰이 없음**.

**결론:** 화면별로 다 고려할 필요 없음. ① breakpoint 5개로 통일 → ② 반복 그리드는 fluid로 흡수 → ③ 재사용 컴포넌트는 container query → ④ 파일 구조 정리. 이 순서로 하면 26개 → 약 10~12개로 줄고 값이 일관됨.

---

## 2. 제안 표준 Breakpoint (13종 → 5종)

`:root`에 토큰으로 선언하고 전부 여기에 맞춘다.

| 토큰 | 값 | 티어 | 흡수하는 기존 값 | 대표 동작 |
|------|-----|------|------------------|-----------|
| `--bp-xs` | 640px | 작은 폰 | 640 | 타이포 축소, 모달 풀스크린, 최종 1열 |
| `--bp-sm` | 768px | 폰/작은 태블릿 | 720, 760 | app-shell 세로 스택, 패딩 축소 |
| `--bp-md` | 900px | 태블릿 | 860, 861, 900 | 사이드바 숨김, 캘린더 본문 1열 |
| `--bp-lg` | 1120px | 작은 데스크톱 | 980, 1000, 1100 | 본문 단일 컬럼, 우측 패널 스택 |
| `--bp-xl` | 1240px | 큰 데스크톱 | 1200, 1220, 1280, 1360 | 대시보드 그리드 밀도(3→2열) |

> 값은 조정 가능. 핵심은 "13종을 5종으로" + 모든 `@media`가 이 5개만 쓰게 하는 것.
> CSS 커스텀 프로퍼티는 `@media` 조건식에 직접 못 쓰므로, 값 통일은 컨벤션(주석 + lint) 또는 SCSS/PostCSS 변수로 강제한다. (아래 6절 참고)

---

## 3. 전체 매핑표 (26개 → 표준 티어 + 조치)

조치 범례: **KEEP**=진짜 레이아웃 재배치라 media query 유지 · **FLUID**=`auto-fit/minmax`나 `clamp()`로 breakpoint 제거 가능 · **CQ**=container query로 이전 후보

| # | 줄 | 현재 | 대상 셀렉터 / 동작 | 표준 | 조치 |
|---|-----|------|--------------------|------|------|
| 1 | 483 | `min-width:861` | `.app-shell.sidebar-collapsed` 레일 그리드 | md(900) | KEEP ⚠️값정렬 |
| 2 | 3041 | `max:1360` | `.gcal-year-grid` 3열 | xl | **FLUID** |
| 3 | 3048 | `max:1000` | `.gcal-year-grid` 2열 | lg | **FLUID** |
| 4 | 3390 | `max:1280` | `.gcal-main-column` 1열 | xl | KEEP |
| 5 | 3396 | `max:900` | `.gcal-body` 1열, 사이드바 숨김 | md | KEEP |
| 6 | 4369 | `max:1100` | `.page-grid` 1fr, `.detail-panel` fixed | lg | KEEP |
| 7 | 4412 | `max:760` | `.app-shell` 1열, `.sidebar` static | sm | KEEP |
| 8 | 5056 | `max:1200` | `.today-board-grid/.planning-columns/.study-metrics` 2열 | xl | **FLUID** |
| 9 | 5064 | `max:760` | `main` 패딩, 보드 1열 | sm | FLUID(그리드)+KEEP(패딩) |
| 10 | 5875 | `max:900` | `.ff-attention-grid/.ff-form-grid` 1열 | md | **FLUID** |
| 11 | 5881 | `max:860` | `.app-shell` block(모바일 셸 전환) | md | KEEP ⚠️값정렬 |
| 12 | 6255 | `max:1100` | `.ff-detail-layout/.ff-overview-grid` 1열 | lg | FLUID/CQ |
| 13 | 6333 | `max:1100` | `.ff-board` 2열, `.ff-matrix` 1열 | lg | **CQ**(보드) |
| 14 | 6417 | `max:1100` | `.ff-study-metrics` 2열 | lg | **FLUID** |
| 15 | 7403 | `max:1100` | `.tdy-body/.tdy-plan-groups` 1열 | lg | KEEP |
| 16 | 7413 | `max:640` | `.tdy-head-title` 폰트, `.tdy-search` 폭 | xs | KEEP(타이포) |
| 17 | 8753 | `max:1220` | `.foc-layout` 1열 | xl | KEEP |
| 18 | 8763 | `max:760` | `.foc-page` 패딩, 헤더 스택 | sm | KEEP |
| 19 | 8983 | `max:1220` | `.spc-grid` 3열 | xl | **FLUID** |
| 20 | 9003 | `max:900` | `.spc-grid/.spc-detail-grid` 2열 | md | **FLUID** |
| 21 | 9020 | `max:640` | `.spc-*` 폰트, 1열 | xs | KEEP(타이포)+FLUID |
| 22 | 10244 | `max:1200` | `.sdv-metric-grid` 2열 | xl | **FLUID** |
| 23 | 10258 | `max:720` | `.sdv-*` 1열 | sm | **FLUID** |
| 24 | 10836 | `max:900` | `.sdvn-split` 1열 | md | KEEP |
| 25 | 10866 | `max:640` | `.nqm-modal` 풀스크린 | xs | KEEP |
| 26 | 11455 | `max:980` | `.eis-matrix` 1열 | lg | KEEP |

⚠️값정렬 = 861/860을 md(900)로 맞추면 트리거 지점이 살짝 이동하니 눈으로 확인 필요.

### 집계
- **FLUID로 제거 가능**: #2,3,8,10,14,19,20,22,23 (+부분 9,12,21) → 약 **9~12개**의 media query가 사라질 수 있음.
- **CQ로 이전 후보**: #13(보드), #12(디테일 레이아웃).
- **KEEP(진짜 재배치)**: #1,4,5,6,7,11,15,16,17,18,24,25,26.

---

## 4. Fluid-first로 없앨 수 있는 반복 패턴

지금 여기저기서 이런 식이다:

```css
.grid { grid-template-columns: repeat(4, 1fr); }
@media (max-width:1200px){ .grid { grid-template-columns: repeat(2,1fr); } }
@media (max-width:760px){  .grid { grid-template-columns: 1fr; } }
```

→ breakpoint 없이 한 줄로:

```css
.grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
```

컨테이너가 좁아지면 열 수가 알아서 줄어든다. 대상 후보: `.gcal-year-grid`, `.today-board-grid`, `.planning-columns`, `.study-metrics`, `.ff-study-metrics`, `.ff-attention-grid`, `.spc-grid`, `.sdv-metric-grid`.

여백·폰트도 마찬가지로 `clamp()`:
```css
.page { padding: clamp(16px, 4vw, 32px); }
h1 { font-size: clamp(28px, 4vw, 40px); }
```
→ #7413, #9020, #5064의 패딩/폰트 조정 상당수 흡수.

---

## 5. Container Query 후보

뷰포트가 아니라 **자기가 놓인 칸의 폭**에 반응해야 하는 컴포넌트:

| 컴포넌트 | 이유 |
|----------|------|
| `.ff-board` (플래닝 보드) | 사이드바 접힘/펼침에 따라 가용 폭이 달라짐 → 뷰포트 기준이면 어긋남 |
| 캘린더 우측 패널 / `.gcal-*` | 좌 사이드바 + 우 패널 접힘 조합으로 본문 폭이 4가지 |
| `.ff-overview-grid`, 카드류 | 여러 페이지에서 다른 폭으로 재사용 |

패턴:
```css
.board-wrap { container-type: inline-size; }
@container (max-width: 700px) { .ff-board { grid-template-columns: repeat(2,1fr); } }
```

---

## 6. 파일/구조 정리

현재: 12,544줄 단일 `styles.css`에 반응형이 흩어짐 → "어디를 고쳐야 하지"가 어려움.

권장(택1, 점진 적용 가능):
- **A. 기능별 분할**: `styles/base.css`(토큰), `styles/layout.css`(셸/그리드 원형), `styles/calendar.css`, `styles/planning.css` … 그리고 각 파일 안에서 관련 규칙 **바로 옆에** 그 컴포넌트의 media/container query를 둔다.
- **B. 단일 파일 유지 + PostCSS**: `postcss-custom-media`로 `@custom-media --md (max-width:900px);` 선언 후 `@media (--md)`로 사용 → 값 통일이 강제됨. 분할 없이도 breakpoint 일관성 확보.

둘 다 "레이아웃 원형(archetype)" 개념을 축으로 잡는다:
1. 1열 리스트 · 2. 사이드바+본문 · 3. 사이드바+본문+우측패널(캘린더) · 4. 풀스크린 캔버스.
→ 원형별 그리드 규칙 하나씩만 정의하고 페이지는 클래스로 재사용.

---

## 7. 마이그레이션 플랜 (저위험 → 고위험 순)

각 단계 후 프리뷰로 회귀 확인(뷰포트 리사이즈 + 스크린샷).

- **0단계 — 토큰 선언**: `:root`에 `--bp-*` 5개 추가 + (B안이면 `@custom-media`). 동작 변화 없음.
- **1단계 — 값 통일**: 26개 media query의 13종 값을 5종으로 치환. 861/860→900 등 ⚠️표시만 눈으로 확인. (동작 거의 불변, diff 큼)
- **2단계 — FLUID 전환**: 4절의 반복 그리드를 `auto-fit/minmax`로 교체 → media query 9~12개 삭제. (가장 큰 정리 효과)
- **3단계 — clamp() 도입**: 패딩·폰트 스텝을 clamp로. 타이포 관련 media 축소.
- **4단계 — Container Query**: 5절 컴포넌트 이전. (가장 신중하게, 하나씩)
- **5단계 — 파일 구조 분할**(선택): 6절 A안.

---

## 8. 시범 적용 결과 (2026-07-05, `.spc-grid`)

2단계(FLUID) 패턴을 **Spaces 페이지 `.spc-grid`**에 시범 적용:
- base `repeat(4, minmax(0,1fr))` → `repeat(auto-fit, minmax(200px, 1fr))`
- media query 3곳(1220/900/640)에서 `.spc-grid` 규칙 제거(다른 셀렉터는 유지)

프리뷰 검증(probe로 컨테이너 폭별 열 수 측정):

| 폭 | 열 수 |
|-----|------|
| 1000px | 4 |
| 720px | 3 |
| 460px | 2 |
| 260px | 1 |

→ breakpoint 없이 4→1 자동 반영. 콘솔 에러 없음, 페이지 회귀 없음. **패턴 확정.**

함께 적용(부수 정리):
- `.ff-study-metrics`(StudyPage) → auto-fit, 1100px media 블록 삭제.
- 죽은 CSS `.today-board-grid/.planning-columns/.study-metrics`(컴포넌트 미사용) → auto-fit 전환 + 1200px 블록 삭제, 760px 블록 정리. ※ 이들은 **사용처 없음** → 추후 완전 삭제 후보.

## 9. 진행 현황 (2026-07-05 업데이트)

- **2단계 FLUID 전환 — 완료.** 대시보드/카드 그리드 auto-fit 확산 (커밋 `0bf17a5`, `2acfaf2`). `auto-fit` 19곳.
- **0단계 토큰 선언 — 완료.** `:root`에 `--bp-xs/sm/md/lg/xl` (640/768/900/1120/1240) 추가.
- **1단계 값 통일 — 완료.** 13종 → 5종. 23개 `@media` 전부 표준값만 사용.
  - 매핑: 720·760→768 / 860·861·900→900 / 980·1100→1120 / 1200·1220·1280·1360→1240.
  - 브라우저 검증(dev, 5181): 토큰 로드 OK, media 규칙 23개 전부 파싱, 노출된 폭 값 = 정확히 5종, 콘솔/파싱 에러 0.
  - ⚠️ 861/860→900 인접 정렬됨(이전 1px 갭 제거). 값 이동폭이 큰 곳: 980→1120(`.eis-matrix`), 1360→1240(`.gcal-year-grid`) — 회귀는 안 보였으나 실사용 데이터로 재확인 권장.

- **죽은 CSS 삭제 — 완료.** `.ff-board`, `.today-board-grid`(+자손), `.planning-columns`, `.study-metrics`, `.gcal-main-column` 1240 no-op media 제거. tsx 전수 확인으로 미사용 확정, 자식(`.ff-board-*` 등)은 보존.

- **4단계 Container Query — `.gcal-body` 완료.** 캘린더 본문을 뷰포트가 아닌 **자기 컨테이너 폭**에 반응하도록 전환.
  - `.gcal-body`만 감싸는 `.gcal-body-container`에 `container: gcal / inline-size` 선언. 팝오버(`.gcal-popover`, `.gcal-schedule-modal-backdrop`는 `position:fixed`)는 래퍼 **밖**(shell 직속)에 유지해 layout 컨테인먼트로 인한 기준 이동 방지.
  - 규칙: `@container gcal (max-width: 800px)` → 3열→1열 + 사이드바 숨김. (기존 뷰포트 900px + main-column no-op 대체)
  - probe 검증: 컨테이너 폭 810/799 경계에서 3열↔1열·사이드바 표시↔숨김 정확 전환, 내부 스크롤(shell height bound) 유지, 팝오버 컨테이너 미포함(0), 콘솔 에러 0, tsc 통과.
  - ⚠️ 800px 임계값은 추정치(사이드220+그리드+패널260). 실사용 폭에서 눈으로 미세 조정 여지 있음.
  - 참고: `.ff-board`는 죽은 CSS라 CQ 대상 아님(삭제됨). 다른 gcal-* 패널은 필요 시 동일 패턴으로 확산 가능.

- **5단계 파일 분할 — 완료.** `styles.css`(12.5k줄) → `src/styles/01~09-*.css` 9개 모듈로 분할.
  - 방식: **연속 라인 구간을 순서 보존**하며 슬라이스(토픽별 재배치 X → cascade 불변). `styles.css`는 순서대로 `@import`하는 barrel로 전환.
  - 파일: 01-base / 02-calendar / 03-planning / 04-today / 05-spaces / 06-space-detail / 07-notes-splitview / 08-calendar-categories / 09-calendar-redesign.
  - 검증: 9파일 연결 = 원본과 **바이트 동일(diff 0)**. 프리뷰: 규칙 1816개 전부 로드, media 21·container 1·bp 5종, 토큰 해석, 콘솔 에러 0.
  - 후속(선택): 08 안의 calendar-categories, 09 calendar-redesign을 02-calendar 쪽으로 **토픽 재배치**하려면 cascade 영향 확인 필요 → 별도 작업.

### 미완 / 후속
- 없음(핵심 계획 0~5단계 완료). 남은 건 선택적 토픽 재배치·임계값 실측 미세조정뿐.
