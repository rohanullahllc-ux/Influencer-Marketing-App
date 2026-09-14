"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Wave 2 Phase 0 (plan §5, §8): email+password sign-in. Plain inline
 * styles, matching the Wave 1 convention — Tailwind/shared UI primitives
 * arrive in Phase 1 per the plan.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn("credentials", { email, password, redirect: false });

    setSubmitting(false);
    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/");
  }

  return (
    <main style={{ padding: 32, maxWidth: 400 }}>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="email" style={{ display: "block", marginBottom: 4 }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: 4 }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p style={{ color: "#666", fontSize: 14, marginTop: 16 }}>
        New to a workspace? You need a one-time setup link from an Owner/Admin — see{" "}
        <a href="/setup-account">/setup-account</a>.
      </p>
    </main>
  );
}
