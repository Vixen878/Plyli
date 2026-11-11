ALTER TABLE `Form`
    ADD COLUMN `responsesClosed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `responsesEndAt` DATETIME(3) NULL,
    ADD COLUMN `closedMessage` VARCHAR(500) NULL,
    ADD COLUMN `submittedMessage` VARCHAR(500) NULL;
