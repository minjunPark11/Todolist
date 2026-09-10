import { useState, useSyncExternalStore } from "react";
import { useT } from "../../i18n";
import { readGoogleTaskSyncState, subscribeGoogleTaskSync } from "../../lib/googleTaskSyncState";
import type { GoogleTaskChoice } from "../../lib/googleTaskCoordinator";
import { toTaskInboundFields } from "../../domain/calendar/googleSync/taskInboundShape";
import { toTaskSharedPatch } from "../../domain/calendar/googleSync/taskOutboundPlan";
import { sameRecurrence, taskRecurrence } from "../../domain/calendar/googleSync/taskRecurrence";
import "./googleTaskReview.css";

function RepeatDescription({ rules, timezone }: { rules: unknown; timezone: string }) {
  const { t, lang } = useT();
  const lines: string[] = Array.isArray(rules) ? rules.filter((r): r is string => typeof r === "string") : [];
  if (!lines.length) return <p>{t("googleTask.noRepeat")}</p>;
  const first = lines.find(r=>r.startsWith("RRULE:"));
  const parts: Record<string, string> = Object.fromEntries((first?.slice(6).split(";") ?? []).map(p=>p.split("=")));
  const frequencies: Record<string, string> = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" };
  const frequency = frequencies[parts.FREQ];
  const weekdays = parts.BYDAY?.split(",").map(d => {
    const index = ["SU","MO","TU","WE","TH","FR","SA"].indexOf(d);
    return index < 0 ? d : new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026,0,4+index)));
  }).join(", ");
  let until = parts.UNTIL;
  if (/^\d{8}$/.test(until ?? "")) until = `${until.slice(0,4)}-${until.slice(4,6)}-${until.slice(6,8)}`;
  else if (/^\d{8}T\d{6}Z$/.test(until ?? "")) {
    const stamp = `${until.slice(0,4)}-${until.slice(4,6)}-${until.slice(6,8)}T${until.slice(9,11)}:${until.slice(11,13)}:${until.slice(13,15)}Z`;
    if (Number.isFinite(Date.parse(stamp))) until = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: timezone }).format(new Date(stamp));
  }
  return <><p>{frequency ? t(`googleTask.repeat.${frequency}`, { count: parts.INTERVAL || 1 }) : t("googleTask.customRepeat")}
    {weekdays && ` · ${weekdays}`}{until && ` · ${t("googleTask.until", { date: until })}`}</p>
    {lines.length > 1 && <p>{t("googleTask.extraRepeat")}</p>}
    <details><summary>{t("googleTask.ruleDetails")}</summary><pre>{lines.join("\n")}</pre></details></>;
}

export function GoogleTaskReviewPanel() {
  const state = useSyncExternalStore(subscribeGoogleTaskSync, readGoogleTaskSyncState, readGoogleTaskSyncState);
  const { t } = useT(); const [limit, setLimit] = useState(30);
  if (!state.enabled) return null;
  const snapshot = state.snapshot;
  const reviews = snapshot?.records.filter(r => r.decision.kind === "review" || r.decision.kind === "conflict" || r.decision.reason === "excluded") ?? [];
  const skips = snapshot?.records.filter(r => r.decision.kind === "skip" && !["excluded", "already-trashed", "cancelled-unmapped", "deleted"].includes(String(r.decision.reason))) ?? [];
  const transfers = snapshot ? [...snapshot.tasks].filter(([id, row]) => snapshot.historicalTaskIds.has(id) && !row.data.deletedAt &&
    !snapshot.snapshots.some(s => s.taskId === id && s.eventId) && !["abandoned", "given_up"].includes(String(row.data.status))) : [];
  const repeatChanges = snapshot?.records.filter(r => {
    const mapped = snapshot.snapshots.find(s => s.eventId === r.eventId && s.state === "active");
    const row = mapped && snapshot.tasks.get(mapped.taskId);
    const rule = row && taskRecurrence(row.data, snapshot.timezone);
    return mapped && row && rule && !sameRecurrence(rule, r.source.recurrence) && r.decision.kind === "acknowledge";
  }) ?? [];
  const localSkips = snapshot ? [...snapshot.tasks].filter(([id, row]) => {
    const item = snapshot.snapshots.find(s => s.taskId === id);
    return !row.data.deletedAt && row.data.dueDate && item && (!toTaskSharedPatch(item.fields, snapshot.timezone) ||
      taskRecurrence(row.data, snapshot.timezone) === null || (!item.eventId && row.data.googleEventId && !snapshot.historicalTaskIds.has(id)));
  }) : [];
  return <section className="ff-google-review" aria-label={t("googleTask.title")} aria-busy={state.busy}>
    <h4>{t("googleTask.title")} <span>({reviews.filter(r => r.decision.reason !== "excluded").length + repeatChanges.length + transfers.length
      + (state.occurrenceConflicts?.length ?? 0)})</span></h4>
    <p className="ff-settings-note">{t("googleTask.policy")}</p>
    {state.error && <p role="alert">{t(state.error === "changed" ? "googleTask.changed" : "googleTask.failed")}</p>}
    {/* Not an alert and not tied to `error`: the pass that found these
        finished, and everything it did not name was sent. Each one is a
        separate occurrence a person has to reconcile in both calendars. */}
    {state.occurrenceConflicts?.map(conflict => (
      <p role="status" key={`${conflict.title}\u0000${conflict.date}`} className="ff-settings-note">
        {t("googleTask.occurrenceChanged", conflict)}
      </p>
    ))}
    <button className="ff-btn ff-cal-btn-outline" type="button" disabled={state.busy} onClick={() => void state.run?.()}>{t(state.busy ? "googleTask.busy" : "googleTask.refresh")}</button>
    {snapshot?.operations.map(op => <div key={String(op.operation_id)} className="ff-google-review-item">
      <p role="status">{t("googleTask.pending")}</p>
      <button type="button" className="ff-btn" disabled={state.busy} onClick={() => void state.run?.()}>{t("googleTask.recheck")}</button>
      {op.state === "reserved" && <button type="button" className="ff-btn" disabled={state.busy} onClick={() => void state.cancel?.(String(op.operation_id))}>{t("googleTask.cancel")}</button>}
    </div>)}
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
    {!reviews.length && !state.localConflicts?.length && !state.pending && !localSkips.length && !repeatChanges.length && !transfers.length && snapshot && <p role="status">{t("googleTask.clear")}</p>}
    {!!transfers.length && <details className="ff-google-review-item"><summary>{t("googleTask.transferTitle", { count: transfers.length })}</summary>
      <p>{t("googleTask.transferNote", { calendar: snapshot!.scope.calendarId })}</p>
      {transfers.slice(0, limit).map(([id, row]) => {
        const mapped = snapshot!.snapshots.find(s => s.taskId === id)!;
        const supported = !!toTaskSharedPatch(mapped.fields, snapshot!.timezone) && taskRecurrence(row.data, snapshot!.timezone) !== null;
        return <div key={id}><p>{String(row.data.title || t("googleTask.untitled"))}</p>
          <button type="button" className="ff-btn" disabled={state.busy || state.pending || !supported} onClick={() => void state.run?.({
            choice: "transfer", taskId: id, taskRevision: row.revision, eventId: "", recordRevision: 0, source: {}, generation: snapshot!.scope.connectionGeneration,
          })}>{t("googleTask.transfer")}</button>{!supported && <p>{t("googleTask.localUnsupported")}</p>}</div>;
      })}</details>}
    {repeatChanges.slice(0, limit).map(record => {
      const mapped = snapshot!.snapshots.find(s => s.eventId === record.eventId)!;
      const rule = taskRecurrence(snapshot!.tasks.get(mapped.taskId)!.data, snapshot!.timezone)!;
      return <details key={`repeat-${record.eventId}`} className="ff-google-review-item">
        <summary>{mapped.fields.title} — {t("googleTask.repeatTitle")}</summary><p>{t("googleTask.repeatNote")}</p>
        <div className="ff-google-review-versions"><div><strong>{t("googleTask.local")}</strong><RepeatDescription rules={rule} timezone={snapshot!.timezone} /></div>
          <div><strong>{t("googleTask.remote")}</strong><RepeatDescription rules={record.source.recurrence} timezone={snapshot!.timezone} /></div></div>
        <button type="button" className="ff-btn" disabled={state.busy || state.pending} onClick={() => void state.run?.({ choice: "recurrence",
          eventId: record.eventId, recordRevision: record.revision, taskRevision: mapped.revision, source: record.source, generation: snapshot!.scope.connectionGeneration,
        })}>{t("googleTask.applyRepeat")}</button>
      </details>;
    })}
    {!!localSkips.length && <details><summary>{t("googleTask.localSkipped", { count: localSkips.length })}</summary>
      <p>{t("googleTask.localUnsupported")}</p><ul>{localSkips.slice(0, limit).map(([id, row]) => <li key={id}>{String(row.data.title || t("googleTask.untitled"))}</li>)}</ul></details>}
    {reviews.slice(0, limit).map(record => {
      const task = snapshot!.snapshots.find(s => s.eventId === record.eventId);
      const remote = toTaskInboundFields(record.source, snapshot!.timezone);
      const isConflict = record.decision.kind === "conflict", excluded = record.decision.reason === "excluded";
      const restored = record.decision.reason === "remote-restored" || task?.state === "trashed";
      const choose = (choice: GoogleTaskChoice["choice"]) => void state.run?.({ choice, eventId: record.eventId,
        generation: snapshot!.scope.connectionGeneration, recordRevision: record.revision, taskRevision: task?.revision, source: record.source });
      return <details key={record.eventId} className="ff-google-review-item">
        <summary>{String(record.source.summary || t("googleTask.untitled"))} — {t(isConflict ? "googleTask.conflict" : excluded ? "googleTask.excluded" : restored ? "googleTask.restored" : "googleTask.duplicate")}</summary>
        <div className="ff-google-review-versions">
          {task && <div><strong>{t("googleTask.local")}</strong><p>{task.fields.title}</p><p>{[task.fields.startDate, task.fields.dueDate, task.fields.startTime, task.fields.endTime].filter(Boolean).join(" · ")}</p><pre>{task.fields.description}</pre></div>}
          <div><strong>{t("googleTask.remote")}</strong><p>{String(record.source.summary || t("googleTask.untitled"))}</p>
            <p>{remote.ok ? [remote.fields.startDate, remote.fields.dueDate, remote.fields.startTime, remote.fields.endTime].filter(Boolean).join(" · ") : t("googleTask.unsupported")}</p>
            <pre>{String(record.source.description || "")}</pre></div>
        </div>
        <div className="ff-google-review-actions">
          {isConflict ? <>
            <button type="button" className="ff-btn" disabled={state.busy || state.pending} onClick={() => choose("app")}>{t("googleTask.useApp")}</button>
            <button type="button" className="ff-btn" disabled={state.busy || state.pending || !remote.ok} onClick={() => choose("google")}>{t("googleTask.useGoogle")}</button>
          </> : <>
            <button type="button" className="ff-btn" disabled={state.busy || state.pending || !remote.ok} onClick={() => choose(restored ? "restore" : "import")}>{t(restored ? "googleTask.restore" : "googleTask.import")}</button>
            {!excluded && <button type="button" className="ff-btn" disabled={state.busy || state.pending} onClick={() => choose("exclude")}>{t(restored ? "googleTask.keepTrash" : "googleTask.exclude")}</button>}
          </>}
        </div><p className="ff-settings-note">{t("googleTask.later")}</p>
      </details>;
    })}
    {Math.max(reviews.length, transfers.length, repeatChanges.length, localSkips.length, skips.length) > limit && <button type="button" className="ff-btn" onClick={() => setLimit(limit + 30)}>{t("googleTask.more")}</button>}
    {!!skips.length && <details><summary>{t("googleTask.skipped", { count: skips.length })}</summary>
      <p>{t("googleTask.unsupported")}</p><ul>{skips.slice(0, limit).map(r => <li key={r.eventId}>{String(r.source.summary || t("googleTask.untitled"))}</li>)}</ul></details>}
  </section>;
}
