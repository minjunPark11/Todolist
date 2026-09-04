// RFC 9728, served at /.well-known/oauth-protected-resource via the rewrite in
// vercel.json.
//
// It lives under api/ because a function can read the deployment's own URL and
// the Supabase project from the environment; a static file would have to be
// rebuilt for every environment, and a preview deployment would advertise the
// production host.
import { protectedResourceMetadata, readAppUrl } from "../../server/mcp";
import { readSupabaseEnv } from "../../server/data/repository";

interface AdapterRequest {
  method?: string;
}

interface AdapterResponse {
  status(code: number): AdapterResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
  end(body?: string): void;
}

export default function handler(req: AdapterRequest, res: AdapterResponse): void {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end("Method not allowed");
    return;
  }

  const appUrl = readAppUrl();
  if (!appUrl) {
    // Better a 404 than a document naming the wrong host: a connector that
    // reads the wrong `resource` gets a token bound to somewhere else and
    // fails with an error about audiences, three layers from the cause.
    res.status(404).json({ error: "This deployment has not been told its own address (APP_URL)." });
    return;
  }

  let supabaseUrl: string;
  try {
    supabaseUrl = readSupabaseEnv().url;
  } catch {
    res.status(404).json({ error: "This deployment has no Supabase project configured." });
    return;
  }

  // Public, unauthenticated, and meant to be cached — it changes only when the
  // deployment moves.
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json(protectedResourceMetadata({ appUrl, supabaseUrl }));
}
