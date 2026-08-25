// §25.7's history surface, opened from the Detail's More menu.
//
// Inside the Detail rather than in a floating layer of its own. A popover has
// to be anchored to the control that opened it, and that control is a menu row
// that has already gone by the time this appears (§19.90 closes the surface
// before the action runs) — so it would hang off the ⋯ and cover the panel it
// is describing. Here it is a section at the top of the Detail's scroll area,
// which is where the reader is already looking.
//
// What it can say is bounded by what the store keeps; `domain/tasks/activity`
// carries that note. It is a list of things that were written down at the
// time, not a reconstruction.
import { useEffect, useRef } from "react";
import type { TaskActivityEntry } from "../../domain/tasks/activity";
import { useT } from "../../i18n";

export interface TaskActivityPanelProps {
  entries: TaskActivityEntry[];
  onClose: () => void;
  /** Reset the panel's own state — and its focus — on a Task switch (§1.26). */
  taskId: string;
}

export function TaskActivityPanel({ entries, onClose, taskId }: TaskActivityPanelProps) {
  const { t, lang } = useT();
  const heading = useRef<HTMLHeadingElement>(null);

  /**
   * Focus lands on the heading when the panel opens.
   *
   * The menu row that opened it is gone, so `FloatingMenu`'s restoration puts
   * focus back on the ⋯ — which is above this and says nothing about it. A
   * keyboard reader would be told a menu closed and never that anything
   * appeared.
   */
  useEffect(() => {
    heading.current?.focus();
  }, [taskId]);

  const when = new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="tm-drawer-activity" aria-label={t("tasks.menu.activities")}>
      <header>
        <h3 ref={heading} tabIndex={-1}>
          {t("tasks.menu.activities")}
        </h3>
        <button type="button" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>
      </header>

      <ol>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span className="tm-activity-what">
              {t(`tasks.activity.${entry.kind}`, { detail: entry.detail ?? "" })}
            </span>
            {/* A machine-readable value beside the human one: the formatted
                string is the reader's locale and says nothing a screen reader
                or a copy-paste can use. */}
            <time dateTime={entry.at}>{when.format(new Date(entry.at))}</time>
          </li>
        ))}
      </ol>

      {/* Never empty in practice — every Task has a `createdAt` — but a record
          written before that field existed would otherwise draw an empty list
          with no explanation. */}
      {entries.length === 0 ? <p>{t("tasks.activity.empty")}</p> : null}
    </section>
  );
}
