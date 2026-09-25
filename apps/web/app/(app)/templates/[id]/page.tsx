import { getTemplate } from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { TemplateEditor } from "./TemplateEditor";

export default async function TemplateDetailPage({ params }: { params: { id: string } }) {
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

  const template = await getTemplate({ workspaceId: actor.workspaceId, actorUserId: actor.userId, templateId: params.id });

  return (
    <main style={{ padding: 32 }}>
      <p>
        <a href="/templates">← Templates</a>
      </p>
      <h1>{template.name}</h1>
      <TemplateEditor template={template} />
    </main>
  );
}
