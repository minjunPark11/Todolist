// One menu, opened from a right-click or from a row's ⋯ button.
//
// The app had no context menu at all — `onContextMenu` appeared nowhere in the
// source — so every per-item action had to be reached by opening the Detail
// panel first. This is the surface those actions live on, and it is
// deliberately dumb: WHAT is on it comes from the caller, because a Task and a
// List have nothing in common but the gesture that opens them.
//
// It used to know how to position itself and how to be dismissed as well, and
// both are gone now. The positioning guessed: it assumed 208px of width and
// 32px per row and flipped against those numbers, so a menu with a long label
// or a wrapped row flipped when it did not need to and ran off the screen when
// it did. The dismissal registered its own document listeners for Escape and
// pointerdown, which is precisely what §19.92 says features must not do — and
// it had already needed a `stopPropagation` to stop one Escape closing both
// this and the Drawer beneath it.
//
// `FloatingMenu` measures the real surface and the layer manager owns both
// listeners, so the patch and the guesswork go together.
import { type ReactNode } from "react";
import { FloatingMenu } from "../floating";
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

export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const { t } = useT();

  return (
    <FloatingMenu
      anchor={{ x: state.x, y: state.y }}
      label={state.label}
      className="ff-context-menu"
      onDismiss={onClose}
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
      <button type="button" role="menuitem" className="ff-context-menu-close" onClick={onClose}>
        {t("common.close")}
      </button>
    </FloatingMenu>
  );
}
