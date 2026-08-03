ALTER TABLE `backtest_runs` ADD `feature_dataset_run_id` text REFERENCES feature_dataset_runs(id);--> statement-breakpoint
CREATE INDEX `backtest_runs_dataset_idx` ON `backtest_runs` (`feature_dataset_run_id`);--> statement-breakpoint
ALTER TABLE `feature_dataset_runs` ADD `benchmark_schema_version` text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE `feature_dataset_samples` ADD `benchmark_json` text DEFAULT '{}' NOT NULL;