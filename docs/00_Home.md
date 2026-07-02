# FocusFlow 문서 홈

이 Vault는 `C:\Users\minju\Todolist\docs`를 루트로 사용한다.

## 시작 문서

- [[01_Project_Overview]]
- [[Architecture/Folder_Structure]]
- [[Architecture/App_Flow]]
- [[Code_Map/src_overview]]

## 기능 문서

- [[Features/Calendar]]
- [[Features/Study]]
- [[Features/AI_Assistant]]

## 운영 문서

- [[Issues/Current_Issues]]
- [[Dev_Logs/2026-07-02]]

## 현재 관찰 요약

- 구현됨: Inbox, Today, Calendar, Projects, Planning, Study, Archive, Settings, AI Assistant 기본 흐름
- 구현됨: localStorage 기반 데이터 저장, 선택적 Supabase 동기화, 한국어/영어 i18n
- 개선 필요: `dist` 디렉터리 쓰기 문제로 production build 산출물 생성 실패
- 구현됨: AI provider chain은 local Ollama -> remote Ollama -> server endpoint fallback 순서로 정리됨
