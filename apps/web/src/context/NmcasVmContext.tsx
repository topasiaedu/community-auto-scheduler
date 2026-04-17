/**
 * Provides the NMCAS view model from `useNmcasApp` to the router tree without prop drilling.
 */

import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { useNmcasApp, type NmcasViewModel } from "../hooks/useNmcasApp.js";

const NmcasVmContext = createContext<NmcasViewModel | null>(null);

export function NmcasVmProvider({ children }: { children: ReactNode }): ReactElement {
  const vm = useNmcasApp();
  return <NmcasVmContext.Provider value={vm}>{children}</NmcasVmContext.Provider>;
}

export function useNmcasVm(): NmcasViewModel {
  const value = useContext(NmcasVmContext);
  if (value === null) {
    throw new Error("useNmcasVm must be used within NmcasVmProvider");
  }
  return value;
}
