/**
 * Minimal, dependency-free migration runner for Wave 1.
 *
 * Deliberately NOT drizzle-kit's own migration mechanism: the Step 5 plan
 * calls for raw, hand-written SQL migrations (full control over RLS DDL,
 * `force row level security`, enum creation order, etc.) rather than
 * generated migrations. This runner just applies each .sql file in
 * `migrations/` in filename order, exactly once, tracked in a
 * `schema_migrations` table, inside a transaction per file.
 *
 * Usage: npm run migrate  (see root package.json)
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { getLogger } from "@rdv/lib";

const log = getLogger({ module: "db:migrate" });
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

async function main() {
  const sql = postgres(getConnectionString(), { max: 1 });

  try {
    await sql`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const applied = new Set(
      (await sql<{ filename: string }[]>`select filename from schema_migrations`).map((r) => r.filename)
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      log.warn("No .sql migration files found in %s", MIGRATIONS_DIR);
    }

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        log.info({ file }, "already applied, skipping");
        continue;
      }

      const fullPath = join(MIGRATIONS_DIR, file);
      const text = readFileSync(fullPath, "utf-8");
      log.info({ file }, "applying migration");

      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`insert into schema_migrations (filename) values (${file})`;
      });

      appliedCount++;
      log.info({ file }, "applied migration");
    }

    log.info({ appliedCount, total: files.length }, "migration run complete");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  log.error({ err }, "migration run failed");
  process.exit(1);
});
