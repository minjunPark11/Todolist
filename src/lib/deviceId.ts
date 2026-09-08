// This install's name for itself (MULTI_DEVICE_SYNC_DESIGN.md §5.2).
//
// Needed because one thing in this app is per-device rather than per-account:
// the Google inbound cursor. Every other piece of state is either the
// account's (and synced) or the screen's (and forgotten), so this is the only
// identifier of its kind and it is deliberately small.
//
// Not tied to the account. A person who signs out and back in — or into a
// different account — is still sitting at the same machine, and the mirror on
// that machine is the thing the cursor describes.
import { platform } from "../platform";

const STORAGE_KEY = "focusflow.deviceId.v1";

let cached = "";

function mint(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Old engines, and any context where crypto is unavailable. Uniqueness is
    // all this needs — it is a key, not a secret.
    return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * The id, made on first use and kept.
 *
 * Losing it — cleared storage, a fresh profile — makes this a new device, and
 * the cost of that is one full listing per calendar, after which the mirror is
 * correct again (`pruneAfterFullListing`). So this never has to be recovered,
 * only replaced.
 */
export function deviceId(): string {
  if (cached) return cached;
  try {
    const stored = platform.storage.getSync(STORAGE_KEY);
    if (stored) {
      cached = stored;
      return cached;
    }
  } catch {
    // Storage unavailable: fall through and use a value for this session only.
  }
  cached = mint();
  try {
    platform.storage.setSync(STORAGE_KEY, cached);
  } catch {
    // A device that cannot remember its name re-lists on every start. That is
    // slow, not wrong.
  }
  return cached;
}
