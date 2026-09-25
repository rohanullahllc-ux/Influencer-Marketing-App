"use client";

import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "./navConfig";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-2.5 pb-1.5 text-label uppercase tracking-wide text-ink-faint">{group.label}</div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`rounded-control px-2.5 py-1.5 text-body no-underline transition ${
                    active
                      ? "bg-primary-50 font-medium text-primary-700"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <a href="/" className="text-card-title font-semibold text-ink no-underline">
          RDV Outreach OS
        </a>
      </div>
      <SidebarNav />
    </aside>
  );
}
