# FocusFlow AI 기능 문서

> 상태: **Phase 4 반영 완료** (2026-07-06)
> 관련 설계: `LOCAL_AI_SYSTEM_DESIGN.md`, `KNOWLEDGE_BASE_DESIGN.md`

이 문서는 Personal AI 채팅, AI Gateway, context builder, action preview/executor
구조를 설명한다. 과거의 Ollama 전용 채팅 provider 구조는 Phase 4에서 제거되었고,
현재 채팅 경로의 기본 런타임은 `llama-server` 기반 Local AI다.

---

## 1. 현재 AI 기능 요약

현재 앱은 플로팅 채팅 패널 형태의 `Personal AI`를 제공한다.

AI는 다음을 할 수 있다.

- 관리형 `llama-server` sidecar 또는 사용자가 지정한 OpenAI 호환 로컬 서버로 답변 생성
- 현재 앱의 할 일, 프로젝트, 공부 노트, 습관, 캘린더 context를 제한적으로 참고
- Obsidian 지식베이스 context를 로컬 endpoint일 때만 참고
- 사용자의 질문 intent를 간단히 분류
- AI가 제안한 task/calendar 변경을 typed action으로 파싱
- action preview를 보여주고 사용자가 Apply를 누르면 앱 데이터에 반영
- invalid action은 실행하지 않고 이유를 표시

AI는 다음을 하지 않는다.

- Ollama 채팅 provider를 사용하지 않는다.
- 유료 AI provider API를 frontend에서 직접 호출하지 않는다.
- OpenAI/Gemini/Anthropic API key를 frontend에 저장하지 않는다.
- delete action을 지원하지 않는다.
- 전체 planner/database를 AI에 그대로 보내지 않는다.
- 원격 endpoint에 Obsidian-derived context를 보내지 않는다.
- 사용자의 확인 없이 앱 데이터를 변경하지 않는다.

---

## 2. 실행 흐름

### 2.1 기본 채팅 흐름

```text
사용자 메시지 입력
  -> OllamaChat.submit()                  // 컴포넌트 이름은 레거시, UI 문구는 "AI 채팅"
  -> KnowledgeContextSource.buildContext()
  -> detectAgentIntent()
  -> buildAiContextText()
  -> runPersonalAgent()
  -> sendAiChat()
  -> gateway provider chain
       1. llamaServerProvider
       2. serverProvider
  -> 응답 표시
  -> typed action preview/apply
```

관련 파일:

```text
src/components/OllamaChat.tsx
src/lib/ai/agent/intent.ts
src/lib/ai/context/buildAiContext.ts
src/lib/ai/agent/personalAgent.ts
src/lib/ai/gateway.ts
src/lib/ai/providers/llamaServerProvider.ts
src/lib/ai/providers/serverProvider.ts
src/lib/localAi/runtime.ts
src/lib/knowledge/*
```

### 2.2 Provider 체인

AI Gateway는 provider를 이 순서로 시도한다.

```text
1. llama-server
   - managed mode: 앱이 `llama-server` sidecar를 on-demand 또는 app-start로 실행
   - external mode: 사용자가 지정한 OpenAI 호환 서버를 health check 후 사용

2. server
   - 기존 서버측 fallback endpoint
```

구현 위치:

```ts
// src/lib/ai/gateway.ts
const providers: AiProvider[] = [llamaServerProvider, serverProvider];
```

Phase 4 결정:

- `ollamaProvider`와 `remoteOllamaProvider`는 채팅 체인에서 제거했다.
- self-hosted 서버 연결은 Ollama 전용 프로토콜이 아니라 OpenAI 호환 endpoint로 통일한다.
- `appSettings.aiModel`은 Supabase에 이미 동기화된 기존 클라이언트 호환을 위해
  스키마 필드만 남긴다. UI에서는 더 이상 노출하지 않는다.

---

## 3. Local AI 런타임

`llamaServerProvider`는 요청마다 `ensureAiReady()`를 호출한다.

관리형 모드:

```text
ensureAiReady()
  -> Local AI settings 로드
  -> 선택 모델 설치 여부 확인
  -> 기존 llama-server health check
  -> 필요 시 src-tauri command로 llama-server spawn
  -> /health 준비 대기
  -> /v1/chat/completions 호출
```

외부 서버 모드:

```text
ensureAiReady()
  -> externalServerUrl health check: GET /v1/models
  -> 통과하면 /v1/chat/completions 호출
  -> 실패하면 provider unavailable
```

관리형 `llama-server`는 항상 `127.0.0.1`에만 바인딩한다. 포트 충돌 시 선호 포트부터
일정 범위 내에서 빈 포트를 찾는다.

---

## 4. Context와 Privacy Gate

AI 요청에는 크게 두 종류의 context가 있다.

```text
app context        할 일, 프로젝트, 캘린더, 공부 노트 등 앱 데이터 요약
knowledge context  Obsidian vault에서 검색/선정한 노트 내용
```

provider는 다음 능력 게이트를 가진다.

```ts
canHandleFullAppData?(): boolean;
canHandleKnowledgeContext?(): boolean;
```

원칙:

- 관리형 `llama-server`는 이 기기 안에서만 실행되므로 두 게이트가 true다.
- external mode는 URL이 localhost/127.0.0.1/[::1]일 때만 knowledge context를 허용한다.
- 원격 endpoint로 fallback되는 경우 knowledge context는 제거된다.
- Full planner/database를 그대로 보내지 않고, `buildAiContextText()`가 제한된 요약만 만든다.

---

## 5. Action Preview / Executor

AI는 앱 데이터를 직접 바꾸지 않는다. 응답에 typed action을 포함할 수 있고,
앱은 이를 파싱해 preview를 보여준 뒤 사용자가 Apply를 눌렀을 때만 실행한다.

지원 범위:

- task 생성/수정
- calendar block 생성/수정
- focus/study 흐름에 필요한 제한적 제안

비지원:

- delete action
- 사용자 확인 없는 자동 변경
- 스키마에 없는 임의 필드 변경

검증 레이어:

```text
LLM response
  -> typed action parser
  -> validation
  -> preview
  -> user Apply
  -> executor
```

---

## 6. Phase 5 임베딩 전환

채팅 경로의 Ollama 의존은 Phase 4에서 제거되었다. Full RAG 임베딩의 Ollama
의존도 Phase 5에서 기본 경로에서 제거되었다.

현재 기본 경로:

```text
src/lib/knowledge/embeddingProvider.ts
  -> Full RAG 임베딩
  -> Local AI 설정의 선택 모델
  -> llama-server /v1/embeddings
```

Phase 5에서 한 것:

- `llama-server --embeddings` 기반 embedding provider 추가
- Full RAG 색인과 retrieval을 새 provider로 이전
- 기존 `bge-m3`/`nomic-embed-text` 설정을 `local-ai`로 migration
- remote external endpoint에는 knowledge context/embedding 요청을 보내지 않음

---

## 7. 사용자 설정

Local AI 설정은 Supabase 동기화 대상이 아니다.

```text
storage key: focusflow.localAi.v1
```

포함:

- `launchMode`: `on-demand` | `on-app-start` | `external`
- `serverPort`
- `selectedModelId`
- `externalServerUrl`
- `serverBinaryPathOverride`
- `hardwareConsentGrantedAt`

포함하지 않음:

- GGUF 파일 내용
- 로컬 절대 경로를 Supabase appSettings에 저장하는 값
- 하드웨어 프로파일 영구 저장

---

## 8. 현재 남은 과제

출시 전 필수:

- 모델 카탈로그의 공식 GGUF URL/sha256 확정
- `llama-server` 바이너리 확보 방식 확정
  - 현재: PATH 또는 설정의 경로 오버라이드로 테스트 가능
  - 후속: 앱 로컬 bin 자동 설치 또는 릴리스 패키징

Phase 5 — 아키텍처 전환 완료:

- Full RAG 임베딩을 `llama-server` backend로 전환
- 유휴 자동 종료
- NVIDIA VRAM 감지
- Ollama 임베딩 provider를 기본 경로에서 제거

Phase 6 — 기존 배포 앱 통합 릴리스:

- `llama-server` 바이너리 설치/검증/업데이트 플로우
- 공식 GGUF URL/sha256이 채워진 모델 카탈로그
- 다운로드 실패, 체크섬 실패, 디스크 부족, 오프라인 UX
- 기존 `0.2.x` 사용자 데이터 유지
- Local AI opt-in feature gate

Phase 7 — 실제 기기 QA + staged rollout:

- 저사양/중간/고사양 Windows 기기 smoke test
- 모델 로딩 시간, 첫 응답 시간, 메모리 사용량 기준선
- Full RAG 색인/검색 성능 측정
- 내부 테스트 → 제한 공개 → 기본 노출
- 문제가 있으면 앱 전체가 아니라 Local AI 진입점부터 비활성화

Phase 8 — 운영 안정화:

- 민감정보를 제외한 진단 상태와 오류 코드
- 런타임 재설치, 모델 검증, 부분 다운로드 삭제, 설정 초기화
- Local AI 설정 schema migration
- 기존 앱 updater와 Local AI runtime/model catalog 버전 분리

Phase 9 — 선택 확장:

- 오래된 컴포넌트/CSS 이름(`OllamaChat`, `ollama-chat-*`) 정리
- 고급 RAG 검색, 모델별 프로필, GPU backend 고도화

---

## 9. 운영 메모

`npm run typecheck`와 `npm run build`가 Phase 4 기준 검증 명령이다.
Windows PowerShell 실행 정책 때문에 `npm.ps1`이 막히면 `npm.cmd run build`처럼
`.cmd`를 사용한다.
