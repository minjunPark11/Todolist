import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pushUndo } from "../lib/undoStack";
import { platform } from "../platform";
import { isSupabaseConfigured, supabase } from "../services/supabaseClient";
import type {
  CheckItem,
  TaskContentMode,
  AppSettings,
  ExternalCalendar,
  FocusMode,
  FocusSegment,
  FocusSession,
  Folder,
  Language,
  List,
  ListSection,
  PlannerData,
  PlannerSettings,
  Project,
  ProjectType,
  RawPlannerData,
  Reminder,
  RepeatType,
  TaskTemplate,
  SavedFilter,
  SidebarFolder,
  Space,
  Subtask,
  Tag,
  Task,
  TaskDailyPlan,
  TaskTag,
  DailyPlanBucket,
  TaskDraft,
} from "../types";
import {
  readLegacyLocalSpaces,
} from "../lib/spaces/legacyLocalSpaces";
import * as hierarchy from "../domain/spaces/hierarchy";
import * as lifecycle from "../domain/spaces/lifecycle";
import * as spaceTree from "../domain/spaces/spaces";
import { sanitizeFolder, sanitizeList } from "../domain/spaces/hierarchy";
import {
  applyBucketOverrides,
  planTaskForDate,
  prunePlansBefore,
  sanitizeDailyPlan,
} from "../domain/today/dailyPlan";
import { adoptStoredLegacyBucketOverrides } from "../domain/today/legacyBucketOverrides";
import { backfillTaskTags, linkTaskTags, sanitizeTag, sanitizeTaskTag } from "../domain/tags/tags";
import { toggleTaskTag as toggleTagOnTask } from "../domain/tags/tagPicker";
import { sanitizeListSection } from "../domain/tasks/sections";
import { duplicateTaskPlan, type DuplicatePlan } from "../domain/tasks/duplicate";
import {
  buildFromTemplate,
  sanitizeTaskTemplate,
  templateFromTask,
  type TemplateTarget,
} from "../domain/tasks/templates";
import { clampHoursAtATime, HOURS_AT_A_TIME } from "../utils/calendarTime";
import { focusSessionMinutes, sanitizeFocusDefaultLength } from "../domain/focus/sessionLength";
import { DEFAULT_BACKUP_KEEP, sanitizeBackupInterval, sanitizeBackupKeep } from "../domain/backup/schedule";
import {
  migrateReminders,
  planReminderRows,
  pruneOrphanReminders,
  remindersForTask,
  sanitizeReminder,
  specOf,
} from "../domain/schedule";
import {
  checkItemsForTask,
  pruneOrphanCheckItems,
  removeCheckItemsForTask,
  sanitizeCheckItem,
  sortKeyForMovedCheckItem,
  sortKeyForNewCheckItem,
  toggleCheckItemPatch,
} from "../domain/tasks/checkItems";
import {
  checkItemDraftsFromText,
  checkItemsFromDrafts,
  descriptionFromCheckItems,
} from "../domain/tasks/contentMode";
import { ORDER_STEP } from "../domain/tasks/sortKey";
import { migrateLegacyWorkflowStatus } from "../domain/migrations/legacyWorkflowStatus";
import { addSidebarFolder, sanitizeSidebarFolder } from "../domain/tasks/sidebarFolders";
import { sanitizeSavedFilter } from "../domain/tasks/filters";
import { backfillTaskListId, defaultListIdFor } from "../domain/spaces/membership";
import { childDraft, promoteDraft } from "../domain/tasks/children";
import { canAddChild } from "../domain/tasks/hierarchy";
import { listMovePlan } from "../domain/tasks/listPicker";
import { LIFECYCLE, isCompleted, isTaskOpen } from "../domain/tasks/taskState";
import { countPlannerDataItems } from "../domain/migrations/plannerDataMigration";
import { persistPlannerData, PLANNER_STORAGE_KEY } from "../domain/migrations/persistPlannerData";
import { recoverStaleFocusSessions } from "../domain/focus/selectors";
import {
  buildSyncPlan,
  collectionTables,
  isEmptySyncPlan,
  optionalRemoteTables,
} from "../domain/sync/buildSyncPlan";
import { buildMigrationUpload } from "../domain/sync/buildMigrationUpload";
import { createSaveQueue, type SaveQueue } from "../domain/sync/saveQueue";
import { reapplyLocalEdits } from "../domain/sync/reapplyLocalEdits";
import { addDays, addMonths, todayValue } from "../utils/date";
import { planRecurringCompletion } from "../utils/planner";
import {
  planScheduleUpdate,
  scheduleFromTask,
  scheduleToTaskPatch,
  type Schedule,
  type ScheduleIssue,
} from "../domain/schedule";
// The normalizers moved out of this file (domain/plannerData/normalize): a
// server reads the same account now and has to apply the same gate, which it
// cannot do through a React hook.
import {
  createId,
  detectTimezone,
  emptyData,
  normalizeAppSettings,
  normalizeData,
  normalizeSettings,
  normalizeTask,
} from "../domain/plannerData/normalize";

const STORAGE_KEY = PLANNER_STORAGE_KEY;
const LEGACY_STORAGE_KEY = "todo-planner-data";
// Backoff for a failed local write. Slower than the network retry: a full
// quota does not clear on its own the way a dropped connection does.
const LOCAL_SAVE_RETRY_MS = 5000;
const LOCAL_SAVE_RETRY_MAX_MS = 120000;
function isMissingRemoteTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    record.code === "PGRST205" ||
    message.includes("could not find the table") ||
    (message.includes("schema cache") && message.includes("table"))
  );
}


// Any data crossing into the app from outside this running instance goes
// through here, so a timer left running when the app closed can't keep
// accruing wall-clock time (see recoverStaleFocusSessions).
function adoptLoadedData(data: PlannerData): PlannerData {
  const now = new Date().toISOString();
  const focusSessions = recoverStaleFocusSessions(data.focusSessions);
  const legacyAdopted = adoptLegacyLocalSpaces(data.projects);
  // STEP 5 (§40 M2/M4): one Space, and every Project filed under it. This is
  // the whole Space migration's write budget — Projects number in the tens,
  // and nothing beneath them is touched, which is the property that made this
  // model cheaper than demoting Project to a Folder (§8, H-INV-05).
  const spaces = spaceTree.ensureDefaultSpace(data.spaces, legacyAdopted, now);
  const projects = spaceTree.backfillProjectSpace(legacyAdopted);
  // P4 (M3): every Project gets a default List so an Item always has somewhere
  // to be. Tasks and goals are not rewritten, because while a Project has one
  // List their membership is already answered by projectId
  // (domain/spaces/membership).
  const withDefaults = hierarchy.ensureDefaultLists(
    projects.filter((project) => !project.archivedAt).map((project) => project.id),
    data.lists,
    now,
    defaultListIdFor,
  );
  // TickTick plan Migration Phase 2 (§6.69): the account gets its Inbox, the
  // one List belonging to no Project. Phase 3 (§6.70) then writes down which
  // List owns each Task, so `listIdFor`'s derivation stops being the answer
  // and becomes a fallback for records neither phase has reached.
  const lists = hierarchy.ensureInboxList(withDefaults, now);
  const listed = backfillTaskListId(data.tasks, lists, now);
  // Ch. 26 §26.3.4: `doing` and `waiting` were workflow wearing a lifecycle
  // field's clothes. They become real Sections here, in the Lists that
  // actually have them — after the List backfill above, because a Section
  // hangs off a List and this needs to know which one.
  const workflow = migrateLegacyWorkflowStatus(listed, lists, data.listSections, now);
  const tasks = workflow.tasks;
  // §6.18. The plan made on another device arrives with the account; the blob
  // this replaces arrives from this one. Days already past are dropped — no
  // screen reads them, and a table that only grows would carry decisions
  // nobody can act on any more.
  const dailyPlans = prunePlansBefore(adoptStoredLegacyBucketOverrides(data.dailyPlans, now), todayValue());
  // §6.45: the tags the tasks already carry as strings, written down as
  // records. Nothing rewrites a Task — the strings stay where every current
  // reader expects them, so this adds rows without putting the task table on
  // the wire.
  const tagged = backfillTaskTags(data.tasks, data.tags, data.taskTags, now);
  // §6.3: the reminder each Task carries as a preset, written down as a row.
  // Same shape as the tag backfill above and for the same reason — nothing
  // rewrites a Task, so this adds rows without putting the task table on the
  // wire, and a Task that already has rows is left alone because its preset is
  // the stale copy rather than the truth.
  const migratedReminders = migrateReminders(data.tasks, data.reminders, () => createId("reminder"), now);
  const reminders =
    migratedReminders.length > 0 ? [...data.reminders, ...migratedReminders] : data.reminders;
  if (
    workflow.listSections === data.listSections &&
    focusSessions === data.focusSessions &&
    projects === data.projects &&
    spaces === data.spaces &&
    lists === data.lists &&
    tasks === data.tasks &&
    dailyPlans === data.dailyPlans &&
    tagged.tags === data.tags &&
    tagged.taskTags === data.taskTags &&
    reminders === data.reminders
  ) {
    return data;
  }
  return {
    ...data,
    listSections: workflow.listSections,
    focusSessions,
    projects,
    spaces,
    lists,
    tasks,
    dailyPlans,
    tags: tagged.tags,
    taskTags: tagged.taskTags,
    reminders,
  };
}
// Phase S4 migration, and the same shape as the one below it: custom spaces
// written before Spaces read Projects sat in a device-local blob. Merged by
// id so a repeated read (StrictMode, or a failed marker write) adds nothing
// twice, and an already-synced copy is never overwritten by the stale one.
function adoptLegacyLocalSpaces(current: Project[]): Project[] {
  const legacy = readLegacyLocalSpaces();
  if (legacy.length === 0) return current;
  const seen = new Set(current.map((project) => project.id));
  const added = legacy.filter((project) => !seen.has(project.id));
  if (added.length === 0) return current;
  return [...current, ...added];
}

function readStorage(): PlannerData {
  const raw = platform.storage.getSync(STORAGE_KEY);

  if (raw) {
    try {
      return adoptLoadedData(normalizeData(JSON.parse(raw) as Partial<PlannerData>));
    } catch {
      return emptyData();
    }
  }

  // One-time migration from the legacy storage key (statuses remapped on normalize).
  const legacy = platform.storage.getSync(LEGACY_STORAGE_KEY);
  if (legacy) {
    try {
      return adoptLoadedData(normalizeData(JSON.parse(legacy) as Partial<PlannerData>));
    } catch {
      return emptyData();
    }
  }

  // First run, no saved data anywhere: start completely blank. Demo content
  // is opt-in only, via the "Load Samples" button in Settings.
  //
  // Still goes through adoptLoadedData: the legacy blobs are separate keys, so
  // "no planner data" does not mean "nothing to migrate". Returning emptyData()
  // raw skipped the drain while the marker was set anyway, which lost the
  // records rather than merely postponing them.
  return adoptLoadedData(emptyData());
}

export function usePlannerData() {
  const [data, setDataState] = useState<PlannerData>(() => readStorage());
  // The latest state, readable from an async callback that closed over an
  // older render. The remote load needs it to tell what the user changed
  // while it was in flight (domain/sync/reapplyLocalEdits).
  const dataRef = useRef(data);
  dataRef.current = data;
  // Bumped whenever a system path replaces the store wholesale — a remote load
  // adopting the account's records, a migration. User edits do not bump it:
  // they are what undo exists to walk back.
  const storeRevisionRef = useRef(0);
  // Every user-facing mutation goes through this wrapper so Ctrl+Z can walk
  // edits back; system paths (remote load, migration) use setDataState so
  // they never land on the undo stack.
  function setData(updater: PlannerData | ((current: PlannerData) => PlannerData)) {
    setDataState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next !== current) {
        // Which store this snapshot belongs to (§16.19, §16.21). An undo entry
        // holds a WHOLE PlannerData, so it is only an undo while the store is
        // still the one it was taken from. Once a load or a migration has
        // replaced the store, restoring it would not walk one edit back — it
        // would drop everything the load brought in, and the save that
        // followed would read those absent records as deletions and take them
        // off the account too.
        const revision = storeRevisionRef.current;
        pushUndo(() => {
          if (storeRevisionRef.current !== revision) return false;
          setDataState(current);
        });
      }
      return next;
    });
  }
  const [userEmail, setUserEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState(
    isSupabaseConfigured ? "sync.ready" : "sync.localMode",
  );
  const [syncError, setSyncError] = useState("");
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [localMigrationData, setLocalMigrationData] = useState<PlannerData | null>(null);
  // True after the user opens a password-reset link (Supabase PASSWORD_RECOVERY);
  // the UI then shows a "set a new password" form instead of the normal app.
  const [recoveryMode, setRecoveryMode] = useState(false);
  const syncTimerRef = useRef<number | null>(null);
  const missingRemoteTablesRef = useRef<Set<string>>(new Set());
  /** Which load is the current one, so an older answer cannot win (§16.34). */
  const loadTicketRef = useRef(0);
  // Last state we know the account holds; the save diffs against it so an edit
  // uploads the records it touched instead of every row in every table.
  const syncedSnapshotRef = useRef<PlannerData | null>(null);
  // Which account the writes below belong to, readable from callbacks that were
  // created before the current render (§16.34's account-switch race).
  const userEmailRef = useRef(userEmail);
  userEmailRef.current = userEmail;
  // One save at a time, newest state last, retried when the network refuses.
  // Created once: everything it reads is a ref or a hoisted declaration, so it
  // never needs rebuilding for a later render.
  const saveQueueRef = useRef<SaveQueue<SaveRequest> | null>(null);
  if (!saveQueueRef.current) {
    saveQueueRef.current = createSaveQueue<SaveRequest>({
      perform: ({ data: nextData, ownerEmail }) => performSave(nextData, ownerEmail),
      onSettled: ({ ok, error, willRetry }) => {
        if (ok) {
          setSyncError("");
          setSyncStatus("sync.synced");
          return;
        }
        console.error("[Supabase] save failed:", error);
        setSyncError(error instanceof Error ? error.message : "Could not save Supabase data.");
        // A queued retry is a different state from a save that gave up: the
        // edit is still going to be uploaded, and saying "failed" would push
        // the user toward re-entering work that is not lost.
        setSyncStatus(willRetry ? "sync.retrying" : "sync.syncFailed");
      },
      scheduleRetry: (run, delayMs) => {
        window.setTimeout(run, delayMs);
      },
    });
  }
  const saveQueue = saveQueueRef.current;

  // The local snapshot could not be written and the app is running on memory
  // alone. Held as state because the UI has to say so until it clears.
  const [storageError, setStorageError] = useState(false);
  const localSaveRetryRef = useRef<number | null>(null);
  const localSaveDelayRef = useRef(LOCAL_SAVE_RETRY_MS);

  // Writing the snapshot to local storage is the one save this app cannot do
  // without: the account is optional, local storage is not. It fails for real
  // reasons — the quota is full, the browser is in a mode that refuses to
  // store, an extension blocked it — and it used to fail by throwing out of
  // this effect, which takes the render down with it.
  //
  // Spec §9.45 and §16.38 say what to do instead, and both halves matter:
  //
  //   The draft is never rolled back. What the user typed stays in memory and
  //   on screen; the only thing that failed is the copy on disk, and quietly
  //   replacing their text with the last version that WAS written would lose
  //   the edit to hide the error.
  //
  //   The failure is never hidden. It has to stay visible while it lasts
  //   (§16.93 — not a toast that expires), because the user is the only one
  //   who can act on it, and "saved locally" is what every other status in
  //   this app promises.
  //
  // Retry uses the LATEST state and not the payload that failed (§16.39): by
  // the time a retry runs the user has usually typed more, and re-writing the
  // snapshot they had two minutes ago would undo it.
  useEffect(() => {
    // This run supersedes any scheduled retry — it carries newer data.
    if (localSaveRetryRef.current !== null) {
      window.clearTimeout(localSaveRetryRef.current);
      localSaveRetryRef.current = null;
    }

    function attempt() {
      try {
        persistPlannerData(dataRef.current);
        setStorageError(false);
        localSaveDelayRef.current = LOCAL_SAVE_RETRY_MS;
      } catch (error) {
        console.error("[storage] local save failed:", error);
        setStorageError(true);
        // Backoff, because the usual cause (a full quota) does not clear in a
        // second, and a tight retry loop would spend the main thread on
        // re-serializing the whole store into a write that keeps failing.
        const delay = localSaveDelayRef.current;
        localSaveDelayRef.current = Math.min(delay * 2, LOCAL_SAVE_RETRY_MAX_MS);
        localSaveRetryRef.current = window.setTimeout(attempt, delay);
      }
    }

    attempt();

    return () => {
      if (localSaveRetryRef.current !== null) {
        window.clearTimeout(localSaveRetryRef.current);
        localSaveRetryRef.current = null;
      }
    };
  }, [data]);

  /** Try the local write again now — what the banner's Retry button calls. */
  const retryLocalSave = useCallback(() => {
    // The user asked for it now; a timer waiting to do the same thing later is
    // just a duplicate write.
    if (localSaveRetryRef.current !== null) {
      window.clearTimeout(localSaveRetryRef.current);
      localSaveRetryRef.current = null;
    }
    localSaveDelayRef.current = LOCAL_SAVE_RETRY_MS;
    try {
      persistPlannerData(dataRef.current);
      setStorageError(false);
    } catch (error) {
      console.error("[storage] local save retry failed:", error);
      setStorageError(true);
      // Hand it back to the automatic retry rather than leaving the only
      // remaining attempt behind a button the user has to press again.
      const delay = localSaveDelayRef.current;
      localSaveDelayRef.current = Math.min(delay * 2, LOCAL_SAVE_RETRY_MAX_MS);
      localSaveRetryRef.current = window.setTimeout(() => retryLocalSaveRef.current(), delay);
    }
  }, []);
  // The retry reschedules itself, and a `useCallback` cannot name itself in
  // its own body. The ref is written on every render so the timer always calls
  // the current one.
  const retryLocalSaveRef = useRef(retryLocalSave);
  retryLocalSaveRef.current = retryLocalSave;

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data: sessionData }) => {
      if (!isMounted) {
        return;
      }
      const user = sessionData.session?.user;
      setUserEmail(user?.email ?? "");
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUserEmail(session?.user.email ?? "");
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !userEmail) {
      setRemoteLoaded(false);
      // Signed out, or switching accounts: the old baseline describes someone
      // else's rows, so the next sign-in must start from a fresh load, and
      // anything still queued was meant for the account we just left.
      syncedSnapshotRef.current = null;
      saveQueue.reset();
      return;
    }

    const localSnapshot = readStorage();
    if (countPlannerDataItems(localSnapshot) > 0) {
      setLocalMigrationData(localSnapshot);
    }

    loadSupabaseData();
  }, [userEmail]);

  useEffect(() => {
    if (!supabase || !userEmail || !remoteLoaded) {
      return;
    }

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      // The queue owns ordering and retry; the debounce only decides when the
      // user has stopped typing.
      saveQueue.request({ data, ownerEmail: userEmail });
    }, 700);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [data, remoteLoaded, userEmail]);

  /**
   * Keep `appSettings.timezone` honest.
   *
   * Runs after the remote load too, since that replaces appSettings with
   * whatever the account holds — which may have been written by a device in
   * another zone, or by a client that predates the field.
   *
   * Writes only on a real difference, so the usual case costs nothing: no
   * state update, no save, no sync.
   */
  useEffect(() => {
    const detected = detectTimezone();
    if (!detected || detected === data.appSettings.timezone) return;
    updateAppSettings({ timezone: detected });
  }, [data.appSettings.timezone, remoteLoaded]);

  async function getUserId() {
    if (!supabase) {
      return "";
    }

    const { data: userData, error } = await supabase.auth.getUser();
    if (error) {
      throw error;
    }

    return userData.user?.id ?? "";
  }

  async function loadSupabaseData() {
    if (!supabase) {
      return;
    }

    // §16.34's "stale response ignore". Two loads can be in flight at once —
    // a retry, a re-auth, a tab coming back — and the network does not promise
    // they finish in order. Without this the OLDER answer can land last and
    // replace the account's state with what it looked like a moment ago, which
    // is a data-loss bug that only shows up on a slow connection.
    const ticket = (loadTicketRef.current += 1);
    const isStale = () => loadTicketRef.current !== ticket;

    setSyncStatus("sync.syncing");
    setSyncError("");

    // What the store held when this load began. Anything that differs from it
    // when the load resolves is an edit the user made in between, and a load
    // that replaced the store wholesale would throw it away (§24.24).
    const localAtStart = dataRef.current;

    try {
      const partial: Partial<PlannerData> = {};
      missingRemoteTablesRef.current = new Set();

      for (const [key, table] of collectionTables) {
        const { data: rows, error } = await supabase.from(table).select("data");
        if (error) {
          if (optionalRemoteTables.has(table) && isMissingRemoteTableError(error)) {
            missingRemoteTablesRef.current.add(table);
            partial[key] = localAtStart[key] as never;
            continue;
          }
          // Required tables should still fail loudly with the table name so a
          // broken base Supabase setup is obvious.
          throw new Error(`Failed to load '${table}' table: ${error.message}`);
        }

        const remote = (rows ?? []).map((row: { data: unknown }) => row.data);
        // An OPTIONAL table that answers with nothing is one the project has
        // only just been given. Until the migration ran, the branch above kept
        // this collection on the device; the moment the table exists and is
        // empty, taking its answer literally would replace those records with
        // nothing — and the local snapshot is written back straight after, so
        // they would be gone from the device too.
        //
        // The same fallback `appSettings` takes twenty lines below, for the
        // same reason and with the same trade: an empty account collection is
        // read as "never synced" rather than as "emptied elsewhere", so a
        // collection cleared on another device can be resurrected by this one.
        // It costs a visible, undoable resurrection to avoid a silent loss,
        // and it can only happen while the collection is entirely empty on the
        // account — one row on either side and this never fires again.
        const keepLocal =
          remote.length === 0 &&
          optionalRemoteTables.has(table) &&
          (localAtStart[key] as unknown[]).length > 0;
        partial[key] = (keepLocal ? localAtStart[key] : remote) as never;
      }

      const { data: settingsRows, error: settingsError } = await supabase
        .from("settings")
        .select("data")
        .eq("id", "settings")
        .maybeSingle();
      if (settingsError) {
        throw new Error(`Failed to load 'settings' table: ${settingsError.message}`);
      }

      partial.settings = normalizeSettings(settingsRows?.data as Partial<PlannerSettings> | undefined);

      const { data: appSettingsRow, error: appSettingsError } = await supabase
        .from("settings")
        .select("data")
        .eq("id", "app_settings")
        .maybeSingle();
      if (appSettingsError) {
        throw new Error(`Failed to load 'app_settings' row: ${appSettingsError.message}`);
      }
      const appState = appSettingsRow?.data as
        | { appSettings?: Partial<AppSettings>; activeSessionId?: unknown }
        | undefined;
      // Fall back to the current local values when no remote row exists yet, so
      // an existing device's preferences aren't wiped on first sync after this
      // change; the next save pushes them to the account.
      partial.appSettings = appState?.appSettings ? normalizeAppSettings(appState.appSettings) : data.appSettings;
      partial.activeSessionId = appState
        ? typeof appState.activeSessionId === "string"
          ? appState.activeSessionId
          : ""
        : data.activeSessionId;

      const loaded = adoptLoadedData(normalizeData(partial));
      // A newer load has started since this one began; its answer is the one
      // that should win, and this one has nothing to add.
      if (isStale()) return;
      // The store is now the account's, not the one every queued undo entry
      // was taken from; those entries decline rather than restore (see setData).
      storeRevisionRef.current += 1;
      setDataState(reapplyLocalEdits(loaded, localAtStart, dataRef.current));
      // The baseline is what the ACCOUNT holds, which is `loaded` and not the
      // merged state: the difference between the two is exactly the edits put
      // back above, so the next save pushes those and only those.
      syncedSnapshotRef.current = loaded;
      setRemoteLoaded(true);
      setSyncStatus("sync.synced");
      // "A device connected and agreed with the account at this moment."
      // Deliberately not merged into the save path's stamp: this is the half
      // that keeps a quiet week from reading as an offline week (see
      // sync_state above). Fire-and-forget — the load has already succeeded
      // and its result is on screen.
      void stampLastSeen();
    } catch (error) {
      // A failure from a superseded load is not this load's failure to report:
      // showing it would put an error on screen while a good load is running.
      if (isStale()) return;
      const message = error instanceof Error ? error.message : "Could not load Supabase data.";
      console.error("[Supabase] load failed:", error);
      setRemoteLoaded(false);
      setSyncError(message);
      setSyncStatus("sync.loadFailed");
    }
  }

  /**
   * Records that a device reached the account and agreed with it.
   *
   * Half of the `sync_state` row (see performSave, where the other half is
   * written). Kept separate from the save path because it answers a different
   * question: the save stamp says when the account last CHANGED, and this one
   * says when a device last CHECKED — a week with no edits moves this and not
   * that, which is the difference between a quiet week and an offline one.
   *
   * Merges rather than replaces, so it never clears `lastSyncedAt`. Any
   * failure is dropped: the load it follows has already succeeded, and this
   * going missing only makes the account look staler than it is.
   */
  async function stampLastSeen() {
    if (!supabase) return;
    try {
      const userId = await getUserId();
      if (!userId) return;
      const { data: existing } = await supabase
        .from("settings")
        .select("data")
        .eq("id", "sync_state")
        .maybeSingle();
      const previous = (existing?.data ?? {}) as Record<string, unknown>;
      await supabase.from("settings").upsert(
        {
          id: "sync_state",
          user_id: userId,
          data: { ...previous, lastSeenAt: new Date().toISOString(), platform: platform.kind },
        },
        { onConflict: "id,user_id" },
      );
    } catch (error) {
      console.warn("sync_state의 lastSeenAt을 기록하지 못했습니다.", error);
    }
  }

  /** One request the save queue can run: a whole state, and whose account it is. */
  type SaveRequest = { data: PlannerData; ownerEmail: string };

  // Performs ONE save. It throws on failure rather than reporting it, because
  // the queue decides what a failure means — retry, or drop because the account
  // has changed — and a swallowed error is indistinguishable from a save that
  // worked. Ordering, coalescing and retry all live in createSaveQueue.
  async function performSave(nextData: PlannerData, ownerEmail: string) {
    if (!supabase) {
      return;
    }

    // This state was captured for an account we are no longer signed into.
    if (ownerEmail !== userEmailRef.current) {
      return;
    }

    // What to write is decided by a pure function (see buildSyncPlan) against
    // the last state known to be on the account — set from the load, advanced
    // only after a fully successful save.
    const plan = buildSyncPlan(nextData, syncedSnapshotRef.current, missingRemoteTablesRef.current);
    if (isEmptySyncPlan(plan)) {
      // The edit touched nothing that syncs; don't spend a round trip.
      syncedSnapshotRef.current = nextData;
      return;
    }

    const userId = await getUserId();
    if (!userId) {
      return;
    }
    // getUserId answers for whoever is signed in NOW. Signing out and back in
    // as someone else during that round trip used to write the previous
    // account's rows under the new account's user_id.
    if (ownerEmail !== userEmailRef.current) {
      return;
    }

    for (const operation of plan.tables) {
      if (operation.upsert.length > 0) {
        const rows = operation.upsert.map((item) => ({ id: item.id, user_id: userId, data: item }));
        const { error } = await supabase
          .from(operation.table)
          .upsert(rows, { onConflict: "id,user_id" });
        if (error) {
          if (optionalRemoteTables.has(operation.table) && isMissingRemoteTableError(error)) {
            missingRemoteTablesRef.current.add(operation.table);
            continue;
          }
          throw error;
        }
      }

      if (operation.removeIds.length > 0) {
        const { error: deleteError } = await supabase
          .from(operation.table)
          .delete()
          .eq("user_id", userId)
          .in("id", operation.removeIds);
        if (deleteError) {
          if (optionalRemoteTables.has(operation.table) && isMissingRemoteTableError(deleteError)) {
            missingRemoteTablesRef.current.add(operation.table);
            continue;
          }
          throw deleteError;
        }
      }
    }

    if (plan.settings) {
      const { error: settingsError } = await supabase.from("settings").upsert(
        { id: "settings", user_id: userId, data: plan.settings },
        { onConflict: "id,user_id" },
      );
      if (settingsError) {
        throw settingsError;
      }
    }

    // Device-level preferences (theme accent, language, font size, view
    // prefs, active focus session, recent items) are synced too, so a single
    // account looks and behaves the same on app and web.
    if (plan.appState) {
      const { error: appSettingsError } = await supabase.from("settings").upsert(
        { id: "app_settings", user_id: userId, data: plan.appState },
        { onConflict: "id,user_id" },
      );
      if (appSettingsError) {
        throw appSettingsError;
      }
    }

    /**
     * When this account was last written to, and by what.
     *
     * A third row in `settings` beside "settings" and "app_settings", written
     * only after every table above succeeded — so it says "the account is
     * caught up as of this moment", not "a save was attempted".
     *
     * Two stamps, because one cannot answer the question on its own.
     * `lastSyncedAt` moves when something is written; a user who changes
     * nothing for a week leaves it a week old while the account is in fact
     * current. `lastSeenAt` (written after a successful load, below) moves
     * whenever a device connects and reconciles, which is what separates
     * "nothing happened" from "this device has been offline".
     *
     * Whose question this answers: this app is local-first, and the account is
     * a mirror that only runs while signed in. Anything reading the account
     * without the device present cannot otherwise tell whether it is looking
     * at today's data or at a snapshot from a week ago
     * (FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md M4, §11.2).
     *
     * A failure here is swallowed on purpose. The user's data is already
     * safely written at this point, and metadata must never be the reason a
     * save reports failure and retries. The cost of losing it is that the
     * stamp reads older than it is, which errs toward "this may be stale" —
     * the safe direction for anything acting on it.
     */
    const now = new Date().toISOString();
    const { error: syncStateError } = await supabase.from("settings").upsert(
      {
        id: "sync_state",
        user_id: userId,
        data: {
          lastSyncedAt: now,
          lastSeenAt: now,
          platform: platform.kind,
        },
      },
      { onConflict: "id,user_id" },
    );
    if (syncStateError) {
      console.warn("sync_state를 기록하지 못했습니다 (데이터 동기화 자체는 성공).", syncStateError);
    }

    // The account may have changed while the writes were in flight; the
    // baseline describes one account's rows and must not be set from another.
    if (ownerEmail !== userEmailRef.current) {
      return;
    }
    // Only advance the baseline once everything above succeeded; a failed
    // save must stay "not yet uploaded" so the retry resends it.
    syncedSnapshotRef.current = nextData;
  }

  async function signIn(email: string, password: string) {
    if (!supabase) {
      setSyncError("Supabase environment variables are not configured.");
      return false;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSyncError(error.message);
      return false;
    }
    setSyncError("");
    return true;
  }

  async function signUp(email: string, password: string) {
    if (!supabase) {
      setSyncError("Supabase environment variables are not configured.");
      return { ok: false, needsEmailConfirmation: false };
    }

    const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setSyncError(error.message);
      return { ok: false, needsEmailConfirmation: false };
    }
    const needsEmailConfirmation = !signUpData.session;
    setSyncError("");
    setSyncStatus(needsEmailConfirmation ? "sync.verificationSent" : "sync.accountCreated");
    return { ok: true, needsEmailConfirmation };
  }

  async function signOut() {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    setUserEmail("");
    setRemoteLoaded(false);
    setSyncStatus("sync.signedOut");
  }

  // Sends a password-reset email. The link brings the user back to the app with
  // a recovery session (PASSWORD_RECOVERY event), where updatePassword finishes.
  async function resetPassword(email: string) {
    if (!supabase) {
      setSyncError("Supabase environment variables are not configured.");
      return false;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    if (error) {
      setSyncError(error.message);
      return false;
    }
    setSyncError("");
    return true;
  }

  async function updatePassword(newPassword: string) {
    if (!supabase) {
      setSyncError("Supabase environment variables are not configured.");
      return false;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setSyncError(error.message);
      return false;
    }
    setSyncError("");
    setRecoveryMode(false);
    return true;
  }

  async function uploadLocalDataToSupabase() {
    if (!localMigrationData) {
      return false;
    }

    // Merge, never replace — see buildMigrationUpload. Saving the local state
    // directly diffed to "delete every record the account holds and this device
    // does not", which is not what a button labelled "upload" may do.
    const merged = buildMigrationUpload(localMigrationData, syncedSnapshotRef.current ?? data);
    storeRevisionRef.current += 1;
    setDataState(merged);
    saveQueue.request({ data: merged, ownerEmail: userEmailRef.current });
    setLocalMigrationData(null);
    setRemoteLoaded(true);
    return true;
  }

  function addTask(draft: TaskDraft): string {
    const now = new Date().toISOString();
    const title = draft.title.trim();
    if (!title) {
      return "";
    }

    const task = normalizeTask({
      ...(draft as Partial<Task>),
      id: createId("task"),
      title,
      status: draft.status ?? "todo",
      createdAt: now,
      updatedAt: now,
    });

    setData((current) => {
      // §26.9: the relation is the canonical answer, so it is written HERE
      // rather than waiting for the next load's backfill to notice the
      // strings. `task.tags` is still written beside it — an older client
      // reads nothing else — but nothing looks there first any more.
      const tagged = linkTaskTags(task.id, task.tags, current.tags, current.taskTags, now);
      return {
        ...current,
        tasks: [task, ...current.tasks],
        tags: tagged.tags,
        taskTags: tagged.taskTags,
      };
    });
    return task.id;
  }

  // Spec §0.1.1 alias: capture goes to Inbox by default unless context overrides.
  function createTask(draft: TaskDraft, context?: Partial<TaskDraft>): string {
    // The default was `inbox`, which mirrored "this Task is unfiled" into the
    // lifecycle field. Which List a Task is in answers that (Ch. 26 §26.3.4),
    // so a new Task is simply open.
    return addTask({ status: LIFECYCLE.open, ...context, ...draft });
  }


  function updateTask(taskId: string, patch: Partial<Task>) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const nextStatus = patch.status ?? task.status;
        const statusChanged = nextStatus !== task.status;

        return {
          ...task,
          ...patch,
          status: nextStatus,
          completedAt:
            nextStatus === "done"
              ? task.completedAt || now
              : statusChanged
                ? ""
                : (patch.completedAt ?? task.completedAt),
          archivedAt:
            nextStatus === "archived"
              ? task.archivedAt || now
              : statusChanged
                ? ""
                : task.archivedAt,
          updatedAt: now,
        };
      }),
    }));
  }

  /**
   * The canonical way to change a Task's dates (design §13, audit §7 Phase 4).
   *
   * Callers pass the schedule they want rather than the fields to set, and get
   * back whatever was wrong with it. `planScheduleUpdate` owns the three rules
   * every schedule write needs — normalize, validate, skip a no-op — so that a
   * new writer cannot arrive without them by simply calling `updateTask`.
   *
   * Returns the issues rather than throwing: an editor wants to show them
   * beside the field that caused them, and a drag handler wants to ignore
   * them and leave the task where it was.
   */
  function updateTaskSchedule(taskId: string, next: Schedule): ScheduleIssue[] {
    const task = data.tasks.find((entry) => entry.id === taskId);
    if (!task) return [];
    const plan = planScheduleUpdate(reminderSourceFor(task, data.reminders), next);
    if (!plan.patch) return plan.issues;

    updateTask(taskId, plan.patch);

    // §6.50: the reminder rows land in the same edit as the schedule that
    // decides them. `planReminderRows` writes only the difference, so a
    // reminder that survives keeps its id — and with it the `reminderKey` that
    // stops an already-fired reminder from ringing a second time.
    if (plan.reminders) {
      const now = new Date().toISOString();
      setData((current) => {
        const rows = planReminderRows(
          taskId,
          plan.reminders ?? [],
          current.reminders,
          () => createId("reminder"),
          now,
        );
        if (rows.added.length === 0 && rows.removed.length === 0) return current;
        const dropped = new Set(rows.removed);
        return {
          ...current,
          reminders: [...current.reminders.filter((row) => !dropped.has(row.id)), ...rows.added],
        };
      });
    }
    return plan.issues;
  }

  /**
   * A Task as the schedule domain wants to read it: its own fields, plus the
   * reminder rows that are no longer on it (§6.3).
   *
   * The adapter takes a Task and nothing else, so whoever holds the rows has
   * to bring them. That is the price of moving reminders out of the record,
   * and it is the same price `checkItemsFor` already pays.
   */
  function reminderSourceFor(task: Task, rows: readonly Reminder[]) {
    return { ...task, reminders: remindersForTask(task.id, rows).map(specOf) };
  }

  function deleteTask(taskId: string) {
    setData((current) => ({
      ...current,
      // Children of a deleted parent are promoted to top-level instead of
      // being orphaned or cascade-deleted (their work is still real).
      tasks: current.tasks
        .filter((task) => task.id !== taskId)
        .map((task) => (task.parentTaskId === taskId ? { ...task, parentTaskId: "" } : task)),
      subtasks: current.subtasks.filter((subtask) => subtask.taskId !== taskId),
      // Checklist lines go with the Task. Unlike a child Task — which is real
      // work and gets promoted to top level above — a CheckItem has no
      // meaning apart from the Task it is a line of, so leaving it would be
      // leaving a row nothing can ever show.
      checkItems: removeCheckItemsForTask(taskId, current.checkItems),
      // Reminders go with the Task for the same reason the checklist does: a
      // reminder about a Task that no longer exists can never fire and can
      // never be found to be removed.
      reminders: current.reminders.filter((row) => row.taskId !== taskId),
    }));
  }

  /**
   * Gives up on a Task (D-20/D-23).
   *
   * This used to archive: overwrite `status`, stash the old one in
   * `previousStatus`, and stamp `archivedAt`. It writes one field now, and
   * leaves `status` alone — so there is nothing to restore when the user
   * changes their mind, and a repeating Task keeps its rule.
   */
  function archiveTask(taskId: string) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              wontDoAt: now,
              updatedAt: now,
            }
          : task,
      ),
    }));
  }

  // Deletion is a hard removal, so undo re-inserts the rows the caller
  // captured beforehand. Targeted on purpose: restoring a whole-store snapshot
  // would also throw away anything the user changed while the toast was up.
  function restoreDeletedTask(task: Task, subtasks: Subtask[], childTaskIds: string[] = []) {
    setData((current) => ({
      ...current,
      tasks: (current.tasks.some((item) => item.id === task.id)
        ? current.tasks
        : [...current.tasks, task]
      ).map((item) =>
        // deleteTask promotes children to top level; put them back under the parent.
        childTaskIds.includes(item.id) ? { ...item, parentTaskId: task.id } : item,
      ),
      subtasks: [
        ...current.subtasks.filter((item) => item.taskId !== task.id),
        ...subtasks,
      ],
    }));
  }


  /**
   * Puts a given-up Task back on the list (D-20/D-23).
   *
   * Clears the marker and nothing else. The old version had to guess a status
   * out of `previousStatus` because archiving had overwritten the real one;
   * there is nothing to guess at now.
   */
  function restoreTask(taskId: string) {
    const now = new Date().toISOString();

    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              wontDoAt: "",
              archivedAt: "",
              updatedAt: now,
            }
          : task,
      ),
    }));
  }

  /**
   * §15.9's Duplicate, as one write (§15.18).
   *
   * The plan is computed before anything is stored, so a source that is no
   * longer there leaves the store untouched and there is no partial copy to
   * clean up (§15.57). What it produces is returned rather than just the id:
   * undoing a Duplicate means removing exactly the records it created, and
   * `deleteTask` cannot do that — it promotes a deleted parent's children to
   * the top level, which for a copied subtree would leave the copies behind
   * as loose root Tasks.
   */
  function duplicateTask(taskId: string): DuplicatePlan | null {
    const now = new Date().toISOString();
    const plan = duplicateTaskPlan(taskId, data, createId, now);
    if (!plan) return null;

    setData((current) => ({
      ...current,
      tasks: [...plan.tasks, ...current.tasks],
      subtasks: [...current.subtasks, ...plan.subtasks],
      checkItems: [...current.checkItems, ...plan.checkItems],
      taskTags: [...current.taskTags, ...plan.taskTags],
      reminders: [...current.reminders, ...plan.reminders],
    }));
    return plan;
  }

  /**
   * §25.8: save this Task's shape for later, and leave the Task alone.
   *
   * Named after the Task rather than through a dialog. A prompt asking for a
   * name is a second decision at the moment someone is trying to make one, and
   * the Task's own title is what they would type into it.
   *
   * Returns the template so the caller can offer to take it back — creating
   * one is not a change to any Task, so there is no patch to undo.
   */
  function saveTaskAsTemplate(taskId: string): TaskTemplate | null {
    const now = new Date().toISOString();
    const template = templateFromTask(taskId, data, createId("template"), now);
    if (!template) return null;
    setData((current) => ({ ...current, taskTemplates: [...current.taskTemplates, template] }));
    return template;
  }

  function deleteTaskTemplate(templateId: string) {
    setData((current) => ({
      ...current,
      taskTemplates: current.taskTemplates.filter((row) => row.id !== templateId),
    }));
  }

  /**
   * §25.8's other half: a Task made from a saved shape.
   *
   * `target` comes from the create resolver, so a template used in the Inbox
   * lands in the Inbox and one used in a List lands there — the template says
   * WHAT to make and the Scope says where, which is §12.16's division and not
   * a new one.
   *
   * Tags are linked by name through the same path Quick Add uses, so a
   * template naming a Tag that has since been deleted recreates it rather than
   * producing a Task with a tag nothing can find.
   */
  function createTaskFromTemplate(templateId: string, target: TemplateTarget): string {
    const template = data.taskTemplates.find((row) => row.id === templateId);
    if (!template) return "";

    const now = new Date().toISOString();
    const built = buildFromTemplate(template, target, createId, now);
    if (!built) return "";

    setData((current) => {
      let tags = current.tags;
      let taskTags = current.taskTags;
      for (const task of built.tasks) {
        const linked = linkTaskTags(task.id, task.tags, tags, taskTags, now);
        tags = linked.tags;
        taskTags = linked.taskTags;
      }
      return {
        ...current,
        tasks: [...built.tasks, ...current.tasks],
        checkItems: [...current.checkItems, ...built.checkItems],
        tags,
        taskTags,
      };
    });
    return built.rootId;
  }

  /**
   * Take a Duplicate back (§15.55, §15.57).
   *
   * By id and only by id: it removes what the plan created and nothing that
   * looks like it. The original — and anything the user has done since — is
   * not something this can reach.
   */
  function discardDuplicate(plan: DuplicatePlan) {
    const tasks = new Set(plan.tasks.map((task) => task.id));
    const subtasks = new Set(plan.subtasks.map((row) => row.id));
    const checkItems = new Set(plan.checkItems.map((item) => item.id));
    const taskTags = new Set(plan.taskTags.map((link) => link.id));
    const reminders = new Set(plan.reminders.map((row) => row.id));

    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => !tasks.has(task.id)),
      subtasks: current.subtasks.filter((row) => !subtasks.has(row.id)),
      checkItems: current.checkItems.filter((item) => !checkItems.has(item.id)),
      taskTags: current.taskTags.filter((link) => !taskTags.has(link.id)),
      reminders: current.reminders.filter((row) => !reminders.has(row.id)),
    }));
  }

  function toggleTaskDone(taskId: string) {
    const now = new Date().toISOString();
    const today = todayValue();

    setData((current) => {
      const target = current.tasks.find((task) => task.id === taskId);
      if (!target) return current;

      const isDone = isCompleted(target);
      const isRecurring = !isDone && target.repeatType !== "none";

      const setOnTarget = (patch: Partial<Task>) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === taskId ? { ...task, ...patch, updatedAt: now } : task,
        ),
      });

      if (!isRecurring) {
        return setOnTarget({
          status: isDone ? LIFECYCLE.open : LIFECYCLE.completed,
          completedAt: isDone ? "" : now,
        });
      }

      const rolled = planRecurringCompletion(target, createId("task"), now, today);
      if (rolled.kind === "final") {
        return setOnTarget({ status: LIFECYCLE.completed, completedAt: now });
      }

      return {
        ...current,
        tasks: [
          rolled.occurrence,
          ...current.tasks.map((task) =>
            task.id === taskId ? { ...task, ...rolled.patch, updatedAt: now } : task,
          ),
        ],
      };
    });
  }





  /**
   * A child is a Task now (domain/tasks/children.ts). The `subtasks`
   * collection is no longer written to — it is only read, so the rows already
   * there keep working until each is touched.
   */
  // === Checklist (spec §11) ===
  //
  // Every one of these goes through `setData`, so a tick, a rename or a
  // conversion is one entry on the undo stack — and one transaction, which is
  // what §11.14 requires of the conversion in particular.

  /** §11.22/§11.23: a line exists once it has text. Blank text writes nothing. */
  function addCheckItem(taskId: string, text: string) {
    const trimmed = text.trim();
    // §11.31: whitespace-only is empty, and an empty line is a line the user
    // is still typing rather than a record.
    if (!taskId || !trimmed) return;
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      checkItems: [
        ...current.checkItems,
        {
          id: createId("checkitem"),
          taskId,
          text: trimmed,
          checked: false,
          completedAt: "",
          sortKey: sortKeyForNewCheckItem(taskId, current.checkItems),
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
  }

  /**
   * Several lines at once, as one transaction (§11.34).
   *
   * A multi-line paste is one user action, so it is one undo — not one per
   * line, which would make Ctrl+Z walk back through a paste a line at a time.
   */
  function addCheckItems(taskId: string, texts: string[]) {
    const drafts = texts.map((text) => text.trim()).filter((text) => text !== "");
    if (!taskId || drafts.length === 0) return;
    const now = new Date().toISOString();
    setData((current) => {
      const base = sortKeyForNewCheckItem(taskId, current.checkItems);
      return {
        ...current,
        checkItems: [
          ...current.checkItems,
          ...drafts.map((text, index) => ({
            id: createId("checkitem"),
            taskId,
            text,
            checked: false,
            completedAt: "",
            sortKey: base + index * ORDER_STEP,
            createdAt: now,
            updatedAt: now,
          })),
        ],
      };
    });
  }

  /** §11.32: trimmed on commit, inner spacing left alone. */
  function updateCheckItemText(itemId: string, text: string) {
    const trimmed = text.trim();
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      checkItems: current.checkItems.map((item) =>
        item.id === itemId && item.text !== trimmed ? { ...item, text: trimmed, updatedAt: now } : item,
      ),
    }));
  }

  function toggleCheckItem(itemId: string) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      checkItems: current.checkItems.map((item) =>
        item.id === itemId ? { ...item, ...toggleCheckItemPatch(item, now) } : item,
      ),
    }));
  }

  function deleteCheckItem(itemId: string) {
    setData((current) => {
      const kept = current.checkItems.filter((item) => item.id !== itemId);
      // Nothing matched: return the same state so an undo entry is not pushed
      // for an action that did nothing.
      if (kept.length === current.checkItems.length) return current;
      return { ...current, checkItems: kept };
    });
  }

  /**
   * A line dropped at `targetIndex` among its Task's lines.
   *
   * A null key means the neighbours have no room between them, which is the
   * signal to renumber the Task's lines rather than write a tie — a tie is a
   * list that reorders itself on the next render.
   */
  function moveCheckItem(itemId: string, targetIndex: number) {
    const now = new Date().toISOString();
    setData((current) => {
      const moving = current.checkItems.find((item) => item.id === itemId);
      if (!moving) return current;

      const key = sortKeyForMovedCheckItem(moving.taskId, current.checkItems, itemId, targetIndex);
      if (key !== null) {
        if (key === moving.sortKey) return current;
        return {
          ...current,
          checkItems: current.checkItems.map((item) =>
            item.id === itemId ? { ...item, sortKey: key, updatedAt: now } : item,
          ),
        };
      }

      // Renumber: put the moving line where it was dropped and space the whole
      // Task's list out again. Only this Task's lines are rewritten.
      const own = checkItemsForTask(moving.taskId, current.checkItems).filter((item) => item.id !== itemId);
      const clamped = Math.max(0, Math.min(targetIndex, own.length));
      const ordered = [...own.slice(0, clamped), moving, ...own.slice(clamped)];
      const keys = new Map(ordered.map((item, index) => [item.id, index * ORDER_STEP]));
      return {
        ...current,
        checkItems: current.checkItems.map((item) => {
          const next = keys.get(item.id);
          return next === undefined || next === item.sortKey ? item : { ...item, sortKey: next, updatedAt: now };
        }),
      };
    });
  }

  /**
   * The mode toggle (§11.5): one transaction that moves the content, never a
   * view switch that leaves two copies of it.
   *
   * §11.14 spells out the intermediate state this must never be observable in
   * — items created, description still set, mode not yet switched — which is
   * why all three land in a single `setData`. One Undo takes the whole thing
   * back (§11.15), and because the conversion round-trips, taking it back
   * restores the text and the ticks rather than an approximation of them.
   */
  function setTaskContentMode(taskId: string, mode: TaskContentMode) {
    const now = new Date().toISOString();
    setData((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task || (task.contentMode ?? "description") === mode) return current;

      if (mode === "checklist") {
        const drafts = checkItemDraftsFromText(task.description);
        return {
          ...current,
          tasks: current.tasks.map((item) =>
            item.id === taskId ? { ...item, contentMode: mode, description: "", updatedAt: now } : item,
          ),
          checkItems: [
            ...current.checkItems,
            ...checkItemsFromDrafts(taskId, drafts, () => createId("checkitem"), now, ORDER_STEP),
          ],
        };
      }

      // Back to prose. The lines become the text (§11.19) and the records go,
      // because §11.13 keeps exactly one active content per Task — two copies
      // is how they start disagreeing.
      const description = descriptionFromCheckItems(checkItemsForTask(taskId, current.checkItems));
      return {
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === taskId ? { ...item, contentMode: mode, description, updatedAt: now } : item,
        ),
        checkItems: removeCheckItemsForTask(taskId, current.checkItems),
      };
    });
  }

  function addSubtask(taskId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const parent = data.tasks.find((task) => task.id === taskId);
    if (!parent) return;
    // §12.49: five levels. The UI does not offer the control at the bottom
    // level (§16.28 — a control must not appear and then refuse), so reaching
    // this is a caller that got there another way; refusing beats writing a
    // sixth level that nothing can show properly.
    if (!canAddChild(taskId, data.tasks)) return;
    createTask(childDraft(parent, trimmed));
  }





  function getSessionSeconds(session: FocusSession, nowMs = Date.now()) {
    if (session.status !== "running") return session.accumulatedSeconds;
    return session.accumulatedSeconds + Math.max(0, Math.floor((nowMs - new Date(session.startAt).getTime()) / 1000));
  }

  // While running, `startAt` marks the open segment's start (resume resets
  // it). Pausing or stopping closes that segment; a paused session has no
  // open segment to close.
  function closeOpenSegment(session: FocusSession, endAt: string): FocusSegment[] {
    if (session.status !== "running" || session.startAt >= endAt) return session.segments;
    return [...session.segments, { startAt: session.startAt, endAt }];
  }

  function startFocusSession(
    taskId: string,
    source: FocusSession["source"] = "focus_page",
    requestedDurationMinutes?: number,
  ) {
    const now = new Date().toISOString();

    setData((current) => {
      const active = current.focusSessions.find((session) => session.id === current.activeSessionId);
      if (active && (active.status === "running" || active.status === "paused")) return current;

      const task = current.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      const project = current.projects.find((item) => item.id === task.projectId);
      // SETTINGS_REVIEW.md 4.5: this used to be the whole rule, written here and
      // untested — the task's span, else 50 minutes for high priority and 30 for
      // everything else, with the two numbers visible nowhere in the interface.
      const durationMinutes = focusSessionMinutes({
        requestedMinutes: requestedDurationMinutes,
        startTime: task.startTime,
        endTime: task.endTime,
        priority: task.priority,
        preference: current.appSettings.focusDefaultMinutes,
      });
      const session: FocusSession = {
        id: createId("focus"),
        taskId,
        title: task.title,
        mode: "focus",
        status: "running",
        durationMinutes,
        accumulatedSeconds: 0,
        completed: false,
        startAt: now,
        endAt: "",
        startedAt: now,
        endedAt: "",
        pausedAt: "",
        segments: [],
        source,
        projectId: task.projectId,
        projectName: project?.name ?? "",
        focusNote: "",
        createdAt: now,
        updatedAt: now,
      };

      return {
        ...current,
        activeSessionId: session.id,
        focusSessions: [session, ...current.focusSessions],
        tasks: current.tasks.map((item) =>
          item.id === taskId ? { ...item, activeSessionId: session.id, lastFocusedAt: now, updatedAt: now } : item,
        ),
      };
    });
  }

  function pauseFocusSession(sessionId: string) {
    const now = new Date().toISOString();
    const nowMs = Date.now();
    setData((current) => ({
      ...current,
      focusSessions: current.focusSessions.map((session) =>
        session.id === sessionId && session.status === "running"
          ? {
              ...session,
              status: "paused",
              accumulatedSeconds: getSessionSeconds(session, nowMs),
              pausedAt: now,
              segments: closeOpenSegment(session, now),
              updatedAt: now,
            }
          : session,
      ),
    }));
  }

  function resumeFocusSession(sessionId: string) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      activeSessionId: sessionId,
      focusSessions: current.focusSessions.map((session) =>
        session.id === sessionId && session.status === "paused"
          ? { ...session, status: "running", startAt: now, pausedAt: "", updatedAt: now }
          : session,
      ),
    }));
  }

  function stopFocusSession(sessionId: string, completeTask = false) {
    const now = new Date().toISOString();
    const nowMs = Date.now();
    setData((current) => {
      const session = current.focusSessions.find((item) => item.id === sessionId);
      if (!session || (session.status !== "running" && session.status !== "paused")) return current;
      const finalSeconds = getSessionSeconds(session, nowMs);
      return {
        ...current,
        activeSessionId: current.activeSessionId === sessionId ? "" : current.activeSessionId,
        focusSessions: current.focusSessions.map((item) =>
          item.id === sessionId
            ? {
                ...item,
                status: "completed",
                completed: true,
                accumulatedSeconds: finalSeconds,
                endAt: now,
                endedAt: now,
                pausedAt: "",
                segments: closeOpenSegment(item, now),
                updatedAt: now,
              }
            : item,
        ),
        tasks: current.tasks.map((task) =>
          task.id === session.taskId
            ? {
                ...task,
                actualSeconds: task.actualSeconds + finalSeconds,
                activeSessionId: "",
                lastFocusedAt: now,
                status: completeTask ? "done" : task.status,
                completedAt: completeTask ? now : task.completedAt,
                updatedAt: now,
              }
            : task,
        ),
      };
    });
  }


  function deleteFocusSession(sessionId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const session = current.focusSessions.find((item) => item.id === sessionId);
      if (!session) return current;

      return {
        ...current,
        activeSessionId: current.activeSessionId === sessionId ? "" : current.activeSessionId,
        focusSessions: current.focusSessions.filter((item) => item.id !== sessionId),
        tasks: current.tasks.map((task) =>
          task.id === session.taskId
            ? {
                ...task,
                actualSeconds: Math.max(0, task.actualSeconds - session.accumulatedSeconds),
                activeSessionId: task.activeSessionId === sessionId ? "" : task.activeSessionId,
                updatedAt: now,
              }
            : task,
        ),
      };
    });
  }

  function updateFocusSessionNote(sessionId: string, focusNote: string) {
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      focusSessions: current.focusSessions.map((session) =>
        session.id === sessionId ? { ...session, focusNote, updatedAt: now } : session,
      ),
    }));
  }

  /**
   * Completing a legacy Subtask promotes it, because this is the moment its
   * record has to be written anyway — the conversion rides along and costs no
   * extra row. Nothing scans the collection to do this in bulk; a Subtask
   * nobody touches stays a Subtask, and stays readable.
   */
  function toggleSubtask(subtaskId: string) {
    const subtask = data.subtasks.find((item) => item.id === subtaskId);
    if (!subtask) {
      // Already a Task — the id is a task id, and completion is that path's.
      toggleTaskDone(subtaskId);
      return;
    }
    const parent = data.tasks.find((task) => task.id === subtask.taskId);
    if (!parent) return;
    // `subtask.completed` is the state BEFORE this toggle, so the promoted
    // Task takes the opposite one — `promoteDraft` carries the current state
    // and this is the toggle riding along with the conversion.
    createTask({
      ...promoteDraft(parent, subtask),
      status: subtask.completed ? LIFECYCLE.open : LIFECYCLE.completed,
    });
    setData((current) => ({
      ...current,
      subtasks: current.subtasks.filter((item) => item.id !== subtaskId),
    }));
  }

  function deleteSubtask(subtaskId: string) {
    setData((current) => {
      if (current.subtasks.some((item) => item.id === subtaskId)) {
        return { ...current, subtasks: current.subtasks.filter((item) => item.id !== subtaskId) };
      }
      // A promoted child is a Task; deleting it is the Task path, soft-delete
      // and all, so it can be undone like any other.
      return {
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === subtaskId ? { ...task, deletedAt: new Date().toISOString() } : task,
        ),
      };
    });
  }

  // === Shared task lifecycle (spec §0.1.1) ===

  function completeTask(taskId: string) {
    updateTask(taskId, { status: LIFECYCLE.completed });
  }

  // Snooze moves the planned work date only — never the deadline (spec §0.5.9).













  // === Space hierarchy (P3) ===
  // Nothing calls these yet — the Spaces UI arrives in P6. They exist now so
  // the collections have a single owner from the start, the way every other
  // record type does, rather than being written from a component later.
  /**
   * What the caller may decide beyond name and place (Add List design §0.7
   * R0-2). Both are optional because the design's whole point is that a List
   * can be made from a name and nothing else.
   */
  function createList(
    projectId: string,
    name: string,
    folderId?: string,
    options: { color?: string; defaultViewKey?: string; sidebarFolderId?: string } = {},
  ): string {
    const now = new Date().toISOString();
    const list: List = {
      id: createId("list"),
      projectId,
      // The legacy mirror, written so a client from before the rename still
      // sees the List instead of dropping it (see `List.projectId`).
      spaceId: projectId,
      // Written explicitly, and it is not decoration. `sanitizeList` keeps a
      // List only when it has an owning Project OR says what kind it is, and a
      // List made from the Tasks sidebar has no Project to belong to (§6.3
      // makes that first-class). Without this the record would load once and
      // be dropped on the next read — a List that vanishes overnight.
      kind: "regular",
      folderId,
      name: name.trim(),
      // Absent rather than "" when unset: the field means "the user chose
      // this", and an empty string is a choice that reads as one.
      ...(options.color?.trim() ? { color: options.color.trim() } : {}),
      ...(options.defaultViewKey?.trim() ? { defaultViewKey: options.defaultViewKey.trim() } : {}),
      // The sidebar's own grouping, NOT the Project ladder's Folder (D18/D19).
      // A List made in the Tasks Module has no Project, and a domain Folder
      // belongs to one — so there is no Folder of that kind it could go in.
      ...(options.sidebarFolderId?.trim() ? { sidebarFolderId: options.sidebarFolderId.trim() } : {}),
      order: 0,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    setData((current) => {
      const lists = hierarchy.addList(current.lists, list);
      // U2's one-way reveal. Once a second List has EXISTED the tree keeps
      // showing the level, even if the count later drops back to one —
      // re-deciding from the live count would make a whole tree level vanish
      // because the user deleted a list, which reads as losing the lists.
      //
      // Writing it was blocked on M0: a client older than v0.6.0 would strip
      // this field on its next save. v0.6.0 shipped the passthrough, and
      // 0.6.1/0.7.0 followed, so the field now survives a round trip.
      const revealed = hierarchy.activeLists(lists, projectId).length > 1;
      const projects = revealed
        ? current.projects.map((project) =>
            project.id === projectId && project.listsRevealed !== true
              ? { ...project, listsRevealed: true, updatedAt: now }
              : project,
          )
        : current.projects;
      return { ...current, lists, projects };
    });
    return list.id;
  }

  /**
   * A sidebar group, made because a List is going into it (Add List §6.32).
   *
   * `addSidebarFolder` has been in the domain, tested, with nothing able to
   * call it — the same gap `standaloneLists` had. Answers the new id so the
   * caller can select it straight away, which is the whole reason it was made.
   */
  function createSidebarFolder(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "";
    const id = createId("sidebar-folder");
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      sidebarFolders: addSidebarFolder(current.sidebarFolders, trimmed, id, now),
    }));
    return id;
  }


  function updateList(listId: string, patch: Partial<List>) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = hierarchy.patchList(current.lists, listId, patch, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  function archiveList(listId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = hierarchy.archiveList(current.lists, listId, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  /**
   * The container lifecycle (§13.21-§13.24). Soft, every one of them: the
   * Tasks keep their `listId` through archive and delete alike, which is what
   * makes `restoreList` one field and keeps the Task Trash a list of what the
   * user threw away themselves.
   */
  function trashList(listId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = lifecycle.trashList(current.lists, listId, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  function restoreList(listId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = lifecycle.restoreList(current.lists, listId, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  /**
   * §6.56's one permitted hard cascade — the Tasks go with the List.
   *
   * Only reachable for a List already in the deleted state, so a single click
   * cannot arrive here, and the surface that calls it says how many Tasks it
   * is about to take (`taskCountInList`).
   */
  function permanentlyDeleteList(listId: string) {
    setData((current) => {
      const next = lifecycle.permanentlyDeleteList(current.lists, current.tasks, listId);
      if (!next.done) return current;
      return {
        ...current,
        lists: next.lists,
        tasks: next.tasks,
        // The Tasks went with the List, so their checklist lines go too —
        // this is the one delete that removes Tasks in bulk.
        checkItems: pruneOrphanCheckItems(next.tasks, current.checkItems),
      };
    });
  }

  function moveListToFolder(listId: string, folderId?: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const lists = hierarchy.moveListToFolder(current.lists, listId, folderId, current.folders, now);
      return lists === current.lists ? current : { ...current, lists };
    });
  }

  /**
   * Drop an Item onto a List — the Item and everything under it (§13.14).
   *
   * The subtree is the unit, because §2.24 says a child lives in its parent's
   * List. This used to write the one Task it was given, which meant a parent
   * dragged to another List left its children behind in the old one: the
   * invariant broken by the very operation that is supposed to preserve it,
   * and invisibly, since neither List's own view shows the other's rows.
   *
   * `listMovePlan` answers null for a move that changes nothing, for a target
   * that is not a List, and for a child asked to move on its own (§13.15) —
   * so a drag that ends where it started still puts nothing on the wire.
   */
  function moveTaskToList(taskId: string, listId: string) {
    setData((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      const plan = listMovePlan(task, listId, current.tasks, current.lists);
      if (!plan) return current;
      const now = new Date().toISOString();
      const moving = new Set(plan.taskIds);
      return {
        ...current,
        tasks: current.tasks.map((item) =>
          moving.has(item.id) ? { ...item, ...plan.patch, updatedAt: now } : item,
        ),
      };
    });
  }

  /**
   * Put a Tag on a Task or take it off (§13.39), by name.
   *
   * One `setData` for all three collections, which is what §13.42 asks for:
   * the Tag record, the relation and `Task.tags` move together or not at all.
   * Splitting them would let a failure leave a Tag nothing points at, or —
   * worse, because it is silent — a relation and a mirror that disagree.
   *
   * By name rather than by id because §13.41 creates a Tag that has no id yet.
   * `toggleTaskTag` derives one, and it derives the SAME one on every device,
   * so two clients tagging the same word independently converge.
   */
  function toggleTaskTag(taskId: string, name: string) {
    setData((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      const now = new Date().toISOString();
      const result = toggleTagOnTask(task, name, current.tags, current.taskTags, now);
      // §13.35 refused the name. Writing nothing is the whole response — the
      // picker has already said why.
      if (!result) return current;
      return {
        ...current,
        tags: result.tags,
        taskTags: result.taskTags,
        tasks: current.tasks.map((item) =>
          item.id === taskId ? { ...item, tags: result.taskTagNames, updatedAt: now } : item,
        ),
      };
    });
  }

  /**
   * Make one day's plan say exactly `overrides` (§6.18).
   *
   * The whole map, not one task, because every caller on the Today page —
   * moving a row, planning the day, clearing it, and the undo that follows
   * each — deals in complete snapshots. `applyBucketOverrides` is what keeps
   * that from meaning a rewrite of every row.
   */
  function setTodayBuckets(overrides: Record<string, DailyPlanBucket>, planDate: string) {
    setData((current) => {
      const now = new Date().toISOString();
      const dailyPlans = applyBucketOverrides(current.dailyPlans, planDate, overrides, now);
      return dailyPlans === current.dailyPlans ? current : { ...current, dailyPlans };
    });
  }

  /**
   * Put a task on a day without saying where in it (§12.5.3).
   *
   * What Today's `+ 작업` contributes: the task has no due date, so this record
   * is the only thing keeping it on the screen that made it.
   */
  function planTaskForDay(taskId: string, planDate: string) {
    setData((current) => {
      const now = new Date().toISOString();
      const dailyPlans = planTaskForDate(current.dailyPlans, taskId, planDate, now);
      return dailyPlans === current.dailyPlans ? current : { ...current, dailyPlans };
    });
  }

  function createFolder(projectId: string, name: string): string {
    const now = new Date().toISOString();
    const folder: Folder = {
      id: createId("folder"),
      projectId,
      spaceId: projectId,
      name: name.trim(),
      order: 0,
      createdAt: now,
      updatedAt: now,
    };
    setData((current) => ({ ...current, folders: hierarchy.addFolder(current.folders, folder) }));
    return folder.id;
  }

  function updateFolder(folderId: string, patch: Partial<Folder>) {
    const now = new Date().toISOString();
    setData((current) => {
      const folders = hierarchy.patchFolder(current.folders, folderId, patch, now);
      return folders === current.folders ? current : { ...current, folders };
    });
  }

  function archiveFolder(folderId: string) {
    const now = new Date().toISOString();
    setData((current) => {
      const next = hierarchy.archiveFolder(current.folders, current.lists, folderId, now);
      if (next.folders === current.folders && next.lists === current.lists) return current;
      return { ...current, folders: next.folders, lists: next.lists };
    });
  }

  // === App settings + recent items ===
  function updateAppSettings(patch: Partial<AppSettings>) {
    setData((current) => ({ ...current, appSettings: { ...current.appSettings, ...patch } }));
  }

  function updatePlannerSettings(patch: Partial<PlannerSettings>) {
    const now = new Date().toISOString();
    setDataState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...patch,
        updatedAt: now,
      },
    }));
  }


  function importData(raw: unknown): boolean {
    if (!raw || typeof raw !== "object") {
      return false;
    }

    const normalized = adoptLoadedData(normalizeData(raw as Partial<PlannerData>));
    setData(normalized);
    return true;
  }

  function exportData(): PlannerData {
    return normalizeData(data);
  }

  function resetData() {
    setData(emptyData());
  }

  return {
    tasks: data.tasks,
    projects: data.projects,
    subtasks: data.subtasks,
    learningPaths: data.learningPaths,
    spaces: data.spaces,
    folders: data.folders,
    lists: data.lists,
    sidebarFolders: data.sidebarFolders,
    listSections: data.listSections,
    savedFilters: data.savedFilters,
    dailyPlans: data.dailyPlans,
    tags: data.tags,
    taskTags: data.taskTags,
    checkItems: data.checkItems,
    reminders: data.reminders,
    taskTemplates: data.taskTemplates,
    focusSessions: data.focusSessions,
    activeSessionId: data.activeSessionId,
    activeFocusSession:
      data.focusSessions.find(
        (session) =>
          session.id === data.activeSessionId && (session.status === "running" || session.status === "paused"),
      ) ?? null,
    settings: data.settings,
    appSettings: data.appSettings,
    storageError,
    retryLocalSave,
    auth: {
      isConfigured: isSupabaseConfigured,
      isLoading: authLoading,
      userEmail,
      isSignedIn: Boolean(userEmail),
      mode: userEmail ? "supabase" : "localStorage",
      syncStatus,
      syncError,
      recoveryMode,
      migrationPreviewCount: localMigrationData ? countPlannerDataItems(localMigrationData) : 0,
    },
    addTask,
    createTask,
    updateTask,
    updateTaskSchedule,
    completeTask,
    deleteTask,
    restoreDeletedTask,
    archiveTask,
    restoreTask,
    duplicateTask,
    discardDuplicate,
    saveTaskAsTemplate,
    deleteTaskTemplate,
    createTaskFromTemplate,
    toggleTaskDone,
    addCheckItem,
    addCheckItems,
    updateCheckItemText,
    toggleCheckItem,
    deleteCheckItem,
    moveCheckItem,
    setTaskContentMode,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
    createList,
    createSidebarFolder,
    updateList,
    archiveList,
    trashList,
    restoreList,
    permanentlyDeleteList,
    moveListToFolder,
    moveTaskToList,
    toggleTaskTag,
    setTodayBuckets,
    planTaskForDay,
    createFolder,
    updateFolder,
    archiveFolder,
    updateAppSettings,
    updatePlannerSettings,
    startFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    stopFocusSession,
    deleteFocusSession,
    updateFocusSessionNote,
    resetData,
    importData,
    exportData,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    uploadLocalDataToSupabase,
    refreshSupabaseData: loadSupabaseData,
  };
}
