export type AgentIntent =
  | "daily_planning"
  | "weekly_planning"
  | "task_organization"
  | "study_coaching"
  | "calendar_conflict_check"
  | "free_time_detection"
  | "general_chat";

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

export function detectAgentIntent(message: string): AgentIntent {
  const normalized = message.trim().toLowerCase();

  if (!normalized) return "general_chat";

  if (
    includesAny(normalized, [
      "오늘",
      "하루",
      "today",
      "day",
      "뭐 해야",
      "뭐부터",
      "우선순위",
      "priority",
      "prioritize",
    ])
  ) {
    return "daily_planning";
  }

  if (includesAny(normalized, ["이번 주", "이번주", "주간", "week", "weekly"])) {
    return "weekly_planning";
  }

  if (
    includesAny(normalized, [
      "공부",
      "복습",
      "leetcode",
      "릿코드",
      "study",
      "review",
      "weak",
      "약점",
    ])
  ) {
    return "study_coaching";
  }

  if (
    includesAny(normalized, [
      "충돌",
      "겹",
      "conflict",
      "overlap",
      "일정 봐",
      "calendar",
      "캘린더",
    ])
  ) {
    return "calendar_conflict_check";
  }

  if (
    includesAny(normalized, [
      "빈 시간",
      "시간 찾아",
      "언제 할",
      "free time",
      "find time",
      "schedule",
      "스케줄",
    ])
  ) {
    return "free_time_detection";
  }

  if (
    includesAny(normalized, [
      "정리",
      "쪼개",
      "나눠",
      "task",
      "todo",
      "할 일",
      "organize",
      "split",
    ])
  ) {
    return "task_organization";
  }

  return "general_chat";
}

export function getIntentLabel(intent: AgentIntent) {
  const labels: Record<AgentIntent, string> = {
    daily_planning: "Daily planning",
    weekly_planning: "Weekly planning",
    task_organization: "Task organization",
    study_coaching: "Study coaching",
    calendar_conflict_check: "Calendar check",
    free_time_detection: "Free time",
    general_chat: "General chat",
  };

  return labels[intent];
}
