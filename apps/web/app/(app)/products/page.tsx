import { listProducts } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ButtonLink } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";
import { StatusBadge, toneForStatus } from "../../../components/ui/StatusBadge";
import { Table, Thead, Th, Tr, Td } from "../../../components/ui/Table";

export default async function ProductsPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view products."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const products = await listProducts({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <div>
      <PageHeader
        title="Products"
        description="Products drive AI intelligence, creator discovery, and campaigns."
        actions={<ButtonLink href="/products/new" variant="primary">+ New product</ButtonLink>}
      />

      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Create your first product to start generating AI intelligence and discovering creators."
          action={<ButtonLink href="/products/new" variant="primary">+ New product</ButtonLink>}
        />
      ) : (
        <Table>
          <Thead>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th>Created</Th>
          </Thead>
          <tbody>
            {products.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <a href={`/products/${p.id}`} className="font-medium text-primary-600 no-underline hover:text-primary-700 hover:underline">
                    {p.name}
                  </a>
                </Td>
                <Td>
                  <StatusBadge label={p.status} tone={toneForStatus(p.status)} />
                </Td>
                <Td className="text-ink-subtle">{new Date(p.createdAt).toLocaleString()}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
