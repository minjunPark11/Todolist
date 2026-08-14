# ClickUp 기능 이식 설계

- 작성일: 2026-08-14 (초판), **개정: 2026-08-14 — 방향 전환**
- 기준: `v0.5.3` (`a927892`), 브랜치 `fix/store-write-amplification`
- 선행 문서: `TIMESTRIPE_REFERENCE.md` (확신도 표기), `SPACES_BOARD_DESIGN.md` (두 축 모델), `PLANNING_PRIORITY_DESIGN.md` (파생 우선순위)
- 대상: 데이터 계층 전반 + `src/utils/*Items.ts` + `supabase/migrations/`

---

## 0. 정정 — 이 문서는 두 번 방향이 바뀌었다

`SPACES_BOARD_DESIGN.md` §0의 태도를 따른다. 초판을 지우지 않고, 무엇이 왜 바뀌었는지 남긴다.

> **정정 1 (범위).** 초판은 "Tier 0만, 축을 늘리지 않는다"였다. **결정이 바뀌었다 — 많이 가져온다.**
> 초판 §2의 "축을 늘리는 기능은 받지 않는다"와 §6 "하지 않을 것" 목록은 **이 개정판 §3·§7로 대체된다.**
> 초판의 Tier 0(D1~D6, Phase C1~C3)은 **유지된다** — 폐기가 아니라 Wave 2에 흡수된다(§5).

> **정정 2 (기술 판단 — 초판이 틀렸다).** 초판은 커스텀 필드를 거절하며 그 근거로
> *"`buildSyncPlan` / `diffRecords`가 임의 스키마를 다뤄야 해서 write-amplification 작업이 무너진다"*
> 고 적었다. **사실이 아니다.** 조사 결과는 §6에 있다. 요약:
>
> - `buildSyncPlan.ts:67-70` — *"The diff needs only identity and an id, so the per-collection record types collapse to one shape here"*. 동기화는 **레코드 모양을 모른다**
> - `004_learning_paths.sql` — 모든 컬렉션 테이블이 `id / user_id / data jsonb`로 **동일**. *"no schema change is needed when a milestone gains a field"*
>
> → **커스텀 필드의 데이터 계층 비용은 사실상 0이다.** 거절 근거가 사라졌으므로 §4.4로 채택한다.

**이 정정이 설계 전체를 바꾼다.** 병목이 데이터가 아니라면, 기능 개수의 한계는 **UI 표면적과 사용자 결정 부담**뿐이다. §3의 원칙은 거기서 나온다.

---

## 1. 확신도

**ClickUp을 실제 제품으로 열어 확인하지 않았다.** 기능 목록은 학습 데이터 기반이다.

| 항목 | 확신도 |
|---|---|
| 의존성 · 태그 · 저장된 뷰(필터+그룹+정렬) · 커스텀 필드 · 자동화(트리거→조건→액션) · 템플릿 | **[확인]** — Jira·Asana·Linear·Notion 공통. ClickUp 고유 발명이 아니다 |
| 기능 토글(ClickApps)의 **존재** | **[확인]** |
| ClickApps의 정확한 항목 수·이름·기본값 | **[불명]** — §3은 개념만 쓴다 |
| 뷰 종류의 정확한 목록, 커스텀 필드 타입 전체, 요금제 경계 | **[불명]** — 이 문서는 의존하지 않는다 |
| Workspace/Folder 계층 | **[불명]** + **의도적으로 안 씀** (§7) |

**검증 한계.** 모든 코드 인용은 정적 읽기 결과다. 현재 환경에 node가 없어 `npm run typecheck` / `npm test`를 실행하지 못했다. Wave 1은 테스트가 있는 파일을 전면 재구성하므로 **node 복구가 착수 조건이다.**

---

## 2. 진단 — 모델에는 있고, UI에는 없다

| 필드 | 모델 | 동기화 | UI 노출 |
|---|---|---|---|
| `repeatType` 외 3 | ✔ | ✔ | ✔ |
| `parentTaskId` | ✔ | ✔ | ✔ Spaces 한정 |
| `estimatedMinutes` | ✔ | ✔ | 저장만, 합산 없음 |
| `tags` | ✔ | ✔ | **편집기 없음** |
| `blockedByTaskId` | ✔ | ✔ | **참조 0회** |
| `isSomeday` | ✔ | ✔ | **참조 0회** |

`TaskDetail.tsx`가 노출하는 건 제목·설명·`scheduledDate`·`startTime`·`endTime`·`dueDate`·반복·`priority`·사분면·메모뿐이다.

### 2.1 죽은 필드가 매 턴 프롬프트에 실린다

```
usePlannerData.ts:140            isSomeday: Boolean(task.isSomeday),
usePlannerData.ts:150            blockedByTaskId: task.blockedByTaskId ?? "",
selectRelevantAppContext.ts:97   isSomeday: task.isSomeday,
selectRelevantAppContext.ts:99   blockedByTaskId: task.blockedByTaskId,
```

쓰는 UI가 없으므로 두 값은 항상 `false` / `""`인데, AI 컨텍스트에는 매 턴 들어간다.

### 2.2 `tags`는 자유 라벨이 아니다 — 소속 메커니즘이다

```
spaceSelectors.ts:16    return `space:${spaceId}`;
spaceSelectors.ts:25    ((sourceProjectId && task.projectId === sourceProjectId) || task.tags.includes(tag))
spaceSelectors.ts:192   const explicit = task.tags.find((tag) => tag.startsWith("group:"))?.slice("group:".length);
```

`getSpaceTasks()`가 `space:<id>` 태그로 **소속을 판정한다.** 순진한 태그 편집기는 데이터 손상 경로다 (§5 W2.1).

### 2.3 같은 투영 패턴을 이미 네 번 구현했다

| 파일 | 투영 | 소스 |
|---|---|---|
| `calendarItems.ts` | `CalendarItem` | task/project/note/external/focus 5종 |
| `horizonItems.ts` | `HorizonItem` | path/milestone/task 3종 |
| `todayView.ts` | `TodayEntry` | task |
| `eisenhower.ts` | `MatrixPosition` | task |

`horizonItems.ts` 헤더가 직접 인정한다 — *"Same shape of idea as calendarItems.ts"*.

그리고 `SpaceHorizons.tsx` 첫 줄:

> 같은 HorizonItems를 Horizons 페이지는 5칼럼으로, 여기서는 **한 보드로 좁혀 행으로** 쌓는다

이것이 `{ filter:{boardId}, groupBy:"horizon", layout:"rows" }`를 **179줄짜리 별도 컴포넌트로 쓴 것**이다. 필터 원시함수(`itemsForBoard` / `itemsForHorizon` / `itemsForHorizonAnchor`)는 이미 `horizonItems.ts`에 있다.

> **기능을 많이 가져오려면 이 중복을 먼저 끝내야 한다. 지금 구조로 기능을 N개 더 얹으면 투영이 N개 더 생긴다.**

---

## 3. 원칙 — 많이 가져오되, 스파인 위에서

초판의 "축을 늘리지 않는다"를 대체한다.

### P1. 기능은 페이지가 아니라 **설정**으로 들어온다

ClickUp이 그 많은 기능을 감당하는 건 화면이 많아서가 아니라 **스파인이 있어서**다: 하나의 아이템 모델 위에 뷰·필드·자동화가 조합된다. 스파인 없이 기능을 늘리면 페이지 더미가 된다.

→ **Wave 1(스파인)을 건너뛰고 Wave 2 이후를 하지 않는다.** 이 문서에서 가장 중요한 한 줄이다.

### P2. 기능 토글(ClickApps)을 **먼저** 가져온다

기능을 많이 넣을 때 앱을 살리는 건 **끌 수 있다는 것**이다. ClickUp의 ClickApps가 바로 그것이고, 가져올 기능 중 **가장 싸다**.

> **검증 (2026-08-14).** ClickApps는 **Workspace 전역 + Space별**로 켠다 — *"activate or deactivate ClickApps for the whole Workspace or specific Spaces"*([Intro to ClickApps]). 예시로 든 것이 *"엔지니어링 Space에만 Sprints를 켜고 다른 팀 Space에는 안 넣는다"*이다.
>
> **가장 중요한 발견:** ClickApps로 켜고 끄는 항목이 **의존성 · 태그 · 커스텀 필드 · 우선순위 · 시간 추적 · 예상 시간 · 스프린트 · 폼**이다. 즉 **§5에서 우리가 가져오려는 것 대부분을 ClickUp 자신도 "기본 기능"이 아니라 "끌 수 있는 것"으로 취급한다.** P2가 옳다는 가장 강한 근거다.

**두 수준으로 구현한다** — 앱에 Workspace가 없으므로 전역은 `AppSettings`가 맡는다:

```ts
AppSettings.features: Record<FeatureId, boolean>   // 전역 기본값
Space.features?: Record<FeatureId, boolean>        // Space별 덮어쓰기 (없으면 전역 상속)
```

`FeatureId` 후보 — §5의 Wave와 1:1로 맞춘다:

```
dependencies · tags · customFields · timeEstimate · timeTracking
relations · automations · activityLog · attachments · templates
horizons · eisenhower           ← 기존 기능도 끌 수 있게 한다
```

- **기본값은 꺼짐.** 켠 사람만 그 개념을 본다
- 끄면 UI에서 사라진다. **데이터는 남는다** — 되돌릴 수 있어야 실험이 된다
- 기존 기능(지평·아이젠하워)도 토글에 넣는다. 안 쓰는 사람에게서 목적지를 두 개 줄인다

→ 이게 있으면 §7의 "안 가져올 것" 목록이 짧아져도 안전하다. 판단이 틀려도 끌 수 있다.

[Intro to ClickApps]: https://help.clickup.com/hc/en-us/articles/6304327753111-Intro-to-ClickApps

### P3. 저장하는 것과 파생하는 것을 섞지 않는다

`HorizonItem` 주석의 규칙을 앱 전체로 확장한다 — *"the view is owned, the storage never is"*.

- 사분면·지평·버킷·blocked·workload 합계는 **전부 파생**
- 사용자가 손으로 정한 것만 저장 (배치, 필드 값, 뷰 정의)

### P4. 새 개념보다 기존 개념의 **일반화**를 먼저 본다

- ClickUp Checklist → `Subtask`가 이미 있다
- ClickUp "Tasks in Multiple Lists" → `tags`가 이미 그 역할
- ClickUp Custom Status → `boardLists`가 이미 그 역할
- ClickUp Goals/Targets → `LearningPath` + `Milestone`이 이미 그것

→ 같은 것을 두 번 만들면 §2.3의 중복이 반복된다.

---

## 4. Wave 1 — 스파인 (이것 없이는 나머지 없음)

### 4.1 Item 투영 통합

`calendarItems` + `horizonItems` + `todayView` + `eisenhower`의 투영을 하나로.

```ts
type Item = {
  key: string;
  sourceType: "task" | "goal" | "milestone" | "project" | "external" | "focus";
  sourceId: string;
  parentId: string;
  title: string;

  boardId?: string;          // 영역 축 (색과 같은 규칙 — SPACES_BOARD_DESIGN D3)
  color: string;

  scheduledDate?: string;    // 언제 할 것인가
  dueDate?: string;          // 언제까지인가
  schedule?: GoalSchedule;   // 어느 기간에 속하는가
  startTime?: string; endTime?: string;

  status; priority; done: boolean;
  blocked: boolean;
  tags: string[];
  estimatedMinutes?: number;
  actualSeconds?: number;

  customFields: Record<string, CustomFieldValue>;   // §4.4
};
```

시간 필드 셋은 **서로 다른 질문에 답하므로** 합치지 않는다. 합치면 정보가 사라진다.

### 4.2 ViewSpec 엔진

```ts
type ViewSpec = {
  id: string; name: string;
  filter: {
    boardId?; boardListId?; tags?; status?; priority?;
    dateRange?; horizon?; blocked?; sourceTypes?;
    customField?: Record<string, unknown>;
  };
  groupBy: "none" | "bucket" | "quadrant" | "horizon"
         | "board" | "boardList" | "priority" | "dueDate" | "status"
         | `cf:${string}`;                            // 커스텀 필드로 그룹화
  sort: SortSpec;
  layout: "list" | "columns" | "rows" | "board" | "table" | "timegrid" | "timeline";
};
```

**기존 화면의 재정의:**

| 현재 | ViewSpec | 효과 |
|---|---|---|
| Horizons 페이지 | `groupBy:horizon, layout:columns` | 프리셋 |
| Space 상세 지평 행 | `filter:{boardId}` + 위 | **`SpaceHorizons.tsx` 179줄 삭제** |
| 계획(아이젠하워) | `groupBy:quadrant, layout:columns` | 프리셋 |
| 보관함 | `filter:{status:archived}, layout:list` | 프리셋 |
| Space 태스크 탭 | `filter:{boardId}, groupBy:boardList, layout:board` | 뷰 |
| 오늘 Focus Queue | `filter:{scheduled:today}, groupBy:bucket` | 뷰 |
| 캘린더 | `layout:timegrid` | `calendarItems`가 이미 절반 |

### 4.3 뷰 저장 — 새 컬렉션 `views`

`004_learning_paths.sql`을 복사해 `005_views.sql`. `collectionTables`에 `["views","views"]`, `optionalRemoteTables`에 `"views"` 추가. **그게 전부다**(§6).

### 4.4 커스텀 필드

초판이 거절했던 것. §0 정정 2에 따라 채택한다.

```ts
// 새 컬렉션: custom_fields (정의)
type CustomFieldDef = {
  id: string; name: string;
  type: "text" | "number" | "money" | "date" | "select" | "multiSelect"
      | "checkbox" | "url" | "email" | "rating" | "progress" | "relation";
  options?: Array<{ id: string; label: string; color: string }>;
  scope: "global" | { boardId: string };   // 보드별 필드
  order: number;
};

// 값은 레코드에 인라인 — jsonb이므로 마이그레이션 없음
Task.customFields?: Record<string /* defId */, CustomFieldValue>;
```

- **정의는 새 컬렉션, 값은 인라인.** 값을 별도 테이블로 빼면 조인이 생기고 `diffRecords`의 정체성 기반 diff가 깨진다
- Formula / Rollup 필드는 **파생**이다(P3). 저장하지 않는다
- 필드가 늘어도 동기화 코드는 한 줄도 안 바뀐다

### 4.5 페이지로 남는 것 — 전부가 뷰는 아니다

| 화면 | 남기는 이유 |
|---|---|
| **오늘** | 브리핑·인라인 캡처·타임레일·인박스 정리는 그룹화가 아니라 **하루를 여는 의식**. 큐만 내부적으로 뷰 |
| **캘린더** | 외부 캘린더·카테고리·공유 크롬이 무겁다. `timegrid`지만 페이지 유지 |
| **공간** | 노트·활동·AI 브리핑을 담은 **컨테이너**. 그 안의 목록만 뷰 |
| **집중** | 목록이 아니라 세션 러너 |
| **설정** | — |

사이드바: 지평·계획·보관함이 **"뷰" 섹션 아래 항목**이 되고 `+ 뷰 추가`가 생긴다. 사용자가 잃는 것은 없고 조합만 는다.

---

## 5. Wave 2~5 — 기능 지도

### Wave 2 — 필드와 관계 (스파인 위에서 거의 공짜)

| ClickUp 기능 | 여기서의 구현 | 비고 |
|---|---|---|
| **W2.1 태그** | 편집기 + `filter.tags` | **예약 접두사(`space:`/`group:`)를 숨기고 병합 저장.** 안 하면 소속이 날아간다(§2.2). 초판 D3 유지 |
| **W2.2 의존성** | `blockedByTaskId` → **배열로 확장** | 초판 D1은 "단수 유지"였다. 정정 2로 근거가 사라졌으므로 **다대다 채택**. 역방향은 파생, 순환은 저장 시 거부 |
| **W2.3 blocked 파생 강등** | `collectTodayEntries`가 blocked를 `later`로 | 초판 D2 그대로. 사용자 override가 이긴다 |
| **W2.4 시간 추정 roll-up** | 뷰 헤더에 합계 | `estimatedMinutes` + `actualSeconds` 이미 존재 |
| **W2.5 커스텀 태스크 타입** | 커스텀 필드 `select`로 대체 | 새 개념 안 만든다(P4) |
| **W2.6 연결된 태스크(관계)** | `relation` 커스텀 필드 타입 | W2.2와 별개 — 의존이 아닌 참조 |
| **W2.7 죽은 필드 정리** | `isSomeday`·`aiModel`을 AI 컨텍스트/설정에서 제거 | 초판 D5 |

### Wave 3 — 뷰 종류 (layout만 추가)

| 뷰 | 재료 | 상태 |
|---|---|---|
| **Table** | 커스텀 필드 | W1.4가 끝나면 여기서 빛난다 |
| **Board** | `boardLists` | 이미 있음, layout으로 편입 |
| **Timeline / Gantt** | `dueDate` + `scheduledDate` + W2.2 의존성 | 전부 파생. 새 저장 0 |
| **Workload** | W2.4 합계 + 날짜 | 파생 |
| **Activity** | **변경 로그 필요** | 새 컬렉션 `activity`. 유일하게 저장이 느는 뷰 |
| **Form** | 외부 입력 | 단일 사용자에 가치 낮음. 후순위 |

### Wave 4 — 자동화

```ts
type Rule = {
  id: string; name: string; enabled: boolean;
  trigger: { type: "statusChanged" | "fieldChanged" | "dateArrived" | "created" | "unblocked"; ... };
  conditions: ViewSpec["filter"];        // 필터 언어를 재사용한다 — 새 DSL을 만들지 않는다
  actions: Array<{ type: "setField" | "setStatus" | "addTag" | "createTask" | "moveToList"; ... }>;
};
```

**조건에 `ViewSpec["filter"]`를 그대로 쓰는 게 요점이다.** 필터 언어가 하나면 뷰와 자동화가 같은 어휘를 공유하고, 사용자가 배울 것이 절반이 된다.

개인 앱에서 실제로 강한 규칙: *마감 하루 전이면 `priority=high`* / *blocked가 풀리면 오늘로* / *`done`이 되면 보드 리스트 이동*.

### Wave 5 — 문서와 대시보드

- **Docs** — `SpaceNotesPanel` 확장. 중첩 페이지
- **Dashboards** — 위젯 = **저장된 뷰 + 집계**. 새 데이터 개념 0. Wave 1·3이 끝나면 거의 조립

---

## 6. 데이터 계층이 싼 이유 — 근거

기능을 많이 넣는 결정의 기술적 근거이므로 명시한다.

**(1) 동기화는 레코드 모양을 모른다.**

```
buildSyncPlan.ts:67-70
  // The diff needs only identity and an id, so the per-collection record
  // types collapse to one shape here rather than switching on `key`.
  const items = next[key] as Array<{ id: string }>;
```

`diffChangedRecords`는 `previousById.get(item.id) !== item` — **정체성 비교뿐**이다. 필드가 몇 개든 무관하다.

**(2) 스키마가 균일하다.**

```sql
-- 004_learning_paths.sql
id text, user_id uuid, data jsonb, created_at, updated_at
```

주석: *"no schema change is needed when a milestone gains a field"*. **필드 추가 = 마이그레이션 0.**

**(3) 새 컬렉션 추가 비용이 고정이다.**

004 복사 → 테이블명 변경 → `collectionTables` 한 줄 → `optionalRemoteTables` 한 줄. `learning_paths`가 선례다.

**(4) 유일한 제약: 리듀서가 객체 정체성을 보존해야 한다.**

`usePlannerData`의 리듀서가 건드린 레코드만 spread하는 규칙을 깨면 write-amplification이 돌아온다. **새 기능마다 이 규칙을 지켜야 한다** — 데이터 계층에서 실제로 감시할 것은 이것 하나다.

---

## 7. 그래도 안 가져올 것

축소했다. 남은 것은 **단일 사용자 구조에서 의미가 성립하지 않는 것**뿐이다.

| 기능 | 이유 |
|---|---|
| Assignee · Watcher · 할당 댓글 · Chat · 권한 · 게스트 | 사용자가 한 명이다. 개념이 성립하지 않는다 |
| Sprint · Velocity · Story Point | 팀 리듬 개념. 개인 앱에서 숫자가 의미를 갖지 않는다 |
| Workspace / Folder 계층 | Project → boardLists 두 단계로 충분. 계층이 늘면 "어디에 넣지" 결정이 는다 |
| Custom Status | `boardLists`가 이미 그 역할 (P4) |
| Mind Map · Map(지리) 뷰 | 이 앱의 데이터에 좌표도 자유연결도 없다 |

> 이 목록조차 **P2(기능 토글)가 있으면 되돌릴 수 있다.** 확신이 서면 켜면 된다.

---

## 8. 순서와 위험

```
W0  선행 조건        node 복구 · main 정리 (아래 위험 1·2)
W1  스파인           Item 투영 → ViewSpec → views 컬렉션 → 커스텀 필드 → 기능 토글
W2  필드·관계        태그 · 의존성 · blocked 강등 · roll-up · 관계 · 죽은 필드 정리
W3  뷰 종류          Table · Timeline · Workload · Activity
W4  자동화           필터 언어 재사용
W5  문서·대시보드
```

**위험 1 — 검증 환경이 없다.** node 미설치로 `typecheck`/`test` 실행 불가. W1은 테스트가 있는 파일 4개(`horizonItems` · `todayView` · `eisenhower` · `collectTodayEntries`)를 전면 재구성한다. **테스트 없이는 착수 불가.**

**위험 2 — 브랜치가 밀려 있다.** `fix/store-write-amplification`이 `main` 대비 15커밋 / 102파일 / +8,358−3,175. `v0.5.2`·`v0.5.3` 태그가 이 브랜치에만 있다. 여기에 W1을 얹으면 되돌릴 수 없다.

**위험 3 — 결정 부담.** 기능 수가 늘면 ClickUp이 실제로 듣는 비판("복잡하다")을 그대로 물려받는다. P2(기본 꺼짐)가 유일한 방어선이므로 **W1에서 같이 만든다. 나중으로 미루지 않는다.**

---

## 9. [불명] · 숙제

1. **ClickUp 실제 화면·ClickApps 목록·요금제** — 확인하지 않았다. "ClickUp이 그러니까"를 근거로 쓰려면 확인이 먼저다
2. **`tags`의 이중 역할** — `space:`/`group:`이 소속·배치 메커니즘인 채로 사용자 태그와 배열을 공유한다. W2.1은 안전장치이지 해결이 아니다. 전용 필드 분리는 별도 과제
3. **오늘 버킷 저장 위치** — 현재 `todayPage.bucketOverrides.v1` localStorage(날짜별·동기화 없음). W1에서 레코드로 옮긴다: `Task.todayBucket` + `todayBucketDate`. 뷰별 수동 배치를 전부 저장할지는 미결
4. **`lib/ai/learningPaths` 위치** — Goal 모델은 AI가 아니라 Horizons·Spaces의 핵심인데 `lib/ai/` 아래 있다. 옮길 대상
5. **Context Cards slice B** — `Milestone.cardIds`가 설계상 항상 `[]`인데 `pathMutations.ts:141`에 쓰기 코드와 테스트가 있다. 끝내거나 링크를 끊거나
6. **`README.md`가 낡았다** — *"modelCatalog의 URL과 sha256은 placeholder"*라고 경고하지만 실제 파일에는 bartowski Qwen2.5의 진짜 URL과 해시가 있다. 이 문서와 무관하게 수정 필요
