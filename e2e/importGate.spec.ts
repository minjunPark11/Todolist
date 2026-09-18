import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * 가져오기 앞의 관문.
 *
 * 가져오기는 이 앱에서 가장 많이 지우는 동작이다. 휴지통 비우기는 휴지통에
 * 있는 것만, 전체 초기화는 접힌 `<details>` 안에서 묻고 나서 지우는데,
 * 가져오기는 파일 하나로 계정 전체를 대신하면서 아무것도 묻지 않았다.
 *
 * 재보니 이랬다 [실측]:
 *
 *   `{"hello":"world"}` 를 고른다
 *   → 확인 대화상자 없음
 *   → 할 일 셋이 전부 사라진다
 *   → 화면은 "Import complete." 라고 말한다
 *
 * `importData` 가 객체이기만 하면 받아 정규화하기 때문이다. 없는 키는 빈
 * 값이 되므로 남는 것은 빈 계정이다. 그리고 이 길은 자동 백업의 복원
 * 경로이기도 하다 (`SETTINGS_REVIEW.md` — "복원기를 새로 만들지 않았다").
 * 백업을 되돌리러 온 사람이 파일을 잘못 고르면 그 자리에서 전부 잃는다.
 */

const KEY = "focusflow.appData.v1";
const STAMP = "2026-08-18T00:00:00.000Z";

const ACCOUNT = JSON.stringify({
  tasks: [1, 2, 3].map((n) => ({
    id: `t${n}`,
    title: `소중한 할 일 ${n}`,
    listId: "l1",
    status: "todo",
    order: n,
    createdAt: STAMP,
    updatedAt: STAMP,
  })),
  lists: [{ id: "l1", name: "목록", order: 0, kind: "regular" }],
  projects: [],
  spaces: [],
  sidebarFolders: [],
  appSettings: { language: "en" },
});

function fileWith(contents: string, name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "import-gate-"));
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

async function openBackupTab(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [KEY, ACCOUNT] as const,
  );
  await page.goto("/settings");
  await page.locator(".ff-settings-nav button").filter({ hasText: "Backup & restore" }).click();
  await expect(page.getByRole("button", { name: "Export JSON" })).toBeVisible();
}

function storedTitles(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? ((JSON.parse(raw).tasks ?? []) as { title: string }[]).map((t) => t.title) : [];
  }, KEY);
}

test.describe("가져오기 관문", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "파일을 고르고 저장소를 읽는 검사다");

  test("엉뚱한 파일은 묻기 전에 아무것도 지우지 않는다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "폭과 무관하다 — 한 번만 돈다");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openBackupTab(page);

    const before = await storedTitles(page);
    expect(before, "잃을 것이 없으면 이 검사는 아무것도 안 본 것이다").toHaveLength(3);

    await page.locator('input[type="file"][accept="application/json"]').setInputFiles(
      fileWith('{"hello":"world"}', "not-a-backup.json"),
    );

    const gate = page.locator("section.ff-confirm");
    await expect(gate, "묻지 않고 대신하면 안 된다").toBeVisible();
    // 관문은 숫자를 말해야 한다. "가져오기"라는 말만으로는 0 개가 3 개를
    // 대신한다는 것을 그림으로 그릴 수 없다 (휴지통 관문과 같은 규칙).
    await expect(gate).toContainText("tasks 0");
    await expect(gate).toContainText("tasks 3");
    expect(await storedTitles(page), "아직 아무것도 일어나면 안 된다").toEqual(before);

    await gate.getByRole("button", { name: "Cancel" }).click();
    await expect(gate).toHaveCount(0);
    expect(await storedTitles(page), "물러났으면 그대로여야 한다").toEqual(before);
  });

  test("확정하면 대신한다 — 그물의 자기 점검", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    // 위 검사는 "가져오기가 아예 안 되는" 구현으로도 통과한다. 복원이 여전히
    // 복원인지를 같이 고정한다 — 이 길은 자동 백업의 유일한 복원 경로다.
    await openBackupTab(page);

    const restored = JSON.stringify({
      tasks: [{ id: "r1", title: "백업에서 온 할 일", listId: "lr", status: "todo", order: 0, createdAt: STAMP, updatedAt: STAMP }],
      lists: [{ id: "lr", name: "복원된 목록", order: 0, kind: "regular" }],
      projects: [],
      spaces: [],
      sidebarFolders: [],
      appSettings: { language: "en" },
    });
    await page.locator('input[type="file"][accept="application/json"]').setInputFiles(
      fileWith(restored, "todo-planner-backup-2026-08-18.json"),
    );

    const gate = page.locator("section.ff-confirm");
    await expect(gate).toBeVisible();
    await expect(gate, "파일에 든 것을 세어 말해야 한다").toContainText("tasks 1");
    await gate.getByRole("button", { name: "Replace" }).click();

    await expect
      .poll(async () => storedTitles(page), { message: "확정했는데 대신하지 않았다" })
      .toEqual(["백업에서 온 할 일"]);
    await expect(page.locator(".ff-settings-msg")).toContainText("Import complete");
  });

  test("JSON 이 아니면 그렇다고 말하고, 아무것도 건드리지 않는다", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "같은 이유");
    testInfo.setTimeout(testInfo.timeout * 3);
    await openBackupTab(page);

    await page.locator('input[type="file"][accept="application/json"]').setInputFiles(
      fileWith("this is not json", "notes.json"),
    );

    await expect(page.locator(".ff-settings-msg"), "조용히 지나가면 누른 사람은 눌린 줄 모른다").toContainText("not JSON");
    await expect(page.locator("section.ff-confirm"), "읽지도 못한 파일로 관문을 열 수는 없다").toHaveCount(0);
    expect(await storedTitles(page)).toHaveLength(3);
  });
});
