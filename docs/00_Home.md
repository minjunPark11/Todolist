# FocusFlow 문서 홈

이 Vault는 `C:\Users\minju\Todolist\docs`를 루트로 사용한다.

## 시작 문서

- [[01_Project_Overview]]
- [[Architecture/Folder_Structure]]
- [[Architecture/App_Flow]]
- [[Architecture/Motion_System]]
- [[Code_Map/src_overview]]

## 기능 문서

- [[Features/Calendar]]
- [[Features/Study]]
- [[Features/AI_Assistant]]

## 운영 문서

- [[Issues/Current_Issues]]
- [[Dev_Logs/2026-07-02]]
- [[Dev_Logs/2026-07-04]] — 디자인 시스템 전면 적용 + 배포 이슈 해결 + 데스크톱 앱 설계
- [[Decisions/Architecture_Decisions]]

## 진행 중 계획

- 데스크톱 앱 (Tauri 2): 설계 확정, 구현 전 — 리포 루트 `DESKTOP_APP_DESIGN.md`가 단일 기준 문서.
  다음 작업은 1단계(플랫폼 어댑터 도입), 자세한 건 [[Dev_Logs/2026-07-04]] "다음 작업" 참고.

## 현재 관찰 요약

- 구현됨: Inbox, Today, Calendar, Projects, Planning, Study, Archive, Settings, AI Assistant 기본 흐름
- 구현됨: localStorage 기반 데이터 저장, 선택적 Supabase 동기화, 한국어/영어 i18n
- 구현됨: iOS 스타일 디자인 시스템 토큰 레이어 (2026-07-04, styles.css)
- 구현됨: AI provider chain은 local Ollama -> remote Ollama -> server endpoint fallback 순서로 정리됨
- 배포: Vercel이 `codex/new_design` 브랜치를 자동 배포. 푸시 전 `npm run build` 필수 (dev는 타입체크 안 함)
