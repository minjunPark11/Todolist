import type { GoogleTaskSyncState } from "./googleTaskSyncState";
import type { GoogleTaskSnapshot } from "./googleTaskCoordinator";
import { sameRecurrence, taskRecurrence } from "../domain/calendar/googleSync/taskRecurrence";
import { toTaskSharedPatch } from "../domain/calendar/googleSync/taskOutboundPlan";

type Snapshot = NonNullable<GoogleTaskSnapshot>;
type Records = Snapshot["records"];
type TaskEntries = [string, Snapshot["tasks"] extends Map<string, infer V> ? V : never][];

/**
 * 검토 패널이 그리는 묶음들. 세는 쪽과 그리는 쪽이 **같은 것**을 본다.
 *
 * 전에는 이 여섯 개의 필터가 `GoogleTaskReviewPanel.tsx` 와
 * `googleReviewCount` 에 각각 복사돼 있었고, 한 줄이 어긋나 있었다:
 * 패널은 `reason === "excluded"` 인 레코드를 검토 줄로 그렸는데 세는 쪽은
 * 그것을 어느 항목에도 넣지 않았다. `excluded` 는 `kind` 가 `"skip"` 이라
 * `["conflict","review"]` 에 안 걸리고, 건너뛴 목록은 `"excluded"` 를 빼고
 * 세기 때문이다.
 *
 * 숫자가 안 맞는 것으로 끝나지 않았다. 카드에서 패널을 여는 버튼은
 * `googleReviewCount(...) > 0` 일 때만 나온다. 그래서 제외해 둔 일정 하나만
 * 남으면 [실측] 세는 쪽은 0 → 버튼이 사라지고 → 그 줄에 달려 있는
 * "Import as a separate task" 에 닿을 길이 없어진다. 패널은 그 줄을 위해
 * `excluded` 를 따로 이름 붙이고 "제외" 버튼까지 숨겨 두는데, 정작 그 문이
 * 닫혀 있었다. 제외는 되돌릴 수 있어야 하고, 되돌리는 길은 이 패널뿐이다.
 *
 * 그래서 복사본을 지우고 하나로 합친다 — 어긋날 자리 자체를 없앤다.
 */
export interface GoogleReviewGroups {
  /** 사람이 고르는 줄: 충돌 · 중복 후보 · 되살아난 것 · 제외해 둔 것. */
  reviews: Records;
  /** 아직 매핑이 없는, 옮겨갈 수 있는 과거 할 일. */
  transfers: TaskEntries;
  /** 반복 규칙이 구글에서 달라진 것. */
  repeatChanges: Records;
  /** 앱 쪽 모양 때문에 못 보낸 것. */
  localSkips: TaskEntries;
  /** 구글 쪽 모양 때문에 못 들여온 것 — 위 줄들이 이미 다루는 것은 뺀다. */
  skips: Records;
}

const EMPTY: GoogleReviewGroups = { reviews: [], transfers: [], repeatChanges: [], localSkips: [], skips: [] };

/** 위의 어느 줄로도 그려지지 않는, 말없이 넘어가도 되는 이유들. */
const QUIET_SKIPS = ["excluded", "already-trashed", "cancelled-unmapped", "deleted", "recurring-instance"];

export function googleReviewGroups(snapshot: GoogleTaskSnapshot | null): GoogleReviewGroups {
  if (!snapshot) return EMPTY;
  const entries = [...snapshot.tasks] as TaskEntries;
  return {
    reviews: snapshot.records.filter(
      (r) => r.decision.kind === "review" || r.decision.kind === "conflict" || r.decision.reason === "excluded",
    ),
    transfers: entries.filter(
      ([id, row]) =>
        snapshot.historicalTaskIds.has(id) &&
        !row.data.deletedAt &&
        !snapshot.snapshots.some((s) => s.taskId === id && s.eventId) &&
        !["abandoned", "given_up"].includes(String(row.data.status)),
    ),
    repeatChanges: snapshot.records.filter((r) => {
      const mapped = snapshot.snapshots.find((s) => s.eventId === r.eventId && s.state === "active");
      const row = mapped && snapshot.tasks.get(mapped.taskId);
      const rule = row && taskRecurrence(row.data, snapshot.timezone);
      return Boolean(mapped && row && rule && r.decision.kind === "acknowledge" && !sameRecurrence(rule, r.source.recurrence));
    }),
    localSkips: entries.filter(([id, row]) => {
      const item = snapshot.snapshots.find((s) => s.taskId === id);
      return Boolean(
        !row.data.deletedAt &&
          row.data.dueDate &&
          item &&
          (!toTaskSharedPatch(item.fields, snapshot.timezone) ||
            taskRecurrence(row.data, snapshot.timezone) === null ||
            (!item.eventId && row.data.googleEventId && !snapshot.historicalTaskIds.has(id))),
      );
    }),
    skips: snapshot.records.filter(
      (r) => r.decision.kind === "skip" && !QUIET_SKIPS.includes(String(r.decision.reason)),
    ),
  };
}

/**
 * 패널이 그릴 줄의 수. 머리글의 괄호 안이자, 설정 카드가 패널로 가는 문을
 * 열어둘지 정하는 값이다.
 */
export function googleReviewCount(state: GoogleTaskSyncState): number {
  const snapshot = state.snapshot;
  const occurrences = state.occurrenceConflicts?.length ?? 0;
  if (!snapshot) return occurrences;
  const groups = googleReviewGroups(snapshot);
  return (
    groups.reviews.length +
    groups.repeatChanges.length +
    groups.transfers.length +
    groups.skips.length +
    groups.localSkips.length +
    snapshot.operations.length +
    occurrences
  );
}
