# Obsidian Vault 로컬 지식베이스 설계 (Lite → Full RAG)

> 상태: **설계 확정** (2026-07-06, §11 결정 반영) · 구현 전 문서
> 대상: FocusFlow 데스크톱(Tauri) 앱
> 관련 코드: `src/platform/*`, `src/lib/ai/*`, `src/hooks/usePlannerData.ts`

---

## 1. 설계 요약

사용자가 Obsidian Vault 폴더를 지정하면, 앱이 Vault의 `.md` 노트를 읽어
AI 챗(로컬 Ollama) 컨텍스트에 관련 내용을 넣어주는 **로컬 지식베이스** 기능.

- **Lite(1단계)**: Vault에서 텍스트 파일을 제한적으로 읽어(파일 수·크기·문자 예산)
  AI 컨텍스트에 이어붙인다. 검색 없음.
- **Full(2단계)**: 노트를 chunk로 쪼개 Ollama 임베딩을 생성, 로컬 DB(knowledge index)에
  저장하고, 질문 시 top-k 유사 chunk만 검색해 컨텍스트로 전달(로컬 RAG).
- Lite와 Full은 **동일한 인터페이스(`KnowledgeContextSource`)** 뒤에 있어,
  Full 전환 시 구조를 갈아엎지 않고 구현체만 교체한다.

### 핵심 원칙 (불변 규칙)

| # | 원칙 |
|---|------|
| 1 | Obsidian Vault는 **원본 저장소**다. 앱은 소비자일 뿐이다. |
| 2 | 앱의 Knowledge DB는 **검색용 로컬 색인**이다. 원본이 아니다. |
| 3 | Ollama가 노트를 "학습"하는 것이 아니다. 앱이 관련 문단을 찾아 **요청 컨텍스트로 전달**할 뿐이다. |
| 4 | Knowledge DB는 서버/Supabase에 **저장하지 않는다**. |
| 5 | Knowledge DB는 반드시 **기기 로컬**에 저장한다. |
| 6 | `vaultPath`, `dbPath`는 **sync 제외** — 기기별 local setting으로만 저장한다. |
| 7 | Obsidian 파일은 **읽기 전용**으로 접근한다. |
| 8 | 사용자가 명시적으로 허용하기 전까지 원본 파일을 **수정하지 않는다**. |
| 9 | **원격 AI provider에는 Obsidian-derived context를 보내지 않는다.** |
| 10 | Obsidian context는 **로컬 Ollama provider일 때만** 사용한다. |

원칙 9·10은 기존 `AiProvider.canHandleFullAppData()` 게이트(로컬 provider만 전체 앱
데이터 수신)와 같은 계열이며, 지식베이스용으로 `canHandleKnowledgeContext()`를
추가해 동일한 방식으로 강제한다.

---

## 2. 전체 아키텍처

```
┌─────────────────────────── Desktop (Tauri) ───────────────────────────┐
│                                                                        │
│  Obsidian Vault (원본, 읽기 전용)                                        │
│  ~/Documents/MyVault/**/*.md                                           │
│        │ scan / read (fs plugin, read-only scope)                      │
│        ▼                                                               │
│  ObsidianScanner ──▶ MarkdownParser ──▶ Chunker                        │
│        │                                   │ (Full only)               │
│        │ Lite: 파일 단위                     ▼                          │
│        │                     EmbeddingProvider (Ollama /api/embed)     │
│        │                                   │                           │
│        │                                   ▼                           │
│        │                     KnowledgeStore (SQLite: knowledge_index.db)│
│        │                       files / chunks / embeddings / meta      │
│        ▼                                   │                           │
│  ┌───────────────── KnowledgeContextSource (공통 인터페이스) ─────────┐ │
│  │  LiteFolderContextSource      RagRetrieverContextSource (Full)     │ │
│  │  (예산 내 파일 이어붙임)         (query embed → top-k chunk)          │ │
│  └───────────────────────────────┬────────────────────────────────────┘ │
│                                  ▼                                     │
│  AiContextBuilder (기존 buildAiContext 확장)                            │
│    앱 데이터 컨텍스트 + knowledge 컨텍스트(전용 예산) 조합                  │
│                                  ▼                                     │
│  AI Gateway ──[로컬 Ollama만]──▶ Ollama /api/chat                       │
│              └─[원격/서버 provider]─▶ knowledge context 제거 후 전달      │
└────────────────────────────────────────────────────────────────────────┘

Web 빌드: platform.files 미지원 → 설정 UI 비활성 + "Desktop only" 안내
Supabase: 지식베이스 관련 데이터·경로 일절 저장 안 함
```

### 저장 위치 구분

| 데이터 | 위치 | sync |
|--------|------|------|
| Obsidian 노트 원본 | 사용자 Vault 폴더 | ❌ (앱이 관여 안 함) |
| Knowledge DB (`knowledge_index.db`) | 기본: Tauri `appDataDir()` / 옵션: 사용자 지정 폴더 | ❌ 절대 안 함 |
| KnowledgeSettings (vaultPath, dbPath, enabled…) | `platform.storage` 기기 로컬 키 | ❌ 절대 안 함 |
| 기존 앱 데이터/appSettings | localStorage + Supabase | ✅ (기존 그대로) |

### sync 제외 설정 목록 (명시)

다음 값은 **`appSettings`에 넣지 않는다.** (`appSettings`는 `app_settings` 행으로
Supabase에 동기화되기 때문.) 대신 별도 로컬 키 `focusflow.knowledge.v1`에 저장한다.

- `vaultPath` — 기기마다 다른 절대경로
- `dbPath` — 〃
- `enabled`, `indexingMode`, `lastIndexedAt`, `excludedFolders` — 색인 상태는 기기 종속
- 임베딩 모델명(`embeddingModel`)은 논의 여지 있으나 **기기 로컬로 시작** (기기마다 설치 모델이 다름)

---

## 3. 데이터 흐름

### 3.1 Lite — 컨텍스트 구성 (질문 시마다)

```
사용자 질문
  → provider가 로컬 Ollama인지 확인 (아니면 knowledge 생략)
  → ObsidianScanner.scan(vaultPath)        // .md/.markdown/.txt, 제외폴더 skip
  → 파일 선정 (2단계, 비용 통제):
     1) 스캔 메타만으로 질문 키워드 ↔ 파일명 매칭 점수
     2) 상위 후보 파일만 read하여 heading/tag/aliases 매칭 가산점
     최종 순위: 키워드 매칭 점수 > 최근 수정순 (tie-breaker)
     ※ 본문 전문 키워드 검색은 하지 않는다 — 전 파일 read를 유발해 Lite의
       가벼움을 깨뜨림. 본문 수준 관련도는 Full RAG의 몫.
  → 제한 적용 (기본: 최대 50파일 · 파일당 256KB)
  → knowledge 전용 문자 예산(기본 30,000자, 설정 조절 가능)까지 이어붙임
  → [KNOWLEDGE] 블록으로 시스템 컨텍스트에 append (파일 경로 헤더 포함)
  → Ollama /api/chat
```

우선 폴더(예: `daily/`, `projects/`)는 지금 UI를 만들지 않되,
`KnowledgeSettings.priorityFolders: string[]`(기본 `[]`)로 자리만 확보해
선정 점수에 가산점을 줄 수 있는 확장 지점으로 남긴다.

Lite는 색인·DB가 없다. 매 질문마다 읽되, 스캔 결과를 세션 메모리에 짧게(TTL 30s)
캐시해 연타 질문의 중복 I/O를 줄인다.

### 3.2 Full — 최초 인덱싱

```
Vault 연결 or "지금 색인" 클릭
  → scan: 모든 .md 파일 경로+mtime+size 수집
  → 파일별: read → hash(sha256) → MarkdownParser(heading/tags/[[links]]/tasks)
  → Chunker: heading 우선, 문단 보조, target 600~900자, overlap 100~150자
  → EmbeddingProvider: chunk 배치 임베딩 (Ollama /api/embed, 기본 bge-m3)
  → KnowledgeStore: files/chunks 행 저장 (embedding BLOB 포함)
  → meta.lastIndexedAt 갱신, 진행률 UI 이벤트 발행
```

### 3.3 Full — 증분 인덱싱 (재동기화)

```
트리거: 앱 시작 / 수동 새로고침 / (선택) 폴링·watch
  → scan 결과와 DB files 테이블 비교 (path 기준)
     신규 파일   → 전체 파이프라인으로 색인 추가
     mtime 변경  → hash 재계산 → hash 다르면 해당 파일 chunk 전부 삭제 후 재색인
     DB에만 존재 → 파일 삭제로 판단, files+chunks 행 제거
  → 전체 Vault 재처리 금지. 변경분만.
```

### 3.4 Full — 질문 시 검색 (retrieval)

```
사용자 질문
  → 로컬 Ollama 확인 (아니면 knowledge 생략 — 원칙 9·10)
  → 질문 텍스트 임베딩 (동일 embedding 모델)
  → KnowledgeStore에서 코사인 유사도 top-k (기본 k=6, 유사도 하한 적용)
  → chunk들을 예산 내에서 조합, 각 chunk 앞에 `source: path#heading` 표기
  → 시스템 컨텍스트 [KNOWLEDGE] 블록으로 주입 + "답변 시 출처 파일명을 표기하라" 지시
  → Ollama /api/chat → 답변에 출처 노출
```

---

## 4. 모듈 설계

새 코드는 `src/lib/knowledge/` 아래에 둔다. AI 게이트웨이와는 인터페이스로만 결합한다.

### 4.1 PlatformAdapter 확장 — `files` (desktop 전용)

```ts
// src/platform/types.ts 에 추가
export interface PlatformFileEntry {
  path: string;          // 절대경로
  relativePath: string;  // vault 기준 상대경로
  size: number;
  modifiedAt: number;    // epoch ms
}

export interface PlatformFiles {
  supported(): boolean;                          // web: false
  pickFolder(): Promise<string | null>;          // dialog plugin
  scanMarkdownFiles(root: string, options: {
    extensions: string[];                        // [".md", ".markdown", ".txt"]
    excludedFolders: string[];                   // [".obsidian", ".trash", ...]
    maxFiles?: number;
  }): Promise<PlatformFileEntry[]>;
  readTextFile(path: string, maxBytes?: number): Promise<string>;  // 읽기 전용
  getFileMetadata(path: string): Promise<PlatformFileEntry | null>;
  getDefaultKnowledgeDbPath(): Promise<string>;  // appDataDir()/knowledge_index.db
}

// PlatformAdapter에 files: PlatformFiles 추가.
// web.ts 구현: supported()=false, 나머지는 즉시 실패(불가 안내용 에러).
```

Tauri 배선(구현 시): `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog` +
`plugin-sql`(Full, SQLite) 추가. capabilities는 **읽기 권한만**, 그리고 가능하면
dialog로 사용자가 고른 경로에 한정하는 scope 사용(`fs:allow-read-text-file` +
`dialog` scope). 쓰기 권한은 knowledge DB 디렉터리에만 부여(원칙 7·8).

### 4.2 KnowledgeSettings (기기 로컬 전용)

```ts
// 저장: platform.storage key "focusflow.knowledge.v1" — appSettings와 격리
export interface KnowledgeSettings {
  enabled: boolean;             // 기능 on/off
  vaultPath: string;            // "" = 미연결
  dbPath: string;               // "" = 기본 appDataDir 사용 (fallback 규칙 적용)
  indexingMode: "lite" | "full";
  embeddingModel: string;       // Full용. 기본 "bge-m3" (한국어 품질 우선),
                                // 가벼운 대안 "nomic-embed-text" 선택 가능
  excludedFolders: string[];    // 기본 [".obsidian", ".trash", "templates"]
  priorityFolders: string[];    // Lite 선정 가산점용. 기본 [] (UI는 추후)
  knowledgeBudgetChars: number; // 기본 30_000, 설정에서 조절
  lastIndexedAt: string;        // ISO, Full에서만 갱신
}
```

- 로드/저장 전용 훅 `useKnowledgeSettings()` 제공. `usePlannerData`의 sync 경로와
  물리적으로 분리해 실수로 동기화될 여지를 차단.
- **dbPath fallback 규칙**: 비어 있거나 접근 불가(존재하지 않음/권한 없음) →
  `getDefaultKnowledgeDbPath()`로 대체하고 UI에 fallback 사실을 표시.

### 4.3 ObsidianScanner

책임: Vault 트리 순회, 대상 파일 목록화.
- 확장자 화이트리스트, `excludedFolders`(경로 접두 매칭) skip, 심볼릭 링크 무시.
- 출력: `PlatformFileEntry[]` — 이후 단계는 이 목록만 신뢰.

### 4.4 MarkdownParser

책임: 노트 1개의 구조 추출 (색인 메타데이터·chunk 경계용).
- headings(레벨·텍스트·offset), `#tags`, `[[wiki links]]`, `- [ ]`/`- [x]` tasks,
  frontmatter(YAML)의 **`tags`와 `aliases`만** 구조화 — 그 외 frontmatter 필드는
  이번 단계에서 파싱하지 않는다(YAML 전체 구조화는 범위 밖).
- aliases는 Lite 파일 선정(키워드 매칭)과 Full 색인 메타 양쪽에 사용.
- 출력 타입 `ParsedNote`. Lite에서는 heading/tag/aliases 매칭에만 부분 사용.

### 4.5 Chunker (Full)

- 1차 경계: heading 단위. 한 섹션이 target(600~900자) 초과 시 문단 경계로 2차 분할.
- overlap 100~150자(문단 경계 존중). 코드블록은 중간에서 자르지 않음.
- chunk마다 `filePath, headingPath("H1 > H2"), startOffset, text` 유지.

### 4.6 EmbeddingProvider

```ts
export interface EmbeddingProvider {
  isAvailable(): Promise<boolean>;      // 모델 설치 여부까지 확인 (/api/tags)
  embed(texts: string[]): Promise<number[][]>;  // 배치
  modelName(): string;
  dimensions(): number | null;          // 최초 임베딩 후 확정
}
```

- 구현: `OllamaEmbeddingProvider` (`/api/embed`, 로컬만).
- **기본 모델: `bge-m3`** (다국어·한국어 검색 품질 우선, ~1.2GB, 1024차원).
  가벼운 대안으로 `nomic-embed-text`(~270MB, 768차원)를 드롭다운에서 선택 가능.
- **모델 부재 시**: 색인 시작을 막고 안내 — "임베딩 모델이 없습니다.
  `ollama pull bge-m3` 후 다시 시도하세요." (AI 챗의 offline 배너와 동일 패턴)
- 두 모델은 **차원이 달라 교체 시 전체 재색인 필수** → DB meta에
  `embeddingModel`, `dimensions` 기록, 불일치 감지 시 재색인 유도 배너.

### 4.7 KnowledgeStore (Full)

- SQLite (tauri-plugin-sql). 파일: `knowledge_index.db` (dbPath 규칙 적용).
- 책임: files/chunks CRUD, hash 비교용 조회, 유사도 검색(1차: 전 chunk 로드 후
  코사인 계산 — 수천 chunk까지는 충분; 이후 필요 시 sqlite-vec 확장 검토).
- 원격 전송 코드 경로 자체가 없음(원칙 4·5).

### 4.8 Retriever (Full)

```ts
export interface RetrievedChunk {
  text: string; filePath: string; headingPath: string; score: number;
}
export interface KnowledgeContextSource {
  isReady(): Promise<boolean>;
  buildContext(query: string, budgetChars: number): Promise<{
    text: string;                 // "[KNOWLEDGE] ..." 블록 (출처 헤더 포함)
    sources: RetrievedChunk[];    // UI 출처 표시용
  } | null>;
}
```

- **이 인터페이스가 Lite→Full 교체 지점이다.**
  - `LiteFolderContextSource`: query 무시, 최근 수정 파일을 예산 내 이어붙임.
  - `RagRetrieverContextSource`: query 임베딩 → top-k → 조합.
- 선택 로직: `indexingMode === "full" && store 준비됨` 이면 RAG, 아니면 Lite.

### 4.9 AiContextBuilder 통합

- 기존 `buildAiContextText()`는 그대로 두고, 호출부(`OllamaChat.submit`)에서
  `KnowledgeContextSource.buildContext()` 결과를 **별도 시스템 메시지**로 추가.
- 예산: 기본 30,000자 (`KnowledgeSettings.knowledgeBudgetChars`, 설정 조절).
  작은 로컬 모델(예: gemma3 4B)의 컨텍스트를 고려한 보수적 기본값.
  앱 데이터 예산과 분리해 서로 밀어내지 않게 한다.
  Full에서는 top-k=6 × chunk ~900자 ≈ 5~6k자라 예산은 사실상 Lite용 안전장치.
- **provider 게이트**: `AiChatRequest`에 `knowledgeContext?: string` 필드를 별도로
  두고, gateway가 provider 선택 시 `canHandleKnowledgeContext()`(= 로컬 Ollama만
  true)가 아닌 provider로 폴백하는 경우 **해당 필드를 제거**하고 전달한다.
  → 원격 유출이 구조적으로 불가능(원칙 9·10).

---

## 5. DB Schema 초안 (Full)

```sql
-- knowledge_index.db (SQLite)

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- rows: schema_version, vault_path, embedding_model, embedding_dimensions,
--       last_indexed_at

CREATE TABLE files (
  id            INTEGER PRIMARY KEY,
  relative_path TEXT NOT NULL UNIQUE,   -- vault 기준
  content_hash  TEXT NOT NULL,          -- sha256
  size_bytes    INTEGER NOT NULL,
  modified_at   INTEGER NOT NULL,       -- epoch ms
  indexed_at    INTEGER NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]',   -- JSON array
  aliases       TEXT NOT NULL DEFAULT '[]',   -- JSON array (frontmatter aliases)
  wiki_links    TEXT NOT NULL DEFAULT '[]'    -- JSON array
);

CREATE TABLE chunks (
  id            INTEGER PRIMARY KEY,
  file_id       INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,       -- 파일 내 순서
  heading_path  TEXT NOT NULL DEFAULT '',
  start_offset  INTEGER NOT NULL,
  text          TEXT NOT NULL,
  embedding     BLOB NOT NULL,          -- float32[] little-endian
  UNIQUE (file_id, chunk_index)
);

CREATE INDEX idx_files_path   ON files(relative_path);
CREATE INDEX idx_chunks_file  ON chunks(file_id);
```

- 임베딩은 float32 BLOB. 검색은 앱 레벨 코사인(1차). chunk 수가 커지면
  sqlite-vec/HNSW 도입 — schema에 `embedding`이 chunk 행에 있으므로 마이그레이션 용이.
- `schema_version`으로 향후 마이그레이션 관리.

---

## 6. Context Building 전략

1. 기본 우선순위: 시스템 프롬프트 > 앱 데이터 컨텍스트 > knowledge 컨텍스트.
2. knowledge 블록 형식:
   ```
   [KNOWLEDGE from Obsidian vault — read-only excerpts]
   ── source: daily/2026-07-01.md # 회고
   <chunk text>
   ── source: projects/focusflow.md # 릴리즈 계획
   <chunk text>
   ...
   Instructions: cite the source path when you use these excerpts.
   ```
3. 예산 초과 시: score 낮은 chunk부터 탈락(Lite는 오래된 파일부터 탈락) +
   `[knowledge truncated]` 표기.
4. Lite와 Full 모두 같은 블록 형식을 쓰므로 프롬프트 관점에서도 교체 무손실.
5. 출처 UI: 응답 하단에 `sources`를 칩 형태로 노출(클릭 시 경로 복사). 모델 인용과
   별개로 앱이 검색에 실제 쓴 출처를 보여줘 신뢰성 확보.

---

## 7. UI 설정 화면 구성

설정 → **지식베이스** 탭 신설 (desktop) / web에서는 탭 노출하되 비활성 + "Desktop only".

```
[지식베이스 (Obsidian)]
  연결 상태     ● 연결됨: ~/Documents/MyVault   [폴더 변경] [연결 해제]
  기능 사용     (토글) AI 챗에 내 노트 참고 허용
  모드         ( Lite: 최근 노트 참고 | Full: 색인 + 의미 검색 )
  ── Full 선택 시 ──
  임베딩 모델   bge-m3 (기본) | nomic-embed-text (드롭다운, /api/tags 기반)   [↻]
  컨텍스트 예산 30,000자 (슬라이더/입력, 10k~100k)
  색인 상태     1,240 파일 · 8,932 chunks · 마지막 색인 7/6 14:02
               [지금 색인] [진행률 바 / 취소]
  ── Advanced ──
  DB 위치      기본 (앱 데이터 폴더)  [사용자 지정…] [기본값으로]
               ⚠ 접근 불가 시 자동으로 기본 위치로 대체됩니다
  제외 폴더     .obsidian, .trash, templates  [편집]
  개인정보     "노트 내용은 이 기기의 로컬 Ollama에만 전달되며,
               서버·클라우드로 전송되지 않습니다."
```

AI 챗 패널: knowledge 사용 중이면 헤더에 📚 배지, 답변 아래 출처 칩.

---

## 8. Privacy / Security Policy (local-only)

- 노트 원문·chunk·임베딩·경로 중 **어떤 것도** Supabase/원격 서버로 보내지 않는다.
  - 강제 장치 ①: `AiChatRequest.knowledgeContext` 분리 + gateway가 비로컬 provider
    폴백 시 필드 제거.
  - 강제 장치 ②: KnowledgeStore에 네트워크 코드 경로 없음.
  - 강제 장치 ③: KnowledgeSettings는 sync 파이프라인과 물리적으로 다른 storage 키.
- Tauri capability는 읽기 최소 권한 + DB 폴더에만 쓰기.
- Vault 쓰기 기능(예: "AI 제안을 노트로 저장")은 **명시적 옵트인 설정 + 별도
  capability**가 생기기 전까지 설계상 금지(원칙 7·8).
- 사용자 데이터 삭제: "연결 해제" 모달에서 "검색 색인 DB도 삭제할까요?"를 묻는다.
  **기본 선택은 삭제**(프라이버시 우선), 사용자가 원하면 보존 선택 가능
  (재연결 시 재색인 생략).

---

## 9. 리스크와 대응

| 리스크 | 대응 |
|--------|------|
| 임베딩 모델 미설치 | 색인 진입 차단 + pull 명령 안내. Lite로 자동 강등 옵션 |
| 대형 Vault(수만 파일) 최초 색인 지연 | 배치 처리 + 진행률/취소, 백그라운드 실행, 재시작 시 이어하기(파일 단위 트랜잭션) |
| 작은 Ollama 모델의 컨텍스트 한계 | knowledge 예산 분리 + top-k 제한, k·예산을 설정으로 |
| Vault 수정 중 색인 경합 | hash 비교로 다음 증분에서 자연 수복. watch는 도입 보류 |
| 임베딩 모델 교체 | meta 불일치 감지 → 전체 재색인 유도 배너 |
| dbPath 접근 불가(외장 디스크 분리 등) | 기본 경로 fallback + UI 경고 (설계 요구사항) |
| 경로가 실수로 sync됨 | KnowledgeSettings를 appSettings 밖 별도 키로 격리(구조적 차단) |
| web 빌드에서 호출 | `files.supported()=false` 가드 + UI 비활성 |
| chunk 수 증가로 검색 느려짐 | 1차 앱-레벨 코사인(수천 OK) → 임계 초과 시 sqlite-vec |

---

## 10. Phase별 구현 계획

**Phase 0 — 플랫폼 토대** (Lite·Full 공통)
- fs/dialog 플러그인 추가 + capabilities(읽기 최소 권한)
- `platform.files` 구현 (tauri/web)
- `KnowledgeSettings` + `useKnowledgeSettings()` (로컬 키, sync 격리)
- 설정 UI 골격: Vault 연결/해제, 토글, Desktop-only 처리

**Phase 1 — Lite 출시**
- ObsidianScanner + `LiteFolderContextSource`
- `AiChatRequest.knowledgeContext` + gateway 게이트(`canHandleKnowledgeContext`)
- knowledge 예산(`AI_CONTEXT_LIMITS`) + [KNOWLEDGE] 블록 + 챗 배지
- 파일 선정: 키워드(파일명 > heading/tag/aliases) 매칭 우선, 최근 수정순 tie-break
- 제한: 50파일 · 256KB/파일 · 30k자 예산(설정 조절)

**Phase 2 — Full 색인 파이프라인**
- plugin-sql + KnowledgeStore(schema v1) + MarkdownParser + Chunker
- OllamaEmbeddingProvider(모델 확인·안내 포함)
- 최초 색인 + 진행률 UI, 증분 색인(hash/mtime diff), 삭제 반영

**Phase 3 — Full retrieval 전환**
- `RagRetrieverContextSource` (query embed → top-k)
- mode 스위치(Lite↔Full), 출처 칩 UI, 재색인 유도 배너

**Phase 4 — 고도화 (선택)**
- sqlite-vec, 파일 watch, 앱 데이터(할 일·노트) 통합 임베딩,
  메시지별 파일 첨부, (옵트인) Vault 쓰기

각 Phase는 독립 배포 가능하며, Phase 1 이후 언제든 멈춰도 완결된 기능이 남는다.

---

## 11. 확정된 설계 결정 (2026-07-06)

구현 전 확인 질문 8건에 대한 답변이 확정되어 본문에 반영됨. 기록:

| # | 항목 | 결정 |
|---|------|------|
| 1 | 임베딩 모델 | 기본 **`bge-m3`**(한국어 품질 우선). 미설치 시 색인 차단 + `ollama pull bge-m3` 안내. 가벼운 대안 `nomic-embed-text` 선택 가능. 차원 상이 → 교체 시 전체 재색인 |
| 2 | Lite 파일 선정 | **파일명/heading/tag/aliases 키워드 매칭 > 최근 수정순**. 본문 전문 검색은 금지(비용). 우선 폴더는 `priorityFolders` 설정 자리만 확보, UI는 추후 |
| 3 | 증분 색인 트리거 | 앱 시작 자동 확인 + 수동 새로고침만. 폴링/watch는 Phase 4 이후 |
| 4 | frontmatter | `tags` + `aliases`만 구조화. 그 외 필드는 범위 밖 |
| 5 | top-k / 예산 | k=6 유지. knowledge 예산 기본 **30k자**, 설정에서 조절(10k~100k) |
| 6 | 연결 해제 시 DB | 모달로 "색인 DB도 삭제?" 질문, **기본 삭제**(프라이버시 우선), 보존 선택 가능 |
| 7 | 설정 위치 | **"지식베이스" 독립 탭** (핵심 확장 기능으로 취급) |
| 8 | web 노출 | 탭을 **비활성 상태로 노출** + "Desktop only" 안내 (숨기지 않음) |

추가 지침:
- Phase 0~1은 플랫폼 토대 + Lite 연결 경험 안정화에 집중. Full RAG는 그 뒤.
- 읽기 전용 원칙(§1 원칙 7·8)과 원격 provider 게이트(§1 원칙 9·10, §4.9) 유지.

### 구현 시 주의점 (평가에서 도출)

- **bge-m3 비용**: ~1.2GB 모델·1024차원 — 대형 Vault에서 최초 색인 시간과 DB 크기
  증가. 진행률/취소 UI(§9)가 필수 전제.
- **Lite 키워드 매칭 비용 통제**: 매칭은 반드시 2단계(파일명은 스캔 메타만 →
  상위 후보만 read하여 heading/tag/aliases 확인). 전 파일 read 금지.
- **예산-모델 관계**: 30k자 ≈ 한국어 15k~20k 토큰. 소형 모델(4B)에서는 20k 이하
  권장 — 설정 UI에 권장치 힌트 표기 고려.
- **모델 교체 재색인**: meta의 `embeddingModel`/`dimensions` 불일치 감지 배너는
  Phase 2 필수 범위(선택 아님).
