// A diagnostic, not a test — SCHEDULE_EDITOR_PHASE0_AUDIT.md §10 asks for the
// consolidation counts on REAL data before anyone trusts rule 1-d, and this is
// what reads them.
//
// It lives as a vitest file because that is the only TypeScript runner this
// repo has, and it runs the actual `countScheduleShapes` rather than a copy —
// a diagnostic that reimplements the rule it is checking can agree with itself
// while both are wrong.
//
// Usage, against a Settings → Export JSON file:
//
//   SCHEDULE_EXPORT=/path/to/export.json npx vitest run shapeReport --disableConsoleIntercept
//
// The flag matters: vitest swallows the report without it and the run looks
// like a test that passed and said nothing.
//
// Skips itself when the variable is absent, so the normal suite is unaffected.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyTaskSchedule,
  countScheduleShapes,
  scheduleFromTask,
  type TaskScheduleSource,
} from "./taskSchedule";

const exportPath = process.env.SCHEDULE_EXPORT;

interface ExportedTask extends TaskScheduleSource {
  id?: string;
  title?: string;
  status?: string;
  deletedAt?: string;
}

function loadTasks(path: string): ExportedTask[] {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
  if (!Array.isArray(tasks)) throw new Error("no `tasks` array in that file");
  return tasks as ExportedTask[];
}

describe.skipIf(!exportPath)("consolidation shapes in real data (audit §10)", () => {
  it("reports what rule 1-d would do", () => {
    const all = loadTasks(exportPath!);
    // Deleted records are not going to be consolidated into anything anyone
    // sees, so counting them would inflate the numbers this decision rests on.
    const live = all.filter((task) => !task.deletedAt && task.status !== "archived");
    const counts = countScheduleShapes(live);
    const dated = live.length - counts.empty;

    const lines = [
      "",
      `file          ${exportPath}`,
      `tasks         ${all.length} total, ${live.length} live, ${dated} with a schedule`,
      "",
      "  canonical        " + counts.canonical + "   already in the new model's terms",
      "  scheduled-only   " + counts["scheduled-only"] + "   a work day becomes the date",
      "  aligned          " + counts.aligned + "   work day and deadline agreed",
      "  promoted         " + counts.promoted + "   ⚠ becomes a RANGE between the two",
      "  widened          " + counts.widened + "   ⚠ an existing range STRETCHES to cover the work day",
      "",
    ];

    // The two that change what a record means. §10 says a large `widened`
    // would mean this data routinely carries three independent dates, and that
    // rule 1-d is too lossy for it — so show the actual records, not just a
    // number, because five is a footnote and five hundred is a redesign.
    for (const shape of ["promoted", "widened"] as const) {
      const examples = live.filter((task) => classifyTaskSchedule(task) === shape).slice(0, 8);
      if (examples.length === 0) continue;
      lines.push(`${shape} — first ${examples.length}:`);
      for (const task of examples) {
        const before = `start=${task.startDate || "-"} work=${task.scheduledDate || "-"} due=${task.dueDate || "-"}`;
        const after = scheduleFromTask(task);
        lines.push(
          `  ${(task.title ?? task.id ?? "?").slice(0, 32).padEnd(32)} ${before}` +
            `  →  ${after.startDate ?? "-"}..${after.dueDate ?? "-"}`,
        );
      }
      lines.push("");
    }

    console.log(lines.join("\n"));

    // Every task classifies as exactly one shape; a total that disagrees means
    // the classifier has a hole rather than the data having a surprise.
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(live.length);
  });
});
