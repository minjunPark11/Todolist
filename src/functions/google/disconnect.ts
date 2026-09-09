// Disconnecting (GOOGLE_CALENDAR_SYNC_DESIGN.md §4.4).
//
// Both rows go, and the grant is handed back to Google. It runs on the server
// because the token row has no policy any user token can satisfy (§4.4.1) —
// the client can delete its own connection row and nothing else, which would
// leave the secret behind.
//
// Order matters: inspect grant version, revoke, then atomically detach only that
// snapshot. A concurrent replacement is retained and returns 409. Google revoke
// is external to this transaction; it cannot be rolled back by the database.
// An unconfirmed revoke retains the connection and leaves the lifecycle gate
// pending recovery. The result is never discarded or retried automatically.
//
// What this deliberately does NOT do is remove the events already written to
// the Google calendar. They are the user's, in their account, and a disconnect
// is not a request to erase their calendar. The dedicated calendar (§4.1) is
// theirs to delete if they want it gone.
import {
  requireUser,
  readGoogleOAuthEnv,
  revokeToken,
  UnauthorizedError,
} from "../../integrations/google";
import { readDisconnectSnapshot, disconnectStoredCalendar, TokenStoreError } from "../../integrations/google/store";
import { GoogleLifecycleError, withGoogleLifecycle } from "../../integrations/google/lifecycle";
import { confirmGoogleRevocation } from "../../integrations/google/oauth";

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

    const result = await withGoogleLifecycle(user.userId, "disconnect", async operation => {
      const snapshot = await readDisconnectSnapshot(user.userId);
      let revoked = true;
      if (snapshot.refreshToken) {
        const env = readGoogleOAuthEnv();
        operation.remoteStarted();
        revoked = await revokeToken(snapshot.refreshToken);
        if (!revoked || !await confirmGoogleRevocation(snapshot.refreshToken, env)) throw new GoogleLifecycleError();
        operation.remoteSettled();
      }
      await disconnectStoredCalendar(user.userId, snapshot);

      // Only confirmed revocation and atomic detach are reported as success.
      return { disconnected: true, revoked };
    });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof GoogleLifecycleError) {
      res.status(error.status).json({ error: error.message, code: "google_lifecycle_blocked" }); return;
    }
    if (error instanceof TokenStoreError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof UnauthorizedError) {
      // `reason` and not just the sentence: the client turns "no bearer at all"
      // and "this bearer was refused" into two different repairs, and the
      // sentence is prose it must not have to match on.
      res.status(401).json({ error: error.message, code: error.reason });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not disconnect Google Calendar." });
  }
}
