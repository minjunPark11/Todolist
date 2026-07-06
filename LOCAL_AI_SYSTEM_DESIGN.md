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
| 1 | **Ollama는 기본값이 아니다.** Ollama / LM Studio / LocalAI는 "외부 서버 연결" 옵션으로만 남는다. 정식 경로는 `llama.cpp`의 `llama-server`를 Tauri sidecar로 자동 실행하는 것이다. |
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
│  │ src/lib/ai/gateway.ts  provider 체인 (Phase 4에서 llamaServer 추가)      │ │
│  │   [llamaServer(관리형)] → ollama → remote-ollama → server               │ │
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

외부 서버 연결 모드(옵션): Ollama(11434) / LM Studio(1234) / LocalAI 등
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

### sidecar 구성 (Phase 3에서 추가할 것)

1. `tauri-plugin-shell` 의존성 추가 (Cargo.toml + capabilities에 sidecar 권한).
2. `tauri.conf.json`에 externalBin 등록:
   ```json
   "bundle": { "externalBin": ["binaries/llama-server"] }
   ```
   Tauri가 target triple을 자동으로 붙여 플랫폼별 파일을 찾는다.
3. 바이너리 위치: `src-tauri/binaries/` (git 미포함 — `.gitignore` 처리 완료)
   - `llama-server-x86_64-pc-windows-msvc.exe`
   - `llama-server-aarch64-apple-darwin`
   - `llama-server-x86_64-apple-darwin`
   - `llama-server-x86_64-unknown-linux-gnu`
   - CI/릴리스 빌드에서 llama.cpp 공식 릴리스 바이너리를 받아 배치한다.
   - **주의**: externalBin은 파일이 없으면 빌드가 깨진다. 바이너리 배치 파이프라인이
     준비되기 전에는 tauri.conf.json에 넣지 않는다 (이번 커밋에서 넣지 않은 이유).
4. 실행 옵션 초안: `--host 127.0.0.1` (외부 노출 금지), `--port <설정값>`,
   `--ctx-size 4096`(초기값), `--ngl 999`(GPU 가능 시; CPU 빌드면 무시됨).
5. **포트**: 고정값을 코드에 박지 않는다. `LocalAiSettings.serverPort`
   (기본 제안값 `39281`)이며, 점유 시 자동으로 +1 탐색 후 실제 사용 포트를
   상태로 보고한다.
6. **정리**: 앱 종료(`RunEvent::Exit`)와 마지막 창 닫힘 정책에 맞춰 child process
   kill. Windows에서는 Job Object로 좀비 프로세스 방지 검토.
7. **유휴 정지(옵션, 후순위)**: N분 미사용 시 자동 종료로 메모리 회수.

### 실행 모드 (LocalAiSettings.launchMode)

| 모드 | 값 | 동작 |
|------|----|------|
| 필요할 때 자동 실행 (기본) | `on-demand` | AI 기능 첫 사용 시 ensureAiReady()가 spawn |
| 앱 시작 시 미리 실행 | `on-app-start` | 앱 부팅 후 백그라운드 spawn (모델 로딩 선반영) |
| 외부 서버에 연결 | `external` | spawn 안 함. externalServerUrl로 연결 (Ollama/LM Studio/LocalAI) |

### 기존 provider 체인과의 통합 (Phase 4)

`src/lib/ai/providers/llamaServerProvider.ts`(신규)가 OpenAI 호환
`/v1/chat/completions`를 호출하고, `gateway.ts` 체인의 **맨 앞**에 선다:

```
llamaServer(관리형, 로컬) → ollama(외부 로컬) → remote-ollama → server
```

- `canHandleFullAppData()` / `canHandleKnowledgeContext()`는 localhost일 때만
  true — 기존 게이트 로직 그대로.
- `AiProviderName`에 `"llama-server"` 추가는 Phase 4에서 수행
  (지금 추가하면 죽은 코드 경고만 남는다).

---

## 8. KnowledgeContext 연계

**새로 만들지 않는다.** 기존 구조를 그대로 쓴다:

- Lite: `src/lib/knowledge/liteContextSource.ts` — 파일명/제목/heading/tag
  키워드 매칭 + 최근 수정순. (이미 구현됨)
- Full RAG: `src/lib/knowledge/ragContextSource.ts` + `embeddingProvider.ts` —
  현재 Ollama 임베딩(`bge-m3` 기본, `nomic-embed-text` 대안)에 의존.
- 오늘 브리핑/작업 쪼개기 프롬프트는 `src/lib/ai/context/buildAiContext.ts`의
  Todo/Calendar/Focus 컨텍스트 + `knowledgeContext`를 조합한다.

**managed 런타임 전환 시 열린 항목 (Phase 5)**:
- llama-server는 `--embedding` 플래그로 임베딩 서버가 될 수 있으나 chat 모델과
  별개 프로세스/모델(GGUF 임베딩 모델)이 필요하다.
- 방향: `embeddingProvider.ts`에 llama-server 백엔드를 추가하고, 임베딩 모델이
  설치되지 않았으면 **색인을 막고 설치 안내** (기존 Ollama 경로도 옵션으로 유지).
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
| **1** | Local AI Setup UI (검사 동의 → 결과 → 추천), i18n, GPU 감지 1차(wgpu 이름) | |
| **2** | ModelInstaller: Rust 다운로드 command (진행률 event, 이어받기, sha256), 다운로드 UI, 카탈로그 URL/해시 확정 | |
| **3** | sidecar: tauri-plugin-shell + externalBin + 바이너리 배치 파이프라인, spawn/health/종료 정리, 포트 충돌 처리 | |
| **4** | `llamaServerProvider` 추가 + gateway 체인 선두 배치, launchMode(on-app-start/external) 반영, 기존 Ollama 경로는 외부 서버 옵션으로 강등 | |
| **5** | 임베딩 llama-server 백엔드(Full RAG), 유휴 자동 종료, NVIDIA VRAM 감지 | |

각 Phase는 독립적으로 출시 가능하다 — Phase 2까지만 나가도 "모델 준비"가 되고,
사용자는 그동안 외부 서버 모드로 기능을 쓸 수 있다.

---

## 13. 이번 커밋(Phase 0)에서 의도적으로 하지 않은 것

| 항목 | 이유 |
|------|------|
| llama-server 바이너리 추가 | 대용량 파일 커밋 금지. externalBin 등록도 파일 부재 시 빌드가 깨져 보류 |
| 실제 다운로드 구현 | reqwest/tokio 의존성 + 이어받기/검증은 Phase 2에서 집중 구현 |
| sidecar spawn | tauri-plugin-shell 도입과 바이너리 파이프라인이 선행돼야 함 |
| 카탈로그 URL/sha256 확정 | 출시 전 공식 리포지토리 파일 검증 필요 — placeholder + TODO |
| gateway 체인 변경 | 죽은 provider를 미리 넣지 않기 위해 Phase 4로 |
| GPU/VRAM 감지 | 크로스플랫폼 API 부재 — RAM 기반 추천으로 시작 (§3) |
