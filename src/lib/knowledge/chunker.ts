// Splits a note into retrieval-sized chunks for Full indexing (Phase 2).
// Heading is the primary boundary; a section that's still too long is split
// further at paragraph boundaries, never inside a fenced code block. See
// KNOWLEDGE_BASE_DESIGN.md §4.5.
import { FENCE_PATTERN, type ParsedNote } from "./markdownParser";

const CHUNK_TARGET_MAX = 900;
const CHUNK_OVERLAP_CHARS = 125; // within the design's 100-150 range

export interface NoteChunk {
  headingPath: string;
  // Approximate: the start offset of the section this chunk was split from,
  // not a precise per-chunk offset. No current consumer needs sub-chunk
  // precision, and tracking it through paragraph splitting isn't worth the
  // added complexity.
  startOffset: number;
  text: string;
}

type Section = { headingPath: string; start: number; end: number };

function buildSections(content: string, headings: ParsedNote["headings"]): Section[] {
  const sections: Section[] = [];
  const breadcrumbStack: { level: number; text: string }[] = [];

  if (headings.length === 0) {
    return content.trim() ? [{ headingPath: "", start: 0, end: content.length }] : [];
  }

  if (headings[0].offset > 0) {
    sections.push({ headingPath: "", start: 0, end: headings[0].offset });
  }

  headings.forEach((heading, index) => {
    while (breadcrumbStack.length && breadcrumbStack[breadcrumbStack.length - 1].level >= heading.level) {
      breadcrumbStack.pop();
    }
    breadcrumbStack.push({ level: heading.level, text: heading.text });

    const end = headings[index + 1]?.offset ?? content.length;
    sections.push({
      headingPath: breadcrumbStack.map((entry) => entry.text).join(" > "),
      start: heading.offset,
      end,
    });
  });

  return sections;
}

// Splits text into atomic blocks at blank lines, treating an unclosed fenced
// code block as one block regardless of blank lines inside it.
function splitIntoParagraphUnits(text: string): string[] {
  const units: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of text.split("\n")) {
    if (FENCE_PATTERN.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "" && current.length) {
      units.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) units.push(current.join("\n"));

  return units.map((unit) => unit.trim()).filter(Boolean);
}

function splitSection(section: Section, sectionText: string): NoteChunk[] {
  const units = splitIntoParagraphUnits(sectionText);
  if (!units.length) return [];

  const chunks: NoteChunk[] = [];
  let currentUnits: string[] = [];
  let currentLength = 0;
  let overlapPrefix = "";

  function flush() {
    if (!currentUnits.length) return;
    const body = currentUnits.join("\n\n");
    const text = overlapPrefix ? `${overlapPrefix}\n\n${body}` : body;
    chunks.push({ headingPath: section.headingPath, startOffset: section.start, text });
    overlapPrefix = body.length > CHUNK_OVERLAP_CHARS ? body.slice(-CHUNK_OVERLAP_CHARS) : body;
  }

  for (const unit of units) {
    const additional = unit.length + (currentUnits.length ? 2 : 0);
    if (currentUnits.length && currentLength + additional > CHUNK_TARGET_MAX) {
      flush();
      currentUnits = [unit];
      currentLength = unit.length;
    } else {
      currentUnits.push(unit);
      currentLength += additional;
    }
  }
  flush();

  return chunks;
}

export function chunkMarkdownNote(content: string, parsed: ParsedNote): NoteChunk[] {
  const sections = buildSections(content, parsed.headings);
  const chunks: NoteChunk[] = [];

  for (const section of sections) {
    const sectionText = content.slice(section.start, section.end).trim();
    if (!sectionText) continue;

    if (sectionText.length <= CHUNK_TARGET_MAX) {
      chunks.push({ headingPath: section.headingPath, startOffset: section.start, text: sectionText });
      continue;
    }

    chunks.push(...splitSection(section, sectionText));
  }

  return chunks;
}
