import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { CsvAdapterError } from "@/lib/csv-adapter";
import { previewCsvImport, type CsvImportRequest } from "@/lib/csv-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    const input = await request.json() as CsvImportRequest;
    const preview = await previewCsvImport(actor, input);
    return Response.json({
      summary: preview.summary,
      quality: preview.quality,
      mappings: {
        aliases: preview.aliasPlans.slice(0, 20).map((plan) => ({
          externalTeamName: plan.externalTeamName,
          canonicalName: plan.canonicalName,
          status: plan.status,
          confidence: plan.confidence,
        })),
        fixtures: preview.fixturePlans.slice(0, 20).map((plan) => ({
          externalFixtureKey: plan.externalFixtureKey,
          status: plan.status,
          confidence: plan.confidence,
        })),
      },
    });
  } catch (error) {
    if (error instanceof CsvAdapterError) {
      return Response.json({ error: error.message, issues: error.issues }, { status: 400 });
    }
    if (isValidationError(error)) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}

function isValidationError(error: unknown): error is Error {
  return error instanceof Error && /^(source\.|capturedAt|payload\.|Blocked sources)/.test(error.message);
}
