import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { getModelCardOverview, ModelCardStoreError, persistModelVersionCard } from "@/lib/model-card-store";

export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store, max-age=0" };
const MAX_BYTES = 2_048;

export async function GET(request: Request) {
  try {
    const actor = await requireAdminActor();
    const versionId = new URL(request.url).searchParams.get("versionId");
    return Response.json(await getModelCardOverview(actor, versionId), { headers: HEADERS });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) return Response.json({ error: "İstek boyutu sınırı aşıldı." }, { status: 413, headers: HEADERS });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return Response.json({ error: "İstek boyutu sınırı aşıldı." }, { status: 413, headers: HEADERS });
    let body: { modelVersionId?: unknown };
    try { body = JSON.parse(raw) as { modelVersionId?: unknown }; }
    catch { return Response.json({ error: "Geçerli JSON gereklidir." }, { status: 400, headers: HEADERS }); }
    if (typeof body.modelVersionId !== "string") return Response.json({ error: "modelVersionId metin olmalıdır." }, { status: 400, headers: HEADERS });
    return Response.json({ result: await persistModelVersionCard(actor, body.modelVersionId) }, { status: 201, headers: HEADERS });
  } catch (error) { return errorResponse(error); }
}

function errorResponse(error: unknown) {
  if (error instanceof ModelCardStoreError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: HEADERS });
  const response = toAdminApiError(error);
  return Response.json({ error: response.message }, { status: response.status, headers: HEADERS });
}
