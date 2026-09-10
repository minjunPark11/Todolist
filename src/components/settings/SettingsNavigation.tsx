import { SETTINGS_TABS, type SettingsTab } from "../../app/settingsTab";
import { useT } from "../../i18n";

export function SettingsNavigation({ active, onChange }: { active: SettingsTab; onChange: (tab: SettingsTab) => void }) {
  const { t } = useT();
  return <>
    <label className="ff-settings-mobile-nav">
      <span>{t("settings.categories")}</span>
      <select value={active} onChange={event => onChange(event.target.value as SettingsTab)}>
        {SETTINGS_TABS.map(id => <option key={id} value={id}>{t(`settings.nav.${id}`)}</option>)}
      </select>
    </label>
    <div className="ff-settings-nav" role="tablist" aria-label={t("settings.categories")} aria-orientation="vertical">
      {SETTINGS_TABS.map((id, index) => <button key={id} type="button" role="tab"
        id={`settings-tab-${id}`} aria-selected={active === id} aria-controls={active === id ? `settings-panel-${id}` : undefined}
        tabIndex={active === id ? 0 : -1} className={id === "about" ? "ff-settings-nav-about" : undefined}
        onClick={() => onChange(id)} onKeyDown={event => {
          const next = event.key === "ArrowDown" ? (index + 1) % SETTINGS_TABS.length
            : event.key === "ArrowUp" ? (index + SETTINGS_TABS.length - 1) % SETTINGS_TABS.length
            : event.key === "Home" ? 0 : event.key === "End" ? SETTINGS_TABS.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault();
          onChange(SETTINGS_TABS[next]);
          document.getElementById(`settings-tab-${SETTINGS_TABS[next]}`)?.focus();
        }}>{t(`settings.nav.${id}`)}</button>)}
    </div>
  </>;
}
