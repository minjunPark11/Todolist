// The Global Command Menu — Ctrl/Cmd+K, from anywhere (D-25).
//
// This box used to be the app's one "search and commands" overlay, and it
// lived inside the Tasks Module. Q-03 split it in two:
//
//   - Finding something is SEARCHING, and search has a page with an address
//     you can paste to someone (`/search`). The Rail's Search button goes
//     there. It is not an overlay and never was in this repo.
//   - Getting somewhere fast, and running something, is this menu. It opens
//     over whatever you are looking at, writes nothing to the URL, and closes
//     without disturbing what is behind it (§10.23, §10.40).
//
// The two do not hand off to each other. There is no "see all results" row
// here, because a menu that ends by navigating to the Search Page is a search
// box wearing a menu's clothes — and then typing in it means two different
// things depending on which row you land on.
//
// What that leaves is the definition: rows are PLACES and COMMANDS. A List, a
// Tag, a Project is a place. A Task is not — it is a record you search for,
// and `MENU_LIMITS` is where that is enforced rather than here.
import { useEffect, useMemo, useState } from "react";
import type { SearchCollections, SearchResult } from "../../domain/tasks/search";
import { flattenGroups, MENU_LIMITS, searchAll } from "../../domain/tasks/search";
import type { CommandContext, TaskCommand } from "../../domain/tasks/commands";
import { availableCommands, canRunCommand } from "../../domain/tasks/commands";
import { useT } from "../../i18n";

/** A place the user has been, already resolved to a label and a URL (§10.43). */
export interface RecentEntry {
  key: string;
  label: string;
  sublabel?: string;
  url: string;
}

interface CommandMenuProps {
  collections: SearchCollections;
  ctx: CommandContext;
  recents: RecentEntry[];
  onClose: () => void;
  onPickResult: (result: SearchResult) => void;
  onRunCommand: (command: TaskCommand) => void;
  onOpenUrl: (url: string) => void;
  /** §10.41/§10.42: hands the typed text to Quick Add — it does not create. */
  onCapture: (title: string) => void;
}

export function CommandMenu({
  collections,
  ctx,
  recents,
  onClose,
  onPickResult,
  onRunCommand,
  onOpenUrl,
  onCapture,
}: CommandMenuProps) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const typing = query.trim().length > 0;

  // The same matcher the Search Page uses, asked a narrower question:
  // `MENU_LIMITS` drops the Task group entirely, so what comes back is the
  // set of destinations and nothing else (D-25).
  const groups = useMemo(
    () => searchAll(query, collections, { inbox: t("tasks.inbox"), defaultList: t("tasks.defaultList") }, MENU_LIMITS),
    [query, collections, t],
  );
  const commands = useMemo(() => availableCommands(query, ctx, t), [query, ctx, t]);
  const results = useMemo(() => flattenGroups(groups), [groups]);

  /**
   * §10.37's navigation order, and §10.39: group headers are not in it.
   *
   * The empty menu navigates recents and nothing else (§10.8); a menu with a
   * query ends on the capture row, so a query that matched nothing still has
   * somewhere for Enter to go (§10.41).
   */
  const rows = useMemo(
    () =>
      typing
        ? [
            ...commands.map((command) => ({ kind: "command" as const, command })),
            ...results.map((result) => ({ kind: "result" as const, result })),
            { kind: "capture" as const },
          ]
        : recents.map((entry) => ({ kind: "recent" as const, entry })),
    [typing, commands, results, recents],
  );

  // §10.38: the first row is active as soon as there are rows, so Enter does
  // the obvious thing without an arrow key first.
  useEffect(() => setActive(0), [query]);

  function run(index: number) {
    const row = rows[index];
    if (!row) return;
    if (row.kind === "command") {
      // Gate 8, asked again at the moment of execution: the menu may have
      // been open while the Scope changed under it.
      if (!canRunCommand(row.command.id, ctx)) return;
      onRunCommand(row.command);
    } else if (row.kind === "result") {
      onPickResult(row.result);
    } else if (row.kind === "recent") {
      onOpenUrl(row.entry.url);
    } else {
      onCapture(query.trim());
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (rows.length === 0 ? 0 : (current + 1) % rows.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (rows.length === 0 ? 0 : (current - 1 + rows.length) % rows.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(active);
    } else if (event.key === "Escape") {
      // §10.40: closing the menu leaves the page behind it alone.
      event.preventDefault();
      onClose();
    }
  }

  function row(index: number, key: string, body: React.ReactNode) {
    return (
      <button
        key={key}
        type="button"
        role="option"
        aria-selected={index === active}
        className={`cmd-menu-row${index === active ? " is-active" : ""}`}
        onMouseEnter={() => setActive(index)}
        onClick={() => run(index)}
      >
        {body}
      </button>
    );
  }

  let index = 0;

  return (
    <div className="cmd-menu-backdrop" onMouseDown={onClose}>
      <div
        className="cmd-menu"
        role="dialog"
        aria-modal="true"
        aria-label={t("menu.label")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          className="cmd-menu-input"
          type="text"
          autoFocus
          // §16.34: the input owns a list that changes as it is typed in, and
          // `combobox` is what says so — otherwise the results are a silent
          // region and Enter appears to do nothing.
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls="cmd-menu-results"
          aria-autocomplete="list"
          value={query}
          placeholder={t("menu.placeholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />

        {/* A listbox may own only options and groups of options, so each
            §10.11 group carries its heading as its NAME and hides the visible
            copy from the tree — otherwise the heading is read as a broken
            choice. Found by axe (aria-required-children), not by eye. */}
        <div className="cmd-menu-results" id="cmd-menu-results" role="listbox">
          {/* §10.8: places, not predictions. The list is what the user did,
              which needs no explaining and cannot be wrong. */}
          {!typing && recents.length > 0 ? (
            <section className="cmd-menu-group" role="group" aria-label={t("tasks.groupRecent")}>
              <h3 aria-hidden="true">{t("tasks.groupRecent")}</h3>
              {recents.map((entry) => {
                const position = index;
                index += 1;
                return row(
                  position,
                  entry.key,
                  <>
                    <span>{entry.label}</span>
                    {entry.sublabel ? <span className="cmd-menu-sub">{entry.sublabel}</span> : null}
                  </>,
                );
              })}
            </section>
          ) : null}

          {commands.length > 0 ? (
            <section className="cmd-menu-group" role="group" aria-label={t("tasks.groupCommands")}>
              <h3 aria-hidden="true">{t("tasks.groupCommands")}</h3>
              {commands.map((command) => {
                const position = index;
                index += 1;
                return row(position, command.id, <span>{t(command.labelKey)}</span>);
              })}
            </section>
          ) : null}

          {groups.map((group) => (
            <section
              key={group.kind}
              className="cmd-menu-group"
              role="group"
              aria-label={t(`tasks.group.${group.kind}`)}
            >
              <h3 aria-hidden="true">{t(`tasks.group.${group.kind}`)}</h3>
              {group.results.map((result) => {
                const position = index;
                index += 1;
                return row(
                  position,
                  `${result.kind}:${result.id}`,
                  <>
                    <span>{result.title}</span>
                    {result.subtitle ? <span className="cmd-menu-sub">{result.subtitle}</span> : null}
                  </>,
                );
              })}
            </section>
          ))}

          {/* §10.41 used to read "search runs into capture". With search gone
              to its own page, this is simply the menu's one command that does
              not exist until you type — and §10.42 is still the constraint:
              the title is handed to Quick Add, not written straight to a
              Task, so the user sees where it is going and can add a date. */}
          {typing
            ? row(rows.length - 1, "capture", <span>{t("tasks.captureAs", { title: query.trim() })}</span>)
            : null}
        </div>

        {/* Below the listbox rather than inside it: a message is not a choice
            in the list, and owning it broke the listbox. */}
        {typing && results.length === 0 && commands.length === 0 ? (
          <p className="cmd-menu-state" role="status">
            {t("menu.empty")}
          </p>
        ) : null}

        {/* Where "see all results" used to send the user to `/search`. It is a
            hint now, not a row: the Search Page is reached from the Rail or by
            its command, never as the tail of something typed here (D-25). */}
        {!typing && recents.length === 0 ? <p className="cmd-menu-state">{t("menu.hint")}</p> : null}
      </div>
    </div>
  );
}
