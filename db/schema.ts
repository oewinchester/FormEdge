import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const appMembers = sqliteTable("app_members", {
  email: text("email").primaryKey(),
  displayName: text("display_name"),
  role: text("role", { enum: ["admin", "editor"] }).notNull().default("editor"),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  lastSeenAt: text("last_seen_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const dataSources = sqliteTable(
  "data_sources",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    baseUrl: text("base_url"),
    acquisitionMethod: text("acquisition_method", {
      enum: ["manual_export", "public_dataset", "licensed_feed"],
    }).notNull(),
    legalStatus: text("legal_status", {
      enum: ["approved", "review", "blocked"],
    }).notNull().default("review"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("data_sources_name_unique").on(table.name),
    index("data_sources_legal_status_idx").on(table.legalStatus),
  ],
);

export const ingestionRuns = sqliteTable(
  "ingestion_runs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => dataSources.id),
    status: text("status", {
      enum: ["processing", "completed", "failed"],
    }).notNull().default("processing"),
    capturedAt: text("captured_at").notNull(),
    snapshotKey: text("snapshot_key").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    importFormat: text("import_format", { enum: ["json", "csv"] }).notNull().default("json"),
    recordCount: integer("record_count").notNull().default(0),
    dataGrade: text("data_grade", { enum: ["A", "B", "C", "D"] }).notNull().default("D"),
    qualityScore: integer("quality_score").notNull().default(0),
    completenessScore: integer("completeness_score").notNull().default(0),
    consistencyScore: integer("consistency_score").notNull().default(0),
    freshnessScore: integer("freshness_score").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    recommendationEligible: integer("recommendation_eligible", { mode: "boolean" }).notNull().default(false),
    createdByEmail: text("created_by_email").notNull(),
    errorMessage: text("error_message"),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("ingestion_runs_source_idx").on(table.sourceId),
    index("ingestion_runs_status_idx").on(table.status),
    index("ingestion_runs_captured_at_idx").on(table.capturedAt),
  ],
);

export const ingestionIssues = sqliteTable(
  "ingestion_issues",
  {
    id: text("id").primaryKey(),
    ingestionRunId: text("ingestion_run_id").notNull().references(() => ingestionRuns.id),
    severity: text("severity", { enum: ["warning", "error"] }).notNull(),
    code: text("code").notNull(),
    entityType: text("entity_type").notNull(),
    entityKey: text("entity_key"),
    field: text("field"),
    message: text("message").notNull(),
    detailsJson: text("details_json").notNull().default("{}"),
    createdAt: createdAt(),
  },
  (table) => [
    index("ingestion_issues_run_idx").on(table.ingestionRunId),
    index("ingestion_issues_severity_idx").on(table.severity),
    index("ingestion_issues_code_idx").on(table.code),
  ],
);

export const leagues = sqliteTable("leagues", {
  id: text("id").primaryKey(),
  countryCode: text("country_code").notNull(),
  name: text("name").notNull(),
  tier: integer("tier"),
  coverageLevel: text("coverage_level", {
    enum: ["basic", "advanced", "verified"],
  }).notNull().default("basic"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    countryCode: text("country_code").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("teams_country_idx").on(table.countryCode)],
);

export const teamAliases = sqliteTable(
  "team_aliases",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => dataSources.id),
    externalTeamKey: text("external_team_key").notNull(),
    externalTeamName: text("external_team_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    teamId: text("team_id").notNull().references(() => teams.id),
    status: text("status", { enum: ["matched", "review"] }).notNull().default("review"),
    confidence: real("confidence").notNull().default(0),
    createdByRunId: text("created_by_run_id").references(() => ingestionRuns.id),
    reviewedByEmail: text("reviewed_by_email"),
    reviewedAt: text("reviewed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("team_aliases_source_key_unique").on(table.sourceId, table.externalTeamKey),
    index("team_aliases_team_idx").on(table.teamId),
    index("team_aliases_status_idx").on(table.status),
  ],
);

export const fixtures = sqliteTable(
  "fixtures",
  {
    id: text("id").primaryKey(),
    leagueId: text("league_id").notNull().references(() => leagues.id),
    season: text("season").notNull(),
    kickoffAt: text("kickoff_at").notNull(),
    homeTeamId: text("home_team_id").notNull().references(() => teams.id),
    awayTeamId: text("away_team_id").notNull().references(() => teams.id),
    status: text("status", {
      enum: ["scheduled", "live", "finished", "postponed", "cancelled"],
    }).notNull().default("scheduled"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    sourceId: text("source_id").notNull().references(() => dataSources.id),
    ingestionRunId: text("ingestion_run_id").notNull().references(() => ingestionRuns.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("fixtures_league_kickoff_idx").on(table.leagueId, table.kickoffAt),
    index("fixtures_home_team_idx").on(table.homeTeamId),
    index("fixtures_away_team_idx").on(table.awayTeamId),
  ],
);

export const fixtureMappings = sqliteTable(
  "fixture_mappings",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => dataSources.id),
    externalFixtureKey: text("external_fixture_key").notNull(),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    homeTeamId: text("home_team_id").notNull().references(() => teams.id),
    awayTeamId: text("away_team_id").notNull().references(() => teams.id),
    sourceKickoffAt: text("source_kickoff_at").notNull(),
    status: text("status", { enum: ["matched", "review"] }).notNull().default("review"),
    confidence: real("confidence").notNull().default(0),
    createdByRunId: text("created_by_run_id").references(() => ingestionRuns.id),
    reviewedByEmail: text("reviewed_by_email"),
    reviewedAt: text("reviewed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("fixture_mappings_source_key_unique").on(table.sourceId, table.externalFixtureKey),
    index("fixture_mappings_fixture_idx").on(table.fixtureId),
    index("fixture_mappings_status_idx").on(table.status),
  ],
);

export const teamMatchStats = sqliteTable(
  "team_match_stats",
  {
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    teamId: text("team_id").notNull().references(() => teams.id),
    possession: real("possession"),
    shots: integer("shots"),
    shotsOnTarget: integer("shots_on_target"),
    expectedGoals: real("expected_goals"),
    dangerousAttacks: integer("dangerous_attacks"),
    penaltyAreaEntries: integer("penalty_area_entries"),
    ppda: real("ppda"),
    bigChancesAllowed: integer("big_chances_allowed"),
    ingestionRunId: text("ingestion_run_id").notNull().references(() => ingestionRuns.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.fixtureId, table.teamId] }),
    index("team_match_stats_team_idx").on(table.teamId),
  ],
);

export const oddsSnapshots = sqliteTable(
  "odds_snapshots",
  {
    id: text("id").primaryKey(),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    bookmaker: text("bookmaker").notNull(),
    market: text("market").notNull(),
    selection: text("selection").notNull(),
    line: real("line"),
    decimalOdds: real("decimal_odds").notNull(),
    capturedAt: text("captured_at").notNull(),
    ingestionRunId: text("ingestion_run_id").notNull().references(() => ingestionRuns.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("odds_fixture_market_idx").on(table.fixtureId, table.market),
    index("odds_captured_at_idx").on(table.capturedAt),
  ],
);

export const lineupSnapshots = sqliteTable(
  "lineup_snapshots",
  {
    id: text("id").primaryKey(),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    teamId: text("team_id").notNull().references(() => teams.id),
    status: text("status", { enum: ["probable", "confirmed"] }).notNull(),
    playersJson: text("players_json").notNull(),
    unavailablePlayersJson: text("unavailable_players_json").notNull().default("[]"),
    capturedAt: text("captured_at").notNull(),
    ingestionRunId: text("ingestion_run_id").notNull().references(() => ingestionRuns.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("lineups_fixture_team_idx").on(table.fixtureId, table.teamId),
    index("lineups_captured_at_idx").on(table.capturedAt),
  ],
);

export const featureDatasetRuns = sqliteTable(
  "feature_dataset_runs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    leagueId: text("league_id").notNull().references(() => leagues.id),
    leagueLabel: text("league_label").notNull(),
    market: text("market", { enum: ["1X2"] }).notNull().default("1X2"),
    status: text("status", { enum: ["building", "completed", "failed"] }).notNull().default("building"),
    predictionHorizonHours: integer("prediction_horizon_hours").notNull(),
    minimumHistoryMatches: integer("minimum_history_matches").notNull(),
    resultAvailabilityHours: integer("result_availability_hours").notNull(),
    statsAvailabilityPolicy: text("stats_availability_policy", {
      enum: ["fixture_end_plus_buffer"],
    }).notNull().default("fixture_end_plus_buffer"),
    sourceFixtureCount: integer("source_fixture_count").notNull().default(0),
    eligibleSampleCount: integer("eligible_sample_count").notNull().default(0),
    rejectedSampleCount: integer("rejected_sample_count").notNull().default(0),
    averageDataCompleteness: real("average_data_completeness").notNull().default(0),
    oddsCoverage: real("odds_coverage").notNull().default(0),
    featureSchemaVersion: text("feature_schema_version").notNull(),
    benchmarkSchemaVersion: text("benchmark_schema_version").notNull().default("unavailable"),
    ablationSchemaVersion: text("ablation_schema_version").notNull().default("unavailable"),
    builderVersion: text("builder_version").notNull(),
    configJson: text("config_json").notNull(),
    datasetChecksumSha256: text("dataset_checksum_sha256").notNull(),
    auditJson: text("audit_json").notNull().default("{}"),
    createdByEmail: text("created_by_email").notNull(),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("feature_dataset_runs_checksum_unique").on(table.datasetChecksumSha256),
    index("feature_dataset_runs_league_idx").on(table.leagueId, table.startedAt),
    index("feature_dataset_runs_status_idx").on(table.status),
  ],
);

export const featureDatasetSamples = sqliteTable(
  "feature_dataset_samples",
  {
    id: text("id").primaryKey(),
    datasetRunId: text("dataset_run_id").notNull().references(() => featureDatasetRuns.id),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    predictionAt: text("prediction_at").notNull(),
    kickoffAt: text("kickoff_at").notNull(),
    featureCutoffAt: text("feature_cutoff_at").notNull(),
    resultKnownAt: text("result_known_at").notNull(),
    actualOutcome: text("actual_outcome", { enum: ["1", "X", "2"] }).notNull(),
    probabilityHome: real("probability_home").notNull(),
    probabilityDraw: real("probability_draw").notNull(),
    probabilityAway: real("probability_away").notNull(),
    dataCompleteness: real("data_completeness").notNull(),
    featureFingerprint: text("feature_fingerprint").notNull(),
    oddsBookmaker: text("odds_bookmaker"),
    oddsCapturedAt: text("odds_captured_at"),
    oddsHome: real("odds_home"),
    oddsDraw: real("odds_draw"),
    oddsAway: real("odds_away"),
    closingOddsCapturedAt: text("closing_odds_captured_at"),
    closingHome: real("closing_home"),
    closingDraw: real("closing_draw"),
    closingAway: real("closing_away"),
    featureJson: text("feature_json").notNull(),
    benchmarkJson: text("benchmark_json").notNull().default("{}"),
    ablationJson: text("ablation_json").notNull().default("{}"),
    sampleJson: text("sample_json").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("feature_dataset_samples_run_fixture_unique").on(table.datasetRunId, table.fixtureId),
    index("feature_dataset_samples_run_idx").on(table.datasetRunId),
    index("feature_dataset_samples_kickoff_idx").on(table.kickoffAt),
  ],
);

export const modelDefinitions = sqliteTable(
  "model_definitions",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    family: text("family", { enum: ["heuristic", "statistical", "ensemble"] }).notNull(),
    targetMarket: text("target_market").notNull(),
    status: text("status", { enum: ["research", "shadow", "active", "suspended"] }).notNull().default("research"),
    description: text("description").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("model_definitions_code_unique").on(table.code),
    index("model_definitions_market_idx").on(table.targetMarket),
    index("model_definitions_status_idx").on(table.status),
  ],
);

export const modelVersions = sqliteTable(
  "model_versions",
  {
    id: text("id").primaryKey(),
    modelDefinitionId: text("model_definition_id").notNull().references(() => modelDefinitions.id),
    versionLabel: text("version_label").notNull(),
    featureSchemaVersion: text("feature_schema_version").notNull(),
    configJson: text("config_json").notNull(),
    configChecksumSha256: text("config_checksum_sha256").notNull(),
    trainingCutoffAt: text("training_cutoff_at"),
    status: text("status", { enum: ["candidate", "champion", "retired"] }).notNull().default("candidate"),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("model_versions_definition_label_unique").on(table.modelDefinitionId, table.versionLabel),
    index("model_versions_status_idx").on(table.status),
  ],
);

export const backtestRuns = sqliteTable(
  "backtest_runs",
  {
    id: text("id").primaryKey(),
    modelVersionId: text("model_version_id").notNull().references(() => modelVersions.id),
    name: text("name").notNull(),
    datasetKind: text("dataset_kind", { enum: ["historical", "synthetic"] }).notNull(),
    datasetChecksumSha256: text("dataset_checksum_sha256").notNull(),
    featureDatasetRunId: text("feature_dataset_run_id").references(() => featureDatasetRuns.id),
    leagueId: text("league_id").references(() => leagues.id),
    leagueLabel: text("league_label").notNull(),
    market: text("market").notNull(),
    status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
    evaluationMode: text("evaluation_mode", { enum: ["walk_forward"] }).notNull().default("walk_forward"),
    sourceSampleCount: integer("source_sample_count").notNull().default(0),
    sampleCount: integer("sample_count").notNull().default(0),
    foldCount: integer("fold_count").notNull().default(0),
    leakageViolationCount: integer("leakage_violation_count").notNull().default(0),
    dataCompleteness: real("data_completeness").notNull().default(0),
    accuracy: real("accuracy"),
    logLoss: real("log_loss"),
    brierScore: real("brier_score"),
    ece: real("ece"),
    calibrationSlope: real("calibration_slope"),
    calibrationIntercept: real("calibration_intercept"),
    benchmarkLogLoss: real("benchmark_log_loss"),
    benchmarkBrierScore: real("benchmark_brier_score"),
    recommendationCount: integer("recommendation_count").notNull().default(0),
    netUnits: real("net_units"),
    yield: real("yield"),
    profitFactor: real("profit_factor"),
    averageClv: real("average_clv"),
    maxDrawdownUnits: real("max_drawdown_units"),
    maxLosingStreak: integer("max_losing_streak"),
    releaseStage: text("release_stage", {
      enum: ["research", "analysis_only", "shadow", "limited_recommendation", "general_recommendation", "suspended"],
    }).notNull().default("research"),
    configJson: text("config_json").notNull(),
    metricsJson: text("metrics_json"),
    errorMessage: text("error_message"),
    createdByEmail: text("created_by_email").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("backtest_runs_model_idx").on(table.modelVersionId),
    index("backtest_runs_dataset_idx").on(table.featureDatasetRunId),
    index("backtest_runs_league_market_idx").on(table.leagueId, table.market),
    index("backtest_runs_status_idx").on(table.status),
    index("backtest_runs_started_at_idx").on(table.startedAt),
  ],
);

export const backtestPredictions = sqliteTable(
  "backtest_predictions",
  {
    id: text("id").primaryKey(),
    backtestRunId: text("backtest_run_id").notNull().references(() => backtestRuns.id),
    fixtureKey: text("fixture_key").notNull(),
    predictionAt: text("prediction_at").notNull(),
    kickoffAt: text("kickoff_at").notNull(),
    resultKnownAt: text("result_known_at"),
    featureCutoffAt: text("feature_cutoff_at").notNull(),
    featureFingerprint: text("feature_fingerprint").notNull(),
    dataCompleteness: real("data_completeness").notNull(),
    actualOutcome: text("actual_outcome", { enum: ["1", "X", "2"] }).notNull(),
    predictedOutcome: text("predicted_outcome", { enum: ["1", "X", "2"] }).notNull(),
    probabilityHome: real("probability_home").notNull(),
    probabilityDraw: real("probability_draw").notNull(),
    probabilityAway: real("probability_away").notNull(),
    oddsCapturedAt: text("odds_captured_at"),
    oddsHome: real("odds_home"),
    oddsDraw: real("odds_draw"),
    oddsAway: real("odds_away"),
    closingHome: real("closing_home"),
    closingDraw: real("closing_draw"),
    closingAway: real("closing_away"),
    selectedOutcome: text("selected_outcome", { enum: ["1", "X", "2"] }),
    selectedProbability: real("selected_probability"),
    decimalOdds: real("decimal_odds"),
    closingOdds: real("closing_odds"),
    edge: real("edge"),
    stakeUnits: real("stake_units").notNull().default(0),
    pnlUnits: real("pnl_units").notNull().default(0),
    clv: real("clv"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("backtest_predictions_run_fixture_unique").on(table.backtestRunId, table.fixtureKey),
    index("backtest_predictions_run_idx").on(table.backtestRunId),
    index("backtest_predictions_kickoff_idx").on(table.kickoffAt),
  ],
);

export const modelEvidenceRuns = sqliteTable(
  "model_evidence_runs",
  {
    id: text("id").primaryKey(),
    datasetRunId: text("dataset_run_id").notNull().references(() => featureDatasetRuns.id),
    datasetChecksumSha256: text("dataset_checksum_sha256").notNull(),
    leagueId: text("league_id").notNull().references(() => leagues.id),
    leagueLabel: text("league_label").notNull(),
    market: text("market", { enum: ["1X2"] }).notNull().default("1X2"),
    status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
    evidenceSchemaVersion: text("evidence_schema_version").notNull(),
    configJson: text("config_json").notNull(),
    configChecksumSha256: text("config_checksum_sha256").notNull(),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    developmentCount: integer("development_count").notNull().default(0),
    calibrationCount: integer("calibration_count").notNull().default(0),
    holdoutCount: integer("holdout_count").notNull().default(0),
    holdoutStartAt: text("holdout_start_at"),
    holdoutEndAt: text("holdout_end_at"),
    selectedFormVariant: text("selected_form_variant"),
    reportedLeaderModelCode: text("reported_leader_model_code"),
    evidenceStatus: text("evidence_status", {
      enum: ["blocked", "insufficient", "inconclusive", "candidate"],
    }).notNull().default("blocked"),
    partitionJson: text("partition_json").notNull().default("{}"),
    ablationJson: text("ablation_json").notNull().default("{}"),
    modelsJson: text("models_json").notNull().default("[]"),
    createdByEmail: text("created_by_email").notNull(),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("model_evidence_runs_dataset_unique").on(table.datasetRunId),
    index("model_evidence_runs_league_market_idx").on(table.leagueId, table.market),
    index("model_evidence_runs_status_idx").on(table.status),
  ],
);

export const predictionThreads = sqliteTable(
  "prediction_threads",
  {
    id: text("id").primaryKey(),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    leagueId: text("league_id").notNull().references(() => leagues.id),
    leagueLabel: text("league_label").notNull(),
    market: text("market", { enum: ["1X2"] }).notNull().default("1X2"),
    status: text("status", {
      enum: ["watchlist", "final", "withdrawn", "expired"],
    }).notNull().default("watchlist"),
    currentVersionId: text("current_version_id"),
    finalVersionId: text("final_version_id"),
    versionCount: integer("version_count").notNull().default(0),
    eventCount: integer("event_count").notNull().default(0),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    recommendationEligible: integer("recommendation_eligible", { mode: "boolean" }).notNull().default(false),
    createdByEmail: text("created_by_email").notNull(),
    lastTransitionByEmail: text("last_transition_by_email"),
    lastTransitionAt: text("last_transition_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("prediction_threads_fixture_market_unique").on(table.fixtureId, table.market),
    index("prediction_threads_league_market_idx").on(table.leagueId, table.market),
    index("prediction_threads_status_idx").on(table.status),
    index("prediction_threads_updated_idx").on(table.updatedAt),
  ],
);

export const predictionVersions = sqliteTable(
  "prediction_versions",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull().references(() => predictionThreads.id),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    versionNumber: integer("version_number").notNull(),
    lifecycleSchemaVersion: text("lifecycle_schema_version").notNull(),
    trigger: text("trigger", {
      enum: ["initial_window", "scheduled_refresh", "lineup_probable", "lineup_confirmed", "fixture_status_change", "manual_review"],
    }).notNull(),
    modelCode: text("model_code").notNull(),
    modelVersionId: text("model_version_id").references(() => modelVersions.id),
    predictionAt: text("prediction_at").notNull(),
    kickoffAt: text("kickoff_at").notNull(),
    featureCutoffAt: text("feature_cutoff_at").notNull(),
    featureFingerprint: text("feature_fingerprint").notNull(),
    versionFingerprint: text("version_fingerprint").notNull(),
    supersedesVersionId: text("supersedes_version_id"),
    probabilityHome: real("probability_home").notNull(),
    probabilityDraw: real("probability_draw").notNull(),
    probabilityAway: real("probability_away").notNull(),
    predictedOutcome: text("predicted_outcome", { enum: ["1", "X", "2"] }).notNull(),
    recommendationOutcome: text("recommendation_outcome", { enum: ["1", "X", "2"] }),
    confidence: real("confidence").notNull(),
    dataCompleteness: real("data_completeness").notNull(),
    lineupState: text("lineup_state", { enum: ["none", "probable", "confirmed"] }).notNull().default("none"),
    lineupFingerprint: text("lineup_fingerprint"),
    lineupSnapshotIdsJson: text("lineup_snapshot_ids_json").notNull().default("[]"),
    releaseGateAllowed: integer("release_gate_allowed", { mode: "boolean" }).notNull().default(false),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    recommendationEligible: integer("recommendation_eligible", { mode: "boolean" }).notNull().default(false),
    blockerCodesJson: text("blocker_codes_json").notNull().default("[]"),
    oddsJson: text("odds_json").notNull().default("null"),
    payloadJson: text("payload_json").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("prediction_versions_thread_number_unique").on(table.threadId, table.versionNumber),
    uniqueIndex("prediction_versions_thread_fingerprint_unique").on(table.threadId, table.versionFingerprint),
    index("prediction_versions_fixture_idx").on(table.fixtureId, table.createdAt),
    index("prediction_versions_model_idx").on(table.modelVersionId),
  ],
);

export const predictionEvents = sqliteTable(
  "prediction_events",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull().references(() => predictionThreads.id),
    sequence: integer("sequence").notNull(),
    versionId: text("version_id").references(() => predictionVersions.id),
    eventType: text("event_type", {
      enum: ["watchlisted", "versioned", "finalized", "withdrawn", "reopened", "expired"],
    }).notNull(),
    fromStatus: text("from_status", {
      enum: ["watchlist", "final", "withdrawn", "expired"],
    }),
    toStatus: text("to_status", {
      enum: ["watchlist", "final", "withdrawn", "expired"],
    }).notNull(),
    reasonCode: text("reason_code").notNull(),
    reasonText: text("reason_text").notNull(),
    actorType: text("actor_type", { enum: ["system", "admin", "data_import"] }).notNull(),
    actorEmail: text("actor_email"),
    idempotencyKey: text("idempotency_key").notNull(),
    immediateNotification: integer("immediate_notification", { mode: "boolean" }).notNull().default(false),
    metadataJson: text("metadata_json").notNull().default("{}"),
    occurredAt: text("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("prediction_events_thread_sequence_unique").on(table.threadId, table.sequence),
    uniqueIndex("prediction_events_idempotency_unique").on(table.idempotencyKey),
    index("prediction_events_thread_time_idx").on(table.threadId, table.occurredAt),
    index("prediction_events_type_idx").on(table.eventType),
  ],
);

export const releaseGates = sqliteTable(
  "release_gates",
  {
    id: text("id").primaryKey(),
    leagueId: text("league_id").references(() => leagues.id),
    leagueLabel: text("league_label").notNull(),
    market: text("market").notNull(),
    stage: text("stage", {
      enum: ["research", "analysis_only", "shadow", "limited_recommendation", "general_recommendation", "suspended"],
    }).notNull().default("research"),
    activeModelVersionId: text("active_model_version_id").references(() => modelVersions.id),
    lastBacktestRunId: text("last_backtest_run_id").references(() => backtestRuns.id),
    minimumEffectiveSample: integer("minimum_effective_sample").notNull().default(400),
    maximumEce: real("maximum_ece").notNull().default(0.08),
    requiredDataCompleteness: real("required_data_completeness").notNull().default(0.9),
    automatedRecommendationAllowed: integer("automated_recommendation_allowed", { mode: "boolean" }).notNull().default(false),
    evidenceJson: text("evidence_json").notNull().default("{}"),
    decidedByEmail: text("decided_by_email").notNull(),
    decidedAt: text("decided_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("release_gates_league_market_unique").on(table.leagueLabel, table.market),
    index("release_gates_stage_idx").on(table.stage),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detailsJson: text("details_json").notNull().default("{}"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_actor_idx").on(table.actorEmail),
    index("audit_entity_idx").on(table.entityType, table.entityId),
  ],
);
