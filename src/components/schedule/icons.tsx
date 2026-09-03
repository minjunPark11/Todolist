// The Schedule Editor's icons, as line art (TASK_DETAIL_SCHEDULE_BODY_DESIGN.md G1).
//
// They were emoji — ☀️ 🌅 📅 🌙 for the quick dates, 🕐 🔔 🔁 for the rows —
// and three things were wrong with that, none of them taste:
//
//   - The glyph is the platform's. Windows, macOS and Android each draw 🌅
//     differently, and none of those drawings is one this app chose.
//   - Colour is the font's. Every other icon here follows `currentColor`, so
//     it dims with a disabled row and inverts in dark; an emoji stays its own
//     bright self in both, which is loudest exactly where the row is off.
//   - Size is the type scale's. They are text, so 20-density's typography
//     tuning moves them, and a "16px icon" was only ever 16px by coincidence.
//
// Drawn on the same 24-viewBox grid at stroke 1.9 as the rest of the app's
// icons (the Matrix card's, the Calendar's), so a reader crossing screens sees
// one hand rather than three.
interface IconProps {
  /** 16 for a row, 20 for a quick-date button — the slots they sit in. */
  size?: number;
}

function Frame({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** 오늘 — the sun, up. */
export function SunIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <circle cx="12" cy="12" r="4" {...STROKE} />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" {...STROKE} />
    </Frame>
  );
}

/** 내일 — the sun coming up over the line, which is the day after this one. */
export function SunriseIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M3 18h18" {...STROKE} />
      <path d="M7.5 18a4.5 4.5 0 0 1 9 0" {...STROKE} />
      <path d="M12 4v3M5.6 7.6l1.4 1.4M18.4 7.6L17 9" {...STROKE} />
    </Frame>
  );
}

/** The plain calendar, for the trigger that opens all of this. */
export function CalendarIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...STROKE} />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" {...STROKE} />
    </Frame>
  );
}

/** +7일 — a calendar carrying the number, because that is the whole meaning. */
export function CalendarPlus7Icon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...STROKE} />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" {...STROKE} />
      <text
        x="12"
        y="17.6"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        7
      </text>
    </Frame>
  );
}

/**
 * 다음 달 — the same calendar as `+7`, with a month's step instead of a number.
 *
 * It is the calendar and not a moon (which is what 오늘 밤 wore) because the
 * shortcut answers with a DAY now, and the three buttons beside it are days
 * too. The chevron says which way: the four shortcuts run today → tomorrow →
 * a week → a month, all forward.
 */
export function CalendarNextMonthIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...STROKE} />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" {...STROKE} />
      <path d="M10.5 12.5l3 3-3 3" {...STROKE} />
    </Frame>
  );
}

/** 시간 */
export function ClockIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <circle cx="12" cy="12" r="8.5" {...STROKE} />
      <path d="M12 7.5V12l3 2" {...STROKE} />
    </Frame>
  );
}

/** 알림 */
export function BellIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M6.5 17V11a5.5 5.5 0 0 1 11 0v6" {...STROKE} />
      <path d="M4.5 17h15" {...STROKE} />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" {...STROKE} />
    </Frame>
  );
}

/** 반복 */
export function RepeatIcon({ size }: IconProps) {
  return (
    <Frame size={size}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3" {...STROKE} />
      <path d="M17.3 3.2v3.5h-3.5" {...STROKE} />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3" {...STROKE} />
      <path d="M6.7 20.8v-3.5h3.5" {...STROKE} />
    </Frame>
  );
}
