// Compact draft echo appended to the assistant's chat-history message so the
// next turn's model sees what it already structured — including which info
// slots are answered, so it never re-asks them. Shared by AssistantPanel and
// the chat tab (Unified Chat slice 1). Display code strips the echo by
// splitting on "\n[draft]".
import type { AssistantTurn } from "./types";

export function buildAssistantHistoryText(turn: AssistantTurn): string {
  return [
    turn.userFacingText,
    `[draft] ${JSON.stringify({
      title: turn.contextCardDraft.title,
      detected_items: turn.contextCardDraft.detectedItems,
      missing_info: turn.contextCardDraft.missingInfo,
      stage: turn.contextCardDraft.stage,
      info_slots: (turn.contextCardDraft.infoSlots ?? []).map((slot) => ({
        kind: slot.kind,
        answer: slot.answer,
        source: slot.source,
      })),
    })}`,
  ].join("\n");
}
