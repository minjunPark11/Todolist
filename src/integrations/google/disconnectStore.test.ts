import { expect, it, vi } from "vitest";
import { readDisconnectSnapshot, disconnectStoredCalendar } from "./store";
const env = { url: "https://db.example", serviceRoleKey: "key" };
const snapshot = { refreshToken: "private-refresh", grantVersion: "version", generation: "generation" };
const reply = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
it("reads a complete snapshot and submits only version preconditions for deletion", async () => {
  expect(await readDisconnectSnapshot("user", reply(snapshot), env)).toEqual(snapshot);
  const fetcher = reply({ disconnected: true });
  await disconnectStoredCalendar("user", snapshot, fetcher, env);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ p_user_id: "user", p_grant_version: "version", p_generation: "generation" });
  expect(fetcher.mock.calls[0][1].body).not.toContain("private-refresh");
});
it.each([{}, null, { ...snapshot, grantVersion: null }])("rejects an incomplete snapshot %j", async body => {
  await expect(readDisconnectSnapshot("user", reply(body), env)).rejects.toMatchObject({ status: 502 });
});
it("reports concurrent replacement distinctly and never exposes database error bodies", async () => {
  await expect(disconnectStoredCalendar("user", snapshot, reply({ disconnected: false }), env)).rejects.toMatchObject({ status: 409 });
  await expect(disconnectStoredCalendar("user", snapshot, reply({ error: "private-refresh" }, 500), env)).rejects.not.toThrow("private-refresh");
});
