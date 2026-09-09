import { isLocalDate } from "../../schedule/types";
import { resolveMinute } from "./taskOutboundPlan";

/** null means unsupported; [] explicitly removes recurrence. Never silently coerce invalid rules. */
export function taskRecurrence(task: Record<string, unknown>, timezone: string): string[] | null {
  const kind = task.repeatType ?? "none";
  if (kind === "none") return [];
  if (!["daily", "weekly", "monthly", "yearly"].includes(String(kind))) return null;
  const interval = task.repeatInterval ?? 1, days = task.repeatDays ?? [];
  if (!Number.isSafeInteger(interval) || Number(interval) < 1 || Number(interval) > 999 ||
    !Array.isArray(days) || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return null;
  const parts = [`FREQ=${String(kind).toUpperCase()}`];
  if (interval !== 1) parts.push(`INTERVAL=${interval}`);
  if (kind === "weekly" && days.length) parts.push(`BYDAY=${[...new Set<number>(days)].sort((a,b)=>a-b).map(d=>["SU","MO","TU","WE","TH","FR","SA"][d]).join(",")}`);
  const end = task.repeatEndDate;
  if (end) {
    if (typeof end !== "string" || !isLocalDate(end) || end < String(task.startDate || task.dueDate || "")) return null;
    if (!task.startTime) parts.push(`UNTIL=${end.replace(/-/g, "")}`);
    else {
      // Inclusive local day, using the connection's pinned zone (including DST).
      try {
        const minute = resolveMinute(end, "23:59", timezone);
        if (!minute) return null;
        const until = new Date(Date.parse(minute) + 59000).toISOString().replace(/[-:]/g, "").replace(".000", "");
        parts.push(`UNTIL=${until}`);
      } catch { return null; }
    }
  }
  return [`RRULE:${parts.join(";")}`];
}

/** Google may reorder RRULE properties/BYDAY; unknown properties still remain visible as differences. */
export function sameRecurrence(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown) => {
    if (value === undefined || value === null) return "[]";
    if (!Array.isArray(value) || value.some(x => typeof x !== "string")) return null;
    return JSON.stringify((value as string[]).map(line => line.startsWith("RRULE:") ? "RRULE:" + line.slice(6).split(";")
      .filter(p => p !== "INTERVAL=1").map(p => p.startsWith("BYDAY=") ? "BYDAY=" + p.slice(6).split(",").sort().join(",") : p).sort().join(";") : line).sort());
  };
  const left = canonical(a); return left !== null && left === canonical(b);
}
