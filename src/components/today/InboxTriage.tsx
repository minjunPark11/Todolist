import { RefObject, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Project, Task } from "../../types";
import { Modal, MoreMenu, Popover, type MoreMenuItem } from "../kit";
import { useSelection, selectionModifiers } from "../../hooks/useSelection";
import { useT } from "../../i18n";
import { reducedTransition, transitions } from "../../motion/transitions";
import { cardVariants } from "../../motion/variants";
import { useMotionEnabled } from "../../motion/reducedMotion";

interface InboxTriageCardProps {
  items: Task[];
  onSortNow: () => void;
  sortNowRef?: RefObject<HTMLButtonElement>;
}

export function InboxTriageCard({ items, onSortNow, sortNowRef }: InboxTriageCardProps) {
  const { t } = useT();
  const preview = items.slice(0, 3);
  const rest = items.length - preview.length;

  return (
    <section className="tdy-card tdy-triage">
      <header className="tdy-card-head">
        <span className="tdy-card-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 13l2.4-7h11.2L20 13" />
            <path d="M4 13v5a1 1 0 001 1h14a1 1 0 001-1v-5" />
            <path d="M4 13h4l1.5 2.5h5L16 13h4" />
          </svg>
        </span>
        <h2>{t("todayv.inboxTriage")}</h2>
        {items.length > 0 ? <span className="tdy-bucket-count">{items.length}</span> : null}
        <button
          ref={sortNowRef}
          type="button"
          className="tdy-btn tdy-btn-light tdy-btn-sm"
          aria-label={t("todayv.sortNowAria")}
          onClick={onSortNow}
          disabled={items.length === 0}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h10M4 12h7M4 17h4M16 6v12M16 18l-3-3M16 18l3-3" />
          </svg>
          {t("todayv.sortNow")}
        </button>
      </header>

      {items.length === 0 ? (
        <p className="tdy-rail-empty">{t("todayv.inboxEmpty")}</p>
      ) : (
        <div className="tdy-chip-list">
          {preview.map((item) => (
            <button key={item.id} type="button" className="tdy-chip" onClick={onSortNow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <span>{item.title}</span>
            </button>
          ))}
          {rest > 0 ? <span className="tdy-chip-more">+{rest}</span> : null}
        </div>
      )}
    </section>
  );
}

export type TriageAction =
  | { type: "assign"; projectId: string }
  | { type: "addToToday" }
  | { type: "scheduleCalendar" }
  | { type: "archive" }
  | { type: "keep" };

/** A triage decision applied to a whole selection at once. */
export type BulkTriageAction =
  | { type: "assign"; projectId: string }
  | { type: "addToToday" }
  | { type: "archive" };

interface InboxTriageDrawerProps {
  items: Task[];
  projects: Project[];
  onTriage: (taskId: string, action: TriageAction) => void;
  onBulkTriage: (taskIds: string[], action: BulkTriageAction) => void;
  onClose: () => void;
}

export function InboxTriageDrawer({
  items,
  projects,
  onTriage,
  onBulkTriage,
  onClose,
}: InboxTriageDrawerProps) {
  const { t, lang } = useT();
  const selection = useSelection(items.map((item) => item.id));
  const [activeId, setActiveId] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);

  // The keyboard cursor starts on the first row and follows the list as rows
  // are triaged away, so a whole inbox can be cleared without the mouse.
  useEffect(() => {
    if (items.length === 0) {
      setActiveId("");
      return;
    }
    const index = items.findIndex((item) => item.id === activeId);
    if (index !== -1) {
      activeIndexRef.current = index;
      return;
    }
    // The row was just triaged away: hold the position rather than jumping
    // back to the top, so repeated presses walk down the list.
    setActiveId(items[Math.min(activeIndexRef.current, items.length - 1)].id);
  }, [items, activeId]);

  // Start on the list so the shortcuts work without a click first.
  useEffect(() => {
    listRef.current?.focus({ preventScroll: true });
  }, []);

  function moveActive(delta: number) {
    if (items.length === 0) return;
    const index = items.findIndex((item) => item.id === activeId);
    const next = Math.min(Math.max((index === -1 ? 0 : index) + delta, 0), items.length - 1);
    setActiveId(items[next].id);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-triage-id="${items[next].id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function focusList() {
    listRef.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    // Typing fields keep their keys. Checkboxes do not — the row checkbox is an
    // <input>, and treating it as one swallowed every shortcut while the user
    // had a row selected.
    const isTextField =
      target?.tagName === "TEXTAREA" ||
      target?.tagName === "SELECT" ||
      (target instanceof HTMLInputElement && target.type !== "checkbox");
    if (isTextField) return;
    // Buttons and checkboxes already do something with Space; don't double up.
    const hasNativeSpace =
      target?.tagName === "BUTTON" ||
      (target instanceof HTMLInputElement && target.type === "checkbox");
    if (!activeId) return;

    switch (event.key) {
      case "j":
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "k":
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "1":
        event.preventDefault();
        onTriage(activeId, { type: "addToToday" });
        // The row unmounts, so focus would fall to <body> and the next
        // keystroke would go nowhere. Hand it back to the list.
        focusList();
        break;
      case "3":
        event.preventDefault();
        onTriage(activeId, { type: "scheduleCalendar" });
        break;
      case "e":
        event.preventDefault();
        onTriage(activeId, { type: "archive" });
        focusList();
        break;
      case " ":
        if (hasNativeSpace) return;
        event.preventDefault();
        selection.select(activeId, { toggle: true });
        break;
      default:
        break;
    }
  }

  return (
    <Modal title={t("todayv.triageTitle")} onClose={onClose} wide>
      {items.length === 0 ? (
        <p className="tdy-rail-empty">{t("todayv.triageEmpty")}</p>
      ) : (
        <>
          <div className="tdy-triage-toolbar">
            <button
              type="button"
              className="tdy-btn tdy-btn-light tdy-btn-sm"
              onClick={selection.count === items.length ? selection.clear : selection.selectAll}
            >
              {selection.count === items.length ? t("todayv.selectNone") : t("todayv.selectAll")}
            </button>
            <p className="tdy-triage-hint">{t("todayv.triageKeyboardHint")}</p>
          </div>

          {/* Focusable so the shortcuts keep working after a row is triaged
              away and its buttons leave the DOM. */}
          <div className="tdy-triage-list" ref={listRef} tabIndex={-1} onKeyDown={handleKeyDown}>
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <TriageRow
                  key={item.id}
                  item={item}
                  projects={projects}
                  lang={lang}
                  active={item.id === activeId}
                  selected={selection.isSelected(item.id)}
                  onSelect={(modifiers) => {
                    setActiveId(item.id);
                    selection.select(item.id, modifiers);
                  }}
                  onFocusRow={() => setActiveId(item.id)}
                  onTriage={onTriage}
                />
              ))}
            </AnimatePresence>
          </div>

          {selection.count > 0 ? (
            <BulkTriageBar
              count={selection.count}
              projects={projects}
              onAction={(action) => onBulkTriage(selection.selectedIds, action)}
              onClear={selection.clear}
            />
          ) : null}
        </>
      )}
    </Modal>
  );
}

function BulkTriageBar({
  count,
  projects,
  onAction,
  onClear,
}: {
  count: number;
  projects: Project[];
  onAction: (action: BulkTriageAction) => void;
  onClear: () => void;
}) {
  const { t } = useT();
  const [spaceOpen, setSpaceOpen] = useState(false);

  return (
    <div className="tdy-bulk-bar" role="group" aria-label={t("todayv.bulkSelected", { n: count })}>
      <strong>{t("todayv.bulkSelected", { n: count })}</strong>
      <button
        type="button"
        className="tdy-btn tdy-btn-navy tdy-btn-sm"
        onClick={() => onAction({ type: "addToToday" })}
      >
        {t("todayv.addToToday")}
      </button>
      <div className="ff-anchor">
        <button
          type="button"
          className="tdy-btn tdy-btn-light tdy-btn-sm"
          disabled={projects.length === 0}
          title={projects.length === 0 ? t("todayv.needsSpaceFirst") : undefined}
          onClick={() => setSpaceOpen((open) => !open)}
        >
          {t("todayv.assignSpace")}
        </button>
        <Popover open={spaceOpen} onClose={() => setSpaceOpen(false)}>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className="ff-menu-item"
              onClick={() => {
                setSpaceOpen(false);
                onAction({ type: "assign", projectId: project.id });
              }}
            >
              <span className="ff-dot" style={{ backgroundColor: project.color }} />
              {project.name}
            </button>
          ))}
        </Popover>
      </div>
      <button
        type="button"
        className="tdy-btn tdy-btn-light tdy-btn-sm"
        onClick={() => onAction({ type: "archive" })}
      >
        {t("common.archive")}
      </button>
      <button type="button" className="tdy-bulk-clear" onClick={onClear}>
        {t("todayv.selectNone")}
      </button>
    </div>
  );
}

function TriageRow({
  item,
  projects,
  lang,
  active,
  selected,
  onSelect,
  onFocusRow,
  onTriage,
}: {
  item: Task;
  projects: Project[];
  lang: "ko" | "en";
  active: boolean;
  selected: boolean;
  onSelect: (modifiers: { toggle?: boolean; range?: boolean }) => void;
  onFocusRow: () => void;
  onTriage: (taskId: string, action: TriageAction) => void;
}) {
  const { t } = useT();
  const motionEnabled = useMotionEnabled();
  const [spaceOpen, setSpaceOpen] = useState(false);
  const created = new Intl.DateTimeFormat(lang === "ko" ? "ko" : "en", {
    month: "short",
    day: "numeric",
  }).format(new Date(item.createdAt));
  const hasNoDate = !item.dueDate && !item.scheduledDate;
  const hasNoSpace = !item.projectId;
  const hasNoPriority = item.priority === "none";
  const hasProjects = projects.length > 0;

  // Only the two decisions people actually make on most items stay on the row.
  // The rarer ones moved into the overflow menu — six buttons per row turned a
  // 15-item inbox into a wall of ninety controls.
  const menuItems: MoreMenuItem[] = [
    {
      label: t("todayv.scheduleCalendar"),
      onClick: () => onTriage(item.id, { type: "scheduleCalendar" }),
    },
    { label: t("common.archive"), onClick: () => onTriage(item.id, { type: "archive" }) },
    { separator: true },
    { label: t("todayv.keepInbox"), onClick: () => onTriage(item.id, { type: "keep" }) },
  ];

  return (
    <motion.div
      className={`tdy-triage-row${selected ? " is-selected" : ""}${active ? " is-active" : ""}`}
      data-triage-id={item.id}
      layout={motionEnabled ? "position" : false}
      variants={motionEnabled ? cardVariants : undefined}
      initial={false}
      animate={motionEnabled ? "animate" : undefined}
      exit={motionEnabled ? "exit" : undefined}
      transition={motionEnabled ? transitions.soft : reducedTransition}
    >
      <input
        type="checkbox"
        className="tdy-triage-check"
        checked={selected}
        aria-label={t("todayv.selectRowAria", { title: item.title })}
        onFocus={onFocusRow}
        onChange={() => undefined}
        onClick={(event) => onSelect(selectionModifiers(event))}
      />
      <div className="tdy-triage-info">
        <strong>{item.title}</strong>
        <small>
          {t("todayv.triageTypeInbox")} · {created}
        </small>
        <div className="tdy-triage-badges">
          {hasNoDate ? <span className="tdy-badge">{t("todayv.badgeNoDate")}</span> : null}
          {hasNoSpace ? <span className="tdy-badge">{t("todayv.badgeNoSpace")}</span> : null}
          {hasNoPriority ? <span className="tdy-badge">{t("todayv.badgeNoPriority")}</span> : null}
        </div>
      </div>
      <div className="tdy-triage-actions">
        <button
          type="button"
          className="tdy-btn tdy-btn-navy tdy-btn-sm"
          aria-label={t("todayv.addToTodayAria", { title: item.title })}
          onFocus={onFocusRow}
          onClick={() => onTriage(item.id, { type: "addToToday" })}
        >
          {t("todayv.addToToday")}
        </button>
        <div className="ff-anchor">
          <button
            type="button"
            className="tdy-btn tdy-btn-light tdy-btn-sm"
            aria-label={t("todayv.assignSpaceAria", { title: item.title })}
            title={hasProjects ? undefined : t("todayv.needsSpaceFirst")}
            disabled={!hasProjects}
            onFocus={onFocusRow}
            onClick={() => setSpaceOpen((open) => !open)}
          >
            {t("todayv.assignSpace")}
          </button>
          <Popover open={spaceOpen} onClose={() => setSpaceOpen(false)} align="end">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="ff-menu-item"
                onClick={() => {
                  setSpaceOpen(false);
                  onTriage(item.id, { type: "assign", projectId: project.id });
                }}
              >
                <span className="ff-dot" style={{ backgroundColor: project.color }} />
                {project.name}
              </button>
            ))}
          </Popover>
        </div>
        <MoreMenu items={menuItems} label={t("todayv.rowMenuAria")} />
      </div>
    </motion.div>
  );
}
