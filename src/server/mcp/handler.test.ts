import { describe, expect, it } from "vitest";
import { fixtureReader, settingsRows, task, type TableRows } from "../test/fixtures";
import { unverifiedClaimsVerifier } from "./auth";
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
    const writeTool: ToolDefinition = {
      name: "create_task",
      mode: "write",
      description: describeTool("Would create a task."),
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async () => ({ created: true }),
    };
    const withWrite = deps(rows(), { tools: createRegistry([...readTools, writeTool]) });

    const list = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), withWrite);
    const names = (list.body as { result: { tools: Array<{ name: string }> } }).result.tools.map((tool) => tool.name);
    expect(names).not.toContain("create_task");

    const attempt = await handleMcpHttp(post(call("create_task")), withWrite);
    expect((attempt.body as { error: { message: string } }).error.message).toContain("no tool called");
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
});
