// Enter and Space on an event block (CALENDAR_TASK_CHECKBOX_DESIGN.md §2.1, D2-A).
//
// The three event surfaces were `<button>`s. A `<button>` may not contain
// interactive content, and §4 puts a real `<input type="checkbox">` inside
// each of them, so they became `<div role="button" tabIndex={0}>`. What that
// costs is the keyboard activation the element used to give away — four
// lines, which is the whole of the trade §2.1 accepted.
//
// The guard on `target` is the half that is easy to miss: keydown bubbles, so
// without it a Space pressed on the checkbox INSIDE the block would tick the
// box and open the block's popover in the same keystroke.
import type { KeyboardEvent } from "react";

export function activateOnKey<T extends HTMLElement>(
  run: (event: KeyboardEvent<T>) => void,
) {
  return (event: KeyboardEvent<T>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    // Space scrolls the grid otherwise, and the grid is a scroller.
    event.preventDefault();
    run(event);
  };
}
