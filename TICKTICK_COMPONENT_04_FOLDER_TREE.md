# TickTick 역설계 #04 — Folder / Tree / Nested List Hierarchy

대상: TickTick Web (ticktick.com/webapp), 사용자 실제 계정
분석 컴포넌트: **폴더와 그 안의 리스트가 이루는 계층 구조**
작성일: 2026-08-20

Component 01(Sidebar Row) · 02(Sidebar Shell) · 03(Section Header)에서 다룬 내용은 다시 분석하지 않고, 비교가 필요한 지점에서만 그 실측치를 인용한다.

## 0. 측정 조건과 이번 회차에 만든 데이터

| 항목 | 값 |
|---|---|
| viewport | **763 × 392 CSS px** (dpr 2) |
| 테마 / 로케일 | dark (`body.dark`) / ko |
| 사이드바 폭 | 240 (인라인, Component 02 참조) |
| 측정 방법 | `getBoundingClientRect()` · `getComputedStyle()` · `document.getAnimations()` · 실제 마우스 hover/click/double-click · 실제 Tab·Arrow·Enter 키 |

### 0.1 이 계정에는 폴더가 없었다 — 그래서 만들었다

측정 시작 시점에 **사이드바의 모든 행이 x=60의 단일 깊이**였다. 중첩 `ul` 0개, `folder`/`indent`/`nested` 계열 클래스 0개, 사이드바 HTML에 `folder` 문자열 0회. 즉 이 컴포넌트의 분석 대상이 존재하지 않았다.

사용자 승인을 받아 **테스트 데이터를 직접 생성**했다.

| 만든 것 | 이름 | 비고 |
|---|---|---|
| 폴더 1개 | **`ZZ Folder`** | 내부 id `groupid=6a867cfb…` |
| 리스트 3개 | `ZZ List A` · `ZZ List B` · `ZZ Very Long List Name For Truncation Test` | 셋 다 `ZZ Folder` 소속. 세 번째는 §22 말줄임 측정용 |

**측정이 끝난 현재 상태**: 폴더는 **펼쳐진(open) 상태**로 남아 있고, 리스트 3개 모두 비어 있다(태스크 0개). 앱 화면은 원래 보시던 **기본함(`#p/inbox/kanban`)**으로 되돌려 놓았다. **이 테스트 데이터는 지우지 않았다** — 삭제는 되돌릴 수 없는 작업이라 별도 승인 없이 하지 않는다. 원하시면 지워 드리겠다.

### 0.2 상태를 되돌린 것

측정 중 폴더를 여러 번 접고 폈으며, 마지막에 **펼친 상태**로 두었다(생성 직후 기본값은 접힘이었다). 리스트 선택은 여러 번 바뀌었고 최종적으로 기본함으로 복귀시켰다. 데이터 삭제·이동·이름변경은 하지 않았다.

### 0.3 이번 회차의 도구 제약

- **탭이 백그라운드 상태**(`document.hidden === true`)라 `requestAnimationFrame` 기반 프레임 샘플링이 멈춘다(실제로 한 번 타임아웃됨). §7의 애니메이션 측정은 `document.getAnimations()`와 `setTimeout` 샘플링으로 대체했다.
- **뷰포트를 바꿀 수 없다**(Component 02와 동일). 사이드바 리사이즈 핸들 드래그도 합성 이벤트로는 동작하지 않았다. §21은 미측정.

**판정 규칙**: 수치는 전부 실측. 해석은 `[Inference]`로 분리. 못 잰 것은 §24-C에 적는다.

---

## 1. 분석 대상

| 항목 | 값 |
|---|---|
| 폴더 이름 | **ZZ Folder** |
| 위치 | `리스트` 섹션의 첫 항목. 사이드바 y=189 |
| 자식 | 리스트 3개 (표시 순서: Very Long → List B → List A, **생성 역순**) |
| expanded 확인 | 가능 (측정함) |
| collapsed 확인 | 가능 (측정함) |
| child selected | 가능 (`ZZ List A`를 선택해 측정) |
| trailing action | 있음 (more 버튼). **count는 없음** |

구조:

```
ZZ Folder
 ├─ ZZ Very Long List Name For Truncation Test
 ├─ ZZ List B
 └─ ZZ List A
```

---

## 2. DOM Hierarchy

### 2.1 실제 트리 (expanded)

```
UL#project-ul.project-ul                                   239 × 302 @50,189
│
├ DIV.l-folder.mb-[2px].open   [groupid, order]            239 × 36  @50,189
│  └ DIV.f-container
│     └ DIV.project-dropper    [data-type=group, data-dropper-id]
│        └ LI.project-list-view-item.drop-hover-target.h-[36px].px-[10px]
│           └ DIV.h-full                    padding: 0            219 × 36 @60
│              └ BUTTON.project-list-view-item-button …rounded-[10px]
│                 │    [type=button, data-selected]  pl-[12px] pr-[12px] hover:bg-grey-3 group
│                 ├ DIV  (disclosure)   absolute, 14 × 36 @60   ← group/collapsed
│                 │   └ svg.icon-thin-triangle-down.w-[12px].h-[12px]
│                 ├ DIV  (folder icon slot)  20 × 20 @72, mr-[6px]
│                 │   └ svg.icon-sidebar-folder-open  (open) / svg.icon-folder (closed)
│                 ├ P    (label)  text-s font-normal truncate leading-[20px] text-grey
│                 ├ DIV  (trailing slot)  min-w-[24px] @243   ← count 없음, more만
│                 └ DIV.hide  (rename overlay, display:none)
│
├ UL.group-project-ul.inner-ul     ← ★ 자식 컨테이너. l-folder의 자식이 아니라 형제
│  ├ DIV.project.project-dropper.mb-[2px]  [order, data-dropper-id]
│  │  └ LI.project-list-view-item.drop-hover-target.h-[36px].px-[10px]
│  │     └ DIV.h-full            padding: 0 0 0 26px   ← ★ 들여쓰기의 유일한 출처
│  │        └ BUTTON …           193 × 36 @86
│  │           ├ DIV (icon slot) 20 × 20 @98
│  │           ├ P   (label)     @124
│  │           ├ DIV (color dot) 8 × 8 @231
│  │           ├ DIV (trailing)  min-w-[24px] @243
│  │           └ DIV.hide
│  ├ … (자식 2)
│  └ … (자식 3)
│
├ DIV.project.project-dropper.mb-[2px]     ← root 레벨 리스트 (d)
└ …
```

### 2.2 단순화

```
FolderGroup  (DIV.l-folder[.open])
 └ FolderRow  (LI > DIV.h-full > BUTTON)
     ├ Disclosure   (absolute 14×36, 좌측 끝)
     ├ FolderIcon   (20×20 슬롯)
     ├ Label
     └ TrailingSlot (min-w 24 — more만, count 없음)

Children  (UL.group-project-ul — FolderGroup의 형제)
 ├ ListRow  (DIV.h-full의 padding-left 26px으로 들여쓰기)
 ├ ListRow
 └ ListRow
```

### 2.3 Folder와 List는 같은 컴포넌트인가

**[Observed] 같은 컴포넌트다.** 클래스와 기하가 일치한다.

| 항목 | Folder Row | Root List Row | 일치? |
|---|---|---|---|
| LI 클래스 | `project-list-view-item drop-hover-target h-[36px] px-[10px]` | 동일 | ✔ |
| BUTTON 클래스 | `project-list-view-item-button … rounded-[10px] … pl-[12px] pr-[12px] hover:bg-grey-3` | 동일 | ✔ |
| 높이 / radius / padding | 36 / 10px / `0 12px` | 동일 | ✔ |
| `data-selected` 속성 | 있음 | 있음 | ✔ |
| label 클래스 | `text-s font-normal flex-auto truncate leading-[20px] text-grey` | 동일 | ✔ |
| 감싸는 wrapper | `DIV.l-folder` + `DIV.f-container` + `DIV.project-dropper` | `DIV.project.project-dropper` | ✘ |
| disclosure | **있음** | 없음 | ✘ |
| color dot | **없음** | 있음 | ✘ |
| count | **없음(빈 폴더 기준)** | 있음(태스크가 있을 때) | ✘ |

**[Inference]** 행 자체는 하나의 컴포넌트를 재사용하고, **슬롯 구성만 다르게 채운다**. 폴더는 disclosure 슬롯을 켜고 dot 슬롯을 끈 변형으로 보인다.

### 2.4 aria / role — 실측

| 항목 | 결과 |
|---|---|
| `role="tree"` / `role="treeitem"` | **0개** |
| `aria-level` | **0개** |
| `aria-expanded` | **0개** |
| `aria-current` | **0개** |
| `aria-label` | **0개** |
| 폴더 그룹 / LI / 버튼 / disclosure / 자식 UL / 자식 LI의 aria 속성 | **전부 없음** |
| disclosure `tabIndex` | **−1** (포커스 불가) |
| 폴더 버튼 accessible name | 라벨 텍스트("ZZ Folder")로 형성됨 |

**계층 정보가 접근성 트리에 전혀 노출되지 않는다.** 중첩은 순수하게 시각적이다.

---

## 3. Tree Depth / Indentation 실측

### 3.1 x 좌표 사다리

| 기준선 | Folder (depth 0) | Root List (depth 0) | **Child List (depth 1)** |
|---|---|---|---|
| LI 좌측 | **50** | **50** | **50** |
| LI padding | `0 10px` | `0 10px` | `0 10px` |
| wrapper(`DIV.h-full`) 좌측 | 60 | 60 | 60 |
| **wrapper padding-left** | **0** | **0** | **26px** |
| **button 좌측** | **60** | **60** | **86** |
| button 폭 | 219 | 219 | **193** |
| button **우측** | **279** | **279** | **279** |
| button padding-left | 12 | 12 | 12 |
| disclosure 슬롯 | **60 – 74** (14폭) | — | — |
| **icon 좌측** | **72** | **72** | **98** |
| **label 좌측** | **98** | **98** | **124** |
| label 폭 | 145 | 133 | **107** |
| color dot | **없음** | 231 (8폭) | **231** (8폭) |
| trailing 슬롯 | 243 – 267 | 243 – 267 | **243 – 267** |

### 3.2 depth 증가량

```
Depth 0 label x = 98
Depth 1 label x = 124
depth 0 → depth 1 증가량 = 26
Depth 2 = 존재하지 않음 (§3.4)
```

button·icon·label이 **모두 정확히 +26**으로 함께 이동한다.

### 3.3 26px은 어디서 나오는가 — 분해

후보를 하나씩 확인했다.

| 후보 | 실측 | 판정 |
|---|---|---|
| LI의 `padding-left` | root 10 / child **10** (동일) | ✘ |
| LI의 `margin-left` | 둘 다 `0px` | ✘ |
| button의 `padding-left` | 둘 다 `12px` (동일) | ✘ |
| button의 `margin-left` | 둘 다 `0px` | ✘ |
| `transform` | 둘 다 `none` | ✘ |
| spacer 요소 | 없음 | ✘ |
| 자식 UL(`group-project-ul`)의 padding/margin | **둘 다 `0px`** | ✘ |
| **`DIV.h-full` 래퍼의 `padding-left`** | root **`0px`** / child **`26px`** | **✔ 이것이다** |

**[Observed] 들여쓰기의 유일한 출처는 LI와 BUTTON 사이에 있는 `DIV.h-full` 래퍼의 `padding: 0px 0px 0px 26px`이다.** 자식 컨테이너 UL은 padding·margin이 0이라 들여쓰기에 전혀 기여하지 않는다.

**[Inference]** 들여쓰기를 **행 안쪽 래퍼**에 걸었기 때문에, LI의 폭(239)과 우측 끝(289)이 depth와 무관하게 유지된다. 컨테이너에 padding을 걸었다면 자식 전체가 오른쪽 끝까지 함께 좁아졌을 것이다. §10의 "오른쪽 rail 고정"은 이 선택의 직접적 결과다.

### 3.4 depth 2는 존재하지 않는다

리스트 생성 다이얼로그의 `폴더` 드롭다운에는 **`없음` / 기존 폴더 / `새 폴더`** 세 종류만 나온다. 폴더를 다른 폴더 안에 넣는 선택지는 없었다.

**[Observed]** 이 UI에서 만들 수 있는 최대 깊이는 **1단**이다.
**한계**: 리스트 생성 다이얼로그만 확인했다. 폴더 자체의 컨텍스트 메뉴나 드래그로 폴더를 중첩할 수 있는지는 **확인하지 않았다**.

---

## 4. Disclosure / Expand Icon

| 항목 | 값 |
|---|---|
| 실제 요소 | `DIV` (버튼이 아님), `class="h-full absolute transform top-1/2 -translate-y-1/2 flex items-center justify-center group/collapsed"` |
| **hit area** | **14 × 36** — 폭 14, **행 전체 높이** |
| 위치 | `absolute`, button 좌측 끝(x=60)에 겹쳐 놓임 → 아이콘·라벨을 밀지 않음 |
| 아이콘 방식 | **SVG 스프라이트** `<use xlink:href="#thin-triangle-down">` |
| svg 박스 | **12 × 12** |
| 렌더 글리프 | 펼침 **7.58 × 4.14** / 접힘 **4.14 × 7.58** (회전으로 가로세로가 뒤바뀜) |
| fill / stroke | fill **currentColor** / stroke `none` |
| color | `rgba(255,255,255,0.4)` (`text-sidebar-color-40`) |
| **자체 hover** | `group-hover/collapsed:text-sidebar-color` → **`rgb(255,255,255)`** (실측 확인) |
| opacity | **1 — 항상 보인다** (Component 03의 섹션 헤더 chevron은 평소 0이었다. **여기서는 다르다**) |
| radius / background | 0 / 없음 |
| cursor | pointer (svg에 `cursor-pointer`) |
| **tabIndex** | **−1** (포커스 불가) |

### 4.1 expanded ↔ collapsed — 같은 아이콘의 회전

| 상태 | 클래스 | computed transform | 글리프 bbox |
|---|---|---|---|
| **expanded** | (회전 클래스 없음) | `matrix(1, 0, 0, 1, 0, 0)` (none) | 7.58 × 4.14 (아래 방향) |
| **collapsed** | `-rotate-90` | **`matrix(0, -1, 1, 0, 0, 0)`** = rotate(−90°) | 4.14 × 7.58 (오른쪽 방향) |

| 항목 | 값 |
|---|---|
| **아이콘 교체 여부** | **아니다.** `#thin-triangle-down` 하나를 회전시킨다 |
| rotate angle | **−90°** |
| **transform-origin** | **`6px 6px`** (12×12의 중심) |
| **transition** | **`all / 0s`** — 회전 애니메이션 **없음** |

**[Observed]** 예상했던 "collapsed = chevron → right / expanded = 같은 SVG + rotate"가 맞다. 다만 회전 방향이 **−90°**(반시계)이고, 기본형이 "아래 방향 삼각형"이며 접힘이 회전된 상태다. 즉 **펼침이 기본, 접힘이 변형**이다.

---

## 5. Expand / Collapse Interaction

### 5.1 가장 중요한 발견 — 이동과 접기가 완전히 분리돼 있다

| 조작 | 결과 |
|---|---|
| **Folder row 클릭** (라벨 위) | **폴더 뷰로 이동.** URL `#p/…` → **`#g/6a867cfb…/tasks`**, 폴더 버튼 `data-selected="true"`. **접히지 않는다** |
| **Disclosure 클릭** | **접기/펼치기만.** `.l-folder`의 `open` 클래스 토글. **URL 변화 없음**, `data-selected` 변화 없음 |
| **Folder row 더블클릭** | 단일 클릭과 동일(이동). rename 오버레이는 `display:none` 유지, 편집 input 없음 → **이름 편집 아님** |
| **Enter** (폴더 버튼 포커스 상태) | **이동만** (`#g/…`). 접힘 상태 불변 |

**분리 검증**: 기본함을 선택한 상태(`#p/inbox/kanban`)에서 disclosure를 클릭했더니 폴더가 접히면서 **URL이 그대로 `#p/inbox/kanban`**이었고 `data-selected`도 false를 유지했다. → disclosure의 클릭 핸들러가 **전파를 멈춘다**.

**[Observed]** 폴더는 **이동 가능한 목적지이면서 동시에 컨테이너**다. 두 역할이 같은 행 안에서 **좌측 14px(접기) / 나머지(이동)** 로 나뉜다.

**[Inference]** TickTick에서 폴더는 "그 안 모든 리스트의 태스크를 합쳐 보는 뷰"를 갖는다(`#g/` 주소). 그래서 폴더 이름 클릭이 접기가 아니라 이동인 것이 자연스럽다. 접기를 14px 슬롯에만 준 것은 그 대가다.

### 5.2 상태별 실측 (A~F)

| Property | A. expanded | B. collapsed | C. folder hover | D. disclosure hover | E/F. focus-visible |
|---|---|---|---|---|---|
| `.l-folder` 클래스 | `l-folder mb-[2px] **open**` | `l-folder mb-[2px]` | 변화 없음 | 변화 없음 | 변화 없음 |
| chevron transform | none | **rotate(−90°)** | 변화 없음 | 변화 없음 | 변화 없음 |
| chevron color | 40% | 40% | 40% | **100%** | 40% |
| folder icon | `#sidebar-folder-open` | **`#folder`** | 변화 없음 | 변화 없음 | 변화 없음 |
| row background | 투명 | 투명 | **3% (`rgba(255,255,255,0.03)`)** | **3%** | 투명 |
| row `:hover` | false | false | **true** | **true** (버튼 안이므로 함께 hover) | false |
| more 버튼 opacity | 0 | 0 | **1** | **1** | 0 |
| label color / weight | 흰색 100% / 400 | 동일 | 동일 | 동일 | 동일 |
| outline | none | none | none | none | **`auto 1px rgb(71,114,250)`** |
| 자식 행 개수 | **3** | **0 (DOM에서 사라짐)** | 3 | 3 | 3 |

### 5.3 키보드

| 키 | 결과 |
|---|---|
| **Tab** | 폴더 버튼에 **도달함**. `:focus-visible` true, outline `auto 1px rgb(71,114,250)` |
| Tab 순서 | `… → 섹션헤더 + 버튼 → **폴더 버튼** → 폴더 more(peer) → 첫 자식 버튼 → 자식 more → …` |
| **disclosure** | **Tab으로 도달 불가** (`tabIndex: -1`) |
| **ArrowDown** | **아무 일도 없음** (포커스 이동 없음, URL 변화 없음) |
| **ArrowUp** | 미측정 |
| **ArrowRight** | **아무 일도 없음** (펼침 상태 불변) |
| **ArrowLeft** | **아무 일도 없음** (접히지 않음) |
| **Enter** | **폴더 뷰로 이동** (`#g/…`). 접기 아님 |
| **Space** | 버튼 활성화(이동)로 관찰됐으나, 테스트 시퀀스에서 포커스 위치가 모호해 **결과를 확정하지 않는다** |

**[Observed] 키보드로는 폴더를 접거나 펼칠 수 없다.** tree 시맨틱(role/aria-expanded)도 없고 Arrow 키 핸들러도 없다.

---

## 6. Children Container

| 속성 | 값 |
|---|---|
| 요소 | **`UL.group-project-ul.inner-ul`** |
| 위치 | **`DIV.l-folder`의 형제** (자식이 아님) |
| display | `block` |
| height | **112px** (자식 3개: 36×3 + 2×2) — 콘텐츠에 의해 결정 |
| max-height | **`none`** |
| overflow | **`visible`** |
| padding / margin | **`0px` / `0px`** |
| gap | 사용 안 함 (각 자식 래퍼의 `mb-[2px]`로 간격) |
| position | `static` |
| transition | **`all / 0s`** |
| visibility / opacity | `visible` / `1` |

### 6.1 접힐 때 무슨 일이 일어나는가 — 4가지 후보 검증

| 후보 | 실측 |
|---|---|
| 1. **DOM에서 제거** | **✔ 이것이다.** 접힌 뒤 `.l-folder`의 nextElementSibling이 자식 UL이 아니라 다음 root 리스트(`.project.project-dropper`)였고, `.group-project-ul li` 개수 = **0** |
| 2. `display: none` | ✘ (요소 자체가 없음) |
| 3. `height: 0` | ✘ |
| 4. visibility / opacity | ✘ |

**[Observed] React 조건부 렌더링이다.** CSS collapse가 아니다. 펼치면 UL이 다시 마운트되고, 60ms 시점에 이미 최종 높이 112px에 3개 자식이 들어 있었다.

---

## 7. Expand / Collapse Animation

Component 01의 결과를 가정하지 않고 독립 측정했다.

| 측정 | 결과 |
|---|---|
| 클릭 **직전** 실행 중인 애니메이션 | **1개** (`DIV.h-full w-full flex items-cente`, duration 1500ms — Rail의 동기화 스피너로 추정. 사이드바 트리와 무관) |
| 클릭 **직후** `document.getAnimations()` | **동일한 1개.** 새로 생성된 애니메이션 **0개** |
| 60ms 후 | 애니메이션 개수 그대로 1개. UL 높이 **이미 112px**, 자식 3개 |
| 360ms 후 | 동일 |
| 자식 UL `transition` | **`all / 0s`** |
| chevron `transition` | **`all / 0s`** |
| `.l-folder` `transition` | **`all / 0s`** |

| 항목 | 결과 |
|---|---|
| height animation | **없음** (애초에 컨테이너가 마운트/언마운트되므로 불가능) |
| opacity animation | **없음** |
| chevron rotation | **없음** (transition 0s) |
| children translation | **없음** |
| duration / timing | 해당 없음 |

**[Observed] 접기/펼치기는 완전히 즉시다.** Web Animations API 기준으로 새 애니메이션이 하나도 만들어지지 않는다.

**측정 한계**: 탭이 백그라운드라 `requestAnimationFrame` 프레임 샘플링은 불가능했다(§0.3). 위 결론은 `getAnimations()` + `setTimeout` 샘플링 + computed transition 세 가지 근거에 기반한다.

---

## 8. Folder Row vs Normal List Row

| Property | **List Row (root)** | **Folder Row** | 차이 |
|---|---|---|---|
| height | 36 | **36** | 없음 |
| padding-left (button) | 12 | **12** | 없음 |
| padding-right (button) | 12 | **12** | 없음 |
| button x / 폭 | 60 / 219 | **60 / 219** | 없음 |
| icon wrapper | 20 × 20, `mr-[6px]` | **20 × 20, `mr-[6px]`** | 없음 |
| icon 글리프 | 13.8 × 11.0 (`#normal-list`) | **16.8 × 13.1** (`#sidebar-folder-open`) | 글리프만 다름 |
| **disclosure** | **없음** | **있음** (absolute 14×36) | **다름** |
| label x | 98 | **98** | 없음 |
| label 폭 | 133 | **145** | **+12** (dot 자리 없음) |
| font-size / weight | 14 / 400 | **14 / 400** | 없음 |
| text color | `rgb(255,255,255)` | **동일** | 없음 |
| **color dot** | 있음 (8px @231) | **없음** | **다름** |
| hover bg | 3% | **3%** | 없음 |
| selected bg | 8% | **8%** (`data-selected=true` 확인) | 없음 |
| trailing slot | min-w 24 @243–267 | **동일** | 없음 |
| trailing 내용 | count(있을 때) + more | **more만** | **다름** |
| radius | 10px | **10px** | 없음 |
| cursor | pointer | **pointer** | 없음 |
| transition | all / 0s | **all / 0s** | 없음 |

**[Observed] Folder Row는 List Row의 variant다.** 컴포넌트·클래스·기하가 같고, 세 가지 슬롯만 다르다: disclosure(추가), color dot(제거), count(제거).

**[Inference]** 폴더에 dot이 없는 것은 폴더가 색을 갖지 않기 때문이고, count가 없는 것은 폴더가 자체 태스크를 갖지 않기 때문으로 보인다. 다만 **자식 리스트에 태스크가 있을 때 폴더가 합계를 표시하는지는 확인하지 못했다**(내가 만든 리스트 3개가 모두 비어 있다).

---

## 9. Child List Row vs Root List Row

| Property | **Root List Row** | **Child List Row** | 차이 |
|---|---|---|---|
| LI x / 폭 | 50 / 239 | **50 / 239** | **없음** |
| LI padding | `0 10px` | **`0 10px`** | 없음 |
| row height | 36 | **36** | 없음 |
| wrapper padding-left | 0 | **26** | **+26** |
| **button x** | 60 | **86** | **+26** |
| **button 폭** | 219 | **193** | **−26** |
| **button 우측** | **279** | **279** | **없음** |
| icon x | 72 | **98** | +26 |
| label x | 98 | **124** | +26 |
| label 폭 | 133 | **107** | −26 |
| color dot x | 231 | **231** | **없음** |
| trailing slot | 243 – 267 | **243 – 267** | **없음** |
| **hover 배경 범위** | x 60 – 279 | **x 86 – 279** | **왼쪽만 좁아짐** |
| **selected 배경 범위** | x 60 – 279 | **x 86 – 279** | **왼쪽만 좁아짐** |

### 9.1 배경까지 들여쓰기되는가 — 결론

```
Case A ✔ 실측 결과
        [    child content        ]     ← 배경이 26px 들여쓰기됨
[      root content              ]

Case B ✘
[       child content            ]     ← 배경은 full width
```

**[Observed] Case A다.** hover·selected 배경은 **버튼**에 칠해지고, 버튼이 x=86에서 시작하므로 **배경도 함께 26px 들여쓰기된다.** 다만 **오른쪽 끝(279)은 root와 동일**하므로, 배경은 왼쪽만 좁아진 형태다.

**[Inference]** 선택 배경이 계층을 함께 표현하므로, 선택된 자식이 어느 깊이에 있는지 배경 모양만으로도 읽힌다. 오른쪽을 고정한 덕에 배경들이 우측 정렬된 계단처럼 보이고, 목록이 흐트러지지 않는다.

---

## 10. Right Edge Alignment

| 요소 | Folder | Root List | **Child List** |
|---|---|---|---|
| color dot x | 없음 | **231** | **231** |
| trailing slot x | **243** | **243** | **243** |
| trailing slot 우측 | **267** | **267** | **267** |
| more 버튼 x | **251** | **251** | **251** |
| button 우측 | **279** | **279** | **279** |
| LI 우측 | **289** | **289** | **289** |

**[Observed] 오른쪽 rail은 depth와 무관하게 완전히 고정이다.** 들여쓰기 26px은 **왼쪽에서만** 소비되고, 그만큼 라벨 폭이 줄어든다(133 → 107).

**[Inference]** 계층은 왼쪽에서만 표현하고, 오른쪽의 정보 rail(개수·액션)은 안정적으로 유지하려는 구조로 보인다. 사용자가 more 버튼을 누르려고 커서를 옮길 때 depth에 따라 목표 위치가 바뀌지 않는다.

---

## 11. Selection State

| Property | A. Folder 미선택 | B. Folder hover | C. **Folder selected** | D. **Child selected** | E. Child selected + Folder hover | F. Child selected + Child hover |
|---|---|---|---|---|---|---|
| folder bg | 투명 | **3%** | **8% (`bg-grey-8`)** | **투명** | 3% | 투명 |
| folder `data-selected` | false | false | **true** | **false** | false | false |
| folder label color/weight | 흰색 / 400 | 동일 | 동일 | **동일** | 동일 | 동일 |
| folder icon | `#sidebar-folder-open` 흰색 | 동일 | 동일 | **동일** | 동일 | 동일 |
| folder disclosure | 40% | 40% | 40% | **40%** | 40% | 40% |
| folder more | opacity 0 | **1** | — | **0** | **1** | 0 |
| child bg | 투명 | 투명 | 투명 | **8%** | **8%** | **8%** |
| child `data-selected` | false | false | false | **true** | true | true |
| child label / icon | 흰색 / 400 | 동일 | 동일 | **동일** | 동일 | 동일 |
| child more | 0 | 0 | 0 | **0** | 0 | **1** |
| 선택 배경 x 범위 | — | — | 60 – 279 | **86 – 279** | 86 – 279 | 86 – 279 |

### 11.1 부모(ancestor) 상태가 있는가

**[Observed] 없다.** 자식(`ZZ List A`)이 선택된 상태에서 폴더를 측정한 결과:

- `data-selected` = **false**
- background = **투명** (`rgba(0,0,0,0)`)
- label color `rgb(255,255,255)`, weight **400** — 미선택 상태와 **완전히 동일**
- folder icon 색·스프라이트 동일
- disclosure 색 동일

즉 **자식이 선택되어도 부모 폴더에는 아무 시각 변화가 없다.**

**[Inference]** 선택은 "지금 보고 있는 하나의 목적지"만 표시하는 단일 상태이고, 계보(breadcrumb) 개념을 사이드바에 넣지 않았다. 폴더 자체도 선택 가능한 목적지이므로, 폴더에 ancestor 강조를 주면 "폴더가 선택된 것"과 구분되지 않았을 것이다.

---

## 12. Hover Propagation

실제 포인터를 각 지점에 올려 측정했다.

| 포인터 위치 | folder row | child rows | 비고 |
|---|---|---|---|
| **Folder row (라벨 위)** | bg **3%**, `:hover` true, more **1** | **변화 없음** (bg 투명, more 0) | 부모 → 자식 전파 **없음** |
| **Disclosure** | bg **3%**, `:hover` **true**, more **1** | 변화 없음 | disclosure hover가 **행 hover도 발생시킨다** (버튼 내부이므로) + chevron 자체 색 40% → **100%** |
| **Child row** | **변화 없음** (bg 투명, more 0) | 해당 자식 bg **3%**, more **1** | 자식 → 부모 전파 **없음** |
| **Child의 more 버튼** (선택된 행) | 변화 없음 | 행 bg **8% 유지**(선택), `:hover` true, more **1** | trailing action hover에서도 **행 배경 유지** |

**[Observed]**
- 시각적 hover는 **행 단위로만** 발생하고 계층을 타고 오르내리지 않는다.
- disclosure는 별도 hit target이지만 **버튼의 자손**이므로 `:hover`가 함께 성립한다. 이는 이벤트 버블링의 결과이고, 시각 상태로도 그대로 나타난다.
- 반면 **click은 분리**된다(§5.1) — hover는 전파되고 click은 멈춘다.

**[Observed] action click 시 row navigation이 같이 발생하는가**: disclosure는 **발생하지 않는다**(URL 불변으로 검증). more 버튼은 **누르지 않았다**(컨텍스트 메뉴가 열리므로) — 미측정.

---

## 13. Count / More Action

| 항목 | Folder | Root List | Child List |
|---|---|---|---|
| slot 요소 | `DIV.flex-none.flex.items-center.min-w-[24px].justify-end.relative.z-0` | 동일 | 동일 |
| slot x / 폭 | 243 / **24** | 243 / **24** | 243 / **24** |
| slot 높이 | **0** | **16**(count 있을 때) / 0(없을 때) | **0** |
| count `<p>` 존재 | **없음** | 있음 (태스크 > 0일 때) | 없음 (빈 리스트) |
| more 버튼 | 있음, 16×16 @251 | 동일 | 동일 |
| more 색 | `rgba(255,255,255,0.4)` | 동일 | 동일 |
| more 등장 조건 | 행 hover / focus | 동일 | 동일 |

**[Observed]** 트레일링 슬롯 구조는 **세 종류가 완전히 동일**하다. Component 01에서 관찰한 "count ↔ more 교대" 구조를 그대로 쓴다.

**[Observed] 폴더에는 count가 없다.** 다만 내가 만든 자식 리스트가 모두 비어 있어, **자식에 태스크가 있을 때 폴더가 합계를 보여주는지는 확인하지 못했다.**

**[Observed] disclosure가 라벨 폭을 줄이지 않는다.** disclosure는 `absolute`라 flow에서 빠져 있고, 폴더 라벨은 오히려 root보다 **12px 넓다**(145 vs 133) — dot이 없기 때문이다.

---

## 14. Folder Icon / List Icon

| 항목 | **Folder (열림)** | **Folder (닫힘)** | **List (root/child)** |
|---|---|---|---|
| 스프라이트 | **`#sidebar-folder-open`** | **`#folder`** | `#normal-list` |
| wrapper 슬롯 | 20 × 20 | 20 × 20 | 20 × 20 |
| svg 박스 | 20 × 20 | 20 × 20 | 20 × 20 |
| **렌더 글리프** | **16.8 × 13.1** | **15.15 × 13.07** | **13.8 × 11.0** |
| fill | **currentColor** → `rgb(255,255,255)` | 동일 | 동일 |
| stroke | `none` | `none` | `none` |
| 클래스 | `icon-sidebar-folder-open w-full h-full text-sidebar-color` | `icon-folder …` | `icon-normal-list …` |

**[Observed] 폴더 아이콘은 열림/닫힘에 따라 다른 스프라이트로 교체된다.** disclosure chevron이 같은 아이콘을 회전시키는 것과 대조된다 — **같은 상태를 두 가지 다른 방식으로 두 번 표현한다.**

**[Observed] custom list color는 아이콘이 아니라 별도의 8px dot으로 표시된다**(x=231, `border-radius: 9999px`). 내가 만든 리스트는 색을 지정하지 않아 `background-color: transparent`지만 **자리는 차지한다**(Component 01에서 관찰한 것과 동일).

**[Inference]** 아이콘 슬롯을 20×20으로 고정하고 글리프 크기를 13.8~16.8로 다르게 둔 것은, 슬롯 정렬을 유지하면서 각 아이콘의 시각 무게를 개별 조정한 것으로 보인다.

---

## 15. Drag & Drop DOM 준비 상태

실제 드래그는 **수행하지 않았다.** DOM 흔적만 조사했다.

| 항목 | 결과 |
|---|---|
| `draggable` 속성 | **0개** |
| `aria-grabbed` | **0개** |
| 전용 드래그 핸들 | **0개** (`[class*=handle]` 없음) |
| `.project-dropper` / `.drop-hover-target` | **26개** |
| `data-dropper-id` | **15개** (각 리스트·폴더의 id) |
| `data-type="group"` | 폴더 래퍼에 존재 |
| **placeholder 요소** | **9개** — `ui-sortable-placeholder hide`, `project-sortable-placeholder ui-sortable-placeholder hide`. **전부 높이 0, `hide` 클래스** |
| `order` 속성 | 각 항목에 존재 (예: `order=-1651146489856`) |

**[Observed]** jQuery-UI sortable 계열의 구조다. `draggable` 속성이 아니라 **마우스 이벤트 기반**이며, 드롭 위치 표시용 placeholder가 **미리 렌더돼 숨겨져 있다**. 폴더는 `data-type="group"`으로 리스트와 구분된다.

**[Inference]** placeholder를 미리 만들어 두는 것은 드래그 시작 시점의 DOM 삽입 비용을 없애려는 처리로 보인다.

Drag & Drop 인터랙션 자체는 **별도 컴포넌트/단계로 남긴다.**

---

## 16. Typography Hierarchy

| Property | **Folder label** | **Root List label** | **Child List label** |
|---|---|---|---|
| 클래스 | `text-s font-normal flex-auto truncate leading-[20px] text-grey` | **동일** | **동일** |
| font-size | **14px** | **14px** | **14px** |
| font-weight | **400** | **400** | **400** |
| line-height | **20px** | **20px** | **20px** |
| color | `rgb(255,255,255)` | `rgb(255,255,255)` | `rgb(255,255,255)` |
| opacity | 1 | 1 | 1 |
| letter-spacing | normal | normal | normal |
| 라벨 폭 | 145 | 133 | **107** |

**[Observed] 세 종류의 타이포그래피가 완전히 동일하다.** 폴더가 더 굵지도, 더 크지도, 더 밝지도 않다. 차이는 **아이콘 종류와 x 위치뿐**이다.

**[Inference]** 계층 표현을 **위치(들여쓰기)와 아이콘**에만 맡기고 텍스트 스타일은 건드리지 않았다. Component 03의 섹션 헤더가 12px/700/30%로 확실히 다른 것과 대비된다 — 즉 **섹션 헤더는 "라벨", 폴더는 "항목"**으로 취급된다.

---

## 17. Vertical Rhythm

### 17.1 y 좌표 실측 (expanded)

| 행 | y | 간격 |
|---|---|---|
| ZZ Folder | **189** | |
| ZZ Very Long List… (child 1) | **227** | **38** |
| ZZ List B (child 2) | **265** | **38** |
| ZZ List A (child 3) | **303** | **38** |
| d (다음 root) | **341** | **38** |
| Fidelity Audit | 379 | 38 |
| 학교 | 417 | 38 |
| 해야 하는 일 | 455 | 38 |

**pitch = [38, 38, 38, 38, 38, 38, 38]** — 전 구간 균일.

### 17.2 38px의 구성

| 관계 | 구성 |
|---|---|
| folder → 첫 child | 행 36 + **`.l-folder`의 `margin-bottom: 2px`** = 38 |
| child → child | 행 36 + **`.project.project-dropper`의 `margin-bottom: 2px`** = 38 |
| 마지막 child → 다음 root | 행 36 + `margin-bottom: 2px` = 38. **자식 UL은 margin·padding이 0**이라 추가 간격 없음 |

**[Observed] Component 01의 "36px 행 + 2px" 리듬이 트리 안에서도 그대로 유지된다.** 폴더 경계에서도, 자식 그룹의 시작·끝에서도 리듬이 흐트러지지 않는다.

### 17.3 접었을 때 빈 공간이 남는가

**[Observed] 남지 않는다.** 접힌 상태에서 자식 UL은 DOM에서 제거되고, `.l-folder`(36 + mb 2 = 38)만 남아 다음 root 행이 정확히 +38에 온다.

---

## 18. Focus / Keyboard Navigation

| 항목 | 결과 |
|---|---|
| Folder row focus | **가능** (네이티브 `<button>`) |
| Folder row focus ring | **`outline: auto 1px rgb(71,114,250)`**, `:focus-visible` true |
| disclosure focus | **불가** (`tabIndex: -1`, DIV) |
| child row focus | 가능 (Tab 순서상 폴더 more 다음) |
| Tab 순서 | 섹션헤더 `+` → **폴더 버튼** → 폴더 more(`.peer` DIV) → 자식 버튼 → 자식 more → … (행당 2 스톱) |
| Shift+Tab | 미측정 |
| ArrowUp / ArrowDown | **ArrowDown 무반응** (ArrowUp 미측정) |
| ArrowLeft / ArrowRight | **둘 다 무반응** (접힘 상태 불변) |
| Enter | **이동** (`#g/…`) |
| Space | 버튼 활성화로 보이나 시퀀스상 포커스 위치가 모호해 **미확정** |
| tree semantics | `role="tree"` **0** · `role="treeitem"` **0** · `aria-level` **0** · `aria-expanded` **0** |

**[Observed] 트리 키보드 규약(Arrow로 이동/펼침)이 구현돼 있지 않다.** Tab만으로 순차 이동하며, 접기는 마우스 전용이다.

---

## 19. Accessibility (실제 DOM에 존재하는 것만)

| 항목 | 결과 |
|---|---|
| `aria-expanded` | **없음** |
| `aria-current` | **없음** |
| `aria-label` | **없음** |
| `role` | **없음** (`tree`/`treeitem`/`group` 전부 없음) |
| `aria-level` | **없음** |
| tabindex | 폴더 버튼 0(네이티브) / disclosure **−1** |
| 폴더 버튼 accessible name | 라벨 텍스트로 형성 ("ZZ Folder") |
| more 버튼 accessible name | **없음** (Component 01·03과 동일) |
| 계층 정보 노출 | **없음** — 자식이 부모에 속한다는 사실이 보조기술에 전달되지 않는다 |
| 선택 상태 노출 | **없음** (`data-selected`는 style hook도 아니고 aria도 아님 — Component 03에서 검증한 대로 JS 마커) |

개선안은 **Appendix A**에만 적는다.

---

## 20. CSS Cascade / Utility 분류

| 값 | 출처 분류 | 상세 |
|---|---|---|
| **indentation 26px** | **B. Tailwind/utility 상수** | `DIV.h-full`의 `padding-left`. 클래스 문자열이 아니라 computed `0px 0px 0px 26px`로 관찰됨. 토큰(custom property) 아님 |
| **selected bg** | **A + C** | 조건부 클래스 `bg-grey-8` → `rgba(var(--color-grey), var(--opacity-variant-grey-8))` = `rgba(255,255,255,0.08)` |
| **hover bg** | **A + B** | `hover:bg-grey-3` → `rgba(255,255,255,0.03)` |
| **text color** | **A** | `text-grey` → `--color-grey` = `255,255,255` |
| **icon color** | **A** | `text-sidebar-color` → `--color-sidebar-color` = `255,255,255` |
| **icon opacity (chevron)** | **A** | `text-sidebar-color-40` → `--opacity-variant-sidebar-color-40` = 0.4 |
| **disclosure rotation** | **C. 컴포넌트 조건부 클래스** | 접힘일 때만 `-rotate-90` 클래스 추가 → `matrix(0,-1,1,0,0,0)` |
| **children visibility** | **C** | CSS가 아니라 **조건부 렌더링**. `.l-folder`의 `open` 클래스는 상태 표시일 뿐, 자식 UL은 별도로 마운트/언마운트 |
| **action visibility** | **B** | `opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100` |
| **radius 10px** | **B** | `rounded-[10px]` (임의값). Component 03의 섹션 헤더는 `rounded-default`(상수)를 썼다 |
| **row height 36 / pitch 2** | **B** | `h-[36px]`, `mb-[2px]` |
| **label 폭 145/133/107** | **D. layout-derived** | flex 잔여 폭 |
| **line box 20px** | **B** | `leading-[20px]` (Component 03의 섹션 제목은 `normal` → browser-derived였다) |
| **글리프 bbox** | **E. browser-derived** | 스프라이트 심볼의 렌더 결과 |
| **focus ring `auto 1px`** | **E** | UA 기본, 색만 `--color-primary` |

### 20.1 `data-*` 속성이 style hook인가 — 검증

| 속성 | 검증 |
|---|---|
| `data-selected` | Component 03에서 **style hook이 아님**을 실험으로 확인(속성만 바꿔도 배경 불변). 이번에도 값은 상태와 함께 움직이지만 배경은 `bg-grey-8` **클래스 교체**로 그려진다 |
| `data-type="group"` | 폴더 래퍼 식별용. 시각 속성 없음 |
| `data-dropper-id` | DnD 대상 id |
| `.open` 클래스 (`.l-folder`) | 상태 표시. 자식 렌더는 별도 조건부 렌더링이므로 이 클래스가 자식을 숨기는 것은 아니다 |

---

## 21. Responsive Width

**미측정.** 두 가지 방법을 모두 시도했으나 이 환경에서는 불가능했다.

1. **viewport 변경** — `resize_window`가 성공을 보고하지만 CSS 뷰포트(`innerWidth`)는 763에 고정된 채 변하지 않는다(Component 02에서 확인된 것과 같은 제약).
2. **사이드바 폭 드래그** — `.detail-dragger`(x=285, 5px, `ew-resize`)에 합성 드래그를 걸었으나 폭이 240 그대로였다. 실제 드래그 핸들러가 합성 이벤트에 반응하지 않는 것으로 보인다.

따라서 다음은 확인하지 못했다: 폭 변경 시 child indentation 유지 여부, 라벨 폭 변화, trailing slot 위치, 말줄임 발생 시점, depth로 인한 최소 폭 문제.

**부수적으로 확인된 것**: 사이드바 폭 240 · 뷰포트 763에서, folder/root/child의 x·폭·우측 끝은 §3.1 표 그대로이며, 측정 중 여러 번 재확인해도 동일했다.

---

## 22. Long Label / Ellipsis

측정용으로 만든 `ZZ Very Long List Name For Truncation Test`(child, depth 1)로 측정했다.

| 항목 | 값 |
|---|---|
| 라벨 박스 폭 | **107px** |
| **실제 텍스트 렌더 폭** | **267px** |
| 잘림 여부 | **잘림** (텍스트가 박스의 2.5배) |
| white-space | `nowrap` |
| overflow | `hidden` |
| text-overflow | **`ellipsis`** |
| min-width | `auto` |
| flex | `grow 1 / shrink 1` |
| trailing action과 충돌 | **없음** — 라벨이 flex-auto로 남는 폭만 차지하고, dot·trailing은 `flex-none` |

### 22.1 사용 가능한 라벨 폭 계산

```
available label width
  = button 내부 폭 (button 폭 − pl 12 − pr 12)
  − icon slot 20 − icon margin-right 6
  − color dot 8 − dot margin-right 4
  − trailing slot min-width 24
```

| depth | button 폭 | 내부 폭 | − icon(26) | − dot(12) | − trail(24) | **결과** | 실측 |
|---|---|---|---|---|---|---|---|
| root (0) | 219 | 195 | 169 | 157 | **133** | 133 | **133 ✔** |
| child (1) | **193** | 169 | 143 | 131 | **107** | 107 | **107 ✔** |
| folder | 219 | 195 | 169 | (dot 없음) 169 | **145** | 145 | **145 ✔** |

**[Observed] depth가 1 깊어질 때마다 라벨 폭이 정확히 26px 줄어든다.** 240px 사이드바에서 depth 1의 라벨은 107px — 14px 텍스트로 한글 약 7~8자, 라틴 약 13자 수준이다.

**[Inference]** depth가 2단만 되어도 라벨 폭이 81px까지 떨어진다. 폴더 중첩을 1단으로 제한한 것(§3.4)은 이 폭 예산과 무관하지 않아 보인다. **다만 depth 2를 만들 수 없어 검증하지 못한 추론이다.**

---

## 23. Tree Geometry Diagram (실측값)

```
viewport 763 × 392 · sidebar 50 … 290 (240 wide, 우측 1px 하이라인)

x=50        60        72   78  98                    231 243   267 279  289
 │           │         │    │   │                      │   │     │   │    │
 ├─10px──────┤         │    │   │                      │   │     │   │    │
 │  LI padding         │    │   │                      │   │     │   │    │
 │                     │    │   │                      │   │     │   │    │
 │  ┌────────────────── FOLDER ROW (button 60…279, h 36, r 10) ──────┐   │
 │  │◀14▶│◀12▶│ 20 │◀6▶│ label ……………………… 145 ………………│  24 │◀12▶│   │
 │  │ ▾  │pad │📁 │   │ ZZ Folder                    │ ⋯   │    │   │
 │  └──────────────────────────────────────────────────────────────┘   │
 │   ▲ disclosure absolute 14×36 (x 60…74)          ▲ trailing 243…267 │
 │                                                                      │
 │        ┌─────────── CHILD ROW (button 86…279, h 36, r 10) ──────┐    │
 │        │◀12▶│ 20 │◀6▶│ label ……… 107 ………│ ● │◀4▶│ 24 │◀12▶│    │
 │        │pad │ ≡  │   │ ZZ List A         │dot│   │ ⋯  │    │    │
 │        └──────────────────────────────────────────────────────┘    │
 │        ▲ x=86 = 60 + 26 (wrapper padding-left)                      │
 │                                                                      │
 └──────────────────────────────────────────────────────────────10px──┘

세로 (expanded):
   y=189  ┌ ZZ Folder                    36 + mb 2
   y=227  ├── child 1                    36 + mb 2
   y=265  ├── child 2                    36 + mb 2
   y=303  └── child 3                    36 + mb 2
   y=341  d  (다음 root)                 pitch 38 유지

세로 (collapsed):
   y=189  ┌ ZZ Folder  ▸                 36 + mb 2   ← 자식 UL은 DOM에서 제거
   y=227  d  (다음 root)                 pitch 38, 빈 공간 없음
```

---

## 24. Observed vs Inference

### 24.1 [Observed]

1. 들여쓰기의 **유일한 출처**는 LI와 BUTTON 사이 `DIV.h-full` 래퍼의 `padding-left: 26px`이다. margin·transform·spacer·컨테이너 padding 전부 아니다.
2. **depth 1 증가량 = 26px.** button·icon·label이 함께 +26 이동하고 라벨 폭은 −26.
3. **오른쪽 rail(dot 231 / trailing 243–267 / button 우측 279)은 depth와 무관하게 고정.**
4. hover·selected 배경은 **왼쪽만 들여쓰기된다**(Case A). 오른쪽 끝은 root와 동일.
5. **폴더 행 클릭 = 이동**(`#g/<groupid>`), **disclosure 클릭 = 접기**. URL 불변으로 분리를 검증했다.
6. disclosure는 **14 × 36 absolute 슬롯**, `tabIndex: -1`, 항상 보임(opacity 1). Component 03 섹션 헤더의 chevron이 평소 0인 것과 **다르다**.
7. chevron은 **같은 스프라이트를 −90° 회전**(transform-origin `6px 6px`)하고, **폴더 아이콘은 스프라이트 자체를 교체**한다(`#sidebar-folder-open` ↔ `#folder`).
8. 접기 = **자식 UL을 DOM에서 제거**(조건부 렌더링). `display:none`·`height:0`·opacity 전부 아니다.
9. **애니메이션 0개.** 클릭 전후 `getAnimations()` 동일(무관한 1개), 60ms에 이미 최종 높이, 모든 transition `0s`.
10. **Folder Row는 List Row와 동일한 컴포넌트**다. 클래스·높이 36·radius 10·padding 12/12·hover 3%·selected 8%·trailing 슬롯이 모두 같고, disclosure(추가)·dot(제거)·count(제거)만 다르다.
11. **타이포그래피는 세 종류(폴더/root/child)가 완전히 동일**하다 — 14px/400/흰색/line-height 20.
12. **자식이 선택되어도 부모 폴더는 아무 변화가 없다** (ancestor 상태 없음).
13. hover는 **행 단위**로만 발생하고 부모↔자식으로 전파되지 않는다. 반면 disclosure hover는 버튼 자손이라 행 hover를 함께 일으킨다.
14. **pitch 38이 트리 전체에서 유지**된다. 접었을 때 잔여 공간도 없다.
15. 키보드로는 **접기/펼치기 불가**. Arrow 키 무반응, tree 시맨틱·aria 전무.
16. 라벨 사용 가능 폭 = 133(root) / 107(child) / 145(folder), 모두 계산과 일치.
17. DnD는 `draggable` 속성 없이 **sortable 계열**이며 placeholder 9개가 미리 렌더돼 숨겨져 있다.
18. 이 UI에서 만들 수 있는 **최대 깊이는 1단**이다(생성 다이얼로그 기준).

### 24.2 [Inference]

1. 들여쓰기를 **행 안쪽 래퍼**에 건 것은 오른쪽 rail을 고정하기 위한 선택으로 보인다. 컨테이너에 걸었다면 우측도 함께 좁아졌을 것이다.
2. 계층을 **왼쪽에서만** 표현하고 오른쪽 정보 rail을 고정한 것은, depth가 달라져도 액션 목표 위치가 움직이지 않게 하려는 의도로 읽힌다.
3. 폴더가 **목적지이면서 컨테이너**이기 때문에 이름 클릭을 이동에 배정하고, 접기를 14px 슬롯에 밀어 넣은 것으로 보인다.
4. 폴더 상태를 **chevron 회전 + 아이콘 교체** 두 방식으로 중복 표현하는 것은, 작은 chevron만으로는 상태가 잘 안 읽히기 때문으로 보인다.
5. 타이포를 전혀 바꾸지 않고 위치·아이콘만으로 계층을 표현한 것은, 사이드바 전체를 **한 종류의 목록**으로 읽히게 하려는 선택으로 보인다(Component 03의 섹션 헤더만 확실히 다른 것과 대비).
6. depth 1에서 라벨 폭이 107px까지 줄어드는 것을 보면, 중첩을 1단으로 제한한 것과 폭 예산이 무관하지 않아 보인다. **depth 2를 만들 수 없어 검증하지 못했다.**

### 24.3 이번 회차에 재지 못한 것

- **폴더의 count 합계** — 자식 리스트가 모두 비어 있어 확인 불가.
- **depth 2** — UI가 제공하지 않음(생성 다이얼로그 기준). 폴더 컨텍스트 메뉴/드래그로 가능한지는 미확인.
- **Responsive** — 뷰포트·사이드바 폭 모두 변경 불가(§21).
- **Space 키** — 시퀀스상 포커스가 모호해 미확정. **ArrowUp / Shift+Tab** 미측정.
- **more 버튼 클릭** — 컨텍스트 메뉴가 열리므로 누르지 않음.
- **드래그 동작** — 수행하지 않음(§15).
- **라이트 테마** — 다크에서만 측정.
- **원본 CSS 규칙** — CORS 차단(Component 01~03과 동일).

---

## 25. Fidelity Specification

관찰된 TickTick 동작만 적는다. 개선안은 Appendix A.

```
FOLDER TREE

Folder Row
  height              : 36px
  outer x             : LI 좌우 padding 10px (root row와 동일)
  inner padding       : 좌 12 / 우 12
  radius              : 10px
  background          : normal 없음 / hover 전경색 3% / selected 전경색 8%
  typography          : 14px / 400 / line-height 20 / 전경색 100%
                        (root·child 리스트 라벨과 완전히 동일)
  구성 슬롯           : [disclosure][folder icon][label][trailing]
                        color dot 없음 · count 없음
  label 사용 가능 폭  : 145 (240px 사이드바 기준)
  클릭                : 폴더 뷰로 이동 (접기 아님)
  더블클릭            : 단일 클릭과 동일 (이름 편집 아님)

Disclosure
  hit area            : 14 × 36 (폭 14, 행 전체 높이)
  위치                : absolute, 행 좌측 끝에 겹침 → 아이콘·라벨을 밀지 않음
  icon size           : svg 12 × 12, 글리프 7.58 × 4.14
  color               : 전경색 40% / 자체 hover 시 100%
  가시성              : 항상 보임 (opacity 1)
  expanded transform  : none (아래 방향)
  collapsed transform : rotate(-90deg), transform-origin 6px 6px
  transition          : 없음 (0s)
  클릭                : 접기/펼치기만. 전파를 멈춰 행 이동이 함께 일어나지 않음
  포커스              : 불가 (tabindex -1)

Folder Icon
  wrapper             : 20 × 20, margin-right 6
  actual icon         : 열림 16.8 × 13.1 / 닫힘 15.15 × 13.07
  스프라이트          : 열림/닫힘이 서로 다른 심볼 (회전이 아니라 교체)
  color               : currentColor, 전경색 100%

Children Container
  요소                : UL — folder 래퍼의 형제 (자식 아님)
  display             : block
  padding / margin    : 0 / 0  (들여쓰기에 기여하지 않음)
  max-height/overflow : none / visible
  expanded            : 마운트, 높이는 콘텐츠가 결정
  collapsed           : DOM에서 제거 (조건부 렌더링)
  transition          : 없음

Child Row
  height              : 36px (root와 동일)
  depth offset        : 26px
  indentation source  : LI와 BUTTON 사이 래퍼의 padding-left
  button              : x = root + 26, 폭 = root − 26, 우측 끝은 root와 동일
  label x             : root + 26
  label 사용 가능 폭  : root − 26 (240px 사이드바에서 107)
  trailing right edge : root와 동일 (고정)
  color dot           : 있음, root와 같은 x
  hover               : 전경색 3%, 배경 범위는 들여쓰기된 button 폭
  selected            : 전경색 8%, 배경 범위 동일하게 들여쓰기됨
  typography          : root·folder와 완전히 동일

Depth Model
  depth 0 offset      : 0
  depth 1 offset      : 26px
  depth 2             : 이 UI에 존재하지 않음
  increment rule      : depth당 +26px (래퍼 padding-left), 우측은 불변

Vertical Rhythm
  folder → first child: 38 (행 36 + folder 래퍼 margin-bottom 2)
  child → child       : 38 (행 36 + 자식 래퍼 margin-bottom 2)
  last child → next root: 38 (자식 UL이 여백을 추가하지 않음)
  collapsed           : 잔여 공간 없음. folder 38 뒤 곧바로 다음 root

Selection
  단일 선택. 폴더도 선택 가능한 목적지 (`data-selected`)
  자식 선택 시 부모 폴더에 ancestor 표시 없음

Hover
  행 단위로만 발생. 부모↔자식 전파 없음
  disclosure hover는 (자손이므로) 행 hover를 함께 일으킴
  선택된 행에 hover해도 배경은 8% 유지, trailing action만 등장

Keyboard
  Tab                 : 폴더 버튼 도달 가능, focus ring `auto 1px` accent
  Tab 순서            : 행 버튼 → 그 행의 more → 다음 행 (행당 2 스톱)
  disclosure          : Tab 도달 불가
  Enter               : 이동
  Arrow (Down/Left/Right): 무반응
  접기/펼치기         : 키보드로 불가

Accessibility (관찰된 그대로)
  role / aria-expanded / aria-level / aria-current / aria-label : 전부 없음
  계층 정보가 접근성 트리에 노출되지 않음

Drag & Drop 준비 상태
  draggable 속성 없음. sortable 계열 (마우스 이벤트 기반)
  드롭 placeholder가 미리 렌더돼 숨겨져 있음
  폴더는 data-type="group"으로 구분
```

---

## 26. Component 01~04 Candidate Shared Rules

**2개 이상의 컴포넌트에서 실제로 반복 확인된 값만** 적는다. **아직 Design Token으로 확정하지 않는다.**

| 후보 규칙 | 01 Row | 02 Shell | 03 Header | 04 Tree | 상태 |
|---|---|---|---|---|---|
| **전경색 1개(흰색) × 알파로 위계** | ✔ | ✔ | ✔ | ✔ | **4/4** |
| **transition 없음 (0s)** | ✔ | ✔(스크롤바 0.3s만 예외) | ✔ | ✔ | **4/4** |
| **그림자 없음** | ✔ | ✔ | ✔ | ✔ | **4/4** |
| **hover 배경 = 전경색 3%** | ✔ | — | ✔ | ✔ | **3/3** |
| **바깥 gutter 10px (LI 좌우 padding)** | ✔ | — | ✔ | ✔ | **3/3** |
| **LI 좌우 10px은 클릭 불가 완충대** | ✔ | — | ✔ | (구조 동일, 미검증) | **2/2** |
| **focus ring = `auto 1px` accent, offset 0** | ✔ | — | ✔ | ✔ | **3/3** |
| **액션은 평소 숨김 → hover/focus에서 등장** | ✔ | — | ✔ | ✔ | **3/3** |
| **액션 hit area 16 × 16** | ✔ | — | ✔ | ✔ | **3/3** |
| **selected 배경 = 전경색 8% (클래스 교체)** | ✔ | — | — | ✔ | **2/2** |
| **row height 36** | ✔ | — | ✘(헤더 30) | ✔ | **2/2** (헤더는 별종) |
| **row pitch 38 (36 + 2)** | ✔ | ✔ | — | ✔ | **3/3** |
| **row radius 10px** | ✔ | — | ✘(헤더 6) | ✔ | **2/2** (헤더는 별종) |
| **아이콘 슬롯 20 × 20 + margin-right 6** | ✔ | — | — | ✔ | **2/2** |
| **trailing 슬롯 min-width 24, 우측 끝 267** | ✔ | — | — | ✔ | **2/2** |
| **행 라벨 14px / 400 / line-height 20** | ✔ | — | ✘(헤더 12/700) | ✔ | **2/2** |
| **좁은 슬롯을 absolute로 겹쳐 배치(밀지 않기)** | ✔(count↔more) | — | ✔(chevron) | ✔(disclosure) | **3/3** |
| **색은 토큰 / 치수는 임의값** | ✔ | ✔ | 부분 반례(`rounded-default`) | ✔ | **3.5/4** |
| **aria 사실상 없음** | ✔ | — | ✔ | ✔ | **3/3** |

### 26.1 spacing grid — 여전히 유보

04에서 새로 나온 값: **26**(들여쓰기) · 14 · 12 · 6 · 4 · 2 · 8 · 20 · 24 · 36 · 38.
**26은 4의 배수가 아니다.** 2의 배수는 만족.

네 컴포넌트를 통틀어 4배수를 벗어나는 값: 2 · 6 · 10 · 11 · 14 · 18 · 26 · 30 · 33 · 38 · 50.
→ **"2px 격자, 4배수 선호"까지가 여전히 최대치**이며, 8pt 그리드는 지지되지 않는다. 확정 토큰으로 선언하지 않는다.

### 26.2 Conflict / Revision Candidate

기존 문서를 수정하지 않고, 충돌·보강 후보만 기록한다.

| # | 기존 문서의 서술 | 04의 관찰 | 성격 |
|---|---|---|---|
| **R-1** | **C01 §2.10 / §3** — 행의 trailing 슬롯은 "카운트(P, 높이 16)와 more가 자리를 공유" | 태스크가 0개인 리스트에서는 **count `<p>`가 아예 렌더되지 않고** 슬롯 높이가 0이다 | **보강**. count는 "숨겨지는" 것이 아니라 **조건부 렌더**. C01의 관찰(count 1이 있던 행)과 모순은 아니다 |
| **R-2** | **C03 §4** — 섹션 헤더 chevron 슬롯 폭(14) = 트리거의 `padding-left`(14)라서 "나타나도 제목이 밀리지 않는다" | 폴더 행에서는 disclosure 슬롯 14 vs button `padding-left` **12**로 **2px 어긋난다**. 밀리지 않는 이유는 슬롯 폭이 아니라 **`absolute`** 때문 | **정정 후보**. C03의 인과 설명이 이 사례에는 적용되지 않는다. 공통 규칙은 "폭 일치"가 아니라 **"absolute로 flow에서 뺀다"** 쪽이 맞다 |
| **R-3** | **C03 §7** — 섹션 헤더 chevron은 평소 `opacity: 0`, hover에서만 등장 | 폴더 disclosure는 **항상 opacity 1** | **차이 기록**. 같은 아이콘·같은 회전 방식이지만 가시성 규칙이 반대다. 상태를 항상 보여야 하는 컨트롤(폴더)과 그렇지 않은 것(섹션)의 구분으로 보이나, 섹션 헤더도 접힘 상태를 가지므로 **일관되지 않는다** |
| **R-4** | **C02 §6** — 섹션 패딩이 위치·상태에 따라 달라 "균일한 규칙이 없다" | 트리 쪽은 반대로 **pitch 38이 예외 없이 유지**된다 | **보강**. 불균일은 섹션 레벨의 문제이고 행 레벨은 균일하다 |
| **R-5** | **C01 §4.1** — 선택된 행은 hover에 반응하지 않는다(hover 클래스가 제거되므로) | 선택된 자식 행에 hover하면 배경은 8% 그대로지만 **trailing more는 등장한다** | **보강**. "아무 변화 없음"이 아니라 **배경만 불변**이고 group-hover 기반 액션은 여전히 동작한다 |

---

## Appendix A — 우리 앱에 적용할 때 다르게 할 것 (관찰이 아닌 제안)

**아래는 TickTick 동작이 아니다.**

1. **tree 시맨틱을 넣는다.** `role="tree"` / `role="treeitem"` / `aria-level` / `aria-expanded`가 전무하다. 최소한 폴더 행에 `aria-expanded`와 자식 컨테이너 연결은 필요하다.
2. **키보드로 접을 수 있게 한다.** TickTick은 마우스 전용이다. disclosure를 `<button>`으로 만들거나, 행 포커스 상태에서 `ArrowLeft/ArrowRight`로 접기/펼치기를 붙인다.
3. **disclosure hit area 14×36 → 최소 24×24 확보.** 폭 14는 좁다. 시각적 아이콘은 12를 유지하되 클릭 영역만 넓힌다.
4. **접기 상태를 DOM 제거 대신 유지 검토.** 리스트가 많은 폴더를 자주 여닫으면 재마운트 비용이 든다. 우리 규모에서는 측정 후 결정한다.
5. **depth 2 이상을 지원한다면 들여쓰기 단위를 26보다 줄인다.** 240px 사이드바에서 depth 1의 라벨 폭이 이미 107px이다. depth 2면 81px로 한글 5~6자밖에 안 들어간다. 16~20px 단위를 권한다.
6. **폴더 상태 표현을 하나로 통일.** TickTick은 chevron 회전과 폴더 아이콘 교체를 **둘 다** 쓴다. 하나로 줄여도 충분하고, 아이콘 스프라이트 하나를 아낄 수 있다.
7. **ancestor 힌트를 고려한다.** 자식이 선택됐을 때 부모에 아무 표시가 없어, 접힌 폴더 안에 선택된 리스트가 있으면 어디에 있는지 알 수 없다. 접힌 폴더에 한해 약한 표시를 주는 것을 검토한다.
8. **폴더 클릭의 기본 동작을 재고한다.** TickTick은 이동이지만, 우리 앱에 폴더 집계 뷰가 없다면 **클릭 = 접기/펼치기**가 더 자연스럽다. 이건 기능 유무에 따른 결정이다.

---

## 27. 이 문서가 남긴 것

- Component 01~03 문서는 **수정하지 않았다.** 충돌·보강 후보는 §26.2에만 기록했다.
- 우리 앱 코드는 **수정하지 않았다.**
- TickTick 계정에 만든 테스트 데이터(`ZZ Folder` + 리스트 3개)는 **남아 있다.** 삭제를 원하시면 알려주시면 지우겠다.
