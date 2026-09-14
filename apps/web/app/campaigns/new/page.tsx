import { listProducts } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { NewCampaignForm } from "./NewCampaignForm";

export default async function NewCampaignPage() {
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
    <main style={{ padding: 32 }}>
      <h1>New campaign</h1>
      <NewCampaignForm products={products} />
    </main>
  );
}
