// @vitest-environment jsdom
//
// What the Command Menu is (D-25, revised by D-29).
//
// D-25 made this a menu that could not find a Task, and the Rail's magnifier
// a page navigation. Using it settled the question: the menu is where someone
// types when they are looking for something, and refusing to answer sent them
// to a page that lost their place. Tasks are back, capped, and the last row
// hands the query to the Search Page.
//
// The tests below are about the boundary that remains, and it is a different
// one: the menu shows what FITS, the page shows all of it, and getting from
// one to the other is a row the user presses rather than something typing
// does on its own.
//
// The axe case at the bottom used to live in `tasks/a11y.test.tsx` and moved
// with the component. It is the same check: a combobox over a listbox, with
// group headings that name their groups rather than sitting in them.
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { List, Tag, Task } from "../../types";
import type { SearchCollections } from "../../domain/tasks/search";
import type { CommandContext } from "../../domain/tasks/commands";
import { I18nProvider } from "../../i18n";
import { CommandMenu, type RecentEntry } from "./CommandMenu";

const NOW = "2026-08-18T09:00:00.000Z";

const reportTask = {
  id: "t1",
  title: "Quarterly report",
  status: "todo",
  listId: "l1",
  projectId: "p1",
  parentTaskId: "",
  deletedAt: "",
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as Task;

const reportList = {
  id: "l1",
  projectId: "p1",
  name: "Reporting",
  order: 0,
  isDefault: true,
  createdAt: NOW,
  updatedAt: NOW,
} as List;

const collections: SearchCollections = {
  tasks: [reportTask],
  lists: [reportList],
  folders: [],
  sidebarFolders: [],
  tags: [{ id: "tag-1", name: "reports", createdAt: NOW, updatedAt: NOW }] as Tag[],
  savedFilters: [],
};

const recents: RecentEntry[] = [
  { key: "scope:today:", label: "오늘", url: "/today" },
  { key: "scope:list:l1", label: "Reporting", url: "/list/l1" },
];

const inAList: CommandContext = { scope: { kind: "list", id: "l1" }, view: "list" };
const nowhere: CommandContext = { scope: null, view: null };

function renderMenu(ctx: CommandContext = inAList, props: Partial<Parameters<typeof CommandMenu>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onPickResult: vi.fn(),
    onRunCommand: vi.fn(),
    onOpenUrl: vi.fn(),
    onSeeAll: vi.fn(),
    onCapture: vi.fn(),
  };
  const view = render(
    <I18nProvider lang="ko">
      <CommandMenu collections={collections} ctx={ctx} recents={recents} {...handlers} {...props} />
    </I18nProvider>,
  );
  return { ...view, ...handlers };
}

afterEach(cleanup);

describe("the menu goes to places and runs commands", () => {
  it("offers tasks and containers together, each in its own group", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.type(screen.getByRole("combobox"), "report");

    // The Task D-25 refused to show, back where someone typing "report" is
    // most likely to be looking for it.
    expect(screen.getByRole("option", { name: /Quarterly report/ })).toBeTruthy();
    // Exact names, because a Task row now carries its owner List as a
    // subtitle — "Quarterly report Reporting" also ends in "Reporting".
    expect(screen.getByRole("option", { name: "Reporting" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "reports" })).toBeTruthy();
    // A Project row ("Reporting cycle") sat here too. Projects are gone from
    // the app's surface, and so from what the menu can find.
  });

  it("hands the query to the Search Page from a row, not from typing", async () => {
    const user = userEvent.setup();
    const { onSeeAll } = renderMenu();
    await user.type(screen.getByRole("combobox"), "report");

    // Below the listbox: a way OUT of the menu rather than one of the choices
    // in it, so arrowing through results never lands on a navigation.
    const seeAll = screen.getByRole("button", { name: "전체 결과 보기" });
    expect(seeAll.closest('[role="listbox"]')).toBeNull();

    await user.click(seeAll);
    expect(onSeeAll).toHaveBeenCalledWith("report");
  });

  it("lists recent places before anything is typed (§10.8)", () => {
    renderMenu();
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["오늘", "Reporting"]);
  });

  it("opens a recent place by its URL, without touching the address itself", async () => {
    const user = userEvent.setup();
    const { onOpenUrl } = renderMenu();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onOpenUrl).toHaveBeenCalledWith("/list/l1");
  });

  it("ends a typed query on capture, so a miss still has somewhere for Enter to go", async () => {
    const user = userEvent.setup();
    const { onCapture } = renderMenu();
    await user.type(screen.getByRole("combobox"), "buy stamps");
    // Nothing matches, so capture is the only row and already active (§10.38).
    await user.keyboard("{Enter}");

    expect(onCapture).toHaveBeenCalledWith("buy stamps");
  });
});

describe("opened from a page that is not a Scope (D-25)", () => {
  it("still offers the destinations, and drops the commands that needed a Scope", async () => {
    const user = userEvent.setup();
    renderMenu(nowhere);
    await user.type(screen.getByRole("combobox"), "이동");

    const labels = screen.getAllByRole("option").map((option) => option.textContent);
    expect(labels).toContain("오늘로 이동");
    expect(labels.some((label) => label?.includes("보드"))).toBe(false);
  });
});

describe("accessibility (Gate 11)", () => {
  it("has no serious or critical violation with the menu open", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu();
    await user.type(screen.getByRole("combobox"), "report");

    const results = await axe.run(container, {
      rules: {
        // No layout, no pixels: axe cannot sample colours in jsdom.
        "color-contrast": { enabled: false },
        // The menu is mounted alone here; landmark regions belong to the shell.
        region: { enabled: false },
      },
    });
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(serious.map((violation) => violation.id)).toEqual([]);
  });
});
