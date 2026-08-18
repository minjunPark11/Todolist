# TickTick Style Add List 상세 설계

- 문서명: `TICKTICK_STYLE_ADD_LIST_DESIGN.md`
- 버전: `v1.7 FINAL`
- 작성일: 2026-08-18
- 상태: **FINAL — §0~§17 전체 설계 및 검증 기준 확정**
- 기준 UI: TickTick의 `Lists + → Add List` 생성 경험
- 설계 원칙: **외형과 조작감은 TickTick에 가깝게, 내부 모델은 List와 View를 분리**
- 이후 누적 예정: §2 Modal Shell → §3 Name → §4 Color → §5 Default View → §6 Folder → §7 Actions → §8 Preview → §9~§17 구현 명세
- **이 저장소에서 읽을 때: §0보다 먼저 [§R 이 저장소에서의 해석](#r-이-저장소에서의-해석--구현-전-확정-phase-0)을 읽는다.** 본문은 이 저장소를 보지 않고 쓰였고, 충돌은 전부 §R에서 해소된다. 본문 §0~§17은 원문 그대로 유지한다.

---

## 문서 규칙

이 문서에서 사용하는 규범 표현은 다음과 같다.

- **MUST**: 구현 시 반드시 지켜야 하는 규칙
- **SHOULD**: 특별한 이유가 없다면 지켜야 하는 규칙
- **MAY**: 선택적으로 구현 가능한 규칙

이 문서는 화면 시안이 아니라 **구현 가능한 상호작용 명세**를 목표로 한다.

---

# R. 이 저장소에서의 해석 — 구현 전 확정 (Phase 0)

## R.1 이 절이 존재하는 이유

이 설계서는 이 저장소를 보지 않고 쓰였다. 설계 자체는 유효하고 그대로 구현할 값어치가 있지만, **어휘와 아키텍처 전제가 이 앱과 다르다.** 그 차이를 구현자가 매번 즉석에서 판단하면 PR마다 다른 답이 나오고, 나중에 어느 쪽이 의도였는지 아무도 모르게 된다.

그래서 규칙은 둘이다.

1. **본문 §0~§17은 수정하지 않는다.** 원문을 고치면 이 문서의 다음 개정판과 대조할 수 없다.
2. **본문과 이 저장소가 충돌하면 전부 이 절에서 해소한다.** 구현은 본문 + 이 절을 함께 읽은 것을 기준으로 한다.

이 절과 본문이 다르면 **이 절이 이긴다.**

---

## R.2 어휘 매핑 — MUST

| 본문 | 이 저장소 | 비고 |
|---|---|---|
| `spaceId` | **`projectId`** | R.3 참조. `List.spaceId`에 쓰지 말 것 |
| `folderId` | **`sidebarFolderId`** | Phase 5에서 뒤집혔다 — R.7 참조 |
| `sortKey: string` | `order: number` + `orderBetween()` | R.5 참조 |
| `ViewKey` | `TaskViewKind` | R.6 참조 |
| 서버 Command / Transaction | 로컬 리듀서 + 디바운스 diff 저장 | R.4 참조 |
| `creationRequestId` | 제출 락 + `createId("list")` | R.4 참조 |
| `ListColorValue` | `List.color?: string` | **Phase 1 완료.** 유니온이 아니라 자유 문자열 — R.6 |
| `defaultViewKey` | `List.defaultViewKey?: string` | **Phase 1 완료.** 유니온이 아니라 자유 문자열 — R.6 |

---

## R.3 `spaceId`를 쓰지 않는다 — MUST

**이 매핑 하나를 틀리면 나머지가 전부 조용히 틀린다.**

본문 §13.5의 `spaceId`는 "List를 소유하는 상위 컨테이너"라는 뜻이고, 이 저장소에서 그것은 **`List.projectId`**다.

이 저장소에는 `List.spaceId`라는 필드가 **실제로 존재하지만 뜻이 다르다.** `types.ts`가 그 자리에 적어둔 그대로다: 그 필드는 Project id를 담고 있었고, Space가 Project 위의 별도 레벨이 된 뒤에도 이름만 남았다. 지금은 **`@deprecated` 레거시 미러**이며, v0.6 이전 클라이언트의 `sanitizeList`가 `spaceId` 없는 List를 통째로 버리기 때문에 — 그리고 이 앱은 자동 업데이트되기 때문에 — **읽지는 않고 쓰기만 한다.** 지우는 시점은 TickTick 계획서의 Migration Phase 7이다.

따라서:

- 새 코드는 **`projectId`를 읽고 쓴다.**
- `spaceId`는 `createList`가 이미 하는 대로 **미러로만 함께 쓴다.** 새로 의미를 부여하지 않는다.
- 이 저장소의 **진짜 `Space` 레코드**는 Project보다 한 층 위이며, Add List는 그 층을 다루지 않는다.

---

## R.4 서버 Command 계층은 없다 — 의도만 구현한다

본문 §13.29~§13.35는 서버 command, transaction boundary, `creation_request_id` 기반 idempotency를 전제한다. **이 앱에는 그 계층이 없다.** 로컬 리듀서가 상태를 만들고, 디바운스된 diff가 Supabase에 행을 올린다. 강제할 서버도, 감쌀 트랜잭션도 없다.

그렇다고 그 절들이 무의미한 것은 아니다. 그것들이 막으려는 **실제 사고는 진짜다** — 더블클릭과 Enter 연타로 List가 둘 생기는 것(E2E-12, E2E-13). 그건 로컬에서 풀 수 있다.

- **Idempotency 대신 제출 락.** 제출이 진행 중이면 두 번째 제출은 시작되지 않는다. id는 클라이언트가 만들고(`createId("list")`), 한 번 만든 id는 재시도 사이에 **유지한다** — 재시도가 새 id를 만들면 그게 정확히 §13.32가 막으려던 중복이다.
- **Transaction 대신 리듀서 하나.** List 생성과 Folder 배치는 `setData` 한 번 안에서 일어나므로 중간 상태가 관측되지 않는다. 이는 §13.30이 요구한 원자성과 같은 결과다.
- **저장 실패는 이미 큐가 맡는다.** `domain/sync/saveQueue.ts`가 한 번에 하나, 최신 상태가 마지막, 실패는 백오프 재시도를 보장한다. §10의 network failure / timeout 항목은 **Add List가 다시 구현할 것이 아니라** 이 큐가 이미 답한 것이다.

§13.29~§13.35는 위 세 줄로 대체되며, **그 절들의 UI 요구(중복 제출 차단, Draft 보존)는 그대로 유효하다.**

---

## R.5 `sortKey`는 문자열이 아니라 숫자다

본문 §13.24~§13.26은 문자열 sort key를 전제한다. 이 저장소는 `domain/tasks/sortKey.ts`의 `orderBetween(before, after)`로 **두 이웃 사이의 숫자**를 만든다 — 목적(재배치할 때 이웃만 건드리고 전체를 다시 번호 매기지 않는다)은 같고 표현만 다르다.

`List`에는 `order`와 `sidebarSortKey`가 이미 있다. **새 필드를 만들지 않는다.**

---

## R.6 View 범위 — Gantt는 노출하되, 그 전에 열 수 있게 만든다

본문 §13.6은 `ViewKey = list | board | calendar | gantt`, Add List 노출은 `list | board | gantt`를 요구한다.

이 저장소의 Tasks Module은 지금 **`TaskViewKind = "list" | "board"`** 뿐이다. `TaskCalendarView.tsx`와 `TaskGanttView.tsx`는 존재하지만 **레거시 `/app` 셸**에 있고 Tasks Module의 URL 레이어(`?view=`)가 알지 못한다.

`defaultViewKey = "gantt"`를 **저장할 수 있는데 열 수 없는 상태**는 본문 자신의 완료 정의(§17.2 `READY_FOR_FIRST_TASK`)를 깬다. 그래서 순서를 정한다.

- **Gantt를 Tasks Module의 View로 먼저 배선한다** (Phase 3). `TaskGanttView`는 주석이 명시하듯 *scope-free*이고 `items`를 이미 스코프된 것으로 받으므로 **재작성이 아니라 배선**이다. `projectItems({ sources: ["task"] })`가 Task → Item 어댑터다.
- **그 다음에 Default View picker가 gantt를 제안한다** (Phase 4).
- **Calendar는 V1에서 노출하지 않는다.** 본문 §13.6도 "DB가 허용하는 View ≠ Add List가 노출하는 View"라고 명시한다.

`TaskViewKind`를 넓히면 **Gate 11의 `unsupported URL state 0`** 을 고정한 `domain/tasks/hardening.test.ts`와 `scopeRegistry`의 `allowedViews`가 함께 바뀐다. 그건 부수 작업이 아니라 Phase 3의 본체다.

### Phase 3 결과 — Gantt는 §5.45의 조건으로 합류했다

`TaskViewKind`가 `list | board | gantt`가 되고, **Board가 허용된 Scope에만** Gantt도 허용된다(Inbox와 실제 List). 새 규칙을 만들지 않은 이유가 있다 — §5.45가 정한 것은 "이 Scope가 **하나의 List의 화면인가**"이고, 여러 List를 모으는 Scope 위의 타임라인은 **행마다 다른 곳에 속한 막대**를 그린다. 그 시험을 통과하는 Scope가 이미 Board를 가진 그 둘이다. `defaultView`는 아홉 Scope 모두 여전히 `list`다.

**렌더러는 새로 짓지 않았다.** `TaskGanttView`는 자기 주석대로 scope-free이고 `items`를 이미 좁혀진 것으로 받으므로, `queryScopeTasks`의 결과를 `projectItems({sources:["task"]})`로 통과시켜 넘긴다. ViewSpec의 filter는 **비워서** 넘긴다 — 어느 Task인지는 Scope가 이미 답했고, 여기서 다시 이름 붙이면 §12.19가 금지한 "같은 좁히기 두 번, 어긋날 기회 두 번"이 된다.

**하드코딩 하나를 걷어냈다.** `hardening.test.ts`가 `["list","board"]`를 손으로 적어두고 있었다 — Gate 11의 `unsupported URL state 0`을 지키는 그 sweep이, gantt가 생긴 날 **gantt에 대해 아무 말도 하지 않는다**는 뜻이다. 이제 `TASK_VIEW_KINDS`를 순회하므로 유니온이 넓어지면 sweep도 함께 넓어진다.

**`TimelineConnectors`의 `ResizeObserver`가 무방비였다.** API가 없는 환경에서 마운트하는 순간 던지고 타임라인 전체를 데려간다. `useResponsiveMode`가 이미 쓰던 가드를 붙였다 — 한 번 잰 연결선은 그리고, 리사이즈 추적만 포기한다.

**앱에서 확인:** `/inbox?view=gantt`에서 타임라인이 List별로 묶여 그려지고, 날짜 없는 작업은 "No dates" 트레이로 빠지며, 토글은 List/Board/Timeline 셋이 되고 `aria-pressed`가 따라간다. `/today?view=gantt`는 Gantt를 그리지 않고 토글도 내주지 않는다. 가로 오버플로 0. 두 타임라인 표면 모두 axe serious/critical 0.

**남은 것 하나, Phase 3의 것이 아니다.** 직접 로드한 `/today?view=gantt`는 주소창에 `?view=gantt`를 남긴다 — 모듈은 canonical 상태로 그리지만 주소는 다시 쓰이지 않는다. `?view=board`도 **똑같이** 그렇다(확인함). 즉 이 릴리스가 만든 것이 아니라 §5.35의 기존 동작이며, Add List 설계의 범위 밖이다.

### 저장 타입은 유니온이 아니라 문자열이다 — MUST (Phase 1에서 확정)

`List.defaultViewKey`와 `List.color`는 **`string`으로 저장한다.** `TaskViewKind`도, 팔레트 토큰의 유니온도 아니다.

본문 §13.7이 이미 그렇게 권한다 — *"View 종류가 향후 확장될 가능성이 높으므로 DB column은 TEXT를 권장한다. Application의 View Registry가 validity를 검증한다."* 이 저장소에서는 그게 **권장이 아니라 요구**다. 이 앱은 자동 업데이트되고 모든 기기가 같은 계정에 쓴다. 어떤 빌드가 자기가 아는 View 집합으로 저장 시점에 검증하면, 새 빌드가 쓴 `"calendar"`를 **떨어뜨린 다음 그 레코드를 계정에 다시 저장한다.** 그게 정확히 M0가 막으려는 사고이고, 이 저장소에는 그 이력이 있다.

따라서 규칙은 하나다.

> `sanitizeList`는 **모양(shape)을 정규화하고 어휘(vocabulary)는 정규화하지 않는다.**

빈 문자열과 공백은 "사용자가 고르지 않았다"로 접어서 `undefined`가 되지만, `"timeline-3d"` 같은 모르는 값은 **그대로 남는다.** 이 빌드가 무엇을 열 수 있고 무엇을 그릴 수 있는지는 **여는 자리와 그리는 자리**에서 답한다(Phase 4).

`ListViewKey = "list" | "board" | "calendar" | "gantt"`라는 도메인 유니온은 **Phase 4에서 resolve 함수와 함께** 생긴다. 저장 타입이 아니라 해석 타입이다.

### Phase 4 결과 — 해석은 여는 자리에서, 색은 문자열 하나로

**`domain/tasks/listView.ts`가 생겼다.** `ListViewKey`는 네 개(`calendar` 포함)이고, `resolveListView(storedKey, policy)`가 세 가지를 한 번에 답한다: 이 빌드가 모르는 View인가, Scope가 금지하는 View인가(§5.45), 아니면 열어도 되는가. 앞의 둘은 **Scope의 기본값으로 떨어지고 저장은 건드리지 않는다** — 폴백을 되쓰는 것은 그 View를 지원하지 않는 기기에서 이 빌드가 사용자의 선택을 조용히 지우는 일이다.

**Add List가 노출하는 것은 `list | board | gantt`다.** §13.6이 Calendar를 빼라고 한 것과, 이 모듈에 Calendar 렌더러가 없다는 사실이 같은 답을 가리킨다 — **열 수 없는 View를 고르게 하는 것은 지킬 수 없는 약속**이고, §17.2가 완료로 치지 않는 상태다.

**resolve는 `go()` 한 곳에서만 일어난다.** URL 층은 List를 모른 채로 둔다 — `parseTaskUrl`은 문자열만 받고, 거기에 레코드를 가르치면 **한 주소가 계정마다 다른 화면을 뜻하게 된다.** 그래서 들어가는 길목에서 풀고, 결과 주소가 어느 View인지 스스로 말한다. `/list/l1`은 여전히 레지스트리 기본값이고, List가 다른 것을 원할 때만 `?view=board`가 쓰인다.

**색은 §13.21의 두 column을 따르지 않는다.** §13.23이 든 근거 셋(query·constraint·migration)은 전부 **관계형 column에 대한 것**인데 이 앱은 행마다 `data` jsonb 하나라 나눌 column이 없다. 오히려 뒤집힌다 — 두 필드는 **서로 어긋날 수 있다.** `kind: "preset"` 옆의 `value: "#4F7AF8"`은 표현 가능하고 무의미하며, §13.22가 constraint를 따로 적어야 했던 이유가 바로 그것이다. **문자열 하나는 자기와 어긋날 수 없고**, preset 키가 `#`로 시작하지 않으므로 세 상태(none/preset/custom)를 모호함 없이 말한다. `domain/tasks/listColor.ts`가 그 유일한 독자다.

Phase 1의 원칙은 여기서도 그대로다 — **모르는 색은 그리지 않되 지우지도 않는다.** 나중 릴리스가 추가한 preset이 이 클라이언트를 왕복해도 살아남아 아는 기기에서 다시 칠해진다.

**앱에서 확인:** 이름 전에 색·View를 고를 수 있고(§1.5 S2) 그 동안 Add는 계속 disabled다. Board를 골라 만들면 `?view=board`로 착지하고 보드가 그려진다. Today로 나갔다 사이드바로 다시 들어와도 **보드로 열린다**(§13.9). 헤더 토글은 그 방문에만 적용된다(`/list/:id`). 커스텀 `#4F7AF8`이 저장되고, 사이드바 점이 그 색으로 칠해진다. 반쪽짜리 `#4F7`은 저장되지 않는다.

---

## R.7 이 저장소가 이미 앞서 있는 것 — 다시 짓지 말 것

| 본문 요구 | 이미 있는 것 |
|---|---|
| §13.8 View Registry Contract | `domain/tasks/scopeRegistry.ts`의 `allowedViews` / `defaultView` |
| §13.9 List Open 시 View Resolve | 해석 순서만 추가: **`List.defaultViewKey` → registry `defaultView` → `"list"`** |
| R0-3 (Modal이 URL을 바꾸지 않는다) | `app/taskScopeUrl.ts` — Modal은 UI 상태이므로 URL에 없다 (팔레트 §10.23과 같은 취급) |
| §11 생성 이후 Navigation | `taskUrlFor` + canonicalize |
| R0-1 (List ≠ View) | 이미 그렇다. `List`에 `type` 필드가 없고 View는 `?view=`다 |
| §10 network failure / retry | `domain/sync/saveQueue.ts` |

**그리고 Folder는 본문보다 이 저장소가 한 걸음 앞서 있다.** 본문은 `folderId` 하나를 말하지만, 이 저장소는 `folderId`(도메인: List가 **어디에 속하는가**)와 `sidebarFolderId`(표시: 사용자가 **어디서 보기로 했는가**)를 이미 나눠 두었고, `folderIdFor`가 둘을 하나의 답으로 합친다.

### Phase 5에서 뒤집힌 것 — Add List의 Folder는 `sidebarFolderId`다

이 절은 원래 *"도메인 `folderId`를 정하는 것"*이라고 적었다. **틀렸다.** Phase 2가 정한 사실 하나가 그 답을 불가능하게 만든다: 이 모듈이 만드는 List는 **Project가 없다**(standalone, §6.3). 그런데 도메인 `Folder`는 Project에 속하고 `activeFolders(folders, projectId)`는 Project 없이는 아무것도 답하지 않는다 — **고를 것이 아예 없다.**

`sidebarFolders.ts`의 헤더가 이미 같은 말을 하고 있다: *"ladder는 List가 어디에 속하는지를 답하고, 사이드바는 사용자가 어디서 보고 싶은지를 답한다."* Add List의 Folder가 하는 일이 정확히 후자다. 그래서 draft·payload·store 옵션 모두 **`sidebarFolderId`**로 부른다 — 문서의 단어를 그대로 쓰면 리포에서 다른 것을 가리키게 되고, 그건 R.3이 `spaceId`에서 막은 바로 그 사고다.

**`addSidebarFolder`도 도메인에 있고 테스트도 있는데 부르는 곳이 없었다** — Phase 2의 `standaloneLists`와 똑같은 공백이다. `createSidebarFolder`가 스토어 커맨드로 생겼고, 만든 id를 돌려준다(§6.32가 곧바로 선택해야 하므로).

**§6.35의 잠금은 §1.13 INV-04와 같은 종류다.** Folder를 만드는 동안 Add를 막지 않으면 `sidebarFolderId`가 확정되기 전에 List가 생긴다. 그리고 Folder 생성 자체도 ref 잠금이다 — Phase 2가 배운 것을 두 번 배우지 않는다(테스트: Create 3번 클릭 → 1개).

**axe가 또 하나 잡았다.** trigger에 `role="combobox"`를 붙이고 안에 선택된 폴더 이름을 넣었더니 `button-name` **critical**이다. combobox의 내용은 **값**이지 이름이 아니다 — 이름은 레이블에서 와야 한다. `aria-labelledby`로 고쳤다. 팔레트의 listbox 건과 같은 부류: role은 다 붙어 있었고 **무엇이 무엇을 뜻하는지**가 틀렸다.

**앱에서 확인:** 기본값 "없음", 폴더 8개 이하에서 검색 없음(§6.24), `+ 새 폴더` → **두 번째 다이얼로그 없이** footer가 편집기로 바뀌고 포커스가 들어감(§6.30), 생성 즉시 선택 + 드롭다운 닫힘(§6.32), 그 동안 List 이름 draft는 그대로. 만들어진 List에 `sidebarFolderId`가 붙고 사이드바에서 그 그룹 아래에 나타난다.

---

## R.8 구현 순서

| Phase | 범위 | 완료 기준 |
|---|---|---|
| **0** ✅ | 이 절 (매핑 확정) | 이 문서가 리포에 있고 R.2 표가 합의됨 |
| **1** ✅ | §13 데이터 모델 | `List.color?` / `List.defaultViewKey?` 추가, `sanitizeList` 통과, **구버전 라운드트립 유지** (`forwardCompat.test.ts`) |
| **2** ✅ | §1~§3 Modal + Name | Name 하나로 Enter 생성 → Sidebar 반영 → 새 List 진입 → 첫 Task 입력 가능 |
| **3** ✅ | Gantt View 배선 | `?view=gantt`가 아홉 Scope 중 허용된 곳에서 열리고, `hardening.test.ts`가 갱신됨 |
| **4** ✅ | §4~§5 Color + Default View | 저장한 `defaultViewKey`가 실제로 그 View를 연다 |
| **5** ✅ | §6 Folder | inline Folder 생성 포함 |
| **6** ✅ | §8 Preview | 순수 표현 계층 — 잘라내도 기능이 성립한다 |
| **7** ✅ | §9·§10·§14 접근성·에러·반응형 | Phase 11의 axe 하니스 재사용 |

**Phase 2까지가 본문이 정의한 성공의 대부분이다.** R0-2가 요구하는 최소 Flow(`Lists + → 이름 → Enter`)가 그때 동작하고, 나머지는 전부 유효한 기본값이 있는 선택지다.

### Phase 7 결과 — 세 번째 사본을 만들지 않았다

**§9.6의 focus trap이 이 앱에 이미 두 번 복제돼 있었다** — Task Drawer와 Goal Drawer. 세 번째를 붙이는 대신 `hooks/useFocusTrap.ts`로 뽑고 Task Drawer를 그리로 옮겼다. trap은 정확히 복제되면 어긋나는 종류다: 한 사본이 `:disabled` 버튼을 새로 알게 되고 다른 하나는 모르면, **한 앱 안의 두 표면이 Tab이 빠져나갈 수 있는지를 두고 서로 다른 답을 한다.** (Goal Drawer는 다른 기능 영역이라 남겼다.)

훅이 `initial`을 받는 이유가 §9.2다 — "첫 번째 focusable"은 마크업 순서가 정하지만, 사용자가 하려는 것은 **타자**다. 그래서 Name 필드를 이름으로 지정한다. §9.3이 애니메이션이 끝난 뒤 focus하는 것을 금지하므로 타이머도 없다.

**§9.9/§9.10의 MUST는 "화살표가 다이얼로그 전체의 focus 이동으로 해석되지 않는다"이고, 그건 ARIA radio 패턴 그대로다** — 그룹은 **탭 정지 하나**이고 화살표가 그 안에서 고른다. `domain/tasks/rovingChoice.ts`가 순수 함수로 답한다(양끝 wrap: 라디오 그룹은 링이고, 끝에서 멈추면 경계가 아니라 키가 안 먹은 것으로 읽힌다).

**§14의 네 구간을 전부 넣었다.** 그리고 §2.3.2가 두 패널의 바닥을 960px로 잡은 것이 실제로 순서를 정한다 — 다이얼로그는 **폼을 압축하기 전에 두 번째 패널을 포기해야 한다.**

**앱에서 확인:**

| 구간 | 확인 |
|---|---|
| A ≥1280 | 모달 1200px, 칼럼 **648 / 552** — §2.2의 "preview panel ≈ 552px" 그대로 |
| B 960~1279 | 두 패널 유지, Preview가 폭을 양보(60/40) |
| C 640~959 | Preview 사라지고 단일 칼럼 520px, 폼 5개 요소 전부 |
| D <640 | 바닥에 붙은 시트, 593/812로 **전체를 덮지 않고**, 상단만 라운드, 액션 세로 스택 전폭, 내부 스크롤 |

§9는: Name에 focus(§9.2), trap 안에 정지 16개(§9.6), 두 그룹 각각 **탭 정지 1개**(§9.9/§9.10), 화살표·Home·End 동작, Esc가 드롭다운 먼저 닫고 그 다음 모달(§9.15), 닫으면 focus가 **`Lists +` 트리거로 복귀**(§9.4).

### Phase 6 메모 — Preview는 §2의 두 패널을 데려온다

§8을 붙이면서 다이얼로그가 처음으로 **2-panel**이 됐다(설정 왼쪽, 미리보기 오른쪽). Phase 2~5의 한 칼럼 형태는 사라지지 않고 **좁은 화면이 받는 형태**로 남는다 — §8.36이 *"좁은 화면에서 Form을 압축하면서까지 Preview를 유지하지 않는다"*고 못박고, §8.37이 Preview 없이도 기능이 동일해야 한다고 하므로 **양보하는 쪽은 Preview다.**

§8.31이 실제 컴포넌트 재사용을 금지한 것을 그대로 지켰다 — `TaskBoard`도 타임라인도 들어가지 않고 전부 벙어리 div다. 이유의 두 번째가 실제로 무는 쪽이다: 실제 화면을 고치면 **데이터를 하나도 그리지 않는 다이얼로그가 깨진다.**

`aria-hidden`을 택했다(§8.24의 두 선택지 중). Preview가 그리는 값은 **전부 그것을 설정한 필드가 이미 읽어주므로**, 낭독하면 같은 말을 두 번 하고 나서 사각형을 묘사하게 된다.

**앱에서 확인:** 폴백 제목이 placeholder와 다르고(§8.7), 이름·색이 즉시 반영되며(§8.7/§8.9), View를 바꿔도 **모달 크기가 1px도 변하지 않고**(§8.20), 80자 이름이 한 줄로 잘리며 모달이 커지지 않는다(§8.8). `pointer-events: none` / `cursor: default`(§8.22/§8.23). 375px에서 Preview가 사라지고 폼 5개 요소가 전부 남는다(§8.36).

**Phase 1이 가장 조심할 곳이다.** 이 앱은 자동 업데이트되므로 필드 하나를 더하는 것이 곧 마이그레이션이며, 이 저장소에는 그것을 틀려서 데이터를 잃은 이력(M0)이 있다. `forwardCompat.test.ts`가 그 계약을 지키는 자리다.

---

## R.9 아직 정하지 않은 것

**§17.3의 E2E 릴리스 게이트** — 본문은 Desktop / Tablet / Mobile E2E PASS를 릴리스 조건으로 건다. 이 저장소에는 브라우저 E2E 하니스가 없고, TickTick 계획서 Gate 11에서도 그 줄은 **의도적으로 미완(❌)으로 남겨져 있다**(감사 문서 25번).

기능마다 다시 정하지 않기 위해 **Phase 2를 지어본 뒤 한 번에 결정한다.** 그때 판단 재료가 생긴다 — 연타 방지(E2E-12/13)와 IME Enter(E2E-11)가 도메인/jsdom 레벨에서 잡히는지 아닌지가 Phase 2에서 드러나고, 잡히지 않는 것이 무엇인지가 곧 Playwright가 사야 할 것의 목록이다.

### Phase 2가 실제로 알려준 것

**순수 도메인 테스트는 연타를 잡지 못한다.** `createListDraft.test.ts`의 18개가 전부 통과하는 동안, 앱은 Enter 세 번에 **리스트를 세 개 만들었다.** 규칙 함수는 틀린 적이 없었다 — 틀린 것은 그 함수에 넘긴 값이었다. `submitting`이 React state였고, state는 **자기를 세팅한 tick 안에서 바뀌지 않으므로** 세 클로저가 모두 "제출 중 아님"을 읽었다. 버튼의 `disabled`는 Enter가 지나쳐 간다.

즉 §13.32가 서버 idempotency로 막으려던 그 사고가, 서버가 없는 이 앱에서도 **같은 모양으로 실재한다.** R.4가 "제출 락"이라고 쓴 것을 state로 구현하면 락이 아니다. 지금은 ref다.

**그래서 E2E 판단의 재료는 이렇게 정리된다.**

| 잡은 층 | 무엇을 |
|---|---|
| 순수 도메인 | 이름 정규화·검증·중복 허용·payload — 규칙 그 자체 |
| **jsdom (이벤트 루프 있음)** | **연타 1회 제출, IME Enter, 실패 후 Draft 보존, 실패 후 재시도, scrim 무시** — Phase 2의 진짜 버그가 여기서 잡혔고 여기서만 잡힌다 |
| 실제 브라우저 | 새로고침 생존(`sanitizeList` 왕복), 실제 포커스 이동, URL 전환, 온스크린 키보드 |

**Playwright가 살 것은 세 번째 줄뿐이고, 그중 앞의 둘은 이미 수동으로 걸었다.** 27개 시나리오 중 다수가 두 번째 줄에서 닫히므로, 전면 도입보다 **jsdom 레벨을 계속 쓰고 브라우저는 수동 확인으로 남기는 쪽**이 지금 시점의 비용 대비 답이다. Phase 5(Folder)까지 지어보고 최종 확정한다.

---

# 0. 설계 목적 및 범위

## 0.1 문제 정의

현재 Sidebar의 `Lists +`는 사용자가 새로운 작업 컨테이너를 만드는 진입점이다.

이 기능에서 해결해야 하는 핵심 문제는 다음과 같다.

> 사용자가 현재 화면의 맥락을 잃지 않은 채, 최소한의 설정만으로 새 List를 만들고 즉시 해당 List에서 작업을 시작할 수 있어야 한다.

따라서 `Add List`는 별도 설정 페이지가 아니라 **짧고 집중된 생성 Dialog**로 설계한다.

---

## 0.2 사용자 목표

사용자가 `Lists +`를 누른 순간의 실제 목적은 “설정을 한다”가 아니다.

사용자 목표는 다음 한 문장으로 정의한다.

> **새로운 작업 묶음을 만들고, 바로 그 안에 작업을 추가하기 시작한다.**

따라서 List 생성 완료의 기준은 단순히 DB에 List row가 추가되는 순간이 아니다.

**List 생성 완료 = 새 List 생성 + 새 List 선택 + 기본 View 진입 + 첫 Task를 추가할 수 있는 상태**

로 정의한다.

---

## 0.3 핵심 Flow

```text
Lists +
   ↓
Add List Modal
   ↓
이름 / 색상 / 기본 View / Folder 설정
   ↓
List 생성
   ↓
새 List Sidebar 반영
   ↓
새 List 선택
   ↓
기본 View 진입
   ↓
첫 Task 입력 가능 상태
```

---

## 0.4 Add List가 담당하는 것

`Add List Modal`은 다음 네 가지 사용자 결정을 담당한다.

### A. Name
새 List의 이름.

예:

```text
학교
논문
대학원 준비
해야 하는 일
```

### B. Color
Sidebar와 List identity를 구분하기 위한 시각적 색상.

Color는 List의 **identity accent**이며 Task Priority, Status, Board Column 색상과 분리한다.

### C. Default View
List를 처음 열었을 때 활성화할 기본 표현 방식.

초기 설계 후보:

```text
List
Board
Gantt
```

> 세부 View 구성과 최종 UI는 §5에서 확정한다.

### D. Folder
새 List가 Sidebar에서 소속될 Folder.

```text
None
학교
개인
연구
...
```

---

## 0.5 Add List가 담당하지 않는 것

생성 Dialog가 설정 페이지로 비대해지는 것을 방지하기 위해 다음 기능은 **명시적으로 범위 밖**으로 둔다.

### Task 수준 설정

```text
✕ Task 생성
✕ Task Priority 기본값
✕ Assignee
✕ Due date
✕ Tag
```

### View 세부 설정

```text
✕ Board Column 직접 구성
✕ Status workflow 설정
✕ Gantt zoom 설정
✕ Calendar 표시 규칙
✕ Sort
✕ Group
✕ Filter
```

### List 고급 설정

```text
✕ Permission
✕ Automation
✕ Custom Field
✕ Archive 정책
✕ Notification
```

이 기능들은 List 생성 이후 해당 List 또는 View의 별도 설정에서 다룬다.

---

## 0.6 TickTick 모사 범위

이 설계는 TickTick의 `Add List` 경험을 다음 측면에서 적극적으로 참조한다.

### 모사하는 것

- Sidebar의 `Lists +` 진입점
- 현재 화면 위에 뜨는 중앙 Modal
- 빠르게 완료되는 생성 Flow
- 왼쪽 설정 / 오른쪽 Preview의 2-panel 구성
- 높은 정보 밀도
- Name → Color → View → Folder 순서
- Primary / Secondary action의 명확한 구분
- 생성 중 페이지 이동 없음
- 새 List 생성 후 즉시 해당 List로 진입

### 그대로 복제하지 않는 것

TickTick에 존재하더라도 현재 제품 의미가 없는 옵션은 추가하지 않는다.

예:

```text
Type
Show in Smart List
Premium crown
```

실제 제품 기능이 존재하지 않는 설정을 “TickTick과 비슷해 보이기 위해” 노출하지 않는다.

---

## 0.7 핵심 Domain 원칙

### R0-1. List와 View는 다른 개념이다 — MUST

잘못된 모델:

```text
List.type = "board"
List.type = "gantt"
```

사용하지 않는다.

올바른 모델:

```text
List
 ├─ name
 ├─ folder
 ├─ color
 └─ defaultView
```

그리고 View는 별도 표현 계층이다.

```text
학교 List
 ├─ List View
 ├─ Board View
 ├─ Calendar View
 └─ Gantt View
```

`Default View = Board`는 다음 의미만 가진다.

> “학교 List를 열었을 때 Board View를 우선 활성화한다.”

List 자체가 Board가 되는 것이 아니다.

---

### R0-2. 생성은 최소 결정만 요구한다 — MUST

사용자가 List 생성 전 반드시 결정해야 하는 값은 **Name 하나**다.

나머지는 모두 유효한 기본값을 제공한다.

```text
Name         required
Color        default = none
Default View default = list
Folder       default = context or none
```

따라서 사용자는 다음 Flow만으로도 새 List를 만들 수 있어야 한다.

```text
Lists +
→ "학교" 입력
→ Enter
```

---

### R0-3. 생성 Dialog는 현재 Navigation context를 파괴하지 않는다 — MUST

Modal이 열리는 동안:

- 현재 페이지는 유지된다.
- 기존 Sidebar/Main 화면은 뒤에 남아 있다.
- Modal Open 자체로 URL을 변경하지 않는다.
- 사용자가 Cancel하면 정확히 기존 화면으로 돌아간다.

---

### R0-4. 생성 성공 이후에는 결과를 즉시 보여준다 — MUST

성공 후 사용자가 별도로 Sidebar에서 새 List를 다시 찾아 클릭하게 만들지 않는다.

```text
생성 성공
→ Sidebar 삽입
→ 새 List selected
→ 새 List route/view 진입
```

까지 하나의 transaction-like UX로 취급한다.

---

### R0-5. Add List는 “설정”이 아니라 “생성”이다 — MUST

생성 Modal 내부의 옵션 수가 늘어나더라도 사용자가 결정해야 할 핵심 축을 방해해서는 안 된다.

우선순위:

```text
1. Name
2. View
3. Folder
4. Color
5. 그 외
```

고급 설정은 반드시 별도 근거가 있을 때만 추가한다.

---

## 0.8 성공 조건

Add List 기능은 다음 조건을 만족할 때 UX 관점에서 성공으로 본다.

1. 사용자가 현재 화면을 떠나지 않고 List를 만들 수 있다.
2. Name만 입력해도 생성 가능하다.
3. 기본값 때문에 추가 판단이 강요되지 않는다.
4. 사용자가 선택한 Folder / View가 생성 결과에 정확히 반영된다.
5. 생성 직후 Sidebar에서 새 List가 선택된다.
6. 생성 직후 해당 List의 기본 View가 열린다.
7. 사용자가 즉시 첫 Task를 입력할 수 있다.
8. 실패 시 사용자가 입력한 Draft가 보존된다.

---

## 0.9 비기능 목표

### 속도
일반적인 사용자는 `Lists +` 클릭 후 **5~10초 이내**에 생성을 완료할 수 있어야 한다.

### 예측 가능성
동일한 진입점과 동일한 입력은 동일한 생성 결과를 만든다.

### 복구 가능성
네트워크 실패가 발생해도 입력한 Name / Color / View / Folder를 잃지 않는다.

### 키보드 사용성
마우스 없이도 최소 Flow를 완료할 수 있어야 한다.

```text
Lists +
→ Name 입력
→ Enter
```

---

# 1. Add List 진입 및 전체 생성 Flow

## 1.1 진입점

기본 진입점은 Sidebar의 `Lists` section header 우측 `+` 버튼이다.

```text
Lists                                  +
────────────────────────────────────────
학교                                  17
해야 하는 일
```

### 진입 규칙

`Lists +` 클릭 시:

```text
openCreateListModal({
  contextFolderId: null
})
```

을 의미한다.

Modal이 열릴 때 현재 List/Folder/Page selection은 변경하지 않는다.

---

## 1.2 Context-aware 진입

향후 Folder header 또는 Folder context menu에서도 List 생성 기능을 제공할 수 있다.

예:

```text
학교                                  +
  수업
  논문
```

`학교 +`에서 진입한 경우:

```text
openCreateListModal({
  contextFolderId: schoolFolderId
})
```

Modal의 Folder 기본값은 자동으로 `학교`가 된다.

### 규칙

```text
Lists +  → Folder default = None
Folder + → Folder default = 해당 Folder
```

사용자는 Modal 안에서 이 값을 변경할 수 있다.

---

## 1.3 Modal Open 시 초기 상태

Modal Open 직후 Draft:

```ts
{
  name: "",
  color: null,
  defaultViewType: "list",
  folderId: contextFolderId ?? null
}
```

UI status:

```text
OPEN_EMPTY
```

Name input은 자동 Focus된다.

---

## 1.4 전체 상태 흐름

```text
CLOSED
  │
  │ Lists + / Folder +
  ▼
OPEN_EMPTY
  │
  │ Name 입력
  ▼
OPEN_VALID
  │
  │ Add / Enter
  ▼
SUBMITTING
  │
  ├──────────── Failure ────────────┐
  │                                 ▼
  │                               ERROR
  │                                 │
  │                                 │ Retry
  │                                 └───────→ SUBMITTING
  │
  └──────────── Success
                    │
                    ▼
               LIST_CREATED
                    │
                    ▼
              SIDEBAR_UPDATED
                    │
                    ▼
               LIST_SELECTED
                    │
                    ▼
             DEFAULT_VIEW_OPEN
                    │
                    ▼
             READY_FOR_FIRST_TASK
```

---

## 1.5 상태 정의

### S1. CLOSED

Modal이 열려 있지 않은 상태.

기존 Sidebar/Main UI가 정상 동작한다.

가능한 Transition:

```text
Lists +  → OPEN_EMPTY
Folder + → OPEN_EMPTY
```

---

### S2. OPEN_EMPTY

Modal은 열려 있으나 아직 유효한 Name이 없는 상태.

예:

```text
name = ""
```

또는:

```text
name = "     "
```

### UI 규칙

- Name input: enabled
- Color: enabled
- View: enabled
- Folder: enabled
- Add: **disabled**
- Cancel: enabled

사용자는 Color/View/Folder를 먼저 변경할 수도 있다.

즉 Name을 가장 먼저 입력하도록 강제하지 않는다.

---

### S3. OPEN_VALID

다음 조건을 만족하면 진입한다.

```ts
name.trim().length > 0
```

### UI 규칙

- 모든 Field: enabled
- Add: **enabled**
- Cancel: enabled
- Enter Submit: 가능

이름 중복 자체는 invalid 조건으로 취급하지 않는다.

---

### S4. SUBMITTING

사용자가 Add 또는 유효한 Enter Submit을 실행한 상태.

### UI 규칙

```text
Name        disabled
Color       disabled
View        disabled
Folder      disabled
Add         loading + disabled
Cancel      disabled
```

사용자가 동일 List를 중복 생성하지 않도록 모든 생성 action을 잠근다.

### 필수 규칙

**Double-submit을 허용하지 않는다.**

```ts
if (status === "submitting") return
```

---

### S5. ERROR

List 생성 요청이 실패한 상태.

예:

```text
network error
server error
permission error
unexpected persistence error
```

### 핵심 규칙

**Draft를 절대 초기화하지 않는다.**

유지 대상:

```text
name
color
defaultViewType
folderId
```

### UI 규칙

- Field: 다시 enabled
- Error message: 표시
- Primary action: Retry 가능
- Cancel: enabled

ERROR에서 사용자는 값을 수정한 후 다시 생성할 수 있다.

---

### S6. LIST_CREATED

Persistence가 성공하여 List identity가 생성된 내부 상태.

이 상태는 사용자에게 오래 노출되는 화면 상태가 아니라 성공 후처리를 위한 transient state다.

반환 예:

```ts
{
  listId,
  defaultViewId
}
```

---

### S7. SIDEBAR_UPDATED

새 List가 Sidebar state에 반영된다.

규칙:

- Folder가 없는 경우 해당 Lists container의 마지막에 삽입
- Folder가 있는 경우 해당 Folder의 마지막에 삽입
- 자동 가나다/알파벳 정렬하지 않음
- 이후 drag reorder 가능

---

### S8. LIST_SELECTED

새 List가 Sidebar의 active selection이 된다.

기존 selection은 해제한다.

시각적으로 사용자가 “무엇이 생성되었는지” 즉시 확인 가능해야 한다.

---

### S9. DEFAULT_VIEW_OPEN

생성 시 선택한 defaultView가 열린다.

예:

```text
defaultViewType = list
→ List View

defaultViewType = board
→ Board View

defaultViewType = gantt
→ Gantt View
```

---

### S10. READY_FOR_FIRST_TASK

새 List에서 첫 Task를 만들 수 있는 상태.

가능하면 Quick Add / Task composer에 자동 Focus한다.

> 이 상태를 Add List UX의 최종 완료 상태로 본다.

---

# 1.6 State Transition 표

| 현재 상태 | 사용자 행동 / 시스템 결과 | 다음 상태 |
|---|---|---|
| CLOSED | `Lists +` | OPEN_EMPTY |
| CLOSED | `Folder +` | OPEN_EMPTY |
| OPEN_EMPTY | 유효한 Name 입력 | OPEN_VALID |
| OPEN_VALID | Name 제거/공백화 | OPEN_EMPTY |
| OPEN_EMPTY | Cancel / Esc | CLOSED |
| OPEN_VALID | Cancel / Esc | CLOSED |
| OPEN_VALID | Add | SUBMITTING |
| OPEN_VALID | Enter | SUBMITTING |
| SUBMITTING | Success | LIST_CREATED |
| SUBMITTING | Failure | ERROR |
| ERROR | Retry | SUBMITTING |
| ERROR | 값 수정 | OPEN_VALID 또는 OPEN_EMPTY |
| ERROR | Cancel | CLOSED |
| LIST_CREATED | Sidebar 반영 성공 | SIDEBAR_UPDATED |
| SIDEBAR_UPDATED | 새 List 활성화 | LIST_SELECTED |
| LIST_SELECTED | default View 열기 | DEFAULT_VIEW_OPEN |
| DEFAULT_VIEW_OPEN | Task composer 준비 | READY_FOR_FIRST_TASK |

---

# 1.7 Cancel Flow

사용자가 다음 상태에서 Cancel 또는 Esc를 실행할 수 있다.

```text
OPEN_EMPTY
OPEN_VALID
ERROR
```

결과:

```text
Modal close
→ Draft discard
→ 기존 화면 유지
```

추가 Confirmation Modal은 사용하지 않는다.

이유:

- 입력 항목 수가 적다.
- explicit Cancel은 사용자의 의도가 명확하다.
- confirmation dialog가 생성 Flow를 과도하게 무겁게 만든다.

---

## 1.8 Overlay Click

Modal 바깥 Overlay click은 **Modal을 닫지 않는다.**

### 이유

Add List는 넓은 2-panel dialog이며 마우스 이동 중 외부 영역을 실수로 클릭할 가능성이 있다.

사용자의 Draft를 우발적인 click으로 잃게 만들지 않는다.

닫기 수단은 명시적으로 제한한다.

```text
Cancel
Esc
```

---

## 1.9 Enter Submit

Name이 유효한 상태에서 Enter는 Add와 동일한 생성 action을 실행한다.

```text
OPEN_VALID
+ Enter
→ SUBMITTING
```

단 한국어/중국어/일본어 IME composition 중 Enter는 Submit으로 처리하면 안 된다.

필수 방어:

```ts
if (event.nativeEvent.isComposing) {
  return
}
```

---

## 1.10 생성 성공 후 Navigation

Modal Open 자체는 URL을 변경하지 않는다.

하지만 생성 성공 후에는 새 List가 실제 navigation target이 되므로 route를 갱신한다.

개념적 순서:

```text
Create success
→ Modal close
→ Sidebar insert
→ Select new List
→ Navigate to new List
→ Open default View
→ Focus Task composer
```

실제 URL schema는 기존 앱 routing 규칙을 따른다.

Add List 설계에서 새로운 독립 URL 규칙을 만들지 않는다.

---

## 1.11 생성 후 Folder 위치

### Folder 없음

```text
Lists
  기존 A
  기존 B
  새 List      ← selected
```

### Folder 있음

```text
학교
  기존 A
  기존 B
  새 List      ← selected
```

새 List는 기본적으로 container 마지막에 배치한다.

생성 시점에 sort dialog를 추가하지 않는다.

---

## 1.12 실패 시 보존 규칙

다음 Draft는 오류 종류와 관계없이 유지한다.

```text
Name
Color
Default View
Folder
```

사용자가 재시도하기 위해 같은 정보를 다시 입력하게 만들지 않는다.

예:

```text
학교
Blue
Board
Folder = 대학원
```

생성 실패 후에도 그대로 남아 있어야 한다.

---

## 1.13 Flow Invariants

아래 규칙은 이후 세부 UI 설계에서도 변경하지 않는다.

### INV-01
Modal Open 자체는 현재 page selection을 변경하지 않는다.

### INV-02
유효한 Name 없이 List를 생성할 수 없다.

### INV-03
Name 외 항목은 기본값을 가진다.

### INV-04
Submitting 동안 중복 생성할 수 없다.

### INV-05
실패 시 Draft는 보존된다.

### INV-06
성공 후 새 List는 자동 선택된다.

### INV-07
성공 후 default View가 자동으로 열린다.

### INV-08
List와 View는 domain model에서 분리한다.

### INV-09
생성 Flow 종료점은 `READY_FOR_FIRST_TASK`다.

---

# 1.14 현재 단계 Acceptance Criteria

### AC-F01
Sidebar의 `Lists +`를 클릭하면 현재 화면 위에 Add List Modal이 열린다.

### AC-F02
Modal Open 시 기존 route와 기존 selection은 유지된다.

### AC-F03
Modal Open 직후 Name input이 Focus된다.

### AC-F04
Name이 비어 있거나 공백뿐이면 Add는 disabled 상태다.

### AC-F05
Name이 유효하면 Add가 enabled 된다.

### AC-F06
Color/View/Folder는 Name 입력 전에도 변경할 수 있다.

### AC-F07
Add 실행 직후 Form 전체가 submitting 상태로 잠긴다.

### AC-F08
Submitting 동안 두 번째 Add 요청이 발생하지 않는다.

### AC-F09
생성 실패 시 Draft 값이 모두 유지된다.

### AC-F10
생성 성공 시 새 List가 Sidebar에 삽입된다.

### AC-F11
생성 성공 시 새 List가 자동 선택된다.

### AC-F12
생성 성공 시 선택한 default View가 열린다.

### AC-F13
생성 성공 Flow가 끝나면 사용자는 즉시 첫 Task를 추가할 수 있다.

### AC-F14
Overlay click만으로 Modal이 닫히지 않는다.

### AC-F15
Cancel 또는 Esc는 명시적으로 Modal을 닫는다.

### AC-F16
IME composition 중 Enter가 Submit으로 오작동하지 않는다.

---

# 2. Modal Shell 및 Layout

## 2.1 설계 목표

`Add List Modal`의 Shell은 사용자가 기능을 이해하기 전에 먼저 다음 세 가지를 전달해야 한다.

1. **현재 화면을 떠난 것이 아니다.**
2. **왼쪽에서 설정하고 오른쪽에서 결과 형태를 확인한다.**
3. **짧은 생성 작업이므로 한 화면 안에서 끝난다.**

TickTick 레퍼런스의 핵심은 개별 버튼 모양보다 **큰 중앙 Dialog 안에서 설정과 Preview를 명확하게 양분하는 구조**에 있다.

따라서 이 설계는 다음 구조를 고정한다.

```text
APP BACKGROUND
└─ Overlay
   └─ CreateListModal
      ├─ Settings Panel
      │  ├─ Header
      │  ├─ Form Content
      │  └─ Action Area
      │
      └─ Preview Panel
         └─ Preview Stage
```

---

## 2.2 기준 레퍼런스의 구조 해석

제공된 TickTick 화면을 구조적으로 보면 다음 특징이 있다.

```text
┌─────────────────────────────────────────────────────────────┐
│                      Add List                               │
│                                                             │
│    Name Input                                               │
│                                                             │
│    Color          ● ● ● ● ● ● ●                           │
│                                                             │
│    View           [ ] [ ] [ ]                              │
│                                                             │
│    Folder         [                       ]                  │
│                                                             │
│                                                             │
│                         Add  Cancel                          │
├──────────────────────────────┬──────────────────────────────┤
│     Settings / Form          │        Preview              │
└──────────────────────────────┴──────────────────────────────┘
```

실제 시각적 특징은 다음과 같다.

- Modal은 화면 중앙에 위치한다.
- 가로형 비율이 강하다.
- 좌측 Panel이 우측 Preview보다 약간 넓다.
- 좌/우 Panel은 배경색 차이로만 구분되고 강한 divider를 사용하지 않는다.
- 제목은 Settings Panel 기준 중앙에 위치한다.
- Form은 Settings Panel 안에서 충분한 좌우 여백을 가진다.
- Actions는 Settings Panel 하단에 고정된 느낌으로 배치된다.
- Preview는 실제 앱 화면보다 훨씬 옅고 단순화된 illustration이다.
- Modal 외부 앱 UI는 보이지만 시각적 우선순위가 낮아진다.

이 구조를 제품의 `Add List` Shell 기본형으로 채택한다.

---

## 2.3 Desktop Modal 크기

### 2.3.1 기준 크기

Desktop 기본값:

```text
modal-width: 1200px
modal-height: 700px
```

하지만 고정 px만 사용하지 않고 viewport에 맞춰 제한한다.

```css
width: min(1200px, calc(100vw - 64px));
height: min(700px, calc(100vh - 64px));
```

### 2.3.2 최소 Desktop 크기

2-panel 구조를 유지할 수 있는 최소 폭:

```text
min desktop modal width: 960px
```

이보다 좁아지면 §14 Responsive 규칙에 따라 Preview 축소 또는 제거를 검토한다.

### 2.3.3 이유

1200 × 700을 기본값으로 두는 이유:

- 이름 입력창을 넉넉하게 유지할 수 있다.
- Color / View / Folder control이 압축되지 않는다.
- Preview가 장식이 아니라 실제 정보 힌트로 보일 최소 폭을 확보한다.
- TickTick 레퍼런스와 유사한 가로 비율을 만든다.
- 1440px급 Desktop에서도 화면 전체를 점유하지 않는다.

---

## 2.4 좌우 Panel 비율

기본 비율:

```text
Settings Panel: 54%
Preview Panel: 46%
```

1200px 기준:

```text
Settings = 648px
Preview  = 552px
```

구현 변수:

```css
--add-list-settings-width: 54%;
--add-list-preview-width: 46%;
```

### MUST

좌우를 정확히 50:50으로 나누지 않는다.

Settings Panel은 실제 입력과 조작이 이루어지는 주 작업 공간이므로 Preview보다 조금 더 넓어야 한다.

---

## 2.5 Modal 전체 구조

```text
┌──────────────────────────────────────────────────────────────┐
│ SETTINGS PANEL                      PREVIEW PANEL            │
│                                                              │
│           리스트 추가                                       │
│                                                              │
│    ┌────────────────────────────┐                            │
│    │ Name                       │                            │
│    └────────────────────────────┘                            │
│                                                              │
│    Color   ...                                               │
│    View    ...                    Preview Stage              │
│    Folder  ...                                               │
│                                                              │
│                                                              │
│                      Add Cancel                              │
└──────────────────────────────────────────────────────────────┘
```

Modal Root:

```css
display: grid;
grid-template-columns: 54fr 46fr;
overflow: hidden;
```

좌우 Panel은 하나의 Dialog 내부에 존재하며 별도 Card처럼 보이면 안 된다.

---

## 2.6 Modal 위치

### 기본

```css
position: fixed;
left: 50%;
top: 50%;
transform: translate(-50%, -50%);
```

즉 viewport 정중앙 배치.

### Vertical optical correction

시각적으로 너무 아래에 무거워 보이는 화면에서는 최대 `-8px` 정도의 optical offset을 허용한다.

```css
transform: translate(-50%, calc(-50% - 4px));
```

하지만 화면 크기에 따라 수동으로 다른 위치를 지정하지 않는다.

### MUST NOT

```text
✕ Sidebar 기준 정렬
✕ Main content 기준 정렬
✕ 클릭한 + 버튼 바로 옆 Popover 형태
```

Add List는 Sidebar popover가 아니라 **독립적인 creation dialog**다.

---

## 2.7 Overlay

Overlay의 목적은 배경을 숨기는 것이 아니라 **현재 앱 Context는 유지하되 우선순위를 Modal로 이동시키는 것**이다.

### 기본

```css
background: rgba(20, 24, 32, 0.14);
```

허용 범위:

```text
alpha: 0.12 ~ 0.18
```

### MUST

- Sidebar와 Main의 형태는 뒤에서 식별 가능해야 한다.
- 텍스트 가독성은 낮아져야 한다.
- Modal의 white surface와 충분한 depth 차이가 나야 한다.

### MUST NOT

```text
✕ background blur를 강하게 적용
✕ 0.3 이상의 진한 black overlay
✕ 배경을 완전히 제거
```

TickTick식 utility dialog의 느낌을 유지하기 위해 blur는 기본적으로 사용하지 않는다.

---

## 2.8 Modal Surface

Settings Panel:

```text
background: surface-primary
```

일반적인 Light Theme 기준:

```css
background: #FFFFFF;
```

Preview Panel:

```text
background: surface-preview-subtle
```

권장 Light Theme 범위:

```css
#F6F8FF
#F7F8FC
#F5F7FB
```

정확한 색상 값은 전역 Theme Token을 따른다.

### 핵심

두 Panel의 구분은 `border-left`보다 **surface tone 차이**를 우선한다.

---

## 2.9 Border 및 Radius

Modal:

```text
border-radius: 18px
```

허용 범위:

```text
16px ~ 20px
```

TickTick 레퍼런스처럼 일반 Dialog보다 약간 큰 Radius를 사용한다.

### Border

기본적으로 강한 외곽 Border는 사용하지 않는다.

필요 시:

```css
border: 1px solid rgba(0,0,0,0.04);
```

정도의 미세한 separation만 허용한다.

---

## 2.10 Shadow

Modal의 Depth는 Shadow로 표현한다.

권장 개념값:

```css
box-shadow:
  0 2px 8px rgba(0,0,0,0.06),
  0 14px 40px rgba(0,0,0,0.14);
```

### 원칙

- 작은 Card shadow보다 확실히 커야 한다.
- 검은 테두리처럼 보이면 안 된다.
- Preview Panel의 옅은 배경과 함께 floating dialog로 인식되어야 한다.

---

## 2.11 Settings Panel 내부 레이아웃

Settings Panel은 세 영역으로 나눈다.

```text
Settings Panel
├─ Header Zone
├─ Form Zone
└─ Action Zone
```

Grid:

```css
display: grid;
grid-template-rows:
  auto
  1fr
  auto;
```

이를 통해 Form 내용이 조금 늘어나더라도 Actions가 불필요하게 위로 밀리지 않게 한다.

---

## 2.12 Settings Panel Padding

1200px Desktop Modal 기준:

```text
horizontal padding: 40px
top padding:        26px
bottom padding:     22px
```

내부 사용 가능 폭:

```text
648 - 80 = 568px
```

따라서 Name input을 약 `568px` full width로 사용할 수 있다.

### Token 권장

```css
--add-list-panel-padding-x: 40px;
--add-list-panel-padding-top: 26px;
--add-list-panel-padding-bottom: 22px;
```

---

## 2.13 Header Zone

Header는 Settings Panel에만 속한다.

Preview 전체 폭을 기준으로 가운데 정렬하지 않는다.

```text
┌──────────────────────────┬───────────────────────┐
│       리스트 추가        │                       │
│                          │                       │
└──────────────────────────┴───────────────────────┘
```

### 제목

```text
text: 리스트 추가
alignment: center
```

Settings Panel 내부에서 중앙 정렬.

권장:

```css
font-size: 22px;
font-weight: 700;
line-height: 1.25;
```

### Header 높이

고정 높이보다 padding 기반을 사용한다.

권장:

```text
title top: 약 26~30px
title bottom gap: 약 34~38px
```

Name input이 제목과 너무 가까워 보이지 않아야 한다.

---

## 2.14 Close Icon

TickTick 레퍼런스의 정보 구조를 유지하기 위해 Header 우측 `×`는 기본적으로 표시하지 않는다.

닫기 경로는:

```text
Cancel
Esc
```

로 제공한다.

### 이유

- Dialog의 시각적 밀도를 줄인다.
- 사용자의 주의가 Form에 집중된다.
- 명시적인 Cancel action과 역할이 중복되지 않는다.

향후 전역 Dialog 정책상 Close icon이 필수인 경우에만 예외로 추가한다.

---

## 2.15 Form Zone Alignment System

가장 중요한 Layout 규칙 중 하나다.

Name을 제외한 설정 행은 다음 두 column 기준선을 공유한다.

```text
LABEL COLUMN        CONTROL COLUMN
│                   │
Color               ● ● ● ●
View                [ ] [ ] [ ]
Folder              [             ]
```

### 권장 Grid

```text
label width:   180px
gap:            20px
control width: 368px
```

총:

```text
180 + 20 + 368 = 568px
```

즉 Settings Panel의 실제 content width와 일치한다.

CSS 개념:

```css
.setting-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  column-gap: 20px;
  align-items: center;
}
```

---

## 2.16 Name은 Grid 예외

Name field는 `LABEL / CONTROL` 구조를 사용하지 않는다.

```text
┌──────────────────────────────────────────────────────┐
│ icon │ Name                                          │
└──────────────────────────────────────────────────────┘
```

Settings Panel content width 전체를 사용한다.

```text
width: 100%
```

즉 Name은 다른 설정보다 시각적 우선순위가 높다.

---

## 2.17 Vertical Rhythm

Settings Form은 “설정 페이지”처럼 촘촘하게 만들지 않고 TickTick과 유사한 여유를 둔다.

기준:

```text
Header → Name:       34~38px
Name → Color row:    28~32px
Color → View:        28~32px
View → Folder:       28~32px
Folder → next row:   20~28px
```

실제 세부 height에 따라 값은 약간 달라질 수 있지만 다음 원칙을 지킨다.

### MUST

- 모든 setting row 사이의 간격이 거의 동일하게 느껴져야 한다.
- Name과 첫 설정 행 사이에는 일반 row보다 약간 더 큰 separation을 허용한다.
- Actions와 Form 마지막 행 사이에는 넉넉한 flexible space를 둔다.

---

## 2.18 Action Zone 위치

Actions는 Settings Panel 하단에 위치한다.

```text
                              [Add] [Cancel]
```

정확한 버튼 스타일과 상태는 §7에서 결정한다.

이 섹션에서는 위치만 확정한다.

### 위치 원칙

- Preview Panel 하단에 걸치지 않는다.
- Modal 전체 중앙이 아니라 Settings Panel 내부의 우측 하단에 배치한다.
- Form의 마지막 Control과 동일한 오른쪽 기준선을 공유한다.

개념:

```css
.action-zone {
  display: flex;
  justify-content: flex-end;
}
```

### Bottom spacing

```text
Action button bottom → Modal edge: 약 22px
```

---

## 2.19 Preview Panel 구조

Preview Panel은 하나의 `Preview Stage`로 취급한다.

```text
Preview Panel
└─ Preview Stage
   └─ Preview Illustration
```

### 기본 정렬

Preview illustration은 Panel의 정중앙보다 **조금 위**에 둔다.

이유:

- 레퍼런스처럼 아래쪽에 자연스러운 여백이 생긴다.
- 시각적 무게 중심이 Form control 높이와 비슷해진다.
- 중앙보다 약간 위에 있을 때 illustration이 설명 영역처럼 보인다.

개념:

```css
.preview-panel {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 132px;
}
```

---

## 2.20 Preview Illustration 최대 크기

552px Preview Panel 기준:

```text
preview width:  460px
preview height: 380~440px
```

권장:

```css
width: min(460px, calc(100% - 64px));
```

좌우 최소 여백:

```text
32px
```

### MUST

Preview illustration이 Panel 경계에 붙지 않는다.

Preview는 실제 UI가 아니라 “형태를 이해시키는 그림”이므로 여백 자체가 중요한 정보 계층이다.

---

## 2.21 좌우 Divider

기본:

```text
No explicit divider
```

즉:

```text
Settings: white
Preview: subtle cool surface
```

배경 차이만으로 분리한다.

단 Theme에서 두 surface 차이가 충분하지 않은 경우:

```css
border-left: 1px solid var(--border-subtle);
```

을 fallback으로 허용한다.

---

## 2.22 Overflow / Scroll 정책

Desktop 기본 상태에서는 Modal 전체가 스크롤되지 않아야 한다.

```text
Modal root       overflow: hidden
Settings Panel   overflow: hidden
Preview Panel    overflow: hidden
```

현재 V1 Form은 모든 항목이 700px 높이에 충분히 들어간다는 전제다.

향후 옵션이 늘어나면:

```text
Header: fixed
Form Zone: scrollable
Action Zone: fixed
```

구조로 확장한다.

### MUST NOT

Dialog 전체 페이지가 위아래로 흔들리게 하지 않는다.

---

## 2.23 Modal 내부 Scroll 확장 규칙

Form이 viewport height를 초과할 경우:

```css
.settings-form-zone {
  overflow-y: auto;
  min-height: 0;
}
```

Header와 Actions는 유지한다.

```text
┌──────────────────────┐
│ Header               │ ← fixed
├──────────────────────┤
│                      │
│ Form                 │ ← scroll
│                      │
├──────────────────────┤
│ Add / Cancel         │ ← fixed
└──────────────────────┘
```

이 구조는 V1에서 당장 scroll이 발생하지 않더라도 architecture 차원에서 유지한다.

---

## 2.24 Open / Close Animation

TickTick식 utility feeling을 위해 Animation은 매우 짧고 절제한다.

### Open

Overlay:

```text
opacity: 0 → 1
duration: 120ms
```

Modal:

```text
opacity: 0 → 1
scale: 0.985 → 1
duration: 140ms
```

Timing:

```text
ease-out
```

### Close

```text
opacity: 1 → 0
scale: 1 → 0.99
duration: 100~120ms
```

### MUST NOT

```text
✕ bounce
✕ spring overshoot
✕ slide from bottom on Desktop
✕ 200ms 이상의 느린 entrance
```

List 생성은 자주 쓰는 utility action이므로 애니메이션 자체가 기다림이 되면 안 된다.

---

## 2.25 Background Interaction Lock

Modal이 열려 있는 동안:

```text
Sidebar interaction   locked
Main interaction      locked
Background scroll     locked
```

하지만 시각적으로는 기존 화면을 유지한다.

즉:

```text
visible ≠ interactive
```

Overlay 뒤의 요소로 pointer event가 전달되면 안 된다.

---

## 2.26 Layering / z-index

개념 hierarchy:

```text
Base app                    z = 0
Sidebar popovers            z = app-layer
Modal overlay               z = modal-overlay
Modal                       z = modal
Modal internal dropdown     z = modal-popover
```

예시 token:

```text
overlay        1000
modal          1010
modal popover  1020
tooltip        1030
```

정확한 숫자는 기존 전역 z-index system에 통합한다.

### MUST

Folder dropdown, Custom Color popup 등 Modal 내부 Popover가 Modal clipping에 잘리지 않아야 한다.

---

## 2.27 Focus Visual Boundary

실제 Focus 동작은 §9에서 다루지만 Layout 차원에서 다음을 보장해야 한다.

- Focus ring이 `overflow: hidden` 때문에 잘리지 않는다.
- Name input의 2px focus ring을 위한 내부 여백을 확보한다.
- View button selected ring이 인접 버튼과 겹치지 않는다.
- Modal 외곽 Radius 때문에 first/last control이 잘리지 않는다.

---

## 2.28 Theme Token 원칙

개별 Component에서 raw color를 반복하지 않는다.

최소 token:

```text
--surface-modal
--surface-modal-preview
--overlay-modal
--border-subtle
--text-primary
--text-secondary
--accent-primary
--shadow-modal
--radius-modal
```

### MUST

Light/Dark theme가 존재한다면 Modal Shell은 전역 token을 통해 자동 대응한다.

TickTick 레퍼런스의 Light Theme 색상을 그대로 hard-code하지 않는다.

---

## 2.29 Desktop Layout Wireframe

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                     SETTINGS 54%                PREVIEW 46%              │
│                                                                          │
│              ┌────────────────────────┬────────────────────────────┐      │
│              │                        │                            │      │
│              │      리스트 추가       │                            │      │
│              │                        │                            │      │
│              │ ┌────────────────────┐ │                            │      │
│              │ │ ☰ │ 리스트 이름   │ │     ┌────────────────┐     │      │
│              │ └────────────────────┘ │     │                │     │      │
│              │                        │     │    Preview     │     │      │
│              │ Color      ● ● ● ●    │     │                │     │      │
│              │                        │     │                │     │      │
│              │ View       [ ][ ][ ]   │     └────────────────┘     │      │
│              │                        │                            │      │
│              │ Folder     [       ▾]  │                            │      │
│              │                        │                            │      │
│              │                        │                            │      │
│              │             Add Cancel │                            │      │
│              └────────────────────────┴────────────────────────────┘      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2.30 Layout Invariants

이후 §3~§8의 세부 Component 설계에서도 다음은 변경하지 않는다.

### INV-L01
Desktop Add List는 중앙 Modal이다.

### INV-L02
Desktop 기본 구조는 Settings / Preview의 2-panel이다.

### INV-L03
Settings Panel이 Preview Panel보다 약간 넓다.

### INV-L04
Header와 Actions는 Settings Panel에만 속한다.

### INV-L05
Name은 Settings content width 전체를 사용한다.

### INV-L06
Name을 제외한 설정 행은 동일한 Label / Control 기준선을 공유한다.

### INV-L07
Preview는 별도 Card가 아니라 Preview Panel 내부 illustration이다.

### INV-L08
좌우 Panel은 강한 divider보다 surface contrast로 구분한다.

### INV-L09
Modal Open 동안 Background는 보이지만 interaction은 차단된다.

### INV-L10
Desktop V1에서는 Modal 전체 scroll이 발생하지 않는 것을 기본으로 한다.

---

## 2.31 Layout Acceptance Criteria

### AC-L01
1440px 이상의 Desktop에서 Modal은 화면 중앙에 표시된다.

### AC-L02
Modal 기본 크기는 약 1200 × 700px이며 viewport를 넘지 않는다.

### AC-L03
Settings/Preview 비율은 약 54:46으로 보인다.

### AC-L04
Settings Panel과 Preview Panel은 배경 surface 차이로 즉시 구분된다.

### AC-L05
제목은 Settings Panel 기준 중앙에 위치한다.

### AC-L06
Name input은 Settings content width 전체를 사용한다.

### AC-L07
Color/View/Folder는 동일한 control 시작선을 가진다.

### AC-L08
Actions는 Settings Panel 우측 하단에 위치한다.

### AC-L09
Preview illustration은 Preview Panel 중앙보다 약간 위에 배치된다.

### AC-L10
Modal 외부 앱 UI는 보이지만 클릭/스크롤할 수 없다.

### AC-L11
Modal Open/Close animation은 150ms 내외로 완료된다.

### AC-L12
Desktop 기본 항목 수에서는 Modal 내부 scroll이 발생하지 않는다.

---

## 2.32 §2에서 의도적으로 미확정한 것

다음은 Shell이 아니라 각 Component의 책임이므로 여기서 확정하지 않는다.

```text
Name input 정확한 height/border/focus style   → §3
Color swatch 크기/팔레트/selected style       → §4
View button 크기/icon/selected style          → §5
Folder dropdown item/creation flow            → §6
Add/Cancel button 상태 및 정확한 크기         → §7
Preview 내부 List/Board/Gantt illustration    → §8
Keyboard focus trap                           → §9
Responsive one-column 전환 breakpoint         → §14
```

이 구분을 유지하여 한 섹션의 변경이 다른 섹션을 불필요하게 흔들지 않도록 한다.
# 3. Name 입력 영역

## 3.1 역할

`Name`은 Add List Modal에서 유일한 필수 입력값이다.

사용자는 이 필드 하나만 채워도 List를 생성할 수 있어야 하며, Modal이 열리는 순간 가장 먼저 상호작용할 수 있어야 한다.

따라서 Name field는 다음 세 역할을 동시에 가진다.

1. **List identity 입력**
2. **Modal의 primary interaction target**
3. **Add button 활성 조건을 결정하는 validation source**

---

## 3.2 기본 구조

TickTick 레퍼런스처럼 Name은 별도 Label을 두지 않고, 입력창 자체가 가장 상위의 Form control로 보이게 한다.

```text
┌──────────────────────────────────────────────────────┐
│  ☰  │  리스트 이름                                  │
└──────────────────────────────────────────────────────┘
```

구조:

```text
ListNameField
├─ Icon Slot
├─ Divider
└─ Text Input
```

### MUST

- Name은 Settings Panel content width 전체를 사용한다.
- 별도 `Name` label을 왼쪽에 두지 않는다.
- Modal Open 직후 Focus는 Name input으로 이동한다.

---

## 3.3 크기

§2에서 정의한 Settings content width:

```text
568px
```

따라서 Name field:

```text
width: 100%
height: 56px
```

권장 값:

```css
.list-name-field {
  width: 100%;
  height: 56px;
  border-radius: 10px;
}
```

### 내부 구조

```text
Icon slot: 56px
Divider:   1px
Input:     remaining width
```

개념:

```css
grid-template-columns: 56px 1px 1fr;
```

---

## 3.4 Icon Slot

기본 아이콘은 List identity를 나타내는 단순 list icon이다.

```text
☰
```

또는 디자인 시스템의 `list` / `menu` 계열 아이콘을 사용한다.

### 크기

```text
icon visual size: 20~22px
icon slot:        56×56px
```

### 상태

V1에서는 **클릭 가능한 Icon Picker로 사용하지 않는다.**

즉:

```text
cursor: default
```

### 이유

Add List의 핵심 결정은 Name / Color / View / Folder다.

아이콘 선택까지 생성 단계에 포함하면 interaction cost가 증가하고, 현재 List identity에 Color가 이미 존재하므로 중복 설정이 된다.

향후 icon customization이 실제 기능으로 추가될 경우 별도 §에서 확장한다.

---

## 3.5 Divider

Icon slot과 input 사이에 얇은 separator를 둔다.

```css
width: 1px;
background: var(--border-subtle);
```

### MUST

- Divider는 focus/hover에서 강해지지 않는다.
- Divider 자체가 별도 interactive element처럼 보여서는 안 된다.

---

## 3.6 Input Padding 및 Typography

권장:

```text
left padding: 14px
right padding: 16px
```

Typography:

```css
font-size: 16px;
font-weight: 400;
line-height: 1.4;
```

입력값과 placeholder의 baseline이 Icon과 시각적으로 중앙 정렬되어야 한다.

### MUST NOT

```text
✕ 18px 이상의 큰 제목형 입력
✕ bold input text
✕ multiline textarea
```

Name은 제목이지만 Modal 안에서는 compact utility input이다.

---

## 3.7 Placeholder

기본 placeholder:

```text
리스트 이름
```

영문 UI:

```text
Name
```

### Placeholder color

```text
text-placeholder
```

권장:

```css
color: rgba(0,0,0,0.34);
```

실제 값은 theme token을 따른다.

### MUST

Placeholder는 validation error 문구 역할을 하지 않는다.

---

## 3.8 초기 Focus

Modal Open:

```text
OPEN_EMPTY
→ Name input autoFocus
```

시각 상태:

```text
FOCUSED_EMPTY
```

Caret이 바로 표시되어 사용자가 클릭하지 않고 입력을 시작할 수 있어야 한다.

### MUST

Modal open animation이 끝난 뒤 focus를 늦게 주지 않는다.

사용자가 Modal이 보이는 즉시 typing을 시작해도 입력이 들어가야 한다.

---

## 3.9 기본 Border

Default state:

```css
border: 1px solid var(--border-subtle);
background: var(--surface-input);
```

TickTick처럼 outline은 가볍게 유지한다.

권장 border contrast:

```text
약 8~12% black equivalent
```

---

## 3.10 Hover State

마우스 hover:

```text
border color slightly stronger
background unchanged
```

권장:

```css
border-color: var(--border-hover);
```

### MUST NOT

```text
✕ background 전체를 회색으로 바꿈
✕ icon slot만 별도 hover
✕ scale animation
```

Name field는 안정적인 text input으로 보여야 한다.

---

## 3.11 Focus State

TickTick 레퍼런스와 가장 유사한 핵심 상태다.

Focus 시:

```text
accent border
```

권장:

```css
border: 2px solid var(--accent-primary);
```

또는 layout shift 방지를 위해:

```css
border: 1px solid var(--accent-primary);
box-shadow: 0 0 0 1px var(--accent-primary);
```

두 번째 방식을 우선 권장한다.

### 이유

2px border로 직접 바꾸면 내부 width/height가 1px씩 변하거나 layout shift가 생길 수 있다.

### MUST

- 전체 field outer boundary가 focus accent를 가져야 한다.
- Input text 영역만 focus outline을 가지면 안 된다.
- Browser default blue outline이 이중으로 보이지 않게 한다.
- 접근성용 focus indicator는 제거하지 않고 디자인 시스템으로 대체한다.

---

## 3.12 Typing State

사용자가 입력 중일 때:

```text
FOCUSED_FILLED
```

상태가 된다.

예:

```text
학교
```

UI 변화는 최소화한다.

```text
✕ 별도 success check 표시하지 않음
✕ 글자 수 counter 기본 표시하지 않음
✕ “사용 가능한 이름입니다” 문구 없음
```

List Name은 username처럼 uniqueness 확인이 필요한 필드가 아니므로 feedback을 과도하게 제공하지 않는다.

---

## 3.13 Value 정규화

입력 도중에는 사용자의 문자열을 그대로 유지한다.

예:

```text
" 학교 "
```

typing 중 즉시 trim하지 않는다.

저장 시점에:

```ts
const normalizedName = name.trim();
```

을 적용한다.

### 이유

typing 중 자동 trim은 caret 위치와 사용자의 입력 경험을 방해할 수 있다.

---

## 3.14 Validation Rule

유효 조건:

```ts
name.trim().length >= 1
```

최대 길이:

```text
80 characters
```

### V1 규칙

```text
1~80자     valid
0자         invalid
공백만      invalid
동일 이름   valid
```

---

## 3.15 Duplicate Name 정책

같은 이름의 List는 허용한다.

예:

```text
학교
학교
```

또는 Folder가 다를 경우:

```text
개인 / 자료
학교 / 자료
```

모두 가능하다.

### 이유

List identity는 `id`가 담당한다.

이름 uniqueness를 강제하면 사용자의 mental model보다 시스템 제약이 앞서게 된다.

### MUST NOT

```text
✕ "이미 존재하는 이름입니다" 오류
✕ 자동 숫자 suffix
✕ 이름 중복 검사 API
```

---

## 3.16 최대 길이

권장:

```text
maxLength = 80
```

### 입력 처리

HTML input의 `maxLength`를 사용해 80자를 넘는 입력 자체를 제한한다.

### Character Counter

기본적으로 표시하지 않는다.

단 70자 이상일 때만 보조적으로:

```text
72 / 80
```

표시하는 옵션은 향후 검토 가능하다.

V1에서는 미표시.

---

## 3.17 특수문자

기본적으로 허용한다.

예:

```text
2026-논문
학교 / 과제
[중요] 해야 할 일
A&B
```

### 금지하지 않는 이유

List 이름은 파일 시스템 경로나 URL slug로 직접 사용하지 않는다.

Routing identity는 List ID를 사용해야 한다.

따라서 불필요한 문자 제한을 두지 않는다.

---

## 3.18 줄바꿈

Name은 single-line input이다.

Enter는 줄바꿈이 아니라 Submit action이다.

Paste로 newline이 들어오면 브라우저 input 특성상 single-line으로 처리되며, 필요 시 newline을 space로 정규화한다.

---

## 3.19 Empty State

값:

```text
""
```

또는:

```text
"    "
```

이면 `OPEN_EMPTY`.

이때:

```text
Add button = disabled
```

Name field 자체에 즉시 빨간 Error border를 표시하지 않는다.

### 이유

Modal Open 직후 빈 Name은 오류 상태가 아니라 정상 초기 상태다.

---

## 3.20 Error 표시 시점

Name validation Error는 **사용자가 명시적으로 생성 시도를 했을 때만** 보여주는 것을 원칙으로 한다.

하지만 Add button은 빈 Name에서 disabled이므로 일반적인 mouse flow에서는 invalid submit 자체가 발생하지 않는다.

Error가 필요한 경우:

- programmatic submit
- 접근성 경로
- unexpected state
- 값이 서버 규칙과 충돌한 경우

### Error UI

```text
┌──────────────────────────────────────────────────────┐
│  ☰  │  ...                                          │
└──────────────────────────────────────────────────────┘
  리스트 이름을 입력하세요.
```

권장:

```text
error text: 13px
top gap: 6px
```

### MUST

Error message가 Form 전체 vertical rhythm을 심하게 흔들지 않도록 아래 공간을 고려한다.

---

## 3.21 Server-side Name Error

일반적인 server error는 Footer/Action area에서 다룬다.

Name field 자체에 표시하는 오류는 **Name과 직접 관련된 경우만** 허용한다.

예:

```text
이름이 너무 깁니다.
사용할 수 없는 이름입니다.
```

네트워크 오류를 Name 아래에 표시하지 않는다.

---

## 3.22 Disabled / Submitting State

`SUBMITTING` 동안:

```text
Name field = disabled
```

시각적으로:

```text
opacity를 지나치게 낮추지 않음
text는 읽을 수 있음
cursor = default
background = subtle disabled surface
```

권장:

```css
opacity: 0.72;
```

또는 opacity 대신 disabled token 사용.

### MUST

사용자가 입력한 Name은 submitting 중에도 그대로 보여야 한다.

---

## 3.23 Autofill

Browser autofill 대상이 아니다.

권장:

```html
autocomplete="off"
```

또는 실제 프레임워크 정책에 맞는 값 사용.

List name은 개인 식별정보나 반복 form value가 아니므로 browser autofill이 UX에 도움되지 않는다.

---

## 3.24 Spellcheck

한국어/영어 혼합 Task naming 특성을 고려해 기본값은:

```html
spellcheck="false"
```

를 권장한다.

### 이유

프로젝트명, 약어, 고유명사가 많을 수 있어 빨간 spellcheck underline이 noise가 될 가능성이 높다.

---

## 3.25 Enter Submit

Name input에서 Enter:

```text
if valid
→ Add action
```

즉:

```text
FOCUSED_FILLED
+ Enter
→ SUBMITTING
```

### Invalid

공백 상태에서 Enter:

```text
no submit
```

필요 시 subtle error feedback만 제공한다.

---

## 3.26 IME Composition

한국어/중국어/일본어 입력에서 Enter는 composition 확정에 사용될 수 있다.

따라서:

```ts
if (event.nativeEvent.isComposing) {
  return;
}
```

또는 equivalent composition guard를 반드시 적용한다.

### MUST

IME composition 완료 Enter와 Submit Enter를 구분한다.

---

## 3.27 Escape

Name field가 Focus되어 있어도:

```text
Esc
→ Modal close
```

단 Autocomplete/Popover가 Name field에 붙는 기능이 향후 생기면:

```text
첫 Esc → child popover close
두 번째 Esc → Modal close
```

규칙을 적용한다.

V1에서는 child popover 없음.

---

## 3.28 Tab

Tab:

```text
Name
→ Color first item
```

Shift + Tab:

```text
Name
→ 이전 focusable item
```

Name은 Modal의 첫 번째 interactive control로 취급한다.

Header에 Close icon이 없으므로 실제 first focus target이 된다.

---

## 3.29 Mouse Interaction

Name field 전체를 클릭하면 input에 Focus한다.

즉 Icon slot이나 Divider 주변 클릭도 가능한 한 input focus로 위임한다.

### 이유

시각적으로 하나의 큰 control로 보이기 때문이다.

### MUST NOT

Icon slot 클릭이 아무 반응 없이 죽은 영역처럼 느껴지지 않게 한다.

구현 방식:

```text
field wrapper click
→ input.focus()
```

단 drag/select behavior를 방해하지 않는다.

---

## 3.30 Text Selection

일반 input behavior를 유지한다.

지원:

```text
double click → 단어 선택
Ctrl/Cmd + A → 전체 선택
Shift + Arrow → selection
```

커스텀 interaction으로 이를 막지 않는다.

---

## 3.31 Paste

Paste 허용.

예:

```text
"졸업 논문 준비"
```

그대로 입력된다.

Paste된 값이 80자를 넘으면 `maxLength` 범위까지 입력한다.

---

## 3.32 Mobile Keyboard

모바일에서는 일반 text keyboard 사용.

```html
inputmode="text"
enterkeyhint="done"
```

를 권장한다.

다만 §14에서 Bottom Sheet 구조가 확정될 때 최종 적용한다.

---

## 3.33 Accessibility Label

시각적 Label이 없으므로 접근성 이름을 반드시 제공한다.

예:

```html
aria-label="리스트 이름"
```

또는 screen-reader-only label 사용.

권장:

```html
<label class="sr-only" for="list-name">
  리스트 이름
</label>
```

### MUST

Placeholder만으로 accessible name을 대체하지 않는다.

---

## 3.34 Error Accessibility

Error가 존재할 경우:

```text
aria-invalid="true"
aria-describedby="list-name-error"
```

를 연결한다.

Error message는 screen reader가 읽을 수 있어야 한다.

---

## 3.35 상태 목록

Name field가 가져야 하는 명시적 UI 상태:

```text
1. DEFAULT_EMPTY
2. HOVER_EMPTY
3. FOCUSED_EMPTY
4. FOCUSED_FILLED
5. BLURRED_FILLED
6. INVALID
7. DISABLED_SUBMITTING
```

별도 `SUCCESS` 상태는 만들지 않는다.

---

## 3.36 상태별 시각 규칙

| 상태 | Border | Background | Text | Add 영향 |
|---|---|---|---|---|
| DEFAULT_EMPTY | subtle | normal | placeholder | disabled |
| HOVER_EMPTY | hover | normal | placeholder | disabled |
| FOCUSED_EMPTY | accent | normal | placeholder + caret | disabled |
| FOCUSED_FILLED | accent | normal | primary | enabled |
| BLURRED_FILLED | subtle | normal | primary | enabled |
| INVALID | danger | normal | primary/placeholder | disabled |
| DISABLED_SUBMITTING | disabled | disabled subtle | primary | submitting |

---

## 3.37 Component Interface

개념적 interface:

```ts
type ListNameFieldProps = {
  value: string;
  disabled?: boolean;
  error?: string | null;

  autoFocus?: boolean;

  onChange: (value: string) => void;
  onSubmit: () => void;
};
```

### MUST NOT

Name component가 직접 List를 생성하거나 navigation을 실행하지 않는다.

이 Component는 input interaction만 담당한다.

---

## 3.38 State Ownership

`name` Draft state는 `CreateListModal` 또는 `CreateListForm` 상위에서 소유한다.

```text
CreateListModal
└─ draft.name
    ↓
ListNameField
```

Name component 내부에는 다음 정도만 local state로 둘 수 있다.

```text
isFocused
isComposing
```

실제 draft value는 상위 source of truth를 유지한다.

---

## 3.39 Validation Function

권장:

```ts
function normalizeListName(value: string) {
  return value.trim();
}

function isValidListName(value: string) {
  const normalized = normalizeListName(value);
  return normalized.length >= 1 && normalized.length <= 80;
}
```

### MUST

UI Add enabled 조건과 실제 submit validation이 같은 함수를 사용해야 한다.

중복 validation logic을 만들지 않는다.

---

## 3.40 Submit Sequence

Name 관점에서 Submit 시:

```text
raw input
   ↓
trim
   ↓
validate
   ↓
payload.name
```

예:

```text
raw = "  학교  "
normalized = "학교"
payload.name = "학교"
```

---

## 3.41 Name Field Wireframe

### Default / Focus

```text
DEFAULT

┌──────────────────────────────────────────────────────┐
│  ☰  │  리스트 이름                                  │
└──────────────────────────────────────────────────────┘


FOCUS

╔══════════════════════════════════════════════════════╗
║  ☰  │  학교|                                        ║
╚══════════════════════════════════════════════════════╝
```

---

## 3.42 TickTick 유사성에서 유지할 요소

TickTick과 유사하게 유지:

```text
✓ 큰 single-line input
✓ 왼쪽 icon slot
✓ icon/input 사이 divider
✓ focus 시 명확한 accent outline
✓ Modal open 즉시 focus
✓ 별도 label 없이 placeholder 중심
```

---

## 3.43 TickTick과 달리 명시적으로 개선할 요소

### A. 접근성 Label

시각적 label은 없더라도 SR label을 제공한다.

### B. IME guard

한글 입력 환경을 고려해 composition Enter를 명확하게 처리한다.

### C. Duplicate 허용 정책 명문화

UI에 uniqueness semantics를 잘못 부여하지 않는다.

### D. wrapper click → input focus

아이콘 영역까지 하나의 input control처럼 느껴지게 한다.

---

## 3.44 Name Invariants

### INV-N01
Name은 Add List의 유일한 required user input이다.

### INV-N02
Modal Open 시 Name이 첫 focus target이다.

### INV-N03
Name은 single-line이다.

### INV-N04
Name은 1~80자의 normalized value를 허용한다.

### INV-N05
공백만 있는 Name은 invalid다.

### INV-N06
동일 이름 List는 허용한다.

### INV-N07
입력 중 자동 trim하지 않는다.

### INV-N08
Submit 직전에 trim한다.

### INV-N09
IME composition Enter는 Submit하지 않는다.

### INV-N10
Submitting 중 Name value는 보존되고 수정만 잠긴다.

---

## 3.45 Name Acceptance Criteria

### AC-N01
Modal이 열리면 Name input에 자동 focus된다.

### AC-N02
Name field는 Settings content width 전체를 사용한다.

### AC-N03
왼쪽에 56px icon slot과 divider가 표시된다.

### AC-N04
Focus 시 field 전체에 accent focus boundary가 표시된다.

### AC-N05
빈 값 또는 공백만 있는 값에서는 Add가 disabled다.

### AC-N06
1자 이상의 유효한 Name을 입력하면 Add가 enabled 된다.

### AC-N07
동일 이름 List가 존재해도 입력/생성이 막히지 않는다.

### AC-N08
80자를 초과하여 입력할 수 없다.

### AC-N09
`"  학교  "`를 입력해 Submit하면 `"학교"`로 저장된다.

### AC-N10
IME composition 중 Enter로 List가 생성되지 않는다.

### AC-N11
유효한 Name에서 composition이 아닌 Enter는 Add와 동일하게 동작한다.

### AC-N12
Submitting 동안 Name은 수정할 수 없지만 입력값은 그대로 보인다.

### AC-N13
Name 관련 Error가 발생하면 input과 error text가 접근성 속성으로 연결된다.

### AC-N14
Icon slot을 포함한 field wrapper 클릭 시 Name input이 focus된다.

---

## 3.46 §3에서 의도적으로 미확정한 것

다음은 다른 섹션에서 확정한다.

```text
Add button enabled/disabled 정확한 visual      → §7
Error 전체 메시지 위치                         → §10
Color와 Name accent 연동                       → §4 / §8
생성 후 Sidebar List title 렌더링              → §11
모바일 Bottom Sheet에서 Name height            → §14
```
# 4. Color 선택 영역

## 4.1 역할

`Color`는 List의 기능적 상태를 나타내는 값이 아니라 **List identity를 빠르게 구분하기 위한 보조 시각 정보**다.

따라서 Color의 의미는 다음으로 제한한다.

> “이 List를 Sidebar, Header, Calendar 등에서 다른 List와 시각적으로 구분하기 위한 identity accent.”

Color는 다음과 혼동되어서는 안 된다.

```text
✕ Task Priority
✕ Task Status
✕ Board Column
✕ Due date urgency
✕ Tag color
```

즉 `List Color`는 **상태가 아니라 소속/정체성**이다.

---

## 4.2 기본 구조

TickTick 레퍼런스처럼 `Color`는 Label + 일렬 Swatch 구조를 사용한다.

```text
색상        ⊘   ●   ●   ●   ●   ●   ●   ●   ●   ◉
```

구조:

```text
ColorSettingRow
├─ Label
└─ ColorPicker
   ├─ None Swatch
   ├─ Preset Swatches
   └─ Custom Swatch
```

§2의 공통 Form alignment를 그대로 따른다.

```text
Label column   = 180px
Gap            = 20px
Control column = 368px
```

---

## 4.3 Label

표시 텍스트:

```text
색상
```

영문:

```text
Color
```

Typography는 다른 setting label과 동일하다.

권장:

```css
font-size: 16px;
font-weight: 500;
line-height: 1.3;
color: var(--text-primary);
```

### MUST

Color만 특별히 더 강조하거나 설명문을 추가하지 않는다.

---

## 4.4 Palette 구성

V1의 기본 Palette는 **None + 8개 preset + Custom**으로 고정한다.

```text
None
Red
Orange
Yellow
Lime
Green
Blue
Indigo
Purple
Custom
```

총 10개 선택지.

### 이유

- TickTick 레퍼런스와 유사한 밀도를 유지한다.
- 너무 많은 색상으로 decision cost가 늘어나는 것을 막는다.
- 주요 색상 계열을 충분히 커버한다.
- Custom은 예외 사용자에게만 제공한다.

---

## 4.5 기본값

초기 Draft:

```ts
color = null
```

즉 기본 selected는 `None`.

### 의미

`None`은 “회색 List”가 아니다.

정확한 의미:

> “사용자 지정 List identity color를 적용하지 않음.”

시스템은 필요 시 neutral token을 사용해 표시할 수 있다.

---

## 4.6 Preset Color Token

색상은 raw hex보다 semantic token/key로 저장한다.

권장 저장값:

```ts
type ListColorPreset =
  | "red"
  | "orange"
  | "yellow"
  | "lime"
  | "green"
  | "blue"
  | "indigo"
  | "purple";
```

Draft:

```ts
type ListColorValue =
  | null
  | { type: "preset"; value: ListColorPreset }
  | { type: "custom"; value: string };
```

### MUST

DB에 `#3B82F6` 같은 raw preset hex만 저장하지 않는다.

이유:

- Theme 교체가 쉬워진다.
- Light/Dark mode별 shade 조정이 가능하다.
- 디자인 시스템 변경 시 migration이 줄어든다.

---

## 4.7 Preset Visual Color

정확한 hex는 전역 token에서 관리한다.

개념적으로:

```text
red      → list-red
orange   → list-orange
yellow   → list-yellow
lime     → list-lime
green    → list-green
blue     → list-blue
indigo   → list-indigo
purple   → list-purple
```

### MUST

Priority/Status용 color token과 이름은 분리한다.

예:

```text
list-blue
priority-high-red
status-done-green
```

같이 의미를 분리한다.

---

## 4.8 Swatch 크기

TickTick 레퍼런스의 밀도를 기준으로:

```text
visual circle: 28px
interaction box: 32px
```

권장:

```css
.color-swatch {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
}

.color-swatch__circle {
  width: 28px;
  height: 28px;
  border-radius: 999px;
}
```

### 이유

시각적 원은 compact하게 유지하면서 클릭 영역은 조금 더 확보한다.

---

## 4.9 Swatch 간격

권장:

```text
gap: 8px
```

Control width 368px 안에 10개 선택지를 한 줄로 배치할 수 있도록 한다.

개념 폭:

```text
10 × 28px + 9 × 8px = 352px
```

interaction box 기준 실제 구현에서는 `gap`과 wrapper width를 조정할 수 있지만 **한 줄 유지**가 우선이다.

### MUST

Desktop에서 Color palette가 두 줄로 wrap되지 않는다.

---

## 4.10 None Swatch

`None`은 TickTick처럼 “색상 없음”을 직관적으로 나타내는 별도 아이콘을 사용한다.

```text
◯
╲
```

즉:

- 내부는 투명/white
- outline은 neutral
- diagonal slash는 accent-neutral

### 기본 visual

```text
circle border
+
diagonal slash
```

### MUST

None을 단순한 회색 원으로 표현하지 않는다.

회색 preset과 의미가 혼동될 수 있기 때문이다.

---

## 4.11 None Selected State

기본값이므로 Modal Open 시 None selected.

Selected 표현:

```text
outer accent ring
```

예:

```text
  ◉
 ╲
```

권장:

```css
box-shadow: 0 0 0 2px var(--accent-primary);
```

실제 None 아이콘 내부 slash 색상은 그대로 유지한다.

---

## 4.12 Preset Swatch Default State

Preset swatch는 기본적으로:

```text
solid circle
no outer border
```

형태다.

예:

```text
●
```

### MUST NOT

```text
✕ 색상명 text
✕ 각 swatch 아래 label
✕ square color chip
```

TickTick처럼 빠르게 색을 고르는 compact visual control을 유지한다.

---

## 4.13 Hover State

Hover 시 선택 가능성을 알려주되 과도한 animation은 사용하지 않는다.

권장:

```css
transform: scale(1.06);
```

또는:

```text
subtle outer neutral ring
```

Transition:

```text
80~100ms
```

### 우선순위

1. hit target 강조
2. color 자체는 변형하지 않음

### MUST NOT

```text
✕ 밝기 크게 변화
✕ swatch가 튀는 bounce
✕ tooltip이 모든 색상에 항상 표시
```

---

## 4.14 Selected State

선택된 색상은 색상 자체만으로 구분하면 안 된다.

따라서 Selected는 반드시 **shape/border signal**을 추가한다.

권장:

```text
outer accent ring
```

예:

```text
   ◉
```

CSS 개념:

```css
box-shadow:
  0 0 0 2px var(--surface-modal),
  0 0 0 4px var(--accent-primary);
```

또는 간단히:

```css
outline: 2px solid var(--accent-primary);
outline-offset: 2px;
```

### 이유

색각 다양성에 대응하고 selected 상태를 명확히 한다.

---

## 4.15 Selected Checkmark

V1에서는 내부 checkmark를 기본으로 사용하지 않는다.

### 이유

- 28px 원 안에서 check가 지나치게 복잡해진다.
- outer ring만으로 충분한 selected signal을 제공할 수 있다.
- TickTick의 compact한 시각 밀도를 유지한다.

단 접근성 테스트에서 구분이 약한 경우 내부 check 추가를 fallback으로 허용한다.

---

## 4.16 Focus State

Keyboard focus는 selected와 구분되어야 한다.

권장:

```text
Focused only:
neutral/high-contrast focus ring

Selected + Focused:
selected accent ring
+
additional focus offset
```

구현 예:

```css
.color-swatch:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}
```

### MUST

마우스 click마다 focus ring이 과도하게 보이지 않도록 `:focus-visible` 사용을 권장한다.

---

## 4.17 Pressed State

Mouse down / Space press:

```text
scale(0.96)
```

정도의 짧은 feedback을 MAY 적용할 수 있다.

duration:

```text
60~80ms
```

필수는 아니다.

---

## 4.18 Custom Swatch

마지막에 `Custom` entry를 둔다.

Visual:

```text
◉
```

단색이 아니라 gradient spectrum circle.

예:

```text
red → yellow → green → cyan → blue → purple
```

### 역할

Preset으로 충분하지 않은 사용자만 추가 색상을 고를 수 있게 한다.

### MUST

Custom swatch가 preset보다 시각적으로 더 중요한 CTA처럼 보여서는 안 된다.

---

## 4.19 Custom Click

Custom swatch 클릭:

```text
Custom Color Popover
```

를 연다.

새 Modal을 띄우지 않는다.

### 이유

현재 Add List Modal이라는 parent context를 유지해야 한다.

구조:

```text
Add List Modal
└─ Color Row
   └─ Custom Swatch
      └─ Color Popover
```

---

## 4.20 Custom Color Popover — V1 범위

V1에서 최소 기능:

```text
Color spectrum / native picker
Hex input
Apply
```

권장 최소 UI:

```text
┌──────────────────────┐
│  Color area          │
│                      │
│  #4F7AF8             │
│                      │
│        Cancel Apply  │
└──────────────────────┘
```

### 중요한 범위 제한

Custom picker 자체의 고급 설계는 Add List 핵심이 아니므로 별도 세부 디자인 시스템을 재정의하지 않는다.

가능하면 기존 전역 ColorPicker component를 reuse한다.

---

## 4.21 Custom Color 저장 형식

Custom만 raw color value 저장을 허용한다.

예:

```ts
{
  type: "custom",
  value: "#4F7AF8"
}
```

### Validation

허용:

```text
#RRGGBB
```

필요 시 alpha는 지원하지 않는다.

### MUST NOT

```text
rgba()
hsl()
named color
```

등 여러 format을 DB에 혼재시키지 않는다.

저장 형식은 canonical HEX로 통일한다.

---

## 4.22 Custom Color 적용 직후

사용자가 custom color를 Apply하면:

```text
color draft = custom value
Custom swatch = selected
```

Custom swatch 자체는 선택한 색상으로 완전히 덮지 않는다.

권장:

```text
gradient ring 유지
+
중앙 작은 dot에 선택 color 표시
```

또는 Custom selected 상태를 outer ring으로만 표현한다.

### 이유

이 swatch가 “custom 선택 진입점”임을 계속 인식할 수 있어야 한다.

---

## 4.23 Custom Color 재편집

Custom이 selected 상태에서 Custom swatch를 다시 클릭하면 기존 값으로 picker를 연다.

예:

```text
current = #4F7AF8
```

→ picker initial value도 `#4F7AF8`.

---

## 4.24 Color 선택 시 즉시 Draft 반영

Color 선택은 별도 Save가 필요 없다.

Preset click:

```text
click blue
→ draft.color = blue
```

None click:

```text
→ draft.color = null
```

Custom Apply:

```text
→ draft.color = custom(...)
```

---

## 4.25 Preview 연동

Color 변경은 Right Preview에 즉시 반영한다.

반영 위치는 제한한다.

예:

```text
Preview header dot
Preview list icon accent
```

### MUST NOT

Preview 전체 배경을 선택 color로 바꾸지 않는다.

Color는 identity accent이므로 작은 시각 요소에만 반영한다.

---

## 4.26 실제 제품 적용 범위

List Color는 생성 후 다음 영역에 반영한다.

### A. Sidebar

```text
● 학교
```

또는 List icon accent.

### B. List Header

```text
● 학교
```

작은 identity indicator.

### C. Calendar

여러 List의 Task가 섞여 보이는 경우 List source를 구분하는 보조 표시.

### D. View identity indicator

필요한 경우 List/View header의 작은 accent.

---

## 4.27 적용하지 않는 영역

### Task Checkbox

List color를 checkbox color로 사용하지 않는다.

### Priority

Priority는 별도 semantic color.

### Status

Status도 별도 semantic color.

### Board Column Header

List Color를 모든 Column에 뿌리지 않는다.

### Page Background

전체 화면 tint를 바꾸지 않는다.

---

## 4.28 Sidebar 표현 우선순위

Sidebar에서 Color 표현 방식은 다음 우선순위를 권장한다.

```text
1. List icon/dot accent
2. selected row background는 기존 accent system
```

즉 List Color를 Sidebar row의 selected background로 쓰지 않는다.

### 이유

List별 색상과 현재 navigation selection 상태를 분리해야 한다.

예:

```text
Blue List
≠
현재 선택된 row의 blue selection state
```

---

## 4.29 Color와 Selection의 충돌 방지

앱의 primary accent가 blue일 경우 `blue List`와 selected outline이 동일해 보일 수 있다.

따라서:

- List color = inner fill
- UI selected = outer ring / control border

처럼 **시각 채널을 분리**한다.

---

## 4.30 Keyboard Navigation 모델

ColorPicker는 radio group semantics를 가진다.

권장 keyboard pattern:

```text
Tab
→ Color group 진입

Left / Right
→ 이전/다음 color

Home
→ None

End
→ Custom

Space / Enter
→ 선택
```

### 권장

Tab으로 10개 Swatch를 하나씩 모두 거치지 않고 **roving tabindex**를 사용한다.

---

## 4.31 Roving Tabindex

예:

```text
selected item    tabindex=0
others           tabindex=-1
```

Keyboard focus가 group에 진입하면 현재 selected color에 위치한다.

Arrow 이동 시:

```text
focus 이동
+
선택은 즉시 변경
```

radio group standard interaction을 따른다.

### 이유

10개 color swatch를 Tab으로 하나씩 지나는 것은 Modal keyboard flow를 지나치게 길게 만든다.

---

## 4.32 선택과 Focus 이동 정책

Arrow key로 Swatch를 이동하면 **즉시 해당 색상을 선택**한다.

즉:

```text
Blue selected
Right Arrow
→ Indigo focus + selected
```

별도 Enter를 요구하지 않는다.

이는 native radio group과 유사한 mental model이다.

Mouse click은 당연히 즉시 선택.

---

## 4.33 Accessibility Semantics

ColorPicker container:

```html
role="radiogroup"
aria-label="리스트 색상"
```

각 swatch:

```html
role="radio"
aria-checked="true|false"
```

Accessible names:

```text
색상 없음
빨강
주황
노랑
라임
초록
파랑
인디고
보라
사용자 지정 색상
```

### MUST

색깔의 시각 정보만으로 접근성 이름을 대체하지 않는다.

---

## 4.34 Tooltip

Mouse user에게 모든 swatch tooltip을 반드시 표시할 필요는 없지만, accessible name과 동일한 label tooltip을 **짧은 hover delay 후** 보여주는 것을 MAY 권장한다.

예:

```text
파랑
```

Custom:

```text
사용자 지정 색상
```

### 이유

색상 이름을 정확히 구분하기 어려운 사용자에게 도움된다.

---

## 4.35 Disabled / Submitting State

`SUBMITTING` 동안 ColorPicker 전체 disabled.

시각:

```text
selected state는 그대로 유지
interaction만 잠금
```

Opacity는 약간 낮출 수 있지만 현재 선택이 읽히지 않을 정도로 흐리게 하지 않는다.

권장:

```text
opacity: 0.72
```

### MUST

Submitting 중에도 어떤 Color가 선택되었는지 알 수 있어야 한다.

---

## 4.36 Error State

Preset Color 선택 자체는 client validation error가 없다.

가능한 Error는 Custom color validation 정도다.

예:

```text
잘못된 HEX
```

Custom picker 내부에서 처리한다.

일반 server create failure는 Color row 아래에 표시하지 않는다.

Draft Color는 유지된다.

---

## 4.37 Theme 대응

Preset token은 Light/Dark theme에서 개별 shade를 다르게 가져갈 수 있다.

예:

```text
blue.light = ...
blue.dark  = ...
```

하지만 저장값:

```text
"blue"
```

는 동일.

Custom HEX는 사용자가 직접 지정한 값이므로 동일하게 유지한다.

### Custom contrast

Dark theme에서 너무 어두운 Custom color가 invisible할 수 있으므로 UI indicator에 neutral outline을 함께 제공한다.

---

## 4.38 Color Contrast 규칙

List Color는 대부분 decorative identity accent이므로 WCAG text contrast를 그대로 요구하지는 않는다.

하지만 다음을 준수한다.

- Color 위에 작은 white text를 올리는 구조를 만들지 않는다.
- selected 여부는 color contrast에만 의존하지 않는다.
- Sidebar indicator는 background와 shape boundary가 구분되어야 한다.

---

## 4.39 None의 실제 렌더링

`color = null`인 List는 UI에서 아무것도 안 보이게 만들 수도 있지만, Sidebar structure 일관성을 위해 neutral icon을 표시하는 것을 권장한다.

예:

```text
☰ 학교
```

Color dot가 필요한 UI에서는:

```text
neutral token
```

사용 가능.

단 사용자에게 “회색이 선택됨”으로 오해되지 않도록 Add List picker에서는 None slash를 사용한다.

---

## 4.40 Re-select 동작

현재 선택된 색상을 다시 클릭해도 상태 변화 없음.

예:

```text
Blue selected
→ Blue click
→ Blue 유지
```

선택 해제 토글 방식은 사용하지 않는다.

색상을 제거하려면 사용자는 명시적으로 `None`을 선택한다.

---

## 4.41 Undo

Add List Modal 내부 Color 변경에 별도 Undo는 제공하지 않는다.

사용자는 `None` 또는 다른 Swatch를 선택해 즉시 변경 가능하다.

생성 전 Draft이므로 별도 history를 만들 필요가 없다.

---

## 4.42 Component Interface

개념적 interface:

```ts
type ListColorPickerProps = {
  value: ListColorValue;
  disabled?: boolean;

  onChange: (value: ListColorValue) => void;
};
```

Custom picker:

```ts
type CustomColorPopoverProps = {
  value?: string;
  onApply: (hex: string) => void;
  onCancel: () => void;
};
```

### MUST NOT

ColorPicker가 직접 List persistence를 실행하지 않는다.

---

## 4.43 State Ownership

Draft Color:

```text
CreateListModal / CreateListForm
└─ draft.color
    ↓
ListColorPicker
```

ColorPicker local state:

```text
focusedIndex
isCustomPopoverOpen
customDraft
```

정도만 허용한다.

실제 selected color는 상위 Draft가 source of truth다.

---

## 4.44 Custom Popover 닫기

Custom picker Open 상태:

```text
Esc
→ Custom Popover close
```

이때 Add List Modal은 유지한다.

다시 Esc:

```text
→ Add List Modal close
```

### Click outside Custom Popover

Modal 내부 다른 영역 click:

```text
→ Custom Popover close
→ Custom draft discard
```

Apply하지 않은 custom value는 List Draft에 반영하지 않는다.

---

## 4.45 Color State 목록

Color control이 지원해야 하는 상태:

```text
1. DEFAULT_NONE_SELECTED
2. PRESET_SELECTED
3. CUSTOM_SELECTED
4. SWATCH_HOVER
5. SWATCH_FOCUS
6. CUSTOM_POPOVER_OPEN
7. DISABLED_SUBMITTING
```

별도 Error state는 Custom picker 내부에서만 처리한다.

---

## 4.46 상태별 시각 규칙

| 상태 | Swatch | Ring | Interaction | Preview |
|---|---|---|---|---|
| None selected | slash circle | accent selected ring | enabled | neutral |
| Preset selected | solid color | accent selected ring | enabled | selected color |
| Custom selected | custom indicator | accent selected ring | enabled | custom color |
| Hover | unchanged color | subtle hover cue | enabled | unchanged |
| Focus | unchanged | focus-visible ring | keyboard | unchanged/selected |
| Popover open | Custom active | active cue | picker enabled | last applied |
| Submitting | preserved | preserved | disabled | preserved |

---

## 4.47 TickTick 유사성에서 유지할 요소

```text
✓ Label + horizontal swatch row
✓ 첫 번째 None option
✓ 원형 color chips
✓ 여러 preset color
✓ 마지막 gradient Custom entry
✓ selected outline
✓ 한 줄 compact layout
```

---

## 4.48 TickTick과 달리 명시적으로 개선할 요소

### A. Semantic token 저장
Preset을 raw hex가 아닌 token key로 저장한다.

### B. Radio group keyboard model
Tab 10번 대신 roving tabindex를 사용한다.

### C. Selection과 Color 분리
selected state를 색깔 자체가 아니라 outer ring으로 표현한다.

### D. 적용 범위 제한
List color가 Status/Priority와 충돌하지 않도록 domain rule을 고정한다.

---

## 4.49 Color Invariants

### INV-C01
Color는 optional이다.

### INV-C02
기본값은 None이다.

### INV-C03
Preset은 semantic token key로 저장한다.

### INV-C04
Custom만 canonical HEX 저장을 허용한다.

### INV-C05
Color는 List identity accent다.

### INV-C06
Color는 Task Priority/Status를 의미하지 않는다.

### INV-C07
Selected 여부는 color 자체만으로 표현하지 않는다.

### INV-C08
Desktop palette는 한 줄을 유지한다.

### INV-C09
Color 변경은 즉시 Draft와 Preview에 반영된다.

### INV-C10
Submitting 동안 selection은 보존되고 interaction만 잠긴다.

### INV-C11
현재 색상 재클릭은 deselect하지 않는다.

### INV-C12
색상을 제거하려면 None을 명시적으로 선택한다.

---

## 4.50 Color Acceptance Criteria

### AC-C01
Modal Open 시 None이 selected 상태다.

### AC-C02
Color row는 `None + 8 preset + Custom` 총 10개 entry를 한 줄로 표시한다.

### AC-C03
Preset swatch visual circle은 약 28px이고 충분한 interaction area를 가진다.

### AC-C04
선택된 색상에는 색상 자체 외에 selected ring이 표시된다.

### AC-C05
Preset 선택 즉시 `draft.color`가 변경된다.

### AC-C06
Color 변경 즉시 Preview의 identity accent가 변경된다.

### AC-C07
선택된 색상을 다시 클릭해도 선택 해제되지 않는다.

### AC-C08
None을 선택하면 `draft.color = null`이 된다.

### AC-C09
Custom을 클릭하면 Add List Modal 위에 별도 Color Popover가 열린다.

### AC-C10
Custom Apply 전에는 custom draft가 List Draft에 반영되지 않는다.

### AC-C11
Custom Apply 후 canonical HEX가 저장 대상 value가 된다.

### AC-C12
Keyboard 사용자는 Arrow key로 swatch를 이동/선택할 수 있다.

### AC-C13
Color group은 radio group semantics를 제공한다.

### AC-C14
Submitting 동안 Color selection은 유지되지만 변경할 수 없다.

### AC-C15
List Color가 Task Priority 또는 Status UI에 자동 전파되지 않는다.

### AC-C16
Sidebar selected state와 List Color가 서로 다른 시각 채널로 구분된다.

---

## 4.51 §4에서 의도적으로 미확정한 것

다음은 이후 섹션에서 확정한다.

```text
View button과 color accent 연동                  → §5 / §8
Folder row와 Color row의 정확한 세로 간격         → §6 최종 조정
Add/Cancel disabled 색상                         → §7
Preview 내부에서 color가 적용되는 정확한 element  → §8
Custom ColorPicker 전역 디자인                   → 기존 디자인 시스템 또는 별도 문서
Dark mode 전체 token 값                          → 전역 Theme 문서
```
# 5. Default View 선택 영역

## 5.1 역할

`Default View`는 새 List를 처음 열었을 때 어떤 표현 방식으로 시작할지를 정하는 설정이다.

이 값은 List의 종류를 정의하지 않는다.

정확한 의미:

> **동일한 List 데이터를 어떤 View로 먼저 보여줄 것인지 결정하는 초기 표시 우선순위**

예:

```text
학교 List
├─ List View
├─ Board View
├─ Calendar View
└─ Gantt View

defaultView = Board
```

이 경우 `학교`는 Board가 아니라 여전히 하나의 List이며, 진입 시 Board View가 우선 활성화될 뿐이다.

---

## 5.2 V1 선택지

TickTick 레퍼런스의 3개 compact view icon 구조를 유지하며 V1에서는 다음 3개를 노출한다.

```text
List
Board
Gantt
```

표시 순서도 고정한다.

```text
List → Board → Gantt
```

### 기본값

```ts
defaultViewType = "list"
```

Modal Open 시 List가 selected 상태다.

---

## 5.3 Calendar를 생성 단계에서 제외하는 이유

Calendar는 제품 전체에서 중요한 View일 수 있지만 Add List 생성 시 선택지에서는 제외한다.

이유:

1. Calendar는 날짜 정보가 없는 새 List에서는 정보 밀도가 낮다.
2. Calendar는 여러 List를 함께 보는 global projection 역할을 가질 수 있다.
3. List 생성과 동시에 “날짜 기반 관리 방식”까지 결정하도록 요구하면 생성 비용이 증가한다.
4. List / Board / Gantt는 동일 Task collection을 구조적으로 보는 세 방식으로 설명하기 쉽다.

따라서:

```text
생성 단계:
List / Board / Gantt

생성 이후:
List / Board / Calendar / Gantt ...
```

구조를 권장한다.

---

## 5.4 기본 구조

§2 공통 setting row grid를 따른다.

```text
기본 보기     [ List ] [ Board ] [ Gantt ]
```

TickTick과 유사하게 **텍스트보다 icon 중심의 square/rounded button**으로 보여준다.

실제 화면:

```text
기본 보기      ┌──────┐  ┌──────┐  ┌──────┐
               │  ☷   │  │  ▥   │  │  ≡   │
               └──────┘  └──────┘  └──────┘
```

시각적으로는 compact control이지만 semantics는 radio group이다.

---

## 5.5 Label

표시:

```text
기본 보기
```

영문:

```text
View
```

한국어 UI에서는 단순히 `보기`보다 **기본 보기**를 권장한다.

이유:

`View` 선택이 List의 type을 바꾸는 것이 아니라 최초 진입 View를 정하는 설정임을 사용자에게 더 정확하게 전달한다.

Typography:

```css
font-size: 16px;
font-weight: 500;
line-height: 1.3;
```

---

## 5.6 버튼 개수와 폭

3개 버튼을 같은 크기로 배치한다.

권장:

```text
button width: 80px
button height: 56px
gap: 16px
```

총 폭:

```text
80 × 3 + 16 × 2 = 272px
```

Control column 368px 안에 충분히 들어간다.

왼쪽 정렬:

```text
View controls start = Color / Folder control start와 동일
```

---

## 5.7 Button Shape

권장:

```css
width: 80px;
height: 56px;
border-radius: 10px;
```

기본 배경:

```text
surface-subtle
```

기본 border:

```text
transparent 또는 very subtle
```

TickTick처럼 작은 utility tile 느낌을 유지한다.

---

## 5.8 Icon만 표시

버튼 안에는 기본적으로 icon만 보여준다.

```text
List   → list-lines icon
Board  → columns icon
Gantt  → timeline-bars icon
```

### 버튼 내부 Text

V1에서는 보이지 않게 한다.

이유:

- TickTick 레퍼런스의 정보 밀도를 유지한다.
- 3개 버튼이 시각적으로 빠르게 구분된다.
- 한국어 label을 넣으면 버튼이 커지고 Form rhythm이 무거워진다.

대신:

```text
Tooltip
aria-label
```

을 반드시 제공한다.

---

## 5.9 Icon 사양

권장 visual size:

```text
22~24px
```

stroke:

```text
1.8~2px
```

### List icon

의미:

```text
세로로 쌓인 task rows
```

### Board icon

의미:

```text
parallel columns
```

### Gantt icon

의미:

```text
offset horizontal timeline bars
```

### MUST

세 icon은 서로 silhouette가 명확히 달라야 한다.

---

## 5.10 Default State

선택되지 않은 버튼:

```css
background: var(--surface-subtle);
border: 1px solid transparent;
color: var(--icon-secondary);
```

TickTick처럼 disabled처럼 흐리지는 않는다.

사용 가능한 선택지임이 보여야 한다.

---

## 5.11 Hover State

Hover:

```text
background slightly stronger
icon slightly darker
```

권장:

```css
background: var(--surface-hover);
color: var(--icon-primary);
```

Transition:

```text
100ms
```

### MUST NOT

```text
✕ scale 크게 증가
✕ 강한 shadow
✕ text label이 갑자기 나타남
```

---

## 5.12 Selected State

Selected는 TickTick처럼 **accent border + subtle accent background + accent icon**을 사용한다.

권장:

```css
background: var(--accent-subtle);
border: 2px solid var(--accent-primary);
color: var(--accent-primary);
```

Layout shift 방지를 위해 실제 구현은 1px border + inner/outer ring을 사용할 수 있다.

예:

```css
border: 1px solid var(--accent-primary);
box-shadow: inset 0 0 0 1px var(--accent-primary);
```

### MUST

선택 상태를 배경색 하나만으로 표현하지 않는다.

---

## 5.13 Focus State

Keyboard focus:

```css
outline: 2px solid var(--focus-ring);
outline-offset: 2px;
```

`:focus-visible` 사용 권장.

### Selected + Focused

두 상태가 동시에 보여야 한다.

예:

```text
inner accent selected border
+
outer focus-visible ring
```

---

## 5.14 Pressed State

Mouse down / Space:

```text
transform: scale(0.98)
```

정도의 subtle feedback MAY 허용.

duration:

```text
60~80ms
```

---

## 5.15 선택 동작

View button click:

```text
click Board
→ draft.defaultViewType = "board"
```

즉시 반영한다.

별도 Apply 없음.

현재 선택된 View를 다시 클릭:

```text
no-op
```

선택 해제하지 않는다.

항상 정확히 하나의 View가 selected 상태여야 한다.

---

## 5.16 Radio Group Semantics

Default View는 기능적으로 radio group이다.

Container:

```html
role="radiogroup"
aria-label="기본 보기"
```

각 button:

```html
role="radio"
aria-checked="true|false"
```

Accessible names:

```text
목록 보기
보드 보기
간트 보기
```

---

## 5.17 Keyboard Navigation

권장 radio group pattern:

```text
Tab
→ 현재 selected View로 진입

Left / Right
→ 이전 / 다음 View

Home
→ List

End
→ Gantt
```

Arrow 이동 시 즉시 선택한다.

예:

```text
List selected
Right
→ Board selected
Right
→ Gantt selected
```

---

## 5.18 Tab 정책

3개 버튼을 각각 Tab stop으로 만들지 않는다.

**roving tabindex** 사용.

예:

```text
selected View tabindex=0
others        tabindex=-1
```

이유:

Modal의 keyboard flow를 짧게 유지한다.

---

## 5.19 Tooltip

Mouse hover 후 짧은 delay:

```text
목록
보드
간트
```

를 표시한다.

권장 delay:

```text
350~500ms
```

Tooltip은 설명용이며 선택 상태를 전달하는 수단이 아니다.

---

## 5.20 Preview 연동

View 변경은 Right Preview의 가장 큰 상태 변화다.

### List 선택

```text
List Preview
```

### Board 선택

```text
Board Preview
```

### Gantt 선택

```text
Gantt Preview
```

전환:

```text
fade out / fade in
120~160ms
```

강한 slide animation은 사용하지 않는다.

---

## 5.21 Preview Transition Sequence

권장:

```text
View select
→ draft update
→ Preview state update
→ illustration crossfade
```

### MUST

View 선택 자체는 animation 완료를 기다리지 않는다.

Preview는 visual feedback일 뿐 selection state의 source of truth가 아니다.

---

## 5.22 View 선택과 실제 생성 시점

중요한 Domain 결정이다.

Modal에서 View button을 선택하는 순간 DB View entity를 생성하지 않는다.

Modal은 Draft만 가진다.

```text
Board click
→ draft.defaultViewType = board
```

실제 persistence는 Add Submit 때 실행한다.

---

## 5.23 생성 Transaction

개념적 sequence:

```text
1. List 생성
2. 선택한 View availability 보장
3. defaultView 연결
4. 성공 응답
```

구현 방식은 앱의 기존 View Registry에 따라 달라질 수 있다.

두 가지 방식 허용:

### 방식 A — View entity를 실제 생성

```text
Create List
→ Create Board View
→ list.defaultViewId = boardView.id
```

### 방식 B — Preset View를 lazy resolve

```text
Create List
→ list.defaultViewType = board
→ first open 시 preset board view resolve
```

단 외부 UX는 동일해야 한다.

---

## 5.24 우선 권장 방식

기존 앱이 View Registry / ViewSpec 중심이라면 **lazy preset resolve**를 우선 권장한다.

이유:

- 새 List마다 불필요한 View row를 다량 생성하지 않아도 된다.
- 기본 View와 사용자 저장 View를 구분하기 쉽다.
- 같은 scope에서 List/Board/Gantt 기본 View를 항상 제공하기 쉽다.

개념:

```text
List scope
├─ preset:list
├─ preset:board
├─ preset:calendar
└─ preset:gantt
```

그리고:

```text
defaultViewType = "board"
```

로 저장.

단 실제 현재 코드 구조가 `defaultViewId` 중심이라면 기존 domain consistency를 우선한다.

---

## 5.25 절대 금지할 모델

```ts
List {
  type: "board"
}
```

또는:

```ts
List {
  layout: "gantt"
}
```

처럼 List identity 자체를 표현 방식과 결합하지 않는다.

### 이유

향후 동일 List에서:

```text
List
Board
Calendar
Gantt
```

를 전환할 수 있어야 하기 때문이다.

---

## 5.26 List View 의미

List View는 가장 기본적인 task collection 표현이다.

Preview 개념:

```text
□ Task
□ Task
□ Task
```

생성 후 기본 진입:

```text
List header
+
flat/grouped task rows
```

구체적인 List View layout은 별도 View 설계 문서의 책임이다.

---

## 5.27 Board View 의미

Board는 동일 Task collection을 status/group column 방식으로 표현한다.

생성 직후 빈 List라면 최소 default columns를 보여줄 수 있다.

예:

```text
TODO
DOING
DONE
```

단 Add List Modal에서 Column configuration을 요구하지 않는다.

### MUST

Board 선택이 “Status workflow를 지금 설정하라”는 의미가 되지 않도록 한다.

---

## 5.28 Gantt View 의미

Gantt는 동일 Task collection을 시간축에 표현한다.

새 List가 비어 있거나 Task에 날짜가 없더라도 View 자체는 열릴 수 있어야 한다.

Empty state 예:

```text
작업에 시작일과 종료일을 추가하면
타임라인에 표시됩니다.
```

### MUST

Gantt 선택 가능 여부를 Task date 존재 여부와 연결하지 않는다.

---

## 5.29 Gantt 생성 단계 노출 조건

Gantt가 제품에서 실제 안정적으로 구현되어 있는 경우에만 생성 Modal에 노출한다.

만약 아직 Preview 수준이거나 기능 미완성이라면:

```text
✕ disabled Gantt button을 노출
```

하기보다 아예 선택지에서 제거하는 것을 권장한다.

### 원칙

> 존재하지 않는 기능을 TickTick과 비슷해 보이기 위해 노출하지 않는다.

---

## 5.30 Premium / Locked 표현

현재 제품에서 유료 제한이 없다면 crown/lock icon을 표시하지 않는다.

TickTick 레퍼런스의 premium crown은 모사 대상이 아니다.

향후 실제 plan restriction이 생긴 경우에만 별도 entitlement UX를 설계한다.

---

## 5.31 Disabled 상태

기능 자체가 사용 가능한 상황에서는 View button을 임의로 disabled하지 않는다.

Submitting 동안만 group 전체 disabled.

시각:

```text
selected state 유지
interaction만 잠금
opacity slightly lower
```

---

## 5.32 Error 상태

View 선택 자체는 client error를 만들지 않는다.

실제 생성 과정에서 View resolve/create가 실패한 경우:

```text
전체 List 생성 실패
→ ERROR state
→ Draft 유지
```

로 처리한다.

### MUST

List는 생성됐는데 default View 연결만 실패한 “반쪽 성공” 상태를 사용자에게 노출하지 않는다.

가능하면 transaction/rollback 또는 idempotent recovery를 사용한다.

---

## 5.33 Atomicity 원칙

UX 관점에서는:

```text
List + default View
```

를 하나의 생성 결과로 취급한다.

### 성공

```text
둘 다 사용 가능
```

### 실패

```text
Modal 유지 + Retry
```

사용자가 orphan List를 Sidebar에서 발견하게 만들지 않는다.

---

## 5.34 Default View와 URL

Modal Open 중에는 URL 변경 없음.

생성 성공 후:

```text
new List selected
→ selected default View에 맞는 route/state
```

로 진입한다.

예:

```text
/list/:listId?view=board
```

또는 기존 앱의 tab route 규칙.

정확한 URL schema는 기존 routing 문서를 따른다.

---

## 5.35 생성 후 View Switcher

생성 이후 사용자는 Default View에 갇히지 않는다.

예:

```text
학교

[List] [Board] [Calendar] [Gantt]
```

즉 `default`는 preference이지 restriction이 아니다.

사용자가 다른 View로 전환 가능해야 한다.

---

## 5.36 Default View 변경 이후

Add List 설계 범위 밖이지만 domain consistency를 위해 다음 정책을 권장한다.

사용자가 생성 후 List settings에서 default View를 변경할 수 있다.

예:

```text
List Settings
→ Default View
→ Board
```

하지만 단순히 현재 tab을 Board로 전환했다고 해서 자동으로 default View가 바뀌지는 않는다.

### 이유

```text
currentView
≠
defaultView
```

를 분리해야 예측 가능하다.

---

## 5.37 View Color와 List Color 관계

View button의 selected accent는 **앱 primary accent**를 사용한다.

List Color를 사용하지 않는다.

예:

```text
List Color = orange
Selected View button border = app accent blue
```

### 이유

View 선택 상태와 List identity를 분리한다.

---

## 5.38 Preview Color 관계

Preview 안에서는:

```text
View type
+
List identity color
```

둘 다 표현 가능하다.

예:

```text
Board preview
header dot = orange
layout = board
```

하지만 View tile 자체의 selected outline은 app accent 유지.

---

## 5.39 상태 목록

Default View control 상태:

```text
1. LIST_SELECTED_DEFAULT
2. BOARD_SELECTED
3. GANTT_SELECTED
4. VIEW_HOVER
5. VIEW_FOCUS
6. DISABLED_SUBMITTING
```

별도 invalid state 없음.

---

## 5.40 상태별 시각 규칙

| 상태 | Background | Border | Icon | Preview |
|---|---|---|---|---|
| Unselected | subtle | transparent | secondary | unchanged |
| Hover | hover | subtle/none | primary | unchanged |
| Selected | accent-subtle | accent | accent | selected View |
| Focus | state 유지 | focus ring | state 유지 | unchanged |
| Selected + Focus | accent-subtle | accent + focus | accent | selected View |
| Submitting | preserved | preserved | preserved | preserved |

---

## 5.41 Component Interface

개념:

```ts
type DefaultViewType =
  | "list"
  | "board"
  | "gantt";

type DefaultViewPickerProps = {
  value: DefaultViewType;
  disabled?: boolean;

  availableViews?: DefaultViewType[];

  onChange: (view: DefaultViewType) => void;
};
```

### availableViews

제품 기능 상태에 따라:

```ts
["list", "board", "gantt"]
```

또는:

```ts
["list", "board"]
```

로 구성 가능.

### MUST

사용 불가능한 View를 hard-code해 disabled로 노출하지 않는다.

---

## 5.42 State Ownership

상위 Draft:

```text
CreateListModal
└─ draft.defaultViewType
    ↓
DefaultViewPicker
```

local state는 최대:

```text
focusedView
```

정도.

View picker가 DB나 Router를 직접 호출하지 않는다.

---

## 5.43 View Registry Integration Contract

Add List는 View 구현 세부사항을 몰라야 한다.

권장 boundary:

```ts
getAvailableDefaultViews(): DefaultViewType[]

resolveDefaultView({
  listId,
  type
})
```

또는 기존 View Registry API를 재사용한다.

### MUST

UI layer가:

```text
if board then create columns...
if gantt then create timeline...
```

같은 domain branching을 직접 가지지 않는다.

---

## 5.44 Feature Availability

Modal이 열릴 때 사용 가능한 View 목록은 현재 제품 기능 상태를 기준으로 이미 결정되어 있어야 한다.

동적으로 remote entitlement를 기다리며 Tile이 흔들리는 UX는 피한다.

가능하면 앱 bootstrap / feature config에서 resolve한다.

---

## 5.45 TickTick 유사성에서 유지할 요소

```text
✓ 한 행에 3개의 compact view tile
✓ icon-only control
✓ selected tile의 강한 accent outline
✓ unselected tile의 neutral background
✓ Name/Color보다 낮지만 Folder보다 시각적으로 눈에 띄는 위치
✓ 변경 즉시 Preview 반영
```

---

## 5.46 TickTick과 달리 명시적으로 개선할 요소

### A. `기본 보기`라는 명칭
View가 List type으로 오해되지 않게 한다.

### B. View domain 분리
List entity와 presentation mode를 결합하지 않는다.

### C. Keyboard radio semantics
Arrow key와 roving tabindex를 지원한다.

### D. 미완성 기능 숨김
Premium/disabled tile을 장식처럼 두지 않는다.

### E. Atomic create
List와 default View 연결의 반쪽 성공을 사용자에게 노출하지 않는다.

---

## 5.47 View Invariants

### INV-V01
Default View는 정확히 하나가 항상 선택되어 있다.

### INV-V02
기본값은 List다.

### INV-V03
View 선택은 List type을 변경하지 않는다.

### INV-V04
View 변경은 즉시 Draft와 Preview에 반영된다.

### INV-V05
View tile selected 상태는 List Color가 아니라 app accent를 사용한다.

### INV-V06
Modal에서 View를 선택하는 순간 persistence하지 않는다.

### INV-V07
실제 View 연결/resolve는 Add Submit 과정에서 처리한다.

### INV-V08
생성 후 사용자는 다른 View로 자유롭게 전환할 수 있다.

### INV-V09
현재 View 전환은 default View preference를 자동 변경하지 않는다.

### INV-V10
미구현 View는 disabled tile로 노출하지 않는다.

---

## 5.48 View Acceptance Criteria

### AC-V01
Modal Open 시 List View가 selected 상태다.

### AC-V02
View row에는 사용 가능한 View tile이 왼쪽부터 List → Board → Gantt 순서로 표시된다.

### AC-V03
각 tile은 약 80×56px이고 icon 중심으로 표시된다.

### AC-V04
선택된 tile은 accent border/background/icon을 가진다.

### AC-V05
선택되지 않은 tile은 neutral surface를 가진다.

### AC-V06
View tile click 즉시 `draft.defaultViewType`이 변경된다.

### AC-V07
View 변경 즉시 Preview illustration이 해당 View로 전환된다.

### AC-V08
현재 selected tile을 다시 클릭해도 deselect되지 않는다.

### AC-V09
Keyboard 사용자는 Left/Right Arrow로 View를 이동/선택할 수 있다.

### AC-V10
View group은 radio group accessibility semantics를 제공한다.

### AC-V11
Submitting 동안 selected View는 유지되지만 변경할 수 없다.

### AC-V12
View 선택 시 DB write가 발생하지 않는다.

### AC-V13
생성 성공 후 선택한 default View가 자동으로 열린다.

### AC-V14
생성 후 사용자는 다른 View로 전환할 수 있다.

### AC-V15
List entity의 type 값으로 Board/Gantt를 저장하지 않는다.

### AC-V16
미구현 View는 Add List Modal에 노출되지 않는다.

---

## 5.49 §5에서 의도적으로 미확정한 것

다음은 다른 섹션에서 확정한다.

```text
Folder dropdown 구조 및 context inheritance        → §6
Add 버튼 submit transaction 세부                   → §7 / §10
Preview의 List/Board/Gantt illustration 세부       → §8
전체 keyboard focus order                          → §9
실패 시 rollback/idempotency 세부                   → §10 / §12
View Registry 실제 타입/API                        → §13 / §15
Responsive에서 tile 축소/배치                       → §14
```
# 6. Folder 선택 영역

## 6.1 역할

`Folder`는 새 List의 **Sidebar 상위 위치**를 결정한다.

Folder는 List의 데이터 의미나 View 방식을 바꾸는 값이 아니라 **탐색 계층과 정리 위치**를 결정하는 navigation metadata다.

정확한 의미:

> “새 List가 Sidebar에서 어느 Folder 아래에 배치될 것인가.”

예:

```text
Folder = None

Lists
├─ 학교
├─ 개인
└─ 새 List
```

```text
Folder = 대학원

대학원
├─ 논문
├─ 수업
└─ 새 List
```

---

## 6.2 기본 구조

TickTick 레퍼런스처럼 단일 Select field 형태로 제공한다.

```text
폴더        ┌──────────────────────────────┐
            │ 없음                     ▾ │
            └──────────────────────────────┘
```

§2의 공통 Form grid를 따른다.

```text
Label column   = 180px
Gap            = 20px
Control column = 368px
```

---

## 6.3 Label

표시:

```text
폴더
```

영문:

```text
Folder
```

Typography는 다른 setting label과 동일하다.

```css
font-size: 16px;
font-weight: 500;
line-height: 1.3;
```

---

## 6.4 기본값

Folder 기본값은 **진입 Context에 따라 결정**한다.

### A. `Lists +`에서 진입

```ts
folderId = null
```

표시:

```text
없음
```

### B. 특정 Folder의 `+`에서 진입

예:

```text
대학원                                  +
  논문
  수업
```

`대학원 +` 클릭 시:

```ts
folderId = universityFolderId
```

표시:

```text
대학원
```

### 핵심 원칙

> **생성 Context는 기본값을 제안하지만 사용자의 선택을 잠그지 않는다.**

즉 Folder +에서 진입했더라도 Modal 안에서 `없음` 또는 다른 Folder를 선택할 수 있다.

---

## 6.5 Context Inheritance

진입 API 개념:

```ts
openCreateListModal({
  contextFolderId
})
```

초기 Draft:

```ts
folderId: contextFolderId ?? null
```

### MUST

Modal이 열린 후 Sidebar selection이 바뀌더라도 초기 Draft folder가 자동으로 따라 바뀌지 않는다.

Modal Open 시점의 context를 snapshot으로 사용한다.

### 이유

Modal을 여는 순간 사용자는 하나의 생성 Draft를 시작한 것이다.

Background navigation state와 Draft가 계속 동기화되면 예측 가능성이 떨어진다.

---

## 6.6 Select Field 크기

권장:

```text
width: 368px
height: 50px
```

CSS:

```css
.folder-select-trigger {
  width: 100%;
  height: 50px;
  border-radius: 10px;
}
```

Control column 전체 폭을 사용한다.

---

## 6.7 Trigger 내부 구조

```text
┌────────────────────────────────────────┐
│ 대학원                              ▾ │
└────────────────────────────────────────┘
```

구조:

```text
FolderSelectTrigger
├─ Selected Label
└─ Chevron
```

### Padding

권장:

```text
left: 14px
right: 14px
```

### Chevron

```text
16~18px
```

Dropdown Open 시 MAY 180° 회전.

Transition:

```text
100ms
```

---

## 6.8 Trigger Default State

기본:

```css
background: var(--surface-input);
border: 1px solid var(--border-subtle);
color: var(--text-primary);
```

`없음`도 일반 selected value처럼 표시한다.

Placeholder처럼 흐리게 만들지 않는다.

### 이유

`없음`은 미선택 상태가 아니라 **유효한 실제 선택값**이다.

---

## 6.9 Trigger Hover State

Hover:

```css
border-color: var(--border-hover);
background: var(--surface-input);
```

Color 변화는 subtle하게 유지한다.

---

## 6.10 Trigger Focus State

Keyboard focus:

```css
outline: 2px solid var(--focus-ring);
outline-offset: 1px;
```

Mouse click에서는 과도한 focus ring이 보이지 않도록 `:focus-visible`을 권장한다.

---

## 6.11 Trigger Open State

Dropdown Open:

```text
border = accent/subtle active
chevron = up
```

권장:

```css
border-color: var(--accent-primary);
```

단 selected value 자체의 색은 바꾸지 않는다.

---

## 6.12 Dropdown 위치

Dropdown은 Trigger 바로 아래에 anchored 된다.

```text
Trigger
┌──────────────────────────────┐
│ 대학원                    ▾ │
└──────────────────────────────┘
  ↓ 6px
┌──────────────────────────────┐
│ ✓ 없음                       │
│   학교                       │
│   대학원                     │
│   개인                       │
│                              │
│ ──────────────────────────── │
│ + 새 폴더                    │
└──────────────────────────────┘
```

권장 offset:

```text
6px
```

---

## 6.13 Dropdown Width

기본:

```text
width = trigger width = 368px
```

MUST:

- Dropdown이 Trigger보다 좁지 않는다.
- Folder 이름이 길다고 Dropdown width가 동적으로 크게 늘어나지 않는다.
- 긴 이름은 ellipsis 처리한다.

---

## 6.14 Dropdown 최대 높이

권장:

```text
max-height: 320px
```

초과 시 내부 scroll.

구조:

```text
Dropdown
├─ Optional Search
├─ Folder List Scroll Area
└─ New Folder Action
```

`+ 새 폴더`는 가능하면 scroll area 밖 footer처럼 유지한다.

---

## 6.15 Dropdown Surface

권장:

```css
background: var(--surface-popover);
border: 1px solid var(--border-subtle);
border-radius: 10px;
box-shadow: var(--shadow-popover);
```

Modal 안에 존재하지만 Modal Surface와 분명히 구분되는 floating layer여야 한다.

---

## 6.16 Folder Item 구조

기본 item:

```text
✓ 없음
  학교
  대학원
  개인
```

각 item:

```text
height: 40px
horizontal padding: 12px
```

구조:

```text
FolderItem
├─ Check Slot
└─ Folder Name
```

Check slot을 고정 폭으로 두어 selected/unselected item의 text 시작선을 맞춘다.

권장:

```text
check slot: 24px
```

---

## 6.17 None Item

Dropdown 첫 항목은 항상:

```text
없음
```

으로 고정한다.

의미:

```ts
folderId = null
```

### MUST

`없음`을 Folder 목록 맨 아래에 두지 않는다.

상위 계층 없음은 가장 기본적인 선택이므로 첫 항목에 둔다.

---

## 6.18 Folder 정렬

V1 기본 정렬:

> **Sidebar에서 보이는 Folder 순서와 동일한 순서**

즉 자동 가나다순/알파벳순으로 다시 정렬하지 않는다.

### 이유

사용자가 Sidebar에서 이미 익숙한 순서를 Dropdown에서도 그대로 보게 해야 한다.

### MUST NOT

```text
✕ Dropdown만 alphabetic sort
✕ 최근 사용 Folder 우선으로 자동 재정렬
```

---

## 6.19 Selected Item

현재 선택된 Folder:

```text
✓ 대학원
```

Check icon으로 표시한다.

### MUST

selected state를 배경색만으로 표현하지 않는다.

권장:

```text
check
+
subtle selected background
```

---

## 6.20 Hover Item

Hover:

```css
background: var(--surface-hover);
```

텍스트 색은 그대로 유지한다.

### MUST NOT

Folder identity color가 있더라도 hover background로 사용하지 않는다.

---

## 6.21 Keyboard Focus Item

Keyboard focus/highlight:

```text
active descendant background
```

Hover와 유사한 surface를 사용해도 되지만 focus-visible boundary 또는 active item semantics를 명확히 한다.

---

## 6.22 Click Selection

Folder item click:

```text
draft.folderId = selectedFolderId
dropdown close
focus → trigger
```

None click:

```text
draft.folderId = null
dropdown close
focus → trigger
```

별도 Apply 버튼 없음.

---

## 6.23 현재 Folder 재선택

현재 선택된 Folder를 다시 클릭하면:

```text
value unchanged
dropdown close
```

no-op 후 close.

---

## 6.24 Search 노출 기준

Folder 수가 적을 때 Search는 불필요하다.

V1 규칙:

```text
folder count <= 8
→ Search 숨김

folder count >= 9
→ Search 표시
```

### 이유

작은 목록에서 검색 input은 오히려 interaction cost와 시각적 noise를 만든다.

---

## 6.25 Search 구조

Folder가 9개 이상일 때 Dropdown 상단:

```text
┌──────────────────────────────┐
│ 🔍 폴더 검색                 │
├──────────────────────────────┤
│ 없음                         │
│ 학교                         │
│ 대학원                       │
│ ...                          │
```

### Search 범위

Folder name만 검색한다.

List 이름까지 검색하지 않는다.

---

## 6.26 Search Matching

기본:

```text
case-insensitive substring match
```

한국어는 입력 문자열 포함 기준.

예:

```text
검색: "대학"
→ 대학원
→ 대학원 연구
```

고급 fuzzy search는 V1에서 필요 없다.

---

## 6.27 Search 중 None

`없음` 항목은 Search query가 존재해도 상단에 고정 노출하는 것을 권장한다.

### 이유

사용자가 Folder 배치를 취소하고 root로 보내고 싶을 때 항상 접근 가능해야 한다.

---

## 6.28 Empty Search Result

예:

```text
일치하는 폴더가 없습니다.
```

그리고 아래 `+ 새 폴더`는 계속 표시한다.

검색 문자열을 그대로 새 Folder 이름으로 prefill하는 MAY 옵션을 허용한다.

예:

```text
검색: "프로젝트 A"
→ + "프로젝트 A" 폴더 만들기
```

단 V1에서는 단순 `+ 새 폴더`만으로도 충분하다.

---

## 6.29 새 Folder 생성 진입

Dropdown footer:

```text
+ 새 폴더
```

를 제공한다.

클릭하면 새 Modal을 띄우지 않는다.

Dropdown 내부를 **inline create mode**로 전환한다.

---

## 6.30 Inline Create Mode

기본:

```text
┌──────────────────────────────┐
│ 없음                         │
│ 학교                         │
│ 대학원                       │
│                              │
│ ──────────────────────────── │
│ + 새 폴더                    │
└──────────────────────────────┘
```

클릭 후:

```text
┌──────────────────────────────┐
│ 새 폴더 이름                 │
│ [________________________]   │
│                              │
│               취소   생성    │
└──────────────────────────────┘
```

또는 footer 내부 compact 형태:

```text
[새 폴더 이름____________]
                취소  생성
```

### 권장

Dropdown 전체를 별도 page처럼 바꾸기보다 **footer area가 inline editor로 확장**되는 방식을 우선한다.

---

## 6.31 New Folder Input

규칙:

```text
required
trim
1~80 chars
duplicate allowed 여부 = 기존 Folder domain 규칙 따름
```

Folder name 정책은 Add List에서 새로 정의하지 않고 기존 Folder 생성 규칙을 재사용한다.

### MUST

Folder 생성 validation logic을 별도로 복제하지 않는다.

---

## 6.32 Folder 생성 성공 후

성공:

```text
New Folder persisted
→ folder list refresh
→ draft.folderId = newFolder.id
→ dropdown close
→ trigger displays newFolder.name
```

즉 새 Folder를 만든 이유가 List 배치이므로 생성 직후 자동 선택한다.

---

## 6.33 Folder 생성 실패

실패:

```text
inline create mode 유지
input 유지
error 표시
```

Add List Modal 자체는 닫지 않는다.

List Draft도 유지한다.

### MUST

Folder 생성 실패가 Add List 전체 Draft를 초기화하지 않는다.

---

## 6.34 Folder 생성 중

`Creating Folder...`

상태에서는 inline editor의:

```text
input disabled
create disabled/loading
cancel disabled 또는 정책에 따라 잠금
```

중복 Folder 생성 방지.

---

## 6.35 Folder 생성과 Add List Submit 관계

Inline Folder 생성이 진행 중인 동안 Add List Submit은 허용하지 않는다.

### 이유

`folderId`가 아직 확정되지 않은 상태이므로 List가 예상하지 않은 위치에 생성될 수 있다.

즉:

```text
folderCreateStatus = submitting
→ Add disabled
```

---

## 6.36 Dropdown Keyboard Navigation

Trigger:

```text
Enter / Space / ArrowDown
→ Dropdown open
```

Dropdown open 후:

```text
ArrowDown
→ 다음 item

ArrowUp
→ 이전 item

Home
→ None

End
→ 마지막 Folder 또는 New Folder action 전 item

Enter / Space
→ select

Esc
→ dropdown close
```

---

## 6.37 Search가 있을 때 Keyboard

Dropdown Open 시 Search가 표시되는 경우:

```text
focus → Search input
```

ArrowDown:

```text
Search
→ first selectable item
```

Esc:

```text
query가 있으면 MAY query clear
또는 dropdown close
```

V1에서는 단순하게:

```text
Esc → Dropdown close
```

로 고정한다.

---

## 6.38 Inline Create Keyboard

새 Folder mode:

```text
Enter
→ 유효하면 Folder 생성

Esc
→ inline create 취소
→ 기존 Dropdown list 복귀
```

IME composition guard는 Name과 동일하게 적용한다.

---

## 6.39 Tab 정책

Folder Select는 Modal 전체 Tab sequence에서 하나의 main stop으로 취급한다.

Dropdown 내부 item을 Tab으로 순회시키기보다 Arrow navigation을 사용한다.

### 이유

Native select/listbox mental model을 유지한다.

---

## 6.40 Accessibility Semantics

Trigger:

```html
role="combobox"
aria-expanded="true|false"
aria-controls="folder-listbox"
```

List:

```html
role="listbox"
```

Items:

```html
role="option"
aria-selected="true|false"
```

Search가 존재하면 accessible label:

```text
폴더 검색
```

---

## 6.41 Folder 이름 Ellipsis

Trigger:

```text
아주 긴 폴더 이름입니다...
```

Dropdown item도 한 줄 ellipsis.

### Tooltip

긴 이름이 잘린 경우 hover/focus tooltip으로 전체 이름을 볼 수 있어야 한다.

---

## 6.42 Empty Folder State

Folder가 하나도 없으면:

```text
없음
────────────────
+ 새 폴더
```

만 표시한다.

불필요하게:

```text
"폴더가 없습니다"
```

라는 별도 empty illustration을 넣지 않는다.

Compact utility dropdown을 유지한다.

---

## 6.43 Folder가 하나뿐인 경우

예:

```text
없음
학교
────────────
+ 새 폴더
```

일반 Dropdown과 동일하게 동작한다.

Folder 수에 따라 interaction pattern을 바꾸지 않는다.

---

## 6.44 Folder 삭제 동시성

Modal이 열린 후 selected Folder가 다른 UI/동기화로 삭제될 수 있다.

예:

```text
draft.folderId = A
A deleted externally
```

Submit 전에 validation:

```text
folder still exists?
```

확인한다.

---

## 6.45 Selected Folder가 삭제된 경우

권장 처리:

```text
draft.folderId → null
trigger → 없음
non-blocking notice
```

예:

```text
선택한 폴더가 없어져 '없음'으로 변경했습니다.
```

### MUST

존재하지 않는 folderId로 List 생성을 시도하지 않는다.

---

## 6.46 Folder 권한 변경

협업 기능이 있는 경우 Modal Open 이후 Folder에 List 생성 권한이 사라질 수 있다.

Submit 시 domain validation에서 권한을 다시 확인한다.

실패하면:

```text
ERROR
Draft 유지
Folder row에 관련 오류 또는 전체 오류 표시
```

권한 모델이 없다면 이 규칙은 dormant requirement로 둔다.

---

## 6.47 Folder Move와 Context

Modal Open 후 Folder 자체의 위치가 Sidebar에서 이동해도 `folderId`가 유지되는 한 Draft는 유효하다.

이름 변경도 동일.

예:

```text
대학원 → 대학원 연구
```

ID는 동일하므로 Trigger label만 최신 이름으로 갱신할 수 있다.

### 원칙

identity는 ID, 표시값은 최신 name.

---

## 6.48 Folder 삭제 vs 이름 변경

정리:

```text
rename
→ same ID
→ selection 유지

reorder
→ same ID
→ selection 유지

move
→ same ID
→ selection 유지

delete
→ ID invalid
→ fallback None
```

---

## 6.49 Folder Color/Icon

Folder에 자체 색상/아이콘이 있더라도 Add List Dropdown에서는 기본적으로 Folder name 중심으로 표시한다.

MAY:

```text
📁 학교
```

같은 neutral folder icon 사용.

### MUST NOT

Folder마다 강한 색상 chip을 추가해 Color row와 경쟁하게 만들지 않는다.

---

## 6.50 Nested Folder 정책

현재 제품이 Folder 1-depth 구조라면 Dropdown도 flat list로 유지한다.

향후 nested Folder를 지원한다면:

```text
학교
  ├─ 수업
  └─ 논문
```

계층 indentation을 반영해야 한다.

하지만 Add List 설계에서 새로운 nested Folder 기능을 만들지는 않는다.

### V1 권장

```text
1-depth Folder
```

기준으로 설계.

---

## 6.51 Folder와 Workspace/Space 관계

Folder는 현재 List가 생성되는 scope 안에서만 선택 가능해야 한다.

예:

```text
Current Space = Personal
```

이면 다른 Space의 Folder를 Dropdown에 섞지 않는다.

### MUST

Folder dropdown query는 current creation scope로 제한한다.

---

## 6.52 Invalid Cross-Scope Folder

contextFolderId가 현재 Space와 불일치하면:

```text
folderId = null
```

fallback.

개발 환경에서는 invariant violation logging을 권장한다.

---

## 6.53 Sort Order Integration

List 생성 성공 시:

```text
folderId = selectedFolderId
sortOrder = 해당 container 마지막
```

즉 Folder 선택은 parent container를 정하고, sortOrder는 그 container 안에서 결정한다.

### MUST NOT

Folder picker에서 직접 순서를 선택하게 하지 않는다.

---

## 6.54 Preview와 Folder 관계

Folder 변경은 Right Preview에 반영하지 않는다.

### 이유

Preview의 목적은 List 자체의 시각적 표현 방식(Name/Color/View)을 보여주는 것이다.

Folder는 Sidebar navigation 위치이므로 Preview UI와 직접 관계가 없다.

---

## 6.55 Trigger 표시 우선순위

선택값 표시:

```text
없음
또는
Folder Name
```

Folder path 전체를 표시하지 않는다.

예:

```text
Workspace / 대학원 / 논문
```

처럼 길게 표시하지 않는다.

현재 V1에서는 Folder name만 표시한다.

---

## 6.56 Clear 버튼

별도 `×` clear icon은 제공하지 않는다.

Folder를 제거하려면 Dropdown에서 `없음`을 선택한다.

### 이유

None이 이미 명시적 option이므로 별도 clear action은 중복이다.

---

## 6.57 Dropdown 외부 Click

Dropdown open 상태에서 Modal 내부 다른 곳 click:

```text
dropdown close
```

Add List Modal은 유지.

Modal Overlay click:

```text
dropdown close
Modal 유지
```

§1의 Overlay rule을 따른다.

---

## 6.58 Dropdown z-index / Clipping

Dropdown은 Modal 내부 popover layer를 사용한다.

MUST:

- Settings Panel `overflow` 때문에 잘리지 않는다.
- Preview Panel 뒤로 들어가지 않는다.
- Modal outer radius에 의해 clipping되지 않는다.

필요 시 portal layer 사용.

---

## 6.59 Loading Folder List

Modal Open 시 Folder 목록이 아직 로딩 중일 수 있다.

권장 UX:

```text
Trigger는 현재 default value 표시
Dropdown open 시 loading rows/skeleton
```

### MUST

Folder data load가 끝날 때까지 전체 Add List Modal Open을 막지 않는다.

단 selected contextFolderId validation이 필요한 경우 cached/sidebar state를 우선 사용한다.

---

## 6.60 Folder List Load Failure

Dropdown data fetch 실패:

```text
폴더를 불러오지 못했습니다.
[다시 시도]
```

`없음` 선택은 계속 가능하게 하는 것을 권장한다.

### 이유

Folder 기능 실패 때문에 root List 생성까지 막을 필요가 없다.

---

## 6.61 Offline / Local-first

앱이 local-first라면 Folder list는 local state를 우선 사용한다.

새 Folder 생성도 local mutation + sync queue 구조를 따를 수 있다.

Add List 설계는 online-only assumption을 강제하지 않는다.

---

## 6.62 Component Interface

개념:

```ts
type FolderOption = {
  id: string;
  name: string;
};

type FolderSelectProps = {
  value: string | null;
  options: FolderOption[];

  disabled?: boolean;
  loading?: boolean;
  error?: string | null;

  onChange: (folderId: string | null) => void;
  onCreateFolder?: (name: string) => Promise<FolderOption>;
};
```

---

## 6.63 State Ownership

Draft:

```text
CreateListModal
└─ draft.folderId
    ↓
FolderSelect
```

FolderSelect local UI state:

```text
isOpen
searchQuery
activeIndex
isCreateMode
newFolderName
folderCreateStatus
folderCreateError
```

실제 selected folderId는 상위 Draft가 source of truth다.

---

## 6.64 Folder Domain Boundary

FolderSelect UI가 직접 Sidebar tree mutation 규칙을 소유하지 않는다.

권장 domain API:

```ts
listFolders(scopeId)

createFolder({
  scopeId,
  name
})

validateFolderForListCreation({
  scopeId,
  folderId
})
```

### MUST

UI component 내부에서 DB table을 직접 조작하지 않는다.

---

## 6.65 상태 목록

Folder control 주요 상태:

```text
1. CLOSED_NONE
2. CLOSED_SELECTED
3. OPEN
4. OPEN_SEARCH
5. OPEN_ITEM_ACTIVE
6. CREATE_FOLDER
7. CREATE_FOLDER_SUBMITTING
8. CREATE_FOLDER_ERROR
9. DISABLED_SUBMITTING
10. LOAD_ERROR
```

---

## 6.66 상태별 시각 규칙

| 상태 | Trigger | Dropdown | Interaction |
|---|---|---|---|
| None | `없음` | closed | enabled |
| Folder selected | folder name | closed | enabled |
| Open | active border | visible | enabled |
| Search | active border | search + filtered list | enabled |
| Item active | active border | highlighted item | keyboard/mouse |
| Create Folder | active | inline editor | create flow |
| Folder submitting | active | editor loading | restricted |
| Folder error | active | inline error | retry/edit |
| Add submitting | disabled | closed | disabled |
| Load error | enabled | retry state | None still usable |

---

## 6.67 TickTick 유사성에서 유지할 요소

```text
✓ 단일 compact dropdown field
✓ 현재 선택값 + chevron
✓ None option
✓ 선택 시 즉시 반영
✓ Modal 안에서 위치 설정
✓ 한 줄 Form rhythm
```

---

## 6.68 TickTick과 달리 명시적으로 개선할 요소

### A. Context inheritance
Folder에서 +를 누르면 해당 Folder가 자동 기본값이 된다.

### B. Inline Folder creation
새 Folder를 만들기 위해 Add List Modal을 떠나지 않는다.

### C. Search threshold
Folder가 많을 때만 Search를 노출한다.

### D. Delete concurrency recovery
선택 Folder가 사라지면 invalid ID로 submit하지 않는다.

### E. Scope validation
현재 Space 밖 Folder를 선택하지 못한다.

---

## 6.69 Folder Invariants

### INV-F01
Folder는 optional이다.

### INV-F02
`Lists +` 진입 기본값은 None이다.

### INV-F03
`Folder +` 진입 기본값은 해당 Folder다.

### INV-F04
Context는 초기값만 제공하며 사용자는 변경할 수 있다.

### INV-F05
`없음`은 유효한 실제 선택값이다.

### INV-F06
Folder 순서는 Sidebar 순서를 따른다.

### INV-F07
Folder 선택은 즉시 Draft에 반영된다.

### INV-F08
새 Folder 생성 성공 시 자동으로 그 Folder가 선택된다.

### INV-F09
Folder 생성 중에는 Add List Submit을 허용하지 않는다.

### INV-F10
삭제된 Folder ID로 List를 생성하지 않는다.

### INV-F11
Folder 변경은 Preview를 바꾸지 않는다.

### INV-F12
Folder 선택은 List의 View/type을 변경하지 않는다.

### INV-F13
Folder는 current creation scope 내부에서만 선택한다.

---

## 6.70 Folder Acceptance Criteria

### AC-FD01
`Lists +`로 Modal을 열면 Folder 값은 `없음`이다.

### AC-FD02
특정 Folder의 `+`로 Modal을 열면 해당 Folder가 기본 선택된다.

### AC-FD03
Trigger는 약 368×50px이며 현재 선택값과 chevron을 표시한다.

### AC-FD04
Dropdown 첫 항목은 항상 `없음`이다.

### AC-FD05
Folder 목록은 Sidebar 순서와 동일하다.

### AC-FD06
Folder 선택 시 즉시 `draft.folderId`가 변경되고 Dropdown이 닫힌다.

### AC-FD07
현재 선택 Folder에는 check와 selected state가 표시된다.

### AC-FD08
Folder가 9개 이상일 때 Search가 표시된다.

### AC-FD09
Search는 Folder name 기준으로 필터링한다.

### AC-FD10
Dropdown 하단에서 `+ 새 폴더`를 사용할 수 있다.

### AC-FD11
새 Folder 생성은 별도 Modal을 띄우지 않고 inline flow로 처리한다.

### AC-FD12
새 Folder 생성 성공 시 해당 Folder가 자동 선택된다.

### AC-FD13
Folder 생성 실패 시 Add List Draft가 유지된다.

### AC-FD14
Folder 생성 중에는 Add List Submit이 disabled다.

### AC-FD15
Keyboard 사용자는 Arrow key와 Enter로 Folder를 선택할 수 있다.

### AC-FD16
Dropdown은 listbox/combobox 접근성 semantics를 제공한다.

### AC-FD17
선택된 Folder가 삭제되면 invalid ID로 Submit하지 않고 안전하게 fallback한다.

### AC-FD18
Folder 변경은 Right Preview에 영향을 주지 않는다.

### AC-FD19
다른 Space의 Folder가 Dropdown에 노출되지 않는다.

### AC-FD20
Folder가 없는 상태에서도 List 생성은 정상적으로 가능하다.

---

## 6.71 §6에서 의도적으로 미확정한 것

다음은 다른 섹션에서 확정한다.

```text
Add/Cancel 정확한 위치·크기·loading style           → §7
Folder load/server error의 전체 error hierarchy      → §10
생성 성공 후 Sidebar expand/select 동작              → §11
CreateListState와 nested folderCreateState 구조       → §12
실제 Folder/List DB schema                            → §13
Mobile Bottom Sheet의 Folder picker                   → §14
Component directory / hook 구조                       → §15
전체 interaction matrix                               → §16
```
# 7. Add / Cancel Action

## 7.1 역할

`Add / Cancel`은 Add List Modal의 종료 경로를 결정한다.

이 영역은 단순히 두 개의 버튼을 배치하는 Footer가 아니라 다음 세 가지를 책임진다.

1. **현재 Draft를 실제 List 생성으로 확정**
2. **생성하지 않고 Modal을 종료**
3. **Submitting / Error 상태에서 중복 실행과 상태 손실 방지**

따라서 Action 영역은 Modal 전체 state machine과 직접 연결된다.

---

## 7.2 기본 구조

TickTick 레퍼런스의 배치를 따라 Settings Panel 우측 하단에 두 개의 버튼을 나란히 배치한다.

```text
                                 [ 추가 ]  [ 취소 ]
```

순서:

```text
Add → Cancel
```

으로 고정한다.

### 이유

이 문서의 목표는 TickTick식 생성 경험을 최대한 유지하는 것이므로 일반적인 `Cancel → Primary` 순서로 재배치하지 않는다.

---

## 7.3 Action Zone 위치

§2에서 정의한 Settings Panel의 `Action Zone`을 사용한다.

```text
Settings Panel
├─ Header
├─ Form
└─ Action Zone
                         [추가] [취소]
```

CSS 개념:

```css
.action-zone {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 20px;
}
```

### MUST

- 버튼은 Preview Panel 쪽으로 넘어가지 않는다.
- Settings Panel의 오른쪽 content edge와 정렬한다.
- Form 마지막 field와 충분한 vertical separation을 둔다.

---

## 7.4 버튼 크기

Desktop 기준:

```text
Add     128 × 48px
Cancel  128 × 48px
Gap      20px
```

권장:

```css
width: 128px;
height: 48px;
border-radius: 10px;
```

### 이유

- TickTick 레퍼런스와 유사한 넓은 utility button 비율
- 텍스트가 짧아도 Primary/Secondary action을 명확하게 구분
- Settings Panel 하단에서 충분한 클릭 영역 확보

---

## 7.5 Add Button 기본 의미

Add는 현재 Draft를 최종 확정하는 Primary action이다.

표시:

```text
추가
```

영문:

```text
Add
```

V1에서는:

```text
리스트 만들기
```

같은 긴 문구보다 TickTick과 동일한 compact action label을 우선한다.

단 제품 전체 버튼 문체가 동사+목적어를 강제한다면 전역 정책을 우선한다.

---

## 7.6 Add 활성 조건

Add는 다음 조건을 모두 만족할 때만 enabled다.

```ts
canSubmit =
  isValidListName(draft.name)
  && status !== "submitting"
  && folderCreateStatus !== "submitting"
  && isDefaultViewAvailable(draft.defaultViewType)
```

V1 사용자 관점에서 핵심 조건은:

```text
Name이 유효함
+
현재 별도 생성 작업이 진행 중이 아님
```

Color와 Folder는 optional이므로 Add 활성 조건이 아니다.

---

## 7.7 Add Disabled — Empty

Modal Open 직후:

```text
name = ""
```

Add:

```text
disabled
```

시각:

```text
Primary shape 유지
+
낮은 강조도
```

권장:

```css
background: var(--accent-disabled);
color: var(--text-on-accent-disabled);
cursor: default;
```

Opacity만 낮추는 방식보다 disabled token 사용을 권장한다.

---

## 7.8 Disabled Feedback

Disabled Add에 hover/pressed animation을 적용하지 않는다.

### MUST NOT

```text
✕ pointer cursor
✕ hover shade 변화
✕ tooltip "이름을 입력하세요"를 항상 표시
```

Name이 유효하지 않은 이유는 Name field 구조에서 자연스럽게 이해할 수 있어야 한다.

접근성상 필요한 경우 `aria-disabled="true"`를 제공한다.

---

## 7.9 Add Enabled State

Name이 유효해지는 즉시:

```text
OPEN_EMPTY → OPEN_VALID
```

Add가 활성화된다.

Primary visual:

```css
background: var(--accent-primary);
color: var(--text-on-accent);
```

### MUST

Name 입력 직후 별도 delay 없이 활성화한다.

---

## 7.10 Add Hover State

Enabled Add hover:

```text
accent slightly darker/stronger
```

권장:

```css
background: var(--accent-primary-hover);
```

Transition:

```text
100ms
```

강한 shadow는 사용하지 않는다.

---

## 7.11 Add Pressed State

Mouse down:

```css
background: var(--accent-primary-pressed);
transform: scale(0.99);
```

또는 scale 없이 색 변화만 사용해도 된다.

duration:

```text
60~80ms
```

---

## 7.12 Add Focus State

Keyboard focus:

```css
outline: 2px solid var(--focus-ring);
outline-offset: 2px;
```

`:focus-visible` 사용.

Primary fill과 focus ring이 색상상 겹치지 않도록 contrast를 확보한다.

---

## 7.13 Add Click

Enabled Add click:

```text
OPEN_VALID
→ validate
→ SUBMITTING
```

동일 event loop에서 즉시 `status = submitting`으로 전환해야 한다.

### 이유

네트워크 요청 시작 전에 UI lock이 늦으면 double click으로 두 개의 요청이 발생할 수 있다.

---

## 7.14 Submit Validation 재검증

버튼이 enabled더라도 click 시 최종 validation을 다시 실행한다.

```text
UI enabled state
≠
server/domain validation 대체
```

sequence:

```text
Click
→ normalize
→ validate
→ status=submitting
→ persistence
```

### MUST

Button enabled logic과 submit validation은 동일한 validation source를 재사용한다.

---

## 7.15 Loading State

Submitting 중 Add는 loading state로 전환한다.

권장 표시:

```text
[ ◌ 추가 중 ]
```

또는:

```text
[ ◌ ]
```

보다 **텍스트를 유지하는 방식**을 권장한다.

### Label

```text
추가 중
```

영문:

```text
Adding…
```

### MUST

Button width는 loading 전후 동일하게 유지한다.

---

## 7.16 Loading Spinner

권장:

```text
spinner visual size: 16px
gap to text:         8px
```

Spinner는 button text 왼쪽.

```text
◌ 추가 중
```

### MUST NOT

```text
✕ modal 중앙에 global spinner
✕ Add button 자체를 사라지게 함
✕ 전체 screen overlay를 한 번 더 씌움
```

현재 작업이 “List 생성 중”임을 Action 자체에서 보여주는 것이 가장 직접적이다.

---

## 7.17 Submitting 동안 전체 Interaction

`SUBMITTING` 상태:

```text
Name        disabled
Color       disabled
View        disabled
Folder      disabled
Add         loading + disabled
Cancel      disabled
Esc         ignored
Overlay     no-op
```

### 핵심 원칙

Persistence 요청이 시작된 뒤 사용자가 Draft를 바꾸거나 Modal을 닫아 “결과가 어디로 갔는지” 모르게 만들지 않는다.

---

## 7.18 Double-submit 방지

최소 두 층에서 방지한다.

### UI layer

```ts
if (status === "submitting") return;
```

### Domain/API layer

가능하면 idempotency 또는 동일 요청 중복 방지 메커니즘을 사용한다.

### MUST

빠른 double click / Enter 연타로 같은 List가 두 번 생성되지 않는다.

---

## 7.19 Enter Submit

Name field에서 유효한 Enter:

```text
→ Add click과 동일한 submit pipeline
```

즉 별도 생성 로직을 만들지 않는다.

권장:

```ts
submitCreateList()
```

하나의 command를 Add click과 Enter가 공유한다.

---

## 7.20 Global Form Enter

V1에서는 모든 control에서 Enter를 “무조건 Submit”으로 처리하지 않는다.

### Submit 허용

```text
Name input에서 composition이 아닌 Enter
Action Add에 focus된 Enter
```

### Submit하지 않음

```text
Folder dropdown open 상태의 Enter
Custom Color Popover 내부 Enter
View radio navigation 중 Enter/Space
새 Folder input의 Enter
```

각 child interaction이 Enter를 먼저 소비한다.

---

## 7.21 IME Guard

Name Enter Submit은 §3 규칙을 재사용한다.

```ts
if (event.nativeEvent.isComposing) return;
```

새 Folder input도 동일.

### MUST

IME composition 확정용 Enter가 Add List Submit까지 bubble되지 않도록 한다.

---

## 7.22 Cancel Button 역할

Cancel은 **Draft를 저장하지 않고 명시적으로 Modal을 종료**하는 Secondary action이다.

표시:

```text
취소
```

영문:

```text
Cancel
```

---

## 7.23 Cancel Default State

TickTick식 outline secondary button.

권장:

```css
background: var(--surface-modal);
border: 1px solid var(--border-control);
color: var(--text-primary);
```

Add보다 시각적 강조도가 명확히 낮아야 한다.

---

## 7.24 Cancel Hover State

```css
background: var(--surface-hover);
border-color: var(--border-hover);
```

강한 danger styling은 사용하지 않는다.

Cancel은 destructive action이 아니다.

---

## 7.25 Cancel Pressed State

```css
background: var(--surface-pressed);
```

필요 시:

```text
scale 0.99
```

MAY.

---

## 7.26 Cancel Focus State

```css
outline: 2px solid var(--focus-ring);
outline-offset: 2px;
```

Add와 동일한 keyboard focus system 사용.

---

## 7.27 Cancel Click

다음 상태에서 동작:

```text
OPEN_EMPTY
OPEN_VALID
ERROR
```

결과:

```text
Draft discard
Modal close
Background context restore
```

실제로 Background는 변경되지 않았으므로 restore는 “그대로 다시 interaction 가능”이라는 의미다.

---

## 7.28 Cancel Confirmation

V1에서는 별도 confirmation을 띄우지 않는다.

예:

```text
"작성 중인 내용을 버리시겠습니까?"
```

같은 dialog를 사용하지 않는다.

### 이유

- Draft 항목이 적다.
- Cancel은 사용자가 명시적으로 누르는 action이다.
- confirmation이 5~10초짜리 utility flow를 무겁게 만든다.

---

## 7.29 Dirty State와 Cancel

Draft가 수정된 상태라도 explicit Cancel은 즉시 닫는다.

```text
dirty = true
+ Cancel
→ close
```

단 accidental close 경로인 Overlay click은 이미 비활성화되어 있으므로 손실 위험을 충분히 줄인다.

---

## 7.30 Escape

Esc는 Cancel과 동일한 결과를 가진다.

단 child surface가 열려 있으면 child가 우선한다.

우선순위:

```text
1. Custom Color Popover
2. Folder Dropdown / Inline Create
3. 기타 Modal 내부 Popover
4. Add List Modal
```

예:

```text
Folder dropdown open
Esc
→ dropdown close

다시 Esc
→ Add List Modal close
```

---

## 7.31 Submitting 중 Esc

```text
SUBMITTING
+ Esc
→ no-op
```

Modal을 닫지 않는다.

### 이유

요청 결과가 도착한 뒤 사용자가 생성된 List를 찾지 못하는 상태를 방지한다.

---

## 7.32 Overlay Click

§1 원칙 유지:

```text
Overlay click
→ Modal close하지 않음
```

단 child popover가 열려 있으면:

```text
Overlay/Modal 다른 영역 click
→ child popover close
→ Add List Modal 유지
```

---

## 7.33 Header Close Button

V1에는 `×`를 두지 않는다.

따라서 닫기 경로는:

```text
Cancel
Esc
```

두 개가 기본이다.

전역 Dialog 정책 변경으로 `×`가 추가될 경우 Cancel과 동일한 close command를 재사용한다.

---

## 7.34 Error 상태의 Action

생성 실패 후:

```text
ERROR
```

Primary action은 Retry 의미를 가진다.

버튼 label은 두 가지 중 하나를 사용할 수 있다.

권장:

```text
다시 시도
```

또는 TickTick compactness를 최우선하면:

```text
추가
```

를 유지할 수 있다.

### 본 설계 확정

**ERROR에서는 Primary label을 `다시 시도`로 변경한다.**

이유:

현재 상태가 정상 create가 아니라 recovery라는 사실을 명확히 전달한다.

---

## 7.35 Retry Click

```text
ERROR
→ validate current Draft
→ SUBMITTING
```

Draft는 사용자가 Error 이후 수정했을 수 있으므로 **최신 Draft로 재시도**한다.

이전 request payload를 그대로 replay하지 않는다.

---

## 7.36 Error 후 Name이 invalid가 된 경우

사용자가 Error 상태에서 Name을 지워 invalid가 되면:

```text
ERROR
→ OPEN_EMPTY / invalid
```

Primary Retry는 disabled 또는 Add disabled semantics로 돌아간다.

즉 error badge를 유지하면서 invalid submit을 강제하지 않는다.

---

## 7.37 Error Message와 Action 관계

정확한 Error hierarchy는 §10에서 다루지만 Action 관점에서는:

```text
Error message
↓
[다시 시도] [취소]
```

구조를 허용한다.

Primary button 자체에 error icon을 넣지 않는다.

---

## 7.38 Success State

성공 후 별도의:

```text
완료
```

button state를 표시하지 않는다.

sequence:

```text
SUBMITTING
→ success
→ Modal close
→ Sidebar/List navigation
```

### 이유

성공 후 사용자가 Modal 안에서 추가 action을 할 필요가 없다.

---

## 7.39 Success Toast

List 생성 자체는 즉시 결과가 Sidebar/Main에 보이므로 기본적으로 success toast는 필요하지 않다.

### MUST NOT

```text
"리스트가 생성되었습니다."
```

toast를 항상 띄우지 않는다.

결과 자체가 feedback이다.

---

## 7.40 Failure Toast

생성 실패는 Modal 안에서 처리한다.

Global toast만 띄우고 Modal을 닫는 방식은 사용하지 않는다.

Draft recovery가 중요하기 때문이다.

---

## 7.41 Button Order와 Keyboard Order

시각:

```text
Add → Cancel
```

Tab order도 시각 순서를 따른다.

```text
... Folder
→ Add
→ Cancel
→ focus trap start
```

### MUST

시각 순서와 keyboard 순서를 반대로 만들지 않는다.

---

## 7.42 Action Zone Vertical Alignment

Button baseline은 동일.

```text
height 동일
vertical center 동일
```

Secondary button이 border 때문에 1px 작아 보이지 않도록 box sizing을 맞춘다.

---

## 7.43 Bottom Spacing

§2 기준:

```text
Action bottom → Settings Panel bottom
≈ 22px
```

Form과 action 사이에는 flexible spacer를 사용한다.

### 이유

항목이 적더라도 Action이 Folder 바로 아래 붙어 “또 하나의 form row”처럼 보이지 않게 한다.

---

## 7.44 Responsive 정책 연결

정확한 모바일 배치는 §14에서 확정한다.

Desktop 원칙:

```text
horizontal buttons
right aligned
```

모바일에서는:

```text
Primary full width
Secondary text/button
```

형태로 변경할 수 있다.

Desktop 규칙을 억지로 축소하지 않는다.

---

## 7.45 Accessibility

Add:

```html
type="submit"
```

Cancel:

```html
type="button"
```

권장.

### Disabled

native `disabled`를 우선 사용한다.

### Loading

```text
aria-busy="true"
```

또는 button accessible name을:

```text
리스트 추가 중
```

으로 갱신한다.

Spinner는 screen reader에 중복 읽히지 않도록 decorative 처리한다.

---

## 7.46 Screen Reader Error Announcement

ERROR 전환 시:

```text
aria-live="polite"
```

또는 적절한 alert semantics로 Error message를 읽게 한다.

Action label도:

```text
추가 → 다시 시도
```

변경됨을 접근 가능하게 한다.

---

## 7.47 Command 구조

권장:

```ts
function submitCreateList() { ... }
function cancelCreateList() { ... }
```

Add click, Name Enter, Retry는 모두 `submitCreateList` 계열 command를 공유한다.

Cancel click, Modal Esc는 `cancelCreateList`를 공유한다.

### MUST NOT

각 interaction마다 별도의 persistence/close 코드를 복제하지 않는다.

---

## 7.48 Submit Command Guard

개념:

```ts
async function submitCreateList() {
  if (state.status === "submitting") return;
  if (state.folderCreateStatus === "submitting") return;

  const draft = normalizeDraft(state.draft);

  if (!isValidDraft(draft)) return;

  setStatus("submitting");

  try {
    const result = await createList(draft);
    handleCreateSuccess(result);
  } catch (error) {
    setStatus("error");
  }
}
```

실제 코드 구조는 기존 architecture에 맞춘다.

---

## 7.49 Cancel Command Guard

```ts
function cancelCreateList() {
  if (state.status === "submitting") return;

  closeChildSurfaces();
  discardDraft();
  closeModal();
}
```

단 Esc는 child surface가 있으면 먼저 child만 닫는다.

---

## 7.50 Pending Request와 Component Unmount

Submitting 중에는 normal user action으로 Modal을 unmount하지 않는다.

Route change나 app shutdown 등 외부 unmount가 발생하면:

- request cancellation이 가능한 경우 abort
- 불가능한 경우 결과 side effect가 중복 처리되지 않도록 command layer에서 보호

한다.

---

## 7.51 Network Timeout

긴 요청이 발생하더라도 Add button loading은 유지한다.

정확한 timeout/error UX는 §10에서 다룬다.

Action 영역은:

```text
추가 중
```

상태를 안정적으로 유지한다.

---

## 7.52 Action State 목록

```text
1. ADD_DISABLED
2. ADD_ENABLED
3. ADD_HOVER
4. ADD_FOCUS
5. ADD_PRESSED
6. SUBMITTING
7. RETRY_ENABLED
8. CANCEL_DEFAULT
9. CANCEL_HOVER
10. CANCEL_FOCUS
11. CANCEL_DISABLED_SUBMITTING
```

---

## 7.53 상태별 시각 규칙

| 상태 | Primary | Secondary | 입력 | Esc |
|---|---|---|---|---|
| Empty | disabled Add | Cancel enabled | enabled | close |
| Valid | Add enabled | Cancel enabled | enabled | close |
| Add hover/focus | interactive | enabled | enabled | close |
| Submitting | `추가 중` disabled | disabled | disabled | ignored |
| Error | `다시 시도` enabled* | Cancel enabled | enabled | close |
| Error + invalid Name | disabled | Cancel enabled | enabled | close |

`*` 현재 Draft가 유효할 때만.

---

## 7.54 TickTick 유사성에서 유지할 요소

```text
✓ Settings Panel 우측 하단의 두 버튼
✓ Add → Cancel 순서
✓ 넓고 단순한 버튼
✓ Add는 filled primary
✓ Cancel은 outline secondary
✓ 생성 과정이 Modal 안에서 끝남
```

---

## 7.55 TickTick과 달리 명시적으로 개선할 요소

### A. Loading state 명문화
Add click 후 중복 생성 방지를 위해 즉시 pending state로 전환한다.

### B. Error recovery
실패 시 Modal/Draft를 유지하고 Primary를 `다시 시도`로 바꾼다.

### C. IME / child interaction priority
Enter/Esc가 Dropdown이나 한글 composition과 충돌하지 않도록 우선순위를 정의한다.

### D. Explicit overlay policy
외부 클릭으로 Draft가 사라지지 않게 한다.

---

## 7.56 Action Invariants

### INV-A01
Desktop 버튼 순서는 Add → Cancel이다.

### INV-A02
Add는 유효한 Draft에서만 활성화된다.

### INV-A03
Add click과 Name Enter는 동일 submit command를 사용한다.

### INV-A04
Submitting 전환은 persistence 요청 직전에 즉시 수행한다.

### INV-A05
Submitting 동안 모든 Draft 수정과 Cancel/Esc를 잠근다.

### INV-A06
동일 Draft가 double-submit으로 두 번 생성되지 않는다.

### INV-A07
Cancel은 explicit action이므로 별도 confirmation 없이 닫는다.

### INV-A08
Overlay click은 Modal을 닫지 않는다.

### INV-A09
Child popover가 열려 있으면 Esc는 child를 먼저 닫는다.

### INV-A10
Error 후 Draft는 유지된다.

### INV-A11
Error 상태의 Primary label은 `다시 시도`다.

### INV-A12
성공 후 성공 버튼/확인 단계를 추가하지 않는다.

---

## 7.57 Action Acceptance Criteria

### AC-A01
Desktop에서 Settings Panel 우측 하단에 `[추가] [취소]` 순서로 표시된다.

### AC-A02
두 버튼은 각각 약 128×48px이고 20px 간격을 가진다.

### AC-A03
Name이 invalid이면 Add는 disabled다.

### AC-A04
Name이 valid이면 Add가 즉시 enabled 된다.

### AC-A05
Folder inline creation이 submitting이면 Add는 disabled다.

### AC-A06
Add click 시 즉시 `SUBMITTING`으로 전환한다.

### AC-A07
Submitting 동안 Add에는 spinner와 `추가 중` label이 표시된다.

### AC-A08
Submitting 동안 Form과 Cancel은 disabled다.

### AC-A09
Submitting 동안 Esc로 Modal을 닫을 수 없다.

### AC-A10
빠른 double click이나 Enter 연타로 List가 중복 생성되지 않는다.

### AC-A11
Name input의 유효한 Enter는 Add와 동일한 command를 실행한다.

### AC-A12
Folder Dropdown/Custom Color Popover가 Enter/Esc를 사용할 때 부모 Modal action이 오작동하지 않는다.

### AC-A13
Cancel은 Draft를 버리고 Modal을 즉시 닫는다.

### AC-A14
Draft가 dirty여도 Cancel confirmation을 추가로 띄우지 않는다.

### AC-A15
Overlay click만으로 Modal이 닫히지 않는다.

### AC-A16
생성 실패 시 Modal과 Draft가 유지된다.

### AC-A17
생성 실패 후 Primary button은 `다시 시도`로 표시된다.

### AC-A18
Retry는 사용자가 수정한 최신 Draft로 다시 실행된다.

### AC-A19
생성 성공 후 Modal에 별도 success confirmation을 표시하지 않고 새 List로 이동한다.

### AC-A20
Add/Cancel의 Tab order는 시각 순서와 동일하다.

---

## 7.58 §7에서 의도적으로 미확정한 것

다음은 이후 섹션에서 확정한다.

```text
Preview 내부 구체 UI 및 transition              → §8
Modal 전체 focus trap / shortcut matrix         → §9
Timeout / permission / network error hierarchy  → §10
성공 후 Sidebar expand / route / first task     → §11
CreateListState 상세 타입                        → §12
Persistence transaction / idempotency API       → §13
Mobile action layout                             → §14
Component / hook 파일 구조                       → §15
전체 상태 매트릭스                               → §16
```
# 8. Right Preview

## 8.1 역할

`Right Preview`는 실제 앱 화면을 미리 조작하는 공간이 아니라, 사용자가 선택한 기본 View가 어떤 형태인지 즉시 이해할 수 있게 하는 **비상호작용형 visual preview**다.

정확한 역할:

> **Name / Color / Default View 선택 결과를 간단한 illustration으로 반영하여, 사용자가 생성 전에 구조를 이해하도록 돕는다.**

Preview는 다음을 하지 않는다.

```text
✕ 실제 Task 생성
✕ 실제 Board drag
✕ 실제 Gantt zoom
✕ 실제 Calendar navigation
✕ 실제 List sorting
✕ 실제 App component 전체 재사용
```

즉 Preview는 “실제 화면의 축소판”이 아니라 **설명용 representation**이다.

---

## 8.2 Preview Panel 구조

§2에서 정의한 우측 Panel을 그대로 사용한다.

```text
Preview Panel
└─ Preview Stage
   └─ Preview Illustration
```

기본:

```text
panel width ≈ 552px
panel background = subtle cool surface
```

Preview illustration은 Panel 중앙보다 약간 위에 위치한다.

---

## 8.3 Preview Stage 크기

권장 최대 크기:

```text
width: 460px
height: 400~440px
```

Panel 내부 좌우 최소 여백:

```text
32px
```

상단 offset:

```text
약 120~140px
```

### MUST

Preview가 Panel 전체를 꽉 채우지 않는다.

여백은 Preview를 실제 앱 UI가 아닌 “설명용 그림”으로 인식시키는 데 중요하다.

---

## 8.4 Preview 공통 프레임

List / Board / Gantt 모두 동일한 outer frame을 공유한다.

```text
┌────────────────────────────────────────────┐
│ ● 학교                                    │
│ ───────────────────────────────────────── │
│                                            │
│      View-specific illustration            │
│                                            │
└────────────────────────────────────────────┘
```

구조:

```text
PreviewFrame
├─ Header
│  ├─ Color Dot / Icon Accent
│  └─ List Name
└─ Body
   └─ View Illustration
```

---

## 8.5 Preview Frame 스타일

권장:

```css
background: var(--surface-preview-card);
border-radius: 14px;
border: 1px solid var(--border-preview);
box-shadow: 0 4px 18px rgba(...);
```

단 shadow는 Modal 자체보다 훨씬 약해야 한다.

### MUST NOT

```text
✕ Preview card가 Modal 안의 또 다른 Modal처럼 보임
✕ 강한 shadow
✕ 검은 border
```

---

## 8.6 Header 역할

Preview Header는 사용자가 입력한 List identity를 최소한으로 반영한다.

표시:

```text
● 학교
```

반영 값:

```text
Name
Color
```

반영하지 않는 값:

```text
Folder
```

Folder는 Sidebar 위치이므로 Preview의 본체 구조와 관계가 없다.

---

## 8.7 Name 반영

사용자가 Name을 입력하면 Preview Header가 즉시 갱신된다.

예:

```text
입력 전
→ 새 리스트

입력 후
→ 학교
```

기본 fallback:

```text
새 리스트
```

### MUST

Placeholder 문자열 `리스트 이름`을 그대로 Preview 제목으로 사용하지 않는다.

Input placeholder와 Preview fallback은 다른 역할이다.

---

## 8.8 긴 Name 처리

Preview Header는 한 줄로 유지한다.

긴 이름:

```text
2026년 하반기 대학원 연구 프로젝트...
```

ellipsis 처리.

### MUST

Preview 때문에 Modal layout이 늘어나거나 wrap되지 않는다.

---

## 8.9 Color 반영

Color는 Header의 작은 identity element에만 반영한다.

예:

```text
● 학교
```

여기서 `●`가 selected List Color.

### None

`color = null`이면 neutral icon 또는 neutral dot.

### MUST NOT

```text
✕ Preview frame 전체 border를 List Color로 변경
✕ Preview background 전체 tint
✕ Task row마다 List Color 적용
```

Color는 identity accent 역할만 한다.

---

## 8.10 View 반영

View 선택은 Preview Body 전체 illustration을 변경한다.

```text
List selected
→ ListPreview

Board selected
→ BoardPreview

Gantt selected
→ GanttPreview
```

Name/Color는 공통 Header에 유지된다.

---

## 8.11 List Preview 구조

List Preview는 가장 기본적인 task row 구조를 보여준다.

```text
┌────────────────────────────────────┐
│ ● 학교                             │
│ ────────────────────────────────── │
│                                    │
│ □ ─────────────                    │
│ □ ─────────                        │
│ □ ───────────────                  │
│ □ ───────                          │
│                                    │
└────────────────────────────────────┘
```

### 표현 요소

```text
checkbox placeholder
text skeleton line
row spacing
```

실제 task 이름은 넣지 않는다.

### 이유

Preview의 목적은 content preview가 아니라 layout preview다.

---

## 8.12 List Preview row 수

권장:

```text
4 rows
```

이유:

- List 구조가 즉시 보인다.
- 너무 많은 row로 Preview가 실제 데이터처럼 보이지 않는다.
- whitespace 유지가 쉽다.

---

## 8.13 Board Preview 구조

Board Preview는 3-column layout을 사용한다.

```text
┌───────────────────────────────────────┐
│ ● 학교                                │
│ ───────────────────────────────────── │
│                                       │
│ TODO       DOING       DONE           │
│ ─────      ─────       ─────          │
│ ▭          ▭                          │
│ ▭                                     │
│                                       │
└───────────────────────────────────────┘
```

### Column 수

```text
3
```

고정.

개념:

```text
TODO
DOING
DONE
```

단 실제 text label은 희미하게 쓰거나 skeleton header만 사용해도 된다.

---

## 8.14 Board Preview card 수

권장:

```text
TODO   2 cards
DOING  1 card
DONE   0~1 card
```

완전히 균등하게 채우지 않는다.

### 이유

실제 board처럼 약간 비대칭적인 구조가 더 자연스럽다.

---

## 8.15 Board Preview에서 하지 않을 것

```text
✕ drag handle
✕ assignee avatar
✕ priority badge
✕ date badge
✕ real task title
```

Preview가 실제 board 기능처럼 보이지 않게 한다.

---

## 8.16 Gantt Preview 구조

Gantt Preview는 left task list + right timeline의 기본 구조를 보여준다.

```text
┌──────────────────────────────────────────────┐
│ ● 학교                                       │
│ ──────────────────────────────────────────── │
│ Task              18   19   20   21   22    │
│ ─────────         ████                      │
│ ───────                ███████              │
│ ───────────                 █████            │
└──────────────────────────────────────────────┘
```

### 구성

```text
Left task column
Vertical divider
Date header
Horizontal bars
```

---

## 8.17 Gantt Preview bar 규칙

Bar는 3개 정도.

길이와 시작점을 다르게 한다.

예:

```text
bar1: short / early
bar2: medium / middle
bar3: short / later
```

### MUST

실제 날짜 숫자에 의미를 부여하지 않는다.

Preview는 structure hint다.

---

## 8.18 Gantt Preview 색상

Gantt bars는 neutral accent 또는 theme secondary tone을 사용한다.

List Color로 모든 bar를 칠하지 않는다.

### 이유

List Color는 identity이며 Timeline bar semantics와 분리한다.

Header dot만 List Color를 반영한다.

---

## 8.19 Preview Transition

View 변경 시 crossfade.

권장:

```text
duration: 140ms
```

sequence:

```text
old illustration opacity 1 → 0
new illustration opacity 0 → 1
```

### MUST NOT

```text
✕ slide left/right
✕ large scale animation
✕ spring
✕ panel 전체 resize
```

---

## 8.20 Transition 중 Layout 안정성

List / Board / Gantt Preview는 동일한 bounding box를 사용한다.

즉 View 변경 시 card 높이나 위치가 크게 변하지 않는다.

### MUST

Preview switching으로 Modal 전체 layout이 흔들리지 않는다.

---

## 8.21 Name 입력 Transition

Name 변경은 별도 animation 없이 즉시 반영한다.

Color 변경도 동일.

```text
Name → immediate
Color → immediate
View → short crossfade
```

### 이유

Text/color 값은 state update 자체가 충분한 feedback이며 animation을 넣으면 typing 시 noise가 커진다.

---

## 8.22 Preview Interaction 금지

Preview 안의 모든 요소는 기본적으로 pointer interaction이 없다.

```css
pointer-events: none;
user-select: none;
```

### MUST

사용자가 Preview row를 클릭해 Task를 만들거나 View를 전환할 수 없어야 한다.

Preview는 읽기 전용이다.

---

## 8.23 Cursor

Preview 영역:

```text
cursor: default
```

Card나 row에 hover affordance를 주지 않는다.

---

## 8.24 Accessibility

Preview는 핵심 설정을 중복 시각화하는 보조 영역이다.

따라서 screen reader에 모든 skeleton row를 읽히지 않게 한다.

권장:

```html
aria-hidden="true"
```

또는 Preview 전체에:

```text
role="img"
aria-label="선택한 기본 보기 미리보기"
```

둘 중 하나.

### 본 설계 권장

Preview body skeleton은 `aria-hidden="true"`.

Header의 Name/Color 정보도 이미 form에서 접근 가능하므로 중복 읽기를 피한다.

---

## 8.25 Preview Title

별도:

```text
미리보기
```

label을 상단에 두지 않는다.

### 이유

TickTick처럼 오른쪽 영역 자체가 자연스럽게 illustration zone으로 인식되어야 한다.

별도 제목은 시각적 밀도를 높인다.

---

## 8.26 Preview Empty State

Name이 비어 있어도 Preview는 사라지지 않는다.

```text
Header = 새 리스트
Body = selected View illustration
```

즉 Modal Open 순간부터 Preview가 존재한다.

### 이유

사용자는 Name 입력 전에도 View tile을 눌러 구조를 비교할 수 있다.

---

## 8.27 Preview Error State

Preview 자체에는 Error 상태가 없다.

생성 Error가 발생해도 Preview는 현재 Draft를 계속 반영한다.

예:

```text
Create failed
→ Preview 그대로
```

Error message는 Action/Error 영역의 책임이다.

---

## 8.28 Preview Submitting State

Submitting 중에도 Preview는 그대로 유지한다.

blur/spinner overlay를 올리지 않는다.

### 이유

현재 Draft가 무엇인지 계속 보여주는 편이 낫다.

Interaction 자체가 없으므로 disabled visual이 필요 없다.

---

## 8.29 Preview와 Draft Source of Truth

Preview는 독립 state를 가지지 않는다.

```text
CreateListDraft
├─ name
├─ color
└─ defaultViewType
       ↓
CreateListPreview
```

즉 Preview는 pure render component를 권장한다.

---

## 8.30 Component 구조

권장:

```text
CreateListPreview
├─ PreviewFrame
│  ├─ PreviewHeader
│  └─ PreviewBody
│     ├─ ListPreview
│     ├─ BoardPreview
│     └─ GanttPreview
```

### Props

```ts
type CreateListPreviewProps = {
  name: string;
  color: ListColorValue;
  view: DefaultViewType;
};
```

---

## 8.31 실제 앱 컴포넌트 재사용 금지

다음 실제 component를 Preview 안에 직접 넣지 않는다.

```text
✕ TaskRow
✕ BoardColumn
✕ BoardCard
✕ GanttRow
✕ GanttTimeline
✕ MainHeader
```

### 이유

1. Preview에 불필요한 business logic이 들어간다.
2. 실제 component 변경이 Add List Modal을 깨뜨린다.
3. data dependency가 늘어난다.
4. focus/keyboard interaction이 Preview에 새어 들어간다.
5. 성능 비용이 불필요하게 커진다.

---

## 8.32 전용 Dumb Component 원칙

Preview component는 다음 특성을 가져야 한다.

```text
No DB
No Router
No Drag & Drop
No Task state
No keyboard interaction
No mutation
```

오직 props로 그림만 렌더한다.

---

## 8.33 Skeleton 표현 원칙

실제 콘텐츠 대신 다음을 사용한다.

```text
line
block
dot
checkbox outline
timeline bar
```

### 색상

neutral token 중심.

권장:

```text
preview-line
preview-line-subtle
preview-border
preview-accent-neutral
```

---

## 8.34 실제 텍스트 사용 범위

허용:

```text
List Name
TODO / DOING / DONE (optional)
짧은 date header (optional)
```

사용하지 않음:

```text
실제 Task 이름
예시 사용자 이름
Assignee
실제 due date
```

### 이유

샘플 콘텐츠가 사용자에게 의미 있는 데이터처럼 오해되는 것을 방지한다.

---

## 8.35 Preview Detail Density

Preview는 실제 View의 30~40% 정도의 정보 밀도만 표현한다.

목표:

```text
"아, 이게 List구나."
"아, Board는 column이구나."
"아, Gantt는 timeline이구나."
```

정도면 충분하다.

---

## 8.36 Responsive Preview 원칙

정확한 breakpoint는 §14에서 확정한다.

기본 방향:

```text
Wide Desktop
→ full Preview

Medium Desktop/Tablet
→ reduced Preview

Narrow
→ Preview 제거
```

### MUST

좁은 화면에서 Form을 압축하면서까지 Preview를 유지하지 않는다.

Preview는 보조 정보이기 때문이다.

---

## 8.37 Preview 제거 시 영향

Preview가 숨겨져도 Form의 기능은 완전히 동일해야 한다.

즉:

```text
Preview exists?
≠
Can create List?
```

Preview는 optional presentation layer다.

---

## 8.38 Performance

Preview는 매우 가벼워야 한다.

권장:

```text
No canvas
No chart library
No animation library dependency
```

CSS + lightweight SVG/icon + div skeleton 정도로 충분하다.

---

## 8.39 Re-render 정책

Name typing은 매우 자주 re-render된다.

따라서 Preview는 heavy computation을 하지 않는다.

필요 시:

```text
memoized pure component
```

사용 가능.

하지만 premature optimization은 피한다.

---

## 8.40 Theme 대응

Light Theme:

```text
cool subtle panel
white/light preview frame
neutral skeleton
```

Dark Theme:

```text
slightly elevated dark surface
muted skeleton
same structure
```

### MUST

Preview가 Light Theme reference color를 hard-code하지 않는다.

---

## 8.41 Color Contrast

Preview skeleton은 실제 text가 아니므로 지나치게 강한 contrast가 필요 없다.

하지만 Header List Name은 실제 readable text이므로 충분한 contrast를 가져야 한다.

---

## 8.42 Motion Preference

`prefers-reduced-motion` 환경에서는 View transition crossfade를 제거하거나 최소화한다.

```text
duration → 0~50ms
```

### MUST

Preview animation이 accessibility setting을 무시하지 않는다.

---

## 8.43 Preview Wireframes

### List

```text
┌────────────────────────────────────────┐
│ ● 새 리스트                            │
│ ────────────────────────────────────── │
│                                        │
│ □ ─────────────                        │
│ □ ─────────                            │
│ □ ───────────────                      │
│ □ ───────                              │
│                                        │
└────────────────────────────────────────┘
```

### Board

```text
┌────────────────────────────────────────┐
│ ● 새 리스트                            │
│ ────────────────────────────────────── │
│                                        │
│ TODO        DOING       DONE           │
│ ─────       ─────       ─────          │
│ ▭           ▭                          │
│ ▭                                      │
│                                        │
└────────────────────────────────────────┘
```

### Gantt

```text
┌────────────────────────────────────────────┐
│ ● 새 리스트                               │
│ ────────────────────────────────────────── │
│ Task          18   19   20   21   22      │
│ ───────       ████                        │
│ ─────────          ██████                 │
│ ────────                ████              │
└────────────────────────────────────────────┘
```

---

## 8.44 TickTick 유사성에서 유지할 요소

```text
✓ 우측 별도 Preview Panel
✓ 매우 옅은 배경
✓ 실제 UI보다 단순한 illustration
✓ Form과 분리된 시각적 안내 영역
✓ interaction 없는 구조
✓ generous whitespace
```

---

## 8.45 TickTick과 달리 명시적으로 개선할 요소

### A. View별 실시간 Preview
List / Board / Gantt 변경 시 구조가 즉시 바뀐다.

### B. Name/Color 최소 반영
Preview가 선택 결과를 완전히 무관한 그림으로 보이지 않게 한다.

### C. 실제 App component와 분리
Preview 전용 dumb component를 사용해 결합도를 낮춘다.

### D. Responsive에서 과감히 제거
Form usability보다 Preview를 우선하지 않는다.

---

## 8.46 Preview Invariants

### INV-P01
Preview는 비상호작용형이다.

### INV-P02
Preview는 실제 Task/View component를 재사용하지 않는다.

### INV-P03
Preview는 Draft의 Name/Color/View만 반영한다.

### INV-P04
Folder 변경은 Preview에 영향을 주지 않는다.

### INV-P05
Name이 비어 있어도 Preview는 존재한다.

### INV-P06
View 변경만 short crossfade를 사용한다.

### INV-P07
Preview 때문에 Modal size가 바뀌지 않는다.

### INV-P08
Submitting/Error 상태에서도 현재 Draft Preview를 유지한다.

### INV-P09
Preview가 없어도 Add List 기능은 완전히 동작한다.

### INV-P10
Preview 내부 skeleton은 screen reader noise를 만들지 않는다.

---

## 8.47 Preview Acceptance Criteria

### AC-P01
Desktop에서 Preview Panel은 Settings Panel 우측에 표시된다.

### AC-P02
Preview illustration은 Panel 중앙보다 약간 위에 배치된다.

### AC-P03
Preview Header에는 fallback 또는 현재 Name이 표시된다.

### AC-P04
Name 변경 시 Preview Header가 즉시 갱신된다.

### AC-P05
Color 변경 시 Header identity accent가 즉시 갱신된다.

### AC-P06
Folder 변경은 Preview에 아무 변화도 주지 않는다.

### AC-P07
List 선택 시 4개 정도의 row skeleton이 보인다.

### AC-P08
Board 선택 시 3-column illustration이 보인다.

### AC-P09
Gantt 선택 시 task column + timeline bars 구조가 보인다.

### AC-P10
View 전환 시 약 120~160ms crossfade가 적용된다.

### AC-P11
Preview 내부 element를 클릭해도 아무 interaction이 발생하지 않는다.

### AC-P12
Preview는 실제 TaskRow/Board/Gantt component에 의존하지 않는다.

### AC-P13
Error 발생 후에도 Preview는 현재 Draft를 유지한다.

### AC-P14
Submitting 중에도 Preview가 사라지거나 spinner overlay로 덮이지 않는다.

### AC-P15
긴 Name은 한 줄 ellipsis 처리된다.

### AC-P16
좁은 viewport에서 Preview가 제거되더라도 List 생성 기능에 영향이 없다.

---

## 8.48 §8에서 의도적으로 미확정한 것

다음은 이후 섹션에서 확정한다.

```text
Modal 전체 keyboard focus 순서 / focus trap    → §9
Preview transition reduced-motion 세부          → §9 / §14
Error/Timeout message hierarchy                 → §10
생성 성공 후 실제 List 화면                     → §11
CreateListDraft/Status 최종 타입                 → §12
Preview와 View Registry type mapping             → §13
Responsive Preview 제거 breakpoint               → §14
실제 component 파일 구조                         → §15
전체 interaction state matrix                    → §16
```
# 9. Keyboard / Focus / Accessibility

## 9.1 설계 목표

Add List Modal은 마우스 없이도 전체 생성 Flow를 완료할 수 있어야 한다.

최소 Keyboard Flow:

```text
Lists +
→ Modal Open
→ Name 자동 Focus
→ 이름 입력
→ Enter
→ 생성
```

고급 설정을 사용하는 경우에도 Tab/Arrow/Esc만으로 조작할 수 있어야 한다.

이 섹션의 목표는 다음 네 가지다.

1. Modal Open 시 Focus 진입점을 예측 가능하게 한다.
2. Modal 밖으로 Focus가 빠져나가지 않게 한다.
3. Color/View/Folder와 같은 복합 Control의 Keyboard model을 일관되게 만든다.
4. Screen reader와 motion preference를 포함한 접근성을 보장한다.

---

## 9.2 Modal Open 시 Focus

Modal이 열리면 첫 Focus target은 항상 `Name input`이다.

```text
OPEN_EMPTY
→ focus(Name)
```

### MUST

- 사용자가 Modal이 나타난 직후 바로 타이핑할 수 있어야 한다.
- 별도의 click 없이 입력 가능해야 한다.
- Focus가 Add button이나 Modal root에 먼저 가면 안 된다.

---

## 9.3 Focus 진입 시점

Modal DOM이 mount된 뒤 즉시 Name input에 focus한다.

권장:

```text
requestAnimationFrame / effect after mount
```

### MUST NOT

```text
✕ animation 140ms가 끝난 뒤 focus
✕ 300ms 이상의 timeout 후 focus
```

시각 animation과 input readiness를 결합하지 않는다.

---

## 9.4 Focus Restoration

Modal을 닫으면 Focus는 Modal을 연 Trigger로 돌아간다.

예:

```text
Lists +
→ Modal
→ Cancel
→ focus(Lists +)
```

Folder `+`에서 열었다면:

```text
Folder +
→ Modal
→ Cancel
→ focus(Folder +)
```

### MUST

Trigger가 여전히 DOM에 존재하는 경우 원래 trigger로 Focus를 복구한다.

---

## 9.5 Trigger가 사라진 경우

Modal이 열려 있는 동안 원래 Trigger가 DOM에서 사라질 수 있다.

예:

```text
Folder 삭제
Sidebar 구조 변경
```

이 경우 fallback 순서:

```text
1. Lists section header +
2. Sidebar main region
3. App main landmark
```

Focus를 `body`에 방치하지 않는다.

---

## 9.6 Focus Trap

Modal Open 동안 Keyboard Focus는 Modal 내부를 벗어나면 안 된다.

즉:

```text
Tab at last item
→ first focusable item

Shift + Tab at first item
→ last focusable item
```

V1 focus trap 범위:

```text
Add List Modal root
+
Modal-owned popovers
```

---

## 9.7 Modal-owned Popover 포함

다음 child surface는 Focus trap 안에 포함한다.

```text
Custom Color Popover
Folder Dropdown
Folder Inline Create
Tooltip은 제외
```

Portal로 렌더하더라도 논리적으로 같은 Modal interaction scope로 취급한다.

---

## 9.8 기본 Tab 순서

Desktop 기준 기본 Tab order:

```text
1. Name Input
2. Color Group
3. Default View Group
4. Folder Trigger
5. Add
6. Cancel
→ 다시 Name
```

### 중요한 원칙

Color의 10개 swatch와 View의 3개 tile을 각각 Tab stop으로 만들지 않는다.

각 group은 **하나의 Tab stop**으로 취급한다.

---

## 9.9 Color Group 내부 Keyboard

§4 규칙을 따른다.

```text
Tab
→ selected Color로 Focus 진입

Left / Right
→ 이전 / 다음 Color
→ 즉시 선택

Home
→ None

End
→ Custom
```

### MUST

Arrow navigation이 Modal 전체 Focus 이동으로 해석되지 않는다.

---

## 9.10 Default View Group 내부 Keyboard

§5 규칙:

```text
Tab
→ 현재 selected View

Left / Right
→ 이전 / 다음 View
→ 즉시 선택

Home
→ List

End
→ 마지막 available View
```

예:

```text
List
Right → Board
Right → Gantt
```

---

## 9.11 Folder Trigger Keyboard

Closed 상태:

```text
Enter
Space
ArrowDown
→ Dropdown Open
```

Open 상태:

```text
ArrowUp / ArrowDown
→ item 이동

Enter / Space
→ 선택

Home / End
→ 첫/마지막 item

Esc
→ Dropdown Close
```

---

## 9.12 Folder Search Keyboard

Folder 수가 9개 이상이어서 Search가 존재할 때:

```text
Dropdown Open
→ Search Input Focus
```

Tab으로 item을 순회하지 않는다.

권장:

```text
Search input
ArrowDown
→ first list item
```

---

## 9.13 Inline Folder Create Keyboard

`+ 새 폴더` 선택 후:

```text
Focus → New Folder Name Input
```

동작:

```text
Enter
→ valid + not composing
→ Folder 생성

Esc
→ create mode 취소
→ Folder Dropdown 복귀
```

### MUST

Inline Folder input의 Enter가 Add List Submit으로 bubble되지 않는다.

---

## 9.14 Custom Color Popover Keyboard

Custom swatch 활성화:

```text
Enter / Space
→ Custom Color Popover Open
```

Popover Open 후:

```text
Focus → 첫 interactive control
```

예:

```text
Color area
Hex input
Apply
Cancel
```

Esc:

```text
→ Popover close
→ Focus Custom swatch 복귀
```

---

## 9.15 Esc 우선순위

Esc는 항상 **가장 안쪽 interaction layer부터** 처리한다.

우선순위:

```text
1. Custom Color Popover
2. Folder Inline Create
3. Folder Dropdown
4. 기타 Modal-owned Popover
5. Add List Modal
```

즉:

```text
Folder Dropdown Open
Esc
→ Dropdown Close

다시 Esc
→ Modal Close
```

---

## 9.16 Submitting 중 Esc

`SUBMITTING` 상태에서는:

```text
Esc → no-op
```

### MUST

request 진행 중 Modal을 닫지 않는다.

---

## 9.17 Enter 우선순위

Enter도 가장 안쪽 active control이 우선 처리한다.

우선순위:

```text
1. IME composition
2. Inline Folder Create
3. Folder Dropdown selection
4. Custom Color Popover
5. Focused Button/Radio
6. Name Submit
```

### 핵심

Name이 Focus된 경우에만 Enter를 빠른 Submit shortcut으로 취급한다.

---

## 9.18 Space Key

Space는 control semantics를 따른다.

예:

```text
Color swatch focus
Space → select

View tile focus
Space → select

Folder trigger focus
Space → open

Add focus
Space → submit
```

Name input 안에서는 일반 space character 입력.

---

## 9.19 Tab과 Child Surface

Child popover가 열려 있으면 Tab은 해당 child surface 안에서만 이동한다.

예:

```text
Custom Color Popover Open
Tab
→ Hex
→ Apply
→ Cancel
→ ...
```

Parent Modal controls로 바로 빠져나가지 않는다.

Popover close 후 Focus는 opening control로 복귀한다.

---

## 9.20 Focus Visible

모든 Keyboard focus는 명확한 visual indicator를 가져야 한다.

권장:

```css
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

### MUST

- focus ring을 `outline: none`으로 제거만 하면 안 된다.
- selected state와 focus state를 동시에 표현할 수 있어야 한다.
- Mouse click 시 불필요한 ring을 줄이기 위해 `:focus-visible`을 우선한다.

---

## 9.21 Focus Ring Token

전역 token:

```text
--focus-ring
```

을 사용한다.

### MUST

List Color를 Focus Ring으로 사용하지 않는다.

Focus는 app-wide interaction state이고 List identity와 분리한다.

---

## 9.22 Focus Clipping 방지

§2의 `overflow: hidden` 구조 때문에 ring이 잘리지 않도록 해야 한다.

특히:

```text
Name outer ring
Color swatch outline-offset
View tile focus ring
Folder dropdown trigger ring
Action buttons
```

에 충분한 spacing을 확보한다.

---

## 9.23 Screen Reader — Modal Root

Modal root:

```html
role="dialog"
aria-modal="true"
aria-labelledby="create-list-title"
```

Title:

```text
리스트 추가
```

을 `aria-labelledby`로 연결한다.

### MUST

screen reader가 Modal 진입 시 “리스트 추가 dialog”로 인식할 수 있어야 한다.

---

## 9.24 Modal Description

필수 설명문이 시각적으로 없기 때문에 `aria-describedby`는 억지로 추가하지 않아도 된다.

단 향후 설명이 추가되면 연결한다.

### 원칙

불필요한 장문 안내를 screen reader에 반복하지 않는다.

---

## 9.25 Name Accessibility

§3 규칙:

```html
<label class="sr-only" for="list-name">
  리스트 이름
</label>
```

또는 equivalent accessible name.

### MUST

placeholder만 accessible name으로 사용하지 않는다.

---

## 9.26 Color Accessibility

Color group:

```html
role="radiogroup"
aria-label="리스트 색상"
```

각 swatch:

```html
role="radio"
aria-checked="true|false"
```

이름:

```text
색상 없음
빨강
주황
노랑
라임
초록
파랑
인디고
보라
사용자 지정 색상
```

---

## 9.27 View Accessibility

View group:

```html
role="radiogroup"
aria-label="기본 보기"
```

각 tile:

```text
목록 보기
보드 보기
간트 보기
```

selected:

```html
aria-checked="true"
```

---

## 9.28 Folder Accessibility

Trigger:

```html
role="combobox"
aria-expanded="false|true"
aria-controls="folder-listbox"
```

Dropdown:

```html
role="listbox"
```

Item:

```html
role="option"
aria-selected="true|false"
```

---

## 9.29 Add / Cancel Accessibility

Add:

```html
type="submit"
```

Cancel:

```html
type="button"
```

Submitting:

```text
accessible label
→ 리스트 추가 중
```

Spinner:

```text
aria-hidden="true"
```

---

## 9.30 Disabled Semantics

가능하면 native disabled를 사용한다.

예:

```html
<button disabled>
```

Custom radio/listbox 요소는:

```text
aria-disabled
```

를 사용할 수 있다.

### MUST

visual disabled와 semantic disabled가 불일치하지 않는다.

---

## 9.31 Error Announcement

Error 발생 시 screen reader가 새 Error를 인식해야 한다.

권장:

```html
<div role="alert">
```

또는:

```html
aria-live="polite"
```

사용.

### 범위

- Name-specific error → Name과 연결
- Create failure → Action/Error area에서 announce

---

## 9.32 Loading Announcement

Submitting 시작 시 screen reader가 상태를 알 수 있어야 한다.

권장:

```text
Primary button label → 리스트 추가 중
```

이 정도로 충분하다.

Modal 전체에 반복적인 live region을 추가하지 않는다.

---

## 9.33 Success Announcement

성공 후 Modal이 닫히고 새 List가 화면에 표시되므로 과도한 success announcement는 필요 없다.

단 screen reader user에게 context change가 불명확한 경우:

```text
"학교 리스트가 생성되었습니다."
```

같은 짧은 polite announcement를 MAY 제공할 수 있다.

### 원칙

시각 사용자에게는 별도 toast 없음.

---

## 9.34 Focus Success 이동

생성 성공 후 Focus는 새 List 화면의 **Task composer / Quick Add**로 이동한다.

예:

```text
Create success
→ Navigate
→ focus(Quick Add)
```

### 이유

Add List Flow의 최종 상태가 `READY_FOR_FIRST_TASK`이기 때문이다.

---

## 9.35 Quick Add가 없는 View

예: Gantt 초기 구현에서 바로 입력 가능한 composer가 없을 수 있다.

fallback:

```text
1. View-level Add Task button
2. Main content heading
```

순서로 focus한다.

Focus를 Sidebar selected List에만 두고 끝내지 않는다.

---

## 9.36 Cancel Focus Restoration

Cancel:

```text
focus → original trigger
```

Error 후 Cancel도 동일.

---

## 9.37 Reduced Motion

사용자 OS가:

```text
prefers-reduced-motion: reduce
```

이면 다음 animation을 제거/축소한다.

```text
Modal scale
Preview crossfade
Chevron rotation
Swatch scale
Button pressed scale
```

권장:

```text
duration 0~50ms
```

Opacity 변화 정도만 남겨도 된다.

---

## 9.38 Motion에 의존한 정보 전달 금지

View 변경 여부를 animation만으로 알려주면 안 된다.

selected border와 Preview content 자체가 명확히 바뀌어야 한다.

---

## 9.39 Pointer와 Keyboard 동등성

Mouse로 가능한 핵심 action은 Keyboard로도 가능해야 한다.

매핑:

| Mouse | Keyboard |
|---|---|
| Name click | Tab / autoFocus |
| Color click | Arrow + Space/selection |
| View click | Arrow |
| Folder click | Enter/Space |
| Add click | Enter/Space |
| Cancel click | Tab + Enter/Space |
| Popover close | Esc |

---

## 9.40 Touch 접근성

Desktop spec이 중심이지만 interactive hit area는 최소 권장 범위를 유지한다.

```text
Swatch interaction box: 32px
View tile: 80×56
Folder trigger: 50px height
Buttons: 48px height
```

모바일에서는 §14에서 더 큰 touch target을 적용할 수 있다.

---

## 9.41 Color-only Information 금지

다음 상태는 color 하나만으로 표현하지 않는다.

```text
Selected Color → ring
Selected View → border + background
Error → text + icon/border
Focus → ring
```

### MUST

색각 다양성 사용자가 interaction state를 구분할 수 있어야 한다.

---

## 9.42 Tooltip Accessibility

Tooltip은 보조 설명이다.

Tooltip이 없어도 accessible name이 존재해야 한다.

즉:

```text
Tooltip text
≠
Accessibility label source
```

Tooltip이 hover에서만 나타나도 keyboard/screen reader 기능은 유지되어야 한다.

---

## 9.43 Logical Reading Order

DOM 순서는 시각적 순서를 따른다.

권장:

```text
Title
Name
Color
View
Folder
Actions
Preview
```

Preview는 비상호작용형이므로 DOM 끝에 두거나 `aria-hidden` 처리할 수 있다.

### MUST

CSS로 시각 위치만 바꾸고 DOM reading order를 이상하게 만들지 않는다.

---

## 9.44 Preview Screen Reader 처리

§8 권장:

```text
Preview skeleton → aria-hidden=true
```

Name/Color/View는 이미 Form control을 통해 전달되므로 중복 읽기를 피한다.

---

## 9.45 Focus Trap 구현 원칙

가능하면 검증된 Dialog primitive/library의 focus trap 기능을 재사용한다.

### MUST NOT

키다운 이벤트만으로 직접 Tab cycle을 임시 구현해 edge case를 늘리지 않는다.

다만 프로젝트에 primitive가 없다면:

```text
first focusable
last focusable
portal child 포함
restore focus
```

을 모두 고려한 공통 Dialog utility를 만든다.

---

## 9.46 Initial Focus Race Condition

Modal mount 직후 Folder data fetch나 View availability update가 발생해도 Name focus를 뺏지 않는다.

### MUST

async data load가 자동 focus를 다시 실행하지 않는다.

---

## 9.47 Focus Stealing 금지

다음 변화는 현재 Focus를 강제로 이동시키지 않는다.

```text
Color 변경
View 변경
Folder option load
Preview update
Error message 표시
```

예외:

```text
Modal Open
Child popover Open
Child popover Close
Create Success
Cancel Close
```

---

## 9.48 Error Focus 정책

Create failure 후 Focus는 기본적으로 Primary action(`다시 시도`)로 강제 이동시키지 않는다.

현재 focused element가 disabled 상태에서 다시 enabled 되었을 경우 가능한 한 자연스럽게 유지한다.

### 권장

Error message는 live region으로 announce하고 Focus는 사용자가 있던 위치에 유지.

### 이유

갑작스러운 focus jump는 keyboard 사용자에게 혼란을 준다.

---

## 9.49 Validation Error Focus

만약 submit validation에서 Name invalid가 발견되면:

```text
focus → Name
```

그리고 Name-specific error를 announce한다.

이는 server error와 다르다.

---

## 9.50 Focus 순서 — 기본 상태

```text
OPEN_EMPTY / OPEN_VALID

Name
→ Color Group
→ View Group
→ Folder
→ Add
→ Cancel
→ Name
```

Add가 disabled여도 native disabled라면 Tab 순서에서 빠질 수 있다.

### 본 설계 권장

disabled Add는 **Tab stop에서 제외**한다.

그러면 Empty 상태:

```text
Name
→ Color
→ View
→ Folder
→ Cancel
→ Name
```

Valid 상태:

```text
Name
→ Color
→ View
→ Folder
→ Add
→ Cancel
→ Name
```

---

## 9.51 Disabled Add와 Tab Order 변화

Add가 활성화될 때 Tab order가 하나 늘어나는 것은 허용한다.

다만 현재 Focus를 강제로 이동시키지 않는다.

---

## 9.52 Shortcut 확장 금지

V1에서는 다음 shortcut을 추가하지 않는다.

```text
Ctrl/Cmd + Enter
Alt + Enter
Ctrl + S
```

기본 Enter/Tab/Esc로 충분하다.

### 이유

utility Modal에서 shortcut 수를 늘리는 것은 기억 비용만 증가시킨다.

---

## 9.53 Screen Reader Modal Open Announcement

Modal Open 시 최소한 다음 정보가 전달되어야 한다.

```text
"리스트 추가, 대화상자"
```

Name에 Focus가 이동하므로 이어서:

```text
"리스트 이름, 편집"
```

정도로 자연스럽게 읽히는 구조를 만든다.

---

## 9.54 High Contrast Mode

OS/browser high-contrast 환경에서:

- selected border
- focus ring
- disabled state
- error state

가 사라지지 않아야 한다.

### 권장

background color만이 아니라 border/outline을 함께 사용한다.

---

## 9.55 Zoom / Text Scaling

브라우저 200% zoom에서도 주요 control이 잘리지 않아야 한다.

Desktop에서 Modal이 viewport를 초과하면 §14 Responsive 규칙으로 one-column 또는 scrollable form 구조로 전환한다.

### MUST

고정 700px 높이 때문에 Action button이 viewport 밖으로 사라지면 안 된다.

---

## 9.56 Language Expansion

영문/한글 외 언어에서 Label 길이가 늘어날 수 있다.

`Label column = 180px`은 현재 한국어 UI 기준이지만 text overflow가 발생하면:

```text
wrap 2 lines
```

보다는 §14/국제화 규칙에서 layout adaptation을 우선한다.

V1 한국어 기준에서는 한 줄 유지.

---

## 9.57 Accessibility State 목록

```text
1. MODAL_INITIAL_FOCUS
2. FOCUS_TRAPPED
3. CHILD_SURFACE_FOCUS
4. CHILD_SURFACE_RESTORE
5. SUBMITTING_LOCK
6. ERROR_ANNOUNCED
7. CANCEL_RESTORE
8. SUCCESS_FOCUS_TRANSFER
9. REDUCED_MOTION
```

---

## 9.58 Keyboard Interaction Matrix

| Context | Enter | Space | Esc | Arrow | Tab |
|---|---|---|---|---|---|
| Name | Submit* | type space | Close Modal | caret | next |
| Color | select/current | select | Close Modal | change color | next group |
| View | select/current | select | Close Modal | change view | next group |
| Folder Closed | Open | Open | Close Modal | Down opens | next |
| Folder Open | Select | Select | Close dropdown | move | trapped in child |
| Folder Create | Create* | type space | cancel create | caret | child controls |
| Custom Color | Apply/context | control action | close popover | picker-specific | child controls |
| Add | Submit | Submit | Close Modal | — | next |
| Cancel | Cancel | Cancel | Close Modal | — | wrap |

`*` IME composition 중에는 실행하지 않는다.

---

## 9.59 Accessibility Invariants

### INV-K01
Modal Open 시 Name이 initial focus다.

### INV-K02
Modal Open 동안 Focus는 Modal scope를 벗어나지 않는다.

### INV-K03
Modal Close 후 Focus는 opening trigger로 복귀한다.

### INV-K04
Color/View group은 각각 하나의 Tab stop이다.

### INV-K05
Child popover가 열려 있으면 Esc/Tab 처리는 child가 우선한다.

### INV-K06
Submitting 동안 Esc로 Modal을 닫을 수 없다.

### INV-K07
IME composition Enter는 submit action으로 처리하지 않는다.

### INV-K08
Selected/Focus/Error 상태는 color만으로 표현하지 않는다.

### INV-K09
Preview skeleton은 screen reader noise를 만들지 않는다.

### INV-K10
Reduced Motion preference를 존중한다.

### INV-K11
Create Success 후 Focus는 첫 Task action으로 이동한다.

### INV-K12
Mouse와 Keyboard의 핵심 기능 parity를 유지한다.

---

## 9.60 Accessibility Acceptance Criteria

### AC-K01
Modal Open 즉시 Name input에 Focus가 있다.

### AC-K02
Tab/Shift+Tab으로 Focus가 Modal 밖으로 빠져나가지 않는다.

### AC-K03
Cancel 후 Focus가 Modal을 연 `+` 버튼으로 돌아간다.

### AC-K04
Color group에서 Arrow key로 색상을 변경할 수 있다.

### AC-K05
View group에서 Arrow key로 기본 View를 변경할 수 있다.

### AC-K06
Folder Trigger를 Enter/Space로 열 수 있다.

### AC-K07
Folder Dropdown에서 Arrow + Enter로 선택할 수 있다.

### AC-K08
Custom Color Popover에서 Esc를 누르면 Popover만 닫힌다.

### AC-K09
Folder Dropdown Open 상태에서 첫 Esc는 Dropdown만 닫는다.

### AC-K10
Child surface가 모두 닫힌 상태의 Esc는 Modal을 닫는다.

### AC-K11
Submitting 중 Esc는 Modal을 닫지 않는다.

### AC-K12
Name의 IME composition Enter는 List Submit을 발생시키지 않는다.

### AC-K13
Modal root는 dialog semantics와 accessible title을 가진다.

### AC-K14
Color/View/Folder는 각각 적절한 radio/listbox semantics를 가진다.

### AC-K15
Create Error가 screen reader에 announce된다.

### AC-K16
Create Success 후 Focus가 Quick Add 또는 첫 Task action으로 이동한다.

### AC-K17
`prefers-reduced-motion` 환경에서 scale/crossfade animation이 제거 또는 크게 축소된다.

### AC-K18
200% zoom에서도 주요 field와 Action에 접근할 수 있다.

---

## 9.61 §9에서 의도적으로 미확정한 것

다음은 이후 섹션에서 확정한다.

```text
Error 종류별 메시지 및 복구 UX                  → §10
성공 후 실제 route/sidebar/quick-add 동작        → §11
Focus 관련 상태를 포함한 최종 State Model        → §12
Dialog primitive / View Registry 구현 계약        → §13 / §15
200% zoom 및 responsive breakpoint 구체값         → §14
최종 Interaction State Matrix                     → §16
통합 Acceptance Criteria                          → §17
```
# 10. Loading / Error / Edge Cases

## 10.1 설계 목표

Add List는 짧은 생성 Flow이지만 실제 운영 환경에서는 다음 문제가 발생할 수 있다.

```text
네트워크 지연
네트워크 단절
서버 오류
권한 변경
Folder 삭제
View availability 변경
중복 요청
partial success
앱 unmount
stale draft
sync conflict
```

이 섹션의 목표는 “정상 상황에서 예쁘게 동작하는 Modal”이 아니라 **실패해도 Draft를 잃지 않고, 중복 List를 만들지 않으며, 반쪽짜리 생성 상태를 노출하지 않는 생성 시스템**을 확정하는 것이다.

---

## 10.2 Error 처리의 기본 원칙

### R10-1. Draft 보존 — MUST

생성 실패가 발생해도 다음 값은 유지한다.

```text
name
color
defaultViewType
folderId
```

사용자가 동일한 정보를 다시 입력하게 하지 않는다.

---

### R10-2. 실패는 Modal 안에서 복구 — MUST

생성 실패 시:

```text
Modal close
→ toast
```

방식으로 처리하지 않는다.

권장:

```text
SUBMITTING
→ ERROR
→ Modal 유지
→ Draft 유지
→ 다시 시도
```

---

### R10-3. 사용자에게 반쪽 성공을 보여주지 않는다 — MUST

예:

```text
List row 생성 성공
View 연결 실패
```

이 상태를 그대로 Sidebar에 노출하지 않는다.

UX 관점에서:

```text
List + Default View
```

는 하나의 생성 결과다.

---

### R10-4. Error는 가능한 한 원인별로 복구 가능해야 한다 — SHOULD

모든 오류를:

```text
오류가 발생했습니다.
```

로 뭉개지 않는다.

다만 사용자에게 기술적 stack trace나 DB error code를 노출하지 않는다.

---

## 10.3 Error 분류

V1에서 최소 다음 category를 구분한다.

```text
E1. Validation Error
E2. Network Error
E3. Timeout
E4. Server Error
E5. Permission Error
E6. Folder Invalid / Deleted
E7. View Unavailable
E8. Conflict / Duplicate Request
E9. Partial Persistence Failure
E10. Unexpected Error
```

---

## 10.4 E1 — Validation Error

Client에서 가능한 validation:

```text
Name empty
Name whitespace only
Name > 80 chars
Invalid custom color
Invalid folderId
Unavailable default view
```

### 처리

가능하면 Submit 전에 막는다.

```text
invalid
→ 해당 control에 local error
→ focus relevant field
→ no request
```

### MUST

Validation error를 network request 실패처럼 Footer global error로만 보여주지 않는다.

---

## 10.5 Name Validation Error

예:

```text
리스트 이름을 입력하세요.
```

또는:

```text
리스트 이름은 80자 이하로 입력하세요.
```

Name field 아래에 표시.

Focus:

```text
→ Name
```

---

## 10.6 Custom Color Validation Error

예:

```text
올바른 HEX 색상 값을 입력하세요.
```

Custom Color Popover 내부에서 처리.

Add List global error state로 승격하지 않는다.

---

## 10.7 E2 — Network Error

요청 자체가 서버에 도달하지 못하거나 연결이 끊긴 경우.

예:

```text
offline
connection reset
DNS/network failure
```

사용자 메시지:

```text
네트워크에 연결할 수 없습니다.
연결 상태를 확인한 뒤 다시 시도해 주세요.
```

Action:

```text
[다시 시도] [취소]
```

Draft 유지.

---

## 10.8 Offline 감지

브라우저가 명확히 offline 상태라면 Submit 전에 감지할 수 있다.

```text
navigator.onLine === false
```

같은 hint를 사용할 수 있다.

단 이 값만 신뢰하지 않는다.

### 권장

```text
offline hint
+
실제 request failure
```

를 함께 사용한다.

---

## 10.9 Offline 상태에서 Add

온라인 전제 앱이라면:

```text
Add click
→ network error
→ Draft 유지
```

Local-first 앱이라면:

```text
local create
→ sync pending
```

구조도 가능하다.

### 중요

Add List 설계는 특정 sync architecture를 강제하지 않는다.

하지만 UX상 사용자에게 “성공”으로 보였다면 나중에 sync 실패로 List가 사라지지 않도록 해야 한다.

---

## 10.10 E3 — Timeout

요청이 일정 시간 이상 완료되지 않는 경우.

권장 timeout concept:

```text
10~15 seconds
```

정확한 API timeout은 infrastructure 정책을 따른다.

### UX

초기에는:

```text
추가 중...
```

유지.

timeout 발생 후:

```text
응답이 지연되고 있습니다.
다시 시도해 주세요.
```

로 ERROR 전환.

---

## 10.11 Timeout 이후 위험

Timeout은 실제 서버 처리 결과를 모를 수 있다.

즉:

```text
client timeout
but server create success
```

가능.

따라서 단순 Retry가 중복 List를 만들 수 있다.

### 해결

**Idempotency key**를 권장한다.

---

## 10.12 Idempotency Key

Create command마다 unique request ID를 생성한다.

예:

```text
createListRequestId = UUID
```

첫 Submit:

```text
requestId = A
```

Timeout 후 Retry:

```text
same logical Draft retry
→ requestId = A
```

서버는 이미 A를 처리했다면 기존 결과를 반환한다.

### MUST

Timeout/Retry로 동일 List가 두 번 생성되지 않게 한다.

---

## 10.13 Retry 시 requestId 정책

### 같은 생성 시도

```text
Timeout
Network response lost
Server unknown state
```

→ 같은 requestId 유지.

### 사용자가 Error 후 Draft를 수정

예:

```text
학교
→ error
→ 학교 프로젝트로 수정
```

이 경우 새로운 logical request로 보고:

```text
new requestId
```

생성.

---

## 10.14 E4 — Server Error

서버 내부 오류:

```text
500
DB unavailable
unexpected service failure
```

사용자 메시지:

```text
리스트를 만들지 못했습니다.
잠시 후 다시 시도해 주세요.
```

기술 세부사항은 숨긴다.

### Logging

내부 로그에는:

```text
requestId
user/scope id
error code
timestamp
```

등을 기록할 수 있다.

---

## 10.15 E5 — Permission Error

Modal Open 후 권한이 바뀔 수 있다.

예:

```text
Space read-only 전환
Folder create permission 제거
List create permission 제거
```

사용자 메시지:

```text
이 위치에 리스트를 만들 권한이 없습니다.
```

### Action

가능한 경우:

```text
Folder 변경
```

등으로 복구 가능하게 한다.

권한 자체가 전체 scope에서 사라진 경우 Add disabled 또는 Modal close guidance.

---

## 10.16 Permission Error 후 Draft

Draft는 유지한다.

사용자가 다른 Folder를 선택해 권한이 있는 위치로 바꿀 수 있다면 수정 후 Retry 가능.

---

## 10.17 E6 — Folder Invalid / Deleted

§6 규칙 재사용.

Submit 시 selected folder를 다시 validation한다.

상황:

```text
draft.folderId = A
A deleted
```

처리:

```text
draft.folderId = null
trigger = 없음
notice 표시
```

추천 message:

```text
선택한 폴더가 없어져 '없음'으로 변경했습니다.
```

### MUST

존재하지 않는 folderId로 create request를 보내지 않는다.

---

## 10.18 Folder 삭제 시 자동 Retry 여부

자동으로 root에 List를 생성하지 않는다.

### 이유

사용자가 Folder에 넣으려던 의도가 있었기 때문이다.

권장 Flow:

```text
Folder invalid
→ value reset to None
→ 사용자에게 알림
→ Add 다시 활성
→ 사용자가 확인 후 Submit
```

---

## 10.19 E7 — View Unavailable

Modal Open 시 Gantt가 available이었지만 feature flag/entitlement/state가 바뀔 수 있다.

Submit 직전:

```text
isDefaultViewAvailable()
```

재검증.

Unavailable이면:

```text
selected view를 자동 List로 바꾸지 않음
```

대신:

```text
선택한 기본 보기를 사용할 수 없습니다.
다른 보기를 선택해 주세요.
```

View row 관련 error 표시.

### 이유

사용자의 명시적 선택을 몰래 바꾸지 않는다.

---

## 10.20 View Unavailable 후 Focus

Focus:

```text
→ Default View group
```

사용자가 다른 View를 선택하도록 한다.

---

## 10.21 E8 — Conflict / Duplicate Request

빠른 click, retry, network replay 등으로 같은 request가 여러 번 도착할 수 있다.

### 방어 계층

```text
1. UI submitting lock
2. client command guard
3. idempotency key
4. server uniqueness/idempotency store
```

### MUST

UI guard 하나만으로 충분하다고 가정하지 않는다.

---

## 10.22 Duplicate Name과 Duplicate Request 구분

다음은 서로 다르다.

```text
같은 이름 List 2개를 사용자가 의도적으로 생성
→ 허용

같은 Submit request가 두 번 실행되어 List 2개 생성
→ 금지
```

이 차이를 domain에서 명확히 유지한다.

---

## 10.23 E9 — Partial Persistence Failure

예:

```text
List entity created
default View resolve failed
Sidebar metadata write failed
```

### 원칙

가능하면 transaction을 사용한다.

```text
all success
or
rollback
```

---

## 10.24 Transaction 사용이 어려운 경우

분산 구조나 여러 저장소를 사용하는 경우 transaction이 어려울 수 있다.

이때는 다음 중 하나를 사용한다.

```text
A. server orchestration command
B. idempotent compensating action
C. create pending state then finalize
```

사용자에게 intermediate entity를 노출하지 않는다.

---

## 10.25 Orphan List 방지

Create 실패 후 Sidebar에 빈 orphan List가 남아서는 안 된다.

예:

```text
학교
```

가 보이지만 열리지 않는 상태 금지.

### MUST

UI는 success response 전까지 Sidebar에 final item을 삽입하지 않는다.

---

## 10.26 Optimistic UI 정책

Add List V1에서는 **full optimistic create를 권장하지 않는다.**

즉:

```text
Add click
→ Sidebar에 즉시 가짜 List
→ 서버 실패 시 제거
```

보다:

```text
Add click
→ Modal loading
→ success
→ Sidebar insert
```

를 우선한다.

### 이유

생성 Flow가 짧고, orphan/revert complexity를 줄일 수 있다.

---

## 10.27 Perceived Speed 보완

Optimistic UI를 사용하지 않아도 다음으로 충분히 빠르게 느껴지게 한다.

```text
즉시 loading state
짧은 animation
빠른 success navigation
```

---

## 10.28 E10 — Unexpected Error

분류되지 않은 예외.

사용자 메시지:

```text
예상하지 못한 오류가 발생했습니다.
다시 시도해 주세요.
```

Draft 유지.

내부 logging 필수 권장.

---

## 10.29 Error Message 위치 우선순위

### Field-local

```text
Name
Custom Color
View
Folder
```

특정 field 관련 문제는 해당 field 근처.

### Global create error

```text
Network
Timeout
Server
Unexpected
```

는 Action Zone 위.

예:

```text
⚠ 리스트를 만들지 못했습니다. 다시 시도해 주세요.

                         [다시 시도] [취소]
```

---

## 10.30 Error Message 스타일

권장:

```text
font-size: 13~14px
icon: warning
color: danger text
```

하지만 큰 red alert box는 기본적으로 사용하지 않는다.

TickTick식 compact dialog 밀도를 유지한다.

---

## 10.31 Error 누적 금지

Retry를 여러 번 실패해도 Error message를 여러 개 쌓지 않는다.

```text
error area = latest actionable error
```

기존 message를 교체한다.

---

## 10.32 Error Clear 규칙

Field 관련 Error:

```text
해당 field 수정
→ error revalidate
→ 해결되면 clear
```

Global Error:

```text
Draft 수정
→ MAY clear
```

본 설계 권장:

**사용자가 Draft를 수정하면 global create error를 clear한다.**

이유:

이전 payload에 대한 오류일 수 있기 때문이다.

---

## 10.33 Retry 버튼 상태

Error 상태에서도 current Draft가 invalid면:

```text
다시 시도 disabled
```

예:

```text
error 후 Name 삭제
```

---

## 10.34 Loading 최소 표시 시간

서버가 매우 빠르더라도 artificial delay를 넣지 않는다.

즉:

```text
50ms success
→ 바로 success
```

허용.

### 이유

utility action에서 loading animation을 보여주기 위해 일부러 느리게 만들 필요가 없다.

---

## 10.35 Long Loading 상태

요청이 3~5초 이상 걸리더라도 기본 label은:

```text
추가 중
```

유지한다.

별도 progress bar는 필요 없다.

단 8~10초 이상 지연 시 timeout policy가 개입한다.

---

## 10.36 Cancel during Loading

V1:

```text
Cancel disabled
```

로 고정.

### 이유

request cancellation과 persistence 결과 불확실성을 UI에 노출하지 않는다.

향후 abortable command가 안정적으로 구현되면 별도 설계 가능.

---

## 10.37 App Unmount / Route Change

Submitting 중 외부 route change가 발생할 수 있다.

예:

```text
browser back
external navigation
app reload
```

### 권장

- Modal-level close는 막음
- app-level navigation은 전역 router 정책을 따름
- command layer는 request result를 idempotent하게 처리

---

## 10.38 Browser Refresh

Draft persistence는 V1 필수 요구사항이 아니다.

즉 브라우저 refresh 시 Draft가 사라져도 허용.

### 이유

Add List는 5~10초짜리 짧은 Flow다.

localStorage autosave까지 넣는 것은 과도하다.

---

## 10.39 Modal 장시간 방치 — Stale Draft

Modal을 오래 열어두면 Folder/View 목록이 stale해질 수 있다.

Submit 직전 다음을 재검증한다.

```text
folder validity
view availability
permission
scope validity
```

### MUST

Modal Open 시점의 metadata만 믿고 create하지 않는다.

---

## 10.40 Scope 변경

Background에서 Space가 바뀌는 것은 Modal Open 중 일반적으로 불가능해야 한다.

하지만 programmatic state change가 발생하면:

```text
creationScopeId
```

는 Modal Open 시 snapshot을 유지한다.

Submit 시 scope가 still valid인지 확인.

### MUST

현재 화면이 바뀌었다고 Draft가 다른 Space로 이동하지 않는다.

---

## 10.41 Scope 삭제

현재 creation scope 자체가 삭제되면:

```text
Create 불가
```

사용자 메시지:

```text
이 위치가 더 이상 존재하지 않습니다.
```

Modal을 유지하더라도 Retry 불가.

Action:

```text
[닫기]
```

또는 Cancel만 활성.

---

## 10.42 Folder Create와 List Create Race

Inline Folder creation 직후 List Add를 빠르게 누를 수 있다.

규칙:

```text
folderCreateStatus=submitting
→ Add disabled
```

Folder 생성 success 후:

```text
folderId 확정
→ Add enabled
```

### MUST

temporary folder ID로 List를 생성하지 않는다.

---

## 10.43 View Registry Load Failure

Available View 목록을 불러오는 데 실패한 경우.

권장:

```text
List View만 guaranteed fallback
```

단 제품 architecture상 List View 자체도 registry에서 resolve되어야 한다면:

```text
기본 보기를 불러오지 못했습니다.
```

로 생성 차단.

### 원칙

존재 여부를 모르는 View를 선택 가능하게 표시하지 않는다.

---

## 10.44 Preview Failure

Preview component 렌더 오류가 발생해도 Add List 기능 자체는 유지되어야 한다.

Error boundary 권장:

```text
Preview fails
→ Preview hidden/fallback
→ Form usable
```

### 이유

Preview는 optional presentation layer다.

---

## 10.45 Folder List Load Failure

§6 규칙:

```text
None 유지 가능
Retry Folder load
```

Folder load 실패 때문에 root List 생성까지 막지 않는다.

---

## 10.46 Error Priority

여러 오류가 동시에 있을 수 있다.

우선순위:

```text
1. Local validation
2. Scope/Permission
3. Folder/View invalid
4. Network/Timeout
5. Server
6. Unexpected
```

가장 actionable한 오류를 먼저 보여준다.

---

## 10.47 Multiple Field Error

예:

```text
Name invalid
Folder invalid
```

Submit 전 validation에서:

```text
첫 invalid control에 Focus
+
각 control에 local error
```

global message:

```text
입력 내용을 확인해 주세요.
```

는 MAY 사용.

---

## 10.48 Server-side Validation Drift

Client는 valid라고 판단했지만 서버 rule이 더 최신일 수 있다.

예:

```text
new max name length
new reserved character rule
```

서버가 field-specific error code를 반환하면 UI에서 해당 field error로 매핑한다.

### MUST

가능한 경우 server error를 generic error로만 처리하지 않는다.

---

## 10.49 Error Code Mapping

권장 domain error enum:

```ts
type CreateListErrorCode =
  | "INVALID_NAME"
  | "INVALID_FOLDER"
  | "VIEW_UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "SCOPE_NOT_FOUND"
  | "NETWORK"
  | "TIMEOUT"
  | "CONFLICT"
  | "SERVER"
  | "UNKNOWN";
```

UI는 code를 message로 map한다.

---

## 10.50 Raw Error 노출 금지

사용자에게 다음을 보여주지 않는다.

```text
Postgres error
HTTP stack
Supabase error JSON
TypeError
Internal ID
```

내부 로그에만 기록한다.

---

## 10.51 Retry 정책

Retry 가능한 오류:

```text
Network
Timeout
Server
Unknown transient
```

조건부 Retry:

```text
Permission → location change 필요
Folder invalid → folder 재선택
View unavailable → view 재선택
```

Retry 불가:

```text
Scope deleted
```

---

## 10.52 Automatic Retry

V1에서는 자동 Retry를 기본 사용하지 않는다.

### 이유

Create는 mutation이며 사용자가 의도하지 않은 시점에 재실행되는 위험이 있다.

단 network layer가 **request 송신 전 실패가 확실한 경우** 1회 transport retry를 지원할 수 있다.

---

## 10.53 Retry 횟수 제한

UI에서 `다시 시도`를 몇 번 누를 수 있는지 제한하지 않는다.

하지만 동일 requestId를 사용하는 timeout retry는 idempotent해야 한다.

---

## 10.54 Success Response Lost

가장 까다로운 edge case.

상황:

```text
server success
response lost
client sees network error
```

Retry:

```text
same requestId
```

서버:

```text
existing result return
```

UI:

```text
success 처리
```

이것이 idempotency가 필요한 핵심 이유다.

---

## 10.55 Success Navigation Failure

Create 성공 후 Router transition이 실패할 수 있다.

List 자체는 이미 생성됨.

권장 fallback:

```text
Sidebar에 List 반영
Toast/inline notice:
"리스트는 생성되었지만 화면을 열지 못했습니다."
```

그리고:

```text
새 List row selected 또는 clickable
```

### 중요

이 경우 Create request를 Retry하지 않는다.

Persistence는 이미 성공했기 때문이다.

---

## 10.56 Sidebar Refresh Failure

Create 성공 후 Sidebar state cache update가 실패할 수 있다.

권장:

```text
invalidate/refetch
```

그래도 실패하면 Main route에서 생성 결과를 열 수 있게 한다.

### 원칙

Post-create UI sync failure와 Create failure를 구분한다.

---

## 10.57 Success 이후 Error 재분류

Create success response를 받은 이후 발생한 오류는:

```text
PostCreateError
```

로 취급한다.

이때 Modal을 다시 열고 `다시 시도`를 누르게 하면 중복 생성 위험이 있다.

### MUST

Persistence success 이후에는 Create Retry UI로 돌아가지 않는다.

---

## 10.58 Post-create Error 예

```text
Navigation failed
Sidebar cache refresh failed
Quick Add focus failed
```

이들은 List 생성 자체 실패가 아니다.

---

## 10.59 Focus Failure

Create success 후 Quick Add element가 아직 mount되지 않았다면:

```text
retry focus on next frame
```

정도 허용.

최종 fallback:

```text
main heading
```

Focus 실패 때문에 생성 결과를 rollback하지 않는다.

---

## 10.60 Error Telemetry

운영 품질을 위해 최소 다음 event를 기록하는 것을 권장한다.

```text
create_list_submit
create_list_success
create_list_error
create_list_retry
create_list_cancel
```

error event metadata:

```text
errorCode
requestId
scopeType
selectedViewType
hasFolder
duration
```

개인 정보나 List name 원문은 필요하지 않다면 로그하지 않는다.

---

## 10.61 Loading State Machine 확장

§1의 상태를 더 구체화하면:

```text
OPEN_VALID
  ↓
SUBMITTING
  ├─ PERSISTENCE_SUCCESS
  │     ↓
  │   POST_CREATE_SYNC
  │     ├─ success → READY_FOR_FIRST_TASK
  │     └─ failure → POST_CREATE_RECOVERY
  │
  └─ PERSISTENCE_FAILURE
        ↓
      ERROR
```

### 중요

`POST_CREATE_SYNC` 실패는 create Retry로 돌아가지 않는다.

---

## 10.62 Error State Draft 변경

ERROR 상태에서 사용자가 field를 수정하면:

```text
errorContext.clear()
```

권장.

상태는 다시:

```text
OPEN_VALID
or
OPEN_EMPTY
```

로 돌아간다.

---

## 10.63 Error Banner 높이

Error message가 생겨도 Action Zone이 크게 점프하지 않도록 error slot을 미리 확보할 수 있다.

권장:

```text
min-height: 20~24px
```

### Trade-off

항상 빈 공간이 보이는 것이 싫다면 animation 없이 Action 위에 삽입하되 전체 modal height는 고정 유지.

---

## 10.64 Error Color 사용

danger color는 다음에만 사용한다.

```text
error icon
error text
field error border
```

Add button 자체를 red로 바꾸지 않는다.

Retry는 여전히 primary action이다.

---

## 10.65 Disabled State와 Error 구분

예:

```text
Name empty
→ Add disabled
```

는 Error가 아니다.

### MUST

초기 empty state에 red warning을 표시하지 않는다.

---

## 10.66 Permission / Scope Error 후 Cancel

Retry 불가능한 오류에서는 Primary action을 숨기거나 disabled하고 Cancel/Close만 제공할 수 있다.

예:

```text
이 위치가 더 이상 존재하지 않습니다.

[닫기]
```

TickTick식 2-button 구조보다 상황 적합성을 우선한다.

---

## 10.67 Server Conflict with Folder SortOrder

동시에 여러 List가 같은 Folder 마지막에 생성되면 sortOrder 충돌이 가능하다.

이 문제는 UI가 아니라 domain layer에서 해결한다.

권장:

```text
fractional order
server-assigned order
transactional sequence
```

### MUST

UI가 마지막 sortOrder를 계산해 DB에 직접 쓰는 구조를 피한다.

---

## 10.68 Retry 후 Sidebar 중복 방지

Retry success 시 결과 listId 기준으로 Sidebar cache insert를 de-duplicate한다.

예:

```text
if listId already exists
→ update/select
not append again
```

---

## 10.69 Modal Reopen 직후 이전 Error

Modal을 닫고 새로 열면 이전 Error와 Draft를 재사용하지 않는다.

새 Modal session:

```text
fresh draft
fresh requestId
fresh error state
```

---

## 10.70 Session ID

각 Modal open마다:

```text
createSessionId
```

를 생성하는 것을 MAY 권장한다.

용도:

```text
telemetry
request grouping
stale async response 방지
```

---

## 10.71 Stale Response 방지

Modal A가 닫히고 Modal B가 열렸는데 A의 async response가 늦게 올 수 있다.

### MUST

현재 session과 일치하지 않는 response가 새 Modal state를 덮어쓰지 않도록 한다.

개념:

```ts
if (response.sessionId !== currentSessionId) return;
```

또는 command cancellation.

---

## 10.72 AbortController

가능하면 network request에 AbortController를 사용할 수 있다.

단 V1에서는 submitting 중 user cancel을 허용하지 않으므로 주 용도는:

```text
component unmount
app shutdown
stale session
```

이다.

---

## 10.73 Error Recovery UX 요약

```text
Validation
→ field 수정

Network/Timeout/Server
→ 다시 시도

Folder invalid
→ Folder 재선택

View unavailable
→ View 재선택

Permission
→ 가능한 위치 변경

Scope deleted
→ 닫기

Post-create sync failure
→ 생성 결과 유지 + UI recovery
```

---

## 10.74 Error Invariants

### INV-E01
Create failure 시 Draft를 초기화하지 않는다.

### INV-E02
Create failure 시 Modal을 자동으로 닫지 않는다.

### INV-E03
Validation error는 가능한 한 field-local로 표시한다.

### INV-E04
Timeout/Retry는 idempotent해야 한다.

### INV-E05
Duplicate request로 같은 List가 두 번 생성되지 않는다.

### INV-E06
Partial persistence 상태를 사용자에게 노출하지 않는다.

### INV-E07
Persistence success 이후 UI sync failure를 Create failure로 재분류하지 않는다.

### INV-E08
삭제된 Folder나 unavailable View를 자동으로 다른 값으로 몰래 바꾸지 않는다.

### INV-E09
Raw technical error를 사용자에게 노출하지 않는다.

### INV-E10
Stale async response가 새 Modal session state를 덮어쓰지 않는다.

### INV-E11
Preview failure가 List 생성 기능을 막지 않는다.

### INV-E12
Retry는 current valid Draft를 사용한다.

---

## 10.75 Error Acceptance Criteria

### AC-E01
Network 실패 시 Modal과 Draft가 유지된다.

### AC-E02
Network 실패 후 `다시 시도`를 사용할 수 있다.

### AC-E03
Timeout 후 Retry로 동일 List가 중복 생성되지 않는다.

### AC-E04
Server error 시 사용자에게 기술적 error payload가 노출되지 않는다.

### AC-E05
선택 Folder가 삭제되면 invalid folderId로 Submit하지 않는다.

### AC-E06
선택 View가 unavailable이면 사용자에게 다른 View 선택을 요구한다.

### AC-E07
List 생성과 default View 연결 중 일부만 성공한 상태가 Sidebar에 노출되지 않는다.

### AC-E08
Submitting 동안 빠른 Add/Enter 반복으로 중복 request가 생성되지 않는다.

### AC-E09
Error 후 Draft 수정 시 이전 global error가 정리된다.

### AC-E10
Create success response가 유실된 뒤 Retry해도 idempotency key로 기존 결과를 복구할 수 있다.

### AC-E11
Create 성공 후 Sidebar refresh가 실패해도 Create Retry UI로 돌아가지 않는다.

### AC-E12
Preview rendering error가 발생해도 Form과 Add는 계속 사용할 수 있다.

### AC-E13
Scope가 삭제된 경우 Retry 불가 상태와 명확한 종료 action이 표시된다.

### AC-E14
Modal을 닫고 다시 열면 이전 error/session state가 남지 않는다.

### AC-E15
이전 Modal session의 늦은 async response가 현재 Modal을 변경하지 않는다.

### AC-E16
Folder inline create 실패가 Add List Draft를 초기화하지 않는다.

### AC-E17
Validation error와 network/server error가 서로 다른 위치와 방식으로 표시된다.

### AC-E18
Post-create navigation 실패 시 생성된 List 자체는 유지된다.

---

## 10.76 §10에서 의도적으로 미확정한 것

다음은 이후 섹션에서 확정한다.

```text
생성 성공 후 Sidebar expand / route / Quick Add       → §11
CreateListState / ErrorState / SessionState 실제 타입   → §12
DB transaction / idempotency endpoint / schema          → §13
Offline/local-first 지원 여부                            → 제품 인프라 정책
Responsive에서 error slot 배치                           → §14
ErrorBoundary / hook / command 파일 구조                → §15
전체 interaction matrix                                  → §16
최종 통합 Acceptance Criteria                           → §17
```
# 11. 생성 이후 Navigation

## 11.1 설계 목표

Add List의 성공은 DB에 List가 생성되는 순간으로 끝나지 않는다.

사용자 관점에서 성공의 완료 조건은 다음이다.

```text
List 생성
→ Sidebar 반영
→ 새 List 선택
→ 선택한 Default View 진입
→ 첫 Task를 만들 수 있는 상태
```

따라서 생성 이후 Navigation은 단순 route change가 아니라 **생성 결과를 사용자에게 즉시 확인시키고 다음 행동까지 연결하는 post-create flow**다.

---

## 11.2 최종 성공 상태

§1에서 정의한 최종 상태:

```text
READY_FOR_FIRST_TASK
```

이 상태는 다음 조건을 모두 만족해야 한다.

```text
1. 새 List가 실제로 존재한다.
2. Sidebar에 새 List가 보인다.
3. 새 List가 active selection이다.
4. 선택한 default View가 열린다.
5. Main content가 새 List scope를 가리킨다.
6. 첫 Task를 추가할 수 있는 control에 접근 가능하다.
```

---

## 11.3 성공 후 전체 순서

권장 sequence:

```text
SUBMITTING
   ↓
PERSISTENCE_SUCCESS
   ↓
POST_CREATE_SYNC
   ↓
1. Sidebar cache/list state 갱신
2. 필요한 Folder expand
3. Modal close
4. 새 List active selection
5. URL / route 전환
6. Default View render
7. Main content ready
8. Quick Add / Add Task focus
   ↓
READY_FOR_FIRST_TASK
```

실제 구현에서는 일부 단계가 병렬일 수 있지만 사용자에게 보이는 결과는 위 순서를 만족해야 한다.

---

## 11.4 Modal Close 시점

Create persistence가 성공하기 전에는 Modal을 닫지 않는다.

성공 응답을 받은 뒤 Modal을 닫는다.

### 권장

```text
success response
→ post-create target 확보
→ Modal close
→ navigation
```

### MUST NOT

```text
Add click
→ Modal 즉시 close
→ background에서 create
```

방식을 사용하지 않는다.

### 이유

실패 시 Draft를 잃고 사용자가 결과 상태를 이해하기 어려워진다.

---

## 11.5 Sidebar 삽입

새 List는 해당 parent container에 즉시 반영한다.

### Folder 없음

```text
Lists
├─ 기존 A
├─ 기존 B
└─ 새 List    ← selected
```

### Folder 있음

```text
대학원
├─ 기존 A
├─ 기존 B
└─ 새 List    ← selected
```

### 정렬

기본적으로 해당 container의 마지막에 삽입한다.

자동 가나다/알파벳 정렬은 하지 않는다.

---

## 11.6 Sidebar optimistic 여부

§10 원칙에 따라 persistence 성공 전에는 Sidebar에 final List를 넣지 않는다.

성공 후에는 cache update를 즉시 적용해 route보다 늦게 보이지 않게 한다.

즉:

```text
not optimistic before success
but immediate UI sync after success
```

---

## 11.7 Folder 자동 Expand

새 List가 Folder 안에 생성되었는데 해당 Folder가 collapsed 상태라면:

```text
create success
→ Folder expand
→ new List visible
```

### MUST

새 List가 생성되었는데 collapsed Folder 안에 숨겨져 사용자가 결과를 볼 수 없는 상태를 만들지 않는다.

---

## 11.8 Folder Expand 유지 정책

자동으로 펼친 Folder는 사용자 상태를 변경한다.

V1 권장:

```text
Folder expanded state를 유지
```

즉 생성 후 바로 다시 collapse하지 않는다.

### 이유

사용자가 방금 생성한 List의 위치를 이해하고 이후 탐색하기 쉽다.

---

## 11.9 Root List 생성 시 Sidebar Scroll

새 List가 Sidebar viewport 아래쪽에 추가되어 보이지 않을 수 있다.

성공 후 selected List가 보이도록:

```text
scrollIntoView({
  block: "nearest"
})
```

정도의 최소 scrolling을 적용한다.

### MUST NOT

Sidebar를 항상 맨 아래로 강제로 점프시키지 않는다.

---

## 11.10 Folder 내부 Scroll

Folder가 길어서 새 List가 viewport 밖에 있는 경우에도 selected row가 보이도록 `nearest` scrolling을 적용한다.

---

## 11.11 Active Selection

새 List가 Sidebar의 active selection이 된다.

```text
previousList.active = false
newList.active = true
```

### MUST

생성 직후에도 기존 List가 selected 상태로 남아 있지 않는다.

---

## 11.12 Selected Visual

Sidebar selected visual은 기존 앱 navigation selection style을 그대로 사용한다.

List Color를 selection background로 사용하지 않는다.

즉:

```text
List identity color
+
App selected row state
```

는 분리한다.

---

## 11.13 URL 전환

Modal Open 자체에서는 URL을 바꾸지 않았지만 생성 성공 후에는 새 List가 navigation target이 된다.

개념적 route:

```text
/list/:listId
```

또는:

```text
/space/:spaceId/list/:listId
```

View가 route에 포함되는 앱이라면:

```text
/list/:listId?view=board
```

같은 구조를 사용할 수 있다.

### MUST

정확한 URL schema는 기존 앱 routing convention을 따른다.

Add List만 별도 예외 route를 만들지 않는다.

---

## 11.14 Default View Route 적용

생성 시:

```text
defaultViewType = "board"
```

였다면 성공 후 Board가 active여야 한다.

예:

```text
학교

[List] [Board] [Calendar] [Gantt]
        ↑ active
```

### MUST

생성 후 무조건 List View로 열었다가 Board로 전환하는 flicker를 만들지 않는다.

---

## 11.15 Route와 View State Atomicity

가능하면 route navigation target을 처음부터:

```text
newList + defaultView
```

조합으로 만든다.

잘못된 sequence:

```text
/new-list/list
→ render
→ /new-list/board
```

권장:

```text
/new-list/board
→ one render path
```

---

## 11.16 Main Content 초기 렌더

새 List가 비어 있으므로 Main은 Empty State보다 **첫 Task action을 중심으로** 보여준다.

### List View

```text
학교

+ 작업 추가
────────────────────────
```

### Board View

```text
학교

TODO        DOING        DONE
────        ─────        ────
+ 작업
```

### Gantt View

```text
학교

작업              Timeline
──────────────────────────
+ 작업 추가
```

---

## 11.17 Empty State 원칙

새 List에서 다음과 같은 큰 illustration 중심 empty state는 권장하지 않는다.

```text
아직 작업이 없습니다.
첫 작업을 만들어 보세요.
[시작하기]
```

### 이유

생성 직후 사용자의 다음 행동은 이미 명확하다.

작업 입력 control을 바로 보여주는 것이 더 빠르다.

---

## 11.18 Quick Add Focus

생성 성공 후 가능한 경우 첫 Task 입력 control에 focus한다.

### List View

```text
focus → Quick Add input
```

### Board View

권장 우선순위:

```text
1. Board-level Add Task input
2. 첫 Column Add Task
3. Add Task button
```

### Gantt View

```text
1. Gantt Add Task row/input
2. Add Task button
3. Main heading
```

---

## 11.19 Quick Add 자동 Focus 조건

Desktop keyboard/mouse 생성 모두 기본적으로 autofocus를 권장한다.

단 다음 상황에서는 focus 이동을 생략할 수 있다.

```text
navigation transition 중 user가 다른 control을 직접 클릭
accessibility primitive가 explicit user focus를 감지
mobile keyboard 자동 호출이 UX를 방해하는 경우
```

모바일은 §14에서 별도 결정한다.

---

## 11.20 Focus Timing

route render가 완료되기 전에 focus를 시도하지 않는다.

권장:

```text
navigate
→ view mounted
→ requestAnimationFrame
→ focus Quick Add
```

필요 시 최대 소수 회 retry 가능.

### MUST

setTimeout 수백 ms 같은 불안정한 고정 delay에 의존하지 않는다.

---

## 11.21 Focus Fallback

Quick Add가 존재하지 않으면:

```text
1. Add Task button
2. Main View heading
3. Main content container
```

순서.

---

## 11.22 생성 직후 Toast

기본적으로 success toast를 띄우지 않는다.

이유:

```text
Sidebar new row
+
Main content changed
+
selected state
```

자체가 충분한 feedback이다.

### MAY

screen reader용 polite announcement는 유지 가능.

---

## 11.23 New Item Highlight

Sidebar 새 List에 짧은 highlight animation을 넣는 것은 MAY 허용한다.

예:

```text
subtle background fade
300~500ms
```

하지만 selected state가 이미 존재하므로 필수는 아니다.

### MUST NOT

```text
bounce
pulse 반복
bright flashing
```

---

## 11.24 Browser History

생성 성공 후 새 List route 진입은 일반적으로 history entry를 추가한다.

즉:

```text
push
```

를 권장.

사용자가 Browser Back을 누르면 Modal 이전의 화면으로 돌아갈 수 있다.

### MUST

Modal Open 자체를 history entry로 만들지 않는다.

---

## 11.25 Back Navigation

생성 후 Browser Back:

```text
new List
→ previous page/list
```

새로 생성된 List 자체는 삭제되지 않는다.

Back은 navigation일 뿐 undo가 아니다.

---

## 11.26 Undo Create

V1에서는 생성 직후 Undo toast를 제공하지 않는다.

List 삭제/Archive는 별도 List management flow에서 처리한다.

### 이유

Undo를 넣으면 create/delete lifecycle과 sync complexity가 늘어난다.

---

## 11.27 Folder에서 생성 후 위치 확인

예:

```text
대학원
  ├─ 연구
  └─ 논문 ← new
```

성공 후:

```text
대학원 expanded
논문 selected
```

가 동시에 보여야 한다.

---

## 11.28 Selected Folder 상태

Folder 자체를 active selection으로 남기지 않는다.

새 List가 active target이 된다.

---

## 11.29 Sidebar Counts

Folder/List count를 표시하는 UI가 있다면 create 성공 후 즉시 갱신한다.

예:

```text
Lists 12
→ Lists 13
```

단 count semantics가 Task count라면 List 생성 때문에 변경하면 안 된다.

### MUST

count meaning에 맞는 값만 업데이트한다.

---

## 11.30 Smart List / Index 반영

새 List가 Smart List나 검색 index에 포함되는 구조가 있다면 background sync가 가능하다.

하지만 생성 성공 후 Navigation을 그 sync 완료까지 기다리지 않는다.

### 이유

새 List 본체 생성과 secondary indexing은 분리할 수 있다.

---

## 11.31 Post-create Sync 단계

Persistence 성공 후 최소 UI sync:

```text
List cache insert
Folder tree update
selection update
route update
```

Secondary sync:

```text
search index
analytics
smart list index
recent items
```

는 navigation 이후 async 가능.

---

## 11.32 Post-create 실패 분류

§10 원칙:

```text
Persistence success
+
Navigation/Sidebar sync fail
≠ Create failure
```

즉 Modal을 다시 열어 `다시 시도`를 보여주지 않는다.

---

## 11.33 Sidebar Cache Insert 실패

권장 fallback:

```text
1. cache invalidate
2. refetch
3. route는 listId로 진행
```

Main route가 성공하면 사용자는 생성된 List를 사용할 수 있다.

---

## 11.34 Folder Tree Refetch 실패

List가 Folder에 생성되었지만 tree refresh가 실패한 경우:

```text
Main route open
+
sidebar refetch retry
```

필요 시 non-blocking notice.

### MUST

Create API를 다시 호출하지 않는다.

---

## 11.35 Navigation 실패

List는 이미 생성되었으나 route navigation 자체가 실패한 경우.

표시 예:

```text
리스트는 생성되었지만 화면을 열지 못했습니다.
Sidebar에서 다시 열어 주세요.
```

가능하면 Sidebar에 새 List를 보이게 한다.

---

## 11.36 Navigation Retry

이 경우 Retry 대상은:

```text
navigateToList(listId)
```

이지:

```text
createList()
```

가 아니다.

### MUST

post-create error recovery가 중복 List 생성을 유발하지 않는다.

---

## 11.37 Default View Resolve 실패 — Post-create

Persistence 단계에서 default View 연결을 atomic하게 처리했다면 이 경우가 없어야 한다.

만약 lazy resolve 구조라 first open에서 resolve가 실패하면:

```text
fallback List View
+
notice
```

를 사용할 수 있다.

단 defaultViewType preference는 유지하고 이후 retry 가능하도록 한다.

---

## 11.38 Lazy View Fallback 정책

lazy View Registry 구조에서:

```text
Board resolve failed
```

이면:

```text
List View fallback
```

가능.

사용자 메시지:

```text
보드 보기를 열지 못해 목록 보기로 열었습니다.
```

### 중요

이 fallback은 post-create rendering failure에만 해당한다.

Submit 전 `Board unavailable`을 몰래 List로 바꾸는 것은 금지한다.

---

## 11.39 Main Header

생성 후 Main Header에는 최소:

```text
List Name
View Switcher
More/Settings
```

가 보인다.

Color가 있는 경우 identity accent를 작게 표시할 수 있다.

---

## 11.40 Default View Switcher

생성 후 사용자가 다른 View로 자유롭게 이동 가능해야 한다.

```text
[List] [Board] [Calendar] [Gantt]
```

현재 default View가 active.

### MUST

default View 설정 때문에 다른 View tab을 숨기지 않는다.

---

## 11.41 Current View vs Default View

생성 직후:

```text
currentView = defaultView
```

이지만 이후 사용자가 전환하면:

```text
currentView ≠ defaultView
```

가능.

View 전환만으로 defaultView setting을 바꾸지 않는다.

---

## 11.42 URL 직접 접근

새 List route는 refresh 후에도 동일 List/View를 복구할 수 있어야 한다.

즉 생성 success 후 사용하는 URL이 ephemeral modal state에 의존하면 안 된다.

---

## 11.43 Sidebar Selection Source of Truth

권장:

```text
route/scope state
→ active sidebar selection derive
```

즉 Sidebar selected state를 별도 임시 boolean로만 관리하지 않는다.

### 이유

route와 sidebar가 어긋나는 문제를 줄인다.

---

## 11.44 New List ID

Navigation은 반드시 서버/domain에서 확정된 `listId`를 사용한다.

Name으로 route target을 찾지 않는다.

동일 Name 허용 정책과 일관된다.

---

## 11.45 Folder Rename 직후

생성 직후 Folder 이름이 바뀌더라도 listId/folderId 기반이므로 navigation에는 영향 없어야 한다.

---

## 11.46 Browser Refresh 직후 Sidebar

새 List route에서 refresh해도 sidebar tree가 해당 List를 포함하고 active selection을 재구성해야 한다.

이 요구는 Add List post-create flow가 durable하다는 뜻이다.

---

## 11.47 Analytics Timing

성공 event는 persistence 성공 시 기록한다.

추가 event:

```text
create_list_opened_default_view
create_list_ready_for_first_task
```

을 MAY 기록할 수 있다.

### 핵심

`create_list_success`를 Quick Add focus 성공 여부에 종속시키지 않는다.

---

## 11.48 Time-to-Ready 지표

UX 품질 측정을 위해:

```text
Add click
→ READY_FOR_FIRST_TASK
```

시간을 측정할 수 있다.

권장 목표:

```text
일반 네트워크에서 1초 내외 체감
```

정확한 SLA는 인프라 상황에 따라 별도 정의.

---

## 11.49 Animation

Modal close와 Main route transition 사이에 별도 페이지 transition을 강하게 넣지 않는다.

권장:

```text
Modal fade out
→ Main content immediate update
```

### MUST NOT

```text
full-screen loading transition
large slide animation
```

---

## 11.50 Skeleton 필요 여부

새 List는 비어 있으므로 데이터 로딩 skeleton이 거의 필요 없다.

List entity 기본 metadata가 success response에 있다면 즉시 header를 렌더한다.

Secondary data는 background fetch.

---

## 11.51 Main Content Loading

View engine이 반드시 async load를 필요로 하면:

```text
Header immediately
Body small skeleton
```

정도는 허용.

하지만 Quick Add 가능 상태를 불필요하게 늦추지 않는다.

---

## 11.52 Empty Task Collection

새 List는 자연스럽게:

```text
tasks = []
```

상태다.

이것을 Error나 special onboarding state로 취급하지 않는다.

---

## 11.53 Board Default Columns

Board View가 default라면 새 List에 default board structure가 즉시 보인다.

Column schema가 preset 기반이면 resolve해서 표시.

Add List Modal에서 설정하지 않았던 이유와 일관된다.

---

## 11.54 Gantt Empty State

Gantt 진입:

```text
Task row area
Timeline
+ 작업 추가
```

를 기본으로 보여준다.

날짜가 없다는 이유로 Gantt access를 막지 않는다.

---

## 11.55 Folder Collapsed State 동시 변경

생성 성공 직전에 사용자가 다른 client/device에서 Folder collapse 상태를 바꿔도 현재 client에서는 새 List 가시성을 위해 expand를 우선한다.

local navigation usability를 우선한다.

---

## 11.56 Sidebar Virtualization

Sidebar가 virtualization을 사용해 새 item DOM이 바로 생성되지 않을 수 있다.

이 경우 selected item scroll/focus는 virtualization API를 통해 수행한다.

DOM query 기반 `scrollIntoView`만 가정하지 않는다.

---

## 11.57 Post-create Focus와 Sidebar Scroll 충돌

Focus는 Main Quick Add로 이동하고 Sidebar는 selected item만 화면에 보이게 scroll한다.

Sidebar row로 focus를 이동시키지 않는다.

### 이유

사용자의 다음 행동은 Sidebar 탐색이 아니라 Task 입력이다.

---

## 11.58 Screen Reader Announcement

선택적으로:

```text
"학교 리스트가 생성되었습니다. 새 작업 입력으로 이동했습니다."
```

같은 polite announcement 가능.

시각적 toast는 필요 없다.

---

## 11.59 Reduced Motion

`prefers-reduced-motion`이면:

```text
Modal close fade 최소화
new item highlight 제거
```

Main navigation 자체는 즉시 수행.

---

## 11.60 Post-create State 목록

```text
1. PERSISTENCE_SUCCESS
2. SIDEBAR_SYNC
3. FOLDER_EXPAND
4. LIST_SELECTED
5. NAVIGATING
6. VIEW_READY
7. FOCUSING_FIRST_ACTION
8. READY_FOR_FIRST_TASK
9. POST_CREATE_RECOVERY
```

---

## 11.61 Post-create Invariants

### INV-NAV01
Persistence 성공 전에는 Modal을 닫지 않는다.

### INV-NAV02
성공 후 새 List는 Sidebar에 반영된다.

### INV-NAV03
Folder 안에 생성된 List가 보이도록 해당 Folder를 자동 expand한다.

### INV-NAV04
새 List가 active selection이 된다.

### INV-NAV05
Navigation은 listId를 사용한다.

### INV-NAV06
생성 시 선택한 default View로 바로 진입한다.

### INV-NAV07
중간 List View render 후 Board/Gantt로 전환하는 flicker를 만들지 않는다.

### INV-NAV08
생성 성공 후 가능한 경우 첫 Task action으로 Focus를 이동한다.

### INV-NAV09
Post-create UI sync failure를 Create failure로 재분류하지 않는다.

### INV-NAV10
Navigation failure 시 Create API를 Retry하지 않는다.

### INV-NAV11
Browser Back은 생성 취소/삭제가 아니라 이전 화면 Navigation이다.

### INV-NAV12
Current View와 Default View를 분리한다.

---

## 11.62 Post-create Acceptance Criteria

### AC-NAV01
Create success 후 Modal이 닫힌다.

### AC-NAV02
새 List가 해당 root/Folder의 마지막 위치에 표시된다.

### AC-NAV03
Folder가 collapsed였다면 자동으로 펼쳐져 새 List가 보인다.

### AC-NAV04
새 List가 Sidebar active selection이 된다.

### AC-NAV05
새 List가 Sidebar viewport 밖이라면 최소한으로 scroll되어 보인다.

### AC-NAV06
새 List route는 확정된 listId를 사용한다.

### AC-NAV07
선택한 default View가 첫 render부터 active 상태다.

### AC-NAV08
List/Board/Gantt 중 선택한 View에 맞는 새 List empty structure가 보인다.

### AC-NAV09
가능한 경우 생성 직후 Quick Add/Add Task control에 Focus가 이동한다.

### AC-NAV10
Quick Add가 없으면 Add Task button 또는 Main heading으로 Focus fallback한다.

### AC-NAV11
생성 성공 시 기본 success toast를 띄우지 않는다.

### AC-NAV12
Browser Back을 눌러도 새 List는 삭제되지 않는다.

### AC-NAV13
Sidebar cache update 실패 시 create request를 다시 보내지 않는다.

### AC-NAV14
Navigation 실패 시 생성된 List는 유지되고 navigation만 복구한다.

### AC-NAV15
생성 후 다른 View로 전환해도 defaultView preference가 자동 변경되지 않는다.

### AC-NAV16
Refresh 후에도 새 List route와 Sidebar selection을 재구성할 수 있다.

### AC-NAV17
Post-create route transition 때문에 full-screen loading UI가 나타나지 않는다.

### AC-NAV18
READY_FOR_FIRST_TASK까지 도달하면 Add List Flow를 최종 완료로 본다.

---

## 11.63 §11에서 의도적으로 미확정한 것

다음은 이후 섹션에서 확정한다.

```text
CreateListDraft / UI / PostCreate State 실제 타입   → §12
List / Folder / View DB 관계와 transaction          → §13
Responsive에서 Quick Add autofocus 정책             → §14
Sidebar/navigation hook 및 component 구조            → §15
모든 control + post-create 통합 state matrix         → §16
최종 E2E Acceptance Criteria                         → §17
```
# 12. State Model

## 12.1 설계 목표

§0~§11에서는 UI, interaction, error recovery, post-create flow를 개별적으로 확정했다.

이제 이를 실제 구현에서 사용할 수 있도록 **하나의 명확한 state model**로 정리한다.

목표는 다음과 같다.

1. Draft state와 UI state를 분리한다.
2. Modal session과 child surface state를 분리한다.
3. Submit / Error / Post-create 상태를 명시적으로 관리한다.
4. 불가능한 상태 조합을 최대한 줄인다.
5. component local state와 domain state의 책임을 분리한다.
6. async response가 stale session을 덮어쓰지 못하게 한다.

---

## 12.2 State Model의 큰 구조

Add List의 상태는 다음 6개 영역으로 분리한다.

```text
CreateListState
├─ session
├─ draft
├─ ui
├─ child
├─ request
└─ postCreate
```

각 영역의 책임은 다음과 같다.

| 영역 | 책임 |
|---|---|
| `session` | 이 Modal open session의 identity와 entry context |
| `draft` | 사용자가 만들고 있는 List 값 |
| `ui` | Modal 자체의 상태 |
| `child` | Folder dropdown, Custom Color popover 등 내부 surface |
| `request` | submit/error/idempotency 상태 |
| `postCreate` | persistence success 이후 navigation/sync 상태 |

---

## 12.3 Draft State

Draft는 사용자가 최종 생성할 List의 값이다.

```ts
type CreateListDraft = {
  name: string;
  color: ListColorValue;
  defaultViewType: DefaultViewType;
  folderId: string | null;
};
```

초기값:

```ts
const initialDraft: CreateListDraft = {
  name: "",
  color: null,
  defaultViewType: "list",
  folderId: contextFolderId ?? null,
};
```

### MUST

Draft는 다음 값만 가진다.

```text
Name
Color
Default View
Folder
```

다음은 Draft에 넣지 않는다.

```text
isOpen
isSubmitting
error
dropdownOpen
previewMode
```

---

## 12.4 Draft는 Source of Truth다

Name, Color, View, Folder control은 모두 상위 Draft를 source of truth로 사용한다.

```text
CreateListState.draft
   ↓
NameField
ColorPicker
ViewPicker
FolderSelect
Preview
```

### MUST

각 child component가 별도 `selectedColor`, `selectedView`, `selectedFolder`를 독립적으로 소유하지 않는다.

local state는 interaction용 UI 상태에만 사용한다.

---

## 12.5 Session State

각 Modal open은 하나의 session으로 취급한다.

```ts
type CreateListSession = {
  sessionId: string;
  openedAt: number;
  trigger: CreateListTriggerContext;
  scopeId: string;
};
```

Trigger:

```ts
type CreateListTriggerContext =
  | {
      type: "lists-header";
      triggerElementId?: string;
      contextFolderId: null;
    }
  | {
      type: "folder";
      triggerElementId?: string;
      contextFolderId: string;
    };
```

---

## 12.6 Session 생성 시점

`Lists +` 또는 `Folder +` 클릭 시:

```text
new sessionId
new openedAt
capture scopeId
capture trigger context
initialize draft
```

Modal을 닫고 다시 열면 새 session이다.

### MUST

이전 session의:

```text
draft
error
requestId
child state
```

를 재사용하지 않는다.

---

## 12.7 Session이 필요한 이유

다음 edge case를 방지한다.

```text
Modal A open
→ submit
→ slow response

Modal A close/unmount
→ Modal B open

A response arrives late
→ B state overwrite
```

따라서 async callback에서:

```ts
if (sessionId !== currentSessionId) return;
```

같은 stale guard가 필요하다.

---

## 12.8 Modal UI State

Modal의 큰 상태는 string union으로 관리한다.

```ts
type CreateListModalStatus =
  | "open"
  | "submitting"
  | "error"
  | "post-create"
  | "closed";
```

### 해석

```text
open
→ draft 편집 가능

submitting
→ persistence 요청 진행

error
→ persistence 실패 / 수정 가능

post-create
→ persistence 성공 후 navigation/sync 처리

closed
→ modal 종료
```

---

## 12.9 `OPEN_EMPTY`와 `OPEN_VALID`는 별도 저장하지 않는다

§1에서는 개념 상태로:

```text
OPEN_EMPTY
OPEN_VALID
```

를 정의했지만 구현에서는 별도 status로 저장하지 않는 것을 권장한다.

대신 derive한다.

```ts
const isDraftValid = isValidCreateListDraft(state.draft);
```

즉:

```text
status = open
+
isDraftValid = false
→ OPEN_EMPTY 의미

status = open
+
isDraftValid = true
→ OPEN_VALID 의미
```

### 이유

같은 정보를 두 군데 저장해 불일치하는 것을 방지한다.

---

## 12.10 Request State

Submit과 error/idempotency를 관리한다.

```ts
type CreateListRequestState = {
  requestId: string | null;
  startedAt: number | null;
  error: CreateListError | null;
};
```

Error:

```ts
type CreateListError = {
  code: CreateListErrorCode;
  message?: string;
  field?: "name" | "color" | "view" | "folder";
  retryable: boolean;
};
```

---

## 12.11 requestId 생성 규칙

새 logical submit:

```text
requestId = UUID
```

같은 logical request의 timeout/retry:

```text
same requestId
```

Error 후 Draft 수정:

```text
new logical request
→ old requestId discard
→ next submit creates new requestId
```

---

## 12.12 Draft Revision

Retry semantics를 안정적으로 만들기 위해 Draft revision을 두는 것을 권장한다.

```ts
type CreateListState = {
  ...
  draftRevision: number;
};
```

Draft field가 변경될 때:

```text
draftRevision += 1
```

Submit 시:

```ts
request.draftRevision = currentDraftRevision
```

Error 이후 revision이 바뀌면 이전 requestId 재사용 금지.

---

## 12.13 Request Snapshot

Submit 순간 normalized Draft snapshot을 별도로 캡처한다.

```ts
type CreateListRequestSnapshot = {
  draft: NormalizedCreateListDraft;
  draftRevision: number;
  requestId: string;
};
```

### 이유

Submitting 중 UI Draft를 잠그더라도 async command가 mutable state를 다시 읽지 않게 한다.

---

## 12.14 Normalized Draft

저장 payload는 raw Draft와 분리한다.

```ts
type NormalizedCreateListDraft = {
  name: string;
  color: ListColorValue;
  defaultViewType: DefaultViewType;
  folderId: string | null;
  scopeId: string;
};
```

Name:

```text
trim 적용
```

Custom Color:

```text
canonical HEX
```

Folder/View:

```text
validity recheck
```

---

## 12.15 Child Surface State

Modal 내부 popover/dropdown/editor 상태를 하나의 namespace로 관리한다.

권장:

```ts
type CreateListChildState = {
  activeSurface:
    | "none"
    | "color-custom"
    | "folder-select"
    | "folder-create";

  folderSearchQuery: string;
  folderCreateDraft: string;
  folderCreateStatus: "idle" | "submitting" | "error";
  folderCreateError: string | null;

  customColorDraft: string | null;
};
```

---

## 12.16 동시에 하나의 Child Surface만 Open

V1에서는:

```text
Custom Color Popover
Folder Dropdown
Folder Inline Create
```

중 하나만 active.

### MUST

다음 상태를 허용하지 않는다.

```text
Custom Color Popover open
+
Folder Dropdown open
```

### 이유

Focus/Esc/z-index 규칙이 단순해지고 accidental overlap을 막는다.

---

## 12.17 Folder Inline Create는 Folder Surface의 Substate

개념적으로:

```text
folder-select
  ├─ browsing
  └─ creating
```

이지만 구현을 단순화하려면 `activeSurface`를:

```text
folder-select
folder-create
```

로 분리해도 된다.

### MUST

`folder-create` 상태에서는 Add List Submit을 막는다.

---

## 12.18 UI-derived Flags

다음 값은 state에 저장하지 않고 derive한다.

```ts
const isDraftValid = ...
const canSubmit = ...
const isBusy = ...
const isFolderCreating = ...
const isChildSurfaceOpen = ...
const isAddDisabled = ...
```

예:

```ts
const canSubmit =
  state.uiStatus === "open" ||
  state.uiStatus === "error"
    ? isDraftValid(state.draft) &&
      state.child.folderCreateStatus !== "submitting"
    : false;
```

---

## 12.19 금지할 Redundant State

다음처럼 같은 의미를 중복 저장하지 않는다.

```text
isSubmitting + status="submitting"
isError + error != null
isModalOpen + status!="closed"
selectedView + draft.defaultViewType
selectedFolder + draft.folderId
```

### 원칙

> **저장해야 하는 상태와 계산할 수 있는 상태를 분리한다.**

---

## 12.20 Post-create State

Persistence 성공 이후 별도 state machine을 둔다.

```ts
type PostCreateStatus =
  | "idle"
  | "sync-sidebar"
  | "navigate"
  | "wait-view"
  | "focus-first-action"
  | "ready"
  | "recovery";
```

Result:

```ts
type CreateListResult = {
  listId: string;
  defaultViewType: DefaultViewType;
  defaultViewId?: string;
  folderId: string | null;
};
```

---

## 12.21 Persistence Success 순간

```text
uiStatus = submitting
→ result received
→ uiStatus = post-create
→ postCreate.status = sync-sidebar
```

이후 Create request는 종료된 것으로 본다.

### MUST

이 시점 이후 navigation 실패가 발생해도 `uiStatus = error`로 되돌아가 Create Retry를 보여주지 않는다.

---

## 12.22 Post-create Transition

```text
sync-sidebar
→ navigate
→ wait-view
→ focus-first-action
→ ready
```

실패:

```text
sync-sidebar failure
or
navigate failure
→ recovery
```

### Recovery는 Persistence Retry가 아니다

이 점을 state type으로 분리해야 한다.

---

## 12.23 Final Ready

```text
postCreate.status = ready
```

가 되면 Add List flow는 완료.

Modal state는 이미 closed/unmounted일 수 있다.

따라서 post-create orchestration이 Modal component lifecycle에 과도하게 묶이지 않도록 한다.

---

## 12.24 Modal State와 Post-create Orchestrator 분리

권장 architecture:

```text
CreateListModal
→ submit command
→ success result
→ PostCreateCoordinator
```

즉 Modal이 route navigation과 Sidebar sync를 전부 직접 수행하지 않는다.

### 이유

Modal이 close되면 component가 unmount될 수 있기 때문이다.

---

## 12.25 Local UI State vs Global/App State

### Local에 둘 것

```text
draft
focus interaction
child popover state
folder search query
custom color draft
request UI status
```

### Global/App에 둘 것

```text
List entities
Folder tree
Route
Active selection
View registry
Permission
Feature availability
```

### MUST

CreateListModal이 global List collection의 source of truth가 되지 않는다.

---

## 12.26 Domain State와 Form State 구분

예:

```text
draft.folderId
```

는 form state.

실제 Folder 존재 여부:

```text
Folder repository / store
```

는 domain state.

Submit 때 domain state로 재검증한다.

---

## 12.27 Feature Availability State

Available views는 Modal 내부에서 임의로 관리하지 않는다.

```ts
availableViews = viewRegistry.getAvailableViews(scope)
```

를 받아온다.

Draft는 그중 하나를 선택.

만약 current selection이 unavailable이 되면 validation error.

---

## 12.28 Permission State

Create permission도 global/domain state를 참조한다.

```text
canCreateList(scopeId)
```

Modal은 이를 표시/검증하지만 permission rule 자체를 소유하지 않는다.

---

## 12.29 Folder Options State

Folder list도 global/sidebar/domain source에서 가져온다.

Local에서는:

```text
searchQuery
activeOptionIndex
```

정도만 관리.

Folder entities 자체를 Modal local array의 source of truth로 복제하지 않는다.

---

## 12.30 State Initialization

Modal Open command:

```ts
function openCreateListModal(context) {
  const sessionId = createUUID();

  setState({
    session: {
      sessionId,
      openedAt: Date.now(),
      trigger: context.trigger,
      scopeId: context.scopeId,
    },

    draft: {
      name: "",
      color: null,
      defaultViewType: "list",
      folderId: context.contextFolderId ?? null,
    },

    draftRevision: 0,

    uiStatus: "open",

    child: initialChildState,

    request: {
      requestId: null,
      startedAt: null,
      error: null,
    },

    postCreate: {
      status: "idle",
      result: null,
      error: null,
    },
  });
}
```

---

## 12.31 Draft 변경 Command

모든 Draft update는 공통 command를 통해 처리하는 것을 권장한다.

```ts
updateDraft({
  field: "name",
  value
})
```

내부:

```text
draft update
draftRevision += 1
clear create error if appropriate
invalidate old retry requestId if revision changed
```

---

## 12.32 Name Update

```ts
updateName(value)
```

결과:

```text
draft.name = value
revision + 1
global create error clear
```

Name-specific error는 revalidation 결과에 따라 clear.

---

## 12.33 Color Update

```text
draft.color = value
revision + 1
```

Custom picker Apply 시에만 actual Draft가 변경된다.

picker 내부 임시값은 child state.

---

## 12.34 View Update

```text
draft.defaultViewType = view
revision + 1
```

Preview는 derive.

DB write 없음.

---

## 12.35 Folder Update

```text
draft.folderId = id | null
revision + 1
```

Dropdown close는 child UI command.

---

## 12.36 Error State

Persistence failure:

```text
uiStatus = "error"
request.error = mappedError
```

Draft는 그대로.

### Draft 수정 후

```text
request.error = null
uiStatus = "open"
```

로 복귀하는 것을 권장한다.

---

## 12.37 Field Error와 Request Error 분리

권장:

```ts
type FieldErrors = {
  name?: string;
  color?: string;
  view?: string;
  folder?: string;
};
```

`request.error`는 network/server/permission 같은 create-level error.

### MUST

Name validation error를 `request.error`로 넣지 않는다.

---

## 12.38 Submit Command State Transition

```text
open/error
→ normalize
→ validate

invalid
→ fieldErrors
→ remain editable

valid
→ request snapshot
→ uiStatus=submitting
→ request start
```

---

## 12.39 Submitting 동안 Draft Lock

State 자체를 freeze할 필요는 없지만 UI command guard로 update를 막는다.

```ts
if (uiStatus === "submitting") return;
```

### MUST

child open/change command도 막는다.

---

## 12.40 Request Success

```text
uiStatus = "post-create"
request.error = null
postCreate.result = result
postCreate.status = "sync-sidebar"
```

requestId는 telemetry/debugging을 위해 session 끝까지 유지 가능.

---

## 12.41 Request Failure

```text
uiStatus = "error"
request.error = mapped error
```

Retryable이면 retry button.

non-retryable이면 edit/close path.

---

## 12.42 Timeout State

별도:

```text
status="timeout"
```

를 만들기보다:

```text
uiStatus="error"
request.error.code="TIMEOUT"
```

으로 표현한다.

### 이유

UI transition은 Error와 동일하고 차이는 recovery message/requestId semantics다.

---

## 12.43 Network Error State

동일하게:

```text
uiStatus="error"
error.code="NETWORK"
```

---

## 12.44 Permission Error

```text
uiStatus="error"
error.code="PERMISSION_DENIED"
```

Field 관련이면:

```text
field="folder"
```

등 optional metadata.

---

## 12.45 Post-create Recovery State

```ts
type PostCreateError =
  | { code: "SIDEBAR_SYNC_FAILED" }
  | { code: "NAVIGATION_FAILED" }
  | { code: "VIEW_OPEN_FAILED" };
```

이 error는 `request.error`와 별도.

### MUST

post-create error 때문에 request retry button을 노출하지 않는다.

---

## 12.46 State Machine Diagram

```text
                 ┌─────────────────────┐
                 │       CLOSED        │
                 └──────────┬──────────┘
                            │ open
                            ▼
                 ┌─────────────────────┐
                 │        OPEN         │
                 │  editable draft     │
                 └───────┬─────┬──────┘
                         │     │ cancel
                    submit     └────────→ CLOSED
                         │
                         ▼
                 ┌─────────────────────┐
                 │     SUBMITTING      │
                 │   interaction lock  │
                 └───────┬─────┬──────┘
                         │     │ failure
                    success    ▼
                         │   ┌───────────┐
                         │   │   ERROR   │
                         │   │ editable  │
                         │   └─────┬─────┘
                         │         │ retry/edit
                         │         └────→ OPEN/SUBMITTING
                         ▼
                 ┌─────────────────────┐
                 │    POST-CREATE      │
                 └──────────┬──────────┘
                            ▼
                 sync → navigate → view
                            │
                    ┌───────┴───────┐
                    ▼               ▼
                  READY          RECOVERY
```

---

## 12.47 불가능해야 하는 상태

다음 조합은 state model상 금지한다.

```text
uiStatus=submitting
+
child.activeSurface != none
```

```text
uiStatus=closed
+
request.startedAt != null
```

```text
postCreate.status=ready
+
postCreate.result=null
```

```text
draft.defaultViewType unavailable
+
canSubmit=true
```

```text
folderCreateStatus=submitting
+
canSubmit=true
```

---

## 12.48 Reducer 방식 권장 여부

상태 전이가 많으므로 단순 여러 `useState`보다 reducer/state machine 형태를 권장한다.

예:

```ts
useReducer(createListReducer, initialState)
```

Action 예:

```ts
type CreateListAction =
  | { type: "OPEN"; payload: ... }
  | { type: "UPDATE_NAME"; value: string }
  | { type: "UPDATE_COLOR"; value: ListColorValue }
  | { type: "UPDATE_VIEW"; value: DefaultViewType }
  | { type: "UPDATE_FOLDER"; value: string | null }
  | { type: "OPEN_CHILD"; surface: ... }
  | { type: "CLOSE_CHILD" }
  | { type: "SUBMIT_START"; snapshot: ... }
  | { type: "SUBMIT_SUCCESS"; result: ... }
  | { type: "SUBMIT_FAILURE"; error: ... }
  | { type: "POST_CREATE_STEP"; status: ... }
  | { type: "CLOSE" };
```

---

## 12.49 XState 같은 외부 State Machine 라이브러리

필수는 아니다.

### 권장 판단

현재 앱이 이미 XState류를 사용한다면 재사용.

그렇지 않다면 이 Modal 하나 때문에 새 dependency를 추가하지 않는다.

`useReducer + domain command`면 충분하다.

---

## 12.50 Reducer 책임

Reducer는 pure state transition만 담당한다.

다음 side effect는 reducer 내부에서 실행하지 않는다.

```text
DB create
Router navigate
Focus
Sidebar cache mutation
Telemetry
```

Side effect는 command/effect layer에서 실행.

---

## 12.51 Command Layer

권장:

```text
useCreateListController
├─ open()
├─ updateDraft()
├─ submit()
├─ retry()
├─ cancel()
├─ openFolderSelect()
├─ createFolder()
└─ closeChild()
```

Controller가 reducer와 domain service 사이를 연결한다.

---

## 12.52 Service Layer

권장 domain service:

```ts
createList(input)
createFolder(input)
validateFolder(...)
resolveDefaultView(...)
```

Modal component는 DB client를 직접 호출하지 않는다.

---

## 12.53 State Persistence

Modal Draft를 localStorage/sessionStorage에 저장하지 않는다.

V1:

```text
session-local only
```

### 이유

짧은 creation flow이며 stale draft 복원 complexity가 더 크다.

---

## 12.54 URL State

Add List Modal open 여부와 Draft는 URL에 넣지 않는다.

### 이유

```text
Back/Forward
deep link
refresh
```

와 creation draft가 결합될 필요가 없다.

Modal은 ephemeral UI state다.

---

## 12.55 Global Modal Store 여부

앱이 전역 modal manager를 사용하면:

```text
isOpen / trigger context
```

정도는 global store에 둘 수 있다.

하지만 Draft 전체를 global store에 올릴 필요는 없다.

### 원칙

global state는 필요한 최소한으로.

---

## 12.56 Folder Inline Create State 분리

Folder 생성은 작은 mutation flow이므로 별도 nested request state를 둔다.

```ts
type FolderCreateState = {
  status: "idle" | "submitting" | "error";
  error: string | null;
  requestId: string | null;
};
```

### MUST

Add List submit request와 requestId를 공유하지 않는다.

---

## 12.57 Custom Color State

Custom Color input:

```text
customColorDraft
```

는 Apply 전까지 List Draft와 분리한다.

Cancel:

```text
customColorDraft discard
draft.color unchanged
```

---

## 12.58 Focus State 저장 최소화

현재 Focused element를 React state에 매번 저장하지 않는다.

브라우저 DOM/focus primitive에 맡긴다.

필요한 것만:

```text
opening trigger ref
child opener ref
```

보관.

---

## 12.59 Preview State 저장 금지

```text
previewView
previewName
previewColor
```

별도 state 금지.

항상:

```text
derive from draft
```

---

## 12.60 Validation State

Validation은 두 종류로 분리.

### Derived validity

```text
isDraftValid
```

항상 계산.

### Displayed field errors

```text
fieldErrors
```

사용자가 submit 시도했거나 server field error가 있을 때만 표시.

---

## 12.61 Dirty State

Cancel confirmation을 사용하지 않으므로 dirty state는 필수는 아니다.

하지만 analytics/debugging 또는 future use를 위해 derive 가능.

```ts
const isDirty =
  draft.name !== "" ||
  draft.color !== null ||
  draft.defaultViewType !== "list" ||
  draft.folderId !== initialFolderId;
```

State에 저장하지 않는다.

---

## 12.62 Initial Folder Snapshot

Session에:

```text
initialFolderId
```

를 두는 것을 권장한다.

Dirty derivation과 reset 기준에 사용.

---

## 12.63 Reset

Cancel / Close 완료 시 state reset.

다음 open은 항상 fresh.

```text
session=null
draft=initial
child=initial
request=initial
postCreate=initial
```

---

## 12.64 Stale Async Guard

모든 async side effect는 최소:

```text
sessionId
requestId
```

를 확인한다.

예:

```ts
if (
  sessionId !== current.session.sessionId ||
  requestId !== current.request.requestId
) {
  return;
}
```

---

## 12.65 Folder Async Guard

Folder create도 별도 requestId 또는 child session token 사용 가능.

Folder create response가 inline create mode 종료 후 늦게 와서 다른 Folder를 자동 선택하지 않게 한다.

---

## 12.66 View Availability 변경

availableViews가 변경되어 current draft가 invalid가 될 수 있다.

State를 즉시 자동 변경하지 않는다.

derive:

```text
isViewValid=false
canSubmit=false
```

사용자에게 field error.

---

## 12.67 Folder 삭제 이벤트

domain store에서 selected folder가 사라지면 controller가:

```text
draft.folderId = null
draftRevision += 1
field notice/error set
```

하도록 한다.

### 예외

Submitting 이미 시작된 경우에는 request snapshot을 변경하지 않는다.

server validation/result로 처리.

---

## 12.68 Submit 중 Domain 변화

Submitting 이후 Folder/View/permission이 바뀌더라도 local Draft는 lock.

서버 command가 최종 validation한다.

응답 결과에 따라 success/error.

---

## 12.69 State Serialization

Debugging을 위해 state를 logging할 때 List Name 같은 raw user content는 기본적으로 제외하는 것을 권장한다.

예:

```text
nameLength
hasColor
viewType
hasFolder
status
errorCode
```

정도.

---

## 12.70 Testable State Selectors

권장 selector:

```ts
selectCanSubmit(state)
selectIsBusy(state)
selectCurrentError(state)
selectIsChildOpen(state)
selectSelectedFolder(state)
selectPreviewProps(state)
```

### 이유

Component가 raw state 구조에 과도하게 결합되지 않는다.

---

## 12.71 State Model Wireframe

```text
CreateListState
│
├─ session
│   ├─ sessionId
│   ├─ scopeId
│   ├─ trigger
│   └─ openedAt
│
├─ draft
│   ├─ name
│   ├─ color
│   ├─ defaultViewType
│   └─ folderId
│
├─ draftRevision
│
├─ uiStatus
│
├─ fieldErrors
│
├─ child
│   ├─ activeSurface
│   ├─ folderSearchQuery
│   ├─ folderCreateDraft
│   ├─ folderCreateStatus
│   └─ customColorDraft
│
├─ request
│   ├─ requestId
│   ├─ startedAt
│   └─ error
│
└─ postCreate
    ├─ status
    ├─ result
    └─ error
```

---

## 12.72 State Invariants

### INV-S01
Draft는 Name/Color/View/Folder만 소유한다.

### INV-S02
Preview state는 Draft에서 derive한다.

### INV-S03
OPEN_EMPTY/OPEN_VALID는 저장하지 않고 validity로 derive한다.

### INV-S04
한 Modal open마다 고유 sessionId를 가진다.

### INV-S05
stale session async response는 현재 state를 변경하지 않는다.

### INV-S06
Submitting 동안 Draft/child surface 수정이 불가능하다.

### INV-S07
Create request error와 post-create error를 분리한다.

### INV-S08
Persistence success 이후 Create Retry 상태로 돌아가지 않는다.

### INV-S09
Child surface는 동시에 하나만 open한다.

### INV-S10
canSubmit/isDirty/isBusy 같은 값은 가능하면 derive한다.

### INV-S11
Reducer는 side effect를 실행하지 않는다.

### INV-S12
Modal local state와 global domain state를 분리한다.

### INV-S13
Folder create request와 List create request는 독립적인 mutation state를 가진다.

### INV-S14
Modal close/reopen 시 이전 session state는 남지 않는다.

---

## 12.73 State Model Acceptance Criteria

### AC-S01
Modal Open 시 fresh sessionId와 initial Draft가 생성된다.

### AC-S02
`Lists +`와 `Folder +` 진입에 따라 initial folderId가 다르게 설정된다.

### AC-S03
Name/Color/View/Folder 변경 시 하나의 Draft source of truth가 갱신된다.

### AC-S04
Preview는 별도 state 없이 Draft 변경을 반영한다.

### AC-S05
Draft 변경 시 revision이 증가한다.

### AC-S06
Submit 시 normalized Draft snapshot과 requestId가 생성된다.

### AC-S07
Submitting 동안 update command가 Draft를 변경하지 못한다.

### AC-S08
Create failure 시 Draft와 session은 유지되고 request error만 갱신된다.

### AC-S09
Error 후 Draft 수정 시 이전 global create error가 clear된다.

### AC-S10
Persistence success 후 postCreate state machine으로 전환된다.

### AC-S11
Navigation 실패가 Create request error state를 재활성화하지 않는다.

### AC-S12
Custom Color Popover와 Folder Dropdown이 동시에 open되지 않는다.

### AC-S13
Folder create 중 `canSubmit=false`가 된다.

### AC-S14
Modal A의 늦은 async response가 Modal B의 state를 변경하지 않는다.

### AC-S15
Modal Close 후 reopen하면 이전 Draft/Error/requestId가 남지 않는다.

### AC-S16
Component는 reducer state와 selector를 사용하고 DB/Router side effect를 직접 소유하지 않는다.

---

## 12.74 §12에서 의도적으로 미확정한 것

다음은 이후 섹션에서 확정한다.

```text
List / Folder / View 실제 schema 및 transaction             → §13
Responsive에서 state를 공유하는 방식                        → §14
Reducer/controller/service 실제 파일 구조                     → §15
모든 상태와 component visual을 합친 matrix                   → §16
최종 E2E Acceptance Criteria                                  → §17
```
# 13. Data Model 및 View 연결

## 13.1 설계 목표

§0~§12에서 `List`, `Folder`, `Default View`를 UI와 상태 관점에서 분리했다.

이 섹션에서는 이를 실제 데이터 구조와 domain contract로 고정한다.

핵심 목표는 다음과 같다.

1. **List identity와 View representation을 분리한다.**
2. Add List 생성 시 불필요한 View row를 만들지 않는다.
3. Folder는 nullable parent relation으로만 취급한다.
4. 생성 요청은 하나의 atomic command로 처리한다.
5. Retry가 같은 List를 두 번 만들지 않도록 idempotency를 보장한다.
6. Sidebar 정렬은 client가 임의 계산하지 않고 domain/server에서 확정한다.
7. View 종류가 늘어나도 List schema가 쉽게 깨지지 않게 한다.

---

## 13.2 최종 Domain 관계

V1의 권장 관계는 다음으로 확정한다.

```text
Space
│
├─ Folder
│   └─ List
│
└─ List
    ├─ Tasks
    └─ View Registry
        ├─ preset:list
        ├─ preset:board
        ├─ preset:calendar
        └─ preset:gantt
```

여기서 핵심은 다음이다.

```text
Folder
→ List의 navigation parent

List
→ Task collection의 identity

View
→ List 데이터를 표현하는 방식
```

---

## 13.3 핵심 결정 — `defaultViewType` 사용

Add List V1에서는 `defaultViewId`보다 **`defaultViewKey` / `defaultViewType` 저장 방식을 우선 채택한다.**

권장:

```text
List.defaultViewKey = "list"
List.defaultViewKey = "board"
List.defaultViewKey = "gantt"
```

### 저장하지 않는 구조

```text
List.defaultViewId = UUID of auto-created preset row
```

를 V1 기본 구조로 사용하지 않는다.

---

## 13.4 왜 `defaultViewKey`가 우선인가

Add List 생성 화면에서 고르는 것은 사용자가 만든 Custom View가 아니라 다음 built-in View다.

```text
List
Board
Gantt
```

이들은 List마다 독립적인 DB row가 있어야 존재하는 객체가 아니라 **View Registry가 제공하는 preset representation**으로 볼 수 있다.

따라서:

```text
new List
→ preset view row 3개 생성
```

보다:

```text
new List
→ View Registry가 필요할 때 preset resolve
```

가 더 단순하다.

### 장점

- List 생성 transaction이 작아진다.
- 불필요한 View row 증가를 막는다.
- built-in View와 user-saved View를 구분하기 쉽다.
- View 추가 시 List 생성 로직 변경이 줄어든다.
- partial success 가능성이 감소한다.

---

## 13.5 최종 List Entity

개념적 Domain type:

```ts
type ListEntity = {
  id: string;

  spaceId: string;
  folderId: string | null;

  name: string;
  color: ListColorValue;

  defaultViewKey: ViewKey;

  sortKey: string;

  creationRequestId: string | null;

  createdAt: string;
  updatedAt: string;
};
```

### V1에서 의도적으로 제외

```text
iconKey
type = "board"
layout
smartListMode
defaultViewId
```

실제 기능이 생기기 전에는 저장하지 않는다.

---

## 13.6 `ViewKey` 타입

Application/domain layer:

```ts
type ViewKey =
  | "list"
  | "board"
  | "calendar"
  | "gantt";
```

Add List Modal의 선택지는 이 전체 type의 subset이다.

```ts
type CreateListDefaultViewKey =
  | "list"
  | "board"
  | "gantt";
```

### 중요

```text
DB가 허용하는 View
≠
Add List Modal에서 노출하는 View
```

Calendar는 생성 화면에서 숨겨도 domain 전체에는 존재할 수 있다.

---

## 13.7 DB에서는 SQL Enum보다 Text Key 우선

View 종류가 향후 확장될 가능성이 높으므로 DB column은 다음을 권장한다.

```sql
default_view_key TEXT NOT NULL DEFAULT 'list'
```

Application의 View Registry가 validity를 검증한다.

### SQL Enum을 우선하지 않는 이유

새 View가 추가될 때마다:

```text
DB enum migration
```

이 필요해져 View Registry 확장성과 결합되기 때문이다.

### MUST

DB에 아무 문자열이나 그대로 저장하지 않고 domain command에서 View Registry validation을 수행한다.

---

## 13.8 View Registry Contract

권장 interface:

```ts
type ViewRegistry = {
  isAvailable(args: {
    key: ViewKey;
    scopeType: "list";
    scopeId?: string;
    spaceId: string;
  }): boolean;

  resolvePreset(args: {
    key: ViewKey;
    scopeType: "list";
    scopeId: string;
  }): ViewSpec;
};
```

Add List UI는 registry 내부 구현을 모른다.

---

## 13.9 List Open 시 View Resolve

새 List 진입:

```text
list.defaultViewKey
        ↓
ViewRegistry.resolvePreset()
        ↓
ViewSpec
        ↓
View Renderer
```

예:

```text
defaultViewKey = "board"

resolvePreset({
  key: "board",
  scopeType: "list",
  scopeId: list.id
})
```

결과:

```text
Board ViewSpec
```

---

## 13.10 Built-in Preset은 DB Row가 아니다

V1 기준:

```text
preset:list
preset:board
preset:calendar
preset:gantt
```

는 registry-level definition이다.

각 List가 생성될 때 별도 row를 만들 필요가 없다.

개념:

```text
preset key
+
list scope
=
resolved ViewSpec
```

---

## 13.11 Saved / Custom View와 분리

향후 사용자가 직접 다음을 만들 수 있다.

```text
"이번 주 과제"
"완료 제외"
"중요도별 Board"
```

이런 View는 built-in preset과 다르므로 실제 저장 객체가 될 수 있다.

예:

```ts
type SavedView = {
  id: string;
  scopeType: "list";
  scopeId: string;
  viewKey: ViewKey;
  name: string;
  config: unknown;
};
```

### 핵심

```text
Preset View
≠
Saved Custom View
```

Add List V1은 preset만 선택한다.

---

## 13.12 Custom View를 Default로 지정하는 기능은 V1 제외

향후 요구:

```text
사용자가 만든 "이번 주" View를 기본으로 열기
```

가 실제로 생긴다면 그때:

```text
default_view_mode
default_saved_view_id
```

같은 모델을 추가한다.

### MUST NOT

현재 존재하지 않는 요구를 위해 V1부터 nullable column 여러 개를 미리 추가하지 않는다.

---

## 13.13 Folder Relation

List의 Folder relation:

```text
folderId: nullable
```

의미:

```text
null
→ Lists root

UUID
→ 해당 Folder 아래
```

### DB 개념

```sql
folder_id UUID NULL REFERENCES folders(id)
```

---

## 13.14 Folder 삭제 정책

Folder를 삭제한다고 그 안의 List까지 삭제하면 안 된다.

권장:

```text
ON DELETE SET NULL
```

즉:

```text
Folder 삭제
→ contained List는 root로 이동
```

### 이유

Folder는 navigation grouping이지 List ownership 자체가 아니다.

---

## 13.15 Cross-space Folder 금지

다음은 invalid다.

```text
List.spaceId = A
Folder.spaceId = B
```

Submit command에서 반드시 검사한다.

### MUST

Folder ID가 존재한다는 사실만 확인하지 않는다.

```text
folder.spaceId === list.spaceId
```

까지 검증한다.

---

## 13.16 Folder Entity 최소 구조

Add List에 필요한 최소 Folder domain:

```ts
type FolderEntity = {
  id: string;
  spaceId: string;
  name: string;
  sortKey: string;
};
```

### V1에서 Add List 때문에 추가하지 않을 것

```text
parentFolderId
nested level
folder color
folder permission override
```

이미 제품에 존재하는 기능은 재사용하지만 Add List가 새 계층 기능을 만들지는 않는다.

---

## 13.17 Space Relation

모든 List는 생성 scope를 명확히 가져야 한다.

권장:

```text
spaceId: required
```

Modal Open 시 session에 snapshot한:

```text
session.scopeId
```

가 최종 creation `spaceId`로 사용된다.

### MUST

Submit 직전에 화면의 현재 선택 Space를 다시 읽어 creation target을 바꾸지 않는다.

---

## 13.18 List Name 저장

Submit:

```text
raw: "  학교  "
↓
normalize
↓
"학교"
```

DB 저장:

```text
학교
```

### Constraint

권장:

```text
non-empty normalized text
max application length 80
```

DB에서도 가능한 범위의 방어 constraint를 둘 수 있다.

---

## 13.19 Duplicate Name

DB unique constraint를 다음에 두지 않는다.

```text
UNIQUE(space_id, folder_id, name)
```

동일 이름 List는 허용한다.

List identity는 UUID.

---

## 13.20 Color 저장 모델

Application type:

```ts
type ListColorValue =
  | null
  | {
      type: "preset";
      value:
        | "red"
        | "orange"
        | "yellow"
        | "lime"
        | "green"
        | "blue"
        | "indigo"
        | "purple";
    }
  | {
      type: "custom";
      value: string; // canonical #RRGGBB
    };
```

---

## 13.21 Color DB 구조 — 권장

명시적인 두 column 구조를 권장한다.

```text
color_kind
color_value
```

예:

```text
None
→ color_kind = null
→ color_value = null

Preset Blue
→ color_kind = "preset"
→ color_value = "blue"

Custom
→ color_kind = "custom"
→ color_value = "#4F7AF8"
```

---

## 13.22 Color Constraint

개념적 constraint:

```text
kind null
↔ value null

kind preset
→ value must be known preset key

kind custom
→ value must match #RRGGBB
```

정확한 validation은 domain + DB 방어층에서 처리한다.

---

## 13.23 JSON Color Column을 우선하지 않는 이유

다음도 가능하다.

```json
{"type":"preset","value":"blue"}
```

하지만 현재 Color 구조는 매우 작고 안정적이므로 두 column이:

- query/debug가 쉽고
- constraint가 명확하고
- migration이 단순하다.

따라서 V1에서는 relational columns를 우선한다.

---

## 13.24 Sort Order 역할

새 List는 선택한 parent container의 마지막에 들어간다.

```text
Root container
or
Folder container
```

따라서 List는:

```text
sortKey
```

를 가진다.

---

## 13.25 Sort Key는 Server/Domain이 확정 — MUST

Client가:

```text
max(sortOrder) + 1
```

을 직접 계산해 insert하지 않는다.

### 이유

동시 생성:

```text
Client A → max 10
Client B → max 10
```

에서 충돌 가능.

---

## 13.26 Sort Algorithm

기존 앱에 ranking utility가 있다면 반드시 재사용한다.

가능한 구현:

```text
fractional indexing
LexoRank-like key
server-side numeric allocation
```

Add List 문서는 특정 알고리즘을 강제하지 않는다.

### Contract만 고정

```text
appendListToContainer({
  spaceId,
  folderId
})
→ sortKey
```

는 domain/server 책임.

---

## 13.27 Container 정의

정렬 parent key 개념:

```text
(spaceId, folderId)
```

여기서:

```text
folderId = null
```

이면 root Lists container.

즉 append position은 Folder별로 독립적이다.

---

## 13.28 생성 요청 Payload

UI → domain command:

```ts
type CreateListInput = {
  requestId: string;

  spaceId: string;
  folderId: string | null;

  name: string;
  color: ListColorValue;

  defaultViewKey: CreateListDefaultViewKey;
};
```

### 포함하지 않는 것

```text
sortKey
createdAt
createdBy
defaultViewId
```

이 값들은 server/domain이 결정한다.

---

## 13.29 서버 Command

권장 단일 command:

```ts
createList(input: CreateListInput): Promise<CreateListResult>
```

또는 RPC:

```text
create_list(...)
```

### MUST

Client가 다음 작업을 여러 요청으로 쪼개지 않는다.

```text
1. list insert
2. sort update
3. default view insert
4. list update
```

가능하면 하나의 domain command로 묶는다.

---

## 13.30 V1 Transaction Boundary

권장 transaction:

```text
BEGIN

1. request idempotency 확인
2. Space 존재 / create permission 검증
3. Name normalize/validate
4. Folder 존재 + same Space 검증
5. Default View availability 검증
6. Color validate
7. append sortKey 계산
8. List insert
9. 결과 구성

COMMIT
```

View preset row 생성이 없으므로 transaction이 작다.

---

## 13.31 Transaction 성공 결과

응답:

```ts
type CreateListResult = {
  list: {
    id: string;
    spaceId: string;
    folderId: string | null;
    name: string;
    color: ListColorValue;
    defaultViewKey: ViewKey;
    sortKey: string;
    createdAt: string;
  };

  routeTarget: {
    listId: string;
    viewKey: ViewKey;
  };
};
```

`routeTarget`은 MAY.

Client가 registry/routing convention으로 derive할 수 있다면 생략 가능.

---

## 13.32 Idempotency — 최종 전략

`creation_request_id`를 List row에 저장하는 방식을 V1 우선안으로 권장한다.

DB:

```text
creation_request_id UUID UNIQUE
```

Client:

```text
requestId = session submit request UUID
```

---

## 13.33 Retry 시 동작

첫 요청:

```text
requestId = A
→ List L 생성
→ response lost
```

Retry:

```text
requestId = A
```

Server:

```text
A already exists
→ existing List L return
```

새 List를 만들지 않는다.

---

## 13.34 같은 requestId + 다른 Payload

정상 client에서는 발생하면 안 된다.

발생 시 서버는 기존 row와 normalized payload를 비교한다.

다르면:

```text
IDEMPOTENCY_CONFLICT
```

로 실패 처리한다.

### MUST

같은 requestId에 다른 payload를 조용히 기존 성공으로 처리하지 않는다.

---

## 13.35 Legacy Row와 `creation_request_id`

기존 List에는 requestId가 없을 수 있으므로 migration에서는:

```text
creation_request_id nullable
```

허용.

새 create command로 생성되는 row에는 반드시 값이 들어간다.

Unique index는 nullable 값을 허용하는 형태로 구성한다.

---

## 13.36 DB Index 권장

최소:

```text
PK: lists(id)

INDEX:
lists(space_id, folder_id, sort_key)

UNIQUE:
lists(creation_request_id)
  where creation_request_id is not null
```

필요 시:

```text
lists(space_id)
lists(folder_id)
```

는 query planner/기존 index 정책에 맞춘다.

---

## 13.37 Sidebar Query

개념:

```text
SELECT lists
WHERE space_id = ?
ORDER BY parent container + sortKey
```

Folder tree와 조합해 렌더한다.

### MUST

Name을 key로 사용하지 않는다.

---

## 13.38 Open List Query

route:

```text
listId
```

기준으로 List를 가져온다.

이후:

```text
defaultViewKey
```

로 View Registry resolve.

---

## 13.39 Task Relation

Task가 List에 속하는 구조라면:

```text
tasks.list_id → lists.id
```

를 사용한다.

Add List 생성 직후:

```text
tasks = []
```

는 정상 상태.

---

## 13.40 List 삭제와 Task 정책

Add List 문서에서 삭제 정책을 새로 정의하지 않는다.

기존 List deletion/archive domain rule을 따른다.

### 핵심

Folder 삭제와 List 삭제는 서로 다른 lifecycle이다.

---

## 13.41 View Registry와 Saved Views

권장 구조:

```text
View Registry
├─ Built-in preset definitions
└─ Saved View repository
```

resolve 순서 예:

```text
resolvePreset(listId, key)
→ generated ViewSpec
```

Saved View는 필요 시 별도:

```text
getSavedViews(listId)
```

---

## 13.42 Preset ViewSpec 예시

개념:

```ts
presetList(listId)
presetBoard(listId)
presetCalendar(listId)
presetGantt(listId)
```

각 함수는 동일한 List scope를 다른 renderer/config로 표현한다.

예:

```ts
presetBoard(listId) => {
  type: "board",
  scope: { listId },
  ...
}
```

---

## 13.43 Add List UI와 View Registry Boundary

UI가 알아야 하는 것:

```text
key
label
icon
availability
```

UI가 몰라야 하는 것:

```text
Board column generation
Gantt timeline config
Calendar query
ViewSpec internal schema
```

---

## 13.44 Create List View Option Registry

권장 selector:

```ts
getCreateListViewOptions(spaceId)
```

결과:

```ts
[
  { key: "list",  label: "목록",  icon: ... },
  { key: "board", label: "보드",  icon: ... },
  { key: "gantt", label: "간트",  icon: ... }
]
```

Calendar는 domain에 존재하지만 이 selector에서 제외 가능.

---

## 13.45 Feature Flag 변화

Submit 직전:

```text
registry.isAvailable(defaultViewKey)
```

재검증.

Unavailable이면 DB insert 이전에 실패한다.

따라서:

```text
List created
+
selected View unavailable
```

이라는 partial state를 만들지 않는다.

---

## 13.46 Lazy Preset Resolve 실패

Create command에서는 View key validity만 검증한다.

실제 renderer resolve가 이후 예외적으로 실패하면 §11의 post-create fallback을 사용한다.

이것은 DB create transaction 실패와 구분한다.

---

## 13.47 Compatibility Path — 현재 구조가 `defaultViewId` 기반인 경우

기존 코드베이스가 이미 concrete View entity를 필수로 사용한다면 당장 대규모 refactor를 강제하지 않는다.

이 경우 transaction:

```text
BEGIN
1. List insert
2. Default View row insert
3. List.default_view_id update
COMMIT
```

로 구성한다.

### 단

장기 방향은 built-in preset과 saved view를 분리하는 것을 권장한다.

---

## 13.48 Compatibility Path의 필수 조건

`defaultViewId` 구조를 유지하더라도:

```text
List.type = "board"
```

같은 결합은 금지.

List와 View entity는 계속 분리한다.

---

## 13.49 기존 `type/layout` Column Migration

현재 List에 다음과 같은 column이 있다면:

```text
type
layout
viewMode
```

실제 의미를 확인한다.

만약 이것이 “List 자체 종류”가 아니라 “기본 표시 View” 의미였다면:

```text
default_view_key
```

로 migration한다.

예:

```text
type="board"
→ default_view_key="board"
```

### MUST

동일 의미 column을 둘 다 장기간 유지하지 않는다.

---

## 13.50 Migration 단계 권장

### M1. 새 column 추가

```text
default_view_key
creation_request_id
color_kind / color_value (필요 시)
```

### M2. 기존 데이터 backfill

```text
default_view_key = existing view preference or "list"
```

### M3. application read path 전환

새 column을 source of truth로 사용.

### M4. write path 전환

새 create command만 사용.

### M5. legacy column 제거

호환 기간 이후.

---

## 13.51 View Row 자동 생성 제거 Migration

기존에 모든 List마다:

```text
List View row
Board View row
Gantt View row
```

를 미리 생성했다면, 해당 row가 정말 사용자별 config를 담는지 확인한다.

### Row가 단순 preset replica라면

향후 신규 List부터 자동 생성 중단.

기존 row는:

- 그대로 읽을 수 있게 compatibility 유지 후
- 별도 cleanup migration

가능.

### MUST

실제 user customization이 들어 있는 row를 일괄 삭제하지 않는다.

---

## 13.52 Security / Permission Boundary

Create command는 다음을 server/domain에서 검증한다.

```text
user can access space
user can create list in space
folder belongs to space
user can use selected view if entitlement exists
```

Client validation만 신뢰하지 않는다.

---

## 13.53 Direct Client Multi-write 금지

특히 DB client를 브라우저에서 직접 사용하는 구조라도:

```text
insert list
then update sort
then create view
```

를 UI component가 순차 호출하지 않는다.

가능하면:

```text
RPC / server action / transaction-capable domain service
```

를 사용한다.

---

## 13.54 RLS가 있는 환경

Row-level security를 사용하는 경우 create command도 기존 authorization 정책을 우회하지 않게 한다.

`SECURITY DEFINER`류를 사용한다면:

- scope permission
- folder relation
- user identity

를 함수 내부에서 명시적으로 검증해야 한다.

### 원칙

transaction 편의 때문에 보안 경계를 약화하지 않는다.

---

## 13.55 Timestamp

권장:

```text
created_at = server/database time
updated_at = server/database time
```

Client clock을 source of truth로 사용하지 않는다.

---

## 13.56 Created By

협업 기능이 있다면:

```text
created_by
```

를 domain에서 채울 수 있다.

하지만 Add List UI payload에서 사용자 ID를 직접 보내 source of truth로 삼지 않는다.

Authenticated context에서 derive.

---

## 13.57 Archived State

기존 List domain에 archive가 있다면:

```text
archived_at
```

등을 유지.

Add List에서 새 List는 항상 active/non-archived.

별도 option 제공하지 않는다.

---

## 13.58 Soft Delete

기존 앱이 soft delete를 사용하면 해당 정책을 따른다.

`creation_request_id` idempotency 조회 시 삭제된 row를 어떻게 처리할지는 domain policy가 필요하다.

V1 권장:

같은 requestId retry는 삭제 여부와 관계없이 기존 logical request 결과로 취급한다.

---

## 13.59 API Error Contract

권장:

```ts
type CreateListDomainError =
  | { code: "INVALID_NAME" }
  | { code: "INVALID_COLOR" }
  | { code: "INVALID_FOLDER" }
  | { code: "VIEW_UNAVAILABLE" }
  | { code: "PERMISSION_DENIED" }
  | { code: "SCOPE_NOT_FOUND" }
  | { code: "IDEMPOTENCY_CONFLICT" }
  | { code: "SERVER_ERROR" };
```

UI §10 error mapping과 일치시킨다.

---

## 13.60 API Success는 완전한 List DTO 반환

Create 성공 후 Sidebar/Main에서 바로 사용할 수 있도록 최소 metadata를 응답에 포함한다.

```text
id
spaceId
folderId
name
color
defaultViewKey
sortKey
createdAt
```

### 이유

성공 직후 다시 동일 List를 fetch해야만 화면을 그릴 수 있는 구조를 피한다.

---

## 13.61 Cache Insert Contract

성공 DTO는 global List store/cache에 바로 insert 가능해야 한다.

```text
upsert by list.id
```

### MUST

retry response가 와도 append가 아니라 ID 기반 upsert.

---

## 13.62 Folder Tree Update

List row가 Folder entity 안에 embedded array로 중복 저장되어 있다면 cache divergence 위험이 있다.

권장 normalized store:

```text
folders by id
lists by id
relation via folderId
```

Sidebar는 이를 조합.

### 이유

List move/create/delete 시 한 source of truth로 유지하기 쉽다.

---

## 13.63 Derived Folder Children

권장:

```text
folderChildren =
  lists
    .filter(list.folderId === folder.id)
    .sort(sortKey)
```

대규모 데이터에서는 selector/index 최적화 가능.

---

## 13.64 `defaultViewKey` 변경

생성 이후 List Settings에서 기본 View 변경:

```text
UPDATE lists
SET default_view_key = ?
```

정도면 된다.

Preset View row 이동/교체가 필요 없다.

---

## 13.65 Current View는 Persist 여부 분리

사용자가 현재 session에서 Board로 전환했다고:

```text
default_view_key
```

를 자동 update하지 않는다.

Current View는:

- route
- tab state
- recent navigation state

중 기존 앱 정책을 따른다.

---

## 13.66 데이터 모델 ER Diagram

```text
┌──────────────┐
│    SPACE     │
│ id           │
└──────┬───────┘
       │ 1
       │
       │ N
┌──────▼──────────────┐
│      FOLDER         │
│ id                  │
│ space_id            │
│ name                │
│ sort_key            │
└──────┬──────────────┘
       │ 0..1 parent
       │
       │ N
┌──────▼─────────────────────────┐
│             LIST               │
│ id                             │
│ space_id                       │
│ folder_id nullable             │
│ name                           │
│ color_kind / color_value       │
│ default_view_key               │
│ sort_key                       │
│ creation_request_id            │
│ created_at / updated_at        │
└──────┬─────────────────────────┘
       │
       │ 1 : N
       ▼
┌──────────────┐
│     TASK     │
│ list_id      │
│ ...          │
└──────────────┘

LIST
  │
  └──── View Registry resolve ────>
        preset:list
        preset:board
        preset:calendar
        preset:gantt
```

---

## 13.67 권장 SQL 형태 — 개념 예시

실제 schema naming은 기존 migration convention을 따른다.

```sql
CREATE TABLE lists (
  id UUID PRIMARY KEY,

  space_id UUID NOT NULL,
  folder_id UUID NULL,

  name TEXT NOT NULL,

  color_kind TEXT NULL,
  color_value TEXT NULL,

  default_view_key TEXT NOT NULL DEFAULT 'list',

  sort_key TEXT NOT NULL,

  creation_request_id UUID NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lists_creation_request_unique
    UNIQUE (creation_request_id)
);
```

### 주의

이 SQL은 방향을 설명하기 위한 개념 예시다.

실제 FK / RLS / naming / updated_at trigger는 현재 DB convention에 맞춘다.

---

## 13.68 Folder FK 개념

```sql
FOREIGN KEY (folder_id)
REFERENCES folders(id)
ON DELETE SET NULL
```

단 same-space relation은 단순 FK만으로 보장되지 않을 수 있으므로 create/move domain command에서 추가 검증한다.

---

## 13.69 Color Check 개념

가능하면:

```text
(color_kind IS NULL AND color_value IS NULL)
OR
(color_kind = 'preset' AND color_value IS NOT NULL)
OR
(color_kind = 'custom' AND color_value IS NOT NULL)
```

방어 constraint를 둔다.

Preset key와 HEX 정규식은 application/domain validation이 주 책임.

---

## 13.70 View Key DB Constraint

강한 SQL enum/check는 V1 우선안이 아니다.

하지만 최소:

```text
NOT NULL
```

은 보장한다.

Unknown key가 들어오면 View Registry에서 error/fallback 정책을 적용할 수 있다.

### Write path에서는 반드시 registry validation.

---

## 13.71 Unknown Legacy View Key Read

데이터 corruption/legacy로 unknown key가 존재할 수 있다.

Read fallback:

```text
unknown
→ List View
→ telemetry/log
```

### 중요

이것은 **read recovery**다.

사용자가 Create Modal에서 선택한 unavailable View를 Submit 시 몰래 List로 바꾸는 정책과는 다르다.

---

## 13.72 View Key Rename

예:

```text
"timeline" → "gantt"
```

처럼 key rename이 필요하면 registry alias를 한 버전 제공한 뒤 DB backfill migration을 권장한다.

URL과 DB key를 동시에 깨뜨리지 않는다.

---

## 13.73 Create Command Pseudocode

```ts
async function createList(input: CreateListInput) {
  return db.transaction(async (tx) => {
    const existing = await tx.findListByCreationRequestId(
      input.requestId
    );

    if (existing) {
      assertSameLogicalPayload(existing, input);
      return toCreateListResult(existing);
    }

    const normalized = normalizeCreateListInput(input);

    await assertCanCreateList(normalized.spaceId);
    await assertFolderValid(
      normalized.spaceId,
      normalized.folderId
    );
    await assertViewAvailable(
      normalized.spaceId,
      normalized.defaultViewKey
    );

    const sortKey = await allocateAppendSortKey(tx, {
      spaceId: normalized.spaceId,
      folderId: normalized.folderId,
    });

    const list = await tx.insertList({
      ...normalized,
      sortKey,
      creationRequestId: input.requestId,
    });

    return toCreateListResult(list);
  });
}
```

---

## 13.74 Client Pseudocode

```ts
const result = await listService.create({
  requestId: requestSnapshot.requestId,
  spaceId: session.scopeId,
  folderId: snapshot.folderId,
  name: snapshot.name,
  color: snapshot.color,
  defaultViewKey: snapshot.defaultViewType,
});

postCreateCoordinator.start(result);
```

Modal은 DB schema를 직접 알 필요가 없다.

---

## 13.75 Data Layer에서 하지 않을 것

```text
✕ UI component에서 SQL 작성
✕ Name으로 List 찾기
✕ Client가 sortKey 직접 계산
✕ preset View row를 무조건 3~4개 생성
✕ List.type = board/gantt
✕ Folder 삭제 시 List cascade delete
✕ Retry마다 새 requestId 발급
```

---

## 13.76 Data Model Invariants

### INV-D01
List identity와 View representation은 분리한다.

### INV-D02
V1의 default View는 `defaultViewKey`로 저장한다.

### INV-D03
Built-in preset View는 List마다 DB row를 만들지 않는다.

### INV-D04
Folder relation은 nullable이다.

### INV-D05
Folder 삭제는 List 삭제를 의미하지 않는다.

### INV-D06
List와 Folder는 같은 Space에 속해야 한다.

### INV-D07
동일 List Name은 허용한다.

### INV-D08
Preset Color는 semantic key로 저장한다.

### INV-D09
Sort key는 domain/server에서 할당한다.

### INV-D10
Create는 단일 atomic domain command로 처리한다.

### INV-D11
`creationRequestId`로 idempotency를 보장한다.

### INV-D12
Retry response는 ID 기반 upsert로 Sidebar cache에 반영한다.

### INV-D13
Current View 전환은 defaultViewKey를 자동 변경하지 않는다.

### INV-D14
사용 불가능한 View는 insert 전에 검증한다.

### INV-D15
Client UI는 ViewSpec 내부 구현을 알지 않는다.

---

## 13.77 Data Model Acceptance Criteria

### AC-D01
새 List는 UUID identity를 가진다.

### AC-D02
Folder가 없으면 `folderId = null`로 저장된다.

### AC-D03
Folder가 있으면 List와 같은 Space인지 검증된다.

### AC-D04
Folder 삭제 후 List가 함께 삭제되지 않는다.

### AC-D05
동일 이름 List 두 개를 정상적으로 저장할 수 있다.

### AC-D06
Add List의 List/Board/Gantt 선택은 `defaultViewKey`에 저장된다.

### AC-D07
새 List 생성 때문에 preset View row 여러 개가 자동 생성되지 않는다.

### AC-D08
List Open 시 `defaultViewKey + listId`로 View Registry가 preset을 resolve할 수 있다.

### AC-D09
Calendar가 Add List에 노출되지 않아도 domain ViewKey로 존재할 수 있다.

### AC-D10
Client create payload에 sortKey를 포함하지 않는다.

### AC-D11
동시 생성에서도 server/domain이 안정적인 append sortKey를 부여한다.

### AC-D12
같은 `creationRequestId` Retry로 List가 두 번 생성되지 않는다.

### AC-D13
같은 requestId에 다른 logical payload가 오면 conflict로 처리된다.

### AC-D14
Create 성공 응답만으로 Sidebar에 새 List metadata를 즉시 반영할 수 있다.

### AC-D15
View availability가 Submit 전에 재검증된다.

### AC-D16
Persistence success 이전에는 orphan List가 Sidebar에 노출되지 않는다.

### AC-D17
Create domain error가 §10의 UI error code로 매핑될 수 있다.

### AC-D18
Current View 변경만으로 `defaultViewKey`가 DB에서 변경되지 않는다.

---

## 13.78 §13에서 의도적으로 미확정한 것

다음은 이후 섹션에서 확정한다.

```text
Desktop / Tablet / Mobile breakpoint와 Layout 전환        → §14
Reducer / Controller / Service / Component 실제 파일 구조  → §15
UI + State + Error + Post-create 통합 Matrix               → §16
최종 구현 완료 판단을 위한 E2E Acceptance Criteria         → §17
```
# 14. Responsive 규칙

## 14.1 설계 목표

Desktop에서는 TickTick 레퍼런스와 유사한 **2-panel Modal**을 유지하되, 화면 폭이 좁아질수록 Preview를 우선 축소·제거하고 Form usability를 보호한다.

핵심 원칙:

> **Preview는 보조 정보이고 Form이 핵심이다.**

따라서 viewport가 좁아질 때 우선순위는 다음과 같다.

```text
1. Form width 보호
2. Action 접근성 보호
3. Input/Dropdown usability 보호
4. Preview 축소
5. Preview 제거
6. Modal → Bottom Sheet 전환
```

Form을 압축하면서까지 Preview를 유지하지 않는다.

---

## 14.2 Breakpoint 체계

V1에서는 다음 네 구간을 사용한다.

```text
A. Wide Desktop     ≥ 1280px
B. Compact Desktop  960px ~ 1279px
C. Tablet           640px ~ 959px
D. Mobile           < 640px
```

### 이유

- 1280px 이상에서는 1200px Modal을 안정적으로 유지할 수 있다.
- 960px 이상이면 축소된 2-panel 구조가 여전히 의미 있다.
- 640~959px에서는 Preview보다 Form single-column이 우선이다.
- 640px 미만에서는 center modal보다 bottom sheet가 자연스럽다.

---

## 14.3 Wide Desktop — ≥ 1280px

기본 TickTick 스타일을 그대로 유지한다.

```text
Modal width:  min(1200px, 100vw - 64px)
Modal height: min(700px, 100vh - 64px)

Settings: 54%
Preview:  46%
```

구조:

```text
┌──────────────────────────────────────────────────────────┐
│ SETTINGS                         PREVIEW                  │
│                                                          │
│ Name                              Illustration           │
│ Color                                                    │
│ View                                                     │
│ Folder                                                   │
│                                                          │
│                         [추가] [취소]                    │
└──────────────────────────────────────────────────────────┘
```

### MUST

§2~§13의 Desktop spec을 그대로 사용한다.

---

## 14.4 Compact Desktop — 960px ~ 1279px

2-panel 구조는 유지하되 Preview 비율을 줄인다.

권장:

```text
Modal width: calc(100vw - 48px)
Modal max-width: 1120px

Settings: 58%
Preview:  42%
```

예:

```text
1000px viewport
→ modal ≈ 952px
→ settings ≈ 552px
→ preview ≈ 400px
```

### 목표

Settings Panel의 실제 content width가 최소 약 `500px` 수준을 유지하도록 한다.

---

## 14.5 Compact Desktop에서 Settings Grid 조정

Wide Desktop:

```text
Label 180
Gap    20
Control 368
```

Compact Desktop에서는 다음처럼 유동화한다.

```text
Label:   150~170px
Gap:     16px
Control: 1fr
```

권장 CSS:

```css
grid-template-columns: minmax(150px, 170px) 1fr;
column-gap: 16px;
```

### MUST

Folder trigger와 View group이 한 줄에서 정상적으로 표시되어야 한다.

---

## 14.6 Compact Desktop Preview 축소

Preview illustration:

```text
Wide:    max 460px
Compact: max 360~400px
```

Panel padding:

```text
left/right 24px
top 110~120px
```

### MUST

Preview 내부 List/Board/Gantt 구조 자체는 유지한다.

단 요소 크기는 proportional하게 축소 가능.

---

## 14.7 Compact Desktop에서 Preview Detail 감소

폭이 작아지면 Preview에서 가장 먼저 줄일 것:

```text
task skeleton row 수
board card 수
gantt date column 수
```

예:

```text
List: 4 rows → 3 rows
Board: 3 columns 유지, card 수 감소
Gantt: 5 date slots → 4
```

### MUST

View type을 구분하는 핵심 silhouette는 유지한다.

---

## 14.8 Tablet — 640px ~ 959px

Tablet에서는 **2-panel을 제거하고 single-column Modal**로 전환한다.

```text
┌──────────────────────────────┐
│         리스트 추가          │
│                              │
│ Name                         │
│                              │
│ Color                        │
│ View                         │
│ Folder                       │
│                              │
│             [추가] [취소]    │
└──────────────────────────────┘
```

Preview는 기본적으로 숨긴다.

---

## 14.9 Tablet Modal 크기

권장:

```text
width: min(640px, calc(100vw - 32px))
max-height: calc(100vh - 32px)
```

Radius:

```text
16px
```

Padding:

```text
24px
```

### MUST

Form controls가 최소 `~480px` 안팎의 실사용 폭을 확보하도록 한다.

---

## 14.10 Tablet Form Grid

Tablet에서는 Label/Control 2-column을 유지할 수 있는 폭이면 유지한다.

권장 기준:

```text
modal content width >= 520px
→ 2-column

content width < 520px
→ stacked label
```

### 2-column 예

```text
색상      ● ● ● ...
기본 보기 [ ][ ][ ]
폴더      [       ]
```

### stacked 예

```text
색상
● ● ● ...

기본 보기
[ ][ ][ ]

폴더
[             ]
```

---

## 14.11 Tablet에서 Preview 제거 이유

Preview는 선택 결과를 이해시키는 보조 정보다.

Tablet에서 Preview를 유지하려고:

```text
Form width 감소
Modal height 증가
Control wrap
```

을 유발하면 안 된다.

### 원칙

```text
Form usability > Preview
```

---

## 14.12 Tablet Actions

가능하면 Desktop과 동일하게:

```text
[추가] [취소]
```

우측 정렬 유지.

단 content width가 좁으면 버튼 폭을 줄일 수 있다.

권장:

```text
112~120px × 48px
```

### MUST

버튼 텍스트가 잘리지 않는다.

---

## 14.13 Mobile — < 640px

Mobile에서는 중앙 Modal 대신 **Bottom Sheet**를 사용한다.

구조:

```text
┌──────────────────────────────┐
│           backdrop           │
│                              │
│                              │
├──────────────────────────────┤
│           ─────              │
│ 리스트 추가                  │
│                              │
│ 리스트 이름                  │
│ [                          ] │
│                              │
│ 색상                         │
│ ● ● ● ● ● ...               │
│                              │
│ 기본 보기                    │
│ [목록] [보드] [간트]         │
│                              │
│ 폴더                         │
│ [없음                    ▾]  │
│                              │
│ [        추가              ] │
│          취소                │
└──────────────────────────────┘
```

---

## 14.14 Mobile Bottom Sheet 높이

기본:

```text
max-height: 92dvh
```

권장:

```css
max-height: min(92dvh, 760px);
```

### MUST

- safe-area bottom inset 반영
- 화면 전체를 완전히 덮는 full-screen sheet가 기본이 되지 않게 한다.
- 내용이 길면 sheet 내부 scroll.

---

## 14.15 Mobile Width / Radius

```text
width: 100%
border-radius: 18px 18px 0 0
```

좌우 padding:

```text
20px
```

작은 기기:

```text
16px
```

까지 허용.

---

## 14.16 Mobile Header

Desktop의 centered title을 그대로 사용하지 않고, Mobile에서는 left-aligned title을 권장한다.

```text
리스트 추가
```

이유:

Bottom Sheet에서는 left title이 더 자연스럽고 vertical space를 적게 쓴다.

### Drag Handle

상단:

```text
─────
```

neutral drag handle MAY 표시.

---

## 14.17 Mobile Close 방식

Desktop과 달리 Bottom Sheet에서는 명시적 close affordance가 더 중요할 수 있다.

두 방식 중 하나:

```text
A. Drag handle + Cancel
B. Header 우측 × + Cancel
```

### 본 설계 권장

```text
Header 우측 × 없음
Bottom의 취소 action 유지
Swipe down / Back / Esc equivalent 허용
```

단 실제 앱의 기존 Bottom Sheet primitive 정책이 있으면 그 정책을 우선한다.

---

## 14.18 Mobile Name Field

Desktop `56px` 높이를 유지하거나 `52px`까지 줄일 수 있다.

권장:

```text
height: 52~56px
width: 100%
```

아이콘 slot:

```text
48~52px
```

### MUST

touch target과 typing 편의성을 위해 48px 미만으로 줄이지 않는다.

---

## 14.19 Mobile Label Layout

모든 setting은 stacked layout으로 전환한다.

```text
색상
[control]

기본 보기
[control]

폴더
[control]
```

### 이유

2-column label/control 구조는 mobile에서 수평 공간을 과도하게 소비한다.

---

## 14.20 Mobile Color Palette

10개 swatch를 한 줄에 억지로 넣지 않는다.

두 가지 전략:

### 권장 A — Horizontal Scroll

```text
색상
← ⊘ ● ● ● ● ● ● ● ● ◉ →
```

```css
overflow-x: auto;
white-space: nowrap;
```

### 대안 B — 2-row wrap

```text
⊘ ● ● ● ●
● ● ● ● ◉
```

### 본 설계 확정

**Horizontal scroll을 우선한다.**

이유:

- TickTick식 한 줄 visual rhythm 유지
- selected order 유지
- 높이 증가 최소화

---

## 14.21 Mobile Color Touch Target

Desktop:

```text
32px interaction box
```

Mobile:

```text
40~44px interaction box
```

Visual circle은:

```text
28~30px
```

유지 가능.

---

## 14.22 Mobile View Picker

Desktop icon-only tile보다 mobile에서는 text를 함께 보여주는 것을 권장한다.

예:

```text
[☷ 목록] [▥ 보드] [≡ 간트]
```

### 이유

Mobile에서는 hover tooltip이 없기 때문이다.

권장:

```text
height: 48px
flex: 1
gap: 8px
```

세 버튼이 한 줄에 들어갈 수 있으면 한 줄 유지.

---

## 14.23 좁은 Mobile View Picker

폭이 매우 좁으면:

```text
3 equal flex buttons
font-size 13~14px
```

사용.

그래도 한 줄 유지가 우선.

### MUST NOT

List / Board / Gantt를 세로로 길게 쌓지 않는다.

---

## 14.24 Mobile Folder Trigger

```text
width: 100%
height: 50~52px
```

Dropdown 대신 mobile에서는 Bottom Sheet/Picker를 재사용할 수 있다.

### 본 설계

기존 앱에 mobile select sheet primitive가 있으면 사용.

없으면 현재 Bottom Sheet 내부 anchored popover보다 **nested select sheet**를 권장한다.

---

## 14.25 Mobile Folder Picker

권장 구조:

```text
폴더 선택
────────────
✓ 없음
  학교
  대학원
  개인

+ 새 폴더
```

화면 아래에서 별도 작은 sheet로 올라올 수 있다.

### MUST

부모 Add List Draft는 유지한다.

---

## 14.26 Mobile 새 Folder 생성

nested sheet 안에서 inline create 또는 dedicated compact screen.

V1 권장:

```text
+ 새 폴더
→ inline input
```

Desktop과 동일한 domain flow 유지.

---

## 14.27 Mobile Actions

Primary Add는 full-width.

```text
[              추가              ]
```

height:

```text
50~52px
```

Cancel은 아래 secondary text/button.

```text
취소
```

### 이유

Mobile에서는 두 개의 128px 버튼을 우측 정렬하는 것보다 full-width primary가 더 안정적이다.

---

## 14.28 Mobile Action Sticky

Sheet 내부 scroll이 발생하면 Primary Action을 하단 sticky로 유지하는 것을 권장한다.

```text
Scrollable form
──────────────
Sticky action zone
[추가]
취소
```

### MUST

keyboard가 올라와도 Add button에 접근할 수 있어야 한다.

---

## 14.29 Mobile Keyboard와 Sheet

Name input focus 시 software keyboard가 올라온다.

### MUST

- focused input이 keyboard 뒤에 가려지지 않는다.
- action zone이 완전히 사라지지 않도록 viewport unit은 `dvh` 사용 권장.
- sheet가 keyboard 때문에 과도하게 jump하지 않는다.

---

## 14.30 Mobile Autofocus 정책

Desktop에서는 Name autofocus가 기본이지만 Mobile에서는 **자동 키보드 호출 여부를 신중히 처리**한다.

본 설계 권장:

```text
Mobile Bottom Sheet Open
→ Name field focus는 유지 가능
→ 단 software keyboard 자동 open이 너무 공격적이면 delayed/no autofocus 정책 허용
```

### 최종 정책

**기존 앱의 mobile modal autofocus convention을 우선한다.**

앱 전반에서 sheet open 시 keyboard 자동 호출을 피한다면 Add List도 동일하게 한다.

---

## 14.31 Mobile 생성 성공 후 Focus

Desktop:

```text
Quick Add autofocus
```

Mobile에서는 생성 직후 software keyboard를 다시 자동으로 띄우는 것이 불편할 수 있다.

권장:

```text
Mobile
→ 새 List 화면 진입
→ Quick Add는 visible
→ 자동 keyboard 호출은 생략 가능
```

### 원칙

Desktop과 Mobile의 “READY_FOR_FIRST_TASK”는 동일하지만 focus 정책은 다를 수 있다.

---

## 14.32 Small Height Desktop

폭은 넓지만 높이가 작은 화면이 있다.

예:

```text
1366 × 600
```

이 경우 `700px` Modal을 그대로 유지하면 안 된다.

권장:

```text
height: calc(100vh - 32px)
```

그리고:

```text
Header fixed
Form scroll
Actions fixed
```

구조를 활성화.

---

## 14.33 Height Breakpoint

권장:

```text
viewport height < 760px
→ compact vertical mode
```

변경:

```text
top/bottom padding 감소
vertical gaps 감소
preview top offset 감소
form zone scroll 허용
```

---

## 14.34 Compact Vertical Spacing

예:

```text
Header → Name       28px
Name → Color        22px
Color → View        22px
View → Folder       22px
```

Desktop 기본보다 줄이되 control height는 유지한다.

---

## 14.35 200% Zoom 대응

브라우저 200% zoom은 사실상 viewport가 크게 줄어든 것과 같다.

따라서 px zoom 감지보다 **실제 CSS viewport width/height 기준 responsive 규칙**을 따른다.

### MUST

200% zoom에서:

```text
Action unreachable
Folder dropdown clipped
Name input off-screen
```

상태가 없어야 한다.

---

## 14.36 200% Zoom에서 Layout 우선순위

```text
2-panel 유지 실패
→ single-column
→ scrollable form
```

Preview는 제거.

---

## 14.37 Orientation Change

Tablet/Mobile portrait ↔ landscape 전환 시:

- Draft 유지
- child surface 가능하면 닫고 re-anchor
- Modal/Sheet layout만 재계산

### MUST

orientation change로 Modal session을 reset하지 않는다.

---

## 14.38 Resize 중 Draft 보존

Desktop window resize로 breakpoint가 바뀌어도:

```text
draft
request
error
```

상태는 그대로.

### MUST

Responsive component tree가 바뀐다고 Draft가 remount/reset되지 않게 한다.

---

## 14.39 Child Surface Resize 정책

Folder dropdown open 상태에서 breakpoint가 바뀌면:

```text
Desktop popover
→ Mobile nested sheet
```

자동 변환이 복잡할 수 있다.

V1 권장:

```text
breakpoint change
→ child surface close
→ parent Draft 유지
```

---

## 14.40 Preview Responsive 정책 요약

```text
≥1280
→ full preview

960~1279
→ compact preview

640~959
→ preview hidden

<640
→ preview hidden
```

Preview는 Tablet 이하에서 기본적으로 렌더하지 않는다.

---

## 14.41 Modal/Sheet 전환 요약

```text
≥960
→ center modal

640~959
→ center single-column modal

<640
→ bottom sheet
```

---

## 14.42 Touch Target 규칙

Mobile:

```text
minimum recommended interactive target: 44px
```

특히:

```text
Color swatch wrapper
View button
Folder item
Add button
Cancel
```

에 적용.

---

## 14.43 Hover-only UI 금지

Mobile/Touch에서는 hover가 없으므로:

- View label은 visible
- selected state는 border/background
- long Folder name은 tap/focus 가능한 tooltip alternative 고려

### MUST

Tooltip 없이는 의미를 알 수 없는 icon-only control을 mobile에 그대로 두지 않는다.

---

## 14.44 Pointer Coarse Media Query

가능하면:

```css
@media (pointer: coarse)
```

에서 hit target을 키울 수 있다.

Viewport width만으로 touch device를 가정하지 않는다.

---

## 14.45 Safe Area

iOS 등에서:

```text
env(safe-area-inset-bottom)
```

반영.

Sticky action zone:

```text
padding-bottom:
  calc(16px + env(safe-area-inset-bottom))
```

---

## 14.46 Mobile Back Gesture

Android back / browser back / native sheet dismiss가 Modal close 역할을 할 수 있다.

Submitting 중에는 §7 정책에 따라 dismiss를 막거나 no-op 처리.

### MUST

Back gesture가 submitting request를 조용히 버리지 않는다.

---

## 14.47 Swipe-to-dismiss

Bottom Sheet primitive가 swipe dismiss를 지원한다면:

```text
open/editable
→ swipe dismiss 허용

submitting
→ swipe dismiss 잠금
```

Cancel confirmation은 없음.

---

## 14.48 Responsive Error Layout

Tablet/Mobile에서 global error는 Action 바로 위 full-width로 표시.

```text
⚠ 리스트를 만들지 못했습니다.
[다시 시도]
```

Desktop처럼 우측 정렬 버튼과 조합되더라도 message가 잘리지 않는다.

---

## 14.49 Responsive Folder Search

Mobile에서는 Folder가 적어도 dedicated picker screen이면 search를 9개 임계값 그대로 유지할 수 있다.

```text
<=8 → no search
>=9 → search
```

규칙 유지.

---

## 14.50 Responsive Custom Color Picker

Desktop:

```text
anchored popover
```

Mobile:

```text
small nested sheet / native color picker
```

사용 가능.

### MUST

Custom Color draft semantics는 동일하다.

---

## 14.51 Responsive View Preview 대체

Tablet/Mobile에서 Preview가 사라지므로 View tile 자체가 더 설명적이어야 한다.

따라서:

```text
Desktop → icon-only + tooltip
Mobile  → icon + text
```

로 변경한다.

Tablet은 상황에 따라 text label 노출을 허용한다.

---

## 14.52 Responsive Performance

Tablet/Mobile에서 Preview component를 단순히 `display:none`만 하기보다 렌더 자체를 생략하는 것을 권장한다.

```text
if viewport < 960
→ do not mount preview
```

단 viewport hook implementation은 SSR/hydration 이슈를 고려.

---

## 14.53 SSR / Hydration

서버 렌더 환경이 있다면 viewport width를 서버에서 정확히 모를 수 있다.

권장:

- CSS로 layout 변화 우선
- Preview mount 최적화는 hydration 이후 적용
- 초기 hydration mismatch를 만들지 않는다.

---

## 14.54 Responsive Token 권장

```text
--add-list-modal-max-width
--add-list-modal-gutter
--add-list-panel-padding
--add-list-control-height
--add-list-action-height
```

Breakpoint별 token override를 사용.

---

## 14.55 Responsive Wireframe 요약

### Wide Desktop

```text
[ Settings 54% | Preview 46% ]
```

### Compact Desktop

```text
[ Settings 58% | Preview 42% ]
```

### Tablet

```text
[ Single-column Modal ]
```

### Mobile

```text
[ Bottom Sheet ]
```

---

## 14.56 Responsive Invariants

### INV-R01
Form usability가 Preview보다 우선이다.

### INV-R02
960px 이상에서 2-panel Desktop 구조를 유지한다.

### INV-R03
640~959px에서는 Preview를 숨기고 single-column Modal을 사용한다.

### INV-R04
640px 미만에서는 Bottom Sheet를 사용한다.

### INV-R05
Mobile에서 setting rows는 stacked layout이다.

### INV-R06
Mobile View Picker는 icon + text를 사용한다.

### INV-R07
Mobile Primary Action은 full-width다.

### INV-R08
Responsive 전환으로 Draft/Request state를 reset하지 않는다.

### INV-R09
Height가 부족하면 control 크기보다 spacing을 먼저 줄인다.

### INV-R10
200% zoom에서도 Actions와 필수 Form control에 접근 가능해야 한다.

### INV-R11
Submitting 중 Mobile swipe/back dismiss를 허용하지 않는다.

### INV-R12
Preview는 Tablet 이하에서 기능 의존성이 없어야 한다.

---

## 14.57 Responsive Acceptance Criteria

### AC-R01
1280px 이상에서 1200px급 2-panel Modal이 표시된다.

### AC-R02
960~1279px에서 2-panel은 유지되지만 Preview 비율이 줄어든다.

### AC-R03
640~959px에서 Preview가 제거되고 single-column Modal이 표시된다.

### AC-R04
640px 미만에서 Add List는 Bottom Sheet로 열린다.

### AC-R05
Mobile에서 Name/Folder input이 최소 48px 이상의 touch-friendly 높이를 가진다.

### AC-R06
Mobile Color palette는 horizontal scroll로 접근 가능하다.

### AC-R07
Mobile View Picker에는 icon과 text label이 함께 표시된다.

### AC-R08
Mobile Primary Add button은 full-width다.

### AC-R09
Mobile sheet 내부 scroll이 생겨도 Add action에 접근할 수 있다.

### AC-R10
Software keyboard가 올라와도 focused input이 가려지지 않는다.

### AC-R11
Breakpoint 변경 중 Draft 값이 유지된다.

### AC-R12
Orientation 변경 후에도 Draft와 Modal session이 유지된다.

### AC-R13
200% browser zoom에서 form/action이 viewport 밖으로 영구적으로 사라지지 않는다.

### AC-R14
Viewport height가 작을 때 Header/Actions는 유지되고 Form이 scroll된다.

### AC-R15
Tablet/Mobile에서 Preview가 없어도 List 생성 기능이 동일하게 동작한다.

### AC-R16
Submitting 중 Mobile back/swipe dismiss가 List create request를 중단시키지 않는다.

---

## 14.58 §14에서 의도적으로 미확정한 것

다음은 이후 섹션에서 확정한다.

```text
실제 React/component 디렉터리와 hook 분리           → §15
Breakpoint별 상태/interaction 통합 matrix           → §16
Desktop/Tablet/Mobile E2E 완료 조건                  → §17
```
# 15. Component Architecture

## 15.1 설계 목표

§0~§14에서 화면, interaction, state, data, responsive 규칙을 확정했다.

이 섹션에서는 이를 실제 구현 단위로 분해한다.

목표는 다음과 같다.

1. `CreateListModal`이 모든 책임을 갖는 거대한 component가 되지 않게 한다.
2. UI, form state, domain mutation, navigation side effect를 분리한다.
3. Preview가 실제 View implementation에 결합되지 않게 한다.
4. Folder/Color child surface가 parent Modal과 상태 충돌을 만들지 않게 한다.
5. reducer/controller/service의 dependency 방향을 단방향으로 유지한다.
6. post-create navigation을 Modal lifecycle과 분리한다.
7. 향후 `Edit List`, `Create Folder`, `Create View` 같은 유사 flow가 생겨도 primitive를 재사용할 수 있게 한다.

---

## 15.2 최종 Layer 구조

권장 architecture:

```text
UI Layer
│
├─ CreateListModal
├─ CreateListForm
├─ Field Components
├─ Child Surfaces
└─ Preview
        │
        ▼
Controller Layer
│
├─ useCreateListController
├─ reducer
├─ selectors
└─ validation/normalization
        │
        ▼
Domain Service Layer
│
├─ listService
├─ folderService
├─ viewRegistry
└─ permission/scope validation
        │
        ▼
Application / Infrastructure
│
├─ repository / API / RPC
├─ router
├─ global store/cache
└─ telemetry
```

그리고 persistence 성공 이후:

```text
CreateListController
        │
        ▼
PostCreateCoordinator
        │
        ├─ Sidebar cache
        ├─ Folder expand
        ├─ Route navigation
        └─ Focus first action
```

---

## 15.3 Dependency 방향

허용:

```text
Component
→ Controller
→ Service
→ Repository/API
```

허용:

```text
Controller
→ View Registry
→ Router adapter
→ Cache adapter
```

금지:

```text
Component
→ DB client
Component
→ raw SQL
Component
→ Router 직접 orchestration
Preview
→ View engine business logic
Reducer
→ async API
Service
→ React component
```

### 핵심 원칙

> **UI는 의도를 전달하고, Controller는 흐름을 조정하며, Service는 domain 규칙을 실행한다.**

---

## 15.4 권장 디렉터리 구조

현재 프로젝트가 `src/` 기반이라고 가정할 때 다음 구조를 권장한다.

```text
src/
├─ components/
│  └─ lists/
│     └─ create-list/
│        ├─ CreateListModal.tsx
│        ├─ CreateListForm.tsx
│        ├─ CreateListActions.tsx
│        │
│        ├─ fields/
│        │  ├─ ListNameField.tsx
│        │  ├─ ListColorPicker.tsx
│        │  ├─ DefaultViewPicker.tsx
│        │  └─ FolderSelect.tsx
│        │
│        ├─ child-surfaces/
│        │  ├─ CustomColorPopover.tsx
│        │  ├─ FolderSelectPopover.tsx
│        │  └─ InlineFolderCreate.tsx
│        │
│        ├─ preview/
│        │  ├─ CreateListPreview.tsx
│        │  ├─ ListPreview.tsx
│        │  ├─ BoardPreview.tsx
│        │  └─ GanttPreview.tsx
│        │
│        └─ createList.module.css
│
├─ domain/
│  └─ lists/
│     ├─ createListTypes.ts
│     ├─ createListReducer.ts
│     ├─ createListSelectors.ts
│     ├─ createListValidation.ts
│     ├─ createListNormalization.ts
│     ├─ createListService.ts
│     └─ createListErrors.ts
│
├─ hooks/
│  └─ lists/
│     └─ useCreateListController.ts
│
├─ app/
│  └─ navigation/
│     └─ postCreateListCoordinator.ts
│
└─ domain/
   └─ view/
      └─ viewRegistry.ts
```

### 주의

실제 프로젝트의 기존 폴더 convention이 있다면 이름은 그 convention에 맞춘다.

이 문서가 강제하는 것은 **책임 분리**이지 정확한 directory spelling이 아니다.

---

## 15.5 `CreateListModal.tsx`

### 책임

```text
Dialog shell
Responsive container
Modal open/close
Focus trap primitive 연결
Settings / Preview 배치
Controller state wiring
```

### 알아도 되는 것

```text
controller.state
controller.actions
responsive mode
```

### 몰라야 하는 것

```text
DB schema
sortKey allocation
idempotency implementation
Board ViewSpec internals
Folder repository query details
```

---

## 15.6 `CreateListModal` 구조

개념:

```tsx
<CreateListDialog>
  <CreateListForm ... />
  {showPreview && <CreateListPreview ... />}
</CreateListDialog>
```

Desktop:

```text
Form | Preview
```

Tablet:

```text
Form only
```

Mobile:

```text
Bottom Sheet
└─ Form
```

### MUST

Responsive 전환 때문에 Form state를 새로 만들지 않는다.

---

## 15.7 `CreateListForm.tsx`

### 책임

Form 내부 setting row 조립.

```text
Name
Color
View
Folder
Error slot
Actions
```

### Props 예시

```ts
type CreateListFormProps = {
  state: CreateListViewState;
  actions: CreateListUIActions;
};
```

Form이 reducer 전체 raw state를 직접 받기보다 selector로 가공된 ViewState를 받는 것을 권장한다.

---

## 15.8 `CreateListViewState`

UI에 필요한 최소 파생 상태:

```ts
type CreateListViewState = {
  draft: CreateListDraft;

  canSubmit: boolean;
  isSubmitting: boolean;

  fieldErrors: FieldErrors;
  createError: CreateListError | null;

  availableViews: CreateListDefaultViewKey[];
  folderOptions: FolderOption[];

  activeChildSurface: CreateListChildSurface;

  responsiveMode:
    | "wide"
    | "compact"
    | "tablet"
    | "mobile";
};
```

### 이유

Component가 reducer 내부의 session/request/postCreate 구조에 과도하게 결합되지 않는다.

---

## 15.9 `CreateListUIActions`

권장:

```ts
type CreateListUIActions = {
  updateName(value: string): void;
  updateColor(value: ListColorValue): void;
  updateView(value: CreateListDefaultViewKey): void;
  updateFolder(value: string | null): void;

  openCustomColor(): void;
  openFolderSelect(): void;
  closeChildSurface(): void;

  submit(): void;
  retry(): void;
  cancel(): void;
};
```

Child component는 필요한 action subset만 받는다.

---

## 15.10 `ListNameField.tsx`

### 책임

```text
single-line input rendering
icon slot
focus/hover/error visual
IME composition guard
Enter submit trigger
```

### 갖지 않는 책임

```text
List create mutation
validation source of truth
navigation
```

Props:

```ts
type ListNameFieldProps = {
  value: string;
  disabled: boolean;
  error?: string;

  onChange(value: string): void;
  onSubmit(): void;
};
```

---

## 15.11 Name IME State

`isComposing`은 이 component local state로 허용한다.

```text
compositionstart
→ true

compositionend
→ false
```

### 이유

이 값은 domain Draft가 아니라 input interaction state다.

---

## 15.12 `ListColorPicker.tsx`

### 책임

```text
None / preset / Custom swatch rendering
radio group semantics
roving tabindex
selected/focus visual
Custom Popover open action
```

### Props

```ts
type ListColorPickerProps = {
  value: ListColorValue;
  disabled: boolean;

  onChange(value: ListColorValue): void;
  onOpenCustom(): void;
};
```

---

## 15.13 Color Picker 내부 상태

허용 local state:

```text
focusedIndex
```

허용하지 않음:

```text
selectedColor
```

선택값은 parent Draft가 source of truth.

---

## 15.14 `CustomColorPopover.tsx`

### 책임

```text
custom color temporary draft
HEX input
Apply / Cancel
Focus scope
Esc handling
```

### Source of Truth

Apply 전:

```text
child.customColorDraft
```

Apply 후:

```text
draft.color
```

### MUST

Popover 자체가 persistence를 실행하지 않는다.

---

## 15.15 Custom Color Primitive 재사용

앱에 이미 공통 ColorPicker가 있으면 재사용한다.

단 Add List 전용 wrapper가:

```text
preset ↔ custom
Apply semantics
focus return
```

을 관리한다.

---

## 15.16 `DefaultViewPicker.tsx`

### 책임

```text
List / Board / Gantt tile rendering
radio semantics
roving tabindex
selected/hover/focus
responsive label strategy
```

Desktop:

```text
icon-only
```

Mobile:

```text
icon + label
```

### Props

```ts
type DefaultViewPickerProps = {
  value: CreateListDefaultViewKey;
  options: CreateListViewOption[];
  disabled: boolean;

  onChange(value: CreateListDefaultViewKey): void;
};
```

---

## 15.17 View Option DTO

View Registry에서 UI가 직접 복잡한 ViewSpec을 받지 않는다.

권장:

```ts
type CreateListViewOption = {
  key: CreateListDefaultViewKey;
  label: string;
  ariaLabel: string;
  icon: IconToken;
};
```

### MUST

UI component가 Board/Gantt renderer를 import하지 않는다.

---

## 15.18 `FolderSelect.tsx`

### 책임

```text
trigger rendering
current value
combobox semantics
open action
```

실제 dropdown body와 분리 가능.

Props:

```ts
type FolderSelectProps = {
  value: string | null;
  selectedLabel: string;
  disabled: boolean;
  isOpen: boolean;

  onOpen(): void;
};
```

---

## 15.19 `FolderSelectPopover.tsx`

### 책임

```text
None option
Folder list
Search
Keyboard listbox navigation
Selected check
+ 새 폴더
```

### Input

```text
folderOptions
selectedFolderId
searchQuery
```

### Output

```text
onSelect(folderId | null)
onSearch(query)
onStartCreateFolder()
onClose()
```

---

## 15.20 `InlineFolderCreate.tsx`

### 책임

```text
new folder input
IME guard
validation display
Create/Cancel
loading/error state
```

### 호출

```text
controller.createFolder(name)
```

직접 folder repository를 호출하지 않는다.

---

## 15.21 Folder Child Component 분리 이유

`FolderSelect.tsx` 하나에:

```text
trigger
dropdown
search
keyboard
create folder
async mutation
error
```

를 모두 넣으면 가장 복잡한 component가 된다.

따라서:

```text
Trigger
Popover/Listbox
Inline Create
```

로 나눈다.

---

## 15.22 `CreateListActions.tsx`

### 책임

```text
Add
Cancel
Retry
Loading visual
Error slot 주변 action layout
```

### Props

```ts
type CreateListActionsProps = {
  canSubmit: boolean;
  isSubmitting: boolean;
  isError: boolean;
  error?: CreateListError | null;

  onSubmit(): void;
  onRetry(): void;
  onCancel(): void;
};
```

### MUST

Add/Retry가 API를 직접 호출하지 않는다.

---

## 15.23 `CreateListPreview.tsx`

### 책임

```text
Preview frame
Header Name/Color
view별 Preview switch
crossfade
```

Props:

```ts
type CreateListPreviewProps = {
  name: string;
  color: ListColorValue;
  view: CreateListDefaultViewKey;
};
```

---

## 15.24 Preview Subcomponents

```text
ListPreview
BoardPreview
GanttPreview
```

각 component는 **pure visual component**다.

### 금지

```text
TaskRow import
BoardColumn import
Gantt engine import
Router
Store
DB
```

---

## 15.25 Preview CSS Architecture

Preview skeleton style은 실제 View style token을 일부 재사용할 수 있지만 class/component를 재사용하지 않는다.

예:

```text
--preview-line
--preview-border
--preview-surface
```

전용 token 허용.

---

## 15.26 `useCreateListController.ts`

이 flow의 핵심 orchestration layer.

### 책임

```text
open initialization
Draft update
validation
child surface orchestration
submit/retry
Folder inline create
session/request guard
service 호출
post-create coordinator handoff
```

### 반환

```ts
{
  state: viewState,
  actions
}
```

---

## 15.27 Controller가 가져야 하는 Dependency

예:

```ts
type CreateListControllerDeps = {
  listService: ListService;
  folderService: FolderService;
  viewRegistry: ViewRegistry;
  permissionService: PermissionService;
  postCreateCoordinator: PostCreateListCoordinator;
  telemetry: Telemetry;
};
```

실제 앱에서 DI framework가 없으면 module import 기반이어도 된다.

### 원칙

Dependency 방향만 유지.

---

## 15.28 Controller가 하지 않을 것

```text
✕ 직접 JSX render
✕ 직접 SQL
✕ CSS breakpoint 계산 business logic
✕ Board/Gantt internals
```

---

## 15.29 `createListReducer.ts`

### 책임

pure state transition.

예:

```text
OPEN
UPDATE_DRAFT
OPEN_CHILD
CLOSE_CHILD
SUBMIT_START
SUBMIT_FAILURE
SUBMIT_SUCCESS
POST_CREATE_STEP
RESET
```

### MUST

async 함수 호출 없음.

---

## 15.30 Reducer Action 구조

권장:

```ts
type CreateListAction =
  | { type: "OPEN"; payload: OpenPayload }
  | { type: "UPDATE_NAME"; value: string }
  | { type: "UPDATE_COLOR"; value: ListColorValue }
  | { type: "UPDATE_VIEW"; value: CreateListDefaultViewKey }
  | { type: "UPDATE_FOLDER"; value: string | null }
  | { type: "SET_FIELD_ERROR"; field: FieldKey; message?: string }
  | { type: "OPEN_CHILD"; surface: CreateListChildSurface }
  | { type: "CLOSE_CHILD" }
  | { type: "FOLDER_CREATE_START"; requestId: string }
  | { type: "FOLDER_CREATE_SUCCESS"; folder: FolderOption }
  | { type: "FOLDER_CREATE_FAILURE"; error: string }
  | { type: "SUBMIT_START"; request: RequestSnapshot }
  | { type: "SUBMIT_FAILURE"; error: CreateListError }
  | { type: "SUBMIT_SUCCESS"; result: CreateListResult }
  | { type: "POST_CREATE_STEP"; status: PostCreateStatus }
  | { type: "RESET" };
```

---

## 15.31 Reducer를 너무 세분화하지 않기

다음처럼 UI micro-state마다 action을 만들 필요는 없다.

```text
HOVER_ADD
FOCUS_NAME
HOVER_BLUE
```

이런 상태는 CSS/DOM local interaction으로 처리.

Reducer는 **의미 있는 application state**만 다룬다.

---

## 15.32 `createListSelectors.ts`

권장 selector:

```ts
selectIsDraftValid
selectCanSubmit
selectIsBusy
selectCreateError
selectFolderOptions
selectPreviewProps
selectActionState
```

Component에서 raw 상태 조합식을 반복하지 않는다.

---

## 15.33 `createListValidation.ts`

공통 validation source.

예:

```ts
normalizeListName()
validateListName()
validateCustomColor()
validateFolderSelection()
validateViewSelection()
validateCreateListDraft()
```

### MUST

UI enabled logic과 Submit validation이 다른 규칙을 사용하지 않는다.

---

## 15.34 `createListNormalization.ts`

저장 직전 canonicalization.

예:

```text
Name trim
Custom HEX uppercase/lowercase canonical format
Folder null normalize
```

Validation과 normalization을 섞지 않아도 된다.

---

## 15.35 `createListErrors.ts`

Domain/API error → UI error mapping.

예:

```ts
mapCreateListError(error): CreateListError
```

여기서:

```text
NETWORK
TIMEOUT
INVALID_FOLDER
PERMISSION_DENIED
VIEW_UNAVAILABLE
```

등으로 변환.

### MUST

raw infrastructure error가 UI까지 올라오지 않는다.

---

## 15.36 `createListService.ts`

### 책임

```text
Create List domain command 호출
requestId 전달
DTO mapping
```

interface:

```ts
type ListService = {
  create(input: CreateListInput): Promise<CreateListResult>;
};
```

### 금지

```text
React state
Toast
Navigation
Focus
```

---

## 15.37 `folderService.ts`

이미 존재하면 재사용.

필요 contract:

```ts
type FolderService = {
  create(input: CreateFolderInput): Promise<FolderEntity>;
  validateForList(
    spaceId: string,
    folderId: string
  ): Promise<boolean>;
};
```

Folder query 자체는 global store/repository selector를 사용할 수 있다.

---

## 15.38 `viewRegistry.ts`

Add List에서 필요한 API:

```ts
getCreateListViewOptions(spaceId)
isAvailable(spaceId, viewKey)
resolvePreset(listId, viewKey)
```

### MUST

CreateList UI가 View Registry 전체 구현을 import하지 않는다.

Controller/service boundary를 통해 접근 가능.

---

## 15.39 `postCreateListCoordinator.ts`

Persistence success 후 흐름을 Modal과 분리한다.

### 책임

```text
List cache upsert
Folder expand
Sidebar scroll target 준비
Route navigate
View ready 확인
First action focus
Post-create recovery
```

---

## 15.40 Post-create Coordinator interface

예:

```ts
type PostCreateListCoordinator = {
  run(result: CreateListResult): Promise<PostCreateOutcome>;
};
```

Outcome:

```ts
type PostCreateOutcome =
  | { status: "ready" }
  | {
      status: "recovery";
      code:
        | "SIDEBAR_SYNC_FAILED"
        | "NAVIGATION_FAILED"
        | "VIEW_OPEN_FAILED";
    };
```

---

## 15.41 Coordinator가 필요한 이유

Modal이 create success 직후 unmount될 수 있다.

만약 Modal component가:

```text
cache update
navigate
focus
```

를 직접 소유하면 unmount timing과 side effect가 얽힌다.

따라서 persistence 이후 orchestration을 별도 application layer로 넘긴다.

---

## 15.42 Sidebar Adapter

Coordinator가 Sidebar component를 직접 import하지 않는다.

권장:

```ts
sidebarStore.upsertList()
sidebarStore.expandFolder()
sidebarStore.ensureVisible()
```

또는 기존 app store action 사용.

---

## 15.43 Router Adapter

Coordinator:

```ts
navigation.openList({
  listId,
  viewKey
})
```

같은 app-level API 사용.

URL string을 component마다 직접 조립하지 않는다.

---

## 15.44 Focus Adapter

권장:

```ts
focusManager.focusFirstTaskAction({
  listId,
  viewKey
})
```

또는 target registration pattern.

### 이유

View별 DOM selector를 Coordinator가 hard-code하지 않게 한다.

---

## 15.45 First Action Registration

각 View가 자신이 첫 Task action target을 등록할 수 있다.

예:

```text
ListView
→ quickAdd

BoardView
→ boardAddTask

GanttView
→ ganttAddTask
```

Coordinator는 View implementation을 몰라도 된다.

---

## 15.46 Telemetry 위치

권장:

```text
Controller
→ open/submit/cancel/retry

Service
→ domain create duration/error

Coordinator
→ ready/recovery
```

UI field component는 analytics를 직접 보내지 않는다.

---

## 15.47 Modal Manager와 연결

Sidebar `Lists +`는 직접 `CreateListModal`을 렌더링하기보다 기존 Modal manager/presenter가 있다면 다음 형태를 권장한다.

```ts
openCreateList({
  scopeId,
  contextFolderId,
  triggerRef
});
```

### 이유

진입점이 늘어날 수 있다.

```text
Lists +
Folder +
Context menu
Command palette
```

모두 같은 flow를 열어야 한다.

---

## 15.48 Trigger Context Adapter

각 진입점이 Modal 내부를 알지 않는다.

예:

```ts
openCreateList({
  source: "lists-header",
  scopeId,
  contextFolderId: null,
});
```

Folder:

```ts
openCreateList({
  source: "folder",
  scopeId,
  contextFolderId: folder.id,
});
```

---

## 15.49 Responsive Component 재사용

Desktop Modal과 Mobile Bottom Sheet를 **서로 다른 Form component로 복제하지 않는다.**

권장:

```text
CreateListResponsiveShell
├─ DesktopDialog
└─ MobileSheet

둘 다
→ 동일 CreateListForm
```

### MUST

```text
DesktopCreateListForm
MobileCreateListForm
```

처럼 logic duplication하지 않는다.

---

## 15.50 Responsive Shell 구조

```tsx
function CreateListModal() {
  const mode = useResponsiveMode();

  if (mode === "mobile") {
    return (
      <BottomSheet>
        <CreateListForm />
      </BottomSheet>
    );
  }

  return (
    <Dialog>
      <CreateListForm />
      {showPreview && <CreateListPreview />}
    </Dialog>
  );
}
```

실제 state는 같은 controller instance를 사용.

---

## 15.51 Breakpoint 변경 중 Remount 방지

가능하면 shell만 바뀌어도 controller/form state는 상위에 유지한다.

구조:

```text
CreateListFeatureProvider
└─ ResponsiveShell
```

### 이유

orientation/resize로 Draft가 reset되지 않게 한다.

---

## 15.52 Context Provider 사용 여부

Create List 전용 Context는 다음 조건일 때만 고려한다.

- props drilling이 과도함
- field component가 많음
- controller state/actions가 안정적으로 공유됨

### 권장

V1에서는 작은 feature context 사용 가능.

```text
CreateListContext
```

단 global context로 만들지 않는다.

---

## 15.53 Context에 넣을 것

```text
viewState
actions
```

정도.

Repository/service를 child component에서 직접 꺼내 쓰게 하지 않는다.

---

## 15.54 Styling 구조

권장 두 가지 중 프로젝트 convention을 따른다.

```text
CSS Modules
or
existing utility class system
```

### MUST

Add List 때문에 새 styling framework를 추가하지 않는다.

---

## 15.55 Design Token 사용

Component 내부 raw value를 최소화한다.

예:

```text
modal radius
control height
focus ring
accent
surface
```

전역/feature token 사용.

단 §2~§14의 px spec은 feature token의 default 값으로 반영 가능.

---

## 15.56 Component Public API 최소화

`CreateListModal` 외부에 노출할 public API는 매우 작게 유지한다.

예:

```ts
openCreateList(context)
closeCreateList()
```

내부 field component는 feature private component로 둔다.

---

## 15.57 Error Boundary

Preview에는 별도 error boundary를 두는 것을 권장한다.

```text
Preview crash
→ Preview fallback/hidden
→ Form 유지
```

Modal 전체에 Error Boundary를 둘 수도 있지만 persistence command error는 일반 state로 처리.

### MUST

예상 가능한 network/domain error를 React Error Boundary로 처리하지 않는다.

---

## 15.58 Suspense / Async Data

Folder options나 View availability가 async라면 app data layer의 기존 suspense/query convention을 따른다.

### 권장

Modal shell 자체 open은 block하지 않는다.

Name input은 즉시 사용 가능.

Folder data는 child surface open 시 준비되면 된다.

---

## 15.59 Query/Cache Key

예:

```text
foldersBySpace(spaceId)
listsBySpace(spaceId)
```

성공 후:

```text
list result upsert
folder children selector recompute
```

무조건 전체 app reload/refetch하지 않는다.

---

## 15.60 Testing Layer 구분

### Unit

```text
reducer
selectors
validation
normalization
error mapping
```

### Component

```text
Name
Color
View
Folder
Actions
Preview
```

### Integration

```text
Controller + service mock
submit/error/retry
folder create
responsive shell
```

### E2E

```text
Lists + → create → route → Quick Add
```

---

## 15.61 Reducer Unit Test 예

```text
OPEN
→ initial Draft correct

UPDATE_NAME
→ revision +1

SUBMIT_START
→ status submitting

SUBMIT_FAILURE
→ error + Draft preserved

SUBMIT_SUCCESS
→ post-create
```

---

## 15.62 Selector Test 예

```text
Name empty
→ canSubmit false

Name valid
→ true

folderCreate submitting
→ false

View unavailable
→ false
```

---

## 15.63 Component Test 예

`ListColorPicker`:

```text
ArrowRight
→ next color selected
```

`DefaultViewPicker`:

```text
Board click
→ onChange("board")
```

`FolderSelectPopover`:

```text
None select
→ onSelect(null)
```

---

## 15.64 Integration Test 예

```text
Create success
→ service called once
→ coordinator called once
```

Timeout retry:

```text
same requestId
```

Draft edit after error:

```text
new requestId
```

---

## 15.65 E2E Test 책임

최종 §17에서 구체화하지만 architecture상 다음 경로를 자동화 가능해야 한다.

```text
Sidebar +
→ Modal
→ Name
→ Color
→ Board
→ Folder
→ Add
→ Sidebar
→ Board route
→ Add Task focus
```

---

## 15.66 파일 간 Dependency 예시

```text
CreateListModal.tsx
  → useCreateListController
  → CreateListForm
  → CreateListPreview

CreateListForm.tsx
  → ListNameField
  → ListColorPicker
  → DefaultViewPicker
  → FolderSelect
  → CreateListActions

useCreateListController.ts
  → createListReducer
  → validation
  → listService
  → folderService
  → viewRegistry
  → postCreateCoordinator
```

---

## 15.67 금지할 순환 Dependency

예:

```text
viewRegistry
→ CreateListModal
```

금지.

```text
listService
→ useCreateListController
```

금지.

```text
FolderSelect
→ Sidebar component
```

금지.

---

## 15.68 기존 Sidebar와 Integration

Sidebar `Lists +`는:

```text
onClick
→ openCreateList(...)
```

만 담당.

Folder row `+`도 동일.

### MUST

Sidebar가 CreateListDraft를 직접 관리하지 않는다.

---

## 15.69 기존 View Engine과 Integration

생성 Modal은 View Engine에 다음 정도만 의존한다.

```text
available view options
resolve default view after create
```

View rendering은 기존 engine 책임.

### MUST

Create List feature 때문에 View Engine을 복제하지 않는다.

---

## 15.70 List Entity Cache Integration

Create success:

```text
upsert(list)
```

를 사용.

append-only:

```text
push(list)
```

보다 ID 기반 upsert를 권장.

Retry duplicate response에 안전.

---

## 15.71 Folder Expand State

Folder expanded/collapsed 상태는 Sidebar/global navigation store 책임.

Coordinator가:

```text
expandFolder(folderId)
```

command만 호출.

Modal local state에 expanded folders를 저장하지 않는다.

---

## 15.72 Scroll-to-visible

Sidebar visibility는 Coordinator가 sidebar navigation abstraction을 통해 요청.

예:

```ts
sidebarNavigation.ensureListVisible(listId)
```

DOM selector를 Controller에 넣지 않는다.

---

## 15.73 Route Construction

권장:

```ts
navigation.toList({
  listId,
  viewKey
})
```

route string:

```text
`/list/${id}?view=${view}`
```

를 feature component가 직접 조합하지 않는다.

---

## 15.74 Focus Target Contract

각 View와 navigation layer 사이 contract 예:

```ts
registerPrimaryCreateAction({
  scopeId: listId,
  viewKey,
  elementRef
})
```

Coordinator는 등록된 target을 찾아 focus.

---

## 15.75 Component Complexity Budget

권장 가이드:

```text
CreateListModal
→ shell orchestration only

CreateListForm
→ composition only

Field components
→ one interaction concern

Controller
→ async orchestration

Reducer
→ pure state transition
```

한 파일이 300~500줄을 넘어가기 시작하면 책임 분리를 재검토한다.

줄 수 자체가 규칙은 아니지만 smell로 사용한다.

---

## 15.76 재사용 Primitive vs Feature Component

### 공통 Primitive로 재사용

```text
Dialog
BottomSheet
Popover
RadioGroup
Listbox/Combobox
Button
Input
ColorPicker primitive
FocusTrap
```

### Feature 전용

```text
CreateListModal
DefaultViewPicker
CreateListPreview
FolderSelectPopover wrapper
CreateListActions
```

---

## 15.77 Feature 전용 Preview 이유

Preview는 Add List UX를 위한 설명용 그림이다.

다른 화면에서 재사용한다고 일반화하지 않는다.

과도한 abstraction을 피한다.

---

## 15.78 `Edit List`와 재사용

향후 Edit List가 생겨도 `CreateListModal` 자체를 억지로 재사용하지 않는다.

재사용 가능:

```text
ListNameField
ListColorPicker
DefaultViewPicker
FolderSelect
```

Create-specific:

```text
request/session
Add button
post-create navigation
Preview
```

---

## 15.79 `Create Folder` 독립 Flow와 재사용

InlineFolderCreate는 domain folder service와 validation을 재사용할 수 있다.

하지만 Add List child surface용 wrapper는 parent Modal focus 정책을 따른다.

---

## 15.80 Feature Flag / Permission Dependency

UI component는:

```text
availableViews
canCreateFolder
```

같이 **이미 계산된 capability**를 받는 것을 권장한다.

permission service를 field component가 직접 호출하지 않는다.

---

## 15.81 Loading Data 경계

Modal Open 자체:

```text
No blocking loader
```

Folder options:

```text
FolderSelect child loading
```

View options:

```text
app config / registry에서 동기적으로 가용 가능하도록 권장
```

### 이유

Name 입력은 외부 데이터에 의존하지 않는다.

---

## 15.82 API Abort 처리 위치

AbortController는 Controller/service layer.

Component는:

```text
cancel()
```

의도만 전달.

Submitting user-cancel은 현재 정책상 막지만 unmount/stale session abort에 사용 가능.

---

## 15.83 Idempotency 관리 위치

`requestId`는 Controller/session request state에서 생성.

Service는 전달.

Repository/API는 server에 보냄.

### MUST

Button component가 requestId를 생성하지 않는다.

---

## 15.84 Error Mapping 위치

Infrastructure raw error:

```text
repository/API
↓
service/domain mapping
↓
CreateListError
↓
controller
↓
UI
```

UI는 HTTP status code branching을 하지 않는다.

---

## 15.85 Post-create Failure 표시 위치

Coordinator recovery가 필요한 경우 App-level non-blocking notice/route fallback으로 처리.

Modal은 이미 create success 이후 닫힐 수 있다.

### MUST

Modal component가 post-create recovery를 다시 렌더하기 위해 resurrect되지 않는다.

---

## 15.86 Architecture Wireframe

```text
[ Sidebar Lists + ]
        │
        ▼
 openCreateList(context)
        │
        ▼
┌──────────────────────────────┐
│      CreateListModal         │
│                              │
│  CreateListForm              │
│  ├ Name                      │
│  ├ Color                     │
│  ├ View                      │
│  ├ Folder                    │
│  └ Actions                   │
│                              │
│  CreateListPreview           │
└──────────────┬───────────────┘
               │
               ▼
      useCreateListController
               │
       ┌───────┼────────┐
       ▼       ▼        ▼
    reducer  services  registry
               │
               ▼
          createList()
               │
               ▼
        CreateListResult
               │
               ▼
      PostCreateCoordinator
       ├ cache/sidebar
       ├ folder expand
       ├ navigate
       └ focus
```

---

## 15.87 Architecture Invariants

### INV-ARCH01
UI component는 DB/API를 직접 호출하지 않는다.

### INV-ARCH02
Reducer는 pure transition만 담당한다.

### INV-ARCH03
Controller는 async flow orchestration을 담당한다.

### INV-ARCH04
Service는 domain create command를 담당한다.

### INV-ARCH05
Post-create navigation은 Modal component lifecycle과 분리한다.

### INV-ARCH06
Preview는 실제 View component를 import하지 않는다.

### INV-ARCH07
Desktop/Mobile은 동일 Form과 Controller를 재사용한다.

### INV-ARCH08
Folder/Color child surface는 parent Draft와 interaction boundary를 공유하되 persistence를 직접 수행하지 않는다.

### INV-ARCH09
Route/Sidebar/Focus는 adapter/coordinator를 통해 처리한다.

### INV-ARCH10
Retry-safe cache update는 ID 기반 upsert를 사용한다.

### INV-ARCH11
Field component는 필요한 최소 props/actions만 받는다.

### INV-ARCH12
View Registry internals는 Add List UI에 노출하지 않는다.

### INV-ARCH13
Error mapping은 infrastructure와 UI 사이에서 표준화한다.

### INV-ARCH14
Responsive shell 전환으로 controller state가 remount/reset되지 않는다.

---

## 15.88 Architecture Acceptance Criteria

### AC-ARCH01
Sidebar `Lists +`와 `Folder +`는 동일한 `openCreateList` entry point를 사용한다.

### AC-ARCH02
`CreateListModal`은 DB client를 import하지 않는다.

### AC-ARCH03
`CreateListForm`은 Name/Color/View/Folder/Actions 조합만 담당한다.

### AC-ARCH04
Name/Color/View/Folder component는 List persistence를 직접 실행하지 않는다.

### AC-ARCH05
`useCreateListController`가 Draft update, submit, retry, cancel을 orchestration한다.

### AC-ARCH06
Reducer unit test만으로 주요 state transition을 검증할 수 있다.

### AC-ARCH07
Validation/normalization은 공통 module에서 재사용된다.

### AC-ARCH08
Create success 후 `PostCreateCoordinator`가 Sidebar/Navigation/Focus를 처리한다.

### AC-ARCH09
Preview component가 TaskRow/Board/Gantt 실제 renderer를 import하지 않는다.

### AC-ARCH10
Mobile Bottom Sheet와 Desktop Modal이 동일한 controller state를 사용한다.

### AC-ARCH11
Folder create mutation과 List create mutation이 독립된 request state를 가진다.

### AC-ARCH12
View options는 View Registry에서 UI용 DTO로 공급된다.

### AC-ARCH13
Retry response를 global List cache에 append가 아니라 upsert한다.

### AC-ARCH14
Route 문자열을 field/form component가 직접 생성하지 않는다.

### AC-ARCH15
Post-create navigation 실패가 CreateListModal을 다시 열어 persistence retry를 유발하지 않는다.

### AC-ARCH16
Feature component의 책임이 테스트 가능한 단위로 분리되어 있다.

---

## 15.89 §15에서 의도적으로 미확정한 것

다음은 마지막 검증 단계에서 확정한다.

```text
모든 Component의 상태 조합과 시각 상태 표         → §16
최종 E2E / QA / 구현 완료 Acceptance Criteria      → §17
```
# 16. Interaction State Matrix

## 16.1 목적

§0~§15에서 각 요소의 상태를 개별적으로 정의했다.

이 섹션에서는 이를 한 화면 기준으로 다시 교차 검증한다.

목표는 다음과 같다.

1. 같은 순간에 어떤 Control이 어떤 상태여야 하는지 명확히 한다.
2. `hover / focus / selected / open / disabled / submitting / error` 조합의 누락을 찾는다.
3. Child Surface와 Parent Modal의 우선순위를 검증한다.
4. Desktop / Mobile에서 interaction 의미가 달라지지 않게 한다.
5. 구현·QA 시 “이 상태에서는 무엇이 가능해야 하는가”를 바로 확인할 수 있게 한다.

---

## 16.2 State Matrix의 기준 상태

전체 Add List Flow에서 검증해야 할 대표 상태를 다음 12개로 고정한다.

```text
S0  CLOSED
S1  OPEN_EMPTY
S2  OPEN_VALID
S3  COLOR_CUSTOM_OPEN
S4  FOLDER_OPEN
S5  FOLDER_CREATE
S6  FOLDER_CREATE_SUBMITTING
S7  SUBMITTING
S8  FIELD_ERROR
S9  CREATE_ERROR_RETRYABLE
S10 CREATE_ERROR_BLOCKING
S11 POST_CREATE
```

---

## 16.3 상태 정의

### S0 — CLOSED

```text
Modal 없음
Draft 없음
Background interaction 가능
```

### S1 — OPEN_EMPTY

```text
Modal open
Name invalid/empty
Add disabled
Form editable
```

### S2 — OPEN_VALID

```text
Modal open
Draft valid
Add enabled
Form editable
```

### S3 — COLOR_CUSTOM_OPEN

```text
Custom Color Popover open
Parent Draft 유지
Add List Modal 유지
```

### S4 — FOLDER_OPEN

```text
Folder Dropdown/Listbox open
Parent Modal 유지
```

### S5 — FOLDER_CREATE

```text
Folder inline create mode
new folder input editable
```

### S6 — FOLDER_CREATE_SUBMITTING

```text
Folder mutation 진행
Add List submit 잠김
```

### S7 — SUBMITTING

```text
List create mutation 진행
전체 Draft interaction 잠김
```

### S8 — FIELD_ERROR

```text
Name / Color / View / Folder 중 특정 field validation error
Form 수정 가능
```

### S9 — CREATE_ERROR_RETRYABLE

```text
Network / Timeout / Server 등
Draft 유지
Retry 가능
```

### S10 — CREATE_ERROR_BLOCKING

```text
Scope deleted / permission irrecoverable 등
Retry 불가
Close/Cancel 중심
```

### S11 — POST_CREATE

```text
Persistence 성공
Modal 종료/종료 중
Sidebar/Navigation/Focus sync
```

---

## 16.4 Modal-level Matrix

| State | Modal | Background | Overlay Click | Esc | Focus Trap |
|---|---|---|---|---|---|
| S0 CLOSED | hidden | enabled | — | app default | no |
| S1 OPEN_EMPTY | visible | locked | no close | close Modal | yes |
| S2 OPEN_VALID | visible | locked | no close | close Modal | yes |
| S3 COLOR_CUSTOM_OPEN | visible | locked | child close only | close Custom first | yes |
| S4 FOLDER_OPEN | visible | locked | child close only | close Folder first | yes |
| S5 FOLDER_CREATE | visible | locked | child context | cancel create first | yes |
| S6 FOLDER_CREATE_SUBMITTING | visible | locked | no-op | no destructive dismiss | yes |
| S7 SUBMITTING | visible | locked | no-op | no-op | yes |
| S8 FIELD_ERROR | visible | locked | no close | close Modal* | yes |
| S9 CREATE_ERROR_RETRYABLE | visible | locked | no close | close Modal | yes |
| S10 CREATE_ERROR_BLOCKING | visible | locked | no close | close Modal | yes |
| S11 POST_CREATE | closing/closed | route transition | — | app/navigation policy | transfer |

`*` child surface가 열려 있으면 child가 우선한다.

---

## 16.5 Name Field Matrix

| State | Value | Editable | Visual | Enter |
|---|---|---:|---|---|
| S1 OPEN_EMPTY | empty/invalid | yes | normal focus/empty | no submit |
| S2 OPEN_VALID | valid | yes | normal | submit |
| S3 COLOR_CUSTOM_OPEN | preserved | parent interaction paused | normal | child owns keyboard |
| S4 FOLDER_OPEN | preserved | parent interaction paused | normal | child owns keyboard |
| S5 FOLDER_CREATE | preserved | parent interaction paused | normal | folder input owns Enter |
| S6 FOLDER_CREATE_SUBMITTING | preserved | no practical parent edit | subdued | no submit |
| S7 SUBMITTING | preserved | no | disabled/readable | no-op |
| S8 FIELD_ERROR | preserved | yes | error if Name-related | revalidate/submit if valid |
| S9 CREATE_ERROR_RETRYABLE | preserved | yes | normal unless field error | latest Draft submit/retry |
| S10 CREATE_ERROR_BLOCKING | preserved | optional/read-only policy | normal | no create |
| S11 POST_CREATE | no longer relevant | no | unmounted | — |

---

## 16.6 Name Focus State 조합

Name은 다음 시각 상태를 지원한다.

```text
DEFAULT_EMPTY
HOVER_EMPTY
FOCUSED_EMPTY
FOCUSED_FILLED
BLURRED_FILLED
INVALID
DISABLED_SUBMITTING
```

### 조합 원칙

```text
INVALID + FOCUS
→ error boundary + focus ring 둘 다 보임

FILLED + SUBMITTING
→ value 유지 + disabled visual

ERROR + HOVER
→ hover가 error border를 덮지 않음
```

---

## 16.7 Color Picker Matrix

| State | Selected | Change 가능 | Custom Open | Keyboard |
|---|---|---:|---:|---|
| S1 | current/None | yes | yes | Arrow |
| S2 | current | yes | yes | Arrow |
| S3 | current | parent swatch no | already open | child focus scope |
| S4 | current | no while folder child active | no | folder owns keys |
| S5 | current | no | no | folder create owns |
| S6 | current | no | no | locked |
| S7 | current | no | no | locked |
| S8 | current | yes unless unrelated child | yes | Arrow |
| S9 | current | yes | yes | Arrow |
| S10 | current | optional | no need | non-create |
| S11 | persisted | no | no | — |

---

## 16.8 Color Visual Matrix

| Swatch State | Background | Ring | Focus | Cursor |
|---|---|---|---|---|
| Default unselected | semantic color | none | none | pointer |
| Hover | same + subtle scale | none | none | pointer |
| Selected | semantic color | selected ring | none | pointer |
| Focused | semantic color | state ring if selected | focus ring | pointer |
| Selected + Focused | semantic color | selected ring | outer focus | pointer |
| Disabled | preserved | preserved selected | no hover | default |
| Custom open | gradient/custom | selected/open cue | opener focus semantics | pointer |

### MUST

Selected ring과 Focus ring은 서로 다른 layer로 보인다.

---

## 16.9 Default View Matrix

| State | Selection | Change 가능 | Preview 반영 | Keyboard |
|---|---|---:|---:|---|
| S1 | List default | yes | yes | Left/Right |
| S2 | current | yes | yes | Left/Right |
| S3 | current | no while child open | preserved | child owns |
| S4 | current | no while child open | preserved | child owns |
| S5 | current | no | preserved | folder owns |
| S6 | current | no | preserved | locked |
| S7 | current | no | preserved | locked |
| S8 | current | yes if View error | immediate | Left/Right |
| S9 | current | yes | immediate | Left/Right |
| S10 | current | non-actionable | preserved | limited |
| S11 | persisted default | no | actual view | route/view owns |

---

## 16.10 View Tile Visual Matrix

| Tile State | Background | Border | Icon/Text | Preview |
|---|---|---|---|---|
| Unselected | neutral | transparent/subtle | secondary | unchanged |
| Hover | hover | subtle | primary | unchanged |
| Selected | accent-subtle | accent | accent | selected view |
| Focused | current | focus ring | current | unchanged |
| Selected + Focused | accent-subtle | accent + focus | accent | selected view |
| Disabled | preserved | preserved | subdued | preserved |
| Unavailable | **not rendered** | — | — | — |

### 핵심

```text
Unavailable
≠
Disabled decorative tile
```

---

## 16.11 Folder Trigger Matrix

| State | Trigger Value | Open 가능 | Visual |
|---|---|---:|---|
| S1 | None/context folder | yes | default |
| S2 | current | yes | default |
| S3 | current | no until color child closes | default |
| S4 | current | already open | active border |
| S5 | current | child create mode | active |
| S6 | current | no | active/locked |
| S7 | current | no | disabled |
| S8 | current/invalid reset | yes | error if folder issue |
| S9 | current | yes | normal |
| S10 | current | optional read-only | subdued |
| S11 | persisted | no | — |

---

## 16.12 Folder Listbox Item Matrix

| Item State | Check | Background | Select 가능 |
|---|---|---|---:|
| Default | no | none | yes |
| Hover | no | hover | yes |
| Active keyboard | no | active | yes |
| Selected | yes | selected subtle | yes |
| Selected + Active | yes | active + selected cue | yes |
| Disabled permission item* | optional | disabled | no |

`*` 권한상 선택 불가능한 Folder를 실제로 노출해야 할 제품 요구가 있을 때만. 기본 V1은 선택 가능한 Folder만 노출하는 것을 우선한다.

---

## 16.13 Folder Search Matrix

| State | Search 표시 | Input 가능 | Result |
|---|---:|---:|---|
| folder count ≤ 8 | no | — | full list |
| folder count ≥ 9 | yes | yes | filtered |
| S6 create submitting | current UI 유지 | no | preserved |
| S7 List submitting | child closed | no | — |
| load error | optional | no/disabled | retry state |

---

## 16.14 Inline Folder Create Matrix

| State | Input | Create | Cancel | Add List |
|---|---|---|---|---|
| S5 empty invalid | editable | disabled | enabled | blocked by child mode policy |
| S5 valid | editable | enabled | enabled | blocked |
| S6 submitting | disabled | loading | disabled/locked | disabled |
| Folder create error | editable | retry/create enabled | enabled | blocked until resolved/exit |
| Success | close child | — | — | re-evaluate canSubmit |

---

## 16.15 Add Button Matrix

| State | Label | Enabled | Visual | Action |
|---|---|---:|---|---|
| S1 | 추가 | no | disabled | none |
| S2 | 추가 | yes | primary | submit |
| S3 | 추가 | logically valid but child owns flow | parent non-active | none until child close |
| S4 | 추가 | parent non-active | normal/blocked | none until child close |
| S5 | 추가 | no | disabled | none |
| S6 | 추가 | no | disabled | none |
| S7 | 추가 중 | no | spinner + primary locked | none |
| S8 invalid | 추가 | no | disabled | none |
| S8 valid after correction | 추가 | yes | primary | submit |
| S9 | 다시 시도 | yes if Draft valid | primary | retry |
| S10 | 숨김/disabled | no | blocking state | none |
| S11 | — | — | unmounted | — |

---

## 16.16 Cancel Button Matrix

| State | Enabled | Action |
|---|---:|---|
| S1 | yes | discard + close |
| S2 | yes | discard + close |
| S3 | parent Cancel not first target | close child first via Esc; click policy may close child then explicit Cancel |
| S4 | parent Cancel secondary | child closes first if interaction requires |
| S5 | parent Cancel not primary child action | inline create Cancel first |
| S6 | no | no-op |
| S7 | no | no-op |
| S8 | yes | discard + close |
| S9 | yes | discard + close |
| S10 | yes / label may be 닫기 | close |
| S11 | — | — |

---

## 16.17 Error Matrix

| Error Type | 위치 | Draft 수정 | Retry | Focus |
|---|---|---:|---:|---|
| Name invalid | Name field | yes | after valid | Name |
| Custom color invalid | Color popover | yes | local Apply | Custom input |
| Folder invalid | Folder row | yes | after reselect | Folder |
| View unavailable | View row | yes | after reselect | View group |
| Network | Action/global | yes | yes | keep current |
| Timeout | Action/global | yes | yes, same requestId if same Draft | keep current |
| Server | Action/global | yes | yes | keep current |
| Permission recoverable | related row/global | yes | conditional | relevant control |
| Scope deleted | global | no useful retry | no | Close/Cancel |
| Post-create navigation | app-level | create Draft no longer relevant | navigation only | target fallback |

---

## 16.18 Preview Matrix

| State | Visible Desktop | Content | Interactive |
|---|---:|---|---:|
| S1 | yes | fallback name + selected view | no |
| S2 | yes | current Draft | no |
| S3 | yes | committed Draft only | no |
| S4 | yes | current Draft | no |
| S5 | yes | List Draft unaffected | no |
| S6 | yes | preserved | no |
| S7 | yes | preserved | no |
| S8 | yes | current Draft | no |
| S9 | yes | current Draft | no |
| S10 | yes | current Draft | no |
| S11 | Modal preview gone | actual List View | app interaction |

Tablet/Mobile에서는 §14에 따라 Preview 자체를 렌더하지 않는다.

---

## 16.19 Custom Color Commit Matrix

중요한 구분:

```text
Popover 내부 custom draft
≠
List Draft color
```

| Action | customColorDraft | draft.color |
|---|---|---|
| Open Custom | init current/custom | unchanged |
| Edit HEX | changed | unchanged |
| Cancel | discard | unchanged |
| Esc | discard | unchanged |
| Apply valid | commit | custom value |
| Apply invalid | keep | unchanged |

---

## 16.20 View 변경과 Preview Timing Matrix

| Interaction | Draft | Preview |
|---|---|---|
| List → Board click | 즉시 board | 120~160ms crossfade |
| Board → Gantt keyboard | 즉시 gantt | crossfade |
| Name typing | 즉시 | 즉시 text update |
| Color preset select | 즉시 | 즉시 accent update |
| Custom color edit before Apply | unchanged | unchanged |
| Folder select | folderId update | no change |

---

## 16.21 Hover + Focus 우선순위

같은 Control에 hover와 focus가 동시에 존재할 수 있다.

우선순위:

```text
Disabled
> Error
> Focus
> Selected/Open
> Hover
> Default
```

정확한 의미:

- Disabled이면 hover feedback 없음.
- Error border가 hover 때문에 사라지지 않음.
- Focus ring은 selected/open state 위에 추가.
- Hover는 가장 약한 보조 상태.

---

## 16.22 Selected + Error 조합

가능한 예:

```text
View selected = Gantt
but Gantt unavailable
```

이 경우:

```text
selected cue 유지
+
error state 추가
+
canSubmit=false
```

사용자의 기존 선택이 무엇이었는지 숨기지 않는다.

---

## 16.23 Folder Deleted 조합

```text
selected Folder deleted
```

권장 transition:

```text
Folder selected
→ domain event
→ draft.folderId = null
→ trigger = 없음
→ notice/error
→ canSubmit 재계산
```

사용자 확인 없이 자동 Submit하지 않는다.

---

## 16.24 Submitting Lock Matrix

S7에서 다음은 모두 잠긴다.

```text
Name
Color
View
Folder
Custom Color Open
Folder Open
Folder Create
Add
Cancel
Esc
Overlay dismiss
Mobile swipe dismiss
Mobile back dismiss
```

유지되는 것:

```text
current values
Preview
loading label
focus trap
screen reader busy state
```

---

## 16.25 Folder Create Submitting Lock Matrix

S6는 List Submit과 다르다.

잠금:

```text
Folder create input
Folder create action
Add List
child close that would create ambiguity
```

Parent Draft의 기존 값은 유지.

List Create request는 아직 시작되지 않았다.

---

## 16.26 Retry Matrix

### 같은 Draft

```text
Timeout/network uncertain
→ same requestId
```

### Draft 수정

```text
Error
→ user changes Name/Color/View/Folder
→ new revision
→ next Submit new requestId
```

### Post-create failure

```text
Persistence already success
→ create retry 금지
→ navigation/sync retry only
```

---

## 16.27 Esc Matrix

```text
Custom Color Open
Esc → Custom close

Folder Create
Esc → create mode cancel

Folder Dropdown
Esc → dropdown close

No child + editable Modal
Esc → Modal close

Submitting
Esc → no-op

Post-create
Esc → current app context
```

---

## 16.28 Enter Matrix

```text
Name + valid
→ List submit

Name + IME composing
→ no submit

View
→ select current View

Color
→ select/open custom

Folder closed
→ open

Folder open
→ select active option

Folder create input
→ create Folder

Add focused
→ submit

Retry focused
→ retry
```

---

## 16.29 Tab Matrix

### S1 Empty

```text
Name
→ Color
→ View
→ Folder
→ Cancel
→ Name
```

Add disabled이므로 native Tab order에서 제외.

### S2 Valid

```text
Name
→ Color
→ View
→ Folder
→ Add
→ Cancel
→ Name
```

### Child Surface Open

```text
Parent Tab cycle 일시 중지
→ Child Focus Scope
```

---

## 16.30 Pointer Matrix

| Target | Default | Submitting |
|---|---|---|
| Name | text cursor | disabled/default |
| Color | pointer | default |
| View | pointer | default |
| Folder | pointer | default |
| Add enabled | pointer | default |
| Add disabled | default | default |
| Cancel | pointer | default |
| Preview | default | default |

---

## 16.31 Mobile Interaction Matrix 차이

의미는 Desktop과 같지만 presentation만 달라진다.

| Element | Desktop | Mobile |
|---|---|---|
| Shell | Center Modal | Bottom Sheet |
| View Picker | icon-only + tooltip | icon + text |
| Color | one line | horizontal scroll |
| Folder | popover/listbox | nested sheet 가능 |
| Add | 128×48 | full-width |
| Cancel | outline button | secondary action |
| Preview | visible ≥960 | hidden |
| Success focus | Quick Add autofocus | visible, keyboard auto-open optional |

---

## 16.32 Responsive State Continuity

다음 transition 중 state는 유지된다.

```text
Wide Desktop
→ Compact Desktop
→ Tablet
→ Mobile
```

유지:

```text
Draft
Draft Revision
Request state
Error state
Session ID
```

Close 가능:

```text
active child surface
```

### MUST

Responsive 전환이 새 CreateList session을 생성하지 않는다.

---

## 16.33 Loading / Error Visual Priority

동일 Control에 loading과 error를 동시에 보여주지 않는다.

### 예

Submit 시작 직전 이전 error가 있었다면:

```text
Retry click
→ old error presentation clear/fade
→ loading
```

Request 실패:

```text
loading end
→ error
```

---

## 16.34 Field Error Clear Matrix

| User Action | 해당 Field Error | Global Create Error |
|---|---|---|
| Name 수정 | revalidate/clear | clear |
| Color 변경 | related clear | clear |
| View 변경 | related clear | clear |
| Folder 변경 | related clear | clear |
| Hover only | unchanged | unchanged |
| Focus only | unchanged | unchanged |

---

## 16.35 Child Surface Mutual Exclusion

유효:

```text
Color Custom Open
Folder Closed
```

유효:

```text
Folder Open
Color Custom Closed
```

금지:

```text
Color Custom Open
+
Folder Open
```

새 child를 열면 기존 child를 먼저 close한다.

---

## 16.36 Focus Return Matrix

| Close Event | Focus Return |
|---|---|
| Custom Color Cancel/Esc | Custom swatch |
| Folder Dropdown close | Folder trigger |
| Folder Create cancel | New Folder entry point / Folder list |
| Modal Cancel/Esc | original opening `+` |
| Create Success | Quick Add / first task action |
| Post-create fallback | Add Task / Main heading |

---

## 16.37 Screen Reader State Matrix

| State | Announcement |
|---|---|
| Modal Open | “리스트 추가, 대화상자” |
| Name Error | field error |
| Folder Error | related error |
| Submit | “리스트 추가 중” |
| Create Error | error live region |
| Retry | button name “다시 시도” |
| Success | optional polite success/context change |
| Post-create | focus target conveys new context |

---

## 16.38 Reduced Motion Matrix

| Interaction | Normal | Reduced Motion |
|---|---|---|
| Modal open | fade + scale | instant/short fade |
| Modal close | short fade | instant/short fade |
| Preview View switch | crossfade 120~160ms | 0~50ms |
| Swatch hover | subtle scale | no scale |
| Button pressed | subtle scale | no scale |
| Chevron | rotate | instant |
| New List highlight | optional fade | none |

---

## 16.39 State Transition Table

| From | Event | To |
|---|---|---|
| S0 | Open | S1 |
| S1 | Valid Name | S2 |
| S2 | Name invalid | S1/S8 |
| S1/S2 | Open Custom Color | S3 |
| S3 | Apply/Cancel | S1/S2 |
| S1/S2 | Open Folder | S4 |
| S4 | Start Folder Create | S5 |
| S5 | Submit Folder | S6 |
| S6 | Folder success | S1/S2 |
| S6 | Folder failure | S5 error |
| S2 | Submit List | S7 |
| S7 | Validation/domain failure | S8/S9/S10 |
| S7 | Persistence success | S11 |
| S8 | Correct field | S1/S2 |
| S9 | Retry | S7 |
| S9 | Edit Draft | S1/S2 |
| S10 | Close | S0 |
| S11 | Ready | Flow complete |

---

## 16.40 Invalid Transition 목록

다음은 구현상 허용하면 안 된다.

```text
S1 OPEN_EMPTY
→ SUBMITTING
```

```text
S3 COLOR_CUSTOM_OPEN
→ FOLDER_OPEN without closing custom
```

```text
S6 FOLDER_CREATE_SUBMITTING
→ LIST SUBMITTING
```

```text
S7 SUBMITTING
→ Draft Update
```

```text
S11 POST_CREATE
→ CREATE RETRY
```

```text
CLOSED
→ stale async response update
```

---

## 16.41 State Visual Snapshot — Normal

```text
Name: valid
Color: Blue selected
View: Board selected
Folder: 대학원
Add: enabled
Cancel: enabled
Preview: Board
```

Expected:

```text
No error
No open child
No spinner
Board selected accent
Blue identity preview
```

---

## 16.42 State Visual Snapshot — Folder Open

```text
Name: valid
Folder dropdown: open
Add: visually present but parent action not consumed
Preview: unchanged
Esc: closes Folder
```

Expected:

```text
Folder trigger active
Listbox visible
Focus inside folder scope
Other child surfaces closed
```

---

## 16.43 State Visual Snapshot — Submitting

```text
Name: preserved
Color: preserved
View: preserved
Folder: preserved
Add: "추가 중"
Cancel: disabled
Preview: preserved
```

Expected:

```text
No control mutation
No dismiss
No duplicate request
```

---

## 16.44 State Visual Snapshot — Retryable Error

```text
Draft: preserved
Global error: visible
Primary: "다시 시도"
Cancel: enabled
Form: editable
```

Expected:

```text
User can edit
Retry current valid Draft
No orphan Sidebar List
```

---

## 16.45 State Visual Snapshot — Blocking Error

예:

```text
Scope deleted
```

Expected:

```text
Global blocking message
No meaningful Retry
Close/Cancel available
Draft may remain visually readable
```

---

## 16.46 State Visual Snapshot — Mobile

```text
Bottom Sheet
Name
Color horizontal scroll
View icon + text
Folder
Full-width Add
Cancel
No Preview
```

State semantics:

```text
Desktop와 동일
```

---

## 16.47 QA Priority Matrix

### P0 — 반드시 막아야 하는 오류

```text
Duplicate List create
Draft loss on recoverable error
Modal closes during submit
Unavailable View silently fallback before submit
Deleted Folder ID submit
Post-create failure causes create retry
Responsive change resets Draft
IME Enter creates List unexpectedly
```

### P1 — 사용성 문제

```text
Focus not restored
Folder not expanded after create
Preview flicker
Selected/focus state indistinguishable
Mobile keyboard hides action
Long Folder name clipping
```

### P2 — polish

```text
hover timing
preview animation smoothness
new item highlight
tooltip delay
```

---

## 16.48 Interaction Matrix Invariants

### INV-MX01
어떤 상태에서도 동시에 두 Child Surface가 열리지 않는다.

### INV-MX02
Submitting 상태에서는 Draft를 변경할 수 없다.

### INV-MX03
Folder Create Submitting과 List Create Submitting은 동시에 발생하지 않는다.

### INV-MX04
Disabled 상태는 hover/pressed feedback을 만들지 않는다.

### INV-MX05
Selected와 Focused는 동시에 시각적으로 구분 가능하다.

### INV-MX06
Error 상태가 hover 때문에 사라지지 않는다.

### INV-MX07
Field 수정은 관련 field/global create error를 적절히 clear한다.

### INV-MX08
Post-create failure는 Create Retry 상태로 돌아가지 않는다.

### INV-MX09
Responsive mode가 바뀌어도 같은 semantic state를 유지한다.

### INV-MX10
Mobile에서 Preview가 없어도 Draft/View selection 의미는 동일하다.

### INV-MX11
IME composition은 모든 Enter 기반 submit보다 우선한다.

### INV-MX12
Esc는 가장 안쪽 surface부터 처리한다.

---

## 16.49 Interaction Matrix Acceptance Criteria

### AC-MX01
OPEN_EMPTY에서는 Add가 disabled이고 Cancel은 enabled다.

### AC-MX02
OPEN_VALID에서는 Add와 Cancel이 모두 enabled다.

### AC-MX03
Custom Color가 열려 있는 동안 Folder Dropdown이 동시에 열리지 않는다.

### AC-MX04
Folder Create Submitting 동안 Add List Submit이 불가능하다.

### AC-MX05
List SUBMITTING 동안 Name/Color/View/Folder/Cancel/Esc가 모두 잠긴다.

### AC-MX06
Retryable Error에서는 Draft가 유지되고 Form 수정과 Retry가 가능하다.

### AC-MX07
Blocking Error에서는 persistence Retry가 노출되지 않는다.

### AC-MX08
Selected View가 Focus되면 selected cue와 focus ring이 동시에 보인다.

### AC-MX09
Name error 상태에서 hover/focus해도 error 의미가 유지된다.

### AC-MX10
View 변경은 Draft를 즉시 바꾸고 Preview만 짧게 transition한다.

### AC-MX11
Custom Color를 Apply하기 전에는 Preview Color가 변경되지 않는다.

### AC-MX12
Folder 변경은 Preview에 영향을 주지 않는다.

### AC-MX13
Timeout Retry는 같은 Draft라면 같은 requestId를 사용한다.

### AC-MX14
Error 후 Draft를 수정한 다음 Submit하면 새 logical requestId를 사용한다.

### AC-MX15
Post-create navigation 실패 후 Create API가 다시 호출되지 않는다.

### AC-MX16
Desktop → Mobile 전환 중 Draft/Session/Error state가 유지된다.

### AC-MX17
Mobile에서 View Picker는 icon + text로 의미가 분명하다.

### AC-MX18
Focus return target이 child/Modal 종료 경로별로 일관된다.

---

## 16.50 §16에서 의도적으로 미확정한 것

남은 마지막 단계에서 확정한다.

```text
최종 구현 완료 판단 기준
E2E 시나리오
회귀 테스트 목록
Desktop / Tablet / Mobile QA
접근성 QA
실패 복구 QA
Definition of Done
→ §17
```
# 17. 최종 Acceptance Criteria

## 17.1 목적

이 섹션은 §0~§16의 설계를 실제 구현 결과와 대조하기 위한 **최종 완료 판정 기준**이다.

목표는 다음과 같다.

1. “화면이 비슷하게 보인다”가 아니라 실제 Flow가 설계대로 동작하는지 판단한다.
2. UI, 상태, 데이터, 오류 복구, 접근성, 반응형을 하나의 E2E 기준으로 묶는다.
3. P0/P1 결함을 구분해 출시 가능 여부를 판단한다.
4. 개발자·디자이너·QA가 같은 Definition of Done을 공유한다.

---

## 17.2 최종 완료의 정의

Add List 기능은 다음 조건을 모두 만족할 때만 완료로 본다.

```text
사용자가 List 생성을 시작할 수 있다.
→ 필요한 최소 설정을 입력할 수 있다.
→ 생성 중 중복/손실이 없다.
→ 실패하면 Draft를 보존하고 복구할 수 있다.
→ 성공하면 Sidebar와 Main View가 새 List로 전환된다.
→ 선택한 Default View가 즉시 열린다.
→ 사용자가 첫 Task를 만들 수 있다.
```

즉 최종 성공은:

```text
DB row created
```

이 아니라:

```text
READY_FOR_FIRST_TASK
```

도달이다.

---

## 17.3 Release Gate

다음 조건을 모두 만족해야 release 가능하다.

```text
P0 defect = 0
P1 critical usability defect = 0
Desktop E2E PASS
Tablet E2E PASS
Mobile E2E PASS
Keyboard-only PASS
Screen-reader smoke PASS
Network/Timeout recovery PASS
Duplicate-submit protection PASS
Post-create navigation PASS
```

P2 visual polish 이슈는 별도 backlog로 허용 가능하다.

---

## 17.4 E2E-01 — 가장 빠른 생성 Flow

### 시나리오

```text
1. Sidebar `Lists +` 클릭
2. Add List Modal Open
3. Name input auto focus
4. "학교" 입력
5. Enter
```

### 기대 결과

```text
Modal Open 시 folderId = null
Color = None
Default View = List
Add enabled after valid Name
Enter → submit
Submitting 중 중복 입력 잠금
Create success
Modal close
Sidebar root 마지막에 "학교"
"학교" selected
List View active
Quick Add focus
```

### PASS 조건

5단계 입력만으로 READY_FOR_FIRST_TASK까지 도달한다.

---

## 17.5 E2E-02 — Folder Context 생성

### 시나리오

```text
1. Sidebar `대학원` Folder의 `+` 클릭
2. Modal Open
3. Name = "논문"
4. Add
```

### 기대 결과

```text
Folder 기본값 = 대학원
Create success
대학원 Folder 자동 expand
논문 List가 Folder 마지막에 표시
논문 selected
default List View 진입
```

### MUST

Folder context는 기본값일 뿐 사용자가 다른 Folder/None으로 변경 가능해야 한다.

---

## 17.6 E2E-03 — Board를 Default View로 생성

### 시나리오

```text
1. Modal Open
2. Name = "프로젝트"
3. Default View = Board
4. Add
```

### 기대 결과

```text
draft.defaultViewType = board
Preview → Board
Create payload → defaultViewKey = board
Success 후 Board를 첫 render부터 활성
List View flicker 없음
```

### PASS 조건

생성 직후 Board가 바로 보인다.

---

## 17.7 E2E-04 — Gantt를 Default View로 생성

### 시나리오

```text
1. Name 입력
2. Gantt 선택
3. Add
```

### 기대 결과

```text
Gantt selected
Gantt Preview 표시
Create success
Gantt route/view open
날짜 없는 빈 List도 정상 표시
Add Task 접근 가능
```

---

## 17.8 E2E-05 — Color 적용

### 시나리오

```text
1. Name 입력
2. Blue preset 선택
3. Add
```

### 기대 결과

```text
Preview identity accent = Blue
DB = preset key "blue"
Sidebar identity color 반영
Selected row background와 List color는 분리
```

---

## 17.9 E2E-06 — Custom Color

### 시나리오

```text
1. Custom Color Open
2. HEX 변경
3. Apply
4. Add
```

### 기대 결과

```text
Apply 전 draft.color unchanged
Apply 후 canonical #RRGGBB commit
Preview 즉시 반영
Create success 후 persisted
```

### Cancel 케이스

```text
Custom Color edit
→ Cancel/Esc
→ draft.color unchanged
```

---

## 17.10 E2E-07 — Folder 변경

### 시나리오

```text
1. Folder A의 +에서 Modal Open
2. Folder dropdown
3. None 선택
4. Add
```

### 기대 결과

```text
initial folder = A
user change → null
List root에 생성
Folder A에는 생성되지 않음
```

---

## 17.11 E2E-08 — 새 Folder inline 생성 후 List 생성

### 시나리오

```text
1. Folder dropdown open
2. + 새 폴더
3. "연구" 입력
4. Folder create
5. Add List submit
```

### 기대 결과

```text
Folder create success
새 Folder 자동 선택
folderId 확정 전 Add List submit 불가
Folder success 후 Add enabled
List는 새 Folder 안에 생성
```

---

## 17.12 E2E-09 — Duplicate Name 허용

### 시나리오

```text
기존 "학교" List 존재
→ 새 List Name = "학교"
→ Add
```

### 기대 결과

```text
정상 생성
두 List는 서로 다른 UUID
Name unique error 없음
```

---

## 17.13 E2E-10 — Empty Name

### 시나리오

```text
Modal Open
Name = ""
```

### 기대 결과

```text
Add disabled
red error 없음
Cancel 가능
```

Whitespace-only:

```text
"   "
→ normalized invalid
→ submit 불가
```

---

## 17.14 E2E-11 — IME Enter

### 시나리오

한글 입력 중:

```text
"학교"
```

composition 확정용 Enter 입력.

### 기대 결과

```text
IME composition Enter
→ List create 발생하지 않음
```

composition 종료 후 Enter:

```text
→ 정상 submit
```

### P0

IME Enter로 의도치 않게 List가 생성되면 release 차단.

---

## 17.15 E2E-12 — Double Click 방지

### 시나리오

```text
valid Draft
→ Add 빠르게 여러 번 클릭
```

### 기대 결과

```text
첫 click 즉시 SUBMITTING
후속 click no-op
server logical request 1개
List 1개
```

---

## 17.16 E2E-13 — Enter 연타 방지

```text
Name valid
→ Enter × 3
```

기대:

```text
List 1개만 생성
```

UI guard + idempotency 모두 검증.

---

## 17.17 E2E-14 — Network Failure

### 시나리오

Create request network failure.

### 기대 결과

```text
Modal 유지
Draft 유지
Global error
Primary = 다시 시도
Cancel enabled
Form editable
```

### MUST

Sidebar에 orphan List 없음.

---

## 17.18 E2E-15 — Timeout + Retry

### 시나리오

```text
첫 request 서버 처리 성공
response lost
client timeout
Retry
```

### 기대 결과

```text
same requestId 사용
server existing result 반환
List 중복 생성 없음
success navigation
```

### P0

동일 List 2개 생성 시 release 차단.

---

## 17.19 E2E-16 — Error 후 Draft 수정

### 시나리오

```text
Create failure
→ Name "학교" → "학교 프로젝트"
→ Retry/Add
```

### 기대 결과

```text
Draft revision 증가
old create error clear
new logical requestId
새 payload로 create
```

---

## 17.20 E2E-17 — Folder 삭제 동시성

### 시나리오

```text
Folder A selected
Modal open
외부에서 A 삭제
```

### 기대 결과

```text
folderId invalid 감지
None으로 reset
notice/error
자동 create 없음
사용자가 다시 Submit
```

### MUST

deleted folderId가 server payload에 전달되지 않는다.

---

## 17.21 E2E-18 — View Availability 변경

### 시나리오

```text
Gantt selected
Submit 직전 Gantt unavailable
```

### 기대 결과

```text
Create 차단
View row error
Gantt 선택 상태 확인 가능
List로 silent fallback하지 않음
```

---

## 17.22 E2E-19 — Permission 변경

### 시나리오

```text
Modal Open
Create permission revoked
Add
```

### 기대 결과

```text
Permission Error
Draft 유지
복구 가능한 경우 location 변경 가능
불가능한 경우 Close 중심 blocking state
```

---

## 17.23 E2E-20 — Post-create Navigation Failure

### 시나리오

```text
Create persistence success
Router navigation failure
```

### 기대 결과

```text
List는 유지
Create API Retry하지 않음
navigation recovery만 수행
가능하면 Sidebar에 생성 결과 표시
```

### P0

Create success 후 `다시 시도`가 create command를 재실행하면 release 차단.

---

## 17.24 E2E-21 — Sidebar Cache Failure

```text
Create success
Sidebar cache update fail
```

기대:

```text
invalidate/refetch
route open 시도
create request 재실행 없음
```

---

## 17.25 E2E-22 — Browser Back

### 시나리오

```text
List 생성 성공
새 List route
Browser Back
```

### 기대 결과

```text
이전 화면으로 이동
새 List는 삭제되지 않음
```

---

## 17.26 E2E-23 — Refresh

### 시나리오

```text
새 List route 진입
browser refresh
```

### 기대 결과

```text
listId 기반 복구
Sidebar List 존재
active selection 복구
default/current route View 정상
```

---

## 17.27 E2E-24 — Responsive State 유지

### 시나리오

```text
Desktop Modal Open
Name/Color/View/Folder 변경
viewport → Tablet → Mobile
```

### 기대 결과

```text
Draft 유지
sessionId 유지
error/request 상태 유지
Preview만 responsive rule에 따라 제거
```

### MUST

Responsive 전환으로 Form reset 금지.

---

## 17.28 E2E-25 — Mobile Bottom Sheet

### 시나리오

```text
<640px
Lists +
```

### 기대 결과

```text
Bottom Sheet
stacked fields
Color horizontal scroll
View icon + text
Folder mobile picker
full-width Add
Preview 없음
```

---

## 17.29 E2E-26 — Mobile Software Keyboard

### 시나리오

Name input focus + keyboard open.

### 기대 결과

```text
Name field visible
Form scroll 가능
Primary Action 접근 가능
Sheet height 안정
```

---

## 17.30 E2E-27 — Mobile Submit Dismiss Lock

### 시나리오

```text
SUBMITTING
→ swipe down / Back
```

### 기대 결과

```text
Modal dismiss되지 않음
request lifecycle 유지
```

---

## 17.31 Keyboard QA — 기본

Keyboard only로 다음 전체 Flow가 가능해야 한다.

```text
Open
→ Name typing
→ Tab Color
→ Arrow selection
→ Tab View
→ Arrow selection
→ Tab Folder
→ Enter
→ Arrow option
→ Enter
→ Tab Add
→ Enter
```

Mouse가 없어도 정상 생성.

---

## 17.32 Keyboard QA — Focus Trap

Modal open:

```text
Tab × N
```

기대:

```text
Focus가 Modal 밖으로 나가지 않음
```

Shift+Tab도 동일.

---

## 17.33 Keyboard QA — Esc Layering

순서대로 검증:

```text
Custom Color Open
Esc → Custom만 close

Folder Open
Esc → Folder만 close

No child
Esc → Modal close
```

Submitting:

```text
Esc → no-op
```

---

## 17.34 Keyboard QA — Focus Restoration

Cancel:

```text
Focus → opening +
```

Success:

```text
Focus → Quick Add / first task action
```

Child close:

```text
Focus → child opener
```

---

## 17.35 Screen Reader Smoke Test

최소 다음을 확인한다.

```text
Dialog title 읽힘
Name accessible label 존재
Color radio group 읽힘
View radio group 읽힘
Folder combobox/listbox 읽힘
Error announce
Loading announce
Focus transition 예측 가능
```

### MUST

Preview skeleton이 반복적으로 읽히지 않는다.

---

## 17.36 Color-only QA

다음을 색상만으로 구분하지 않는다.

```text
Selected
Focused
Error
Disabled
```

반드시 border/ring/icon/text 등의 추가 signal 존재.

---

## 17.37 Reduced Motion QA

OS reduced motion 활성화.

검증:

```text
Modal scale 제거/축소
Preview crossfade 제거/축소
Swatch scale 제거
Button pressed scale 제거
```

Interaction 의미는 동일.

---

## 17.38 200% Zoom QA

Browser 200% zoom.

검증:

```text
Form 접근 가능
Action 접근 가능
Preview 제거 가능
Dropdown clipping 없음
scroll 가능
```

### P1

Action이 화면 밖에 영구적으로 사라지면 release 전 수정.

---

## 17.39 Desktop Visual QA

### Layout

```text
2-panel
Settings 54% / Preview 46%
Title Settings 기준 center
Form alignment 일관
Actions 우측 하단
```

### Controls

```text
Name full width
Color compact row
View compact tiles
Folder full control
```

---

## 17.40 Compact Desktop QA

960~1279px:

```text
2-panel 유지
Settings 확대
Preview 축소
Control wrap 없음
```

---

## 17.41 Tablet QA

640~959px:

```text
single-column
Preview 없음
Form width 안정
Actions 접근 가능
```

---

## 17.42 Mobile QA

<640px:

```text
Bottom Sheet
safe area
sticky/full-width Add
touch target ≥ 권장 크기
hover dependency 없음
```

---

## 17.43 Preview QA

### List

```text
4개 내외 task skeleton
```

### Board

```text
3 columns
```

### Gantt

```text
task list + timeline bars
```

### 공통

```text
Name 즉시 반영
Color header accent 반영
Folder 변경 영향 없음
non-interactive
```

---

## 17.44 Preview Performance QA

다음이 없어야 한다.

```text
real Task fetch
Board DnD initialization
Gantt engine boot
Router subscription
DB query
```

Preview는 lightweight dumb render.

---

## 17.45 Data QA — List/View 분리

DB/Domain 검증:

```text
List.type = board/gantt
```

같은 field가 creation path에 사용되지 않아야 한다.

Default:

```text
defaultViewKey
```

로 표현.

---

## 17.46 Data QA — Folder

검증:

```text
folderId nullable
same Space validation
Folder deletion does not delete List
```

---

## 17.47 Data QA — Duplicate Name

DB에 name unique constraint로 생성이 막히지 않아야 한다.

---

## 17.48 Data QA — Sort

Client payload에:

```text
sortKey
```

가 없어야 한다.

Server/domain이 append key 결정.

동시 생성 시 안정적이어야 한다.

---

## 17.49 Data QA — Idempotency

검증:

```text
same requestId + same payload
→ same result

same requestId + different payload
→ IDEMPOTENCY_CONFLICT
```

---

## 17.50 Architecture QA

다음 import/dependency가 없어야 한다.

```text
CreateListModal → DB client
Field Component → Router
Preview → Board/Gantt real renderer
Reducer → async service
Service → React component
```

---

## 17.51 Architecture QA — Post Create

Create success 후:

```text
PostCreateCoordinator
```

또는 동일 책임의 application layer가:

```text
cache
sidebar
navigation
focus
```

를 처리해야 한다.

Modal 자체가 모든 후처리를 직접 소유하지 않는다.

---

## 17.52 Unit Test Minimum Set

필수 unit test:

```text
normalizeListName
validateCreateListDraft
color validation
view availability validation
reducer OPEN
reducer UPDATE_DRAFT
reducer SUBMIT_START
reducer SUBMIT_FAILURE
reducer SUBMIT_SUCCESS
selector canSubmit
error mapping
requestId reuse/new generation policy
```

---

## 17.53 Component Test Minimum Set

필수:

```text
Name IME guard
Color roving tabindex
View radio selection
Folder listbox keyboard
Inline Folder create
Add loading state
Cancel disabled submitting
Preview switching
```

---

## 17.54 Integration Test Minimum Set

필수:

```text
successful create
network failure
timeout retry
folder create then list create
view unavailable
permission error
post-create navigation failure
responsive shell change preserving Draft
```

---

## 17.55 P0 — Release Blocking

다음 중 하나라도 존재하면 release 금지.

```text
P0-01 List 중복 생성 가능
P0-02 Recoverable error에서 Draft 손실
P0-03 Submitting 중 Modal dismiss 가능
P0-04 Deleted/invalid Folder로 create 가능
P0-05 Unavailable View를 silent fallback 후 create
P0-06 Post-create failure가 Create Retry를 재실행
P0-07 IME Enter가 의도치 않은 Create 실행
P0-08 Modal A stale response가 Modal B state 변경
P0-09 List/View domain이 다시 결합됨
P0-10 Create success 전 orphan List 노출
P0-11 Mobile/Responsive 전환으로 Draft reset
P0-12 같은 requestId retry에서 duplicate row 발생
```

---

## 17.56 P1 — Release 전 수정 권장

```text
P1-01 Focus trap 실패
P1-02 Cancel 후 Focus 복구 실패
P1-03 Success 후 새 List selected 아님
P1-04 Folder 자동 expand 안 됨
P1-05 Default View 첫 render flicker
P1-06 200% zoom에서 Action inaccessible
P1-07 Mobile keyboard가 Form/Action 가림
P1-08 Error message 위치가 원인과 불일치
P1-09 Selected + Focus visual 구분 불가
P1-10 Folder/Search keyboard navigation 실패
P1-11 Preview가 실제 app component에 과도하게 의존
P1-12 post-create navigation recovery 불가
```

---

## 17.57 P2 — Polish

출시 이후 조정 가능.

```text
tooltip delay
preview shadow intensity
hover timing
new List highlight
micro animation duration
exact neutral tone
```

---

## 17.58 Definition of Done — UX

다음을 모두 만족해야 한다.

```text
[ ] 5~10초 내 기본 List 생성 가능
[ ] Name만으로 생성 가능
[ ] Color/View/Folder는 optional/quick choice
[ ] 생성 전 Preview가 이해를 도움
[ ] 취소는 빠르고 명확
[ ] 실패 시 다시 입력할 필요 없음
[ ] 생성 후 첫 Task 행동까지 자연스럽게 연결
```

---

## 17.59 Definition of Done — Interaction

```text
[ ] Mouse
[ ] Keyboard
[ ] Touch
[ ] IME
[ ] Focus trap
[ ] Esc layering
[ ] Double-submit guard
[ ] Loading lock
```

모두 PASS.

---

## 17.60 Definition of Done — Data

```text
[ ] List/View 분리
[ ] nullable Folder relation
[ ] same-space validation
[ ] defaultViewKey
[ ] server/domain sort allocation
[ ] idempotency
[ ] duplicate Name 허용
[ ] atomic create
```

---

## 17.61 Definition of Done — Error Recovery

```text
[ ] Network
[ ] Timeout
[ ] Server
[ ] Permission
[ ] Folder invalid
[ ] View unavailable
[ ] Partial persistence
[ ] Post-create failure
```

각 시나리오의 복구 경로가 존재.

---

## 17.62 Definition of Done — Responsive

```text
[ ] Wide Desktop
[ ] Compact Desktop
[ ] Tablet
[ ] Mobile
[ ] Small-height viewport
[ ] 200% zoom
[ ] orientation change
```

모두 Draft loss 없이 동작.

---

## 17.63 Definition of Done — Accessibility

```text
[ ] Dialog semantics
[ ] Label semantics
[ ] Radio/listbox semantics
[ ] Focus visible
[ ] Error announcement
[ ] Loading announcement
[ ] Reduced motion
[ ] Color-independent state indication
```

---

## 17.64 Definition of Done — Architecture

```text
[ ] UI / Controller / Service 분리
[ ] Reducer pure
[ ] Preview dumb component
[ ] PostCreateCoordinator 분리
[ ] View Registry integration
[ ] DB/Router direct import 없음
[ ] Retry-safe cache upsert
```

---

## 17.65 최종 Smoke Test — 60초 검수

개발 완료 후 최소한 다음을 사람이 직접 해본다.

```text
1. Lists + 클릭
2. Name 입력
3. Color 변경
4. Board 선택
5. Folder 선택
6. Add
7. 새 List Sidebar 확인
8. Board 진입 확인
9. Add Task 가능 확인
10. 다시 열어 Cancel/Esc 확인
```

이 60초 검수에서 이상이 보이면 자동 테스트 PASS만으로 완료 처리하지 않는다.

---

## 17.66 최종 회귀 Smoke Test — Error

추가로:

```text
1. Network offline
2. Add
3. Draft 유지 확인
4. Online 복구
5. 다시 시도
6. List 1개만 생성 확인
```

---

## 17.67 최종 회귀 Smoke Test — Mobile

```text
1. <640px
2. Bottom Sheet Open
3. Name 입력
4. View 선택
5. Folder 선택
6. keyboard 열린 상태 확인
7. Add
8. 새 List 화면 진입
```

---

## 17.68 최종 승인 기준

다음 조건이면 `Add List v1` 구현 완료로 판정한다.

```text
All P0 = PASS
All core E2E = PASS
Desktop / Tablet / Mobile = PASS
Keyboard-only = PASS
Error recovery = PASS
Data invariants = PASS
Architecture invariants = PASS
```

P2 visual tuning만 남은 경우 기능 구현은 완료로 볼 수 있다.

---

## 17.69 최종 설계 결론

이 Add List Flow의 핵심은 다음 네 문장으로 요약된다.

> **List는 데이터 컨테이너이고 View는 표현 방식이다.**

> **생성 Modal은 최소 입력으로 빠르게 끝나야 한다.**

> **실패해도 Draft를 잃지 않고, 성공하면 즉시 새 List에서 다음 행동으로 이어져야 한다.**

> **Desktop에서는 TickTick의 2-panel 감각을 유지하되, 작은 화면에서는 Preview보다 Form usability를 우선한다.**

---

## 17.70 문서 완료 상태

이 문서의 §0~§17을 모두 구현 기준으로 사용한다.

```text
§0  설계 목적 및 범위                ✅
§1  Add List 전체 Flow               ✅
§2  Modal Shell / Layout             ✅
§3  Name                             ✅
§4  Color                            ✅
§5  Default View                     ✅
§6  Folder                           ✅
§7  Add / Cancel                     ✅
§8  Right Preview                    ✅
§9  Keyboard / Focus / Accessibility ✅
§10 Loading / Error / Edge Cases     ✅
§11 Post-create Navigation           ✅
§12 State Model                      ✅
§13 Data Model / View Integration    ✅
§14 Responsive                       ✅
§15 Component Architecture           ✅
§16 Interaction State Matrix         ✅
§17 Final Acceptance Criteria        ✅
```

**Add List 상세 설계 완료.**
