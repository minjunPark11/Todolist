// A deployment smoke check — and the guard on the mistake that cost this
// project 133 commits' worth of deployments.
//
// It was written to answer why every `.ts` function died at invocation with
// FUNCTION_INVOCATION_FAILED and an empty body. The answer came back from the
// deployment itself: `Directory import '/var/task/src/integrations/google' is
// not supported`. Vercel compiles the functions but does not bundle them, and
// Node's ESM resolver has no directory or extensionless imports.
// `scripts/buildFunctions.mjs` is the fix; this endpoint is how you know it is
// still working.
//
// The one import is dynamic on purpose. A static one would take this file down
// with the shared graph and leave a 500 with nothing in it — exactly the state
// this was written to escape.
interface AdapterRequest {
  method?: string;
}

interface AdapterResponse {
  status(code: number): AdapterResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

export default async function handler(_req: AdapterRequest, res: AdapterResponse): Promise<void> {
  const report: Record<string, string> = { node: process.version };

  try {
    const shared = await import("../integrations/google");
    report.shared = typeof shared.authorizeUrl === "function" ? "ok" : "loaded, export missing";
  } catch (error) {
    report.shared = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(report);
}
