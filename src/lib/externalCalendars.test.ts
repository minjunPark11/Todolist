import { describe, expect, it } from "vitest";
import { isIcsSubscription, shouldSyncExternalCalendar } from "./externalCalendars";
import type { ExternalCalendar } from "../types";

/**
 * 외부 캘린더 목록에는 두 종류가 섞여 있고, 갱신 경로는 하나뿐이다.
 *
 * ICS 구독은 URL 하나를 내려받는 것이고, 구글 캘린더는 API 로 읽어 인바운드
 * 패스(`hooks/useGoogleInboundSync.ts`)가 채운다. `fetchExternalCalendarEvents`
 * 는 그 사실을 알고 구글 캘린더에 예외를 던졌는데, **부르는 쪽은 몰랐다.**
 *
 * 그래서 구글 캘린더를 가진 계정은 앱을 열 때마다 이렇게 됐다 [실측 — 앱을
 * 띄우고 저장소를 읽어 확인했다]:
 *
 *   syncStatus = "failed"
 *   lastError  = "That calendar is not an ICS subscription."
 *   벨         = "Calendar sync failed — 내 구글 캘린더 could not be
 *                 refreshed. That calendar is not an ICS subscription."
 *
 * 그 캘린더는 멀쩡히 동기화되고 있었다. 실패한 것은 그것을 ICS 로 읽으려 한
 * 쪽인데 화면은 캘린더가 고장 났다고 말했고, 한 번 `failed` 가 되면 자동 갱신
 * 필터가 그 상태를 걸러내므로 그 거짓말은 지워지지도 않았다.
 *
 * 자격을 `shouldSyncExternalCalendar` 에서 끊는다. 자동 갱신 두 곳과 수동
 * 버튼이 모두 여기를 지나가므로, 여기서 막으면 새어나갈 자리가 없다.
 */

const base = {
  color: "#123456",
  visible: true,
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

const ics: ExternalCalendar = { id: "ics-1", name: "공휴일", source: "ics", icsUrl: "https://example.com/a.ics", ...base };
const google: ExternalCalendar = { id: "google-1", name: "내 구글 캘린더", source: "google", googleCalendarId: "primary", ...base };

describe("ICS 갱신의 자격", () => {
  it("구글 캘린더는 ICS 갱신 대상이 아니다", () => {
    expect(isIcsSubscription(google)).toBe(false);
    expect(
      shouldSyncExternalCalendar(google),
      "대상으로 세면 던지는 곳까지 가고, 그 예외가 실패 표시와 벨 알림이 된다",
    ).toBe(false);
  });

  it("URL 이 없는 구독도 아니다 — 종류만으로는 모자란다", () => {
    // `source` 가 비어 있으면 ICS 로 읽는 것이 이 앱의 기본값이다. 그래도
    // 내려받을 주소가 없으면 읽을 것이 없다.
    const urlless: ExternalCalendar = { id: "x", name: "주소 없음", ...base };
    expect(isIcsSubscription(urlless)).toBe(false);
    expect(shouldSyncExternalCalendar(urlless)).toBe(false);
  });

  it("ICS 구독은 여전히 대상이다 — 그물의 자기 점검", () => {
    // 위 둘이 "전부 false 면 통과"라면 아무것도 갱신하지 않는 구현도 통과한다.
    expect(isIcsSubscription(ics)).toBe(true);
    expect(shouldSyncExternalCalendar(ics), "한 번도 읽은 적 없으면 읽어야 한다").toBe(true);
  });

  it("꺼둔 것과 방금 읽은 것은 건너뛴다 — 원래 규칙은 그대로다", () => {
    expect(shouldSyncExternalCalendar({ ...ics, enabled: false })).toBe(false);
    const justNow = new Date("2026-01-01T00:00:00.000Z");
    expect(
      shouldSyncExternalCalendar({ ...ics, lastSyncedAt: justNow.toISOString() }, justNow.getTime() + 60_000),
    ).toBe(false);
    expect(
      shouldSyncExternalCalendar({ ...ics, lastSyncedAt: justNow.toISOString() }, justNow.getTime() + 60 * 60_000),
      "충분히 오래됐으면 다시 읽는다",
    ).toBe(true);
  });
});
