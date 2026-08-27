// The query layer's public surface — the fifteen questions of §7.3.
//
// Nothing here knows what MCP is. That is the arrangement §7.1 asks for and
// the reason Phase 3 can be finished and tested before Phase 4 exists: these
// are functions over an account, and the protocol is a way of calling them.
export type { QueryContext, ResponseMeta } from "./shared";

export { getCurrentContext, type CurrentContext } from "./currentContext";
export { getTodayTasks, type TodayTasksResult } from "./todayTasks";
export {
  getTasks,
  searchTasks,
  getTaskDetail,
  getSubtasks,
  getOverdueTasks,
  getUpcomingDeadlines,
  type TaskFilter,
  type TaskListResult,
} from "./tasks";
export { getCalendarRange, getFreeTimeBlocks, type FreeTimeResult } from "./calendar";
export { getProjects, getProjectContext, type ProjectDetail } from "./projects";
export { getFocusSummary, type FocusSummary } from "./focus";
export { getSyncFreshness } from "./syncFreshness";
