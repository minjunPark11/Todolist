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

/** Import only rules that round-trip through the app without dropping clauses. */
export function readTaskRecurrence(rules: unknown, task: Record<string, unknown>, timezone: string): Record<string, unknown> | null {
  if (rules === undefined || (Array.isArray(rules) && rules.length === 0)) return { repeatType: "none", repeatInterval: 1, repeatDays: [], repeatEndDate: "" };
  if (!Array.isArray(rules) || rules.length !== 1 || typeof rules[0] !== "string" || !rules[0].startsWith("RRULE:")) return null;
  const entries = rules[0].slice(6).split(";").map((part: string) => part.split("="));
  if (entries.some((e: string[]) => e.length !== 2) || new Set(entries.map((e: string[]) => e[0])).size !== entries.length) return null;
  const parts = Object.fromEntries(entries);
  const repeatType = String(parts.FREQ).toLowerCase();
  const days = parts.BYDAY ? String(parts.BYDAY).split(",").map(d => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].indexOf(d)) : [];
  let end = "";
  if (parts.UNTIL) {
    const until = String(parts.UNTIL);
    if (/^\d{8}$/.test(until)) end = `${until.slice(0,4)}-${until.slice(4,6)}-${until.slice(6,8)}`;
    else if (/^\d{8}T\d{6}Z$/.test(until)) {
      const date = new Date(`${until.slice(0,4)}-${until.slice(4,6)}-${until.slice(6,8)}T${until.slice(9,11)}:${until.slice(11,13)}:${until.slice(13,15)}Z`);
      if (!Number.isFinite(date.getTime())) return null;
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map(p => [p.type,p.value]));
      end = `${p.year}-${p.month}-${p.day}`;
    } else return null;
  }
  const patch = { repeatType, repeatInterval: Number(parts.INTERVAL ?? 1), repeatDays: days, repeatEndDate: end };
  const roundTrip = taskRecurrence({ ...task, ...patch }, timezone);
  return roundTrip && sameRecurrence(roundTrip, rules) ? patch : null;
}
