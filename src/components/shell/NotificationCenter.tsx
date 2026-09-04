// The bell in the Rail, and what it opens
// (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §3.3, §4).
//
// Two tabs over two very different sources. `Notifications` reads a store this
// device writes when it tells the user something — the only record that a
// reminder ever fired, because `useReminders` is a foreground poll and a
// reminder due while the app was closed is delivered nowhere. `Activities`
// reads nothing at all: it is derived from timestamps already on the records
// (`accountActivity`), which is why it shows work done on another device while
// this one was shut.
//
// The trigger lives here rather than in `GlobalRail` because `PopoverTrigger`
// draws its own `<button>` and owns the `aria-expanded` wiring; the Rail
// exports `RailIcon` so what lands in its slot still looks like a Rail item.
import { useEffect, useMemo, useState } from "react";
import type { CheckItem, FocusSession, Task } from "../../types";
import { useT } from "../../i18n";
import { Popover, PopoverContent, PopoverTrigger } from "../floating";
import { RailIcon } from "./GlobalRail";
import { markNotificationsRead, useNotifications, useUnreadNotificationCount } from "../../lib/notificationStore";
import { accountActivity } from "../../domain/notifications/accountActivity";

type Tab = "notifications" | "activities";

interface NotificationCenterProps {
  tasks: Task[];
  checkItems: CheckItem[];
  focusSessions: FocusSession[];
  /** Opens the task a row is about; absent rows simply do not act. */
  onOpenTask?: (taskId: string) => void;
}

export function NotificationCenter({
  tasks,
  checkItems,
  focusSessions,
  onOpenTask,
}: NotificationCenterProps) {
  const { t, lang } = useT();
  const unread = useUnreadNotificationCount();

  return (
    <Popover placement="right-end" offset={10}>
      <PopoverTrigger
        className="rail-item rail-bell"
        // §6: the count is in the name as well as on the badge — a badge is a
        // picture, and the number is a fact a screen reader is owed.
        aria-label={unread > 0 ? t("rail.notificationsUnread", { count: unread }) : t("rail.notifications")}
      >
        <RailIcon name="bell" />
        {unread > 0 ? (
          <span className="rail-badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
        <span className="rail-tip" role="tooltip">
          {t("rail.notifications")}
        </span>
      </PopoverTrigger>
      <PopoverContent className="ntf-panel" label={t("rail.notifications")}>
        <NotificationPanel
          tasks={tasks}
          checkItems={checkItems}
          focusSessions={focusSessions}
          onOpenTask={onOpenTask}
          lang={lang}
          t={t}
        />
      </PopoverContent>
    </Popover>
  );
}

interface PanelProps extends NotificationCenterProps {
  lang: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function NotificationPanel({ tasks, checkItems, focusSessions, onOpenTask, lang, t }: PanelProps) {
  const [tab, setTab] = useState<Tab>("notifications");
  const notifications = useNotifications();

  /**
   * Opening the panel is the read (§3.3).
   *
   * Once, on mount — the surface is unmounted when it closes, so this runs per
   * opening. A notification that arrives while the panel is open stays unread
   * until the next open, which is honest: nobody read it.
   */
  useEffect(() => {
    markNotificationsRead();
  }, []);

  // Only while the Activities tab is the one being looked at: this walks every
  // task, and the panel opens on Notifications.
  const activities = useMemo(
    () => (tab === "activities" ? accountActivity({ tasks, checkItems, focusSessions }) : []),
    [tab, tasks, checkItems, focusSessions],
  );

  const when = useMemo(
    () =>
      new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [lang],
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "notifications", label: t("notifications.tabNotifications") },
    { id: "activities", label: t("notifications.tabActivities") },
  ];

  function onTabKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = tabs.findIndex((entry) => entry.id === tab);
    const next = event.key === "ArrowRight" ? index + 1 : index - 1;
    setTab(tabs[(next + tabs.length) % tabs.length].id);
  }

  return (
    <div className="ntf-body">
      <div className="ntf-tabs" role="tablist" aria-label={t("rail.notifications")} onKeyDown={onTabKey}>
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`ntf-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`ntf-panel-${entry.id}`}
            /* Roving focus: only the selected tab is in the tab order, and the
               arrows move between them (§6). */
            tabIndex={tab === entry.id ? 0 : -1}
            className={tab === entry.id ? "is-selected" : ""}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "notifications" ? (
        <div className="ntf-list" role="tabpanel" id="ntf-panel-notifications" aria-labelledby="ntf-tab-notifications">
          {notifications.length === 0 ? (
            <Empty title={t("notifications.empty")} body={t("notifications.emptyBody")} />
          ) : (
            <ol>
              {notifications.map((entry) => {
                const openable = Boolean(entry.targetId && onOpenTask);
                return (
                  <li key={entry.id} className={`ntf-row is-${entry.kind}`}>
                    {/* A row is only a button when it has somewhere to go —
                        a control that looks pressable and does nothing is
                        worse than plain text. */}
                    {openable ? (
                      <button type="button" onClick={() => onOpenTask?.(entry.targetId as string)}>
                        <NotificationBody entry={entry} when={when} />
                      </button>
                    ) : (
                      <div>
                        <NotificationBody entry={entry} when={when} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : (
        <div className="ntf-list" role="tabpanel" id="ntf-panel-activities" aria-labelledby="ntf-tab-activities">
          {activities.length === 0 ? (
            <Empty title={t("notifications.activitiesEmpty")} body={t("notifications.activitiesEmptyBody")} />
          ) : (
            <ol>
              {activities.map((entry) => (
                <li key={entry.id} className="ntf-row is-activity">
                  <button type="button" onClick={() => onOpenTask?.(entry.taskId)}>
                    <span className="ntf-title">{entry.taskTitle}</span>
                    <span className="ntf-text">
                      {t(`tasks.activity.${entry.kind}`, { detail: entry.detail ?? "" })}
                    </span>
                    <time dateTime={entry.at}>{when.format(new Date(entry.at))}</time>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBody({
  entry,
  when,
}: {
  entry: { title: string; body: string; at: string };
  when: Intl.DateTimeFormat;
}) {
  return (
    <>
      <span className="ntf-title">{entry.title}</span>
      <span className="ntf-text">{entry.body}</span>
      {/* The machine-readable value beside the human one, as the Task activity
          panel does: the formatted string is one locale's and says nothing a
          screen reader or a copy-paste can use. */}
      <time dateTime={entry.at}>{when.format(new Date(entry.at))}</time>
    </>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="ntf-empty">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
