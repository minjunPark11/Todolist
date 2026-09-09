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
function bearerFrom(headerValue) {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1].trim() : null;
}

// src/server/mcp/protectedResource.ts
function issuerFor(supabaseUrl) {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
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
    throw new UnauthorizedError("invalid_token", `The signing keys at ${url} could not be reached.`);
  }
  if (!response.ok) {
    throw new UnauthorizedError("invalid_token", `The signing keys at ${url} came back ${response.status}.`);
  }
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

// src/domain/schedule/types.ts
var LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isLocalDate(value) {
  if (typeof value !== "string" || !LOCAL_DATE.test(value)) return false;
  const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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
  timezoneMode: "auto",
  aiModel: "",
  matrixHideCompleted: false
};

// src/server/supabaseOrigin.ts
function supabaseOrigin(value) {
  const trimmed = value.trim();
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
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
  return { url: supabaseOrigin(url), anonKey };
}

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
  return { url: supabaseOrigin(url), serviceRoleKey };
}

// src/domain/calendar/googleSync/protocol.ts
var GOOGLE_SYNC_PROTOCOL_HEADER = "x-focusflow-google-sync-protocol";
var MAX_GOOGLE_ACCESS_TOKEN_SECONDS = 3600;

// src/integrations/google/oauth.ts
var TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
function tokenLifetime(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_GOOGLE_ACCESS_TOKEN_SECONDS) {
    throw new GoogleOAuthError("Google returned an unsupported access token lifetime.", 502);
  }
  return value;
}
var GoogleOAuthError = class extends Error {
  constructor(message, status, remoteOutcomeKnown = false) {
    super(message);
    this.status = status;
    this.remoteOutcomeKnown = remoteOutcomeKnown;
    this.name = "GoogleOAuthError";
  }
};
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
    expiresIn: tokenLifetime(body.expires_in)
  };
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
async function requireUser(authorization, verify = verifier) {
  const bearer = bearerFrom(authorization);
  if (!bearer) {
    throw new UnauthorizedError("missing_token", "Sign in to FocusFlow first.");
  }
  return verify.verify(bearer);
}

// src/integrations/google/protocol.ts
var GoogleSyncProtocolError = class extends Error {
  constructor(code, status, message, minimumProtocol) {
    super(message);
    this.code = code;
    this.status = status;
    this.minimumProtocol = minimumProtocol;
    this.name = "GoogleSyncProtocolError";
  }
};
function requestedGoogleProtocol(headers) {
  const entries = Object.entries(headers).filter(([key]) => key.toLowerCase() === GOOGLE_SYNC_PROTOCOL_HEADER);
  const value = entries[0]?.[1];
  if (entries.length === 0) return 1;
  if (entries.length === 1 && (value === "1" || value === "2")) return Number(value);
  throw new GoogleSyncProtocolError("google_sync_update_required", 426, "Update FocusFlow before syncing Google Calendar.");
}

// src/integrations/google/taskOutbound.ts
import { randomUUID } from "node:crypto";

// src/domain/calendar/googleSync/taskInboundShape.ts
function normalizeTaskInboundFields(fields2) {
  return {
    title: fields2.title.trim() ? fields2.title : "(\uC81C\uBAA9 \uC5C6\uC74C)",
    description: fields2.description.replace(/\r\n?/g, "\n"),
    startDate: fields2.startDate === fields2.dueDate ? "" : fields2.startDate,
    dueDate: fields2.dueDate,
    startTime: fields2.startTime,
    endTime: fields2.endTime
  };
}
function sameTaskInboundFields(a, b) {
  return JSON.stringify(normalizeTaskInboundFields(a)) === JSON.stringify(normalizeTaskInboundFields(b));
}
function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00(?:\.0+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  if (!isLocalDate(value.slice(0, 10))) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
function wallFormatter(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
}
function wall(ms, formatter) {
  const parts = Object.fromEntries(formatter.formatToParts(ms).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return { date, time, stamp: Date.parse(`${date}T${time}:${parts.second}Z`) };
}
function ambiguous(ms, formatter) {
  const target = wall(ms, formatter).stamp;
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = ms + hours * 36e5;
    const offset = wall(sample, formatter).stamp - sample;
    const candidate = target - offset;
    if (candidate !== ms && wall(candidate, formatter).stamp === target) return true;
  }
  return false;
}
function toTaskInboundFields(item, timezone) {
  if (item.summary != null && typeof item.summary !== "string" || item.description != null && typeof item.description !== "string") {
    return { ok: false, reason: "invalid-event" };
  }
  const content = {
    title: typeof item.summary === "string" ? item.summary : "",
    description: typeof item.description === "string" ? item.description : ""
  };
  const start = item.start;
  const end = item.end;
  if (start?.date !== void 0 || end?.date !== void 0) {
    if (!isLocalDate(start?.date) || !isLocalDate(end?.date) || start?.dateTime !== void 0 || end?.dateTime !== void 0 || end.date <= start.date) {
      return { ok: false, reason: "invalid-event" };
    }
    const dueDate = new Date(Date.parse(`${end.date}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
    return { ok: true, fields: normalizeTaskInboundFields({
      ...content,
      startDate: start.date,
      dueDate,
      startTime: "",
      endTime: ""
    }) };
  }
  const from = instant(start?.dateTime);
  const to = instant(end?.dateTime);
  if (from === null || to === null || to <= from) return { ok: false, reason: "unsupported-schedule" };
  try {
    const formatter = wallFormatter(timezone);
    const a = wall(from, formatter);
    const b = wall(to, formatter);
    if (a.stamp % 6e4 !== 0 || b.stamp % 6e4 !== 0 || a.date !== b.date || a.time >= b.time || ambiguous(from, formatter) || ambiguous(to, formatter)) {
      return { ok: false, reason: "unsupported-schedule" };
    }
    return { ok: true, fields: normalizeTaskInboundFields({
      ...content,
      startDate: "",
      dueDate: a.date,
      startTime: a.time,
      endTime: b.time
    }) };
  } catch {
    return { ok: false, reason: "unsupported-schedule" };
  }
}

// src/domain/calendar/googleSync/taskOutboundPlan.ts
function resolveMinute(date, time, timezone) {
  const stamp = Date.parse(`${date}T${time}:00Z`);
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const wall2 = (ms) => {
    const p = Object.fromEntries(format.formatToParts(ms).map((part) => [part.type, part.value]));
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  };
  const candidates = /* @__PURE__ */ new Set();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = stamp + hours * 36e5;
    const candidate = stamp - (wall2(sample) - sample);
    if (wall2(candidate) === stamp) candidates.add(candidate);
  }
  return candidates.size === 1 ? new Date([...candidates][0]).toISOString() : null;
}
function toTaskSharedPatch(fields2, timezone) {
  const f = normalizeTaskInboundFields(fields2);
  if (!isLocalDate(f.dueDate) || f.startDate && (!isLocalDate(f.startDate) || f.startDate > f.dueDate)) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    const content = { summary: f.title, description: f.description };
    if (!f.startTime && !f.endTime) {
      const end2 = new Date(Date.parse(`${f.dueDate}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
      if (!isLocalDate(end2)) return null;
      return {
        ...content,
        start: { date: f.startDate || f.dueDate, dateTime: null, timeZone: null },
        end: { date: end2, dateTime: null, timeZone: null }
      };
    }
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (f.startDate || !time.test(f.startTime) || !time.test(f.endTime) || f.endTime <= f.startTime) return null;
    const start = resolveMinute(f.dueDate, f.startTime, timezone);
    const end = resolveMinute(f.dueDate, f.endTime, timezone);
    if (!start || !end) return null;
    return {
      ...content,
      start: { date: null, dateTime: start, timeZone: timezone },
      end: { date: null, dateTime: end, timeZone: timezone }
    };
  } catch {
    return null;
  }
}
function inspectTaskOutboundResult(intent, source) {
  const retry = { kind: "reconcile-required" };
  if (!source || source.id !== intent.eventId || source.status === "cancelled" || source.status !== void 0 && source.status !== "confirmed" && source.status !== "tentative" || source.recurringEventId !== void 0 || source.originalStartTime !== void 0 || source.recurrence !== void 0 && (!Array.isArray(source.recurrence) || !intent.allowRecurring && source.recurrence.length > 0) || typeof source.etag !== "string" || !source.etag.trim() || source.etag === "*") return retry;
  const shape = toTaskInboundFields(source, intent.timezone);
  return shape.ok && sameTaskInboundFields(shape.fields, intent.fields) ? { kind: "agree", base: shape.fields, etag: source.etag } : retry;
}

// src/domain/calendar/googleSync/taskRecurrence.ts
function taskRecurrence(task, timezone) {
  const kind = task.repeatType ?? "none";
  if (kind === "none") return [];
  if (!["daily", "weekly", "monthly", "yearly"].includes(String(kind))) return null;
  const interval = task.repeatInterval ?? 1, days = task.repeatDays ?? [];
  if (!Number.isSafeInteger(interval) || Number(interval) < 1 || Number(interval) > 999 || !Array.isArray(days) || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return null;
  const parts = [`FREQ=${String(kind).toUpperCase()}`];
  if (interval !== 1) parts.push(`INTERVAL=${interval}`);
  if (kind === "weekly" && days.length) parts.push(`BYDAY=${[...new Set(days)].sort((a, b) => a - b).map((d) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d]).join(",")}`);
  const end = task.repeatEndDate;
  if (end) {
    if (typeof end !== "string" || !isLocalDate(end) || end < String(task.startDate || task.dueDate || "")) return null;
    if (!task.startTime) parts.push(`UNTIL=${end.replace(/-/g, "")}`);
    else {
      try {
        const minute = resolveMinute(end, "23:59", timezone);
        if (!minute) return null;
        const until = new Date(Date.parse(minute) + 59e3).toISOString().replace(/[-:]/g, "").replace(".000", "");
        parts.push(`UNTIL=${until}`);
      } catch {
        return null;
      }
    }
  }
  return [`RRULE:${parts.join(";")}`];
}
function sameRecurrence(a, b) {
  const canonical = (value) => {
    if (value === void 0 || value === null) return "[]";
    if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) return null;
    return JSON.stringify(value.map((line) => line.startsWith("RRULE:") ? "RRULE:" + line.slice(6).split(";").filter((p) => p !== "INTERVAL=1").map((p) => p.startsWith("BYDAY=") ? "BYDAY=" + p.slice(6).split(",").sort().join(",") : p).sort().join(";") : line).sort());
  };
  const left = canonical(a);
  return left !== null && left === canonical(b);
}

// src/integrations/google/identity.ts
var GoogleIdentityError = class extends Error {
  constructor(code, status) {
    super(code === "google_identity_reconnect_required" ? "The existing Google account could not be matched. Disconnect the existing connection before connecting another account." : "Could not verify the Google account. No connection was replaced.");
    this.code = code;
    this.status = status;
    this.name = "GoogleIdentityError";
  }
};
async function verifyGoogleIdentity(accessToken, fetchImpl = fetch) {
  try {
    const response = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "error"
    });
    if (!response.ok) throw new Error();
    const body = await response.json();
    if (!body || typeof body.sub !== "string" || !body.sub.trim() || body.sub.length > 255 || body.sub !== body.sub.trim()) throw new Error();
    return { subject: body.sub, email: body.email_verified === true && typeof body.email === "string" ? body.email : "" };
  } catch {
    throw new GoogleIdentityError("google_identity_unavailable", 502);
  }
}

// src/lib/googleOccurrenceSync.ts
function matchesOccurrence(source, master, originalStart) {
  if (source.recurringEventId !== master || !source.originalStartTime || typeof source.originalStartTime !== "object") return false;
  const original = source.originalStartTime;
  return isLocalDate(originalStart) ? original.date === originalStart : typeof original.dateTime === "string" && Date.parse(original.dateTime) === Date.parse(originalStart);
}

// src/integrations/google/occurrenceOutbound.ts
function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid occurrence response.");
  return value;
}
function text(value) {
  if (typeof value !== "string" || !value) throw new Error("Missing occurrence identity.");
  return value;
}
function address(op) {
  return {
    master: text(op.masterEventId),
    original: text(op.originalStart),
    eventId: text(op.eventId),
    calendarId: text(op.calendarId),
    generation: text(op.generation),
    timezone: text(op.timezone)
  };
}
function agreed(op, source) {
  const shape = toTaskInboundFields(source, text(op.timezone));
  return shape.ok && sameTaskInboundFields(shape.fields, op.fields) ? shape.fields : null;
}
async function runOccurrenceOperation(op, deps, finish) {
  let sent = false;
  try {
    const a = address(op), reserved = record(op.source), etag = typeof reserved.etag === "string" ? reserved.etag : "";
    if (etag === "*" || reserved.id !== a.eventId || !matchesOccurrence(reserved, a.master, a.original)) return await finish("rejected");
    const access = await deps.accessToken(a);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(a.calendarId)}/events/${encodeURIComponent(a.eventId)}`;
    const headers = { Authorization: `Bearer ${access}`, "Content-Type": "application/json" };
    const read = await deps.fetch(url, { headers, redirect: "error" });
    if (!read.ok) return await finish("rejected");
    const source = record(await read.json());
    if (source.id !== a.eventId || !matchesOccurrence(source, a.master, a.original)) return await finish("rejected");
    const normalized = (value) => ({ ...value, originalStartTime: reserved.originalStartTime });
    if (op.kind === "occurrence-delete" && source.status === "cancelled") return await finish("applied", normalized(source));
    if (!etag || source.etag !== etag || source.status === "cancelled") return await finish("rejected");
    const remote = toTaskInboundFields(source, a.timezone);
    if (!remote.ok || !sameTaskInboundFields(remote.fields, op.remote)) return await finish("rejected");
    const patch = op.kind === "occurrence-patch" ? toTaskSharedPatch(op.fields, a.timezone) : null;
    if (op.kind === "occurrence-patch" && !patch) return await finish("rejected");
    sent = true;
    const write = await deps.fetch(url, {
      method: patch ? "PATCH" : "DELETE",
      redirect: "error",
      headers: { ...headers, "If-Match": etag },
      ...patch ? { body: JSON.stringify(patch) } : {}
    });
    if (write.status >= 400 && write.status < 500 && write.status !== 408) return await finish("rejected");
    if (!write.ok) return await finish("uncertain");
    if (!patch) return await finish("applied", normalized({ ...source, status: "cancelled" }));
    const result = record(await write.json());
    if (result.id !== a.eventId || !matchesOccurrence(result, a.master, a.original) || result.status === "cancelled" || typeof result.etag !== "string" || !result.etag || result.etag === "*" || result.etag === etag) return await finish("uncertain");
    const base = agreed(op, result);
    return base ? await finish("applied", normalized(result), base) : await finish("uncertain");
  } catch {
    return finish(sent ? "uncertain" : "rejected");
  }
}
async function reconcileOccurrenceOperation(userId, operationId, op, deps) {
  const a = address(op), access = await deps.accessToken(a);
  const response = await deps.fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(a.calendarId)}/events/${encodeURIComponent(a.eventId)}`,
    { headers: { Authorization: `Bearer ${access}` }, redirect: "error" }
  );
  if (!response.ok) return { state: "pending" };
  const source = record(await response.json());
  if (source.id !== a.eventId || !matchesOccurrence(source, a.master, a.original)) return { state: "pending" };
  const cancelled = source.status === "cancelled";
  if (!(op.kind === "occurrence-delete" && cancelled) && (typeof source.etag !== "string" || !source.etag || source.etag === "*" || source.etag === op.etag)) return { state: "pending" };
  const fields2 = !cancelled && op.kind === "occurrence-patch" ? agreed(op, source) : null;
  const outcome = op.kind === "occurrence-delete" ? cancelled ? "applied" : "superseded" : fields2 ? "applied" : "superseded";
  const saved = record(op.source);
  const args = {
    p_user_id: userId,
    p_operation_id: operationId,
    p_dispatch_id: text(op.dispatchId),
    p_outcome: outcome,
    p_source: { ...source, originalStartTime: saved.originalStartTime },
    p_fields: fields2
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = record(await deps.rpc("finish_google_task_outbound", args));
      if (result.finished === true && (result.state === "completed" || result.state === "aborted")) return { state: result.state };
    } catch {
    }
  }
  return { state: "pending" };
}

// src/integrations/google/taskOutbound.ts
var GoogleTaskOutboundError = class extends Error {
  constructor() {
    super("The Google task write needs reconciliation before another attempt.");
    this.name = "GoogleTaskOutboundError";
  }
};
function object2(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GoogleTaskOutboundError();
  return value;
}
function text2(value) {
  if (typeof value !== "string" || !value.trim()) throw new GoogleTaskOutboundError();
  return value;
}
function fields(value) {
  const v = object2(value);
  const names = ["title", "description", "startDate", "dueDate", "startTime", "endTime"];
  if (Object.keys(v).length !== names.length || names.some((k) => typeof v[k] !== "string")) throw new GoogleTaskOutboundError();
  return v;
}
async function runReservedGoogleTaskOutbound(userId, operationId, deps) {
  const dispatchId = deps.uuid();
  const identity = { p_user_id: userId, p_operation_id: operationId, p_dispatch_id: dispatchId };
  const begin = object2(await deps.rpc("begin_google_task_outbound", identity));
  if (begin.send === false) {
    if (begin.state === "running" || begin.state === "uncertain") return reconcileGoogleTaskOutbound(userId, operationId, deps);
    return { state: begin.state === "completed" || begin.state === "aborted" ? begin.state : "pending" };
  }
  if (begin.send !== true) throw new GoogleTaskOutboundError();
  const finish = async (outcome, source = null, agreed2 = null) => {
    const args = { ...identity, p_outcome: outcome, p_source: source, p_fields: agreed2 };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const receipt = object2(await deps.rpc("finish_google_task_outbound", args));
        if (outcome === "uncertain" && receipt.state === "uncertain") return { state: "pending" };
        const state = outcome === "applied" ? "completed" : "aborted";
        if (receipt.finished === true && receipt.state === state) return { state };
      } catch {
      }
    }
    throw new GoogleTaskOutboundError();
  };
  if (begin.kind === "occurrence-patch" || begin.kind === "occurrence-delete") return runOccurrenceOperation(begin, deps, finish);
  if (begin.kind === "create" || begin.kind === "delete") return runEventOperation(begin, operationId, deps, finish);
  let sent = false;
  try {
    const calendarId = text2(begin.calendarId), eventId = text2(begin.eventId), generation = text2(begin.generation);
    const timezone = text2(begin.timezone), desired = fields(begin.fields), remote = fields(begin.remote);
    const reservedSource = object2(begin.source), etag = text2(reservedSource.etag);
    const patch = toTaskSharedPatch(desired, timezone);
    const recurrence = begin.kind === "recurrence" ? taskRecurrence({ ...desired, ...object2(begin.repeatTask) }, timezone) : void 0;
    if (!patch || recurrence === null || reservedSource.id !== eventId || etag === "*" || begin.kind !== "recurrence" && sameTaskInboundFields(desired, remote)) return await finish("rejected");
    const accessToken = await deps.accessToken({ generation, calendarId });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const response = await deps.fetch(url, { headers, redirect: "error" });
    if (!response.ok) return await finish("rejected");
    const observed = object2(await response.json());
    const shape = toTaskInboundFields(observed, timezone);
    if (observed.id !== eventId || observed.etag !== etag || observed.status === "cancelled" || observed.status !== void 0 && observed.status !== "confirmed" && observed.status !== "tentative" || observed.recurringEventId !== void 0 || observed.originalStartTime !== void 0 || observed.recurrence !== void 0 && !Array.isArray(observed.recurrence) || !shape.ok || !sameTaskInboundFields(shape.fields, remote)) return await finish("rejected");
    sent = true;
    const written = await deps.fetch(url, {
      method: "PATCH",
      redirect: "error",
      headers: { ...headers, "Content-Type": "application/json", "If-Match": etag },
      body: JSON.stringify(recurrence === void 0 ? patch : { start: patch.start, end: patch.end, recurrence })
    });
    if (written.status >= 400 && written.status < 500 && written.status !== 408) return await finish("rejected");
    if (!written.ok) return await finish("uncertain");
    const source = object2(await written.json());
    const result = inspectTaskOutboundResult({ eventId, fields: desired, timezone, allowRecurring: true }, source);
    if (result.kind !== "agree" || result.etag === etag || recurrence !== void 0 && !sameRecurrence(source.recurrence, recurrence)) return await finish("uncertain");
    return await finish("applied", source, result.base);
  } catch {
    return await finish(sent ? "uncertain" : "rejected");
  }
}
async function runEventOperation(begin, operationId, deps, finish) {
  let sent = false;
  try {
    const calendarId = text2(begin.calendarId), eventId = text2(begin.eventId), generation = text2(begin.generation), timezone = text2(begin.timezone);
    const access = await deps.accessToken({ generation, calendarId });
    const root = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const headers = { Authorization: `Bearer ${access}`, "Content-Type": "application/json" };
    if (begin.kind === "create") {
      const desired = fields(begin.fields), patch = toTaskSharedPatch(desired, timezone);
      const recurrence = taskRecurrence({ ...desired, ...object2(begin.repeatTask ?? {}) }, timezone);
      if (!patch || !recurrence || !/^ff[0-9a-f]{32}$/.test(eventId)) return await finish("rejected");
      const clean = (value) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null));
      const body = {
        ...patch,
        start: clean(patch.start),
        end: clean(patch.end),
        id: eventId,
        ...recurrence.length ? { recurrence } : {},
        extendedProperties: { private: { focusflowOperation: operationId } }
      };
      sent = true;
      const response2 = await deps.fetch(root, { method: "POST", headers, redirect: "error", body: JSON.stringify(body) });
      if (!response2.ok) return await finish("uncertain");
      const source2 = object2(await response2.json());
      const result = inspectTaskOutboundResult({ eventId, fields: desired, timezone, allowRecurring: true }, source2);
      if (result.kind !== "agree" || !sameRecurrence(source2.recurrence, recurrence) || !createdByOperation(source2, operationId)) return await finish("uncertain");
      return await finish("applied", source2, result.base);
    }
    const url = `${root}/${encodeURIComponent(eventId)}`;
    const response = await deps.fetch(url, { headers, redirect: "error" });
    if (response.status === 404 || response.status === 410) return await finish("applied", { id: eventId, status: "cancelled" });
    if (!response.ok) return await finish("rejected");
    const source = object2(await response.json());
    if (source.id !== eventId || source.recurringEventId !== void 0 || source.originalStartTime !== void 0) return await finish("rejected");
    if (source.status === "cancelled") return await finish("applied", source);
    const etag = text2(source.etag);
    if (etag === "*" || etag !== object2(begin.source).etag) return await finish("rejected");
    sent = true;
    const removed = await deps.fetch(url, { method: "DELETE", headers: { ...headers, "If-Match": etag }, redirect: "error" });
    if (removed.status === 412) return await finish("rejected");
    if (!removed.ok && removed.status !== 404 && removed.status !== 410) return await finish("uncertain");
    return await finish("applied", { ...source, status: "cancelled" });
  } catch {
    return await finish(sent ? "uncertain" : "rejected");
  }
}
function createdByOperation(source, operationId) {
  try {
    return object2(object2(source.extendedProperties).private).focusflowOperation === operationId;
  } catch {
    return false;
  }
}
async function reconcileGoogleTaskOutbound(userId, operationId, deps) {
  try {
    const op = object2(await deps.rpc("read_google_task_outbound", { p_user_id: userId, p_operation_id: operationId }));
    if (op.state === "completed") return { state: "completed" };
    if (op.state !== "running" && op.state !== "uncertain") return { state: "pending" };
    if (op.kind === "occurrence-patch" || op.kind === "occurrence-delete") return await reconcileOccurrenceOperation(userId, operationId, op, deps);
    const calendarId = text2(op.calendarId), eventId = text2(op.eventId), generation = text2(op.generation);
    const desired = op.kind === "delete" ? null : fields(op.fields), timezone = text2(op.timezone), dispatchId = text2(op.dispatchId);
    const access = await deps.accessToken({ generation, calendarId });
    const response = await deps.fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${access}` }, redirect: "error" }
    );
    const absent = op.kind === "delete" && (response.status === 404 || response.status === 410);
    if (!response.ok && !absent) return { state: "pending" };
    const source = absent ? { id: eventId, status: "cancelled" } : object2(await response.json());
    const result = desired ? inspectTaskOutboundResult({ eventId, fields: desired, timezone, allowRecurring: op.kind !== "create" }, source) : null;
    let outcome = "applied", agreed2 = result?.kind === "agree" ? result.base : null;
    if (source.id !== eventId || source.recurringEventId !== void 0 || source.originalStartTime !== void 0) return { state: "pending" };
    if (op.kind === "delete") {
      if (source.status !== "cancelled") outcome = "superseded";
    } else if (op.kind === "create") {
      const shape = toTaskInboundFields(source, timezone);
      if (!createdByOperation(source, operationId) || !shape.ok || source.status === "cancelled") return { state: "pending" };
      outcome = "observed";
      agreed2 = shape.fields;
    } else if (!result || result.kind !== "agree") outcome = "superseded";
    if (op.kind === "recurrence") {
      const recurrence = taskRecurrence({ ...desired, ...object2(op.repeatTask) }, timezone);
      if (!recurrence || !sameRecurrence(source.recurrence, recurrence)) outcome = "superseded";
    }
    if (op.kind !== "create" && !absent && source.status !== "cancelled" && (typeof source.etag !== "string" || !source.etag || source.etag === "*" || source.etag === op.etag)) return { state: "pending" };
    if (outcome === "superseded") agreed2 = null;
    const args = {
      p_user_id: userId,
      p_operation_id: operationId,
      p_dispatch_id: dispatchId,
      p_outcome: outcome,
      p_source: source,
      p_fields: agreed2
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const receipt = object2(await deps.rpc("finish_google_task_outbound", args));
        if (receipt.finished === true && receipt.state === "completed") return { state: "completed" };
        if (receipt.finished === true && receipt.state === "aborted") return { state: "aborted" };
      } catch {
      }
    }
  } catch {
  }
  return { state: "pending" };
}
async function executeGoogleTaskOutbound(userId, operationId, fetchImpl = fetch, env = readServiceRoleEnv()) {
  const rpc = async (name, body) => {
    const response = await fetchImpl(`${env.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      redirect: "error",
      headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new GoogleTaskOutboundError();
    return response.json();
  };
  return runReservedGoogleTaskOutbound(userId, operationId, {
    rpc,
    fetch: fetchImpl,
    uuid: randomUUID,
    accessToken: async (binding) => {
      const stored = object2(await rpc("read_google_binding_snapshot", { p_user_id: userId }));
      if (stored.generation !== binding.generation || stored.boundCalendarId !== binding.calendarId) throw new GoogleTaskOutboundError();
      const grant = await refreshAccessToken(text2(stored.refreshToken), readGoogleOAuthEnv(), fetchImpl);
      const identity = await verifyGoogleIdentity(grant.accessToken, fetchImpl);
      if (identity.subject !== stored.subject) throw new GoogleTaskOutboundError();
      return grant.accessToken;
    }
  });
}

// src/functions/google/task-write.ts
async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }
  try {
    const bearer = req.headers.authorization;
    const user = await requireUser(Array.isArray(bearer) ? bearer[0] : bearer);
    if (requestedGoogleProtocol(req.headers) !== 2) {
      throw new GoogleSyncProtocolError("google_sync_update_required", 426, "Update FocusFlow before syncing Google Calendar.");
    }
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    const id = body && typeof body === "object" ? body.operationId : null;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ code: "invalid_operation_id", error: "A reserved operation ID is required." });
      return;
    }
    const result = await executeGoogleTaskOutbound(user.userId, id);
    res.status(result.state === "pending" ? 202 : 200).json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ code: error.reason, error: error.message });
      return;
    }
    if (error instanceof GoogleSyncProtocolError) {
      res.status(error.status).json({ code: error.code, error: error.message });
      return;
    }
    res.status(503).json({ code: "google_task_write_pending", error: "The Google task write needs reconciliation before another attempt." });
  }
}
export {
  handler as default
};
