// Folder management, inside the Project that owns them (SPACE_REMOVAL_IA D-2).
//
// A domain Folder groups the Lists of one Project (`Folder.projectId`), and
// until now the only place to make, rename or archive one was a row menu in
// the Space tree — a sidebar, three levels down, on a screen the IA is taking
// away. The management belongs with the owner.
//
// This is NOT the Tasks sidebar's group (`SidebarFolder`). The two are
// different records answering different questions, and §12.4's `folderIdFor`
// is what keeps a List from being filed twice; merging them is the one thing
// D-2 says this change must not do.
//
// Every action here lands immediately. That is why it is not a section of the
// settings drawer, which drafts its fields behind a Save — a Cancel that
// reverted the name but not the folder you just made would be a Cancel that
// lies.
import { useState } from "react";
import type { Folder, List } from "../../types";
import { activeFolders, listsInFolder } from "../../domain/spaces/hierarchy";
import { useT } from "../../i18n";

interface FolderManagerProps {
  /** The Project whose Folders these are. */
  projectId: string;
  folders: Folder[];
  lists: List[];
  onCreate: (projectId: string, name: string) => void;
  onRename: (folderId: string, name: string) => void;
  onArchive: (folderId: string) => void;
}

/**
 * One Folder, renamed in place.
 *
 * The field IS the row — there is no pencil to press first, because a screen
 * whose whole purpose is renaming should not make the reader ask for the
 * ability to rename. It keeps its own draft so typing does not write on every
 * keystroke: Enter and blur commit, Escape puts the stored name back.
 */
function FolderRow({
  folder,
  listCount,
  onRename,
  onArchive,
}: {
  folder: Folder;
  listCount: number;
  onRename: (folderId: string, name: string) => void;
  onArchive: (folderId: string) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(folder.name);

  function commit() {
    const name = draft.trim();
    // An empty name is not a rename, and neither is the name it already has.
    if (!name || name === folder.name) {
      setDraft(folder.name);
      return;
    }
    onRename(folder.id, name);
  }

  return (
    <li className="fdm-item">
      <input
        className="ff-field fdm-name"
        value={draft}
        aria-label={t("tree.renameFolder")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") setDraft(folder.name);
        }}
      />
      {/* What is inside it, so archiving is not a guess. `archiveFolder` puts
          the Lists back at the Project's top level rather than taking them
          with it, and a reader who can see the number can predict that. */}
      <span className="fdm-count">
        {listCount === 1 ? t("folders.listCountOne") : t("folders.listCount", { n: String(listCount) })}
      </span>
      <button
        type="button"
        className="ff-btn ff-btn-secondary"
        onClick={() => onArchive(folder.id)}
      >
        {t("common.archive")}
      </button>
    </li>
  );
}

export function FolderManager({ projectId, folders, lists, onCreate, onRename, onArchive }: FolderManagerProps) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const mine = activeFolders(folders, projectId);

  function submit() {
    const name = draft.trim();
    if (!name) return;
    onCreate(projectId, name);
    setDraft("");
  }

  return (
    <div className="fdm">
      <form
        className="fdm-create"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          className="ff-field"
          value={draft}
          placeholder={t("tree.folderPlaceholder")}
          aria-label={t("tree.folderPlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
        />
        <button type="submit" className="ff-btn ff-btn-primary">
          {t("common.add")}
        </button>
      </form>

      {mine.length > 0 ? (
        <ul className="fdm-list">
          {mine.map((folder) => (
            <FolderRow
              // Keyed by id alone: a rename that remounted the row would take
              // the caret out of the field the reader is still typing in.
              key={folder.id}
              folder={folder}
              listCount={listsInFolder(lists, folder.id).length}
              onRename={onRename}
              onArchive={onArchive}
            />
          ))}
        </ul>
      ) : (
        // §4: Folders are not suggested first — they exist once someone asks
        // for one. So this says what they are FOR, not that something is
        // missing.
        <p className="fdm-empty">{t("folders.empty")}</p>
      )}
    </div>
  );
}
