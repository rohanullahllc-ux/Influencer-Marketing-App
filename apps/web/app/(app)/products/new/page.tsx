import { AuthorizationError } from "@rdv/lib";
import { requireSession } from "../../../../lib/session";
import { NewProductForm } from "./NewProductForm";

export default async function NewProductPage() {
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
      <h1>New product</h1>
      <NewProductForm />
    </main>
  );
}
