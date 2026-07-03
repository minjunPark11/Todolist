// Notes popup + Split View (NOTES_POPUP_SPLIT_FULLSCREEN_WITH_OVERVIEW_LIST_SPEC).
// Two entry points: the "+ Note" buttons open the resizable quick-create popup
// (NoteQuickCreateModal); clicking a note in the list opens the Split View
// editor (SpaceNotesView), which can expand to a fullscreen layer.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { SpaceNote, SpaceTypePreset } from "../../lib/spaceHubTypes";
import { relativeTime } from "../../lib/spaceSelectors";
import { useT } from "../../i18n";
import { presetText, noteTypeText } from "../../lib/spaceHubI18n";

export type NotesPanelMode = "home" | "split";
type SaveStatus = "idle" | "saving" | "saved" | "error";

export const OVERVIEW_NOTES_LIMIT = 4;

function AutoSaveStatus({ status }: { status: SaveStatus }) {
  const { t } = useT();
  if (status === "idle") return <span className="sdvn-autosave" aria-hidden="true" />;
  const key =
    status === "saving" ? "notes.autosave.saving" : status === "error" ? "notes.autosave.error" : "notes.autosave.saved";
  return <span className={`sdvn-autosave ${status}`}>{t(key)}</span>;
}

// === Quick-create popup (Part A) ===

const MIN_MODAL_SIZE = { width: 420, height: 360 };
const MODAL_SIZE_PRESETS = {
  small: { width: 520, height: 420 },
  default: { width: 640, height: 520 },
  large: { width: 860, height: 680 },
} as const;

type ModalSize = { width: number; height: number };

function clampModalSize(size: ModalSize): ModalSize {
  const maxWidth = Math.max(MIN_MODAL_SIZE.width, window.innerWidth - 80);
  const maxHeight = Math.max(MIN_MODAL_SIZE.height, window.innerHeight - 80);
  return {
    width: Math.min(Math.max(size.width, MIN_MODAL_SIZE.width), maxWidth),
    height: Math.min(Math.max(size.height, MIN_MODAL_SIZE.height), maxHeight),
  };
}

export function NoteQuickCreateModal({
  onCreate,
  onUpdate,
  onDelete,
  onClose,
  onOpenInSplit,
}: {
  // Returns the id of the newly stored note.
  onCreate: (draft: { title: string; body: string }) => string;
  onUpdate: (noteId: string, patch: Partial<SpaceNote>) => void;
  onDelete: (noteId: string) => void;
  // savedNoteId is null when the draft was discarded (both fields empty).
  onClose: (savedNoteId: string | null) => void;
  onOpenInSplit: (noteId: string) => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [size, setSize] = useState<ModalSize>(() => clampModalSize(MODAL_SIZE_PRESETS.default));
  const [menuOpen, setMenuOpen] = useState(false);
  const savedIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const hasContent = Boolean(title.trim() || body.trim());

  function flushSave(): string | null {
    if (!hasContentRef.current) return savedIdRef.current;
    const current = valuesRef.current;
    if (savedIdRef.current) {
      onUpdate(savedIdRef.current, { title: current.title.trim(), body: current.body });
    } else {
      savedIdRef.current = onCreate({ title: current.title.trim(), body: current.body });
    }
    dirtyRef.current = false;
    setSaveStatus("saved");
    return savedIdRef.current;
  }

  // Refs keep the latest values available to the debounce timer, ESC listener,
  // and flushSave without re-registering listeners on every keystroke.
  const valuesRef = useRef({ title, body });
  valuesRef.current = { title, body };
  const hasContentRef = useRef(hasContent);
  hasContentRef.current = hasContent;

  // Debounced autosave (§11): create on first non-empty save, update after.
  useEffect(() => {
    if (!dirtyRef.current) return;
    if (!hasContent) {
      setSaveStatus("idle");
      return;
    }
    setSaveStatus("saving");
    const timer = window.setTimeout(() => flushSave(), 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  function handleClose() {
    if (!hasContentRef.current) {
      // Empty draft: discard, deleting the note if an autosave already created it (§12 case A).
      if (savedIdRef.current) onDelete(savedIdRef.current);
      onClose(null);
      return;
    }
    onClose(flushSave());
  }

  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  // ESC closes with the save/discard rules. Capture phase so the space
  // detail's global Escape handler never sees the event.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      handleCloseRef.current();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Re-clamp when the viewport shrinks (§31).
  useEffect(() => {
    function onResize() {
      setSize((current) => clampModalSize(current));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      flushSave();
      return;
    }
    if (event.key === "Tab") {
      // Minimal focus trap (§27).
      const root = modalRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>('button, input, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = size.width;
    const startHeight = size.height;
    function onMove(move: PointerEvent) {
      setSize(clampModalSize({ width: startWidth + (move.clientX - startX), height: startHeight + (move.clientY - startY) }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function applyPreset(preset: keyof typeof MODAL_SIZE_PRESETS | "fullscreen") {
    setMenuOpen(false);
    if (preset === "fullscreen") {
      setSize(clampModalSize({ width: window.innerWidth - 80, height: window.innerHeight - 80 }));
    } else {
      setSize(clampModalSize(MODAL_SIZE_PRESETS[preset]));
    }
  }

  function handleOpenInSplit() {
    setMenuOpen(false);
    const id = flushSave();
    if (id) onOpenInSplit(id);
    else handleClose();
  }

  return (
    <>
      <div className="nqm-overlay" onClick={handleClose} />
      <div
        ref={modalRef}
        className="nqm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("notes.quickModal.aria")}
        style={{ width: size.width, height: size.height }}
        onKeyDown={handleKeyDown}
      >
        <header className="nqm-header">
          <AutoSaveStatus status={saveStatus} />
          <div className="nqm-actions">
            <div className="sdvn-menu-wrap">
              <button
                type="button"
                className="sdvn-icon-btn"
                aria-label={t("notes.aria.more")}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                ⋯
              </button>
              {menuOpen ? (
                <div className="sdvn-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => applyPreset("small")}>
                    {t("notes.menu.sizeSmall")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyPreset("default")}>
                    {t("notes.menu.sizeDefault")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyPreset("large")}>
                    {t("notes.menu.sizeLarge")}
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyPreset("fullscreen")}>
                    {t("notes.menu.sizeFullscreen")}
                  </button>
                  <div className="sdvn-menu-divider" role="separator" />
                  <button type="button" role="menuitem" onClick={handleOpenInSplit}>
                    {t("notes.menu.openInSplit")}
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" className="sdvn-icon-btn" aria-label={t("notes.aria.close")} onClick={handleClose}>
              ✕
            </button>
          </div>
        </header>
        <div className="nqm-body">
          <div className="sdvn-title-row">
            <span className="sdvn-title-accent" aria-hidden="true" />
            <input
              ref={titleRef}
              className="sdvn-editor-title"
              placeholder={t("notes.titlePlaceholder")}
              aria-label={t("notes.aria.titleInput")}
              value={title}
              onChange={(event) => {
                dirtyRef.current = true;
                setTitle(event.target.value);
              }}
            />
          </div>
          <textarea
            className="sdvn-editor-content"
            placeholder={t("notes.contentPlaceholder")}
            aria-label={t("notes.aria.contentInput")}
            value={body}
            onChange={(event) => {
              dirtyRef.current = true;
              setBody(event.target.value);
            }}
          />
        </div>
        <button
          type="button"
          className="nqm-resize-handle"
          aria-label={t("notes.aria.resize")}
          onPointerDown={startResize}
        >
          ◢
        </button>
      </div>
    </>
  );
}

// === Notes tab: Home list + Split View + fullscreen (Part B) ===

export function SpaceNotesView({
  preset,
  notes,
  mode,
  selectedNoteId,
  isFullscreen,
  onSelectNote,
  onCloseSplit,
  onToggleFullscreen,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}: {
  preset: SpaceTypePreset;
  notes: SpaceNote[];
  mode: NotesPanelMode;
  selectedNoteId: string | null;
  isFullscreen: boolean;
  onSelectNote: (noteId: string) => void;
  onCloseSplit: () => void;
  onToggleFullscreen: () => void;
  onAddNote: () => void;
  onUpdateNote: (noteId: string, patch: Partial<SpaceNote>) => void;
  onDeleteNote: (noteId: string) => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editorStatus, setEditorStatus] = useState<SaveStatus>("idle");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editorMenuOpen, setEditorMenuOpen] = useState(false);
  const [itemMenuId, setItemMenuId] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState("");
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const dirtyRef = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null;

  const noteTypes = useMemo(
    () => Array.from(new Set([...preset.noteTypes, ...notes.map((note) => note.type)])),
    [preset.noteTypes, notes],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleNotes = notes.filter((note) => {
    if (typeFilter !== "all" && note.type !== typeFilter) return false;
    if (!normalizedQuery) return true;
    return `${note.title} ${note.body} ${note.tags.join(" ")}`.toLowerCase().includes(normalizedQuery);
  });

  // Refs so flushEditor always sees the latest draft without stale closures.
  const editorRef = useRef({ noteId: selectedNoteId, title, body });
  editorRef.current = { noteId: selectedNoteId, title, body };
  const onUpdateNoteRef = useRef(onUpdateNote);
  onUpdateNoteRef.current = onUpdateNote;

  function flushEditor() {
    const current = editorRef.current;
    if (!dirtyRef.current || !current.noteId) return;
    onUpdateNoteRef.current(current.noteId, { title: current.title, body: current.body });
    dirtyRef.current = false;
    setEditorStatus("saved");
  }

  // Load the selected note into the editor.
  useEffect(() => {
    const note = notes.find((item) => item.id === selectedNoteId) ?? null;
    setTitle(note?.title ?? "");
    setBody(note?.body ?? "");
    setEditorStatus("idle");
    dirtyRef.current = false;
    setEditorMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNoteId]);

  // Debounced autosave — identical in normal and fullscreen mode (§20.7).
  useEffect(() => {
    if (!dirtyRef.current || !selectedNoteId) return;
    setEditorStatus("saving");
    const timer = window.setTimeout(() => {
      onUpdateNoteRef.current(selectedNoteId, { title: editorRef.current.title, body: editorRef.current.body });
      dirtyRef.current = false;
      setEditorStatus("saved");
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, selectedNoteId]);

  // Flush pending edits when the notes tab unmounts (tab switch etc.).
  useEffect(() => {
    return () => {
      const current = editorRef.current;
      if (dirtyRef.current && current.noteId) {
        onUpdateNoteRef.current(current.noteId, { title: current.title, body: current.body });
      }
    };
  }, []);

  function handleSelectNote(noteId: string) {
    flushEditor();
    setItemMenuId("");
    setMobileListOpen(false);
    onSelectNote(noteId);
  }

  function handleCloseSplit() {
    flushEditor();
    onCloseSplit();
  }

  function handleToggleFullscreen() {
    setEditorMenuOpen(false);
    onToggleFullscreen();
  }

  function confirmDelete() {
    if (!deleteTargetId) return;
    const wasSelected = deleteTargetId === selectedNoteId;
    if (wasSelected) dirtyRef.current = false;
    // Pick the next note before the store changes (§22).
    const remaining = visibleNotes.filter((note) => note.id !== deleteTargetId);
    onDeleteNote(deleteTargetId);
    setDeleteTargetId("");
    setItemMenuId("");
    setEditorMenuOpen(false);
    if (wasSelected) {
      if (remaining.length > 0) onSelectNote(remaining[0].id);
      else onCloseSplit();
    }
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      flushEditor();
    }
  }

  // ↑/↓ move focus through the list; Enter opens (native button behavior) (§28).
  function handleListKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const root = listRef.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>(".sdvn-item-main")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
    items[next]?.focus();
  }

  const displayTitle = (note: SpaceNote) => note.title.trim() || t("notes.untitled");

  const searchToolbar = (
    <div className="sdvn-list-tools">
      <input
        type="search"
        placeholder={t("spaceHub.search.notes")}
        aria-label={t("spaceHub.aria.searchNotes")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select aria-label={t("spaceHub.aria.noteTypeFilter")} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
        <option value="all">{t("spaceHub.filter.allTypes")}</option>
        {noteTypes.map((type) => (
          <option key={type} value={type}>
            {noteTypeText(t, type)}
          </option>
        ))}
      </select>
      <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddNote}>
        {presetText(t, preset.addNoteLabel)}
      </button>
    </div>
  );

  const deleteConfirm = deleteTargetId ? (
    <div className="sdvn-confirm-overlay">
      <div className="sdvn-confirm" role="alertdialog" aria-modal="true" aria-label={t("notes.delete.title")}>
        <strong>{t("notes.delete.title")}</strong>
        <p>{t("notes.delete.body")}</p>
        <div className="sdvn-confirm-actions">
          <button type="button" className="sdv-btn sdv-btn-sm" onClick={() => setDeleteTargetId("")}>
            {t("common.cancel")}
          </button>
          <button type="button" className="sdv-btn sdv-btn-sm sdvn-btn-danger" onClick={confirmDelete}>
            {t("notes.delete.confirm")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // --- Home/List state (§23) ---
  if (mode === "home") {
    return (
      <section className="sdv-card sdv-tab-panel sdvn-home">
        <header className="sdv-toolbar">{searchToolbar}</header>
        {notes.length === 0 ? (
          <div className="sdv-empty">
            <p>{t("spaceHub.empty.noNotes")}</p>
            <button type="button" className="sdv-btn sdv-btn-primary sdv-btn-sm" onClick={onAddNote}>
              {presetText(t, preset.addNoteLabel)}
            </button>
          </div>
        ) : visibleNotes.length === 0 ? (
          <p className="sdv-empty-inline">{t("notes.searchNoResults")}</p>
        ) : (
          <ul className="sdvn-simple-list">
            {visibleNotes.map((note) => (
              <li key={note.id}>
                <button type="button" onClick={() => handleSelectNote(note.id)}>
                  <strong>{displayTitle(note)}</strong>
                  <small>{relativeTime(note.updatedAt, t)}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {deleteConfirm}
      </section>
    );
  }

  // --- Split View (§14-§20) ---
  const panel = (
    <section
      className={[
        "sdvn-split",
        isFullscreen ? "fullscreen" : "",
        mobileListOpen ? "list-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("notes.aria.noteList")}
    >
      <aside className="sdvn-list-pane">
        {searchToolbar}
        {visibleNotes.length === 0 ? (
          <p className="sdv-empty-inline">
            {notes.length === 0 ? t("spaceHub.empty.noNotes") : t("notes.searchNoResults")}
          </p>
        ) : (
          <ul className="sdvn-note-list" ref={listRef} role="listbox" aria-label={t("notes.aria.noteList")} onKeyDown={handleListKeyDown}>
            {visibleNotes.map((note) => (
              <li key={note.id} className={note.id === selectedNoteId ? "sdvn-list-item selected" : "sdvn-list-item"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={note.id === selectedNoteId}
                  className="sdvn-item-main"
                  onClick={() => handleSelectNote(note.id)}
                >
                  <span className="sdvn-item-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
                      <path d="M14 3v5h5" />
                    </svg>
                  </span>
                  <span className="sdvn-item-text">
                    <strong>{displayTitle(note)}</strong>
                    <small>
                      {noteTypeText(t, note.type)} · {relativeTime(note.updatedAt, t)}
                    </small>
                  </span>
                </button>
                <div className="sdvn-menu-wrap">
                  <button
                    type="button"
                    className="sdvn-icon-btn sdvn-item-more"
                    aria-label={t("notes.aria.more")}
                    aria-haspopup="menu"
                    aria-expanded={itemMenuId === note.id}
                    onClick={() => setItemMenuId((current) => (current === note.id ? "" : note.id))}
                  >
                    ⋯
                  </button>
                  {itemMenuId === note.id ? (
                    <div className="sdvn-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="sdvn-menu-danger"
                        onClick={() => {
                          setItemMenuId("");
                          setDeleteTargetId(note.id);
                        }}
                      >
                        {t("notes.menu.delete")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="sdvn-editor-pane" onKeyDown={handleEditorKeyDown}>
        <header className="sdvn-editor-top">
          <button type="button" className="sdvn-back-mobile" onClick={() => setMobileListOpen(true)}>
            ← {t("notes.backToList")}
          </button>
          <AutoSaveStatus status={editorStatus} />
          <div className="sdvn-editor-actions">
            <button
              type="button"
              className="sdvn-icon-btn"
              aria-label={isFullscreen ? t("notes.aria.exitFullscreen") : t("notes.aria.fullscreen")}
              title={isFullscreen ? t("notes.menu.exitFullscreen") : t("notes.menu.fullscreen")}
              onClick={handleToggleFullscreen}
            >
              ⛶
            </button>
            <div className="sdvn-menu-wrap">
              <button
                type="button"
                className="sdvn-icon-btn"
                aria-label={t("notes.aria.more")}
                aria-haspopup="menu"
                aria-expanded={editorMenuOpen}
                onClick={() => setEditorMenuOpen((open) => !open)}
              >
                ⋯
              </button>
              {editorMenuOpen ? (
                <div className="sdvn-menu" role="menu">
                  <button type="button" role="menuitem" onClick={handleToggleFullscreen}>
                    {isFullscreen ? t("notes.menu.exitFullscreen") : t("notes.menu.fullscreen")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setEditorMenuOpen(false);
                      dirtyRef.current = true;
                      flushEditor();
                    }}
                  >
                    {t("notes.menu.saveAgain")}
                  </button>
                  {selectedNote ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="sdvn-menu-danger"
                      onClick={() => {
                        setEditorMenuOpen(false);
                        setDeleteTargetId(selectedNote.id);
                      }}
                    >
                      {t("notes.menu.delete")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button type="button" className="sdvn-icon-btn" aria-label={t("notes.aria.close")} onClick={handleCloseSplit}>
              ✕
            </button>
          </div>
        </header>

        {selectedNote ? (
          <>
            <div className="sdvn-title-row">
              <span className="sdvn-title-accent" aria-hidden="true" />
              <input
                className="sdvn-editor-title"
                placeholder={t("notes.titlePlaceholder")}
                aria-label={t("notes.aria.titleInput")}
                value={title}
                onChange={(event) => {
                  dirtyRef.current = true;
                  setTitle(event.target.value);
                }}
              />
            </div>
            <textarea
              className="sdvn-editor-content"
              placeholder={t("notes.contentPlaceholder")}
              aria-label={t("notes.aria.contentInput")}
              value={body}
              onChange={(event) => {
                dirtyRef.current = true;
                setBody(event.target.value);
              }}
            />
          </>
        ) : (
          <p className="sdv-empty-inline">{t("notes.noSelection")}</p>
        )}
      </div>
      {deleteConfirm}
    </section>
  );

  if (isFullscreen) {
    return (
      <>
        <div className="sdvn-fullscreen-overlay" onClick={handleToggleFullscreen} />
        {panel}
      </>
    );
  }
  return panel;
}
