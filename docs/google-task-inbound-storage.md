# Google Task 인바운드 — 서버 저장 단계

2026-09-09 현재: 021–034와 자동 실행·검토 UI까지 로컬 구현했다. 운영 서버에는
적용하지 않았다. 아래 단계별 설명의 ‘미구현’은 해당 단계 당시 상태이며, 최신 범위는
마지막 033–034 절과 `google-task-rollout.md`를 기준으로 한다.

## 현재 저장 경로 조사

- `src/hooks/usePlannerData.ts`: 활성 계정의 Task는 계정 snapshot RPC로 data/revision을 함께
  읽고 `write_task_revision`으로 저장한다. Task 외 collection과 비활성 계정은 기존 경로를 쓴다.
  웹과 Tauri가 같은 경로를 쓴다. UI Task 본문에는 DB revision을 삽입하지 않는다.
- `src/server/data/repository.ts`: 사용자 JWT/RLS로 읽는다. `src/server/mcp/tools/write/README.md`에
  명시된 대로 MCP 쓰기는 아직 없다. 향후 쓰기가 생기면 같은 revision 계약을 사용한다.
- `src/hooks/useGoogleOutboundSync.ts`: Google 쓰기를 먼저 수행하고 매핑 결과를 앱 저장에 반영한다.
  DB에서 legacy 쓰기를 막는 것만으로 이미 나간 Google 요청을 막을 수는 없다.
  따라서 계정 활성화 전 outbound와 Google token 발급 경로의 호환성 검사도 필요하다.
- `src/lib/googleCalendar.ts`, `src/integrations/google/store.ts`: 연결 메타데이터 쓰기 경로.
  재연결은 검증된 Google 계정 식별자를 사용하도록 후속 전환이 필요하다.

## 021이 제공하는 것

- Task의 DB `revision`과 변경 trigger. Task JSON의 `updatedAt`과 분리한다.
- 계정별 `google_task_sync_accounts.enabled` 기본 비활성. 연결 해제 후에도 유지한다.
  활성 계정에서 REST 직접 insert/update/delete는 클라이언트 및 service role 모두 거절한다.
  DB 소유자의 관리 SQL과 제한된 SECURITY DEFINER RPC만 통과한다.
- 사용자·연결 세대·캘린더·이벤트의 UNIQUE 매핑과 Task별 활성 이벤트 UNIQUE 제약.
  삭제된 작업은 매핑 및 task revision tombstone으로 ID 재사용을 막는다.
- 연결 세대, sync revision, 고정 시간대 저장, 120초 lease와 증가하는 fence.
  갱신은 같은 owner의 `claim_google_task_sync` 호출, 종료는 fence를 검사하는 release RPC다.
- 계정 단위 advisory transaction lock으로 관련 RPC를 직렬화한다. 연결과 작업 revision을
  다시 확인한 후 작업·매핑·처리 기록·최종 커서·pass receipt를 함께 확정한다.
- 응답 유실 후 같은 pass ID/요청을 재전송하면 저장한 결과를 반환한다. 과거 receipt 조회가
  현재 커서를 되감지 않는다. 다른 요청의 pass ID 재사용과 다른 연결 세대는 거절한다.
- 패치 필드는 제목·설명·날짜·시간 여섯 칼럼으로 제한한다. 앱 소유 필드는 덮지 않는다.
  생성은 서버에서 실제 해당 계정의 살아 있는 Inbox인지 검사한 뒤 ID를 발급한다.
- source와 skip/conflict/review 결정을 영속 저장한다. base·googleSyncedAt을 수신 시각으로
  무조건 갱신하지 않는다. 기존 아웃바운드가 이 메타데이터를 해석하게 연결하지 않았다.

## RPC 계약

| RPC | 입력 / 반환 |
|---|---|
| `read_google_task_sync_snapshot` | generation → 현재 scope·Task data/revision·매핑·처리 기록 |
| `read_task_revision_snapshot` | 현재 인증 계정의 모든 Task data/revision 및 삭제 ID. Google 연결과 독립 |
| `write_task_revision` | task ID·expected revision·data·write UUID·예상 사용자 ID → 저장한 data/revision. expected=0 생성, SQL NULL data 삭제 |
| `claim_google_task_sync` | generation·owner UUID → fence·만료·커서·sync revision·시간대 |
| `release_google_task_sync` | generation·owner·fence → 해제 성공 여부 |
| `commit_google_task_inbound` | generation·calendar·sync revision·owner·fence·pass UUID·최종 토큰·plan entries → 변경 Task와 새 커서 |

모든 RPC의 사용자 기준은 `auth.uid()`다. 쓰기의 예상 사용자 ID는 계정 전환을 거절하는
전제조건이며 쓰기 대상 계정을 변경할 수 없다. 같은 write UUID 재시도는 저장된 receipt를
반환하므로 저장/삭제 응답 유실을 새 작업이나 충돌로 오판하지 않는다.
`40001`은 최신 상태 재조회·재계산 대상이고 `55P03`은 다른 실행자가 작업 중이라는 뜻이다.
`42501`의 `TASK_REVISION_REQUIRED`/`TASK_SYNC_NOT_ENABLED`는 재시도로 해결하지 않는다.
요청·Google source는 사용자가 소유한 데이터이며 RPC는 Google 응답 자체를 인증하지 않는다.
호출자는 서버 snapshot에서 생성한 순수 plan과 검증한 Google 응답을 전달해야 한다.

## 활성화 전 남은 작업

1. **클라이언트 전환 구현 완료.** `taskRevisionSession.ts`가 계정별 로컬 checkpoint에
   서버 baseline, 미전송 편집, 진행 중 write UUID, 충돌 양쪽을 보존한다. 로딩 중 편집,
   저장 중 추가 편집, 부분 성공 뒤 재시도, 재시작·응답 유실을 처리한다.
   revision 충돌은 자동 재시도/덮어쓰기를 보류하고 다른 Task·collection 저장은 계속한다.
   새 RPC 실패를 direct upsert로 우회하지 않는다. 미전송 변경이 있으면 완료 시각을 기록하지 않는다.
   같은 저장소의 여러 탭은 계정별 Web Lock으로 checkpoint 작성자를 하나로 제한한다.
   잠긴 다른 탭은 원격 로딩 실패 상태로 안내하며, Web Locks 미지원 환경에서는 활성 계정의
   저장을 차단한다. 로컬 checkpoint 손상이나 용량 부족도 조용히 버리고 진행하지 않는다.
   **남은 검증:** 실제 브라우저·Tauri의 여러 창, 장시간 오프라인, 구버전과의 혼용.
2. **버전 계약 구현 완료, 배포 전.** token/connect는 OAuth 호출 전과 토큰 반환 전에
   서버 전용 RPC로 최소 프로토콜을 확인한다. 정책 확인 실패는 503, 구버전은 426이다.
   현재 클라이언트는 아직 기존 Google 실행기이므로 명시적으로 프로토콜 1을 전송한다.
   base·lease 기반 양방향 실행기까지 완성한 클라이언트만 2를 선언해야 한다.
3. **이관 판정·등록 기반 구현 완료, 운영 이관 전.** `legacyMappingPlan.ts`와 023이 검증된
   기존 ID 등록 및 모호한 항목 보류를 제공한다. 실제 계정 식별 검증/증거 수집은 다음 단계다.
   현재 Task에는 역사적 소유 계정·캘린더 정보가 없으므로 현재 연결이나 ID 존재만으로
   증거를 만들지 않는다. 운영 데이터에 대한 자동 이관은 아직 실행하지 않았다.
4. **Google grant 식별 구현 완료.** 서버가 code 교환으로 받은 토큰을 Google UserInfo에
   전달해 sub를 확인하고 024의 서버 전용 RPC로 저장한다. 캘린더 소유 확인·시간대·
   재연결 매핑 이관은 아직 남아 있다. 현재 connection trigger는
   캘린더/계정 표시값 변경 시 세대를 폐기하는 방어만 하며 계정 동일성 검증을 대신하지 않는다.
5. 인바운드 실행기와 base 기반 아웃바운드, 일반 삭제·복구, 충돌/제외/지원 불가 UI를 연결한다.
   snapshot 매핑의 tombstone은 Task 행이 없어도 planner에 전달할 수 있도록 어댑터에서 처리한다.
6. 일반 PostgreSQL의 별도 연결 두 개로 경합/장애를 검증한 후에만 계정을 활성화한다.
   PGlite 테스트는 SQL·트랜잭션·역할·stale revision을 검증하지만 다중 프로세스 실환경을 대신하지 않는다.

## 검증

`src/server/data/googleTaskInboundDatabase.test.ts`는 PGlite PostgreSQL 엔진에 실제 001·007·017·021
SQL을 적용한다. fixture의 auth schema/역할/권한으로 사용자 격리를 검증한다. pgcrypto 설치 구문만
fixture에서 제거하며 UUID 생성은 엔진 내장 함수를 사용한다. mock SQL 문자열 검사가 아니다.

DB 계약은 23개로 확장했고, 저장 세션·RPC 전송·저장 큐·훅 통합 테스트를 추가했다.
훅 테스트는 활성 계정의 RPC 저장/충돌/재시작 보존과 비활성 계정의 기존 저장을 검증한다.
2026-09-09 프로토콜 계약 추가 후 전체 테스트 3,003개 통과, 기존 1개 건너뜀.
이후 추가한 안내 메시지 회귀 테스트를 포함해 관련 12개 테스트도 통과했다.
TypeScript 검사와 production build 통과.
운영 마이그레이션 실행과 활성화 작업은 수행하지 않았다.

## 프로토콜 전환 배포 순서 (022)

1. 활성 계정이 없는 상태에서 021 다음 022를 적용한다. 이미 활성 계정이 있으면 022는 중단된다.
2. 정책을 확인하는 token/connect 서버와 안내 메시지를 제공하는 클라이언트를 배포한다.
   이전 배포 URL 등 정책을 우회해 토큰을 발급할 수 있는 모든 서버를 먼저 폐기한다.
3. 새 실행기와 이관 검증을 마친 뒤 대상 계정의 minimum_google_protocol을 2로 올린다.
   이 시점부터 헤더 없는 구버전과 현재 프로토콜 1 클라이언트는 새 토큰을 받지 못한다.
4. 전환 후 최소 65분과 기록된 legacy_google_token_valid_until 이후 5분을 모두 기다린다.
   새 서버는 실제 expires_in이 정수 1~3600초인 토큰만 반환하고 만료 시각을 먼저 기록한다.
   이 3600초 제한은 앱 정책이다. Google의 보편적인 최대 수명이라고 가정하지 않는다.
   기존 서버에서 발급한 토큰의 만료 상한이 확인되지 않으면 실제 만료를 확인해 대기 시각을
   늘리거나 기존 OAuth 권한을 철회해야 한다. 진행 중 Google 요청의 종료도 확인한다.
5. 나머지 활성화 전 작업까지 끝난 뒤에만 enabled를 true로 변경한다. DB trigger가 대기
   조건 미충족과 활성 상태에서 프로토콜 1로 내리는 변경을 거부한다.

프로토콜 헤더는 호환성 선언이며 보안 인증 수단이 아니다. 이미 발급된 Google 토큰이나
진행 중 Google 요청을 이 DB가 직접 취소하지 못한다. 연결 해제 API는 버전 차단 대상이 아니다.
Google의 expires_in 및 철회 동작은 [공식 OAuth 문서](https://developers.google.com/identity/protocols/oauth2/web-server)를 따른다.

## 기존 매핑 이관 계약 (023)

`planLegacyMappings`는 서버의 전체 Task ID/revision/googleEventId 목록, 현재 scope,
Google 조회 결과, 별도로 검증한 과거 소유 연결 증거를 받는다. 각 증거는 사용자·연결 세대·
캘린더·Task·이벤트 및 evidenceRef가 모두 일치해야 한다. evidenceRef는 검증 기록의 참조이며
이 함수가 검증을 대신 수행하지 않는다. 이메일·제목·시간·googleSyncedAt은 소유 증거가 아니다.

동일 이벤트의 복수 Task, 소유 불명, 404/조회 실패, 반복 회차, 기존 등록 매핑은 review다.
404로 Task를 삭제하거나 ID를 지우지 않는다. 정확한 원본 이벤트의 cancelled는 ID 등록만
허용하며, 실제 휴지통 이동은 이후 인바운드 판정/커밋이 맡는다.

서버 전용 `import_google_legacy_mappings(user UUID, generation UUID, calendar text,
import UUID, entries JSON)`가 계획의 entries를 받는다. 호출하는 운영 도구가 증거를 검증해야
하며 서비스 키를 브라우저에 전달하지 않는다. 021→022→023 순서로 적용하고, 구버전 토큰
전환 대기를 끝낸 비활성 계정에서만 새 이관을 허용한다. 활성 lease도 없어야 한다.

등록 직전에 현재 Task revision과 해당 이벤트의 **모든** 소유 Task를 재검사한다. 이 짧은
관리 트랜잭션은 tasks 테이블 SHARE 잠금으로 일반 legacy 쓰기의 삽입 경합까지 막으므로
다른 사용자의 Task 쓰기도 잠시 대기할 수 있다. 네트워크 조회는 트랜잭션 전에 끝내고,
대형 이관은 짧은 배치로 실행해야 한다. stale 항목 하나면 전체 배치가 롤백된다.

등록은 Task·revision·커서를 변경하지 않고 base/etag도 추측하지 않는다. 휴지통 상태를
보존한다. 검토 항목은 inbound_records에 `review/ambiguous-mapping`과 legacyReason,
관련 taskIds를 저장한다. import UUID와 같은 요청은 재전송 가능하며, 다른 요청 재사용은
거부한다. 검토 이력 및 증거 참조는 서버 전용 google_legacy_mapping_imports에 남긴다.

**활성화 전 필수 연결:** 향후 실행기는 이관 review 이벤트를 자동 생성/갱신에서 보류하고
검토 해제 흐름을 제공해야 한다. 전체 기존 ID가 등록 또는 review 처리되었는지 운영 점검도
필요하다. 023 자체는 계정을 활성화하거나 증거 수집·검토 UI를 구현하지 않는다.
비활성 계정은 일반 Task 저장이 가능하므로, 이관 후 활성화 사이에 바뀐 ID도 활성화 절차에서
재검사해야 한다. 프로토콜 차단만으로 일반 Task 편집까지 잠겼다고 가정하면 안 된다.

로컬 PGlite 실제 001·007·017·021·022·023 연속 적용 및 이관 판정 테스트 13개 통과.
이 단계 완료 시 전체 테스트 3,017개 통과, 기존 1개 건너뜀. TypeScript 및 production build 통과.

## Google 계정 식별 (024)

OAuth 동의 scope에 openid/email을 추가한다. connect 서버가 직접 교환한 access token으로
고정 HTTPS UserInfo endpoint를 조회하며 redirect를 거부한다. `sub`가 유효한 문자열이어야
계속한다. email은 email_verified=true일 때만 표시용으로 저장하며 동등성 비교에는 쓰지 않는다.
식별 정보는 브라우저 요청 본문이나 기본 캘린더 이메일에서 받지 않는다.
근거: [Google OpenID Connect API](https://developers.google.com/identity/openid-connect/reference).

024는 비공개 google_calendar_tokens에 google_subject·verified_email·identity_verified_at을
추가한다. 신규 grant는 서버 전용 store_verified_google_grant RPC만 저장할 수 있다.
기존 direct service-role insert/update는 trigger로 거절하므로 **024와 새 connect 서버를 함께
배포하고 구 서버를 폐기**해야 한다. 기존 토큰 읽기/갱신과 연결 해제용 삭제는 유지된다.

RPC는 계정 잠금 안에서 비교한다. 같은 sub면 이메일 변경과 무관하게 토큰을 교체한다.
다른 sub, sub가 없는 기존 토큰, 또는 토큰 없이 남은 기존 연결은 409로 거절하며 기존 토큰과
연결을 보존한다. 사용자가 기존 연결을 해제한 뒤 새로 연결하도록 안내한다. 이 경우 카드가
기존 연결을 다시 읽어 Disconnect 버튼을 유지한다. Google 조회/DB 실패는 502로 중단하고
새 access token을 반환하지 않는다. 응답에는 refresh token이나 내부 DB 오류를 넣지 않는다.

이 sub는 **현재 OAuth grant의 계정 식별 증거**일 뿐 과거 이벤트의 캘린더 소유 증거는 아니다.
검증 시각 이전의 Task에 자동 소급 적용하거나 legacyMappingPlan의 evidenceRef를 자동 생성하지
않는다. 특히 disconnect 후 새로 연결했다고 옛 매핑/삭제 기록을 새 계정으로 옮기지 않는다.
현재 프로토콜은 계속 1이며 새 인바운드는 비활성이다.

다음 단계는 서버에서 전용 캘린더 소유권·시간대를 확인해 sub와 calendar ID를 연결 세대에
결합하는 흐름이다. 같은 검증 계정·캘린더의 세대 이관, 다른 계정 격리, 연결 해제/재연결
동시 요청의 원자적 처리와 과거 이관 증거 수집까지 끝나야 프로토콜 2를 활성화할 수 있다.

024까지 실제 SQL 적용 테스트, identity HTTP 실패/형식 검증, connect 응답 및 설정 화면
회귀 테스트를 추가했다. 전체 3,033개 통과, 기존 1개 건너뜀. TypeScript와 production build 통과.
운영 마이그레이션·배포·계정 활성화는 수행하지 않았다.

## 전용 캘린더 검증과 연결 세대 (025)

실제 클라이언트의 연결 저장은 direct upsert 대신 `/api/google/calendar`를 호출한다.
클라이언트가 보내는 후보 calendarId만 받고 사용자 ID·토큰·계정 이메일·시간대는 신뢰하지
않는다. 서버는 인증 사용자와 프로토콜을 확인한 뒤 비공개 snapshot의 refresh token으로
자체 access token을 만들고, UserInfo sub가 저장된 sub와 같은지 재검증한다.

CalendarList get에서 정확한 ID, owner 권한, 비기본·비삭제 캘린더, dataOwner와 현재 검증된
이메일의 일치, 유효한 시간대를 모두 확인한다. owner 역할은 실제 데이터 소유자와 다를 수
있으므로 역할만으로 통과시키지 않는다. dataOwner가 없으면 추측하지 않고 보류한다.
새 후보의 이름은 FocusFlow여야 하며, 이미 같은 sub에 검증된 ID는 이름이 바뀌어도 허용한다.
이름은 후보 선택 조건일 뿐 역사적 이벤트 소유 증거가 아니다.
근거: [Google CalendarList 공식 필드 정의](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList).

025의 read_google_binding_snapshot은 서버 전용이며 자격 증명이 포함되어 클라이언트에
반환하지 않는다. 최종 bind_verified_google_calendar는 계정 잠금 아래 refresh token·sub·
grant_version·예상 연결 세대를 다시 비교한다. grant_version은 토큰 문자열이 같아도 매 저장마다
바뀌므로 검증 중 재연결을 감지한다. 연결 해제로 기존 세대가 사라지거나 lease가 활성 상태면
저장하지 않는다. DB에도 시간대 이름 검사가 있다.

- 신규 연결은 검증한 sub/calendarId/시간대와 새 세대를 저장한다.
- 같은 검증 sub·calendarId·시간대는 기존 세대, 매핑, base, 커서를 유지한다. 이메일 변경만으로
  세대를 폐기하지 않는다. 검증 시각과 표시 이메일만 갱신한다.
- 다른 검증 계정·캘린더 또는 시간대 변경은 자동 전환하지 않는다.
- 과거 sub가 없는 비활성 연결은 새 세대로 분리하고 커서를 초기화한다. 기존 매핑/기록은
  옛 세대에 그대로 남겨 두며 현재 검증을 과거 소유 증거로 소급하지 않는다. 활성 계정의
  이런 전환은 거절한다.

일반 클라이언트·service role의 직접 연결 insert와 scope 수정은 trigger로 막는다. labels 등
범위 외 메타데이터 수정은 유지한다. 025와 새 calendar endpoint/클라이언트를 함께 배포하고
구 클라이언트 연결 저장 경로를 폐기해야 한다. 운영 적용은 아직 하지 않았다.

남은 작업은 disconnect 후 동일 계정·캘린더의 역사적 세대 이관, 검토 UI와 신규 실행기 연결이다.
025는 현재 연결의 검증 증거를 제공하며 과거 이벤트 이관 증거를 자동 생성하지 않는다.
캘린더 생성·후보 조회는 아직 기존 클라이언트 흐름이며, 실패 시 생긴 빈 캘린더를 자동 삭제하지
않는다. Google 권한의 사후 변경은 다음 검증/API 호출에서 처리해야 한다.

025까지 실제 SQL 적용, 서버 검증/인증 경로와 클라이언트 전송 회귀 테스트를 추가했다.
전체 테스트 3,055개 통과, 기존 1개 건너뜀. TypeScript와 production build 통과.

## 같은 계정·캘린더 재연결 이관 (026)

연결 삭제 시 서버가 검증했던 sub·calendarId·고정 시간대·세대·검증 시각만 비공개
google_verified_connection_history에 보존한다. 계정/캘린더별 마지막 검증 세대를 기록하며,
미검증 연결은 보존하지 않는다. 기록에 토큰은 없다. 사용자 삭제 시 함께 제거한다.

재연결은 새 토큰의 sub와 Google의 현재 소유·시간대 검증을 다시 거친다. 기존 연결이 없는
상태에서 과거 sub/calendarId가 정확히 일치하면 025 검증과 같은 트랜잭션으로 새 세대를
만들고 매핑·base·etag·source·처리/검토/제외 기록을 복사한다. 옛 세대는 보존한다.
Task 본문과 revision은 수정하지 않고, 연결이 끊긴 동안 사라진 Task는 deleted 매핑으로
복사한다. 기존 deleted 표식은 계속 유지한다. 새 커서·sync revision은 초기 상태이며
옛 pass receipt·lease는 재사용하지 않는다. 같은 새 세대에 재호출해도 다시 복사하지 않는다.

다른 sub 또는 다른 calendarId에는 과거 기록을 적용하지 않는다. 같은 ID라도 과거 고정
시간대와 다르면 새 연결을 만들지 않고 보류한다. 과거 검증된 캘린더 ID는 이름 변경 후에도
서버 검증을 통과할 수 있다. 다만 클라이언트의 기존 이름 기반 후보 선택은 아직 남아 있어,
연결 해제 후 이름이 바뀐 캘린더를 자동으로 찾아 선택하는 UI는 후속 작업이다.

disconnect 서버는 버전 포함 snapshot을 읽고 Google 철회 후 disconnect_google_calendar를
호출한다. RPC가 grant_version·generation을 다시 검사하고, 이력 보존·연결·토큰·sources 삭제를
원자적으로 수행한다. 중간 실패면 모두 롤백하며, 새 grant/연결로 바뀌었으면 409를 반환하고
새 연결을 삭제하지 않는다. 정책 활성화 상태, Task와 매핑은 연결 해제로 지우지 않는다.

**남은 동시성 한계:** Google 권한 철회는 DB 트랜잭션 밖에서 실행된다. 철회 중 같은 Google
계정으로 새 OAuth 연결을 만드는 경합은 DB의 버전 검사만으로 새 Google grant에 대한 영향까지
막을 수 없다. 운영 활성화 전 이 외부 철회/재연결 직렬화 또는 복구 흐름 검증이 필요하다.
026은 이 한계가 해결됐다고 주장하지 않는다. 새 disconnect 서버와 026을 함께 배포해야 하며
구 서버의 세 번 직접 삭제 경로는 폐기한다. 운영 적용과 활성화는 아직 하지 않았다.

026까지 실제 SQL 연속 적용과 재연결 격리·삭제 표식·시간대·오래된 해제 요청·중간 실패
롤백 테스트를 추가했다. 전체 테스트 3,068개 통과, 기존 1개 건너뜀. TypeScript 및 build 통과.

## OAuth 연결·철회 직렬화와 복구 (027, 위 026 철회 실패 동작을 대체)

connect와 disconnect 서버는 외부 OAuth 변경 요청 전에 027의 영속 작업권을 얻는다.
같은 Google 계정이 여러 FocusFlow 사용자에게 연결될 수 있고 새 code의 sub는 교환 전에
알 수 없으므로 **이 잠금은 서비스 전체의 연결·철회 요청을 하나씩 처리**한다. 일반 Task 저장은
이 잠금 대상이 아니다. 성능 비용은 의도적이며 운영 부하 검증이 필요하다.

다른 작업이 running이면 409, uncertain이면 503을 반환하고 Google 요청을 시작하지 않는다.
work의 Google 요청이 끝나고 DB 저장까지 끝나야 completed로 전환한다. code 교환의 명시적
4xx 거절은 완료로 처리하지만 네트워크/서버 실패처럼 결과가 불명확하면 uncertain으로 남긴다.
시각이나 TTL만으로 다른 실행자가 작업권을 가져갈 수 없다. 프로세스가 죽어 running으로 남은
경우에도 시간 경과는 외부 작업 종료의 증거가 아니다.

철회 성공 응답 후에도 기존 refresh token을 최대 3회 확인하고, Google이 명시적으로
invalid_grant를 반환해야 반영 확인으로 처리한다. 200 응답 뒤 철회 반영이 지연될 수 있다는
[Google 문서](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)를 반영했다.
철회 실패/응답 유실/반영 미확인은 자동 재철회하지 않고 연결·토큰을 보존하며 복구 대기로 둔다.
위 026의 revoked:false와 성공한 로컬 해제를 함께 반환하는 동작은 이 정책으로 대체한다.

DB begin/finish 응답 유실은 서버가 만든 동일 operation UUID로 한 번 재확인한다. Google
외부 변경 요청은 반복하지 않는다. 완료 receipt도 멱등이다. 요청 성공 응답은 완료 기록 확인
뒤에만 전송한다. 결과 불명확한 작업 때문에 서비스 전체의 신규 연결·해제가 보류될 수 있다는
가용성 비용을 운영자는 알고 배포해야 한다. 아직 배포하거나 계정을 활성화하지 않았다.

### 운영 복구 절차

1. DB 관리자가 google_oauth_operations에서 running/uncertain 작업 ID와 시작 시각을 찾는다.
   토큰은 이 테이블에 저장하지 않는다. 브라우저와 service role은 테이블을 직접 읽거나
   복구 RPC를 호출할 수 없다.
2. 해당 서버 요청이 종료되었고 재개될 수 없음을 확인한다. 필요한 경우 이전 배포를 중단한다.
   Google 측 철회 결과/기존 grant 거절 등 외부 처리 결과를 확인한다. 확인할 수 없으면
   잠금을 유지하며, 시간 경과만으로 복구하지 않는다.
3. DB 소유자가 recover_google_oauth_operation(operation UUID, 검증 기록 참조)를 호출한다.
   기록은 비어 있을 수 없고 완료된 작업을 다시 복구할 수 없다. 이 RPC는 Google 요청을
   재실행하지 않으며 기존 연결을 삭제하지도 않는다.
4. 실제 연결/토큰 상태를 재조회한 뒤 필요한 연결 또는 해제 작업을 새로 시작한다.

이 장치는 이 서버의 code 교환·철회 요청을 직렬화한다. 이미 열려 있는 Google 동의 화면,
Google 계정 설정에서의 수동 철회, 다른 앱/구 배포의 호출까지 통제하지는 않는다. 기존에
배포한 모든 connect/disconnect 우회 경로를 폐기하고 새 endpoint와 027을 함께 배포해야 한다.
Google API의 401 처리와 실제 다중 프로세스·부하·장애 복구 검증은 활성화 전 계속 필요하다.

027 실제 SQL 권한·전역 직렬화·영속 잠금·복구 증거 및 HTTP 응답 유실 테스트를 추가했다.
전체 테스트 3,080개 통과, 기존 1개 건너뜀. TypeScript 및 production build 통과.

## 인바운드 실행기와 이관 보류 (028)

`googleTaskInboundExecutor.ts`는 실제 서버 lease/snapshot/commit/release RPC를 호출하는
실행기다. `googleTaskInboundSnapshot.ts`가 서버 userId·세대·캘린더·revision·시간대와 매핑
중복/누락을 검증한다. 028 snapshot은 검증된 캘린더와 살아 있는 유일한 Inbox도 요구한다.
Task의 과거 googleEventId를 검증된 매핑으로 간주하지 않고 미이관 ID는 review로 보류한다.
삭제 매핑은 Task 행이 없어도 전달하며, base 필드가 불완전하면 추측하지 않는다.

전체/증분 조회 모두 showDeleted=true, singleEvents=false를 유지한다. 페이지마다 실행권을
갱신하고 fence가 바뀌면 중단한다. 최대 40페이지, 페이지 루프/불완전 응답/최종 토큰 누락은
실패로 처리한다. 410은 수집 중 데이터를 버리고 한 번 전체 조회를 다시 하지만, 서버 Task·
매핑·base·기존 커서는 그대로 둔다. 전체 조회에 없는 이벤트를 삭제로 해석하지 않는다.
근거: [Google 증분 동기화 문서](https://developers.google.com/workspace/calendar/api/guides/sync).

계획을 확정한 후 전체 source/결정/expected revision·pass UUID·커서 요청을 로컬 journal에
먼저 보존하고 단일 커밋 RPC를 호출한다. journal 저장 실패면 커밋하지 않는다. 응답 유실 후
재시작하면 새 조회/새 pass 대신 같은 요청을 먼저 재전송한다. DB receipt가 확인된 경우에만
journal을 지운다. 서버가 명시적으로 stale 요청을 거절해도 이 실행기는 기록을 자동 폐기하지
않으며, 향후 coordinator가 사용자 상태를 재조회하고 복구 여부를 판단해야 한다.

028은 기존 review 결정과 미매핑 excluded 결정을 자동 패스가 덮어쓰는 것도 DB에서 막는다.
실행기는 해당 결정/legacyReason을 그대로 보내고 최신 원문만 갱신한다. 과거 pass receipt는
나중에 review 상태가 바뀌어도 재확인할 수 있다. 검토 해제는 앞으로 추가할 명시적 RPC의
영역이다. 일반 커밋으로 우회해 create/update할 수 없다.

`googleTaskInboundTransport.ts`는 생성 시 user JWT를 고정하고 localStorage/Web Lock으로
계정·세대별 journal을 관리한다. 매 네트워크 단계 전에 현재 계정도 확인한다. 새 로그인 토큰을
따라가며 다른 계정에 기존 요청을 보내지 않는다. 저장한 journal에는 Google/Supabase 토큰이
없지만 이벤트 원문이 있으므로 사용자 동기화 데이터와 같은 방식으로 보호해야 한다.

**현재 연결 범위:** 실행기→실제 RPC→DB 저장은 통합 테스트 완료다. 자동 실행 훅에는 아직
등록하지 않았다. base 기반 아웃바운드와 검토 해결 coordinator가 완성되기 전 기존 양방향
경로와 함께 돌리지 않으며, 프로토콜 1과 계정 비활성 기본값을 유지한다. coordinator는 로컬
미전송 Task 처리 및 커밋 후 revision snapshot 병합을 연결해야 한다. 결과 tasks를 일반
직접 upsert 경로로 되돌려 쓰면 안 된다. 운영 마이그레이션 적용은 아직 하지 않았다.

028까지 실제 SQL 연속 적용 및 실행기 통합/전송 회귀 테스트를 추가했다. 전체 테스트
3,095개 통과, 기존 1개 건너뜀. TypeScript와 production build 통과.

## base 기반 아웃바운드·충돌 선택 판정 (11차)

`taskOutboundPlan.ts`는 검증된 매핑의 활성 단일 이벤트를 대상으로 순수 계획을 만든다.
현재 Google 원문과 Task가 같으면 acknowledge, Google만 달라졌으면 inbound-required,
Google이 base 그대로이고 Task만 달라졌으면 PATCH, 양쪽이 다르게 바뀌었거나 base가
없으면 conflict다. updated/updatedAt은 읽지 않는다. 기존 review/conflict/excluded 보류는
자동 쓰기보다 우선한다. 조회 실패·404에 해당하는 원문 없음은 삭제나 재생성으로 바꾸지 않는다.

PATCH 계획에는 방금 조회한 정확한 etag와 서버 scope/Task revision을 담는다. 실행기는
If-Match로 보내야 하며 412는 재조회·재판정 대상이다. 조건 없이 덮어쓰는 재시도는 금지한다.
근거: [Google 리소스 버전 문서](https://developers.google.com/workspace/calendar/api/guides/version-resources).
HTTP 성공이나 etag 변경만으로 base를 갱신하지 않는다. `inspectTaskOutboundResult`는
반환된 원본 ID·상태·etag·실제 공유 내용을 검사하며 원하는 내용과 다르면 재확인을 요구한다.
응답 유실 뒤 GET도 같은 검사를 쓰되 서버에 예약된 작업과 대조해야 한다.

공유 PATCH는 summary/description/start/end만 포함한다. 빈 설명도 전송하며 일정 형태가
바뀔 때 반대 형태의 date/dateTime/timeZone을 null로 제거한다. 종일 종료일은 다음 날로
변환하고, 시간 일정은 연결 시간대에서 유일한 시각을 찾아 명시적 UTC instant로 전송한다.
잘못된 날짜, 미완성 시간, 역전 구간, 여러 날에 걸친 시간 일정, DST gap/fold는 보정 없이
보류한다. 반복 원본 쓰기는 아직 보류하고 반복 회차는 쓰기 대상으로 삼지 않는다.

충돌 선택에는 사용자가 본 local/remote 내용과 user·generation·calendar·syncRevision,
Task ID/revision, event ID/etag, 검토 기록 revision을 모두 담는다. 최신 관측과 하나라도
다르면 stale-selection으로 다시 확인한다. Google 선택은 공유 필드 적용 의도를, 앱 선택은
정확한 etag의 PATCH 의도를 만든다. 선택 내용은 복사해 이후 UI 수정과 분리하며 양쪽 내용을
감사 기록에 남길 수 있게 유지한다. 중복 매핑·휴지통 복원 등의 review는 이 충돌 선택으로
해제할 수 없다. 별도의 명시적 결정 및 서버 검증이 필요하다.

**구현 경계:** 이번 단계는 순수 판정과 fixture 검증이다. 선택 결과는 쓰기 권한이나 DB
receipt가 아니다. 운영 실행기에 연결하지 않았다. 다음 단계에서 서버가 scope·revision·
lease/fence·검토 기록을 원자적으로 검사하고 영속 작업 ID로 예약해야 한다. 원격 결과가
불명확하면 새 작성자가 먼저 재확인하고, 이미 진행 중인 Google 요청은 lease 만료만으로
끝났다고 간주하면 안 된다. 확정 RPC는 예약한 공유 내용만 base로 기록하고 진행 중 생긴
새 Task 편집을 보존해야 한다. Google 선택의 Task 적용과 검토 해제도 단일 트랜잭션으로
처리해야 한다. 이 RPC, 신규 이벤트 생성/삭제, 검토 화면, coordinator는 아직 미구현이다.
028의 검토 보존 게이트와 프로토콜 1, 계정 비활성 기본값을 유지한다.

새 판정·일정·충돌 선택·응답 검증 테스트 53개를 추가했다. 전체 테스트 3,148개 통과,
기존 1개 건너뜀. TypeScript와 production build 통과.

## 서버 쓰기 예약·충돌 선택 (029)

`reserve_google_task_outbound`는 인증된 계정의 연결 세대/캘린더/syncRevision, lease/fence,
활성 매핑, Task revision, 검토 revision과 원문 및 표시된 양쪽 내용을 검사한다. UUID별
동일 요청은 저장된 상태/결과를 반환한다. 자동 선택은 keep-local 기록과 base가 필요하며
conflict/review를 우회하지 못한다. app 선택은 서버가 계산한 Task 공유 내용을 예약한다.
google 선택은 저장된 conflict 관측에 대한 명시적 선택으로, Task 공유 필드/base/검토 해제/
syncRevision/양쪽 내용 receipt를 원자적으로 저장한다. SQL이 Google을 직접 조회하지는
않으므로 coordinator는 최신 인바운드 관측과 로컬 미전송 편집을 먼저 반영해야 한다.

계정당 pending 작업은 하나다. reserved 상태만 사용자가 취소할 수 있다. 서버 전용
begin RPC는 최초 호출만 전송권을 주고, 예약 이후 Task가 바뀌었다면 전송 전에 중단한다.
lease 만료는 running/uncertain 작업을 해제하지 않는다. pending 동안 새 인바운드 커밋과
연결 세대 변경/해제를 차단한다. 과거 인바운드 receipt 조회는 허용한다. 027 전역 잠금으로
OAuth code 교환/철회도 함께 막으므로 미완료 쓰기는 서비스 전체의 신규 연결/해제를
지연시킬 수 있다. 이 가용성 비용은 운영 검증 대상이다.

서버 `taskOutbound.ts`는 저장된 grant로 access token을 발급받고 sub와 연결 scope를
재검증한다. 실제 GET의 ID/etag/공유 내용/원본 상태가 예약 관측과 같아야 If-Match PATCH를
한 번 보낸다. 412는 aborted로 끝내고 base/검토를 보존한다. 네트워크/서버 오류와 불완전
성공 응답은 uncertain이다. 결과 DB 응답 유실만 같은 요청으로 재확인한다.

서버 전용 finish RPC는 dispatch ID, 원본 ID, 변경된 etag, 예약된 공유 내용, 검토 revision을
검사한다. Google에 적용된 예약 내용만 base로 기록하고 Task 행은 수정하지 않는다.
전송 중의 새 편집·휴지통 이동·영구 삭제와 매핑 상태가 보존된다. 검토 CAS 실패 시 base도
롤백한다. cursor는 유지하고 syncRevision을 증가시켜 이전 인바운드 계획을 무효화한다.

재실행은 running/uncertain 작업에 PATCH를 보내지 않고 서버 기록과 GET으로 재확인한다.
Google 내용이 예약 내용과 같고 etag가 이전과 다르면 이전 If-Match 요청이 새 버전에
쓸 수 없으므로 긍정적 결과를 확정한다. 내용 불일치/404/401/조회 실패는 pending을 유지한다.
시간 경과만으로 결과를 추정하지 않는다. 이 조건으로 해결되지 않는 작업의 관리자 복구
도구는 아직 없다.

`POST /api/google/task-write`는 인증된 userId와 예약 UUID만 사용한다. 클라이언트의 Google
토큰/Task 내용/다른 userId를 실행에 쓰지 않는다. 프로토콜 2가 필요하며 실제 예약은 활성
계정만 만들 수 있다. completed/aborted는 200, pending은 202이며 내부 오류는 노출하지 않는다.

실제 SQL과 모의 Google HTTP로 통합 검증했다. 실제 Google 계정에 전송하거나 운영 배포/
마이그레이션을 적용하지 않았다. 검토 화면, 로컬 outbox와 연결한 coordinator, 중복 매핑/
복원/제외 해제, 신규 이벤트 생성·삭제는 남아 있다. 기존 훅은 프로토콜 1과 비활성 기본값을
유지하며 새 API를 자동 호출하지 않는다.

029 연속 마이그레이션/서버 실행기 통합 테스트 38개와 인증·API·자격 증명 경계 회귀를
추가했다. 최종 전체 테스트 3,201개 통과, 기존 1개 건너뜀. TypeScript와 production build
(10개 서버 함수) 통과. 앞선 장시간 실행의 worker timeout은 재실행에서 재현되지 않았다.

## 자동 실행·검토·생성/삭제·복구 (030–032)

활성 계정은 Task revision 저장을 먼저 비우고 coordinator에서 인바운드, 공유 필드 쓰기,
일반 일정 생성/삭제를 실행한다. 편집 후 debounce, 포커스 복귀, 온라인 복귀, 60초 주기와
수동 새로고침으로 실행한다. 계정 JWT와 연결 세대를 고정하고 Web Lock, 서버 lease/fence,
Task/record revision, 영속 예약 journal을 함께 검사한다. 비활성 계정은 기존 프로토콜 1이다.
인바운드/예약의 명확한 CAS 거절만 journal에서 지워 재계획하며, 응답 불명은 같은 ID로 재확인한다.

설정의 검토 화면에서 충돌 양쪽 내용을 보고 앱/Google을 선택한다. 선택한 원문·revision을
보내고 실행 직전 Google etag를 다시 검사한다. 중복 후보는 별도 Inbox 가져오기/제외,
원격 복원은 앱 복원/휴지통 유지, 제외 항목은 재가져오기를 지원한다. 기존 Task와 병합은
지원하지 않는다. 로컬 Task revision 충돌도 양쪽 선택과 삭제된 ID 대신 새 Task 보존을 제공한다.
동기화 중 입력은 다시 수집하며 Google 삭제가 도착해도 미전송 내용을 휴지통에 보존한다.

새 일반 일정은 서버 UUID로 만든 Google ID와 private operation marker로 생성한다.
POST 응답 유실 후 GET으로 자신의 이벤트임을 확인한다. 생성 후 원격 편집이 있으면
base를 추측하지 않고 매핑과 충돌을 보존한다. 삭제는 휴지통/삭제 표식과 원본 etag를
검사한 If-Match 요청이다. 외부 쓰기는 한 번만 전송하고 불명확한 결과는 조회로 복구한다.
PATCH/DELETE의 이전 etag와 다른 버전이 확인되면 늦은 조건부 요청이 적용될 수 없으므로
superseded로 종료하고 다음 인바운드에서 재판정한다. 같은 etag/조회 실패는 계속 보류한다.
032의 DB 소유자 전용 복구는 외부 요청 종료와 미적용 증거를 감사 기록으로 남겨야 한다.
시간 경과만으로 pending을 해제하지 않는다.

기존 매핑된 반복 master의 공유 필드 수정은 recurrence를 건드리지 않는다. 신규 반복
이벤트 승격, 앱 반복 Task 신규 전송/RRULE 변경, 다른 연결의 Task 선택 이관은 지원하지
않으며 보류 이유를 표시한다. 해결된 비교 사본의 30일 정리 정책은 아직 자동화하지 않았다.
멱등 receipt를 임의로 삭제해 요청 재실행을 허용하면 안 된다.

검증은 실제 마이그레이션을 실행한 PGlite, 모의 Google HTTP, React 저장/검토 테스트와
데스크톱·모바일 브라우저 검사다. 실제 Google 계정, 별도 기기 및 운영 PostgreSQL 검증은
환경 설정 부재로 수행하지 않았다. 활성화 절차와 남은 운영 조건은 rollout 문서를 따른다.

## 반복·선택 복사·비교 사본 정리 (033–034, 현재)

033은 기존 예약/전송권/GET 복구 계약에 recurrence 작업을 추가한다. 서버가 Task의 반복
설정을 캡처하고 실행 직전 Task revision 및 Google etag를 확인한다. 내용 충돌이 없는
원본에 사용자가 명시적으로 선택했을 때만 규칙을 전송하며, 실제 결과의 규칙도 비교한다.
응답이 유실되면 조회로 확인하고, 다른 규칙의 새 etag는 superseded로 끝낸다.
신규 앱 반복 Task도 서버 생성 ID/marker를 사용한다. 지원할 수 없는 규칙은 보류한다.

선택 복사는 기존 연결 이력이 있는 Task만 사용자가 지정한 현재 세대에 새 이벤트로 만든다.
현재 매핑이 있으면 중복 복사를 거절한다. 과거 매핑과 원본 캘린더는 수정하지 않는다.
화면에 대상 캘린더·반복 차이·전체 시리즈 적용 범위를 표시한다.

034는 해결 시각을 기록하고 30일 지난 Google 작업·검토·인바운드 receipt의 비교 사본을
정리한다. 미해결/진행 중 기록, 매핑/base/삭제 표식은 유지한다. 요청/결과 fingerprint로
동일 재시도 및 다른 내용의 ID 재사용 거절을 유지한다. 활성 계정은 snapshot 조회에서
정리하며 pg_cron이 설치돼 있으면 비접속 계정까지 일일 정리 작업을 등록한다. Cron이 없는
운영 환경은 별도 일일 호출을 구성해야 한다. 세부 반환 계약은 rollout 문서를 참고한다.

전체 테스트 3,244개 통과, 기존 1개 건너뜀. 빌드와 모바일 화면 검사도 통과했다.
실제 Google 계정 및 운영 PostgreSQL 배포/검증은 아직 수행하지 않았다.
