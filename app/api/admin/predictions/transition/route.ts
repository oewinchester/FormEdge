import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { ModelLabValidationError } from "@/lib/model-lab";
import {
  transitionPrediction,
  type PredictionTransitionAction,
} from "@/lib/prediction-lifecycle-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    let body: { threadId?: unknown; action?: unknown; reason?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (typeof body.threadId !== "string" || !body.threadId.trim()) {
      return Response.json({ error: "threadId is required." }, { status: 400 });
    }
    if (typeof body.action !== "string") {
      return Response.json({ error: "action is required." }, { status: 400 });
    }
    if (body.reason !== undefined && typeof body.reason !== "string") {
      return Response.json({ error: "reason must be a string." }, { status: 400 });
    }
    return Response.json({
      result: await transitionPrediction(actor, {
        threadId: body.threadId,
        action: body.action as PredictionTransitionAction,
        reason: body.reason,
      }),
    });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message, violations: error.violations }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
