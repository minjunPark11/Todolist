# 디자인 요소 인벤토리 — 현재 앱 (요소별 하나하나)

대상: FocusFlow v0.17.0 (`fa62229`)
방법: `src/styles/*.css` 20개 파일 16,472줄 + `src/**/*.tsx` 83개를 **직접 세었다.** 이 문서의 모든 숫자는 소스에서 뽑은 실측이며, 추정치는 "추정"이라고 적었다.
작성일: 2026-08-20

관련 문서와의 관계:
- `TICKTICK_FIDELITY_AUDIT.md` — 실행 중인 두 제품(TickTick / 우리 앱)을 브라우저에서 잰 **비교** 문서.
- `TICKTICK_VISUAL_LANGUAGE_PLAN.md` — 무엇을 어떤 순서로 고칠지의 **계획**(V-1~V-6).
- **이 문서** — 비교도 계획도 아니고, **우리 앱이 지금 무엇으로 만들어져 있는가**의 목록. TickTick으로 갈아탈 때 "손댈 대상의 전수 목록"이다. 위 두 문서는 "무엇이 다른가 / 무엇을 할까"를 말하고, 이 문서는 "그 대상이 몇 개고 어디 있는가"를 말한다.

---

## 0. 한 장 요약

| 요소 | 지금 몇 종 | 있어야 할 종수(참고) | 상태 |
|---|---|---|---|
| 색 — 하드코딩 hex | **151종** (+ rgba 리터럴 105종) | 토큰만 | 심각 |
| 다크 테마 블록 | **12개**, 파일 5개에만 | 전 파일이 토큰 경유 | 심각 |
| font-size | **69종** (px 40 · rem 29 혼용) | 5~6단 | 심각 |
| font-weight | **13종** (400·500·550·570·600·620·650·680·700·750·800·850·900) | 3~4단 | 심각 |
| border-radius 실효값 | **약 15종** | 3~4단 | 중간 (V-2로 일부 수렴) |
| box-shadow | 토큰 7 + **애드혹 25종**, 그중 **컬러 그림자 8곳** | 3단, 무채색 | 중간 |
| transition 값 | 토큰 2 + **애드혹 20종** | 2단 | 중간 |
| z-index | **26개 층**, 스케일 없음 | 5~6층 | 중간 |
| 클래스 네임스페이스 | **접두사 40+**, 클래스 1,416개 | 1벌 | 심각 |
| 리스트 행 구현 | **5벌** (`.tm-task` / `.task-row` 2회 정의 / `.tlv-row` / `.ff-row` 묶음) | 1벌 | 심각 |
| 버튼 클래스 | **43종** | 4~5 variant | 심각 |
| 입력 클래스 | **27종** | 2~3 | 심각 |
| 모달/팝오버/메뉴 | **4벌** (`ff-modal` / `gcal-*` / `foc-modal` / `cmd-menu`) | 1벌 | 심각 |
| 빈 상태 | **22종** | 1 | 중간 |
| 뱃지/칩/태그 | **65종** | 2~3 | 중간 |

한 줄로: **토큰 레이어는 잘 만들어져 있는데, 화면들이 그 레이어를 통과하지 않고 각자 그린다.** 색 토큰 채택률은 파일별 63~86%이고, 나머지 14~37%가 위 표의 "종수 폭발"을 전부 만들어낸다.

> **§7 추가(2026-08-20):** 위 표의 클래스 1,416개 중 **458개(28%)가 소스 어디에도 안 나온다.** 규칙으로는 611개, **4,053줄(전체의 25%)이 아무것도 그리지 않는다.** 다만 지워도 위 표의 "종수"는 거의 안 줄어든다 — 변종은 살아 있는 코드에 있다. 상세는 §7.

---

## 1. 시스템 지도 — 무엇이 무엇을 그리는가

`src/styles.css`는 배럴이고 @import 순서가 곧 cascade다(순서를 바꾸면 오버라이드가 깨진다).

| # | 파일 | 줄 | 담당 | 색 토큰 채택률 |
|---|---|---|---|---|
| 01 | `01-base.css` | 1,782 | **토큰 정의 전부** + 레거시 원시 컴포넌트 | 63% |
| 02 | `02-calendar.css` | 3,315 | 캘린더(최대 파일) | 63% |
| 03 | `03-planning.css` | 2,121 | 플래닝/포커스 | 86% |
| 04 | `04-today.css` | 968 | Today | 82% |
| 05 | `05-spaces.css` | 731 | (구)Spaces | 71% |
| 06 | `06-space-detail.css` | 1,328 | Space 상세 = `sdv-*` | 67% |
| 08 | `08-calendar-categories.css` | 864 | 캘린더 카테고리 | 73% |
| 09 | `09-calendar-redesign.css` | 486 | 캘린더 재설계 오버라이드 | 75% |
| 10 | `10-calendar-apple.css` | 281 | 캘린더 Apple 스킨 (다크 블록 8/12개가 여기) | 77% |
| 12 | `12-timeline.css` | 241 | 타임라인 | 73% |
| 13 | `13-list-view.css` | 181 | 리스트 뷰 = `tlv-*` | 76% |
| 14 | `14-scope-calendar.css` | 35 | 스코프 캘린더 | — |
| 15 | `15-goals-section.css` | 159 | 목표 | 80% |
| 16 | `16-overview-section.css` | 198 | 오버뷰 = `ovs-*` | 73% |
| 17 | `17-tasks-module.css` | 1,962 | **Tasks Module = 신규 표준** | 71% |
| 18 | `18-schedule-editor.css` | 525 | 일정 편집기 = `sched-*` | 76% |
| 19 | `19-app-shell.css` | 617 | Rail·Context Sidebar·헤더 | 76% |
| 20 | `20-density.css` | 126 | 밀도 통일 레이어(zoom 대체) | — |
| 21 | `21-components.css` | 524 | 공용 컴포넌트(V-6 시작점) | 79% |

읽는 법: **17·19·20·21이 "새 언어", 01~16이 "옛 언어"다.** 새 언어는 4개 파일 3,229줄, 옛 언어는 13,243줄. TickTick 전환의 실제 작업량은 이 13,243줄을 어떻게 처리하느냐로 결정된다.

---

## 2. 요소별 분석

### 2.1 색 (Color)

**있는 것 — 토큰 레이어는 제대로 있다.** `01-base.css:1~305`에 4겹으로 정의돼 있다.

1. Apple 레거시 (`--color-*`) — 지금은 전부 아래 층으로 리다이렉트됨(`01-base.css:245~256`).
2. FocusFlow 정본 (`--bg-*`, `--text-*`, `--border-*`, `--accent`, `--danger/warning/success/purple`, `--tint-*` 5색 × 3역할).
3. 역할 별칭 (`--bg`, `--surface`, `--text`, `--border`, `--hover`, `--selected`) — 다섯 스타일시트가 이미 이 이름으로 쓰고 있었는데 **정의가 없어서 하드코딩 fallback으로 그려지던 것**을 P0-10에서 정의한 층.
4. 셸용 `--ff-*` 층 — 원래 `02-calendar.css` 2,900줄째에 있던 것을 옮겨온 것.

**문제 — 화면이 토큰을 우회한다.**

- 하드코딩 hex **151종**, rgba 리터럴 **105종**.
- 가장 많이 쓰인 raw 값: `#fff` 70회, `#8e8e93` 47회, `#1c1c1e` 23회, `#6b7280` 17회, `#e5e7eb` 14회, `#0a84ff` 12회.
  - `#8e8e93`은 `--text-tertiary`와 **같은 값**이다. 47번을 토큰 대신 손으로 적었다.
  - `#6b7280` · `#e5e7eb` · `#f3f4f6`는 Tailwind 회색이다. Apple 회색(`#8e8e93` / `#e5e5e7`)과 **두 벌의 회색 체계가 공존**한다.
- 파일별 raw 색 선언 수: `17-tasks-module` 163, `01-base` 159, `02-calendar` 111, `06-space-detail` 39.
  - 신규 표준이어야 할 `17-tasks-module.css`가 raw 색 1위다. 이건 바로 아래 항목과 함께 읽어야 한다 — 대부분이 `var(--x, #hex)` 형태의 fallback이다.
- **`var(--토큰, #하드코딩)` 패턴 217곳.** 이 중 138곳이 `17-tasks-module.css`. fallback은 토큰이 없을 때 조용히 옛 색으로 그리는 장치라서, **토큰이 깨져도 아무도 모르게 만든다.** (실제로 P0-10 이전에 Tasks Module이 다크 모드에서 흰 패널을 그린 원인이 이것이었다.)

**TickTick 전환 관점:** 팔레트를 갈아끼우는 작업이 `:root` 한 곳 수정으로 끝나야 하는데, 지금은 **256개의 raw 값 + 217개의 fallback**을 같이 손대야 끝난다. 실질적으로 색 교체가 불가능한 상태다. → 우선순위 1.

---

### 2.2 테마 (다크 모드)

- `[data-theme="dark"]` 블록 **총 12개**, 파일 **5개**에만 존재: `10-calendar-apple`(8) · `01-base`(1) · `02-calendar`(1) · `04-today`(1) · `09-calendar-redesign`(1).
- `01-base.css:306~357`의 다크 블록은 잘 짜여 있다 — 표면 위계(Rail `#0a0a0c` < Sidebar `#0d0d0f` < 캔버스 `#101012` < 서피스 `#1c1c1e`)를 뒤집어 놓았고, selection을 accent가 아니라 알파(`rgba(255,255,255,.1)`)로 잡았고, 그림자 알파도 다크용으로 재정의했다.
- **문제:** 나머지 14개 파일은 다크 대응이 0이다. 이 파일들이 토큰을 100% 경유하면 그래도 되는데, §2.1에서 봤듯 채택률은 63~86%다. **즉 다크 모드에서 raw `#fff` / `#6b7280`이 그대로 나오는 지점이 파일당 수십 개씩 남아 있다.**
- 액센트는 `[data-accent]` 5색(blue/purple/green/pink/orange)으로 오버라이드 가능(`01-base.css:295~301`). 구조는 옳다.

**TickTick 전환 관점:** TickTick도 라이트/다크 양쪽을 쓴다. 다크에서 깨지는 지점을 먼저 세지 않으면 전환 후 "다크만 이상한 화면"이 화면 수만큼 나온다. → 색 정리(§2.1)와 같은 작업의 뒷면.

---

### 2.3 타이포그래피

**정의된 것:** `--font-page-title`(700 22/30), `--font-section-title`(600 16/24), `--label-size` 10px, 밀도 토큰 `--density-font` 13 / `-sm` 12 / `-lg` 15 / `--density-title` 20 / `--density-section-title` 15. 루트는 14px/1.5, `letter-spacing: -0.01em`, `font-feature-settings: "ss03"`, 시스템 스택(-apple-system → SF Pro Text → Inter → Segoe UI).

**실제로 쓰인 것:**

- **font-size 69종.** px 계열 상위: 12px(140회) · 13px(134) · 14px(73) · 11px(38) · 15px(27) · 16px(26) · 10px(11).
- rem 계열 **29종**이 별도로 존재: 0.78rem(24회) · 0.82rem(17) · 0.86rem(12) · 0.8rem(10) · 0.9rem(9)… **0.78rem = 12.48px**로, 12px·13px과 나란히 놓이면 눈에는 셋 다 다른 크기다.
- 토큰을 통해 크기를 정한 곳은 **9곳뿐**(`--density-font` 5 · `--label-size` 2 · `--density-title` 1 · `--density-font-sm` 1). 나머지 **수백 곳이 리터럴**이다.
- **font-weight 13종.** 600(124회) · 700(54) · 650(29) · 400(20) · 500(19) · 800(18) · 750(8) · 900(4) · 680(4) · 570(4) · 550(4) · 850(2) · 620(2).
  - 570·620·650·680·750·850은 가변 폰트 축 값인데, 시스템 스택의 SF/Segoe는 대부분 **가변이 아니다.** 즉 650은 700으로, 570은 600으로 반올림되어 렌더된다 — **의도한 차이가 화면에 존재하지 않는다.**
- 반응형 타이틀에 `clamp()` 3곳(최대 62px, 4.5rem 등). 대시보드/랜딩 성격의 큰 글자가 productivity 밀도와 섞여 있다.

**TickTick 전환 관점:** TickTick의 타입 스케일은 좁다(본문 13~14, 보조 12, 제목 16~20 수준 — `TICKTICK_FIDELITY_AUDIT.md` §2.3 실측 참조). 69종 → 6종으로 줄이는 것은 기계적 치환이 아니라 **각 리터럴이 어느 단으로 가야 하는지 판단하는 작업**이며, rem/px 혼용 때문에 정규식 일괄 치환이 안 된다. → 우선순위 2, 그리고 가장 손이 많이 가는 항목.

---

### 2.4 Radius

**정의된 것:** 두 벌이 공존한다.
- 구: `--rounded-xs` 6 / `-sm` 8 / `-md` 10 / `-lg` 12 / `-pill`(별칭)
- 신: `--radius-sm` 8 / `-md` 10 / `-lg` 12 / `-xl` **12**(이름만 xl) / `-pill` 9999
- 밀도: `--density-radius` 10

구 토큰은 이미 신 스케일을 가리키도록 재지정됐다(V-2). 토큰 값 자체는 **6/8/10/12/pill 5종**으로 수렴돼 있다 — 여기까진 좋다.

**문제 — 리터럴이 스케일 밖에 산다.**

- 리터럴 사용: 8px(72회) · 10px(54) · 6px(24) · 12px(24) · **50%(36회)** · 그 외 2·3·4·5·13·15·16·22·36px.
- 즉 실효 radius 집합 ≈ **{2, 3, 4, 5, 6, 8, 10, 12, 13, 15, 16, 22, 36, 50%, pill} 15종.**
- 8px·10px·12px 리터럴 150회는 **값이 맞는데 토큰을 안 쓴 것**이므로 안전한 기계 치환 대상이다. 반면 13·15·22·36은 스케일 밖이라 판단이 필요하다.
- `50%` 36회는 대부분 아바타·도트(`.tm-dot` 8×8 등)로 정상 용법이다.
- 부분 radius 4종(`12px 12px 0 0`, `8px 0 0 8px`, `0 8px 8px 0`)은 시트/드로어용. 정상.
- 유기적 blob radius 1곳(`42% 58% 58% 42% / 48% 36% 64% 52%`) — 마케팅 성격 장식. productivity 언어에 없는 요소.

**TickTick 전환 관점:** TickTick은 사실상 **4/6/8 + pill** 정도만 쓴다(원문 실측은 fidelity audit §2.2). 우리 스케일(6/8/10/12)은 TickTick보다 한 단 크다. 값 자체를 내리는 것은 `:root` 5줄 수정이라 **가장 싸게 효과가 큰 작업**이지만, 리터럴 150회가 토큰을 안 보므로 그 치환이 선행돼야 의미가 있다. → 우선순위 3, 비용 대비 효과 최상.

---

### 2.5 그림자 (Shadow)

**정의된 것:** `--shadow-xs/sm/md/lg` 4단 + 역할 별칭 3개(`-card`=xs, `-raised`=md, `-panel`=lg) + `--product-shadow` 1개. 다크에서 알파를 .06/.08/.10/.13 → .30/.34/.38/.42로 재정의. 설계는 옳다.

**실제:**
- 토큰 사용 51회(`--shadow-card` 22 · `-raised` 10 · `-lg` 10 · `-xs` 3 · `-sm` 2 · `-panel` 2 · `-md` 2).
- **애드혹 그림자 약 25종.** `0 18px 48px rgba(0,0,0,.28)`(3회), `0 8px 28px …`, `0 12px 32px …`, `0 34px 90px …` 등.
- **컬러 그림자 8곳** — V-3에서 폐기하기로 한 것들이 남아 있다:
  - `02-calendar.css:2275` `0 34px 90px rgba(82,116,171,.22)` — 파란 회색 그림자, blur 90px
  - `02-calendar.css:2424` `0 16px 28px rgba(39,97,255,.24)` — 파란 그림자
  - `02-calendar.css:2346` `0 0 0 4px rgba(79,132,255,.12)`
  - `02-calendar.css:2989`, `02-calendar.css:1720` — inset 컬러 링
  - `09-calendar-redesign.css:414` `0 18px 48px rgba(15,23,42,.14)`
  - `13-list-view.css` 계열의 `rgba(10,132,255,.18)` 포커스 링 2곳
- 포커스 링도 3벌이다: `0 0 0 3px var(--accent-soft)` / `0 0 0 4px rgba(79,132,255,.12)` / `--ff-focus-ring` 토큰(2px, offset 2 규약). **규약은 하나로 정해졌는데 코드가 셋이다.**

**TickTick 전환 관점:** TickTick은 그림자를 거의 안 쓴다 — 경계선과 표면 밝기로 위계를 만들고, 그림자는 팝오버/모달 같은 진짜 떠 있는 층에만 쓴다. blur 90px짜리 컬러 그림자는 정반대의 언어다. 대상이 25곳뿐이라 **가장 빨리 끝나는 항목**이다. → 우선순위 4, 저비용.

---

### 2.6 여백과 밀도 (Spacing / Density)

**정의된 것:**
- 옛 스케일: `--space-xxs` 4 / `-xs` 8 / `-sm` 12 / `-md` **17** / `-lg` 24 / `-xl` 32 / `-xxl` 48. **17px은 8의 배수 격자에서 벗어난 값**이고, 이 하나 때문에 스케일 전체가 배수 관계를 잃는다.
- 밀도 토큰(`20-density.css`가 소비): `--density-page-y` 24 / `-page-x` 32 / `--density-card-pad` 14 / `-card-gap` 12 / `--density-control-h` **32** / `--density-control-pad-x` 12 / `--density-tap` **24**(WCAG 2.2 SC 2.5.8) / `--density-icon` 16 / `-icon-lg` 18.
- `@media (pointer: coarse)`에서 탭 타깃 44px 바닥(`20-density.css:117~126`). **접근성 처리가 명시적으로 돼 있다 — 이건 잘 된 부분이다.**

**설계 의도(문서화가 잘 돼 있음):** 예전에 `.app-shell > main`에 `zoom: 0.9`를 걸어 밀도를 만들던 것을 폐기했다. zoom은 타입·패딩·보더·탭 타깃을 동시에 줄여서 13px 라벨이 11.7px로 렌더됐고, 두 셸 중 하나에만 걸려서 같은 사이드바 옆에 두 배율의 콘텐츠가 섰다. `20-density.css`가 그 대체다.

**남은 문제 — 수직 리듬이 여전히 여러 개다.**

| 행 종류 | 높이 | 위치 |
|---|---|---|
| 사이드바 행 `.tm-row` | min-height **36** | `17-tasks-module.css:75` |
| 태스크 행 `.tm-task` | min-height **36** | `17-tasks-module.css:229` |
| 공용 행 묶음 (`.ff-row`, `.side-list li`, `.spc-list-row`, `.list-view-row`, `.gcal-cat-row`) | `--density-control-h` = **32** | `21-components.css:234~245` |
| 리스트뷰 행 `.tlv-row` | height **38**(고정) | `13-list-view.css:99` |
| 레거시 `.task-row` | min-height **58** | `01-base.css:814` |
| 레거시 `.task-row`(캘린더 재정의) | padding 12px 2px, 높이 미지정 | `02-calendar.css:2943` |

**즉 행 높이가 32 / 36 / 38 / 58 네 종류이며, 같은 클래스명 `.task-row`가 두 파일에서 서로 다르게 정의된다.**

**TickTick 전환 관점:** TickTick의 리스트는 단일 리듬으로 스캔된다. 우리는 화면을 옮길 때마다 행 높이가 바뀐다. 이건 색이나 radius보다 **체감상 "다른 앱처럼 느껴지는" 주된 원인**이다. → 우선순위 2(타이포와 동급).

---

### 2.7 모션 (Motion)

- 토큰: `--motion-fast` 120ms ease-out / `--motion-base` 180ms ease-out. 2단, 적절하다.
- 토큰 사용은 **파일 6개에만** 집중: `03-planning`(13) · `04-today`(8) · `08`(3) · `09`(3) · `17-tasks-module`(2) · `02-calendar`(1) · `21-components`(1). **나머지 13개 파일은 0.**
- 애드혹 duration **20종**: `0.12s` · `0.15s` · `0.16s` · `0.2s` · `0.28s` · `0.3s` · `120ms` · `160ms` …
- 커스텀 이징 `cubic-bezier(0.2, 0, 0, 1)` 4곳 — 셸 폭 트윈용(`19-app-shell.css:67` 등). 의도가 명확하고 문서화돼 있으므로 **이건 남길 후보**다. 다만 토큰 이름이 없다(`--motion-shell` 같은).
- `transition: none` 7곳(그중 `!important` 3곳) — `prefers-reduced-motion` 대응인지 임시 봉합인지 **미확인.**

**TickTick 전환 관점:** 영향 작음. 다만 20종 → 2~3종은 30분짜리 작업이라 같이 처리하는 게 이득. → 우선순위 6.

---

### 2.8 z-index

- **26개 층**이 쓰였다: 1, 2, 5, 9, 20, 24, 25, 26, 30, 35, 40, 45, 50, 60, 70, 80, 180, 200, 210, 220, 230, 240, 1200, 1300, 1400, 1500.
- 토큰 없음. 스케일 없음. 24·25·26 같은 값은 **"바로 위에 얹으려고 +1 한" 흔적**이고, 1200~1500 대역은 별도 체계(모달/토스트 추정)다.
- 층 사이의 의미(드로어 < 팝오버 < 모달 < 토스트)가 코드에 적혀 있지 않아, 새 오버레이를 넣을 때마다 다시 추측해야 한다.

**TickTick 전환 관점:** 시각 언어와 직결되진 않지만, 오버레이 계층(드로어·팝오버·퀵애드)을 TickTick 방식으로 재배치할 때 **먼저 정리돼야 하는 항목**이다. → 우선순위 5.

---

### 2.9 셸 (Rail · Context Sidebar · 헤더)

`19-app-shell.css:12~18`이 정본 토큰을 갖고 있다.

| 요소 | 우리 값 | TickTick 실측(fidelity audit §1.1) | 차 |
|---|---|---|---|
| Global Rail 폭 | `--rail-w` **56px** | **50px** | +6 |
| Rail 아이템 | `--rail-item` **40×40** | 40×40 | 0 |
| Rail 아이콘 | 24px (`19-app-shell.css:249`) | **28px** | −4 |
| Rail 세로 step | 미토큰화 | 50 | — |
| Context Sidebar | `--context-sidebar-w` **248px** | **240px** | +8 |
| 헤더 | `--shell-header-h` **56px** | — (미측정) | — |
| 뷰 스위처 | `--shell-view-switcher-h` **40px** | — | — |
| Detail pane | 조건부 | **항상 존재, 500px 고정** | 구조 차이 |

- 그리드는 `grid-template-columns: var(--context-sidebar-w, 248px) minmax(0,1fr) [auto]`로 1024px 이상에서만 3열(`19-app-shell.css:38~67`). 767px 이하에서는 Rail을 숨긴다(`:453`).
- **구조적 차이 하나:** TickTick은 태스크 선택 여부와 무관하게 detail pane이 **항상** 있고 빈 상태를 그린다. 우리는 조건부다. 이건 CSS가 아니라 **레이아웃 결정**이므로 별도 판단 항목.
- Rail/Sidebar/캔버스의 밝기 순서는 V-1에서 이미 뒤집었다(내비가 콘텐츠보다 어둡게). **여기는 정리된 부분.**

**TickTick 전환 관점:** 폭 6~8px 차이는 토큰 두 줄 수정이다. 진짜 작업은 detail pane 상시화. → 우선순위 3(토큰) / 별도 판단(pane).

---

### 2.10 컴포넌트 — 요소별

여기가 이 문서의 핵심이다. **같은 것을 그리는 코드가 몇 벌인가**를 센다.

#### 2.10.1 리스트 행 — 5벌
§2.6 표 참조. `.tm-task`(신규 표준, 36px, 하단 보더, 호버 배경) / `.task-row`(01-base: 58px 카드형, 보더+radius / 02-calendar: 같은 이름 재정의) / `.tlv-row`(38px 고정) / `21-components.css`의 5클래스 묶음(32px).
- `.tm-task`만이 TickTick식이다 — 카드가 아니라 행, border-bottom 1px, 호버 시 배경만.
- `.task-row`(01-base)는 **카드형**이다: 1px 보더 + radius 10 + 배경 + 58px. 이건 다른 제품의 언어다.

#### 2.10.2 사이드바 행 — 2벌
`.tm-row`(36px, radius 6, selected = 중립 `--bg-selected`, weight 500) vs `.side-list li`(32px, radius 8, `21-components.css`). 높이도 radius도 다르다.
- `.tm-row`의 selected 처리는 **옳다**: accent 틴트가 아니라 중립 회색. TickTick도 그렇다. V-1에서 고쳐진 부분.

#### 2.10.3 버튼 — 43종
`ff-btn`(+primary/secondary/ghost/danger/sm) · `sdv-btn`(+primary/danger/icon/sm) · `tdy-btn`(+navy/sm) · `gcal-*`(icon-btn / icon-button / today-btn / ai-btn / create-icon-btn / cat-menu-btn / popover-category-btn / taskpanel-rail-btn) · `primary-action` · `text-button` · `toolbar-button` · `danger-button`(+inline) · `import-button` · `check-button` · `auth-icon-button` · `mobile-menu-button` · `foc-options-button` · `spt-menu-btn` · `side-collapse-btn` · `ff-inline-add-btn` · `ff-rev-btn` · `ff-import-btn` · `ff-cat-recolor-btn` …
- `21-components.css:79~192`가 `primary-action` / `sdv-btn` / `ff-btn-*`를 **한 규칙으로 묶기 시작**했다(V-6의 출발점). 아직 `gcal-*` · `tdy-*`는 밖에 있다.
- 같은 의미의 이름이 두 벌씩 있다: `gcal-icon-btn` vs `gcal-icon-button`, `ff-icon-btn` vs `ff-icon-btn-bordered`.

#### 2.10.4 입력 — 27종
`ff-field` · `tm-field` · `tm-modal-input` · `tm-quickadd-field` · `tm-search-input` · `tdy-capture-input` · `cmd-menu-input` · `detail-title-input` · `detail-description-input` · `tlv-cell-input` · `sched-time-field` · `auth-input-wrap` · `pjh-name-input` · `assistant-field` · `ff-localai-url-input` …
- `20-density.css:82~88`이 `.tdy-capture-input`, `.tdy-search input`, `.quick-add input` 세 개만 높이/폰트를 통일했다. 나머지 24종은 각자.
- 전역 `input { width: 100% }` 규칙이 존재해서 체크박스가 늘어나는 것을 개별 파일에서 되돌리고 있다(`02-calendar.css:305~307`). **전역 셀렉터가 만든 부채.**

#### 2.10.5 체크박스 — 6벌
`.check-button`(01-base, 24×24 + `.check-high/medium/low/none` 우선순위 색) · `.tm-task-check input`(17×17, `accent-color`, 네이티브) · `.gcal-cat-row input[type=checkbox]`(커스텀 `::after` 체크마크) · `.sdv-task-row input` · `.gcal-layer-toggle input` · `.tm-drawer-done input`.
- **완료 체크는 태스크 앱에서 가장 자주 보는 요소**인데 6벌이다. TickTick은 우선순위 색이 체크박스 자체에 들어간다(원형 링 + 색). 우리는 `.check-button`(원형+색)과 `.tm-task-check`(네이티브 사각형) 두 철학이 공존한다.
- `.tm-task-priority`는 별도로 **제목 뒤 플래그**로 우선순위를 그린다(`17-tasks-module.css:294~311`). 즉 우선순위 표현이 체크박스(구)와 플래그(신) 두 군데.

#### 2.10.6 모달 · 팝오버 · 메뉴 — 4벌
- `ff-modal`(+backdrop/head/body/actions/wide) — 표준 후보
- `gcal-schedule-modal`(+backdrop/head/actions) + `gcal-popover`(하위 클래스 18종)
- `foc-modal`(+backdrop)
- `cmd-menu`(+backdrop/input/results/group/row/sub/state)
- 컨텍스트 메뉴는 `ff-context-menu`(`21-components.css:266~340`, `position: fixed`, 포인터 위치 배치)와 `ff-cat-menu` / `gcal-cat-menu-btn` / `ff-menu-item` / `ff-menu-sep`가 공존.
- 드로어는 modifier로 3형태: `is-inline-drawer` / `is-overlay-drawer` / `is-right-sheet`.

#### 2.10.7 빈 상태 — 22종
`ff-empty`(+icon) · `tm-section-empty` · `tm-drawer-empty` · `sdv-empty`(+inline) · `sdv-tasks-empty`(+icon) · `sdv-goal-list-empty` · `foc-empty` · `tdy-bucket-empty` · `tdy-queue-empty` · `tdy-rail-empty` · `gcal-empty-hint` · `gcal-sidebar-empty` · `gcal-taskpanel-empty` · `ff-timeline-empty` · `ff-today-empty` · `fdm-empty` · `ff-projbadge-empty` · `ollama-chat-attach-empty` · `is-empty`.
- 화면마다 빈 상태를 새로 만들었다. 아이콘 유무·문구 위치·색이 제각각일 가능성이 높다(개별 렌더 결과는 **미측정**).

#### 2.10.8 뱃지 · 칩 · 태그 — 65종
세부는 세지 않았고 클래스 수만 셌다. 카운트 표시만 5종이다(`tm-count`, `tm-title-count`, `pjh-count`, `fdm-count`, `tm-field-count`).

#### 2.10.9 네임스페이스 전체
클래스 **1,416개**, 접두사 상위: `ff`(516) · `gcal`(463) · `tm`(301) · `sdv`(259) · `is`(194, 상태 modifier) · `tdy`(173) · `foc`(140) · `sched`(79) · `ollama`(56) · `detail`(53) · `ovs`(40) · `auth`(40) · `assistant`(38) · `tlv`(36) · `spt`(36) · `rail`(30) · `pjh`(16) …
- `is-*` 194개가 상태 modifier로 일관되게 쓰이는 것은 **좋은 규약**이다. 이건 유지.

---

### 2.11 위생 지표

- `!important` **14곳**(01-base 5 · 06-space-detail 4 · 17-tasks-module 2 · 02-calendar 2 · 04-today 1). 16,472줄 대비 적다. **양호.**
- 스크롤바 전역 숨김(`01-base.css:275~285`) — 스크롤 가능 여부가 시각적으로 안 보인다. 의도된 결정이지만 TickTick은 반대다(호버 시 표시).
- 인라인 `style={{}}` — tsx 25개 파일에서 53회. 대부분 동적 색/위치로 추정되나 **개별 확인은 안 했다.**
- 같은 클래스명이 두 파일에서 정의되는 사례 확인됨: `.task-row`(01-base + 02-calendar). 다른 중복은 **전수 확인 안 함.**

---

## 3. 요소별 우선순위 (TickTick 전환 관점)

| 순위 | 요소 | 대상 수 | 비용 | 효과 | 근거 |
|---|---|---|---|---|---|
| 1 | 색 토큰 경유 강제 | raw 256 + fallback 217 | 큼 | 최대 | 이게 안 되면 팔레트 교체 자체가 불가능 |
| 2 | 행 높이·타입 스케일 통일 | 행 4종 · size 69종 · weight 13종 | 큼 | 최대 | "다른 앱처럼 느껴지는" 주원인 |
| 3 | radius 스케일 하향 + 리터럴 치환 | 리터럴 150 + 토큰 5줄 | 작음 | 큼 | 값 맞는 리터럴 150개는 기계 치환 가능 |
| 3 | 셸 폭 정렬(56→50, 248→240, 아이콘 24→28) | 토큰 3줄 | 최소 | 중간 | `19-app-shell.css:12~18` 한 곳 |
| 4 | 컬러 그림자 폐기 + 포커스 링 단일화 | 8 + 3 | 작음 | 중간 | V-3에서 이미 결정된 사항 |
| 5 | z-index 스케일 도입 | 26층 | 중간 | 낮음(선행조건) | 오버레이 재배치 전에 필요 |
| 6 | 모션 토큰화 | 20종 | 작음 | 낮음 | 곁다리로 처리 |
| — | 컴포넌트 언어 통합(버튼 43 · 입력 27 · 모달 4벌 · 체크박스 6벌) | 매우 큼 | 매우 큼 | 최대 | V-6. **단계를 쪼개지 않으면 착수 불가** |
| — | detail pane 상시화 | 구조 | 중간 | 큼 | CSS 아님, 레이아웃 결정 |

---

## 4. 이미 정리된 것 (다시 건드리지 말 것)

측정 중 확인한, **이미 옳게 되어 있는** 항목들:

1. **토큰 레이어의 구조** — 4겹(레거시 별칭 → 정본 → 역할 별칭 → `--ff-*` 셸층)이 서로를 가리키게 정리돼 있다. 다크 블록이 원시 값만 재정의하면 되도록 별칭이 설계돼 있다.
2. **다크 표면 위계** — Rail < Sidebar < 캔버스 순서가 V-1에서 뒤집혔다.
3. **selected = 중립** — 사이드바 선택이 accent 틴트가 아니다(`.tm-row.is-current`).
4. **밀도 = zoom 폐기** — `20-density.css`가 토큰 기반으로 대체.
5. **탭 타깃 바닥** — `--density-tap` 24 + `pointer: coarse`에서 44px.
6. **`is-*` 상태 modifier 규약** — 194곳에서 일관.
7. **`!important` 절제** — 16k줄에 14곳.
8. **드래그 핸들 hover-only** — `.tm-task-handle`(TickTick과 같은 처리).

---

## 5. 이 문서가 측정하지 않은 것

정직하게 남긴다.

- **렌더 결과를 안 봤다.** 이 문서는 소스 정적 분석이다. 실제 computed value 비교는 `TICKTICK_FIDELITY_AUDIT.md`가 브라우저에서 한 것이고, 이 문서는 "소스에 무엇이 몇 개 있는가"만 센다. 둘은 다를 수 있다(cascade에서 죽는 규칙이 있다).
- ~~**죽은 CSS를 안 골라냈다.**~~ → **§7에서 쟀다.** 결과는 §7. (초판에서 "`05-spaces.css`가 많이 죽었을 것"이라고 적었는데 **틀렸다** — 그 파일은 0% 죽었다. 죽은 코드는 `02-calendar` · `01-base` · `03-planning` · `06-space-detail`에 있다.)
- **인라인 스타일 53곳의 내용**을 안 봤다.
- **클래스명 중복 정의**를 `.task-row` 외에는 전수 확인 안 했다.
- **빈 상태 22종의 실제 생김새**를 비교 안 했다.
- **`transition: none` 7곳의 이유**(reduced-motion인지 봉합인지)를 확인 안 했다.

---

## 6. 다음 한 걸음 제안

**초판의 제안은 절반만 맞았다.** §7에서 실제로 재보니 죽은 CSS는 **4,053줄(전체의 25%)**로 많았지만, 그걸 지워도 §3의 "종수" 문제는 거의 줄지 않는다 — font-size 69종 중 15종만, 색 리터럴은 21종만 사라진다. **변종은 살아 있는 코드에 있다.**

그래서 순서는 이렇게 된다.

1. **죽은 CSS 4,053줄 삭제** — 리팩터링이 아니라 삭제라서 위험이 가장 낮고, 이후 모든 grep·치환·측정의 노이즈를 25% 줄인다. (선행 조건: §7.4의 e2e 16건)
2. 그다음에 §3의 1번(색) → 2번(행 높이·타입) 순서로 간다. 이 순서는 §7 이후에도 바뀌지 않는다.

---

## 7. 죽은 CSS 실측 (2026-08-20)

방법: `src/styles/*.css`에서 클래스 셀렉터를 전부 뽑고(주석 제거 후), `src/**/*.{ts,tsx,html}`에 등장하는 모든 식별자 토큰과 대조했다. 판정을 **보수적으로** 했다 — 소스 어디에든(문자열·주석·변수명 포함) 같은 토큰이 있으면 "살아 있음"으로 셌다. 따라서 아래 "dead"는 **소스 전체에 단 한 번도 안 나오는 클래스**다.

`` `sdv-status-${...}` `` 같은 동적 조합은 별도 열(`dyn?`)로 분리했고, `innerHTML`로 클래스를 주입하는 코드가 있는지도 확인했다 — 테스트 파일 1곳뿐이라 이 경로의 위험은 없다.

### 7.1 클래스 단위

| 파일 | 클래스 | dead | dyn? | dead% |
|---|---|---|---|---|
| `03-planning.css` | 328 | **139** | 18 | 42% |
| `02-calendar.css` | 288 | **126** | 11 | 44% |
| `01-base.css` | 137 | **90** | 3 | **66%** |
| `06-space-detail.css` | 127 | **53** | 17 | 42% |
| `21-components.css` | 70 | 16 | 1 | 23% |
| `04-today.css` | 101 | 13 | 12 | 13% |
| `20-density.css` | 22 | 11 | 0 | **50%** |
| `09-calendar-redesign.css` | 66 | 7 | 4 | 11% |
| `08-calendar-categories.css` | 88 | 2 | 4 | 2% |
| `16-overview-section.css` | 24 | 1 | 0 | 4% |
| `05-spaces.css` · `10` · `12` · `13` · `14` · `15` · `17` · `18` · `19` | — | **0** | — | 0% |
| **합계** | **1,643** | **458** | 90 | **28%** |

**초판의 가설이 틀린 지점:** `05-spaces.css`(731줄)는 **0% 죽었다.** Space 화면은 폐지됐지만 `spc-*` 클래스는 다른 화면이 그대로 쓰고 있다. 반대로 `01-base.css`는 **66%가 죽었다.**

무엇이 죽었는지(접두사별):
- `01-base.css` — `spt-*` 19(구 Space 트리) · `calendar-*` 18(구 캘린더, `gcal-*`로 대체됨) · `task-*` 11 · `check-*` 5 · `subtask-*` 5. **§2.10.1에서 "다른 제품의 언어"라고 지적한 58px 카드형 `.task-row`, §2.10.5의 `.check-button` 6벌 중 1벌이 전부 여기 있다 — 즉 이미 죽은 것을 세고 있었다.**
- `02-calendar.css` — `gcal-*` 31 · `project-*` 12 · `trend-*` 9 · `habit-*` 8 · `kpi-*` 7 · `dash*-` 10. 대시보드/습관/트렌드 차트 계열이 통째로.
- `03-planning.css` — `ff-*` 118. 가장 큰 단일 덩어리.
- `06-space-detail.css` — `sdv-*` 53. `SpaceDetailView.tsx`가 다시 쓰였고(`sdv-page` / `sdv-header-card` / `sdv-metric-*`), 옛 `sdv-task-row` · `sdv-goal-list` · `sdv-activity-*` · `sdv-toolbar`가 남았다.

### 7.2 줄 수 — 셀렉터가 전부 죽은 규칙만

| 파일 | 죽은 규칙 | 줄 |
|---|---|---|
| `02-calendar.css` | 189 | **1,451** |
| `01-base.css` | 109 | **902** |
| `03-planning.css` | 184 | **816** |
| `06-space-detail.css` | 105 | **682** |
| `04-today.css` | 17 | 142 |
| 그 외 4개 | 7 | 60 |
| **합계** | **611** | **4,053** |

**16,472줄 중 4,053줄 = 25%가 아무것도 그리지 않는다.**

### 7.3 그런데 "종수"는 거의 안 줄어든다 — 초판 §6의 오판

죽은 규칙 안에 든 선언: font-size 200개 · border-radius 131개 · 색 리터럴 64개 · box-shadow 23개. 선언 수로는 크다(전체 font-size 667개 중 30%, radius 455개 중 29%). **그런데 값의 종류는 거의 안 줄어든다:**

| 요소 | 살아 있는 쪽 종수 | 죽은 곳에만 있는 값 | 삭제 후 |
|---|---|---|---|
| font-size | 56종 | **15종** (전부 `2.6rem`·`4.5rem` 같은 rem 대형 타이틀) | 69 → 56 |
| font-weight | 13종 | **0종** | 13 → **13** |
| border-radius | 34종(리터럴+토큰 표기) | **0종** | 변화 없음 |
| 색 리터럴 | 233종 | **21종** | 256 → 235 |
| box-shadow | 38종 | 2종 | 변화 없음 |

즉 **§3의 우선순위는 죽은 코드를 지워도 그대로다.** weight 13종도, radius 15종도, 회색 두 벌도 전부 살아 있는 코드에 있다. 삭제의 값어치는 "작업량이 줄어든다"가 아니라 **"노이즈가 25% 줄어든다"**에 있다 — 앞으로의 모든 grep·일괄 치환·측정이 죽은 규칙을 안 건드리게 된다.

### 7.4 삭제 전 처리해야 할 것 두 가지

**(1) 죽은 셀렉터 조각 94개** — 살아 있는 규칙의 그룹 셀렉터 안에 섞여 있어서 §7.2의 4,053줄에 안 잡힌다. 규칙째 지우면 안 되고 조각만 빼야 한다. 대표적으로:

- `21-components.css:234~264` — §2.10.1에서 "공용 행 묶음"이라고 적은 그것: `.list-view-row, .side-list li, .spc-list-row` **셋 다 죽었다.** 살아 있는 건 `.ff-row`와 `.gcal-cat-row` 둘뿐이다. **V-6이 통합한 5벌 중 3벌은 실체가 없었다.**
- `21-components.css:79~133` — `.primary-action`(단독 규칙 3개) 죽음.
- `21-components.css:43~78` — `.ff-card` 그룹의 `.summary-card` · `.panel-section` · `.focus-summary` · `.focus-timer-card` · `.topic-card` · `.project-tasks` · `.sdv-card` 죽음.
- `20-density.css` — 22개 중 11개가 죽었다. `.task-row` · `.side-list li` · `.spc-list-row` · `.list-view-row` · `.page-header` · `.today-list-header` · `.spc-header` · `.spc-detail` · `.segmented-tabs` · `.quick-add` · `.page-subtitle`. **밀도 레이어가 겨냥한 대상의 절반이 존재하지 않는다.** §2.6에서 "행 높이 32/36/38/58 네 종류"라고 적었는데, 그중 **32(공용 묶음)와 58(`.task-row`)은 실제로 렌더되지 않는다 — 살아 있는 행 높이는 36과 38 두 종류다.**

**(2) e2e가 붙잡고 있는 죽은 클래스 16개** — `e2e/componentLanguage.spec.ts`가 `.ff-card` · `.sdv-card` · `.summary-card` · `.panel-section` · `.focus-summary` · `.focus-timer-card` · `.topic-card` · `.project-tasks` · `.primary-action`를 검사한다. 다만 그 테스트는 **화면에서 찾는 게 아니라 probe 엘리먼트를 주입해서 computed style을 잰다**(파일 상단 주석에 그렇게 적혀 있다 — "families that only render behind data are exactly the ones that drifted"). 그래서 이 클래스들이 CSS에 있다는 사실만으로 통과하고 있고, **실제로 그 이름을 쓰는 화면은 없다.** 지우려면 테스트의 목록도 같이 줄여야 하며, 이건 "테스트가 지키던 계약이 사라지는" 것이므로 판단이 필요하다.

### 7.5 이 측정도 확인하지 않은 것

- **런타임 대조를 안 했다.** 정적 분석이다. 다만 클래스를 문자열로 주입하는 경로(`innerHTML`)가 프로덕션 코드에 없고 동적 조합 접두사를 따로 분리했으므로, 오탐(살아 있는데 죽었다고 판정) 가능성은 낮다.
- **`dyn?` 90개는 판정 보류다.** `sdv-status-*` 7종처럼 실제로 살아 있는 것이 대부분이지만, `sdv-record-*` 5종처럼 접두사만 겹치고 실제로는 안 쓰이는 것이 섞여 있을 수 있다. 개별 확인 안 했다.
- **CSS 변수의 죽음은 안 셌다.** 정의됐지만 아무도 안 읽는 토큰이 있는지는 별도 문제다.

### 7.6 실제 삭제 (2026-08-20)

§7.4가 "삭제 전에 처리해야 한다"고 적은 두 가지를 처리하고 지웠다. **16,467줄 → 12,801줄 (−3,666, −22.3%).**

측정을 다시 했다. §7.1~7.2와 숫자가 다른 이유는 두 가지다 — (1) 이번 판정은 `e2e/`도 소스로 셌다(테스트가 참조하는 클래스를 죽었다고 부르지 않기 위해), (2) 줄 수를 규칙 본문 기준으로만 셌다(앞선 주석은 별도 처리).

| | 값 |
|---|---|
| 죽은 클래스 | 391 (전체 1,401 중 28%) |
| 통째로 지운 규칙 | 652 |
| 살아 있는 그룹에서 뺀 죽은 조각 | 94개 중 실제 편집 36개 규칙 |
| 함께 지운 규칙 전용 주석 | 29 |
| 빈 섹션만 가리키게 된 배너 주석 | 4 (Space tree · Projects · Archive · density rows) |

**오탐 경로를 먼저 닫았다.** 정적 분석이 "안 쓰인다"고 말할 수 있으려면 클래스가 문자열로 조립되는 길이 없어야 한다. 확인 결과 이 리포에는 `innerHTML`도, `clsx` 류 헬퍼도, `"prefix-" + x` 결합도 **없다.** 모든 클래스는 리터럴이거나 `` `sdv-status-${x}` `` 처럼 정적 접두사를 가진 템플릿이며, 후자는 접두사 80종을 뽑아 전부 보호했다. `.is-high`가 살아남은 것이 그 장치다.

**런타임으로 반증했다.** 죽었다고 판정한 셀렉터 610개를 실행 중인 앱에 넣고 15개 화면 · 52회 스윕 동안 `querySelector`를 돌렸다. **단 하나도 매치되지 않았다.**

**삭제 전후를 요소 단위로 비교했다.** 태스크 7개(우선순위 4종 · 완료 1개 · 마감일 3개)를 넣은 상태에서, 라이트 19화면 · 다크 17화면을 돌며 요소마다 computed style 50종 + `::before`/`::after`까지 문자열로 떠서 대조했다.

| 테마 | 화면 | 비교한 요소 | 차이 |
|---|---|---|---|
| light | 19 | 3,453 | **0** |
| dark | 17 | 2,864 | 5 |

다크의 5건은 전부 캘린더 현재시각 표시선이다(`y` 497.39 → 495.80). 두 스냅샷 사이에 실제 시간이 흘렀기 때문이며 CSS와 무관하다. **즉 CSS로 인한 차이는 0이다.**

`npx tsc -b` 0 · 1,538 unit · Playwright 124 passed(desktop/tablet/mobile 3뷰포트).

#### 남긴 것 — e2e가 붙잡고 있는 9개

§7.4(2)가 지목한 문제는 그대로 남아 있고, 이번에 성격이 더 분명해졌다. `componentLanguage.spec.ts`가 probe로 검사하는 이름 중 **프로덕션에 단 한 번도 안 나오는 것이 9개**다:

`.ff-card` · `.summary-card` · `.panel-section` · `.focus-summary` · `.focus-timer-card` · `.topic-card` · `.project-tasks` · `.sdv-card` · `.primary-action`

여기서 새로 드러난 사실: **정규 이름인 `.ff-card` 자신이 그 9개에 들어 있다.** V-6이 "하나의 component language"를 세웠지만 그 정규 클래스를 쓰는 화면은 없다. 실제로 렌더되는 카드는 `.tdy-card` · `.foc-card` · `.sdv-metric-card` · `.settings-card` 넷이다. 테스트는 "이 이름들이 서로 같은 표면으로 해석된다"를 증명하고 있고 그것은 참이지만, **그 이름을 쓰는 마크업이 없으므로 지키는 계약이 없다.**

**→ 별칭 8개는 지웠다(같은 날).** `.summary-card` · `.panel-section` · `.focus-summary` · `.focus-timer-card` · `.topic-card` · `.project-tasks` · `.sdv-card` · `.primary-action`을 스타일시트와 spec의 목록에서 함께 뺐다. 별칭은 **누군가 아직 옛 이름을 말하고 있을 때만** 제 줄값을 한다.

`.ff-card`는 사용처가 없는 채로 남겼다. 앞으로 새 카드가 집어야 할 이름이기 때문이고, 그것이 헛말이 되지 않게 잡아주는 것은 이 파일의 마지막 테스트다 — 정규 이름들만으로 화면을 조립해 각각이 실제로 무언가를 그리는지 본다.

지운 뒤 실행 중인 앱에서 확인했다. 남은 5개(`ff-card` · `tdy-card` · `foc-card` · `sdv-metric-card` · `settings-card`)는 전부 같은 표면으로 해석되고(`rgb(255,255,255) | 1px rgba(0,0,0,0.07) | 10px | 14px | shadow-card`), 지운 8개는 **존재하지 않는 클래스와 완전히 동일한 값**을 낸다 — 즉 아무것도 그리지 않는다.

CSS는 12,801 → **12,726줄**(−75). `tsc -b` 0 · 1,538 unit · Playwright 124 passed.

#### 부수적으로 드러난 것

v0.17.1에서 `--shadow-panel`로 옮긴 floating layer 8곳 중 **`.gcal-schedule-modal`과 `.confirm-modal` 2곳은 이미 죽은 규칙**이었다. 그 두 편집은 화면에 아무 효과가 없었고, 이번에 규칙째 사라졌다. 살아 있는 6곳(`.toast` · `.ff-modal` · `.tdy-bulk-bar` · `.foc-options-popover` · `.foc-modal` · `.foc-global-bar`)의 그림자 통일은 유효하다.
