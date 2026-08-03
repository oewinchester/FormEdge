CREATE TABLE `fixture_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_fixture_key` text NOT NULL,
	`fixture_id` text NOT NULL,
	`home_team_id` text NOT NULL,
	`away_team_id` text NOT NULL,
	`source_kickoff_at` text NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`created_by_run_id` text,
	`reviewed_by_email` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fixture_mappings_source_key_unique` ON `fixture_mappings` (`source_id`,`external_fixture_key`);--> statement-breakpoint
CREATE INDEX `fixture_mappings_fixture_idx` ON `fixture_mappings` (`fixture_id`);--> statement-breakpoint
CREATE INDEX `fixture_mappings_status_idx` ON `fixture_mappings` (`status`);--> statement-breakpoint
CREATE TABLE `ingestion_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`ingestion_run_id` text NOT NULL,
	`severity` text NOT NULL,
	`code` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_key` text,
	`field` text,
	`message` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ingestion_issues_run_idx` ON `ingestion_issues` (`ingestion_run_id`);--> statement-breakpoint
CREATE INDEX `ingestion_issues_severity_idx` ON `ingestion_issues` (`severity`);--> statement-breakpoint
CREATE INDEX `ingestion_issues_code_idx` ON `ingestion_issues` (`code`);--> statement-breakpoint
CREATE TABLE `team_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_team_key` text NOT NULL,
	`external_team_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`team_id` text NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`created_by_run_id` text,
	`reviewed_by_email` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_aliases_source_key_unique` ON `team_aliases` (`source_id`,`external_team_key`);--> statement-breakpoint
CREATE INDEX `team_aliases_team_idx` ON `team_aliases` (`team_id`);--> statement-breakpoint
CREATE INDEX `team_aliases_status_idx` ON `team_aliases` (`status`);--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `import_format` text DEFAULT 'json' NOT NULL;--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `data_grade` text DEFAULT 'D' NOT NULL;--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `quality_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `completeness_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `consistency_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `freshness_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `warning_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `error_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ingestion_runs` ADD `recommendation_eligible` integer DEFAULT false NOT NULL;