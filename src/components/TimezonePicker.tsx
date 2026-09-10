// Choosing a time zone, by typing at it.
//
// A native `<select>` was here, and its type-ahead matches from the START of
// the option's text. Every zone begins with its region, so reaching Shanghai
// meant typing "Asia/Sha" — the slash included — inside a buffer that resets
// after a second. In practice that is four hundred options you can only
// scroll, and the reader has to already know which region their city is filed
// under. "Kolkata" is under Asia, "Reykjavik" under Atlantic, "Honolulu" under
// Pacific; the whole point of searching is not having to know.
//
// Built on the same primitive as the List picker (§13.26–§13.28): a search
// field that keeps focus while the arrows move a cursor through the list
// below. Which makes it a combobox rather than a field beside a list, and
// `aria-activedescendant` is the only thing that announces the option the
// arrows are on without focus leaving the field.
import { useId, useMemo, useRef, useState } from "react";
import { filterTimezoneOptions, type TimezoneOption } from "../domain/plannerData/timezones";
import { isRovingKey, rovingNext } from "../domain/tasks/rovingChoice";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "./floating";
import { useT } from "../i18n";

export interface TimezonePickerProps {
  /** The option currently stored. A zone name, or a caller's token like "auto". */
  value: string;
  options: readonly TimezoneOption[];
  /** Names the control for a reader who arrives on the trigger. */
  label: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TimezonePicker({ value, options, label, onChange, disabled }: TimezonePickerProps) {
  const { t } = useT();
  // The stored value may be a zone this build has never heard of — the account
  // holds the only copy of the choice and `normalizeAppSettings` keeps it
  // (appSettingsTimezone.test.ts). Falling back to the raw value shows what is
  // actually stored instead of quietly naming some other zone.
  const current = options.find((option) => option.value === value)?.label ?? value;
  return (
    <Popover placement="bottom-end">
      <PopoverTrigger className="ff-timezone-trigger" disabled={disabled} aria-label={`${label}: ${current}`}>
        {current}
      </PopoverTrigger>
      <PopoverContent label={label} className="ff-timezone-surface" focusOnOpen="always">
        <TimezoneOptions value={value} options={options} label={label} onChange={onChange} placeholder={t("settings.timezoneSearch")} />
      </PopoverContent>
    </Popover>
  );
}

function TimezoneOptions({ value, options, label, onChange, placeholder }: {
  value: string; options: readonly TimezoneOption[]; label: string;
  onChange: (value: string) => void; placeholder: string;
}) {
  const { t } = useT();
  const { close } = usePopoverSurface();
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const matches = useMemo(() => filterTimezoneOptions(options, query), [options, query]);
  // Held as a value rather than an index so filtering cannot slide the cursor
  // onto a different zone: a value that has been filtered away simply stops
  // matching, and the ring starts again from the top.
  const [activeValue, setActiveValue] = useState(value);
  const active = matches.some((option) => option.value === activeValue) ? activeValue : (matches[0]?.value ?? "");

  function choose(next: string) {
    close();
    // Re-picking what is already stored is not a change. Saying so here keeps
    // every caller from having to guard a re-selection that costs something —
    // for the Google card that cost is re-reading the whole calendar.
    if (next !== value) onChange(next);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && active) {
      // Typing a city and pressing Enter is the whole point of the search.
      event.preventDefault();
      choose(active);
      return;
    }
    if (!isRovingKey(event.key)) return;
    const next = rovingNext(matches.map((option) => option.value), active, event.key);
    if (!next) return;
    event.preventDefault();
    setActiveValue(next);
    // No `CSS.escape`: it is absent in jsdom and in some webviews, and a zone
    // name is `[A-Za-z0-9_/+-]` — nothing that needs escaping inside a quoted
    // attribute selector. The List picker does the same.
    listRef.current?.querySelector<HTMLElement>(`[data-zone="${next}"]`)?.scrollIntoView?.({ block: "nearest" });
  }

  return (
    <div className="ff-timezone-picker" onKeyDown={onKeyDown}>
      <input
        className="ff-timezone-search"
        type="text"
        role="combobox"
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-expanded
        aria-controls={`${id}-options`}
        aria-activedescendant={active ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div ref={listRef} id={`${id}-options`} className="ff-timezone-options" role="listbox" aria-label={label}>
        {matches.map((option) => (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            type="button"
            role="option"
            data-zone={option.value}
            aria-selected={option.value === value}
            tabIndex={-1}
            className={`ff-timezone-option${option.value === value ? " is-selected" : ""}${
              option.value === active ? " is-active" : ""
            }`}
            onClick={() => choose(option.value)}
            onMouseEnter={() => setActiveValue(option.value)}
          >
            <span className="ff-timezone-check" aria-hidden="true">{option.value === value ? "✓" : ""}</span>
            {option.label}
          </button>
        ))}
        {/* A surface that goes blank while someone is typing reads as broken. */}
        {matches.length === 0 ? <p className="ff-timezone-empty">{t("settings.timezoneNoMatch")}</p> : null}
      </div>
    </div>
  );
}
