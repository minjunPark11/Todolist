// The Add List dialog's right panel (Add List design §8).
//
// It is an illustration, not a miniature of the app. §8.1 is explicit about
// what it is NOT: no Task is created here, no card is dragged, no timeline is
// zoomed. It shows what shape the chosen View has, so the choice can be
// understood before it is made.
//
// §8.31 forbids reaching for the real components — TaskBoard, the timeline,
// the row renderer. Two reasons, and the second is the one that bites: a real
// component brings business logic that has nothing to do with a preview, and
// then a change to the real screen breaks a dialog that never rendered any
// data. So these are deliberately dumb divs (§8.32).
//
// §8.29: no state of its own. Everything it draws comes from the draft.
// §8.37: removing this file entirely must not change what the form can do.
import { useT } from "../../i18n";
import { listColorHex } from "../../domain/tasks/listColor";
import type { TaskViewKind } from "../../domain/tasks/scopeRegistry";

interface CreateListPreviewProps {
  name: string;
  color: string;
  view: TaskViewKind;
}

/** §8.12: enough rows to read as a list, few enough not to read as data. */
const LIST_ROWS = [72, 88, 60, 80];

/**
 * §8.14: not filled evenly. A board with the same number of cards in every
 * column looks like a diagram of a board; a real one is lopsided.
 */
const BOARD_COLUMNS = [
  { key: "todo", cards: [78, 62] },
  { key: "doing", cards: [70] },
  { key: "done", cards: [] as number[] },
];

/** §8.17: three bars, different lengths, different starts. The numbers mean
    nothing — §8.17 says so outright, this is a structure hint. */
const GANTT_BARS = [
  { offset: 4, width: 30 },
  { offset: 26, width: 46 },
  { offset: 58, width: 26 },
];

export function CreateListPreview({ name, color, view }: CreateListPreviewProps) {
  const { t } = useT();
  const hex = listColorHex(color);
  // §8.7: the fallback is its own string, NOT the input's placeholder. The
  // placeholder tells you what to type; this names the thing being made.
  const title = name.trim() || t("tasks.previewUntitled");

  return (
    <div
      className="tm-preview"
      // §8.24. Every value drawn here is already announced by the field that
      // set it, so reading the skeleton out loud would say everything twice
      // and then describe rectangles.
      aria-hidden
    >
      <div className="tm-preview-frame">
        <div className="tm-preview-header">
          {/* §8.9: colour appears as identity in the header and nowhere else. */}
          <span
            className={`tm-preview-dot${hex ? "" : " is-none"}`}
            style={hex ? { background: hex } : undefined}
          />
          {/* §8.8: one line, cut with an ellipsis. §8.8's MUST is that the
              preview never makes the dialog grow or wrap. */}
          <span className="tm-preview-title">{title}</span>
        </div>

        <div className="tm-preview-body">
          {view === "board" ? (
            <div className="tm-preview-board">
              {BOARD_COLUMNS.map((column) => (
                <div key={column.key} className="tm-preview-column">
                  <span className="tm-preview-column-head" />
                  {column.cards.map((width, index) => (
                    <span key={index} className="tm-preview-card" style={{ width: `${width}%` }} />
                  ))}
                </div>
              ))}
            </div>
          ) : view === "gantt" ? (
            <div className="tm-preview-gantt">
              {GANTT_BARS.map((bar, index) => (
                <div key={index} className="tm-preview-gantt-row">
                  <span className="tm-preview-gantt-label" />
                  <span className="tm-preview-gantt-track">
                    {/* §8.18: bars stay neutral. Painting every one in the
                        List's colour would say the colour means something
                        about the work rather than about the List. */}
                    <span
                      className="tm-preview-gantt-bar"
                      style={{ marginLeft: `${bar.offset}%`, width: `${bar.width}%` }}
                    />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="tm-preview-list">
              {LIST_ROWS.map((width, index) => (
                <div key={index} className="tm-preview-row">
                  <span className="tm-preview-check" />
                  <span className="tm-preview-line" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
