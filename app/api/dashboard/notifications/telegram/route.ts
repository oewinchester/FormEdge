import { ModelLabValidationError } from "@/lib/model-lab";
import { disconnectTelegram, startTelegramPairing } from "@/lib/notification-store";
import { requireUserApiIdentity, toUserApiError } from "@/lib/user-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUserApiIdentity();
    let body: { action?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (body.action === "pair") {
      return Response.json({ result: await startTelegramPairing(user) });
    }
    if (body.action === "disconnect") {
      return Response.json({ result: await disconnectTelegram(user) });
    }
    return Response.json({ error: "Unsupported Telegram action." }, { status: 400 });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
