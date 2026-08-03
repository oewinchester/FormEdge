CREATE TABLE `user_feature_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`feature` text NOT NULL,
	`usage_day` text NOT NULL,
	`resource_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_feature_usage_resource_unique` ON `user_feature_usage` (`user_email`,`feature`,`usage_day`,`resource_id`);--> statement-breakpoint
CREATE INDEX `user_feature_usage_daily_idx` ON `user_feature_usage` (`user_email`,`feature`,`usage_day`);