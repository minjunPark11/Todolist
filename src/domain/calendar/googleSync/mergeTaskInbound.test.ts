import { expect, it } from "vitest";
import { mergeTaskInbound } from "./mergeTaskInbound";
const base = { title: "Task", description: "Notes", startDate: "", dueDate: "2026-09-10", startTime: "09:00", endTime: "10:00" };
it("combines independent edits and identical edits", () => {
  expect(mergeTaskInbound(base, { ...base, title: "Edited" }, { ...base, description: "New notes" }))
    .toEqual({ ...base, title: "Edited", description: "New notes" });
  expect(mergeTaskInbound(base, { ...base, title: "Edited" }, { ...base, title: "Edited" }))?.toEqual({ ...base, title: "Edited" });
});
it("keeps competing schedule edits together", () => {
  expect(mergeTaskInbound(base, { ...base, startTime: "08:00" }, { ...base, endTime: "11:00" })).toBeNull();
  expect(mergeTaskInbound(base, { ...base, title: "A" }, { ...base, title: "B" })).toBeNull();
});
