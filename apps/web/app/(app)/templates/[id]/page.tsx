import { getTemplate } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { TemplateEditor } from "./TemplateEditor";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ButtonLink } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Card } from "../../../../components/ui/Card";

export default async function TemplateDetailPage({ params }: { params: { id: string } }) {
  let actor;
  try {
    actor = await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to view this template."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  const template = await getTemplate({ workspaceId: actor.workspaceId, actorUserId: actor.userId, templateId: params.id });

  return (
    <div>
      <PageHeader title={template.name} breadcrumbs={[{ label: "Templates", href: "/templates" }, { label: template.name }]} />
      <Card>
        <TemplateEditor template={template} />
      </Card>
    </div>
  );
}
