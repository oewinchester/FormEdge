import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { getContextOpsOverview } from "@/lib/context-ops-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireAdminActor();
    return Response.json(await getContextOpsOverview(actor));
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
