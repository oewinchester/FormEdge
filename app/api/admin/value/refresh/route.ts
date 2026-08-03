import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { refreshValueAssessments } from "@/lib/value-assessment-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    let limit = 200;
    try {
      const body = await request.json() as { limit?: unknown };
      if (typeof body.limit === "number" && Number.isFinite(body.limit)) limit = body.limit;
    } catch {
      // An empty body intentionally uses the bounded default.
    }
    return Response.json({ result: await refreshValueAssessments(actor, limit) });
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
