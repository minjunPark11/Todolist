import { useCallback, useEffect, useState } from "react";
import { platform } from "../../platform";
import { DEFAULT_LOCAL_AI_SETTINGS, normalizeLocalAiSettings, type LocalAiSettings } from "./types";

// Isolated from STORAGE_KEY in usePlannerData.ts on purpose: that key's
// contents (appSettings included) sync to Supabase, and serverPort /
// externalServerUrl / modelsDirOverride must never leave the device. Same
// pattern as focusflow.knowledge.v1 (useKnowledgeSettings.ts).
const LOCAL_AI_STORAGE_KEY = "focusflow.localAi.v1";

export function loadLocalAiSettings(): LocalAiSettings {
  const raw = platform.storage.getSync(LOCAL_AI_STORAGE_KEY);
  if (!raw) return DEFAULT_LOCAL_AI_SETTINGS;
  try {
    return normalizeLocalAiSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_LOCAL_AI_SETTINGS;
  }
}

export function saveLocalAiSettings(settings: LocalAiSettings): void {
  platform.storage.setSync(LOCAL_AI_STORAGE_KEY, JSON.stringify(settings));
}

export function useLocalAiSettings() {
  const [settings, setSettings] = useState<LocalAiSettings>(() => loadLocalAiSettings());
  // The managed runtime needs Tauri commands; on the web only the "external"
  // launch mode can ever work.
  const isDesktop = platform.localAi.supported();

  useEffect(() => {
    saveLocalAiSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<LocalAiSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  return { settings, updateSettings, isDesktop };
}
