CREATE TABLE `league_onboarding_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`source_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`evidence_fingerprint_sha256` text NOT NULL,
	`score` integer NOT NULL,
	`grade` text NOT NULL,
	`state` text NOT NULL,
	`license_score` integer NOT NULL,
	`history_depth_score` integer NOT NULL,
	`identity_mapping_score` integer NOT NULL,
	`advanced_data_score` integer NOT NULL,
	`lineup_coverage_score` integer NOT NULL,
	`odds_timestamp_score` integer NOT NULL,
	`source_sla_score` integer NOT NULL,
	`blocker_count` integer DEFAULT 0 NOT NULL,
	`warning_count` integer DEFAULT 0 NOT NULL,
	`blocker_codes_json` text DEFAULT '[]' NOT NULL,
	`warning_codes_json` text DEFAULT '[]' NOT NULL,
	`manifest_json` text NOT NULL,
	`research_only` integer DEFAULT true NOT NULL,
	`recommendation_eligible` integer DEFAULT false NOT NULL,
	`evaluated_by_email` text NOT NULL,
	`evaluated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `league_onboarding_assessments_evidence_unique` ON `league_onboarding_assessments` (`evidence_fingerprint_sha256`);--> statement-breakpoint
CREATE INDEX `league_onboarding_assessments_league_time_idx` ON `league_onboarding_assessments` (`league_id`,`evaluated_at`);--> statement-breakpoint
CREATE INDEX `league_onboarding_assessments_source_time_idx` ON `league_onboarding_assessments` (`source_id`,`evaluated_at`);--> statement-breakpoint
CREATE INDEX `league_onboarding_assessments_state_score_idx` ON `league_onboarding_assessments` (`state`,`score`);