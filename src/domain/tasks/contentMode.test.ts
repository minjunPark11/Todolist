import { describe, expect, it } from "vitest";
import type { CheckItem } from "../../types";
import {
  checkItemDraftsFromText,
  checkItemsFromDrafts,
  descriptionFromCheckItems,
} from "./contentMode";

const texts = (description: string) => checkItemDraftsFromText(description).map((draft) => draft.text);

describe("Description → Checklist (spec §11.8)", () => {
  it("makes one item per line", () => {
    expect(texts("Prepare slides\nEmail professor\nCheck data")).toEqual([
      "Prepare slides",
      "Email professor",
      "Check data",
    ]);
  });

  // §11.9. A blank line is how people separate thoughts, not a thought.
  it("treats blank lines as separators rather than items", () => {
    expect(texts("Prepare slides\n\nEmail professor\n\n\nCheck data")).toEqual([
      "Prepare slides",
      "Email professor",
      "Check data",
    ]);
  });

  it("nothing at all becomes an empty checklist, not one empty line", () => {
    expect(checkItemDraftsFromText("")).toEqual([]);
    expect(checkItemDraftsFromText("\n   \n")).toEqual([]);
  });

  // §11.32
  it("trims the ends and leaves the middle alone", () => {
    expect(texts("   Prepare  the  slides   ")).toEqual(["Prepare  the  slides"]);
  });

  it("handles the line endings a paste from Windows brings", () => {
    expect(texts("Prepare slides\r\nEmail professor")).toEqual(["Prepare slides", "Email professor"]);
  });
});

describe("prefixes the conversion strips (§11.10, §11.11)", () => {
  it("drops bullet markers", () => {
    expect(texts("- Prepare slides\n* Email professor\n+ Check data\n• Book room")).toEqual([
      "Prepare slides",
      "Email professor",
      "Check data",
      "Book room",
    ]);
  });

  it("drops ordered-list numbering", () => {
    expect(texts("1. Prepare slides\n2) Email professor\n10. Check data")).toEqual([
      "Prepare slides",
      "Email professor",
      "Check data",
    ]);
  });

  // §11.10's limit: "임의의 의미 있는 leading character를 과도하게 제거하지
  // 않는다". The space after the marker is what separates a bullet from a
  // minus sign or a decimal.
  it("leaves a leading character that is part of the text", () => {
    expect(texts("-5 degrees overnight")).toEqual(["-5 degrees overnight"]);
    expect(texts("1.5x playback speed")).toEqual(["1.5x playback speed"]);
    expect(texts("*emphasis* matters")).toEqual(["*emphasis* matters"]);
  });

  it("strips one prefix, not two", () => {
    // A bullet whose text starts with a number. Stripping twice would edit
    // the user's line rather than reformat it.
    expect(texts("- 1. Prepare slides")).toEqual(["1. Prepare slides"]);
  });

  it("makes no item from a line that is only a marker", () => {
    expect(checkItemDraftsFromText("- \n*\n1. ")).toEqual([]);
  });
});

describe("Checklist → Description (§11.17, §11.19)", () => {
  function item(text: string, checked = false): CheckItem {
    return {
      id: text,
      taskId: "t1",
      text,
      checked,
      completedAt: checked ? "2026-08-25T00:00:00.000Z" : "",
      sortKey: 0,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    };
  }

  it("writes the ticks down instead of dropping them", () => {
    expect(descriptionFromCheckItems([item("Prepare slides"), item("Email professor", true)])).toBe(
      "- [ ] Prepare slides\n- [x] Email professor",
    );
  });

  it("makes an empty checklist an empty Description", () => {
    expect(descriptionFromCheckItems([])).toBe("");
  });

  // §11.18 allows dropping the checked state; §11.19 prefers keeping it. The
  // reason to prefer it is here: the conversion is reversible, so the Undo
  // §11.15 asks for can actually restore what was there.
  it("round-trips through a Description without losing which lines were done", () => {
    const items = [item("Prepare slides"), item("Email professor", true), item("Check data")];
    const back = checkItemDraftsFromText(descriptionFromCheckItems(items));

    expect(back).toEqual([
      { text: "Prepare slides", checked: false },
      { text: "Email professor", checked: true },
      { text: "Check data", checked: false },
    ]);
  });

  it("accepts either case of the tick, and rejects a checkbox with no marker", () => {
    expect(checkItemDraftsFromText("- [X] Done\n- [x] Also done")).toEqual([
      { text: "Done", checked: true },
      { text: "Also done", checked: true },
    ]);
    // §11.20: text that merely looks like a checkbox is text.
    expect(texts("[x] not a checkbox")).toEqual(["[x] not a checkbox"]);
  });
});

describe("checkItemsFromDrafts", () => {
  it("spaces the keys so a later insert costs one write", () => {
    const items = checkItemsFromDrafts(
      "t1",
      [{ text: "A", checked: false }, { text: "B", checked: false }],
      (index) => `c${index}`,
      "2026-08-25T00:00:00.000Z",
    );
    expect(items.map((item) => item.sortKey)).toEqual([0, 1000]);
    expect(items.map((item) => item.id)).toEqual(["c0", "c1"]);
  });

  it("gives a ticked line a completion time, and an unticked one none", () => {
    const now = "2026-08-25T00:00:00.000Z";
    const items = checkItemsFromDrafts(
      "t1",
      [{ text: "Done", checked: true }, { text: "Not", checked: false }],
      (index) => `c${index}`,
      now,
    );
    expect(items.map((item) => item.completedAt)).toEqual([now, ""]);
  });
});

// The property that makes the mode toggle safe to offer at all: text that
// went through a checklist and back is the text that went in.
describe("round trip", () => {
  it("survives a Description written as a bullet list", () => {
    const original = "- Prepare slides\n- Email professor\n- Check data";
    const drafts = checkItemDraftsFromText(original);
    const items = checkItemsFromDrafts("t1", drafts, (index) => `c${index}`, "2026-08-25T00:00:00.000Z");

    // Not character-identical — it comes back in checkbox form, which is what
    // §11.19 asks for — but every line and its state survive.
    expect(checkItemDraftsFromText(descriptionFromCheckItems(items))).toEqual(drafts);
  });

  it("is stable, so converting twice changes nothing further", () => {
    const once = descriptionFromCheckItems(
      checkItemsFromDrafts(
        "t1",
        checkItemDraftsFromText("Prepare slides\n- [x] Email professor"),
        (index) => `c${index}`,
        "2026-08-25T00:00:00.000Z",
      ),
    );
    const twice = descriptionFromCheckItems(
      checkItemsFromDrafts(
        "t1",
        checkItemDraftsFromText(once),
        (index) => `c${index}`,
        "2026-08-25T00:00:00.000Z",
      ),
    );

    expect(twice).toBe(once);
  });
});
