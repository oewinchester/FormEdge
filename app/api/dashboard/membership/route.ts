import { ModelLabValidationError } from "@/lib/model-lab";
import {
  completeUserOnboarding,
  getUserMembershipCenter,
  startCardlessProTrial,
  type OnboardingInput,
} from "@/lib/membership-store";
import { requireUserApiIdentity, toUserApiError } from "@/lib/user-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUserApiIdentity();
    return Response.json(await getUserMembershipCenter(user), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUserApiIdentity();
    let body: { action?: unknown; onboarding?: OnboardingInput };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    if (body.action === "complete_onboarding" && body.onboarding) {
      return Response.json({ result: await completeUserOnboarding(user, body.onboarding) });
    }
    if (body.action === "start_trial") {
      return Response.json({ result: await startCardlessProTrial(user) });
    }
    return Response.json({ error: "Membership action is invalid." }, { status: 400 });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
