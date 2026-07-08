// Composition entry point for the AI context pipeline. Callers that just
// need the prompt string use buildAiContextText; the two halves are exported
// separately so the AI Assistant MVP can select a context pack and shape the
// prompt independently (e.g. per-intent "relevant context packs").
import { selectRelevantAppContext, type AiContextInput } from "./selectRelevantAppContext";
import { summarizeContextForPrompt } from "./summarizeContextForPrompt";

export { selectRelevantAppContext } from "./selectRelevantAppContext";
export type { AiContextInput, RelevantAppContext } from "./selectRelevantAppContext";
export { summarizeContextForPrompt } from "./summarizeContextForPrompt";

export function buildAiContextText(input: AiContextInput): string {
  return summarizeContextForPrompt(selectRelevantAppContext(input), {
    calendarContextText: input.calendarContextText,
  });
}
