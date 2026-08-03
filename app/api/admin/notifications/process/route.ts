import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { ModelLabValidationError } from "@/lib/model-lab";
import {
  processNotificationQueue,
  reconcilePredictionNotificationOutbox,
  retryNotificationOutbox,
} from "@/lib/notification-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAdminActor();
    let body: { action?: unknown; outboxId?: unknown; limit?: unknown } = {};
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (body.action === "retry") {
      if (typeof body.outboxId !== "string") {
        return Response.json({ error: "outboxId is required." }, { status: 400 });
      }
      return Response.json({ result: await retryNotificationOutbox(body.outboxId) });
    }
    if (body.action === "process" || body.action === undefined) {
      const reconciliation = await reconcilePredictionNotificationOutbox();
      const limit = typeof body.limit === "number" ? body.limit : 20;
      return Response.json({ result: { reconciliation, queue: await processNotificationQueue(limit) } });
    }
    return Response.json({ error: "Unsupported notification queue action." }, { status: 400 });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
