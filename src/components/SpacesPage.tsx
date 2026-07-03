import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type { ConceptNote, FocusSession, PageId, Project, ProjectType, StudyTopic, Subtask, Task, TaskDraft } from "../types";
import type { ToastState } from "./kit";
import { SpaceDetailView } from "./spaces/SpaceDetailView";
import { DeleteSpaceConfirmModal } from "./spaces/SpaceModals";
import { useT } from "../i18n";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

type SpaceType = "project" | "study" | "custom";
type SpaceStatus = "Blocked" | "Needs Focus" | "Review Needed" | "In Progress" | "On Track" | "New";
type AiPriority = "High" | "Medium" | "Low";
type FilterType = "all" | SpaceType;
type AddStep = "choose_type" | "form";
type AddState = "choose_type_idle" | "choose_type_selected" | "form_editing" | "form_validation_error" | "creating" | "discard_confirm" | "create_error";

type Space = {
  id: string;
  name: string;
  type: SpaceType;
  status: SpaceStatus;
  mainSignal: string;
  aiPriority: AiPriority;
  recentActivityCount: number;
  description: string;
  color: string;
  updatedLabel: string;
  topics: string[];
  sourceId?: string;
  sourceRef?: "project" | "study" | "local";
  pinned?: boolean;
  objective?: string;
  learningGoal?: string;
};

type ActivitySignal = {
  id: string;
  title: string;
  detail: string;
  age: string;
  severity: AiPriority;
  spaceId: string;
};

type AddSpaceDraft = {
  type: SpaceType | null;
  name: string;
  description: string;
  objective: string;
  deadline: string;
  initialMilestonesText: string;
  initialTasksText: string;
  learningGoal: string;
  initialTopicsText: string;
  trackingStyle: "problems" | "concepts" | "notes" | "mixed";
  customSectionsText: string;
};

type SpacesPageProps = {
  projects: Project[];
  tasks: Task[];
  subtasks: Subtask[];
  studyTopics: StudyTopic[];
  conceptNotes: ConceptNote[];
  focusSessions: FocusSession[];
  activeFocusSession: FocusSession | null;
  selectedTaskId: string;
  taskDetail: ReactNode;
  selectedProjectId: string;
  detailOpen: boolean;
  onOpenProject: (id: string) => void;
  onCloseProject: () => void;
  onOpenTask: (id: string) => void;
  onToggleDone: (id: string) => void;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onCreateTask: (draft: TaskDraft) => string;
  onCompleteTask: (id: string) => void;
  onArchiveTask: (id: string) => void;
  onStartFocus: (taskId: string, source?: FocusSession["source"]) => void;
  onNavigate: (page: PageId) => void;
  // Opens the main Calendar, optionally pre-filtered to one project.
  onOpenCalendar: (projectId?: string) => void;
  onCreateProject: (input: { name: string; color?: string; type?: ProjectType; description?: string; dueDate?: string }) => string;
  onUpdateProject: (id: string, patch: Partial<Project>) => void;
  onUpdateTopic: (id: string, patch: Partial<StudyTopic>) => void;
  onToggleStar: (id: string) => void;
  onArchiveProject: (id: string) => void;
  onRequestDeleteProject: (id: string) => void;
  onDeleteTopic: (id: string) => void;
  onSaveNotes: (id: string, value: string) => void;
  showToast: (toast: ToastState) => void;
};

const typeColor: Record<SpaceType, string> = {
  project: "#7c3aed",
  study: "#2563eb",
  custom: "#f97316",
};

const STATUS_KEY: Record<SpaceStatus, string> = {
  Blocked: "blocked",
  "Needs Focus": "needsFocus",
  "Review Needed": "reviewNeeded",
  "In Progress": "inProgress",
  "On Track": "onTrack",
  New: "new",
};

function typeLabel(t: TFn, type: SpaceType) {
  return t(`spaces.type.${type}`);
}
function typeDesc(t: TFn, type: SpaceType) {
  return t(`spaces.typeDesc.${type}`);
}
function statusLabel(t: TFn, status: SpaceStatus) {
  return t(`spaces.status.${STATUS_KEY[status]}`);
}
function priorityLabel(t: TFn, priority: AiPriority) {
  return t(`spaces.priority.${priority.toLowerCase()}`);
}

const emptyDraft: AddSpaceDraft = {
  type: null,
  name: "",
  description: "",
  objective: "",
  deadline: "",
  initialMilestonesText: "",
  initialTasksText: "",
  learningGoal: "",
  initialTopicsText: "",
  trackingStyle: "mixed",
  customSectionsText: "",
};

export function SpacesPage({
  projects,
  tasks,
  studyTopics,
  conceptNotes,
  focusSessions,
  activeFocusSession,
  selectedProjectId,
  detailOpen,
  onOpenProject,
  onCloseProject,
  onCreateProject,
  onCreateTask,
  onUpdateTask,
  onCompleteTask,
  onArchiveTask,
  onStartFocus,
  onNavigate,
  onOpenCalendar,
  onUpdateProject,
  onUpdateTopic,
  onToggleStar,
  onRequestDeleteProject,
  onDeleteTopic,
  showToast,
}: SpacesPageProps) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [localSpaces, setLocalSpaces] = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [highlightSignalId, setHighlightSignalId] = useState("");
  const [analysisState, setAnalysisState] = useState<"empty" | "loading" | "success" | "insufficient" | "error">("empty");
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<Date | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>("choose_type");
  const [addState, setAddState] = useState<AddState>("choose_type_idle");
  const [draft, setDraft] = useState<AddSpaceDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [openMenuSpaceId, setOpenMenuSpaceId] = useState("");
  const [pendingDeleteSpaceId, setPendingDeleteSpaceId] = useState("");
  const [localPinnedSpaceIds, setLocalPinnedSpaceIds] = useState<string[]>([]);
  const [pendingRenameSpaceId, setPendingRenameSpaceId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState("");

  const spaces = useMemo(
    () =>
      [...deriveProjectSpaces(projects, tasks, t), ...deriveStudySpaces(studyTopics, conceptNotes, t), ...localSpaces]
        .map((space) => ({ ...space, pinned: Boolean(space.pinned || localPinnedSpaceIds.includes(space.id)) })),
    [conceptNotes, localPinnedSpaceIds, localSpaces, projects, studyTopics, tasks, t],
  );
  const signals = useMemo(() => deriveSignals(spaces, tasks, conceptNotes, t), [conceptNotes, spaces, tasks, t]);
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces.find((space) => space.sourceId === selectedProjectId);
  const pendingDeleteSpace = spaces.find((space) => space.id === pendingDeleteSpaceId);
  const pendingRenameSpace = spaces.find((space) => space.id === pendingRenameSpaceId);
  const isDetailOpen = Boolean(selectedSpace) && (detailOpen || selectedSpaceId);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleSpaces = spaces
    .filter((space) => {
      if (filter !== "all" && space.type !== filter) return false;
      if (!normalizedQuery) return true;
      const signalText = signals.filter((signal) => signal.spaceId === space.id).map((signal) => signal.title).join(" ");
      return [space.name, space.type, space.description, space.status, space.mainSignal, space.aiPriority, space.topics.join(" "), signalText]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && openMenuSpaceId) {
        setOpenMenuSpaceId("");
        return;
      }
      if (event.key === "Escape" && addOpen) {
        tryCloseAdd();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addOpen, draft, openMenuSpaceId]);

  useEffect(() => {
    if (!openMenuSpaceId) return;

    function closeMenu() {
      setOpenMenuSpaceId("");
    }

    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".spc-card-menu-wrap")) return;
      closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("popstate", closeMenu);
    window.addEventListener("pageshow", closeMenu);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("focusflow:page-change", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("popstate", closeMenu);
      window.removeEventListener("pageshow", closeMenu);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("focusflow:page-change", closeMenu);
    };
  }, [openMenuSpaceId]);

  function openSpace(space: Space, signalId = "") {
    setOpenMenuSpaceId("");
    setSelectedSpaceId(space.id);
    setHighlightSignalId(signalId);
    if (space.sourceRef === "project" && space.sourceId) {
      onOpenProject(space.sourceId);
    }
  }

  function closeSpace() {
    setSelectedSpaceId("");
    setHighlightSignalId("");
    onCloseProject();
  }

  function deleteSpace(space: Space) {
    if (space.sourceRef === "project" && space.sourceId) {
      onRequestDeleteProject(space.sourceId);
      setPendingDeleteSpaceId("");
      return;
    }
    if (space.sourceRef === "study" && space.sourceId) {
      onDeleteTopic(space.sourceId);
      setPendingDeleteSpaceId("");
      setLocalPinnedSpaceIds((current) => current.filter((id) => id !== space.id));
      closeSpace();
      showToast({ message: t("spaces.delete.deleted", { name: space.name }) });
      return;
    }
    setLocalSpaces((current) => current.filter((item) => item.id !== space.id));
    setLocalPinnedSpaceIds((current) => current.filter((id) => id !== space.id));
    setPendingDeleteSpaceId("");
    closeSpace();
    showToast({ message: t("spaces.delete.deleted", { name: space.name }) });
  }

  function togglePinSpace(space: Space) {
    setOpenMenuSpaceId("");
    if (space.sourceRef === "project" && space.sourceId) {
      onToggleStar(space.sourceId);
    } else {
      setLocalPinnedSpaceIds((current) =>
        current.includes(space.id) ? current.filter((id) => id !== space.id) : [space.id, ...current],
      );
    }
    showToast({ message: t(space.pinned ? "spaces.pin.unpinned" : "spaces.pin.pinned", { name: space.name }) });
  }

  function openRenameSpace(space: Space) {
    setOpenMenuSpaceId("");
    setPendingRenameSpaceId(space.id);
    setRenameDraft(space.name);
    setRenameError("");
  }

  function renameSpace(space: Space, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setRenameError(t("spaces.rename.required"));
      return;
    }
    if (spaces.some((item) => item.id !== space.id && item.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setRenameError(t("spaces.rename.duplicate"));
      return;
    }
    if (space.sourceRef === "project" && space.sourceId) {
      onUpdateProject(space.sourceId, { name: trimmed });
    } else if (space.sourceRef === "study" && space.sourceId) {
      onUpdateTopic(space.sourceId, { name: trimmed });
    } else {
      setLocalSpaces((current) => current.map((item) => (item.id === space.id ? { ...item, name: trimmed } : item)));
    }
    setPendingRenameSpaceId("");
    setRenameDraft("");
    setRenameError("");
    showToast({ message: t("spaces.rename.saved", { name: trimmed }) });
  }

  function formatAnalyzedAt(date: Date) {
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return t("spaces.brief.lastAnalyzedToday", { time });
    const day = date.toLocaleDateString([], { month: "short", day: "numeric" });
    return t("spaces.brief.lastAnalyzedOn", { date: day, time });
  }

  function analyzeSpaces() {
    if (spaces.length < 2 || signals.length < 2) {
      setAnalysisState("insufficient");
      return;
    }
    setAnalysisState("loading");
    window.setTimeout(() => {
      setAnalysisState("success");
      setLastAnalyzedAt(new Date());
    }, 650);
  }

  function resetAdd() {
    setAddOpen(false);
    setAddStep("choose_type");
    setAddState("choose_type_idle");
    setDraft(emptyDraft);
    setFormError("");
  }

  function tryCloseAdd() {
    if (hasDraftContent(draft)) {
      setAddState("discard_confirm");
      return;
    }
    resetAdd();
  }

  function updateDraft(patch: Partial<AddSpaceDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError("");
    if (addStep === "form") setAddState("form_editing");
  }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateDraft(draft, spaces, t);
    if (error) {
      setFormError(error);
      setAddState("form_validation_error");
      return;
    }

    setAddState("creating");
    window.setTimeout(() => {
      try {
        const space = createSpaceFromDraft(draft, t);
        let nextSpace = space;
        if (space.type === "project") {
          const projectId = onCreateProject({
            name: space.name,
            color: space.color,
            type: "project",
            description: space.description,
            dueDate: draft.deadline,
          });
          if (projectId) {
            nextSpace = { ...space, sourceRef: "project", sourceId: projectId };
          }
        }
        setLocalSpaces((current) => [nextSpace, ...current]);
        setSelectedSpaceId(nextSpace.id);
        showToast({ message: t("spaces.add.created", { name: nextSpace.name }) });
        resetAdd();
      } catch {
        setFormError(t("spaces.add.createError"));
        setAddState("create_error");
      }
    }, 520);
  }

  if (isDetailOpen && selectedSpace) {
    return (
      <SpaceDetailView
        space={selectedSpace}
        tasks={tasks}
        projects={projects}
        conceptNotes={conceptNotes}
        focusSessions={focusSessions}
        activeFocusSession={activeFocusSession}
        onBack={closeSpace}
        onCreateTask={onCreateTask}
        onUpdateTask={onUpdateTask}
        onCompleteTask={onCompleteTask}
        onArchiveTask={onArchiveTask}
        onStartFocus={onStartFocus}
        onUpdateProject={onUpdateProject}
        onDeleteSpace={() => deleteSpace(selectedSpace)}
        onNavigate={onNavigate}
        onOpenCalendar={() =>
          onOpenCalendar(selectedSpace.sourceRef === "project" ? selectedSpace.sourceId : undefined)
        }
        showToast={showToast}
      />
    );
  }

  return (
    <div className="spc-page">
      <header className="spc-header">
        <div>
          <h1>{t("spaces.title")}</h1>
          <p>{t("spaces.subtitle")}</p>
        </div>
        <label className="spc-search">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("spaces.searchPlaceholder")}
            aria-label={t("spaces.searchLabel")}
          />
        </label>
      </header>

      <section className={analysisState === "success" ? "spc-brief analyzed" : "spc-brief"}>
        <div className="spc-brief-icon"><SparkIcon /></div>
        <div className="spc-brief-copy">
          <h2>{t("spaces.brief.title")}</h2>
          {analysisState === "empty" ? (
            <>
              <strong>{t("spaces.brief.emptyTitle")}</strong>
              <p>{t("spaces.brief.emptyBody")}</p>
            </>
          ) : analysisState === "loading" ? (
            <>
              <strong>{t("spaces.brief.loadingTitle")}</strong>
              <p>{t("spaces.brief.loadingBody")}</p>
            </>
          ) : analysisState === "insufficient" ? (
            <>
              <strong>{t("spaces.brief.insufficientTitle")}</strong>
              <p>{t("spaces.brief.insufficientBody")}</p>
            </>
          ) : (
            <>
              <strong>{t("spaces.brief.recommendPrefix")} <span>LeetCode</span> {t("spaces.brief.and")} <span>Personal App</span></strong>
              <p>{t("spaces.brief.recommendBody")}</p>
            </>
          )}
        </div>
        <div className="spc-brief-actions">
          {analysisState === "success" && lastAnalyzedAt ? <span>{formatAnalyzedAt(lastAnalyzedAt)}</span> : null}
          <button type="button" className="spc-btn spc-btn-soft" onClick={() => setReasonOpen(true)} disabled={analysisState !== "success"}>
            <InfoIcon /> {t("spaces.brief.whyThis")}
          </button>
          <button type="button" className="spc-btn spc-btn-primary" onClick={() => setSignalsOpen(true)} disabled={analysisState !== "success"}>
            <SignalIcon /> {t("spaces.brief.viewSignals")}
          </button>
          <button type="button" className="spc-btn" onClick={analyzeSpaces} disabled={analysisState === "loading"}>
            <RefreshIcon /> {analysisState === "success" ? t("spaces.brief.refresh") : t("spaces.brief.analyze")}
          </button>
        </div>
      </section>

      <section className="spc-filter-bar" aria-label={t("spaces.filterLabel")}>
        {(["all", "project", "study", "custom"] as FilterType[]).map((item) => (
          <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
            {item === "all" ? t("spaces.filter.all") : typeLabel(t, item)}
          </button>
        ))}
      </section>

      <section className="spc-grid" aria-label={t("spaces.cardsLabel")}>
        {visibleSpaces.map((space) => (
          <SpaceCard
            key={space.id}
            space={space}
            menuOpen={openMenuSpaceId === space.id}
            onOpen={() => openSpace(space)}
            onToggleMenu={() => setOpenMenuSpaceId((current) => (current === space.id ? "" : space.id))}
            onTogglePin={() => togglePinSpace(space)}
            onRequestRename={() => openRenameSpace(space)}
            onRequestDelete={() => {
              setOpenMenuSpaceId("");
              setPendingDeleteSpaceId(space.id);
            }}
          />
        ))}
        <button type="button" className="spc-add-card" onClick={() => setAddOpen(true)}>
          <span><PlusIcon /></span>
          <strong>{t("spaces.addCard.title")}</strong>
          <small>{t("spaces.addCard.subtitle")}</small>
        </button>
      </section>

      <section className="spc-activity">
        <div className="spc-section-head">
          <div>
            <h2>{t("spaces.activity.title")}</h2>
            <p>{t("spaces.activity.subtitle")}</p>
          </div>
          <button type="button" onClick={() => setSignalsOpen(true)}>{t("spaces.activity.viewAll")} <ArrowIcon /></button>
        </div>
        <div className="spc-signal-list">
          {signals.slice(0, 6).map((signal) => {
            const space = spaces.find((item) => item.id === signal.spaceId);
            if (!space) return null;
            return (
              <button key={signal.id} type="button" className="spc-signal-row" onClick={() => openSpace(space, signal.id)}>
                <span className={`spc-signal-severity ${signal.severity.toLowerCase()}`}>{priorityLabel(t, signal.severity)}</span>
                <span>{signal.age}</span>
                <strong>{signal.title}</strong>
                <em style={{ color: space.color }}>{space.name}</em>
                <ArrowIcon />
              </button>
            );
          })}
        </div>
      </section>

      {addOpen ? (
        <AddSpaceModal
          step={addStep}
          state={addState}
          draft={draft}
          error={formError}
          onChooseType={(type) => {
            setDraft((current) => ({ ...current, type }));
            setAddState("choose_type_selected");
          }}
          onContinue={() => {
            if (!draft.type) return;
            setAddStep("form");
            setAddState("form_editing");
            setFormError("");
          }}
          onBack={() => {
            setAddStep("choose_type");
            setAddState(draft.type ? "choose_type_selected" : "choose_type_idle");
            setFormError("");
          }}
          onUpdate={updateDraft}
          onSubmit={submitAdd}
          onClose={tryCloseAdd}
          onKeepEditing={() => setAddState(addStep === "form" ? "form_editing" : draft.type ? "choose_type_selected" : "choose_type_idle")}
          onDiscard={resetAdd}
        />
      ) : null}

      {reasonOpen ? (
        <SimpleModal title={t("spaces.reason.title")} onClose={() => setReasonOpen(false)}>
          <ul className="spc-reason-list">
            <li>{t("spaces.reason.item1")}</li>
            <li>{t("spaces.reason.item2")}</li>
            <li>{t("spaces.reason.item3")}</li>
          </ul>
        </SimpleModal>
      ) : null}

      {signalsOpen ? (
        <SimpleModal title={t("spaces.signalsModal.title")} onClose={() => setSignalsOpen(false)}>
          <div className="spc-modal-signal-list">
            {signals.map((signal) => (
              <div key={signal.id}>
                <strong>{signal.title}</strong>
                <span>{signal.detail} - {signal.age}</span>
              </div>
            ))}
          </div>
        </SimpleModal>
      ) : null}

      {pendingDeleteSpace ? (
        <DeleteSpaceConfirmModal
          spaceName={pendingDeleteSpace.name}
          isProject={pendingDeleteSpace.sourceRef === "project"}
          isStudy={pendingDeleteSpace.sourceRef === "study"}
          onConfirm={() => deleteSpace(pendingDeleteSpace)}
          onClose={() => setPendingDeleteSpaceId("")}
        />
      ) : null}

      {pendingRenameSpace ? (
        <RenameSpaceModal
          spaceName={pendingRenameSpace.name}
          value={renameDraft}
          error={renameError}
          onChange={(value) => {
            setRenameDraft(value);
            setRenameError("");
          }}
          onSubmit={() => renameSpace(pendingRenameSpace, renameDraft)}
          onClose={() => {
            setPendingRenameSpaceId("");
            setRenameDraft("");
            setRenameError("");
          }}
        />
      ) : null}
    </div>
  );
}

function SpaceCard({
  space,
  menuOpen,
  onOpen,
  onToggleMenu,
  onTogglePin,
  onRequestRename,
  onRequestDelete,
}: {
  space: Space;
  menuOpen: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onTogglePin: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
}) {
  const { t } = useT();
  return (
    <article className="spc-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
      <div className="spc-card-top">
        <span className="spc-card-icon" style={{ background: space.color }}><SpaceIcon type={space.type} /></span>
        <div className="spc-card-menu-wrap">
          <button
            type="button"
            className="spc-more-button"
            aria-label={t("spaces.card.openMenu", { name: space.name })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              onToggleMenu();
            }}
          >
            <MoreIcon />
          </button>
          {menuOpen ? (
            <div className="spc-card-menu" role="menu" onClick={(event) => event.stopPropagation()}>
              <button type="button" role="menuitem" onClick={onOpen}>
                {t("spaces.card.menuOpen")}
              </button>
              <button type="button" role="menuitem" onClick={onTogglePin}>
                {t(space.pinned ? "spaces.card.menuUnpin" : "spaces.card.menuPin")}
              </button>
              <button type="button" role="menuitem" onClick={onRequestRename}>
                {t("spaces.card.menuRename")}
              </button>
              <button type="button" role="menuitem" className="danger" onClick={onRequestDelete}>
                {t("spaces.card.menuDelete")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <strong>{space.name}</strong>
      <span className="spc-type" style={{ color: typeColor[space.type] }}>{typeLabel(t, space.type)}</span>
      <p>{space.description}</p>
      <div className="spc-card-badges">
        <span className={`spc-status ${statusClass(space.status)}`}>{statusLabel(t, space.status)}</span>
        <span>{t("spaces.card.signals", { n: space.recentActivityCount })}</span>
      </div>
      <small>{t("spaces.card.mainSignal", { signal: space.mainSignal })}</small>
      <small>{t("spaces.card.aiPriority")} <i className={space.aiPriority.toLowerCase()} /> {priorityLabel(t, space.aiPriority)}</small>
      <footer><span>{t("spaces.card.updated", { when: space.updatedLabel })}</span><ArrowIcon /></footer>
    </article>
  );
}

function AddSpaceModal({
  step,
  state,
  draft,
  error,
  onChooseType,
  onContinue,
  onBack,
  onUpdate,
  onSubmit,
  onClose,
  onKeepEditing,
  onDiscard,
}: {
  step: AddStep;
  state: AddState;
  draft: AddSpaceDraft;
  error: string;
  onChooseType: (type: SpaceType) => void;
  onContinue: () => void;
  onBack: () => void;
  onUpdate: (patch: Partial<AddSpaceDraft>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const { t } = useT();
  if (state === "discard_confirm") {
    return (
      <div className="spc-modal-backdrop">
        <section className="spc-modal spc-confirm" role="dialog" aria-modal="true" aria-labelledby="discard-title">
          <h2 id="discard-title">{t("spaces.add.discardTitle")}</h2>
          <p>{t("spaces.add.discardBody")}</p>
          <div className="spc-modal-actions">
            <button type="button" className="spc-btn" onClick={onKeepEditing}>{t("spaces.add.keepEditing")}</button>
            <button type="button" className="spc-btn spc-btn-danger" onClick={onDiscard}>{t("spaces.add.discard")}</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="spc-modal-backdrop">
      <form className="spc-modal" role="dialog" aria-modal="true" aria-labelledby="add-space-title" onSubmit={onSubmit}>
        <div className="spc-modal-head">
          <h2 id="add-space-title">{t("spaces.add.title")}</h2>
          <button type="button" aria-label={t("spaces.add.close")} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="spc-steps">
          <span className={step === "choose_type" ? "active" : ""}>{t("spaces.add.step1")}</span>
          <span className={step === "form" ? "active" : ""}>{t("spaces.add.step2")}</span>
        </div>

        {step === "choose_type" ? (
          <>
            <p className="spc-field-title">{t("spaces.add.selectType")}</p>
            <div className="spc-type-grid">
              {(["project", "study", "custom"] as SpaceType[]).map((type) => (
                <button key={type} type="button" className={draft.type === type ? "selected" : ""} aria-pressed={draft.type === type} onClick={() => onChooseType(type)}>
                  <span style={{ color: typeColor[type] }}><SpaceIcon type={type} /></span>
                  <strong>{typeLabel(t, type)}</strong>
                  <small>{typeDesc(t, type)}</small>
                </button>
              ))}
            </div>
            <div className="spc-modal-actions">
              <button type="button" className="spc-btn" onClick={onClose}>{t("spaces.add.cancel")}</button>
              <button type="button" className="spc-btn spc-btn-primary" disabled={!draft.type} onClick={onContinue}>{t("spaces.add.continue")}</button>
            </div>
          </>
        ) : (
          <>
            <SpaceFormFields draft={draft} error={error} onUpdate={onUpdate} />
            {error ? <p id="space-form-error" className="spc-form-error">{error}</p> : null}
            <div className="spc-modal-actions">
              <button type="button" className="spc-btn" onClick={onClose}>{t("spaces.add.cancel")}</button>
              <button type="button" className="spc-btn" onClick={onBack}>{t("spaces.add.back")}</button>
              <button type="submit" className="spc-btn spc-btn-primary" disabled={state === "creating"}>
                {state === "creating" ? t("spaces.add.creating") : state === "create_error" ? t("spaces.add.tryAgain") : t("spaces.add.create")}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function SpaceFormFields({ draft, error, onUpdate }: { draft: AddSpaceDraft; error: string; onUpdate: (patch: Partial<AddSpaceDraft>) => void }) {
  const { t } = useT();
  const type = draft.type ?? "project";
  return (
    <div className="spc-form">
      <label>{t("spaces.form.name")}<input value={draft.name} onChange={(event) => onUpdate({ name: event.target.value })} aria-describedby={error ? "space-form-error" : undefined} autoFocus /></label>
      {type === "project" ? (
        <>
          <label>{t("spaces.form.objective")}<input value={draft.objective} onChange={(event) => onUpdate({ objective: event.target.value })} /></label>
          <label>{t("spaces.form.deadline")}<input type="date" value={draft.deadline} onChange={(event) => onUpdate({ deadline: event.target.value })} /></label>
          <label>{t("spaces.form.milestones")}<textarea value={draft.initialMilestonesText} onChange={(event) => onUpdate({ initialMilestonesText: event.target.value })} placeholder={"Dashboard\nCalendar\nSpaces"} /></label>
          <label>{t("spaces.form.tasks")}<textarea value={draft.initialTasksText} onChange={(event) => onUpdate({ initialTasksText: event.target.value })} /></label>
        </>
      ) : null}
      {type === "study" ? (
        <>
          <label>{t("spaces.form.learningGoal")}<input value={draft.learningGoal} onChange={(event) => onUpdate({ learningGoal: event.target.value })} /></label>
          <label>{t("spaces.form.topics")}<input value={draft.initialTopicsText} onChange={(event) => onUpdate({ initialTopicsText: event.target.value })} placeholder="Array/String, Hash Map, Stack" /></label>
          <label>{t("spaces.form.trackingStyle")}<select value={draft.trackingStyle} onChange={(event) => onUpdate({ trackingStyle: event.target.value as AddSpaceDraft["trackingStyle"] })}><option value="problems">{t("spaces.form.trackProblems")}</option><option value="concepts">{t("spaces.form.trackConcepts")}</option><option value="notes">{t("spaces.form.trackNotes")}</option><option value="mixed">{t("spaces.form.trackMixed")}</option></select></label>
        </>
      ) : null}
      {type === "custom" ? (
        <label>{t("spaces.form.customSections")}<textarea value={draft.customSectionsText} onChange={(event) => onUpdate({ customSectionsText: event.target.value })} placeholder={"Notes\nTasks\nActivity"} /></label>
      ) : null}
      <label>{t("spaces.form.description")}<textarea value={draft.description} onChange={(event) => onUpdate({ description: event.target.value })} /></label>
    </div>
  );
}

function SimpleModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="spc-modal-backdrop">
      <section className="spc-modal" role="dialog" aria-modal="true" aria-labelledby="simple-modal-title">
        <div className="spc-modal-head">
          <h2 id="simple-modal-title">{title}</h2>
          <button type="button" aria-label={t("spaces.closeModal")} onClick={onClose}><CloseIcon /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function RenameSpaceModal({
  spaceName,
  value,
  error,
  onChange,
  onSubmit,
  onClose,
}: {
  spaceName: string;
  value: string;
  error: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <SimpleModal title={t("spaces.rename.title")} onClose={onClose}>
      <form
        className="spc-rename-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label>
          {t("spaces.rename.label", { name: spaceName })}
          <input value={value} onChange={(event) => onChange(event.target.value)} autoFocus />
        </label>
        {error ? <p className="spc-form-error">{error}</p> : null}
        <div className="spc-modal-actions">
          <button type="button" className="spc-btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="spc-btn spc-btn-primary">
            {t("spaces.rename.save")}
          </button>
        </div>
      </form>
    </SimpleModal>
  );
}

function deriveProjectSpaces(projects: Project[], tasks: Task[], t: TFn): Space[] {
  return projects
    .filter((project) => project.status !== "archived")
    .map((project) => {
      const projectTasks = tasks.filter((task) => task.projectId === project.id && task.status !== "archived");
      const high = projectTasks.filter((task) => task.priority === "high").length;
      const waiting = projectTasks.filter((task) => task.status === "waiting").length;
      const type = inferProjectType(project);
      const status: SpaceStatus = waiting ? "Blocked" : high ? "Needs Focus" : projectTasks.some((task) => task.status === "doing") ? "In Progress" : "On Track";
      return {
        id: `project-space-${project.id}`,
        name: project.name,
        type,
        status,
        mainSignal: waiting ? t("spaces.mainSignal.waitingBlocker") : high ? t("spaces.mainSignal.highPriority") : t("spaces.mainSignal.normal"),
        aiPriority: waiting || high > 1 ? "High" : high ? "Medium" : "Low",
        recentActivityCount: Math.max(1, projectTasks.length),
        description: project.description || t("spaces.desc.typeSpace", { type: typeLabel(t, type) }),
        color: project.color,
        updatedLabel: relativeUpdated(t, project.updatedAt),
        topics: projectTasks.flatMap((task) => task.tags).filter(Boolean).slice(0, 6),
        objective: project.description,
        sourceRef: "project",
        sourceId: project.id,
        pinned: Boolean(project.pinned),
      };
    });
}

function deriveStudySpaces(studyTopics: StudyTopic[], notes: ConceptNote[], t: TFn): Space[] {
  return studyTopics
    .filter((topic) => topic.status !== "archived")
    .map((topic) => {
      const topicNotes = notes.filter((note) => note.topicId === topic.id);
      const due = topicNotes.filter((note) => note.nextReviewDate).length;
      const type: SpaceType = "study";
      return {
        id: `study-space-${topic.id}`,
        name: topic.name,
        type,
        status: due ? "Review Needed" : "On Track",
        mainSignal: due ? t("spaces.mainSignal.reviewQueue") : t("spaces.mainSignal.organized"),
        aiPriority: due > 3 ? "High" : due ? "Medium" : "Low",
        recentActivityCount: Math.max(1, topicNotes.length),
        description: topic.description || t("spaces.desc.learningSpace", { category: topic.category }),
        color: topic.color || typeColor[type],
        updatedLabel: relativeUpdated(t, topic.updatedAt),
        topics: topicNotes.flatMap((note) => note.tags).filter(Boolean).slice(0, 6),
        learningGoal: topic.description,
        sourceRef: "study",
        sourceId: topic.id,
      };
    });
}

function deriveSignals(spaces: Space[], tasks: Task[], notes: ConceptNote[], t: TFn): ActivitySignal[] {
  const taskSignals = tasks.slice(0, 5).map((task, index): ActivitySignal => {
    const space = spaces.find((item) => item.sourceId === task.projectId) ?? spaces[index % Math.max(spaces.length, 1)];
    return {
      id: `task-signal-${task.id}`,
      title: task.title,
      detail: task.status === "waiting" ? t("spaces.signalDetail.waiting") : task.priority === "high" ? t("spaces.signalDetail.highPriorityTask") : t("spaces.signalDetail.taskActivity"),
      age: index < 2 ? t("spaces.time.minutesAgo", { n: 30 }) : t("spaces.time.hoursAgo", { n: index + 1 }),
      severity: task.priority === "high" ? "High" : task.priority === "medium" ? "Medium" : "Low",
      spaceId: space?.id ?? "space-personal-app-demo",
    };
  });
  const noteSignals = notes.slice(0, 3).map((note, index): ActivitySignal => {
    const space = spaces.find((item) => item.type === "study") ?? spaces[0];
    return {
      id: `note-signal-${note.id}`,
      title: note.title,
      detail: note.nextReviewDate ? t("spaces.signalDetail.review") : t("spaces.signalDetail.studyNote"),
      age: t("spaces.time.hoursAgo", { n: index + 2 }),
      severity: note.difficulty === "hard" ? "High" : note.difficulty === "medium" ? "Medium" : "Low",
      spaceId: space?.id ?? "space-leetcode-demo",
    };
  });
  return [...taskSignals, ...noteSignals];
}

function validateDraft(draft: AddSpaceDraft, spaces: Space[], t: TFn) {
  if (!draft.type) return t("spaces.validate.chooseType");
  if (!draft.name.trim()) return t("spaces.validate.nameRequired");
  if (draft.name.trim().length < 2) return t("spaces.validate.nameShort");
  if (spaces.some((space) => space.name.trim().toLowerCase() === draft.name.trim().toLowerCase())) return t("spaces.validate.nameDup");
  if (draft.type === "project" && !draft.objective.trim()) return t("spaces.validate.objectiveRequired");
  if (draft.type === "study" && !draft.learningGoal.trim()) return t("spaces.validate.learningRequired");
  return "";
}

function createSpaceFromDraft(draft: AddSpaceDraft, t: TFn): Space {
  const type = draft.type ?? "custom";
  const topics =
    type === "study" ? parseTags(draft.initialTopicsText)
    : type === "project" ? parseLines(draft.initialMilestonesText)
    : parseLines(draft.customSectionsText || "Notes\nTasks\nActivity");
  return {
    id: `space-${Date.now()}`,
    name: draft.name.trim(),
    type,
    status: "New",
    mainSignal: t("spaces.mainSignal.newSpace", { type: typeLabel(t, type) }),
    aiPriority: type === "custom" ? "Low" : "Medium",
    recentActivityCount: 0,
    description: draft.description.trim() || draft.objective || draft.learningGoal || t("spaces.desc.newSpace"),
    color: typeColor[type],
    updatedLabel: t("spaces.time.justNow"),
    topics,
    objective: draft.objective,
    learningGoal: draft.learningGoal,
    sourceRef: "local",
  };
}

function hasDraftContent(draft: AddSpaceDraft) {
  return Object.entries(draft).some(([key, value]) => key !== "trackingStyle" && value !== null && String(value).trim().length > 0);
}

function parseLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function parseTags(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

function inferProjectType(project: Project): SpaceType {
  const text = `${project.name} ${project.description}`.toLowerCase();
  if (text.includes("study") || text.includes("leetcode") || text.includes("python")) return "study";
  return "project";
}

function relativeUpdated(t: TFn, value: string) {
  if (!value) return t("spaces.time.recently");
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return t("spaces.time.recently");
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return t("spaces.time.minutesAgo", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("spaces.time.hoursAgo", { n: hours });
  return t("spaces.time.daysAgo", { n: Math.round(hours / 24) });
}

function relativeLabel(t: TFn, minutes: number, hours: number, days: number) {
  if (days > 0) return t("spaces.time.daysAgo", { n: days });
  if (hours > 0) return t("spaces.time.hoursAgo", { n: hours });
  return t("spaces.time.minutesAgo", { n: minutes });
}

function statusClass(status: SpaceStatus) {
  if (status === "Blocked") return "blocked";
  if (status === "Review Needed" || status === "Needs Focus") return "focus";
  if (status === "On Track") return "track";
  return "progress";
}

function SpaceIcon({ type }: { type: SpaceType }) {
  if (type === "study") return <CodeIcon />;
  if (type === "custom") return <SlidersIcon />;
  return <ScreenIcon />;
}

function SearchIcon() { return <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></svg>; }
function SparkIcon() { return <svg viewBox="0 0 24 24"><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" /></svg>; }
function InfoIcon() { return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>; }
function SignalIcon() { return <svg viewBox="0 0 24 24"><path d="M4 14h3l2-6 4 12 2-6h5" /></svg>; }
function RefreshIcon() { return <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 11-2.3-5.7" /><path d="M20 4v6h-6" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>; }
function ArrowIcon() { return <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>; }
function MoreIcon() { return <svg viewBox="0 0 24 24"><path d="M12 6h.01M12 12h.01M12 18h.01" /></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>; }
function ScreenIcon() { return <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></svg>; }
function CodeIcon() { return <svg viewBox="0 0 24 24"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>; }
function SlidersIcon() { return <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /><path d="M8 6v.01M14 12v.01M11 18v.01" /></svg>; }
