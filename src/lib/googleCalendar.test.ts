import { describe, expect, it, vi } from "vitest";
import {
  currentAccessToken,
  disconnect,
  ensureDedicatedCalendar,
  exchangeCodeForAccess,
  GoogleCalendarError,
  type GoogleCalendarDeps,
  type GoogleConnection,
} from "./googleCalendar";

interface Route {
  status?: number;
  body?: unknown;
  throws?: boolean;
}

/**
 * A fetch that answers from a table of URL fragments, and records what it was
 * asked. Anything unrouted is a 404, so a test that expects a call it did not
 * declare fails loudly rather than passing on a default.
 */
function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((fragment) => url.includes(fragment));
    const route = key ? routes[key] : { status: 404, body: { error: "not routed" } };
    if (route.throws) throw new TypeError("network down");
    return {
      ok: (route.status ?? 200) < 400,
      status: route.status ?? 200,
      json: async () => route.body ?? null,
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function deps(overrides: Partial<GoogleCalendarDeps> = {}): GoogleCalendarDeps {
  return {
    fetch: fakeFetch({}).impl,
    authToken: async () => "session-token",
    readConnection: async () => null,
    writeConnection: async () => undefined,
    ...overrides,
  };
}

describe("spending the code", () => {
  it("posts it as the signed-in user and hands back the access token", async () => {
    const { impl, calls } = fakeFetch({ "/api/google/connect": { body: { accessToken: "ya29.abc" } } });

    await expect(exchangeCodeForAccess("code-1", deps({ fetch: impl }))).resolves.toBe("ya29.abc");
    expect(calls[0].url).toBe("/api/google/connect");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer session-token");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ code: "code-1" });
  });

  it("refuses before the network when nobody is signed in", async () => {
    const { impl, calls } = fakeFetch({});
    await expect(exchangeCodeForAccess("code-1", deps({ fetch: impl, authToken: async () => null }))).rejects.toThrow(
      GoogleCalendarError,
    );
    expect(calls).toHaveLength(0);
  });

  it("reads a 401 as a lost FocusFlow session, not a Google failure", async () => {
    const { impl } = fakeFetch({ "/api/google/connect": { status: 401, body: { error: "no" } } });
    await expect(exchangeCodeForAccess("code-1", deps({ fetch: impl }))).rejects.toMatchObject({
      reason: "signedOut",
    });
  });

  it("reports an unreachable server as a network failure", async () => {
    const { impl } = fakeFetch({ "/api/google/connect": { throws: true } });
    await expect(exchangeCodeForAccess("code-1", deps({ fetch: impl }))).rejects.toMatchObject({ reason: "network" });
  });
});

describe("the hour-long token", () => {
  it("is null for an account that has never connected", async () => {
    const { impl } = fakeFetch({ "/api/google/token": { body: { connected: false } } });
    await expect(currentAccessToken(deps({ fetch: impl }))).resolves.toBeNull();
  });

  it("comes back when there is a grant behind it", async () => {
    const { impl } = fakeFetch({ "/api/google/token": { body: { connected: true, accessToken: "ya29.xyz" } } });
    await expect(currentAccessToken(deps({ fetch: impl }))).resolves.toBe("ya29.xyz");
  });
});

describe("the dedicated calendar", () => {
  const primary = { "/calendars/primary": { body: { id: "person@example.com" } } };

  it("is created when the account has never had one", async () => {
    const written: GoogleConnection[] = [];
    const { impl, calls } = fakeFetch({ ...primary, "/calendars": { body: { id: "cal-new" } } });

    const connection = await ensureDedicatedCalendar(
      "ya29.abc",
      deps({ fetch: impl, writeConnection: async (row) => void written.push(row) }),
    );

    expect(connection).toEqual({ calendarId: "cal-new", accountEmail: "person@example.com" });
    expect(written).toEqual([connection]);
    const create = calls.find((call) => call.init?.method === "POST");
    expect(JSON.parse(String(create?.init?.body))).toEqual({ summary: "FocusFlow" });
  });

  it("reuses the stored one rather than leaving empty calendars behind", async () => {
    const { impl, calls } = fakeFetch({ ...primary, "/calendars/cal-known": { body: { id: "cal-known" } } });

    const connection = await ensureDedicatedCalendar(
      "ya29.abc",
      deps({ fetch: impl, readConnection: async () => ({ calendarId: "cal-known", accountEmail: "" }) }),
    );

    expect(connection.calendarId).toBe("cal-known");
    expect(calls.some((call) => call.init?.method === "POST")).toBe(false);
  });

  it("makes a new one when the user deleted it in Google", async () => {
    const { impl } = fakeFetch({
      ...primary,
      "/calendars/cal-gone": { status: 404, body: { error: "gone" } },
      "/calendars": { body: { id: "cal-remade" } },
    });

    const connection = await ensureDedicatedCalendar(
      "ya29.abc",
      deps({ fetch: impl, readConnection: async () => ({ calendarId: "cal-gone", accountEmail: "" }) }),
    );

    expect(connection.calendarId).toBe("cal-remade");
  });

  it("stops rather than duplicating when Google fails for any other reason", async () => {
    const { impl } = fakeFetch({
      ...primary,
      "/calendars/cal-known": { status: 500, body: { error: "boom" } },
      "/calendars": { body: { id: "cal-should-not-be-made" } },
    });

    await expect(
      ensureDedicatedCalendar(
        "ya29.abc",
        deps({ fetch: impl, readConnection: async () => ({ calendarId: "cal-known", accountEmail: "" }) }),
      ),
    ).rejects.toMatchObject({ reason: "google" });
  });

  it("keeps the address it had when the primary calendar cannot be read", async () => {
    const { impl } = fakeFetch({
      "/calendars/cal-known": { body: { id: "cal-known" } },
      "/calendars/primary": { status: 500, body: null },
    });

    const connection = await ensureDedicatedCalendar(
      "ya29.abc",
      deps({ fetch: impl, readConnection: async () => ({ calendarId: "cal-known", accountEmail: "old@example.com" }) }),
    );

    expect(connection.accountEmail).toBe("old@example.com");
  });
});

describe("disconnecting", () => {
  it("reports a grant Google still holds rather than hiding it", async () => {
    const { impl } = fakeFetch({ "/api/google/disconnect": { body: { disconnected: true, revoked: false } } });
    await expect(disconnect(deps({ fetch: impl }))).resolves.toEqual({ revoked: false });
  });
});
