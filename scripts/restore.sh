#!/usr/bin/env bash
# Restores a backup produced by backup.sh into DATABASE_URL. Refuses to
# run without an explicit --yes flag since this is a destructive
# operation against whatever database DATABASE_URL points at.
#
# IMPORTANT: DATABASE_URL must be the `rdv_system` (BYPASSRLS) role, same
# as backup.sh — a restore run as `rdv_app` would have every INSERT
# rejected by the FORCE ROW LEVEL SECURITY policies (there is no
# app.current_workspace_id in this context, and it would be wrong to set
# one per-row anyway during a bulk restore).
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

BACKUP_FILE="${1:-}"
CONFIRM="${2:-}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: DATABASE_URL=... scripts/restore.sh <path-to-backup.sql> --yes" >&2
  exit 1
fi

if [ "$CONFIRM" != "--yes" ]; then
  echo "This will apply $BACKUP_FILE to $DATABASE_URL, which may overwrite existing data." >&2
  echo "Re-run with --yes to confirm." >&2
  exit 1
fi

echo "Restoring $BACKUP_FILE into $DATABASE_URL"
# -v ON_ERROR_STOP=1 and --single-transaction are both load-bearing, not
# defensive boilerplate: found by testing this script for real — without
# ON_ERROR_STOP, psql keeps going past a failed statement and exits 0
# regardless, so a restore that actually failed partway (e.g. a
# permissions problem on the target) would print errors but still report
# "Restore complete." --single-transaction additionally makes the whole
# restore atomic, so a real failure leaves the target database exactly as
# it was, never half-restored.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$BACKUP_FILE"
echo "Restore complete."
