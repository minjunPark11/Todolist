import type { GoogleTaskSyncState } from "./googleTaskSyncState";
import { sameRecurrence, taskRecurrence } from "../domain/calendar/googleSync/taskRecurrence";
import { toTaskSharedPatch } from "../domain/calendar/googleSync/taskOutboundPlan";
export function googleReviewCount(state: GoogleTaskSyncState): number {
  const s = state.snapshot;
  if (!s) return state.occurrenceConflicts?.length ?? 0;
  const conflicts = s.records.filter(r => ["conflict", "review"].includes(String(r.decision.kind))).length;
  const repeat = s.records.filter(r => {
    const m = s.snapshots.find(m => m.eventId === r.eventId && m.state === "active");
    const row = m && s.tasks.get(m.taskId); const rule = row && taskRecurrence(row.data, s.timezone);
    return rule && r.decision.kind === "acknowledge" && !sameRecurrence(rule, r.source.recurrence);
  }).length;
  const transfers = [...s.tasks].filter(([id, row]) => s.historicalTaskIds.has(id) && !row.data.deletedAt &&
    !s.snapshots.some(m => m.taskId === id && m.eventId) && !["abandoned", "given_up"].includes(String(row.data.status))).length;
  const skips = s.records.filter(r => r.decision.kind === "skip" && !["excluded", "already-trashed", "cancelled-unmapped", "deleted", "recurring-instance"].includes(String(r.decision.reason))).length;
  const localSkips = [...s.tasks].filter(([id, row]) => {
    const item = s.snapshots.find(m => m.taskId === id);
    return !row.data.deletedAt && row.data.dueDate && item && (!toTaskSharedPatch(item.fields, s.timezone) ||
      taskRecurrence(row.data, s.timezone) === null || (!item.eventId && row.data.googleEventId && !s.historicalTaskIds.has(id)));
  }).length;
  return conflicts + repeat + transfers + skips + localSkips + s.operations.length + (state.occurrenceConflicts?.length ?? 0);
}
