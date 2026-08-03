import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { getAdminNotificationOverview } from "@/lib/notification-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireAdminActor();
    return Response.json(await getAdminNotificationOverview(actor));
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
