import { getUserPerformanceHistory } from "@/lib/user-dashboard-store";
import { requireUserApiIdentity, toUserApiError } from "@/lib/user-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUserApiIdentity();
    return Response.json(await getUserPerformanceHistory(user));
  } catch (error) {
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
