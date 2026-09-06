import { useEffect } from "react";
import { CALLBACK_LANDING_PATH, CALLBACK_ROUTE, parseCallback, resolveCallback } from "../../domain/calendar/googleSync/connectFlow";
import { readPendingConnect } from "../../lib/googleCalendar";
import { platform } from "../../platform";

/** Bring the callback to Settings even after the user leaves the calendar tab. */
export function routeGoogleCalendarReturn(raw: string | null) {
  const callback = parseCallback(raw);
  if (!callback || resolveCallback(readPendingConnect(), callback).kind === "ignored") return;
  const params = new URLSearchParams({ state: callback.nonce });
  if (callback.code) params.set("code", callback.code);
  if (callback.error) params.set("error", callback.error);
  window.history.replaceState(null, "", `${CALLBACK_LANDING_PATH}#${CALLBACK_ROUTE}?${params}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new Event("hashchange"));
}

export function GoogleCalendarReturn() {
  useEffect(() => {
    if (platform.kind !== "desktop") return;
    let alive = true;
    let off: (() => void) | undefined;
    const take = async () => routeGoogleCalendarReturn(await platform.deepLink.take());
    void (async () => {
      // Subscribe first so a callback cannot arrive between draining and listening.
      const unsubscribe = await platform.deepLink.subscribe(() => { void take().catch(console.error); });
      if (!alive) { unsubscribe(); return; }
      off = unsubscribe;
      await take();
    })().catch(console.error);
    return () => { alive = false; off?.(); };
  }, []);
  return null;
}
