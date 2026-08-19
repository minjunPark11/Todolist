// The 56px Global Rail (Nav Shell spec §2, audit D-01).
//
// Five items and no more. §1.5 lists what may NOT live here — Today, Upcoming,
// Space, Project, Board, Gantt, Goals, Horizons, Archive — because a Rail that
// grows one entry per screen is the flat sidebar this replaces, drawn
// vertically. Those are all places inside Tasks.
//
// Labels are hidden (§2.2) and every item carries a tooltip instead (§2.28,
// which calls tooltips P0-required for icon-only navigation, not a nicety).
// The tooltip is CSS rather than a library: right placement, 8px offset, 450ms
// on hover, immediate on keyboard focus.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { RailNavItem } from "../../app/railNav";
import { useT } from "../../i18n";

type RailIconName = RailNavItem | "search";

function RailIcon({ name }: { name: RailIconName }) {
  const common = {
    width: 20,
    height: 20,
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
  onClick: () => void;
}

function RailButton({ label, shortcut, icon, active, open, onClick }: RailButtonProps) {
  return (
    <button
      type="button"
      className={`rail-item${active ? " is-active" : ""}${open ? " is-open" : ""}`}
      // §2.30: these are buttons, not links — the destination of Tasks depends
      // on history, so there is no one href to give it.
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-expanded={open === undefined ? undefined : open}
      onClick={onClick}
    >
      <RailIcon name={icon} />
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
  /** "" when signed out — the Rail still shows the slot, with no identity. */
  accountEmail: string;
  onSignOut: () => void;
}

export function GlobalRail({
  active,
  onNavigate,
  onOpenSearch,
  accountEmail,
  onSignOut,
}: GlobalRailProps) {
  const { t } = useT();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  // §2.9's close conditions: outside click and Escape. Navigation closes it
  // too, which falls out of the popover unmounting with the shell.
  useEffect(() => {
    if (!accountOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setAccountOpen(false);
      // Escape returns the focus it took, or the user is left tabbing from
      // the top of the document (§2.32).
      accountButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen]);

  const initial = accountEmail.trim().charAt(0).toUpperCase();

  return (
    <nav className="global-rail" aria-label={t("rail.label")}>
      {/* §2.8: a mark, never a text logo — 56px has no room for one. */}
      <div className="rail-brand" aria-hidden="true">
        <img className="rail-brand-img" src="/icon_focustodo.png" alt="" />
      </div>

      <div className="rail-account" ref={accountRef}>
        <button
          type="button"
          ref={accountButtonRef}
          className={`rail-item rail-avatar${accountOpen ? " is-open" : ""}`}
          aria-label={t("rail.account")}
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          aria-controls={accountOpen ? popoverId : undefined}
          onClick={() => setAccountOpen((open) => !open)}
        >
          <span className="rail-avatar-initial">{initial || "·"}</span>
          <span className="rail-tip" role="tooltip">
            {t("rail.account")}
          </span>
        </button>
        {accountOpen ? (
          <div className="rail-popover" id={popoverId} role="menu">
            <div className="rail-popover-identity">
              <span className="rail-popover-avatar">{initial || "·"}</span>
              <span className="rail-popover-email">
                {accountEmail || t("rail.accountSignedOut")}
              </span>
            </div>
            <div className="rail-popover-divider" />
            {/* §2.9: keep the account actions the product already has, and do
                not invent new ones for the Rail's sake. */}
            <button
              type="button"
              role="menuitem"
              className="rail-popover-item"
              onClick={() => {
                setAccountOpen(false);
                onNavigate("settings");
              }}
            >
              {t("sidebar.settings")}
            </button>
            {accountEmail ? (
              <button
                type="button"
                role="menuitem"
                className="rail-popover-item"
                onClick={() => {
                  setAccountOpen(false);
                  onSignOut();
                }}
              >
                {t("rail.signOut")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

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
      </div>

      <div className="rail-spacer" />

      <div className="rail-utilities">
        {/* §2.14: Search is a utility, not a module — it never takes the
            active state away from where the user actually is. */}
        <RailButton icon="search" label={t("rail.search")} shortcut="/" onClick={onOpenSearch} />
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
