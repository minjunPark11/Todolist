// Small event/agenda popovers (spec §5.7, §6.8): title + date/time + memo
// hook only — no location / call / reminder rows. Used by month chips and
// week blocks instead of a fixed right panel.
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CalendarCategoryGroup } from "../../lib/calendarCategories";
import type { CalendarItem } from "../../utils/calendarItems";
import { formatDate } from "../../utils/date";
import { useT } from "../../i18n";

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

  // Place beside the anchor (right first, then left, then below), clamped to
  // the viewport so a chip near the edge never opens off-screen.
  useLayoutEffect(() => {
    const el = ref.current;
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
    <div
      ref={ref}
      className="gcal-popover"
      role="dialog"
      aria-label={label}
      data-calendar-interactive="true"
      style={{
        width: POPOVER_WIDTH,
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>
  );
}

export function EventPopover({
  item,
  anchor,
  categoryGroups,
  onChangeCategory,
  onClose,
  onOpenDetail,
}: {
  item: CalendarItem;
  anchor: PopoverAnchor;
  // Category spec §12/§13: the color button next to the title opens a
  // grouped category dropdown for editable (task) events.
  categoryGroups?: CalendarCategoryGroup[];
  onChangeCategory?: (item: CalendarItem, categoryId: string) => void;
  onClose: () => void;
  onOpenDetail: (item: CalendarItem) => void;
}) {
  const { t, lang } = useT();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const timeLabel = item.allDay
    ? t("calendar.allDay")
    : item.startTime
      ? `${item.startTime}${item.endTime ? ` – ${item.endTime}` : ""}`
      : "";
  const canChangeCategory = Boolean(
    categoryGroups && onChangeCategory && item.sourceType === "task" && !item.readOnly,
  );

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
      </p>
      {item.sourceType === "external" ? (
        <p className="gcal-popover-when">
          {t("calendar.externalSourceLine", { name: item.externalCalendarName ?? "" })}
        </p>
      ) : (
        <button type="button" className="gcal-popover-memo" onClick={() => onOpenDetail(item)}>
          {t("calendar.popoverAddMemo")}
        </button>
      )}
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
