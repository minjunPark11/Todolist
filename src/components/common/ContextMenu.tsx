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
import { useState, type ReactNode } from "react";
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
  /**
   * Offered, but not right now (§15.5).
   *
   * Paired with `hint`, which is the half that matters: §15.5 asks for
   * "disabled + explanation", and a grey row on its own tells the reader they
   * did something wrong without saying what. The explanation is drawn inside
   * the row rather than hung on `title`, so it does not need a hovering mouse
   * to be read.
   */
  disabled?: boolean;
  hint?: string;
  /**
   * The setting's current answer, drawn at the trailing edge: "그룹화하기 …
   * 날짜". A row that opens a list of choices should say which one is in
   * force, or the reader has to open it to find out.
   */
  value?: string;
  /**
   * Choices this row leads to, instead of an action.
   *
   * Opening one REPLACES the menu's contents rather than flying a second
   * surface out to the side. That is not the shape the reference app has, and
   * it is chosen anyway: a flyout has to measure itself, decide which way to
   * open, and handle a pointer travelling diagonally between two surfaces —
   * and the comment at the top of this file records that this menu's
   * self-positioning was removed for guessing exactly those things wrong. A
   * drill-in is one surface, works under a finger, and asks the same question.
   */
  submenu?: ContextMenuItem[];
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
  // Which row's choices are open, if any. Held here rather than by the caller
  // because it is the menu's own navigation and dies with the menu.
  const [drilled, setDrilled] = useState<ContextMenuItem | null>(null);

  const sections: ContextMenuSection[] = drilled
    ? [{ id: "submenu", items: drilled.submenu ?? [] }]
    : state.sections;

  return (
    <FloatingMenu
      anchor={{ x: state.x, y: state.y }}
      label={drilled ? drilled.label : state.label}
      className="ff-context-menu"
      onDismiss={onClose}
    >
      {drilled ? (
        <button
          type="button"
          role="menuitem"
          className="ff-context-menu-back"
          onClick={() => setDrilled(null)}
        >
          <span className="ff-context-menu-icon" aria-hidden="true">
            ‹
          </span>
          <span className="ff-context-menu-label">{drilled.label}</span>
        </button>
      ) : null}
      {sections.map((section, index) => (
        <div key={section.id} className="ff-context-menu-section" role="group">
          {index > 0 ? <div className="ff-context-menu-divider" role="separator" /> : null}
          {section.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              aria-checked={item.selected === undefined ? undefined : item.selected}
              /* `aria-disabled` and not the `disabled` attribute: §15.45 wants
                 the arrow keys to walk the whole menu, and a disabled button
                 is not focusable — skipping it would hide the very row whose
                 explanation the reader needs to see. */
              aria-disabled={item.disabled || undefined}
              className={`ff-context-menu-item${item.danger ? " is-danger" : ""}${item.selected ? " is-selected" : ""}${item.disabled ? " is-disabled" : ""}`}
              aria-haspopup={item.submenu ? "menu" : undefined}
              onClick={() => {
                if (item.disabled) return;
                // A row with choices behind it opens them; it does not also
                // do something on the way past.
                if (item.submenu) {
                  setDrilled(item);
                  return;
                }
                item.run();
                onClose();
              }}
            >
              <span className="ff-context-menu-icon" aria-hidden="true">
                {item.icon ?? null}
              </span>
              <span className="ff-context-menu-label">
                {item.label}
                {item.hint ? <small>{item.hint}</small> : null}
              </span>
              {item.value ? <span className="ff-context-menu-value">{item.value}</span> : null}
              {item.submenu ? (
                <span className="ff-context-menu-chevron" aria-hidden="true">
                  ›
                </span>
              ) : null}
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
