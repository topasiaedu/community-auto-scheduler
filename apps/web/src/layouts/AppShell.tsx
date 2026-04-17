/**
 * Persistent header and primary navigation for signed-in operators.
 * Uses shadcn primitives: DropdownMenu, Avatar, Select.
 */

import type { ReactElement } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNmcasVm } from "../context/NmcasVmContext.js";

function getInitials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]/);
  if (parts.length >= 2 && parts[0] !== undefined && parts[1] !== undefined) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

const NAV_LINKS = [
  { to: "/queue", label: "Queue" },
  { to: "/compose", label: "Compose" },
  { to: "/connect", label: "Connect" },
  { to: "/settings", label: "Settings" },
] as const;

export function AppShell(): ReactElement {
  const vm = useNmcasVm();
  const location = useLocation();
  const email = vm.session?.user.email ?? vm.session?.user.id ?? "";
  const showBanner =
    vm.canUseApiRoutes && !vm.waConnected && location.pathname !== "/connect";

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header__top">
          <NavLink to="/queue" className="shell-brand">
            <span className="shell-brand__name">NMCAS</span>
            <span className="shell-brand__badge">Internal</span>
          </NavLink>

          <div className="flex items-center gap-2">
            {/* Project switcher */}
            {vm.projects.length > 0 ? (
              <Select
                value={vm.selectedProjectId}
                onValueChange={(v) => vm.setSelectedProjectId(v)}
              >
                <SelectTrigger className="h-8 w-auto max-w-[180px] rounded-full border-border text-xs font-medium">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent align="end">
                  {vm.projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {/* User avatar + dropdown */}
            {email.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="h-8 w-8 cursor-pointer bg-primary">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                        {getInitials(email)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-xs text-muted-foreground">Signed in as</p>
                    <p className="truncate text-sm font-medium">{email}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive cursor-pointer"
                    onClick={() => vm.onSignOut()}
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        <nav className="shell-nav" aria-label="Primary">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn("shell-nav__link", isActive && "shell-nav__link--active")
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {showBanner ? (
        <Alert className="rounded-none border-x-0 border-t-0 border-amber-300 bg-amber-50 text-amber-900 py-2 px-4">
          <AlertDescription className="flex items-center justify-between gap-4 text-sm">
            <span>
              {vm.waState?.state === "connecting"
                ? "WhatsApp is connecting…"
                : "WhatsApp not linked"}
            </span>
            <NavLink to="/connect" className="font-semibold text-primary hover:underline">
              Go to Connect →
            </NavLink>
          </AlertDescription>
        </Alert>
      ) : null}

      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
