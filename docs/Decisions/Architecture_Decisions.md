# Architecture Decisions

## 2026-07-02 - AI Gateway Provider Order

Decision: AI calls use a single gateway entry point at `C:\Users\minju\Todolist\src\lib\ai\gateway.ts`.

Provider order:

1. `ollamaProvider` in `C:\Users\minju\Todolist\src\lib\ai\providers\ollamaProvider.ts`
2. `remoteOllamaProvider` in `C:\Users\minju\Todolist\src\lib\ai\providers\remoteOllamaProvider.ts`
3. `serverProvider` in `C:\Users\minju\Todolist\src\lib\ai\providers\serverProvider.ts`

Rationale:

- Keep local Ollama as the default path.
- Keep remote Ollama as the explicit fallback enabled by `VITE_REMOTE_OLLAMA_ENABLED=true`.
- Allow a configured server endpoint via `VITE_AI_SERVER_URL` as the final fallback.
- Avoid UI components importing or calling provider implementations directly.

Follow-up:

- Provider availability currently depends on each provider's own `isAvailable()` check.
- Server provider should remain free of browser-exposed secrets; `VITE_AI_SERVER_URL` should point to a protected backend gateway, not a paid provider API directly.

## 2026-07-04 - Desktop App: Tauri 2 + Platform Adapter Layer

Decision: 데스크톱 앱은 Tauri 2로 만들고, 코어(`src/`)는 `src/platform/` 어댑터 계층을 통해서만 플랫폼 API에 접근한다.

전체 설계: 리포 루트 `DESKTOP_APP_DESIGN.md` (인터페이스 초안, 로드맵, 배포 방식 포함).

Rationale:

- 모바일 가능성을 열어둬야 함 → Tauri 2는 iOS/Android 타깃 지원, Electron은 불가.
- 이 앱의 차별점인 로컬 Ollama 연동이 데스크톱에서 CORS 없이 직결됨 (웹은 remote provider 우회 중).
- Vite 개발 흐름 유지 (`npm run tauri dev` 추가 수준), 설치본 ~10MB.
- 어댑터 패턴으로 웹(Vercel) 배포와 데스크톱이 같은 코드베이스에서 공존.

확정 범위 (사용자 결정):

- 배포: 지인 공유 — GitHub Releases + tauri updater, 코드 서명 생략(SmartScreen 경고 감수).
- 네이티브 기능: 트레이 미니 타이머 + 시스템 알림 + Ollama 직결.
- 후순위: 전역 단축키, 부팅 자동 시작, 오프라인 동기화(로컬 원본 + updatedAt LWW로 설계만 해둠).

Follow-up:

- 1단계(어댑터 도입)는 기능 변화 0인 리팩토링 — 웹 회귀 없음이 완료 기준.
- 구현 시작 전 Rust 툴체인(MSVC) 설치 확인 필요.

## 2026-07-04 - Design System: iOS-Style Token Layer

Decision: 디자인 시스템은 `src/styles.css`의 `:root` 토큰 + 파일 끝 오버라이드 레이어로 관리한다.

Rationale:

- 레퍼런스(Redesign FocusFlow Dashboard, Figma Make)에서 추출한 토큰을 전 화면에 캐스케이드.
- 기존 클래스/DOM을 유지하는 오버라이드 방식이라 기능 회귀 위험 최소 (기존 "FocusFlow IA refresh" 패턴 답습).
- 색·그림자·라운드는 반드시 토큰(`--tint-*`, `--shadow-*`, `--radius-*`)을 쓰고 하드코딩하지 않는다.
