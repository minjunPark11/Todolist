import { useCallback, useEffect, useState } from "react";
import { platform } from "../../platform";
import { DEFAULT_KNOWLEDGE_SETTINGS, normalizeKnowledgeSettings, type KnowledgeSettings } from "./types";

// Isolated from STORAGE_KEY in usePlannerData.ts on purpose: that key's
// contents (appSettings included) sync to Supabase, and vaultPath/dbPath must
// never leave the device.
const KNOWLEDGE_STORAGE_KEY = "focusflow.knowledge.v1";

function loadKnowledgeSettings(): KnowledgeSettings {
  const raw = platform.storage.getSync(KNOWLEDGE_STORAGE_KEY);
  if (!raw) return DEFAULT_KNOWLEDGE_SETTINGS;
  try {
    return normalizeKnowledgeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_KNOWLEDGE_SETTINGS;
  }
}

export function useKnowledgeSettings() {
  const [settings, setSettings] = useState<KnowledgeSettings>(() => loadKnowledgeSettings());
  const isDesktop = platform.files.supported();

  useEffect(() => {
    platform.storage.setSync(KNOWLEDGE_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    // The OS-level fs scope granted when the user originally picked the
    // vault does not survive an app restart, so re-grant it here using the
    // path persisted from last session.
    const savedVaultPath = loadKnowledgeSettings().vaultPath;
    if (savedVaultPath && platform.files.supported()) {
      void platform.files.grantAccess(savedVaultPath).catch(() => undefined);
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<KnowledgeSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  return { settings, updateSettings, isDesktop };
}
