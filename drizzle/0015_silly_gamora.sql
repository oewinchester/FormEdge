CREATE TABLE `shadow_validation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`dataset_run_id` text NOT NULL,
	`backtest_run_id` text NOT NULL,
	`evidence_run_id` text,
	`league_id` text NOT NULL,
	`league_label` text NOT NULL,
	`market` text DEFAULT '1X2' NOT NULL,
	`model_code` text NOT NULL,
	`status` text NOT NULL,
	`release_eligibility` text DEFAULT 'blocked' NOT NULL,
	`research_only` integer DEFAULT true NOT NULL,
	`forward_observed` integer DEFAULT false NOT NULL,
	`sample_count` integer NOT NULL,
	`leakage_violation_count` integer DEFAULT 0 NOT NULL,
	`average_data_completeness` real DEFAULT 0 NOT NULL,
	`early_window_json` text NOT NULL,
	`late_window_json` text NOT NULL,
	`drift_json` text NOT NULL,
	`thresholds_json` text NOT NULL,
	`blockers_json` text DEFAULT '[]' NOT NULL,
	`result_checksum_sha256` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `validation_campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dataset_run_id`) REFERENCES `feature_dataset_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_run_id`) REFERENCES `model_evidence_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shadow_validation_runs_campaign_unique` ON `shadow_validation_runs` (`campaign_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shadow_validation_runs_checksum_unique` ON `shadow_validation_runs` (`result_checksum_sha256`);--> statement-breakpoint
CREATE INDEX `shadow_validation_runs_league_market_idx` ON `shadow_validation_runs` (`league_id`,`market`,`created_at`);--> statement-breakpoint
CREATE INDEX `shadow_validation_runs_status_idx` ON `shadow_validation_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `validation_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`active_key` text,
	`league_id` text NOT NULL,
	`league_code` text NOT NULL,
	`league_label` text NOT NULL,
	`market` text DEFAULT '1X2' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`current_stage` text DEFAULT 'source' NOT NULL,
	`source_fingerprint` text,
	`source_state_json` text DEFAULT '{}' NOT NULL,
	`dataset_run_id` text,
	`evidence_run_id` text,
	`selected_backtest_run_id` text,
	`selected_model_code` text,
	`stage_summary_json` text DEFAULT '{}' NOT NULL,
	`blockers_json` text DEFAULT '[]' NOT NULL,
	`research_only` integer DEFAULT true NOT NULL,
	`recommendation_eligible` integer DEFAULT false NOT NULL,
	`created_by_email` text NOT NULL,
	`last_advanced_by_email` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dataset_run_id`) REFERENCES `feature_dataset_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_run_id`) REFERENCES `model_evidence_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_backtest_run_id`) REFERENCES `backtest_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `validation_campaigns_active_key_unique` ON `validation_campaigns` (`active_key`);--> statement-breakpoint
CREATE INDEX `validation_campaigns_league_time_idx` ON `validation_campaigns` (`league_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `validation_campaigns_status_stage_idx` ON `validation_campaigns` (`status`,`current_stage`);--> statement-breakpoint
CREATE INDEX `validation_campaigns_source_fingerprint_idx` ON `validation_campaigns` (`league_id`,`source_fingerprint`);