/**
 * Compact project selector rendered in the shell header top-right area.
 */

import type { ReactElement } from "react";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

type ProjectSwitcherProps = {
  vm: NmcasViewModel;
};

export function ProjectSwitcher({ vm }: ProjectSwitcherProps): ReactElement | null {
  const { projects, selectedProjectId, setSelectedProjectId, projectsLoading } = vm;

  if (projectsLoading || projects.length === 0) {
    return null;
  }

  return (
    <div className="project-switcher">
      <label htmlFor="header-project-select" className="sr-only">
        Active project
      </label>
      <select
        id="header-project-select"
        className="project-switcher__select"
        value={selectedProjectId}
        onChange={(e) => {
          setSelectedProjectId(e.target.value);
        }}
        title="Switch active project"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
