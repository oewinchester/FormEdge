import { ModelLabValidationError } from "@/lib/model-lab";
import { setUserPredictionSaved } from "@/lib/user-dashboard-store";
import { requireUserApiIdentity, toUserApiError } from "@/lib/user-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUserApiIdentity();
    let body: { threadId?: unknown; saved?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (typeof body.threadId !== "string" || typeof body.saved !== "boolean") {
      return Response.json({ error: "threadId and saved are required." }, { status: 400 });
    }
    return Response.json({ result: await setUserPredictionSaved(user, body.threadId, body.saved) });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
