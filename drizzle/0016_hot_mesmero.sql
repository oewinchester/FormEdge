CREATE TABLE `forward_shadow_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`fixture_id` text NOT NULL,
	`prediction_thread_id` text NOT NULL,
	`prediction_version_id` text NOT NULL,
	`league_id` text NOT NULL,
	`league_label` text NOT NULL,
	`market` text DEFAULT '1X2' NOT NULL,
	`model_code` text NOT NULL,
	`model_version_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`observed_at` text NOT NULL,
	`prediction_at` text NOT NULL,
	`kickoff_at` text NOT NULL,
	`feature_cutoff_at` text NOT NULL,
	`probability_home` real NOT NULL,
	`probability_draw` real NOT NULL,
	`probability_away` real NOT NULL,
	`predicted_outcome` text NOT NULL,
	`confidence` real NOT NULL,
	`data_completeness` real NOT NULL,
	`feature_fingerprint` text NOT NULL,
	`version_fingerprint` text NOT NULL,
	`odds_json` text DEFAULT 'null' NOT NULL,
	`actual_outcome` text,
	`home_score` integer,
	`away_score` integer,
	`result_known_at` text,
	`research_only` integer DEFAULT true NOT NULL,
	`created_by_email` text NOT NULL,
	`settled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prediction_thread_id`) REFERENCES `prediction_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prediction_version_id`) REFERENCES `prediction_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_version_id`) REFERENCES `model_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forward_shadow_observations_fixture_unique` ON `forward_shadow_observations` (`fixture_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forward_shadow_observations_version_unique` ON `forward_shadow_observations` (`prediction_version_id`);--> statement-breakpoint
CREATE INDEX `forward_shadow_observations_status_kickoff_idx` ON `forward_shadow_observations` (`status`,`kickoff_at`);--> statement-breakpoint
CREATE INDEX `forward_shadow_observations_league_settled_idx` ON `forward_shadow_observations` (`league_id`,`settled_at`);--> statement-breakpoint
CREATE TABLE `research_automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`active_key` text,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`fixture_feed_run_id` text,
	`live_league_code` text,
	`live_result_status` text,
	`candidate_count` integer DEFAULT 0 NOT NULL,
	`predictions_created` integer DEFAULT 0 NOT NULL,
	`predictions_reused` integer DEFAULT 0 NOT NULL,
	`predictions_failed` integer DEFAULT 0 NOT NULL,
	`observations_captured` integer DEFAULT 0 NOT NULL,
	`observations_settled` integer DEFAULT 0 NOT NULL,
	`observations_pending` integer DEFAULT 0 NOT NULL,
	`summary_json` text DEFAULT '{}' NOT NULL,
	`actor_email` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fixture_feed_run_id`) REFERENCES `research_fixture_feed_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_automation_runs_active_key_unique` ON `research_automation_runs` (`active_key`);--> statement-breakpoint
CREATE INDEX `research_automation_runs_status_time_idx` ON `research_automation_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `research_automation_runs_trigger_time_idx` ON `research_automation_runs` (`trigger`,`started_at`);--> statement-breakpoint
CREATE TABLE `research_fixture_feed_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`active_key` text,
	`adapter_version` text NOT NULL,
	`upstream_url` text NOT NULL,
	`status` text DEFAULT 'fetching' NOT NULL,
	`http_status` integer,
	`response_content_type` text,
	`upstream_etag` text,
	`upstream_last_modified` text,
	`raw_snapshot_key` text,
	`raw_checksum_sha256` text,
	`content_bytes` integer DEFAULT 0 NOT NULL,
	`source_row_count` integer DEFAULT 0 NOT NULL,
	`pilot_row_count` integer DEFAULT 0 NOT NULL,
	`league_count` integer DEFAULT 0 NOT NULL,
	`odds_snapshot_count` integer DEFAULT 0 NOT NULL,
	`ingestion_run_ids_json` text DEFAULT '[]' NOT NULL,
	`requested_by_email` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_fixture_feed_runs_active_key_unique` ON `research_fixture_feed_runs` (`active_key`);--> statement-breakpoint
CREATE INDEX `research_fixture_feed_runs_status_time_idx` ON `research_fixture_feed_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `research_fixture_feed_runs_checksum_idx` ON `research_fixture_feed_runs` (`raw_checksum_sha256`);