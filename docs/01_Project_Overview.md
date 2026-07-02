# Project Overview

## 프로젝트 정체성

FocusFlow는 개인 작업관리, 캘린더, 프로젝트 관리, 공부 노트/복습, AI 비서를 한 화면 구조 안에 묶은 React 기반 생산성 웹앱이다.

관련 코드:

- `C:\Users\minju\Todolist\src\App.tsx`
- `C:\Users\minju\Todolist\src\types.ts`
- `C:\Users\minju\Todolist\src\hooks\usePlannerData.ts`
- `C:\Users\minju\Todolist\src\styles.css`

## 기술 스택

- React 18: `C:\Users\minju\Todolist\src\main.tsx`
- TypeScript: `C:\Users\minju\Todolist\tsconfig.json`, `C:\Users\minju\Todolist\tsconfig.app.json`
- Vite: `C:\Users\minju\Todolist\vite.config.js`
- Supabase optional sync: `C:\Users\minju\Todolist\src\services\supabaseClient.ts`
- Ollama 기반 AI: `C:\Users\minju\Todolist\src\lib\ai`

## 현재 실행 상태

- `node_modules`와 `package-lock.json`이 있으므로 현재 상태에서는 `npm install`이 이미 수행된 상태로 보인다.
- `npm.cmd run typecheck` 통과.
- `npm.cmd run dev` 기동 확인: `http://127.0.0.1:5173/`
- `npm run build`는 PowerShell 정책 때문에 `npm.ps1` 실행이 막힘.
- `npm.cmd run build`는 TypeScript 단계와 Vite transform 후 `dist/assets` 생성에서 `EPERM`으로 실패.

## 주요 기능

- 구현됨: 작업 생성, 상태 변경, 상세 편집, 반복 작업, 아카이브, 삭제 확인
- 구현됨: Today 중심 작업 버킷, Inbox, Project, Planning, Calendar
- 구현됨: Study Topic, Concept Note, 복습 큐, 난이도별 다음 복습일 계산
- 구현됨: Ollama/Remote Ollama 기반 채팅과 agent action preview/apply
- 구현됨: 설정 화면, JSON export/import, 샘플 데이터 로드, i18n 언어 전환

## 관련 문서

- [[Architecture/Folder_Structure]]
- [[Architecture/App_Flow]]
- [[Features/Calendar]]
- [[Features/Study]]
- [[Features/AI_Assistant]]
- [[Issues/Current_Issues]]
