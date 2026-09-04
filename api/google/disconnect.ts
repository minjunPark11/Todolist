// Disconnecting (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// Both rows go, and the grant is handed back to Google. It runs on the server
// because the token row has no policy any user token can satisfy (§4.4.1) —
// the client can delete its own connection row and nothing else, which would
// leave the secret behind.
//
// Order matters: revoke first, delete after. A revoke that fails is survivable
// (the user can also remove the app in their Google account screen); a delete
// that succeeds while the revoke is still pending would leave us with no token
// to revoke WITH. So the revoke is attempted first and its result ignored —
// see `revokeToken`, which never throws.
//
// What this deliberately does NOT do is remove the events already written to
// the Google calendar. They are the user's, in their account, and a disconnect
// is not a request to erase their calendar. The dedicated calendar (§4.1) is
// theirs to delete if they want it gone.
import {
  deleteConnection,
  deleteRefreshToken,
  readRefreshToken,
  requireUser,
  revokeToken,
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
    const revoked = refreshToken ? await revokeToken(refreshToken) : true;

    await deleteRefreshToken(user.userId);
    await deleteConnection(user.userId);

    // `revoked: false` is reported rather than hidden: the local disconnect
    // succeeded, but a grant Google still holds is something the user may want
    // to remove by hand.
    res.status(200).json({ disconnected: true, revoked });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not disconnect Google Calendar." });
  }
}
