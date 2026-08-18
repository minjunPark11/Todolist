// @vitest-environment jsdom
//
// The dialog's own rules, at the level they actually break at.
//
// createListDraft.test.ts already pins the rules as functions and every one of
// them passed while the dialog created three Lists from three Enter keydowns:
// the guard was reading React state, which does not change inside the tick that
// set it, so all three closures saw "not submitting". A pure test cannot see
// that, because the pure function was never wrong. These need an event loop.
import { describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { CreateListModal } from "./CreateListModal";

function open(onSubmit: (draft: unknown) => Promise<void>, options: { onClose?: () => void } = {}) {
  return render(
    <I18nProvider lang="en">
      <CreateListModal
        folders={[]}
        onCreateFolder={() => "sf-new"}
        onSubmit={onSubmit as never}
        onClose={options.onClose ?? (() => {})}
      />
    </I18nProvider>,
  );
}

function typeName(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>(".tm-modal-input")!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
}

/** An Enter keydown, with the IME flag the guard reads (§3.26). */
function pressEnter(input: HTMLInputElement, isComposing = false) {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  Object.defineProperty(event, "isComposing", { get: () => isComposing });
  input.dispatchEvent(event);
}

afterEach(cleanup);

describe("CreateListModal", () => {
  it("submits once however many times Enter is pressed in one tick (§1.13 INV-04)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);
    const input = typeName(container, "학교");

    pressEnter(input);
    pressEnter(input);
    pressEnter(input);

    // The regression this exists for: it was 3.
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit the Enter that ends an IME composition (§3.26)", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);
    const input = typeName(container, "학교");

    pressEnter(input, true);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the whole draft when creation fails (§1.12)", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("offline"));
    const { container } = open(onSubmit);
    const input = typeName(container, "학교");

    pressEnter(input);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.querySelector<HTMLInputElement>(".tm-modal-input")!.value).toBe("학교");
    expect(container.querySelector(".tm-state.is-error")?.textContent).toBe("offline");
  });

  it("can be retried after a failure — the lock is released, not stuck", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const { container } = open(onSubmit);
    const input = typeName(container, "학교");

    pressEnter(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
    pressEnter(container.querySelector<HTMLInputElement>(".tm-modal-input")!);

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("refuses a submit with nothing but whitespace (§3.19)", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);
    const input = typeName(container, "    ");

    pressEnter(input);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>(".tm-modal-submit")!.disabled).toBe(true);
  });

  it("does not close when the scrim is clicked (§1.8)", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);
    typeName(container, "학교");

    container.querySelector(".tm-modal-scrim")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>(".tm-modal-input")!.value).toBe("학교");
  });

  // §1.5's S2 is explicit: Name is not made the first field.
  it("lets Colour and Default View be chosen before a name exists", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);

    container.querySelectorAll<HTMLButtonElement>(".tm-swatch")[1].click();
    container.querySelectorAll<HTMLButtonElement>(".tm-modal .tm-view")[1].click();

    // Chosen, and still not submittable — the one required decision is missing.
    expect(container.querySelector<HTMLButtonElement>(".tm-modal-submit")!.disabled).toBe(true);

    const input = typeName(container, "학교");
    pressEnter(input);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ color: "red", defaultViewKey: "board" }));
  });

  // §13.6: what is offered is what can be opened.
  it("offers List, Board and Timeline, and not Calendar", () => {
    const { container } = open(vi.fn().mockResolvedValue(undefined));
    const views = [...container.querySelectorAll(".tm-modal .tm-view")].map((node) => node.textContent);

    expect(views).toEqual(["List", "Board", "Timeline"]);
  });

  // §13.22: a half-typed hex is not a colour, and must not be stored as one.
  // §4.20's Cancel/Apply: the popover holds its own value until Apply, so a
  // half-typed code never reaches the draft.
  it("stores a custom colour only once it is a whole #RRGGBB", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);

    fireEvent.click(container.querySelector(".tm-swatch-custom")!);
    const hex = container.querySelector<HTMLInputElement>(".tm-color-hex input")!;
    fireEvent.change(hex, { target: { value: "#4F7" } });

    // Apply refuses an incomplete code rather than writing it.
    expect(container.querySelector<HTMLButtonElement>(".tm-color-actions .tm-modal-submit")!.disabled).toBe(true);

    pressEnter(typeName(container, "학교"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ color: "" }));
  });

  it("stores a whole custom colour once it is applied", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);

    fireEvent.click(container.querySelector(".tm-swatch-custom")!);
    fireEvent.change(container.querySelector(".tm-color-hex input")!, { target: { value: "#4F7AF8" } });
    fireEvent.click(container.querySelector(".tm-color-actions .tm-modal-submit")!);
    pressEnter(typeName(container, "학교"));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ color: "#4F7AF8" }));
  });

  // §9.15 at popover scale. Without the stopPropagation this closes the whole
  // dialog and takes the name with it.
  it("lets Esc close the colour popover without closing the dialog", () => {
    const onClose = vi.fn();
    const { container } = open(vi.fn().mockResolvedValue(undefined), { onClose });

    fireEvent.click(container.querySelector(".tm-swatch-custom")!);
    fireEvent.keyDown(container.querySelector(".tm-color-popover")!, { key: "Escape" });

    expect(container.querySelector(".tm-color-popover")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  // §9. Focus and keyboard, at the level they exist at.
  it("puts focus in the Name field, not on the first element in the markup (§9.2)", () => {
    const { container } = open(vi.fn().mockResolvedValue(undefined));

    expect(document.activeElement).toBe(container.querySelector(".tm-modal-input"));
  });

  it("gives focus back to whatever opened it (§9.4)", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = open(vi.fn().mockResolvedValue(undefined));
    expect(document.activeElement).not.toBe(trigger);

    unmount();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  // §9.9/§9.10's MUST: a group is ONE tab stop, so an arrow inside it chooses
  // rather than moving around the dialog.
  it("makes each radio group a single tab stop", () => {
    const { container } = open(vi.fn().mockResolvedValue(undefined));

    // Scoped to the radiogroup: the custom trigger sits in the same row but is
    // NOT one of the radios, and takes a tab stop of its own on purpose (see
    // `CustomColorPicker`).
    const tabbableSwatches = [...container.querySelectorAll(".tm-swatch-radios .tm-swatch")].filter(
      (node) => (node as HTMLElement).tabIndex === 0,
    );
    const tabbableViews = [...container.querySelectorAll(".tm-modal .tm-view")].filter(
      (node) => (node as HTMLElement).tabIndex === 0,
    );

    expect(tabbableSwatches).toHaveLength(1);
    expect(tabbableViews).toHaveLength(1);
  });

  it("chooses with the arrows inside a group (§9.9, §9.10)", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);

    fireEvent.keyDown(container.querySelector(".tm-swatch-radios")!, { key: "ArrowRight" });
    fireEvent.keyDown(container.querySelector(".tm-modal .tm-views")!, { key: "End" });
    pressEnter(typeName(container, "학교"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ color: "red", defaultViewKey: "gantt" }),
    );
  });

  it("sends Home to the ends the design names (§9.9, §9.10)", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);

    fireEvent.keyDown(container.querySelector(".tm-modal .tm-views")!, { key: "End" });
    fireEvent.keyDown(container.querySelector(".tm-modal .tm-views")!, { key: "Home" });
    fireEvent.keyDown(container.querySelector(".tm-swatch-radios")!, { key: "End" });
    fireEvent.keyDown(container.querySelector(".tm-swatch-radios")!, { key: "Home" });
    pressEnter(typeName(container, "학교"));

    // §9.9 puts Home on "none", §9.10 puts it on List.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ color: "", defaultViewKey: "list" }));
  });

  // §8. The preview is an illustration of the draft, and §8.37's test of
  // whether it is load-bearing: nothing above depends on it existing.
  it("reflects the draft without becoming part of it (§8.7, §8.9, §8.29)", () => {
    const { container } = open(vi.fn().mockResolvedValue(undefined));

    // §8.7: its own fallback, not the input's placeholder — the placeholder
    // says what to type, this names the thing being made.
    expect(container.querySelector(".tm-preview-title")!.textContent).toBe("New list");
    expect(container.querySelector<HTMLInputElement>(".tm-modal-input")!.placeholder).not.toBe("New list");

    fireEvent.change(container.querySelector(".tm-modal-input")!, { target: { value: "학교" } });
    expect(container.querySelector(".tm-preview-title")!.textContent).toBe("학교");
  });

  it("draws the shape of the View that is chosen (§8.10)", () => {
    const { container } = open(vi.fn().mockResolvedValue(undefined));

    expect(container.querySelectorAll(".tm-preview-row")).toHaveLength(4);

    // fireEvent, not node.click(): it wraps in act, so the re-render has
    // landed before the next line looks at what it produced.
    fireEvent.click(container.querySelectorAll(".tm-modal .tm-view")[1]);
    expect(container.querySelectorAll(".tm-preview-column")).toHaveLength(3);
    // §8.14: not filled evenly — an even board looks like a diagram of one.
    expect(container.querySelectorAll(".tm-preview-card")).toHaveLength(3);

    fireEvent.click(container.querySelectorAll(".tm-modal .tm-view")[2]);
    expect(container.querySelectorAll(".tm-preview-gantt-bar")).toHaveLength(3);
  });

  it("is kept out of the accessibility tree (§8.24)", () => {
    const { container } = open(vi.fn().mockResolvedValue(undefined));

    // Every value it draws is already announced by the field that set it.
    expect(container.querySelector(".tm-preview")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows 'no colour' as a choice rather than as a missing swatch", () => {
    const { container } = open(vi.fn().mockResolvedValue(undefined));
    const none = container.querySelector(".tm-swatch.is-none")!;

    expect(none.getAttribute("aria-checked")).toBe("true");
    expect(none.getAttribute("aria-label")).toBeTruthy();
  });

  // §3.13: the dialog hands over what was TYPED and normalizes nothing. The
  // caret is the reason — trimming under it while typing moves it — so the
  // trim belongs to `createListPayload`, which runs on the way to the store.
  it("hands over the raw draft, leaving the trim to the payload", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);
    const input = typeName(container, "  학교  ");

    pressEnter(input);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "  학교  " }));
  });
});
