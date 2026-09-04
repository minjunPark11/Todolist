// src/domain/calendar/googleSync/connectFlow.ts
var CALLBACK_ROUTE = "google-calendar";
var CALLBACK_LANDING_PATH = "/settings";

// src/server/mcp/auth.ts
var UnauthorizedError = class extends Error {
  /** What goes in `WWW-Authenticate`, so a connector starts an OAuth flow. */
  reason;
  constructor(reason, message) {
    super(message);
    this.name = "UnauthorizedError";
    this.reason = reason;
  }
};

// src/server/mcp/protectedResource.ts
function issuerFor(supabaseUrl) {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
}
function readAppUrl(env = process.env) {
  const url = (env.APP_URL || env.PUBLIC_APP_URL || "").trim();
  if (url) return url.replace(/\/+$/, "");
  const vercel = (env.VERCEL_URL || "").trim();
  return vercel ? `https://${vercel.replace(/^https?:\/\//, "")}` : void 0;
}

// src/server/mcp/jwks.ts
var DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
var DEFAULT_REFETCH_FLOOR_MS = 60 * 1e3;
var DEFAULT_CLOCK_SKEW_MS = 30 * 1e3;
function supabaseTokenVerifier(options) {
  const {
    issuer,
    jwksUrl = `${issuer.replace(/\/+$/, "")}/.well-known/jwks.json`,
    audience = "authenticated",
    fetchImpl = fetch,
    now = () => /* @__PURE__ */ new Date(),
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    refetchFloorMs = DEFAULT_REFETCH_FLOOR_MS,
    clockSkewMs = DEFAULT_CLOCK_SKEW_MS
  } = options;
  let cache2 = null;
  let inFlight = null;
  async function loadKeys(force) {
    const age = cache2 ? now().getTime() - cache2.fetchedAt : Number.POSITIVE_INFINITY;
    if (cache2 && !force && age < cacheTtlMs) return cache2;
    if (cache2 && force && age < refetchFloorMs) return cache2;
    inFlight ??= fetchKeys(jwksUrl, fetchImpl, now).finally(() => {
      inFlight = null;
    });
    cache2 = await inFlight;
    return cache2;
  }
  return {
    async verify(bearer) {
      const parts = bearer.split(".");
      if (parts.length !== 3) throw new UnauthorizedError("invalid_token", "That token is not a JWT.");
      const header = decodeSegment(parts[0]);
      const claims = decodeSegment(parts[1]);
      if (!header || !claims) throw new UnauthorizedError("invalid_token", "That token is not a JWT.");
      if (header.alg !== "ES256" && header.alg !== "RS256") {
        throw new UnauthorizedError(
          "invalid_token",
          `Tokens signed with ${header.alg || "an unnamed algorithm"} are not accepted here.`
        );
      }
      let keys = await loadKeys(false);
      let jwk = header.kid ? keys.keys.get(header.kid) : void 0;
      if (!jwk) {
        keys = await loadKeys(true);
        jwk = header.kid ? keys.keys.get(header.kid) : void 0;
      }
      if (!jwk) throw new UnauthorizedError("invalid_token", "That token was signed with an unknown key.");
      const signed = `${parts[0]}.${parts[1]}`;
      const valid = await verifySignature(header.alg, jwk, signed, base64UrlToBytes(parts[2]));
      if (!valid) throw new UnauthorizedError("invalid_token", "That token's signature does not check out.");
      const nowMs = now().getTime();
      if (typeof claims.exp === "number" && claims.exp * 1e3 + clockSkewMs <= nowMs) {
        throw new UnauthorizedError("invalid_token", "That token has expired.");
      }
      if (typeof claims.nbf === "number" && claims.nbf * 1e3 - clockSkewMs > nowMs) {
        throw new UnauthorizedError("invalid_token", "That token is not valid yet.");
      }
      if (claims.iss !== issuer) {
        throw new UnauthorizedError("invalid_token", "That token was issued for a different service.");
      }
      if (!audienceMatches(claims.aud, audience)) {
        throw new UnauthorizedError("invalid_token", "That token was issued for a different audience.");
      }
      const userId = typeof claims.sub === "string" ? claims.sub : "";
      if (!userId) throw new UnauthorizedError("invalid_token", "That token names no subject.");
      return {
        userId,
        ...typeof claims.client_id === "string" ? { clientId: claims.client_id } : {},
        accessToken: bearer
      };
    }
  };
}
async function fetchKeys(url, fetchImpl, now) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new UnauthorizedError("invalid_token", "The signing keys could not be read right now.");
  }
  if (!response.ok) throw new UnauthorizedError("invalid_token", "The signing keys could not be read right now.");
  const body = await response.json();
  const keys = /* @__PURE__ */ new Map();
  for (const key of body.keys ?? []) {
    if (key.kid) keys.set(key.kid, key);
  }
  return { keys, fetchedAt: now().getTime() };
}
async function verifySignature(alg, jwk, signed, signature) {
  const algorithm = alg === "ES256" ? { name: "ECDSA", namedCurve: "P-256" } : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  let key;
  try {
    key = await crypto.subtle.importKey("jwk", { ...jwk, alg, key_ops: ["verify"], ext: true }, algorithm, false, [
      "verify"
    ]);
  } catch {
    throw new UnauthorizedError("invalid_token", "That token's signing key is unusable.");
  }
  const parameters = alg === "ES256" ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" };
  return crypto.subtle.verify(parameters, key, signature, new TextEncoder().encode(signed));
}
function audienceMatches(aud, expected) {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.includes(expected);
  return false;
}
function decodeSegment(segment) {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
function base64UrlToBytes(segment) {
  return new Uint8Array(Buffer.from(segment, "base64url"));
}

// src/domain/sync/buildSyncPlan.ts
var collectionTables = [
  ["tasks", "tasks"],
  ["projects", "projects"],
  ["subtasks", "subtasks"],
  ["focusSessions", "focus_sessions"],
  ["learningPaths", "learning_paths"],
  ["spaces", "spaces"],
  ["folders", "folders"],
  ["lists", "lists"],
  ["sidebarFolders", "sidebar_folders"],
  ["listSections", "list_sections"],
  ["savedFilters", "saved_filters"],
  ["dailyPlans", "daily_plans"],
  ["tags", "tags"],
  ["taskTags", "task_tags"],
  ["checkItems", "check_items"],
  ["reminders", "reminders"],
  ["taskTemplates", "task_templates"]
];

// src/domain/spaces/hierarchy.ts
function activeLists(lists, projectId) {
  if (!projectId) return [];
  return lists.filter((list) => list.projectId === projectId && !list.archivedAt && !list.deletedAt).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
function defaultListFor(lists, spaceId) {
  const active = activeLists(lists, spaceId);
  return active.find((list) => list.isDefault) ?? active[0];
}

// src/domain/tags/tags.ts
var LEGACY_MARKER = /^(space|group):/;
function isUserTag(name) {
  const trimmed = name.trim();
  return trimmed.length > 0 && !LEGACY_MARKER.test(trimmed);
}
function tagKeyFor(name) {
  return name.trim().toLowerCase();
}
function tagIdFor(name) {
  return `tag-${tagKeyFor(name)}`;
}
function tagsForTask(taskId, tags, links) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const found = [];
  for (const link of links) {
    if (link.taskId !== taskId) continue;
    const tag = byId.get(link.tagId);
    if (tag && !tag.archivedAt) found.push(tag);
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
function tagNamesForTask(task, tags, links) {
  const linked = tagsForTask(task.id, tags, links);
  if (linked.length > 0) return linked.map((tag) => tag.name);
  return task.tags.filter(isUserTag).map((name) => name.trim());
}

// src/domain/spaces/membership.ts
function listIdFor(item, lists) {
  if (item.listId) return item.listId;
  if (!item.projectId) return inboxListId(lists);
  return defaultListFor(lists, item.projectId)?.id ?? "";
}
function inboxListId(lists) {
  return lists.find((list) => list.kind === "inbox" && !list.archivedAt && !list.deletedAt)?.id ?? "";
}

// src/domain/tasks/sidebarFolders.ts
function folderIdFor(list) {
  return list.sidebarFolderId?.trim() || list.folderId?.trim() || "";
}

// src/domain/tasks/filters.ts
var TODAY_TOKEN = "today";
function resolveDate(value2, today) {
  return value2 === TODAY_TOKEN ? today : value2;
}
function taskHasTag(task, tagId, links) {
  if (links.some((link) => link.taskId === task.id && link.tagId === tagId)) return true;
  return task.tags.some((name) => isUserTag(name) && tagIdFor(name) === tagId);
}
function conditionHolds(task, condition, ctx) {
  switch (condition.field) {
    case "list":
      return listIdFor(task, ctx.lists) === condition.value;
    case "tag":
      return taskHasTag(task, condition.value, ctx.taskTags);
    case "priority":
      return task.priority === condition.value;
    case "title":
      return task.title.toLowerCase().includes(condition.value.toLowerCase());
    case "due": {
      const due = task.dueDate || "";
      if (!due) return false;
      const target = resolveDate(condition.value, ctx.today);
      if (condition.op === "before") return due < target;
      if (condition.op === "after") return due > target;
      return due === target;
    }
  }
}
function matchesFilterSpec(task, spec, ctx) {
  if (spec.all.length === 0) return false;
  return spec.all.every((condition) => {
    const holds = conditionHolds(task, condition, ctx);
    return condition.not ? !holds : holds;
  });
}

// src/domain/tasks/checkItems.ts
function checkItemsForTask(taskId, items) {
  if (!taskId) return [];
  return items.filter((item) => item.taskId === taskId).sort((a, b) => a.sortKey - b.sortKey || a.text.localeCompare(b.text));
}

// src/domain/today/dailyPlan.ts
function bucketOverridesFor(plans, planDate) {
  const overrides = {};
  for (const plan of plans) {
    if (plan.planDate !== planDate) continue;
    if (plan.bucket) overrides[plan.taskId] = plan.bucket;
  }
  return overrides;
}

// src/domain/schedule/types.ts
var REPEAT_PRESETS = ["none", "daily", "weekdays", "weekly", "monthly", "yearly"];
function isRepeatPreset(value2) {
  return REPEAT_PRESETS.includes(value2);
}
var LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
var LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
function isLocalDate(value2) {
  if (typeof value2 !== "string" || !LOCAL_DATE.test(value2)) return false;
  const parsed = /* @__PURE__ */ new Date(`${value2}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value2;
}
function isLocalTime(value2) {
  return typeof value2 === "string" && LOCAL_TIME.test(value2);
}

// src/domain/schedule/scheduleQueries.ts
function scheduleSpan(schedule) {
  if (schedule.dueDate === null) {
    return schedule.startDate === null ? null : { start: schedule.startDate, end: schedule.startDate };
  }
  if (schedule.startDate === null) return { start: schedule.dueDate, end: schedule.dueDate };
  return schedule.startDate <= schedule.dueDate ? { start: schedule.startDate, end: schedule.dueDate } : { start: schedule.dueDate, end: schedule.startDate };
}
function isTimed(schedule) {
  return schedule.startTime !== null;
}
function isOverdue(schedule, today) {
  const span = scheduleSpan(schedule);
  return span !== null && span.end < today;
}

// src/domain/schedule/reminders.ts
var ALL_DAY_REMINDER_TIME = "09:00";
var MINUTES_PER_DAY = 1440;
var ALL_DAY_OFFERS = [
  { id: "on-day", offsetMinutes: 0, allDayTime: ALL_DAY_REMINDER_TIME },
  { id: "1d-9am", offsetMinutes: MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME },
  { id: "2d", offsetMinutes: 2 * MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME },
  { id: "1w", offsetMinutes: 7 * MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME }
];
var UNIT_MINUTES = {
  minute: 1,
  hour: 60,
  day: MINUTES_PER_DAY,
  week: 7 * MINUTES_PER_DAY
};
function specFromOffer(offer) {
  return {
    type: "relative",
    offsetMinutes: offer.offsetMinutes,
    absoluteAt: null,
    allDayTime: offer.allDayTime,
    enabled: true
  };
}
function sameReminder(a, b) {
  if (a.type !== b.type) return false;
  return a.type === "absolute" ? a.absoluteAt === b.absoluteAt : a.offsetMinutes === b.offsetMinutes && a.allDayTime === b.allDayTime;
}
function containsReminder(list, candidate) {
  return list.some((existing) => sameReminder(existing, candidate));
}
function parseAbsolute(value2) {
  if (!value2 || value2.length < 16 || value2[10] !== "T") return null;
  const date = value2.slice(0, 10);
  const time = value2.slice(11, 16);
  return isLocalDate(date) && isLocalTime(time) ? { date, time } : null;
}
function reconcileReminders(list, schedule) {
  if (schedule.startDate === null && schedule.dueDate === null) return [];
  const timed = isTimed(schedule);
  const out = [];
  for (const spec of list) {
    if (spec.type === "absolute") {
      out.push(spec);
      continue;
    }
    const offset = spec.offsetMinutes ?? 0;
    if (!timed && spec.allDayTime === null) {
      if (offset > 0 && offset % MINUTES_PER_DAY === 0) {
        out.push({ ...spec, allDayTime: ALL_DAY_REMINDER_TIME });
      }
      continue;
    }
    out.push(spec);
  }
  return out.reduce(
    (kept, spec) => containsReminder(kept, spec) ? kept : [...kept, spec],
    []
  );
}
function isReminderSpec(value2) {
  if (!value2 || typeof value2 !== "object") return false;
  const spec = value2;
  if (spec.type === "absolute") return parseAbsolute(spec.absoluteAt ?? null) !== null;
  if (spec.type !== "relative") return false;
  if (typeof spec.offsetMinutes !== "number" || spec.offsetMinutes < 0) return false;
  return spec.allDayTime === null || isLocalTime(spec.allDayTime ?? "");
}

// src/domain/schedule/reminder.ts
var PRESET_OFFERS = {
  "at-time": { id: "at-time", offsetMinutes: 0, allDayTime: null },
  "10m": { id: "10m", offsetMinutes: 10, allDayTime: null },
  "1h": { id: "1h", offsetMinutes: 60, allDayTime: null },
  "1d-9am": { id: "1d-9am", offsetMinutes: 1440, allDayTime: ALL_DAY_REMINDER_TIME }
};
function presetToSpec(preset) {
  const offer = PRESET_OFFERS[preset];
  return offer ? specFromOffer(offer) : null;
}

// src/domain/schedule/normalizeSchedule.ts
function normalizeSchedule(schedule) {
  let startDate = isLocalDate(schedule.startDate) ? schedule.startDate : null;
  let dueDate = isLocalDate(schedule.dueDate) ? schedule.dueDate : null;
  let startTime = isLocalTime(schedule.startTime) ? schedule.startTime : null;
  let endTime = isLocalTime(schedule.endTime) ? schedule.endTime : null;
  if (startDate !== null && dueDate === null) {
    dueDate = startDate;
    startDate = null;
  }
  if (startDate !== null && dueDate !== null && startDate > dueDate) {
    [startDate, dueDate] = [dueDate, startDate];
  }
  if (startDate !== null && startDate === dueDate) {
    startDate = null;
  }
  if (startDate === null && dueDate === null) {
    startTime = null;
    endTime = null;
  }
  if (startTime === null) {
    endTime = null;
  }
  const sameDay = startDate === null || startDate === dueDate;
  if (sameDay && startTime !== null && endTime !== null && endTime < startTime) {
    endTime = null;
  }
  const dated = startDate !== null || dueDate !== null;
  const repeat = dated && isRepeatPreset(schedule.repeat) ? schedule.repeat : "none";
  const core = {
    startDate,
    dueDate,
    startTime,
    endTime,
    timezone: typeof schedule.timezone === "string" && schedule.timezone ? schedule.timezone : null,
    repeat
  };
  const kept = (Array.isArray(schedule.reminders) ? schedule.reminders : []).filter(isReminderSpec);
  return { ...core, reminders: reconcileReminders(kept, { ...core, reminders: [] }) };
}

// src/domain/schedule/recurrence.ts
var WEEKDAY_NUMBERS = [1, 2, 3, 4, 5];
function isWeekdaySet(days) {
  const unique = [...new Set(days)].sort();
  return unique.length === 5 && unique.every((day, index) => day === WEEKDAY_NUMBERS[index]);
}
function repeatPresetFromTask(task) {
  switch (task.repeatType) {
    case "daily":
      return "daily";
    case "weekly":
      return isWeekdaySet(task.repeatDays ?? []) ? "weekdays" : "weekly";
    case "monthly":
      return "monthly";
    case "yearly":
      return "yearly";
    default:
      return "none";
  }
}

// src/domain/schedule/taskSchedule.ts
function value(raw) {
  return typeof raw === "string" && raw !== "" ? raw : null;
}
function min(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return a <= b ? a : b;
}
function max(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}
function classifyTaskSchedule(task) {
  const startDate = value(task.startDate);
  const scheduledDate = value(task.scheduledDate);
  const dueDate = value(task.dueDate);
  if (startDate !== null && scheduledDate !== null && scheduledDate !== startDate) return "widened";
  if (scheduledDate === null) {
    if (dueDate === null) return startDate === null ? "empty" : "canonical";
    return "canonical";
  }
  if (dueDate === null) return "scheduled-only";
  if (dueDate === scheduledDate) return "aligned";
  return "promoted";
}
function scheduleFromTask(task) {
  const startDate = value(task.startDate);
  const scheduledDate = value(task.scheduledDate);
  const dueDate = value(task.dueDate);
  const startTime = value(task.startTime);
  const endTime = value(task.endTime);
  const legacy = presetToSpec(task.reminder);
  const base = {
    // Always null, and that is a floor rather than a default: a Task record
    // has no zone field, and the write path back (`planScheduleUpdate`) has
    // nowhere to put one. So `Schedule.timezone` is a shape this type can
    // carry and this app never fills — which is why the schedule trigger
    // draws no zone (TASK_DETAIL_SCHEDULE_BODY_DESIGN.md §10): it would be
    // a label for a fact nothing stores. Giving tasks a zone is a data
    // change, and §5 puts it with the reminder scheduler that would be the
    // first thing to interpret it.
    timezone: null,
    reminders: task.reminders ?? (legacy ? [legacy] : []),
    repeat: repeatPresetFromTask(task)
  };
  switch (classifyTaskSchedule(task)) {
    case "empty":
      return normalizeSchedule({ ...base, startDate: null, dueDate: null, startTime: null, endTime: null });
    case "canonical":
      return normalizeSchedule({ ...base, startDate, dueDate, startTime, endTime });
    case "scheduled-only":
    case "aligned":
      return normalizeSchedule({ ...base, startDate: null, dueDate: scheduledDate, startTime, endTime });
    case "promoted":
      return normalizeSchedule({ ...base, startDate: scheduledDate, dueDate, startTime, endTime: null });
    case "widened": {
      const start = min(startDate, scheduledDate);
      const end = max(dueDate, scheduledDate);
      const keepsStart = start === scheduledDate;
      return normalizeSchedule({
        ...base,
        startDate: start,
        dueDate: end,
        startTime: keepsStart ? startTime : null,
        endTime: null
      });
    }
  }
}

// src/domain/tasks/taskState.ts
function isTrashed(task) {
  return Boolean(task.deletedAt);
}
function isWontDo(task) {
  return Boolean(task.wontDoAt) || task.status === "wont_do" || task.status === "archived";
}
function isCompleted(task) {
  return task.status === "completed" || task.status === "done";
}
function isTaskAlive(task) {
  return !isTrashed(task) && !isWontDo(task);
}
function isTaskOpen(task) {
  return isTaskAlive(task) && !isCompleted(task);
}
function isInProgress(task) {
  return task.status === "doing";
}
function isWaiting(task) {
  return task.status === "waiting";
}

// src/domain/schedule/scheduleFormatting.ts
var DATE_FORMAT = { month: "short", day: "numeric", timeZone: "UTC" };
var WITH_YEAR = { ...DATE_FORMAT, year: "numeric" };

// src/domain/backup/schedule.ts
var DEFAULT_BACKUP_KEEP = 7;
var DAY_MS = 24 * 60 * 60 * 1e3;
var PERIOD_MS = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS
};

// src/utils/calendarTime.ts
var HOURS_AT_A_TIME = 12;
var MIN_HOURS_AT_A_TIME = 6;
var MAX_HOURS_AT_A_TIME = 24;
var HOURS_AT_A_TIME_CHOICES = Array.from(
  { length: MAX_HOURS_AT_A_TIME - MIN_HOURS_AT_A_TIME + 1 },
  (_, index) => MIN_HOURS_AT_A_TIME + index
);

// src/domain/tasks/listColor.ts
var LIST_COLOR_PRESETS = [
  { key: "red", hex: "#e5484d" },
  { key: "orange", hex: "#f76b15" },
  { key: "yellow", hex: "#ffb224" },
  { key: "lime", hex: "#99d52a" },
  { key: "green", hex: "#30a46c" },
  { key: "blue", hex: "#0a84ff" },
  { key: "indigo", hex: "#5b5bd6" },
  { key: "purple", hex: "#8e4ec6" }
];
var HEX = /^#[0-9a-fA-F]{6}$/;
function parseListColor(stored) {
  const value2 = (stored ?? "").trim();
  if (!value2) return { kind: "none", stored: "", hex: "" };
  const preset = LIST_COLOR_PRESETS.find((entry) => entry.key === value2);
  if (preset) return { kind: "preset", stored: value2, hex: preset.hex };
  if (HEX.test(value2)) return { kind: "custom", stored: value2, hex: value2.toLowerCase() };
  return { kind: "none", stored: value2, hex: "" };
}
function listColorHex(stored) {
  return parseListColor(stored).hex;
}

// src/utils/date.ts
function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function todayValue() {
  return toDateInputValue(/* @__PURE__ */ new Date());
}
function addDays2(dateValue, days) {
  const date = /* @__PURE__ */ new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}
function daysBetween2(from, to) {
  const fromMs = (/* @__PURE__ */ new Date(`${from}T00:00:00`)).getTime();
  const toMs = (/* @__PURE__ */ new Date(`${to}T00:00:00`)).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  return Math.round((toMs - fromMs) / 864e5);
}

// src/domain/view/matrixGroups.ts
var MATRIX_QUADRANT_COLORS = LIST_COLOR_PRESETS.map((preset) => preset.key);

// src/domain/view/viewRules.ts
var EMPTY_RULE = {
  listIds: [],
  tagIds: [],
  dateBuckets: [],
  priorities: []
};
function priorityRule(priority) {
  return { ...EMPTY_RULE, priorities: [priority] };
}

// src/domain/view/matrixRules.ts
var DEFAULT_MATRIX_RULES = {
  I: priorityRule("high"),
  II: priorityRule("medium"),
  III: priorityRule("low"),
  IV: priorityRule("none")
};

// src/domain/tasks/scopeRegistry.ts
var LIST_ONLY = ["list"];
var ALL_VIEWS = ["list", "board", "gantt"];
var scopeRegistry = {
  today: {
    kind: "today",
    segment: "today",
    hasId: false,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    // §7.5 keeps free reorder out of the MVP so that dragging a due-only Task
    // cannot silently create a TodayPlan membership for it.
    canManualReorder: false,
    countMode: "active",
    createOwner: "inbox"
  },
  upcoming: {
    kind: "upcoming",
    segment: "upcoming",
    hasId: false,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: false,
    countMode: "active",
    createOwner: "inbox"
  },
  inbox: {
    kind: "inbox",
    segment: "inbox",
    hasId: false,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: true,
    countMode: "active",
    createOwner: "inbox"
  },
  list: {
    kind: "list",
    segment: "list",
    hasId: true,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: true,
    countMode: "active",
    createOwner: "currentList"
  },
  folder: {
    kind: "folder",
    segment: "folder",
    hasId: true,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: false,
    countMode: "active",
    createOwner: "requiresList"
  },
  tag: {
    kind: "tag",
    segment: "tag",
    hasId: true,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: false,
    countMode: "active",
    createOwner: "inbox"
  },
  filter: {
    kind: "filter",
    segment: "filter",
    hasId: true,
    allowedViews: ALL_VIEWS,
    defaultView: "list",
    canCreate: true,
    canManualReorder: false,
    countMode: "active",
    createOwner: "filterDefined"
  },
  completed: {
    kind: "completed",
    segment: "completed",
    hasId: false,
    allowedViews: LIST_ONLY,
    defaultView: "list",
    canCreate: false,
    canManualReorder: false,
    countMode: "completed",
    createOwner: "none"
  },
  // D-23. A terminal state beside completed and trashed, and the third of the
  // three the sidebar's bottom section offers.
  wontDo: {
    kind: "wontDo",
    segment: "wont-do",
    hasId: false,
    allowedViews: LIST_ONLY,
    defaultView: "list",
    canCreate: false,
    canManualReorder: false,
    countMode: "wontDo",
    createOwner: "none"
  },
  trash: {
    kind: "trash",
    segment: "trash",
    hasId: false,
    allowedViews: LIST_ONLY,
    defaultView: "list",
    canCreate: false,
    canManualReorder: false,
    countMode: "trash",
    createOwner: "none"
  }
};
var TASK_SCOPE_KINDS = Object.keys(scopeRegistry);

// src/domain/view/inboxColumnRules.ts
var DEFAULT_INBOX_COLUMN_RULES = {
  unsorted: { ...EMPTY_RULE, dateBuckets: ["none"] },
  scheduled: { ...EMPTY_RULE, dateBuckets: ["overdue", "today", "tomorrow", "later"] },
  someday: { ...EMPTY_RULE, dateBuckets: ["someday"] }
};

// src/domain/calendar/readableInk.ts
function channelLuminance(value2) {
  const c = value2 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function parseHex(hex) {
  const value2 = hex.trim().replace(/^#/, "");
  const full = value2.length === 3 ? value2.split("").map((char) => char + char).join("") : value2;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ];
}
function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channelLuminance);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const first2 = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first2 === null || second === null) return 1;
  return (Math.max(first2, second) + 0.05) / (Math.min(first2, second) + 0.05);
}
var BLOCK_INK_LIGHT = "#ffffff";
var WHITE_INK_TARGET = 5;
function toHsl([r, g, b]) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max2 = Math.max(red, green, blue);
  const min2 = Math.min(red, green, blue);
  const lightness = (max2 + min2) / 2;
  if (max2 === min2) return [0, 0, lightness];
  const delta = max2 - min2;
  const saturation = lightness > 0.5 ? delta / (2 - max2 - min2) : delta / (max2 + min2);
  let hue;
  if (max2 === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max2 === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [hue / 6, saturation, lightness];
}
function channelFromHue(p, q, t) {
  let value2 = t;
  if (value2 < 0) value2 += 1;
  if (value2 > 1) value2 -= 1;
  if (value2 < 1 / 6) return p + (q - p) * 6 * value2;
  if (value2 < 1 / 2) return q;
  if (value2 < 2 / 3) return p + (q - p) * (2 / 3 - value2) * 6;
  return p;
}
function fromHsl(hue, saturation, lightness) {
  let r;
  let g;
  let b;
  if (saturation === 0) {
    r = lightness;
    g = lightness;
    b = lightness;
  } else {
    const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    r = channelFromHue(p, q, hue + 1 / 3);
    g = channelFromHue(p, q, hue);
    b = channelFromHue(p, q, hue - 1 / 3);
  }
  return `#${[r, g, b].map((value2) => Math.round(value2 * 255).toString(16).padStart(2, "0")).join("")}`;
}
var darkened = /* @__PURE__ */ new Map();
function darkenForWhiteInk(hex, target = WHITE_INK_TARGET) {
  const cacheKey = `${hex}|${target}`;
  const cached = darkened.get(cacheKey);
  if (cached !== void 0) return cached;
  const remember = (value2) => {
    darkened.set(cacheKey, value2);
    return value2;
  };
  const rgb = parseHex(hex);
  if (!rgb) return remember(hex);
  if (contrastRatio(hex, BLOCK_INK_LIGHT) >= target) return remember(hex);
  const [hue, saturation, lightness] = toHsl(rgb);
  for (let next = lightness; next > 0.02; next -= 4e-3) {
    const candidate = fromHsl(hue, saturation, next);
    if (contrastRatio(candidate, BLOCK_INK_LIGHT) >= target) return remember(candidate);
  }
  return remember(fromHsl(hue, saturation, 0.02));
}

// src/domain/calendar/itemColor.ts
var DEFAULT_COLOR_BY = "list";
var PRIORITY_COLOR = {
  high: "#ff3b30",
  medium: "#ff9500",
  low: "#4772fa",
  none: "#8e8e93"
};
var NEUTRAL_LIST_COLOR = "#8e8e93";
function hashId(id) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function colorForList(list) {
  if (!list) return NEUTRAL_LIST_COLOR;
  const chosen = listColorHex(list.color);
  if (chosen) return chosen;
  if (list.kind === "inbox") return NEUTRAL_LIST_COLOR;
  return LIST_COLOR_PRESETS[hashId(list.id) % LIST_COLOR_PRESETS.length].hex;
}
function colorForTask({ colorBy, listId, priority, listsById: listsById2 }) {
  const raw = colorBy === "priority" ? PRIORITY_COLOR[priority ?? "none"] ?? PRIORITY_COLOR.none : colorForList(listsById2.get(listId));
  return darkenForWhiteInk(raw);
}

// src/domain/plannerData/normalize.ts
function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}
function detectDefaultLanguage() {
  const browserLanguage = typeof navigator !== "undefined" ? navigator.language : "";
  return browserLanguage?.toLowerCase().startsWith("ko") ? "ko" : "en";
}
var DEFAULT_APP_SETTINGS = {
  theme: "light",
  accentColor: "blue",
  fontSize: "medium",
  language: detectDefaultLanguage(),
  defaultView: "/today",
  showCompletedInToday: true,
  confirmBeforeDelete: true,
  timeFormat: "locale",
  weekStart: "sunday",
  hoursAtATime: HOURS_AT_A_TIME,
  focusDefaultMinutes: "auto",
  autoBackup: "off",
  autoBackupKeep: DEFAULT_BACKUP_KEEP,
  sidebarCollapsed: false,
  reduceMotion: false,
  timezone: detectTimezone(),
  aiModel: "",
  matrixHideCompleted: false
};

// src/server/errors.ts
var ServerError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "ServerError";
    this.code = code;
  }
};
function invalidArgument(message) {
  return new ServerError("INVALID_ARGUMENT", message);
}
function notFound() {
  return new ServerError("NOT_FOUND", "No such record.");
}

// src/server/data/repository.ts
var TABLE_TO_KEY = new Map(
  collectionTables.map(([key, table]) => [table, key])
);
function assertNotServiceRole(key) {
  const payload = key.split(".")[1];
  if (!payload) return;
  let role;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    role = decoded.role;
  } catch {
    return;
  }
  if (role === "service_role") {
    throw new Error(
      "The server data layer was given a service_role key. It bypasses RLS and must never reach a user-facing read."
    );
  }
}
function readSupabaseEnv(env = process.env) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set for the server data layer.");
  }
  assertNotServiceRole(anonKey);
  return { url, anonKey };
}

// src/integrations/google/state.ts
var NONCE = /^[a-f0-9]{16,64}$/i;
function decodeOAuthState(raw) {
  if (!raw) return null;
  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;
  const nonce = raw.slice(0, separator);
  const platform = raw.slice(separator + 1);
  if (!NONCE.test(nonce)) return null;
  if (platform !== "web" && platform !== "desktop") return null;
  return { nonce, platform };
}

// src/integrations/google/index.ts
function lazyVerifier() {
  let inner = null;
  return {
    async verify(bearer) {
      inner ??= supabaseTokenVerifier({ issuer: issuerFor(readSupabaseEnv().url) });
      return inner.verify(bearer);
    }
  };
}
var verifier = lazyVerifier();

// src/lib/ics/parse.ts
function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function unfoldIcsLines(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("	")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}
function unescapeIcsText(value2 = "") {
  return value2.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}
function getIcsValue(lines, name) {
  const property = getIcsProperty(lines, name);
  return property?.value ?? "";
}
function readIcsProperty(line) {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const params = /* @__PURE__ */ new Map();
  for (const part of head.split(";").slice(1)) {
    const equals = part.indexOf("=");
    if (equals < 0) continue;
    params.set(part.slice(0, equals).toUpperCase(), part.slice(equals + 1).replace(/^"|"$/g, ""));
  }
  return { value: line.slice(colon + 1), params };
}
function matchesProperty(line, name) {
  const upper = line.toUpperCase();
  return upper.startsWith(`${name}:`) || upper.startsWith(`${name};`);
}
function getIcsProperty(lines, name) {
  const prefix = name.toUpperCase();
  const line = lines.find((item) => matchesProperty(item, prefix));
  return line ? readIcsProperty(line) : null;
}
function getIcsProperties(lines, name) {
  const prefix = name.toUpperCase();
  return lines.filter((item) => matchesProperty(item, prefix)).map(readIcsProperty).filter((item) => item !== null);
}
function parseIcsDate(value2, timezone) {
  if (!value2) return null;
  if (/^\d{8}$/.test(value2)) {
    return { value: `${value2.slice(0, 4)}-${value2.slice(4, 6)}-${value2.slice(6, 8)}`, allDay: true, timezone: void 0 };
  }
  const match = value2.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00", z] = match;
  const iso = z ? (/* @__PURE__ */ new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)).toISOString() : `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  return { value: iso, allDay: false, timezone };
}
function pad2(value2) {
  return String(value2).padStart(2, "0");
}
function localDateTimeParts(value2, timezone, fallbackTimezone) {
  if (!value2.includes("T")) return { date: value2.slice(0, 10) };
  if (value2.endsWith("Z")) {
    const date = new Date(value2);
    const zone = timezone || fallbackTimezone;
    if (zone) {
      try {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: zone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          hourCycle: "h23"
        }).formatToParts(date).reduce((acc, part) => {
          if (part.type !== "literal") acc[part.type] = part.value;
          return acc;
        }, {});
        return {
          date: `${parts.year}-${parts.month}-${parts.day}`,
          time: `${parts.hour}:${parts.minute}`
        };
      } catch {
      }
    }
    return {
      date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
      time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    };
  }
  return { date: value2.slice(0, 10), time: value2.slice(11, 16) };
}
function parseRRule(value2, timezone) {
  if (!value2) return null;
  const parts = /* @__PURE__ */ new Map();
  for (const chunk of value2.split(";")) {
    const equals = chunk.indexOf("=");
    if (equals < 0) continue;
    parts.set(chunk.slice(0, equals).trim().toUpperCase(), chunk.slice(equals + 1).trim());
  }
  const freq = parts.get("FREQ")?.toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") return null;
  if (parts.has("BYSETPOS")) return null;
  const interval = Number.parseInt(parts.get("INTERVAL") ?? "1", 10);
  const count = parts.has("COUNT") ? Number.parseInt(parts.get("COUNT") ?? "", 10) : void 0;
  const byDay = parts.get("BYDAY")?.split(",").map((day) => day.trim().toUpperCase()).filter((day) => /^(MO|TU|WE|TH|FR|SA|SU)$/.test(day));
  const byMonthDay = parts.get("BYMONTHDAY")?.split(",").map((day) => Number.parseInt(day.trim(), 10)).filter((day) => Number.isInteger(day) && day >= 1 && day <= 31);
  return {
    freq,
    interval: Number.isInteger(interval) && interval > 0 ? interval : 1,
    count: Number.isInteger(count) && count > 0 ? count : void 0,
    // Normalised here rather than carried raw, so nothing downstream has to
    // know that UNTIL comes in two shapes.
    until: parseIcsDate(parts.get("UNTIL") ?? "", timezone)?.value,
    byDay: byDay?.length ? byDay : void 0,
    byMonthDay: byMonthDay?.length ? byMonthDay : void 0
  };
}
function parseIcsEvents(text, calendarId) {
  const lines = unfoldIcsLines(text);
  const calendarTimezone = getIcsValue(lines, "X-WR-TIMEZONE") || getIcsValue(lines, "TZID") || void 0;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const events = [];
  let block = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      block = [];
      continue;
    }
    if (line === "END:VEVENT" && block) {
      const uid = getIcsValue(block, "UID") || createId("ics-event");
      const startProperty = getIcsProperty(block, "DTSTART");
      const startTimezone = startProperty?.params.get("TZID") || calendarTimezone;
      const start = parseIcsDate(startProperty?.value ?? "", startTimezone);
      if (!start) {
        block = null;
        continue;
      }
      const endProperty = getIcsProperty(block, "DTEND");
      const endTimezone = endProperty?.params.get("TZID") || start.timezone;
      const end = parseIcsDate(endProperty?.value ?? "", endTimezone);
      const recurrence = parseRRule(getIcsValue(block, "RRULE"), startTimezone);
      const exdates = getIcsProperties(block, "EXDATE").flatMap(
        (property) => property.value.split(",").map((item) => parseIcsDate(item.trim(), property.params.get("TZID") || startTimezone)?.value).filter((item) => Boolean(item))
      );
      const recurrenceIdProperty = getIcsProperty(block, "RECURRENCE-ID");
      const recurrenceId = recurrenceIdProperty ? parseIcsDate(recurrenceIdProperty.value, recurrenceIdProperty.params.get("TZID") || startTimezone)?.value : void 0;
      events.push({
        // A repeating event's occurrences all share this id until
        // `./recurrence` gives each its own; an edited occurrence would
        // otherwise collide with its own master, which is a bug this file
        // inherited rather than introduced.
        id: `${calendarId}:${uid}`,
        externalCalendarId: calendarId,
        externalUid: uid,
        title: unescapeIcsText(getIcsValue(block, "SUMMARY")) || "Untitled event",
        description: unescapeIcsText(getIcsValue(block, "DESCRIPTION")),
        location: unescapeIcsText(getIcsValue(block, "LOCATION")),
        start: start.value,
        end: end?.value,
        allDay: start.allDay,
        timezone: start.timezone,
        sourceUrl: getIcsValue(block, "URL"),
        readOnly: true,
        createdAt: now,
        updatedAt: now,
        ...recurrence ? { recurrence } : {},
        ...exdates.length ? { exdates } : {},
        ...recurrenceId ? { recurrenceId } : {}
      });
      block = null;
      continue;
    }
    if (block) block.push(line);
  }
  return events;
}
function externalEventDate(event, viewerTimezone) {
  return localDateTimeParts(event.start, event.timezone, viewerTimezone).date;
}
function externalEventEndDate(event, viewerTimezone) {
  return event.end ? localDateTimeParts(event.end, event.timezone, viewerTimezone).date : void 0;
}
function externalEventStartTime(event, viewerTimezone) {
  return event.allDay ? void 0 : localDateTimeParts(event.start, event.timezone, viewerTimezone).time;
}
function externalEventEndTime(event, viewerTimezone) {
  return event.allDay || !event.end ? void 0 : localDateTimeParts(event.end, event.timezone, viewerTimezone).time;
}

// src/server/net/icsFetch.ts
var MAX_ICS_BYTES = 5e6;
var ICS_TIMEOUT_MS = 8e3;
function isBlockedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local")) return true;
  if (host.includes(":") || host.startsWith("[")) return true;
  return /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host);
}
function normalizeIcsUrl(raw) {
  let target;
  try {
    target = new URL(String(raw).replace(/^webcal:\/\//i, "https://"));
  } catch {
    return null;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  if (isBlockedHost(target.hostname)) return null;
  return target;
}
var IcsFetchError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "IcsFetchError";
  }
};
async function fetchIcsText(url, options = {}) {
  const { timeoutMs = ICS_TIMEOUT_MS, maxBytes = MAX_ICS_BYTES, fetchImpl = fetch } = options;
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "FocusFlow-Calendar/1.0 (+ics-sync)",
        Accept: "text/calendar, text/plain, */*"
      }
    });
  } catch (error) {
    throw new IcsFetchError(
      error instanceof Error && error.name === "TimeoutError" ? "Calendar request timed out." : "Calendar request failed."
    );
  }
  if (!response.ok) throw new IcsFetchError(`Calendar returned HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > maxBytes) throw new IcsFetchError("Calendar feed is too large.");
  if (!text.toUpperCase().includes("BEGIN:VCALENDAR")) {
    throw new IcsFetchError("That URL did not return a calendar.");
  }
  return text;
}

// src/server/data/calendar/icsSource.ts
var CACHE_TTL_MS = 5 * 60 * 1e3;
var MAX_SUBSCRIPTIONS = 5;
var TOTAL_BUDGET_MS = 12e3;
var cache = /* @__PURE__ */ new Map();
async function loadExternalEvents(calendars, options = {}) {
  const { now = /* @__PURE__ */ new Date(), cacheTtlMs = CACHE_TTL_MS, ...fetchOptions } = options;
  const enabled = calendars.filter((calendar) => calendar.enabled).slice(0, MAX_SUBSCRIPTIONS);
  if (enabled.length === 0) {
    return { events: [], statuses: [], partial: false };
  }
  const deadline = now.getTime() + TOTAL_BUDGET_MS;
  const settled = await Promise.all(
    enabled.map(async (calendar) => {
      const cached = cache.get(calendar.icsUrl);
      if (cached && now.getTime() - cached.fetchedAt < cacheTtlMs) {
        return {
          events: cached.events,
          status: {
            name: calendar.name,
            ok: true,
            eventCount: cached.events.length,
            fetchedAt: new Date(cached.fetchedAt).toISOString()
          }
        };
      }
      const url = normalizeIcsUrl(calendar.icsUrl);
      if (!url) {
        return { events: [], status: { name: calendar.name, ok: false, error: "That subscription URL is not allowed." } };
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return { events: [], status: { name: calendar.name, ok: false, error: "Ran out of time before this calendar." } };
      }
      try {
        const text = await fetchIcsText(url, {
          ...fetchOptions,
          timeoutMs: Math.min(fetchOptions.timeoutMs ?? Number.POSITIVE_INFINITY, remaining)
        });
        const events = parseIcsEvents(text, calendar.id);
        const fetchedAt = Date.now();
        cache.set(calendar.icsUrl, { events, fetchedAt });
        return {
          events,
          status: {
            name: calendar.name,
            ok: true,
            eventCount: events.length,
            fetchedAt: new Date(fetchedAt).toISOString()
          }
        };
      } catch (error) {
        return {
          events: [],
          status: {
            name: calendar.name,
            ok: false,
            // An IcsFetchError says something a person can act on. Anything
            // else is ours to keep: an internal stack tells the user nothing
            // and tells an attacker something.
            error: error instanceof IcsFetchError ? error.message : "That calendar could not be read."
          }
        };
      }
    })
  );
  return {
    events: settled.flatMap((entry) => entry.events),
    statuses: settled.map((entry) => entry.status),
    partial: settled.some((entry) => !entry.status.ok)
  };
}

// src/server/data/context.ts
function partsIn(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return parts;
}
function todayIn(now, timezone) {
  const parts = partsIn(now, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function timeIn(now, timezone) {
  const parts = partsIn(now, timezone);
  return `${parts.hour}:${parts.minute}`;
}
var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dayOfWeekIn(now, timezone) {
  const [year, month, day] = todayIn(now, timezone).split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}
function zoneOffsetMinutes(now, timezone) {
  const parts = partsIn(now, timezone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - now.getTime()) / 6e4);
}
function zonedIsoString(now, timezone) {
  const parts = partsIn(now, timezone);
  const offset = zoneOffsetMinutes(now, timezone);
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  const hh = String(Math.floor(absolute / 60)).padStart(2, "0");
  const mm = String(absolute % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
}
function minutesOfDay(time) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return void 0;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 24 || minutes > 59) return void 0;
  return hours * 60 + minutes;
}

// src/server/mcp/args.ts
function rejectUnknown(args, allowed) {
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw invalidArgument(`Unknown argument${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Accepted: ${allowed.join(", ")}.`);
  }
}
function optionalString(args, field) {
  const value2 = args[field];
  if (value2 === void 0 || value2 === null) return void 0;
  if (typeof value2 !== "string") throw invalidArgument(`${field} must be a string.`);
  const trimmed = value2.trim();
  return trimmed || void 0;
}
function requiredString(args, field) {
  const value2 = optionalString(args, field);
  if (!value2) throw invalidArgument(`${field} is required.`);
  return value2;
}
function optionalBoolean(args, field) {
  const value2 = args[field];
  if (value2 === void 0 || value2 === null) return void 0;
  if (typeof value2 !== "boolean") throw invalidArgument(`${field} must be true or false.`);
  return value2;
}
function optionalInteger(args, field, min2, max2) {
  const value2 = args[field];
  if (value2 === void 0 || value2 === null) return void 0;
  if (typeof value2 !== "number" || !Number.isInteger(value2)) {
    throw invalidArgument(`${field} must be a whole number.`);
  }
  if (value2 < min2 || value2 > max2) throw invalidArgument(`${field} must be between ${min2} and ${max2}.`);
  return value2;
}
function optionalEnum(args, field, allowed) {
  const value2 = optionalString(args, field);
  if (value2 === void 0) return void 0;
  if (!allowed.includes(value2)) {
    throw invalidArgument(`${field} must be one of: ${allowed.join(", ")}.`);
  }
  return value2;
}
function optionalDate(args, field) {
  const value2 = optionalString(args, field);
  if (value2 === void 0) return void 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value2)) throw invalidArgument(`${field} must be a date like 2026-08-28.`);
  return value2;
}
function requiredDate(args, field) {
  const value2 = optionalDate(args, field);
  if (!value2) throw invalidArgument(`${field} is required, as a date like 2026-08-28.`);
  return value2;
}
function optionalTime(args, field) {
  const value2 = optionalString(args, field);
  if (value2 === void 0) return void 0;
  if (!/^\d{2}:\d{2}$/.test(value2)) throw invalidArgument(`${field} must be a time like 09:00.`);
  return value2;
}
function optionalStringArray(args, field, allowed) {
  const value2 = args[field];
  if (value2 === void 0 || value2 === null) return void 0;
  if (!Array.isArray(value2)) throw invalidArgument(`${field} must be an array.`);
  for (const entry of value2) {
    if (typeof entry !== "string" || !allowed.includes(entry)) {
      throw invalidArgument(`${field} may only contain: ${allowed.join(", ")}.`);
    }
  }
  return value2;
}

// src/server/mcp/registry.ts
var FRESHNESS_NOTE = 'Every answer carries meta.freshness. When staleness is "stale", say how long ago the account last synced before answering; when it is "unknown", say the data may be incomplete.';
function describe(text) {
  return `${text} ${FRESHNESS_NOTE}`;
}
function createRegistry(tools) {
  const registry = /* @__PURE__ */ new Map();
  for (const tool of tools) {
    if (registry.has(tool.name)) throw new Error(`Two tools are called ${tool.name}.`);
    registry.set(tool.name, tool);
  }
  return registry;
}

// src/server/mcp/handler.ts
var MAX_RESULT_BYTES = 256 * 1024;

// src/domain/schedule/freeTime.ts
function mergeSpans(spans) {
  const valid = spans.filter((span) => span.end > span.start).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const span of valid) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}
function freeSpans(busy, dayStart, dayEnd, minimumMinutes = 0) {
  if (dayEnd <= dayStart) return [];
  const free = [];
  let cursor = dayStart;
  for (const span of mergeSpans(busy)) {
    if (span.end <= dayStart) continue;
    if (span.start >= dayEnd) break;
    const start = Math.max(span.start, dayStart);
    if (start > cursor) free.push({ start: cursor, end: start });
    cursor = Math.max(cursor, Math.min(span.end, dayEnd));
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
  return free.filter((span) => span.end - span.start >= minimumMinutes);
}
function freeMinutesFrom(busy, fromMinute, dayEnd) {
  for (const span of mergeSpans(busy)) {
    if (span.start <= fromMinute && span.end > fromMinute) return void 0;
    if (span.start > fromMinute) return Math.max(0, Math.min(span.start, dayEnd) - fromMinute);
  }
  return Math.max(0, dayEnd - fromMinute);
}
function formatMinuteSpan(minute) {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minute)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

// src/domain/focus/selectors.ts
function focusSessionStartOf(session) {
  return session.startedAt || session.startAt;
}

// src/domain/tasks/dependencies.ts
function isBlockerResolved(blocker) {
  return !blocker || !isTaskOpen(blocker);
}
function isTaskBlocked(task, taskById) {
  if (!task.blockedByTaskId) return false;
  const blocker = taskById.get(task.blockedByTaskId);
  if (!blocker) return false;
  return !isBlockerResolved(blocker);
}
function taskMap(tasks) {
  return new Map(tasks.map((task) => [task.id, task]));
}
function blockedTaskIds(tasks) {
  const byId = taskMap(tasks);
  const blocked = /* @__PURE__ */ new Set();
  for (const task of tasks) {
    if (isTaskBlocked(task, byId)) blocked.add(task.id);
  }
  return blocked;
}

// src/domain/tasks/children.ts
function childrenOf(taskId, tasks, subtasks) {
  if (!taskId) return [];
  const children = [];
  for (const task of tasks) {
    if (task.parentTaskId !== taskId || task.deletedAt) continue;
    children.push({
      kind: "task",
      id: task.id,
      title: task.title,
      done: isCompleted(task),
      task
    });
  }
  for (const subtask of subtasks) {
    if (subtask.taskId !== taskId) continue;
    children.push({ kind: "legacy", id: subtask.id, title: subtask.title, done: subtask.completed, subtask });
  }
  return children;
}
function childProgress(children) {
  return { done: children.filter((child) => child.done).length, total: children.length };
}

// src/server/data/projections.ts
var TEXT_CAP = 4e3;
function projectionContext(input) {
  const tasks = input.tasks ?? [];
  return {
    today: input.today,
    tasks,
    taskById: new Map(tasks.map((task) => [task.id, task])),
    listById: new Map((input.lists ?? []).map((list) => [list.id, list])),
    projectById: new Map((input.projects ?? []).map((project) => [project.id, project])),
    subtasks: input.subtasks ?? [],
    checkItems: input.checkItems ?? []
  };
}
function publicStatus(task) {
  if (isCompleted(task)) return "completed";
  if (isWontDo(task)) return "wont_do";
  return "open";
}
function projectTask(task, ctx) {
  const status = publicStatus(task);
  const schedule = scheduleFromTask(task);
  const listName = task.listId ? ctx.listById.get(task.listId)?.name : void 0;
  const projectName = task.projectId ? ctx.projectById.get(task.projectId)?.name : void 0;
  const progress = progressOf(task, ctx);
  const summary = {
    id: task.id,
    title: task.title,
    status,
    priority: task.priority,
    // Overdue is a question about unfinished work: a task completed late is
    // not overdue, it is done.
    isOverdue: status === "open" && isOverdue(schedule, ctx.today),
    isBlocked: isTaskBlocked(task, ctx.taskById)
  };
  if (task.dueDate) {
    summary.dueDate = task.dueDate;
    summary.daysUntilDue = daysBetween2(ctx.today, task.dueDate);
  }
  if (task.startDate) summary.startDate = task.startDate;
  if (task.startTime) summary.startTime = task.startTime;
  if (task.endTime) summary.endTime = task.endTime;
  if (task.estimatedMinutes > 0) summary.estimatedMinutes = task.estimatedMinutes;
  if (listName) summary.listName = listName;
  if (projectName) summary.projectName = projectName;
  if (task.tags.length > 0) summary.tags = [...task.tags];
  if (progress) summary.progress = progress;
  return summary;
}
function progressOf(task, ctx) {
  if (task.contentMode === "checklist") {
    const items = checkItemsForTask(task.id, ctx.checkItems);
    if (items.length === 0) return void 0;
    return { done: items.filter((item) => item.checked).length, total: items.length };
  }
  const children = childrenOf(task.id, ctx.tasks, ctx.subtasks);
  if (children.length === 0) return void 0;
  const progress = childProgress(children);
  return { done: progress.done, total: progress.total };
}
function projectTaskDetail(task, ctx) {
  const summary = projectTask(task, ctx);
  const description = capText(task.description);
  const notes = capText(task.notes);
  const blocker = task.blockedByTaskId ? ctx.taskById.get(task.blockedByTaskId) : void 0;
  const detail = {
    ...summary,
    contentMode: task.contentMode === "checklist" ? "checklist" : "description",
    subtasks: ctx.subtasks.filter((subtask) => subtask.taskId === task.id).map((subtask) => ({ id: subtask.id, title: subtask.title, completed: subtask.completed })),
    checklist: checkItemsForTask(task.id, ctx.checkItems).map((item) => ({
      id: item.id,
      title: item.text,
      completed: item.checked
    })),
    blocking: ctx.tasks.filter((other) => other.blockedByTaskId === task.id).map((other) => ({ id: other.id, title: other.title })),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
  if (description.text) detail.description = description.text;
  if (notes.text) detail.notes = notes.text;
  if (description.truncated || notes.truncated) detail.textTruncated = true;
  if (task.repeatType && task.repeatType !== "none") {
    detail.recurrence = {
      type: task.repeatType,
      interval: task.repeatInterval > 0 ? task.repeatInterval : 1,
      ...task.repeatDays.length > 0 ? { days: [...task.repeatDays] } : {},
      ...task.repeatEndDate ? { endDate: task.repeatEndDate } : {}
    };
  }
  if (blocker) {
    detail.blockedBy = { id: blocker.id, title: blocker.title, resolved: publicStatus(blocker) !== "open" };
  }
  if (task.reminder) detail.reminder = task.reminder;
  if (task.completedAt) detail.completedAt = task.completedAt;
  return detail;
}
function capText(value2) {
  const text = value2 ?? "";
  if (text.length <= TEXT_CAP) return { text, truncated: false };
  return { text: text.slice(0, TEXT_CAP), truncated: true };
}

// src/domain/tasks/scopeIndex.ts
var listCache = /* @__PURE__ */ new WeakMap();
var tagCache = /* @__PURE__ */ new WeakMap();
var planCache = /* @__PURE__ */ new WeakMap();
function listsById(lists) {
  const cached = listCache.get(lists);
  if (cached) return cached;
  const index = new Map(lists.map((list) => [list.id, list]));
  listCache.set(lists, index);
  return index;
}
function tagIdsByTask(links) {
  const cached = tagCache.get(links);
  if (cached) return cached;
  const index = /* @__PURE__ */ new Map();
  for (const link of links) {
    const existing = index.get(link.taskId);
    if (existing) existing.add(link.tagId);
    else index.set(link.taskId, /* @__PURE__ */ new Set([link.tagId]));
  }
  tagCache.set(links, index);
  return index;
}
function planDatesByTask(plans) {
  const cached = planCache.get(plans);
  if (cached) return cached;
  const index = /* @__PURE__ */ new Map();
  for (const plan of plans) {
    const existing = index.get(plan.taskId);
    if (existing) existing.add(plan.planDate);
    else index.set(plan.taskId, /* @__PURE__ */ new Set([plan.planDate]));
  }
  planCache.set(plans, index);
  return index;
}

// src/domain/tasks/scopeQuery.ts
function effectiveDueDate(task) {
  return task.dueDate || "";
}
function isTaskActive(task, lists) {
  if (!isTaskAlive(task)) return false;
  const listId = listIdFor(task, lists);
  if (!listId) return true;
  const owner = listsById(lists).get(listId);
  return !owner || !owner.archivedAt && !owner.deletedAt;
}
function isActive(task, lists, finished = false) {
  return isTaskActive(task, lists) && (finished || !isCompleted(task));
}
function hasTodayPlan(task, dailyPlans, date) {
  return planDatesByTask(dailyPlans).get(task.id)?.has(date) ?? false;
}
function ownerList(task, lists) {
  const listId = listIdFor(task, lists);
  return listId ? listsById(lists).get(listId) : void 0;
}
function hasTag(task, tagId, links) {
  if (tagIdsByTask(links).get(task.id)?.has(tagId)) return true;
  return task.tags.some((name) => isUserTag(name) && tagIdFor(name) === tagId);
}
function matchesScope(task, scope, ctx, opts = {}) {
  if (task.parentTaskId && scope.kind !== "trash") return false;
  switch (scope.kind) {
    // §12.12 and §12.13 are the two Scopes the `active` precondition does not
    // apply to — they exist to show exactly what it excludes.
    case "trash":
      return Boolean(task.deletedAt);
    case "completed":
      return !task.deletedAt && (isCompleted(task) || isWontDo(task));
    case "wontDo":
      return !task.deletedAt && isWontDo(task);
    // §12.5.1. Today is NOT `dueDate == today`: it is overdue, plus due today,
    // plus anything explicitly planned for today — and a future task with a
    // plan comes in WITHOUT its due date being changed.
    //
    // "Has it started?" is the span's question after the consolidation (audit
    // §6, 1-e). A schedule whose first day has arrived is today's, whether
    // that day is its only one or the start of a range, and it stays today's
    // once the last day has passed — which is what makes overdue part of
    // Today rather than a bucket beside it.
    case "today": {
      if (!isActive(task, ctx.lists, opts.finished)) return false;
      const span = scheduleSpan(scheduleFromTask(task));
      if (span !== null && span.start <= ctx.today) return true;
      return hasTodayPlan(task, ctx.dailyPlans, ctx.today);
    }
    // §12.6. Overdue belongs to Today, not here, and a plan alone does not put
    // a task on a horizon that is made of dates.
    case "upcoming": {
      if (!isActive(task, ctx.lists, opts.finished)) return false;
      const due = effectiveDueDate(task);
      if (!due) return false;
      return due >= ctx.today && due <= addDays2(ctx.today, 6);
    }
    // §12.7. Membership is the owning List's kind, not `status === "inbox"`:
    // that status is the leg Migration Phase 2 replaced.
    case "inbox":
      return isActive(task, ctx.lists, opts.finished) && ownerList(task, ctx.lists)?.kind === "inbox";
    case "list":
      return isActive(task, ctx.lists, opts.finished) && listIdFor(task, ctx.lists) === scope.id;
    // §12.4 asks for `task.list.sidebarFolderId`, and §6.36 lets the sidebar's
    // grouping and the domain Folder be true at once. `folderIdFor` is the one
    // place that decides between them, so the group in the sidebar and the
    // Scope its header opens cannot come to disagree.
    case "folder": {
      const list = ownerList(task, ctx.lists);
      return isActive(task, ctx.lists, opts.finished) && !!list && folderIdFor(list) === scope.id;
    }
    case "tag":
      return isActive(task, ctx.lists, opts.finished) && hasTag(task, scope.id, ctx.taskTags);
    // §12.11. A Filter's baseline is the Scope's, not the spec's: active and
    // not finished, because Completed and Trash are the Scopes that show
    // those. A Filter naming no record — deleted, or written by a client this
    // one cannot read — matches nothing rather than everything.
    case "filter": {
      const saved = ctx.savedFilters?.find((filter) => filter.id === scope.id);
      if (!saved || !isActive(task, ctx.lists, opts.finished)) return false;
      return matchesFilterSpec(task, saved.spec, { lists: ctx.lists, taskTags: ctx.taskTags, today: ctx.today });
    }
  }
}

// src/utils/todayView.ts
var TODAY_SCOPE = { kind: "today" };
function parseTimeToMinutes(value2) {
  if (!/^\d{1,2}:\d{2}/.test(value2)) return void 0;
  const [h, m] = value2.split(":").map((part) => Number(part));
  if (Number.isNaN(h) || Number.isNaN(m)) return void 0;
  return h * 60 + m;
}
function isTodayTask(task, ctx) {
  return matchesScope(task, TODAY_SCOPE, ctx);
}
function completedOn(tasks, date) {
  return tasks.filter(
    (task) => !task.deletedAt && !task.parentTaskId && isCompleted(task) && task.completedAt.slice(0, 10) === date
  );
}
function defaultBucketFor(task, today, blocked = false) {
  if (task.dueDate && task.dueDate < today) return "now";
  if (blocked) return "later";
  if (isInProgress(task)) return "now";
  if (task.priority === "high" && task.dueDate === today) return "now";
  if (isWaiting(task)) return "later";
  if ((task.priority === "low" || task.priority === "none") && task.dueDate !== today) {
    return "later";
  }
  return "next";
}
function reasonFor(task, today, blocked = false) {
  if (task.dueDate && task.dueDate < today && !isCompleted(task)) return "overdue";
  if (blocked) return "blocked";
  if (isInProgress(task)) return "progress";
  if (isWaiting(task)) return "waiting";
  if (task.priority === "high") return "high";
  if (task.priority === "medium") return "medium";
  if (task.priority === "low") return "low";
  return "none";
}
var NO_DUE_DATE = "9999-12-31";
function compareTodayEntries(a, b) {
  const aStart = parseTimeToMinutes(a.task.startTime);
  const bStart = parseTimeToMinutes(b.task.startTime);
  if (aStart !== void 0 && bStart !== void 0 && aStart !== bStart) return aStart - bStart;
  if (aStart !== void 0 && bStart === void 0) return -1;
  if (aStart === void 0 && bStart !== void 0) return 1;
  const aDue = a.task.dueDate || NO_DUE_DATE;
  const bDue = b.task.dueDate || NO_DUE_DATE;
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  return a.task.createdAt.localeCompare(b.task.createdAt);
}
function collectTodayEntries(ctx, overrides, today = ctx.today || todayValue()) {
  const tasks = ctx.tasks;
  const entries = [];
  const blockedIds = blockedTaskIds(tasks);
  for (const task of tasks) {
    if (!isTodayTask(task, ctx)) continue;
    const blocked = blockedIds.has(task.id);
    const defaultBucket = defaultBucketFor(task, today, blocked);
    entries.push({
      task,
      defaultBucket,
      bucket: overrides[task.id] ?? defaultBucket,
      reason: reasonFor(task, today, blocked),
      completed: isCompleted(task)
    });
  }
  for (const task of completedOn(tasks, today)) {
    entries.push({
      task,
      defaultBucket: defaultBucketFor(task, today),
      bucket: overrides[task.id] ?? defaultBucketFor(task, today),
      reason: reasonFor(task, today, false),
      completed: true
    });
  }
  entries.sort(compareTodayEntries);
  return entries;
}
var TIME_RAIL_START = 8 * 60;
var TIME_RAIL_END = 19 * 60;

// src/domain/view/item.ts
function folderMap(lists) {
  const map = /* @__PURE__ */ new Map();
  for (const list of lists) {
    if (list.folderId) map.set(list.id, list.folderId);
  }
  return map;
}
function projectItems(input) {
  const { tasks, lists, tags = [], taskTags = [] } = input;
  const folders = folderMap(lists);
  const blocked = blockedTaskIds(tasks);
  const items = [];
  for (const task of tasks) {
    if (task.deletedAt) continue;
    const taskListId = listIdFor(task, lists);
    items.push({
      key: `task:${task.id}`,
      source: "task",
      sourceId: task.id,
      parentId: task.parentTaskId,
      title: task.title,
      listId: taskListId,
      folderId: folders.get(taskListId) ?? "",
      startDate: task.startDate,
      dueDate: task.dueDate,
      startTime: task.startTime,
      endTime: task.endTime,
      priority: task.priority,
      done: isCompleted(task),
      blocked: blocked.has(task.id),
      tags: tagNamesForTask(task, tags, taskTags),
      estimatedMinutes: task.estimatedMinutes,
      actualSeconds: task.actualSeconds
    });
  }
  return items;
}

// src/lib/ics/recurrence.ts
var MAX_OCCURRENCES_PER_EVENT = 400;
var WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
function toUtcDate(dateValue) {
  return /* @__PURE__ */ new Date(`${dateValue}T00:00:00Z`);
}
function toDateValue(date) {
  return date.toISOString().slice(0, 10);
}
function addDays3(dateValue, days) {
  const date = toUtcDate(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateValue(date);
}
function addMonths(dateValue, months) {
  const date = toUtcDate(dateValue);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (day > lastDay) return "";
  date.setUTCDate(day);
  return toDateValue(date);
}
function weekdayCodeOf(dateValue) {
  return WEEKDAY_CODES[toUtcDate(dateValue).getUTCDay()];
}
function baseDateOf(event, viewerTimezone) {
  return localDateTimeParts(event.start, event.timezone, viewerTimezone).date;
}
function spanDaysOf(event, viewerTimezone) {
  if (!event.end) return 0;
  const start = baseDateOf(event, viewerTimezone);
  const end = localDateTimeParts(event.end, event.timezone, viewerTimezone).date;
  const delta = Math.round((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 864e5);
  return Number.isFinite(delta) && delta > 0 ? delta : 0;
}
function occurrenceAt(event, dateValue, spanDays, viewerTimezone) {
  if (event.allDay) {
    return {
      start: dateValue,
      end: event.end ? addDays3(dateValue, Math.max(spanDays, 1)) : void 0
    };
  }
  const startTime = localDateTimeParts(event.start, event.timezone, viewerTimezone).time ?? "00:00";
  const endTime = event.end ? localDateTimeParts(event.end, event.timezone, viewerTimezone).time : void 0;
  return {
    start: `${dateValue}T${startTime}:00`,
    end: endTime ? `${addDays3(dateValue, spanDays)}T${endTime}:00` : void 0
  };
}
function occurrenceDates(rule, startDate, rangeEnd, untilDate) {
  const dates = [];
  const limit = rule.count ?? Number.POSITIVE_INFINITY;
  const stopAt = untilDate && untilDate < rangeEnd ? untilDate : rangeEnd;
  const full = () => dates.length >= limit || dates.length >= MAX_OCCURRENCES_PER_EVENT;
  if (rule.freq === "WEEKLY" && rule.byDay?.length) {
    let weekStart = addDays3(startDate, -toUtcDate(startDate).getUTCDay());
    for (let step = 0; step < MAX_OCCURRENCES_PER_EVENT && !full(); step += 1) {
      if (weekStart > stopAt) break;
      for (const code of WEEKDAY_CODES) {
        if (full()) break;
        if (!rule.byDay.includes(code)) continue;
        const candidate = addDays3(weekStart, WEEKDAY_CODES.indexOf(code));
        if (candidate < startDate || candidate > stopAt) continue;
        dates.push(candidate);
      }
      weekStart = addDays3(weekStart, 7 * rule.interval);
    }
    return dates;
  }
  const monthly = rule.freq === "MONTHLY" || rule.freq === "YEARLY";
  if (monthly && rule.byMonthDay?.length) {
    const monthStep = rule.freq === "YEARLY" ? 12 * rule.interval : rule.interval;
    const named = [...rule.byMonthDay].sort((a, b) => a - b);
    for (let step = 0; step < MAX_OCCURRENCES_PER_EVENT && !full(); step += 1) {
      const monthAnchor = addMonths(`${startDate.slice(0, 8)}01`, step * monthStep);
      if (!monthAnchor) continue;
      if (monthAnchor.slice(0, 7) > stopAt.slice(0, 7)) break;
      for (const day of named) {
        if (full()) break;
        const candidate = `${monthAnchor.slice(0, 8)}${String(day).padStart(2, "0")}`;
        if (toDateValue(toUtcDate(candidate)) !== candidate) continue;
        if (candidate < startDate || candidate > stopAt) continue;
        dates.push(candidate);
      }
    }
    return dates;
  }
  for (let step = 0; step < MAX_OCCURRENCES_PER_EVENT && !full(); step += 1) {
    let candidate;
    switch (rule.freq) {
      case "DAILY":
        candidate = addDays3(startDate, step * rule.interval);
        break;
      case "WEEKLY":
        candidate = addDays3(startDate, 7 * step * rule.interval);
        break;
      case "MONTHLY":
        candidate = addMonths(startDate, step * rule.interval);
        break;
      default:
        candidate = addMonths(startDate, 12 * step * rule.interval);
        break;
    }
    if (!candidate) continue;
    if (candidate > stopAt) break;
    if (rule.byDay?.length && !rule.byDay.includes(weekdayCodeOf(candidate))) continue;
    dates.push(candidate);
  }
  return dates;
}
function expandIcsOccurrences(events, range, options = {}) {
  const { viewerTimezone } = options;
  const overrides = /* @__PURE__ */ new Map();
  const masters = [];
  for (const event of events) {
    if (event.recurrenceId) {
      const date = localDateTimeParts(event.recurrenceId, event.timezone, viewerTimezone).date;
      overrides.set(`${event.externalCalendarId}:${event.externalUid}:${date}`, event);
      continue;
    }
    masters.push(event);
  }
  const expanded = [];
  for (const master of masters) {
    const startDate = baseDateOf(master, viewerTimezone);
    const spanDays = spanDaysOf(master, viewerTimezone);
    if (!master.recurrence) {
      const endDate = master.end ? localDateTimeParts(master.end, master.timezone, viewerTimezone).date : startDate;
      if (endDate >= range.from && startDate <= range.to) expanded.push(master);
      continue;
    }
    const until = master.recurrence.until ? localDateTimeParts(master.recurrence.until, master.timezone, viewerTimezone) : void 0;
    const untilDate = until?.date;
    const cancelled = new Set(
      (master.exdates ?? []).map((value2) => localDateTimeParts(value2, master.timezone, viewerTimezone).date)
    );
    for (const date of occurrenceDates(master.recurrence, startDate, range.to, untilDate)) {
      if (addDays3(date, spanDays) < range.from) continue;
      if (cancelled.has(date)) continue;
      if (until?.time && date === until.date) {
        const startTime = localDateTimeParts(master.start, master.timezone, viewerTimezone).time ?? "00:00";
        if (startTime > until.time) continue;
      }
      const key = `${master.externalCalendarId}:${master.externalUid}:${date}`;
      const override = overrides.get(key);
      if (override) {
        const movedTo = baseDateOf(override, viewerTimezone);
        if (movedTo >= range.from && movedTo <= range.to) {
          expanded.push({ ...override, id: key, occurrenceOf: master.externalUid });
        }
        continue;
      }
      const { start, end } = occurrenceAt(master, date, spanDays, viewerTimezone);
      expanded.push({
        ...master,
        // Each occurrence gets its own id. Sharing the master's — which is what
        // happened before this module existed — meant a list keyed by id showed
        // one of them and silently dropped the rest.
        id: key,
        start,
        end,
        occurrenceOf: master.externalUid,
        // The rule belongs to the master, not to a date it produced.
        recurrence: void 0,
        exdates: void 0
      });
    }
  }
  return expanded;
}

// src/lib/calendar/categoryModel.ts
var FOCUS_ACTUAL_CATEGORY_ID = "cat-focus-actual";
var FOCUS_ACTUAL_COLOR = "#0d9488";
var EXTERNAL_PREFIX = "cat-external:";
function externalCategoryId(calendarId) {
  return `${EXTERNAL_PREFIX}${calendarId}`;
}

// src/utils/calendarItems.ts
function localDateOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localTimeOf(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function splitFocusSegmentByDay(startAt, endAt, timezone) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];
  if (timezone) return splitByZonedDay(startAt, endAt, timezone);
  const parts = [];
  let cursor = start;
  for (let i = 0; i < 7 && cursor < end; i += 1) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(24, 0, 0, 0);
    const partEnd = end < dayEnd ? end : dayEnd;
    const startTime = localTimeOf(cursor);
    let endTime = partEnd.getTime() >= dayEnd.getTime() ? "24:00" : localTimeOf(partEnd);
    if (endTime <= startTime) {
      const bumped = new Date(cursor.getTime() + 6e4);
      endTime = localDateOf(bumped) === localDateOf(cursor) ? localTimeOf(bumped) : "24:00";
    }
    parts.push({ date: localDateOf(cursor), startTime, endTime });
    cursor = dayEnd;
  }
  return parts;
}
function splitByZonedDay(startAt, endAt, timezone) {
  const from = localDateTimeParts(startAt, void 0, timezone);
  const to = localDateTimeParts(endAt, void 0, timezone);
  const parts = [];
  let date = from.date;
  for (let i = 0; i < 7 && date <= to.date; i += 1) {
    const startTime = date === from.date ? from.time ?? "00:00" : "00:00";
    let endTime = date === to.date ? to.time ?? "24:00" : "24:00";
    if (endTime <= startTime) {
      if (date === to.date && date !== from.date) break;
      endTime = startTime >= "23:59" ? "24:00" : bumpMinute(startTime);
    }
    parts.push({ date, startTime, endTime });
    date = addDays2(date, 1);
  }
  return parts;
}
function bumpMinute(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = hours * 60 + minutes + 1;
  return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
}
function buildCalendarItems({
  tasks,
  lists = [],
  colorBy = DEFAULT_COLOR_BY,
  externalCalendars = [],
  externalCalendarEvents = [],
  externalCalendarRange,
  viewerTimezone,
  focusSessions = [],
  layers,
  categories,
  defaultCategoryId = "",
  visibleCategoryIds
}) {
  const items = [];
  function resolveTaskSourceId(listId) {
    if (!categories) return "";
    return listId;
  }
  function resolveCategoryId(id) {
    if (!categories) return "";
    return categories.has(id) ? id : defaultCategoryId;
  }
  function categoryAllowed(categoryId) {
    if (!visibleCategoryIds) return true;
    if (!categoryId) return true;
    return visibleCategoryIds.has(categoryId);
  }
  const taskById = new Map(tasks.map((entry) => [entry.id, entry]));
  const listsById2 = new Map(lists.map((entry) => [entry.id, entry]));
  const viewItems = projectItems({
    tasks,
    lists,
    today: todayValue()
  });
  for (const item of viewItems) {
    const task = taskById.get(item.sourceId);
    if (!task) continue;
    if (!isTaskAlive(task)) continue;
    const done = item.done;
    const repeating = task.repeatType !== "none";
    const taskCategoryId = resolveTaskSourceId(item.listId);
    if (!categoryAllowed(taskCategoryId)) continue;
    if (!layers.task) continue;
    const schedule = scheduleFromTask(item);
    const span = scheduleSpan(schedule);
    if (span === null) continue;
    if (done && !layers.completed) continue;
    const dates = [span.start];
    let cursor = span.start;
    while (cursor < span.end && dates.length < 62) {
      cursor = addDays2(cursor, 1);
      dates.push(cursor);
    }
    for (const date of dates) {
      const isStart = date === span.start;
      const isEnd = date === span.end;
      const startTime = isStart ? schedule.startTime : null;
      const endTime = isEnd ? schedule.endTime : null;
      items.push({
        key: dates.length > 1 ? `task-block:${item.sourceId}:${date}` : `task-block:${item.sourceId}`,
        layer: "task",
        sourceType: "task",
        sourceId: item.sourceId,
        title: item.title,
        date,
        startTime: startTime ?? void 0,
        endTime: endTime ?? void 0,
        allDay: startTime === null,
        // §3: the List, not a calendar-only category. `item.listId` is
        // already resolved through `listIdFor` by `projectItems`, so this
        // reads a decision the user made in the Tasks module rather than one
        // they could only have made from inside this screen.
        color: colorForTask({ colorBy, listId: item.listId, priority: item.priority, listsById: listsById2 }),
        categoryId: taskCategoryId,
        priority: item.priority,
        done,
        // Dragging one day of a range would have to mean either "move the
        // whole thing" or "resize this end", and the calendar has no gesture
        // that says which. Ranges are edited in the editor until it does.
        draggable: !done && dates.length === 1,
        repeating
      });
    }
  }
  const externalCalendarById = new Map(
    externalCalendars.filter((calendar) => calendar.enabled && calendar.visible).map((calendar) => [calendar.id, calendar])
  );
  const externalOccurrences = externalCalendarRange ? expandIcsOccurrences(externalCalendarEvents, externalCalendarRange, { viewerTimezone }) : externalCalendarEvents;
  for (const event of externalOccurrences) {
    const calendar = externalCalendarById.get(event.externalCalendarId);
    if (!calendar) continue;
    const eventCategoryId = categories ? externalCategoryId(calendar.id) : "";
    if (!categoryAllowed(eventCategoryId)) continue;
    const startDate = externalEventDate(event, viewerTimezone);
    const dates = [startDate];
    if (event.allDay) {
      const endDate = externalEventEndDate(event, viewerTimezone);
      let cursor = startDate;
      while (endDate && dates.length < 62) {
        const next = addDays2(cursor, 1);
        if (next >= endDate) break;
        dates.push(next);
        cursor = next;
      }
    }
    for (const date of dates) {
      items.push({
        key: `external:${event.id}:${date}`,
        layer: "external",
        sourceType: "external",
        sourceId: event.id,
        externalCalendarId: calendar.id,
        externalCalendarName: calendar.name,
        title: event.title,
        date,
        startTime: externalEventStartTime(event, viewerTimezone),
        endTime: externalEventEndTime(event, viewerTimezone),
        allDay: event.allDay,
        color: calendar.color,
        categoryId: eventCategoryId,
        draggable: false,
        readOnly: true
      });
    }
  }
  if (layers.focusActual && focusSessions.length > 0) {
    const focusCategoryId = resolveCategoryId(FOCUS_ACTUAL_CATEGORY_ID);
    if (categoryAllowed(focusCategoryId)) {
      const focusColor = categories?.get(focusCategoryId)?.color ?? FOCUS_ACTUAL_COLOR;
      for (const session of focusSessions) {
        if (session.status !== "completed") continue;
        if (session.mode !== "focus") continue;
        session.segments.forEach((segment, index) => {
          for (const part of splitFocusSegmentByDay(segment.startAt, segment.endAt, viewerTimezone)) {
            items.push({
              key: `focus:${session.id}:${index}:${part.date}`,
              layer: "focus-actual",
              sourceType: "focus",
              sourceId: session.id,
              title: session.title || session.projectName || "Focus",
              date: part.date,
              startTime: part.startTime,
              endTime: part.endTime,
              allDay: false,
              color: focusColor,
              categoryId: focusCategoryId,
              draggable: false,
              readOnly: true
            });
          }
        });
      }
    }
  }
  return items;
}

// src/server/data/freshness.ts
var MINUTE = 60 * 1e3;
var LIVE_WITHIN_MS = 5 * MINUTE;
var RECENT_WITHIN_MS = 24 * 60 * MINUTE;
function freshnessFrom(syncState, now) {
  const lastSyncedAt = validStamp(syncState?.lastSyncedAt);
  const lastSeenAt = validStamp(syncState?.lastSeenAt);
  const stamps = [lastSyncedAt, lastSeenAt].filter((stamp) => Boolean(stamp)).sort();
  const newest = stamps[stamps.length - 1];
  const freshness = {
    ...lastSyncedAt ? { lastSyncedAt } : {},
    ...lastSeenAt ? { lastSeenAt } : {},
    ...syncState?.platform ? { syncedFromDevice: syncState.platform } : {},
    staleness: "unknown"
  };
  if (!newest) return freshness;
  const age = now.getTime() - Date.parse(newest);
  if (age < -LIVE_WITHIN_MS) return freshness;
  freshness.staleness = age <= LIVE_WITHIN_MS ? "live" : age <= RECENT_WITHIN_MS ? "recent" : "stale";
  return freshness;
}
function validStamp(value2) {
  if (!value2 || Number.isNaN(Date.parse(value2))) return void 0;
  return value2;
}

// src/server/data/queries/shared.ts
function todayFor(ctx) {
  return todayIn(ctx.request.now, ctx.request.timezone);
}
function buildMeta(slice, external) {
  const meta = {
    freshness: freshnessFrom(slice.syncState, /* @__PURE__ */ new Date()),
    truncated: slice.truncated.length > 0,
    // A missing table means part of the answer is simply not there. Saying so
    // is the difference between "you have no tags" and "I could not read your
    // tags", and only one of those is honest.
    partial: slice.missing.length > 0 || Boolean(external?.partial)
  };
  if (external) meta.externalCalendars = external.statuses;
  return meta;
}
function buildMetaAt(slice, now, external) {
  return { ...buildMeta(slice, external), freshness: freshnessFrom(slice.syncState, now) };
}
function projectionFor(slice, today) {
  return projectionContext({
    today,
    tasks: slice.data.tasks,
    lists: slice.data.lists,
    projects: slice.data.projects,
    subtasks: slice.data.subtasks,
    checkItems: slice.data.checkItems
  });
}
async function loadCalendar(ctx, slice, window) {
  const include = window.include ?? ["tasks", "external", "focus"];
  const timezone = ctx.request.timezone;
  const subscriptions = slice.data.settings.externalCalendars ?? [];
  const external = include.includes("external") ? await (ctx.loadExternal ?? loadExternalEvents)(subscriptions) : void 0;
  const expanded = external ? expandIcsOccurrences(external.events, { from: window.from, to: window.to }, { viewerTimezone: timezone }) : [];
  const eventById = new Map(expanded.map((event) => [event.id, event]));
  const items = buildCalendarItems({
    tasks: include.includes("tasks") ? slice.data.tasks : [],
    lists: slice.data.lists,
    externalCalendars: subscriptions,
    externalCalendarEvents: expanded,
    externalCalendarRange: { from: window.from, to: window.to },
    viewerTimezone: timezone,
    focusSessions: include.includes("focus") ? slice.data.focusSessions : [],
    layers: {
      task: include.includes("tasks"),
      // A finished task still occupied the hours it was scheduled for, and a
      // reader asking what a day looked like should see them.
      completed: include.includes("tasks"),
      focusActual: include.includes("focus")
    }
  });
  const entries = items.filter((item) => item.date >= window.from && item.date <= window.to).map((item) => toCalendarEntry(item, eventById)).sort(compareEntries);
  return { entries, external };
}
function toCalendarEntry(item, eventById) {
  const entry = {
    kind: item.sourceType,
    sourceId: item.sourceId,
    title: item.title,
    date: item.date,
    allDay: item.allDay
  };
  if (item.startTime) entry.startTime = item.startTime;
  if (item.endTime) entry.endTime = item.endTime;
  if (item.sourceType === "task" && item.done !== void 0) entry.completed = item.done;
  if (item.sourceType === "external") {
    if (item.externalCalendarName) entry.calendarName = item.externalCalendarName;
    const event = eventById.get(item.sourceId);
    if (event?.location) entry.location = event.location;
    if (event?.occurrenceOf) entry.repeating = true;
  }
  if (item.sourceType === "task" && item.repeating) entry.repeating = true;
  return entry;
}
function compareEntries(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const aStart = a.startTime ?? "";
  const bStart = b.startTime ?? "";
  if (aStart !== bStart) return aStart < bStart ? -1 : 1;
  return a.title.localeCompare(b.title);
}
function busySpansFor(entries, date) {
  const spans = [];
  for (const entry of entries) {
    if (entry.date !== date || entry.allDay) continue;
    const start = parseTimeToMinutes(entry.startTime ?? "");
    if (start === void 0) continue;
    const end = parseTimeToMinutes(entry.endTime ?? "");
    if (end === void 0 || end <= start) continue;
    spans.push({ start, end });
  }
  return spans;
}
var TABLES = {
  tasks: ["tasks", "subtasks", "check_items", "projects", "lists", "settings"],
  taskDetail: ["tasks", "subtasks", "check_items", "projects", "lists", "reminders", "settings"],
  today: ["tasks", "subtasks", "check_items", "projects", "lists", "daily_plans", "task_tags", "settings"],
  calendar: ["tasks", "focus_sessions", "lists", "settings"],
  projects: ["projects", "lists", "tasks", "subtasks", "check_items", "settings"],
  focus: ["focus_sessions", "tasks", "settings"],
  currentContext: [
    "tasks",
    "subtasks",
    "check_items",
    "projects",
    "lists",
    "daily_plans",
    "task_tags",
    "focus_sessions",
    "settings"
  ]
};

// src/server/data/queries/calendar.ts
var MAX_CALENDAR_DAYS = 92;
var DEFAULT_DAY_START = "09:00";
var DEFAULT_DAY_END = "22:00";
var MIN_FREE_BLOCK_MINUTES = 15;
async function getCalendarRange(ctx, from, to, include) {
  assertDate(from, "from");
  assertDate(to, "to");
  if (to < from) throw invalidArgument("to must not be before from.");
  if (daysApart(from, to) > MAX_CALENDAR_DAYS) {
    throw invalidArgument(`from..to may span at most ${MAX_CALENDAR_DAYS} days.`);
  }
  const slice = await ctx.repo.loadSlice(TABLES.calendar);
  const { entries, external } = await loadCalendar(ctx, slice, { from, to, include });
  return { from, to, entries, meta: buildMetaAt(slice, ctx.request.now, external) };
}
async function getFreeTimeBlocks(ctx, date, dayStart = DEFAULT_DAY_START, dayEnd = DEFAULT_DAY_END) {
  assertDate(date, "date");
  const start = parseTimeToMinutes(dayStart);
  const end = parseTimeToMinutes(dayEnd);
  if (start === void 0 || end === void 0) throw invalidArgument("dayStart and dayEnd must be HH:mm.");
  if (end <= start) throw invalidArgument("dayEnd must be after dayStart.");
  const slice = await ctx.repo.loadSlice(TABLES.calendar);
  const { entries, external } = await loadCalendar(ctx, slice, { from: date, to: date });
  const busySpans = busySpansFor(entries, date);
  const blocks = freeSpans(busySpans, start, end, MIN_FREE_BLOCK_MINUTES).map((span) => ({
    start: formatMinuteSpan(span.start),
    end: formatMinuteSpan(span.end),
    minutes: span.end - span.start
  }));
  return {
    date,
    blocks,
    totalFreeMinutes: blocks.reduce((total, block) => total + block.minutes, 0),
    busy: entries.filter((entry) => entry.date === date && !entry.allDay && entry.startTime && entry.endTime).map((entry) => ({
      start: entry.startTime,
      end: entry.endTime,
      title: entry.title,
      kind: entry.kind
    })),
    meta: buildMetaAt(slice, ctx.request.now, external)
  };
}
function assertDate(value2, field) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value2)) throw invalidArgument(`${field} must be a date in YYYY-MM-DD form.`);
}
function daysApart(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

// src/server/data/queries/focus.ts
var DEFAULT_FOCUS_DAYS = 14;
var MAX_FOCUS_DAYS = 366;
async function getFocusSummary(ctx, range = {}) {
  const today = todayFor(ctx);
  const to = range.to ?? today;
  const from = range.from ?? addDays2(to, -(DEFAULT_FOCUS_DAYS - 1));
  if (to < from) throw invalidArgument("to must not be before from.");
  if (daysApart2(from, to) > MAX_FOCUS_DAYS) {
    throw invalidArgument(`from..to may span at most ${MAX_FOCUS_DAYS} days.`);
  }
  const slice = await ctx.repo.loadSlice(TABLES.focus);
  const titleById = new Map(slice.data.tasks.map((task) => [task.id, task.title]));
  const sessions = slice.data.focusSessions.filter((session) => {
    const date = sessionDate(session, ctx.request.timezone);
    return date >= from && date <= to;
  });
  const byDay = /* @__PURE__ */ new Map();
  const byTask = /* @__PURE__ */ new Map();
  let totalMinutes = 0;
  for (const session of sessions) {
    const minutes = sessionMinutes(session);
    totalMinutes += minutes;
    const date = sessionDate(session, ctx.request.timezone);
    const day = byDay.get(date) ?? { minutes: 0, sessions: 0 };
    day.minutes += minutes;
    day.sessions += 1;
    byDay.set(date, day);
    if (session.taskId) byTask.set(session.taskId, (byTask.get(session.taskId) ?? 0) + minutes);
  }
  return {
    from,
    to,
    totalMinutes,
    sessionCount: sessions.length,
    byDay: [...byDay.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([date, value2]) => ({ date, ...value2 })),
    topTasks: [...byTask.entries()].sort(([, a], [, b]) => b - a).slice(0, 5).map(([taskId, minutes]) => ({
      taskId,
      // A session names the task it was for, and the task may since have
      // been deleted. The recorded name is the honest answer then.
      title: titleById.get(taskId) ?? "(deleted task)",
      minutes
    })),
    recentSessions: [...sessions].sort((a, b) => focusSessionStartOf(b).localeCompare(focusSessionStartOf(a))).slice(0, 10).map((session) => ({
      ...session.taskId ? { taskId: session.taskId } : {},
      title: session.title || titleById.get(session.taskId) || "Focus session",
      startedAt: focusSessionStartOf(session),
      minutes: sessionMinutes(session),
      completed: session.status === "completed"
    })),
    meta: buildMetaAt(slice, ctx.request.now)
  };
}
function sessionDate(session, timezone) {
  return localDateTimeParts(focusSessionStartOf(session), void 0, timezone).date;
}
function sessionMinutes(session) {
  return Math.round(Math.max(0, session.accumulatedSeconds) / 60);
}
function daysApart2(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

// src/server/data/queries/tasks.ts
var DEFAULT_LIMIT = 50;
var MAX_LIMIT = 200;
var MAX_DUE_RANGE_DAYS = 366;
var MAX_DEADLINE_DAYS = 90;
async function getTasks(ctx, filter = {}) {
  const slice = await ctx.repo.loadSlice(TABLES.tasks);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);
  const limit = clampLimit(filter.limit);
  const offset = decodeCursor(filter.cursor);
  if (filter.dueFrom && filter.dueTo && daysApart3(filter.dueFrom, filter.dueTo) > MAX_DUE_RANGE_DAYS) {
    throw invalidArgument(`dueFrom..dueTo may span at most ${MAX_DUE_RANGE_DAYS} days.`);
  }
  const matched = slice.data.tasks.filter((task) => matches(task, filter));
  const ordered = [...matched].sort(byDueThenCreated);
  const page = ordered.slice(offset, offset + limit);
  const result = {
    items: page.map((task) => projectTask(task, projection)),
    total: ordered.length,
    meta: buildMetaAt(slice, ctx.request.now)
  };
  if (offset + limit < ordered.length) result.nextCursor = encodeCursor(offset + limit);
  return result;
}
async function searchTasks(ctx, query, limit) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) throw invalidArgument("query must be at least 2 characters.");
  const slice = await ctx.repo.loadSlice(TABLES.tasks);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);
  const matched = slice.data.tasks.filter(
    (task) => isTaskAlive(task) && (task.title.toLowerCase().includes(needle) || task.description.toLowerCase().includes(needle) || task.notes.toLowerCase().includes(needle))
  );
  const ordered = [...matched].sort(byDueThenCreated);
  return {
    items: ordered.slice(0, clampLimit(limit)).map((task) => projectTask(task, projection)),
    total: ordered.length,
    meta: buildMetaAt(slice, ctx.request.now)
  };
}
async function getTaskDetail(ctx, taskId) {
  const slice = await ctx.repo.loadSlice(TABLES.taskDetail);
  const task = slice.data.tasks.find((candidate) => candidate.id === taskId);
  if (!task || !isTaskAlive(task)) throw notFound();
  const projection = projectionFor(slice, todayFor(ctx));
  return { ...projectTaskDetail(task, projection), meta: buildMetaAt(slice, ctx.request.now) };
}
async function getSubtasks(ctx, taskId) {
  const slice = await ctx.repo.loadSlice(TABLES.taskDetail);
  const task = slice.data.tasks.find((candidate) => candidate.id === taskId);
  if (!task || !isTaskAlive(task)) throw notFound();
  const projection = projectionFor(slice, todayFor(ctx));
  const detail = projectTaskDetail(task, projection);
  return { items: detail.subtasks, meta: buildMetaAt(slice, ctx.request.now) };
}
async function getOverdueTasks(ctx, limit) {
  const slice = await ctx.repo.loadSlice(TABLES.tasks);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);
  const overdue = slice.data.tasks.filter((task) => isTaskAlive(task) && publicStatus(task) === "open").filter((task) => isOverdue(scheduleFromTask(task), today)).sort(byDueThenCreated);
  return {
    items: overdue.slice(0, clampLimit(limit)).map((task) => projectTask(task, projection)),
    total: overdue.length,
    meta: buildMetaAt(slice, ctx.request.now)
  };
}
async function getUpcomingDeadlines(ctx, days = 7) {
  if (!Number.isInteger(days) || days < 1 || days > MAX_DEADLINE_DAYS) {
    throw invalidArgument(`days must be a whole number between 1 and ${MAX_DEADLINE_DAYS}.`);
  }
  const slice = await ctx.repo.loadSlice(TABLES.tasks);
  const today = todayFor(ctx);
  const until = addDays2(today, days);
  const projection = projectionFor(slice, today);
  const items = slice.data.tasks.filter((task) => isTaskAlive(task) && publicStatus(task) === "open").filter((task) => task.dueDate >= today && task.dueDate <= until).sort(byDueThenCreated).map((task) => projectTask(task, projection));
  const byDate = /* @__PURE__ */ new Map();
  for (const item of items) {
    const date = item.dueDate ?? today;
    const bucket = byDate.get(date);
    if (bucket) bucket.push(item);
    else byDate.set(date, [item]);
  }
  return {
    items,
    groupedByDate: [...byDate.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([date, dateItems]) => ({ date, items: dateItems })),
    meta: buildMetaAt(slice, ctx.request.now)
  };
}
function matches(task, filter) {
  if (!isTaskAlive(task)) return false;
  if (filter.status && publicStatus(task) !== filter.status) return false;
  if (filter.projectId && task.projectId !== filter.projectId) return false;
  if (filter.listId && task.listId !== filter.listId) return false;
  if (filter.priority && task.priority !== filter.priority) return false;
  if (filter.tag) {
    const wanted = filter.tag.toLowerCase();
    if (!task.tags.some((tag) => tag.toLowerCase() === wanted)) return false;
  }
  if (filter.dueFrom && (!task.dueDate || task.dueDate < filter.dueFrom)) return false;
  if (filter.dueTo && (!task.dueDate || task.dueDate > filter.dueTo)) return false;
  return true;
}
function byDueThenCreated(a, b) {
  const aDue = a.dueDate || "9999-12-31";
  const bDue = b.dueDate || "9999-12-31";
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function clampLimit(limit) {
  if (limit === void 0) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw invalidArgument("limit must be a whole number of at least 1.");
  return Math.min(limit, MAX_LIMIT);
}
function encodeCursor(offset) {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}
function decodeCursor(cursor) {
  if (!cursor) return 0;
  const offset = Number.parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
  if (!Number.isInteger(offset) || offset < 0) throw invalidArgument("cursor is not one this tool issued.");
  return offset;
}
function daysApart3(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

// src/server/data/queries/todayTasks.ts
async function getTodayTasks(ctx, options = {}) {
  const slice = await ctx.repo.loadSlice(TABLES.today);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);
  const entries = collectTodayEntries(
    {
      tasks: slice.data.tasks,
      lists: slice.data.lists,
      dailyPlans: slice.data.dailyPlans,
      taskTags: slice.data.taskTags,
      today
    },
    bucketOverridesFor(slice.data.dailyPlans, today),
    today
  );
  const completedCount = entries.filter((entry) => entry.completed).length;
  const visible = options.includeCompleted ? entries : entries.filter((entry) => !entry.completed);
  return {
    date: today,
    timezone: ctx.request.timezone,
    buckets: {
      now: summarize(visible, "now", projection),
      next: summarize(visible, "next", projection),
      later: summarize(visible, "later", projection)
    },
    // Reported even when the completed entries are not returned: "you finished
    // four things today" is worth knowing, and it is a number rather than a
    // list of them.
    completedCount,
    meta: buildMetaAt(slice, ctx.request.now)
  };
}
function summarize(entries, bucket, projection) {
  return entries.filter((entry) => entry.bucket === bucket).map((entry) => projectTask(entry.task, projection));
}

// src/server/data/queries/currentContext.ts
var CONTEXT_LIST_LIMIT = 10;
var UPCOMING_DAYS = 7;
var FOCUS_WINDOW_DAYS = 7;
async function getCurrentContext(ctx) {
  const today = todayFor(ctx);
  const timezone = ctx.request.timezone;
  const slice = await ctx.repo.loadSlice(TABLES.currentContext);
  const [calendar, todayTasks, overdue, upcoming, highPriority, focus] = await Promise.all([
    getCalendarRange(ctx, today, today),
    getTodayTasks(ctx),
    getOverdueTasks(ctx, CONTEXT_LIST_LIMIT),
    getUpcomingDeadlines(ctx, UPCOMING_DAYS),
    getTasks(ctx, { priority: "high", status: "open", limit: CONTEXT_LIST_LIMIT }),
    getFocusSummary(ctx, { from: addDays2(today, -(FOCUS_WINDOW_DAYS - 1)), to: today })
  ]);
  const nowMinutes = minutesOfDay(timeIn(ctx.request.now, timezone)) ?? 0;
  const upcomingToday = calendar.entries.filter((entry) => !entry.allDay && entry.startTime).filter((entry) => (parseTimeToMinutes(entry.startTime) ?? 0) > nowMinutes);
  const nextEvent = upcomingToday[0];
  const context = {
    now: zonedIsoString(ctx.request.now, timezone),
    timezone,
    today,
    dayOfWeek: dayOfWeekIn(ctx.request.now, timezone),
    todaySchedule: calendar.entries,
    todayTasks: todayTasks.buckets,
    overdue: { count: overdue.total, items: overdue.items },
    upcoming: { withinDays: UPCOMING_DAYS, items: upcoming.items.slice(0, CONTEXT_LIST_LIMIT) },
    highPriority: highPriority.items,
    focus: {
      last7DaysMinutes: focus.totalMinutes
    },
    counts: {
      // Every open task in the account, not today's — "you have 34 open
      // tasks" and "you have 6 things today" are different sentences, and
      // this is the first one.
      openTasks: slice.data.tasks.filter((task) => isTaskAlive(task) && publicStatus(task) === "open").length,
      projects: slice.data.projects.filter((project) => project.status !== "archived").length,
      lists: slice.data.lists.length
    },
    // The calendar's metadata, because it is the only one carrying the state
    // of the external subscriptions — and an answer built partly from a
    // calendar that failed has to say so.
    meta: calendar.meta
  };
  if (nextEvent) {
    context.nextEvent = nextEvent;
    const startsAt = parseTimeToMinutes(nextEvent.startTime) ?? 0;
    context.minutesUntilNextEvent = Math.max(0, startsAt - nowMinutes);
    context.freeMinutesUntilNextEvent = freeMinutesFrom(busySpansFor(calendar.entries, today), nowMinutes, startsAt);
  }
  const lastSession = focus.recentSessions.find((session) => session.completed);
  if (lastSession) {
    const source = slice.data.focusSessions.find(
      (candidate) => focusSessionStartOf(candidate) === lastSession.startedAt
    );
    context.focus.lastSession = {
      title: lastSession.title,
      endedAt: source?.endedAt || source?.endAt || lastSession.startedAt,
      minutes: lastSession.minutes
    };
  }
  const active = slice.data.activeSessionId ? slice.data.focusSessions.find((session) => session.id === slice.data.activeSessionId) : void 0;
  if (active && active.status === "running") {
    context.focus.activeSession = {
      taskId: active.taskId,
      title: active.title || slice.data.tasks.find((task) => task.id === active.taskId)?.title || "Focus session",
      startedAt: focusSessionStartOf(active)
    };
  }
  context.meta = mergeMeta(context.meta, buildMetaAt(slice, ctx.request.now));
  return context;
}
function mergeMeta(primary, other) {
  return {
    ...primary,
    truncated: primary.truncated || other.truncated,
    partial: primary.partial || other.partial
  };
}

// src/server/data/queries/projects.ts
async function getProjects(ctx, options = {}) {
  const slice = await ctx.repo.loadSlice(TABLES.projects);
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);
  const items = slice.data.projects.filter((project) => options.includeArchived || project.status !== "archived").sort((a, b) => a.name.localeCompare(b.name)).map((project) => summarize2(project, slice.data.tasks, projection));
  return { items, meta: buildMetaAt(slice, ctx.request.now) };
}
var PROJECT_TASK_SAMPLE = 20;
async function getProjectContext(ctx, projectId) {
  const slice = await ctx.repo.loadSlice(TABLES.projects);
  const project = slice.data.projects.find((candidate) => candidate.id === projectId);
  if (!project) throw notFound();
  const today = todayFor(ctx);
  const projection = projectionFor(slice, today);
  const tasks = slice.data.tasks.filter((task) => task.projectId === project.id && isTaskAlive(task));
  const open = tasks.filter((task) => publicStatus(task) === "open");
  const detail = {
    ...summarize2(project, slice.data.tasks, projection),
    lists: slice.data.lists.filter((list) => list.projectId === project.id).map((list) => ({
      id: list.id,
      name: list.name,
      openTaskCount: open.filter((task) => task.listId === list.id).length
    })),
    openTasks: open.sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31")).slice(0, PROJECT_TASK_SAMPLE).map((task) => projectTask(task, projection)),
    meta: buildMetaAt(slice, ctx.request.now)
  };
  if (project.description) detail.description = project.description;
  if (project.notes) detail.notes = project.notes;
  return detail;
}
function summarize2(project, allTasks, projection) {
  const tasks = allTasks.filter((task) => task.projectId === project.id && isTaskAlive(task));
  const open = tasks.filter((task) => publicStatus(task) === "open");
  const summary = {
    id: project.id,
    name: project.name,
    // Both fields are optional on the record and filled by the normalizer;
    // the fallbacks are what an older record without them has always meant.
    type: project.type ?? "project",
    status: project.status ?? "active",
    openTaskCount: open.length,
    overdueTaskCount: open.filter((task) => projectTask(task, projection).isOverdue).length
  };
  if (project.color) summary.color = project.color;
  if (project.dueDate) summary.dueDate = project.dueDate;
  return summary;
}

// src/server/mcp/tools/read/index.ts
var TASK_STATUSES = ["open", "completed", "wont_do"];
var PRIORITIES = ["none", "low", "medium", "high"];
var CALENDAR_SOURCES = ["tasks", "external", "focus"];
var readTools = [
  {
    name: "get_current_context",
    mode: "read",
    description: describe(
      "Everything about the user's situation right now: today's schedule (their tasks, their subscribed calendars and recorded focus time on one timeline), the next event and how many free minutes are left before it, today's tasks by bucket, overdue and upcoming work, high-priority items, and recent focus. Call this FIRST for any open question about the day \u2014 it answers in one call what the narrower tools answer in six."
    ),
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async handler(args, ctx) {
      rejectUnknown(args, []);
      return getCurrentContext(ctx);
    }
  },
  {
    name: "get_today_tasks",
    mode: "read",
    description: describe(
      "Today's tasks in the three buckets the user themselves arranged them into (now / next / later), using the app's own rule for what belongs to today \u2014 which includes overdue work and tasks planned for today with no due date."
    ),
    inputSchema: {
      type: "object",
      properties: {
        includeCompleted: { type: "boolean", description: "Include what was finished today. Default false; the count is always returned." }
      },
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["includeCompleted"]);
      return getTodayTasks(ctx, { includeCompleted: optionalBoolean(args, "includeCompleted") });
    }
  },
  {
    name: "get_tasks",
    mode: "read",
    description: describe(
      "Tasks matching a filter, paginated. Use for questions with a stated scope \u2014 a project, a list, a tag, a priority, a date window. Deleted and archived tasks are never returned."
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
        cursor: { type: "string", description: "From a previous answer's nextCursor." }
      },
      additionalProperties: false
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
        cursor: optionalString(args, "cursor")
      });
    }
  },
  {
    name: "get_task_detail",
    mode: "read",
    description: describe(
      "One task in full: its description and notes, its subtasks and checklist with what is ticked, what it is blocked by, what it is blocking, and its recurrence. The only tool that returns a task's long text."
    ),
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["taskId"]);
      return getTaskDetail(ctx, requiredString(args, "taskId"));
    }
  },
  {
    name: "get_subtasks",
    mode: "read",
    description: describe("Just the subtasks of one task. Prefer get_task_detail when the checklist or the description matters too."),
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["taskId"]);
      return getSubtasks(ctx, requiredString(args, "taskId"));
    }
  },
  {
    name: "get_overdue_tasks",
    mode: "read",
    description: describe("Unfinished tasks whose due date has passed, oldest deadline first, with how many days late each one is."),
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", description: "Default 50, maximum 200." } },
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["limit"]);
      return getOverdueTasks(ctx, optionalInteger(args, "limit", 1, 200));
    }
  },
  {
    name: "get_upcoming_deadlines",
    mode: "read",
    description: describe(
      "Open tasks due between today and N days from now, also grouped by date. Does not include work that is already late \u2014 ask get_overdue_tasks for that."
    ),
    inputSchema: {
      type: "object",
      properties: { days: { type: "integer", description: "Default 7, maximum 90." } },
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["days"]);
      return getUpcomingDeadlines(ctx, optionalInteger(args, "days", 1, 90) ?? 7);
    }
  },
  {
    name: "search_tasks",
    mode: "read",
    description: describe(
      "Find tasks whose title, description or notes contain a string. Case-insensitive substring matching, not semantic search: pass a distinctive word the user actually wrote, not a paraphrase of their question."
    ),
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "At least 2 characters." },
        limit: { type: "integer", description: "Default 50, maximum 200." }
      },
      required: ["query"],
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["query", "limit"]);
      return searchTasks(ctx, requiredString(args, "query"), optionalInteger(args, "limit", 1, 200));
    }
  },
  {
    name: "get_calendar_events",
    mode: "read",
    description: describe(
      "Everything on the calendar between two dates: scheduled task blocks, events from the user's subscribed calendars (repeating meetings expanded to each occurrence), and time actually spent focusing. Check meta.externalCalendars \u2014 if one shows ok:false, the day shown is missing that calendar's events and any conclusion about free time is unsafe."
    ),
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD." },
        to: { type: "string", description: "YYYY-MM-DD, at most 92 days after from." },
        include: {
          type: "array",
          items: { type: "string", enum: [...CALENDAR_SOURCES] },
          description: "Default: all three."
        }
      },
      required: ["from", "to"],
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["from", "to", "include"]);
      return getCalendarRange(
        ctx,
        requiredDate(args, "from"),
        requiredDate(args, "to"),
        optionalStringArray(args, "include", CALENDAR_SOURCES)
      );
    }
  },
  {
    name: "get_free_time_blocks",
    mode: "read",
    description: describe(
      "The gaps in one day, with the commitments they were computed from. Use this before suggesting when something could be done. All-day events do not count as busy hours."
    ),
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD." },
        dayStart: { type: "string", description: "HH:mm, default 09:00." },
        dayEnd: { type: "string", description: "HH:mm, default 22:00." }
      },
      required: ["date"],
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["date", "dayStart", "dayEnd"]);
      return getFreeTimeBlocks(
        ctx,
        requiredDate(args, "date"),
        optionalTime(args, "dayStart"),
        optionalTime(args, "dayEnd")
      );
    }
  },
  {
    name: "get_projects",
    mode: "read",
    description: describe("The user's projects and areas, with how much open and overdue work each holds."),
    inputSchema: {
      type: "object",
      properties: { includeArchived: { type: "boolean", description: "Default false." } },
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["includeArchived"]);
      return getProjects(ctx, { includeArchived: optionalBoolean(args, "includeArchived") });
    }
  },
  {
    name: "get_project_detail",
    mode: "read",
    description: describe("One project: its lists, its open work with the nearest deadlines first, and its own notes."),
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["projectId"]);
      return getProjectContext(ctx, requiredString(args, "projectId"));
    }
  },
  {
    name: "get_focus_summary",
    mode: "read",
    description: describe(
      "Recorded focus time over a period: total minutes, a per-day breakdown, which tasks took the most, and the most recent sessions. Minutes are what the timer counted, not what was planned."
    ),
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD. Default: 13 days before `to`." },
        to: { type: "string", description: "YYYY-MM-DD. Default: today." }
      },
      additionalProperties: false
    },
    async handler(args, ctx) {
      rejectUnknown(args, ["from", "to"]);
      return getFocusSummary(ctx, { from: optionalDate(args, "from"), to: optionalDate(args, "to") });
    }
  }
];

// src/server/mcp/index.ts
var toolRegistry = createRegistry(readTools);

// src/functions/google/callback.ts
function first(value2) {
  return Array.isArray(value2) ? value2[0] : value2;
}
function handler(req, res) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end("Method not allowed");
    return;
  }
  const state = decodeOAuthState(first(req.query?.state));
  if (!state) {
    res.status(400).end("This sign-in link is not one we started.");
    return;
  }
  const error = first(req.query?.error);
  const code = first(req.query?.code);
  const params = new URLSearchParams({ state: state.nonce });
  if (error) params.set("error", error);
  else if (code) params.set("code", code);
  else params.set("error", "no_code");
  if (state.platform === "desktop") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", `focusflow://${CALLBACK_ROUTE}?${params.toString()}`);
    res.status(302).end();
    return;
  }
  const appUrl = readAppUrl();
  if (!appUrl) {
    res.status(500).end("This deployment has not been told its own address (APP_URL).");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", `${appUrl}${CALLBACK_LANDING_PATH}#${CALLBACK_ROUTE}?${params.toString()}`);
  res.status(302).end();
}
export {
  handler as default
};
