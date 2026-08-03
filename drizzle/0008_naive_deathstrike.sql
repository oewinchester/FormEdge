CREATE TABLE `prediction_value_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`prediction_version_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`engine_schema_version` text NOT NULL,
	`market` text DEFAULT '1X2' NOT NULL,
	`predicted_outcome` text NOT NULL,
	`status` text NOT NULL,
	`recommendation_eligible` integer DEFAULT false NOT NULL,
	`model_probability` real NOT NULL,
	`fair_market_probability` real,
	`fair_probability_home` real,
	`fair_probability_draw` real,
	`fair_probability_away` real,
	`edge` real,
	`expected_value` real,
	`best_decimal_odds` real,
	`best_bookmaker` text,
	`bookmaker_count` integer DEFAULT 0 NOT NULL,
	`latest_captured_at` text,
	`snapshot_age_minutes` real,
	`average_overround` real,
	`fair_probability_dispersion` real,
	`maximum_relative_odds_move` real,
	`maximum_fair_probability_move` real,
	`flag_codes_json` text DEFAULT '[]' NOT NULL,
	`books_json` text DEFAULT '[]' NOT NULL,
	`evidence_json` text NOT NULL,
	`assessment_fingerprint` text NOT NULL,
	`assessed_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `prediction_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prediction_version_id`) REFERENCES `prediction_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_value_assessments_version_unique` ON `prediction_value_assessments` (`prediction_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_value_assessments_fingerprint_unique` ON `prediction_value_assessments` (`assessment_fingerprint`);--> statement-breakpoint
CREATE INDEX `prediction_value_assessments_thread_idx` ON `prediction_value_assessments` (`thread_id`,`assessed_at`);--> statement-breakpoint
CREATE INDEX `prediction_value_assessments_fixture_idx` ON `prediction_value_assessments` (`fixture_id`,`assessed_at`);--> statement-breakpoint
CREATE INDEX `prediction_value_assessments_status_idx` ON `prediction_value_assessments` (`status`,`recommendation_eligible`);