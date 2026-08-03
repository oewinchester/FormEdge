import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { CsvAdapterError } from "@/lib/csv-adapter";
import { importCsvSnapshot, type CsvImportRequest } from "@/lib/csv-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    const input = await request.json() as CsvImportRequest;
    const result = await importCsvSnapshot(actor, input);
    return Response.json({ result }, { status: 201 });
  } catch (error) {
    if (error instanceof CsvAdapterError) {
      return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
    }
    if (error instanceof Error && /^(source\.|capturedAt|payload\.|Blocked sources)/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
