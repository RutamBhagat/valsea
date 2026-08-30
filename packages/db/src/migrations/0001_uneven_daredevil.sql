CREATE TABLE `benchmark_run` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`resultJson` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
