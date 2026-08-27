import { describe, expect, it } from "vitest";
import {
  backupStamp,
  BACKUP_KEEP_CHOICES,
  DEFAULT_BACKUP_KEEP,
  isBackupDue,
  sanitizeBackupInterval,
  sanitizeBackupKeep,
} from "./schedule";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 27, 9, 0, 0);

const base = { interval: "daily" as const, lastAt: NOW - DAY, now: NOW, supported: true };

describe("isBackupDue", () => {
  it("says no on a platform with nowhere to write", () => {
    // The web has no honest destination, so the answer is no rather than a
    // write that fails later.
    expect(isBackupDue({ ...base, lastAt: 0, supported: false })).toBe(false);
  });

  it("says no when the setting is off, however long it has been", () => {
    expect(isBackupDue({ ...base, interval: "off", lastAt: 0 })).toBe(false);
    expect(isBackupDue({ ...base, interval: "off", lastAt: NOW - 400 * DAY })).toBe(false);
  });

  it("treats never-backed-up as due", () => {
    // Turning the setting on should make a copy now. The gap it closes is the
    // one already open.
    expect(isBackupDue({ ...base, lastAt: 0 })).toBe(true);
    expect(isBackupDue({ ...base, lastAt: NaN })).toBe(true);
  });

  it("waits out the interval, then goes", () => {
    expect(isBackupDue({ ...base, lastAt: NOW - DAY + 1000 })).toBe(false);
    expect(isBackupDue({ ...base, lastAt: NOW - DAY })).toBe(true);

    const weekly = { ...base, interval: "weekly" as const };
    expect(isBackupDue({ ...weekly, lastAt: NOW - 6 * DAY })).toBe(false);
    expect(isBackupDue({ ...weekly, lastAt: NOW - 7 * DAY })).toBe(true);
  });

  it("does not stall when the clock has moved backwards", () => {
    // A timezone change, an NTP correction or a restored machine can leave the
    // last run in the future. Parking backups until the skew passes would be
    // the one time they matter most.
    expect(isBackupDue({ ...base, lastAt: NOW + 30 * DAY })).toBe(true);
  });
});

describe("sanitizers", () => {
  it("keeps the two real intervals and nothing else", () => {
    expect(sanitizeBackupInterval("daily")).toBe("daily");
    expect(sanitizeBackupInterval("weekly")).toBe("weekly");
    for (const value of [undefined, null, "", "hourly", 7, {}]) {
      expect(sanitizeBackupInterval(value)).toBe("off");
    }
  });

  it("defaults an unusable retention and clamps a usable one", () => {
    for (const choice of BACKUP_KEEP_CHOICES) {
      expect(sanitizeBackupKeep(choice)).toBe(choice);
      expect(sanitizeBackupKeep(String(choice))).toBe(choice);
    }
    for (const value of [undefined, null, "", "seven", 0, -4, NaN]) {
      expect(sanitizeBackupKeep(value)).toBe(DEFAULT_BACKUP_KEEP);
    }
    expect(sanitizeBackupKeep(9999)).toBe(365);
    expect(sanitizeBackupKeep(7.4)).toBe(7);
  });
});

describe("backupStamp", () => {
  it("sorts as a string in the order it happened", () => {
    const earlier = backupStamp(new Date(2026, 7, 26, 9, 0, 0));
    const later = backupStamp(new Date(2026, 7, 27, 9, 0, 0));
    expect(earlier < later).toBe(true);
    expect(backupStamp(new Date(2026, 0, 2, 3, 4, 5))).toBe("2026-01-02T03-04-05");
  });

  it("contains nothing Windows refuses in a file name", () => {
    const stamp = backupStamp(new Date(2026, 7, 27, 14, 30, 9));
    expect(stamp).not.toMatch(/[:\\/?*"<>|]/);
  });

  it("reads in the reader's own local time", () => {
    // The person looking for "the one from Tuesday morning" means their
    // Tuesday, so the name is built from local getters rather than an ISO
    // string in UTC.
    const when = new Date(2026, 7, 27, 0, 30, 0);
    expect(backupStamp(when).startsWith("2026-08-27T00-30")).toBe(true);
  });
});
