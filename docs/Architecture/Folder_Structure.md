# Folder Structure

프로젝트 루트: `C:\Users\minju\Todolist`

## 루트

- `C:\Users\minju\Todolist\src`: 앱 소스 코드
- `C:\Users\minju\Todolist\docs`: Obsidian Vault
- `C:\Users\minju\Todolist\supabase`: Supabase migration
- `C:\Users\minju\Todolist\dist`: Vite build output. 현재 build 중 `dist/assets` 생성에서 권한 오류 발생
- `C:\Users\minju\Todolist\node_modules`: 설치된 npm dependencies
- `C:\Users\minju\Todolist\package.json`: scripts와 dependency 정의
- `C:\Users\minju\Todolist\.env.example`: Supabase 설정 예시

## src 구조

- `C:\Users\minju\Todolist\src\App.tsx`: 최상위 앱 상태, 페이지 분기, global handlers, AI action 실행 연결
- `C:\Users\minju\Todolist\src\main.tsx`: React root mount
- `C:\Users\minju\Todolist\src\types.ts`: Task, Project, Study, Habit, Focus, AppSettings 등 데이터 모델
- `C:\Users\minju\Todolist\src\styles.css`: 전역 스타일
- `C:\Users\minju\Todolist\src\components`: 주요 화면/컴포넌트
- `C:\Users\minju\Todolist\src\components\calendar`: Calendar 하위 컴포넌트
- `C:\Users\minju\Todolist\src\hooks`: 데이터 저장/동기화 hook
- `C:\Users\minju\Todolist\src\utils`: 날짜, planner 계산, calendar item/time 변환
- `C:\Users\minju\Todolist\src\lib`: calendar context 등 공용 라이브러리 (AI 관련은 2026-08-27 삭제)
- `C:\Users\minju\Todolist\src\data`: 샘플/초기 Study seed
- `C:\Users\minju\Todolist\src\i18n`: 한국어/영어 dictionary와 provider
- `C:\Users\minju\Todolist\src\services`: Supabase client

## 문서화 상태

- 구현됨: `C:\Users\minju\Todolist\docs` Vault 기본 폴더 생성
- 구현됨: Home, Overview, Architecture, Features, Code Map, Issues, Dev Log 문서 생성
- 개선 필요: 기존 루트 문서 `AI_OLLAMA_FEATURES.md`, `FEATURE_OVERVIEW.md`, `CALENDAR_DESIGN.md` 등과 Vault 문서 간 역할 정리
