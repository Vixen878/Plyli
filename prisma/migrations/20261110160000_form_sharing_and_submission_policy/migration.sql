ALTER TABLE `Form`
    ADD COLUMN `shareSlug` VARCHAR(64) NULL,
    ADD COLUMN `submissionPolicy` VARCHAR(16) NOT NULL DEFAULT 'one';

CREATE TABLE `FormSlug` (
    `slug` VARCHAR(64) NOT NULL,
    `formId` VARCHAR(191) NOT NULL,
    INDEX `FormSlug_formId_idx`(`formId`),
    PRIMARY KEY (`slug`),
    CONSTRAINT `FormSlug_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `Form`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Submission`
    ADD COLUMN `respondentKey` CHAR(64) NULL,
    ADD UNIQUE INDEX `Submission_workspaceId_formId_respondentKey_key`(`workspaceId`, `formId`, `respondentKey`);
