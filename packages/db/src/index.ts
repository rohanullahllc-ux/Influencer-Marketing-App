export { db, queryClient, withWorkspace, schema } from "./client.js";
export * from "./schema.js";
export { writeAuditLog, type AuditEntry } from "./audit.js";
// Not re-exported from the barrel on purpose — see systemClient.ts's own
// warning comment. Import it explicitly (`@rdv/db/systemClient`) only from
// packages/auth's bootstrap functions, never via the general `@rdv/db` barrel.
