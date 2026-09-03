# 보드에서 카드를 열면 가운데 팝업 — 오른쪽 패널이 아니라

> 상태: **구현됨** (보드 = v0.21.4 · 매트릭스 = §12, 2026-09-03)
> (사용자가 참조 앱에서 칸반 카드를 열었을 때 뜨는 팝업 한 장을 캡처해 주었다.)
> 대상: `domain/tasks/responsive.ts` · `components/tasks/TasksModule.tsx` ·
> `components/tasks/TaskDrawer.tsx` · `styles/17-tasks-module.css`

## 0. 근거 수준

| 등급 | 무엇 | 표기 |
|---|---|---|
| **관찰** | 스크린샷 1장 — 칸반에서 카드를 연 팝업의 위·아래 가장자리가 잘린 크롭 | [관찰] |
| **실측** | `responsive.ts` · `TasksModule.tsx` · `TaskDrawer.tsx` · `TaskDetailPane.tsx` · `17-tasks-module.css` | [실측] |
| **결정** | 사용자가 착수 시점에 고른 것 하나: "보드에서는 오른쪽 말고 팝업" | [결정] |
| **추론** | 크롭 때문에 보이지 않은 치수 · 스크림 · 닫기 규칙 | [추론] |

크롭이라 **팝업의 실제 폭·높이·화면 안 위치·뒤 배경의 어두워짐**은 보이지 않았다.
그 넷은 전부 [추론]이고, §5에서 값과 근거를 따로 적는다.

---

## 1. 스크린샷이 보여 준 것 [관찰]

잘린 창 안에 세 층이 있다.

1. **상단 속성 바** — `○` 완료 체크 │ 구분선 │ `▦ Oct 3, 30d left` 일정 칩 │ (오른쪽 끝) `⚑` 빨간 깃발.
   상단 바 아래에 파란 선 한 조각이 왼쪽에 걸려 있다 — 탭 인디케이터가 아니라 속성 바와
   본문을 가르는 선 위의 표시로 보인다. 판단 유보.
2. **본문** — 제목 `asd`(맞춤법 물결 밑줄 = 편집 가능한 필드), 오른쪽 위 `☰`(내용 모드 토글),
   그 아래는 빈 여백. 스크롤 영역.
3. **하단 바** — 왼쪽 `⇥ Inbox`(리스트 선택), 오른쪽 `A`(내용 모드) `💬`(댓글) `⋯`(더 보기).

즉 **지금 `TaskDrawer`가 이미 그리고 있는 해부 구조와 같다** — 상단 속성 헤더(완료·일정·
우선순위), 스크롤 본문, 하단 푸터(리스트 피커 + `⋯`).
[실측] `TaskDrawer.tsx`의 `.tm-drawer-head` / `.tm-drawer-scroll` / `.tm-drawer-foot`.

**그러므로 이 작업은 디테일 패널을 새로 만드는 일이 아니다. 같은 컴포넌트를 어디에
그리느냐만 바꾸는 일이다.** 이것이 이 설계 전체의 축이다.

---

## 2. 지금 코드가 하는 일 [실측]

### 2.1 표현 방식은 **뷰포트만의 함수**다

`domain/tasks/responsive.ts`:

```ts
export const TASK_DETAIL_PRESENTATION = {
  wideDesktop: "inline-drawer",
  compactDesktop: "overlay-drawer",
  tablet: "right-sheet",
  mobile: "full-screen",
} as const;

export function taskDetailPresentationFor(mode: ResponsiveMode): TaskDetailPresentation
```

호출자는 둘뿐이다.

- `TasksModule.tsx:1476` — 모듈 안의 모든 뷰(리스트·보드·타임라인)가 이 한 줄을 공유한다.
- `App.tsx:257` — 레거시 페이지(Today·Matrix·Calendar·Project)가 쓰는 값.

**보드인지 리스트인지는 이 함수에 들어가지 않는다.** 그래서 넓은 화면에서 보드의 카드를
열면 오른쪽에 `inline-drawer` **열**이 생긴다.

### 2.2 그 열이 보드에 하는 일

`TasksModule.tsx:1458` 위 주석이 이미 측정값을 적어 두었다:

> 1280에서 셸이 `248px 502px 480px`가 되어 보드가 가질 수 있었던 982 중 438만 남고
> 두 번째 열이 가장자리에서 잘렸다.

리스트 뷰에서는 이 문제를 **빈 열을 미리 예약**해서 푼다(행이 안 움직이도록). 보드에서는
그 예약을 하지 않는다 — 같은 줄의 조건이 `state.view !== "board"`인 이유다. 즉 코드는
이미 **"보드에서 오른쪽 열은 잘못된 답"**임을 절반쯤 인정하고 있고, 대신 고른 답이
"보드의 가로 스크롤이 알아서 처리한다"였다. 사용자가 지금 거부하는 것이 그 답이다.

### 2.3 이미 있어서 다시 만들 필요 없는 것

| 필요한 것 | 어디에 이미 있나 |
|---|---|
| 포커스 트랩 | `TaskDrawer.tsx:195` — `presentation !== "inline-drawer"`이면 켜짐 |
| Escape로 닫기 | `TaskDrawer.tsx:198-224` — 모든 표현 방식에서, `defaultPrevented`면 양보 |
| 바깥 클릭 헬퍼 | `components/kit.tsx:137` `useOutsideClose` |
| 스크림 관례 | `.tm-modal-scrim` (`17-tasks-module.css:2273`) |
| 모달 모션 | `kit.tsx`의 `backdropVariants` / `modalVariants` + `useMotionEnabled` |
| 팝오버가 팝업 위에 뜸 | 플로팅 레이어는 `<body>` 아래 포털 루트에 z-index 100으로 그려진다(`FloatingLayerProvider`) — 팝업(45)보다 위이고, 스크림 바깥이다 |

### 2.4 z-index 지형 [실측]

| 값 | 무엇 |
|---|---|
| 35 | 사이드바 스크림 |
| 40 | 오버레이 사이드바 |
| **45** | `overlay-drawer` · `right-sheet` |
| 50 | `full-screen` 디테일 |
| 60 | 리스트 매니저 스크림 |
| 70 | `tm-modal-scrim` (리스트 만들기 등) |

새 팝업은 **디테일 층(45)** 에 속한다. 스크림 44 / 팝업 45. 위의 60·70은 팝업 위에 떠야
하는 대화상자들이므로 건드리지 않는다.

---

## 3. 문제 진술

> 보드에서 카드를 열면 디테일이 **보드를 좁히는 열**로 나타난다.
> 카드는 폭이 고정이라 줄어들지 못하므로, 좁아지는 것은 보이는 **열의 개수**다.
> 즉 "카드 하나를 본다"는 행동이 "보드를 부분적으로 잃는다"는 대가를 요구한다.

리스트에서는 이 대가가 없다(행은 폭을 양보할 수 있고, 예약된 빈 열이 점프까지 막는다).
**대가가 뷰마다 다르므로, 답도 뷰마다 달라야 한다.**

---

## 4. 결정 — 다섯 번째 표현 방식 `center-modal`

### 4.1 표현 방식은 이제 (뷰포트 × 표면)의 함수다

```ts
/** 디테일을 여는 표면. 어디서 열렸는지만 말하고, 어떻게 그릴지는 말하지 않는다. */
export type TaskDetailSurface = "list" | "board";

export function taskDetailPresentationFor(
  mode: ResponsiveMode,
  surface: TaskDetailSurface = "list",
): TaskDetailPresentation {
  // 보드에서는 카드가 폭을 양보하지 못한다(§3). 열 대신 화면 가운데 팝업.
  if (surface === "board" && mode !== "mobile") return "center-modal";
  return TASK_DETAIL_PRESENTATION[mode];
}
```

두 번째 인자에 **기본값을 준 것이 설계 결정이다.** 지금 호출자 둘 중 `App.tsx:257`은
보드가 없는 레거시 페이지들이므로 손대지 않아도 옳은 값을 받는다. 바꾸는 호출자는
`TasksModule.tsx` 한 줄뿐이다.

`state.view`가 아니라 **표면**을 받는 이유: 뷰 키(`board` / `list` / `timeline` / …)를
그대로 넘기면 뷰의 확장이 곧 이 함수의 확장이 된다. 이 함수가 알아야 하는 사실은 하나 —
**열린 곳이 폭을 양보할 수 있는가** — 이고 그것이 `"list" | "board"`다. 타임라인이나
캘린더가 나중에 팝업을 원하면 `"board"`에 얹는 것이 아니라 이 유니온에 이름을 하나 더한다.

### 4.2 규칙표

| | 리스트 / 타임라인 | **보드** |
|---|---|---|
| wideDesktop (≥1280) | `inline-drawer` (열) | **`center-modal`** |
| compactDesktop (1024–1279) | `overlay-drawer` (오른쪽 400px) | **`center-modal`** |
| tablet (768–1023) | `right-sheet` | **`center-modal`** |
| mobile (<768) | `full-screen` | `full-screen` (변경 없음) |

**모바일이 예외인 이유:** 375px에서 가운데 팝업은 여백만 낭비하는 전체 화면이다.
§15.21의 "디테일이 화면을 갖는다"가 그 폭에서는 이미 정답이고, `detail-full` 셸 클래스
(메뉴 트리거 숨김)도 거기에 걸려 있다. `detailIsFullScreen(mode)`는 모바일에서만 참이므로
**이 변경으로 값이 달라지지 않는다** — 손대지 않는다.

**태블릿을 팝업에 넣은 이유:** 768–1023에서도 보드는 `min(78vw, 300px)` 카드가 가로
스크롤하는 화면이다. 오른쪽 시트는 그 화면의 절반을 가져간다. 팝업은 가운데에서
`calc(100vw - 96px)`로 클램프되어 비슷한 넓이를 쓰되 **보드를 좁히지 않는다.**

### 4.3 도메인은 아무것도 모른다 (§15.9)

`?task=`도, 스코프도, 뷰도 그대로다. 창을 좁혀 보드 팝업이 전체 화면이 되어도
`/list/l1?view=board&task=t1`은 글자 하나 바뀌지 않는다. 이 파일에서 나가는 값은 **CSS
클래스 이름 하나와 부울 몇 개**뿐이고, 질의·개수·명령 어느 것도 이것을 읽지 않는다.

---

## 5. 팝업의 표면 [추론 + 결정]

### 5.1 골격

`TaskDrawer`의 루트는 지금 `<aside class="tm-drawer is-{presentation}">` 하나다. 팝업만
**스크림이라는 부모가 하나 더 필요하다.** 프래그먼트 대신 조건부 래핑:

```tsx
const modal = presentation === "center-modal";

const pane = (
  <aside
    ref={root}
    className={`tm-drawer is-${presentation}${resize.isResizing ? " is-resizing" : ""}`}
    aria-label={t("tasks.drawerLabel")}
    // 팝업은 뒤를 막는 층이므로 그렇게 말한다. 열·시트는 지금 상태 유지.
    {...(modal ? { role: "dialog" as const, "aria-modal": true } : {})}
  >
    … 지금 있는 내용 그대로 …
  </aside>
);

if (!modal) return pane;
return (
  <div
    className="tm-drawer-scrim"
    role="presentation"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    {pane}
  </div>
);
```

**`useOutsideClose`를 쓰지 않고 스크림에 핸들러를 다는 이유:** 스크림이 팝업을 감싸는
부모이므로 "바깥"은 곧 "스크림 자신이 이벤트 타깃"이다. 한 줄이면 되고, 문서 전역
리스너를 하나 덜 단다. `click`이 아니라 `mousedown`인 것은 팝업 안에서 텍스트를 드래그
선택하다 손을 스크림 위에서 떼는 경우에 닫히지 않게 하기 위함이다.

**"바깥"이 아니라 "타깃"인 것이 중요하다** [실측]. 일정·우선순위·리스트·`⋯` 팝오버는
`FloatingLayerProvider`가 `<body>` 아래 포털 루트에 z-index 100으로 그린다 — 팝업보다
위이고 스크림 **바깥**이다. 타깃 비교이므로 팝오버를 눌러도 이 핸들러에 닿지 않는다.
(팝오버가 열린 채 **스크림을** 누르면 둘이 함께 닫힌다 — 레이어 매니저가 자기 표면을,
이 핸들러가 디테일을. Escape는 여전히 한 겹씩 벗긴다.)

### 5.2 스크림이 클릭으로 닫혀도 되는가 [결정]

`.tm-modal-scrim`은 **일부러** 클릭 핸들러가 없다(`17-tasks-module.css:2266` 주석:
"초안을 실수로 날릴 것이 없도록"). 디테일은 사정이 다르다 — 필드가 전부 드래프트이고
**드래프트는 언마운트될 때 flush된다**(`TaskDrawer.tsx:214` 주석). 게다가 Escape가 이미
같은 경로로 닫는다. 그러므로 **스크림 클릭 = 닫기**로 한다. 잃는 것이 없다.

### 5.3 치수

```css
.tm-drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 44;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.32);
}

.tm-drawer.is-center-modal {
  z-index: 45;
  width: min(720px, calc(100vw - 96px));
  /* 높이는 내용이 아니라 화면이 정한다: 짧은 태스크에서도 팝업이 자라거나 줄지 않고,
     긴 태스크에서는 .tm-drawer-scroll이 스크롤을 가진다(§1.17). */
  height: min(640px, calc(100vh - 96px));
  border: 1px solid var(--border, #e5e5e7);
  border-radius: 12px;
  background: var(--surface, #fff);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  overflow: hidden; /* 둥근 모서리 안으로 헤더·푸터를 자른다 */
}
```

**720×640 [추론]:** 크롭이라 실측할 수 없다. 720은 `inline-drawer`의 최대 폭
(`TASK_DETAIL_MAX_WIDTH` = 600)보다 넓고 리스트 만들기 대화상자(420)보다 훨씬 넓은,
"본문을 읽는 창"의 폭이다. 640은 헤더+푸터(각 ~48)를 빼고도 본문 544를 남긴다.
**구현 뒤 실물을 보고 조정할 값이다.**

`height`를 고정하는 것이 핵심이다. 내용 높이로 두면 제목만 있는 태스크의 팝업이 200px,
체크리스트가 긴 태스크가 800px가 되어 **보드에서 카드를 옮겨 다닐 때마다 창이 펄떡인다** —
디테일을 태스크 전환에서 리마운트하지 않기로 한 §1.26과 같은 이유다.

### 5.4 기본 규칙과의 충돌 하나

`.tm-drawer`는 `width: var(--tm-detail-w, 480px)`와 `flex: 0 0 auto`, `border-left`를
갖는다. `is-right-sheet` / `is-full-screen`은 `width: auto`로 폭만 무력화한다(`:671`).
`is-center-modal`은 자기 `width`를 직접 쓰므로 그 목록에 넣지 않는다. `flex: 0 0 auto`는
스크림의 flex 컨테이너 안에서도 맞다(늘어나지도 줄지도 않음). `border-left`는 위 규칙의
`border` 한 줄이 덮는다.

### 5.5 모션

진입만: 스크림 `opacity` 0→1, 팝업 `opacity` + `scale(0.98→1)`.
**퇴장 애니메이션은 이번 범위에서 하지 않는다.** 디테일의 닫기는 `?task=`를 지우는
라우팅이고, 그 값을 애니메이션이 끝날 때까지 붙잡으려면 `kit.tsx`의 `Modal`이 쓰는
`closing` 상태를 디테일 전체에 도입해야 한다. 진입은 순수 CSS `@keyframes` +
`prefers-reduced-motion` 가드로 시작하고, 부족하면 framer-motion을 올린다.

---

## 6. 접근성

| 항목 | 상태 |
|---|---|
| 포커스 트랩 | **이미 켜짐** — `presentation !== "inline-drawer"` 조건에 `center-modal`이 자동 포함 |
| Escape | **이미 있음** — 팝오버가 먼저 한 겹 벗겨지는 순서도 그대로 |
| `role="dialog"` / `aria-modal` | **새로 추가**(§5.1). 팝업에만 |
| 닫은 뒤 포커스 복귀 | `useFocusTrap`이 이미 담당 |
| 스크림 | `role="presentation"`, 포커스 불가, 키보드 경로 없음(Escape가 그 역할) |

---

## 7. 바뀌지 않는 것 (명시)

- **팝업 안의 내용은 한 줄도 바뀌지 않는다.** 헤더·스크롤·푸터·모든 피커·모든 명령 동일.
- **리사이즈 핸들 없음** — `resizable = presentation === "inline-drawer"`가 이미 그렇게 답한다.
- **예약된 빈 열 없음** — `TasksModule.tsx:1458`이 이미 보드를 제외한다.
- **`detail-full` 셸 클래스** — 모바일 전용, 값 불변.
- **`--tm-detail-w`** — 팝업은 읽지 않는다. 리스트 뷰의 저장된 폭은 그대로.
- **`?task=` · 스코프 · 뷰 · 정렬 · 드래그** — 전부 불변.
- **카드 선택 강조** — `TaskBoard`의 `openTaskId` 그대로. 팝업이 떠도 어느 카드인지 보인다.

---

## 8. 구현 단계

각 단계는 그 자체로 초록이고, 다음 단계 없이도 배포 가능하다.

### 단계 1 — 도메인 (`domain/tasks/responsive.ts`)

- `TaskDetailSurface` 타입 추가.
- `TaskDetailPresentation`에 `"center-modal"` 합류
  (`TASK_DETAIL_PRESENTATION` 맵의 값에서 파생되는 타입이므로
  `… = (typeof TASK_DETAIL_PRESENTATION)[ResponsiveMode] | "center-modal";`).
- `taskDetailPresentationFor(mode, surface = "list")`.
- 테스트: 규칙표(§4.2)의 8칸을 그대로 단언.

### 단계 2 — 호출자 (`components/tasks/TasksModule.tsx`)

- `:1476`의 `taskDetailPresentationFor(mode)` →
  `taskDetailPresentationFor(mode, state.view === "board" ? "board" : "list")`.
- `:1458`(예약 열 조건)은 **손대지 않는다.** 이미 보드를 제외하고 있고, 조건을 바꾸면
  그 줄의 의미가 흐려진다.
- `App.tsx`도 건드리지 않는다(§4.1).

### 단계 3 — 컴포넌트 (`components/tasks/TaskDrawer.tsx`)

- `modal` 파생값, 스크림 래퍼, `role`/`aria-modal`, `onMouseDown` 닫기(§5.1).
- 그 외 본문 무수정.

### 단계 4 — 스타일 (`styles/17-tasks-module.css`)

- 디테일 절("Task Detail, one component in four presentations") 안에
  `.tm-drawer-scrim` / `.tm-drawer.is-center-modal` 추가. 주석의 "four"는 "five"로.
- 진입 애니메이션 + `prefers-reduced-motion` 가드.

### 단계 5 — 릴리스 전

- `npx tsc -b` (릴리스 빌드가 테스트 파일까지 타입 검사한다).

---

## 9. 테스트

| 무엇 | 어디 |
|---|---|
| 규칙표 8칸 | `domain/tasks/responsive` 테스트 |
| 보드에서 카드를 열면 `role="dialog"`가 있고 `.tm-drawer.is-inline-drawer`가 **없다** | `components/tasks/taskBoardDetailPopup.test.tsx` (신규) |
| 리스트 뷰는 지금과 동일(`is-inline-drawer` 유지) | 기존 `detailShell.test.tsx`에 회귀 단언 |
| 스크림 클릭 → `onClose`, 팝업 내부 클릭 → 닫히지 않음 | 신규 |
| Escape가 팝오버 → 팝업 순서로 한 겹씩 | 기존 Escape 테스트 + 팝업 케이스 1건 |

---

## 10. 확정된 것과 남은 것

**확정 [결정] · 2026-09-03**

1. **치수 720×640 고정** — 화면이 크기를 정하고 내용은 안에서 스크롤한다(§5.3).
   크롭이라 실측은 못 했으므로, 구현 후 실물을 보고 숫자만 조정한다.
2. **태블릿(768–1023)도 팝업** — §4.2의 규칙표대로. 모바일만 전체 화면으로 남는다.

**남은 것 [추론]**

3. **스크림 어둡기 0.32** — `.tm-modal-scrim`과 같은 값으로 시작한다. 보드가 뒤로 비치길
   원하면 0.20으로 낮춘다. (§15.19가 오버레이 드로어에 대해 "뒤가 읽혀야 한다"고 말하지만,
   그것은 스크림이 **없는** 표현 방식이라 팝업에 그대로 적용되지 않는다.)

---

## 11. 범위 밖 (발견했지만 이번에 건드리지 않는 것)

- `.tm-drawer.is-right-overlay` — CSS에만 있고 TSX 어디에도 없는 죽은 클래스.
- 오버레이·시트 표현 방식의 `role="dialog"` 누락 — 팝업과 같은 이유로 붙일 만하나 별건.

---

## 12. 두 번째 표면 — 아이젠하워 매트릭스 [구현됨 · 2026-09-03]

> (사용자가 두 장을 주었다: 우리 매트릭스에서 태스크를 열어 오른쪽에 뜬 패널,
> 그리고 참조 앱에서 같은 화면의 카드를 열었을 때 뜨는 **가운데 팝업**.)

### 12.1 §4.1이 이미 자리를 만들어 두었다

`TaskDetailSurface`의 주석은 이렇게 적혀 있었다:

> 미래의 표면이 팝업을 원하면 `"board"`에 접어 넣지 말고 이 유니온에 합류한다.

매트릭스가 그 첫 합류다. **새로 만든 것은 없다** — 유니온에 단어 하나, 조건 한 줄,
호출자 한 줄이 전부다.

### 12.2 매트릭스가 폭을 못 내주는 이유는 보드와 다르다

보드는 `flex: none` 열이 나열된 화면이라, 디테일 열이 가져가는 것은 카드의 폭이 아니라
**화면에 남는 열의 개수**였다(§4.1). 매트릭스는 열이 아니라 **2×2 격자 하나**다.
디테일이 열을 차지하면 격자 전체가 좁아지고, 그 값은 오른쪽 두 사분면이 치른다 —
`Ⅱ 계획 세우기`와 `Ⅳ 나중에`가 먼저 읽을 수 없게 된다.

같은 사실("이 표면은 폭을 내줄 수 없다")에 도달하는 **다른 모양**이므로, `"board"`로
이름을 바꾸는 대신 `"matrix"`라는 단어를 하나 더 둔다. 규칙표(§4.2)의 보드 열이
그대로 매트릭스 열이 된다 — 모바일만 `full-screen`.

### 12.3 바뀐 것 (전부)

| 파일 | 무엇 |
|---|---|
| `domain/tasks/responsive.ts` | `TaskDetailSurface`에 `"matrix"` · 조건이 `surface === "board"`에서 `surface !== "list"`로 |
| `App.tsx` | `taskDetailPresentationFor(mode, activePage === "board" ? "matrix" : "list")` |

`activePage === "board"`가 **아이젠하워 페이지**다 — `/board`라는 주소는 Board 뷰보다
먼저 있었고, 사람들이 저장해 둔 링크 때문에 그대로 남아 있다.

`renderTaskDetail`의 다른 호출자인 **포커스 페이지는 그대로 열**이다. 한 줄짜리 큐 옆의
빈 폭은 실제로 내줄 수 있는 폭이고, 거기서는 §15.17의 답이 이미 맞다.

### 12.4 저절로 따라온 것

`AppPages`의 `detailIsColumn`은 `presentation === "inline-drawer"`만 참이므로,
매트릭스 격자는 팝업이 떠도 `no-detail`로 **폭을 온전히 유지한다**. 스크림·포커스 트랩·
바깥 클릭 닫기·`Escape`·`×` 없음(§5.1, §5.2)은 전부 `TaskDrawer` 안에 있고 표면을
묻지 않는다. CSS(`.tm-drawer-scrim`, `.tm-drawer.is-center-modal`)도 `.tm-shell`에
매여 있지 않아 레거시 셸의 페이지에서 그대로 그려진다.

### 12.5 실측 [실측 · 2026-09-03]

1440×860에서 `/board`의 카드를 열었다: 스크림 위에 720×640 팝업, 뒤의 매트릭스는
네 사분면 그대로. 스크림을 누르면 닫히고 주소가 `/board`로 돌아온다(`?task=` 제거).
`responsive.test.ts`에 매트릭스 4칸을 추가했다.
