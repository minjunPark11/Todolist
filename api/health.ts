// A deployment smoke check, and right now a diagnostic.
//
// The functions under `api/*.ts` build cleanly and then fail at invocation
// with FUNCTION_INVOCATION_FAILED, which says nothing about why. The question
// this answers is whether the crash is in loading the shared code under
// `src/` or in running a TypeScript function at all: this file imports NOTHING
// statically, so it loads even when that shared graph cannot, and it reports
// the failure as text instead of as a 500 with no body.
//
// Temporary. Delete it once the answer is known, or keep it as the check that
// a deployment is actually serving functions — `/api/ics` is the only other
// endpoint that answers without credentials, and it is plain JavaScript, so it
// cannot tell us anything about the TypeScript path.
interface AdapterRequest {
  method?: string;
}

interface AdapterResponse {
  status(code: number): AdapterResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

export default async function handler(_req: AdapterRequest, res: AdapterResponse): Promise<void> {
  const report: Record<string, string> = {
    node: process.version,
    // Which module system the function actually ended up as. The tsconfig and
    // package.json both say ESM; if the builder emitted CommonJS instead, this
    // is where that shows.
    module: typeof require === "undefined" ? "esm" : "cjs",
  };

  // The one import, made dynamic on purpose: a static one would take this file
  // down with it and leave us reading tea leaves again.
  try {
    const shared = await import("../src/integrations/google");
    report.shared = typeof shared.authorizeUrl === "function" ? "ok" : "loaded, export missing";
  } catch (error) {
    report.shared = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(report);
}
