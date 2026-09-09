// Connecting and disconnecting Google Calendar
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.1, §4.4 — M1-4d).
//
// Self-contained, the way `oauth/ConnectedAiCard` is: the connection lives in
// Supabase and the flow lives in `lib/googleCalendar.ts`, so nothing has to be
// threaded down through `SettingsPage`'s props for a feature that draws in one
// place.
//
// It also FINISHES the round trip, which is why the web callback lands on
// `/settings` (`connectFlow.CALLBACK_LANDING_PATH`): the code arrives in the
// fragment, and this is the component mounted to spend it. The desktop path is
// the same code reached by a different road — `platform.deepLink` — because
// Google will not redirect to a custom scheme (§4.4, chain step 1).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CALLBACK_LANDING_PATH,
  consentUrl,
  hrefWithoutCallback,
  newNonce,
  parseCallback,
  resolveCallback,
  type PendingConnect,
} from "../../domain/calendar/googleSync/connectFlow";
import { useT } from "../../i18n";
import { GOOGLE_SYNC_POLICY_EVENT, type GoogleSyncPolicyReason } from "../../domain/calendar/googleSync/protocol";
import {
  disconnect as disconnectGoogle,
  ensureDedicatedCalendar,
  exchangeCodeForAccess,
  GoogleCalendarError,
  GOOGLE_LABELS_STATUS, GOOGLE_SYNC_REQUESTED, GOOGLE_SYNC_FINISHED,
  notifyGoogleConnectionChanged,
  readConnection,
  readPendingConnect,
  writePendingConnect,
  type GoogleConnection,
} from "../../lib/googleCalendar";
import { platform } from "../../platform";
import { supabase } from "../../services/supabaseClient";
import { ConfirmModal } from "../kit";
import { GoogleCalendarSourceList } from "./GoogleCalendarSourceList";
import { GoogleTaskReviewPanel } from "./GoogleTaskReviewPanel";
import { readGoogleTaskSyncState, subscribeGoogleTaskSync } from "../../lib/googleTaskSyncState";

type Status =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "disconnected" }
  | { kind: "connecting" }
  | { kind: "connected"; connection: GoogleConnection };

export function GoogleCalendarCard() {
  const taskSync = useSyncExternalStore(subscribeGoogleTaskSync, readGoogleTaskSyncState, readGoogleTaskSyncState);
  const { t } = useT();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [labelState, setLabelState] = useState<{ supported: boolean | null; overflow: number; failed: boolean } | null>(null);
  const manualSync = useRef(false);
  const policyReason = useRef<GoogleSyncPolicyReason | null>(null);
  useEffect(() => {
    if (status.kind === "connected") return;
    setLabelState(null);
    setSyncing(false);
    manualSync.current = false;
  }, [status.kind]);
  useEffect(() => {
    const onPolicy = (event: Event) => {
      const reason = (event as CustomEvent).detail?.reason;
      if (reason !== null && reason !== "updateRequired" && reason !== "policyUnavailable") return;
      const previous = policyReason.current;
      policyReason.current = reason;
      if (reason) { setError(t(`settings.google.error.${reason}`)); setNotice(""); }
      else if (previous) setError("");
    };
    const onLabels = (event: Event) => setLabelState((event as CustomEvent).detail);
    const onDone = (event: Event) => {
      if (!manualSync.current) return;
      manualSync.current = false;
      setSyncing(false);
      const ok = (event as CustomEvent<{ ok: boolean }>).detail.ok;
      setNotice(ok && !policyReason.current ? t("settings.google.syncDone") : "");
      setError(policyReason.current ? t(`settings.google.error.${policyReason.current}`) : ok ? "" : t("settings.google.error.google"));
    };
    window.addEventListener(GOOGLE_LABELS_STATUS, onLabels);
    window.addEventListener(GOOGLE_SYNC_FINISHED, onDone);
    window.addEventListener(GOOGLE_SYNC_POLICY_EVENT, onPolicy);
    return () => {
      window.removeEventListener(GOOGLE_LABELS_STATUS, onLabels);
      window.removeEventListener(GOOGLE_SYNC_FINISHED, onDone);
      window.removeEventListener(GOOGLE_SYNC_POLICY_EVENT, onPolicy);
    };
  }, [t]);
  const statusRef = useRef(status);
  statusRef.current = status;
  const readVersion = useRef(0);
  /** One consumption point, on both platforms — a code spent twice reads as a
   * failed connection (see `platform/types.ts`, PlatformDeepLink). */
  const consuming = useRef(false);

  /**
   * The sentence to show for a failure — and, for one reason, the detail too.
   *
   * The catalogue can say what every other reason means, because every other
   * reason has one meaning. `rejected` has several: the signing algorithm, an
   * unpublished key, the wrong Supabase project. They are one sentence to the
   * reader and three different fixes to whoever deploys this, and the server
   * already names which one — so that name travels with it rather than being
   * dropped on the floor, which is what left this card saying "sign in first"
   * to someone who was signed in.
   */
  const describe = useCallback(
    (thrown: unknown): string => {
      if (!(thrown instanceof GoogleCalendarError)) return t("settings.google.error.google");
      const sentence = t(`settings.google.error.${thrown.reason}`);
      return thrown.reason === "rejected" && thrown.message ? `${sentence} (${thrown.message})` : sentence;
    },
    [t],
  );

  const finish = useCallback(
    async (code: string) => {
      setStatus({ kind: "connecting" });
      setError("");
      try {
        const accessToken = await exchangeCodeForAccess(code);
        const connection = await ensureDedicatedCalendar(accessToken);
        writePendingConnect(null);
        setStatus({ kind: "connected", connection });
        setNotice(t("settings.google.connected"));
        notifyGoogleConnectionChanged();
      } catch (thrown) {
        writePendingConnect(null);
        if (thrown instanceof GoogleCalendarError && ["identityMismatch", "identityUnavailable", "calendarVerification", "lifecycleBusy", "lifecycleRecovery"].includes(thrown.reason)) {
          // The server retained the old grant. Keep its Disconnect action available.
          try {
            const connection = await readConnection();
            setStatus(connection ? { kind: "connected", connection } : { kind: "disconnected" });
          } catch { setStatus({ kind: "error" }); }
        } else setStatus({ kind: "disconnected" });
        setError(describe(thrown));
      }
    },
    [describe, t],
  );

  /**
   * Reads whatever a callback left behind and acts on it once.
   *
   * `raw` is the whole href on the web and the deep link on the desktop;
   * `parseCallback` reads both. An outcome of `ignored` says nothing and clears
   * nothing — a fragment we did not start is not ours to tidy.
   */
  const consume = useCallback(
    async (raw: string | null) => {
      if (consuming.current) return;
      const outcome = resolveCallback(readPendingConnect(), parseCallback(raw));
      if (outcome.kind === "ignored") return;

      consuming.current = true;
      readVersion.current += 1;
      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(null, "", hrefWithoutCallback(window.location.href));
      }

      if (outcome.kind === "code") await finish(outcome.code);
      else {
        writePendingConnect(null);
        setStatus({ kind: "disconnected" });
        if (outcome.kind === "cancelled") setNotice(t("settings.google.cancelled"));
        else setError(t("settings.google.error.google"));
      }
      consuming.current = false;
    },
    [finish, t],
  );

  /**
   * What is already true, before anything is pressed — and what becomes true
   * afterwards.
   *
   * The sign-in question is asked first, because the answer changes what the
   * card OFFERS rather than only what it says: the connection is stored per
   * FocusFlow account, so with nobody signed in there is no account to attach
   * a Google one to. The share card above says the same thing.
   *
   * Three things were wrong with asking it once.
   *
   * It was asked once. `getSession()` on mount with no `onAuthStateChange`
   * beside it, while `usePlannerData` — the state the rest of the app calls
   * "signed in" — has both. So the card could hold a `false` the app had
   * already moved past, and show "sign in to use this" with the button dead
   * to a reader who was demonstrably signed in, with no way back but leaving
   * the tab and returning.
   *
   * The read could reject. `getSession()` refreshes an expired access token,
   * which is a network round trip; a rejection escaped the async function,
   * `setStatus` was never reached, and `status` stayed `loading` — which
   * renders NOTHING. A slow network did not degrade this card, it deleted it.
   *
   * And `consume` can leave `loading` on its own. A callback that lands before
   * the session read returns draws the card at `signedIn === false`, which is
   * the "please sign in" line, on the one screen the user reached BY signing
   * in to Google. It is transient, and it was the first thing they saw.
   */
  useEffect(() => {
    let alive = true;

    async function readFor(session: unknown) {
      if (!alive) return;
      setSignedIn(Boolean(session));
      const version = ++readVersion.current;
      if (!session) {
        setStatus({ kind: "disconnected" });
        return;
      }
      if (consuming.current || statusRef.current.kind === "connecting") return;
      try {
        const connection = await readConnection();
        if (!alive || version !== readVersion.current || consuming.current) return;
        setError("");
        setStatus(connection ? { kind: "connected", connection } : { kind: "disconnected" });
      } catch (thrown) {
        if (alive && version === readVersion.current && !consuming.current) {
          setStatus({ kind: "error" });
          setError(describe(thrown));
        }
      }
    }

    void (async () => {
      try {
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        await readFor(session);
      } catch {
        // Whatever went wrong, the card still has to appear. Treated as
        // signed out, which is the state a reader can act on — the button
        // says so and the note says where to go.
        if (alive) {
          setStatus({ kind: "error" });
          setError(t("settings.google.error.network"));
        }
      }
    })();

    // The same channel `usePlannerData` listens on, so the two cannot
    // disagree about whether there is an account. It also carries
    // `INITIAL_SESSION`, which is the answer arriving late rather than never.
    // Supabase queries must run after the auth callback releases its lock.
    const listener = supabase?.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => { if (alive) void readFor(session); }, 0);
    });

    return () => {
      alive = false;
      listener?.data.subscription.unsubscribe();
    };
  }, [refresh, describe, t]);

  // Both platforms arrive as a fragment; the root bridge owns native delivery.
  useEffect(() => {
    const onReturn = () => { void consume(window.location.href); };
    onReturn();
    window.addEventListener("hashchange", onReturn);
    return () => window.removeEventListener("hashchange", onReturn);
  }, [consume]);

  async function connect() {
    setError("");
    setNotice("");
    readVersion.current += 1;
    try {
      const pending: PendingConnect = {
        nonce: newNonce((size) => crypto.getRandomValues(new Uint8Array(size))),
        platform: platform.kind,
      };
      writePendingConnect(pending);
      setStatus({ kind: "connecting" });

      const url = consentUrl(pending);
      if (platform.kind === "desktop") await platform.openExternal(url);
      else window.location.assign(url);
    } catch (thrown) {
      writePendingConnect(null);
      setStatus({ kind: "disconnected" });
      setError(describe(thrown));
    }
  }

  async function confirmDisconnect() {
    setConfirmingDisconnect(false);
    setError("");
    setNotice("");
    try {
      const { revoked } = await disconnectGoogle();
      setStatus({ kind: "disconnected" });
      notifyGoogleConnectionChanged();
      setNotice(revoked ? t("settings.google.disconnected") : t("settings.google.disconnectedNotRevoked"));
    } catch (thrown) {
      setError(describe(thrown));
    }
  }

  // Keep the card visible while checking, without claiming it is disconnected.
  const busy = status.kind === "connecting" || status.kind === "loading";

  return (
    <section className="ff-settings-card ff-cal-card">
      <div className="ff-cal-card-head">
        <span className="ff-cal-card-icon" aria-hidden="true">
          <GoogleMark />
        </span>
        <div className="ff-cal-card-text">
          <strong>{t("settings.google.title")}</strong>
          <small>{t("settings.google.hint")}</small>
          <small role="status" aria-live="polite" data-connection-status={status.kind}>
            {t(`settings.google.status.${status.kind}`)}
          </small>
        </div>
        <div className="ff-cal-card-actions">
          {status.kind === "connecting" ? (
            <button type="button" className="ff-btn ff-cal-btn-outline" onClick={() => {
              if (consuming.current) return;
              writePendingConnect(null);
              setStatus({ kind: "disconnected" });
              setNotice(t("settings.google.cancelled"));
            }}>{t("settings.google.cancelConnect")}</button>
          ) : null}
          {status.kind === "error" ? (
            <button type="button" className="ff-btn ff-cal-btn-outline" onClick={() => {
              setStatus({ kind: "loading" });
              setRefresh((value) => value + 1);
            }}>{t("settings.google.retry")}</button>
          ) : status.kind === "connected" ? (
            <button type="button" className="ff-btn ff-btn-danger" onClick={() => setConfirmingDisconnect(true)}>
              {t("settings.google.disconnect")}
            </button>
          ) : (
            <button
              type="button"
              className="ff-btn ff-cal-btn-outline"
              disabled={busy || !signedIn}
              onClick={() => void connect()}
            >
              {status.kind === "loading" ? t("settings.google.status.loading") : busy ? t("settings.google.connecting") : t("settings.google.connect")}
            </button>
          )}
        </div>
      </div>

      {status.kind === "connected" ? (
        <>
          <p className="ff-settings-note">
            {status.connection.accountEmail
              ? t("settings.google.connectedAs", { email: status.connection.accountEmail })
              : t("settings.google.connectedNoEmail")}
          </p>
          {!taskSync.enabled && <p className="ff-settings-note">{t("settings.google.labelsOwnership")}</p>}
          {(labelState?.supported ?? status.connection.labelsSupported) === false ? (
            <p className="ff-settings-note" aria-live="polite">{t("settings.google.labelsUnsupported")}</p>
          ) : null}
          {labelState?.overflow ? <p className="ff-settings-note">{t("settings.google.labelsOverflow", { count: labelState.overflow })}</p> : null}
          {labelState?.failed && labelState.supported !== false ? <p className="ff-settings-note" aria-live="polite">{t("settings.google.labelsRetry")}</p> : null}
          <button type="button" className="ff-btn ff-cal-btn-outline" disabled={syncing} onClick={() => {
            setSyncing(true);
            manualSync.current = true;
            setNotice(""); setError("");
            window.dispatchEvent(new Event(GOOGLE_SYNC_REQUESTED));
          }}>{t(syncing ? "settings.google.syncingNow" : "settings.google.syncNow")}</button>
          <GoogleCalendarSourceList ownCalendarId={status.connection.calendarId} />
          <GoogleTaskReviewPanel />
        </>
      ) : null}

      {!signedIn && status.kind === "disconnected" ? <p className="ff-settings-note">{t("settings.google.signedOut")}</p> : null}

      {/* §8 asks for this to be said once, at the moment of connecting: a
          repeating event edited in Google is overwritten on the next write, and
          Google has no lock that could prevent it. */}
      <p className="ff-settings-note">{t(taskSync.enabled ? "googleTask.unsupported" : "settings.google.repeatWarning")}</p>

      {notice ? <p className="ff-settings-note">{notice}</p> : null}
      {error ? <p className="auth-message error" role="alert">{error}</p> : null}

      {confirmingDisconnect ? (
        <ConfirmModal
          title={t("settings.google.disconnectTitle")}
          body={t("settings.google.disconnectMessage")}
          confirmLabel={t("settings.google.disconnect")}
          onConfirm={() => void confirmDisconnect()}
          onCancel={() => setConfirmingDisconnect(false)}
        />
      ) : null}
    </section>
  );
}

/** Google's four colours, at the size the other card icons draw. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" role="img" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4h6.6c-.1 1.1-.9 2.8-2.5 3.9l3.8 3c2.3-2.1 3.6-5.2 3.6-8.7z"
      />
      <path fill="#34a853" d="M12 24c3.3 0 6-1.1 8-3l-3.8-3c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-4 3.1C3.1 21.3 7.2 24 12 24z" />
      <path fill="#fbbc05" d="M5.1 14.2c-.3-.7-.4-1.5-.4-2.2s.1-1.5.4-2.2l-4-3.1C.4 8.2 0 10 0 12s.4 3.8 1.1 5.3z" />
      <path fill="#ea4335" d="M12 4.8c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.3 0 12 0 7.2 0 3.1 2.7 1.1 6.7l4 3.1c1-2.9 3.7-5 6.9-5z" />
    </svg>
  );
}

export { CALLBACK_LANDING_PATH };
