/**
 * Requires a signed-in Supabase session; redirects guests to `/sign-in`.
 */

import type { ReactElement } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useNmcasVm } from "../context/NmcasVmContext.js";
import { SupabaseMissingCard } from "../components/SupabaseMissingCard.js";

export function ProtectedLayout(): ReactElement {
  const vm = useNmcasVm();

  if (vm.supabase === null) {
    return (
      <div className="auth-page">
        <div className="auth-page__inner auth-page__inner--narrow">
          <SupabaseMissingCard />
        </div>
      </div>
    );
  }

  if (!vm.authReady) {
    return (
      <div className="full-page-loading" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        <span>Loading session…</span>
      </div>
    );
  }

  if (vm.session === null) {
    return <Navigate to="/sign-in" replace />;
  }

  return <Outlet />;
}
