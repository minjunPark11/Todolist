// Settings > 캘린더 > 카테고리 관리 (category spec §4–§9).
// Personal categories are fully managed here; study / project / external
// categories are derived from topics, projects, and calendar subscriptions,
// so they are listed read-only with a pointer to where they are managed.
import { useState } from "react";
import type { Task } from "../../types";
import {
  addPersonalCategory,
  deletePersonalCategory,
  movePersonalCategory,
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

export function CalendarCategorySettings({ tasks, onUpdateTask }: CalendarCategorySettingsProps) {
  const state = useCalendarCategoryState();
  const categories = [...state.personal].sort((a, b) => a.order - b.order);

  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(CATEGORY_COLORS[1]);
  const [addError, setAddError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [moveTargetId, setMoveTargetId] = useState("");

  const pendingDelete = categories.find((category) => category.id === pendingDeleteId);
  // Events keep working without a rewrite (display falls back to the default
  // category), but the spec (§8.2) asks the user where they should move.
  const pendingDeleteTaskCount = pendingDelete
    ? tasks.filter((task) => task.categoryId === pendingDelete.id && task.status !== "archived" && !task.deletedAt).length
    : 0;

  function submitAdd() {
    const name = draftName.trim();
    if (!name) {
      setAddError("카테고리 이름을 입력하세요.");
      return;
    }
    if (categories.some((category) => category.name.trim().toLowerCase() === name.toLowerCase())) {
      setAddError("같은 이름의 카테고리가 이미 있어요.");
      return;
    }
    addPersonalCategory(name, draftColor);
    setDraftName("");
    setAddError("");
  }

  function commitRename(categoryId: string) {
    const name = editingName.trim();
    if (name) updatePersonalCategory(categoryId, { name });
    setEditingId("");
    setEditingName("");
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

  return (
    <div className="ff-cat-settings">
      <div className="ff-cat-settings-head">
        <div>
          <strong>카테고리 관리</strong>
          <small>캘린더 카테고리를 추가하고 이름, 색상, 순서, 기본 카테고리를 관리하세요.</small>
        </div>
      </div>

      <div className="ff-cat-list">
        {categories.map((category, index) => (
          <div key={category.id} className="ff-cat-row">
            <input
              type="color"
              value={category.color}
              aria-label={`${category.name} 색상`}
              onChange={(event) => updatePersonalCategory(category.id, { color: event.target.value })}
            />
            {editingId === category.id ? (
              <input
                className="ff-cat-name-input"
                value={editingName}
                autoFocus
                onChange={(event) => setEditingName(event.target.value)}
                onBlur={() => commitRename(category.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename(category.id);
                  if (event.key === "Escape") {
                    setEditingId("");
                    setEditingName("");
                  }
                }}
              />
            ) : (
              <span className="ff-cat-name">
                {category.name}
                {category.id === state.defaultCategoryId ? <em className="ff-cat-default-badge">기본</em> : null}
              </span>
            )}
            <div className="ff-cat-actions">
              <button
                type="button"
                className="ff-btn"
                aria-label={`${category.name} 이름 변경`}
                onClick={() => {
                  setEditingId(category.id);
                  setEditingName(category.name);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="ff-btn"
                aria-label={`${category.name} 위로`}
                disabled={index === 0}
                onClick={() => movePersonalCategory(category.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="ff-btn"
                aria-label={`${category.name} 아래로`}
                disabled={index === categories.length - 1}
                onClick={() => movePersonalCategory(category.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="ff-btn ff-btn-danger"
                aria-label={`${category.name} 삭제`}
                disabled={category.id === state.defaultCategoryId}
                title={category.id === state.defaultCategoryId ? "기본 카테고리는 삭제할 수 없습니다. 먼저 기본 카테고리를 변경하세요." : undefined}
                onClick={() => {
                  setPendingDeleteId(category.id);
                  setMoveTargetId(state.defaultCategoryId);
                }}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="ff-cat-add-form">
        <input
          value={draftName}
          placeholder="새 카테고리 이름"
          onChange={(event) => {
            setDraftName(event.target.value);
            setAddError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitAdd();
          }}
        />
        <div className="ff-cat-color-palette" role="radiogroup" aria-label="카테고리 색상">
          {CATEGORY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={draftColor === color}
              className={draftColor === color ? "ff-cat-color-swatch active" : "ff-cat-color-swatch"}
              style={{ background: color }}
              aria-label={color}
              onClick={() => setDraftColor(color)}
            />
          ))}
        </div>
        <button type="button" className="ff-btn" onClick={submitAdd}>
          + 카테고리 추가
        </button>
      </div>
      {addError ? <p className="ff-settings-error">{addError}</p> : null}

      <div className="ff-cat-default-row">
        <div>
          <strong>기본 카테고리</strong>
          <small>새 이벤트를 생성할 때 기본으로 선택되는 카테고리입니다.</small>
        </div>
        <select value={state.defaultCategoryId} onChange={(event) => setDefaultCategory(event.target.value)}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <p className="ff-settings-msg">
        학습 · 프로젝트 카테고리는 학습 주제와 공간(프로젝트)에서 자동으로 만들어집니다. 이름과 색상은 각 페이지에서
        변경하세요. 외부 캘린더는 아래 외부 캘린더 섹션에서 관리합니다.
      </p>

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
    </div>
  );
}
