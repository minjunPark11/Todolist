// @vitest-environment jsdom
//
// The behaviour §19 asks for, at the level a test can see it: what is open,
// what one Escape closes, where focus is, and what the feature is told.
//
// Deliberately not positions — jsdom lays nothing out, so every rectangle it
// reports is zero. The arithmetic is `placement.test.ts`'s, where it can be
// tested against real numbers, and §19.98's edge cases are e2e's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import type { DismissReason } from "../../domain/floating";
import { FloatingLayerProvider, useFloatingLayerOwner } from "./FloatingLayerProvider";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "./Popover";

afterEach(cleanup);

function Surface({
  name,
  onDismiss,
  children,
  ownerTaskId,
}: {
  name: string;
  onDismiss?: (reason: DismissReason) => void;
  children?: ReactNode;
  ownerTaskId?: string;
}) {
  return (
    <Popover onDismiss={onDismiss} ownerTaskId={ownerTaskId}>
      <PopoverTrigger>{`open ${name}`}</PopoverTrigger>
      <PopoverContent label={name}>
        <button type="button">{`inside ${name}`}</button>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function mount(ui: ReactNode) {
  return render(<FloatingLayerProvider>{ui}</FloatingLayerProvider>);
}

/** Stands in for the screen that knows which Task's Detail is open. */
function Owner({ taskId }: { taskId: string | null }) {
  useFloatingLayerOwner(taskId);
  return null;
}

const trigger = (name: string) => screen.getByRole("button", { name: `open ${name}` });
const isOpen = (name: string) => screen.queryByRole("dialog", { name }) !== null;

/** Escape as the document sees it — the manager listens in the capture phase. */
function pressEscape() {
  fireEvent.keyDown(document, { key: "Escape" });
}

describe("opening and closing (§19.29, §19.89)", () => {
  it("opens from its trigger and says so on the trigger", () => {
    mount(<Surface name="priority" />);
    expect(trigger("priority").getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger("priority"));
    expect(isOpen("priority")).toBe(true);
    expect(trigger("priority").getAttribute("aria-expanded")).toBe("true");
  });

  it("closes when the same trigger is clicked again", () => {
    const onDismiss = vi.fn();
    mount(<Surface name="priority" onDismiss={onDismiss} />);
    fireEvent.click(trigger("priority"));
    fireEvent.click(trigger("priority"));
    expect(isOpen("priority")).toBe(false);
    expect(onDismiss).toHaveBeenCalledWith("trigger-toggle");
  });

  // §19.6: not in the component's own subtree, so the Detail panel's
  // `overflow: auto` cannot clip it.
  it("renders into the portal root rather than beside its trigger", () => {
    mount(<Surface name="priority" />);
    fireEvent.click(trigger("priority"));
    const surface = screen.getByRole("dialog", { name: "priority" });
    expect(surface.closest("#floating-layer-root")).not.toBeNull();
  });
});

describe("one primary at a time (§19.23, §19.69)", () => {
  it("closes the open popover when another opens", () => {
    const onDismiss = vi.fn();
    mount(
      <>
        <Surface name="priority" onDismiss={onDismiss} />
        <Surface name="date" />
      </>,
    );
    fireEvent.click(trigger("priority"));
    fireEvent.click(trigger("date"));
    expect(isOpen("date")).toBe(true);
    expect(isOpen("priority")).toBe(false);
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("outside pointer (§19.26, §19.27, §19.28)", () => {
  it("closes on a pointer landing outside", () => {
    const onDismiss = vi.fn();
    mount(
      <>
        <button type="button">elsewhere</button>
        <Surface name="priority" onDismiss={onDismiss} />
      </>,
    );
    fireEvent.click(trigger("priority"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));
    expect(isOpen("priority")).toBe(false);
    expect(onDismiss).toHaveBeenCalledWith("outside-pointer");
  });

  it("stays open for a pointer inside its own contents", () => {
    mount(<Surface name="priority" />);
    fireEvent.click(trigger("priority"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "inside priority" }));
    expect(isOpen("priority")).toBe(true);
  });

  // Without this the trigger would close it on pointerdown and reopen it on
  // click, and §19.29's toggle would never be reachable by mouse.
  it("treats its own trigger as inside", () => {
    mount(<Surface name="priority" />);
    fireEvent.click(trigger("priority"));
    fireEvent.pointerDown(trigger("priority"));
    expect(isOpen("priority")).toBe(true);
  });

  // §19.26, the rule a hand-rolled outside-click check always gets wrong.
  it("does not read a click in a child popover as outside the parent", () => {
    mount(
      <Surface name="schedule">
        <Surface name="reminder" />
      </Surface>,
    );
    fireEvent.click(trigger("schedule"));
    fireEvent.click(trigger("reminder"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "inside reminder" }));
    expect(isOpen("schedule")).toBe(true);
    expect(isOpen("reminder")).toBe(true);
  });
});

describe("Escape (§19.25, §19.92, §19.93)", () => {
  it("closes the child and leaves the parent", () => {
    mount(
      <Surface name="schedule">
        <Surface name="reminder" />
      </Surface>,
    );
    fireEvent.click(trigger("schedule"));
    fireEvent.click(trigger("reminder"));

    pressEscape();
    expect(isOpen("reminder")).toBe(false);
    expect(isOpen("schedule")).toBe(true);

    pressEscape();
    expect(isOpen("schedule")).toBe(false);
  });

  it("reports the reason as escape", () => {
    const onDismiss = vi.fn();
    mount(<Surface name="priority" onDismiss={onDismiss} />);
    fireEvent.click(trigger("priority"));
    pressEscape();
    expect(onDismiss).toHaveBeenCalledWith("escape");
  });

  // How the Drawer underneath keeps its own Escape: the manager marks the
  // event only when a layer actually claimed it.
  it("leaves the event alone when nothing is open", () => {
    mount(<Surface name="priority" />);
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  // §19.25 peels one layer, innermost first — and a layer is not always a
  // popover. The Schedule editor's subpanels go back to the calendar on
  // Escape, and a field with an uncommitted draft abandons the draft. Both sit
  // inside the surface, and both must get the key before it does.
  it("yields to a handler inside the surface that claims the key", () => {
    const onDismiss = vi.fn();
    mount(
      <Popover onDismiss={onDismiss}>
        <PopoverTrigger>open schedule</PopoverTrigger>
        <PopoverContent label="schedule">
          <input aria-label="a field" onKeyDown={(event) => event.preventDefault()} />
        </PopoverContent>
      </Popover>,
    );
    fireEvent.click(trigger("schedule"));
    fireEvent.keyDown(screen.getByLabelText("a field"), { key: "Escape" });
    expect(isOpen("schedule")).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("still closes for an Escape nothing inside claimed", () => {
    mount(<Surface name="schedule" />);
    fireEvent.click(trigger("schedule"));
    fireEvent.keyDown(screen.getByRole("button", { name: "inside schedule" }), { key: "Escape" });
    expect(isOpen("schedule")).toBe(false);
  });

  it("marks the event when a layer did claim it, so nothing below also closes", () => {
    mount(<Surface name="priority" />);
    fireEvent.click(trigger("priority"));
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("focus (§19.31, §19.32, §19.33)", () => {
  it("moves focus inside when opened from the keyboard", () => {
    mount(<Surface name="priority" />);
    // A click synthesised by Enter or Space carries no pointer detail.
    fireEvent.click(trigger("priority"), { detail: 0 });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "inside priority" }));
  });

  // A single-select list built the ARIA way gives every option but the
  // current one `tabindex="-1"`. Entering at the first element in document
  // order would land at the top of the list instead of on the chosen value.
  it("skips options taken out of the tab order", () => {
    mount(
      <Popover>
        <PopoverTrigger>open priority</PopoverTrigger>
        <PopoverContent label="priority" role="listbox">
          <button type="button" role="option" tabIndex={-1}>
            none
          </button>
          <button type="button" role="option" tabIndex={0}>
            high
          </button>
        </PopoverContent>
      </Popover>,
    );
    fireEvent.click(trigger("priority"), { detail: 0 });
    expect(document.activeElement).toBe(screen.getByRole("option", { name: "high" }));
  });

  it("leaves focus where it was when opened by mouse", () => {
    mount(<Surface name="priority" />);
    fireEvent.click(trigger("priority"), { detail: 1 });
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "inside priority" }));
  });

  it("returns focus to the trigger when it closes", () => {
    mount(<Surface name="priority" />);
    fireEvent.click(trigger("priority"), { detail: 0 });
    pressEscape();
    expect(document.activeElement).toBe(trigger("priority"));
  });

  // Stealing focus back after the user has clicked into something else would
  // be the popover fighting them for the caret they just placed.
  it("does not pull focus back when it closes from an outside click", () => {
    mount(
      <>
        <input aria-label="somewhere else" />
        <Surface name="priority" />
      </>,
    );
    fireEvent.click(trigger("priority"), { detail: 1 });
    const field = screen.getByLabelText("somewhere else");
    field.focus();
    fireEvent.pointerDown(field);
    expect(document.activeElement).toBe(field);
  });

  // §19.33: no trap. Tab order is the document's, which is what a test can
  // check by confirming nothing was made inert around it.
  it("does not make the rest of the document unreachable", () => {
    mount(
      <>
        <button type="button">elsewhere</button>
        <Surface name="priority" />
      </>,
    );
    fireEvent.click(trigger("priority"));
    const outside = screen.getByRole("button", { name: "elsewhere" });
    outside.focus();
    expect(document.activeElement).toBe(outside);
  });
});

describe("selection (§19.90, §19.95)", () => {
  function Choice() {
    const { close } = usePopoverSurface();
    return (
      <button type="button" onClick={() => close()}>
        choose high
      </button>
    );
  }

  it("closes with the selection reason and puts focus back on the trigger", () => {
    const onDismiss = vi.fn();
    mount(
      <Popover onDismiss={onDismiss}>
        <PopoverTrigger>open priority</PopoverTrigger>
        <PopoverContent label="priority">
          <Choice />
        </PopoverContent>
      </Popover>,
    );
    fireEvent.click(trigger("priority"), { detail: 0 });
    fireEvent.click(screen.getByRole("button", { name: "choose high" }));
    expect(isOpen("priority")).toBe(false);
    expect(onDismiss).toHaveBeenCalledWith("selection");
    expect(document.activeElement).toBe(trigger("priority"));
  });
});

describe("owner (§19.21, §19.74)", () => {
  function Switcher({ children }: { children: ReactNode }) {
    const [taskId, setTaskId] = useState("t1");
    return (
      <FloatingLayerProvider>
        <Owner taskId={taskId} />
        <button type="button" onClick={() => setTaskId("t2")}>
          next task
        </button>
        {children}
      </FloatingLayerProvider>
    );
  }

  it("closes a Task's popover when the Detail moves to another Task", () => {
    render(
      <Switcher>
        <Surface name="priority" ownerTaskId="t1" />
      </Switcher>,
    );
    fireEvent.click(trigger("priority"));
    expect(isOpen("priority")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "next task" }));
    expect(isOpen("priority")).toBe(false);
  });

  it("leaves a popover that belongs to no Task", () => {
    render(
      <Switcher>
        <Surface name="sidebar" />
      </Switcher>,
    );
    fireEvent.click(trigger("sidebar"));
    fireEvent.click(screen.getByRole("button", { name: "next task" }));
    expect(isOpen("sidebar")).toBe(true);
  });
});
