# Local AI System 설계 (llama-server sidecar 기반)

> 상태: **설계 확정 + 최소 스캐폴드** (2026-07-06) · 단계적 구현 전 문서
> 대상: FocusFlow 데스크톱(Tauri) 앱
> 관련 코드: `src/lib/localAi/*`, `src/lib/ai/*`, `src/platform/*`, `src-tauri/src/local_ai.rs`
> 선행 문서: `KNOWLEDGE_BASE_DESIGN.md` (Obsidian 지식베이스), `AI_OLLAMA_FEATURES.md`

---

## 1. 설계 요약

지금까지 앱의 AI 기능은 사용자가 **Ollama를 직접 설치·실행**해야 동작했다
(`src/lib/ai/gateway.ts`의 provider 체인: `ollama → remote-ollama → server`).
이 문서는 그 의존성을 제거하는 **앱 관리형(managed) 로컬 AI 런타임**을 설계한다.

```
Focus Todo 앱
→ PC 사양 검사 (사용자 동의 후)
→ 적합한 GGUF 모델 추천
→ 앱 안에서 모델 다운로드 (allowlist + sha256 검증)
→ Tauri sidecar로 llama-server 자동 실행
→ localhost OpenAI 호환 API(/v1/chat/completions) 호출
→ Todo / Calendar / Focus / Obsidian 컨텍스트 기반
   오늘 브리핑 · 작업 쪼개기 · 집중 세션 추천
```

### 핵심 원칙 (불변 규칙)

| # | 원칙 |
|---|------|
| 1 | **Ollama 의존 없음.** 정식 경로는 `llama.cpp`의 `llama-server`를 Tauri sidecar로 자동 실행하는 것이다. Ollama 전용 chat provider는 Phase 4에서 제거했고, Full RAG 임베딩도 Phase 5에서 `llama-server` `/v1/embeddings`로 전환했다. 외부 서버 연결은 일반 OpenAI 호환 서버(LM Studio, LocalAI 등)로 통일한다. |
| 2 | **모델 파일은 앱 설치 파일에 포함하지 않는다.** GGUF는 앱 내 모델 설치 화면에서 다운로드하고, OS별 앱 로컬 데이터 폴더에 저장한다. |
| 3 | **llama-server 바이너리는 sidecar로 포함할 수 있게 설계만 한다.** 실제 바이너리는 git에 커밋하지 않는다 (§7). |
| 4 | **AI는 앱 시작 시 무조건 켜지 않는다.** 기본값은 "AI 기능 사용 시 자동 실행(on-demand)"이며, "앱 시작 시 미리 실행", "외부 서버 연결"은 옵션이다. |
| 5 | **PC 사양 검사는 사용자 동의 후에만 실행한다.** 수집 정보(RAM/CPU/GPU/디스크/OS/아키텍처)는 모델 추천에만 쓰고 외부로 전송하지 않는다. UX 문구로 명시한다 (§9). |
| 6 | **Obsidian vault 전체를 LLM에 통째로 보내지 않는다.** 기존 `KnowledgeContextSource`(Lite 키워드 매칭 → Full RAG) 구조를 그대로 재사용한다 (§8). |
| 7 | **경로 정보는 Supabase 동기화 대상(appSettings)에 넣지 않는다.** 모델 경로·vault 경로·index DB 경로는 기기 로컬 storage 전용이다. `KnowledgeSettings`(`focusflow.knowledge.v1`)와 동일한 패턴으로 `focusflow.localAi.v1` 키를 분리한다. |
| 8 | **다운로드 URL은 allowlist 기반으로만 허용한다.** 진행률·취소·재시도·sha256 검증을 갖춘다. 개인정보·로컬 파일 내용을 외부 API로 보내지 않는다. |

원칙 6~8은 `KNOWLEDGE_BASE_DESIGN.md`의 원칙 4~10과 같은 계열이며, 기존
`canHandleFullAppData()` / `canHandleKnowledgeContext()` 게이트를 그대로 계승한다.

---

## 2. 전체 아키텍처

```
┌────────────────────────────── Desktop (Tauri) ──────────────────────────────┐
│                                                                              │
│  React (src/)                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Local AI Setup UI (Phase 1+)                                           │ │
│  │   └─ useLocalAiSettings() ── focusflow.localAi.v1 (local-only storage) │ │
│  │                                                                        │ │
│  │ src/lib/localAi/                                                       │ │
│  │   types.ts          공유 타입 (HardwareProfile, LocalModelOption …)     │ │
│  │   modelCatalog.ts   ModelCatalog — 추천 모델 정의 + URL allowlist       │ │
│  │   recommender.ts    ModelRecommender — 사양 → 추천 (순수 함수)           │ │
│  │   settings.ts       local-only 설정 저장 + useLocalAiSettings 훅        │ │
│  │   runtime.ts        AiRuntimeManager — ensureAiReady() 오케스트레이션    │ │
│  │                                                                        │ │
│  │ src/lib/ai/gateway.ts  provider 체인 (Phase 4 반영)                     │ │
│  │   llamaServer(관리형 sidecar 또는 외부 OpenAI 호환 서버) → server         │ │
│  │                                                                        │ │
│  │ src/lib/knowledge/*    KnowledgeContext (기존 그대로 재사용)             │ │
│  └───────────────┬────────────────────────────────────────────────────────┘ │
│                  │ platform.localAi.* (src/platform/{types,web,tauri}.ts)    │
│                  ▼ invoke()                                                  │
│  Rust (src-tauri/src/local_ai.rs)                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ get_local_ai_hardware_profile   HardwareProfiler (OS/arch/CPU/RAM/디스크)│ │
│  │ get_local_ai_models_dir         모델 저장 폴더 생성/조회                  │ │
│  │ list_local_ai_models            설치된 *.gguf 목록                       │ │
│  │ get_local_ai_runtime_status     sidecar 상태 (Phase 3까지 stub)          │ │
│  │ (Phase 2) download_local_ai_model / cancel …                            │ │
│  │ (Phase 3) start/stop llama-server sidecar                               │ │
│  └───────────────┬────────────────────────────────────────────────────────┘ │
│                  │ spawn (tauri-plugin-shell sidecar, Phase 3)               │
│                  ▼                                                           │
│  llama-server (src-tauri/binaries/, git 미포함)                               │
│    --model <app-local-data>/models/<file>.gguf --port <설정값, 예 39281>      │
│    → http://127.0.0.1:<port>/v1/chat/completions (OpenAI 호환)               │
└──────────────────────────────────────────────────────────────────────────────┘

외부 서버 연결 모드(옵션): LM Studio(1234) / LocalAI 등 OpenAI 호환 서버
사용자가 직접 띄운 서버 URL로 같은 인터페이스를 통해 연결.
```

### 모델/데이터 저장 위치

Tauri의 `app_local_data_dir()` 기준 (identifier: `com.focusflow.desktop`):

| OS | 모델 폴더 |
|----|-----------|
| Windows | `C:\Users\<user>\AppData\Local\com.focusflow.desktop\models\` |
| macOS | `~/Library/Application Support/com.focusflow.desktop/models/` |
| Linux | `~/.local/share/com.focusflow.desktop/models/` |

- 다운로드 중 임시 파일: `models/<file>.gguf.partial` (완료·검증 후 rename)
- 이 경로는 절대 appSettings(Supabase sync 대상)에 넣지 않는다.

---

## 3. HardwareProfiler

**역할**: OS · CPU 아키텍처 · CPU 코어 수 · RAM · GPU/VRAM(가능한 범위) ·
디스크 여유 공간을 확인해 모델 추천의 입력을 만든다.

**실행 시점**: Local AI Setup 화면에서 사용자가 "내 기기 검사하기"를 누른 뒤에만.
백그라운드 자동 수집 금지 (원칙 5).

**구현 위치**: `src-tauri/src/local_ai.rs::get_local_ai_hardware_profile`
(Rust `sysinfo` crate — RAM/디스크는 순수 로컬 조회, 네트워크 없음).

```ts
// src/lib/localAi/types.ts
type HardwareProfile = {
  os: string;                    // "windows" | "macos" | "linux"
  arch: string;                  // "x86_64" | "aarch64" …
  cpuCoreCount: number;          // 논리 코어 수
  totalRamGb: number | null;     // 조회 실패 시 null → 보수적 추천 + 경고
  availableDiskGb: number | null;// 모델 폴더가 위치할 디스크의 여유 공간
  gpu: { name: string; vramGb: number | null } | null; // Phase 1까지 null
};
```

**GPU/VRAM 검토 결론**: 크로스플랫폼 단일 API가 없다.
- macOS(Apple Silicon): unified memory → RAM 값으로 충분, Metal 가속은 기본 가능.
- Windows/Linux: `wgpu` 어댑터 열거(이름) + NVIDIA는 `nvml-wrapper`(VRAM)로 단계 도입.
- **Phase 1에서는 `gpu: null`로 두고 RAM 기반 추천만 사용.** VRAM 기반 추천(§5)은
  GPU 감지가 들어오는 Phase에서 활성화. TODO를 코드에 남겼다.

---

## 4. ModelCatalog

**구현 위치**: `src/lib/localAi/modelCatalog.ts`

초기 후보 (모두 GGUF Q4_K_M):

| tier | 모델 | 크기(추정) | 최소 RAM | 권장 RAM |
|------|------|-----------|---------|---------|
| light | Qwen2.5 3B Instruct | ~2.0GB | 6GB | 8GB |
| recommended | Qwen2.5 7B Instruct | ~4.7GB | 12GB | 16GB |
| coding | Qwen2.5 Coder 7B Instruct | ~4.7GB | 12GB | 16GB |
| highPerformance | Qwen2.5 14B Instruct | ~9.0GB | 24GB | 32GB |

```ts
type LocalModelOption = {
  id: string;
  displayName: string;
  family: string;
  parameterSize: "3B" | "7B" | "8B" | "14B";
  quantization: "Q4_K_M" | "Q5_K_M" | "Q8_0";
  recommendedTier: "light" | "recommended" | "coding" | "highPerformance";
  estimatedSizeGb: number;
  minRamGb: number;
  recommendedRamGb: number;
  description: string;
  downloadUrl?: string;    // TODO(release): 공식 GGUF URL 확정 (allowlist 호스트)
  expectedSha256?: string; // TODO(release): 파일 해시 확정 — 없으면 다운로드 버튼 비활성
};
```

- **URL/해시는 이번 커밋에서 placeholder.** 출시 전 Hugging Face 공식 리포지토리
  (`Qwen/Qwen2.5-*-Instruct-GGUF`)의 파일 URL과 sha256을 검증해 채운다.
- `MODEL_DOWNLOAD_ALLOWLIST`: `huggingface.co`, `cdn-lfs.huggingface.co` 등
  allowlist에 없는 호스트로의 다운로드는 코드 레벨에서 거부.

---

## 5. ModelRecommender

**구현 위치**: `src/lib/localAi/recommender.ts` — **순수 함수** (I/O 없음, 테스트 용이).

추천 기준:

```
RAM ≤ 8GB        → light (1.5B~3B Q4)
RAM ≤ 16GB       → recommended (7B/8B Q4)
RAM ≥ 32GB       → highPerformance (14B Q4) 또는 7B Q5
RAM 조회 실패     → light + 경고 ("메모리 확인 불가, 보수적 추천")

VRAM ≥ 6GB       → "7B Q4 GPU 가속 가능" 안내 (warnings에 추가)
VRAM ≥ 12GB      → 14B Q4 또는 고품질 8B 추천
디스크 < 모델크기+2GB → 공간 부족 경고
```

```ts
type ModelRecommendation = {
  primary: LocalModelOption;
  alternatives: LocalModelOption[]; // "더 가벼운 / 코딩 특화 / 고급" 선택지
  reason: string;                   // 예: "RAM 16GB → 7B Q4_K_M이 속도·품질 균형이 좋아요."
  warnings: string[];               // 공간 부족, RAM 조회 실패, GPU 안내 등
};
```

---

## 6. ModelInstaller (Phase 2 — 이번 커밋은 인터페이스만)

**다운로드 흐름 (상세)**:

```
사용자: 카탈로그에서 모델 선택 → "다운로드"
 1. 검증: downloadUrl 존재 + URL 호스트가 MODEL_DOWNLOAD_ALLOWLIST에 포함
         + expectedSha256 존재 (없으면 시작 거부)
 2. 공간 확인: availableDiskGb ≥ estimatedSizeGb + 2GB 여유
 3. Rust command `download_local_ai_model(modelId)` 시작
    - 저장: models/<file>.gguf.partial
    - HTTP Range 이어받기: .partial 존재 시 `Range: bytes=<len>-`
    - 진행률: Tauri event `local-ai://download-progress`
      { modelId, receivedBytes, totalBytes } (500ms throttle)
 4. 취소: `cancel_local_ai_download(modelId)` → CancellationToken → .partial 유지
    (재시도 시 이어받기), 명시적 삭제 시에만 .partial 제거
 5. 재시도: 지수 백오프(2s/4s/8s) 최대 3회 자동, 이후 수동 재시도 버튼
 6. 완료 검증: 전체 파일 sha256 스트리밍 계산 == expectedSha256
    - 불일치 → .partial 삭제 + "파일 검증 실패" 오류 (부분 신뢰 금지)
 7. rename: .partial → .gguf (원자적) → 설치 목록 갱신
```

- 다운로드는 **Rust 쪽에서 수행** (reqwest + tokio streaming). WebView fetch는
  수 GB 파일의 메모리/취소/이어받기 제어가 어렵다.
- 설치 목록: `list_local_ai_models` (models 폴더의 *.gguf 스캔 — 이번 커밋에 구현됨).
- 삭제: 파일 삭제 + 목록 갱신. 실행 중인 모델은 서버 정지 후 삭제.

---

## 7. AiRuntimeManager

**구현 위치**: TS 오케스트레이션 `src/lib/localAi/runtime.ts` +
Rust sidecar 제어 `src-tauri/src/local_ai.rs` (Phase 3).

### ensureAiReady() 흐름

```
사용자: "오늘 브리핑" 클릭
→ ensureAiReady()
   ├─ launchMode === "external"
   │    → externalServerUrl health check → 성공 시 baseUrl 반환
   ├─ (managed) 선택된 모델이 설치되어 있는가? ── 아니오 → "모델 설치 필요" 반환
   │                                              (UI가 Setup 화면으로 유도)
   ├─ llama-server가 이미 실행 중인가? (GET /health)
   │    → 예: baseUrl 반환
   ├─ 아니오 → sidecar spawn (Phase 3)
   │    llama-server --model <path> --port <port> --host 127.0.0.1
   ├─ health check 폴링 (최대 ~30s: 모델 로딩 시간)
   └─ 성공 → /v1/chat/completions 사용 가능
```

### sidecar 구성 (Phase 3 — 구현됨: 런타임 바이너리 해석 방식)

**결정**: 빌드 타임 `externalBin` 대신 **런타임에 llama-server 바이너리를
찾는다**. externalBin은 파일이 없으면 빌드가 깨지므로, 바이너리 배치
파이프라인 없이도 저장소 빌드가 항상 성공하도록 이 방식을 정식 경로로 삼았다.
externalBin/리소스 번들링은 **추가적인** 패키징 단계로 남는다(아래 탐색 순서에
리소스 경로만 끼워 넣으면 됨).

1. **바이너리 탐색 순서** (`resolve_server_binary`):
   1. `LocalAiSettings.serverBinaryPathOverride` (설정 UI의 고급 항목, 로컬 전용)
   2. `<app-local-data>/bin/llama-server(.exe)` — 향후 "바이너리 자동 설치"가
      배치할 위치 (llama.cpp 공식 릴리스 zip을 받아 풀어 넣는 것도 이 폴더)
   3. 시스템 PATH
   4. (향후) Tauri 리소스/externalBin 경로 — 패키징 파이프라인 도입 시 2와 3 사이에 추가
   - 어디에도 없으면 배치 방법을 안내하는 명확한 오류를 돌려준다.
2. **실행 옵션**: `-m <모델> --host 127.0.0.1 --port <탐색된 포트> --ctx-size 4096`.
   127.0.0.1 바인딩은 코드에 고정(외부 노출 금지, §11.4). GPU 레이어(-ngl)는
   GPU 감지 도입 시 추가.
3. **포트**: `serverPort`(기본 39281)부터 +20 범위에서 빈 포트를 탐색하고,
   실제 사용 포트를 `LocalAiRuntimeStatus.port`로 보고한다. 프론트는 보고된
   포트로 baseUrl을 만든다.
4. **준비 판정**: spawn은 즉시 반환하고, 프론트(`runtime.ts`)가 `GET /health`를
   1초 간격 최대 60초 폴링한다 (모델 로딩 동안 503 → 준비되면 200).
5. **정리**: `RunEvent::Exit`에서 child kill (main.rs). 같은 모델이 이미 떠
   있으면 재사용, 다른 모델이면 기존 프로세스를 내리고 새로 띄운다. crash된
   child는 `try_wait()`로 회수해 stale "running" 보고를 막는다.
   Windows Job Object(앱 강제종료 시 좀비 방지)는 후속 검토.
6. **유휴 정지(옵션, 후순위)**: N분 미사용 시 자동 종료로 메모리 회수.
7. **바이너리 자동 설치(후속)**: 모델 다운로더와 동일한 allowlist+sha256
   구조로 llama.cpp 공식 릴리스( github.com/ggml-org/llama.cpp )에서 받아
   `<app-local-data>/bin`에 설치. zip 해제 필요(Windows는 DLL 동반).

### 실행 모드 (LocalAiSettings.launchMode)

| 모드 | 값 | 동작 |
|------|----|------|
| 필요할 때 자동 실행 (기본) | `on-demand` | AI 기능 첫 사용 시 ensureAiReady()가 spawn |
| 앱 시작 시 미리 실행 | `on-app-start` | 앱 부팅 후 백그라운드 spawn (모델 로딩 선반영) |
| 외부 서버에 연결 | `external` | spawn 안 함. externalServerUrl로 연결 (LM Studio/LocalAI 등 OpenAI 호환 서버) |

### 기존 provider 체인과의 통합 (Phase 4 — 구현됨)

`src/lib/ai/providers/llamaServerProvider.ts`가 OpenAI 호환
`/v1/chat/completions`를 호출하고, `gateway.ts` 체인의 **맨 앞**에 선다.
**Ollama 전용 provider(로컬/원격)는 삭제했다**:

```
llamaServer(관리형 sidecar, 또는 external 모드의 OpenAI 호환 서버) → server
```

- chat 호출 시 provider가 `ensureAiReady()`를 수행 — on-demand 모드에선 이
  순간 sidecar가 뜨고 모델이 로드된다(의도된 흐름).
- `canHandleFullAppData()` / `canHandleKnowledgeContext()`는 엔드포인트가
  localhost일 때만 true — 관리형은 항상, external은 URL이 로컬일 때만.
- 채팅의 모델 선택 UI(Ollama 태그 목록)는 제거 — 관리형에선 모델이 Local AI
  설정(selectedModelId)에서 정해진다. `appSettings.aiModel`은 sync 스키마
  호환을 위해 필드만 남긴 레거시.
- Full RAG 임베딩(`embeddingProvider.ts`)도 Phase 5에서 로컬 `llama-server`
  `/v1/embeddings`로 전환했다.

---

## 8. KnowledgeContext 연계

**새로 만들지 않는다.** 기존 구조를 그대로 쓴다:

- Lite: `src/lib/knowledge/liteContextSource.ts` — 파일명/제목/heading/tag
  키워드 매칭 + 최근 수정순. (이미 구현됨)
- Full RAG: `src/lib/knowledge/ragContextSource.ts` + `embeddingProvider.ts` —
  로컬 `llama-server` 또는 localhost OpenAI 호환 endpoint의 `/v1/embeddings`에 의존.
- 오늘 브리핑/작업 쪼개기 프롬프트는 `src/lib/ai/context/buildAiContext.ts`의
  Todo/Calendar/Focus 컨텍스트 + `knowledgeContext`를 조합한다.

**Phase 5 반영**:
- managed `llama-server`는 `--embeddings` 플래그로 시작해 OpenAI 호환
  `/v1/embeddings`를 제공한다.
- `embeddingProvider.ts`는 Local AI 설정의 선택 모델을 사용한다. external mode는
  localhost/127.0.0.1/[::1]일 때만 허용한다.
- 기존 `bge-m3`/`nomic-embed-text` Ollama 설정은 `local-ai`로 migration한다.
- 인덱스는 기존 SQLite(knowledge_index.db) 구조 유지.

---

## 9. UX 설계

### 9.1 Local AI Setup 화면

- 안내: **"내 기기에 맞는 로컬 AI 모델을 추천해드릴게요."**
- 프라이버시: **"기기 정보는 모델 추천에만 사용되며 외부로 전송되지 않습니다."**
- 버튼: `내 기기 검사하기` / `직접 모델 선택하기` / `외부 서버 연결하기` / `나중에 하기`
- "내 기기 검사하기" 클릭 = 동의로 간주하고 `hardwareConsentGrantedAt` 기록.
  클릭 전에는 어떤 사양 조회도 하지 않는다.

### 9.2 기기 분석 결과 화면

OS · RAM · CPU(코어) · GPU(감지 시) · 저장공간 · **추천 모델 · 추천 이유** ·
예상 속도/품질/용도(카탈로그 description 기반). 하단에 "더 가벼운 모델 /
추천 모델 / 고급 모델" 선택지 (= `ModelRecommendation.alternatives`).

### 9.3 모델 다운로드 화면

모델명 · 용량 · 저장 위치(실제 경로 표시) · 진행률 바 · `취소` · `재시도` ·
완료 시 **"로컬 AI 준비 완료"** + 첫 기능 실행 유도.

### 9.4 AI 실행 방식 설정 (SettingsPage 내)

라디오: `필요할 때 자동 실행(기본)` / `앱 시작 시 미리 실행` / `외부 서버에 연결(+URL 입력)`.
고급: 포트 변경, 설치된 모델 목록/삭제, 모델 폴더 열기.

### i18n

모든 문구는 기존 패턴대로 `src/i18n/ko.ts` / `en.ts`에 추가 (Phase 1).

---

## 10. 설정 저장과 동기화 경계

| 데이터 | 저장 위치 | Supabase sync |
|--------|----------|---------------|
| launchMode, serverPort, selectedModelId | `focusflow.localAi.v1` (local storage) | ❌ |
| externalServerUrl, modelsDirOverride | `focusflow.localAi.v1` | ❌ (기기별 경로/주소) |
| hardwareConsentGrantedAt | `focusflow.localAi.v1` | ❌ |
| HardwareProfile | **저장 안 함** (검사 시마다 조회, 화면 표시용) | ❌ |
| GGUF 모델 파일 | `<app-local-data>/models/` | ❌ |
| Todo/Calendar 등 기존 앱 데이터 | 기존 그대로 | 기존 그대로 |

`usePlannerData.ts`의 STORAGE_KEY(appSettings 포함)는 건드리지 않는다.

---

## 11. 보안 · 신뢰

1. **네트워크는 다운로드에만**: 모델 다운로드(allowlist 호스트) 외에 Local AI
   시스템이 외부로 나가는 트래픽은 없다. 사양 정보·프롬프트·노트 내용 전송 금지.
2. **sha256 검증 필수**: 해시 불일치 파일은 즉시 삭제. 해시 없는 카탈로그 항목은
   다운로드 자체를 막는다.
3. **바이너리 신뢰**: llama-server는 llama.cpp 공식 릴리스에서만 취득, 버전과
   해시를 릴리스 파이프라인에 기록. (사용자 임의 바이너리 교체는 지원하지 않음)
4. **서버는 127.0.0.1 바인딩**: 외부 기기에서 접근 불가.
5. **fs scope**: 모델 폴더는 앱 데이터 폴더 하위라 기존 deny-all 정책과 충돌 없음.
   (vault처럼 사용자 폴더를 여는 것이 아니므로 추가 grant 불필요)
6. **git 위생**: `*.gguf`, `src-tauri/binaries/llama-server*`는 `.gitignore`로 차단.

---

## 12. 단계별 구현 로드맵

| Phase | 내용 | 상태 |
|-------|------|------|
| **0** | 설계 문서 + 타입/카탈로그/추천기/설정/런타임 스캐폴드 + Rust HW 프로파일러·모델 폴더·목록 command | ✅ 이번 커밋 |
| **1** | Local AI Setup UI (검사 동의 → 결과 → 추천), i18n, GPU 감지 1차(wgpu 이름) | ✅ UI/i18n (설정 탭 "로컬 AI") · GPU 감지는 미착수 |
| **2** | ModelInstaller: Rust 다운로드 command (진행률 event, 이어받기, sha256), 다운로드 UI, 카탈로그 URL/해시 확정 | ✅ 다운로드 인프라 완료 · URL/해시는 여전히 TODO(release) — 해시 없는 모델은 다운로드 버튼이 비활성 |
| **3** | sidecar: spawn/health/종료 정리, 포트 충돌 처리 (런타임 바이너리 해석 방식 — §7) | ✅ 런타임 완료 · 바이너리 자동 설치/패키징은 후속 |
| **4** | `llamaServerProvider` 추가 + gateway 체인 선두 배치, Ollama chat provider 제거 (외부 연결은 OpenAI 호환으로 통일) | ✅ |
| **5** | 아키텍처 전환 완료: 임베딩 llama-server 백엔드(Full RAG), Ollama 의존 제거/격리, 유휴 자동 종료, NVIDIA VRAM 감지 | ✅ 구현 |
| **6** | 기존 배포 앱 통합 릴리스: llama-server 바이너리 확보/검증/설치, 모델 카탈로그 URL·sha256 확정, feature gate, 업데이트 호환성 | 설계 |
| **7** | 실제 기기 QA + staged rollout: Windows 기준 smoke/e2e, 저사양/중간/고사양 프로파일, 성능·메모리·전력 기준선, rollback 기준 | 설계 |
| **8** | 운영 안정화: 진단 로그(민감정보 제외), 복구/재설치 플로우, 사용자 지원 문서, 기본 공개 전환 | 설계 |
| **9** | 제품 확장(선택): 모델/프롬프트 품질 튜닝, 고급 RAG 검색, 멀티 모델 프로필, GPU 가속 고도화 | 후보 |

Phase 5가 **로컬 AI 아키텍처 전환의 마지막 단계**다. Phase 6 이후는 새 앱을
처음 배포하는 단계가 아니라, **이미 배포 중인 FocusFlow 0.2.x 계열 앱에 Local AI를
안전하게 붙이는 통합 릴리스 단계**다. 기능 확장보다 기존 사용자 데이터 보존,
점진 공개, 업데이트 실패 복구, 롤백 가능성을 우선한다.

---

## 13. Phase 5 이후 설계

### 13.1 Phase 5 완료 기준 — 아키텍처 전환 종료

Phase 5가 끝나면 "Ollama에서 llama-server로 전환" 프로젝트는 완료로 본다.

완료 조건:

- 채팅: `llamaServerProvider → serverProvider` 체인 유지. Ollama chat provider 없음.
- Full RAG 임베딩: `llama-server` 임베딩 backend 사용.
- `src/lib/knowledge/embeddingProvider.ts`의 Ollama 경로는 제거하거나
  legacy/manual 옵션으로 격리하고 기본 경로에서 제외.
- Local AI 설정에서 chat 모델과 embedding 모델 설치 상태를 구분해 표시.
- 유휴 자동 종료: 일정 시간 AI 요청이 없으면 managed `llama-server` 종료.
- NVIDIA VRAM 감지: 가능하면 VRAM 기반 추천, 실패 시 RAM 기반 추천으로 조용히 fallback.
- 문서/문구: "Ollama 필요" 안내가 기본 UX에 남지 않음.

비목표:

- 클라우드 LLM provider 직접 연동.
- 사용자 노트/프롬프트의 원격 전송.
- 앱 설치 파일에 GGUF 모델 번들링.

### 13.2 Phase 6 — 기존 배포 앱 통합 릴리스

목표: 현재 배포 채널(Tauri updater + GitHub Releases)을 유지하면서, 사용자가
별도로 llama.cpp를 찾지 않아도 Local AI를 준비할 수 있게 한다. 기존 사용자에게는
업데이트 후에도 현재 Todo/Calendar/Knowledge 데이터가 그대로 유지되어야 한다.

릴리스 원칙:

- Local AI는 기존 앱 기능을 대체하지 않는 **옵트인 기능**으로 들어간다.
- 업데이트 직후 AI 런타임이나 모델 다운로드를 자동으로 시작하지 않는다.
- 기존 사용자의 `appSettings`, Supabase 동기화 데이터, Obsidian 설정은 migration 없이
  그대로 읽혀야 한다.
- `focusflow.localAi.v1`은 새 local-only storage 키로 추가하고, 없으면 기본값을 생성한다.
- 문제가 생겨도 기존 Todo/Calendar/Study 기능은 계속 사용할 수 있어야 한다.

결정할 것:

| 항목 | 방향 |
|------|------|
| llama-server 배포 | llama.cpp 공식 릴리스에서 OS/arch별 바이너리 취득. 버전·sha256을 릴리스 manifest에 기록 |
| 설치 위치 | `<app-local-data>/bin/llama-server(.exe)` 우선. git에는 커밋하지 않음 |
| 설치 방식 | 앱 내 "로컬 AI 런타임 설치" 버튼 또는 첫 모델 설치 시 함께 설치 |
| 검증 | 다운로드 allowlist + sha256 검증. 실패 파일 삭제 |
| Windows DLL | zip에 동반되는 DLL 누락 여부 검사. 누락 시 명확한 복구 안내 |
| 앱 업데이트 | `package.json`, `src-tauri/Cargo.toml`, `tauri.conf.json` 버전 동기화. updater artifact와 `latest.json` 생성 |
| 런타임 업데이트 | 새 런타임 버전이 있으면 기존 프로세스 종료 후 교체. 실패 시 이전 버전 유지 |
| 기능 공개 | 첫 릴리스는 설정 탭에서 opt-in. 기본 자동 실행은 꺼짐 |

모델 카탈로그:

- 공식 GGUF URL과 expectedSha256을 채운다.
- 카탈로그 항목은 `id`, `fileName`, `sizeGb`, `ramRequiredGb`, `contextLength`,
  `downloadUrl`, `expectedSha256`, `licenseNote`를 명시한다.
- 해시가 없는 항목은 다운로드 버튼을 비활성화한다.
- Hugging Face 접근 실패, 중단, 재시도, 디스크 부족을 각각 다른 메시지로 안내한다.

기존 배포 앱 체크:

- updater가 기존 설치본에서 새 버전으로 정상 업데이트되는지 확인한다.
- 업데이트 후 기존 localStorage/Supabase 데이터가 유지되는지 확인한다.
- Local AI 설정 키가 없던 사용자에게 기본값이 생성되는지 확인한다.
- Local AI를 한 번도 켜지 않은 사용자의 앱 시작 시간과 메모리 사용량이 크게 늘지 않아야 한다.
- 문제가 있으면 Local AI UI만 숨기거나 비활성화할 수 있는 feature gate를 둔다.

### 13.3 Phase 7 — 실제 기기 QA와 staged rollout

목표: "내 PC에서 켜진다"가 아니라 "예상 가능한 속도와 실패 방식으로 동작한다"를 확인한다.

테스트 매트릭스:

| 프로파일 | 예시 기준 | 기대 |
|----------|-----------|------|
| 저사양 | 8GB RAM, 내장 GPU | 가장 작은 모델 추천, 다운로드/실행 실패 시 친절한 안내 |
| 중간 | 16GB RAM | 기본 추천 모델 설치·채팅 가능 |
| 고사양 | 32GB+ RAM, NVIDIA GPU | 더 큰 모델 추천, VRAM 감지 표시 |
| 오프라인 | 네트워크 없음 | 이미 설치된 모델은 사용, 신규 다운로드는 재시도 안내 |
| 디스크 부족 | 모델 저장 공간 부족 | 다운로드 시작 전 또는 중간에 중단 + 정리 안내 |

측정 항목:

- 첫 응답까지 걸리는 시간(모델 로드 포함/제외).
- 유휴 자동 종료 후 재시작 시간.
- 메모리 사용량 상한.
- Full RAG 색인 시간과 chunk 수.
- embedding retrieval latency.

검증 명령:

```powershell
npm.cmd run typecheck
npm.cmd run build
cargo check --manifest-path src-tauri/Cargo.toml
```

릴리스 후보는 최소 1회 Tauri dev 실행과 패키징 빌드 smoke test를 통과해야 한다.

점진 공개:

| 단계 | 대상 | 기준 |
|------|------|------|
| 내부 테스트 | 개발자/테스트 기기 | 설치·업데이트·모델 다운로드·채팅 smoke 통과 |
| 제한 공개 | opt-in 사용자 | 치명적 crash 없음, 기존 기능 회귀 없음 |
| 기본 노출 | 전체 사용자 | 복구 UX와 지원 문서 준비, 모델/런타임 다운로드 안정화 |

롤백 기준:

- 앱 시작 crash 또는 updater 실패.
- 기존 데이터 로딩/동기화 회귀.
- Local AI 비사용자에게도 성능 저하가 명확한 경우.
- 다운로드 검증 우회, 원격 context 유출 가능성 등 보안 이슈.

롤백 방식:

- 앱 버전 롤백보다 먼저 feature gate로 Local AI 진입점을 비활성화한다.
- 모델/런타임 파일은 사용자 데이터 폴더에 남겨두되 자동 실행은 중지한다.
- 데이터 migration은 되돌릴 필요가 없도록 additive-only로 설계한다.

### 13.4 Phase 8 — 운영 안정화와 복구 UX

목표: 기존 배포 앱의 일부 기능으로 운영될 때, 실패했을 때 사용자가 원인을 이해하고
복구할 수 있게 한다.

진단 정보:

- runtime 상태: running/pid/port/model/backend version.
- 모델 설치 상태: fileName/size/hash 검증 여부.
- 최근 오류 코드: download_failed, checksum_mismatch, runtime_missing,
  runtime_crashed, model_load_timeout, embedding_model_missing.
- 민감정보 제외: 프롬프트, 노트 원문, 파일 본문, Supabase 데이터는 로그에 남기지 않는다.

복구 플로우:

- "런타임 다시 설치"
- "모델 파일 검증"
- "부분 다운로드 삭제"
- "로컬 AI 설정 초기화"
- "외부 서버 모드로 임시 전환"

업데이트 호환성:

- `focusflow.localAi.v1` schemaVersion을 도입한다.
- 구버전 설정은 migration 함수에서 보정한다.
- 모델 파일은 가능한 한 재다운로드 없이 재사용한다.
- 바이너리와 모델 호환 문제가 있으면 런타임만 교체하고 모델은 보존한다.
- 앱 버전과 Local AI runtime/model catalog 버전은 별도로 기록한다.
- 앱 updater 실패가 Local AI 파일을 훼손하지 않아야 하고, Local AI 파일 손상이 앱
  updater를 막지 않아야 한다.

지원 문서:

- "로컬 AI를 처음 켜는 법"
- "모델 다운로드가 실패할 때"
- "`llama-server` 런타임 다시 설치"
- "기기 사양이 낮을 때 추천 설정"
- "외부 서버 모드로 임시 사용"
- "로컬 AI 파일을 삭제하고 초기화"

### 13.5 Phase 9 — 선택 확장

Phase 9는 필수가 아니라 제품 판단에 따라 고르는 후보군이다.

- 모델별 프롬프트/temperature/context-size 프로필.
- embedding rerank 또는 hybrid search(BM25 + vector).
- sqlite-vec 도입.
- 작업 유형별 모델 선택: 빠른 분류 모델, 긴 글 모델, 임베딩 모델 분리.
- GPU backend 선택/표시: Vulkan/CUDA/Metal 등 플랫폼별 고도화.
- 레거시 이름 정리: `OllamaChat` → `AiChat`, `ollama-chat-*` → `ai-chat-*`.
- Local AI health dashboard.

Phase 9에 들어가기 전 기준:

- Phase 6~8에서 다운로드, 실행, 복구, 업데이트 플로우가 안정화되어 있어야 한다.
- 새 확장은 기본 프라이버시 원칙(로컬 우선, 원격 유출 금지)을 약화하지 않아야 한다.

---

## 14. 이번 커밋(Phase 0)에서 의도적으로 하지 않은 것

| 항목 | 이유 |
|------|------|
| llama-server 바이너리 추가 | 대용량 파일 커밋 금지. externalBin 등록도 파일 부재 시 빌드가 깨져 보류 |
| 실제 다운로드 구현 | reqwest/tokio 의존성 + 이어받기/검증은 Phase 2에서 집중 구현 |
| sidecar spawn | tauri-plugin-shell 도입과 바이너리 파이프라인이 선행돼야 함 |
| 카탈로그 URL/sha256 확정 | 출시 전 공식 리포지토리 파일 검증 필요 — placeholder + TODO |
| gateway 체인 변경 | 죽은 provider를 미리 넣지 않기 위해 Phase 4로 |
| GPU/VRAM 감지 | 크로스플랫폼 API 부재 — RAM 기반 추천으로 시작 (§3) |
