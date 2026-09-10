// 기록 탭 — 기간, 축, 목록 (FOCUS_TABS_AND_RECORD_DESIGN.md §7.2 · §5).
//
// 도메인 쪽 셈은 `src/domain/focus/recordsPeriod.test.ts` 가 잰다. 여기서 잡는
// 것은 그 값이 **화면의 어디에 놓이는가** 이고, 그건 레이아웃이 있어야 답이 나온다.
//
// 특히 타임라인의 자리. 첫 렌더에서 축은 0~24시를 쓰는데 눈금은 06 부터 붙어
// 있었고, 그래서 09:20 의 구간이 14시 자리에 그려졌다 — 값도 마크도 맞는데 읽는
// 사람만 속는 종류의 결함이라, 눈금과 마크를 함께 재지 않으면 잡히지 않는다.
import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";

const DAY = "2026-08-18"; // 화요일
const YESTERDAY = "2026-08-17";

interface Seed {
  id: string;
  taskId: string | null;
  day: string;
  hour: number;
  minute: number;
  minutes: number;
}

async function seedSessions(page: Page, sessions: Seed[]): Promise<void> {
  await page.addInitScript(
    ([key, seeds]) => {
      const build = (seed: Seed) => {
        const start = new Date(
          `${seed.day}T${String(seed.hour).padStart(2, "0")}:${String(seed.minute).padStart(2, "0")}:00Z`,
        );
        const end = new Date(start.getTime() + seed.minutes * 60000);
        const segment = { startAt: start.toISOString(), endAt: end.toISOString() };
        return {
          id: seed.id,
          taskId: seed.taskId,
          title: "",
          mode: "focus",
          status: "completed",
          measurementMode: "stopwatch",
          durationMinutes: seed.minutes,
          accumulatedSeconds: seed.minutes * 60,
          completed: true,
          startAt: segment.startAt,
          endAt: segment.endAt,
          startedAt: segment.startAt,
          endedAt: segment.endAt,
          pausedAt: "",
          segments: [segment],
          source: "focus_page",
          projectId: "",
          projectName: "",
          focusNote: "",
          createdAt: segment.startAt,
          updatedAt: segment.endAt,
        };
      };
      const write = () => {
        const raw = window.localStorage.getItem(key as string);
        if (!raw) return false;
        const data = JSON.parse(raw as string);
        if (data.focusSessions?.length) return true;
        data.tasks = [
          { id: "t1", title: "Proposal", completed: false, status: "todo", listId: "list-inbox", projectId: "", order: 0, createdAt: "", updatedAt: "" },
        ];
        data.focusSessions = (seeds as Seed[]).map(build);
        window.localStorage.setItem(key as string, JSON.stringify(data));
        return true;
      };
      if (!write()) {
        const original = window.localStorage.setItem.bind(window.localStorage);
        let done = false;
        window.localStorage.setItem = (k: string, v: string) => {
          original(k, v);
          if (!done && k === key) {
            done = true;
            write();
          }
        };
      }
    },
    [STORAGE_KEY, sessions] as const,
  );
}

async function openRecords(page: Page): Promise<void> {
  await page.clock.install();
  await page.clock.setFixedTime(new Date(`${DAY}T21:30:00Z`));
  await openApp(page);
  await page.goto("/focus");
  await page.getByRole("tab", { name: "Records", exact: true }).click();
  await expect(page.locator(".focus-records")).toBeVisible();
}

test("타임라인의 마크가 그 시각의 눈금 위에 놓인다", async ({ page }) => {
  // 09:20 과 20:14 — 하나는 축의 앞쪽, 하나는 뒤쪽이라 눈금이 어긋나면 갈린다.
  await seedSessions(page, [
    { id: "s1", taskId: "t1", day: DAY, hour: 9, minute: 20, minutes: 52 },
    { id: "s2", taskId: null, day: DAY, hour: 20, minute: 14, minutes: 34 },
  ]);
  await openRecords(page);

  const geometry = await page.evaluate(() => {
    const track = document.querySelector(".focus-timeline-track")!.getBoundingClientRect();
    const hourAt = (x: number) => ((x - track.left) / track.width) * 24;
    return {
      marks: [...document.querySelectorAll(".focus-timeline-span")].map((el) => ({
        label: el.textContent ?? "",
        startHour: hourAt(el.getBoundingClientRect().left),
      })),
      // 눈금선이 자기가 말하는 시각 위에 서 있는지. 라벨은 `::before` 라서 직접
      // 잴 수 없지만, 라벨이 앉는 자리는 그 칸의 왼쪽 테두리다.
      ticks: [...document.querySelectorAll(".focus-timeline-hours span")].map((el) => ({
        says: Number((el.getAttribute("data-hour") ?? "").slice(0, 2)),
        atHour: hourAt(el.getBoundingClientRect().left),
      })),
    };
  });

  // **눈금이 자기가 말하는 시각 위에 있어야 한다.** 이것이 이 테스트의 요점이다 —
  // 마크는 언제나 트랙에 맞게 놓였고, 틀린 것은 축의 라벨이었다. 06 부터 붙이던
  // 시절에는 "09:00" 라벨이 트랙의 3.6시 자리에 서서, 09:20 의 구간이 14시쯤에
  // 있는 것처럼 읽혔다.
  expect(geometry.ticks.length).toBeGreaterThan(0);
  for (const tick of geometry.ticks)
    expect(tick.atHour, `눈금 ${tick.says}:00`).toBeCloseTo(tick.says, 0);

  const morning = geometry.marks.find((m) => m.label === "52m")!;
  const evening = geometry.marks.find((m) => m.label === "34m")!;
  // 09:20 = 9.33시, 20:14 = 20.23시.
  expect(morning.startHour).toBeGreaterThan(9);
  expect(morning.startHour).toBeLessThan(9.7);
  expect(evening.startHour).toBeGreaterThan(20);
  expect(evening.startHour).toBeLessThan(20.6);
});

test("기간 칩이 범위를 정하고, 날짜 내비가 그것을 옮긴다", async ({ page }) => {
  await seedSessions(page, [
    { id: "today", taskId: "t1", day: DAY, hour: 10, minute: 0, minutes: 30 },
    { id: "yesterday", taskId: "t1", day: YESTERDAY, hour: 10, minute: 0, minutes: 20 },
  ]);
  await openRecords(page);

  const rows = page.locator(".focus-record-row");
  await expect(rows).toHaveCount(1);

  // 하루 뒤로 가면 어제의 세션 하나가 보인다.
  await page.getByRole("button", { name: "Previous period" }).click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator(".focus-kpi.is-hero strong")).toHaveText("20m");

  // 앞으로 가는 길은 지금까지만 있다 — 미래에는 기록이 없다.
  await page.getByRole("button", { name: "Next period" }).click();
  await expect(page.locator(".focus-kpi.is-hero strong")).toHaveText("30m");
  await expect(page.getByRole("button", { name: "Next period" })).toBeDisabled();

  // 이번 주는 둘 다 담는다 — 칩이 범위의 길이를 바꾼다.
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.locator(".focus-kpi.is-hero strong")).toHaveText("50m");

  // 전체는 옮길 것이 없으므로 내비가 잠긴다 (§7.2.0).
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("button", { name: "Previous period" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next period" })).toBeDisabled();
});

test("비교는 무엇 대비인지 말하고, 없으면 없다고 말한다", async ({ page }) => {
  await seedSessions(page, [
    { id: "today", taskId: "t1", day: DAY, hour: 10, minute: 0, minutes: 30 },
    { id: "yesterday", taskId: "t1", day: YESTERDAY, hour: 10, minute: 0, minutes: 20 },
  ]);
  await openRecords(page);

  // 30 대 20 은 +50%. "무엇 대비" 를 말하지 않는 숫자는 장식이다 (§5.5).
  await expect(page.locator(".focus-kpi.is-hero")).toContainText("50% more than yesterday");

  // 비교할 기간이 비어 있으면 숫자를 지어내지 않는다.
  await page.getByRole("button", { name: "Previous period" }).click();
  await expect(page.locator(".focus-kpi.is-hero")).toContainText("No earlier period");
});

test("기록이 없는 기간은 비었다고 말한다", async ({ page }) => {
  await seedSessions(page, []);
  await openRecords(page);
  await expect(page.locator(".focus-record-row")).toHaveCount(0);
  await expect(page.getByText("No focus records in this period.")).toBeVisible();
  await expect(page.getByText("Nothing to break down yet.")).toBeVisible();
  // 격자는 남는다 — 다음에 무엇이 생길지 형태가 말해준다 (§5.6).
  await expect(page.locator(".focus-timeline")).toBeVisible();
  await expect(page.locator(".focus-kpi.is-hero strong")).toHaveText("—");
});

test("작업별 막대는 단색이고 값 순이며, 몫을 함께 말한다", async ({ page }) => {
  await seedSessions(page, [
    { id: "a", taskId: "t1", day: DAY, hour: 9, minute: 0, minutes: 60 },
    { id: "b", taskId: null, day: DAY, hour: 13, minute: 0, minutes: 20 },
    { id: "c", taskId: "t1", day: DAY, hour: 16, minute: 0, minutes: 20 },
  ]);
  await openRecords(page);

  const rows = page.locator(".focus-bar-row");
  await expect(rows).toHaveCount(2);
  // 많은 것부터. 80분과 20분이므로 80% / 20%.
  await expect(rows.first()).toContainText("80%");
  await expect(rows.last()).toContainText("20%");

  // **모든 막대가 한 색이다** (§5.3). 순위로 색을 주면 날짜를 넘길 때 같은 작업이
  // 다른 색이 되고, 사용자가 고르는 태그 색은 애초에 CVD 검증을 통과할 수 없다.
  const fills = await page.evaluate(() =>
    [...document.querySelectorAll(".focus-bar > span")].map(
      (el) => getComputedStyle(el).backgroundColor,
    ),
  );
  expect(new Set(fills).size).toBe(1);
});

test("히트맵은 한 색 램프이고 스케일 범례를 단다", async ({ page }) => {
  await seedSessions(page, [
    { id: "big", taskId: "t1", day: DAY, hour: 9, minute: 0, minutes: 120 },
    { id: "small", taskId: "t1", day: "2026-08-11", hour: 9, minute: 0, minutes: 20 },
  ]);
  await openRecords(page);

  // 4주 × 7일.
  await expect(page.locator(".focus-heat-row")).toHaveCount(4);
  await expect(page.locator(".focus-heat-cell").first()).toBeVisible();
  // 순차 램프에는 범례가 붙는다 — 색이 무엇을 뜻하는지 화면이 말해야 한다.
  await expect(page.locator(".focus-heat-legend")).toBeVisible();

  /* 순차 램프의 불변식은 **밝기가 한 방향으로 간다**는 것이다. 색상각으로
     재려다 한 번 헛짚었다 — `color-mix` 의 결과는 `color(srgb 0.78 …)` 로 오는데
     `\d+` 로 뜯으면 "0.78" 이 [0, 78] 이 되어 엉뚱한 각이 나온다. 그리고 옅은
     단일수록 채도가 낮아 색상각 자체가 불안정하다. 밝기는 그렇지 않다. */
  const levels = await page.evaluate(() =>
    [1, 2, 3, 4].map((level) => {
      const el = document.querySelector(`.focus-heat-legend .is-${level}`)!;
      const raw = getComputedStyle(el).backgroundColor;
      const parts = raw.match(/[\d.]+/g)!.map(Number);
      // `rgb(0, 100, 210)` 은 0~255, `color(srgb 0.78 …)` 는 0~1 이다.
      const scale = raw.startsWith("color(") ? 255 : 1;
      const [r, g, b] = parts.slice(raw.startsWith("color(") ? 0 : 0, 3).map((v) => v * scale);
      const channel = (v: number) => {
        const n = v / 255;
        return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }),
  );
  for (let i = 1; i < levels.length; i += 1)
    expect(levels[i], `단 ${i + 1} 은 단 ${i} 보다 어둡다`).toBeLessThan(levels[i - 1]);
});

test("추이의 눈금은 읽히는 수다", async ({ page }) => {
  await seedSessions(page, [
    { id: "a", taskId: "t1", day: DAY, hour: 9, minute: 0, minutes: 156 },
  ]);
  await openRecords(page);

  // 최댓값을 셋으로 그냥 나누면 2.6h·1.7h·0.9h 가 나온다. 30분 배수로 올려서
  // 사람이 셀 수 있는 눈금을 만든다.
  const ticks = await page.evaluate(() =>
    [...document.querySelectorAll(".focus-trend text")]
      .map((el) => el.textContent ?? "")
      .filter((t) => /h$|^0$/.test(t)),
  );
  expect(ticks).toContain("0");
  for (const tick of ticks) {
    if (tick === "0") continue;
    const hours = Number(tick.replace("h", ""));
    // 0.5 의 배수여야 한다 — 30분 단.
    expect(Math.round(hours * 2) / 2).toBeCloseTo(hours, 5);
  }
});
