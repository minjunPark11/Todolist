# FocusFlow 사용성 평가 (간편한 사용성)

- 평가일: 2026-08-13
- 대상: **`v0.4.0`** (`6f4f9ca`), 브랜치 `claude/focustodo-overwhelm-debug-jv4k5x`
- 방법: `npm run dev`(127.0.0.1:5180)로 앱을 직접 조작 + 소스 대조
- 관점: **"간편한가"** — 처음 쓰는 사람이 헤매지 않고, 매일 쓰는 사람이 손이 덜 가는가

> **읽는 순서**: 이 문서는 `USABILITY_IMPROVEMENT_DESIGN.md`의 **후속 검증**이다.
> 최초 평가는 `v0.3.10` 기준이었으나, 그 사이 PR #2가 머지되며 지적 사항의 상당수가
> 이미 해결됐다. §2에 해결된 항목을, §3에 **아직 유효한 항목만** 정리했다.
> 이어서 작업할 사람은 **§3부터 보면 된다.**
>
> §2.5의 3건은 이 문서와 같은 브랜치에서 **이미 고쳤다.** §3에 남은 것은 5건이며,
> 그중 §3.1(IME)만이 데이터에 영향을 줄 수 있고 **손으로 재현 확인이 선행돼야 한다.**

---

## 1. 한 줄 요약

**캡처는 이제 이 앱의 강점이다. 남은 건 잔손질과 표기 정합성이다.**

`v0.3.10`의 핵심 문제였던 "우선순위 축 4개가 서로 모른다"는 구조적 결함이 제거됐고, Today에 자연어 파싱 캡처 바가 들어오면서 진입 마찰이 크게 낮아졌다. 남은 것은 대부분 **소규모·독립적**이며, 스펙 결정 없이 바로 착수 가능하다.

---

## 2. `v0.4.0`에서 이미 해결된 것 (재확인 완료)

이어서 작업할 사람이 **중복 착수하지 않도록** 기록한다.

### 2.1 우선순위 축 통합 — 구조적 개선

`Task`에서 `importance` / `urgency` / `isFocus`가 **필드째 제거**됐다. 아이젠하워 사분면은 이제 `priority` + `dueDate`에서 **파생**된다.

```
// src/utils/eisenhower.ts (patchForQuadrant 주석)
// the priority/dueDate fields the position is derived from. Nothing stores the
// quadrant itself, so the two can never disagree.
```

이전에는 Add 모달에서 `Medium`을 골라도 Planning에서 `Unsorted`로 보이는 모순이 있었다. 상태를 저장하지 않고 파생시키는 방향은 정확한 해법이다.

### 2.2 Today 인라인 캡처 바 + 자연어 파싱

`src/components/today/InlineCapture.tsx` + `src/utils/quickParse.ts` 신규.

직접 확인한 동작:

| 입력 | 화면에 뜬 칩 |
|---|---|
| `tomorrow 3pm team sync !!` | `Aug 14` · `3:00 PM` · `High` |
| `내일 오후 3시 팀 미팅 !!` | `Aug 14` · `3:00 PM` · `High` |

**한국어와 영어 모두 파싱된다.** 그리고 결정적으로, 저장 **전에** 칩으로 해석 결과를 보여준다 — 오독이 조용히 저장되지 않고 눈에 보인다. 힌트 문구(`Enter to save · Alt+Enter for details · Esc to clear`)도 적절하다.

날짜 라이브러리를 끌어오지 않고 명시적 패턴만 인식한 판단도 옳다(`quickParse.ts` 상단 주석).

### 2.3 생성 시 메모 유실 해결

이전엔 Add 모달의 Notes(`task.notes`)와 상세 패널 본문(`task.description`)이 서로 무관해 **생성 시 적은 메모가 상세에서 보이지 않았다.** 지금은 `TaskDetail`이 두 필드를 모두 렌더한다 (`TaskDetail.tsx:76` = description, `:188` = notes).

→ **데이터가 사라지는 문제는 해소.** 다만 자유 텍스트 칸이 2개 남은 것은 §3.6 참조.

### 2.4 중복·죽은 코드 정리

`QuickAdd.tsx`, `TaskList.tsx`, `PlanTodayPreviewModal.tsx`, `data/studySeed.ts`, `lib/ai/agent/actionParser.ts` 삭제. i18n 키도 en/ko 각각 300줄 이상 감소. Inbox 다중 선택 + 일괄 처리, 토스트 큐 + 삭제 실행취소 추가.

### 2.5 확정 버그 3건 — 이 문서와 함께 수정 완료

| 문제 | 조치 | 검증 |
|---|---|---|
| `⌘K` 배지가 없는 단축키를 광고 | `TodayPage.tsx`에서 배지 제거. `/` 키 전역 검색은 그대로 | 앱에서 배지 사라짐 확인 |
| Focus 페이지 날짜가 항상 한국어 | `FocusPage.tsx`의 `formatDate(today, "ko")` → `formatDate(today, lang)` (`useT()`에서 `lang` 취득) | en → `Aug 13`, ko → `8월 13일` **양방향 확인** |
| `"1 focus tasks"` 복수형 | `todayv.briefCounts`를 인접 키(`briefOverdue`, `briefInbox`)와 같은 `task(s)` 관례로 통일 | `You have 0 focus task(s)...` 확인 |

`npx tsc -b` 통과, `vitest run` 211개 전부 통과, 콘솔 에러 없음.

### 2.6 IME 조합 Enter 가드 — 7곳 적용 완료

한글/일본어 IME는 조합을 확정할 때도 Enter를 쏜다. 이걸 걸러내지 않으면 **조합이 끝나기 전에 저장**되어 마지막 글자가 잘린다. 리포의 `NewTaskForm`·`QuickCreatePopover`는 이미 `isComposing` 가드를 갖고 있었으나 나머지는 없었다.

| 위치 | 원래 방식 | 조치 |
|---|---|---|
| `today/InlineCapture.tsx` | **폼 암시적 제출** (가드 삽입 자체가 불가능한 구조) | 명시적 `onKeyDown` + 가드로 전환 |
| `today/QuickAddTaskModal.tsx` | `if (key === "Enter") submit()` | 가드 추가 |
| `EisenhowerPage.tsx` | 동일 | 가드 추가 |
| `calendar/CalendarCategorySettings.tsx` | 동일 | 가드 추가 |
| `spaces/SpaceDrawers.tsx` | 동일 | 가드 추가 |
| `OllamaChat.tsx` | Enter 전송 | 가드 추가 — 한글 채팅이 중간에 잘려 전송되던 자리 |
| `Sidebar.tsx` (프로젝트 추가) | 텍스트 필드 1개짜리 폼 → 암시적 제출 | 조합 중 Enter만 `preventDefault` |

`role="button"` 활성화용 Enter 핸들러(`kit.tsx`, `SpacesPage`, `StudyPage`, `CalendarLeftSidebar`, `EisenhowerPage:339`)와 삭제 확인 다이얼로그(`FocusPage`)는 텍스트 입력이 아니라 제외했다.

**검증**

1. 합성 `KeyboardEvent`로 `isComposing` 분기를 직접 확인 — 조합 Enter는 저장되지 않고, 이어진 실제 Enter는 저장됐다.
2. 회귀 확인: 캡처 바에 `내일 오후 3시 팀 미팅 !!` → Enter → `{title:"팀 미팅", priority:"high", scheduledDate:"2026-08-14", startTime:"15:00"}`. 파싱 토큰이 제목에서 정확히 제거됐다.

> **부수 효과**: `InlineCapture`가 암시적 제출을 벗어나면서 Enter 저장이 이제 프로그램적으로도 동작한다.
> 이전에는 암시적 제출에 의존해 **자동화로는 캡처 저장을 테스트할 수 없었다.**
>
> **남은 한계**: 위 검증은 합성 이벤트다. **실제 IME로 조합 중 Enter를 눌러보는 확인은 여전히 남아 있다.**
> 로직이 옳다는 것과 실기기에서 재현되지 않는다는 것은 다른 문제다.

---

## 3. 아직 유효한 문제 (여기서부터 작업)

`v0.4.0` 코드에서 재확인한 것만 적는다.

### 3.1 [P2] 검색창이 2개, 역할이 구분되지 않음

- 사이드바 검색: **전역**. 태스크/프로젝트/토픽/노트를 드롭다운으로. `/`로 포커스 (`App.tsx:279`, `:1137`)
- Today 헤더 검색: **그 페이지 목록만 거르는 로컬 필터** (`TodayPage.tsx:149` 이하)

플레이스홀더가 둘 다 전역 검색처럼 읽혀 구분이 안 된다.

**조치**: 문구를 역할대로 분리 — "전역 검색" vs "이 목록에서 찾기".

### 3.2 [P3] 아이젠하워 사분면 IV의 라벨과 내용이 모순

```
"eis.qIV":     "Neither Important nor Urgent"   // src/i18n/en.ts:778
"eis.qIVHint": "Unsorted · on hold · completed" // :779
```

미분류·보류·완료 항목이 "중요하지도 급하지도 않음" 칸에 담긴다. 사용자가 내리지 않은 판단을 앱이 대신 내린 것처럼 보인다.

§2.1에서 데이터 모델은 고쳐졌지만 **표시 계층의 라벨 문제는 남아 있다.**

**조치**: 미분류 그룹을 사분면 밖 별도 레인으로 분리하거나, 최소한 Q4 제목을 내용에 맞게 고칠 것.

### 3.3 [P3] 자유 텍스트 칸이 여전히 2개

§2.3에서 유실은 해결됐으나 `description`과 `notes`가 상세 패널에 **나란히** 남아 있다. 사용자는 "무엇을 어디에 적어야 하는지" 판단해야 한다. `description`은 전역 검색 인덱스(`App.tsx`) 외에 뚜렷한 소비처가 없다.

**조치**: 한쪽으로 통합 + 마이그레이션. 급하진 않다.

### 3.4 [P3] 죽은 설정 `aiModel`

`appSettings.aiModel`은 저장·정규화만 되고 **읽는 코드가 한 곳도 없다.**

```
src/types.ts:277                 aiModel: string;
src/hooks/usePlannerData.ts:77   aiModel: "",
src/hooks/usePlannerData.ts:417  aiModel: typeof settings?.aiModel === "string" ? ... : ...
```

이 3곳이 전부다. 소비처 없음.

관련해서, 기본값이 `""`인데도 AI 패널 첫 문구는 "Ask me anything"이고, 실패 메시지는 `"AI chat failed."` 한 줄뿐이라(`src/i18n/en.ts`) **설정 > Local AI로 가라는 안내가 없다.**

**조치**: `aiModel` 제거 + AI 오류 메시지에 설정 진입 경로 추가.

---

## 4. 착수 순서 제안

| # | 작업 | 근거 | 규모 |
|---|---|---|---|
| 1 | 사분면 IV 라벨 (§3.2) | 표시 계층만 남은 잔여 문제 | 소 |
| 2 | 검색창 문구 분리 (§3.1) | 문구 결정 필요 | 소 |
| 3 | `aiModel` 제거 + AI 오류 안내 (§3.4) | | 소 |
| 4 | `description`/`notes` 통합 (§3.3) | 마이그레이션 필요 | 중 |

**남은 4건은 전부 표시·문구 문제라 틀려도 데이터 손해가 없다.** 1~3은 서로 독립적이라 순서를 바꿔도 된다. 4번만 마이그레이션이 필요하다.

데이터에 영향을 줄 수 있던 항목(§2.6 IME)은 처리됐으나, **실기기 IME 확인은 남아 있다** — 부록 참조.

---

## 5. 용어 정리 (미해결)

같은 대상이 아직 여러 이름으로 불린다.

- 분류되지 않은 태스크 → `Inbox` / `Unsorted` / `No space`
- 사이드바의 `Project Shortcuts` 와 주 메뉴의 `Spaces`

최소한 첫 번째 줄은 한 단어로 통일할 것 (`Inbox` 권장).

---

## 부록: 검증 방법

```bash
npm run dev   # .claude/launch.json 의 "dev" → 127.0.0.1:5180
```

| 확인할 것 | 절차 |
|---|---|
| **§2.6 IME (미완)** | **실제 키보드 + 한글 IME로** Today 캡처 바에 `팀 미팅` 입력, 마지막 글자 조합 중 Enter. 온전히 저장되면 OK, 잘리면 회귀. **자동화 불가 — 반드시 손으로** |
| §2.6 IME 회귀 | 같은 자리에 영문 입력 후 Enter → 정상 저장돼야 한다 (가드가 일반 Enter까지 막지 않았는지) |
| §2.2 파싱 | 캡처 바에 `내일 오후 3시 팀 미팅 !!` 입력 → 칩 3개(`Aug 14`·`3:00 PM`·`High`) 확인 |
| §2.5 로케일 | Settings에서 언어를 English ↔ 한국어로 토글 → Focus 페이지 헤더 날짜가 따라오는지 |
| §3.1 검색 | 사이드바 검색과 Today 헤더 검색에 같은 단어를 넣고 결과 비교 |

IME 가드가 들어간 자리는 캡처 바 외에도 6곳이다 (§2.6 표). 한글로 저장을 시도해볼 만한 곳: **AI 채팅**, **사이드바 프로젝트 추가**, **Planning 빠른 추가**, **Space 서브태스크 추가**.
