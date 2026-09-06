// 레일 동기화 버튼이 무엇을 맞추고, 어떤 얼굴을 하는가
// (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §11 — F1의 확장).
//
// 처음 F1은 "계정"만 뜻했다. 그런데 버튼의 이름은 "지금 동기화"이고, 앱이
// 맞추는 것은 계정만이 아니다 — 외부 캘린더 구독은 설정 › 캘린더의 "전체
// 새로고침"이, 이주할 로컬 데이터는 설정 › 계정의 "로컬 데이터 업로드"가
// 따로 들고 있었다. 이름이 약속한 것보다 버튼이 적게 했다.
//
// 이 파일은 그 확장에서 **판단**만 담는다. 실행은 App.tsx가 한다 — 계정은
// `usePlannerData`, 캘린더는 App의 상태, 백업은 `useAutoBackup`으로 주인이
// 셋이라 한 자리에 모을 수 없지만, "지금 어떤 얼굴이냐"는 값만 보면 되는
// 질문이라 순수 함수로 떼어 테스트한다.

/** 상태를 읽는 데 필요한 것만 — 이 모듈은 ExternalCalendar 전체를 모른다. */
export interface RailSyncCalendar {
  enabled?: boolean;
  syncStatus?: string;
}

export type RailSyncState = "idle" | "syncing" | "failed";

export interface RailSyncInput {
  signedIn: boolean;
  /** `auth.syncStatus` — 로그인하지 않았으면 읽지 않는다. */
  accountStatus: string;
  calendars: readonly RailSyncCalendar[];
}

/**
 * 버튼이 맞출 것이 있는 캘린더만.
 *
 * 꺼둔 구독은 `syncAllExternalCalendars`도 건너뛴다. 여기서 같은 기준을
 * 쓰지 않으면 버튼이 자기가 하지 않을 일의 상태를 그리게 된다.
 */
function active(calendars: readonly RailSyncCalendar[]): RailSyncCalendar[] {
  return calendars.filter((calendar) => calendar.enabled === true);
}

/**
 * 버튼의 상태 — 그릴 것이 없으면 `null`.
 *
 * `null`은 F2 그대로다: 누른 사람에게 침묵으로 답하는 버튼은 없는 버튼보다
 * 나쁘다. 달라진 것은 **무엇이 침묵인가**뿐이다. F2는 "계정이 없으면 할 일이
 * 없다"고 읽었는데, 외부 캘린더는 계정 없이도 로컬에 살아 있고 새로고침할
 * 대상이다. 그래서 로그인하지 않았어도 켜진 구독이 하나 있으면 그린다.
 *
 * 순서는 도는 중 > 실패 > 쉬는 중이다. 도는 동안의 정직한 상태는 "진행 중"이고,
 * 실패는 끝난 뒤에도 그 자리에 남아 있으므로 가려지지 않는다.
 */
export function railSyncState({ signedIn, accountStatus, calendars }: RailSyncInput): RailSyncState | null {
  const watched = active(calendars);
  if (!signedIn && watched.length === 0) return null;

  const accountSyncing = signedIn && accountStatus === "sync.syncing";
  if (accountSyncing || watched.some((calendar) => calendar.syncStatus === "syncing")) return "syncing";

  const accountFailed = signedIn && (accountStatus === "sync.syncFailed" || accountStatus === "sync.retrying");
  if (accountFailed || watched.some((calendar) => calendar.syncStatus === "failed")) return "failed";

  return "idle";
}
