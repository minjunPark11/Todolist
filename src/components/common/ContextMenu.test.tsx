// @vitest-environment jsdom
//
// What moving onto the layer system had to preserve, and what it fixed.
//
// The positions are not here — jsdom lays nothing out, and the arithmetic is
// `placement.test.ts`'s. What IS here is the behaviour that used to be this
// component's own document listeners and is now the manager's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { FloatingLayerProvider } from "../floating";
import { ContextMenu, type ContextMenuState } from "./ContextMenu";

afterEach(cleanup);

const state: ContextMenuState = {
  x: 120,
  y: 200,
  label: "Task actions",
  sections: [
    { id: "a", items: [{ id: "open", label: "Open", run: () => {} }] },
    {
      id: "b",
      items: [
        { id: "high", label: "High", selected: true, run: () => {} },
        { id: "trash", label: "Trash", danger: true, run: () => {} },
      ],
    },
  ],
};

function setup(onClose = vi.fn()) {
  render(
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <ContextMenu state={state} onClose={onClose} />
      </FloatingLayerProvider>
    </I18nProvider>,
  );
  return onClose;
}

const menu = () => screen.queryByRole("menu", { name: "Task actions" });
const item = (name: string) => screen.getByRole("menuitem", { name });

describe("the menu (§19.39, §19.88)", () => {
  it("is a menu with the caller's items and sections", () => {
    setup();
    expect(menu()).not.toBeNull();
    expect(screen.getAllByRole("menuitem").map((el) => el.textContent?.trim())).toEqual([
      "Open",
      "High",
      "Trash",
      "Close",
    ]);
  });

  it("marks the chosen item for the sets where one wins", () => {
    setup();
    expect(item("High").getAttribute("aria-checked")).toBe("true");
    expect(item("Open").getAttribute("aria-checked")).toBeNull();
  });

  // §19.6. It used to render inline, so a menu on a row near the bottom of a
  // scrolling list was clipped by the list.
  it("renders into the portal root", () => {
    setup();
    expect(menu()?.closest("#floating-layer-root")).not.toBeNull();
  });

  it("runs the item and closes", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <I18nProvider lang="en">
        <FloatingLayerProvider>
          <ContextMenu
            state={{ ...state, sections: [{ id: "a", items: [{ id: "open", label: "Open", run }] }] }}
            onClose={onClose}
          />
        </FloatingLayerProvider>
      </I18nProvider>,
    );
    fireEvent.click(item("Open"));
    expect(run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("dismissal, now the manager's (§19.27, §19.92)", () => {
  it("closes on an outside pointer", () => {
    const onClose = setup();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledWith("outside-pointer");
  });

  it("stays open for a pointer inside itself", () => {
    const onClose = setup();
    fireEvent.pointerDown(item("Open"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith("escape");
  });

  // This used to need a `stopPropagation` inside the component, because the
  // Drawer's own Escape listener would otherwise fire for the same key. The
  // manager marks the event instead, and the Drawer already checks that.
  it("marks the Escape so nothing underneath also closes", () => {
    setup();
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

// §19.44. A second right-click while the menu is open keeps the same component
// mounted and changes only the coordinates, so nothing unmounts to force a
// re-measure. It has to follow the pointer anyway.
describe("reopening somewhere else (§19.44)", () => {
  it("re-measures when the anchor moves", () => {
    const { rerender } = render(
      <I18nProvider lang="en">
        <FloatingLayerProvider>
          <ContextMenu state={state} onClose={() => {}} />
        </FloatingLayerProvider>
      </I18nProvider>,
    );
    const first = menu()?.style.left;
    rerender(
      <I18nProvider lang="en">
        <FloatingLayerProvider>
          <ContextMenu state={{ ...state, x: 600, y: 400 }} onClose={() => {}} />
        </FloatingLayerProvider>
      </I18nProvider>,
    );
    expect(menu()?.style.left).not.toBe(first);
  });
});

describe("keyboard (§19.39)", () => {
  it("focuses the first item when it opens", () => {
    setup();
    expect(document.activeElement).toBe(item("Open"));
  });

  it("walks the items with the arrow keys, wrapping at the ends", () => {
    setup();
    fireEvent.keyDown(item("Open"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(item("High"));
    fireEvent.keyDown(item("High"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("Open"));
    fireEvent.keyDown(item("Open"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(item("Close"));
  });
});

describe("a row that leads to a set of choices", () => {
  function setupSubmenu(run = vi.fn()) {
    render(
      <I18nProvider lang="en">
        <FloatingLayerProvider>
          <ContextMenu
            state={{
              x: 0,
              y: 0,
              label: "Box settings",
              sections: [
                {
                  id: "view",
                  items: [
                    {
                      id: "sortBy",
                      label: "Sort by",
                      value: "Due date",
                      submenu: [
                        { id: "due", label: "Due date", selected: true, run: () => {} },
                        { id: "title", label: "Title", run },
                      ],
                      run: () => {},
                    },
                    { id: "plain", label: "Something else", run: () => {} },
                  ],
                },
              ],
            }}
            onClose={() => {}}
          />
        </FloatingLayerProvider>
      </I18nProvider>,
    );
    return run;
  }

  it("says which answer is in force without being opened", () => {
    setupSubmenu();
    expect(screen.getByRole("menuitem", { name: /Sort by/ }).textContent).toContain("Due date");
  });

  it("replaces the menu with the choices, and can come back", () => {
    setupSubmenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Sort by/ }));

    // The rest of the menu is gone; the choices are what is left.
    expect(screen.queryByRole("menuitem", { name: "Something else" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Title" })).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: /^‹?\s*Sort by$/ }));
    expect(screen.getByRole("menuitem", { name: "Something else" })).toBeTruthy();
  });

  it("does not run the parent row on the way past", () => {
    // Opening a set of choices is not choosing one.
    const parentRun = vi.fn();
    render(
      <I18nProvider lang="en">
        <FloatingLayerProvider>
          <ContextMenu
            state={{
              x: 0,
              y: 0,
              label: "Box settings",
              sections: [
                {
                  id: "view",
                  items: [
                    {
                      id: "sortBy",
                      label: "Sort by",
                      submenu: [{ id: "title", label: "Title", run: () => {} }],
                      run: parentRun,
                    },
                  ],
                },
              ],
            }}
            onClose={() => {}}
          />
        </FloatingLayerProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: /Sort by/ }));
    expect(parentRun).not.toHaveBeenCalled();
  });

  it("runs the choice and closes", () => {
    const onClose = vi.fn();
    const run = vi.fn();
    render(
      <I18nProvider lang="en">
        <FloatingLayerProvider>
          <ContextMenu
            state={{
              x: 0,
              y: 0,
              label: "Box settings",
              sections: [
                {
                  id: "view",
                  items: [
                    {
                      id: "sortBy",
                      label: "Sort by",
                      submenu: [{ id: "title", label: "Title", run }],
                      run: () => {},
                    },
                  ],
                },
              ],
            }}
            onClose={onClose}
          />
        </FloatingLayerProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: /Sort by/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Title" }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});
