/**
 * Consistent page title and optional subtitle for routed sections.
 */

import type { ReactElement, ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps): ReactElement {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        {description !== undefined && description.length > 0 ? (
          <p className="page-header__description">{description}</p>
        ) : null}
      </div>
      {actions !== undefined ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
