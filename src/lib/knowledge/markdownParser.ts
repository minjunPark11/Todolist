// Structural parser for a single Obsidian note. Shared by Lite (file
// selection scoring) and Full (chunk/index metadata) — see
// KNOWLEDGE_BASE_DESIGN.md §4.4. Only frontmatter `tags` and `aliases` are
// structured; other frontmatter fields are out of scope by design.

export interface ParsedNoteHeading {
  level: number;
  text: string;
  offset: number;
}

export interface ParsedNoteTask {
  checked: boolean;
  text: string;
}

export interface ParsedNote {
  headings: ParsedNoteHeading[];
  tags: string[];
  aliases: string[];
  wikiLinks: string[];
  tasks: ParsedNoteTask[];
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*$/;
const INLINE_TAG_PATTERN = /(?:^|\s)#([\w/-]+)/g;
const WIKI_LINK_PATTERN = /\[\[([^\]|#]+)/g;
const TASK_PATTERN = /^\s*-\s\[([ xX])\]\s+(.*)$/;
const FENCE_PATTERN = /^\s*```/;

function stripQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function parseFrontmatterListField(frontmatter: string, key: string): string[] {
  const inlineMatch = frontmatter.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]\\s*$`, "m"));
  if (inlineMatch) {
    return inlineMatch[1].split(",").map(stripQuotes).filter(Boolean);
  }

  const blockMatch = frontmatter.match(new RegExp(`^${key}:\\s*\\n((?:\\s*-\\s*.+\\n?)+)`, "m"));
  if (blockMatch) {
    return blockMatch[1]
      .split("\n")
      .map((line) => stripQuotes(line.replace(/^\s*-\s*/, "")))
      .filter(Boolean);
  }

  const inlineScalarMatch = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (inlineScalarMatch) {
    return inlineScalarMatch[1].split(",").map(stripQuotes).filter(Boolean);
  }

  return [];
}

export function parseMarkdownNote(content: string): ParsedNote {
  const frontmatterMatch = content.match(FRONTMATTER_PATTERN);
  const frontmatter = frontmatterMatch?.[1] ?? "";
  const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;

  const headings: ParsedNoteHeading[] = [];
  const tasks: ParsedNoteTask[] = [];
  const inlineTags = new Set<string>();
  const wikiLinks = new Set<string>();

  let offset = 0;
  let inFence = false;
  for (const rawLine of body.split("\n")) {
    // Strip a trailing \r (CRLF files) so `$`-anchored patterns like
    // TASK_PATTERN match — `.` never consumes \r in JS regex, so a lone
    // trailing \r would otherwise make the anchor fail to reach.
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      offset += rawLine.length + 1;
      continue;
    }

    if (!inFence) {
      const headingMatch = line.match(HEADING_PATTERN);
      if (headingMatch) {
        headings.push({ level: headingMatch[1].length, text: headingMatch[2], offset });
      }

      const taskMatch = line.match(TASK_PATTERN);
      if (taskMatch) {
        tasks.push({ checked: taskMatch[1].toLowerCase() === "x", text: taskMatch[2] });
      }

      for (const match of line.matchAll(INLINE_TAG_PATTERN)) {
        inlineTags.add(match[1]);
      }
      for (const match of line.matchAll(WIKI_LINK_PATTERN)) {
        wikiLinks.add(match[1].trim());
      }
    }

    offset += rawLine.length + 1;
  }

  return {
    headings,
    tags: Array.from(new Set([...parseFrontmatterListField(frontmatter, "tags"), ...inlineTags])),
    aliases: parseFrontmatterListField(frontmatter, "aliases"),
    wikiLinks: Array.from(wikiLinks),
    tasks,
  };
}
