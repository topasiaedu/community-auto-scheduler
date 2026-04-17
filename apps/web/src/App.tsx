/**
 * Root application — routing and layout are defined in `AppRoutes`.
 */

import type { ReactElement } from "react";
import { AppRoutes } from "./AppRoutes.js";

export function App(): ReactElement {
  return <AppRoutes />;
}
