import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { settleFinishedPredictions } from "@/lib/prediction-settlement-store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const actor = await requireAdminActor();
    return Response.json({ result: await settleFinishedPredictions(actor) });
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
