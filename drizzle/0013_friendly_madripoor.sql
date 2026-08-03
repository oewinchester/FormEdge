CREATE TABLE `beta_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`waitlist_entry_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`locale` text DEFAULT 'tr' NOT NULL,
	`token_hash` text NOT NULL,
	`token_ciphertext` text NOT NULL,
	`token_iv` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`delivery_status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`last_attempt_at` text,
	`last_error_code` text,
	`expires_at` text NOT NULL,
	`sent_at` text,
	`accepted_at` text,
	`revoked_at` text,
	`created_by_email` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`waitlist_entry_id`) REFERENCES `beta_waitlist_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beta_invitations_token_hash_unique` ON `beta_invitations` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `beta_invitations_idempotency_unique` ON `beta_invitations` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `beta_invitations_status_available_idx` ON `beta_invitations` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `beta_invitations_email_status_idx` ON `beta_invitations` (`email`,`status`);--> statement-breakpoint
CREATE INDEX `beta_invitations_expiry_idx` ON `beta_invitations` (`expires_at`);--> statement-breakpoint
CREATE TABLE `beta_operation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`actor_email` text,
	`result_json` text DEFAULT '{}' NOT NULL,
	`error_code` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `beta_operation_runs_status_time_idx` ON `beta_operation_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `beta_program_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`capacity_limit` integer DEFAULT 100 NOT NULL,
	`invitations_enabled` integer DEFAULT false NOT NULL,
	`invitation_ttl_hours` integer DEFAULT 72 NOT NULL,
	`updated_by_email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `public_rate_limit_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`window_started_at` text NOT NULL,
	`hit_count` integer DEFAULT 1 NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `public_rate_limit_scope_window_idx` ON `public_rate_limit_buckets` (`scope`,`window_started_at`);--> statement-breakpoint
CREATE INDEX `public_rate_limit_expiry_idx` ON `public_rate_limit_buckets` (`expires_at`);