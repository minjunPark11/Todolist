// @vitest-environment jsdom
//
// What a row costs when something else changes.
//
// No screen in this app windows its list: every Task in the Scope is on
// screen, and every one of them is a `TaskRowContent`. So the question that
// decides whether the list feels fast is not what one row costs to draw — it
// is how many rows are drawn when the store changes, and the honest answer
// used to be "all of them, for any change at all", because the module holding
// them re-renders on every store update and nothing below it was memoized.
//
// These pin the two halves of the fix: the row skips a re-render its props do
// not justify, and the handlers a caller passes it are stable enough for that
// to actually happen.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import type { Task } from "../../types";
import { I18nProvider } from "../../i18n";
import { useStableCallback } from "../../hooks/useStableCallback";

// Counted from inside the row: a row that re-renders draws its checkbox again.
let bodyRenders = 0;
vi.mock("./TaskCheck", () => ({
  TaskCheck: ({ label, onToggle }: { label: string; onToggle: () => void }) => {
    bodyRenders += 1;
    return <input type="checkbox" aria-label={label} onChange={onToggle} />;
  },
}));

const { TaskRowContent } = await import("./TaskRowContent");

afterEach(cleanup);

const TODAY = "2026-08-31";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    status: "todo",
    listId: "school",
    priority: "none",
    tags: [],
    ...overrides,
  } as Task;
}

/**
 * A list drawn the way the module draws one: stable handlers, and task objects
 * that are replaced individually rather than rebuilt as a set — which is what
 * the store does, since an edit spreads one task and keeps the others.
 */
function List({ rows, onToggleDone }: { rows: Task[]; onToggleDone: (task: Task) => void }) {
  const [, bump] = useState(0);
  const open = useStableCallback(() => {});
  const toggle = useStableCallback(onToggleDone);
  (List as unknown as { bump?: () => void }).bump = () => bump((n) => n + 1);
  return (
    <I18nProvider lang="en">
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <TaskRowContent task={row} today={TODAY} onOpen={open} onToggleDone={toggle} />
          </li>
        ))}
      </ul>
    </I18nProvider>
  );
}

const rerenderList = () => (List as unknown as { bump: () => void }).bump();

describe("a list of rows", () => {
  it("draws every row once on the way in", () => {
    bodyRenders = 0;
    render(<List rows={[task("a"), task("b"), task("c")]} onToggleDone={vi.fn()} />);
    // StrictMode is not on in the test root, so this is one pass.
    expect(bodyRenders).toBe(3);
  });

  // The one that matters. The module above a list re-renders whenever the
  // store does — a focus session ticking, a sync landing, a checkbox on some
  // other screen — and none of that is news to a row.
  it("redraws no row when its owner re-renders with the same tasks", () => {
    const rows = [task("a"), task("b"), task("c")];
    render(<List rows={rows} onToggleDone={vi.fn()} />);
    bodyRenders = 0;

    act(() => rerenderList());

    expect(bodyRenders).toBe(0);
  });

  // And it is still a live list: the row whose task actually changed redraws,
  // and only that one.
  it("redraws only the row whose task changed", () => {
    const rows = [task("a"), task("b"), task("c")];
    const { rerender } = render(<List rows={rows} onToggleDone={vi.fn()} />);
    bodyRenders = 0;

    // What `onMutate` produces: one new task object, the rest untouched.
    rerender(
      <List rows={[rows[0], { ...rows[1], title: "Edited" }, rows[2]]} onToggleDone={vi.fn()} />,
    );

    expect(bodyRenders).toBe(1);
  });

  // The memo is only as good as the props it compares. A handler rebuilt every
  // render is a changed prop, and it would put every row back on screen — the
  // failure this is most likely to regress into.
  it("is not defeated by a caller passing a fresh handler each render", () => {
    const rows = [task("a"), task("b"), task("c")];
    const { rerender } = render(<List rows={rows} onToggleDone={() => {}} />);
    bodyRenders = 0;

    // A brand-new function, as an inline arrow in a parent would be.
    rerender(<List rows={rows} onToggleDone={() => {}} />);

    expect(bodyRenders).toBe(0);
  });
});
