# Current Issues

## 실행/빌드

- 확인됨: `git status` 결과 `docs/`가 untracked 상태이다.
- 확인됨: 현재 branch는 `codex/new_design`, remote `origin/codex/new_design`과 up to date.
- 확인됨: `npm.cmd run typecheck` 통과.
- 확인됨: `npm.cmd run dev`는 `http://127.0.0.1:5173/`로 정상 기동.
- 문제: PowerShell에서 `npm run build`는 `npm.ps1` 실행 정책 때문에 실패.
- 문제: `npm.cmd run build`는 Vite build 중 `EPERM: operation not permitted, mkdir 'C:\Users\minju\Todolist\dist\assets'`로 실패.
- 추정: build 실패는 TypeScript 오류가 아니라 `dist` 폴더 권한 또는 파일 잠금 문제일 가능성이 높다.

## 기능/구조 이슈

- 해결됨: `C:\Users\minju\Todolist\src\lib\ai\providers\serverProvider.ts`가 `C:\Users\minju\Todolist\src\lib\ai\gateway.ts` fallback provider list에 연결되었다.
- 해결됨 (2026-07-02): Study collection을 Supabase sync에 포함했다. `supabase/migrations/002_study_tables.sql`로 `study_topics`/`concept_notes` 테이블을 추가했고 `usePlannerData.ts`의 `collectionTables`에 두 collection을 등록했다.
- 개선 필요: `C:\Users\minju\Todolist\src\App.tsx`가 많은 책임을 갖고 있다.
- 개선 필요: Calendar context는 실제 calendar anchor/mode가 아닌 오늘 기준 week snapshot을 사용한다.
- 해결됨 (2026-07-02): hidden/non-MVP pages(`tomorrow`, `next7`, `tasks`, `board`, `matrix`, `dashboard`, `habits`, `focus`)를 `PageId`, `AppPages.tsx`, 전용 컴포넌트, 관련 i18n 키와 함께 삭제했다. habits/focusSessions/taskTemplates 데이터 모델은 유지.

## 중복 구현 후보

- 해결됨 (2026-07-02): Today bucket 계산 중복은 제거했다. `C:\Users\minju\Todolist\src\app\AppPages.tsx`에 있던 미사용 로컬 `getTodayBuckets()` 사본을 삭제했고, 단일 구현은 `C:\Users\minju\Todolist\src\utils\planner.ts`의 export 버전만 남았다 (`TodayPage.tsx`에서 사용).
- 해결됨: Ollama 관련 legacy wrapper `C:\Users\minju\Todolist\src\lib\ollama.ts`는 제거했고, provider 기반 구현으로 단일화했다.
- 추정: 루트의 설계/보고 문서와 `docs` Vault 문서가 동시에 존재해 문서 source of truth 정리가 필요하다.

## 아직 하지 않은 일

- 코드는 수정하지 않았다.
- build 실패 원인은 고치지 않았다.
- 리팩토링은 수행하지 않았다.

관련 문서: [[Dev_Logs/2026-07-02]], [[Architecture/App_Flow]]
