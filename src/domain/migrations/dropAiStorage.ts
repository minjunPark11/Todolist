import { platform } from "../../platform";

/**
 * Clears what the removed AI features left behind on this device.
 *
 * The local AI runtime, the Obsidian knowledge base and the assistant are gone
 * (LOCAL_AI_REMOVAL_DESIGN.md), but their settings and logs sit in this
 * origin's storage until something deletes them. `focusflow.aiTurnLog.v1` is
 * the one that makes this non-optional: it holds the text of past
 * conversations, and keeping it around for a feature the app no longer has is
 * not something a user would expect.
 *
 * Deliberately not touched: the downloaded GGUF model files, the llama-server
 * binary and the knowledge index database. Those are multi-gigabyte files the
 * user chose to download, sitting in a folder they can open — deleting them
 * quietly during an update is not this migration's call to make. The release
 * notes name the folder instead.
 *
 * Safe to delete once a release has shipped with it: the keys are gone after
 * the first run, and nothing writes them again.
 */
const REMOVED_KEYS = [
  "focusflow.localAi.v1",
  "focusflow.knowledge.v1",
  "focusflow.aiTurnLog.v1",
  "focusflow.aiTurnLog.enabled",
  "focusflow.aiMemory.v1",
  "focusflow.aiOutcomeLog.v1",
  "focusflow.aiContextCards.v1",
];

export function dropAiStorage(): void {
  for (const key of REMOVED_KEYS) {
    try {
      platform.storage.removeSync(key);
    } catch {
      // A storage that refuses to delete (private mode, quota-locked) is not a
      // reason to hold up the app; the next launch tries again.
    }
  }
}
