// The triangle that opens and shuts a group, everywhere one does.
//
// It was two CHARACTERS: `⌄` (U+2304, DOWN ARROWHEAD) when open and `›`
// (U+203A, SINGLE RIGHT-POINTING ANGLE QUOTATION MARK) when shut, written out
// at five call sites. Two problems, and they are the same problem seen twice:
//
//   - they are glyphs from different parts of the font. `⌄` is a wide, thin
//     mathematical mark and `›` is a punctuation chevron — different weights,
//     different optical sizes, different baselines. A group did not rotate its
//     arrow when it opened, it swapped it for a differently-drawn one, and the
//     two never matched.
//   - a text swap cannot be animated. There is nothing continuous between one
//     character and another, so the state changed by flicker.
//
// One drawing, turned. The chevron points right when shut and rotates a
// quarter turn to point down, which is the same shape in both states because
// it IS the same shape — and the turn is a transform, so it can be tweened.
//
// The app's reduced-motion rules (01-base.css) kill the transition without
// this file knowing: both the `[data-reduce-motion]` block and the
// `prefers-reduced-motion` query drop every transition to none.

/**
 * @param open Whether the section it belongs to is showing its contents.
 *   The caret is `aria-hidden` — the button around it carries `aria-expanded`,
 *   which is what a screen reader reads, and a second announcement of the same
 *   state would be read twice.
 */
export function Caret({ open }: { open: boolean }) {
  return (
    <span className={`ff-caret${open ? " is-open" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="12" height="12" focusable="false">
        {/* Drawn on the app's own icon grid — 24 viewBox, round joins — but at
            2.4 rather than 1.9: a chevron at 12px is three strokes' worth of
            ink and the house weight makes it disappear beside 11px text. */}
        <path
          d="M9.5 5.5L16 12l-6.5 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
