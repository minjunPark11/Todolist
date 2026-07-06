# llama-server sidecar binaries (git에 커밋 금지)

이 폴더는 Local AI 시스템(Phase 3, `LOCAL_AI_SYSTEM_DESIGN.md` §7)이 Tauri
sidecar로 실행할 `llama-server` 바이너리를 두는 자리다. **바이너리는 절대 git에
커밋하지 않는다** — `.gitignore`가 이 폴더의 README 외 모든 파일을 차단한다.

## 파일 이름 규칙 (Tauri externalBin)

Tauri는 `tauri.conf.json`의 `bundle.externalBin: ["binaries/llama-server"]`
설정에 target triple을 붙여 파일을 찾는다:

- `llama-server-x86_64-pc-windows-msvc.exe`
- `llama-server-aarch64-apple-darwin`
- `llama-server-x86_64-apple-darwin`
- `llama-server-x86_64-unknown-linux-gnu`

## 주의

- externalBin에 등록된 파일이 없으면 `tauri build`가 실패한다. 릴리스/CI
  파이프라인에서 llama.cpp **공식 릴리스** 바이너리를 내려받아 이 폴더에 배치한
  뒤에만 tauri.conf.json에 externalBin을 추가할 것.
- 바이너리 버전과 sha256을 릴리스 노트에 기록한다 (공급망 신뢰).
- GGUF 모델 파일도 이 저장소 어디에도 커밋하지 않는다. 모델은 런타임에 앱
  로컬 데이터 폴더(`<app-local-data>/models/`)로 다운로드된다.
