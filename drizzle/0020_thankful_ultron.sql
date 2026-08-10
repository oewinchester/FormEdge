CREATE TABLE `model_version_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`model_version_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`evidence_fingerprint_sha256` text NOT NULL,
	`card_status` text DEFAULT 'blocked' NOT NULL,
	`dataset_run_id` text,
	`backtest_run_id` text,
	`evidence_run_id` text,
	`release_gate_id` text,
	`blocker_count` integer DEFAULT 0 NOT NULL,
	`warning_count` integer DEFAULT 0 NOT NULL,
	`blocker_codes_json` text DEFAULT '[]' NOT NULL,
	`warning_codes_json` text DEFAULT '[]' NOT NULL,
	`manifest_json` text NOT NULL,
	`research_only` integer DEFAULT true NOT NULL,
	`recommendation_eligible` integer DEFAULT false NOT NULL,
	`generated_by_email` text NOT NULL,
	`evidence_as_of` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`model_version_id`) REFERENCES `model_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dataset_run_id`) REFERENCES `feature_dataset_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evidence_run_id`) REFERENCES `model_evidence_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`release_gate_id`) REFERENCES `release_gates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_version_cards_evidence_unique` ON `model_version_cards` (`evidence_fingerprint_sha256`);--> statement-breakpoint
CREATE INDEX `model_version_cards_version_time_idx` ON `model_version_cards` (`model_version_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `model_version_cards_status_time_idx` ON `model_version_cards` (`card_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `model_version_cards_backtest_idx` ON `model_version_cards` (`backtest_run_id`);