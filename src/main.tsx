import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { MiniFocusTimerWindow } from "./components/MiniFocusTimerWindow";
import "./styles.css";

const isMiniFocusTimerWindow = new URLSearchParams(window.location.search).get("miniFocusTimer") === "1";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isMiniFocusTimerWindow ? <MiniFocusTimerWindow /> : <App />}
  </React.StrictMode>,
);
