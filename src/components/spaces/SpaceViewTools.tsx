// The controls a Space view needs around it, once the listing itself is a
// view (SPACES_CLICKUP_UI_DESIGN U4).
//
// SpaceGoalsTab held three things at once: a list of goals, a way to add one,
// and the Space's status set. Only the first was a screen — the engine renders
// it now. The other two are controls, and they moved here rather than being
// deleted with the component that happened to house them.
//
// Status editing lands properly in Space settings (§3, step U-5). Until then it
// stays reachable, because the alternative is a Space whose columns can be
// created but never renamed.
import { useState } from "react";
import type { CustomStatus } from "../../types";
import { useT } from "../../i18n";

export function GoalQuickAdd({ onCreate }: { onCreate: (goal: string) => void }) {
  const { t } = useT();
  const [value, setValue] = useState("");
  return (
    <form
      className="sdv-view-add"
      onSubmit={(event) => {
        event.preventDefault();
        const goal = value.trim();
        if (!goal) return;
        onCreate(goal);
        setValue("");
      }}
    >
      <input
        value={value}
        placeholder={t("spaceGoals.goalPlaceholder")}
        aria-label={t("spaceGoals.goalPlaceholder")}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // The Enter an IME sends to commit a composition would otherwise
          // submit a half-typed name.
          if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
        }}
      />
      <button type="submit">+ {t("spaceGoals.addGoal")}</button>
    </form>
  );
}

/**
 * The Space's own columns. Only the ones the user added appear — the six
 * defaults are the app's and have no name to change.
 */
export function StatusManager({
  statuses,
  onCreate,
  onRename,
  onReorder,
  onArchive,
}: {
  statuses: CustomStatus[];
  onCreate: (name: string) => void;
  onRename: (statusId: string, name: string) => void;
  onReorder: (statusId: string, order: number) => void;
  onArchive: (statusId: string) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const active = statuses.filter((status) => !status.archivedAt).sort((a, b) => a.order - b.order);

  return (
    <div className="sdv-statuses">
      <button type="button" className="sdv-statuses-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t("spaceGoals.status")} {active.length > 0 ? `(${active.length})` : ""}
      </button>
      {open ? (
        <div className="sdv-statuses-body">
          {active.map((status, index) => (
            <div key={status.id} className="sdv-status-row">
              <input
                defaultValue={status.name}
                aria-label={t("spaceGoals.statusName")}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== status.name) onRename(status.id, name);
                }}
              />
              <button type="button" disabled={index === 0} onClick={() => onReorder(status.id, status.order - 1)}>↑</button>
              <button type="button" disabled={index === active.length - 1} onClick={() => onReorder(status.id, status.order + 1)}>↓</button>
              <button type="button" onClick={() => onArchive(status.id)}>{t("common.archive")}</button>
            </div>
          ))}
          <form
            className="sdv-status-add"
            onSubmit={(event) => {
              event.preventDefault();
              const name = value.trim();
              if (!name) return;
              onCreate(name);
              setValue("");
            }}
          >
            <input
              value={value}
              placeholder={t("spaceGoals.statusPlaceholder")}
              aria-label={t("spaceGoals.statusPlaceholder")}
              onChange={(event) => setValue(event.target.value)}
            />
            <button type="submit">+ {t("spaceGoals.addStatus")}</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
