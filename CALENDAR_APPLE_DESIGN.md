# Calendar — Apple Calendar 레퍼런스 설계

- 작성일: 2026-08-14
- 기준: `v0.5.2` (`0060c49`), 브랜치 `fix/store-write-amplification`
- 방법: `npm run dev`(127.0.0.1:5180)로 Week 뷰를 띄워 DOM/computed style 확인 + 소스 대조
- 범위: `src/components/calendar/**`, `src/components/CalendarView.tsx`, `src/styles/02·08·09-*.css`

---

## 0. 전제 두 가지 (먼저 합의할 것)

### 0.1 리포의 `DESIGN-apple.md`는 **Calendar.app이 아니라 apple.com**이다

`DESIGN-apple.md` 첫 줄은 `name: Apple-design-analysis`, 설명은 "photography-first interface / marketing into a museum gallery"다. 즉 **애플 제품 소개 웹사이트**의 디자인 시스템이고, hero 56px·display 40px 같은 마케팅 타입 스케일을 담고 있다. 캘린더 UI에 그대로 쓰면 안 된다.

다행히 실제로 쓰이는 토큰 레이어(`01-base.css`)는 이미 **애플 시스템 컬러**다:

```css
--accent: #007aff;  --danger: #ff3b30;  --success: #34c759;  --purple: #af52de;
--bg-app: #f2f2f7;  --text-tertiary: #8e8e93;
```

→ **결정: `01-base.css`의 FocusFlow 토큰(`--bg-*` / `--text-*` / `--tint-*`)을 정본으로 쓰고, `DESIGN-apple.md`의 마케팅 타입 스케일은 캘린더에 끌어오지 않는다.**

### 0.2 이 캘린더는 "이벤트 캘린더"가 아니라 "작업 플래너"다

Calendar.app은 한 종류(이벤트)만 그린다. 이 앱은 `CalendarItem.layer`가 6종이다:

```
task · deadline · study-review · project-deadline · external · focus-actual
```

애플을 그대로 베끼면 이 구분이 사라진다. 그래서 이 설계의 핵심 원칙은:

> **애플의 "시각 언어"는 따르되, 레이어 구분은 색(hue)이 아니라 형태(form)로 옮긴다.**

---

## 1. 이미 애플스러운 것 — 다시 만들지 말 것

재작업 방지용 기록이다. 아래는 확인 완료.

| 항목 | 현재 상태 | 위치 |
|---|---|---|
| 시스템 컬러 토큰 | `#007aff` / `#ff3b30` / `#34c759` / `#af52de` / `#f2f2f7` | `01-base.css:53-64` |
| tint 3종 세트(bg/text/accent) | 이미 정의됨 (`--tint-blue-bg/text/accent` …) | `01-base.css:68-82` |
| SF 폰트 스택 | `-apple-system, BlinkMacSystemFont, "SF Pro Text"` + `font-synthesis: none` | `01-base.css:141` |
| 카테고리 = 색상 체크박스 | 별도 색 점 없이 체크박스 자체가 색을 가짐 (코드 주석에 "Apple Calendar style") | `CalendarLeftSidebar.tsx:155-165` |
| 오늘 = 채운 원형 pill | `background: var(--accent); border-radius: pill; 32×32` | `09-calendar-redesign.css:229` |
| 헤어라인 그리드 | `--border-subtle: rgba(0,0,0,0.07)`, 정시=실선 / 30분=점선 | `09-calendar-redesign.css:263-268` |
| 이벤트 인스펙터 popover | `EventPopover` 이미 구현·연결됨 (카테고리 변경·메모·삭제·상세 열기) | `CalendarView.tsx:795` |
| 다크 모드 | `--color-ink` 등이 다크에서 재매핑됨 — 확인 결과 텍스트 대비 정상 | `01-base.css:186` |

**다크 모드는 문제없다.** 실제로 `data-theme="dark"`를 걸고 computed style을 읽어 확인했다(`--color-ink` → `#f5f5f7`). 단 §2.2에 다크 관련 실제 결함이 하나 있다.

---

## 2. 확정 결정

### D1. 색은 카테고리가 소유한다 — 레이어는 형태로 구분 **[구조]**

**현재:** hue가 레이어를 인코딩한다.

```css
/* 02-calendar.css:534-559 */
.gcal-chip-deadline         { background: var(--warning-soft); color: #b5650b; }
.gcal-chip-study-review     { background: var(--purple-soft);  color: var(--purple); }
.gcal-chip-project-deadline { background: var(--danger-soft);  color: var(--danger); }
.gcal-chip-external         { background: rgba(79,115,255,.1); font-style: italic; }
```

동시에 task 블록은 **카테고리 색을 인라인으로** 쓴다(`WeekView.tsx:899`). 결과적으로 같은 화면에서 색이 두 가지 다른 뜻("이 일정의 카테고리" vs "이 항목의 종류")을 가진다. 사이드바에서 `개인`을 보라색으로 바꿔도 study-review는 계속 보라색이라 서로 섞인다.

**결정:** hue = 카테고리, 형태 = 레이어.

| layer | 형태 | 비고 |
|---|---|---|
| `task` (시간 있음) | 틴트 채움 + 좌측 3px 바 | 기본형 |
| `task` (종일) / `deadline` / `project-deadline` | **외곽선 pill**(채움 없음) + 글리프 | 마감은 "점유"가 아니라 "표식" |
| `study-review` | 틴트 채움 + 점선 좌측 바 | |
| `external` | 점선 외곽선 (현재 `is-external`의 dashed outline 유지) | 읽기 전용 신호 |
| `focus-actual` | 사선 해칭 (현재 그대로) | "기록"임을 유지 |

글리프는 이미 있다 — `MonthView.tsx:18-25`의 `⚠ ↻ ◆ • ⏱`. 이걸 Week/Day 블록에도 동일 적용한다.

**리스크:** 모든 카테고리를 파랑으로 두면 레이어 구분이 형태에만 의존하게 된다. 완화책은 사이드바 카테고리 목록이 곧 범례라는 점 + 글리프. 수용 가능.

### D2. 이벤트 블록: 그림자 제거, 색은 CSS로 이관 **[시각 + 실제 결함]**

**현재 (`WeekView.tsx:895-907`)** — 색 계산이 JS 인라인에 박혀 있다:

```tsx
borderLeft: `3px solid ${item.color}`,
background: item.layer === "focus-actual"
  ? `repeating-linear-gradient(135deg, ${item.color}30 0 6px, ${item.color}12 6px 12px)`
  : `${item.color}22`,
```

여기서 두 가지 문제:

1. **그림자.** `.gcal-time-block`에 `box-shadow`가 두 번 걸린다(`02-calendar.css:857`, `09:283`). 애플 캘린더의 이벤트는 **완전히 평평하다.** 그림자는 popover·시트 같은 진짜 떠 있는 레이어에만 쓴다. 그리드에 그림자가 깔리면 밀집된 주간 뷰에서 시각적 소음이 된다.
2. **알파가 테마에 반응하지 못한다.** `${item.color}22` = 13% 고정. 라이트에서는 적당하지만 **다크에서 `#101012` 위 13% 파랑은 거의 안 보인다** (실측: `rgba(0,102,204,0.133)`). 애플 다크 모드는 틴트를 더 진하게(30–40%) 쓴다. JS 문자열 연결이라 테마 분기가 불가능한 게 원인이다.

**결정:** 색을 CSS 변수로 넘기고 계산은 CSS에서 한다.

```tsx
// WeekView.tsx — 인라인 스타일 3분기 제거
style={{ top, height, left, width, zIndex, ["--ev-color" as string]: item.color }}
```

```css
.gcal-time-block {
  --ev-tint: 14%;
  --ev-ink: 74%;
  background: color-mix(in srgb, var(--ev-color) var(--ev-tint), transparent);
  border-left: 3px solid var(--ev-color);
  color: color-mix(in srgb, var(--ev-color) var(--ev-ink), var(--text-primary));
  box-shadow: none;                 /* 애플: 그리드는 평평하다 */
}
[data-theme="dark"] .gcal-time-block { --ev-tint: 30%; --ev-ink: 55%; }
```

**부수 효과 — 이게 애플 룩의 핵심이다:** 지금 블록 텍스트는 `var(--color-ink)`(거의 검정)이고 시간은 회색이다. 애플은 **제목·시간 모두 캘린더 색의 어두운 변형**으로 칠한다. 위 `color-mix`가 그걸 한 줄로 해결한다. `--tint-*-text` 토큰이 이미 있는데 캘린더가 안 쓰고 있던 것도 같이 정리된다.

### D3. 현재 시각 선은 빨강으로 되돌린다 **[시각]**

```css
02-calendar.css:935  --calendar-now-color: #e06055;   /* 원래 */
09-calendar-redesign.css:184  --calendar-now-color: var(--accent);  /* 현재 = 파랑 */
```

**결정: `var(--danger)` (#ff3b30).**

애플이 빨강을 쓰는 이유는 미감이 아니라 **어떤 캘린더 색과도 겹치지 않아야 하기 때문**이다. 지금 이 앱의 기본 카테고리(`기본 일정`)가 `#0066cc` 파랑이라, now 라인이 accent 파랑이면 정확히 그 충돌이 일어난다.

주간 전체를 가로지르는 흐린 track + 오늘 열만 진한 선/점이라는 현재 구조는 **유지한다.** 밀집된 주간 그리드에서 오늘이 어느 열인지 즉시 보이므로 애플 원본보다 낫다. 색만 바꾼다.

### D4. Month 뷰: 시간 있는 항목은 "점 + 제목", 종일은 채운 pill **[구조]**

**현재:** 월간 셀의 모든 항목이 `.gcal-chip` — 높이 18px 채운 칩이다(`02-calendar.css:509`). 하루에 3개만 들어가도 색 덩어리가 셀을 채운다.

**애플:** 종일 이벤트만 채운 pill이고, **시간이 있는 이벤트는 채우지 않는다** — 좌측에 작은 색 점, 그 옆에 제목, 우측에 시작 시각. 셀이 훨씬 조용해지고 "종일 vs 시간 잡힘"이 한눈에 갈린다.

**결정:** `.gcal-chip`에 `.is-timed` 변형 추가.

```css
.gcal-chip.is-timed {
  background: none;
  border-left: 0;
  color: var(--text-primary);
  display: grid;
  grid-template-columns: 6px 1fr auto;   /* 점 · 제목 · 시각 */
  gap: 6px;
}
.gcal-chip.is-timed::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%;
  background: var(--ev-color); align-self: center;
}
```

`CHIP_CAP` 3개 제한과 `+N more`는 그대로 둔다.

### D5. Create 버튼을 툴바로, 툴바에서 "Calendar" 라벨 제거 **[레이아웃 · 적응]**

현재 툴바: `[☰] Calendar [Today] [‹ ›] [Aug 9 – Aug 15, 2026] ......... [Day Week Month Year]`
좌측 사이드바 최상단: 큰 `+ Create` 버튼.

- `Calendar` 텍스트는 중복이다. 앱 사이드바에서 Calendar 항목이 이미 선택 상태다.
- 큰 좌측 `Create` 버튼은 **구글 캘린더 관습**이다. 애플은 툴바의 `+` 아이콘이다.

**결정 툴바:**

```
[☰] [+]   ‹ [오늘] ›   Aug 9 – Aug 15, 2026        [ Day | Week | Month | Year ]
```

- `+`를 툴바로 이동 → 사이드바 상단의 큰 버튼 블록을 회수해 미니 달력/카테고리가 위로 올라온다
- range label은 `--font-section-title`(600/16px) 유지, 좌측 정렬
- 뷰 스위처는 지금도 segmented control 형태이므로 그대로

**미니 월간 달력은 사이드바에 유지한다.** Calendar.app에는 없지만(그쪽은 캘린더 목록만) 이 앱에서는 날짜 점프의 유일한 수단이다. 없애면 사용자가 손해를 본다. **이 항목은 의도적으로 애플을 따르지 않는다** — 대신 `+ Create` 아래가 아니라 카테고리 목록 **아래**로 내려 우선순위를 낮춘다.

### D6. 키보드 단축키 **[상호작용]**

현재 캘린더에 단축키가 **하나도 없다**(전역 `/` 검색만 있음). 애플 캘린더에서 가장 몸에 배는 부분이다.

| 키 | 동작 | 애플 대응 |
|---|---|---|
| `Ctrl/⌘ + 1·2·3·4` | Day / Week / Month / Year | ⌘1–⌘4 그대로 |
| `T` | 오늘로 | ⌘T의 무수식 변형 |
| `←` `→` | 이전/다음 기간 | ⌘← / ⌘→ |
| `Delete` / `Backspace` | 선택된 이벤트 삭제(확인 토스트 + Undo) | 동일 |
| `Esc` | popover 닫기 · draft 취소 · selection 해제 | 동일 |

플랫폼 분기는 `event.metaKey || event.ctrlKey`로 한 곳에서 처리한다(윈도우 Tauri가 주 배포 대상).

**주의 2건:**
- 텍스트 입력 중에는 전부 무시해야 한다. `event.target`이 input/textarea/`contenteditable`이면 early return.
- Today 페이지의 `1/2/3` 버킷 이동(`FocusQueue.tsx:193`)과 키가 겹치지 않게 캘린더 단축키는 **수식키를 붙인 쪽만** 무수식 `T`/화살표와 공존시킨다.

### D7. Year 뷰: 밀도 틴트 **[기능 추가]**

현재 `YearView.tsx`는 날짜 숫자만 그린다(items prop 자체가 없다, 64줄). 애플 연간 뷰는 **바쁜 날일수록 진하게** 칠해서 1년치 부하를 한눈에 보여준다 — 이 앱의 "언제 몰려 있나"와 정확히 맞는 기능이다.

```tsx
// countsByDate: Map<string, number>를 CalendarView에서 내려받는다
style={{ background: `color-mix(in srgb, var(--accent) ${Math.min(count, 5) * 6}%, transparent)` }}
```

0건은 투명, 5건 이상은 30%에서 포화. 오늘은 기존 `is-today` 원형 유지.

### D8. 반투명(vibrancy)은 **하지 않는다** **[명시적 비채택]**

애플 캘린더의 툴바·사이드바는 반투명 + 블러다. 이걸 재현하려면 `backdrop-filter: blur(20px)`인데 —

- 이 앱 배경은 `--bg-app: #f2f2f7` **단색**이다. 블러할 대상이 없어 시각적 이득이 사실상 0이다.
- `backdrop-filter`는 스크롤 중 합성 비용이 크다. 44px 행 × 18시간 × 7열 그리드 위에서 특히.

**결정: 불투명 유지.** 나중에 Tauri 창 자체에 OS 배경 투과(`vibrancy`/`mica`)를 켜게 되면 그때 재검토한다.

---

## 3. Phase 계획

### Phase A — 시각만, 동작 변경 없음 — **완료 (2026-08-14)**

| # | 작업 | 실측 결과 |
|---|---|---|
| A1 | 이벤트 블록 그림자 제거 | `box-shadow: none` ✔ |
| A2 | `--ev-color` 변수화 + `color-mix` 틴트/텍스트 (D2) | 텍스트가 카테고리 색을 따라감 (`#0066cc` → `srgb .029 .325 .623`) ✔ |
| A3 | 다크 모드 틴트 알파 분기 | 라이트 14% / 다크 30%, 대비 라이트 6.6:1 · 다크 5.1:1 ✔ |
| A4 | now 라인 `--danger` (D3) | `--calendar-now-color: #ff3b30` ✔ |
| A5 | 툴바 정리 + `+` 이동 (D5) | `☰ + ‹ Today › Aug 9 – Aug 15, 2026`, 사이드바 Create 제거 ✔ |

`npx tsc -b` 통과, `vitest run` 271개 전부 통과, 신규 콘솔 에러 없음.

CSS는 `src/styles/10-calendar-apple.css`를 새로 만들고 `src/styles.css` 배럴 **맨 끝**에 `@import`했다. 09는 건드리지 않았다 — 09가 최종 오버라이드 레이어이므로 그 뒤에 붙어야 이긴다.

**부수 정리:** Create 버튼이 사라지면서 죽은 코드가 된 `calendar.create` i18n 키(en/ko)와 `.gcal-create-btn` CSS 3블록(02·09)을 함께 제거했다.

**Phase A에서 발견한 별개 결함 (기존 버그, 이번 변경과 무관):**
사이드바를 접으면 `.gcal-sidebar.is-rail`이 붙지만 **폭이 220px 그대로다**(48px 규칙이 적용되지 않음). `.gcal-body.is-sidebar-rail`에는 대응하는 CSS 규칙 자체가 없다. Phase A 변경을 `git stash`로 되돌린 기준선에서도 동일하게 재현되므로 원래 있던 버그다. 접기 기능이 사실상 동작하지 않는다.

### Phase B — 구조 — **완료 (2026-08-14)**

| # | 작업 | 실측 결과 |
|---|---|---|
| B1 | 레이어 → 형태 매핑, hue는 카테고리로 일원화 (D1) | 아래 표 ✔ |
| B2 | Month 뷰 timed = 점+제목 (D4) | 시간 있는 항목 = 투명 배경 + 6px 점 + 시작 시각 ✔ |
| B3 | 미니 월간 달력을 사이드바 하단으로 (D5) | `[section×5, mini-month]` ✔ |

**형태 언어 (실측)**

| layer | 형태 | 배경 | 색의 출처 |
|---|---|---|---|
| task (시간 있음) | 틴트 채움 + 실선 좌측 바 | 14% | 카테고리 |
| task (종일) | 틴트 채움 pill | 16% | 카테고리 |
| deadline `⚠` | **외곽선** | 투명 | 카테고리 (전에는 고정 주황) |
| project-deadline `◆` | **외곽선** | 투명 | 프로젝트 색 |
| study-review `↻` | 틴트 채움 pill | 16% | 스터디 카테고리 (전에는 고정 보라) |
| external `•` | **점선 외곽선** | 투명 | 외부 캘린더 색 |
| focus-actual `⏱` | 사선 해칭 / 월간에선 빈 원 | — | 카테고리 |

규칙: **채움 = 그날 할 일, 외곽선 = 마감 표식, 점선 = 남의 것.** 이 구분이 `draggable: false`와 정확히 겹치도록 맞췄다 — "끌 수 없다"와 "작업 블록이 아니다"가 같은 모양으로 보인다.

`deadline`/`study-review`는 `calendarItems.ts`에서 `categoryId`를 이미 갖고 있으면서도 색을 버리고 고정 톤을 쓰고 있었다. 그 두 줄을 카테고리 색으로 바꾼 것이 D1의 실제 구현이다.

**완료 표시도 함께 고쳤다.** `.gcal-chip.is-done`이 항목 색을 버리고 초록(`rgba(52,199,89,.12)`)으로 덮어쓰고 있었다 — 같은 "hue가 상태를 인코딩하는" 문제다. 이제 항목 고유 색을 유지한 채 취소선 + 흐리게로만 표시한다.

라이트/다크 양쪽에서 대비 확인: 외곽선 칩 라이트 7.3:1 · 다크 5.0:1, 채움 칩 라이트 6.6:1 · 다크 5.1:1.
`npx tsc -b` 통과, 271개 테스트 통과, 신규 콘솔 에러 없음.

### Phase C — 상호작용 — **완료 (2026-08-14)**

| # | 작업 | 실측 결과 |
|---|---|---|
| C3 | 선택 링 | 클릭 → `is-picked` + 카테고리 색 outline ✔ |
| C1 | 키보드 단축키 (D6) | 아래 표 ✔ |
| C2 | Year 뷰 밀도 틴트 (D7) | 1건 = 6% 틴트 + `title` 카운트 ✔ |

C3을 먼저 했다. Delete를 넣으려면 **무엇이 지워질지가 화면에 보여야** 하기 때문이다.

**확정된 키맵 — D6에서 수정됨**

D6은 애플의 `⌘1–⌘4` / `⌘T`를 그대로 쓰자고 했으나, 구현하면서 두 가지가 막혔다:

1. `Ctrl+숫자`와 `Ctrl+T`는 **브라우저가 선점**한다(탭 전환/새 탭). 웹 빌드에서 `preventDefault`로 막히지 않는다.
2. 무수식 `T`는 **이미 앱 전역 단축키**다 — `App.tsx:281`에서 "Today 페이지로 이동". 캘린더에서 뺏으면 키보드로 Today 페이지에 갈 방법이 사라진다.

그래서 뷰 키는 이름의 첫 글자, "오늘"은 `Home`으로 갔다. 둘 다 무엇과도 충돌하지 않는다.

| 키 | 동작 |
|---|---|
| `D` `W` `M` `Y` | Day / Week / Month / Year |
| `←` `→` | 이전 / 다음 기간 |
| `Home` | 오늘로 |
| `Delete` / `Backspace` | 선택된 이벤트 삭제 (task만) |
| `Esc` | popover · draft · 선택 해제 |

전역에서 이미 쓰는 키(`/` `t` `i` `n` `Esc`)는 건드리지 않았다. 수식키가 눌린 조합은 `App.tsx`와 같은 이유로 전부 흘려보낸다 — 브라우저와 OS의 몫이다.

**Delete의 안전장치 3겹**
1. 링이 없으면 아무 일도 일어나지 않는다.
2. `task`가 아닌 항목(프로젝트 마감·복습 마커)은 파생 레코드라 대상에서 제외한다.
3. 앱 전역의 삭제 확인 다이얼로그를 그대로 통과한다 — 확인하는 **동안 링을 유지**해서 무엇을 지우는지 보이게 했다. 링은 항목이 실제로 사라졌을 때만 정리된다(취소하면 그대로 남는다).

**검증** — 입력창에 포커스를 두고 `w`를 눌러도 뷰가 바뀌지 않는 것(가장 흔한 회귀), 캘린더를 떠나면 리스너가 해제되는 것까지 확인. `npx tsc -b` 통과, 271개 테스트 통과, 신규 콘솔 에러 없음.

---

## 4. 검증 방법

```bash
npm run dev
```

| 확인할 것 | 절차 |
|---|---|
| D2 다크 틴트 | Settings에서 다크 전환 → Week 뷰 이벤트가 배경과 충분히 분리되는지. 라이트/다크 양쪽 스크린샷 비교 |
| D2 텍스트 색 | 카테고리 색을 보라로 바꾼 뒤 블록 제목이 따라 보라 계열이 되는지 |
| D1 회귀 | 6개 레이어를 한 주에 모두 만들어 놓고, 카테고리 색을 전부 같은 파랑으로 바꿔도 종류가 구분되는지 |
| D3 | now 라인이 파란 카테고리 블록과 겹칠 때 구분되는지 |
| D4 | 하루에 종일 1 + 시간 2를 넣고 월간 셀이 조용해졌는지 |
| D6 | 입력창에 포커스를 두고 `T`를 눌러 **오늘로 점프하지 않는지**(가장 흔한 회귀) |

`npx tsc -b` + `npx vitest run`은 매 Phase 끝에 필수 (릴리스 빌드가 test 파일까지 타입체크함).

---

## 5. 하지 않기로 한 것

| 항목 | 이유 |
|---|---|
| `DESIGN-apple.md`의 타입 스케일 도입 | 마케팅 사이트용(hero 56px). 캘린더에 무관 |
| 반투명/블러 chrome | 단색 배경 위라 이득 없음, 스크롤 비용만 발생 (D8) |
| 미니 월간 달력 제거 | 애플엔 없지만 이 앱의 유일한 날짜 점프 수단 (D5) |
| now 라인을 오늘 열에만 그리기 | 현재의 "흐린 track + 오늘만 진하게"가 주간 밀집 그리드에 더 낫다 |
| 우측 패널을 popover로 대체 | `EventPopover`(peek)와 우측 패널(full edit) 2단 구조는 이미 맞다. 역할만 문서화하면 됨 |
