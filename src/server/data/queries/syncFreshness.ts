// "How current is what you are looking at?" as a question of its own.
//
// The same answer rides on every other tool's `meta`, so this exists for the
// case where that is the whole question — a reader that noticed `stale` and
// wants to tell the user how long it has been, without pulling a task list it
// has no use for.
import { freshnessFrom, type Freshness } from "../freshness";
import type { QueryContext } from "./shared";

export async function getSyncFreshness(ctx: QueryContext): Promise<Freshness> {
  const slice = await ctx.repo.loadSlice(["settings"]);
  return freshnessFrom(slice.syncState, ctx.request.now);
}
