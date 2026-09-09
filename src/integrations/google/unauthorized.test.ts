// What a refused request tells the client (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// These three endpoints answer 401 for two unrelated situations, and the card
// has two different repairs for them: sign in, or fix the deployment. It can
// only tell them apart if the refusal says WHICH — a sentence is prose and the
// client must not match on it, so `code` carries `UnauthorizedError.reason`.
//
// Without it every 401 read as "you are signed out", which is how a signed-in
// reader ended up being told to sign in, over and over, by a card that could
// not have known better.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import connect from "../../functions/google/connect";
import disconnect from "../../functions/google/disconnect";
import token from "../../functions/google/token";
import calendar from "../../functions/google/calendar";
import taskWrite from "../../functions/google/task-write";

beforeEach(() => {
  // Enough for the verifier to be built; none of these requests reach a network.
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon-key");
});
afterEach(() => vi.unstubAllEnvs());

interface Result {
  status: number;
  body: { error?: string; code?: string };
}

async function call(
  handler: (req: never, res: never) => Promise<void>,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Result> {
  const result: Result = { status: 0, body: {} };
  const res = {
    status(code: number) { result.status = code; return res; },
    setHeader() {},
    json(payload: unknown) { result.body = payload as Result["body"]; },
    end() {},
  };
  await handler({ method: "POST", headers, body } as never, res as never);
  return result;
}

const endpoints = [
  { name: "task-write", handler: taskWrite, body: { operationId: "00000000-0000-0000-0000-000000000001" } },
  { name: "calendar", handler: calendar, body: { calendarId: "cal" } },
  { name: "connect", handler: connect, body: { code: "auth-code" } },
  { name: "token", handler: token, body: undefined },
  { name: "disconnect", handler: disconnect, body: undefined },
] as const;

for (const { name, handler, body } of endpoints) {
  it(`${name} names a missing bearer as missing_token, which signing in does fix`, async () => {
    const result = await call(handler as never, {}, body);
    expect(result.status).toBe(401);
    expect(result.body.code).toBe("missing_token");
  });

  it(`${name} names a refused bearer as invalid_token, which signing in does not fix`, async () => {
    const result = await call(handler as never, { authorization: "Bearer not-a-jwt" }, body);
    expect(result.status).toBe(401);
    expect(result.body.code).toBe("invalid_token");
    // The sentence travels too: which check refused is the whole diagnosis, and
    // the reader cannot open a server log.
    expect(result.body.error).toBeTruthy();
  });
}
