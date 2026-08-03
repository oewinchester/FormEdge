import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { getAdminMembershipOverview } from "@/lib/membership-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireAdminActor();
    return Response.json(await getAdminMembershipOverview(actor), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
