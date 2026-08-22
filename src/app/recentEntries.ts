// Recent places, resolved to what the Command Menu can draw (§10.43).
//
// `domain/tasks/recents` stores references — a Scope, a Task id — and stops
// there on purpose, the same way `domain/tasks/search` answers with records
// rather than URLs. Turning a reference into a label and an address is the
// app layer's job, because only this layer knows the routes.
//
// This ran inside the Tasks Module until D-25. The menu is global now, so the
// list it shows is built above both shells.
import type { Task } from "../types";
import type { SearchCollections } from "../domain/tasks/search";
import type { RecentState } from "../domain/tasks/recents";
import type { RecentEntry } from "../components/shell/CommandMenu";
import { namedRecordMissing, titleFor } from "../domain/tasks/scopeTitle";
import { listIdFor } from "../domain/spaces/membership";
import { taskUrlFor, urlForSearchResult } from "./taskScopeUrl";

/**
 * §10.43's five and five, with anything whose record has gone left out —
 * a recent row that opens a deleted Task is worse than one row fewer.
 */
export function recentEntriesFrom(
  recents: RecentState,
  collections: SearchCollections,
  t: (key: string) => string,
): RecentEntry[] {
  const { tasks, lists, folders, sidebarFolders, tags, savedFilters } = collections;
  return [
    ...recents.scopes
      .filter((entry) => !namedRecordMissing(entry, lists, folders, sidebarFolders, tags, savedFilters))
      .map((entry) => ({
        key: `scope:${entry.kind}:${"id" in entry ? entry.id : ""}`,
        label: titleFor(entry, lists, folders, sidebarFolders, tags, savedFilters, t),
        url: taskUrlFor({ scope: entry, view: "list", taskId: "" }),
      })),
    ...recents.taskIds
      .map((taskId) => tasks.find((task) => task.id === taskId))
      .filter((task): task is Task => Boolean(task) && !task!.deletedAt)
      .map((task) => ({
        key: `task:${task.id}`,
        label: task.title,
        sublabel: t("tasks.recentTask"),
        url: urlForSearchResult(
          { kind: "task", id: task.id, title: task.title, ownerListId: listIdFor(task, lists) },
          lists,
        ),
      })),
  ];
}
