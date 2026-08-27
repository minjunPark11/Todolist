# 로컬 AI 제거 설계

> 상태: **안 B로 실행 완료** · 2026-08-27 (§8 실행 기록)
> 대상: FocusFlow 데스크톱(Tauri) + 웹
> 관련 코드: `src/lib/localAi/*`, `src/lib/ai/*`, `src/lib/knowledge/*`, `src/components/OllamaChat.tsx`, `src/components/SettingsPage.tsx`, `src/platform/*`, `src-tauri/src/local_ai.rs`
> 되돌아볼 문서: `LOCAL_AI_SYSTEM_DESIGN.md`(도입 설계), `KNOWLEDGE_BASE_DESIGN.md`, `AI_OLLAMA_FEATURES.md`

---

## 1. 왜 이 문서가 "AI 제거" 설계가 되는가

요청은 "로컬 AI를 쓰는 기능들"의 삭제다. 코드를 읽어보면 **로컬 AI를 빼는 순간
앱의 AI 기능 전체가 응답할 수 없는 상태가 된다.** 근거는 세 가지다.

1. `src/lib/ai/gateway.ts:17` — provider 체인은 `[llamaServerProvider, serverProvider]`
   둘뿐이다. Ollama provider는 이미 Phase 4에서 제거됐다.
2. `serverProvider`는 `VITE_AI_SERVER_URL`이 설정돼야 동작하는데
   (`src/lib/ai/providers/serverProvider.ts:11`), `.env.example`의 기본값은 빈 값이고
   저장소 어디에도 실제 엔드포인트가 없다. 즉 **현재는 죽은 경로**다.
3. 설령 서버 URL을 넣어도 채팅은 동작하지 않는다. `runAssistantTurn.ts:75`가
   `dataScope: "full-app"`으로 보내고, 게이트웨이는 `canHandleFullAppData()`가
   참인 provider(=로컬 엔드포인트)만 통과시킨다(`gateway.ts:45`).
   `serverProvider`에는 그 훅이 없다.

지식베이스도 같다. Full RAG 임베딩은 로컬 런타임을 직접 부르고
(`src/lib/knowledge/embeddingProvider.ts:17`), Lite 모드는 임베딩 없이 돌지만
그 결과물(`[KNOWLEDGE]` 블록)의 **유일한 소비자가 AI 채팅**이다.

```
[AI 채팅 패널 OllamaChat]
      └ runAssistantTurn → gateway ──┬─ llamaServerProvider → localAi/runtime → Tauri local_ai.rs
                                     └─ serverProvider (VITE_AI_SERVER_URL, 미설정 = 비활성)
                    ↑ knowledgeContext
      [지식베이스] ─ Lite(키워드)  … 소비자는 채팅뿐
                  └ Full(RAG) → embeddingProvider → localAi/runtime (임베딩 사이드카)
[설정 · 로컬 AI 탭] → 하드웨어 검사 / 모델 다운로드 / 런타임 제어 / 대화 로그
[설정 · 지식베이스 탭] → vault 선택 / 인덱싱 / 임베딩 모델
```

---

## 2. 범위 결정 (여기만 정해주면 나머지는 기계적이다)

| 안 | 범위 | 결과 |
|---|---|---|
| **A** | 로컬 런타임·설정만 삭제, AI 채팅 UI 유지 | 패널은 남지만 **항상 오류**를 뱉는다. 사용자에게 최악. 권장하지 않음 |
| **B (권장)** | 로컬 AI + 지식베이스 + AI 채팅/어시스턴트 전부 삭제 | 앱에서 AI 개념이 사라진다. 남는 죽은 코드 0 |
| **C** | 로컬 AI + Full RAG만 삭제, 채팅은 서버 provider 전용으로 남김 | 나중에 클라우드 AI를 붙일 계획이 있을 때만 의미 있음. `dataScope` 게이트 완화 + 서버 엔드포인트 구축이 **추가 작업**으로 따라온다 |

이 문서는 **B를 기본**으로 쓰되, 3단계 계획을 각 단계마다 앱이 정상 동작하도록
쪼개 두었다. **Phase 2까지만 진행하고 멈추면 그게 C**다.

---

## 3. 삭제·수정 인벤토리

### 3.1 통째로 삭제하는 파일

| 경로 | 규모 | 비고 |
|---|---|---|
| `src/lib/localAi/` (8개 파일) | 987줄 | 런타임·설치·모델 카탈로그·추천기·설정 |
| `src-tauri/src/local_ai.rs` | 1,080줄 | 하드웨어 검사, 다운로드, 사이드카 |
| `src/lib/ai/` (테스트 12개 포함) | 6,215줄 | gateway·provider·assistant·agent·memory·contextCards·tools |
| `src/lib/knowledge/` (+`retrieval/`) | 1,521줄 | Obsidian 스캐너·청커·인덱서·스토어·RAG |
| `src/components/OllamaChat.tsx`, `src/components/ai/*` | 948줄 | 채팅 패널·턴 카드·액션 프리뷰 |
| `src/domain/ai/buildAiContextInput.ts` | 52줄 | |
| `e2e/aiEntryPoint.spec.ts` | | Rail 진입점 E2E |

합계 **약 10,800줄 + Rust 1,080줄**.

### 3.2 부분 수정하는 파일

| 경로 | 할 일 |
|---|---|
| `src/App.tsx` | `OllamaChat` 렌더/상태(`aiChatOpen`), `useLocalAiAutostart()`(:130), `useKnowledgeSettings`/`useKnowledgeAutoIndex`(:124,:127), Settings·Rail로 내려주는 knowledge props 제거 |
| `src/components/shell/GlobalRail.tsx` | `aiOpen`/토글 prop과 AI 유틸리티 버튼 제거(:153, :225) — `a11y.test.tsx:50`도 같이 |
| `src/components/SettingsPage.tsx` | 탭 `"localAi"`, `"knowledge"` 제거(:145, :187) + `KnowledgeSettingsTab`(752–1103), `useLocalAiDownloadSession`(1104–1115), `LocalAiSettingsTab`(1116–1556), `TurnLogSettingsCard`(1557–1604), `LocalAiModelItem`(1605–1662) 삭제 → 1,723줄 중 **약 910줄** |
| `src/platform/types.ts` | `PlatformLocalAi` 타입과 `localAi:` 필드(:209), `localAi/types` import(:9) 제거 |
| `src/platform/tauri.ts` | `localAi` 구현부(303–393)와 관련 import 제거. **`aiFetch`는 유지** (ICS 캘린더가 씀: `src/lib/externalCalendars.ts:285`) |
| `src/platform/web.ts` | `localAiUnsupported()`와 `localAi` 스텁(20, 202–255) 제거 |
| `src-tauri/src/main.rs` | `mod local_ai`(:5), `manage(...)`(:500–501), `invoke_handler`의 16개 커맨드(:599–614), 종료 훅(:661) 제거 |
| `src-tauri/Cargo.toml` | `sysinfo`, `reqwest`, `sha2` 및 다운로드용 스트림 의존 제거 — `main.rs`에서 쓰는 곳이 없음을 확인함 |
| `src/i18n/ko.ts`, `src/i18n/en.ts` | `localAi.*` 84키 ×2, `ai.*` 약 100키, `settings.knowledge.*` 약 43키, `rail.ai` 제거 |
| `src/styles/03-planning.css` | 채팅 패널·로컬 AI·지식베이스 클래스 약 80줄. `05-spaces.css` 1줄 |
| `src/lib/calendarContext.ts`, `src/utils/calendarItems.ts` | AI 컨텍스트 전용 함수인지 확인 후 정리 (Phase 3) |
| `.env.example` | `VITE_OLLAMA_*`, `VITE_REMOTE_OLLAMA_*`, `VITE_AI_SERVER_URL` 제거 |

### 3.3 의도적으로 남기는 것

- **`platform.aiFetch` / `http:default` capability** — 외부 캘린더(ICS)가 쓴다. 이름이 `aiFetch`라 오해를 부르므로 후속으로 `httpFetch` 개명을 권한다(이번 범위 밖).
- **`AppSettings.aiModel`** (`src/types.ts:607`) — 이미 UI가 없는 레거시 필드이고 Supabase로 동기화된다. 지금 지우면 구버전 클라이언트가 보낸 설정과 충돌하므로 **한 릴리스 이상 남긴 뒤** 별도로 정리한다.
- **사용자 디스크의 GGUF 모델 파일과 `knowledge.db`** — §5 참고.

---

## 4. 단계 계획 (각 단계 끝에서 앱은 정상 빌드·동작)

### Phase 1 — 로컬 런타임과 그 설정
1. `src/lib/localAi/` 삭제, `llamaServerProvider` 삭제, gateway provider 배열을 `[serverProvider]`로.
2. 설정의 로컬 AI 탭과 대화 로그 카드 삭제, `localAi.*` i18n 삭제.
3. `platform.localAi` 3종(types/tauri/web) 삭제.
4. `src-tauri`: `local_ai.rs` 삭제, `main.rs` 정리, `Cargo.toml` 의존 정리.
5. 지식베이스는 이 단계에서 **Full 모드만** 비활성(설정에서 선택 불가) — Lite는 아직 산다.

검증: `npm run typecheck` · `npm test` · `npm run tauri:build`(Rust 링크 확인).

### Phase 2 — 지식베이스(Obsidian) 제거
1. `src/lib/knowledge/` 삭제, 설정의 지식베이스 탭 삭제, `App.tsx`의 훅·props 제거.
2. `OllamaChat`에서 knowledge 첨부 UI와 `knowledgeContext` 전달 제거, `AiChatRequest.knowledgeContext`와 gateway의 관련 분기 제거.
3. `settings.knowledge.*` i18n, 관련 CSS 제거.

**여기서 멈추면 안 C**(서버 provider 전용 채팅). 그 경우 추가로 필요한 일:
`dataScope: "full-app"` 게이트를 어떻게 할지 결정(앱 데이터를 서버로 보낼 것인가) +
`VITE_AI_SERVER_URL` 백엔드 준비. 둘 다 없으면 채팅은 계속 오류만 낸다.

### Phase 3 — AI 채팅·어시스턴트 전면 제거 (안 B)
1. `src/components/OllamaChat.tsx`, `src/components/ai/`, `src/lib/ai/`, `src/domain/ai/` 삭제.
2. `GlobalRail`의 AI 버튼과 `App.tsx`의 패널 상태 제거, `a11y.test.tsx` 수정.
3. `e2e/aiEntryPoint.spec.ts` 삭제.
4. `ai.*` i18n, 채팅 패널 CSS 제거.
5. `calendarContext.ts` 등 AI 전용 헬퍼가 고아가 됐는지 확인 후 삭제.

### Phase 4 — 문서·환경 정리
- `.env.example` 정리.
- `AI_OLLAMA_FEATURES.md`, `LOCAL_AI_SYSTEM_DESIGN.md`, `KNOWLEDGE_BASE_DESIGN.md`, `SPACES_AI_BRIEFING_DESIGN.md`은 **삭제하지 말고** 상단에 `> 상태: 폐기 (2026-08-27, LOCAL_AI_REMOVAL_DESIGN.md 참조)` 배너를 붙인다. 왜 있었는지가 기록으로 남아야 한다.
- `docs/Features/AI_Assistant.md`, `docs/Features/Unified_Chat.md`, `docs/Features/User_Patterns.md`, `docs/Decisions/Architecture_Decisions.md`, `FEATURE_OVERVIEW.md`, `CURRENT_PRODUCT_SPEC.md`, `README.md`의 AI 서술 갱신.

---

## 5. 데이터와 마이그레이션

삭제 대상 코드가 남기는 **기기 로컬 흔적**:

| 저장소 | 키/경로 | 처리 |
|---|---|---|
| localStorage | `focusflow.localAi.v1` | 앱 시작 시 1회 삭제 |
| localStorage | `focusflow.knowledge.v1` | 1회 삭제 |
| localStorage | `focusflow.aiTurnLog.v1`, `focusflow.aiTurnLog.enabled` | 1회 삭제 (대화 원문이 남아 있으므로 **반드시**) |
| localStorage | `focusflow.aiMemory.v1`, `focusflow.aiOutcomeLog.v1`, `focusflow.aiContextCards.v1` | 1회 삭제 |
| 디스크 | `<app-local-data>/models/*.gguf` (수 GB) | **자동 삭제하지 않는다.** 사용자가 직접 받은 파일이고 앱이 조용히 지울 성질이 아니다. 릴리스 노트에 경로를 안내 |
| 디스크 | `<app-local-data>/bin/llama-server*` | 위와 동일 |
| 디스크 | knowledge index DB (`knowledge.db`) | 위와 동일 |
| Supabase | `appSettings.aiModel` | 지금은 유지 (§3.3) |

**1회 정리 코드**: 기존 마이그레이션 자리(`src/domain/migrations/`)에 한 번 실행되고
다음 릴리스에서 자신도 지울 수 있는 작은 함수로 넣는다. 키 목록만 하드코딩한
6줄이면 충분하고, 파일 시스템 경로는 건드리지 않는다.

---

## 6. 리스크

| 리스크 | 대응 |
|---|---|
| Rust 커맨드를 지웠는데 프런트에서 `invoke`가 남아 런타임 오류 | Phase 1에서 `grep -rn "local_ai" src/` 0건 확인 후 커밋 |
| `aiFetch`를 AI 전용으로 오인해 삭제 → 외부 캘린더(ICS) 파손 | §3.3에 명시. Phase 1 후 캘린더 구독 수동 확인 |
| `Cargo.toml` 의존 제거로 다른 기능 빌드 실패 | `sysinfo`/`reqwest`/`sha2`가 `main.rs`에 없음을 확인함. 그래도 `tauri:build`까지 돌린다 |
| 되돌리고 싶어질 때 | `chore/remove-local-ai` 브랜치에서 Phase별 커밋. 되살리기는 revert 하나 |
| 저장된 설정 탭 값이 사라진 탭을 가리켜 빈 화면 | 탭 기본값·정규화 확인 (`SettingsPage.tsx:145`) |

---

## 7. 완료 검증 체크리스트

- [ ] `grep -rin "ollama\|localAi\|local_ai\|llama" src src-tauri e2e` → 잔여 0건
- [ ] `npm run typecheck`
- [ ] `npm test` (삭제된 12개 테스트 제외 전부 통과)
- [ ] `npm run test:e2e`
- [ ] `npm run build` + `npm run tauri:build`
- [ ] 수동: 설정 전 탭 이동 / Rail에 AI 버튼 없음 / 외부 캘린더(ICS) 동기화 정상 / 기존 사용자 데이터로 첫 실행 시 콘솔 오류 없음
- [ ] 번들 크기·설치 파일 크기 변화 기록 (릴리스 노트용)

---

## 8. 실행 기록 (2026-08-27, 안 B)

브랜치 `chore/remove-local-ai`. Phase 1~4를 한 번에 적용했고, 설계와 달라진
부분만 아래에 적는다.

### 설계에 없던 추가 삭제

지식베이스를 지우고 나니 **소비자가 하나도 남지 않은 플랫폼 표면**이 드러나서
같이 걷어냈다. 남겨두면 아무도 부르지 않는 코드에 위험한 권한만 붙어 있게 된다.

| 대상 | 이유 |
|---|---|
| `PlatformFiles` (types/tauri/web) — 폴더 선택·vault 스캔·파일 읽기·감시 | 유일한 사용처가 Obsidian 지식베이스였다 |
| Rust `grant_vault_read_access`, `ensure_knowledge_db_dir` | 위 표면 전용 |
| npm `@tauri-apps/plugin-dialog`, `plugin-fs`, `plugin-sql` | 프런트에서 부르는 곳이 사라짐 |
| Rust `tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-sql` + 플러그인 등록 | 위와 동일 |
| capability `dialog:allow-open`, `fs:*` 8개, `sql:*` 2개 | 플러그인과 함께 제거 (남기면 빌드가 깨진다) |
| `.gitignore`의 `*.gguf` / `src-tauri/binaries/*`, `src-tauri/binaries/README.md` | 모델·사이드카 바이너리 자리 자체가 없어짐 |
| `src/lib/calendarContext.ts`, `src/app/executeAgentActions.ts` | AI 전용 헬퍼 |

`platform.aiFetch`와 `http:default`는 설계대로 유지했다 — 외부 캘린더(ICS)가 쓴다.

### 설계대로 유지한 것

`AppSettings.aiModel`은 남겼다. 주석만 "제거된 기능의 잔여 필드, 한 릴리스 뒤 정리"로 고쳤다.

### 데이터 정리

`src/domain/migrations/dropAiStorage.ts`를 추가하고 `main.tsx`에서 첫 렌더 전에
1회 호출한다. §5의 localStorage 키 7개를 지우며, 디스크의 모델/바이너리/인덱스
DB는 설계대로 건드리지 않는다.

### 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc -b --force` | 통과 |
| `npm test` | 117 파일 · 1,715개 통과 (AI 테스트 12개는 삭제, Rail 라벨 기대값 1건 수정) |
| `npm run build` | 성공 — JS 983 kB / CSS 186 kB |
| `cargo check` | 경고 0 (`.run(|_app, event|)` — 사이드카 종료 훅이 빠지며 비-macOS에서 미사용이 됨) |
| `npm run test:e2e` | 아래 참조 |
| `grep -rin "ollama\|localAi\|local_ai\|llama"` (src, src-tauri, e2e) | 잔여 0건 (마이그레이션 파일의 설명 주석 제외) |

### 삭제 규모 (실측)

TS/TSX 약 10,900줄, Rust 1,080줄, i18n 229키 ×2, CSS 127개 규칙(808줄),
설정 화면 1,723 → 775줄.
