import { expect, it, vi } from "vitest";
import { runLabels } from "./googleCalendarLabels";
import type { Project } from "../types";
const project = { id: "p", name: "Work", color: "#123456", updatedAt: "2026-01-01" } as Project;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

it("preserves metadata and uses If-Match; retries a concurrent palette change", async () => {
  const request = vi.fn().mockResolvedValueOnce(reply({ summary: "FocusFlow", etag: "v1" }))
    .mockResolvedValueOnce(reply({}, 412))
    .mockResolvedValueOnce(reply({ summary: "FocusFlow", etag: "v2", labelProperties: { eventLabels: [{ id: "foreign", backgroundColor: "#ffffff" }] } }))
    .mockImplementationOnce(async (_url, init) => reply(JSON.parse(init.body)));
  const result = await runLabels("cal", "token", [project], request);
  expect(result.supported).toBe(true);
  expect(result.mappings).toHaveLength(1);
  const init = request.mock.calls[3][1];
  expect(init.headers["If-Match"]).toBe("v2");
  expect(JSON.parse(init.body)).toMatchObject({ summary: "FocusFlow", labelProperties: { eventLabels: expect.arrayContaining([{ id: "foreign", backgroundColor: "#ffffff" }]) } });
});

it.each([
  [400, "Labels not supported", false],
  [403, "Rate Limit Exceeded", null],
  [403, "Insufficient Permission", null],
  [400, "Invalid label color", null],
  [500, "Internal error", null],
])("classifies %s %s without poisoning support detection", async (status, message, supported) => {
  const request = vi.fn().mockResolvedValueOnce(reply({ summary: "FocusFlow" }))
    .mockResolvedValueOnce(reply({ error: { message } }, status));
  const result = await runLabels("cal", "token", [project], request);
  expect(result.supported).toBe(supported);
  expect(result.mappings).toEqual([]);
});

it("does not record a mapping if a successful server response ignored the labels", async () => {
  const request = vi.fn().mockResolvedValue(reply({ summary: "FocusFlow" }));
  expect((await runLabels("cal", "token", [project], request)).mappings).toEqual([]);
});
