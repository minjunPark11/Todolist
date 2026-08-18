// The one global entry point (TickTick plan §10.2-§10.8, §10.36-§10.40).
//
// One overlay, two kinds of answer. §10.1 keeps them apart in meaning even
// though they share an input: a search result is somewhere to GO, a command is
// something to DO. They are rendered as separate groups (§10.36) rather than
// interleaved, because a row that navigates and a row that acts should not
// look alike.
//
// What the user types here never reaches the address bar (§10.23, Gate 8).
// The palette's query is transient; only leaving for the Search Page writes a
// URL, and that is the difference the Gate asks to be kept.
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchCollections, SearchResult } from "../../domain/tasks/search";
import { flattenGroups, searchAll } from "../../domain/tasks/search";
import type { CommandContext, TaskCommand } from "../../domain/tasks/commands";
import { availableCommands, canRunCommand } from "../../domain/tasks/commands";
import { useT } from "../../i18n";

interface CommandPaletteProps {
  collections: SearchCollections;
  ctx: CommandContext;
  onClose: () => void;
  onPickResult: (result: SearchResult) => void;
  onRunCommand: (command: TaskCommand) => void;
  onSeeAll: (query: string) => void;
}

export function CommandPalette({
  collections,
  ctx,
  onClose,
  onPickResult,
  onRunCommand,
  onSeeAll,
}: CommandPaletteProps) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () => searchAll(query, collections, { inbox: t("tasks.inbox"), defaultList: t("tasks.defaultList") }, 5),
    [query, collections, t],
  );
  const commands = useMemo(() => availableCommands(query, ctx, t), [query, ctx, t]);

  // §10.37's navigation order, and §10.39: group headers are not in it. Only
  // rows that do something can be selected.
  const rows = useMemo(
    () => [
      ...commands.map((command) => ({ kind: "command" as const, command })),
      ...flattenGroups(groups).map((result) => ({ kind: "result" as const, result })),
    ],
    [commands, groups],
  );

  // §10.38: the first row is active as soon as there are rows, so Enter does
  // the obvious thing without an arrow key first.
  useEffect(() => setActive(0), [query]);

  function run(index: number) {
    const row = rows[index];
    if (!row) {
      // Enter with nothing selected means "show me everything" (§10.19).
      if (query.trim()) onSeeAll(query);
      return;
    }
    if (row.kind === "command") {
      // Gate 8, asked again at the moment of execution: the palette may have
      // been open while the Scope changed under it.
      if (!canRunCommand(row.command.id, ctx)) return;
      onRunCommand(row.command);
      return;
    }
    onPickResult(row.result);
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
      // §10.40: closing the palette leaves the Scope behind it alone.
      event.preventDefault();
      onClose();
    }
  }

  let index = commands.length;

  return (
    <div className="tm-palette-backdrop" onMouseDown={onClose}>
      <div
        className="tm-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("tasks.paletteLabel")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          className="tm-palette-input"
          type="text"
          autoFocus
          value={query}
          placeholder={t("tasks.palettePlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="tm-palette-results" ref={listRef}>
          {commands.length > 0 ? (
            <section className="tm-palette-group">
              <h3>{t("tasks.groupCommands")}</h3>
              {commands.map((command, position) => (
                <button
                  key={command.id}
                  type="button"
                  className={`tm-palette-row${position === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(position)}
                  onClick={() => run(position)}
                >
                  <span>{t(command.labelKey)}</span>
                </button>
              ))}
            </section>
          ) : null}

          {groups.map((group) => (
            <section key={group.kind} className="tm-palette-group">
              <h3>{t(`tasks.group.${group.kind}`)}</h3>
              {group.results.map((result) => {
                const position = index;
                index += 1;
                return (
                  <button
                    key={`${result.kind}:${result.id}`}
                    type="button"
                    className={`tm-palette-row${position === active ? " is-active" : ""}`}
                    onMouseEnter={() => setActive(position)}
                    onClick={() => run(position)}
                  >
                    <span className={result.completed ? "is-done" : undefined}>{result.title}</span>
                    {result.subtitle ? <span className="tm-palette-sub">{result.subtitle}</span> : null}
                    {result.completed ? <span className="tm-palette-sub">{t("tasks.resultCompleted")}</span> : null}
                  </button>
                );
              })}
            </section>
          ))}

          {query.trim() && rows.length === 0 ? (
            <p className="tm-state" role="status">
              {t("tasks.searchEmpty")}
            </p>
          ) : null}

          {query.trim() ? (
            <button type="button" className="tm-palette-all" onClick={() => onSeeAll(query)}>
              {t("tasks.seeAllResults")}
            </button>
          ) : (
            <p className="tm-state">{t("tasks.paletteHint")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
