// @vitest-environment jsdom
//
// 계정이 답하지 못한 컬렉션은, 그 뒤 어떻게 계정에 닿는가.
//
// 표가 없거나 비어 있으면 적재는 이 기기의 사본을 화면에 그대로 둔다
// (loadRace.test.tsx 가 그 절반 — 지워지지 않는다 — 을 지킨다). 여기서 보는
// 것은 나머지 절반이다: 그렇게 남은 행이 계정으로 올라가는가.
//
// 올라가지 않았다 [실측]. 적재가 기준선(`syncedSnapshotRef`)에 화면의 값을
// 그대로 복사했고, 그 값은 이 기기의 사본이었다. 기준선은 "계정이 들고 있는
// 것"이라는 뜻이므로, 저장은 차이가 없다고 읽고 아무것도 보내지 않았다.
// 그 상태가 스스로 풀리는 경로는 하나뿐이었다 — 사람이 그 레코드를 하나씩
// 다시 건드리는 것.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { usePlannerData } from "./usePlannerData";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(), from: vi.fn(), rpc: vi.fn(),
  user: { id: "user-1", email: "test@example.com" },
}));
vi.mock("../platform", () => ({ platform: { kind: "web", storage: {
  getSync: (key: string) => mocks.storage.get(key) ?? null,
  setSync: (key: string, value: string) => { mocks.storage.set(key, value); },
  removeSync: (key: string) => { mocks.storage.delete(key); },
} } }));
vi.mock("../lib/taskRevisionOwnership", () => ({ acquireTaskRevisionOwnership: async () => vi.fn() }));
vi.mock("../services/supabaseClient", () => ({ isSupabaseConfigured: true, supabase: {
  from: mocks.from, rpc: mocks.rpc, auth: {
    getSession: async () => ({ data: { session: { user: mocks.user } } }),
    getUser: async () => ({ data: { user: mocks.user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
  },
} }));

/** 마이그레이션이 적용됐는가. false 면 PostgREST 가 PGRST205 로 답한다. */
let tableExists = false;
/** 계정이 들고 있는 check_items 행. */
let remoteRows: Array<{ id: string }> = [];
let upserts: Array<{ table: string; rows: unknown }>;
let deletes: Array<{ table: string; ids: string[] }>;

const MISSING = { code: "PGRST205", message: "Could not find the table 'public.check_items' in the schema cache" };

beforeEach(() => {
  vi.clearAllMocks(); mocks.storage.clear();
  tableExists = false; remoteRows = []; upserts = []; deletes = [];
  mocks.from.mockImplementation((table: string) => {
    const answer = () => table !== "check_items"
      ? { data: [], error: null }
      : tableExists ? { data: remoteRows.map((row) => ({ data: row })), error: null } : { data: null, error: MISSING };
    let removing: string[] = [];
    const query = {
      select: vi.fn(() => query), eq: vi.fn(() => query),
      in: vi.fn((_column: string, ids: string[]) => { removing = ids; deletes.push({ table, ids }); return Promise.resolve({ error: null }); }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn((rows: unknown) => {
        if (table === "check_items" && !tableExists) return Promise.resolve({ error: MISSING });
        upserts.push({ table, rows });
        if (table === "check_items") remoteRows = rows as Array<{ id: string }>;
        return Promise.resolve({ error: null });
      }),
      delete: vi.fn(() => { removing = []; return query; }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(answer()).then(resolve),
    };
    return query;
  });
  mocks.rpc.mockImplementation(async () => ({ data: null, error: { code: "42883", message: "no rpc" } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** 저장 큐는 700ms 디바운스 뒤에 돈다. 상태 문자열이 아니라 실제 쓰기를
 *  기다린다 — 'synced' 는 적재 직후부터 참이라 아무것도 증명하지 못한다. */
async function uploadsOf(table: string, atLeast: number, budgetMs = 3000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (upserts.filter((u) => u.table === table).length >= atLeast) break;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  }
  return upserts.filter((u) => u.table === table);
}

async function signedInWithOneLocalCheckItem() {
  const { result } = renderHook(() => usePlannerData());
  await waitFor(() => expect(result.current.auth.remoteDataReady).toBe(true));
  const taskId = await act(async () => result.current.createTask({ title: "Ship it" }));
  act(() => { result.current.addCheckItem(taskId, "하위 확인 하나"); });
  return { result, taskId };
}

it("자기 점검: 표가 있을 때는 이 계측이 업로드를 본다", async () => {
  // 이게 없으면 아래의 '0회'가 결함이 아니라 계측 실패일 수 있다. 실제로
  // 처음 잰 값이 그랬다 — 상태 문자열을 기다리는 바람에 정상 경로에서도
  // 0회가 나왔다.
  tableExists = true;
  await signedInWithOneLocalCheckItem();
  expect(await uploadsOf("check_items", 1)).toHaveLength(1);
  expect(remoteRows).toHaveLength(1);
});

it("표가 없는 동안에는 올라가지 않고, 기기에 남는다", async () => {
  const { result } = await signedInWithOneLocalCheckItem();
  // 디바운스(700ms) 를 넉넉히 넘긴다 — 저장이 한 바퀴 돌 기회를 주고도 0회여야 한다.
  await uploadsOf("check_items", 1, 1500);
  expect(upserts.filter((u) => u.table === "check_items")).toHaveLength(0);
  expect(result.current.checkItems).toHaveLength(1);
});

it("표가 생기면 기기에 남아 있던 행이 계정으로 올라간다", async () => {
  const { result } = await signedInWithOneLocalCheckItem();
  await uploadsOf("check_items", 1, 1500);

  // 마이그레이션이 적용됐다. 표가 생겼고, 비어 있다.
  tableExists = true;
  await act(async () => { await result.current.refreshSupabaseData(); });

  // 먼저 화면에 남아 있어야 한다 — 빈 답을 곧이곧대로 받으면 여기서 0이 된다.
  expect(result.current.checkItems).toHaveLength(1);

  // 그리고 사람이 아무것도 더 하지 않아도 계정에 닿아야 한다. 고치기 전에는
  // 여기가 0회였고, 그 행을 직접 다시 건드릴 때까지 계속 0회였다.
  const sent = await uploadsOf("check_items", 1);
  expect(sent).toHaveLength(1);
  expect(remoteRows).toHaveLength(1);
});

it("빈 기준선이 계정의 행을 지우는 쪽으로는 쓰이지 않는다", async () => {
  // 기준선을 비워 두는 것의 반대 위험: 삭제는 '기준선에 있고 로컬에 없는 id'
  // 에서 나온다. 기준선이 비면 그 집합은 항상 비므로 삭제가 나올 수 없다.
  const { result } = await signedInWithOneLocalCheckItem();
  await uploadsOf("check_items", 1, 1500);
  tableExists = true;
  await act(async () => { await result.current.refreshSupabaseData(); });
  await uploadsOf("check_items", 1);
  expect(deletes.filter((d) => d.table === "check_items")).toEqual([]);
});
