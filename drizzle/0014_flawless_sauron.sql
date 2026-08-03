CREATE TABLE `research_source_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`ingestion_run_id` text,
	`adapter_version` text NOT NULL,
	`league_code` text NOT NULL,
	`league_id` text NOT NULL,
	`season_code` text NOT NULL,
	`season_label` text NOT NULL,
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
	`imported_stat_row_count` integer DEFAULT 0 NOT NULL,
	`ignored_odds_column_count` integer DEFAULT 0 NOT NULL,
	`revision_verified` integer DEFAULT false NOT NULL,
	`research_only` integer DEFAULT true NOT NULL,
	`error_code` text,
	`error_message` text,
	`requested_by_email` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_source_runs_league_season_time_idx` ON `research_source_runs` (`league_code`,`season_code`,`started_at`);--> statement-breakpoint
CREATE INDEX `research_source_runs_status_time_idx` ON `research_source_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `research_source_runs_checksum_idx` ON `research_source_runs` (`raw_checksum_sha256`);