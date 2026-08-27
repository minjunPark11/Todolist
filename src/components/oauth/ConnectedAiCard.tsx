// Which AI clients can read this account, and the button that stops them.
//
// The grants live in Supabase, so this needs no table and no state of our own
// (§6.4): `listGrants` is the list and `revokeGrant` ends one — which also
// kills that client's sessions and refresh tokens, so "disconnect" means
// disconnected rather than "until its token expires".
//
// It is here rather than on the consent screen because consent is the moment
// of granting and this is the rest of the time. A permission you cannot find
// afterwards is a permission you cannot withdraw.
import { useCallback, useEffect, useState } from "react";
import type { OAuthGrant } from "@supabase/supabase-js";
import { useT } from "../../i18n";
import { isSupabaseConfigured, supabase } from "../../services/supabaseClient";

type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "list"; grants: OAuthGrant[] }
  | { kind: "error"; message: string };

export function ConnectedAiCard() {
  const { t, lang } = useT();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busyClientId, setBusyClientId] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setState({ kind: "signedOut" });
      return;
    }
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      setState({ kind: "signedOut" });
      return;
    }
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error || !data) {
      setState({ kind: "error", message: t("settings.connectedAiFailed") });
      return;
    }
    setState({ kind: "list", grants: data });
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(clientId: string) {
    if (!supabase) return;
    setBusyClientId(clientId);
    setNotice("");
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
    setBusyClientId("");
    if (error) {
      setNotice(t("settings.connectedAiRevokeFailed"));
      return;
    }
    setNotice(t("settings.connectedAiRevoked"));
    await load();
  }

  // An account nobody has connected anything to should not carry an empty
  // panel about connecting things — but one that cannot be read should say so,
  // rather than looking like an account with nothing connected.
  if (state.kind === "loading") return null;

  return (
    <div className="ff-settings-card">
      <div className="ff-settings-row">
        <div className="ff-settings-row-text">
          <strong>{t("settings.connectedAi")}</strong>
          <small>{t("settings.connectedAiHint")}</small>
        </div>
      </div>

      {state.kind === "signedOut" ? <p className="ff-settings-note">{t("settings.connectedAiSignedOut")}</p> : null}
      {state.kind === "error" ? <p className="auth-message error">{state.message}</p> : null}

      {state.kind === "list" && state.grants.length === 0 ? (
        <p className="ff-settings-note">{t("settings.connectedAiEmpty")}</p>
      ) : null}

      {state.kind === "list" && state.grants.length > 0 ? (
        <ul className="connected-ai-list">
          {state.grants.map((grant) => (
            <li key={grant.client.id} className="connected-ai-row">
              <div>
                <strong>{grant.client.name}</strong>
                <span>{t("settings.connectedAiGranted", { date: formatDate(grant.granted_at, lang) })}</span>
              </div>
              <button
                type="button"
                className="ff-btn"
                disabled={busyClientId === grant.client.id}
                onClick={() => void revoke(grant.client.id)}
              >
                {t("settings.connectedAiRevoke")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? <p className="ff-settings-note">{notice}</p> : null}
    </div>
  );
}

function formatDate(value: string, lang: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
