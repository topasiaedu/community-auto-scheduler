/**
 * Active project picker and create-project form (Account area).
 */

import type { ReactElement } from "react";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

type AccountProjectsPanelProps = {
  vm: NmcasViewModel;
};

export function AccountProjectsPanel({ vm }: AccountProjectsPanelProps): ReactElement {
  const {
    session,
    projects,
    projectsLoading,
    projectsError,
    selectedProjectId,
    setSelectedProjectId,
    newProjectName,
    setNewProjectName,
    newProjectDescription,
    setNewProjectDescription,
    createProjectSubmitting,
    createProjectError,
    selectedProjectName,
    onSignOut,
    onCreateProject,
  } = vm;

  if (session === null) {
    return <></>;
  }

  return (
    <div className="stack">
      <section className="app-card">
        <div className="account-toolbar">
          <div>
            <p className="account-toolbar__label">Signed in as</p>
            <p className="account-toolbar__email">{session.user.email ?? session.user.id}</p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </div>
      </section>

      <section className="app-card">
        <div className="app-section-title">Workspace</div>
        {projectsLoading ? (
          <p className="loading-inline" aria-busy="true">
            <span className="spinner" aria-hidden="true" />
            Loading projects…
          </p>
        ) : projectsError !== null ? (
          <p className="text-error">{projectsError}</p>
        ) : projects.length === 0 ? (
          <p className="text-warn">
            No projects yet. Create one below, or run <code>npm run db:seed</code> for the default project.
          </p>
        ) : (
          <div className="field">
            <label htmlFor="project-select">Active project</label>
            <select
              id="project-select"
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="project-switch-hint" role="status">
              Each project has its own WhatsApp link. You are scheduling for <strong>{selectedProjectName}</strong> —
              switch here before sending if you manage multiple accounts.
            </p>
          </div>
        )}
      </section>

      {!projectsLoading ? (
        <section className="app-card">
          <h2 className="page-header__title" style={{ fontSize: "1.125rem", marginBottom: "var(--space-2)" }}>
            New project
          </h2>
          <p className="hint">Creates another WhatsApp workspace (separate login). Link from the QR flow after you switch.</p>
          <form onSubmit={onCreateProject}>
            <div className="field">
              <label htmlFor="new-project-name">Name</label>
              <input
                id="new-project-name"
                type="text"
                value={newProjectName}
                maxLength={256}
                onChange={(e) => {
                  setNewProjectName(e.target.value);
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="new-project-desc">Description (optional)</label>
              <textarea
                id="new-project-desc"
                value={newProjectDescription}
                maxLength={2000}
                rows={2}
                onChange={(e) => {
                  setNewProjectDescription(e.target.value);
                }}
              />
            </div>
            {createProjectError !== null ? <p className="text-error">{createProjectError}</p> : null}
            <button type="submit" className="btn btn--primary" disabled={createProjectSubmitting}>
              {createProjectSubmitting ? "Creating…" : "Create project"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
