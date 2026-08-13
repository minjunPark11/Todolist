// Project read-model selectors (pure, no React/IO) — see domain/tasks.
import type { Project } from "../../types";

// Projects that still exist from the user's point of view.
export function selectActiveProjects(projects: Project[]): Project[] {
  return projects.filter((project) => project.status !== "archived");
}
