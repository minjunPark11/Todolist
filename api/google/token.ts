// A short-lived access token, minted for the signed-in user
// (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// Called whenever the client's hour is up. This is what lets the refresh token
// stay on the server: the client never holds a credential that outlives the
// session it is working in.
//
// A 401 here means the grant is gone, not that something went wrong — the user
// revoked FocusFlow in their Google account, or never finished connecting. The
// client turns that into "connect again" rather than a retry, because retrying
// a dead grant never succeeds.
import {
  GoogleOAuthError,
  readGoogleOAuthEnv,
  readRefreshToken,
  refreshAccessToken,
  requireUser,
  UnauthorizedError,
} from "../../src/integrations/google";

interface AdapterRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface AdapterResponse {
  status(code: number): AdapterResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(body?: string): void;
}

function header(headers: AdapterRequest["headers"], name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: AdapterRequest, res: AdapterResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method not allowed");
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const user = await requireUser(header(req.headers, "authorization"));
    const refreshToken = await readRefreshToken(user.userId);
    if (!refreshToken) {
      // Not an error state — this is every user who has never connected. The
      // shape says so explicitly rather than making the client read a 404.
      res.status(200).json({ connected: false });
      return;
    }

    const token = await refreshAccessToken(refreshToken, readGoogleOAuthEnv());
    res.status(200).json({ connected: true, accessToken: token.accessToken, expiresIn: token.expiresIn });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ error: error.message });
      return;
    }
    if (error instanceof GoogleOAuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not refresh Google access." });
  }
}
