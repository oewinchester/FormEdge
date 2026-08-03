CREATE TABLE `beta_waitlist_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`locale` text DEFAULT 'tr' NOT NULL,
	`country_code` text NOT NULL,
	`status` text DEFAULT 'waitlisted' NOT NULL,
	`source` text DEFAULT 'landing' NOT NULL,
	`age_confirmed` integer NOT NULL,
	`responsible_use_confirmed` integer NOT NULL,
	`privacy_acknowledged` integer NOT NULL,
	`terms_revision` text NOT NULL,
	`invited_at` text,
	`accepted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beta_waitlist_entries_email_unique` ON `beta_waitlist_entries` (`email`);--> statement-breakpoint
CREATE INDEX `beta_waitlist_entries_status_time_idx` ON `beta_waitlist_entries` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `membership_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`event_type` text NOT NULL,
	`from_plan` text,
	`to_plan` text,
	`from_subscription_status` text,
	`to_subscription_status` text,
	`actor_email` text NOT NULL,
	`reason_code` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_events_idempotency_unique` ON `membership_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `membership_events_user_time_idx` ON `membership_events` (`user_email`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `membership_events_type_time_idx` ON `membership_events` (`event_type`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `user_risk_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`schema_version` text NOT NULL,
	`answers_json` text NOT NULL,
	`score` integer NOT NULL,
	`raw_profile` text NOT NULL,
	`result_profile` text NOT NULL,
	`safety_override` integer DEFAULT false NOT NULL,
	`safety_flags_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `user_profiles`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_risk_assessments_user_time_idx` ON `user_risk_assessments` (`user_email`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_risk_assessments_result_idx` ON `user_risk_assessments` (`result_profile`,`safety_override`);--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `beta_access_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `onboarding_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `country_code` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `age_eligibility_acknowledged_at` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `terms_accepted_at` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `terms_revision` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `onboarding_completed_at` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `trial_started_at` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `trial_ends_at` text;--> statement-breakpoint
CREATE INDEX `user_profiles_beta_access_idx` ON `user_profiles` (`beta_access_status`,`onboarding_status`);