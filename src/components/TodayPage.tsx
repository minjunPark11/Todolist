import { useEffect, useMemo, useRef, useState } from "react";
import type { ConceptNote, PageId, Project, Task, TaskDraft } from "../types";
import { getDayLabel, todayValue } from "../utils/date";
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
import { InboxTriageCard, InboxTriageDrawer, type TriageAction } from "./today/InboxTriage";
import { QuickAddTaskModal, type QuickAddInput } from "./today/QuickAddTaskModal";
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
  onArchiveTask: (id: string) => void;
  onNavigate: (page: PageId) => void;
  onOpenProject: (projectId: string) => void;
  onScheduleInCalendar: (taskId: string) => void;
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
  onArchiveTask,
  onNavigate,
  onOpenProject,
  onScheduleInCalendar,
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
  const sortNowButtonRef = useRef<HTMLButtonElement>(null);
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
      setQuickAddOpen(true);
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

  // Explicit "add to today" decides Today task vs. Inbox item (spec §10).
  // Left unchecked, a title-only capture goes to Inbox instead of silently
  // landing on today's Focus Queue.
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

  function handleApplyPlan() {
    if (!plan) return;
    const known = new Set(entries.filter((entry) => !entry.completed).map((entry) => entry.task.id));
    setOverrides((current) => {
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
    });
    setPlan({ ...plan, appliedAt: new Date().toISOString() });
    setPlanStatus("applied");
    showToast({ message: t("todayv.toastPlanApplied") });
  }

  function handleDismissPlan() {
    setPlanStatus(plan?.appliedAt ? "applied" : "idle");
    if (!plan?.appliedAt) setPlan(null);
  }

  function handleTriage(taskId: string, action: TriageAction) {
    if (action.type === "assign") {
      const item = tasks.find((task) => task.id === taskId);
      onUpdateTask(taskId, {
        projectId: action.projectId,
        ...(item?.status === "inbox" ? { status: "todo", scheduledDate: today } : {}),
      });
      showToast({ message: t("todayv.toastAssigned") });
    } else if (action.type === "addToToday") {
      onUpdateTask(taskId, { status: "todo", scheduledDate: today });
      showToast({ message: t("todayv.toastTaskAdded") });
    } else if (action.type === "scheduleCalendar") {
      closeTriage();
      onScheduleInCalendar(taskId);
    } else if (action.type === "archive") {
      onArchiveTask(taskId);
    } else {
      showToast({ message: t("todayv.toastKept") });
    }
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

          <FocusQueue
            entries={visibleEntries}
            projects={projects}
            hasQuery={hasQuery}
            query={searchQuery.trim()}
            onToggleDone={onToggleDone}
            onOpenTask={onOpenTask}
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
          onCreate={handleCreateTask}
          onClose={() => setQuickAddOpen(false)}
        />
      ) : null}

      {triageOpen ? (
        <InboxTriageDrawer
          items={triageItems}
          projects={projects}
          onTriage={handleTriage}
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
