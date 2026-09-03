// The 알림 list, in the place it was asked for (SCHEDULE_TIME_FIELD_DESIGN.md §5).
//
// It was `ReminderPanel`: a screen with a title and a `‹` that replaced the
// calendar. §4.1 keeps the calendar and hangs this under the row instead.
//
// A multi-select, which is the part that is NOT negotiable (spec §6.15,
// §6.17): a Task can want reminding a day before AND an hour before, so the
// control cannot be a radiogroup — choosing the second would silently drop the
// first. Checkboxes rather than a listbox with multi-select, because that is
// what a reader recognises as "you may take several" without being told.
//
// No Save / Cancel, unlike the reference (§5, a deliberate difference). Every
// toggle here lands on the DRAFT, and the draft is committed by the editor's
// 확인. A Save inside the list would make one value pass three confirmations —
// list, editor, and, from the quick add, the task's own creation.
import { useState } from "react";
import {
  offersFor,
  reminderMoment,
  specFromOffer,
  absoluteSpec,
  containsReminder,
  sortReminders,
} from "../../domain/schedule";
import type { ReminderSpec, Schedule } from "../../domain/schedule";
import { useNotificationAccess } from "../../hooks/useNotificationAccess";
import { formatClock } from "../../utils/clock";
import { useTimeFormat } from "../../utils/appPrefs";
import { useT } from "../../i18n";
import { ReminderCustom } from "./ReminderCustom";

export interface ReminderListProps {
  /** The draft, for the offers it can carry and the anchor they resolve against. */
  draft: Schedule;
  locale: string;
  onToggle: (reminder: ReminderSpec) => void;
}

/** Which of the two builders is open, if either (§6.3 keeps them apart). */
type Builder = "relative" | "absolute" | null;

export function ReminderList({ draft, locale, onToggle }: ReminderListProps) {
  const { t } = useT();
  const timeFormat = useTimeFormat();
  const [builder, setBuilder] = useState<Builder>(null);
  const [absolute, setAbsolute] = useState("");
  const delivery = useNotificationAccess();

  /**
   * §6.39: ask at the moment of intent, and store either way (§6.40).
   *
   * The permission request rides along with the choice rather than gating it.
   * §26.6.4 is explicit — a platform that cannot deliver must not stop a
   * reminder being saved — so nothing here waits for the answer.
   */
  function choose(reminder: ReminderSpec) {
    delivery.request();
    onToggle(reminder);
  }

  /**
   * §5: what the row says in brackets is when it actually falls.
   *
   * Through `reminderMoment`, which is also what the 사용자 지정 preview uses
   * (§6.4) — two places computing the same reminder is how they come to
   * disagree about it.
   */
  function momentLabel(spec: ReminderSpec): string | null {
    const moment = reminderMoment(spec, draft);
    return moment === null ? null : formatClock(moment.time, timeFormat, locale);
  }

  function row(label: string, spec: ReminderSpec) {
    const time = momentLabel(spec);
    return time === null ? label : t("schedule.reminder.withTime", { label, time });
  }

  if (builder === "relative") {
    return (
      <ReminderCustom
        draft={draft}
        locale={locale}
        onAdd={(spec) => {
          choose(spec);
          setBuilder(null);
        }}
        onCancel={() => setBuilder(null)}
      />
    );
  }

  const offers = offersFor(draft);
  // §6.13's absolute reminders are not in the offers — they have no preset to
  // match — so they are listed after them, in the order §6.49 asks for.
  const absolutes = sortReminders(
    draft.reminders.filter((reminder) => reminder.type === "absolute"),
    draft,
  );

  function addAbsolute() {
    // The browser hands back `YYYY-MM-DDTHH:mm`, which is the wall-clock shape
    // this domain stores. No zone conversion, deliberately (§26.5).
    if (!absolute) return;
    choose(absoluteSpec(absolute));
    setAbsolute("");
    setBuilder(null);
  }

  return (
    <div className="sched-reminderlist">
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
              onClick={() => choose(spec)}
            >
              <span>{row(t(`schedule.reminder.${offer.id}`), spec)}</span>
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
            onClick={() => choose(reminder)}
          >
            <span>{(reminder.absoluteAt ?? "").replace("T", " ")}</span>
            <span className="sched-check" aria-hidden="true">
              ✓
            </span>
          </button>
        ))}
      </div>

      {/* §6.3: two doors, because they answer two different questions. "How
          long before" and "at what moment" would be one select asking both if
          the absolute one were folded in as a fifth unit. */}
      <div className="sched-reminder-more">
        <button type="button" className="sched-reminder-open" onClick={() => setBuilder("relative")}>
          {t("schedule.reminder.customRelative")}
        </button>

        {builder === "absolute" ? (
          <div className="sched-reminder-custom">
            <label>
              <span>{t("schedule.reminder.custom")}</span>
              <input
                type="datetime-local"
                autoFocus
                value={absolute}
                onChange={(event) => setAbsolute(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addAbsolute();
                }}
              />
            </label>
            <button type="button" onClick={addAbsolute} disabled={!absolute}>
              {t("common.add")}
            </button>
          </div>
        ) : (
          <button type="button" className="sched-reminder-open" onClick={() => setBuilder("absolute")}>
            {t("schedule.reminder.custom")}
          </button>
        )}
      </div>

      {/* §6.40, and §26.6.2's whole point: the reminder above is SAVED. What
          this says is that the OS will not carry it — a different failure,
          with a different fix, and one the user can act on. Absent while the
          answer is `granted` or still `unasked`, because §6.39 does not want a
          warning about a prompt that has not been shown yet. */}
      {delivery.access === "denied" || delivery.access === "unsupported" ? (
        <p className="sched-reminder-notice" role="status">
          {t(`schedule.reminder.${delivery.access}`)}
        </p>
      ) : null}
    </div>
  );
}
