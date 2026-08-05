import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { getDataLineageOverview } from "@/lib/data-lineage-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireAdminActor();
    const versionId = new URL(request.url).searchParams.get("versionId");
    return Response.json(await getDataLineageOverview(actor, versionId));
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
