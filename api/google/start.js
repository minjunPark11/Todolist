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
  aiModel: "",
  matrixHideCompleted: false
};

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

// src/integrations/google/env.ts
var GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
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

// src/integrations/google/oauth.ts
var AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
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

// src/functions/google/start.ts
function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
function handler(req, res) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end("Method not allowed");
    return;
  }
  const state = first(req.query?.state);
  if (!decodeOAuthState(state)) {
    res.status(400).json({ error: "Missing or malformed state." });
    return;
  }
  let env;
  try {
    env = readGoogleOAuthEnv();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Not configured." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", authorizeUrl(env, state));
  res.status(302).end();
}
export {
  handler as default
};
