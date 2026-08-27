// Who the bearer token says is asking.
//
// The verifying itself lives in ./jwks, which checks the signature against the
// project's published ES256 key, the issuer, the audience and the expiry
// (§8.2 step 2). What is left here is the vocabulary — the shape of a verified
// token, the 401 the protocol needs, and the pieces of a JWT that can be read
// without trusting them.

export class UnauthorizedError extends Error {
  /** What goes in `WWW-Authenticate`, so a connector starts an OAuth flow. */
  readonly reason: "missing_token" | "invalid_token";

  constructor(reason: "missing_token" | "invalid_token", message: string) {
    super(message);
    this.name = "UnauthorizedError";
    this.reason = reason;
  }
}

export interface VerifiedToken {
  userId: string;
  clientId?: string;
  /** Passed through to PostgREST, which is what actually checks it. */
  accessToken: string;
}

export interface TokenVerifier {
  verify(bearer: string): Promise<VerifiedToken>;
}

/** `Authorization: Bearer <token>`, or nothing. */
export function bearerFrom(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1].trim() : null;
}

/**
 * The middle segment of a JWT, read as JSON, with nothing checked.
 *
 * For looking at a token you already hold — a debugging aid and what the
 * test verifier below is built on. Never a basis for letting anything through:
 * ./jwks is what decides that.
 */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * A verifier that checks nothing but the shape. **Tests only.**
 *
 * It exists so the protocol layer can be exercised without generating key
 * pairs, and `createMcpDeps` deliberately does not offer it: wiring this into
 * a deployment would accept any well-formed JWT from anywhere, which is the
 * confused deputy ./jwks was written to close. The only thing standing behind
 * it is PostgREST refusing the token later — noise instead of a leak, but a
 * layer too late.
 */
export function unverifiedClaimsVerifier(now: () => Date = () => new Date()): TokenVerifier {
  return {
    async verify(bearer) {
      const claims = decodeJwtClaims(bearer);
      if (!claims) throw new UnauthorizedError("invalid_token", "That token is not a JWT.");

      const userId = typeof claims.sub === "string" ? claims.sub : "";
      if (!userId) throw new UnauthorizedError("invalid_token", "That token names no subject.");

      const expiry = typeof claims.exp === "number" ? claims.exp * 1000 : undefined;
      if (expiry !== undefined && expiry <= now().getTime()) {
        throw new UnauthorizedError("invalid_token", "That token has expired.");
      }

      return {
        userId,
        // Present on an OAuth token, absent on an ordinary session token
        // (§6.5). Recorded for logs and policy; never used to grant anything.
        ...(typeof claims.client_id === "string" ? { clientId: claims.client_id } : {}),
        accessToken: bearer,
      };
    },
  };
}
