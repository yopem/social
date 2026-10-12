CREATE TABLE `app_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`access_hash` text NOT NULL,
	`refresh_hash` text NOT NULL,
	`access_expires_at` integer NOT NULL,
	`refresh_expires_at` integer NOT NULL,
	`rotation_started_at` integer,
	`prior_access_hash` text,
	`prior_refresh_hash` text,
	`prior_expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_sessions_access_hash_unique` ON `app_sessions` (`access_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_sessions_refresh_hash_unique` ON `app_sessions` (`refresh_hash`);--> statement-breakpoint
CREATE INDEX `app_sessions_user` ON `app_sessions` (`user_id`);--> statement-breakpoint
ALTER TABLE `social_inbox` ADD `completed_at` text;