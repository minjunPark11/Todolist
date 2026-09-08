import type { Project } from "../../../types";

export interface EventLabel { id: string; name?: string; backgroundColor: string }
const PREFIX = "f0c05f10-";

/** Stable, application-namespaced UUID. Never use a mutable list name as a key. */
export function labelIdFor(projectId: string): string {
  const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b].map((seed) => {
    let hash = seed;
    for (let i = 0; i < projectId.length; i++) hash = Math.imul(hash ^ projectId.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }).join("");
  return `${PREFIX}${words.slice(0, 4)}-8${words.slice(5, 8)}-a${words.slice(9, 12)}-${words.slice(12)}`;
}

export function toHex6(color: string): string {
  if (/^#[\da-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map((c) => c + c).join("")}`.toLowerCase();
  return /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : "#007aff";
}

export function planLabels(projects: readonly Project[], remote: readonly EventLabel[]) {
  const known = new Set(projects.map((p) => p.googleLabelId).filter(Boolean));
  const foreign = remote.filter((label) => !label.id.startsWith(PREFIX) && !known.has(label.id));
  const active = projects.filter((p) => !p.archivedAt && !p.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const selected = active.slice(0, Math.max(0, 200 - foreign.length));
  const mappings = selected.map((p) => ({ projectId: p.id, googleLabelId: p.googleLabelId || labelIdFor(p.id) }));
  const desired = selected.map((p, i) => ({ id: mappings[i].googleLabelId, name: [...p.name].slice(0, 50).join(""), backgroundColor: toHex6(p.color) }));
  const labels = [...foreign, ...desired];
  const equal = (a: EventLabel, b: EventLabel) => a.id === b.id && a.name === b.name && a.backgroundColor.toLowerCase() === b.backgroundColor.toLowerCase();
  const create = desired.filter((a) => !remote.some((b) => a.id === b.id));
  const update = desired.filter((a) => remote.some((b) => a.id === b.id && !equal(a, b)));
  const remove = remote.filter((a) => !labels.some((b) => a.id === b.id));
  return { labels, mappings, create, update, remove, overflow: active.length - selected.length,
    changed: create.length > 0 || update.length > 0 || remove.length > 0 };
}
