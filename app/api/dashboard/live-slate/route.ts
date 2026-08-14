import { getChatGPTUser } from "@/app/chatgpt-auth";
import { toAdminApiError } from "@/lib/admin-data";
import { getUserMembershipCenter } from "@/lib/membership-store";
import {
  ResearchAutomationHttpError,
  runResearchAutomationCycle,
  SYSTEM_RESEARCH_ACTOR,
} from "@/lib/research-automation-store";

export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function POST() {
  try {
    const user = await getChatGPTUser();
    if (!user) {
      return Response.json({ error: "Oturum gerekli." }, {
        status: 401,
        headers: NO_STORE_HEADERS,
      });
    }
    const membership = await getUserMembershipCenter(user);
    if (!membership.membership.productAccess) {
      return Response.json({ error: "Aktif ürün erişimi gerekli." }, {
        status: 403,
        headers: NO_STORE_HEADERS,
      });
    }
    const automation = await runResearchAutomationCycle(SYSTEM_RESEARCH_ACTOR, "scheduler");
    return Response.json({
      ok: true,
      automation,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof ResearchAutomationHttpError) {
      return Response.json({ error: error.message, code: error.code }, {
        status: error.status,
        headers: NO_STORE_HEADERS,
      });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status, headers: NO_STORE_HEADERS });
  }
}
