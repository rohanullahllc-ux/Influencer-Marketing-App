import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema.js";

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

// A small pool is enough for Wave 1 / dev; production sizing is a
// deployment-time decision (see docs/ENVIRONMENT.md), not fixed here.
export const queryClient = postgres(getConnectionString(), { max: 10 });

export const db = drizzle(queryClient, { schema });

/**
 * Runs `fn` inside a transaction with `app.current_workspace_id` set as a
 * session-local (transaction-scoped) variable, which the RLS policies in
 * migrations/0002_rls.sql read. This is the *only* sanctioned way tenant-
 * scoped tables should be queried — it is defense-in-depth alongside (never
 * instead of) the app-layer authorization check the caller must already
 * have performed to know `workspaceId` is one the current user may act in.
 *
 * `set_config(..., true)` scopes the setting to the current transaction,
 * so it can never leak across requests on a pooled connection.
 */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_workspace_id', ${workspaceId}, true)`);
    return fn(tx);
  });
}

/** Escape hatch for system/cross-workspace operations (workspace creation,
 * membership listing for "which workspaces can this user see"). Used
 * sparingly and only from the application layer after its own checks —
 * RLS on workspace_members etc. will still apply and simply return no rows
 * for tables it protects unless `app.current_workspace_id` is also set. */
export { schema };
