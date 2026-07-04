import { useEffect, useState } from "react";
import type { FocusSession } from "../types";

export function getDisplayedFocusSeconds(session: FocusSession | null, nowMs = Date.now()) {
  if (!session) return 0;
  if (session.status !== "running") return session.accumulatedSeconds;
  return session.accumulatedSeconds + Math.max(0, Math.floor((nowMs - new Date(session.startAt).getTime()) / 1000));
}

export function formatFocusDuration(seconds: number, compact = false) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (compact) {
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${secs}s`;
  }

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function useNowTick(enabled: boolean) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  return now;
}
