import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 트리거 함수는 RPC 가 아니다 — 그런데 기본값은 RPC 다.
 *
 * Postgres 는 함수를 만들 때 EXECUTE 를 PUBLIC 에 준다. `public` 스키마의
 * 함수는 PostgREST 가 `/rest/v1/rpc/<name>` 으로 노출하므로, 트리거 함수를
 * 하나 만들 때마다 아무것도 안 하면 엔드포인트가 하나 생긴다.
 *
 * 026 이 그것을 한 번 놓쳤다: 같은 파일에서 형제 함수에는
 * `revoke all on function ... from public,anon,authenticated,service_role` 을
 * 적고, 트리거 함수에는 적지 않았다. 그 한 줄이 빠진 채로 Supabase 린터의
 * 0028 ("anon 이 이 SECURITY DEFINER 함수를 부를 수 있다")에 잡혔다.
 *
 * 048 이 열려 있던 10개를 전부 거뒀다. 이 검사는 다음 번을 붙잡는다.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function allMigrations(): string {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(join(MIGRATIONS, file), "utf8"))
    .join("\n");
}

/** `create [or replace] function public.<name>(...) returns trigger` 의 이름들. */
function triggerFunctions(sql: string): string[] {
  const matches = sql.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\([^)]*\)\s*returns\s+trigger/gi,
  );
  return [...new Set([...matches].map((match) => match[1]))];
}

describe("trigger functions are not RPC endpoints", () => {
  it("can actually see the trigger functions this project defines", () => {
    // 자기 점검. 정규식이 아무것도 못 잡으면 아래 검사는 빈 목록을 돌며
    // 영원히 통과한다 — 이 파일에서 제일 조용하게 틀릴 수 있는 방식이다.
    const found = triggerFunctions(allMigrations());

    expect(found.length).toBeGreaterThanOrEqual(10);
    expect(found).toContain("set_updated_at");
    expect(found).toContain("archive_verified_google_connection");
    expect(found).toContain("reject_oauth_client_write");
  });

  it("all have EXECUTE revoked somewhere in the migrations", () => {
    const sql = allMigrations();
    const exposed = triggerFunctions(sql).filter((name) => {
      const revoked = new RegExp(`revoke[^;]*\\bon\\s+function\\s+(?:public\\.)?"?${name}"?\\s*\\(`, "i");
      return !revoked.test(sql);
    });

    expect(
      exposed,
      "이 트리거 함수들은 EXECUTE 를 거두는 줄이 어디에도 없다. " +
        "`public` 의 함수는 PostgREST 가 /rest/v1/rpc/<name> 으로 노출하므로, " +
        "거두지 않으면 엔드포인트가 하나씩 늘어난다.",
    ).toEqual([]);
  });

  it("does not revoke oauth_client_id, which the write lock calls", () => {
    // 047 의 트리거 함수가 본문에서 `public.oauth_client_id()` 를 부른다.
    // 트리거 자체는 EXECUTE 없이 발화하지만 본문이 부르는 함수는 호출자의
    // 권한으로 검사되므로, 이것을 거두면 앱의 모든 쓰기가 죽는다 [실측]:
    //   앱 세션 토큰의 UPDATE : 막힘 ← 42501 permission denied for function oauth_client_id
    //
    // 린터가 언젠가 이것을 짚더라도 거두면 안 된다는 것을 여기 박아 둔다.
    const sql = allMigrations();

    expect(sql).toMatch(/public\.oauth_client_id\(\)/);
    expect(sql).not.toMatch(/revoke[^;]*\bon\s+function\s+(?:public\.)?"?oauth_client_id"?\s*\(/i);
  });
});
