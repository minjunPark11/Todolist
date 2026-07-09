# Unified Chat (Chat + Assistant 병합 → 단일 surface)

> 상태: **설계** (구현 전). 기존 두 AI 진입점(Chat 탭 / Assistant 탭)을
> 하나의 Chat으로 합치는 기준 문서.
> 관련 메모리: `ai-stuck-to-execution-vision.md`, `local-ai-perf-bottleneck.md`.
> 관련 문서: [[Features/Learning_Path]], [[Features/AI_Assistant]].

## 0. 한 줄 정의

지금 AI는 FAB 패널 안에 **탭 2개**(Chat / Assistant)로 갈라져 있다. 그런데 엔진과
라우터는 이미 공유 중이고, 차이는 **렌더링 + 라우터 위치**뿐이다. 이 문서는 그 둘을
**단일 Chat surface + 단일 엔진(`runAssistantTurn`)** 으로 접는다.

## 1. 지금 실제로 뭐가 있나 (병합은 이미 절반 돼 있음)

```
                    OllamaChat.tsx (FAB 패널)
        ┌──────────────── 탭 2개 ────────────────┐
   [Chat 탭] submit()                     [Assistant 탭] AssistantPanel
      │                                        │
      ├ shouldRouteToAssistantFlow(text)?      │
      │   yes → runAssistantTurn ──────────────┤  ← 같은 엔진
      │          …결과를 텍스트로 flatten        │  풍부한 카드 렌더
      │          (저장버튼·plan·경로 전부 버림)   │  (다음행동/plan/경로/breadcrumb)
      │   no  → runPersonalAgent                │
      │          (자유 대화 + 액션제안 + 지식첨부, │
      │           Generic Failure Guard 없음)    │
```

- **Chat 탭**은 이미 overwhelm 메시지를 `runAssistantTurn`으로 보낸다
  (`OllamaChat.tsx` `shouldRouteToAssistantFlow`). 다만 결과를 **텍스트로 납작하게**
  렌더할 뿐 — 저장 버튼·plan·learning path를 전부 버린다.
- 두 탭의 차이는 엔진이 아니라 **(a) 결과 렌더링, (b) 라우터가 모델 앞이냐 뒤냐** 이다.

### 두 엔진 비교

| | `runPersonalAgent` (chat) | `runAssistantTurn` (assistant) |
| --- | --- | --- |
| 라우팅 | 없음 (전부 자유텍스트) | **Scope Gate 내장** — 코드/번역/Q&A/학습은 `domain_specific`으로 즉답 |
| 안전장치 | ❌ Generic Failure Guard 없음 | ✅ 가드 + 결정적 수리 |
| 부가기능 | 액션 제안(AgentActionPreview), 지식 첨부, source chip, intent 라벨 | 카드 draft·info slot·plan·learning path·breadcrumb |

## 2. 확정된 결정 (2026-07-09)

- **줄기는 `runAssistantTurn`.** assistant 프롬프트의 **Scope Gate가 이미 모델
  차원에서 "즉답할 것 vs 구조화할 것"을 판정**한다(`prompts.ts` §Scope Gate). 지금
  Chat이 쓰는 `shouldRouteToAssistantFlow`(정규식 프리필터)는 그걸 모델 호출 전에
  때려맞히는 열등한 라우터 — 브레인덤프가 friction/decision 패턴을 안 건드리면
  가드 없는 personal agent로 새어나간다. → 정규식 라우터 폐기, 모델의 Scope Gate로
  일원화.
- **personal agent는 `domain_specific` 경로로 흡수.** 자유 대화·액션 제안·지식 첨부·
  source chip을 assistant flow의 가벼운 경로(`domain_specific` / `normal_task_request`
  / `learning_request`)에 붙인다. 별도 엔진으로 남기지 않는다.
- **이행 범위: 단일 엔진까지(슬라이스 1→3).** 최종적으로 탭 제거 + `runPersonalAgent`
  은퇴. "Chat 하나만" 상태에 도달.

## 3. 목표 구조 (탭 없음, 엔진 하나)

```
        Chat (유일 surface)
             │
        runAssistantTurn  ← 유일 엔진
             │
        모델의 Scope Gate가 라우팅 (정규식 프리필터 폐기)
             │
   ┌─────────┴──────────────────────────┐
 domain_specific / normal / learning    overwhelm / planning
   → user_facing_response 텍스트 즉답      → 텍스트 + 구조화 카드
   → (선택) 액션제안·지식첨부·source chip   → 다음행동/plan/경로/breadcrumb
   → 카드 draft·Generic 가드 스킵          → 전부 채팅 스트림에 인라인, 저장버튼 유지
```

- **모든 응답은 채팅 말풍선**이고, 턴이 실어온 구조(다음 행동 카드, learning path 초안,
  저장 버튼)는 말풍선 밑에 **인라인 블록**으로 붙는다.
- Assistant 탭의 풍부한 UI는 사라지는 게 아니라 **채팅 흐름 안으로 들어온다.**

## 4. 절대 잃으면 안 되는 불변식

1. **Generic Failure Guard**: 지금은 assistant 탭 + 라우팅된 chat만 통과. 병합 후엔
   overwhelm/planning 턴이 **항상** 통과(오히려 커버리지 강화). 가벼운 경로는 가드 대상이
   아니므로 스킵해도 됨(즉답에는 구조 계약이 없다).
2. **app data ⇒ local-only 공급자 고정** (`dataScope: "full-app"`). 두 엔진 다 앱
   데이터를 보내므로 프라이버시는 나빠지지 않지만, 병합 flow에서 유지되는지 확인.
3. **프롬프트 접두사 캐시 안정성**(`local-ai-perf-bottleneck`): 세션 첫 덤프에 컨텍스트
   앵커링(`buildAssistantContext`). 단일 flow에서도 유지.
4. **자동 저장 없음**: 인라인 카드도 저장 버튼으로만 확정. "저장됐다"고 모델이 말하지
   않음(`prompts.ts` 마지막 규칙).
5. **줄기 전환의 실제 작업**: `runAssistantTurn`은 지금 `domain_specific`에도 항상
   fallback 카드 draft를 만들고 가드를 돌린다. 가벼운 경로에선 **카드 draft·가드를
   건너뛰고** personal agent처럼 액션제안·지식첨부를 허용하도록 분기해야 한다.
6. **두 액션 메커니즘 화해**: personal agent의 `suggestedActions`(AgentActionPreview로
   validate/apply)와 assistant의 `recommendedNextAction`(save-as-task)이 공존하게 됨.
   가벼운 경로 = 전자, 구조화 경로 = 후자로 역할 분리하되 UI에서 중복 버튼이 안 뜨게 조정.

## 5. 슬라이스 분해 (안전한 이행)

### 슬라이스 1 — 렌더 통합 (저위험, 탭 유지)  ← 구현됨 (2026-07-09)

Chat이 **이미** 라우팅하는 `runAssistantTurn` 결과를 flatten 대신 **인라인 구조 카드**로
렌더. 채팅 말풍선 아래에 다음행동/plan/learning path/저장 버튼을 붙인다. 이 시점에서
Assistant 탭은 사실상 중복이 된다. (`AssistantPanel`의 카드 렌더 로직을 채팅 스트림용
컴포넌트로 추출.)

**DoD:** Chat 탭에서 브레인덤프 → 인라인 카드 + 저장 버튼이 뜨고, Assistant 탭과 기능
동등. 정규식 라우터·두 엔진은 아직 그대로.

**구현 노트 (2026-07-09):**

- `components/ai/AssistantTurnCards.tsx` 신설 — 턴 1개의 구조 카드 전체(카드 draft·
  다음행동·plan·learning path·관련 카드·링크 버튼)와 **턴별 액션 상태**를 소유.
  호스트는 반드시 `key={turn.id}`로 마운트해 새 턴마다 상태 리셋.
- `assistant/historyEcho.ts` 신설 — "[draft] {…}" history 에코를 패널/챗이 공유.
  챗 메시지는 `historyContent`(모델용) / `content`(표시용)를 분리해 draft 에코가
  화면에 노출되지 않음.
- 챗의 outcome log 계약을 패널과 동일하게 복제 (proposed → saved_as_task/rejected/failed).
- 인라인 카드의 "더 작게/다른 행동" 버튼은 `forceAssistant`로 assistant flow를 강제 —
  버튼 텍스트가 정규식 라우터에 안 걸려 personal agent로 새는 문제 차단.
- 챗은 지난 턴 카드도 스트림에 남긴다(패널은 마지막 턴만) — §6 "인라인 카드 히스토리"는
  일단 '남김'으로 감.

### 슬라이스 2 — 라우터 교체 + 가벼운 경로 흡수

- `shouldRouteToAssistantFlow`(정규식) 폐기. **모든 턴을 `runAssistantTurn`으로.**
- `runAssistantTurn`에 가벼운 경로 분기 추가: `domain_specific`/`normal_task_request`/
  `learning_request`면 카드 draft·Generic 가드 스킵, personal agent의 액션제안·지식
  첨부·source chip을 그 경로에 흡수.
- `dataScope`·캐시 앵커·local-only 불변식 회귀 테스트.

**DoD:** 코드/번역/일반 질문이 Chat에서 personal agent 없이 assistant flow로 동일 품질
응답. 브레인덤프는 여전히 가드 통과.

### 슬라이스 3 — 탭 제거 (Chat 하나만)

- Assistant 탭 + `AssistantPanel` 삭제. `runPersonalAgent` 은퇴(또는 domain_specific
  경로의 내부 헬퍼로 축소).
- breadcrumb 등 Assistant 전용 헤더 UI를 Chat 헤더로 이전.

**DoD:** 탭 없음. 단일 Chat이 즉답·구조화·learning path·저장을 전부 처리. `runPersonalAgent`
참조 0.

## 6. 열린 질문 (구현 시 결정)

- **액션 UI 통합**: AgentActionPreview(validate/apply)와 assistant save-as-task 카드를
  하나의 인라인 액션 컴포넌트로 합칠지, 경로별로 둘 다 둘지.
- **인라인 카드 히스토리**: 지난 턴의 구조 카드를 스트림에 계속 남길지(현재
  AssistantPanel은 마지막 턴만 렌더), 접어둘지.
- **intent 라벨 / knowledge 뱃지**: 헤더의 personal-agent 표시를 병합 후에도 유지할지.
