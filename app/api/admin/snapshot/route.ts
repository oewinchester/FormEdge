import { getRawSnapshot, requireAdminActor, toAdminApiError } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireAdminActor();
    const runId = new URL(request.url).searchParams.get("run_id") ?? "";
    if (!/^[a-f0-9-]{36}$/i.test(runId)) {
      return Response.json({ error: "A valid run_id is required." }, { status: 400 });
    }
    const object = await getRawSnapshot(actor, runId);
    if (!object) return Response.json({ error: "Snapshot not found." }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="formedge-${runId}.json"`,
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
