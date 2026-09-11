#!/usr/bin/env bash
# Wave 1 Foundation backup: a plain pg_dump of DATABASE_URL, written to
# backups/<timestamp>.sql (gitignored). This is deliberately simple —
# Postgres is the single source of truth (Step 5 §5.1), so a full logical
# dump is sufficient for Wave 1; a real deployment's backup strategy
# (retention, offsite storage, point-in-time recovery via WAL archiving)
# is an infrastructure/deployment decision out of scope for this repo,
# not something this script pretends to solve.
#
# IMPORTANT: DATABASE_URL here must be the `rdv_system` (BYPASSRLS) role,
# not the ordinary `rdv_app` role. Found the hard way while building this
# script: every tenant-scoped table is under FORCE ROW LEVEL SECURITY, so
# a dump run as `rdv_app` with no app.current_workspace_id set (the
# correct state for an out-of-request-context tool like this one) sees
# zero rows per table and pg_dump errors rather than silently producing
# an incomplete backup. Same applies to restore.sh on the way back in.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/${TIMESTAMP}.sql"

echo "Backing up $DATABASE_URL to $OUT_FILE"
pg_dump "$DATABASE_URL" --no-owner --no-privileges -f "$OUT_FILE"
echo "Backup complete: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
