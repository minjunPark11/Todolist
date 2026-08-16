// The List view (SPACES_REDESIGN_II §50A), driven by a ViewSpec like the board.
//
// Its job is density: read many Items quickly, compare them, and change a few
// fields without leaving the row. That is why rows are table rows and not
// cards — a card list answers "what is this one" and this screen answers "what
// is here" (§25).
//
// It owns its toolbar state (group / sort / search) because those ARE the
// spec: the control changes `groupBy`, `sort` or `filter.query` and the same
// engine re-answers. Nothing here filters or sorts by hand.
//
// `Assignee` is in §50A's column list and absent here on purpose: a Task has
// no assignee field, and §50A.25 forbids inventing one to satisfy the mockup.
import { useMemo, useState } from "react";
import type { List, Status, Task, TaskPriority } from "../types";
import type { Item } from "../domain/view/item";
import { applyView, type GroupAxis, type GroupContext, type SortKey, type ViewSpec } from "../domain/view/viewSpec";
import { EmptyState } from "./kit";
import { useT } from "../i18n";

/** Only axes the engine can actually group these Items by (§50A.5). */
const GROUP_AXES: GroupAxis[] = ["none", "list", "status", "priority"];
const SORT_KEYS: SortKey[] = ["dueDate", "scheduledDate", "priority", "title"];
const PRIORITIES: TaskPriority[] = ["high", "medium", "low", "none"];

interface TaskListViewProps {
  items: Item[];
  /** Scope and sources; this view overrides groupBy/sort/query from its toolbar. */
  spec: ViewSpec;
  context: GroupContext;
  statuses: Status[];
  lists: List[];
  today: string;
  selectedTaskId?: string;
  onOpenItem: (item: Item) => void;
  /** Canonical write. There is no List-local copy of a Task (§50A.11). */
  onPatchTask: (taskId: string, patch: Partial<Task>) => void;
  /**
   * Separate from `onPatchTask` because a status is not a plain field: a
   * default status writes `status` and clears `statusId`, a named one does the
   * reverse, and `statusPatch` owns that. The caller holds the Task record it
   * needs, so the rule stays in one place instead of being restated here.
   */
  onSetStatus: (item: Item, statusId: string) => void;
  onCreateTask: (title: string) => void;
}

export function TaskListView({
  items,
  spec,
  context,
  statuses,
  lists,
  today,
  selectedTaskId = "",
  onOpenItem,
  onPatchTask,
  onSetStatus,
  onCreateTask,
}: TaskListViewProps) {
  const { t } = useT();
  const [groupBy, setGroupBy] = useState<GroupAxis>("list");
  const [sortKey, setSortKey] = useState<SortKey>(spec.sort.key);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");

  const listName = useMemo(() => new Map(lists.map((list) => [list.id, list.name])), [lists]);
  const statusById = useMemo(() => new Map(statuses.map((status) => [status.id, status])), [statuses]);

  // The toolbar is the spec. Search rides in `filter` so the scope narrows
  // first and the query narrows what is left (§50A.15).
  const effective: ViewSpec = useMemo(
    () => ({ ...spec, filter: { ...spec.filter, query }, groupBy, sort: { key: sortKey } }),
    [spec, query, groupBy, sortKey],
  );

  const groups = useMemo(() => applyView(items, effective, context), [items, effective, context]);
  const shown = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups]);

  function groupLabel(id: string): string {
    if (!id) return t("list.ungrouped");
    if (groupBy === "list") return listName.get(id) ?? t("list.ungrouped");
    if (groupBy === "status") return statusById.get(id)?.label ?? id;
    if (groupBy === "priority") return t(`priority.${id}`);
    return id;
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="tlv">
      <div className="tlv-toolbar">
        <label className="tlv-control">
          <span>{t("list.groupBy")}</span>
          <select value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupAxis)}>
            {GROUP_AXES.map((axis) => (
              <option key={axis} value={axis}>
                {t(`list.axis.${axis}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="tlv-control">
          <span>{t("list.sortBy")}</span>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`list.sort.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <input
          className="tlv-search"
          type="search"
          value={query}
          placeholder={t("list.searchPlaceholder")}
          aria-label={t("list.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {shown === 0 ? (
        <EmptyState title={query ? t("list.noMatches") : t("list.empty")} />
      ) : (
        <div className="tlv-scroll">
          <table className="tlv-table">
            <thead>
              <tr>
                <th className="tlv-check" aria-label={t("list.col.select")} />
                <th className="tlv-title">{t("list.col.task")}</th>
                <th>{t("list.col.list")}</th>
                <th>{t("list.col.status")}</th>
                <th>{t("list.col.due")}</th>
                <th>{t("list.col.priority")}</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.id || "ungrouped"}>
                {groupBy !== "none" ? (
                  <tr className="tlv-group">
                    <th colSpan={6} scope="colgroup">
                      {groupLabel(group.id)} <span className="tlv-count">{group.items.length}</span>
                    </th>
                  </tr>
                ) : null}
                {group.items.map((item) => (
                  <TaskRow
                    key={item.key}
                    item={item}
                    statuses={statuses}
                    listName={listName.get(item.listId) ?? ""}
                    statusLabel={statusById.get(item.statusId)?.label ?? item.statusId}
                    today={today}
                    isSelected={selectedTaskId === item.sourceId}
                    isChecked={selected.has(item.key)}
                    onToggle={() => toggle(item.key)}
                    onOpen={() => onOpenItem(item)}
                    onPatchTask={onPatchTask}
                    onSetStatus={onSetStatus}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      <form
        className="tlv-add"
        onSubmit={(event) => {
          event.preventDefault();
          const title = draft.trim();
          if (!title) return;
          onCreateTask(title);
          setDraft("");
        }}
      >
        <input
          value={draft}
          placeholder={t("list.addPlaceholder")}
          aria-label={t("list.addPlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>

      <p className="tlv-footer">
        {selected.size > 0
          ? t("list.selectedCount", { n: selected.size })
          : t("list.showing", { shown, total: items.length })}
      </p>
    </div>
  );
}

function TaskRow({
  item,
  statuses,
  listName,
  statusLabel,
  today,
  isSelected,
  isChecked,
  onToggle,
  onOpen,
  onPatchTask,
  onSetStatus,
}: {
  item: Item;
  statuses: Status[];
  listName: string;
  statusLabel: string;
  today: string;
  isSelected: boolean;
  isChecked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onPatchTask: (taskId: string, patch: Partial<Task>) => void;
  onSetStatus: (item: Item, statusId: string) => void;
}) {
  const { t } = useT();
  // Only a Task takes these writes. A goal's column is `boardListId` and a
  // milestone has none, so those rows show their values and open instead —
  // half-wiring an editor that silently does nothing is worse than a label.
  const editable = item.source === "task";
  const overdue = Boolean(item.dueDate) && item.dueDate < today && !item.done;

  return (
    <tr className={`tlv-row${isSelected ? " is-selected" : ""}${item.done ? " is-done" : ""}`}>
      <td className="tlv-check">
        <input
          type="checkbox"
          checked={isChecked}
          aria-label={t("list.selectRow", { title: item.title })}
          onChange={onToggle}
        />
      </td>
      <td className="tlv-title">
        <button type="button" className="tlv-link" onClick={onOpen}>
          <span className="tlv-dot" style={{ background: item.color }} aria-hidden="true" />
          {item.title}
        </button>
      </td>
      <td className="tlv-muted">{listName || "—"}</td>
      <td>
        {editable ? (
          <select
            className="tlv-cell-input"
            value={item.statusId}
            aria-label={t("list.col.status")}
            onChange={(event) => onSetStatus(item, event.target.value)}
          >
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="tlv-muted">{statusLabel}</span>
        )}
      </td>
      <td className={overdue ? "tlv-overdue" : ""}>
        {editable ? (
          <input
            className="tlv-cell-input"
            type="date"
            value={item.dueDate}
            aria-label={t("list.col.due")}
            onChange={(event) => onPatchTask(item.sourceId, { dueDate: event.target.value })}
          />
        ) : (
          <span className="tlv-muted">{item.dueDate || "—"}</span>
        )}
      </td>
      <td>
        {editable ? (
          <select
            className="tlv-cell-input"
            value={item.priority}
            aria-label={t("list.col.priority")}
            onChange={(event) => onPatchTask(item.sourceId, { priority: event.target.value as TaskPriority })}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {t(`priority.${priority}`)}
              </option>
            ))}
          </select>
        ) : (
          <span className="tlv-muted">—</span>
        )}
      </td>
    </tr>
  );
}
