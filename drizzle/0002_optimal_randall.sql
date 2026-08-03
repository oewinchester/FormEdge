CREATE TABLE `backtest_predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`backtest_run_id` text NOT NULL,
	`fixture_key` text NOT NULL,
	`prediction_at` text NOT NULL,
	`kickoff_at` text NOT NULL,
	`result_known_at` text,
	`feature_cutoff_at` text NOT NULL,
	`feature_fingerprint` text NOT NULL,
	`data_completeness` real NOT NULL,
	`actual_outcome` text NOT NULL,
	`predicted_outcome` text NOT NULL,
	`probability_home` real NOT NULL,
	`probability_draw` real NOT NULL,
	`probability_away` real NOT NULL,
	`odds_captured_at` text,
	`odds_home` real,
	`odds_draw` real,
	`odds_away` real,
	`closing_home` real,
	`closing_draw` real,
	`closing_away` real,
	`selected_outcome` text,
	`selected_probability` real,
	`decimal_odds` real,
	`closing_odds` real,
	`edge` real,
	`stake_units` real DEFAULT 0 NOT NULL,
	`pnl_units` real DEFAULT 0 NOT NULL,
	`clv` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backtest_predictions_run_fixture_unique` ON `backtest_predictions` (`backtest_run_id`,`fixture_key`);--> statement-breakpoint
CREATE INDEX `backtest_predictions_run_idx` ON `backtest_predictions` (`backtest_run_id`);--> statement-breakpoint
CREATE INDEX `backtest_predictions_kickoff_idx` ON `backtest_predictions` (`kickoff_at`);--> statement-breakpoint
CREATE TABLE `backtest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`model_version_id` text NOT NULL,
	`name` text NOT NULL,
	`dataset_kind` text NOT NULL,
	`dataset_checksum_sha256` text NOT NULL,
	`league_id` text,
	`league_label` text NOT NULL,
	`market` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`evaluation_mode` text DEFAULT 'walk_forward' NOT NULL,
	`source_sample_count` integer DEFAULT 0 NOT NULL,
	`sample_count` integer DEFAULT 0 NOT NULL,
	`fold_count` integer DEFAULT 0 NOT NULL,
	`leakage_violation_count` integer DEFAULT 0 NOT NULL,
	`data_completeness` real DEFAULT 0 NOT NULL,
	`accuracy` real,
	`log_loss` real,
	`brier_score` real,
	`ece` real,
	`calibration_slope` real,
	`calibration_intercept` real,
	`benchmark_log_loss` real,
	`benchmark_brier_score` real,
	`recommendation_count` integer DEFAULT 0 NOT NULL,
	`net_units` real,
	`yield` real,
	`profit_factor` real,
	`average_clv` real,
	`max_drawdown_units` real,
	`max_losing_streak` integer,
	`release_stage` text DEFAULT 'research' NOT NULL,
	`config_json` text NOT NULL,
	`metrics_json` text,
	`error_message` text,
	`created_by_email` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`model_version_id`) REFERENCES `model_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `backtest_runs_model_idx` ON `backtest_runs` (`model_version_id`);--> statement-breakpoint
CREATE INDEX `backtest_runs_league_market_idx` ON `backtest_runs` (`league_id`,`market`);--> statement-breakpoint
CREATE INDEX `backtest_runs_status_idx` ON `backtest_runs` (`status`);--> statement-breakpoint
CREATE INDEX `backtest_runs_started_at_idx` ON `backtest_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `model_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`display_name` text NOT NULL,
	`family` text NOT NULL,
	`target_market` text NOT NULL,
	`status` text DEFAULT 'research' NOT NULL,
	`description` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_definitions_code_unique` ON `model_definitions` (`code`);--> statement-breakpoint
CREATE INDEX `model_definitions_market_idx` ON `model_definitions` (`target_market`);--> statement-breakpoint
CREATE INDEX `model_definitions_status_idx` ON `model_definitions` (`status`);--> statement-breakpoint
CREATE TABLE `model_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`model_definition_id` text NOT NULL,
	`version_label` text NOT NULL,
	`feature_schema_version` text NOT NULL,
	`config_json` text NOT NULL,
	`config_checksum_sha256` text NOT NULL,
	`training_cutoff_at` text,
	`status` text DEFAULT 'candidate' NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`model_definition_id`) REFERENCES `model_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_versions_definition_label_unique` ON `model_versions` (`model_definition_id`,`version_label`);--> statement-breakpoint
CREATE INDEX `model_versions_status_idx` ON `model_versions` (`status`);--> statement-breakpoint
CREATE TABLE `release_gates` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text,
	`league_label` text NOT NULL,
	`market` text NOT NULL,
	`stage` text DEFAULT 'research' NOT NULL,
	`active_model_version_id` text,
	`last_backtest_run_id` text,
	`minimum_effective_sample` integer DEFAULT 400 NOT NULL,
	`maximum_ece` real DEFAULT 0.08 NOT NULL,
	`required_data_completeness` real DEFAULT 0.9 NOT NULL,
	`automated_recommendation_allowed` integer DEFAULT false NOT NULL,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`decided_by_email` text NOT NULL,
	`decided_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`active_model_version_id`) REFERENCES `model_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_backtest_run_id`) REFERENCES `backtest_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_gates_league_market_unique` ON `release_gates` (`league_label`,`market`);--> statement-breakpoint
CREATE INDEX `release_gates_stage_idx` ON `release_gates` (`stage`);