import { useMemo, useState } from "react";
import type {
  ConceptNote,
  NoteDifficulty,
  NoteType,
  ReviewDifficulty,
  StudyTopic,
  StudyTopicCategory,
} from "../types";
import { formatDate, todayValue } from "../utils/date";
import { getComputedReviewStatus, getStudyReviewQueue } from "../utils/planner";
import { EmptyState, Modal, MoreMenu, SegmentedTabs, ToastState, useAutoFocus } from "./kit";

type StudyTab = "topics" | "notes" | "reviews";

const CATEGORIES: StudyTopicCategory[] = ["Python", "LeetCode", "Research", "fNIRS", "English", "Presentation", "Other"];
const NOTE_TYPES: NoteType[] = ["concept", "leetcode", "research", "english", "presentation", "other"];
const TOPIC_COLORS = ["#007aff", "#af52de", "#34c759", "#ff9500", "#ff2d55", "#8e8e93"];

interface StudyPageProps {
  topics: StudyTopic[];
  notes: ConceptNote[];
  tab: StudyTab;
  onChangeTab: (tab: StudyTab) => void;
  onCreateTopic: (input: { name: string; category?: StudyTopicCategory; description?: string; color?: string }) => string;
  onDeleteTopic: (id: string) => void;
  onCreateNote: (input: Partial<ConceptNote> & { title: string; topicId: string }) => string;
  onUpdateNote: (id: string, patch: Partial<ConceptNote>) => void;
  onDeleteNote: (id: string) => void;
  onMarkReviewed: (id: string, difficulty: ReviewDifficulty) => void;
  showToast: (toast: ToastState) => void;
}

export function StudyPage(props: StudyPageProps) {
  const { topics, notes, tab, onChangeTab } = props;
  const today = todayValue();
  const [topicModal, setTopicModal] = useState(false);
  const [noteEditor, setNoteEditor] = useState<{ mode: "create" | "edit"; note?: ConceptNote } | null>(null);
  const [openNote, setOpenNote] = useState<ConceptNote | null>(null);
  const [topicFilter, setTopicFilter] = useState<string>("all");

  const queue = useMemo(() => getStudyReviewQueue(notes, today), [notes, today]);
  const dueCount = queue.due.length;
  const streak = useMemo(() => computeStreak(notes), [notes]);

  const visibleNotes = topicFilter === "all" ? notes : notes.filter((n) => n.topicId === topicFilter);
  const topicName = (id: string) => topics.find((t) => t.id === id)?.name ?? "No topic";
  const topicColor = (id: string) => topics.find((t) => t.id === id)?.color ?? "#8e8e93";

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">Study</h1>
          <p className="ff-page-sub">Track topics, concept notes, and spaced reviews.</p>
        </div>
        <div className="ff-page-actions">
          {dueCount > 0 ? (
            <button type="button" className="ff-badge ff-badge-danger" onClick={() => onChangeTab("reviews")}>
              {dueCount} due reviews
            </button>
          ) : null}
          <button type="button" className="ff-btn" onClick={() => setTopicModal(true)}>+ New Topic</button>
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => setNoteEditor({ mode: "create" })}>+ New Note</button>
        </div>
      </header>

      <SegmentedTabs
        tabs={[["topics", "Topics"], ["notes", "Notes"], ["reviews", "Reviews"]]}
        active={tab}
        onChange={onChangeTab}
      />

      {tab === "topics" ? (
        <>
          <div className="ff-study-metrics">
            <MetricCard label="Total Topics" value={topics.length} tone="accent" onClick={() => onChangeTab("topics")} />
            <MetricCard label="Concept Notes" value={notes.length} tone="purple" onClick={() => onChangeTab("notes")} />
            <MetricCard label="Due Reviews" value={dueCount} tone="danger" onClick={() => onChangeTab("reviews")} />
            <MetricCard label="Study Streak" value={`${streak} day${streak === 1 ? "" : "s"}`} tone="success" />
          </div>
          {topics.length === 0 ? (
            <EmptyState icon="📚" title="No topics yet" text="Create a topic to start organizing your study notes." actionLabel="New Topic" onAction={() => setTopicModal(true)} />
          ) : (
            <div className="ff-topic-grid">
              {topics.map((topic) => {
                const topicNotes = notes.filter((n) => n.topicId === topic.id);
                const due = topicNotes.filter((n) => getComputedReviewStatus(n, today) === "due").length;
                return (
                  <article
                    key={topic.id}
                    className="ff-topic-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => { setTopicFilter(topic.id); onChangeTab("notes"); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { setTopicFilter(topic.id); onChangeTab("notes"); } }}
                  >
                    <div className="ff-topic-card-top">
                      <span className="ff-topic-dot" style={{ background: topic.color }} />
                      <strong>{topic.name}</strong>
                      <MoreMenu items={[{ label: "Delete topic", danger: true, onClick: () => props.onDeleteTopic(topic.id) }]} />
                    </div>
                    <small className="ff-topic-cat">{topic.category}</small>
                    {topic.description ? <p>{topic.description}</p> : null}
                    <div className="ff-topic-foot">
                      <span>{topicNotes.length} notes</span>
                      {due > 0 ? <span className="ff-badge ff-badge-danger">{due} due</span> : <span className="ff-topic-ok">Up to date</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {tab === "notes" ? (
        <>
          <div className="ff-tasks-filterbar">
            <select className="ff-topic-select" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
              <option value="all">All Topics</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {visibleNotes.length === 0 ? (
            <EmptyState icon="📝" title="No notes yet" text="Capture a concept, example, and your own explanation." actionLabel="New Note" onAction={() => setNoteEditor({ mode: "create" })} />
          ) : (
            <div className="ff-note-grid">
              {visibleNotes.map((note) => {
                const status = getComputedReviewStatus(note, today);
                return (
                  <article
                    key={note.id}
                    className="ff-note-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenNote(note)}
                    onKeyDown={(e) => { if (e.key === "Enter") setOpenNote(note); }}
                  >
                    <div className="ff-note-card-top">
                      <strong>{note.title}</strong>
                      <MoreMenu
                        items={[
                          { label: "Edit", onClick: () => setNoteEditor({ mode: "edit", note }) },
                          { label: "Mark as mastered", onClick: () => props.onMarkReviewed(note.id, "mastered") },
                          { separator: true },
                          { label: "Delete", danger: true, onClick: () => props.onDeleteNote(note.id) },
                        ]}
                      />
                    </div>
                    {note.summary ? <p>{note.summary}</p> : null}
                    <div className="ff-note-card-foot">
                      <span className="ff-projbadge"><span className="ff-dot" style={{ background: topicColor(note.topicId) }} />{topicName(note.topicId)}</span>
                      <span className={`ff-badge ff-badge-${difficultyTone(note.difficulty)}`}>{note.difficulty}</span>
                      <ReviewStatusBadge status={status} note={note} />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {tab === "reviews" ? (
        <div className="ff-review-stack">
          <ReviewSection title="Due" tone="danger" notes={queue.due} topicName={topicName} onReview={props.onMarkReviewed} onOpen={setOpenNote} showActions />
          <ReviewSection title="Upcoming" tone="accent" notes={queue.upcoming} topicName={topicName} onReview={props.onMarkReviewed} onOpen={setOpenNote} />
          <ReviewSection title="Mastered" tone="success" notes={queue.mastered} topicName={topicName} onReview={props.onMarkReviewed} onOpen={setOpenNote} />
          {queue.due.length === 0 && queue.upcoming.length === 0 && queue.mastered.length === 0 ? (
            <EmptyState icon="✅" title="No reviews scheduled" text="Add notes and schedule reviews to build your spaced-repetition queue." />
          ) : null}
        </div>
      ) : null}

      {topicModal ? (
        <TopicModal
          onClose={() => setTopicModal(false)}
          onCreate={(values) => {
            props.onCreateTopic(values);
            setTopicModal(false);
            props.showToast({ message: "Topic created" });
          }}
        />
      ) : null}

      {noteEditor ? (
        <NoteEditor
          topics={topics}
          mode={noteEditor.mode}
          note={noteEditor.note}
          onClose={() => setNoteEditor(null)}
          onSave={(values, id) => {
            if (id) {
              props.onUpdateNote(id, values);
            } else {
              props.onCreateNote(values as Partial<ConceptNote> & { title: string; topicId: string });
            }
            setNoteEditor(null);
            props.showToast({ message: "Note saved" });
          }}
        />
      ) : null}

      {openNote ? (
        <NoteDetail
          note={openNote}
          topicName={topicName(openNote.topicId)}
          onClose={() => setOpenNote(null)}
          onEdit={() => { setNoteEditor({ mode: "edit", note: openNote }); setOpenNote(null); }}
          onReview={(diff) => { props.onMarkReviewed(openNote.id, diff); setOpenNote(null); }}
        />
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, tone, onClick }: { label: string; value: number | string; tone: string; onClick?: () => void }) {
  return (
    <button type="button" className={`ff-metric ff-tone-${tone}`} onClick={onClick} disabled={!onClick}>
      <span className="ff-metric-label">{label}</span>
      <strong className="ff-metric-value">{value}</strong>
    </button>
  );
}

function ReviewStatusBadge({ status, note }: { status: string; note: ConceptNote }) {
  if (status === "due") return <span className="ff-badge ff-badge-danger">Due</span>;
  if (status === "upcoming") return <span className="ff-badge ff-badge-accent">{formatDate(note.nextReviewDate)}</span>;
  if (status === "mastered") return <span className="ff-badge ff-badge-success">Mastered</span>;
  return <span className="ff-badge ff-badge-muted">Not scheduled</span>;
}

function ReviewSection({
  title,
  tone,
  notes,
  topicName,
  onReview,
  onOpen,
  showActions,
}: {
  title: string;
  tone: string;
  notes: ConceptNote[];
  topicName: (id: string) => string;
  onReview: (id: string, difficulty: ReviewDifficulty) => void;
  onOpen: (note: ConceptNote) => void;
  showActions?: boolean;
}) {
  if (notes.length === 0) return null;
  return (
    <section className={`ff-today-card ff-tone-${tone}`}>
      <header className="ff-today-card-head">
        <div className="ff-today-card-toggle">
          <strong>{title}</strong>
          <span className="ff-today-count">{notes.length}</span>
        </div>
      </header>
      <div className="ff-today-card-body">
        {notes.map((note) => (
          <div key={note.id} className="ff-review-row">
            <button type="button" className="ff-review-main" onClick={() => onOpen(note)}>
              <strong>{note.title}</strong>
              <small>{topicName(note.topicId)} · {note.summary || "No summary"}</small>
            </button>
            {showActions ? (
              <div className="ff-review-actions">
                <button type="button" className="ff-rev-btn rev-hard" onClick={() => onReview(note.id, "hard")}>Hard</button>
                <button type="button" className="ff-rev-btn rev-medium" onClick={() => onReview(note.id, "medium")}>Medium</button>
                <button type="button" className="ff-rev-btn rev-easy" onClick={() => onReview(note.id, "easy")}>Easy</button>
                <button type="button" className="ff-rev-btn rev-master" onClick={() => onReview(note.id, "mastered")}>Mastered</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function NoteDetail({
  note,
  topicName,
  onClose,
  onEdit,
  onReview,
}: {
  note: ConceptNote;
  topicName: string;
  onClose: () => void;
  onEdit: () => void;
  onReview: (difficulty: ReviewDifficulty) => void;
}) {
  return (
    <Modal
      title={note.title}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="ff-btn" onClick={onEdit}>✎ Edit</button>
          <button className="ff-btn ff-btn-primary" onClick={() => onReview("medium")}>Review Now</button>
        </>
      }
    >
      <div className="ff-note-detail-meta">
        <span className="ff-projbadge">{topicName}</span>
        <span className={`ff-badge ff-badge-${difficultyTone(note.difficulty)}`}>{note.difficulty}</span>
        <span className="ff-badge ff-badge-muted">{note.noteType}</span>
        {note.nextReviewDate ? <span className="ff-badge ff-badge-accent">Next: {formatDate(note.nextReviewDate)}</span> : null}
      </div>
      {note.summary ? <Field label="Summary" value={note.summary} /> : null}
      {note.content ? <Field label="Explanation" value={note.content} /> : null}
      {note.examples ? <Field label="Examples" value={note.examples} /> : null}
      {note.personalExplanation ? <Field label="My explanation" value={note.personalExplanation} /> : null}
      {note.confusionPoint ? <Field label="Confusion point" value={note.confusionPoint} /> : null}
      {note.leetcode?.relatedProblems?.length ? (
        <Field label="Related problems" value={note.leetcode.relatedProblems.join("\n")} />
      ) : null}
      {note.reviewHistory.length > 0 ? (
        <div className="ff-field">
          <span className="ff-field-label">Review history</span>
          <ul className="ff-history">
            {note.reviewHistory.slice(-5).reverse().map((h) => (
              <li key={h.id}>{formatDate(h.reviewedAt.slice(0, 10))} · {h.difficulty}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ff-field">
      <span className="ff-field-label">{label}</span>
      <div className="ff-field-value">{value}</div>
    </div>
  );
}

function TopicModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (values: { name: string; category: StudyTopicCategory; description: string; color: string }) => void;
}) {
  const nameRef = useAutoFocus<HTMLInputElement>();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StudyTopicCategory>("LeetCode");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(TOPIC_COLORS[0]);
  const [error, setError] = useState(false);

  return (
    <Modal
      title="New Topic"
      onClose={onClose}
      footer={
        <>
          <button className="ff-btn" onClick={onClose}>Cancel</button>
          <button className="ff-btn ff-btn-primary" onClick={() => { if (!name.trim()) { setError(true); return; } onCreate({ name: name.trim(), category, description, color }); }}>Create Topic</button>
        </>
      }
    >
      <div className="ff-form">
        <label>
          Topic name
          <input ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); setError(false); }} />
          {error ? <span className="ff-quickadd-error" style={{ position: "static" }}>Topic name is required.</span> : null}
        </label>
        <div className="ff-form-grid">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as StudyTopicCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            Color
            <div className="ff-color-row">
              {TOPIC_COLORS.map((c) => (
                <button key={c} type="button" className={`ff-color-swatch${color === c ? " active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
              ))}
            </div>
          </label>
        </div>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function NoteEditor({
  topics,
  mode,
  note,
  onClose,
  onSave,
}: {
  topics: StudyTopic[];
  mode: "create" | "edit";
  note?: ConceptNote;
  onClose: () => void;
  onSave: (values: Partial<ConceptNote> & { title: string; topicId: string }, id?: string) => void;
}) {
  const titleRef = useAutoFocus<HTMLInputElement>();
  const [title, setTitle] = useState(note?.title ?? "");
  const [topicId, setTopicId] = useState(note?.topicId ?? topics[0]?.id ?? "");
  const [noteType, setNoteType] = useState<NoteType>(note?.noteType ?? "concept");
  const [summary, setSummary] = useState(note?.summary ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [examples, setExamples] = useState(note?.examples ?? "");
  const [personalExplanation, setPersonalExplanation] = useState(note?.personalExplanation ?? "");
  const [difficulty, setDifficulty] = useState<NoteDifficulty>(note?.difficulty ?? "unknown");
  const [nextReviewDate, setNextReviewDate] = useState(note?.nextReviewDate ?? "");
  const [error, setError] = useState(false);

  // type-specific
  const [pattern, setPattern] = useState(note?.leetcode?.pattern ?? "");
  const [related, setRelated] = useState((note?.leetcode?.relatedProblems ?? []).join("\n"));
  const [paperSource, setPaperSource] = useState(note?.research?.paperSource ?? "");
  const [expression, setExpression] = useState(note?.english?.expression ?? "");

  function submit() {
    if (!title.trim()) { setError(true); return; }
    const values: Partial<ConceptNote> & { title: string; topicId: string } = {
      title: title.trim(),
      topicId,
      noteType,
      summary,
      content,
      examples,
      personalExplanation,
      difficulty,
      nextReviewDate,
    };
    if (noteType === "leetcode") {
      values.leetcode = { ...note?.leetcode, pattern, relatedProblems: related.split("\n").map((s) => s.trim()).filter(Boolean) };
    } else if (noteType === "research") {
      values.research = { ...note?.research, paperSource };
    } else if (noteType === "english" || noteType === "presentation") {
      values.english = { ...note?.english, expression };
    }
    onSave(values, mode === "edit" ? note?.id : undefined);
  }

  return (
    <Modal
      title={mode === "edit" ? "Edit Note" : "New Note"}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="ff-btn" onClick={onClose}>Cancel</button>
          <button className="ff-btn ff-btn-primary" onClick={submit}>Save Note</button>
        </>
      }
    >
      <div className="ff-form">
        <label>
          Title
          <input ref={titleRef} value={title} onChange={(e) => { setTitle(e.target.value); setError(false); }} />
          {error ? <span className="ff-quickadd-error" style={{ position: "static" }}>Note title is required.</span> : null}
        </label>
        <div className="ff-form-grid">
          <label>
            Topic
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>
            Note type
            <select value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)}>
              {NOTE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label>
          Summary
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label>
          Explanation / content
          <textarea value={content} onChange={(e) => setContent(e.target.value)} />
        </label>
        <label>
          Examples
          <textarea value={examples} onChange={(e) => setExamples(e.target.value)} />
        </label>
        <label>
          My explanation
          <textarea value={personalExplanation} onChange={(e) => setPersonalExplanation(e.target.value)} />
        </label>

        {noteType === "leetcode" ? (
          <div className="ff-form-grid">
            <label>Pattern<input value={pattern} onChange={(e) => setPattern(e.target.value)} /></label>
            <label className="ff-form-full">Related problems (one per line)<textarea value={related} onChange={(e) => setRelated(e.target.value)} /></label>
          </div>
        ) : null}
        {noteType === "research" ? (
          <label>Paper source<input value={paperSource} onChange={(e) => setPaperSource(e.target.value)} /></label>
        ) : null}
        {noteType === "english" || noteType === "presentation" ? (
          <label>Expression<input value={expression} onChange={(e) => setExpression(e.target.value)} /></label>
        ) : null}

        <div className="ff-form-grid">
          <label>
            Difficulty
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as NoteDifficulty)}>
              <option value="unknown">Unknown</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label>
            Next review
            <input type="date" value={nextReviewDate} onChange={(e) => setNextReviewDate(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

function difficultyTone(d: NoteDifficulty): string {
  if (d === "hard") return "danger";
  if (d === "medium") return "warning";
  if (d === "easy") return "success";
  return "muted";
}

// Study streak: count consecutive days (ending today or yesterday) with at least one review.
function computeStreak(notes: ConceptNote[]): number {
  const days = new Set<string>();
  for (const note of notes) {
    for (const h of note.reviewHistory) {
      days.add(h.reviewedAt.slice(0, 10));
    }
    if (note.lastReviewedAt) days.add(note.lastReviewedAt.slice(0, 10));
  }
  if (days.size === 0) return 0;
  let streak = 0;
  const cursor = new Date(`${todayValue()}T00:00:00`);
  // allow streak to count from today or yesterday
  if (!days.has(toKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(toKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
