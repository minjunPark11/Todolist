// Google Calendar sync, server side (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// The functions under `api/google/` are HTTP shells; everything they do is
// here, where it can be tested without a socket.
//
// WHY THIS IS NOT UNDER `src/server/`, which is where the rest of the server
// layer lives: that tree may never name the service_role key
// (FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md §22-9, enforced by
// `server/purity.test.ts`). The rule is right and this code genuinely breaks
// it — `google_calendar_tokens` has no policy any user token can satisfy
// (§4.4.1), so reading it needs the key that bypasses RLS.
//
// The two are different jobs. `src/server/` answers questions AS a user, with
// that user's own token, and a service key there would silently turn every
// query into a whole-database read. This module is the custodian of one
// secret, and its privilege is the point. Keeping them in separate trees is
// what lets the purity test stay absolute instead of growing an exception.
//
// It imports FROM `src/server/` (the JWKS verifier) and nothing there imports
// back, so the closure that test walks never reaches this file.
import { bearerFrom, UnauthorizedError, type VerifiedToken, type TokenVerifier } from "../../server/mcp/auth";
import { issuerFor } from "../../server/mcp/protectedResource";
import { supabaseTokenVerifier } from "../../server/mcp/jwks";
import { readSupabaseEnv } from "../../server/data/repository";

export { readGoogleOAuthEnv, readServiceRoleEnv, GOOGLE_CALENDAR_SCOPE } from "./env";
export type { GoogleOAuthEnv, ServiceRoleEnv } from "./env";
export { encodeOAuthState, decodeOAuthState, type OAuthPlatform, type OAuthState } from "./state";
export {
  authorizeUrl,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  GoogleOAuthError,
  type ExchangedTokens,
  type RefreshedToken,
} from "./oauth";
export {
  readRefreshToken,
  writeRefreshToken,
  deleteRefreshToken,
  deleteConnection,
  TokenStoreError,
} from "./store";

/**
 * The verifier, built on first use.
 *
 * Same shape and same reason as `mcp/index.ts`: reading the environment at
 * module load turns a missing variable into an import error, and an import
 * error on a serverless function is a blank 500 with nothing in it.
 */
function lazyVerifier(): TokenVerifier {
  let inner: TokenVerifier | null = null;
  return {
    async verify(bearer) {
      inner ??= supabaseTokenVerifier({ issuer: issuerFor(readSupabaseEnv().url) });
      return inner.verify(bearer);
    },
  };
}

const verifier = lazyVerifier();

/**
 * Who is asking, proven.
 *
 * The signature is checked against Supabase's JWKS — the same path the MCP
 * server uses, and deliberately not `decodeJwtClaims`, which reads a token
 * without checking anything. These endpoints attach a Google account to a
 * FocusFlow account and mint credentials for it; a forgeable `sub` here would
 * let anyone drive anyone's calendar.
 */
export async function requireUser(
  authorization: string | undefined,
  verify: TokenVerifier = verifier,
): Promise<VerifiedToken> {
  const bearer = bearerFrom(authorization);
  if (!bearer) {
    throw new UnauthorizedError("missing_token", "Sign in to FocusFlow first.");
  }
  return verify.verify(bearer);
}

export { UnauthorizedError };
export type { VerifiedToken };
