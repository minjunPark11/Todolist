import { ChangeEvent, ReactNode, useState } from "react";
import type { AccentColor, AppSettings, FontSize, ThemeMode } from "../types";
import { SegmentedTabs } from "./kit";

interface SettingsPageProps {
  settings: AppSettings;
  onUpdate: (patch: Partial<AppSettings>) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadSamples: () => void;
  onReset: () => void;
  importMessage: string;
  accountSlot: ReactNode;
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
}: SettingsPageProps) {
  const [tab, setTab] = useState<"appearance" | "behavior" | "data">("appearance");

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">Settings</h1>
          <p className="ff-page-sub">Personalize FocusFlow and manage your local data.</p>
        </div>
      </header>

      <SegmentedTabs
        tabs={[["appearance", "Appearance"], ["behavior", "Behavior"], ["data", "Data"]]}
        active={tab}
        onChange={setTab}
      />

      {tab === "appearance" ? (
        <div className="ff-settings-card">
          <Row title="Theme" hint="Choose your preferred color theme.">
            <SegmentedTabs
              tabs={[["light", "Light"], ["dark", "Dark"], ["system", "System"]]}
              active={settings.theme}
              onChange={(t) => onUpdate({ theme: t as ThemeMode })}
            />
          </Row>
          <Row title="Accent Color" hint="Used for buttons, highlights, and links.">
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
          <Row title="Font Size" hint="Adjust the base font size.">
            <SegmentedTabs
              tabs={[["small", "Small"], ["medium", "Medium"], ["large", "Large"]]}
              active={settings.fontSize}
              onChange={(t) => onUpdate({ fontSize: t as FontSize })}
            />
          </Row>
        </div>
      ) : null}

      {tab === "behavior" ? (
        <div className="ff-settings-card">
          <Row title="Default Start Page" hint="Which page opens when the app starts.">
            <select value={settings.defaultView} onChange={(e) => onUpdate({ defaultView: e.target.value as "/today" | "/inbox" })}>
              <option value="/today">Today</option>
              <option value="/inbox">Inbox</option>
            </select>
          </Row>
          <Toggle label="Show Completed Tasks" hint="Show completed tasks in Today." value={settings.showCompletedInToday} onChange={(v) => onUpdate({ showCompletedInToday: v })} />
          <Toggle label="Confirm Before Delete" hint="Ask for confirmation before deleting tasks or projects." value={settings.confirmBeforeDelete} onChange={(v) => onUpdate({ confirmBeforeDelete: v })} />
          <Toggle label="Show Sidebar Counts" hint="Display task counts next to sidebar items." value={settings.showSidebarCounts} onChange={(v) => onUpdate({ showSidebarCounts: v })} />
          <Toggle label="Reduce Motion" hint="Minimize animations and transitions." value={settings.reduceMotion} onChange={(v) => onUpdate({ reduceMotion: v })} />
        </div>
      ) : null}

      {tab === "data" ? (
        <>
          <div className="ff-settings-card">
            <Row title="Export Data" hint="Download all your data as a JSON file.">
              <button type="button" className="ff-btn" onClick={onExport}>Export JSON</button>
            </Row>
            <Row title="Import Data" hint="Restore previously exported data.">
              <label className="ff-btn ff-import-btn">
                Import JSON
                <input type="file" accept="application/json" onChange={onImport} hidden />
              </label>
            </Row>
            <Row title="Sample Data" hint="Load a demo dataset to explore the app.">
              <button type="button" className="ff-btn" onClick={onLoadSamples}>Load Samples</button>
            </Row>
            <Row title="Reset All Data" hint="Permanently delete all tasks, projects, and notes. This cannot be undone.">
              <button type="button" className="ff-btn ff-btn-danger" onClick={onReset}>Reset All Data</button>
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
