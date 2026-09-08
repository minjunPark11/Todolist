import { useCallback, useEffect, useRef } from "react";
import { isEmptyPlan, planOutbound } from "../domain/calendar/googleSync/outboundPlan";
import { outboundTagNames, withTagBlock } from "../domain/calendar/googleSync/tagBlock";
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

export function prepareGoogleTasks(tasks: Task[], tags: Tag[], links: TaskTag[], labels: LabelOutcome) {
  const byProject = new Map(labels.mappings.map((m) => [m.projectId, m.googleLabelId]));
  return tasks.map((task) => {
    const resolvedTags = outboundTagNames(task, tags, links);
    const eventLabelId = labels.supported === true ? byProject.get(task.projectId) ?? null : undefined;
    return { ...task, resolvedTags, eventLabelId,
      metadataKey: JSON.stringify([withTagBlock("", resolvedTags), eventLabelId]) };
  });
}

export function useGoogleOutboundSync(input: GoogleOutboundSyncInput) {
  const { tasks, projects = EMPTY_PROJECTS, tags = EMPTY_TAGS, taskTags = EMPTY_LINKS, timezone, tombstones, signedIn, accountKey } = input;
  const latest = useRef(input);
  latest.current = input;
  const running = useRef(false);
  const pending = useRef(false);
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
      const snapshot = latest.current;
      const lists = snapshot.projects ?? EMPTY_PROJECTS;
      const projectKey = JSON.stringify(lists.map((p) => [p.id, p.name, p.color, p.archivedAt, p.deletedAt, p.googleLabelId, p.updatedAt]));
      const cached = labelCache.current;
      if (!forceProbe.current && cached?.projectKey === projectKey) {
        const prepared = prepareGoogleTasks(snapshot.tasks, snapshot.tags ?? EMPTY_TAGS, snapshot.taskTags ?? EMPTY_LINKS, cached.outcome);
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
      const prepared = prepareGoogleTasks(snapshot.tasks, snapshot.tags ?? EMPTY_TAGS, snapshot.taskTags ?? EMPTY_LINKS, labels);
      const plan = planOutbound(prepared, snapshot.tombstones ?? []);
      const outcome: OutboundOutcome = isEmptyPlan(plan)
        ? { mapped: [], unlinked: [], clearedOrphans: [], failed: 0, expired: false }
        : await runOutbound({ plan, calendarId: connection.calendarId, timezone: snapshot.timezone,
            accessToken, labelsSupported: labels.supported === true, deps: { fetch: googleCalendarFetch } });
      if (epoch !== generation.current || !latest.current.signedIn) return;
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
