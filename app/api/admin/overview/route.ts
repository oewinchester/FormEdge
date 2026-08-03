import { getAdminOverview, requireAdminActor, toAdminApiError } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireAdminActor();
    return Response.json(await getAdminOverview(actor));
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
