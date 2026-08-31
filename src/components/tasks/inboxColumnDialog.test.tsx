// @vitest-environment jsdom
//
// The dialog that adds and edits a column
// (TICKTICK_INBOX_COLUMNS_DESIGN.md §6, phase 5).
//
// Adding and editing are one dialog because membership here is DERIVED: a
// column with no conditions is a column nothing can ever be in, so the moment
// of creation is the moment the question has to be asked. What these pin is
// the refusal — a column with no date condition matches EVERY task, and
// first-match-wins means one placed on the left would empty the board.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { EMPTY_INBOX_RULE } from "../../domain/view/inboxColumnRules";
import { InboxColumnDialog, type InboxColumnDraft } from "./InboxColumnDialog";

afterEach(cleanup);

function setup(initial: InboxColumnDraft = { name: "", rule: EMPTY_INBOX_RULE }) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <I18nProvider lang="en">
      <InboxColumnDialog
        title="New column"
        initial={initial}
        placeholder="New column"
        onSave={onSave}
        onClose={onClose}
      />
    </I18nProvider>,
  );
  return { onSave, onClose, save: screen.getByRole("button", { name: "Save" }) as HTMLButtonElement };
}

describe("adding a column", () => {
  it("will not save one with no condition, and says why", () => {
    // An unconstrained column matches every task. Placed anywhere but last it
    // takes the board apart, and nobody means that — so the dialog asks rather
    // than accepting the silence.
    const { save } = setup();
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/takes every task/)).toBeTruthy();
  });

  it("saves once a date is chosen", () => {
    const { onSave, save } = setup();
    fireEvent.click(screen.getByLabelText("Today"));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ name: "", rule: { ...EMPTY_INBOX_RULE, dateBuckets: ["today"] } });
  });

  it("offers the six buckets the column headers already use", () => {
    setup();
    for (const label of ["Overdue", "Today", "Tomorrow", "Later", "No date", "Someday"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it("carries the name, trimmed by the caller rather than refused here", () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  This week  " } });
    fireEvent.click(screen.getByLabelText("Today"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "  This week  " }));
  });
});

describe("editing one", () => {
  const initial: InboxColumnDraft = {
    name: "Back burner",
    rule: { ...EMPTY_INBOX_RULE, dateBuckets: ["someday"], tagIds: ["work"] },
  };

  it("opens holding what the column already answers", () => {
    setup(initial);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Back burner");
    expect((screen.getByLabelText("Someday") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Today") as HTMLInputElement).checked).toBe(false);
  });

  it("keeps the conditions it does not offer", () => {
    // Lists, tags and priorities are not on this dialog — an Inbox column is a
    // statement about WHEN, and this board cannot write the other three on a
    // drop anyway. A rule that arrived carrying one still carries it out.
    const { onSave } = setup(initial);
    fireEvent.click(screen.getByLabelText("Later"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      name: "Back burner",
      rule: { ...EMPTY_INBOX_RULE, tagIds: ["work"], dateBuckets: ["someday", "later"] },
    });
  });

  it("cancels without saying anything", () => {
    const { onSave, onClose } = setup(initial);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
