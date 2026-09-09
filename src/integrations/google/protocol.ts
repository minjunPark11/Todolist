import { GOOGLE_SYNC_PROTOCOL_HEADER, MAX_GOOGLE_ACCESS_TOKEN_SECONDS } from "../../domain/calendar/googleSync/protocol";
import { readServiceRoleEnv, type ServiceRoleEnv } from "./env";

export class GoogleSyncProtocolError extends Error {
  constructor(readonly code: "google_sync_update_required" | "google_sync_policy_unavailable",
    readonly status: 426 | 503, message: string, readonly minimumProtocol?: number) {
    super(message); this.name = "GoogleSyncProtocolError";
  }
}
export function requestedGoogleProtocol(headers: Record<string, string | string[] | undefined>): number {
  const entries = Object.entries(headers).filter(([key]) => key.toLowerCase() === GOOGLE_SYNC_PROTOCOL_HEADER);
  const value = entries[0]?.[1];
  if (entries.length === 0) return 1; // Released clients had no capability header.
  if (entries.length === 1 && (value === "1" || value === "2")) return Number(value);
  throw new GoogleSyncProtocolError("google_sync_update_required", 426, "Update FocusFlow before syncing Google Calendar.");
}

export async function authorizeGoogleToken(userId: string, protocol: number, expiresIn: number | null = null,
  fetchImpl: typeof fetch = fetch, env: ServiceRoleEnv = readServiceRoleEnv()): Promise<void> {
  const unavailable = () => new GoogleSyncProtocolError("google_sync_policy_unavailable", 503,
    "Google sync compatibility could not be verified. No access token was released.");
  if (![1,2].includes(protocol) || (expiresIn !== null && (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_GOOGLE_ACCESS_TOKEN_SECONDS))) {
    throw unavailable();
  }
  let response: Response;
  try {
    response = await fetchImpl(`${env.url}/rest/v1/rpc/authorize_google_token`, {
      method: "POST", headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId, p_protocol: protocol, p_expires_in: expiresIn }),
    });
  } catch { throw unavailable(); }
  if (!response.ok) throw unavailable(); // Includes missing migration: never fail open.
  const body = await response.json().catch(() => null) as { allowed?: unknown; minimumProtocol?: unknown } | null;
  if (!body || typeof body.allowed !== "boolean" || ![1,2].includes(Number(body.minimumProtocol)) || typeof body.minimumProtocol !== "number") throw unavailable();
  if (!body.allowed) throw new GoogleSyncProtocolError("google_sync_update_required",426,
    "Update FocusFlow before syncing Google Calendar.", body.minimumProtocol);
}
