import { describe, expect, it } from "vitest";
import { emptyData, normalizeData } from "../plannerData/normalize";
import { DEFAULT_POMODORO, reduceFocus, type FocusCommand } from "./engine";
import type { PlannerData } from "../../types";

/**
 * 손으로 고른 경로 대신, 명령을 섞어 돌려보며 깨지지 않아야 할 것 셋을 본다.
 *
 * engine.test.ts 는 시나리오를 하나씩 적어 확인한다 — 읽기 좋고, 무엇을
 * 의도했는지 남는다. 그런데 이 리듀서는 명령이 15가지고 상태가 세션·흐름
 * 두 축이라, 사람이 고른 경로가 닿지 않는 조합이 남는다. 여기서는 경로를
 * 고르지 않고 **불변식**만 쥔다.
 *
 * 셋 다 사용자가 알아채는 종류다: 기록 시간이 맞지 않는다, 실제로 흐른
 * 시간보다 많이 적힌다, 타이머가 둘이 된다.
 */

const AT = Date.parse("2026-09-06T10:00:00Z");
const INITIAL: Record<string, number> = { a: 100, b: 200 };

function seed(): PlannerData {
  return normalizeData({
    ...emptyData(),
    tasks: [
      { id: "a", title: "A", status: "todo", actualSeconds: INITIAL.a },
      { id: "b", title: "B", status: "todo", actualSeconds: INITIAL.b },
    ],
  });
}

/** 과제의 기록 시간 = 그 과제에 달린 완료 세션들의 합. */
function imbalance(data: PlannerData): string | null {
  for (const task of data.tasks) {
    const expected =
      INITIAL[task.id] +
      data.focusSessions
        .filter((session) => session.status === "completed" && session.taskId === task.id)
        .reduce((sum, session) => sum + session.accumulatedSeconds, 0);
    if (task.actualSeconds !== expected) {
      return `${task.id}: actualSeconds=${task.actualSeconds} 인데 세션들의 합은 ${expected}`;
    }
  }
  return null;
}

/** 세션은 시작한 뒤 실제로 흐른 시간보다 많이 기록할 수 없다. */
function overcounted(data: PlannerData, now: number): string | null {
  for (const session of data.focusSessions) {
    const banked = session.accumulatedMs ?? 0;
    if (!Number.isFinite(banked) || banked < 0) return `${session.id}: accumulatedMs=${session.accumulatedMs}`;
    const wall = now - Date.parse(session.startedAt);
    // 1초는 초 단위 내림·올림이 도는 여유다.
    if (banked > wall + 1000) {
      return `${session.id}: ${Math.round(banked / 1000)}초 적혔는데 시작 뒤 흐른 시간은 ${Math.round(wall / 1000)}초`;
    }
  }
  return null;
}

/** 도는 세션은 하나뿐이고, activeSessionId 가 그것을 가리킨다. */
function twoRunning(data: PlannerData): string | null {
  const running = data.focusSessions.filter((session) => session.status === "running");
  if (running.length > 1) return `동시에 도는 세션 ${running.length}개`;
  const active = data.focusSessions.find((session) => session.id === data.activeSessionId);
  if (data.activeSessionId && !active) return `activeSessionId=${data.activeSessionId} 인데 그런 세션이 없다`;
  if (active?.status === "completed") return `activeSessionId 가 이미 끝난 세션을 가리킨다`;
  if (running.length === 1 && running[0].id !== data.activeSessionId) {
    return `도는 세션이 activeSessionId 와 다르다`;
  }
  return null;
}

const CHECKS: Array<[string, (data: PlannerData, now: number) => string | null]> = [
  ["기록 시간의 합", (data) => imbalance(data)],
  ["흐른 시간보다 많이 적힘", overcounted],
  ["타이머가 둘", (data) => twoRunning(data)],
];

function choices(data: PlannerData, pick: <T>(xs: T[]) => T): FocusCommand[] {
  const active = data.focusSessions.find((session) => session.id === data.activeSessionId);
  const some = data.focusSessions.length ? pick(data.focusSessions) : undefined;
  const flow = data.focusFlow;
  const out: FocusCommand[] = [
    {
      type: "start",
      taskId: pick(["a", "b", null]) as string | null,
      mode: pick(["stopwatch", "pomodoro"]) as "stopwatch" | "pomodoro",
      settings: DEFAULT_POMODORO,
    },
    { type: "tick" },
    { type: "checkpoint" },
  ];
  if (active) {
    out.push({ type: "pause", id: active.id }, { type: "resume", id: active.id }, { type: "finish", id: active.id });
  }
  if (some) {
    out.push(
      { type: "link", id: some.id, taskId: pick(["a", "b", null]) as string | null },
      { type: "delete", id: some.id },
      { type: "note", id: some.id, note: "n" },
    );
  }
  if (flow) {
    out.push(
      { type: "break_start", id: flow.id },
      { type: "break_pause", id: flow.id },
      { type: "break_resume", id: flow.id },
      { type: "break_end", id: flow.id },
      { type: "flow_end", id: flow.id },
    );
  }
  return out;
}

/** 씨앗이 고정된 난수 — 실패하면 같은 경로가 다시 나온다. */
function walk(runs: number, steps: number): { broken: string[]; applied: number } {
  let state = 12345;
  const random = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(random() * xs.length)];
  const broken: string[] = [];
  let ids = 0;
  let applied = 0;

  for (let run = 0; run < runs; run += 1) {
    let data = seed();
    let now = AT;
    const trail: string[] = [];
    for (let step = 0; step < steps; step += 1) {
      const command = pick(choices(data, pick));
      now += Math.floor(random() * 40 * 60000);
      try {
        data = reduceFocus(data, command, now, () => `id-${++ids}`);
      } catch {
        // link·delete 의 개정 충돌은 일부러 던진다. 상태는 그대로다.
        continue;
      }
      applied += 1;
      trail.push(`${command.type}${"taskId" in command ? `(${command.taskId})` : ""}`);
      for (const [name, check] of CHECKS) {
        const bad = check(data, now);
        if (bad) {
          broken.push(`[${name}] ${bad}\n    경로: ${trail.join(" → ")}`);
          step = steps;
          break;
        }
      }
    }
  }
  return { broken, applied };
}

describe("무엇을 섞어 돌려도 깨지지 않아야 하는 것", () => {
  const { broken, applied } = walk(400, 14);

  it("실제로 명령을 돌리기는 했는가", () => {
    // 자기 점검. `choices` 가 빈 배열을 주거나 reduceFocus 가 전부 던지면
    // 아래 검사는 아무것도 보지 않은 채 통과한다.
    expect(applied).toBeGreaterThan(3000);
  });

  it("기록 시간의 합도, 흐른 시간도, 타이머 개수도 어긋나지 않는다", () => {
    // 이 셋이 정말 깨질 수 있는 검사인지는 엔진을 일부러 부숴 확인했다:
    //   link 의 차감을 없애면       → [기록 시간의 합] 이 run 0 에서 잡는다
    //   close() 가 두 배로 세면     → [흐른 시간보다 많이 적힘] 이 run 0 에서 잡는다
    //   start 의 중복 거절을 없애면 → [타이머가 둘] 이 run 1 에서 잡는다
    expect(broken.slice(0, 3)).toEqual([]);
  });
});
