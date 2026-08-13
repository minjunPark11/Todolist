// Type draft for AI Memory — durable, user-visible facts the assistant may
// recall across sessions (preferences, routines, what interventions worked).
// Nothing reads or writes these yet; the store interface below is the seam a
// future implementation (local DB table or file) should fill in. Memory must
// stay inspectable/deletable by the user and, like knowledge context, must
// never be sent to non-local providers without explicit consent.
export type AiMemoryKind =
  // "Prefers deep work before noon", "hates 5-minute task splits".
  | "preference"
  // Stable facts about the user's world: projects, roles, recurring duties.
  | "fact"
  // Observed working patterns the assistant inferred over time.
  | "routine"
  // Result of a suggestion, written via log_intervention_outcome.
  | "intervention_outcome";

export type AiMemoryEntry = {
  id: string;
  kind: AiMemoryKind;
  content: string;
  // 0..1; inferred memories start low and grow with confirmation.
  confidence: number;
  // Where this memory came from (chat turn, brain dump, action outcome).
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
  // "" = never expires; ISO date otherwise.
  expiresAt: string;
};

// Storage seam for the future implementation. Kept async and query-shaped so
// it can sit on the same local DB the knowledge index uses.
export interface AiMemoryStore {
  list(kind?: AiMemoryKind): Promise<AiMemoryEntry[]>;
  upsert(entry: AiMemoryEntry): Promise<void>;
  remove(id: string): Promise<void>;
}
