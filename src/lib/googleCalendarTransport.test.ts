import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ desktop: vi.fn(), nativeFetch: vi.fn() }));
vi.mock("../platform/tauri", () => ({ isTauriRuntime: mocks.desktop }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.nativeFetch }));
import { defaultDeps, exchangeCodeForAccess, currentAccessToken, disconnect } from "./googleCalendar";
import { DEPLOYED_WEB_ORIGIN } from "../domain/calendar/googleSync/connectFlow";

beforeEach(() => { vi.clearAllMocks(); mocks.desktop.mockReturnValue(true); });
it("saves a connection through server verification instead of trusting client account metadata", async () => {
  const auth = vi.spyOn(defaultDeps, "authToken").mockResolvedValue("session");
  mocks.nativeFetch.mockResolvedValue(new Response(JSON.stringify({ bound: true })));
  try {
    await defaultDeps.writeConnection({ calendarId: "cal", accountEmail: "untrusted@example.com" });
    expect(mocks.nativeFetch).toHaveBeenCalledWith(`${DEPLOYED_WEB_ORIGIN}/api/google/calendar`, expect.objectContaining({
      body: JSON.stringify({ calendarId: "cal" }),
    }));
  } finally { auth.mockRestore(); }
});
it("posts all desktop OAuth calls to the deployed server through native HTTP", async () => {
  mocks.nativeFetch.mockImplementation(async () => new Response(JSON.stringify({ accessToken: "access", connected: true, revoked: true })));
  const deps = { ...defaultDeps, authToken: async () => "session" };
  await exchangeCodeForAccess("code", deps);
  await currentAccessToken(deps);
  await disconnect(deps);
  expect(mocks.nativeFetch.mock.calls.map((call) => call[0])).toEqual([
    `${DEPLOYED_WEB_ORIGIN}/api/google/connect`,
    `${DEPLOYED_WEB_ORIGIN}/api/google/token`,
    `${DEPLOYED_WEB_ORIGIN}/api/google/disconnect`,
  ]);
  expect(mocks.nativeFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer session");
});
