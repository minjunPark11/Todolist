import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end("Method not allowed");
    return;
  }

  const rawToken = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  const token = String(rawToken || "").replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{48}$/i.test(token)) {
    res.status(404).end("Calendar not found");
    return;
  }

  if (!supabaseUrl || !supabaseKey) {
    const missing = [!supabaseUrl && "SUPABASE_URL", !supabaseKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ");
    res.status(500).end(`Calendar sharing is not configured (missing env: ${missing})`);
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("calendar_shares")
    .select("data, updated_at")
    .eq("token", token)
    .eq("enabled", true)
    .maybeSingle();

  if (error) {
    res.status(500).end(`Calendar lookup failed: ${error.message || error.code || "unknown error"}`);
    return;
  }
  if (!data) {
    res.status(404).end("Calendar not found");
    return;
  }

  const ics = createIcs(data.data, data.updated_at || new Date().toISOString());
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).end(req.method === "HEAD" ? "" : ics);
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
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function eventToIcs(event, updatedAt) {
  const stamp = toUtcStamp(updatedAt);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}@focusflow`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (isTime(event.startTime)) {
    lines.push(`DTSTART:${toFloatingDateTime(event.date, event.startTime)}`);
    lines.push(`DTEND:${toFloatingDateTime(event.date, isTime(event.endTime) ? event.endTime : addOneHour(event.startTime))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`);
  }

  lines.push("END:VEVENT");
  return lines;
}

function isValidEvent(event) {
  return Boolean(event?.uid && event?.title && event?.date && /^\d{4}-\d{2}-\d{2}$/.test(event.date));
}

function escapeText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function isTime(value) {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value));
}

function compactDate(value) {
  return value.replace(/-/g, "");
}

function toFloatingDateTime(date, time) {
  return `${compactDate(date)}T${time.replace(":", "")}00`;
}

function toUtcStamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addOneHour(time) {
  const [hour, minute] = time.split(":").map(Number);
  return `${String(Math.min(hour + 1, 23)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
