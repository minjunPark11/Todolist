// @vitest-environment jsdom
//
// What the matrix costs when the page around it re-renders.
//
// The four boxes draw every card in the Scope, and `MatrixPage` re-renders on
// every store change because `App` does. So the cards' props decide whether a
// tick of a focus session somewhere redraws the whole matrix, and they used to
// guarantee it: four handlers bound inline per card, plus a fresh `[]` for
// every card with no tags, meant `MatrixCard`'s props were never twice the
// same.
//
// This pins the contract that fixed it — the page hands its own id-taking
// handlers straight down and the card binds its own id — because the way it
// regresses is someone writing `onToggleDone={() => onToggleDone(task.id)}`
// at a call site again, which is the natural thing to write and leaves every
// test but this one passing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import type { List, Task, TaskStatus } from "../types";
import { I18nProvider } from "../i18n";
import { FloatingLayerProvider } from "./floating";

let cardRenders = 0;
vi.mock("./tasks/TaskCheck", () => ({
  TaskCheck: ({ label, onToggle }: { label: string; onToggle: () => void }) => {
    cardRenders += 1;
    return <input type="checkbox" aria-label={label} onChange={onToggle} />;
  },
}));

const { MatrixPage } = await import("./MatrixPage");

afterEach(cleanup);

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    status: "todo" as TaskStatus,
    priority: "high",
    dueDate: "",
    projectId: "",
    tags: [],
    notes: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "",
    ...overrides,
  } as Task;
}

const lists: List[] = [];

/**
 * The page inside an owner that re-renders on its own, the way `App` does, and
 * handing it freshly built handlers each time, the way `App` does.
 */
function Host({ tasks }: { tasks: Task[] }) {
  const [, bump] = useState(0);
  (Host as unknown as { bump?: () => void }).bump = () => bump((n) => n + 1);
  return (
    <I18nProvider lang="en">
      <FloatingLayerProvider>
        <MatrixPage
          tasks={tasks}
          lists={lists}
          selectedTaskId=""
          onOpenTask={() => {}}
          onUpdateTask={() => {}}
          onCreateTask={() => ""}
          onToggleDone={() => {}}
        />
      </FloatingLayerProvider>
    </I18nProvider>
  );
}

describe("the matrix's cards", () => {
  it("redraw no card when the page re-renders with the same tasks", () => {
    const tasks = [task("a"), task("b"), task("c")];
    render(<Host tasks={tasks} />);
    expect(cardRenders).toBeGreaterThan(0);
    cardRenders = 0;

    act(() => (Host as unknown as { bump: () => void }).bump());

    expect(cardRenders).toBe(0);
  });
});
