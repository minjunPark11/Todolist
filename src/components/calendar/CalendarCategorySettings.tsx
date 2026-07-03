// Settings > 캘린더 > 카테고리 관리 (category spec §4–§9).
// Personal categories are fully managed here; study / project / external
// categories are derived from topics, projects, and calendar subscriptions,
// so they are only mentioned in the footnote below the list.
import { useEffect, useState, type DragEvent } from "react";
import type { Task } from "../../types";
import {
  addPersonalCategory,
  deletePersonalCategory,
  movePersonalCategoryTo,
  setDefaultCategory,
  updatePersonalCategory,
  useCalendarCategoryState,
} from "../../lib/calendarCategories";
import { Modal } from "../kit";

interface CalendarCategorySettingsProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
}

const CATEGORY_COLORS = ["#0066cc", "#34c759", "#ff2d55", "#ff9500", "#af52de", "#5856d6", "#00b8a9", "#8e8e93"];

type EditorState = {
  mode: "add" | "edit";
  categoryId: string;
  name: string;
  color: string;
  error: string;
};

export function CalendarCategorySettings({ tasks, onUpdateTask }: CalendarCategorySettingsProps) {
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
    setEditor({ mode: "add", categoryId: "", name: "", color: CATEGORY_COLORS[1], error: "" });
  }

  function openEdit(categoryId: string) {
    const category = categories.find((item) => item.id === categoryId);
    if (!category) return;
    setOpenMenuId("");
    setEditor({ mode: "edit", categoryId, name: category.name, color: category.color, error: "" });
  }

  function submitEditor() {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      setEditor({ ...editor, error: "카테고리 이름을 입력하세요." });
      return;
    }
    const duplicated = categories.some(
      (category) => category.id !== editor.categoryId && category.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicated) {
      setEditor({ ...editor, error: "같은 이름의 카테고리가 이미 있어요." });
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
          <strong>카테고리 관리</strong>
          <small>일정 분류와 색상을 관리합니다.</small>
        </div>
        <div className="ff-cal-card-actions">
          <button type="button" className="ff-btn ff-cal-btn-outline" onClick={openAdd}>
            + 새 카테고리
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
            <span className="ff-cat-drag-handle" aria-label={`${category.name} 순서 이동`} title="드래그해서 순서 변경">
              <DragHandleIcon />
            </span>
            <span className="ff-cat-color-chip" style={{ background: category.color }} aria-hidden="true" />
            <span className="ff-cat-name">
              {category.name}
              {category.id === state.defaultCategoryId ? <em className="ff-cat-default-badge">기본</em> : null}
            </span>
            <div className="ff-cat-menu-wrap">
              <button
                type="button"
                className="ff-btn ff-btn-ghost ff-cat-menu-btn"
                aria-label={`${category.name} 메뉴`}
                aria-expanded={openMenuId === category.id}
                onClick={() => setOpenMenuId(openMenuId === category.id ? "" : category.id)}
              >
                ⋯
              </button>
              {openMenuId === category.id ? (
                <div className="ff-cat-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => openEdit(category.id)}>
                    이름 · 색상 변경
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
                    기본 카테고리로 설정
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    disabled={category.id === state.defaultCategoryId}
                    title={category.id === state.defaultCategoryId ? "기본 카테고리는 삭제할 수 없습니다." : undefined}
                    onClick={() => {
                      setOpenMenuId("");
                      setPendingDeleteId(category.id);
                      setMoveTargetId(state.defaultCategoryId);
                    }}
                  >
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <p className="ff-cat-footnote">
        <InfoIcon /> 학습/프로젝트 카테고리는 각 페이지에서 자동 생성됩니다.
      </p>

      {editor ? (
        <Modal
          title={editor.mode === "add" ? "새 카테고리" : "카테고리 수정"}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="ff-btn" onClick={() => setEditor(null)}>
                취소
              </button>
              <button type="button" className="ff-btn ff-btn-primary" onClick={submitEditor}>
                {editor.mode === "add" ? "추가" : "저장"}
              </button>
            </>
          }
        >
          <div className="ff-cat-editor">
            <label className="ff-cat-editor-field">
              이름
              <input
                value={editor.name}
                autoFocus
                placeholder="카테고리 이름"
                onChange={(event) => setEditor({ ...editor, name: event.target.value, error: "" })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitEditor();
                }}
              />
            </label>
            <div className="ff-cat-editor-field">
              색상
              <div className="ff-cat-color-palette" role="radiogroup" aria-label="카테고리 색상">
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
                  aria-label="직접 색상 선택"
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
          title={`"${pendingDelete.name}" 카테고리 삭제`}
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
                취소
              </button>
              <button type="button" className="ff-btn ff-btn-danger" onClick={confirmDelete}>
                삭제
              </button>
            </>
          }
        >
          {pendingDeleteTaskCount > 0 ? (
            <div className="ff-cat-delete-body">
              <p>
                "{pendingDelete.name}" 카테고리에 일정 {pendingDeleteTaskCount}개가 있습니다. 삭제하면 아래 카테고리로
                이동합니다.
              </p>
              <select value={moveTargetId} onChange={(event) => setMoveTargetId(event.target.value)}>
                {categories
                  .filter((category) => category.id !== pendingDelete.id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.id === state.defaultCategoryId ? " (기본)" : ""}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <p>"{pendingDelete.name}" 카테고리를 삭제할까요?</p>
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
