# User Patterns (대화 기록 → 패턴 분석 → 메모리)

> ⛔ **폐기됨 (2026-08-27).** 이 문서가 설명하는 기능은 앱에서 제거되었습니다.
> 제거 범위는 `LOCAL_AI_REMOVAL_DESIGN.md`를 보세요. 아래 내용은 기록입니다.

> 상태: **슬라이스 A 구현됨** (2026-07-09). B/C는 설계만.
> `memory/types.ts`의 `AiMemoryEntry`/`AiMemoryStore` seam(선행 선언)을 채우는 기능.
> outcomeLog.ts 주석의 "future memory builder"가 바로 이 문서의 3층이다.

## 0. 한 줄 정의

AI와의 대화를 기기 로컬에 저장하고, 거기서 사용자의 작업 패턴(언제·무엇에 막히는지,
어떤 제안을 수락하는지)을 뽑아 이후 어시스턴트 컨텍스트에 반영한다.

## 1. 3층 구조

```
[1층] 턴 로그 (원자료, 결정적 저장)                ← 슬라이스 A ✅
  대화 원문 + responseMode + inputSignals + stage + 도메인 + outcomeId 링크
[2층] 패턴 집계 (순수 함수, 모델 없음)              ← 슬라이스 B
  시간대별 overwhelm 빈도 · 반복 도메인 · 제안 수락율 · 미해결 슬롯 분포
[3층] 메모리 승격 (모델 제안 → 사용자 승인)          ← 슬라이스 C
  집계+최근 대화 → AiMemoryEntry 후보 제안 → 승인 시 저장 → 컨텍스트 팩에
  소형 프로필 블록(~500자 캡)으로 주입
```

핵심 계약은 기존 파이프라인 그대로: **1·2층은 결정적, 3층에서만 모델이 등장하되
제안만 하고 저장은 사용자 승인.** 심리 진단 금지 — 관찰된 행동 패턴만.

## 2. 프라이버시 규칙 (불변)

- 기기 로컬 KV 전용, Supabase 동기 대상 아님.
- 설정 토글(기본 ON)로 끄기 가능 + 원클릭 전체 삭제 (LocalAi 설정 탭).
- 대화 원문/프로필 블록은 `dataScope: "full-app"` 규칙을 타고 비로컬 공급자에 절대 안 나감.
- 롤링 캡 200턴 + 텍스트 클립(유저 2,000자/응답 1,200자)으로 블롭 크기 제한.

## 3. 슬라이스 A 구현 (2026-07-09)

- `src/lib/ai/memory/turnLog.ts` — store 패턴 복제 (`aiTurnLog.v1`).
  - `logAssistantTurn`: assistant flow 턴 (패널 `assistant_panel` / 챗 라우팅 `chat_assistant`).
    턴이 이미 계산하고 버리던 `responseMode`/`inputSignals`/`stage`/`inferredDomains`를
    보존하고 `outcomeId`로 outcomeLog와 조인 가능.
  - `logFreeChatTurn`: personal agent 자유 대화 (`chat_free`) — 텍스트+공급자만.
  - 비활성 시 no-op, 저장 실패는 무시 (로깅이 턴을 막지 않음).
- 연결 지점: `AssistantPanel.analyze`, `OllamaChat.send` (assistant 분기 + free-chat 분기).
- 설정 UI: SettingsPage LocalAi 탭 `TurnLogSettingsCard` — 토글 + 저장 개수 + 확인 모달
  후 전체 삭제. 데스크톱 게이트 밖(웹에서도 동작).
- assistantText는 user-facing 텍스트만 저장 — `[draft]` history 에코는 저장 안 함.

## 4. 슬라이스 B — 결정적 집계 (구현됨, 2026-07-09)

`memory/patternAggregates.ts` — `computePatternAggregates(turns, outcomes)` 순수 함수.
입력은 `AiTurnLogEntry[]` + `AiOutcomeLogEntry[]`, 출력은 `PatternAggregates`. 모델 없음,
결정적 정렬(카운트 desc → 이름 asc)로 tie까지 안정적. 전부 `patternAggregates.test.ts`
로 커버.

**구현된 집계 (로그가 원천 신호를 갖는 것):**

- 시간대(아침 5–11 / 오후 12–17 / 밤 나머지)·요일별 stuck 비율. stuck =
  `responseMode === "overwhelm"` 또는 `frictionSignal !== "none"`. 판정 가능한 턴
  (responseMode 있는 assistant 턴)만 분모에 — free-chat 턴은 제외. 버킷은 고정
  길이(시간 3·요일 7)로 항상 반환.
- 도메인 top-N (턴 로그 `domains` 집계) — "반복해서 막히는 영역".
- 제안 수락율: outcome 로그 집계 + `assistantTurnId` 조인. overall / 액션 **type별** /
  턴의 **responseMode별**. `saved_as_task`+`accepted`를 수락으로, `rejected`를 거부로,
  `proposed`(대기)·`failed`는 분모에서 제외. (난이도 필드는 액션에 없어 type/mode로 분해.)
- 보너스: responseMode·stage 분포(`stageCounts`) — 아래 defer한 두 집계의 가장 가까운 대체.

**Defer (turn log에 원천 신호가 없어 스키마 추가 필요 — slice A.1):**

- "더 작게 쪼개줘" 후속 빈도 — refinement 버튼(`forceAssistant`)이 자기 턴을 태깅해야 함.
- 미해결 인포슬롯 **종류** 분포 — turn log가 info slot을 저장하지 않음(stage만 저장). 현재는
  `stageCounts`가 "어느 단계에서 자주 멈추나"의 근사치.

선택(미구현): 설정 또는 대시보드에 "AI가 본 내 패턴" 읽기 전용 뷰.

## 5. 슬라이스 C — 메모리 승격 + 프로필 주입

C는 4개 파트라 둘로 나눔: **C.1(스토어+주입, 결정적) ✅ / C.2(모델 제안+승인 UI).**

### C.1 — 메모리 스토어 + 프로필 주입 (구현됨, 2026-07-09)

결정적 토대. 모델·UI 없음. 모든 게 꽂힐 자리를 먼저 만든다.

- `memory/aiMemory.ts` — `AiMemoryStore` seam(types.ts) 구현. store 패턴 복제
  (`aiMemory.v1`, cap 60). CRUD + sanitize + confidence 0..1 클램프 + `expiresAt`
  만료 필터. **스토어엔 승인된 메모리만** 존재 (C.2 제안은 승인 전까지 비영속).
- `memory/memoryProfile.ts` — `buildMemoryProfileBlock(memories, maxChars=500)`
  순수 함수. confidence ≥ 0.4만, 신뢰도 desc→최신 순, ~500자 greedy 캡.
  "관찰된 행동만, 진단 금지" 헤더로 중립 유지.
- `buildAssistantContextPack` 주입: 프로필 블록을 `contextText` 최상단 섹션으로.
  local-only 채널(dataScope full-app)이라 비로컬 공급자에 안 나감. 세션 내 메모리는
  불변이라 캐시 접두사도 안정.
- 전부 `aiMemory.test.ts` / `memoryProfile.test.ts`로 커버.

### C.2 — 모델 제안 + 승인 UI (다음)

- 모델이 집계(slice B)+최근 대화를 읽고 `preference`/`routine` 후보 제안 → 결정적
  검증기(pathDraft.ts 패턴)로 수리/클램프 → **사용자 승인 UI** 통과해야 `saveMemory`
  (자동 저장 금지). confidence 낮게 시작, 재확인 시 `updateMemory`로 상승.
- **열린 결정: 트리거 방식** — 수동 버튼("내 패턴 분석") vs N턴마다 자동. 이 앱의
  consent-first 관례(하드웨어 스캔=명시 클릭)상 수동 버튼이 유력.
- 메모리 열람/개별 삭제 설정 UI도 C.2에서 (승인 UI와 함께).
- **선행 조건 promptBudget 해결됨 (2026-07-09)** — 아래 §6. 프로필 블록을 얹어도
  히스토리가 예산에 맞춰 자동 트리밍되므로 안전.

## 6. promptBudget — 8192 ctx 초과 수정 (2026-07-09)

증상: 대화를 몇 턴 주고받으면 llama-server가 "request (N tokens) exceeds the available
context size (8192)"로 하드 실패, **앱 강제 종료해야만 복구**(React state에 남은 과대
히스토리가 다음 요청도 똑같이 터뜨림). 원인은 고정비(시스템 프롬프트 + 앱 컨텍스트
최대 16k자 + 지식 6k자)에 더해 **히스토리가 매 턴 무제한 성장**하는데 합계를 아무도
캡하지 않음. 슬라이스 1이 챗 히스토리에 draft 에코를 추가하며 악화.

- `lib/ai/promptBudget.ts` (순수 함수 + 테스트):
  - `estimateTokens` — 스크립트 인지 보수적 추정(한글/CJK ~1 tok/자, 라틴 ~0.28). 과소추정
    → 재초과를 피하려 일부러 과대 추정.
  - `fitMessagesToBudget` — 선두 system 블록(=캐시 접두사)과 마지막 user 메시지는 보존,
    오래된 중간 턴부터 예산 맞을 때까지 제거. 중간에 구멍 안 남김.
- 게이트웨이 `sendAiChat`가 유일한 공동 병목이라 여기서 중앙 집행: `8192 − 응답예약(1024)
  − knowledgeContext 토큰`을 히스토리 예산으로 프로액티브 트리밍(챗/어시스턴트 flow 둘 다
  자동 보호). 추가로 오버플로 에러 감지 시 히스토리 절반 더 버리고 1회 재시도 → 강제종료
  증상 제거.
- `historyEcho.ts` draft 에코 슬림화: detected_items/missing_info 제거, title+stage+
  **답이 있는** info_slots만 유지(매 턴 팩에서 재파생되므로 히스토리에 실을 필요 없음).
- 캐시 불변식 유지: `[system][앱컨텍스트]` 접두사는 트리밍 대상이 아니라 그대로.

관련 문서: [[Features/Unified_Chat]], [[Features/AI_Assistant]]
관련 메모리: `ai-stuck-to-execution-vision.md`
