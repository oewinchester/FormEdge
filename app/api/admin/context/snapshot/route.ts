import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { saveFixtureContextSnapshot, type ContextSnapshotInput } from "@/lib/context-ops-store";
import { ModelLabValidationError } from "@/lib/model-lab";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    let body: ContextSnapshotInput;
    try {
      body = await request.json() as ContextSnapshotInput;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    return Response.json({ result: await saveFixtureContextSnapshot(actor, body) });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message, violations: error.violations }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
