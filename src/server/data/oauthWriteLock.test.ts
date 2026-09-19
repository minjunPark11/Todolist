import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 두 번째 자물쇠가 새로 생기는 표를 놓치지 않게 붙잡는 검사.
 *
 * 047 은 적용 시점의 `public` 에 있는 모든 표를 돌며 트리거를 붙인다 —
 * 그때는 31/31 이었다. 그런데 048 이 표를 하나 더 만들면 그 표에는 자물쇠가
 * 없고, 없다는 사실은 아무 데서도 드러나지 않는다. 자물쇠가 빠진 표 하나가
 * 곧 커넥터가 쓸 수 있는 표 하나다.
 *
 * 그래서 규칙을 하나 둔다: **047 이후에 표를 만드는 마이그레이션은 같은
 * 파일에서 그 표에 트리거를 붙여야 한다.** 이 검사가 그 규칙이다.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const LOCK_MIGRATION = 47;
const TRIGGER = "reject_oauth_client_write";

interface Migration {
  file: string;
  number: number;
  body: string;
}

function migrations(): Migration[] {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({
      file,
      number: Number.parseInt(file.slice(0, 3), 10),
      body: readFileSync(join(MIGRATIONS, file), "utf8"),
    }))
    .sort((a, b) => a.number - b.number);
}

/** `create table [if not exists] public.<name>` 에서 이름만. */
function tablesCreatedIn(body: string): string[] {
  const matches = body.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi);
  return [...new Set([...matches].map((match) => match[1]))];
}

describe("the OAuth write lock", () => {
  it("is installed by a migration that covers every table it finds", () => {
    const lock = migrations().find((migration) => migration.number === LOCK_MIGRATION);
    expect(lock, "047 이 있어야 한다").toBeDefined();
    // 손으로 적은 목록이 아니라 `pg_class` 를 돌아야 한다. 목록이면 다음
    // 표에서 조용히 빠진다.
    expect(lock!.body).toContain("pg_class");
    expect(lock!.body).toContain(TRIGGER);
    // 붙이고 끝내지 않고, 빠진 표가 없는지 되센다.
    expect(lock!.body).toContain("These tables have no write lock");
  });

  it("finds the tables this project actually creates", () => {
    // 자기 점검. 아래 검사는 "047 뒤에 만들어진 표"가 하나도 없으면 아무것도
    // 보지 않은 채 통과한다. 파서가 정말 `create table` 을 읽어내는지를 여기서
    // 먼저 확인해 둔다 — 읽어내지 못하면 아래는 영원히 초록이다.
    const created = migrations().flatMap((migration) => tablesCreatedIn(migration.body));

    expect(created.length).toBeGreaterThan(20);
    expect(created).toContain("tasks");
    expect(created).toContain("calendar_shares");
  });

  it("is extended by every later migration that adds a table", () => {
    const offenders = migrations()
      .filter((migration) => migration.number > LOCK_MIGRATION)
      .flatMap((migration) => {
        const added = tablesCreatedIn(migration.body);
        if (added.length === 0) return [];
        return migration.body.includes(TRIGGER) ? [] : [`${migration.file} → ${added.join(", ")}`];
      });

    expect(
      offenders,
      `이 마이그레이션들이 표를 만들면서 ${TRIGGER} 트리거를 붙이지 않았다. ` +
        "자물쇠 없는 표는 연결된 애플리케이션이 쓸 수 있는 표다.",
    ).toEqual([]);
  });
});
