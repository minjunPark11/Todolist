// src/lib/ics/publish.ts
var MAX_OCTETS = 75;
var encoder = new TextEncoder();
function fold(line) {
  const pieces = [];
  let current = "";
  let used = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    const budget = pieces.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (used > 0 && used + size > budget) {
      pieces.push(current);
      current = "";
      used = 0;
    }
    current += character;
    used += size;
  }
  pieces.push(current);
  return pieces.join("\r\n ");
}
function escapeText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}
function isTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}
function compactDate(value) {
  return value.replace(/-/g, "");
}
function pad(value) {
  return String(value).padStart(2, "0");
}
function addDays(dateValue, days) {
  const date = /* @__PURE__ */ new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function endMoment(date, startTime, endTime) {
  if (isTime(endTime)) {
    return endTime > startTime ? { date, time: endTime } : { date: addDays(date, 1), time: endTime };
  }
  const [hour, minute] = startTime.split(":").map(Number);
  const next = hour + 1;
  return next > 23 ? { date: addDays(date, 1), time: `${pad(next - 24)}:${pad(minute)}` } : { date, time: `${pad(next)}:${pad(minute)}` };
}
function floating(date, time) {
  return `${compactDate(date)}T${time.replace(":", "")}00`;
}
function toUtcStamp(value) {
  const date = new Date(value);
  const usable = Number.isNaN(date.getTime()) ? /* @__PURE__ */ new Date() : date;
  return usable.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function isValidEvent(event) {
  const record = event;
  return Boolean(
    record?.uid && record?.title && typeof record?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.date)
  );
}
function eventToIcs(event, updatedAt) {
  const stamp = toUtcStamp(updatedAt);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}@focusflow`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `SUMMARY:${escapeText(event.title)}`
  ];
  if (isTime(event.startTime)) {
    const end = endMoment(event.date, event.startTime, event.endTime);
    lines.push(`DTSTART:${floating(event.date, event.startTime)}`);
    lines.push(`DTEND:${floating(end.date, end.time)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`);
  }
  lines.push("END:VEVENT");
  return lines;
}
function createIcs(snapshot, fallbackUpdatedAt) {
  const generatedAt = snapshot?.generatedAt || fallbackUpdatedAt;
  const events = Array.isArray(snapshot?.events) ? snapshot.events.filter(isValidEvent) : [];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FocusFlow//Calendar Share//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:FocusFlow",
    ...events.flatMap((event) => eventToIcs(event, generatedAt)),
    "END:VCALENDAR"
  ];
  return `${lines.map(fold).join("\r\n")}\r
`;
}

// src/functions/calendar/[token].ts
function resolveSupabaseUrl(raw) {
  const value = (raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const dashboard = url.pathname.match(/\/dashboard\/project\/([a-z0-9-]+)/i);
    if (dashboard && /(^|\.)supabase\.com$/i.test(url.hostname)) {
      return `https://${dashboard[1]}.supabase.co`;
    }
    return url.origin;
  } catch {
    return value;
  }
}
var SHARE_TOKEN = /^[a-f0-9]{48}$/i;
var supabaseUrl = resolveSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
var supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end("Method not allowed");
    return;
  }
  const token = String(first(req.query?.token) || "").replace(/\.ics$/i, "");
  if (!SHARE_TOKEN.test(token)) {
    res.status(404).end("Calendar not found");
    return;
  }
  if (!supabaseUrl || !supabaseKey) {
    const missing = [!supabaseUrl && "SUPABASE_URL", !supabaseKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ");
    res.status(500).end(`Calendar sharing is not configured (missing env: ${missing})`);
    return;
  }
  const query = `${supabaseUrl}/rest/v1/calendar_shares?select=data,updated_at&enabled=is.true&limit=1&token=eq.${encodeURIComponent(token)}`;
  let rows = [];
  try {
    const response = await fetch(query, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Accept: "application/json" }
    });
    if (!response.ok) {
      res.status(500).end(`Calendar lookup failed (${response.status})`);
      return;
    }
    const body = await response.json();
    rows = Array.isArray(body) ? body : [];
  } catch {
    res.status(500).end("Calendar lookup failed");
    return;
  }
  const row = rows[0];
  if (!row) {
    res.status(404).end("Calendar not found");
    return;
  }
  const ics = createIcs(
    row.data ?? null,
    typeof row.updated_at === "string" && row.updated_at ? row.updated_at : (/* @__PURE__ */ new Date()).toISOString()
  );
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).end(req.method === "HEAD" ? "" : ics);
}
export {
  SHARE_TOKEN,
  handler as default,
  resolveSupabaseUrl
};
