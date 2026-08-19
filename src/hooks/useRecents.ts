// Where the user has been, kept for the Command Menu (§10.43, §10.44).
//
// This lived inside the Tasks Module until D-25 made Ctrl/Cmd+K global. The
// menu is drawn above both shells now, so the history it lists cannot be the
// private state of one of them.
//
// What is recorded has not changed: Scopes and open Tasks, read from the URL
// rather than from the click that caused it, so a place reached by Back or by
// a pasted link counts the same as one reached from the sidebar. A URL that
// is not a Tasks address records nothing — Calendar and the Spaces pages are
// not Scopes, and inventing an entry for them would put a row in the menu
// that §10.43's five-and-five was never sized for.
import { useEffect, useState } from "react";
import type { RecentState } from "../domain/tasks/recents";
import { NO_RECENTS, rememberScope, rememberTask, sanitizeRecents } from "../domain/tasks/recents";
import { parseSearchUrl, parseTaskUrl } from "../app/taskScopeUrl";
import { platform } from "../platform";

// Unchanged from when the Tasks Module owned this, so an existing install
// keeps the history it already had.
const RECENTS_KEY = "focusflow.tasks.recents.v1";

export function useRecents(url: string): RecentState {
  // §10.44: a device preference, not account data. Nothing here is worth
  // syncing, and a list of what someone opened is worth less to them than it
  // would be to anyone reading over their shoulder.
  const [recents, setRecents] = useState<RecentState>(() => {
    try {
      return sanitizeRecents(JSON.parse(platform.storage.getSync(RECENTS_KEY) ?? "null"));
    } catch {
      return NO_RECENTS;
    }
  });

  // The Search Page is not a Scope (§10.19), so being on it records nothing.
  const state = parseSearchUrl(url) !== null ? null : parseTaskUrl(url);
  const scopeKind = state ? state.scope.kind : "";
  const scopeId = state && "id" in state.scope ? state.scope.id : "";
  const taskId = state ? state.taskId : "";

  useEffect(() => {
    if (!state) return;
    setRecents((current) => rememberScope(current, state.scope));
    // `state` is rebuilt on every render; the identity of the place it names
    // is what should trigger this, and that is the two strings below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKind, scopeId]);

  useEffect(() => {
    if (!taskId) return;
    setRecents((current) => rememberTask(current, taskId));
  }, [taskId]);

  useEffect(() => {
    platform.storage.setSync(RECENTS_KEY, JSON.stringify(recents));
  }, [recents]);

  return recents;
}
