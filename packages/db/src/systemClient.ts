import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

/**
 * DANGER: this connection uses the `rdv_system` Postgres role, which has
 * BYPASSRLS. It exists for exactly one reason: a handful of bootstrap
 * operations are inherently pre-tenant-context (e.g. "create a workspace"
 * — there is no `app.current_workspace_id` to set for a workspace that
 * does not exist yet until partway through the operation; "list every
 * workspace a user belongs to" — the caller does not know which
 * workspace_id to scope to, that's the point of the query).
 *
 * This client must NEVER be imported outside packages/auth's narrow,
 * audited bootstrap functions (see packages/auth/src/workspaces.ts). Every
 * other query path — everything that already knows which workspace it is
 * operating in — MUST use the RLS-enforced `db` / `withWorkspace` from
 * ./client.ts instead. Using this client as a general-purpose escape hatch
 * from RLS anywhere else defeats the entire tenant-isolation design and is
 * a Wave 1 acceptance-criteria violation, not a convenience.
 */
function getSystemConnectionString(): string {
  const url = process.env.SYSTEM_DATABASE_URL;
  if (!url) throw new Error("SYSTEM_DATABASE_URL is not set");
  return url;
}

export const systemQueryClient = postgres(getSystemConnectionString(), { max: 3 });
export const systemDb = drizzle(systemQueryClient, { schema });
