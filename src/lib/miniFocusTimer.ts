export type MiniFocusTimerSnapshot = {
  sessionId: string;
  title: string;
  remaining: string;
  status: "running" | "paused" | "completed" | "cancelled";
};

let miniWindow: Window | null = null;

export function supportsMiniFocusTimer() {
  return typeof window !== "undefined" && typeof window.open === "function";
}

function renderMiniTimerDocument(target: Window) {
  target.document.open();
  target.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>FocusFlow Mini Timer</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f5f7fb; color: #111827; }
      main { box-sizing: border-box; width: 100vw; min-height: 100vh; display: grid; place-items: center; padding: 18px; }
      section { width: min(100%, 280px); display: grid; gap: 14px; border: 1px solid #e5e7eb; border-radius: 18px; padding: 18px; background: #fff; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.14); text-align: center; }
      header { display: flex; justify-content: space-between; align-items: center; color: #6b7280; font-size: 13px; font-weight: 800; }
      button { min-height: 40px; border: 1px solid #dbe4ff; border-radius: 12px; background: #fff; color: #4f73ff; font-weight: 850; cursor: pointer; }
      button.danger { border-color: #ffd1cc; color: #b42318; background: #fff7f6; }
      #time { font-size: 46px; line-height: 1; font-weight: 900; font-variant-numeric: tabular-nums; }
      #title { overflow-wrap: anywhere; font-weight: 750; }
      #status { color: #6b7280; font-size: 13px; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <header><span>FocusFlow</span><button type="button" id="close" aria-label="Close">x</button></header>
        <div id="time">--:--</div>
        <div id="title">Focus session</div>
        <div id="status">Running</div>
        <div class="actions">
          <button type="button" id="toggle">Pause</button>
          <button type="button" class="danger" id="finish">Finish</button>
        </div>
      </section>
    </main>
    <script>
      let snapshot = null;
      function post(action) {
        if (!snapshot || !window.opener) return;
        window.opener.postMessage({ type: "focusflow-mini-timer", action, sessionId: snapshot.sessionId }, "*");
      }
      window.updateFocusTimer = function(next) {
        snapshot = next;
        document.getElementById("time").textContent = next.remaining;
        document.getElementById("title").textContent = next.title || "Focus session";
        document.getElementById("status").textContent = next.status === "paused" ? "Paused" : next.status === "completed" ? "Completed" : "Running";
        document.getElementById("toggle").textContent = next.status === "paused" ? "Resume" : "Pause";
      };
      document.getElementById("toggle").addEventListener("click", function() {
        post(snapshot && snapshot.status === "paused" ? "resume" : "pause");
      });
      document.getElementById("finish").addEventListener("click", function() { post("finish"); });
      document.getElementById("close").addEventListener("click", function() { window.close(); });
    </script>
  </body>
</html>`);
  target.document.close();
}

export function openMiniFocusTimer(snapshot: MiniFocusTimerSnapshot) {
  if (!supportsMiniFocusTimer()) return false;
  if (!miniWindow || miniWindow.closed) {
    miniWindow = window.open("", "focusflow-mini-timer", "popup=yes,width=340,height=300");
    if (!miniWindow) return false;
    renderMiniTimerDocument(miniWindow);
  }
  updateMiniFocusTimer(snapshot);
  miniWindow.focus();
  return true;
}

export function updateMiniFocusTimer(snapshot: MiniFocusTimerSnapshot) {
  if (!miniWindow || miniWindow.closed) return;
  const update = (miniWindow as Window & { updateFocusTimer?: (next: MiniFocusTimerSnapshot) => void }).updateFocusTimer;
  update?.(snapshot);
}
