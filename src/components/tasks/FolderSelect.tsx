// The Folder field of the Add List dialog (Add List design §6).
//
// The design calls this Folder; here it is the SIDEBAR's group and not the
// Project ladder's Folder (§R.7). A List made in this module has no Project,
// and a domain Folder belongs to one, so there is no Folder of that kind for
// it to go in — while the sidebar's grouping is exactly what the design's
// Folder does: decide where the List is seen (D18/D19).
//
// Its own file for §15.21's reason: the dropdown has a mode inside it (inline
// create), and a component with a mode, inside a form with a state machine, is
// where the two start reading each other's variables.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SidebarFolder } from "../../types";
import { activeSidebarFolders } from "../../domain/tasks/sidebarFolders";
import { useT } from "../../i18n";

/** §6.24: below this a search box is noise, above it the list is unusable. */
export const FOLDER_SEARCH_THRESHOLD = 9;

interface FolderSelectProps {
  /**
   * The field label's element id.
   *
   * A combobox is named by its LABEL and not by its contents — what it
   * contains is its VALUE, the folder currently chosen. Without this the
   * trigger reads as an unnamed button, which is what axe caught: the folder
   * name inside it was being counted as the value it is, leaving no name.
   */
  labelledBy: string;
  folders: SidebarFolder[];
  value: string;
  onChange: (sidebarFolderId: string) => void;
  /** Answers the new group's id, or "" if it could not be made (§6.32/§6.33). */
  onCreateFolder: (name: string) => Promise<string> | string;
  /** §6.35: while a Folder is being made, the List must not be submitted. */
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}

export function FolderSelect({
  labelledBy,
  folders,
  value,
  onChange,
  onCreateFolder,
  onBusyChange,
  disabled = false,
}: FolderSelectProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const listboxId = useId();
  const newNameRef = useRef<HTMLInputElement | null>(null);

  const sorted = useMemo(() => activeSidebarFolders(folders), [folders]);
  const showSearch = sorted.length >= FOLDER_SEARCH_THRESHOLD;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((folder) => folder.name.toLowerCase().includes(needle));
  }, [sorted, query]);

  const selected = sorted.find((folder) => folder.id === value);

  // §6.45: the group this draft names can disappear while the dialog is open —
  // another device, another tab. Falling back to "none" is the only answer that
  // cannot create the List somewhere that no longer exists.
  useEffect(() => {
    if (value && !selected) onChange("");
  }, [value, selected, onChange]);

  useEffect(() => {
    if (creating) newNameRef.current?.focus();
  }, [creating]);

  function setBusyState(next: boolean) {
    busyRef.current = next;
    setBusy(next);
    onBusyChange(next);
  }

  function close() {
    setOpen(false);
    setQuery("");
    setCreating(false);
    setNewName("");
    setError("");
  }

  function choose(sidebarFolderId: string) {
    onChange(sidebarFolderId);
    close();
  }

  async function createFolder() {
    const name = newName.trim();
    // The same lock the dialog's own submit needs, for the same reason: state
    // does not change inside the tick that set it.
    if (!name || busyRef.current) return;
    setBusyState(true);
    setError("");
    try {
      const id = await onCreateFolder(name);
      if (!id) throw new Error("");
      setBusyState(false);
      // §6.32: the group was made in order to put this List in it.
      choose(id);
    } catch (cause) {
      // §6.33: the editor stays, the name stays, and the List draft is not
      // touched — a failure here must not cost the user the dialog.
      setBusyState(false);
      setError(cause instanceof Error && cause.message ? cause.message : t("tasks.createFolderFailed"));
    }
  }

  return (
    <div className="tm-folder-select">
      <button
        type="button"
        className="tm-folder-trigger"
        // §6.40 semantics.
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-labelledby={labelledBy}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="tm-folder-trigger-label">{selected ? selected.name : t("tasks.folderNone")}</span>
      </button>

      {open ? (
        <div
          className="tm-folder-dropdown"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            // §6.38: Esc closes the inline editor first when it is open —
            // otherwise a mistyped folder name costs the whole dropdown.
            if (creating) {
              setCreating(false);
              setNewName("");
              setError("");
            } else {
              close();
            }
          }}
        >
          {showSearch ? (
            <input
              type="text"
              className="tm-modal-input tm-folder-search"
              value={query}
              placeholder={t("tasks.folderSearch")}
              aria-label={t("tasks.folderSearch")}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}

          <div className="tm-folder-options" role="listbox" id={listboxId} aria-label={t("tasks.folderLabel")}>
            {/* §6.17/§6.27: "none" is a real option and stays reachable while
                searching — it is where a List goes by default, not an absence. */}
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className={`tm-folder-option${value === "" ? " is-selected" : ""}`}
              onClick={() => choose("")}
            >
              {t("tasks.folderNone")}
            </button>
            {shown.map((folder) => (
              <button
                key={folder.id}
                type="button"
                role="option"
                aria-selected={value === folder.id}
                className={`tm-folder-option${value === folder.id ? " is-selected" : ""}`}
                onClick={() => choose(folder.id)}
              >
                {folder.name}
              </button>
            ))}
          </div>

          {/* §6.28: say the search found nothing rather than leaving a gap.
              Outside the listbox, which may own only options (the Command
              Menu taught this one — see shell/CommandMenu). */}
          {shown.length === 0 && query.trim() ? <p className="tm-state">{t("tasks.folderSearchEmpty")}</p> : null}

          {/* §6.29/§6.30: the footer becomes the editor. No second dialog — a
              Modal over a Modal to name one string is where the draft
              underneath starts feeling losable. */}
          <div className="tm-folder-footer">
            {creating ? (
              <div className="tm-folder-create">
                <input
                  ref={newNameRef}
                  type="text"
                  className="tm-modal-input"
                  value={newName}
                  maxLength={80}
                  placeholder={t("tasks.createFolderPlaceholder")}
                  aria-label={t("tasks.createFolderPlaceholder")}
                  disabled={busy}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    // §3.26 again: the Enter that picks an IME candidate is
                    // not a create. §6.31 says reuse the rules, not copy them.
                    if (event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    void createFolder();
                  }}
                />
                {error ? (
                  <p className="tm-state is-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="tm-folder-create-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setNewName("");
                      setError("");
                    }}
                    disabled={busy}
                  >
                    {t("tasks.createListCancel")}
                  </button>
                  <button type="button" onClick={() => void createFolder()} disabled={busy || !newName.trim()}>
                    {busy ? t("tasks.createFolderBusy") : t("tasks.createFolderSubmit")}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="tm-folder-new" onClick={() => setCreating(true)}>
                + {t("tasks.createFolder")}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
