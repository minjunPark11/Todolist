import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type { CalendarShareState } from "../lib/calendarShare";
import { ConnectedAiCard } from "./oauth/ConnectedAiCard";
import { useNotificationAccess } from "../hooks/useNotificationAccess";
import {
  canAskForNotifications,
  canSendTestNotification,
  notificationHintKey,
} from "../utils/notificationCopy";
import { clampHoursAtATime, HOURS_AT_A_TIME_CHOICES } from "../utils/calendarTime";
import { detectTimezone } from "../domain/plannerData/normalize";
import { listTimezones, timezoneChoicePatch, timezoneLabel } from "../domain/plannerData/timezones";
import { TimezonePicker } from "./TimezonePicker";
import {
  BACKUP_INTERVALS,
  BACKUP_KEEP_CHOICES,
  sanitizeBackupInterval,
  sanitizeBackupKeep,
} from "../domain/backup/schedule";
import type { AutoBackupState } from "../app/useAutoBackup";
import { initialSettingsTab, type SettingsTab } from "../app/settingsTab";
import { SettingsNavigation } from "./settings/SettingsNavigation";
import { LocalTaskReviewPanel } from "./settings/LocalTaskReviewPanel";
import { readPendingConnect } from "../lib/googleCalendar";
import { parseCallback } from "../domain/calendar/googleSync/connectFlow";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import { platform } from "../platform";
import type { SettingsUpdateStatus } from "../platform";
import type { AccentColor, AppSettings, ExternalCalendar, Language, Task, ThemeMode } from "../types";
import { CalendarCategorySettings } from "./calendar/CalendarCategorySettings";
import { GoogleCalendarCard } from "./calendar/GoogleCalendarCard";
import { SegmentedTabs } from "./kit";
import { useT } from "../i18n";

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  importMessage: string;
  appVersion: string;
  updateStatus: SettingsUpdateStatus;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  accountSlot: ReactNode;
  tasks: Task[];
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
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
  /**
   * The three that live in their own local store, not in `AppSettings`
   * (SETTINGS_REVIEW.md 4.5). They are about this device — a browser tab title,
   * an OS notification, a desktop-only window — so they stay unsynced. What
   * moves here is where they are found, not where they are kept.
   */
  focusSettings: FocusUserSettings;
  onUpdateFocusSettings: (patch: Partial<FocusUserSettings>) => void;
  /** SETTINGS_REVIEW.md 4.6 — the runner's state, so Data can report it. */
  autoBackup: AutoBackupState;
}

const ACCENTS: { id: AccentColor; color: string }[] = [
  { id: "blue", color: "#007aff" },
  { id: "purple", color: "#af52de" },
  { id: "green", color: "#34c759" },
  { id: "orange", color: "#ff9500" },
  { id: "pink", color: "#ff2d55" },
];

export function SettingsPage({
  settings,
  onUpdate,
  onExport,
  onImport,
  onReset,
  importMessage,
  appVersion,
  updateStatus,
  onCheckUpdate,
  onInstallUpdate,
  accountSlot,
  tasks,
  onUpdateTask,
  externalCalendars,
  onAddExternalCalendar,
  onUpdateExternalCalendar,
  onDeleteExternalCalendar,
  onSyncExternalCalendar,
  calendarShare,
  onEnableCalendarShare,
  onDisableCalendarShare,
  onRegenerateCalendarShare,
  onPublishCalendarShare,
  focusSettings,
  onUpdateFocusSettings,
  autoBackup,
}: SettingsPageProps) {
  const { t, lang } = useT();
  /* General, unless the app sent the reader here to finish something. The one
     case is the Google consent round trip: it lands on this page and the card
     that spends the code is drawn under Calendar, so opening on Account left
     the connection hanging on a tab click nothing asked for. */
  const [tab, setTab] = useState<SettingsTab>(() =>
    initialSettingsTab({
      href: typeof window === "undefined" ? null : window.location.href,
      pendingConnect: typeof window === "undefined" ? null : readPendingConnect(),
    }),
  );
  useEffect(() => {
    const onReturn = () => {
      if (parseCallback(window.location.href)) setTab("connections");
    };
    window.addEventListener("hashchange", onReturn);
    return () => window.removeEventListener("hashchange", onReturn);
  }, []);
  const [calendarDraft, setCalendarDraft] = useState({ name: "", icsUrl: "", color: "#4f73ff" });
  const [externalFormOpen, setExternalFormOpen] = useState(false);
  const [shareCopyKey, setShareCopyKey] = useState("settings.calendar.copy");
  const shareBusy = calendarShare.status === "loading" || calendarShare.status === "saving";
  /* Only a build with an installer has an update to install. */
  const updatesSupported = platform.kind === "desktop";
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

  return (
    <div className="ff-page ff-settings-page">
      <header className="ff-page-head" data-tauri-drag-region>
        <div>
          <h1 className="ff-page-title">{t("settings.title")}</h1>
          <p className="ff-page-sub">{t("settings.subtitle")}</p>
        </div>
      </header>

      <div className="ff-settings-layout">
        <SettingsNavigation active={tab} onChange={setTab} />
        <div className="ff-settings-content" id={`settings-panel-${tab}`} role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
          <h2 className="ff-settings-section-title">{t(`settings.nav.${tab}`)}</h2>

      {tab === "general" ? (
        <div className="ff-settings-card">
          <h3>{t("settings.groupAppearance")}</h3>
          <SettingsRow title={t("settings.theme")} hint={t("settings.themeHint")}>
            <SegmentedTabs
              tabs={[
                ["light", t("settings.themeLight")],
                ["dark", t("settings.themeDark")],
                ["system", t("settings.themeSystem")],
              ]}
              active={settings.theme}
              onChange={(t) => onUpdate({ theme: t as ThemeMode })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.accentColor")} hint={t("settings.accentColorHint")}>
            <div className="ff-color-row">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`ff-color-swatch${settings.accentColor === a.id ? " active" : ""}`}
                  style={{ background: a.color }}
                  aria-label={a.id}
                  onClick={() => onUpdate({ accentColor: a.id as AccentColor })}
                />
              ))}
            </div>
          </SettingsRow>
          <h3 className="ff-settings-group-heading">{t("settings.groupRegion")}</h3>
          <SettingsRow title={t("settings.language")} hint={t("settings.languageHint")}>
            <SegmentedTabs
              tabs={[
                ["ko", t("settings.languageKo")],
                ["en", t("settings.languageEn")],
              ]}
              active={settings.language}
              onChange={(t) => onUpdate({ language: t as Language })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.timeFormat")} hint={t("settings.timeFormatHint")}>
            <SegmentedTabs
              tabs={[
                ["locale", t("settings.timeFormatLocale")],
                ["12h", t("settings.timeFormat12")],
                ["24h", t("settings.timeFormat24")],
              ]}
              active={settings.timeFormat}
              onChange={(value) => onUpdate({ timeFormat: value })}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.weekStart")} hint={t("settings.weekStartHint")}>
            <SegmentedTabs
              tabs={[
                ["sunday", t("settings.weekStartSunday")],
                ["monday", t("settings.weekStartMonday")],
              ]}
              active={settings.weekStart}
              onChange={(value) => onUpdate({ weekStart: value })}
            />
          </SettingsRow>
          <TimezoneRow settings={settings} onUpdate={onUpdate} />
        </div>
      ) : null}

      {tab === "general" ? (
        <div className="ff-settings-card">
          <h3>{t("settings.groupBehavior")}</h3>
          <SettingsRow title={t("settings.defaultStartPage")} hint={t("settings.defaultStartPageHint")}>
            <select
              // A stored "/planning" has no option of its own any more; showing
              // it as the Board keeps the picker from reading as unset.
              aria-label={t("settings.defaultStartPage")}
              value={settings.defaultView === "/planning" ? "/board" : settings.defaultView}
              onChange={(e) => onUpdate({ defaultView: e.target.value as AppSettings["defaultView"] })}
            >
              <option value="/today">{t("sidebar.today")}</option>
              <option value="/calendar">{t("sidebar.calendar")}</option>
              <option value="/board">{t("sidebar.board")}</option>
              <option value="/focus">{t("sidebar.focus")}</option>
              <option value="/inbox">{t("tasks.inbox")}</option>
            </select>
          </SettingsRow>
          <Toggle
            label={t("settings.confirmBeforeDelete")}
            hint={t("settings.confirmBeforeDeleteHint")}
            value={settings.confirmBeforeDelete}
            onChange={(v) => onUpdate({ confirmBeforeDelete: v })}
          />
          <Toggle
            label={t("settings.reduceMotion")}
            hint={t("settings.reduceMotionHint")}
            value={settings.reduceMotion}
            onChange={(v) => onUpdate({ reduceMotion: v })}
          />
        </div>
      ) : null}

      {tab === "notifications" ? <>
        <div className="ff-settings-card">
          <Toggle
            label={t("focus.optionCompletionNotification")}
            hint={t("settings.focus.completionNotificationHint")}
            value={focusSettings.enableCompletionNotification}
            onChange={(v) => onUpdateFocusSettings({ enableCompletionNotification: v })}
          />
        </div>
        <NotificationsTab />
      </> : null}

      {tab === "connections" ? (
        <div className="ff-cal-settings-stack">
          <GoogleCalendarCard
            onOpenDeviceReview={() => setTab("account")}
            timezone={settings.timezone}
            // Manual, because it is: the reader named this zone rather than
            // letting the device speak for them, and the refresh effect would
            // otherwise put the device's back on the next start — leaving the
            // calendar pinned to a zone the account no longer claims.
            onTimezoneChange={(zone) => onUpdate({ timezoneMode: "manual", timezone: zone })}
          />
          <section className="ff-settings-card ff-cal-card">
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
          </section>

          <section className="ff-settings-card ff-cal-card">
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
          </section>
          <details className="ff-settings-card ff-settings-details"><summary>{t("settings.connectedAi")}</summary><ConnectedAiCard /></details>
        </div>
      ) : null}

      {tab === "general" ? (
        <details className="ff-settings-card ff-settings-details">
          <summary>{t("settings.focusDisplay")}</summary>
          {platform.kind === "web" ? (
            <Toggle
              label={t("focus.optionTabTitleTimer")}
              hint={t("settings.focus.tabTitleTimerHint")}
              value={focusSettings.showTabTitleTimer}
              onChange={(v) => onUpdateFocusSettings({ showTabTitleTimer: v })}
            />
          ) : null}

          <Toggle
            label={t("focus.optionMiniTimerButton")}
            hint={t("settings.focus.miniTimerButtonHint")}
            value={focusSettings.showMiniTimerButton}
            onChange={(v) => onUpdateFocusSettings({ showMiniTimerButton: v })}
          />
        </details>
      ) : null}

      {tab === "general" && <details className="ff-settings-card ff-settings-details ff-settings-display">
        <summary>{t("settings.calendarDisplay")}</summary>
          <section className="ff-settings-card ff-cal-card">
            <div className="ff-cal-card-head">
              <span className="ff-cal-card-icon" aria-hidden="true">
                <ClockIcon />
              </span>
              <div className="ff-cal-card-text">
                <strong>{t("settings.calendar.generalTitle")}</strong>
                <small>{t("settings.calendar.generalHint")}</small>
              </div>
            </div>
            <SettingsRow title={t("settings.calendar.hoursAtATime")} hint={t("settings.calendar.hoursAtATimeHint")}>
              <select
                aria-label={t("settings.calendar.hoursAtATime")}
                value={settings.hoursAtATime}
                onChange={(e) => onUpdate({ hoursAtATime: clampHoursAtATime(e.target.value) })}
              >
                {HOURS_AT_A_TIME_CHOICES.map((hours) => (
                  <option key={hours} value={hours}>
                    {t("settings.calendar.hoursOption", { count: hours })}
                  </option>
                ))}
              </select>
            </SettingsRow>
          </section>

          <section className="ff-settings-card ff-cal-card">
            <CalendarCategorySettings
              externalCalendars={externalCalendars}
              onUpdateExternalCalendar={onUpdateExternalCalendar}
            />
          </section>
      </details>}

      {tab === "data" ? (
        <>
          <div className="ff-settings-card">
            <SettingsRow
              title={t("settings.backup.auto")}
              hint={autoBackup.supported ? t("settings.backup.autoHint") : t("settings.backup.desktopOnly")}
            >
              <select
                aria-label={t("settings.backup.auto")}
                value={settings.autoBackup}
                disabled={!autoBackup.supported}
                onChange={(e) => onUpdate({ autoBackup: sanitizeBackupInterval(e.target.value) })}
              >
                {BACKUP_INTERVALS.map((value) => (
                  <option key={value} value={value}>
                    {t(`settings.backup.interval.${value}`)}
                  </option>
                ))}
              </select>
            </SettingsRow>
            {autoBackup.supported && settings.autoBackup !== "off" ? (
              <SettingsRow title={t("settings.backup.keep")} hint={t("settings.backup.keepHint")}>
                <select
                  aria-label={t("settings.backup.keep")}
                  value={settings.autoBackupKeep}
                  onChange={(e) => onUpdate({ autoBackupKeep: sanitizeBackupKeep(e.target.value) })}
                >
                  {BACKUP_KEEP_CHOICES.map((count) => (
                    <option key={count} value={count}>
                      {t("settings.backup.keepCount", { count })}
                    </option>
                  ))}
                </select>
              </SettingsRow>
            ) : null}
            {autoBackup.supported ? (
              <SettingsRow
                title={t("settings.backup.last")}
                hint={
                  autoBackup.error
                    ? t("settings.backup.failed", { reason: autoBackup.error })
                    : autoBackup.lastAt
                      ? new Date(autoBackup.lastAt).toLocaleString(lang)
                      : t("settings.backup.never")
                }
              >
                <div className="ff-settings-actions">
                  <button type="button" className="ff-btn" onClick={() => void platform.backups.reveal()}>
                    {t("settings.backup.openFolder")}
                  </button>
                  <button
                    type="button"
                    className="ff-btn ff-btn-primary"
                    disabled={autoBackup.running}
                    onClick={() => void autoBackup.backupNow()}
                  >
                    {autoBackup.running ? t("settings.backup.running") : t("settings.backup.now")}
                  </button>
                </div>
              </SettingsRow>
            ) : null}
          </div>

          <div className="ff-settings-card">
            <SettingsRow title={t("settings.exportData")} hint={t("settings.exportDataHint")}>
              <button type="button" className="ff-btn" onClick={onExport}>{t("settings.exportJson")}</button>
            </SettingsRow>
            <SettingsRow title={t("settings.importData")} hint={t("settings.importDataHint")}>
              <label className="ff-btn ff-import-btn">
                {t("settings.importJson")}
                <input type="file" accept="application/json" onChange={onImport} hidden />
              </label>
            </SettingsRow>

            {importMessage ? <p className="ff-settings-msg">{importMessage}</p> : null}
          </div>
          <details className="ff-settings-card ff-settings-details ff-settings-danger">
            <summary>{t("settings.dangerZone")}</summary>
            <SettingsRow title={t("settings.resetAllData")} hint={t("settings.resetAllDataHint")}>
              <button type="button" className="ff-btn ff-btn-danger" onClick={onReset}>{t("settings.resetAllData")}</button>
            </SettingsRow>
          </details>
        </>
      ) : null}
      {tab === "account" ? (
        <>
          {accountSlot}
          <LocalTaskReviewPanel />
        </>
      ) : null}
      {tab === "about" ? (
        <>

          <div className="ff-settings-card">
            <SettingsRow title={t("settings.appInfo")} hint="FocusFlow">
              <strong>{appVersion}</strong>
            </SettingsRow>
            {updatesSupported && <>
            <SettingsRow
              title={t("settings.checkUpdates")}
              hint={updatesSupported ? formatUpdateStatus(updateStatus, t) : t("settings.updateWebOnly")}
            >
              {updatesSupported ? (
                <div className="ff-settings-actions">
                  {updateStatus.status === "available" ? (
                    <button type="button" className="ff-btn ff-btn-primary" onClick={onInstallUpdate}>
                      {t("settings.installUpdate")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ff-btn"
                    onClick={onCheckUpdate}
                    disabled={updateStatus.status === "checking" || updateStatus.status === "installing"}
                  >
                    {t("settings.checkUpdates")}
                  </button>
                </div>
              ) : null}
            </SettingsRow>
            </>}
          </div>
        </>
      ) : null}
        </div>
      </div>
    </div>
  );
}

function formatUpdateStatus(
  status: SettingsUpdateStatus,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  // Nothing runs at boot any more (`<UpdateChecker />` is the startup check),
  // so the row's first words are the truth: it has not looked yet.
  if (status.status === "idle") return t("settings.updateIdle");
  if (status.status === "checking") return t("settings.updateChecking");
  if (status.status === "installing") return t("settings.updateInstalling");
  if (status.status === "available") return t("settings.updateAvailable", { version: status.latestVersion });
  if (status.status === "current") return t("settings.updateCurrent", { version: status.latestVersion ?? "" });
  return status.message ? `${t("settings.updateUnavailable")} ${status.message}` : t("settings.updateUnavailable");
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

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" />
    </svg>
  );
}

/**
 * Whether reminders can actually arrive, and a way to find out.
 *
 * SETTINGS_REVIEW.md 4.1: `notificationAccess` has four answers and the app had
 * nowhere to show any of them. The one that mattered was `denied` — the hook
 * will not ask twice (a second request is a no-op in every browser), so a user
 * who dismissed the prompt once had no route back from inside the app.
 *
 * The test row exists because permission is not the whole path. A granted
 * permission with notifications muted at the OS level looks identical from
 * here, and `platform.notify` returning true while nothing appears is the only
 * way to tell the two apart.
 */
function NotificationsTab() {
  const { t } = useT();
  const { access, request } = useNotificationAccess();
  const [testResult, setTestResult] = useState("");

  return (
    <div className="ff-settings-card">
      <SettingsRow title={t("settings.notif.permission")} hint={t(notificationHintKey(access))}>
        {canAskForNotifications(access) ? (
          <button type="button" className="ff-btn ff-btn-primary" onClick={request}>
            {t("settings.notif.allow")}
          </button>
        ) : null}
      </SettingsRow>
      <details className="ff-settings-details"><summary>{t("settings.notificationTroubleshooting")}</summary>
      <SettingsRow title={t("settings.notif.testTitle")} hint={testResult || t("settings.notif.testHint")}>
        <button
          type="button"
          className="ff-btn"
          disabled={!canSendTestNotification(access)}
          onClick={async () => {
            const sent = await platform.notify({
              title: t("settings.notif.testSample"),
              body: t("settings.notif.testBody"),
            });
            setTestResult(t(sent ? "settings.notif.testSent" : "settings.notif.testFailed"));
          }}
        >
          {t("settings.notif.send")}
        </button>
      </SettingsRow>
      </details>
    </div>
  );
}

/**
 * A settings row.
 *
 * `children` is optional because §11.5 left one row with nothing to press: the
 * local-data notice says a thing is waiting and the next sync merges it, so
 * the row is the sentence and not a control. An empty control box would still
 * claim its column, so it is not drawn at all.
 */
/**
 * Which zone this account's wall-clock times are read in.
 *
 * A select and not a segmented control for the obvious reason, and its first
 * option is the automatic one rather than a checkbox beside the list: "follow
 * the device" and "always Asia/Seoul" are two answers to one question, and
 * splitting them across two controls makes the second one look editable while
 * the first is on.
 *
 * What this does NOT reach is Google sync. That zone is pinned per connection
 * at bind time and refuses to be re-bound to a different one (025 line 57,
 * 026 line 42); the hint says so rather than letting a reader conclude from a
 * settings screen that their calendar has been fixed.
 *
 * Exported for its own test. It is the only screen this feature has, and the
 * part worth proving — that a manual account's select shows the zone it holds
 * rather than falling back to "Automatic" — is a fact about the option list
 * and the value together, which neither half proves alone.
 */
export function TimezoneRow({ settings, onUpdate }: { settings: AppSettings; onUpdate: (patch: Partial<AppSettings>) => void }) {
  const { t } = useT();
  const manual = settings.timezoneMode === "manual";
  const detected = detectTimezone();
  // The list is four hundred options and the offsets only move on a DST
  // boundary, so it is built once per mount rather than per render. `detected`
  // and the stored value are folded in so the selection is always showable.
  const options = useMemo(() => [
    {
      value: "auto",
      label: detected ? t("settings.timezoneAutoNamed").replace("{zone}", detected) : t("settings.timezoneAuto"),
    },
    ...listTimezones([settings.timezone, detected]).map((zone) => ({ value: zone, label: timezoneLabel(zone) })),
  ], [settings.timezone, detected, t]);
  return (
    <SettingsRow title={t("settings.timezone")} hint={t("settings.timezoneHint")}>
      <TimezonePicker
        value={manual ? settings.timezone : "auto"}
        options={options}
        label={t("settings.timezone")}
        onChange={(value) => onUpdate(timezoneChoicePatch(value, detected))}
      />
    </SettingsRow>
  );
}

export function SettingsRow({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return (
    <div className="ff-settings-row">
      <div className="ff-settings-row-text">
        <strong>{title}</strong>
        <small>{hint}</small>
      </div>
      {children === undefined ? null : <div className="ff-settings-row-control">{children}</div>}
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <SettingsRow title={label} hint={hint}>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={value}
        className={`ff-toggle${value ? " on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span className="ff-toggle-knob" />
      </button>
    </SettingsRow>
  );
}
