// Which View a List opens in (Add List design §13.3-§13.9).
//
// `List.defaultViewKey` is stored as a free string on purpose — §13.7, and M0
// makes it a requirement here rather than a preference: a build must never
// strip a View key a newer build wrote. That decision leaves someone holding
// the other half of the bargain, and this file is it. Storage keeps whatever
// was written; opening decides what THIS build can honour.
import type { TaskScopePolicy, TaskViewKind } from "./scopeRegistry";

/**
 * Every View the product names (§13.6), which is deliberately wider than the
 * `TaskViewKind` this module can render. `calendar` is here and has no Tasks
 * Module renderer: a key can be stored, chosen on another client, and read
 * back here without either side losing anything.
 */
export type ListViewKey = "list" | "board" | "calendar" | "gantt";

export const LIST_VIEW_KEYS: readonly ListViewKey[] = ["list", "board", "calendar", "gantt"];

/**
 * What Add List offers (§13.6's `CreateListDefaultViewKey`), narrowed again to
 * what this build can actually open.
 *
 * The design excludes Calendar from the picker on its own terms — *"DB가
 * 허용하는 View ≠ Add List에서 노출하는 View"* — and this module has no
 * Calendar renderer either, so offering it would be a choice that cannot be
 * kept. Offering only what opens is the same rule §17.2 states as the finish
 * line: a default View that does not open is not a default View.
 */
export const CREATE_LIST_VIEW_CHOICES: readonly TaskViewKind[] = ["list", "board", "gantt"];

export function isListViewKey(value: unknown): value is ListViewKey {
  return typeof value === "string" && LIST_VIEW_KEYS.some((key) => key === value);
}

/**
 * §13.9, and the whole reason the stored key is not a union.
 *
 * Three things can be true of a stored key and only one of them opens it: this
 * build may not know the View at all (`calendar`, or something a later release
 * invents), the Scope may not allow it (§5.45 keeps Board and Gantt to the
 * Scopes that are one List's screen), or it may be fine. The first two fall
 * back to the Scope's own default rather than failing, because a List whose
 * chosen View this client cannot draw should still open.
 *
 * Nothing here writes. A fallback is what gets DRAWN, not what gets stored —
 * persisting it would be this build quietly deleting the user's choice on a
 * device that happens not to support it.
 */
export function resolveListView(storedKey: string | undefined, policy: TaskScopePolicy): TaskViewKind {
  if (!storedKey) return policy.defaultView;
  const allowed = policy.allowedViews.find((view) => view === storedKey);
  return allowed ?? policy.defaultView;
}
