import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 스키마의 두 가지 기본값을 붙잡는 검사.
 *
 * 둘 다 "안 적으면 열린다"는 공통점이 있다. Postgres 의 기본값이 느슨한
 * 쪽이고, 그래서 한 번 빠뜨리면 아무 소리 없이 열린 채로 남는다. 049 가
 * 고친 두 건이 정확히 그랬다:
 *
 *   - `google_calendar_tokens` 는 RLS 하나로만 막혀 있었다. 형제 표 일곱은
 *     `revoke all` 까지 달고 있는데, 리프레시 토큰이 든 표에만 그 줄이
 *     없었다 (017 이 만들 때 빠졌다).
 *   - `set_updated_at` 은 search_path 가 안 박힌 마지막 함수였다.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function allSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS, file), "utf8"))
    .join("\n");
}

function names(sql: string, pattern: RegExp): Set<string> {
  return new Set([...sql.matchAll(pattern)].map((match) => match[1]));
}

/**
 * 실제 데이터베이스가 말한 "RLS 는 켜졌는데 정책이 없는 표" 여덟.
 *
 * 아래 파서의 채점표다. 마이그레이션에서 정책은 상당수가
 * `execute format('create policy ... on public.%I', t)` 로, 배열을 도는
 * 루프 안에서 만들어진다 — 표 이름이 변수다. 그래서 파서가 루프를 풀어야
 * 하고, 제대로 풀었는지는 이 목록과 **정확히** 맞는지로만 알 수 있다.
 */
const POLICYLESS_IN_THE_DATABASE = [
  "google_calendar_tokens",
  "google_legacy_mapping_imports",
  "google_oauth_operations",
  "google_sync_protocol_state",
  "google_task_occurrence_receipts",
  "google_task_recovery_audit",
  "google_task_restore_receipts",
  "google_verified_connection_history",
];

/** `foreach x in array array[...] loop ... end loop` 를 펼친다. */
function loopBodies(sql: string): Array<{ tables: string[]; body: string }> {
  return [...sql.matchAll(/foreach\s+\w+\s+in\s+array\s+array\[([\s\S]*?)\]\s*loop([\s\S]*?)end\s+loop/gi)].map(
    (match) => ({
      tables: [...match[1].matchAll(/'([a-z0-9_]+)'/gi)].map((name) => name[1]),
      body: match[2],
    }),
  );
}

describe("a table with row level security and no policy", () => {
  const sql = allSql();
  const rlsOn = names(sql, /alter\s+table\s+(?:public\.)?"?([a-z0-9_]+)"?\s+enable\s+row\s+level\s+security/gi);
  const hasPolicy = names(sql, /create\s+policy\s+(?:"[^"]*"|[a-z0-9_]+)\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?/gi);
  for (const { tables, body } of loopBodies(sql)) {
    if (/enable\s+row\s+level\s+security/i.test(body)) for (const table of tables) rlsOn.add(table);
    if (/create\s+policy/i.test(body)) for (const table of tables) hasPolicy.add(table);
  }
  const dropped = names(sql, /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi);
  const policyless = [...rlsOn].filter((table) => !hasPolicy.has(table) && !dropped.has(table)).sort();

  it("is found by this test, exactly as the database sees it", () => {
    // 자기 점검이자 채점. `arrayContaining` 으로는 부족하다 — 처음 쓴
    // 파서는 여덟을 전부 포함하면서 `tasks`·`lists`·`projects` 까지 스무 개를
    // 더 끌고 왔고, 포함 검사는 그대로 통과했다. 지나치게 잡는 것도 모자라게
    // 잡는 것도 여기서 걸리도록 **정확히 같음**으로 둔다.
    expect(policyless).toEqual([...POLICYLESS_IN_THE_DATABASE].sort());
  });

  it("also has its table privileges revoked, not just RLS", () => {
    // RLS 하나만으로도 오늘은 막힌다. 그런데 `create policy` 한 줄을 잘못
    // 얹거나 `disable row level security` 를 한 번 하면 그 표는 즉시 열린다.
    // 권한까지 거둬 두면 같은 실수가 아무 일도 아니게 된다.
    const exposed = policyless.filter((table) => {
      const revoked = new RegExp(`revoke[^;]*\\bon\\s+(?!function\\b)(?:table\\s+)?(?:public\\.)?"?${table}"?\\b`, "i");
      return !revoked.test(sql);
    });

    expect(
      exposed,
      "이 표들은 정책이 없어 RLS 로만 막혀 있고, 권한을 거두는 줄이 어디에도 없다. " +
        "자물쇠가 하나뿐인 표다.",
    ).toEqual([]);
  });
});

describe("every function in public", () => {
  const sql = allSql();

  /** 함수 이름 → 그 함수의 `create` 머리말들 (본문 시작 전까지). */
  function functionHeaders(): Map<string, string[]> {
    const headers = new Map<string, string[]>();
    for (const match of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\bas\s+\$/gi,
    )) {
      const list = headers.get(match[1]) ?? [];
      list.push(match[0]);
      headers.set(match[1], list);
    }
    return headers;
  }

  const headers = functionHeaders();

  it("is found by this test at all", () => {
    // 자기 점검. 정규식이 본문 시작(`as $$`)을 못 찾으면 머리말이 통째로
    // 비고, 그러면 아래 검사는 전부 통과한다.
    expect(headers.size).toBeGreaterThan(30);
    expect([...headers.keys()]).toContain("set_updated_at");
    expect([...headers.keys()]).toContain("oauth_client_id");
  });

  it("pins its search_path, in the definition or by a later alter", () => {
    // 049 는 001 의 `set_updated_at` 을 본문을 다시 적지 않고
    // `alter function ... set search_path = ''` 로 고쳤다. 001 의 정의가
    // 유일한 원본으로 남아야 하므로, 그 형태도 충족으로 친다.
    //
    // (한 이름이 여러 번 `create or replace` 될 수 있고, 실제로 사는 것은
    //  마지막 정의다. 그래서 "어느 하나라도 박혀 있으면 충족"으로 본다.)
    const mutable = [...headers.entries()]
      .filter(([name, list]) => {
        if (list.some((header) => /set\s+search_path/i.test(header))) return false;
        const altered = new RegExp(`alter\\s+function\\s+(?:public\\.)?"?${name}"?[^;]*set\\s+search_path`, "i");
        return !altered.test(sql);
      })
      .map(([name]) => name)
      .sort();

    expect(
      mutable,
      "이 함수들은 search_path 가 박혀 있지 않다. 어느 스키마의 이름이 풀릴지 " +
        "호출자의 설정에 달리게 되고, `security definer` 함수라면 그것이 곧 권한 상승 경로다.",
    ).toEqual([]);
  });
});
