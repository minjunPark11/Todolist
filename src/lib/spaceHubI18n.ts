// Display-time translation for the Space detail hub.
//
// Preset labels, task-group labels, and note types double as stable identity
// keys in the selectors/config (e.g. resolveTaskGroupLabel matches on the
// English "Done"/"Blocked" strings, group filters store the raw label). We keep
// those English values as the source of truth and translate only at render time
// via the maps below. Unknown values (user-created groups/note types) fall
// through untouched so custom input still shows exactly what the user typed.
import type { SpaceTab } from "./spaceHubTypes";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The groups the "add task" picker offers.
 *
 * English, and deliberately so: the chosen value is STORED, as a `group:<label>`
 * tag on the Task. They are identity, and `GROUP_KEY` below is what turns them
 * back into the reader's language. Changing a string here orphans every tag
 * already carrying it.
 *
 * A per-space-type table used to choose between two of these lists — a
 * "project" set and an "area" set differing by one entry. Nothing could create
 * an area, and the type changed no behaviour, so the table went and this is
 * what it resolved to.
 */
export const SPACE_TASK_GROUPS = ["In Progress", "To Schedule", "Blocked", "Review Needed", "Done"];

const GROUP_KEY: Record<string, string> = {
  "In Progress": "spaceHub.group.inProgress",
  "To Schedule": "spaceHub.group.toSchedule",
  Blocked: "spaceHub.group.blocked",
  "Review Needed": "spaceHub.group.reviewNeeded",
  Done: "spaceHub.group.done",
  "Today Study": "spaceHub.group.todayStudy",
  "Review Due": "spaceHub.group.reviewDue",
  Problems: "spaceHub.group.problems",
  Concepts: "spaceHub.group.concepts",
  "Wrong Notes": "spaceHub.group.wrongNotes",
  Completed: "spaceHub.group.completed",
  Literature: "spaceHub.group.literature",
  Experiment: "spaceHub.group.experiment",
  Analysis: "spaceHub.group.analysis",
  Writing: "spaceHub.group.writing",
  Revision: "spaceHub.group.revision",
  Submission: "spaceHub.group.submission",
  Today: "spaceHub.group.today",
  Routine: "spaceHub.group.routine",
  "Quick Tasks": "spaceHub.group.quickTasks",
  Errands: "spaceHub.group.errands",
  Waiting: "spaceHub.group.waiting",
  Work: "spaceHub.group.work",
};

export function groupText(t: TFn, value: string): string {
  const key = GROUP_KEY[value];
  return key ? t(key) : value;
}

export function tabText(t: TFn, tab: SpaceTab): string {
  return t(`spaceHub.tab.${tab}`);
}

export function upcomingKindText(t: TFn, kind: string): string {
  return t(`spaceHub.kind.${kind}`);
}
