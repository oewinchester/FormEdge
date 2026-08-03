import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { getValueOpsOverview } from "@/lib/value-assessment-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireAdminActor();
    return Response.json(await getValueOpsOverview(actor));
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
