// One menu, opened from a right-click or from a row's ⋯ button.
//
// The app had no context menu at all — `onContextMenu` appeared nowhere in the
// source — so every per-item action had to be reached by opening the Detail
// panel first. This is the surface those actions live on, and it is deliberately
// dumb: it knows how to position itself, how to be closed, and how to walk its
// own items with the keyboard. WHAT is on it comes from the caller, because a
// Task and a List have nothing in common but the gesture that opens them.
import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "../../i18n";

export interface ContextMenuItem {
  id: string;
  label: string;
  /** Drawn at the leading edge — a flag colour, a check, a glyph. */
  icon?: ReactNode;
  /** Shown as chosen (`aria-checked`), for the sets where one wins. */
  selected?: boolean;
  danger?: boolean;
  run: () => void;
}

export interface ContextMenuSection {
  id: string;
  items: ContextMenuItem[];
}

export interface ContextMenuState {
  /** Viewport coordinates of the pointer, or of the button that opened it. */
  x: number;
  y: number;
  label: string;
  sections: ContextMenuSection[];
}

/** Roughly what a menu needs before it would rather flip than overflow. */
const ESTIMATED_WIDTH = 208;
const ITEM_HEIGHT = 32;
const EDGE_GAP = 8;

export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Captured on mount, restored on unmount: a menu that swallows focus and
  // then vanishes leaves the reader tabbing from the top of the document
  // (§2.32, the same rule the Rail's popover follows).
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    rootRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
    return () => opener.current?.focus();
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Stopped here so the Escape that closes a menu does not also close
        // the Drawer underneath it — one layer per press (§16.28).
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? at + 1 : at - 1;
      items[(next + items.length) % items.length].focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    // Capture: the row underneath listens for keys too, and the menu is the
    // layer on top.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  // Flipped rather than clamped: a menu that slides back on screen ends up
  // under the pointer that opened it, and the item under the cursor is the one
  // most likely to be clicked by accident.
  const height = state.sections.reduce((total, section) => total + section.items.length * ITEM_HEIGHT, 0) + 16;
  const flipX = state.x + ESTIMATED_WIDTH + EDGE_GAP > window.innerWidth;
  const flipY = state.y + height + EDGE_GAP > window.innerHeight;

  return (
    <div
      ref={rootRef}
      className="ff-context-menu"
      role="menu"
      aria-label={state.label}
      style={{
        left: flipX ? Math.max(EDGE_GAP, state.x - ESTIMATED_WIDTH) : state.x,
        top: flipY ? Math.max(EDGE_GAP, state.y - height) : state.y,
      }}
    >
      {state.sections.map((section, index) => (
        <div key={section.id} className="ff-context-menu-section" role="group">
          {index > 0 ? <div className="ff-context-menu-divider" role="separator" /> : null}
          {section.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              aria-checked={item.selected === undefined ? undefined : item.selected}
              className={`ff-context-menu-item${item.danger ? " is-danger" : ""}${item.selected ? " is-selected" : ""}`}
              onClick={() => {
                item.run();
                onClose();
              }}
            >
              <span className="ff-context-menu-icon" aria-hidden="true">
                {item.icon ?? null}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ))}
      {/* A menu opened by right-click has no visible way out on a device with
          no Escape key, and the pointer that opened it is already elsewhere. */}
      <button type="button" className="ff-context-menu-close" onClick={onClose}>
        {t("common.close")}
      </button>
    </div>
  );
}
