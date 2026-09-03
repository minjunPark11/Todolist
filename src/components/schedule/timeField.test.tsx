// @vitest-environment jsdom
//
// SCHEDULE_TIME_FIELD_DESIGN.md §10, the TimeField half. The first case is the
// one the whole design exists for: §2.1 measured `<input type="time">` in a
// browser and found it opens no listbox at all.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { TimeField } from "./TimeField";
import type { LocalTime } from "../../domain/schedule";
import type { TimeFormat } from "../../types";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.timeFormat;
});

function setup(value: LocalTime | null = null, timeFormat: TimeFormat = "12h") {
  const onChange = vi.fn();
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <TimeField
          value={value}
          onChange={onChange}
          label="Starts"
          locale="en-US"
          timeFormat={timeFormat}
        />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return { onChange, field: screen.getByRole("combobox", { name: "Starts" }) as HTMLInputElement };
}

describe("TimeField", () => {
  it("opens a list of times when it is pressed", () => {
    const { field } = setup();
    expect(screen.queryAllByRole("listbox")).toHaveLength(0);

    fireEvent.focus(field);

    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    // §3.1: the whole day, unfiltered.
    expect(screen.getAllByRole("option")).toHaveLength(48);
    expect(field.getAttribute("aria-expanded")).toBe("true");
  });

  it("leaves focus in the field while the arrows move the active option", () => {
    const { field } = setup("09:00");
    // Both: `focus()` is what moves the caret, `fireEvent` is what flushes the
    // state change so the key below reaches the handler of an OPEN field.
    field.focus();
    fireEvent.focus(field);

    fireEvent.keyDown(field, { key: "ArrowDown" });

    expect(document.activeElement).toBe(field);
    // Announced through activedescendant, which is the only way an option can
    // be reported without focus going to it.
    expect(field.getAttribute("aria-activedescendant")).toContain("09:30");
  });

  it("commits what was typed rather than where the list is scrolled", () => {
    const { field, onChange } = setup("09:00");
    fireEvent.focus(field);
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.change(field, { target: { value: "7:30" } });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("07:30");
  });

  it("commits the active option when nothing readable was typed", () => {
    const { field, onChange } = setup("09:00");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatch(/^\d\d:\d\d$/);
  });

  it("commits a click on an option", () => {
    const { field, onChange } = setup();
    fireEvent.focus(field);
    fireEvent.click(screen.getByRole("option", { name: "1:30 PM" }));

    expect(onChange).toHaveBeenCalledWith("13:30");
  });

  // §3.2: unreadable is a refusal. Keeping the text would leave the field
  // showing something that stands for no time at all.
  it("puts the last good value back when the text cannot be read", () => {
    const { field, onChange } = setup("09:00");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "abc" } });
    fireEvent.blur(field);

    expect(onChange).not.toHaveBeenCalled();
    expect(field.value).toBe("9:00 AM");
  });

  it("commits a readable value on blur", () => {
    const { field, onChange } = setup();
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "730" } });
    fireEvent.blur(field);

    expect(onChange).toHaveBeenCalledWith("07:30");
  });

  it("closes only the list on Escape", () => {
    const { field } = setup("09:00");
    fireEvent.focus(field);
    expect(screen.getAllByRole("listbox")).toHaveLength(1);

    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryAllByRole("listbox")).toHaveLength(0);
    expect(screen.getByRole("combobox", { name: "Starts" })).toBe(field);
  });

  // §7. The panel used to ask Intl without the setting, so a reader who had
  // chosen 24h was told "9:00 AM" by this one control.
  it("writes the times the way the app's clock setting does", () => {
    const { field } = setup("19:30", "24h");
    expect(field.value).toBe("19:30");

    fireEvent.focus(field);
    expect(screen.getByRole("option", { name: /19:30/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /7:30 PM/ })).toBeNull();
  });

  it("empties one end with the ✕, and only when there is something in it", () => {
    const { onChange } = setup("09:00");
    const clear = screen.getByRole("button", { name: "Clear Starts" });
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith(null);

    cleanup();
    setup(null);
    expect(screen.getByRole("button", { name: "Clear Starts" })).toHaveProperty("disabled", true);
  });
});
