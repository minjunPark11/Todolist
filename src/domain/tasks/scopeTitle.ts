// What a Scope is CALLED, and whether the record it names still exists.
//
// Both of these used to live inside the Tasks Module, which was fine while it
// was the only thing that had to name a Scope. D-25 made the Command Menu
// global, and its recent-places list asks exactly these two questions from
// outside the Module — so the answers moved somewhere both can reach rather
// than being written a second time.
import type { Folder, List, SavedFilter, SidebarFolder, Tag } from "../../types";
import type { TaskScopeRef } from "./scopeRegistry";
import { listDisplayName } from "../spaces/hierarchy";

export function namedRecordMissing(
  scope: TaskScopeRef,
  lists: List[],
  folders: Folder[],
  sidebarFolders: SidebarFolder[],
  tags: Tag[],
  savedFilters: SavedFilter[],
): boolean {
  switch (scope.kind) {
    case "list":
      return !lists.some((list) => list.id === scope.id);
    // Either kind of group — the sidebar's own or the domain's — is a record
    // the link can name, and the Scope reads both through `folderIdFor`.
    case "folder":
      return !folders.some((folder) => folder.id === scope.id) && !sidebarFolders.some((folder) => folder.id === scope.id);
    case "tag":
      return !tags.some((tag) => tag.id === scope.id);
    case "filter":
      return !savedFilters.some((filter) => filter.id === scope.id);
    default:
      return false;
  }
}

export function titleFor(
  scope: TaskScopeRef,
  lists: List[],
  folders: Folder[],
  sidebarFolders: SidebarFolder[],
  tags: Tag[],
  savedFilters: SavedFilter[],
  t: (key: string) => string,
): string {
  switch (scope.kind) {
    case "list": {
      const list = lists.find((entry) => entry.id === scope.id);
      // Through `listDisplayName`, so the Inbox reads in the user's language
      // rather than under the name the app stored it with (§6.7).
      return list ? listDisplayName(list, t("tasks.defaultList"), t("tasks.inbox")) : scope.id;
    }
    case "folder":
      return (
        sidebarFolders.find((entry) => entry.id === scope.id)?.name ??
        folders.find((entry) => entry.id === scope.id)?.name ??
        scope.id
      );
    case "tag":
      return tags.find((entry) => entry.id === scope.id)?.name ?? scope.id;
    // The Filter's own name, because that is what the user called this
    // question — the generic word is only for one that names no record.
    case "filter":
      return savedFilters.find((entry) => entry.id === scope.id)?.name ?? t("tasks.filter");
    default:
      return t(`tasks.${scope.kind}`);
  }
}
