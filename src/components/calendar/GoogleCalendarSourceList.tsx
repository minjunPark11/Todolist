// Which of the account's calendars to read (GOOGLE_CALENDAR_SYNC_DESIGN.md §6.1).
//
// Drawn under the connect card, and only once connected, because until then
// there is nothing to list and a disabled list of nothing is just noise.
//
// Its own component rather than more of `GoogleCalendarCard` for the reason
// that card is its own component: this is a second question with a second
// failure mode, and threading its loading and error states through the card's
// five-state machine would leave neither readable.
import { useCallback, useEffect, useState } from "react";
import { useT } from "../../i18n";
import { currentAccessToken, GoogleCalendarError, notifyGoogleConnectionChanged } from "../../lib/googleCalendar";
import {
  listGoogleCalendars,
  readGoogleSources,
  rememberGoogleCalendars,
  setGoogleSourceSelected,
  type GoogleCalendarSource,
} from "../../lib/googleCalendarSources";

type Status = "loading" | "ready" | "error";

export function GoogleCalendarSourceList({ ownCalendarId = "" }: { ownCalendarId?: string }) {
  const { t } = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [sources, setSources] = useState<GoogleCalendarSource[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const accessToken = await currentAccessToken();
      if (!accessToken) {
        // Connected a moment ago and the grant is already gone, or the card
        // above is mid-flight. Either way there is nothing to choose from.
        setSources([]);
        setStatus("ready");
        return;
      }
      // Refreshed every time, so a calendar created or renamed in Google shows
      // up here without anyone reconnecting.
      // The app's own dedicated calendar is not offered. Reading it back would
      // draw every synced task twice — once as the task, once as an external
      // event — because the echo guard knows the events it already holds, not
      // the tasks they came from (`inboundPlan` §6.3).
      const listed = (await listGoogleCalendars(accessToken)).filter(
        (calendar) => calendar.calendarId !== ownCalendarId,
      );
      await rememberGoogleCalendars(listed);
      const stored = await readGoogleSources();

      const chosen = new Map(stored.map((source) => [source.calendarId, source]));
      setSources(
        listed.map((calendar) => ({
          ...calendar,
          selected: chosen.get(calendar.calendarId)?.selected ?? false,
        })),
      );
      setStatus("ready");
    } catch (thrown) {
      setStatus("error");
      setError(
        thrown instanceof GoogleCalendarError
          ? t(`settings.google.error.${thrown.reason}`)
          : t("settings.google.error.google"),
      );
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(source: GoogleCalendarSource, selected: boolean) {
    setBusy(source.calendarId);
    setError("");
    // Optimistic: the checkbox is the one control here and a tick that waits
    // for a round trip reads as a control that did not work.
    setSources((current) =>
      current.map((item) => (item.calendarId === source.calendarId ? { ...item, selected } : item)),
    );
    try {
      await setGoogleSourceSelected(source.calendarId, selected);
      // Wakes the inbound pass, so a calendar just ticked fills in rather than
      // waiting for the next time the window is focused.
      notifyGoogleConnectionChanged();
    } catch (thrown) {
      setSources((current) =>
        current.map((item) => (item.calendarId === source.calendarId ? { ...item, selected: !selected } : item)),
      );
      setError(
        thrown instanceof GoogleCalendarError
          ? t(`settings.google.error.${thrown.reason}`)
          : t("settings.google.error.google"),
      );
    } finally {
      setBusy("");
    }
  }

  if (status === "loading") {
    return <p className="ff-settings-note">{t("settings.google.sources.loading")}</p>;
  }

  return (
    <div className="ff-google-sources">
      <strong>{t("settings.google.sources.title")}</strong>
      <small className="ff-settings-note">{t("settings.google.sources.hint")}</small>

      {status === "error" ? (
        <p className="auth-message error" role="alert">
          {error}
          <button type="button" className="ff-btn ff-cal-btn-outline" onClick={() => void load()}>
            {t("settings.google.retry")}
          </button>
        </p>
      ) : null}

      {status === "ready" && sources.length === 0 ? (
        <p className="ff-settings-note">{t("settings.google.sources.empty")}</p>
      ) : null}

      <ul className="ff-google-source-list">
        {sources.map((source) => (
          <li key={source.calendarId}>
            <label>
              <input
                type="checkbox"
                checked={source.selected}
                disabled={busy === source.calendarId}
                onChange={(changed) => void toggle(source, changed.target.checked)}
              />
              <span className="ff-google-source-dot" style={{ background: source.color || "#4f73ff" }} aria-hidden="true" />
              <span className="ff-google-source-name">{source.summary}</span>
              {/* §6.2: a subscribed holiday calendar is readable and not
                  writable, and the difference decides whether editing an event
                  here will be accepted. Saying so beats letting them find out. */}
              {source.selected && !source.writable ? (
                <span className="ff-google-source-badge">{t("settings.google.sources.readOnly")}</span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>

      {error && status !== "error" ? (
        <p className="auth-message error" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
