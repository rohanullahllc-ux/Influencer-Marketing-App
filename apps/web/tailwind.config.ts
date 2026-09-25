import type { Config } from "tailwindcss";

// Design tokens for the V1 UI/UX redesign (RDV_V1_UI_UX_REDESIGN_MASTER_PROMPT.md
// §4/§22). Presentational only — no business logic lives here.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral scale — the app's base surface/text/border palette.
        surface: {
          DEFAULT: "#ffffff",
          subtle: "#f8fafc",
          muted: "#f1f5f9",
        },
        border: {
          DEFAULT: "#e2e8f0",
          strong: "#cbd5e1",
        },
        ink: {
          DEFAULT: "#0f172a",
          muted: "#475569",
          subtle: "#64748b",
          faint: "#94a3b8",
        },
        // Primary brand/interactive color.
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        // Semantic status colors (§4): green/amber/red/gray/blue, used
        // consistently for success/pending/blocked/inactive/interactive.
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          600: "#16a34a",
          700: "#15803d",
          900: "#14532d",
        },
        warning: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          600: "#d97706",
          700: "#b45309",
          900: "#78350f",
        },
        danger: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          600: "#dc2626",
          700: "#b91c1c",
          900: "#7f1d1d",
        },
        neutral: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          600: "#475569",
          700: "#334155",
          900: "#0f172a",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        // Deliberate type scale (§22): page title -> section -> card -> body -> supporting -> meta -> label.
        "page-title": ["1.5rem", { lineHeight: "2rem", fontWeight: "700" }],
        section: ["1.125rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        "card-title": ["0.9375rem", { lineHeight: "1.375rem", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.375rem", fontWeight: "400" }],
        supporting: ["0.8125rem", { lineHeight: "1.25rem", fontWeight: "400" }],
        meta: ["0.75rem", { lineHeight: "1.125rem", fontWeight: "500" }],
        label: ["0.75rem", { lineHeight: "1rem", fontWeight: "600" }],
      },
      borderRadius: {
        DEFAULT: "6px",
        card: "8px",
        control: "6px",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
        popover: "0 4px 16px -2px rgb(15 23 42 / 0.12), 0 2px 4px -2px rgb(15 23 42 / 0.06)",
      },
      spacing: {
        18: "4.5rem",
        sidebar: "16rem",
        "sidebar-collapsed": "4rem",
      },
    },
  },
  plugins: [],
};

export default config;
