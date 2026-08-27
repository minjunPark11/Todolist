// The window's own caption row, drawn by the app (desktop only).
//
// The main window used to keep the system title bar, and on Windows that is a
// 32px band in the OS's own colour sitting on top of an app whose three
// columns each have a colour of their own. Nothing lines up with it: it is a
// strip of another program's chrome bolted to the top of ours.
//
// So the window is undecorated now (`decorations: false`, tauri.conf.json) and
// this draws what it replaced. Two things make it read as part of the app
// rather than as a bar:
//
//   1. It paints nothing of its own. `.window-titlebar-fill` continues the
//      columns underneath it — the Rail's own background reaches the top edge
//      by itself (it is `height: 100dvh` from y=0), and the fill draws the
//      Context Sidebar's colour and the page's colour in the same places the
//      columns below it draw them (19-app-shell.css).
//   2. It has no border, no shadow and no title text. What is left is the drag
//      region and the three window buttons, which is the only part the OS was
//      actually giving us.
//
// It mounts at the ROOT, beside <App/>, and not inside AppShell: the login and
// recovery gates return before the frame exists, and a window you cannot close
// while it is asking you to sign in is worse than a visible seam.
import { useEffect, useState, type CSSProperties } from "react";
import type { Window as TauriWindow } from "@tauri-apps/api/window";
import { translate } from "../../i18n";
import type { Language } from "../../types";

/** Windows' caption metrics: a 32px band, 46x32 buttons. */
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
      {/* The paint, separated from the controls on purpose. It sits at the
          bottom of the stack so a modal's backdrop dims it like the rest of
          the app, while the buttons stay on top and stay clickable — a dialog
          that takes away the close button is how an app gets force-quit. */}
      <div className="window-titlebar-fill" aria-hidden="true" />

      {/* Tauri reads this attribute off the element under the pointer, so the
          buttons — which do not carry it — are not drag handles. Double-click
          to maximize comes with it. */}
      <div className="window-titlebar-drag" data-tauri-drag-region />

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
