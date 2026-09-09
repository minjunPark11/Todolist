import { expect, it } from "vitest";
import { sameRecurrence, taskRecurrence } from "./taskRecurrence";

it("writes validated weekly weekdays and intervals without mutating the task", () => {
  const task = { repeatType: "weekly", repeatDays: [5, 1, 1], repeatInterval: 2 };
  expect(taskRecurrence(task, "Asia/Seoul")).toEqual(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR"]);
  expect(task.repeatDays).toEqual([5, 1, 1]);
});
it("uses inclusive local day for timed UNTIL, including daylight saving time", () => {
  expect(taskRecurrence({ repeatType: "daily", startTime: "09:00", repeatEndDate: "2026-07-01" }, "America/New_York"))
    .toEqual(["RRULE:FREQ=DAILY;UNTIL=20260702T035959Z"]);
  expect(taskRecurrence({ repeatType: "daily", repeatEndDate: "2026-07-01" }, "Asia/Seoul"))
    .toEqual(["RRULE:FREQ=DAILY;UNTIL=20260701"]);
});
it.each([{ repeatType: "custom" }, { repeatType: "weekly", repeatDays: [7] }, { repeatType: "daily", repeatInterval: 0 },
  { repeatType: "daily", repeatEndDate: "2026-02-30" }, { repeatType: "daily", dueDate: "2026-09-09", repeatEndDate: "2026-09-08" }])("holds unsupported repeat settings %j", task => {
  expect(taskRecurrence(task, "Asia/Seoul")).toBeNull();
});
it("recognizes equivalent Google property order but preserves exceptions and extra rules", () => {
  expect(sameRecurrence(["RRULE:FREQ=WEEKLY;BYDAY=MO,FR"], ["RRULE:BYDAY=FR,MO;INTERVAL=1;FREQ=WEEKLY"])).toBe(true);
  expect(sameRecurrence(["RRULE:FREQ=DAILY"], ["RRULE:FREQ=DAILY", "EXDATE;VALUE=DATE:20260101"])).toBe(false);
  expect(taskRecurrence({}, "Asia/Seoul")).toEqual([]);
  expect(sameRecurrence([], undefined)).toBe(true);
});
