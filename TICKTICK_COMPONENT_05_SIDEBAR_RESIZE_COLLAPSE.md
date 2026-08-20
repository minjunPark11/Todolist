# TickTick 역설계 #05 — Sidebar Resize / Collapse / Compact Behavior

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 컴포넌트: **사이드바의 폭 변화 · resize handle · collapse/expand · main content와의 관계**
작성일: 2026-08-20

Component 01(Row) · 02(Shell) · 03(Section Header) · 04(Folder Tree)에서 다룬 내용은 다시 분석하지 않고, 비교가 필요한 지점에서만 인용한다.

---

## 0. 측정 조건 · 방법 · 복구

### 0.1 조건

| 항목 | 측정 시작 시점 | 측정 종료 시점 |
|---|---|---|
| viewport | 763 × 392 CSS px (dpr 2) | **1387 × 713 CSS px (dpr 2)** |
| 테마 / 로케일 | dark / ko | 동일 |
| sidebar width | **240** | **240 (복원 완료)** |
| collapsed 여부 | expanded | **expanded (복원 완료)** |
| rail width | 50 | 50 |
| main content x | 290 | 290 |

**viewport가 바뀐 이유**: §5의 persistence 검증을 위해 페이지를 새로고침했더니, Component 02 이후 내가 제어하지 못한 채 걸려 있던 페이지 줌이 함께 초기화됐다. **내가 의도한 변경이 아니고 되돌릴 수단도 없다.** 다만 CSS px는 줌에 불변이고, 이번 회차의 결론(폭·클램프·구조)은 두 뷰포트에서 모두 동일하게 관찰됐다. 어느 수치가 어느 뷰포트에서 나왔는지는 각 절에 표기한다.

**§28이 요구한 복구 항목 중 sidebar width(240)와 expanded 상태는 정확히 복원했다.** viewport는 복원 수단이 없어 복원하지 못했다.

### 0.2 이번 회차에 쓴 방법과 그 한계 — 중요

resize를 재현하는 데 세 가지를 시도했고, **하나만 동작했다.**

| 방법 | 결과 |
|---|---|
| 실제 포인터 드래그 (`left_click_drag`, mousedown→단일 점프→mouseup) | **동작하지 않음.** 여러 좌표·여러 뷰포트에서 반복 실패 |
| 합성 이벤트 **동기 버스트** (pointerdown → move×N → up, 사이에 대기 없음) | **동작하지 않음.** 폭 불변 |
| **합성 이벤트 + 이동 사이 실제 시간 간격** (`await setTimeout` 삽입) | **동작함.** mousemove마다 폭이 갱신됨 |

따라서 §3·§4·§15의 resize 수치는 **합성 pointer/mouse 이벤트로 앱 자신의 드래그 로직을 구동해서** 얻은 값이다. 이벤트는 합성이지만 **그 결과로 앱이 계산한 폭·레이아웃은 실제 값**이다. 실제 사람 손의 드래그와 동일하다고 단정하지는 않는다.

collapse는 **실제 클릭**으로 수행했다(마지막 복구 1회만 `element.click()` 사용).

**탭이 백그라운드 상태**(`document.hidden === true`)라 `requestAnimationFrame` 프레임 샘플링은 불가능하다(Component 04와 동일). §8은 `document.getAnimations()`와 computed transition으로 대체했다.

### 0.3 세션에 가한 변경과 복구

| 변경 | 복구 |
|---|---|
| 사이드바 폭 240 → 298 → 213 → 468.6 → 240 | **240으로 복원 완료** (`leftListWidth = "240"`) |
| collapse 3회 (클릭 2회 + 프로그램 클릭 1회) | **expanded로 복원 완료** (`isLeftListHide = "false"`) |
| 페이지 새로고침 1회 | 로그인 세션 유지됨. 앱 상태 정상 |
| 계정 드롭다운이 실수로 열림 (Tab+Enter 조합) | **Escape로 닫음.** 메뉴 안의 `로그아웃`은 **누르지 않았다** |
| Component 04에서 만든 테스트 데이터(`ZZ Folder` + 리스트 3개) | 그대로 유지. 폴더도 펼친 상태 유지 |

측정 종료 시점 확인: sidebar 240 · expanded · URL `#p/inbox/kanban` · 열린 메뉴 0개 · 테스트 데이터 4개 온전.

**판정 규칙**: 수치는 전부 실측. 해석은 `[Inference]`로 분리. 못 잰 것은 §25.3에 적는다.

---

## 1. Baseline

| 항목 | 값 |
|---|---|
| viewport | 763 × 392 (측정 시작) |
| dpr | 2 |
| global rail width | **50** |
| sidebar width | **240** (인라인 `style="width: 240px"`) |
| main content x | **290** |
| expanded/collapsed | **expanded** |
| resize 가능 | **가능** (우측 5px 핸들) |
| theme | dark (`body.dark`) |

---

## 2. Resize Handle

| 항목 | 값 |
|---|---|
| 요소 | **`DIV.detail-dragger`** |
| 클래스 | `detail-dragger absolute w-[5px] h-full right-0 z-[2]` |
| 보유 속성 | `class`, `style` — **그 외 없음** |
| 인라인 style | **`cursor: ew-resize;`** |
| 폭 × 높이 | **5 × (사이드바 전체 높이)** |
| 위치 | `position: absolute`, `right: 0` → 사이드바 우측 끝 5px |
| x 좌표 | 285 – 290 (사이드바 폭 240일 때) |
| z-index | **2** |
| cursor | **`ew-resize`** (`col-resize`가 아니다) |
| pointer-events | `auto` |
| opacity / background | `1` / **`rgba(0,0,0,0)` (완전 투명)** |
| `::before` / `::after` | **둘 다 `content: none`** — 의사요소 미사용 |
| role / aria | **없음** |
| tabIndex | **−1** (포커스 불가) |

### 2.1 보이는 divider와 드래그 히트 영역은 다른 요소다

| 역할 | 요소 | 폭 | 위치 (폭 240 기준) |
|---|---|---|---|
| **보이는 경계선** | `.lists`의 `border-right` | **1px** | x 289 – 290 |
| **드래그 히트 영역** | `.detail-dragger` | **5px** | x 285 – 290 |

**[Observed]** 히트 영역이 보이는 선보다 **5배 넓고**, 선의 왼쪽으로 4px 더 뻗어 있다. 두 요소는 부모도 다르다(`.lists` vs `.g-left`의 직계 자식).

**[Inference]** 1px 선을 정확히 집는 것은 불가능에 가까우므로 히트 영역만 넓힌 표준적인 처리다. 다만 5px은 그중에서도 좁은 편이다.

---

## 3. Resize 가능 범위 실측

### 3.1 드래그 중 폭 결정 공식

pointer의 `clientX`를 옮기며 폭을 기록했다.

| pointer clientX | sidebar width | 관계 |
|---|---|---|
| 320 | 270 | 320 − 50 |
| 300 | 250 | 300 − 50 |
| 280 | 230 | 280 − 50 |
| 400 | 350 | 400 − 50 |
| 500 | 450 | 500 − 50 |

**[Observed] `width = pointerClientX − 50`.** 50은 Global Rail의 폭이고, 곧 사이드바의 좌측 x다. 즉 **폭 = 포인터의 x − 사이드바 좌측 좌표**로, 오프셋 보정이 없다(핸들을 어디에서 집었는지와 무관).

### 3.2 클램프 — 최소 / 최대

| 방향 | pointer clientX | sidebar width |
|---|---|---|
| 축소 | 240 | **213** ← 클램프 시작 |
| 축소 | 200 / 160 / 120 / 90 | **213 / 213 / 213 / 213** |
| 확대 | 500 | 450 |
| 확대 | 600 | **468.6** ← 클램프 시작 |
| 확대 | 700 / 800 / 900 / 1000 / 1100 / 1200 / 1300 | **468.6** (전부 동일) |

| 항목 | 값 |
|---|---|
| **최소 폭** | **213px** |
| **최대 폭** | **468.6px** (viewport 1387에서 측정) |
| 기본/현재 폭 | 240px |

**최대값의 성격은 확정하지 못했다.** 468.6은 정수가 아니고, viewport를 바꿀 수 없어 고정 px인지 뷰포트 비율인지 구분할 수 없었다. 참고로 1387 × 0.3378 ≈ 468.6, (1387 − 50) × 0.3505 ≈ 468.6 — **어느 쪽도 검증되지 않은 산술적 우연일 수 있다.** 213은 정수라 고정값일 가능성이 높지만 이 역시 한 뷰포트에서만 확인했다.

### 3.3 세 폭 상태에서의 전수 측정

| 측정 항목 | **B. 최소 213** | **A. 기본 240** | **C. 확대 298** |
|---|---|---|---|
| sidebar width | **213** | **240** | **298** |
| sidebar x / right | 50 / 263 | 50 / 290 | 50 / 348 |
| global rail width | **50** | **50** | **50** |
| main content x | **263** | **290** | **348** |
| main content width | **1124** | 1097 (vw 1387) | **415** (vw 763) |
| dragger x | 258 | 285 | 343 |
| root row button x / width | 60 / 192 | 60 / 219 | 60 / 277 |
| child row button x / width | 86 / 166 | 86 / 193 | 86 / 251 |
| **root label x / width** | 98 / **106** | 98 / **133** | 98 / **191** |
| **child label x / width** | 124 / **80** | 124 / **107** | 124 / **165** |
| **folder label x / width** | 98 / **118** | 98 / **145** | 98 / **203** |
| trailing slot x / right | 216 / 240 | 243 / 267 | 301 / 325 |
| section header `a` x / width | 60 / 192 | 60 / 219 | 60 / 277 |
| section header title x | **74** | **74** | **74** |
| section header `+` x | 226 | 253 | 311 |

**[Observed] 왼쪽은 완전히 고정, 오른쪽은 사이드바 우측 끝에 붙어 따라온다.**

사이드바 우측 끝을 기준으로 한 오프셋은 세 상태에서 **정확히 동일**했다:

```
sidebar right  −  1 = LI right
sidebar right  − 11 = button right      (LI padding 10 + border 1)
sidebar right  − 23 = trailing right    (+ button padding 12)
sidebar right  − 47 = trailing left     (+ slot 24)
```

**[Observed] 폭 변화는 100% 라벨이 흡수한다.** 240 → 213(−27)에서 라벨 폭이 133→106, 107→80, 145→118로 **전부 정확히 −27**이었다. 아이콘·도트·트레일링 슬롯은 1px도 변하지 않았다.

---

## 4. min-width / max-width / clamp의 출처

| 요소 | 속성 | 값 |
|---|---|---|
| 사이드바 컨테이너 (`.g-left`) | `width` | **인라인 `style="width: 213px"`** (computed 213px) |
| | `min-width` | **`auto`** |
| | `max-width` | **`none`** |
| | `flex` | **`0 0 auto`** |
| 내부 패널 | `min-width` / `max-width` | `0px` / `none` |
| main content (`.tasklist`) | `flex` | **`1 1 0%`** |
| | **`min-width`** | **`370px`** ← CSS로 걸린 유일한 폭 제한 |
| 공통 부모 | `display` | **`flex`** (grid 아님) |

**[Observed] 사이드바 쪽에는 폭 제한이 CSS로 전혀 걸려 있지 않다.** `min-width: auto`, `max-width: none`이다. 그런데 실제로는 213/468.6에서 멈춘다. → **클램프는 JS 드래그 로직 안에 있다.**

**[Inference]** `Math.max(213, Math.min(MAX, clientX - 50))` 형태로 보인다. main content의 `min-width: 370px`은 flex 축소 하한이라 별개의 안전장치이며, 최대 폭 468.6과는 산술적으로 맞지 않는다(1387 − 50 − 370 = 967 ≠ 468.6). **따라서 최대 폭은 main의 min-width에서 파생된 값이 아니다.**

---

## 5. Persistence

### 5.1 저장소

| 저장소 | 키 | 값 | 의미 |
|---|---|---|---|
| **localStorage** | `<account>/leftListWidth` | `"240"` → `"298"` → `"213"` → `"240"` | **사이드바 폭** |
| **localStorage** | `<account>/isLeftListHide` | `"true"` / `"false"` | **접힘 여부** |
| localStorage | `<account>/sidebarCollapseStatus` | `{"project-private":0}` | 섹션 접힘(§C03 영역) |
| localStorage | `<account>/projectGroupOpenStatus` | — | 폴더 열림(§C04 영역) |
| cookie | — | `width` 관련 없음 | |
| sessionStorage | — | 관련 키 없음 | |
| IndexedDB | `localdatabase` 1개 | 폭 관련 확인 안 함 | |

키 앞의 `<account>`는 계정 이메일 문자열이다(실제 값은 문서에 옮기지 않는다). **값은 직접 수정하지 않았다.**

### 5.2 지속 범위 — 실측

| 시나리오 | 결과 |
|---|---|
| 드래그 직후 | **즉시 저장됨.** mouseup 시점에 `leftListWidth`가 새 값으로 갱신 |
| 다른 리스트/뷰로 이동 | **유지** |
| **collapse → expand** | **유지.** 접을 때 `leftListWidth`는 그대로(213) 남고 `isLeftListHide`만 true가 된다. 펼치면 213으로 정확히 복귀 |
| **페이지 새로고침** | **유지.** 새로고침 후 인라인 `width: 298px`이 그대로 복원됐고 `leftListWidth`도 `"298"` |
| 새로고침 시 뷰포트가 763→1387로 커졌을 때 | 사이드바는 **298 그대로** — 뷰포트에 맞춰 재계산하지 않는다 |

**[Observed] 폭과 접힘은 서로 독립된 두 키로 저장된다.** 그래서 접었다 펴도 사용자가 정한 폭이 보존된다.

**[Observed] 복원 타이밍**: 새로고침 직후 첫 측정(약 5초 후)에 이미 인라인 style로 적용돼 있었다. 기본값 렌더 후 교체되는 깜빡임이 있는지는 **측정하지 못했다**(백그라운드 탭이라 초기 프레임을 잡을 수 없다).

---

## 6. Collapse Control

| 항목 | 값 |
|---|---|
| 요소 | **`BUTTON#left-menu-t.left-menu-t`** |
| **위치** | **본문(main content) 헤더 `.tl-bar` 안.** 사이드바에도, Global Rail에도, divider에도 **없다** |
| 좌표 | 20 × 20 @ (283, 22) — 본문 좌측 상단, 프로젝트 이름 왼쪽 |
| 보유 속성 | `type`, `id`, `class` — **그 외 없음** |
| **accessible name** | **없음** (텍스트 없음, `aria-label` 없음, `title` 없음) |
| aria-expanded / aria-controls | **없음** |
| icon | 스프라이트. **펼침 상태 `#sidebar-collapse` ↔ 접힘 상태 `#sidebar-expand`** (아이콘 교체) |
| icon 크기 | svg 20 × 20 |
| color | `rgb(255,255,255)` |
| tabIndex | **0** |
| tooltip | 확인 못 함 (hover 툴팁을 잡지 못함) |
| 키보드 활성화 | **미확정** — §18 참조 |

**[Observed] 접기 버튼이 사이드바 밖(본문 헤더)에 있다.** 그래서 사이드바가 접힌 뒤에도 같은 버튼이 그대로 남아 펼치기 역할을 한다(위치만 x=283 → x=70으로, 본문이 왼쪽으로 밀린 만큼 함께 이동).

---

## 7. Expanded → Collapsed 전환

### 7.1 상태 비교 (viewport 1387, 접기 직전 폭 213)

| Property | **Expanded** | **Collapsed** |
|---|---|---|
| sidebar 컨테이너 width | 213 | **0** (인라인 `width: 0px`) |
| sidebar 컨테이너 x / right | 50 / 263 | 50 / **50** |
| global rail width | **50** | **50 (불변)** |
| main content x | 263 | **50** |
| main content width | 1124 | **1337** |
| main header(`.tl-bar`) x | 263 | **50** |
| **내부 패널 DOM** | 존재 | **존재 (제거되지 않음)** |
| 내부 패널 인라인 style | `width:213px; visibility:visible; left:0px;` | **`width:213px; visibility:hidden; left:-213px;`** |
| 내부 패널 실제 위치 | x 50 – 263 | **x −163 – 50** (화면 밖) |
| `.lists` visibility | visible | **hidden** |
| `.lists` display | flex | **flex (none 아님)** |
| `.lists` transform | none | **none** |
| `.lists` margin-left | 0 | **0** |
| 사이드바 행 DOM 개수 | 15 | **15 (그대로 렌더돼 있음)** |
| dragger | x 258 – 263 | **x 45 – 50 (여전히 존재)** |
| body 클래스 | `… list-show` | `list-show` 제거 |
| localStorage | `isLeftListHide: false` | **`true`** |

### 7.2 다섯 가지 후보 중 무엇인가

| 후보 | 판정 |
|---|---|
| A. sidebar width = 0 | **✔ 부분적으로 맞다** — 바깥 컨테이너가 0이 되어 본문이 리플로우된다 |
| B. DOM `display: none` | ✘ — `display: flex` 유지 |
| C. transform으로 화면 밖 이동 | **✔ 부분적으로 맞다** — 단 `transform`이 아니라 **`left: -213px`** |
| D. 별도 compact sidebar로 교체 | ✘ — 교체 없음 |
| E. Global Rail만 남음 | **✔ 결과적으로 그렇다** — 화면에는 Rail(50px)만 남는다 |

**[Observed] 실제 메커니즘은 A + C의 조합이다.**

```
바깥 컨테이너(.g-left)  : width 213 → 0        ← 본문이 그만큼 넓어짐 (레이아웃)
안쪽 패널               : width 213 유지
                          left  0 → -213       ← 자기 폭만큼 왼쪽으로 (시각)
                          visibility → hidden  ← 잔상/포커스 차단
DOM                     : 그대로 유지 (행 15개 모두 남아 있음)
```

**[Inference]** 폭을 유지한 채 왼쪽으로 밀어내는 것은 **펼칠 때 되돌릴 값을 DOM에 그대로 들고 있기 위한** 구조로 보인다. 실제로 펼치면 `left: 0` + `visibility: visible`만 되돌리면 되고, 폭 213이 그대로 복귀했다. `visibility: hidden`을 함께 건 것은 화면 밖 요소가 포커스·검색 대상이 되는 것을 막기 위한 처리로 보인다.

---

## 8. Collapse Animation

| 측정 | 결과 |
|---|---|
| 클릭 직후 `document.getAnimations()` | 실행 중 **1개** — `DIV.h-full w-full flex items-cen`, duration 1500ms. **클릭 전에도 있던 것**(Rail의 동기화 인디케이터로 추정)이며 사이드바와 무관 |
| 클릭으로 **새로 생성된 애니메이션** | **0개** |
| 바깥 컨테이너 transition | **인라인 `transition: none`** → computed `none / 0s` |
| 내부 패널 transition | **인라인 `transition: none`** → computed `none / 0s` |
| `.lists` 클래스 | `duration-200 ease-in-out` 보유 |
| `.lists` computed transition | **`margin / 0.2s / cubic-bezier(0.4, 0, 0.2, 1)`** |
| `.lists`의 실제 margin | 접힘 전 `0px` → 접힘 후 **`0px` (변하지 않음)** |
| width / transform / opacity transition | **없음** |

**[Observed] 접기/펼치기는 애니메이션 없이 즉시 일어난다.** 폭을 바꾸는 두 요소 모두 **인라인 `transition: none`**이 걸려 있어, 클래스로 선언된 200ms 전환을 덮어쓴다.

**[Observed] `.lists`에 선언된 `margin 0.2s` 전환은 이 경로에서 사용되지 않는다.** margin이 처음부터 끝까지 0이다.

**[Inference]** `duration-200 ease-in-out` 클래스와 `transition-property: margin`은 다른(또는 과거의) collapse 구현의 잔재로 보인다. 현재 경로는 `left`와 `width`를 즉시 바꾼다.

**측정 한계**: 백그라운드 탭이라 프레임 단위 샘플링이 불가능했다. 위 판정은 `getAnimations()`(새 애니메이션 0개)와 두 요소의 인라인 `transition: none`이라는 두 독립 근거에 기반한다.

---

## 9. Main Content Reflow

| 항목 | 실측 |
|---|---|
| 레이아웃 방식 | 부모 `display: flex`. 사이드바 `flex: 0 0 auto` + 인라인 width, 본문 `flex: 1 1 0%` |
| 폭 교환 | **정확히 1:1.** 240→298(+58)일 때 본문 473→415(−58). 213일 때 본문 1124, 0일 때 1337 (vw 1387에서 1387 − 50 − sidebar) |
| 본문 x | **사이드바 우측 끝을 그대로 따라간다** (263 / 290 / 348 / 50) |
| 본문 헤더(`.tl-bar`) | **함께 이동** (본문과 같은 x, 같은 폭) |
| 본문 `min-width` | **370px** (CSS) |
| 본문 자체 `max-width` | 없음 |
| overlay 방식인가 | **아니다.** 사이드바는 흐름 안에 있고 본문을 덮지 않는다 |

**[Observed] 사이드바가 줄어든 만큼 본문이 정확히 늘어난다.** 본문에 별도의 폭 규칙(중앙 정렬, max-width 등)은 없고, 남는 공간을 전부 차지한다.

**[Observed] `main x = rail(50) + sidebar width`** 가 모든 상태에서 성립했다.

---

## 10. Global Rail과 Sidebar 관계

| 항목 | Expanded | Collapsed |
|---|---|---|
| rail width | **50** | **50 (불변)** |
| rail x / right | 0 / 50 | 0 / 50 |
| rail 배경 | `rgb(36,36,36)` | **동일** |
| rail `border-right` | 1px `rgba(255,255,255,0.05)` | **동일** |
| **rail 아이콘 개수** | **10** | **10 (불변)** |
| sidebar x | 50 | 50 (폭 0) |
| rail ↔ sidebar 간격 | 0 | 0 |

**[Observed] 사이드바를 접어도 Global Rail은 전혀 변하지 않는다.** 폭도, 배경도, 아이콘 개수도 같다. **사이드바의 기능이 Rail로 이동하지 않는다.**

**[Observed] 접힌 상태에서 사이드바 기능(리스트 선택 등)에 접근하려면 다시 펼치는 수밖에 없다** — Rail에 대체 진입점이 추가되지 않는다.

**[Inference]** Rail은 앱 전역 내비게이션이고 사이드바는 리스트 뷰 소속이라는 Component 02의 구조적 분리가, collapse 동작에서도 그대로 유지된다.

---

## 11. Compact Mode

허용 범위(213 ~ 468.6) 전 구간에서 다음을 확인했다.

| 항목 | 213 | 240 | 298 | 판정 |
|---|---|---|---|---|
| row label `display` | `block` | `block` | `block` | **숨김 없음** |
| icon slot | 20 × 20, x 72/98 | 동일 | 동일 | **불변** |
| color dot | 8px, 존재 | 동일 | 동일 | **불변** |
| trailing slot | 24px, 존재 | 동일 | 동일 | **불변** |
| count | 존재 | 존재 | 존재 | **불변** |
| section title | `display: block`, x 74 | 동일 | 동일 | **불변** |
| folder 들여쓰기 | 26 (child x 86) | 동일 | 동일 | **불변** |
| tooltip 요소 | 0개 | 0개 | 0개 | **없음** |
| icon-only 모드 | 없음 | 없음 | 없음 | **없음** |

**[Observed] 별도 compact mode는 존재하지 않는다.** 폭이 줄어들면 **오직 라벨 폭만** 줄어들고, 그 외 모든 요소는 고정 크기·고정 위치를 유지한다. threshold도 없다.

**[Inference]** 최소 폭을 213으로 잡은 것 자체가 compact mode를 불필요하게 만드는 장치로 보인다. 213에서도 root 라벨이 106px 남아 있어 icon-only로 전환할 이유가 없다.

---

## 12. Auto Collapse / Responsive Breakpoint

**미측정.** viewport를 제어할 수 없었다.

- `resize_window`는 성공을 보고하지만 CSS 뷰포트가 바뀌지 않는다(Component 02·04와 동일한 제약).
- 이번 회차에 관찰된 뷰포트는 **763**과 **1387** 두 지점뿐이고, 둘 다 새로고침에 의해 우연히 바뀐 것이다.

**두 지점에서 확인된 사실**: 763 → 1387로 뷰포트가 **82% 커지는 동안** 사이드바는 새로고침 전후로 **298 그대로**였고 자동 collapse도, 자동 재계산도 일어나지 않았다.

따라서 auto-collapse breakpoint의 존재 여부·위치는 **확인하지 못했다.**

---

## 13. Mobile / Narrow Layout

**미측정.** §12와 같은 이유다.

접힌 상태에서 overlay 관련 흔적만 확인했다: `.lists`는 `position: absolute`이지만 `z-index: auto`이고, 사이드바 전용 backdrop/mask 요소는 없으며, `body { overflow: hidden }`은 앱 셸의 기본값이라 collapse와 무관하게 항상 같다. **즉 데스크톱 폭에서는 drawer/overlay 방식이 아니다.** 더 좁은 폭에서 달라지는지는 확인할 수 없었다.

---

## 14. Overflow / Label Truncation

| 항목 | 213 | 240 | 298 |
|---|---|---|---|
| root label 폭 | **106** | 133 | 191 |
| child label 폭 | **80** | 107 | 165 |
| folder label 폭 | **118** | 145 | 203 |
| trailing slot 폭 | **24** | **24** | **24** |
| trailing slot 우측 오프셋 | sidebar right − 23 | 동일 | 동일 |
| count 가시성 | 유지 | 유지 | 유지 |
| action 가시성 규칙 | hover/focus (불변) | 동일 | 동일 |
| folder depth 오프셋 | 26 | 26 | 26 |
| section title x | 74 | 74 | 74 |
| icon 위치 | 72 / 98 | 동일 | 동일 |

**[Observed] Component 01에서 확인한 24px 트레일링 슬롯이 최소 폭에서도 그대로 유지된다.** 좁아질 때 희생되는 것은 라벨뿐이다.

**[Observed] 최악의 경우 라벨 폭은 80px** — depth 1 자식 리스트, 사이드바 최소 폭 213일 때. 14px 한글 기준 약 5자, 라틴 약 13자다. (Component 04에서 만든 긴 이름 리스트는 이 폭에서 말줄임된다.)

사용 가능 폭 공식(Component 04 §22에서 도출, 이번에 세 폭에서 재확인):

```
label width = sidebar width − 47(우측 고정분) − 좌측 오프셋
  root   : sidebar − 107   (213→106, 240→133, 298→191)
  child  : sidebar − 133   (213→ 80, 240→107, 298→165)
  folder : sidebar − 95    (213→118, 240→145, 298→203)
```

---

## 15. Resize 중 Live Behavior

| 항목 | 실측 |
|---|---|
| 폭 갱신 시점 | **mousemove마다 즉시.** mouseup까지 기다리지 않는다 |
| 증거 | 한 번의 드래그 안에서 320→270, 280→230, 240→213(클램프), 그리고 확대 시 300→250, 400→350, 500→450으로 **매 이동마다 값이 갱신**됨 |
| main content x | **함께 즉시 갱신** (300/400/500 → mainX 300/400/500) |
| 클램프 적용 | **드래그 중에 즉시** (213·468.6에서 그 자리에서 멈춤) |
| snap | **없음** — mouseup 시 별도 보정이 일어나지 않았다 |
| localStorage 기록 | mouseup 후 값이 반영됨 |
| 라벨 truncation | 폭 갱신과 같은 프레임에 함께 반영 |
| scrollbar / popover 위치 | **미측정** |

**[Observed] live resize다.** 드래그 프레임마다 레이아웃이 갱신되고, 끝난 뒤 snap하지 않는다.

**측정 한계**: 백그라운드 탭이라 rAF 기준 프레임 관찰은 못 했다. 위는 이벤트 단위(mousemove 1회 = 갱신 1회) 관찰이다.

---

## 16. Pointer Interaction

| 항목 | 실측 |
|---|---|
| cursor | 핸들 위에서 **`ew-resize`**. 인라인 `style="cursor: ew-resize"`로 **항상** 지정돼 있다(hover 시 바뀌는 게 아니다) |
| hover hitbox | **5 × 사이드바 높이** |
| **hover 시 시각 변화** | **없음.** 실제로 hover해서 확인 — 배경 `rgba(0,0,0,0)` 유지, opacity 1 유지, `.lists`의 1px 경계선 색·두께 불변, body cursor `auto` 유지 |
| mouse down 상태 | 별도 클래스·색 변화 관찰되지 않음 |
| drag threshold | **없는 것으로 보인다** — 첫 mousemove부터 폭이 갱신됨 |
| pointer capture | **확인 못 함** (`setPointerCapture` 호출 여부를 관찰할 수단이 없었다) |
| 이벤트 처리 위치 | `pointerdown`/`mousedown`은 **핸들 자신**에 전달해야 동작했고, `mousemove`/`mouseup`은 **`document`**에 전달했을 때 동작했다 → **핸들에서 시작, 문서 레벨에서 추적**하는 표준 패턴으로 보인다 |

**[Observed] resize 핸들은 hover에서 아무 시각 피드백도 주지 않는다.** 유일한 단서는 커서 모양이다.

---

## 17. Double-click / Context Menu

| 조작 | 결과 |
|---|---|
| 핸들 **더블클릭** (실제 마우스) | **아무 일도 없음.** 폭 213 그대로, 기본 폭 복귀 없음, 최대/최소화 없음 |
| 더블클릭 후 컨텍스트 메뉴 | **0개** |

**[Observed] 더블클릭에 리셋 기능이 없다.** 사용자가 폭을 잘못 조절하면 기본값으로 되돌릴 UI 수단이 없다(직접 드래그해서 맞추는 수밖에 없다).

---

## 18. Keyboard Accessibility

| 항목 | resize handle | collapse button |
|---|---|---|
| Tab 포커스 | **불가** (`tabIndex: -1`) | tabIndex **0** |
| Arrow 키 resize | **불가** (포커스 자체가 안 됨) | 해당 없음 |
| Enter / Space 활성화 | 해당 없음 | **미확정** (아래) |
| `role="separator"` | **없음** | — |
| `aria-orientation` | **없음** | — |
| `aria-valuemin` / `max` / `now` | **없음** | — |
| `aria-expanded` | — | **없음** |
| `aria-controls` | — | **없음** |
| `aria-label` / accessible name | **없음** | **없음** |

**[Observed] resize는 키보드로 전혀 불가능하다.** 핸들은 포커스도 받지 못하고 어떤 ARIA 슬라이더/separator 시맨틱도 없다.

**collapse 버튼의 키보드 활성화는 확정하지 못했다.** 이유를 정직하게 적는다: Tab 순서를 추적하려다 Rail의 계정 아바타에 포커스가 들어가 Enter로 계정 메뉴가 열렸고(Escape로 닫음), 그 메뉴가 포커스를 잡고 있어 이후 `focus()` 호출이 먹지 않았다. 다만 **프로그램 `click()`으로는 정상 동작**하는 것을 확인했으므로 핸들러는 click 이벤트에 걸려 있다. 네이티브 `<button>`이므로 포커스만 정상적으로 가면 Enter/Space가 동작할 가능성이 높지만, **관찰로 확정하지 않는다.**

---

## 19. CSS / Layout Architecture

```
DIV.flex.h-full.overflow-hidden                        display: flex
├ DIV.g-left.flex-none            (Rail 래퍼)          width 50 (유틸리티 w-[50px])
│   └ DIV.sidebar_2byOi                                bg rgb(36,36,36)
└ DIV.flex.flex-auto.overflow-hidden
    └ DIV.listViewContainer > DIV.listViewWrapper
        └ DIV.flex.flex-auto.relative                  display: flex
            ├ DIV.g-left                ← SIDEBAR      flex: 0 0 auto
            │     style="width: 240px; transition: none;"        ← 인라인
            │   ├ DIV(내부 패널)  position: absolute
            │   │     style="width: 240px; visibility: visible; left: 0px; transition: none;"
            │   │   └ DIV.lists   position: absolute, border-right 1px
            │   └ DIV.detail-dragger  absolute right-0 w-[5px] z-[2]
            │         style="cursor: ew-resize;"
            └ DIV.tasklist              ← MAIN         flex: 1 1 0%, min-width: 370px
```

**[Observed] flexbox 기반이다.** CSS Grid도, `--sidebar-width` 같은 custom property도 **쓰지 않는다.** 폭은 오직 **인라인 style**로 두 곳(바깥 컨테이너, 내부 패널)에 동시에 기록된다.

---

## 20. Width Source 추적

```
사용자 드래그
   ↓
JS 드래그 핸들러:  width = clamp(213, clientX − 50, 468.6)
   ↓  (mousemove마다)
인라인 style 2곳에 동시 기록
   ├ DIV.g-left        style="width: {W}px; transition: none;"     ← 레이아웃(본문 리플로우)
   └ 내부 패널          style="width: {W}px; left: 0px; …"          ← 시각
   ↓  (mouseup)
localStorage["<account>/leftListWidth"] = "{W}"
   ↓  (다음 로드 / 새로고침)
같은 인라인 style로 복원

접기:
   버튼 click → localStorage["<account>/isLeftListHide"] = "true"
             → 바깥 컨테이너 width: 0px      (본문이 왼쪽으로 리플로우)
             → 내부 패널 left: -{W}px; visibility: hidden   (폭 {W}는 보존)
             → body에서 'list-show' 클래스 제거
```

| 분류 | 해당 값 |
|---|---|
| A. CSS custom property | **없음** — 폭에 관여하는 custom property는 하나도 없다 |
| B. inline style | **width(2곳), left, visibility, transition:none, cursor** ← 폭의 실질적 출처 |
| C. Tailwind utility | rail `w-[50px]`, 핸들 `w-[5px]`, `right-0`, `z-[2]`, `.lists`의 `duration-200 ease-in-out`(미사용) |
| D. stylesheet rule | 본문 `min-width: 370px`, `.lists` `border-right` |
| E. JS runtime 계산 | **클램프(213 / 468.6)와 `clientX − 50` 공식** |
| F. persisted preference | `leftListWidth`, `isLeftListHide` (localStorage) |

**[Observed] `data-*` 속성은 폭·접힘 어디에도 관여하지 않는다.** 상태는 인라인 style과 body 클래스(`list-show`)로만 표현된다.

---

## 21. Divider / Shadow / Boundary

| 상태 | 경계 표현 |
|---|---|
| Expanded (240) | `.lists` `border-right: 1px rgba(255,255,255,0.06)` |
| Expanded (213 / 298) | **동일** |
| **Resize hover** | **변화 없음** — 두께·색·배경 전부 동일 |
| **Resize dragging** | 별도 강조 클래스·색 변화 관찰되지 않음 |
| Collapsed | `.lists`가 화면 밖으로 나가므로 사이드바 경계선은 보이지 않고, **Rail의 `border-right: 1px rgba(255,255,255,0.05)`만 남는다** |
| box-shadow | **모든 상태에서 `none`** |

**[Observed] 경계 강조가 전혀 없다.** hover에도, 드래그 중에도 1px 하이라인이 그대로다.

**[Inference]** Component 02~04에서 반복 확인된 "그림자 없음 + 1px 하이라인 + 즉시 전환" 기조가 resize에도 그대로 적용된 것으로 보인다. 다만 드래그 중 피드백이 커서뿐이라는 점은 발견성 측면에서 약하다.

---

## 22. Dark Theme Token

Component 02에서 확인한 것과 **동일**했다. 차이만 적는다.

| 항목 | 값 | C02 대비 |
|---|---|---|
| rail surface | `rgb(36,36,36)` (`--color-left-sidebar-bg-color`) | 동일 |
| sidebar surface | 자체 배경 없음 → `rgb(28,28,28)` | 동일 |
| main surface | `rgb(28,28,28)` (`--color-screen-background`) | 동일 |
| sidebar → main divider | 1px `rgba(255,255,255,0.06)` | 동일 |
| rail → sidebar divider | 1px `rgba(255,255,255,0.05)` | 동일 |
| **resize hover** | **전용 토큰 없음** (hover 표현 자체가 없음) | **신규 확인** |
| **collapsed 상태의 신규 색** | **없음** | **신규 확인** |

---

## 23. State Matrix

viewport 1387 기준(298 상태만 viewport 763에서 측정).

| State | sidebar W | main x | main W | divider x | rail W | label 동작 | transition |
|---|---|---|---|---|---|---|---|
| **Expanded default** | **240** | 290 | 1097 | 289–290 | 50 | root 133 / child 107 | 없음 |
| **Expanded narrow (min)** | **213** | 263 | 1124 | 262–263 | 50 | root 106 / child 80 | 없음 |
| **Expanded wide** | **298** | 348 | 415 (vw 763) | 347–348 | 50 | root 191 / child 165 | 없음 |
| **Expanded max** | **468.6** | 518.6 | 868.4 | 517.6–518.6 | 50 | 미측정 | 없음 |
| **Resize hover** | 변화 없음 | — | — | 변화 없음 | 50 | — | 없음 |
| **Resize dragging** | 실시간 갱신 | 실시간 | 실시간 | 실시간 | 50 | 실시간 말줄임 | 없음 |
| **Collapsed** | **0** | **50** | **1337** | 없음(Rail 경계만) | **50** | DOM 유지·화면 밖 | 없음 |
| Narrow viewport | **미측정** | | | | | | |
| Auto-collapsed | **미측정 / 존재 여부 불명** | | | | | | |

스크롤 동작은 전 상태에서 Component 02의 구조(내부 `.antiscroll-inner`만 스크롤, 오버레이 스크롤바) 그대로였고, 이번 회차에서 달라진 점은 관찰되지 않았다.

---

## 24. Geometry Diagram (실측값, viewport 1387)

```
EXPANDED (default 240)
┌──────────┬────────────────────────┬───────────────────────────────────┐
│ Rail 50  │  Sidebar 240           │  Main content 1097                │
│ x 0–50   │  x 50–290              │  x 290–1387                       │
└──────────┴────────────────────────┴───────────────────────────────────┘
            ▲                      ▲
            │                      └ dragger x 285–290 (5px, ew-resize)
            └ rail border-right 1px  visible divider x 289–290 (1px)

EXPANDED (min 213)                        EXPANDED (max 468.6)
┌────────┬──────────────┬──────────┐      ┌────────┬───────────────────────┬────────┐
│Rail 50 │ Sidebar 213  │ Main 1124│      │Rail 50 │ Sidebar 468.6         │Main 868│
│ 0–50   │ 50–263       │ 263–1387 │      │ 0–50   │ 50–518.6              │518.6–  │
└────────┴──────────────┴──────────┘      └────────┴───────────────────────┴────────┘

COLLAPSED
┌──────────┬─────────────────────────────────────────────────────────────┐
│ Rail 50  │  Main content 1337                                          │
│ x 0–50   │  x 50–1387                                                  │
└──────────┴─────────────────────────────────────────────────────────────┘
   sidebar 컨테이너 width 0 (x 50, right 50)
   내부 패널은 DOM에 남아 x −163 … 50 에 위치, visibility: hidden

RESIZE HANDLE 단면 (폭 240 기준)
        x=285          x=289  x=290
          │              │      │
          ├─ drag hit area 5px ─┤
                         ├ 1px ─┤  visible divider (.lists border-right)
          ▲
          └ hover해도 시각 변화 없음. 단서는 cursor: ew-resize 뿐

폭 결정 공식:  width = clamp(213, pointerClientX − 50, 468.6)
                                              └ 50 = Rail 폭 = sidebar 좌측 x
```

---

## 25. Observed vs Inference

### 25.1 [Observed]

1. resize 핸들은 **5px `.detail-dragger`**, 보이는 divider는 **1px `.lists` border-right** — **서로 다른 요소**다.
2. 드래그 중 폭은 **`pointerClientX − 50`** (50 = Rail 폭). 집은 위치에 대한 오프셋 보정이 없다.
3. **최소 213px, 최대 468.6px**에서 클램프된다. 클램프는 **CSS가 아니라 JS**에 있다(사이드바의 `min-width: auto`, `max-width: none`).
4. 폭 변화는 **라벨이 100% 흡수**한다. 아이콘·도트·트레일링 슬롯·들여쓰기는 1px도 변하지 않는다.
5. 오른쪽 정보 rail은 **사이드바 우측 끝 기준 고정 오프셋**(−1 / −11 / −23 / −47)을 세 폭에서 동일하게 유지한다.
6. **live resize다.** mousemove마다 폭·본문 x·말줄임이 함께 갱신되고 mouseup에 snap이 없다.
7. **collapse는 A + C 조합**: 바깥 컨테이너 `width: 0`(레이아웃) + 내부 패널 `left: -{W}` & `visibility: hidden`(시각). **DOM은 유지**되고 행 15개가 그대로 남는다.
8. **접기/펼치기에 애니메이션이 없다.** 새 애니메이션 0개이고, 두 요소에 인라인 `transition: none`이 걸려 있다. `.lists`의 `margin 0.2s` 선언은 이 경로에서 사용되지 않는다.
9. 사이드바가 줄어든 만큼 본문이 **정확히 1:1로** 늘어난다. `main x = 50 + sidebar width`가 모든 상태에서 성립.
10. **Rail은 collapse에 전혀 반응하지 않는다** — 폭·배경·아이콘 10개 그대로. 사이드바 기능이 Rail로 이동하지 않는다.
11. **compact mode가 없다.** 213~468.6 전 구간에서 라벨 숨김·icon-only·툴팁이 관찰되지 않았다.
12. persistence는 **localStorage 두 키**(`leftListWidth`, `isLeftListHide`)이며 **새로고침·collapse/expand를 모두 넘어 유지**된다. 폭과 접힘이 분리 저장돼, 접었다 펴도 폭이 보존된다.
13. collapse 컨트롤은 **본문 헤더**에 있는 20×20 버튼이고, 아이콘이 `#sidebar-collapse` ↔ `#sidebar-expand`로 교체된다. **accessible name과 `aria-expanded`가 없다.**
14. **핸들 더블클릭에 기본 폭 복귀 기능이 없고**, 컨텍스트 메뉴도 없다.
15. **핸들은 hover/drag에서 아무 시각 피드백도 주지 않는다.** 단서는 커서뿐이다.
16. **키보드로 resize가 불가능하다.** 핸들 `tabIndex: -1`, `role="separator"`·`aria-value*` 전무.
17. 레이아웃은 **flexbox**이고, 폭에 관여하는 **CSS custom property는 하나도 없다.** 인라인 style 2곳에 동시 기록된다.
18. 최소 폭에서 최악의 라벨 폭은 **80px**(depth 1 자식).

### 25.2 [Inference]

1. 내부 패널이 폭을 유지한 채 자기 폭만큼 왼쪽으로 밀려나는 것은, **펼칠 때 되돌릴 값을 DOM에 들고 있기 위한** 구조로 보인다. 실제로 복귀가 정확했다.
2. `visibility: hidden`을 함께 건 것은 화면 밖 요소가 포커스/검색 대상이 되는 것을 막기 위한 처리로 보인다.
3. 최소 폭 213은 **compact mode를 불필요하게 만드는 하한**으로 읽힌다. 그 폭에서도 root 라벨이 106px 남는다.
4. `.lists`의 `duration-200 ease-in-out` + `transition-property: margin`은 **현재 경로에서 쓰이지 않는 잔재**로 보인다.
5. 커서 외에 아무 피드백이 없는 5px 핸들은 Component 02~04에서 반복된 "그림자 없음 · 즉시 전환" 기조와 일관되지만, **발견성 측면에서는 약한 선택**으로 보인다.
6. 폭을 인라인 style 2곳에 중복 기록하는 것은, 하나는 레이아웃(본문 리플로우)용, 하나는 시각(패널 자체)용으로 **역할이 다르기 때문**으로 보인다.

### 25.3 이번 회차에 재지 못한 것

- **§12 responsive breakpoint / §13 mobile drawer** — viewport를 제어할 수 없어 전혀 측정 못 함.
- **최대 폭 468.6의 성격** — 고정 px인지 뷰포트 비율인지 구분 불가(뷰포트 고정).
- **collapse 버튼의 Enter/Space** — 포커스를 다른 요소(계정 메뉴)에 빼앗겨 확정 못 함. `click()` 동작은 확인.
- **pointer capture 사용 여부**, **tooltip 유무**.
- **resize 중 popover/scrollbar 위치** 갱신.
- **폭 복원 시 초기 깜빡임 유무** — 백그라운드 탭이라 첫 프레임을 잡을 수 없음.
- **프레임 단위 애니메이션 관찰** — rAF가 백그라운드 탭에서 멈춤.
- **라이트 테마**, **원본 CSS 규칙**(CORS) — Component 01~04와 동일한 제약.

---

## 26. Fidelity Specification

관찰된 TickTick 동작만 적는다. 개선안은 Appendix A.

```
SIDEBAR RESIZE / COLLAPSE

Expanded
  default width       : 240px (사용자가 마지막으로 설정한 값이 복원됨)
  min width           : 213px
  max width           : 468.6px (viewport 1387에서 측정. 고정값인지 비율인지 미확정)
  rail width          : 50px (모든 상태에서 불변)
  main offset         : main x = 50 + sidebar width
  layout              : flexbox. sidebar flex 0 0 auto + 인라인 width,
                        main flex 1 1 0% + min-width 370px
  폭 토큰             : 없음 (CSS custom property 미사용)

Resize Handle
  visible divider     : 1px, 전경색 6% 알파 (.lists의 border-right)
  hit area            : 5px, absolute right-0, z-index 2
                        보이는 선보다 왼쪽으로 4px 더 넓다
  cursor              : ew-resize (인라인 style로 상시 지정)
  hover               : 시각 변화 없음
  active/drag         : 시각 변화 없음
  포커스              : 불가 (tabindex -1)
  ARIA                : 없음 (role="separator", aria-value* 전무)

Resize Behavior
  공식                : width = clamp(min, pointerClientX − railWidth, max)
  live/snap           : live. mousemove마다 갱신, mouseup에 snap 없음
  클램프 위치         : JS (CSS에는 min/max-width 없음)
  전환                : 없음 (인라인 transition: none)
  더블클릭            : 동작 없음 (기본 폭 복귀 없음)
  컨텍스트 메뉴       : 없음
  키보드              : 불가
  폭이 흡수되는 곳    : 라벨 폭만. 아이콘·도트·트레일링·들여쓰기는 불변
  우측 정렬 기준      : sidebar right − 23 (트레일링 우측), −47 (트레일링 좌측)

Collapsed
  sidebar DOM         : 유지 (제거·display:none 아님). 행도 그대로 렌더됨
  바깥 컨테이너       : width 0  → 본문이 그만큼 리플로우
  내부 패널           : width 유지, left = −width, visibility: hidden
  rail behavior       : 완전 불변 (폭·배경·아이콘 개수 모두 동일)
                        사이드바 기능이 rail로 이동하지 않음
  main behavior       : x → rail 우측(50), width → viewport − rail
                        본문 헤더도 함께 이동
  전환                : 없음 (즉시)
  control             : 본문 헤더의 20×20 버튼.
                        아이콘 #sidebar-collapse ↔ #sidebar-expand 교체
                        accessible name 없음, aria-expanded 없음

Responsive
  breakpoint          : 미측정
  auto collapse       : 미측정 (존재 여부 불명)
  overlay mode        : 데스크톱 폭에서는 없음 (사이드바는 흐름 안, backdrop 없음)
  compact mode        : 없음. 허용 폭 전 구간에서 라벨만 줄어든다

Persistence
  storage             : localStorage
  key                 : <account>/leftListWidth   (폭, 숫자 문자열)
                        <account>/isLeftListHide  ("true" / "false")
  기록 시점           : 폭은 드래그 종료 시, 접힘은 토글 시
  restore timing      : 페이지 로드 시 인라인 style로 복원
  범위                : 뷰 이동 · collapse/expand · 새로고침 모두 유지
                        폭과 접힘이 분리 저장되어 접었다 펴도 폭 보존
```

---

## 27. Component 01~05 Candidate Shared Rules

**2개 이상 컴포넌트에서 반복 확인된 것만.** 아직 Design Token으로 확정하지 않는다.

| 후보 규칙 | 01 | 02 | 03 | 04 | 05 | 상태 |
|---|---|---|---|---|---|---|
| **전경색 1개(흰색) × 알파로 위계** | ✔ | ✔ | ✔ | ✔ | ✔ | **5/5** |
| **그림자 없음** | ✔ | ✔ | ✔ | ✔ | ✔ | **5/5** |
| **transition 없음(즉시 전환)** | ✔ | ✔(스크롤바 0.3s만 예외) | ✔ | ✔ | ✔ | **5/5** |
| **Rail 폭 50, 사이드바와 간격 0** | — | ✔ | — | — | ✔ | **2/2** |
| **경계는 1px 하이라인, 강조 없음** | — | ✔ | — | — | ✔ | **2/2** |
| **오른쪽 정보 rail 고정 정렬** | ✔ | — | ✔ | ✔ | ✔ | **4/4** |
| **바깥 gutter 10px** | ✔ | — | ✔ | ✔ | (불변 확인) | **3/3** |
| **hover 배경 = 전경색 3%** | ✔ | — | ✔ | ✔ | — | **3/3** |
| **selected 배경 = 전경색 8%** | ✔ | — | — | ✔ | — | **2/2** |
| **row height 36 / pitch 38** | ✔ | ✔ | — | ✔ | — | **3/3** |
| **액션 hit area 16×16** | ✔ | — | ✔ | ✔ | — | **3/3** |
| **focus ring `auto 1px` accent** | ✔ | — | ✔ | ✔ | — | **3/3** |
| **좁은 컨트롤을 absolute로 겹쳐 배치** | ✔ | — | ✔ | ✔ | — | **3/3** |
| **aria 사실상 없음 / accessible name 없는 아이콘 버튼** | ✔ | — | ✔ | ✔ | ✔ | **4/4** |
| **치수는 토큰이 아니다** | ✔ | ✔ | 부분 반례 | ✔ | ✔ (custom property 0개) | **4.5/5** |
| **상태는 클래스/인라인 style, `data-*`는 style hook 아님** | ✔ | — | ✔ | ✔ | ✔ | **4/4** |
| **폭이 줄면 라벨만 희생** | — | — | — | ✔(depth) | ✔(resize) | **2/2** |

### 27.1 spacing grid — 여전히 유보

05에서 새로 나온 값: **5**(핸들), **50**(rail), **213**, **370**, **468.6**.
**5는 홀수다** — 네 컴포넌트에 걸쳐 처음 나온 홀수 치수이며, "모든 값이 짝수"라는 Component 01의 관찰을 깬다. 468.6은 아예 정수가 아니다(런타임 계산값).

→ **"2px 격자, 4배수 선호"조차 이제 예외를 갖는다.** 8pt 그리드는 여전히 지지되지 않고, **디자인 시스템으로 확정하지 않는다.**

### 27.2 Conflict / Revision Candidate

기존 문서는 수정하지 않고 후보만 기록한다. (Component 04의 R-1~R-5에 이어 번호를 잇는다.)

| # | 기존 서술 | 05의 관찰 | 성격 |
|---|---|---|---|
| **R-6** | **C02 §7.3** — collapse는 `margin`으로 구현돼 있고 "`margin-left`를 −240px로 보내 밀어내는 방식일 가능성이 높다"고 추론 | **틀렸다.** collapse는 바깥 컨테이너 `width: 0` + 내부 패널 `left: -{W}` + `visibility: hidden`이고, **margin은 처음부터 끝까지 0**이다 | **정정.** C02의 추론을 실측이 반증했다 |
| **R-7** | **C02 §7.3** — `.lists`의 `transition: margin 0.2s cubic-bezier(0.4,0,0.2,1)`를 collapse 애니메이션으로 해석 | 선언은 지금도 존재하지만 **이 경로에서 사용되지 않는다.** 두 요소에 인라인 `transition: none`이 걸려 접기는 **즉시** 일어난다 | **정정.** "200ms 애니메이션"이라는 인상은 사실이 아니다 |
| **R-8** | **C02 §7.2** — 사이드바 폭 240은 "사용자가 정하는 값", min/max는 "미측정" | **min 213 / max 468.6 측정 완료.** 클램프는 JS, 저장은 localStorage | **보강** |
| **C01 §8.2 / C03 §8.2** — 관찰된 모든 치수가 짝수 | 핸들 폭 **5px**(홀수), 최대 폭 **468.6**(비정수) | **보강/약화.** 격자 가설의 예외 |
| **C02 §3** — "그림자·강조 없음" | resize hover/drag에서도 **강조 없음** | **강화** (충돌 아님) |

---

## Appendix A — 우리 앱에 적용할 때 다르게 할 것 (관찰이 아닌 제안)

**아래는 TickTick 동작이 아니다.**

1. **핸들에 hover/drag 피드백을 준다.** 지금은 커서 외에 아무 단서가 없다. hover에서 1px 선을 전경색 6%→20% 정도로 올리고, 드래그 중에는 accent로 바꾸는 정도면 충분하다.
2. **핸들 히트 영역 5px → 8px 이상.** 5px은 좁다. 시각적 선은 1px을 유지한 채 히트 영역만 넓힌다.
3. **더블클릭 = 기본 폭 복귀**를 넣는다. 지금은 잘못 조절하면 되돌릴 수단이 없다.
4. **collapse 버튼에 이름과 상태를 준다.** `aria-label`(예: "사이드바 접기"/"펼치기")과 `aria-expanded`가 없다. 아이콘만 바뀌므로 보조기술 사용자는 상태를 알 수 없다.
5. **키보드 resize를 지원한다.** 핸들에 `role="separator"` + `aria-orientation="vertical"` + `aria-valuenow/min/max`를 주고 Arrow 키로 8px씩 조절하게 한다. TickTick은 전혀 지원하지 않는다.
6. **폭을 CSS custom property로 노출한다.** TickTick은 인라인 style 2곳에 중복 기록한다. 우리는 이미 `--context-sidebar-w`가 있으므로(`19-app-shell.css`), JS는 그 변수 하나만 갱신하고 레이아웃은 CSS가 읽게 하는 편이 낫다.
7. **접힌 상태의 진입점을 Rail에 남긴다.** TickTick은 접으면 사이드바 기능에 접근할 방법이 사라진다. Rail에 "리스트 열기" 아이콘 하나를 두면 왕복 비용이 준다.
8. **min/max 값의 근거를 정한다.** 213/468.6은 우리가 그대로 베낄 이유가 없다. 우리 라벨 폭 예산(Component 04 §22 공식)에서 역산해 정하는 편이 낫다.

---

## 28. 이 문서가 남긴 상태

| 항목 | 상태 |
|---|---|
| Component 01~04 문서 | **수정하지 않음.** 충돌·보강 후보는 §27.2에만 기록 |
| 우리 앱 코드 | **수정하지 않음** |
| TickTick sidebar width | **240으로 복원** (`leftListWidth = "240"`) |
| TickTick collapsed 상태 | **expanded로 복원** (`isLeftListHide = "false"`) |
| viewport | **복원 실패** — 새로고침으로 763→1387이 되었고 제어 수단이 없다 |
| 앱 화면 | 기본함(`#p/inbox/kanban`), 열린 메뉴 없음 |
| Component 04의 테스트 데이터 | `ZZ Folder` + 리스트 3개 **그대로 유지**(폴더 펼침 상태). 삭제를 원하시면 알려주시면 지운다 |
