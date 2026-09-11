// Context Quick Add (TickTick plan Implementation Phase 4, §16.27, §8.8).
//
// It decides nothing. `resolveCreateContext` says which List the task goes in,
// what still has to be answered first, and whether the day gets a plan record;
// this component asks for the missing answers and hands the resolution back.
// §12.16 exists because there are many `+ 작업` entry points and each one that
// works the owner out for itself is a copy of the rule that can drift.
import { useCallback, useEffect, useRef, useState } from "react";
import type { List, SavedFilter, SidebarFolder, Tag, TaskPriority } from "../../types";
import type { TaskScopeRef } from "../../domain/tasks/scopeRegistry";
import { canCommit, resolveCreateContext, type CreateResolution } from "../../domain/tasks/createResolver";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { Popover, PopoverContent, PopoverTrigger } from "../floating";
import { QuickAddMenu } from "./QuickAddMenu";
import { QuickAddDate } from "./QuickAddDate";
import { normalizeSchedule, scheduleToTaskPatch, type Schedule } from "../../domain/schedule";
import { formatDate } from "../../utils/date";
import { splitInlineTags, tagKeyFor } from "../../domain/tags/tags";
import { useT } from "../../i18n";

interface TaskQuickAddProps {
  scope: TaskScopeRef;
  /**
   * Every live List, so the field can say WHERE the task will land.
   *
   * The resolver already answers that (`targetListId`) and nothing here
   * decides it — this is only the name to put in the words
   * (TICKTICK_COMPONENT_10 §10.3).
   */
  lists: List[];
  inboxListId: string;
  today: string;
  /** The Lists inside the current Folder — the only ones it may offer (§12.4). */
  folderLists: List[];
  /** The sidebar's groups, so the List submenu draws the same headings the
      Detail's picker does (§13.9). */
  folders: SidebarFolder[];
  tags: Tag[];
  /** Read by the Filter Scope to decide the owner List and the patch (§12.11). */
  savedFilters: SavedFilter[];
  /**
   * A title captured elsewhere — today, the palette (§10.41/§10.42).
   *
   * It is put in the field and left there. §10.42 forbids creating the Task
   * outright: the user has to be able to see where it is going and add a date
   * before committing, which is the whole difference between capture and a
   * silent write.
   */
  draftTitle?: string;
  onCreate: (title: string, resolution: CreateResolution) => void;
  /** §25.8's saved shapes, for the ones that can be started from here. */
}

/**
 * Which key the trigger prints.
 *
 * `navigator.platform` is deprecated and `userAgentData` is not everywhere, so
 * this reads whichever is present and falls back to the Ctrl label — being
 * wrong about the glyph on an unknown platform is better than throwing on one.
 */
function isMac(): boolean {
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (!nav) return false;
  const platform =
    (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    nav.platform ??
    "";
  return /mac/i.test(platform);
}

export function TaskQuickAdd({
  scope,
  lists,
  inboxListId,
  today,
  folderLists,
  folders,
  tags,
  savedFilters,
  draftTitle,
  onCreate,
}: TaskQuickAddProps) {
  const { t, lang } = useT();
  const [title, setTitle] = useState("");
  // Only when a NEW draft arrives, so typing over a captured title is not
  // undone by the next render.
  useEffect(() => {
    if (draftTitle) setTitle(draftTitle);
  }, [draftTitle]);

  /**
   * The draft (QUICK_ADD_INPUT_BOX_DESIGN.md §5).
   *
   * Every field here is something the Scope was already deciding SILENTLY
   * through `resolveCreateContext` — which List, which day, which tags. The
   * draft does not replace that answer, it is laid OVER it at commit time
   * (§5.1), so a value nobody touched still comes from the Scope.
   *
   * `chosenDate` is back after being removed. The control that went was the
   * one that BLOCKED the form (§12.6's required date); this one blocks
   * nothing — leave it alone and Enter behaves exactly as it did.
   */
  const [chosenListId, setChosenListId] = useState("");
  /**
   * The whole schedule, not a day (§6.4).
   *
   * The chip opens the app's own editor, so what comes back can carry a start
   * date, a block of time, a repeat and reminders. Null while nobody has
   * opened it — which is what keeps the Scope's own answer in charge.
   */
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [isNote, setIsNote] = useState(false);
  /**
   * Idle or editing (POLISHED_REFERENCE_PARITY_DESIGN.md §6.1b).
   *
   * The reference draws a 42px row that says `할 일 추가` and nothing else,
   * and REPLACES it with the field when it is pressed. That is a different
   * claim from the always-open form this had: an open field is a screen asking
   * to be typed into, and a list you came to read should not open by asking.
   *
   * The two never coexist — the mockup toggles `display` between them — so
   * this is one state and not a `.is-focused` class on a field that is always
   * there.
   */
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLInputElement | null>(null);

  /* Both of these stand ABOVE `resolution.enabled`'s `return null` below, and
     that is the whole point of where they are.

     They were under it at first. A Scope that takes no new Task — Completed,
     the Trash — returns null there, so on those screens the two hooks never
     ran and the hook count changed between renders: "Rendered fewer hooks than
     expected", and the app came down. It survived every desktop test and fell
     over on the first navigation from the mobile drawer to Completed, which is
     where `navShell.spec.ts` CS-09 caught it.

     A hook cannot sit behind a conditional return. `close()` is a plain
     function and could live anywhere; it stays here so the pair reads
     together. */
  const open = useCallback(() => {
    setEditing(true);
    // After the field exists. `setEditing` has not painted yet at this point,
    // so focusing here would be focusing nothing.
    window.setTimeout(() => field.current?.focus(), 0);
  }, []);

  function close() {
    setEditing(false);
    setTitle("");
  }

  /* §2.7's `⌘N`. The mockup prints the shortcut on the trigger, which is a
     promise; this is the half that keeps it.

     Not while something else is being typed into — a Task title, a note, the
     search field — or the shortcut would interrupt the writing it is offering
     to start. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "n") return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) return;
      event.preventDefault();
      open();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);


  const resolution = resolveCreateContext(scope, {
    inboxListId,
    chosenDate: schedule?.dueDate ?? "",
    today,
    folderListIds: folderLists.map((list) => list.id),
    chosenListId,
    savedFilters,
  });

  if (!resolution.enabled) return null;

  /**
   * "기본함에 할 일 추가", or the plain words where no List is settled yet.
   *
   * Where a task goes was the one thing this screen never said. Today, a Tag
   * and a Filter all resolve to a List the reader cannot see, and the answer
   * arrives after the task exists. Now it is in the field they are about to
   * type in (Appendix A 4).
   */
  const target = resolution.targetListId
    ? lists.find((list) => list.id === resolution.targetListId)
    : undefined;
  const label = target
    ? t("tasks.addPlaceholderIn", {
        list: listDisplayName(target, t("tasks.defaultList"), t("tasks.inbox")),
      })
    : t("tasks.addPlaceholder");

  const needsDate = resolution.requiredBeforeCommit.includes("date");
  const needsList = resolution.requiredBeforeCommit.includes("list");
  const ready = Boolean(title.trim()) && canCommit(resolution);

  /**
   * The day this task will get, as the resolution already decided it (§3.1).
   *
   * The chip is not a new decision — Upcoming has been writing
   * `dueDate: today` on its own since §12.6 was lifted, and Today has been
   * planning the day. This is that answer, said out loud, in the place where
   * it can also be changed.
   */
  const plannedDate =
    schedule?.dueDate || resolution.dailyPlan?.planDate || resolution.patch.dueDate || "";

  /**
   * What the editor's answer becomes on the record (§6.4).
   *
   * `scheduleToTaskPatch` is the same conversion `updateTaskSchedule` uses, so
   * a schedule set here and a schedule set in the Detail write the same fields
   * — including the repeat, which lives on the Task. Reminders do not: they
   * are rows of their own, so they travel beside the patch and are written
   * once the task has an id.
   */
  const scheduleWrite = schedule ? normalizeSchedule(schedule) : null;

  /**
   * `#` in the field, as the title it leaves and the tags it named.
   *
   * Read on every keystroke rather than at commit, because the hint under the
   * field has to say what will happen BEFORE it happens — a token that
   * silently disappears from the title at Enter is a typo as far as the reader
   * can tell.
   */
  const inline = splitInlineTags(title);
  const willTag = [...tagNames, ...inline.tags].filter(
    (name, index, all) => all.findIndex((other) => tagKeyFor(other) === tagKeyFor(name)) === index,
  );

  function commit() {
    if (!ready) return;
    // §5.1: the Scope first, the person second. The Scope's own patch — a
    // Filter's fields, Upcoming's date — survives everything the draft does
    // not explicitly say.
    onCreate(inline.title, {
      ...resolution,
      targetListId: chosenListId || resolution.targetListId,
      patch: {
        ...resolution.patch,
        ...(scheduleWrite ? scheduleToTaskPatch(scheduleWrite) : {}),
        ...(priority !== "none" ? { priority } : {}),
        ...(isNote ? { kind: "note" as const } : {}),
      },
      ...(willTag.length > 0 ? { applyTagNames: willTag } : {}),
      ...(scheduleWrite && scheduleWrite.reminders.length > 0
        ? { reminders: scheduleWrite.reminders }
        : {}),
    });
    // The date, the List, the priority, the tags and the mode stay: capturing
    // several tasks into the same day or the same List is the common case, and
    // re-answering per row is a tax (§5.2).
    setTitle("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    commit();
  }

  /* The idle half (§6.1b). A button, not a styled div: it is pressed, it takes
     focus, and `⌘N` and a click have to reach the same thing. */
  if (!editing) {
    return (
      <div className="tm-quickadd is-idle">
        <button
          type="button"
          className="tm-quickadd-trigger"
          onClick={open}
          /* The name is the sentence, not the sentence plus a keycap. Read
             out, "Add a task to Inbox ⌘N" is the shortcut pronounced as part
             of the label; `aria-keyshortcuts` is where that belongs, and the
             kbd is then decoration. */
          aria-label={label}
          aria-keyshortcuts={isMac() ? "Meta+N" : "Control+N"}
        >
          <span className="tm-quickadd-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" focusable="false">
              <path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="tm-quickadd-trigger-label">{label}</span>
          <kbd className="tm-quickadd-key" aria-hidden="true">
            {isMac() ? "⌘N" : "Ctrl+N"}
          </kbd>
        </button>
      </div>
    );
  }

  return (
    <form className="tm-quickadd is-editing" onSubmit={submit}>
      {/* One quiet row, which is what the reference draws and what this was
          not (TICKTICK_COMPONENT_10 §10.1): a bordered field beside a filled
          accent button made the top of every list a FORM, and the brightest
          thing on a screen someone came to read was "type here".

          The box is the row. What the Scope additionally needs — a Folder's
          List question and the hints — is under it, so the common case
          (Today, the Inbox, a List) is this line alone. */}
      <div className={`tm-quickadd-box${isNote ? " is-note" : ""}`}>
        <div className="tm-quickadd-line">
        {/* Hidden rather than removed while typing: it keeps its width, so the
            words the reader is typing do not jump left as the first letter
            lands.

            A note gets a different glyph and keeps it while typing (§7.2):
            the `+` is a promise that pressing here adds a row, and the note
            icon is a statement about what KIND of thing is being written —
            which stays true after the first letter. */}
        <span
          className={`tm-quickadd-icon${title && !isNote ? " is-typing" : ""}`}
          aria-hidden="true"
        >
          {isNote ? (
            <svg viewBox="0 0 24 24" width="14" height="14" focusable="false">
              <rect x="4.5" y="4" width="15" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.9" />
              <path d="M8 9h8M8 12.5h8M8 16h5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" focusable="false">
              <path
                d="M12 5.5v13M5.5 12h13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
      <input
        ref={field}
        className="tm-quickadd-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        /* Escape is the way back out (§2.7). It does NOT commit — leaving by
           the door marked cancel and finding the row added anyway is the
           worst of both. */
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
        placeholder={isNote ? t("tasks.quickAdd.notePlaceholder") : label}
        aria-label={isNote ? t("tasks.quickAdd.notePlaceholder") : label}
        /**
         * Leaving the field commits what is in it. Typing a task and clicking
         * away is not a change of mind — it reads as "done", and asking for a
         * button press afterwards is asking twice.
         *
         * Moving WITHIN the form is not leaving it: the List select and the
         * Add button are both part of answering the same question, and a blur
         * onto them would commit half an answer and then be committed again.
         * A click on nothing in particular has no `relatedTarget`, and that is
         * the case this exists for.
         */
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && event.currentTarget.form?.contains(next)) return;
          commit();
          // Back to the trigger once the field is both empty and left. With
          // text in it the commit above just added a row, and staying open is
          // what lets the next one be typed straight away (§5.2's reason for
          // keeping the date and the List).
          if (!title.trim()) close();
        }}
      />

        </div>

        {/* The trailing slot (QUICK_ADD_INPUT_BOX_DESIGN.md §3).
            It is no longer 0 wide when empty, and the reason it used to be no
            longer holds: what stands here is not a commit button competing
            with Enter, it is what the task will BE — the day it lands on, and
            the way to change everything else about it. */}
        <div className="tm-quickadd-trailing">
          <QuickAddDate
            schedule={schedule}
            value={plannedDate}
            today={today}
            lang={lang}
            onChange={setSchedule}
          />

          <QuickAddMenu
            priority={priority}
            onPriority={setPriority}
            listId={chosenListId || resolution.targetListId || inboxListId}
            /* §12.4: a Folder may offer only its own Lists. The submenu is a
               second door onto the same question the select below asks, so it
               has to refuse the same answers. */
            lists={scope.kind === "folder" ? folderLists : lists}
            folders={folders}
            onList={setChosenListId}
            tags={tags}
            tagNames={tagNames}
            onToggleTag={(name) =>
              setTagNames((current) =>
                current.includes(name) ? current.filter((held) => held !== name) : [...current, name],
              )
            }
            isNote={isNote}
            onToggleNote={() => setIsNote((current) => !current)}
          />

          {/* Only a note gets a button. Its field is a place to write several
              lines, so Enter belongs to the text — which leaves the commit
              with no key of its own and makes the button the way out (§3.2). */}
          {isNote ? (
            <button className="tm-quickadd-submit" type="submit" disabled={!ready}>
              {t("common.add")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="tm-quickadd-extras">

      {/* Which List inside the Folder (FOLDER_TREE_AND_VIEW_DESIGN.md §4.4).
          It used to open on "리스트 선택…" — an empty option standing for "not
          answered yet", which was a state that BLOCKED the form. There is no
          such state now: the resolver takes the top List, so the control opens
          showing the answer and exists to change it.

          Bound to `resolution.targetListId` rather than to `chosenListId`, so
          it says the same thing the placeholder above it says. Reading the raw
          choice would leave it blank while the field claimed a destination. */}
      {scope.kind === "folder" && folderLists.length > 0 ? (
        <select
          className="tm-quickadd-field"
          value={resolution.targetListId ?? ""}
          onChange={(event) => setChosenListId(event.target.value)}
          aria-label={t("tasks.addList")}
        >
          {folderLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      ) : null}

      {/* The `템플릿` menu stood here (§25.8's other end). Templates are gone
          — nothing could create one any more once `템플릿으로 저장` left the ⋯
          menu (TASK_MENU_TRIM_DESIGN.md D2), and a picker that can only ever
          shrink is not a feature, it is a remainder. */}

      {title.trim() && (needsDate || needsList) ? (
        <p className="tm-quickadd-hint" role="status">
          {t(needsDate ? "tasks.needDate" : "tasks.needList")}
        </p>
      ) : null}

      {/* The Scope's own tags and the ones typed into the field, in one line:
          both are answers to "what will this be tagged", and two lines saying
          it would be the same sentence twice. */}
      {resolution.applyTagIds?.length || inline.tags.length ? (
        <p className="tm-quickadd-hint">
          {t("tasks.willTag")}{" "}
          {[
            ...(resolution.applyTagIds ?? []).map(
              (id) => tags.find((tag) => tag.id === id)?.name ?? id,
            ),
            ...inline.tags,
          ].join(", ")}
        </p>
      ) : null}
      </div>
    </form>
  );
}

