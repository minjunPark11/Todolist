import type { TodaySpaceSignal } from "../../utils/todayView";
import { MoreMenu } from "../kit";
import { useT } from "../../i18n";

interface AttentionFromSpacesProps {
  signals: TodaySpaceSignal[];
  onOpenSignal: (signal: TodaySpaceSignal) => void;
  onHideSignal: (signalId: string) => void;
}

function iconStyle(color?: string) {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined;
  return { background: `${color}1c`, color };
}

export function AttentionFromSpaces({ signals, onOpenSignal, onHideSignal }: AttentionFromSpacesProps) {
  const { t } = useT();

  return (
    <section className="tdy-card tdy-attention">
      <header className="tdy-card-head">
        <span className="tdy-card-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
            <path d="M10.3 19a2 2 0 003.4 0" />
          </svg>
        </span>
        <h2>{t("todayv.attention")}</h2>
      </header>

      {signals.length === 0 ? (
        <p className="tdy-rail-empty">{t("todayv.attentionEmpty")}</p>
      ) : (
        <div className="tdy-signal-list">
          {signals.map((signal) => (
            <div key={signal.id} className="tdy-signal-row">
              <button
                type="button"
                className="tdy-signal-main"
                onClick={() => onOpenSignal(signal)}
              >
                <span className="tdy-signal-icon" style={iconStyle(signal.color)} aria-hidden="true">
                  {signal.kind === "study" ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                      <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5z" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
                    </svg>
                  )}
                </span>
                <span className="tdy-signal-text">
                  <strong>{signal.kind === "study" ? t("todayv.studySpace") : signal.name}</strong>
                  <small>{t(signal.messageKey, signal.messageVars)}</small>
                </span>
                <span className={`tdy-severity-dot tdy-severity-${signal.severity}`} aria-hidden="true" />
              </button>
              <MoreMenu
                items={[
                  { label: t("todayv.openSpace"), onClick: () => onOpenSignal(signal) },
                  { label: t("todayv.hideSignal"), onClick: () => onHideSignal(signal.id) },
                ]}
                label={t("todayv.signalMenuAria")}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
