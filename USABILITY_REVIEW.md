# FocusFlow 사용성 평가 (간편한 사용성)

- 평가일: 2026-08-13
- 대상: **`v0.4.0`** (`6f4f9ca`), 브랜치 `claude/focustodo-overwhelm-debug-jv4k5x`
- 방법: `npm run dev`(127.0.0.1:5180)로 앱을 직접 조작 + 소스 대조
- 관점: **"간편한가"** — 처음 쓰는 사람이 헤매지 않고, 매일 쓰는 사람이 손이 덜 가는가

> **읽는 순서**: 이 문서는 `USABILITY_IMPROVEMENT_DESIGN.md`의 **후속 검증**이다.
> 최초 평가는 `v0.3.10` 기준이었으나, 그 사이 PR #2가 머지되며 지적 사항의 상당수가
> 이미 해결됐다. §2에 해결된 항목을, §3에 **아직 유효한 항목만** 정리했다.
> 이어서 작업할 사람은 **§3부터 보면 된다.**

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

---

## 3. 아직 유효한 문제 (여기서부터 작업)

`v0.4.0` 코드에서 재확인한 것만 적는다.

### 3.1 [P2] `⌘K` 배지가 없는 단축키를 광고함

- Today 검색창에 `⌘K` 배지가 있다 — `src/components/TodayPage.tsx:424`
- **`k` 키에 대한 핸들러가 코드 전체에 존재하지 않는다.** `App.tsx`의 전역 keydown은 `Escape` / `/` / `t` / `i` / `n`만 처리한다.
- 눌러도 아무 일도 일어나지 않는다.

**조치**: 배지를 지우거나 핸들러를 붙이거나. 지금은 UI가 거짓말을 하는 상태다.

### 3.2 [P2] IME 조합 중 Enter 가드 없음 — 한국어 사용자 직격

`InlineCapture`의 저장은 **폼 암시적 제출**에 의존한다. `onKeyDown`은 `Escape`와 `Alt+Enter`만 다룬다 (`InlineCapture.tsx:76-87`).

```tsx
<form className="tdy-capture" onSubmit={submit}>   // :61
  <input onKeyDown={...} />                        // Enter 케이스 없음
  <button type="submit">                           // :98 → 암시적 제출
```

문제: **`event.nativeEvent.isComposing` 검사가 없다.** 한글 IME에서 조합을 확정하는 Enter가 그대로 제출로 이어지면 마지막 글자가 잘리거나 의도치 않게 저장된다. 게다가 암시적 제출 방식은 `isComposing`을 검사할 자리 자체가 없는 구조다.

**코드베이스 내 일관성도 깨진다** — 다른 입력들은 가드를 갖고 있다:

| 위치 | 가드 |
|---|---|
| `src/components/calendar/NewTaskForm.tsx:47` | `event.key === "Enter" && !event.nativeEvent.isComposing` |
| `src/components/calendar/QuickCreatePopover.tsx:76` | 동일 |
| `src/components/today/InlineCapture.tsx` | **없음** |
| `src/components/today/QuickAddTaskModal.tsx:83` | **없음** (`if (event.key === "Enter") submit();`) |

**조치**: `InlineCapture`를 명시적 `onKeyDown` + `isComposing` 가드로 바꾸고, `QuickAddTaskModal:83`도 같이 고칠 것.

> **검증 주의**: 브라우저 자동화로 보낸 Enter는 폼 암시적 제출을 트리거하지 못한다.
> 평가 중 자동화 Enter로는 저장이 되지 않았으나, 이는 도구 한계일 가능성이 높다.
> **실제 키보드 + 한글 IME로 반드시 손으로 확인할 것.** 자동화 결과만으로 판단 금지.

### 3.3 [P2] 검색창이 2개, 역할이 구분되지 않음

- 사이드바 검색: **전역**. 태스크/프로젝트/토픽/노트를 드롭다운으로. `/`로 포커스 (`App.tsx:279`, `:1137`)
- Today 헤더 검색: **그 페이지 목록만 거르는 로컬 필터** (`TodayPage.tsx:149` 이하)

플레이스홀더가 둘 다 전역 검색처럼 읽혀 구분이 안 된다.

**조치**: 문구를 역할대로 분리 — "전역 검색" vs "이 목록에서 찾기".

### 3.4 [P3] 아이젠하워 사분면 IV의 라벨과 내용이 모순

```
"eis.qIV":     "Neither Important nor Urgent"   // src/i18n/en.ts:778
"eis.qIVHint": "Unsorted · on hold · completed" // :779
```

미분류·보류·완료 항목이 "중요하지도 급하지도 않음" 칸에 담긴다. 사용자가 내리지 않은 판단을 앱이 대신 내린 것처럼 보인다.

§2.1에서 데이터 모델은 고쳐졌지만 **표시 계층의 라벨 문제는 남아 있다.**

**조치**: 미분류 그룹을 사분면 밖 별도 레인으로 분리하거나, 최소한 Q4 제목을 내용에 맞게 고칠 것.

### 3.5 [P3] 로케일 혼선 — 영어 설정인데 한국어 날짜

`language: "en"`, `<html lang="en">` 상태에서 Focus 페이지 헤더만 "8월 13일"로 나온다.

- 원인: `src/components/FocusPage.tsx:211` → `formatDate(today, "ko")` 하드코딩
- 같은 조건에서 Today 페이지는 "Thursday, August 13, 2026"으로 정상 출력
- **코드베이스 전체에서 하드코딩된 `"ko"` 로케일은 이 한 곳뿐이다** — 한 줄 수정

### 3.6 [P3] 자유 텍스트 칸이 여전히 2개

§2.3에서 유실은 해결됐으나 `description`과 `notes`가 상세 패널에 **나란히** 남아 있다. 사용자는 "무엇을 어디에 적어야 하는지" 판단해야 한다. `description`은 전역 검색 인덱스(`App.tsx`) 외에 뚜렷한 소비처가 없다.

**조치**: 한쪽으로 통합 + 마이그레이션. 급하진 않다.

### 3.7 [P3] 영어 복수형

`"todayv.briefCounts"` → `"You have {{tasks}} focus tasks and ..."` (`src/i18n/en.ts:455`). 1개일 때 "1 focus tasks"로 출력된다.

### 3.8 [P3] 죽은 설정 `aiModel`

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
| 1 | IME `isComposing` 가드 (§3.2) | 한국어 사용자 직격, 실입력 유실 위험 | 소 |
| 2 | `⌘K` 배지 정리 (§3.1) | UI가 거짓말 중 | 소 |
| 3 | `FocusPage.tsx:211` 로케일 (§3.5) | 한 줄 | 소 |
| 4 | `briefCounts` 복수형 (§3.7) | 한 줄 | 소 |
| 5 | 사분면 IV 라벨 (§3.4) | 표시 계층만 남은 잔여 문제 | 소 |
| 6 | 검색창 문구 분리 (§3.3) | | 소 |
| 7 | `aiModel` 제거 + AI 오류 안내 (§3.8) | | 소 |
| 8 | `description`/`notes` 통합 (§3.6) | 마이그레이션 필요 | 중 |

1~7은 전부 독립적이고 스펙 결정이 필요 없다. **1번부터 순서대로 하면 된다.**

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
| §3.2 IME | **실제 키보드 + 한글 IME로** Today 캡처 바에 한글 입력 후 Enter. 자동화 불가 |
| §3.1 ⌘K | Today 검색창의 `⌘K` 배지를 보고 실제로 `Ctrl+K`를 눌러보기 |
| §3.3 검색 | 사이드바 검색과 Today 헤더 검색에 같은 단어를 넣고 결과 비교 |
| §3.5 로케일 | Settings에서 언어를 English로 → Focus 페이지 헤더 확인 |
| §2.2 파싱 | 캡처 바에 `내일 오후 3시 팀 미팅 !!` 입력 → 칩 3개 확인 |
