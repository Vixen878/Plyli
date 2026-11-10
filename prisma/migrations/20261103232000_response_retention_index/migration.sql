-- Additive index only. Preserve declared casing for Linux MySQL portability.
CREATE INDEX `Submission_workspaceId_deletedAt_submittedAt_idx` ON `Submission`(`workspaceId`, `deletedAt`, `submittedAt`);
