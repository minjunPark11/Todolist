import { describe, expect, it } from "vitest";
import type { List } from "../../types";
import {
  LIST_NAME_MAX_LENGTH,
  canSubmitCreateList,
  createListPayload,
  createListStatus,
  duplicateNamesAreAllowed,
  emptyCreateListDraft,
  isListNameValid,
  normalizeListName,
} from "./createListDraft";

const draft = (over: Partial<ReturnType<typeof emptyCreateListDraft>> = {}) => ({
  ...emptyCreateListDraft(),
  ...over,
});

describe("normalizeListName (§3.13, §3.18)", () => {
  it("trims at save rather than while typing", () => {
    expect(normalizeListName("  학교  ")).toBe("학교");
    // The raw value is untouched; only what gets STORED is trimmed, so the
    // caret does not move under the user mid-word.
    expect(draft({ name: "  학교  " }).name).toBe("  학교  ");
  });

  it("turns a pasted newline into a space instead of joining the words", () => {
    expect(normalizeListName("2026\n논문")).toBe("2026 논문");
    expect(normalizeListName("a\r\nb")).toBe("a b");
  });

  it("leaves the user's own spacing alone", () => {
    expect(normalizeListName("2026  논문")).toBe("2026  논문");
  });
});

describe("isListNameValid (§3.14, §3.16)", () => {
  it("needs one character that is not whitespace", () => {
    expect(isListNameValid("")).toBe(false);
    expect(isListNameValid("    ")).toBe(false);
    expect(isListNameValid("학")).toBe(true);
  });

  it("stops at the length the input also stops at", () => {
    expect(isListNameValid("a".repeat(LIST_NAME_MAX_LENGTH))).toBe(true);
    expect(isListNameValid("a".repeat(LIST_NAME_MAX_LENGTH + 1))).toBe(false);
    // Trimming happens first, so trailing spaces cannot push a name over.
    expect(isListNameValid(`${"a".repeat(LIST_NAME_MAX_LENGTH)}   `)).toBe(true);
  });

  it("allows the special characters a real list name has", () => {
    expect(isListNameValid("2026-논문 / 초고 (v2) #1")).toBe(true);
  });
});

// §3.15 is a MUST NOT, so it is pinned as one.
describe("duplicate names (§3.15)", () => {
  it("are allowed, in the same Folder and in different ones", () => {
    const existing = [
      { id: "l1", name: "자료", sidebarFolderId: "f1" },
      { id: "l2", name: "자료", sidebarFolderId: "f2" },
    ] as List[];

    expect(duplicateNamesAreAllowed(existing)).toBe(true);
    // No error, no automatic suffix: what comes out is what went in.
    expect(createListPayload(draft({ name: "자료" })).name).toBe("자료");
    expect(canSubmitCreateList(draft({ name: "자료" }), false)).toBe(true);
  });
});

describe("createListStatus (§1.5)", () => {
  it("is empty until a name is more than whitespace", () => {
    expect(createListStatus(draft(), false)).toBe("empty");
    expect(createListStatus(draft({ name: "   " }), false)).toBe("empty");
  });

  it("is valid on a real name", () => {
    expect(createListStatus(draft({ name: "학교" }), false)).toBe("valid");
  });

  it("is submitting whatever the name says, so nothing re-enables mid-flight", () => {
    expect(createListStatus(draft({ name: "학교" }), true)).toBe("submitting");
    expect(createListStatus(draft(), true)).toBe("submitting");
  });

  // §1.5's S2 explicitly refuses to make Name the first field.
  it("lets the other choices be made before the name exists", () => {
    const early = draft({ color: "#ff8800", defaultViewKey: "board", sidebarFolderId: "f1" });
    expect(createListStatus(early, false)).toBe("empty");
    expect(createListPayload(early)).toMatchObject({ color: "#ff8800", defaultViewKey: "board", sidebarFolderId: "f1" });
  });
});

// §1.13 INV-04. The button being disabled is not the guard — Enter, a screen
// reader and a double click all reach past a disabled button.
describe("canSubmitCreateList (§1.13 INV-04)", () => {
  it("refuses a second submit while one is in flight", () => {
    const ready = draft({ name: "학교" });
    expect(canSubmitCreateList(ready, false)).toBe(true);
    expect(canSubmitCreateList(ready, true)).toBe(false);
  });

  it("refuses an empty name however it was asked", () => {
    expect(canSubmitCreateList(draft({ name: "  " }), false)).toBe(false);
  });

  it("refuses a name past the limit that arrived some way other than typing", () => {
    expect(canSubmitCreateList(draft({ name: "a".repeat(LIST_NAME_MAX_LENGTH + 1) }), false)).toBe(false);
  });
});

describe("createListPayload", () => {
  it("omits what the user did not choose rather than sending empty strings", () => {
    expect(createListPayload(draft({ name: " 학교 " }))).toEqual({ name: "학교" });
  });

  it("carries every choice that was made (§1.12 has to restore all of them)", () => {
    expect(
      createListPayload(draft({ name: "학교", color: "#ff8800", defaultViewKey: "board", sidebarFolderId: "f1" })),
    ).toEqual({ name: "학교", color: "#ff8800", defaultViewKey: "board", sidebarFolderId: "f1" });
  });
});

describe("emptyCreateListDraft (§1.1, §1.2)", () => {
  it("opens with no Folder from the Lists header", () => {
    expect(emptyCreateListDraft()).toEqual({ name: "", color: "", defaultViewKey: "", sidebarFolderId: "" });
  });

  it("opens inside the Folder it was started from", () => {
    expect(emptyCreateListDraft("f1").sidebarFolderId).toBe("f1");
  });
});
