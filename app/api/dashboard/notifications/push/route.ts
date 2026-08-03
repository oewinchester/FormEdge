import { ModelLabValidationError } from "@/lib/model-lab";
import {
  revokeBrowserPushSubscription,
  saveBrowserPushSubscription,
  type PushSubscriptionInput,
} from "@/lib/notification-store";
import { requireUserApiIdentity, toUserApiError } from "@/lib/user-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUserApiIdentity();
    let body: PushSubscriptionInput;
    try {
      body = await request.json() as PushSubscriptionInput;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    return Response.json({ result: await saveBrowserPushSubscription(user, body) });
  } catch (error) {
    return pushApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUserApiIdentity();
    let body: { endpoint?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (typeof body.endpoint !== "string") {
      return Response.json({ error: "endpoint is required." }, { status: 400 });
    }
    return Response.json({ result: await revokeBrowserPushSubscription(user, body.endpoint) });
  } catch (error) {
    return pushApiError(error);
  }
}

function pushApiError(error: unknown) {
  if (error instanceof ModelLabValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  const response = toUserApiError(error);
  return Response.json({ error: response.message }, { status: response.status });
}
