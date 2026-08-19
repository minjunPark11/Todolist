// @vitest-environment jsdom
//
// The work-area level, drawn or not (U2 one level up).
//
// `shouldRevealSpaces` is tested where it lives; what cannot be asserted from
// a pure function is that the tree OBEYS it — that the Projects of the sole
// work area move up to the top instead of merely losing their heading, and
// that the row comes back the moment there is a second area to tell apart.
import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import type { List, Project, Space } from "../../types";
import { I18nProvider } from "../../i18n";
import { SpaceTree } from "./SpaceTree";

const NOW = "2026-08-19T00:00:00.000Z";

function space(id: string, name: string, overrides: Partial<Space> = {}): Space {
  return {
    id,
    name,
    description: "",
    color: "#0066cc",
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function project(id: string, name: string, spaceId: string): Project {
  return { id, name, description: "", color: "#0066cc", spaceId, createdAt: NOW, updatedAt: NOW };
}

function renderTree(spaces: Space[], projects: Project[], lists: List[] = []) {
  return render(
    <I18nProvider lang="en">
      <SpaceTree
        workAreas={spaces}
        projects={projects}
        folders={[]}
        lists={lists}
        selection={{ kind: "none" }}
        onSelectSpace={() => {}}
        onSelectProject={() => {}}
        onCreateSpace={() => {}}
        onCreateProject={() => {}}
        onRenameSpace={() => {}}
        onArchiveSpace={() => {}}
        onRenameProject={() => {}}
        onArchiveProject={() => {}}
        onTogglePinProject={() => {}}
        onSelectList={() => {}}
        onSelectFolder={() => {}}
        onCreateList={() => {}}
        onCreateFolder={() => {}}
        onRenameList={() => {}}
        onArchiveList={() => {}}
        onRenameFolder={() => {}}
        onArchiveFolder={() => {}}
        onMoveItemToList={() => {}}
      />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe("the work area level", () => {
  it("is not drawn while there is one, and its Projects are the top of the tree", () => {
    const { container } = renderTree([space("s1", "My Space")], [project("p1", "ABM", "s1")]);

    expect(container.querySelectorAll(".spt-area-row")).toHaveLength(0);
    // Visible without opening anything — the point of hiding the level is
    // that there is no longer a twisty between the reader and their work.
    expect(screen.getByRole("button", { name: "ABM" })).toBeTruthy();
  });

  it("comes back as soon as there are two areas to tell apart", () => {
    const { container } = renderTree(
      [space("s1", "School"), space("s2", "Personal", { order: 1 })],
      [project("p1", "ABM", "s1"), project("p2", "Blog", "s2")],
    );

    expect(container.querySelectorAll(".spt-area-row")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /School/ })).toBeTruthy();
    // And the Projects go back behind their area's twisty.
    expect(screen.queryByRole("button", { name: "ABM" })).toBeNull();
  });

  it("does not count an archived area as the second one", () => {
    const { container } = renderTree(
      [space("s1", "School"), space("s2", "Old", { archivedAt: NOW })],
      [project("p1", "ABM", "s1")],
    );

    expect(container.querySelectorAll(".spt-area-row")).toHaveLength(0);
    expect(screen.queryByText("Old")).toBeNull();
    expect(screen.getByRole("button", { name: "ABM" })).toBeTruthy();
  });

  it("still offers to make a work area, which is how the level returns", () => {
    renderTree([space("s1", "My Space")], [project("p1", "ABM", "s1")]);
    // The level is hidden, not retired: without this button there would be no
    // way back to a second work area, which is a worse trap than the row.
    expect(screen.getByRole("button", { name: "+ Space" })).toBeTruthy();
  });
});
