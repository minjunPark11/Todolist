# 공간(Spaces) AI 브리핑 재설계 (하이브리드)

> 상태: **설계 확정** (2026-07-06) · 구현 전 문서
> 대상: FocusFlow 데스크톱/웹 — Spaces 페이지의 "AI 브리핑" 영역
> 관련 코드: `src/components/SpacesPage.tsx`, `src/lib/ai/*`, `src/utils/todayView.ts`
> 선행 문서: `LOCAL_AI_SYSTEM_DESIGN.md` (로컬 AI 런타임), `KNOWLEDGE_BASE_DESIGN.md`
> 결정 사항: 하이브리드 방식(로컬 AI 꺼져도 규칙 요약은 항상 동작) · 이 문서는 "설계만", 구현은 후속

---

## 1. 문제

현재 Spaces 페이지 상단의 "AI 브리핑"(`spc-brief`)은 데이터를 분석하지 않는 **껍데기**다.

- `analyzeSpaces()`는 650ms 지연 후 무조건 `"success"`로 전환 — 실제 분석 없음
  (`src/components/SpacesPage.tsx:382`)
- 성공 헤드라인의 **"LeetCode / Personal App"이 하드코딩** — 사용자 데이터와 무관하게
  존재하지 않는 프로젝트를 소개함 (`SpacesPage.tsx:537`)
- "Why this?" 모달은 정적 번역 문구 3줄 (`SpacesPage.tsx:641`)
- `deriveSignals`에도 `space-leetcode-demo` / `space-personal-app-demo` 데모 폴백과
  가짜 시간("30분 전")이 섞여 있음 (`SpacesPage.tsx:998`, `:1009`)

즉 사용자가 "실제 내 것을 분석하지 않는 느낌"이라고 한 지적이 정확하다.

## 2. 핵심 원칙

브리핑을 **두 층**으로 나눈다. AI 유무와 무관하게 절대 거짓말하지 않고, 로컬 AI가 있으면 더 깊어진다.

```
[1층 · 규칙 기반] 항상 동작 · 실제 데이터만 · 오프라인에서도 정확
        +
[2층 · AI 심화]   로컬 AI 켜졌을 때만 · 자연어 인사이트 · full-app=로컬 전용(프라이버시)
```

## 3. 이미 갖춰진 것 (재사용)

- `sendAiChat()` 게이트웨이 — 로컬 우선(llama-server → 서버 폴백), `dataScope: "full-app"`는
  `canHandleFullAppData()`(로컬 엔드포인트만 true)로 **원격 전송을 구조적으로 차단** (`src/lib/ai/gateway.ts:17`)
- `llamaServerProvider.isAvailable()` — 로컬 AI 실행/모델 로드 여부 감지 + 온디맨드 실행
  (`src/lib/ai/providers/llamaServerProvider.ts:71`)
- `buildAiContextText()` — 태스크/프로젝트/노트로 구조화 컨텍스트 생성 (`src/lib/ai/context/buildAiContext.ts:45`)
- `runPersonalAgent()` — system prompt + context + messages 조합 패턴 (`src/lib/ai/agent/personalAgent.ts:24`)
- 각 space의 `mainSignal` / `aiPriority`는 이미 실제 태스크·노트 수 기반으로 계산됨
  (`SpacesPage.tsx:948`, `:975`), `deriveSignals`도 실데이터 기반 (`SpacesPage.tsx:989`)

## 4. 1층 — 규칙 기반 베이스라인 (항상 표시)

**신규 순수 함수** `buildSpaceBriefing(spaces, signals, t)` → 신규 파일 `src/utils/spaceBriefing.ts`
(테스트 용이하게 컴포넌트 밖으로).

- 입력: 실제 파생물 — 각 space의 `aiPriority`/`mainSignal`, `deriveSignals` 결과
- 출력: `{ headline: string; detailLines: string[]; attentionSpaceIds: string[] }`
  - 예: **"주의가 필요한 공간 2개"** — `aiPriority === "High"`인 space 실명 나열
  - 세부: "OO 프로젝트 · 지연 3건", "△△ 학습 · 복습 5건 대기" (실제 카운트)
  - 주의 공간이 없으면: "모든 공간이 정상입니다" (기존 empty 계열 문구 재사용)
- `SpacesPage.tsx:537`의 하드코딩 `<span>LeetCode</span> … <span>Personal App</span>` 제거 →
  이 함수 출력으로 렌더

**부수 정리**: `deriveSignals`(`SpacesPage.tsx:989`)의 `space-*-demo` 폴백·가짜 age 제거.
실제 space 매칭에 실패한 시그널은 버린다.

## 5. 2층 — AI 심화 (로컬 AI 게이트)

`analyzeSpaces()`를 실제 호출로 교체:

```
1. setAnalysisState("loading")
2. available = await llamaServerProvider.isAvailable()      // 로컬 AI 켜짐/설치 확인
   - false → setAnalysisState("baseline")                  // 1층만 + "Local AI 켜면 더 깊은 분석" 힌트
3. context = 공간 요약 문자열 빌드
     (buildAiContextText 재사용 또는 공간 전용 축약:
      각 space 이름·타입·aiPriority·주요 signal·카운트)
4. res = await sendAiChat({
       dataScope: "full-app",                              // 게이트웨이가 로컬 전용 강제
       temperature: 0.3,
       messages: [ {system: SPACES_BRIEFING_PROMPT},
                   {system: context},
                   {user: "브리핑 생성"} ]
     })
5. 성공 → setAnalysisState("success"), 결과 저장(headline/근거), lastAnalyzedAt = now
   실패 → setAnalysisState("baseline") + 에러 힌트(res 에러 메시지)
```

- **프롬프트** `SPACES_BRIEFING_PROMPT` 신규 (`src/lib/ai/agent/prompts.ts`):
  "실제 공간 데이터만 근거로, **없는 프로젝트를 지어내지 말 것**. 우선순위 높은 공간과
  그 이유를 2~3문장으로." — 환각(없는 프로젝트) 방지 지침 명시
- **"Why this?" 모달**: 정적 3줄 대신 AI 근거(또는 baseline의 `detailLines`) 표시
- **"View signals" 모달**: 이미 실데이터 → 데모 폴백만 제거하면 그대로 유효

## 6. 상태 머신 변경

현재 `"empty" | "loading" | "success" | "insufficient" | "error"` 에 **`"baseline"`** 추가:

- `empty`: 공간 0개 (기존 유지)
- `baseline`: 공간은 있고 규칙 요약은 있으나 AI 미사용/불가 → **1층만** 렌더 + 심화 유도 힌트
- `loading` → `success`(AI 결과) 또는 `baseline`(AI 실패로 폴백)
- `insufficient`: **미결정** — 공간이 있으면 항상 최소 baseline을 보여줄 수 있으므로
  baseline으로 흡수 가능. 구현 시 사용자 확인 필요(아래 열린 질문)

버튼 disabled 로직 조정: `success`가 아니어도 baseline에서 "Why this?"는 규칙 근거로 열 수 있게.

## 7. 데이터 흐름

```
spaces + signals ──► buildSpaceBriefing() ──► 1층(항상)
                                               │
"Analyze" 클릭 ─► isAvailable? ──no──► baseline + 힌트
                     │yes
                     ▼
         context ─► sendAiChat(full-app, 로컬) ─► success(2층) / 실패→baseline
```

## 8. 변경 파일

| 파일 | 변경 |
|------|------|
| `src/utils/spaceBriefing.ts` (신규) | `buildSpaceBriefing` 순수 함수 |
| `src/components/SpacesPage.tsx` | `analyzeSpaces` 재작성, 하드코딩 헤드라인 제거, `buildSpaceBriefing` 사용, 상태 `baseline` 추가, 모달 근거 연결 |
| `src/components/SpacesPage.tsx` (`deriveSignals`, `:989`) | 데모 폴백/가짜 age 제거 |
| `src/lib/ai/agent/prompts.ts` | `SPACES_BRIEFING_PROMPT` 추가 |
| `src/i18n/ko.ts`, `src/i18n/en.ts` | `spaces.brief.*` baseline/힌트 문구 추가, 하드코딩 recommend 문구 정리 |

## 9. 프라이버시

`dataScope: "full-app"`은 게이트웨이가 `canHandleFullAppData()`(로컬 엔드포인트만 true)로
이미 강제하므로, 공간 전체 데이터가 원격 서버로 나가지 않는다 — 하이브리드의
"로컬 켜졌을 때만 심화"가 구조적으로 보장된다 (`gateway.ts:17`).

## 10. 범위 밖 (후속)

- 브리핑 결과 캐싱/영속화(재방문 시 재분석 안 하게)
- 스트리밍 출력, 다국어 프롬프트 튜닝
- 자동 트리거(진입 시 자동 분석) — 현재는 사용자가 버튼을 눌러야 함

## 11. 열린 질문 (구현 착수 전 확정)

1. `insufficient` 상태를 `baseline`으로 흡수할지, 별도로 남길지
2. AI 심화 결과를 세션/영속 저장할지 (10번 후속과 연동)
3. baseline에서 "AI" 라벨을 유지할지, AI 미사용 시 "요약"으로 바꿀지
