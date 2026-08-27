import { describe, expect, it } from "vitest";
import { formatMinuteSpan, freeMinutesFrom, freeSpans, mergeSpans } from "./freeTime";

const at = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
const span = (start: string, end: string) => ({ start: at(start), end: at(end) });
const show = (spans: Array<{ start: number; end: number }>) =>
  spans.map((value) => `${formatMinuteSpan(value.start)}-${formatMinuteSpan(value.end)}`);

describe("mergeSpans", () => {
  it("joins overlapping commitments", () => {
    expect(show(mergeSpans([span("09:00", "10:30"), span("10:00", "11:00")]))).toEqual(["09:00-11:00"]);
  });

  it("joins ones that merely touch", () => {
    // A zero-length gap is not one anybody can use, and leaving it in would
    // let "free from 10:00 to 10:00" be a possible answer.
    expect(show(mergeSpans([span("09:00", "10:00"), span("10:00", "11:00")]))).toEqual(["09:00-11:00"]);
  });

  it("drops spans with no length and sorts what is left", () => {
    expect(show(mergeSpans([span("14:00", "15:00"), span("11:00", "11:00"), span("09:00", "10:00")]))).toEqual([
      "09:00-10:00",
      "14:00-15:00",
    ]);
  });
});

describe("freeSpans", () => {
  it("returns the gaps between commitments inside the window", () => {
    const free = freeSpans([span("10:00", "11:00"), span("14:00", "15:30")], at("09:00"), at("18:00"));
    expect(show(free)).toEqual(["09:00-10:00", "11:00-14:00", "15:30-18:00"]);
  });

  it("clips commitments that run past either edge of the window", () => {
    const free = freeSpans([span("08:00", "09:30"), span("17:30", "20:00")], at("09:00"), at("18:00"));
    expect(show(free)).toEqual(["09:30-17:30"]);
  });

  it("answers nothing for a day that is entirely spoken for", () => {
    expect(freeSpans([span("08:00", "19:00")], at("09:00"), at("18:00"))).toEqual([]);
  });

  it("drops gaps too short to be worth naming", () => {
    const free = freeSpans([span("09:00", "10:00"), span("10:05", "18:00")], at("09:00"), at("18:00"), 15);
    expect(free).toEqual([]);
  });
});

describe("freeMinutesFrom", () => {
  it("counts the minutes to the next commitment", () => {
    expect(freeMinutesFrom([span("11:00", "12:00")], at("10:15"), at("24:00"))).toBe(45);
  });

  it("says nothing while a commitment is in progress", () => {
    // "You have 0 minutes free" reads as an answer about availability. The
    // truth is that the question does not apply yet.
    expect(freeMinutesFrom([span("10:00", "11:00")], at("10:30"), at("24:00"))).toBeUndefined();
  });

  it("runs to the end of the window when nothing is left", () => {
    expect(freeMinutesFrom([span("08:00", "09:00")], at("10:00"), at("18:00"))).toBe(480);
  });

  it("does not count past the window", () => {
    expect(freeMinutesFrom([span("20:00", "21:00")], at("17:00"), at("18:00"))).toBe(60);
  });
});
