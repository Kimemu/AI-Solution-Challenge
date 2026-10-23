CREATE TABLE IF NOT EXISTS `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`entity_id` text,
	`detail` text NOT NULL,
	`actor` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `refresh_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`added` integer DEFAULT 0 NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`data` text NOT NULL,
	`collected_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `signals_url_unique` ON `signals` (`url`);
