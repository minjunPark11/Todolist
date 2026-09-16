import type { PlannerData } from "../../types";
import { platform } from "../../platform";
import { markLegacyLocalSpacesMigrated } from "../../lib/spaces/legacyLocalSpaces";

export const PLANNER_STORAGE_KEY = "focusflow.appData.v1";
export const FOCUS_V2_BACKUP_KEY = "focusflow.focus.v2.backup";

/**
 * 읽을 수 없게 된 스냅샷을 옮겨두는 자리.
 *
 * 저장소가 손상되면 — 쿼터에 걸려 쓰기가 중간에 끊기거나, 브라우저가 쓰는 도중에
 * 죽으면 — 앱은 빈 상태로 시작하고 첫 저장이 그 바이트를 덮는다. 앱이 읽을 수
 * 없는 것은 맞지만 사람은 아니다: 잘린 JSON 에는 보통 대부분의 할 일이 그대로
 * 들어 있고, 닫히지 않은 괄호 몇 개만 손으로 채우면 돌아온다.
 *
 * 그래서 덮기 전에 한 번만 옮긴다. "한 번만"인 것은 이 키가 이미 있으면 그것이
 * 더 오래된 — 그러므로 더 원본에 가까운 — 사본이기 때문이다. 두 번째 손상이
 * 첫 번째 구조본을 밀어내면 구조가 아니라 회전이 된다.
 */
export const UNREADABLE_RESCUE_KEY = "focusflow.appData.v1.unreadable";

// The focus-v2 backup is a migration, and a migration can only find legacy
// data in the snapshot that was already on disk when this session started:
// every write after the first is this version's own shape, so a second look
// can only ever find what we just wrote.
//
// It used to look again on every single save, and the look is not cheap — a
// full read of the snapshot plus a `JSON.parse` of all of it. Worse, it never
// stopped: the guard is the backup key, and the backup key is only written
// when legacy data is actually found, so an account with nothing to migrate
// (every account created after focus-v2, and every account already migrated)
// re-read and re-parsed its whole store on every keystroke that committed,
// forever, to re-learn the same "nothing to do".
//
// Deciding it once per session is both faster and closer to what the check
// means. The flag is deliberately not persisted: a session that never got to
// look — because its first write threw — must still look on the next launch.
let focusBackupChecked = false;

/** Exported for the migration test only. */
export function resetFocusBackupCheckForTests(): void {
  focusBackupChecked = false;
}

/**
 * 지금 저장된 것이 읽을 수 없다면, 덮기 전에 옆으로 치워둔다.
 *
 * 쓰기 실패와 같은 취급을 하지는 않는다 — 구조가 실패해도 저장은 진행한다.
 * 사용자가 방금 친 것을 지키는 쪽이 이미 읽을 수 없는 바이트를 지키는 쪽보다
 * 먼저다.
 */
function rescueUnreadable(): void {
  let previous: string | null = null;
  try {
    previous = platform.storage.getSync(PLANNER_STORAGE_KEY);
  } catch {
    return;
  }
  if (!previous) return;
  try {
    JSON.parse(previous);
    return; // 읽힌다 — 구조할 것이 없다.
  } catch {
    /* 읽히지 않는다. 아래에서 옮긴다. */
  }
  try {
    if (platform.storage.getSync(UNREADABLE_RESCUE_KEY)) return; // 더 오래된 사본이 이미 있다.
    platform.storage.setSync(UNREADABLE_RESCUE_KEY, previous);
  } catch {
    /* 구조본을 못 써도 저장은 계속한다. */
  }
}

export function persistPlannerData(data: PlannerData): void {
  // Keep the original local snapshot before the first focus-v2 rewrite.
  // A failed backup aborts this write rather than discarding the only source.
  if (!focusBackupChecked) {
    if (!platform.storage.getSync(FOCUS_V2_BACKUP_KEY)) {
      const previous = platform.storage.getSync(PLANNER_STORAGE_KEY);
      if (previous) {
        let legacy = false;
        try { const parsed = JSON.parse(previous); legacy = Array.isArray(parsed.focusSessions) && parsed.focusSessions.some((s: {schemaVersion?:number}) => !s.schemaVersion || s.schemaVersion < 2); } catch { /* Existing malformed data is not a migration source. */ }
        if (legacy) platform.storage.setSync(FOCUS_V2_BACKUP_KEY, previous);
      }
    }
    // Only once the look is complete: a backup write that threw leaves this
    // unset, so the next attempt still has the legacy source to find.
    focusBackupChecked = true;
  }
  rescueUnreadable();
  platform.storage.setSync(PLANNER_STORAGE_KEY, JSON.stringify(data));
  // This call intentionally follows the write. If persistence throws, the
  // legacy source stays unmarked and remains available for the next launch.
  markLegacyLocalSpacesMigrated();
}
