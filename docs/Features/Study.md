# Study

## 관련 파일

- `C:\Users\minju\Todolist\src\components\StudyPage.tsx`
- `C:\Users\minju\Todolist\src\data\studySeed.ts`
- `C:\Users\minju\Todolist\src\utils\planner.ts`
- `C:\Users\minju\Todolist\src\types.ts`
- `C:\Users\minju\Todolist\src\hooks\usePlannerData.ts`

## 데이터 모델

`C:\Users\minju\Todolist\src\types.ts`에 Study 관련 타입이 있다.

- `StudyTopic`
- `StudyTopicCategory`
- `ConceptNote`
- `NoteType`
- `NoteDifficulty`
- `StoredReviewStatus`
- `ComputedReviewStatus`
- `ReviewHistoryItem`
- `LeetCodeNoteFields`
- `ResearchNoteFields`
- `EnglishPresentationNoteFields`

## 구현된 기능

- 구현됨: topics / notes / reviews tab
- 구현됨: topic 생성, 수정, archive, delete
- 구현됨: concept note 생성, 수정, 이동, 삭제
- 구현됨: LeetCode, Research, English/Presentation 등 note type별 필드
- 구현됨: `nextReviewDate` 기반 due/upcoming/mastered/not scheduled 계산
- 구현됨: hard/medium/easy/mastered 리뷰 결과에 따라 다음 복습일 계산
- 구현됨: Calendar의 study-review block 클릭 시 해당 note를 StudyPage에서 여는 흐름
- 구현됨: Study seed는 첫 실행 시 기본 데이터로 들어갈 수 있도록 준비되어 있음

## 미구현 또는 개선 필요

- 개선 필요: `StudyPage.tsx`가 modal, note editor, queue, streak 계산까지 한 파일에 많이 모여 있다.
- 개선 필요: Supabase migration에는 `studyTopics`, `conceptNotes` 전용 table이 없다. 현재 원격 동기화 collectionTables에도 Study collection이 빠져 있다.
- 추정: Study 데이터는 localStorage에서는 저장되지만 Supabase 동기화 대상에는 아직 완전히 포함되지 않은 상태로 보인다.
- 추정: note type별 필드가 UI와 타입에 함께 묶여 있어 확장 시 editor 분리가 필요해질 수 있다.

## 리팩토링 후보

- `StudyPage.tsx`에서 TopicList, NoteEditor, ReviewQueue, StudyStats를 분리.
- review interval 정책을 `usePlannerData.ts`가 아니라 별도 study utility로 이동.
- Study collection을 Supabase schema와 save/load collectionTables에 포함할지 결정 필요.

관련 문서: [[Architecture/App_Flow]], [[Code_Map/src_overview]]
