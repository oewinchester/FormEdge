ALTER TABLE `research_automation_runs` ADD `job_kind` text DEFAULT 'forward_shadow' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_automation_runs` ADD `historical_campaign_id` text;--> statement-breakpoint
ALTER TABLE `research_automation_runs` ADD `historical_league_code` text;--> statement-breakpoint
ALTER TABLE `research_automation_runs` ADD `historical_stage` text;--> statement-breakpoint
CREATE INDEX `research_automation_runs_job_time_idx` ON `research_automation_runs` (`job_kind`,`started_at`);--> statement-breakpoint
CREATE INDEX `research_automation_runs_historical_league_time_idx` ON `research_automation_runs` (`historical_league_code`,`started_at`);