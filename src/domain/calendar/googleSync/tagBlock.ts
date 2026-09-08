import { isUserTag, tagKeyFor, tagsForTask } from "../../tags/tags";
import type { Tag, Task, TaskTag } from "../../../types";

const MARKER = "--- FocusFlow ---";
// Keep the exact user body, including its trailing whitespace. Only remove the
// separator that the writer added. CRLF is accepted from Google's editors.
export function stripTagBlock(description: string): string {
  let result = description;
  const suffix = /(?:\r?\n\r?\n|^)--- FocusFlow ---\r?\n#\S+(?: #\S+)*$/;
  for (;;) {
    const next = result.replace(suffix, "");
    if (next === result) return result;
    result = next;
  }
}

export function withTagBlock(description: string, tags: readonly string[]): string {
  const body = stripTagBlock(description);
  const names = new Map<string, string>();
  for (const tag of tags) {
    if (isUserTag(tag) && !names.has(tagKeyFor(tag))) names.set(tagKeyFor(tag), tag.trim());
  }
  // A tag may contain spaces. Escape only whitespace and '%' so each tag stays
  // one token, remains reversible, and satisfies the conservative suffix parser.
  const line = [...names.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([, name]) => `#${name.replace(/%|\s/gu, (char) => encodeURIComponent(char))}`).join(" ");
  return line ? `${body}${body ? "\n\n" : ""}${MARKER}\n${line}` : body;
}

export function outboundTagNames(task: Pick<Task, "id" | "tags">, tags: Tag[], links: TaskTag[]): string[] {
  return [...tagsForTask(task.id, tags, links).map((tag) => tag.name), ...task.tags.filter(isUserTag)];
}
