// Settings › Calendar › the colours the calendar owns.
//
// This screen used to manage a whole taxonomy: add, rename, recolour, reorder
// and delete "personal categories", plus reassigning every task off one that
// was being removed. That taxonomy is gone
// (CALENDAR_COLOR_SOURCE_AND_VIEW_OPTIONS_DESIGN.md §4) — the calendar's own
// calendars are the account's Lists now, and a List is named, coloured and
// deleted where Lists live.
//
// What is left is the two things the calendar really does own, and neither has
// a screen of its own: the colour of a subscribed calendar, and the colour of
// the focus recording. Both write back to their source, so the value here and
// the value on the entity's own screen cannot drift.
import { useEffect, useState } from "react";
import type { ExternalCalendar } from "../../types";
import {
  setFocusColor,
  useCalendarCategoryState,
  CATEGORY_COLOR_PALETTE,
  FOCUS_ACTUAL_COLOR,
} from "../../lib/calendarCategories";
import { useT } from "../../i18n";
import { Modal } from "../kit";

interface CalendarCategorySettingsProps {
  externalCalendars: ExternalCalendar[];
  onUpdateExternalCalendar: (calendarId: string, patch: Partial<ExternalCalendar>) => void;
}

type EditorState = {
  target: "external" | "focus";
  /** The source entity's id; "focus" for the one system row. */
  sourceId: string;
  name: string;
  color: string;
};

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v4M8 4.6v.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarCategorySettings({
  externalCalendars,
  onUpdateExternalCalendar,
}: CalendarCategorySettingsProps) {
  const { t } = useT();
  const state = useCalendarCategoryState();
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Escape closes, the same as every other dialog in the app.
  useEffect(() => {
    if (!editor) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  const sections = [
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
      rows: [
        {
          id: "focus",
          name: t("calendar.focusActualCategory"),
          color: state.focusColor || FOCUS_ACTUAL_COLOR,
        },
      ],
    },
  ].filter((section) => section.rows.length > 0);

  function save() {
    if (!editor) return;
    if (editor.target === "external") onUpdateExternalCalendar(editor.sourceId, { color: editor.color });
    else setFocusColor(editor.color);
    setEditor(null);
  }

  return (
    <div className="ff-cat-settings">
      <h3 className="ff-settings-card-title">{t("settings.category.title")}</h3>

      {sections.map((section) => (
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
                  onClick={() =>
                    setEditor({ target: section.target, sourceId: row.id, name: row.name, color: row.color })
                  }
                >
                  {t("settings.category.changeColor")}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="ff-cat-footnote">
        <InfoIcon /> {t("settings.category.listsNote")}
      </p>

      {editor ? (
        <Modal
          title={t("settings.category.recolorTitle", { name: editor.name })}
          onClose={() => setEditor(null)}
        >
          <div className="ff-cat-editor">
            <div className="ff-cat-swatches" role="radiogroup" aria-label={t("settings.category.colorLabel")}>
              {CATEGORY_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={editor.color.toLowerCase() === color}
                  aria-label={color}
                  className={editor.color.toLowerCase() === color ? "ff-cat-swatch is-selected" : "ff-cat-swatch"}
                  style={{ background: color }}
                  onClick={() => setEditor({ ...editor, color })}
                />
              ))}
              <input
                type="color"
                className="ff-cat-swatch-custom"
                value={/^#[0-9a-fA-F]{6}$/.test(editor.color) ? editor.color : "#0066cc"}
                aria-label={t("calendar.recolorCustomAria")}
                onChange={(event) => setEditor({ ...editor, color: event.target.value })}
              />
            </div>
            <div className="ff-cat-editor-actions">
              <button type="button" className="ff-btn ff-btn-ghost" onClick={() => setEditor(null)}>
                {t("common.cancel")}
              </button>
              <button type="button" className="ff-btn ff-btn-primary" onClick={save}>
                {t("common.save")}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
