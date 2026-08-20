# TickTick 역설계 #02 — Tasks Sidebar Container / Shell

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 범위: **사이드바 자체의 레이아웃 시스템**. 개별 행은 `TICKTICK_COMPONENT_01_SIDEBAR_ROW.md`에서 다뤘으므로 여기서는 다시 분석하지 않는다.
작성일: 2026-08-20

## 0. 측정 조건 — 중간에 바뀌었다

| 항목 | 값 |
|---|---|
| 브라우저 | Chrome (Windows 11), 사용자 로그인 세션 |
| 테마 | dark (`body.dark`) / 로케일 ko |
| **viewport A** | **1387 × 713 CSS px** (dpr 1.8) — §1·§2·§3·§6·§8 측정 |
| **viewport B** | **763 × 392 CSS px** (dpr 2) — §4·§7 측정 |
| 측정 방법 | `getBoundingClientRect()` · `getComputedStyle()` · 실제 휠 스크롤 · 실제 마우스 이동 |

**A→B 전환은 내가 의도한 것이 아니다.** 창 크기를 바꾸려고 `resize_window`를 호출하는 과정에서 페이지 줌/창 상태가 함께 변했고, 이후로는 창 크기 호출이 CSS 뷰포트에 반영되지 않았다(외곽 크기만 바뀌고 `innerWidth`는 763에 고정). 줌 단축키는 도구에서 차단돼 사용할 수 없었다.

다만 이것이 측정을 망치지는 않았다. **CSS px는 줌에 불변**이고, 실제로 A와 B에서 잰 셸 기하값이 완전히 동일했다(§7). 오히려 A→B는 CSS 뷰포트가 **1387 → 763으로 45% 줄어든** 진짜 반응형 테스트가 되었다. 어느 수치가 어느 뷰포트에서 나왔는지는 각 절에 표기한다.

**세션에 가한 변경**: 사이드바를 실제로 스크롤했고(측정 후 `scrollTop`을 0으로 복구), 마우스를 이동했다. **사이드바 접기 토글은 누르지 않았다** — UI 상태를 바꾸지 말라는 지시에 따라, 접기 동작은 CSS 흔적으로만 기록한다(§7.3). 데이터 변경 없음.

**판정 규칙**: 수치는 전부 실측. 해석은 `[Inference]`로 분리. 재지 못한 것은 §11에 적는다.

---

## 1. Sidebar DOM Hierarchy

### 1.1 셸 전체 골격 (viewport A 기준)

```
BODY.dark                                    bg rgb(28,28,28)   overflow hidden
└ DIV.container-fill
  └ DIV.flex.h-full.overflow-hidden          bg rgb(28,28,28)
    ├ DIV.g-left.flex-none                   [0 … 50]      ← Global Rail 래퍼
    │  └ DIV.sidebar_2byOi                   w 50, pb 11
    │     ├ DIV.t-user (아바타)               32×32, mt 16, mb 11
    │     ├ DIV.flex-auto (아이콘 스택)        y 59 … 552
    │     └ DIV.flex-none (하단 아이콘 묶음)   y 552 … 702
    └ DIV.flex.flex-auto.overflow-hidden     [50 … 1387]
       └ DIV.listViewContainer
          └ DIV.listViewWrapper
             └ DIV.flex.flex-auto.relative
                ├ DIV.g-left                 [50 … 290]  w 240  ← SIDEBAR 루트
                │  ├ DIV.absolute.h-full     w 240, left 0
                │  │  ├ DIV.hide-in-print.absolute.inset-0.pointer-events-none
                │  │  └ DIV.lists            ← 사이드바 본체. border-right 1px
                │  └ DIV.detail-dragger      [285 … 290]  w 5, cursor ew-resize, z 2
                └ DIV.tasklist               [290 … 1387] ← MAIN CONTENT
                   ├ DIV.absolute.inset-0    bg rgb(28,28,28)  ← 본문 배경 페인트 레이어
                   ├ HEADER.tl-bar           h 49
                   └ DIV.column-list         y 49 …
```

### 1.2 사이드바 내부 (`.lists` 아래)

```
DIV.lists                       [50…290] h 713   padding-bottom 28   border-right 1px
├ DIV (드래그 안내용 스크린리더 텍스트, 0×0)
├ DIV.flex-auto.flex.flex-col.overflow-hidden      [50…289] h 685
│  └ DIV.project-list-inner.antiscroll-wrap        h 685   padding-top 8
│     ├ DIV.antiscroll-inner  ★SCROLL OWNER★       y 8, h 677, padding-bottom 8
│     │  ├ SECTION.mt-[6px]        스마트 리스트 3행 (오늘/다음7일/기본함)
│     │  ├ DIV.h-[1px]             구분선            margin 16px 10px
│     │  ├ DIV (섹션 묶음 래퍼)
│     │  │  ├ SECTION.hoverSection.open   리스트   pt 0, pb 12
│     │  │  ├ SECTION.hoverSection.open   필터     pt 4, pb 12
│     │  │  └ SECTION.hoverSection.open   태그     pt 4, pb 0
│     │  ├ DIV.h-[1px]             구분선            margin 16px 10px
│     │  ├ DIV.l-divider           (높이 0 — 실제로 아무것도 그리지 않음)
│     │  └ SECTION                 완료 / 휴지통 2행
│     └ DIV.antiscroll-scrollbar-vertical  ★오버레이 스크롤바★  absolute, right 2
└ DIV.absolute.left-0.right-0.bottom-0   ★FOOTER★   y 685, h 28
   └ DIV.bg-grey-5                       bg rgba(255,255,255,0.05)
      └ A.upgrade-button                 padding 2px 30px 2px 20px
         ├ svg 24×24 (mr 8)  ├ SPAN 12px/40%  └ svg.chevron 16×16 (absolute right)
```

### 1.3 영역별 판정

| 요청 항목 | 실측 결과 |
|---|---|
| sidebar root | `DIV.g-left` (인라인 `width: 240px`). 그 안의 `.lists`가 실제 본체 |
| **header 영역** | **없다.** 사이드바 최상단은 곧바로 첫 섹션이다(y=14부터 행). 계정 아바타·검색·설정은 전부 **Rail**에 있다 |
| navigation 영역 | 별도 컨테이너 없음. 첫 `SECTION.mt-[6px]`(스마트 리스트 3행)이 그 역할 |
| section/list 영역 | `SECTION.hoverSection.open` 3개 + 앞뒤 `SECTION` 2개. 섹션끼리 감싸는 래퍼는 있으나 시각 속성 없음 |
| scroll container | `DIV.antiscroll-inner` — **여기만 스크롤한다** |
| **footer** | **있다.** 28px, `position: absolute; bottom: 0`. 업그레이드 배너 |
| Rail ↔ Sidebar | **간격 0.** Rail 0–50, 사이드바 50–290. 서로 다른 DOM 가지에 있고, 붙어 있다 |
| Sidebar ↔ Main | **간격 0.** 사이드바 우측 끝 290 = 본문 좌측 시작 290 |

**[Observed]** Rail은 `.listViewWrapper` **바깥**에 있다. 즉 Rail은 리스트 뷰의 일부가 아니라 앱 셸의 형제다. 사이드바만 `.listViewWrapper` 안에 있고, 리사이즈 핸들도 사이드바에만 붙어 있다.

**[Inference]** Rail은 "앱 전역", 사이드바는 "현재 뷰(리스트 뷰)에 속한 것"으로 분리돼 있다. 뷰가 바뀌면 사이드바 내용은 바뀌어도 Rail은 그대로라는 구조다. 다만 다른 뷰로 이동해 확인하지는 않았다(§11).

---

## 2. Geometry

### 2.1 가로 (viewport A: 1387 CSS px)

| 영역 | x | width | 비고 |
|---|---|---|---|
| Global Rail | 0 | **50** | `w-[50px]` |
| Sidebar | 50 | **240** | 인라인 `style="width: 240px"` |
| ├ `.lists` | 50 | 240 | `border-box`, 우측 1px 보더 포함 |
| ├ 스크롤 영역 | 50 | **239** | 보더 1px을 뺀 폭 |
| └ 리사이즈 핸들 | 285 | **5** | `cursor: ew-resize`, `z-index: 2` |
| Main content | 290 | **1097** (A) / **473** (B) | 남는 폭 전부 |

- **Rail ↔ Sidebar 거리: 0** (붙어 있음)
- **Sidebar ↔ Main 경계: 0** (붙어 있음, 사이 간격 없음)
- **가로 gutter**: 사이드바 안쪽 좌우 여백은 **행이 갖는다**(행 바깥 껍데기 `padding: 0 10px`). 사이드바 컨테이너 자체에는 좌우 패딩이 **없다**(0px).
- 구분선은 좌우 `margin: 10px`이므로 폭 **219** (239 − 20).

### 2.2 min/max width

**직접 측정 불가.** 폭은 인라인 스타일로 JS가 넣고, 리사이즈는 핸들 드래그로 이뤄진다. 드래그를 수행하지 않았으므로(§0) 하한/상한은 **미측정**이다. CSS에 `min-width`/`max-width` 선언은 없다(computed 모두 `none`/`0px`).

### 2.3 세로

| 항목 | 값 (A) | 값 (B) |
|---|---|---|
| viewport 높이 | 713 | 392 |
| 사이드바 높이 | **713 (= viewport 전체)** | **392** |
| top inset | **0** | 0 |
| bottom inset | **0** | 0 |
| `.lists` padding-bottom | **28** | 28 |
| footer 높이 | **28** | 28 |
| 스크롤 래퍼 높이 | 685 (= 713 − 28) | 364 |
| 스크롤 owner 높이 | **677** | 356 |
| 스크롤 콘텐츠 높이 | **680** | 680 |
| 스크롤 가능 범위 | **3** | **324** |

**[Observed]** `.lists`의 `padding-bottom: 28px`과 footer 높이 28px이 **정확히 같다.** footer는 `absolute`로 떠 있고, 패딩이 그만큼의 자리를 비워 스크롤 콘텐츠가 footer 밑으로 들어가지 않게 한다.

**[Observed]** 콘텐츠 높이 680은 두 뷰포트에서 동일했다. 즉 사이드바 콘텐츠는 뷰포트 높이와 무관하며, 스크롤 범위만 달라진다.

### 2.4 divider 두께

| 위치 | 두께 | 색 | 방식 |
|---|---|---|---|
| Rail → Sidebar | **1px** | `rgba(255,255,255,0.05)` | Rail의 `border-right` |
| Sidebar → Main | **1px** | `rgba(255,255,255,0.06)` | `.lists`의 `border-right` |
| 사이드바 내부 구분선 ×2 | **1px** | `rgba(255,255,255,0.1)` | 높이 1px짜리 `DIV` (보더 아님) |
| `.l-divider` | **0** | — | 요소는 있으나 높이 0. 아무것도 그리지 않음 |

**[Observed]** 세 하이라인의 알파가 전부 다르다: 0.05 / 0.06 / 0.10. 안쪽(구분선)이 바깥(경계)보다 **진하다.**

---

## 3. Background / Boundary

| 영역 | computed | 출처 |
|---|---|---|
| body / 전역 | `rgb(28,28,28)` | 토큰 `--color-screen-background = 28,28,28` |
| **Global Rail** | **`rgb(36,36,36)`** | 토큰 `--color-left-sidebar-bg-color = 36,36,36` |
| **Sidebar** | **`rgba(0,0,0,0)` (자기 배경 없음)** | 뒤의 body 색이 그대로 비침 → 결과적으로 `rgb(28,28,28)` |
| Main content | `rgb(28,28,28)` | `.tasklist` 안의 전용 페인트 레이어(`absolute inset-0`)가 칠함 |
| footer 띠 | `rgba(255,255,255,0.05)` | 유틸리티 `bg-grey-5` |

관련 토큰 (dark, `body`에서 실측):

```
color-screen-background      = 28,28,28
color-sidebar-bg-color       = 28,28,28
color-left-sidebar-bg-color  = 36,36,36
color-main-background        = 36,36,36
color-grey                   = 255,255,255
opacity-variant-grey-5       = 0.05
opacity-variant-grey-6       = 0.06
opacity-variant-grey-10      = 0.1
color-primary                = 71,114,250
```

**[Observed] 다크 모드에서 Rail(36)이 사이드바·본문(28)보다 밝다.** 그리고 **사이드바와 본문은 같은 색**이다. 즉 표면 위계가 2단(Rail / 나머지)이지 3단이 아니다.

**[Observed] 그림자는 어디에도 없다.** Rail·사이드바·`.lists`·스크롤 컨테이너 전부 `box-shadow: none`. 스크롤 가장자리에 `mask-image`도 없다(fade 없음).

**[Inference]** 사이드바와 본문을 **같은 색으로 두고 1px 하이라인 하나로만 나눈 것**은, 두 영역을 "다른 판때기"가 아니라 "같은 지면의 두 구역"으로 읽히게 한다. 대신 Rail만 8단계 밝혀서 앱 전역 내비게이션임을 색으로 구분한다. 깊이(그림자)를 전혀 쓰지 않으므로 위계는 **밝기 + 1px 선**으로만 만들어진다.

---

## 4. Scroll System (viewport B에서 실제 스크롤하며 측정)

| 항목 | 실측 |
|---|---|
| scroll owner | **`DIV.antiscroll-inner`** (사이드바 루트도, `.lists`도 아니다) |
| overflow-x / y | `auto` / `auto` |
| **네이티브 스크롤바 폭** | **0px** (`offsetWidth − clientWidth = 0`) |
| 네이티브 숨김 방식 | `scrollbar-width: none` |
| **content width에 영향** | **없음.** 스크롤바가 레이아웃 폭을 전혀 먹지 않는다 |
| 커스텀 스크롤바 | `DIV.antiscroll-scrollbar-vertical` (antiscroll 계열) |
| ├ position | `absolute`, `right: 2px`, `top: 0`, `margin-top: 2px`, `z-index: 1` |
| ├ 폭 / radius | **6px** / **7px** |
| ├ 색 | `rgba(255,255,255,0.3)` — 단일 요소 |
| ├ **track** | **없음.** 자식 요소 0개. 트랙 없이 thumb만 존재 |
| └ thumb 높이 | 비례 계산됨: 뷰포트 A(범위 3px)에서 **670**, B(범위 324px)에서 **184.3** |
| overlay 여부 | **완전 오버레이.** 콘텐츠 위에 떠 있고 폭을 차지하지 않음 |
| 문서 자체 스크롤 | **없음** (`body { overflow: hidden }`, `scrollHeight == clientHeight`) |
| 스크롤 edge의 shadow/fade | **없음** (mask/shadow 모두 none) |

### 4.1 스크롤바 표시 규칙 — 실측 타임라인

| 상황 | opacity |
|---|---|
| 초기 상태 (스크롤한 적 없음) | **0** |
| 사이드바에 마우스만 올림 | **0** ← hover로는 안 나타난다 |
| **스크롤바 위에 직접 마우스를 올림** | **0** ← 그래도 안 나타난다 |
| 실제 휠 스크롤 직후 | **1** |
| 스크롤 후 포인터가 사이드바 안에 있는 동안 (3.5초 관찰) | **계속 1** |
| 포인터가 사이드바 밖으로 나간 뒤 | 1 → **1.8~2.2초 사이에 0** |

전환은 `transition: opacity 0.3s`. **이것이 사이드바 셸에서 발견된 유일한 transition이다**(collapse용 margin 전환 제외).

**[Inference]** "hover로는 안 뜨고 스크롤해야 뜬다"는 규칙은, 사이드바를 **훑는 동안에는 스크롤바가 방해하지 않게** 하려는 선택으로 보인다. 6px 폭에 30% 알파는 그 자체로도 매우 약하다.

### 4.2 스크롤 중 동작

- **섹션 헤더는 sticky가 아니다.** `scrollTop = 300`일 때 "리스트" 헤더는 y = **−141**로 화면 밖으로 밀려났다(`position: static`).
- 사이드바 안에 `position: sticky` 요소는 **0개**.

---

## 5. Header와 Body의 관계

**사이드바에는 header가 없다.** 이것이 이 절의 결론이다.

| 항목 | 실측 |
|---|---|
| header 존재 | **없음** |
| sticky 여부 | 해당 없음 (sticky 요소 0개) |
| header height | — |
| header padding | — |
| **body 시작 y** | **8** (`.project-list-inner`의 `padding-top: 8px`) |
| 첫 콘텐츠 y | **14** (8 + 첫 섹션 `margin-top: 6px`) |
| header 아래 divider | 해당 없음. 첫 구분선은 스마트 리스트 3행 **뒤**(y=142)에 온다 |

비교를 위해: **본문 쪽에는 header가 있다.** `HEADER.tl-bar`, 높이 **49**, `padding: 15px 20px 0`, 프로젝트 이름 + 액션 바. 즉 **헤더는 본문의 것이지 셸의 것이 아니다.**

**[Observed]** 사이드바 상단에서 첫 행까지 14px, 하단에서 footer까지 0px(footer가 바닥에 붙음).

**[Inference]** 사이드바에 헤더가 없는 대신 Rail 상단에 계정 아바타(32×32, `margin-top: 16`)가 있다. 검색·설정도 Rail에 있다. 즉 **"사이드바 = 목적지 목록"만 담고, 도구는 전부 Rail로 밀어낸** 구조다. 사이드바가 스크롤될 때 고정돼야 할 것이 애초에 없으므로 sticky도 필요 없다.

---

## 6. Vertical Rhythm — 합성값과 지정값의 분해

**y 좌표는 실측, 옆의 설명은 그 좌표를 만든 선언들의 분해다.**

| y | 요소 | 이 위치를 만든 것 |
|---|---|---|
| 0 | 사이드바 상단 | — |
| **8** | 스크롤 owner 시작 | `.project-list-inner` **padding-top 8** (지정) |
| **14** | 첫 행 (오늘) | 8 + 섹션 **margin-top 6** (지정) = 14 (합성) |
| 52 | 다음 7일 | +38 = 행 36 (지정) + 래퍼 **margin-bottom 2** (지정) |
| 90 | 기본함 | +38 |
| 126 | 스마트 섹션 끝 | 14 + (36×3 + 2×2) = 126 (합성) |
| **142** | 구분선 | 126 + **margin-top 16** (지정). ※ 마지막 행의 mb 2는 여기서 **상쇄됨**(§6.1) |
| 143 | 구분선 아래 | + **height 1** (지정) |
| **159** | "리스트" 섹션 상단 | 143 + **margin-bottom 16** (지정) |
| 159 | "리스트" 섹션 헤더 행 | 섹션 **padding-top 0** |
| **189** | 첫 리스트 행 | 159 + **헤더 행 높이 30** (지정) |
| 189·227·265·303 | 리스트 4행 | 38 간격 (36 + 2) |
| 339 | 마지막 행 하단 | 189 + (36×4 + 2×3) = 339 |
| **353** | "필터" 섹션 상단 | 339 + 마지막 행 **mb 2** + 섹션 **padding-bottom 12** = 353 (합성) |
| 357 | "필터" 헤더 행 | 353 + 섹션 **padding-top 4** (지정) |
| **387** | 필터 안내 박스 | 357 + 헤더 30 |
| 451 | 박스 하단 | + **height 64** (박스: `ml/mr 10`, `radius 6`, `px 14`, `py 8`) |
| **463** | "태그" 섹션 상단 | 451 + 섹션 **padding-bottom 12** |
| 467 | "태그" 헤더 행 | + **padding-top 4** |
| 497·535 | 태그 2행 | 38 간격 |
| 571 | 섹션 하단 | 섹션 **padding-bottom 0** (이 섹션만 0) |
| **587** | 구분선 | 571 + **margin-top 16** |
| **604** | 마지막 섹션 | 588 + **margin-bottom 16** |
| 604·642 | 완료 / 휴지통 | 38 간격 |
| 678 | 콘텐츠 끝 | |
| **680** | scrollHeight | 678 + 마지막 mb 2 + owner **padding-bottom 8**… 실측 680 |

### 6.1 "같은 16px처럼 보이지만 다른" 두 지점 — 마진 상쇄

사용자가 요청한 구분 그대로 적는다.

- **첫 섹션 → 구분선**: 마지막 행 하단 126 → 구분선 142 = **정확히 16**. 이 섹션은 `padding-bottom`이 0이라 마지막 행의 `margin-bottom: 2px`가 **부모 밖으로 상쇄**되어 사라지고, 구분선의 `margin-top: 16`만 남는다.
- **리스트 섹션 → 다음 섹션**: 마지막 행 하단 339 → 다음 헤더 357 = **18**. 이 섹션은 `padding-bottom: 12`가 있어 마진이 상쇄되지 못한다. 따라서 **2(행 mb) + 12(섹션 pb) + 4(다음 섹션 pt) = 18**.

즉 **화면에서 비슷해 보이는 두 간격(16 vs 18)이 서로 다른 메커니즘의 결과**다. 어느 쪽도 "16px 간격"이라는 단일 규칙으로 적혀 있지 않다.

### 6.2 실제로 지정된 값들만 추리면

```
지정된 것 : 8(위 패딩) · 6(첫 섹션 mt) · 36(행) · 2(행 간격) · 30(섹션 헤더 행)
             16(구분선 상하 마진) · 10(구분선 좌우 마진) · 1(구분선 두께)
             0/4(섹션 pt) · 0/12(섹션 pb) · 8(아래 패딩) · 28(footer 자리)
합성된 것 : 14(첫 행 y) · 38(행 리듬) · 16 또는 18(섹션 간 거리) · 680(콘텐츠 높이)
```

**[Observed] 섹션 padding이 균일하지 않다.** 첫 `hoverSection`은 `pt 0 / pb 12`, 두 번째는 `pt 4 / pb 12`, 세 번째는 `pt 4 / pb 0`. 세 섹션이 서로 다른 패딩을 갖는다.

**[Inference]** 이 불균일은 규칙이라기보다 위치별 보정으로 보인다. 첫 섹션은 위에 이미 구분선의 16px가 있어 pt가 필요 없고, 마지막 섹션은 아래에 또 구분선이 오므로 pb가 필요 없다. **즉 "섹션은 상하 12/4를 갖는다"는 규칙은 존재하지 않고, 이웃과의 관계로 그때그때 정해진다.** Component 01·02만으로 이것을 일반 규칙으로 승격시키지 않는다.

---

## 7. Responsive / Resizing

### 7.1 두 뷰포트 비교 — 실측

| 항목 | viewport A (1387×713) | viewport B (763×392) | 변화 |
|---|---|---|---|
| CSS 뷰포트 폭 | 1387 | 763 | **−624 (−45%)** |
| Global Rail | x 0, w **50** | x 0, w **50** | **없음** |
| Sidebar | x 50, w **240** | x 50, w **240** | **없음** |
| 사이드바 인라인 스타일 | `width: 240px` | `width: 240px` | **없음** |
| 행 바깥(li) | x 50, w **239** | x 50, w **239** | **없음** |
| 행 버튼 | x 60, w **219** | x 60, w **219** | **없음** |
| **Main content** | x 290, w **1097** | x 290, w **473** | **−624 (전부 흡수)** |
| collapse 발생 | 없음 (`margin-left: 0`, `visibility: visible`) | **없음** | — |
| 스크롤 범위 | 3 | 324 | 높이만 반영 |

**[Observed] 사이드바 폭은 뷰포트 폭에 전혀 반응하지 않는다.** 뷰포트가 45% 줄어드는 동안 Rail·사이드바·행 폭이 1px도 변하지 않았고, 줄어든 624px는 **본문이 전부 흡수**했다.

**[Observed] 763px 뷰포트에서도 collapse는 일어나지 않았다.** 사이드바는 그대로 240px을 유지했다.

### 7.2 폭의 성격

- 고정 상수가 **아니다**: 폭은 `.g-left`와 그 자식에 **인라인 `style="width: 240px"`**로 들어간다. CSS 규칙이 아니라 JS가 쓴 값이다.
- 반응형도 **아니다**: 뷰포트에 반응하지 않는다.
- → **사용자가 정하는 값**이다. 우측에 5px `ew-resize` 핸들이 있고, 값은 인라인 스타일로 주입된다. **240은 현재 값(기본값으로 추정)이지 디자인 상수가 아니다.**

### 7.3 collapse 메커니즘 — 누르지 않고 확인한 것

`.lists`에 다음이 걸려 있다(실측):

```
transition-property        : margin
transition-duration        : 0.2s
transition-timing-function : cubic-bezier(0.4, 0, 0.2, 1)
현재 margin-left           : 0px
```

**[Observed]** 접기 애니메이션은 **margin**으로 구현돼 있고 200ms다. 본문 헤더 좌측에 토글 버튼(`.left-menu-t`, 20×20)이 있다.
**[Inference]** `margin-left`를 −240px로 보내 사이드바를 밀어내는 방식일 가능성이 높다. **다만 토글을 누르지 않았으므로 확인하지 않았다.**

### 7.4 이 절의 한계

원하는 뷰포트 값을 직접 지정하지 못했다(§0). A와 B 두 지점만 얻었고, 그 사이 구간에서 breakpoint가 있는지, 763px보다 더 좁을 때 collapse가 발생하는지는 **미측정**이다.

---

## 8. CSS Token / Cascade — 값의 출처 4분류

사용자 요청대로 "custom property가 없으면 arbitrary"로 뭉뚱그리지 않고 네 가지로 나눈다.

### (a) CSS custom property 토큰에서 온 값

| 값 | 토큰 | 유틸리티 |
|---|---|---|
| `rgb(28,28,28)` 전역/본문/사이드바 | `--color-screen-background` | `dark:bg-screen-background` |
| `rgb(36,36,36)` Rail | `--color-left-sidebar-bg-color` | — |
| `rgba(255,255,255,0.05)` footer 띠 | `--color-grey` × `--opacity-variant-grey-5` | `bg-grey-5` |
| `rgba(255,255,255,0.06)` 사이드바→본문 경계 | `--color-grey` × `--opacity-variant-grey-6` | `border-grey-6` |
| `rgba(255,255,255,0.1)` 내부 구분선 | `--color-grey` × `--opacity-variant-grey-10` | `dark:bg-grey-10` |

**색은 전부 토큰이다.** 그리고 전부 "전경색 × 알파" 형태다(Component 01과 동일한 규칙).

### (b) 유틸리티 상수 (Tailwind 임의값 — 토큰 아님)

`w-[50px]`(Rail) · `pb-[11px]`(Rail) · `pt-[8px]`(스크롤 래퍼) · `pb-[8px]`(스크롤 owner) · `mt-[6px]`(첫 섹션) · `h-[1px]`(구분선) · `h-[30px]`(섹션 헤더 행) · `w-[5px]`(리사이즈 핸들) · `duration-200`(collapse)

**치수는 토큰이 아니다.** 값이 클래스 이름 안에 직접 박혀 있다.

### (c) JS가 런타임에 주입한 값

`width: 240px` (사이드바 폭, 인라인) · `padding-bottom: 28px` (`.lists`, 인라인) · `transition: none` (드래그 중 트윈 차단용으로 보이는 인라인) · `visibility: visible`

**[Inference]** 240과 28이 인라인인 것은 둘 다 런타임에 바뀔 수 있는 값이기 때문으로 보인다 — 폭은 드래그로, 28은 footer 유무(프리미엄 여부)에 따라.

### (d) 레이아웃/브라우저가 만든 값

`239`(240 − 보더 1px) · `219`(239 − 행 좌우 10×2, 반올림) · `677`·`685`(flex 잔여 높이) · `680`(콘텐츠 높이) · thumb 높이 `670`/`184.3`(스크롤 비율) · `0px` 네이티브 스크롤바 폭

### 8.1 cascade에서 확인한 것

- 사이드바 셸의 외형도 **의미 있는 클래스(`.lists`, `.g-left`, `.project-list-inner`)가 아니라 유틸리티 클래스**가 만든다. `.lists`가 갖는 유일한 시각 속성은 `border-right`이고 나머지는 유틸리티다.
- 외부 스타일시트 3개는 CORS로 규칙을 읽을 수 없다(Component 01과 동일, fetch 403). 위 분류는 computed value + probe 실험으로 역추적한 것이다.

---

## 9. Observed vs Inference 요약

### [Observed] — 잰 것

1. 사이드바는 **header가 없고 footer가 있다**(28px, absolute bottom).
2. 스크롤 주체는 `.antiscroll-inner` 하나. 네이티브 스크롤바는 폭 0으로 숨겨져 있고 **콘텐츠 폭에 영향이 없다**.
3. 커스텀 스크롤바는 6px/radius 7/30% 흰색, **트랙이 없고 thumb만** 있으며, **hover로는 안 뜨고 스크롤해야 뜬다**. 포인터가 나가면 약 2초 뒤 사라진다(0.3s 페이드).
4. 섹션 헤더는 **sticky가 아니다**.
5. Rail(36,36,36)이 사이드바·본문(28,28,28)보다 **밝다**. 사이드바와 본문은 **같은 색**이다.
6. 그림자·fade·mask가 **전혀 없다**. 경계는 1px 하이라인 3종(0.05 / 0.06 / 0.10)뿐.
7. 사이드바 폭 240은 **인라인 스타일**이며 뷰포트 45% 축소에도 **불변**. 줄어든 폭은 본문이 전부 흡수했다.
8. 섹션 padding이 **균일하지 않다**(pt 0/4/4, pb 12/12/0).
9. 화면상 비슷한 섹션 간격이 실제로는 **16과 18** 두 값이며, 마진 상쇄 여부 때문에 갈린다.
10. 색은 전부 토큰이고, **치수는 하나도 토큰이 아니다**.

### [Inference] — 해석 (Component 01+02 범위에서만)

1. Rail만 밝기를 올리고 사이드바·본문을 같은 색으로 둔 것은, **"전역 내비 / 현재 작업 공간"의 2단 구분**으로 읽힌다. 3단 표면 위계를 쓰지 않는다.
2. 그림자를 전혀 쓰지 않고 1px 선과 밝기만으로 구역을 나눈다. Component 01에서 행에도 보더가 없었던 것과 같은 방향이다.
3. 사이드바에 헤더가 없는 것은 도구(계정·검색·설정)를 전부 Rail로 옮겼기 때문이다. 그래서 sticky가 필요 없다.
4. 스크롤바를 "스크롤할 때만" 보여주는 것은 **훑는 동작을 방해하지 않으려는** 선택으로 보인다.
5. `padding-bottom: 28`과 footer 높이 28이 같은 것은, footer를 띄워두고 스크롤 콘텐츠가 그 밑으로 숨지 않게 하는 표준적인 처리다.

### 아직 일반화하지 않는 것

- **spacing grid를 단정하지 않는다.** Component 01에서 2px 기반(4배수 선호, 다만 6·10 존재)이라고 봤고, 02에서도 2·4·6·8·10·11·12·16·28·30·36·50이 나왔다 — 여전히 짝수뿐이고 여전히 4배수를 벗어나는 값(6·10·11·30·50)이 있다. **두 컴포넌트로는 "2px 격자, 4배수 선호"까지가 지지되는 최대치**이고, 이것도 컴포넌트가 더 쌓이기 전에는 design system으로 부르지 않는다.
- **섹션 패딩 규칙**은 존재하지 않는 것으로 보이나, 다른 화면의 사이드바(캘린더 뷰 등)를 보지 않았으므로 단정하지 않는다.

---

## 10. Fidelity Spec — 관찰된 TickTick 동작만

개선 아이디어는 여기 넣지 않는다(→ Appendix A).

```
SIDEBAR SHELL
  width               : 240px — 고정 상수가 아니라 사용자 조절값(런타임 인라인 주입)
                        뷰포트 폭에 반응하지 않음. 뷰포트 축소분은 전부 본문이 흡수
  min / max width     : 선언 없음 (드래그 한계는 미측정)
  background          : 없음(투명). 뒤의 전역 배경이 그대로 보임
                        → 결과적으로 본문과 동일한 색
  boundary            : 우측 border-right 1px, 전경색 6% 알파
                        좌측(Rail 쪽) 경계는 Rail이 그림 — border-right 1px, 전경색 5% 알파
  shadow              : 없음
  top                 : 0 (뷰포트 상단에 붙음)
  bottom              : 0 (뷰포트 하단에 붙음, 높이 = 뷰포트 전체)
  horizontal gutter   : 컨테이너 좌우 패딩 0.
                        좌우 여백은 각 행이 자기 바깥 껍데기(10px)로 만든다
  resize handle       : 우측 끝 5px, cursor ew-resize
  collapse            : margin 전환 200ms cubic-bezier(0.4,0,0.2,1) (동작은 미확인)
  scroll behavior     : 셸 자체는 스크롤하지 않음. 내부 전용 스크롤 영역이 담당

HEADER
  없음. 사이드바 최상단은 곧바로 콘텐츠다.
  (계정·검색·설정 등 도구는 폭 50px의 Global Rail이 담당)

BODY (스크롤 영역)
  overflow            : auto / auto
  native scrollbar    : scrollbar-width none → 폭 0, 콘텐츠 폭에 영향 없음
  custom scrollbar    : overlay, absolute right 2px, width 6px, radius 7px
                        색 전경색 30% 알파, 트랙 없음, thumb 높이는 스크롤 비율에 비례
                        표시 규칙: hover로는 안 뜸 / 실제 스크롤 시 뜸
                        포인터가 영역을 벗어나면 약 2초 뒤 사라짐 (opacity 0.3s)
  padding             : 위 8px (스크롤 래퍼) / 아래 8px (스크롤 owner)
  bottom reserve      : 28px — footer 높이와 동일. 컨테이너 padding-bottom으로 확보
  edge treatment      : 스크롤 가장자리에 fade/shadow 없음
  sticky              : 없음. 섹션 헤더도 함께 스크롤되어 사라짐

SECTION RHYTHM
  첫 콘텐츠 y         : 8(래퍼 패딩) + 6(첫 섹션 마진) = 14
  행 리듬             : 38 = 행 36 + 행 간격 2
  섹션 헤더 행 높이   : 30  (내비 행 36과 다른 값)
  섹션 패딩           : 균일하지 않음 — 관찰값 pt 0/4/4, pb 12/12/0
  섹션 간 실제 거리   : 16 또는 18 (마진 상쇄 여부로 갈림)
  구분선              : 높이 1px, 좌우 마진 10, 상하 마진 16, 전경색 10% 알파
                        보더가 아니라 1px 높이의 요소

FOOTER
  height              : 28px
  position            : absolute, bottom 0, 좌우 0
  background          : 전경색 5% 알파
  padding             : 2px 30px 2px 20px
  구성                : 아이콘 24×24 (mr 8) + 12px 텍스트(전경색 40%) + 우측 chevron 16×16

RAIL ↔ SIDEBAR ↔ MAIN
  Rail width          : 50px, 배경은 사이드바보다 밝음(다크 기준 36 vs 28)
  Rail ↔ Sidebar 간격 : 0
  Sidebar ↔ Main 간격 : 0
  DOM 관계            : Rail은 리스트 뷰 바깥(앱 셸의 형제),
                        사이드바는 리스트 뷰 안. 리사이즈 핸들은 사이드바에만 있음

RESPONSIVE
  뷰포트 1387 → 763 (−45%)에서 Rail·사이드바·행 폭 전부 불변
  collapse 자동 발생하지 않음
  본문만 1097 → 473으로 변함
```

---

## Appendix A — 우리 앱에 적용할 때 다르게 할 것 (관찰이 아닌 제안)

**아래는 TickTick 동작이 아니다. 우리 앱을 위한 판단이다.**

1. **스크롤바 표시 규칙은 완화 검토.** "스크롤해야만 보인다"는 스크롤 가능 여부를 알려주지 않는다. 우리 앱은 이미 스크롤바를 **전역으로 완전히 숨기고** 있어(`01-base.css:275~285`) 같은 문제가 더 심하다. hover 시 표시를 권한다.
2. **섹션 패딩을 규칙화.** TickTick은 pt 0/4/4, pb 12/12/0으로 위치별 보정을 쓰는데, 이는 섹션이 늘어날 때마다 재조정이 필요하다. 우리는 "섹션 = pt 4 / pb 12" 하나로 두고 첫/마지막만 예외 처리하는 편이 유지하기 쉽다.
3. **마진 상쇄에 의존하지 말 것.** §6.1의 16 vs 18 차이는 마진 상쇄가 만든 우연이다. `gap`이나 명시적 패딩으로 바꾸면 값이 예측 가능해진다.
4. **사이드바 폭을 토큰으로.** TickTick은 인라인 주입이라 CSS에서 참조할 수 없다. 우리는 이미 `--context-sidebar-w: 248px`가 있으므로(`19-app-shell.css:40`) 이를 유지하되 **240으로 맞추는 것**만 검토한다(Component 01 §12.2에서 이미 제안).
5. **Rail 폭 50 vs 우리 56.** Component 01에서 제안한 대로 50으로. 다만 우리 Rail 아이콘은 24px이고 TickTick은 28px이므로 폭만 줄이면 더 빽빽해진다 — **아이콘 확대와 함께** 조정해야 한다.
6. **footer 자리 확보 방식은 그대로 채택할 만하다.** `padding-bottom = footer 높이`는 간단하고 튼튼하다.
7. **접근성**: 사이드바에 `<nav>` 시맨틱과 섹션 헤더의 `aria-labelledby` 연결을 추가한다. TickTick은 `SECTION`을 쓰지만 레이블 연결이 없다.

---

## 11. 이 분석이 확인하지 않은 것

- **사이드바 폭의 min/max** — 리사이즈 핸들을 드래그하지 않았다(UI 상태 변경 회피).
- **collapse 실제 동작** — 토글을 누르지 않았다. margin 전환 200ms라는 CSS 흔적만 확인.
- **원하는 뷰포트에서의 측정** — 창 크기를 제어하지 못했다(§0). A(1387)와 B(763) 두 지점만 확보했고, 그 사이 breakpoint와 763px 미만 동작은 미측정.
- **라이트 테마** — 다크에서만 측정.
- **다른 뷰의 사이드바** — 캘린더/검색 등 다른 Rail 목적지에서 사이드바가 어떻게 달라지는지 보지 않았다.
- **원본 CSS 규칙** — CORS로 막혀 있어 probe 실험으로 대체했다.
- **Rail 내부 구조** — 이번 범위는 사이드바 셸이므로 Rail은 경계·배경·폭만 쟀고 내부는 다루지 않았다.
