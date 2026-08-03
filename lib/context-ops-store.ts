import { and, asc, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  fixtureContextSnapshots,
  fixtures,
  leagues,
  predictionThreads,
  teams,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import {
  CONTEXT_ENGINE_POLICY,
  CONTEXT_ENGINE_SCHEMA_VERSION,
  evaluateFixtureContext,
  type MatchContextInput,
  type TeamContextInput,
} from "@/lib/context-engine";
import { ModelLabValidationError } from "@/lib/model-lab";
import { createPredictionVersion } from "@/lib/prediction-lifecycle-store";
import { canonicalPredictionJson, predictionIdentity } from "@/lib/prediction-lifecycle";

const CONTEXT_WINDOW_HOURS = 72;

export type ContextSnapshotInput = {
  fixtureId: string;
  capturedAt?: string;
  sourceKind?: "manual" | "public_dataset" | "licensed_feed";
  completeness: number;
  home: TeamContextInput;
  away: TeamContextInput;
  match: MatchContextInput;
  rescore?: boolean;
};

export async function getContextOpsOverview(actor: AdminActor) {
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const endIso = new Date(now.getTime() + CONTEXT_WINDOW_HOURS * 3_600_000).toISOString();
  const candidateRows = await db.select({
    id: fixtures.id,
    leagueId: fixtures.leagueId,
    leagueLabel: leagues.name,
    kickoffAt: fixtures.kickoffAt,
    homeTeamId: fixtures.homeTeamId,
    awayTeamId: fixtures.awayTeamId,
    status: fixtures.status,
  }).from(fixtures)
    .innerJoin(leagues, eq(fixtures.leagueId, leagues.id))
    .where(and(
      eq(fixtures.status, "scheduled"),
      gt(fixtures.kickoffAt, nowIso),
      lte(fixtures.kickoffAt, endIso),
    ))
    .orderBy(asc(fixtures.kickoffAt))
    .limit(100);
  const fixtureIds = candidateRows.map((row) => row.id);
  const [snapshotRows, threadRows] = await Promise.all([
    fixtureIds.length
      ? db.select().from(fixtureContextSnapshots)
        .where(inArray(fixtureContextSnapshots.fixtureId, fixtureIds))
        .orderBy(desc(fixtureContextSnapshots.capturedAt), desc(fixtureContextSnapshots.id))
      : Promise.resolve([]),
    fixtureIds.length
      ? db.select({
        fixtureId: predictionThreads.fixtureId,
        id: predictionThreads.id,
        versionCount: predictionThreads.versionCount,
      }).from(predictionThreads).where(inArray(predictionThreads.fixtureId, fixtureIds))
      : Promise.resolve([]),
  ]);
  const teamIds = [...new Set(candidateRows.flatMap((row) => [row.homeTeamId, row.awayTeamId]))];
  const teamRows = teamIds.length
    ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
    : [];
  const teamById = new Map(teamRows.map((row) => [row.id, row.name]));
  const latestByFixture = new Map<string, typeof fixtureContextSnapshots.$inferSelect>();
  for (const row of snapshotRows) if (!latestByFixture.has(row.fixtureId)) latestByFixture.set(row.fixtureId, row);
  const threadByFixture = new Map(threadRows.map((row) => [row.fixtureId, row]));
  const fixturesWithContext = candidateRows.filter((row) => latestByFixture.has(row.id)).length;
  const ready = candidateRows.filter((row) => {
    const snapshot = latestByFixture.get(row.id);
    return snapshot
      && snapshot.completeness >= CONTEXT_ENGINE_POLICY.minimumCompleteness
      && now.getTime() - Date.parse(snapshot.capturedAt) <= CONTEXT_ENGINE_POLICY.maximumAgeHours * 3_600_000;
  }).length;
  return {
    actor: { email: actor.email, displayName: actor.displayName, role: actor.role },
    generatedAt: nowIso,
    engineSchemaVersion: CONTEXT_ENGINE_SCHEMA_VERSION,
    policy: { ...CONTEXT_ENGINE_POLICY, contextWindowHours: CONTEXT_WINDOW_HOURS },
    counts: {
      upcoming: candidateRows.length,
      withContext: fixturesWithContext,
      ready,
      missing: candidateRows.length - fixturesWithContext,
    },
    fixtures: candidateRows.map((row) => {
      const snapshot = latestByFixture.get(row.id);
      const ageMinutes = snapshot
        ? Math.max(0, Math.round((now.getTime() - Date.parse(snapshot.capturedAt)) / 60_000))
        : null;
      return {
        ...row,
        homeTeamName: teamById.get(row.homeTeamId) ?? row.homeTeamId,
        awayTeamName: teamById.get(row.awayTeamId) ?? row.awayTeamId,
        threadId: threadByFixture.get(row.id)?.id ?? null,
        versionCount: threadByFixture.get(row.id)?.versionCount ?? 0,
        latestContext: snapshot ? {
          id: snapshot.id,
          capturedAt: snapshot.capturedAt,
          sourceKind: snapshot.sourceKind,
          completeness: snapshot.completeness,
          snapshotFingerprint: snapshot.snapshotFingerprint,
          ageMinutes,
          fresh: ageMinutes !== null && ageMinutes <= CONTEXT_ENGINE_POLICY.maximumAgeHours * 60,
          home: parseJson<TeamContextInput>(snapshot.homeContextJson, emptyTeamContext()),
          away: parseJson<TeamContextInput>(snapshot.awayContextJson, emptyTeamContext()),
          match: parseJson<MatchContextInput>(snapshot.matchContextJson, emptyMatchContext()),
        } : null,
      };
    }),
  };
}

export async function saveFixtureContextSnapshot(actor: AdminActor, input: ContextSnapshotInput) {
  validateContextInput(input);
  const db = await getDb();
  const [fixture] = await db.select().from(fixtures)
    .where(eq(fixtures.id, input.fixtureId.trim())).limit(1);
  if (!fixture) throw new ModelLabValidationError("The selected fixture could not be found.");
  if (fixture.status !== "scheduled") {
    throw new ModelLabValidationError("Context can only be captured for a scheduled fixture.");
  }
  const capturedAt = input.capturedAt?.trim() || new Date().toISOString();
  const capturedMs = Date.parse(capturedAt);
  if (!Number.isFinite(capturedMs) || capturedMs > Date.now() + 60_000) {
    throw new ModelLabValidationError("Context capture time is invalid or in the future.");
  }
  if (capturedMs >= Date.parse(fixture.kickoffAt)) {
    throw new ModelLabValidationError("Context must be captured before kickoff.");
  }
  evaluateFixtureContext({
    fixtureId: fixture.id,
    capturedAt,
    predictionAt: new Date(Math.max(Date.now(), capturedMs)).toISOString(),
    kickoffAt: fixture.kickoffAt,
    completeness: input.completeness,
    baseProbabilities: { home: 0.4, draw: 0.3, away: 0.3 },
    home: input.home,
    away: input.away,
    match: input.match,
  });
  const canonical = {
    fixtureId: fixture.id,
    capturedAt,
    sourceKind: input.sourceKind ?? "manual",
    completeness: input.completeness,
    home: input.home,
    away: input.away,
    match: input.match,
  };
  const snapshotFingerprint = await predictionIdentity({
    contextEngineSchemaVersion: CONTEXT_ENGINE_SCHEMA_VERSION,
    ...canonical,
  });
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(fixtureContextSnapshots).values({
      id,
      fixtureId: fixture.id,
      capturedAt,
      sourceKind: input.sourceKind ?? "manual",
      completeness: input.completeness,
      homeContextJson: canonicalPredictionJson(input.home),
      awayContextJson: canonicalPredictionJson(input.away),
      matchContextJson: canonicalPredictionJson(input.match),
      snapshotFingerprint,
      createdByEmail: actor.email,
    }).onConflictDoNothing(),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorEmail: actor.email,
      action: "fixture_context.captured",
      entityType: "fixture_context_snapshot",
      entityId: id,
      detailsJson: canonicalPredictionJson({ fixtureId: fixture.id, snapshotFingerprint, completeness: input.completeness }),
    }),
  ]);
  const [stored] = await db.select().from(fixtureContextSnapshots)
    .where(eq(fixtureContextSnapshots.snapshotFingerprint, snapshotFingerprint)).limit(1);
  if (!stored) throw new Error("The fixture context snapshot could not be persisted.");
  let rescore: Awaited<ReturnType<typeof createPredictionVersion>> | null = null;
  if (input.rescore) rescore = await createPredictionVersion(actor, fixture.id);
  return {
    snapshot: {
      id: stored.id,
      fixtureId: stored.fixtureId,
      capturedAt: stored.capturedAt,
      completeness: stored.completeness,
      sourceKind: stored.sourceKind,
      snapshotFingerprint: stored.snapshotFingerprint,
    },
    reused: stored.id !== id,
    rescore,
  };
}

function validateContextInput(input: ContextSnapshotInput) {
  if (!input || typeof input !== "object" || typeof input.fixtureId !== "string" || !input.fixtureId.trim()) {
    throw new ModelLabValidationError("fixtureId is required.");
  }
  if (!Number.isFinite(input.completeness) || input.completeness < 0 || input.completeness > 1) {
    throw new ModelLabValidationError("Completeness must be between zero and one.");
  }
  if (!input.home || !input.away || !input.match) {
    throw new ModelLabValidationError("Home, away and match context are required.");
  }
}

function emptyTeamContext(): TeamContextInput {
  return { unavailablePlayers: [], coachDaysInRole: null, importantPlayerForm: null, travelKm: null, restHours: null };
}

function emptyMatchContext(): MatchContextInput {
  return { weatherSeverity: null, pitchQuality: null, derby: false };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type ContextOpsOverview = Awaited<ReturnType<typeof getContextOpsOverview>>;
