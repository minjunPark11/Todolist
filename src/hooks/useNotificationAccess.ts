// Whether reminders can be delivered, and asking when it is time to ask
// (spec §6.38, §6.39, §6.40; Chapter 26 §26.6).
//
// This is the near side of §26.6's split. The domain says a reminder exists
// and when it falls; this says whether the OS will carry it. Keeping them
// apart is what lets the panel say "stored, but notifications are off" instead
// of either hiding the reminder or claiming it will arrive.
//
// The timing is §6.39's, and it is the rule the app was breaking: permission
// was requested from `useReminders` on mount, so the browser's prompt appeared
// on first load, before the user had asked for anything. A prompt with no
// context is one people dismiss, and a dismissed prompt is expensive — it is
// the answer for the rest of the session.
import { useCallback, useEffect, useState } from "react";
import { platform } from "../platform";
import type { NotificationAccess } from "../platform/types";

export interface NotificationAccessState {
  access: NotificationAccess;
  /**
   * Ask now, because the user just did something that wants a notification.
   *
   * A no-op unless the answer is still `unasked` — asking a second time after
   * a refusal shows nothing in any browser, and calling it on every toggle
   * would be a request the platform silently drops.
   */
  request: () => void;
}

export function useNotificationAccess(): NotificationAccessState {
  // `unasked` and not `granted` as the initial value: it is the one that makes
  // the panel say nothing until the real answer arrives, and a flash of
  // "notifications are disabled" on every open would be worse than a beat of
  // silence.
  const [access, setAccess] = useState<NotificationAccess>("unasked");

  useEffect(() => {
    let alive = true;
    void platform.notificationAccess().then((next) => {
      if (alive) setAccess(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const request = useCallback(() => {
    setAccess((current) => {
      if (current !== "unasked") return current;
      void platform.requestNotificationPermission().then(setAccess);
      return current;
    });
  }, []);

  return { access, request };
}
