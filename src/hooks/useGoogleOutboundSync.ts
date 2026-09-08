import { useCallback, useEffect, useRef } from "react";
import { isEmptyPlan, planOutbound } from "../domain/calendar/googleSync/outboundPlan";
import {
  currentAccessToken, GOOGLE_CONNECTION_CHANGED, GOOGLE_LABELS_STATUS, GOOGLE_SYNC_REQUESTED,
  readConnection, saveLabelsSupported, googleCalendarFetch, GOOGLE_SYNC_FINISHED,
} from "../lib/googleCalendar";
import { runLabels, type LabelOutcome } from "../lib/googleCalendarLabels";
import { runOutbound, type OutboundOutcome } from "../lib/googleCalendarOutbound";
import type { Project, Tag, Task, TaskTag } from "../types";

export interface GoogleOutboundSyncInput {
  tasks: Task[];
  projects?: Project[];
  tags?: Tag[];
  taskTags?: TaskTag[];
  timezone: string;
  tombstones: string[] | undefined;
  signedIn: boolean;
  accountKey?: string;
  onResult: (outcome: OutboundOutcome) => void;
}

const DEBOUNCE_MS = 1800;
const EMPTY_PROJECTS: Project[] = [];
const EMPTY_TAGS: Tag[] = [];
const EMPTY_LINKS: TaskTag[] = [];

/**
 * The label a task's List resolves to, and a key that says when that changed.
 *
 * `metadataKey` exists because a Task can need rewriting without its own
 * `updatedAt` moving — its List's label is not on the Task. It no longer
 * carries the tag block: tags stopped going to Google, and the key changing
 * shape is what cleans the blocks already written there. Every synced task
 * mismatches once, gets one PATCH, and comes back with a description that is
 * only what the user wrote.
 */
/**
 * The store's tasks, with mappings a pass has already written but the store
 * has not shown back yet.
 *
 * Exported for its own test: this is the whole defence against duplicate
 * events, and it is a two-line merge that is easy to get subtly wrong.
 *
 * An entry retires itself — once the task carries the id, the map stops being
 * consulted for it. Nothing here expires on a timer: a mapping that never
 * arrives means the write never landed, and re-creating the event then is
 * exactly right.
 */
export function withAppliedMappings(
  tasks: Task[],
  applied: Map<string, OutboundOutcome["mapped"][number]>,
): Task[] {
  if (applied.size === 0) return tasks;
  return tasks.map((task) => {
    const row = applied.get(task.id);
    if (!row) return task;
    if (task.googleEventId === row.googleEventId) {
      applied.delete(task.id);
      return task;
    }
    return {
      ...task,
      googleEventId: row.googleEventId,
      googleEtag: row.googleEtag,
      googleSyncedAt: row.googleSyncedAt,
      ...(row.googleMetadataKey !== undefined ? { googleMetadataKey: row.googleMetadataKey } : {}),
    };
  });
}

export function prepareGoogleTasks(tasks: Task[], labels: LabelOutcome) {
  const byProject = new Map(labels.mappings.map((m) => [m.projectId, m.googleLabelId]));
  return tasks.map((task) => {
    const eventLabelId = labels.supported === true ? byProject.get(task.projectId) ?? null : undefined;
    return { ...task, eventLabelId, metadataKey: JSON.stringify(["v2", eventLabelId]) };
  });
}

export function useGoogleOutboundSync(input: GoogleOutboundSyncInput) {
  const { tasks, projects = EMPTY_PROJECTS, tags = EMPTY_TAGS, taskTags = EMPTY_LINKS, timezone, tombstones, signedIn, accountKey } = input;
  const latest = useRef(input);
  latest.current = input;
  const running = useRef(false);
  const pending = useRef(false);
  /**
   * What the last pass wrote, until the store shows it back.
   *
   * `latest.current` is assigned during RENDER, and a pass ends by calling
   * `onResult` — a `setData` that has not committed by the time the `finally`
   * below starts the queued pass. That pass therefore reads tasks with no
   * `googleEventId` on them and plans a CREATE for events that already exist.
   * Four identical events in one calendar is what that looks like from the
   * outside; every focus or edit during a pass adds another.
   *
   * Holding the mapping here closes the window from both ends: the queued
   * pass, and a second trigger arriving before React commits. An entry is
   * dropped the moment the store agrees with it.
   */
  const applied = useRef(new Map<string, OutboundOutcome["mapped"][number]>());
  const generation = useRef(0);
  const forceProbe = useRef(false);
  const labelCache = useRef<{ key: string; projectKey: string; outcome: LabelOutcome } | null>(null);

  const run = useCallback(async () => {
    if (!latest.current.signedIn) {
      window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_FINISHED, { detail: { ok: false } }));
      return;
    }
    if (running.current) { pending.current = true; return; }
    running.current = true;
    const epoch = generation.current;
    let ok = false;
    try {
      const snapshot = { ...latest.current, tasks: withAppliedMappings(latest.current.tasks, applied.current) };
      const lists = snapshot.projects ?? EMPTY_PROJECTS;
      const projectKey = JSON.stringify(lists.map((p) => [p.id, p.name, p.color, p.archivedAt, p.deletedAt, p.googleLabelId, p.updatedAt]));
      const cached = labelCache.current;
      if (!forceProbe.current && cached?.projectKey === projectKey) {
        const prepared = prepareGoogleTasks(snapshot.tasks, cached.outcome);
        if (isEmptyPlan(planOutbound(prepared, snapshot.tombstones ?? []))) { ok = true; return; }
      }
      const connection = await readConnection();
      if (!connection) return;
      const accessToken = await currentAccessToken();
      if (!accessToken || epoch !== generation.current) return;
      const key = JSON.stringify([connection.calendarId, connection.accountEmail, projectKey]);
      const forced = forceProbe.current;
      forceProbe.current = false;
      let labels: LabelOutcome;
      if (!forced && labelCache.current?.key === key) labels = labelCache.current.outcome;
      else if (!forced && connection.labelsSupported === false) labels = { supported: false, mappings: [], overflow: 0, failed: false };
      else {
        labels = await runLabels(connection.calendarId, accessToken, lists, googleCalendarFetch);
        if (epoch !== generation.current) return;
        if (labels.supported !== null && labels.supported !== connection.labelsSupported) {
          // A pending DB migration must not prevent ordinary event writes.
          await saveLabelsSupported(connection.calendarId, labels.supported).catch(() => undefined);
        }
      }
      if (epoch !== generation.current) return;
      if (labels.supported !== null) labelCache.current = { key, projectKey, outcome: labels };
      window.dispatchEvent(new CustomEvent(GOOGLE_LABELS_STATUS, { detail: labels }));
      const prepared = prepareGoogleTasks(snapshot.tasks, labels);
      const plan = planOutbound(prepared, snapshot.tombstones ?? []);
      const outcome: OutboundOutcome = isEmptyPlan(plan)
        ? { mapped: [], unlinked: [], clearedOrphans: [], failed: 0, expired: false }
        : await runOutbound({ plan, calendarId: connection.calendarId, timezone: snapshot.timezone,
            accessToken, labelsSupported: labels.supported === true, deps: { fetch: googleCalendarFetch } });
      if (epoch !== generation.current || !latest.current.signedIn) return;
      for (const row of outcome.mapped) applied.current.set(row.taskId, row);
      for (const id of outcome.unlinked) applied.current.delete(id);
      outcome.projectMappings = labels.mappings.filter((m) => lists.find((p) => p.id === m.projectId)?.googleLabelId !== m.googleLabelId);
      latest.current.onResult(outcome);
      ok = outcome.failed === 0 && !outcome.expired;
    } catch {
      // No successful response is recorded; the next focus or edit retries.
    } finally {
      running.current = false;
      if (!pending.current && epoch === generation.current) window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_FINISHED, { detail: { ok } }));
      if (pending.current) { pending.current = false; void run(); }
    }
  }, []);

  useEffect(() => {
    generation.current += 1;
    labelCache.current = null;
    // Another account's ids answer nothing about this one's tasks.
    applied.current.clear();
  }, [signedIn, accountKey]);

  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setTimeout(() => void run(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [tasks, projects, tags, taskTags, timezone, tombstones, signedIn, accountKey, run]);

  useEffect(() => {
    const onFocus = () => { if (labelCache.current?.outcome.supported === true) labelCache.current = null; void run(); };
    const onConnection = () => { generation.current += 1; labelCache.current = null; forceProbe.current = true; void run(); };
    const onManual = () => { forceProbe.current = true; void run(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener(GOOGLE_CONNECTION_CHANGED, onConnection);
    window.addEventListener(GOOGLE_SYNC_REQUESTED, onManual);
    return () => {
      generation.current += 1;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(GOOGLE_CONNECTION_CHANGED, onConnection);
      window.removeEventListener(GOOGLE_SYNC_REQUESTED, onManual);
    };
  }, [run]);
}
