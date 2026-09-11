/**
 * Dev-only convenience seed: one workspace with an owner and a second
 * member. Exercises the real @rdv/auth bootstrap path (not raw inserts)
 * so this doubles as a manual smoke test of workspace creation + RBAC.
 * Never run against anything but a local/dev database. Idempotent.
 *
 * Lives at repo root (not in packages/db) deliberately: it depends on both
 * @rdv/db and @rdv/auth, and @rdv/auth itself depends on @rdv/db, so
 * putting this script inside packages/db would create a circular
 * workspace dependency.
 */
import { queryClient } from "@rdv/db";
import { systemQueryClient } from "@rdv/db/systemClient";
import { createWorkspaceWithOwner, addMember, listWorkspacesForUser, getUserByEmail } from "@rdv/auth";
import { getLogger } from "@rdv/lib";

const log = getLogger({ module: "seed-dev" });

async function main() {
  const ownerEmail = "owner@rdv.local";
  const memberEmail = "operator@rdv.local";

  const existing = await getUserByEmail(ownerEmail).catch(() => undefined);
  let workspaceId: string;

  if (existing) {
    const workspacesForOwner = await listWorkspacesForUser(existing.id);
    const found = workspacesForOwner.find((w) => w.name === "RDV Dev Workspace");
    if (found) {
      workspaceId = found.id;
      log.info({ workspaceId }, "dev workspace already exists, skipping bootstrap");
    } else {
      const ws = await createWorkspaceWithOwner({
        workspaceName: "RDV Dev Workspace",
        ownerEmail,
        ownerName: "Dev Owner",
      });
      workspaceId = ws.id;
      log.info({ workspaceId }, "created dev workspace with owner");
    }
  } else {
    const ws = await createWorkspaceWithOwner({
      workspaceName: "RDV Dev Workspace",
      ownerEmail,
      ownerName: "Dev Owner",
    });
    workspaceId = ws.id;
    log.info({ workspaceId }, "created dev workspace with owner");
  }

  const owner = await getUserByEmail(ownerEmail);
  await addMember({
    workspaceId,
    actorUserId: owner.id,
    targetEmail: memberEmail,
    targetName: "Dev Operator",
    role: "member_operator",
  });

  log.info({ workspaceId, ownerEmail, memberEmail }, "dev seed complete");
}

main()
  .catch((err) => {
    log.error({ err }, "seed failed");
    process.exit(1);
  })
  .finally(async () => {
    await queryClient.end();
    await systemQueryClient.end();
  });
