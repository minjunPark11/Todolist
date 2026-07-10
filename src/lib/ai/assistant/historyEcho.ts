// Compact draft echo appended to the assistant's chat-history message so the
// next turn's model sees what it already structured — including which info
// slots are answered, so it never re-asks them. Shared by AssistantPanel and
// the chat tab (Unified Chat slice 1). Display code strips the echo by
// splitting on "\n[draft]".
import type { AssistantTurn } from "./types";

export function buildAssistantHistoryText(turn: AssistantTurn): string {
  // Direct-answer turns (domain_specific/learning_request) have no card to
  // echo — the reply text alone is the history (Unified Chat slice 2).
  if (turn.isDirectAnswer) return turn.userFacingText;

  // Keep the echo minimal (prompt-budget: this rides in history every turn):
  // only what stops the next turn from re-asking — the stage and which info
  // slots are already answered. detected_items/missing_info are re-derived
  // from the fresh app-data pack each turn, so they don't need to persist
  // here and would just inflate the growing history.
  return [
    turn.userFacingText,
    `[draft] ${JSON.stringify({
      title: turn.contextCardDraft.title,
      stage: turn.contextCardDraft.stage,
      info_slots: (turn.contextCardDraft.infoSlots ?? [])
        .filter((slot) => slot.answer.trim())
        .map((slot) => ({ kind: slot.kind, answer: slot.answer, source: slot.source })),
    })}`,
  ].join("\n");
}
