// When an automatic backup is due, and what the file is called
// (SETTINGS_REVIEW.md 4.6).
//
// Separate from the writing so the decision can be tested without a filesystem.
// The app is local-first and its only recovery was a manual "Export JSON", so
// the point of this is that nobody has to remember.

/** How often copies are kept. `off` is the shipped value — see `DEFAULT_BACKUP`. */
export type BackupInterval = "off" | "daily" | "weekly";

export const BACKUP_INTERVALS: readonly BackupInterval[] = ["off", "daily", "weekly"];

/** How many files survive a prune, newest first. */
export const BACKUP_KEEP_CHOICES: readonly number[] = [3, 7, 14, 30];
export const DEFAULT_BACKUP_KEEP = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_MS: Record<Exclude<BackupInterval, "off">, number> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
};

export function sanitizeBackupInterval(value: unknown): BackupInterval {
  return value === "daily" || value === "weekly" ? value : "off";
}

export function sanitizeBackupKeep(value: unknown): number {
  const keep = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(keep) || keep <= 0) return DEFAULT_BACKUP_KEEP;
  // Clamped rather than rejected: a number outside the list is still an
  // intention about how many copies to hold.
  return Math.min(365, Math.max(1, Math.round(keep)));
}

export interface BackupDueInput {
  interval: BackupInterval;
  /** Epoch ms of the last successful backup on THIS device, or 0 for never. */
  lastAt: number;
  now: number;
  /** False on the web, where there is nowhere honest to write. */
  supported: boolean;
}

export function isBackupDue({ interval, lastAt, now, supported }: BackupDueInput): boolean {
  if (!supported) return false;
  const period = PERIOD_MS[sanitizeBackupInterval(interval) as Exclude<BackupInterval, "off">];
  if (!period) return false;
  // Never backed up counts as due. Turning the setting on should produce a copy
  // now, not one interval from now — the gap it is meant to close is the one
  // already open.
  if (!Number.isFinite(lastAt) || lastAt <= 0) return true;
  // A clock that moved backwards (timezone change, NTP correction, a restored
  // machine) would otherwise park `lastAt` in the future and stop backups for
  // as long as the skew lasts. Treat that as due too.
  if (lastAt > now) return true;
  return now - lastAt >= period;
}

/**
 * The timestamp part of a backup's file name.
 *
 * Local time, not UTC, and sortable: the reader looks for "the one from
 * Tuesday morning", and that is their Tuesday. Colons are not allowed in
 * Windows file names, so the time is separated by hyphens.
 */
export function backupStamp(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}`
  );
}
