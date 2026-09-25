"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "../../components/ui/Card";
import { FormField, TextInput } from "../../components/ui/Form";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";

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
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-center text-page-title text-ink">RDV Outreach OS</h1>
          <Card title="Account ready">
            <p className="mb-4 text-body text-ink-subtle">Your password is set. You can now sign in.</p>
            <Button variant="primary" className="w-full" onClick={() => router.push("/login")}>
              Go to sign in
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-page-title text-ink">RDV Outreach OS</h1>
        <Card title="Set up your account">
          <p className="mb-4 text-supporting text-ink-subtle">
            Paste the one-time setup link/token your Owner or Admin gave you, then choose a password.
          </p>
          <form onSubmit={handleSubmit}>
            <FormField label="Setup token" htmlFor="token" required>
              <TextInput id="token" required value={token} onChange={(e) => setToken(e.target.value)} />
            </FormField>
            <FormField label="New password" htmlFor="password" hint="Minimum 8 characters" required>
              <TextInput
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <FormField label="Confirm password" htmlFor="confirm" required>
              <TextInput
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </FormField>
            {error && (
              <div className="mb-4">
                <Alert tone="danger">{error}</Alert>
              </div>
            )}
            <Button type="submit" variant="primary" disabled={submitting} className="w-full">
              {submitting ? "Setting up…" : "Set password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
