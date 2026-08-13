import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import {
  getFootballDataResearchOverview,
  ResearchFeedHttpError,
} from "@/lib/football-data-source-store";
import { getResearchAutomationOverview } from "@/lib/research-automation-store";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 4_096;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

type PullBody = {
  leagueCode?: unknown;
  seasonCode?: unknown;
};

export async function GET() {
  try {
    const actor = await requireAdminActor();
    const [legacy, automation] = await Promise.all([
      getFootballDataResearchOverview(actor),
      getResearchAutomationOverview(actor),
    ]);
    return Response.json({ ...legacy, automation }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminActor();
    const declaredBytes = Number(request.headers.get("content-length") ?? "0");
    if (declaredBytes > MAX_REQUEST_BYTES) {
      return Response.json({ error: "İstek boyutu sınırı aşıldı." }, { status: 413, headers: NO_STORE_HEADERS });
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return Response.json({ error: "İstek boyutu sınırı aşıldı." }, { status: 413, headers: NO_STORE_HEADERS });
    }
    let body: PullBody;
    try {
      body = JSON.parse(raw) as PullBody;
    } catch {
      return Response.json({ error: "Geçerli JSON gereklidir." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    void body;
    return Response.json({
      error: "Eski Football-Data çekimi kalıcı olarak kapatıldı. Canlı ve yeni tarihsel veri yalnız SportMonks otomasyonundan alınır.",
      code: "LEGACY_SOURCE_DISABLED",
    }, { status: 410, headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ResearchFeedHttpError) {
    const headers: Record<string, string> = { ...NO_STORE_HEADERS };
    if (error.retryAfterSeconds) headers["Retry-After"] = String(error.retryAfterSeconds);
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
  }
  const response = toAdminApiError(error);
  return Response.json({ error: response.message }, { status: response.status, headers: NO_STORE_HEADERS });
}
