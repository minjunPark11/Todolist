import { describe, expect, it } from "vitest";
import { fixtureReader, settingsRows, task, type TableRows } from "../test/fixtures";
import { unverifiedClaimsVerifier, UnauthorizedError, VerifierUnavailableError, type TokenVerifier } from "./auth";
import { capResult, handleMcpHttp, MAX_RESULT_BYTES, SUPPORTED_PROTOCOL_VERSIONS, type McpDeps } from "./handler";
import type { McpLogRecord } from "./logging";
import { createRegistry, describe as describeTool, type ToolDefinition } from "./registry";
import { readTools } from "./tools/read";

const NOW = new Date("2026-08-28T01:00:00.000Z");
const TODAY = "2026-08-28";

function token(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

const USER_TOKEN = token({ sub: "user-a", exp: Math.floor(NOW.getTime() / 1000) + 3600 });

function rows(overrides: TableRows = {}): TableRows {
  return {
    tasks: [
      task({ id: "t-1", title: "Write the chapter", dueDate: TODAY, startTime: "13:00", endTime: "14:00" }),
      task({ id: "t-2", title: "Return the books", dueDate: "2026-08-20" }),
    ],
    settings: settingsRows({
      appSettings: { timezone: "Asia/Seoul" },
      syncState: { lastSeenAt: "2026-08-28T00:58:00.000Z", platform: "desktop" },
    }),
    ...overrides,
  };
}

function deps(tableRows: TableRows = rows(), overrides: Partial<McpDeps> = {}): McpDeps & { logs: McpLogRecord[] } {
  const logs: McpLogRecord[] = [];
  return {
    tools: createRegistry(readTools),
    verifier: unverifiedClaimsVerifier(() => NOW),
    readerFor: () => fixtureReader(tableRows),
    loadExternal: async () => ({ events: [], statuses: [], partial: false }),
    now: () => NOW,
    log: (record) => logs.push(record),
    newRequestId: () => "req-test",
    logs,
    ...overrides,
  };
}

function post(body: unknown, authorization: string | null = `Bearer ${USER_TOKEN}`) {
  return { method: "POST", headers: authorization ? { authorization } : {}, body };
}

function call(name: string, args: Record<string, unknown> = {}, id: number | string = 1) {
  return { jsonrpc: "2.0" as const, id, method: "tools/call", params: { name, arguments: args } };
}

describe("the HTTP shape", () => {
  it("refuses a GET rather than opening a stream it does not have", async () => {
    const response = await handleMcpHttp({ method: "GET", headers: {}, body: null }, deps());
    expect(response.status).toBe(405);
  });

  it("answers a request with no token with a 401 and a challenge", async () => {
    // The challenge is what makes a connector start an OAuth flow instead of
    // reporting a broken endpoint.
    const response = await handleMcpHttp(post({}, null), deps());
    expect(response.status).toBe(401);
    expect(response.headers["WWW-Authenticate"]).toBe("Bearer");
  });

  it("points at the protected-resource document when there is one", async () => {
    const response = await handleMcpHttp(
      post({}, null),
      deps(rows(), { resourceMetadataUrl: "https://app.example/.well-known/oauth-protected-resource" }),
    );
    expect(response.headers["WWW-Authenticate"]).toContain("resource_metadata=");
  });

  it("rejects an expired token so the client refreshes", async () => {
    const expired = token({ sub: "user-a", exp: Math.floor(NOW.getTime() / 1000) - 60 });
    const response = await handleMcpHttp(post({}, `Bearer ${expired}`), deps());

    expect(response.status).toBe(401);
    expect(response.headers["WWW-Authenticate"]).toContain('error="invalid_token"');
  });

  it("확인할 수 없는 것은 401 이 아니다 — 503 이고, 재인증을 시키지 않는다", async () => {
    // 401 은 토큰에 대한 판정이다. 서버가 서명 키를 못 읽거나 설정이 빠진
    // 것은 어떤 토큰으로도 낫지 않으므로, 그것을 401 로 답하면 붙어 있는
    // 에이전트가 재인증을 영원히 돈다.
    //
    // 실제로 그랬다 [실측 — 환경 변수가 비어 있는 개발 서버에 모양만 맞는
    // JWT 를 보냈다]:
    //
    //   401 · WWW-Authenticate: Bearer error="invalid_token"
    //   {"error":"SUPABASE_URL and SUPABASE_ANON_KEY must be set ..."}
    const broken: TokenVerifier = {
      async verify() {
        throw new VerifierUnavailableError("SUPABASE_URL and SUPABASE_ANON_KEY must be set.");
      },
    };
    const response = await handleMcpHttp(post({}, `Bearer ${USER_TOKEN}`), deps(rows(), { verifier: broken }));

    expect(response.status).toBe(503);
    expect(response.headers["Retry-After"], "다시 와도 된다고는 말해야 한다").toBe("30");
    expect(
      response.headers["WWW-Authenticate"],
      "이 헤더가 있으면 커넥터는 토큰을 고치면 될 일이라고 읽는다",
    ).toBeUndefined();

    const body = JSON.stringify(response.body);
    expect(body, "서버의 설정 사정은 인증도 안 된 호출자가 알 일이 아니다").not.toContain("SUPABASE_URL");
    expect(body).toContain("cannot verify");
  });

  it("확인기가 무엇을 던지든 설정 문구가 새지 않는다 — 그물의 자기 점검", async () => {
    // 위 검사는 `VerifierUnavailableError` 만 본다. `UnauthorizedError` 가
    // 아닌 것은 전부 같은 취급이어야 한다 — 우리가 예상하지 못한 throw 도.
    const surprising: TokenVerifier = {
      async verify() {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
      },
    };
    const response = await handleMcpHttp(post({}, `Bearer ${USER_TOKEN}`), deps(rows(), { verifier: surprising }));

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("10.0.0.5");
  });

  it("토큰에 대한 판정은 여전히 401 이고 이유를 말한다 — 그물의 자기 점검", async () => {
    // 위 둘이 "무엇이든 503" 인 구현으로도 통과하므로, 반대편을 같이
    // 고정한다. 토큰이 틀렸다면 부르는 쪽이 고칠 수 있고, 고치라고 말해야
    // 한다.
    const refusing: TokenVerifier = {
      async verify() {
        throw new UnauthorizedError("invalid_token", "That token was issued for a different service.");
      },
    };
    const response = await handleMcpHttp(post({}, `Bearer ${USER_TOKEN}`), deps(rows(), { verifier: refusing }));

    expect(response.status).toBe(401);
    expect(response.headers["WWW-Authenticate"]).toContain('error="invalid_token"');
    expect(JSON.stringify(response.body)).toContain("different service");
  });

  it("reports a malformed body as a parse error", async () => {
    const response = await handleMcpHttp(post({ jsonrpc: "1.0", method: "x" }), deps());
    expect(response.status).toBe(400);
    expect((response.body as { error: { code: number } }).error.code).toBe(-32700);
  });
});

describe("the handshake", () => {
  it("answers initialize with the version the client asked for", async () => {
    const response = await handleMcpHttp(
      post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }),
      deps(),
    );
    const result = (response.body as { result: Record<string, unknown> }).result;

    expect(result.protocolVersion).toBe("2025-03-26");
    expect(result.serverInfo).toMatchObject({ name: "focusflow" });
    expect(result.capabilities).toEqual({ tools: { listChanged: false } });
  });

  it("falls back to the newest version it knows", async () => {
    const response = await handleMcpHttp(
      post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }),
      deps(),
    );
    expect((response.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe(
      SUPPORTED_PROTOCOL_VERSIONS[0],
    );
  });

  it("says nothing back to a notification", async () => {
    // A reply to a notification is an unmatched response on the wire, and some
    // clients treat that as a protocol violation.
    const response = await handleMcpHttp(post({ jsonrpc: "2.0", method: "notifications/initialized" }), deps());

    expect(response.status).toBe(202);
    expect(response.body).toBeNull();
  });

  it("answers a ping", async () => {
    const response = await handleMcpHttp(post({ jsonrpc: "2.0", id: 9, method: "ping" }), deps());
    expect(response.body).toEqual({ jsonrpc: "2.0", id: 9, result: {} });
  });

  it("refuses a method it does not have", async () => {
    const response = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "resources/list" }), deps());
    expect((response.body as { error: { code: number } }).error.code).toBe(-32601);
  });
});

describe("tools/list", () => {
  it("offers the V1 read catalogue", async () => {
    const response = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), deps());
    const tools = (response.body as { result: { tools: Array<{ name: string; description: string }> } }).result.tools;

    expect(tools.map((tool) => tool.name)).toEqual([
      "get_current_context",
      "get_today_tasks",
      "get_tasks",
      "get_task_detail",
      "get_subtasks",
      "get_overdue_tasks",
      "get_upcoming_deadlines",
      "search_tasks",
      "get_calendar_events",
      "get_free_time_blocks",
      "get_projects",
      "get_project_detail",
      "get_focus_summary",
    ]);
  });

  it("tells the model the staleness rule where the model will read it", async () => {
    const response = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), deps());
    const tools = (response.body as { result: { tools: Array<{ description: string }> } }).result.tools;

    expect(tools.every((tool) => tool.description.includes("meta.freshness"))).toBe(true);
  });

  it("offers the time zone argument on every tool", async () => {
    const response = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), deps());
    const tools = (response.body as { result: { tools: Array<{ inputSchema: { properties: object } }> } }).result.tools;

    expect(tools.every((tool) => "timezone" in tool.inputSchema.properties)).toBe(true);
  });

  it("hides a write tool, and refuses to call it", async () => {
    // 이것이 **유일한** 자물쇠다. registry.ts 의 실측대로 데이터베이스에는
    // OAuth 클라이언트의 쓰기를 막는 정책이 없으므로, 이 검사가 무너지면
    // 그 아래에 받아줄 것이 없다. 그래서 거절만이 아니라 손이 닿지
    // 않았다는 것까지 본다.
    let ran = false;
    const writeTool: ToolDefinition = {
      name: "create_task",
      mode: "write",
      description: describeTool("Would create a task."),
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => {
        ran = true;
        return { created: true };
      },
    };
    const withWrite = deps(rows(), { tools: createRegistry([...readTools, writeTool]) });

    const list = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), withWrite);
    const names = (list.body as { result: { tools: Array<{ name: string }> } }).result.tools.map((tool) => tool.name);
    expect(names).not.toContain("create_task");

    const attempt = await handleMcpHttp(post(call("create_task")), withWrite);
    expect((attempt.body as { error: { message: string } }).error.message).toContain("no tool called");
    expect(ran).toBe(false);
  });
});

describe("tools/call", () => {
  it("answers with both the text and the structured result", async () => {
    const response = await handleMcpHttp(post(call("get_today_tasks")), deps());
    const result = (response.body as { result: { content: Array<{ text: string }>; structuredContent: { date: string } } })
      .result;

    expect(result.structuredContent.date).toBe(TODAY);
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  });

  it("carries the freshness metadata on every answer", async () => {
    const response = await handleMcpHttp(post(call("get_overdue_tasks")), deps());
    const structured = (response.body as { result: { structuredContent: { meta: { freshness: { staleness: string } } } } })
      .result.structuredContent;

    expect(structured.meta.freshness.staleness).toBe("live");
  });

  it("returns a missing task as a tool error the model can explain", async () => {
    // §15: an isError result reaches the model, which can say "that task does
    // not exist". A JSON-RPC error is swallowed by the client instead.
    const response = await handleMcpHttp(post(call("get_task_detail", { taskId: "nope" })), deps());
    const result = (response.body as { result: { isError: boolean; content: Array<{ text: string }> } }).result;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NOT_FOUND");
  });

  it("names the argument that was wrong", async () => {
    const response = await handleMcpHttp(post(call("get_upcoming_deadlines", { days: 400 })), deps());
    const text = (response.body as { result: { content: Array<{ text: string }> } }).result.content[0].text;

    expect(text).toContain("days must be between 1 and 90");
  });

  it("refuses an argument it does not know instead of ignoring it", async () => {
    // A model that invents `projectName` and gets silence believes it filtered
    // the list, and then describes the wrong project with confidence.
    const response = await handleMcpHttp(post(call("get_tasks", { projectName: "Thesis" })), deps());
    const text = (response.body as { result: { content: Array<{ text: string }> } }).result.content[0].text;

    expect(text).toContain("Unknown argument");
  });

  it("answers a batch in one round trip, reading each table once", async () => {
    const reads = new Map<never, number>();
    const scope = deps(rows(), { readerFor: () => fixtureReader(rows(), { reads: reads as never }) });
    const response = await handleMcpHttp(
      post([call("get_today_tasks", {}, 1), call("get_overdue_tasks", {}, 2), call("get_tasks", {}, 3)]),
      scope,
    );

    expect(Array.isArray(response.body)).toBe(true);
    expect((response.body as unknown[]).length).toBe(3);
    expect(reads.get("tasks" as never)).toBe(1);
  });
});

describe("the time zone", () => {
  it("refuses rather than guessing when the account has none", async () => {
    const noZone = rows({ settings: settingsRows({ syncState: { lastSeenAt: "2026-08-28T00:58:00.000Z" } }) });
    const response = await handleMcpHttp(post(call("get_today_tasks")), deps(noZone));
    const result = (response.body as { result: { isError: boolean; content: Array<{ text: string }> } }).result;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("INVALID_ARGUMENT");
  });

  it("accepts the zone the caller offered when the account has none", async () => {
    // M1's second fallback. A connector often knows where the user is; that is
    // better than a refusal, and still not a guess by us.
    const noZone = rows({ settings: settingsRows({ syncState: { lastSeenAt: "2026-08-28T00:58:00.000Z" } }) });
    const response = await handleMcpHttp(post(call("get_today_tasks", { timezone: "America/Denver" })), deps(noZone));
    const structured = (response.body as { result: { structuredContent: { date: string; timezone: string } } }).result
      .structuredContent;

    // 01:00 UTC is still the 27th in Denver — the whole reason this matters.
    expect(structured.timezone).toBe("America/Denver");
    expect(structured.date).toBe("2026-08-27");
  });

  it("prefers the account's own zone over the caller's", async () => {
    const response = await handleMcpHttp(post(call("get_today_tasks", { timezone: "America/Denver" })), deps());
    const structured = (response.body as { result: { structuredContent: { timezone: string } } }).result
      .structuredContent;

    expect(structured.timezone).toBe("Asia/Seoul");
  });

  it("refuses a zone that is not one", async () => {
    const noZone = rows({ settings: settingsRows({}) });
    const response = await handleMcpHttp(post(call("get_today_tasks", { timezone: "Mars/Olympus" })), deps(noZone));
    const text = (response.body as { result: { content: Array<{ text: string }> } }).result.content[0].text;

    expect(text).toContain("IANA");
  });

  it("still lists its tools for an account with no zone", async () => {
    // The failure belongs to the call, not to the connection: a client that
    // could not even list tools would look broken rather than unconfigured.
    const noZone = rows({ settings: settingsRows({}) });
    const response = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), deps(noZone));

    expect((response.body as { result: { tools: unknown[] } }).result.tools).toHaveLength(13);
  });
});

describe("what the logs keep", () => {
  it("records the call without recording anything in it", async () => {
    const scope = deps();
    await handleMcpHttp(post(call("search_tasks", { query: "chapter" })), scope);
    const record = scope.logs.find((entry) => entry.tool === "search_tasks");

    expect(record).toMatchObject({ outcome: "ok", method: "tools/call", queryLength: 7 });
    // §16.2: the query's length explains a thin result set. The query itself
    // is a confidence the user did not give us.
    expect(JSON.stringify(scope.logs)).not.toContain("chapter");
    expect(JSON.stringify(scope.logs)).not.toContain("Write the");
    expect(JSON.stringify(scope.logs)).not.toContain(USER_TOKEN);
    expect(record?.userHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("records an error by code", async () => {
    const scope = deps();
    await handleMcpHttp(post(call("get_task_detail", { taskId: "nope" })), scope);

    expect(scope.logs.some((entry) => entry.errorCode === "NOT_FOUND")).toBe(true);
  });
});

describe("capResult", () => {
  it("leaves a normal answer alone", () => {
    const result = { items: [1, 2, 3], meta: { truncated: false } };
    expect(capResult(result)).toEqual({ payload: result, truncated: false });
  });

  it("trims a list that will not fit, and says it did", () => {
    const items = Array.from({ length: 4000 }, (_, index) => ({ id: `task-${index}`, title: "x".repeat(100) }));
    const { payload, truncated } = capResult({ items, meta: { truncated: false } });

    expect(truncated).toBe(true);
    expect(JSON.stringify(payload).length).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect((payload as { items: unknown[] }).items.length).toBeLessThan(items.length);
    expect((payload as { meta: { truncated: boolean } }).meta.truncated).toBe(true);
  });

  it("measures the ceiling in bytes, so a Korean answer is capped at the same size as an English one", () => {
    // 이 고정값의 요점은 **옛 검사를 통과했다는 것**이다: 코드 단위로는
    // 상한 안이고, 바이트로는 밖이다. 그 둘이 갈리지 않는 고정값이었다면
    // 이 검사는 아무것도 잡지 못한 채 통과했을 것이다 — 바로 위 검사의
    // "x".repeat(100) 이 그랬다.
    const items = Array.from({ length: 2600 }, (_, index) => ({
      id: `task-${index}`,
      title: "플랫폼 팀 분기 보고서 초안을 작성하고 검토 요청까지 보내기".repeat(2),
    }));
    const oversized = { items, meta: { truncated: false } };
    const asJson = JSON.stringify(oversized);

    // 자기 점검: 고정값이 정말 그 틈에 놓여 있는가.
    expect(asJson.length).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(Buffer.byteLength(asJson, "utf8")).toBeGreaterThan(MAX_RESULT_BYTES);

    const { payload, truncated } = capResult(oversized);

    expect(truncated).toBe(true);
    // 구현과 같은 자를 쓰지 않는다 — 바이트를 따로 센다.
    expect(Buffer.byteLength(JSON.stringify(payload), "utf8")).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect((payload as { items: unknown[] }).items.length).toBeLessThan(items.length);
  });
});
