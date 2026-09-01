import { useEffect, useMemo, useRef, useState } from "react";
import type { List, PageId, Task, TaskDailyPlan, TaskDraft } from "../types";
import { formatDate, getDayLabel, todayValue } from "../utils/date";
import { MoreMenu, type MoreMenuItem } from "./kit";
import {
  buildTimeRail,
  buildTodayPlan,
  collectTodayEntries,


  type BucketOverrides,
  type TodayBucketId,
} from "../utils/todayView";
import { bucketOverridesFor } from "../domain/today/dailyPlan";
import { isTaskAlive, isUnsorted, LIFECYCLE } from "../domain/tasks/taskState";
import { ownerList } from "../domain/tasks/scopeQuery";
import type { ToastState } from "./kit";
import { FocusQueue } from "./today/FocusQueue";
import { TimeRail } from "./today/TimeRail";
import {
  InboxTriageCard,
  InboxTriageDrawer,
  type BulkTriageAction,
  type TriageAction,
} from "./today/InboxTriage";
import { InlineCapture } from "./today/InlineCapture";
import { QuickAddTaskModal, type QuickAddInput } from "./today/QuickAddTaskModal";
import { loadCaptureTarget, saveCaptureTarget, type QuickParseResult } from "../utils/quickParse";
import { useT } from "../i18n";

// Cross-page requests into Today: opened once, then cleared by the caller
// (see App.tsx's todayIntent / onTodayIntentHandled).
export type TodayIntent = "" | "triage" | "quickAdd";

interface TodayPageProps {
  tasks: Task[];
  /**
   * Membership needs them (§13.19): a Task whose owning List is archived or
   * deleted is not on Today, and that cannot be read from the Task alone.
   */
  lists: List[];
  /** One day-plan record per overridden task (§6.18), synced like everything else. */
  dailyPlans: TaskDailyPlan[];
  /** Replaces the whole plan for `planDate` — see usePlannerData.setTodayBuckets. */
  onSetBuckets: (overrides: BucketOverrides, planDate: string) => void;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onArchiveTasks: (ids: string[]) => void;
  onNavigate: (page: PageId) => void;
  onScheduleInCalendar: (taskId: string) => void;
  // Persisted app setting — the Focus Queue menu toggles the same value the
  // Settings page shows, so the two never disagree.
  showCompleted: boolean;
  onToggleShowCompleted: () => void;
  /** The Task the Detail beside this page has open, or "" (redesign Q6). */
  openedTaskId: string;
  intent?: TodayIntent;
  onIntentHandled?: () => void;
  showToast: (toast: ToastState) => void;
}

export function TodayPage({
  tasks,
  dailyPlans,
  lists,
  onSetBuckets,
  onOpenTask,
  onToggleDone,
  onUpdateTask,
  onCreateTask,
  onArchiveTasks,
  onNavigate,
  onScheduleInCalendar,
  showCompleted,
  onToggleShowCompleted,
  openedTaskId,
  intent = "",
  onIntentHandled,
  showToast,
}: TodayPageProps) {
  const { t, lang } = useT();
  const today = todayValue();
  const searchRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  /**
   * Whether the in-list filter is on screen (§3.2).
   *
   * It used to sit open in the header, spending half its width on a control
   * most days do not need. It is a filter of THIS list — the app's search is
   * the Rail's — so it lives behind the ⋯ and appears when asked for.
   */
  const [searchOpen, setSearchOpen] = useState(false);

  function openSearch() {
    setSearchOpen(true);
    // After the input exists. Focusing in the same tick focuses nothing.
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
  }
  // Derived from the synced records, not local state: the plan is the same on
  // every device now (§6.18), so this page reads it rather than owning it.
  const overrides = useMemo<BucketOverrides>(
    () => bucketOverridesFor(dailyPlans, today),
    [dailyPlans, today],
  );
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const [addToToday, setAddToToday] = useState(() => loadCaptureTarget());
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const sortNowButtonRef = useRef<HTMLButtonElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const triageReturnFocusRef = useRef<HTMLElement | null>(null);

  // Cross-page open requests (keyboard shortcuts, search, /inbox deep link,
  // §14 URL state) — handled once, then cleared by the caller.
  useEffect(() => {
    if (intent === "triage") {
      openTriage();
      onIntentHandled?.();
    } else if (intent === "quickAdd") {
      // The "n" shortcut lands in the capture bar; the full form stays behind
      // Alt+Enter / "details" for when the extra fields are actually wanted.
      captureRef.current?.focus();
      onIntentHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  function openTriage() {
    triageReturnFocusRef.current = (document.activeElement as HTMLElement) ?? sortNowButtonRef.current;
    setTriageOpen(true);
  }

  function closeTriage() {
    setTriageOpen(false);
    triageReturnFocusRef.current?.focus();
  }

  /*
   * Cmd/Ctrl+K used to focus this page's search, and it still opened the
   * Global Command Menu at the same time — `App` binds the same key on the
   * same window (§10.6) and both handlers ran. That was survivable while the
   * input was on screen; with the input behind the ⋯ it would be a shortcut
   * that focuses something invisible.
   *
   * So this page gives the key back. The menu owns it, the way the Rail owns
   * the app's one search entry point — the duplication P0-6 removed when a
   * second Search button stood in the Tasks header.
   */

  // The same context the Tasks Module counts with, so this list and the
  // sidebar's number cannot disagree about the day (Gate 11).
  const scopeCtx = useMemo(
    () => ({ tasks, lists, dailyPlans, taskTags: [], today }),
    [tasks, lists, dailyPlans, today],
  );
  const entries = useMemo(() => collectTodayEntries(scopeCtx, overrides), [scopeCtx, overrides]);
  const rail = useMemo(() => buildTimeRail(tasks, today), [tasks, today]);

  // Inbox Triage shows only unsorted (status === "inbox") items. Scheduled
  // "todo" tasks already appear in the Focus Queue above, so including them
  // here too would duplicate the same task in both lists (spec §11).
  const triageItems = useMemo(
    // "Unsorted" is which List a Task is in (Ch. 26 §26.3.4), which is the
    // answer `scopeQuery` has always given. The legacy `inbox` status is read
    // too, for records written before the split that the Inbox backfill has
    // not reached.
    () =>
      tasks.filter(
        (task) =>
          isTaskAlive(task) &&
          (ownerList(task, lists)?.kind === "inbox" || isUnsorted(task)),
      ),
    [tasks, lists],
  );

  // Search filters every visible Today collection (spec §25).
  const query = searchQuery.trim().toLowerCase();
  const hasQuery = query.length > 0;
  const visibleEntries = useMemo(() => {
    if (!hasQuery) return entries;
    return entries.filter((entry) => {
      const haystack = [
        entry.task.title,
        entry.task.priority,
        entry.bucket,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [entries, hasQuery, query]);

  const visibleTriageItems = hasQuery
    ? triageItems.filter((item) => item.title.toLowerCase().includes(query))
    : triageItems;
  const visibleRail = useMemo(() => {
    if (!hasQuery) return rail;
    const blocks = rail.blocks.filter(
      (block) => block.type === "task" && block.title.toLowerCase().includes(query),
    );
    return { ...rail, blocks, scheduledCount: blocks.length };
  }, [rail, hasQuery, query]);


  // The full form is the "I already know the details" path, so it always
  // files a Today task. Bare capture goes through handleCapture below.
  function handleCreateTask(input: QuickAddInput) {
    onCreateTask({
      title: input.title,
      status: LIFECYCLE.open,
      // Was `scheduledDate: today` plus a separate `dueDate`. With one date
      // (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 11) an explicit deadline is
      // what the user typed and today is only the default for its absence.
      dueDate: input.dueDate || today,
      priority: input.priority,
      notes: input.notes || undefined,
    });
    showToast({ message: t("todayv.toastTaskAdded") });
    setQuickAddOpen(false);
    setQuickAddTitle("");
  }

  // One-line capture. The toggle decides Today task vs. Inbox item (spec §10);
  // anything the parser recognised in the text wins over the toggle's default
  // date, so "내일 회의" still lands tomorrow with the toggle on Today.
  function handleCapture(parsed: QuickParseResult) {
    const title = parsed.title.trim();
    if (!title) return;
    onCreateTask({
      title,
      status: addToToday ? "todo" : "inbox",
      // The parser's date first, then its deadline, then the toggle's default.
      dueDate: parsed.relativeDate || parsed.dueDate || (addToToday ? today : ""),
      startTime: parsed.startTime,
      priority: parsed.priority || undefined,
    });
    // A parsed date can send a "Today" capture to another day, so the toast
    // names the day it actually landed on rather than always saying "Today".
    const landedOn = parsed.relativeDate || parsed.dueDate || (addToToday ? today : "");
    showToast({
      message: !addToToday
        ? t("todayv.toastAddedToInbox")
        : landedOn && landedOn !== today
          ? t("todayv.toastTaskScheduled", { date: formatDate(landedOn, lang) })
          : t("todayv.toastTaskAdded"),
    });
  }

  function handleToggleCaptureTarget() {
    setAddToToday((current) => {
      saveCaptureTarget(!current);
      return !current;
    });
  }

  // Every bucket change goes through here so the undo toast always restores a
  // complete snapshot rather than replaying individual moves.
  function applyOverrides(
    updater: (current: BucketOverrides) => BucketOverrides,
    message: string,
  ) {
    const previous = overrides;
    onSetBuckets(updater(overrides), today);
    showToast({
      message,
      actionLabel: t("app.undo"),
      onAction: () => onSetBuckets(previous, today),
    });
  }

  function handleMoveBucket(taskId: string, bucket: TodayBucketId) {
    onSetBuckets({ ...overrides, [taskId]: bucket }, today);
  }

  function handleMoveAllLater() {
    const openIds = entries.filter((entry) => !entry.completed).map((entry) => entry.task.id);
    if (openIds.length === 0) return;
    applyOverrides(
      (current) => {
        const next = { ...current };
        for (const id of openIds) next[id] = "later";
        return next;
      },
      t("todayv.toastMovedAllLater", { n: openIds.length }),
    );
  }

  // Drops every manual/planned override so the queue falls back to the
  // rule-based default bucket for each task.
  function handleClearPlan() {
    applyOverrides(() => ({}), t("todayv.toastPlanCleared"));
  }

  // Manual only — never runs on page load (spec §30). Applies straight to the
  // queue: the regrouping is visible, each row already shows why it landed
  // where it did, and the toast undoes the whole plan. A preview step in front
  // of that was only a second place for the two to disagree.
  function handlePlanToday() {
    const result = buildTodayPlan(collectTodayEntries(scopeCtx, overrides), today);
    // Unknown / completed ids are ignored (spec §30 Apply rules). Resolved up
    // front so the toast can report real counts and the updater stays pure.
    const known = new Set(entries.filter((entry) => !entry.completed).map((entry) => entry.task.id));
    const planned: Array<[TodayBucketId, string[]]> = [
      ["now", result.nowTaskIds.filter((id) => known.has(id))],
      ["next", result.nextTaskIds.filter((id) => known.has(id))],
      ["later", result.laterTaskIds.filter((id) => known.has(id))],
    ];

    applyOverrides(
      (current) => {
        const next = { ...current };
        for (const [bucket, ids] of planned) {
          for (const id of ids) next[id] = bucket;
        }
        return next;
      },
      t("todayv.toastPlanApplied", {
        now: planned[0][1].length,
        next: planned[1][1].length,
        later: planned[2][1].length,
      }),
    );
  }

  // Shared by the single-row and bulk paths so the two can't drift. Assigning a
  // space only promotes an item that is still unsorted; "add to today" always
  // schedules, since that is the whole point of the action.
  function handleTriage(taskId: string, action: TriageAction) {
    if (action.type === "addToToday") {
      onUpdateTask(taskId, { status: LIFECYCLE.open, dueDate: today });
      showToast({ message: t("todayv.toastTaskAdded") });
    } else if (action.type === "scheduleCalendar") {
      closeTriage();
      onScheduleInCalendar(taskId);
    } else if (action.type === "archive") {
      onArchiveTasks([taskId]);
    } else {
      showToast({ message: t("todayv.toastKept") });
    }
  }

  // One toast and one undo for the whole batch — N toasts for N rows would
  // just evict each other, and undoing them one at a time is not a real offer.
  function handleBulkTriage(taskIds: string[], action: BulkTriageAction) {
    if (taskIds.length === 0) return;
    if (action.type === "archive") {
      onArchiveTasks(taskIds);
      return;
    }

    const previous = taskIds
      .map((id) => tasks.find((task) => task.id === id))
      .filter((task): task is Task => Boolean(task))
      .map((task) => ({ id: task.id, status: task.status, dueDate: task.dueDate }));

    for (const entry of previous) {
      onUpdateTask(entry.id, { status: LIFECYCLE.open, dueDate: today });
    }

    showToast({
      message: t("todayv.toastBulkAddedToToday", { n: previous.length }),
      actionLabel: t("app.undo"),
      onAction: () => {
        for (const entry of previous) {
          onUpdateTask(entry.id, { status: entry.status, dueDate: entry.dueDate });
        }
      },
    });
  }

  /**
   * The page's one menu (§3.2).
   *
   * It was the list's, drawn on a card head that §3.1 took away. Nothing about
   * its contents is new here — including the three that arrange the plan's
   * boxes, which have arranged something invisible since the groups became
   * dates (§7). Phase 5 is where they go back to being conditional on the axis
   * the reader chose; taking them out now would leave "Plan Today" with no
   * entry point at all in between.
   */
  const headMenuItems: MoreMenuItem[] = [
    { label: t("todayv.searchPlaceholder"), onClick: openSearch },
    { separator: true },
    { label: t("todayv.planToday"), onClick: handlePlanToday },
    {
      label: showCompleted ? t("todayv.hideCompleted") : t("todayv.showCompleted"),
      onClick: onToggleShowCompleted,
    },
    { label: t("todayv.moveAllLater"), onClick: handleMoveAllLater },
    { separator: true },
    { label: t("todayv.clearPlan"), onClick: handleClearPlan },
  ];

  return (
    <div className="tdy-page">
      {/* §3.2: a title, the day it means, and one menu. The search input and
          the big Add button that stood here are gone — search is behind the ⋯
          (it is a filter of this list, not the app's search, which the Rail
          owns), and adding is the list's own first row from §4. */}
      <header className="tdy-head">
        <div className="tdy-head-title">
          <h1>{t("today.title")}</h1>
          {/* Beside the title rather than under it. The reference app shows no
              date at all; we keep ours because a screen called "오늘" should
              say which day that is to someone opening a laptop that slept —
              and beside the title it costs no line. */}
          <p>{getDayLabel(today, lang)}</p>
        </div>
        <div className="tdy-head-actions">
          <MoreMenu items={headMenuItems} label={t("todayv.queueMenuAria")} />
        </div>
      </header>

      <div className="tdy-body">
        <div className="tdy-main">
          {searchOpen ? (
            <div className="tdy-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                ref={searchRef}
                value={searchQuery}
                placeholder={t("todayv.searchPlaceholder")}
                aria-label={t("todayv.searchPlaceholder")}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Escape closes the whole thing rather than only emptying
                  // it: an empty box that is still there is a filter the
                  // reader has to dismiss twice.
                  if (event.key === "Escape") closeSearch();
                }}
              />
              <button
                type="button"
                className="tdy-search-clear"
                aria-label={t("common.clear")}
                onClick={closeSearch}
              >
                ✕
              </button>
            </div>
          ) : null}

          <InlineCapture
              today={today}
            addToToday={addToToday}
            onToggleAddToToday={handleToggleCaptureTarget}
            onCapture={handleCapture}
            onOpenDetails={(title) => {
              setQuickAddTitle(title);
              setQuickAddOpen(true);
            }}
            inputRef={captureRef}
          />

          <FocusQueue
            entries={visibleEntries}
              hasQuery={hasQuery}
            query={searchQuery.trim()}
            showCompleted={showCompleted}
            onToggleDone={onToggleDone}
            onOpenTask={onOpenTask}
            today={today}
            openedTaskId={openedTaskId}
            onMoveBucket={handleMoveBucket}
            /* The empty day's call to action points at the row above it
               rather than opening the full form (§3.3). Two ways to add on a
               blank screen is the duplication this phase removed from the
               header; a button that focuses the one way is a signpost. */
            onAddTask={() => captureRef.current?.focus()}
          />

          {/* Cards that would only say "nothing here" stay out of the daily
              view. Capture and the to-do list are the two things always worth
              screen space; the rest earn their place by having content. */}
          {visibleTriageItems.length > 0 ? (
            <InboxTriageCard items={visibleTriageItems} onSortNow={openTriage} sortNowRef={sortNowButtonRef} />
          ) : null}
        </div>

        {visibleRail.scheduledCount > 0 ? (
          <aside className="tdy-side">
            <TimeRail rail={visibleRail} onOpenTask={onOpenTask} />
          </aside>
        ) : null}
      </div>

      {quickAddOpen ? (
        <QuickAddTaskModal
          initialTitle={quickAddTitle}
          onCreate={handleCreateTask}
          onClose={() => {
            setQuickAddOpen(false);
            setQuickAddTitle("");
          }}
        />
      ) : null}

      {triageOpen ? (
        <InboxTriageDrawer
          items={triageItems}
          onTriage={handleTriage}
          onBulkTriage={handleBulkTriage}
          onClose={closeTriage}
        />
      ) : null}

    </div>
  );
}
