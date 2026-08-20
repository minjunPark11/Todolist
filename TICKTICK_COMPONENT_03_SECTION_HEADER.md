# TickTick 역설계 #03 — Sidebar Section Header

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 컴포넌트: **사이드바 섹션 헤더 1개** — `리스트` (Lists)
작성일: 2026-08-20

Component 01(Sidebar Row)·02(Sidebar Shell)에서 다룬 내용은 다시 분석하지 않고, 비교가 필요한 지점에서만 그 실측치를 인용한다.

## 0. 측정 조건

| 항목 | 값 |
|---|---|
| viewport | **763 × 392 CSS px** (dpr 2) |
| 테마 / 로케일 | dark (`body.dark`) / ko |
| 측정 방법 | `getBoundingClientRect()` · `getComputedStyle()` · 실제 마우스 hover · 실제 Tab 키 · 실제 클릭 |
| 스크롤 위치 | `scrollTop = 0` (측정 전 고정) |

**세션에 가한 변경**: §7-G/H(collapsed 상태)를 확인하기 위해 헤더를 **한 번 클릭해 접었다가 다시 펼쳤다.** 복구를 확인했다 — 섹션 클래스 `hoverSection open`, 높이 194, 리스트 4행, 첫 행 y=189로 접기 전과 동일하다. 그 외 데이터 변경 없음. **`+` 버튼은 누르지 않았다**(리스트 생성 다이얼로그가 열리므로).

**판정 규칙**: 수치는 전부 실측. 해석은 `[Inference]`로 분리. 못 잰 것은 §17에 적는다.

---

## 1. 분석 대상 고정

| 항목 | 값 |
|---|---|
| 이름 | **리스트** (Lists) — 사용자 리스트 4개를 담는 섹션의 헤더 |
| 위치 | 사이드바 상단에서 세 번째 블록. 구분선 바로 아래 |
| 좌표 | x **50**, y **159**, 239 × 30 |
| 제목 텍스트 | 있음 ("리스트") |
| 우측 액션 | 있음 (**`+` 버튼**) |
| 좌측 컨트롤 | 있음 (**collapse chevron**) |

선택 이유: 제목·`+`·collapse가 모두 있고, 현재 뷰포트(392px)에서 화면에 보여 실제 hover/click 측정이 가능하다.

**다른 헤더와의 동일성**: 사이드바에 같은 구조의 헤더가 3개(`리스트`·`필터`·`태그`) 있고, **셋의 클래스·기하·타이포가 완전히 동일하다**(§12). 주 분석 대상은 `리스트` 하나로 고정한다.

---

## 2. DOM 구조

### 2.1 실제 트리

```
LI.drop-hover-target.h-[30px].px-[10px]                       239×30 @50,159
└ A.drop-hover-effect.rounded-default.flex.items-center       219×30 @60,159
  │   .group.overflow-hidden.pl-[14px].pr-[10px].hover:bg-grey-3
  │   ※ href 없음, tabindex 없음
  ├ DIV  (chevron wrapper)                                     14×30 @60,159   opacity 0
  │   .h-full.absolute.top-1/2.-translate-y-1/2.flex.items-center.justify-center
  │   .group/collapsed.opacity-0.group-hover:opacity-100.group-focus-visible:opacity-100
  │   └ svg.icon-thin-triangle-down.w-[12px].h-[12px]         12×12 @61,168
  │      └ use #thin-triangle-down                         7.58×4.14 @63.2,172.4
  ├ P  (title)                                               179×16 @74,166
  │   .text-xs.font-bold.flex-auto.truncate.text-sidebar-color-30      "리스트"
  ├ BUTTON[type=button]  (add)                                16×16 @253,166  opacity 0
  │   .add-icon.w-[16px].h-[16px].flex-none
  │   .opacity-0.group-hover:opacity-100.group-focus-visible:opacity-100
  │   .focus-visible:opacity-100.focus:opacity-100
  │   └ svg.icon-add.w-[16px].h-[16px].text-sidebar-color.opacity-40.hover:opacity-100
  │      └ use #add                                            12×12 @255,168
  └ DIV.hide  (rename overlay)                              display: none
     └ P.text-[13px].font-medium.pl-[14px].pr-[12px]
```

### 2.2 단순화

```
SectionHeader (LI — 여백 전용)
 └ Trigger (A — 클릭 대상 전체)
     ├ CollapseChevron   (좌측 14px 슬롯, absolute, hover 시 등장)
     ├ Title             (flex-auto, truncate)
     └ AddButton         (16×16, hover/focus 시 등장)
```

### 2.3 각 요소의 역할

| 요소 | 역할 | 근거 |
|---|---|---|
| `LI` | **여백 담당자.** 배경·radius 없음. 좌우 10px 패딩만 | `padding: 0 10px`, bg 투명, radius 0 |
| `A` | **헤더의 전부.** 배경·radius·hover를 여기서 그리고, **클릭하면 섹션이 접힌다** | 클릭 실측 §7-G. `group`으로 자식 상태를 제어 |
| chevron wrapper | 접힘 상태 표시. **14px 폭 × 행 전체 높이(30)**를 차지하는 absolute 슬롯. `A`의 `padding-left: 14px` 자리에 정확히 겹쳐 놓여 있어 제목을 밀지 않는다 | `absolute`, w 14, h 30, x 60 = A의 좌측 끝 |
| chevron svg | 12×12, 아래를 향한 삼각형. 접히면 −90° 회전 | §7-G |
| `P` title | 섹션 이름. 남는 폭을 전부 먹고 넘치면 말줄임 | `flex-grow: 1`, `overflow:hidden`, `ellipsis`, `nowrap` |
| `BUTTON` add | 이 섹션에 항목 추가. **실제 `<button>`이고 이 헤더에서 유일하게 포커스 가능한 요소** | §13 |
| `DIV.hide` | 인라인 이름 편집 오버레이. `display: none` | Component 01의 행에도 같은 구조가 있었다 |

### 2.4 속성 실측

| 항목 | LI | A | chevron wrap | add button | title |
|---|---|---|---|---|---|
| 보유 속성 | `class` | **`class` 뿐** | `class`, `style` | `type`, `class` | `class` |
| role | 없음 | **없음** | 없음 | 없음(네이티브 button) | 없음 |
| aria-* | **없음** | **없음** | **없음** | **없음** | **없음** |
| tabindex | — | **없음** | 없음 | 없음(네이티브) | — |
| href | — | **없음** | — | — | — |
| 포커스 가능 | — | **불가** (`a.focus()` 후 activeElement가 `BODY`) | 불가 | **가능** | — |

**[Observed]** `A`는 `href`도 `tabindex`도 없다. 즉 **앵커 모양을 한 클릭 핸들러**이고 키보드로는 도달할 수 없다.

---

## 3. 전체 Geometry

### 3.1 각 요소

| 요소 | x | y | w | h | right | bottom |
|---|---|---|---|---|---|---|
| LI (root) | **50** | **159** | **239** | **30** | 289 | 189 |
| A (trigger) | **60** | 159 | **219** | **30** | 279 | 189 |
| chevron wrap | 60 | 159 | **14** | **30** | 74 | 189 |
| chevron svg | 61 | 168 | **12** | **12** | 73 | 180 |
| chevron 글리프 | 63.21 | 172.42 | **7.58** | **4.14** | 70.79 | 176.56 |
| **title** | **74** | **166** | **179** | **16** | 253 | 182 |
| **add button** | **253** | **166** | **16** | **16** | **269** | 182 |
| add 글리프 | 255 | 168 | **12** | **12** | 267 | 180 |

### 3.2 Title 세로 정렬

| 항목 | 값 |
|---|---|
| 라인박스 | y 166 → 182, 높이 **16** |
| 헤더 박스 | y 159 → 189, 높이 30 |
| 위/아래 여백 | **각 7px** (완전 중앙) |
| 폰트 메트릭 (실측) | ascent **13**, descent **3** → 합 **16** |
| **baseline** | **y = 179** (166 + 13). 헤더 중심 174보다 5px 아래 |

**[Observed]** 라인박스 16px는 지정값이 아니다. `line-height: normal`이고, 폰트의 ascent(13)+descent(3)가 정확히 16이다. 즉 **브라우저/폰트가 만든 값**이다(§9-D).

### 3.3 간격 — 보이는 값과 지정된 값

| 구간 | 실측 | 무엇이 만들었나 |
|---|---|---|
| 사이드바 좌측 → 헤더 root | **10** | LI `padding-left: 10px` (지정) |
| 헤더 root → A | **10** | 위와 동일 |
| A 좌측 → title | **14** | A `padding-left: 14px` (지정) |
| A 좌측 → chevron 슬롯 | **0** | chevron이 `absolute`로 A 좌측 끝에 붙음 |
| chevron 슬롯 우측 → title | **0** | 슬롯 폭 14 = A의 padding-left 14. **정확히 겹친다** |
| title → add | **0** | title이 `flex-auto`로 add까지 늘어남 |
| add 우측 → A 우측 | **10** | A `padding-right: 10px` (지정) |
| add 우측 → 사이드바 우측 | **20** | 10(A pr) + 10(LI pr) |
| **이전 콘텐츠 → 헤더** | 케이스별 §10 | |
| **헤더 → 첫 행** | **0** | 헤더 bottom 189 = 첫 행 top 189 |

**[Observed]** chevron 슬롯 폭(14)과 A의 padding-left(14)가 **같은 값**이다. chevron이 나타나도 제목이 밀리지 않는 이유가 이것이다 — 나타날 자리가 이미 패딩으로 비워져 있다.

---

## 4. Box Model

| 속성 | LI (root) | A (trigger) | title (P) | add (BUTTON) | chevron wrap |
|---|---|---|---|---|---|
| display | list-item | **flex** | block | block | flex |
| position | static | relative | static | static | **absolute** |
| align-items | — | **center** | — | — | center |
| justify-content | — | normal | — | — | center |
| **gap** | — | **normal (미사용)** | — | — | normal |
| flex-grow / shrink | — | 0 / 1 | **1** / 1 | 0 / **0** | 0 / 1 |
| width / height | 239 / 30 | 219 / 30 | 179 / 16 | **16 / 16** | 14 / 30 |
| min-width | 0 | 0 | auto | auto | 0 |
| **margin** | **0** | **0** | **0** | **0** | **0** |
| **padding** | **0 10px** | **0 10px 0 14px** | **0** | **0** | **0** |
| border | 0 | 0 | 0 | 0 | 0 |
| **border-radius** | 0 | **6px** | 0 | **0** | 0 |
| box-sizing | border-box | border-box | border-box | border-box | border-box |
| overflow | visible | **hidden** | hidden | visible | visible |
| transform | none | none | none | none | `translateY(-15px)` |

**[Observed]** 이 컴포넌트 안에는 **margin이 하나도 없다.** 가로 배치는 전부 padding + flex이고, `gap`도 쓰지 않는다.

### 4.1 세로 간격의 출처 분해

헤더 자신은 세로 여백을 **전혀 갖지 않는다**(margin 0, padding 세로 0). 헤더 위아래의 공간은 전부 남이 만든다.

| 공간 | 만든 주체 |
|---|---|
| 헤더 **위** 공간 | 이전 형제(구분선)의 `margin-bottom`, 또는 **부모 SECTION의 `padding-top`** |
| 헤더 **아래** 공간 | **없음** (첫 행이 바로 붙는다) |
| 섹션 **아래** 공간 | 부모 SECTION의 `padding-bottom` |

즉 헤더의 세로 리듬은 **100% 부모 SECTION의 패딩**과 **이웃 요소의 마진**이 만든다. 헤더 자체는 30px 높이만 기여한다.

---

## 5. Typography

### 5.1 Section title 실측

| 항목 | 값 |
|---|---|
| font-family (선언) | `"Color Emoji", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, "Malgun Gothic", Arial, sans-serif, …` |
| **실제 렌더 폰트** | **Malgun Gothic** (아래 5.2) |
| font-size | **12px** (`text-xs`) |
| font-weight | **700** (`font-bold`) |
| line-height | `normal` → 실측 **16px** |
| letter-spacing | `normal` (0) |
| **text-transform** | **`none`** — 대문자 변환 없음 |
| color | **`rgba(255, 255, 255, 0.3)`** (`text-sidebar-color-30`) |
| opacity | **1** (색의 알파로만 약화. opacity 속성은 건드리지 않음) |
| -webkit-font-smoothing | `antialiased` |
| 오버플로 | `hidden` + `ellipsis` + `nowrap` |

### 5.2 렌더 폰트 확정 — 측정

제목 텍스트("리스트")의 실제 렌더 폭을 재고 후보 폰트와 대조했다.

| 후보 (700 12px) | 폭 |
|---|---|
| **실제 렌더** | **36.00** |
| **"Malgun Gothic"** | **36.00** |
| system-ui / "Segoe UI" / Arial / Roboto | 33.12 |

→ 한글 제목은 스택 뒤쪽의 **Malgun Gothic**이 렌더한다. (Component 01에서 라틴 문자 라벨은 `system-ui` → **Segoe UI**로 확정했다. 즉 **같은 스택에서 문자 종류에 따라 다른 폰트가 나온다** — 한글 UI에서는 제목과 라벨의 실제 서체가 다를 수 있다.)

### 5.3 Row label과 직접 비교

| Property | **Row label** (C01) | **Section title** (C03) | 차이 |
|---|---|---|---|
| font-size | **14px** | **12px** | −2 |
| font-weight | **400** | **700** | +300 |
| line-height | **20px** (지정) | **16px** (`normal`, 폰트 유래) | −4 |
| color | `rgb(255,255,255)` | `rgba(255,255,255,0.3)` | **알파 100% → 30%** |
| opacity | 1 | 1 | 동일 |
| letter-spacing | normal | normal | 동일 |
| text-transform | none | **none** | 동일 |
| 렌더 폰트(한글) | Malgun Gothic | Malgun Gothic | 동일 |
| 유틸리티 | `text-s` | `text-xs` | |

**[Observed]** 섹션 제목은 행 라벨보다 **작고(−2px), 굵고(+300), 훨씬 흐리다(100%→30%)**.

**[Inference]** 위계를 낮추는 축으로 **크기와 색을 쓰고, 굵기는 반대로 올렸다.** 굵기만 보면 강조지만 30% 알파가 그것을 압도한다. 12px 30% 텍스트는 읽으려면 봐야 하는 수준이고, 굵기는 그 흐린 상태에서도 글자 형태가 뭉개지지 않게 하는 보정으로 보인다 — 즉 **강조가 아니라 가독성 유지용 굵기**다. 대문자 변환을 쓰지 않는 것도 같은 맥락으로 읽힌다(한글에는 대문자가 없으므로 로케일 무관한 선택이기도 하다).

---

## 6. Action Button (`+`) 분석

| 항목 | 값 |
|---|---|
| 요소 | `<button type="button">` |
| **hit area** | **16 × 16** |
| wrapper | **없음.** 버튼 자신이 곧 히트 영역이며 padding 0 |
| 아이콘 방식 | **SVG 스프라이트** (`<use xlink:href="#add">`) |
| svg 박스 | 16 × 16 |
| **렌더 글리프** | **12 × 12** |
| viewBox | 심볼 정의 기준 (Component 01의 아이콘들과 동일한 스프라이트 체계) |
| fill / stroke | fill **currentColor** (`rgb(255,255,255)`) / stroke `none` |
| icon color | `text-sidebar-color` → 흰색 |
| **icon opacity** | **0.4** (`opacity-40`), 아이콘 hover 시 **1** (`hover:opacity-100`) |
| **button opacity** | **0** (평소) → **1** (헤더 hover / 자신 focus) |
| background | **없음** (`rgba(0,0,0,0)`), hover에서도 **생기지 않음** |
| border-radius | **0** |
| cursor | pointer |
| transition | **all / 0s** (버튼·svg 모두) |

요청하신 형식으로:

```
hit area : 16 × 16     ← 패딩 없음. 아이콘 박스가 곧 클릭 영역
SVG box  : 16 × 16
글리프    : 12 × 12
```

**[Observed] 불투명도가 2단으로 걸려 있다.** 버튼의 `opacity`(0→1, 등장/퇴장)와 그 안 svg의 `opacity`(0.4→1, 강조)가 별개로 동작한다. 따라서 헤더 hover 시 보이는 `+`의 실효 밝기는 **1 × 0.4 = 40%**이고, `+` 자체에 hover하면 100%가 된다.

**[Observed] hit area가 16×16뿐이다.** Component 01의 행 more 버튼도 16×16이었다. 두 경우 모두 WCAG 2.2 SC 2.5.8의 24×24 최소 타깃에 못 미친다.

---

## 7. 상태별 실측

전부 **실제 마우스 / 실제 Tab 키 / 실제 클릭**으로 만든 상태에서 잰 값이다.

| Property | A. normal | B. header hover | C. `+` hover | D/E. `+` focus-visible | G. collapsed |
|---|---|---|---|---|---|
| header background | `rgba(0,0,0,0)` | **`rgba(255,255,255,0.03)`** | `rgba(255,255,255,0.03)` | **`rgba(0,0,0,0)`** | (hover 여부 따름) |
| header radius | `6px` | `6px` | `6px` | `6px` | `6px` |
| header box-shadow | `none` | `none` | `none` | `none` | `none` |
| header border | 없음 | 없음 | 없음 | 없음 | 없음 |
| header outline | `none` | `none` | `none` | **`none`** (헤더엔 링 없음) | — |
| title color | `rgba(255,255,255,0.3)` | **변화 없음** | 변화 없음 | 변화 없음 | 변화 없음 |
| title opacity | 1 | 1 | 1 | 1 | 1 |
| **chevron wrap opacity** | **0** | **1** | 1 | **0** ← 나타나지 않음 | **1** |
| chevron color | `rgba(255,255,255,0.4)` | `rgba(255,255,255,0.4)` | 동일 | — | 동일 |
| chevron transform | `none` | none | none | — | **`rotate(-90deg)`** |
| **add button opacity** | **0** | **1** | 1 | **1** | 0 (hover 시 1) |
| add icon opacity | 0.4 | 0.4 | **1** | 0.4 | 0.4 |
| add background | 없음 | 없음 | **없음** | 없음 | 없음 |
| add outline | `none` | `none` | `none` | **`auto 1px rgb(71,114,250)`, offset 0** | — |
| cursor | pointer | pointer | pointer | pointer | pointer |
| transition | `all / 0s` | `all / 0s` | `all / 0s` | `all / 0s` | `all / 0s` |

### 7.1 chevron 자체 hover (별도 측정)

chevron 슬롯에 직접 hover하면 색이 **`rgba(255,255,255,0.4)` → `rgb(255,255,255)`**로 밝아진다. `+` 아이콘의 hover 처리와 같은 방식이다.

### 7.2 F. Active (누름)

헤더 마크업 전체에서 `active:` 변형 출현 **0회**. `ring-` 0회, `shadow-` 0회. → **누름 상태 스타일이 없다.** (마우스 다운 유지 상태를 직접 재는 API가 없어 이것이 간접 증거인 점은 Component 01과 동일하다.)

### 7.3 G / H. Collapsed ↔ Expanded — 실제로 접어보고 측정

헤더 가운데(제목 위)를 클릭했다.

| 항목 | H. expanded (원래) | G. collapsed |
|---|---|---|
| SECTION 클래스 | `hoverSection **open**` | `hoverSection` (**`open` 제거**) |
| SECTION 높이 | **194** | **34** |
| SECTION padding | `0px 0px 12px` | **`0px 0px 4px`** |
| 리스트 행 개수 | **4** | **0 — DOM에서 제거됨**(숨김이 아님) |
| chevron transform | `matrix(1,0,0,1,0,0)` (기본) | **`matrix(0,-1,1,0,0,0)` = rotate(−90°)** |
| 헤더 자신의 높이 | 30 | **30 (동일)** |
| 헤더 y | 159 | 159 (동일) |
| transition | `all / 0s` | `all / 0s` — **회전도 접힘도 애니메이션 없음** |

**[Observed]** 접히면 **섹션의 `padding-bottom`이 12 → 4로 줄어든다.** 즉 섹션 패딩은 위치뿐 아니라 **상태에 따라서도 달라진다**(Component 02에서 "섹션 패딩이 균일하지 않다"고 관찰한 것의 연장).

**[Observed]** 접기는 CSS 높이 애니메이션이 아니라 **자식 DOM 제거**로 구현돼 있다.

### 7.4 요청하신 질문들에 대한 직접 답

| 질문 | 실측 답 |
|---|---|
| `+` 버튼이 항상 보이는가 | **아니다.** 평소 `opacity: 0` |
| section hover 때만 나타나는가 | **헤더 hover 또는 `+` 자신의 focus 때** 나타난다. 섹션 본문(행들) hover로는 나타나지 않는다 — `group`은 헤더의 `A`이지 섹션이 아니다 |
| action hover 때 background가 생기는가 | **생기지 않는다.** 아이콘 opacity만 0.4 → 1 |
| header 전체가 clickable한가 | **A(219px)만.** LI의 좌우 10px는 **죽은 영역** — 그곳에 hover하면 `li:hover`는 true지만 배경도 아이콘도 반응하지 않는다(실측) |
| title 클릭과 `+` 클릭의 hit target이 분리되어 있는가 | **분리돼 있다.** 제목 영역 클릭 → 섹션 접기/펼치기. `+`(16×16) 클릭 → 항목 추가. 두 영역은 겹치지 않는다 |

---

## 8. Transition — 이 컴포넌트에서 독립 검증

Component 01의 결과를 가정하지 않고 다시 쟀다.

| 요소 | transition-property | duration | timing |
|---|---|---|---|
| A (헤더) | `all` | **0s** | ease |
| title | `all` | **0s** | ease |
| add button | `all` | **0s** | ease |
| add svg | `all` | **0s** | ease |
| chevron svg | `all` | **0s** | ease |
| chevron wrapper | `all` | **0s** | ease |

헤더 마크업 내 문자열 출현 횟수: `transition` **0회**, `duration-` **0회**.

**[Observed]** opacity 전환(0→1)도, 배경 전환도, chevron 회전도 **전부 즉시**다. 이 컴포넌트에도 transition이 없다.

---

## 9. CSS Token / Utility 추적

### A. CSS custom-property 토큰에서 온 값

| 값 | 토큰 | 유틸리티 |
|---|---|---|
| `rgba(255,255,255,0.3)` 제목 색 | `--color-sidebar-color` × `--opacity-variant-sidebar-color-30` | `text-sidebar-color-30` |
| `rgba(255,255,255,0.4)` chevron 색 | `--color-sidebar-color` × `…-40` | `text-sidebar-color-40` |
| `rgb(255,255,255)` `+` 아이콘 색 | `--color-sidebar-color` | `text-sidebar-color` |
| `rgba(255,255,255,0.03)` hover 배경 | `--color-grey` × `--opacity-variant-grey-3` | `bg-grey-3` |
| `rgb(71,114,250)` 포커스 링 | `--color-primary` | (UA `outline: auto`) |

**Component 01과 완전히 같은 계열을 재사용한다.** 새 색 토큰은 하나도 등장하지 않았다. 제목의 30%만 이 컴포넌트에서 처음 쓰인 단계다.

### B. Tailwind / utility 상수 (토큰 아님)

| 유틸리티 | 해석값 | 성격 |
|---|---|---|
| `rounded-default` | **6px** | **이름이 붙은 상수** — `rounded-[6px]` 같은 임의값이 아니라 테마에 등록된 이름. 다만 CSS custom property로는 노출되지 않는다 |
| `text-xs` | 12px | 이름 붙은 스케일 |
| `font-bold` | 700 | 이름 붙은 스케일 |
| `opacity-40` | 0.4 | 이름 붙은 스케일 |
| `h-[30px]` · `px-[10px]` · `pl-[14px]` · `pr-[10px]` · `w-[16px]` · `w-[12px]` | 그대로 | **임의값** |

**[Observed]** 이 컴포넌트는 **이름 붙은 상수(`rounded-default`, `text-xs`, `font-bold`, `opacity-40`)와 임의값(`pl-[14px]` 등)을 섞어 쓴다.** Component 01의 행은 radius를 `rounded-[10px]`(임의값)로 썼는데, 헤더는 `rounded-default`(상수)를 쓴다 — **같은 사이드바 안에서 radius를 지정하는 방식이 다르다.**

### C. Layout-derived

`219`(239 − 좌우 10×2) · `179`(A 내부 잔여 폭: 219 − 14 − 10 − 16) · title이 `+`까지 늘어난 결과 · `+`의 x 253 (우측 정렬 결과)

### D. Browser-derived

`16px` 라인박스 — `line-height: normal`이 폰트 메트릭(ascent 13 + descent 3)으로 해석된 값 · baseline y 179 · 포커스 링의 `auto 1px` 두께 · chevron 글리프 bbox 7.58×4.14

---

## 10. Section 간 Vertical Rhythm

### 10.1 y 좌표 실측

| 지점 | y |
|---|---|
| 이전 블록(스마트 리스트) 마지막 행 bottom | **126** |
| 구분선 top / bottom | **142 / 143** |
| **Section Header top** | **159** |
| title top / baseline / bottom | **166 / 179 / 182** |
| **Section Header bottom** | **189** |
| **첫 리스트 행 top** | **189** |
| 마지막 리스트 행 bottom | **339** |
| 다음 섹션(필터) 헤더 top | **357** |

### 10.2 분해 — 세 가지 "이전 콘텐츠 → 헤더" 케이스

이 사이드바에는 헤더 앞에 오는 것이 세 종류라 간격도 세 가지다.

**케이스 1 — 구분선 뒤 (리스트 헤더)**
```
이전 행 bottom 126
  +16   구분선 margin-top
  + 1   구분선 height
  +16   구분선 margin-bottom
= 159   헤더 top          → 총 33
```
섹션 자신의 `padding-top`은 **0**이라 기여하지 않는다.

**케이스 2 — 이전 섹션의 행 뒤 (필터 헤더)**
```
이전 행 bottom 339
  + 2   행 래퍼의 margin-bottom (이전 섹션 소속)
  +12   이전 섹션(리스트)의 padding-bottom
  + 4   이 섹션(필터)의 padding-top
= 357   헤더 top          → 총 18
```

**케이스 3 — 이전 섹션의 박스 뒤 (태그 헤더)**
```
이전 요소 bottom 451
  +12   이전 섹션(필터)의 padding-bottom
  + 4   이 섹션(태그)의 padding-top
= 467   헤더 top          → 총 16
```

**헤더 → 첫 행**
```
헤더 bottom 189
  + 0   ← 아무 마진도 패딩도 없다
= 189   첫 행 top          → 총 0
```

### 10.3 이것이 말해주는 것

**[Observed]** 헤더 위 간격은 **33 / 18 / 16** 세 값이고, 그 중 어느 것도 한 곳에 "이만큼 띄우라"고 적혀 있지 않다. 전부 이웃의 마진·패딩이 더해진 결과다.

**[Observed]** 헤더 **아래는 0**이다. 제목이 첫 행에 바로 붙는다.

**[Inference]** 위는 넉넉하고 아래는 0인 비대칭은 **제목을 아래 목록에 묶어 보이게 하는** 배치다. 위아래가 같으면 제목이 두 그룹 사이에 떠 보이는데, 위만 벌리면 "여기서부터가 이 제목의 것"으로 읽힌다. 다만 그 "위 간격"이 세 값으로 갈리는 것은 의도라기보다 이웃 조합의 결과로 보인다.

**Component 01·02와의 연결**: 01에서 행 리듬 38(36+2), 02에서 섹션 패딩 불균일과 마진 상쇄를 확인했고, 03에서 헤더가 **세로 여백을 전혀 갖지 않는다**는 점이 더해졌다. 세 컴포넌트 모두에서 **간격이 요소 자신이 아니라 이웃 관계로 결정된다**는 패턴이 반복된다. 다만 이것을 아직 디자인 시스템으로 일반화하지 않는다(§16).

---

## 11. Alignment

### 11.1 x축 실측 대조

| 기준선 | Row (C01) | Section Header (C03) | 차이 |
|---|---|---|---|
| LI 좌측 | **50** | **50** | 0 |
| 내부 요소(button / A) 좌측 | **60** | **60** | 0 |
| 내부 패딩 | pl **12** | pl **14** | +2 |
| 아이콘 좌측 | **72** | (chevron 61) | — |
| **텍스트 좌측** | **라벨 98** | **제목 74** | **−24** |
| 내부 우측 패딩 | pr **12** | pr **10** | −2 |
| 트레일 요소 우측 | **267** (카운트/more) | **269** (`+`) | **+2** |
| 내부 요소 우측 | **279** | **279** | 0 |

### 11.2 정렬 관계

```
x=50 ─ 사이드바 가장자리 (둘 다 동일)
x=60 ─ 배경이 칠해지는 영역의 좌측 (둘 다 동일)
x=72 ─ Row 아이콘 좌측
x=74 ─ Section title 좌측      ← 아이콘과 2px 차이
x=98 ─ Row 라벨 좌측           ← 제목과 24px 차이
```

**[Observed] 섹션 제목은 행의 라벨이 아니라 행의 아이콘 쪽에 정렬된다.** 정확히 같지는 않고 **2px 오른쪽**이다(74 vs 72). 이 2px은 A의 `padding-left: 14`와 행 버튼의 `padding-left: 12`의 차이 그대로다.

우측도 마찬가지로 2px 어긋난다: `+`의 우측 269, 행 트레일의 우측 267.

**[Inference]** 제목을 라벨(98)이 아니라 아이콘(72) 근처에 두면 제목이 목록 전체의 **바깥쪽 기준선**에 서게 되어 그룹 전체를 감싸는 라벨처럼 읽힌다. 라벨 x에 맞췄다면 제목이 항목 중 하나처럼 보였을 것이다.

다만 **2px 어긋남 자체가 의도된 것인지는 알 수 없다.** 14/10과 12/12라는 서로 다른 패딩 조합에서 나온 부산물일 가능성이 높고, 이 값을 "의도적 hierarchy"라고 부를 근거는 관찰에 없다. 정렬 의도는 24px 차이(라벨과 다른 줄에 선다)에서 읽히고, 2px은 그 안의 오차로 보인다.

---

## 12. 다른 Section Header와 비교

`리스트` · `필터` · `태그` 세 헤더를 대조했다.

| 항목 | 리스트 | 필터 | 태그 | 판정 |
|---|---|---|---|---|
| LI 클래스 | `drop-hover-target h-[30px] px-[10px]` | 동일 | 동일 | **같음** |
| A 클래스 | `…rounded-default…pl-[14px] pr-[10px] hover:bg-grey-3` | 동일 | 동일 | **같음** |
| height | 30 | 30 | 30 | **같음** |
| A 패딩 | `0 10px 0 14px` | 동일 | 동일 | **같음** |
| A radius | 6px | 6px | 6px | **같음** |
| title 클래스 | `text-xs font-bold flex-auto truncate text-sidebar-color-30` | 동일 | 동일 | **같음** |
| title 크기/굵기/색 | 12 / 700 / 30% | 동일 | 동일 | **같음** |
| title x | 74 | 74 | 74 | **같음** |
| `+` 버튼 | 있음, 16×16, right 269 | 동일 | 동일 | **같음** |
| chevron | 있음 | 있음 | 있음 | **같음** |
| **부모 SECTION 패딩** | `0 0 12px` | **`4px 0 12px`** | **`4px 0 0`** | **다름** |

**판정: shared pattern.** 헤더 컴포넌트 자체는 예외 클래스도 variant도 없이 **완전히 동일**하다.

유일한 차이는 **부모 SECTION의 패딩**인데, 이는 헤더의 속성이 아니라 섹션이 어디에 놓였는지(앞에 구분선이 있는지, 뒤에 무엇이 오는지)에 따른 값이다. 즉 **variant는 헤더에 있는 게 아니라 배치에 있다.**

---

## 13. Accessibility — 구현에서 확인된 것만

| 항목 | 실측 |
|---|---|
| `+` 버튼의 accessible name | **없음.** 텍스트 없음, `aria-label` 없음, `title` 없음 → **이름 없는 버튼** |
| `aria-label` | 헤더 전체에 **0개** |
| **`aria-expanded`** | **없음** — 접기/펼치기 컨트롤인데 상태가 노출되지 않는다 |
| **`aria-controls`** | **없음** |
| `role` | 어느 요소에도 **없음** |
| 제목의 semantic | **`<P>`**. 사이드바 전체에 heading 요소(`h1`~`h6`) **0개** |
| `<section>`의 레이블 | `aria-labelledby` **없음** |
| **키보드 포커스** | 헤더 트리거(`A`) **불가** (href·tabindex 둘 다 없음) / `+` 버튼 **가능** |
| **키보드로 섹션 접기** | **불가능** — 접기 트리거에 도달할 수단이 없다 |
| focus-visible 표현 | `+` 버튼: `outline: auto 1px rgb(71,114,250)`, offset 0 (Component 01의 행과 동일) |

**[Observed]** 키보드 사용자는 이 헤더에서 `+` 버튼 하나에만 도달할 수 있고, 그 버튼은 이름이 없어 스크린리더에서 "버튼"으로만 읽힌다. 섹션 접기는 마우스 전용이다.

지시에 따라 **없는 속성을 Fidelity Spec에 임의로 넣지 않는다.** 개선안은 Appendix A.

---

## 14. Observed vs Inference 요약

### [Observed]

1. root 트리거는 `href`도 `tabindex`도 없는 **`<A>`**이며 **포커스 불가**다.
2. 헤더 높이 **30**, radius **6**, 패딩 **좌 14 / 우 10**. 행(높이 36, radius 10, 패딩 12/12)과 **모두 다르다**.
3. 제목은 **12px / 700 / 흰색 30%**, 행 라벨은 **14px / 400 / 흰색 100%**.
4. 라인박스 16px은 지정값이 아니라 폰트 메트릭(13+3)에서 나온 값이다. baseline y=179.
5. chevron 슬롯 폭(14) = A의 padding-left(14). **나타나도 제목이 밀리지 않는다.**
6. `+`는 **16×16 hit area**, 배경 없음, radius 0. **불투명도가 2단**(버튼 0→1, 아이콘 0.4→1).
7. hover 배경은 **3%** — Component 01의 행 hover와 **같은 값**.
8. `+`에 키보드 포커스가 가면 **버튼만 나타나고 chevron은 나타나지 않으며 배경도 생기지 않는다.**
9. 접으면 `open` 클래스가 빠지고, **자식 행이 DOM에서 제거**되며, chevron이 **−90° 회전**하고, 섹션 `padding-bottom`이 **12 → 4**로 바뀐다. **애니메이션 없음.**
10. transition은 이 컴포넌트에서도 **전부 0s**.
11. 세 헤더(`리스트`·`필터`·`태그`)는 **완전히 동일**하다. 차이는 부모 섹션 패딩뿐.
12. 제목 x=74는 행 **아이콘**(72)에 가깝고 행 **라벨**(98)과는 24px 떨어져 있다.
13. 헤더 위 간격은 **33 / 18 / 16** 세 값이고 전부 이웃이 만든 합성값이다. 헤더 아래는 **0**.
14. **aria 속성이 하나도 없다.** `aria-expanded`도, `+`의 이름도 없다.
15. 색 토큰은 Component 01과 **같은 계열을 재사용**한다. 새 색은 없고 30% 단계만 새로 등장했다.

### [Inference]

1. 위계를 낮추는 축으로 **크기와 알파**를 썼고, 굵기(700)는 30% 알파에서 글자 형태가 무너지지 않게 하는 **보정**으로 보인다 — 강조가 아니다.
2. 제목을 행 아이콘 쪽 기준선에 두어 **목록 전체를 감싸는 라벨**로 읽히게 한 것으로 보인다. 다만 정확히 맞추지 않은 2px은 패딩 조합의 부산물일 가능성이 높다.
3. 헤더 위는 벌리고 아래는 0으로 붙인 비대칭은 **제목과 목록을 한 덩어리로 묶는** 배치로 읽힌다.
4. chevron·`+`를 평소 숨기고 hover에서만 꺼내는 것은, 섹션 헤더가 **읽는 대상이 아니라 지나가는 이정표**라는 판단으로 보인다.
5. `rounded-default`(상수)와 `rounded-[10px]`(임의값)이 같은 사이드바 안에 공존하는 것은, 헤더가 **앱 공통 컴포넌트 계열**, 행이 **이 화면 전용**으로 서로 다른 시점에 작성됐음을 시사한다. 다만 소스를 볼 수 없으므로 추측이다.

---

## 15. Fidelity Specification

관찰된 TickTick 동작만 적는다. 개선안은 Appendix A.

```
SIDEBAR SECTION HEADER

Root (여백 담당)
  height              : 30px
  width               : 사이드바 폭 − 0 (컨테이너 전폭)
  margin              : 0
  padding             : 0 10px          ← 좌우 10px은 클릭 불가 완충대
  background          : 없음
  radius              : 0

Trigger (실제 클릭 대상, root 안쪽)
  height              : 30px (root와 동일)
  width               : root 폭 − 20
  margin              : 0
  padding             : 0 10px 0 14px   ← 좌 14 / 우 10 (비대칭)
  layout              : flex, align-items center, gap 사용 안 함
  radius              : 6px
  background          : normal 없음 / hover 전경색 3% 알파
  overflow            : hidden
  cursor              : pointer
  동작                : 클릭 시 섹션 접기/펼치기

Title
  font-family         : 시스템 스택 (한글은 Malgun Gothic, 라틴은 Segoe UI로 렌더됨)
  font-size           : 12px
  font-weight         : 700
  line-height         : normal → 폰트 메트릭상 16px
  letter-spacing      : 0
  text-transform      : none
  color               : 전경색 30% 알파
  opacity             : 1 (약화는 색의 알파로만)
  overflow            : truncate (hidden + ellipsis + nowrap)
  flex                : 1 (남는 폭을 전부 차지, 스페이서 겸용)
  세로                : 30px 안에서 중앙 (위아래 각 7px), baseline은 중심보다 5px 아래

Collapse control (좌측)
  slot                : 14 × 30, absolute, trigger 좌측 끝
                        slot 폭 = trigger의 padding-left → 등장해도 제목이 밀리지 않음
  icon                : 12 × 12 (글리프 7.58 × 4.14), 아래 방향 삼각형
  color               : 전경색 40% 알파 / 자신 hover 시 100%
  normal              : opacity 0
  header hover        : opacity 1
  keyboard focus      : opacity 0 (나타나지 않음)
  collapsed 표시      : rotate(-90deg), 애니메이션 없음

Action slot (우측)
  width               : 16px (별도 wrapper 없음)
  height              : 16px
  alignment           : trigger 우측 끝에서 10px 안쪽 (= 사이드바 가장자리에서 20px)

Action button (+)
  hit area            : 16 × 16   ← padding 0. 아이콘 박스가 곧 클릭 영역
  icon size           : 12 × 12 글리프 (16 × 16 svg 박스)
  radius              : 0
  background          : 어느 상태에서도 없음
  normal              : button opacity 0 / icon opacity 0.4
  header hover        : button opacity 1 / icon opacity 0.4
  icon hover          : button opacity 1 / icon opacity 1
  focus-visible       : button opacity 1, outline auto 1px accent, offset 0
                        (이때 헤더 배경은 생기지 않고 chevron도 나타나지 않는다)

States
  pressed             : 정의되지 않음
  disabled            : 정의되지 않음
  collapsed           : 자식 행을 DOM에서 제거, 섹션 padding-bottom 12 → 4,
                        헤더 자신의 높이·위치는 불변

Vertical rhythm
  previous content → header :
      구분선 뒤        = 33  (구분선 mt 16 + h 1 + mb 16)
      이전 섹션 행 뒤  = 18  (행 mb 2 + 이전 섹션 pb 12 + 이 섹션 pt 4)
      이전 섹션 박스 뒤= 16  (이전 섹션 pb 12 + 이 섹션 pt 4)
      ※ 헤더 자신은 세로 margin/padding을 갖지 않는다
  header → first row  : 0   (첫 행이 헤더 bottom에 바로 붙는다)

Alignment
  title x             : 74
  row label x         : 98
  row icon x          : 72
  relationship        : 제목은 행 라벨이 아니라 행 아이콘 쪽 기준선에 선다 (2px 오른쪽)
  action right edge   : 269 (행 트레일 267보다 2px 바깥)

Transition
  전부 없음 (all / 0s). 배경·opacity·chevron 회전 모두 즉시.

Accessibility (관찰된 그대로)
  aria 속성 없음 · role 없음 · aria-expanded 없음 · aria-controls 없음
  제목은 <p> (heading 아님)
  트리거는 포커스 불가 → 키보드로 접기 불가
  + 버튼만 포커스 가능하며 accessible name 없음
```

---

## 16. Component 01 / 02 / 03 연결 — Candidate Shared Rules

세 컴포넌트에서 **반복 확인된 것만** 적는다. **아직 확정 토큰으로 선언하지 않는다.**

| 후보 규칙 | 01 Row | 02 Shell | 03 Header | 상태 |
|---|---|---|---|---|
| **전경색 = 흰색 단일, 알파로 위계** | 라벨 100% / 카운트 40% | 구분선 5·6·10% | 제목 30% / 아이콘 40% | **3/3 일치** |
| **hover 배경 = 전경색 3%** | 3% | — | **3%** | **2/2 일치** |
| **바깥 10px 여백 + 안쪽 패딩 2단 구조** | 10 + 12/12 | (컨테이너 패딩 0) | 10 + 14/10 | **2/2 일치**(안쪽 값은 다름) |
| **LI 좌우 10px은 클릭 불가 완충대** | 확인 | — | **확인** | **2/2 일치** |
| **transition 없음 (0s)** | 0s | 0s (스크롤바 opacity 0.3s만 예외) | **0s** | **3/3 일치** |
| **액션은 평소 숨김 → hover/focus에서 등장** | more 0→1 | — | `+`·chevron 0→1 | **2/2 일치** |
| **hover 변형마다 focus-visible 쌍이 존재** | 24:24 | — | 2:2 | **2/2 일치** |
| **포커스 링 = `auto 1px` accent, offset 0** | 행 버튼 | — | `+` 버튼 | **2/2 일치** |
| **액션 hit area 16×16** | more 16×16 | — | `+` 16×16 | **2/2 일치** |
| **그림자 없음** | 없음 | 없음 | 없음 | **3/3 일치** |
| **색은 토큰, 치수는 임의값** | 확인 | 확인 | **부분 반례**(`rounded-default`는 이름 상수) | **2.5/3** |
| radius | **10px** (임의값) | — | **6px** (상수) | **불일치 — 공통 규칙 아님** |
| 행 높이 | 36 | — | **30** | **불일치 — 역할별로 다름** |
| 안쪽 패딩 | 12 / 12 | — | **14 / 10** | **불일치** |

**해석 유보**: spacing grid는 여전히 "**2px 격자, 4배수 선호**"까지만 지지된다. 03에서 새로 나온 값은 14 · 30 · 6 · 7(중앙 여백) · 33 · 18인데, 이 중 6·14·18·30은 4배수가 아니다(2배수는 전부 만족). **세 컴포넌트로도 8pt 그리드는 지지되지 않는다.**

**가장 견고한 후보 두 개**: (1) 전경색 1개 × 알파 스케일, (2) transition 없음. 이 둘은 세 컴포넌트 전부에서 예외 없이 관찰됐다.

---

## Appendix A — 우리 앱에 적용할 때 다르게 할 것 (관찰이 아닌 제안)

**아래는 TickTick 동작이 아니다.**

1. **트리거를 `<button>`으로.** TickTick은 `href`도 `tabindex`도 없는 `<a>`라 키보드로 섹션을 접을 수 없다. 우리는 `<button type="button">`으로 만들고 `aria-expanded`와 `aria-controls`를 붙인다.
2. **`+` 버튼에 이름을 준다.** 현재 accessible name이 없다. `aria-label="리스트 추가"` 수준의 이름은 필수다.
3. **hit area 16×16을 24×24 이상으로.** WCAG 2.2 SC 2.5.8 미달이다. 아이콘은 12~16으로 두고 **패딩으로만** 타깃을 키우면 시각은 그대로 유지된다. (Component 01의 more 버튼도 같은 문제.)
4. **제목을 heading 또는 레이블로.** 사이드바에 heading이 0개다. `<h2>` + `<section aria-labelledby>` 조합이면 스크린리더에서 섹션 단위 이동이 가능해진다.
5. **제목 색 30%는 재검토.** 12px에 30% 알파는 대비가 매우 낮다. 우리 다크 배경(#1c1c1e)에서 흰색 30%는 WCAG 대비 기준을 크게 밑돈다. 40~50%를 권한다.
6. **접기 상태를 DOM 제거 대신 유지 고려.** TickTick은 자식을 언마운트한다. 항목이 많을 때는 유리하지만, 접기/펼치기가 잦으면 재마운트 비용이 든다. 우리 규모에서는 판단이 필요하다.
7. **섹션 패딩을 규칙화.** TickTick은 위치와 상태(펼침/접힘)에 따라 pb가 12/4/0으로 바뀐다. 우리는 한 값으로 두고 첫/마지막만 예외 처리하는 편이 낫다(Component 02 Appendix와 같은 취지).
8. **제목 정렬은 74가 아니라 행 아이콘 x와 정확히 맞춘다.** TickTick의 2px 어긋남은 따라갈 이유가 없다.

---

## 17. 이 분석이 확인하지 않은 것

- **`:active`(누름)** — 마우스 다운 유지 상태를 재는 API가 없었다. 마크업에 `active:` 변형이 0건이라는 간접 증거만 있다.
- **`+` 버튼의 실제 동작** — 누르지 않았다(리스트 생성 다이얼로그가 열리므로). 클릭 후 어떤 UI가 나오는지는 미측정.
- **chevron을 직접 클릭했을 때** — 제목 영역 클릭만 했다. chevron 클릭도 같은 토글인지는 구조상 그럴 것으로 보이나 **확인하지 않았다.**
- **접힘 상태의 지속성** — 접었다 폈지만, 접힌 상태가 서버/로컬에 저장되는지는 확인하지 않았다.
- **라이트 테마** — 다크에서만 측정.
- **긴 제목의 말줄임 동작** — `truncate`가 걸려 있는 것은 확인했으나 실제로 넘치는 제목을 만들어보지는 않았다.
- **드래그 상태** — `drop-hover-target` / `drop-hover-effect` 클래스가 있으나 드래그를 수행하지 않았다.
- **원본 CSS 규칙** — CORS로 막혀 있어(fetch 403) probe 실험으로 대체했다. Component 01·02와 동일한 제약.
