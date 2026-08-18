// Arrow-key movement inside a radio group (Add List design §9.9, §9.10).
//
// Pure, because the interesting part is not the DOM: §9.9's MUST is that an
// arrow inside a group is NOT read as moving focus around the dialog. A group
// is one Tab stop, and Left/Right choose within it — which is the ARIA radio
// pattern, and also why Tab enters at the SELECTED item rather than the first.
//
// Home and End are named per group in the design (§9.9 puts Home on "none",
// §9.10 puts it on List). Both reduce to the same thing: the ends of the list
// the caller passed, in the order it drew them.

export type RovingKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

export function isRovingKey(key: string): key is RovingKey {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "Home" ||
    key === "End"
  );
}

/**
 * The value the key moves to, or null when there is nothing to move to.
 *
 * Wraps at both ends. A radio group is a ring in the ARIA pattern, and the
 * alternative — stopping dead at the last swatch — reads as the key having
 * failed rather than as a boundary.
 *
 * An unknown current value starts from the beginning instead of refusing:
 * that happens when nothing is selected yet, which is a normal opening state
 * and not an error.
 */
export function rovingNext<T extends string>(values: readonly T[], current: T, key: RovingKey): T | null {
  if (values.length === 0) return null;
  if (key === "Home") return values[0];
  if (key === "End") return values[values.length - 1];

  const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  const index = values.indexOf(current);
  if (index === -1) return step === 1 ? values[0] : values[values.length - 1];
  return values[(index + step + values.length) % values.length];
}
