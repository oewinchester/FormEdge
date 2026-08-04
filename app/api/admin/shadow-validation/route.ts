import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { ResearchFeedHttpError } from "@/lib/football-data-source-store";
import { ModelLabValidationError } from "@/lib/model-lab";
import {
  ShadowValidationHttpError,
  advanceShadowValidationCampaign,
  getShadowValidationOverview,
  startShadowValidationCampaign,
} from "@/lib/shadow-validation-store";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 4_096;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

type RequestBody = {
  action?: unknown;
  leagueCode?: unknown;
  campaignId?: unknown;
};

export async function GET() {
  try {
    const actor = await requireAdminActor();
    return Response.json(await getShadowValidationOverview(actor), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    const declaredBytes = Number(request.headers.get("content-length") ?? "0");
    if (declaredBytes > MAX_REQUEST_BYTES) {
      return Response.json({ error: "İstek boyutu sınırı aşıldı." }, { status: 413, headers: NO_STORE_HEADERS });
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return Response.json({ error: "İstek boyutu sınırı aşıldı." }, { status: 413, headers: NO_STORE_HEADERS });
    }
    let body: RequestBody;
    try {
      body = JSON.parse(raw) as RequestBody;
    } catch {
      return Response.json({ error: "Geçerli JSON gereklidir." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (body.action === "start") {
      return Response.json({
        result: await startShadowValidationCampaign(actor, body.leagueCode),
      }, { status: 201, headers: NO_STORE_HEADERS });
    }
    if (body.action === "advance") {
      return Response.json({
        result: await advanceShadowValidationCampaign(actor, body.campaignId),
      }, { headers: NO_STORE_HEADERS });
    }
    return Response.json({ error: "action, start veya advance olmalıdır." }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ShadowValidationHttpError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE_HEADERS });
  }
  if (error instanceof ResearchFeedHttpError) {
    const headers: Record<string, string> = { ...NO_STORE_HEADERS };
    if (error.retryAfterSeconds) headers["Retry-After"] = String(error.retryAfterSeconds);
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
  }
  if (error instanceof ModelLabValidationError) {
    return Response.json({ error: error.message, violations: error.violations }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const response = toAdminApiError(error);
  return Response.json({ error: response.message }, { status: response.status, headers: NO_STORE_HEADERS });
}
