// Dependency arrows over the timeline (GANTT_TIMELINE_DESIGN D7, P3).
//
// The endpoints are MEASURED rather than computed. Bars are placed by CSS
// Grid inside groups whose headings have no fixed height, so there is no
// arithmetic that yields a bar's y without reproducing the browser's layout —
// and a duplicate layout model is a second thing to keep in sync.
//
// One SVG for the whole timeline, positioned over it. `blockedByTaskId` is
// 1:1, so the path count is bounded by the row count.
import { useLayoutEffect, useRef, useState } from "react";
import type { TimelineLink } from "../domain/view/connectors";
import { useT } from "../i18n";

interface Point {
  x: number;
  y: number;
}

interface DrawnLink {
  key: string;
  path: string;
  head: Point;
  conflict: boolean;
}

/** Elbow clearance, and the arrowhead's half-height. */
const STUB = 10;
const HEAD = 4;

export function TimelineConnectors({
  links,
  /** Bumped by the caller whenever anything that moves a bar changes. */
  revision,
  containerRef,
}: {
  links: TimelineLink[];
  revision: unknown;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState<DrawnLink[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      if (!container) return;
      const base = container.getBoundingClientRect();
      setSize({ width: base.width, height: base.height });

      const next: DrawnLink[] = [];
      for (const link of links) {
        const from = container.querySelector<HTMLElement>(`[data-bar-key="${cssEscape(link.fromKey)}"]`);
        const to = container.querySelector<HTMLElement>(`[data-bar-key="${cssEscape(link.toKey)}"]`);
        if (!from || !to) continue;

        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        // Finish-to-start: out of the blocker's right edge, into the
        // dependent's left edge. The only relation blockedByTaskId can express.
        const start: Point = { x: a.right - base.left, y: a.top + a.height / 2 - base.top };
        const end: Point = { x: b.left - base.left, y: b.top + b.height / 2 - base.top };
        next.push({
          key: `${link.fromKey}->${link.toKey}`,
          path: elbow(start, end),
          head: end,
          conflict: link.conflict,
        });
      }
      setDrawn(next);
    }

    measure();

    // Bars move when the window resizes even though no state changed, so the
    // measurement has to follow the layout rather than only the data.
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [links, revision, containerRef]);

  // No dependencies is the common case; render nothing at all rather than an
  // empty overlay sitting on top of the grid.
  if (drawn.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      className="ff-timeline-links"
      width={size.width}
      height={size.height}
      // Purely decorative overlay: every arrow restates a relation the bars
      // and their badges already carry, so it must never eat a click.
      aria-hidden="true"
    >
      <title>{t("timeline.dependencies")}</title>
      {drawn.map((link) => (
        <g key={link.key} className={link.conflict ? "is-conflict" : ""}>
          <path d={link.path} fill="none" />
          <polygon
            points={`${link.head.x},${link.head.y} ${link.head.x - HEAD * 1.6},${link.head.y - HEAD} ${link.head.x - HEAD * 1.6},${link.head.y + HEAD}`}
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * Three segments when the dependent starts after its blocker ends. When it
 * does not — the contradiction `conflict` marks — the straight elbow would
 * run backwards through both bars, so the line drops below and comes back.
 */
function elbow(start: Point, end: Point): string {
  const midY = end.y;
  if (end.x >= start.x + STUB * 2) {
    const midX = start.x + STUB;
    return `M ${start.x} ${start.y} H ${midX} V ${midY} H ${end.x}`;
  }
  const below = Math.max(start.y, end.y) + STUB * 1.5;
  return [
    `M ${start.x} ${start.y}`,
    `H ${start.x + STUB}`,
    `V ${below}`,
    `H ${end.x - STUB}`,
    `V ${midY}`,
    `H ${end.x}`,
  ].join(" ");
}

/** Item keys contain `:`, which a bare attribute selector cannot carry. */
function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/:/g, "\\:");
}
