import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { ResearchFeedHttpError } from "@/lib/football-data-source-store";
import {
  ResearchAutomationHttpError,
  runResearchAutomationCycle,
} from "@/lib/research-automation-store";

export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function POST() {
  try {
    const actor = await requireAdminActor();
    if (actor.role !== "admin") {
      return Response.json({ error: "Canlı fikstür yenileme yalnız yöneticiye açıktır." }, {
        status: 403,
        headers: NO_STORE_HEADERS,
      });
    }
    return Response.json({
      ok: true,
      result: await runResearchAutomationCycle(actor, "admin"),
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ResearchAutomationHttpError || error instanceof ResearchFeedHttpError) {
      return Response.json({ error: error.message, code: error.code }, {
        status: error.status,
        headers: NO_STORE_HEADERS,
      });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status, headers: NO_STORE_HEADERS });
  }
}
