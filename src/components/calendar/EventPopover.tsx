// Small event/agenda popovers (spec §5.7, §6.8): title + date/time + memo
// hook only — no location / call / reminder rows. Used by month chips and
// week blocks instead of a fixed right panel.
import { FormEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { CalendarCategoryGroup } from "../../lib/calendarCategories";
import type { CalendarItem } from "../../utils/calendarItems";
import { formatDate } from "../../utils/date";
import { useT } from "../../i18n";
import { reducedTransition, transitions } from "../../motion/transitions";
import { popoverVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

export interface PopoverAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function anchorFromRect(rect: DOMRect): PopoverAnchor {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

const POPOVER_WIDTH = 280;
const MARGIN = 8;

export function CalendarPopover({
  anchor,
  onClose,
  children,
  label,
}: {
  anchor: PopoverAnchor;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const motionEnabled = useMotionEnabled();

  // Place beside the anchor (right first, then left, then below), clamped to
  // the viewport so a chip near the edge never opens off-screen. Re-clamps
  // when the content grows (e.g. the inline quick-edit form expands).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    function place() {
      if (!el) return;
      const height = el.offsetHeight;
      let left = anchor.right + MARGIN;
      if (left + POPOVER_WIDTH > window.innerWidth - MARGIN) {
        left = anchor.left - POPOVER_WIDTH - MARGIN;
      }
      let top = anchor.top;
      if (left < MARGIN) {
        left = Math.min(Math.max(anchor.left, MARGIN), window.innerWidth - POPOVER_WIDTH - MARGIN);
        top = anchor.bottom + MARGIN;
      }
      left = Math.max(left, MARGIN);
      top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, window.innerHeight - height - MARGIN));
      setPosition({ left, top });
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey, true);
    // Delay so the opening click doesn't immediately close the popover.
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", onPointerDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      className="gcal-popover"
      role="dialog"
      aria-label={label}
      data-calendar-interactive="true"
      variants={motionEnabled ? popoverVariants : undefined}
      initial={motionEnabled ? "initial" : false}
      animate={motionEnabled ? "animate" : undefined}
      exit={motionEnabled ? "exit" : undefined}
      transition={motionEnabled ? transitions.fast : reducedTransition}
      style={{
        width: POPOVER_WIDTH,
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </motion.div>
  );
}

export function EventPopover({
  item,
  anchor,
  categoryGroups,
  onChangeCategory,
  onClose,
  onOpenDetail,
  onDelete,
  initialMemo,
  onSaveQuickEdit,
}: {
  item: CalendarItem;
  anchor: PopoverAnchor;
  // Category spec §12/§13: the color button next to the title opens a
  // grouped category dropdown for editable (task) events.
  categoryGroups?: CalendarCategoryGroup[];
  onChangeCategory?: (item: CalendarItem, categoryId: string) => void;
  onClose: () => void;
  /**
   * Where a non-task event's "add memo" led: the Project detail behind a
   * project-deadline marker. Projects are gone, and the only non-task events
   * left — external and focus — have no screen of their own, so the button is
   * not drawn when no caller offers one.
   */
  onOpenDetail?: (item: CalendarItem) => void;
  onDelete?: (item: CalendarItem) => void;
  // Quick edit (start/end time + memo) inline in the popover, replacing the
  // jump to the day-view detail panel for task events.
  initialMemo?: string;
  onSaveQuickEdit?: (item: CalendarItem, input: { startTime: string; endTime: string; memo: string }) => void;
}) {
  const { t, lang } = useT();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [startTime, setStartTime] = useState(item.startTime ?? "");
  const [endTime, setEndTime] = useState(item.endTime ?? "");
  const [memo, setMemo] = useState(initialMemo ?? "");
  const timeLabel = item.allDay
    ? t("calendar.allDay")
    : item.startTime
      ? `${item.startTime}${item.endTime ? ` – ${item.endTime}` : ""}`
      : "";
  const canChangeCategory = Boolean(
    categoryGroups && onChangeCategory && item.sourceType === "task" && !item.readOnly,
  );
  const canQuickEdit = Boolean(onSaveQuickEdit && item.sourceType === "task" && !item.readOnly);

  function submitQuickEdit(event: FormEvent) {
    event.preventDefault();
    onSaveQuickEdit!(item, { startTime, endTime, memo });
  }
  // Only task-backed events can be deleted; derived markers (project deadline,
  // review) and read-only external events keep the popover action-free.
  const canDelete = Boolean(onDelete && item.sourceType === "task" && !item.readOnly);

  // While the popover is open it acts as the selection, so Delete/Backspace
  // deletes the event without a separate selected-block state.
  useEffect(() => {
    if (!canDelete) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      event.stopPropagation();
      onDelete!(item);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [canDelete, item, onDelete]);

  return (
    <CalendarPopover anchor={anchor} onClose={onClose} label={item.title}>
      <header className="gcal-popover-head">
        <span className="gcal-popover-dot" style={{ background: item.color }} aria-hidden="true" />
        <strong className="gcal-popover-title">{item.title}</strong>
        {canChangeCategory ? (
          <button
            type="button"
            className="gcal-popover-category-btn"
            aria-label={t("calendar.changeCategoryAria")}
            aria-expanded={categoryOpen}
            onClick={() => setCategoryOpen((open) => !open)}
          >
            <span className="gcal-popover-category-swatch" style={{ background: item.color }} />
            <span aria-hidden="true">⌄</span>
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            className="gcal-popover-delete"
            aria-label={t("calendar.deleteEvent")}
            title={t("calendar.deleteEvent")}
            onClick={() => onDelete!(item)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
              <path d="M2.5 4h11M6.5 4V2.8a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8V4M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4M6.6 7v4M9.4 7v4" />
            </svg>
          </button>
        ) : null}
        <button type="button" className="gcal-popover-close" aria-label={t("common.close")} onClick={onClose}>
          ✕
        </button>
      </header>
      {canChangeCategory && categoryOpen ? (
        <div className="gcal-popover-category-list" role="listbox" aria-label={t("calendar.categoryLabel")}>
          {categoryGroups!.map((group) =>
            group.categories.length === 0 ? null : (
              <div key={group.type} className="gcal-popover-category-group">
                <span className="gcal-popover-category-group-name">{t(`calendar.group.${group.type}`)}</span>
                {group.categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    role="option"
                    aria-selected={category.id === item.categoryId}
                    className={category.id === item.categoryId ? "gcal-popover-category-item is-current" : "gcal-popover-category-item"}
                    disabled={category.isReadOnly}
                    onClick={() => {
                      setCategoryOpen(false);
                      if (category.id !== item.categoryId) onChangeCategory!(item, category.id);
                    }}
                  >
                    <span className="gcal-popover-category-swatch" style={{ background: category.color }} />
                    <span className="gcal-popover-category-name">{category.name}</span>
                    {category.id === item.categoryId ? <span aria-hidden="true">✓</span> : null}
                  </button>
                ))}
              </div>
            ),
          )}
        </div>
      ) : null}
      <p className="gcal-popover-when">
        {formatDate(item.date, lang)}
        {timeLabel ? ` · ${timeLabel}` : ""}
        {item.status === "done" ? ` · ${t("status.done")}` : ""}
      </p>
      {item.sourceType === "external" ? (
        <p className="gcal-popover-when">
          {t("calendar.externalSourceLine", { name: item.externalCalendarName ?? "" })}
        </p>
      ) : item.sourceType === "focus" ? (
        <p className="gcal-popover-when">{t("calendar.focusSourceLine")}</p>
      ) : canQuickEdit ? (
        editOpen ? (
          <form className="gcal-popover-edit" onSubmit={submitQuickEdit}>
            <div className="gcal-popover-edit-row">
              <label>
                <span>{t("calendar.startTime")}</span>
                <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </label>
              <label>
                <span>{t("calendar.endTime")}</span>
                <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </label>
            </div>
            <label className="gcal-popover-edit-memo">
              <span>{t("calendar.memoLabel")}</span>
              <textarea
                rows={3}
                value={memo}
                placeholder={t("calendar.popoverAddMemo")}
                onChange={(event) => setMemo(event.target.value)}
                autoFocus
              />
            </label>
            <div className="gcal-popover-edit-actions">
              <button type="button" onClick={() => setEditOpen(false)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="is-primary">
                {t("common.save")}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="gcal-popover-memo" onClick={() => setEditOpen(true)}>
            {t("calendar.popoverAddMemo")}
          </button>
        )
      ) : onOpenDetail ? (
        <button type="button" className="gcal-popover-memo" onClick={() => onOpenDetail(item)}>
          {t("calendar.popoverAddMemo")}
        </button>
      ) : null}
    </CalendarPopover>
  );
}

export function DayAgendaPopover({
  date,
  items,
  anchor,
  onClose,
  onClickItem,
}: {
  date: string;
  items: CalendarItem[];
  anchor: PopoverAnchor;
  onClose: () => void;
  onClickItem: (item: CalendarItem, anchor: PopoverAnchor) => void;
}) {
  const { t, lang } = useT();
  return (
    <CalendarPopover anchor={anchor} onClose={onClose} label={formatDate(date, lang)}>
      <header className="gcal-popover-head">
        <strong className="gcal-popover-title">{formatDate(date, lang)}</strong>
        <button type="button" className="gcal-popover-close" aria-label={t("common.close")} onClick={onClose}>
          ✕
        </button>
      </header>
      <ul className="gcal-popover-agenda">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={(event) => onClickItem(item, anchorFromRect(event.currentTarget.getBoundingClientRect()))}
            >
              <span className="gcal-popover-dot" style={{ background: item.color }} aria-hidden="true" />
              <span className="gcal-popover-agenda-title">{item.title}</span>
              <small>{item.allDay ? t("calendar.allDay") : item.startTime ?? ""}</small>
            </button>
          </li>
        ))}
      </ul>
    </CalendarPopover>
  );
}
