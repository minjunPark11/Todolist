// The HTTP shell around the MCP server (§8.1).
//
// Deliberately thin: it turns a platform request into a plain object, calls
// `serveMcp`, and writes the answer back. Everything that could be wrong about
// an MCP request is decided one layer down, where it can be tested without a
// socket — and when this moves to a Supabase Edge Function, this file is the
// only one that changes.
//
// Typed structurally rather than against `@vercel/node`, which is not a
// dependency of this project. What is used of the request is its method, its
// headers and its body; adding a package to name those would be the tail
// wagging the dog.
import { serveMcp } from "../../server/mcp";

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

export default async function handler(req: AdapterRequest, res: AdapterResponse): Promise<void> {
  const response = await serveMcp({
    method: req.method ?? "POST",
    headers: flatten(req.headers),
    body: req.body,
  });

  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);

  if (response.body === null) {
    res.status(response.status).end();
    return;
  }
  res.status(response.status).json(response.body);
}

/**
 * A header may arrive repeated. Only the first copy is read: an
 * `Authorization` sent twice is a client bug or an attempt to confuse us, and
 * concatenating the two would produce a token that is neither.
 */
function flatten(headers: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  const flat: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(headers)) {
    flat[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return flat;
}
