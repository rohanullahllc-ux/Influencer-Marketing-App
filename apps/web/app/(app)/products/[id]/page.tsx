import { getProduct, listProductIntelligenceVersions, listCampaigns } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { GenerateIntelligenceButton } from "./GenerateIntelligenceButton";
import { IntelligenceVersionCard } from "./IntelligenceVersionCard";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ButtonLink } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { StatusBadge, toneForStatus } from "../../../../components/ui/StatusBadge";
import { Tabs } from "../../../../components/ui/Tabs";
import { Table, Thead, Th, Tr, Td } from "../../../../components/ui/Table";

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view this product."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const [product, versions, allCampaigns] = await Promise.all([
    getProduct({ workspaceId: actor.workspaceId, actorUserId: actor.userId, productId: params.id }),
    listProductIntelligenceVersions({ workspaceId: actor.workspaceId, actorUserId: actor.userId, productId: params.id }),
    listCampaigns({ workspaceId: actor.workspaceId, actorUserId: actor.userId }),
  ]);

  const sortedVersions = [...versions].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
  const canApprove = actor.role === "owner" || actor.role === "admin";
  const hasApprovedIntelligence = sortedVersions.some((v) => v.status === "approved");
  const relatedCampaigns = allCampaigns.filter((c) => c.productId === product.id);

  return (
    <div>
      <PageHeader
        title={product.name}
        description={product.description ?? undefined}
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: product.name }]}
        actions={<StatusBadge label={product.status} tone={toneForStatus(product.status)} />}
      />

      <Tabs
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <Card title="Overview">
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Status</dt>
                    <dd className="mt-1">
                      <StatusBadge label={product.status} tone={toneForStatus(product.status)} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Created</dt>
                    <dd className="mt-1 text-body text-ink">{new Date(product.createdAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Intelligence</dt>
                    <dd className="mt-1 text-body text-ink">
                      {hasApprovedIntelligence ? (
                        <StatusBadge label="approved" tone="success" />
                      ) : sortedVersions.length > 0 ? (
                        <StatusBadge label="draft — needs approval" tone="warning" />
                      ) : (
                        <StatusBadge label="not generated" tone="neutral" />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-label uppercase tracking-wide text-ink-faint">Related campaigns</dt>
                    <dd className="mt-1 text-body text-ink">{relatedCampaigns.length}</dd>
                  </div>
                  {product.description && (
                    <div className="sm:col-span-2">
                      <dt className="text-label uppercase tracking-wide text-ink-faint">Description</dt>
                      <dd className="mt-1 text-body text-ink">{product.description}</dd>
                    </div>
                  )}
                </dl>
              </Card>
            ),
          },
          {
            id: "intelligence",
            label: "Product Intelligence",
            badge: sortedVersions.length,
            content: (
              <div>
                <Card title="Generate a new draft" className="mb-4">
                  <GenerateIntelligenceButton productId={product.id} />
                </Card>
                {sortedVersions.length === 0 ? (
                  <EmptyState title="No intelligence generated yet" description="Click Generate AI Intelligence above to draft one." />
                ) : (
                  <div className="flex flex-col gap-4">
                    {sortedVersions.map((v) => (
                      <IntelligenceVersionCard
                        key={v.id}
                        version={v}
                        productId={product.id}
                        canEdit={true}
                        canApprove={canApprove}
                      />
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          {
            id: "discovery",
            label: "Creator Discovery",
            content: (
              <Card title="Creator Discovery">
                {hasApprovedIntelligence ? (
                  <DiscoveryPanel productId={product.id} />
                ) : (
                  <EmptyState
                    title="Approve intelligence first"
                    description="Approve a Product Intelligence version in the Product Intelligence tab to enable creator discovery for this product."
                  />
                )}
              </Card>
            ),
          },
          {
            id: "campaigns",
            label: "Related Campaigns",
            badge: relatedCampaigns.length,
            content: (
              <Card title="Related Campaigns">
                {relatedCampaigns.length === 0 ? (
                  <EmptyState
                    title="No campaigns yet"
                    description="Create a campaign for this product to start outreach."
                    action={<ButtonLink href="/campaigns/new" variant="primary">+ New campaign</ButtonLink>}
                  />
                ) : (
                  <Table>
                    <Thead>
                      <Th>Name</Th>
                      <Th>Status</Th>
                      <Th>Created</Th>
                    </Thead>
                    <tbody>
                      {relatedCampaigns.map((c) => (
                        <Tr key={c.id}>
                          <Td>
                            <a href={`/campaigns/${c.id}`} className="font-medium text-primary-600 no-underline hover:text-primary-700 hover:underline">
                              {c.name}
                            </a>
                          </Td>
                          <Td>
                            <StatusBadge label={c.status} tone={toneForStatus(c.status)} />
                          </Td>
                          <Td className="text-ink-subtle">{new Date(c.createdAt).toLocaleString()}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
