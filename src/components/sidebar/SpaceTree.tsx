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
import type { Folder, List, Project } from "../../types";
import { activeFolders, folderlessLists, listsInFolder, shouldRevealLists } from "../../domain/spaces/hierarchy";
import { spaceIdForProject } from "../../domain/spaces/spaces";
import { isSelected, selectedProjectId, type Selection } from "../../app/spaceSelection";
import { useT } from "../../i18n";

interface SpaceTreeProps {
  spaces: Project[];
  folders: Folder[];
  lists: List[];
  selection: Selection;
  /** Open task count per Space id; omitted when the user turned counts off. */
  counts?: Map<string, number>;
  onSelectSpace: (spaceId: string) => void;
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

function ListRow({ list, spaceId, projectId, selection, onSelect, onRename, onArchive, onDropItem }: {
  list: List;
  spaceId: string;
  projectId: string;
  selection: Selection;
  onSelect: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
  onDropItem: (itemKey: string) => void;
}) {
  const { t } = useT();
  const [renaming, setRenaming] = useState(false);
  const [over, setOver] = useState(false);
  const selected = isSelected(selection, { kind: "list", spaceId, projectId, listId: list.id });

  if (renaming) {
    return (
      <form
        className="spt-add-form spt-list-row"
        onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get("name");
          if (typeof name === "string" && name.trim()) onRename(name.trim());
          setRenaming(false);
        }}
      >
        <input autoFocus name="name" defaultValue={list.name} aria-label={t("tree.listName")} onBlur={() => setRenaming(false)} />
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
        {list.name}
      </button>
      <button type="button" className="spt-act" title={t("tree.rename")} onClick={() => setRenaming(true)}>✎</button>
      {/* The default List is the floor an Item falls back to (D5), so it has no
          archive control rather than one that silently refuses. */}
      {list.isDefault ? null : (
        <button type="button" className="spt-act" title={t("common.archive")} onClick={onArchive}>⌫</button>
      )}
    </div>
  );
}

export function SpaceTree({
  spaces, folders, lists, selection, counts,
  onSelectSpace, onSelectList, onSelectFolder, onCreateList, onCreateFolder,
  onRenameList, onArchiveList, onRenameFolder, onArchiveFolder, onMoveItemToList,
}: SpaceTreeProps) {
  const { t } = useT();
  // A selected branch starts open, so a deep link or a reload lands with the
  // list it names already in view rather than behind a closed row.
  //
  // Keyed by PROJECT id, which is what these rows are. `selection.spaceId`
  // names the Space above them since STEP 6 and would never match.
  const [openSpaces, setOpenSpaces] = useState<Set<string>>(() => {
    const projectId = selectedProjectId(selection);
    return new Set(projectId ? [projectId] : []);
  });
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  function toggle(set: Set<string>, id: string, apply: (next: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  }

  return (
    <div className="spt-tree">
      {spaces.map((space) => {
        // Rows are Projects. The Space level above them arrives in STEP 11;
        // until then each row carries the Space its Project hangs in so the
        // paths this tree builds are complete.
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
              <button type="button" className="spt-label" onClick={() => onSelectSpace(space.id)}>
                <span className="spt-dot" style={{ background: space.color }} aria-hidden="true" />
                {space.name}
              </button>
              {counts && count > 0 ? <span className="spt-count">{count}</span> : null}
            </div>

            {open ? (
              <div className="spt-children">
                {spaceFolders.map((folder) => {
                  const folderOpen = openFolders.has(folder.id);
                  const folderRow: Selection = { kind: "folder", spaceId, projectId: space.id, folderId: folder.id };
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
                        <button type="button" className="spt-act" title={t("tree.rename")} onClick={() => {
                          const name = window.prompt(t("tree.renameFolder"), folder.name);
                          if (name && name.trim()) onRenameFolder(folder.id, name.trim());
                        }}>✎</button>
                        <button type="button" className="spt-act" title={t("common.archive")} onClick={() => onArchiveFolder(folder.id)}>⌫</button>
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
    </div>
  );
}
