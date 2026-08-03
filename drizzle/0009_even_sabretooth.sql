CREATE TABLE `fixture_context_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`fixture_id` text NOT NULL,
	`captured_at` text NOT NULL,
	`source_kind` text DEFAULT 'manual' NOT NULL,
	`completeness` real NOT NULL,
	`home_context_json` text NOT NULL,
	`away_context_json` text NOT NULL,
	`match_context_json` text NOT NULL,
	`snapshot_fingerprint` text NOT NULL,
	`ingestion_run_id` text,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fixture_context_snapshots_fingerprint_unique` ON `fixture_context_snapshots` (`snapshot_fingerprint`);--> statement-breakpoint
CREATE INDEX `fixture_context_snapshots_fixture_time_idx` ON `fixture_context_snapshots` (`fixture_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `fixture_context_snapshots_source_idx` ON `fixture_context_snapshots` (`source_kind`,`captured_at`);--> statement-breakpoint
CREATE TABLE `user_bankroll_accounts` (
	`user_email` text PRIMARY KEY NOT NULL,
	`currency` text DEFAULT 'TRY' NOT NULL,
	`initialized` integer DEFAULT false NOT NULL,
	`current_balance` real DEFAULT 0 NOT NULL,
	`current_open_exposure` real DEFAULT 0 NOT NULL,
	`total_deposited` real DEFAULT 0 NOT NULL,
	`total_withdrawn` real DEFAULT 0 NOT NULL,
	`total_staked` real DEFAULT 0 NOT NULL,
	`total_returned` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_bankroll_accounts_updated_idx` ON `user_bankroll_accounts` (`updated_at`);--> statement-breakpoint
CREATE TABLE `user_bankroll_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`entry_type` text NOT NULL,
	`amount_signed` real NOT NULL,
	`balance_after` real NOT NULL,
	`bet_record_id` text,
	`coupon_id` text,
	`idempotency_key` text NOT NULL,
	`note` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bet_record_id`) REFERENCES `user_bet_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coupon_id`) REFERENCES `user_coupons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_bankroll_entries_idempotency_unique` ON `user_bankroll_entries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `user_bankroll_entries_user_time_idx` ON `user_bankroll_entries` (`user_email`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `user_bankroll_entries_bet_idx` ON `user_bankroll_entries` (`bet_record_id`);--> statement-breakpoint
CREATE TABLE `user_bet_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`kind` text NOT NULL,
	`value_assessment_id` text,
	`coupon_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`currency` text NOT NULL,
	`decimal_odds_snapshot` real NOT NULL,
	`model_probability_snapshot` real NOT NULL,
	`stake_amount` real NOT NULL,
	`potential_return` real NOT NULL,
	`payout_amount` real,
	`engine_evidence_json` text NOT NULL,
	`placed_at` text NOT NULL,
	`settled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`value_assessment_id`) REFERENCES `prediction_value_assessments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coupon_id`) REFERENCES `user_coupons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_bet_records_user_status_idx` ON `user_bet_records` (`user_email`,`status`);--> statement-breakpoint
CREATE INDEX `user_bet_records_placed_idx` ON `user_bet_records` (`user_email`,`placed_at`);--> statement-breakpoint
CREATE TABLE `user_coupon_selections` (
	`coupon_id` text NOT NULL,
	`value_assessment_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`selection` text NOT NULL,
	`decimal_odds_snapshot` real NOT NULL,
	`model_probability_snapshot` real NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`coupon_id`, `value_assessment_id`),
	FOREIGN KEY (`coupon_id`) REFERENCES `user_coupons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`value_assessment_id`) REFERENCES `prediction_value_assessments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_coupon_selections_position_unique` ON `user_coupon_selections` (`coupon_id`,`position`);--> statement-breakpoint
CREATE INDEX `user_coupon_selections_fixture_idx` ON `user_coupon_selections` (`fixture_id`);--> statement-breakpoint
CREATE TABLE `user_coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`tier` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`leg_count` integer NOT NULL,
	`combined_odds` real NOT NULL,
	`combined_probability` real NOT NULL,
	`expected_return_multiple` real NOT NULL,
	`correlation_guard_json` text NOT NULL,
	`stake_recommendation_json` text DEFAULT 'null' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_coupons_user_status_idx` ON `user_coupons` (`user_email`,`status`);--> statement-breakpoint
CREATE INDEX `user_coupons_created_idx` ON `user_coupons` (`user_email`,`created_at`);--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `base_probability_home` real;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `base_probability_draw` real;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `base_probability_away` real;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `context_snapshot_id` text REFERENCES fixture_context_snapshots(id);--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `context_engine_schema_version` text;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `context_fingerprint` text;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `context_completeness` real;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `context_uncertainty_shrink` real;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `context_directional_logit` real;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `context_eligible` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `context_blocker_codes_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `prediction_versions` ADD `context_json` text DEFAULT 'null' NOT NULL;