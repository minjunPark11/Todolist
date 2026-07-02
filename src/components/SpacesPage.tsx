import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import type { ConceptNote, Project, ProjectType, StudyTopic, Subtask, Task, TaskDraft } from "../types";
import type { ToastState } from "./kit";

type SpaceType = "project" | "study" | "research" | "custom";
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
  objective?: string;
  learningGoal?: string;
  researchGoal?: string;
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
  researchGoal: string;
  researchQuestionsText: string;
  sourceTypesText: string;
  customSectionsText: string;
};

type SpacesPageProps = {
  projects: Project[];
  tasks: Task[];
  subtasks: Subtask[];
  studyTopics: StudyTopic[];
  conceptNotes: ConceptNote[];
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
  onCreateProject: (input: { name: string; color?: string; type?: ProjectType; description?: string; dueDate?: string }) => string;
  onUpdateProject: (id: string, patch: Partial<Project>) => void;
  onToggleStar: (id: string) => void;
  onArchiveProject: (id: string) => void;
  onRequestDeleteProject: (id: string) => void;
  onSaveNotes: (id: string, value: string) => void;
  showToast: (toast: ToastState) => void;
};

const typeMeta: Record<SpaceType, { label: string; description: string; color: string }> = {
  project: { label: "Project", description: "Outcomes, tasks, milestones, blockers, and decisions.", color: "#7c3aed" },
  study: { label: "Study", description: "Topics, weak points, reviews, mistakes, and notes.", color: "#2563eb" },
  research: { label: "Research", description: "Questions, sources, claims, evidence, and drafts.", color: "#16a34a" },
  custom: { label: "Custom", description: "A flexible space with your own sections.", color: "#f97316" },
};

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
  researchGoal: "",
  researchQuestionsText: "",
  sourceTypesText: "",
  customSectionsText: "",
};

export function SpacesPage({
  projects,
  tasks,
  studyTopics,
  conceptNotes,
  selectedProjectId,
  detailOpen,
  onOpenProject,
  onCloseProject,
  onCreateProject,
  showToast,
}: SpacesPageProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [localSpaces, setLocalSpaces] = useState<Space[]>(seedSpaces);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [highlightSignalId, setHighlightSignalId] = useState("");
  const [analysisState, setAnalysisState] = useState<"empty" | "loading" | "success" | "insufficient" | "error">("empty");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [signalsOpen, setSignalsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>("choose_type");
  const [addState, setAddState] = useState<AddState>("choose_type_idle");
  const [draft, setDraft] = useState<AddSpaceDraft>(emptyDraft);
  const [formError, setFormError] = useState("");

  const spaces = useMemo(
    () => [...deriveProjectSpaces(projects, tasks), ...deriveStudySpaces(studyTopics, conceptNotes), ...localSpaces],
    [conceptNotes, localSpaces, projects, studyTopics, tasks],
  );
  const signals = useMemo(() => deriveSignals(spaces, tasks, conceptNotes), [conceptNotes, spaces, tasks]);
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces.find((space) => space.sourceId === selectedProjectId);
  const isDetailOpen = Boolean(selectedSpace) && (detailOpen || selectedSpaceId);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleSpaces = spaces.filter((space) => {
    if (filter !== "all" && space.type !== filter) return false;
    if (!normalizedQuery) return true;
    const signalText = signals.filter((signal) => signal.spaceId === space.id).map((signal) => signal.title).join(" ");
    return [space.name, space.type, space.description, space.status, space.mainSignal, space.aiPriority, space.topics.join(" "), signalText]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && addOpen) {
        tryCloseAdd();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addOpen, draft]);

  function openSpace(space: Space, signalId = "") {
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

  function analyzeSpaces() {
    if (spaces.length < 2 || signals.length < 2) {
      setAnalysisState("insufficient");
      return;
    }
    setAnalysisState("loading");
    window.setTimeout(() => setAnalysisState("success"), 650);
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
    const error = validateDraft(draft, spaces);
    if (error) {
      setFormError(error);
      setAddState("form_validation_error");
      return;
    }

    setAddState("creating");
    window.setTimeout(() => {
      try {
        const space = createSpaceFromDraft(draft);
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
        showToast({ message: `${nextSpace.name} created.` });
        resetAdd();
      } catch {
        setFormError("Could not create Space. Your input was not lost.");
        setAddState("create_error");
      }
    }, 520);
  }

  if (isDetailOpen && selectedSpace) {
    return (
      <SpaceDetail
        space={selectedSpace}
        signals={signals.filter((signal) => signal.spaceId === selectedSpace.id)}
        tasks={tasks.filter((task) => task.projectId === selectedSpace.sourceId)}
        notes={conceptNotes.filter((note) => selectedSpace.topics.some((topic) => note.tags.includes(topic)))}
        highlightSignalId={highlightSignalId}
        onBack={closeSpace}
      />
    );
  }

  return (
    <div className="spc-page">
      <header className="spc-header">
        <div>
          <h1>Spaces</h1>
          <p>Projects, study areas, and research in one place.</p>
        </div>
        <label className="spc-search">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search spaces, signals, or topics..."
            aria-label="Search spaces, signals, or topics"
          />
        </label>
      </header>

      <section className={analysisState === "success" ? "spc-brief analyzed" : "spc-brief"}>
        <div className="spc-brief-icon"><SparkIcon /></div>
        <div className="spc-brief-copy">
          <h2>AI Overall Brief</h2>
          {analysisState === "empty" ? (
            <>
              <strong>No AI analysis yet</strong>
              <p>Run analysis when you want a focus recommendation based on recent signals.</p>
            </>
          ) : analysisState === "loading" ? (
            <>
              <strong>Analyzing spaces...</strong>
              <p>Checking recent records, repeated signals, urgency, and blocked work.</p>
            </>
          ) : analysisState === "insufficient" ? (
            <>
              <strong>Not enough signals yet</strong>
              <p>Add more tasks, notes, or records before analysis can recommend a focus.</p>
            </>
          ) : (
            <>
              <strong>Recommended focus: <span>LeetCode</span> and <span>Personal App</span></strong>
              <p>LeetCode needs attention because Binary Search boundary mistakes are repeating. Personal App is blocked by a Calendar UX issue.</p>
            </>
          )}
        </div>
        <div className="spc-brief-actions">
          {analysisState === "success" ? <span>Last analyzed: Today, 10:24 AM</span> : null}
          <button type="button" className="spc-btn spc-btn-soft" onClick={() => setReasonOpen(true)} disabled={analysisState !== "success"}>
            <InfoIcon /> Why this?
          </button>
          <button type="button" className="spc-btn spc-btn-primary" onClick={() => setSignalsOpen(true)} disabled={analysisState !== "success"}>
            <SignalIcon /> View signals
          </button>
          <button type="button" className="spc-btn" onClick={analyzeSpaces} disabled={analysisState === "loading"}>
            <RefreshIcon /> {analysisState === "success" ? "Refresh Analysis" : "Analyze Spaces"}
          </button>
        </div>
      </section>

      <section className="spc-filter-bar" aria-label="Space type filters">
        {(["all", "project", "study", "research", "custom"] as FilterType[]).map((item) => (
          <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
            {item === "all" ? "All" : typeMeta[item].label}
          </button>
        ))}
      </section>

      <section className="spc-grid" aria-label="Space cards">
        {visibleSpaces.map((space) => <SpaceCard key={space.id} space={space} onOpen={() => openSpace(space)} />)}
        <button type="button" className="spc-add-card" onClick={() => setAddOpen(true)}>
          <span><PlusIcon /></span>
          <strong>Add Space</strong>
          <small>Create a new project, study area, or research space.</small>
        </button>
      </section>

      <section className="spc-activity">
        <div className="spc-section-head">
          <div>
            <h2>Recent Activity Signals</h2>
            <p>Recent records mapped to spaces</p>
          </div>
          <button type="button" onClick={() => setSignalsOpen(true)}>View all signals <ArrowIcon /></button>
        </div>
        <div className="spc-signal-list">
          {signals.slice(0, 6).map((signal) => {
            const space = spaces.find((item) => item.id === signal.spaceId);
            if (!space) return null;
            return (
              <button key={signal.id} type="button" className="spc-signal-row" onClick={() => openSpace(space, signal.id)}>
                <span className={`spc-signal-severity ${signal.severity.toLowerCase()}`}>{signal.severity}</span>
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
        <SimpleModal title="Why this?" onClose={() => setReasonOpen(false)}>
          <ul className="spc-reason-list">
            <li>High urgency signals are clustered around LeetCode and Personal App.</li>
            <li>Repeated Binary Search mistakes suggest review should happen soon.</li>
            <li>Calendar UX work is blocking the main app experience.</li>
          </ul>
        </SimpleModal>
      ) : null}

      {signalsOpen ? (
        <SimpleModal title="Signals used for analysis" onClose={() => setSignalsOpen(false)}>
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
    </div>
  );
}

function SpaceCard({ space, onOpen }: { space: Space; onOpen: () => void }) {
  return (
    <article className="spc-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
      <div className="spc-card-top">
        <span className="spc-card-icon" style={{ background: space.color }}><SpaceIcon type={space.type} /></span>
        <button type="button" aria-label={`Open ${space.name} menu`} onClick={(event) => event.stopPropagation()}><MoreIcon /></button>
      </div>
      <strong>{space.name}</strong>
      <span className="spc-type" style={{ color: typeMeta[space.type].color }}>{typeMeta[space.type].label}</span>
      <p>{space.description}</p>
      <div className="spc-card-badges">
        <span className={`spc-status ${statusClass(space.status)}`}>{space.status}</span>
        <span>{space.recentActivityCount} signals</span>
      </div>
      <small>Main Signal: {space.mainSignal}</small>
      <small>AI Priority: <i className={space.aiPriority.toLowerCase()} /> {space.aiPriority}</small>
      <footer><span>Updated {space.updatedLabel}</span><ArrowIcon /></footer>
    </article>
  );
}

function SpaceDetail({
  space,
  signals,
  tasks,
  notes,
  highlightSignalId,
  onBack,
}: {
  space: Space;
  signals: ActivitySignal[];
  tasks: Task[];
  notes: ConceptNote[];
  highlightSignalId: string;
  onBack: () => void;
}) {
  return (
    <div className="spc-detail">
      <button type="button" className="spc-back" onClick={onBack}><ArrowLeftIcon /> Back to Spaces</button>
      <header className="spc-detail-hero">
        <span className="spc-card-icon" style={{ background: space.color }}><SpaceIcon type={space.type} /></span>
        <div>
          <h1>{space.name}</h1>
          <p>{typeMeta[space.type].label} Space - {space.description || space.mainSignal}</p>
        </div>
        <span className={`spc-status ${statusClass(space.status)}`}>{space.status}</span>
      </header>

      <section className="spc-detail-grid">
        <div className="spc-detail-card">
          <h2>{detailTitle(space.type)}</h2>
          <p>{detailBody(space)}</p>
          <div className="spc-topic-list">
            {(space.topics.length ? space.topics : ["Next step", "Signal", "Review"]).map((topic) => <span key={topic}>{topic}</span>)}
          </div>
        </div>
        <div className="spc-detail-card">
          <h2>Current Signal</h2>
          <strong>{space.mainSignal}</strong>
          <p>AI Priority: {space.aiPriority}. Recent activity count: {space.recentActivityCount}.</p>
        </div>
        <div className="spc-detail-card">
          <h2>{space.type === "study" ? "Review Queue" : space.type === "research" ? "Evidence Trail" : "Work Records"}</h2>
          <div className="spc-mini-list">
            {space.type === "study"
              ? notes.slice(0, 4).map((note) => <span key={note.id}>{note.title}</span>)
              : tasks.slice(0, 5).map((task) => <span key={task.id}>{task.title}</span>)}
            {(space.type === "study" ? notes.length : tasks.length) === 0 ? <p>No records yet. Add the first item to start using this Space.</p> : null}
          </div>
        </div>
      </section>

      <section className="spc-activity">
        <div className="spc-section-head">
          <div>
            <h2>Recent Activity Signals</h2>
            <p>Signals connected to this Space</p>
          </div>
        </div>
        <div className="spc-signal-list">
          {signals.map((signal) => (
            <div key={signal.id} className={highlightSignalId === signal.id ? "spc-signal-row highlighted" : "spc-signal-row"}>
              <span className={`spc-signal-severity ${signal.severity.toLowerCase()}`}>{signal.severity}</span>
              <span>{signal.age}</span>
              <strong>{signal.title}</strong>
              <em>{signal.detail}</em>
            </div>
          ))}
          {signals.length === 0 ? <p className="spc-empty">No signals yet.</p> : null}
        </div>
      </section>
    </div>
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
  if (state === "discard_confirm") {
    return (
      <div className="spc-modal-backdrop">
        <section className="spc-modal spc-confirm" role="dialog" aria-modal="true" aria-labelledby="discard-title">
          <h2 id="discard-title">Discard changes?</h2>
          <p>You have unsaved space setup details. If you discard, your current input will be lost.</p>
          <div className="spc-modal-actions">
            <button type="button" className="spc-btn" onClick={onKeepEditing}>Keep editing</button>
            <button type="button" className="spc-btn spc-btn-danger" onClick={onDiscard}>Discard</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="spc-modal-backdrop">
      <form className="spc-modal" role="dialog" aria-modal="true" aria-labelledby="add-space-title" onSubmit={onSubmit}>
        <div className="spc-modal-head">
          <h2 id="add-space-title">Add Space</h2>
          <button type="button" aria-label="Close add space modal" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="spc-steps">
          <span className={step === "choose_type" ? "active" : ""}>1. Choose Type</span>
          <span className={step === "form" ? "active" : ""}>2. Setup Details</span>
        </div>

        {step === "choose_type" ? (
          <>
            <p className="spc-field-title">Select Space Type</p>
            <div className="spc-type-grid">
              {(["project", "study", "research", "custom"] as SpaceType[]).map((type) => (
                <button key={type} type="button" className={draft.type === type ? "selected" : ""} aria-pressed={draft.type === type} onClick={() => onChooseType(type)}>
                  <span style={{ color: typeMeta[type].color }}><SpaceIcon type={type} /></span>
                  <strong>{typeMeta[type].label}</strong>
                  <small>{typeMeta[type].description}</small>
                </button>
              ))}
            </div>
            <div className="spc-modal-actions">
              <button type="button" className="spc-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="spc-btn spc-btn-primary" disabled={!draft.type} onClick={onContinue}>Continue</button>
            </div>
          </>
        ) : (
          <>
            <SpaceFormFields draft={draft} error={error} onUpdate={onUpdate} />
            {error ? <p id="space-form-error" className="spc-form-error">{error}</p> : null}
            <div className="spc-modal-actions">
              <button type="button" className="spc-btn" onClick={onClose}>Cancel</button>
              <button type="button" className="spc-btn" onClick={onBack}>Back</button>
              <button type="submit" className="spc-btn spc-btn-primary" disabled={state === "creating"}>
                {state === "creating" ? "Creating..." : state === "create_error" ? "Try again" : "Create Space"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function SpaceFormFields({ draft, error, onUpdate }: { draft: AddSpaceDraft; error: string; onUpdate: (patch: Partial<AddSpaceDraft>) => void }) {
  const type = draft.type ?? "project";
  return (
    <div className="spc-form">
      <label>Space Name<input value={draft.name} onChange={(event) => onUpdate({ name: event.target.value })} aria-describedby={error ? "space-form-error" : undefined} autoFocus /></label>
      {type === "project" ? (
        <>
          <label>Objective<input value={draft.objective} onChange={(event) => onUpdate({ objective: event.target.value })} /></label>
          <label>Deadline<input type="date" value={draft.deadline} onChange={(event) => onUpdate({ deadline: event.target.value })} /></label>
          <label>Initial Milestones<textarea value={draft.initialMilestonesText} onChange={(event) => onUpdate({ initialMilestonesText: event.target.value })} placeholder={"Dashboard\nCalendar\nSpaces"} /></label>
          <label>Initial Tasks<textarea value={draft.initialTasksText} onChange={(event) => onUpdate({ initialTasksText: event.target.value })} /></label>
        </>
      ) : null}
      {type === "study" ? (
        <>
          <label>Learning Goal<input value={draft.learningGoal} onChange={(event) => onUpdate({ learningGoal: event.target.value })} /></label>
          <label>Initial Topics<input value={draft.initialTopicsText} onChange={(event) => onUpdate({ initialTopicsText: event.target.value })} placeholder="Array/String, Hash Map, Stack" /></label>
          <label>Tracking Style<select value={draft.trackingStyle} onChange={(event) => onUpdate({ trackingStyle: event.target.value as AddSpaceDraft["trackingStyle"] })}><option value="problems">Problems</option><option value="concepts">Concepts</option><option value="notes">Notes</option><option value="mixed">Mixed</option></select></label>
        </>
      ) : null}
      {type === "research" ? (
        <>
          <label>Research Goal<input value={draft.researchGoal} onChange={(event) => onUpdate({ researchGoal: event.target.value })} /></label>
          <label>Research Questions<textarea value={draft.researchQuestionsText} onChange={(event) => onUpdate({ researchQuestionsText: event.target.value })} /></label>
          <label>Source Types<input value={draft.sourceTypesText} onChange={(event) => onUpdate({ sourceTypesText: event.target.value })} placeholder="papers, notes, experiments" /></label>
        </>
      ) : null}
      {type === "custom" ? (
        <label>Custom Sections<textarea value={draft.customSectionsText} onChange={(event) => onUpdate({ customSectionsText: event.target.value })} placeholder={"Notes\nTasks\nActivity"} /></label>
      ) : null}
      <label>Description<textarea value={draft.description} onChange={(event) => onUpdate({ description: event.target.value })} /></label>
    </div>
  );
}

function SimpleModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="spc-modal-backdrop">
      <section className="spc-modal" role="dialog" aria-modal="true" aria-labelledby="simple-modal-title">
        <div className="spc-modal-head">
          <h2 id="simple-modal-title">{title}</h2>
          <button type="button" aria-label="Close modal" onClick={onClose}><CloseIcon /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function deriveProjectSpaces(projects: Project[], tasks: Task[]): Space[] {
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
        mainSignal: waiting ? "Waiting blocker" : high ? "High priority work" : "Work moving normally",
        aiPriority: waiting || high > 1 ? "High" : high ? "Medium" : "Low",
        recentActivityCount: Math.max(1, projectTasks.length),
        description: project.description || `${typeMeta[type].label} space`,
        color: project.color,
        updatedLabel: relativeUpdated(project.updatedAt),
        topics: projectTasks.flatMap((task) => task.tags).filter(Boolean).slice(0, 6),
        objective: project.description,
        sourceRef: "project",
        sourceId: project.id,
      };
    });
}

function deriveStudySpaces(studyTopics: StudyTopic[], notes: ConceptNote[]): Space[] {
  return studyTopics
    .filter((topic) => topic.status !== "archived")
    .map((topic) => {
      const topicNotes = notes.filter((note) => note.topicId === topic.id);
      const due = topicNotes.filter((note) => note.nextReviewDate).length;
      const type: SpaceType = topic.category === "Research" || topic.category === "fNIRS" ? "research" : "study";
      return {
        id: `study-space-${topic.id}`,
        name: topic.name,
        type,
        status: due ? "Review Needed" : "On Track",
        mainSignal: due ? "Review queue needs attention" : "Concepts are organized",
        aiPriority: due > 3 ? "High" : due ? "Medium" : "Low",
        recentActivityCount: Math.max(1, topicNotes.length),
        description: topic.description || `${topic.category} learning space`,
        color: topic.color || typeMeta[type].color,
        updatedLabel: relativeUpdated(topic.updatedAt),
        topics: topicNotes.flatMap((note) => note.tags).filter(Boolean).slice(0, 6),
        learningGoal: topic.description,
        sourceRef: "study",
        sourceId: topic.id,
      };
    });
}

function seedSpaces(): Space[] {
  return [
    { id: "space-personal-app-demo", name: "Personal App", type: "project", status: "Blocked", mainSignal: "Calendar UX blocker", aiPriority: "Medium", recentActivityCount: 5, description: "Personal productivity app development project", color: "#7c3aed", updatedLabel: "1h ago", topics: ["Calendar", "UX", "AI"], sourceRef: "local" },
    { id: "space-leetcode-demo", name: "LeetCode", type: "study", status: "Review Needed", mainSignal: "Binary Search boundary", aiPriority: "High", recentActivityCount: 8, description: "Algorithm patterns and mistake review", color: "#2563eb", updatedLabel: "30m ago", topics: ["Binary Search", "Hash Map", "Stack"], sourceRef: "local" },
    { id: "space-fyp-demo", name: "FYP Research", type: "research", status: "Needs Focus", mainSignal: "notes need organization", aiPriority: "Low", recentActivityCount: 3, description: "Graduation research project", color: "#16a34a", updatedLabel: "3h ago", topics: ["fNIRS", "methods", "evidence"], sourceRef: "local" },
    { id: "space-conference-demo", name: "Conference PPT", type: "project", status: "In Progress", mainSignal: "structure refinement", aiPriority: "Low", recentActivityCount: 2, description: "Academic presentation deck", color: "#f97316", updatedLabel: "1d ago", topics: ["slides", "script"], sourceRef: "local" },
  ];
}

function deriveSignals(spaces: Space[], tasks: Task[], notes: ConceptNote[]): ActivitySignal[] {
  const base: ActivitySignal[] = [
    { id: "signal-calendar", title: "Calendar UX decision is delayed", detail: "Progress blocked", age: "10m ago", severity: "Medium", spaceId: "space-personal-app-demo" },
    { id: "signal-binary", title: "Binary Search boundary mistakes repeating", detail: "Mistake pattern detected", age: "35m ago", severity: "High", spaceId: "space-leetcode-demo" },
    { id: "signal-list", title: "Reviewed list methods: append, extend, pop", detail: "Review completed", age: "1h ago", severity: "Low", spaceId: "space-leetcode-demo" },
    { id: "signal-methods", title: "Related paper methods need comparison", detail: "More evidence needed", age: "2h ago", severity: "Medium", spaceId: "space-fyp-demo" },
    { id: "signal-slides", title: "Updated slide structure for methodology section", detail: "Draft progress", age: "3h ago", severity: "Low", spaceId: "space-conference-demo" },
  ];
  const taskSignals = tasks.slice(0, 5).map((task, index): ActivitySignal => {
    const space = spaces.find((item) => item.sourceId === task.projectId) ?? spaces[index % Math.max(spaces.length, 1)];
    return {
      id: `task-signal-${task.id}`,
      title: task.title,
      detail: task.status === "waiting" ? "Waiting signal" : task.priority === "high" ? "High priority task" : "Task activity",
      age: index < 2 ? "30m ago" : `${index + 1}h ago`,
      severity: task.priority === "high" ? "High" : task.priority === "medium" ? "Medium" : "Low",
      spaceId: space?.id ?? "space-personal-app-demo",
    };
  });
  const noteSignals = notes.slice(0, 3).map((note, index): ActivitySignal => {
    const space = spaces.find((item) => item.type === "study") ?? spaces[0];
    return {
      id: `note-signal-${note.id}`,
      title: note.title,
      detail: note.nextReviewDate ? "Review signal" : "Study note",
      age: `${index + 2}h ago`,
      severity: note.difficulty === "hard" ? "High" : note.difficulty === "medium" ? "Medium" : "Low",
      spaceId: space?.id ?? "space-leetcode-demo",
    };
  });
  return [...base, ...taskSignals, ...noteSignals];
}

function validateDraft(draft: AddSpaceDraft, spaces: Space[]) {
  if (!draft.type) return "Choose a Space type first.";
  if (!draft.name.trim()) return "Space name is required.";
  if (draft.name.trim().length < 2) return "Name is too short.";
  if (spaces.some((space) => space.name.trim().toLowerCase() === draft.name.trim().toLowerCase())) return "A Space with this name already exists.";
  if (draft.type === "project" && !draft.objective.trim()) return "Project objective is required.";
  if (draft.type === "study" && !draft.learningGoal.trim()) return "Learning goal is required.";
  if (draft.type === "research" && !draft.researchGoal.trim()) return "Research goal is required.";
  return "";
}

function createSpaceFromDraft(draft: AddSpaceDraft): Space {
  const type = draft.type ?? "custom";
  const topics =
    type === "study" ? parseTags(draft.initialTopicsText)
    : type === "project" ? parseLines(draft.initialMilestonesText)
    : type === "research" ? parseLines(draft.researchQuestionsText)
    : parseLines(draft.customSectionsText || "Notes\nTasks\nActivity");
  return {
    id: `space-${Date.now()}`,
    name: draft.name.trim(),
    type,
    status: "New",
    mainSignal: `New ${typeMeta[type].label.toLowerCase()} space`,
    aiPriority: type === "custom" ? "Low" : "Medium",
    recentActivityCount: 0,
    description: draft.description.trim() || draft.objective || draft.learningGoal || draft.researchGoal || "New space",
    color: typeMeta[type].color,
    updatedLabel: "just now",
    topics,
    objective: draft.objective,
    learningGoal: draft.learningGoal,
    researchGoal: draft.researchGoal,
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
  if (text.includes("research") || text.includes("thesis") || text.includes("fnirs")) return "research";
  if (text.includes("study") || text.includes("leetcode") || text.includes("python")) return "study";
  return "project";
}

function relativeUpdated(value: string) {
  if (!value) return "recently";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "recently";
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusClass(status: SpaceStatus) {
  if (status === "Blocked") return "blocked";
  if (status === "Review Needed" || status === "Needs Focus") return "focus";
  if (status === "On Track") return "track";
  return "progress";
}

function detailTitle(type: SpaceType) {
  if (type === "study") return "Topic Map";
  if (type === "research") return "Research Direction";
  if (type === "custom") return "Custom Sections";
  return "Project Direction";
}

function detailBody(space: Space) {
  if (space.type === "study") return space.learningGoal || "Track weak points, review needs, evidence, and recent learning records.";
  if (space.type === "research") return space.researchGoal || "Organize research questions, sources, claims, and open evidence.";
  if (space.type === "custom") return "Use flexible sections to gather notes, tasks, and activity.";
  return space.objective || "Track the current outcome, blockers, milestones, and next work.";
}

function SpaceIcon({ type }: { type: SpaceType }) {
  if (type === "study") return <CodeIcon />;
  if (type === "research") return <BookIcon />;
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
function ArrowLeftIcon() { return <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>; }
function MoreIcon() { return <svg viewBox="0 0 24 24"><path d="M12 6h.01M12 12h.01M12 18h.01" /></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>; }
function ScreenIcon() { return <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></svg>; }
function CodeIcon() { return <svg viewBox="0 0 24 24"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></svg>; }
function BookIcon() { return <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5z" /></svg>; }
function SlidersIcon() { return <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /><path d="M8 6v.01M14 12v.01M11 18v.01" /></svg>; }
