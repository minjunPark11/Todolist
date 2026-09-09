import { expect, it, vi, afterEach } from "vitest";
import { bindDedicatedCalendar, verifyDedicatedCalendar } from "./calendarBinding";
const source = { id: "cal", summary: "FocusFlow", accessRole: "owner", dataOwner: "me@example.com", timeZone: "Asia/Seoul" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllEnvs());
it("checks current data ownership and timezone rather than owner role alone", async () => {
  expect(await verifyDedicatedCalendar("cal", "access", "me@example.com", vi.fn().mockResolvedValue(reply(source)))).toEqual({ calendarId: "cal", timezone: "Asia/Seoul" });
});
it.each([{ dataOwner: "someone@example.com" }, { dataOwner: undefined }, { accessRole: "writer" },
  { primary: true }, { deleted: true }, { id: "other" }, { summary: "Personal" }, { timeZone: "" }, { timeZone: "Invalid/Zone" }])("rejects an unsuitable calendar %j", async change => {
  await expect(verifyDedicatedCalendar("cal", "access", "me@example.com", vi.fn().mockResolvedValue(reply({ ...source, ...change })))).rejects.toThrow();
});
it("permits a renamed calendar only after that exact ID was bound", async () => {
  expect(await verifyDedicatedCalendar("cal", "access", "me@example.com", vi.fn().mockResolvedValue(reply({ ...source, summary: "Renamed" })), true)).toHaveProperty("calendarId", "cal");
});
it("never replaces failed verification with device timezone or a 404 deletion", async () => {
  await expect(verifyDedicatedCalendar("cal", "access", "me@example.com", vi.fn().mockResolvedValue(reply({}, 404)))).rejects.toMatchObject({ status: 409 });
  await expect(verifyDedicatedCalendar("cal", "access", "me@example.com", vi.fn().mockRejectedValue(new Error("offline")))).rejects.toMatchObject({ status: 502 });
});
it("uses a stored grant and carries its version plus connection generation to the final compare", async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret"); vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example/callback");
  const fetcher = vi.fn().mockResolvedValueOnce(reply({ refreshToken: "refresh", subject: "sub", grantVersion: "version", generation: "generation" }))
    .mockResolvedValueOnce(reply({ access_token: "access", expires_in: 3600 }))
    .mockResolvedValueOnce(reply({ sub: "sub", email: "me@example.com", email_verified: true }))
    .mockResolvedValueOnce(reply(source)).mockResolvedValueOnce(reply({ bound: true }));
  await bindDedicatedCalendar("user", "cal", "", fetcher, { url: "https://db.example", serviceRoleKey: "service" });
  expect(JSON.parse(fetcher.mock.calls[4][1].body)).toMatchObject({ p_user_id: "user", p_grant_version: "version", p_expected_generation: "generation", p_subject: "sub", p_timezone: "Asia/Seoul" });
});

function boundFetcher(result: unknown) {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret"); vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example/callback");
  return vi.fn().mockResolvedValueOnce(reply({ refreshToken: "refresh", subject: "sub", grantVersion: "version", generation: "generation" }))
    .mockResolvedValueOnce(reply({ access_token: "access", expires_in: 3600 }))
    .mockResolvedValueOnce(reply({ sub: "sub", email: "me@example.com", email_verified: true }))
    .mockResolvedValueOnce(reply(source)).mockResolvedValueOnce(reply(result));
}
const env = { url: "https://db.example", serviceRoleKey: "service" };

it("pins the zone the account was told to use, not the calendar's own", async () => {
  // The calendar's `timeZone` is a property of a calendar object; what a
  // reader sees in Google's grid is their ACCOUNT's display zone. A calendar
  // made while those disagreed — travelling, on a VPN — carries the difference
  // forever, and every event that syncs through it lands that many hours out.
  const fetcher = boundFetcher({ bound: true });
  await bindDedicatedCalendar("user", "cal", "America/Denver", fetcher, env);
  expect(JSON.parse(fetcher.mock.calls[4][1].body)).toMatchObject({ p_timezone: "America/Denver" });
});

it("falls back to the calendar's zone when the client names none", async () => {
  // What every client sent before there was a setting to send. The parameter
  // is additive; an older build must keep binding exactly as it did.
  const fetcher = boundFetcher({ bound: true });
  await bindDedicatedCalendar("user", "cal", "", fetcher, env);
  expect(JSON.parse(fetcher.mock.calls[4][1].body)).toMatchObject({ p_timezone: "Asia/Seoul" });
});

it("carries the server's word for a refusal instead of flattening it", async () => {
  // 036 refuses a re-pin for four reasons that are all temporary and all
  // fixable by the person asking. One sentence for all of them sends someone
  // to look at their Google account for a problem in their own review list.
  const fetcher = boundFetcher({ bound: false, reason: "reviews-unresolved" });
  await expect(bindDedicatedCalendar("user", "cal", "Asia/Seoul", fetcher, env))
    .rejects.toMatchObject({ status: 409, reason: "reviews-unresolved" });
});

it("still refuses when the server gives no reason at all", async () => {
  const fetcher = boundFetcher({ bound: false });
  await expect(bindDedicatedCalendar("user", "cal", "Asia/Seoul", fetcher, env))
    .rejects.toMatchObject({ status: 409, reason: "" });
});
