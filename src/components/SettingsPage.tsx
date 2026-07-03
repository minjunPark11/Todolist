import { ChangeEvent, ReactNode, useState } from "react";
import type { CalendarShareState } from "../lib/calendarShare";
import type { AccentColor, AppSettings, ExternalCalendar, FontSize, Language, Task, ThemeMode } from "../types";
import { CalendarCategorySettings } from "./calendar/CalendarCategorySettings";
import { SegmentedTabs } from "./kit";
import { useT } from "../i18n";

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadSamples: () => void;
  onReset: () => void;
  importMessage: string;
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
  onLoadSamples,
  onReset,
  importMessage,
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
}: SettingsPageProps) {
  const { t } = useT();
  const [tab, setTab] = useState<"appearance" | "behavior" | "calendar" | "data">("appearance");
  const [calendarDraft, setCalendarDraft] = useState({ name: "", icsUrl: "", color: "#4f73ff" });
  const [shareCopyLabel, setShareCopyLabel] = useState("복사");
  const shareBusy = calendarShare.status === "loading" || calendarShare.status === "saving";

  async function copyShareUrl() {
    if (!calendarShare.url) return;
    try {
      await navigator.clipboard.writeText(calendarShare.url);
      setShareCopyLabel("복사됨");
      window.setTimeout(() => setShareCopyLabel("복사"), 1500);
    } catch {
      setShareCopyLabel("복사 실패");
      window.setTimeout(() => setShareCopyLabel("복사"), 1500);
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
          ["calendar", "캘린더"],
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
            <select value={settings.defaultView} onChange={(e) => onUpdate({ defaultView: e.target.value as "/today" | "/inbox" })}>
              <option value="/today">{t("sidebar.today")}</option>
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
            label={t("settings.confirmBeforeDelete")}
            hint={t("settings.confirmBeforeDeleteHint")}
            value={settings.confirmBeforeDelete}
            onChange={(v) => onUpdate({ confirmBeforeDelete: v })}
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
        </div>
      ) : null}

      {tab === "calendar" ? (
        <div className="ff-settings-card">
          <CalendarCategorySettings tasks={tasks} onUpdateTask={onUpdateTask} />

          <Row title="내 캘린더 공유" hint="상대방이 구독할 수 있는 읽기 전용 ICS 링크를 만듭니다. 제목, 날짜, 시간만 공유됩니다.">
            <div className="ff-calendar-share-panel">
              <div className="ff-calendar-share-status">
                <strong>{calendarShare.enabled ? "공유 중" : "공유 꺼짐"}</strong>
                <small>
                  {calendarShare.status === "unavailable"
                    ? "Supabase 로그인 상태에서 사용할 수 있습니다."
                    : calendarShare.updatedAt
                      ? `마지막 업데이트 ${new Date(calendarShare.updatedAt).toLocaleString()}`
                      : "아직 공유 링크가 없습니다."}
                </small>
              </div>
              {calendarShare.url ? (
                <div className="ff-calendar-share-url">
                  <input value={calendarShare.url} readOnly aria-label="내 캘린더 구독 링크" />
                  <button type="button" className="ff-btn" onClick={copyShareUrl}>
                    {shareCopyLabel}
                  </button>
                </div>
              ) : null}
              {calendarShare.error ? <p className="ff-settings-error">{calendarShare.error}</p> : null}
              <div className="ff-calendar-share-actions">
                {calendarShare.enabled ? (
                  <button type="button" className="ff-btn" disabled={shareBusy} onClick={onDisableCalendarShare}>
                    공유 끄기
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ff-btn"
                    disabled={shareBusy || calendarShare.status === "unavailable"}
                    onClick={onEnableCalendarShare}
                  >
                    링크 생성
                  </button>
                )}
                <button
                  type="button"
                  className="ff-btn"
                  disabled={shareBusy || !calendarShare.token || calendarShare.status === "unavailable"}
                  onClick={onPublishCalendarShare}
                >
                  지금 업데이트
                </button>
                <button
                  type="button"
                  className="ff-btn ff-btn-danger"
                  disabled={shareBusy || calendarShare.status === "unavailable"}
                  onClick={onRegenerateCalendarShare}
                >
                  링크 재생성
                </button>
              </div>
            </div>
          </Row>

          <Row title="외부 캘린더 추가" hint="공개 ICS 주소를 추가하면 Calendar 화면에서 읽기 전용으로 표시됩니다.">
            <div className="ff-external-calendar-form">
              <input
                value={calendarDraft.name}
                placeholder="캘린더 이름"
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
                aria-label="캘린더 색상"
                onChange={(event) => setCalendarDraft((draft) => ({ ...draft, color: event.target.value }))}
              />
              <button
                type="button"
                className="ff-btn"
                disabled={!calendarDraft.name.trim() || !calendarDraft.icsUrl.trim()}
                onClick={() => {
                  onAddExternalCalendar(calendarDraft);
                  setCalendarDraft({ name: "", icsUrl: "", color: "#4f73ff" });
                }}
              >
                추가
              </button>
            </div>
          </Row>

          <Row title="동기화 상태" hint="실패해도 마지막 성공 일정 캐시는 유지됩니다.">
            <button type="button" className="ff-btn" onClick={onSyncAllExternalCalendars}>
              전체 새로고침
            </button>
          </Row>

          <div className="ff-external-calendar-list">
            {externalCalendars.length === 0 ? <p className="ff-settings-msg">추가된 외부 캘린더가 없습니다.</p> : null}
            {externalCalendars.map((calendar) => (
              <article key={calendar.id} className="ff-external-calendar-item">
                <span className="ff-external-dot" style={{ background: calendar.color }} />
                <div>
                  <strong>{calendar.name}</strong>
                  <small>
                    {calendar.syncStatus === "syncing"
                      ? "동기화 중..."
                      : calendar.syncStatus === "failed"
                        ? `동기화 실패${calendar.lastError ? `: ${calendar.lastError}` : ""}`
                        : calendar.enabled
                          ? `정상 · ${calendar.eventCount ?? 0}개`
                          : "비활성화됨"}
                  </small>
                  <small>{calendar.lastSyncedAt ? `마지막 동기화 ${new Date(calendar.lastSyncedAt).toLocaleString()}` : "아직 동기화되지 않음"}</small>
                </div>
                <div className="ff-external-calendar-actions">
                  <button type="button" className="ff-btn" onClick={() => onUpdateExternalCalendar(calendar.id, { visible: !calendar.visible })}>
                    {calendar.visible ? "숨김" : "표시"}
                  </button>
                  <button type="button" className="ff-btn" onClick={() => onUpdateExternalCalendar(calendar.id, { enabled: !calendar.enabled })}>
                    {calendar.enabled ? "비활성" : "활성"}
                  </button>
                  <button type="button" className="ff-btn" disabled={!calendar.enabled} onClick={() => onSyncExternalCalendar(calendar.id)}>
                    지금 새로고침
                  </button>
                  <button type="button" className="ff-btn ff-btn-danger" onClick={() => onDeleteExternalCalendar(calendar.id)}>
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
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
            <Row title={t("settings.sampleData")} hint={t("settings.sampleDataHint")}>
              <button type="button" className="ff-btn" onClick={onLoadSamples}>{t("settings.loadSamples")}</button>
            </Row>
            <Row title={t("settings.resetAllData")} hint={t("settings.resetAllDataHint")}>
              <button type="button" className="ff-btn ff-btn-danger" onClick={onReset}>{t("settings.resetAllData")}</button>
            </Row>
            {importMessage ? <p className="ff-settings-msg">{importMessage}</p> : null}
          </div>
          {accountSlot}
        </>
      ) : null}
    </div>
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
