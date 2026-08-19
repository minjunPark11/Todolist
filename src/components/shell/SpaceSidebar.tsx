// The Context Sidebar in `space` mode (Nav Shell audit D-14, P0-5).
//
// D-14 said SpaceHub keeps the Space/Project tree that the Tasks sidebar gave
// up, in the same slot. P0-4a made the mode actually choose — but what it
// chose was the whole legacy `Sidebar`, tree and all the rest of it.
//
// The rest of it is now drawn twice. The Rail carries the app mark (§2.8), the
// account (§2.9), Search (§2.14) and Settings (§2.15); the frame owns collapse
// (§3.23). A `오늘` row sat here too, which the Rail's Tasks item answers
// better — it returns you to where you actually were (§2.20) rather than to
// one fixed screen.
//
// So this is the tree and a header, and nothing else. §1.5's ban on Space
// getting a Rail item is exactly why the tree needs a home of its own.
import type { Folder, List, Project, Space, Task } from "../../types";
import type { Selection } from "../../app/spaceSelection";
import { CONTEXT_SIDEBAR_ID } from "../../app/contextSidebar";
import { SpaceTree } from "../sidebar/SpaceTree";
import { listIdFor } from "../../domain/spaces/membership";
import { isTaskOpen } from "../../domain/tasks/taskState";
import { useT } from "../../i18n";

interface SpaceSidebarProps {
  spaces: Space[];
  projects: Project[];
  folders: Folder[];
  lists: List[];
  tasks: Task[];
  selection: Selection;
  showCounts: boolean;
  onCollapse: () => void;
  onSelectSpace: (spaceId: string) => void;
  onSelectProject: (projectId: string) => void;
  onCreateSpace: (name: string) => void;
  onCreateProject: (spaceId: string, name: string) => void;
  onRenameSpace: (spaceId: string, name: string) => void;
  onArchiveSpace: (spaceId: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onArchiveProject: (projectId: string) => void;
  onTogglePinProject: (projectId: string) => void;
  onSelectList: (spaceId: string, listId: string) => void;
  onSelectFolder: (spaceId: string, folderId: string) => void;
  onCreateList: (spaceId: string, name: string, folderId?: string) => void;
  onCreateFolder: (spaceId: string, name: string) => void;
  onRenameList: (listId: string, name: string) => void;
  onArchiveList: (listId: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onArchiveFolder: (folderId: string) => void;
  onMoveItemToList: (itemKey: string, listId: string) => void;
}

export function SpaceSidebar({
  spaces,
  projects,
  folders,
  lists,
  tasks,
  selection,
  showCounts,
  onCollapse,
  ...tree
}: SpaceSidebarProps) {
  const { t } = useT();

  // Two maps rather than deriving the Project number by summing the other.
  // `listIdFor` answers "" for a Task whose Project has no List at all, and an
  // archived List keeps its Tasks — so the sum is not always the Project's
  // total, and a badge the user already reads must not start drifting to make
  // a second one easier to compute.
  const openCountsBySpace = new Map<string, number>();
  const openCountsByList = new Map<string, number>();
  for (const task of tasks) {
    if (!task.projectId || !isTaskOpen(task)) continue;
    openCountsBySpace.set(task.projectId, (openCountsBySpace.get(task.projectId) ?? 0) + 1);
    const listId = listIdFor(task, lists);
    if (listId) openCountsByList.set(listId, (openCountsByList.get(listId) ?? 0) + 1);
  }

  return (
    <nav id={CONTEXT_SIDEBAR_ID} className="space-sidebar" aria-label={t("tree.section")}>
      {/* §3.10: a header of the same height as the Main one, carrying the
          scope's name and the collapse button (§3.23) — and nothing that the
          Rail already offers. */}
      <header className="space-sidebar-head">
        <h2 className="space-sidebar-title">{t("tree.section")}</h2>
        <button
          type="button"
          className="space-sidebar-collapse"
          aria-label={t("sidebar.collapse")}
          /* §3.52: the same region the expand button names, so the two read as
             one control rather than as two unrelated buttons. */
          aria-expanded
          aria-controls={CONTEXT_SIDEBAR_ID}
          title={t("sidebar.collapse")}
          onClick={onCollapse}
        >
          «
        </button>
      </header>

      <div className="space-sidebar-body">
        <SpaceTree
          workAreas={spaces}
          projects={projects}
          folders={folders}
          lists={lists}
          selection={selection}
          counts={showCounts ? openCountsBySpace : undefined}
          listCounts={showCounts ? openCountsByList : undefined}
          {...tree}
        />
      </div>
    </nav>
  );
}
