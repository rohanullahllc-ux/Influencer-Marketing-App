"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Wave 2 Phase 0 (plan §5): consumes a one-time setup token issued by an
 * Owner/Admin and lets the member choose their own password — the
 * Owner/Admin never learns it (see docs/DECISIONS.md addition on this
 * flow, and packages/auth/src/onboarding.ts).
 *
 * `useSearchParams` requires a Suspense boundary in the App Router (it can
 * bail out of static rendering) — the actual form lives in
 * `SetupAccountForm` below, wrapped here.
 */
export default function SetupAccountPage() {
  return (
    <Suspense fallback={null}>
      <SetupAccountForm />
    </Suspense>
  );
}

function SetupAccountForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/setup-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <main style={{ padding: 32, maxWidth: 400 }}>
        <h1>Account ready</h1>
        <p>Your password is set. You can now sign in.</p>
        <button onClick={() => router.push("/login")} style={{ padding: "8px 16px" }}>
          Go to sign in
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 32, maxWidth: 400 }}>
      <h1>Set up your account</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Paste the one-time setup link/token your Owner or Admin gave you, then choose a password.
      </p>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="token" style={{ display: "block", marginBottom: 4 }}>
            Setup token
          </label>
          <input
            id="token"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="password" style={{ display: "block", marginBottom: 4 }}>
            New password (min. 8 characters)
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="confirm" style={{ display: "block", marginBottom: 4 }}>
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={submitting} style={{ padding: "8px 16px" }}>
          {submitting ? "Setting up…" : "Set password"}
        </button>
      </form>
    </main>
  );
}
