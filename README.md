# Totolist

할 일 · 캘린더 · 집중(포모도로)을 하나로 묶은 개인 생산성 앱. 웹(Vite + React)과
데스크톱(Tauri 2) 두 형태로 같은 코드를 실행한다.

```bash
npm install
npm run dev          # 웹 개발 서버
npm run tauri:dev    # 데스크톱 앱
npm test             # 단위 테스트 (vitest)
npm run test:e2e     # E2E (playwright)
```

## AI 기능은 제거되었습니다 (2026-08-27)

로컬 AI 런타임(llama-server), AI 채팅/어시스턴트, Obsidian 지식베이스는 앱에서
모두 제거했다. 배경과 삭제 범위는 `LOCAL_AI_REMOVAL_DESIGN.md`에 있고, 그 기능들을
설명하던 설계 문서(`LOCAL_AI_SYSTEM_DESIGN.md`, `KNOWLEDGE_BASE_DESIGN.md`,
`AI_OLLAMA_FEATURES.md`, `SPACES_AI_BRIEFING_DESIGN.md`)는 폐기 표시만 남기고
기록용으로 보관한다.

기존 사용자의 기기에는 직접 내려받은 모델 파일이 남아 있을 수 있다. 앱이 임의로
지우지 않으므로, 공간을 회수하려면 앱 로컬 데이터 폴더의 `models/`, `bin/`과
`knowledge_index.db`를 직접 삭제하면 된다.
