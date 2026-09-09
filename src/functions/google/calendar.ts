import { requireUser, UnauthorizedError } from "../../integrations/google";
import { authorizeGoogleToken, requestedGoogleProtocol, GoogleSyncProtocolError } from "../../integrations/google/protocol";
import { bindDedicatedCalendar, CalendarBindingError } from "../../integrations/google/calendarBinding";

interface Request { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
interface Response { status(code: number): Response; setHeader(name: string, value: string): void; json(body: unknown): void; end(body?: string): void }
export default async function handler(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); res.status(405).end(); return; }
  try {
    const bearer = req.headers.authorization;
    const user = await requireUser(Array.isArray(bearer) ? bearer[0] : bearer);
    const protocol = requestedGoogleProtocol(req.headers);
    await authorizeGoogleToken(user.userId, protocol);
    let body: unknown = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
    const calendarId = body && typeof body === "object" ? (body as { calendarId?: unknown }).calendarId : null;
    if (typeof calendarId !== "string" || !calendarId.trim()) { res.status(400).json({ error: "Missing calendar ID." }); return; }
    await bindDedicatedCalendar(user.userId, calendarId);
    res.status(200).json({ bound: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) { res.status(401).json({ code: error.reason, error: error.message }); return; }
    if (error instanceof GoogleSyncProtocolError) { res.status(error.status).json({ code: error.code, error: error.message }); return; }
    res.status(error instanceof CalendarBindingError ? error.status : 502).json({
      code: "google_calendar_verification_failed", error: "Could not verify the dedicated calendar. The existing connection was kept.",
    });
  }
}
