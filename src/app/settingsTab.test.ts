import { describe, expect, it } from "vitest";
import { CALLBACK_ROUTE } from "../domain/calendar/googleSync/connectFlow";
import { DEFAULT_SETTINGS_TAB, SETTINGS_TABS, initialSettingsTab } from "./settingsTab";

const none = { href: null, pendingConnect: null };

describe("initialSettingsTab", () => {
  it("opens on Account when nobody is asking for anything", () => {
    expect(initialSettingsTab(none)).toBe("account");
    expect(initialSettingsTab({ ...none, href: "https://app.example/settings" })).toBe("account");
    expect(DEFAULT_SETTINGS_TAB).toBe("account");
  });

  // The bug: the consent round trip lands on /settings, the card that spends
  // the code is only drawn under Calendar, and Settings opened on Account.
  it("opens on Calendar when a Google callback is in the address", () => {
    const href = `https://app.example/settings#${CALLBACK_ROUTE}?state=abc&code=xyz`;
    expect(initialSettingsTab({ ...none, href })).toBe("calendar");
  });

  it("opens on Calendar for a refusal too, so the card can say so", () => {
    const href = `https://app.example/settings#${CALLBACK_ROUTE}?state=abc&error=access_denied`;
    expect(initialSettingsTab({ ...none, href })).toBe("calendar");
  });

  // The desktop road back carries no fragment — the deep link waits in Rust
  // until the card drains it — so the pending nonce is the only evidence.
  it("opens on Calendar while a connect this client started is unfinished", () => {
    expect(initialSettingsTab({ href: null, pendingConnect: { nonce: "n1", platform: "desktop" } })).toBe("calendar");
  });

  it("ignores a fragment the flow did not start", () => {
    expect(initialSettingsTab({ ...none, href: "https://app.example/settings#something-else?code=1" })).toBe("account");
    expect(initialSettingsTab({ ...none, href: `https://app.example/settings#${CALLBACK_ROUTE}?code=1` })).toBe("account");
  });

  it("lists every tab the screen draws", () => {
    expect([...SETTINGS_TABS]).toEqual([
      "account",
      "appearance",
      "behavior",
      "notifications",
      "calendar",
      "focus",
      "data",
    ]);
  });
});
