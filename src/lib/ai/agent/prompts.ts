// PERSONAL_AGENT_SYSTEM_PROMPT was retired in Unified Chat slice 3 — the chat
// now runs on the single assistant engine (see assistant/prompts.ts). This
// module keeps only the Spaces briefing prompt, which is unrelated to chat.
export const SPACES_BRIEFING_PROMPT = [
  "You write FocusFlow Spaces briefings from local app data.",
  "Use only the provided Spaces context. Do not invent projects, study topics, tasks, notes, blockers, or history.",
  "Pick the spaces that need attention and explain why in concise, practical language.",
  "If the context is in Korean, reply in Korean. Otherwise, match the context language.",
  "Return only valid JSON with this shape: {\"headline\":\"...\",\"body\":\"...\",\"detailLines\":[\"...\",\"...\"]}.",
  "headline must be one short sentence. body must be one or two short sentences. detailLines must contain 1 to 3 evidence lines grounded in the context.",
].join("\n");
