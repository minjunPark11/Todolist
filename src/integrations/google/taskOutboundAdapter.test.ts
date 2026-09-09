import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), identity: vi.fn() }));
vi.mock("./oauth", () => ({ refreshAccessToken: mocks.refresh }));
vi.mock("./identity", () => ({ verifyGoogleIdentity: mocks.identity }));
vi.mock("./env", async original => ({ ...await original<typeof import("./env")>(), readGoogleOAuthEnv: () => ({}) }));
import { executeGoogleTaskOutbound } from "./taskOutbound";
const fields = { title: "App", description: "", startDate: "", dueDate: "2026-09-09", startTime: "", endTime: "" };
const remote = { ...fields, title: "Base" };
const source = { id: "e", etag: '"old"', summary: "Base", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } };
beforeEach(() => { mocks.refresh.mockReset().mockResolvedValue({ accessToken: "server-minted", expiresIn: 3600 }); mocks.identity.mockReset().mockResolvedValue({ subject: "subject", email: "verified@example.com" }); });
it.each(["valid", "generation", "calendar", "subject"])("checks server credential binding: %s", async variant => {
  const urls: string[] = [];
  if (variant === "subject") mocks.identity.mockResolvedValue({ subject: "another" });
  const fetchImpl: typeof fetch = async (url, init) => {
    const target = String(url); urls.push(target);
    if (target.includes("/rest/v1/rpc/")) {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer service-key");
      const body = JSON.parse(String(init?.body)); expect(body.p_user_id).toBe("user");
      if (target.endsWith("begin_google_task_outbound")) return Response.json({ send: true, generation: "g", calendarId: "cal", eventId: "e", fields, remote, source, timezone: "Asia/Seoul" });
      if (target.endsWith("read_google_binding_snapshot")) return Response.json({ generation: variant === "generation" ? "other" : "g",
        boundCalendarId: variant === "calendar" ? "other" : "cal", refreshToken: "server-refresh", subject: "subject" });
      if (target.endsWith("finish_google_task_outbound")) return Response.json({ finished: true, state: body.p_outcome === "applied" ? "completed" : "aborted" });
      throw Error("Unexpected RPC");
    }
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer server-minted");
    return Response.json(init?.method === "PATCH" ? { ...source, summary: "App", etag: '"new"' } : source);
  };
  expect(await executeGoogleTaskOutbound("user", "operation", fetchImpl, { url: "https://project.supabase.co", serviceRoleKey: "service-key" }))
    .toEqual({ state: variant === "valid" ? "completed" : "aborted" });
  expect(urls.filter(url => url.startsWith("https://www.googleapis.com"))).toHaveLength(variant === "valid" ? 2 : 0);
  if (variant === "generation" || variant === "calendar") expect(mocks.refresh).not.toHaveBeenCalled();
  else {
    expect(mocks.refresh).toHaveBeenCalledWith("server-refresh", {}, fetchImpl);
    expect(mocks.identity).toHaveBeenCalledWith("server-minted", fetchImpl);
  }
});
