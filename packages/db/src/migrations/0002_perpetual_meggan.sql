ALTER TABLE `benchmark_run` ADD `userId` text REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `benchmark_run_user_id_idx` ON `benchmark_run` (`userId`);--> statement-breakpoint
ALTER TABLE `comparison_run` ADD `userId` text REFERENCES user(id);--> statement-breakpoint
CREATE INDEX `comparison_run_user_id_idx` ON `comparison_run` (`userId`);