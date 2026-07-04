import { platform } from "../platform";

export type FocusUserSettings = {
  showTabTitleTimer: boolean;
  enableCompletionNotification: boolean;
  showMiniTimerButton: boolean;
};

export const DEFAULT_FOCUS_USER_SETTINGS: FocusUserSettings = {
  showTabTitleTimer: true,
  enableCompletionNotification: true,
  showMiniTimerButton: true,
};

const STORAGE_KEY = "focusflow.focusSettings.v1";

export function sanitizeFocusUserSettings(value: unknown): FocusUserSettings {
  if (!value || typeof value !== "object") return DEFAULT_FOCUS_USER_SETTINGS;
  const record = value as Partial<Record<keyof FocusUserSettings, unknown>>;
  return {
    showTabTitleTimer:
      typeof record.showTabTitleTimer === "boolean"
        ? record.showTabTitleTimer
        : DEFAULT_FOCUS_USER_SETTINGS.showTabTitleTimer,
    enableCompletionNotification:
      typeof record.enableCompletionNotification === "boolean"
        ? record.enableCompletionNotification
        : DEFAULT_FOCUS_USER_SETTINGS.enableCompletionNotification,
    showMiniTimerButton:
      typeof record.showMiniTimerButton === "boolean"
        ? record.showMiniTimerButton
        : DEFAULT_FOCUS_USER_SETTINGS.showMiniTimerButton,
  };
}

export function loadFocusUserSettings(): FocusUserSettings {
  try {
    const raw = platform.storage.getSync(STORAGE_KEY);
    return raw ? sanitizeFocusUserSettings(JSON.parse(raw)) : DEFAULT_FOCUS_USER_SETTINGS;
  } catch {
    return DEFAULT_FOCUS_USER_SETTINGS;
  }
}

export function saveFocusUserSettings(settings: FocusUserSettings) {
  try {
    platform.storage.setSync(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable in private mode; keep the in-memory setting.
  }
}
