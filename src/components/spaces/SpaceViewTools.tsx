// The controls a Space view needs around it, once the listing itself is a
// view (SPACES_CLICKUP_UI_DESIGN U4).
//
// Status editing moved to SpaceDrawers.StatusesDrawer (SPACE_REMOVAL_IA D-3).
import { useState } from "react";
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

