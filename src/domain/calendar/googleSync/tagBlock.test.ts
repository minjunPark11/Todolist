import { expect, it } from "vitest";
import { stripTagBlock, withTagBlock, outboundTagNames } from "./tagBlock";
import type { Tag, TaskTag } from "../../../types";

it("round trips exact body whitespace, empty bodies and multiword tags without accumulation", () => {
  for (const body of ["", "Notes", "Notes\n\n", "본문\r\n "]) {
    const once = withTagBlock(body, ["급함", "two words", "100%"]);
    expect(stripTagBlock(once)).toBe(body);
    expect(withTagBlock(once, ["급함", "two words", "100%"]).match(/--- FocusFlow ---/g)).toHaveLength(1);
    expect(withTagBlock(once, [])).toBe(body);
  }
});

it("does not delete prose or markers in the middle, and repairs stacked suffixes", () => {
  for (const body of ["x\n\n--- FocusFlow ---\nprose", "--- FocusFlow ---\n#tag\nmore", "--- FocusFlow ---\n#tag prose"]) {
    expect(stripTagBlock(body)).toBe(body);
  }
  expect(stripTagBlock("body\n\n--- FocusFlow ---\n#old\n\n--- FocusFlow ---\n#new")).toBe("body");
  expect(stripTagBlock("body\r\n\r\n--- FocusFlow ---\r\n#tag")).toBe("body");
});

it("merges canonical and legacy user tags deterministically and excludes system markers", () => {
  const task = { id: "t", tags: ["work", " Other ", "space:x", "group:y"] };
  const tags = [{ id: "canonical", name: "Work" }] as Tag[];
  const links = [{ taskId: "t", tagId: "canonical" }] as TaskTag[];
  expect(withTagBlock("body", outboundTagNames(task, tags, links))).toBe("body\n\n--- FocusFlow ---\n#Other #Work");
});
