import type {
  FocusFlow,
  FocusSession,
  PlannerData,
  PomodoroSettings,
} from "../../types";
import { isTaskOpen } from "../tasks/taskState";

export const DEFAULT_POMODORO: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoBreak: true,
  autoFocus: false,
};

export function normalizeFocusFlow(value: Partial<FocusFlow> | null | undefined): FocusFlow | null {
  if (!value?.id || !value.settings || !["focus","break_ready","break_running","break_paused","next_ready"].includes(value.phase ?? "")) return null;
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
  return { ...value, id:value.id, revision:finite(value.revision), settings:sanitizePomodoro(value.settings), completedBlocks:Math.floor(finite(value.completedBlocks)), taskId:typeof value.taskId === "string" ? value.taskId : null,
    phase:value.phase!, lastSessionId:value.lastSessionId ?? "", breakSeconds:Math.min(3600,finite(value.breakSeconds)), breakElapsedMs:finite(value.breakElapsedMs),
    startedAt:typeof value.startedAt === "string" && Number.isFinite(Date.parse(value.startedAt)) ? value.startedAt : new Date().toISOString(), checkpointAt:typeof value.checkpointAt === "string" && Number.isFinite(Date.parse(value.checkpointAt)) ? value.checkpointAt : value.startedAt ?? new Date().toISOString() };
}
export function sanitizePomodoro(
  value: Partial<PomodoroSettings> = {},
): PomodoroSettings {
  const number = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(min, Math.min(max, Math.round(v)))
      : fallback;
  const shortBreakMinutes = number(value.shortBreakMinutes, 5, 1, 60);
  return {
    focusMinutes: number(value.focusMinutes, 25, 1, 180),
    shortBreakMinutes,
    longBreakMinutes: Math.max(
      shortBreakMinutes,
      number(value.longBreakMinutes, 15, 1, 60),
    ),
    longBreakEvery: number(value.longBreakEvery, 4, 2, 8),
    autoBreak: typeof value.autoBreak === "boolean" ? value.autoBreak : true,
    autoFocus: value.autoFocus === true,
  };
}
export function elapsedMs(session: FocusSession, now: number): number {
  const banked = session.accumulatedMs ?? session.accumulatedSeconds * 1000;
  return (
    banked +
    (session.status === "running"
      ? Math.max(0, now - Date.parse(session.startAt)) || 0
      : 0)
  );
}
export function focusDisplaySeconds(
  session: FocusSession,
  now: number,
): number {
  const elapsed = elapsedMs(session, now) / 1000;
  return session.measurementMode === "pomodoro" && session.targetSeconds
    ? Math.ceil(Math.max(0, session.targetSeconds - elapsed))
    : Math.floor(elapsed);
}
export function breakRemaining(flow: FocusFlow, now: number): number {
  return Math.ceil(
    Math.max(
      0,
      flow.breakSeconds -
        (flow.breakElapsedMs +
          (flow.phase === "break_running"
            ? Math.max(0, now - Date.parse(flow.startedAt))
            : 0)) /
          1000,
    ),
  );
}
export type FocusCommand =
  | {
      type: "start";
      taskId: string | null;
      mode?: "stopwatch" | "pomodoro";
      settings?: PomodoroSettings;
      source?: FocusSession["source"];
    }
  | { type: "pause" | "resume" | "finish"; id: string; revision?: number }
  | { type: "note"; id: string; note: string }
  | { type: "link"; id: string; taskId: string | null; revision?: number }
  | { type: "delete"; id: string; revision?: number }
  | {
      type:
        | "break_start"
        | "break_pause"
        | "break_resume"
        | "break_end"
        | "flow_end";
      id: string;
    }
  | { type: "tick" | "checkpoint" }
  | { type: "recover_gap"; id: string; endAt: string };

function close(session: FocusSession, now: number): FocusSession {
  const accumulatedMs = elapsedMs(session, now);
  const endAt = new Date(now).toISOString();
  return {
    ...session,
    accumulatedMs,
    accumulatedSeconds: Math.floor(accumulatedMs / 1000),
    segments:
      session.status === "running" && Date.parse(session.startAt) < now
        ? [...session.segments, { startAt: session.startAt, endAt }]
        : session.segments,
    checkpointAt: endAt,
    updatedAt: endAt,
    revision: (session.revision ?? 0) + 1,
  };
}
function finish(
  data: PlannerData,
  session: FocusSession,
  now: number,
  reached: boolean,
): PlannerData {
  const done = {
    ...close(session, now),
    status: "completed" as const,
    completed: true,
    endedAt: new Date(now).toISOString(),
    endAt: new Date(now).toISOString(),
    pausedAt: "",
    recoveryRequired: false,
    endReason: reached ? ("target_reached" as const) : ("user_end" as const),
  };
  let flow = data.focusFlow;
  if (flow?.phase === "focus") {
    const completedBlocks = flow.completedBlocks + (reached ? 1 : 0);
    flow = {
      ...flow,
      revision: flow.revision + 1,
      completedBlocks,
      lastSessionId: session.id,
      phase: reached ? "break_ready" : "next_ready",
      breakElapsedMs: 0,
      breakSeconds:
        (completedBlocks > 0 &&
        completedBlocks % flow.settings.longBreakEvery === 0
          ? flow.settings.longBreakMinutes
          : flow.settings.shortBreakMinutes) * 60,
    };
  }
  return {
    ...data,
    focusFlow: flow,
    activeSessionId: "",
    focusSessions: data.focusSessions.map((s) =>
      s.id === session.id ? done : s,
    ),
    tasks: data.tasks.map((t) =>
      t.id === session.taskId
        ? {
            ...t,
            actualSeconds: t.actualSeconds + done.accumulatedSeconds,
            activeSessionId: "",
            lastFocusedAt: done.endedAt,
            updatedAt: done.endedAt,
          }
        : t,
    ),
  };
}

/** Pure transition. Persistence and notifications belong to the single host controller. */
export function reduceFocus(
  data: PlannerData,
  command: FocusCommand,
  now = Date.now(),
  makeId: () => string = () => crypto.randomUUID(),
): PlannerData {
  const iso = new Date(now).toISOString();
  let current = data;
  let active = current.focusSessions.find(
    (s) =>
      s.id === current.activeSessionId &&
      (s.status === "running" || s.status === "paused"),
  );
  // Resolve the exact deadline BEFORE a racing pause/finish. Never bill delayed callbacks.
  if (
    active?.status === "running" &&
    active.measurementMode === "pomodoro" &&
    active.targetSeconds &&
    elapsedMs(active, now) >= active.targetSeconds * 1000
  ) {
    const boundary =
      Date.parse(active.startAt) +
      Math.max(
        0,
        active.targetSeconds * 1000 -
          (active.accumulatedMs ?? active.accumulatedSeconds * 1000),
      );
    current = finish(current, active, boundary, true);
    active = undefined;
    if (current.focusFlow?.settings.autoBreak && now - boundary < 30000) {
      current = {
        ...current,
        focusFlow: {
          ...current.focusFlow,
          phase: "break_running",
          startedAt: iso,
          checkpointAt: iso,
        },
      };
    }
  }
  let flow = current.focusFlow;
  if (command.type === "start") {
    if (active || (flow && !["next_ready"].includes(flow.phase)))
      return current;
    const task = current.tasks.find((t) => t.id === command.taskId);
    if (command.taskId && (!task || !isTaskOpen(task))) return current;
    const mode = command.mode ?? "stopwatch";
    if (mode === "pomodoro") {
      flow = flow ?? {
        id: makeId(),
        revision: 0,
        settings: sanitizePomodoro(command.settings),
        completedBlocks: 0,
        taskId: command.taskId,
        phase: "focus",
        lastSessionId: "",
        breakSeconds: 0,
        breakElapsedMs: 0,
        startedAt: iso,
        checkpointAt: iso,
      };
      flow = {
        ...flow,
        phase: "focus",
        taskId: command.taskId,
        revision: flow.revision + 1,
      };
    } else flow = null;
    const session: FocusSession = {
      id: makeId(),
      schemaVersion: 2,
      revision: 1,
      taskId: command.taskId,
      title: task?.title ?? "",
      mode: "focus",
      measurementMode: mode,
      targetSeconds:
        mode === "pomodoro" ? flow!.settings.focusMinutes * 60 : null,
      durationMinutes: mode === "pomodoro" ? flow!.settings.focusMinutes : 0,
      status: "running",
      accumulatedSeconds: 0,
      accumulatedMs: 0,
      completed: false,
      startAt: iso,
      startedAt: iso,
      endAt: "",
      endedAt: "",
      pausedAt: "",
      segments: [],
      source: command.source ?? "focus_page",
      projectId: task?.projectId ?? "",
      projectName:
        current.projects.find((p) => p.id === task?.projectId)?.name ?? "",
      focusNote: "",
      checkpointAt: iso,
      createdAt: iso,
      updatedAt: iso,
    };
    return {
      ...current,
      focusFlow: flow,
      activeSessionId: session.id,
      focusSessions: [session, ...current.focusSessions],
      tasks: current.tasks.map((t) =>
        t.id === command.taskId
          ? {
              ...t,
              activeSessionId: session.id,
              lastFocusedAt: iso,
              updatedAt: iso,
            }
          : t,
      ),
    };
  }
  if (command.type === "tick" || command.type === "checkpoint") {
    if (flow?.phase === "break_running" && breakRemaining(flow, now) === 0) {
      const boundary =
        Date.parse(flow.startedAt) +
        flow.breakSeconds * 1000 -
        flow.breakElapsedMs;
      current = {
        ...current,
        focusFlow: {
          ...flow,
          phase: "next_ready",
          revision: flow.revision + 1,
        },
      };
      if (flow.settings.autoFocus && now - boundary < 30000) {
        const taskId = current.tasks.some(
          (t) => t.id === flow.taskId && isTaskOpen(t),
        )
          ? flow.taskId
          : null;
        return reduceFocus(
          current,
          { type: "start", mode: "pomodoro", taskId },
          now,
          makeId,
        );
      }
    }
    if (command.type === "checkpoint")
      return {
        ...current,
        focusSessions: current.focusSessions.map((s) =>
          s.status === "running" && s.id === current.activeSessionId
            ? { ...s, checkpointAt: iso }
            : s,
        ),
        focusFlow: current.focusFlow
          ? { ...current.focusFlow, checkpointAt: iso }
          : null,
      };
    return current;
  }
  if (command.type.startsWith("break_") || command.type === "flow_end") {
    if (!flow || !("id" in command) || command.id !== flow.id || active)
      return current;
    if (command.type === "flow_end") return { ...current, focusFlow: null };
    if (command.type === "break_end")
      return {
        ...current,
        focusFlow: {
          ...flow,
          phase: "next_ready",
          revision: flow.revision + 1,
        },
      };
    if (command.type === "break_pause" && flow.phase === "break_running")
      return {
        ...current,
        focusFlow: {
          ...flow,
          phase: "break_paused",
          breakElapsedMs:
            flow.breakElapsedMs + Math.max(0, now - Date.parse(flow.startedAt)),
          revision: flow.revision + 1,
        },
      };
    if (
      (command.type === "break_start" && flow.phase === "break_ready") ||
      (command.type === "break_resume" && flow.phase === "break_paused")
    )
      return {
        ...current,
        focusFlow: {
          ...flow,
          phase: "break_running",
          startedAt: iso,
          checkpointAt: iso,
          revision: flow.revision + 1,
        },
      };
    return current;
  }
  if (!("id" in command)) return current;
  const session = current.focusSessions.find((s) => s.id === command.id);
  if (!session) return current;
  if ((command.type === "pause" || command.type === "resume" || command.type === "finish") && command.revision !== undefined && command.revision !== (session.revision ?? 0)) return current;
  const replace = (next: FocusSession) => ({
    ...current,
    focusSessions: current.focusSessions.map((s) =>
      s.id === next.id ? next : s,
    ),
  });
  if (command.type === "note")
    return replace({
      ...session,
      focusNote: command.note,
      updatedAt: iso,
      revision: (session.revision ?? 0) + 1,
    });
  if (
    command.type === "pause" &&
    session.id === active?.id &&
    session.status === "running"
  )
    return replace({ ...close(session, now), status: "paused", pausedAt: iso });
  if (
    command.type === "resume" &&
    session.id === active?.id &&
    session.status === "paused"
  )
    return replace({
      ...session,
      status: "running",
      startAt: iso,
      pausedAt: "",
      checkpointAt: iso,
      recoveryRequired: false,
      revision: (session.revision ?? 0) + 1,
      updatedAt: iso,
    });
  if (command.type === "finish" && session.id === active?.id)
    return finish(current, session, now, false);
  if (
    command.type === "recover_gap" &&
    session.recoveryRequired &&
    session.status === "paused"
  ) {
    const start = Date.parse(session.checkpointAt ?? session.pausedAt);
    let end = Date.parse(command.endAt);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end > now
    )
      return current;
    if (session.measurementMode === "pomodoro" && session.targetSeconds)
      end = Math.min(
        end,
        start +
          Math.max(0, session.targetSeconds * 1000 - elapsedMs(session, now)),
      );
    if (
      current.focusSessions.some(
        (s) =>
          s.id !== session.id &&
          s.segments.some(
            (g) => Date.parse(g.startAt) < end && Date.parse(g.endAt) > start,
          ),
      )
    )
      return current;
    const ms = elapsedMs(session, now) + end - start;
    return replace({
      ...session,
      accumulatedMs: ms,
      accumulatedSeconds: Math.floor(ms / 1000),
      segments: [
        ...session.segments,
        {
          startAt: new Date(start).toISOString(),
          endAt: new Date(end).toISOString(),
        },
      ],
      recoveryRequired: false,
      endReason: "recovery_end",
      revision: (session.revision ?? 0) + 1,
      updatedAt: iso,
    });
  }
  if (
    (command.type === "link" || command.type === "delete") &&
    session.status === "completed"
  ) {
    if (
      command.revision !== undefined &&
      command.revision !== (session.revision ?? 0)
    )
      throw new Error(
        "이 기록이 변경되었습니다. 다시 열어 주세요. / Record changed. Reopen it.",
      );
    const newTaskId = command.type === "link" ? command.taskId : null;
    const task = current.tasks.find((t) => t.id === newTaskId);
    if (newTaskId && (!task || task.deletedAt)) return current;
    if (command.type === "link" && newTaskId === session.taskId) return current;
    return {
      ...current,
      focusSessions:
        command.type === "delete"
          ? current.focusSessions.filter((s) => s.id !== session.id)
          : current.focusSessions.map((s) =>
              s.id === session.id
                ? {
                    ...s,
                    taskId: newTaskId,
                    title: task?.title ?? "",
                    projectId: task?.projectId ?? "",
                    projectName:
                      current.projects.find((p) => p.id === task?.projectId)
                        ?.name ?? "",
                    revision: (s.revision ?? 0) + 1,
                    updatedAt: iso,
                  }
                : s,
            ),
      tasks: current.tasks.map((t) => {
        const delta =
          (t.id === newTaskId ? session.accumulatedSeconds : 0) -
          (t.id === session.taskId ? session.accumulatedSeconds : 0);
        return delta
          ? {
              ...t,
              actualSeconds: Math.max(0, t.actualSeconds + delta),
              updatedAt: iso,
            }
          : t;
      }),
    };
  }
  return current;
}
