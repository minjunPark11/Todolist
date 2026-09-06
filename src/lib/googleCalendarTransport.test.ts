import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ desktop: vi.fn(), nativeFetch: vi.fn() }));
vi.mock("../platform/tauri", () => ({ isTauriRuntime: mocks.desktop }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.nativeFetch }));
import { defaultDeps, exchangeCodeForAccess, currentAccessToken, disconnect } from "./googleCalendar";
import { DEPLOYED_WEB_ORIGIN } from "../domain/calendar/googleSync/connectFlow";

beforeEach(() => { vi.clearAllMocks(); mocks.desktop.mockReturnValue(true); });
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
