import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { NewTemplateForm } from "./NewTemplateForm";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ButtonLink } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Card } from "../../../../components/ui/Card";

export default async function NewTemplatePage() {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to create a template."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  return (
    <div>
      <PageHeader title="New template" breadcrumbs={[{ label: "Templates", href: "/templates" }, { label: "New" }]} />
      <Card>
        <NewTemplateForm />
      </Card>
    </div>
  );
}
