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
  await bindDedicatedCalendar("user", "cal", fetcher, { url: "https://db.example", serviceRoleKey: "service" });
  expect(JSON.parse(fetcher.mock.calls[4][1].body)).toMatchObject({ p_user_id: "user", p_grant_version: "version", p_expected_generation: "generation", p_subject: "sub", p_timezone: "Asia/Seoul" });
});
