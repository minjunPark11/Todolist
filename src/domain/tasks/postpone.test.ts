import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { postponeAllToToday, postponeToToday } from "./postpone";

const TODAY = "2026-09-02";

const task = (over: Partial<Task> = {}): Task =>
  ({ id: "t1", title: "t1", startDate: "", dueDate: "", ...over }) as Task;

describe("postponing one late task", () => {
  it("moves a lone deadline to today", () => {
    const moved = postponeToToday(task({ dueDate: "2026-08-20" }), TODAY);
    expect(moved?.patch).toEqual({ startDate: "", dueDate: TODAY });
  });

  // The case the whole file exists for: three days of work is still three days
  // of work. Setting only the deadline would leave the start after the end.
  it("moves a span whole, start onto today", () => {
    const moved = postponeToToday(
      task({ startDate: "2026-08-20", dueDate: "2026-08-23" }),
      TODAY,
    );
    expect(moved?.patch).toEqual({ startDate: TODAY, dueDate: "2026-09-05" });
  });

  it("keeps the length whatever it is", () => {
    const moved = postponeToToday(
      task({ startDate: "2026-01-01", dueDate: "2026-01-31" }),
      TODAY,
    );
    // 30 days between them before, 30 after.
    expect(moved?.patch).toEqual({ startDate: TODAY, dueDate: "2026-10-02" });
  });

  it("has nothing to say about work that is not late", () => {
    expect(postponeToToday(task({ dueDate: TODAY }), TODAY)).toBeNull();
    expect(postponeToToday(task({ dueDate: "2026-12-01" }), TODAY)).toBeNull();
    expect(postponeToToday(task({ dueDate: "" }), TODAY)).toBeNull();
  });

  // §9.35: undo restores the state, not the reverse of the verb. "A day back"
  // is not the inverse of this for a task that was three weeks late.
  it("carries the exact dates it replaced", () => {
    const moved = postponeToToday(
      task({ startDate: "2026-08-20", dueDate: "2026-08-23" }),
      TODAY,
    );
    expect(moved?.undo).toEqual({ startDate: "2026-08-20", dueDate: "2026-08-23" });
  });
});

describe("postponing a whole group", () => {
  it("returns one row per task that actually moved", () => {
    const rows = postponeAllToToday(
      [
        task({ id: "late", dueDate: "2026-08-20" }),
        task({ id: "today", dueDate: TODAY }),
        task({ id: "undated" }),
        task({ id: "span", startDate: "2026-08-01", dueDate: "2026-08-03" }),
      ],
      TODAY,
    );
    // The count the toast says is this length, not the length of what was
    // handed in — otherwise a group of four reports four and moves two.
    expect(rows.map((row) => row.taskId)).toEqual(["late", "span"]);
  });

  it("is empty when nothing is late", () => {
    expect(postponeAllToToday([task({ dueDate: TODAY })], TODAY)).toEqual([]);
  });
});
