// The Color row's last swatch (Add List design §4.18–§4.23).
//
// A gradient swatch that opens a small popover, not a text field. The field it
// replaced asked the user to know a hex code before they could pick a colour,
// which made "custom" a developer's escape hatch rather than a choice — §4.18
// puts it in the row with the presets precisely because it is one of them.
//
// Its own file for the same reason `FolderSelect` is: it has a MODE inside it
// (open, with an uncommitted value of its own), and a component with a mode
// living inside a form with a state machine is where the two start reading
// each other's variables (§15.21).
//
// §4.19's constraint shapes the rest: this must NOT open a second dialog. The
// parent context is the Add List modal, and a modal over a modal loses the
// draft behind it.
import { useEffect, useId, useRef, useState } from "react";
import { isCustomListColor } from "../../domain/tasks/listColor";
import { useT } from "../../i18n";

interface CustomColorPickerProps {
  /** The dialog's current colour — a preset key, "", or `#RRGGBB`. */
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}

/** What the popover opens on when the dialog has no custom colour yet. */
const SEED = "#4f7af8";

export function CustomColorPicker({ value, onChange, disabled = false }: CustomColorPickerProps) {
  const { t } = useT();
  const selected = isCustomListColor(value);
  const [open, setOpen] = useState(false);
  // Held apart from the dialog's draft until Apply (§4.20's Cancel/Apply).
  // Dragging through a spectrum passes over dozens of colours on the way to
  // the one being aimed at; writing each of them to the draft would make the
  // preset row flicker and leave the last one hovered as the answer.
  const [pending, setPending] = useState(SEED);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const hexId = useId();

  useEffect(() => {
    if (!open) return;
    // The spectrum is what the user came for, so that is what gets focus.
    popoverRef.current?.querySelector<HTMLInputElement>('input[type="color"]')?.focus();
  }, [open]);

  function start() {
    setPending(selected ? value : SEED);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    // §9.4's rule at popover scale: dismissing returns focus to what opened it,
    // or the next Tab starts from the top of the dialog.
    triggerRef.current?.focus();
  }

  function apply() {
    if (isCustomListColor(pending)) onChange(pending);
    close();
  }

  return (
    <span className="tm-custom-color">
      {/* NOT `role="radio"`, though it sits in the swatch row.
          A radio cannot own a popup — axe calls `aria-haspopup` on one a
          critical violation, and it is right: a radio announces "one of these
          is chosen" and this announces "there is more behind me". So it keeps
          the row's LOOK and takes its own tab stop, which costs §9.9 the
          "colour row is one tab stop" rule and buys a control that describes
          itself truthfully. `aria-pressed` carries the chosen state instead. */}
      <button
        ref={triggerRef}
        type="button"
        aria-pressed={selected}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("tasks.createListColorCustom")}
        disabled={disabled}
        // §4.18's MUST: the custom swatch must not read as a stronger call to
        // action than the presets, so it is the same circle wearing a
        // spectrum — and once chosen it shows the colour instead, because at
        // that point it is a swatch like any other.
        className={`tm-swatch tm-swatch-custom${selected ? " is-selected" : ""}`}
        style={selected ? { background: value, backgroundImage: "none" } : undefined}
        onClick={() => (open ? close() : start())}
      />

      {open ? (
        <div
          ref={popoverRef}
          className="tm-color-popover"
          role="dialog"
          aria-label={t("tasks.createListColorCustom")}
          onKeyDown={(event) => {
            // §9.14/§9.15: Esc closes THIS first. Without the stop, the modal's
            // own handler sees the same key and the whole draft goes with it.
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
              return;
            }
            // Enter inside the popover applies the colour; it must not reach
            // the form, where Enter means "create the List" (§7792).
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              apply();
            }
          }}
        >
          <input
            type="color"
            className="tm-color-spectrum"
            aria-label={t("tasks.createListColorSpectrum")}
            value={isCustomListColor(pending) ? pending : SEED}
            onChange={(event) => setPending(event.target.value)}
          />

          <label className="tm-color-hex" htmlFor={hexId}>
            <span className="tm-visually-hidden">{t("tasks.createListColorHex")}</span>
            <input
              id={hexId}
              type="text"
              className="tm-modal-input"
              value={pending}
              spellCheck={false}
              autoComplete="off"
              placeholder={SEED}
              // Typed freely and validated on Apply. Rejecting each keystroke
              // that is not yet six digits would make the field impossible to
              // type into.
              onChange={(event) => setPending(event.target.value.trim())}
            />
          </label>

          <div className="tm-color-actions">
            <button type="button" className="tm-modal-cancel" onClick={close}>
              {t("tasks.createListCancel")}
            </button>
            <button
              type="button"
              className="tm-modal-submit"
              disabled={!isCustomListColor(pending)}
              onClick={apply}
            >
              {t("tasks.createListColorApply")}
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
