"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Sidebar, SidebarNav } from "./Sidebar";

export interface ShellUser {
  email: string;
  workspaceName: string;
  role: string;
}

export function AppShell({ user, children }: { user: ShellUser | null; children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface-subtle">
      <Sidebar />

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col bg-surface shadow-popover">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="text-card-title font-semibold text-ink">RDV Outreach OS</span>
              <button
                aria-label="Close menu"
                className="rounded-control p-1.5 text-ink-subtle hover:bg-surface-muted"
                onClick={() => setDrawerOpen(false)}
              >
                ✕
              </button>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open menu"
              className="rounded-control p-1.5 text-ink-subtle hover:bg-surface-muted lg:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <span className="text-supporting font-medium text-ink-muted lg:hidden">RDV Outreach OS</span>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-supporting font-medium text-ink">{user.workspaceName}</div>
                <div className="text-meta text-ink-faint">
                  {user.email} · {user.role}
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="rounded-control border border-border-strong bg-white px-3 py-1.5 text-supporting font-medium text-ink-muted transition hover:bg-surface-muted"
              >
                Sign out
              </button>
            </div>
          )}
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
