CREATE TABLE `prediction_events` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`version_id` text,
	`event_type` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason_text` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_email` text,
	`idempotency_key` text NOT NULL,
	`immediate_notification` integer DEFAULT false NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `prediction_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `prediction_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_events_thread_sequence_unique` ON `prediction_events` (`thread_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_events_idempotency_unique` ON `prediction_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `prediction_events_thread_time_idx` ON `prediction_events` (`thread_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `prediction_events_type_idx` ON `prediction_events` (`event_type`);--> statement-breakpoint
CREATE TABLE `prediction_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`fixture_id` text NOT NULL,
	`league_id` text NOT NULL,
	`league_label` text NOT NULL,
	`market` text DEFAULT '1X2' NOT NULL,
	`status` text DEFAULT 'watchlist' NOT NULL,
	`current_version_id` text,
	`final_version_id` text,
	`version_count` integer DEFAULT 0 NOT NULL,
	`event_count` integer DEFAULT 0 NOT NULL,
	`research_only` integer DEFAULT true NOT NULL,
	`recommendation_eligible` integer DEFAULT false NOT NULL,
	`created_by_email` text NOT NULL,
	`last_transition_by_email` text,
	`last_transition_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_threads_fixture_market_unique` ON `prediction_threads` (`fixture_id`,`market`);--> statement-breakpoint
CREATE INDEX `prediction_threads_league_market_idx` ON `prediction_threads` (`league_id`,`market`);--> statement-breakpoint
CREATE INDEX `prediction_threads_status_idx` ON `prediction_threads` (`status`);--> statement-breakpoint
CREATE INDEX `prediction_threads_updated_idx` ON `prediction_threads` (`updated_at`);--> statement-breakpoint
CREATE TABLE `prediction_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`lifecycle_schema_version` text NOT NULL,
	`trigger` text NOT NULL,
	`model_code` text NOT NULL,
	`model_version_id` text,
	`prediction_at` text NOT NULL,
	`kickoff_at` text NOT NULL,
	`feature_cutoff_at` text NOT NULL,
	`feature_fingerprint` text NOT NULL,
	`version_fingerprint` text NOT NULL,
	`supersedes_version_id` text,
	`probability_home` real NOT NULL,
	`probability_draw` real NOT NULL,
	`probability_away` real NOT NULL,
	`predicted_outcome` text NOT NULL,
	`recommendation_outcome` text,
	`confidence` real NOT NULL,
	`data_completeness` real NOT NULL,
	`lineup_state` text DEFAULT 'none' NOT NULL,
	`lineup_fingerprint` text,
	`lineup_snapshot_ids_json` text DEFAULT '[]' NOT NULL,
	`release_gate_allowed` integer DEFAULT false NOT NULL,
	`research_only` integer DEFAULT true NOT NULL,
	`recommendation_eligible` integer DEFAULT false NOT NULL,
	`blocker_codes_json` text DEFAULT '[]' NOT NULL,
	`odds_json` text DEFAULT 'null' NOT NULL,
	`payload_json` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `prediction_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_version_id`) REFERENCES `model_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_versions_thread_number_unique` ON `prediction_versions` (`thread_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_versions_thread_fingerprint_unique` ON `prediction_versions` (`thread_id`,`version_fingerprint`);--> statement-breakpoint
CREATE INDEX `prediction_versions_fixture_idx` ON `prediction_versions` (`fixture_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `prediction_versions_model_idx` ON `prediction_versions` (`model_version_id`);