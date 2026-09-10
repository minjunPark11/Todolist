import { useSyncExternalStore } from "react";
import { useT } from "../../i18n";
import { readGoogleTaskSyncState, subscribeGoogleTaskSync } from "../../lib/googleTaskSyncState";
import "../calendar/googleTaskReview.css";

/** Device conflicts belong to the account, even without a Google connection. */
export function LocalTaskReviewPanel() {
  const state = useSyncExternalStore(subscribeGoogleTaskSync, readGoogleTaskSyncState, readGoogleTaskSyncState);
  const { t } = useT();
  if (!state.enabled) return null;
  const count = state.localConflicts?.length ?? 0;
  return <section className="ff-settings-card ff-device-review" aria-label={t("settings.deviceReview")} aria-busy={state.busy}>
    <h3>{t("settings.deviceReview")} <span>({count})</span></h3>
    <p role="status" className="ff-settings-note">{t(count ? "settings.deviceReviewNeeded" : "settings.deviceReviewClear", { count })}</p>
    {count > 0 && <p className="ff-settings-note">{t("googleTask.policy")}</p>}
    {state.error === "changed" && count > 0 && <p role="alert">{t("googleTask.changed")}</p>}
    {state.localConflicts?.map(conflict => <details className="ff-google-review-item" key={conflict.id}>
      <summary>{conflict.local?.title ?? conflict.remote?.data.title ?? t("googleTask.untitled")} — {t("googleTask.deviceConflict")}</summary>
      <p>{t("googleTask.wholeTask")}</p>
      <div className="ff-google-review-versions">
        {[conflict.local, conflict.remote?.data].map((task, index) => <div key={index}><strong>{t(index === 0 ? "googleTask.local" : "googleTask.saved")}</strong>
          <p>{task?.title ?? t("googleTask.deleted")}</p><p>{task ? [task.dueDate, task.startTime, task.endTime].filter(Boolean).join(" · ") : ""}</p><pre>{task?.description}</pre></div>)}
      </div>
      <div className="ff-google-review-actions">
        <button type="button" className="ff-btn" disabled={state.busy} onClick={() => void state.resolveLocal?.(conflict, !conflict.remote && conflict.local ? "copy" : "local")}>{t(!conflict.remote && conflict.local ? "googleTask.copy" : "googleTask.useApp")}</button>
        <button type="button" className="ff-btn" disabled={state.busy} onClick={() => void state.resolveLocal?.(conflict, "remote")}>{t("googleTask.useSaved")}</button>
      </div>
    </details>)}
    {state.autoMergedCount !== undefined && <details className="ff-settings-details">
      <summary>{t("settings.syncDetails")}</summary>
    <p role="status" aria-atomic="true" className="ff-settings-note">
      {state.autoMergedCount !== undefined && t("googleTask.mergeSummary", {
        count: state.autoMergedCount, remaining: state.localConflicts?.length ?? 0,
      })}
    </p>
    </details>}
  </section>;
}
