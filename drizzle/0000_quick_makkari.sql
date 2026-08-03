CREATE TABLE `app_members` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`role` text DEFAULT 'editor' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_seen_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actor_email`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text,
	`acquisition_method` text NOT NULL,
	`legal_status` text DEFAULT 'review' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_sources_name_unique` ON `data_sources` (`name`);--> statement-breakpoint
CREATE INDEX `data_sources_legal_status_idx` ON `data_sources` (`legal_status`);--> statement-breakpoint
CREATE TABLE `fixtures` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`season` text NOT NULL,
	`kickoff_at` text NOT NULL,
	`home_team_id` text NOT NULL,
	`away_team_id` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`home_score` integer,
	`away_score` integer,
	`source_id` text NOT NULL,
	`ingestion_run_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fixtures_league_kickoff_idx` ON `fixtures` (`league_id`,`kickoff_at`);--> statement-breakpoint
CREATE INDEX `fixtures_home_team_idx` ON `fixtures` (`home_team_id`);--> statement-breakpoint
CREATE INDEX `fixtures_away_team_idx` ON `fixtures` (`away_team_id`);--> statement-breakpoint
CREATE TABLE `ingestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`captured_at` text NOT NULL,
	`snapshot_key` text NOT NULL,
	`checksum_sha256` text NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`created_by_email` text NOT NULL,
	`error_message` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ingestion_runs_source_idx` ON `ingestion_runs` (`source_id`);--> statement-breakpoint
CREATE INDEX `ingestion_runs_status_idx` ON `ingestion_runs` (`status`);--> statement-breakpoint
CREATE INDEX `ingestion_runs_captured_at_idx` ON `ingestion_runs` (`captured_at`);--> statement-breakpoint
CREATE TABLE `leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`country_code` text NOT NULL,
	`name` text NOT NULL,
	`tier` integer,
	`coverage_level` text DEFAULT 'basic' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lineup_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`fixture_id` text NOT NULL,
	`team_id` text NOT NULL,
	`status` text NOT NULL,
	`players_json` text NOT NULL,
	`unavailable_players_json` text DEFAULT '[]' NOT NULL,
	`captured_at` text NOT NULL,
	`ingestion_run_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lineups_fixture_team_idx` ON `lineup_snapshots` (`fixture_id`,`team_id`);--> statement-breakpoint
CREATE INDEX `lineups_captured_at_idx` ON `lineup_snapshots` (`captured_at`);--> statement-breakpoint
CREATE TABLE `odds_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`fixture_id` text NOT NULL,
	`bookmaker` text NOT NULL,
	`market` text NOT NULL,
	`selection` text NOT NULL,
	`line` real,
	`decimal_odds` real NOT NULL,
	`captured_at` text NOT NULL,
	`ingestion_run_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `odds_fixture_market_idx` ON `odds_snapshots` (`fixture_id`,`market`);--> statement-breakpoint
CREATE INDEX `odds_captured_at_idx` ON `odds_snapshots` (`captured_at`);--> statement-breakpoint
CREATE TABLE `team_match_stats` (
	`fixture_id` text NOT NULL,
	`team_id` text NOT NULL,
	`possession` real,
	`shots` integer,
	`shots_on_target` integer,
	`expected_goals` real,
	`dangerous_attacks` integer,
	`penalty_area_entries` integer,
	`ppda` real,
	`big_chances_allowed` integer,
	`ingestion_run_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`fixture_id`, `team_id`),
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `team_match_stats_team_idx` ON `team_match_stats` (`team_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`country_code` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `teams_country_idx` ON `teams` (`country_code`);