CREATE TABLE `prediction_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`final_version_id` text NOT NULL,
	`publication_event_id` text NOT NULL,
	`fixture_id` text NOT NULL,
	`predicted_outcome` text NOT NULL,
	`actual_outcome` text NOT NULL,
	`settlement_status` text NOT NULL,
	`home_score` integer,
	`away_score` integer,
	`withdrawal_event_id` text,
	`settled_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `prediction_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`final_version_id`) REFERENCES `prediction_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`publication_event_id`) REFERENCES `prediction_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`withdrawal_event_id`) REFERENCES `prediction_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_settlements_version_unique` ON `prediction_settlements` (`final_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_settlements_publication_unique` ON `prediction_settlements` (`publication_event_id`);--> statement-breakpoint
CREATE INDEX `prediction_settlements_thread_idx` ON `prediction_settlements` (`thread_id`,`settled_at`);--> statement-breakpoint
CREATE INDEX `prediction_settlements_fixture_idx` ON `prediction_settlements` (`fixture_id`);--> statement-breakpoint
CREATE INDEX `prediction_settlements_status_idx` ON `prediction_settlements` (`settlement_status`,`settled_at`);--> statement-breakpoint
CREATE TABLE `user_dashboard_preferences` (
	`user_email` text PRIMARY KEY NOT NULL,
	`default_analysis_view` text DEFAULT 'quick' NOT NULL,
	`performance_mode` text DEFAULT 'system' NOT NULL,
	`timezone` text DEFAULT 'Europe/Istanbul' NOT NULL,
	`odds_format` text DEFAULT 'decimal' NOT NULL,
	`show_withdrawn` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_prediction_watchlist` (
	`user_email` text NOT NULL,
	`thread_id` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_email`, `thread_id`),
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `prediction_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_prediction_watchlist_thread_idx` ON `user_prediction_watchlist` (`thread_id`);--> statement-breakpoint
CREATE INDEX `user_prediction_watchlist_created_idx` ON `user_prediction_watchlist` (`user_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`locale` text DEFAULT 'tr' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`subscription_status` text DEFAULT 'beta' NOT NULL,
	`risk_profile` text,
	`risk_assessment_status` text DEFAULT 'pending' NOT NULL,
	`responsible_use_acknowledged_at` text,
	`last_seen_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_profiles_plan_idx` ON `user_profiles` (`plan`,`subscription_status`);--> statement-breakpoint
CREATE INDEX `user_profiles_last_seen_idx` ON `user_profiles` (`last_seen_at`);