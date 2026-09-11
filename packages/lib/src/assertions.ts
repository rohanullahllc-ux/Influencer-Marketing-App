/**
 * Narrows `arr[0]` from `T | undefined` to `T`, throwing if the array was
 * actually empty. Exists because `noUncheckedIndexedAccess` (deliberately
 * enabled repo-wide) correctly types Drizzle's `.returning()`/`.select()`
 * results as possibly-empty arrays — this makes the "an insert/update
 * that should always affect exactly one row didn't" case an explicit,
 * loud failure instead of an unchecked-non-null assertion hiding a type
 * error that could one day be a real bug (e.g. a WHERE clause silently
 * matching nothing).
 */
export function oneOrThrow<T>(rows: T[], context: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Expected exactly one row for "${context}", got none`);
  }
  return row;
}
