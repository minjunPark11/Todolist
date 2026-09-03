// A time, typed or picked (SCHEDULE_TIME_FIELD_DESIGN.md §3.4).
//
// It replaces `<input type="time">`, which §2.1 measured and found offers
// nothing: pressed in Chromium it opens no list, so the four presets beside it
// were the only times the panel ever put in front of anyone.
//
// A combobox rather than a third pattern: the List picker and the Tag picker
// are already `role="combobox"` + `aria-activedescendant` over a
// `role="listbox"` (§13.26–§13.27), and the reason is the same one here — the
// caret has to stay in the field while the arrows move through the list, or
// typing `7:30` and steering to it become two different widgets.
//
// The list is a nested popover, not a block inside the card (§4.1). The editor
// is `.ff-layer`, which scrolls inside a measured max-height, so a list drawn
// in the flow would either be clipped by that box or push the calendar down —
// and the calendar is this editor's subject, not something to move aside to
// pick an hour.
import { useEffect, useMemo, useRef, useState } from "react";
import { parseTimeInput, timeOptions, type LocalTime } from "../../domain/schedule";
import { Popover, PopoverContent, usePopoverAnchor } from "../floating";
import { formatClock } from "../../utils/clock";
import type { TimeFormat } from "../../types";
import { ClockIcon } from "./icons";
import { useT } from "../../i18n";

export interface TimeFieldProps {
  value: LocalTime | null;
  /** `null` is the ✕: a cleared field, not midnight. */
  onChange: (time: LocalTime | null) => void;
  /** The accessible name — "Starts", "Ends". */
  label: string;
  locale: string;
  timeFormat: TimeFormat;
  /** Shown beside the field when the two ends fall on different days. */
  hint?: string;
  /** §4.1.2: the row expanded INTO this, so the list is already the question. */
  openOnMount?: boolean;
  /** Told when Escape closed the list, so a row can collapse with it. */
  onDismiss?: () => void;
}

export function TimeField(props: TimeFieldProps) {
  return (
    <Popover placement="bottom-start" offset={4}>
      <TimeFieldBody {...props} />
    </Popover>
  );
}

function TimeFieldBody({
  value,
  onChange,
  label,
  locale,
  timeFormat,
  hint,
  openOnMount,
  onDismiss,
}: TimeFieldProps) {
  const { t } = useT();
  const anchor = usePopoverAnchor();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // The list is as wide as the field, which is §4.1's "폭은 줄의 폭". Measured
  // rather than guessed: the editor's 320px minus two paddings is a number
  // that would go stale the first time either padding moved.
  const [listWidth, setListWidth] = useState<number | undefined>(undefined);
  const options = useMemo(() => timeOptions(), []);

  const shown = (time: LocalTime) => formatClock(time, timeFormat, locale);

  // What is in the field: the FORMATTED value between edits, and whatever was
  // typed during one. State rather than derived, because a half-typed `7:` is
  // not a time and has no formatting to be derived from.
  const [text, setText] = useState(() => (value === null ? "" : shown(value)));
  // Where the arrow keys are, once they have been used. `null` means "follow
  // what is typed", which is §3.4's rule: a keystroke moves the list to the
  // first option at or after what the field now reads.
  const [steered, setSteered] = useState<LocalTime | null>(null);

  // A commit — or a clear, or a settings change — puts the canonical text
  // back. The clock format is a dependency because a reader switching to 24h
  // must see this field change with everything else (§7).
  useEffect(() => {
    setText(value === null ? "" : formatClock(value, timeFormat, locale));
    setSteered(null);
  }, [value, timeFormat, locale]);

  const typed = parseTimeInput(text);
  const active = steered ?? optionAtOrAfter(options, typed ?? value) ?? options[0];

  // Keep the active option in view. `start` when the list opens and `nearest`
  // afterwards: §3.1 reads the reference's list as scrolled so the current
  // value sits at the TOP, and `nearest` — which is right for an arrow key,
  // because it moves as little as possible — would leave it at the bottom.
  const justOpened = useRef(false);
  useEffect(() => {
    if (!anchor.open) {
      justOpened.current = true;
      return;
    }
    const option = listRef.current?.querySelector<HTMLElement>(`[data-time="${active}"]`);
    option?.scrollIntoView({ block: justOpened.current ? "start" : "nearest" });
    justOpened.current = false;
  }, [anchor.open, active]);

  // Measured on every open, because the editor can be narrower than it was
  // (the popover has a measured max-width of its own).
  useEffect(() => {
    if (!anchor.open) return;
    setListWidth(anchor.ref.current?.getBoundingClientRect().width);
  }, [anchor.open, anchor.ref]);

  const openOnMountRef = useRef(openOnMount);
  useEffect(() => {
    if (!openOnMountRef.current) return;
    anchor.openSurface();
    inputRef.current?.focus();
    inputRef.current?.select();
    // Once. Re-running would reopen a list the reader had just closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(time: LocalTime) {
    anchor.close();
    // Set here as well as in the effect: committing the value the field
    // already held changes nothing for the effect to react to, and a field
    // typed as `7` would sit there reading `7`.
    setText(shown(time));
    setSteered(null);
    if (time !== value) onChange(time);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!anchor.open) {
        anchor.openSurface();
        return;
      }
      const index = options.indexOf(active);
      const next = options[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) setSteered(next);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      // Typing wins over the highlight. Someone who wrote `7:30` and never
      // touched an arrow key has said what they want; the active option is
      // only where the list happens to be scrolled.
      commit(typed ?? active);
      return;
    }

    if (event.key === "Escape" && anchor.open) {
      // Only the list. §4.2 hands the rest of Escape to the layer stack, which
      // peels one level at a time — this is that level.
      event.preventDefault();
      event.stopPropagation();
      anchor.close("escape");
      onDismiss?.();
    }
  }

  function onBlur(event: React.FocusEvent<HTMLInputElement>) {
    // The options never take focus (their mousedown is prevented), so a blur
    // here means the reader has genuinely left the field.
    if (event.relatedTarget instanceof Node && listRef.current?.contains(event.relatedTarget)) return;
    anchor.close();
    if (typed !== null) {
      if (typed !== value) onChange(typed);
      setText(shown(typed));
      setSteered(null);
      return;
    }
    // §3.2: unreadable is a refusal, so the last good value comes back rather
    // than the field keeping text that stands for nothing.
    setText(value === null ? "" : shown(value));
    setSteered(null);
  }

  return (
    // The surface is a SIBLING of the field, not a child of it. React attaches
    // a parent's ref only after its children's layout effects have run, so a
    // `PopoverContent` nested inside the box would measure a null anchor on
    // the very commit that opens it — and a surface with no measurement is
    // rendered `visibility: hidden`. As a sibling the box's ref is attached
    // first, which is the order the primitive was written for.
    <>
      <div
        className="sched-timefield"
        ref={(node) => {
          // The BOX is the anchor, not the input inside it, so the list lines up
          // with the field's own left edge rather than with the caret. Focus
          // never enters the surface (the options refuse it), so nothing here
          // needs the anchor to be focusable.
          anchor.ref.current = node;
        }}
      >
        <span className="sched-timefield-icon" aria-hidden="true">
          <ClockIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          className="sched-timefield-input"
          value={text}
          /* The label, not "없음". An empty end field saying "None" tells the
           reader there is no time but not which end it is — and this row
           carries two fields with the same icon. */
        placeholder={label}
          aria-label={label}
          aria-expanded={anchor.open}
          aria-controls={anchor.open ? anchor.surfaceId : undefined}
          aria-activedescendant={anchor.open ? `${anchor.surfaceId}-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(event) => {
            setText(event.target.value);
            setSteered(null);
            anchor.openSurface();
          }}
          onFocus={() => anchor.openSurface()}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        {hint ? <em className="sched-timefield-hint">{hint}</em> : null}
        {/* §3.4: this empties ONE end. The panel's 시간 지우기 empties both, which
          is a different sentence, so both controls stay. */}
        <button
          type="button"
          className="sched-timefield-clear"
          aria-label={t("schedule.clearTimeField", { label })}
          disabled={value === null}
          onClick={() => {
            onChange(null);
            inputRef.current?.focus();
          }}
        >
          ✕
        </button>
      </div>

      <PopoverContent label={label} className="sched-timelist" role="listbox" focusOnOpen="never">
        <div
          ref={listRef}
          className="sched-timelist-scroll"
          /* Minus the surface's own 4px of padding on each side. */
          style={listWidth ? { width: listWidth - 8 } : undefined}
        >
          {options.map((option) => (
            <button
              key={option}
              id={`${anchor.surfaceId}-${option}`}
              type="button"
              role="option"
              data-time={option}
              aria-selected={option === value}
              tabIndex={-1}
              className={`sched-timelist-option${option === value ? " is-selected" : ""}${
                option === active ? " is-active" : ""
              }`}
              // The caret must not leave the field for a click any more than
              // for an arrow key — the field IS the widget (§3.4).
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setSteered(option)}
              onClick={() => commit(option)}
            >
              <span className="sched-timelist-check" aria-hidden="true">
                {option === value ? "✓" : ""}
              </span>
              {shown(option)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </>
  );
}

/**
 * The first option at or after `time` — where the list scrolls to.
 *
 * At or after rather than nearest: someone typing `7:1` is on their way to
 * something past seven, and a list that jumped back to 07:00 would move away
 * from where they are heading. Past the last option it stays on the last;
 * `null` when there is nothing to aim at at all.
 */
function optionAtOrAfter(options: readonly LocalTime[], time: LocalTime | null): LocalTime | null {
  if (time === null) return null;
  return options.find((option) => option >= time) ?? options[options.length - 1] ?? null;
}
