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
async function authorizeGoogleToken(userId, protocol, expiresIn = null, fetchImpl = fetch, env = readServiceRoleEnv()) {
  const unavailable = () => new GoogleSyncProtocolError(
    "google_sync_policy_unavailable",
    503,
    "Google sync compatibility could not be verified. No access token was released."
  );
  if (![1, 2].includes(protocol) || expiresIn !== null && (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_GOOGLE_ACCESS_TOKEN_SECONDS)) {
    throw unavailable();
  }
  let response;
  try {
    response = await fetchImpl(`${env.url}/rest/v1/rpc/authorize_google_token`, {
      method: "POST",
      headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId, p_protocol: protocol, p_expires_in: expiresIn })
    });
  } catch {
    throw unavailable();
  }
  if (!response.ok) throw unavailable();
  const body = await response.json().catch(() => null);
  if (!body || typeof body.allowed !== "boolean" || ![1, 2].includes(Number(body.minimumProtocol)) || typeof body.minimumProtocol !== "number") throw unavailable();
  if (!body.allowed) throw new GoogleSyncProtocolError(
    "google_sync_update_required",
    426,
    "Update FocusFlow before syncing Google Calendar.",
    body.minimumProtocol
  );
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

// src/integrations/google/calendarBinding.ts
var CalendarBindingError = class extends Error {
  constructor(status, message = "Could not verify the dedicated calendar. The existing connection was kept.") {
    super(message);
    this.status = status;
    this.name = "CalendarBindingError";
  }
};
async function rpc(name, body, fetchImpl, env) {
  try {
    const response = await fetchImpl(`${env.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch {
    throw new CalendarBindingError(502);
  }
}
async function verifyDedicatedCalendar(calendarId, accessToken, verifiedEmail, fetchImpl = fetch, alreadyBound = false) {
  if (!calendarId.trim() || calendarId === "primary" || !verifiedEmail) throw new CalendarBindingError(409);
  try {
    const response = await fetchImpl(`https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "error"
    });
    if (!response.ok) throw new CalendarBindingError(response.status === 404 ? 409 : 502);
    const body = await response.json();
    if (body.id !== calendarId || body.primary === true || body.deleted === true || body.accessRole !== "owner" || !alreadyBound && body.summary !== "FocusFlow" || typeof body.dataOwner !== "string" || body.dataOwner.toLowerCase() !== verifiedEmail.toLowerCase() || typeof body.timeZone !== "string" || !body.timeZone.trim()) throw new CalendarBindingError(409);
    new Intl.DateTimeFormat("en", { timeZone: body.timeZone }).format(0);
    return { calendarId, timezone: body.timeZone };
  } catch (error) {
    if (error instanceof CalendarBindingError) throw error;
    throw new CalendarBindingError(502);
  }
}
async function bindDedicatedCalendar(userId, calendarId, fetchImpl = fetch, env = readServiceRoleEnv()) {
  const snapshot = await rpc("read_google_binding_snapshot", { p_user_id: userId }, fetchImpl, env);
  if (!snapshot || typeof snapshot.refreshToken !== "string" || !snapshot.refreshToken || typeof snapshot.subject !== "string" || !snapshot.subject || typeof snapshot.grantVersion !== "string" || !snapshot.grantVersion || snapshot.generation !== null && typeof snapshot.generation !== "string") throw new CalendarBindingError(409);
  const token = await refreshAccessToken(snapshot.refreshToken, readGoogleOAuthEnv(), fetchImpl);
  const identity = await verifyGoogleIdentity(token.accessToken, fetchImpl);
  if (identity.subject !== snapshot.subject) throw new CalendarBindingError(409);
  const knownCalendar = snapshot.boundCalendarId === calendarId || Array.isArray(snapshot.historicalCalendarIds) && snapshot.historicalCalendarIds.includes(calendarId);
  const calendar = await verifyDedicatedCalendar(calendarId, token.accessToken, identity.email, fetchImpl, knownCalendar);
  const result = await rpc("bind_verified_google_calendar", {
    p_user_id: userId,
    p_refresh_token: snapshot.refreshToken,
    p_subject: identity.subject,
    p_grant_version: snapshot.grantVersion,
    p_expected_generation: snapshot.generation,
    p_calendar_id: calendar.calendarId,
    p_timezone: calendar.timezone,
    p_email: identity.email
  }, fetchImpl, env);
  if (result?.bound !== true) throw new CalendarBindingError(409);
}

// src/functions/google/calendar.ts
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
    const protocol = requestedGoogleProtocol(req.headers);
    await authorizeGoogleToken(user.userId, protocol);
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    const calendarId = body && typeof body === "object" ? body.calendarId : null;
    if (typeof calendarId !== "string" || !calendarId.trim()) {
      res.status(400).json({ error: "Missing calendar ID." });
      return;
    }
    await bindDedicatedCalendar(user.userId, calendarId);
    res.status(200).json({ bound: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ code: error.reason, error: error.message });
      return;
    }
    if (error instanceof GoogleSyncProtocolError) {
      res.status(error.status).json({ code: error.code, error: error.message });
      return;
    }
    res.status(error instanceof CalendarBindingError ? error.status : 502).json({
      code: "google_calendar_verification_failed",
      error: "Could not verify the dedicated calendar. The existing connection was kept."
    });
  }
}
export {
  handler as default
};
