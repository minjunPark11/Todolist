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
import { useEffect, useRef } from "react";
import type { Folder, List, SavedFilter, SidebarFolder, Tag } from "../../types";
import type { TaskScopeRef } from "../../domain/tasks/scopeRegistry";
import { queryScopeCount, type ScopeContext } from "../../domain/tasks/scopeQuery";
import { activeTags } from "../../domain/tags/tags";
import { activeSidebarFolders, folderIdFor } from "../../domain/tasks/sidebarFolders";
import { activeSavedFilters } from "../../domain/tasks/filters";
import { isInboxList } from "../../domain/spaces/hierarchy";
import { useT } from "../../i18n";
// §3.52: whichever sidebar the mode renders is the region the expand button
// names. They never co-exist, so the id stays unique.
import { CONTEXT_SIDEBAR_ID } from "../../app/contextSidebar";
import { listColorHex } from "../../domain/tasks/listColor";
import { useFocusTrap } from "../../hooks/useFocusTrap";

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
  onManageLists: () => void;
  /**
   * §1.1/§1.2: opens the Add List dialog. Opening changes nothing else.
   *
   * The argument is the Folder the dialog should start in — "" from the Lists
   * header, a group's id from its own `+`. §1.2 is explicit that this is a
   * DEFAULT and not a constraint: the dialog still lets the user pick another
   * group, or none.
   */
  onCreateList: (contextFolderId: string) => void;
  /** Null on the Search Page, which is not a Scope and highlights nothing. */
  current: TaskScopeRef | null;
  onNavigate: (scope: TaskScopeRef) => void;
  /**
   * The two rows that are addresses rather than Scopes (audit D-21, D-22).
   *
   * Archive and SpaceHub are both inside Tasks — §1.5 refuses either a Rail
   * item — but neither is in `scopeRegistry`, so neither can go through `row`
   * and neither carries a count. Archive becomes a real Scope in P0-4b; the
   * Spaces row is a doorway and will not.
   */
  currentPage: TasksSidebarPage | null;
  onOpenPage: (page: TasksSidebarPage) => void;
}

/**
 * D-20 retired the Archive row: Task archiving is gone and `안 함` took its
 * place as a real Scope. Only the doorway to SpaceHub is left — archived
 * PROJECTS live there, which is a different thing entirely.
 */
export type TasksSidebarPage = "spaces";

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
  onManageLists,
  onCreateList,
  current,
  onNavigate,
  currentPage,
  onOpenPage,
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

  function row(scope: TaskScopeRef, label: string, options: { indent?: boolean; dot?: string } = {}) {
    const count = queryScopeCount(scope, ctx);
    return (
      <button
        key={`${scope.kind}:${"id" in scope ? scope.id : ""}`}
        type="button"
        className={`tm-row${sameScope(scope, current) ? " is-current" : ""}${options.indent ? " is-indented" : ""}`}
        aria-current={sameScope(scope, current) ? "page" : undefined}
        onClick={() => onNavigate(scope)}
      >
        {options.dot ? <span className="tm-dot" style={{ background: options.dot }} aria-hidden /> : null}
        <span className="tm-row-label">{label}</span>
        {/* A zero is not shown. An empty Scope says so on its own screen; a
            column of noughts in the tree is noise (§2.10). */}
        {count > 0 ? <span className="tm-count">{count}</span> : null}
      </button>
    );
  }

  /**
   * A row for a destination that is not a Scope.
   *
   * No count, deliberately. The head of this file says every count comes from
   * `queryScopeCount` and never from a local filter (§12.14) — and neither of
   * these has a Scope to ask. Archive gets its number when it becomes one.
   */
  function pageRow(page: TasksSidebarPage, label: string) {
    return (
      <button
        key={`page:${page}`}
        type="button"
        className={`tm-row${currentPage === page ? " is-current" : ""}`}
        aria-current={currentPage === page ? "page" : undefined}
        onClick={() => onOpenPage(page)}
      >
        <span className="tm-row-label">{label}</span>
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
  // Grouped by `folderIdFor`, the same answer the `folder` Scope reads
  // (§12.4). A List the user has put in a sidebar group is therefore under
  // that group and NOT also under the domain Folder it belongs to — the two
  // showing it twice is exactly what one shared answer prevents.
  const byFolder = new Map<string, List[]>();
  const loose: List[] = [];
  for (const list of treeLists) {
    const groupId = folderIdFor(list);
    if (groupId) {
      const bucket = byFolder.get(groupId) ?? [];
      bucket.push(list);
      byFolder.set(groupId, bucket);
    } else {
      loose.push(list);
    }
  }

  // The user's own groups first, then the ones the domain arranged. Both open
  // the same `folder` Scope, because from the sidebar they are the same kind
  // of thing — a group of Lists (§6.33).
  const groups = [
    ...activeSidebarFolders(sidebarFolders).map((folder) => ({ id: folder.id, name: folder.name })),
    ...folders
      .filter((folder) => !folder.archivedAt && !folder.deletedAt)
      .map((folder) => ({ id: folder.id, name: folder.name })),
  ];

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
        {row({ kind: "today" }, t("tasks.today"))}
        {row({ kind: "upcoming" }, t("tasks.upcoming"))}
        {row({ kind: "inbox" }, t("tasks.inbox"))}
      </div>

      <div className="tm-section">
        {/* The two buttons used to sit INSIDE the `<h2>`, which made the
            heading's accessible name "Lists + Manage" — a screen reader read
            the controls as part of the title. They are beside it now, in a
            row the heading shares. */}
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
          <button
            type="button"
            className="tm-section-action"
            onClick={onManageLists}
            aria-label={t("tasks.manageListsAria")}
          >
            {t("tasks.manageLists")}
          </button>
        </div>
        {groups.map((folder) => {
          const inside = byFolder.get(folder.id) ?? [];
          if (inside.length === 0) return null;
          return (
            <div key={folder.id} className="tm-group">
              <div className="tm-group-head">
                {row({ kind: "folder", id: folder.id }, folder.name)}
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
                    {inside.map((list) =>
                row({ kind: "list", id: list.id }, list.name, { indent: true, dot: listColorHex(list.color) }),
              )}
            </div>
          );
        })}
        {loose.map((list) => row({ kind: "list", id: list.id }, list.name, { dot: listColorHex(list.color) }))}
        {treeLists.length === 0 ? <p className="tm-section-empty">{t("tasks.noLists")}</p> : null}

        {/* D-22's page row, moved in here from a section of its own.
            Standing alone between two groups it read as a row someone had
            dropped in the wrong place; Spaces is where Lists are organised,
            so this is the group it belongs to. It is still not a Scope —
            `pageRow` gives it no count, which is the difference that matters. */}
        {pageRow("spaces", t("tree.section"))}
      </div>

      {visibleTags.length > 0 ? (
        <div className="tm-section">
          <h2 className="tm-section-title">{t("tasks.sectionTags")}</h2>
          {visibleTags.map((tag) =>
            row({ kind: "tag", id: tag.id }, tag.name, { dot: tag.color || "var(--tm-tag-dot)" }),
          )}
        </div>
      ) : null}

      {/* §2.23. Absent rather than empty while the user has saved none — a
          heading over nothing reads as a feature that is broken instead of
          one nobody has used yet. */}
      {visibleFilters.length > 0 ? (
        <div className="tm-section">
          <h2 className="tm-section-title">{t("tasks.sectionFilters")}</h2>
          {visibleFilters.map((filter) => row({ kind: "filter", id: filter.id }, filter.name))}
        </div>
      ) : null}

      <div className="tm-section">
        {row({ kind: "completed" }, t("tasks.completed"))}
        {/* D-23. A real Scope, so unlike the two page rows it carries a count. */}
        {row({ kind: "wontDo" }, t("tasks.wontDo"))}
        {row({ kind: "trash" }, t("tasks.trash"))}
      </div>
    </nav>
  );
}
