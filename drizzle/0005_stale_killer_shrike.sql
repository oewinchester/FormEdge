CREATE TABLE `model_evidence_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset_run_id` text NOT NULL,
	`dataset_checksum_sha256` text NOT NULL,
	`league_id` text NOT NULL,
	`league_label` text NOT NULL,
	`market` text DEFAULT '1X2' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`evidence_schema_version` text NOT NULL,
	`config_json` text NOT NULL,
	`config_checksum_sha256` text NOT NULL,
	`research_only` integer DEFAULT true NOT NULL,
	`development_count` integer DEFAULT 0 NOT NULL,
	`calibration_count` integer DEFAULT 0 NOT NULL,
	`holdout_count` integer DEFAULT 0 NOT NULL,
	`holdout_start_at` text,
	`holdout_end_at` text,
	`selected_form_variant` text,
	`reported_leader_model_code` text,
	`evidence_status` text DEFAULT 'blocked' NOT NULL,
	`partition_json` text DEFAULT '{}' NOT NULL,
	`ablation_json` text DEFAULT '{}' NOT NULL,
	`models_json` text DEFAULT '[]' NOT NULL,
	`created_by_email` text NOT NULL,
	`error_message` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`dataset_run_id`) REFERENCES `feature_dataset_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`league_id`) REFERENCES `leagues`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_evidence_runs_dataset_unique` ON `model_evidence_runs` (`dataset_run_id`);--> statement-breakpoint
CREATE INDEX `model_evidence_runs_league_market_idx` ON `model_evidence_runs` (`league_id`,`market`);--> statement-breakpoint
CREATE INDEX `model_evidence_runs_status_idx` ON `model_evidence_runs` (`status`);--> statement-breakpoint
ALTER TABLE `feature_dataset_runs` ADD `ablation_schema_version` text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE `feature_dataset_samples` ADD `ablation_json` text DEFAULT '{}' NOT NULL;