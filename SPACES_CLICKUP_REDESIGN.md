# Spaces 재설계 — ClickUp 계층 이식

- 작성일: 2026-08-14
- 기준: `v0.5.3` (`a927892`), 브랜치 `fix/store-write-amplification`
- 선행 문서: `CLICKUP_IMPORT_DESIGN.md` (스파인·기능 지도), `SPACES_BOARD_DESIGN.md` (현행 두 축 모델 — **이 문서가 대체한다**), `TIMESTRIPE_REFERENCE.md` (확신도 표기)
- 대상: `src/components/SpacesPage.tsx` + `src/components/spaces/**`, `src/lib/space*.ts`, `src/hooks/useSpaceHubData.ts`, `src/types.ts`, `supabase/migrations/`

---

## 0. 이 문서의 위치

**현행 Spaces 구조를 버리고 ClickUp의 계층을 이식한다.** `SPACES_BOARD_DESIGN.md`의 D1(Board = Project)과 D2(Space 상세의 지평 축)는 이 문서로 대체된다. 결론 일부는 살아남지만(§3 D2) 근거와 모델이 바뀐다.

### 확신도

> **갱신 (2026-08-14).** 아래 일부를 ClickUp 공식 문서로 **검증했다.** 제품 UI를 직접 조작한 것은 아니고 헬프센터 문서 기준이다. 검증되지 않은 항목은 여전히 [불명]이다.

| 항목 | 확신도 |
|---|---|
| `Space → Folder → List → Task` 계층 | **[검증]** — [Intro to the Hierarchy] |
| **Folder가 선택적**이라는 것 (Folderless List 존재) | **[검증]** — *"Folders add an optional hierarchy layer"*, *"Folderless Lists … display alone under Spaces"* |
| 사이드바가 트리이고 **모든 수준이 표시된다** | **[검증]** — *"all of your Spaces, Folders, Subfolders, and Lists are displayed"*. → **UI 문서 U2의 숨김 규칙은 ClickUp에 없는 우리 것이다** |
| **Subfolder가 존재한다** (한 단계까지) | **[검증]** — 초판이 "없다"고 적은 것은 **오류**. §7에서 정정 |
| Space 아래에 List 말고 Docs·Forms·Whiteboards도 산다 | **[검증]** — 우리는 안 가져오므로 설계에 영향 없음 |
| 커스텀 상태가 Space에서 정의되고 Folder/Subfolder/List로 상속·덮어쓰기된다 | **[검증]** — [Manage task statuses] |
| 상태 그룹은 기본 **3개**(Active/Done/Closed), **Not Started는 ClickApp** | **[검증]** — 우리는 4개 고정으로 **다르게 간다**. D7 참조 |
| 뷰를 Space/Folder/Subfolder/List 어느 수준에나 붙일 수 있다 | **[검증]** — *"Views Bar at the top of any Space, Folder, Subfolder, or List"* |
| 각 수준의 기본 뷰는 List + Board, 뷰는 수준 간 **이동** 가능 | **[검증]** — 상속이 아니라 소속+이동 |
| `Everything` 뷰 (워크스페이스 전체 가로지르기) | **[검증]** — 우리 "뷰" 섹션이 그 역할 (UI 문서 U1) |
| ClickApps를 **Workspace 전역 + Space별**로 켠다 | **[검증]** — [Intro to ClickApps] |
| ClickApps 대상이 의존성·태그·커스텀 필드·우선순위·시간추적·예상시간·스프린트·폼 | **[검증]** — `CLICKUP_IMPORT_DESIGN.md` P2 참조 |
| ClickApps **전체 목록과 각각의 기본 on/off** | **[불명]** — 공식 표를 못 받았다(헬프센터 403). 우리 `FeatureId`는 우리가 정한다 |
| 권한 모델 | **[불명]** + 단일 사용자라 무관 |

[Intro to ClickApps]: https://help.clickup.com/hc/en-us/articles/6304327753111-Intro-to-ClickApps

[Intro to the Hierarchy]: https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy

**검증 한계.** 모든 코드 인용은 정적 읽기다. node 미설치로 `typecheck`/`test` 실행 불가. §6 Phase는 전부 착수 전 검증 환경 복구가 필요하다.

### 트레이드오프 — 한 번만 적는다

`CLICKUP_IMPORT_DESIGN.md` §7은 "Workspace/Folder 계층은 안 가져온다 — 계층이 늘면 *어디에 넣지* 결정이 는다"고 적었다. **이 문서는 그 판단을 뒤집는다.** 사용자의 결정이고, 대신 §3 D4·D5에서 완화한다: Folder는 선택적이고, 기본 List가 자동 생성되어 **단순하게 쓰는 사람은 계층을 느끼지 않는다.**

---

## 1. 진단 — 무엇을 버리는가

### 1.1 Space는 애초에 레코드가 아니다

```
SpacesPage.tsx:21   type Space = { id; name; type; status; mainSignal;
                                   aiPriority; recentActivityCount; ... }
```

페이지 지역 타입이고 `Project`에서 파생된다. **버려도 잃는 데이터가 없다.** `SPACES_BOARD_DESIGN.md` §1이 이미 이걸 문제로 적었다 — *"Spaces 카드의 주인공은 목표가 아니라 파생된 진단이다"*.

### 1.2 타입 분류가 세 벌 겹쳐 있다

| 타입 | 값 | 위치 |
|---|---|---|
| `ProjectType` | `project` \| `area` | `types.ts:79` |
| `SpaceType` | `project` \| `custom` | `SpacesPage.tsx:14` |
| `SpaceHubType` | `project` \| `personal` \| `custom` | `spaceHubTypes.ts:6` |

같은 것을 세 가지로 분류한다. 어느 것도 다른 둘을 모른다. **이게 재설계의 가장 강한 근거다.**

### 1.3 사용자가 쓴 노트가 동기화되지 않는다 — 재설계와 무관하게 위험

```
useSpaceHubData.ts:16   const STORAGE_KEY = "todo-planner-space-hub-v1";
useSpaceHubData.ts:25   const raw = platform.storage.getSync(STORAGE_KEY);
```

`SpaceNote` · `SpaceActivity` · `SpaceCustomConfig`가 **기기 로컬에만** 있다. `collectionTables`(tasks/projects/subtasks/focus_sessions/learning_paths)에 없다.

> **노트는 사용자가 직접 쓴 내용이다.** 기기를 옮기면 사라지고, 두 기기를 쓰면 각 기기가 서로 다른 노트를 갖는다. 이관 계획(§5)에서 이것을 가장 먼저 다룬다.

### 1.4 `boardLists`는 목표만 담고 태스크는 안 담는다

```
LearningPath.boardListId?: string     // 목표는 리스트에 들어간다
Task                                   // boardListId 없음 — projectId로 Project 직결
```

**ClickUp의 List는 태스크가 사는 곳이다.** 여기가 현행 구조와 가장 크게 벌어진 지점이고, §3 D3의 이유다.

### 1.5 소속이 태그 접두사로 구현돼 있다

```
spaceSelectors.ts:16    return `space:${spaceId}`;
spaceSelectors.ts:25    (sourceProjectId && task.projectId === sourceProjectId) || task.tags.includes(tag)
spaceSelectors.ts:192   task.tags.find((tag) => tag.startsWith("group:"))
```

소속 판정 경로가 **둘**이다(projectId 또는 태그). 재설계에서 없앤다(§3 D6).

### 1.6 유령 테이블

`habits` · `habit_logs` · `task_templates` · `study_topics` · `concept_notes` — Supabase에 있고 클라이언트 참조는 **전부 0회**. `task_templates`가 이미 있다는 건 템플릿 기능에 선례가 있다는 뜻이다(§7).

---

## 2. 계층 대응

```
ClickUp                        재설계 후                   현행
──────────────────────────────────────────────────────────────────────
Workspace                      (없음 — 계정 하나)           —
  Space                        Space  (레코드)              Project
    Folder      (선택)         Folder (선택, 레코드)        없음
      List                     List   (레코드)              boardLists (목표 전용)
        Task                   Item   (Task | Goal)         Task (projectId 직결)
          Subtask              Subtask                      Subtask
  커스텀 상태                  Status (Space 소유)          boardLists가 겸직
  뷰                           ViewSpec (어느 수준에나)     페이지 4개 하드코딩
```

핵심 이동 두 가지:

1. **`boardLists` → `Status`.** 현재 boardLists는 칸반 칼럼처럼 쓰이므로 실제 역할은 List가 아니라 **상태**다. ClickUp은 상태와 컨테이너를 분리한다
2. **List가 새로 생긴다.** 태스크가 실제로 사는 컨테이너

---

## 3. 확정 결정

### D1. `Project` 레코드를 `Space`로 **개명하되 id는 보존한다**

"완전히 버린다"의 대상은 **파생 `Space` 타입과 그 진단 카드 UI**이지, `Project` 레코드가 아니다.

`Project.id`는 `Task.projectId` · `LearningPath.projectId` · 캘린더 카테고리 색 · `space:<id>` 태그가 전부 참조한다. id를 새로 발급하면 **저 참조를 전부 다시 쓰는 마이그레이션**이 되고, 실패하면 사용자 데이터가 고아가 된다.

→ **테이블명 `projects` 유지, 타입명 `Space`로 개명, id 보존.** 버리는 것은:

- `SpacesPage.tsx`의 파생 `Space` 타입과 `status`/`mainSignal`/`aiPriority`/`recentActivityCount`
- `SpaceType` · `SpaceHubType` (§1.2) — `ProjectType`만 남기고 그마저 D8로 대체
- 진단 중심 카드 UI 전체

### D2. Space는 **두 축을 유지한다** — 영역 × 시간

`SPACES_BOARD_DESIGN.md` D2의 결론은 살린다. Space 안에서 목표가 지평(Day…Life)에 놓이는 모델은 이 앱의 정체성이고 ClickUp에 없는 것이다.

**단, 구현은 버린다.** `SpaceHorizons.tsx` 179줄은 `{ filter:{spaceId}, groupBy:"horizon" }` 뷰로 대체된다(`CLICKUP_IMPORT_DESIGN.md` §4.2).

### D3. `List`는 **Item**을 담는다 — 태스크만이 아니라

ClickUp의 List는 Task만 담지만, 여기서는 목표가 1급이다(D2). List가 태스크만 담으면 목표는 다시 계층 밖으로 밀려나고 §1.4의 불일치가 재발한다.

→ `List`는 `Item`(Task | Goal)을 담는다. `CLICKUP_IMPORT_DESIGN.md` §4.1의 Item 투영과 같은 것이다.

### D4. `Folder`는 **선택적**이다 — ClickUp의 특징이자 완화 장치

Space 직속 List(Folderless List)를 허용한다. 이것이 §0에서 약속한 완화의 절반이다.

- Folder 없이 Space → List → Item 세 단계로 쓸 수 있다
- Folder는 List가 많아졌을 때만 만든다

### D5. Space를 만들면 **기본 List가 자동 생성된다**

완화의 나머지 절반. 사용자가 "어디에 넣지"를 처음부터 결정하지 않아도 된다.

- Space 생성 시 `List("Tasks")` 자동 생성, `isDefault: true`
- List를 지정하지 않은 Item은 기본 List로 간다
- 기본 List는 삭제할 수 없다 (고아 Item 방지)

> **D4 + D5가 없으면 이 재설계는 순수한 결정 부담 증가다.** 둘은 선택 사항이 아니다.

### D6. 소속은 **`listId` 하나로 판정한다** — 태그 해킹 제거

```
Task.listId: string      // 신규. 이것만이 소속을 결정한다
Task.projectId           // @deprecated — 마이그레이션 후 읽지 않는다
tags "space:<id>"        // 제거. 사용자 태그와 섞이지 않는다
tags "group:<label>"     // 제거 — Status가 대신한다 (§2)
```

Space는 List를 통해 간접적으로 안다: `item → list → (folder) → space`.

`getSpaceTasks()`의 이중 경로(§1.5)가 사라지고, 태그는 순수한 사용자 라벨이 된다 — `CLICKUP_IMPORT_DESIGN.md` W2.1의 예약 접두사 문제도 함께 소멸한다.

### D7. 상태는 **Space가 소유하고 아래로 상속된다**

```ts
type Status = {
  id: string; label: string; color: string; order: number;
  group: "notStarted" | "active" | "done" | "closed";
};
```

- Space가 상태 집합을 정의한다. List는 상속하되 **덮어쓸 수 있다**
- `group`이 있어야 "완료로 친다"를 앱이 판단할 수 있다. 라벨은 사용자 마음대로여도 `group: "done"`이면 완료다
- 현행 `TaskStatus`(inbox/todo/waiting/done/archived)는 **기본 상태 집합의 프리셋**이 된다. 마이그레이션에서 1:1 대응

> **검증 (2026-08-14).** 상속·덮어쓰기 구조는 ClickUp과 일치한다 — *"all Folders and Subfolders within a Space will inherit the Space statuses, but you can override the Space defaults"*, List는 *"inherit statuses from the parent Space or use custom statuses"*([Manage task statuses]).
>
> **단 그룹 구성이 다르다.** ClickUp의 기본 그룹은 **3개**(Active / Done / Closed)이고, **Not Started는 ClickApp으로 켜는 네 번째**다. 우리는 **4개를 항상 켠 상태로 고정한다** — 단일 사용자 앱에서 "상태 그룹을 켜는 토글"은 그 자체가 결정 부담이고, `inbox`가 이미 시작 전 상태로 존재하므로(§5 M2) 끌 이유가 없다. **ClickUp과 다른 곳이므로 여기 적어둔다.**

[Manage task statuses]: https://help.clickup.com/hc/en-us/articles/6309452618647-Manage-task-statuses

### D8. Space `type`을 버리고 **템플릿**으로 대체한다

§1.2의 세 분류를 전부 없앤다. Space는 종류를 갖지 않는다 — **어떻게 시작했는지**만 다르다.

- Space 생성 시 템플릿 선택 (빈 Space / 프로젝트 / 학습 / 영역)
- 템플릿은 초기 List·Status·뷰를 만들고 **그걸로 끝난다.** 이후 Space에 흔적을 남기지 않는다
- 기존 `spaceTypeConfig.ts`의 프리셋 문구는 템플릿 정의로 이사한다

> 종류를 저장하면 분기가 영원히 남는다. 템플릿은 한 번 쓰고 사라진다.

### D9. 노트·활동을 **동기화 컬렉션으로 승격한다**

§1.3의 위험을 여기서 끝낸다.

- `SpaceNote` → `notes` 컬렉션 (Supabase 테이블 + `collectionTables` + `optionalRemoteTables`)
- `SpaceActivity` → `activity` 컬렉션. `CLICKUP_IMPORT_DESIGN.md` W3의 Activity 뷰와 같은 저장소를 쓴다
- `SpaceCustomConfig` → Space 레코드 안으로 흡수 (별도 컬렉션 불필요)

---

## 4. 데이터 모델

```ts
// ── 컨테이너 ────────────────────────────────────────────
type Space = {
  id: string;                    // 기존 Project.id 보존 (D1)
  name: string;
  description: string;
  color: string;                 // 캘린더와 공유 (SPACES_BOARD_DESIGN D1 유지)
  icon?: string;
  statuses: Status[];            // D7
  features?: Record<string, boolean>;   // ClickApps 상속 (CLICKUP_IMPORT §3 P2)
  // 리스트 계층을 트리에 드러낼지. 두 번째 List가 생기면 true가 되고
  // 되돌아가지 않는다 — 한 방향 (SPACES_CLICKUP_UI_DESIGN.md U2).
  listsRevealed?: boolean;
  pinned?: boolean;
  order: number;
  archivedAt?: string;
  createdAt: string; updatedAt: string;
};

type Folder = {                  // D4 — 선택적
  id: string; spaceId: string;
  name: string; order: number;
  archivedAt?: string;
  createdAt: string; updatedAt: string;
};

type List = {
  id: string;
  spaceId: string;               // 항상 채운다 — Folder 유무와 무관하게 Space를 안다
  folderId?: string;             // 없으면 Folderless (D4)
  name: string; order: number;
  isDefault: boolean;            // D5 — 삭제 불가
  statuses?: Status[];           // 없으면 Space 상속 (D7)
  archivedAt?: string;
  createdAt: string; updatedAt: string;
};

// ── 아이템 ──────────────────────────────────────────────
Task.listId: string;             // D6 — 유일한 소속 경로
Task.statusId: string;           // D7 — 문자열 enum을 대체
LearningPath.listId: string;     // D3 — 목표도 List에 산다

// ── 사용자 콘텐츠 ───────────────────────────────────────
Note   { id; spaceId; listId?; title; body; tags; ... }    // D9
Activity { id; spaceId; type; ...; createdAt }             // D9
```

`spaceId`를 `List`에 **중복 저장하는 것**이 의도적이다. Folder를 거쳐야만 Space를 알 수 있으면 모든 조회가 2단 조인이 되고, Folderless List는 그마저 불가능하다.

### Supabase

`004_learning_paths.sql`을 복사해 4개. 전부 `id / user_id / data jsonb` 균일 형태:

```
005_folders.sql   006_lists.sql   007_notes.sql   008_activity.sql
```

`collectionTables`에 4줄, `optionalRemoteTables`에 4줄. **필드 추가는 마이그레이션이 아예 없다** (`CLICKUP_IMPORT_DESIGN.md` §6).

---

## 5. 마이그레이션 — 가장 위험한 부분

`plannerDataMigration.ts` · `legacyLocalSpaces.ts`에 선례가 있고 테스트도 있다. 같은 자리에 붙인다.

### M0. 전방 호환 릴리스 — **M2보다 먼저 나가야 한다** (2026-08-15 추가)

> M1을 끝내고 다음 순서를 짜다 발견했다. 초판에는 없던 항목이고, **없으면 M3가 조용히 데이터를 지운다.**

정규화 함수가 전부 **화이트리스트**다. 아는 필드만 골라 새 객체를 만들고, 나머지는 버린다:

```
usePlannerData.ts  normalizeTask()        → return { id, title, …, projectId, … }
learningPaths/store.ts  sanitizeLearningPath() → return { id, goal, …, projectId, … }
```

그리고 `normalizeData`는 **바깥에서 들어오는 모든 데이터**가 지나는 관문이다 — Supabase 로드, localStorage 읽기, 가져오기 전부.

**따라서 새 필드는 구 버전 클라이언트를 만나면 사라진다:**

```
새 기기(신버전)   task.listId = "list-3"  저장
구 기기(v0.5.3)   그 태스크를 읽음 → normalizeTask가 listId를 버림 → 저장
계정              listId 소멸. 태스크가 어느 List에도 속하지 않게 된다
```

기기 두 대의 버전이 어긋난 동안 새 기기가 쓴 소속을 구 기기가 되돌린다. 자동 업데이터가 있어 창은 좁지만 **실패가 무음**이라 알아차릴 방법이 없다.

> **M1이 안전했던 것은 우연이 아니다.** 새 *컬렉션*(`space_notes`)을 추가했기 때문이다 — 구 클라이언트는 모르는 테이블을 건드리지 않는다. M3은 `Task`에 *필드*를 더하므로 이 보호가 없다.

**해야 할 것 — 두 가지를 함께**

1. **정규화기를 통과형으로 바꾼다.** 원본을 먼저 펼치고 아는 필드로 덮어쓴다:
   ```ts
   return { ...task, id: …, status: oneOf(…), … };
   ```
   상태 마이그레이션 같은 기존 보정은 나중에 덮어쓰므로 그대로 살아 있고, 모르는 필드만 보존된다. `Task` · `Project` · `Subtask` · `FocusSession` · `LearningPath` 전부.

2. **가능하면 필드가 아니라 컬렉션을 고른다.** M1이 안전했던 이유이고, 앞으로도 기본 선택지여야 한다.

**그리고 이건 릴리스 하나를 혼자 나가야 한다.** 통과형 정규화기는 *그 코드를 가진 클라이언트*만 보호한다. 이미 나가 있는 v0.5.3은 계속 필드를 버리므로, **M0이 배포되고 사용 중인 기기에 퍼진 뒤에야** M2~M5를 시작할 수 있다.

이 제약은 `CLICKUP_IMPORT_DESIGN.md`에도 그대로 적용된다 — W1.4 커스텀 필드(`Task.customFields`)와 §9-3의 `Task.todayBucket`이 같은 함정 위에 있다.

### M1. 노트 구조 — **먼저, 단독으로** — ✅ 완료 (2026-08-15)

§1.3 때문에 다른 무엇보다 먼저 했다. 구현하며 계획에서 두 곳이 바뀌었다.

**한 것**

- `PlannerData.spaceNotes` 신설 → `collectionTables` + `optionalRemoteTables` + `005_space_notes.sql`
- 노트 CRUD가 `useSpaceHubData` → `usePlannerData`로 이사. 순수 연산은 `lib/spaces/spaceNotes.ts`
- 드레인은 `lib/spaces/legacySpaceNotes.ts` — `legacyLocalSpaces.ts`와 같은 모양(마커 키, id 기준 병합, 손상된 blob 무시)
- 내보내기·가져오기가 `normalizeData`를 거치므로 백업에도 자동 포함

**계획에서 바뀐 것 1 — `activity`는 옮기지 않는다**

초판은 `notes` / `activity` 둘 다 컬렉션으로 올린다고 적었다. **코드를 보니 activity를 쓰는 곳이 없다.** `deriveSpaceActivities`(`spaceSelectors.ts:206`)가 태스크·세션·노트에서 타임라인을 만들고, 저장된 activity는 구버전 잔재로 얹히기만 한다.

→ **노트가 동기화되는 순간 타임라인은 저절로 모든 기기에서 맞는다** — 입력이 전부 동기화되므로. 아무도 쓰지 않는 테이블에 동기화를 붙이는 것은 이 문서가 §1.6에서 비판한 유령 테이블을 하나 더 만드는 일이다.

**계획에서 바뀐 것 2 — `-conflict` 규칙은 과설계였다**

초판은 "같은 id가 다른 내용을 가질 수 있으니 둘 다 남긴다"고 적었다. **그 상황이 생길 수 없다.** 노트 id는 `snote-{timestamp}-{random}`으로 기기에서 독립 생성되므로, 두 기기의 노트는 **애초에 id가 다르다.** 따라서 id 기준 병합은 충돌이 아니라 합집합이고, 양쪽 노트가 모두 살아남는다.

같은 id의 재등장은 한 가지 경우뿐이다 — 마커 기록이 실패해 같은 기기가 다시 읽는 것. 이때는 이미 채택된 사본을 남기는 게 정답이며, `adoptLegacySpaceNotes`가 그렇게 한다.

**원본은 지우지 않는다.** blob의 `notes` 키를 손대지 않은 채 되쓴다(`useSpaceHubData`의 `legacyNotes` 통과 저장) — 마커는 planner 데이터가 저장된 **뒤에만** 찍히므로, 첫 실행이 실패해도 원본이 남아 있어야 한다.

**검증:** typecheck 통과 · 테스트 37파일 389개 통과(신규 19개) · 프로덕션 빌드 성공.

### M2. Project → Space

id 보존이므로 필드 채우기뿐이다. `statuses`는 현행 `TaskStatus`의 기본 프리셋:

| 현행 | Status | group |
|---|---|---|
| `inbox` | Inbox | notStarted |
| `todo` | To Do | active |
| `waiting` | Waiting | active |
| `done` | Done | done |
| `archived` | Archived | closed |

### M3. 기본 List 생성 + Item 재소속

- Space마다 `List("Tasks", isDefault: true)` 생성
- `task.projectId → task.listId = 해당 Space의 기본 List`
- `projectId`가 빈 태스크 → **"Inbox" Space의 기본 List** (새로 만든다). 고아를 만들지 않는다
- `LearningPath.projectId` + `boardListId` → `listId`

### M4. boardLists → Status

Space의 `statuses`에 boardList 이름을 `group: "active"`로 추가. 목표의 `boardListId`는 `statusId`가 된다.

### M5. 태그 정리

`space:<id>` · `group:<label>` 태그 제거. **M3이 소속을 이미 옮긴 뒤에만** 실행한다 — 순서가 뒤집히면 태그로만 연결된 태스크가 고아가 된다.

> **M1~M5는 순서가 강제된다.** 각각 테스트를 붙이고, 되돌리기(export)를 먼저 안내한다.

---

## 6. Phase

세 문서(`CLICKUP_IMPORT_DESIGN` · 이 문서 · `SPACES_CLICKUP_UI_DESIGN`)가 각자 Phase를 갖고 있고 서로 얽힌다. 통합 순서는 아래가 정본이다.

```
P0  선행       node 복구 ✅(20.20.2) · main 정리 · 전체 내보내기 안내
P1  M1  ✅완료  노트 동기화 승격  ← 단독 릴리스. 재설계와 분리해도 가치가 있다
P1.5 M0        전방 호환 릴리스 (§5 M0)  ← 신규. 단독으로 나가고 퍼져야 한다
P2  독립 기능   의존성 + blocked 파생 강등 + 죽은 필드 정리
                (CLICKUP_IMPORT W2.2·W2.3·W2.7 — 모델과 무관하고, 뷰 필터의 재료가 된다)
P3  모델        Space/Folder/List 타입 + 006~008 + collectionTables
P4  M2~M5      데이터 이관 (테스트 우선)
P5  스파인      Item 투영 → ViewSpec (CLICKUP_IMPORT W1)
P6  UI          U-1 라우팅 → U-2 트리 → U-3 뷰 셸 → U-4 탭 이관
P7  Status      D7 + U-5
P8  정리        SpaceHorizons.tsx 삭제 · 진단 카드 삭제 (U-7)
```

**순서의 근거 세 가지**

- **P1.5가 P4 앞에 있어야 하는 이유**는 §5 M0. 통과형 정규화기가 퍼지기 전에 `Task.listId`를 쓰면 구 클라이언트가 지운다
- **P5(스파인)가 P4 뒤인 이유**: Item 투영은 지금 `task.projectId`를 읽는다. 모델 이관 전에 만들면 이관 때 다시 고쳐야 한다. **최종 모델 위에 한 번만 짓는다**
- **태그 편집기(W2.1)는 P2에 넣지 않는다.** D6이 `space:`/`group:` 태그를 없애면 예약 접두사 보호 장치 자체가 불필요해진다 — 지금 만들면 버릴 코드를 만드는 것이다. **P4 이후로 미룬다**

**P1은 나머지와 독립이다.** 재설계를 안 하기로 해도 §1.3은 고쳐야 한다.

---

## 7. 하지 않을 것

| | 이유 |
|---|---|
| Workspace 계층 | 계정이 하나다. Space가 최상위 |
| 권한 · 게스트 · 멤버 | 단일 사용자 |
| Folder 안의 Folder (Subfolder) | **정정 (2026-08-14, 확인 후).** 초판은 "ClickUp도 안 한다"고 적었는데 **틀렸다** — ClickUp에는 Subfolder가 있다(한 단계: Space→Folder→Subfolder→List). **결론은 유지하되 근거를 바꾼다:** ClickUp이 안 해서가 아니라, 단일 사용자에게 4단계는 "어디에 넣지"를 한 번 더 묻는 것이기 때문이다. 필요해지면 ClickUp에 선례가 있으니 열 수 있다 |
| `Project.id` 재발급 | D1 — 참조가 전부 깨진다 |
| 유령 테이블 5개 정리 | §1.6. 이 문서 범위 밖이지만 `task_templates`는 템플릿 기능에서 재사용 검토 |

---

## 8. [불명] · 숙제

1. **ClickUp 실제 화면·ClickApps 목록·상태 그룹 이름** — 확인하지 않았다
2. **Item이 여러 List에 속할 수 있는가** — ClickUp의 "Tasks in Multiple Lists"에 대응. D6은 단일 소속으로 못박았다. 다중 소속은 `listId: string[]`로 확장 가능하나 **모든 조회가 바뀌므로** 별도 결정
3. **`SpaceCustomConfig`의 `pinnedNextActionTaskId`** — Space 레코드로 흡수할 때 유지할지 미결
4. **AI 브리핑(`buildSpaceBriefing`)** — 파생 `Space.status`/`aiPriority`를 입력으로 쓴다. 그것들을 버리면 브리핑 입력을 다시 정의해야 한다. **P4의 숨은 작업**
5. **캘린더 카테고리와 Space 색** — `projectCategoryId`가 `Project.id`를 쓴다. D1의 id 보존으로 지금은 안전하지만, List 수준 색을 도입하면 다시 문제
