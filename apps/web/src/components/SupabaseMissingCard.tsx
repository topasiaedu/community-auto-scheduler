/**
 * Shown when Vite env vars for Supabase are not set.
 */

import type { ReactElement } from "react";

export function SupabaseMissingCard(): ReactElement {
  return (
    <section className="app-card app-card--centered" role="status">
      <h2 className="page-header__title">Supabase not configured</h2>
      <p>
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (same project as the API), restart
        Vite, and reload.
      </p>
    </section>
  );
}
