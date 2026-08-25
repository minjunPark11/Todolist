// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task, TaskPriority } from "../../types";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { PriorityPicker } from "./PriorityPicker";

afterEach(cleanup);

function setup(priority: TaskPriority = "none") {
  const onChange = vi.fn();
  const task = { id: "t1", title: "Ship it", priority } as Task;
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <PriorityPicker task={task} onChange={onChange} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return onChange;
}

const flag = () => screen.getByRole("button", { name: /priority/i });
const option = (name: string) => screen.getByRole("option", { name: new RegExp(name, "i") });

describe("the trigger (§8.13, §8.28)", () => {
  // §8.28: "Set priority" rather than "Priority, none" — the second describes
  // a state nobody chose, and the useful thing to say is what pressing it does.
  it("asks to be set when there is no priority", () => {
    setup("none");
    expect(screen.getByRole("button", { name: "Set priority" })).not.toBeNull();
  });

  it("carries the current level in its accessible name", () => {
    setup("high");
    expect(screen.getByRole("button", { name: "Priority, High" })).not.toBeNull();
  });

  // §8.27: the flag is drawn without text, so the same sentence is on hover.
  it("says the same thing on hover", () => {
    setup("medium");
    expect(flag().getAttribute("title")).toBe("Priority, Medium");
  });
});

describe("choosing (§8.7, §8.8, §8.10)", () => {
  it("offers the four levels with the current one marked", () => {
    setup("medium");
    fireEvent.click(flag());
    expect(screen.getAllByRole("option").map((el) => el.textContent?.trim().replace(/^[⚑⚐]/, ""))).toEqual([
      "None",
      "Low",
      "Medium",
      "High",
    ]);
    expect(option("Medium").getAttribute("aria-selected")).toBe("true");
    expect(option("High").getAttribute("aria-selected")).toBe("false");
  });

  it("reports the chosen level and closes", () => {
    const onChange = setup("none");
    fireEvent.click(flag());
    fireEvent.click(option("High"));
    expect(onChange).toHaveBeenCalledWith("high");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  // §8.9: clearing is choosing None, not writing an absent value. The picker
  // reports it like any other level and the domain decides what it means.
  it("clears by reporting none", () => {
    const onChange = setup("high");
    fireEvent.click(flag());
    fireEvent.click(option("None"));
    expect(onChange).toHaveBeenCalledWith("none");
  });

  // §8.8's no-op belongs to the domain, so the picker still reports it and
  // still closes — choosing the level you already had is a completed choice.
  it("closes on a re-select and leaves the filtering to the domain", () => {
    const onChange = setup("high");
    fireEvent.click(flag());
    fireEvent.click(option("High"));
    expect(onChange).toHaveBeenCalledWith("high");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("keyboard (§8.25)", () => {
  it("enters the list at the current level rather than at the top", () => {
    setup("medium");
    fireEvent.click(flag(), { detail: 0 });
    expect(document.activeElement).toBe(option("Medium"));
  });

  it("moves through the options with the arrow keys", () => {
    setup("none");
    fireEvent.click(flag(), { detail: 0 });
    fireEvent.keyDown(option("None"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(option("Low"));
  });

  // The list is one Tab stop entered at the current value — the ARIA
  // single-select pattern, and what makes Tab leave rather than walk it.
  it("keeps one tab stop, on the active option", () => {
    setup("high");
    fireEvent.click(flag(), { detail: 0 });
    const stops = screen.getAllByRole("option").filter((el) => el.getAttribute("tabindex") === "0");
    expect(stops).toEqual([option("High")]);
  });
});

describe("dismissal (§8.11, §8.12)", () => {
  it("closes on Escape without reporting a change", () => {
    const onChange = setup("none");
    fireEvent.click(flag());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on an outside pointer without reporting a change", () => {
    const onChange = setup("none");
    fireEvent.click(flag());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
