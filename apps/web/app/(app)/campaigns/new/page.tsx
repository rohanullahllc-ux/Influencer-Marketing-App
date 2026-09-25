import { listProducts } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { NewCampaignForm } from "./NewCampaignForm";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ButtonLink } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";

export default async function NewCampaignPage() {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to create a campaign."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const products = await listProducts({ workspaceId: actor.workspaceId, actorUserId: actor.userId });

  return (
    <div>
      <PageHeader title="New campaign" breadcrumbs={[{ label: "Campaigns", href: "/campaigns" }, { label: "New" }]} />
      <Card className="max-w-2xl">
        <NewCampaignForm products={products} />
      </Card>
    </div>
  );
}
