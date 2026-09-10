import { normalizeTaskInboundFields, type TaskInboundFields } from "./taskInboundShape";

/** Schedule boundaries are one value: never combine a start from one edit with another edit's end. */
export function mergeTaskInbound(base: TaskInboundFields, local: TaskInboundFields, remote: TaskInboundFields): TaskInboundFields | null {
  const b = normalizeTaskInboundFields(base), l = normalizeTaskInboundFields(local), r = normalizeTaskInboundFields(remote);
  const merged = { ...l };
  const groups: (keyof TaskInboundFields)[][] = [["title"], ["description"], ["startDate", "dueDate", "startTime", "endTime"]];
  for (const group of groups) {
    const same = (a: TaskInboundFields, c: TaskInboundFields) => group.every(key => a[key] === c[key]);
    if (same(l, r) || same(r, b)) continue;
    if (!same(l, b)) return null;
    for (const key of group) merged[key] = r[key];
  }
  return merged;
}
