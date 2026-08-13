import { useEffect, useState } from "react";
import { isTauriRuntime } from "../platform/tauri";
import { useT } from "../i18n";

type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; version: string; notes?: string; install: () => Promise<void> }
  | { phase: "downloading"; version: string; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "error"; message: string };

/**
 * Checks GitHub Releases for a newer signed build on startup (desktop only).
 * When one is found it shows a small banner; the user opts in to download,
 * then the app relaunches into the new version. Web builds render nothing.
 */
export function UpdateChecker() {
  const { t } = useT();
  const [state, setState] = useState<UpdateState>({ phase: "idle" });

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;

    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update || cancelled) return;

        const install = async () => {
          let downloaded = 0;
          let total = 0;
          setState({ phase: "downloading", version: update.version, percent: 0 });
          try {
            await update.downloadAndInstall((event) => {
              if (event.event === "Started") {
                total = event.data.contentLength ?? 0;
              } else if (event.event === "Progress") {
                downloaded += event.data.chunkLength;
                const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
                setState({ phase: "downloading", version: update.version, percent });
              } else if (event.event === "Finished") {
                setState({ phase: "ready", version: update.version });
              }
            });
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
          } catch (err) {
            setState({
              phase: "error",
              message: err instanceof Error ? err.message : t("update.installFailed"),
            });
          }
        };

        setState({
          phase: "available",
          version: update.version,
          notes: update.body,
          install,
        });
      } catch {
        // No update, offline, or updater unavailable — stay silent.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === "idle") return null;

  return (
    <div style={bannerStyle} role="status" aria-live="polite">
      {state.phase === "available" && (
        <>
          <span style={textStyle}>
            {t("update.availablePrefix")} <strong>{state.version}</strong>{t("update.availableSuffix")}
          </span>
          <div style={actionsStyle}>
            <button style={primaryBtn} onClick={() => void state.install()}>
              {t("update.installNow")}
            </button>
            <button style={ghostBtn} onClick={() => setState({ phase: "idle" })}>
              {t("update.later")}
            </button>
          </div>
        </>
      )}

      {state.phase === "downloading" && (
        <span style={textStyle}>
          {t("update.downloading", { percent: state.percent })}
        </span>
      )}

      {state.phase === "ready" && (
        <span style={textStyle}>{t("update.ready")}</span>
      )}

      {state.phase === "error" && (
        <>
          <span style={textStyle}>{t("update.failed", { message: state.message })}</span>
          <button style={ghostBtn} onClick={() => setState({ phase: "idle" })}>
            {t("common.close")}
          </button>
        </>
      )}
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 16,
  right: 16,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  borderRadius: 12,
  background: "rgba(24, 24, 27, 0.96)",
  color: "#fafafa",
  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)",
  fontSize: 14,
  maxWidth: 360,
};

const textStyle: React.CSSProperties = { lineHeight: 1.4 };
const actionsStyle: React.CSSProperties = { display: "flex", gap: 8, marginLeft: "auto" };

const primaryBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  background: "#3b82f6",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 8,
  padding: "6px 12px",
  background: "transparent",
  color: "#e4e4e7",
  cursor: "pointer",
};
