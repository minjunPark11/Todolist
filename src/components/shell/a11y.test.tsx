// @vitest-environment jsdom
//
// Gate 11 for the SHELL — the regions the module-level checks cannot see.
//
// `tasks/a11y.test.tsx` runs axe over the Tasks Module mounted on its own, and
// it turns off the `region` rule with an honest excuse: "is every part of this
// page inside a landmark" is a question about the shell, and the shell was not
// in the render. This file is where that question finally gets asked — the App
// Shell with its Rail, a Context Sidebar and Main all in one tree, and
// `region` left ON.
//
// The three-landmark structure is the thing under test as much as any single
// attribute: two `<nav>`s and a `<main>` in one document only work if the navs
// have distinct accessible names, which is a rule no component can satisfy by
// itself (§2.33, §3.49).
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { I18nProvider } from "../../i18n";
import { CONTEXT_SIDEBAR_ID } from "../../app/contextSidebar";
import { AppShell } from "./AppShell";
import { GlobalRail } from "./GlobalRail";
import type { ContextSidebarState } from "../../hooks/useContextSidebar";

function sidebarState(overrides: Partial<ContextSidebarState> = {}): ContextSidebarState {
  return {
    mode: "tasks",
    width: 248,
    effectiveWidth: 248,
    visibility: "expanded",
    isResizing: false,
    toggleCollapsed: vi.fn(),
    beginResize: vi.fn(),
    resizeByKey: vi.fn(() => false),
    resetWidth: vi.fn(),
    ...overrides,
  };
}

function renderShell(sidebar: ContextSidebarState = sidebarState()) {
  return render(
    <I18nProvider lang="ko">
      <AppShell
        rail={
          <GlobalRail
            active="tasks"
            onNavigate={() => {}}
            onOpenSearch={() => {}}
            searchOpen={false}
            onOpenAi={() => {}}
            aiOpen={false}
            accountEmail="someone@example.com"
            onSignOut={() => {}}
          />
        }
        sidebar={sidebar}
      >
        {sidebar.mode !== "none" ? (
          <nav id={CONTEXT_SIDEBAR_ID} aria-label="탐색" />
        ) : null}
        <main>
          <h1>페이지</h1>
        </main>
      </AppShell>
    </I18nProvider>,
  );
}

/** Violations axe rates serious or critical — Gate 11's bar, not every nit. */
async function seriousViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // No layout, no pixels: axe cannot sample colours in jsdom.
      "color-contrast": { enabled: false },
      // Deliberately NOT disabled here. See the file header.
      region: { enabled: true },
    },
  });
  // Serious and critical WOULD have been the bar here, and it let a real one
  // through: the resize handle sat outside every landmark, which axe rates
  // MODERATE, so this file passed while the running app failed. The landmark
  // rules are the ones this file exists to check, so `region` counts too.
  const counted = new Set(["serious", "critical"]);
  return results.violations
    .filter((violation) => counted.has(violation.impact ?? "") || violation.id === "region")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.html).join(" | ")}`);
}

afterEach(cleanup);

describe("the App Shell's landmarks", () => {
  it("has no serious or critical violation with a sidebar open", async () => {
    const { container } = renderShell();
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("has no serious or critical violation collapsed, where the expand button lives", async () => {
    const { container } = renderShell(sidebarState({ visibility: "collapsed", effectiveWidth: 0 }));
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("has no serious or critical violation with the account popover open", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    await user.click(screen.getByRole("button", { name: "계정" }));

    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("gives the two nav landmarks names a screen reader can tell apart (§2.33/§3.49)", () => {
    renderShell();
    const names = screen.getAllByRole("navigation").map((nav) => nav.getAttribute("aria-label"));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names.every(Boolean)).toBe(true);
  });
});

describe("the resize handle (§3.51)", () => {
  it("is a focusable separator that reports the width it is at", () => {
    renderShell(sidebarState({ width: 300, effectiveWidth: 300 }));
    const handle = screen.getByRole("separator");

    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe("300");
    expect(handle.getAttribute("aria-valuemin")).toBe("216");
    expect(handle.getAttribute("aria-valuemax")).toBe("360");
    expect(handle.getAttribute("aria-label")).toBeTruthy();
    // Without this the keyboard resize §3.17 defines is unreachable.
    expect(handle.tabIndex).toBe(0);
  });

  it("is gone when there is nothing to resize, rather than reporting a stale width", () => {
    renderShell(sidebarState({ visibility: "collapsed", effectiveWidth: 0 }));
    expect(screen.queryByRole("separator")).toBeNull();
  });
});

describe("collapse and expand are one control in two places (§3.52)", () => {
  it("says which state it is in, from either side", () => {
    const { unmount } = renderShell();
    const collapse = screen.getByRole("button", { name: /접기/ });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    unmount();

    renderShell(sidebarState({ visibility: "collapsed", effectiveWidth: 0 }));
    const expand = screen.getByRole("button", { name: /펼치기/ });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
  });

  it("names the region it opens and closes, so the two are one control", () => {
    const { unmount } = renderShell();
    const collapsedTarget = screen.getByRole("button", { name: /접기/ }).getAttribute("aria-controls");
    expect(collapsedTarget).toBeTruthy();
    unmount();

    renderShell(sidebarState({ visibility: "collapsed", effectiveWidth: 0 }));
    expect(screen.getByRole("button", { name: /펼치기/ }).getAttribute("aria-controls")).toBe(
      collapsedTarget,
    );
  });
});

// §2.33's Rail contract, and the one line of it that D-25 made obsolete.
describe("the Global Rail's ARIA (§2.33)", () => {
  it("names every icon-only item, and hides the icons from the tree", () => {
    const { container } = renderShell();
    const rail = container.querySelector("nav.global-rail")!;
    const buttons = [...rail.querySelectorAll("button")];

    expect(buttons.length).toBeGreaterThan(4);
    for (const button of buttons) {
      // There is no text to fall back on at 56px wide, so a missing label is
      // a button a screen reader reads as "button".
      expect(button.getAttribute("aria-label")).toBeTruthy();
    }
    for (const svg of rail.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("marks the module you are in with aria-current, and only that one", () => {
    const { container } = renderShell();
    const current = [...container.querySelectorAll('.global-rail [aria-current="page"]')];
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("aria-label")).toBe("작업");
  });

  it("says the account button opens a menu, and whether it is open", async () => {
    const user = userEvent.setup();
    renderShell();
    const account = screen.getByRole("button", { name: "계정" });

    expect(account.getAttribute("aria-haspopup")).toBe("menu");
    expect(account.getAttribute("aria-expanded")).toBe("false");
    await user.click(account);
    expect(account.getAttribute("aria-expanded")).toBe("true");
  });

  /**
   * §2.33 asks Search for `aria-haspopup="dialog"` and `aria-expanded`.
   *
   * D-25 took that away — the button navigated, so claiming a dialog would
   * have been a promise the screen reader passes on and the app then breaks.
   * D-29 gave it back by making the promise true. The pair of assertions has
   * flipped twice now, which is the point of having it: the attribute and the
   * behaviour are checked against each other rather than against the spec.
   */
  it("says Search opens a dialog, and whether it is open (§2.33)", () => {
    renderShell();
    const search = screen.getByRole("button", { name: "검색" });

    expect(search.getAttribute("aria-haspopup")).toBe("dialog");
    expect(search.getAttribute("aria-expanded")).toBe("false");
    // Still not a destination that takes the active state (§2.14) — that part
    // of the contract never changed.
    expect(search.getAttribute("aria-current")).toBeNull();
  });
});

// Measured in the browser before it was written: `role="toolbar"` was tried
// first and axe still flagged the wrapper, because a toolbar is a widget and
// the question is whether every part of the page is inside a LANDMARK.
describe("the frame's own controls (P0-12 follow-up)", () => {
  it("puts the resize handle inside a named landmark", () => {
    renderShell();
    const handle = screen.getByRole("separator");
    const landmark = handle.closest("[role='region'], nav, main, aside, header, footer");

    expect(landmark).not.toBeNull();
    expect(landmark?.getAttribute("aria-label")).toBeTruthy();
  });

  it("puts the expand button in the same one", () => {
    renderShell(sidebarState({ visibility: "collapsed", effectiveWidth: 0 }));
    const expand = screen.getByRole("button", { name: /펼치기/ });

    expect(expand.closest("[role='region']")).not.toBeNull();
  });
});
