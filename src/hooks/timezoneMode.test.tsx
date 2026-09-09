// @vitest-environment jsdom
//
// Whether the device gets to overwrite the account's time zone.
//
// `appSettings.timezone` was a fact about the machine, refreshed on every
// start. That is right until the machine is not where its owner plans — a VPN,
// a laptop imaged in another country, a trip the planner should not slide
// through — and then the refresh is not a correction, it is the bug. So the
// value has a mode beside it now, and the whole of the feature is that
// "manual" survives a start: a chosen zone the next load overwrites is not a
// choice. That is what these pin down.
//
// The "auto" direction is deliberately tested only where it is decidable. On
// mount `connectFocusHost`'s `acquired` handler re-reads the whole store from
// storage and replaces it, and in jsdom there is no `navigator.locks`, so that
// fires SYNCHRONOUSLY and lands on top of the refresh before React commits it.
// That race predates this change and belongs to the focus host, not here. It
// cannot hurt a chosen zone — what it re-reads is the stored value, which for
// a manual account is the choice itself — and the last test below covers the
// way back to automatic, which runs after mount and so is not raced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const store = new Map<string, string>();
vi.mock("../platform", () => ({
  platform: {
    storage: {
      getSync: (key: string) => store.get(key) ?? null,
      setSync: (key: string, value: string) => void store.set(key, value),
      removeSync: (key: string) => void store.delete(key),
    },
  },
}));

vi.mock("../services/supabaseClient", () => ({ isSupabaseConfigured: false, supabase: null }));

import { usePlannerData } from "./usePlannerData";
import { PLANNER_STORAGE_KEY } from "../domain/migrations/persistPlannerData";
import { normalizeData } from "../domain/plannerData/normalize";
import type { AppSettings } from "../types";

const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
/** A zone that is definitely not this runner's, so "did it overwrite?" is answerable. */
const elsewhere = device === "America/Denver" ? "Asia/Seoul" : "America/Denver";

function seed(appSettings: Partial<AppSettings>) {
  store.set(PLANNER_STORAGE_KEY, JSON.stringify({ appSettings }));
}

beforeEach(() => store.clear());
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("the mode", () => {
  it("reads as automatic for an account that predates it", () => {
    // Every account in existence holds no such key. It has to mean "auto" or
    // this change would freeze all of them on whichever device wrote last.
    expect(normalizeData({ appSettings: { theme: "dark" } } as never).appSettings.timezoneMode).toBe("auto");
  });

  it("survives a load, like any other setting", () => {
    expect(
      normalizeData({ appSettings: { timezoneMode: "manual" } } as never).appSettings.timezoneMode,
    ).toBe("manual");
  });

  it("refuses a value that is neither", () => {
    expect(
      normalizeData({ appSettings: { timezoneMode: "device" } } as never).appSettings.timezoneMode,
    ).toBe("auto");
  });
});

describe("the time zone refresh", () => {
  it("leaves a chosen zone alone on a machine that disagrees with it", async () => {
    // The feature, in one assertion. Without the mode this reads back as the
    // runner's own zone within a tick of mount.
    seed({ timezone: elsewhere, timezoneMode: "manual" });
    const { result } = renderHook(() => usePlannerData());
    await waitFor(() => expect(result.current.appSettings.timezoneMode).toBe("manual"));
    expect(result.current.appSettings.timezone).toBe(elsewhere);
  });

  it("still leaves it alone once the mount settles", async () => {
    // The store is replaced more than once during mount — a storage re-read,
    // a focus-host adoption. A choice that only holds for the first frame is
    // not a choice either.
    seed({ timezone: elsewhere, timezoneMode: "manual" });
    const { result } = renderHook(() => usePlannerData());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.appSettings.timezone).toBe(elsewhere);
    expect(result.current.appSettings.timezoneMode).toBe("manual");
  });

  it("follows the device again the moment the mode goes back to auto", async () => {
    seed({ timezone: elsewhere, timezoneMode: "manual" });
    const { result } = renderHook(() => usePlannerData());
    await waitFor(() => expect(result.current.appSettings.timezone).toBe(elsewhere));

    result.current.updateAppSettings({ timezoneMode: "auto" });
    await waitFor(() => expect(result.current.appSettings.timezone).toBe(device));
  });
});
