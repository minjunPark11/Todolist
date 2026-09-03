// The window's own caption row, drawn by the app (desktop only).
//
// The main window used to keep the system title bar, and on Windows that is a
// 32px band in the OS's own colour sitting on top of an app whose three
// columns each have a colour of their own. Nothing lines up with it: it is a
// strip of another program's chrome bolted to the top of ours.
//
// So the window is undecorated now (`decorations: false`, tauri.conf.json) and
// this draws what it replaced — which, after WINDOW_TOP_ROW_DESIGN.md §3, is
// three buttons and nothing else:
//
//   1. It paints nothing, and reserves nothing. The caption row is the app's
//      own first row — the Rail's top, the sidebar's first item, the page's
//      title — so the colours up there are the columns' own rather than a
//      gradient imitating them, and the 48px of empty band that used to sit
//      above the app is gone.
//   2. What is left is the three window buttons at the right, and the 138px
//      the rows underneath them keep clear (`--titlebar-buttons-w`). Dragging
//      belongs to those rows, through `data-tauri-drag-region` on each.
//
// It mounts at the ROOT, beside <App/>, and not inside AppShell: the login and
// recovery gates return before the frame exists, and a window you cannot close
// while it is asking you to sign in is worse than a visible seam.
import { useEffect, useState, type CSSProperties } from "react";
import type { Window as TauriWindow } from "@tauri-apps/api/window";
import { translate } from "../../i18n";
import type { Language } from "../../types";

/** Windows' caption metrics: 46x32 buttons in a 32px band. */
const TITLEBAR_HEIGHT = 32;

/** App.tsx writes the language onto <html lang>; this is downstream of that.
 *  The bar renders outside I18nProvider (see the file comment), so it reads
 *  the same attribute the provider sets rather than the context. */
function useRootLang(): Language {
  const [lang, setLang] = useState<Language>(
    () => (document.documentElement.lang as Language) || "en",
  );
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setLang((root.lang as Language) || "en");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);
  return lang;
}

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function WindowTitleBar() {
  const lang = useRootLang();
  const [isMaximized, setIsMaximized] = useState(false);

  // The stylesheet only offsets the app for a caption row that actually
  // exists: everything keyed on `[data-window-chrome="custom"]` is inert in
  // the browser build and in the e2e suite, which still run decorated by the
  // browser itself.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.windowChrome = "custom";
    return () => {
      delete root.dataset.windowChrome;
    };
  }, []);

  // The maximize button has to say which way it goes, and the window can be
  // maximized without it — a double-click on the drag region, Win+Up, or a
  // snap. `onResized` is the one event all three end in.
  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const sync = async () => {
          const maximized = await win.isMaximized();
          if (alive) setIsMaximized(maximized);
        };
        await sync();
        const stop = await win.onResized(() => void sync());
        if (alive) unlisten = stop;
        else stop();
      } catch {
        // No window API (a browser tab that somehow rendered this): the bar
        // still drags nothing and the buttons no-op, which is better than a
        // crash at the root.
      }
    })();

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  async function withWindow(action: (win: TauriWindow) => unknown) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await action(getCurrentWindow());
    } catch {
      /* see the effect above */
    }
  }

  return (
    <div
      className="window-titlebar"
      style={{ "--titlebar-h": `${TITLEBAR_HEIGHT}px` } as CSSProperties}
    >
      {/* The fill and the drag strip stood here (WINDOW_TOP_ROW_DESIGN.md §3).
          The fill painted the caption row by continuing the columns beneath it,
          because the row was EMPTY — and continuing a colour is only ever an
          imitation of the thing it continues, which is how the Tasks module
          ended up with a white band over a grey page. The row is not empty any
          more: the app's own first row lives there and paints itself.

          The 32px strip that carried `data-tauri-drag-region` went with it for
          the same reason — spanning the window at z-index 70, it would now sit
          on top of the sidebar's first item and the title, eating their
          clicks. The rows that are up there carry the attribute themselves. */}

      <div className="window-titlebar-buttons">
        <button
          type="button"
          className="window-button"
          aria-label={translate(lang, "window.minimize")}
          title={translate(lang, "window.minimize")}
          onClick={() => void withWindow((win) => win.minimize())}
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          className="window-button"
          aria-label={translate(lang, isMaximized ? "window.restore" : "window.maximize")}
          title={translate(lang, isMaximized ? "window.restore" : "window.maximize")}
          onClick={() => void withWindow((win) => win.toggleMaximize())}
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          className="window-button is-close"
          aria-label={translate(lang, "window.close")}
          title={translate(lang, "window.close")}
          onClick={() => void withWindow((win) => win.close())}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
