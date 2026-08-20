# TickTick 역설계 #01 — Sidebar Navigation / List Row

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 컴포넌트: **좌측 사이드바의 리스트 행 1개** — `리스트` 섹션의 "Fidelity Audit" 행
작성일: 2026-08-20

## 0. 측정 조건

| 항목 | 값 |
|---|---|
| 브라우저 | Chrome (Windows 11), 사용자 로그인 세션 |
| viewport | **800 × 805 CSS px** (`innerWidth/innerHeight`) |
| devicePixelRatio | 1.8 |
| 테마 | **dark** (`body.dark`) |
| 로케일 | ko |
| 측정 방법 | `getBoundingClientRect()` · `getComputedStyle()` · `computedStyleMap()` · 실제 마우스 hover · 실제 Tab 키 |
| 스크린샷 사용 | **측정에 사용하지 않음.** 모든 수치는 DOM API 반환값 |

**판정 규칙**: 아래 모든 수치는 실측이다. 재지 못한 것은 "미측정"이라고 쓴다. `[추론]` 태그가 붙은 문장만 해석이고, 나머지는 관찰이다.

**세션에 가한 변경**: 측정을 위해 (a) 리스트를 한 번 클릭해 선택 상태를 만들었고, (b) 끝나고 원래 보던 `기본함`으로 되돌렸다. (c) cascade 검증을 위해 클래스 1개를 제거했다가 즉시 복구했다. 데이터 변경은 하지 않았다.

**측정 못 한 것**: `:active`(누른 상태). 마우스 다운을 유지한 채 측정할 API가 없었다. 대신 §4-F에 간접 증거를 적었다.

---

## 1. DOM 구조

### 1.1 트리

```
LI.project-list-view-item            239×36   ← 행의 바깥 껍데기. 좌우 10px 패딩만 담당
└ DIV                                219×36   ← 높이 전달용 래퍼 (h-full)
  └ BUTTON[data-selected]            219×36   ← 실제 hit surface. radius 10, flex, 좌우 12px 패딩
    ├ DIV  (icon wrapper)             20×20   ← 아이콘 자리를 고정폭으로 예약, 우측 6px 마진
    │  └ svg
    │     └ use → #normal-list                ← 스프라이트 심볼 참조
    ├ P    (label)                   133×20   ← flex-auto + truncate. 남는 폭을 전부 가져감
    ├ DIV  (color dot)                 8×8    ← 리스트 색 점. 우측 4px 마진
    └ DIV  (trailing slot)            24×16   ← min-width 24, 우측 정렬. 아래 둘이 같은 자리를 공유
       ├ DIV.peer (more button)       16×16   ← absolute right-0, 평소 opacity 0
       │   └ svg → 점 3개 아이콘
       └ P (count "1")               6.5×16   ← 평소 표시, hover 시 display:none
└ DIV.hide (rename overlay)          190×35   ← 인라인 이름편집 오버레이. 평소 숨김
```

요청하신 단순화 형태로:

```
SidebarRow (button)
 ├ Icon        20×20 wrapper / 글리프 13.81×11.03
 ├ Label       flex-auto, truncate
 ├ (Spacer)    ← 별도 요소 없음. Label의 flex-auto가 스페이서 역할을 겸함
 ├ Dot         8×8 (리스트 색)
 └ TrailSlot   24×16  ─┬ Count   (평소)
                       └ More    (hover/focus 시)
```

### 1.2 각 요소의 역할

| 요소 | 역할 | 관찰된 근거 |
|---|---|---|
| `LI` | **여백 담당자.** 자기 자신은 배경도 radius도 없다(`background: rgba(0,0,0,0)`, `radius: 0`). 좌우 10px 패딩으로 버튼을 사이드바 가장자리에서 떼어놓는 일만 한다 | `padding: 0px 10px`, 배경/보더 전무 |
| `DIV.h-full` | 높이 전달만. 시각 속성 없음 | 모든 색/보더 없음 |
| `BUTTON` | **행의 전부.** 클릭 타깃, 배경, radius, 상태(hover/selected/focus)를 전부 여기서 그린다 | `data-selected` 속성 보유, `tabIndex: 0`, `cursor: pointer` |
| icon wrapper | 아이콘 폭을 **20px로 고정**해서, 아이콘 글리프 크기가 달라도 라벨 시작 x가 흔들리지 않게 한다 | `flex-none`, `w/h 20px`, `margin-right: 6px` |
| `P` label | 텍스트 + **스페이서 겸용**. `flex-grow: 1`으로 남는 폭을 먹고, 넘치면 말줄임 | `flexGrow: 1`, `overflow: hidden`, `textOverflow: ellipsis`, `whiteSpace: nowrap` |
| color dot | 리스트 색 표식. 이 리스트는 색이 없어 `background-color: transparent`이지만 **자리는 차지한다**(8px + 4px 마진) | 인라인 `style="background-color: transparent"` |
| trailing slot | **카운트와 액션이 공유하는 한 칸.** `min-width: 24px`로 최소폭을 예약하고 우측 정렬 | `minWidth: 24px`, `justifyContent: flex-end` |
| more(`.peer`) | 컨텍스트 메뉴 트리거. `position: absolute; right: 0`으로 슬롯 우측에 겹쳐 놓여 있고 평소 `opacity: 0` | `transform: matrix(1,0,0,1,0,-8)` = `-translate-y-1/2` |
| count `P` | 미완료 개수. hover/focus 시 `display: none`으로 사라지며 more에 자리를 내준다 | 상태 측정 §4 |
| `DIV.hide` | **인라인 이름 편집 오버레이.** 190×35, `position: absolute`, 사이드바 배경색으로 행을 덮는 구조 | `bg-sidebar-bg-color`, 평소 `hide` |

### 1.3 접근성 속성 — 실측

| 항목 | 값 |
|---|---|
| role | **없음** (`LI`, `BUTTON` 모두 명시 role 없음 — 네이티브 시맨틱만) |
| aria-current | **없음** |
| aria-selected | **없음** |
| aria-label | **없음** |
| tabindex | `BUTTON` = **0**, more(`div.peer`) = **0** |
| 선택 표현 | `data-selected="true"|"false"` 속성 — **보조기술에 노출되는 속성이 아님** |
| disabled | 사이드바 전체에 `[disabled]`/`[aria-disabled]` **0개** |

**관찰**: 선택 상태가 시각(배경)으로만 전달되고 접근성 트리에는 전달되지 않는다. Tab 순서는 `행 버튼 → 그 행의 more 버튼 → 다음 행 버튼` 순으로, 행당 2 스톱이다.

---

## 2. Geometry 실측

전부 `getBoundingClientRect()` 값이다. 단위는 CSS px.

### 2.1 컨테이너 체인

| 레벨 | x | width | 비고 |
|---|---|---|---|
| Global Rail | 0 | **50** | `w-[50px]`, `padding-bottom: 11px` |
| Sidebar 래퍼 | 50 | **240** | 인라인 `style="width: 240px"` — **고정 상수가 아니라 리사이즈 가능값** |
| 사이드바 스크롤 컬럼 | 50 | 239 | `padding-top: 8px` |
| 섹션(`리스트`) | 50 | 239 | `padding-bottom: 12px`, 섹션 헤더 높이 30 |
| `LI` (행) | **50** | **239** | `padding: 0 10px` |
| `BUTTON` | **60** | **219** | `padding: 0 12px`, `radius: 10px` |

사이드바 우측 가장자리(x=285)에 5px 폭의 리사이즈 핸들(`detail-dragger`)이 있다. **따라서 240은 기본값이지 디자인 상수가 아니다.**

### 2.2 행 내부

| 요소 | x | y | w | h |
|---|---|---|---|---|
| BUTTON | 60 | 227 | 219 | **36** |
| icon wrapper | 72 | 235 | **20** | **20** |
| svg | 72 | 235 | 20 | 20 |
| 아이콘 글리프(`use` bbox) | 75.1 | 239.49 | **13.81** | **11.03** |
| label | 98 | 235 | 133 | **20** |
| color dot | 231 | 241 | **8** | **8** |
| trailing slot | 243 | 237 | **24** | 16 |
| more icon | 251 | 237 | **16** | **16** |
| count | 260.53 | 237 | 6.47 | 16 |

### 2.3 간격 (모두 계산이 아니라 rect 차이로 실측)

| 구간 | 값 |
|---|---|
| 사이드바 좌측 가장자리 → 버튼 좌측 | **10** (LI의 padding-left) |
| 버튼 좌측 → 아이콘 좌측 | **12** (버튼 padding-left) |
| 아이콘 우측 → 라벨 좌측 | **6** (icon wrapper의 margin-right) |
| 라벨 우측 → 도트 좌측 | **0** (라벨이 flex-auto로 도트에 붙는다) |
| 도트 우측 → 트레일 슬롯 좌측 | **4** (도트의 margin-right) |
| 카운트 우측 → 버튼 우측 | **12** (버튼 padding-right) |
| more 우측 → 버튼 우측 | **12** (동일 — 두 요소가 같은 우측 기준선에 정렬) |
| 버튼 우측 → LI 우측 | **10** |

누적하면: **사이드바 가장자리에서 아이콘까지 22px, 라벨까지 48px.**

### 2.4 수직 정렬 — 완전 일치

| 요소 | 수직 중심 y |
|---|---|
| 버튼 | 245.0 |
| 아이콘 | 245.0 |
| 라벨 | 245.0 |
| 카운트 | 245.0 |

라벨 라인박스 20px가 36px 행 안에 놓이므로 **위아래 각 8px**의 여백이다.

### 2.5 세로 리듬

연속 행의 y 좌표: 14 → 52 → 90 → (섹션 경계) → 189 → 227 → 265 → 303

**행 간격 = 38px 고정** (행 36 + 래퍼 `margin-bottom: 2px`). 섹션 사이에서만 99/194처럼 커지는데, 그 차이는 섹션 헤더 30px + 섹션 `padding-bottom` 12px 때문이다.

---

## 3. Computed CSS 전체

### 3.1 BUTTON (행 본체)

| 그룹 | 속성 | 값 |
|---|---|---|
| LAYOUT | display / position | `flex` / `relative` |
| | flex-direction / align-items / justify-content | `row` / `center` / `normal` |
| | gap | `normal` (**gap 미사용 — 간격은 자식의 margin으로**) |
| | width / height | `219px` / `36px` |
| | min-width / max-width | `0px` / `none` |
| | overflow | `hidden` |
| BOX | margin / padding | `0px` / `0px 12px` |
| | border-width / style / color | `0px` / `solid` / `rgb(255,255,255)` |
| | border-radius | **`10px`** |
| | box-sizing | `border-box` |
| TYPE | font-family | `"Color Emoji", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, "Malgun Gothic", Arial, sans-serif, …` |
| | font-size / weight / line-height | `14px` / `400` / `normal` |
| | letter-spacing | `normal` |
| | text-overflow / white-space | `clip` / `normal` |
| COLOR | color | `rgb(255,255,255)` |
| | background-color | `rgba(0,0,0,0)` (normal) |
| | opacity | `1` |
| VISUAL | box-shadow / filter / backdrop-filter | `none` / `none` / `none` |
| INTERACTION | cursor / pointer-events / user-select | `pointer` / `auto` / `none` |
| TRANSITION | property / duration / timing | `all` / **`0s`** / `ease` |

### 3.2 자식 요소

| 속성 | icon wrapper | svg | label(P) | dot | trail slot | more(.peer) | count(P) |
|---|---|---|---|---|---|---|---|
| display | block | block | block | block | **flex** | block | block |
| position | relative | static | static | static | relative | **absolute** | relative |
| width / height | 20 / 20 | 20 / 20 | 133 / 20 | 8 / 8 | 24 / 16 | 16 / 16 | 6.47 / 16 |
| min-width | auto | 0 | auto | auto | **24px** | 0 | auto |
| flex-grow / shrink | 0 / **0** | 0 / 1 | **1** / 1 | 0 / **0** | 0 / **0** | 0 / 1 | 0 / 1 |
| margin | `0 6px 0 0` | 0 | 0 | `0 4px 0 0` | 0 | 0 | 0 |
| padding | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| border-radius | 0 | 0 | 0 | **9999px** | 0 | 0 | 0 |
| font-size | — | — | **14px** | — | — | — | **12px** |
| font-weight | — | — | **400** | — | — | — | **400** |
| line-height | — | — | **20px** | — | — | — | normal |
| color | — | `rgb(255,255,255)` | `rgb(255,255,255)` | — | — | — | `rgba(255,255,255,0.4)` |
| background | transparent | transparent | transparent | **transparent(이 리스트)** | transparent | transparent | transparent |
| opacity | 1 | 1 | 1 | 1 | 1 | **0** (normal) | 1 |
| overflow | visible | hidden | **hidden** | visible | visible | visible | visible |
| text-overflow | — | — | **ellipsis** | — | — | — | clip |
| white-space | — | — | **nowrap** | — | — | — | normal |
| transform | none | none | none | none | none | `translateY(-8px)` | none |
| z-index | auto | auto | auto | auto | **0** | auto | **10** |
| transition | all / 0s | all / 0s | all / 0s | all / 0s | all / 0s | **all / 0s** | **all / 0s** |
| cursor | pointer | pointer | pointer | pointer | pointer | pointer | pointer |

**주목**: `transition-duration`이 모든 요소에서 **0s**다. 사이드바 전체 마크업에서 `transition` / `duration-` 문자열 출현 횟수 = **0**.

---

## 4. 상태 매트릭스 (실측)

전부 **실제 마우스 hover / 실제 Tab 키**로 만든 상태에서 잰 값이다.

| Property | A. Normal | B. Hover | C. Selected | D. Selected+Hover | E. Focus-visible |
|---|---|---|---|---|---|
| background | `rgba(0,0,0,0)` | **`rgba(255,255,255,0.03)`** | **`rgba(255,255,255,0.08)`** | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.08)`※ |
| label color | `rgb(255,255,255)` | 동일 | 동일 | 동일 | 동일 |
| label weight | `400` | `400` | **`400`** | `400` | `400` |
| icon color | `rgb(255,255,255)` | 동일 | 동일 | 동일 | 동일 |
| count | `display: block`, `rgba(255,255,255,.4)` | **`display: none`** | `display: block` | `display: none` | **`display: none`** |
| more(action) | `opacity: 0` | **`opacity: 1`** | `opacity: 0` | `opacity: 1` | **`opacity: 1`** |
| more color | `rgba(255,255,255,.4)` | `rgba(255,255,255,.4)` | — | 아이콘 직접 hover 시 **`rgb(255,255,255)`** | `rgba(255,255,255,.4)` |
| border | 없음 | 없음 | 없음 | 없음 | 없음 |
| border-radius | `10px` | `10px` | `10px` | `10px` | `10px` |
| box-shadow | `none` | `none` | `none` | `none` | `none` |
| outline | `none` | `none` | `none` | `none` | **`auto 1px rgb(71,114,250)`, offset 0** |
| opacity(행) | 1 | 1 | 1 | 1 | 1 |
| cursor | pointer | pointer | pointer | pointer | pointer |
| transition | `all 0s` | `all 0s` | `all 0s` | `all 0s` | `all 0s` |

※ E는 C(선택된 행)에 키보드 포커스를 준 상태로 측정했다. 배경은 선택 상태 값 그대로이고 **outline만 추가**된다.

### 4.1 가장 중요한 발견 — C와 D가 같다

선택된 행에 마우스를 올려도 **아무것도 변하지 않는다.** 이유는 클래스 구조에 있다:

- 선택 안 됨: 버튼이 `hover:bg-grey-3`(hover 변형)을 가진다.
- 선택됨: 그 hover 변형이 **제거되고** 정적 클래스 `bg-grey-8`로 교체된다.

즉 선택 상태는 hover 규칙을 덮어쓰는 게 아니라 **애초에 hover 규칙을 떼어낸다.** 마크업 카운트로도 확인된다 — 사이드바 안에 `hover:bg-grey-3` 13회, `bg-grey-8` 1회, `data-selected="true"` 1회.

### 4.2 F. Pressed / Disabled

- **Pressed(`:active`)**: 사이드바 마크업 전체에서 `active:` 변형 출현 횟수 = **0**. `ring-` = 0, `shadow-` = 0. → 누름 상태 스타일이 **존재하지 않는다**고 판단한다. 다만 마우스 다운 유지 상태를 직접 재지는 못했으므로, "UA 기본 동작 외에는 없다"까지가 실측 범위다.
- **Disabled**: 사이드바에 disabled 행이 **0개**. 이 컴포넌트에 disabled 상태는 정의돼 있지 않다.

### 4.3 상태를 만드는 선택자

| 상태 | 메커니즘 | 검증 |
|---|---|---|
| hover(행) | 버튼 자신의 hover 변형 → 배경 3% | 실제 hover로 확인 |
| hover(트레일 스왑) | 버튼이 `group`, 자식이 `group-hover:` 변형 — count는 숨고 more는 나타남 | 사이드바 내 `group-hover:` 24회 |
| focus-visible(트레일 스왑) | `group-focus-visible:` 변형이 hover와 **1:1로 짝지어져 있음** | 사이드바 내 `group-focus-visible:` 24회 (hover와 동수) |
| selected | **클래스 교체** (`hover:bg-grey-3` → `bg-grey-8`) | 아래 §9 실험 |
| more 아이콘 자체 hover | 아이콘의 자체 hover 변형: 40% → 100% | 아이콘에 직접 hover해서 확인 |

---

## 5. CSS Variable / Design Token 추적

### 5.1 토큰이 사는 곳

- `:root`에는 CSS 변수가 **18개뿐**이고, 그 값들은 라이트 테마 기본값이다(`--main-background-color: #fff` 등).
- 실제 테마 토큰은 **`body`에 307개**가 걸려 있다. `body.dark` 클래스가 테마 스위치다.
- 외부 스타일시트 3개는 CORS로 규칙을 읽을 수 없다(`cssRules` 접근 차단, 직접 fetch는 HTTP 403). 그래서 **원본 규칙 텍스트는 확인하지 못했고**, 토큰은 computed value와 probe 실험으로 역추적했다.

### 5.2 토큰 구조 — 색 × 불투명도 2축

색은 **RGB 트리플릿 문자열**로 저장된다. 알파를 나중에 곱하기 위한 형태다.

| 토큰 | 값 (dark) | 역할 |
|---|---|---|
| `--color-sidebar-bg-color` | `28,28,28` | **사이드바 표면** (실측 배경 `rgb(28,28,28)`) |
| `--color-left-sidebar-bg-color` | `36,36,36` | Rail 표면 |
| `--color-sidebar-color` | `255,255,255` | 사이드바 전경(텍스트/아이콘) |
| `--color-grey` | `255,255,255` | 중립 전경 |
| `--color-primary` | `71,114,250` (#4772fa) | 액센트 — **포커스 링 색과 일치** |
| `--color-priority-high / medium / low` | `225,62,57` / `250,168,12` / `71,114,250` | 우선순위 |

여기에 **불투명도 스케일이 별도 토큰군**으로 존재한다. 색 계열마다 같은 단계가 반복된다:

```
0.01 0.02 0.03 0.04 0.05 0.06 0.08 0.10 0.12 0.13 0.15
0.20 0.25 0.30 0.40 0.50 0.60 0.70 0.80 0.85 0.90     ← 22단
```

`grey`, `sidebar-color`, `sidebar-bg-color`, `left-sidebar-color`, `left-sidebar-bg-color`, `sidebar-icon-number-color` … 각각에 대해 이 22단이 전부 정의돼 있다.

### 5.3 이 행이 실제로 소비하는 토큰 (probe로 값 확인)

| 쓰임 | 유틸리티 | 해석된 값 |
|---|---|---|
| hover 배경 | `bg-grey-3` | `rgba(255,255,255,0.03)` = `--color-grey` × `--opacity-variant-grey-3` |
| selected 배경 | `bg-grey-8` | `rgba(255,255,255,0.08)` |
| 라벨 색 | `text-grey` | `rgb(255,255,255)` |
| 아이콘 색 | `text-sidebar-color` | `rgb(255,255,255)` |
| 카운트 / more 색 | `text-sidebar-color-40` | `rgba(255,255,255,0.4)` |
| 사이드바 표면 | `bg-sidebar-bg-color` | `rgb(28,28,28)` |
| 라벨 크기 | `text-s` | `14px` |
| 카운트 크기 | `text-xs` | `12px` |
| 행 radius | `rounded-[10px]` | `10px` — **토큰이 아니라 임의값(arbitrary value)** |

### 5.4 이 체계가 답해주는 것

- **surface / hover / selected가 각각 별도 색이 아니라 "같은 전경색의 알파 3%·8%"다.** 그래서 라이트/다크에서 색을 다시 고를 필요가 없고, 어떤 표면 위에 올려도 관계가 유지된다.
- **divider / border 토큰은 이 행에 없다.** 행에는 보더가 아예 없다(`border-width: 0`). 구분은 여백과 배경으로만 한다.
- **radius와 spacing은 토큰화되어 있지 않다.** `10px`, `12px`, `6px`, `4px` 모두 임의값으로 직접 적혀 있다. → 색만 토큰이고 치수는 토큰이 아니다.

---

## 6. Icon 시스템

| 항목 | 값 |
|---|---|
| 방식 | **SVG 스프라이트** — 문서 내 `<symbol>`을 `<use xlink:href="#normal-list">`로 참조 |
| icon font / img / mask | 모두 **아님** |
| symbol viewBox | `0 0 24 24` |
| symbol 내부 | `<defs><clipPath>` + `<g clip-path>` 안에 `rect` 1개 + `path` 1개 |
| 렌더 크기 (svg 박스) | **20 × 20** (`w-full h-full`이 20px wrapper를 채움) |
| **실제 글리프 bbox** | **13.81 × 11.03** |
| wrapper | **20 × 20** (`flex-none`) |
| fill | `rgb(255,255,255)` — **currentColor 상속** (`text-sidebar-color`로 지정) |
| stroke | `none` (fill 기반 아이콘. `stroke-width: 1px`은 계산값일 뿐 사용 안 됨) |
| 내부 opacity | 없음 (path/rect 모두 `opacity: 1`, `fill-opacity` 미지정) |

요청하신 형식으로:

```
wrapper : 20 × 20
svg box : 20 × 20
글리프  : 13.81 × 11.03   ← viewBox 24 기준 좌표계를 20px로 축소한 결과
행 높이 : 36
```

**관찰**: 아이콘은 라벨과 **완전히 같은 색**(둘 다 순백)이다. 화면에서 아이콘이 더 흐려 보이는 것은 색 차이가 아니라 글리프가 얇은 선화(線畵)여서 안티에일리어싱으로 밝기가 떨어지는 것이다.

**more 아이콘**은 별개다: 16×16, 색 `rgba(255,255,255,0.4)`, 자체 hover 시 `rgb(255,255,255)`.

---

## 7. Typography

### 7.1 실측값

| 항목 | 라벨 | 카운트 |
|---|---|---|
| font-family (선언) | `"Color Emoji", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, "Malgun Gothic", Arial, sans-serif, "Apple Color Emoji", …` | 동일 |
| **실제 렌더 폰트** | **Segoe UI** (아래 7.2에서 측정으로 확정) | 동일 |
| font-size | **14px** | **12px** |
| font-weight | **400** | **400** |
| line-height | **20px** | `normal` |
| letter-spacing | `normal` (0) | `normal` |
| color | `rgb(255,255,255)` | `rgba(255,255,255,0.4)` |
| -webkit-font-smoothing | **`antialiased`** | 동일 |
| text-rendering | **`optimizeLegibility`** | 동일 |
| font-variant-numeric | `normal` (**tabular-nums 아님**) | `normal` |
| 오버플로 처리 | `overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap` | — |

### 7.2 실제 렌더 폰트를 어떻게 확정했나

라벨 텍스트의 실제 렌더 폭을 `Range.getBoundingClientRect()`로 재고, 같은 문자열을 후보 폰트별로 canvas에서 측정해 대조했다.

| 후보 | 14px/400에서의 폭 |
|---|---|
| **실제 렌더된 폭** | **81.27** |
| system-ui | 81.26 |
| "Segoe UI" | 81.26 |
| Arial / Helvetica / sans-serif | 80.14 |
| Roboto | 78.95 |
| "Malgun Gothic" | 83.89 |

→ 이 Windows 환경에서 `system-ui`는 **Segoe UI**로 해석되며, 라틴 문자는 그것으로 렌더된다. 한글은 스택 뒤쪽의 `Malgun Gothic`이 맡는다. `[추론]` 스택에 `"Color Emoji"`가 **맨 앞**에 있는 것은 이모지를 리스트 이름 첫 글자로 쓰는 사용자를 위해 이모지 폰트를 우선 매칭시키려는 배치로 보인다.

### 7.3 작고 조밀한데 답답하지 않은 이유

측정값들의 관계로 설명한다.

| 관계 | 수치 |
|---|---|
| line-height ÷ font-size | 20 ÷ 14 = **1.43** |
| row-height ÷ line-height | 36 ÷ 20 = **1.80** |
| 라인박스 위/아래 여백 | **각 8px** |
| 텍스트 높이 대비 행 높이 | 14 → 36 = **2.57배** |

**[Observed]** 글자는 14px로 작지만, 그 글자가 놓인 20px 라인박스 위아래에 각각 8px의 빈 공간이 있다. 그리고 행 사이에 2px가 더 있어 실제 리듬은 38px다.

**[Inference]** 답답함은 글자 크기가 아니라 **글자 주변의 빈 공간 비율**에서 온다. TickTick은 글자를 키우는 대신 행을 키웠다 — 14px 텍스트에 36px 행(2.57배)은 넉넉한 편이다. 동시에 폰트 weight를 400 하나로 유지하고 letter-spacing을 건드리지 않아, 글자 자체는 최대한 조용하다. 밀도는 "작은 글씨 + 큰 여백"으로 만들어져 있지, "작은 글씨 + 작은 여백"이 아니다.

---

## 8. Spacing System 역추적

### 8.1 이 컴포넌트에서 실제로 관찰된 치수 전부

```
2   행 사이 간격 (margin-bottom)
4   도트 → 트레일 슬롯
6   아이콘 → 라벨
8   도트 크기 · 라벨 상하 여백 · 사이드바 컬럼 padding-top
10  LI 좌우 패딩 · radius
12  버튼 좌우 패딩 · 섹션 padding-bottom
16  more 아이콘 · 트레일 슬롯 높이
20  아이콘 wrapper · 라벨 라인박스
24  트레일 슬롯 min-width
30  섹션 헤더 높이
36  행 높이
38  행 리듬 (36+2)
50  Rail 폭
240 사이드바 폭 (리사이즈 가능)
```

### 8.2 패턴 판정 — 정직하게

- **모든 값이 짝수다.** 홀수 치수는 하나도 없다.
- **4의 배수 집합**: 4, 8, 12, 16, 20, 24, 36 → 잘 맞는다.
- **4의 배수가 아닌 값**: **2, 6, 10, 30, 38, 50** → 6개.

**따라서 "8pt 그리드"는 이 데이터가 지지하지 않는다.** 10px 패딩, 6px 갭, 2px 리듬, 30px 헤더가 전부 어긋난다.

**측정이 지지하는 진술은 이것뿐이다:**

> TickTick 사이드바는 **2px 기반 격자**를 쓰며, 4의 배수를 선호하되 강제하지 않는다. 특히 **미세 간격(2·4·6)** 영역에서는 4배수를 벗어나 2px 단위로 조율한다.

`[추론]` 6px(아이콘↔라벨)과 10px(가장자리 여백)이 4배수를 깬 자리는 모두 "시각적으로 붙이거나 떼는 미세 조정"이 필요한 지점이다. 격자보다 광학적 정렬을 우선한 것으로 보인다. 억지로 8pt 체계로 정리하면 이 지점들이 전부 틀어진다.

### 8.3 관계로 본 여백 구조

```
사이드바 가장자리
 └ +10  LI padding      → 버튼 시작 (배경이 칠해지는 영역의 왼쪽 끝)
     └ +12  버튼 padding → 아이콘
         └ +20+6        → 라벨
                        … flex-auto …
                          도트 8 +4
                          트레일 24 (우측 정렬)
     └ +12  버튼 padding
 └ +10  LI padding
사이드바 가장자리
```

**10 + 12 = 22**가 "가장자리에서 첫 픽셀까지"의 총 여백이고, 그 중 **10은 배경 밖(여백), 12는 배경 안(패딩)**이다. 이 분할이 §11의 해석 포인트다.

---

## 9. Cascade 분석

외부 스타일시트가 CORS로 막혀 있어 **원본 규칙 텍스트는 읽지 못했다.** 대신 실험으로 역추적했다.

### 9.1 실험 1 — 의미있는 클래스 vs 유틸리티 클래스

`.project-list-view-item-button`과 `.drop-hover-effect`만 가진 빈 버튼을 만들어 computed style을 쟀다.

| probe | background | radius | height | padding | cursor |
|---|---|---|---|---|---|
| `project-list-view-item-button` 단독 | transparent | 0 | 18.5 | 0 | pointer |
| `drop-hover-effect` 단독 | transparent | 0 | 18.5 | 0 | pointer |
| 클래스 없는 버튼 | transparent | 0 | 18.5 | 0 | pointer |

**셋이 완전히 같다.** → 이 두 클래스는 **시각적으로 아무것도 하지 않는다.** JS 훅(드래그앤드롭 타깃, 이벤트 위임)일 뿐이다. 행의 외형은 **100% 유틸리티 클래스**에서 온다.

### 9.2 실험 2 — 선택 상태는 클래스인가 속성인가

| 조작 | background 결과 |
|---|---|
| 선택된 행 (기준) | `rgba(255,255,255,0.08)` |
| 선택된 행에서 `bg-grey-8` 클래스만 제거 | **`rgba(0,0,0,0)`** |
| 클래스 복구 | `rgba(255,255,255,0.08)` |
| 선택 안 된 행에 `data-selected="true"` 속성만 부여 | **`rgba(0,0,0,0)`** (변화 없음) |

**결론: `data-selected` 속성은 스타일 훅이 아니다.** 선택 표시는 전적으로 **렌더 시점의 클래스 교체**로 이뤄진다. 속성은 JS/테스트용 마커다.

### 9.3 최종 결정 경로 정리

```
행 배경
 └ 선택 아님 → 유틸리티 `hover:bg-grey-3`
     └ rgba(var(--color-grey), var(--opacity-variant-grey-3))
         └ 255,255,255 × 0.03 → rgba(255,255,255,0.03)
 └ 선택됨   → 유틸리티 `bg-grey-8` (hover 변형은 마크업에서 제거됨)
     └ 255,255,255 × 0.08 → rgba(255,255,255,0.08)

카운트 색
 └ `text-sidebar-color-40`
     └ rgba(var(--color-sidebar-color), var(--opacity-variant-sidebar-color-40))
         └ 255,255,255 × 0.4

포커스 링
 └ UA 기본 `outline: auto`, 색은 rgb(71,114,250) = --color-primary
```

`[추론]` 유틸리티 클래스명(`bg-grey-8`)은 생성된 이름이므로 이름 자체를 옮길 이유는 없다. 옮겨야 할 것은 **"전경색 × 알파 단계"라는 규칙**이다.

---

## 10. Interaction 미세 분석 (실제 마우스로 확인)

| 질문 | 실측 답 |
|---|---|
| hover 시작 시 즉시 변경되는가 | **즉시.** `transition-duration: 0s`, 사이드바 마크업 내 transition 선언 0건 |
| trailing action이 hover에서만 나타나는가 | **hover + focus-visible 양쪽.** 두 변형이 24개씩 짝을 이룬다 |
| hover 영역이 행 전체인가 | **아니다.** LI는 239px지만 hit surface는 버튼 **219px**뿐. **좌우 10px씩은 죽은 영역** — 그곳에 커서를 올리면 `li:hover`는 true가 되지만 배경도 액션도 반응하지 않는다 (실측 확인) |
| 아이콘만 클릭 가능한 부분이 있는가 | **more 버튼(16×16)만 별도 타깃.** 자체 hover 색(40%→100%)과 자체 tabindex(0)를 가진다. 아이콘/라벨/도트는 별도 타깃이 아니다 |
| selected에서 hover 색이 다시 달라지는가 | **달라지지 않는다.** §4.1 참조 — 선택 시 hover 규칙 자체가 제거된다 |
| 카운트와 액션의 관계 | **같은 24px 슬롯을 공유.** 카운트는 `display:none`으로 사라지고, more는 `opacity: 0→1`. 슬롯 폭이 `min-width:24px`로 예약돼 있어 **스왑 시 라벨이 밀리지 않는다** (라벨 x=98, 폭 133 — hover 전후 동일) |

---

## 11. 디자인 의도 해석

### 11.1 왜 radius가 10px인가

**[Observed]** 버튼 radius 10px, 높이 36px, 폭 219px.
**[Inference]** 높이의 약 28%다. 절반(18px = pill)이면 알약이 되어 "버튼"으로 읽히고, 4px면 각진 표로 읽힌다. 10px은 **"눌리는 면"으로는 보이되 독립된 버튼으로는 보이지 않는** 지점이다. 사이드바 행은 개별 버튼들의 목록이 아니라 하나의 목록이어야 하므로 이 중간값이 선택된 것으로 보인다.

### 11.2 왜 배경 대비가 이렇게 약한가 (3% / 8%)

**[Observed]** 표면 `rgb(28,28,28)` 위에 hover는 흰색 3%, selected는 흰색 8%. 실효 밝기 차이는 각각 약 7 / 18 레벨(255 기준)이다.
**[Inference]** 사이드바는 **읽는 곳이 아니라 고르는 곳**이다. 대비를 키우면 선택된 행이 화면에서 가장 밝은 요소가 되어, 정작 읽어야 할 태스크 목록보다 시선을 먼저 가져간다. 3%/8%는 "옆눈으로 보면 어디 있는지는 알겠지만, 정면으로 보면 눈에 안 띄는" 강도다. 알파를 쓴 덕에 이 **관계**(hover < selected)는 어떤 배경 위에서도 유지된다.

### 11.3 왜 아이콘보다 텍스트가 강조되는가

**[Observed]** 아이콘과 라벨은 **같은 색**(순백)이다. 다만 아이콘 글리프는 13.81×11.03의 얇은 선화이고 라벨은 14px 텍스트다.
**[Inference]** 색으로 위계를 만들지 않고 **면적과 획 굵기**로 만들었다. 색을 낮추면(예: 아이콘 60%) 다크/라이트 전환 때마다 다시 조정해야 하지만, 획 굵기로 만든 위계는 테마와 무관하다. 실제로 카운트/액션만 색을 낮췄는데(40%), 이 둘은 **글자/아이콘 모두 작아서** 면적으로는 위계를 만들 수 없는 요소다.

### 11.4 왜 행 높이가 36px인가

**[Observed]** 36px 행, 38px 리듬, 라벨 라인박스 20px.
**[Inference]** 36은 마우스로는 충분하고 손가락으로는 부족한 크기다(WCAG 2.2의 24px 최소는 넘지만 44px 권장에는 못 미친다). 즉 **웹 = 마우스 전용이라는 전제**가 이 숫자에 들어 있다. 사이드바에 20개 리스트가 있어도 38×20 = 760px로 한 화면에 들어오게 하는 것이 목적으로 보인다.

### 11.5 왜 좌우 10px이 배경 밖에 있는가

**[Observed]** LI 패딩 10px(배경 없음) + 버튼 패딩 12px(배경 있음).
**[Inference]** 선택 배경이 사이드바 가장자리에 닿지 않게 하려는 분할이다. 배경이 가장자리까지 가면 "칸이 꽉 찬 표"가 되고, 10px 떨어뜨리면 **떠 있는 칩**이 된다. 동시에 그 10px은 클릭도 안 받으므로, 가장자리 근처의 실수 클릭을 흡수하는 완충대 역할도 한다.

### 11.6 왜 transition이 없는가

**[Observed]** 사이드바 전체에 transition 선언 0건.
**[Inference]** 사이드바 행은 **탐색 중 스치는 요소**다. 커서가 목록을 훑고 지나갈 때 각 행이 120ms씩 페이드하면 잔상이 겹쳐 지저분해진다. 즉시 전환은 "따라온다"는 느낌을 주고, 특히 3%짜리 약한 대비에서는 페이드가 인지되기도 전에 끝난다. **약한 대비 + 무전환**은 한 세트의 결정으로 보인다.

### 11.7 카운트와 액션이 자리를 공유하는 이유

**[Observed]** 24px 슬롯 하나에 카운트와 more가 겹쳐 있고, hover 시 교대한다. 라벨 폭은 스왑 전후로 변하지 않는다.
**[Inference]** 두 정보는 **동시에 필요하지 않다.** 목록을 훑을 때는 개수가, 특정 행을 조작할 때는 메뉴가 필요하다. 별도 칸을 주면 폭이 늘거나 라벨이 줄고, hover마다 레이아웃이 흔들린다. `min-width`로 자리를 미리 잡아두면 둘 다 피할 수 있다.

---

## 12. 우리 앱 적용 Specification

**구현 중립 명세.** TickTick의 클래스/CSS를 옮기지 않고, 위 실측에서 도출한 규칙만 적는다. 값 옆의 괄호는 우리 앱의 현재 값(`DESIGN_ELEMENT_INVENTORY.md` 기준)이다.

### 12.1 Sidebar Navigation Row

```
STRUCTURE
  outer (여백 전용)      : 좌우 10px 패딩, 배경/보더 없음
  row   (hit surface)    : 나머지 전부. 배경·radius·상태를 여기서만 그린다
  slots                  : [icon] [label(flex:1, truncate)] [dot] [trail(min 24px)]

GEOMETRY
  row height             : 36px          (현재 우리: 36 ✓ 사이드바 .tm-row와 일치)
  row rhythm             : 38px (36 + 2px 간격)
  outer horizontal pad   : 10px
  row horizontal pad     : 12px          (현재 우리: 10 → +2)
  radius                 : 10px          (현재 우리: 6 → +4)
  icon wrapper           : 20 × 20, flex-none
  icon → label gap       : 6px           (현재 우리: 8 → −2)
  dot                    : 8 × 8, radius 999, margin-right 4px
  trail slot             : min-width 24px, 우측 정렬
  trail → row right edge : 12px
  모든 요소 수직 중앙 정렬 (행 중심 기준 완전 일치)

TYPOGRAPHY
  label                  : 14px / 400 / line-height 20px / letter-spacing 0
                           truncate (nowrap + ellipsis + overflow hidden)
                           (현재 우리: 13px → +1)
  count                  : 12px / 400
  font-smoothing         : antialiased
  weight는 상태와 무관하게 400 고정 — selected에서도 굵게 하지 않는다

COLOR (전경색 1개 × 알파 단계로만 구성)
  surface                : 사이드바 표면색
  label / icon           : 전경색 100%
  count / action icon    : 전경색 40%
  hover background       : 전경색 3%
  selected background    : 전경색 8%
  action icon hover      : 전경색 100%
  border                 : 없음 (행에 보더를 쓰지 않는다)

ICON
  wrapper 20 × 20, 글리프는 그 안에서 약 14 × 11
  fill 기반, currentColor 상속 (stroke 사용 안 함)
  라벨과 동일한 색 — 위계는 색이 아니라 획 굵기로

MOTION
  transition: 없음 (0s). 상태 전환은 즉시.

STATES
  normal          : bg 없음 / count 표시 / action 숨김
  hover           : bg 전경 3% / count 숨김 / action 표시
  selected        : bg 전경 8% / count 표시 / action 숨김
  selected+hover  : selected와 동일 (변화 없음)
  focus-visible   : bg는 그 상태 그대로 + outline 1px accent, offset 0
                    count 숨김 / action 표시 (hover와 동일한 스왑)
  pressed         : 정의하지 않음
  disabled        : 정의하지 않음

HIT AREA
  hit surface = row 만. outer의 좌우 10px은 클릭 불가 완충대
  action 버튼만 별도 타깃 (16 × 16, 자체 tabindex)

ACCESSIBILITY (TickTick보다 개선할 것)
  TickTick은 aria-current / aria-selected 를 쓰지 않는다 — 선택이 시각으로만 전달된다.
  우리는 여기에 aria-current="page"(또는 aria-selected)를 추가한다.
  Tab 스톱은 행당 2개(행 + action)로 동일하게 간다.
```

### 12.2 우리 앱과의 차이 요약

| 항목 | TickTick 실측 | 우리 현재 | 조치 |
|---|---|---|---|
| 사이드바 행 높이 | 36 | 36 (`.tm-row`) | 그대로 |
| 행 radius | 10 | 6 | 10으로 |
| 행 좌우 패딩 | 12 (+ 바깥 10) | 10 (바깥 여백 없음) | 12 + 바깥 10 구조로 |
| 라벨 크기 | 14 | 13 | 14로 |
| 라벨 weight (selected) | 400 유지 | **500으로 굵어짐** | 400 고정으로 |
| hover 배경 | 전경 3% | `--bg-hover` 4~6% | 3%로 |
| selected 배경 | 전경 8% | `--bg-selected` (라이트 `#eceef3` 고정색) | **알파 8%로 전환** |
| selected+hover | 변화 없음 | `--bg-selected-hover` 별도 정의 | 제거 검토 |
| 아이콘 wrapper | 20 | (미정의) | 20 고정폭 도입 |
| transition | 없음 | `--motion-fast` 120ms | 사이드바 행만 0으로 |
| 카운트/액션 | 24px 슬롯 공유, 스왑 | 카운트만 존재 | 스왑 구조 도입 |

가장 큰 구조적 차이 셋: **(1) 바깥 10px 여백 + 안쪽 12px 패딩의 2단 분할**, **(2) selected를 고정색이 아니라 알파로**, **(3) 카운트/액션 슬롯 공유**.

### 12.3 구현 예시 (제안 — 아직 적용하지 않음)

```tsx
// SidebarRow.tsx
type Props = {
  icon: React.ReactNode;
  label: string;
  count?: number;
  color?: string;          // 리스트 색. 없으면 도트는 자리만 차지
  selected?: boolean;
  onOpenMenu?: (e: React.MouseEvent) => void;
  onClick?: () => void;
};

export function SidebarRow({ icon, label, count, color, selected, onOpenMenu, onClick }: Props) {
  return (
    <li className="sbrow-outer">
      <button
        type="button"
        className="sbrow"
        data-selected={selected ? "true" : "false"}
        aria-current={selected ? "page" : undefined}
        onClick={onClick}
      >
        <span className="sbrow-icon">{icon}</span>
        <span className="sbrow-label">{label}</span>
        <span className="sbrow-dot" style={{ background: color ?? "transparent" }} />
        <span className="sbrow-trail">
          <span
            className="sbrow-more"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onOpenMenu?.(e); }}
          >
            {/* 16×16 more icon */}
          </span>
          {count != null && <span className="sbrow-count">{count}</span>}
        </span>
      </button>
    </li>
  );
}
```

```css
/* 바깥 껍데기 — 여백만. 배경도 radius도 여기 두지 않는다. */
.sbrow-outer { padding: 0 10px; margin-bottom: 2px; list-style: none; }

/* 행 본체 — 상태를 그리는 유일한 요소 */
.sbrow {
  display: flex; align-items: center;
  width: 100%; height: 36px; padding: 0 12px;
  border: 0; border-radius: 10px;
  background: transparent;
  color: var(--sidebar-fg);
  font: 400 14px/20px var(--font-sans);
  text-align: left; cursor: pointer;
  /* 의도적으로 transition 없음 — 훑고 지나가는 요소라 잔상이 남는다 */
  transition: none;
}
.sbrow:hover                    { background: color-mix(in srgb, var(--sidebar-fg) 3%, transparent); }
.sbrow[data-selected="true"]    { background: color-mix(in srgb, var(--sidebar-fg) 8%, transparent); }
/* selected + hover에 별도 규칙을 두지 않는다 — 선택된 행은 hover에 반응하지 않는다 */
.sbrow:focus-visible            { outline: 1px solid var(--accent); outline-offset: 0; }

.sbrow-icon  { flex: none; width: 20px; height: 20px; margin-right: 6px;
               display: flex; align-items: center; justify-content: center; }
.sbrow-icon svg { width: 100%; height: 100%; fill: currentColor; }

/* 라벨이 스페이서를 겸한다 — 별도 spacer 요소를 두지 않는다 */
.sbrow-label { flex: 1 1 auto; min-width: 0;
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sbrow-dot   { flex: none; width: 8px; height: 8px; margin-right: 4px; border-radius: 999px; }

/* 카운트와 액션이 공유하는 칸. min-width로 자리를 예약해 스왑 시 라벨이 밀리지 않는다 */
.sbrow-trail { flex: none; position: relative; display: flex; align-items: center;
               justify-content: flex-end; min-width: 24px; height: 16px; }
.sbrow-more  { position: absolute; right: 0; top: 50%; transform: translateY(-50%);
               width: 16px; height: 16px; opacity: 0;
               color: color-mix(in srgb, var(--sidebar-fg) 40%, transparent); }
.sbrow-more:hover { color: var(--sidebar-fg); }
.sbrow-count { font-size: 12px;
               color: color-mix(in srgb, var(--sidebar-fg) 40%, transparent);
               font-variant-numeric: tabular-nums; }

.sbrow:hover .sbrow-more,
.sbrow:focus-visible .sbrow-more,
.sbrow-more:focus-visible          { opacity: 1; }
.sbrow:hover .sbrow-count,
.sbrow:focus-visible .sbrow-count  { display: none; }
```

**TickTick과 의도적으로 다르게 한 것 3가지:**
1. `aria-current="page"` 추가 — TickTick은 선택을 시각으로만 전달한다.
2. 카운트에 `tabular-nums` 적용 — TickTick은 `normal`이라 두 자리/세 자리에서 우측 정렬이 미세하게 흔들린다.
3. 색을 `color-mix`로 계산 — TickTick의 "색 트리플릿 + 알파 토큰 22단" 구조를 그대로 옮기는 대신, 전경색 하나에서 파생시킨다. 유지할 것은 **"전경색 × 알파"라는 규칙**이지 22단 스케일이 아니다.

---

## 13. 이 분석이 확인하지 못한 것

- **`:active`(누른 상태)** — 마우스 다운을 유지한 채 측정할 API가 없었다. 마크업에 `active:` 변형이 0건이라는 간접 증거만 있다.
- **원본 CSS 규칙 텍스트** — 외부 스타일시트가 CORS로 막혀 있다(fetch 403). §9는 probe 실험으로 대체했다.
- **라이트 테마 값** — 다크에서만 측정했다. 토큰 구조상 같은 알파가 반대 방향으로 적용될 것으로 보이지만 **확인하지 않았다.**
- **다른 뷰포트** — 800×805에서만 측정했다. 사이드바 폭 240은 인라인 스타일이고 리사이즈 핸들이 있으므로, 폭에 따라 달라지는 것이 있는지는 미확인.
- **스마트 리스트 행(오늘/다음 7일/기본함)과의 구조 차이** — 클래스 구성은 동일해 보였으나 전수 비교는 하지 않았다.
- **드래그 상태** — `drop-hover-effect`/`drop-hover-target` 클래스가 있으므로 드래그 중 별도 표현이 있을 것으로 보이나, 드래그를 수행하지 않았다.
