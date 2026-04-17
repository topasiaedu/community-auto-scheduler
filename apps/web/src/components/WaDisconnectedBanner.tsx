/**
 * Persistent amber banner shown on any page when WhatsApp is not connected.
 * Hidden on the /connect page itself.
 */

import type { ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

type WaDisconnectedBannerProps = {
  vm: NmcasViewModel;
};

export function WaDisconnectedBanner({ vm }: WaDisconnectedBannerProps): ReactElement | null {
  const location = useLocation();

  if (!vm.canUseApiRoutes) {
    return null;
  }
  if (vm.waConnected) {
    return null;
  }
  if (location.pathname === "/connect") {
    return null;
  }

  const label =
    vm.waState?.state === "connecting"
      ? "WhatsApp is connecting…"
      : vm.waState === null
        ? "WhatsApp status unavailable"
        : "WhatsApp not linked";

  return (
    <div className="wa-banner" role="alert">
      <span className="wa-banner__text">{label}</span>
      <Link to="/connect" className="wa-banner__link">
        Go to Connect →
      </Link>
    </div>
  );
}
