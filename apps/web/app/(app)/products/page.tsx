import { listProducts } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";

/** Wave 2 Phase 2 (plan §7): product list, the entry point into the Product + Intelligence flow. */
export default async function ProductsPage() {
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

  const products = await listProducts({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Products</h1>
      <p style={{ marginBottom: 16 }}>
        <a href="/products/new">+ New product</a>
      </p>
      {products.length === 0 ? (
        <p style={{ color: "#666" }}>No products yet.</p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th>Name</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>
                  <a href={`/products/${p.id}`}>{p.name}</a>
                </td>
                <td>{p.status}</td>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
