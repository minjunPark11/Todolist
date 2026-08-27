// The error vocabulary every server query answers with (§15 of
// FOCUSFLOW_EXTERNAL_AI_ACCESS_ARCHITECTURE.md).
//
// Deliberately small, and deliberately not the upstream error. A Supabase
// failure string can carry a table name, a policy name, or a fragment of the
// query — none of which an outside AI has any business relaying to whoever is
// chatting with it, and all of which describe our infrastructure rather than
// the user's question.

export type ServerErrorCode =
  | "NOT_FOUND"
  | "INVALID_ARGUMENT"
  | "UPSTREAM_UNAVAILABLE";

export class ServerError extends Error {
  readonly code: ServerErrorCode;

  constructor(code: ServerErrorCode, message: string) {
    super(message);
    this.name = "ServerError";
    this.code = code;
  }
}

export function invalidArgument(message: string): ServerError {
  return new ServerError("INVALID_ARGUMENT", message);
}

/**
 * One message for every id the account cannot show, whatever the reason.
 *
 * §15 and acceptance criterion 10: a record that belongs to somebody else and
 * a record that never existed must be indistinguishable. Anything else turns
 * this into an oracle that answers "does user B have a task with this id?" —
 * and RLS, which already refuses to return the row, would not stop us from
 * leaking the answer in the shape of the error.
 */
export function notFound(): ServerError {
  return new ServerError("NOT_FOUND", "No such record.");
}

export function upstreamUnavailable(): ServerError {
  return new ServerError("UPSTREAM_UNAVAILABLE", "The account could not be read right now.");
}
