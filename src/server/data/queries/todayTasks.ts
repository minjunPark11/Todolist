// "What am I doing today?" — answered with the app's own Today, not a second
// definition of it.
//
// `collectTodayEntries` is what the Today screen calls, so membership, the
// default bucket, and the user's own moves between buckets all come from one
// place. A server that re-derived "today" from due dates would be right most
// of the time and wrong exactly where it matters: the task with no due date
// that the user planned for today, which is the whole reason the daily-plan
// record exists (§12.5.1).
import { bucketOverridesFor } from "../../../domain/today/dailyPlan";
import { collectTodayEntries, type TodayEntry } from "../../../utils/todayView";
import { projectTask, type TaskSummary } from "../projections";
import { buildMetaAt, projectionFor, TABLES, todayFor, type QueryContext, type ResponseMeta } from "./shared";

export interface TodayTasksResult {
  date: string;
  timezone: string;
  buckets: { now: TaskSummary[]; next: TaskSummary[]; later: TaskSummary[] };
  completedCount: number;
  meta: ResponseMeta;
}

export async function getTodayTasks(
  ctx: QueryContext,
  options: { includeCompleted?: boolean } = {},
): Promise<TodayTasksResult> {
  const slice = await ctx.repo.loadSlice(TABLES.today);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);

  const entries = collectTodayEntries(
    {
      tasks: slice.data.tasks,
      lists: slice.data.lists,
      dailyPlans: slice.data.dailyPlans,
      taskTags: slice.data.taskTags,
      today,
    },
    bucketOverridesFor(slice.data.dailyPlans, today),
    today,
  );

  const completedCount = entries.filter((entry) => entry.completed).length;
  const visible = options.includeCompleted ? entries : entries.filter((entry) => !entry.completed);

  return {
    date: today,
    timezone: ctx.request.timezone,
    buckets: {
      now: summarize(visible, "now", projection),
      next: summarize(visible, "next", projection),
      later: summarize(visible, "later", projection),
    },
    // Reported even when the completed entries are not returned: "you finished
    // four things today" is worth knowing, and it is a number rather than a
    // list of them.
    completedCount,
    meta: buildMetaAt(slice, ctx.request.now),
  };
}

function summarize(
  entries: TodayEntry[],
  bucket: "now" | "next" | "later",
  projection: ReturnType<typeof projectionFor>,
): TaskSummary[] {
  return entries.filter((entry) => entry.bucket === bucket).map((entry) => projectTask(entry.task, projection));
}
