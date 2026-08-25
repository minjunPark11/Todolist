// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DeferredInput, DeferredTextarea } from "../components/kit";

afterEach(cleanup);

/**
 * A field wired the way the Drawer wires it: the committed value is state, so
 * a test can tell "the draft shows it" from "the record holds it" — which is
 * the whole distinction §9.2 draws.
 */
function TitleField({
  initial = "Original",
  onCommit,
  required = true,
}: {
  initial?: string;
  onCommit?: (next: string) => void;
  required?: boolean;
}) {
  const [committed, setCommitted] = useState(initial);
  return (
    <>
      <DeferredInput
        aria-label="Title"
        value={committed}
        required={required}
        onCommit={(next) => {
          setCommitted(next);
          onCommit?.(next);
        }}
      />
      <output data-testid="committed">{committed}</output>
    </>
  );
}

const field = () => screen.getByLabelText("Title") as HTMLInputElement;
const committed = () => screen.getByTestId("committed").textContent;

describe("a text draft (spec §9)", () => {
  // §9.1: opening a Detail is not editing it, and typing is not saving.
  it("keeps the draft out of the record until something commits it", () => {
    render(<TitleField />);
    fireEvent.change(field(), { target: { value: "Half typed" } });

    expect(field().value).toBe("Half typed");
    expect(committed()).toBe("Original");
  });

  it("commits on Enter", () => {
    render(<TitleField />);
    fireEvent.change(field(), { target: { value: "Done typing" } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(committed()).toBe("Done typing");
  });

  // §9.23 / §24.12: closing the Detail must not drop what was typed into it.
  // The field goes away with the Drawer, so the flush rides on unmount.
  it("commits a pending draft when the field unmounts", () => {
    const onCommit = vi.fn();
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <>
          {open ? <TitleField onCommit={onCommit} /> : null}
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </>
      );
    }
    render(<Host />);
    fireEvent.change(field(), { target: { value: "Typed then closed" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onCommit).toHaveBeenCalledWith("Typed then closed");
  });

  it("commits on blur", () => {
    render(<TitleField />);
    fireEvent.change(field(), { target: { value: "Left the field" } });
    fireEvent.blur(field());

    expect(committed()).toBe("Left the field");
  });

  // §9.22
  it("abandons the draft on Escape and shows the stored value again", () => {
    render(<TitleField />);
    fireEvent.change(field(), { target: { value: "Never mind" } });
    fireEvent.keyDown(field(), { key: "Escape" });

    expect(field().value).toBe("Original");
    expect(committed()).toBe("Original");
  });

  // An abandoned draft must not come back on the next blur.
  it("stays abandoned when the field is then left", () => {
    render(<TitleField />);
    fireEvent.change(field(), { target: { value: "Never mind" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    fireEvent.blur(field());

    expect(committed()).toBe("Original");
  });

  // §18.14: Escape closes ONE layer. With no draft to abandon the field has no
  // claim on the key, and the Drawer above it reads `defaultPrevented`.
  it("leaves Escape to the layer above when there is no draft", () => {
    render(<TitleField />);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(field(), event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("claims Escape only while a draft is pending", () => {
    render(<TitleField />);
    fireEvent.change(field(), { target: { value: "Something" } });
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    fireEvent(field(), event);

    expect(event.defaultPrevented).toBe(true);
  });

  // §9.26. An IME fires Enter to COMMIT the composition; taking it for "the
  // user is finished" ends the edit halfway through a Korean or Japanese word.
  it("does not commit on the Enter that ends an IME composition", () => {
    const onCommit = vi.fn();
    render(<TitleField onCommit={onCommit} />);

    fireEvent.compositionStart(field());
    fireEvent.change(field(), { target: { value: "한글" } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(committed()).toBe("Original");

    // And the Enter after composition ends is the real one.
    fireEvent.compositionEnd(field());
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(committed()).toBe("한글");
  });

  it("reads isComposing off the event too, where the handlers do not fire", () => {
    render(<TitleField />);
    fireEvent.change(field(), { target: { value: "부분" } });
    fireEvent.keyDown(field(), { key: "Enter", isComposing: true });

    expect(committed()).toBe("Original");
  });

  // §9.21
  it("refuses an empty commit and puts the stored value back", () => {
    render(<TitleField />);
    fireEvent.change(field(), { target: { value: "   " } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(committed()).toBe("Original");
    expect(field().value).toBe("Original");
  });

  it("allows an empty commit where the field is not required", () => {
    render(<TitleField required={false} />);
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());

    expect(committed()).toBe("");
  });

  // §9.24: a title is one logical line, however it arrived.
  //
  // Asserted through PASTE and not through `change`, because an `<input>`
  // drops the breaks itself before any handler sees `value` — and drops them
  // without a space, so "First\nSecond" would arrive as "FirstSecond".
  it("flattens pasted newlines into one line, with the words still apart", () => {
    render(<TitleField initial="" required={false} />);
    fireEvent.paste(field(), {
      clipboardData: { getData: () => "First\nSecond\r\nThird" },
    });

    expect(field().value).toBe("First Second Third");
  });

  it("inserts a flattened paste at the cursor rather than replacing the line", () => {
    render(<TitleField initial="Start end" required={false} />);
    const input = field();
    input.setSelectionRange(6, 6);
    fireEvent.paste(input, { clipboardData: { getData: () => "one\ntwo " } });

    expect(input.value).toBe("Start one two end");
  });

  it("leaves a paste with no line break to the browser", () => {
    render(<TitleField />);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "plain" } });
    fireEvent(field(), event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe("a multi-line draft (spec §10)", () => {
  function NotesField() {
    const [value, setValue] = useState("Line one");
    return (
      <>
        <DeferredTextarea aria-label="Notes" value={value} onCommit={setValue} />
        <output data-testid="committed">{value}</output>
      </>
    );
  }

  // Enter is a paragraph break here. Committing on it would make multi-line
  // text unwritable, which is why `singleLine` is not the default everywhere.
  it("does not commit on Enter, and keeps the newline", () => {
    render(<NotesField />);
    const notes = screen.getByLabelText("Notes") as HTMLTextAreaElement;

    fireEvent.change(notes, { target: { value: "Line one\nLine two" } });
    fireEvent.keyDown(notes, { key: "Enter" });

    expect(notes.value).toBe("Line one\nLine two");
    expect(screen.getByTestId("committed").textContent).toBe("Line one");

    fireEvent.blur(notes);
    expect(screen.getByTestId("committed").textContent).toBe("Line one\nLine two");
  });
});
