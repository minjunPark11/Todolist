var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server/mcp/auth.ts
function bearerFrom(headerValue) {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1].trim() : null;
}
var UnauthorizedError;
var init_auth = __esm({
  "src/server/mcp/auth.ts"() {
    "use strict";
    UnauthorizedError = class extends Error {
      /** What goes in `WWW-Authenticate`, so a connector starts an OAuth flow. */
      reason;
      constructor(reason, message) {
        super(message);
        this.name = "UnauthorizedError";
        this.reason = reason;
      }
    };
  }
});

// src/server/mcp/protectedResource.ts
function issuerFor(supabaseUrl) {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
}
var init_protectedResource = __esm({
  "src/server/mcp/protectedResource.ts"() {
    "use strict";
  }
});

// src/server/mcp/jwks.ts
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
  let cache = null;
  let inFlight = null;
  async function loadKeys(force) {
    const age = cache ? now().getTime() - cache.fetchedAt : Number.POSITIVE_INFINITY;
    if (cache && !force && age < cacheTtlMs) return cache;
    if (cache && force && age < refetchFloorMs) return cache;
    inFlight ??= fetchKeys(jwksUrl, fetchImpl, now).finally(() => {
      inFlight = null;
    });
    cache = await inFlight;
    return cache;
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
var DEFAULT_CACHE_TTL_MS, DEFAULT_REFETCH_FLOOR_MS, DEFAULT_CLOCK_SKEW_MS;
var init_jwks = __esm({
  "src/server/mcp/jwks.ts"() {
    "use strict";
    init_auth();
    DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
    DEFAULT_REFETCH_FLOOR_MS = 60 * 1e3;
    DEFAULT_CLOCK_SKEW_MS = 30 * 1e3;
  }
});

// src/domain/sync/diffRecords.ts
var init_diffRecords = __esm({
  "src/domain/sync/diffRecords.ts"() {
    "use strict";
  }
});

// src/domain/sync/buildSyncPlan.ts
var collectionTables;
var init_buildSyncPlan = __esm({
  "src/domain/sync/buildSyncPlan.ts"() {
    "use strict";
    init_diffRecords();
    collectionTables = [
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
  }
});

// src/domain/spaces/spaces.ts
var init_spaces = __esm({
  "src/domain/spaces/spaces.ts"() {
    "use strict";
  }
});

// src/domain/spaces/hierarchy.ts
var init_hierarchy = __esm({
  "src/domain/spaces/hierarchy.ts"() {
    "use strict";
  }
});

// src/domain/tags/tags.ts
var init_tags = __esm({
  "src/domain/tags/tags.ts"() {
    "use strict";
  }
});

// src/domain/spaces/membership.ts
var init_membership = __esm({
  "src/domain/spaces/membership.ts"() {
    "use strict";
    init_hierarchy();
  }
});

// src/domain/tasks/sections.ts
var init_sections = __esm({
  "src/domain/tasks/sections.ts"() {
    "use strict";
    init_membership();
  }
});

// src/domain/tasks/templates.ts
var init_templates = __esm({
  "src/domain/tasks/templates.ts"() {
    "use strict";
  }
});

// src/domain/tasks/sidebarFolders.ts
var init_sidebarFolders = __esm({
  "src/domain/tasks/sidebarFolders.ts"() {
    "use strict";
  }
});

// src/domain/tasks/filters.ts
var init_filters = __esm({
  "src/domain/tasks/filters.ts"() {
    "use strict";
    init_membership();
    init_tags();
  }
});

// src/domain/tasks/sortKey.ts
var init_sortKey = __esm({
  "src/domain/tasks/sortKey.ts"() {
    "use strict";
  }
});

// src/domain/tasks/checkItems.ts
var init_checkItems = __esm({
  "src/domain/tasks/checkItems.ts"() {
    "use strict";
    init_sortKey();
  }
});

// src/domain/today/dailyPlan.ts
var init_dailyPlan = __esm({
  "src/domain/today/dailyPlan.ts"() {
    "use strict";
  }
});

// src/domain/schedule/types.ts
var init_types = __esm({
  "src/domain/schedule/types.ts"() {
    "use strict";
  }
});

// src/domain/schedule/scheduleQueries.ts
var init_scheduleQueries = __esm({
  "src/domain/schedule/scheduleQueries.ts"() {
    "use strict";
  }
});

// src/domain/schedule/scheduleCommands.ts
var init_scheduleCommands = __esm({
  "src/domain/schedule/scheduleCommands.ts"() {
    "use strict";
    init_scheduleQueries();
  }
});

// src/domain/schedule/quickDate.ts
var init_quickDate = __esm({
  "src/domain/schedule/quickDate.ts"() {
    "use strict";
    init_scheduleCommands();
    init_scheduleQueries();
  }
});

// src/domain/schedule/reminders.ts
var ALL_DAY_REMINDER_TIME, MINUTES_PER_DAY, ALL_DAY_OFFERS, UNIT_MINUTES;
var init_reminders = __esm({
  "src/domain/schedule/reminders.ts"() {
    "use strict";
    init_scheduleCommands();
    init_scheduleQueries();
    init_types();
    ALL_DAY_REMINDER_TIME = "09:00";
    MINUTES_PER_DAY = 1440;
    ALL_DAY_OFFERS = [
      { id: "on-day", offsetMinutes: 0, allDayTime: ALL_DAY_REMINDER_TIME },
      { id: "1d-9am", offsetMinutes: MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME },
      { id: "2d", offsetMinutes: 2 * MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME },
      { id: "1w", offsetMinutes: 7 * MINUTES_PER_DAY, allDayTime: ALL_DAY_REMINDER_TIME }
    ];
    UNIT_MINUTES = {
      minute: 1,
      hour: 60,
      day: MINUTES_PER_DAY,
      week: 7 * MINUTES_PER_DAY
    };
  }
});

// src/domain/schedule/reminder.ts
var init_reminder = __esm({
  "src/domain/schedule/reminder.ts"() {
    "use strict";
    init_reminders();
  }
});

// src/domain/schedule/reminderRows.ts
var init_reminderRows = __esm({
  "src/domain/schedule/reminderRows.ts"() {
    "use strict";
    init_reminder();
    init_reminders();
  }
});

// src/domain/schedule/normalizeSchedule.ts
var init_normalizeSchedule = __esm({
  "src/domain/schedule/normalizeSchedule.ts"() {
    "use strict";
    init_reminders();
    init_types();
  }
});

// src/domain/schedule/recurrence.ts
var init_recurrence = __esm({
  "src/domain/schedule/recurrence.ts"() {
    "use strict";
  }
});

// src/domain/schedule/taskSchedule.ts
var init_taskSchedule = __esm({
  "src/domain/schedule/taskSchedule.ts"() {
    "use strict";
    init_normalizeSchedule();
    init_recurrence();
    init_reminder();
  }
});

// src/domain/tasks/taskState.ts
var init_taskState = __esm({
  "src/domain/tasks/taskState.ts"() {
    "use strict";
  }
});

// src/domain/schedule/reminderQueue.ts
var init_reminderQueue = __esm({
  "src/domain/schedule/reminderQueue.ts"() {
    "use strict";
    init_reminders();
    init_taskSchedule();
    init_taskState();
  }
});

// src/domain/schedule/scheduleMode.ts
var init_scheduleMode = __esm({
  "src/domain/schedule/scheduleMode.ts"() {
    "use strict";
  }
});

// src/domain/schedule/validateSchedule.ts
var init_validateSchedule = __esm({
  "src/domain/schedule/validateSchedule.ts"() {
    "use strict";
    init_scheduleQueries();
    init_types();
  }
});

// src/domain/schedule/scheduleEquality.ts
var init_scheduleEquality = __esm({
  "src/domain/schedule/scheduleEquality.ts"() {
    "use strict";
    init_normalizeSchedule();
    init_reminders();
  }
});

// src/utils/clock.ts
var init_clock = __esm({
  "src/utils/clock.ts"() {
    "use strict";
  }
});

// src/domain/schedule/scheduleFormatting.ts
var DATE_FORMAT, WITH_YEAR;
var init_scheduleFormatting = __esm({
  "src/domain/schedule/scheduleFormatting.ts"() {
    "use strict";
    init_scheduleQueries();
    init_clock();
    DATE_FORMAT = { month: "short", day: "numeric", timeZone: "UTC" };
    WITH_YEAR = { ...DATE_FORMAT, year: "numeric" };
  }
});

// src/domain/schedule/timeOptions.ts
var init_timeOptions = __esm({
  "src/domain/schedule/timeOptions.ts"() {
    "use strict";
    init_types();
  }
});

// src/domain/schedule/updateTaskSchedule.ts
var init_updateTaskSchedule = __esm({
  "src/domain/schedule/updateTaskSchedule.ts"() {
    "use strict";
    init_scheduleEquality();
    init_taskSchedule();
    init_validateSchedule();
    init_normalizeSchedule();
  }
});

// src/domain/schedule/calendarCells.ts
var init_calendarCells = __esm({
  "src/domain/schedule/calendarCells.ts"() {
    "use strict";
    init_scheduleCommands();
    init_scheduleQueries();
  }
});

// src/domain/schedule/editorState.ts
var init_editorState = __esm({
  "src/domain/schedule/editorState.ts"() {
    "use strict";
    init_quickDate();
    init_reminders();
    init_scheduleCommands();
    init_scheduleMode();
    init_scheduleQueries();
  }
});

// src/domain/schedule/index.ts
var init_schedule = __esm({
  "src/domain/schedule/index.ts"() {
    "use strict";
    init_types();
    init_quickDate();
    init_reminder();
    init_reminderRows();
    init_reminders();
    init_reminderQueue();
    init_recurrence();
    init_scheduleMode();
    init_scheduleCommands();
    init_scheduleQueries();
    init_normalizeSchedule();
    init_validateSchedule();
    init_scheduleEquality();
    init_scheduleFormatting();
    init_timeOptions();
    init_updateTaskSchedule();
    init_calendarCells();
    init_editorState();
    init_taskSchedule();
  }
});

// src/domain/focus/sessionLength.ts
var init_sessionLength = __esm({
  "src/domain/focus/sessionLength.ts"() {
    "use strict";
  }
});

// src/domain/backup/schedule.ts
var DEFAULT_BACKUP_KEEP, DAY_MS, PERIOD_MS;
var init_schedule2 = __esm({
  "src/domain/backup/schedule.ts"() {
    "use strict";
    DEFAULT_BACKUP_KEEP = 7;
    DAY_MS = 24 * 60 * 60 * 1e3;
    PERIOD_MS = {
      daily: DAY_MS,
      weekly: 7 * DAY_MS
    };
  }
});

// src/utils/calendarTime.ts
var HOURS_AT_A_TIME, MIN_HOURS_AT_A_TIME, MAX_HOURS_AT_A_TIME, HOURS_AT_A_TIME_CHOICES;
var init_calendarTime = __esm({
  "src/utils/calendarTime.ts"() {
    "use strict";
    HOURS_AT_A_TIME = 12;
    MIN_HOURS_AT_A_TIME = 6;
    MAX_HOURS_AT_A_TIME = 24;
    HOURS_AT_A_TIME_CHOICES = Array.from(
      { length: MAX_HOURS_AT_A_TIME - MIN_HOURS_AT_A_TIME + 1 },
      (_, index) => MIN_HOURS_AT_A_TIME + index
    );
  }
});

// src/utils/eisenhower.ts
var init_eisenhower = __esm({
  "src/utils/eisenhower.ts"() {
    "use strict";
  }
});

// src/domain/tasks/listColor.ts
var LIST_COLOR_PRESETS;
var init_listColor = __esm({
  "src/domain/tasks/listColor.ts"() {
    "use strict";
    LIST_COLOR_PRESETS = [
      { key: "red", hex: "#e5484d" },
      { key: "orange", hex: "#f76b15" },
      { key: "yellow", hex: "#ffb224" },
      { key: "lime", hex: "#99d52a" },
      { key: "green", hex: "#30a46c" },
      { key: "blue", hex: "#0a84ff" },
      { key: "indigo", hex: "#5b5bd6" },
      { key: "purple", hex: "#8e4ec6" }
    ];
  }
});

// src/utils/date.ts
var init_date = __esm({
  "src/utils/date.ts"() {
    "use strict";
  }
});

// src/domain/view/viewGroups.ts
var init_viewGroups = __esm({
  "src/domain/view/viewGroups.ts"() {
    "use strict";
    init_taskState();
    init_date();
  }
});

// src/domain/view/matrixGroups.ts
var MATRIX_QUADRANT_COLORS;
var init_matrixGroups = __esm({
  "src/domain/view/matrixGroups.ts"() {
    "use strict";
    init_listColor();
    init_viewGroups();
    MATRIX_QUADRANT_COLORS = LIST_COLOR_PRESETS.map((preset) => preset.key);
  }
});

// src/domain/view/viewRules.ts
function priorityRule(priority) {
  return { ...EMPTY_RULE, priorities: [priority] };
}
var EMPTY_RULE;
var init_viewRules = __esm({
  "src/domain/view/viewRules.ts"() {
    "use strict";
    init_viewGroups();
    init_date();
    EMPTY_RULE = {
      listIds: [],
      tagIds: [],
      dateBuckets: [],
      priorities: []
    };
  }
});

// src/domain/view/matrixRules.ts
var DEFAULT_MATRIX_RULES;
var init_matrixRules = __esm({
  "src/domain/view/matrixRules.ts"() {
    "use strict";
    init_eisenhower();
    init_viewRules();
    DEFAULT_MATRIX_RULES = {
      I: priorityRule("high"),
      II: priorityRule("medium"),
      III: priorityRule("low"),
      IV: priorityRule("none")
    };
  }
});

// src/domain/view/todayGroups.ts
var init_todayGroups = __esm({
  "src/domain/view/todayGroups.ts"() {
    "use strict";
    init_taskState();
    init_viewGroups();
  }
});

// src/domain/tasks/scopeRegistry.ts
var LIST_ONLY, ALL_VIEWS, scopeRegistry, TASK_SCOPE_KINDS;
var init_scopeRegistry = __esm({
  "src/domain/tasks/scopeRegistry.ts"() {
    "use strict";
    LIST_ONLY = ["list"];
    ALL_VIEWS = ["list", "board", "gantt"];
    scopeRegistry = {
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
    TASK_SCOPE_KINDS = Object.keys(scopeRegistry);
  }
});

// src/domain/view/scopeViewOptions.ts
var init_scopeViewOptions = __esm({
  "src/domain/view/scopeViewOptions.ts"() {
    "use strict";
    init_scopeRegistry();
  }
});

// src/domain/tasks/board.ts
var init_board = __esm({
  "src/domain/tasks/board.ts"() {
    "use strict";
    init_sections();
  }
});

// src/domain/view/inboxColumnRules.ts
var DEFAULT_INBOX_COLUMN_RULES;
var init_inboxColumnRules = __esm({
  "src/domain/view/inboxColumnRules.ts"() {
    "use strict";
    init_board();
    init_viewGroups();
    init_viewRules();
    DEFAULT_INBOX_COLUMN_RULES = {
      unsorted: { ...EMPTY_RULE, dateBuckets: ["none"] },
      scheduled: { ...EMPTY_RULE, dateBuckets: ["overdue", "today", "tomorrow", "later"] },
      someday: { ...EMPTY_RULE, dateBuckets: ["someday"] }
    };
  }
});

// src/domain/calendar/readableInk.ts
var init_readableInk = __esm({
  "src/domain/calendar/readableInk.ts"() {
    "use strict";
  }
});

// src/domain/calendar/itemColor.ts
var init_itemColor = __esm({
  "src/domain/calendar/itemColor.ts"() {
    "use strict";
    init_listColor();
    init_readableInk();
  }
});

// src/domain/calendar/viewOptions.ts
var init_viewOptions = __esm({
  "src/domain/calendar/viewOptions.ts"() {
    "use strict";
    init_itemColor();
  }
});

// src/domain/view/inboxColumns.ts
var init_inboxColumns = __esm({
  "src/domain/view/inboxColumns.ts"() {
    "use strict";
    init_board();
    init_inboxColumnRules();
  }
});

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
var DEFAULT_APP_SETTINGS;
var init_normalize = __esm({
  "src/domain/plannerData/normalize.ts"() {
    "use strict";
    init_spaces();
    init_hierarchy();
    init_tags();
    init_sections();
    init_templates();
    init_sidebarFolders();
    init_filters();
    init_checkItems();
    init_dailyPlan();
    init_schedule();
    init_sessionLength();
    init_schedule2();
    init_calendarTime();
    init_eisenhower();
    init_matrixGroups();
    init_matrixRules();
    init_todayGroups();
    init_scopeViewOptions();
    init_inboxColumnRules();
    init_board();
    init_viewOptions();
    init_inboxColumns();
    DEFAULT_APP_SETTINGS = {
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
  }
});

// src/server/errors.ts
var init_errors = __esm({
  "src/server/errors.ts"() {
    "use strict";
  }
});

// src/server/data/repository.ts
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
var TABLE_TO_KEY;
var init_repository = __esm({
  "src/server/data/repository.ts"() {
    "use strict";
    init_buildSyncPlan();
    init_normalize();
    init_errors();
    TABLE_TO_KEY = new Map(
      collectionTables.map(([key, table]) => [table, key])
    );
  }
});

// src/integrations/google/env.ts
function readGoogleOAuthEnv(env = process.env) {
  const clientId = (env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = (env.GOOGLE_REDIRECT_URI || "").trim();
  const missing = [
    !clientId && "GOOGLE_CLIENT_ID",
    !clientSecret && "GOOGLE_CLIENT_SECRET",
    !redirectUri && "GOOGLE_REDIRECT_URI"
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Google Calendar sync is not configured (missing env: ${missing.join(", ")}).`);
  }
  return { clientId, clientSecret, redirectUri };
}
function readServiceRoleEnv(env = process.env) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceRoleKey) {
    const missing = [!url && "SUPABASE_URL", !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ");
    throw new Error(`Google Calendar sync needs Supabase service access (missing env: ${missing}).`);
  }
  return { url: url.replace(/\/+$/, ""), serviceRoleKey };
}
var GOOGLE_CALENDAR_SCOPE;
var init_env = __esm({
  "src/integrations/google/env.ts"() {
    "use strict";
    GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
  }
});

// src/integrations/google/state.ts
function encodeOAuthState(state) {
  return `${state.nonce}.${state.platform}`;
}
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
var NONCE;
var init_state = __esm({
  "src/integrations/google/state.ts"() {
    "use strict";
    NONCE = /^[a-f0-9]{16,64}$/i;
  }
});

// src/integrations/google/oauth.ts
function authorizeUrl(env, state) {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}
async function postForm(endpoint, body, fetchImpl) {
  try {
    return await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString()
    });
  } catch {
    throw new GoogleOAuthError("Could not reach Google.", 502);
  }
}
async function describe(response, fallback) {
  try {
    const body = await response.json();
    const code = typeof body.error === "string" ? body.error : "";
    const detail = typeof body.error_description === "string" ? body.error_description : "";
    const message = [code, detail].filter(Boolean).join(": ");
    return message || fallback;
  } catch {
    return fallback;
  }
}
async function exchangeCode(code, env, fetchImpl = fetch) {
  const response = await postForm(
    TOKEN_ENDPOINT,
    {
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: "authorization_code"
    },
    fetchImpl
  );
  if (!response.ok) {
    throw new GoogleOAuthError(await describe(response, "Google refused the authorization code."), 400);
  }
  const body = await response.json();
  if (typeof body.refresh_token !== "string" || !body.refresh_token) {
    throw new GoogleOAuthError(
      "Google returned no refresh token. Disconnect the app under your Google account's third-party access and try again.",
      400
    );
  }
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new GoogleOAuthError("Google returned no access token.", 502);
  }
  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 3600,
    scope: typeof body.scope === "string" ? body.scope : ""
  };
}
async function refreshAccessToken(refreshToken, env, fetchImpl = fetch) {
  const response = await postForm(
    TOKEN_ENDPOINT,
    {
      refresh_token: refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: "refresh_token"
    },
    fetchImpl
  );
  if (!response.ok) {
    const message = await describe(response, "Google refused the refresh token.");
    throw new GoogleOAuthError(message, response.status === 400 || response.status === 401 ? 401 : 502);
  }
  const body = await response.json();
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new GoogleOAuthError("Google returned no access token.", 502);
  }
  return {
    accessToken: body.access_token,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 3600
  };
}
async function revokeToken(token, fetchImpl = fetch) {
  try {
    const response = await postForm(REVOKE_ENDPOINT, { token }, fetchImpl);
    return response.ok;
  } catch {
    return false;
  }
}
var AUTHORIZE_ENDPOINT, TOKEN_ENDPOINT, REVOKE_ENDPOINT, GoogleOAuthError;
var init_oauth = __esm({
  "src/integrations/google/oauth.ts"() {
    "use strict";
    init_env();
    AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
    TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
    REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
    GoogleOAuthError = class extends Error {
      constructor(message, status) {
        super(message);
        this.status = status;
        this.name = "GoogleOAuthError";
      }
    };
  }
});

// src/integrations/google/store.ts
function headers(env, extra = {}) {
  return {
    apikey: env.serviceRoleKey,
    Authorization: `Bearer ${env.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}
async function request(env, path, init, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${env.url}/rest/v1/${path}`, init);
  } catch {
    throw new TokenStoreError("Could not reach the database.", 502);
  }
  if (!response.ok) {
    throw new TokenStoreError(`Token store request failed (${response.status}).`, 502);
  }
  return response;
}
async function readRefreshToken(userId, fetchImpl = fetch, env = readServiceRoleEnv()) {
  const response = await request(
    env,
    `google_calendar_tokens?user_id=eq.${encodeURIComponent(userId)}&select=refresh_token`,
    { headers: headers(env) },
    fetchImpl
  );
  const rows = await response.json();
  const token = rows[0]?.refresh_token;
  return typeof token === "string" && token ? token : null;
}
async function writeRefreshToken(userId, refreshToken, scope, fetchImpl = fetch, env = readServiceRoleEnv()) {
  await request(
    env,
    "google_calendar_tokens",
    {
      method: "POST",
      headers: headers(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ user_id: userId, refresh_token: refreshToken, scope })
    },
    fetchImpl
  );
}
async function deleteRefreshToken(userId, fetchImpl = fetch, env = readServiceRoleEnv()) {
  await request(
    env,
    `google_calendar_tokens?user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: headers(env, { Prefer: "return=minimal" }) },
    fetchImpl
  );
}
async function deleteConnection(userId, fetchImpl = fetch, env = readServiceRoleEnv()) {
  await request(
    env,
    `google_calendar_connections?user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: headers(env, { Prefer: "return=minimal" }) },
    fetchImpl
  );
}
var TokenStoreError;
var init_store = __esm({
  "src/integrations/google/store.ts"() {
    "use strict";
    init_env();
    TokenStoreError = class extends Error {
      constructor(message, status) {
        super(message);
        this.status = status;
        this.name = "TokenStoreError";
      }
    };
  }
});

// src/integrations/google/index.ts
var google_exports = {};
__export(google_exports, {
  GOOGLE_CALENDAR_SCOPE: () => GOOGLE_CALENDAR_SCOPE,
  GoogleOAuthError: () => GoogleOAuthError,
  TokenStoreError: () => TokenStoreError,
  UnauthorizedError: () => UnauthorizedError,
  authorizeUrl: () => authorizeUrl,
  decodeOAuthState: () => decodeOAuthState,
  deleteConnection: () => deleteConnection,
  deleteRefreshToken: () => deleteRefreshToken,
  encodeOAuthState: () => encodeOAuthState,
  exchangeCode: () => exchangeCode,
  readGoogleOAuthEnv: () => readGoogleOAuthEnv,
  readRefreshToken: () => readRefreshToken,
  readServiceRoleEnv: () => readServiceRoleEnv,
  refreshAccessToken: () => refreshAccessToken,
  requireUser: () => requireUser,
  revokeToken: () => revokeToken,
  writeRefreshToken: () => writeRefreshToken
});
function lazyVerifier() {
  let inner = null;
  return {
    async verify(bearer) {
      inner ??= supabaseTokenVerifier({ issuer: issuerFor(readSupabaseEnv().url) });
      return inner.verify(bearer);
    }
  };
}
async function requireUser(authorization, verify = verifier) {
  const bearer = bearerFrom(authorization);
  if (!bearer) {
    throw new UnauthorizedError("missing_token", "Sign in to FocusFlow first.");
  }
  return verify.verify(bearer);
}
var verifier;
var init_google = __esm({
  "src/integrations/google/index.ts"() {
    "use strict";
    init_auth();
    init_protectedResource();
    init_jwks();
    init_repository();
    init_env();
    init_state();
    init_oauth();
    init_store();
    verifier = lazyVerifier();
  }
});

// src/functions/health.ts
async function handler(_req, res) {
  const report = { node: process.version };
  try {
    const shared = await Promise.resolve().then(() => (init_google(), google_exports));
    report.shared = typeof shared.authorizeUrl === "function" ? "ok" : "loaded, export missing";
  } catch (error) {
    report.shared = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(report);
}
export {
  handler as default
};
