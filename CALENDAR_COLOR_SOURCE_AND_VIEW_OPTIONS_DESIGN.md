# 색은 리스트가 정하고, 무엇을 그릴지는 한 패널이 정한다

> 상태: **구현됨** · 2026-09-04 (E1 = C · E2 = A · E3 = A · E4 = 아니오 · E5 = A, 사용자 승인 — §9.1은 구현하며 알게 된 것)
> 사용자 결정: **2번** — "색 근거를 List로 + TickTick식 View Options 패널".
> 대상: `utils/calendarItems.ts` · `components/CalendarView.tsx` ·
> `components/calendar/{CalendarToolbar,CalendarLeftSidebar,NewTaskForm,QuickCreatePopover,EventPopover,CalendarCategorySettings}.tsx` ·
> `lib/calendar/categoryModel.ts` · `lib/calendarCategories.ts` · `types.ts`(AppSettings)
> 선행 문서: `CALENDAR_TASK_CHECKBOX_DESIGN.md`(방금 구현 — 이 문서가 §6.3에서 일부를 되돌린다) ·
> `CALENDAR_APPLE_DESIGN.md` §D1(색은 "어느 달력인가"만 말한다) ·
> `TICKTICK_COMPONENT_02_SIDEBAR_SHELL.md` §508(캘린더 사이드바는 조사되지 않았다 — 이 문서가 그 구멍을 메운다)

## 0. 근거 수준

| 등급 | 무엇 | 표기 |
|---|---|---|
| **관찰** | TickTick 공식 문서 — Calendar View Options · Calendar FAQ · 지원 문서 (§1의 출처) | [관찰] |
| **실측** | 코드에서 잰 것 — `categoryId`를 쓰는 세 곳 · `projectItems`가 이미 계산하는 `item.listId` · `buildCalendarItems`의 미사용 `lists` 파라미터 · `LIST_COLOR_PRESETS` 8색 · `AppSettings`의 기존 뷰 옵션들 | [실측] |
| **계산** | 리스트 프리셋 8색과 우선순위 4색의 잉크·대비 (§3.3, §7.2) | [계산] |
| **결정** | 사용자 — "2번" | [결정] |
| **추론** | 다중 태그의 색 규칙 · 리스트가 많은 계정에서 사이드바가 견디는가 | [추론] |

---

## 1. TickTick은 어떻게 하는가 [관찰]

**색의 근거를 새로 만들지 않는다.** 이미 있는 축 중 하나를 고르게 한다.

| 무엇 | 어디 | 값 |
|---|---|---|
| Color By | `⋯` → View Options → Color | **By List(기본)** · By Tag · By Priority |
| 색 지정 | 같은 패널 안 | By List/By Tag면 리스트·태그별로 즉시 지정. By Priority는 고정 |
| Show Completed | 같은 패널 | 완료한 태스크·습관·구독 이벤트 |
| Show Focus Records | 같은 패널 | 집중 기록 |
| Show Details · Show Check Items · Show All Repeat Cycles · Show Habit | 같은 패널 | — |

두 가지가 이 설계의 뼈대다.

1. **캘린더 전용 분류 축이 없다.** 우리의 "캘린더 카테고리"에 해당하는 것이 TickTick에는
   존재하지 않는다. 리스트가 곧 달력이다.
2. **레이어 토글이 한 곳에 모여 있다.** 사이드바가 아니라 `⋯` 뒤의 한 패널이다.

출처: [Calendar View Options](https://help.ticktick.com/articles/7055782085826445312) ·
[FAQ - Calendar](https://help.ticktick.com/articles/7063851189372190720) ·
[How do I make tasks appear in different colors](https://support.ticktick.com/hc/en-us/articles/360011537032-How-do-I-make-tasks-on-the-Calendar-View-appear-in-different-colors-)

---

## 2. 우리가 지금 하는 것 [실측]

```
task.categoryId → 캘린더 카테고리 → category.color → --ev-color
                  (빈 값이면 defaultCategoryId로 폴백)
```

`task.categoryId`에 값을 쓰는 곳은 **셋뿐이고 전부 캘린더 안**이다:
`NewTaskForm`의 `<select>`(끌어서 만들기), `QuickCreatePopover`의 `<select>`,
`EventPopover`의 카테고리 변경. Task Detail에도 Tasks 모듈에도 카테고리 필드가 **없다**.

**결과: Tasks에서 만든 태스크는 전부 `categoryId: ""` → 기본 카테고리 → 같은 색이다.**

그리고 이건 직전 작업 때문에 더 급해졌다. 14% 틴트일 때 전부 같은 색인 것은 눈에 잘
띄지 않았지만, 이제 꽉 찬 채도라 **똑같은 파랑의 벽**이 된다. 색을 진하게 만든 값어치는
색이 서로 다를 때만 나온다.

### 2.1 카테고리 축은 셋인데 문제는 하나다 [실측]

`buildCalendarCategories`가 만드는 그룹은 셋이다.

| 그룹 | 어디서 오나 | 이 설계에서 |
|---|---|---|
| `personal` | 사용자가 만든 카테고리 (localStorage) | **List로 대체된다** |
| `external` | 구독한 ICS 캘린더에서 파생 | **그대로** — 진짜 남의 달력이다 |
| `focus` | 시스템 카테고리 하나 (집중 기록) | **그대로** — 다만 §6에서 자리를 옮긴다 |

"카테고리를 없앤다"는 실제로는 **`personal` 그룹 하나를 List로 갈아끼우는 일**이다.
나머지 둘은 손대지 않는다. 보기보다 훨씬 작은 변경이다.

---

## 3. 색의 근거를 List로

### 3.1 배관은 이미 다 깔려 있다 [실측]

이 부분이 이 설계에서 가장 운이 좋은 대목이다.

```ts
// domain/view/item.ts:116 — 모든 뷰 아이템이 이미 자기 리스트를 안다
const taskListId = listIdFor(task, lists);

// utils/calendarItems.ts:185, 220, 264 — 파라미터가 이미 있고 이미 넘어간다
lists?: List[];
const viewItems = projectItems({ tasks, lists, today: todayValue() });

// domain/tasks/listColor.ts:71 — 색을 읽는 함수도 이미 있다
export function listColorHex(stored: string | undefined): string
```

`listIdFor`는 저장된 `listId` → 프로젝트의 기본 List → Inbox 순으로 답한다. 즉 **모든
태스크가 리스트를 갖는다** — 저장된 적이 없어도.

빠진 것은 **`CalendarView`가 `lists`를 넘기지 않는다**는 것 하나다(`grep lists
CalendarView.tsx` → 없음). 지금은 기본값 `[]`로 돌고 있다.

### 3.2 바뀌는 코드

```ts
// utils/calendarItems.ts — 지금
color: taskCategory?.color ?? LAYER_COLOR.task,

// 바뀐 뒤 (E1의 폴백 규칙에 따라)
color: colorForTask(item, { lists, colorBy, categories }),
```

`item.listId`는 이미 루프 안에 있다. 리스트를 `Map`으로 한 번 만들어 두면 조회는 O(1)이다.

### 3.3 대비는 이미 통과한다 [계산]

`readableInkOn`(직전 작업)은 임의 hex를 받는다. 리스트 프리셋 8색을 넣어 보면:

| 프리셋 | hex | 흰 글씨 | 검정 글씨 | 잉크 | 통과 |
|---|---|---|---|---|---|
| lime | `#99d52a` | 1.76 | **10.71** | 검정 | ✅ |
| yellow | `#ffb224` | 1.80 | **10.47** | 검정 | ✅ |
| orange | `#f76b15` | 2.97 | **6.36** | 검정 | ✅ |
| green | `#30a46c` | 3.16 | **5.98** | 검정 | ✅ |
| blue | `#0a84ff` | 3.65 | **5.18** | 검정 | ✅ |
| indigo | `#5b5bd6` | **5.37** | 3.52 | 흰 | ✅ |
| purple | `#8e4ec6` | **5.18** | 3.65 | 흰 | ✅ |
| red | `#e5484d` | 3.91 | **4.82** | 검정 | ✅ |

**여덟 색 전부 4.5:1을 넘는다**(최저 4.82). 커스텀 hex도 같은 함수가 처리하므로 색
근거를 갈아끼우는 데 대비 작업이 추가로 없다. 이건 우연이 아니라 §3.4의 잉크 규칙이
색이 아니라 **휘도**로 판단하기 때문이다 — 어떤 팔레트가 와도 성립한다.

두 팔레트가 서로 다른 hex를 쓴다는 점도 이참에 정리된다: 카테고리는
`#0066cc/#34c759/…`, 리스트는 `#0a84ff/#30a46c/…`로 같은 앱에 "파랑"이 둘이었다.

### 3.4 결정 E1 — 색이 없는 리스트는 무슨 색인가

`List.color`는 `""`(없음) · 프리셋 키 · `#RRGGBB` 셋 중 하나다. `""`가 기본값이고,
Tasks 사이드바에서는 **점이 자리만 차지하고 투명하게** 그려진다.

| 안 | 무엇 | 대가 |
|---|---|---|
| **A** | 액센트색(`--accent`)으로 | 색을 안 정한 리스트들이 전부 액센트색으로 뭉친다 |
| **B** | 중립 회색(`--text-tertiary`) | "색 없음"이 화면에서도 색 없음으로 읽힌다. 회색 블록이 많아질 수 있다 |
| **C** | 리스트 id로 팔레트에서 결정적으로 배정 | 사용자가 아무것도 안 해도 색이 갈린다. 사용자가 고른 적 없는 색이 나온다 |

> **권장 C.** A와 B는 둘 다 "아무것도 안 한 계정에서는 이 기능이 아무것도 안 한다"로
> 끝난다 — §2의 문제가 그대로 남는다는 뜻이다. C는 `hash(list.id) % 8`로 프리셋을
> 고르므로 계정을 열자마자 색이 갈리고, 마음에 안 들면 리스트 색을 지정해서 덮으면
> 된다. 결정적이라 기기 간에도 같은 색이 나온다.
>
> Inbox는 예외로 중립 회색을 준다. 하나뿐이고 이름을 바꿀 수 없는 시스템 리스트라
> "어느 리스트인가"를 색으로 물을 이유가 없다.

---

## 4. 그러면 사이드바의 "내 캘린더"는 무엇이 되나

`personal` 그룹이 List 목록이 된다. 체크박스의 뜻은 그대로다 — 표시/숨김.

바뀌는 것 하나: **행 클릭의 뜻**. 지금은 "새 이벤트의 기본 카테고리 고르기"이고,
바뀐 뒤에는 "캘린더에서 만드는 새 태스크의 기본 List 고르기"다. 같은 문장의 명사만
바뀐다.

### 4.1 결정 E2 — 폴더 계층을 사이드바에 그리나

Tasks 사이드바는 `폴더 > 리스트` 트리다. 캘린더 사이드바는 평평한 목록이다.

| 안 | 무엇 |
|---|---|
| **A** | 평평한 리스트 목록. 폴더 무시 |
| **B** | Tasks 사이드바와 같은 폴더 트리 |
| **C** | 평평하되 폴더별로 소제목 |

> **권장 A.** 이 목록의 일은 **필터**지 탐색이 아니다. 캘린더에서 리스트 구조를
> 재현하면 같은 트리를 두 곳에서 관리해야 하고(접힘 상태, 순서, 드래그), 얻는 것은
> 없다 — 캘린더에서 리스트를 옮길 일이 없기 때문이다.
> [추론] 리스트가 많은 계정에서는 목록이 길어진다. 그때는 Tasks 사이드바가 이미 쓰는
> 접힘/스크롤을 가져오면 되고, 그건 이 설계가 아니라 그 문제가 실제로 생겼을 때 할 일이다.

---

## 5. 카테고리 축의 운명

### 5.1 죽는 것

- `CalendarCategoryState.personal` · `defaultCategoryId` · `activeCategoryId`
- `addPersonalCategory` · `updatePersonalCategory` · `movePersonalCategory` ·
  `movePersonalCategoryTo` · `setDefaultCategory` · `deletePersonalCategory`
- `CalendarCategorySettings.tsx`의 개인 카테고리 편집 부분 (435줄 중 대부분)
- `NewTaskForm` · `QuickCreatePopover`의 카테고리 `<select>` → **List 피커로 교체**
- `EventPopover`의 `onChangeCategory` → **리스트 이동으로 교체** (`moveTaskToList`가 이미 있다)

### 5.2 사는 것

- `CalendarCategory` 타입 자체와 `external` · `focus` 그룹
- `hiddenCategoryIds` — 다만 이제 **리스트 id도 담는다**. 이름이 맞지 않게 되므로
  `hiddenSourceIds`로 바꾸고 마이그레이션한다
- `isCategoryVisible`의 external 분기 (구독 캘린더의 `visible` 플래그를 따른다)
- `focusColor` — 집중 기록 색 오버라이드

### 5.3 결정 E3 — 기존 `task.categoryId`는 어떻게 하나

캘린더에서 만든 태스크에는 값이 들어 있다.

| 안 | 무엇 |
|---|---|
| **A** | 무시. 필드는 남기되 아무도 읽지 않는다 |
| **B** | 마이그레이션: 카테고리 이름으로 리스트를 만들고 태스크를 옮긴다 |
| **C** | 카테고리 **색**만 해당 리스트로 옮긴다 |

> **권장 A.** B는 리스트를 사용자 동의 없이 만든다 — Tasks 사이드바에 갑자기 리스트
> 세 개가 생기는 것은 캘린더 색을 바꾸겠다고 한 사람이 기대할 일이 아니다. C는 여러
> 카테고리의 태스크가 한 리스트에 섞여 있을 때 어느 색이 이기는지 규칙이 없다.
>
> A의 대가는 "캘린더에서 색을 지정해 뒀는데 그게 사라진다"이고, 그건 사실이다. 다만
> 이 기능을 쓴 사람은 §2가 말하듯 **캘린더 안에서 만든 태스크뿐**이고, 그마저도 UI가
> 두 개의 `<select>`에 숨어 있었다. 릴리스 노트에 한 줄 적는 것으로 충분한 크기다.
> `Task.categoryId`는 타입에 남긴다 — 지우는 것이 데이터를 지우지는 않고, 찾는 사람의
> 눈에서만 숨긴다(`statusId`가 같은 이유로 남아 있다).

---

## 6. View Options 패널

### 6.1 자리

툴바에 `⋯`가 **없다** [실측]. `CalendarToolbar`는 왼쪽에 `☰`·`+`, 가운데에 모드
세그먼트, 오른쪽에 균형용 spacer뿐이다. spacer 자리가 `⋯`의 자리다 — R2가 "가운데
정렬에는 반대쪽에 같은 무게가 필요하다"고 spacer를 둔 것이므로, 무게가 진짜 버튼이
되면 주석이 말하던 균형이 실제로 생긴다.

`Popover` / `PopoverTrigger` / `PopoverContent`를 그대로 쓴다 — 이미 있고, 이미
캘린더 안에서 `NewTaskForm`이 쓴다. 새 부유 레이어 코드를 쓰지 않는다.

### 6.2 내용

| 행 | 값 | 지금 어디에 있나 |
|---|---|---|
| **Color by** | 리스트(기본) · 우선순위 | 없음 (신규) |
| **완료한 일** | on/off | 사이드바 "보기" — **여기로 옮긴다** |
| **집중 기록** | on/off | 사이드바 "Activity" 카테고리 행 — **여기로 옮긴다** |

TickTick의 나머지 넷(Show Details · Show Check Items · Show All Repeat Cycles ·
Show Habit)은 이번 범위가 아니다. 앞의 둘은 만들 수 있지만 지금 요청이 아니고,
뒤의 둘은 우리에게 습관 기능이 없고 반복은 이미 전부 그린다.

### 6.3 직전 작업을 일부 되돌린다

`CALENDAR_TASK_CHECKBOX_DESIGN.md` D1-B는 "완료한 일"을 **사이드바**에 두고 상태를
**카테고리 스토어**(localStorage)에 넣었다. 이 문서는 둘 다 바꾼다. 왜:

- **자리**: 사이드바의 그 절은 "보기" 헤딩 하나에 행 하나였다. 레이어 토글이 셋으로
  늘면 사이드바에 두 번째 목록이 생기고, 그러면 사이드바가 "무엇을 보여줄까"를 두 가지
  방식으로 묻게 된다 — 리스트 체크박스와 View Options 행. TickTick이 후자를 `⋯`로 뺀
  이유가 이것이라고 본다 [추론].
- **저장 위치**: `AppSettings`에는 이미 `matrixHideCompleted` · `todayGroupAxis` ·
  `scopeViewOptions`가 있다 [실측]. 화면의 보기 옵션은 거기 사는 것이 이 앱의 관례이고,
  계정을 따라 기기 간에 옮겨간다. 카테고리 스토어는 localStorage라 옮겨가지 않는다.

```ts
// types.ts — AppSettings에 추가
calendarViewOptions?: {
  colorBy: "list" | "priority";
  showCompleted: boolean;
  showFocusRecords: boolean;
};
```

`CalendarCategoryState.showCompleted`는 제거하고, 값이 있으면 한 번 읽어
`appSettings`로 옮긴다(마이그레이션 한 줄).

---

## 7. Color by — 축은 둘

### 7.1 리스트 (기본)

§3 그대로.

### 7.2 우선순위 [계산]

| 등급 | hex | 흰 글씨 | 검정 글씨 | 잉크 | 통과 |
|---|---|---|---|---|---|
| high | `#ff3b30` | 3.55 | **5.32** | 검정 | ✅ |
| medium | `#ff9500` | 2.20 | **8.59** | 검정 | ✅ |
| low | `#4772fa` | 4.15 | **4.55** | 검정 | ✅ |
| none | `#8e8e93` | 3.26 | **5.79** | 검정 | ✅ |

네 색 전부 통과한다. 토큰이 이미 있으므로(`--priority-high/medium/low`) 새 팔레트가
필요 없다.

`low`가 4.55로 아슬아슬하다는 점은 기록해 둔다 — 이 토큰을 밝게 조정하면 4.5 아래로
떨어진다. §8의 테스트가 그걸 잡는다.

### 7.3 태그는 이번에 넣지 않는다 — 결정 E4

세 가지가 막는다 [실측]:

1. **`Tag.color`에 UI가 없다.** 필드는 모델에 있지만 그것을 지정하는 화면이 없다.
   `TagPicker`에도 없다.
2. **`Item.tags`는 이름이지 id가 아니다**(`tagNamesForTask`). 색을 붙이려면 캘린더가
   `tags`와 `taskTags`를 새로 받아야 한다.
3. **다중 태그일 때 어느 색이 이기는지 TickTick 문서에 없다** [관찰 — 없음]. 검색으로도
   확인하지 못했다. 규칙을 우리가 정해야 하는데(첫 태그? 지정된 "색 태그"?), 그건 태그
   기능 쪽 설계이지 캘린더 색 설계가 아니다.

> **권장: 제외.** `colorBy`를 `"list" | "priority"`로 좁게 열어 두고, 태그가 색을 갖게
> 되는 날 `"tag"`를 더한다. 유니온 타입 하나에 값을 더하는 일이다.

---

## 8. 무엇을 테스트하는가

**단위 (vitest)**
- `colorForTask`: 색 지정된 리스트 → 그 색 · 색 없는 리스트 → E1의 규칙 ·
  Inbox → 중립 · `colorBy: "priority"` → 우선순위 토큰
- 결정적 배정(E1-C): 같은 리스트 id는 항상 같은 색
- `readableInkOn`: **리스트 프리셋 8색 + 우선순위 4색**이 4.5:1을 넘는다
  (지금 카테고리 8색만 검사한다 — 새 팔레트를 검사 범위에 넣는다)
- `AppSettings` 마이그레이션: 옛 `showCompleted`가 `calendarViewOptions`로 옮겨간다

**E2E (playwright)**
- 리스트 색을 바꾸면 그 리스트의 블록 색이 바뀐다
- Color by를 우선순위로 바꾸면 같은 블록이 우선순위 색이 된다
- View Options에서 "완료한 일"을 끄면 완료 블록이 사라진다 (기존 스펙을 새 자리로 이동)
- 사이드바에서 리스트를 숨기면 그 리스트의 블록만 사라진다
- `⋯`가 Escape로 닫히고 초점이 버튼으로 돌아온다 (`Popover`의 §19.32)

---

## 9. 구현 순서

각 단계가 혼자서 화면에 보이는 결과를 낸다.

1. **`lists`를 넘긴다** — `CalendarView` → `buildCalendarItems`. 색은 아직 카테고리.
   회귀만 확인하는 한 줄짜리 단계.
2. **색의 근거를 리스트로** (§3, E1) — `colorForTask` + 단위 테스트. 이 단계만으로
   화면의 색이 갈린다.
3. **사이드바를 리스트 목록으로** (§4, E2) — `personal` 그룹 교체,
   `hiddenCategoryIds` → `hiddenSourceIds`.
4. **View Options 패널** (§6) — `⋯` + `Popover`. Color by와 두 토글을 여기로.
   `appSettings.calendarViewOptions` + 마이그레이션.
5. **우선순위 축** (§7.2) — `colorBy: "priority"`.
6. **카테고리 잔해 정리** (§5) — `NewTaskForm`·`QuickCreatePopover`의 `<select>`를
   List 피커로, `EventPopover`의 카테고리 변경을 리스트 이동으로,
   `CalendarCategorySettings`에서 개인 카테고리 편집 제거.

1~2만 해도 "왜 전부 같은 파랑인가"는 사라진다. 3~4가 없으면 사이드바가 이제 존재하지
않는 카테고리를 계속 보여주므로, **3은 2와 같은 릴리스에 나가야 한다.**

---

### 9.1 구현하며 알게 된 것

**`LAYER_COLOR`가 통째로 죽어 있었다.** `task` 항목을 리스트 색으로 바꾸고 나니 남은
두 항목(`external`·`focus-actual`)을 아무도 읽지 않았다 — 외부 일정은 구독 캘린더의
`calendar.color`를, 집중 블록은 `focusColor`를 각자 직접 쓰고 있었다. 표 전체를 지웠다.

**`resolveTaskCategoryId`를 안 고치면 색만 바뀌고 필터는 안 바뀐다.** 색은 리스트에서
오는데 가시성은 여전히 `task.categoryId`로 판단하니, 사이드바에서 리스트를 꺼도 블록이
남았다. 두 경로가 같은 답을 써야 한다 — 지금은 `item.listId` 하나다.

**빈 소스 id는 "숨김"이 아니라 "분류 못 함"이다.** `categoryAllowed("")`가 `false`를
반환하면 리스트를 못 찾은 항목이 조용히 사라진다. 분류하지 못한 항목은 격자에 있는
편이 없는 편보다 낫다 — 명시적으로 통과시킨다.

**개발 중 HMR 잔상에 세 번 속았다.** 필터·완료 토글이 안 먹는 것처럼 보였는데 전부
전체 새로고침 후에는 정상이었다. 캘린더는 모듈 수준 스토어(`calendarCategories.ts`의
`let state`)를 쓰고 `useSyncExternalStore`로 읽으므로, 이 파일들을 고친 뒤에는 HMR이
아니라 새로고침으로 확인할 것.

---

## 10. 결정 목록

| | 질문 | 안 | 권장 |
|---|---|---|---|
| **E1** | 색 없는 리스트의 색 | A 액센트 / B 중립 회색 / C id로 결정적 배정 | **C** (Inbox만 중립) |
| **E2** | 사이드바가 폴더를 그리나 | A 평평 / B 폴더 트리 / C 소제목 | **A** |
| **E3** | 기존 `task.categoryId` | A 무시 / B 리스트로 마이그레이션 / C 색만 이전 | **A** |
| **E4** | Color by에 태그를 넣나 | 예 / 아니오 | **아니오** (§7.3) |
| **E5** | `showCompleted` 저장 위치 | A `appSettings`로 이동 / B 카테고리 스토어 유지 | **A** |
