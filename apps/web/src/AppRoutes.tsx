/**
 * Application routes: public sign-in and protected workspace sections.
 */

import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useNmcasVm } from "./context/NmcasVmContext.js";
import { ProtectedLayout } from "./layouts/ProtectedLayout.js";
import { AppShell } from "./layouts/AppShell.js";
import { SignInPage } from "./pages/SignInPage.js";
import { QueuePage } from "./pages/QueuePage.js";
import { ComposePage } from "./pages/ComposePage.js";
import { ConnectPage } from "./pages/ConnectPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

function CatchAllRedirect(): ReactElement {
  const vm = useNmcasVm();
  if (!vm.authReady) {
    return (
      <div className="full-page-loading" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        <span>Loading…</span>
      </div>
    );
  }
  if (vm.session === null) {
    return <Navigate to="/sign-in" replace />;
  }
  return <Navigate to="/queue" replace />;
}

export function AppRoutes(): ReactElement {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/" element={<ProtectedLayout />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/queue" replace />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="compose" element={<ComposePage />} />
          <Route path="connect" element={<ConnectPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* Legacy redirects */}
          <Route path="dashboard" element={<Navigate to="/queue" replace />} />
          <Route path="schedule" element={<Navigate to="/compose" replace />} />
          <Route path="messages" element={<Navigate to="/queue" replace />} />
          <Route path="account" element={<Navigate to="/settings" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<CatchAllRedirect />} />
    </Routes>
  );
}
