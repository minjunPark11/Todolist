// The sidebar's row glyphs (FOLDER_TREE_AND_VIEW_DESIGN.md §3).
//
// What they are for: until now every row in this sidebar was the same shape —
// a label, sometimes a dot, sometimes a count — and the ONLY thing separating
// a Folder from a List was 26px of indent (§2.1). A Folder never said it was
// one; the reader inferred it from something being underneath.
//
// Drawn rather than typed. `schedule/icons.tsx` states the three reasons at
// length and they hold exactly as well here: an emoji's glyph is the operating
// system's, its colour is the font's — so it will not dim with a disabled row
// or invert in dark — and its size is the type scale's, so the density setting
// moves it.
//
// Same hand as the rest of the app: viewBox 24, stroke 1.9, `currentColor`,
// and 16px in a 36px row.
//
// `aria-hidden` on every one (§3.5). The row's accessible name is its label,
// and giving a screen reader "folder School" where the screen says "School"
// would make the two disagree about what the row is called.
import type { ReactNode } from "react";

interface IconProps {
  /** 16 for a sidebar row. The prop exists for the day something else uses one. */
  size?: number;
}

function Frame({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * A group of Lists, shut.
 *
 * A pair, and it arrived with the disclosure control it needed (§13.3). It was
 * one glyph while folders could not be folded, because a folder drawn open
 * when it cannot be shut is a picture of a state with no opposite.
 *
 * The caret beside it says the same thing, and that duplication is deliberate:
 * in a long tree the eye lands on the 16px glyph before the 12px caret.
 */
export function FolderIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.2l2 2.4h7.8a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" {...STROKE} />
    </Frame>
  );
}

/**
 * The same folder, open — the front flap tipped forward.
 *
 * Same outer silhouette as the shut one so the row does not change size or
 * weight when it is folded; what moves is the face.
 */
export function FolderOpenIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M3.5 18.5V7.5a2 2 0 0 1 2-2h3.2l2 2.4h7.8a2 2 0 0 1 2 2v1.6" {...STROKE} />
      <path d="M3.5 18.5l2.3-6.2a2 2 0 0 1 1.9-1.3h13.4a1 1 0 0 1 .95 1.32l-2 6a2 2 0 0 1-1.9 1.38H5.5a2 2 0 0 1-2-2Z" {...STROKE} />
    </Frame>
  );
}

/** A List — the rows of work in it. */
export function ListIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M4.5 7h15M4.5 12h15M4.5 17h15" {...STROKE} />
    </Frame>
  );
}

/**
 * 오늘 — the sun, up.
 *
 * The same drawing as the Schedule Editor's 오늘 shortcut, and deliberately a
 * copy rather than an import: that file is the editor's own icon set and this
 * one is the sidebar's, so making either depend on the other would mean a
 * change for one screen silently landing on the other.
 */
export function TodayIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <circle cx="12" cy="12" r="4" {...STROKE} />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" {...STROKE} />
    </Frame>
  );
}

/** 다음 7일 — a calendar carrying the number, because that is the whole meaning. */
export function UpcomingIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...STROKE} />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" {...STROKE} />
      <text x="12" y="17.8" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" stroke="none">
        7
      </text>
    </Frame>
  );
}

/** 기본함 — the tray everything unfiled lands in. */
export function InboxIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M3.5 13.5 6 5.8a2 2 0 0 1 1.9-1.3h8.2A2 2 0 0 1 18 5.8l2.5 7.7" {...STROKE} />
      <path d="M3.5 13.5h4l1.2 2.4h6.6l1.2-2.4h4v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" {...STROKE} />
    </Frame>
  );
}

/** 완료 */
export function CompletedIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <circle cx="12" cy="12" r="8.5" {...STROKE} />
      <path d="M8.2 12.2l2.6 2.6 5-5.4" {...STROKE} />
    </Frame>
  );
}

/** 휴지통 */
export function TrashIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M4.5 6.5h15" {...STROKE} />
      <path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" {...STROKE} />
      <path d="M6.5 6.5l.9 12a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12" {...STROKE} />
      <path d="M10.5 10.5v6M13.5 10.5v6" {...STROKE} />
    </Frame>
  );
}

/** A Tag. */
export function TagIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M4 11.2V5.4A1.4 1.4 0 0 1 5.4 4h5.8a2 2 0 0 1 1.4.6l7 7a1.4 1.4 0 0 1 0 2l-5.6 5.6a1.4 1.4 0 0 1-2 0l-7-7a2 2 0 0 1-.6-1.4Z" {...STROKE} />
      <circle cx="8.4" cy="8.4" r="1.3" {...STROKE} />
    </Frame>
  );
}

/** A saved Filter. */
export function FilterIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M4 5.5h16l-6.2 7.3v6.1l-3.6-2v-4.1Z" {...STROKE} />
    </Frame>
  );
}
