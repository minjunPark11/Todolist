const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [role="menuitem"], [role="tab"], [role="slider"], [contenteditable]:not([contenteditable="false"]), [data-window-no-drag]';

/** Capture before Tauri's exact-target listener so each gesture runs once. */
export function installWindowDragging(
  startDragging: () => Promise<unknown>,
  toggleMaximize: () => Promise<unknown>,
) {
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const target = event.target;
    if (target.closest(INTERACTIVE)) return;
    const inHeader = target.closest('[data-tauri-drag-region]');
    // The existing top padding is also a usable grip, including above the sidebar.
    const inTopPadding = event.clientY >= 0 && event.clientY < 16
      && target.closest('.app-frame')
      && !target.closest('[role="dialog"], [role="menu"]');
    if (!inHeader && !inTopPadding) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void (event.detail === 2 ? toggleMaximize() : startDragging()).catch(console.error);
  };
  document.addEventListener('mousedown', onMouseDown, true);
  return () => document.removeEventListener('mousedown', onMouseDown, true);
}
