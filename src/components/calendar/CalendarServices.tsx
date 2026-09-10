import { useState } from "react";
import { useT } from "../../i18n";
import type { CalendarShareState } from "../../lib/calendarShare";
import type { ExternalCalendar } from "../../types";
export interface CalendarServicesProps {
  externalCalendars: ExternalCalendar[];
  onAddExternalCalendar: (input: { name: string; icsUrl: string; color: string }) => void;
  onUpdateExternalCalendar: (calendarId: string, patch: Partial<ExternalCalendar>) => void;
  onDeleteExternalCalendar: (calendarId: string) => void;
  onSyncExternalCalendar: (calendarId: string) => void;
  calendarShare: CalendarShareState;
  onEnableCalendarShare: () => void;
  onDisableCalendarShare: () => void;
  onRegenerateCalendarShare: () => void;
  onPublishCalendarShare: () => void;
  section: "share" | "subscriptions";
}
export function CalendarServices({ externalCalendars, onAddExternalCalendar, onUpdateExternalCalendar, onDeleteExternalCalendar, onSyncExternalCalendar, calendarShare, onEnableCalendarShare, onDisableCalendarShare, onRegenerateCalendarShare, onPublishCalendarShare, section }: CalendarServicesProps) {
  const { t } = useT();
  const [calendarDraft, setCalendarDraft] = useState({ name: "", icsUrl: "", color: "#4f73ff" });
  const [externalFormOpen, setExternalFormOpen] = useState(false);
  const [shareCopyKey, setShareCopyKey] = useState("settings.calendar.copy");
  const shareBusy = calendarShare.status === "loading" || calendarShare.status === "saving";
  const lastExternalSyncedAt = externalCalendars.reduce(
    (latest, calendar) => (calendar.lastSyncedAt && calendar.lastSyncedAt > latest ? calendar.lastSyncedAt : latest),
    "",
  );

  async function copyShareUrl() {
    if (!calendarShare.url) return;
    try {
      await navigator.clipboard.writeText(calendarShare.url);
      setShareCopyKey("settings.calendar.copied");
      window.setTimeout(() => setShareCopyKey("settings.calendar.copy"), 1500);
    } catch {
      setShareCopyKey("settings.calendar.copyFailed");
      window.setTimeout(() => setShareCopyKey("settings.calendar.copy"), 1500);
    }
  }

  return <div className="ff-cal-settings-stack">
          {section === "share" && <section className="ff-settings-card ff-cal-card">
            <div className="ff-cal-card-head">
              <span className="ff-cal-card-icon" aria-hidden="true">
                <ShareIcon />
              </span>
              <div className="ff-cal-card-text">
                <strong>{t("settings.calendar.shareTitle")}</strong>
                <small>{t("settings.calendar.shareHint")}</small>
              </div>
              <div className="ff-cal-card-actions">
                <span className={`ff-cal-chip${calendarShare.enabled ? " on" : ""}`}>
                  {calendarShare.enabled ? t("settings.calendar.shareOn") : t("settings.calendar.shareOff")}
                </span>
                {calendarShare.enabled ? (
                  <button type="button" className="ff-btn" disabled={shareBusy} onClick={onDisableCalendarShare}>
                    {t("settings.calendar.disableShare")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ff-btn ff-btn-primary"
                    disabled={shareBusy || calendarShare.status === "unavailable"}
                    onClick={onEnableCalendarShare}
                  >
                    {t("settings.calendar.createShareLink")}
                  </button>
                )}
              </div>
            </div>
            {calendarShare.status === "unavailable" ? (
              <p className="ff-cal-card-note">{t("settings.calendar.loginRequired")}</p>
            ) : null}
            {calendarShare.error ? <p className="ff-settings-error">{calendarShare.error}</p> : null}
            {calendarShare.enabled ? (
              <div className="ff-calendar-share-panel">
                {calendarShare.url ? (
                  <div className="ff-calendar-share-url">
                    <input value={calendarShare.url} readOnly aria-label={t("settings.calendar.subscriptionAria")} />
                    <button type="button" className="ff-btn" onClick={copyShareUrl}>
                      {t(shareCopyKey)}
                    </button>
                  </div>
                ) : null}
                <details className="ff-settings-details"><summary>{t("settings.shareManagement")}</summary>
                <div className="ff-calendar-share-actions">
                  <small className="ff-cal-card-note">
                    {calendarShare.updatedAt
                      ? t("settings.calendar.lastUpdated", { time: new Date(calendarShare.updatedAt).toLocaleString() })
                      : t("settings.calendar.neverPublished")}
                  </small>
                  <button
                    type="button"
                    className="ff-btn"
                    disabled={shareBusy || !calendarShare.token}
                    onClick={onPublishCalendarShare}
                  >
                    {t("settings.calendar.updateNow")}
                  </button>
                  <button type="button" className="ff-btn ff-btn-danger" disabled={shareBusy} onClick={onRegenerateCalendarShare}>
                    {t("settings.calendar.regenerateLink")}
                  </button>
                </div>
                </details>
              </div>
            ) : null}
          </section>}

          {section === "subscriptions" && <section className="ff-settings-card ff-cal-card">
            <div className="ff-cal-card-head">
              <span className="ff-cal-card-icon" aria-hidden="true">
                <GlobeIcon />
              </span>
              <div className="ff-cal-card-text">
                <strong>{t("settings.calendar.externalTitle")}</strong>
                <small>
                  {externalCalendars.length === 0
                    ? t("settings.calendar.externalHint")
                    : lastExternalSyncedAt
                      ? t("settings.calendar.lastSynced", { time: new Date(lastExternalSyncedAt).toLocaleString() })
                      : t("settings.calendar.noLastSync")}
                </small>
              </div>
              <div className="ff-cal-card-actions">
                <button
                  type="button"
                  className="ff-btn ff-cal-btn-outline"
                  aria-expanded={externalFormOpen}
                  onClick={() => setExternalFormOpen((open) => !open)}
                >
                  {t("settings.calendar.addExternal")}
                </button>
              </div>
            </div>
            {externalFormOpen ? (
              <div className="ff-external-calendar-form">
                <input
                  value={calendarDraft.name}
                  aria-label={t("settings.calendar.namePlaceholder")}
                  placeholder={t("settings.calendar.namePlaceholder")}
                  onChange={(event) => setCalendarDraft((draft) => ({ ...draft, name: event.target.value }))}
                />
                <input
                  value={calendarDraft.icsUrl}
                  aria-label={t("settings.subscriptionUrl")}
                  placeholder="https://.../calendar.ics"
                  onChange={(event) => setCalendarDraft((draft) => ({ ...draft, icsUrl: event.target.value }))}
                />
                <input
                  type="color"
                  value={calendarDraft.color}
                  aria-label={t("settings.calendar.colorAria")}
                  onChange={(event) => setCalendarDraft((draft) => ({ ...draft, color: event.target.value }))}
                />
                <button
                  type="button"
                  className="ff-btn"
                  disabled={!calendarDraft.name.trim() || !calendarDraft.icsUrl.trim()}
                  onClick={() => {
                    onAddExternalCalendar(calendarDraft);
                    setCalendarDraft({ name: "", icsUrl: "", color: "#4f73ff" });
                    setExternalFormOpen(false);
                  }}
                >
                  {t("common.add")}
                </button>
              </div>
            ) : null}
            {externalCalendars.length > 0 ? (
              <div className="ff-external-calendar-list">
                {externalCalendars.map((calendar) => (
                  <article key={calendar.id} className="ff-external-calendar-item">
                    <span className="ff-external-dot" style={{ background: calendar.color }} />
                    <div>
                      <strong>{calendar.name}</strong>
                      <small>
                        {calendar.syncStatus === "syncing"
                          ? t("settings.calendar.syncing")
                          : calendar.syncStatus === "failed"
                            ? t("settings.calendar.syncFailed", { error: calendar.lastError ? `: ${calendar.lastError}` : "" })
                            : calendar.enabled
                              ? t("settings.calendar.normalCount", { count: calendar.eventCount ?? 0 })
                              : t("settings.calendar.disabled")}
                      </small>
                      <small>
                        {calendar.lastSyncedAt
                          ? t("settings.calendar.lastSynced", { time: new Date(calendar.lastSyncedAt).toLocaleString() })
                          : t("settings.calendar.notSynced")}
                      </small>
                    </div>
                    <div className="ff-external-calendar-actions">
                      <button type="button" className="ff-btn" onClick={() => onUpdateExternalCalendar(calendar.id, { visible: !calendar.visible })}>
                        {calendar.visible ? t("settings.calendar.hide") : t("settings.calendar.show")}
                      </button>
                      <button type="button" className="ff-btn" onClick={() => onUpdateExternalCalendar(calendar.id, { enabled: !calendar.enabled })}>
                        {calendar.enabled ? t("settings.calendar.disable") : t("settings.calendar.enable")}
                      </button>
                      <button type="button" className="ff-btn" disabled={!calendar.enabled} onClick={() => onSyncExternalCalendar(calendar.id)}>
                        {t("settings.calendar.refreshNow")}
                      </button>
                      <button type="button" className="ff-btn ff-btn-danger" onClick={() => onDeleteExternalCalendar(calendar.id)}>
                        {t("common.delete")}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>}
  </div>;
}
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="17" cy="6" r="2.4" />
      <circle cx="17" cy="18" r="2.4" />
      <path d="M8.2 10.9l6.6-3.8M8.2 13.1l6.6 3.8" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.5 4 5.6 4 9s-1.4 6.5-4 9c-2.6-2.5-4-5.6-4-9s1.4-6.5 4-9z" />
    </svg>
  );
}

