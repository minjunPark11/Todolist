import { expect, it } from "vitest";
import { planLegacyMappings, type LegacyMappingProof, type LegacyEventObservation } from "./legacyMappingPlan";
const scope = { userId: "u", connectionGeneration: "g", calendarId: "cal", syncRevision: 0 };
const task = { taskId: "t", googleEventId: "e", revision: 1 };
const proof: LegacyMappingProof = { ...scope, taskId: "t", eventId: "e", evidenceRef: "verified-history/1" };
const observation: LegacyEventObservation = { eventId: "e", kind: "found", source: { id: "e" } };
const input = { scope, tasks: [task], proofs: [proof], observations: [observation], existing: [] };
it("registers a verified ID without inventing an agreed base", () => {
  const result = planLegacyMappings(input);
  expect(result.entries[0].decision).toEqual({ kind: "register", taskId: "t", evidenceRef: "verified-history/1" });
  expect(result.entries[0]).not.toHaveProperty("base");
});
it("does not use a remote ID match as ownership evidence", () => {
  expect(planLegacyMappings({ ...input, proofs: [] }).entries[0].decision).toMatchObject({ reason: "ownership-unverified" });
  expect(planLegacyMappings({ ...input, proofs: [{ ...proof, calendarId: "old" }] }).entries[0].decision).toMatchObject({ reason: "ownership-unverified" });
});
it("holds every duplicate claimant, including another task in trash", () => {
  const result = planLegacyMappings({ ...input, tasks: [task, { ...task, taskId: "other" }] });
  expect(result.entries[0].decision).toMatchObject({ reason: "duplicate-event-id" });
  expect(result.entries[0].expected).toHaveLength(2);
});
it.each(["missing", "unavailable"] as const)("preserves %s instead of deleting or clearing the mapping", kind => {
  expect(planLegacyMappings({ ...input, observations: [{ eventId: "e", kind }] }).entries[0].decision).toMatchObject({ kind: "review", reason: `event-${kind}` });
});
it("keeps master cancellation distinct from occurrence cancellation", () => {
  expect(planLegacyMappings({ ...input, observations: [{ ...observation, kind: "found", source: { id: "e", status: "cancelled" } }] }).entries[0].decision.kind).toBe("register");
  expect(planLegacyMappings({ ...input, observations: [{ ...observation, kind: "found", source: { id: "e", recurringEventId: "master", status: "cancelled" } }] }).entries[0].decision).toMatchObject({ reason: "recurring-instance" });
});
it("does not overwrite an existing mapping or accept inconsistent observations", () => {
  expect(planLegacyMappings({ ...input, existing: [{ taskId: "t", eventId: "other" }] }).entries[0].decision).toMatchObject({ reason: "existing-mapping" });
  expect(() => planLegacyMappings({ ...input, observations: [observation, observation] })).toThrow();
  expect(() => planLegacyMappings({ ...input, tasks: [task, task] })).toThrow();
});
