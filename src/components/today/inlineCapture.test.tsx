// @vitest-environment jsdom
//
// The add row folds (TODAY_TICKTICK_REDESIGN.md §4 Phase 4).
//
// jsdom rather than the browser, and not by choice at first: the Browser pane
// this project drives is a hidden tab, so `document.hasFocus()` is false there
// and Chrome dispatches no focus events at all — `input.focus()` moved
// `activeElement` and fired nothing. A row whose whole behaviour is "what
// happens when it is focused" cannot be measured on a page that cannot take
// focus. `userEvent` dispatches the real thing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { I18nProvider } from "../../i18n";
import { InlineCapture } from "./InlineCapture";

const TODAY = "2026-09-01";

function renderCapture(over: { onCapture?: (parsed: unknown) => void; onOpenDetails?: (title: string) => void } = {}) {
  const onCapture = vi.fn(over.onCapture);
  const onOpenDetails = vi.fn(over.onOpenDetails);
  render(
    <I18nProvider lang="en">
      <InlineCapture
        today={TODAY}
        addToToday
        onToggleAddToToday={() => {}}
        onCapture={onCapture}
        onOpenDetails={onOpenDetails}
        inputRef={createRef<HTMLInputElement>()}
      />
    </I18nProvider>,
  );
  return { onCapture, onOpenDetails };
}

const form = () => document.querySelector(".tdy-capture") as HTMLElement;
const field = () => screen.getByRole("textbox", { name: "Add task" });

afterEach(cleanup);

describe("the day's add row", () => {
  // Folded it is one line among the rows below it; the card, the destination
  // toggle, the Add button and the hint were standing open every day whether
  // or not anybody typed.
  it("is one quiet line until it is asked for", () => {
    renderCapture();

    expect(form().className).not.toContain("is-open");
    expect(field()).toHaveProperty("placeholder", "Add task");
    expect(form().querySelectorAll("button")).toHaveLength(0);
    expect(form().querySelector(".tdy-capture-hint")).toBeNull();
  });

  it("opens on focus, with everything it had", async () => {
    const user = userEvent.setup();
    renderCapture();

    await user.click(field());

    expect(form().className).toContain("is-open");
    expect(field()).toHaveProperty("placeholder", "Jot it down — e.g. tomorrow 3pm team sync !!");
    // The destination toggle and Add, back where they were.
    expect(form().querySelectorAll("button").length).toBeGreaterThanOrEqual(2);
    expect(form().querySelector(".tdy-capture-hint")).toBeTruthy();
  });

  it("folds again when it is left empty", async () => {
    const user = userEvent.setup();
    renderCapture();

    await user.click(field());
    await user.tab();

    expect(form().className).not.toContain("is-open");
  });

  // Text typed and then clicked away from is still a capture in progress.
  // Folding the Add button away under it would take the control back
  // mid-sentence.
  it("stays open when there is something in it", async () => {
    const user = userEvent.setup();
    renderCapture();

    await user.click(field());
    await user.type(field(), "Write the notes");
    await user.tab();

    expect(form().className).toContain("is-open");
  });

  // One key, two jobs — which is what the hint line under it promises.
  it("Escape clears first and folds second", async () => {
    const user = userEvent.setup();
    renderCapture();

    await user.click(field());
    await user.type(field(), "Write the notes");
    await user.keyboard("{Escape}");
    expect(field()).toHaveProperty("value", "");
    expect(form().className).toContain("is-open");

    await user.keyboard("{Escape}");
    expect(form().className).not.toContain("is-open");
  });

  // Folding must not cost the capture path anything: these two are why the
  // header's separate Add button could go away.
  it("still saves on Enter and still opens the full form on Alt+Enter", async () => {
    const user = userEvent.setup();
    const { onCapture, onOpenDetails } = renderCapture();

    await user.click(field());
    await user.type(field(), "Write the notes");
    await user.keyboard("{Enter}");
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(field()).toHaveProperty("value", "");

    await user.type(field(), "Something longer");
    await user.keyboard("{Alt>}{Enter}{/Alt}");
    expect(onOpenDetails).toHaveBeenCalledWith("Something longer");
  });
});
