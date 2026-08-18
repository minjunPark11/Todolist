// The 알림 and 반복 subpanels (design §8, §9).
//
// One component for both, because they are the same interaction: a titled list
// of mutually exclusive choices, the current one ticked. Writing them twice
// would give the app two answers to how a chosen row looks, and the second
// would drift the first time either panel was touched.
//
// The choices themselves are NOT here — the caller passes them, because which
// reminders are offered depends on the draft (`availableReminders`) and that
// is a domain question, not a layout one.
import { useT } from "../../i18n";

interface ChoicePanelProps<T extends string> {
  title: string;
  options: readonly T[];
  value: T;
  /** Label for one option, by key. */
  label: (option: T) => string;
  onChoose: (option: T) => void;
  onBack: () => void;
}

export function ChoicePanel<T extends string>({
  title,
  options,
  value,
  label,
  onChoose,
  onBack,
}: ChoicePanelProps<T>) {
  const { t } = useT();

  return (
    <div className="sched-panel">
      <div className="sched-panel-head">
        <button type="button" className="sched-panel-back" onClick={onBack} aria-label={t("schedule.back")}>
          ‹
        </button>
        <span className="sched-panel-title">{title}</span>
        <span className="sched-panel-spacer" />
      </div>

      {/* A radiogroup rather than a list of buttons: one of these is always in
          force, and a screen reader should say which — "없음, selected" rather
          than announcing six unrelated controls. */}
      <div className="sched-choices" role="radiogroup" aria-label={title}>
        {options.map((option) => (
          <button
            type="button"
            key={option}
            role="radio"
            aria-checked={option === value}
            className={option === value ? "sched-choice is-active" : "sched-choice"}
            // Choosing does not leave the panel. Someone comparing "10분 전"
            // with "1시간 전" should be able to try both, and a panel that
            // closed on the first press would make the second a fresh trip.
            onClick={() => onChoose(option)}
          >
            <span>{label(option)}</span>
            {option === value ? <span className="sched-check" aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
