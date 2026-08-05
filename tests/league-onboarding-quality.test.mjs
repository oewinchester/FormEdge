import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLeagueOnboardingAssessment,
  canonicalLeagueOnboardingJson,
  parseLeagueOnboardingManifest,
} from "../lib/league-onboarding-quality.ts";

const baseEvidence = {
  evaluatedAt: "2026-08-05T16:00:00.000Z",
  league: {
    id: "league-tr-1",
    name: "Süper Lig",
    countryCode: "tr",
    coverageLevel: "advanced",
    active: true,
  },
  source: {
    id: "source-licensed",
    name: "Licensed Research Feed",
    legalStatus: "approved",
    acquisitionMethod: "licensed_feed",
    active: true,
  },
  history: { fixtureCount: 220, finishedFixtureCount: 200, seasonCount: 2 },
  identity: { aliasTotal: 40, aliasMatched: 40, fixtureMappingTotal: 220, fixtureMappingMatched: 220 },
  advancedData: { expectedFieldCount: 3200, suppliedFieldCount: 3200 },
  lineups: { eligibleFixtureCount: 220, fullyCoveredFixtureCount: 110 },
  odds: { fixtureCount: 220, coveredFixtureCount: 220, snapshotCount: 660, preKickoffSnapshotCount: 660 },
  sourceSla: {
    runCount: 12,
    completedRunCount: 12,
    failedRunCount: 0,
    lastSuccessfulAt: "2026-08-05T15:30:00.000Z",
  },
};

test("league onboarding assessment is deterministic and remains analysis-only", async () => {
  const first = await buildLeagueOnboardingAssessment(baseEvidence);
  const second = await buildLeagueOnboardingAssessment(structuredClone(baseEvidence));
  assert.equal(first.evidenceFingerprintSha256, second.evidenceFingerprintSha256);
  assert.equal(canonicalLeagueOnboardingJson(first.manifest), canonicalLeagueOnboardingJson(second.manifest));
  assert.equal(first.manifest.score, 95);
  assert.equal(first.manifest.grade, "A");
  assert.equal(first.manifest.state, "ready_for_research");
  assert.deepEqual(first.manifest.blockerCodes, []);
  assert.equal(first.manifest.policy.researchOnly, true);
  assert.equal(first.manifest.policy.recommendationEligible, false);
  assert.equal(first.manifest.policy.scoreCanOpenRecommendationGate, false);
});

test("missing mandatory evidence fails closed with explicit blocker codes", async () => {
  const result = await buildLeagueOnboardingAssessment({
    ...baseEvidence,
    history: { fixtureCount: 0, finishedFixtureCount: 0, seasonCount: 0 },
    identity: { aliasTotal: 0, aliasMatched: 0, fixtureMappingTotal: 0, fixtureMappingMatched: 0 },
    advancedData: { expectedFieldCount: 0, suppliedFieldCount: 0 },
    lineups: { eligibleFixtureCount: 0, fullyCoveredFixtureCount: 0 },
    odds: { fixtureCount: 0, coveredFixtureCount: 0, snapshotCount: 0, preKickoffSnapshotCount: 0 },
    sourceSla: { runCount: 0, completedRunCount: 0, failedRunCount: 0, lastSuccessfulAt: null },
  });
  assert.equal(result.manifest.state, "blocked");
  assert.deepEqual(result.manifest.blockerCodes, [
    "ADVANCED_DATA_COVERAGE_LOW",
    "HISTORY_DEPTH_INSUFFICIENT",
    "IDENTITY_MAPPING_INCOMPLETE",
    "ODDS_TIMESTAMP_COVERAGE_LOW",
    "SOURCE_SLA_UNPROVEN",
  ]);
  assert.deepEqual(result.manifest.warningCodes, ["LINEUP_COVERAGE_LOW", "SOURCE_SLA_SAMPLE_SMALL"]);
  assert.equal(result.manifest.policy.recommendationEligible, false);
});

test("an unapproved license blocks even an otherwise perfect feed", async () => {
  const result = await buildLeagueOnboardingAssessment({
    ...baseEvidence,
    source: { ...baseEvidence.source, legalStatus: "review" },
    lineups: { eligibleFixtureCount: 220, fullyCoveredFixtureCount: 220 },
  });
  assert.equal(result.manifest.state, "blocked");
  assert.equal(result.manifest.blockerCodes.includes("SOURCE_LICENSE_UNAPPROVED"), true);
  assert.equal(result.manifest.components.find((item) => item.id === "license")?.score, 35);
  assert.equal(result.manifest.policy.scoreCanOpenRecommendationGate, false);
});

test("stored manifests reject any policy that attempts to open recommendation eligibility", async () => {
  const { manifest } = await buildLeagueOnboardingAssessment(baseEvidence);
  assert.ok(parseLeagueOnboardingManifest(JSON.stringify(manifest)));
  assert.equal(parseLeagueOnboardingManifest(JSON.stringify({
    ...manifest,
    policy: { ...manifest.policy, recommendationEligible: true },
  })), null);
  assert.equal(parseLeagueOnboardingManifest("not-json"), null);
});
