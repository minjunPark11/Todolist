// What `/projects` draws when it names no Project (SPACE_REMOVAL_IA D-1).
//
// This address has existed since D-04 and has never had a screen: with the
// tree standing in the sidebar, arriving here with nothing selected produced
// "Pick something on the left" — an instruction, in the place where the thing
// being instructed about should have been. Every way to make, rename, pin or
// archive a Project was a row menu inside that tree, so the tree was not a
// navigation aid, it was the management surface.
//
// So this is where Project management lands, and the tree stops being the only
// door. The work area those Projects belong to is not drawn (D-6): the record
// still exists and still owns them, but a level with one member is not a level
// the reader has to be told about.
//
// Nothing here invents a shape. `.ff-row`, `.ff-btn`, `.ff-field` and the one
// `ContextMenu` are the same ones the rest of the app uses — V-6 spent a
// commit collapsing three button languages into one, and a new screen is
// exactly where a fourth would start.
import { useId, useMemo, useState } from "react";
import type { Project, Task } from "../../types";
import { ContextMenu, type ContextMenuState } from "../common/ContextMenu";
import { EmptyState } from "../kit";
import { isTaskOpen } from "../../domain/tasks/taskState";
import { useT } from "../../i18n";

interface ProjectsHomeProps {
  projects: Project[];
  /** For the per-Project open count, the same number the tree shows. */
  tasks: Task[];
  onOpen: (projectId: string) => void;
  onCreate: (name: string) => void;
  onRename: (projectId: string, name: string) => void;
  onTogglePin: (projectId: string) => void;
  onArchive: (projectId: string) => void;
  onRestore: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

function isArchived(project: Project): boolean {
  return Boolean(project.archivedAt) || project.status === "archived";
}

/**
 * Pinned first, then the order the user arranged, then by name.
 *
 * The same comparison `projectsInSpace` makes, plus the pin — which that one
 * does not need because the tree draws a star and leaves the row where it was.
 * A flat list has no branch to keep a pinned Project visible in, so here the
 * pin has to move it.
 */
function byPinThenOrder(a: Project, b: Project): number {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
  return (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);
}

export function ProjectsHome({
  projects,
  tasks,
  onOpen,
  onCreate,
  onRename,
  onTogglePin,
  onArchive,
  onRestore,
  onDelete,
}: ProjectsHomeProps) {
  const { t } = useT();
  // A <section> is a landmark only once it has a name, and an <h2> inside it
  // is not that name — without this the archived group is an anonymous div to
  // anyone navigating by region.
  const archivedTitleId = useId();
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const openCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.projectId || !isTaskOpen(task)) continue;
      counts.set(task.projectId, (counts.get(task.projectId) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const active = useMemo(
    () => projects.filter((project) => !isArchived(project) && !project.deletedAt).sort(byPinThenOrder),
    [projects],
  );
  // §13.28 keeps the two states apart, so a deleted Project is not shown here
  // as archived. D-20 moved archived PROJECTS out of the standalone Archive
  // screen and into the surface that owns them; this is now that surface.
  const archived = useMemo(
    () => projects.filter((project) => isArchived(project) && !project.deletedAt).sort(byPinThenOrder),
    [projects],
  );

  function submit() {
    const name = draft.trim();
    if (!name) return;
    onCreate(name);
    setDraft("");
  }

  function startEditing(project: Project) {
    setEditingId(project.id);
    setEditDraft(project.name);
    setMenu(null);
  }

  function commitRename(projectId: string, originalName: string) {
    const name = editDraft.trim();
    if (name && name !== originalName) onRename(projectId, name);
    setEditingId(null);
  }

  function menuFor(project: Project, x: number, y: number): ContextMenuState {
    return {
      x,
      y,
      label: project.name,
      sections: [
        {
          id: "edit",
          items: [
            {
              id: "rename",
              label: t("tree.rename"),
              run: () => startEditing(project),
            },
            {
              id: "pin",
              label: project.pinned ? t("tree.unpin") : t("tree.pin"),
              run: () => onTogglePin(project.id),
            },
          ],
        },
        {
          id: "lifecycle",
          items: [{ id: "archive", label: t("common.archive"), run: () => onArchive(project.id) }],
        },
      ],
    };
  }

  function row(project: Project) {
    const count = openCounts.get(project.id) ?? 0;
    const isEditing = editingId === project.id;

    const dot = <span className="pjh-dot" style={{ background: project.color }} aria-hidden="true" />;
    const pin = project.pinned ? <span className="pjh-pin" aria-hidden="true">★</span> : null;

    return (
      <li key={project.id} className="pjh-item">
        {isEditing ? (
          /* <input> cannot be a descendant of <button>, so editing mode
             replaces the button with a plain div that carries the same
             visual class. Focus and select-all are set on mount so the
             user can type immediately without a separate click. */
          <div className="ff-row pjh-row">
            {dot}
            {pin}
            <input
              className="pjh-name-input"
              value={editDraft}
              ref={(el) => { if (el) { el.focus(); el.select(); } }}
              onChange={(e) => setEditDraft(e.target.value)}
              onBlur={() => commitRename(project.id, project.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) commitRename(project.id, project.name);
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="ff-row pjh-row"
            onClick={() => onOpen(project.id)}
            // The same gesture the tree answers, on the same record (V-P1).
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu(menuFor(project, event.clientX, event.clientY));
            }}
          >
            {dot}
            {pin}
            {/* Double-click on the name starts inline editing; single click
                on the row opens the project. stopPropagation keeps the row's
                onClick from also firing on the second click. */}
            <span
              className="pjh-name"
              onDoubleClick={(e) => { e.stopPropagation(); startEditing(project); }}
            >
              {project.name}
            </span>
            {/* A zero is not drawn, for the reason the sidebar gives (§2.10):
                an empty Project says so on its own screen. */}
            {count > 0 ? <span className="pjh-count">{count}</span> : null}
          </button>
        )}
        {/* A right-click does not exist on a touch screen, so the same menu
            needs a button. Anchored to the button, where the reader looks. */}
        <button
          type="button"
          className="pjh-menu"
          aria-haspopup="menu"
          aria-label={t("projects.rowMenu", { name: project.name })}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setMenu(menuFor(project, box.left, box.bottom + 4));
          }}
        >
          ⋯
        </button>
      </li>
    );
  }

  return (
    <div className="pjh">
      <header className="pjh-head">
        <h1 className="pjh-title">{t("tree.section")}</h1>
      </header>

      <form
        className="pjh-create"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          className="ff-field"
          value={draft}
          placeholder={t("tree.projectPlaceholder")}
          aria-label={t("tree.projectPlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // The Enter an IME sends to commit a composition is not a submit,
            // the same guard the tree's inline add carries.
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
        />
        <button type="submit" className="ff-btn ff-btn-primary">
          {t("common.add")}
        </button>
      </form>

      {active.length > 0 ? (
        <ul className="pjh-list">{active.map(row)}</ul>
      ) : (
        <EmptyState icon="🗂" title={t("projects.empty")} text={t("projects.emptyHint")} />
      )}

      {archived.length > 0 ? (
        <section className="pjh-archived" aria-labelledby={archivedTitleId}>
          <h2 className="pjh-section-title" id={archivedTitleId}>
            {t("status.archived")}
          </h2>
          <ul className="pjh-list">
            {archived.map((project) => (
              <li key={project.id} className="pjh-item">
                <span className="ff-row pjh-row is-archived">
                  <span className="pjh-dot" style={{ background: project.color }} aria-hidden="true" />
                  <span className="pjh-name">{project.name}</span>
                </span>
                {/* Two buttons rather than a menu: there are two actions, and
                    a menu holding two items is a menu to save one click and
                    spend two. */}
                <button
                  type="button"
                  className="ff-btn ff-btn-secondary"
                  onClick={() => onRestore(project.id)}
                >
                  {t("common.restore")}
                </button>
                <button
                  type="button"
                  className="ff-btn ff-btn-danger"
                  onClick={() => onDelete(project.id)}
                >
                  {t("common.delete")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {menu ? <ContextMenu state={menu} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}
