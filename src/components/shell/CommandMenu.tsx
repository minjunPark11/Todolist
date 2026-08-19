// The Global Command Menu — Ctrl/Cmd+K and the Rail's Search, from anywhere
// (D-25, revised by D-29).
//
// One overlay, opened two ways, over whatever you are looking at. It writes
// nothing to the URL and closes without disturbing what is behind it (§10.23,
// §10.40) — which is the property that makes it usable from the Calendar, and
// the one D-25 gave up when it made the Rail's Search a page navigation.
//
// D-25's reasoning for splitting was that a single input whose meaning depends
// on which row you land on is ambiguous. Using it said otherwise: what the
// split actually produced was a magnifier that swapped the shell, moved the
// Rail's active item to a different module and left no way back but the
// browser's. The ambiguity was theoretical; the context loss was not.
//
// So the rows are places, commands AND tasks again, each capped, and the last
// row hands the query to the Search Page — which stays exactly as it was, the
// place where "all of them" lives at an address you can paste to someone.
// That is the half of D-25 that was worth keeping.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchCollections, SearchResult } from "../../domain/tasks/search";
import { flattenGroups, MENU_LIMITS, searchAll } from "../../domain/tasks/search";
import type { CommandContext, TaskCommand } from "../../domain/tasks/commands";
import { availableCommands, canRunCommand } from "../../domain/tasks/commands";
import { useT } from "../../i18n";
import { useFocusTrap } from "../../hooks/useFocusTrap";

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
  /** §10.45: the same query, on the page that shows all of it (D-29). */
  onSeeAll: (query: string) => void;
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
  onSeeAll,
  onCapture,
}: CommandMenuProps) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const typing = query.trim().length > 0;

  /**
   * The trap the other two dialogs already had.
   *
   * This one declared `role="dialog"` and `aria-modal="true"` and then let
   * Tab walk out of it into the page it was covering, and put focus on
   * <body> when it closed — measured: open with Ctrl+K from a Task row, press
   * Escape, and the row you came from is not focused any more, so the next
   * Tab starts again from the top of the document.
   *
   * `useFocusTrap` is the same hook the Add List dialog and the Task Drawer
   * use, so all three now agree about what a modal surface does with focus.
   * `initial` names the query field because the first focusable element in
   * DOM order is the field only by accident of layout.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusInput = useCallback(() => inputRef.current, []);
  useFocusTrap(rootRef, { initial: focusInput });

  // The same matcher the Search Page uses, asked for less of it: `MENU_LIMITS`
  // caps each group at what stays scannable, and the Search Page is where the
  // rest lives (§10.49).
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
        ref={rootRef}
        className="cmd-menu"
        role="dialog"
        aria-modal="true"
        aria-label={t("menu.label")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="cmd-menu-input"
          type="text"
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
                    <span className={result.completed ? "is-done" : undefined}>{result.title}</span>
                    {result.subtitle ? <span className="cmd-menu-sub">{result.subtitle}</span> : null}
                    {/* §10.29: finished work is shown as finished rather than
                        hidden — searching for something you completed last
                        week is a normal thing to do. */}
                    {result.completed ? <span className="cmd-menu-sub">{t("tasks.resultCompleted")}</span> : null}
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

        {/* §10.45. Below the listbox rather than in it: this is a way OUT of
            the menu, not one of the choices in it. D-25 removed this row and
            D-29 put it back — the menu shows what fits, and the page shows the
            rest without the user having to find it a second way. */}
        {typing ? (
          <button type="button" className="cmd-menu-all" onClick={() => onSeeAll(query)}>
            {t("tasks.seeAllResults")}
          </button>
        ) : recents.length === 0 ? (
          <p className="cmd-menu-state">{t("menu.hint")}</p>
        ) : null}
      </div>
    </div>
  );
}
