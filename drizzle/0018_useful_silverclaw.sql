CREATE TABLE `prediction_lineage_records` (
	`id` text PRIMARY KEY NOT NULL,
	`prediction_version_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`feature_fingerprint` text NOT NULL,
	`feature_cutoff_at` text NOT NULL,
	`model_version_id` text,
	`manifest_json` text NOT NULL,
	`manifest_checksum_sha256` text NOT NULL,
	`blocker_codes_json` text DEFAULT '[]' NOT NULL,
	`research_only` integer DEFAULT true NOT NULL,
	`recommendation_eligible` integer DEFAULT false NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`prediction_version_id`) REFERENCES `prediction_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `prediction_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_version_id`) REFERENCES `model_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_lineage_records_version_unique` ON `prediction_lineage_records` (`prediction_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_lineage_records_checksum_unique` ON `prediction_lineage_records` (`manifest_checksum_sha256`);--> statement-breakpoint
CREATE INDEX `prediction_lineage_records_thread_idx` ON `prediction_lineage_records` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `prediction_lineage_records_fixture_idx` ON `prediction_lineage_records` (`fixture_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `prediction_lineage_records_model_idx` ON `prediction_lineage_records` (`model_version_id`);