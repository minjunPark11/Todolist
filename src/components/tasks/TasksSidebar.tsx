// The Tasks Module sidebar (TickTick plan §2.7).
//
// The section order is fixed by the plan and is not a layout preference:
// Smart Lists, then the List tree, then Tags, then Filters, then the two
// system Scopes. It is §1.14's Presentation IA — what the user is shown is not
// the domain's `Space > Project > Folder > List` ladder, which is the tree
// this screen exists to replace.
//
// Every count comes from `queryScopeCount`, never from a local filter. §12.14
// forbids a screen from inventing a count formula, and §6.94 asks the sidebar
// and the thing it points at to run the same query — the two numbers
// disagreeing is what v0.10.1 and v0.10.2 each fixed by hand.
import { useEffect, useRef, type ReactNode } from "react";
import type { Folder, List, SavedFilter, SidebarFolder, Tag } from "../../types";
import type { TaskScopeRef } from "../../domain/tasks/scopeRegistry";
import { queryScopeCount, type ScopeContext } from "../../domain/tasks/scopeQuery";
import { activeTags } from "../../domain/tags/tags";
import {
  activeSidebarFolders,
  folderIdFor,
  isFolderCollapsed,
  listsInFolder,
} from "../../domain/tasks/sidebarFolders";
import { activeSavedFilters } from "../../domain/tasks/filters";
import { isInboxList } from "../../domain/spaces/hierarchy";
import { useT } from "../../i18n";
// §3.52: whichever sidebar the mode renders is the region the expand button
// names. They never co-exist, so the id stays unique.
import { CONTEXT_SIDEBAR_ID } from "../../app/contextSidebar";
import { listColorHex } from "../../domain/tasks/listColor";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Caret } from "../common/Caret";
import {
  CompletedIcon,
  FilterIcon,
  FolderIcon,
  FolderOpenIcon,
  InboxIcon,
  ListIcon,
  TagIcon,
  TodayIcon,
  TrashIcon,
  UpcomingIcon,
} from "./treeIcons";

/**
 * §3.50: what this sidebar IS depends on how it is presented.
 *
 * Beside the content it is a navigation landmark. Over the content, behind a
 * scrim, it is a drawer — a modal-like surface, which is a different promise:
 * Tab stays inside it, Escape closes it, and focus goes back where it came
 * from. Passing this is how the caller says which one it is asking for.
 */
export interface SidebarDrawer {
  open: boolean;
  onClose: () => void;
}

interface TasksSidebarProps {
  /** Null when the sidebar is a persistent column (§15.15). */
  drawer?: SidebarDrawer | null;
  ctx: ScopeContext;
  folders: Folder[];
  sidebarFolders: SidebarFolder[];
  tags: Tag[];
  savedFilters: SavedFilter[];
  /** §13.25's management surface, opened from the Lists section. */
  /**
   * §1.1/§1.2: opens the Add List dialog. Opening changes nothing else.
   *
   * The argument is the Folder the dialog should start in — "" from the Lists
   * header, a group's id from its own `+`. §1.2 is explicit that this is a
   * DEFAULT and not a constraint: the dialog still lets the user pick another
   * group, or none.
   */
  onCreateList: (contextFolderId: string) => void;
  /**
   * The groups folded away (FOLDER_TREE_AND_VIEW_DESIGN.md §13.1).
   *
   * One array for both kinds of group. Absent reads as nothing folded, which
   * is what this tree did before it could fold.
   */
  collapsedFolderIds?: string[];
  onToggleFolder?: (folderId: string) => void;
  /** Null on the Search Page, which is not a Scope and highlights nothing. */
  current: TaskScopeRef | null;
  onNavigate: (scope: TaskScopeRef) => void;
}

function sameScope(a: TaskScopeRef, b: TaskScopeRef | null): boolean {
  if (!b || a.kind !== b.kind) return false;
  return ("id" in a ? a.id : "") === ("id" in b ? b.id : "");
}

export function TasksSidebar({
  drawer = null,
  ctx,
  folders,
  sidebarFolders,
  tags,
  savedFilters,
  onCreateList,
  collapsedFolderIds,
  onToggleFolder,
  current,
  onNavigate,
}: TasksSidebarProps) {
  const { t } = useT();
  const root = useRef<HTMLElement>(null);
  const isOpenDrawer = Boolean(drawer?.open);

  // §3.50. Only while it is actually over the content: a persistent column
  // that trapped Tab would be a column you cannot leave.
  useFocusTrap(root, { enabled: isOpenDrawer });

  useEffect(() => {
    if (!isOpenDrawer) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      drawer?.onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpenDrawer, drawer]);

  function row(
    scope: TaskScopeRef,
    label: string,
    options: { indent?: boolean; dot?: string; icon?: ReactNode } = {},
  ) {
    const count = queryScopeCount(scope, ctx);
    return (
      <button
        key={`${scope.kind}:${"id" in scope ? scope.id : ""}`}
        type="button"
        className={`tm-row${sameScope(scope, current) ? " is-current" : ""}${options.indent ? " is-indented" : ""}`}
        aria-current={sameScope(scope, current) ? "page" : undefined}
        onClick={() => onNavigate(scope)}
      >
        {/* What KIND of row this is (FOLDER_TREE_AND_VIEW_DESIGN.md §3). Every
            row has one, including the Smart Lists — §3.4: give the glyph to
            some rows and not others and the labels of one column start at two
            different x. */}
        {options.icon ? (
          <span className="tm-row-icon" aria-hidden="true">
            {options.icon}
          </span>
        ) : null}
        <span className="tm-row-label">{label}</span>
        {/* §3.2: the colour moved here from in front of the label. The leading
            slot answers one question — what kind of row — and the trailing
            slot answers the rest: which List, and how much is in it. */}
        {options.dot ? <span className="tm-dot" style={{ background: options.dot }} aria-hidden /> : null}
        {/* A zero is not shown. An empty Scope says so on its own screen; a
            column of noughts in the tree is noise (§2.10). */}
        {count > 0 ? <span className="tm-count">{count}</span> : null}
      </button>
    );
  }

  // The Inbox is a List, but it is shown among the Smart Lists and never in
  // the tree — it belongs to no Project and has nowhere in the tree to hang.
  // §13.21/§13.22: a List that has been put away leaves the tree. It is not
  // gone — Manage is where both states are — but it is not a place to file
  // work in any more, so it does not sit among the ones that are.
  // A List made from this sidebar belongs to no Project — §6.3 makes that
  // first-class, and `standaloneLists` has answered for it all along with
  // nothing rendering the answer. Requiring `projectId` here is what would
  // have made a newly created List invisible the moment it was made.
  const treeLists = ctx.lists.filter(
    (list) => !isInboxList(list) && !list.archivedAt && !list.deletedAt && (list.projectId || list.kind === "regular"),
  );
  // The user's own groups first, then the ones the domain arranged. Both open
  // the same `folder` Scope, because from the sidebar they are the same kind
  // of thing — a group of Lists (§6.33).
  const groups = [
    ...activeSidebarFolders(sidebarFolders).map((folder) => ({ id: folder.id, name: folder.name })),
    ...folders
      .filter((folder) => !folder.archivedAt && !folder.deletedAt)
      .map((folder) => ({ id: folder.id, name: folder.name })),
  ];

  // Grouped by `folderIdFor`, the same answer the `folder` Scope reads
  // (§12.4). A List the user has put in a sidebar group is therefore under
  // that group and NOT also under the domain Folder it belongs to — the two
  // showing it twice is exactly what one shared answer prevents.
  //
  // Ordered by `listsInFolder`, which is now the app's only answer to that
  // question (FOLDER_TREE_AND_VIEW_DESIGN.md §5.2). This used to keep whatever
  // order `ctx.lists` happened to be in, so a Folder's Board columns and its
  // sidebar children could disagree — and once the list view groups by List
  // too, that disagreement would be on screen twice at once.
  const byFolder = new Map<string, List[]>(
    groups.map((folder) => [folder.id, listsInFolder(folder.id, treeLists)]),
  );

  // A List whose group is not among them still has to be SOMEWHERE. Its
  // `folderId` can name a Folder that was archived or deleted, and such a List
  // used to land in a bucket nothing rendered — present in the account, on no
  // screen, which is the worst state a List can be in. It shows at the top
  // level instead, which is where a List with no group belongs.
  const grouped = new Set(groups.flatMap((folder) => byFolder.get(folder.id)?.map((list) => list.id) ?? []));
  const loose = treeLists.filter((list) => !grouped.has(list.id));

  const visibleTags = activeTags(tags);
  const visibleFilters = activeSavedFilters(savedFilters);

  return (
    <nav
      ref={root}
      id={CONTEXT_SIDEBAR_ID}
      className="tm-sidebar"
      aria-label={t("tasks.navLabel")}
      // §3.50: a drawer over the content announces itself as one — while it
      // is OPEN. A closed drawer claiming `aria-modal` would be telling a
      // screen reader the page behind it is inert when nothing is covering
      // it. The landmark role is given up only for as long as the modal is
      // really there; on a phone, knowing you are inside one is worth more
      // than having a second landmark to jump between.
      {...(isOpenDrawer ? { role: "dialog" as const, "aria-modal": true } : {})}
    >
      <div className="tm-section">
        {row({ kind: "today" }, t("tasks.today"), { icon: <TodayIcon /> })}
        {row({ kind: "upcoming" }, t("tasks.upcoming"), { icon: <UpcomingIcon /> })}
        {row({ kind: "inbox" }, t("tasks.inbox"), { icon: <InboxIcon /> })}
      </div>

      <div className="tm-section">
        {/* One button, and it used to be two. `Manage` opened the dialog that
            was the only door to archived and deleted Lists; the Trash is that
            door now (§16.7), so the row is the heading and the `+`.

            The `+` sits BESIDE the `<h2>` rather than inside it: buttons in
            the heading made its accessible name "Lists + Manage", which a
            screen reader read as part of the title. */}
        <div className="tm-section-head">
          <h2 className="tm-section-title">{t("tasks.sectionLists")}</h2>
          {/* §1.1. `Lists +` opens the dialog with no Folder context; the
              current Scope and the URL are untouched (§0.7 R0-3). */}
          <button
            type="button"
            className="tm-section-action"
            onClick={() => onCreateList("")}
            aria-label={t("tasks.createList")}
          >
            +
          </button>
        </div>
        {groups.map((folder) => {
          const inside = byFolder.get(folder.id) ?? [];
          if (inside.length === 0) return null;
          const collapsed = isFolderCollapsed(collapsedFolderIds, folder.id);
          return (
            <div key={folder.id} className="tm-group">
              <div className="tm-group-head">
                {/* §13.2: the fold is this button's job and the row's job is
                    still to go to the Folder — which is worth going to now that
                    its screen is divided by List (§5). The caret is the app's
                    own (`common/Caret`), which four other groups already use. */}
                <button
                  type="button"
                  className="tm-group-fold"
                  aria-expanded={!collapsed}
                  aria-label={t(collapsed ? "tasks.expandFolder" : "tasks.collapseFolder", {
                    folder: folder.name,
                  })}
                  onClick={() => onToggleFolder?.(folder.id)}
                >
                  <Caret open={!collapsed} />
                </button>
                {/* §13.3: the glyph says the same thing the caret does, on
                    purpose — in a long tree the eye finds the 16px mark before
                    the 12px one. */}
                {row({ kind: "folder", id: folder.id }, folder.name, {
                  icon: collapsed ? <FolderIcon /> : <FolderOpenIcon />,
                })}
                {/* §1.2. Same dialog, one default filled in. */}
                <button
                  type="button"
                  className="tm-group-action"
                  onClick={() => onCreateList(folder.id)}
                  aria-label={t("tasks.createListIn", { folder: folder.name })}
                >
                  +
                </button>
              </div>
              {/* Not rendered at all when folded, rather than hidden with CSS:
                  a folded Folder's children should be out of the tab order and
                  out of a screen reader's reading of it, and `display: none`
                  on a dozen buttons is a thing to remember rather than a thing
                  the markup says. */}
              {collapsed
                ? null
                : inside.map((list) =>
                    row({ kind: "list", id: list.id }, list.name, {
                      indent: true,
                      icon: <ListIcon />,
                      dot: listColorHex(list.color),
                    }),
                  )}
            </div>
          );
        })}
        {loose.map((list) =>
          row({ kind: "list", id: list.id }, list.name, { icon: <ListIcon />, dot: listColorHex(list.color) }),
        )}
        {treeLists.length === 0 ? <p className="tm-section-empty">{t("tasks.noLists")}</p> : null}
      </div>

      {visibleTags.length > 0 ? (
        <div className="tm-section">
          <h2 className="tm-section-title">{t("tasks.sectionTags")}</h2>
          {visibleTags.map((tag) =>
            row({ kind: "tag", id: tag.id }, tag.name, {
              icon: <TagIcon />,
              dot: tag.color || "var(--tm-tag-dot)",
            }),
          )}
        </div>
      ) : null}

      {/* §2.23. Absent rather than empty while the user has saved none — a
          heading over nothing reads as a feature that is broken instead of
          one nobody has used yet. */}
      {visibleFilters.length > 0 ? (
        <div className="tm-section">
          <h2 className="tm-section-title">{t("tasks.sectionFilters")}</h2>
          {visibleFilters.map((filter) => row({ kind: "filter", id: filter.id }, filter.name, { icon: <FilterIcon /> }))}
        </div>
      ) : null}

      {/* Two system Scopes, not three. `안 함` had a row of its own here and
          does not any more: a task given up on is finished work, and TickTick
          — the IA this module follows — files it under Completed rather than
          in a third terminal list nobody visits. The Scope itself is intact
          (`/wont-do` still opens, so old links do), and `completed` gathers
          both, so nothing became unreachable by losing the row.

          The doors to Projects and Goals went with it. Both are screens, not
          Scopes: they carried no count, they narrowed nothing, and a sidebar
          of places to filter by is easier to read without two rows that jump
          somewhere else instead. Both pages keep their addresses. */}
      <div className="tm-section">
        {row({ kind: "completed" }, t("tasks.completed"), { icon: <CompletedIcon /> })}
        {row({ kind: "trash" }, t("tasks.trash"), { icon: <TrashIcon /> })}
      </div>
    </nav>
  );
}
