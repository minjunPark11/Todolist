import type { TodayTimeRail } from "../../utils/todayView";
import { formatMinuteOfDay } from "../../utils/todayView";
import { useT } from "../../i18n";

interface TimeRailProps {
  rail: TodayTimeRail;
  onOpenTask: (taskId: string) => void;
}

function softBlockStyle(color?: string) {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return undefined;
  return { background: `${color}14`, borderColor: `${color}33`, color };
}

export function TimeRail({ rail, onOpenTask }: TimeRailProps) {
  const { t, lang } = useT();
  const hasScheduled = rail.scheduledCount > 0;

  return (
    <section className="tdy-card tdy-rail">
      <header className="tdy-card-head">
        <span className="tdy-card-head-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <h2>{t("todayv.timeRail")}</h2>
        <span className="tdy-card-head-note">{t("todayv.timeRailToday")}</span>
      </header>

      {rail.earlierCount > 0 ? (
        <p className="tdy-rail-overflow">{t("todayv.earlierBlocks", { n: rail.earlierCount })}</p>
      ) : null}

      {!hasScheduled ? (
        <p className="tdy-rail-empty">{t("todayv.timeRailEmpty")}</p>
      ) : (
        <div className="tdy-rail-list">
          {rail.blocks.map((block) =>
            block.type === "free" ? (
              <div key={block.id} className="tdy-rail-item is-free" aria-hidden="true">
                <span className="tdy-rail-time">{formatMinuteOfDay(block.startMin, lang)}</span>
                <span className="tdy-rail-free">{t("todayv.free")}</span>
              </div>
            ) : (
              <div key={block.id} className="tdy-rail-item">
                <span className="tdy-rail-time">{formatMinuteOfDay(block.startMin, lang)}</span>
                <button
                  type="button"
                  className="tdy-rail-block"
                  style={softBlockStyle(block.color)}
                  onClick={() => block.taskId && onOpenTask(block.taskId)}
                >
                  <strong>{block.title}</strong>
                  <span>
                    {formatMinuteOfDay(block.startMin, lang)} – {formatMinuteOfDay(block.endMin, lang)}
                  </span>
                </button>
              </div>
            ),
          )}
        </div>
      )}

      {rail.laterCount > 0 ? (
        <p className="tdy-rail-overflow">{t("todayv.laterBlocks", { n: rail.laterCount })}</p>
      ) : null}
    </section>
  );
}
