/**
 * Initials avatar in the shell header — click opens a small dropdown with email and sign-out.
 */

import { useRef, useState, useEffect, type ReactElement } from "react";
import type { NmcasViewModel } from "../hooks/useNmcasApp.js";

type UserAvatarProps = {
  vm: NmcasViewModel;
};

function getInitials(email: string): string {
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return "?";
  }
  const parts = trimmed.split("@")[0]?.split(/[._-]/) ?? [];
  if (parts.length >= 2 && parts[0] !== undefined && parts[1] !== undefined) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function UserAvatar({ vm }: UserAvatarProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const email = vm.session?.user.email ?? vm.session?.user.id ?? "";

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (containerRef.current !== null && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (email.length === 0) {
    return null;
  }

  return (
    <div className="user-avatar-wrap" ref={containerRef}>
      <button
        type="button"
        className="user-avatar"
        aria-expanded={open}
        aria-haspopup="true"
        title={email}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <span className="user-avatar__initials">{getInitials(email)}</span>
      </button>
      {open ? (
        <div className="user-menu" role="menu">
          <p className="user-menu__email">{email}</p>
          <button
            type="button"
            className="user-menu__item user-menu__item--danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              vm.onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
