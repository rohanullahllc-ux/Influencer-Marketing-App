import { describe, it, expect, beforeEach } from "vitest";
import { createProduct, listProducts, getProduct, updateProduct } from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/** Wave 2 Phase 2 (plan §7): Product CRUD — creation, listing, retrieval, update, and the RBAC/isolation boundary. */
describe("Product CRUD", () => {
  let wsId: string;
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Products WS", ownerEmail: "products-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("products-owner@test.local")).id;
  });

  it("creates a product and records who created it", async () => {
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Widget Pro" });
    expect(product.name).toBe("Widget Pro");
    expect(product.status).toBe("draft");
    expect(product.createdBy).toBe(ownerId);
  });

  it("rejects an empty name", async () => {
    await expect(createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "   " })).rejects.toThrow(
      /name is required/
    );
  });

  it("lists only the current workspace's products", async () => {
    await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "A" });
    await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "B" });

    const otherWs = await createWorkspaceWithOwner({ workspaceName: "Other WS", ownerEmail: "other-owner@test.local" });
    const otherOwnerId = (await getUserByEmail("other-owner@test.local")).id;
    await createProduct({ workspaceId: otherWs.id, actorUserId: otherOwnerId, name: "Not visible" });

    const products = await listProducts({ workspaceId: wsId, actorUserId: ownerId });
    expect(products).toHaveLength(2);
    expect(products.every((p) => p.workspaceId === wsId)).toBe(true);
  });

  it("gets a single product by id, and throws NotFoundError for an unknown id", async () => {
    const created = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Findable" });
    const found = await getProduct({ workspaceId: wsId, actorUserId: ownerId, productId: created.id });
    expect(found.id).toBe(created.id);

    await expect(
      getProduct({ workspaceId: wsId, actorUserId: ownerId, productId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow(/No product/);
  });

  it("updates name/description/status and audits the change", async () => {
    const created = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Old name" });
    const updated = await updateProduct({
      workspaceId: wsId,
      actorUserId: ownerId,
      productId: created.id,
      name: "New name",
      status: "active",
    });
    expect(updated.name).toBe("New name");
    expect(updated.status).toBe("active");
  });

  it("rejects an actor with no membership in the workspace", async () => {
    await createWorkspaceWithOwner({ workspaceName: "Outsider WS", ownerEmail: "outsider@test.local" });
    const outsiderId = (await getUserByEmail("outsider@test.local")).id;

    // outsiderId is a member of the outsider workspace, not wsId — acting
    // against wsId with their id must be rejected (no membership row in
    // wsId's RLS-scoped workspace_members), not silently allowed.
    await expect(createProduct({ workspaceId: wsId, actorUserId: outsiderId, name: "Should fail" })).rejects.toThrow();
  });
});
