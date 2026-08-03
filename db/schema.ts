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
    recordCount: integer("record_count").notNull().default(0),
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
