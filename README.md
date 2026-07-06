# Totolist

## 개발 주의사항 — Local AI

`LOCAL_AI_SYSTEM_DESIGN.md` 참고. 요약:

- **GGUF 모델 파일과 `llama-server` 바이너리는 절대 git에 커밋하지 않는다.**
  (`.gitignore`가 `*.gguf`와 `src-tauri/binaries/*`를 차단한다.)
- llama-server sidecar 바이너리는 릴리스 파이프라인에서 llama.cpp 공식
  릴리스로부터 배치한다 — `src-tauri/binaries/README.md` 참고.
- 모델 카탈로그(`src/lib/localAi/modelCatalog.ts`)의 다운로드 URL과 sha256은
  현재 placeholder다. **출시 전 공식 리포지토리 기준으로 검증 후 확정**해야
  하며, 값이 없는 항목은 다운로드가 코드 레벨에서 막힌다.
- 모델 경로·Obsidian vault 경로 등 기기 로컬 경로는 Supabase 동기화 대상
  appSettings에 넣지 않는다 (`focusflow.localAi.v1` local-only storage 사용).
