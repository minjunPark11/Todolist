// @vitest-environment jsdom
//
// The settings row, as the screen assembles it. The decision itself is proved
// in `timezones.test.ts`; what only shows up here is whether the select can
// DISPLAY what the account holds — a value with no matching option silently
// renders as the first one, which would tell a reader on a pinned zone that
// they are on automatic.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { FloatingLayerProvider } from "./floating";
import { TimezoneRow } from "./SettingsPage";
import { normalizeAppSettings } from "../domain/plannerData/normalize";
import type { AppSettings } from "../types";

afterEach(cleanup);

const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
const trigger = () => screen.getByRole("button", { name: /^Time zone:/ });
/** What the closed picker says it is set to. */
const shown = () => trigger().textContent ?? "";
/** Open it and type — the search is the feature, not the scrollbar. */
function search(query: string) {
  fireEvent.click(trigger());
  fireEvent.change(screen.getByRole("combobox"), { target: { value: query } });
  return within(screen.getByRole("listbox")).queryAllByRole("option");
}

function renderRow(settings: Partial<AppSettings>) {
  const onUpdate = vi.fn();
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TimezoneRow settings={normalizeAppSettings(settings)} onUpdate={onUpdate} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onUpdate };
}

describe("the time zone row", () => {
  it("sits on the automatic option, and names the zone that means", () => {
    renderRow({ timezone: device });
    expect(shown()).toContain("Use this device’s time zone");
    expect(shown()).toContain(device);
  });

  it("shows the pinned zone when the account holds one", () => {
    renderRow({ timezone: "America/Denver", timezoneMode: "manual" });
    expect(shown()).toContain("America/Denver");
  });

  it("shows a pinned zone this build has never heard of rather than reading as automatic", () => {
    // `normalizeAppSettings` keeps such a value on purpose. Falling back to
    // the raw value shows what is actually stored; the alternative is a
    // control that quietly claims some other zone.
    renderRow({ timezone: "Mars/Olympus_Mons", timezoneMode: "manual" });
    expect(shown()).toContain("Mars/Olympus_Mons");
    expect(shown()).not.toContain("Automatic");
  });

  it("pins the zone and the mode together when one is chosen", () => {
    const { onUpdate } = renderRow({ timezone: device });
    search("seoul");
    fireEvent.click(screen.getByRole("option", { name: /Asia\/Seoul/ }));
    expect(onUpdate).toHaveBeenCalledWith({ timezoneMode: "manual", timezone: "Asia/Seoul" });
  });

  it("hands the device's zone back when automatic is chosen again", () => {
    const { onUpdate } = renderRow({ timezone: "America/Denver", timezoneMode: "manual" });
    search("this device");
    fireEvent.click(screen.getByRole("option", { name: /Use this device/ }));
    expect(onUpdate).toHaveBeenCalledWith({ timezoneMode: "auto", timezone: device });
  });

  it("shows the saved account zone when this device uses a different zone", () => {
    const saved = device === "Asia/Seoul" ? "Europe/London" : "Asia/Seoul";
    renderRow({ timezone: saved, timezoneMode: "auto" });
    expect(shown()).toContain(saved);
    expect(shown()).not.toContain("Use this device");
  });

  it("offers the whole database, not a shortlist someone will be missing from", () => {
    renderRow({ timezone: device });
    expect(search("").length).toBeGreaterThan(20);
  });
});

describe("typing at the row", () => {
  // The reason this stopped being a native select. Its type-ahead matched from
  // the START of the option text, so every one of these needed the region
  // typed first — and knowing which region a city is filed under is exactly
  // what someone looking for their own city does not know.
  it("finds a city without its region", () => {
    renderRow({ timezone: device });
    expect(search("shanghai").map((option) => option.textContent).join(" ")).toContain("Asia/Shanghai");
  });

  it("finds a city whose name has a space in it", () => {
    renderRow({ timezone: device });
    expect(search("new york").map((option) => option.textContent).join(" ")).toContain("America/New_York");
  });

  it("finds zones by offset", () => {
    renderRow({ timezone: device });
    const matches = search("+9").map((option) => option.textContent).join(" ");
    expect(matches).toContain("UTC+09:00");
    expect(matches).not.toContain("UTC+10:00");
  });

  it("says so rather than going blank when nothing matches", () => {
    // A surface that empties while someone is typing reads as broken.
    renderRow({ timezone: device });
    expect(search("olympus mons")).toEqual([]);
    expect(screen.getByText("No time zone matches that.")).toBeTruthy();
  });

  it("takes the first match on Enter, so a city can be reached without the mouse", () => {
    const { onUpdate } = renderRow({ timezone: device });
    // The automatic option includes the device city; choose a different city
    // so the first match means a manual zone on every test host.
    const city = device === "Asia/Shanghai" ? "Seoul" : "Shanghai";
    search(city);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onUpdate).toHaveBeenCalledWith({ timezoneMode: "manual", timezone: `Asia/${city}` });
  });

  it("moves the cursor with the arrows while the typing stays in the field", () => {
    const { onUpdate } = renderRow({ timezone: device });
    search("asia/s");
    const box = screen.getByRole("combobox");
    const first = box.getAttribute("aria-activedescendant");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-activedescendant")).not.toBe(first);
    expect(document.activeElement).toBe(box);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not report a re-pick of what is already set as a change", () => {
    // The Google card pays for a change by re-reading the whole calendar.
    const { onUpdate } = renderRow({ timezone: "Asia/Seoul", timezoneMode: "manual" });
    search("seoul");
    fireEvent.click(screen.getByRole("option", { name: /Asia\/Seoul/ }));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
