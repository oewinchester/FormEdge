import { ModelLabValidationError } from "@/lib/model-lab";
import {
  updateUserDashboardPreferences,
  type DashboardPreferenceInput,
} from "@/lib/user-dashboard-store";
import { requireUserApiIdentity, toUserApiError } from "@/lib/user-api";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const user = await requireUserApiIdentity();
    let body: DashboardPreferenceInput;
    try {
      body = await request.json() as DashboardPreferenceInput;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }
    return Response.json({ result: await updateUserDashboardPreferences(user, body) });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
