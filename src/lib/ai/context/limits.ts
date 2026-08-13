// Caps applied by buildAiContextText so the personal-AI prompt fits the
// managed llama-server's context window (--ctx-size 8192 in local_ai.rs)
// alongside the system prompt, knowledge context, and chat history.
//
// maxContextTokens replaces an older 16,000-CHARACTER cap that was documented
// as "≈ 4-5k tokens". That conversion only holds for latin text: Hangul and
// CJK cost about one token per character, so the same cap allowed 16k tokens —
// twice the whole window — and the request was rejected outright. The cap is
// now stated in the unit the window is actually measured in.
export const AI_CONTEXT_LIMITS = {
  todayTasks: 20,
  overdueTasks: 10,
  upcomingTasks: 20,
  recentDoneTasks: 10,
  otherActiveTasks: 10,
  subtasks: 60,
  projects: 20,
  calendarEvents: 30,
  studyTopics: 10,
  recentNotes: 5,
  habits: 20,
  focusSessions: 30,
  activityWindowDays: 14,
  taskTemplates: 10,
  recentItems: 10,
  textFieldCharacters: 240,
  maxContextTokens: 2400,
};
