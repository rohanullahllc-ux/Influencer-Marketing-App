import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { NewProductForm } from "./NewProductForm";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ButtonLink } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";

export default async function NewProductPage() {
  try {
    await requireSession();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <EmptyState
          title="Sign in required"
          description="You must sign in to create a product."
          action={<ButtonLink href="/login" variant="primary">Sign in</ButtonLink>}
        />
      );
    }
    throw err;
  }

  return (
    <div>
      <PageHeader
        title="New product"
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: "New" }]}
      />
      <Card className="max-w-xl">
        <NewProductForm />
      </Card>
    </div>
  );
}
