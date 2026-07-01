import { useEffect, useMemo, useState } from "react";
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
import { useT } from "../i18n";

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
  // §9.11 / Phase 4: lets Calendar's study-review blocks open a specific note here.
  focusNoteId?: string;
  onFocusNoteHandled?: () => void;
}

export function StudyPage(props: StudyPageProps) {
  const { topics, notes, tab, onChangeTab, focusNoteId, onFocusNoteHandled } = props;
  const { t } = useT();
  const today = todayValue();
  const [topicModal, setTopicModal] = useState(false);
  const [noteEditor, setNoteEditor] = useState<{ mode: "create" | "edit"; note?: ConceptNote } | null>(null);
  const [openNote, setOpenNote] = useState<ConceptNote | null>(null);
  const [topicFilter, setTopicFilter] = useState<string>("all");

  useEffect(() => {
    if (!focusNoteId) return;
    const note = notes.find((candidate) => candidate.id === focusNoteId);
    if (note) setOpenNote(note);
    onFocusNoteHandled?.();
  }, [focusNoteId]);

  const queue = useMemo(() => getStudyReviewQueue(notes, today), [notes, today]);
  const dueCount = queue.due.length;
  const streak = useMemo(() => computeStreak(notes), [notes]);

  const visibleNotes = topicFilter === "all" ? notes : notes.filter((n) => n.topicId === topicFilter);
  const topicName = (id: string) => topics.find((t) => t.id === id)?.name ?? t("study.noTopic");
  const topicColor = (id: string) => topics.find((t) => t.id === id)?.color ?? "#8e8e93";

  return (
    <div className="ff-page">
      <header className="ff-page-head">
        <div>
          <h1 className="ff-page-title">{t("study.title")}</h1>
          <p className="ff-page-sub">{t("study.subtitle")}</p>
        </div>
        <div className="ff-page-actions">
          {dueCount > 0 ? (
            <button type="button" className="ff-badge ff-badge-danger" onClick={() => onChangeTab("reviews")}>
              {t("study.dueReviewsCount", { n: dueCount })}
            </button>
          ) : null}
          <button type="button" className="ff-btn" onClick={() => setTopicModal(true)}>+ {t("study.newTopic")}</button>
          <button type="button" className="ff-btn ff-btn-primary" onClick={() => setNoteEditor({ mode: "create" })}>+ {t("study.newNote")}</button>
        </div>
      </header>

      <SegmentedTabs
        tabs={[["topics", t("study.tabTopics")], ["notes", t("study.tabNotes")], ["reviews", t("study.tabReviews")]]}
        active={tab}
        onChange={onChangeTab}
      />

      {tab === "topics" ? (
        <>
          <div className="ff-study-metrics">
            <MetricCard label={t("study.totalTopics")} value={topics.length} tone="accent" onClick={() => onChangeTab("topics")} />
            <MetricCard label={t("study.conceptNotes")} value={notes.length} tone="purple" onClick={() => onChangeTab("notes")} />
            <MetricCard label={t("study.dueReviews")} value={dueCount} tone="danger" onClick={() => onChangeTab("reviews")} />
            <MetricCard label={t("study.studyStreak")} value={streak === 1 ? t("study.streakDaySingular", { n: streak }) : t("study.streakDayPlural", { n: streak })} tone="success" />
          </div>
          {topics.length === 0 ? (
            <EmptyState icon="📚" title={t("study.noTopicsYet")} text={t("study.noTopicsYetHint")} actionLabel={t("study.newTopic")} onAction={() => setTopicModal(true)} />
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
                      <MoreMenu items={[{ label: t("study.deleteTopic"), danger: true, onClick: () => props.onDeleteTopic(topic.id) }]} />
                    </div>
                    <small className="ff-topic-cat">{topic.category}</small>
                    {topic.description ? <p>{topic.description}</p> : null}
                    <div className="ff-topic-foot">
                      <span>{t("study.notesCount", { n: topicNotes.length })}</span>
                      {due > 0 ? <span className="ff-badge ff-badge-danger">{t("study.dueCount", { n: due })}</span> : <span className="ff-topic-ok">{t("study.upToDate")}</span>}
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
              <option value="all">{t("study.allTopics")}</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>{topic.name}</option>
              ))}
            </select>
          </div>
          {visibleNotes.length === 0 ? (
            <EmptyState icon="📝" title={t("study.noNotesYet")} text={t("study.noNotesYetHint")} actionLabel={t("study.newNote")} onAction={() => setNoteEditor({ mode: "create" })} />
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
                          { label: t("common.edit"), onClick: () => setNoteEditor({ mode: "edit", note }) },
                          { label: t("study.markAsMastered"), onClick: () => props.onMarkReviewed(note.id, "mastered") },
                          { separator: true },
                          { label: t("common.delete"), danger: true, onClick: () => props.onDeleteNote(note.id) },
                        ]}
                      />
                    </div>
                    {note.summary ? <p>{note.summary}</p> : null}
                    <div className="ff-note-card-foot">
                      <span className="ff-projbadge"><span className="ff-dot" style={{ background: topicColor(note.topicId) }} />{topicName(note.topicId)}</span>
                      <span className={`ff-badge ff-badge-${difficultyTone(note.difficulty)}`}>{t(`study.difficulty.${note.difficulty}`)}</span>
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
          <ReviewSection title={t("study.due")} tone="danger" notes={queue.due} topicName={topicName} onReview={props.onMarkReviewed} onOpen={setOpenNote} showActions />
          <ReviewSection title={t("study.upcoming")} tone="accent" notes={queue.upcoming} topicName={topicName} onReview={props.onMarkReviewed} onOpen={setOpenNote} />
          <ReviewSection title={t("study.mastered")} tone="success" notes={queue.mastered} topicName={topicName} onReview={props.onMarkReviewed} onOpen={setOpenNote} />
          {queue.due.length === 0 && queue.upcoming.length === 0 && queue.mastered.length === 0 ? (
            <EmptyState icon="✅" title={t("study.noReviewsScheduled")} text={t("study.noReviewsScheduledHint")} />
          ) : null}
        </div>
      ) : null}

      {topicModal ? (
        <TopicModal
          onClose={() => setTopicModal(false)}
          onCreate={(values) => {
            props.onCreateTopic(values);
            setTopicModal(false);
            props.showToast({ message: t("study.topicCreated") });
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
            props.showToast({ message: t("study.noteSaved") });
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
  const { t, lang } = useT();
  if (status === "due") return <span className="ff-badge ff-badge-danger">{t("study.due")}</span>;
  if (status === "upcoming") return <span className="ff-badge ff-badge-accent">{formatDate(note.nextReviewDate, lang)}</span>;
  if (status === "mastered") return <span className="ff-badge ff-badge-success">{t("study.mastered")}</span>;
  return <span className="ff-badge ff-badge-muted">{t("study.notScheduled")}</span>;
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
  const { t } = useT();
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
              <small>{topicName(note.topicId)} · {note.summary || t("study.noSummary")}</small>
            </button>
            {showActions ? (
              <div className="ff-review-actions">
                <button type="button" className="ff-rev-btn rev-hard" onClick={() => onReview(note.id, "hard")}>{t("study.hard")}</button>
                <button type="button" className="ff-rev-btn rev-medium" onClick={() => onReview(note.id, "medium")}>{t("study.medium")}</button>
                <button type="button" className="ff-rev-btn rev-easy" onClick={() => onReview(note.id, "easy")}>{t("study.easy")}</button>
                <button type="button" className="ff-rev-btn rev-master" onClick={() => onReview(note.id, "mastered")}>{t("study.mastered")}</button>
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
  const { t, lang } = useT();
  return (
    <Modal
      title={note.title}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="ff-btn" onClick={onEdit}>✎ {t("common.edit")}</button>
          <button className="ff-btn ff-btn-primary" onClick={() => onReview("medium")}>{t("study.reviewNow")}</button>
        </>
      }
    >
      <div className="ff-note-detail-meta">
        <span className="ff-projbadge">{topicName}</span>
        <span className={`ff-badge ff-badge-${difficultyTone(note.difficulty)}`}>{t(`study.difficulty.${note.difficulty}`)}</span>
        <span className="ff-badge ff-badge-muted">{t(`study.noteType.${note.noteType}`)}</span>
        {note.nextReviewDate ? <span className="ff-badge ff-badge-accent">{t("study.nextReviewLabel", { date: formatDate(note.nextReviewDate, lang) })}</span> : null}
      </div>
      {note.summary ? <Field label={t("study.summary")} value={note.summary} /> : null}
      {note.content ? <Field label={t("study.explanation")} value={note.content} /> : null}
      {note.examples ? <Field label={t("study.examples")} value={note.examples} /> : null}
      {note.personalExplanation ? <Field label={t("study.myExplanation")} value={note.personalExplanation} /> : null}
      {note.confusionPoint ? <Field label={t("study.confusionPoint")} value={note.confusionPoint} /> : null}
      {note.leetcode?.relatedProblems?.length ? (
        <Field label={t("study.relatedProblems")} value={note.leetcode.relatedProblems.join("\n")} />
      ) : null}
      {note.reviewHistory.length > 0 ? (
        <div className="ff-field">
          <span className="ff-field-label">{t("study.reviewHistory")}</span>
          <ul className="ff-history">
            {note.reviewHistory.slice(-5).reverse().map((h) => (
              <li key={h.id}>{formatDate(h.reviewedAt.slice(0, 10), lang)} · {t(`study.${h.difficulty}`)}</li>
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
  const { t } = useT();
  const nameRef = useAutoFocus<HTMLInputElement>();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StudyTopicCategory>("LeetCode");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(TOPIC_COLORS[0]);
  const [error, setError] = useState(false);

  return (
    <Modal
      title={t("study.newTopicTitle")}
      onClose={onClose}
      footer={
        <>
          <button className="ff-btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="ff-btn ff-btn-primary" onClick={() => { if (!name.trim()) { setError(true); return; } onCreate({ name: name.trim(), category, description, color }); }}>{t("study.createTopic")}</button>
        </>
      }
    >
      <div className="ff-form">
        <label>
          {t("study.topicName")}
          <input ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); setError(false); }} />
          {error ? <span className="ff-quickadd-error" style={{ position: "static" }}>{t("study.topicNameRequired")}</span> : null}
        </label>
        <div className="ff-form-grid">
          <label>
            {t("study.category")}
            <select value={category} onChange={(e) => setCategory(e.target.value as StudyTopicCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            {t("common.color")}
            <div className="ff-color-row">
              {TOPIC_COLORS.map((c) => (
                <button key={c} type="button" className={`ff-color-swatch${color === c ? " active" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
              ))}
            </div>
          </label>
        </div>
        <label>
          {t("common.description")}
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
  const { t } = useT();
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
      title={mode === "edit" ? t("study.editNote") : t("study.newNoteTitle")}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="ff-btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="ff-btn ff-btn-primary" onClick={submit}>{t("study.saveNote")}</button>
        </>
      }
    >
      <div className="ff-form">
        <label>
          {t("study.noteTitleLabel")}
          <input ref={titleRef} value={title} onChange={(e) => { setTitle(e.target.value); setError(false); }} />
          {error ? <span className="ff-quickadd-error" style={{ position: "static" }}>{t("study.noteTitleRequired")}</span> : null}
        </label>
        <div className="ff-form-grid">
          <label>
            {t("study.topic")}
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
            </select>
          </label>
          <label>
            {t("study.noteType")}
            <select value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)}>
              {NOTE_TYPES.map((nt) => <option key={nt} value={nt}>{t(`study.noteType.${nt}`)}</option>)}
            </select>
          </label>
        </div>
        <label>
          {t("study.summary")}
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label>
          {t("study.explanationContent")}
          <textarea value={content} onChange={(e) => setContent(e.target.value)} />
        </label>
        <label>
          {t("study.examples")}
          <textarea value={examples} onChange={(e) => setExamples(e.target.value)} />
        </label>
        <label>
          {t("study.myExplanation")}
          <textarea value={personalExplanation} onChange={(e) => setPersonalExplanation(e.target.value)} />
        </label>

        {noteType === "leetcode" ? (
          <div className="ff-form-grid">
            <label>{t("study.pattern")}<input value={pattern} onChange={(e) => setPattern(e.target.value)} /></label>
            <label className="ff-form-full">{t("study.relatedProblemsLines")}<textarea value={related} onChange={(e) => setRelated(e.target.value)} /></label>
          </div>
        ) : null}
        {noteType === "research" ? (
          <label>{t("study.paperSource")}<input value={paperSource} onChange={(e) => setPaperSource(e.target.value)} /></label>
        ) : null}
        {noteType === "english" || noteType === "presentation" ? (
          <label>{t("study.expression")}<input value={expression} onChange={(e) => setExpression(e.target.value)} /></label>
        ) : null}

        <div className="ff-form-grid">
          <label>
            {t("study.difficultyLabel")}
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as NoteDifficulty)}>
              <option value="unknown">{t("study.difficulty.unknown")}</option>
              <option value="easy">{t("study.difficulty.easy")}</option>
              <option value="medium">{t("study.difficulty.medium")}</option>
              <option value="hard">{t("study.difficulty.hard")}</option>
            </select>
          </label>
          <label>
            {t("study.nextReview")}
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
