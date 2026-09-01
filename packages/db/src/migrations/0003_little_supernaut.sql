PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_provider_run` (
	`comparisonRunId` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`transcript` text,
	`latencyMs` integer,
	`error` text,
	PRIMARY KEY(`comparisonRunId`, `provider`),
	FOREIGN KEY (`comparisonRunId`) REFERENCES `comparison_run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_provider_run`("comparisonRunId", "provider", "status", "transcript", "latencyMs", "error") SELECT "comparisonRunId", "provider", "status", "transcript", "latencyMs", "error" FROM `provider_run`;--> statement-breakpoint
DROP TABLE `provider_run`;--> statement-breakpoint
ALTER TABLE `__new_provider_run` RENAME TO `provider_run`;--> statement-breakpoint
PRAGMA foreign_keys=ON;