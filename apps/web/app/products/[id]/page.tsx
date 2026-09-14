import { getProduct, listProductIntelligenceVersions } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { GenerateIntelligenceButton } from "./GenerateIntelligenceButton";
import { IntelligenceVersionCard } from "./IntelligenceVersionCard";

/** Wave 2 Phase 2 (plan §7): product detail + the Product Intelligence review/approve panel. */
export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <main style={{ padding: 32 }}>
          <p>
            You must <a href="/login">sign in</a> to view this page.
          </p>
        </main>
      );
    }
    throw err;
  }

  const product = await getProduct({ workspaceId: actor.workspaceId, actorUserId: actor.userId, productId: params.id });
  const versions = await listProductIntelligenceVersions({
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    productId: params.id,
  });

  const sortedVersions = [...versions].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
  const canApprove = actor.role === "owner" || actor.role === "admin";

  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <p>
        <a href="/products">← Products</a>
      </p>
      <h1>{product.name}</h1>
      {product.description && <p style={{ color: "#444" }}>{product.description}</p>}
      <p style={{ fontSize: 13, color: "#666" }}>Status: {product.status}</p>

      <h2 style={{ marginTop: 32 }}>Product Intelligence</h2>
      <GenerateIntelligenceButton productId={product.id} />

      {sortedVersions.length === 0 ? (
        <p style={{ color: "#666" }}>No intelligence generated yet.</p>
      ) : (
        sortedVersions.map((v) => (
          <IntelligenceVersionCard
            key={v.id}
            version={v}
            productId={product.id}
            canEdit={true}
            canApprove={canApprove}
          />
        ))
      )}
    </main>
  );
}
