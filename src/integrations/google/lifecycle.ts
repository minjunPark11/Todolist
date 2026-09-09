import { randomUUID } from "node:crypto";
import { readServiceRoleEnv, type ServiceRoleEnv } from "./env";

export class GoogleLifecycleError extends Error {
  constructor(readonly status: 409 | 503 = 503) {
    super(status === 409 ? "Another Google connection operation is running. Try again shortly."
      : "The Google connection operation needs recovery before reconnecting.");
    this.name = "GoogleLifecycleError";
  }
}
async function rpc(name: string, body: unknown, fetchImpl: typeof fetch, env: ServiceRoleEnv): Promise<Record<string, unknown>> {
  // Retry only the idempotent DB receipt, never the Google side effect.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchImpl(`${env.url}/rest/v1/rpc/${name}`, {
        method: "POST", headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        const value = await response.json();
        if (value && typeof value === "object") return value;
      }
    } catch { /* Same operation UUID on retry; no credentials in errors. */ }
  }
  throw new GoogleLifecycleError();
}

/** No time-based takeover: expiration cannot fence a Google request already sent. */
export async function withGoogleLifecycle<T>(userId: string, kind: "connect" | "disconnect",
  work: (operation: { remoteStarted(): void; remoteSettled(): void }) => Promise<T>,
  fetchImpl: typeof fetch = fetch, env: ServiceRoleEnv = readServiceRoleEnv()): Promise<T> {
  const operationId = randomUUID();
  const begin = await rpc("begin_google_oauth_operation", { p_operation_id: operationId, p_user_id: userId, p_kind: kind }, fetchImpl, env);
  if (begin.acquired !== true) throw new GoogleLifecycleError(begin.uncertain === true ? 503 : 409);
  let unsettled = false;
  try {
    return await work({ remoteStarted() { unsettled = true; }, remoteSettled() { unsettled = false; } });
  } finally {
    const result = await rpc("finish_google_oauth_operation", { p_operation_id: operationId, p_user_id: userId,
      p_state: unsettled ? "uncertain" : "completed" }, fetchImpl, env);
    if (result.finished !== true || unsettled) throw new GoogleLifecycleError();
  }
}
