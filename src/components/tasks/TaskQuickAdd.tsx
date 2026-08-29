// Context Quick Add (TickTick plan Implementation Phase 4, §16.27, §8.8).
//
// It decides nothing. `resolveCreateContext` says which List the task goes in,
// what still has to be answered first, and whether the day gets a plan record;
// this component asks for the missing answers and hands the resolution back.
// §12.16 exists because there are many `+ 작업` entry points and each one that
// works the owner out for itself is a copy of the rule that can drift.
import { useEffect, useState } from "react";
import type { List, SavedFilter, Tag, TaskTemplate } from "../../types";
import type { TaskScopeRef } from "../../domain/tasks/scopeRegistry";
import { canCommit, resolveCreateContext, type CreateResolution } from "../../domain/tasks/createResolver";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";
import { useT } from "../../i18n";

interface TaskQuickAddProps {
  scope: TaskScopeRef;
  inboxListId: string;
  today: string;
  /** The Lists inside the current Folder — the only ones it may offer (§12.4). */
  folderLists: List[];
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
  inboxListId,
  today,
  folderLists,
  tags,
  savedFilters,
  draftTitle,
  onCreate,
  templates,
  onUseTemplate,
}: TaskQuickAddProps) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  // Only when a NEW draft arrives, so typing over a captured title is not
  // undone by the next render.
  useEffect(() => {
    if (draftTitle) setTitle(draftTitle);
  }, [draftTitle]);
  // No `chosenDate`. Nothing here asks for a day any more, and the resolver
  // still takes one for callers that have one of their own (the Board's
  // `일정` column does).
  const [chosenListId, setChosenListId] = useState("");

  const resolution = resolveCreateContext(scope, {
    inboxListId,
    today,
    folderListIds: folderLists.map((list) => list.id),
    chosenListId,
    savedFilters,
  });

  if (!resolution.enabled) return null;

  const needsDate = resolution.requiredBeforeCommit.includes("date");
  const needsList = resolution.requiredBeforeCommit.includes("list");
  const ready = Boolean(title.trim()) && canCommit(resolution);

  function commit() {
    if (!ready) return;
    onCreate(title.trim(), resolution);
    // The date and the List stay: capturing several tasks into the same day or
    // the same List is the common case, and re-answering per row is a tax.
    setTitle("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    commit();
  }

  return (
    <form className="tm-quickadd" onSubmit={submit}>
      <input
        className="tm-quickadd-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t("tasks.addPlaceholder")}
        aria-label={t("tasks.addPlaceholder")}
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

      {/* No date field. It was here because §12.6 refused to commit without
          one, and that refusal is gone — Upcoming defaults to the first day it
          covers. A control whose only job was to unblock the form has nothing
          left to do, and the Task's own date is edited in the Task. */}

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

      <button className="tm-quickadd-submit" type="submit" disabled={!ready}>
        {t("common.add")}
      </button>

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
