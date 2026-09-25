"use client";

import { useState } from "react";

export interface TabPanel {
  id: string;
  label: string;
  badge?: number;
  content: React.ReactNode;
}

export function Tabs({ tabs, defaultTab }: { tabs: TabPanel[]; defaultTab?: string }) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);

  return (
    <div>
      <div className="mb-5 overflow-x-auto border-b border-border">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-supporting font-medium transition ${
                active === tab.id
                  ? "border-primary-600 text-primary-700"
                  : "border-transparent text-ink-subtle hover:border-border-strong hover:text-ink"
              }`}
            >
              {tab.label}
              {typeof tab.badge === "number" && tab.badge > 0 && (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-pill px-1.5 text-meta ${
                    active === tab.id ? "bg-primary-100 text-primary-700" : "bg-neutral-100 text-ink-subtle"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} hidden={active !== tab.id}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
