import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * One identity for the life of the component, always running the newest body.
 *
 * A handler written inline in a component is a new function on every render,
 * and a new function is a changed prop: it defeats `React.memo` on everything
 * below it, which is why rows that had not changed were being re-rendered
 * whenever anything in the store did. The usual answer, `useCallback` with a
 * dependency list, does not fit a handler that reads half the module's state —
 * the list grows until it changes every render anyway, and a list that is
 * wrong instead goes stale and acts on last render's values.
 *
 * This is React's `useEffectEvent` in the shape it has before it ships: the
 * returned function never changes, and the body it calls is always the one
 * from the most recent commit.
 *
 * Two limits come with that, and both are why the assignment is in an
 * insertion effect rather than written during render (a render React
 * discards — StrictMode's double pass, an interrupted concurrent render —
 * must not be able to leave the newest body behind):
 *
 *   Call it from events and effects, never during render. During render the
 *   body is still the previous commit's, which is exactly the stale read this
 *   is meant to avoid.
 *
 *   It is not a value. Do not put the returned function in a dependency list
 *   expecting the effect to re-run when the body changes — it never will.
 */
export function useStableCallback<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(fn);
  useInsertionEffect(() => {
    latest.current = fn;
  }, [fn]);
  return useCallback((...args: Args) => latest.current(...args), []);
}
