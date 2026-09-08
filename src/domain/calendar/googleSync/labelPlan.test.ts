import { expect, it } from "vitest";
import { labelIdFor, planLabels, toHex6 } from "./labelPlan";
import type { Project } from "../../../types";

export const project = (id = "p", patch: Partial<Project> = {}): Project => ({ id, name: "Work", color: "#0a5", description: "", createdAt: "2026-01-01", updatedAt: "2026-01-01", ...patch });

it("creates stable UUIDs and normalizes colors", () => {
  expect(labelIdFor("p")).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  expect(labelIdFor("p")).not.toBe(labelIdFor("q"));
  expect(toHex6("#0a5")).toBe("#00aa55");
  expect(toHex6("oops")).toBe("#007aff");
});

it("preserves foreign labels, removes deleted-list labels, and avoids identical writes", () => {
  const foreign = { id: "foreign", name: "Personal", backgroundColor: "#abcdef" };
  const first = planLabels([project()], [foreign]);
  expect(first.create).toHaveLength(1);
  expect(planLabels([project()], first.labels).changed).toBe(false);
  const renamed = planLabels([project("p", { name: "New", color: "#123456" })], first.labels);
  expect(renamed.update).toHaveLength(1);
  expect(renamed.mappings).toEqual(first.mappings);
  expect(planLabels([], first.labels).labels).toEqual([foreign]);
  expect(planLabels([project("p", { archivedAt: "now" })], first.labels).remove).toHaveLength(1);
});

it("keeps the combined palette within 200 and limits long names", () => {
  const lists = Array.from({ length: 201 }, (_, i) => project(String(i), { name: "가".repeat(60) }));
  const result = planLabels(lists, [{ id: "foreign", backgroundColor: "#000000" }]);
  expect(result.labels).toHaveLength(200);
  expect(result.overflow).toBe(2);
  expect(result.create[0].name).toHaveLength(50);
});
