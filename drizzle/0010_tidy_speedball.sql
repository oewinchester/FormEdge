CREATE TABLE `browser_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`endpoint` text NOT NULL,
	`endpoint_hash` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`user_agent` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_seen_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `browser_push_subscriptions_endpoint_unique` ON `browser_push_subscriptions` (`endpoint_hash`);--> statement-breakpoint
CREATE INDEX `browser_push_subscriptions_user_status_idx` ON `browser_push_subscriptions` (`user_email`,`status`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`outbox_id` text NOT NULL,
	`user_email` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`provider_message_id` text,
	`last_error_code` text,
	`next_attempt_at` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`outbox_id`) REFERENCES `notification_outbox`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_outbox_user_channel_unique` ON `notification_deliveries` (`outbox_id`,`user_email`,`channel`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_status_retry_idx` ON `notification_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `notification_deliveries_user_idx` ON `notification_deliveries` (`user_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`source_event_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`version_id` text,
	`fixture_id` text NOT NULL,
	`engine_schema_version` text NOT NULL,
	`event_type` text NOT NULL,
	`audience_scope` text NOT NULL,
	`priority` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`href` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`suppression_code` text,
	`target_user_count` integer DEFAULT 0 NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`last_attempt_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_event_id`) REFERENCES `prediction_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `prediction_threads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `prediction_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_outbox_event_key_unique` ON `notification_outbox` (`event_key`);--> statement-breakpoint
CREATE INDEX `notification_outbox_status_available_idx` ON `notification_outbox` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `notification_outbox_source_event_idx` ON `notification_outbox` (`source_event_id`);--> statement-breakpoint
CREATE INDEX `notification_outbox_thread_idx` ON `notification_outbox` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `telegram_connections` (
	`user_email` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`pairing_code_hash` text,
	`pairing_expires_at` text,
	`chat_id` text,
	`chat_username` text,
	`verified_at` text,
	`last_error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_connections_pairing_hash_unique` ON `telegram_connections` (`pairing_code_hash`);--> statement-breakpoint
CREATE INDEX `telegram_connections_status_idx` ON `telegram_connections` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `user_notification_preferences` (
	`user_email` text PRIMARY KEY NOT NULL,
	`final_analysis_enabled` integer DEFAULT true NOT NULL,
	`value_opportunity_enabled` integer DEFAULT true NOT NULL,
	`prediction_withdrawn_enabled` integer DEFAULT true NOT NULL,
	`in_app_enabled` integer DEFAULT true NOT NULL,
	`browser_push_enabled` integer DEFAULT false NOT NULL,
	`telegram_enabled` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`outbox_id` text NOT NULL,
	`event_type` text NOT NULL,
	`priority` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`href` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outbox_id`) REFERENCES `notification_outbox`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_notifications_outbox_user_unique` ON `user_notifications` (`outbox_id`,`user_email`);--> statement-breakpoint
CREATE INDEX `user_notifications_user_time_idx` ON `user_notifications` (`user_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_notifications_user_read_idx` ON `user_notifications` (`user_email`,`read_at`);