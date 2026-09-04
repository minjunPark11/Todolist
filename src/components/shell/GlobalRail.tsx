// The 56px Global Rail (Nav Shell spec §2, audit D-01).
//
// Five items and no more. §1.5 lists what may NOT live here — Today, Upcoming,
// Space, Project, Board, Gantt, Goals, Horizons, Archive — because a Rail that
// grows one entry per screen is the flat sidebar this replaces, drawn
// vertically. Those are all places inside Tasks.
//
// Two things that used to sit above the first item are gone, and both were
// occupying the most reachable space in the app to do nothing.
//
// The brand mark was `aria-hidden` and not a button: 40px at the very top
// that could not be clicked, read or navigated to. TICKTICK_COMPONENT_08 §1
// measured the reference's Rail starting straight at the avatar with no mark
// at all.
//
// The account avatar offered exactly two actions, Settings and Sign out, and
// the Settings page already renders both through `AccountSection` — so it was
// a second door to a room that has one, drawn as a "·" whenever nobody is
// signed in. Removing it also ends the duplication of Settings, which was
// reachable from the popover AND from the Rail item at the bottom.
//
// Search moved up to sit with the destinations, which is where §1 measured it
// in the reference — fourth of six, not exiled below a 300px gap. It still
// opens a dialog rather than navigating, so it still never takes the active
// state (§2.14); what changed is where the pointer has to travel, not what
// the button does.
//
// Labels are hidden (§2.2) and every item carries a tooltip instead (§2.28,
// which calls tooltips P0-required for icon-only navigation, not a nicety).
// The tooltip is CSS rather than a library: right placement, 8px offset, 450ms
// on hover, immediate on keyboard focus.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { RailNavItem } from "../../app/railNav";
import { useT } from "../../i18n";

type RailIconName = RailNavItem | "search" | "sync" | "bell";

export function RailIcon({ name }: { name: RailIconName }) {
  const common = {
    // 28, from §7: the reference's icon fills 70% of its 40px hit area and
    // ours filled 50%, which is what made the Rail read as empty rather than
    // as quiet.
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<RailIconName, ReactNode> = {
    tasks: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
      </>
    ),
    // Four quadrants — the axis that only this screen offers (D-19).
    matrix: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </>
    ),
    calendar: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <line x1="4" y1="9.5" x2="20" y2="9.5" />
        <line x1="8.5" y1="3" x2="8.5" y2="7" />
        <line x1="15.5" y1="3" x2="15.5" y2="7" />
      </>
    ),
    focus: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <line x1="15.8" y1="15.8" x2="20" y2="20" />
      </>
    ),
    // Two arrows chasing each other — the shape everything from a browser
    // reload to a cloud client uses for "bring the two sides level".
    sync: (
      <>
        <path d="M20 11a8 8 0 0 0-13.7-5.3L3 9" />
        <path d="M4 13a8 8 0 0 0 13.7 5.3L21 15" />
        <path d="M3 4.5V9h4.5" />
        <path d="M21 19.5V15h-4.5" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5" />
        <path d="M13.7 19.5a2 2 0 0 1-3.4 0" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 004.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

interface RailButtonProps {
  label: string;
  shortcut?: string;
  icon: RailIconName;
  /** Absent for the utilities, which are not navigation targets (§2.18). */
  active?: boolean;
  /** The Account popover's own state, which is not `active` (§2.9). */
  open?: boolean;
  /** What `open` refers to, for the items that open one (§2.33). */
  haspopup?: "menu" | "dialog";
  /**
   * A count worth interrupting for, drawn on the icon
   * (RAIL_SYNC_AND_NOTIFICATIONS_DESIGN.md §3.3). 0 draws nothing.
   *
   * The number is NOT left to the badge alone: `label` carries it too, because
   * a badge is a picture and a screen reader is owed the fact.
   */
  badge?: number;
  /** Extra class for an item that draws its own state (the sync spinner). */
  variant?: string;
  busy?: boolean;
  onClick: () => void;
}

function RailButton({ label, shortcut, icon, active, open, haspopup, badge, variant, busy, onClick }: RailButtonProps) {
  return (
    <button
      type="button"
      className={`rail-item${active ? " is-active" : ""}${open ? " is-open" : ""}${variant ? ` ${variant}` : ""}`}
      aria-busy={busy || undefined}
      // §2.30: these are buttons, not links — the destination of Tasks depends
      // on history, so there is no one href to give it.
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-expanded={open === undefined ? undefined : open}
      aria-haspopup={haspopup}
      onClick={onClick}
    >
      <RailIcon name={icon} />
      {badge ? (
        <span className="rail-badge" aria-hidden="true">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
      <span className="rail-tip" role="tooltip">
        {label}
        {shortcut ? <kbd className="rail-tip-key">{shortcut}</kbd> : null}
      </span>
    </button>
  );
}

interface GlobalRailProps {
  active: RailNavItem;
  onNavigate: (item: RailNavItem) => void;
  onOpenSearch: () => void;
  /** §11.24's open-utility state: the button that opened the menu says so. */
  searchOpen: boolean;
  /**
   * The sync button, or nothing (F2).
   *
   * Absent while the account is local-only: a sync button with no account to
   * sync to answers a press with silence, and in a column of unlabelled icons
   * a disabled one cannot explain itself either.
   */
  sync?: { state: "idle" | "syncing" | "failed"; onSync: () => void };
  /**
   * The bell, rendered whole by whoever owns the panel it opens.
   *
   * `PopoverTrigger` draws its own `<button>` and wires `aria-expanded` to the
   * surface, so the Rail cannot supply that button without the panel's
   * context. It supplies the space instead, and `RailIcon` above is exported
   * so what lands here still looks like a Rail item.
   */
  notificationSlot?: ReactNode;
}

export function GlobalRail({
  active,
  onNavigate,
  onOpenSearch,
  searchOpen,
  sync,
  notificationSlot,
}: GlobalRailProps) {
  const { t } = useT();

  return (
    <nav className="global-rail" aria-label={t("rail.label")}>
      <div className="rail-primary">
        <RailButton
          icon="tasks"
          label={t("rail.tasks")}
          shortcut="Ctrl+1"
          active={active === "tasks"}
          onClick={() => onNavigate("tasks")}
        />
        <RailButton
          icon="matrix"
          label={t("rail.matrix")}
          shortcut="Ctrl+2"
          active={active === "matrix"}
          onClick={() => onNavigate("matrix")}
        />
        <RailButton
          icon="calendar"
          label={t("sidebar.calendar")}
          shortcut="Ctrl+3"
          active={active === "calendar"}
          onClick={() => onNavigate("calendar")}
        />
        <RailButton
          icon="focus"
          label={t("sidebar.focus")}
          shortcut="Ctrl+4"
          active={active === "focus"}
          onClick={() => onNavigate("focus")}
        />
        {/* Placed with the destinations because that is where the reference
            puts it (§1: fourth of six) and because it is the item people reach
            for most — it was the furthest one to travel to. It is still a
            utility underneath: no `active`, so it never lights, and
            `haspopup="dialog"` says what it actually opens (§2.14, §2.33). */}
        <RailButton
          icon="search"
          label={t("rail.search")}
          shortcut="/"
          open={searchOpen}
          haspopup="dialog"
          onClick={onOpenSearch}
        />
      </div>

      <div className="rail-spacer" />

      <div className="rail-utilities">
        {sync ? (
          <RailButton
            icon="sync"
            label={
              sync.state === "syncing"
                ? t("rail.syncing")
                : sync.state === "failed"
                  ? t("rail.syncFailed")
                  : t("rail.sync")
            }
            variant={`rail-sync is-${sync.state}`}
            busy={sync.state === "syncing"}
            onClick={sync.onSync}
          />
        ) : null}
        {notificationSlot ?? null}
        <RailButton
          icon="settings"
          label={t("sidebar.settings")}
          active={active === "settings"}
          onClick={() => onNavigate("settings")}
        />
      </div>
    </nav>
  );
}
