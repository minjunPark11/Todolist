// The link a Task can be shared by (spec §15.19, §15.20).
//
// §15.20 asks for two things that pull against each other: the URL must name
// the Task, and it should keep the context it was copied from. `taskUrlFor`
// already produces the second — it is the Module's own address contract — so
// this adds the first and the origin, and nothing else.
//
// Naming the Task is not automatic. A Detail can be open in a Scope whose
// address has no `?task=` in it at all: the Board, where a card's ⋯ opens a
// menu without navigating. Copying the address bar there would hand someone a
// link to the List and let them hunt.
import { taskUrlFor, type TaskNavigationState } from "./taskScopeUrl";

/**
 * An absolute link to one Task, in the View it is being read in.
 *
 * `origin` is passed rather than read from `window` so this stays testable and
 * so the caller owns the one decision this cannot make: a desktop build's
 * origin is its own shell, and a link copied there opens the Task in the app
 * rather than anywhere a colleague could follow. That is the honest result
 * while there is no configured public base URL — the alternative is inventing
 * a host and copying a link that resolves to nothing.
 */
export function taskLinkFor(origin: string, state: TaskNavigationState, taskId: string): string {
  // The Task is the point of the link (§15.20), so it is written in even when
  // the state it came from had no Task open.
  const path = taskUrlFor({ ...state, taskId });
  return `${origin.replace(/\/$/, "")}${path}`;
}
