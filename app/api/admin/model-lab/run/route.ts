import { requireAdminActor, toAdminApiError } from "@/lib/admin-data";
import {
  createSyntheticBacktestSamples,
  ModelLabValidationError,
  type BacktestConfig,
  type BacktestSample,
} from "@/lib/model-lab";
import { runModelLabExperiment } from "@/lib/model-lab-store";

export const dynamic = "force-dynamic";

type RunBody = {
  mode?: unknown;
  name?: unknown;
  sampleCount?: unknown;
  leagueId?: unknown;
  leagueLabel?: unknown;
  market?: unknown;
  samples?: unknown;
  config?: unknown;
};

export async function POST(request: Request) {
  try {
    const actor = await requireAdminActor();
    let body: RunBody;
    try {
      body = await request.json() as RunBody;
    } catch {
      return Response.json({ error: "Valid JSON is required." }, { status: 400 });
    }

    if (body.mode !== undefined && body.mode !== "synthetic" && body.mode !== "historical") {
      return Response.json({ error: "mode must be synthetic or historical." }, { status: 400 });
    }

    const synthetic = body.mode === "synthetic";
    const result = await runModelLabExperiment(actor, {
      name: typeof body.name === "string" ? body.name : synthetic ? "Synthetic leakage-control smoke test" : "Historical 1X2 experiment",
      datasetKind: synthetic ? "synthetic" : "historical",
      leagueId: typeof body.leagueId === "string" ? body.leagueId : null,
      leagueLabel: typeof body.leagueLabel === "string" ? body.leagueLabel : synthetic ? "Synthetic QA League" : "Unknown league",
      market: body.market === "1X2" || body.market === undefined ? "1X2" : body.market as "1X2",
      samples: synthetic
        ? createSyntheticBacktestSamples(typeof body.sampleCount === "number" ? body.sampleCount : 180)
        : body.samples as BacktestSample[],
      config: body.config && typeof body.config === "object" && !Array.isArray(body.config)
        ? body.config as Partial<BacktestConfig>
        : undefined,
    });

    return Response.json({
      result: {
        runId: result.runId,
        modelVersionId: result.modelVersionId,
        sourceSampleCount: result.sourceSampleCount,
        config: result.config,
        metrics: result.metrics,
        folds: result.folds,
        releaseDecision: result.releaseDecision,
      },
    });
  } catch (error) {
    if (error instanceof ModelLabValidationError) {
      return Response.json({ error: error.message, violations: error.violations }, { status: 400 });
    }
    const response = toAdminApiError(error);
    return Response.json({ error: response.message }, { status: response.status });
  }
}
