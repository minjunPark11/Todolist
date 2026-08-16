import { describe, expect, it } from "vitest";
import type { Project, Space } from "../../types";
import {
  activeSpaces,
  archiveSpace,
  addSpace,
  backfillProjectSpace,
  canDeleteSpace,
  DEFAULT_SPACE_ID,
  ensureDefaultSpace,
  makeSpace,
  moveProjectToSpace,
  patchSpace,
  projectsInSpace,
  sanitizeSpace,
  spaceIdForProject,
} from "./spaces";

const NOW = "2026-08-17T00:00:00.000Z";
const LATER = "2026-08-18T00:00:00.000Z";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Drone research",
    description: "",
    color: "#0066cc",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function space(overrides: Partial<Space> = {}): Space {
  return { ...makeSpace("s1", "Research", NOW), ...overrides };
}

describe("sanitizeSpace", () => {
  it("rejects a record with no id", () => {
    expect(sanitizeSpace({ name: "Research" })).toBeNull();
    expect(sanitizeSpace({ id: "   ", name: "Research" })).toBeNull();
    expect(sanitizeSpace(null)).toBeNull();
  });

  it("keeps unknown fields so an older client cannot erase them (M0)", () => {
    const kept = sanitizeSpace({ id: "s1", name: "Research", futureField: 42 });
    expect(kept).toMatchObject({ id: "s1", name: "Research" });
    expect((kept as unknown as Record<string, unknown>).futureField).toBe(42);
  });

  it("fills either timestamp from the other rather than inventing one", () => {
    expect(sanitizeSpace({ id: "s1", updatedAt: LATER })?.createdAt).toBe(LATER);
    expect(sanitizeSpace({ id: "s1", createdAt: NOW })?.updatedAt).toBe(NOW);
  });
});

describe("spaceIdForProject", () => {
  it("answers with the default Space when the field is absent", () => {
    // A Project written before Spaces existed, or by a client that predates
    // them, must still appear in the tree without waiting for a backfill.
    expect(spaceIdForProject(project())).toBe(DEFAULT_SPACE_ID);
    expect(spaceIdForProject(project({ spaceId: "" }))).toBe(DEFAULT_SPACE_ID);
  });

  it("prefers the stored value", () => {
    expect(spaceIdForProject(project({ spaceId: "s1" }))).toBe("s1");
  });
});

describe("ensureDefaultSpace", () => {
  it("creates nothing for an account with no projects", () => {
    const spaces: Space[] = [];
    expect(ensureDefaultSpace(spaces, [], NOW)).toBe(spaces);
  });

  it("creates one Space with a fixed id so a second run cannot duplicate it", () => {
    const first = ensureDefaultSpace([], [project()], NOW);
    expect(first.map((s) => s.id)).toEqual([DEFAULT_SPACE_ID]);
    // A device whose first save failed, or a second device migrating on its
    // own, must land on the same record.
    const second = ensureDefaultSpace(first, [project()], LATER);
    expect(second).toBe(first);
  });
});

describe("backfillProjectSpace", () => {
  it("returns the same array when every Project already has a Space", () => {
    const projects = [project({ spaceId: "s1" })];
    expect(backfillProjectSpace(projects)).toBe(projects);
  });

  it("files only the Projects that have none, and spreads only those", () => {
    const filed = project({ id: "p1", spaceId: "s1" });
    const loose = project({ id: "p2" });
    const next = backfillProjectSpace([filed, loose]);
    // Identity is how the sync plan decides what to upload: an untouched
    // Project must stay the same object or it ships a row for nothing.
    expect(next[0]).toBe(filed);
    expect(next[1]).not.toBe(loose);
    expect(next[1].spaceId).toBe(DEFAULT_SPACE_ID);
  });

  it("leaves updatedAt alone", () => {
    // The user did not edit these; bumping the timestamp would push every
    // Project to the top of "recently updated" on first launch.
    const next = backfillProjectSpace([project({ updatedAt: NOW })]);
    expect(next[0].updatedAt).toBe(NOW);
  });
});

describe("reads", () => {
  it("orders active spaces by order then name, hiding archived", () => {
    const spaces = [
      space({ id: "b", name: "Beta", order: 1 }),
      space({ id: "z", name: "Zed", order: 0 }),
      space({ id: "gone", name: "Gone", order: 0, archivedAt: NOW }),
    ];
    expect(activeSpaces(spaces).map((s) => s.id)).toEqual(["z", "b"]);
  });

  it("collects the Projects of a Space, including ones relying on the default", () => {
    const projects = [
      project({ id: "p1", spaceId: "s1", name: "A" }),
      project({ id: "p2", name: "B" }),
      project({ id: "p3", spaceId: "s1", name: "C", archivedAt: NOW }),
    ];
    expect(projectsInSpace(projects, "s1").map((p) => p.id)).toEqual(["p1"]);
    expect(projectsInSpace(projects, DEFAULT_SPACE_ID).map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("canDeleteSpace", () => {
  it("refuses while any Project points at it, archived ones included", () => {
    // H-INV-06: deleting must never be an implicit cascade over the work
    // inside. An archived Project is recoverable; stranding it would not be.
    expect(canDeleteSpace([project({ spaceId: "s1" })], "s1")).toBe(false);
    expect(canDeleteSpace([project({ spaceId: "s1", archivedAt: NOW })], "s1")).toBe(false);
    expect(canDeleteSpace([project({ spaceId: "s2" })], "s1")).toBe(true);
    expect(canDeleteSpace([], "s1")).toBe(true);
  });

  it("counts a Project with no spaceId against the default Space", () => {
    expect(canDeleteSpace([project()], DEFAULT_SPACE_ID)).toBe(false);
  });
});

describe("writes", () => {
  it("gives an added Space the next order", () => {
    const current = [space({ id: "s1", order: 0 }), space({ id: "s2", order: 1 })];
    const next = addSpace(current, makeSpace("s3", "New", NOW));
    expect(next[2].order).toBe(2);
  });

  it("patches only the named Space and refuses to move its id", () => {
    const current = [space({ id: "s1" }), space({ id: "s2" })];
    const next = patchSpace(current, "s1", { name: "Renamed", id: "hijack" } as Partial<Space>, LATER);
    expect(next[0]).toMatchObject({ id: "s1", name: "Renamed", updatedAt: LATER });
    expect(next[1]).toBe(current[1]);
  });

  it("returns the same array when the patch names nothing", () => {
    const current = [space({ id: "s1" })];
    expect(patchSpace(current, "missing", { name: "x" }, LATER)).toBe(current);
  });

  it("archives once", () => {
    const current = [space({ id: "s1" })];
    const archived = archiveSpace(current, "s1", LATER);
    expect(archived[0].archivedAt).toBe(LATER);
    expect(archiveSpace(archived, "s1", NOW)).toBe(archived);
  });
});

describe("moveProjectToSpace", () => {
  const spaces = [space({ id: "s1" }), space({ id: "s2" })];

  it("changes one row and nothing else (H-INV-05)", () => {
    const projects = [project({ id: "p1", spaceId: "s1" }), project({ id: "p2", spaceId: "s1" })];
    const next = moveProjectToSpace(projects, "p1", "s2", spaces, LATER);
    expect(next[0]).toMatchObject({ id: "p1", spaceId: "s2", updatedAt: LATER });
    expect(next[1]).toBe(projects[1]);
  });

  it("moves a Project that was relying on the default Space", () => {
    const projects = [project({ id: "p1" })];
    expect(moveProjectToSpace(projects, "p1", "s1", spaces, LATER)[0].spaceId).toBe("s1");
  });

  it("refuses a Space that does not exist rather than dangling the Project", () => {
    const projects = [project({ id: "p1", spaceId: "s1" })];
    expect(moveProjectToSpace(projects, "p1", "ghost", spaces, LATER)).toBe(projects);
  });

  it("writes nothing when the Project is already there", () => {
    const projects = [project({ id: "p1", spaceId: "s1" })];
    expect(moveProjectToSpace(projects, "p1", "s1", spaces, LATER)).toBe(projects);
    // Including when it is there only by derivation.
    const loose = [project({ id: "p2" })];
    const withDefault = [space({ id: DEFAULT_SPACE_ID })];
    expect(moveProjectToSpace(loose, "p2", DEFAULT_SPACE_ID, withDefault, LATER)).toBe(loose);
  });
});
