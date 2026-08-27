// `AppSettings.timezone` — the one field on the account that describes the
// machine rather than a choice (FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md M1).
//
// Every date this app stores is a bare "YYYY-MM-DD" in local wall time, so a
// reader with no browser attached cannot tell what "today" means. This field is
// the answer, which makes two things matter enough to pin down: a value written
// by another device must survive a load here, and a record that predates the
// field must not come back with an empty one.
import { beforeEach, describe, expect, it, vi } from "vitest";

// usePlannerData reaches for the platform adapter at import time, and the node
// test environment has no window for it to bind to.
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

import { normalizeData } from "./usePlannerData";

beforeEach(() => store.clear());

function timezoneOf(appSettings: unknown) {
  return normalizeData({ appSettings } as never).appSettings.timezone;
}

describe("appSettings.timezone", () => {
  it("keeps what another device wrote, even when this machine disagrees", () => {
    // The whole point of syncing it: the account holds one answer, and the
    // device that last ran the app is the one that gets to give it. A load
    // that overwrote this with the local zone would make the field useless on
    // any machine that is not the one the user is sitting at.
    expect(timezoneOf({ timezone: "America/Denver" })).toBe("America/Denver");
  });

  it("fills one in when the record predates the field", () => {
    // A client written before this field simply has no key. Coming back with
    // "" would make every reader downstream ask what day it is and get no
    // answer, so detection stands in until the refresh effect confirms it.
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(timezoneOf({ theme: "dark" })).toBe(detected);
  });

  it("treats a stored empty string as 'not known yet', not as an answer", () => {
    // "" is what a device that could not detect its own zone writes. Keeping
    // it would strand the account on that device's failure; this machine can
    // answer, so it does.
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(timezoneOf({ timezone: "" })).toBe(detected);
  });

  it("does not accept a non-string", () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(timezoneOf({ timezone: 9 })).toBe(detected);
    expect(timezoneOf({ timezone: null })).toBe(detected);
  });

  it("does not validate the name against a zone database", () => {
    // Deliberate. The IANA list moves, and this app has no need to resolve the
    // zone itself — it stores the string and hands it to whoever does. A name
    // this build has never heard of is far more likely to be a zone added
    // since than a corrupt record, and dropping it would lose the only copy.
    expect(timezoneOf({ timezone: "Mars/Olympus_Mons" })).toBe("Mars/Olympus_Mons");
  });
});
