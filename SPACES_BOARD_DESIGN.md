# Spaces → Board 설계 (레퍼런스: Timestripe)

- 작성일: 2026-08-14
- 기준: `v0.5.2` (`0060c49`), 브랜치 `fix/store-write-amplification`
- 선행 문서: `HORIZONS_DESIGN.md` (시간 축), `CALENDAR_APPLE_DESIGN.md` (색·형태 언어)
- 대상: `src/components/SpacesPage.tsx` + `src/components/spaces/**`

---

## 0. 레퍼런스의 범위 — 다시 정직하게

> **정정 (2026-08-14, 조사 후).** 이 절은 조사 없이 쓴 것이고 **틀린 데가 있다.**
> Timestripe의 Board는 생활 영역이 아니라 목표를 담는 리스트/DB이고, 색은
> 보드 정체성이 아니라 지평에 걸친 목표 사이의 관계 표시다. `TIMESTRIPE_REFERENCE.md`가
> 정본이며, 아래 §2 D1/D9의 **결론은 유지하되 근거가 바뀌었다** — 자세한 건
> `TIMESTRIPE_REFERENCE.md` §4. 앞으로 "Timestripe가 그러니까"를 근거로 쓰려면
> 그 문서의 [확인]/[교차] 항목이어야 한다.

`HORIZONS_DESIGN.md` §0과 같은 태도를 유지한다. Timestripe에서 **확신하는 것은 두 축의 관계** 하나다:

- **Board = 영역 축**(건강, 커리어 …), **Horizon = 시간 축**(Day…Life)
- 목표 하나가 **두 축에 동시에** 존재한다 — 보드에서도 보이고, 지평에서도 보인다
- **색은 Board가 준다.** 지평은 색을 갖지 않는다
- 두 축은 별개 기능이 아니라 **같은 컬렉션의 두 뷰**다

확신하지 못하는 것: 보드별 정확한 메뉴 구성, climate 같은 부가 개념의 경계, 유료 기능 구분. 그러니 이 문서도 **화면 복제가 아니라 두 축 관계의 이식**이다.

---

## 1. 진단 — 두 화면이 서로의 결여다

|  | 시간 축 | 영역 축 | 목표가 1급인가 |
|---|---|---|---|
| Horizons (신규) | 5칼럼 ✔ | **없음** — 모든 보드가 한 칼럼에 섞임 | ✔ |
| Spaces (기존) | **없음** | 카드 목록 ✔ | ✘ |

Spaces 카드의 주인공은 목표가 아니라 **파생된 진단**이다 — `status` / `aiPriority` / `mainSignal` / `deriveSignals` (`SpacesPage.tsx:964-991`). Timestripe 보드의 주인공은 목표다.

> **그래서 이 작업은 "Spaces 페이지 재디자인"이 아니라 "두 축을 잇는 일"이다.**

---

## 2. 확정 결정

### D1. Board = **Project**다. Space는 Board가 아니라 Board의 상세 화면이다

`HORIZONS_DESIGN.md` D9는 "Board = 기존 Space"라고 적었고 `horizonItems.ts:33` 주석도 "owned by the Space"라고 되어 있다. **코드는 그렇게 동작하지 않는다:**

```
HorizonsPage.tsx:66   colorByProjectId = new Map(projects.map(p => [p.id, p.color]))
SpacesPage.tsx:982    color: project.color
```

둘 다 `Project.color`를 읽는다. `Space`는 `SpacesPage.tsx:22`의 **페이지 지역 타입**이고 Project·StudyTopic·local 세 소스에서 파생된 뷰다 — 저장 레코드가 아니다.

→ **Board = `Project`로 확정.** 색 언어는 이미 일치하므로 코드 변경 없이 문서·주석만 정정한다. HORIZONS_DESIGN D9의 "Space가 소유"는 이 문서 D1로 대체된다.

### D2. Space 상세에 지평 축을 넣는다 — 이 방향의 핵심 한 수

보드 하나의 목표를 Life→Day 5행으로 상세 화면에 얹는다. 이 순간 Space가 Timestripe 보드가 된다.

- **새 저장소 0개.** `buildHorizonItems()`가 이미 모든 재료를 만든다
- 지평 행은 **파생**이다 (HORIZONS_DESIGN D2 그대로 — 지평은 저장하지 않는다)
- Horizons 페이지와 **같은 카드**를 쓴다 (D7의 균일성이 화면을 건너도 유지되어야 한다)

### D3. `HorizonItem`에 `boardId`를 추가한다 — 색만으로는 필터할 수 없다

`HorizonItem`은 `color`는 갖지만 **출처 보드 id를 갖지 않는다.** 색으로 필터하면 두 보드가 같은 색일 때 섞인다.

→ `boardId?: string` 추가. **색과 정확히 같은 규칙으로** 채운다:

| 항목 | boardId |
|---|---|
| path | `path.projectId` |
| milestone | 소속 path의 `projectId` |
| task (마일스톤 연결됨) | **연결된 path의 `projectId`** |
| task (연결 없음) | `task.projectId` |

연결된 태스크가 자기 `projectId`가 아니라 **목표의 보드**를 따르는 것이 중요하다. 색이 이미 그렇게 동작하고(`link?.color ?? colorFor(task.projectId)`), 색과 보드가 어긋나면 "파란 카드가 초록 보드에 있는" 상태가 된다.

### D4. 읽기 순서는 Life → Day, 페이지와 같다

`HORIZONS.md`의 `HORIZONS` 상수 순서(`life…day`)를 그대로 쓴다. 상세에서는 칼럼이 아니라 **행**이지만 순서를 뒤집지 않는다 — 같은 데이터가 화면마다 다른 순서로 나오면 두 축이 한 모델이라는 인상이 깨진다.

### D5. 빈 지평 행은 접는다 — 페이지와 다른 유일한 점

Horizons 페이지는 빈 칼럼도 그린다(5칼럼 조망이 목적이므로 D8). 상세는 목적이 다르다 — **이 보드가 지금 어디에 있는가**를 보는 곳이고, 대부분의 보드는 5지평 중 2~3개만 채운다. 빈 행 3개는 조망이 아니라 여백이다.

→ 항목이 있는 지평만 렌더. 전부 비었을 때만 안내 한 줄.

### D6. 지금 하지 않는 것 — 상세에서의 드래그

페이지에는 지평 간 드래그가 있다(Phase 3). 상세의 행에는 **넣지 않는다.** 행은 좁고, 같은 제스처가 두 화면에서 다른 히트박스를 갖는 것보다 한 화면에만 있는 게 낫다. 체크와 열기는 된다.

---

## 3. Phase 계획

**순서 규칙은 HORIZONS_DESIGN과 같다 — 새것이 동작한 뒤에 옛것을 지운다.**

### Phase S2 — Space 상세에 지평 축 (저장 구조 변경 없음) — **완료 (2026-08-14)**

| # | 작업 | 결과 |
|---|---|---|
| S2.1 | `HorizonItem.boardId` + `itemsForBoard()` 순수 함수 + 테스트 (D3) | 완료, 신규 테스트 3개 |
| S2.2 | `SpaceHorizons` 컴포넌트 — 지평 행 렌더 (D2/D4/D5) | 완료 |
| S2.3 | `paths`를 SpacesPage → SpaceDetailView → Overview로 배선 | 완료 |
| S2.4 | i18n (en/ko) | 완료 |
| S2.5 | **보드에 목표를 붙이는 수단** — 설계에 없었음, §3-A 참조 | 추가 |

### 3-A. S2에서 설계가 어긋난 곳 (구현 중 정정)

**1. 목표에 보드를 붙일 방법이 아예 없었다 — D2의 절반이 죽어 있었다.**

`LearningPath.projectId`는 타입에도 있고 `createLearningPath`도 받는다(`usePlannerData.ts:1503`). 그런데 **그 값을 넘기는 UI가 하나도 없다.** Horizons 페이지의 `onCreatePath`는 `{ goal, targetDate }`만 받는다. 즉 손으로 만든 목표는 전부 `projectId: undefined`이고, 보드 뷰는 **태스크만 보이고 목표는 영원히 비어 있었을 것**이다.

D3(`boardId`)까지 넣고 나서야 드러났다 — 필터는 맞는데 필터에 걸릴 데이터가 생길 수 없었다.

→ Space 상세의 지평 카드에 `+ 목표 추가`를 넣었다. 날짜 없이 만들어지므로 `life`에 앉는다(D2의 파생 규칙 그대로). **지금은 여기가 목표에 보드를 부여하는 유일한 곳이다** — 보드 안에서 만드는 목표가 그 보드에 속하는 것은 설명이 필요 없고, Horizons 페이지에 보드 선택 UI를 더하는 것보다 조용하다. Phase S3에서 페이지에 보드 필터가 생기면 그때 다시 판단한다.

**2. 태스크 드로어가 빈 채로 열릴 수 있었다.**

`SpaceDetailView`의 드로어는 `spaceTasks`(= 이 보드의 `projectId`를 가진 태스크)에서만 찾았다. 그런데 D3에 따르면 **연결된 태스크는 자기 `projectId`가 아니라 목표의 보드를 따른다.** 다른 프로젝트 소속 태스크가 이 보드의 목표에서 재료화되면, 지평 행에는 보이는데 클릭하면 드로어가 비었다.

→ `tasks` 전체로 폴백. 기존 진입 경로에서는 발생할 수 없는 상황이라 순수 추가다.

**검증 (실측, 127.0.0.1:5181 격리 오리진에 시드)**

| 확인 | 결과 |
|---|---|
| 5지평 파생 | Life 2(무기한 목표) · Year 1(+200일) · Month 1(+60일) · Week 1(+4일) · Day 1(오늘) ✔ |
| 보드 필터 | `projectId` 없는 태스크("Unrelated errand")는 어느 행에도 안 나옴 ✔ |
| 색 소유권 (D1) | 카드 배경 `#af52de 14%`, 좌측 바 `rgb(175,82,222)` = Project 색 ✔ |
| 드래그 없음 (D6) | `draggable="false"`, `cursor: default` ✔ |
| 체크 | 마일스톤 `completedAt` 기록 + 카드 `is-done` ✔ |
| `+ 목표 추가` | `projectId: "proj-hsk"` 저장, Life 행 2→3 ✔ |
| 레이아웃 | 라벨 거터 68px, 카드 217px, 가로 오버플로 없음 ✔ |
| 다크 | 카드 배경 30% 알파로 분기, 라벨은 `--text-secondary` ✔ |

`npx tsc -b` 통과, 304개 테스트 통과(신규 3개), 신규 콘솔 에러 없음(업데이터 CORS는 기존 dev 노이즈).

### Phase S4 — 소스 일원화

`localSpaces`는 **localStorage 블롭이라 동기화되지 않았다** — `HORIZONS_DESIGN` D3이 LearningPath에 대해 이미 푼 문제와 같다. 여기엔 함정이 하나 더 있었다: local space는 Project가 아니라서 **보드가 될 수 없다.** 색도 목표도 붙을 데가 없다.

#### S4a — 로컬 블롭 승격 — **완료 (2026-08-14)**

| # | 작업 | 결과 |
|---|---|---|
| S4a.1 | `lib/spaces/legacyLocalSpaces.ts` — 일방향 드레인 + 테스트 6개 | 완료 |
| S4a.2 | `usePlannerData`에서 로드 시 채택(id 병합) | 완료 |
| S4a.3 | `SpacesPage`에서 로컬 상태·저장·핀 블롭 제거 | 완료 |
| S4a.4 | `custom` 생성 경로가 `area` Project를 만들도록 | 완료 |
| S4a.5 | `inferProjectType`이 명시적 `area`를 존중 | 완료 |

**매핑:** custom space → `type: "area"` Project. `area`는 "마감 있는 결과물"이 아니라 **상시 영역**이고, custom space가 정확히 그것이었다. `objective`와 사용자가 직접 적은 섹션은 Project에 대응 필드가 없어 `notes`로 접어 넣는다 — **마이그레이션이 사용자의 글을 잃는 일이 되어서는 안 된다.** 생성 시 기본으로 깔리던 세 섹션(`Notes`/`Tasks`/`Activity`)은 사용자의 글이 아니므로 버린다. 핀은 `Project.pinned`로 간다(이전엔 핀조차 기기에 갇혀 있었다).

#### 4-A. S4a에서 나온 결함 1건 — **마이그레이션이 데이터를 잃을 뻔했다**

`readStorage()`는 저장된 planner 데이터가 없을 때 `emptyData()`를 **`adoptLoadedData()`를 거치지 않고** 그대로 돌려줬다. 그런데 레거시 블롭은 **다른 키**에 산다. 즉 "planner 데이터 없음"이 "마이그레이션할 것 없음"을 뜻하지 않는데, 드레인은 건너뛰면서 마커는 `useEffect`에서 그대로 찍혔다 — **다음 실행부터는 영영 읽지 않는다.** 실측에서 정확히 이 순서로 재현됐다(마커 `"1"`, projects `[]`).

→ `adoptLoadedData(emptyData())`로 고쳤다. **같은 구멍이 `HORIZONS_DESIGN` Phase 2의 LearningPath 드레인에도 있었고** 이 수정으로 함께 닫혔다. 실제로 도달하기는 어렵다(앱을 한 번이라도 쓰면 appData가 생긴다) — 그래도 마이그레이션에서 "거의 안 일어난다"는 안전이 아니다.

**검증 (실측, 격리 오리진에 옛 형식 블롭을 심고 리로드)**

| 확인 | 결과 |
|---|---|
| 승격 | custom space 2개 → `type: "area"` Project 2개, 색 유지 ✔ |
| 글 보존 | `objective`("Run a 10k") + 사용자 섹션("Injuries")이 `notes`로, 기본 3종은 제외 ✔ |
| 핀 | `pinnedIds` → `Project.pinned`, 목록에서 위로 정렬 ✔ |
| 카드 라벨 | `area` → Custom 타입으로 표시(이름 추측 아님) ✔ |
| **보드가 됐는가** | 마이그레이션된 스페이스에 지평 카드 + `+ 목표 추가` 동작, 목표가 `projectId: "space-…"`로 저장, 카드가 그 스페이스 색(`#f97316`) ✔ |
| 핀 쓰기 | 동기화되는 `projects`에 기록 ✔ |
| 블롭 재기록 | 심은 값 그대로 — 아무도 더 이상 쓰지 않음(일방향) ✔ |

`npx tsc -b` 통과, 310개 테스트 통과(신규 6개), 신규 콘솔 에러 없음.

#### S4b — Study 제거 — **완료 (2026-08-14)**

**사용자 결정 (2026-08-14):** `HORIZONS_DESIGN` §5의 5가지를 **전부 함께 제거**, 개념 노트 본문은 **별도 보존 없이 삭제**. (설계문서는 export 후 삭제를 권했으나 사용자가 그냥 삭제를 선택했다. 기록해 둔다 — 되돌릴 수 없는 선택이었고, 권고와 다른 판단이었다는 사실 자체가 나중에 필요한 정보다.)

`deriveStudySpaces`가 사라지면서 **Spaces = Projects의 뷰**로 소스가 하나가 됐다. 이 문서 전체에서 가장 큰 단순화다.

**사라진 것 (28개 파일)**

| 계층 | 내용 |
|---|---|
| 페이지 | `StudyPage.tsx` 삭제, `PageId`에서 `"study"` 제거, 라우트·사이드바 배지(`dueReviewCount`) 제거 |
| Spaces | `deriveStudySpaces`, `SpaceType`의 `"study"`, 스터디 노트 시그널, `SpaceHubType`/`spaceTypePresets`의 study 프리셋 |
| 캘린더 | `study-review` 레이어, `studyReview` 토글, `studyCategoryId`, STUDY 카테고리 그룹, `CalendarGroupType`의 `"study"`, 복습 칩 CSS |
| 공유 캘린더 | `복습:` 이벤트 |
| 전역 검색 | 토픽·노트 결과 (검색 결과가 tasks/projects 둘로) |
| AI 컨텍스트 | `studyTopics`/`conceptNotes` 직렬화, `AI_CONTEXT_LIMITS.studyTopics` |
| 데이터 | `StudyTopic`·`ConceptNote`와 딸린 타입 9종, CRUD 8개, 복습 간격 스케줄러, `PlannerData`의 두 컬렉션 |
| 동기화 | `study_topics`·`concept_notes` 테이블 매핑 |
| i18n | 죽은 키 **90개** (en/ko 각각) |

**3-B. S4b에서 주의한 곳**

**1. 기존 사용자의 저장 데이터.** `focusflow.appData.v1`에는 `studyTopics`/`conceptNotes`가 들어 있다. `normalizeData`가 이제 그 키를 모르므로 **조용히 버려지고 다음 저장에서 사라진다.** 실측으로 확인했다 — 두 컬렉션을 담은 기존 데이터를 심고 리로드했을 때 tasks·projects는 그대로 살아남고 앱은 정상 렌더된다. 의도한 동작이다(사용자 결정).

**2. 원격 테이블은 건드리지 않았다.** 동기화 매핑에서만 뺐으므로 Supabase의 `study_topics`/`concept_notes` **행은 그대로 남는다.** 테이블을 실제로 DROP 하려면 별도 마이그레이션이 필요하고, 그건 되돌릴 수 없는 원격 작업이라 **하지 않았다.** 원한다면 별건으로 판단할 일이다.

**3. `spaceHub.noteType.conceptNote`는 남겼다.** 이름이 겹칠 뿐 Study의 `ConceptNote`가 아니라 Space 노트의 종류 라벨이다.

**검증 (실측)**

| 확인 | 결과 |
|---|---|
| 8개 페이지 전부 | Today·Calendar·Horizons·Planning·Spaces·Focus·Archive·Settings 모두 정상 렌더 ✔ |
| 사이드바 | Study 항목 없음 ✔ |
| 캘린더 | 태스크 칩 정상, 사이드바 그룹이 `My Calendars / Projects / External / Activity` (STUDY 없음) ✔ |
| 구버전 데이터 로드 | study 레코드를 담은 데이터에서 tasks·projects 보존, study 키만 탈락, 크래시 없음 ✔ |

`npx tsc -b` 통과, 310개 테스트 통과, 신규 콘솔 에러 없음.

### Phase S3 — ~~보드 필터~~ → **보드 축을 쓰기·읽기 가능하게** — **완료 (2026-08-14)**

> **방향 전환.** 초안은 "칼럼 위 보드 칩 줄, 순수 필터"였다. `TIMESTRIPE_REFERENCE.md`
> 조사 후 **폐기했다.** 필터는 축을 하나 접는 일이고, 한 보드로 좁히면 S2에서
> 만든 Space 상세와 같은 화면이 된다. 근거는 `TIMESTRIPE_REFERENCE.md` §4.2.
>
> 정작 필요한 건 반대였다 — **접혀 있던 축을 펴는 것.**

| # | 작업 | 결과 |
|---|---|---|
| S3.1 | Horizons에서 만든 목표에 **보드 지정** | 완료 |
| S3.2 | 목표의 **보드 변경** | 완료 |
| S3.3 | 카드에 **보드 이름** 표시 | 완료 |
| S3.4 | ~~보드 필터~~ | 폐기 |

**D13. 배지가 곧 컨트롤이다.** 카드는 어차피 보드 이름을 적어야 하고, 라벨과 별도 피커를 따로 두면 몇 줄짜리 카드의 chrome이 두 배가 된다. 그래서 `<select>` 하나가 표시와 조작을 겸한다.

**D14. 보드 배지는 목표(path)에만 붙인다.** 마일스톤·태스크는 D3에 따라 목표의 보드를 상속하고, 이미 상위 목표를 breadcrumb으로 달고 있다. 거기에 보드까지 적으면 정보가 아니라 소음이다. Space 상세에서도 배지를 숨긴다 — **지금 서 있는 보드의 이름을 알려주는 건 아무 정보가 아니다.**

**D15. 보드 없는 목표를 허용한다.** 목표는 알지만 어디 속하는지는 아직 모르는 때가 있다. 거부하는 대신 `보드 없음`으로 **보이게** 둔다 — 배지를 만든 이유 자체가 미배정 상태가 눈에 남게 하는 것이다. 카드는 기본색(`#0066cc`)으로 떨어진다.

#### 4-B. S3에서 나온 결함 1건

**다크에서 배지가 카드 속으로 사라졌다.** `.hz-card`는 다크에서 틴트를 14%→30%로 올리는 분기가 있는데, 배지를 16% 고정으로 짰다. 결과적으로 **다크에서 배지가 자기가 얹힌 카드보다 옅어졌다.** 라이트(카드 14% / 배지 16%)만 보고 판단한 탓이다.

→ 배지에도 다크 분기를 넣어 38%로. 두 테마 모두에서 카드 위로 올라온다. 미배정 배지는 투명 + 테두리라 양쪽 공통으로 묶었다.

**검증 (실측, 보드 2개 시드)**

| 확인 | 결과 |
|---|---|
| 컴포저 피커 | `보드 없음 / Health / Thesis` ✔ |
| S3.1 — 지정해서 생성 | `projectId: "p-health"` 저장, 배지 "Health", 카드가 Health 초록(`#34c759`) ✔ |
| **구멍이 닫혔는가** | 그 목표가 **Health Space의 Year 행에 등장** — 이전엔 어느 Space에도 안 나왔다 ✔ |
| S3.2 — 보드 변경 | Health→Thesis 시 저장값·카드 색(`#af52de`) 즉시 반영 ✔ |
| 보드 간 이동 | Thesis 상세에 나타나고 **Health 상세는 비었다** ✔ |
| D15 — 보드 없음 | `projectId` 해제, 배지 `No board` + 미배정 스타일, 카드 기본색 ✔ |
| 다크 | 배지 38% > 카드 30% ✔ |

`npx tsc -b` 통과, 310개 테스트 통과, 신규 콘솔 에러 없음.

### Phase S5 — 카드 주인공 교체 (선택)

`status` / `aiPriority` / `mainSignal`을 강등하고 목표 진행을 승격. **실제로 부족함을 느낀 뒤에** 한다 — 파생 진단이 쓸모없다는 증거가 아직 없다.

---

## 4. 하지 않을 것

| 항목 | 이유 |
|---|---|
| Board 레코드 신설 | 그게 Project다. 뷰는 늘리되 저장은 늘리지 않는다 (D1) |
| Space 상세에서 지평 드래그 | 같은 제스처가 화면마다 다른 히트박스를 갖는다 (D6) |
| 상세에 빈 지평 행 그리기 | 조망이 목적인 페이지와 목적이 다르다 (D5) |
| 색으로 보드 필터 | 두 보드가 같은 색이면 섞인다 (D3) |
| Horizons 페이지를 보드별로 쪼개기 | 5지평 동시 조망이 그 화면의 존재 이유다 (HORIZONS D8) |
| `status`/`aiPriority` 즉시 제거 | 쓸모없다는 증거가 없다. S5로 미룬다 |
