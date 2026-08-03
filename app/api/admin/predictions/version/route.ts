import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { ModelLabValidationError } from "@/lib/model-lab";
import { createPredictionVersion } from "@/lib/prediction-lifecycle-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    let body: { fixtureId?: unknown };
    try {
      body = await request.json() as { fixtureId?: unknown };
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (typeof body.fixtureId !== "string" || !body.fixtureId.trim()) {
      return Response.json({ error: "fixtureId is required." }, { status: 400 });
    }
    return Response.json({ result: await createPredictionVersion(actor, body.fixtureId) });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message, violations: error.violations }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
