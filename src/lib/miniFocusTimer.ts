export type MiniFocusTimerSnapshot = {
  sessionId: string;
  title: string;
  // The host supplies the mode-aware display; this window never finalizes time.
  time: string;
  status: "running" | "paused" | "completed" | "cancelled";
  phase?: "focus" | "break";
  revision?: number;
  /**
   * 주 창이 아직 저장하지 못한 상태인가.
   *
   * 없을 때 이런 일이 벌어졌다 [실측, e2e]: 저장이 실패한 채 일시정지를
   * 누르면 주 창은 "Could not save focus" 와 Retry 를 내놓는데, 미니 창은
   * 그냥 "Paused" 였다. 창이 둘인데 이야기가 둘이었다 — 작은 창만 보던
   * 사람은 멈췄고 적혔다고 믿는다.
   *
   * ack 의 `ok:false` 로 한 번만 알리는 방법도 있었지만, 그러면 그 순간을
   * 놓친 창은 영영 모른다. 상태에 실어 보내면 매 갱신마다 사실이 실린다.
   */
  unsaved?: boolean;
};

let miniWindow: Window | null = null;
export function isMiniFocusTimerSource(source: MessageEventSource | null) { return Boolean(miniWindow && source === miniWindow); }

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
      let snapshot = null, lastUpdate = Date.now(), pending = null;
      function post(action) {
        if (!snapshot || !snapshot.sessionId || !window.opener || window.opener.closed) return;
        pending = { id: crypto.randomUUID(), revision: snapshot.revision, at: Date.now() };
        document.getElementById("toggle").disabled = true;
        document.getElementById("finish").disabled = true;
        window.opener.postMessage({ type: "focusflow-mini-timer", action, sessionId: snapshot.sessionId, revision: snapshot.revision, commandId: pending.id }, window.location.origin);
      }
      window.updateFocusTimer = function(next) {
        lastUpdate = Date.now();
        if (pending && (next.revision !== pending.revision || next.sessionId !== snapshot.sessionId)) pending = null;
        snapshot = next;
        document.getElementById("toggle").disabled = !next.sessionId || !!pending;
        document.getElementById("finish").disabled = !next.sessionId || !!pending;
        document.getElementById("time").textContent = next.time;
        document.getElementById("title").textContent = next.title || "Focus session";
        var state = !next.sessionId ? "Idle" : next.phase === "break" ? (next.status === "paused" ? "Break paused" : "Taking a break") : next.status === "paused" ? "Paused" : "Running";
        // 저장되지 않은 상태를 멀쩡한 상태로 그리지 않는다. 주 창은 이때
        // Retry 를 내놓고 있다.
        document.getElementById("status").textContent = next.unsaved ? "Not saved \u00b7 retry in the main window" : state;
        document.getElementById("toggle").textContent = next.status === "paused" ? "Resume" : "Pause";
        document.getElementById("finish").textContent = next.phase === "break" ? "End break" : "Finish";
      };
      window.addEventListener("message", function(event) {
        if (event.origin !== window.location.origin || event.source !== window.opener || event.data?.type !== "focusflow-mini-ack" || event.data.commandId !== pending?.id) return;
        // 성공이든 거절이든 답이 온 것이고, 기다림은 끝났다. 전에는 ok 가
        // 참일 때만 풀어서, 답이 오지 않는 경로와 거절을 구별하지 못했다.
        // (여기는 템플릿 리터럴 안이다 - 역따옴표를 쓰면 문서가 잘린다.)
        pending = null;
        if (snapshot) window.updateFocusTimer(snapshot);
      });
      setInterval(function() {
        if (!window.opener || window.opener.closed || Date.now() - lastUpdate > 45000 || (pending && Date.now() - pending.at > 5000)) {
          document.getElementById("status").textContent = "Connection lost · last known state";
          document.getElementById("toggle").disabled = true;
          document.getElementById("finish").disabled = true;
        }
      }, 1000);
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
