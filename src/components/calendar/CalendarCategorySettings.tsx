// Settings > 캘린더 > 카테고리 관리 (category spec §4–§9).
// Personal categories are fully managed here. Study / project / external /
// focus categories are derived from their source entities, so recoloring one
// writes the color back to the source (topic / project / calendar) — the
// calendar and the entity's own screens never disagree.
import { useEffect, useState, type DragEvent } from "react";
import type { ExternalCalendar, Project, StudyTopic, Task } from "../../types";
import {
  addPersonalCategory,
  deletePersonalCategory,
  movePersonalCategoryTo,
  setDefaultCategory,
  setFocusColor,
  updatePersonalCategory,
  useCalendarCategoryState,
  CATEGORY_COLOR_PALETTE,
  FOCUS_ACTUAL_COLOR,
} from "../../lib/calendarCategories";
import { useT } from "../../i18n";
import { Modal } from "../kit";

interface CalendarCategorySettingsProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  projects: Project[];
  studyTopics: StudyTopic[];
  externalCalendars: ExternalCalendar[];
  onUpdateProject: (projectId: string, patch: Partial<Project>) => void;
  onUpdateTopic: (topicId: string, patch: Partial<StudyTopic>) => void;
  onUpdateExternalCalendar: (calendarId: string, patch: Partial<ExternalCalendar>) => void;
}

const CATEGORY_COLORS = CATEGORY_COLOR_PALETTE;

// Personal categories rename+recolor here; derived ones recolor only (their
// name belongs to the source entity).
type EditorTarget = "personal" | "project" | "study" | "external" | "focus";

type EditorState = {
  mode: "add" | "edit";
  target: EditorTarget;
  // Personal category id, or the source entity id for derived targets.
  categoryId: string;
  name: string;
  color: string;
  error: string;
};

export function CalendarCategorySettings({
  tasks,
  onUpdateTask,
  projects,
  studyTopics,
  externalCalendars,
  onUpdateProject,
  onUpdateTopic,
  onUpdateExternalCalendar,
}: CalendarCategorySettingsProps) {
  const { t } = useT();
  const state = useCalendarCategoryState();
  const categories = [...state.personal].sort((a, b) => a.order - b.order);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [openMenuId, setOpenMenuId] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [moveTargetId, setMoveTargetId] = useState("");
  const [dragId, setDragId] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const pendingDelete = categories.find((category) => category.id === pendingDeleteId);
  // Events keep working without a rewrite (display falls back to the default
  // category), but the spec (§8.2) asks the user where they should move.
  const pendingDeleteTaskCount = pendingDelete
    ? tasks.filter((task) => task.categoryId === pendingDelete.id && task.status !== "archived" && !task.deletedAt).length
    : 0;

  useEffect(() => {
    if (!openMenuId) return;
    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".ff-cat-menu-wrap")) return;
      setOpenMenuId("");
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openMenuId]);

  function openAdd() {
    setEditor({ mode: "add", target: "personal", categoryId: "", name: "", color: CATEGORY_COLORS[1], error: "" });
  }

  function openEdit(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    setOpenMenuId("");
    setEditor({ mode: "edit", target: "personal", categoryId, name: category.name, color: category.color, error: "" });
  }

  // Derived categories: color-only editor, id = source entity id.
  function openDerivedEdit(target: Exclude<EditorTarget, "personal">, sourceId: string, name: string, color: string) {
    setEditor({ mode: "edit", target, categoryId: sourceId, name, color, error: "" });
  }

  function submitEditor() {
    if (!editor) return;
    if (editor.target !== "personal") {
      if (editor.target === "project") onUpdateProject(editor.categoryId, { color: editor.color });
      else if (editor.target === "study") onUpdateTopic(editor.categoryId, { color: editor.color });
      else if (editor.target === "external") onUpdateExternalCalendar(editor.categoryId, { color: editor.color });
      else setFocusColor(editor.color);
      setEditor(null);
      return;
    }
    const name = editor.name.trim();
    if (!name) {
      setEditor({ ...editor, error: t("settings.category.nameRequired") });
      return;
    }
    const duplicated = categories.some(
      (category) => category.id !== editor.categoryId && category.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicated) {
      setEditor({ ...editor, error: t("settings.category.duplicateName") });
      return;
    }
    if (editor.mode === "add") addPersonalCategory(name, editor.color);
    else updatePersonalCategory(editor.categoryId, { name, color: editor.color });
    setEditor(null);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const targetId = moveTargetId || state.defaultCategoryId;
    if (pendingDeleteTaskCount > 0) {
      for (const task of tasks) {
        if (task.categoryId === pendingDelete.id) onUpdateTask(task.id, { categoryId: targetId });
      }
    }
    deletePersonalCategory(pendingDelete.id);
    setPendingDeleteId("");
    setMoveTargetId("");
  }

  function handleDrop(event: DragEvent, index: number) {
    // dataTransfer is the source of truth; dragId state may lag a render behind.
    const sourceId = event.dataTransfer.getData("text/plain") || dragId;
    if (sourceId) movePersonalCategoryTo(sourceId, index);
    setDragId("");
    setDragOverIndex(null);
  }

  return (
    <>
      <div className="ff-cal-card-head">
        <span className="ff-cal-card-icon" aria-hidden="true">
          <FolderIcon />
        </span>
        <div className="ff-cal-card-text">
          <strong>{t("settings.category.title")}</strong>
          <small>{t("settings.category.hint")}</small>
        </div>
        <div className="ff-cal-card-actions">
          <button type="button" className="ff-btn ff-cal-btn-outline" onClick={openAdd}>
            {t("settings.category.addNew")}
          </button>
        </div>
      </div>

      <div className="ff-cat-list" role="list">
        {categories.map((category, index) => (
          <div
            key={category.id}
            role="listitem"
            className={[
              "ff-cat-row",
              dragId === category.id ? "dragging" : "",
              dragOverIndex === index && dragId && dragId !== category.id ? "drag-over" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            draggable
            onDragStart={(event) => {
              setDragId(category.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", category.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (dragOverIndex !== index) setDragOverIndex(index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(event, index);
            }}
            onDragEnd={() => {
              setDragId("");
              setDragOverIndex(null);
            }}
          >
            <span className="ff-cat-drag-handle" aria-label={t("settings.category.moveAria", { name: category.name })} title={t("settings.category.dragToReorder")}>
              <DragHandleIcon />
            </span>
            <span className="ff-cat-color-chip" style={{ background: category.color }} aria-hidden="true" />
            <span className="ff-cat-name">
              {category.name}
              {category.id === state.defaultCategoryId ? <em className="ff-cat-default-badge">{t("settings.category.defaultBadge")}</em> : null}
            </span>
            <div className="ff-cat-menu-wrap">
              <button
                type="button"
                className="ff-btn ff-btn-ghost ff-cat-menu-btn"
                aria-label={t("settings.category.menuAria", { name: category.name })}
                aria-expanded={openMenuId === category.id}
                onClick={() => setOpenMenuId(openMenuId === category.id ? "" : category.id)}
              >
                ⋯
              </button>
              {openMenuId === category.id ? (
                <div className="ff-cat-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => openEdit(category.id)}>
                    {t("settings.category.editNameColor")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={category.id === state.defaultCategoryId}
                    onClick={() => {
                      setDefaultCategory(category.id);
                      setOpenMenuId("");
                    }}
                  >
                    {t("settings.category.setDefault")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    disabled={category.id === state.defaultCategoryId}
                    title={category.id === state.defaultCategoryId ? t("settings.category.defaultDeleteDisabled") : undefined}
                    onClick={() => {
                      setOpenMenuId("");
                      setPendingDeleteId(category.id);
                      setMoveTargetId(state.defaultCategoryId);
                    }}
                  >
                    {t("common.delete")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Derived categories: color is editable here and written back to the
          source entity; names / lifecycle stay with the entity's own screen. */}
      {(
        [
          {
            target: "project" as const,
            label: t("calendar.group.project"),
            rows: projects
              .filter((project) => project.status !== "archived")
              .map((project) => ({ id: project.id, name: project.name, color: project.color })),
          },
          {
            target: "study" as const,
            label: t("calendar.group.study"),
            rows: studyTopics
              .filter((topic) => topic.status !== "archived")
              .map((topic) => ({ id: topic.id, name: topic.name, color: topic.color || "#af52de" })),
          },
          {
            target: "external" as const,
            label: t("calendar.group.external"),
            rows: externalCalendars
              .filter((calendar) => calendar.enabled)
              .map((calendar) => ({ id: calendar.id, name: calendar.name, color: calendar.color })),
          },
          {
            target: "focus" as const,
            label: t("calendar.group.focus"),
            rows: [{ id: "focus", name: t("calendar.focusActualCategory"), color: state.focusColor || FOCUS_ACTUAL_COLOR }],
          },
        ] as const
      )
        .filter((section) => section.rows.length > 0)
        .map((section) => (
          <div key={section.target} className="ff-cat-derived-section">
            <h4 className="ff-cat-derived-head">{section.label}</h4>
            <div className="ff-cat-list" role="list">
              {section.rows.map((row) => (
                <div key={row.id} role="listitem" className="ff-cat-row ff-cat-row-derived">
                  <span className="ff-cat-color-chip" style={{ background: row.color }} aria-hidden="true" />
                  <span className="ff-cat-name">{row.name}</span>
                  <button
                    type="button"
                    className="ff-btn ff-btn-ghost ff-cat-recolor-btn"
                    onClick={() => openDerivedEdit(section.target, row.id, row.name, row.color)}
                  >
                    {t("settings.category.changeColor")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

      <p className="ff-cat-footnote">
        <InfoIcon /> {t("settings.category.derivedNote")}
      </p>

      {editor ? (
        <Modal
          title={
            editor.mode === "add"
              ? t("settings.category.newTitle")
              : editor.target === "personal"
                ? t("settings.category.editTitle")
                : t("settings.category.recolorTitle", { name: editor.name })
          }
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="ff-btn" onClick={() => setEditor(null)}>
                {t("common.cancel")}
              </button>
              <button type="button" className="ff-btn ff-btn-primary" onClick={submitEditor}>
                {editor.mode === "add" ? t("common.add") : t("common.save")}
              </button>
            </>
          }
        >
          <div className="ff-cat-editor">
            {editor.target === "personal" ? (
              <label className="ff-cat-editor-field">
                {t("common.name")}
                <input
                  value={editor.name}
                  autoFocus
                  placeholder={t("settings.category.namePlaceholder")}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value, error: "" })}
                  onKeyDown={(event) => {
                    // isComposing: an IME's composition-commit Enter must not save.
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) submitEditor();
                  }}
                />
              </label>
            ) : null}
            <div className="ff-cat-editor-field">
              {t("common.color")}
              <div className="ff-cat-color-palette" role="radiogroup" aria-label={t("settings.category.colorAria")}>
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={editor.color === color}
                    className={editor.color === color ? "ff-cat-color-swatch active" : "ff-cat-color-swatch"}
                    style={{ background: color }}
                    aria-label={color}
                    onClick={() => setEditor({ ...editor, color })}
                  />
                ))}
                <input
                  type="color"
                  className="ff-cat-color-custom"
                  value={editor.color}
                  aria-label={t("settings.category.customColorAria")}
                  onChange={(event) => setEditor({ ...editor, color: event.target.value })}
                />
              </div>
            </div>
            {editor.error ? <p className="ff-settings-error">{editor.error}</p> : null}
          </div>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <Modal
          title={t("settings.category.deleteTitle", { name: pendingDelete.name })}
          onClose={() => {
            setPendingDeleteId("");
            setMoveTargetId("");
          }}
          footer={
            <>
              <button
                type="button"
                className="ff-btn"
                onClick={() => {
                  setPendingDeleteId("");
                  setMoveTargetId("");
                }}
              >
                {t("common.cancel")}
              </button>
              <button type="button" className="ff-btn ff-btn-danger" onClick={confirmDelete}>
                {t("common.delete")}
              </button>
            </>
          }
        >
          {pendingDeleteTaskCount > 0 ? (
            <div className="ff-cat-delete-body">
              <p>
                {t("settings.category.deleteMoveBody", { name: pendingDelete.name, count: pendingDeleteTaskCount })}
              </p>
              <select value={moveTargetId} onChange={(event) => setMoveTargetId(event.target.value)}>
                {categories
                  .filter((category) => category.id !== pendingDelete.id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.id === state.defaultCategoryId ? t("settings.category.defaultSuffix") : ""}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <p>{t("settings.category.deleteBody", { name: pendingDelete.name })}</p>
          )}
        </Modal>
      ) : null}
    </>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 7a2 2 0 012-2h3.2a2 2 0 011.6.8l.9 1.2H18a2 2 0 012 2V17a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="9" cy="6" r="1.2" />
      <circle cx="15" cy="6" r="1.2" />
      <circle cx="9" cy="12" r="1.2" />
      <circle cx="15" cy="12" r="1.2" />
      <circle cx="9" cy="18" r="1.2" />
      <circle cx="15" cy="18" r="1.2" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ff-cat-footnote-icon">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
