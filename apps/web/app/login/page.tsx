"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "../../components/ui/Card";
import { FormField, TextInput } from "../../components/ui/Form";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";

/**
 * Wave 2 Phase 0 (plan §5, §8): email+password sign-in. Outside the
 * authenticated app shell by design — this is a pre-auth screen — but
 * styled with the same design tokens/components for visual consistency.
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
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-page-title text-ink">RDV Outreach OS</h1>
        <Card title="Sign in">
          <form onSubmit={handleSubmit}>
            <FormField label="Email" htmlFor="email" required>
              <TextInput id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField label="Password" htmlFor="password" required>
              <TextInput
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            {error && (
              <div className="mb-4">
                <Alert tone="danger">{error}</Alert>
              </div>
            )}
            <Button type="submit" variant="primary" disabled={submitting} className="w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-meta text-ink-faint">
            New to a workspace? You need a one-time setup link from an Owner/Admin — see{" "}
            <a href="/setup-account" className="text-primary-600 no-underline hover:underline">
              /setup-account
            </a>
            .
          </p>
        </Card>
      </div>
    </div>
  );
}
