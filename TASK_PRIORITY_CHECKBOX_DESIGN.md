# 체크박스가 우선순위를 말한다 — 그리고 그 색은 한 군데서만 정해진다

> 상태: **설계 · 미구현** · 2026-09-03
> (사용자가 참조 앱의 카드 네 장과, 팝업이 열린 보드 한 장을 캡처해 주었다.)
> 대상: `components/tasks/TaskRowContent.tsx` · `components/tasks/TaskDrawer.tsx` ·
> `components/tasks/PriorityPicker.tsx` · `styles/01-base.css` · `styles/17-tasks-module.css`

## 0. 근거 수준

| 등급 | 무엇 | 표기 |
|---|---|---|
| **관찰** | 스크린샷 2장 — 색이 다른 체크박스 네 개(주황·빨강·파랑·회색), 팝업 헤더의 파란 체크박스와 오른쪽 끝 파란 깃발 | [관찰] |
| **실측** | `TaskRowContent.tsx` · `TaskDrawer.tsx` · `PriorityPicker.tsx` · `01-base.css` · `17-tasks-module.css` · `TICKTICK_COMPONENT_06 §6.1`(참조 앱 팔레트 실측치) | [실측] |
| **결정** | 사용자가 고른 것 둘: 우선순위별 체크박스 색 · 팝업 우측 상단 깃발로 우선순위 선택 | [결정] |
| **추론** | 테두리 두께·모서리 반경·체크된 뒤의 색 | [추론] |

---

## 1. 스크린샷이 보여 준 것 [관찰]

### 1.1 카드 넷

| 카드 | 체크박스 | 읽히는 우선순위 |
|---|---|---|
| `asd` / Today | **주황** | 보통 |
| `asd` / Oct 3 | **빨강** | 높음 |
| `awg` / 일정 | **파랑** | 낮음 |
| `fwwf` / 일정 | **회색** | 없음 |

넷 다 **비어 있는(체크되지 않은) 상자**이고, 색은 **테두리**에 있다. 모서리는 둥근
사각형. **깃발 배지는 어디에도 없다** — 우선순위는 오직 이 색으로만 말해진다.

### 1.2 팝업 헤더

`□(파랑) │ ▦ Date and Reminder ……… ⚑(파랑, 오른쪽 끝)`

- 헤더의 체크박스도 **같은 색 규칙**을 따른다(이 태스크 `awg`는 낮음 = 파랑).
- 깃발은 **오른쪽 끝**에 있고, 채워진 파란 깃발이다.
- 닫기 `×`는 **없다**(참조 앱은 바깥 클릭으로 닫는다).

### 1.3 우리 것과 이미 같은 것

참조 앱의 팔레트는 이 리포가 이미 실측해 두었다 — `TICKTICK_COMPONENT_06_TASK_LIST_ROW.md §6.1`:

| 우선순위 | 참조 앱 실측 |
|---|---|
| 없음 | `rgba(255,255,255,0.4)` |
| 낮음 | `rgb(71,114,250)` |
| 보통 | `rgb(250,168,12)` |
| 높음 | `rgb(225,62,57)` |

같은 문서가 이렇게도 적어 두었다: **"우선순위 표시를 위해 가로 공간을 전혀 쓰지 않는
방법이다. 다만 색만으로 전달하므로 색각 이상 사용자에게는 구분이 어렵다."**
§4.4가 이 문장에 답한다.

---

## 2. 지금 코드가 하는 일 [실측]

### 2.1 우선순위는 이미 다섯 군데에 그려진다

| # | 자리 | 선택자 | 높음 | 보통 | 낮음 |
|---|---|---|---|---|---|
| 1 | 행·카드의 깃발 | `.tm-task-priority.is-*` (`17-tasks-module.css:340`) | `--danger` | `--warning` | `--accent` |
| 2 | 디테일 헤더의 깃발 | `.tm-priority-trigger.is-*` (`:869`) | `--color-danger` | `--color-warning` | `--color-primary` |
| 3 | 우선순위 팝오버의 글리프 | `.tm-priority-option.is-* .tm-priority-glyph` (`:925`) | `--color-danger` | `--color-warning` | `--color-primary` |
| 4 | `⋯` 메뉴의 색 견본 | `.tm-menu-flag.is-*` (`:3119`) | `--danger` | `--warning` | `--accent` |
| 5 | 레거시 배지 | `.priority-high/medium/low` (`01-base.css:655`) | `#9f1239` | `#92400e` | **`#166534`(초록)** |

**다섯 자리, 세 가지 어휘, 그리고 하나는 아예 다른 색.** 여기에 체크박스를 여섯 번째로
더하는 것은 문제를 하나 더 만드는 일이다. §3이 먼저 오는 이유다.

### 2.2 그 어휘들은 실제로 어긋나 있다 — 두 군데서

**(a) `--color-danger` · `--color-warning`는 정의된 적이 없다.** [실측]
`grep -- "--color-danger:" src/styles` 는 0건이다. 즉 2·3번은 내내
`var(--color-danger, #ff3b30)`의 **폴백 리터럴**로 그려져 왔다. 1·4번의 `--danger`가
테마에서 바뀌면 깃발 두 개가 서로 다른 빨강이 된다.

**(b) 낮음이 사용자 액센트를 따라간다.** [실측]
`01-base.css:305`가 `--color-primary: var(--accent)`이고, `--accent`는 설정에서 고를 수
있다(`[data-accent="orange"] { --accent: #ff9500 }`, `:362`). 그리고 `--warning`도
`#ff9500`이다 — **액센트를 주황으로 둔 사용자에게 낮음과 보통은 같은 색이다.**
색만으로 전달하기 시작하는 순간, 이것은 불편이 아니라 **정보 손실**이 된다.

### 2.3 체크박스는 네이티브 `<input>`이고, 그래서 지금 방식으로는 칠할 수 없다

```css
.tm-task-check input {           /* 17-tasks-module.css:313 */
  width: var(--check-size);       /* 15px, §16.2가 정한 하나의 숫자 */
  height: var(--check-size);
  accent-color: var(--accent);
}
.tm-task-check input:checked { accent-color: var(--text-tertiary); }
```

`accent-color`는 **체크된 상자의 채움색**만 바꾼다. 스크린샷이 보여 주는 것은
**체크되지 않은 상자의 테두리 색**이고, 그것은 `accent-color`가 닿지 않는 곳이다.
그러므로 이 요구는 CSS 한 줄이 아니라 **컨트롤을 우리가 그리는 일**이다(§4.2).

`.tm-drawer-done input[type="checkbox"]`(`:759`)도 같은 모양의 규칙을 따로 갖고 있다 —
같은 그림을 두 번 적어 둔 두 번째 자리.

### 2.4 팝업의 깃발은 **이미** 우선순위 선택기다

`TaskDrawer.tsx`의 헤더가 `<PriorityPicker>`를 그리고 있고, 그것은 클릭하면 4단계
팝오버를 여는 완성된 컨트롤이다(`PriorityPicker.tsx`, spec §8.5·§8.25·§8.28 — 접근 이름,
호버 문장, 키보드 링, `⌘Z`로 되돌아가는 명령 경로까지).

**즉 요구 2에서 없는 것은 기능이 아니라 위치다.** 지금 헤더는

```
□ Done │ ▦ 일정 │ ⚑ ………(auto)……… ×
```

이고 `margin-left: auto`를 가진 것은 `.tm-drawer-close`다(`:727`). 깃발은 일정 칩 바로
뒤에 붙어 **왼쪽 무리에 섞여** 있다. 참조 앱은 깃발을 오른쪽 끝에 둔다.

---

## 3. 결정 A — 팔레트를 토큰 하나로 (선행 작업)

```css
/* 01-base.css, :root */
--priority-high: #ff3b30;
--priority-medium: #ff9500;
/* 액센트가 아니라 고정값. 액센트를 주황으로 둔 사용자에게 낮음과 보통이 같은
   색이 되는 것을 막는다(§2.2b) — 색이 유일한 채널이 되는 순간 그것은 정보 손실이다. */
--priority-low: #4772fa;
--priority-none: var(--text-tertiary);
```

§2.1의 다섯 자리가 전부 이것을 읽는다. 여섯 번째(체크박스)도 같은 것을 읽는다.

- 값은 **지금 화면에 나오는 색을 그대로** 가져온다(`#ff3b30` · `#ff9500`). 이 단계에서
  눈에 보이게 달라지는 것은 **낮음뿐**이고, 그것이 이 단계의 목적이다.
- `#4772fa`는 참조 앱 실측치(`rgb(71,114,250)`, §1.3). 기본 액센트 `#007aff`와 구별되는,
  "액센트가 아니라 우선순위"라는 사실이 눈에도 보이는 값이다.
- 5번 레거시 배지(`.priority-low`가 초록)는 **범위 밖**이다(§11). 캘린더 쪽 화면이고,
  이 작업이 건드리는 행·카드·디테일과 겹치지 않는다.

**다크 테마:** `--danger`/`--warning`는 다크에서 재정의되지 않는다(`01-base.css:399`는
`-soft`만 바꾼다). 새 토큰도 같다 — 세 색 모두 어두운 바탕에서 충분한 대비를 갖는다.
필요해지면 재정의할 자리가 이제 **한 곳**이라는 것이 이 단계가 사 오는 것이다.

---

## 4. 결정 B — 체크박스가 우선순위 색을 입는다

### 4.1 어디에

| 자리 | 색이 붙나 | 이유 |
|---|---|---|
| 행·카드의 완료 체크 (`.tm-task-check`, `TaskRowContent`) | **예** | 요구 그 자체. 리스트·보드·매트릭스가 전부 이 한 컴포넌트를 쓴다 |
| 디테일 헤더의 완료 체크 (`.tm-drawer-done`) | **예** | [관찰] 스크린샷 2가 파란 상자를 그린다 |
| 하위 작업 · 체크리스트 항목 | **아니오** | 우선순위가 없는 것들이다. 없는 사실을 회색으로 말하는 것과, 말할 것이 없는 것은 다르다 |
| 매트릭스의 카드 | **`showPriority`를 따른다** | `MatrixPage.tsx:960`이 `showPriority={false}`로 깃발을 끈다 — 사분면이 이미 우선순위이기 때문이다. 스위치는 하나여야 하고, 그 스위치는 **"이 행이 자기 우선순위를 말하는가"**다 |

### 4.2 어떻게 — 네이티브를 유지하고, 그림만 우리 것으로

```css
.tm-check {
  appearance: none;
  -webkit-appearance: none;
  width: var(--check-size);
  height: var(--check-size);
  margin: 0;
  border: 1.5px solid var(--priority-none);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.tm-check.is-high { border-color: var(--priority-high); }
.tm-check.is-medium { border-color: var(--priority-medium); }
.tm-check.is-low { border-color: var(--priority-low); }

/* 완료는 회색이다 — §16이 정한 것이고 이 변경은 그것을 뒤집지 않는다.
   우선순위 색은 "아직 해야 하는 일"에 대한 말이고, 끝난 일에 대고 그 말을 계속하면
   남은 일 목록에서 가장 큰 소리를 내는 것이 이미 끝난 줄들이 된다. */
.tm-check:checked {
  border-color: var(--text-tertiary);
  background-color: var(--text-tertiary);
  background-image: url("data:image/svg+xml,…흰 체크 표시…");
  background-size: 100% 100%;
}

/* `appearance: none`은 UA의 포커스 표시도 함께 가져간다. 되돌려 놓는다. */
.tm-check:focus-visible {
  outline: 2px solid var(--ff-focus-ring);
  outline-offset: 2px;
}

.tm-check:disabled { opacity: 0.5; cursor: default; }
```

**`<input type="checkbox">`를 그대로 둔 채 `appearance: none`만 쓰는 것이 핵심이다.**
`<span>`으로 갈아 끼우면 Space 토글, `:checked`, `label` 연결, 폼 의미, 스크린 리더의
"체크박스, 선택 안 됨"이 전부 우리가 다시 만들어야 하는 것이 된다. 여기서 바뀌는 것은
**그림뿐**이다.

체크 표시를 `::after`가 아니라 `background-image`로 그리는 이유: Firefox는 `<input>`에
가상 요소를 만들지 않는다. 데이터 URI는 어느 엔진에서나 그려진다.

### 4.3 마크업 — 클래스를 붙이는 자리를 하나로

지금 완료 체크박스는 두 곳에서 **각각** 쓰인다(`TaskRowContent.tsx:174`,
`TaskDrawer.tsx`의 `.tm-drawer-done`). 우선순위 → 클래스 매핑을 두 번 적으면 두 자리가
어긋날 수 있으므로, 입력 요소 하나만 그리는 작은 컴포넌트를 둔다:

```tsx
// components/tasks/TaskCheck.tsx — 이 파일이 대답하는 질문은 하나다:
// "완료 체크박스는 어떤 우선순위의 것인가."
export function TaskCheck({ task, done, disabled, onToggle, label }: …) {
  return (
    <input
      type="checkbox"
      className={`tm-check is-${task.priority}`}
      checked={done}
      disabled={disabled}
      aria-label={label}
      onChange={onToggle}
    />
  );
}
```

감싸는 `<label>`은 각자의 것으로 남는다 — 행의 `.tm-task-check`는 행 높이만큼의 히트
영역이고(§3.1), 디테일의 `.tm-drawer-done`은 `Done`이라는 글자를 데리고 있다. 공유되는
것은 **상자**이지 그 주변이 아니다.

### 4.4 깃발은 남는다 [결정]

`TaskRowContent.tsx:193`에 이 리포가 남긴 반대 의견이 있다:

> 참조 앱은 체크박스의 색으로 대신하는데, 그것은 **한 신호가 두 일을 하는 것**이고 두
> 색을 구분하지 못하는 사람에게는 읽히지 않는다(§6.1). 그래서 깃발은 남는다.

이 작업은 그 문장을 **뒤집지 않고 무효화한다.** 반대의 근거는 "색이 **유일한** 채널이
된다"였다. 색을 더하되 깃발을 그대로 두면 채널이 둘이 된다 — 색과 **모양**. 색각 이상
사용자는 지금 읽던 것을 그대로 읽고, 나머지는 상자만 보고도 알게 된다. 잃는 것이 없다.

참조 앱과 똑같이 깃발까지 없애는 것은 **되돌리기 쉬운 한 줄**이므로(§10.1), 실물을 보고
정한다.

---

## 5. 결정 C — 팝업 헤더의 깃발을 오른쪽 끝으로

바뀌는 것은 CSS 두 줄이다.

```css
/* 참조 앱의 헤더는 `□ │ 날짜 ……… ⚑`다. 자유 공간은 날짜 뒤에 있고,
   깃발은 그 끝에 선다. */
.tm-drawer-head .tm-priority-trigger { margin-left: auto; }
/* `auto`가 둘이면 자유 공간이 반씩 나뉘어 깃발이 가운데에 서 버린다 —
   `.tm-drawer-more`의 주석(:784)이 이미 겪은 실수다. */
.tm-drawer-head .tm-priority-trigger ~ .tm-drawer-close { margin-left: 0; }
```

**`×`는 팝업에서만 사라진다** [결정 · 2026-09-03].

참조 앱의 팝업에는 `×`가 없다(§1.2). 그것이 가능한 이유는 팝업에만 **스크림이 있기**
때문이다 — 바깥 어디를 눌러도 닫히고, Escape도 닫는다. 나머지 네 표현 방식에는 스크림이
없고, 거기서 `×`는 포인터로 닫는 **유일한** 길이므로 그대로 남는다.

```tsx
// TaskDrawer.tsx, 헤더 끝
{modal ? null : (
  <button type="button" className="tm-drawer-close" onClick={onClose} …>×</button>
)}
```

즉 `×`의 존재 조건은 "이 표현 방식에 스크림이 있는가"이고, 그 답을 이미 갖고 있는 값이
`modal`이다(BOARD_TASK_POPUP_DESIGN.md §5.1). 헤더가 자리마다 달라지는 것이 아니라,
**닫는 길이 없는 자리에만 닫는 버튼이 있는 것**이다.

`×`가 없으면 자유 공간은 깃발 뒤로 간다. 팝업에서는 `margin-left: auto`가 깃발에 붙어
깃발이 오른쪽 끝에 서고, 나머지에서는 깃발 뒤에 `×`가 이어진다 — 같은 규칙 하나로
두 모양이 다 나온다.

`.tm-drawer-pinned`(`Pinned` 배지)가 깃발과 `×` 사이에 들어오는 경우에도 순서는 그대로다:
자유 공간은 깃발 앞에서 한 번만 벌어진다.

---

## 6. 상태표 — 이 변경이 정의하는 모든 칸

| | 미완료 | 완료 |
|---|---|---|
| 높음 | 빨강 테두리, 빈 상자 | 회색 채움 + 흰 체크 |
| 보통 | 주황 테두리, 빈 상자 | 회색 채움 + 흰 체크 |
| 낮음 | 파랑 테두리, 빈 상자 | 회색 채움 + 흰 체크 |
| 없음 | 회색 테두리, 빈 상자 | 회색 채움 + 흰 체크 |
| 휴지통(`disabled`) | 위와 같되 `opacity: .5` | 위와 같되 `opacity: .5` |

완료 열이 우선순위와 무관하게 한 가지인 것이 §4.2의 결정이다.

---

## 7. 접근성

| 항목 | 어떻게 |
|---|---|
| 색만으로 전달하지 않음 | 깃발이 남는다(§4.4) — 색 + 모양 |
| 스크린 리더 | 체크박스의 접근 이름은 지금 그대로 `"<제목> 완료"`. 우선순위는 **깃발이 이미 말한다**(`aria-label={t('priority.high')}`), 그러므로 체크박스 이름에 덧붙이지 않는다 — 한 사실을 두 번 읽어 주는 것은 도움이 아니다 |
| 키보드 | `<input>`을 유지하므로 Space·Tab·`:checked`가 그대로다 |
| 포커스 표시 | `appearance: none`이 가져간 UA 링을 `:focus-visible`로 되돌려 놓는다(§4.2) |
| 고대비 / 강제 색 모드 | `@media (forced-colors: active)`에서 테두리를 `CanvasText`로 되돌린다 — 강제 색 모드는 우선순위 색을 어차피 무시하고, 그때 남아야 하는 것은 "여기 체크박스가 있다"는 사실이다 |

---

## 8. 바뀌지 않는 것

- **완료의 의미와 색** — §16의 "끝난 일은 회색"은 그대로.
- **`--check-size: 15px`** — §16.2가 정한 하나의 숫자를 그대로 읽는다.
- **하위 작업 · 체크리스트의 체크박스** — 손대지 않는다.
- **매트릭스** — `showPriority={false}`가 색까지 끈다(§4.1).
- **우선순위를 바꾸는 경로** — `PriorityPicker` → `priorityChange` → `commands.mutate`,
  §8.8의 무변화 무시와 `⌘Z`까지 전부 그대로. 이 문서는 **그리는 것**만 바꾼다.
- **`?task=` · 스코프 · 뷰** — 무관.

---

## 9. 구현 단계

### 단계 1 — 팔레트 토큰 (`styles/01-base.css`)
`--priority-high/medium/low/none` 정의.

### 단계 2 — 다섯 소비자를 토큰으로 (`styles/17-tasks-module.css`)
`.tm-task-priority` · `.tm-priority-trigger` · `.tm-priority-glyph` · `.tm-menu-flag`가
전부 새 토큰을 읽게 한다. 정의된 적 없는 `--color-danger`/`--color-warning` 폴백이
여기서 사라진다(§2.2a).
**이 단계까지가 그 자체로 배포 가능한 버그 수정이다** — 낮음이 액센트를 따라가지 않게 된다.

### 단계 3 — 체크박스 컴포넌트 (`components/tasks/TaskCheck.tsx` 신규)
`TaskRowContent.tsx:174`와 `TaskDrawer.tsx`의 `.tm-drawer-done`이 이것을 쓴다.
`showPriority`가 거짓이면 `is-none`으로 그린다(§4.1).

### 단계 4 — 체크박스 스타일 (`styles/17-tasks-module.css`)
`.tm-check` 규칙 일습(§4.2). `.tm-task-check input` / `.tm-drawer-done input[type=checkbox]`의
낡은 `accent-color` 규칙 두 벌을 지운다.

### 단계 5 — 헤더의 깃발 위치와 팝업의 `×` (`TaskDrawer.tsx` · `styles/17-tasks-module.css`)
§5의 CSS 두 줄과, `modal`일 때 닫기 버튼을 그리지 않는 조건 하나.

### 단계 6 — 릴리스 전
`npx tsc -b` (릴리스 빌드가 테스트 파일까지 타입 검사한다).

---

## 10. 테스트

| 무엇 | 어디 |
|---|---|
| 우선순위 넷이 각각 자기 클래스를 그린다 (행·카드) | `taskRowContent.test.tsx`에 추가 |
| 디테일 헤더의 체크박스가 같은 클래스를 그린다 | `detailShell.test.tsx`에 추가 |
| `showPriority={false}`면 색도 깃발도 없다 (매트릭스) | `taskRowContent.test.tsx` |
| 하위 작업·체크리스트 체크박스에는 `tm-check`의 우선순위 클래스가 없다 | 신규 1건 |
| 완료된 태스크는 우선순위와 무관하게 `:checked` 한 가지 | 스타일이므로 e2e 또는 육안 |
| 팝업 헤더에서 깃발 → 팝오버 → 레벨 선택이 `mutate`까지 간다 | `PriorityPicker` 기존 테스트가 이미 커버 |
| 팝업에는 `×`가 없고, 인라인 열·오버레이에는 있다 | `boardDetailPopup.test.tsx`에 추가 |

---

## 11. 열린 질문 / 범위 밖

1. ~~깃발을 남길 것인가~~ — **남긴다** [결정 · 2026-09-03]. 색 + 모양 두 채널(§4.4).
   나중에 참조 앱처럼 하고 싶어지면 `TaskRowContent.tsx:196`의 조건 한 줄이다.
2. **테두리 1.5px · 반경 4px** [추론] — 스크린샷은 확대본이라 실측이 아니다. 15px
   상자에서의 값이므로 구현 후 조정.
3. **레거시 `.priority-*` 배지**(`01-base.css:655`, 낮음이 초록) — 캘린더 계열 화면의
   것이고 이 작업이 건드리는 세 자리와 겹치지 않는다. 범위 밖.
4. **참조 앱의 호버 전용 체크 아이콘**(§6의 `icon-hover-checkbox`) — 우리에겐 없다.
   이번에 만들지 않는다.
