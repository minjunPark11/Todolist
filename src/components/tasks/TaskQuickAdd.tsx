// Context Quick Add (TickTick plan Implementation Phase 4, §16.27, §8.8).
//
// It decides nothing. `resolveCreateContext` says which List the task goes in,
// what still has to be answered first, and whether the day gets a plan record;
// this component asks for the missing answers and hands the resolution back.
// §12.16 exists because there are many `+ 작업` entry points and each one that
// works the owner out for itself is a copy of the rule that can drift.
import { useEffect, useState } from "react";
import type { List, SavedFilter, SidebarFolder, Tag, TaskPriority, TaskTemplate } from "../../types";
import type { TaskScopeRef } from "../../domain/tasks/scopeRegistry";
import { canCommit, resolveCreateContext, type CreateResolution } from "../../domain/tasks/createResolver";
import { listDisplayName } from "../../domain/spaces/hierarchy";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";
import { QuickAddMenu } from "./QuickAddMenu";
import { QuickAddDate } from "./QuickAddDate";
import { normalizeSchedule, scheduleToTaskPatch, type Schedule } from "../../domain/schedule";
import { formatDate } from "../../utils/date";
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
  templates: TaskTemplate[];
  /** Makes the template's Tasks in whatever List this Scope resolves to. */
  onUseTemplate: (templateId: string, resolution: CreateResolution) => void;
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
  templates,
  onUseTemplate,
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

  function commit() {
    if (!ready) return;
    // §5.1: the Scope first, the person second. The Scope's own patch — a
    // Filter's fields, Upcoming's date — survives everything the draft does
    // not explicitly say.
    onCreate(title.trim(), {
      ...resolution,
      targetListId: chosenListId || resolution.targetListId,
      patch: {
        ...resolution.patch,
        ...(scheduleWrite ? scheduleToTaskPatch(scheduleWrite) : {}),
        ...(priority !== "none" ? { priority } : {}),
        ...(isNote ? { kind: "note" as const } : {}),
      },
      ...(tagNames.length > 0 ? { applyTagNames: tagNames } : {}),
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

  return (
    <form className="tm-quickadd" onSubmit={submit}>
      {/* One quiet row, which is what the reference draws and what this was
          not (TICKTICK_COMPONENT_10 §10.1): a bordered field beside a filled
          accent button made the top of every list a FORM, and the brightest
          thing on a screen someone came to read was "type here".

          The box is the row. What the Scope additionally needs — a Folder's
          List question, templates, the hints — is under it, so the common
          case (Today, the Inbox, a List, no templates) is this line alone. */}
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
        className="tm-quickadd-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
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

      {/* §12.4: a Folder holds several Lists and the app must not pick one
          silently, so the question is asked instead of answered. */}
      {scope.kind === "folder" ? (
        <select
          className="tm-quickadd-field"
          value={chosenListId}
          onChange={(event) => setChosenListId(event.target.value)}
          aria-label={t("tasks.addList")}
        >
          <option value="">{t("tasks.addPickList")}</option>
          {folderLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      ) : null}

      {/* §25.8's other end. Absent until there is a template to offer: a
          control that appears and then has nothing behind it is the shape
          §16.28 refuses, and the first thing anyone would do with an empty
          menu is wonder what they did wrong.

          It does not use the title field. A template names its own Tasks, so
          typing a title and then choosing a template would raise a question —
          which one wins — that the reader should not have to think about. */}
      {templates.length > 0 ? (
        <Popover type="menu" placement="bottom-end">
          <PopoverTrigger className="tm-quickadd-templates" aria-label={t("tasks.templateMenu")}>
            {t("tasks.useTemplate")}
          </PopoverTrigger>
          <PopoverContent label={t("tasks.templateMenu")} role="menu" className="ff-context-menu">
            <TemplateChoices
              templates={templates}
              // The same resolution the form would have committed, so a
              // template used in a Folder asks the same question about which
              // List as anything else typed here (§12.4).
              disabled={needsList || needsDate}
              onChoose={(templateId) => onUseTemplate(templateId, resolution)}
            />
          </PopoverContent>
        </Popover>
      ) : null}

      {title.trim() && (needsDate || needsList) ? (
        <p className="tm-quickadd-hint" role="status">
          {t(needsDate ? "tasks.needDate" : "tasks.needList")}
        </p>
      ) : null}

      {resolution.applyTagIds?.length ? (
        <p className="tm-quickadd-hint">
          {t("tasks.willTag")}{" "}
          {resolution.applyTagIds
            .map((id) => tags.find((tag) => tag.id === id)?.name ?? id)
            .join(", ")}
        </p>
      ) : null}
      </div>
    </form>
  );
}

/** Separated so a chosen template can close the surface it is inside (§19.90). */
function TemplateChoices({
  templates,
  disabled,
  onChoose,
}: {
  templates: TaskTemplate[];
  disabled: boolean;
  onChoose: (templateId: string) => void;
}) {
  const { t } = useT();
  const { close } = usePopoverSurface();

  return (
    <>
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          role="menuitem"
          aria-disabled={disabled || undefined}
          className={`ff-context-menu-item${disabled ? " is-disabled" : ""}`}
          onClick={() => {
            if (disabled) return;
            close();
            onChoose(template.id);
          }}
        >
          <span className="ff-context-menu-label">
            {template.name}
            {/* The same explanation the form's own hint gives, in the place
                the reader is looking when they meet the refusal (§15.5). */}
            {disabled ? <small>{t("tasks.needList")}</small> : null}
          </span>
        </button>
      ))}
    </>
  );
}
