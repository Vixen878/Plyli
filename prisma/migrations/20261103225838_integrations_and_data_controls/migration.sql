-- AlterTable
ALTER TABLE `ApiCredential` ADD COLUMN `formIds` JSON NULL;

-- AlterTable
ALTER TABLE `Form` ADD COLUMN `integrationPolicy` JSON NULL;

-- AlterTable
ALTER TABLE `Submission` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `purgedAt` DATETIME(3) NULL,
    MODIFY `record` JSON NULL;

-- AlterTable
ALTER TABLE `Workspace` ADD COLUMN `responseRetentionDays` INTEGER NULL,
    ADD COLUMN `trashRetentionDays` INTEGER NOT NULL DEFAULT 7;
