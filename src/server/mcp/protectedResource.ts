// The document that tells a connector where to go and get a token (RFC 9728).
//
// This is the whole of FocusFlow's part in OAuth discovery. A client that hits
// `/api/mcp` without a token gets a 401 naming this document; this document
// names Supabase as the authorization server; Supabase publishes its own
// metadata, registers the client (DCR) and issues the token. §6.3 step 3.
//
// FocusFlow issues nothing, signs nothing, and stores no client. Getting that
// right was rev.2's correction to this design — rev.1 had us building four
// endpoints and four tables that Supabase already provides.
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: string[];
  resource_documentation?: string;
}

/**
 * Supabase's OAuth server lives under `/auth/v1`, and that path is part of the
 * issuer — a client that strips it looks for the metadata in the wrong place
 * (§26.4b confirmed the published address).
 */
export function issuerFor(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
}

export interface ProtectedResourceInput {
  /** Where this app is served, e.g. `https://focusflow.example`. */
  appUrl: string;
  /** The Supabase project URL, e.g. `https://<ref>.supabase.co`. */
  supabaseUrl: string;
}

export function protectedResourceMetadata(input: ProtectedResourceInput): ProtectedResourceMetadata {
  const appUrl = input.appUrl.replace(/\/+$/, "");
  return {
    // The resource identifier a token is bound to: the MCP endpoint itself,
    // not the app. A client puts this in `resource` when it asks for a token,
    // and Supabase binds the token to it — which is what stops a token minted
    // for somebody else's server from being replayed against ours.
    resource: `${appUrl}/api/mcp`,
    authorization_servers: [issuerFor(input.supabaseUrl)],
    bearer_methods_supported: ["header"],
    // Supabase's own list (§26.4). FocusFlow adds none of its own: custom
    // scopes are not supported, which is why read-only is enforced by the
    // database rather than by a scope (§6.5).
    scopes_supported: ["openid", "profile", "email"],
  };
}

/** Where the 401 challenge points. */
export function protectedResourceUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/.well-known/oauth-protected-resource`;
}

/**
 * The app's own public address, which only the deployment knows.
 *
 * Returns nothing rather than guessing when it is unset: a metadata document
 * naming the wrong host sends connectors somewhere real and wrong, which is
 * harder to diagnose than a 404 saying the document is not published yet.
 */
export function readAppUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = (env.APP_URL || env.PUBLIC_APP_URL || "").trim();
  if (url) return url.replace(/\/+$/, "");
  // Vercel sets this on every deployment, which makes preview deployments work
  // without anyone configuring anything.
  const vercel = (env.VERCEL_URL || "").trim();
  return vercel ? `https://${vercel.replace(/^https?:\/\//, "")}` : undefined;
}
