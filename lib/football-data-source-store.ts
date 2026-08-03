import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backtestRuns,
  dataSources,
  featureDatasetRuns,
  fixtures,
  researchSourceRuns,
  teamMatchStats,
} from "@/db/schema";
import {
  buildSourceId,
  importFootballSnapshot,
  type AdminActor,
} from "@/lib/admin-data";
import {
  buildFootballDataSourceUrl,
  FOOTBALL_DATA_ADAPTER_VERSION,
  FOOTBALL_DATA_DATA_URL,
  FOOTBALL_DATA_MAX_BYTES,
  FOOTBALL_DATA_NOTES_URL,
  FOOTBALL_DATA_PILOT_LEAGUES,
  FOOTBALL_DATA_RESEARCH_SEASONS,
  FOOTBALL_DATA_SOURCE_NAME,
  FootballDataSourceError,
  parseFootballDataCsv,
  resolveFootballDataSelection,
} from "@/lib/football-data-source";

const PULL_WINDOW_MS = 60_000;
const HOURLY_PULL_LIMIT = 30;
const FETCH_TIMEOUT_MS = 20_000;

export class ResearchFeedHttpError extends Error {
  status: 400 | 403 | 409 | 429 | 502 | 503;
  code: string;
  retryAfterSeconds?: number;

  constructor(
    status: ResearchFeedHttpError["status"],
    code: string,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ResearchFeedHttpError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function getFootballDataResearchOverview(actor: AdminActor) {
  const db = await getDb();
  const [runs, fixtureCounts, statCounts, datasetCounts, backtestCounts] = await Promise.all([
    db.select().from(researchSourceRuns).orderBy(desc(researchSourceRuns.startedAt)).limit(200),
    db.select({
      leagueId: fixtures.leagueId,
      finished: sql<number>`sum(case when ${fixtures.status} = 'finished' then 1 else 0 end)`,
      earliest: sql<string | null>`min(${fixtures.kickoffAt})`,
      latest: sql<string | null>`max(${fixtures.kickoffAt})`,
    }).from(fixtures).groupBy(fixtures.leagueId),
    db.select({
      leagueId: fixtures.leagueId,
      total: sql<number>`count(distinct ${teamMatchStats.fixtureId})`,
    }).from(teamMatchStats)
      .innerJoin(fixtures, eq(teamMatchStats.fixtureId, fixtures.id))
      .groupBy(fixtures.leagueId),
    db.select({ leagueId: featureDatasetRuns.leagueId, total: count() })
      .from(featureDatasetRuns).groupBy(featureDatasetRuns.leagueId),
    db.select({ leagueId: backtestRuns.leagueId, total: count() })
      .from(backtestRuns).groupBy(backtestRuns.leagueId),
  ]);
  const latestBySelection = new Map<string, typeof runs[number]>();
  for (const run of runs) {
    const key = `${run.leagueCode}:${run.seasonCode}`;
    if (!latestBySelection.has(key)) latestBySelection.set(key, run);
  }
  const fixtureByLeague = new Map(fixtureCounts.map((row) => [row.leagueId, row]));
  const statByLeague = new Map(statCounts.map((row) => [row.leagueId, Number(row.total)]));
  const datasetByLeague = new Map(datasetCounts.map((row) => [row.leagueId, Number(row.total)]));
  const backtestByLeague = new Map(backtestCounts.map((row) => [row.leagueId, Number(row.total)]));

  const leagues = FOOTBALL_DATA_PILOT_LEAGUES.map((league) => {
    const fixture = fixtureByLeague.get(league.id);
    const finishedFixtureCount = Number(fixture?.finished ?? 0);
    const statFixtureCount = statByLeague.get(league.id) ?? 0;
    const seasons = FOOTBALL_DATA_RESEARCH_SEASONS.map((season) => {
      const run = latestBySelection.get(`${league.code}:${season.code}`);
      return {
        ...season,
        status: run?.status ?? "not_started" as const,
        sourceRowCount: run?.sourceRowCount ?? 0,
        checksumSha256: run?.rawChecksumSha256 ?? null,
        startedAt: run?.startedAt ?? null,
        completedAt: run?.completedAt ?? null,
        errorCode: run?.errorCode ?? null,
      };
    });
    return {
      ...league,
      seasons,
      importedSeasonCount: seasons.filter((season) => season.status === "imported" || season.status === "unchanged").length,
      finishedFixtureCount,
      statFixtureCount,
      statCoverage: finishedFixtureCount ? round(statFixtureCount / finishedFixtureCount) : 0,
      datasetCount: datasetByLeague.get(league.id) ?? 0,
      backtestCount: backtestByLeague.get(league.id) ?? 0,
      earliestKickoffAt: fixture?.earliest ?? null,
      latestKickoffAt: fixture?.latest ?? null,
      modelLabReady: finishedFixtureCount >= 30,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    actor,
    source: {
      name: FOOTBALL_DATA_SOURCE_NAME,
      dataUrl: FOOTBALL_DATA_DATA_URL,
      notesUrl: FOOTBALL_DATA_NOTES_URL,
      adapterVersion: FOOTBALL_DATA_ADAPTER_VERSION,
      acquisitionMethod: "public_dataset" as const,
      legalStatus: "review" as const,
      commercialReuseVerified: false,
      revisionTimingVerified: false,
      oddsCaptureTimingVerified: false,
      recommendationEligible: false,
    },
    totals: {
      pilotLeagues: leagues.length,
      targetSeasons: leagues.reduce((total, league) => total + league.seasons.length, 0),
      importedSeasons: leagues.reduce((total, league) => total + league.importedSeasonCount, 0),
      finishedFixtures: leagues.reduce((total, league) => total + league.finishedFixtureCount, 0),
      datasets: leagues.reduce((total, league) => total + league.datasetCount, 0),
      backtests: leagues.reduce((total, league) => total + league.backtestCount, 0),
    },
    leagues,
    recentRuns: runs.slice(0, 40).map(publicRun),
    bootstrapQueue: FOOTBALL_DATA_PILOT_LEAGUES.flatMap((league) => (
      FOOTBALL_DATA_RESEARCH_SEASONS.map((season) => ({ leagueCode: league.code, seasonCode: season.code }))
    )),
  };
}

export async function pullFootballDataSeason(
  actor: AdminActor,
  input: { leagueCode: unknown; seasonCode: unknown },
) {
  requireResearchAdmin(actor);
  const { league, season } = resolveFootballDataSelection(input.leagueCode, input.seasonCode);
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [{ total: recentPulls }] = await db.select({ total: count() }).from(researchSourceRuns)
    .where(and(eq(researchSourceRuns.requestedByEmail, actor.email), gte(researchSourceRuns.startedAt, hourAgo)));
  if (Number(recentPulls) >= HOURLY_PULL_LIMIT) {
    throw new ResearchFeedHttpError(429, "RESEARCH_PULL_RATE_LIMIT", "Saatlik 30 kaynak çekimi sınırına ulaşıldı.", 3_600);
  }

  const sourceId = await buildSourceId(FOOTBALL_DATA_SOURCE_NAME);
  await db.insert(dataSources).values({
    id: sourceId,
    name: FOOTBALL_DATA_SOURCE_NAME,
    baseUrl: FOOTBALL_DATA_DATA_URL,
    acquisitionMethod: "public_dataset",
    legalStatus: "review",
    isActive: true,
    createdByEmail: actor.email,
    updatedAt: nowIso,
  }).onConflictDoUpdate({
    target: dataSources.id,
    set: {
      baseUrl: FOOTBALL_DATA_DATA_URL,
      acquisitionMethod: "public_dataset",
      legalStatus: "review",
      isActive: true,
      updatedAt: nowIso,
    },
  });

  const upstreamUrl = buildFootballDataSourceUrl(league.code, season.code);
  const windowKey = Math.floor(now.getTime() / PULL_WINDOW_MS);
  const runId = `fdpull:${league.code.toLowerCase()}:${season.code}:${windowKey}`;
  const insertResult = await db.insert(researchSourceRuns).values({
    id: runId,
    sourceId,
    adapterVersion: FOOTBALL_DATA_ADAPTER_VERSION,
    leagueCode: league.code,
    leagueId: league.id,
    seasonCode: season.code,
    seasonLabel: season.label,
    upstreamUrl,
    status: "fetching",
    revisionVerified: false,
    researchOnly: true,
    requestedByEmail: actor.email,
    startedAt: nowIso,
  }).onConflictDoNothing();
  if (changedRows(insertResult) === 0) {
    const [existing] = await db.select().from(researchSourceRuns).where(eq(researchSourceRuns.id, runId)).limit(1);
    if (!existing) throw new ResearchFeedHttpError(409, "PULL_ALREADY_RUNNING", "Aynı kaynak çekimi zaten çalışıyor.");
    return { run: publicRun(existing), reused: true };
  }

  const [previous] = await db.select().from(researchSourceRuns).where(and(
    eq(researchSourceRuns.leagueCode, league.code),
    eq(researchSourceRuns.seasonCode, season.code),
    inArray(researchSourceRuns.status, ["imported", "unchanged"]),
  )).orderBy(desc(researchSourceRuns.startedAt)).limit(1);

  let responseStatus: number | null = null;
  let responseContentType: string | null = null;
  let upstreamEtag: string | null = null;
  let upstreamLastModified: string | null = null;
  let rawSnapshotKey: string | null = null;
  let rawChecksumSha256: string | null = null;
  let contentBytes = 0;
  try {
    const headers: Record<string, string> = {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.1",
      "Cache-Control": "no-cache",
    };
    if (previous?.upstreamEtag) headers["If-None-Match"] = previous.upstreamEtag;
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    responseStatus = response.status;
    responseContentType = response.headers.get("content-type");
    upstreamEtag = response.headers.get("etag");
    upstreamLastModified = response.headers.get("last-modified");
    if (response.status === 304 && previous) {
      const completedAt = new Date().toISOString();
      await db.update(researchSourceRuns).set({
        status: "unchanged",
        httpStatus: response.status,
        responseContentType,
        upstreamEtag: upstreamEtag ?? previous.upstreamEtag,
        upstreamLastModified: upstreamLastModified ?? previous.upstreamLastModified,
        ingestionRunId: previous.ingestionRunId,
        rawSnapshotKey: previous.rawSnapshotKey,
        rawChecksumSha256: previous.rawChecksumSha256,
        contentBytes: previous.contentBytes,
        sourceRowCount: previous.sourceRowCount,
        importedStatRowCount: previous.importedStatRowCount,
        ignoredOddsColumnCount: previous.ignoredOddsColumnCount,
        completedAt,
      }).where(eq(researchSourceRuns.id, runId));
      const [unchanged] = await db.select().from(researchSourceRuns).where(eq(researchSourceRuns.id, runId)).limit(1);
      return { run: publicRun(unchanged), reused: true };
    }
    if (!response.ok || response.status !== 200) {
      throw new ResearchFeedHttpError(502, "UPSTREAM_HTTP_ERROR", `Kaynak site HTTP ${response.status} yanıtı verdi.`);
    }
    const declaredBytes = Number(response.headers.get("content-length") ?? "0");
    if (declaredBytes > FOOTBALL_DATA_MAX_BYTES) {
      throw new ResearchFeedHttpError(502, "UPSTREAM_FILE_TOO_LARGE", "Kaynak CSV 3 MB sınırını aşıyor.");
    }
    const responseBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(responseBuffer);
    contentBytes = bytes.byteLength;
    if (contentBytes > FOOTBALL_DATA_MAX_BYTES) {
      throw new ResearchFeedHttpError(502, "UPSTREAM_FILE_TOO_LARGE", "Kaynak CSV 3 MB sınırını aşıyor.");
    }
    rawChecksumSha256 = await sha256(responseBuffer);
    if (previous?.rawChecksumSha256 === rawChecksumSha256) {
      const completedAt = new Date().toISOString();
      await db.update(researchSourceRuns).set({
        status: "unchanged",
        httpStatus: response.status,
        responseContentType,
        upstreamEtag,
        upstreamLastModified,
        ingestionRunId: previous.ingestionRunId,
        rawSnapshotKey: previous.rawSnapshotKey,
        rawChecksumSha256,
        contentBytes,
        sourceRowCount: previous.sourceRowCount,
        importedStatRowCount: previous.importedStatRowCount,
        ignoredOddsColumnCount: previous.ignoredOddsColumnCount,
        completedAt,
      }).where(eq(researchSourceRuns.id, runId));
      const [unchanged] = await db.select().from(researchSourceRuns).where(eq(researchSourceRuns.id, runId)).limit(1);
      return { run: publicRun(unchanged), reused: true };
    }

    const csv = new TextDecoder("utf-8").decode(bytes);
    const parsed = parseFootballDataCsv({
      csv,
      leagueCode: league.code,
      seasonCode: season.code,
      capturedAt: nowIso,
    });
    rawSnapshotKey = `research/football-data/${season.code}/${league.code}/${rawChecksumSha256}.csv`;
    const bucket = await getBucket();
    await bucket.put(rawSnapshotKey, bytes, {
      httpMetadata: { contentType: responseContentType || "text/csv; charset=utf-8" },
      customMetadata: {
        source: "football-data.co.uk",
        adapterVersion: FOOTBALL_DATA_ADAPTER_VERSION,
        leagueCode: league.code,
        seasonCode: season.code,
        fetchedAt: nowIso,
        checksumSha256: rawChecksumSha256,
      },
    });
    const imported = await importFootballSnapshot(actor, parsed.envelope, {
      importFormat: "csv",
      externalIssues: parsed.qualityIssues,
      forceResearchOnlyReason: "Kaynak revizyon zamanı ve ticari yeniden kullanım hakkı doğrulanmadığı için öneri kapısı zorunlu olarak kapalıdır.",
    });
    const completedAt = new Date().toISOString();
    await db.update(researchSourceRuns).set({
      status: "imported",
      ingestionRunId: imported.runId,
      httpStatus: response.status,
      responseContentType,
      upstreamEtag,
      upstreamLastModified,
      rawSnapshotKey,
      rawChecksumSha256,
      contentBytes,
      sourceRowCount: parsed.sourceRowCount,
      importedStatRowCount: parsed.importedStatRowCount,
      ignoredOddsColumnCount: parsed.ignoredOddsColumnCount,
      completedAt,
    }).where(eq(researchSourceRuns.id, runId));
    const [completed] = await db.select().from(researchSourceRuns).where(eq(researchSourceRuns.id, runId)).limit(1);
    return { run: publicRun(completed), reused: false, quality: imported.quality };
  } catch (error) {
    const normalized = normalizePullError(error);
    await db.update(researchSourceRuns).set({
      status: "failed",
      httpStatus: responseStatus,
      responseContentType,
      upstreamEtag,
      upstreamLastModified,
      rawSnapshotKey,
      rawChecksumSha256,
      contentBytes,
      errorCode: normalized.code,
      errorMessage: normalized.message.slice(0, 500),
      completedAt: new Date().toISOString(),
    }).where(eq(researchSourceRuns.id, runId));
    throw normalized;
  }
}

function requireResearchAdmin(actor: AdminActor) {
  if (actor.role !== "admin") {
    throw new ResearchFeedHttpError(403, "RESEARCH_ADMIN_REQUIRED", "Kaynak çekimi yalnız yönetici rolüne açıktır.");
  }
}

function normalizePullError(error: unknown) {
  if (error instanceof ResearchFeedHttpError) return error;
  if (error instanceof FootballDataSourceError) {
    return new ResearchFeedHttpError(502, "SOURCE_CSV_INVALID", error.message);
  }
  if (error instanceof Error && error.message.includes("binding")) {
    return new ResearchFeedHttpError(503, "STORAGE_BINDING_UNAVAILABLE", "Kalıcı R2 depolama bağlantısı kullanılamıyor.");
  }
  return new ResearchFeedHttpError(502, "SOURCE_FETCH_FAILED", "Kaynak CSV güvenli biçimde alınamadı.");
}

function publicRun(row: typeof researchSourceRuns.$inferSelect | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    leagueCode: row.leagueCode,
    leagueId: row.leagueId,
    seasonCode: row.seasonCode,
    seasonLabel: row.seasonLabel,
    adapterVersion: row.adapterVersion,
    upstreamUrl: row.upstreamUrl,
    status: row.status,
    httpStatus: row.httpStatus,
    upstreamLastModified: row.upstreamLastModified,
    checksumSha256: row.rawChecksumSha256,
    contentBytes: row.contentBytes,
    sourceRowCount: row.sourceRowCount,
    importedStatRowCount: row.importedStatRowCount,
    ignoredOddsColumnCount: row.ignoredOddsColumnCount,
    revisionVerified: row.revisionVerified,
    researchOnly: row.researchOnly,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

async function getBucket(): Promise<R2Bucket> {
  const { env } = await import("cloudflare:workers");
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket) throw new Error("Cloudflare R2 binding `BUCKET` is unavailable.");
  return bucket;
}

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function changedRows(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const meta = "meta" in value ? (value as { meta?: { changes?: number } }).meta : null;
  return Number(meta?.changes ?? 0);
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

export type FootballDataResearchOverview = Awaited<ReturnType<typeof getFootballDataResearchOverview>>;
