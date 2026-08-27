import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { FloatingLayerProvider } from "./components/floating";
import { MiniFocusTimerWindow } from "./components/MiniFocusTimerWindow";
import { WindowTitleBar } from "./components/shell/WindowTitleBar";
import { isTauriRuntime } from "./platform/tauri";
import "./styles.css";

// The desktop mini-timer window is flagged by an initialization script
// (window.__IS_MINI_FOCUS_TIMER__) injected in src-tauri open_focus_mini_timer,
// so it can load the same root URL as the main window. The query/hash fallbacks
// keep dev and browser-preview links (?miniFocusTimer=1) working.
const miniFocusTimerFlag =
  new URLSearchParams(window.location.search).get("miniFocusTimer") ??
  new URLSearchParams(window.location.hash.replace(/^#/, "")).get("miniFocusTimer");
const isMiniFocusTimerWindow =
  (window as unknown as { __IS_MINI_FOCUS_TIMER__?: boolean }).__IS_MINI_FOCUS_TIMER__ === true ||
  miniFocusTimerFlag === "1";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isMiniFocusTimerWindow ? (
      <MiniFocusTimerWindow />
    ) : (
      /* Above App rather than inside it (§19.6, §19.70): App returns from
         several branches — the recovery gate, the login gate, the Tasks
         module, the Spaces shell — and a provider mounted inside one of them
         would be a provider that a popover in another cannot reach. The
         mini-timer window is its own root with no floating UI, so it is
         deliberately left out. */
      <FloatingLayerProvider>
        {/* Outside App and above every route it can return: the login and
            recovery gates render before the shell exists, and the window has
            to stay draggable and closable there too. The mini-timer window is
            its own root below and keeps the system decorations, so it never
            gets one. */}
        {isTauriRuntime() ? <WindowTitleBar /> : null}
        <App />
      </FloatingLayerProvider>
    )}
  </React.StrictMode>,
);
