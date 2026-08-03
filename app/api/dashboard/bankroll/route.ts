import { ModelLabValidationError } from "@/lib/model-lab";
import {
  getUserBankrollWorkspace,
  recordBankrollMovement,
  saveGeneratedCouponDraft,
  type BankrollMovementInput,
} from "@/lib/bankroll-store";
import { requireUserApiIdentity, toUserApiError } from "@/lib/user-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUserApiIdentity();
    return Response.json(await getUserBankrollWorkspace(user));
  } catch (error) {
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserApiIdentity();
    let body: { action?: unknown; movement?: BankrollMovementInput; tier?: unknown; assessmentIds?: unknown };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (body.action === "movement" && body.movement) {
      return Response.json({ result: await recordBankrollMovement(user, body.movement) });
    }
    if (body.action === "save_coupon" && (body.tier === "balanced" || body.tier === "high_odds")
      && Array.isArray(body.assessmentIds)) {
      return Response.json({
        result: await saveGeneratedCouponDraft(user, {
          tier: body.tier,
          assessmentIds: body.assessmentIds.filter((value): value is string => typeof value === "string"),
        }),
      });
    }
    return Response.json({ error: "The bankroll action is invalid." }, { status: 400 });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message, violations: error.violations }, { status: 400 });
    }
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
