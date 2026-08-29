import type { BackupInterval } from "./domain/backup/schedule";
import type { FocusDefaultLength } from "./domain/focus/sessionLength";
// Type-only, so nothing is imported at runtime and the modules that describe
// the matrix can keep importing this one.
import type { MatrixQuadrantView } from "./domain/view/matrixGroups";
import type { MatrixQuadrantRule } from "./domain/view/matrixRules";
import type { InboxBucket } from "./domain/tasks/board";
import type { InboxColumn } from "./domain/view/inboxColumns";
import type { MatrixQuadrant } from "./utils/eisenhower";

/**
 * A Goal, as it sits in storage.
 *
 * The Goals feature is gone — its screens, its drafting, its mutations — but
 * the records are not deleted with it: an account that planned goals keeps
 * them in `PlannerData`, round-tripping untouched through load and save, so
 * nothing is destroyed by a feature being taken away. Nothing reads inside
 * one any more, which is why the shape is opaque rather than the eight
 * interfaces it used to be.
 */
export type StoredGoal = Record<string, unknown>;

// === Task lifecycle (spec §4.1) ===
// Canonical MVP statuses: inbox -> todo -> doing -> waiting -> done -> archived.
// `in_progress` and `blocked` are LEGACY values kept in the union so non-MVP
// (hidden) screens still compile; stored data is migrated away from them on load.
/**
 * Where a Task is in its life: the three states it can END in, plus the one
 * it is in until then (Chapter 26 §26.3.2).
 *
 * Three, and not the six `TaskStatus` used to hold, because the other three
 * were answering different questions. `doing` and `waiting` were WORKFLOW —
 * a place in a flow the user defines, which is a List's Section now
 * (`Task.sectionId`). `inbox` was a CONTAINER — which List a Task is in,
 * which List membership already answers. One field, one question.
 */
export type TaskLifecycle = "open" | "completed" | "wont_do";

/**
 * The six values `status` used to hold, plus two the migration retired.
 *
 * Still in the union because accounts have them STORED: this app writes one
 * jsonb per record and cannot rewrite a column, so a value written years ago
 * arrives exactly as it was. Nothing outside `domain/tasks/taskState` should
 * name one — the predicates there read both spellings, which is what lets a
 * legacy record answer correctly without being rewritten.
 */
export type LegacyTaskStatus =
  | "inbox"
  | "todo"
  | "doing"
  | "waiting"
  | "done"
  | "archived"
  | "in_progress"
  | "blocked";

export type TaskStatus = TaskLifecycle | LegacyTaskStatus;
export type TaskPriority = "none" | "low" | "medium" | "high";
// "yearly" joined the set with the schedule editor's 반복 panel, which
// offers it alongside the four that already existed.
export type RepeatType = "none" | "daily" | "weekly" | "monthly" | "yearly";
export type FocusMode = "focus" | "short_break" | "long_break";

export interface Task {
  id: string;
  title: string;
  description: string;
  /**
   * Which body this Task has (spec §11). Absent means `description`, which is
   * what every Task written before checklists existed is — so nothing has to
   * be rewritten for the field to arrive.
   */
  contentMode?: TaskContentMode;
  status: TaskStatus;
  priority: TaskPriority;
  // Dates use "" as the "not set" sentinel (kept as string for legacy callers).
  dueDate: string; // deadline (YYYY-MM-DD)
  /**
   * When the work BEGINS (YYYY-MM-DD, "" = unset). Added for the timeline,
   * which needs a span and not a point.
   *
   * With `scheduledDate` gone (SCHEDULE_EDITOR_PHASE0_AUDIT.md §7 Phase 11),
   * a task has two dates and not three: this one and `dueDate`. A record with
   * both is a range; a record with only `dueDate` is a single day.
   *
   * Additive only (M0). It rides inside the `data` jsonb, so no table change
   * is needed, and `normalizeTask` spreads unknown fields first — which is
   * what lets a client that predates this field carry it instead of erasing
   * it (a29a8f7).
   */
  startDate: string;
  startTime: string;
  endTime: string;
  projectId: string;
  // Calendar category id ("" = unset; display falls back to the project
  // category, then the default personal category).
  categoryId: string;
  parentTaskId: string;
  tags: string[];
  notes: string;
  // Expected effort in minutes (0 = unset). Drives the default calendar
  // block length when a task is dragged onto the time grid.
  estimatedMinutes: number;
  actualSeconds: number;
  activeSessionId: string;
  lastFocusedAt: string;
  isSomeday: boolean;
  waitingReason: string;
  waitingFollowUpDate: string;
  /**
   * Manual order, and the plan's `sortKey` (§6.30/§6.31).
   *
   * It sorts within `(listId, sectionId)` and nowhere else: a Task has one
   * hand-placed position, not one per screen, which is why a Scope gathering
   * Tasks from several Lists cannot be reordered by hand at all
   * (`scopeRegistry.canManualReorder`).
   *
   * Not an index. Keys are spaced so a drop between two Tasks writes one row
   * instead of renumbering the column — see domain/tasks/sortKey.ts, which is
   * the only thing that should compute a value for this field.
   */
  order: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string; // set only when status becomes done
  archivedAt?: string; // set only when status becomes archived
  /**
   * Marked "won't do" — a terminal state beside completed and trashed
   * (Nav Shell audit D-23).
   *
   * A timestamp and NOT a `TaskStatus` value, deliberately. `completedAt`
   * shows what the other shape costs: the truth is stored twice, `status`
   * wins, and unifying them is still open. This follows `deletedAt` instead,
   * which stores it once.
   *
   * Being orthogonal to `status` is what makes the two P0 rules structural
   * rather than enforced — a mark on one occurrence does not touch the
   * `repeat*` fields,
   * and a mark on a parent is not a mark on its children.
   *
   * Empty or absent means the task has not been given up on. The difference
   * between the two matters to undo, the same way it does for `deletedAt`.
   */
  wontDoAt?: string;
  deletedAt?: string; // optional soft-delete marker
  /**
   * Kept at hand (§15.6), as a timestamp rather than a flag.
   *
   * §15.6 names the field `isPinned: boolean` and §15.8 asks for exactly one
   * canonical value; this is that one value, in the shape `wontDoAt` and
   * `deletedAt` already use. A boolean answers "is it pinned" and nothing
   * else, and §15.8 hands the ORDER of pinned Tasks to each View — a question
   * a boolean cannot be asked. Read it through `taskState.isPinned` rather
   * than directly, so the predicate stays the one place that knows the shape.
   *
   * Independent of status, List and priority (§15.7): pinning writes this
   * field and touches nothing else, which is what makes that rule structural
   * instead of remembered.
   */
  pinnedAt?: string;
  /**
   * Dormant (Chapter 26 §26.3.2).
   *
   * This remembered which workflow status to put a Task back into when it was
   * reopened — `doing` rather than `todo`, say. Lifecycle has one non-terminal
   * state now, so reopening has one destination and there is nothing to
   * remember. Kept on the type because accounts have it stored.
   */
  previousStatus?: TaskStatus;
  blockedByTaskId: string;
  // === Space hierarchy (P4) ===
  // Written only when the answer stops being derivable — when the task is
  // moved into a List other than its Space's default. Resolve through
  // membership.listIdFor rather than reading it directly; `projectId` still
  // answers when it is absent, which is the normal case.
  listId?: string;
  /**
   * Dormant (Chapter 26 §26.3.3).
   *
   * This named a column in the owning Project's own status set. Both the set
   * and the axis are gone: a List's board columns are its Sections
   * (`sectionId`), and lifecycle is a predicate. Nothing reads this field.
   *
   * It stays on the type because accounts have it stored, and the load's M0
   * passthrough carries it — dropping it from the type would not delete the
   * data, only hide it from anyone looking for it.
   */
  statusId?: string;
  /**
   * The Board column this Task sits in, within its owner List (§6.26).
   *
   * A Section belongs to one List and is only meaningful there, so this is
   * read through `sectionIdFor` rather than directly: a stored id naming a
   * Section of some other List answers "" — the invariant §6.28 forbids and
   * that a `data` jsonb column cannot declare. Absent or "" is the default
   * "unsectioned" column (§6.27), which is where every Task starts.
   */
  sectionId?: string;
  repeatType: RepeatType;
  repeatInterval: number;
  repeatDays: number[];
  repeatEndDate: string;
  /**
   * When to be reminded, as a `ReminderPreset` ("" = none).
   *
   * Stored as a plain string rather than the domain union so this file stays
   * free of a dependency on `domain/schedule`; the adapter there validates it
   * on the way in, and an unknown value reads as "none".
   *
   * Optional, like `sectionId` above: a record written before this field
   * existed simply has no reminder, which is the same thing "" means.
   *
   * Nothing delivers these yet — see `domain/schedule/reminder.ts`.
   */
  reminder?: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

// === Space hierarchy (SPACES_CLICKUP_REDESIGN.md §4) ===
//
// Space -> Folder? -> List -> Item. Folder is optional, so a List may hang
// straight off a Space (D4); that is the shape ClickUp calls a Folderless
// List, and it is what keeps simple use from paying for the hierarchy.
//
// Only the two NEW collections live here so far. The Space itself is still the
// existing `Project` record and gains its fields in P4: adding a field to a
// record an older client already syncs would have that client erase it, which
// is the whole point of M0 (§5). A brand-new table has no such problem — a
// client that has never heard of it simply leaves it alone.

/**
 * A workflow stage, as accounts have it STORED.
 *
 * Dormant (Chapter 26 §26.3.3), like `Task.statusId`. Nothing constructs,
 * reads or validates one of these any more — a List's board columns are its
 * Sections, and lifecycle is a predicate. The shape stays described because
 * `List.statuses` and `Project.statuses` still carry it through load and
 * save, and a stored field with no type is a field nobody can find.
 */
export type StatusGroup = "notStarted" | "active" | "done" | "closed";

export interface Status {
  id: string;
  label: string;
  color: string;
  order: number;
  group: StatusGroup;
}

/**
 * A work area holding several Projects — the top of the tree
 * (SPACES_REDESIGN_II §4).
 *
 * A brand-new collection, which is what makes it safe to add: a client that
 * has never heard of this table simply leaves it alone, where a new field on
 * an existing synced record needs M0 to survive (§5).
 */
export interface Space {
  id: string;
  name: string;
  description: string;
  color: string;
  icon?: string;
  order: number;
  archivedAt?: string;
  /** Thrown away and recoverable (§13.20). Never set beside `archivedAt`. */
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Optional grouping inside a Project. Absent until someone makes one (D4). */
export interface Folder {
  id: string;
  /**
   * The Project this Folder groups Lists inside.
   *
   * Called `spaceId` while holding a Project id: the field predates the Space
   * record and kept the old word after Space became a level of its own. The
   * name is the thing being fixed — see `List.projectId` for why both are
   * written and only this one is read.
   */
  projectId: string;
  /** @deprecated Legacy mirror of `projectId`, written for older clients. */
  spaceId?: string;
  name: string;
  order: number;
  archivedAt?: string;
  /** Thrown away and recoverable (§13.20). Never set beside `archivedAt`. */
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface List {
  id: string;
  /**
   * The Project that owns this List. Always set, even when the List sits
   * inside a Folder: reaching the owner through the Folder would make every
   * lookup a two-hop join, and a Folderless List could not be resolved that
   * way at all.
   *
   * This was `spaceId` and held a Project id the whole time — the field
   * predates the Space record and kept the word after Space became a separate
   * level above Project. A reader had to know that to be right, and enough of
   * them did not.
   *
   * The stored key was NOT renamed in place. An older client's `sanitizeList`
   * drops any List whose `spaceId` is missing, and this app auto-updates, so
   * writing only the new key would delete every List on a device that had not
   * updated yet (M0). Both keys are written; only this one is read. The mirror
   * goes when no client that needs it is left — the plan's Migration Phase 7.
   *
   * `""` means the List belongs to no Project (Migration Phase 4, §6.72). The
   * plan writes that as `null`; this stores `""` because the field is required
   * and every reader already treats an empty owner as "nobody's". Two Lists can
   * be nobody's: the Inbox (§6.5) and a standalone List (§6.3). Neither appears
   * in a Project or Space query — §6.79 and §6.80 — which `activeLists`
   * enforces by refusing to answer for an empty Project at all.
   */
  projectId: string;
  /** @deprecated Legacy mirror of `projectId`, written for older clients. */
  spaceId?: string;
  /**
   * What kind of List this is (TickTick plan §6.4).
   *
   * `"inbox"` marks the one system List that holds Tasks belonging to no
   * Project — the record the plan replaces `Task.status === "inbox"` with, so
   * every Task has the same kind of owner (§6.5). There is exactly one per
   * account and its name is not the user's to change (§6.7).
   *
   * Optional because a record written before this release has none, and
   * absent reads as `"regular"`. An older client drops the Inbox List
   * entirely — it has no `spaceId` to file under — which is survivable only
   * because `Task.status === "inbox"` is still written beside `listId`, and
   * because `ensureInboxList` rebuilds the row from a fixed id.
   *
   * `"regular"` is not decoration. Since Migration Phase 4 it is what lets a
   * List with no Project through `sanitizeList`: a record that says it is a
   * regular List standing alone is kept, while one that simply lost its owner
   * is still dropped. A standalone List is therefore invisible on a client
   * older than that change — it has no `spaceId` to file under — but not
   * deleted, because the sync baseline is the sanitized data, so a record the
   * old client never loaded is one it never reports as removed.
   */
  kind?: "inbox" | "regular";
  /** Absent for a Folderless List (D4). */
  folderId?: string;
  /**
   * Where this List is shown in the Tasks sidebar (TickTick plan §6.33, D18).
   *
   * A different question from `folderId`, on purpose. The domain Folder says
   * where the List BELONGS inside its Project; this says where the user
   * chose to see it, and moving a List between sidebar folders changes only
   * that (D19) — the Project relation above is untouched, so nothing under
   * the List has to be rewritten.
   *
   * Absent means "grouped where the domain says", which is every List until
   * something moves one. `folderIdFor` is where the two are resolved into
   * the single answer the sidebar and the `folder` Scope both use.
   */
  sidebarFolderId?: string;
  /** Manual order within the sidebar group (§6.34). Falls back to `order`. */
  sidebarSortKey?: number;
  name: string;
  /**
   * The List's colour, as the user picked it (Add List design §13.20-§13.22).
   *
   * A free string rather than a union of the palette's tokens, for the same
   * reason `defaultViewKey` below is one: a build that only knows today's
   * palette must not strip a value a newer build wrote. What is a valid colour
   * is answered where it is drawn, not where it is stored.
   *
   * Absent means the List has no colour of its own. That is NOT the same as
   * white or as the Project's colour — it is the Add List default (§0.7 R0-2),
   * and rendering decides what "none" looks like.
   */
  color?: string;
  /**
   * Which View this List opens in (Add List design §13.3-§13.7).
   *
   * §13.7 asks for a text key rather than an enum, and M0 makes that a
   * requirement rather than a preference here: the set of Views will grow, and
   * a client that validated against its own narrow set would drop a key a
   * newer client wrote and then save the record back without it. So this
   * stores whatever was written and the View registry decides at OPEN time
   * whether this build can honour it (`ListViewKey` in domain/tasks).
   *
   * This does not make the List a Board (§0.7 R0-1). The List is a container;
   * `?view=` is the URL's, and this only says which one to reach for first.
   * Absent means the Scope registry's own default answers, as it always has.
   */
  defaultViewKey?: string;
  order: number;
  /**
   * Created with the Space and not deletable, so an Item always has somewhere
   * to be (D5). It is also what lets the UI hide the List level entirely until
   * a second List exists (SPACES_CLICKUP_UI_DESIGN U2).
   */
  isDefault: boolean;
  /** Overrides the Space's set when present; inherits when absent (D7). */
  statuses?: Status[];
  /**
   * Kept, not emptied (TickTick plan §13.20).
   *
   * Archived means put away, deleted means thrown away and recoverable, and a
   * record is never both — each command clears the other, because "restore"
   * would otherwise have to guess which state to put back.
   *
   * Neither one touches a Task. The Tasks keep their `listId` through both
   * (§6.56), which is why restoring is one field rather than a migration, and
   * why the Task Trash stays a list of what the USER deleted.
   */
  archivedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type ProjectType = "project" | "area";

/**
 * A status the user added to a Space, stored in the reduced form it was first
 * written in — `membership.statusesWithCustom` supplies the colour and the
 * group the full `Status` needs.
 *
 * Not a `List`. A List is where an Item is stored; this is a column it can be
 * shown in. The two shared the word "board list" until the hierarchy arrived
 * and made the collision expensive.
 */
export interface CustomStatus {
  id: string;
  name: string;
  order: number;
  archivedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  notes?: string;
  color: string;
  type?: ProjectType;
  icon?: string;
  dueDate?: string;
  pinned?: boolean;
  order?: number;
  status?: ProjectStatus;
  archivedAt?: string;
  /**
   * Thrown away and recoverable (§13.20/§13.28).
   *
   * A Project's lifecycle does not reach the work under it. Its Lists keep
   * `projectId` through both states so restore needs no backfill (§13.28), and
   * the Tasks in those Lists go on being usable in the Tasks Module — a
   * Project is a List's context, not a Task's owner (§13.19).
   */
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * The statuses the user added. Keyed `boardLists` because that is what it
   * was called when the field started syncing, and a renamed key is a key an
   * older client erases (M0). Read together with `statuses` below.
   */
  boardLists?: CustomStatus[];
  // === Space fields (P4, SPACES_CLICKUP_REDESIGN D1/D7) ===
  // A Project IS the Space; the record keeps its id so Task.projectId and
  // space:<id> tags keep pointing at the same thing.
  //
  // All optional, and none is backfilled. A Space that has never been edited
  // stores nothing new, so this migration rewrites no records at all — see
  // domain/spaces/membership.ts for why that matters.
  /** Absent means the default set (membership.statusesForSpace). */
  statuses?: Status[];
  /** Feature toggles, inherited from AppSettings when absent. */
  features?: Record<string, boolean>;
  /** One-way once a second List has existed (SPACES_CLICKUP_UI_DESIGN U2). */
  listsRevealed?: boolean;
  /**
   * The Space this Project belongs to (H-INV-01).
   *
   * Optional because it is a new field on a record that already syncs: a
   * client written before Spaces will not send it, and M0 passthrough is what
   * stops such a client from erasing it. Absent reads as the default Space
   * (`spaceIdForProject`), so a Project is never missing from the tree while
   * waiting for the backfill to reach this device.
   */
  spaceId?: string;
}

// One uninterrupted running stretch of a focus session. Pauses close a
// segment; resume opens the next one. This is what the calendar's
// "actual focus time" blocks are drawn from.
export interface FocusSegment {
  startAt: string;
  endAt: string;
}

export interface FocusSession {
  id: string;
  taskId: string;
  title: string;
  mode: FocusMode;
  status: "running" | "paused" | "completed" | "cancelled";
  durationMinutes: number;
  accumulatedSeconds: number;
  completed: boolean;
  startAt: string;
  endAt: string;
  startedAt: string;
  endedAt: string;
  pausedAt: string;
  segments: FocusSegment[];
  source: "focus_page" | "today_page" | "calendar_event" | "global_bar";
  projectId: string;
  projectName: string;
  focusNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerSettings {
  id: string;
  theme: "system" | "light" | "dark";
  externalCalendars?: ExternalCalendar[];
  createdAt: string;
  updatedAt: string;
}

// === App settings (spec §4.7) ===
export type AccentColor = "blue" | "purple" | "green" | "pink" | "orange";
export type ThemeMode = "light" | "dark" | "system";
export type FontSize = "small" | "medium" | "large";
export type Language = "ko" | "en";

export type TimeFormat = "locale" | "12h" | "24h";
export type WeekStart = "sunday" | "monday";

export interface AppSettings {
  theme: ThemeMode;
  accentColor: AccentColor;
  fontSize: FontSize;
  language: Language;
  // "/planning" is LEGACY: the Planning page became the Board's quadrant
  // grouping, but the value is already stored in accounts, so it stays in the
  // union and resolves to the Board rather than dropping those users on Today.
  defaultView: "/today" | "/inbox" | "/calendar" | "/board" | "/planning" | "/projects" | "/focus";
  showCompletedInToday: boolean;
  confirmBeforeDelete: boolean;
  /**
   * How a clock time is written (SETTINGS_REVIEW.md 4.2).
   *
   * `locale` is the default and means "whatever this language writes" — which
   * is what the calendar should always have done. It was `Intl.DateTimeFormat("en", { hour12: false })`
   * hard-coded, so a Korean reader got `13:00` where macOS writes `오후 1시`.
   */
  timeFormat: TimeFormat;
  /**
   * Which column a week begins in (SETTINGS_REVIEW.md 4.3).
   *
   * Sunday is the stored default because it is what every existing account has
   * been showing; it was never a choice, just `getDay()` used unadjusted.
   */
  weekStart: WeekStart;
  /**
   * How many hour rows the Day/Week grid fits before it scrolls
   * (SETTINGS_REVIEW.md 4.4, CALENDAR_GEOMETRY_DESIGN.md R1).
   *
   * A whole number from 6 to 24; `calendarTime.clampHoursAtATime` is what any
   * value reaching this field has to pass. 12 is Apple's default and was ours
   * as a constant, so no existing account moves.
   */
  hoursAtATime: number;
  /**
   * How long a focus session runs when nothing more specific says
   * (SETTINGS_REVIEW.md 4.5). See `domain/focus/sessionLength`.
   *
   * `"auto"` is the shipped value and keeps the inference the hook used to make
   * inline — the task's own span, else 50 minutes for a high-priority task and
   * 30 for the rest. It is the default so that an account which never opens the
   * setting does not have its sessions quietly change length.
   */
  focusDefaultMinutes: FocusDefaultLength;
  /**
   * How often a copy of everything is written to disk (SETTINGS_REVIEW.md 4.6).
   *
   * `off` ships, because writing files on a schedule is not something to start
   * doing to someone's machine without being asked. Desktop only — the web
   * adapter has nowhere to put a copy that would outlive the data.
   *
   * WHEN this device last managed one is deliberately NOT here: that is local
   * state (`useAutoBackup`), since a backup on one machine is no use to another.
   */
  autoBackup: BackupInterval;
  /** How many files survive a prune, newest first. */
  autoBackupKeep: number;
  sidebarCollapsed: boolean;
  reduceMotion: boolean;
  /**
   * The device's IANA time zone, e.g. "Asia/Seoul". "" = not detected.
   *
   * Not a preference — a fact about where the app is running, refreshed on
   * every start when it changes (usePlannerData). A person who flies keeps
   * one time zone at a time, so the device used last is the best answer.
   *
   * Here rather than in device-local storage on purpose, and it is the one
   * exception to the rule that path- and device-shaped values stay off the
   * account: every date in this app is a bare "YYYY-MM-DD" in local wall
   * time, so anything reading the account WITHOUT a browser attached cannot
   * tell what "today" means. Nothing does yet; the external-AI design
   * (FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md M1) is what needs it.
   */
  timezone: string;
  // Dead field from the removed AI assistant (LOCAL_AI_REMOVAL_DESIGN.md).
  // No UI reads or writes it. Kept for one more release so settings synced
  // from a client that still has the feature normalize cleanly instead of
  // failing the shape check.
  aiModel: string;
  /**
   * How each box of the matrix is grouped and ordered
   * (TICKTICK_MATRIX_DESIGN.md §7).
   *
   * Per box, because the boxes hold different kinds of work and the reader
   * wants different things from them — Ⅰ is a list of what is late and Ⅱ is a
   * list of what is coming, and one shared setting would make one of them
   * wrong.
   *
   * Here rather than in device-local state so a person who arranges their
   * matrix on the desktop finds it arranged on the laptop. Optional and
   * additive (M0): a client that predates it carries the value through
   * untouched, and one that has never been set reads as the default.
   */
  matrixQuadrantViews?: Partial<Record<MatrixQuadrant, MatrixQuadrantView>>;
  /**
   * What each box CONTAINS, as opposed to how it is drawn
   * (TICKTICK_MATRIX_DESIGN.md §23.1).
   *
   * Separate from `matrixQuadrantViews` on purpose: "how is this grouped" and
   * "what gets in here" are different questions, and changing one must not
   * move the other. Optional and additive (M0) like its neighbour — a box
   * absent from here reads as its DEFAULT rule, which is the priority mapping
   * this app had hard-coded before rules existed, so an account that never
   * opens the editor behaves exactly as it does now.
   */
  matrixQuadrantRules?: Partial<Record<MatrixQuadrant, MatrixQuadrantRule>>;
  /**
   * What each Inbox board COLUMN contains
   * (TICKTICK_INBOX_COLUMNS_DESIGN.md §6, phase 3).
   *
   * The same shape as its neighbour above and stored apart from it, because
   * they are two screens' worth of decisions and editing a matrix box must not
   * move a board column. Absent reads as the three date buckets this app has
   * always drawn, so an account that never edits a column behaves exactly as
   * it does now — which `inboxColumnRules.test.ts` checks against the
   * `inboxBucketOf` these replace, shape by shape.
   */
  inboxColumnRules?: Partial<Record<InboxBucket, MatrixQuadrantRule>>;
  /**
   * What the user calls each Inbox board column.
   *
   * Stored apart from the rules above because they are separate claims: the
   * rule is what gets in, the name is what it is called, and renaming a column
   * must not be able to change what it holds. A column absent from here reads
   * as its built-in label — and a name cleared to "" drops the key rather than
   * storing a blank, so "cleared" and "never named" stay the same state.
   */
  inboxColumnNames?: Partial<Record<InboxBucket, string>>;
  /**
   * The Inbox board's columns, in the order the user put them.
   *
   * This supersedes the two keys above and does not delete them: an account
   * that has only those is assembled into this shape on READ
   * (`resolveInboxColumns`), so an older build still finds what it wrote and a
   * newer one does not have to migrate anything to be correct.
   *
   * Order is the array's. There is no `sortKey` because the whole list is one
   * stored value — a key that is only ever read back in array order would be a
   * second thing to keep in step with the first.
   */
  inboxColumns?: InboxColumn[];
}

export type ExternalCalendarSyncStatus = "idle" | "syncing" | "success" | "failed" | "hidden" | "disabled";

export interface ExternalCalendar {
  id: string;
  name: string;
  icsUrl: string;
  color: string;
  visible: boolean;
  enabled: boolean;
  syncStatus?: ExternalCalendarSyncStatus;
  lastSyncedAt?: string;
  lastAttemptedAt?: string;
  lastError?: string;
  eventCount?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * An `RRULE`, reduced to the parts this app expands (§9.2.1 of
 * FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md).
 *
 * Not every part of RFC 5545 — a rule using one this cannot honour is refused
 * whole by `parseRRule` rather than approximated, so a meeting shows once on
 * the day it was created instead of on a dozen wrong days.
 */
export interface IcsRecurrence {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  /** Total occurrences, the master included. Absent = unbounded. */
  count?: number;
  /** Last date the rule may produce, already normalised by `parseIcsDate`. */
  until?: string;
  /** `["MO","WE"]`. Ordinal forms like `2MO` are dropped, not guessed at. */
  byDay?: string[];
  byMonthDay?: number[];
}

export interface ExternalCalendarEvent {
  id: string;
  externalCalendarId: string;
  externalUid: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end?: string;
  allDay: boolean;
  timezone?: string;
  sourceUrl?: string;
  readOnly: true;
  createdAt: string;
  updatedAt: string;
  /**
   * Set on the ONE record that carries a repeating event's rule. Occurrences
   * produced from it do not have it — the rule belongs to the series, not to a
   * date the series produced (`lib/ics/recurrence`).
   */
  recurrence?: IcsRecurrence;
  /** Occurrences the organiser cancelled, as `EXDATE` gave them. */
  exdates?: string[];
  /**
   * Present when this record REPLACES one occurrence of a series — the
   * meeting that moved to Thursday that week. Names the occurrence it stands
   * in for, which is not necessarily the day it now falls on.
   */
  recurrenceId?: string;
  /** Set on an expanded occurrence: the UID of the series it came from. */
  occurrenceOf?: string;
}

// Loose shape for seed/imported/persisted data before normalization: every
// collection may hold partial records and any top-level key may be omitted.
export type RawPlannerData = {
  [K in keyof PlannerData]?: PlannerData[K] extends Array<infer T>
    ? Array<Partial<T>>
    : Partial<PlannerData[K]>;
};

/**
 * A tag as a record rather than a string (TickTick plan §6.45).
 *
 * §1.9 draws the line it exists for: a List is where a Task is, a Tag is what
 * a Task is like. The string form in `Task.tags` cannot carry a colour, be
 * renamed without rewriting every Task that mentions it, or be the subject of
 * its own Scope (§12.10).
 *
 * No owner field. The plan's `owner/workspace scope` is the `user_id` column
 * every table here already has; a second copy inside the record would be one
 * more thing that can disagree with it.
 */
export interface Tag {
  id: string;
  /** As first written. The id is derived from a case-folded form of it. */
  name: string;
  color?: string;
  /** Manual order in the sidebar's Tags section (§2.21). Unused so far. */
  sortKey?: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * What a Task's body is: prose, or a list of small things to tick off.
 *
 * A mode and not two fields, because a Task has ONE body. Storing a
 * description and a checklist side by side would make "which one is the
 * content" a question every reader has to answer, and the two would drift.
 * The conversion between them is a transaction (spec §11), which is why the
 * description survives a switch rather than being thrown away.
 *
 * Absent means `description`, which is what every Task written before this
 * field existed is.
 */
export type TaskContentMode = "description" | "checklist";

/**
 * One line of a Task's checklist (spec §11.2, Chapter 26 §26.4).
 *
 * NOT a Subtask. A Subtask is a Task — it has dates, a priority, tags, and
 * subtasks of its own — and this is text plus a tick. The two look alike on
 * screen and are different records on purpose: §26.4 keeps the legacy
 * `Subtask` promoting to a child Task rather than to one of these, so that
 * one kind of user data does not split into two destinations on a boundary
 * the user never drew.
 *
 * Two divergences from the spec's own shape, both to match conventions this
 * repository already has:
 *
 *   `sortKey` is a NUMBER, on the spaced-key scheme `domain/tasks/sortKey.ts`
 *   already uses for Tasks and `ListSection` for board columns. A second,
 *   string-based ordering would be a second answer to "what comes next".
 *
 *   `completedAt` is `""` when unset, like every other timestamp on a Task,
 *   rather than `null`. One sentinel per repository.
 */
export interface CheckItem {
  id: string;
  /** The Task this line belongs to. A CheckItem is never shared. */
  taskId: string;
  text: string;
  checked: boolean;
  /** "" while unchecked. Set when it is ticked, cleared when it is unticked. */
  completedAt: string;
  /** Manual order within the Task — see domain/tasks/sortKey.ts. */
  sortKey: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One Task carrying one Tag (§6.45).
 *
 * §6.46 wants UNIQUE(taskId, tagId). The id is derived from both, so the pair
 * cannot produce two rows however many devices write it — the same trick
 * `TaskDailyPlan` uses for one plan per task per day.
 *
 * This does NOT replace `Task.tags`. Both are true at once for as long as
 * needed: the strings stay readable to older clients and to every screen that
 * has not moved, and the plan's Phase 6 (§6.74) is where one becomes the only
 * source of truth.
 */
/**
 * One stored reminder on one Task (spec §6.2, §6.3).
 *
 * A row rather than a field, because §6.3 forbids the field: a Task can be
 * reminded about a day before AND an hour before, and `Task.reminder` — the
 * single preset this replaces — could hold only one of them. That field is
 * still on `Task` because accounts have it written; `migrateReminders` turns
 * it into one of these on load and nothing writes a new one.
 *
 * The meaning of the four middle fields lives in `domain/schedule/reminders`
 * as `ReminderSpec`, which this satisfies. Keeping the arithmetic there and
 * the identity here is Chapter 26 §26.6's split at the level of the type: the
 * domain says when this falls, and never whether it was delivered.
 */
export interface Reminder {
  id: string;
  taskId: string;
  type: "relative" | "absolute";
  /** Minutes before the Task's start. Null for an absolute reminder. */
  offsetMinutes: number | null;
  /** `YYYY-MM-DDTHH:mm` wall clock, for an absolute reminder. */
  absoluteAt: string | null;
  /** §6.12: the hour a day-based reminder lands on. */
  allDayTime: string | null;
  /** §6.40: a reminder that cannot be delivered is still stored. */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * One Task inside a template — what to make, not a record that exists.
 *
 * No ids, no List, no dates. A template is a shape to reuse, and every one of
 * those three would tie it to the moment it was saved: an id would dangle, a
 * List can be deleted, and a date is in the past by the second use. Where the
 * new Task lands is the create resolver's answer (§12.16), the same as for
 * anything typed into Quick Add.
 */
export interface TaskTemplateItem {
  title: string;
  description: string;
  contentMode?: TaskContentMode;
  priority: TaskPriority;
  /** Tag NAMES, so a template survives a Tag being renamed away and back. */
  tags: string[];
  /** Checklist lines, unticked by definition — nothing here has happened yet. */
  checkItems: string[];
  /** Index into the template's own `items`, or -1 for the root (§15.13's shape). */
  parentIndex: number;
}

/**
 * A saved Task shape, reusable (spec §25.8).
 *
 * Distinct from Duplicate, and §25.8 says why in two lines: Duplicate makes a
 * Task now, this makes a definition to make Tasks from later. The Task it was
 * saved from is untouched and goes on existing.
 */
export interface TaskTemplate {
  id: string;
  name: string;
  /** Root first, then its descendants — the order `subtreeIds` walks. */
  items: TaskTemplateItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskTag {
  id: string;
  taskId: string;
  tagId: string;
  createdAt: string;
}

/** Which part of the day the user put a task in (TickTick plan §6.18). */
export type DailyPlanBucket = "now" | "next" | "later";

/**
 * One task's place in one day's plan (§6.18).
 *
 * Deliberately not a field on Task. §6.19 forbids making now/next/later a
 * permanent property, because it is a decision about a DATE, not about the
 * work: the same task tomorrow starts from the rules again. Today itself
 * stays a Query (§6.17) — this record only says what the user overrode.
 */
export interface TaskDailyPlan {
  id: string;
  taskId: string;
  /** YYYY-MM-DD, in the user's own day, not UTC. */
  planDate: string;
  /**
   * Which part of the day, when the user has said (§6.18 makes it optional).
   *
   * The record carries two facts and only the first is required: `(taskId,
   * planDate)` means the task is PLANNED for that day — which is what puts a
   * task with no due date into Today (§12.5.1) — and `bucket` is the further
   * choice of where in it. A task captured from Today has the first and not
   * the second, and clearing the day's plan resets buckets without removing
   * anything from Today.
   */
  bucket?: DailyPlanBucket;
  /**
   * Manual order within the day (§6.18). Nothing writes it yet — §7.5 keeps
   * free reordering out of the MVP so that dragging a due-only task cannot
   * silently create a plan for it — but the field is part of the schema the
   * plan asks Phase 1 to add ahead of use (§6.68).
   */
  sortKey?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One condition inside a saved Filter (TickTick plan §6.50).
 *
 * Structured, never a query string. §6.50 forbids storing SQL or free text
 * for a reason this repo has already met twice: a stored string can only be
 * run, not read — and the Filter Scope has to be READ to answer §12.11's
 * other question, which is where a Task created inside the Filter should go.
 */
export interface FilterCondition {
  field: "list" | "tag" | "due" | "priority" | "title";
  op: "eq" | "includes" | "on" | "before" | "after" | "contains";
  value: string;
  /** Negates this one condition. Never auto-applied on create (§12.11). */
  not?: boolean;
}

/**
 * What a saved Filter selects (§6.50/§6.51).
 *
 * `version` is required by §6.51 and is not ceremony: conditions will grow,
 * and a spec written by a newer client has to be recognisable as one this
 * build cannot evaluate rather than silently matching nothing.
 *
 * Conditions are ANDed. §6.50's example is `all`, OR groups are not in the
 * MVP, and a Filter that quietly ORed what the user meant to AND would show
 * more than they asked for.
 */
export interface FilterSpec {
  version: 1;
  all: FilterCondition[];
  /** Overrides §12.11's default sort when the user has chosen one. */
  sort?: "due" | "priority" | "created";
}

/**
 * A Filter the user saved (§6.49).
 *
 * A Query, not a container (§12.11): nothing is stored IN a Filter, and
 * deleting one deletes no Task. Only user-made Filters are records — the
 * Smart Lists above them are built in, and §6.48 is explicit that Today must
 * not become a row per user.
 */
export interface SavedFilter {
  id: string;
  name: string;
  spec: FilterSpec;
  /** Order in the sidebar's Filters section (§2.23). */
  sortKey?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A group of Lists in the Tasks sidebar (TickTick plan §6.33-§6.35, D18).
 *
 * Presentation, not hierarchy. The domain already has a `Folder` inside a
 * Project, and the plan deliberately does not reuse it: this one exists so a
 * user can put their own Lists side by side in the sidebar regardless of
 * which Project owns them, and moving a List in or out changes nothing about
 * the Project (D19).
 *
 * Groups Lists only — never Tasks (§6.35) — and does not nest, which is why
 * there is no `parentFolderId` here.
 */
export interface SidebarFolder {
  id: string;
  name: string;
  /** Order among the sidebar's groups. Ties fall back to name. */
  sortKey?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A Board column inside one List (TickTick plan §6.26/§6.27).
 *
 * The plan draws a hard line between the two Boards: an Inbox Board column is
 * a DATE bucket, derived and stored nowhere, while a List Board column is a
 * user-made thing with a name — and only that second kind is a record (§6.24,
 * D24). A Section therefore never exists outside the List that owns it.
 *
 * `Task.sectionId` points here, and nothing points back: a Section does not
 * list its Tasks, so moving a Task between columns writes one task row rather
 * than editing two collections.
 */
export interface ListSection {
  id: string;
  /** The List this Section is a column of. A Section is never shared (§6.28). */
  listId: string;
  name: string;
  /** Column order within the List. Ties fall back to name. */
  sortKey?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerData {
  tasks: Task[];
  projects: Project[];
  subtasks: Subtask[];
  /** Checklist lines, keyed to their Task by `taskId` (spec §11.3). */
  checkItems: CheckItem[];
  focusSessions: FocusSession[];
  activeSessionId: string;
  /** Preserved, never read — see StoredGoal. */
  learningPaths: StoredGoal[];
  spaces: Space[];
  folders: Folder[];
  lists: List[];
  sidebarFolders: SidebarFolder[];
  listSections: ListSection[];
  savedFilters: SavedFilter[];
  dailyPlans: TaskDailyPlan[];
  tags: Tag[];
  taskTags: TaskTag[];
  /** Reminders, keyed to their Task by `taskId` (spec §6.3). */
  reminders: Reminder[];
  /** Saved Task shapes, reusable (spec §25.8). */
  taskTemplates: TaskTemplate[];
  settings: PlannerSettings;
  appSettings: AppSettings;
}

export type PageId =
  | "today"
  | "focus"
  | "board"
  | "settings"
  | "calendar";

export interface TaskDraft {
  title: string;
  description?: string;
  dueDate?: string;
  startTime?: string;
  endTime?: string;
  projectId?: string;
  categoryId?: string;
  parentTaskId?: string;
  /** Keeps a child in the same List as its parent (domain/tasks/children.ts). */
  listId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  tags?: string[];
  notes?: string;
  estimatedMinutes?: number;
  actualSeconds?: number;
  activeSessionId?: string;
  lastFocusedAt?: string;
  waitingReason?: string;
  waitingFollowUpDate?: string;
  blockedByTaskId?: string;
  repeatType?: RepeatType;
  repeatInterval?: number;
  repeatDays?: number[];
  repeatEndDate?: string;
  reminder?: string;
}
