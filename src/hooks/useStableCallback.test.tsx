// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { memo, useState } from "react";
import { useStableCallback } from "./useStableCallback";

describe("useStableCallback", () => {
  it("keeps one identity across renders", () => {
    const { result, rerender } = renderHook(({ n }) => useStableCallback(() => n), {
      initialProps: { n: 1 },
    });
    const first = result.current;
    rerender({ n: 2 });
    expect(result.current).toBe(first);
  });

  // The whole point: a stable identity that acted on the values it was created
  // with would be a stale closure with extra steps.
  it("runs the newest body, not the one it was created with", () => {
    const { result, rerender } = renderHook(({ n }) => useStableCallback(() => n), {
      initialProps: { n: 1 },
    });
    const held = result.current;
    rerender({ n: 2 });
    expect(held()).toBe(2);
  });

  it("passes arguments through and returns the result", () => {
    const { result } = renderHook(() => useStableCallback((a: number, b: number) => a + b));
    expect(result.current(2, 3)).toBe(5);
  });

  // What this is for. Without it the child re-renders on every parent render,
  // because the handler prop is a new function each time.
  it("lets a memoized child skip a parent's re-render", () => {
    let childRenders = 0;
    const Child = memo(function Child({ onPick }: { onPick: () => void }) {
      childRenders += 1;
      return <button onClick={onPick}>pick</button>;
    });

    let bump = () => {};
    function Parent() {
      const [count, setCount] = useState(0);
      bump = () => setCount((value) => value + 1);
      const onPick = useStableCallback(() => count);
      return <Child onPick={onPick} />;
    }

    render(<Parent />);
    const afterMount = childRenders;
    act(() => bump());
    expect(childRenders).toBe(afterMount);
  });
});
