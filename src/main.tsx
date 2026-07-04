import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MiniFocusTimerWindow } from "./components/MiniFocusTimerWindow";
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
    {isMiniFocusTimerWindow ? <MiniFocusTimerWindow /> : <App />}
  </React.StrictMode>,
);
