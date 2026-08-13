# Learning Path (큰 방향 → 학습 경로 → 중간 목표)

> 상태: **설계** (구현 전). Path 슬라이스 A 착수용 기준 문서.
> 기반 비전은 메모리 노트 `ai-stuck-to-execution-vision.md`. 이 문서는 그 비전 중
> "개인 선생님/커리큘럼" 확장을 실제 착수 가능한 스펙으로 구체화한다.

## 0. 한 줄 정의

지금까지의 파이프라인은 **하나의 막힌 일**을 실행 단위까지 끌고 가는 것
(`goal_captured → scoping → info_gathering → planned → executing`, 슬라이스 1~4 완료).
Learning Path는 그 위에 **여러 카드를 관통하는 하나의 목표선(線)** 을 얹는다:
사용자가 "어디로 가는 중이고, 지금 그 길의 어디에 있는지"를 항상 알게 하는 레이어.

- **큰 방향** = LearningPath.goal
- **학습 경로** = LearningPath (마일스톤들의 순서)
- **중간 목표** = Milestone

## 1. 기존 자산과의 관계 (새 실행 경로를 만들지 않는다)

이 기능은 처음부터 새로 만드는 게 아니라, 이미 있는 결정적 하부 구조를 경로 레벨로 재사용한다.

| 이미 있는 것 | 위치 | 경로에서의 재사용 |
| --- | --- | --- |
| `ContextCard` (막힌 일 1개 스냅샷) | `contextCards/types.ts` | 마일스톤 1개 = 카드 0~N개 |
| `CardStage` 5단계 + `resolveCardStage` | `assistant/infoSlots.ts:150` | 마일스톤 상태를 카드 stage 집계로 파생 |
| `InfoSlot` 6종 + 결정적 resolver | `assistant/infoSlots.ts` | **경로 레벨 슬롯**으로 동형 재사용 |
| `PlanStep` + SMART 내부 검증기 | `assistant/planSteps.ts` | rolling-wave: 현재 마일스톤만 plan 해상도 |
| 로컬 KV 스토어 (동기 안 함) | `contextCards/store.ts` | 동일 패턴의 `learningPaths.v1` 블롭 |
| Generic Failure Guard | `assistant/validateAssistantResponse.ts` | 경로 초안도 동일 guard 통과 필수 |

**핵심 계약 3개 (기존 파이프라인에서 그대로 승계):**

1. **모델은 제안만, 판정은 결정적으로.** stage/슬롯/plan 어느 것도 모델 출력을 신뢰하지 않는다. 경로의 현재 위치·마일스톤 상태도 마찬가지로 순수 함수가 계산한다.
2. **정보 수집은 게이트가 아니다.** 모든 슬롯은 `assumed_default`로 단락 가능. 경로도 미해결 정보 때문에 막히지 않는다.
3. **본문 / 카드 역할 분리.** SMART·내부 판정 용어는 사용자 표면에 절대 노출 안 함 (0.3.6에서 확립).

## 2. 데이터 모델 (슬라이스 A)

`contextCards/types.ts` 옆에 새 타입 파일 `learningPaths/types.ts` 신설. ContextCard와
동일하게 **optional 필드 위주 + 하위호환 sanitize** 원칙을 따른다.

```ts
// 하나의 마일스톤. "관찰 가능한 산출물"이 있어야 완료를 yes/no로 판정 가능
// (possibleOutput / completionCriteria 철학 승계).
export type Milestone = {
  id: string;
  title: string;              // "HSK4 단어 800개 암기" — 작은 상태가 아닌 도달점
  doneCriteria: string;       // 관찰 가능한 완료 기준 (isObservableOutput 통과 대상)
  // 이 마일스톤에 연결된 ContextCard들. 카드 stage 집계로 마일스톤 상태를 파생.
  cardIds: string[];
  // 결정적으로 계산됨 — 모델이 정하지 않음 (resolveMilestoneStatus).
  status?: "upcoming" | "current" | "done";
};

export type LearningPath = {
  id: string;
  goal: string;               // 큰 방향 한 문장
  // 순서가 곧 경로. index 순으로 진행.
  milestones: Milestone[];
  // 경로 레벨 정보 슬롯 — InfoSlotKind 6종을 그대로 재사용하되 경로 스코프.
  infoSlots?: InfoSlot[];
  source: "assistant" | "user";
  createdAt: string;
  updatedAt: string;
};

export type LearningPathDraft = Omit<LearningPath, "id" | "source" | "createdAt" | "updatedAt">;
```

### 현재 위치 파생 (결정적)

```
resolveMilestoneStatus(milestone, cards):
  연결된 카드들의 stage를 본다.
  - 모든 카드가 executing/완료 → "done"
  - 하나라도 진행 중(scoping~planned/executing) → "current"
  - 전부 goal_captured거나 카드 없음 → "upcoming"

currentMilestone(path) = 첫 번째 status !== "done" 마일스톤
```

`currentMilestone` 하나가 UI의 breadcrumb·rolling-wave·위치 문장의 단일 소스가 된다.

## 3. 슬라이스 분해

메모리 비전의 A/B/C를 그대로 따르되, 각 슬라이스가 **독립적으로 배포 가능**하도록 자른다.

### 슬라이스 A — 엔티티 + 경로 초안 제안 + breadcrumb  ← 이번 착수

목표: 사용자가 목표를 말하면 AI가 **마일스톤 3~5개짜리 경로 초안**을 제안하고,
사용자가 승인하면 저장되며, 이후 어시스턴트 패널 상단에 **breadcrumb**(현재 경로/현재 마일스톤)이 뜬다.

1. `learningPaths/types.ts` + `learningPaths/store.ts` (store.ts 복제 패턴, `learningPaths.v1`).
2. `assistant/pathDraft.ts` — 결정적 검증기. 모델이 제안한 마일스톤 배열을 받아:
   - 각 마일스톤 `doneCriteria`가 관찰 가능한지 (`isObservableOutput` 재사용)
   - 개수 3~5개로 클램프, 모호/중복 제거
   - 실패 시 게이트가 아니라 **수리/파킹** (infoSlots 철학)
3. 어시스턴트 프롬프트에 `learning_path` 제안 블록 추가 (스키마 확장 + `validateAssistantResponse` 동형 검증).
4. `AssistantPanel.tsx`: 경로 초안 카드 + "경로로 저장" 버튼, 저장 후 상단 breadcrumb 렌더.
   - breadcrumb 위치: 현재 `cardDraft.stage` 칩(`AssistantPanel.tsx:268`)과 같은 헤더 영역.
5. i18n: `ai.assistant.path.*` 키 (ko/en).

**슬라이스 A 완료 정의(DoD):** 목표 입력 → 경로 초안 제안 → 승인 저장 → 재진입 시
breadcrumb에 "목표 · 현재 마일스톤" 한 줄이 뜬다. 카드 연결·적응·회고는 아직 없음.

### 슬라이스 B — 마일스톤 ↔ 카드 링크 + 위치 문장  ← 구현됨

- 새 브레인덤프 카드를 경로의 마일스톤에 연결 (`Milestone.cardIds`).
- rolling-wave: **현재 마일스톤에 연결된 카드만** plan step 해상도로 전개. 나머지는 제목만.
- 응답마다 **위치 문장 한 줄**: "지금 [경로]의 [N/M] '[현재 마일스톤]' 단계예요." (본문 앞, 결정적 생성).

**슬라이스 B 확정 결정 (2026-07-09):**

- **링크 UX = 제안 + 원클릭 확인.** 카드 저장 시 `matchMilestone.ts`의 결정적 매처
  (마일스톤 제목 토큰 겹침, 겹침 없으면 현재 마일스톤 폴백)가 마일스톤 1개를 제안하고,
  사용자가 "○○에 연결" 버튼 한 번으로 확정. 자동 연결 없음 — 링크도 저장처럼 사용자 승인 액션.
- **rolling-wave는 저장된 카드 렌더에만 적용.** 관련 카드 목록에서 비(非)현재 마일스톤에
  연결된 카드는 제목+마일스톤 태그만 렌더. 새 턴의 plan 생성 로직(runAssistantTurn)은
  건드리지 않음 — 턴 시점 plan 억제(예측 매칭 필요)는 하지 않기로 함.
- **위치 문장은 패널이 결정적으로 렌더.** `formatBreadcrumb` 결과 + i18n
  (`ai.assistant.path.position`)로 본문 `<p>` 앞에 표시. 모델 출력에 넣지 않는다.

### 슬라이스 C — 적응 제안 + 주기 회고

- outcome log 집계 기반 **적응 제안** (자동 변경 금지 — 항상 사용자 승인).
- 주기 회고: 완료 마일스톤/막힌 지점 요약 → 다음 마일스톤 재확인.

## 4. 확정된 결정 (2026-07-09)

- **경로 초안 트리거: 명시 요청 시에만.** "학습 경로 만들어줘", "커리큘럼 짜줘", "큰 목표를
  단계로 나눠줘"처럼 경로 생성을 직접 요청할 때만 LearningPath draft를 제안한다.
  일반 overwhelm 입력이나 "뭐부터 해야 해?" 같은 next action 요청에서는 기존 fallback
  흐름을 건드리지 않는다.
- **경로↔카드 선후: 슬라이스 A는 "경로 먼저".** A에서는 LearningPath 저장 + breadcrumb
  표시까지만 구현. `Milestone.cardIds` 연결, 기존 ContextCard를 마일스톤에 붙이는 기능,
  카드가 쌓였을 때 경로를 제안하는 양방향 흐름은 전부 슬라이스 B.
- **저장 위치**: 카드와 동일하게 로컬 KV(동기 안 함) 유지. 기기 간 공유는 범위 밖.

관련 문서: [[Features/AI_Assistant]], [[Architecture/App_Flow]]
관련 메모리: `ai-stuck-to-execution-vision.md`
