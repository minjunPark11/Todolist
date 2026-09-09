# Google Task 동기화 운영 전환

2026-09-09. 공유 필드 양방향 동기화, 일반/앱 반복 일정 생성, 삭제, 충돌·중복·복원 검토,
명시적 반복 규칙 적용, 다른 연결 작업의 선택 복사, 30일 비교 사본 정리를 로컬 구현했다.
이 문서는 운영 실행 기록이 아니다. 운영에는 아직 적용하지 않았다.

## 전환 순서

1. 운영 DB 백업과 별도 검증 환경을 준비한다. Supabase 서버 URL/service role, Google OAuth
   client 설정, 클라이언트 Supabase 설정을 기존 배포 비밀 저장소에 설정한다. 비밀값을 문서에 쓰지 않는다.
2. 021–034를 순서대로 검증 환경에 적용하고 새 서버 함수와 클라이언트를 함께 배포한다.
   계정 활성화 기본값은 false로 유지한다. 기존 migration을 이미 적용한 환경이라면 파일을
   재실행하지 말고 적용 이력과 변경된 함수 정의를 비교하여 추가 migration으로 반영한다.
3. 전환 대상의 검증된 Google sub/grant와 전용 비기본 캘린더 소유·권한·시간대를 확인한다.
   활성 Inbox가 정확히 하나인지 확인한다. 023의 기존 매핑 등록은 검증된 증거만 사용한다.
   소유 불명/중복은 검토에 남기며 기존 내용을 base로 추측하지 않는다.
4. 022의 최소 프로토콜을 2로 올리고, 비활성 상태에서 최소 65분 토큰 소진 대기를 완료한다.
   구버전 token/connect/쓰기 차단과 대기 작업/OAuth 작업권 상태를 확인한 뒤 테스트 계정만 활성화한다.
5. 아래 실제 환경 검증을 통과한 계정부터 점진적으로 확대한다. pending 작업이 있으면
   연결 해제/세대 변경으로 우회하지 않고 먼저 복구한다.

## 실제 환경에서 남은 검증

- 일반 일정 생성·수정·삭제와 Google 삭제→휴지통, 복원 및 제외 후 재가져오기.
- 두 기기의 동시 편집, 오프라인 재접속, 탭/계정 전환과 오래된 선택 거절.
- 실제 Google 성공 후 응답 유실, 실행 중 앱 종료, 412/401/410 및 rate limit 복구.
- 운영 PostgreSQL의 실제 동시 연결에서 RLS, lease/fence, 예약 중 OAuth 차단 확인.
- 서머타임과 종일/시간 일정 변환, 반복 master 공유 필드 유지 및 회차 신규 승격 차단.
- 앱 반복 일정 생성과 전체 시리즈 규칙 적용/해제, 다른 연결에서 선택한 작업만 복사되는지 확인.
- Supabase Cron을 사용하는 환경은 `google-task-history-retention` 작업 등록과 실행 결과 확인.
  034 적용 당시 pg_cron이 없으면 앱 snapshot 조회 시 해당 계정만 자동 정리된다. 비접속 계정까지
  매일 정리하려면 Cron 활성화 후 `select public.prune_all_google_task_history()` 일일 작업을 등록한다.

## 불확실한 쓰기 복구

화면의 결과 확인은 GET으로 관측하고 같은 외부 쓰기를 다시 보내지 않는다. reserved만
사용자가 취소할 수 있다. running/uncertain은 lease 만료로 취소하지 않는다.

자동 조회로 결론을 낼 수 없다면 담당자가 외부 실행이 종료되었고 쓰기가 적용되지 않았다는
증거를 확인한 후 DB 소유자 전용 `recover_google_task_no_write`를 사용한다. 증거는 감사
테이블에 남는다. 생성된 이벤트가 실제로 존재하면 미적용으로 처리하지 말고 marker 기반
조회 복구를 사용한다. 서비스 역할/일반 사용자는 관리자 복구를 실행할 수 없다.

## 반복·복사·보관 정책

새 앱 반복 일정은 검증된 주기·간격·요일·종료일로 생성한다. 시간 일정의 종료일은 고정된
연결 시간대에서 그날 끝까지 포함한다. 일반 공유 필드 PATCH에는 반복 규칙을 넣지 않는다.
기존 원본의 규칙은 검토 화면에서 ‘앱 반복 규칙 적용’을 눌렀을 때만 조건부 PATCH한다.
화면에서 전체 시리즈의 규칙 및 예외 날짜 목록이 교체됨을 알린다. 공유 내용 충돌이 있으면
이를 먼저 해결해야 한다. Google의 신규 반복 원본/회차는 기존 정책대로 Task로 승격하지 않는다.

다른 연결의 작업은 제목과 대상 캘린더를 확인해 하나씩 선택 복사한다. 새 이벤트 ID를 쓰고
기존 캘린더와 매핑을 보존한다. 미검증 legacy ID만 있는 작업은 복사 권한의 증거가 아니다.

034는 해결된 기록의 비교 사본을 30일 후 정리한다. 미해결 검토와 진행 중 쓰기는 보존한다.
매핑/base/삭제 표식은 정리하지 않는다. 요청·결과의 SHA-256 fingerprint와 작업 ID를 남겨
동일 요청의 재전송은 기존 완료 상태를 반환하고, 다른 내용으로 ID를 재사용하면 거절한다.
오래된 인바운드 receipt는 cursor/revision과 빈 tasks 배열을 반환하고 앱은 최신 snapshot을
읽는다. 오래된 검토 receipt는 decision 사본 대신 historyCompacted를 반환한다. 일반 Task
revision 저장 receipt는 별도 저장 계약이며 이 Google 비교 기록 정리의 대상이 아니다.

생성 ID/marker의 근거:
[Google events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert),
[extended properties](https://developers.google.com/workspace/calendar/api/guides/extended-properties).
반복 원본·회차와 시간대:
[Recurring events](https://developers.google.com/workspace/calendar/api/guides/recurringevents),
[Events resource](https://developers.google.com/workspace/calendar/api/v3/reference/events).
