import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import {
  getLeagueOnboardingOverview,
  LeagueOnboardingError,
  persistLeagueOnboardingAssessments,
} from "@/lib/league-onboarding-store";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
const MAX_REQUEST_BYTES = 2_048;

export async function GET() {
  try {
    const actor = await requireAdminActor();
    return Response.json(await getLeagueOnboardingOverview(actor), { headers: NO_STORE_HEADERS });
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
    let body: { leagueId?: unknown } = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as { leagueId?: unknown };
      } catch {
        return Response.json({ error: "Geçerli JSON gereklidir." }, { status: 400, headers: NO_STORE_HEADERS });
      }
    }
    if (body.leagueId !== undefined && body.leagueId !== null && typeof body.leagueId !== "string") {
      return Response.json({ error: "leagueId metin olmalıdır." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    return Response.json({
      result: await persistLeagueOnboardingAssessments(
        actor,
        typeof body.leagueId === "string" ? body.leagueId : null,
      ),
    }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof LeagueOnboardingError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }
  const response = toAdminApiError(error);
  return Response.json({ error: response.message }, { status: response.status, headers: NO_STORE_HEADERS });
}
