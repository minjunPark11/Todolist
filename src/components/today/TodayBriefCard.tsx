import { useT } from "../../i18n";

export type PlanStatus = "idle" | "planning" | "preview" | "applied" | "error";

interface TodayBriefCardProps {
  focusCount: number;
  blockCount: number;
  overdueCount: number;
  inboxCount: number;
  planStatus: PlanStatus;
  onPlanToday: () => void;
  onViewCalendar: () => void;
}

export function TodayBriefCard({
  focusCount,
  blockCount,
  overdueCount,
  inboxCount,
  planStatus,
  onPlanToday,
  onViewCalendar,
}: TodayBriefCardProps) {
  const { t } = useT();

  // Rule-based summary sentence, priority order per spec §27.
  let hint: string;
  if (overdueCount > 0) {
    hint = t("todayv.briefOverdue", { n: overdueCount });
  } else if (focusCount === 0) {
    hint = t("todayv.briefNoTasks");
  } else if (blockCount === 0) {
    hint = t("todayv.briefOpenDay");
  } else if (inboxCount > 0) {
    hint = t("todayv.briefInbox", { n: inboxCount });
  } else {
    hint = t("todayv.briefHigh");
  }

  const planLabel =
    planStatus === "planning"
      ? t("todayv.planning")
      : planStatus === "applied"
        ? t("todayv.replan")
        : planStatus === "error"
          ? t("todayv.planTryAgain")
          : t("todayv.planToday");

  return (
    <section className="tdy-card tdy-brief">
      <div className="tdy-brief-icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
        </svg>
      </div>
      <div className="tdy-brief-body">
        <h2>{t("todayv.briefTitle")}</h2>
        <p className="tdy-brief-summary">
          {t("todayv.briefCounts", { tasks: focusCount, blocks: blockCount })}
        </p>
        <p className="tdy-brief-hint">{hint}</p>
        <div className="tdy-brief-actions">
          <button
            type="button"
            className="tdy-btn tdy-btn-navy"
            aria-label={t("todayv.planTodayAria")}
            disabled={planStatus === "planning"}
            onClick={onPlanToday}
          >
            {planLabel}
          </button>
          <button
            type="button"
            className="tdy-btn tdy-btn-light"
            aria-label={t("todayv.viewCalendarAria")}
            onClick={onViewCalendar}
          >
            {t("todayv.viewCalendar")}
          </button>
        </div>
        {planStatus === "error" ? (
          <p className="tdy-brief-error">{t("todayv.planError")}</p>
        ) : null}
      </div>
    </section>
  );
}
