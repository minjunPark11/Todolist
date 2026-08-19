// The sidebar IS the Space explorer (SPACES_CLICKUP_UI_DESIGN U1).
//
// Space -> Folder? -> List, the hierarchy the domain has held since
// `domain/spaces/hierarchy.ts` landed with no screen to show it. Nothing here
// decides anything: `activeFolders`, `folderlessLists`, `listsInFolder` and
// `shouldRevealLists` already answer, and this draws their answers.
//
// U2 is the one place this deliberately leaves ClickUp: a Space with a single
// List hides the List level entirely, so simple use never pays for the
// hierarchy. The reveal is ONE-WAY — see `shouldRevealLists`.
import { useState } from "react";
import type { Folder, List, Project, Space } from "../../types";
import { activeFolders, folderlessLists, listDisplayName, listsInFolder, shouldRevealLists } from "../../domain/spaces/hierarchy";
import { activeSpaces, projectsInSpace, shouldRevealSpaces, spaceIdForProject } from "../../domain/spaces/spaces";
import { isSelected, selectedProjectId, selectedSpaceId, type Selection } from "../../app/spaceSelection";
import { useT } from "../../i18n";

interface SpaceTreeProps {
  /** The work areas — the level STEP 11 added above Project. */
  workAreas: Space[];
  /** Every active Project; each row is filed under its `spaceId`. */
  projects: Project[];
  folders: Folder[];
  lists: List[];
  selection: Selection;
  /** Open task count per PROJECT id; a Space sums the ones under it. */
  counts?: Map<string, number>;
  /** The same, per LIST id; a Folder sums the Lists inside it. */
  listCounts?: Map<string, number>;
  onSelectSpace: (spaceId: string) => void;
  onSelectProject: (projectId: string) => void;
  onCreateSpace: (name: string) => void;
  onCreateProject: (spaceId: string, name: string) => void;
  // Row actions. These were the card grid's row menu; the grid went with U1,
  // so they live on the rows they always described.
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
  /** A card dragged from a board onto a List row. Key is `Item.key`. */
  onMoveItemToList: (itemKey: string, listId: string) => void;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`spt-chevron${open ? " is-open" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

interface RowAction {
  id: string;
  label: string;
  onSelect: () => void;
}

/**
 * One target per row instead of three.
 *
 * The actions used to sit on the row as bare glyphs — 16x14px and transparent
 * until hover. That is under WCAG 2.5.8's 24x24 minimum, and hover is a
 * gesture a touch device does not have, so rename and archive had no reachable
 * path at all there. A single always-visible button carries them now: the row
 * still reads as a name, and what it can do is one press away on any input.
 *
 * Which actions a row gets is still the row's decision — an action that would
 * refuse is not passed in, so the menu never offers one that cannot run
 * (H-INV-06).
 */
function RowMenu({ actions }: { actions: RowAction[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <div className="spt-menu">
      <button
        type="button"
        className="spt-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("tree.more")}
        title={t("tree.more")}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open ? (
        <div
          className="spt-menu-list"
          role="menu"
          // focusout bubbles, so this closes on the same gesture that dismisses
          // any menu — moving focus out of it — without a document listener.
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          {actions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className="spt-menu-item"
              autoFocus={index === 0}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Inline, because a modal to name a list is more ceremony than the act (§4). */
function InlineAdd({ label, placeholder, onSubmit }: { label: string; placeholder: string; onSubmit: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button type="button" className="spt-add" onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  }
  return (
    <form
      className="spt-add-form"
      onSubmit={(event) => {
        event.preventDefault();
        const name = value.trim();
        if (name) onSubmit(name);
        setValue("");
        setOpen(false);
      }}
    >
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => { setValue(""); setOpen(false); }}
        onKeyDown={(event) => { if (event.key === "Escape") { setValue(""); setOpen(false); } }}
      />
    </form>
  );
}

function ListRow({ list, spaceId, projectId, selection, count, onSelect, onRename, onArchive, onDropItem }: {
  list: List;
  spaceId: string;
  projectId: string;
  selection: Selection;
  /** Undefined when counts are switched off, which is not the same as zero. */
  count?: number;
  onSelect: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
  onDropItem: (itemKey: string) => void;
}) {
  const { t } = useT();
  const [renaming, setRenaming] = useState(false);
  const [over, setOver] = useState(false);
  const selected = isSelected(selection, { kind: "list", spaceId, projectId, listId: list.id });
  const displayName = listDisplayName(list, t("list.defaultName"));

  if (renaming) {
    return (
      <form
        className="spt-add-form spt-list-row"
        onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get("name");
          // Unchanged means unchanged. The field is seeded with the TRANSLATED
          // default, so writing it back would turn the app's word into the
          // user's — and then it would stop following the language.
          if (typeof name === "string" && name.trim() && name.trim() !== displayName) {
            onRename(name.trim());
          }
          setRenaming(false);
        }}
      >
        <input autoFocus name="name" defaultValue={displayName} aria-label={t("tree.listName")} onBlur={() => setRenaming(false)} />
      </form>
    );
  }

  return (
    <div
      className={`spt-row spt-list-row${selected ? " is-selected" : ""}${over ? " is-over" : ""}`}
      // A List is where an Item is stored, so it is the one row in the tree
      // that can be dropped on. `text/item` is what BoardView already writes.
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("text/item")) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const key = event.dataTransfer.getData("text/item");
        if (!key) return;
        event.preventDefault();
        onDropItem(key);
      }}
    >
      <button type="button" className="spt-label" onClick={onSelect}>
        {displayName}
      </button>
      {count ? <span className="spt-count">{count}</span> : null}
      <RowMenu
        actions={[
          { id: "rename", label: t("tree.rename"), onSelect: () => setRenaming(true) },
          // The default List is the floor an Item falls back to (D5), so it has
          // no archive action rather than one that silently refuses.
          ...(list.isDefault ? [] : [{ id: "archive", label: t("common.archive"), onSelect: onArchive }]),
        ]}
      />
    </div>
  );
}

export function SpaceTree({
  workAreas, projects, folders, lists, selection, counts, listCounts,
  onSelectSpace, onSelectProject, onCreateSpace, onCreateProject,
  onRenameSpace, onArchiveSpace, onRenameProject, onArchiveProject, onTogglePinProject,
  onSelectList, onSelectFolder, onCreateList, onCreateFolder,
  onRenameList, onArchiveList, onRenameFolder, onArchiveFolder, onMoveItemToList,
}: SpaceTreeProps) {
  const { t } = useT();
  // A selected branch starts open at BOTH levels, so a deep link or a reload
  // lands with the list it names in view rather than behind two closed rows.
  // Each set is keyed by the id of the rows it controls.
  const [openAreas, setOpenAreas] = useState<Set<string>>(() => {
    const spaceId = selectedSpaceId(selection);
    return new Set(spaceId ? [spaceId] : []);
  });
  const [openSpaces, setOpenSpaces] = useState<Set<string>>(() => {
    const projectId = selectedProjectId(selection);
    return new Set(projectId ? [projectId] : []);
  });
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  // An archived work area is not a place to file work in, so it is not in the
  // tree — and it is not in the count that decides whether the level is drawn
  // either. Both questions read the same list, or an archived second Space
  // would hide the level while still drawing a row on it.
  const areas = activeSpaces(workAreas);
  const revealAreas = shouldRevealSpaces(workAreas);

  function toggle(set: Set<string>, id: string, apply: (next: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  }

  return (
    <div className="spt-tree">
      {areas.map((area) => {
        // The only work area is drawn as no work area at all: its Projects
        // ARE the top of the tree, and there is no row to expand past.
        const flat = !revealAreas;
        const areaOpen = flat || openAreas.has(area.id);
        const areaProjects = projectsInSpace(projects, area.id);
        const areaCount = areaProjects.reduce((sum, project) => sum + (counts?.get(project.id) ?? 0), 0);
        const areaSelected = isSelected(selection, { kind: "space", spaceId: area.id });

        return (
          <div key={area.id} className="spt-area">
            {flat ? null : (
            <div className={`spt-row spt-area-row${areaSelected ? " is-selected" : ""}`}>
              <button
                type="button"
                className="spt-twisty"
                aria-expanded={areaOpen}
                aria-label={areaOpen ? t("tree.collapse") : t("tree.expand")}
                onClick={() => toggle(openAreas, area.id, setOpenAreas)}
              >
                <Chevron open={areaOpen} />
              </button>
              <button type="button" className="spt-label" onClick={() => onSelectSpace(area.id)}>
                <span className="spt-dot" style={{ background: area.color }} aria-hidden="true" />
                {area.name}
              </button>
              {counts && areaCount > 0 ? <span className="spt-count">{areaCount}</span> : null}
              <RowMenu
                actions={[
                  {
                    id: "rename",
                    label: t("tree.rename"),
                    onSelect: () => {
                      const name = window.prompt(t("tree.renameSpace"), area.name);
                      if (name && name.trim()) onRenameSpace(area.id, name.trim());
                    },
                  },
                  // H-INV-06: a Space holding Projects is not deletable, so the
                  // action is absent rather than one that refuses on click.
                  ...(areaProjects.length === 0
                    ? [{ id: "archive", label: t("common.archive"), onSelect: () => onArchiveSpace(area.id) }]
                    : []),
                ]}
              />
            </div>
            )}
            {!areaOpen ? null : (
      <div className={flat ? "spt-area-flat" : "spt-children"}>
      {areaProjects.map((space) => {
        // Project rows. `spaceIdForProject` rather than `area.id` so the path
        // is built from the record, not from where it happens to be drawn.
        const spaceId = spaceIdForProject(space);
        const open = openSpaces.has(space.id);
        const spaceFolders = activeFolders(folders, space.id);
        const loose = folderlessLists(lists, space.id);
        const revealed = shouldRevealLists(lists, space.id, space.listsRevealed);
        const count = counts?.get(space.id) ?? 0;
        const selected = isSelected(selection, { kind: "project", spaceId, projectId: space.id });

        return (
          <div key={space.id} className="spt-space">
            <div className={`spt-row spt-space-row${selected ? " is-selected" : ""}`}>
              <button
                type="button"
                className="spt-twisty"
                aria-expanded={open}
                aria-label={open ? t("tree.collapse") : t("tree.expand")}
                onClick={() => toggle(openSpaces, space.id, setOpenSpaces)}
              >
                <Chevron open={open} />
              </button>
              <button type="button" className="spt-label" onClick={() => onSelectProject(space.id)}>
                <span className="spt-dot" style={{ background: space.color }} aria-hidden="true" />
                {space.pinned ? "★ " : ""}
                {space.name}
              </button>
              {counts && count > 0 ? <span className="spt-count">{count}</span> : null}
              {/* The card grid's row menu lived here in everything but name.
                  Moving it onto the row is what let that screen go (U1) — and
                  it is a menu again, rather than three glyphs too small to hit. */}
              <RowMenu
                actions={[
                  {
                    id: "pin",
                    label: space.pinned ? t("tree.unpin") : t("tree.pin"),
                    onSelect: () => onTogglePinProject(space.id),
                  },
                  {
                    id: "rename",
                    label: t("tree.rename"),
                    onSelect: () => {
                      const name = window.prompt(t("tree.renameProject"), space.name);
                      if (name && name.trim()) onRenameProject(space.id, name.trim());
                    },
                  },
                  { id: "archive", label: t("common.archive"), onSelect: () => onArchiveProject(space.id) },
                ]}
              />
            </div>

            {open ? (
              <div className="spt-children">
                {spaceFolders.map((folder) => {
                  const folderOpen = openFolders.has(folder.id);
                  const folderRow: Selection = { kind: "folder", spaceId, projectId: space.id, folderId: folder.id };
                  // Summed from the Lists inside, the same way a Space sums its
                  // Projects — otherwise closing a Folder hides its numbers.
                  const folderCount = listCounts
                    ? listsInFolder(lists, folder.id).reduce((sum, list) => sum + (listCounts.get(list.id) ?? 0), 0)
                    : 0;
                  return (
                    <div key={folder.id} className="spt-folder">
                      <div className={`spt-row spt-folder-row${isSelected(selection, folderRow) ? " is-selected" : ""}`}>
                        <button
                          type="button"
                          className="spt-twisty"
                          aria-expanded={folderOpen}
                          aria-label={folderOpen ? t("tree.collapse") : t("tree.expand")}
                          onClick={() => toggle(openFolders, folder.id, setOpenFolders)}
                        >
                          <Chevron open={folderOpen} />
                        </button>
                        {/* A destination now that the filter language can
                            express one: selecting a Folder scopes the view to
                            the Lists inside it (§16). */}
                        <button
                          type="button"
                          className="spt-label spt-folder-label"
                          onClick={() => onSelectFolder(space.id, folder.id)}
                        >
                          {folder.name}
                        </button>
                        {folderCount ? <span className="spt-count">{folderCount}</span> : null}
                        <RowMenu
                          actions={[
                            {
                              id: "rename",
                              label: t("tree.rename"),
                              onSelect: () => {
                                const name = window.prompt(t("tree.renameFolder"), folder.name);
                                if (name && name.trim()) onRenameFolder(folder.id, name.trim());
                              },
                            },
                            { id: "archive", label: t("common.archive"), onSelect: () => onArchiveFolder(folder.id) },
                          ]}
                        />
                      </div>
                      {folderOpen ? (
                        <div className="spt-children">
                          {listsInFolder(lists, folder.id).map((list) => (
                            <ListRow
                              key={list.id}
                              list={list}
                              spaceId={spaceId}
                              projectId={space.id}
                              selection={selection}
                              count={listCounts?.get(list.id)}
                              onSelect={() => onSelectList(space.id, list.id)}
                              onRename={(name) => onRenameList(list.id, name)}
                              onArchive={() => onArchiveList(list.id)}
                              onDropItem={(key) => onMoveItemToList(key, list.id)}
                            />
                          ))}
                          <InlineAdd
                            label={t("tree.list")}
                            placeholder={t("tree.listPlaceholder")}
                            onSubmit={(name) => onCreateList(space.id, name, folder.id)}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {/* Hidden until a second List has existed (U2). The Space row
                    already opens the default List, so there is nothing to
                    click that a single row would add. */}
                {revealed
                  ? loose.map((list) => (
                      <ListRow
                        key={list.id}
                        list={list}
                        spaceId={spaceId}
                        projectId={space.id}
                        selection={selection}
                        count={listCounts?.get(list.id)}
                        onSelect={() => onSelectList(space.id, list.id)}
                        onRename={(name) => onRenameList(list.id, name)}
                        onArchive={() => onArchiveList(list.id)}
                        onDropItem={(key) => onMoveItemToList(key, list.id)}
                      />
                    ))
                  : null}

                {/* Offered even while the level is hidden: this is how the
                    second List — and with it the whole level — comes to be. */}
                <InlineAdd
                  label={t("tree.list")}
                  placeholder={t("tree.listPlaceholder")}
                  onSubmit={(name) => onCreateList(space.id, name)}
                />
                {/* Folders are not suggested first (§4): they exist only once
                    someone asks for one. */}
                <InlineAdd
                  label={t("tree.folder")}
                  placeholder={t("tree.folderPlaceholder")}
                  onSubmit={(name) => onCreateFolder(space.id, name)}
                />
              </div>
            ) : null}
          </div>
        );
      })}
              {/* A Project is created INSIDE a Space now — the flat field at
                  the bottom of the sidebar could not say which one. */}
              <InlineAdd
                label={t("tree.project")}
                placeholder={t("tree.projectPlaceholder")}
                onSubmit={(name) => onCreateProject(area.id, name)}
              />
      </div>
            )}
          </div>
        );
      })}
      {/* Offered even while the level is hidden — the same bargain U2 makes
          for Lists: this is how the second work area, and with it the level
          itself, comes to be. */}
      <InlineAdd
        label={t("tree.space")}
        placeholder={t("tree.spacePlaceholder")}
        onSubmit={onCreateSpace}
      />
    </div>
  );
}
