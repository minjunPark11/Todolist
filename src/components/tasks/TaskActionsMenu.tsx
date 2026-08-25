// The Detail's More trigger and the menu under it (spec §15.2, §15.3).
//
// It draws whatever the registry hands it and knows nothing about what a Task
// is — which is the point of §15.63: this and the row's right-click menu show
// the same actions because they are given the same list, not because two
// people remembered to keep two lists in step.
//
// A `Popover` rather than the pointer-anchored `FloatingMenu` the row menu
// uses, because this one HAS a trigger (§19.8). That is not a style choice:
// `FloatingMenu` deliberately reports no trigger (§19.42), so a click on ⋯
// while its menu was open would count as an outside click, dismiss the menu,
// and then be handled by the button — which reopens it. The ⋯ would look like
// it had stopped closing.
import type { TaskActionGroup, TaskActionId } from "../../domain/tasks/actions";
import { Popover, PopoverContent, PopoverTrigger, usePopoverSurface } from "../floating";
import { useT } from "../../i18n";

export interface TaskActionsMenuProps {
  /** §19.74: the Detail moving to another Task closes this with it. */
  taskId: string;
  title: string;
  groups: TaskActionGroup[];
  onRun: (id: TaskActionId) => void;
  /** §19.32's fallback, for when a Task switch takes the trigger away. */
  restoreFocusTo?: () => HTMLElement | null;
}

export function TaskActionsMenu({
  taskId,
  title,
  groups,
  onRun,
  restoreFocusTo,
}: TaskActionsMenuProps) {
  const { t } = useT();
  const label = t("tasks.rowMenu", { title });

  return (
    <Popover type="menu" placement="bottom-end" ownerTaskId={taskId} restoreFocusTo={restoreFocusTo}>
      {/* §15.44: ⋯ is the trigger's whole face, so the name it is announced by
          has to carry the meaning the glyph does not. */}
      <PopoverTrigger className="tm-drawer-more" aria-label={t("common.more")}>
        ⋯
      </PopoverTrigger>
      <PopoverContent label={label} role="menu" className="ff-context-menu">
        <TaskActionItems groups={groups} onRun={onRun} />
      </PopoverContent>
    </Popover>
  );
}

/** Separate so a chosen item can close the surface it is inside (§19.90). */
function TaskActionItems({
  groups,
  onRun,
}: {
  groups: TaskActionGroup[];
  onRun: (id: TaskActionId) => void;
}) {
  const { t } = useT();
  const { close } = usePopoverSurface();

  return (
    <>
      {groups.map((group, index) => (
        <div key={group.id} className="ff-context-menu-section" role="group">
          {index > 0 ? <div className="ff-context-menu-divider" role="separator" /> : null}
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              aria-disabled={item.disabledReasonKey ? true : undefined}
              className={`ff-context-menu-item${item.danger ? " is-danger" : ""}${item.disabledReasonKey ? " is-disabled" : ""}`}
              onClick={() => {
                if (item.disabledReasonKey) return;
                // Closed before the command runs, for the reason kit's menu
                // documents: several of these take the Detail away, and focus
                // restored afterwards would have nowhere to go.
                close();
                onRun(item.id);
              }}
            >
              <span className="ff-context-menu-label">
                {t(item.labelKey)}
                {item.disabledReasonKey ? <small>{t(item.disabledReasonKey)}</small> : null}
              </span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
