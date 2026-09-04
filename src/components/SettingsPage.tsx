import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarShareState } from "../lib/calendarShare";
import { ConnectedAiCard } from "./oauth/ConnectedAiCard";
import { useNotificationAccess } from "../hooks/useNotificationAccess";
import {
  canAskForNotifications,
  canSendTestNotification,
  notificationHintKey,
} from "../utils/notificationCopy";
import { clampHoursAtATime, HOURS_AT_A_TIME_CHOICES } from "../utils/calendarTime";
import { FOCUS_LENGTH_CHOICES, sanitizeFocusDefaultLength } from "../domain/focus/sessionLength";
import {
  BACKUP_INTERVALS,
  BACKUP_KEEP_CHOICES,
  sanitizeBackupInterval,
  sanitizeBackupKeep,
} from "../domain/backup/schedule";
import type { AutoBackupState } from "../app/useAutoBackup";
import type { FocusUserSettings } from "../lib/focusSettingsStorage";
import { platform } from "../platform";
import type { AppUpdateStatus } from "../platform";
import type { AccentColor, AppSettings, ExternalCalendar, FontSize, Language, Task, ThemeMode } from "../types";
import { CalendarCategorySettings } from "./calendar/CalendarCategorySettings";
import { GoogleCalendarCard } from "./calendar/GoogleCalendarCard";
import { ConfirmModal, SegmentedTabs } from "./kit";
import { useT } from "../i18n";

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  importMessage: string;
  appVersion: string;
  updateStatus: AppUpdateStatus | { status: "checking" } | { status: "installing"; latestVersion?: string };
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
  onSyncAllExternalCalendars: () => void;
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
  onSyncAllExternalCalendars,
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
  const [tab, setTab] = useState<
    | "account"
    | "appearance"
    | "behavior"
    | "notifications"
    | "calendar"
    | "focus"
    | "data"
  >("account");
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

  return (
    <div className="ff-page ff-settings-page">
      {/* Doubles as the window caption on the desktop build (§3.3). */}
      <header className="ff-page-head" data-tauri-drag-region>
        <div>
          <h1 className="ff-page-title">{t("settings.title")}</h1>
          <p className="ff-page-sub">{t("settings.subtitle")}</p>
        </div>
      </header>

      <SegmentedTabs
        tabs={[
          ["account", t("auth.accountTitle")],
          ["appearance", t("settings.tabAppearance")],
          ["behavior", t("settings.tabBehavior")],
          ["notifications", t("settings.tabNotifications")],
          ["calendar", t("settings.tabCalendar")],
          ["focus", t("settings.tabFocus")],
          ["data", t("settings.tabData")],
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "appearance" ? (
        <div className="ff-settings-card">
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
          <SettingsRow title={t("settings.fontSize")} hint={t("settings.fontSizeHint")}>
            <SegmentedTabs
              tabs={[
                ["small", t("settings.fontSmall")],
                ["medium", t("settings.fontMedium")],
                ["large", t("settings.fontLarge")],
              ]}
              active={settings.fontSize}
              onChange={(t) => onUpdate({ fontSize: t as FontSize })}
            />
          </SettingsRow>
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
          {/* SETTINGS_REVIEW.md 4.2 / 4.3. Beside Language because that is what
              they follow — macOS files both under Language & Region. */}
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
        </div>
      ) : null}

      {tab === "behavior" ? (
        <div className="ff-settings-card">
          <SettingsRow title={t("settings.defaultStartPage")} hint={t("settings.defaultStartPageHint")}>
            <select
              // A stored "/planning" has no option of its own any more; showing
              // it as the Board keeps the picker from reading as unset.
              value={settings.defaultView === "/planning" ? "/board" : settings.defaultView}
              onChange={(e) => onUpdate({ defaultView: e.target.value as AppSettings["defaultView"] })}
            >
              <option value="/today">{t("sidebar.today")}</option>
              <option value="/calendar">{t("sidebar.calendar")}</option>
              <option value="/board">{t("sidebar.board")}</option>
              <option value="/focus">{t("sidebar.focus")}</option>
              <option value="/inbox">{t("settings.defaultStartPageInboxOption")}</option>
            </select>
          </SettingsRow>
          {/* `Show completed tasks in Today` stood here. The only screen that
              read it was the Today PAGE, and that page is gone (P0-2). The
              stored field is left alone — an M0 setting is not deleted from
              anyone's account because a screen stopped asking about it — and
              the Tasks Module's own Scopes answer the same question per Scope
              (`⋯ → 완료 숨기기`). */}
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

      {tab === "notifications" ? <NotificationsTab /> : null}

      {tab === "calendar" ? (
        <div className="ff-cal-settings-stack">
          {/* SETTINGS_REVIEW.md 2 and 4.4. The row is here rather than beside
              the time format in Appearance: that pair sits by Language because
              both follow it, and this one follows nothing but the calendar.
              macOS files it the same way — Calendar settings, not Language &
              Region, where it is the General section this card stands in for.

              The head is what §2 was actually about. Four cards in this column
              carry one and this card did not, so a reader scanning titles down
              the tab met them at two different left edges — x=20 here against
              x=72 under an icon. Every card in a column that has any head needs
              one. */}
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
              </div>
            ) : null}
          </section>

          {/* Two-way Google Calendar (GOOGLE_CALENDAR_SYNC_DESIGN.md M1-4d).
              Above the ICS card because it is the same subject done properly:
              that one subscribes to somebody else's calendar and can only
              read, this one writes. It draws itself and finishes the OAuth
              round trip, which is why the callback lands on this page. */}
          <GoogleCalendarCard />

          <section className="ff-settings-card ff-cal-card">
            <div className="ff-cal-card-head">
              <span className="ff-cal-card-icon" aria-hidden="true">
                <GlobeIcon />
              </span>
              <div className="ff-cal-card-text">
                <strong>{t("settings.calendar.externalTitle")}</strong>
                <small>{t("settings.calendar.externalHint")}</small>
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
                  placeholder={t("settings.calendar.namePlaceholder")}
                  onChange={(event) => setCalendarDraft((draft) => ({ ...draft, name: event.target.value }))}
                />
                <input
                  value={calendarDraft.icsUrl}
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

          <section className="ff-settings-card ff-cal-card">
            <div className="ff-cal-card-head">
              <span className="ff-cal-card-icon" aria-hidden="true">
                <SyncIcon />
              </span>
              <div className="ff-cal-card-text">
                <strong>{t("settings.calendar.syncStatus")}</strong>
                <small>
                  {lastExternalSyncedAt
                    ? t("settings.calendar.lastSynced", { time: new Date(lastExternalSyncedAt).toLocaleString() })
                    : t("settings.calendar.noLastSync")}
                </small>
              </div>
              <div className="ff-cal-card-actions">
                <button type="button" className="ff-btn" onClick={onSyncAllExternalCalendars}>
                  {t("settings.calendar.refreshAll")}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "focus" ? (
        <div className="ff-settings-card">
          {/* The one row here that is an AppSettings value. The three below it
              are per-device and stay in their own store; the reader is not
              shown that seam because it is not theirs. */}
          <SettingsRow title={t("settings.focus.defaultLength")} hint={t("settings.focus.defaultLengthHint")}>
            <select
              value={String(settings.focusDefaultMinutes)}
              onChange={(e) => onUpdate({ focusDefaultMinutes: sanitizeFocusDefaultLength(e.target.value) })}
            >
              {FOCUS_LENGTH_CHOICES.map((choice) => (
                <option key={String(choice)} value={String(choice)}>
                  {choice === "auto"
                    ? t("settings.focus.lengthAuto")
                    : t("settings.focus.lengthMinutes", { count: choice })}
                </option>
              ))}
            </select>
          </SettingsRow>
          <Toggle
            label={t("focus.optionTabTitleTimer")}
            hint={t("settings.focus.tabTitleTimerHint")}
            value={focusSettings.showTabTitleTimer}
            onChange={(v) => onUpdateFocusSettings({ showTabTitleTimer: v })}
          />
          <Toggle
            label={t("focus.optionCompletionNotification")}
            hint={t("settings.focus.completionNotificationHint")}
            value={focusSettings.enableCompletionNotification}
            onChange={(v) => onUpdateFocusSettings({ enableCompletionNotification: v })}
          />
          <Toggle
            label={t("focus.optionMiniTimerButton")}
            hint={t("settings.focus.miniTimerButtonHint")}
            value={focusSettings.showMiniTimerButton}
            onChange={(v) => onUpdateFocusSettings({ showMiniTimerButton: v })}
          />
        </div>
      ) : null}

      {tab === "data" ? (
        <>
          {/* SETTINGS_REVIEW.md 4.6. Above export and import because those are
              things the reader does, and this is the one that happens without
              them. The file it writes IS the export format, so the restore path
              is the Import row below — there is no second reader to keep
              correct. */}
          <div className="ff-settings-card">
            <SettingsRow
              title={t("settings.backup.auto")}
              hint={autoBackup.supported ? t("settings.backup.autoHint") : t("settings.backup.desktopOnly")}
            >
              <select
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
            <SettingsRow title={t("settings.resetAllData")} hint={t("settings.resetAllDataHint")}>
              <button type="button" className="ff-btn ff-btn-danger" onClick={onReset}>{t("settings.resetAllData")}</button>
            </SettingsRow>
            {importMessage ? <p className="ff-settings-msg">{importMessage}</p> : null}
          </div>
        </>
      ) : null}

      {/* SETTINGS_REVIEW.md 3.2: signing in used to live under "delete
          everything". It is the first tab now. */}
      {tab === "account" ? (
        <>
          {accountSlot}
          {/* Who else can read this account (§6.4). Beside the account itself,
              because that is what it is about — not a calendar setting and not
              a data-export tool. */}
          <ConnectedAiCard />
          <div className="ff-settings-card">
            <SettingsRow title={t("settings.appInfo")} hint="FocusFlow">
              <strong>{appVersion}</strong>
            </SettingsRow>
            <SettingsRow title={t("settings.checkUpdates")} hint={formatUpdateStatus(updateStatus, t)}>
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
            </SettingsRow>
          </div>
        </>
      ) : null}
    </div>
  );
}

function formatUpdateStatus(
  status: AppUpdateStatus | { status: "checking" } | { status: "installing"; latestVersion?: string },
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
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

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M20 12a8 8 0 11-2.3-5.7" />
      <path d="M20 4v6h-6" />
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
    </div>
  );
}

export function SettingsRow({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="ff-settings-row">
      <div className="ff-settings-row-text">
        <strong>{title}</strong>
        <small>{hint}</small>
      </div>
      <div className="ff-settings-row-control">{children}</div>
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <SettingsRow title={label} hint={hint}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className={`ff-toggle${value ? " on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span className="ff-toggle-knob" />
      </button>
    </SettingsRow>
  );
}
