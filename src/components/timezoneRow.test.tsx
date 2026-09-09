// @vitest-environment jsdom
//
// The settings row, as the screen assembles it. The decision itself is proved
// in `timezones.test.ts`; what only shows up here is whether the select can
// DISPLAY what the account holds — a value with no matching option silently
// renders as the first one, which would tell a reader on a pinned zone that
// they are on automatic.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { TimezoneRow } from "./SettingsPage";
import { normalizeAppSettings } from "../domain/plannerData/normalize";
import type { AppSettings } from "../types";

afterEach(cleanup);

const device = Intl.DateTimeFormat().resolvedOptions().timeZone;

function renderRow(settings: Partial<AppSettings>) {
  const onUpdate = vi.fn();
  render(
    <I18nProvider lang="en">
      <TimezoneRow settings={normalizeAppSettings(settings)} onUpdate={onUpdate} />
    </I18nProvider>,
  );
  return { onUpdate, select: screen.getByRole("combobox") as HTMLSelectElement };
}

describe("the time zone row", () => {
  it("sits on the automatic option, and names the zone that means", () => {
    const { select } = renderRow({ timezone: device });
    expect(select.value).toBe("auto");
    expect(select.selectedOptions[0].textContent).toContain(device);
  });

  it("shows the pinned zone when the account holds one", () => {
    const { select } = renderRow({ timezone: "America/Denver", timezoneMode: "manual" });
    expect(select.value).toBe("America/Denver");
    expect(select.selectedOptions[0].textContent).toContain("America/Denver");
  });

  it("shows a pinned zone this build has never heard of rather than reading as automatic", () => {
    // `normalizeAppSettings` keeps such a value on purpose. A select with no
    // matching option falls back to its first, which here says "Automatic" —
    // the one thing a settings screen must not get wrong about itself.
    const { select } = renderRow({ timezone: "Mars/Olympus_Mons", timezoneMode: "manual" });
    expect(select.value).toBe("Mars/Olympus_Mons");
  });

  it("pins the zone and the mode together when one is chosen", () => {
    const { onUpdate, select } = renderRow({ timezone: device });
    fireEvent.change(select, { target: { value: "Asia/Seoul" } });
    expect(onUpdate).toHaveBeenCalledWith({ timezoneMode: "manual", timezone: "Asia/Seoul" });
  });

  it("hands the device's zone back when automatic is chosen again", () => {
    const { onUpdate, select } = renderRow({ timezone: "America/Denver", timezoneMode: "manual" });
    fireEvent.change(select, { target: { value: "auto" } });
    expect(onUpdate).toHaveBeenCalledWith({ timezoneMode: "auto", timezone: device });
  });

  it("offers the whole database, not a shortlist someone will be missing from", () => {
    const { select } = renderRow({ timezone: device });
    expect(select.options.length).toBeGreaterThan(20);
  });
});
