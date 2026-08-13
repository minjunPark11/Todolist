# Calendar 구현 결과 보고서

기준: `CALENDAR_DESIGN.md`의 Phase 1~5 전체. `codex/new_design` 브랜치에 구현 완료, 커밋 전 상태.

이 문서는 "무엇을 왜 그렇게 만들었는지"와 "실제로 무엇을 검증했는지"를 기록한다. 설계 근거는 `CALENDAR_DESIGN.md`를 참조하고, 이 문서는 결과물 자체에 집중한다.

---

## 1. 한 줄 요약

숨겨져 있던 `CalendarView`를 Google Calendar 스타일의 Week Planner로 승격했다. `scheduledDate`(작업 예정일)와 `dueDate`(마감일)를 명확히 분리해 렌더링하고, Task/Deadline/Study Review/Project Deadline을 한 화면에서 관리하며, Ollama 채팅이 이번 주 일정을 읽고 조언할 수 있게 연결했다.

## 2. 변경 파일 목록

### 신규 파일 (6개)

| 파일 | 역할 |
|---|---|
| `src/utils/calendarItems.ts` | Task/Project/ConceptNote를 `CalendarItem`으로 파생시키는 공용 모델. 캘린더 렌더링과 Ollama context가 이 함수 하나를 공유한다. |
| `src/lib/calendarContext.ts` | 이번 주 캘린더 데이터를 JSON 텍스트로 직렬화해 Ollama 프롬프트에 주입. |
| `src/components/calendar/CalendarToolbar.tsx` | 상단 툴바: 사이드바 토글, Today, ‹›, range label, 검색/도움말/설정 아이콘(placeholder), Day/Week/Month 스위처. |
| `src/components/calendar/CalendarLeftSidebar.tsx` | Create 버튼, 미니 월간 달력(일정 있는 날짜 dot 표시), 레이어 토글, 프로젝트 필터. |
| `src/components/calendar/WeekView.tsx` | Week/Day 공용 시간표 그리드. All-day row + 6AM-11PM 시간 grid + 현재시각 라인. |
| `src/components/calendar/MonthView.tsx` | 월간 뷰. 날짜 셀당 칩 최대 3개 + `+N more`. |
| `src/components/calendar/QuickCreatePopover.tsx` | 빈 슬롯/셀 클릭 시 뜨는 생성 폼. |

### 수정 파일 (10개, +1015 / -289줄)

| 파일 | 변경 내용 |
|---|---|
| `src/components/CalendarView.tsx` | 전체 재작성(489줄 diff). 기존 단일 파일 구현을 위 서브컴포넌트들을 조립하는 컨테이너로 교체. |
| `src/App.tsx` | Calendar 페이지 렌더를 새 CalendarView 시그니처에 맞게 교체, Today→Calendar / Calendar→Project / Calendar→Study 크로스 페이지 핸들러 추가, OllamaChat에 `activePage`+`calendarContext` 전달. |
| `src/hooks/usePlannerData.ts` | `normalizeTask`에 scheduledDate 마이그레이션 규칙 추가(§4 참조). |
| `src/components/TaskDetail.tsx` | Schedule 섹션 순서를 Scheduled date → Start/End → Due date로 변경, "Move to Today" 액션 추가. |
| `src/components/Sidebar.tsx` | Calendar 아이콘 + primaryNav 항목(Today 다음) 추가. |
| `src/components/TodayPage.tsx` | task more-menu에 "View in Calendar" 추가. |
| `src/components/StudyPage.tsx` | `focusNoteId`/`onFocusNoteHandled` prop 추가 — 캘린더에서 특정 노트를 열 수 있게 하는 훅. |
| `src/lib/ollama.ts` | `askOllamaChat`에 optional `contextText` 인자 추가. |
| `src/components/OllamaChat.tsx` | `activePage`/`calendarContext` prop을 받아 Calendar 페이지일 때만 context 주입. |
| `src/styles.css` | `.gcal-*` 클래스 약 660줄 추가(시간표 grid는 이전에 CSS 자체가 없었음). |

## 3. 핵심 설계 결정과 실제 구현

### 3.1 시간 필드 재정의 (D1) — 가장 중요한 변경

`Task.startTime`/`endTime`는 이제 **`scheduledDate`의 시간대**를 의미한다. 신규 필드는 만들지 않았다(`scheduledStartTime` 같은 필드 없음).

- 캘린더 렌더: `scheduledDate`가 있는 task → 시간 있으면 timed block, 없으면 all-day 칩.
- `dueDate`는 항상 all-day **마감 마커**이며 드래그로 이동 불가.
- 실제 검증: 브라우저에서 task를 09:00→14:00으로 드래그했을 때 `scheduledDate`/`startTime`/`endTime`만 바뀌고 `dueDate`는 그대로 유지됨을 localStorage 직접 확인으로 검증.

### 3.2 마이그레이션 (normalizeTask)

```ts
if (startTime && !scheduledDate && dueDate) {
  scheduledDate = dueDate;
}
```

기존 캘린더 드래그로 `dueDate+startTime`을 찍어둔 과거 데이터가 있으면 자동으로 `scheduledDate`에 승격된다. Additive(값을 지우지 않음)이고 `!scheduledDate` 가드 덕분에 재실행해도 안전하다(멱등).

**데이터 게이트 결과**: 구현 시작 전 프리뷰 브라우저의 localStorage를 점검한 결과 `startTime`이 채워진 task는 0개였다. 즉 이번 배포에서 마이그레이션이 실제로 동작해야 하는 레코드는 없었다(방어 코드로만 존재). 단, 이는 프리뷰 세션의 저장소 기준이며 실사용 브라우저 데이터는 별도로 확인이 필요하다.

### 3.3 CalendarItem 파생 모델

```ts
type CalendarLayer = "task" | "deadline" | "study-review" | "project-deadline";
```

Task/Project/ConceptNote 세 종류의 원본 데이터를 하나의 `CalendarItem[]`로 변환하는 `buildCalendarItems()` 함수 하나가 캘린더 렌더링과 Ollama context 생성 모두에 쓰인다. 규칙:

- **task 블록**: `scheduledDate` 있음, status가 done/archived면 제외(Completed 레이어 켜면 done 포함), 프로젝트 필터 적용.
- **deadline 마커**: `dueDate` 있음, 드래그 불가.
- **project-deadline**: `Project.dueDate` 있음, status가 active/paused일 때만.
- **study-review**: `ConceptNote.nextReviewDate` 있음, `reviewStatus !== "mastered"`, `!deletedAt`.

## 4. Phase별 구현 내용

### Phase 1 — 노출 + 레이아웃

- Sidebar primaryNav에 Calendar 아이콘 + 항목 추가(Today 바로 다음).
- 기본 뷰를 Week으로 변경(기존 Month 기본값에서 전환).
- 상단 Toolbar, 좌측 Sidebar(Create/미니달력/레이어/프로젝트 필터), 메인 grid 골격 구현.
- 하루 시간 범위를 8AM-8PM(기존)에서 **6AM-11PM**으로 확장.

### Phase 2 — 데이터 연결 + 시간 의미 확정

- `buildCalendarItems` 구현 및 레이어 토글 연결.
- §3.1의 시간 재정의 적용, normalize 마이그레이션 적용.
- TaskDetail 필드 순서 변경.

### Phase 3 — 생성 + 드래그

- Quick Create: 빈 시간 슬롯 클릭 → Task(scheduledDate+시간) 생성. All-day/월간 셀 클릭 → Task 또는 Deadline 타입 선택 가능.
- 드래그 리스케줄: 기존 `dueDate` 기준 드롭 로직을 `scheduledDate` 기준으로 완전히 교체. Deadline/Study Review/Project 마커는 `draggable=false`로 고정.
- Unscheduled 백로그 필터를 `!dueDate` → `!scheduledDate && status ∉ {done, archived}`로 변경.

### Phase 4 — Today/Study 연결

- Today task more-menu에 "View in Calendar" 추가 → 클릭 시 해당 task 선택 + Calendar 페이지 이동.
- Calendar의 task/deadline 클릭 → 기존 `TaskDetail` 패널 재사용(신규 Drawer 컴포넌트를 만들지 않음).
- Calendar의 study-review 칩 클릭 → Study 페이지로 이동 + 해당 ConceptNote의 NoteDetail을 자동으로 엶(`focusNoteId` prop으로 배선).
- Calendar의 project-deadline 마커 클릭 → 해당 프로젝트 상세 페이지로 이동.
- TaskDetail에 "Move to Today" 버튼 추가(`scheduledDate`를 오늘로 설정).

### Phase 5 — Ollama Calendar Context

- `buildCalendarContextText()`가 이번 주(일~토) 범위의 scheduledTasks/deadlines/studyReviews/projectDeadlines/unscheduledTasks/workloadSummary(요일별 분 단위 작업량)를 JSON으로 직렬화.
- `activePage === "calendar"`일 때만 Ollama 요청에 시스템 메시지로 주입.
- AI는 제안만 하도록 시스템 프롬프트에 명시(자동 일정 변경 없음).

## 5. 실제 검증 내역 (브라우저 실기 테스트)

로컬 dev 서버(Vite, `preview_*` 툴)로 아래 항목을 모두 직접 조작해 확인했다.

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | 통과 (에러 0) |
| Sidebar에 Calendar 노출, 클릭 시 이동 | 확인 |
| Week 뷰 기본 렌더 (일~토, 6AM~11PM) | 확인 |
| Month 뷰 전환, 칩+`+N more`, 마커 아이콘(⚠/↻/◆) | 확인 |
| Day 뷰 전환 | 확인 |
| TaskDetail 필드 순서(Scheduled→Start→End→Due) | 확인 (실제 값 `2026-07-01` 등 정상 바인딩) |
| "Move to Today" 버튼 노출 | 확인 |
| Quick Create — 시간 슬롯 클릭 → task 생성 | 확인 (localStorage에 scheduledDate/startTime/endTime 정확히 기록) |
| Quick Create — all-day 클릭 → Deadline 타입 생성 | 확인 (dueDate만 기록, scheduledDate 비어있음) |
| 드래그 리스케줄 (09:00→14:00) | 확인 (scheduledDate/시간만 변경, dueDate 불변) |
| Deadline/Study Review 칩 `draggable=false` | 확인 (task만 `draggable=true`) |
| 레이어 토글(Deadlines 끄기) | 확인 (해당 칩 즉시 사라짐) |
| 프로젝트 필터(fNIRS Thesis 제외) | 확인 (해당 프로젝트 task만 숨김, 프로젝트 없는 항목·study-review는 항상 표시) |
| Today → "View in Calendar" | 확인 (Calendar로 이동 + 해당 task TaskDetail 자동 오픈) |
| Study review 칩 클릭 | 확인 (Study 페이지 이동 + 해당 ConceptNote 상세 모달 자동 오픈) |
| Project-deadline 마커 클릭 | 확인 (해당 프로젝트 상세 페이지로 이동) |
| Ollama 채팅 — Calendar context 주입 | 확인. 실제 로컬 Ollama(gemma3)에 "이번 주 일정 뭐 있어?" 질문 → 실제 캘린더 데이터 기반으로 요일별 정확한 요약 응답을 받음 |
| Inbox / Planning 페이지 회귀 확인 | 확인 (레이아웃/동작 이상 없음) |
| 콘솔/네트워크 에러 | 없음 (구현 중간 과정의 HMR 에러 1건은 자체 해결, 최종 상태에는 없음) |

테스트로 생성한 임시 task 2건은 검증 직후 localStorage에서 제거했다(원래 샘플 데이터 16개로 원복 확인).

## 6. 알려진 한계 / 의도적으로 미룬 것 (스코프 밖)

`CALENDAR_DESIGN.md` §8/§11.4에서 이미 명시한 항목들이며, 버그가 아니라 MVP 판단이다.

- **겹침 처리**: 같은 시간대 블록이 여러 개면 열 분할 없이 단순히 포개고 좌측 offset+보더로만 구분한다(Google Calendar식 collision layout 아님).
- **Resize(드래그로 길이 조절)**: 미구현.
- **Event/Routine 엔티티**: 코드에 Event가 없어 레이어 자체가 없음. 반복 task는 아이콘(↺)만 표시하고 실제 반복 인스턴스 전개는 하지 않음(자기 scheduledDate 1회만 표시).
- **Ollama live anchor**: context는 항상 "오늘 기준 이번 주"이며, 사용자가 캘린더에서 몇 주 앞뒤로 이동해도 반영되지 않음.
- **레이어/필터 상태 영속화**: 새로고침하면 레이어 토글·프로젝트 필터가 기본값으로 리셋됨(컴포넌트 로컬 state).
- **Month 뷰 카운트 요약**: 스펙 대안(숫자 요약) 대신 기존 칩 목록 방식을 그대로 채택.

## 7. 다음에 볼 만한 것

- **실사용 데이터 점검**: 이 보고서의 §3.2 데이터 게이트는 프리뷰 세션 기준이다. 실제 브라우저(daily-use)에서 `localStorage["focusflow.appData.v1"]`에 `startTime`이 채워진 task가 있는지 한 번 확인하면 마이그레이션이 실제로 개입하는지 알 수 있다.
- **겹침이 실사용에서 자주 발생하면** 열 분할(collision layout) 도입을 고려.
- **Unscheduled 백로그가 붐빌 경우**: 마감만 있고 scheduledDate가 없는 task가 이제 여기 새로 등장한다(§10.5). 필요하면 백로그 항목에 "마감 D-n" 힌트 추가 검토.
