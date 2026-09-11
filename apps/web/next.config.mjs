/** @type {import('next').NextConfig} */
const nextConfig = {
  // These are real local workspace packages (TS source, no build step of
  // their own) — Next must run its own compiler over them rather than
  // treating them as pre-built node_modules.
  transpilePackages: ["@rdv/db", "@rdv/queue", "@rdv/auth", "@rdv/notifications", "@rdv/ai", "@rdv/lib"],
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // Our workspace packages use explicit `.js` extensions on relative
    // imports of `.ts` files (required for real Node ESM execution via
    // tsx — see e.g. packages/db/src/index.ts). Webpack doesn't apply
    // TypeScript's NodeNext-style ".js" → ".ts" rewrite by default; this
    // teaches it to, the same way tsx/node's own loader already does.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
