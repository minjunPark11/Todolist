# AI Assistant

## 관련 파일

- `C:\Users\minju\Todolist\src\components\OllamaChat.tsx`
- `C:\Users\minju\Todolist\src\components\ai\AgentActionPreview.tsx`
- `C:\Users\minju\Todolist\src\lib\ai\gateway.ts`
- `C:\Users\minju\Todolist\src\lib\ai\types.ts`
- `C:\Users\minju\Todolist\src\lib\ai\providers\ollamaProvider.ts`
- `C:\Users\minju\Todolist\src\lib\ai\providers\remoteOllamaProvider.ts`
- `C:\Users\minju\Todolist\src\lib\ai\providers\serverProvider.ts`
- `C:\Users\minju\Todolist\src\lib\ai\agent\personalAgent.ts`
- `C:\Users\minju\Todolist\src\lib\ai\agent\intent.ts`
- `C:\Users\minju\Todolist\src\lib\ai\agent\prompts.ts`
- `C:\Users\minju\Todolist\src\lib\ai\agent\actionParser.ts`
- `C:\Users\minju\Todolist\src\lib\ai\agent\actions.ts`
- `C:\Users\minju\Todolist\src\lib\ai\tools\toolExecutor.ts`
- `C:\Users\minju\Todolist\src\lib\ai\context\buildAiContext.ts`
- `C:\Users\minju\Todolist\src\lib\calendarContext.ts`

## 구현된 기능

- 구현됨: floating chat panel
- 구현됨: local Ollama provider 기본값 `http://localhost:11434`, model `gemma3`
- 구현됨: remote Ollama fallback. `VITE_REMOTE_OLLAMA_ENABLED=true`일 때만 활성화
- 구현됨: intent detection 후 daily planning, weekly planning, task organization, study coaching 등 context 범위 조정
- 구현됨: current app context를 compact JSON으로 생성
- 구현됨: Calendar page에서는 이번 주 calendar context 추가
- 구현됨: assistant 응답의 ```agent_actions``` block 파싱
- 구현됨: 지원 action preview와 validation
- 구현됨: 사용자 확인 후 task 생성, calendar event 생성, subtask split, due date 변경, priority 변경 실행

## 현재 provider 체인

`C:\Users\minju\Todolist\src\lib\ai\gateway.ts` 기준:

1. `ollamaProvider`
2. `remoteOllamaProvider`

## 미구현 또는 개선 필요

- 개선 필요: `serverProvider` 파일은 있지만 현재 `gateway.ts`의 provider 배열에 포함되어 있지 않다.
- 개선 필요: AI action은 task/calendar 중심이며 Study note 생성, project update, archive 등은 아직 action type에 없다.
- 개선 필요: AI는 앱 데이터를 직접 바꾸지 않고 action suggestion만 한다. 이 정책은 안전하지만 사용자가 기대하는 자동 실행과는 다를 수 있다.
- 추정: 최근 작업은 local Ollama 중심에서 remote fallback과 agent action preview 쪽으로 확장된 것으로 보인다.

## 리팩토링 후보

- provider registry를 설정 기반으로 만들고 `serverProvider` 연결 여부를 명확히 결정.
- action type별 executor를 `App.tsx`에서 분리해 `lib\ai\tools` 또는 feature command layer로 이동.
- context builder 테스트 추가. 특히 date filtering과 context limit truncation은 회귀 위험이 있다.

관련 문서: [[Architecture/App_Flow]], [[Features/Calendar]]
