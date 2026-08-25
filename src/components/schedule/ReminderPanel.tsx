// The 알림 subpanel, as a multi-select (spec §6.17, §6.15).
//
// It was a `ChoicePanel` — the same one-of-many radiogroup the 반복 panel
// uses — because a Schedule held one `ReminderPreset`. §6.15 says a Task can
// want reminding a day before AND an hour before, so the control that offers
// them cannot be a radiogroup: choosing the second one would silently drop the
// first.
//
// Checkboxes rather than a listbox with multi-select, because that is what a
// reader recognises as "you may take several of these" without being told.
import { useState } from "react";
import { offersFor, specFromOffer, absoluteSpec, containsReminder, sortReminders } from "../../domain/schedule";
import type { ReminderSpec, Schedule } from "../../domain/schedule";
import { useT } from "../../i18n";

export interface ReminderPanelProps {
  /** The draft, for the offers it can carry and the anchor they resolve against. */
  draft: Schedule;
  onToggle: (reminder: ReminderSpec) => void;
  onBack: () => void;
}

export function ReminderPanel({ draft, onToggle, onBack }: ReminderPanelProps) {
  const { t } = useT();
  /** §6.21's custom flow, closed until asked for. */
  const [custom, setCustom] = useState("");

  const offers = offersFor(draft);
  // §6.13's absolute reminders are not in the offers — they have no preset to
  // match — so they are listed after them, in the order §6.49 asks for.
  const absolutes = sortReminders(
    draft.reminders.filter((reminder) => reminder.type === "absolute"),
    draft,
  );

  function addCustom() {
    // The browser hands back `YYYY-MM-DDTHH:mm`, which is the wall-clock shape
    // this domain stores. No zone conversion, deliberately (§26.5).
    if (!custom) return;
    onToggle(absoluteSpec(custom));
    setCustom("");
  }

  return (
    <div className="sched-panel">
      <div className="sched-panel-head">
        <button type="button" className="sched-panel-back" onClick={onBack} aria-label={t("schedule.back")}>
          ‹
        </button>
        <span className="sched-panel-title">{t("schedule.reminder")}</span>
        <span className="sched-panel-spacer" />
      </div>

      {/* A group of checkboxes, each announcing its own state. §6.20's "clear
          all" is unticking them, which is why there is no separate control:
          one that duplicated four gestures would be a fifth thing to explain. */}
      <div className="sched-choices" role="group" aria-label={t("schedule.reminder")}>
        {offers.map((offer) => {
          const spec = specFromOffer(offer);
          const on = containsReminder(draft.reminders, spec);
          return (
            <button
              type="button"
              key={offer.id}
              role="checkbox"
              aria-checked={on}
              className={on ? "sched-choice is-active" : "sched-choice"}
              onClick={() => onToggle(spec)}
            >
              <span>{t(`schedule.reminder.${offer.id}`)}</span>
              {on ? (
                <span className="sched-check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}

        {absolutes.map((reminder) => (
          <button
            type="button"
            key={reminder.absoluteAt}
            role="checkbox"
            aria-checked
            className="sched-choice is-active"
            onClick={() => onToggle(reminder)}
          >
            <span>{(reminder.absoluteAt ?? "").replace("T", " ")}</span>
            <span className="sched-check" aria-hidden="true">
              ✓
            </span>
          </button>
        ))}
      </div>

      {/* §6.13: a moment of its own, unattached to the Task's schedule. It is
          what makes the `absolute` half of the model reachable — without it
          §6.27's rule would describe a state nothing could produce. */}
      <div className="sched-reminder-custom">
        <label>
          <span>{t("schedule.reminder.custom")}</span>
          <input
            type="datetime-local"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addCustom();
            }}
          />
        </label>
        <button type="button" onClick={addCustom} disabled={!custom}>
          {t("common.add")}
        </button>
      </div>
    </div>
  );
}
