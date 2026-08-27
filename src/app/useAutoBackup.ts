import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "../platform";
import type { BackupFile } from "../platform/types";
import type { PlannerData } from "../types";
import { backupStamp, isBackupDue, sanitizeBackupInterval, sanitizeBackupKeep } from "../domain/backup/schedule";
import type { BackupInterval } from "../domain/backup/schedule";

/**
 * Automatic backups (SETTINGS_REVIEW.md 4.6).
 *
 * The file is byte-for-byte what "Export JSON" produces, which is the whole
 * restore story: an existing Import reads it. Inventing a second format would
 * have meant a second reader to keep correct.
 */

/**
 * When this DEVICE last wrote one.
 *
 * Local and not in `AppSettings`, because syncing it would let one machine's
 * backup satisfy another's schedule — and the copy would then be sitting on the
 * one disk the other machine cannot reach.
 */
const LAST_AT_KEY = "focusflow.backup.lastAt.v1";

/** An hour is fine for a daily or weekly schedule and costs one comparison. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

function readLastAt(): number {
  try {
    const raw = platform.storage.getSync(LAST_AT_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeLastAt(value: number) {
  try {
    platform.storage.setSync(LAST_AT_KEY, String(value));
  } catch {
    // A device that cannot remember when it last ran will simply back up again
    // on the next check. Losing the note is not worth failing the backup over.
  }
}

interface UseAutoBackupInput {
  interval: BackupInterval;
  keep: number;
  exportData: () => PlannerData;
}

export interface AutoBackupState {
  supported: boolean;
  /** Epoch ms of this device's last successful backup, or 0 for never. */
  lastAt: number;
  /** Empty unless the last attempt failed. */
  error: string;
  running: boolean;
  backupNow: () => Promise<BackupFile | null>;
}

export function useAutoBackup({ interval, keep, exportData }: UseAutoBackupInput): AutoBackupState {
  const supported = platform.backups.supported();
  const [lastAt, setLastAt] = useState<number>(() => (supported ? readLastAt() : 0));
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  // The data getter and the settings are read at call time rather than closed
  // over, so the interval callback never writes a stale export or an old
  // retention count.
  const exportRef = useRef(exportData);
  exportRef.current = exportData;
  const settingsRef = useRef({ interval, keep });
  settingsRef.current = { interval, keep };

  const runBackup = useCallback(async (): Promise<BackupFile | null> => {
    if (!supported) return null;
    setRunning(true);
    try {
      const payload = JSON.stringify(exportRef.current(), null, 2);
      const file = await platform.backups.write(
        payload,
        backupStamp(new Date()),
        sanitizeBackupKeep(settingsRef.current.keep),
      );
      const now = Date.now();
      writeLastAt(now);
      setLastAt(now);
      setError("");
      return file;
    } catch (cause) {
      // Kept and shown rather than swallowed: a backup nobody knows failed is
      // the same as no backup, except the reader believes they have one.
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setRunning(false);
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) return;

    // Guards the app's first seconds, when a load may still be replacing local
    // data with what the server has. Backing up before that resolves would
    // capture a state the reader never had.
    let cancelled = false;

    const check = () => {
      if (cancelled) return;
      const due = isBackupDue({
        interval: sanitizeBackupInterval(settingsRef.current.interval),
        lastAt: readLastAt(),
        now: Date.now(),
        supported: true,
      });
      if (due) void runBackup();
    };

    const first = window.setTimeout(check, 5000);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [supported, runBackup]);

  return { supported, lastAt, error, running, backupNow: runBackup };
}
