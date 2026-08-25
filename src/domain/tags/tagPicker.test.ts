import { describe, expect, it } from "vitest";
import type { Tag, Task, TaskTag } from "../../types";
import {
  MAX_TAG_NAME,
  normalizeTagName,
  tagCreateOffer,
  tagNameRefusal,
  tagPickerOptions,
  toggleTaskTag,
} from "./tagPicker";
import { tagIdFor, taskTagIdFor } from "./tags";

const NOW = "2026-08-25T00:00:00.000Z";

function tag(name: string, extra: Partial<Tag> = {}): Tag {
  return { id: tagIdFor(name), name, createdAt: NOW, updatedAt: NOW, ...extra };
}

function link(taskId: string, name: string): TaskTag {
  return { id: taskTagIdFor(taskId, tagIdFor(name)), taskId, tagId: tagIdFor(name), createdAt: NOW };
}

function task(tags: string[] = []): Pick<Task, "id" | "tags"> {
  return { id: "t1", tags };
}

const research = tag("research");
const urgent = tag("urgent");
const meeting = tag("meeting");
const tags = [research, urgent, meeting];

describe("normalizeTagName (§13.35)", () => {
  it("strips the display hash, because it is a prefix and not the name", () => {
    expect(normalizeTagName("#research")).toBe("research");
    expect(normalizeTagName("  #research  ")).toBe("research");
  });

  // Eating every hash would silently rename someone's actual tag.
  it("removes only one hash", () => {
    expect(normalizeTagName("##research")).toBe("#research");
  });
});

describe("tagNameRefusal (§13.35)", () => {
  it("accepts an ordinary name", () => {
    expect(tagNameRefusal("research")).toBeNull();
    expect(tagNameRefusal("#research")).toBeNull();
  });

  it("refuses nothing and whitespace alike", () => {
    expect(tagNameRefusal("")).toBe("empty");
    expect(tagNameRefusal("   ")).toBe("empty");
    expect(tagNameRefusal("#")).toBe("empty");
  });

  it("refuses a name past the limit", () => {
    expect(tagNameRefusal("a".repeat(MAX_TAG_NAME))).toBeNull();
    expect(tagNameRefusal("a".repeat(MAX_TAG_NAME + 1))).toBe("too-long");
  });

  it("refuses control characters", () => {
    expect(tagNameRefusal(`re${String.fromCharCode(9)}search`)).toBe("control-characters");
    expect(tagNameRefusal(`re${String.fromCharCode(127)}search`)).toBe("control-characters");
  });

  // A user tag by this name would be hidden by the filter that hides the
  // legacy membership markers, so it would look like it had not been saved.
  it("refuses the legacy membership markers", () => {
    expect(tagNameRefusal("space:abc")).toBe("reserved");
    expect(tagNameRefusal("group:abc")).toBe("reserved");
  });
});

describe("tagPickerOptions (§13.37)", () => {
  it("lists every tag, marking the ones this Task carries", () => {
    const options = tagPickerOptions("t1", tags, [link("t1", "research"), link("t1", "urgent")]);
    expect(options.map((o) => [o.tag.name, o.selected])).toEqual([
      ["meeting", false],
      ["research", true],
      ["urgent", true],
    ]);
  });

  // The picker is multi-select, so the list is also how a tag comes OFF — a
  // ticked tag that jumped to its own section would move under the pointer.
  it("keeps the ticked tags in place rather than grouping them apart", () => {
    const options = tagPickerOptions("t1", tags, [link("t1", "urgent")]);
    expect(options.map((o) => o.tag.name)).toEqual(["meeting", "research", "urgent"]);
  });

  it("filters by what has been typed, hash or no hash", () => {
    expect(tagPickerOptions("t1", tags, [], "rese").map((o) => o.tag.name)).toEqual(["research"]);
    expect(tagPickerOptions("t1", tags, [], "#rese").map((o) => o.tag.name)).toEqual(["research"]);
  });

  it("leaves out archived tags", () => {
    const archived = [...tags, tag("old", { archivedAt: NOW })];
    expect(tagPickerOptions("t1", archived, []).map((o) => o.tag.name)).not.toContain("old");
  });
});

describe("tagCreateOffer (§13.41)", () => {
  it("offers the typed name when nothing like it exists", () => {
    expect(tagCreateOffer("newtag", tags)).toBe("newtag");
    expect(tagCreateOffer("#newtag", tags)).toBe("newtag");
  });

  // Otherwise someone is invited to make a duplicate of the tag sitting two
  // rows above, which §13.34 would then have to merge away.
  it("offers nothing when the tag already exists, in any case", () => {
    expect(tagCreateOffer("research", tags)).toBeNull();
    expect(tagCreateOffer("RESEARCH", tags)).toBeNull();
  });

  it("offers nothing for a name that would be refused", () => {
    expect(tagCreateOffer("", tags)).toBeNull();
    expect(tagCreateOffer("   ", tags)).toBeNull();
    expect(tagCreateOffer("a".repeat(MAX_TAG_NAME + 1), tags)).toBeNull();
  });
});

describe("toggleTaskTag (§13.39, §13.42, §13.45)", () => {
  it("links an existing tag without creating a second record", () => {
    const result = toggleTaskTag(task(), "research", tags, [], NOW)!;
    expect(result.tags).toHaveLength(3);
    expect(result.taskTags.map((l) => l.tagId)).toEqual([research.id]);
    expect(result.taskTagNames).toEqual(["research"]);
  });

  // §13.42: one user action, one state. A separate create step could fail and
  // leave a Tag record that nothing points at.
  it("creates the tag and the link together when it is new", () => {
    const result = toggleTaskTag(task(), "newtag", tags, [], NOW)!;
    expect(result.tags.map((t) => t.name)).toContain("newtag");
    expect(result.taskTags).toHaveLength(1);
    expect(result.taskTagNames).toEqual(["newtag"]);
  });

  // §13.45, the rule this whole module exists to keep: unticking a tag on one
  // Task must not take it off the other forty.
  it("removes the relation and leaves the tag alone", () => {
    const links = [link("t1", "research"), link("t2", "research")];
    const result = toggleTaskTag(task(["research"]), "research", tags, links, NOW)!;
    expect(result.tags).toHaveLength(3);
    expect(result.taskTags.map((l) => l.taskId)).toEqual(["t2"]);
    expect(result.taskTagNames).toEqual([]);
  });

  // §13.34 keeps the case a tag was created with; a search for "research"
  // must not quietly recase the record to what was typed.
  it("keeps the existing tag's own spelling", () => {
    const cased = [tag("Research")];
    const result = toggleTaskTag(task(), "research", cased, [], NOW)!;
    expect(result.tags).toHaveLength(1);
    expect(result.taskTagNames).toEqual(["Research"]);
  });

  // The relation is canonical (§26.9); `Task.tags` is the mirror an older
  // client reads, and the two must not be able to disagree.
  it("keeps Task.tags in step with the relation", () => {
    const added = toggleTaskTag(task([]), "urgent", tags, [], NOW)!;
    expect(added.taskTagNames).toEqual(["urgent"]);
    const removed = toggleTaskTag(task(added.taskTagNames), "urgent", added.tags, added.taskTags, NOW)!;
    expect(removed.taskTagNames).toEqual([]);
    expect(removed.taskTags).toEqual([]);
  });

  it("does not duplicate a name already in Task.tags", () => {
    const result = toggleTaskTag(task(["Urgent"]), "urgent", tags, [], NOW)!;
    expect(result.taskTagNames).toEqual(["urgent"]);
  });

  it("writes nothing for a name §13.35 refuses", () => {
    expect(toggleTaskTag(task(), "", tags, [], NOW)).toBeNull();
    expect(toggleTaskTag(task(), "space:abc", tags, [], NOW)).toBeNull();
  });
});
