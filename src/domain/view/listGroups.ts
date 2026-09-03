// Tasks divided by the List that owns them (FOLDER_TREE_AND_VIEW_DESIGN.md §5).
//
// A Folder is a SET OF LISTS — that is the whole of what it is — so a Folder's
// screen showing thirty rows in one column has thrown away the only structure
// it had. Under three headings with three counts it is a folder again.
//
// The Board already reads a Folder this way and has since its own phase: a
// column per List, empty ones included, because *"an empty column there is not
// noise, it is the answer to 'where else could this go'"* (`boardAxis.ts`).
// This is that shape for the list view, so the two views of one Folder say the
// same thing about it.
//
// In the domain and not in the component for the reason `todayGroups.ts` gives
// at the top of itself: a grouping rule that lives in a component is one that
// has to be rewritten to be configured. Nothing configures this one yet; the
// axis is a legitimate one for a Tag or a Filter later, and this is where it
// would be turned on.
import type { List, Task } from "../../types";
import { listIdFor } from "../spaces/membership";

export interface ListGroup {
  list: List;
  tasks: Task[];
}

/**
 * One group per List in `order`, in that order.
 *
 * `order` is the caller's — `listsInFolder` for a Folder — because deciding
 * how Lists are sorted is not this function's question and answering it twice
 * is how a Folder comes to read in two orders (§5.2).
 *
 * Every List in `order` gets a group, including the empty ones (§5.3).
 *
 * There is no bucket for a task whose List is not in `order`, and that is a
 * claim about the caller rather than an oversight: on a Folder, `scopeQuery`
 * has already kept only tasks whose List is in that Folder, so such a task
 * cannot arrive. A caller that cannot promise the same must not use this —
 * the Board, which is asked about arbitrary rows, keeps its own "no list"
 * column for exactly that case.
 */
export function groupTasksByList(tasks: Task[], order: readonly List[], lists: List[]): ListGroup[] {
  const buckets = new Map<string, Task[]>(order.map((list) => [list.id, []]));
  for (const task of tasks) {
    buckets.get(listIdFor(task, lists))?.push(task);
  }
  return order.map((list) => ({ list, tasks: buckets.get(list.id) ?? [] }));
}
