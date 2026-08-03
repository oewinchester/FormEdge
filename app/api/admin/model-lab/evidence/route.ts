import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { runEvidenceSuite } from "@/lib/evidence-lab-store";
import { ModelLabValidationError } from "@/lib/model-lab";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    let body: { datasetRunId?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (typeof body.datasetRunId !== "string" || !body.datasetRunId.trim()) {
      return Response.json({ error: "datasetRunId is required." }, { status: 400 });
    }
    return Response.json({ result: await runEvidenceSuite(actor, body.datasetRunId) });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message, violations: error.violations }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
