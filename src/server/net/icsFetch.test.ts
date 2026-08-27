import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchIcsText, isBlockedHost, normalizeIcsUrl } from "./icsFetch";

describe("the host guard", () => {
  // A subscription URL is user input and this server will follow it. The
  // families below are the ones that turn "fetch my calendar" into "read the
  // machine you are running on".
  const blocked = [
    "localhost",
    "0.0.0.0",
    "printer.local",
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254", // the cloud metadata address
    "[::1]",
  ];

  it.each(blocked)("blocks %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it.each(["calendar.google.com", "p31-caldav.icloud.com", "outlook.office365.com", "172.32.0.1", "11.0.0.1"])(
    "allows %s",
    (host) => {
      expect(isBlockedHost(host)).toBe(false);
    },
  );

  it("holds the same line as the ICS proxy", () => {
    // The proxy is JavaScript on Vercel and cannot import this module yet, so
    // it still carries its own copy. Two copies of a security rule is one copy
    // too many; until Phase 4 unifies them, this is what stops them drifting.
    const proxy = readFileSync(resolve(__dirname, "../../../api/ics.js"), "utf8");
    for (const family of ["localhost", "0.0.0.0", ".local", "127\\.", "10\\.", "192\\.168\\.", "169\\.254\\."]) {
      expect(proxy).toContain(family);
    }
  });
});

describe("normalizeIcsUrl", () => {
  it("turns a webcal subscription into https", () => {
    expect(normalizeIcsUrl("webcal://example.com/a.ics")?.toString()).toBe("https://example.com/a.ics");
  });

  it("refuses a private host, a non-http scheme, and nonsense", () => {
    expect(normalizeIcsUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(normalizeIcsUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeIcsUrl("not a url")).toBeNull();
  });
});

describe("fetchIcsText", () => {
  const url = new URL("https://example.com/work.ics");
  const calendar = "BEGIN:VCALENDAR\nEND:VCALENDAR";

  function respond(body: string, init: ResponseInit = {}): typeof fetch {
    return (async () => new Response(body, { status: 200, ...init })) as unknown as typeof fetch;
  }

  it("returns the calendar text", async () => {
    await expect(fetchIcsText(url, { fetchImpl: respond(calendar) })).resolves.toContain("VCALENDAR");
  });

  it("refuses a body that is not a calendar", async () => {
    // A subscription URL that has quietly become a login page returns HTTP 200
    // and a pile of HTML. Parsing it yields zero events, which would read as
    // "your calendar is empty" — the confidently wrong answer again.
    await expect(fetchIcsText(url, { fetchImpl: respond("<html>Sign in</html>") })).rejects.toThrow(/not return a calendar/);
  });

  it("refuses a feed that is too large", async () => {
    const huge = `BEGIN:VCALENDAR${"x".repeat(50)}`;
    await expect(fetchIcsText(url, { fetchImpl: respond(huge), maxBytes: 10 })).rejects.toThrow(/too large/);
  });

  it("reports an upstream failure without repeating it", async () => {
    await expect(fetchIcsText(url, { fetchImpl: respond("nope", { status: 503 }) })).rejects.toThrow(/HTTP 503/);
  });
});
