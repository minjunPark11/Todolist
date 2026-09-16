import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * 리마인더가 실제로 지나가는 길들 (design §8, RAIL_SYNC §3.2).
 *
 * 도메인(`reminderQueue`)은 잘 덮여 있다 — 무엇이 언제 걸리는지는 단위
 * 검사가 본다. 덮여 있지 않던 것은 그 답을 받아 **내보내는** 쪽이다:
 * `useReminders` 는 30 초마다 쓸고, OS 에 넘기고, 거절당하면 토스트로
 * 대신 말하고, 어느 쪽이든 벨에 적는다. 그 네 갈래에 검사가 없었다.
 *
 * 재보니 두 군데가 샜다 [실측]:
 *
 *   1. 탭 둘이 **이미 열려 있는 채로** 시각이 도래하면 같은 리마인더가
 *      두 번 울렸다 (탭별 OS 알림 [1,1]). 울린 기록은 저장소에 있지만
 *      각 탭은 그것을 뜰 때 한 번만 읽어 메모리에 들고 있었다.
 *   2. 한 탭이 적은 벨의 줄을 다른 탭의 다음 쓰기가 지웠다. 목록은
 *      장치의 것인데(§3.1) 쓰기는 탭의 메모리 목록을 통째로 썼다.
 *
 * 처음 2 번을 잴 때 `kind: "focus"` 로 표본을 심었는데 그것은 이 빌드가
 * 모르는 종류라 `sanitizeNotifications` 가 버렸다 — 고치기 전과 후가 똑같이
 * "사라졌다"로 나왔다. 표본을 `focusCompleted` 로 바꾸고 나서야 고침이
 * 보였다. 그래서 아래 검사들은 심은 것이 **정말 남아 있는지** 부터 본다.
 */

const KEY = "focusflow.appData.v1";
const NTF = "focusflow.notifications.v1";

/** 가짜 시계의 출발점. 한낮이라 날 넘김과 섞이지 않는다. */
const BASE = new Date("2026-08-18T13:00:00");

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** BASE 로부터 몇 분 뒤에 걸린 절대 리마인더 하나를 가진 계정. */
function seedWithReminder(minutesAhead: number): string {
  const at = new Date(BASE.getTime() + minutesAhead * 60_000);
  const wall = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const stamp = BASE.toISOString();
  return JSON.stringify({
    tasks: [{ id: "t1", title: "울릴 할 일", listId: "l1", status: "todo", order: 0, createdAt: stamp, updatedAt: stamp }],
    lists: [{ id: "l1", name: "목록", order: 0 }],
    projects: [],
    spaces: [],
    sidebarFolders: [],
    reminders: [
      {
        id: "r1",
        taskId: "t1",
        type: "absolute",
        offsetMinutes: null,
        absoluteAt: wall,
        allDayTime: null,
        enabled: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    appSettings: { language: "en" },
  });
}

/**
 * 탭 하나를 연다.
 *
 * 시계는 페이지마다 따로 건다. 탭 둘이 각자의 시계를 갖는 것은 실제와
 * 다르지 않다 — 두 탭의 30 초 주기는 원래 서로 어긋나 있고, 검사에서
 * `runFor` 를 차례로 부르는 것이 바로 그 어긋남이다.
 */
async function openTab(context: BrowserContext, seedJson: string, permission: NotificationPermission): Promise<Page> {
  const page = await context.newPage();
  await page.clock.install({ time: BASE });
  await page.addInitScript(
    ([key, value, granted]) => {
      window.localStorage.setItem(key as string, value as string);
      // `Notification` 을 세는 대역으로 바꾼다.
      //
      // 실제 API 를 쓰지 않는 이유는 이 실행기의 브라우저에 알림이 없기
      // 때문이다: `context.grantPermissions(["notifications"])` 를 주고
      // 나서도 `Notification.permission` 이 `denied` 로 남는다 [실측 —
      // 처음엔 진짜 API 를 감쌌고, "권한이 있는데 안 울린다"로 읽혔다].
      //
      // 그래서 이 검사가 증명하는 것은 "크롬이 알림을 띄운다"가 아니라
      // "앱이 몇 번 넘기려 했는가"다. 중복이 걸리는 자리가 정확히 거기
      // 이므로 이 대역으로 충분하다.
      (window as unknown as { __fired: string[] }).__fired = [];
      const Stub = function (this: unknown, title: string) {
        (window as unknown as { __fired: string[] }).__fired.push(title);
      } as unknown as typeof Notification;
      Stub.requestPermission = () => Promise.resolve(granted as NotificationPermission);
      Object.defineProperty(Stub, "permission", { get: () => granted });
      window.Notification = Stub;
    },
    [KEY, seedJson, permission] as const,
  );
  await page.goto("/today");
  await expect(page.locator(".tm-shell")).toBeVisible();
  return page;
}

function firedCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __fired?: string[] }).__fired?.length ?? 0);
}

function bellTitles(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { title: string }[]).map((n) => n.title) : [];
  }, NTF);
}

/** 시각이 지나도록 시계를 민다. `fastForward` 가 아니라 `runFor` 다 — 앞의
 *  검사(`dayRollover`)에서 `fastForward` 가 타이머를 한꺼번에 터뜨려 없는
 *  동작을 있는 것처럼 보이게 한 적이 있다. */
async function passTheHour(page: Page, minutes: number): Promise<void> {
  await page.clock.runFor(minutes * 60_000);
  await page.waitForTimeout(400);
}

test.describe("리마인더가 지나가는 길", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "알림 권한과 가짜 시계가 필요하다");

  test("탭 하나 · 권한 있음 — 한 번 울리고 벨에 적힌다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 3);

    const page = await openTab(context, seedWithReminder(2), "granted");
    // 이 검사는 아래 두 검사의 바닥이다. 여기가 0 이면 "두 번 울리지
    // 않았다"는 아무 뜻도 없다.
    expect(await firedCount(page), "아직 시각이 아니다").toBe(0);

    await passTheHour(page, 3);
    expect(await firedCount(page), "시각이 지났으면 울려야 한다").toBe(1);
    expect(await bellTitles(page), "울린 것은 적어도 둔다 (§3.2)").toEqual(["울릴 할 일"]);
  });

  test("탭 둘이 열려 있어도 한 번만 울린다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 4);

    const seedJson = seedWithReminder(2);
    const a = await openTab(context, seedJson, "granted");
    const b = await openTab(context, seedJson, "granted");
    // 둘 다 **시각 전에** 열려 있어야 이 검사가 성립한다. 늦게 연 탭은
    // 먼저 연 탭이 남긴 기록을 읽고 뜨므로 중복이 애초에 안 난다.
    expect(await firedCount(a)).toBe(0);
    expect(await firedCount(b)).toBe(0);

    await passTheHour(a, 3);
    await passTheHour(b, 3);

    const total = (await firedCount(a)) + (await firedCount(b));
    expect(total, `한 리마인더에 OS 알림이 ${total} 번 떴다`).toBe(1);
    expect(await bellTitles(a), "벨에도 한 줄만").toEqual(["울릴 할 일"]);
  });

  test("권한이 없으면 토스트가 대신 말하고, 벨에는 그대로 적힌다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);

    const page = await openTab(context, seedWithReminder(2), "denied");
    await passTheHour(page, 3);

    expect(await firedCount(page), "권한 없이 OS 로 넘어가면 안 된다").toBe(0);
    await expect(page.locator(".toast-stack"), "대신 화면이 말해야 한다").toContainText("울릴 할 일");
    expect(await bellTitles(page), "전달에 실패해도 적어는 둔다 — 벨이 있는 이유다").toEqual(["울릴 할 일"]);
  });

  test("이 탭이 적을 때 옆 탭이 적어둔 줄이 사라지지 않는다", async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);

    const page = await openTab(context, seedWithReminder(2), "granted");

    // 이 탭이 뜬 **뒤에** 옆 탭이 한 줄을 적은 상황. `kind` 는 이 빌드가
    // 아는 것이어야 한다 — 모르는 종류는 읽을 때 버려지므로, 그것으로
    // 심으면 고침과 무관하게 언제나 "사라졌다"가 나온다.
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify([
          { id: "n-other", kind: "focusCompleted", title: "옆 탭이 적은 알림", body: "", at: new Date().toISOString(), readAt: "" },
        ]),
      );
    }, NTF);
    expect(await bellTitles(page), "심은 줄이 읽히는지부터 본다").toEqual(["옆 탭이 적은 알림"]);

    await passTheHour(page, 3);

    const titles = await bellTitles(page);
    expect(titles, `이 탭의 쓰기가 옆 탭의 줄을 덮었다 (남은 것: ${JSON.stringify(titles)})`).toContain("옆 탭이 적은 알림");
    expect(titles, "이 탭이 적은 것도 물론 있어야 한다").toContain("울릴 할 일");
  });
});
