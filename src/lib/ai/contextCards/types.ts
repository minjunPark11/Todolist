// Type draft for Context Cards — small, durable notes the assistant (or the
// user) pins to a task/project so the "why/where was I" context survives
// between sessions. No storage or UI exists yet; when the feature lands,
// persistence should get its own store (not a Task/Project schema change)
// keyed by these types.
export type ContextCardSource = "user" | "assistant" | "brain_dump";

export type ContextCard = {
  id: string;
  title: string;
  // Markdown-ish free text; keep short enough to inline into AI context.
  body: string;
  source: ContextCardSource;
  taskId?: string;
  projectId?: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

// What the assistant proposes via the save_context_card safe action; the
// executor stamps id/source/timestamps.
export type ContextCardDraft = Pick<ContextCard, "title" | "body"> &
  Partial<Pick<ContextCard, "taskId" | "projectId" | "tags">>;
