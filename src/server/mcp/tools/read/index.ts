// The V1 tool catalog (§9.1): thirteen names over twelve questions.
//
// Every one of them is a thin wrapper — read the arguments, call the query
// layer, hand back what it said. That is the arrangement §7.1 asks for and the
// reason Phase 3 could be finished first: nothing here decides anything about
// a task, a day, or a person's time.
//
// The descriptions are written for a model rather than for us. A tool the
// model picks wrongly costs a wasted call and a worse answer, so each one says
// what it is FOR and, where two of them are close, which to prefer.
import {
  getCalendarRange,
  getCurrentContext,
  getFocusSummary,
  getFreeTimeBlocks,
  getOverdueTasks,
  getProjectContext,
  getProjects,
  getSubtasks,
  getTaskDetail,
  getTasks,
  getTodayTasks,
  getUpcomingDeadlines,
  searchTasks,
} from "../../../data/queries";
import {
  optionalBoolean,
  optionalDate,
  optionalEnum,
  optionalInteger,
  optionalString,
  optionalStringArray,
  optionalTime,
  rejectUnknown,
  requiredDate,
  requiredString,
} from "../../args";
import { describe, type ToolDefinition } from "../../registry";

const TASK_STATUSES = ["open", "completed", "wont_do"] as const;
const PRIORITIES = ["none", "low", "medium", "high"] as const;
const CALENDAR_SOURCES = ["tasks", "external", "focus"] as const;

export const readTools: ToolDefinition[] = [
  {
    name: "get_current_context",
    mode: "read",
    description: describe(
      "Everything about the user's situation right now: today's schedule (their tasks, their subscribed calendars and recorded focus time on one timeline), the next event and how many free minutes are left before it, today's tasks by bucket, overdue and upcoming work, high-priority items, and recent focus. Call this FIRST for any open question about the day — it answers in one call what the narrower tools answer in six.",
    ),
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async handler(args, ctx) {
      rejectUnknown(args, []);
      return getCurrentContext(ctx);
    },
  },
  {
    name: "get_today_tasks",
    mode: "read",
    description: describe(
      "Today's tasks in the three buckets the user themselves arranged them into (now / next / later), using the app's own rule for what belongs to today — which includes overdue work and tasks planned for today with no due date.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        includeCompleted: { type: "boolean", description: "Include what was finished today. Default false; the count is always returned." },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["includeCompleted"]);
      return getTodayTasks(ctx, { includeCompleted: optionalBoolean(args, "includeCompleted") });
    },
  },
  {
    name: "get_tasks",
    mode: "read",
    description: describe(
      "Tasks matching a filter, paginated. Use for questions with a stated scope — a project, a list, a tag, a priority, a date window. Deleted and archived tasks are never returned.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: [...TASK_STATUSES] },
        projectId: { type: "string" },
        listId: { type: "string" },
        tag: { type: "string" },
        priority: { type: "string", enum: [...PRIORITIES] },
        dueFrom: { type: "string", description: "YYYY-MM-DD. Tasks with no due date are outside any window." },
        dueTo: { type: "string", description: "YYYY-MM-DD. At most 366 days after dueFrom." },
        limit: { type: "integer", description: "Default 50, maximum 200." },
        cursor: { type: "string", description: "From a previous answer's nextCursor." },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["status", "projectId", "listId", "tag", "priority", "dueFrom", "dueTo", "limit", "cursor"]);
      return getTasks(ctx, {
        status: optionalEnum(args, "status", TASK_STATUSES),
        projectId: optionalString(args, "projectId"),
        listId: optionalString(args, "listId"),
        tag: optionalString(args, "tag"),
        priority: optionalEnum(args, "priority", PRIORITIES),
        dueFrom: optionalDate(args, "dueFrom"),
        dueTo: optionalDate(args, "dueTo"),
        limit: optionalInteger(args, "limit", 1, 200),
        cursor: optionalString(args, "cursor"),
      });
    },
  },
  {
    name: "get_task_detail",
    mode: "read",
    description: describe(
      "One task in full: its description and notes, its subtasks and checklist with what is ticked, what it is blocked by, what it is blocking, and its recurrence. The only tool that returns a task's long text.",
    ),
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["taskId"]);
      return getTaskDetail(ctx, requiredString(args, "taskId"));
    },
  },
  {
    name: "get_subtasks",
    mode: "read",
    description: describe("Just the subtasks of one task. Prefer get_task_detail when the checklist or the description matters too."),
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["taskId"]);
      return getSubtasks(ctx, requiredString(args, "taskId"));
    },
  },
  {
    name: "get_overdue_tasks",
    mode: "read",
    description: describe("Unfinished tasks whose due date has passed, oldest deadline first, with how many days late each one is."),
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Default 50, maximum 200." } },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["limit"]);
      return getOverdueTasks(ctx, optionalInteger(args, "limit", 1, 200));
    },
  },
  {
    name: "get_upcoming_deadlines",
    mode: "read",
    description: describe(
      "Open tasks due between today and N days from now, also grouped by date. Does not include work that is already late — ask get_overdue_tasks for that.",
    ),
    inputSchema: {
      type: "object",
      properties: { days: { type: "integer", description: "Default 7, maximum 90." } },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["days"]);
      return getUpcomingDeadlines(ctx, optionalInteger(args, "days", 1, 90) ?? 7);
    },
  },
  {
    name: "search_tasks",
    mode: "read",
    description: describe(
      "Find tasks whose title, description or notes contain a string. Case-insensitive substring matching, not semantic search: pass a distinctive word the user actually wrote, not a paraphrase of their question.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "At least 2 characters." },
        limit: { type: "integer", description: "Default 50, maximum 200." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["query", "limit"]);
      return searchTasks(ctx, requiredString(args, "query"), optionalInteger(args, "limit", 1, 200));
    },
  },
  {
    name: "get_calendar_events",
    mode: "read",
    description: describe(
      "Everything on the calendar between two dates: scheduled task blocks, events from the user's subscribed calendars (repeating meetings expanded to each occurrence), and time actually spent focusing. Check meta.externalCalendars — if one shows ok:false, the day shown is missing that calendar's events and any conclusion about free time is unsafe.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD." },
        to: { type: "string", description: "YYYY-MM-DD, at most 92 days after from." },
        include: {
          type: "array",
          items: { type: "string", enum: [...CALENDAR_SOURCES] },
          description: "Default: all three.",
        },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["from", "to", "include"]);
      return getCalendarRange(
        ctx,
        requiredDate(args, "from"),
        requiredDate(args, "to"),
        optionalStringArray(args, "include", CALENDAR_SOURCES),
      );
    },
  },
  {
    name: "get_free_time_blocks",
    mode: "read",
    description: describe(
      "The gaps in one day, with the commitments they were computed from. Use this before suggesting when something could be done. All-day events do not count as busy hours.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD." },
        dayStart: { type: "string", description: "HH:mm, default 09:00." },
        dayEnd: { type: "string", description: "HH:mm, default 22:00." },
      },
      required: ["date"],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["date", "dayStart", "dayEnd"]);
      return getFreeTimeBlocks(
        ctx,
        requiredDate(args, "date"),
        optionalTime(args, "dayStart"),
        optionalTime(args, "dayEnd"),
      );
    },
  },
  {
    name: "get_projects",
    mode: "read",
    description: describe("The user's projects and areas, with how much open and overdue work each holds."),
    inputSchema: {
      type: "object",
      properties: { includeArchived: { type: "boolean", description: "Default false." } },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["includeArchived"]);
      return getProjects(ctx, { includeArchived: optionalBoolean(args, "includeArchived") });
    },
  },
  {
    name: "get_project_detail",
    mode: "read",
    description: describe("One project: its lists, its open work with the nearest deadlines first, and its own notes."),
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["projectId"]);
      return getProjectContext(ctx, requiredString(args, "projectId"));
    },
  },
  {
    name: "get_focus_summary",
    mode: "read",
    description: describe(
      "Recorded focus time over a period: total minutes, a per-day breakdown, which tasks took the most, and the most recent sessions. Minutes are what the timer counted, not what was planned.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD. Default: 13 days before `to`." },
        to: { type: "string", description: "YYYY-MM-DD. Default: today." },
      },
      additionalProperties: false,
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["from", "to"]);
      return getFocusSummary(ctx, { from: optionalDate(args, "from"), to: optionalDate(args, "to") });
    },
  },
];
