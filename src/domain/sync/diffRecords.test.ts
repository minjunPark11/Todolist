import { describe, expect, it } from "vitest";
import { diffChangedRecords, diffRemovedIds } from "./diffRecords";

type Row = { id: string; title: string };

const row = (id: string, title = id): Row => ({ id, title });

describe("diffChangedRecords", () => {
  it("sends nothing when the edit touched no record in this table", () => {
    // The whole point: editing a task must not re-upload every project.
    const rows = [row("a"), row("b"), row("c")];
    expect(diffChangedRecords(rows, rows)).toEqual([]);
  });

  it("sends only the record whose object identity changed", () => {
    const a = row("a");
    const b = row("b");
    // Mirrors a reducer's .map: untouched records come back by reference.
    const next = [a, { ...b, title: "edited" }];

    const changed = diffChangedRecords(next, [a, b]);
    expect(changed).toHaveLength(1);
    expect(changed[0].id).toBe("b");
  });

  it("treats a record with the same contents but a new identity as changed", () => {
    // Conservative on purpose: re-uploading one row costs a request, missing a
    // real edit costs the user their data.
    const previous = [row("a")];
    const changed = diffChangedRecords([row("a")], previous);
    expect(changed).toHaveLength(1);
  });

  it("sends everything when there is no baseline yet", () => {
    const rows = [row("a"), row("b")];
    expect(diffChangedRecords(rows, undefined)).toEqual(rows);
  });

  it("counts a brand-new record as changed", () => {
    const a = row("a");
    const changed = diffChangedRecords([a, row("new")], [a]);
    expect(changed.map((item) => item.id)).toEqual(["new"]);
  });
});

describe("diffRemovedIds", () => {
  it("names exactly the ids that disappeared", () => {
    const a = row("a");
    const b = row("b");
    expect(diffRemovedIds([a], [a, b])).toEqual(["b"]);
  });

  it("returns nothing when everything is still present", () => {
    const rows = [row("a"), row("b")];
    expect(diffRemovedIds(rows, rows)).toEqual([]);
  });

  it("does not treat a first sync as a mass deletion", () => {
    // With no baseline the account's contents are unknown; deleting on that
    // basis would be how a fresh device wipes an existing account.
    expect(diffRemovedIds([], undefined)).toEqual([]);
  });

  it("reports every id when the user cleared the collection", () => {
    expect(diffRemovedIds([], [row("a"), row("b")])).toEqual(["a", "b"]);
  });

  it("passes ids through as values, never as a filter string", () => {
    // The old delete built `("id1","id2")` by hand, so an id containing a quote
    // or comma corrupted the filter. Ids survive import verbatim, so they are
    // not guaranteed to be uuids.
    const hostile = row('we"ird,id');
    expect(diffRemovedIds([], [hostile])).toEqual(['we"ird,id']);
  });
});
