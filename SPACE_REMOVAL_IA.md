# Space 제거 후의 IA

- 작성일: 2026-08-20
- 상태: **결정 확정. 이관은 착수 전.**
- 선행 문서: `SPACES_REDESIGN_II.md`(Space 도입), `TICKTICK_NAV_SHELL_PHASE0_AUDIT.md`(D-14 SpaceHub 모드), `TICKTICK_STYLE_..._v16_E2E_IMPLEMENTATION_PLAN.md` §1.5 · §1.14

---

## 0. 이 문서가 있는 이유

Space를 없애자는 이야기가 나왔을 때 첫 반응은 "Gantt만 빼면 나머지는 원래 있으니까"였다. 코드를 재보니 **정반대였다.** Gantt는 이미 Tasks Module에 있고([`TasksModule.tsx:619`](src/components/tasks/TasksModule.tsx:619)가 Space 화면과 **같은** `TaskGanttView`를 렌더한다), 갈 곳이 없는 것은 Goals·Overview·Archive와 — 화면 항목이 아니라서 눈에 띄지 않던 — **Project 관리·Folder 관리·status 편집** 셋이었다.

그래서 순서를 뒤집는다. 화면을 지우고 남은 것을 수습하는 게 아니라, **집 없는 것들에게 집을 정해준 뒤 빈 화면을 지운다.** 이 문서는 그 "집"을 확정한다. 코드는 아직 한 줄도 옮기지 않았다.

## 1. 지금 상태

Space는 **감춰졌고 지워지지 않았다.**

- [`shouldRevealSpaces`](src/domain/spaces/spaces.ts)가 활성 작업영역이 하나뿐이면 트리에서 그 단계를 그리지 않는다. U2(`shouldRevealLists`)를 한 단계 위에 적용한 것이다.
- 레코드·`supabase/migrations/008_spaces.sql`·`Project.spaceId`는 전부 그대로다. **M0 계약**(이 빌드가 모르는 것을 지우지 않는다) 때문이며, 이 문서의 어떤 단계도 이 계약을 깨지 않는다.
- 같은 작업에서 List의 주소가 하나로 합쳐졌다: 트리의 List 행도 [`listUrlFor`](src/app/taskScopeUrl.ts)를 거쳐 `/list/:id`를 연다. `/s/:sp/p/:pj/l/:id`는 옛 링크가 열리는 주소로만 남았다.

## 2. 제약 — 이미 정해져 있어서 다시 정할 수 없는 것

| # | 제약 | 출처 |
|---|---|---|
| C-1 | **Project·Goals·Archive는 Rail 항목이 될 수 없다.** Rail이 화면 하나당 한 줄씩 늘면 그것은 세로로 그린 평면 사이드바다. | §1.5, [`GlobalRail.tsx`](src/components/shell/GlobalRail.tsx) 머리말 |
| C-2 | **Presentation IA는 도메인 사다리가 아니다.** 사용자에게 보이는 구조는 `Space > Project > Folder > List`가 아니라 스마트 리스트·그룹·리스트·태그·필터다. | §1.14 |
| C-3 | **status는 Project가 소유하고 아래로 상속된다.** 그래서 편집 대상은 언제나 **하나의** Project다. | D7, [`membership.ts`](src/domain/spaces/membership.ts) `statusesWithCustom` |
| C-4 | **status 편집의 목적지는 이미 TODO로 적혀 있다.** *"Status editing lands properly in Space settings (§3, step U-5)"* — 여기서 Space는 레거시 이름이고 실제로는 Project다. | [`SpaceViewTools.tsx:9`](src/components/spaces/SpaceViewTools.tsx:9) |
| C-5 | **전역 Goals 화면은 한 번 철거된 적이 있다.** 사유는 *"그 화면이 팔던 관점이 cross-Space인데 scope는 자기 goal만 보여준다"*였다. **Space가 사라지면 이 사유의 전제가 사라진다** — 그래서 D-4는 철거된 것을 되살리는 게 아니라, 철거 사유가 소멸한 뒤에 다시 묻는 것이다. | [`spaceNav.ts:44`](src/domain/view/spaceNav.ts:44), v0.10.0 |
| C-6 | 코드는 이 화면을 **이미 `projects`라고 부른다.** `PAGE_ROUTES.projects`의 **값**만 `/spaces`다. | [`pageRoute.ts:35`](src/app/pageRoute.ts:35) |

## 3. 결정

### D-1 — Projects는 도어 한 줄 + `/projects` 화면이다

지금의 `Spaces` 행이 그대로 이어받고, 이름과 주소만 바뀐다. C-1이 Rail을 막고 C-2가 사이드바에 목록을 펼치는 것을 막으므로, **문 하나**가 남는 답이다. 트리를 사이드바에 들이지 않는다는 판단은 Nav Shell 감사가 이미 한 번 내렸고(*"트리를 가져오는 것이 아니라 문만 두는 것이다"*), 여기서 뒤집을 이유가 새로 생기지 않았다.

`/spaces`와 `/s/...`는 `RETIRED_ROUTES`로 리다이렉트한다. 이 장치는 `/archive`를 위해 이미 존재한다.

C-6 때문에 이 변경은 개명이 아니라 **주소를 이름에 맞추는 일**이다.

### D-2 — Folder 관리는 Project 내부다

도메인 Folder는 Project 안의 그룹이다(`Folder.projectId`). 관리 위치가 소유자와 다른 화면에 있을 이유가 없다. Tasks 사이드바의 그룹(`SidebarFolder`)과는 **다른 것**이며, 이 결정은 그 둘을 합치지 않는다 — 합치는 순간 §12.4의 `folderIdFor`가 답하던 "이 List가 어느 그룹에 속하는가"가 두 개의 답을 갖게 된다.

### D-3 — status 편집은 한 패널, 두 입구다

C-3이 편집 대상을 하나의 Project로 고정하므로, 패널은 하나다. 입구는 둘:

- Project 화면의 Board 뷰
- 전역 Matrix — **scope 선택기가 Project를 가리킬 때만**. `All`에서는 입구가 없다. [`BoardPage.tsx`](src/components/BoardPage.tsx)가 이미 `ALL_PROJECTS`에서 `DEFAULT_STATUSES`로 떨어지는데, 고칠 대상이 없는 화면에 편집 버튼을 두는 것은 그 정직함을 버리는 일이다.

직전 커밋의 ContextMenu가 같은 형태다 — 하나의 컴포넌트, 세 개의 입구. 비슷하게 생긴 패널 두 벌이 어떻게 갈라지는지는 그 커밋 메시지가 적어놓았다.

### D-4 — Goals는 Tasks 사이드바의 도어 + 전역 화면이다

Projects와 나란한 문 한 줄, 그리고 그 뒤의 전역 Goals 화면. 목표는 프로젝트 **밖에서** 태어난다 — 메모에 남은 장기 비전(막힘 → 목표 → 프로젝트화 → 정보수집 → 계획 → 실행)이 요구하는 방향이 그것이고, 목표를 Project 탭 안에 두면 "프로젝트가 먼저 있어야 목표를 적을 수 있다"가 되어 루프의 입구가 막힌다.

C-5가 걸리지만 그 사유는 소멸한다. 다만 **되살리는 것이 아니라 다시 만드는 것**임을 분명히 한다: 철거된 Horizons는 다섯 개의 시간 칼럼이라는 프레임이 본체였고, 여기서 필요한 것은 목표의 목록과 그 상태다.

### D-5 — Overview는 Project의 첫 탭으로 남고, Archive는 Projects 화면의 보관 목록이 된다 (잠정)

둘 다 오늘 명시적으로 정하지 않았고, 다른 답이 없어 보여서 기본값으로 적어둔다. **이의가 없으면 확정**이며, 있으면 §6으로 내린다.

Archive를 Projects 화면에 두는 것은 D-20이 한 판단(보관된 Project는 그것을 소유한 곳에서 관리한다)의 연장이다. 소유자가 Space에서 Projects 화면으로 바뀔 뿐이다.

### D-6 — 작업영역(Space 레코드)은 감추되 지우지 않는다

M0 계약. 클라이언트가 지우면 다른 기기가 다시 밀어 올리거나, 반대로 그 기기의 데이터를 이쪽이 지운다. **읽지 않는 것과 지우는 것은 위험이 다르다.** `spaces` 테이블과 `Project.spaceId`는 남고, 화면에서만 사라진다.

## 4. 확정된 IA

```text
Rail          Tasks · Matrix · Calendar · Focus · (Search) · Settings      C-1: 변동 없음

Tasks 사이드바                                                             C-2: Presentation IA
  오늘 · 다음 7일 · 기본함
  Lists            그룹 ├ 리스트
  Projects ─────────────────────┐   도어 (D-1)
  Goals ────────────────────────┼─┐ 도어 (D-4)
  태그 · 필터                    │ │
  완료 · 안 함 · 휴지통           │ │
                                │ │
Projects   /projects  ←─────────┘ │
  프로젝트 목록 · 만들기 · 이름 · 보관 · 핀
  보관된 프로젝트                    (D-5 잠정)
                                   │
  Project   /p/:id                 │
    Overview                       │   (D-5 잠정)
    List · Board · Gantt · Calendar│
    Folders 관리                   │   (D-2)
    Board 설정 → status 편집 ──────┼── 같은 패널을 전역 Matrix도 연다 (D-3)
                                   │
Goals      /goals     ←────────────┘   (D-4)
```

## 5. 이관 순서

각 단계는 **그 단계만으로 앱이 온전해야** 한다. 중간 상태에서 갈 곳 없는 기능이 생기면 순서가 틀린 것이다.

| 단계 | 하는 일 | 완료 조건 |
|---|---|---|
| 1 | `/spaces` → `/projects`, 도어 행 이름 변경, 리다이렉트 | 옛 주소가 새 주소로 열리고, 사이드바가 `Projects`라 부른다 |
| 2 | Project 만들기·이름·보관·핀을 `/projects` 화면으로 | 트리 없이도 Project를 만들 수 있다 |
| 3 | Folder 관리를 Project 화면 안으로 (D-2) | 트리 없이도 Folder를 만들고 이름을 바꿀 수 있다 |
| 4 | status 편집 패널을 분리하고 두 입구를 붙인다 (D-3) | Matrix가 `All`이 아닐 때 자기 컬럼을 고칠 수 있다 |
| 5 | Goals를 `/goals`로 (D-4) | Project 없이 목표를 적을 수 있다 |
| 6 | 남은 Space 화면·트리 철거 | `components/spaces`·`SpaceTree`·`SpaceSidebar`·`mode="space"`가 사라지고, 아무 화면도 잃지 않았다 |

1~4는 서로 독립이라 순서를 바꿔도 된다. **5는 6보다 반드시 먼저**다 — 그 반대로 하면 목표가 갈 곳 없이 사라지는 창이 열린다.

## 6. 아직 정하지 않은 것 — 이 넷으로 확정 (2026-08-20)

미결의 **범위**를 여기서 닫는다. 아래 넷 말고 열린 것은 없으며, 이관 중에 새 질문이 생기면 그것은 이 문서를 고쳐야 한다는 신호지 조용히 §6에 덧붙일 항목이 아니다. 각 항목은 그것을 필요로 하는 단계(§5)에 닿기 전까지 열려 있어도 된다.

- **전역 Goals 화면이 Task도 함께 그리는가.** 지금 Space의 list 뷰는 `sources: ["task", "goal"]`([`spaceViews.ts:44`](src/domain/view/spaceViews.ts:44))라 둘을 같이 그린다. Tasks Module의 리스트는 Task만 그린다. `/goals`가 어느 쪽인지는 D-4가 답하지 않는다.
- **Project별 Calendar 탭의 운명.** 전역 Calendar 모듈은 있고, Tasks Module에는 Scope 단위 캘린더 렌더러가 없다(§13.9). Project 화면이 사라질 때 이 뷰가 어디로 가는지는 미정.
- **D-5**(Overview·Archive)에 이의가 있는가.
- **`Project.spaceId`를 언제 읽지 않게 되는가.** D-6이 지우지 않기로 했을 뿐, 마지막 독자가 사라지는 시점은 6단계에서 정해진다.

## 7. 이 문서를 무효화하는 것

- C-5의 전제가 다시 살아나는 경우 — 즉 작업영역이 다시 사용자에게 보이게 되면 D-4를 다시 묻는다.
- Goals가 Task와 같은 레코드가 되는 경우. §26·§27.2가 *"Goal은 Task를 다르게 읽은 것이 아니라 자기 Source of Truth를 가진 다른 레코드"*라고 말하는 한 D-4는 유효하다.
