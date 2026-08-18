// The one global entry point (TickTick plan §10.2-§10.8, §10.36-§10.46).
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
import { useEffect, useMemo, useState } from "react";
import type { SearchCollections, SearchResult } from "../../domain/tasks/search";
import { flattenGroups, PALETTE_LIMITS, searchAll } from "../../domain/tasks/search";
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

interface CommandPaletteProps {
  collections: SearchCollections;
  ctx: CommandContext;
  recents: RecentEntry[];
  onClose: () => void;
  onPickResult: (result: SearchResult) => void;
  onRunCommand: (command: TaskCommand) => void;
  onOpenUrl: (url: string) => void;
  onSeeAll: (query: string) => void;
  /** §10.41/§10.42: hands the typed text to Quick Add — it does not create. */
  onCapture: (title: string) => void;
}

export function CommandPalette({
  collections,
  ctx,
  recents,
  onClose,
  onPickResult,
  onRunCommand,
  onOpenUrl,
  onSeeAll,
  onCapture,
}: CommandPaletteProps) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const typing = query.trim().length > 0;

  const groups = useMemo(
    () => searchAll(query, collections, { inbox: t("tasks.inbox"), defaultList: t("tasks.defaultList") }, PALETTE_LIMITS),
    [query, collections, t],
  );
  const commands = useMemo(() => availableCommands(query, ctx, t), [query, ctx, t]);
  const results = useMemo(() => flattenGroups(groups), [groups]);

  /**
   * §10.37's navigation order, and §10.39: group headers are not in it.
   *
   * The empty palette navigates recents and nothing else (§10.8); a palette
   * with a query ends on the capture row, so a search that found nothing still
   * has somewhere for Enter to go (§10.41).
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
      // Gate 8, asked again at the moment of execution: the palette may have
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
      // §10.40: closing the palette leaves the Scope behind it alone.
      event.preventDefault();
      onClose();
    }
  }

  function row(index: number, key: string, body: React.ReactNode) {
    return (
      <button
        key={key}
        type="button"
        className={`tm-palette-row${index === active ? " is-active" : ""}`}
        onMouseEnter={() => setActive(index)}
        onClick={() => run(index)}
      >
        {body}
      </button>
    );
  }

  let index = 0;

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

        <div className="tm-palette-results">
          {/* §10.8: places, not predictions. The list is what the user did,
              which needs no explaining and cannot be wrong. */}
          {!typing && recents.length > 0 ? (
            <section className="tm-palette-group">
              <h3>{t("tasks.groupRecent")}</h3>
              {recents.map((entry) => {
                const position = index;
                index += 1;
                return row(
                  position,
                  entry.key,
                  <>
                    <span>{entry.label}</span>
                    {entry.sublabel ? <span className="tm-palette-sub">{entry.sublabel}</span> : null}
                  </>,
                );
              })}
            </section>
          ) : null}

          {commands.length > 0 ? (
            <section className="tm-palette-group">
              <h3>{t("tasks.groupCommands")}</h3>
              {commands.map((command) => {
                const position = index;
                index += 1;
                return row(position, command.id, <span>{t(command.labelKey)}</span>);
              })}
            </section>
          ) : null}

          {groups.map((group) => (
            <section key={group.kind} className="tm-palette-group">
              <h3>{t(`tasks.group.${group.kind}`)}</h3>
              {group.results.map((result) => {
                const position = index;
                index += 1;
                return row(
                  position,
                  `${result.kind}:${result.id}`,
                  <>
                    <span className={result.completed ? "is-done" : undefined}>{result.title}</span>
                    {result.subtitle ? <span className="tm-palette-sub">{result.subtitle}</span> : null}
                    {result.completed ? <span className="tm-palette-sub">{t("tasks.resultCompleted")}</span> : null}
                  </>,
                );
              })}
            </section>
          ))}

          {typing && results.length === 0 && commands.length === 0 ? (
            <p className="tm-state" role="status">
              {t("tasks.searchEmpty")}
            </p>
          ) : null}

          {/* §10.41: search runs into capture. §10.42 is the constraint — the
              title is handed to Quick Add, not written straight to a Task, so
              the user still sees where it is going and can add a date. */}
          {typing
            ? row(rows.length - 1, "capture", <span>{t("tasks.captureAs", { title: query.trim() })}</span>)
            : null}

          {typing ? (
            <button type="button" className="tm-palette-all" onClick={() => onSeeAll(query)}>
              {t("tasks.seeAllResults")}
            </button>
          ) : recents.length === 0 ? (
            <p className="tm-state">{t("tasks.paletteHint")}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
