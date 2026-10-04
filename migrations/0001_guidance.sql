CREATE TABLE `guidance` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`filename` text NOT NULL,
	`format` text NOT NULL,
	`object_key` text,
	`content` text NOT NULL,
	`sections` text NOT NULL,
	`status` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE TABLE `rate_windows` (
	`user_id` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);

CREATE TABLE `coach_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE INDEX `idx_coach_sessions_user_document` ON `coach_sessions` (`user_id`,`document_id`);