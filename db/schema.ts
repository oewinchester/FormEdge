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

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    email: text("email").primaryKey(),
    displayName: text("display_name").notNull(),
    locale: text("locale", { enum: ["tr", "en"] }).notNull().default("tr"),
    plan: text("plan", { enum: ["free", "pro", "expert"] }).notNull().default("free"),
    subscriptionStatus: text("subscription_status", {
      enum: ["beta", "trial", "active", "paused", "cancelled"],
    }).notNull().default("beta"),
    betaAccessStatus: text("beta_access_status", {
      enum: ["pending", "invited", "active", "suspended"],
    }).notNull().default("pending"),
    onboardingStatus: text("onboarding_status", {
      enum: ["pending", "completed"],
    }).notNull().default("pending"),
    countryCode: text("country_code"),
    riskProfile: text("risk_profile", { enum: ["cautious", "balanced", "bold"] }),
    riskAssessmentStatus: text("risk_assessment_status", {
      enum: ["pending", "completed"],
    }).notNull().default("pending"),
    ageEligibilityAcknowledgedAt: text("age_eligibility_acknowledged_at"),
    responsibleUseAcknowledgedAt: text("responsible_use_acknowledged_at"),
    termsAcceptedAt: text("terms_accepted_at"),
    termsRevision: text("terms_revision"),
    onboardingCompletedAt: text("onboarding_completed_at"),
    trialStartedAt: text("trial_started_at"),
    trialEndsAt: text("trial_ends_at"),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("user_profiles_plan_idx").on(table.plan, table.subscriptionStatus),
    index("user_profiles_beta_access_idx").on(table.betaAccessStatus, table.onboardingStatus),
    index("user_profiles_last_seen_idx").on(table.lastSeenAt),
  ],
);

export const userDashboardPreferences = sqliteTable("user_dashboard_preferences", {
  userEmail: text("user_email").primaryKey().references(() => userProfiles.email),
  defaultAnalysisView: text("default_analysis_view", {
    enum: ["quick", "detailed"],
  }).notNull().default("quick"),
  performanceMode: text("performance_mode", {
    enum: ["system", "personal"],
  }).notNull().default("system"),
  timezone: text("timezone").notNull().default("Europe/Istanbul"),
  oddsFormat: text("odds_format", { enum: ["decimal"] }).notNull().default("decimal"),
  showWithdrawn: integer("show_withdrawn", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const betaWaitlistEntries = sqliteTable(
  "beta_waitlist_entries",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    locale: text("locale", { enum: ["tr", "en"] }).notNull().default("tr"),
    countryCode: text("country_code").notNull(),
    status: text("status", {
      enum: ["waitlisted", "invited", "accepted", "blocked", "withdrawn"],
    }).notNull().default("waitlisted"),
    source: text("source", { enum: ["landing", "member", "admin"] }).notNull().default("landing"),
    ageConfirmed: integer("age_confirmed", { mode: "boolean" }).notNull(),
    responsibleUseConfirmed: integer("responsible_use_confirmed", { mode: "boolean" }).notNull(),
    privacyAcknowledged: integer("privacy_acknowledged", { mode: "boolean" }).notNull(),
    termsRevision: text("terms_revision").notNull(),
    invitedAt: text("invited_at"),
    acceptedAt: text("accepted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("beta_waitlist_entries_email_unique").on(table.email),
    index("beta_waitlist_entries_status_time_idx").on(table.status, table.createdAt),
  ],
);

export const userRiskAssessments = sqliteTable(
  "user_risk_assessments",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    schemaVersion: text("schema_version").notNull(),
    answersJson: text("answers_json").notNull(),
    score: integer("score").notNull(),
    rawProfile: text("raw_profile", { enum: ["cautious", "balanced", "bold"] }).notNull(),
    resultProfile: text("result_profile", { enum: ["cautious", "balanced", "bold"] }).notNull(),
    safetyOverride: integer("safety_override", { mode: "boolean" }).notNull().default(false),
    safetyFlagsJson: text("safety_flags_json").notNull().default("[]"),
    createdAt: createdAt(),
  },
  (table) => [
    index("user_risk_assessments_user_time_idx").on(table.userEmail, table.createdAt),
    index("user_risk_assessments_result_idx").on(table.resultProfile, table.safetyOverride),
  ],
);

export const membershipEvents = sqliteTable(
  "membership_events",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    eventType: text("event_type", {
      enum: ["onboarding_completed", "trial_started", "trial_expired", "invitation_accepted", "access_changed", "plan_changed"],
    }).notNull(),
    fromPlan: text("from_plan", { enum: ["free", "pro", "expert"] }),
    toPlan: text("to_plan", { enum: ["free", "pro", "expert"] }),
    fromSubscriptionStatus: text("from_subscription_status", {
      enum: ["beta", "trial", "active", "paused", "cancelled"],
    }),
    toSubscriptionStatus: text("to_subscription_status", {
      enum: ["beta", "trial", "active", "paused", "cancelled"],
    }),
    actorEmail: text("actor_email").notNull(),
    reasonCode: text("reason_code").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    occurredAt: text("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("membership_events_idempotency_unique").on(table.idempotencyKey),
    index("membership_events_user_time_idx").on(table.userEmail, table.occurredAt),
    index("membership_events_type_time_idx").on(table.eventType, table.occurredAt),
  ],
);

export const userFeatureUsage = sqliteTable(
  "user_feature_usage",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    feature: text("feature", { enum: ["match_analysis"] }).notNull(),
    usageDay: text("usage_day").notNull(),
    resourceId: text("resource_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("user_feature_usage_resource_unique").on(
      table.userEmail,
      table.feature,
      table.usageDay,
      table.resourceId,
    ),
    index("user_feature_usage_daily_idx").on(table.userEmail, table.feature, table.usageDay),
  ],
);

export const betaProgramSettings = sqliteTable("beta_program_settings", {
  id: text("id").primaryKey(),
  capacityLimit: integer("capacity_limit").notNull().default(100),
  invitationsEnabled: integer("invitations_enabled", { mode: "boolean" }).notNull().default(false),
  invitationTtlHours: integer("invitation_ttl_hours").notNull().default(72),
  updatedByEmail: text("updated_by_email"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const betaInvitations = sqliteTable(
  "beta_invitations",
  {
    id: text("id").primaryKey(),
    waitlistEntryId: text("waitlist_entry_id").notNull().references(() => betaWaitlistEntries.id),
    email: text("email").notNull(),
    displayName: text("display_name"),
    locale: text("locale", { enum: ["tr", "en"] }).notNull().default("tr"),
    tokenHash: text("token_hash").notNull(),
    tokenCiphertext: text("token_ciphertext").notNull(),
    tokenIv: text("token_iv").notNull(),
    status: text("status", {
      enum: ["queued", "sent", "accepted", "expired", "revoked", "failed"],
    }).notNull().default("queued"),
    deliveryStatus: text("delivery_status", {
      enum: ["pending", "sent", "failed", "configuration_required"],
    }).notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: text("available_at").notNull(),
    lastAttemptAt: text("last_attempt_at"),
    lastErrorCode: text("last_error_code"),
    expiresAt: text("expires_at").notNull(),
    sentAt: text("sent_at"),
    acceptedAt: text("accepted_at"),
    revokedAt: text("revoked_at"),
    createdByEmail: text("created_by_email").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("beta_invitations_token_hash_unique").on(table.tokenHash),
    uniqueIndex("beta_invitations_idempotency_unique").on(table.idempotencyKey),
    index("beta_invitations_status_available_idx").on(table.status, table.availableAt),
    index("beta_invitations_email_status_idx").on(table.email, table.status),
    index("beta_invitations_expiry_idx").on(table.expiresAt),
  ],
);

export const publicRateLimitBuckets = sqliteTable(
  "public_rate_limit_buckets",
  {
    id: text("id").primaryKey(),
    scope: text("scope", { enum: ["global", "email", "network"] }).notNull(),
    windowStartedAt: text("window_started_at").notNull(),
    hitCount: integer("hit_count").notNull().default(1),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("public_rate_limit_scope_window_idx").on(table.scope, table.windowStartedAt),
    index("public_rate_limit_expiry_idx").on(table.expiresAt),
  ],
);

export const betaOperationRuns = sqliteTable(
  "beta_operation_runs",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger", { enum: ["admin", "scheduler"] }).notNull(),
    status: text("status", { enum: ["processing", "completed", "failed"] }).notNull(),
    actorEmail: text("actor_email"),
    resultJson: text("result_json").notNull().default("{}"),
    errorCode: text("error_code"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("beta_operation_runs_status_time_idx").on(table.status, table.startedAt),
  ],
);

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

export const researchSourceRuns = sqliteTable(
  "research_source_runs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => dataSources.id),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id),
    adapterVersion: text("adapter_version").notNull(),
    leagueCode: text("league_code").notNull(),
    leagueId: text("league_id").notNull(),
    seasonCode: text("season_code").notNull(),
    seasonLabel: text("season_label").notNull(),
    upstreamUrl: text("upstream_url").notNull(),
    status: text("status", {
      enum: ["fetching", "imported", "unchanged", "failed"],
    }).notNull().default("fetching"),
    httpStatus: integer("http_status"),
    responseContentType: text("response_content_type"),
    upstreamEtag: text("upstream_etag"),
    upstreamLastModified: text("upstream_last_modified"),
    rawSnapshotKey: text("raw_snapshot_key"),
    rawChecksumSha256: text("raw_checksum_sha256"),
    contentBytes: integer("content_bytes").notNull().default(0),
    sourceRowCount: integer("source_row_count").notNull().default(0),
    importedStatRowCount: integer("imported_stat_row_count").notNull().default(0),
    ignoredOddsColumnCount: integer("ignored_odds_column_count").notNull().default(0),
    revisionVerified: integer("revision_verified", { mode: "boolean" }).notNull().default(false),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    requestedByEmail: text("requested_by_email").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("research_source_runs_league_season_time_idx").on(table.leagueCode, table.seasonCode, table.startedAt),
    index("research_source_runs_status_time_idx").on(table.status, table.startedAt),
    index("research_source_runs_checksum_idx").on(table.rawChecksumSha256),
  ],
);

export const researchFixtureFeedRuns = sqliteTable(
  "research_fixture_feed_runs",
  {
    id: text("id").primaryKey(),
    activeKey: text("active_key"),
    adapterVersion: text("adapter_version").notNull(),
    upstreamUrl: text("upstream_url").notNull(),
    status: text("status", {
      enum: ["fetching", "imported", "unchanged", "failed"],
    }).notNull().default("fetching"),
    httpStatus: integer("http_status"),
    responseContentType: text("response_content_type"),
    upstreamEtag: text("upstream_etag"),
    upstreamLastModified: text("upstream_last_modified"),
    rawSnapshotKey: text("raw_snapshot_key"),
    rawChecksumSha256: text("raw_checksum_sha256"),
    contentBytes: integer("content_bytes").notNull().default(0),
    sourceRowCount: integer("source_row_count").notNull().default(0),
    pilotRowCount: integer("pilot_row_count").notNull().default(0),
    leagueCount: integer("league_count").notNull().default(0),
    oddsSnapshotCount: integer("odds_snapshot_count").notNull().default(0),
    providerSummaryJson: text("provider_summary_json").notNull().default("{}"),
    ingestionRunIdsJson: text("ingestion_run_ids_json").notNull().default("[]"),
    requestedByEmail: text("requested_by_email").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("research_fixture_feed_runs_active_key_unique").on(table.activeKey),
    index("research_fixture_feed_runs_status_time_idx").on(table.status, table.startedAt),
    index("research_fixture_feed_runs_checksum_idx").on(table.rawChecksumSha256),
  ],
);

export const researchAutomationRuns = sqliteTable(
  "research_automation_runs",
  {
    id: text("id").primaryKey(),
    activeKey: text("active_key"),
    jobKind: text("job_kind", {
      enum: ["forward_shadow", "historical_validation"],
    }).notNull().default("forward_shadow"),
    trigger: text("trigger", { enum: ["admin", "scheduler"] }).notNull(),
    status: text("status", { enum: ["running", "completed", "partial", "failed"] }).notNull().default("running"),
    fixtureFeedRunId: text("fixture_feed_run_id").references(() => researchFixtureFeedRuns.id),
    liveLeagueCode: text("live_league_code"),
    liveResultStatus: text("live_result_status"),
    historicalCampaignId: text("historical_campaign_id"),
    historicalLeagueCode: text("historical_league_code"),
    historicalStage: text("historical_stage"),
    candidateCount: integer("candidate_count").notNull().default(0),
    predictionsCreated: integer("predictions_created").notNull().default(0),
    predictionsReused: integer("predictions_reused").notNull().default(0),
    predictionsFailed: integer("predictions_failed").notNull().default(0),
    observationsCaptured: integer("observations_captured").notNull().default(0),
    observationsSettled: integer("observations_settled").notNull().default(0),
    observationsPending: integer("observations_pending").notNull().default(0),
    summaryJson: text("summary_json").notNull().default("{}"),
    actorEmail: text("actor_email").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("research_automation_runs_active_key_unique").on(table.activeKey),
    index("research_automation_runs_status_time_idx").on(table.status, table.startedAt),
    index("research_automation_runs_trigger_time_idx").on(table.trigger, table.startedAt),
    index("research_automation_runs_job_time_idx").on(table.jobKind, table.startedAt),
    index("research_automation_runs_historical_league_time_idx").on(table.historicalLeagueCode, table.startedAt),
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

export const fixtureContextSnapshots = sqliteTable(
  "fixture_context_snapshots",
  {
    id: text("id").primaryKey(),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    capturedAt: text("captured_at").notNull(),
    sourceKind: text("source_kind", {
      enum: ["manual", "public_dataset", "licensed_feed"],
    }).notNull().default("manual"),
    completeness: real("completeness").notNull(),
    homeContextJson: text("home_context_json").notNull(),
    awayContextJson: text("away_context_json").notNull(),
    matchContextJson: text("match_context_json").notNull(),
    snapshotFingerprint: text("snapshot_fingerprint").notNull(),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("fixture_context_snapshots_fingerprint_unique").on(table.snapshotFingerprint),
    index("fixture_context_snapshots_fixture_time_idx").on(table.fixtureId, table.capturedAt),
    index("fixture_context_snapshots_source_idx").on(table.sourceKind, table.capturedAt),
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

export const validationCampaigns = sqliteTable(
  "validation_campaigns",
  {
    id: text("id").primaryKey(),
    activeKey: text("active_key"),
    leagueId: text("league_id").notNull().references(() => leagues.id),
    leagueCode: text("league_code").notNull(),
    leagueLabel: text("league_label").notNull(),
    market: text("market", { enum: ["1X2"] }).notNull().default("1X2"),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed"],
    }).notNull().default("queued"),
    currentStage: text("current_stage", {
      enum: ["source", "dataset", "benchmarks", "evidence", "shadow", "done"],
    }).notNull().default("source"),
    sourceFingerprint: text("source_fingerprint"),
    sourceStateJson: text("source_state_json").notNull().default("{}"),
    datasetRunId: text("dataset_run_id").references(() => featureDatasetRuns.id),
    evidenceRunId: text("evidence_run_id").references(() => modelEvidenceRuns.id),
    selectedBacktestRunId: text("selected_backtest_run_id").references(() => backtestRuns.id),
    selectedModelCode: text("selected_model_code"),
    stageSummaryJson: text("stage_summary_json").notNull().default("{}"),
    blockersJson: text("blockers_json").notNull().default("[]"),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    recommendationEligible: integer("recommendation_eligible", { mode: "boolean" }).notNull().default(false),
    createdByEmail: text("created_by_email").notNull(),
    lastAdvancedByEmail: text("last_advanced_by_email").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("validation_campaigns_active_key_unique").on(table.activeKey),
    index("validation_campaigns_league_time_idx").on(table.leagueId, table.startedAt),
    index("validation_campaigns_status_stage_idx").on(table.status, table.currentStage),
    index("validation_campaigns_source_fingerprint_idx").on(table.leagueId, table.sourceFingerprint),
  ],
);

export const shadowValidationRuns = sqliteTable(
  "shadow_validation_runs",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").notNull().references(() => validationCampaigns.id),
    datasetRunId: text("dataset_run_id").notNull().references(() => featureDatasetRuns.id),
    backtestRunId: text("backtest_run_id").notNull().references(() => backtestRuns.id),
    evidenceRunId: text("evidence_run_id").references(() => modelEvidenceRuns.id),
    leagueId: text("league_id").notNull().references(() => leagues.id),
    leagueLabel: text("league_label").notNull(),
    market: text("market", { enum: ["1X2"] }).notNull().default("1X2"),
    modelCode: text("model_code").notNull(),
    status: text("status", {
      enum: ["invalid", "insufficient", "stable", "unstable"],
    }).notNull(),
    releaseEligibility: text("release_eligibility", {
      enum: ["blocked", "forward_shadow_candidate"],
    }).notNull().default("blocked"),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    forwardObserved: integer("forward_observed", { mode: "boolean" }).notNull().default(false),
    sampleCount: integer("sample_count").notNull(),
    leakageViolationCount: integer("leakage_violation_count").notNull().default(0),
    averageDataCompleteness: real("average_data_completeness").notNull().default(0),
    earlyWindowJson: text("early_window_json").notNull(),
    lateWindowJson: text("late_window_json").notNull(),
    driftJson: text("drift_json").notNull(),
    thresholdsJson: text("thresholds_json").notNull(),
    blockersJson: text("blockers_json").notNull().default("[]"),
    resultChecksumSha256: text("result_checksum_sha256").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("shadow_validation_runs_campaign_unique").on(table.campaignId),
    uniqueIndex("shadow_validation_runs_checksum_unique").on(table.resultChecksumSha256),
    index("shadow_validation_runs_league_market_idx").on(table.leagueId, table.market, table.createdAt),
    index("shadow_validation_runs_status_idx").on(table.status, table.createdAt),
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
    baseProbabilityHome: real("base_probability_home"),
    baseProbabilityDraw: real("base_probability_draw"),
    baseProbabilityAway: real("base_probability_away"),
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
    contextSnapshotId: text("context_snapshot_id").references(() => fixtureContextSnapshots.id),
    contextEngineSchemaVersion: text("context_engine_schema_version"),
    contextFingerprint: text("context_fingerprint"),
    contextCompleteness: real("context_completeness"),
    contextUncertaintyShrink: real("context_uncertainty_shrink"),
    contextDirectionalLogit: real("context_directional_logit"),
    contextEligible: integer("context_eligible", { mode: "boolean" }).notNull().default(false),
    contextBlockerCodesJson: text("context_blocker_codes_json").notNull().default("[]"),
    contextJson: text("context_json").notNull().default("null"),
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

export const predictionLineageRecords = sqliteTable(
  "prediction_lineage_records",
  {
    id: text("id").primaryKey(),
    predictionVersionId: text("prediction_version_id").notNull().references(() => predictionVersions.id),
    threadId: text("thread_id").notNull().references(() => predictionThreads.id),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    schemaVersion: text("schema_version").notNull(),
    featureFingerprint: text("feature_fingerprint").notNull(),
    featureCutoffAt: text("feature_cutoff_at").notNull(),
    modelVersionId: text("model_version_id").references(() => modelVersions.id),
    manifestJson: text("manifest_json").notNull(),
    manifestChecksumSha256: text("manifest_checksum_sha256").notNull(),
    blockerCodesJson: text("blocker_codes_json").notNull().default("[]"),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    recommendationEligible: integer("recommendation_eligible", { mode: "boolean" }).notNull().default(false),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("prediction_lineage_records_version_unique").on(table.predictionVersionId),
    uniqueIndex("prediction_lineage_records_checksum_unique").on(table.manifestChecksumSha256),
    index("prediction_lineage_records_thread_idx").on(table.threadId, table.createdAt),
    index("prediction_lineage_records_fixture_idx").on(table.fixtureId, table.createdAt),
    index("prediction_lineage_records_model_idx").on(table.modelVersionId),
  ],
);

export const leagueOnboardingAssessments = sqliteTable(
  "league_onboarding_assessments",
  {
    id: text("id").primaryKey(),
    leagueId: text("league_id").notNull().references(() => leagues.id),
    sourceId: text("source_id").notNull().references(() => dataSources.id),
    schemaVersion: text("schema_version").notNull(),
    evidenceFingerprintSha256: text("evidence_fingerprint_sha256").notNull(),
    score: integer("score").notNull(),
    grade: text("grade", { enum: ["A", "B", "C", "D"] }).notNull(),
    state: text("state", { enum: ["blocked", "review", "ready_for_research"] }).notNull(),
    licenseScore: integer("license_score").notNull(),
    historyDepthScore: integer("history_depth_score").notNull(),
    identityMappingScore: integer("identity_mapping_score").notNull(),
    advancedDataScore: integer("advanced_data_score").notNull(),
    lineupCoverageScore: integer("lineup_coverage_score").notNull(),
    oddsTimestampScore: integer("odds_timestamp_score").notNull(),
    sourceSlaScore: integer("source_sla_score").notNull(),
    blockerCount: integer("blocker_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    blockerCodesJson: text("blocker_codes_json").notNull().default("[]"),
    warningCodesJson: text("warning_codes_json").notNull().default("[]"),
    manifestJson: text("manifest_json").notNull(),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    recommendationEligible: integer("recommendation_eligible", { mode: "boolean" }).notNull().default(false),
    evaluatedByEmail: text("evaluated_by_email").notNull(),
    evaluatedAt: text("evaluated_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("league_onboarding_assessments_evidence_unique").on(table.evidenceFingerprintSha256),
    index("league_onboarding_assessments_league_time_idx").on(table.leagueId, table.evaluatedAt),
    index("league_onboarding_assessments_source_time_idx").on(table.sourceId, table.evaluatedAt),
    index("league_onboarding_assessments_state_score_idx").on(table.state, table.score),
  ],
);

export const forwardShadowObservations = sqliteTable(
  "forward_shadow_observations",
  {
    id: text("id").primaryKey(),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    predictionThreadId: text("prediction_thread_id").notNull().references(() => predictionThreads.id),
    predictionVersionId: text("prediction_version_id").notNull().references(() => predictionVersions.id),
    leagueId: text("league_id").notNull().references(() => leagues.id),
    leagueLabel: text("league_label").notNull(),
    market: text("market", { enum: ["1X2"] }).notNull().default("1X2"),
    modelCode: text("model_code").notNull(),
    modelVersionId: text("model_version_id").references(() => modelVersions.id),
    status: text("status", { enum: ["pending", "settled", "void", "invalid"] }).notNull().default("pending"),
    observedAt: text("observed_at").notNull(),
    predictionAt: text("prediction_at").notNull(),
    kickoffAt: text("kickoff_at").notNull(),
    featureCutoffAt: text("feature_cutoff_at").notNull(),
    probabilityHome: real("probability_home").notNull(),
    probabilityDraw: real("probability_draw").notNull(),
    probabilityAway: real("probability_away").notNull(),
    predictedOutcome: text("predicted_outcome", { enum: ["1", "X", "2"] }).notNull(),
    confidence: real("confidence").notNull(),
    dataCompleteness: real("data_completeness").notNull(),
    featureFingerprint: text("feature_fingerprint").notNull(),
    versionFingerprint: text("version_fingerprint").notNull(),
    oddsJson: text("odds_json").notNull().default("null"),
    actualOutcome: text("actual_outcome", { enum: ["1", "X", "2"] }),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    resultKnownAt: text("result_known_at"),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    createdByEmail: text("created_by_email").notNull(),
    settledAt: text("settled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("forward_shadow_observations_fixture_unique").on(table.fixtureId),
    uniqueIndex("forward_shadow_observations_version_unique").on(table.predictionVersionId),
    index("forward_shadow_observations_status_kickoff_idx").on(table.status, table.kickoffAt),
    index("forward_shadow_observations_league_settled_idx").on(table.leagueId, table.settledAt),
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

export const userPredictionWatchlist = sqliteTable(
  "user_prediction_watchlist",
  {
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    threadId: text("thread_id").notNull().references(() => predictionThreads.id),
    source: text("source", { enum: ["manual", "system"] }).notNull().default("manual"),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userEmail, table.threadId] }),
    index("user_prediction_watchlist_thread_idx").on(table.threadId),
    index("user_prediction_watchlist_created_idx").on(table.userEmail, table.createdAt),
  ],
);

export const predictionValueAssessments = sqliteTable(
  "prediction_value_assessments",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull().references(() => predictionThreads.id),
    predictionVersionId: text("prediction_version_id").notNull().references(() => predictionVersions.id),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    engineSchemaVersion: text("engine_schema_version").notNull(),
    market: text("market", { enum: ["1X2"] }).notNull().default("1X2"),
    predictedOutcome: text("predicted_outcome", { enum: ["1", "X", "2"] }).notNull(),
    status: text("status", {
      enum: [
        "unavailable",
        "insufficient_market",
        "stale_market",
        "market_anomaly",
        "no_value",
        "low_odds_value",
        "value",
      ],
    }).notNull(),
    recommendationEligible: integer("recommendation_eligible", { mode: "boolean" }).notNull().default(false),
    modelProbability: real("model_probability").notNull(),
    fairMarketProbability: real("fair_market_probability"),
    fairProbabilityHome: real("fair_probability_home"),
    fairProbabilityDraw: real("fair_probability_draw"),
    fairProbabilityAway: real("fair_probability_away"),
    edge: real("edge"),
    expectedValue: real("expected_value"),
    bestDecimalOdds: real("best_decimal_odds"),
    bestBookmaker: text("best_bookmaker"),
    bookmakerCount: integer("bookmaker_count").notNull().default(0),
    latestCapturedAt: text("latest_captured_at"),
    snapshotAgeMinutes: real("snapshot_age_minutes"),
    averageOverround: real("average_overround"),
    fairProbabilityDispersion: real("fair_probability_dispersion"),
    maximumRelativeOddsMove: real("maximum_relative_odds_move"),
    maximumFairProbabilityMove: real("maximum_fair_probability_move"),
    flagCodesJson: text("flag_codes_json").notNull().default("[]"),
    booksJson: text("books_json").notNull().default("[]"),
    evidenceJson: text("evidence_json").notNull(),
    assessmentFingerprint: text("assessment_fingerprint").notNull(),
    assessedAt: text("assessed_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("prediction_value_assessments_version_unique").on(table.predictionVersionId),
    uniqueIndex("prediction_value_assessments_fingerprint_unique").on(table.assessmentFingerprint),
    index("prediction_value_assessments_thread_idx").on(table.threadId, table.assessedAt),
    index("prediction_value_assessments_fixture_idx").on(table.fixtureId, table.assessedAt),
    index("prediction_value_assessments_status_idx").on(table.status, table.recommendationEligible),
  ],
);

export const userBankrollAccounts = sqliteTable(
  "user_bankroll_accounts",
  {
    userEmail: text("user_email").primaryKey().references(() => userProfiles.email),
    currency: text("currency", { enum: ["TRY", "USD", "EUR", "GBP"] }).notNull().default("TRY"),
    initialized: integer("initialized", { mode: "boolean" }).notNull().default(false),
    currentBalance: real("current_balance").notNull().default(0),
    currentOpenExposure: real("current_open_exposure").notNull().default(0),
    totalDeposited: real("total_deposited").notNull().default(0),
    totalWithdrawn: real("total_withdrawn").notNull().default(0),
    totalStaked: real("total_staked").notNull().default(0),
    totalReturned: real("total_returned").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("user_bankroll_accounts_updated_idx").on(table.updatedAt)],
);

export const userCoupons = sqliteTable(
  "user_coupons",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    tier: text("tier", { enum: ["custom", "balanced", "high_odds"] }).notNull(),
    status: text("status", { enum: ["draft", "placed", "settled", "cancelled"] }).notNull().default("draft"),
    legCount: integer("leg_count").notNull(),
    combinedOdds: real("combined_odds").notNull(),
    combinedProbability: real("combined_probability").notNull(),
    expectedReturnMultiple: real("expected_return_multiple").notNull(),
    correlationGuardJson: text("correlation_guard_json").notNull(),
    stakeRecommendationJson: text("stake_recommendation_json").notNull().default("null"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("user_coupons_user_status_idx").on(table.userEmail, table.status),
    index("user_coupons_created_idx").on(table.userEmail, table.createdAt),
  ],
);

export const userCouponSelections = sqliteTable(
  "user_coupon_selections",
  {
    couponId: text("coupon_id").notNull().references(() => userCoupons.id),
    valueAssessmentId: text("value_assessment_id").notNull().references(() => predictionValueAssessments.id),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    selection: text("selection", { enum: ["1", "X", "2"] }).notNull(),
    decimalOddsSnapshot: real("decimal_odds_snapshot").notNull(),
    modelProbabilitySnapshot: real("model_probability_snapshot").notNull(),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.couponId, table.valueAssessmentId] }),
    uniqueIndex("user_coupon_selections_position_unique").on(table.couponId, table.position),
    index("user_coupon_selections_fixture_idx").on(table.fixtureId),
  ],
);

export const userBetRecords = sqliteTable(
  "user_bet_records",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    kind: text("kind", { enum: ["single", "coupon"] }).notNull(),
    valueAssessmentId: text("value_assessment_id").references(() => predictionValueAssessments.id),
    couponId: text("coupon_id").references(() => userCoupons.id),
    status: text("status", { enum: ["pending", "won", "lost", "void", "cancelled"] }).notNull().default("pending"),
    currency: text("currency", { enum: ["TRY", "USD", "EUR", "GBP"] }).notNull(),
    decimalOddsSnapshot: real("decimal_odds_snapshot").notNull(),
    modelProbabilitySnapshot: real("model_probability_snapshot").notNull(),
    stakeAmount: real("stake_amount").notNull(),
    potentialReturn: real("potential_return").notNull(),
    payoutAmount: real("payout_amount"),
    engineEvidenceJson: text("engine_evidence_json").notNull(),
    placedAt: text("placed_at").notNull(),
    settledAt: text("settled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("user_bet_records_user_status_idx").on(table.userEmail, table.status),
    index("user_bet_records_placed_idx").on(table.userEmail, table.placedAt),
  ],
);

export const userBankrollEntries = sqliteTable(
  "user_bankroll_entries",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    entryType: text("entry_type", {
      enum: ["opening", "deposit", "withdrawal", "stake", "payout", "refund", "adjustment"],
    }).notNull(),
    amountSigned: real("amount_signed").notNull(),
    balanceAfter: real("balance_after").notNull(),
    betRecordId: text("bet_record_id").references(() => userBetRecords.id),
    couponId: text("coupon_id").references(() => userCoupons.id),
    idempotencyKey: text("idempotency_key").notNull(),
    note: text("note"),
    occurredAt: text("occurred_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("user_bankroll_entries_idempotency_unique").on(table.idempotencyKey),
    index("user_bankroll_entries_user_time_idx").on(table.userEmail, table.occurredAt),
    index("user_bankroll_entries_bet_idx").on(table.betRecordId),
  ],
);

export const predictionSettlements = sqliteTable(
  "prediction_settlements",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull().references(() => predictionThreads.id),
    finalVersionId: text("final_version_id").notNull().references(() => predictionVersions.id),
    publicationEventId: text("publication_event_id").notNull().references(() => predictionEvents.id),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    predictedOutcome: text("predicted_outcome", { enum: ["1", "X", "2"] }).notNull(),
    actualOutcome: text("actual_outcome", { enum: ["1", "X", "2", "void"] }).notNull(),
    settlementStatus: text("settlement_status", {
      enum: ["won", "lost", "void", "withdrawn"],
    }).notNull(),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    withdrawalEventId: text("withdrawal_event_id").references(() => predictionEvents.id),
    settledAt: text("settled_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("prediction_settlements_version_unique").on(table.finalVersionId),
    uniqueIndex("prediction_settlements_publication_unique").on(table.publicationEventId),
    index("prediction_settlements_thread_idx").on(table.threadId, table.settledAt),
    index("prediction_settlements_fixture_idx").on(table.fixtureId),
    index("prediction_settlements_status_idx").on(table.settlementStatus, table.settledAt),
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

export const modelVersionCards = sqliteTable(
  "model_version_cards",
  {
    id: text("id").primaryKey(),
    modelVersionId: text("model_version_id").notNull().references(() => modelVersions.id),
    schemaVersion: text("schema_version").notNull(),
    evidenceFingerprintSha256: text("evidence_fingerprint_sha256").notNull(),
    cardStatus: text("card_status", { enum: ["blocked", "documented"] }).notNull().default("blocked"),
    datasetRunId: text("dataset_run_id").references(() => featureDatasetRuns.id),
    backtestRunId: text("backtest_run_id").references(() => backtestRuns.id),
    evidenceRunId: text("evidence_run_id").references(() => modelEvidenceRuns.id),
    releaseGateId: text("release_gate_id").references(() => releaseGates.id),
    blockerCount: integer("blocker_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    blockerCodesJson: text("blocker_codes_json").notNull().default("[]"),
    warningCodesJson: text("warning_codes_json").notNull().default("[]"),
    manifestJson: text("manifest_json").notNull(),
    researchOnly: integer("research_only", { mode: "boolean" }).notNull().default(true),
    recommendationEligible: integer("recommendation_eligible", { mode: "boolean" }).notNull().default(false),
    generatedByEmail: text("generated_by_email").notNull(),
    evidenceAsOf: text("evidence_as_of").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("model_version_cards_evidence_unique").on(table.evidenceFingerprintSha256),
    index("model_version_cards_version_time_idx").on(table.modelVersionId, table.createdAt),
    index("model_version_cards_status_time_idx").on(table.cardStatus, table.createdAt),
    index("model_version_cards_backtest_idx").on(table.backtestRunId),
  ],
);

export const userNotificationPreferences = sqliteTable("user_notification_preferences", {
  userEmail: text("user_email").primaryKey().references(() => userProfiles.email),
  finalAnalysisEnabled: integer("final_analysis_enabled", { mode: "boolean" }).notNull().default(true),
  valueOpportunityEnabled: integer("value_opportunity_enabled", { mode: "boolean" }).notNull().default(true),
  predictionWithdrawnEnabled: integer("prediction_withdrawn_enabled", { mode: "boolean" }).notNull().default(true),
  inAppEnabled: integer("in_app_enabled", { mode: "boolean" }).notNull().default(true),
  browserPushEnabled: integer("browser_push_enabled", { mode: "boolean" }).notNull().default(false),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const browserPushSubscriptions = sqliteTable(
  "browser_push_subscriptions",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    endpoint: text("endpoint").notNull(),
    endpointHash: text("endpoint_hash").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
    userAgent: text("user_agent"),
    failureCount: integer("failure_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("browser_push_subscriptions_endpoint_unique").on(table.endpointHash),
    index("browser_push_subscriptions_user_status_idx").on(table.userEmail, table.status),
  ],
);

export const telegramConnections = sqliteTable(
  "telegram_connections",
  {
    userEmail: text("user_email").primaryKey().references(() => userProfiles.email),
    status: text("status", { enum: ["disconnected", "pending", "connected", "revoked"] }).notNull().default("disconnected"),
    pairingCodeHash: text("pairing_code_hash"),
    pairingExpiresAt: text("pairing_expires_at"),
    chatId: text("chat_id"),
    chatUsername: text("chat_username"),
    verifiedAt: text("verified_at"),
    lastErrorCode: text("last_error_code"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("telegram_connections_pairing_hash_unique").on(table.pairingCodeHash),
    index("telegram_connections_status_idx").on(table.status, table.updatedAt),
  ],
);

export const notificationOutbox = sqliteTable(
  "notification_outbox",
  {
    id: text("id").primaryKey(),
    eventKey: text("event_key").notNull(),
    sourceEventId: text("source_event_id").notNull().references(() => predictionEvents.id),
    threadId: text("thread_id").notNull().references(() => predictionThreads.id),
    versionId: text("version_id").references(() => predictionVersions.id),
    fixtureId: text("fixture_id").notNull().references(() => fixtures.id),
    engineSchemaVersion: text("engine_schema_version").notNull(),
    eventType: text("event_type", {
      enum: ["final_analysis", "value_opportunity", "prediction_withdrawn"],
    }).notNull(),
    audienceScope: text("audience_scope", { enum: ["watchers", "all_members"] }).notNull(),
    priority: text("priority", { enum: ["normal", "high", "critical"] }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "delivered", "partial", "failed", "suppressed"],
    }).notNull().default("pending"),
    suppressionCode: text("suppression_code"),
    targetUserCount: integer("target_user_count").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: text("available_at").notNull(),
    lastAttemptAt: text("last_attempt_at"),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("notification_outbox_event_key_unique").on(table.eventKey),
    index("notification_outbox_status_available_idx").on(table.status, table.availableAt),
    index("notification_outbox_source_event_idx").on(table.sourceEventId),
    index("notification_outbox_thread_idx").on(table.threadId, table.createdAt),
  ],
);

export const userNotifications = sqliteTable(
  "user_notifications",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    outboxId: text("outbox_id").notNull().references(() => notificationOutbox.id),
    eventType: text("event_type", {
      enum: ["final_analysis", "value_opportunity", "prediction_withdrawn"],
    }).notNull(),
    priority: text("priority", { enum: ["normal", "high", "critical"] }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href").notNull(),
    readAt: text("read_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("user_notifications_outbox_user_unique").on(table.outboxId, table.userEmail),
    index("user_notifications_user_time_idx").on(table.userEmail, table.createdAt),
    index("user_notifications_user_read_idx").on(table.userEmail, table.readAt),
  ],
);

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    outboxId: text("outbox_id").notNull().references(() => notificationOutbox.id),
    userEmail: text("user_email").notNull().references(() => userProfiles.email),
    channel: text("channel", { enum: ["in_app", "browser_push", "telegram"] }).notNull(),
    status: text("status", {
      enum: ["pending", "delivered", "failed", "skipped", "configuration_required"],
    }).notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    providerMessageId: text("provider_message_id"),
    lastErrorCode: text("last_error_code"),
    nextAttemptAt: text("next_attempt_at"),
    sentAt: text("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("notification_deliveries_outbox_user_channel_unique").on(table.outboxId, table.userEmail, table.channel),
    index("notification_deliveries_status_retry_idx").on(table.status, table.nextAttemptAt),
    index("notification_deliveries_user_idx").on(table.userEmail, table.createdAt),
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
