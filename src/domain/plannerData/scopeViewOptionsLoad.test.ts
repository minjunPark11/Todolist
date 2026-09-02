// The Scope options as the store hands them back
// (SCOPE_VIEW_OPTIONS_DESIGN.md §4 phase 1).
//
// `scopeViewOptions.test.ts` covers the rules as pure functions. What it
// cannot cover is the wiring, and the wiring is the part with a reason to be
// wrong: the sweep needs the Lists and the Tags to answer "does `list:l1`
// still name anything", and `normalizeAppSettings` cannot see either of them.
// It runs in `normalizeData`, where the whole store is, and this file is what
// says so.
import { describe, expect, it } from "vitest";
import { normalizeData } from "./normalize";
import { DEFAULT_SCOPE_VIEW_OPTIONS } from "../view/scopeViewOptions";

const NOW = "2026-09-02T00:00:00.000Z";

const list = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  projectId: "",
  spaceId: "",
  kind: "regular",
  name: id,
  order: 0,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const options = (over: Record<string, unknown> = {}) => ({
  ...DEFAULT_SCOPE_VIEW_OPTIONS,
  ...over,
});

function load(scopeViewOptions: Record<string, unknown>, lists: unknown[] = []) {
  return normalizeData({
    lists,
    appSettings: { scopeViewOptions },
  } as never).appSettings.scopeViewOptions;
}

describe("Scope options on load", () => {
  it("keeps a key whose List is still in the store", () => {
    const read = load({ "list:l1": options({ dateBy: "countdown" }) }, [list("l1")]);
    expect(read?.["list:l1"].dateBy).toBe("countdown");
  });

  // The List is gone, so the key names nothing. This is the sweep that stops
  // the setting from accumulating one dead record per deleted List forever.
  it("drops a key whose List is gone", () => {
    expect(load({ "list:gone": options() }, [list("l1")])).toEqual({});
  });

  // Q5's answer, through the store: a trashed List is still a record and can
  // be restored, so its options wait for it. `permanentlyDeleteList` is what
  // takes the record away, and the next load is what notices.
  it("keeps the options of a List that is only trashed", () => {
    const read = load({ "list:l1": options({ showDetails: true }) }, [
      list("l1", { deletedAt: NOW }),
    ]);
    expect(read?.["list:l1"].showDetails).toBe(true);
  });

  it("keeps the fixed Scopes with no records to check", () => {
    const read = load({ today: options({ hideCompleted: true }) });
    expect(read?.today.hideCompleted).toBe(true);
  });

  // A value a newer client wrote that this one cannot draw lands on something
  // drawable rather than reaching a control with no such option.
  it("reads an unknown value back as the default", () => {
    const read = load({ today: { dateBy: "constellation", kanbanSize: "enormous" } }, []);
    expect(read?.today).toEqual(DEFAULT_SCOPE_VIEW_OPTIONS);
  });

  it("leaves an account that has never set any alone", () => {
    expect(normalizeData({} as never).appSettings.scopeViewOptions).toBeUndefined();
  });
});
