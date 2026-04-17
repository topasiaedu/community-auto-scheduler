/**
 * Public sign-in page — split hero/form layout.
 */

import { useEffect, type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useNmcasVm } from "../context/NmcasVmContext.js";
import { SignInForm } from "../components/SignInForm.js";
import { SupabaseMissingCard } from "../components/SupabaseMissingCard.js";

export function SignInPage(): ReactElement {
  const vm = useNmcasVm();

  useEffect(() => {
    document.title = "Sign in · NMCAS";
  }, []);

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

  if (vm.session !== null) {
    return <Navigate to="/queue" replace />;
  }

  return (
    <div className="auth-page">
      <div className="auth-page__grid">
        <div className="auth-page__hero">
          <p className="auth-page__kicker">NMCAS · Internal</p>
          <h1 className="auth-page__title">Schedule WhatsApp sends for your community.</h1>
          <p className="auth-page__copy">
            Write your posts and polls now, choose when they go out. Runs in Malaysia Time (MYT) —
            built for operators who need reliability, not demos.
          </p>
        </div>
        <div className="auth-page__form">
          <SignInForm vm={vm} />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Internal tool — restrict Supabase sign-ups in production if needed.
          </p>
        </div>
      </div>
    </div>
  );
}
