// Put text on the clipboard, or say that it could not be done (spec §15.22).
//
// The two existing callers — the model path chip and the calendar share URL —
// each wrote `navigator.clipboard.writeText` in a try/catch and swallowed the
// failure. §15.22 refuses that shape for a menu action: "메뉴 action 자체가
// 아무 반응 없이 끝나면 안 된다", and a caller that cannot tell success from
// failure has nothing to report either way.
//
// So this returns a boolean rather than throwing, and the caller decides what
// to show. It never throws — a clipboard that refuses is a normal outcome
// here, not an exception.

/**
 * The path the Clipboard API cannot take.
 *
 * `navigator.clipboard` is undefined on an insecure origin and rejects when
 * the document is not focused or permission is denied. `execCommand("copy")`
 * is deprecated and still the only thing that works in those cases, so it is
 * the fallback and not the first choice.
 *
 * The textarea is off-screen rather than `display: none`: a hidden element
 * cannot hold a selection, and a selection is what `execCommand` copies.
 */
function copyByExecCommand(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  field.style.opacity = "0";
  document.body.appendChild(field);

  try {
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/** True when the text is on the clipboard, false when it could not be put there. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied, or the document was not focused. Fall through — the old path
    // still works in both cases.
  }
  return copyByExecCommand(text);
}
