import { describe, expect, it } from "vitest";
import { canAskForNotifications, canSendTestNotification, notificationHintKey } from "./notificationCopy";
import type { NotificationAccess } from "../platform/types";

const ALL: NotificationAccess[] = ["unasked", "granted", "denied", "unsupported"];

describe("what settings says about notification permission", () => {
  it("says something different for each of the four answers", () => {
    const keys = ALL.map(notificationHintKey);
    expect(new Set(keys).size).toBe(ALL.length);
  });

  it("offers the button only when asking would do something", () => {
    // A second request after a refusal is dropped by the browser, so a button
    // for `denied` would be a control that does nothing.
    expect(canAskForNotifications("unasked")).toBe(true);
    expect(canAskForNotifications("denied")).toBe(false);
    expect(canAskForNotifications("granted")).toBe(false);
    expect(canAskForNotifications("unsupported")).toBe(false);
  });

  it("sends a test only when there is a channel and permission", () => {
    expect(canSendTestNotification("granted")).toBe(true);
    for (const access of ALL.filter((a) => a !== "granted")) {
      expect(canSendTestNotification(access)).toBe(false);
    }
  });

  it("tells a refused user where the permission actually lives", () => {
    // The one state the app cannot fix from inside itself.
    expect(notificationHintKey("denied")).toBe("settings.notif.denied");
  });

  it("does not claim delivery when the platform has no channel", () => {
    expect(notificationHintKey("unsupported")).not.toBe(notificationHintKey("granted"));
  });
});
