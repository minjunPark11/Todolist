import { expect, test, type Page } from "@playwright/test";

/**
 * 외부 캘린더 갱신이 어느 캘린더를 건드리는가.
 *
 * 목록에는 두 종류가 섞여 있다. ICS 구독은 URL 하나를 내려받는 것이고, 구글
 * 캘린더는 API 로 읽어 인바운드 패스가 채운다. 갱신 경로는 앞의 것만을 위한
 * 것인데 — `fetchExternalCalendarEvents` 가 뒤엣것에 예외를 던진다 — 그
 * 사실이 **던지는 자리에만** 있고 부르는 자리에는 없었다.
 *
 * 그래서 구글 캘린더를 가진 계정은 앱을 열 때마다 이렇게 됐다 [실측]:
 *
 *   syncStatus = "failed"
 *   lastError  = "That calendar is not an ICS subscription."
 *   벨         = "Calendar sync failed — … could not be refreshed. …"
 *
 * 그 캘린더는 인바운드 패스로 멀쩡히 동기화되고 있었다. 실패한 것은 그것을
 * ICS 로 읽으려 한 쪽인데 화면은 캘린더가 고장 났다고 말했고, 한 번 `failed`
 * 가 되면 자동 갱신 필터가 그 상태를 걸러내므로 지워지지도 않았다.
 *
 * 단위 검사(`src/lib/externalCalendars.test.ts`)는 자격 판정만 본다. 여기서
 * 보는 것은 그 판정이 **앱이 실제로 쓰는 것**까지 닿았는가다 — 저장소의 행과
 * 벨에 남는 줄.
 */

const APP = "focusflow.appData.v1";
const EXT = "focusflow.externalCalendars.v1";
const NTF = "focusflow.notifications.v1";

const STAMP = "2026-08-18T00:00:00.000Z";

const ACCOUNT = JSON.stringify({
  tasks: [],
  lists: [{ id: "l1", name: "목록", order: 0 }],
  projects: [],
  spaces: [],
  sidebarFolders: [],
  appSettings: { language: "en" },
});

function externalState(calendar: Record<string, unknown>): string {
  return JSON.stringify({ calendars: [{ color: "#4f73ff", visible: true, enabled: true, syncStatus: "idle", eventCount: 3, createdAt: STAMP, updatedAt: STAMP, ...calendar }], events: [] });
}

async function openWith(page: Page, ext: string): Promise<void> {
  await page.addInitScript(
    ([app, account, extKey, extValue]) => {
      window.localStorage.setItem(app as string, account as string);
      window.localStorage.setItem(extKey as string, extValue as string);
    },
    [APP, ACCOUNT, EXT, ext] as const,
  );
  await page.goto("/calendar");
  await expect(page.locator(".gcal-shell, .tm-shell, main").first()).toBeVisible();
}

function calendarRow(page: Page): Promise<Record<string, unknown> | undefined> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").calendars?.[0], EXT);
}

function bell(page: Page): Promise<string[]> {
  return page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? "[]") as { kind: string }[]).map((n) => n.kind), NTF);
}

test.describe("외부 캘린더 갱신", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "저장소에 남는 것을 보는 검사다");

  test("구글 캘린더를 ICS 로 읽으려 하지 않는다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 3);

    await openWith(page, externalState({ id: "google-primary", name: "내 구글 캘린더", source: "google", googleCalendarId: "primary@gmail.com" }));
    // 자동 갱신은 마운트와 캘린더 화면 진입에서 돈다. 둘 다 지나가도록 둔다.
    await page.waitForTimeout(3000);

    const row = await calendarRow(page);
    expect(row?.syncStatus, `실패로 표시됐다 (lastError: ${JSON.stringify(row?.lastError)})`).not.toBe("failed");
    expect(row?.lastError ?? "", "내부 문장이 화면에 올라가면 안 된다").not.toContain("ICS");
    expect(await bell(page), "멀쩡한 캘린더에 대해 실패 알림을 남기면 안 된다").not.toContain("calendarFailed");
  });

  test("자기 점검: 진짜 ICS 구독이 실패하면 그대로 실패로 남는다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);

    // 위 검사는 "아무것도 갱신하지 않는" 구현으로도 통과한다. 반대편을 같이
    // 고정한다 — 읽을 파일이 있는 구독은 여전히 읽으려 하고, 못 읽으면
    // 그렇다고 말해야 한다.
    await page.route("**/holidays.ics*", (route) => route.abort());
    await page.route("**/api/ics**", (route) => route.abort());
    await openWith(page, externalState({ id: "ics-1", name: "공휴일", source: "ics", icsUrl: "https://example.com/holidays.ics" }));
    await page.waitForTimeout(3000);

    const row = await calendarRow(page);
    expect(row?.syncStatus, "읽으려는 시도 자체가 없으면 이 파일의 첫 검사는 아무 뜻도 없다").toBe("failed");
    expect(await bell(page), "배경에서 실패한 것은 벨이 말해야 한다 (§3.2)").toContain("calendarFailed");
  });
});
