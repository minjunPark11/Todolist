// The one authentication screen FocusFlow builds (§6.4).
//
// Everything else in the OAuth flow belongs to Supabase: it registers the
// client, validates the request, mints the code, rotates the refresh token.
// What Supabase cannot do is ask this person, in this product's words, whether
// they want an outside AI reading their days — and check that there is
// anything in the account for it to read (M2).
//
// Rendered as its own root, outside App: consent is an auth screen, and
// loading the whole planner behind it would be slow, pointless, and would put
// the user's data on screen underneath a dialog about giving it away.
import { useCallback, useEffect, useState } from "react";
import type { OAuthAuthorizationClient } from "@supabase/supabase-js";
import { I18nProvider, useT } from "../../i18n";
import { isSupabaseConfigured, supabase } from "../../services/supabaseClient";
import type { Language } from "../../types";
import { blocksApproval, readAccountReadiness, type AccountReadiness } from "./accountReadiness";

type Phase =
  | { kind: "loading" }
  | { kind: "needsSignIn" }
  | { kind: "consent"; client: OAuthAuthorizationClient; redirectUri: string; scope: string; email: string }
  | { kind: "deciding" }
  | { kind: "error"; message: string };

export const CONSENT_PATH = "/oauth/consent";

/** The language the app was last set to, read where the app keeps it. */
function storedLanguage(): Language {
  try {
    const raw = window.localStorage.getItem("focusflow.appData.v1");
    const parsed = raw ? (JSON.parse(raw) as { appSettings?: { language?: unknown } }) : null;
    return parsed?.appSettings?.language === "en" ? "en" : "ko";
  } catch {
    return "ko";
  }
}

export function OAuthConsentPage() {
  const [lang] = useState<Language>(storedLanguage);
  return (
    <I18nProvider lang={lang}>
      <ConsentScreen />
    </I18nProvider>
  );
}

function ConsentScreen() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [readiness, setReadiness] = useState<AccountReadiness | null>(null);

  const authorizationId = new URLSearchParams(window.location.search).get("authorization_id") ?? "";

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setPhase({ kind: "error", message: t("oauth.notConfigured") });
      return;
    }
    if (!authorizationId) {
      setPhase({ kind: "error", message: t("oauth.noAuthorizationId") });
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      setPhase({ kind: "needsSignIn" });
      return;
    }

    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error || !data) {
      setPhase({ kind: "error", message: t("oauth.requestExpired") });
      return;
    }
    // Already consented: Supabase has the code ready and there is nothing to
    // ask. Sending the user through the same screen twice would train them to
    // click Allow without reading it.
    if (!("authorization_id" in data)) {
      window.location.replace(data.redirect_url);
      return;
    }

    setPhase({
      kind: "consent",
      client: data.client,
      redirectUri: data.redirect_uri,
      scope: data.scope,
      email: data.user.email,
    });
    setReadiness(await readAccountReadiness(supabase));
  }, [authorizationId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(approve: boolean) {
    if (!supabase) return;
    setPhase({ kind: "deciding" });
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

    if (error || !data) {
      setPhase({ kind: "error", message: t("oauth.decisionFailed") });
      return;
    }
    // Redirecting ourselves rather than letting the library do it, so a
    // failure above is a message on this page instead of a browser landing
    // somewhere with an error in the query string.
    window.location.replace(data.redirect_url);
  }

  if (phase.kind === "loading" || phase.kind === "deciding") {
    return (
      <main className="auth-screen">
        <section className="auth-card consent-card">
          <p className="consent-loading">{t("oauth.working")}</p>
        </section>
      </main>
    );
  }

  if (phase.kind === "needsSignIn") {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return (
      <main className="auth-screen">
        <section className="auth-card consent-card">
          <h1>{t("oauth.signInTitle")}</h1>
          <p className="consent-lede">{t("oauth.signInBody")}</p>
          <a className="auth-submit consent-link" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
            {t("oauth.signInAction")}
          </a>
        </section>
      </main>
    );
  }

  if (phase.kind === "error") {
    return (
      <main className="auth-screen">
        <section className="auth-card consent-card">
          <h1>{t("oauth.problemTitle")}</h1>
          <p className="auth-message error">{phase.message}</p>
          <a className="consent-link" href="/app">
            {t("oauth.backToApp")}
          </a>
        </section>
      </main>
    );
  }

  const blocked = !readiness || blocksApproval(readiness);

  return (
    <main className="auth-screen">
      <section className="auth-card consent-card" aria-labelledby="consent-title">
        <h1 id="consent-title">{t("oauth.title", { client: phase.client.name })}</h1>
        <p className="consent-lede">{t("oauth.lede", { client: phase.client.name, email: phase.email })}</p>

        {/* R4: dynamic client registration means anyone may register a client
            with any name they like. The name and the address it will send the
            code to are shown verbatim, unstyled and untruncated, because a
            person recognising "this is not the app I was using" is the only
            defence that exists here. */}
        <dl className="consent-facts">
          <dt>{t("oauth.factClient")}</dt>
          <dd>{phase.client.name}</dd>
          <dt>{t("oauth.factRedirect")}</dt>
          <dd className="consent-uri">{phase.redirectUri}</dd>
          {phase.client.uri ? (
            <>
              <dt>{t("oauth.factWebsite")}</dt>
              <dd className="consent-uri">{phase.client.uri}</dd>
            </>
          ) : null}
        </dl>

        <ul className="consent-grants">
          <li>{t("oauth.grantRead")}</li>
          <li>{t("oauth.grantNoWrite")}</li>
          <li>{t("oauth.grantRevoke")}</li>
        </ul>

        <p className="consent-warning">{t("oauth.strangerWarning")}</p>

        {readiness && readiness.state === "empty" ? (
          <p className="auth-message error">{t("oauth.accountEmpty")}</p>
        ) : null}
        {readiness && readiness.state === "unknown" ? (
          <p className="auth-message error">{t("oauth.accountUnknown")}</p>
        ) : null}
        {readiness && readiness.state === "stale" ? (
          <p className="consent-warning">{t("oauth.accountStale")}</p>
        ) : null}

        <div className="consent-actions">
          <button type="button" className="consent-deny" onClick={() => void decide(false)}>
            {t("oauth.deny")}
          </button>
          <button type="button" className="auth-submit" disabled={blocked} onClick={() => void decide(true)}>
            {t("oauth.allow")}
          </button>
        </div>

        {blocked ? (
          <a className="consent-link" href="/app">
            {t("oauth.openAppToSync")}
          </a>
        ) : null}
      </section>
    </main>
  );
}
