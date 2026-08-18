// Context Quick Add (TickTick plan Implementation Phase 4, §16.27, §8.8).
//
// It decides nothing. `resolveCreateContext` says which List the task goes in,
// what still has to be answered first, and whether the day gets a plan record;
// this component asks for the missing answers and hands the resolution back.
// §12.16 exists because there are many `+ 작업` entry points and each one that
// works the owner out for itself is a copy of the rule that can drift.
import { useState } from "react";
import type { List, SavedFilter, Tag } from "../../types";
import type { TaskScopeRef } from "../../domain/tasks/scopeRegistry";
import { canCommit, resolveCreateContext, type CreateResolution } from "../../domain/tasks/createResolver";
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
  onCreate: (title: string, resolution: CreateResolution) => void;
}

export function TaskQuickAdd({
  scope,
  inboxListId,
  today,
  folderLists,
  tags,
  savedFilters,
  onCreate,
}: TaskQuickAddProps) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [chosenDate, setChosenDate] = useState("");
  const [chosenListId, setChosenListId] = useState("");

  const resolution = resolveCreateContext(scope, {
    inboxListId,
    today,
    folderListIds: folderLists.map((list) => list.id),
    chosenListId,
    chosenDate,
    savedFilters,
  });

  if (!resolution.enabled) return null;

  const needsDate = resolution.requiredBeforeCommit.includes("date");
  const needsList = resolution.requiredBeforeCommit.includes("list");
  const ready = Boolean(title.trim()) && canCommit(resolution);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    onCreate(title.trim(), resolution);
    // The date and the List stay: capturing several tasks into the same day or
    // the same List is the common case, and re-answering per row is a tax.
    setTitle("");
  }

  return (
    <form className="tm-quickadd" onSubmit={submit}>
      <input
        className="tm-quickadd-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t("tasks.addPlaceholder")}
        aria-label={t("tasks.addPlaceholder")}
      />

      {/* §12.6 refuses a task with no date here, so the field is part of the
          form rather than a validation message after the fact. */}
      {scope.kind === "upcoming" ? (
        <input
          className="tm-quickadd-field"
          type="date"
          value={chosenDate}
          onChange={(event) => setChosenDate(event.target.value)}
          aria-label={t("tasks.addDate")}
        />
      ) : null}

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
