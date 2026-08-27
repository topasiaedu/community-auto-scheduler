import { StrictMode, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NmcasVmProvider } from "./context/NmcasVmContext.js";
import { App } from "./App.js";
import "./globals.css";
import "./index.css";

document.title = "NMCAS";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Missing #root element");
}

function Root(): ReactElement {
  return (
    <BrowserRouter>
      <NmcasVmProvider>
        <TooltipProvider>
          <App />
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </NmcasVmProvider>
    </BrowserRouter>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
