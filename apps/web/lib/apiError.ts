import { NextResponse } from "next/server";
import { AuthorizationError, NotFoundError, ValidationError } from "@rdv/lib";

/** Maps the shared @rdv/lib error taxonomy to HTTP responses — one place, used by every API route. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AuthorizationError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
