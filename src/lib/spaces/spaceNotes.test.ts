import { describe, expect, it } from "vitest";
import type { SpaceNote } from "../spaceHubTypes";
import {
  addSpaceNote,
  dropSpaceNote,
  patchSpaceNote,
  sanitizeSpaceNote,
  sortSpaceNotes,
} from "./spaceNotes";

function note(overrides: Partial<SpaceNote> = {}): SpaceNote {
  return {
    id: "snote-1",
    spaceId: "space-1",
    title: "Kickoff",
    body: "",
    type: "Quick Note",
    url: "",
    relatedTaskId: "",
    tags: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sanitizeSpaceNote", () => {
  it("fills every optional field so a sparse legacy note loads whole", () => {
    expect(sanitizeSpaceNote({ id: "n1", spaceId: "s1" })).toEqual({
      id: "n1",
      spaceId: "s1",
      title: "",
      body: "",
      type: "Quick Note",
      url: "",
      relatedTaskId: "",
      tags: [],
      createdAt: "",
      updatedAt: "",
    });
  });

  it("drops notes with no id or no space — neither can be addressed or shown", () => {
    expect(sanitizeSpaceNote({ spaceId: "s1" })).toBeNull();
    expect(sanitizeSpaceNote({ id: "n1" })).toBeNull();
    expect(sanitizeSpaceNote({ id: "  ", spaceId: "s1" })).toBeNull();
    expect(sanitizeSpaceNote(null)).toBeNull();
    expect(sanitizeSpaceNote("junk")).toBeNull();
  });

  it("keeps the body verbatim — it is the user's writing", () => {
    const body = "  line one\n\n  line two  ";
    expect(sanitizeSpaceNote({ id: "n1", spaceId: "s1", body })?.body).toBe(body);
  });

  it("discards non-string tags instead of failing the whole note", () => {
    expect(sanitizeSpaceNote({ id: "n1", spaceId: "s1", tags: ["a", 3, null, "", "b"] })?.tags).toEqual(["a", "b"]);
  });

  it("borrows the other timestamp when only one is present", () => {
    expect(sanitizeSpaceNote({ id: "n1", spaceId: "s1", updatedAt: "2026-01-01" })?.createdAt).toBe("2026-01-01");
    expect(sanitizeSpaceNote({ id: "n1", spaceId: "s1", createdAt: "2026-01-01" })?.updatedAt).toBe("2026-01-01");
  });
});

describe("patchSpaceNote", () => {
  const now = "2026-08-15T00:00:00.000Z";

  it("returns the SAME array when the id is unknown, so an edit elsewhere syncs nothing", () => {
    const current = [note()];
    expect(patchSpaceNote(current, "missing", { title: "x" }, now)).toBe(current);
  });

  it("replaces only the touched note, leaving the others identical by reference", () => {
    const untouched = note({ id: "snote-2" });
    const next = patchSpaceNote([note(), untouched], "snote-1", { title: "Edited" }, now);
    expect(next[0].title).toBe("Edited");
    expect(next[0].updatedAt).toBe(now);
    // Identity is what diffChangedRecords uses to decide what to upload.
    expect(next[1]).toBe(untouched);
  });

  it("refuses to move a note to another space or change its id", () => {
    const next = patchSpaceNote([note()], "snote-1", { id: "hijack", spaceId: "space-9" } as Partial<SpaceNote>, now);
    expect(next[0].id).toBe("snote-1");
    expect(next[0].spaceId).toBe("space-1");
  });
});

describe("dropSpaceNote", () => {
  it("returns the SAME array when nothing matched", () => {
    const current = [note()];
    expect(dropSpaceNote(current, "missing")).toBe(current);
  });

  it("removes the matching note", () => {
    expect(dropSpaceNote([note(), note({ id: "snote-2" })], "snote-1").map((item) => item.id)).toEqual(["snote-2"]);
  });
});

describe("addSpaceNote / sortSpaceNotes", () => {
  it("puts a new note first", () => {
    expect(addSpaceNote([note()], note({ id: "snote-2" }))[0].id).toBe("snote-2");
  });

  it("orders newest-updated first", () => {
    const older = note({ id: "old", updatedAt: "2026-01-01T00:00:00.000Z" });
    const newer = note({ id: "new", updatedAt: "2026-08-01T00:00:00.000Z" });
    expect(sortSpaceNotes([older, newer]).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("does not mutate the input", () => {
    const input = [note({ id: "a", updatedAt: "2026-01-01" }), note({ id: "b", updatedAt: "2026-09-01" })];
    sortSpaceNotes(input);
    expect(input.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
