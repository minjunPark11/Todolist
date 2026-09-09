import { useCallback, useEffect, useRef } from "react";
import { supabase, supabaseUrl } from "../services/supabaseClient";
import { googleCalendarFetch, GOOGLE_CONNECTION_CHANGED, GOOGLE_SYNC_FINISHED, GOOGLE_SYNC_REQUESTED } from "../lib/googleCalendar";
import { createGoogleTaskInboundDeps } from "../lib/googleTaskInboundTransport";
import { GoogleTaskSelectionChanged, runGoogleTaskCycle, type GoogleTaskChoice, type GoogleTaskCoordinatorDeps } from "../lib/googleTaskCoordinator";
import { publishGoogleTaskSync, readGoogleTaskSyncState, type LocalTaskConflict } from "../lib/googleTaskSyncState";
import type { Task } from "../types";

interface Input { enabled: boolean; accountKey: string; tasks: Task[]; bridge: <T>(work: (userId: string) => Promise<T>) => Promise<T>;
  conflicts: () => LocalTaskConflict[]; resolveConflict: (id: string, choice: "local" | "remote" | "copy", expected: LocalTaskConflict) => Promise<void> }
export function useGoogleTaskSync(input: Input) {
  const latest = useRef(input); latest.current = input;
  const running = useRef(false), epoch = useRef(0);
  const run = useCallback(async (choice?: GoogleTaskChoice) => {
    if (!latest.current.enabled || running.current || !supabase) return;
    running.current = true; const version = epoch.current;
    const valid = () => version === epoch.current && latest.current.enabled;
    publishGoogleTaskSync({ ...readGoogleTaskSyncState(), enabled: true, busy: true, error: "" });
    let ok = false;
    try {
      const result = await latest.current.bridge(async userId => {
        const { data } = await supabase!.auth.getSession(); const session = data.session;
        if (!session || session.user.id !== userId || !valid()) throw new Error("Account changed.");
        const { data: connection, error } = await supabase!.from("google_calendar_connections").select("connection_generation").eq("user_id", userId).maybeSingle();
        if (error) throw error;
        if (!connection) return null;
        const generation = connection.connection_generation as string;
        const original = createGoogleTaskInboundDeps({ userId, generation, jwt: session.access_token, supabaseUrl,
          anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY, fetch: googleCalendarFetch, storage: localStorage, locks: navigator.locks,
          currentUser: async () => valid() ? (await supabase!.auth.getSession()).data.session?.user.id ?? null : null });
        const ownApi = async (path: string, body: unknown) => {
          await original.assertCurrent();
          const response = await googleCalendarFetch(path, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json", "x-focusflow-google-sync-protocol": "2" }, body: JSON.stringify(body) });
          if (!response.ok) throw new Error("Google sync request failed.");
          return response.json();
        };
        const token = await ownApi("/api/google/token", {});
        if (!token.connected || typeof token.accessToken !== "string") throw new Error("Google connection requires attention.");
        const key = `focusflow.google-intent.v1:${userId}:${generation}`;
        const deps: GoogleTaskCoordinatorDeps = { ...original,
          dispatch: async operationId => (await ownApi("/api/google/task-write", { operationId })).state,
          readIntent: () => { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : null; },
          writeIntent: value => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); },
        };
        return navigator.locks.request(`focusflow.google-cycle:${userId}`, { ifAvailable: true }, async lock => {
          if (!lock) throw new Error("Google task sync is running in another window.");
          return runGoogleTaskCycle({ userId, generation, accessToken: token.accessToken }, deps, choice);
        });
      });
      if (valid()) { publishGoogleTaskSync({ ...readGoogleTaskSyncState(), snapshot: result?.snapshot ?? null, pending: result?.pending ?? false, error: "" }); ok = !result?.pending; }
    } catch (error) {
      if (valid()) publishGoogleTaskSync({ ...readGoogleTaskSyncState(), error: error instanceof GoogleTaskSelectionChanged ? "changed" : "failed" });
    } finally {
      running.current = false;
      if (valid()) {
        publishGoogleTaskSync({ ...readGoogleTaskSyncState(), busy: false, localConflicts: latest.current.conflicts() });
        window.dispatchEvent(new CustomEvent(GOOGLE_SYNC_FINISHED, { detail: { ok } }));
      }
    }
  }, []);
  useEffect(() => {
    epoch.current++;
    publishGoogleTaskSync({ enabled: input.enabled, busy: false, pending: false, error: "", snapshot: null, run,
      resolveLocal: async (conflict, choice) => {
        if (!latest.current.enabled || running.current) return;
        try { await latest.current.resolveConflict(conflict.id, choice, conflict); await run(); }
        catch { publishGoogleTaskSync({ ...readGoogleTaskSyncState(), error: "changed", localConflicts: latest.current.conflicts() }); }
      },
      cancel: async operationId => {
        if (!latest.current.enabled || running.current || !supabase) return;
        const snapshot = readGoogleTaskSyncState().snapshot;
        if (!snapshot?.operations.some(o => o.operation_id === operationId && o.state === "reserved")) return;
        const { data } = await supabase.auth.getSession(); if (data.session?.user.id !== snapshot.scope.userId) return;
        const { error } = await supabase.rpc("cancel_google_task_outbound", { p_operation_id: operationId });
        if (error) { publishGoogleTaskSync({ ...readGoogleTaskSyncState(), error: "failed" }); return; }
        await run();
      } });
    return () => { epoch.current++; publishGoogleTaskSync({ enabled: false, busy: false, pending: false, error: "", snapshot: null }); };
  }, [input.enabled, input.accountKey, run]);
  useEffect(() => {
    if (!input.enabled) return;
    const timer = window.setTimeout(() => void run(), 1800);
    return () => window.clearTimeout(timer);
  }, [input.enabled, input.tasks, run]);
  useEffect(() => {
    const trigger = () => void run();
    window.addEventListener("focus", trigger); window.addEventListener("online", trigger);
    window.addEventListener(GOOGLE_CONNECTION_CHANGED, trigger); window.addEventListener(GOOGLE_SYNC_REQUESTED, trigger);
    const timer = window.setInterval(trigger, 60_000);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", trigger); window.removeEventListener("online", trigger);
      window.removeEventListener(GOOGLE_CONNECTION_CHANGED, trigger); window.removeEventListener(GOOGLE_SYNC_REQUESTED, trigger); };
  }, [run]);
}
