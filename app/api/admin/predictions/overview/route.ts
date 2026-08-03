import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { getPredictionOpsOverview } from "@/lib/prediction-lifecycle-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireAdminActor();
    return Response.json(await getPredictionOpsOverview(actor));
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
