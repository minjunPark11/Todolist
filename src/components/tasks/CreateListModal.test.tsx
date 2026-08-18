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
import { cleanup, render } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { CreateListModal } from "./CreateListModal";

function open(onSubmit: (draft: unknown) => Promise<void>) {
  return render(
    <I18nProvider lang="en">
      <CreateListModal onSubmit={onSubmit as never} onClose={() => {}} />
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
  it("stores a custom colour only once it is a whole #RRGGBB", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = open(onSubmit);
    const custom = container.querySelector<HTMLInputElement>(".tm-custom-color-input")!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;

    setter.call(custom, "#4F7");
    custom.dispatchEvent(new Event("input", { bubbles: true }));
    pressEnter(typeName(container, "학교"));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ color: "" }));
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
