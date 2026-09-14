import { eq, desc } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole, type WorkspaceRole } from "@rdv/auth";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { Product } from "./entities.js";

const { products, workspaceMembers } = schema;

/**
 * Wave 2 Phase 2 (plan §7): Product CRUD. Mirrors the exact shape already
 * established in packages/auth (requireRole after a workspace-scoped
 * membership lookup, audit log in the same transaction, oneOrThrow on
 * every insert/update expected to affect exactly one row) — not a new
 * pattern for this codebase, just a new entity using it.
 */
async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: WorkspaceRole
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

export async function createProduct(params: {
  workspaceId: string;
  actorUserId: string;
  name: string;
  description?: string | null;
}): Promise<Product> {
  const { workspaceId, actorUserId, name, description } = params;
  if (!name || name.trim().length === 0) {
    throw new ValidationError("name is required to create a product");
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const product = oneOrThrow(
      await tx
        .insert(products)
        .values({ workspaceId, name: name.trim(), description: description ?? null, createdBy: actorUserId })
        .returning(),
      "insert product"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "product.created",
      entityType: "product",
      entityId: product.id,
      metadata: { name: product.name },
    });

    return product;
  });
}

export async function listProducts(params: { workspaceId: string; actorUserId: string }): Promise<Product[]> {
  const { workspaceId, actorUserId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(products).where(eq(products.workspaceId, workspaceId)).orderBy(desc(products.createdAt));
  });
}

export async function getProduct(params: {
  workspaceId: string;
  actorUserId: string;
  productId: string;
}): Promise<Product> {
  const { workspaceId, actorUserId, productId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw new NotFoundError(`No product with id ${productId}`);
    return product;
  });
}

export async function updateProduct(params: {
  workspaceId: string;
  actorUserId: string;
  productId: string;
  name?: string;
  description?: string | null;
  status?: "draft" | "active" | "archived";
}): Promise<Product> {
  const { workspaceId, actorUserId, productId, name, description, status } = params;
  if (name !== undefined && name.trim().length === 0) {
    throw new ValidationError("name must not be empty");
  }

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [existing] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!existing) throw new NotFoundError(`No product with id ${productId}`);

    const patch: Partial<Pick<Product, "name" | "description" | "status">> = {};
    if (name !== undefined) patch.name = name.trim();
    if (description !== undefined) patch.description = description;
    if (status !== undefined) patch.status = status;

    if (Object.keys(patch).length === 0) {
      return existing;
    }

    const updated = oneOrThrow(
      await tx.update(products).set(patch).where(eq(products.id, productId)).returning(),
      "update product"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "product.updated",
      entityType: "product",
      entityId: updated.id,
      metadata: { patch },
    });

    return updated;
  });
}
