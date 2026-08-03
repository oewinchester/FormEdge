import { importFootballSnapshot, requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { parseAdminImportEnvelope } from "@/lib/import-contract";

export const dynamic = "force-dynamic";

const MAX_IMPORT_BYTES = 2_000_000;

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_IMPORT_BYTES) {
      return Response.json({ error: "Import payload exceeds the 2 MB beta limit." }, { status: 413 });
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_IMPORT_BYTES) {
      return Response.json({ error: "Import payload exceeds the 2 MB beta limit." }, { status: 413 });
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Import payload must be valid JSON." }, { status: 400 });
    }
    let envelope;
    try {
      envelope = parseAdminImportEnvelope(json);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Import payload is invalid." },
        { status: 400 },
      );
    }
    const result = await importFootballSnapshot(actor, envelope);
    return Response.json({ result }, { status: 201 });
  } catch (error) {
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
