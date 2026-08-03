import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import { ModelLabValidationError } from "@/lib/model-lab";
import { createPointInTimeDataset } from "@/lib/point-in-time-dataset-store";

export const dynamic = "force-dynamic";

type DatasetBody = {
  name?: unknown;
  leagueId?: unknown;
  predictionHorizonHours?: unknown;
  minimumHistoryMatches?: unknown;
  resultAvailabilityHours?: unknown;
};

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    let body: DatasetBody;
    try {
      body = await request.json() as DatasetBody;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }

    if (typeof body.leagueId !== "string" || !body.leagueId.trim()) {
      return Response.json({ error: "leagueId is required." }, { status: 400 });
    }
    if (body.name !== undefined && typeof body.name !== "string") {
      return Response.json({ error: "name must be a string." }, { status: 400 });
    }

    const result = await createPointInTimeDataset(actor, {
      name: body.name,
      leagueId: body.leagueId,
      predictionHorizonHours: body.predictionHorizonHours === undefined
        ? 48
        : requireNumber(body.predictionHorizonHours, "predictionHorizonHours"),
      minimumHistoryMatches: body.minimumHistoryMatches === undefined
        ? 5
        : requireNumber(body.minimumHistoryMatches, "minimumHistoryMatches"),
      resultAvailabilityHours: body.resultAvailabilityHours === undefined
        ? undefined
        : requireNumber(body.resultAvailabilityHours, "resultAvailabilityHours"),
    });

    return Response.json({ result });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message, violations: error.violations }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}

function requireNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ModelLabValidationError(`${field} must be a finite number.`);
  }
  return value;
}
