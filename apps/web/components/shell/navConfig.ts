export interface NavItem {
  label: string;
  href: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Sidebar grouping per the V1 UI/UX redesign spec §3. Routes are unchanged —
// this only groups/labels existing pages for navigation.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/" },
      { label: "Products", href: "/products" },
      { label: "Creators", href: "/creators" },
      { label: "Campaigns", href: "/campaigns" },
    ],
  },
  {
    label: "Execution",
    items: [
      { label: "Approvals", href: "/approvals" },
      { label: "Replies", href: "/replies" },
      { label: "Analytics", href: "/analytics" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Operations", href: "/ops" },
      { label: "Suppressions", href: "/suppressions" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Templates", href: "/templates" },
      { label: "Integrations", href: "/settings/integrations" },
      { label: "Members", href: "/settings/members" },
    ],
  },
];
