# User Patterns (대화 기록 → 패턴 분석 → 메모리)

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

## 4. 슬라이스 B — 결정적 집계 (설계)

`memory/patternAggregates.ts` 순수 함수, 입력은 `AiTurnLogEntry[]` + `AiOutcomeLogEntry[]`:

- 시간대(아침/오후/밤)·요일별 overwhelm/friction 턴 비율
- 도메인 top-N (턴 로그 domains 집계) — "반복해서 막히는 영역"
- 제안 수락율: outcomeId 조인 → saved_as_task / rejected 비율, 난이도별 분해
- "더 작게 쪼개줘" 패턴: 같은 세션 내 후속 요청 빈도
- 미해결 인포슬롯 종류 분포 (사용자가 답 안 하는 질문 유형)

선택: 설정 또는 대시보드에 "AI가 본 내 패턴" 읽기 전용 뷰.

## 5. 슬라이스 C — 메모리 승격 + 프로필 주입 (설계)

- `AiMemoryStore` 구현 (types.ts seam). confidence는 낮게 시작, 재확인 시 상승.
- 모델이 집계+최근 대화를 읽고 `preference`/`routine` 후보 제안 → **사용자 승인 UI**
  통과해야 저장 (자동 저장 금지).
- 승인된 메모리를 `buildAssistantContextPack`에 ~500자 캡 프로필 블록으로 주입.
  **선행 조건: 프롬프트 예산 관리(promptBudget) 먼저** — 8192 ctx 초과 문제(2026-07-09
  진단: 히스토리 무제한 성장 + slice(-19))가 해결돼야 블록을 안전하게 얹을 수 있다.

관련 문서: [[Features/Unified_Chat]], [[Features/AI_Assistant]]
관련 메모리: `ai-stuck-to-execution-vision.md`
