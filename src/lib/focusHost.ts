import type { FocusCommand } from "../domain/focus/engine";

/** One writer across same-origin main tabs. Mini windows remain command clients. */
export function connectFocusHost(handlers: {
  acquired: () => void;
  ready: () => void;
  run: (command: FocusCommand) => boolean;
  error: (message: string) => void;
}) {
  let owned = false,
    stopped = false,
    requesting = false;
  let release: (() => void) | undefined;
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("focusflow.focus.commands.v2")
      : null;
  const replies = new Map<string, boolean>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  channel?.addEventListener("message", (event) => {
    const value = event.data;
    if (value?.type === "probe" && owned)
      channel?.postMessage({ type: "ready" });
    else if (value?.type === "ready") handlers.ready();
    else if (
      value?.type === "command" &&
      typeof value.id === "string" &&
      owned &&
      value.command &&
      typeof value.command.type === "string"
    ) {
      const ok = replies.has(value.id)
        ? replies.get(value.id)!
        : handlers.run(value.command);
      replies.set(value.id, ok);
      if (replies.size > 200) replies.delete(replies.keys().next().value!);
      channel.postMessage({ type: "ack", id: value.id, ok });
    } else if (value?.type === "ack" && pending.has(value.id)) {
      clearTimeout(pending.get(value.id));
      pending.delete(value.id);
      if (!value.ok)
        handlers.error(
          "기록을 저장하지 못했습니다. 주 창에서 확인해 주세요. / Check the main window: command was not saved.",
        );
    }
  });
  async function acquire() {
    if (owned || stopped || requesting) return;
    requesting = true;
    if (!navigator.locks) {
      owned = true;
      handlers.acquired();
      handlers.ready();
      requesting = false;
      return;
    }
    try {
      await navigator.locks.request(
        "focusflow.focus.host.v2",
        { ifAvailable: true },
        async (lock) => {
          if (stopped) return;
          if (!lock) {
            channel?.postMessage({ type: "probe" });
            return;
          }
          owned = true;
          handlers.acquired();
          handlers.ready();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          owned = false;
        },
      );
    } catch {
      handlers.error("타이머 제어권을 얻지 못했어요. 앱을 다시 열어 주세요. / Could not acquire the timer. Reopen the app.");
    } finally {
      requesting = false;
    }
  }
  void acquire();
  const retry = setInterval(() => void acquire(), 2000);
  return {
    get owned() {
      return owned;
    },
    send(command: FocusCommand) {
      if (owned) return handlers.run(command);
      if (!channel) {
        handlers.error(
          "타이머 연결을 확인해 주세요. / Timer connection unavailable.",
        );
        return false;
      }
      const id = crypto.randomUUID();
      pending.set(
        id,
        setTimeout(() => {
          pending.delete(id);
          handlers.error(
            "타이머 응답이 없습니다. 주 창을 확인해 주세요. / Timer did not respond. Check the main window.",
          );
        }, 5000),
      );
      channel.postMessage({ type: "command", id, command });
      // Receipt is not persistence. The storage event supplies the confirmed state.
      return false;
    },
    close() {
      stopped = true;
      release?.();
      clearInterval(retry);
      pending.forEach(clearTimeout);
      channel?.close();
    },
  };
}
