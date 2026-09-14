import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../lib/session";
import { NewTemplateForm } from "./NewTemplateForm";

export default async function NewTemplatePage() {
  try {
    await requireSession();
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

  return (
    <main style={{ padding: 32 }}>
      <h1>New template</h1>
      <NewTemplateForm />
    </main>
  );
}
