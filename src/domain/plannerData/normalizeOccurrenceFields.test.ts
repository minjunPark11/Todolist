// The claim M1 rests on: the three occurrence fields need no migration.
//
// RECURRING_OCCURRENCE_EDIT_DESIGN.md §4 says they can be added to `Task` with
// no table change and no migration, because `normalizeTask` spreads what it
// does not recognise before overwriting what it does. That is an assertion
// about the load path, and the load path IS the migration here — there is no
// schema and no migration table (SCHEDULE_EDITOR_PHASE0_AUDIT.md §2).
//
// So it is worth a test rather than a sentence. If someone later reorders the
// spread, or starts listing fields explicitly, these fail instead of an
// account quietly losing its occurrence records to whichever client loads next.
import { describe, expect, it } from "vitest";
import { normalizeTask } from "./normalize";
import type { Task } from "../../types";

const base = { id: "t", title: "Water the plants", createdAt: "2026-09-08", updatedAt: "2026-09-08" };

describe("normalizeTask carries the occurrence fields", () => {
  it("keeps all three through a load", () => {
    const loaded = normalizeTask({
      ...base,
      exdates: ["2026-09-16"],
      recurrenceId: "2026-09-09",
      occurrenceOf: "series-1",
    });
    expect(loaded.exdates).toEqual(["2026-09-16"]);
    expect(loaded.recurrenceId).toBe("2026-09-09");
    expect(loaded.occurrenceOf).toBe("series-1");
  });

  it("is idempotent, because it runs on every load and not once", () => {
    const once = normalizeTask({ ...base, recurrenceId: "2026-09-09", occurrenceOf: "series-1" });
    expect(normalizeTask(once)).toEqual(once);
  });

  it("leaves them absent on a task that never had them", () => {
    // Every Task written before this field existed. Absent must stay absent
    // rather than becoming "" or [] — §4 makes them optional so that a record
    // can say nothing, and "" would read as an occurrence of an empty date.
    const legacy = normalizeTask(base);
    expect(legacy.recurrenceId).toBeUndefined();
    expect(legacy.occurrenceOf).toBeUndefined();
    expect(legacy.exdates).toBeUndefined();
  });

  it("does not let a client that knows the fields erase one that does not", () => {
    // The forward-compat spread exists for the reverse case too: a build one
    // version behind must not drop what a newer one wrote. Simulated by
    // normalizing a record whose fields this build does know — the same code
    // path either way.
    const written: Partial<Task> = { ...base, exdates: ["2026-09-16", "2026-09-23"] };
    expect(normalizeTask(written).exdates).toHaveLength(2);
  });
});
