import { ChangeEvent, ReactNode, useEffect, useRef, useState } from "react";
import type { CalendarShareState } from "../lib/calendarShare";
import { modelNameMatches } from "../lib/knowledge/embeddingProvider";
import { EmbeddingModelUnavailableError, runIndexing, type IndexProgress } from "../lib/knowledge/indexer";
import { KnowledgeStore, type IndexStats } from "../lib/knowledge/knowledgeStore";
import type { KnowledgeSettings } from "../lib/knowledge/types";
import { platform } from "../platform";
import type { AppUpdateStatus } from "../platform";
import type { AccentColor, AppSettings, ExternalCalendar, FontSize, Language, Task, ThemeMode } from "../types";
import { CalendarCategorySettings } from "./calendar/CalendarCategorySettings";
import { ConfirmModal, SegmentedTabs } from "./kit";
import { listLocalAiModels } from "../lib/ai/gateway";
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
}: SettingsPageProps) {
  const { t } = useT();
  const [tab, setTab] = useState<"appearance" | "behavior" | "calendar" | "knowledge" | "data">("appearance");
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
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("settings.title")}</h1>
          <p className="ff-page-sub">{t("settings.subtitle")}</p>
        </div>
      </header>

      <SegmentedTabs
        tabs={[
          ["appearance", t("settings.tabAppearance")],
          ["behavior", t("settings.tabBehavior")],
          ["calendar", t("settings.tabCalendar")],
          ["knowledge", t("settings.tabKnowledge")],
          ["data", t("settings.tabData")],
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "appearance" ? (
        <div className="ff-settings-card">
          <Row title={t("settings.theme")} hint={t("settings.themeHint")}>
            <SegmentedTabs
              tabs={[
                ["light", t("settings.themeLight")],
                ["dark", t("settings.themeDark")],
                ["system", t("settings.themeSystem")],
              ]}
              active={settings.theme}
              onChange={(t) => onUpdate({ theme: t as ThemeMode })}
            />
          </Row>
          <Row title={t("settings.accentColor")} hint={t("settings.accentColorHint")}>
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
          </Row>
          <Row title={t("settings.fontSize")} hint={t("settings.fontSizeHint")}>
            <SegmentedTabs
              tabs={[
                ["small", t("settings.fontSmall")],
                ["medium", t("settings.fontMedium")],
                ["large", t("settings.fontLarge")],
              ]}
              active={settings.fontSize}
              onChange={(t) => onUpdate({ fontSize: t as FontSize })}
            />
          </Row>
          <Row title={t("settings.language")} hint={t("settings.languageHint")}>
            <SegmentedTabs
              tabs={[
                ["ko", t("settings.languageKo")],
                ["en", t("settings.languageEn")],
              ]}
              active={settings.language}
              onChange={(t) => onUpdate({ language: t as Language })}
            />
          </Row>
        </div>
      ) : null}

      {tab === "behavior" ? (
        <div className="ff-settings-card">
          <Row title={t("settings.defaultStartPage")} hint={t("settings.defaultStartPageHint")}>
            <select
              value={settings.defaultView}
              onChange={(e) => onUpdate({ defaultView: e.target.value as AppSettings["defaultView"] })}
            >
              <option value="/today">{t("sidebar.today")}</option>
              <option value="/calendar">{t("sidebar.calendar")}</option>
              <option value="/planning">{t("sidebar.planning")}</option>
              <option value="/projects">{t("sidebar.spaces")}</option>
              <option value="/focus">{t("sidebar.focus")}</option>
              <option value="/inbox">{t("settings.defaultStartPageInboxOption")}</option>
            </select>
          </Row>
          <Toggle
            label={t("settings.showCompletedTasks")}
            hint={t("settings.showCompletedTasksHint")}
            value={settings.showCompletedInToday}
            onChange={(v) => onUpdate({ showCompletedInToday: v })}
          />
          <Toggle
            label={t("settings.showSidebarCounts")}
            hint={t("settings.showSidebarCountsHint")}
            value={settings.showSidebarCounts}
            onChange={(v) => onUpdate({ showSidebarCounts: v })}
          />
          <Toggle
            label={t("settings.reduceMotion")}
            hint={t("settings.reduceMotionHint")}
            value={settings.reduceMotion}
            onChange={(v) => onUpdate({ reduceMotion: v })}
          />
          <AiModelRow value={settings.aiModel} onChange={(model) => onUpdate({ aiModel: model })} />
        </div>
      ) : null}

      {tab === "calendar" ? (
        <div className="ff-cal-settings-stack">
          <section className="ff-settings-card ff-cal-card">
            <CalendarCategorySettings tasks={tasks} onUpdateTask={onUpdateTask} />
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

      {tab === "knowledge" ? (
        <KnowledgeSettingsTab
          settings={knowledgeSettings}
          updateSettings={onUpdateKnowledgeSettings}
          isDesktop={isKnowledgeDesktop}
        />
      ) : null}

      {tab === "data" ? (
        <>
          <div className="ff-settings-card">
            <Row title={t("settings.exportData")} hint={t("settings.exportDataHint")}>
              <button type="button" className="ff-btn" onClick={onExport}>{t("settings.exportJson")}</button>
            </Row>
            <Row title={t("settings.importData")} hint={t("settings.importDataHint")}>
              <label className="ff-btn ff-import-btn">
                {t("settings.importJson")}
                <input type="file" accept="application/json" onChange={onImport} hidden />
              </label>
            </Row>
            <Row title={t("settings.resetAllData")} hint={t("settings.resetAllDataHint")}>
              <button type="button" className="ff-btn ff-btn-danger" onClick={onReset}>{t("settings.resetAllData")}</button>
            </Row>
            {importMessage ? <p className="ff-settings-msg">{importMessage}</p> : null}
          </div>
          {accountSlot}
          <section className="settings-card account-card">
            <div className="section-title">
              <h2>{t("settings.appInfo")}</h2>
              <span>FocusFlow</span>
            </div>
            <div className="account-stack">
              <p>
                {t("settings.appVersion")} <strong>{appVersion}</strong>
              </p>
              <p>{formatUpdateStatus(updateStatus, t)}</p>
              <div className="settings-actions">
                {updateStatus.status === "available" ? (
                  <button type="button" onClick={onInstallUpdate}>
                    {t("settings.installUpdate")}
                  </button>
                ) : null}
                <button type="button" onClick={onCheckUpdate} disabled={updateStatus.status === "checking" || updateStatus.status === "installing"}>
                  {t("settings.checkUpdates")}
                </button>
              </div>
            </div>
          </section>
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

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M20 12a8 8 0 11-2.3-5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

function AiModelRow({ value, onChange }: { value: string; onChange: (model: string) => void }) {
  const { t } = useT();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadModels() {
    setLoading(true);
    try {
      setModels(await listLocalAiModels());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadModels();
  }, []);

  const isOffline = !loading && models.length === 0;

  return (
    <Row title={t("settings.aiModel")} hint={t("settings.aiModelHint")}>
      <div className="ff-ai-model-control">
        <select value={value} onChange={(event) => onChange(event.target.value)} disabled={loading}>
          <option value="">{t("ai.model.auto")}</option>
          {value && !models.includes(value) ? <option value={value}>{value}</option> : null}
          {models.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="ff-ai-model-refresh"
          aria-label={t("ai.model.refresh")}
          onClick={() => void loadModels()}
          disabled={loading}
        >
          {loading ? "…" : "↻"}
        </button>
      </div>
      {isOffline ? <small className="ff-ai-model-offline">{t("ai.status.offline")}</small> : null}
    </Row>
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

  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [indexStats, setIndexStats] = useState<IndexStats | null>(null);
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
      setInstalledModels(await listLocalAiModels());
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
      } finally {
        await store.close();
      }
    } catch {
      setIndexStats(null);
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    if (!vaultReady) return;
    void loadInstalledModels();
    void loadStats();
    // Re-run only when the vault actually becomes ready/connected, not on
    // every keystroke of unrelated settings fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultReady]);

  const modelInstalled = installedModels.some((name) => modelNameMatches(name, settings.embeddingModel));

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
  }

  if (!isDesktop) {
    return (
      <div className="ff-settings-card ff-knowledge-locked">
        <Row title={t("settings.knowledge.title")} hint={t("settings.knowledge.desktopOnly")}>
          <span className="ff-knowledge-badge">{t("settings.knowledge.desktopOnlyBadge")}</span>
        </Row>
      </div>
    );
  }

  return (
    <>
    <div className="ff-settings-card">
      <Row title={t("settings.knowledge.vaultTitle")} hint={t("settings.knowledge.vaultHint")}>
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
      </Row>

      {pickError ? <p className="ff-settings-error">{pickError}</p> : null}

      {settings.vaultPath ? (
        <>
          <Toggle
            label={t("settings.knowledge.enable")}
            hint={t("settings.knowledge.enableHint")}
            value={settings.enabled}
            onChange={(value) => updateSettings({ enabled: value })}
          />
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
        <Row title={t("settings.knowledge.embeddingModel")} hint={t("settings.knowledge.embeddingModelHint")}>
          <div className="ff-knowledge-model-control">
            <select
              value={settings.embeddingModel}
              onChange={(event) => updateSettings({ embeddingModel: event.target.value })}
              disabled={modelsLoading}
            >
              <option value="bge-m3">bge-m3</option>
              <option value="nomic-embed-text">nomic-embed-text</option>
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
            <small className="ff-settings-error">{t("settings.knowledge.modelPullHint", { model: settings.embeddingModel })}</small>
          ) : null}
        </Row>

        <Row title={t("settings.knowledge.indexStatus")} hint="">
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
        </Row>

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

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
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
    <Row title={label} hint={hint}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        className={`ff-toggle${value ? " on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span className="ff-toggle-knob" />
      </button>
    </Row>
  );
}
