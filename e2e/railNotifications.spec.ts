// The bell in the Rail, and what it opens
// (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §8).
//
// The claims here are the browser's: a popover that positions itself against a
// trigger, focus that comes back to that trigger on Escape, arrow keys moving
// a roving tabindex, and a badge that clears because the surface mounted.
// jsdom answers none of those.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

// §2.39: below 768 the Rail is `display: none` — a column of icons would eat a
// sixth of a phone, and the legacy hamburger and the Tasks overlay sidebar
// already reach every destination. Everything in this file is the Rail's, so
// on that viewport there is no bell to ring and no sync button to draw.
test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "the Rail steps aside on mobile (§2.39)");

const NOTIFICATIONS_KEY = "focusflow.notifications.v1";

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const SEEDED = [
  {
    id: "n-reminder",
    kind: "reminder",
    title: "Reminder",
    body: "Product review starts at 1:00 PM",
    at: minutesAgo(5),
    readAt: "",
    targetId: "t-review",
  },
  {
    id: "n-focus",
    kind: "focusCompleted",
    title: "Focus finished",
    body: "25 min on Marketing plan",
    at: minutesAgo(90),
    readAt: "",
  },
  {
    id: "n-sync",
    kind: "syncFailed",
    title: "Sync failed",
    body: "Your changes are saved on this device.",
    at: minutesAgo(240),
    readAt: "",
  },
];

async function openWithNotifications(page: Page, notifications: unknown[] = SEEDED): Promise<void> {
  // Seeded ONCE, the way `openApp` seeds the account: an init script runs
  // before every document, so writing unconditionally would restore the unread
  // state on every reload — and the reload is exactly what one of these tests
  // is asking about.
  await page.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key as string)) {
        window.localStorage.setItem(key as string, value as string);
      }
    },
    [NOTIFICATIONS_KEY, JSON.stringify(notifications)] as const,
  );
  await openApp(page);
}

function bell(page: Page) {
  return page.locator(".rail-bell");
}

test.describe("the bell", () => {
  test("carries the unread count, in the badge and in its name", async ({ page }) => {
    await openWithNotifications(page);
    await expect(bell(page).locator(".rail-badge")).toHaveText("3");
    // §6: the badge is a picture; the number has to be in the name too.
    await expect(bell(page)).toHaveAccessibleName(/3 unread/);
  });

  test("opens a panel and clears the badge — opening is the read", async ({ page }) => {
    await openWithNotifications(page);
    await bell(page).click();

    await expect(page.locator(".ntf-panel")).toBeVisible();
    await expect(page.locator(".ntf-row")).toHaveCount(3);
    // §3.3: the whole list at once, so the badge goes with the first opening.
    await expect(bell(page).locator(".rail-badge")).toHaveCount(0);
  });

  test("stays cleared after a reload, because the read was written down", async ({ page }) => {
    await openWithNotifications(page);
    await bell(page).click();
    await expect(page.locator(".ntf-panel")).toBeVisible();

    await page.reload();
    await expect(bell(page)).toBeVisible();
    await expect(bell(page).locator(".rail-badge")).toHaveCount(0);
  });

  test("closes on Escape and hands focus back", async ({ page }) => {
    await openWithNotifications(page);
    await bell(page).click();
    await expect(page.locator(".ntf-panel")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".ntf-panel")).toHaveCount(0);
    await expect(bell(page)).toBeFocused();
  });

  test("says nothing is there rather than drawing an empty list", async ({ page }) => {
    await openWithNotifications(page, []);
    await expect(bell(page).locator(".rail-badge")).toHaveCount(0);
    await bell(page).click();
    await expect(page.locator(".ntf-empty")).toBeVisible();
    await expect(page.locator(".ntf-row")).toHaveCount(0);
  });
});

test.describe("the two tabs", () => {
  test("move with the arrow keys, one in the tab order at a time", async ({ page }) => {
    await openWithNotifications(page);
    await bell(page).click();

    const notifications = page.getByRole("tab", { name: "Notifications" });
    const activities = page.getByRole("tab", { name: "Activities" });
    await expect(notifications).toHaveAttribute("aria-selected", "true");
    // Roving tabindex: the unselected tab is not a stop on the way through.
    await expect(activities).toHaveAttribute("tabindex", "-1");

    await notifications.focus();
    await page.keyboard.press("ArrowRight");
    await expect(activities).toHaveAttribute("aria-selected", "true");
    await expect(notifications).toHaveAttribute("tabindex", "-1");

    // And wraps, so a two-tab list never traps the focus at an end.
    await page.keyboard.press("ArrowRight");
    await expect(notifications).toHaveAttribute("aria-selected", "true");
  });

  test("the activities tab is derived, so it fills without anything being recorded", async ({ page }) => {
    await openWithNotifications(page, []);
    // A task with nothing but its own timestamps — no notification was ever
    // written for it, and the feed still has something to say (§4.2).
    await page.evaluate(
      ([key, now]) => {
        const store = JSON.parse(window.localStorage.getItem(key as string) ?? "{}");
        store.tasks = [
          {
            id: "t-review",
            title: "Product review",
            description: "",
            status: "todo",
            priority: "none",
            dueDate: "",
            startDate: "",
            startTime: "",
            endTime: "",
            projectId: "",
            categoryId: "",
            parentTaskId: "",
            tags: [],
            notes: "",
            estimatedMinutes: 0,
            actualSeconds: 0,
            activeSessionId: "",
            lastFocusedAt: "",
            isSomeday: false,
            waitingReason: "",
            waitingFollowUpDate: "",
            blockedByTaskId: "",
            repeatType: "none",
            order: 0,
            completedAt: "",
            createdAt: now as string,
            updatedAt: now as string,
            deletedAt: "",
          },
        ];
        window.localStorage.setItem(key as string, JSON.stringify(store));
      },
      [STORAGE_KEY, new Date().toISOString()] as const,
    );
    await page.reload();

    await bell(page).click();
    await page.getByRole("tab", { name: "Activities" }).click();
    await expect(page.locator(".ntf-row").first()).toContainText("Product review");
  });
});

test.describe("the sync button", () => {
  test("is not drawn without an account to sync to", async ({ page }) => {
    await openWithNotifications(page);
    // F2: a sync control that answers a press with silence is worse than an
    // absent one, and an unlabelled disabled icon cannot explain itself.
    await expect(page.locator(".rail-sync")).toHaveCount(0);
    // The bell is not conditional — it has something to show either way.
    await expect(bell(page)).toBeVisible();
  });
});

const CALENDARS_KEY = "focusflow.externalCalendars.v1";
const ICS_PATH = "/fixtures/rail-sync.ics";
const ICS_BODY = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:rail-sync-1",
  "DTSTART:20260907T090000Z",
  "DTEND:20260907T100000Z",
  "SUMMARY:Refreshed by the rail",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

/**
 * One enabled ICS subscription, freshly synced.
 *
 * `lastSyncedAt` is now on purpose: `shouldSyncExternalCalendar` only fires the
 * automatic passes after 30 minutes, so a fetch seen after this returns is the
 * BUTTON's, not the mount's. Without that the test would pass with the button
 * disconnected.
 */
async function openWithSubscription(page: Page): Promise<{ fetched: () => number }> {
  let fetched = 0;
  await page.route(`**${ICS_PATH}`, async (route) => {
    fetched += 1;
    await route.fulfill({ status: 200, contentType: "text/calendar", body: ICS_BODY });
  });
  await page.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key as string)) {
        window.localStorage.setItem(key as string, value as string);
      }
    },
    [
      CALENDARS_KEY,
      JSON.stringify({
        calendars: [
          {
            id: "cal-rail",
            name: "Team",
            icsUrl: ICS_PATH,
            color: "#0066cc",
            visible: true,
            enabled: true,
            syncStatus: "success",
            eventCount: 1,
            lastSyncedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        events: [],
      }),
    ] as const,
  );
  await openApp(page);
  return { fetched: () => fetched };
}

test.describe("the sync button reaches what the app syncs (§11)", () => {
  test("is drawn without an account when there is a subscription to refresh", async ({ page }) => {
    // F2 unchanged in principle — no button that answers a press with silence.
    // What changed is what counts as silence: an ICS subscription is
    // refreshable with no account behind it.
    await openWithSubscription(page);
    await expect(page.locator(".rail-sync")).toHaveCount(1);
  });

  test("refreshes the subscription, not only the account", async ({ page }) => {
    const ics = await openWithSubscription(page);
    // The mount's automatic pass is held off by `lastSyncedAt` (see the helper),
    // so this is the floor the press has to clear.
    expect(ics.fetched()).toBe(0);

    await page.locator(".rail-sync").click();
    await expect.poll(() => ics.fetched()).toBeGreaterThan(0);
  });
});
