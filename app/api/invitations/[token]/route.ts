import { BetaAccessHttpError, acceptBetaInvitation } from "@/lib/beta-access-store";
import { ModelLabValidationError } from "@/lib/model-lab";
import { requireUserApiIdentity, toUserApiError } from "@/lib/user-api";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const user = await requireUserApiIdentity();
    const { token } = await params;
    return Response.json({ result: await acceptBetaInvitation(user, token) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof BetaAccessHttpError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toUserApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
