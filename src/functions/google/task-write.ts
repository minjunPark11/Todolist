import { requireUser, UnauthorizedError } from "../../integrations/google";
import { requestedGoogleProtocol, GoogleSyncProtocolError } from "../../integrations/google/protocol";
import { executeGoogleTaskOutbound } from "../../integrations/google/taskOutbound";

interface Request { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
interface Response { status(code: number): Response; setHeader(name: string, value: string): void; json(body: unknown): void; end(body?: string): void }

/** Dispatch only an existing reservation belonging to the authenticated user. No client Google token/body. */
export default async function handler(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); res.status(405).end(); return; }
  try {
    const bearer = req.headers.authorization;
    const user = await requireUser(Array.isArray(bearer) ? bearer[0] : bearer);
    if (requestedGoogleProtocol(req.headers) !== 2) {
      throw new GoogleSyncProtocolError("google_sync_update_required", 426, "Update FocusFlow before syncing Google Calendar.");
    }
    let body: unknown = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
    const id = body && typeof body === "object" ? (body as { operationId?: unknown }).operationId : null;
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ code: "invalid_operation_id", error: "A reserved operation ID is required." }); return;
    }
    const result = await executeGoogleTaskOutbound(user.userId, id);
    res.status(result.state === "pending" ? 202 : 200).json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) { res.status(401).json({ code: error.reason, error: error.message }); return; }
    if (error instanceof GoogleSyncProtocolError) { res.status(error.status).json({ code: error.code, error: error.message }); return; }
    res.status(503).json({ code: "google_task_write_pending", error: "The Google task write needs reconciliation before another attempt." });
  }
}
