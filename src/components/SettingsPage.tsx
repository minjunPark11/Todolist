import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarShareState } from "../lib/calendarShare";
import {
  SERVER_RUNTIME_DOWNLOAD_ID,
  cancelModelDownload,
  cancelServerRuntimeInstall,
  deleteInstalledModel,
  isModelDownloadable,
  isServerRuntimeOutdated,
  resolveServerRuntimeForPlatform,
} from "../lib/localAi/installer";
import {
  getLocalAiDownloadSessionSnapshot,
  startTrackedModelDownload,
  startTrackedServerRuntimeInstall,
  subscribeLocalAiDownloadSession,
} from "../lib/localAi/downloadSession";
import { LOCAL_MODEL_CATALOG, findModelById } from "../lib/localAi/modelCatalog";
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
import { installedFileMatchesModel } from "../lib/localAi/runtime";
import type { ServerRuntimeAsset } from "../lib/localAi/serverRuntimeCatalog";
import { recommendLocalModel } from "../lib/localAi/recommender";
import { useLocalAiSettings } from "../lib/localAi/settings";
import type {
  HardwareProfile,
  InstalledModelFile,
  LocalAiLaunchMode,
  LocalModelOption,
} from "../lib/localAi/types";
import { listEmbeddingModelChoices, resolveEmbeddingStoreModelName } from "../lib/knowledge/embeddingProvider";
import { EmbeddingModelUnavailableError, runIndexing, type IndexProgress } from "../lib/knowledge/indexer";
import { clearTurnLog, isTurnLogEnabled, setTurnLogEnabled, turnLogCount } from "../lib/ai/memory/turnLog";
import { KnowledgeStore, type IndexStats } from "../lib/knowledge/knowledgeStore";
import type { KnowledgeSettings } from "../lib/knowledge/types";
import { platform } from "../platform";
import type { AppUpdateStatus } from "../platform";
import type { AccentColor, AppSettings, ExternalCalendar, FontSize, Language, Task, ThemeMode } from "../types";
import { CalendarCategorySettings } from "./calendar/CalendarCategorySettings";
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
  knowledgeSettings: KnowledgeSettings;
  onUpdateKnowledgeSettings: (patch: Partial<KnowledgeSettings>) => void;
  isKnowledgeDesktop: boolean;
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
  knowledgeSettings,
  onUpdateKnowledgeSettings,
  isKnowledgeDesktop,
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
    | "knowledge"
    | "localAi"
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
      <header className="ff-page-head">
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
          ["knowledge", t("settings.tabKnowledge")],
          ["localAi", t("settings.tabLocalAi")],
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
          <Toggle
            label={t("settings.showCompletedTasks")}
            hint={t("settings.showCompletedTasksHint")}
            value={settings.showCompletedInToday}
            onChange={(v) => onUpdate({ showCompletedInToday: v })}
          />
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
              tasks={tasks}
              onUpdateTask={onUpdateTask}
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

      {tab === "knowledge" ? (
        <KnowledgeSettingsTab
          settings={knowledgeSettings}
          updateSettings={onUpdateKnowledgeSettings}
          isDesktop={isKnowledgeDesktop}
        />
      ) : null}

      {tab === "localAi" ? <LocalAiSettingsTab /> : null}

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

function KnowledgeSettingsTab({
  settings,
  updateSettings,
  isDesktop,
}: {
  settings: KnowledgeSettings;
  updateSettings: (patch: Partial<KnowledgeSettings>) => void;
  isDesktop: boolean;
}) {
  const { t } = useT();
  const [pickError, setPickError] = useState("");
  const [picking, setPicking] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [deleteIndexOnDisconnect, setDeleteIndexOnDisconnect] = useState(true);

  const [embeddingChoices, setEmbeddingChoices] = useState<string[]>([]);
  const [expectedEmbeddingModel, setExpectedEmbeddingModel] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [indexStats, setIndexStats] = useState<IndexStats | null>(null);
  const [storedEmbeddingModel, setStoredEmbeddingModel] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [indexMessage, setIndexMessage] = useState("");
  const [indexError, setIndexError] = useState("");
  const cancelRequestedRef = useRef(false);

  const vaultReady = isDesktop && settings.enabled && Boolean(settings.vaultPath);

  async function loadInstalledModels() {
    setModelsLoading(true);
    try {
      const [choices, expected] = await Promise.all([
        listEmbeddingModelChoices(),
        resolveEmbeddingStoreModelName(settings.embeddingModel),
      ]);
      setEmbeddingChoices(choices);
      setExpectedEmbeddingModel(expected);
    } finally {
      setModelsLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const store = await KnowledgeStore.open(settings.dbPath);
      try {
        setIndexStats(await store.getStats());
        setStoredEmbeddingModel(await store.getMeta("embedding_model"));
      } finally {
        await store.close();
      }
    } catch {
      setIndexStats(null);
      setStoredEmbeddingModel(null);
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    if (!vaultReady) return;
    void loadInstalledModels();
    void loadStats();
    // Re-run when the vault becomes ready/connected or the embedding model
    // choice changes (the resolved store-model name depends on it), not on
    // every keystroke of unrelated settings fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultReady, settings.embeddingModel]);

  // Null after loading means the configured route can't embed right now —
  // e.g. no Local AI model installed for "auto", or the selected GGUF file
  // was deleted from the models directory.
  const modelInstalled = expectedEmbeddingModel !== null;
  const reindexNeeded =
    vaultReady &&
    settings.indexingMode === "full" &&
    !statsLoading &&
    ((indexStats?.chunkCount ?? 0) === 0 ||
      (storedEmbeddingModel !== null && expectedEmbeddingModel !== null && storedEmbeddingModel !== expectedEmbeddingModel));

  async function handlePickFolder() {
    setPickError("");
    setPicking(true);
    try {
      const picked = await platform.files.pickFolder();
      if (picked) {
        updateSettings({ vaultPath: picked, enabled: true });
      }
    } catch (error) {
      setPickError(error instanceof Error ? error.message : t("settings.knowledge.pickFailed"));
    } finally {
      setPicking(false);
    }
  }

  async function handleIndexNow() {
    if (!vaultReady || indexing) return;
    setIndexError("");
    setIndexMessage("");
    cancelRequestedRef.current = false;
    setIndexing(true);
    setIndexProgress({ phase: "scanning", processed: 0, total: 0 });

    let store: KnowledgeStore | null = null;
    try {
      store = await KnowledgeStore.open(settings.dbPath);
      const result = await runIndexing(store, {
        vaultPath: settings.vaultPath,
        excludedFolders: settings.excludedFolders,
        embeddingModel: settings.embeddingModel,
        onProgress: setIndexProgress,
        shouldCancel: () => cancelRequestedRef.current,
      });

      if (result.cancelled) {
        setIndexMessage(t("settings.knowledge.indexCancelled"));
      } else {
        const summary = t("settings.knowledge.indexResult", {
          indexed: result.filesIndexed,
          deleted: result.filesDeleted,
          unchanged: result.filesUnchanged,
        });
        setIndexMessage(result.modelChanged ? `${summary} ${t("settings.knowledge.modelChangedNotice")}` : summary);
      }
      setIndexStats(await store.getStats());
      setStoredEmbeddingModel(await store.getMeta("embedding_model"));
    } catch (error) {
      if (error instanceof EmbeddingModelUnavailableError) {
        setIndexError(t("settings.knowledge.modelPullHint", { model: error.modelName }));
      } else {
        setIndexError(error instanceof Error ? error.message : t("settings.knowledge.indexFailed"));
      }
    } finally {
      if (store) await store.close();
      setIndexing(false);
      setIndexProgress(null);
    }
  }

  function handleCancelIndexing() {
    cancelRequestedRef.current = true;
  }

  async function confirmDisconnect() {
    if (deleteIndexOnDisconnect) {
      try {
        const store = await KnowledgeStore.open(settings.dbPath);
        try {
          await store.wipeAll();
        } finally {
          await store.close();
        }
      } catch {
        // Nothing to wipe if the store was never created — best-effort.
      }
    }
    updateSettings({ vaultPath: "", enabled: false, lastIndexedAt: "" });
    setDisconnectConfirmOpen(false);
    setIndexStats(null);
    setStoredEmbeddingModel(null);
  }

  if (!isDesktop) {
    return (
      <div className="ff-settings-card ff-knowledge-locked">
        <SettingsRow title={t("settings.knowledge.title")} hint={t("settings.knowledge.desktopOnly")}>
          <span className="ff-knowledge-badge">{t("settings.knowledge.desktopOnlyBadge")}</span>
        </SettingsRow>
      </div>
    );
  }

  return (
    <>
    <div className="ff-settings-card">
      <SettingsRow title={t("settings.knowledge.vaultTitle")} hint={t("settings.knowledge.vaultHint")}>
        <div className="ff-knowledge-vault-control">
          {settings.vaultPath ? (
            <>
              <span className="ff-knowledge-path" title={settings.vaultPath}>
                {settings.vaultPath}
              </span>
              <button type="button" className="ff-btn" onClick={handlePickFolder} disabled={picking}>
                {t("settings.knowledge.changeFolder")}
              </button>
              <button type="button" className="ff-btn ff-btn-danger" onClick={() => setDisconnectConfirmOpen(true)}>
                {t("settings.knowledge.disconnect")}
              </button>
            </>
          ) : (
            <button type="button" className="ff-btn ff-btn-primary" onClick={handlePickFolder} disabled={picking}>
              {t("settings.knowledge.pickFolder")}
            </button>
          )}
        </div>
      </SettingsRow>

      {pickError ? <p className="ff-settings-error">{pickError}</p> : null}

      {settings.vaultPath ? (
        <>
          <Toggle
            label={t("settings.knowledge.enable")}
            hint={t("settings.knowledge.enableHint")}
            value={settings.enabled}
            onChange={(value) => updateSettings({ enabled: value })}
          />
          {settings.enabled ? (
            <SettingsRow title={t("settings.knowledge.modeTitle")} hint={t("settings.knowledge.modeHint")}>
              <SegmentedTabs
                tabs={[
                  ["lite", t("settings.knowledge.modeLite")],
                  ["full", t("settings.knowledge.modeFull")],
                ]}
                active={settings.indexingMode}
                onChange={(mode) => updateSettings({ indexingMode: mode })}
              />
            </SettingsRow>
          ) : null}
          {reindexNeeded ? <p className="ff-settings-error">{t("settings.knowledge.reindexNeeded")}</p> : null}
          <p className="ff-knowledge-privacy-note">{t("settings.knowledge.privacyNote")}</p>
        </>
      ) : null}

      {disconnectConfirmOpen ? (
        <ConfirmModal
          title={t("settings.knowledge.disconnectTitle")}
          body={
            <>
              <p>{t("settings.knowledge.disconnectBody")}</p>
              <label className="ff-knowledge-delete-index-toggle">
                <input
                  type="checkbox"
                  checked={deleteIndexOnDisconnect}
                  onChange={(event) => setDeleteIndexOnDisconnect(event.target.checked)}
                />
                <span>
                  <strong>{t("settings.knowledge.deleteIndexOnDisconnect")}</strong>
                  <small>{t("settings.knowledge.deleteIndexOnDisconnectHint")}</small>
                </span>
              </label>
            </>
          }
          confirmLabel={t("settings.knowledge.disconnectConfirm")}
          onCancel={() => setDisconnectConfirmOpen(false)}
          onConfirm={confirmDisconnect}
        />
      ) : null}
    </div>

    {vaultReady ? (
      <div className="ff-settings-card">
        <SettingsRow title={t("settings.knowledge.embeddingModel")} hint={t("settings.knowledge.embeddingModelHint")}>
          <div className="ff-knowledge-model-control">
            <select
              value={settings.embeddingModel}
              onChange={(event) => updateSettings({ embeddingModel: event.target.value })}
              disabled={modelsLoading}
            >
              <option value="local-ai">{t("settings.knowledge.localAiEmbedding")}</option>
              {embeddingChoices.map((fileName) => (
                <option key={fileName} value={fileName}>
                  {fileName}
                </option>
              ))}
              {settings.embeddingModel !== "local-ai" && !embeddingChoices.includes(settings.embeddingModel) ? (
                // Keep a stale saved choice visible (and re-selectable away
                // from) instead of letting the select silently show nothing.
                <option value={settings.embeddingModel}>
                  {t("settings.knowledge.embeddingModelMissingOption", { model: settings.embeddingModel })}
                </option>
              ) : null}
            </select>
            <button
              type="button"
              className="ff-btn"
              aria-label={t("ai.model.refresh")}
              onClick={() => void loadInstalledModels()}
              disabled={modelsLoading}
            >
              {modelsLoading ? "…" : "↻"}
            </button>
          </div>
          {!modelsLoading && !modelInstalled ? (
            <small className="ff-settings-error">
              {settings.embeddingModel === "local-ai"
                ? t("settings.knowledge.modelPullHint", { model: settings.embeddingModel })
                : t("settings.knowledge.embeddingFileMissingHint")}
            </small>
          ) : null}
        </SettingsRow>

        <SettingsRow title={t("settings.knowledge.indexStatus")} hint="">
          <div className="ff-knowledge-index-status">
            {statsLoading ? (
              <span>…</span>
            ) : (
              <span>
                {t("settings.knowledge.indexStatusValue", {
                  files: indexStats?.fileCount ?? 0,
                  chunks: indexStats?.chunkCount ?? 0,
                })}
                {" · "}
                {indexStats?.lastIndexedAt
                  ? t("settings.knowledge.lastIndexed", { date: new Date(indexStats.lastIndexedAt).toLocaleString() })
                  : t("settings.knowledge.neverIndexed")}
              </span>
            )}
          </div>
        </SettingsRow>

        <div className="ff-knowledge-index-actions">
          {indexing ? (
            <>
              <button type="button" className="ff-btn ff-btn-danger" onClick={handleCancelIndexing}>
                {t("settings.knowledge.cancelIndexing")}
              </button>
              <span className="ff-knowledge-index-progress">
                {indexProgress?.phase === "scanning"
                  ? t("settings.knowledge.indexScanning")
                  : indexProgress
                    ? t("settings.knowledge.indexProgress", {
                        processed: indexProgress.processed,
                        total: indexProgress.total,
                        file: indexProgress.currentFile ?? "",
                      })
                    : ""}
              </span>
              {indexProgress && indexProgress.total > 0 ? (
                <progress className="ff-knowledge-progress-bar" value={indexProgress.processed} max={indexProgress.total} />
              ) : null}
            </>
          ) : (
            <button type="button" className="ff-btn ff-btn-primary" onClick={() => void handleIndexNow()}>
              {t("settings.knowledge.indexNow")}
            </button>
          )}
        </div>

        {indexMessage ? <p className="ff-knowledge-index-message">{indexMessage}</p> : null}
        {indexError ? <p className="ff-settings-error">{indexError}</p> : null}
      </div>
    ) : null}
    </>
  );
}

// Local AI setup tab (LOCAL_AI_SYSTEM_DESIGN.md §9). Self-contained on
// purpose: local AI settings live in device-local storage (useLocalAiSettings),
// so nothing here needs to flow through SettingsPage props / appSettings.
function useLocalAiDownloadSession() {
  const [downloadSession, setDownloadSession] = useState(getLocalAiDownloadSessionSnapshot);

  useEffect(() => {
    return subscribeLocalAiDownloadSession(() => {
      setDownloadSession(getLocalAiDownloadSessionSnapshot());
    });
  }, []);

  return downloadSession;
}

function LocalAiSettingsTab() {
  const { t } = useT();
  const { settings, updateSettings, isDesktop } = useLocalAiSettings();
  const [profile, setProfile] = useState<HardwareProfile | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [installedModels, setInstalledModels] = useState<InstalledModelFile[]>([]);
  const [modelsDir, setModelsDir] = useState("");
  const downloadSession = useLocalAiDownloadSession();
  const [localActionError, setLocalActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<InstalledModelFile | null>(null);
  const [serverInstalled, setServerInstalled] = useState<boolean | null>(null);
  const [runtimeOutdated, setRuntimeOutdated] = useState(false);
  const [runtimeAsset, setRuntimeAsset] = useState<ServerRuntimeAsset | null>(null);
  const handledDownloadResultRef = useRef(0);

  const recommendation = useMemo(() => (profile ? recommendLocalModel(profile, t) : null), [profile, t]);
  const selectedModel = findModelById(settings.selectedModelId);
  const downloadingId = downloadSession.downloadingId;
  const downloadProgress = downloadSession.progress;
  const downloadError = downloadSession.error || localActionError;
  const downloadResultMessage = downloadSession.result
    ? downloadSession.result.outcome === "completed"
      ? downloadSession.result.kind === "runtime"
        ? t("settings.localAi.runtimeInstalled")
        : t("settings.localAi.downloadComplete")
      : t("settings.localAi.downloadCancelled")
    : "";
  const modelDownloadMessage =
    downloadSession.result?.kind === "model" && downloadSession.result.id === selectedModel?.id ? downloadResultMessage : "";
  const runtimeDownloadMessage = downloadSession.result?.kind === "runtime" ? downloadResultMessage : "";
  const installingRuntime = downloadingId === SERVER_RUNTIME_DOWNLOAD_ID;

  async function refreshInstalledModels() {
    try {
      setInstalledModels(await platform.localAi.listInstalledModels());
    } catch {
      // Desktop-only call; leave the last known list on failure.
    }
  }

  useEffect(() => {
    if (!isDesktop) return;
    void platform.localAi.getModelsDir().then(setModelsDir).catch(() => undefined);
    void platform.localAi.isServerInstalled().then(setServerInstalled).catch(() => setServerInstalled(false));
    void isServerRuntimeOutdated().then(setRuntimeOutdated).catch(() => setRuntimeOutdated(false));
    void resolveServerRuntimeForPlatform().then(setRuntimeAsset).catch(() => setRuntimeAsset(null));
    void refreshInstalledModels();

    // Mount-only setup (plus the desktop gate); refresh is triggered
    // explicitly after downloads/deletes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  useEffect(() => {
    const result = downloadSession.result;
    if (!isDesktop || !result || handledDownloadResultRef.current === result.completedAt) return;
    handledDownloadResultRef.current = result.completedAt;
    if (result.kind === "runtime" && result.outcome === "completed") {
      setServerInstalled(true);
      setRuntimeOutdated(false);
    }
    void refreshInstalledModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadSession.result, isDesktop]);

  function handleDownload(model: LocalModelOption) {
    setLocalActionError("");
    startTrackedModelDownload(model);
  }

  function handleInstallRuntime() {
    setLocalActionError("");
    startTrackedServerRuntimeInstall();
  }

  async function confirmDeleteModel() {
    if (!deleteTarget) return;
    setLocalActionError("");
    try {
      await deleteInstalledModel(deleteTarget.fileName);
    } catch (error) {
      setLocalActionError(error instanceof Error ? error.message : String(error));
    }
    setDeleteTarget(null);
    await refreshInstalledModels();
  }

  async function handleScan() {
    setScanError("");
    setScanning(true);
    // Clicking the scan button IS the consent required by design principle 5;
    // no hardware query ever runs before this moment.
    updateSettings({ hardwareConsentGrantedAt: new Date().toISOString() });
    try {
      setProfile(await platform.localAi.getHardwareProfile());
    } catch (error) {
      setScanError(error instanceof Error ? error.message : t("settings.localAi.scanFailed"));
    } finally {
      setScanning(false);
    }
  }

  function isModelInstalled(modelId: string) {
    const model = findModelById(modelId);
    return Boolean(model && installedModels.some((file) => installedFileMatchesModel(file.fileName, model)));
  }

  const launchHintKey: Record<LocalAiLaunchMode, string> = {
    "on-demand": "settings.localAi.launchOnDemandHint",
    "on-app-start": "settings.localAi.launchOnStartHint",
    external: "settings.localAi.launchExternalHint",
  };

  return (
    <>
      <div className="ff-settings-card">
        <div className="ff-localai-intro">
          <strong>{t("settings.localAi.introTitle")}</strong>
          <small>{t("settings.localAi.introHint")}</small>
        </div>
        <div className="ff-localai-intro-actions">
          {isDesktop ? (
            <button type="button" className="ff-btn ff-btn-primary" onClick={() => void handleScan()} disabled={scanning}>
              {scanning
                ? t("settings.localAi.scanning")
                : profile
                  ? t("settings.localAi.rescanButton")
                  : t("settings.localAi.scanButton")}
            </button>
          ) : (
            <span className="ff-knowledge-badge">{t("settings.knowledge.desktopOnlyBadge")}</span>
          )}
        </div>
        {!isDesktop ? <p className="ff-knowledge-privacy-note">{t("settings.localAi.desktopOnly")}</p> : null}
        {scanError ? <p className="ff-settings-error">{scanError}</p> : null}
        <p className="ff-knowledge-privacy-note">{t("settings.localAi.privacyNote")}</p>
      </div>

      {profile && recommendation ? (
        <div className="ff-settings-card">
          <SettingsRow title={t("settings.localAi.resultTitle")} hint="">
            <span />
          </SettingsRow>
          <SettingsRow title={t("settings.localAi.resultOs")} hint="">
            <span className="ff-knowledge-index-status">{`${profile.os} (${profile.arch})`}</span>
          </SettingsRow>
          <SettingsRow title={t("settings.localAi.resultCpu")} hint="">
            <span className="ff-knowledge-index-status">{t("settings.localAi.resultCores", { cores: profile.cpuCoreCount })}</span>
          </SettingsRow>
          <SettingsRow title={t("settings.localAi.resultRam")} hint="">
            <span className="ff-knowledge-index-status">
              {profile.totalRamGb !== null
                ? t("settings.localAi.sizeGb", { size: profile.totalRamGb })
                : t("settings.localAi.unknown")}
            </span>
          </SettingsRow>
          <SettingsRow title={t("settings.localAi.resultDisk")} hint="">
            <span className="ff-knowledge-index-status">
              {profile.availableDiskGb !== null
                ? t("settings.localAi.sizeGb", { size: profile.availableDiskGb })
                : t("settings.localAi.unknown")}
            </span>
          </SettingsRow>
          <SettingsRow title={t("settings.localAi.resultGpu")} hint="">
            <span className="ff-knowledge-index-status">{profile.gpu?.name ?? t("settings.localAi.gpuNotDetected")}</span>
          </SettingsRow>

          <p className="ff-localai-reason">{recommendation.reason}</p>
          {recommendation.warnings.length > 0 ? (
            <ul className="ff-localai-warnings">
              {recommendation.warnings.map((warning) => (
                <li key={warning}>⚠️ {warning}</li>
              ))}
            </ul>
          ) : null}

          <div className="ff-localai-model-list">
            <LocalAiModelItem
              model={recommendation.primary}
              badge={t("settings.localAi.recommendedModel")}
              selected={settings.selectedModelId === recommendation.primary.id}
              installed={isModelInstalled(recommendation.primary.id)}
              onSelect={() => updateSettings({ selectedModelId: recommendation.primary.id })}
            />
            {recommendation.alternatives.map((model) => (
              <LocalAiModelItem
                key={model.id}
                model={model}
                selected={settings.selectedModelId === model.id}
                installed={isModelInstalled(model.id)}
                onSelect={() => updateSettings({ selectedModelId: model.id })}
              />
            ))}
          </div>
        </div>
      ) : null}

      {!profile ? (
        <div className="ff-settings-card">
          <SettingsRow title={t("settings.localAi.catalogTitle")} hint={t("settings.localAi.catalogHint")}>
            <span />
          </SettingsRow>
          <div className="ff-localai-model-list">
            {LOCAL_MODEL_CATALOG.map((model) => (
              <LocalAiModelItem
                key={model.id}
                model={model}
                selected={settings.selectedModelId === model.id}
                installed={isModelInstalled(model.id)}
                onSelect={() => updateSettings({ selectedModelId: model.id })}
              />
            ))}
          </div>
        </div>
      ) : null}

      {selectedModel && (!isModelInstalled(selectedModel.id) || modelDownloadMessage || downloadError) ? (
        <div className="ff-settings-card">
          <SettingsRow
            title={selectedModel.displayName}
            hint={
              isModelDownloadable(selectedModel)
                ? t("settings.localAi.modelMeta", {
                    size: selectedModel.estimatedSizeGb,
                    minRam: selectedModel.minRamGb,
                    recommendedRam: selectedModel.recommendedRamGb,
                  })
                : t("settings.localAi.downloadSoon")
            }
          >
            {isModelInstalled(selectedModel.id) ? (
              <span className="ff-localai-chip on">{t("settings.localAi.installedBadge")}</span>
            ) : downloadingId === selectedModel.id ? (
              <button
                type="button"
                className="ff-btn ff-btn-danger"
                onClick={() => void cancelModelDownload(selectedModel.id)}
              >
                {t("settings.localAi.downloadCancel")}
              </button>
            ) : (
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                disabled={!isDesktop || Boolean(downloadingId) || !isModelDownloadable(selectedModel)}
                onClick={() => void handleDownload(selectedModel)}
              >
                {downloadError ? t("settings.localAi.downloadRetry") : t("settings.localAi.downloadButton")}
              </button>
            )}
          </SettingsRow>
          {downloadingId === selectedModel.id && downloadProgress?.modelId === selectedModel.id ? (
            <div className="ff-knowledge-index-actions">
              <span className="ff-knowledge-index-progress">
                {downloadProgress.totalBytes
                  ? t("settings.localAi.downloadingKnown", {
                      received: (downloadProgress.receivedBytes / 1024 ** 3).toFixed(2),
                      total: (downloadProgress.totalBytes / 1024 ** 3).toFixed(2),
                    })
                  : t("settings.localAi.downloadingUnknown", {
                      received: (downloadProgress.receivedBytes / 1024 ** 3).toFixed(2),
                    })}
              </span>
              {downloadProgress.totalBytes ? (
                <progress
                  className="ff-knowledge-progress-bar"
                  value={downloadProgress.receivedBytes}
                  max={downloadProgress.totalBytes}
                />
              ) : null}
            </div>
          ) : null}
          {modelDownloadMessage ? <p className="ff-settings-msg">{modelDownloadMessage}</p> : null}
          {downloadError ? <p className="ff-settings-error">{downloadError}</p> : null}
        </div>
      ) : null}

      <div className="ff-settings-card">
        <SettingsRow title={t("settings.localAi.launchTitle")} hint={t(launchHintKey[settings.launchMode])}>
          <SegmentedTabs
            tabs={[
              ["on-demand", t("settings.localAi.launchOnDemand")],
              ["on-app-start", t("settings.localAi.launchOnStart")],
              ["external", t("settings.localAi.launchExternal")],
            ]}
            active={settings.launchMode}
            onChange={(mode) => updateSettings({ launchMode: mode })}
          />
        </SettingsRow>
        {settings.launchMode === "external" ? (
          <SettingsRow title={t("settings.localAi.externalUrlLabel")} hint={t("settings.localAi.launchExternalHint")}>
            <input
              className="ff-localai-url-input"
              value={settings.externalServerUrl}
              placeholder="http://localhost:11434"
              onChange={(event) => updateSettings({ externalServerUrl: event.target.value })}
            />
          </SettingsRow>
        ) : (
          <>
            <SettingsRow title={t("settings.localAi.portLabel")} hint={t("settings.localAi.portHint")}>
              <input
                className="ff-localai-port-input"
                type="number"
                min={1024}
                max={65535}
                value={settings.serverPort}
                onChange={(event) => {
                  const port = Number.parseInt(event.target.value, 10);
                  if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
                    updateSettings({ serverPort: port });
                  }
                }}
              />
            </SettingsRow>
            {isDesktop ? (
              <SettingsRow title={t("settings.localAi.binaryPathLabel")} hint={t("settings.localAi.binaryPathHint")}>
                <input
                  className="ff-localai-url-input"
                  value={settings.serverBinaryPathOverride}
                  placeholder="llama-server"
                  onChange={(event) => updateSettings({ serverBinaryPathOverride: event.target.value })}
                />
              </SettingsRow>
            ) : null}
          </>
        )}
      </div>

      {isDesktop && settings.launchMode !== "external" ? (
        <div className="ff-settings-card">
          <SettingsRow
            title={t("settings.localAi.runtimeTitle")}
            hint={
              runtimeAsset
                ? t("settings.localAi.runtimeHint", { version: runtimeAsset.version })
                : t("settings.localAi.runtimeUnavailable")
            }
          >
            {serverInstalled && !runtimeOutdated ? (
              <span className="ff-localai-chip on">{t("settings.localAi.runtimeInstalledBadge")}</span>
            ) : installingRuntime ? (
              <button type="button" className="ff-btn ff-btn-danger" onClick={() => void cancelServerRuntimeInstall()}>
                {t("settings.localAi.downloadCancel")}
              </button>
            ) : (
              <button
                type="button"
                className="ff-btn ff-btn-primary"
                disabled={Boolean(downloadingId) || !runtimeAsset || serverInstalled === null}
                onClick={() => void handleInstallRuntime()}
              >
                {downloadError
                  ? t("settings.localAi.downloadRetry")
                  : serverInstalled && runtimeOutdated
                    ? t("settings.localAi.runtimeUpdateButton")
                    : t("settings.localAi.runtimeInstallButton")}
              </button>
            )}
          </SettingsRow>
          {installingRuntime && downloadProgress?.modelId === SERVER_RUNTIME_DOWNLOAD_ID ? (
            <div className="ff-knowledge-index-actions">
              <span className="ff-knowledge-index-progress">
                {downloadProgress.totalBytes
                  ? t("settings.localAi.downloadingKnown", {
                      received: (downloadProgress.receivedBytes / 1024 ** 3).toFixed(2),
                      total: (downloadProgress.totalBytes / 1024 ** 3).toFixed(2),
                    })
                  : t("settings.localAi.downloadingUnknown", {
                      received: (downloadProgress.receivedBytes / 1024 ** 3).toFixed(2),
                    })}
              </span>
              {downloadProgress.totalBytes ? (
                <progress
                  className="ff-knowledge-progress-bar"
                  value={downloadProgress.receivedBytes}
                  max={downloadProgress.totalBytes}
                />
              ) : (
                <progress className="ff-knowledge-progress-bar" />
              )}
            </div>
          ) : null}
          {runtimeDownloadMessage ? <p className="ff-settings-msg">{runtimeDownloadMessage}</p> : null}
          {downloadError ? <p className="ff-settings-error">{downloadError}</p> : null}
        </div>
      ) : null}

      {isDesktop ? (
        <div className="ff-settings-card">
          <SettingsRow title={t("settings.localAi.storageTitle")} hint={t("settings.localAi.storageHint")}>
            <span className="ff-knowledge-path" title={modelsDir}>
              {modelsDir || "…"}
            </span>
          </SettingsRow>
          <SettingsRow title={t("settings.localAi.installedModelsTitle")} hint="">
            {installedModels.length === 0 ? (
              <span className="ff-knowledge-index-status">{t("settings.localAi.noInstalledModels")}</span>
            ) : (
              <span />
            )}
          </SettingsRow>
          {installedModels.length > 0 ? (
            <div className="ff-localai-model-list">
              {installedModels.map((file) => (
                <article key={file.path} className="ff-localai-model-item">
                  <div className="ff-localai-model-text">
                    <strong>{file.fileName}</strong>
                    <small>{t("settings.localAi.sizeGb", { size: (file.sizeBytes / 1024 ** 3).toFixed(1) })}</small>
                  </div>
                  <div className="ff-external-calendar-actions">
                    <button type="button" className="ff-btn ff-btn-danger" onClick={() => setDeleteTarget(file)}>
                      {t("common.delete")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <TurnLogSettingsCard />

      {deleteTarget ? (
        <ConfirmModal
          title={t("settings.localAi.deleteConfirmTitle")}
          body={<p>{t("settings.localAi.deleteConfirmBody", { file: deleteTarget.fileName })}</p>}
          confirmLabel={t("common.delete")}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDeleteModel()}
        />
      ) : null}
    </>
  );
}

// Turn log (User Patterns slice A): device-local record of AI exchanges for
// later pattern analysis. Not desktop-gated — the log works wherever the AI
// panel does.
function TurnLogSettingsCard() {
  const { t } = useT();
  const [enabled, setEnabled] = useState(() => isTurnLogEnabled());
  const [count, setCount] = useState(() => turnLogCount());
  const [confirmClear, setConfirmClear] = useState(false);

  function handleToggle(next: boolean) {
    setTurnLogEnabled(next);
    setEnabled(next);
  }

  function handleClear() {
    clearTurnLog();
    setCount(0);
    setConfirmClear(false);
  }

  return (
    <div className="ff-settings-card">
      <Toggle
        label={t("settings.localAi.turnLog.enable")}
        hint={t("settings.localAi.turnLog.enableHint")}
        value={enabled}
        onChange={handleToggle}
      />
      <SettingsRow title={t("settings.localAi.turnLog.storedTitle")} hint={t("settings.localAi.turnLog.storedHint")}>
        <div className="ff-external-calendar-actions">
          <span className="ff-knowledge-index-status">{t("settings.localAi.turnLog.count", { n: count })}</span>
          <button type="button" className="ff-btn ff-btn-danger" onClick={() => setConfirmClear(true)} disabled={count === 0}>
            {t("settings.localAi.turnLog.clear")}
          </button>
        </div>
      </SettingsRow>
      <p className="ff-knowledge-privacy-note">{t("settings.localAi.turnLog.privacyNote")}</p>

      {confirmClear ? (
        <ConfirmModal
          title={t("settings.localAi.turnLog.clearConfirmTitle")}
          body={<p>{t("settings.localAi.turnLog.clearConfirmBody", { n: count })}</p>}
          confirmLabel={t("common.delete")}
          onCancel={() => setConfirmClear(false)}
          onConfirm={handleClear}
        />
      ) : null}
    </div>
  );
}

function LocalAiModelItem({
  model,
  badge,
  selected,
  installed,
  onSelect,
}: {
  model: LocalModelOption;
  badge?: string;
  selected: boolean;
  installed: boolean;
  onSelect: () => void;
}) {
  const { t } = useT();
  return (
    <article className={`ff-localai-model-item${selected ? " selected" : ""}`}>
      <div className="ff-localai-model-text">
        <div className="ff-localai-model-head">
          <strong>{model.displayName}</strong>
          {badge ? <span className="ff-localai-chip on">{badge}</span> : null}
          <span className="ff-localai-chip">{t(`localAi.tier.${model.recommendedTier}`)}</span>
          {installed ? <span className="ff-localai-chip on">{t("settings.localAi.installedBadge")}</span> : null}
        </div>
        <small>{t(model.description)}</small>
        <small>
          {t("settings.localAi.modelMeta", {
            size: model.estimatedSizeGb,
            minRam: model.minRamGb,
            recommendedRam: model.recommendedRamGb,
          })}
        </small>
      </div>
      <div className="ff-external-calendar-actions">
        {selected ? (
          <span className="ff-localai-chip on">{t("settings.localAi.selectedBadge")}</span>
        ) : (
          <button type="button" className="ff-btn" onClick={onSelect}>
            {t("settings.localAi.selectModel")}
          </button>
        )}
      </div>
    </article>
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
