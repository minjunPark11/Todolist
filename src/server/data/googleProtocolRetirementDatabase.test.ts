// 035: 프로토콜 1 서빙 은퇴가 전역이 된 뒤의 활성화 가드.
//
// 022 의 계정별 65분을 전역 한 줄로 옮긴다. 계정별 안전은 legacy 토큰 만료 검사가
// 지키고, 그쪽이 정확하다 — 나간 토큰은 나가기 전에 기록되기 때문이다.
//
// 여기서 고정하는 것은 "무엇이 여전히 거절되는가" 다. 가드를 느슨하게 고치는 마이그레이션이라
// 통과하는 경우보다 거절하는 경우가 중요하다.
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

let db: PGlite;
const user = "00000000-0000-0000-0000-000000000001";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.google_task_sync_accounts(user_id uuid primary key, enabled boolean not null default false);`);
  await db.exec(readFileSync("supabase/migrations/022_google_sync_protocol.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/035_google_protocol_retirement.sql", "utf8"));
}, 30000);

beforeEach(async () => {
  await db.exec(`reset role; truncate google_task_sync_accounts;
    update google_sync_protocol_state set legacy_serving_retired_at = null;
    insert into google_task_sync_accounts(user_id) values('${user}');`);
});

afterAll(async () => { await db?.close(); });

const retire = (ago: string) =>
  db.exec(`update google_sync_protocol_state set legacy_serving_retired_at = clock_timestamp() - interval '${ago}';`);
const enable = () => db.exec(`update google_task_sync_accounts set enabled=true where user_id='${user}';`);
const raise2 = () => db.exec(`update google_task_sync_accounts set minimum_google_protocol=2 where user_id='${user}';`);

it("refuses everything until someone declares the retirement", async () => {
  // fail-closed. 적용 직후 전역 값은 null 이고, 그동안은 다른 조건이 아무리 맞아도
  // 켜지지 않는다. DB 는 옛 배포가 물러났는지 알 수 없다.
  await raise2();
  await expect(enable()).rejects.toThrow("GOOGLE_PROTOCOL_DRAIN_REQUIRED");
});

it("still refuses inside the 65 minutes after the declaration", async () => {
  await raise2();
  await retire("64 minutes");
  await expect(enable()).rejects.toThrow("GOOGLE_PROTOCOL_DRAIN_REQUIRED");
});

it("lets a clean account through once the declaration has drained", async () => {
  // 한 번도 프로토콜 1 토큰을 받은 적 없는 계정. 소진할 것이 없으므로 자기 몫의
  // 65분을 다시 기다릴 이유가 없다 — 035 가 없애는 것이 이 대기다.
  await raise2();
  await retire("66 minutes");
  await enable();
  const rows = await db.query<{ enabled: boolean }>(`select enabled from google_task_sync_accounts`);
  expect(rows.rows[0].enabled).toBe(true);
});

it("still refuses an account whose own legacy token has not expired", async () => {
  // 전역 소진이 끝났어도 이 계정에 나간 토큰이 살아 있으면 안 된다. 그 토큰으로
  // 구버전 클라이언트가 옛 계약대로 구글에 쓸 수 있고, 그것이 028-034 가 막으려는 것이다.
  await retire("66 minutes");
  await db.exec(`select authorize_google_token('${user}', 1, 3600);`);
  await raise2();
  await expect(enable()).rejects.toThrow("GOOGLE_PROTOCOL_DRAIN_REQUIRED");
});

it("lets that same account through once its token has expired", async () => {
  await retire("66 minutes");
  await db.exec(`select authorize_google_token('${user}', 1, 3600);`);
  await raise2();
  await db.exec(`update google_task_sync_accounts
    set legacy_google_token_valid_until = clock_timestamp() - interval '6 minutes' where user_id='${user}';`);
  await enable();
  expect((await db.query<{ enabled: boolean }>(`select enabled from google_task_sync_accounts`)).rows[0].enabled).toBe(true);
});

it("still refuses an account that has not raised its own minimum", async () => {
  await retire("66 minutes");
  await expect(enable()).rejects.toThrow("GOOGLE_PROTOCOL_DRAIN_REQUIRED");
});

it("still refuses dropping back to protocol 1 while enabled", async () => {
  await raise2();
  await retire("66 minutes");
  await enable();
  await expect(db.exec(`update google_task_sync_accounts set minimum_google_protocol=1 where user_id='${user}';`))
    .rejects.toThrow("GOOGLE_PROTOCOL_DRAIN_REQUIRED");
});

it("keeps recording the account's own cutover, which is still worth knowing", async () => {
  await raise2();
  const rows = await db.query<{ set: boolean }>(
    `select google_protocol_cutover_at is not null as set from google_task_sync_accounts`);
  expect(rows.rows[0].set).toBe(true);
});

it("cannot grow a second retirement row", async () => {
  await expect(db.exec(`insert into google_sync_protocol_state(id) values(true);`)).rejects.toThrow();
  await expect(db.exec(`insert into google_sync_protocol_state(id) values(false);`)).rejects.toThrow();
});

it("keeps the retirement row away from the roles the app runs as", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.exec("reset role;");
    await db.exec(`set role ${role};`);
    await expect(db.query(`select * from google_sync_protocol_state`)).rejects.toThrow();
  }
  await db.exec("reset role;");
});
