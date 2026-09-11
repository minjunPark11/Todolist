# 타임라인 레퍼런스 정합 설계

- 작성일: 2026-09-11
- 레퍼런스: `focusflow_timeline_v15_refined.html` (2,823줄, 단일 파일 목업)
- 기준: 이 브랜치 `a1ef9f0`
- 선행 문서: `POLISHED_REFERENCE_PARITY_DESIGN.md` (같은 종류의 작업을 목록 화면에서 이미 한 번 했다 — §4.5의 자 둘, §5의 토큰, `25-reference.css`라는 가산 레이어가 전부 그 문서의 산물이다), `GANTT_TIMELINE_DESIGN.md` (§10~§17), `TIMELINE_V2_DESIGN.md`, `TIMELINE_ARRANGE_TASKS_DESIGN.md`
- 대상: `src/components/TimelineView.tsx` · `TaskGanttView.tsx` · `src/domain/view/timeline.ts` · 새 `src/domain/view/focusTrace.ts` · 새 `src/styles/26-timeline.css` · `src/styles/scale.test.ts` · 셸 셋(`AppShell.tsx` · `useContextSidebar.ts` · `19-app-shell.css`)

---

## 0. 요약

레퍼런스의 타임라인을 **비율·디자인·기능 모두** 옮긴다. 옮기는 방법은 목록 화면에서 한 번 검증된 그 방법이다 — 기존 파일을 건드리지 않는 가산 CSS 레이어 한 장, 레퍼런스 자로 재는 파일 목록에 한 줄, 그리고 컴포넌트의 DOM만 레퍼런스의 상자 구조로 맞춘다.

세 가지가 이 작업을 **생각보다 작게** 만든다.

1. **토큰이 이미 있다.** 레퍼런스가 쓰는 전환 시간 네 개(`.12s`·`.14s`·`.16s`·`.18s`)는 `25-reference.css`의 `--motion-fast`·`--motion-row`·`--motion-base`·`--motion-panel`과 정확히 같은 값이다. 액센트도 마찬가지다 — 목업은 `#565ee7`, 이 앱은 `#556be7`. 0.5° 차이이고, 이미 `[data-accent="blue"]`에 적혀 있다.
2. **자가 이미 넓다.** REFERENCE 자는 `10.5px`·`11.5px`·`13.5px`·`17px`과 반경 `5·6·8·9px`, 간격 `5·7·9·11·13·14px`을 이미 허용한다. 타임라인이 새로 요구하는 것은 굵기 **두 칸**(500·560)뿐이다(§6.2).
3. **집중 데이터가 이미 있다.** 레퍼런스의 시그니처 기능인 집중 트레이스는 `focusSessions[].segments[]`를 날짜로 쪼개 막대 안에 그리는 것인데, `FocusSession.segments`와 그것을 날짜 경계로 쪼개는 `domain/focus/records.ts`의 `recordedMs`가 **이미 이 저장소에 있다**. 새로 필요한 것은 그 위에 얹는 순수 모듈 하나다.

세 가지가 이 작업을 **생각보다 크게** 만든다.

1. **머리가 6px에서 82px이 된다.** 레퍼런스의 위 구조는 42px 도구줄 + 40px 눈금 2단이고, 그 82px은 두 열에 걸쳐 있다. 지금 우리 머리는 `padding: 6px 0`짜리 한 줄이다.
2. **작업 열이 이름 하나에서 행 하나가 된다.** 레퍼런스의 왼쪽 열은 체크박스·제목·날짜·⋯ 네 칸짜리 진짜 작업 행이다. 우리 것은 점과 제목뿐인 버튼 하나다.
3. **셸이 따라온다.** 레퍼런스는 V14에서 페이지 헤더를 없애고 제목을 작업 열 툴바 안으로 넣었다(`--page-head-h: 0`). 그걸 하려면 레일(52→40) · 사이드바(232→144) · 접기 토글이 같이 움직인다.

**하지 않는 것 셋**(§4에서 결정): 막대를 단색 인디고로 되돌리지 않는다. 줌을 주 4단으로 갈아끼우지 않는다. 그리고 레퍼런스의 결함 세 건(§1.2)은 따라하지 않는다.

---

## 1. 레퍼런스 사실 확인

### 1.1 캐스케이드 — 화면에 도달하는 값만 읽어야 한다

단일 `<style>` 안에 **아홉 겹**이 쌓여 있다: 기본 → V6 → V7 → V8 → V9 → V10 → V11 → V12 → V13 → V14 → V15. 특정도가 전부 (0,1,0)으로 같으므로 **나중에 적힌 것이 이긴다**. 목업을 위에서부터 읽으면 틀린 값을 옮기게 된다.

| 속성 | 기본이 적은 값 | 화면에 도달하는 값 | 덮은 층 |
|---|---|---|---|
| `--task-col-w` | 252px | **264px** | V15 |
| `--rail-w` | 44px | **40px** | V14 |
| `--sidebar-w` | 176px | **144px** | V15 |
| `.task-head` 높이 | 40px | **82px** (42+40) | V15 |
| `.task-row` 높이 | 44px | **42px** | V15 |
| `.bar` 높이 | 28 → 26 → 24 → 26 | **28px** | V14·V15 |
| `.bar` 배경 | `#f3f3ff` | **`var(--schedule-bg)` = `#f2f2ff`** | V15 |
| `.bar.selected` | 액센트 채움 + 흰 글씨 | **`#eeeeff` + `#454cb3` + 안쪽 1px 링** | V15 |
| `.focus-trace` 높이 | 4px | **6px** | V15 |
| `.today-line` 불투명도 | .36 | **.16** | V15 |
| `.milestone` top | 18 → 17 → 16 → 17 | **18px** | V11 |
| `.segmented` | 테두리 있는 캡슐 | **테두리 0, 배경 투명한 낱개 버튼 셋** | V15 |

**죽은 규칙.** 옮기면 안 되는 것들이다.

- `.month-tag` — V10이 `display:none`으로 껐다. 월 표시는 `.months` 띠가 가져갔다.
- `.group-row` / `.tl-group` — `height:0; display:none`. 그룹 머리는 이 목업에 없다.
- `.bar[data-focus]::after` — V10이 만들고 V11이 다듬었지만 **JS가 `data-focus`를 한 번도 쓰지 않는다.** V13의 `.focus-summary` 엘리먼트가 그 일을 가져갔다.
- `.drawer-backdrop` — V11이 `display:none !important`. 트레이는 모달이 아니다.
- `.grid-v.g1`~`.g5` — `#dynamicGrid`가 런타임에 자기 선을 만든다.
- `.quick-entry` — V11의 인라인 생성 행이 대체했다. 떠 있는 입력 상자는 더 이상 열리지 않는다.
- `.bar { display: block }` (V13) — `layoutTimeline()`이 `el.style.display='flex'`를 **인라인으로** 쓴다. 인라인이 이긴다. 실제로는 flex이고, 안의 `.bar-content`가 절대 배치라 차이가 드러나지 않을 뿐이다.

### 1.2 레퍼런스의 결함 세 건 — 따라하지 않는다

**(a) 격자선이 첫 화면 높이까지만 그려진다.**
`.timeline-col`은 `position:relative; overflow:auto`이고 `.grid-body`는 그 안의 `position:absolute; top:82px; bottom:0`이다. 스크롤 컨테이너의 절대 배치 자식은 **패딩 상자**(= 보이는 높이)를 기준으로 잡히고 내용과 함께 스크롤한다. 그래서 행이 열 높이를 넘어가면 그 아래에는 세로 격자선도 오늘 선도 없다. 12개 작업 × 42px = 504px인데 열이 400px이면 318px 아래로는 선이 사라진다.

우리는 이미 맞게 하고 있다 — 덮개를 `.ff-timeline-canvas`(= 내용 전체 높이)에 대고 잰다. `12-timeline.css` 머리주석이 그 이유를 적어놨다. **그대로 둔다.**

**(b) 월 띠가 실제 1일이 아니라 주 경계에서 끊긴다.**
`buildTimeHeader()`가 주의 **시작일** 월로 묶고 너비를 `count/visibleWeeks`로 준다. 9월 마지막 주가 10월 2일까지 걸쳐 있어도 그 주는 통째로 9월이다. 주 단위 눈금에서는 이것이 옳은 근사이고(§2.3), 우리도 주 단위 줌에서는 같게 한다. 다만 **월 단위 줌에서는 쓰지 않는다** — 그 자리에서는 열 자체가 달이다(§7.2).

**(c) 오늘 표시선이 머리에는 없다.**
`.today-head-marker`는 `width:1px`인데 배경이 없다. 눈금 안에서는 "오늘" 글자만 떠 있고, 선은 `.grid-body` 안의 `.today-line`뿐이다. 그래서 글자와 선이 **82px 떨어져서** 서로 이어지지 않는다.
우리 `--timeline-now-line`은 이미 머리 아래부터 내려오는 한 줄이다. 레퍼런스의 흰 배경 칩("오늘")만 가져오고, **선은 눈금 바닥까지 이어 붙인다**(§2.3 주).

---

## 2. 실측표

모든 값은 §1.1의 캐스케이드를 접어 화면에 도달하는 것만 적었다. `[측정]`은 목업 CSS에 적힌 리터럴, `[파생]`은 그것에서 계산한 값이다.

### 2.1 셸과 판

| 이름 | 값 | 비고 |
|---|---|---|
| 레일 | 40px, 패딩 `10px 4px 12px`, 배경 `#f7f7f8`, 우측 1px `#eceef1` | 버튼 30×30 반경 6 |
| 레일 활성 표시 | `::before` `left:-6px; top:8px; bottom:8px; width:2px`, 반경 999, 액센트 | 배경 채움 아님 |
| 사이드바 | 144px, 패딩 `14px 8px 12px`, 배경 `#fafafb`, 우측 1px `#e7e9ed` | |
| 사이드바 행 | 최소높이 31px, 패딩 `0 8px`, 반경 6, 12.5px | 활성 `#f1f2f4` / `#303640` / 600, 아이콘만 액센트 |
| 사이드바 접기 손잡이 | `left: calc(rail + sidebar − 11px)`, `top:14px`, 22×28, 반경 6 | 평소 `opacity:0`, 사이드바 hover 시 1 |
| 접힘 | 그리드 `rail 0 1fr`, 사이드바 `width:0; padding:0; opacity:0` | 전환 `.18s cubic-bezier(.2,.8,.2,1)` |
| 페이지 헤더 | **없음** (`--page-head-h:0`, `.main-head{display:none}`) | ≤960에서만 56px로 돌아옴 |
| 타임라인 카드 | `grid-template-columns: 264px minmax(0,1fr)` | 1180→252 / 960→224 / 720→190 |
| 작업 열 | 배경 `#fcfcfd`, 우측 1px `#e7e9ed`, 세로만 스크롤 | |
| 트랙 열 | 배경 `#fff`, 양방향 스크롤, `--timeline-min:720px` | 960→680 / 720→640 |

### 2.2 머리 82px

두 열이 같은 높이(`42px + 40px`)를 나눠 갖는다. 아래 1px `#e7e9ed`.

| 자리 | 값 |
|---|---|
| `.task-toolbar` | 42px, 패딩 `0 10px 0 12px`, gap 6 |
| ↳ 워크스페이스 제목 | h1 **17px / 650 / `-.025em` / `#2f3540`**, 개수 11px / 500 / `#9299a3` |
| ↳ 미배치 버튼 | `margin-left:auto`, 28px, 패딩 `0 6px 0 8px`, 12px / 500 / `#707783`; 개수 10px / 600 / `#858c96`; 셰브론 13px, 열리면 180° |
| `.task-ruler-label` | 40px, 패딩 `0 12px 8px`, `align-items:flex-end`, 11px / 500 / `#8a919b`, 글자 "작업" |
| `.timeline-controls` | 42px, 패딩 `0 10px`, gap 3 |
| ↳ `.segmented` | 그리드 `28px auto 28px`, gap 2, 높이 30, **테두리 없음** · 배경 투명 · 반경 6 · 12px/500; 가운데("오늘")만 600 `#3f4650`; hover `#f3f4f6`; 아이콘 14px 선 1.8 |
| ↳ 사이 | `flex:1` |
| ↳ 척도 버튼 | 30px, 패딩 `0 8px`, 반경 6, 12px/500 `#59616c` + 셰브론 13px. 글자 "6주" |
| ↳ 보기 버튼 | 같은 모양. 글자 "보기" |
| ↳ 우측 동작 | `margin-left:4px`, gap 3. "새 작업" 30px/패딩 `0 8px`/12px·600/`#424954` + 아이콘 15px, ⋯ 30×30 아이콘 16px |
| `.time-ruler` | 40px, `position:relative`, `overflow:visible` |
| ↳ `.months` | 16px. 각 칸 `width: 그달의 열수 / 전체열수`, 패딩 왼쪽 8, 11px / 600 / `#555d68` |
| ↳ `.weeks` | 24px, `repeat(--week-count, 1fr)`, 11.5px / 500 |
| ↳ `.week` | 24px, `align-items:flex-end`, 가운데 정렬, 패딩 아래 6, `#737b86`, `tabular-nums`, 좌측 1px `#f1f2f4`(첫 칸 없음), 달이 바뀌는 칸은 1px `#d9dce1` |
| ↳ 오늘 칩 | `left:50%; bottom:20px; translateX(-50%)`, 패딩 `0 4px`, 배경 `#fff`, 10.5px / 550 / `#6970ca`, 줄높이 14 |

메뉴(척도·보기 공통): `top:38px`, 반경 8, 패딩 5, 테두리 1px `#e7e9ed`, 그림자 `0 10px 26px rgba(25,30,40,.10)`. 척도 메뉴 `left:0; width:136px`, 보기 메뉴 `right:0; width:174px`. 항목 34px / 반경 6 / 12px. 보기 토글 표시는 14px 사각형, 반경 4, 테두리 `#bcc2cb`, 켜지면 액센트 채움.

### 2.3 행

| 자리 | 값 |
|---|---|
| 행 높이 | **42px**, 양쪽 모두. 행 사이 테두리 **없음** |
| `.task-row` 패딩 | `0 7px 0 12px`, 14px |
| 체크 원 | 15×15, `flex:0 0 15px`, 우측 여백 8, 테두리 1.5px `#a9afb8`, 원, 흰 배경. hover 테두리 `#737b86`·배경 `#f5f6f8`·체크 표시. 완료 시 `#6f7680` 채움 |
| 제목 | 14px / 400 / `#363d46`, 한 줄 말줄임. 완료 시 `opacity:.5` + 취소선 |
| 날짜 | 38px 고정, 우측 정렬, 11px / 400 / `#8b929c`, `tabular-nums` |
| ⋯ | 28×28, 좌측 여백 4, 반경 6, 16px `#858c96`. 평소 `opacity:0` → 행 hover·선택·메뉴열림·focus-within에서 1 |
| hover | **CSS `:hover`가 아니다.** `.row-hover` 클래스를 JS가 양쪽 행에 동시에 건다 → `rgba(25,30,40,.020)` |
| 선택 | `rgba(35,39,50,.035)`, 제목 500 `#2f3540`, 날짜 `#717985` |

> **오늘 선(§1.2c 보정).** 레퍼런스는 눈금의 칩과 본문의 선이 82px 끊겨 있다. 우리는 `--ff-timeline-now-line`을 눈금 바닥(`82px`)에서 시작해 마지막 행까지 한 줄로 내린다. 칩은 레퍼런스대로 `bottom:20px`에 흰 배경으로 얹어, 선이 글자를 관통하지 않게 한다.

### 2.4 막대

| 자리 | 값 |
|---|---|
| 상자 | `top:7px`, 높이 **28px**, 반경 6, 패딩 0, 테두리 0, 최소너비 26px, `z-index:5`, `cursor:grab` |
| 평상 | 배경 `--schedule-bg #f2f2ff`, 글자 `--schedule-text #5057b7`, 11.5px / 600 |
| hover | 배경 `--accent-hover #ececff`, 글자 `#474fb5` |
| 선택 | 배경 `--selected-bg #eeeeff`, 글자 `#454cb3`, `box-shadow: inset 0 0 0 1px #aeb3fc, 0 1px 3px rgba(44,48,80,.08)` |
| `.bar-content` | 절대 `left:9 right:9 top:0 bottom:5`, `z:2`, flex·gap 8, **`pointer-events:none`** |
| `.bar-label` | `flex:1 1 auto`, 말줄임 |
| `.focus-summary` | `margin-left:auto`, 10.5px / 500, `tabular-nums`, `opacity:.78`. 진행 중이면 `.live` → `.94` / 560 + 5px 점 |
| 손잡이 | 폭 10px, `opacity:0` → hover·선택 시 1. 안쪽 막대 `top:8 bottom:8 width:3` 반경 4, `opacity:.18` → `.58` |
| 폭에 따른 밀도 | `≥130px` wide / `≥72px` mid / 그 미만 small. **mid·small은 `.focus-summary` 숨김, small은 `.bar-content` 전체 숨김**(= 트레이스만 남는다) |

**집중 트레이스** — 레퍼런스의 시그니처.

| 자리 | 값 |
|---|---|
| 띠 | 절대 `left:0 right:0 bottom:1px`, 높이 **6px**, `z:3`, `overflow:hidden`, 반경 `0 0 6px 6px`, `pointer-events:none` |
| 칸 | 절대 `bottom:0`, 최소너비 1px, 배경 액센트, `opacity:.92` → hover·진행중 1. `pointer-events:auto` |
| 높이 사다리 | `<30분 → 2px` · `<60분 → 3px` · `<120분 → 4.5px` · 그 이상 **6px**(= 띠를 가득 채움) |
| 선택된 막대 위 | 칸이 액센트 그대로, hover 시 `#454ed8` |

**마일스톤**: `top:18px`, 8×8, `#9aa0a9`, 45° 회전, 반경 2px. `::before{inset:-8px}`로 클릭 영역을 24×24로 넓힌다. hover `#636b75`.

**진행 중 노드**: `top:21px`, 8×8 원, 액센트, `translate(-50%,-50%)`, `box-shadow: 0 0 0 2px rgba(255,255,255,.96), 0 0 0 3px rgba(86,94,231,.18)`, `focusBreath 1.8s` 숨쉬기. 일정 **밖**에서 집중 중이면 흰 채움 + 1.5px 액센트 테두리. x는 **오늘**, y는 그 작업의 행.

### 2.5 트레이 · 드래그 · 떠 있는 것들

| 자리 | 값 |
|---|---|
| 트레이 | 폭 288px, 우측 0·상하 0, 좌측 1px `#e5e7eb`, 반경 0, 패딩 `14px 12px`, 그림자 `-10px 0 26px rgba(20,25,35,.035)`, `translateX(100%)` → 0 |
| 밀기 | `.workspace.tray-open .timeline-card{margin-right:288px}`, 전환 `.18s cubic-bezier(.2,.8,.2,1)` — **덮지 않고 민다** |
| 트레이 항목 | 38px, 위 여백 2, 반경 6, 배경 투명, 패딩 `0 8px`, 12.5px. hover `#f3f4f6` + 손잡이 `⋮⋮` `opacity:.5` |
| 드래그 유령 | `position:fixed`, 28px, 최소 26px, 1px 파선 `rgba(86,94,231,.44)`, 반경 6, 배경 `rgba(86,94,231,.10)`. `top = 그 행의 top + 7` |
| 날짜 칩 | fixed, 20px, 패딩 `0 6px`, 반경 5, 액센트 채움, 10.5px / 600. `top = 눈금바닥 − 24`, 유령 가운데 |
| 안내선 | fixed, 1px, `rgba(86,94,231,.20)`. 눈금 바닥 → 열 바닥 |
| 토스트 | fixed `left:50% bottom:24px`, 최소 38px, gap 14, 패딩 `0 8px 0 12px`, 반경 8, 1px `#e7e9ed`, 그림자 `0 10px 28px rgba(25,30,40,.11)`, 11.5px / 550. **4초** 뒤 사라짐 + "실행 취소" |
| 집중 툴팁 | fixed, 폭 164px, 패딩 `8px 10px`, 반경 8, 그림자 `0 10px 26px rgba(25,30,40,.10)`. 날짜 10.5/650, 총합 12/650, 세션수 10.5. 위 `rect.top−70`, 안 들어가면 아래로 뒤집기, 화면 가장자리 8px 여백 |
| 맥락 메뉴 | fixed, 폭 188px, 반경 8, 패딩 5. 항목 34px / 반경 6 / 12.5px `#4b535e`. 구분선 1px `#eceef1` 여백 `5px 6px`. 위험 `#c65049` |

### 2.6 반응형

| 폭 | 바뀌는 것 |
|---|---|
| ≤1180 | 사이드바 140, 작업 열 252 |
| ≤960 | 작업 열 224, `--timeline-min:680`. **페이지 헤더 56px으로 복귀**, 워크스페이스 제목·우측 동작 숨김, 사이드바는 서랍, 접기 손잡이 없음, 트레이는 밀지 않고 덮음 |
| ≤720 | 작업 열 190, `--timeline-min:640`, 제목 13.5 / 날짜 11, ⋯ 항상 보임 |

---

## 3. 현행과의 격차

| 축 | 지금 | 레퍼런스 | 크기 |
|---|---|---|---|
| 골격 | 한 캔버스 + `sticky left:0` 이름 열 | 두 스크롤 판 + JS 세로 동기화 | §5에서 **현행 유지**로 결론 |
| 머리 | `padding:6px 0` 한 줄 | 42 + 40 = 82px 2단 | 큼 |
| 눈금 | 열 이름 한 줄 | 월 띠 + 주 눈금 2단 | 큼 |
| 행 높이 | 32px | 42px | 토큰 한 줄 |
| 행 사이 | `inset 0 -1px` 규칙선 | **없음** | 한 줄 |
| 작업 열 | 점 + 제목 (버튼 하나) | 체크 · 제목 · 날짜 · ⋯ | 큼 |
| 막대 안 글자 | **날짜** (`8.31 – 9.3`) | **이름** | §4.1 |
| 막대 색 | 리스트 색 틴트 | 단색 인디고 | §4.2 |
| 막대 높이 | 24 / 32 행 | 28 / 42 행 | 토큰 |
| 집중 트레이스 | **없음** | 막대 바닥 6px 띠 | 큼 — 새 도메인 모듈 |
| 진행 중 표시 | 없음 | 숨쉬는 노드 + 라이브 시간 | 중간 |
| 미배치 | 격자 **옆 칸**(`tgv-arrange`) | 오른쪽에서 밀고 들어오는 트레이 | §4.3 |
| 드래그 미리보기 | 없음(네이티브 HTML5) | 유령 + 날짜 칩 + 안내선 | 중간 |
| 배치 취소 | 없음 | 4초 토스트 | 작음 |
| 행 메뉴 | 없음 | ⋯ → 4항목, 화살표 이동 | 중간 |
| 인라인 생성 | `TaskQuickAdd`가 위에 따로 | 첫 행 자리에 끼어드는 입력 행 | 중간 |
| 연결 hover | 없음 | 양쪽 행 동시 점등 | 작음 |

---

## 4. 충돌과 결정

레퍼런스가 **이 저장소가 이유를 적어두고 내린 결정**과 부딪히는 자리들이다. 여섯 건이고, 전부 여기서 한 번만 판정한다.

### 4.1 막대 안의 글자 — 날짜 vs 이름 → **레퍼런스대로 이름**

`GANTT §11`과 `TIMELINE_V2 §4`가 제목을 막대에서 빼고 날짜를 넣었다. 이유는 "이름은 왼쪽 열이 이미 매 행 말하고 있으니 같은 말을 두 번 하지 말라"였다.

레퍼런스는 **반대로 나눈다**: 막대에 이름, 작업 열에 날짜(`.task-meta`, 종료일 `M.D`). 이건 §4의 규칙을 어기는 게 아니라 **같은 규칙을 반대편에 적용한 것**이다 — 여전히 어느 것도 두 번 말하지 않는다.

레퍼런스 쪽이 나은 이유가 하나 더 있다. §4가 남긴 문제는 "막대가 좁아지면 무엇이 사라지는가"인데, 날짜를 막대에 두면 좁은 막대에서 **날짜**가 사라지고 화면에는 이름 없는 색 조각만 남는다. 이름을 두면 좁은 막대에서 이름이 사라지고 대신 **집중 트레이스**가 남는다(`bar-small`은 `.bar-content`만 숨긴다) — 사라진 자리에 다른 사실이 들어선다.

→ `barText`/`barTextShort`는 **지운다**. 막대는 `item.title`을 쓴다. 날짜는 `.task-meta`로 간다.

### 4.2 막대 색 — 단색 vs 리스트 색 → **리스트 색 유지, 기하만 이식**

레퍼런스는 리스트가 하나뿐인 목업이라 이 문제가 없다. `TIMELINE_V2 §1/§5(I2-C)`는 리스트가 여럿인 스코프에서 어느 리스트 일인지가 보이게 하려고 `--bar-color`/`--bar-tint`를 넣었다.

→ 높이 · 반경 · 여백 · 타이포 · 선택 상태 **기하는 전부 레퍼런스**, 채움색만 `--bar-tint` 유지. `--schedule-bg`/`--schedule-text`는 리스트 색이 없는 행의 **폴백**으로 남긴다.
→ 집중 트레이스는 리스트 색을 따르지 **않고 액센트**다. 그것이 §4.1이 말한 "다른 사실"이고, 계획(연한 리스트 색)과 실제(진한 액센트)가 색으로도 갈라져야 겹쳐 읽힌다.
→ 결과: 리스트 하나짜리 스코프에서는 레퍼런스와 사실상 같은 화면이 나온다.

### 4.3 미배치 — 옆 칸 vs 미는 트레이 → **레퍼런스대로 밀기**

`TIMELINE_ARRANGE_TASKS §3.1`이 옆 칸을 고른 이유는 "격자 위에 덮이면 화면에 있는 날이 가려진다"였다. 레퍼런스의 트레이는 **덮지 않고 민다**(`margin-right:288px`) — §3.1이 반대한 그 일을 하지 않는다. 대신 항상 떠 있던 칸이 필요할 때만 열린다.

→ `tgv-arrange`를 `.ff-timeline-tray`로 바꾼다. 여는 것은 작업 열 툴바의 "미배치 N" 버튼. ≤960에서는 레퍼런스대로 밀지 않고 덮는다.

### 4.4 줌 — 주 4단 vs 현행 5단 → **5단 유지, 눈금만 레퍼런스**

주 4단(2·4·6·12주)으로 갈면 `ZOOM_SPEC`의 `day`(시간 열)가 사라지고 그와 함께 `§15`(시각을 읽는 스팬)·`§16`(드래그로 시각 고치기)이 죽는다. 기능을 **잃는** 교체다.

→ `timeline.ts`는 그대로. 바뀌는 것은 **눈금의 모양**과 **척도 고르개의 UI**뿐이다. 2단 눈금을 다섯 줌 전부로 일반화한다(§7.2).
→ 고르개는 `<select>`를 버리고 레퍼런스의 메뉴("6개월" + 체크 목록)로 바꾼다. `.segmented`(이전/오늘/다음)도 레퍼런스 모양으로.

### 4.5 마일스톤 — 필드 vs 파생 → **파생, 규칙만 레퍼런스**

레퍼런스는 `schedule.kind: 'milestone'`이라는 **명시 필드**를 갖는다. 우리는 없고, 넣으면 스키마 변경이다.

지금 규칙은 `asMarker = 하루짜리 && 열이 날보다 굵을 때`다. 레퍼런스는 하루짜리를 **모든 배율에서** 마름모로 그린다. `D8`이 마름모를 만든 이유("폭이 없는 하루는 실패한 사각형이다")는 하루가 12.97px일 때의 말이고, 하루가 51px인 2주 배율에서는 하루짜리도 진짜 폭을 갖는다 — 그런데 레퍼런스는 거기서도 마름모다. 레퍼런스가 말하는 건 폭이 아니라 **종류**다.

→ 절충: `asMarker = 하루짜리 && 열 단위 ≠ 시간`. 시간 줌에서는 막대가 진짜 길이(회의 2시간)를 재고 시각을 쓰므로 거기만 사각형이다. 레퍼런스에 시간 줌이 없으니 **레퍼런스가 도달하는 모든 배율에서 결과가 같다**. 지금 코드의 `unit !== "day"` 한 군데가 `unit !== "hour"`로 바뀐다.
→ "마일스톤 표시" 토글은 이 마름모들을 감춘다.

### 4.6 셸 — 고정 144px vs 폭 조절 사이드바 → **둘 다**

레퍼런스 사이드바는 144px 고정 + 접기. 우리 것은 216~360px 드래그 조절(기본 232) + `focusflow-sidebar-width` 저장. 접기는 **일부러 지웠다** — `AppShell.tsx`가 이유를 적어놨다: "버튼이 사이드바 첫 행 위에, Tasks에서는 '오늘' 정통으로 올라앉았다".

레퍼런스의 손잡이는 첫 행 위가 아니라 **사이드바 오른쪽 모서리**에 있고, 평소 보이지도 않는다(hover에서만). 지워진 이유를 정확히 피해간다.

→ `CONTEXT_SIDEBAR_MIN_WIDTH`를 144로 낮추고 `DEFAULT_WIDTH`를 144로. 드래그 조절은 **그대로 둔다** — 이미 저장된 232는 존중한다(사용자가 고른 값을 덮지 않는다).
→ 접기를 되살린다. 모양·위치·hover 규칙은 §2.1대로, 상태는 `focusflow-sidebar-collapsed`.
→ 레일 `--rail-w: 52 → 40`, `--rail-item: 40 → 30`.

---

## 5. 골격 결정 — 두 스크롤 판을 따라하지 않는다

레퍼런스는 `.task-col`과 `.timeline-col`이 각자 `overflow:auto`이고, `syncVerticalScroll()`이 재진입 플래그를 들고 둘의 `scrollTop`을 맞춘다.

우리는 캔버스 하나에 이름 칸이 `position:sticky; left:0`이다. 화면에 나오는 그림은 **같다** — 얼어붙은 이름 열, 가로로 흐르는 트랙.

두 판을 따라하지 않는 이유:

1. **동기화 코드가 통째로 없어진다.** `syncingScroll` 플래그와 `requestAnimationFrame` 해제는 관성 스크롤 두 개가 겹칠 때 어긋나는 것으로 알려진 패턴이다. sticky는 어긋날 수가 없다 — 상자가 하나다.
2. **§1.2(a)의 결함이 구조적으로 못 생긴다.** 덮개가 내용 높이를 기준으로 잡힌다.
3. **바꿔야 할 것이 DOM이 아니라 CSS뿐이다.** 이름 칸이 이미 `.ff-timeline-row`의 첫 그리드 칸이고, 머리의 모서리는 이미 `.ff-timeline-rowhead`다. 82px 2단 머리는 그 두 칸을 `flex-direction:column`으로 만드는 것이다.

레퍼런스가 두 판이어서 **얻는** 것 하나는 작업 열이 가로로 절대 안 밀린다는 것인데(`overflow-x:hidden`), sticky 칸도 마찬가지다.

→ **캔버스 + sticky 유지.** `--timeline-label-width`가 레퍼런스의 `--task-col-w`를 대신하고, 레퍼런스의 `--timeline-min`은 이미 있는 `--timeline-track-min`(`minTrackWidth()`)이 대신한다.

---

## 6. 토큰 설계 — `26-timeline.css`

### 6.1 가산 레이어

`25-reference.css`가 만든 규칙 그대로다: 기존 파일을 건드리지 않고 새 파일을 `styles.css` 마지막에 부른다. **롤백이 import 한 줄**이다. `12-timeline.css`는 남고, 이 파일이 나중에 로드되어 이긴다.

`scale.test.ts`의 `REFERENCE_FILES`에 `"26-timeline.css"` 한 줄을 더한다 — 그 표의 한 줄이 한 번의 이행이라고 그 파일이 적어놨다.

### 6.2 자에 더할 것 — 굵기 두 칸

REFERENCE 자를 축별로 대조한 결과다.

| 축 | 필요한 값 | 자에 있나 |
|---|---|---|
| 크기 | 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 17 | **전부 있다** |
| 반경 | 5, 6, 8, 50% | **전부 있다** |
| 간격 | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 18, 24, 26, 28 | **전부 있다** |
| 이징 | `ease` | **있다** |
| 지속시간 | 120·140·160·180ms | **토큰으로 이미 있다** (§6.3) |
| 굵기 | 400, 500, 550, 560, 600, 650 | **500 · 560이 없다** |

→ `REFERENCE.weight`에 `"500"`과 `"560"`을 더한다. 가변 폰트를 들여놨으므로 이 둘은 실제로 보간된다(`POLISHED §4.1`).
→ 레퍼런스의 `620`(`.view-option.active` 한 군데)은 **650으로 스냅**한다. 30 차이는 화면에서 구분되지 않고, 자에 한 칸을 더 여는 값이 아니다.
→ 레퍼런스의 `520`·`540`은 이미 자에 있으므로 그대로 쓴다.

### 6.3 새 토큰

```
:root {
  /* 기하 — §2.1·§2.2·§2.3 */
  --timeline-label-width: 264px;   /* 기존 220 */
  --timeline-row-height: 42px;     /* 기존 32 */
  --timeline-tool-h: 42px;
  --timeline-ruler-h: 40px;
  --timeline-head-h: calc(var(--timeline-tool-h) + var(--timeline-ruler-h));
  --timeline-bar-h: 28px;
  --timeline-bar-top: 7px;
  --timeline-trace-h: 6px;
  --timeline-tray-w: 288px;

  /* 계획의 색 — 리스트 색이 없는 행의 폴백 (§4.2) */
  --schedule-bg: #f2f2ff;
  --schedule-text: #5057b7;
  --selected-bg: #eeeeff;
  --selected-text: #454cb3;
  --selected-ring: #aeb3fc;

  /* 타이포 */
  --t-workspace-title: 17px;
  --w-ruler: 500;
  --w-live: 560;

  /* 그림자 — 자가 링이 아닌 그림자를 리터럴로 못 쓰게 한다 */
  --shadow-bar-selected: inset 0 0 0 1px var(--selected-ring), 0 1px 3px rgba(44, 48, 80, 0.08);
  --shadow-tray: -10px 0 26px rgba(20, 25, 35, 0.035);
  --shadow-float: 0 10px 26px rgba(25, 30, 40, 0.10);
  --shadow-toast: 0 10px 28px rgba(25, 30, 40, 0.11);
  --shadow-edge-toggle: 0 2px 7px rgba(25, 30, 40, 0.06);
}
```

전환은 **새 토큰을 만들지 않는다**. 레퍼런스의 `.12s`·`.14s`·`.16s`·`.18s`는 `25-reference.css`의 `--motion-fast`(120)·`--motion-row`(140)·`--motion-base`(160)·`--motion-panel`(180)과 같은 값이다. 유일한 예외인 트레이의 `.2s`는 `--motion-panel`(180ms)로 흡수한다 — 20ms는 보이지 않고, 사다리를 네 칸으로 유지하는 값이 있다.

`--rail-w`·`--rail-item`은 `25-reference.css`의 것을 고친다(52→40, 40→30). 새 파일에 또 쓰면 레일 폭이 두 군데가 된다.

---

## 7. 도메인 — 새로 필요한 순수 로직

### 7.1 `domain/view/focusTrace.ts` (새 파일)

레퍼런스의 `aggregateFocusByDay` / `buildFocusBins` / `traceHeightForSeconds`에 해당한다. `timeline.ts`와 같은 규율: 순수, React 없음, 픽셀은 사다리 하나만.

**이미 있는 것을 다시 만들지 않는다.** `domain/focus/records.ts`의 `recordedMs`가 세그먼트를 타임존 인식 날짜 경계로 쪼개는 일을 이미 한다(23·25시간 DST 날짜 포함, 이분 탐색). 이 모듈은 그 위에 얹는다.

```ts
/** 하루치 집중. 키는 YYYY-MM-DD. */
export interface FocusDay { seconds: number; sessionCount: number; live: boolean }
export function focusByDay(
  sessions: FocusSession[], taskId: string, timezone: string, nowMs: number,
): Map<string, FocusDay>;

/** 막대 안에 그릴 칸. left/width는 막대 폭에 대한 %. */
export interface FocusBin {
  start: string; endExclusive: string;
  seconds: number; sessionCount: number; live: boolean;
  left: number; width: number; grain: "day" | "week";
}
export function focusBins(
  days: Map<string, FocusDay>, span: Span, window: TimelineWindow,
): FocusBin[];

/** 2 / 3 / 4.5 / 6px. 레퍼런스의 사다리 그대로. */
export function traceHeight(seconds: number): number;
```

레퍼런스와 다른 점 둘:

- **진행 중 세션을 합성 세션으로 끼워 넣는다.** 레퍼런스는 `activeFocus`를 `{start, end: now}` 한 칸으로 만들어 완료 세션 목록 뒤에 붙인다. 우리는 `status === "running"`인 세션에서 같은 걸 만든다 — `focusSessionStartOf()`와 마지막 세그먼트 이후의 열린 구간.
- **낱알이 배율이 아니라 열 단위를 따른다.** 레퍼런스는 `visibleWeeks === 12`에서만 주로 묶는다. 우리는 `columnUnitOf(zoom) === "month"`일 때 주로 묶는다. 이유는 §13이 이미 적은 것과 같다 — 칸은 자기가 이루어진 가장 작은 단위까지만 말할 수 있다. 한 달이 한 열인 화면에서 하루짜리 칸은 0.5px이다.

막대는 `left: 0%`가 **일정의 시작**이지 창의 시작이 아니다. 그래서 `focusBins`는 잘린 막대(`clippedStart`)에서 보이는 구간만 잡아 그 안에서의 비율을 낸다 — 레퍼런스의 `visibleStart`/`visibleEndExclusive` 계산과 같다.

### 7.2 2단 눈금의 일반화

레퍼런스의 눈금은 월 띠 + 주 눈금이다. 다섯 줌 전부에 이 구조를 준다 — 위 띠는 **열보다 한 단계 굵은 것**, 아래는 열 이름이다.

| 열 단위 | 위 띠 (16px) | 아래 (24px) |
|---|---|---|
| 시간 | 그 날 (`9월 11일 (금)`) | `09` |
| 날 | 그 달 (`9월`) | `9.11 (금)` |
| 주 | 그 달 (`9월`) — **주 시작일 기준으로 묶음, §1.2b** | `9.6` |
| 달 | 그 해 (`2026`) | `9월` |

`timeline.ts`에 붙는 것은 순수 함수 하나다.

```ts
export interface RulerBand { label: string; columns: number }  // 연속한 열 몇 개를 덮는가
export function rulerBands(window: TimelineWindow, lang: string): RulerBand[];
```

너비는 레퍼런스처럼 `count/columns`의 백분율이 **아니라** `columnHours()`의 합으로 낸다 — `§17.13`이 균등 분할과 시간 분할이 어긋나는 걸 고친 자리이고, 여기서 백분율을 쓰면 그 버그를 눈금 띠에 새로 들인다.

### 7.3 `barText`는 지운다 (§4.1)

`barText` · `barTextShort` · `shortDate` · `RANGE`와 `timeline.test.ts`의 해당 케이스가 나간다. 막대는 `item.title`, `.task-meta`는 `종료일 M.D`(없으면 `—`).

---

## 8. 컴포넌트 매핑

| 레퍼런스 DOM | 여기서는 | 파일 |
|---|---|---|
| `.app` (레일·사이드바·메인) | `.app-frame` | `AppShell.tsx` · `19-app-shell.css` |
| `.sidebar-edge-toggle` | 새로 (§4.6) | `AppShell.tsx` |
| `.main-head` (데스크톱에서 `display:none`) | `.tm-header` — 간트 뷰에서만 접는다 | `TasksModule.tsx` |
| `.timeline-card` | `.ff-timeline` + `.ff-timeline-canvas` | `TimelineView.tsx` |
| `.task-head` (42+40) | `.ff-timeline-rowhead` → `flex-direction: column` | `TimelineView.tsx` |
| ↳ `.task-toolbar` + `.workspace-title` | 새 `.ff-timeline-workspace-title` (`tm-header`에서 옮겨온 제목·개수) | `TimelineView.tsx` |
| ↳ `#drawerToggle` | 새 `.ff-timeline-tray-toggle` | `TimelineView.tsx` |
| ↳ `.task-ruler-label` | 새 `.ff-timeline-rowhead-label` | `TimelineView.tsx` |
| `.tl-head` | `.ff-timeline-head` | `TimelineView.tsx` |
| ↳ `.timeline-controls` | `.ff-timeline-bar-controls` — **머리 안으로 들어온다** | `TaskGanttView.tsx` → `TimelineView.tsx` |
| ↳ `.segmented` | `.ff-timeline-nav` 세 버튼 (§4.4) | `TaskGanttView.tsx` |
| ↳ 척도 메뉴 | `<select>` → `MoreMenu`의 `choices` (`menuitemradio`) — **이미 있다** | `TaskGanttView.tsx` |
| ↳ 보기 메뉴 (완료·마일스톤) | `MoreMenuItem`에 `checked` 한 칸 신설 (`menuitemcheckbox`) | `kit.tsx`, `TaskGanttView.tsx` |
| ↳ `.timeline-add` / `.timeline-more` | `TaskQuickAdd` 호출 / 기존 `MoreMenu` | `TasksModule.tsx` |
| `.time-ruler` (`.months` + `.weeks`) | `.ff-timeline-columns` → 2단 (§7.2) | `TimelineView.tsx` |
| `.today-head-marker` | `.ff-timeline-now` 위쪽으로 연장 + 칩 | `TimelineView.tsx` |
| `.grid-body` (`.grid-v` + `.today-line`) | `.ff-timeline-rules` + `.ff-timeline-now` — **이미 있다** | — |
| `.task-row` | `.ff-timeline-label` → 4칸 행 | `TimelineView.tsx` |
| ↳ `.circle` | 기존 체크박스 컴포넌트 재사용 | `TaskRowContent.tsx` 참조 |
| ↳ `.task-meta` | 새. 종료일 / 진행 중이면 라이브 시간 | `TimelineView.tsx` |
| ↳ `.task-more` | `MoreMenu` (§9.8) | `TimelineView.tsx` |
| `.tl-row` / `.bar` / `.milestone` | `.ff-timeline-row` / `.ff-timeline-bar` / `.is-marker` | `TimelineView.tsx` |
| `.bar-content` / `.bar-label` / `.focus-summary` | 새 세 칸 | `TimelineView.tsx` |
| `.focus-trace` / `.focus-trace-segment` | 새 (§7.1) | `TimelineView.tsx` |
| `.active-focus-node` | 새 | `TimelineView.tsx` |
| `.drawer` | `.tgv-arrange` → `.ff-timeline-tray` (§4.3) | `TaskGanttView.tsx` |
| `.schedule-ghost` / `-chip` / `-guide` | 새 셋 (§9.5) | `TimelineView.tsx` |
| `.schedule-toast` | 새. 기존 토스트 인프라 확인 후 재사용 | `TaskGanttView.tsx` |
| `.focus-tooltip` | 새. `domain/floating`의 배치 재사용 | `TimelineView.tsx` |
| `.context-menu` | 기존 `MoreMenu`/`22-floating.css` | — |
| `.task-create-row` | `TaskQuickAdd`를 첫 행 자리에 인라인 (§9.7) | `TimelineView.tsx` |

---

## 9. 상호작용 명세

레퍼런스의 JS 800줄이 하는 일 전부다. React로 옮길 때 상태가 어디 사는지까지 적는다.

**9.1 연결 hover.** 레퍼런스는 `mouseenter`/`mouseleave`로 양쪽 행에 `.row-hover`를 건다(CSS `:hover`는 `transparent`로 꺼놨다). → `TimelineView`의 `hoveredKey` 상태. 한 캔버스이므로 사실 클래스 하나로 `.ff-timeline-row` 전체가 켜진다 — **레퍼런스보다 코드가 짧다**. CSS `:hover`로 충분하고 상태가 필요 없다.

**9.2 선택.** `selectedTaskId` 하나. 작업 행 · 트랙 행 · 막대 셋이 `.selected`. → 이미 `selectedTaskId` prop이 있다. 막대에 클래스를 더 거는 것뿐.

**9.3 세로 스크롤 동기화.** → §5. **없다.**

**9.4 척도·보기 메뉴.** 바깥 클릭으로 닫힘, 서로 배타, `Esc`로 닫힘.
→ `Popover`가 바깥 클릭·`Esc`·초점 복귀를 이미 한다. 서로 배타인 것도 공짜다 — 하나가 열리면 다른 하나는 바깥 클릭을 받는다.
→ **척도 메뉴는 새로 만들 것이 없다.** `MoreMenuItem.choices`가 "닫힌 선택 하나 + 현재 값"을 `menuitemradio`로 이미 그리고, `moveMenuFocus`가 화살표로 걷는다. 다만 `choices`는 **아이콘 행**으로 그려진다("세 개의 사각형") — 줌은 아이콘이 아니라 낱말(`1주`·`6개월`)이므로 `MoreMenuChoice`에 글자 모드가 필요하다. `kit.tsx`의 주석이 "이건 메뉴를 작게 만드는 범용 수단이 아니다"라고 못박아 뒀으므로, 아이콘 행을 낱말에 억지로 쓰지 않고 `label`을 그리는 분기를 한 칸 연다.
→ **보기 메뉴는 한 칸이 없다.** `MoreMenuItem`에 `label`·`onClick`·`danger`·`separator`·`heading`·`choices`는 있는데 **`checked`가 없다**. 완료·마일스톤은 서로 독립한 켬/끔 둘이라 `choices`(닫힌 선택 하나)가 아니다. `checked?: boolean` 한 칸을 더하고 `role="menuitemcheckbox"` + `aria-checked`로 그린다 — 레퍼런스의 `.toggle-indicator`(14px 사각형, 반경 4, 켜지면 액센트 채움)가 그 표시다.

**9.5 트레이에서 드래그해 배치.**
1. `dragstart` — 대상 작업을 선택하고 항목에 `.dragging`(`opacity:.42`), 두 행에 `.schedule-drag-source`.
2. `dragover` — 포인터의 x → 날. 가장자리 32px에서 16px씩 자동 스크롤. 유령 · 날짜 칩 · 안내선을 §2.5 좌표로.
3. `drop` — **하루짜리** 일정(`start === end`)을 쓰고 토스트.
   → 지금 `onDropTray(sourceId, date)` → `patchForTrayDrop`가 이미 이 일을 한다. **미리보기 셋만 새로 만든다.** 날 계산은 `instantAtWindowFraction()`을 그대로 쓴다 — `dateFromPointer`를 새로 쓰면 §17.13이 고친 어긋남을 다시 들인다.
   → 레퍼런스처럼 `.ff-timeline-lanes`를 걷어낼 수 있다: 유령이 포인터를 따라가므로 칸마다 드롭 타깃을 둘 이유가 없다. 트랙 하나가 `dragover`를 받으면 된다.

**9.6 배치 취소 토스트.** 4초, "실행 취소" 누르면 이전 `schedule`로. → 우리는 `dateMutation()`이 이미 되돌릴 수 있는 뮤테이션을 낸다. 토스트는 그 뮤테이션의 undo를 부르는 표면일 뿐이다. **새 undo 스택을 만들지 않는다.**

**9.7 인라인 생성.** 첫 행 자리에 입력 행 + 트랙 쪽 빈 자리. `Enter`로 만들고 `schedule: null` → 트레이가 열린다. `Esc`로 취소. `Ctrl/Cmd+N`.
→ 간트 뷰에서 `TaskQuickAdd`는 머리 위가 아니라 **첫 행 자리**에 뜬다. 만들어진 작업은 날짜가 없으니 트레이로 가고, 트레이가 자동으로 열린다 — 레퍼런스의 `submitNewTask`가 `openDrawer()`를 부르는 것과 같다.

**9.8 행 메뉴.** ⋯ → `작업 열기` / `날짜 수정` / `미배치로 이동` / `일정 제거`. 아래 두 개가 같은 일(일정 비우기)을 한다. 화살표 위아래 이동, `Esc`로 닫고 트리거로 초점 복귀.
→ `MoreMenu` + `moveMenuFocus`가 초점 관리와 화살표 이동을 이미 한다. 항목은 **셋**으로 줄인다 — 레퍼런스에서 `미배치로 이동`과 `일정 제거`는 `menuItems` 반복문이 `index===2||index===3`으로 **같은 `unscheduleTask`를 부른다**. 두 낱말, 한 동작이다. 목업의 미완성이지 따라할 구분이 아니다.

**9.9 집중 트레이스 툴팁.** 칸 hover → `9월 9일` / `25m 집중` / `1회 세션`. 위로 70px, 안 들어가면 아래로, 가장자리 8px.
→ `domain/floating`이 이 배치를 이미 푼다. 칸만 `pointer-events:auto`(띠는 `none`).

**9.10 라이브 집중.** 1초 타이머가 `.focus-summary`와 `.task-meta.live`를, 60초 타이머가 트레이스를 다시 그린다.
→ 지금 `TimelineView`는 일부러 안 돈다("시계가 아니라 계획 격자다"). 그 주석은 **진행 중 세션이 없을 때** 맞는 말이다.
→ `useFocusTick(active: boolean)` — `active`가 거짓이면 **타이머를 아예 만들지 않는다**. 흔한 경우에 지금과 정확히 같다. 진행 중일 때만 1초로 돌고, 다시 그리는 것은 그 한 행이다.

**9.11 진행 중 노드.** x는 오늘, y는 그 작업의 행. 일정 밖이면 속 빈 원. `prefers-reduced-motion`에서 애니메이션 정지 — 레퍼런스가 이미 그렇게 한다. 이 앱은 `[data-reduce-motion]`도 쓰므로 **둘 다** 건다.

**9.12 마일스톤 토글.** 켜짐이 기본. 끄면 `.is-marker`가 숨는다.

**9.13 Esc·사이드바.** `Esc` 하나가 드래그 취소 · 생성 행 닫기 · 트레이 닫기 · 메뉴 닫기. 사이드바 접기는 `localStorage`, ≤960에서는 접기 대신 서랍.

---

## 10. 단계

각 단계가 혼자 커밋되고 혼자 되돌려진다. P0~P2가 화면의 90%를 만든다.

| | 하는 일 | 파일 | 되돌리기 |
|---|---|---|---|
| **P0** | `26-timeline.css` 뼈대 + 토큰 + `scale.test.ts`에 두 줄(파일 목록, 굵기 500·560) | 새 CSS, `scale.test.ts`, `styles.css` | import 한 줄 |
| **P1** | 기하: 264 / 42 / 28·7 / 행 규칙선 제거 / 82px 2단 머리 상자 | `26-timeline.css`, `TimelineView.tsx` | 파일 되돌림 |
| **P2** | 2단 눈금 (`rulerBands`) + 오늘 칩 + 월 경계선 | `timeline.ts`, `TimelineView.tsx` | |
| **P3** | 작업 열 4칸 행: 체크 · 제목 · 날짜 · ⋯. §4.1대로 막대는 이름 | `TimelineView.tsx`, `timeline.ts`(§7.3) | |
| **P4** | 도구줄이 머리 안으로. 척도·보기 메뉴(`MoreMenuItem.checked` 신설), `.segmented`, 새 작업. `tm-header` 접기 (§4.6) | `TaskGanttView.tsx`, `TasksModule.tsx`, `kit.tsx` | |
| **P5** | 집중 트레이스: `focusTrace.ts` + 띠 + 요약 + 툴팁 + 라이브 + 노드 | 새 도메인 파일, `TimelineView.tsx` | |
| **P6** | 트레이를 미는 서랍으로, 드래그 미리보기 셋, 토스트, 인라인 생성 | `TaskGanttView.tsx`, `TimelineView.tsx` | |
| **P7** | 셸: 레일 40 / 사이드바 144 / 모서리 접기 토글 | `19-app-shell.css`, `25-reference.css`, `AppShell.tsx`, `contextSidebar.ts` | |

---

## 11. 검증

| 무엇 | 어떻게 |
|---|---|
| 자 | `vitest run src/styles/scale.test.ts` — `26-timeline.css`가 REFERENCE 자에서 위반 0 |
| 반경 | `e2e/radiusScale.spec.ts` — 화면에 도달한 반경을 잰다. 마름모의 3px은 기존 `EXEMPT` 안에 있다 |
| 기하 | Playwright로 실측: 머리 82 · 행 42 · 막대 28/`top:7` · 작업 열 264 · 트레이스 6 |
| 눈금 | `rulerBands` 단위 테스트 — 다섯 줌 각각에서 띠 너비 합 = 열 너비 합 |
| 트레이스 | `focusTrace` 단위 테스트 — DST 날, 자정을 넘는 세션, 일정 밖 세션, 잘린 막대, 주 낱알 |
| 어긋남 | 드래그 미리보기의 날 == `instantAtWindowFraction()`의 날. §17.13이 고친 것을 다시 들이지 않았는지 |
| 접근성 | `axe-core` — 막대의 `aria-label`이 이름 + 기간 + 총 집중시간, 트레이스 띠는 `aria-hidden` |
| 반응형 | 1440 / 1180 / 960 / 720에서 §2.6의 표대로 |
| 회귀 | `vitest run` 전체 — `timeline.test.ts`에서 `barText` 케이스가 빠진다 |

**검증 한계.** `GANTT §1`이 적어둔 그대로다 — 헤드리스 창에서는 `requestAnimationFrame`이 돌지 않아 숨쉬는 노드 · 트레이 밀림 · 유령 추적의 **체감**은 여기서 판정할 수 없다. 값이 맞는지는 잴 수 있고, 느낌은 사용자가 봐야 한다.

---

## 12. 남는 위험

1. **막대 폭 등급이 컨테이너 쿼리인가 측정인가.** 레퍼런스는 `getBoundingClientRect()`로 재서 `bar-wide/mid/small`을 건다 — 리사이즈·트레이 열기·사이드바 접기마다 다시 잰다. 우리 `12-timeline.css`는 `container-type: inline-size`로 CSS가 답하게 했다. **컨테이너 쿼리를 유지한다.** 다만 레퍼런스의 세 등급(130/72)이 우리 타이포에서도 맞는 경계인지는 실측해야 한다 — 이름은 날짜보다 길고, 한글은 라틴보다 넓다.
2. **작업 열 264px에 네 칸이 들어가는가.** 12 + 15 + 8 + 제목 + 38 + 4 + 28 + 7 = 고정 112px, 제목에 152px. 한글 14px에서 약 10글자다. 레퍼런스 목업의 제목이 짧아서 드러나지 않은 자리이고, 실제 작업 이름은 길다. ≤720의 190px에서는 78px — **말줄임이 기본 상태가 된다.** P3에서 실측하고 필요하면 날짜 칸을 좁은 폭에서 접는다.
3. **사이드바 144px과 저장된 232px.** §4.6이 기존 값을 존중하기로 했으므로, 이미 쓰던 사용자는 레퍼런스 비율을 **보지 못한다**. 의도된 것이지만 "따라했는데 왜 다르냐"의 원인이 될 수 있다. 설정에 "기본 폭으로" 한 줄이 이미 있다(`resetWidth`, 손잡이 더블클릭).
4. **1초 타이머와 배터리.** §9.10이 진행 중일 때만 돌게 해서 줄였지만, 집중 중에는 1초마다 한 행이 다시 그려진다. 그 행만 다시 그려지는지 P5에서 React DevTools로 확인한다.
5. **`showMilestones` 토글의 쓸모.** 레퍼런스에는 마일스톤이 12개 중 4개다. 이 앱의 하루짜리 작업 비율은 **훨씬 높다**(`GANTT §14`가 "이 앱의 표준 기록은 하루짜리"라고 적었다). 마름모를 끄면 화면의 대부분이 사라질 수 있다. 토글은 만들되 기본 켜짐이고, P5 이후 실제 데이터에서 비율을 보고 재검토한다.

---

## 13. 하지 않을 것

- **두 스크롤 판** — §5.
- **`schedule.kind` 필드** — §4.5. 스키마를 건드리지 않는다.
- **주 4단 줌으로 교체** — §4.4. 시간 줌과 시각 드래그를 잃는다.
- **막대 단색화** — §4.2.
- **`.ff-timeline-lanes`** — §9.5. 유령이 포인터를 따라가면 칸마다 드롭 타깃을 둘 이유가 없다.
- **새 undo 스택** — §9.6. `dateMutation`이 이미 되돌릴 수 있다.
- **레퍼런스의 격자선 잘림 · 끊긴 오늘 선** — §1.2.
- **`--timeline-min: 720px` 같은 고정 최소폭** — `minTrackWidth()`가 줌에서 파생시키는 쪽이 옳다(§17). 레퍼런스의 720은 6주 × 7일 × 17px의 반올림일 뿐이다.
- **레일에 새 아이콘** — 레퍼런스의 레일에는 이 앱에 없는 항목이 있다. 셸 정합은 §4.6의 세 가지(폭·항목 크기·접기)까지다.
