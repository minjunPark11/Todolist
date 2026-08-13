import { useEffect, useMemo, useRef, useState } from "react";
import type { ConceptNote, PageId, Project, Task, TaskDraft } from "../types";
import { formatDate, getDayLabel, todayValue } from "../utils/date";
import {
  buildSpaceSignals,
  buildTimeRail,
  buildTodayPlan,
  collectTodayEntries,
  loadBucketOverrides,
  saveBucketOverrides,
  type BucketOverrides,
  type TodayBucketId,
  type TodayPlanResult,
  type TodaySpaceSignal,
} from "../utils/todayView";
import type { ToastState } from "./kit";
import { TodayBriefCard, type PlanStatus } from "./today/TodayBriefCard";
import { FocusQueue } from "./today/FocusQueue";
import { TimeRail } from "./today/TimeRail";
import { AttentionFromSpaces } from "./today/AttentionFromSpaces";
import {
  InboxTriageCard,
  InboxTriageDrawer,
  type BulkTriageAction,
  type TriageAction,
} from "./today/InboxTriage";
import { InlineCapture } from "./today/InlineCapture";
import { QuickAddTaskModal, type QuickAddInput } from "./today/QuickAddTaskModal";
import { loadCaptureTarget, saveCaptureTarget, type QuickParseResult } from "../utils/quickParse";
import { PlanTodayPreviewModal } from "./today/PlanTodayPreviewModal";
import { useT } from "../i18n";

// Cross-page requests into Today: opened once, then cleared by the caller
// (see App.tsx's todayIntent / onTodayIntentHandled).
export type TodayIntent = "" | "triage" | "quickAdd";

interface TodayPageProps {
  tasks: Task[];
  projects: Project[];
  conceptNotes: ConceptNote[];
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onArchiveTasks: (ids: string[]) => void;
  onNavigate: (page: PageId) => void;
  onOpenProject: (projectId: string) => void;
  onScheduleInCalendar: (taskId: string) => void;
  // Persisted app setting — the Focus Queue menu toggles the same value the
  // Settings page shows, so the two never disagree.
  showCompleted: boolean;
  onToggleShowCompleted: () => void;
  intent?: TodayIntent;
  onIntentHandled?: () => void;
  showToast: (toast: ToastState) => void;
}

export function TodayPage({
  tasks,
  projects,
  conceptNotes,
  onOpenTask,
  onToggleDone,
  onUpdateTask,
  onCreateTask,
  onArchiveTasks,
  onNavigate,
  onOpenProject,
  onScheduleInCalendar,
  showCompleted,
  onToggleShowCompleted,
  intent = "",
  onIntentHandled,
  showToast,
}: TodayPageProps) {
  const { t, lang } = useT();
  const today = todayValue();
  const searchRef = useRef<HTMLInputElement>(null);
  const planTimerRef = useRef<number>();

  const [searchQuery, setSearchQuery] = useState("");
  const [overrides, setOverrides] = useState<BucketOverrides>(() => loadBucketOverrides(today));
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const [planStatus, setPlanStatus] = useState<PlanStatus>("idle");
  const [plan, setPlan] = useState<TodayPlanResult | null>(null);
  const [hiddenSignalIds, setHiddenSignalIds] = useState<string[]>([]);
  const [addToToday, setAddToToday] = useState(() => loadCaptureTarget());
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const sortNowButtonRef = useRef<HTMLButtonElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const triageReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    saveBucketOverrides(overrides, today);
  }, [overrides, today]);

  useEffect(() => () => window.clearTimeout(planTimerRef.current), []);

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

  // Cmd/Ctrl + K focuses the Today search (spec §25).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const entries = useMemo(
    () => collectTodayEntries(tasks, overrides, today),
    [tasks, overrides, today],
  );
  const rail = useMemo(() => buildTimeRail(tasks, projects, today), [tasks, projects, today]);
  const signals = useMemo(
    () => buildSpaceSignals(tasks, projects, conceptNotes, today),
    [tasks, projects, conceptNotes, today],
  );

  // Inbox Triage shows only unsorted (status === "inbox") items. Scheduled
  // "todo" tasks already appear in the Focus Queue above, so including them
  // here too would duplicate the same task in both lists (spec §11).
  const triageItems = useMemo(
    () => tasks.filter((task) => task.status === "inbox" && !task.deletedAt && !task.archivedAt),
    [tasks],
  );

  // Search filters every visible Today collection (spec §25).
  const query = searchQuery.trim().toLowerCase();
  const hasQuery = query.length > 0;
  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name.toLowerCase()])),
    [projects],
  );

  const visibleEntries = useMemo(() => {
    if (!hasQuery) return entries;
    return entries.filter((entry) => {
      const haystack = [
        entry.task.title,
        projectNameById.get(entry.task.projectId) ?? "",
        entry.task.priority,
        entry.bucket,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [entries, hasQuery, query, projectNameById]);

  const visibleTriageItems = hasQuery
    ? triageItems.filter((item) => item.title.toLowerCase().includes(query))
    : triageItems;
  const visibleSignals = useMemo(() => {
    const active = signals.filter((signal) => !hiddenSignalIds.includes(signal.id));
    if (!hasQuery) return active;
    return active.filter((signal) => signal.name.toLowerCase().includes(query));
  }, [signals, hiddenSignalIds, hasQuery, query]);
  const visibleRail = useMemo(() => {
    if (!hasQuery) return rail;
    const blocks = rail.blocks.filter(
      (block) => block.type === "task" && block.title.toLowerCase().includes(query),
    );
    return { ...rail, blocks, scheduledCount: blocks.length };
  }, [rail, hasQuery, query]);

  const openEntries = entries.filter((entry) => !entry.completed);
  const overdueCount = openEntries.filter((entry) => entry.reason === "overdue").length;

  // The full form is the "I already know the details" path, so it always
  // files a Today task. Bare capture goes through handleCapture below.
  function handleCreateTask(input: QuickAddInput) {
    onCreateTask({
      title: input.title,
      status: "todo",
      scheduledDate: today,
      dueDate: input.dueDate,
      priority: input.priority,
      projectId: input.projectId || undefined,
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
      scheduledDate: parsed.scheduledDate || (addToToday ? today : ""),
      dueDate: parsed.dueDate,
      startTime: parsed.startTime,
      priority: parsed.priority || undefined,
      projectId: parsed.projectId || undefined,
    });
    // A parsed date can send a "Today" capture to another day, so the toast
    // names the day it actually landed on rather than always saying "Today".
    const landedOn = parsed.scheduledDate || (addToToday ? today : "");
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

  // Manual only — never runs on page load (spec §30).
  function handlePlanToday() {
    setPlanStatus("planning");
    window.clearTimeout(planTimerRef.current);
    planTimerRef.current = window.setTimeout(() => {
      try {
        const result = buildTodayPlan(collectTodayEntries(tasks, overrides, today), today);
        setPlan(result);
        setPlanStatus("preview");
      } catch {
        setPlanStatus("error");
      }
    }, 450);
  }

  // Every bucket change goes through here so the undo toast always restores a
  // complete snapshot rather than replaying individual moves.
  function applyOverrides(
    updater: (current: BucketOverrides) => BucketOverrides,
    message: string,
  ) {
    const previous = overrides;
    setOverrides(updater);
    showToast({
      message,
      actionLabel: t("app.undo"),
      onAction: () => setOverrides(previous),
    });
  }

  function handleMoveBucket(taskId: string, bucket: TodayBucketId) {
    setOverrides((current) => ({ ...current, [taskId]: bucket }));
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
    setPlan(null);
    setPlanStatus("idle");
  }

  function handleApplyPlan() {
    if (!plan) return;
    const known = new Set(entries.filter((entry) => !entry.completed).map((entry) => entry.task.id));
    applyOverrides((current) => {
      const next = { ...current };
      const assign = (ids: string[], bucket: TodayBucketId) => {
        for (const id of ids) {
          // Unknown / completed ids are ignored (spec §30 Apply rules).
          if (known.has(id)) next[id] = bucket;
        }
      };
      assign(plan.nowTaskIds, "now");
      assign(plan.nextTaskIds, "next");
      assign(plan.laterTaskIds, "later");
      return next;
    }, t("todayv.toastPlanApplied"));
    setPlan({ ...plan, appliedAt: new Date().toISOString() });
    setPlanStatus("applied");
  }

  function handleDismissPlan() {
    setPlanStatus(plan?.appliedAt ? "applied" : "idle");
    if (!plan?.appliedAt) setPlan(null);
  }

  // Shared by the single-row and bulk paths so the two can't drift. Assigning a
  // space only promotes an item that is still unsorted; "add to today" always
  // schedules, since that is the whole point of the action.
  function triagePatch(
    task: Task | undefined,
    action: Exclude<BulkTriageAction, { type: "archive" }>,
  ): Partial<Task> {
    if (action.type === "addToToday") {
      return { status: "todo", scheduledDate: today };
    }
    return {
      projectId: action.projectId,
      ...(task?.status === "inbox" ? { status: "todo" as const, scheduledDate: today } : {}),
    };
  }

  function handleTriage(taskId: string, action: TriageAction) {
    if (action.type === "assign" || action.type === "addToToday") {
      onUpdateTask(taskId, triagePatch(tasks.find((task) => task.id === taskId), action));
      showToast({
        message: action.type === "assign" ? t("todayv.toastAssigned") : t("todayv.toastTaskAdded"),
      });
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
      .map((task) => ({
        id: task.id,
        status: task.status,
        scheduledDate: task.scheduledDate,
        projectId: task.projectId,
      }));

    for (const entry of previous) {
      onUpdateTask(entry.id, triagePatch(tasks.find((task) => task.id === entry.id), action));
    }

    showToast({
      message:
        action.type === "assign"
          ? t("todayv.toastBulkAssigned", { n: previous.length })
          : t("todayv.toastBulkAddedToToday", { n: previous.length }),
      actionLabel: t("app.undo"),
      onAction: () => {
        for (const entry of previous) {
          onUpdateTask(entry.id, {
            status: entry.status,
            scheduledDate: entry.scheduledDate,
            projectId: entry.projectId,
          });
        }
      },
    });
  }

  function handleOpenSignal(signal: TodaySpaceSignal) {
    if (signal.kind === "study") {
      onNavigate("study");
    } else {
      onOpenProject(signal.refId);
    }
  }

  return (
    <div className="tdy-page">
      <header className="tdy-head">
        <div className="tdy-head-title">
          <h1>{t("today.title")}</h1>
          <p>{getDayLabel(today, lang)}</p>
        </div>
        <div className="tdy-head-actions">
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
                if (event.key === "Escape") setSearchQuery("");
              }}
            />
            {searchQuery ? (
              <button
                type="button"
                className="tdy-search-clear"
                aria-label={t("common.clear")}
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            ) : (
              <span className="tdy-kbd" aria-hidden="true">⌘K</span>
            )}
          </div>
          <button
            type="button"
            className="tdy-btn tdy-btn-navy tdy-add"
            aria-label={t("todayv.addTaskAria")}
            onClick={() => setQuickAddOpen(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t("todayv.add")}
          </button>
        </div>
      </header>

      <div className="tdy-body">
        <div className="tdy-main">
          <TodayBriefCard
            focusCount={openEntries.length}
            blockCount={rail.scheduledCount}
            overdueCount={overdueCount}
            inboxCount={triageItems.length}
            planStatus={planStatus}
            onPlanToday={handlePlanToday}
            onViewCalendar={() => onNavigate("calendar")}
          />

          <InlineCapture
            projects={projects}
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
            projects={projects}
            hasQuery={hasQuery}
            query={searchQuery.trim()}
            showCompleted={showCompleted}
            onToggleShowCompleted={onToggleShowCompleted}
            onToggleDone={onToggleDone}
            onOpenTask={onOpenTask}
            onMoveBucket={handleMoveBucket}
            onMoveAllLater={handleMoveAllLater}
            onClearPlan={handleClearPlan}
            onAddTask={() => setQuickAddOpen(true)}
            onOpenSpaces={() => onNavigate("projects")}
          />

          <InboxTriageCard items={visibleTriageItems} onSortNow={openTriage} sortNowRef={sortNowButtonRef} />
        </div>

        <aside className="tdy-side">
          <TimeRail rail={visibleRail} onOpenTask={onOpenTask} />
          <AttentionFromSpaces
            signals={visibleSignals}
            onOpenSignal={handleOpenSignal}
            onHideSignal={(id) => setHiddenSignalIds((current) => [...current, id])}
          />
        </aside>
      </div>

      {quickAddOpen ? (
        <QuickAddTaskModal
          projects={projects}
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
          projects={projects}
          onTriage={handleTriage}
          onBulkTriage={handleBulkTriage}
          onClose={closeTriage}
        />
      ) : null}

      {planStatus === "preview" && plan ? (
        <PlanTodayPreviewModal
          plan={plan}
          tasks={tasks}
          onApply={handleApplyPlan}
          onDismiss={handleDismissPlan}
          onRefresh={handlePlanToday}
        />
      ) : null}
    </div>
  );
}
