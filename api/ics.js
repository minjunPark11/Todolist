// Same-origin proxy for external ICS feeds. Google Calendar (and most ICS
// hosts) do not send CORS headers, so the browser cannot fetch them directly;
// the client falls back to GET /api/ics?url=<encoded> which fetches
// server-side and relays the calendar text.

const MAX_ICS_BYTES = 5_000_000;

function isBlockedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local")) return true;
  // IPv6 literals (URL keeps the brackets) — block wholesale.
  if (host.includes(":") || host.startsWith("[")) return true;
  return (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end("Method not allowed");
    return;
  }

  const raw = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!raw) {
    res.status(400).end("Missing url parameter");
    return;
  }

  let target;
  try {
    target = new URL(String(raw).replace(/^webcal:\/\//i, "https://"));
  } catch {
    res.status(400).end("Invalid url");
    return;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    res.status(400).end("Only http(s) and webcal urls are supported");
    return;
  }
  if (isBlockedHost(target.hostname)) {
    res.status(400).end("This host is not allowed");
    return;
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": "FocusFlow-Calendar/1.0 (+ics-sync)",
        Accept: "text/calendar, text/plain, */*",
      },
    });
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? "timed out" : "failed";
    res.status(502).end(`Upstream request ${reason}`);
    return;
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    res.status(502).end(`Upstream HTTP ${upstream.status}`);
    return;
  }
  if (text.length > MAX_ICS_BYTES) {
    res.status(413).end("Calendar feed is too large");
    return;
  }
  if (!text.toUpperCase().includes("BEGIN:VCALENDAR")) {
    res.status(502).end("Upstream response is not an ICS calendar");
    return;
  }

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).end(req.method === "HEAD" ? "" : text);
}
