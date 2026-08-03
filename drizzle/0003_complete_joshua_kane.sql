CREATE TABLE `feature_dataset_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`league_id` text NOT NULL,
	`league_label` text NOT NULL,
	`market` text DEFAULT '1X2' NOT NULL,
	`status` text DEFAULT 'building' NOT NULL,
	`prediction_horizon_hours` integer NOT NULL,
	`minimum_history_matches` integer NOT NULL,
	`result_availability_hours` integer NOT NULL,
	`stats_availability_policy` text DEFAULT 'fixture_end_plus_buffer' NOT NULL,
	`source_fixture_count` integer DEFAULT 0 NOT NULL,
	`eligible_sample_count` integer DEFAULT 0 NOT NULL,
	`rejected_sample_count` integer DEFAULT 0 NOT NULL,
	`average_data_completeness` real DEFAULT 0 NOT NULL,
	`odds_coverage` real DEFAULT 0 NOT NULL,
	`feature_schema_version` text NOT NULL,
	`builder_version` text NOT NULL,
	`config_json` text NOT NULL,
	`dataset_checksum_sha256` text NOT NULL,
	`audit_json` text DEFAULT '{}' NOT NULL,
	`created_by_email` text NOT NULL,
	`error_message` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_dataset_runs_checksum_unique` ON `feature_dataset_runs` (`dataset_checksum_sha256`);--> statement-breakpoint
CREATE INDEX `feature_dataset_runs_league_idx` ON `feature_dataset_runs` (`league_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `feature_dataset_runs_status_idx` ON `feature_dataset_runs` (`status`);--> statement-breakpoint
CREATE TABLE `feature_dataset_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset_run_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`prediction_at` text NOT NULL,
	`kickoff_at` text NOT NULL,
	`feature_cutoff_at` text NOT NULL,
	`result_known_at` text NOT NULL,
	`actual_outcome` text NOT NULL,
	`probability_home` real NOT NULL,
	`probability_draw` real NOT NULL,
	`probability_away` real NOT NULL,
	`data_completeness` real NOT NULL,
	`feature_fingerprint` text NOT NULL,
	`odds_bookmaker` text,
	`odds_captured_at` text,
	`odds_home` real,
	`odds_draw` real,
	`odds_away` real,
	`closing_odds_captured_at` text,
	`closing_home` real,
	`closing_draw` real,
	`closing_away` real,
	`feature_json` text NOT NULL,
	`sample_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`dataset_run_id`) REFERENCES `feature_dataset_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_dataset_samples_run_fixture_unique` ON `feature_dataset_samples` (`dataset_run_id`,`fixture_id`);--> statement-breakpoint
CREATE INDEX `feature_dataset_samples_run_idx` ON `feature_dataset_samples` (`dataset_run_id`);--> statement-breakpoint
CREATE INDEX `feature_dataset_samples_kickoff_idx` ON `feature_dataset_samples` (`kickoff_at`);