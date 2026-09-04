// Step 3: the code becomes a stored grant (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// The only endpoint that holds the client secret, and the only one that knows
// which FocusFlow account is asking. Those two facts belong together: this is
// where a Google account gets attached to a FocusFlow account, and doing it
// anywhere the caller could not be proven would let anyone attach anything.
//
// What comes back is deliberately thin — an access token good for an hour and
// the account's email. The refresh token stays on this side forever (§4.4,
// chain step 4).
import {
  exchangeCode,
  GoogleOAuthError,
  readGoogleOAuthEnv,
  requireUser,
  UnauthorizedError,
  writeRefreshToken,
} from "../../src/integrations/google";

interface AdapterRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
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

function readCode(body: unknown): string {
  if (typeof body === "string") {
    try {
      return readCode(JSON.parse(body));
    } catch {
      return "";
    }
  }
  if (!body || typeof body !== "object") return "";
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code.trim() : "";
}

export default async function handler(req: AdapterRequest, res: AdapterResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method not allowed");
    return;
  }
  res.setHeader("Cache-Control", "no-store");

  const code = readCode(req.body);
  if (!code) {
    res.status(400).json({ error: "Missing authorization code." });
    return;
  }

  try {
    const user = await requireUser(header(req.headers, "authorization"));
    const env = readGoogleOAuthEnv();
    const tokens = await exchangeCode(code, env);

    // Stored BEFORE anything is returned. If the write fails the caller is told
    // the connection failed, which is true — an access token in a browser with
    // no refresh token behind it is a connection that dies within the hour and
    // cannot be renewed.
    await writeRefreshToken(user.userId, tokens.refreshToken, tokens.scope);

    res.status(200).json({
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      scope: tokens.scope,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ error: error.message });
      return;
    }
    if (error instanceof GoogleOAuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not connect Google Calendar." });
  }
}
